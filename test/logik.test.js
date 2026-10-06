'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LK = require('../js/logik.js');

// Stellt den Spieler auf eine freie Nachbarkachel und lässt ihn auf (tx, ty) schauen
function vor(spiel, s, tx, ty) {
  for (const [dx, dy] of LK.RICHTUNG) {
    const x = tx + dx, y = ty + dy;
    if (!spiel.frei(x, y)) continue;
    s.x = x + 0.5; s.y = y + 0.5; s.r = Math.atan2(-dy, -dx);
    const [zx, zy] = LK.zielKachel(s.x, s.y, s.r);
    if (zx === tx && zy === ty) return;
  }
  throw new Error(`Kein Platz vor ${tx},${ty}`);
}
const finde = (spiel, t, z) => [...spiel.geraete.values()].find(g => g.t === t && (z == null || g.z === z));
function greife(spiel, s, g) { vor(spiel, s, g.x, g.y); spiel.befehl(s.id, { t:'g' }); }
function arbeite(spiel, s, g, sek) { vor(spiel, s, g.x, g.y); s.w = true; for (let i = 0; i < sek * LK.TAKT; i++) spiel.schritt(); s.w = false; }
const laufen = (spiel, sek) => { for (let i = 0; i < sek * LK.TAKT; i++) spiel.schritt(); };

test('Startküche ist gültig und alle Tische sind erreichbar', () => {
  for (const start of LK.STARTGERICHTE) {
    const sp = new LK.Spiel({ seed:1, start });
    assert.strictEqual(sp.layoutFehler(), '', start);
    for (const g of LK.GERICHTE[start].kisten) assert.ok(finde(sp, 'kiste', g), `Kiste ${g} fehlt bei ${start}`);
    for (const t of LK.GERICHTE[start].geraete) assert.ok(finde(sp, t), `${t} fehlt bei ${start}`);
  }
  const rush = new LK.Spiel({ seed:1, modus:'rush', menu:['salat', 'burger', 'steak', 'pommes', 'pizza'] });
  assert.strictEqual(rush.layoutFehler(), '');
  assert.strictEqual(rush.phase, 'tag');
});

test('Salat zubereiten, servieren, bezahlt werden, abspülen', () => {
  const sp = new LK.Spiel({ seed:7, start:'salat' });
  const s = sp.spielerHinzu('a', 'Anna', 'loewe');
  sp.befehl('a', { t:'bereit' });
  assert.strictEqual(sp.phase, 'tag');
  // Warten, bis die erste Gruppe bestellt hat
  let gr;
  for (let i = 0; i < 60 * LK.TAKT && !(gr = sp.gruppen.find(g => g.phase === 'bestellt')); i++) sp.schritt();
  assert.ok(gr, 'niemand hat bestellt');
  const tisch = [...sp.geraete.values()].find(g => g.i === gr.tisch);
  const brett = finde(sp, 'brett'), kiste = finde(sp, 'kiste', 'salat'), regal = finde(sp, 'tellerregal');
  for (const _ of gr.glieder) {
    greife(sp, s, kiste); assert.strictEqual(s.h.z, 'salat');
    greife(sp, s, brett); assert.strictEqual(s.h, null);
    arbeite(sp, s, brett, 2); assert.strictEqual(brett.it.z, 'salat_g');
    greife(sp, s, regal); assert.strictEqual(s.h.z, 'teller');
    greife(sp, s, brett); assert.deepStrictEqual(s.h.auf, ['salat_g']);
    greife(sp, s, tisch); assert.strictEqual(s.h, null);
  }
  assert.strictEqual(gr.phase, 'isst');
  const vorher = sp.muenzen;
  laufen(sp, 7);
  assert.ok(sp.muenzen > vorher, 'nicht bezahlt');
  assert.strictEqual(tisch.d, gr.glieder.length);
  greife(sp, s, tisch); assert.strictEqual(s.h.z, 'dreck');
  const spuele = finde(sp, 'spuele');
  greife(sp, s, spuele); assert.strictEqual(spuele.d, gr.glieder.length);
  arbeite(sp, s, spuele, 1.5 * gr.glieder.length + 0.2);
  assert.strictEqual(spuele.sb, gr.glieder.length);
  greife(sp, s, spuele); greife(sp, s, regal);
  assert.strictEqual(s.h, null);
});

test('Burger: Hack braten, Patty verbrennt, wenn man es liegen lässt', () => {
  const sp = new LK.Spiel({ seed:3, start:'burger' });
  const s = sp.spielerHinzu('a', 'A');
  sp.befehl('a', { t:'bereit' });
  const herd = finde(sp, 'herd'), brett = finde(sp, 'brett'), fleisch = finde(sp, 'kiste', 'fleisch'), bun = finde(sp, 'kiste', 'broetchen'), regal = finde(sp, 'tellerregal');
  greife(sp, s, fleisch); greife(sp, s, brett); arbeite(sp, s, brett, 2);
  greife(sp, s, brett); assert.strictEqual(s.h.z, 'hack');
  greife(sp, s, herd); laufen(sp, 5.2);
  assert.strictEqual(herd.it.z, 'patty');
  greife(sp, s, regal); greife(sp, s, bun); assert.deepStrictEqual(s.h.auf, ['broetchen']);
  greife(sp, s, herd); assert.deepStrictEqual(s.h.auf.sort(), ['broetchen', 'patty']);
  assert.strictEqual(LK.gerichtAus(s.h.auf), 'burger');
  // Rohes Fleisch direkt auf den Herd: Steak gibt es im Menü nicht, aber es wird trotzdem gar – und verbrennt
  const s2 = sp.spielerHinzu('b', 'B');
  greife(sp, s2, fleisch); greife(sp, s2, herd); laufen(sp, 17);
  assert.strictEqual(herd.it.z, 'verbrannt');
  greife(sp, s2, herd); greife(sp, s2, finde(sp, 'muell')); assert.strictEqual(s2.h, null);
});

test('Pizza aus Teig, Tomate und Käse', () => {
  const sp = new LK.Spiel({ seed:1, modus:'rush', menu:['pizza'] });
  const s = sp.spielerHinzu('a', 'A');
  const theke = [...sp.geraete.values()].find(g => g.t === 'theke' && g.y === 3);
  const brett = finde(sp, 'brett'), ofen = finde(sp, 'ofen');
  greife(sp, s, finde(sp, 'kiste', 'teig')); greife(sp, s, theke);
  greife(sp, s, finde(sp, 'kiste', 'tomate')); greife(sp, s, brett); arbeite(sp, s, brett, 1.3); greife(sp, s, brett); greife(sp, s, theke);
  assert.strictEqual(theke.it.z, 'pizza_t');
  greife(sp, s, finde(sp, 'kiste', 'kaese')); greife(sp, s, brett); arbeite(sp, s, brett, 1.3); greife(sp, s, brett); greife(sp, s, theke);
  assert.strictEqual(theke.it.z, 'pizza_roh');
  greife(sp, s, theke); greife(sp, s, ofen); laufen(sp, 8.2);
  assert.strictEqual(ofen.it.z, 'pizza');
});

test('Unbediente Gäste kosten Sterne, ohne Sterne ist der Lauf vorbei', () => {
  const sp = new LK.Spiel({ seed:5, start:'salat' });
  sp.spielerHinzu('a', 'A');
  sp.befehl('a', { t:'bereit' });
  for (let i = 0; i < 400 * LK.TAKT && sp.phase === 'tag'; i++) sp.schritt();
  assert.strictEqual(sp.phase, 'ende');
  assert.strictEqual(sp.ergebnis.sieg, false);
  assert.ok(sp.veraergert > 0);
});

test('Nacht: kaufen, Gerät tragen und abstellen, Fließband drehen', () => {
  const sp = new LK.Spiel({ seed:9, start:'salat' });
  const s = sp.spielerHinzu('a', 'A');
  sp.muenzen = 100;
  sp.angebote = [{ t:'fliessband', preis:14, weg:false }];
  sp.befehl('a', { t:'kaufen', i:0 });
  assert.strictEqual(sp.muenzen, 86);
  const band = finde(sp, 'fliessband');
  assert.ok(band);
  greife(sp, s, band);
  assert.strictEqual(s.tr, band);
  assert.ok(!finde(sp, 'fliessband'));
  // Auf eine freie Kachel schauen und abstellen
  s.x = 8.5; s.y = 5.5; s.r = 0;
  sp.befehl('a', { t:'g' });
  assert.strictEqual(sp.bei(9, 5), band);
  assert.strictEqual(band.r, 0);
  sp.befehl('a', { t:'d' });
  assert.strictEqual(band.r, 1);
  sp.befehl('a', { t:'teller' });
  assert.strictEqual(finde(sp, 'tellerregal').n, 6 + LK.TELLER_PAKET);
});

test('Tische zustellen verhindert den Tagesstart', () => {
  const sp = new LK.Spiel({ seed:2, start:'salat' });
  sp.spielerHinzu('a', 'A');
  const t = [...sp.geraete.values()].find(g => g.t === 'tisch');
  for (const [dx, dy] of LK.RICHTUNG) if (!sp.bei(t.x + dx, t.y + dy)) sp.setzen('theke', t.x + dx, t.y + dy);
  sp.befehl('a', { t:'bereit' });
  assert.strictEqual(sp.phase, 'nacht');
  assert.match(sp.meldung, /nicht erreichbar/);
});

test('Fließband und Greifarm transportieren', () => {
  const sp = new LK.Spiel({ seed:4, start:'salat' });
  sp.spielerHinzu('a', 'A');
  const kiste = finde(sp, 'kiste', 'salat');
  // Greifarm unter die Kiste, Band dahinter, Theke am Ende
  const x = kiste.x, y = kiste.y;
  const arm = sp.setzen('greifarm', x, y + 1, 1);
  sp.setzen('fliessband', x, y + 2, 1);
  const ende = sp.setzen('theke', x, y + 3, 1);
  sp.befehl('a', { t:'bereit' });
  laufen(sp, 3);
  assert.ok(arm);
  assert.strictEqual(ende.it && ende.it.z, 'salat');
});

test('Karten nach Tag 3, Gericht bringt Kisten und Geräte', () => {
  const sp = new LK.Spiel({ seed:11, start:'salat' });
  sp.spielerHinzu('a', 'A');
  sp.tag = 3; sp.phase = 'tag'; sp.plan = []; sp.gruppen = []; sp.zeit = 0;
  sp.schritt();
  assert.strictEqual(sp.phase, 'nacht');
  assert.strictEqual(sp.tag, 4);
  assert.ok(sp.karten && sp.karten.length === 2);
  sp.karten = [{ art:'gericht', id:'pizza' }];
  sp.befehl('a', { t:'karte', i:0 });
  assert.ok(sp.menu.includes('pizza'));
  assert.ok(finde(sp, 'ofen') && finde(sp, 'kiste', 'teig') && finde(sp, 'kiste', 'kaese'));
});

test('Gleicher Seed ergibt gleichen Ablauf', () => {
  const lauf = () => {
    const sp = new LK.Spiel({ seed:42, modus:'rush', dauer:120, menu:['salat', 'burger'] });
    sp.spielerHinzu('a', 'A');
    const ankunft = [];
    for (let i = 0; i < 60 * LK.TAKT; i++) { sp.schritt(); for (const g of sp.gruppen) if (!ankunft.includes(g.i + ':' + g.glieder.length)) ankunft.push(g.i + ':' + g.glieder.length); }
    return ankunft.join(',');
  };
  assert.strictEqual(lauf(), lauf());
});

test('Bewegung stößt an Geräte und Wände', () => {
  const sp = new LK.Spiel({ seed:1, start:'salat' });
  const s = { x:3.5, y:2.5, r:0 };
  for (let i = 0; i < 40; i++) LK.bewegen(s, 0, -1, LK.DT, (x, y) => sp.frei(x, y));
  assert.ok(s.y >= 2 + LK.RADIUS - 0.01, 'läuft in die Theke: ' + s.y);
  for (let i = 0; i < 200; i++) LK.bewegen(s, -1, 0, LK.DT, (x, y) => sp.frei(x, y));
  assert.ok(s.x >= 1 + LK.RADIUS - 0.01, 'läuft in die Wand: ' + s.x);
});

test('Sicht ist JSON-tauglich und klein', () => {
  const sp = new LK.Spiel({ seed:1, modus:'rush', menu:['salat', 'burger', 'pizza'] });
  for (const id of ['a', 'b', 'c', 'd']) sp.spielerHinzu(id, id);
  laufen(sp, 40);
  const text = JSON.stringify(sp.sicht());
  assert.ok(text.length < 12000, 'Sicht zu groß: ' + text.length);
});
