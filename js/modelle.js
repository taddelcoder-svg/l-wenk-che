/* Löwenküche – 3D-Modelle aus Grundformen (three.js r128): Raum, Geräte, Zutaten, Gerichte, Köche, Gäste.
   3D-Achsen: x = Kachel-x, z = Kachel-y, y = Höhe. Eine Kachel ist 1 × 1.
   Alles prozedural: Grundformen, Canvas-Texturen, keine Dateien. Feste Teile werden je Material zu einem Mesh
   verschmolzen (backen), damit auch auf dem Handy wenige Zeichenaufrufe nötig sind. */
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
  // Glänzendes Material (Edelstahl, Glas, Teller, Tomaten …)
  function glanz(farbe, shin = 70, spec = 0x666666) {
    const k = 'g' + farbe + ',' + shin + ',' + spec;
    if (!mats.has(k)) mats.set(k, new T.MeshPhongMaterial({ color:farbe, shininess:shin, specular:spec }));
    return mats.get(k);
  }
  const hell = (f, a) => new T.Color(f).lerp(new T.Color(a > 0 ? 0xffffff : 0x000000), Math.abs(a)).getHex();
  const geos = new Map();
  function geo(art, ...a) {
    const k = art + a.join(',');
    if (!geos.has(k)) geos.set(k, new T[art](...a));
    return geos.get(k);
  }
  const istMat = f => typeof f === 'object' && f !== null;
  function teil(g, farbe, x = 0, y = 0, z = 0, schatten = true) {
    const m = new T.Mesh(g, istMat(farbe) ? farbe : mat(farbe));
    m.position.set(x, y, z);
    m.castShadow = schatten; m.receiveShadow = true;
    return m;
  }
  const box = (w, h, d, farbe, x, y, z) => teil(geo('BoxGeometry', w, h, d), farbe, x, y, z);
  const zyl = (r1, r2, h, farbe, x, y, z, seg = 14) => teil(geo('CylinderGeometry', r1, r2, h, seg), farbe, x, y, z);
  const kugel = (r, farbe, x, y, z, seg = 12) => teil(geo('SphereGeometry', r, seg, Math.max(6, seg * 0.7 | 0)), farbe, x, y, z);
  const kegel = (r, h, farbe, x, y, z, seg = 8) => teil(geo('ConeGeometry', r, h, seg), farbe, x, y, z);
  const ring = (r, t, farbe, x, y, z, seg = 14, bogen = Math.PI * 2) => teil(geo('TorusGeometry', r, t, 6, seg, bogen), farbe, x, y, z);
  const skal = (m, x, y, z) => { m.scale.set(x, y == null ? x : y, z == null ? x : z); return m; };
  const dreh = (m, x, y, z) => { m.rotation.set(x || 0, y || 0, z || 0); return m; };
  const DREH = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];  // Logik-Richtung r -> Drehung um y (Modelle schauen nach +z)
  const zuf = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  /* ---------- Verschmelzen: feste Teile je Material zu einem Mesh ---------- */
  // Teilbäume mit userData.dyn bleiben unberührt (bewegliche Teile).
  function backen(wurzel) {
    wurzel.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(wurzel.matrixWorld).invert();
    const gruppen = new Map();
    const fertig = [];
    (function lauf(o) {
      for (const c of o.children.slice()) {
        if (c.userData && c.userData.dyn) continue;
        if (c.isMesh && !c.userData.fest) {
          const k = c.material.uuid + (c.castShadow ? 'c' : 'n') + (c.receiveShadow ? 'r' : 'n');
          if (!gruppen.has(k)) gruppen.set(k, { mat:c.material, cast:c.castShadow, recv:c.receiveShadow, teile:[] });
          gruppen.get(k).teile.push(c); fertig.push(c);
        } else if (c.children && c.children.length) lauf(c);
      }
    })(wurzel);
    for (const gr of gruppen.values()) {
      const pos = [], nor = [], uv = [];
      for (const m of gr.teile) {
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        pos.push(g.attributes.position.array);
        nor.push(g.attributes.normal.array);
        uv.push(g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2));
        g.dispose();
      }
      const cat = (arr, n) => { let len = 0; for (const a of arr) len += a.length; const r = new Float32Array(len); let o = 0; for (const a of arr) { r.set(a, o); o += a.length; } return r; };
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.BufferAttribute(cat(pos), 3));
      bg.setAttribute('normal', new T.BufferAttribute(cat(nor), 3));
      bg.setAttribute('uv', new T.BufferAttribute(cat(uv), 2));
      bg.computeBoundingSphere();
      bg.userData.eigen = true;
      const mesh = new T.Mesh(bg, gr.mat);
      mesh.castShadow = gr.cast; mesh.receiveShadow = gr.recv;
      wurzel.add(mesh);
    }
    for (const m of fertig) if (m.parent) m.parent.remove(m);
    // leere Zwischengruppen aufräumen
    (function leer(o) {
      for (const c of o.children.slice()) {
        if (c.isGroup && !(c.userData && c.userData.dyn)) { leer(c); if (!c.children.length) o.remove(c); }
      }
    })(wurzel);
    return wurzel;
  }
  // Eigene (verschmolzene) Geometrien freigeben, wenn ein Modell entfernt wird
  function entsorgen(o) {
    o.traverse(c => { if (c.isMesh && c.geometry && c.geometry.userData && c.geometry.userData.eigen) c.geometry.dispose(); });
  }

  /* ---------- Canvas-Texturen ---------- */
  function leinwandTextur(w, h, fn, o = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    if (o.wdh) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.wdh[0], o.wdh[1]); }
    return t;
  }
  function rauschen(x, w, h, n, a, farben) {
    for (let i = 0; i < n; i++) {
      x.fillStyle = farben[(Math.random() * farben.length) | 0];
      x.globalAlpha = a * (0.4 + Math.random() * 0.6);
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    x.globalAlpha = 1;
  }
  function bodenTextur(W, H) {
    const K = 64, bw = W - 2, bh = H - 2;
    return leinwandTextur(bw * K, bh * K, (x, w, h) => {
      for (let y = 0; y < bh; y++) for (let a = 0; a < bw; a++) {
        const hellFeld = (a + y) % 2 === 0;
        const g = x.createLinearGradient(a * K, y * K, (a + 1) * K, (y + 1) * K);
        g.addColorStop(0, hellFeld ? '#efe6d2' : '#d3c2a2'); g.addColorStop(1, hellFeld ? '#e2d7bf' : '#c3b28f');
        x.fillStyle = g; x.fillRect(a * K, y * K, K, K);
      }
      rauschen(x, w, h, bw * bh * 90, 0.18, ['#ffffff', '#8a7a5a', '#b8a888']);
      // Fugen
      x.strokeStyle = 'rgba(120,100,70,.35)'; x.lineWidth = 2;
      for (let a = 0; a <= bw; a++) { x.beginPath(); x.moveTo(a * K, 0); x.lineTo(a * K, h); x.stroke(); }
      for (let y = 0; y <= bh; y++) { x.beginPath(); x.moveTo(0, y * K); x.lineTo(w, y * K); x.stroke(); }
      // Glanzkante je Fliese
      x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1.5;
      for (let y = 0; y < bh; y++) for (let a = 0; a < bw; a++) { x.beginPath(); x.moveTo(a * K + 3, y * K + K - 3); x.lineTo(a * K + 3, y * K + 3); x.lineTo(a * K + K - 3, y * K + 3); x.stroke(); }
      // weiche Schattenkante an den Wänden (vorgetäuschte Verdunklung in Ecken)
      const rd = K * 0.9;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, rd, 0, 0, w, rd], [0, 0, rd, 0, 0, 0, rd, h], [w, 0, w - rd, 0, w - rd, 0, rd, h]]) {
        const g = x.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(60,40,20,.34)'); g.addColorStop(1, 'rgba(60,40,20,0)');
        x.fillStyle = g; x.fillRect(rx, ry, rw, rh);
      }
    });
  }
  function grasTextur() {
    return leinwandTextur(256, 256, (x, w, h) => {
      x.fillStyle = '#86bb5f'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const cx = Math.random() * w, cy = Math.random() * h, r = 20 + Math.random() * 40;
        const c = Math.random() > 0.5 ? 'rgba(120,180,80,.35)' : 'rgba(80,140,60,.3)';
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {          // an den Rändern umgebrochen: nahtlos kachelbar
          const rg = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
          rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = rg; x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
        }
      }
      rauschen(x, w, h, 2500, 0.5, ['#9fd070', '#6aa24a', '#a9d97c', '#5d9440']);
    }, { wdh:[16, 16] });
  }
  function pflasterTextur() {
    return leinwandTextur(256, 128, (x, w, h) => {
      x.fillStyle = '#9d968a'; x.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const ox = (r % 2) * 32, px = c * 64 + ox, py = r * 32;
        const g = x.createLinearGradient(px, py, px + 60, py + 30);
        g.addColorStop(0, '#d6cfc2'); g.addColorStop(1, '#bdb5a6');
        x.fillStyle = g; x.fillRect(px + 2, py + 2, 60, 28);
      }
      rauschen(x, w, h, 900, 0.25, ['#ffffff', '#7d776c']);
    }, { wdh:[8, 1] });
  }
  function fliesenTextur() {
    return leinwandTextur(128, 64, (x, w, h) => {
      x.fillStyle = '#cfd6d6'; x.fillRect(0, 0, w, h);
      for (let r = 0; r < 2; r++) for (let c = -1; c < 2; c++) {
        const px = c * 64 + (r % 2) * 32 + 1, py = r * 32 + 1;
        const g = x.createLinearGradient(px, py, px, py + 30);
        g.addColorStop(0, '#fbfdfd'); g.addColorStop(1, '#e3eaea');
        x.fillStyle = g; x.fillRect(px, py, 62, 30);
        x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(px, py, 62, 3);
      }
    }, { wdh:[18, 1] });
  }
  function holzTextur(grund, dunkel, w = 128, h = 64) {
    return leinwandTextur(w, h, (x) => {
      x.fillStyle = grund; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { x.strokeStyle = dunkel; x.globalAlpha = 0.1 + Math.random() * 0.14; x.lineWidth = 1 + Math.random() * 1.5; const y = Math.random() * h; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + 4 * Math.random(), w * 0.6, y - 4 * Math.random(), w, y + 2); x.stroke(); }
      x.globalAlpha = 1;
    });
  }
  function karoTextur(a, b) {
    return leinwandTextur(64, 64, (x) => {
      x.fillStyle = a; x.fillRect(0, 0, 64, 64);
      x.fillStyle = b; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) x.fillRect(i * 16, j * 16, 16, 16);
    });
  }
  function weicherPunkt(farbe = '255,255,255') {
    return leinwandTextur(64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${farbe},1)`); g.addColorStop(0.35, `rgba(${farbe},.45)`); g.addColorStop(1, `rgba(${farbe},0)`);
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
  }

  /* ---------- Raum ---------- */
  function baum(g, x, z, h, art) {
    if (art === 1) {                                   // Tanne
      g.add(zyl(0.1, 0.14, h * 0.35, 0x6b4a2c, x, h * 0.175, z, 7));
      for (let i = 0; i < 3; i++) g.add(kegel(h * (0.38 - i * 0.08), h * 0.42, i % 2 ? 0x3f8a52 : 0x357a47, x, h * (0.45 + i * 0.26), z, 9));
      return;
    }
    g.add(zyl(0.1, 0.16, h * 0.55, 0x7a5232, x, h * 0.27, z, 7));
    const gruen = [0x5f9e45, 0x6fb352, 0x4f8c3c];
    for (const [dx, dy, dz, r, c] of [[0, 0.78, 0, 0.42, 0], [-0.26, 0.66, 0.08, 0.3, 1], [0.27, 0.68, -0.05, 0.3, 2], [0.05, 0.98, 0.1, 0.27, 1], [0.04, 0.7, -0.27, 0.27, 0]]) {
      g.add(kugel(h * r, gruen[c], x + dx * h, h * dy, z + dz * h, 9));
    }
  }
  function busch(g, x, z, s, blueten) {
    for (const [dx, dz, r] of [[0, 0, 0.3], [0.25, 0.05, 0.22], [-0.22, 0.08, 0.22]]) g.add(skal(kugel(s * r, 0x4f9440, x + dx * s, s * r * 0.8, z + dz * s, 8), 1, 0.85, 1));
    if (blueten) for (let i = 0; i < 6; i++) g.add(kugel(0.045, blueten[i % blueten.length], x + (zuf() - 0.5) * s * 0.7, s * 0.2 + zuf() * s * 0.25, z + 0.18 * s + zuf() * 0.1, 5));
  }
  function raum(W, H, TUER_X) {
    const g = new T.Group();
    const fest = new T.Group(); g.add(fest);   // wird am Ende verschmolzen
    // Boden innen: Fliesen mit Fugen, Glanz und Eckenschatten
    const boden = new T.Mesh(new T.PlaneGeometry(W - 2, H - 2), new T.MeshPhongMaterial({ map:bodenTextur(W, H), shininess:30, specular:0x2a2a2a }));
    boden.rotation.x = -Math.PI / 2; boden.position.set(W / 2, 0, H / 2); boden.receiveShadow = true;
    g.add(boden);
    // Draußen: Wiese mit Textur, Gehweg, Zugang zur Tür
    const gras = new T.Mesh(new T.PlaneGeometry(160, 160), new T.MeshLambertMaterial({ map:grasTextur() }));
    gras.rotation.x = -Math.PI / 2; gras.position.set(W / 2, -0.02, H / 2); gras.receiveShadow = true;
    g.add(gras);
    const pf = pflasterTextur();
    const weg = new T.Mesh(new T.PlaneGeometry(W + 10, 2.6), new T.MeshLambertMaterial({ map:pf }));
    weg.rotation.x = -Math.PI / 2; weg.position.set(W / 2, -0.01, H + 1.2); weg.receiveShadow = true;
    g.add(weg);
    const zuTuer = new T.Mesh(new T.PlaneGeometry(1.4, 1.4), mat(0xc9c2b4));
    zuTuer.rotation.x = -Math.PI / 2; zuTuer.position.set(TUER_X + 0.5, -0.005, H - 0.3);
    g.add(zuTuer);
    // Randstein der Straße
    fest.add(box(W + 10, 0.1, 0.16, 0xaaa398, W / 2, 0.03, H + 2.55));
    // Wände: hinten hoch, seitlich mittel, vorne niedrig (damit man hineinsieht)
    const wand = 0xf6eedd, putz = 0xefe3cb, sockel = 0xb4553a, holz = 0x8a5a36;
    fest.add(box(W, 2.4, 1, wand, W / 2, 1.2, 0.5));
    fest.add(box(W, 0.07, 1.1, 0xe6d6b8, W / 2, 2.43, 0.5));                      // Abschlussleiste oben
    fest.add(box(W - 2, 0.16, 0.05, 0xfff9ec, W / 2, 0.96 + 0.0, 1.03));
    for (const x of [0.5, W - 0.5]) {
      fest.add(box(1, 1.3, H - 2, wand, x, 0.65, H / 2));
      fest.add(box(1.1, 0.07, H - 2, 0xe6d6b8, x, 1.33, H / 2));
    }
    // Wandpaneel (Wainscot) unten an drei Wänden + Sockelleiste
    fest.add(box(W - 2, 0.55, 0.04, sockel, W / 2, 0.275, 1.02));
    fest.add(box(W - 2, 0.06, 0.07, 0xfff4e0, W / 2, 0.58, 1.03));
    for (const [x, s] of [[1.02, 1], [W - 1.02, -1]]) {
      fest.add(box(0.04, 0.55, H - 2, sockel, x, 0.275, H / 2));
      fest.add(box(0.07, 0.06, H - 2, 0xfff4e0, x + s * 0.01, 0.58, H / 2));
    }
    const vorn = 0.45;
    fest.add(box(TUER_X, vorn, 1, wand, TUER_X / 2, vorn / 2, H - 0.5));
    fest.add(box(W - TUER_X - 1, vorn, 1, wand, TUER_X + 1 + (W - TUER_X - 1) / 2, vorn / 2, H - 0.5));
    fest.add(box(TUER_X, 0.05, 1.1, 0xe6d6b8, TUER_X / 2, vorn + 0.02, H - 0.5));
    fest.add(box(W - TUER_X - 1, 0.05, 1.1, 0xe6d6b8, TUER_X + 1 + (W - TUER_X - 1) / 2, vorn + 0.02, H - 0.5));
    // Fliesenspiegel hinter den Arbeitsflächen
    const fl = new T.Mesh(new T.PlaneGeometry(W - 2, 0.5), new T.MeshLambertMaterial({ map:fliesenTextur() }));
    fl.position.set(W / 2, 1.2, 1.012); fl.receiveShadow = true; g.add(fl);
    // Türrahmen, Schwelle, Fußmatte
    const rahm = 0x6e4426;
    g.add(box(0.12, 1.7, 0.22, rahm, TUER_X + 0.06, 0.85, H - 0.5));
    g.add(box(0.12, 1.7, 0.22, rahm, TUER_X + 0.94, 0.85, H - 0.5));
    g.add(box(1, 0.14, 0.22, rahm, TUER_X + 0.5, 1.72, H - 0.5));
    g.add(box(0.96, 0.03, 0.26, 0xcfc6b6, TUER_X + 0.5, 0.015, H - 0.5));
    const matte = box(0.9, 0.02, 0.7, 0x9a3328, TUER_X + 0.5, 0.03, H - 0.05); matte.castShadow = false; g.add(matte);
    g.add(box(0.7, 0.022, 0.06, 0xf2d9a0, TUER_X + 0.5, 0.032, H - 0.05));
    // Schild über der Tür
    const s = textSprite('Löwenküche', { gr:56, farbe:'#fff', grund:'#b0482e', rand:14 });
    s.position.set(TUER_X + 0.5, 2.3, H - 0.45); s.scale.multiplyScalar(0.9);
    g.add(s);
    // Fenster mit Rahmen, Sprossen, Brett und Vorhängen (Glas leuchtet nachts)
    const glasMat = new T.MeshBasicMaterial({ color:0xa9dcf3 });
    for (const x of [2.5, 6.5, 10.5]) {
      g.add(teil(geo('BoxGeometry', 1.5, 0.8, 0.02), glasMat, x, 1.85, 1.03, false));
      for (const [w, h, dx, dy] of [[1.62, 0.07, 0, 0.44], [1.62, 0.07, 0, -0.44], [0.07, 0.95, -0.78, 0], [0.07, 0.95, 0.78, 0], [0.04, 0.8, 0, 0], [1.5, 0.04, 0, 0]]) fest.add(box(w, h, 0.07, 0xfff9ec, x + dx, 1.85 + dy, 1.05));
      fest.add(box(1.8, 0.07, 0.2, 0xfff9ec, x, 1.4, 1.1));
      for (const sx of [-1, 1]) {   // Vorhänge
        const v = box(0.34, 1.05, 0.06, 0xd96a52, x + sx * 0.86, 1.82, 1.1); v.rotation.z = sx * 0.04; fest.add(v);
        fest.add(box(0.36, 0.06, 0.08, 0xf2d9a0, x + sx * 0.86, 2.36, 1.1));
      }
      fest.add(zyl(0.025, 0.025, 2.0, 0x6e4426, x, 2.38, 1.12, 6).rotateZ(Math.PI / 2));
    }
    g.glasMat = glasMat;
    // Bilder, Uhr, Regal mit Gläsern an der hinteren Wand
    for (const [x, y, c] of [[4.5, 1.9, 0xe0a42d], [12.0, 1.95, 0xd96a52]]) {
      fest.add(box(0.5, 0.4, 0.04, 0x7a4a2a, x, y, 1.04));
      fest.add(box(0.4, 0.3, 0.05, c, x, y, 1.045));
      fest.add(skal(kugel(0.07, hell(c, 0.5), x - 0.08, y + 0.04, 1.07, 6), 1, 1, 0.3));
    }
    fest.add(zyl(0.17, 0.17, 0.05, 0x6e4426, 8.5, 2.05, 1.05, 16).rotateX(Math.PI / 2));
    fest.add(zyl(0.14, 0.14, 0.055, 0xfff9ec, 8.5, 2.05, 1.055, 16).rotateX(Math.PI / 2));
    fest.add(box(0.015, 0.1, 0.02, 0x333333, 8.5, 2.09, 1.09));
    fest.add(box(0.07, 0.015, 0.02, 0x333333, 8.53, 2.05, 1.09));
    // Wimpelkette an der hinteren Wand
    const wim = [0xe0533f, 0xf2c230, 0x48a85a, 0x3f7fd9, 0xd96ab0];
    for (let i = 0; i < 24; i++) {
      const x = 1.4 + i * 0.5, sag = Math.sin((i / 24) * Math.PI * 3) * 0.05;
      const f = kegel(0.11, 0.2, wim[i % wim.length], x, 2.25 - Math.abs(Math.sin(((x - 1) / 4) * Math.PI)) * 0.1 + sag, 1.2, 3);
      f.rotation.z = Math.PI; f.scale.z = 0.25; f.castShadow = false; fest.add(f);
    }
    // Lichtpunkte der Deckenlampen (nachts als Lichthof, siehe umwelt.js)
    g.lampenGlas = [];
    for (const [x, z] of [[4, 3], [10, 3], [4, 8], [10, 8]]) {
      const gl = new T.Mesh(geo('SphereGeometry', 0.01, 4, 3), new T.MeshBasicMaterial({ color:0xfff1c2 }));
      gl.position.set(x, 2.4, z); gl.visible = false; g.add(gl); g.lampenGlas.push(gl);
    }
    // Außenwelt: Bäume, Tannen, Büsche, Blumenkästen, Zaun, Laterne
    for (const [x, z, h, a] of [[-2.5, 3, 1.9, 0], [-3.2, 8, 2.3, 1], [W + 2.5, 2, 2.0, 0], [W + 3.2, 9, 1.8, 1], [-1.2, 11.5, 1.6, 0], [W + 1.4, 12.2, 1.5, 0], [-5, 5.5, 2.6, 1], [W + 5, 5, 2.4, 0], [3, H + 4.5, 1.7, 1], [W - 3, H + 4.2, 1.5, 0]]) baum(fest, x, z, h, a);
    for (const [x, z, s, b] of [[-1.3, 1.6, 1, [0xf27a8a, 0xffd65a]], [-1.4, 5.5, 0.9, null], [-1.3, 9.5, 1, [0xffffff, 0xffd65a]], [W + 1.3, 3.5, 1, [0xf27a8a]], [W + 1.3, 7, 0.9, null], [W + 1.4, 10.4, 1.1, [0xb78af2, 0xffffff]], [TUER_X - 1.6, H + 0.2, 0.7, [0xffd65a]], [TUER_X + 2.6, H + 0.2, 0.7, [0xf27a8a, 0xffffff]]]) busch(fest, x, z, s, b);
    // Blumenkübel neben der Tür
    for (const dx of [-0.5, 1.5]) {
      fest.add(zyl(0.17, 0.13, 0.28, 0xb4553a, TUER_X + dx, 0.14, H + 0.1, 10));
      fest.add(skal(kugel(0.2, 0x4f9440, TUER_X + dx, 0.38, H + 0.1, 8), 1, 0.8, 1));
      for (let i = 0; i < 4; i++) fest.add(kugel(0.05, [0xf27a8a, 0xffd65a, 0xffffff, 0xf27a8a][i], TUER_X + dx + (i % 2 - 0.5) * 0.18, 0.5 + (i % 3) * 0.03, H + 0.1 + (i < 2 ? -0.07 : 0.07), 5));
    }
    // Zaun links und rechts
    for (const x of [-0.7, W + 0.7]) for (let z = 0.5; z < H + 0.2; z += 0.55) {
      fest.add(box(0.1, 0.6, 0.1, 0xf2ead8, x, 0.3, z));
      fest.add(kegel(0.07, 0.1, 0xf2ead8, x, 0.65, z, 4));
    }
    for (const x of [-0.7, W + 0.7]) { fest.add(box(0.06, 0.07, H, 0xf2ead8, x, 0.45, H / 2 + 0.1)); fest.add(box(0.06, 0.07, H, 0xf2ead8, x, 0.2, H / 2 + 0.1)); }
    // Straßenlaterne am Gehweg
    fest.add(zyl(0.05, 0.07, 1.9, 0x3a3f46, W - 1.2, 0.95, H + 2.3, 8));
    fest.add(box(0.28, 0.32, 0.28, 0xfff1c2, W - 1.2, 2.0, H + 2.3));
    fest.add(kegel(0.24, 0.16, 0x3a3f46, W - 1.2, 2.26, H + 2.3, 4).rotateY(Math.PI / 4));
    backen(fest);
    return g;
  }

  /* ---------- Fortschrittsbalken (immer zur Kamera) ---------- */
  function balken() {
    const g = new T.Group();
    const rand = new T.Mesh(geo('PlaneGeometry', 0.66, 0.15), new T.MeshBasicMaterial({ color:0xfff8ea, transparent:true, opacity:0.95, depthTest:false }));
    const grund = new T.Mesh(geo('PlaneGeometry', 0.62, 0.11), new T.MeshBasicMaterial({ color:0x2b1d16, transparent:true, opacity:0.9, depthTest:false }));
    const voll = new T.Mesh(geo('PlaneGeometry', 0.56, 0.06), new T.MeshBasicMaterial({ color:0x6ad04a, depthTest:false, transparent:true }));
    const glanzLinie = new T.Mesh(geo('PlaneGeometry', 0.56, 0.02), new T.MeshBasicMaterial({ color:0xffffff, depthTest:false, transparent:true, opacity:0.35 }));
    grund.position.z = 0.0005; voll.position.z = 0.001; glanzLinie.position.set(0, 0.015, 0.0015);
    rand.renderOrder = 9; grund.renderOrder = 10; voll.renderOrder = 11; glanzLinie.renderOrder = 12;
    g.add(rand, grund, voll, glanzLinie);
    g.setzen = (f, farbe) => {
      f = Math.max(0, Math.min(1, f));
      voll.scale.x = Math.max(0.001, f);
      voll.position.x = -0.28 * (1 - f);
      glanzLinie.scale.x = Math.max(0.001, f); glanzLinie.position.x = -0.28 * (1 - f);
      voll.material.color.setHex(farbe != null ? farbe : 0x6ad04a);
    };
    return g;
  }

  /* ---------- Text als Sprite ---------- */
  function textSprite(text, o = {}) {
    const gr = o.gr || 40, rand = o.rand != null ? o.rand : 10;
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const schrift = `${o.dick || 800} ${gr}px "Bricolage Grotesque", system-ui, sans-serif`;
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
  const blasenCache = new Map();
  function blase(gericht) {
    if (!blasenCache.has(gericht)) {
      const c = document.createElement('canvas'), x = c.getContext('2d');
      const zwei = BILD[gericht].length > 2;
      c.width = zwei ? 184 : 120; c.height = 128;
      x.shadowColor = 'rgba(43,29,22,.35)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
      x.fillStyle = '#fffaf0'; x.strokeStyle = '#d9a35a'; x.lineWidth = 5;
      rundRechteck(x, 8, 6, c.width - 16, 90, 30); x.fill();
      x.beginPath(); x.moveTo(c.width / 2 - 12, 92); x.lineTo(c.width / 2, 114); x.lineTo(c.width / 2 + 12, 92); x.fill();
      x.shadowColor = 'transparent';
      rundRechteck(x, 8, 6, c.width - 16, 90, 30); x.stroke();
      x.fillStyle = '#fffaf0'; x.beginPath(); x.moveTo(c.width / 2 - 10, 93); x.lineTo(c.width / 2, 111); x.lineTo(c.width / 2 + 10, 93); x.fill();
      x.strokeStyle = '#d9a35a'; x.beginPath(); x.moveTo(c.width / 2 - 12, 94); x.lineTo(c.width / 2, 114); x.lineTo(c.width / 2 + 12, 94); x.stroke();
      x.font = '62px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(BILD[gericht], c.width / 2, 52);
      const tex = new T.CanvasTexture(c); tex.minFilter = T.LinearFilter;
      blasenCache.set(gericht, { tex, v:c.width / c.height });
    }
    const b = blasenCache.get(gericht);
    const s = new T.Sprite(new T.SpriteMaterial({ map:b.tex, depthTest:false, transparent:true }));
    s.renderOrder = 15;
    s.scale.set(0.7 * b.v, 0.7, 1);
    return s;
  }

  /* ---------- Zutaten und Gerichte ---------- */
  const SESAM = 0xfff1c9;
  function scheiben(farbe, n, r, innen) {
    const g = new T.Group();
    for (let i = 0; i < n; i++) {
      const x = Math.cos(i * 2.2) * 0.06, z = Math.sin(i * 2.2) * 0.06, y = 0.02 + i * 0.014;
      g.add(zyl(r, r, 0.03, farbe, x, y, z, 12));
      if (innen) {
        g.add(zyl(r * 0.78, r * 0.78, 0.032, innen, x, y, z, 12));
        for (let k = 0; k < 5; k++) g.add(kugel(0.009, 0xf4e3a0, x + Math.cos(k * 1.26) * r * 0.45, y + 0.017, z + Math.sin(k * 1.26) * r * 0.45, 4));
      }
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
  function blatt(farbe, x, y, z, s, ry, rx = 0) {
    const m = skal(kugel(0.09, farbe, x, y, z, 8), 1.15 * s, 0.28 * s, 0.9 * s);
    m.rotation.set(rx, ry, 0); return m;
  }
  function pizzaModell(stufe) {
    const g = new T.Group();
    const fertig = stufe >= 3;
    const teig = fertig ? 0xcf8b3a : stufe >= 1 ? 0xeedaa8 : 0xf1dfb6;
    g.add(zyl(0.21, 0.21, 0.035, teig, 0, 0.018, 0, 22));
    if (stufe >= 1) g.add(ring(0.205, 0.022, fertig ? 0xb8742a : 0xe6cd96, 0, 0.04, 0, 22).rotateX(Math.PI / 2));
    if (stufe >= 1) g.add(zyl(0.18, 0.18, 0.012, fertig ? 0xb92f22 : 0xe0533f, 0, 0.042, 0, 22));
    if (stufe >= 2) {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, rr = 0.03 + (i % 3) * 0.05;
        const k = skal(kugel(0.06, fertig ? 0xf2b33a : 0xf7e08a, Math.cos(a) * rr, 0.052, Math.sin(a) * rr, 6), 1, 0.25, 1);
        g.add(k);
      }
    }
    if (fertig) {
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4, rr = 0.09 + (i % 2) * 0.03; g.add(zyl(0.032, 0.032, 0.014, 0x8e2b1e, Math.cos(a) * rr, 0.064, Math.sin(a) * rr, 8)); g.add(kugel(0.007, 0xd4574a, Math.cos(a) * rr + 0.01, 0.073, Math.sin(a) * rr, 4)); }
      for (let i = 0; i < 3; i++) g.add(blatt(0x3f9a3a, Math.cos(i * 2.1 + 1) * 0.07, 0.07, Math.sin(i * 2.1 + 1) * 0.07, 0.7, i));
      for (let i = 0; i < 6; i++) g.add(kugel(0.014, 0x8a5a1c, Math.cos(i * 1.1) * 0.15, 0.056, Math.sin(i * 1.1) * 0.15, 4));
    }
    return g;
  }
  function zutatRoh(z) {
    const g = new T.Group();
    switch (z) {
      case 'tomate': {
        g.add(skal(kugel(0.14, glanz(0xe03b2f, 90, 0x886666), 0, 0.13, 0, 14), 1, 0.9, 1));
        g.add(zyl(0.02, 0.025, 0.04, 0x3f8f2f, 0, 0.255, 0, 6));
        for (let i = 0; i < 5; i++) { const b = skal(kugel(0.045, 0x4aa03a, Math.cos(i * 1.26) * 0.05, 0.245, Math.sin(i * 1.26) * 0.05, 5), 1.3, 0.3, 0.6); b.rotation.y = -i * 1.26; g.add(b); }
        break;
      }
      case 'tomate_g': g.add(scheiben(0xe0533f, 3, 0.09, 0xf08a74)); break;
      case 'salat': {
        g.add(skal(kugel(0.16, 0x6fbf3a, 0, 0.13, 0, 10), 1, 0.85, 1));
        for (let i = 0; i < 6; i++) { const a = i * 1.05; g.add(blatt(i % 2 ? 0x5fae30 : 0x79c943, Math.cos(a) * 0.12, 0.13, Math.sin(a) * 0.12, 1.3, -a, i % 2 ? 0.5 : 0.35)); }
        g.add(skal(kugel(0.1, 0xb8e07a, 0, 0.2, 0, 8), 1, 0.8, 1));
        g.add(blatt(0xd6f0a0, 0.02, 0.255, 0.01, 0.8, 0.5));
        break;
      }
      case 'salat_g': for (let i = 0; i < 8; i++) g.add(blatt([0x7fcf45, 0x5fae30, 0x9ad95a][i % 3], Math.cos(i * 1.3) * 0.09, 0.03 + i * 0.011, Math.sin(i * 1.3) * 0.09, 0.85, i * 0.9, (i % 3) * 0.2)); break;
      case 'fleisch': {
        g.add(skal(kugel(0.16, glanz(0xe4787a, 60, 0x884444), 0, 0.055, 0, 10), 1.0, 0.42, 0.8));
        g.add(skal(kugel(0.1, 0xfbe3e0, 0.0, 0.085, 0.09, 6), 1.3, 0.2, 0.35));
        for (const x of [-0.06, 0.04]) { const l = skal(kugel(0.06, 0xf6c9c6, x, 0.092, -0.03, 5), 0.5, 0.2, 1.6); l.rotation.y = 0.5; g.add(l); }
        break;
      }
      case 'hack': for (let i = 0; i < 12; i++) g.add(kugel(0.045, i % 3 ? 0xd9686c : 0xc65559, Math.cos(i * 2.4) * 0.07 * (i % 4 + 1) / 3, 0.03 + (i % 3) * 0.025, Math.sin(i * 2.4) * 0.07 * (i % 4 + 1) / 3, 6)); break;
      case 'patty': {
        g.add(skal(kugel(0.15, 0x6b3e22, 0, 0.03, 0, 14), 1, 0.4, 1));
        g.add(zyl(0.148, 0.148, 0.03, 0x4f2a14, 0, 0.045, 0, 14));
        for (const x of [-0.07, 0, 0.07]) { const l = box(0.016, 0.012, 0.22, 0x26130a, x, 0.062, 0); l.rotation.y = 0.7; g.add(l); }
        break;
      }
      case 'steak': {
        g.add(skal(kugel(0.16, glanz(0x7a4425, 40, 0x553322), 0, 0.045, 0, 12), 1.0, 0.36, 0.78));
        for (const x of [-0.08, -0.01, 0.06]) { const l = box(0.014, 0.012, 0.2, 0x2c150a, x, 0.083, 0); l.rotation.y = 0.55; g.add(l); }
        g.add(box(0.27, 0.02, 0.025, 0xe9d7a6, 0, 0.055, 0.13));
        for (let i = 0; i < 3; i++) g.add(blatt(0x3f9a3a, -0.05 + i * 0.05, 0.1, 0.0, 0.5, i * 0.8));
        break;
      }
      case 'broetchen': {
        g.add(skal(kugel(0.15, 0xe3b062, 0, 0.03, 0, 14), 1, 0.7, 1));
        g.add(skal(kugel(0.145, 0xcf9440, 0.0, 0.035, 0, 10), 1, 0.4, 1));
        for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.03 + (i % 3) * 0.035; g.add(skal(kugel(0.011, SESAM, Math.cos(a) * r, 0.11 - r * 0.4, Math.sin(a) * r, 4), 1, 0.6, 1.4)); }
        break;
      }
      case 'kartoffel': {
        g.add(skal(kugel(0.13, 0xb68a4f, 0, 0.1, 0, 10), 1.25, 0.8, 0.9));
        for (let i = 0; i < 4; i++) g.add(kugel(0.016, 0x7a5a30, Math.cos(i * 1.7) * 0.1, 0.12 + (i % 2) * 0.03, 0.08 + Math.sin(i) * 0.02, 4));
        break;
      }
      case 'kartoffel_g': g.add(stifte(0xf0dca0, 8)); break;
      case 'pommes': {
        g.add(zyl(0.1, 0.075, 0.16, 0xd8342c, 0, 0.08, 0, 4).rotateY(Math.PI / 4));
        g.add(zyl(0.103, 0.095, 0.05, 0xfff1d0, 0, 0.095, 0, 4).rotateY(Math.PI / 4));
        for (let i = 0; i < 11; i++) {
          const m = box(0.03, 0.2 + (i % 3) * 0.03, 0.03, i % 3 ? 0xf6cf4e : 0xe8b738, (i % 4 - 1.5) * 0.04, 0.2 + (i % 3) * 0.02, (Math.floor(i / 4) - 1) * 0.04);
          m.rotation.set((i % 3 - 1) * 0.15, i, (i % 4 - 1.5) * 0.12); g.add(m);
        }
        break;
      }
      case 'teig': g.add(pizzaModell(0)); break;
      case 'pizza_t': g.add(pizzaModell(1)); break;
      case 'pizza_roh': g.add(pizzaModell(2)); break;
      case 'pizza': g.add(pizzaModell(3)); break;
      case 'kaese': {
        const k = zyl(0.16, 0.16, 0.12, glanz(0xf5c542, 40, 0x887744), 0, 0.06, 0, 3); k.rotation.y = 0.5; g.add(k);
        for (const [x, y, r] of [[0.0, 0.1, 0.03], [0.07, 0.05, 0.022], [-0.06, 0.07, 0.025]]) g.add(kugel(r, 0xd9a826, x, y, 0.1, 6));
        break;
      }
      case 'kaese_g': for (let i = 0; i < 6; i++) { const m = box(0.14, 0.012, 0.14, glanz(0xf7d25e, 40, 0x887744), Math.cos(i) * 0.04, 0.02 + i * 0.013, Math.sin(i * 1.7) * 0.04); m.rotation.y = i * 0.7; g.add(m); } break;
      case 'verbrannt': {
        g.add(skal(kugel(0.14, 0x1d1b1a, 0, 0.065, 0, 8), 1, 0.55, 1));
        g.add(skal(kugel(0.07, 0x34302e, 0.05, 0.11, 0.02, 6), 1, 0.7, 1));
        const glut = new T.MeshBasicMaterial({ color:0xff5a1f });
        for (let i = 0; i < 5; i++) g.add(teil(geo('SphereGeometry', 0.012, 4, 3), glut, Math.cos(i * 1.9) * 0.09, 0.1 + (i % 2) * 0.02, Math.sin(i * 1.9) * 0.08, false));
        break;
      }
      default: g.add(kugel(0.1, 0xff00ff, 0, 0.1, 0));
    }
    return g;
  }
  function zutat(z) { return backen(zutatRoh(z)); }
  function tellerModell(farbe = 0xffffff) {
    const g = new T.Group();
    g.add(zyl(0.23, 0.17, 0.035, glanz(farbe, 90, 0x999999), 0, 0.018, 0, 22));
    g.add(ring(0.205, 0.012, 0x9fc3e6, 0, 0.036, 0, 22).rotateX(Math.PI / 2));
    g.add(zyl(0.15, 0.15, 0.004, 0xf0f1f3, 0, 0.037, 0, 18));
    return g;
  }
  function burgerAufTeller(g, auf) {
    const u = skal(kugel(0.15, 0xcf9440, 0, 0.045, 0, 14), 1, 0.3, 1); g.add(u);
    g.add(zyl(0.15, 0.15, 0.055, 0x5a2f18, 0, 0.1, 0, 14));
    for (const x of [-0.06, 0.02, 0.09]) { const l = box(0.014, 0.01, 0.2, 0x26130a, x, 0.13, 0); l.rotation.y = 0.7; g.add(l); }
    let h = 0.135;
    if (auf.includes('kaese_g')) { const k = box(0.27, 0.018, 0.27, glanz(0xf5c542, 40, 0x887744), 0, h + 0.005, 0); k.rotation.y = 0.78; g.add(k); h += 0.02; }
    for (let i = 0; i < 6; i++) g.add(blatt(i % 2 ? 0x5fae30 : 0x79c943, Math.cos(i * 1.05) * 0.14, h + 0.005, Math.sin(i * 1.05) * 0.14, 0.9, -i * 1.05, 0.1)); // Salat
    g.add(zyl(0.09, 0.09, 0.02, 0xe0453a, 0, h + 0.015, 0, 12)); g.add(zyl(0.07, 0.07, 0.022, 0xf08a74, 0, h + 0.015, 0, 12)); h += 0.03;
    const o = skal(kugel(0.155, 0xe3b062, 0, h, 0, 14), 1, 0.62, 1); g.add(o);
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.03 + (i % 3) * 0.035; g.add(skal(kugel(0.011, SESAM, Math.cos(a) * r, h + 0.085 - r * 0.4, Math.sin(a) * r, 4), 1, 0.6, 1.4)); }
    // Spieß mit Gürkchen
    g.add(zyl(0.006, 0.006, 0.2, 0xd9b36a, 0.02, h + 0.1, 0.02, 4));
    g.add(kugel(0.028, 0x3f8a3a, 0.02, h + 0.2, 0.02, 6));
  }
  // Gegenstand aus der Sicht (z, auf, n) als Modell
  function dingRoh(it) {
    if (it.z === 'teller') {
      const g = tellerModell();
      const auf = it.auf || [];
      if (auf.includes('broetchen') && auf.includes('patty')) { burgerAufTeller(g, auf); return g; }
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
        const t = zyl(0.23, 0.18, 0.035, it.z === 'dreck' ? 0xe8e2d6 : glanz(0xffffff, 90, 0x999999), 0, 0.018 + i * 0.04, 0, 20);
        g.add(t);
        g.add(ring(0.2, 0.01, it.z === 'dreck' ? 0xcbbf9c : 0x9fc3e6, 0, 0.036 + i * 0.04, 0, 20).rotateX(Math.PI / 2));
        if (it.z === 'dreck') {
          const f = skal(kugel(0.07, 0x8a6a3a, (i % 2 ? 0.05 : -0.04), 0.045 + i * 0.04, 0.03, 6), 1, 0.2, 1); f.castShadow = false; g.add(f);
          g.add(kugel(0.022, 0xc0392b, (i % 2 ? -0.06 : 0.07), 0.05 + i * 0.04, -0.05, 5));
        }
      }
      return g;
    }
    return zutatRoh(it.z);
  }
  function ding(it) { return backen(dingRoh(it)); }
  const dingSchluessel = it => it ? it.z + (it.auf ? ':' + it.auf.slice().sort().join('+') : '') + (it.n ? '#' + it.n : '') : '';

  /* ---------- Geräte ---------- */
  const STAHL = glanz(0xb6bcc4, 90, 0xaaaaaa), STAHL_D = glanz(0x8a9098, 80, 0x888888), CHROM = glanz(0xc9cfd6, 100, 0x888888);
  const GLAS_D = glanz(0x16181b, 120, 0xcccccc);
  function sockel(g, farbe, deckel = 0xe9ecef, glanzDeckel = true) {
    g.add(box(0.94, 0.86, 0.94, farbe, 0, 0.43, 0));
    g.add(box(0.9, 0.06, 0.02, hell(farbe, -0.35), 0, 0.03, 0.472));         // Fußleiste
    g.add(box(1, 0.06, 1, glanzDeckel ? glanz(deckel, 60, 0x555555) : deckel, 0, 0.89, 0));
  }
  function schrankTueren(g, farbe) {
    for (const s of [-1, 1]) {
      g.add(box(0.42, 0.6, 0.02, hell(farbe, 0.1), s * 0.225, 0.46, 0.475));
      g.add(box(0.36, 0.52, 0.02, hell(farbe, -0.08), s * 0.225, 0.46, 0.485));
      g.add(box(0.025, 0.14, 0.03, CHROM, s * 0.06, 0.62, 0.5));
    }
  }
  function geraet(o) {
    const g = new T.Group();
    const inhalt = new T.Group(); inhalt.position.y = 0.92;   // Ablage für Gegenstände
    inhalt.userData.dyn = true;
    let anim = null;
    g.zustand = 0;           // 0 aus, 1 arbeitet, 2 brennt (wird von außen gesetzt)
    const fest = new T.Group(); g.add(fest);
    switch (o.t) {
      case 'theke': sockel(fest, 0xd9c6a5, 0xf1ebe0); schrankTueren(fest, 0xd9c6a5); break;
      case 'brett': {
        sockel(fest, 0xd9c6a5, 0xf1ebe0); schrankTueren(fest, 0xd9c6a5);
        fest.add(box(0.7, 0.045, 0.52, glanz(0xc8915a, 30, 0x443322), 0, 0.945, 0));
        fest.add(box(0.7, 0.012, 0.04, 0xa4733f, 0, 0.969, -0.22));
        fest.add(box(0.7, 0.012, 0.04, 0xa4733f, 0, 0.969, 0.22));
        for (const x of [-0.3, 0.3]) fest.add(box(0.03, 0.05, 0.4, 0xb07d48, x, 0.95, 0));
        const messer = new T.Group(); messer.userData.dyn = true; messer.position.set(0.42, 0.97, 0.06);
        messer.add(box(0.045, 0.012, 0.22, CHROM, 0, 0, 0.04));
        messer.add(box(0.04, 0.03, 0.12, 0x2b1d16, 0, 0.006, -0.12));
        messer.children.forEach(c => { c.castShadow = true; });
        g.add(messer);
        inhalt.position.y = 0.97;
        anim = t => {
          if (g.zustand) { messer.position.set(0.0, 1.0 + Math.abs(Math.sin(t * 14)) * 0.08, 0.0); messer.rotation.set(0.3 - Math.abs(Math.sin(t * 14)) * 0.5, 0, 0); }
          else { messer.position.set(0.42, 0.97, 0.06); messer.rotation.set(0, 0, 0); }
        };
        break;
      }
      case 'herd': {
        fest.add(box(0.94, 0.86, 0.94, STAHL, 0, 0.43, 0));
        fest.add(box(0.8, 0.5, 0.02, GLAS_D, 0, 0.36, 0.475));                      // Ofentür
        fest.add(box(0.7, 0.4, 0.02, glanz(0x2a2d32, 140, 0xffffff), 0, 0.36, 0.486));
        fest.add(box(0.7, 0.03, 0.05, CHROM, 0, 0.64, 0.51));                       // Griff
        for (const x of [-0.33, 0.33]) fest.add(box(0.03, 0.03, 0.05, CHROM, x, 0.62, 0.49));
        fest.add(box(0.9, 0.04, 0.02, 0x2a2d31, 0, 0.03, 0.472));
        fest.add(box(1, 0.06, 1, glanz(0x15171a, 130, 0xaaaaaa), 0, 0.89, 0));
        fest.add(box(0.86, 0.14, 0.04, glanz(0x2a2d31, 100, 0x888888), 0, 0.8, 0.46));
        for (const x of [-0.3, -0.1, 0.1, 0.3]) { const k = zyl(0.04, 0.045, 0.045, CHROM, x, 0.8, 0.5, 10); k.rotation.x = Math.PI / 2; fest.add(k); fest.add(box(0.008, 0.03, 0.008, 0xe0453a, x, 0.82, 0.526)); }
        const glut = [];
        for (const [x, z] of [[-0.22, -0.22], [0.22, 0.22], [0.22, -0.22], [-0.22, 0.22]]) {
          const rg = ring(0.1, 0.016, 0x555a60, x, 0.925, z, 16); rg.rotation.x = Math.PI / 2; fest.add(rg);
          fest.add(ring(0.055, 0.012, 0x555a60, x, 0.925, z, 12).rotateX(Math.PI / 2));
          const gm = new T.MeshBasicMaterial({ color:0x2a2d31 });
          const gl = teil(geo('CircleGeometry', 0.1, 14), gm, x, 0.923, z, false); gl.rotation.x = -Math.PI / 2; gl.userData.dyn = true; g.add(gl); glut.push(gl);
          // Rost
          fest.add(box(0.22, 0.012, 0.012, 0x2e3136, x, 0.945, z)); fest.add(box(0.012, 0.012, 0.22, 0x2e3136, x, 0.945, z));
        }
        // Pfanne mit Griff
        fest.add(zyl(0.26, 0.22, 0.07, glanz(0x2b2c30, 60, 0x666666), -0.05, 0.96, 0.02, 20));
        fest.add(zyl(0.225, 0.225, 0.006, 0x1a1b1d, -0.05, 0.993, 0.02, 20));
        fest.add(ring(0.26, 0.01, 0x44464c, -0.05, 0.995, 0.02, 20).rotateX(Math.PI / 2));
        fest.add(box(0.28, 0.035, 0.05, 0x1f1f21, 0.34, 0.985, 0.02));
        inhalt.position.set(-0.05, 0.99, 0.02);
        anim = t => {
          const f = g.zustand;
          for (const gl of glut) gl.material.color.setHex(f === 2 ? 0xff3a1a : f === 1 ? (Math.sin(t * 5) > -2 ? 0xe8531f : 0xe8531f) : 0x2a2d31);
        };
        break;
      }
      case 'ofen': {
        fest.add(box(0.94, 1.1, 0.94, STAHL_D, 0, 0.55, 0));
        fest.add(box(0.76, 0.5, 0.02, GLAS_D, 0, 0.5, 0.475));
        const gl = teil(geo('PlaneGeometry', 0.62, 0.36), new T.MeshBasicMaterial({ color:0x2a1d14 }), 0, 0.5, 0.488, false); gl.userData.dyn = true; g.add(gl);
        fest.add(box(0.7, 0.04, 0.06, CHROM, 0, 0.82, 0.52));
        for (const x of [-0.33, 0.33]) fest.add(box(0.03, 0.04, 0.06, CHROM, x, 0.8, 0.5));
        for (const x of [-0.3, -0.1, 0.1, 0.3]) { const k = zyl(0.04, 0.045, 0.04, CHROM, x, 0.98, 0.49, 10); k.rotation.x = Math.PI / 2; fest.add(k); }
        fest.add(box(0.8, 0.14, 0.04, glanz(0x2a2d31, 100, 0x888888), 0, 0.98, 0.46));
        fest.add(box(1, 0.06, 1, glanz(0x6f747a, 70, 0x666666), 0, 1.12, 0));
        fest.add(box(0.56, 0.03, 0.56, glanz(0x3a3d40, 60, 0x777777), 0, 1.16, 0));
        for (const [w, d, x, z] of [[0.56, 0.02, 0, -0.27], [0.56, 0.02, 0, 0.27], [0.02, 0.56, -0.27, 0], [0.02, 0.56, 0.27, 0]]) fest.add(box(w, 0.04, d, 0x2a2d31, x, 1.175, z));
        inhalt.position.y = 1.18;
        anim = t => { gl.material.color.setHex(g.zustand === 2 ? 0xff5a2a : g.zustand === 1 ? (0xe0782a) : 0x2a1d14); };
        break;
      }
      case 'fritteuse': {
        sockel(fest, 0xa9aeb5, 0x8a8f96);
        fest.add(box(0.82, 0.07, 0.82, STAHL, 0, 0.93, 0));
        fest.add(box(0.66, 0.02, 0.66, glanz(0xe0a82a, 120, 0xffe9a0), 0, 0.965, 0));
        fest.add(box(0.5, 0.2, 0.05, STAHL_D, 0, 1.03, 0.36));
        fest.add(box(0.06, 0.06, 0.34, 0x222222, 0, 1.06, 0.5));
        fest.add(zyl(0.025, 0.025, 0.04, 0xe0453a, 0.18, 1.04, 0.39, 8).rotateX(Math.PI / 2));
        fest.add(skal(kugel(0.018, 0x3bd16f, -0.18, 1.04, 0.39, 6), 1, 1, 0.6));
        fest.add(zyl(0.012, 0.012, 0.3, 0xcfd4da, 0, 1.1, 0.34, 6).rotateZ(Math.PI / 2));
        inhalt.position.y = 0.97;
        break;
      }
      case 'fliessband': {
        fest.add(box(0.94, 0.7, 0.94, 0x4a4e55, 0, 0.35, 0));
        fest.add(box(0.98, 0.16, 0.98, 0x1f2124, 0, 0.78, 0));
        for (const s of [-1, 1]) {
          fest.add(box(0.06, 0.1, 0.98, 0xf2c230, s * 0.46, 0.88, 0));
          for (let i = 0; i < 5; i++) fest.add(box(0.062, 0.1, 0.09, 0x222222, s * 0.46, 0.881, -0.4 + i * 0.2));
          for (let i = 0; i < 4; i++) fest.add(zyl(0.04, 0.04, 0.9, 0x8f959d, 0, 0.84, -0.3 + i * 0.2, 8).rotateZ(Math.PI / 2));
        }
        const pfeile = new T.Group(); pfeile.userData.dyn = true; g.add(pfeile);
        const pf = [];
        for (let i = 0; i < 4; i++) {
          const p = new T.Group();
          for (const s of [-1, 1]) { const b = box(0.28, 0.012, 0.06, 0xf2c230, s * 0.1, 0, 0); b.rotation.y = s * 0.7; b.castShadow = false; p.add(b); }
          p.position.y = 0.875; pfeile.add(p); pf.push(p);
        }
        anim = t => { pf.forEach((p, i) => { p.position.z = -0.42 + ((t * 0.3 + i * 0.225) % 0.9); }); };
        inhalt.position.y = 0.87;
        break;
      }
      case 'greifarm': {
        fest.add(zyl(0.3, 0.36, 0.5, 0x3e4249, 0, 0.25, 0));
        fest.add(zyl(0.36, 0.36, 0.05, 0xf2a03a, 0, 0.02, 0));
        fest.add(zyl(0.2, 0.26, 0.1, 0x555a62, 0, 0.55, 0));
        const arm = new T.Group(); arm.position.y = 0.6; arm.userData.dyn = true;
        arm.add(zyl(0.08, 0.08, 0.5, 0xf2a03a, 0, 0.25, 0, 10));
        arm.add(kugel(0.1, 0xf2a03a, 0, 0.5, 0, 10));
        arm.add(box(0.1, 0.1, 0.9, 0xf2a03a, 0, 0.5, 0.05));
        arm.add(kugel(0.07, 0x333333, 0, 0.5, 0.5, 8));
        arm.add(box(0.2, 0.05, 0.08, 0x333333, 0, 0.42, 0.5));
        for (const s of [-1, 1]) arm.add(box(0.03, 0.14, 0.05, 0x7a7f87, s * 0.09, 0.34, 0.5));
        g.add(arm);
        anim = t => { arm.rotation.y = Math.sin(t * 2) * 0.05; };
        break;
      }
      case 'spuele': {
        sockel(fest, 0x9db8c9, 0xdfe6ea); schrankTueren(fest, 0x9db8c9);
        fest.add(box(0.58, 0.03, 0.54, glanz(0x6c7e89, 80, 0x888888), -0.12, 0.915, 0.05));
        fest.add(box(0.5, 0.02, 0.46, glanz(0x4a8cc0, 120, 0xaaccee), -0.12, 0.93, 0.05));
        fest.add(zyl(0.03, 0.03, 0.34, CHROM, -0.12, 1.07, -0.32, 8));
        fest.add(box(0.04, 0.04, 0.22, CHROM, -0.12, 1.22, -0.23));
        fest.add(kugel(0.03, CHROM, -0.12, 1.22, -0.12, 6));
        fest.add(box(0.03, 0.06, 0.03, 0xe0453a, -0.2, 1.0, -0.32)); fest.add(box(0.03, 0.06, 0.03, 0x3f7fd9, -0.04, 1.0, -0.32));
        // Abtropffläche mit Rillen
        for (let i = 0; i < 4; i++) fest.add(box(0.24, 0.006, 0.02, 0xaeb9c1, 0.28, 0.925, -0.16 + i * 0.1));
        break;
      }
      case 'spuelmaschine': {
        fest.add(box(0.94, 0.86, 0.94, glanz(0xf0f2f4, 60, 0x999999), 0, 0.43, 0));
        fest.add(box(0.8, 0.52, 0.02, glanz(0xdfe4e8, 70, 0xaaaaaa), 0, 0.4, 0.475));
        fest.add(box(0.5, 0.22, 0.02, glanz(0x2a3a48, 130, 0xffffff), 0, 0.46, 0.488));
        fest.add(box(0.56, 0.035, 0.05, CHROM, 0, 0.7, 0.5));
        fest.add(box(0.8, 0.1, 0.02, 0x3a4048, 0, 0.78, 0.48));
        for (const x of [-0.3, -0.2]) fest.add(box(0.06, 0.03, 0.02, 0x7a8a9a, x, 0.78, 0.492));
        fest.add(box(1, 0.06, 1, glanz(0xdfe6ea, 70, 0x777777), 0, 0.89, 0));
        const led = teil(geo('SphereGeometry', 0.028, 8, 6), new T.MeshBasicMaterial({ color:0x3bd16f }), 0.32, 0.78, 0.5, false); led.userData.dyn = true; g.add(led);
        anim = t => { led.material.color.setHex(g.zustand ? (Math.sin(t * 8) > 0 ? 0xffa030 : 0xc06a10) : 0x3bd16f); };
        break;
      }
      case 'tellerregal': {
        sockel(fest, 0xb8c4cc, 0xdfe6ea); schrankTueren(fest, 0xb8c4cc);
        for (const x of [-0.4, 0.4]) fest.add(box(0.05, 0.62, 0.05, 0x8a96a0, x, 1.2, -0.38));
        for (const y of [1.0, 1.5]) fest.add(box(0.9, 0.04, 0.2, 0xa4793f, 0, y, -0.38));
        fest.add(box(0.9, 0.025, 0.025, 0x8a96a0, 0, 1.46, -0.27));
        for (let i = 0; i < 4; i++) fest.add(zyl(0.1, 0.07, 0.015, 0xffffff, -0.28 + i * 0.19, 1.065, -0.38, 10).rotateX(Math.PI / 2.2));
        for (let i = 0; i < 3; i++) fest.add(zyl(0.07, 0.06, 0.1, 0xe0a42d, -0.2 + i * 0.2, 1.56, -0.38, 10));
        break;
      }
      case 'kiste': {
        const holz = glanz(0xb7854f, 20, 0x333333), dunkel = 0x8f6236;
        fest.add(box(0.84, 0.58, 0.84, 0x7c552c, 0, 0.3, 0));
        for (const y of [0.1, 0.25, 0.4, 0.55]) {
          for (const s of [-1, 1]) { fest.add(box(0.88, 0.12, 0.03, holz, 0, y, s * 0.43)); fest.add(box(0.03, 0.12, 0.88, holz, s * 0.43, y, 0)); }
        }
        for (const x of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) fest.add(box(0.07, 0.62, 0.07, dunkel, x, 0.31, z));
        fest.add(box(0.8, 0.02, 0.8, 0x6e4a28, 0, 0.58, 0));
        const e = [[-0.2, 0.2, 1.05], [0.2, 0.18, 1.0], [-0.05, -0.2, 1.05], [0.25, -0.22, 0.9], [-0.25, -0.1, 0.9]];
        for (const [x, z, s] of e) { const zz = zutat(o.z); zz.position.set(x, 0.59, z); zz.scale.setScalar(s); zz.rotation.y = x * 7; fest.add(zz); }
        // Etikett mit Symbol an der Vorderseite
        const eti = new T.Mesh(geo('PlaneGeometry', 0.3, 0.3), new T.MeshBasicMaterial({ map:kistenSymbol(o.z), transparent:true }));
        eti.position.set(0, 0.3, 0.447); eti.userData.fest = true; g.add(eti);
        inhalt.position.y = 0.7;
        break;
      }
      case 'muell': {
        fest.add(zyl(0.3, 0.26, 0.75, glanz(0x6e7781, 60, 0x777777), 0, 0.375, 0, 14));
        for (const y of [0.15, 0.4, 0.62]) fest.add(ring(0.285 - (0.62 - y) * 0.06, 0.012, 0x59626b, 0, y, 0, 14).rotateX(Math.PI / 2));
        fest.add(zyl(0.33, 0.31, 0.06, glanz(0x59606a, 60, 0x777777), 0, 0.78, 0, 14));
        fest.add(skal(kugel(0.3, glanz(0x59606a, 60, 0x777777), 0, 0.8, 0, 12), 1, 0.25, 1));
        fest.add(box(0.2, 0.04, 0.05, 0x2f3439, 0, 0.9, 0));
        fest.add(box(0.14, 0.03, 0.1, 0x2f3439, 0, 0.04, 0.3));
        break;
      }
      case 'tisch': {
        g.add(teil(geo('BoxGeometry', 0.98, 0.02, 0.98), tischdecke(), 0, 0.763, 0));
        fest.add(box(0.96, 0.07, 0.96, 0xb07a45, 0, 0.72, 0));
        fest.add(box(1.02, 0.1, 0.02, 0xf4efe6, 0, 0.7, 0.5)); fest.add(box(1.02, 0.1, 0.02, 0xf4efe6, 0, 0.7, -0.5));
        fest.add(box(0.02, 0.1, 0.98, 0xf4efe6, 0.5, 0.7, 0)); fest.add(box(0.02, 0.1, 0.98, 0xf4efe6, -0.5, 0.7, 0));
        for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) fest.add(box(0.06, 0.7, 0.06, 0x8a5a30, x, 0.35, z));
        // Stühle an den vier Seiten
        for (const [x, z] of [[-0.74, 0], [0.74, 0], [0, -0.74], [0, 0.74]]) {
          const st = new T.Group();
          st.add(box(0.36, 0.05, 0.36, 0xc9894f, 0, 0.42, 0));
          st.add(box(0.3, 0.04, 0.3, 0xd9604a, 0, 0.455, 0));
          for (const [a, b] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) st.add(box(0.04, 0.42, 0.04, 0x8a5a30, a, 0.21, b));
          st.add(box(0.36, 0.05, 0.04, 0xc9894f, 0, 0.84, -0.17));
          for (const a of [-0.13, 0, 0.13]) st.add(box(0.05, 0.4, 0.03, 0xc9894f, a, 0.64, -0.17));
          st.add(box(0.36, 0.04, 0.04, 0xc9894f, 0, 0.5, -0.17));
          st.position.set(x, 0, z);
          st.rotation.y = Math.atan2(-x, -z) + Math.PI;
          fest.add(st);
        }
        // Deko in der Ecke (damit der Teller frei liegt): Vase mit Blume, Kerze, Salzstreuer
        fest.add(zyl(0.03, 0.04, 0.1, 0x7fb6d9, -0.34, 0.82, -0.34, 8));
        fest.add(zyl(0.006, 0.006, 0.12, 0x3f8f2f, -0.34, 0.92, -0.34, 4));
        fest.add(kugel(0.04, 0xe85a6f, -0.34, 0.99, -0.34, 8));
        fest.add(kugel(0.015, 0xffd65a, -0.34, 1.0, -0.31, 5));
        fest.add(zyl(0.02, 0.02, 0.07, 0xfff4e0, 0.34, 0.8, -0.34, 8));
        fest.add(kugel(0.012, 0xffa030, 0.34, 0.85, -0.34, 5));
        fest.add(zyl(0.014, 0.014, 0.05, 0xffffff, 0.34, 0.8, 0.34, 6));
        inhalt.position.y = 0.775;
        break;
      }
      default: sockel(fest, 0xff00ff);
    }
    backen(g);
    g.add(inhalt);
    g.inhalt = inhalt;
    g.anim = anim;
    g.rotation.y = DREH[o.r] || 0;
    return g;
  }
  const symCache = new Map();
  const SYM = { tomate:'🍅', salat:'🥬', fleisch:'🥩', broetchen:'🍞', kartoffel:'🥔', teig:'🫓', kaese:'🧀' };
  function kistenSymbol(z) {
    if (!symCache.has(z)) {
      symCache.set(z, leinwandTextur(96, 96, (x) => {
        x.fillStyle = '#fff4dd'; rundRechteck(x, 4, 4, 88, 88, 18); x.fill();
        x.strokeStyle = '#8f6236'; x.lineWidth = 5; x.stroke();
        x.font = '56px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(SYM[z] || '📦', 48, 52);
      }));
    }
    return symCache.get(z);
  }
  let tischdeckeMat = null;
  function tischdecke() {
    if (!tischdeckeMat) {
      const t = karoTextur('#fbf3e4', '#e8624e'); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1.5, 1.5);
      tischdeckeMat = new T.MeshLambertMaterial({ map:t });
    }
    return tischdeckeMat;
  }

  /* ---------- Tiere ---------- */
  const ARTEN = {
    // Köche
    loewe:{ fell:0xe8a03c, bauch:0xf6d08a, ohren:'rund', maul:'kurz', extra:'maehne', mfarbe:0xa8561a, bart:1, innen:0xf2b8a0, schwanz:'loewe' },
    pinguin:{ fell:0x2a2d35, bauch:0xf4f4f4, ohren:'keine', maul:'schnabel', schnabel:0xf29a2e, extra:'pinguin', schwanz:'klein' },
    waschbaer:{ fell:0x8d8f93, bauch:0xd8d8d8, ohren:'spitz', maul:'kurz', extra:'maske', bart:1, innen:0x4a4a4e, schwanz:'ringe' },
    fuchs:{ fell:0xe0702a, bauch:0xfaf3ea, ohren:'spitz', maul:'spitz', extra:'fuchs', bart:1, innen:0x3a2a22, schwanz:'fuchs' },
    baer:{ fell:0x7b5233, bauch:0xc49a6c, ohren:'rund', maul:'kurz', innen:0xc49a6c, schwanz:'ball' },
    hase:{ fell:0xf2efe9, bauch:0xffffff, ohren:'lang', maul:'hase', bart:1, innen:0xf3a5b5, schwanz:'ball' },
    // Gäste
    katze:{ fell:0x9a9a9a, bauch:0xeeeeee, ohren:'spitz', maul:'kurz', bart:1, innen:0xf0b0b8, extra:'streifen', schwanz:'lang' },
    hund:{ fell:0xc9955c, bauch:0xf2dcc0, ohren:'schlapp', maul:'kurz', extra:'fleck', schwanz:'hund' },
    ente:{ fell:0xf6d743, bauch:0xfbe77a, ohren:'keine', maul:'schnabel', schnabel:0xf08a24, extra:'ente', schwanz:'klein' },
    maus:{ fell:0xa9a2a0, bauch:0xe6dcda, ohren:'gross', maul:'spitz', bart:1, innen:0xf0b0b8, schwanz:'lang' },
    schwein:{ fell:0xf3a9b4, bauch:0xf8c8cf, ohren:'spitz', maul:'schwein', innen:0xe98f9d, schwanz:'ringel' }
  };
  const GAST_ARTEN = ['katze', 'hund', 'ente', 'maus', 'schwein'];
  const GAST_FARBEN = [0xe5d0b0, 0x9a9a9a, 0x6b4a32, 0xf2efe9, 0xd99a5a, 0x4e5157];
  const KLEIDUNG = [0x3f7fd9, 0xd94f3f, 0x48a85a, 0xa34fd9, 0xe0a42d, 0x2fb3b0];

  let blobTex = null;
  function schattenFleck(r) {
    if (!blobTex) blobTex = weicherPunkt('20,12,6');
    const m = new T.Mesh(geo('PlaneGeometry', r * 2, r * 2), new T.MeshBasicMaterial({ map:blobTex, transparent:true, opacity:0.55, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1; m.userData.fest = true;
    return m;
  }

  function schwanzBauen(art, A, fell) {
    const s = new T.Group(); s.userData.dyn = true; s.position.set(0, 0.22, -0.24);
    switch (A.schwanz) {
      case 'loewe': { const a = zyl(0.04, 0.03, 0.32, fell, 0, 0.0, -0.14, 7); a.rotation.x = 1.25; s.add(a); const b = zyl(0.03, 0.024, 0.2, fell, 0, 0.1, -0.33, 7); b.rotation.x = 0.4; s.add(b); s.add(skal(kugel(0.07, A.mfarbe, 0, 0.21, -0.38, 8), 0.9, 1.2, 1.5)); break; }
      case 'fuchs': { s.add(skal(kugel(0.11, fell, 0, 0.06, -0.14, 9), 0.85, 0.85, 2.1)); s.add(skal(kugel(0.08, 0xffffff, 0, 0.1, -0.34, 8), 0.9, 0.9, 1.3)); break; }
      case 'lang': { const a = zyl(0.022, 0.016, 0.42, fell, 0, 0.12, -0.14, 6); a.rotation.x = 1.1; s.add(a); break; }
      case 'hund': { const a = zyl(0.03, 0.02, 0.22, fell, 0, 0.1, -0.1, 6); a.rotation.x = 0.8; s.add(a); break; }
      case 'ball': s.add(kugel(0.07, A.bauch, 0, 0.04, -0.07, 8)); break;
      case 'ringe': for (let i = 0; i < 4; i++) s.add(skal(kugel(0.07, i % 2 ? 0x2d2d30 : fell, 0, 0.04 + i * 0.01, -0.07 - i * 0.09, 8), 1, 1, 1.1)); break;
      case 'ringel': s.add(ring(0.04, 0.012, 0xe98f9d, 0, 0.05, -0.08, 8, Math.PI * 1.6)); break;
      default: { const k = kegel(0.07, 0.14, art === 'ente' ? 0xf6d743 : fell, 0, 0.04, -0.1, 6); k.rotation.x = -1.9; s.add(k); }
    }
    return s;
  }

  function tier(art, o = {}) {
    const A = ARTEN[art] || ARTEN.loewe;
    const fell = o.fell != null ? o.fell : A.fell;
    const koch = !!o.muetze;
    const hemd = o.hemd != null ? o.hemd : null;
    const g = new T.Group();
    g.add(schattenFleck(0.34));
    const koerper = new T.Group(); koerper.userData.dyn = true; g.add(koerper);
    const rumpfFarbe = koch ? 0xfdfbf6 : hemd != null ? hemd : fell;
    const schuh = A.maul === 'schnabel' ? A.schnabel : 0x4a2f1d;
    // Beine mit Hose und Schuhen (wackeln beim Laufen)
    const beine = [];
    for (const s of [-1, 1]) {
      const b = new T.Group(); b.position.set(s * 0.11, 0.1, 0); b.userData.dyn = true;
      b.add(zyl(0.07, 0.075, 0.14, koch ? 0x3d4458 : A.maul === 'schnabel' ? A.schnabel : fell, 0, 0.04, 0, 8));
      b.add(skal(kugel(0.085, schuh, 0, -0.045, 0.035, 8), 1, 0.6, 1.55));
      g.add(b); beine.push(b);
    }
    // Rumpf
    const rumpf = zyl(0.2, 0.26, 0.44, rumpfFarbe, 0, 0.36, 0, 16); koerper.add(rumpf);
    koerper.add(skal(kugel(0.205, rumpfFarbe, 0, 0.57, 0, 12), 1, 0.35, 1));    // Schultern runden
    if (koch) {
      for (const y of [0.5, 0.41, 0.32]) for (const x of [-0.045, 0.045]) koerper.add(skal(kugel(0.018, 0xc9b27a, x, y, 0.232 + (0.5 - y) * 0.06, 6), 1, 1, 0.6));
      koerper.add(box(0.012, 0.36, 0.01, 0xe6e2d8, 0, 0.39, 0.24));
      // Halstuch in Spielerfarbe
      const hals = ring(0.15, 0.036, o.halsFarbe != null ? o.halsFarbe : 0xd94f3f, 0, 0.605, 0.0, 14); hals.rotation.x = Math.PI / 2; koerper.add(hals);
      const zip = kegel(0.06, 0.12, o.halsFarbe != null ? o.halsFarbe : 0xd94f3f, 0, 0.55, 0.17, 3); zip.rotation.set(Math.PI, 0, 0); zip.scale.z = 0.4; koerper.add(zip);
      // Schürze mit Tasche und Band
      koerper.add(zyl(0.262, 0.262, 0.04, 0x3f6e8c, 0, 0.215, 0, 16));
      koerper.add(box(0.34, 0.24, 0.03, 0x4a7d9e, 0, 0.17, 0.25));
      koerper.add(box(0.18, 0.08, 0.035, 0x3a6580, 0, 0.17, 0.262));
      koerper.add(box(0.012, 0.06, 0.04, 0xfdfbf6, -0.04, 0.2, 0.266));
    } else {
      if (A.extra === 'pinguin' || (!hemd && A.bauch)) koerper.add(skal(kugel(0.17, A.bauch, 0, 0.36, 0.12, 10), 1, 1.15, 0.5));
      if (hemd != null) {
        for (const y of [0.46, 0.36, 0.26]) koerper.add(skal(kugel(0.016, 0xfff4e0, 0, y, 0.215 + (0.46 - y) * 0.05, 6), 1, 1, 0.6));
        for (const s of [-1, 1]) { const k = kegel(0.05, 0.09, 0xffffff, s * 0.06, 0.58, 0.2, 3); k.rotation.set(Math.PI / 2 + 0.3, 0, s * 0.8); k.scale.z = 0.35; koerper.add(k); }
        if (o.acc === 1) { koerper.add(skal(kugel(0.04, 0xe0453a, -0.05, 0.57, 0.23, 6), 1, 0.9, 0.6)); koerper.add(skal(kugel(0.04, 0xe0453a, 0.05, 0.57, 0.23, 6), 1, 0.9, 0.6)); koerper.add(kugel(0.022, 0xb02a20, 0, 0.57, 0.24, 6)); }
        if (o.acc === 5) { const h = ring(0.15, 0.04, 0xf2c230, 0, 0.6, 0.0, 12); h.rotation.x = Math.PI / 2; koerper.add(h); koerper.add(box(0.08, 0.16, 0.04, 0xf2c230, 0.08, 0.5, 0.17)); }
      }
    }
    // Arme: Ärmel, Unterarm, Hand
    const arme = [];
    for (const s of [-1, 1]) {
      const a = new T.Group(); a.position.set(s * 0.25, 0.5, 0.02); a.userData.dyn = true;
      const aermel = koch ? 0xfdfbf6 : hemd != null ? hemd : fell;
      a.add(zyl(0.065, 0.058, 0.15, aermel, 0, -0.06, 0.02, 8));
      if (koch) a.add(zyl(0.066, 0.066, 0.03, 0xe6e2d8, 0, -0.14, 0.04, 8));
      a.add(zyl(0.05, 0.045, 0.12, A.extra === 'pinguin' ? fell : fell, 0, -0.17, 0.05, 8));
      a.add(kugel(0.062, A.extra === 'pinguin' ? fell : fell, 0, -0.23, 0.07, 8));
      a.rotation.x = -0.3;
      koerper.add(a); arme.push(a);
    }
    // Kopf
    const kopf = new T.Group(); kopf.position.y = 0.8; kopf.userData.dyn = true; koerper.add(kopf);
    const kopfFarbe = A.extra === 'pinguin' ? fell : fell;
    kopf.add(kugel(0.23, kopfFarbe, 0, 0, 0, 16));
    if (A.extra === 'maehne') {
      kopf.add(skal(kugel(0.3, A.mfarbe, 0, 0.0, -0.07, 12), 1, 1, 0.7));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        kopf.add(skal(kugel(0.1, i % 2 ? A.mfarbe : 0xc4701f, Math.cos(a) * 0.27, Math.sin(a) * 0.27, -0.04, 7), 1, 1, 0.8));
      }
      kopf.add(skal(kugel(0.2, A.fell, 0, -0.02, 0.07, 12), 1, 1, 0.8));       // Gesichtsscheibe vor der Mähne
    }
    if (A.extra === 'maske') { kopf.add(skal(kugel(0.1, 0x2d2d30, -0.085, 0.045, 0.145, 8), 1.1, 0.9, 0.5)); kopf.add(skal(kugel(0.1, 0x2d2d30, 0.085, 0.045, 0.145, 8), 1.1, 0.9, 0.5)); kopf.add(skal(kugel(0.09, 0xe6e6e6, 0, 0.0, 0.2, 8), 0.6, 1.1, 0.4)); }
    if (A.extra === 'pinguin') { kopf.add(skal(kugel(0.17, 0xffffff, 0, -0.03, 0.12, 12), 1.1, 1.0, 0.65)); }
    if (A.extra === 'fuchs') for (const s of [-1, 1]) { const k = kegel(0.07, 0.15, 0xffffff, s * 0.17, -0.06, 0.1, 6); k.rotation.set(Math.PI / 2 - 0.2, 0, s * 1.2); kopf.add(k); }
    if (A.extra === 'ente') { kopf.add(skal(kugel(0.03, A.fell, 0, 0.23, 0.04, 6), 0.7, 1.5, 0.7)); kopf.add(skal(kugel(0.03, A.fell, 0.01, 0.25, 0.0, 6), 0.7, 1.5, 0.7)); }
    if (A.extra === 'streifen') for (const x of [-0.05, 0, 0.05]) { const b = box(0.02, 0.07, 0.01, hell(fell, -0.35), x, 0.2, 0.1); b.rotation.x = -0.6; kopf.add(b); }
    if (A.extra === 'fleck') kopf.add(skal(kugel(0.09, 0x7a5233, 0.11, 0.08, 0.14, 8), 1, 1.1, 0.5));
    // Augen (blinzeln)
    const augen = new T.Group(); augen.userData.dyn = true; kopf.add(augen);
    for (const s of [-1, 1]) {
      augen.add(skal(kugel(0.052, 0xffffff, s * 0.088, 0.04, 0.192, 10), 1, 1.12, 0.6));
      augen.add(kugel(0.034, 0x1a1a1a, s * 0.088 + s * -0.004, 0.038, 0.218, 8));
      augen.add(kugel(0.012, 0xffffff, s * 0.088 + 0.012, 0.055, 0.243, 5));
      augen.add(kugel(0.006, 0xffffff, s * 0.088 - 0.01, 0.028, 0.245, 4));
    }
    // Brauen und Wangen
    for (const s of [-1, 1]) {
      const br = box(0.07, 0.014, 0.012, hell(A.extra === 'pinguin' ? 0x1a1a1a : fell, -0.5), s * 0.09, 0.115, 0.205); br.rotation.z = -s * 0.2; br.rotation.x = -0.25; kopf.add(br);
      if (A.extra !== 'pinguin' && A.extra !== 'maske') kopf.add(skal(kugel(0.032, 0xf4a6a0, s * 0.148, -0.045, 0.165, 6), 1, 0.7, 0.35));
    }
    switch (A.maul) {
      case 'kurz': {
        for (const s of [-1, 1]) kopf.add(skal(kugel(0.062, A.bauch, s * 0.048, -0.075, 0.185, 8), 1, 0.9, 0.9));
        kopf.add(skal(kugel(0.036, 0x2a1a14, 0, -0.03, 0.248, 8), 1.3, 0.9, 0.9));
        const l = ring(0.028, 0.006, 0x2a1a14, 0, -0.075, 0.247, 8, Math.PI); l.rotation.z = Math.PI; kopf.add(l);
        break;
      }
      case 'spitz': {
        const m = kegel(0.09, 0.2, A.bauch, 0, -0.06, 0.24, 10); m.rotation.x = Math.PI / 2; kopf.add(m);
        kopf.add(kugel(0.03, 0x1a1a1a, 0, -0.045, 0.345, 6));
        const l = ring(0.02, 0.005, 0x2a1a14, 0, -0.085, 0.28, 8, Math.PI); l.rotation.z = Math.PI; kopf.add(l);
        break;
      }
      case 'schnabel': {
        if (A.extra === 'pinguin') {
          const m = kegel(0.07, 0.17, A.schnabel, 0, -0.04, 0.25, 8); m.rotation.x = Math.PI / 2; m.scale.y = 1; kopf.add(m);
          kopf.add(skal(kugel(0.05, hell(A.schnabel, -0.15), 0, -0.07, 0.24, 6), 1.2, 0.5, 1.4));
        } else {
          kopf.add(skal(kugel(0.1, A.schnabel, 0, -0.035, 0.235, 10), 1.25, 0.45, 1.2));
          kopf.add(skal(kugel(0.085, hell(A.schnabel, -0.15), 0, -0.075, 0.23, 10), 1.2, 0.35, 1.1));
          for (const s of [-1, 1]) kopf.add(kugel(0.008, 0x8a4a14, s * 0.03, -0.02, 0.29, 4));
        }
        break;
      }
      case 'schwein': {
        const m = zyl(0.085, 0.09, 0.07, 0xee9aa8, 0, -0.04, 0.245, 12); m.rotation.x = Math.PI / 2; kopf.add(m);
        for (const s of [-1, 1]) kopf.add(skal(kugel(0.02, 0x8a3a48, s * 0.032, -0.04, 0.285, 6), 0.8, 1.3, 0.5));
        break;
      }
      case 'hase': {
        for (const s of [-1, 1]) kopf.add(skal(kugel(0.062, 0xffffff, s * 0.045, -0.07, 0.185, 8), 1, 0.9, 0.9));
        kopf.add(skal(kugel(0.03, 0xf08a9c, 0, -0.03, 0.245, 6), 1.2, 0.8, 0.8));
        for (const s of [-1, 1]) kopf.add(box(0.026, 0.04, 0.012, 0xffffff, s * 0.014, -0.115, 0.238));
        break;
      }
    }
    if (A.bart) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = box(0.13, 0.004, 0.004, 0xf5f0e8, s * 0.1, -0.06 - i * 0.012, 0.235); w.rotation.z = s * (0.1 - i * 0.13); w.rotation.y = -s * 0.25; kopf.add(w);
    }
    const ohr = (x, y, z, rz) => {
      switch (A.ohren) {
        case 'rund': { const grp = new T.Group(); grp.add(kugel(0.085, fell, x, y, z, 8)); grp.add(skal(kugel(0.055, A.innen || fell, x * 1.0, y, z + 0.04, 7), 1, 1, 0.5)); return grp; }
        case 'gross': { const grp = new T.Group(); const k = skal(kugel(0.13, fell, x * 1.2, y + 0.02, z, 12), 1, 1, 0.35); grp.add(k); grp.add(skal(kugel(0.09, A.innen, x * 1.2, y + 0.02, z + 0.03, 10), 1, 1, 0.3)); return grp; }
        case 'spitz': { const grp = new T.Group(); const k = kegel(0.085, 0.18, fell, x, y + 0.04, z, 6); k.rotation.z = rz; grp.add(k); const k2 = kegel(0.05, 0.12, A.innen || fell, x, y + 0.035, z + 0.025, 6); k2.rotation.z = rz; grp.add(k2); return grp; }
        case 'lang': { const grp = new T.Group(); const k = skal(kugel(0.065, fell, x * 0.6, y + 0.24, z, 8), 0.8, 3.4, 0.6); k.rotation.z = rz * 0.5; grp.add(k); const k2 = skal(kugel(0.04, A.innen, x * 0.6, y + 0.24, z + 0.02, 8), 0.7, 3.0, 0.5); k2.rotation.z = rz * 0.5; grp.add(k2); return grp; }
        case 'schlapp': { const k = skal(kugel(0.08, 0x7a5233, x * 1.25, y - 0.1, z, 8), 0.6, 1.7, 0.8); k.rotation.z = rz * 0.3; return k; }
      }
      return null;
    };
    for (const s of [-1, 1]) { const e = ohr(s * 0.16, 0.17, -0.02, -s * 0.35); if (e) kopf.add(e); }
    // Kochmütze (hohe Toque mit Falten) oder Zubehör der Gäste
    if (koch) {
      const m = new T.Group(); m.position.y = 0.2;
      m.add(zyl(0.155, 0.155, 0.1, 0xffffff, 0, 0.03, 0, 14));
      m.add(zyl(0.157, 0.157, 0.02, 0xe6e2d8, 0, 0.0, 0, 14));
      m.add(zyl(0.17, 0.155, 0.16, 0xffffff, 0, 0.16, 0, 14));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; m.add(skal(kugel(0.07, 0xf6f3ec, Math.cos(a) * 0.14, 0.2, Math.sin(a) * 0.14, 7), 0.5, 2.2, 0.5)); }
      m.add(kugel(0.13, 0xffffff, 0, 0.3, 0, 12));
      m.add(kugel(0.1, 0xfcfaf5, 0.1, 0.27, 0.04, 9)); m.add(kugel(0.1, 0xfcfaf5, -0.1, 0.27, -0.03, 9));
      m.rotation.x = -0.1;
      kopf.add(m);
    } else if (o.acc) {
      if (o.acc === 2) for (const s of [-1, 1]) { kopf.add(ring(0.062, 0.01, 0x2b2b2f, s * 0.088, 0.04, 0.232, 12)); }
      if (o.acc === 2) kopf.add(box(0.05, 0.01, 0.01, 0x2b2b2f, 0, 0.045, 0.238));
      if (o.acc === 3) { const m = new T.Group(); m.position.y = 0.22; m.add(zyl(0.17, 0.17, 0.02, 0x2b2b2f, 0, 0, 0, 14)); m.add(zyl(0.11, 0.11, 0.17, 0x2b2b2f, 0, 0.09, 0, 14)); m.add(zyl(0.113, 0.113, 0.04, 0xd94f3f, 0, 0.04, 0, 14)); m.rotation.x = -0.1; kopf.add(m); }
      if (o.acc === 4) { const m = new T.Group(); m.position.set(0, 0.2, 0.0); m.add(skal(kugel(0.2, hemd, 0, 0.02, 0, 12), 1, 0.55, 1)); m.add(box(0.22, 0.015, 0.14, hell(hemd, -0.2), 0, 0.01, 0.2)); m.add(kugel(0.03, 0xffffff, 0, 0.13, 0, 6)); kopf.add(m); }
    }
    // Bunter Schwanz
    const schwanz = schwanzBauen(art, A, fell); g.add(schwanz);
    const hand = new T.Group(); hand.position.set(0, 0.42, 0.36); g.add(hand); g.hand = hand;
    backen(augen); arme.forEach(backen); beine.forEach(backen); backen(schwanz); backen(kopf); backen(koerper);
    g.arme = arme; g.beine = beine; g.koerper = koerper; g.kopf = kopf; g.augen = augen; g.schwanz = schwanz;
    g.schritt = 0;
    const phase = Math.random() * 10;
    g.animieren = (dt, tempo, traegt, arbeitet, t) => {
      g.schritt += dt * tempo * 9;
      const sw = tempo > 0.1 ? Math.sin(g.schritt) : 0;
      beine[0].position.z = sw * 0.08; beine[1].position.z = -sw * 0.08;
      beine[0].position.y = 0.1 + Math.max(0, sw) * 0.03; beine[1].position.y = 0.1 + Math.max(0, -sw) * 0.03;
      koerper.position.y = Math.abs(sw) * 0.04 + (tempo > 0.1 ? 0 : Math.sin(t * 2 + phase) * 0.006);
      koerper.rotation.z = sw * 0.04;
      const ziel = traegt ? -1.25 : arbeitet ? -1.0 + Math.sin(t * 22) * 0.45 : -0.3 + sw * 0.4;
      arme[0].rotation.x += ((traegt || arbeitet ? ziel : -0.3 + sw * 0.4) - arme[0].rotation.x) * Math.min(1, dt * 14);
      arme[1].rotation.x += ((traegt ? ziel : arbeitet ? -1.0 - Math.sin(t * 22) * 0.45 : -0.3 - sw * 0.4) - arme[1].rotation.x) * Math.min(1, dt * 14);
      // Blinzeln und Schwanzwedeln
      const b = ((t * 0.31 + phase) % 1);
      augen.scale.y = b < 0.035 ? 0.1 : 1;
      schwanz.rotation.y = Math.sin(t * (tempo > 0.1 ? 9 : 3) + phase) * (tempo > 0.1 ? 0.35 : 0.2);
    };
    return g;
  }
  function koch(art, farbe) {
    const g = tier(art, { muetze:true, halsFarbe:farbe });
    const r = new T.Mesh(geo('RingGeometry', 0.33, 0.42, 28), new T.MeshBasicMaterial({ color:farbe, transparent:true, opacity:0.85 }));
    r.rotation.x = -Math.PI / 2; r.position.y = 0.015;
    g.add(r);
    return g;
  }
  function gast(a, fa) {
    const art = GAST_ARTEN[a % GAST_ARTEN.length];
    const fell = art === 'ente' || art === 'schwein' ? null : GAST_FARBEN[fa % GAST_FARBEN.length];
    const g = tier(art, { hemd:KLEIDUNG[(a * 3 + fa) % KLEIDUNG.length], fell, acc:(a * 5 + fa * 3) % 6 });
    g.scale.setScalar(0.82);
    return g;
  }

  // Zielmarkierung (Rahmen auf der angepeilten Kachel)
  function markierung() {
    const g = new T.Group();
    const m = new T.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9, depthTest:false });
    for (const [w, d, x, z] of [[1, 0.06, 0, -0.5], [1, 0.06, 0, 0.5], [0.06, 1, -0.5, 0], [0.06, 1, 0.5, 0]]) {
      const b = new T.Mesh(geo('BoxGeometry', w, 0.02, d), m); b.position.set(x, 0, z); b.renderOrder = 5; g.add(b);
    }
    return g;
  }

  window.LKM = { raum, geraet, ding, dingSchluessel, zutat, koch, gast, tier, balken, textSprite, blase, markierung, DREH, BILD, ARTEN, entsorgen, weicherPunkt, leinwandTextur };
})();
