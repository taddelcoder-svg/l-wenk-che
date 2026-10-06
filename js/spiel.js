/* Löwenküche – Browser: Darstellung, Eingabe, Solo und Online (Koop, Olympiade), Menüs.
   Solo rechnet js/logik.js direkt hier; online rechnet der Server und schickt 10-mal pro Sekunde die Sicht.
   Die eigene Figur bewegt sich immer sofort im Browser (gleiche Kollision wie im Spiel) und meldet ihre Position. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = t => String(t).replace(/[&<>"]/g, z => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[z]));
  const { W, H, TUER_X } = LK;

  /* ---------- Profil und Fortschritt (nur im eigenen Browser) ---------- */
  const TIERE = [
    { id:'loewe', e:'🦁', n:'Löwe' }, { id:'pinguin', e:'🐧', n:'Pinguin' }, { id:'waschbaer', e:'🦝', n:'Waschbär' },
    { id:'fuchs', e:'🦊', n:'Fuchs' }, { id:'baer', e:'🐻', n:'Bär' }, { id:'hase', e:'🐰', n:'Hase' }
  ];
  const tierEmoji = id => (TIERE.find(t => t.id === id) || TIERE[0]).e;
  const FREI = { salat:0, burger:0, steak:150, pommes:400 };   // Startgerichte nach Erfahrung
  const FARBEN = [0xe0533f, 0x3f7fd9, 0x48a85a, 0xe0a42d];
  const speicher = {
    lesen(k, std) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? std : v; } catch (_) { return std; } },
    schreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* privat */ } }
  };
  const sitzung = {
    lesen(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (_) { return null; } },
    schreiben(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* privat */ } },
    weg(k) { try { sessionStorage.removeItem(k); } catch (_) { /* egal */ } }
  };
  const profil = Object.assign({ name:'', tier:'loewe' }, speicher.lesen('lk-profil', {}));
  const fortschritt = Object.assign({ xp:0, laeufe:0, siege:0, besterTag:0, rekord:0 }, speicher.lesen('lk-fortschritt', {}));
  const profilSpeichern = () => speicher.schreiben('lk-profil', profil);

  /* ---------- three.js ---------- */
  const leinwand = $('#bild');
  const renderer = new THREE.WebGLRenderer({ canvas:leinwand, antialias:true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const szene = new THREE.Scene();
  const himmelTag = new THREE.Color(0xbfe3f5), himmelNacht = new THREE.Color(0x1b2140);
  szene.background = himmelTag.clone();
  const kamera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  const halb = new THREE.HemisphereLight(0xfff6e8, 0x8a7a66, 0.75);
  szene.add(halb);
  const sonne = new THREE.DirectionalLight(0xfff1d8, 0.75);
  sonne.position.set(W / 2 - 6, 18, H / 2 + 8);
  sonne.target.position.set(W / 2, 0, H / 2);
  sonne.castShadow = true;
  sonne.shadow.mapSize.set(2048, 2048);
  Object.assign(sonne.shadow.camera, { left:-12, right:12, top:12, bottom:-12, near:2, far:50 });
  sonne.shadow.bias = -0.0008;
  szene.add(sonne, sonne.target);
  const lampen = [];
  for (const [x, z] of [[4, 3], [10, 3], [4, 8], [10, 8]]) {
    const l = new THREE.PointLight(0xffc77a, 0, 9, 1.6);
    l.position.set(x, 3, z);
    szene.add(l); lampen.push(l);
  }
  szene.add(LKM.raum(W, H, TUER_X));

  function kameraSetzen() {
    const a = innerWidth / innerHeight;
    renderer.setSize(innerWidth, innerHeight, false);
    kamera.aspect = a;
    // Abstand so, dass Breite und Tiefe des Raums ins Bild passen; im Hochformat steiler von oben
    const hoch = a < 1;
    const tv = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2)), th = tv * a;
    const dBreite = (W / 2 + 0.2) / th, dTiefe = (H / 2 + 0.6) * (hoch ? 0.62 : 0.84) / tv;
    const d = Math.max(dBreite, dTiefe);
    const [ry, rz] = hoch ? [0.93, 0.37] : [0.84, 0.55];
    const mitte = new THREE.Vector3(W / 2, 0, H / 2 + (hoch ? -2.4 : 0.2));
    kamera.position.set(mitte.x, d * ry, mitte.z + d * rz);
    kamera.lookAt(mitte);
    kamera.updateProjectionMatrix();
  }
  addEventListener('resize', kameraSetzen);
  kameraSetzen();

  /* ---------- Zustand ---------- */
  let modus = 'menue';          // 'menue' | 'solo' | 'netz'
  let schirm = null;
  let sicht = null, meineId = null;
  let solo = null;              // { spiel, acc, pausiert, gericht }
  let demo = null;
  const ich = { x:0, y:0, r:0, w:false, da:false };
  const netz = { ws:null, soll:false, versuch:0, raum:null, id:null, token:null, ticket:null, ausstehend:null, letztP:0, rang:null, olympEnde:null, startBis:0 };
  let belegt = new Set();
  let endeGezeigt = false, kartenGezeigt = null;

  /* ---------- Ansicht: Geräte, Köche, Gäste ---------- */
  const ansicht = { geraete:new Map(), koeche:new Map(), gaeste:new Map(), texte:[] };
  const markierung = LKM.markierung(); markierung.visible = false; szene.add(markierung);
  const HOEHE = { theke:0.93, brett:0.97, herd:0.93, ofen:1.16, fritteuse:0.93, fliessband:0.87, spuele:0.93, spuelmaschine:0.93, tellerregal:0.93, kiste:0.62, muell:0.82, tisch:0.78, greifarm:0.6 };

  function ansichtLeeren() {
    for (const e of ansicht.geraete.values()) { szene.remove(e.grp); if (e.balken) szene.remove(e.balken); }
    for (const e of ansicht.koeche.values()) szene.remove(e.grp);
    for (const e of ansicht.gaeste.values()) { szene.remove(e.grp); if (e.balken) szene.remove(e.balken); }
    for (const t of ansicht.texte) szene.remove(t.s);
    ansicht.geraete.clear(); ansicht.koeche.clear(); ansicht.gaeste.clear(); ansicht.texte = [];
  }
  function kinderLeeren(g) { while (g.children.length) g.remove(g.children[0]); }

  function inhaltSchluessel(o) { return [LKM.dingSchluessel(o.it), o.n, o.d, o.sb].join('|'); }
  function inhaltBauen(e, o) {
    const ziel = e.grp.inhalt;
    kinderLeeren(ziel);
    if (o.it) ziel.add(LKM.ding(o.it));
    if (o.t === 'tellerregal' && o.n > 0) ziel.add(LKM.ding({ z:'stapel', n:Math.min(o.n, 10) }));
    if ((o.t === 'spuele' || o.t === 'spuelmaschine')) {
      if (o.d > 0) { const m = LKM.ding({ z:'dreck', n:Math.min(o.d, 8) }); m.position.x = -0.15; ziel.add(m); }
      if (o.sb > 0) { const m = LKM.ding({ z:'stapel', n:Math.min(o.sb, 8) }); m.position.x = 0.28; m.position.z = 0.2; ziel.add(m); }
    }
    if (o.t === 'tisch' && o.d > 0) ziel.add(LKM.ding({ z:'dreck', n:Math.min(o.d, 8) }));
  }

  function geraeteAbgleichen(s) {
    const da = new Set();
    for (const o of s.g) {
      da.add(o.i);
      let e = ansicht.geraete.get(o.i);
      if (!e || e.t !== o.t || e.r !== o.r) {
        if (e) { szene.remove(e.grp); if (e.balken) szene.remove(e.balken); }
        e = { grp:LKM.geraet(o), t:o.t, r:o.r, key:null, balken:null };
        szene.add(e.grp);
        ansicht.geraete.set(o.i, e);
      }
      e.grp.position.set(o.x + 0.5, 0, o.y + 0.5);
      e.o = o;
      const k = inhaltSchluessel(o);
      if (k !== e.key) { e.key = k; inhaltBauen(e, o); }
      // Fortschritt: Schneiden, Garen, Spülen – und Warnung, wenn etwas anbrennt
      let f = null, farbe = 0x6ad04a;
      if (o.it && o.it.s != null) f = o.it.s;
      else if (o.it && o.it.k != null) { if (o.it.b) { if (o.it.k > 0.3) { f = o.it.k; farbe = 0xe0453a; } } else f = o.it.k; }
      else if (o.f > 0 && o.d > 0) { f = o.f; farbe = 0x4aa8e0; }
      if (f != null) {
        if (!e.balken) { e.balken = LKM.balken(); szene.add(e.balken); }
        e.balken.visible = true;
        e.balken.position.set(o.x + 0.5, (HOEHE[o.t] || 0.9) + 0.65, o.y + 0.5);
        e.balken.setzen(f, farbe);
        e.brennt = !!(o.it && o.it.b && o.it.k > 0.3);
      } else if (e.balken) { e.balken.visible = false; e.brennt = false; }
    }
    for (const [i, e] of ansicht.geraete) if (!da.has(i)) { szene.remove(e.grp); if (e.balken) szene.remove(e.balken); ansicht.geraete.delete(i); }
  }

  function koecheAbgleichen(s) {
    const da = new Set();
    for (const p of s.s) {
      da.add(p.i);
      let e = ansicht.koeche.get(p.i);
      if (!e || e.a !== p.a) {
        if (e) szene.remove(e.grp);
        const grp = LKM.koch(p.a, FARBEN[p.f % 4]);
        const schild = LKM.textSprite(p.n, { gr:40, grund:'rgba(43,29,22,.72)', rand:8, hoehe:0.34 });
        schild.position.y = 1.62;
        grp.add(schild);
        e = { grp, a:p.a, x:p.x, y:p.y, r:p.r, hKey:'', trKey:'', tempo:0 };
        szene.add(grp);
        ansicht.koeche.set(p.i, e);
      }
      e.p = p;
      const hk = LKM.dingSchluessel(p.h);
      if (hk !== e.hKey) { e.hKey = hk; kinderLeeren(e.grp.hand); if (p.h) e.grp.hand.add(LKM.ding(p.h)); }
      const tk = p.tr ? p.tr.t + (p.tr.z || '') : '';
      if (tk !== e.trKey) {
        e.trKey = tk;
        if (e.trMesh) { e.grp.remove(e.trMesh); e.trMesh = null; }
        if (p.tr) { const m = LKM.geraet({ t:p.tr.t, r:1, z:p.tr.z }); m.scale.setScalar(0.62); m.position.set(0, 0.62, 0.42); e.grp.add(m); e.trMesh = m; }
      }
    }
    for (const [i, e] of ansicht.koeche) if (!da.has(i)) { szene.remove(e.grp); ansicht.koeche.delete(i); }
  }

  function gaesteAbgleichen(s) {
    const da = new Set();
    for (const k of s.k) {
      da.add(k.i);
      let e = ansicht.gaeste.get(k.i);
      if (!e) {
        e = { grp:LKM.gast(k.a, k.fa), x:k.x, y:k.y, r:k.r, b:null, blase:null, sv:null, teller:null, balken:null };
        szene.add(e.grp);
        ansicht.gaeste.set(k.i, e);
      }
      e.k = k;
      if (k.b !== e.b) {
        if (e.blase) e.grp.remove(e.blase);
        e.blase = k.b ? LKM.blase(k.b) : null;
        if (e.blase) { e.blase.position.y = 1.55; e.grp.add(e.blase); }
        e.b = k.b;
      }
      if (k.sv !== e.sv) {
        if (e.teller) e.grp.remove(e.teller);
        e.teller = null;
        if (k.sv && k.p === 'isst' || k.sv && k.p === 'bestellt') {
          const t = LKM.ding({ z:'teller', auf:LK.GERICHTE[k.sv].teile.slice() });
          t.scale.setScalar(1 / 0.82);
          t.position.set(0, 0.57, 0.37);
          e.grp.add(t); e.teller = t;
        }
        e.sv = k.sv;
      }
      if (k.gd != null) {
        if (!e.balken) { e.balken = LKM.balken(); szene.add(e.balken); }
        e.balken.visible = true;
        const g = k.gd;
        e.balken.setzen(g, g > 0.5 ? 0x6ad04a : g > 0.25 ? 0xf2c230 : 0xe0453a);
      } else if (e.balken) e.balken.visible = false;
    }
    for (const [i, e] of ansicht.gaeste) if (!da.has(i)) { szene.remove(e.grp); if (e.balken) szene.remove(e.balken); ansicht.gaeste.delete(i); }
  }

  function schwebeText(text, x, y, farbe = '#fff') {
    const s = LKM.textSprite(text, { gr:44, kontur:'#2b1d16', farbe, hoehe:0.42 });
    s.position.set(x, 1.6, y);
    szene.add(s);
    ansicht.texte.push({ s, t:0 });
  }

  const winkel = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  function ansichtBewegen(dt, t) {
    const k = 1 - Math.exp(-dt * 14);
    for (const [id, e] of ansicht.koeche) {
      const p = e.p;
      const eigen = id === meineId && ich.da;
      const zx = eigen ? ich.x : p.x, zy = eigen ? ich.y : p.y, zr = eigen ? ich.r : p.r;
      const vx = e.x, vy = e.y;
      if (eigen) { e.x = zx; e.y = zy; } else { e.x += (zx - e.x) * k; e.y += (zy - e.y) * k; }
      e.r += winkel(e.r, zr) * Math.min(1, dt * 16);
      const tempo = Math.hypot(e.x - vx, e.y - vy) / Math.max(dt, 1e-3);
      e.tempo += (tempo - e.tempo) * Math.min(1, dt * 10);
      e.grp.position.set(e.x, 0, e.y);
      e.grp.rotation.y = Math.PI / 2 - e.r;
      e.grp.animieren(dt, Math.min(1.5, e.tempo / 4), !!(p.h || p.tr), eigen ? ich.w : p.w, t);
    }
    for (const e of ansicht.gaeste.values()) {
      const g = e.k;
      const sitzt = g.p === 'denkt' || g.p === 'bestellt' || g.p === 'isst';
      const vx = e.x, vy = e.y;
      e.x += (g.x - e.x) * k; e.y += (g.y - e.y) * k;
      e.r += winkel(e.r, g.r) * Math.min(1, dt * 10);
      const tempo = Math.hypot(e.x - vx, e.y - vy) / Math.max(dt, 1e-3);
      e.grp.position.set(e.x, sitzt ? 0.3 : 0, e.y);
      e.grp.rotation.y = Math.PI / 2 - e.r;
      e.grp.animieren(dt, sitzt ? 0 : Math.min(1.5, tempo / 2), false, g.p === 'isst', t);
      if (e.blase) e.blase.position.y = 1.55 + Math.sin(t * 3 + e.x) * 0.04;
      if (e.balken && e.balken.visible) e.balken.position.set(e.x, (sitzt ? 0.3 : 0) + 1.95, e.y);
      if (g.p === 'isst') e.grp.kopf.rotation.x = Math.sin(t * 10) * 0.12; else e.grp.kopf.rotation.x = 0;
    }
    for (const e of ansicht.geraete.values()) {
      if (e.balken && e.balken.visible) {
        e.balken.quaternion.copy(kamera.quaternion);
        if (e.brennt) e.balken.visible = Math.sin(t * 16) > -0.3;
      }
      if (e.grp.anim) e.grp.anim(t);
    }
    for (const e of ansicht.gaeste.values()) if (e.balken) e.balken.quaternion.copy(kamera.quaternion);
    for (const x of ansicht.texte) { x.t += dt; x.s.position.y += dt * 0.9; x.s.material.opacity = Math.max(0, 1 - x.t / 1.4); }
    ansicht.texte = ansicht.texte.filter(x => { if (x.t < 1.4) return true; szene.remove(x.s); return false; });
    // Zielmarkierung der eigenen Figur
    markierung.visible = false;
    if (ich.da && sicht && sicht.ph !== 'ende' && modus !== 'menue') {
      const [tx, ty] = LK.zielKachel(ich.x, ich.y, ich.r);
      const o = sicht.g.find(g => g.x === tx && g.y === ty);
      const meiner = sicht.s.find(p => p.i === meineId);
      if (o) { markierung.visible = true; markierung.position.set(tx + 0.5, (HOEHE[o.t] || 0.9) + 0.02, ty + 0.5); markierung.children.forEach(c => c.material.color.setHex(0xffffff)); }
      else if (sicht.ph === 'nacht' && meiner && meiner.tr) {
        markierung.visible = true; markierung.position.set(tx + 0.5, 0.03, ty + 0.5);
        const ok = LK.innen(tx, ty) && !(tx === TUER_X && ty === H - 2);
        markierung.children.forEach(c => c.material.color.setHex(ok ? 0x7cff7c : 0xff6a5a));
      }
    }
    // Tag und Nacht
    const nacht = sicht && sicht.ph === 'nacht' && modus !== 'menue' ? 1 : 0;
    licht += (nacht - licht) * Math.min(1, dt * 2);
    szene.background.copy(himmelTag).lerp(himmelNacht, licht);
    halb.intensity = 0.75 - licht * 0.35;
    sonne.intensity = 0.75 - licht * 0.55;
    for (const l of lampen) l.intensity = licht * 0.9;
  }
  let licht = 0;

  /* ---------- Neue Sicht verarbeiten ---------- */
  function sichtNeu(s) {
    sicht = s;
    belegt = new Set(s.g.map(g => g.x + ',' + g.y));
    geraeteAbgleichen(s);
    koecheAbgleichen(s);
    gaesteAbgleichen(s);
    const meiner = s.s.find(p => p.i === meineId);
    if (meiner && (!ich.da || Math.hypot(meiner.x - ich.x, meiner.y - ich.y) > 1.8)) { ich.x = meiner.x; ich.y = meiner.y; ich.r = meiner.r; ich.da = true; }
    if (!meiner) ich.da = false;
    for (const e of s.ev || []) ereignis(e);
    hudAktualisieren();
  }
  function ereignis(e) {
    switch (e.e) {
      case 'nimm': Ton.nimm(); break;
      case 'leg': case 'muell': case 'gespuelt': Ton.leg(); break;
      case 'hack': Ton.hack(); break;
      case 'geschnitten': Ton.fertig(); break;
      case 'gar': Ton.gar(); break;
      case 'verbrannt': Ton.verbrannt(); schwebeText('🔥', e.x, e.y); break;
      case 'muenzen': Ton.muenzen(); schwebeText('+' + e.n + ' 🪙', e.x, e.y, '#ffd65a'); break;
      case 'aerger': Ton.aerger(); schwebeText(sicht && sicht.mo === 'rush' ? '😠 −5' : '😠 −★', e.x, e.y, '#ff8a7a'); break;
      case 'serviert': Ton.serviert(); break;
      case 'bestellt': Ton.bestellt(); break;
      case 'kauf': case 'karte': Ton.kauf(); break;
      case 'dreh': Ton.klick(); break;
      case 'tag': Ton.tag(); meldung(sicht && sicht.mo === 'rush' ? 'Los!' : 'Tag ' + sicht.tag, 'Die Türen sind offen!'); break;
      case 'nacht': Ton.nacht(); meldung('Feierabend!', 'Zeit zum Umbauen und Einkaufen'); break;
      case 'ende': if (e.sieg) Ton.sieg(); break;
    }
  }

  /* ---------- HUD ---------- */
  let meldungUhr = 0;
  function meldung(gross, klein, ms = 2200) {
    const m = $('#meldung');
    m.innerHTML = esc(gross) + (klein ? `<small>${esc(klein)}</small>` : '');
    m.style.opacity = 1;
    clearTimeout(meldungUhr);
    meldungUhr = setTimeout(() => { m.style.opacity = 0; }, ms);
  }
  let hinweisUhr = 0, letzterHinweis = '';
  function hinweis(text, ms = 2600) {
    const h = $('#hinweis');
    h.textContent = text; h.style.opacity = 1;
    clearTimeout(hinweisUhr);
    hinweisUhr = setTimeout(() => { h.style.opacity = 0; }, ms);
  }
  const zeitText = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const ladenBild = { theke:'🟫', brett:'🔪', herd:'🍳', ofen:'🔥', fritteuse:'🍟', fliessband:'➡️', spuele:'🚰', spuelmaschine:'🫧', tellerregal:'🍽️', muell:'🗑️', tisch:'🪑', greifarm:'🦾' };

  function hudAktualisieren() {
    const s = sicht;
    if (!s || modus === 'menue') return;
    const rush = s.mo === 'rush';
    $('#hudTag').textContent = rush ? (s.ph === 'tag' ? `Olympia · ${zeitText(s.zeit)}` : 'Olympia') : s.ph === 'tag' ? `Tag ${s.tag} / ${s.tage}` : s.ph === 'nacht' ? `Nacht · vor Tag ${s.tag}` : 'Feierabend';
    $('#hudUhr').style.width = (s.ph === 'tag' && s.dauer ? (1 - s.zeit / s.dauer) * 100 : 0) + '%';
    $('#hudMenu').textContent = s.menu.map(g => LKM.BILD[g]).join(' ');
    $('#hudMuenzen').textContent = rush ? s.vd : s.m;
    $('#hudSterne').textContent = rush ? `🧑‍🤝‍🧑 ${s.bd}` : '★'.repeat(Math.max(0, s.st)) + '☆'.repeat(Math.max(0, LK.STERNE - s.st));
    if (s.me && s.me !== letzterHinweis) hinweis(s.me);
    letzterHinweis = s.me;
    // Nacht-Panel
    const nachtZeigen = s.ph === 'nacht' && !rush && !s.ka;
    $('#nacht').hidden = !nachtZeigen;
    if (nachtZeigen) {
      $('#nachtTitel').textContent = s.tag === 1 ? 'Vor dem ersten Tag' : `Nacht vor Tag ${s.tag}`;
      const an = s.an || [];
      const schl = an.map(a => a.t + a.weg + (s.m >= a.preis)).join() + s.m;
      if (schl !== $('#laden').dataset.s) {
        $('#laden').dataset.s = schl;
        $('#laden').innerHTML = an.map((a, i) => `<button data-kauf="${i}" class="${a.weg ? 'weg' : ''}" ${a.weg || s.m < a.preis ? 'disabled' : ''}><span class="ico">${ladenBild[a.t] || '📦'}</span>${esc(LK.GERAETE[a.t].n)}<br>${a.weg ? 'gekauft' : a.preis + ' 🪙'}</button>`).join('');
        for (const b of $$('#laden [data-kauf]')) b.onclick = () => { Ton.klick(); befehl({ t:'kaufen', i:Number(b.dataset.kauf) }); };
      }
      $('#tellerKnopf').textContent = `+${LK.TELLER_PAKET} Teller · ${LK.TELLER_PREIS} 🪙`;
      $('#tellerKnopf').disabled = s.m < LK.TELLER_PREIS;
      $('#wuerfelKnopf').textContent = `Neue Angebote · ${LK.WUERFEL_PREIS} 🪙`;
      $('#wuerfelKnopf').disabled = s.m < LK.WUERFEL_PREIS;
      const bereit = s.be.includes(meineId);
      const mehrere = s.s.length > 1;
      $('#bereitKnopf').setAttribute('aria-pressed', String(bereit));
      $('#bereitKnopf').textContent = mehrere ? (bereit ? 'Bereit ✓ (zurücknehmen)' : 'Bereit') : 'Küche öffnen';
      $('#bereitWer').textContent = mehrere ? `Bereit: ${s.be.length} / ${s.s.length}` + (s.be.length ? ' – ' + s.s.filter(p => s.be.includes(p.i)).map(p => p.n).join(', ') : '') : `${s.tz} Teller · Rezepte: ${s.menu.map(g => LK.GERICHTE[g].n).join(', ')}`;
    }
    // Karten
    if (s.ph === 'nacht' && s.ka) {
      const schl = JSON.stringify(s.ka);
      if (kartenGezeigt !== schl) { kartenGezeigt = schl; kartenZeigen(s.ka); }
    } else if (schirm === 'karten') { kartenGezeigt = null; zeige(null); }
    // Ende
    if (s.ph === 'ende' && !endeGezeigt) { endeGezeigt = true; setTimeout(endeZeigen, 1200); }
    $('#tArbeitText').textContent = s.ph === 'nacht' ? 'Drehen' : 'Arbeit';
  }
  $('#bereitKnopf').onclick = () => { Ton.klick(); befehl({ t:'bereit', v:!(sicht && sicht.be.includes(meineId)) }); };
  $('#tellerKnopf').onclick = () => { Ton.klick(); befehl({ t:'teller' }); };
  $('#wuerfelKnopf').onclick = () => { Ton.klick(); befehl({ t:'wuerfeln' }); };
  $('#nachtZu').onclick = () => { $('#nacht').classList.toggle('zu'); $('#nachtZu').textContent = $('#nacht').classList.contains('zu') ? '+' : '–'; };

  function kartenZeigen(karten) {
    const darf = modus === 'solo' || !netz.raum || netz.raum.host === meineId;
    const hostName = netz.raum ? ((netz.raum.mitglieder.find(m => m.id === netz.raum.host) || {}).name || 'Der Gastgeber') : '';
    $('#kartenText').textContent = darf ? 'Wähle eine Karte für die nächsten Tage.' : `${hostName} wählt eine Karte …`;
    $('#kartenWahl').innerHTML = karten.map((k, i) => {
      if (k.art === 'gericht') {
        const G = LK.GERICHTE[k.id];
        const neu = G.geraete.filter(t => !sicht.g.some(g => g.t === t));
        return `<button data-karte="${i}" ${darf ? '' : 'disabled'}><span class="ico">${LKM.BILD[k.id]}</span><b>${esc(G.n)}</b><small>Neues Gericht für ${G.preis} 🪙. Zutaten: ${G.kisten.map(z => LK.DINGE[z].n).join(', ')}${neu.length ? ' · bringt ' + neu.map(t => LK.GERAETE[t].n).join(', ') + ' mit' : ''}</small></button>`;
      }
      const M = LK.MODS[k.id];
      return `<button data-karte="${i}" ${darf ? '' : 'disabled'}><span class="ico">${{ ansturm:'🏃', eilig:'⏱️', familien:'👨‍👩‍👧‍👦', feinschmecker:'🎩' }[k.id]}</span><b>${esc(M.n)}</b><small>${esc(M.text)}</small></button>`;
    }).join('');
    for (const b of $$('#kartenWahl [data-karte]')) b.onclick = () => { Ton.kauf(); befehl({ t:'karte', i:Number(b.dataset.karte) }); };
    zeige('karten');
  }

  function endeZeigen() {
    const s = sicht;
    if (!s || !s.er) return;
    const er = s.er;
    const rush = s.mo === 'rush';
    $('#endeOlymp').hidden = true;
    $('#endeRang').hidden = true;
    if (rush) {
      $('#endeBild').textContent = '🏅';
      $('#endeTitel').textContent = 'Schicht vorbei!';
      $('#endeText').textContent = netz.olympEnde ? '' : 'Warte auf die anderen Küchen …';
      $('#endeStatistik').innerHTML = `<div><b>${er.verdient}</b>Münzen</div><div><b>${er.bedient}</b>Gäste</div><div><b>${er.veraergert}</b>verärgert</div>`;
      $('#endeFreischalt').textContent = '';
      $('#endeNochmal').hidden = true; $('#endeMenue').hidden = true;
      if (netz.olympEnde) olympEndeZeigen();
      zeige('ende');
      return;
    }
    $('#endeBild').textContent = er.sieg ? '🏆' : '🍳';
    $('#endeTitel').textContent = er.sieg ? 'Kultrestaurant!' : 'Die Küche schließt';
    $('#endeText').textContent = er.sieg ? `Ihr habt alle ${LK.TAGE} Tage geschafft.` : `Ihr habt bis Tag ${er.tag} durchgehalten.`;
    $('#endeStatistik').innerHTML = `<div><b>${er.tag}</b>Tage</div><div><b>${er.verdient}</b>Münzen</div><div><b>${er.bedient}</b>Gäste</div>`;
    // Erfahrung sammeln und Startgerichte freischalten
    const vorher = fortschritt.xp;
    const xp = Math.round(er.verdient / 2 + er.tag * 15 + (er.sieg ? 150 : 0));
    fortschritt.xp += xp; fortschritt.laeufe++; if (er.sieg) fortschritt.siege++;
    fortschritt.besterTag = Math.max(fortschritt.besterTag, er.tag);
    fortschritt.rekord = Math.max(fortschritt.rekord, er.verdient);
    speicher.schreiben('lk-fortschritt', fortschritt);
    const neu = Object.keys(FREI).filter(g => FREI[g] > vorher && FREI[g] <= fortschritt.xp);
    $('#endeFreischalt').innerHTML = `+${xp} Erfahrung` + (neu.length ? ` · <b>Neu freigeschaltet: ${neu.map(g => LKM.BILD[g] + ' ' + esc(LK.GERICHTE[g].n)).join(', ')}</b>` : '');
    const darf = modus === 'solo' || (netz.raum && netz.raum.host === meineId);
    $('#endeNochmal').hidden = !darf; $('#endeMenue').hidden = false;
    $('#endeNochmal').textContent = 'Neuer Lauf';
    zeige('ende');
  }
  function olympEndeZeigen() {
    const rang = netz.olympEnde;
    $('#endeText').textContent = '';
    $('#endeRang').hidden = false;
    $('#endeRang').innerHTML = rang.map(r => `<li${r.id === meineId ? ' style="color:var(--akzent)"' : ''}><b>${esc(r.n)}</b> – ${r.m} Münzen, ${r.b} Gäste</li>`).join('');
    const z = netz.raum && netz.raum.olymp && netz.raum.olymp.zurueck;
    $('#endeOlymp').hidden = !z; if (z) $('#endeOlymp').href = z;
    $('#endeMenue').hidden = !!z;
  }
  $('#endeNochmal').onclick = () => {
    Ton.klick();
    if (modus === 'solo') { gerichtWahlZeigen(); return; }
    senden({ t:'nochmal' });
  };
  $('#endeMenue').onclick = () => { Ton.klick(); verlassen(); };

  /* ---------- Bildschirme ---------- */
  function zeige(id) {
    schirm = id;
    for (const s of $$('.schirm')) s.hidden = s.id !== id;
    const spielt = modus !== 'menue';
    $('#hud').hidden = !spielt;
    $('#touch').hidden = !(spielt && touchAn && !id);
  }

  function startZeigen() {
    modus = 'menue';
    demoZeigen();
    $('#nameFeld').value = profil.name;
    tierWahlBauen();
    $('#startStatistik').innerHTML = fortschritt.laeufe ? `<div><b>${fortschritt.laeufe}</b>Läufe</div><div><b>${fortschritt.besterTag}</b>bester Tag</div><div><b>${fortschritt.xp}</b>Erfahrung</div>` : '';
    $('#tonLink').textContent = 'Ton: ' + (Ton.an ? 'an' : 'aus');
    zeige('start');
  }
  function tierWahlBauen() {
    $('#tierWahl').innerHTML = TIERE.map(t => `<button data-tier="${t.id}" aria-pressed="${profil.tier === t.id}" title="${t.n}">${t.e}<small>${t.n}</small></button>`).join('');
    for (const b of $$('#tierWahl [data-tier]')) b.onclick = () => { Ton.klick(); profil.tier = b.dataset.tier; profilSpeichern(); tierWahlBauen(); };
  }
  $('#nameFeld').oninput = () => { profil.name = $('#nameFeld').value.trim().slice(0, 16); profilSpeichern(); };
  $('#tonLink').onclick = e => { e.preventDefault(); Ton.umschalten(); $('#tonLink').textContent = 'Ton: ' + (Ton.an ? 'an' : 'aus'); };
  let hilfeZurueck = 'start';
  $('#hilfeLink').onclick = e => { e.preventDefault(); hilfeZurueck = 'start'; zeige('hilfe'); };
  $('#hilfeZu').onclick = () => { Ton.klick(); zeige(hilfeZurueck); };

  function nameNoetig(feld) {
    if (profil.name) return false;
    $(feld).textContent = 'Gib zuerst deinen Namen ein.'; $('#nameFeld').focus(); Ton.fehler();
    return true;
  }
  function gerichteKnoepfe(ziel, gewaehlt, wahl, darf = true) {
    $(ziel).innerHTML = LK.STARTGERICHTE.map(g => {
      const frei = fortschritt.xp >= FREI[g];
      return `<button data-g="${g}" aria-pressed="${g === gewaehlt}" ${frei && darf ? '' : 'disabled'}><span class="ico">${LKM.BILD[g]}</span>${esc(LK.GERICHTE[g].n)}<small>${frei ? LK.GERICHTE[g].preis + ' 🪙 je Teller' : `ab ${FREI[g]} Erfahrung`}</small></button>`;
    }).join('');
    for (const b of $$(ziel + ' [data-g]')) b.onclick = () => { Ton.klick(); wahl(b.dataset.g); };
  }
  let soloGericht = 'burger';
  function gerichtWahlZeigen() {
    modus = 'menue'; ansichtLeeren(); demoZeigen();
    const wahl = g => { soloGericht = g; gerichteKnoepfe('#soloGerichte', soloGericht, wahl); };
    wahl(soloGericht);
    zeige('solo');
  }
  $('#soloKnopf').onclick = () => { Ton.start(); Ton.klick(); if (nameNoetig('#startFehler')) return; gerichtWahlZeigen(); };
  $('#soloZurueck').onclick = () => { Ton.klick(); startZeigen(); };
  $('#soloLos').onclick = () => { Ton.klick(); soloStarten(soloGericht); };

  /* ---------- Hintergrund im Menü ---------- */
  let demoAktiv = false;
  function demoZeigen() {
    if (!demo) { demo = new LK.Spiel({ seed:7, start:'burger' }); }
    if (modus === 'menue') meineId = netz.raum ? meineId : null;
    ich.da = false;
    ansichtLeeren();
    sichtNeu(demo.sicht());
    demoAktiv = true;
  }

  /* ---------- Solo ---------- */
  function soloStarten(gericht) {
    netzBeenden();
    solo = { spiel:new LK.Spiel({ seed:(Math.random() * 2 ** 32) >>> 0, start:gericht }), acc:0, pausiert:false, gericht };
    solo.spiel.spielerHinzu('ich', profil.name || 'Koch', profil.tier);
    meineId = 'ich'; ich.da = false; demoAktiv = false;
    modus = 'solo'; endeGezeigt = false; kartenGezeigt = null;
    ansichtLeeren();
    sichtNeu(solo.spiel.sicht());
    zeige(null);
    meldung('Willkommen!', 'Richte die Küche ein und öffne, wenn du bereit bist', 3200);
    querTipp();
  }
  function querTipp() { if (touchAn && innerWidth < innerHeight) hinweis('Tipp: Quer gehalten ist die Küche größer.', 4000); }
  function befehl(m) {
    if (modus === 'solo' && solo) solo.spiel.befehl('ich', m);
    else if (modus === 'netz') senden(m);
  }

  /* ---------- Pause / Verlassen ---------- */
  function pauseZeigen() {
    if (modus === 'menue') return;
    if (modus === 'solo' && solo) solo.pausiert = true;
    $('#pauseTitel').textContent = modus === 'solo' ? 'Pause' : 'Menü (das Spiel läuft weiter)';
    $('#pauseTon').textContent = 'Ton: ' + (Ton.an ? 'an' : 'aus');
    $('#pauseRaus').textContent = netz.raum && netz.raum.olymp ? 'Zurück zur Olympiade' : 'Küche verlassen';
    zeige('pause');
  }
  function pauseZu() { if (solo) solo.pausiert = false; zeige(sicht && sicht.ph === 'nacht' && sicht.ka ? 'karten' : null); kartenGezeigt = null; hudAktualisieren(); }
  $('#hudPause').onclick = () => { Ton.klick(); pauseZeigen(); };
  $('#pauseWeiter').onclick = () => { Ton.klick(); pauseZu(); };
  $('#pauseHilfe').onclick = () => { Ton.klick(); hilfeZurueck = 'pause'; zeige('hilfe'); };
  $('#pauseTon').onclick = () => { Ton.umschalten(); $('#pauseTon').textContent = 'Ton: ' + (Ton.an ? 'an' : 'aus'); };
  $('#pauseRaus').onclick = () => { Ton.klick(); verlassen(); };
  function verlassen() {
    if (netz.raum && netz.raum.olymp) { const z = netz.raum.olymp.zurueck; netzBeenden(); sitzung.weg('lk-olymp'); location.href = z || '/'; return; }
    netzBeenden();
    solo = null;
    startZeigen();
  }

  /* ---------- Online ---------- */
  $('#koopKnopf').onclick = () => { Ton.start(); Ton.klick(); if (nameNoetig('#startFehler')) return; netzAktion({ t:'erstellen' }); };
  $('#beitretenKnopf').onclick = () => {
    Ton.start(); Ton.klick(); if (nameNoetig('#startFehler')) return;
    const code = $('#codeFeld').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) { $('#startFehler').textContent = 'Der Code hat vier Zeichen.'; return; }
    netzAktion({ t:'beitreten', code });
  };
  $('#codeFeld').addEventListener('keydown', e => { if (e.key === 'Enter') $('#beitretenKnopf').click(); });

  function netzAktion(d) {
    $('#startFehler').textContent = 'Verbinde …';
    sitzung.weg('lk-sitzung');
    if (netz.ws && netz.ws.readyState === 1) { hallo(false); senden(d); } else { netz.ausstehend = d; netzStarten(); }
  }
  function netzStarten() { netz.soll = true; if (!netz.ws) verbinden(); }
  function netzBeenden() {
    netz.soll = false;
    if (netz.ws) { try { senden({ t:'verlassen' }); netz.ws.close(); } catch (_) { /* egal */ } }
    netz.ws = null; netz.raum = null; netz.rang = null; netz.olympEnde = null;
    sitzung.weg('lk-sitzung');
    $('#rangliste').hidden = true;
  }
  function verbinden() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${netz.ticket ? '?olymp=' + encodeURIComponent(netz.ticket) : ''}`;
    let ws;
    try { ws = new WebSocket(url); } catch (_) { return wiederVerbinden(); }
    netz.ws = ws;
    ws.onopen = () => {
      netz.versuch = 0;
      hallo(true);
      if (netz.ticket) senden({ t:'olymp', ticket:netz.ticket });
      else if (netz.ausstehend) { senden(netz.ausstehend); netz.ausstehend = null; }
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } netzNachricht(m); };
    ws.onclose = () => { if (netz.ws === ws) { netz.ws = null; wiederVerbinden(); } };
  }
  function wiederVerbinden() {
    if (!netz.soll) return;
    netz.versuch++;
    const text = 'Verbindung weg – verbinde neu …';
    if (schirm === 'lobby') $('#lobbyFehler').textContent = text; else if (schirm === 'start') $('#startFehler').textContent = text; else hinweis(text, 2000);
    setTimeout(() => { if (netz.soll && !netz.ws) verbinden(); }, Math.min(5000, 600 * netz.versuch));
  }
  function senden(d) { if (netz.ws && netz.ws.readyState === 1) netz.ws.send(JSON.stringify(d)); }
  function hallo(mitToken) {
    const s = mitToken ? sitzung.lesen('lk-sitzung') : null;
    senden({ t:'hallo', name:profil.name, tier:profil.tier, token:s && s.token, code:s && s.code });
  }
  function netzNachricht(m) {
    switch (m.t) {
      case 'du': netz.id = m.id; netz.token = m.token; meineId = m.id; break;
      case 'raum': {
        if (!m.code && m.phase === 'aus') { netz.raum = null; if (!netz.ticket) startZeigen(); return; }
        const vorher = netz.raum;
        netz.raum = m; meineId = m.du;
        if (m.code) sitzung.schreiben('lk-sitzung', { token:netz.token, code:m.code });
        netz.startBis = m.olymp && m.olymp.startIn != null ? performance.now() + m.olymp.startIn : 0;
        if (m.phase === 'lobby') lobbyZeigen();
        else if (m.phase === 'spiel' && (modus !== 'netz' || (vorher && vorher.phase !== 'spiel'))) spielNetzBeginnen();
        else if (schirm === 'karten' && sicht && sicht.ka) kartenZeigen(sicht.ka);
        break;
      }
      case 's':
        if (modus !== 'netz') return;
        sichtNeu(m.s);
        break;
      case 'rang': netz.rang = m.rang; rangZeigen(); break;
      case 'olympEnde':
        netz.olympEnde = m.rang;
        if (schirm === 'ende') olympEndeZeigen();
        break;
      case 'fehler':
        Ton.fehler();
        if (m.olymp) { olympiaFehler(m.text, m.zurueck); return; }
        if (schirm === 'start') $('#startFehler').textContent = m.text;
        else if (schirm === 'lobby') $('#lobbyFehler').textContent = m.text;
        else hinweis(m.text);
        break;
    }
  }
  function spielNetzBeginnen() {
    solo = null;
    modus = 'netz'; ich.da = false; endeGezeigt = false; kartenGezeigt = null; netz.olympEnde = null; demoAktiv = false;
    meineId = netz.raum ? netz.raum.du : meineId;
    ansichtLeeren();
    zeige(null);
    $('#rangliste').hidden = !(netz.raum && netz.raum.olymp);
    if (netz.raum && netz.raum.olymp) meldung('Olympia-Schicht!', 'Bediene so viele Gäste wie möglich', 3000);
    else meldung('Gemeinsam kochen!', 'Richtet die Küche ein – dann alle auf „Bereit“', 3200);
    querTipp();
  }
  function rangZeigen() {
    if (!netz.rang) return;
    $('#rangListe').innerHTML = netz.rang.map(r => `<li class="${r.id === meineId ? 'ich' : ''}">${esc(r.n)} · ${r.m} 🪙${r.fertig ? ' ✓' : ''}</li>`).join('');
  }

  function lobbyZeigen() {
    const r = netz.raum;
    if (!r) return;
    if (modus !== 'menue' || !demoAktiv) { modus = 'menue'; demoZeigen(); }
    const host = r.host === meineId, olymp = r.olymp;
    $('#lobbyTitel').textContent = olymp ? `${olymp.titel} · Löwenküche` : 'Koop-Küche';
    $('#lobbyCodeTeil').hidden = !!olymp;
    $('#lobbyCode').textContent = r.code || '';
    $('#lobbyOlymp').hidden = !olymp;
    $('#lobbyLeute').innerHTML = r.mitglieder.map(x => `<li class="${x.online ? '' : 'weg'}">${tierEmoji(x.tier)} ${esc(x.name)}${x.id === meineId ? ' (du)' : ''}<small>${x.id === r.host && !olymp ? 'Gastgeber' : ''}${x.online ? '' : ' offline'}</small></li>`).join('');
    $('#lobbyWahl').hidden = !!olymp;
    if (!olymp) gerichteKnoepfe('#lobbyGerichte', r.gericht, g => senden({ t:'gericht', g }), host);
    $('#lobbyStart').hidden = !host || !!olymp;
    $('#lobbyRaus').textContent = olymp ? 'Zurück zur Olympiade' : 'Verlassen';
    const hostName = (r.mitglieder.find(x => x.id === r.host) || {}).name || '';
    $('#lobbyHinweis').textContent = olymp ? '' : host ? (r.mitglieder.length < 2 ? 'Du kannst auch allein starten – andere können später noch dazukommen.' : 'Alle da? Dann los!') : `${hostName} öffnet gleich die Küche.`;
    $('#lobbyFehler').textContent = '';
    lobbyOlympText();
    if (schirm !== 'lobby') zeige('lobby');
  }
  function lobbyOlympText() {
    const r = netz.raum;
    if (!r || !r.olymp || schirm !== 'lobby') return;
    const o = r.olymp;
    const fehlt = o.erwartet.filter(e => !e.da);
    const sek = netz.startBis ? Math.max(0, Math.ceil((netz.startBis - performance.now()) / 1000)) : null;
    $('#lobbyOlympText').innerHTML = `Jeder kocht in seiner <b>eigenen Küche</b> mit demselben Ansturm – ${Math.round(o.dauer / 60)} Minuten lang, Gerichte: ${o.menu.map(g => LKM.BILD[g]).join(' ')}. Wer am meisten verdient, gewinnt.<br>` +
      o.erwartet.map(e => `${e.da ? '✓' : '…'} ${esc(e.n)}`).join(' · ') + '<br>' +
      (sek == null ? 'Warte auf deine Gruppe …' : fehlt.length ? `Warte auf ${fehlt.length} – spätestens in ${sek} s geht es los.` : `Alle da! Es geht los in ${sek} …`);
  }
  setInterval(lobbyOlympText, 250);
  $('#lobbyStart').onclick = () => { Ton.klick(); senden({ t:'start', g:netz.raum && netz.raum.gericht }); };
  $('#lobbyRaus').onclick = () => { Ton.klick(); verlassen(); };
  $('#lobbyLink').onclick = async () => {
    const link = `${location.origin}/?raum=${netz.raum.code}`;
    try { await navigator.clipboard.writeText(link); $('#lobbyLink').textContent = 'Kopiert!'; } catch (_) { prompt('Einladungslink:', link); }
    setTimeout(() => { $('#lobbyLink').textContent = 'Einladungslink kopieren'; }, 1800);
  };
  function olympiaFehler(text, zurueck) {
    modus = 'menue'; demoZeigen();
    $('#endeBild').textContent = '🏅'; $('#endeTitel').textContent = 'Olympiade'; $('#endeText').textContent = text;
    $('#endeStatistik').innerHTML = ''; $('#endeRang').hidden = true; $('#endeFreischalt').textContent = '';
    const z = zurueck || (netz.raum && netz.raum.olymp && netz.raum.olymp.zurueck);
    $('#endeOlymp').hidden = !z; if (z) $('#endeOlymp').href = z;
    $('#endeNochmal').hidden = true; $('#endeMenue').hidden = !!z;
    netz.soll = false;
    zeige('ende');
  }

  /* ---------- Eingabe: Tastatur, Gamepad, Touch ---------- */
  const tasten = new Set();
  const ein = { x:0, y:0, arbeit:false };
  const touch = { x:0, y:0, arbeit:false, stick:null };
  let touchAn = matchMedia('(pointer: coarse)').matches;
  const spieltGerade = () => modus !== 'menue' && !schirm && sicht && sicht.ph !== 'ende';
  function greifen() { if (!spieltGerade() || !ich.da) return; befehl({ t:'g', x:ich.x, y:ich.y, r:ich.r }); }
  function arbeitDruck() { if (!spieltGerade() || !ich.da) return; if (sicht.ph === 'nacht') befehl({ t:'d', x:ich.x, y:ich.y, r:ich.r }); }
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    Ton.start();
    if (e.code === 'Escape' || e.code === 'KeyP') { if (schirm === 'pause') pauseZu(); else if (!schirm) pauseZeigen(); return; }
    if (!e.repeat) {
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'KeyJ' || e.code === 'Enter') { if (spieltGerade()) { e.preventDefault(); greifen(); } }
      if (e.code === 'KeyF' || e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ControlLeft') arbeitDruck();
    }
    if (spieltGerade() && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    tasten.add(e.code);
  });
  addEventListener('keyup', e => tasten.delete(e.code));
  addEventListener('blur', () => tasten.clear());
  let padVorher = [];
  function eingabeLesen() {
    let x = 0, y = 0;
    if (tasten.has('KeyA') || tasten.has('ArrowLeft')) x -= 1;
    if (tasten.has('KeyD') || tasten.has('ArrowRight')) x += 1;
    if (tasten.has('KeyW') || tasten.has('ArrowUp')) y -= 1;
    if (tasten.has('KeyS') || tasten.has('ArrowDown')) y += 1;
    let arbeit = ['KeyF', 'KeyK', 'ShiftLeft', 'ShiftRight', 'ControlLeft'].some(k => tasten.has(k));
    // Gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.2) { x += ax; y += ay; }
      if (p.buttons[14] && p.buttons[14].pressed) x -= 1;
      if (p.buttons[15] && p.buttons[15].pressed) x += 1;
      if (p.buttons[12] && p.buttons[12].pressed) y -= 1;
      if (p.buttons[13] && p.buttons[13].pressed) y += 1;
      const a = !!(p.buttons[0] && p.buttons[0].pressed), xb = !!((p.buttons[2] && p.buttons[2].pressed) || (p.buttons[1] && p.buttons[1].pressed));
      const v = padVorher[p.index] || {};
      if (a && !v.a) greifen();
      if (xb && !v.x) arbeitDruck();
      const start = !!(p.buttons[9] && p.buttons[9].pressed);
      if (start && !v.s) { if (schirm === 'pause') pauseZu(); else if (!schirm) pauseZeigen(); }
      padVorher[p.index] = { a, x:xb, s:start };
      arbeit = arbeit || xb;
    }
    x += touch.x; y += touch.y; arbeit = arbeit || touch.arbeit;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    ein.x = x; ein.y = y; ein.arbeit = arbeit;
  }

  // Touch: eine Ebene über dem Spielfeld; links Steuerknüppel, rechts Knöpfe
  const touchEbene = $('#touch');
  const zeiger = new Map();
  function knopfBei(x, y) {
    for (const id of ['tGreifen', 'tArbeit']) {
      const r = $('#' + id).getBoundingClientRect();
      if (Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < r.width * 0.7) return id;
    }
    return null;
  }
  touchEbene.addEventListener('pointerdown', e => {
    e.preventDefault(); Ton.start();
    const k = knopfBei(e.clientX, e.clientY);
    if (k === 'tGreifen') { zeiger.set(e.pointerId, { art:'greifen' }); $('#tGreifen').classList.add('an'); greifen(); return; }
    if (k === 'tArbeit') { zeiger.set(e.pointerId, { art:'arbeit' }); $('#tArbeit').classList.add('an'); touch.arbeit = true; arbeitDruck(); return; }
    if (e.clientX < innerWidth * 0.62 && !touch.stick) {
      touch.stick = e.pointerId;
      zeiger.set(e.pointerId, { art:'stick', x0:e.clientX, y0:e.clientY });
      const st = $('#tStick'); st.style.display = 'block'; st.style.left = e.clientX + 'px'; st.style.top = e.clientY + 'px';
      $('#tKnauf').style.transform = '';
    }
  });
  touchEbene.addEventListener('pointermove', e => {
    const z = zeiger.get(e.pointerId);
    if (!z || z.art !== 'stick') return;
    let dx = e.clientX - z.x0, dy = e.clientY - z.y0;
    const l = Math.hypot(dx, dy), max = 50;
    if (l > max) { dx *= max / l; dy *= max / l; }
    $('#tKnauf').style.transform = `translate(${dx}px,${dy}px)`;
    touch.x = l > 8 ? dx / max : 0; touch.y = l > 8 ? dy / max : 0;
  });
  const zeigerEnde = e => {
    const z = zeiger.get(e.pointerId);
    if (!z) return;
    zeiger.delete(e.pointerId);
    if (z.art === 'stick') { touch.stick = null; touch.x = 0; touch.y = 0; $('#tStick').style.display = 'none'; }
    if (z.art === 'arbeit') { touch.arbeit = false; $('#tArbeit').classList.remove('an'); }
    if (z.art === 'greifen') $('#tGreifen').classList.remove('an');
  };
  touchEbene.addEventListener('pointerup', zeigerEnde);
  touchEbene.addEventListener('pointercancel', zeigerEnde);
  addEventListener('touchstart', () => { if (!touchAn) { touchAn = true; zeige(schirm); } }, { passive:true });

  /* ---------- Hauptschleife ---------- */
  let letzt = performance.now();
  function frei(tx, ty) { return LK.innen(tx, ty) && !belegt.has(tx + ',' + ty); }
  function schleife(jetzt) {
    requestAnimationFrame(schleife);
    const dt = Math.min(0.05, (jetzt - letzt) / 1000);
    letzt = jetzt;
    bild(dt, jetzt);
  }
  function bild(dt, jetzt) {
    eingabeLesen();
    // Solo: Spiel im festen Takt weiterrechnen
    if (modus === 'solo' && solo && !solo.pausiert) {
      solo.acc += dt;
      let n = 0;
      while (solo.acc >= LK.DT && n < 5) { solo.spiel.schritt(); solo.acc -= LK.DT; n++; }
      if (n) sichtNeu(solo.spiel.sicht());
    }
    // Eigene Figur sofort bewegen und melden
    if (spieltGerade() && ich.da && !(modus === 'solo' && solo.pausiert)) {
      LK.bewegen(ich, ein.x, ein.y, dt, frei);
      ich.w = ein.arbeit && sicht.ph === 'tag';
      if (modus === 'solo') befehl({ t:'p', x:ich.x, y:ich.y, r:ich.r, w:ich.w });
      else if (jetzt - netz.letztP > 50) { netz.letztP = jetzt; senden({ t:'p', x:+ich.x.toFixed(3), y:+ich.y.toFixed(3), r:+ich.r.toFixed(3), w:ich.w }); }
    } else ich.w = false;
    ansichtBewegen(dt, jetzt / 1000);
    if (sicht && sicht.ph === 'tag' && modus !== 'menue') {
      // Uhr flüssig weiterlaufen lassen
      $('#hudUhr').style.width = (sicht.dauer ? (1 - sicht.zeit / sicht.dauer) * 100 : 0) + '%';
    }
    renderer.render(szene, kamera);
  }

  /* ---------- Sonstiges ---------- */
  addEventListener('pointerdown', () => Ton.start(), { passive:true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && modus === 'solo' && solo && !solo.pausiert && sicht && sicht.ph === 'tag') pauseZeigen();
  });

  // Debug und Tests: loewenkueche.sim(sek) rechnet das Solo-Spiel weiter
  window.loewenkueche = {
    get solo() { return solo; }, get sicht() { return sicht; }, get netz() { return netz; }, ich, ansicht,
    sim(sek) { if (!solo) return; for (let i = 0; i < sek * LK.TAKT; i++) solo.spiel.schritt(); sichtNeu(solo.spiel.sicht()); },
    // Bildschleife von Hand antreiben (falls requestAnimationFrame pausiert, z. B. in Vorschau-Fenstern)
    bilder(n, dt = 1 / 60) { for (let i = 0; i < n; i++) { letzt += dt * 1000; bild(dt, letzt); } },
    starten:soloStarten, befehl,
    // Kamera zum Ansehen von Modellen: nah(x, z, abstand); nah() setzt zurück
    nah(x, z, d = 4) { if (x == null) return kameraSetzen(); kamera.position.set(x, d * 0.8, z + d * 0.6); kamera.lookAt(x, 0.6, z); }
  };

  /* ---------- Start: Olympia-Ticket, Einladungslink oder Menü ---------- */
  const params = new URLSearchParams(location.search);
  let ticket = params.get('olymp');
  if (ticket) sitzung.schreiben('lk-olymp', ticket); else ticket = sitzung.lesen('lk-olymp');
  if (ticket) {
    netz.ticket = ticket;
    if (params.get('olymp')) history.replaceState(null, '', location.pathname);
    demoZeigen();
    $('#endeBild').textContent = '🏅'; $('#endeTitel').textContent = 'Olympiade'; $('#endeText').textContent = 'Verbinde mit deiner Olympia-Gruppe …';
    $('#endeStatistik').innerHTML = ''; $('#endeRang').hidden = true; $('#endeFreischalt').textContent = '';
    $('#endeNochmal').hidden = true; $('#endeMenue').hidden = true;
    zeige('ende');
    netzStarten();
  } else if (params.get('raum')) {
    startZeigen();
    $('#codeFeld').value = params.get('raum').toUpperCase().slice(0, 4);
    history.replaceState(null, '', location.pathname);
    if (profil.name) $('#beitretenKnopf').click(); else { $('#startFehler').textContent = 'Gib deinen Namen ein und tipp auf „Beitreten“.'; $('#nameFeld').focus(); }
  } else {
    const s = sitzung.lesen('lk-sitzung');
    startZeigen();
    if (s && s.code && s.token) { $('#startFehler').textContent = 'Verbinde wieder mit deiner Küche …'; netzStarten(); }
  }
  requestAnimationFrame(schleife);
})();
