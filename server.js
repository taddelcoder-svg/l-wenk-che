'use strict';
// Löwenküche – Server: liefert das Spiel aus und rechnet Koop-Küchen und Olympia-Gruppen (raeume.js).
// Solo läuft komplett im Browser. Als Disziplin der Olympiade kommt man per Ticket (?olymp=…) herein (olymp.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const zugang = require('./zugang')({ titel:'Löwenküche' });
const olymp = require('./olymp')({ spiel:'loewenkueche' });
const { raeume } = require('./raeume');
const LK = require('./js/logik.js');

const PORT = Number(process.env.PORT) || 10900;

const SEITEN = { '/':'index.html', '/index.html':'index.html' };
const TYPEN = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml'
};

function senden(res, datei, cache) {
  fs.stat(datei, (fehler, info) => {
    if (fehler || !info.isFile()) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type':TYPEN[path.extname(datei)] || 'application/octet-stream', 'Cache-Control':cache, 'X-Content-Type-Options':'nosniff' });
    fs.createReadStream(datei).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (_) { res.writeHead(400); return res.end(); }
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type':'application/json' }); return res.end('{"ok":true}'); }
  if (url.pathname === '/datenschutz' || url.pathname === '/datenschutz.html') return senden(res, path.join(__dirname, 'datenschutz.html'), 'no-cache');
  // Passwort für Familie und Freunde; ein gültiges Olympia-Ticket im Link ersetzt es (zugang.js)
  if (zugang.pruefen(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'Content-Type':'text/plain; charset=utf-8', Allow:'GET, HEAD' }); return res.end('Nicht erlaubt'); }
  if (SEITEN[url.pathname]) return senden(res, path.join(__dirname, SEITEN[url.pathname]), 'no-cache');
  if (url.pathname === '/icon.svg') return senden(res, path.join(__dirname, 'icon.svg'), 'public, max-age=86400');
  const js = /^\/js\/([a-z0-9-]+\.(js|css))$/.exec(url.pathname);
  if (js) return senden(res, path.join(__dirname, 'js', js[1]), 'no-cache');
  // Selbst ausgelieferte Schrift und three.js (keine Verbindung zu Google oder CDNs)
  const statisch = /^\/vendor\/([\w-]+(?:\.[\w-]+)*\.(js|woff2|txt))$/.exec(url.pathname);
  if (statisch) return senden(res, path.join(__dirname, 'vendor', statisch[1]), 'public, max-age=604800');
  res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

/* ---------- Online: Koop-Küchen und Olympia ---------- */
const R = raeume({ olymp:olymp.aktiv ? olymp : null });
function ticketImLink(req) {
  const t = new URL(req.url, 'http://x').searchParams.get('olymp');
  return !!(t && olymp.ticketPruefen(t));
}
const wss = new WebSocketServer({ server, path:'/ws', maxPayload:4096, verifyClient:({ req }) => zugang.hatZugang(req) || ticketImLink(req) });
wss.on('connection', ws => {
  ws.lebt = true;
  ws.on('pong', () => { ws.lebt = true; });
  const v = R.verbinden({ send:t => { if (ws.readyState === 1) ws.send(t); }, close:() => ws.close(4002, 'ersetzt') });
  ws.on('message', roh => v.nachricht(roh.toString()));
  ws.on('close', () => v.getrennt());
});
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.lebt) { ws.terminate(); continue; } ws.lebt = false; try { ws.ping(); } catch (_) { /* weg */ } }
}, 25_000).unref();

// Fester 20-Hz-Takt für alle Küchen (holt verpasste Takte nach, höchstens 4 auf einmal)
let naechster = performance.now();
const TAKT_MS = 1000 / LK.TAKT;
function schleife() {
  const jetzt = performance.now();
  let n = 0;
  while (jetzt >= naechster && n < 4) { R.takt(); naechster += TAKT_MS; n++; }
  if (jetzt - naechster > 250) naechster = jetzt;
  setTimeout(schleife, Math.max(1, naechster - performance.now()));
}
schleife();

server.listen(PORT, () => console.log(`Löwenküche läuft auf http://localhost:${PORT}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
