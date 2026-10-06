/* Löwenküche – Spielregeln. Läuft gleich im Browser (Solo) und auf dem Server (Koop, Olympiade).
   Reine Logik ohne Grafik: Raster-Restaurant, Geräte, Zutaten, Gäste, Tag/Nacht, Laden, Karten.
   Koordinaten: Kachel (x, y) deckt [x, x+1) × [y, y+1); Ränder sind Wände, die Tür liegt unten. */
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LK = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAKT = 20, DT = 1 / TAKT;
  const W = 14, H = 12;                 // mit Wänden; innen x 1..12, y 1..10
  const TUER_X = 7;                     // Tür in der unteren Wand (y = H-1), draußen ist y = H
  const TEMPO = 4.3, RADIUS = 0.3, GAST_TEMPO = 2.2;
  const TAGE = 15, STERNE = 3, MAX_SPIELER = 4;
  const RICHTUNG = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // r: 0 = +x, 1 = +y (zur Tür), 2 = -x, 3 = -y

  /* ---------- Zutaten, Rezepte, Geräte ---------- */
  const DINGE = {
    tomate:{ n:'Tomate' }, tomate_g:{ n:'Tomatenstücke' },
    salat:{ n:'Salatkopf' }, salat_g:{ n:'Salatblätter' },
    fleisch:{ n:'Fleisch' }, hack:{ n:'Hackfleisch' }, patty:{ n:'Patty' }, steak:{ n:'Steak' },
    broetchen:{ n:'Brötchen' },
    kartoffel:{ n:'Kartoffel' }, kartoffel_g:{ n:'Kartoffelstifte' }, pommes:{ n:'Pommes' },
    teig:{ n:'Teig' }, kaese:{ n:'Käse' }, kaese_g:{ n:'Reibekäse' },
    pizza_t:{ n:'Teig mit Tomate' }, pizza_roh:{ n:'Rohe Pizza' }, pizza:{ n:'Pizza' },
    verbrannt:{ n:'Verbrannt' },
    teller:{ n:'Teller' }, stapel:{ n:'Tellerstapel' }, dreck:{ n:'Schmutzige Teller' }
  };
  // Schneidebrett: [Ergebnis, Sekunden Arbeit]
  const SCHNEIDEN = { salat:['salat_g', 1.6], tomate:['tomate_g', 1.2], fleisch:['hack', 1.8], kartoffel:['kartoffel_g', 1.6], kaese:['kaese_g', 1.2] };
  // Wärmegeräte: [Ergebnis, Sekunden]. Was fertig ist, verbrennt, wenn es zu lange liegen bleibt.
  const KOCHEN = {
    herd:{ hack:['patty', 5], fleisch:['steak', 7], patty:['verbrannt', 9], steak:['verbrannt', 9] },
    ofen:{ pizza_roh:['pizza', 8], pizza:['verbrannt', 11] },
    fritteuse:{ kartoffel_g:['pommes', 5], pommes:['verbrannt', 9] }
  };
  // Zutaten, die man ohne Teller auf der Ablage zusammenlegt
  const KOMBI = [['teig', 'tomate_g', 'pizza_t'], ['pizza_t', 'kaese_g', 'pizza_roh']];

  const GERICHTE = {
    salat:{ n:'Salat', teile:['salat_g'], preis:6, kisten:['salat'], geraete:[] },
    burger:{ n:'Burger', teile:['broetchen', 'patty'], preis:10, kisten:['broetchen', 'fleisch'], geraete:['herd'] },
    steak:{ n:'Steak', teile:['steak'], preis:9, kisten:['fleisch'], geraete:['herd'] },
    pommes:{ n:'Pommes', teile:['pommes'], preis:7, kisten:['kartoffel'], geraete:['fritteuse'] },
    pizza:{ n:'Pizza', teile:['pizza'], preis:15, kisten:['teig', 'tomate', 'kaese'], geraete:['ofen'] },
    bunt:{ n:'Bunter Salat', teile:['salat_g', 'tomate_g'], preis:10, kisten:['salat', 'tomate'], geraete:[], braucht:'salat' },
    kaeseburger:{ n:'Käseburger', teile:['broetchen', 'patty', 'kaese_g'], preis:14, kisten:['broetchen', 'fleisch', 'kaese'], geraete:['herd'], braucht:'burger' }
  };
  const STARTGERICHTE = ['salat', 'burger', 'steak', 'pommes'];

  const GERAETE = {
    theke:{ n:'Theke', preis:8, ablage:true },
    brett:{ n:'Schneidebrett', preis:12, ablage:true },
    herd:{ n:'Herd', preis:20, ablage:true },
    ofen:{ n:'Ofen', preis:25, ablage:true },
    fritteuse:{ n:'Fritteuse', preis:22, ablage:true },
    fliessband:{ n:'Fließband', preis:14, ablage:true },
    spuele:{ n:'Spüle', preis:14 },
    spuelmaschine:{ n:'Spülmaschine', preis:40 },
    tellerregal:{ n:'Tellerregal', preis:16 },
    muell:{ n:'Mülleimer', preis:6 },
    tisch:{ n:'Tisch', preis:18 },
    greifarm:{ n:'Greifarm', preis:28 },
    kiste:{ n:'Zutatenkiste', preis:0 }
  };
  const LADEN = ['theke', 'theke', 'brett', 'herd', 'tisch', 'tisch', 'spuele', 'spuelmaschine', 'tellerregal', 'muell', 'fliessband', 'fliessband', 'greifarm', 'ofen', 'fritteuse'];
  const TELLER_PREIS = 10, TELLER_PAKET = 3, WUERFEL_PREIS = 5;

  const MODS = {
    ansturm:{ n:'Ansturm', text:'30 % mehr Gäste – dafür sofort 25 Münzen.' },
    eilig:{ n:'Eilige Gäste', text:'Gäste warten 20 % kürzer – dafür sofort 25 Münzen.' },
    familien:{ n:'Familienfeiern', text:'Gruppen werden größer – dafür sofort 25 Münzen.' },
    feinschmecker:{ n:'Feinschmecker', text:'Gäste essen länger, zahlen aber 20 % mehr.' }
  };

  const SPEZIAL_ARBEIT = { spuele:1.4, spuelmaschine:2.6 };
  const SITZE = [[-0.74, 0], [0.74, 0], [0, -0.74], [0, 0.74]];

  /* ---------- Hilfen ---------- */
  const ding = z => ({ z });
  const teller = (auf = []) => ({ z:'teller', auf });
  const stapel = n => n === 1 ? teller() : { z:'stapel', n };
  const istEssen = it => !!it && it.z !== 'teller' && it.z !== 'stapel' && it.z !== 'dreck';
  const leererTeller = it => !!it && it.z === 'teller' && !it.auf.length;
  function enthalten(teil, ganz) {
    const rest = ganz.slice();
    for (const z of teil) { const i = rest.indexOf(z); if (i < 0) return false; rest.splice(i, 1); }
    return true;
  }
  const gleicheMenge = (a, b) => a.length === b.length && enthalten(a, b);
  function gerichtAus(auf) { for (const g in GERICHTE) if (gleicheMenge(auf, GERICHTE[g].teile)) return g; return null; }
  const tellerPasst = (auf, z, menu) => menu.some(g => enthalten([...auf, z], GERICHTE[g].teile));

  // Gegenstand in der Hand (a) trifft auf Gegenstand auf der Ablage (b). Liefert die neue Belegung oder null.
  function kombinieren(a, b, menu) {
    if (a.z === 'teller' && istEssen(b) && tellerPasst(a.auf, b.z, menu)) return { hand:teller([...a.auf, b.z]), ablage:null };
    if (istEssen(a) && b.z === 'teller' && tellerPasst(b.auf, a.z, menu)) return { hand:null, ablage:teller([...b.auf, a.z]) };
    const nTeller = x => leererTeller(x) ? 1 : x.z === 'stapel' ? x.n : 0;
    if (nTeller(a) && nTeller(b)) return { hand:null, ablage:stapel(nTeller(a) + nTeller(b)) };
    if (a.z === 'dreck' && b.z === 'dreck') return { hand:{ z:'dreck', n:a.n + b.n }, ablage:null };
    if (istEssen(a) && istEssen(b)) {
      for (const [x, y, neu] of KOMBI) if ((a.z === x && b.z === y) || (a.z === y && b.z === x)) return { hand:null, ablage:ding(neu) };
    }
    return null;
  }
  function passtAuf(typ, it) {
    if (!it) return true;
    if (KOCHEN[typ]) return it.z === 'verbrannt' || !!KOCHEN[typ][it.z];
    return !!GERAETE[typ].ablage;
  }

  // Bewegung mit Kollision gegen gesperrte Kacheln (Spieler als Quadrat mit halber Kantenlänge RADIUS).
  // frei(tx, ty) sagt, ob eine Kachel begehbar ist. Gleiche Funktion im Browser (Vorhersage) und auf dem Server.
  function bewegen(s, ix, iy, dt, frei) {
    const l = Math.hypot(ix, iy);
    if (l > 1) { ix /= l; iy /= l; }
    if (l > 0.15) s.r = Math.atan2(iy, ix);
    const r = RADIUS;
    const stoesst = (x, y) => {
      for (let ty = Math.floor(y - r); ty <= Math.floor(y + r - 1e-6); ty++)
        for (let tx = Math.floor(x - r); tx <= Math.floor(x + r - 1e-6); tx++) if (!frei(tx, ty)) return true;
      return false;
    };
    // Je Achse in kleinen Teilschritten bis zur Wand (so gleitet man an Kanten entlang)
    const achse = (dx, dy) => {
      const weg = Math.hypot(dx, dy) * TEMPO * dt;
      if (weg <= 0 || stoesst(s.x, s.y)) { if (weg > 0) { s.x += dx * TEMPO * dt; s.y += dy * TEMPO * dt; } return; }
      const n = Math.ceil(weg / 0.02), sx = dx * TEMPO * dt / n, sy = dy * TEMPO * dt / n;
      for (let i = 0; i < n; i++) { if (stoesst(s.x + sx, s.y + sy)) break; s.x += sx; s.y += sy; }
    };
    achse(ix, 0);
    achse(0, iy);
    // Falls man doch irgendwo drinsteckt (z. B. Gerät unter den Füßen abgestellt): hinausschieben
    if (stoesst(s.x, s.y)) {
      for (let d = 0.1; d < 2; d += 0.1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!stoesst(s.x + dx * d, s.y + dy * d)) { s.x += dx * d; s.y += dy * d; return; }
      }
    }
  }
  // Die Kachel, auf die eine Figur schaut
  function zielKachel(x, y, r) {
    const c = Math.cos(r), s = Math.sin(r);
    let tx = Math.floor(x + c * 0.78), ty = Math.floor(y + s * 0.78);
    if (tx === Math.floor(x) && ty === Math.floor(y)) { tx = Math.floor(x + c * 1.15); ty = Math.floor(y + s * 1.15); }
    return [tx, ty];
  }
  const richtungAus = r => ((Math.round(r / (Math.PI / 2)) % 4) + 4) % 4;
  const innen = (x, y) => x >= 1 && x <= W - 2 && y >= 1 && y <= H - 2;

  /* ---------- Das Spiel ---------- */
  class Spiel {
    // opt: { seed, start:'burger', modus:'lauf'|'rush', dauer (Sek., nur rush), menu:[…] (nur rush) }
    constructor(opt = {}) {
      this.rs = (opt.seed >>> 0) || 1;
      this.modus = opt.modus === 'rush' ? 'rush' : 'lauf';
      this.menu = this.modus === 'rush' ? (opt.menu || ['salat', 'burger']).filter(g => GERICHTE[g]) : [GERICHTE[opt.start] && STARTGERICHTE.includes(opt.start) ? opt.start : 'salat'];
      this.mods = {};
      this.tag = 1;
      this.phase = 'nacht';
      this.muenzen = 0; this.verdient = 0; this.sterne = STERNE;
      this.bedient = 0; this.veraergert = 0;
      this.tellerZahl = this.modus === 'rush' ? 12 : 6;
      this.zeit = 0; this.dauer = 0;
      this.geraete = new Map();          // "x,y" -> Gerät
      this.spieler = new Map();
      this.gruppen = []; this.schlange = []; this.plan = [];
      this.angebote = []; this.karten = null; this.bereit = new Set();
      this.ev = []; this.nId = 1; this.meldung = ''; this.ergebnis = null;
      this.rushDauer = Math.max(60, Math.min(900, Number(opt.dauer) || 240));
      this.grundLayout();
      if (this.modus === 'rush') this.tagStarten();
      else this.angeboteWuerfeln();
    }

    zufall() {
      let t = (this.rs = (this.rs + 0x6D2B79F5) | 0);
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    zufallInt(n) { return Math.floor(this.zufall() * n); }

    /* ----- Geräte ----- */
    bei(x, y) { return this.geraete.get(x + ',' + y) || null; }
    setzen(typ, x, y, r = 1, extra) {
      const g = { i:this.nId++, t:typ, x, y, r, it:null, zt:0, f:0, ...extra };
      if (typ === 'tellerregal' && g.n == null) g.n = 0;
      if (typ === 'spuele' || typ === 'spuelmaschine') { g.d = 0; g.sb = 0; }
      if (typ === 'tisch') { g.d = 0; g.gruppe = null; }
      this.geraete.set(x + ',' + y, g);
      return g;
    }
    freieKachel(sx, sy, fuerSpieler = true) {
      // Breitensuche ab (sx, sy) nach einer leeren Innenkachel, auf der niemand steht und die die Tür nicht verstellt
      const gesehen = new Set([sx + ',' + sy]);
      const offen = [[sx, sy]];
      while (offen.length) {
        const [x, y] = offen.shift();
        if (innen(x, y) && !this.bei(x, y) && !(x === TUER_X && y === H - 2) && !(fuerSpieler && this.stehtJemand(x, y))) return [x, y];
        for (const [dx, dy] of RICHTUNG) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (!gesehen.has(k) && innen(nx, ny)) { gesehen.add(k); offen.push([nx, ny]); }
        }
      }
      return null;
    }
    stehtJemand(tx, ty) {
      for (const s of this.spieler.values())
        if (s.x + RADIUS > tx && s.x - RADIUS < tx + 1 && s.y + RADIUS > ty && s.y - RADIUS < ty + 1) return true;
      return false;
    }
    frei(tx, ty) { return innen(tx, ty) && !this.bei(tx, ty); }

    grundLayout() {
      const rush = this.modus === 'rush';
      const noetig = [];
      for (const g of this.menu) for (const t of GERICHTE[g].geraete) if (!noetig.includes(t)) noetig.push(t);
      const kisten = [];
      for (const g of this.menu) for (const z of GERICHTE[g].kisten) if (!kisten.includes(z)) kisten.push(z);
      // Obere Reihe von links: Teller, Spüle, Ablagen, Brett, Wärmegeräte, Müll … Kisten von rechts
      const reihe = ['tellerregal', 'spuele', 'theke', 'brett', 'theke', ...noetig, 'theke', 'muell'];
      let x = 1;
      for (const t of reihe) { const g = this.setzen(t, x, 1, 1); if (t === 'tellerregal') g.n = this.tellerZahl; x++; }
      let kx = W - 2, ky = 1;
      for (const z of kisten) {
        if (this.bei(kx, ky)) { ky++; kx = W - 2; }
        this.setzen('kiste', kx, ky, 2, { z });
        if (ky === 1) kx--; else ky++;
      }
      // Durchreiche als Insel
      for (let ix = 3; ix <= 6; ix++) this.setzen(ix === 4 && rush ? 'brett' : 'theke', ix, 3, 3);
      if (rush) {
        this.setzen('spuelmaschine', 1, 3, 0);
        for (const t of noetig) { const p = this.freieKachel(7, 3, false); if (p) this.setzen(t, p[0], p[1], 3); }
      }
      const tische = rush ? [[3, 7], [6, 7], [10, 7], [3, 9], [10, 9]] : [[3, 7], [6, 7], [10, 7]];
      for (const [tx, ty] of tische) this.setzen('tisch', tx, ty, 0);
    }

    /* ----- Spieler ----- */
    spielerHinzu(id, name, tier) {
      if (this.spieler.has(id)) return this.spieler.get(id);
      if (this.spieler.size >= MAX_SPIELER) return null;
      const n = this.spieler.size;
      const s = { id, name:String(name || 'Koch').slice(0, 16), tier:tier || 'loewe', x:4.5 + n * 1.5, y:5.5, r:-Math.PI / 2, h:null, tr:null, w:false, farbe:n };
      // Startplatz frei machen, falls dort etwas steht
      if (this.bei(Math.floor(s.x), Math.floor(s.y))) { const p = this.freieKachel(Math.floor(s.x), Math.floor(s.y), false); if (p) { s.x = p[0] + 0.5; s.y = p[1] + 0.5; } }
      this.spieler.set(id, s);
      return s;
    }
    spielerWeg(id) {
      const s = this.spieler.get(id);
      if (!s) return;
      if (s.tr) this.abstellenIrgendwo(s);
      this.spieler.delete(id);
      this.bereit.delete(id);
      this.bereitPruefen();
    }
    abstellenIrgendwo(s) {
      const p = this.freieKachel(Math.floor(s.x), Math.floor(s.y), true) || this.freieKachel(6, 5, false);
      if (p) { s.tr.x = p[0]; s.tr.y = p[1]; this.geraete.set(p[0] + ',' + p[1], s.tr); }
      s.tr = null;
    }

    /* ----- Befehle (von Eingabe oder Netz) ----- */
    befehl(id, m) {
      const s = this.spieler.get(id);
      if (!s || !m || typeof m.t !== 'string') return;
      if (this.phase === 'ende') return;
      switch (m.t) {
        case 'p': {   // Position, Blickrichtung, Arbeiten gedrückt
          const x = Number(m.x), y = Number(m.y), r = Number(m.r);
          if (Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x - s.x, y - s.y) < 2.5 && innen(Math.floor(x), Math.floor(y))) { s.x = x; s.y = y; }
          if (Number.isFinite(r)) s.r = r;
          s.w = !!m.w;
          return;
        }
        case 'g': if (m.x != null) this.befehl(id, { t:'p', x:m.x, y:m.y, r:m.r, w:s.w }); return this.greifen(s);
        case 'd': if (m.x != null) this.befehl(id, { t:'p', x:m.x, y:m.y, r:m.r, w:s.w }); return this.drehen(s);
        case 'kaufen': return this.kaufen(Number(m.i));
        case 'teller': return this.tellerKaufen();
        case 'wuerfeln': return this.neuWuerfeln();
        case 'karte': return this.karteWaehlen(Number(m.i));
        case 'bereit': if (this.phase !== 'nacht') return; if (m.v === false) this.bereit.delete(id); else this.bereit.add(id); return this.bereitPruefen();
      }
    }

    greifen(s) {
      const [tx, ty] = zielKachel(s.x, s.y, s.r);
      const g = this.bei(tx, ty);
      if (this.phase === 'nacht') {
        if (s.tr) {
          if (!this.frei(tx, ty) || (tx === TUER_X && ty === H - 2) || this.stehtJemand(tx, ty)) return this.melden('Hier ist kein Platz.');
          s.tr.x = tx; s.tr.y = ty; s.tr.r = (s.tr.t === 'fliessband' || s.tr.t === 'greifarm') ? richtungAus(s.r) : s.tr.r;
          this.geraete.set(tx + ',' + ty, s.tr); s.tr = null;
          this.ev.push({ e:'leg', x:tx + 0.5, y:ty + 0.5 });
        } else if (g) {
          this.geraete.delete(tx + ',' + ty); s.tr = g;
          this.ev.push({ e:'nimm', x:tx + 0.5, y:ty + 0.5 });
        }
        return;
      }
      if (this.phase !== 'tag' || !g) return;
      const vorher = s.h;
      if (g.t === 'tisch') this.amTisch(s, g);
      else if (!s.h) s.h = this.nehmen(g);
      else if (this.ablegen(g, s.h)) s.h = null;
      else if (GERAETE[g.t].ablage && g.it) {
        const k = kombinieren(s.h, g.it, this.menu);
        if (k && passtAuf(g.t, k.ablage)) { s.h = k.hand; g.it = k.ablage; g.zt = 0; }
      } else if (g.t === 'kiste' && s.h.z === 'teller') {
        const k = kombinieren(s.h, ding(g.z), this.menu);
        if (k && k.hand) s.h = k.hand;
      } else if (g.t === 'muell' && s.h.z === 'teller' && s.h.auf.length) {
        s.h = teller(); this.ev.push({ e:'muell', x:tx + 0.5, y:ty + 0.5 });
      } else if ((g.t === 'spuele' || g.t === 'spuelmaschine') && g.sb > 0 && (leererTeller(s.h) || s.h.z === 'stapel')) {
        s.h = stapel((s.h.z === 'stapel' ? s.h.n : 1) + g.sb); g.sb = 0;
      }
      if (s.h !== vorher) this.ev.push({ e:s.h ? 'nimm' : 'leg', x:tx + 0.5, y:ty + 0.5 });
    }

    // Etwas von einem Gerät nehmen (Spieler und Greifarm). Verändert keine Gegenstände, nur Felder des Geräts.
    nehmen(g) {
      if (GERAETE[g.t].ablage) {
        const it = g.it;
        if (!it) return null;
        if (it.z === 'stapel') { g.it = stapel(it.n - 1); return teller(); }
        g.it = null; g.zt = 0;
        return it;
      }
      switch (g.t) {
        case 'tellerregal': if (g.n > 0) { g.n--; return teller(); } return null;
        case 'kiste': return ding(g.z);
        case 'spuele': case 'spuelmaschine': if (g.sb > 0) { const n = g.sb; g.sb = 0; return stapel(n); } return null;
        case 'tisch': if (g.d > 0) { const n = g.d; g.d = 0; return { z:'dreck', n }; } return null;
      }
      return null;
    }
    // Etwas auf ein Gerät legen; true, wenn es angenommen wurde
    ablegen(g, it) {
      if (!it) return false;
      if (GERAETE[g.t].ablage) {
        if (g.it || !passtAuf(g.t, it)) return false;
        g.it = it; g.zt = 0;
        return true;
      }
      switch (g.t) {
        case 'tellerregal':
          if (leererTeller(it)) { g.n++; return true; }
          if (it.z === 'stapel') { g.n += it.n; return true; }
          return false;
        case 'spuele': case 'spuelmaschine':
          if (it.z === 'dreck') { g.d += it.n; return true; }
          return false;
        case 'muell':
          if (istEssen(it)) { this.ev.push({ e:'muell', x:g.x + 0.5, y:g.y + 0.5 }); return true; }
          return false;
        case 'kiste': return it.z === g.z;
      }
      return false;
    }

    amTisch(s, g) {
      const gr = g.gruppe != null ? this.gruppen.find(x => x.i === g.gruppe) : null;
      if (s.h && s.h.z === 'teller' && s.h.auf.length && gr && gr.phase === 'bestellt') {
        const gericht = gerichtAus(s.h.auf);
        const gast = gr.glieder.find(k => !k.sv && k.b === gericht);
        if (!gast) { this.melden('Das hat hier niemand bestellt.'); return; }
        const preis = Math.round(GERICHTE[gericht].preis * (this.mods.feinschmecker ? 1.2 : 1));
        gast.sv = true; gast.zahlt = preis + Math.floor(preis * 0.5 * gr.geduld);
        s.h = null;
        gr.geduld = Math.min(1, gr.geduld + 0.2);
        this.ev.push({ e:'serviert', x:g.x + 0.5, y:g.y + 0.5 });
        if (gr.glieder.every(k => k.sv)) { gr.phase = 'isst'; gr.t = this.mods.feinschmecker ? 8 : 5.5; }
        return;
      }
      if (!s.h && g.d > 0) { s.h = { z:'dreck', n:g.d }; g.d = 0; this.ev.push({ e:'nimm', x:g.x + 0.5, y:g.y + 0.5 }); return; }
      if (s.h && s.h.z === 'dreck' && g.d > 0) { s.h = { z:'dreck', n:s.h.n + g.d }; g.d = 0; this.ev.push({ e:'nimm', x:g.x + 0.5, y:g.y + 0.5 }); }
    }

    drehen(s) {
      if (this.phase !== 'nacht') return;
      const [tx, ty] = zielKachel(s.x, s.y, s.r);
      const g = this.bei(tx, ty);
      if (g) { g.r = (g.r + 1) % 4; this.ev.push({ e:'dreh', x:tx + 0.5, y:ty + 0.5 }); }
    }

    melden(text) { this.meldung = text; this.meldungBis = 3; }

    /* ----- Nacht: Laden, Karten, Bereit ----- */
    angeboteWuerfeln() {
      const pool = LADEN.slice(), a = [];
      while (a.length < 4 && pool.length) {
        const t = pool.splice(this.zufallInt(pool.length), 1)[0];
        if (a.some(x => x.t === t)) continue;
        a.push({ t, preis:GERAETE[t].preis, weg:false });
      }
      this.angebote = a;
    }
    kaufen(i) {
      if (this.phase !== 'nacht' || this.modus === 'rush') return;
      const a = this.angebote[i];
      if (!a || a.weg) return;
      if (this.muenzen < a.preis) return this.melden('Nicht genug Münzen.');
      const p = this.freieKachel(TUER_X, H - 4, true);
      if (!p) return this.melden('Kein Platz mehr im Restaurant.');
      this.muenzen -= a.preis; a.weg = true;
      const g = this.setzen(a.t, p[0], p[1], 1);
      if (a.t === 'tellerregal') { g.n = 4; this.tellerZahl += 4; }
      this.ev.push({ e:'kauf', x:p[0] + 0.5, y:p[1] + 0.5 });
    }
    tellerKaufen() {
      if (this.phase !== 'nacht' || this.modus === 'rush') return;
      if (this.muenzen < TELLER_PREIS) return this.melden('Nicht genug Münzen.');
      const regal = [...this.geraete.values()].find(g => g.t === 'tellerregal');
      if (!regal) return this.melden('Du brauchst ein Tellerregal.');
      this.muenzen -= TELLER_PREIS; this.tellerZahl += TELLER_PAKET; regal.n += TELLER_PAKET;
      this.ev.push({ e:'kauf', x:regal.x + 0.5, y:regal.y + 0.5 });
    }
    neuWuerfeln() {
      if (this.phase !== 'nacht' || this.modus === 'rush') return;
      if (this.muenzen < WUERFEL_PREIS) return this.melden('Nicht genug Münzen.');
      this.muenzen -= WUERFEL_PREIS; this.angeboteWuerfeln();
    }
    kartenZiehen() {
      const gerichte = Object.keys(GERICHTE).filter(g => !this.menu.includes(g) && (!GERICHTE[g].braucht || this.menu.includes(GERICHTE[g].braucht)));
      const mods = Object.keys(MODS).filter(m => !this.mods[m]);
      const karten = [];
      if (gerichte.length) karten.push({ art:'gericht', id:gerichte[this.zufallInt(gerichte.length)] });
      const rest = [...gerichte.filter(g => !karten.some(k => k.id === g)).map(id => ({ art:'gericht', id })), ...mods.map(id => ({ art:'mod', id }))];
      while (karten.length < 2 && rest.length) karten.push(rest.splice(this.zufallInt(rest.length), 1)[0]);
      return karten.length ? karten : null;
    }
    karteWaehlen(i) {
      if (!this.karten || !this.karten[i]) return;
      const k = this.karten[i];
      this.karten = null;
      if (k.art === 'gericht') {
        this.menu.push(k.id);
        const G = GERICHTE[k.id];
        const hat = (t, z) => [...this.geraete.values()].some(g => g.t === t && (z == null || g.z === z));
        for (const t of G.geraete) if (!hat(t)) { const p = this.freieKachel(6, 5, true); if (p) this.setzen(t, p[0], p[1], 1); }
        for (const z of G.kisten) if (!hat('kiste', z)) { const p = this.freieKachel(6, 5, true); if (p) this.setzen('kiste', p[0], p[1], 1, { z }); }
      } else {
        this.mods[k.id] = true;
        if (k.id !== 'feinschmecker') this.muenzen += 25;
      }
      this.ev.push({ e:'karte' });
    }
    bereitPruefen() {
      if (this.phase !== 'nacht' || this.karten || !this.spieler.size) return;
      for (const id of this.spieler.keys()) if (!this.bereit.has(id)) return;
      const fehler = this.layoutFehler();
      if (fehler) { this.bereit.clear(); return this.melden(fehler); }
      this.tagStarten();
    }
    layoutFehler() {
      const tische = [...this.geraete.values()].filter(g => g.t === 'tisch');
      if (!tische.length) return 'Ohne Tisch kommen keine Gäste.';
      const { dist } = this.wege();
      for (const t of tische) if (!this.sitzKachel(t, dist)) return 'Ein Tisch ist für Gäste nicht erreichbar.';
      if (![...this.geraete.values()].some(g => g.t === 'tellerregal')) return 'Ohne Tellerregal gibt es keine Teller.';
      return '';
    }

    /* ----- Tag ----- */
    tagStarten() {
      for (const s of this.spieler.values()) if (s.tr) this.abstellenIrgendwo(s);
      this.phase = 'tag'; this.bereit.clear(); this.karten = null;
      const n = Math.max(1, this.spieler.size);
      const faktor = 1 + 0.45 * (n - 1);
      if (this.modus === 'rush') {
        this.dauer = this.rushDauer;
        const gruppen = Math.round(this.dauer / 60 * 5.5 * faktor);
        this.plan = [];
        for (let i = 0; i < gruppen; i++) {
          const t = 4 + (i / gruppen) * this.dauer * 0.9 + this.zufall() * 3;
          this.plan.push({ t, n:1 + this.zufallInt(i < gruppen / 3 ? 2 : 3) });
        }
      } else {
        this.dauer = 115 + 5 * this.tag;
        let gruppen = (2.6 + this.tag * 0.85) * faktor * (this.mods.ansturm ? 1.3 : 1);
        gruppen = Math.max(2, Math.round(gruppen));
        const maxG = Math.min(4, 1 + Math.ceil(this.tag / 3) + (this.mods.familien ? 1 : 0));
        this.plan = [];
        for (let i = 0; i < gruppen; i++) {
          const t = 3 + (i / gruppen) * this.dauer * 0.82 + this.zufall() * 4;
          this.plan.push({ t, n:1 + this.zufallInt(maxG) });
        }
      }
      this.zeit = this.dauer;
      this.ev.push({ e:'tag' });
    }
    nachtStarten() {
      this.phase = 'nacht';
      this.gruppen = []; this.schlange = []; this.plan = [];
      // Aufräumen: alles Essen weg, alle Teller sauber ins (erste) Regal
      const regale = [];
      for (const g of this.geraete.values()) {
        if (GERAETE[g.t].ablage) g.it = null;
        if (g.t === 'spuele' || g.t === 'spuelmaschine') { g.d = 0; g.sb = 0; g.f = 0; }
        if (g.t === 'tisch') { g.d = 0; g.gruppe = null; }
        if (g.t === 'tellerregal') { g.n = 0; regale.push(g); }
      }
      for (const s of this.spieler.values()) { s.h = null; s.w = false; }
      if (regale.length) regale[0].n = this.tellerZahl;
      this.muenzen += 5 * this.sterne;
      this.tag++;
      if (this.tag > TAGE) return this.beenden(true);
      if ((this.tag - 1) % 3 === 0) this.karten = this.kartenZiehen();
      this.angeboteWuerfeln();
      this.ev.push({ e:'nacht' });
    }
    beenden(sieg) {
      this.phase = 'ende';
      this.ergebnis = { sieg, tag:Math.min(this.tag, TAGE), verdient:this.verdient, bedient:this.bedient, veraergert:this.veraergert, menu:this.menu.slice() };
      this.ev.push({ e:'ende', sieg });
    }

    /* ----- Wege der Gäste ----- */
    begehbar(x, y) {
      if (x === TUER_X && (y === H - 1 || y === H)) return true;
      return innen(x, y) && !this.bei(x, y);
    }
    wege() {
      const dist = new Int16Array(W * (H + 1)).fill(-1), vor = new Int16Array(W * (H + 1)).fill(-1);
      const start = H * W + TUER_X;
      dist[start] = 0;
      const offen = [start];
      for (let k = 0; k < offen.length; k++) {
        const i = offen[k], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of RICHTUNG) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny > H) continue;
          const j = ny * W + nx;
          if (dist[j] >= 0 || !this.begehbar(nx, ny)) continue;
          dist[j] = dist[i] + 1; vor[j] = i; offen.push(j);
        }
      }
      return { dist, vor };
    }
    sitzKachel(t, dist) {
      let best = null, bd = 1e9;
      for (const [dx, dy] of RICHTUNG) {
        const x = t.x + dx, y = t.y + dy;
        if (!innen(x, y) || this.bei(x, y)) continue;
        const d = dist[y * W + x];
        if (d >= 0 && d < bd) { bd = d; best = [x, y]; }
      }
      return best;
    }
    pfad(vor, x, y) {
      const punkte = [];
      let i = y * W + x;
      while (i >= 0) { punkte.push([i % W + 0.5, ((i / W) | 0) + 0.5]); i = vor[i]; }
      punkte.reverse();
      punkte.unshift([TUER_X + 0.5, H + 1.6]);
      return punkte;
    }
    static pfadLaenge(p) { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; }
    static aufPfad(p, d) {
      if (d <= 0) return [p[0][0], p[0][1], Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0])];
      for (let i = 1; i < p.length; i++) {
        const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        const r = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
        if (d <= l) { const f = d / l; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f, r]; }
        d -= l;
      }
      const a = p[p.length - 2], b = p[p.length - 1];
      return [b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0])];
    }

    gruppeErzeugen(n) {
      const gr = { i:this.nId++, phase:'wartet', glieder:[], geduld:1, geduldMax:55, tisch:null, pfad:null, d:0, t:0 };
      for (let k = 0; k < n; k++) gr.glieder.push({ i:this.nId++, x:TUER_X + 2 + k * 0.4, y:H + 0.8, r:Math.PI, a:this.zufallInt(5), fa:this.zufallInt(6), b:null, sv:false, zahlt:0 });
      this.gruppen.push(gr);
      this.schlange.push(gr);
    }
    gruppeGeht(gr, wuetend) {
      const tisch = gr.tisch != null ? [...this.geraete.values()].find(g => g.i === gr.tisch) : null;
      if (wuetend) {
        this.veraergert += gr.glieder.length;
        this.ev.push({ e:'aerger', x:tisch ? tisch.x + 0.5 : TUER_X + 0.5, y:tisch ? tisch.y + 0.5 : H });
        if (this.modus === 'rush') this.muenzen = Math.max(0, this.muenzen - 5);
        else this.sterne--;
      }
      if (gr.phase === 'wartet') { this.schlange = this.schlange.filter(x => x !== gr); gr.phase = 'weg'; return; }
      if (tisch) {
        tisch.gruppe = null;
        tisch.d += gr.glieder.filter(k => k.sv).length;
        // Weg zurück zur Tür von der Kachel, an der sie stehen
        const { vor } = this.wege();
        gr.pfad = gr.sitz ? this.pfad(vor, gr.sitz[0], gr.sitz[1]).reverse() : null;
        if (gr.pfad) gr.pfad.push([TUER_X + 0.5, H + 3]);
      }
      gr.phase = gr.pfad ? 'geht' : 'weg'; gr.d = 0;
      for (const k of gr.glieder) k.b = null;
    }

    /* ----- Takt ----- */
    schritt() {
      if (this.meldungBis > 0 && (this.meldungBis -= DT) <= 0) this.meldung = '';
      if (this.phase !== 'tag') return;
      // Geräte
      for (const g of this.geraete.values()) this.geraetTakt(g);
      // Arbeiten (Schneiden, Spülen) solange gedrückt
      for (const s of this.spieler.values()) {
        if (!s.w) continue;
        const [tx, ty] = zielKachel(s.x, s.y, s.r);
        const g = this.bei(tx, ty);
        if (!g) continue;
        if (g.t === 'brett' && g.it && SCHNEIDEN[g.it.z]) {
          const [neu, dauer] = SCHNEIDEN[g.it.z];
          g.it.s = (g.it.s || 0) + DT;
          if (g.it.s >= dauer) { g.it = ding(neu); this.ev.push({ e:'geschnitten', x:tx + 0.5, y:ty + 0.5 }); }
          else if (Math.floor(g.it.s * 4) !== Math.floor((g.it.s - DT) * 4)) this.ev.push({ e:'hack', x:tx + 0.5, y:ty + 0.5 });
        } else if (g.t === 'spuele' && g.d > 0) {
          g.f += DT;
          if (g.f >= SPEZIAL_ARBEIT.spuele) { g.f = 0; g.d--; g.sb++; this.ev.push({ e:'gespuelt', x:tx + 0.5, y:ty + 0.5 }); }
        }
      }
      // Gäste
      const vergangen = this.dauer - this.zeit;
      while (this.plan.length && this.plan[0].t <= vergangen) this.gruppeErzeugen(this.plan.shift().n);
      this.tischeVergeben();
      for (const gr of this.gruppen) this.gruppeTakt(gr);
      this.gruppen = this.gruppen.filter(gr => gr.phase !== 'weg');
      if (this.modus !== 'rush' && this.sterne <= 0) return this.beenden(false);
      this.zeit = Math.max(0, this.zeit - DT);
      if (this.zeit <= 0) {
        if (this.modus === 'rush') return this.beenden(true);
        if (!this.plan.length && !this.gruppen.length) this.nachtStarten();
      }
    }

    geraetTakt(g) {
      const koch = KOCHEN[g.t];
      if (koch && g.it && koch[g.it.z]) {
        const [neu, dauer] = koch[g.it.z];
        g.it.k = (g.it.k || 0) + DT;
        if (g.it.k >= dauer) { g.it = ding(neu); this.ev.push({ e:neu === 'verbrannt' ? 'verbrannt' : 'gar', x:g.x + 0.5, y:g.y + 0.5 }); }
        return;
      }
      if (g.t === 'spuelmaschine' && g.d > 0) {
        g.f += DT;
        if (g.f >= SPEZIAL_ARBEIT.spuelmaschine) { g.f = 0; g.d--; g.sb++; }
        return;
      }
      if (g.t === 'fliessband' && g.it) {
        g.zt += DT;
        if (g.zt >= 0.6) {
          const [dx, dy] = RICHTUNG[g.r];
          const vorn = this.bei(g.x + dx, g.y + dy);
          if (vorn && vorn.t !== 'greifarm' && this.ablegen(vorn, g.it)) { g.it = null; g.zt = 0; }
        }
        return;
      }
      if (g.t === 'greifarm') {
        g.zt += DT;
        if (g.zt < 0.8) return;
        g.zt = 0;
        const [dx, dy] = RICHTUNG[g.r];
        const hinten = this.bei(g.x - dx, g.y - dy), vorn = this.bei(g.x + dx, g.y + dy);
        if (!hinten || !vorn || hinten.t === 'greifarm' || vorn.t === 'kiste' || vorn.t === 'tisch') return;
        const sicher = { it:hinten.it, n:hinten.n, sb:hinten.sb, d:hinten.d, zt:hinten.zt };
        const it = this.nehmen(hinten);
        if (!it) return;
        if (this.ablegen(vorn, it)) { g.arm = 1; return; }
        Object.assign(hinten, sicher);
      }
    }

    tischeVergeben() {
      if (!this.schlange.length) return;
      let wege = null;
      while (this.schlange.length) {
        const gr = this.schlange[0];
        wege = wege || this.wege();
        let best = null, bd = 1e9, sitz = null;
        for (const t of this.geraete.values()) {
          if (t.t !== 'tisch' || t.gruppe != null || t.d > 0) continue;
          const k = this.sitzKachel(t, wege.dist);
          if (!k) continue;
          const d = wege.dist[k[1] * W + k[0]];
          if (d < bd) { bd = d; best = t; sitz = k; }
        }
        if (!best) return;
        this.schlange.shift();
        best.gruppe = gr.i;
        gr.tisch = best.i; gr.sitz = sitz; gr.tx = best.x; gr.ty = best.y;
        gr.pfad = this.pfad(wege.vor, sitz[0], sitz[1]);
        gr.laenge = Spiel.pfadLaenge(gr.pfad);
        gr.phase = 'kommt'; gr.d = 0;
      }
    }

    gruppeTakt(gr) {
      const ABST = 0.55;
      switch (gr.phase) {
        case 'wartet': {
          const pos = this.schlange.indexOf(gr);
          gr.glieder.forEach((k, j) => {
            const zx = TUER_X + 1.6 + pos * 1.5 + j * 0.38, zy = H + 0.7 + (j % 2) * 0.35;
            k.x += (zx - k.x) * Math.min(1, DT * 3); k.y += (zy - k.y) * Math.min(1, DT * 3); k.r = Math.PI;
          });
          gr.geduld -= DT / (60 * (this.mods.eilig ? 0.8 : 1));
          if (gr.geduld <= 0) this.gruppeGeht(gr, true);
          return;
        }
        case 'kommt': {
          gr.d += GAST_TEMPO * DT;
          gr.glieder.forEach((k, j) => { [k.x, k.y, k.r] = Spiel.aufPfad(gr.pfad, gr.d - j * ABST); });
          if (gr.d >= gr.laenge + (gr.glieder.length - 1) * ABST) {
            gr.phase = 'denkt'; gr.t = 2.5;
            gr.glieder.forEach((k, j) => {
              const [ox, oy] = SITZE[j % 4];
              k.x = gr.tx + 0.5 + ox; k.y = gr.ty + 0.5 + oy; k.r = Math.atan2(-oy, -ox);
            });
          }
          return;
        }
        case 'denkt':
          if ((gr.t -= DT) > 0) return;
          for (const k of gr.glieder) k.b = this.menu[this.zufallInt(this.menu.length)];
          gr.phase = 'bestellt'; gr.geduld = 1;
          gr.geduldMax = (this.modus === 'rush' ? 48 : 52 + gr.glieder.length * 6) * (this.mods.eilig ? 0.8 : 1);
          this.ev.push({ e:'bestellt', x:gr.tx + 0.5, y:gr.ty + 0.5 });
          return;
        case 'bestellt':
          gr.geduld -= DT / gr.geduldMax;
          if (gr.geduld <= 0) this.gruppeGeht(gr, true);
          return;
        case 'isst': {
          if ((gr.t -= DT) > 0) return;
          let summe = 0;
          for (const k of gr.glieder) summe += k.zahlt;
          this.muenzen += summe; this.verdient += summe; this.bedient += gr.glieder.length;
          this.ev.push({ e:'muenzen', x:gr.tx + 0.5, y:gr.ty + 0.5, n:summe });
          this.gruppeGeht(gr, false);
          return;
        }
        case 'geht':
          gr.d += GAST_TEMPO * 1.15 * DT;
          gr.glieder.forEach((k, j) => { [k.x, k.y, k.r] = Spiel.aufPfad(gr.pfad, gr.d - j * ABST); });
          if (gr.d >= Spiel.pfadLaenge(gr.pfad) + gr.glieder.length * ABST) gr.phase = 'weg';
          return;
      }
    }

    /* ----- Für Anzeige und Netz ----- */
    static dingSicht(it, g) {
      if (!it) return null;
      const o = { z:it.z };
      if (it.auf) o.auf = it.auf.slice();
      if (it.n) o.n = it.n;
      if (g && KOCHEN[g.t] && KOCHEN[g.t][it.z]) {
        const [neu, dauer] = KOCHEN[g.t][it.z];
        o.k = Math.min(1, (it.k || 0) / dauer);
        if (neu === 'verbrannt') o.b = 1;
      }
      if (it.s && SCHNEIDEN[it.z]) o.s = Math.min(1, it.s / SCHNEIDEN[it.z][1]);
      return o;
    }
    sicht() {
      const g = [];
      for (const x of this.geraete.values()) {
        const o = { i:x.i, t:x.t, x:x.x, y:x.y, r:x.r };
        if (x.it) o.it = Spiel.dingSicht(x.it, x);
        if (x.t === 'tellerregal') o.n = x.n;
        if (x.t === 'kiste') o.z = x.z;
        if (x.t === 'spuele' || x.t === 'spuelmaschine') { o.d = x.d; o.sb = x.sb; o.f = x.f / SPEZIAL_ARBEIT[x.t]; }
        if (x.t === 'tisch') o.d = x.d;
        g.push(o);
      }
      const s = [];
      for (const x of this.spieler.values()) {
        s.push({ i:x.id, n:x.name, a:x.tier, x:+x.x.toFixed(3), y:+x.y.toFixed(3), r:+x.r.toFixed(3), h:Spiel.dingSicht(x.h), tr:x.tr ? { t:x.tr.t, r:x.tr.r, z:x.tr.z, n:x.tr.n } : null, w:x.w, f:x.farbe });
      }
      const k = [];
      for (const gr of this.gruppen) {
        const zeigen = gr.phase === 'wartet' || gr.phase === 'bestellt';
        gr.glieder.forEach((m, j) => {
          k.push({ i:m.i, x:+m.x.toFixed(3), y:+m.y.toFixed(3), r:+m.r.toFixed(2), a:m.a, fa:m.fa, b:gr.phase === 'bestellt' && !m.sv ? m.b : null,
            sv:m.sv ? m.b : null, gd:zeigen && j === 0 ? +gr.geduld.toFixed(3) : null, p:gr.phase });
        });
      }
      const ev = this.ev; this.ev = [];
      return {
        ph:this.phase, mo:this.modus, tag:this.tag, tage:TAGE, zeit:+this.zeit.toFixed(2), dauer:this.dauer, m:this.muenzen, st:this.sterne, menu:this.menu.slice(),
        mods:Object.keys(this.mods), g, s, k, an:this.phase === 'nacht' ? this.angebote : null, ka:this.karten, be:[...this.bereit],
        tz:this.tellerZahl, me:this.meldung, ev, er:this.ergebnis, sl:this.schlange.length, bd:this.bedient, vd:this.verdient
      };
    }
  }

  return {
    TAKT, DT, W, H, TUER_X, TEMPO, RADIUS, TAGE, STERNE, MAX_SPIELER, RICHTUNG, SITZE,
    DINGE, SCHNEIDEN, KOCHEN, KOMBI, GERICHTE, STARTGERICHTE, GERAETE, MODS, TELLER_PREIS, TELLER_PAKET, WUERFEL_PREIS,
    Spiel, bewegen, zielKachel, richtungAus, innen, gerichtAus, kombinieren
  };
});
