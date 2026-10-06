'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { raeume } = require('../raeume.js');

function client(r, name) {
  const post = [];
  const c = { post, transport:{ send:t => post.push(JSON.parse(t)), close() {} } };
  c.v = r.verbinden(c.transport);
  c.send = d => c.v.nachricht(JSON.stringify(d));
  c.last = t => [...post].reverse().find(x => x.t === t);
  c.send({ t:'hallo', name, tier:'pinguin' });
  return c;
}
const takte = (r, n) => { for (let i = 0; i < n; i++) r.takt(); };

test('Koop: Küche erstellen, beitreten, starten, gemeinsamer Zustand', () => {
  const r = raeume();
  const a = client(r, 'Anna'), b = client(r, 'Ben');
  a.send({ t:'erstellen' });
  const code = a.last('raum').code;
  assert.match(code, /^[A-Z0-9]{4}$/);
  b.send({ t:'beitreten', code });
  assert.strictEqual(a.last('raum').mitglieder.length, 2);
  b.send({ t:'start', g:'salat' });                 // nur der Gastgeber darf starten
  assert.strictEqual(a.last('raum').phase, 'lobby');
  a.send({ t:'gericht', g:'steak' });
  assert.strictEqual(b.last('raum').gericht, 'steak');
  a.send({ t:'start', g:'steak' });
  assert.strictEqual(b.last('raum').phase, 'spiel');
  takte(r, 4);
  const s = b.last('s').s;
  assert.strictEqual(s.s.length, 2);
  assert.deepStrictEqual(s.menu, ['steak']);
  // Beide bereit -> Tag beginnt
  a.send({ t:'bereit' }); b.send({ t:'bereit' });
  takte(r, 2);
  assert.strictEqual(a.last('s').s.ph, 'tag');
});

test('Koop: Wiederverbinden per Token übernimmt den Koch', () => {
  const r = raeume();
  const a = client(r, 'Anna'), b = client(r, 'Ben');
  a.send({ t:'erstellen' });
  const code = a.last('raum').code;
  b.send({ t:'beitreten', code });
  a.send({ t:'start', g:'burger' });
  const token = b.last('du').token;
  b.v.getrennt();
  const b2 = client(r, 'Ben');
  b2.send({ t:'hallo', name:'Ben', token, code });
  assert.strictEqual(b2.last('du').token, token);
  takte(r, 2);
  assert.strictEqual(b2.last('s').s.s.length, 2);
});

test('Olympia: eigene Küchen, gleicher Ansturm, Rangliste wird gemeldet', () => {
  const gemeldet = [];
  const olymp = {
    ticketPruefen:t => t === 'falsch' ? null : ({ l:'lauf1', g:0, s:t, n:t, m:[{ s:'anna', n:'Anna' }, { s:'ben', n:'Ben' }], c:{ menu:'einfach', dauer:180 }, z:'http://olymp' }),
    rangMelden:(t, rang) => gemeldet.push(rang), status:() => {}
  };
  const uhr = 1000;
  const r = raeume({ olymp, jetzt:() => uhr, zeiten:{ countdown:0 } });
  const x = client(r, 'x'); x.send({ t:'olymp', ticket:'falsch' });
  assert.ok(x.last('fehler').olymp);
  const a = client(r, 'a'), b = client(r, 'b');
  a.send({ t:'olymp', ticket:'anna' });
  assert.strictEqual(a.last('raum').olymp.erwartet.filter(e => e.da).length, 1);
  b.send({ t:'olymp', ticket:'ben' });
  return new Promise(ok => setTimeout(ok, 20)).then(() => {
    assert.strictEqual(a.last('raum').phase, 'spiel');
    takte(r, 2);
    assert.strictEqual(a.last('s').s.mo, 'rush');
    assert.strictEqual(a.last('s').s.s.length, 1);         // nur der eigene Koch
    takte(r, 181 * 20);
    assert.ok(a.last('olympEnde'));
    assert.strictEqual(gemeldet.length, 1);
    assert.deepStrictEqual(gemeldet[0].map(g => g.s).sort(), ['anna', 'ben']);
  });
});
