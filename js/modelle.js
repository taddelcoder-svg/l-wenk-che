/* Löwenküche – 3D-Modelle aus Grundformen (three.js r128): Raum, Geräte, Zutaten, Gerichte, Köche, Gäste.
   3D-Achsen: x = Kachel-x, z = Kachel-y, y = Höhe. Eine Kachel ist 1 × 1. */
(function () {
  'use strict';
  const T = THREE;
  const mats = new Map();
  // Ein Material je Farbe (spart Speicher und Zeichenaufrufe)
  function mat(farbe, extra) {
    const k = farbe + (extra ? JSON.stringify(extra) : '');
    if (!mats.has(k)) mats.set(k, new T.MeshLambertMaterial({ color:farbe, ...extra }));
    return mats.get(k);
  }
  const geos = new Map();
  function geo(art, ...a) {
    const k = art + a.join(',');
    if (!geos.has(k)) geos.set(k, new T[art](...a));
    return geos.get(k);
  }
  function teil(g, farbe, x = 0, y = 0, z = 0, schatten = true) {
    const m = new T.Mesh(g, mat(farbe));
    m.position.set(x, y, z);
    m.castShadow = schatten; m.receiveShadow = true;
    return m;
  }
  const box = (w, h, d, farbe, x, y, z) => teil(geo('BoxGeometry', w, h, d), farbe, x, y, z);
  const zyl = (r1, r2, h, farbe, x, y, z, seg = 14) => teil(geo('CylinderGeometry', r1, r2, h, seg), farbe, x, y, z);
  const kugel = (r, farbe, x, y, z, seg = 12) => teil(geo('SphereGeometry', r, seg, Math.max(6, seg * 0.7 | 0)), farbe, x, y, z);
  const DREH = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];  // Logik-Richtung r -> Drehung um y (Modelle schauen nach +z)

  /* ---------- Raum ---------- */
  function raum(W, H, TUER_X) {
    const g = new T.Group();
    // Boden innen: Karo als Canvas-Textur
    const c = document.createElement('canvas'); c.width = (W - 2) * 32; c.height = (H - 2) * 32;
    const x2 = c.getContext('2d');
    for (let y = 0; y < H - 2; y++) for (let x = 0; x < W - 2; x++) {
      x2.fillStyle = (x + y) % 2 ? '#e4dac6' : '#c9b99c';
      x2.fillRect(x * 32, y * 32, 32, 32);
    }
    const tex = new T.CanvasTexture(c); tex.magFilter = T.NearestFilter;
    const boden = new T.Mesh(new T.PlaneGeometry(W - 2, H - 2), new T.MeshLambertMaterial({ map:tex }));
    boden.rotation.x = -Math.PI / 2; boden.position.set(W / 2, 0, H / 2); boden.receiveShadow = true;
    g.add(boden);
    // Draußen: Gehweg und Wiese
    const gras = new T.Mesh(new T.PlaneGeometry(60, 60), mat(0x8fbf6a));
    gras.rotation.x = -Math.PI / 2; gras.position.set(W / 2, -0.02, H / 2); gras.receiveShadow = true;
    g.add(gras);
    const weg = new T.Mesh(new T.PlaneGeometry(W + 10, 2.6), mat(0xbfb8ab));
    weg.rotation.x = -Math.PI / 2; weg.position.set(W / 2, -0.01, H + 1.2); weg.receiveShadow = true;
    g.add(weg);
    const zuTuer = new T.Mesh(new T.PlaneGeometry(1, 1.4), mat(0xbfb8ab));
    zuTuer.rotation.x = -Math.PI / 2; zuTuer.position.set(TUER_X + 0.5, -0.005, H - 0.3);
    g.add(zuTuer);
    // Wände: hinten hoch, seitlich mittel, vorne niedrig (damit man hineinsieht)
    const wand = 0xf3ead8, sockel = 0xc0603f;
    g.add(box(W, 2.4, 1, wand, W / 2, 1.2, 0.5));
    g.add(box(W, 0.3, 0.02, sockel, W / 2, 0.15, 1.01));
    for (const x of [0.5, W - 0.5]) g.add(box(1, 1.3, H - 2, wand, x, 0.65, H / 2));
    const vorn = 0.45;
    g.add(box(TUER_X, vorn, 1, wand, TUER_X / 2, vorn / 2, H - 0.5));
    g.add(box(W - TUER_X - 1, vorn, 1, wand, TUER_X + 1 + (W - TUER_X - 1) / 2, vorn / 2, H - 0.5));
    // Türrahmen und Fußmatte
    g.add(box(0.12, 1.7, 0.2, 0x7a4a2a, TUER_X + 0.06, 0.85, H - 0.5));
    g.add(box(0.12, 1.7, 0.2, 0x7a4a2a, TUER_X + 0.94, 0.85, H - 0.5));
    g.add(box(1, 0.14, 0.2, 0x7a4a2a, TUER_X + 0.5, 1.72, H - 0.5));
    const matte = box(0.9, 0.02, 0.8, 0xa63d2e, TUER_X + 0.5, 0.01, H - 0.5); matte.castShadow = false; g.add(matte);
    // Schild über der Tür
    const s = textSprite('Löwenküche', { gr:56, farbe:'#fff', grund:'#b0482e', rand:14 });
    s.position.set(TUER_X + 0.5, 2.3, H - 0.45); s.scale.multiplyScalar(0.9);
    g.add(s);
    // Fenster und Bilder an der hinteren Wand
    for (const x of [2.5, 6.5, 10.5]) {
      g.add(box(1.6, 0.9, 0.04, 0x9fd3f0, x, 1.75, 1.02));
      g.add(box(1.7, 0.08, 0.06, 0xffffff, x, 1.28, 1.03));
    }
    // Ein paar Bäume und Büsche draußen
    for (const [x, z, h] of [[-2.5, 3, 1.6], [-3, 8, 2], [W + 2.5, 2, 1.8], [W + 3, 9, 1.5], [2, H + 3.5, 1.2], [W - 2, H + 3.8, 1.4]]) {
      g.add(zyl(0.12, 0.15, h * 0.5, 0x7a5232, x, h * 0.25, z, 8));
      g.add(kugel(h * 0.45, 0x5f9e45, x, h * 0.65, z, 8));
    }
    return g;
  }

  /* ---------- Fortschrittsbalken (immer zur Kamera) ---------- */
  function balken() {
    const g = new T.Group();
    const grund = new T.Mesh(geo('PlaneGeometry', 0.62, 0.11), new T.MeshBasicMaterial({ color:0x222222, transparent:true, opacity:0.75, depthTest:false }));
    const voll = new T.Mesh(geo('PlaneGeometry', 0.56, 0.06), new T.MeshBasicMaterial({ color:0x6ad04a, depthTest:false, transparent:true }));
    voll.position.z = 0.001;
    grund.renderOrder = 10; voll.renderOrder = 11;
    g.add(grund, voll);
    g.setzen = (f, farbe) => {
      f = Math.max(0, Math.min(1, f));
      voll.scale.x = Math.max(0.001, f);
      voll.position.x = -0.28 * (1 - f);
      voll.material.color.setHex(farbe != null ? farbe : 0x6ad04a);
    };
    return g;
  }

  /* ---------- Text als Sprite ---------- */
  function textSprite(text, o = {}) {
    const gr = o.gr || 40, rand = o.rand != null ? o.rand : 10;
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const schrift = `${o.dick || 800} ${gr}px "Barlow Semi Condensed", system-ui, sans-serif`;
    x.font = schrift;
    const w = Math.ceil(x.measureText(text).width) + rand * 2, h = gr + rand * 2;
    c.width = w; c.height = h;
    x.font = schrift; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (o.grund) { x.fillStyle = o.grund; rundRechteck(x, 0, 0, w, h, h * 0.3); x.fill(); }
    if (o.kontur) { x.lineWidth = gr * 0.16; x.strokeStyle = o.kontur; x.strokeText(text, w / 2, h / 2 + 2); }
    x.fillStyle = o.farbe || '#fff';
    x.fillText(text, w / 2, h / 2 + 2);
    const tex = new T.CanvasTexture(c);
    tex.minFilter = T.LinearFilter;
    const s = new T.Sprite(new T.SpriteMaterial({ map:tex, depthTest:false, transparent:true }));
    s.renderOrder = 20;
    const hoehe = o.hoehe || 0.32;
    s.scale.set(hoehe * w / h, hoehe, 1);
    return s;
  }
  function rundRechteck(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
  }
  // Sprechblase mit Gericht-Symbol
  const BILD = { salat:'🥗', burger:'🍔', steak:'🥩', pommes:'🍟', pizza:'🍕', bunt:'🥗🍅', kaeseburger:'🍔🧀' };
  const DING_BILD = {
    tomate:'🍅', tomate_g:'🍅🔪', salat:'🥬', salat_g:'🥬🔪', fleisch:'🥩', hack:'🥩🔪', patty:'🟤', steak:'🥩🔥',
    broetchen:'🍞', kartoffel:'🥔', kartoffel_g:'🥔🔪', pommes:'🍟', teig:'🫓', kaese:'🧀', kaese_g:'🧀🔪',
    pizza_t:'🫓🍅', pizza_roh:'🫓🧀', pizza:'🍕', verbrannt:'💀', teller:'🍽️', stapel:'🍽️', dreck:'🍽️💧'
  };
  // Kurzes Bild für einen Gegenstand: fertiges Gericht, Zutaten auf dem Teller, Anzahl Teller
  function dingText(it, gericht) {
    if (!it) return '';
    if (it.z === 'teller') {
      if (!it.auf || !it.auf.length) return '🍽️';
      if (gericht) return BILD[gericht] + '✓';
      return '🍽️' + it.auf.map(z => (DING_BILD[z] || '').replace('🔪', '').replace('🔥', '')).join('');
    }
    if (it.z === 'stapel' || it.z === 'dreck') return DING_BILD[it.z] + '×' + (it.n || 1);
    return DING_BILD[it.z] || '❔';
  }
  function schild(text, hell) {
    return textSprite(text, { gr:44, grund:hell ? 'rgba(255,248,238,.94)' : 'rgba(43,29,22,.8)', farbe:hell ? '#2b1d16' : '#fff', rand:7, hoehe:0.42 });
  }
  const blasenCache = new Map();
  function blase(gericht) {
    if (!blasenCache.has(gericht)) {
      const c = document.createElement('canvas'), x = c.getContext('2d');
      const zwei = BILD[gericht].length > 2;
      c.width = zwei ? 176 : 112; c.height = 120;
      x.fillStyle = '#fff'; x.strokeStyle = '#333'; x.lineWidth = 5;
      rundRechteck(x, 4, 4, c.width - 8, 92, 30); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(c.width / 2 - 12, 94); x.lineTo(c.width / 2, 114); x.lineTo(c.width / 2 + 12, 94); x.fill();
      x.font = '62px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(BILD[gericht], c.width / 2, 52);
      const tex = new T.CanvasTexture(c); tex.minFilter = T.LinearFilter;
      blasenCache.set(gericht, { tex, v:c.width / c.height });
    }
    const b = blasenCache.get(gericht);
    const s = new T.Sprite(new T.SpriteMaterial({ map:b.tex, depthTest:false, transparent:true }));
    s.renderOrder = 15;
    s.scale.set(0.68 * b.v, 0.68, 1);
    return s;
  }

  /* ---------- Zutaten und Gerichte ---------- */
  function scheiben(farbe, n, r) {
    const g = new T.Group();
    for (let i = 0; i < n; i++) {
      const m = zyl(r, r, 0.04, farbe, Math.cos(i * 2.2) * 0.06, 0.02 + i * 0.012, Math.sin(i * 2.2) * 0.06, 10);
      g.add(m);
    }
    return g;
  }
  function stifte(farbe, n) {
    const g = new T.Group();
    for (let i = 0; i < n; i++) {
      const m = box(0.04, 0.04, 0.2, farbe, (i % 4 - 1.5) * 0.05, 0.03 + Math.floor(i / 4) * 0.04, ((i * 7) % 5 - 2) * 0.012);
      m.rotation.y = (i * 0.7) % 0.6 - 0.3;
      g.add(m);
    }
    return g;
  }
  function pizzaModell(stufe) {
    const g = new T.Group();
    g.add(zyl(0.21, 0.21, 0.04, stufe >= 3 ? 0xd99a45 : 0xf1dfb6, 0, 0.02, 0, 18));
    if (stufe >= 1) g.add(zyl(0.18, 0.18, 0.012, stufe >= 3 ? 0xc0392b : 0xe0533f, 0, 0.046, 0, 18));
    if (stufe >= 2) for (let i = 0; i < 7; i++) g.add(box(0.05, 0.02, 0.05, stufe >= 3 ? 0xf2b33a : 0xf7dc6f, Math.cos(i * 0.9) * 0.11 * (i % 2 ? 1 : 0.5), 0.06, Math.sin(i * 0.9) * 0.11 * (i % 2 ? 1 : 0.5)));
    if (stufe >= 3) for (let i = 0; i < 4; i++) g.add(zyl(0.03, 0.03, 0.015, 0x8e2b1e, Math.cos(i * 1.6 + 0.4) * 0.1, 0.062, Math.sin(i * 1.6 + 0.4) * 0.1, 8));
    return g;
  }
  function zutat(z) {
    const g = new T.Group();
    switch (z) {
      case 'tomate': g.add(kugel(0.14, 0xe03b2f, 0, 0.14, 0)); g.add(zyl(0.02, 0.02, 0.05, 0x3f8f2f, 0, 0.29, 0, 6)); break;
      case 'tomate_g': g.add(scheiben(0xe0533f, 3, 0.09)); break;
      case 'salat': { const k = kugel(0.17, 0x6fbf3a, 0, 0.15, 0); k.scale.y = 0.85; g.add(k); g.add(kugel(0.1, 0x8fd65a, 0.08, 0.22, 0.05, 8)); break; }
      case 'salat_g': for (let i = 0; i < 5; i++) { const b = kugel(0.08, i % 2 ? 0x7fcf45 : 0x5fae30, Math.cos(i * 1.3) * 0.08, 0.04 + i * 0.008, Math.sin(i * 1.3) * 0.08, 8); b.scale.y = 0.3; g.add(b); } break;
      case 'fleisch': g.add(box(0.3, 0.1, 0.22, 0xe4787a, 0, 0.05, 0)); g.add(box(0.31, 0.02, 0.05, 0xfbe3e0, 0, 0.09, 0.04)); break;
      case 'hack': { const k = kugel(0.13, 0xd9686c, 0, 0.06, 0, 8); k.scale.y = 0.45; g.add(k); break; }
      case 'patty': g.add(zyl(0.14, 0.14, 0.06, 0x6b3e22, 0, 0.03, 0)); break;
      case 'steak': g.add(box(0.28, 0.06, 0.2, 0x7a4425, 0, 0.03, 0)); for (const x of [-0.06, 0.04]) { const l = box(0.02, 0.01, 0.2, 0x3b1e10, x, 0.065, 0); l.rotation.y = 0.5; g.add(l); } break;
      case 'broetchen': { const k = kugel(0.15, 0xd9a35a, 0, 0.02, 0); k.scale.y = 0.6; g.add(k); break; }
      case 'kartoffel': { const k = kugel(0.13, 0xb68a4f, 0, 0.1, 0, 10); k.scale.set(1.25, 0.8, 0.9); g.add(k); break; }
      case 'kartoffel_g': g.add(stifte(0xf0dca0, 8)); break;
      case 'pommes': g.add(zyl(0.1, 0.08, 0.16, 0xd8342c, 0, 0.08, 0, 10)); for (let i = 0; i < 7; i++) g.add(box(0.03, 0.18, 0.03, 0xf6cf4e, (i % 3 - 1) * 0.04, 0.2 + (i % 2) * 0.02, (Math.floor(i / 3) - 1) * 0.04)); break;
      case 'teig': g.add(pizzaModell(0)); break;
      case 'pizza_t': g.add(pizzaModell(1)); break;
      case 'pizza_roh': g.add(pizzaModell(2)); break;
      case 'pizza': g.add(pizzaModell(3)); break;
      case 'kaese': { const k = zyl(0.15, 0.15, 0.12, 0xf5c542, 0, 0.06, 0, 3); g.add(k); break; }
      case 'kaese_g': for (let i = 0; i < 6; i++) g.add(box(0.05, 0.05, 0.05, 0xf7d25e, Math.cos(i) * 0.06, 0.03 + (i % 2) * 0.04, Math.sin(i * 1.7) * 0.06)); break;
      case 'verbrannt': { const k = kugel(0.14, 0x1d1b1a, 0, 0.07, 0, 7); k.scale.y = 0.55; g.add(k); g.add(kugel(0.06, 0x3a3634, 0.05, 0.12, 0.02, 6)); break; }
      default: g.add(kugel(0.1, 0xff00ff, 0, 0.1, 0));
    }
    return g;
  }
  // Teller mit blauem Rand, damit er sich von Theke und Tisch abhebt
  const TELLER_RAND = 0x2f6fc4;
  function tellerScheibe(farbe, y) {
    const g = new T.Group();
    g.add(zyl(0.23, 0.18, 0.035, farbe, 0, y, 0, 18));
    const r = teil(geo('TorusGeometry', 0.215, 0.018, 6, 24), TELLER_RAND, 0, y + 0.017, 0);
    r.rotation.x = Math.PI / 2; r.castShadow = false;
    g.add(r);
    return g;
  }
  function tellerModell(farbe = 0xffffff) {
    const g = new T.Group();
    g.add(tellerScheibe(farbe, 0.018));
    return g;
  }
  // Gegenstand aus der Sicht (z, auf, n) als Modell – etwas größer als echt, damit man ihn von oben gut sieht
  const DING_GROESSE = 1.3;
  function ding(it) {
    const g = dingRoh(it);
    g.scale.setScalar(DING_GROESSE);
    return g;
  }
  function dingRoh(it) {
    if (it.z === 'teller') {
      const g = tellerModell();
      const auf = it.auf || [];
      if (auf.includes('broetchen') && auf.includes('patty')) {
        const u = kugel(0.15, 0xd9a35a, 0, 0.04, 0); u.scale.y = 0.35; g.add(u);
        g.add(zyl(0.15, 0.15, 0.06, 0x6b3e22, 0, 0.1, 0));
        let h = 0.14;
        if (auf.includes('kaese_g')) { g.add(box(0.27, 0.02, 0.27, 0xf5c542, 0, h, 0)); h += 0.02; }
        const o = kugel(0.15, 0xd9a35a, 0, h, 0); o.scale.y = 0.6; g.add(o);
        for (let i = 0; i < 5; i++) g.add(box(0.02, 0.01, 0.02, 0xfff4d0, Math.cos(i * 1.3) * 0.07, h + 0.08, Math.sin(i * 1.3) * 0.07));
        return g;
      }
      auf.forEach((z, i) => {
        const m = zutat(z);
        const n = auf.length;
        if (n > 1) { m.position.set(Math.cos(i * 2.4) * 0.07, 0, Math.sin(i * 2.4) * 0.07); m.scale.setScalar(0.85); }
        m.position.y += 0.03;
        g.add(m);
      });
      return g;
    }
    if (it.z === 'stapel' || it.z === 'dreck') {
      const g = new T.Group();
      const n = Math.min(it.n || 1, 10);
      for (let i = 0; i < n; i++) {
        g.add(tellerScheibe(it.z === 'dreck' ? 0xd9cfbd : 0xffffff, 0.018 + i * 0.04));
        if (it.z === 'dreck') { const f = zyl(0.1, 0.1, 0.005, 0x8a6a3a, (i % 2 ? 0.05 : -0.04), 0.038 + i * 0.04, 0.03, 8); f.castShadow = false; g.add(f); }
      }
      return g;
    }
    return zutat(it.z);
  }
  const dingSchluessel = it => it ? it.z + (it.auf ? ':' + it.auf.slice().sort().join('+') : '') + (it.n ? '#' + it.n : '') : '';

  /* ---------- Geräte ---------- */
  function sockel(g, farbe, deckel = 0x8e99a4) {
    g.add(box(0.94, 0.86, 0.94, farbe, 0, 0.43, 0));
    g.add(box(1, 0.06, 1, deckel, 0, 0.89, 0));
  }
  function geraet(o) {
    const g = new T.Group();
    const inhalt = new T.Group(); inhalt.position.y = 0.92;   // Ablage für Gegenstände
    let anim = null;
    switch (o.t) {
      case 'theke': sockel(g, 0xc9ae86); g.add(box(0.94, 0.04, 0.02, 0xb59d78, 0, 0.6, 0.471)); break;
      case 'brett':
        sockel(g, 0xc9ae86);
        g.add(box(0.66, 0.04, 0.5, 0xc8915a, 0, 0.94, 0));
        g.add(box(0.05, 0.015, 0.28, 0xd8dde3, 0.38, 0.93, 0.05));
        g.add(box(0.06, 0.03, 0.12, 0x3a2a20, 0.38, 0.935, -0.14));
        inhalt.position.y = 0.96;
        break;
      case 'herd':
        sockel(g, 0x3b3f45, 0x22252a);
        for (const [x, z] of [[-0.22, -0.22], [0.22, 0.22], [0.22, -0.22]]) { const r = teil(geo('TorusGeometry', 0.1, 0.015, 6, 16), 0x777777, x, 0.925, z); r.rotation.x = Math.PI / 2; g.add(r); }
        g.add(box(0.8, 0.12, 0.03, 0x2a2d31, 0, 0.75, 0.48));
        for (const x of [-0.25, 0, 0.25]) { const k = zyl(0.04, 0.04, 0.04, 0xd0d0d0, x, 0.75, 0.5, 8); k.rotation.x = Math.PI / 2; g.add(k); }
        g.add(zyl(0.25, 0.22, 0.06, 0x2e2e2e, -0.05, 0.95, 0.02, 16));
        g.add(box(0.3, 0.03, 0.05, 0x2e2e2e, 0.32, 0.96, 0.02));
        inhalt.position.set(-0.05, 0.96, 0.02);
        break;
      case 'ofen':
        g.add(box(0.94, 1.1, 0.94, 0x8d939b, 0, 0.55, 0));
        g.add(box(0.7, 0.45, 0.02, 0x1d1f22, 0, 0.5, 0.475));
        g.add(box(0.6, 0.05, 0.05, 0xd0d0d0, 0, 0.8, 0.5));
        g.add(box(1, 0.06, 1, 0x6f747a, 0, 1.12, 0));
        g.add(box(0.5, 0.04, 0.5, 0x3a3d40, 0, 1.16, 0));
        inhalt.position.y = 1.18;
        break;
      case 'fritteuse':
        sockel(g, 0xa9aeb5, 0x8a8f96);
        g.add(box(0.7, 0.02, 0.7, 0xe0b12f, 0, 0.92, 0));
        g.add(box(0.5, 0.18, 0.04, 0x555555, 0, 1.0, 0.25));
        g.add(box(0.04, 0.04, 0.3, 0x222222, 0, 1.08, 0.42));
        inhalt.position.y = 0.94;
        break;
      case 'fliessband': {
        g.add(box(0.94, 0.7, 0.94, 0x4a4e55, 0, 0.35, 0));
        g.add(box(0.98, 0.16, 0.98, 0x2c2f33, 0, 0.78, 0));
        // Pfeile zeigen nach vorn (+z = Laufrichtung)
        for (const z of [-0.25, 0.1]) {
          for (const s of [-1, 1]) { const p = box(0.26, 0.012, 0.06, 0xf2c230, s * 0.1, 0.87, z); p.rotation.y = s * 0.7; p.castShadow = false; g.add(p); }
        }
        inhalt.position.y = 0.87;
        break;
      }
      case 'greifarm': {
        g.add(zyl(0.3, 0.36, 0.5, 0x4a4e55, 0, 0.25, 0));
        const arm = new T.Group(); arm.position.y = 0.55;
        arm.add(zyl(0.08, 0.08, 0.5, 0xf2a03a, 0, 0.25, 0, 8));
        const ober = box(0.1, 0.1, 0.9, 0xf2a03a, 0, 0.5, 0); arm.add(ober);
        arm.add(box(0.2, 0.06, 0.08, 0x333333, 0, 0.42, 0.44));
        g.add(arm);
        anim = (t, a) => { arm.rotation.y = Math.sin(t * 2) * 0.05; };
        break;
      }
      case 'spuele':
        sockel(g, 0x9db8c9, 0xdfe6ea);
        g.add(box(0.55, 0.03, 0.5, 0x7f8c95, -0.12, 0.91, 0.05));
        g.add(zyl(0.025, 0.025, 0.3, 0xc0c6cc, -0.12, 1.05, -0.32, 8));
        g.add(box(0.04, 0.04, 0.2, 0xc0c6cc, -0.12, 1.2, -0.24));
        break;
      case 'spuelmaschine':
        g.add(box(0.94, 0.86, 0.94, 0xf0f2f4, 0, 0.43, 0));
        g.add(box(0.8, 0.5, 0.02, 0xd5dbe0, 0, 0.42, 0.475));
        g.add(box(0.5, 0.05, 0.04, 0x999999, 0, 0.72, 0.49));
        g.add(box(1, 0.06, 1, 0xdfe6ea, 0, 0.89, 0));
        g.add(kugel(0.03, 0x3bd16f, 0.35, 0.78, 0.48, 6));
        break;
      case 'tellerregal':
        sockel(g, 0xb8c4cc);
        for (const x of [-0.35, 0.35]) g.add(box(0.05, 0.5, 0.05, 0x8a96a0, x, 1.15, -0.35));
        g.add(box(0.75, 0.05, 0.05, 0x8a96a0, 0, 1.4, -0.35));
        break;
      case 'kiste':
        g.add(box(0.86, 0.6, 0.86, 0xb7854f, 0, 0.3, 0));
        for (const y of [0.12, 0.48]) g.add(box(0.88, 0.07, 0.88, 0x8f6236, 0, y, 0));
        g.add(box(0.8, 0.02, 0.8, 0x6e4a28, 0, 0.6, 0));
        { const z = zutat(o.z); z.position.set(0, 0.61, 0); g.add(z); const z2 = zutat(o.z); z2.position.set(0.2, 0.61, 0.18); z2.scale.setScalar(0.8); g.add(z2); }
        inhalt.position.y = 0.7;
        break;
      case 'muell':
        g.add(zyl(0.3, 0.26, 0.75, 0x6e7781, 0, 0.375, 0, 12));
        g.add(zyl(0.33, 0.33, 0.06, 0x58606a, 0, 0.78, 0, 12));
        g.add(box(0.2, 0.05, 0.05, 0x3d4349, 0, 0.83, 0));
        break;
      case 'tisch': {
        g.add(box(0.96, 0.07, 0.96, 0xb07a45, 0, 0.72, 0));
        g.add(box(0.98, 0.012, 0.98, 0xe9d2ae, 0, 0.762, 0));
        for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) g.add(box(0.06, 0.7, 0.06, 0x8a5a30, x, 0.35, z));
        // Stühle an den vier Seiten
        for (const [x, z] of [[-0.74, 0], [0.74, 0], [0, -0.74], [0, 0.74]]) {
          const st = new T.Group();
          st.add(box(0.36, 0.05, 0.36, 0xc9894f, 0, 0.42, 0));
          for (const [a, b] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) st.add(box(0.04, 0.42, 0.04, 0x8a5a30, a, 0.21, b));
          st.add(box(0.36, 0.4, 0.04, 0xc9894f, 0, 0.64, -0.17));
          st.position.set(x, 0, z);
          st.rotation.y = Math.atan2(-x, -z) + Math.PI;
          g.add(st);
        }
        g.add(kugel(0.05, 0xe85a6f, 0, 0.82, 0, 8));
        g.add(zyl(0.03, 0.04, 0.1, 0x7fb6d9, 0, 0.8, 0, 8));
        inhalt.position.y = 0.77;
        break;
      }
      default: sockel(g, 0xff00ff);
    }
    g.add(inhalt);
    g.inhalt = inhalt;
    g.anim = anim;
    g.rotation.y = DREH[o.r] || 0;
    return g;
  }

  /* ---------- Tiere ---------- */
  const ARTEN = {
    // Köche
    loewe:{ fell:0xe8a03c, bauch:0xf6d08a, ohren:'rund', maul:'kurz', extra:'maehne', mfarbe:0xa8561a },
    pinguin:{ fell:0x2a2d35, bauch:0xf4f4f4, ohren:'keine', maul:'schnabel', schnabel:0xf29a2e },
    waschbaer:{ fell:0x8d8f93, bauch:0xd8d8d8, ohren:'spitz', maul:'kurz', extra:'maske' },
    fuchs:{ fell:0xe0702a, bauch:0xfaf3ea, ohren:'spitz', maul:'spitz', extra:'schwanz' },
    baer:{ fell:0x7b5233, bauch:0xc49a6c, ohren:'rund', maul:'kurz' },
    hase:{ fell:0xf2efe9, bauch:0xffffff, ohren:'lang', maul:'kurz', innen:0xf3a5b5 },
    // Gäste
    katze:{ fell:0x9a9a9a, bauch:0xeeeeee, ohren:'spitz', maul:'kurz' },
    hund:{ fell:0xc9955c, bauch:0xf2dcc0, ohren:'schlapp', maul:'kurz' },
    ente:{ fell:0xf6d743, bauch:0xfbe77a, ohren:'keine', maul:'schnabel', schnabel:0xf08a24 },
    maus:{ fell:0xa9a2a0, bauch:0xe6dcda, ohren:'gross', maul:'spitz', innen:0xf0b0b8 },
    schwein:{ fell:0xf3a9b4, bauch:0xf8c8cf, ohren:'spitz', maul:'schwein' }
  };
  const GAST_ARTEN = ['katze', 'hund', 'ente', 'maus', 'schwein'];
  const GAST_FARBEN = [0xe5d0b0, 0x9a9a9a, 0x6b4a32, 0xf2efe9, 0xd99a5a, 0x4e5157];
  const KLEIDUNG = [0x3f7fd9, 0xd94f3f, 0x48a85a, 0xa34fd9, 0xe0a42d, 0x2fb3b0];

  function tier(art, o = {}) {
    const A = ARTEN[art] || ARTEN.loewe;
    const fell = o.fell != null ? o.fell : A.fell;
    const g = new T.Group();
    const koerper = new T.Group(); g.add(koerper);
    // Beine (wackeln beim Laufen)
    const beine = [];
    for (const s of [-1, 1]) { const b = kugel(0.09, fell, s * 0.11, 0.08, 0, 8); b.scale.set(1, 0.8, 1.3); g.add(b); beine.push(b); }
    // Rumpf mit Schürze oder Kleidung
    const rumpf = zyl(0.22, 0.26, 0.42, o.hemd != null ? o.hemd : fell, 0, 0.36, 0, 14); koerper.add(rumpf);
    const bauch = kugel(0.17, A.bauch, 0, 0.36, 0.12, 10); bauch.scale.set(1, 1.15, 0.5); koerper.add(bauch);
    if (o.schuerze) { const s = box(0.34, 0.34, 0.03, 0xffffff, 0, 0.34, 0.24); koerper.add(s); }
    // Arme
    const arme = [];
    for (const s of [-1, 1]) {
      const a = new T.Group(); a.position.set(s * 0.25, 0.48, 0.02);
      a.add(zyl(0.055, 0.05, 0.26, fell, 0, -0.1, 0.04, 8));
      a.add(kugel(0.065, fell, 0, -0.22, 0.06, 8));
      a.rotation.x = -0.3;
      koerper.add(a); arme.push(a);
    }
    // Kopf
    const kopf = new T.Group(); kopf.position.y = 0.78; koerper.add(kopf);
    kopf.add(kugel(0.23, fell, 0, 0, 0, 14));
    if (A.extra === 'maehne') { const m = kugel(0.32, A.mfarbe, 0, 0.0, -0.06, 12); m.scale.set(1, 1, 0.75); kopf.add(m); }
    for (const s of [-1, 1]) {
      kopf.add(kugel(0.035, 0x1a1a1a, s * 0.085, 0.04, 0.2, 8));
      kopf.add(kugel(0.012, 0xffffff, s * 0.085 + 0.012, 0.055, 0.228, 6));
    }
    if (A.extra === 'maske') { const m = box(0.36, 0.08, 0.05, 0x2d2d30, 0, 0.04, 0.18); kopf.add(m); for (const s of [-1, 1]) kopf.add(kugel(0.04, 0x1a1a1a, s * 0.085, 0.04, 0.215, 8)); }
    switch (A.maul) {
      case 'kurz': { const m = kugel(0.1, A.bauch, 0, -0.07, 0.17, 10); m.scale.set(1.2, 0.8, 0.8); kopf.add(m); kopf.add(kugel(0.035, 0x2a1a14, 0, -0.03, 0.26, 8)); break; }
      case 'spitz': { const m = teil(geo('ConeGeometry', 0.09, 0.2, 8), A.bauch, 0, -0.06, 0.24); m.rotation.x = Math.PI / 2; kopf.add(m); kopf.add(kugel(0.03, 0x1a1a1a, 0, -0.06, 0.34, 6)); break; }
      case 'schnabel': { const m = box(0.16, 0.05, 0.16, A.schnabel, 0, -0.06, 0.24); kopf.add(m); break; }
      case 'schwein': { const m = zyl(0.08, 0.08, 0.07, 0xe98f9d, 0, -0.05, 0.24, 10); m.rotation.x = Math.PI / 2; kopf.add(m); for (const s of [-1, 1]) kopf.add(kugel(0.018, 0x8a3a48, s * 0.03, -0.05, 0.28, 6)); break; }
    }
    const ohr = (x, y, z, rz) => {
      switch (A.ohren) {
        case 'rund': return kugel(0.08, fell, x, y, z, 8);
        case 'gross': { const k = kugel(0.13, fell, x * 1.2, y + 0.02, z, 10); k.scale.z = 0.4; return k; }
        case 'spitz': { const k = teil(geo('ConeGeometry', 0.08, 0.17, 6), fell, x, y + 0.04, z); k.rotation.z = rz; return k; }
        case 'lang': { const k = kugel(0.065, fell, x * 0.6, y + 0.22, z, 8); k.scale.set(0.8, 3, 0.6); k.rotation.z = rz * 0.5; return k; }
        case 'schlapp': { const k = kugel(0.08, 0x7a5233, x * 1.25, y - 0.12, z, 8); k.scale.set(0.6, 1.6, 0.8); return k; }
      }
      return null;
    };
    for (const s of [-1, 1]) { const e = ohr(s * 0.16, 0.17, -0.02, -s * 0.35); if (e) kopf.add(e); }
    if (A.extra === 'schwanz') { const sw = kugel(0.1, fell, 0, 0.25, -0.3, 8); sw.scale.set(0.8, 0.8, 2); g.add(sw); g.add(kugel(0.06, 0xffffff, 0, 0.27, -0.46, 6)); }
    if (art === 'waschbaer') for (let i = 0; i < 3; i++) g.add(kugel(0.075, i % 2 ? 0x2d2d30 : fell, 0, 0.22 + i * 0.02, -0.28 - i * 0.1, 8));
    // Kochmütze
    if (o.muetze) {
      const m = new T.Group(); m.position.y = 0.2;
      m.add(zyl(0.15, 0.15, 0.14, 0xffffff, 0, 0.05, 0, 12));
      m.add(kugel(0.18, 0xffffff, 0, 0.17, 0, 10));
      m.rotation.x = -0.12;
      kopf.add(m);
    }
    g.arme = arme; g.beine = beine; g.koerper = koerper; g.kopf = kopf;
    // Hand-Ablage vor dem Bauch
    const hand = new T.Group(); hand.position.set(0, 0.42, 0.36); g.add(hand); g.hand = hand;
    g.schritt = 0;
    g.animieren = (dt, tempo, traegt, arbeitet, t) => {
      g.schritt += dt * tempo * 9;
      const sw = tempo > 0.1 ? Math.sin(g.schritt) : 0;
      beine[0].position.z = sw * 0.08; beine[1].position.z = -sw * 0.08;
      koerper.position.y = Math.abs(sw) * 0.04;
      const ziel = traegt ? -1.25 : arbeitet ? -1.0 + Math.sin(t * 22) * 0.45 : -0.3 + sw * 0.4;
      arme[0].rotation.x += ((traegt || arbeitet ? ziel : -0.3 + sw * 0.4) - arme[0].rotation.x) * Math.min(1, dt * 14);
      arme[1].rotation.x += ((traegt ? ziel : arbeitet ? -1.0 - Math.sin(t * 22) * 0.45 : -0.3 - sw * 0.4) - arme[1].rotation.x) * Math.min(1, dt * 14);
    };
    return g;
  }
  function koch(art, farbe) {
    const g = tier(art, { muetze:true, schuerze:true });
    const ring = new T.Mesh(geo('RingGeometry', 0.33, 0.42, 24), new T.MeshBasicMaterial({ color:farbe, transparent:true, opacity:0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015;
    g.add(ring);
    return g;
  }
  function gast(a, fa) {
    const art = GAST_ARTEN[a % GAST_ARTEN.length];
    const fell = art === 'ente' || art === 'schwein' ? null : GAST_FARBEN[fa % GAST_FARBEN.length];
    const g = tier(art, { hemd:KLEIDUNG[(a * 3 + fa) % KLEIDUNG.length], fell });
    g.scale.setScalar(0.82);
    return g;
  }

  // Zielmarkierung (Rahmen auf der angepeilten Kachel)
  function markierung() {
    const g = new T.Group();
    const m = new T.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9, depthTest:false });
    for (const [w, d, x, z] of [[1.04, 0.1, 0, -0.5], [1.04, 0.1, 0, 0.5], [0.1, 1.04, -0.5, 0], [0.1, 1.04, 0.5, 0]]) {
      const b = new T.Mesh(geo('BoxGeometry', w, 0.02, d), m); b.position.set(x, 0, z); b.renderOrder = 5; g.add(b);
    }
    return g;
  }

  window.LKM = { raum, geraet, ding, dingSchluessel, zutat, koch, gast, tier, balken, textSprite, blase, markierung, schild, dingText, DREH, BILD, DING_BILD, ARTEN };
})();
