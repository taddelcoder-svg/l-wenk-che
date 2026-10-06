'use strict';
/* Löwenküche – Räume auf dem Server.
   Koop:     bis zu 4 Köche in EINER Küche. Der Server rechnet das Spiel (js/logik.js), die Browser schicken
             Position, Blickrichtung und Aktionen und bekommen 10-mal pro Sekunde den Zustand.
   Olympia:  jede Gruppe bekommt einen Raum; jeder Koch hat seine EIGENE Küche mit demselben Ansturm (gleicher
             Seed). Gewertet wird, wer am meisten verdient. Start, wenn alle da sind oder spätestens nach 90 s.
   Ohne WebSocket testbar: verbinden(transport) liefert nachricht/getrennt, takt() rechnet einen Schritt. */
const crypto = require('crypto');
const LK = require('./js/logik.js');

const MAX_RAEUME = 60, MAX_OLYMP = 12;
const WEG_MS = 20_000;               // so lange bleibt ein getrennter Koch in der Küche stehen
const LEER_MS = 10 * 60_000;         // Raum ohne Verbindung wird danach aufgeräumt
const OLYMP_COUNTDOWN = 6_000, OLYMP_WARTEN = 90_000;
const SENDE_JEDE = 2;                // 20 Hz Takt, 10 Hz an die Browser
const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TIERE = ['loewe', 'pinguin', 'waschbaer', 'fuchs', 'baer', 'hase'];
const OLYMP_MENUS = { einfach:['salat', 'burger'], mittel:['salat', 'burger', 'steak', 'pommes'], voll:['salat', 'burger', 'steak', 'pommes', 'pizza'] };
const OLYMP_DAUER = [180, 240, 300];
const SPIEL_BEFEHLE = new Set(['p', 'g', 'd', 'kaufen', 'teller', 'wuerfeln', 'karte', 'bereit']);

const nameOk = n => String(n || '').replace(/[\u0000-\u001f\u007f<>&"]/g, '').trim().slice(0, 16);
const tierOk = t => TIERE.includes(t) ? t : 'loewe';

function raeume({ olymp = null, jetzt = () => Date.now(), zeiten = {}, seed = () => crypto.randomBytes(4).readUInt32LE(0) } = {}) {
  const Z = { weg:WEG_MS, leer:LEER_MS, countdown:OLYMP_COUNTDOWN, warten:OLYMP_WARTEN, ...zeiten };
  const liste = new Map(), olympRaeume = new Map();
  let naechsteId = 1, takte = 0;
  const code = () => { let c; do { c = Array.from({ length:4 }, () => CODE_ZEICHEN[crypto.randomInt(CODE_ZEICHEN.length)]).join(''); } while (liste.has(c)); return c; };
  const senden = (m, daten) => { if (!m.transport) return; try { m.transport.send(typeof daten === 'string' ? daten : JSON.stringify(daten)); } catch (_) { /* zu */ } };
  const mitglieder = raum => [...raum.mitglieder.values()];
  const online = raum => mitglieder(raum).filter(m => m.transport);

  /* ---------- Was die Browser über den Raum erfahren ---------- */
  function raumFuer(raum, m) {
    const o = raum.olymp;
    const da = new Set(online(raum).map(x => x.olympId).filter(Boolean));
    return {
      t:'raum', code:o ? null : raum.code, art:raum.art, host:raum.host, phase:raum.phase, du:m.id, gericht:raum.gericht,
      mitglieder:mitglieder(raum).map(x => ({ id:x.id, name:x.name, tier:x.tier, online:!!x.transport })),
      olymp:o ? { titel:o.t.ti || 'Olympiade', erwartet:o.t.m.map(e => ({ n:e.n, da:da.has(e.s) })), startIn:o.startBis ? Math.max(0, o.startBis - jetzt()) : null,
        zurueck:o.t.z || null, menu:o.menu, dauer:o.dauer } : null
    };
  }
  function raumSenden(raum) { for (const m of raum.mitglieder.values()) senden(m, raumFuer(raum, m)); olympStatus(raum); }

  /* ---------- Raum betreten, verlassen ---------- */
  function raumErstellen(art, olympInfo) {
    if (liste.size >= MAX_RAEUME) return null;
    const raum = { code:code(), art, host:null, phase:'lobby', gericht:'burger', mitglieder:new Map(), spiel:null, olymp:olympInfo || null, zuletzt:jetzt() };
    liste.set(raum.code, raum);
    return raum;
  }
  function beitreten(m, raum) {
    if (m.raum && m.raum !== raum) verlassen(m);
    m.raum = raum;
    raum.mitglieder.set(m.id, m);
    if (!raum.host || !raum.mitglieder.has(raum.host) || !raum.mitglieder.get(raum.host).transport) raum.host = m.id;
    if (raum.phase === 'spiel' && raum.art === 'koop') raum.spiel.spielerHinzu(m.id, m.name, m.tier);
    raumSenden(raum);
    olympPruefen(raum);
  }
  function verlassen(m) {
    const raum = m.raum; if (!raum) return;
    raum.mitglieder.delete(m.id);
    if (raum.spiel && raum.art === 'koop') raum.spiel.spielerWeg(m.id);
    m.raum = null;
    hostPruefen(raum);
    if (!raum.mitglieder.size && !(raum.olymp && raum.phase === 'lobby')) { aufraeumen(raum); return; }
    raumSenden(raum);
    olympPruefen(raum);
  }
  function getrennt(m) {
    const raum = m.raum; if (!raum) return;
    m.transport = null; m.weg = jetzt();
    if (raum.phase === 'lobby' && !raum.olymp) { verlassen(m); return; }
    hostPruefen(raum);
    raumSenden(raum);
    olympPruefen(raum);
  }
  function hostPruefen(raum) {
    const h = raum.mitglieder.get(raum.host);
    if (h && h.transport) return;
    const neu = online(raum)[0] || mitglieder(raum)[0];
    raum.host = neu ? neu.id : null;
  }
  function aufraeumen(raum) {
    liste.delete(raum.code);
    if (raum.olymp) { clearTimeout(raum.olymp.uhr); if (olympRaeume.get(raum.olymp.schluessel) === raum.code) olympRaeume.delete(raum.olymp.schluessel); }
  }
  function uebernehmen(m, alt, raum) {
    if (alt.transport && alt.transport !== m.transport) { const tr = alt.transport; alt.transport = null; try { tr.close && tr.close(); } catch (_) { /* egal */ } }
    alt.transport = m.transport; alt.weg = 0;
    m.ersetzt = alt;
    senden(alt, { t:'du', id:alt.id, token:alt.token });
    if (raum.phase === 'spiel' && raum.art === 'koop' && !raum.spiel.spieler.has(alt.id)) raum.spiel.spielerHinzu(alt.id, alt.name, alt.tier);
    hostPruefen(raum);
    raumSenden(raum);
    olympPruefen(raum);
  }

  /* ---------- Spiel starten ---------- */
  function koopStarten(raum, gericht) {
    raum.gericht = LK.STARTGERICHTE.includes(gericht) ? gericht : raum.gericht;
    raum.spiel = new LK.Spiel({ seed:seed(), start:raum.gericht });
    for (const m of online(raum)) raum.spiel.spielerHinzu(m.id, m.name, m.tier);
    raum.phase = 'spiel';
    raumSenden(raum);
  }

  /* ---------- Olympiade ---------- */
  function olympStatus(raum) {
    const o = raum.olymp; if (!o || !olymp || o.gemeldet) return;
    const da = online(raum).map(m => m.olympId).filter(Boolean);
    const schluessel = da.join(',') + raum.phase;
    if (schluessel === o.letzterStatus && jetzt() - (o.statusZeit || 0) < 20_000) return;
    o.letzterStatus = schluessel; o.statusZeit = jetzt();
    olymp.status(o.t, da, raum.phase === 'lobby' ? 'warten' : 'laeuft');
  }
  function olympPruefen(raum) {
    const o = raum.olymp; if (!o || o.gestartet || raum.phase !== 'lobby') return;
    const da = online(raum).map(m => m.olympId);
    let ziel = 0;
    if (da.length) {
      ziel = o.spaetestens;
      if (o.t.m.every(e => da.includes(e.s))) ziel = Math.min(ziel, o.uhr && o.startBis < o.spaetestens ? o.startBis : jetzt() + Z.countdown);
    }
    if (ziel === o.startBis && (o.uhr || !ziel)) return;
    clearTimeout(o.uhr); o.uhr = null; o.startBis = 0;
    if (ziel) {
      o.startBis = ziel;
      o.uhr = setTimeout(() => { o.uhr = null; if (liste.get(raum.code) === raum && raum.phase === 'lobby') olympStarten(raum); }, Math.max(0, ziel - jetzt()));
      o.uhr.unref?.();
    }
    raumSenden(raum);
  }
  function olympStarten(raum) {
    const o = raum.olymp;
    o.gestartet = true; o.startBis = 0;
    const s = o.seed;
    for (const m of online(raum)) {
      m.kueche = new LK.Spiel({ seed:s, modus:'rush', dauer:o.dauer, menu:o.menu });
      m.kueche.spielerHinzu(m.id, m.name, m.tier);
    }
    raum.phase = 'spiel';
    raumSenden(raum);
  }
  function olympRangliste(raum) {
    return mitglieder(raum).filter(m => m.kueche).map(m => ({ id:m.id, n:m.name, m:m.kueche.verdient, b:m.kueche.bedient, fertig:m.kueche.phase === 'ende' }))
      .sort((a, b) => b.m - a.m || b.b - a.b);
  }
  function olympEnde(raum) {
    const o = raum.olymp;
    raum.phase = 'ende';
    const rang = olympRangliste(raum);
    for (const m of raum.mitglieder.values()) senden(m, { t:'olympEnde', rang });
    raumSenden(raum);
    if (!o.gemeldet) {
      o.gemeldet = true;
      olymp && olymp.rangMelden(o.t, rang.map(r => {
        const m = raum.mitglieder.get(r.id);
        return { s:m && m.olympId, wert:r.m, text:`${r.m} Münzen · ${r.b} Gäste` };
      }).filter(x => x.s));
    }
  }
  function olympBeitreten(m, ticket) {
    const t = olymp && olymp.ticketPruefen(ticket);
    if (!t) return senden(m, { t:'fehler', text:'Das Olympia-Ticket ist ungültig oder abgelaufen. Geh zurück zur Olympiade.', olymp:true });
    const schluessel = t.l + ':' + t.g;
    let raum = liste.get(olympRaeume.get(schluessel));
    m.olympId = t.s; m.name = nameOk(t.n) || 'Koch';
    if (raum) {
      const alt = mitglieder(raum).find(x => x.olympId === t.s && x !== m);
      if (alt) { if (m.raum) verlassen(m); return uebernehmen(m, alt, raum); }
      if (raum.phase !== 'lobby') return senden(m, { t:'fehler', text:'Deine Gruppe kocht schon ohne dich.', olymp:true, zurueck:t.z || null });
    } else {
      const menu = OLYMP_MENUS[t.c && t.c.menu] || OLYMP_MENUS.einfach;
      const dauer = OLYMP_DAUER.includes(Number(t.c && t.c.dauer)) ? Number(t.c.dauer) : 240;
      // Gleicher Ansturm für alle in allen Vorläufen dieser Disziplin: Seed aus der Lauf-Kennung
      const s = crypto.createHash('sha256').update('lk:' + t.l).digest().readUInt32LE(0);
      raum = raumErstellen('olymp', { t, schluessel, menu, dauer, seed:s, gestartet:false, gemeldet:false, uhr:null, startBis:0, spaetestens:jetzt() + Z.warten });
      if (!raum) return senden(m, { t:'fehler', text:'Gerade sind zu viele Räume offen. Versuch es gleich nochmal.' });
      olympRaeume.set(schluessel, raum.code);
    }
    if (raum.mitglieder.size >= MAX_OLYMP) return senden(m, { t:'fehler', text:'Die Gruppe ist voll.' });
    beitreten(m, raum);
  }

  /* ---------- Verbindungen ---------- */
  function verbinden(transport) {
    const m0 = { id:'k' + (naechsteId++), token:crypto.randomBytes(12).toString('hex'), name:'', tier:'loewe', raum:null, transport, weg:0, zaehler:0, fenster:jetzt() };
    senden(m0, { t:'du', id:m0.id, token:m0.token });
    const ich = () => m0.ersetzt || m0;
    function nachricht(text) {
      const m = ich();
      const j = jetzt();
      if (j - m0.fenster > 1000) { m0.fenster = j; m0.zaehler = 0; }
      if (++m0.zaehler > 80) return;
      let d; try { d = JSON.parse(text); } catch (_) { return; }
      if (!d || typeof d.t !== 'string') return;
      const raum = m.raum;
      const fehler = t => senden(m, { t:'fehler', text:t });
      if (raum && SPIEL_BEFEHLE.has(d.t)) {
        if (raum.phase !== 'spiel') return;
        if (raum.art === 'koop') raum.spiel.befehl(m.id, d);
        else if (m.kueche) m.kueche.befehl(m.id, d);
        return;
      }
      switch (d.t) {
        case 'hallo': {
          m.tier = tierOk(d.tier);
          if (!m.olympId) { const n = nameOk(d.name); if (n) m.name = n; }
          if (typeof d.token === 'string' && d.code && !raum) {
            const r = liste.get(String(d.code).toUpperCase());
            const alt = r && mitglieder(r).find(x => x.token === d.token);
            if (alt) return uebernehmen(m0, alt, r);
            return senden(m, { t:'raum', code:null, phase:'aus' });
          }
          if (raum) raumSenden(raum);
          return;
        }
        case 'erstellen': {
          if (!m.name) return fehler('Gib zuerst deinen Namen ein.');
          const neu = raumErstellen('koop');
          if (!neu) return fehler('Gerade sind zu viele Räume offen. Versuch es später nochmal.');
          return beitreten(m, neu);
        }
        case 'beitreten': {
          if (!m.name) return fehler('Gib zuerst deinen Namen ein.');
          const ziel = liste.get(String(d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
          if (!ziel || ziel.olymp) return fehler('Diese Küche gibt es nicht. Stimmt der Code?');
          if (ziel === raum) return raumSenden(raum);
          if (ziel.mitglieder.size >= LK.MAX_SPIELER) return fehler('Die Küche ist voll (4 Köche).');
          if (ziel.phase === 'ende') return fehler('In dieser Küche ist gerade Feierabend.');
          return beitreten(m, ziel);
        }
        case 'olymp': return olympBeitreten(m, d.ticket);
        case 'verlassen': verlassen(m); return senden(m, { t:'raum', code:null, phase:'aus' });
      }
      if (!raum) return;
      const istHost = raum.host === m.id;
      switch (d.t) {
        case 'gericht':
          if (!istHost || raum.phase !== 'lobby' || raum.olymp || !LK.STARTGERICHTE.includes(d.g)) return;
          raum.gericht = d.g; return raumSenden(raum);
        case 'start':
          if (!istHost || raum.phase !== 'lobby' || raum.olymp) return;
          return koopStarten(raum, d.g);
        case 'nochmal':
          // Nach Feierabend zurück in die Vorbereitung
          if (!istHost || raum.olymp || !(raum.phase === 'spiel' && raum.spiel.phase === 'ende')) return;
          raum.phase = 'lobby'; raum.spiel = null;
          for (const x of mitglieder(raum)) if (!x.transport) raum.mitglieder.delete(x.id);
          return raumSenden(raum);
      }
    }
    return { nachricht, getrennt:() => { const m = ich(); if (m.transport === transport) getrennt(m); }, mitglied:m0 };
  }

  /* ---------- Takt (20 Hz) ---------- */
  function takt() {
    takte++;
    const j = jetzt();
    const senden10 = takte % SENDE_JEDE === 0;
    for (const raum of liste.values()) {
      if (raum.phase !== 'spiel') continue;
      if (raum.art === 'koop') {
        const sp = raum.spiel;
        // Lange getrennte Köche verlassen die Küche (sonst blockieren sie "Bereit"); beim Wiederkommen sind sie wieder da
        for (const m of raum.mitglieder.values()) if (!m.transport && m.weg && j - m.weg > Z.weg && sp.spieler.has(m.id)) sp.spielerWeg(m.id);
        sp.schritt();
        if (senden10) {
          const text = JSON.stringify({ t:'s', s:sp.sicht() });
          for (const m of raum.mitglieder.values()) senden(m, text);
        }
      } else {
        let alleFertig = true, kuechen = 0;
        for (const m of raum.mitglieder.values()) {
          if (!m.kueche) continue;
          kuechen++;
          m.kueche.schritt();
          if (m.kueche.phase !== 'ende') alleFertig = false;
          if (senden10) senden(m, { t:'s', s:m.kueche.sicht() });
        }
        if (takte % 20 === 0) {
          const rang = olympRangliste(raum);
          for (const m of raum.mitglieder.values()) senden(m, { t:'rang', rang });
        }
        if (alleFertig || !kuechen) olympEnde(raum);
      }
    }
    if (takte % 200 === 0) aufraeumenAlt();
  }
  function aufraeumenAlt() {
    const j = jetzt();
    for (const raum of [...liste.values()]) {
      if (online(raum).length) { raum.zuletzt = j; continue; }
      if (j - raum.zuletzt > Z.leer) aufraeumen(raum);
    }
  }

  return { verbinden, takt, aufraeumenAlt, liste, _raeume:liste };
}

module.exports = { raeume, OLYMP_MENUS, OLYMP_DAUER, TIERE };
