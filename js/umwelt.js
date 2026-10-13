/* Löwenküche – Umgebung und Effekte: Tag/Nacht-Stimmung, Nebel, Wolkenschatten, Lichtpfützen,
   Dampf, Rauch, Funken, Staub, Konfetti. Alles aus Canvas-Texturen und wenigen Sprites/Punkten (ein Zeichenaufruf je Schicht).
   Qualität 'hoch' oder 'niedrig' (Handy): weniger Partikel, kein Staub in der Luft. */
(function () {
  'use strict';
  const T = THREE;
  const farbe = h => new T.Color(h);

  /* ---------- Stimmung: Licht, Nebel, Himmelsfarbe, Fenster, Lampen ---------- */
  function welt(szene, o) {
    const { halb, sonne, lampen, raum, himmelTag, himmelNacht } = o;
    szene.fog = new T.Fog(himmelTag.getHex(), 34, 80);
    const tagHalb = farbe(0xfff4e2), nachtHalb = farbe(0x7f93d6), tagBoden = farbe(0x8f7f68), nachtBoden = farbe(0x2c2a4a);
    const tagSonne = farbe(0xffefd2), nachtSonne = farbe(0x8fa6ff);
    const glasTag = farbe(0xa9dcf3), glasNacht = farbe(0xffd98a);
    const tmp = new T.Color();
    // Warme Lichtpfützen unter den Lampen (nachts)
    const lichtTex = LKM.weicherPunkt('255,214,140');
    const pfuetzen = [];
    for (const l of lampen) {
      const m = new T.Mesh(new T.PlaneGeometry(5.5, 5.5), new T.MeshBasicMaterial({ map:lichtTex, transparent:true, opacity:0, depthWrite:false, blending:T.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.set(l.position.x, 0.02, l.position.z); m.renderOrder = 2;
      szene.add(m); pfuetzen.push(m);
    }
    // Wolkenschatten wandern langsam über Wiese und Boden
    const wolkenTex = LKM.weicherPunkt('10,30,10');
    const wolken = [];
    const nW = o.qualitaet === 'niedrig' ? 2 : 4;
    for (let i = 0; i < nW; i++) {
      const gr = 9 + (i % 3) * 4;
      const m = new T.Mesh(new T.PlaneGeometry(gr, gr * 0.6), new T.MeshBasicMaterial({ map:wolkenTex, transparent:true, opacity:0.13, depthWrite:false }));
      m.rotation.x = -Math.PI / 2; m.position.set(-24 + i * 9, 0.035, -4 + (i * 7) % 20); m.renderOrder = 3;
      m.userData.v = 0.35 + (i % 3) * 0.15;
      szene.add(m); wolken.push(m);
    }
    // Hängelampen: Lichthof um die Glühbirnen
    const hofTex = LKM.weicherPunkt('255,230,170');
    const hoefe = [];
    for (const gl of (raum.lampenGlas || [])) {
      const s = new T.Sprite(new T.SpriteMaterial({ map:hofTex, transparent:true, opacity:0, depthWrite:false, blending:T.AdditiveBlending }));
      s.scale.set(1.3, 1.3, 1); s.position.copy(gl.position);
      szene.add(s); hoefe.push(s);
    }
    return {
      aktualisieren(licht, t, dt) {
        szene.background.copy(himmelTag).lerp(himmelNacht, licht);
        szene.fog.color.copy(szene.background);
        halb.color.copy(tagHalb).lerp(nachtHalb, licht);
        halb.groundColor.copy(tagBoden).lerp(nachtBoden, licht);
        sonne.color.copy(tagSonne).lerp(nachtSonne, licht);
        if (raum.glasMat) raum.glasMat.color.copy(glasTag).lerp(glasNacht, licht);
        for (const m of pfuetzen) { m.material.opacity = licht * 0.34; m.visible = licht > 0.02; }
        for (const s of hoefe) { s.material.opacity = licht * 0.9; s.visible = licht > 0.02; }
        for (const gl of (raum.lampenGlas || [])) gl.material.color.setHex(licht > 0.3 ? 0xfff1c2 : 0xe8dcc0);
        for (const m of wolken) {
          m.position.x += dt * m.userData.v; if (m.position.x > 34) m.position.x = -34;
          m.material.opacity = 0.13 * (1 - licht * 0.8); m.visible = licht < 0.9;
        }
      }
    };
  }

  /* ---------- Partikel ---------- */
  class Schicht {
    constructor(szene, n, additiv, tex, faktor) {
      this.n = n; this.i = 0; this.faktor = faktor;
      this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.gr = new Float32Array(n);
      this.v = new Float32Array(n * 3); this.leb = new Float32Array(n * 2);     // Rest, Gesamt
      this.s = new Float32Array(n * 2); this.c0 = new Float32Array(n * 3); this.c1 = new Float32Array(n * 3); this.p = new Float32Array(n * 3);  // Größe 0/1; Farbe; alpha, schwerkraft, bremse
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
      g.setAttribute('farbe', new T.BufferAttribute(this.col, 4));
      g.setAttribute('groesse', new T.BufferAttribute(this.gr, 1));
      g.boundingSphere = new T.Sphere(new T.Vector3(7, 1, 6), 80);
      this.geo = g;
      this.mat = new T.ShaderMaterial({
        uniforms:{ tex:{ value:tex }, massstab:{ value:600 } },
        vertexShader:'attribute float groesse; attribute vec4 farbe; varying vec4 vF; uniform float massstab; void main(){ vF=farbe; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(64.0,max(0.0,groesse)*massstab/-mv.z); gl_Position=projectionMatrix*mv; }',
        fragmentShader:'uniform sampler2D tex; varying vec4 vF; void main(){ vec4 t=texture2D(tex,gl_PointCoord); gl_FragColor=vec4(vF.rgb,vF.a*t.a); if(gl_FragColor.a<0.004) discard; }',
        transparent:true, depthWrite:false, blending:additiv ? T.AdditiveBlending : T.NormalBlending
      });
      this.punkte = new T.Points(g, this.mat);
      this.punkte.frustumCulled = false; this.punkte.renderOrder = additiv ? 8 : 7;
      szene.add(this.punkte);
      for (let k = 0; k < n; k++) { this.leb[k * 2] = 0; this.gr[k] = 0; }
    }
    // Ein Teilchen: Ort, Geschwindigkeit, Lebensdauer, Größe von/bis, Farbe von/bis, Deckkraft, Schwerkraft, Bremse
    neu(x, y, z, vx, vy, vz, leben, s0, s1, c0, c1, a = 0.5, grav = 0, bremse = 0.5) {
      const k = this.i; this.i = (this.i + 1) % this.n;
      this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
      this.v[k * 3] = vx; this.v[k * 3 + 1] = vy; this.v[k * 3 + 2] = vz;
      this.leb[k * 2] = leben; this.leb[k * 2 + 1] = leben;
      this.s[k * 2] = s0 * this.faktor; this.s[k * 2 + 1] = s1 * this.faktor;
      this.c0[k * 3] = (c0 >> 16 & 255) / 255; this.c0[k * 3 + 1] = (c0 >> 8 & 255) / 255; this.c0[k * 3 + 2] = (c0 & 255) / 255;
      this.c1[k * 3] = (c1 >> 16 & 255) / 255; this.c1[k * 3 + 1] = (c1 >> 8 & 255) / 255; this.c1[k * 3 + 2] = (c1 & 255) / 255;
      this.p[k * 3] = a; this.p[k * 3 + 1] = grav; this.p[k * 3 + 2] = bremse;
    }
    schritt(dt) {
      const { pos, v, leb, s, c0, c1, p, col, gr } = this;
      for (let k = 0; k < this.n; k++) {
        const rest = leb[k * 2];
        if (rest <= 0) { if (gr[k] !== 0) { gr[k] = 0; col[k * 4 + 3] = 0; } continue; }
        const nr = rest - dt; leb[k * 2] = nr;
        if (nr <= 0) { gr[k] = 0; col[k * 4 + 3] = 0; continue; }
        const f = 1 - nr / leb[k * 2 + 1];
        const br = Math.max(0, 1 - p[k * 3 + 2] * dt);
        v[k * 3] *= br; v[k * 3 + 2] *= br; v[k * 3 + 1] = v[k * 3 + 1] * br - p[k * 3 + 1] * dt;
        pos[k * 3] += v[k * 3] * dt; pos[k * 3 + 1] += v[k * 3 + 1] * dt; pos[k * 3 + 2] += v[k * 3 + 2] * dt;
        if (pos[k * 3 + 1] < 0.02 && p[k * 3 + 1] > 0) { pos[k * 3 + 1] = 0.02; v[k * 3 + 1] *= -0.3; }
        gr[k] = s[k * 2] + (s[k * 2 + 1] - s[k * 2]) * f;
        col[k * 4] = c0[k * 3] + (c1[k * 3] - c0[k * 3]) * f;
        col[k * 4 + 1] = c0[k * 3 + 1] + (c1[k * 3 + 1] - c0[k * 3 + 1]) * f;
        col[k * 4 + 2] = c0[k * 3 + 2] + (c1[k * 3 + 2] - c0[k * 3 + 2]) * f;
        col[k * 4 + 3] = p[k * 3] * Math.min(1, f * 7) * (1 - f) * (1 - f * 0.3);
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.farbe.needsUpdate = true;
      this.geo.attributes.groesse.needsUpdate = true;
    }
  }

  const vek = new T.Vector2();
  const r = (a = 1) => (Math.random() - 0.5) * 2 * a;
  const KRUMEN = { tomate:0xe0453a, tomate_g:0xe0453a, salat:0x6fbf3a, salat_g:0x6fbf3a, fleisch:0xe4787a, hack:0xe4787a, kartoffel:0xf0dca0, kartoffel_g:0xf0dca0, kaese:0xf5c542, kaese_g:0xf5c542, broetchen:0xd9a35a, teig:0xf1dfb6 };

  function effekte(szene, renderer, kamera, qualitaet) {
    const niedrig = qualitaet === 'niedrig';
    const weich = new Schicht(szene, niedrig ? 140 : 320, false, LKM.weicherPunkt('255,255,255'), 3);
    const glut = new Schicht(szene, niedrig ? 80 : 200, true, LKM.weicherPunkt('255,255,255'), 2.2);
    let staubZeit = 0;
    const fx = {
      weich, glut, niedrig, ambient:!niedrig,
      // Dampf, Rauch, Funken, Blasen an einem Gerät (jedes Bild aufgerufen)
      geraet(dt, t, e, h) {
        const o = e.o; if (!o) return;
        const x = o.x + 0.5, z = o.y + 0.5, it = o.it;
        const rate = (rt, fn) => { e.fxAcc = (e.fxAcc || 0) + dt * rt; let n = 0; while (e.fxAcc >= 1 && n < 4) { e.fxAcc -= 1; fn(); n++; } if (e.fxAcc > 4) e.fxAcc = 0; };
        if ((o.t === 'herd' || o.t === 'ofen' || o.t === 'fritteuse') && it && it.k != null) {
          const brennt = it.b && it.k > 0.3;
          const px = o.t === 'herd' ? x - 0.05 : x, pz = o.t === 'herd' ? z + 0.02 : z;
          if (brennt) {
            rate(niedrig ? 7 : 12, () => weich.neu(px + r(0.1), h + 0.1, pz + r(0.1), r(0.08), 0.5 + Math.random() * 0.2, r(0.08), 1.6 + Math.random() * 0.6, 0.14, 0.6, 0x3a3634, 0x141312, 0.55, -0.1, 0.3));
            rate(niedrig ? 5 : 9, () => glut.neu(px + r(0.1), h + 0.1, pz + r(0.1), r(0.5), 1.1 + Math.random() * 0.9, r(0.5), 0.5 + Math.random() * 0.5, 0.07, 0.01, 0xffd27a, 0xff3a14, 0.9, 3.2, 0.2));
            rate(niedrig ? 6 : 11, () => glut.neu(px + r(0.1), h + 0.05, pz + r(0.1), r(0.1), 0.5 + Math.random() * 0.3, r(0.1), 0.45, 0.2, 0.04, 0xffa030, 0xff3010, 0.55, -0.5, 0.4));
          } else if (it.k < 1) {
            rate((niedrig ? 3 : 5) + 9 * it.k, () => weich.neu(px + r(0.12), h + 0.08, pz + r(0.12), r(0.05), 0.28 + Math.random() * 0.12, r(0.05), 1.3 + Math.random() * 0.5, 0.1, 0.38, 0xffffff, 0xdfe8ee, 0.45, -0.05, 0.2));
            if (o.t === 'fritteuse') rate(niedrig ? 6 : 12, () => glut.neu(px + r(0.25), h + 0.0, pz + r(0.25), r(0.15), 0.5 + Math.random() * 0.3, r(0.15), 0.3, 0.05, 0.02, 0xfff3c0, 0xffd27a, 0.7, 2.5, 0.1));
            if (o.t === 'herd') rate(niedrig ? 2 : 4, () => glut.neu(px + r(0.15), h + 0.02, pz + r(0.15), r(0.3), 0.6 + Math.random() * 0.4, r(0.3), 0.4, 0.04, 0.01, 0xfff3c0, 0xffb347, 0.6, 3, 0.2));
          }
        } else if (o.t === 'brett' && it && it.s != null) {
          const c = KRUMEN[it.z] || 0xe8d9b0;
          rate(niedrig ? 8 : 14, () => weich.neu(x + r(0.15), h + 0.03, z + r(0.08), r(0.5), 0.7 + Math.random() * 0.6, r(0.4), 0.55, 0.06, 0.05, c, c, 0.9, 5, 0.5));
        } else if ((o.t === 'spuele' || o.t === 'spuelmaschine') && o.f > 0 && o.d > 0) {
          const bx = o.t === 'spuele' ? x - 0.12 : x;
          rate(niedrig ? 5 : 9, () => weich.neu(bx + r(0.2), h + 0.0, z + 0.05 + r(0.18), r(0.06), 0.28 + Math.random() * 0.15, r(0.06), 1.0 + Math.random() * 0.6, 0.07, 0.15, 0xffffff, 0xcfe8ff, 0.5, -0.1, 0.3));
          if (o.t === 'spuelmaschine') rate(3, () => weich.neu(x + r(0.3), h + 0.05, z + 0.4, r(0.04), 0.25, r(0.05), 1.4, 0.12, 0.4, 0xffffff, 0xe8eef2, 0.28, 0, 0.2));
        }
      },
      // Einmalige Ausbrüche bei Ereignissen
      ereignis(e, hoehe = 1) {
        const x = e.x, z = e.y;
        if (x == null && e.e !== 'ende' && e.e !== 'tag') return;
        const h = hoehe;
        switch (e.e) {
          case 'muenzen':
            for (let i = 0; i < (niedrig ? 10 : 22); i++) { const a = Math.random() * 6.28, s = 0.6 + Math.random() * 1.1; glut.neu(x, h + 0.3, z, Math.cos(a) * s, 1.4 + Math.random() * 1.6, Math.sin(a) * s, 0.8 + Math.random() * 0.5, 0.12, 0.02, 0xffe27a, 0xffa31a, 0.95, 4.5, 0.6); }
            glut.neu(x, h + 0.35, z, 0, 0.3, 0, 0.5, 0.2, 0.9, 0xfff3b0, 0xffd54a, 0.55, 0, 0);
            break;
          case 'serviert':
            for (let i = 0; i < 8; i++) glut.neu(x + r(0.25), h + 0.3, z + r(0.25), r(0.3), 0.5 + Math.random() * 0.5, r(0.3), 0.8, 0.1, 0.02, 0xfff0c8, 0xffb0c0, 0.8, -0.2, 0.5);
            break;
          case 'verbrannt':
            for (let i = 0; i < 12; i++) weich.neu(x + r(0.15), h + 0.15, z + r(0.15), r(0.4), 0.5 + Math.random() * 0.6, r(0.4), 1.5, 0.15, 0.7, 0x3a3634, 0x141312, 0.6, -0.1, 0.4);
            for (let i = 0; i < 10; i++) glut.neu(x, h + 0.15, z, r(1.2), 1.4 + Math.random() * 1.4, r(1.2), 0.6, 0.07, 0.01, 0xffd27a, 0xff3a14, 0.9, 5, 0.3);
            break;
          case 'gar':
            for (let i = 0; i < 9; i++) weich.neu(x + r(0.15), h + 0.1, z + r(0.15), r(0.2), 0.5 + Math.random() * 0.3, r(0.2), 1.1, 0.12, 0.5, 0xffffff, 0xe8eef2, 0.45, -0.1, 0.4);
            for (let i = 0; i < 6; i++) glut.neu(x + r(0.2), h + 0.1, z + r(0.2), r(0.5), 0.8 + Math.random() * 0.6, r(0.5), 0.7, 0.07, 0.01, 0xd6ffb0, 0x6ad04a, 0.9, 2.5, 0.4);
            break;
          case 'geschnitten':
            for (let i = 0; i < 10; i++) weich.neu(x + r(0.15), h, z + r(0.1), r(0.9), 1.0 + Math.random() * 0.8, r(0.9), 0.5, 0.07, 0.05, 0xf4ecd8, 0xf4ecd8, 0.9, 6, 0.6);
            break;
          case 'gespuelt':
            for (let i = 0; i < 12; i++) weich.neu(x + r(0.3), h, z + r(0.25), r(0.4), 0.7 + Math.random() * 0.6, r(0.4), 0.9, 0.08, 0.14, 0xffffff, 0xbfe0ff, 0.6, 1.5, 0.5);
            break;
          case 'aerger':
            for (let i = 0; i < 8; i++) weich.neu(x + r(0.2), h + 0.7, z + r(0.2), r(0.5), 0.6 + Math.random() * 0.5, r(0.5), 0.9, 0.1, 0.35, 0xff8a7a, 0xd94f3f, 0.55, -0.2, 0.5);
            break;
          case 'kauf': case 'karte':
            for (let i = 0; i < 12; i++) glut.neu(x + r(0.3), h, z + r(0.3), r(0.6), 0.8 + Math.random() * 0.9, r(0.6), 0.8, 0.1, 0.01, 0xffffff, 0xffd54a, 0.9, 1.5, 0.5);
            break;
          case 'nimm': case 'leg': case 'muell':
            for (let i = 0; i < 3; i++) weich.neu(x + r(0.15), h, z + r(0.15), r(0.25), 0.15, r(0.25), 0.5, 0.06, 0.2, 0xefe6d4, 0xefe6d4, 0.3, 0, 1.5);
            break;
          case 'ende': if (e.sieg) fx.konfetti(7, 6, 40); break;
        }
      },
      konfetti(cx, cz, n) {
        const cs = [0xe0533f, 0xf2c230, 0x48a85a, 0x3f7fd9, 0xd96ab0, 0xffffff];
        for (let i = 0; i < n * (niedrig ? 1 : 2); i++) { const c = cs[i % cs.length]; weich.neu(cx + r(6), 4 + Math.random() * 2.5, cz + r(4.5), r(0.6), -0.3 - Math.random(), r(0.6), 3 + Math.random() * 1.5, 0.15, 0.12, c, c, 1, 0.8, 0.3); }
      },
      // Staub unter schnellen Füßen
      schritt(dt, e, x, z, tempo) {
        if (tempo < 2.2) return;
        e.fxStaub = (e.fxStaub || 0) + dt;
        if (e.fxStaub > 0.16) { e.fxStaub = 0; weich.neu(x + r(0.1), 0.06, z + r(0.1), r(0.15), 0.12, r(0.15), 0.55, 0.08, 0.3, 0xe8dcc6, 0xe8dcc6, 0.28, 0, 1); }
      },
      // Staubkörner im Licht (Tag, nur hohe Qualität)
      luft(dt, t, licht) {
        if (!fx.ambient || licht > 0.4) return;
        staubZeit += dt;
        if (staubZeit > 0.28) { staubZeit = 0; glut.neu(2 + Math.random() * 10, 0.6 + Math.random() * 1.6, 2 + Math.random() * 8, r(0.03), r(0.03) + 0.02, r(0.03), 5, 0.045, 0.045, 0xfff1c8, 0xfff1c8, 0.28, 0, 0); }
      },
      aktualisieren(dt) {
        const gr = renderer.getDrawingBufferSize(vek);
        const m = gr.y / (2 * Math.tan(T.MathUtils.degToRad(kamera.fov / 2)));
        weich.mat.uniforms.massstab.value = m; glut.mat.uniforms.massstab.value = m;
        weich.schritt(dt); glut.schritt(dt);
      }
    };
    return fx;
  }

  window.LKU = { welt, effekte };
})();
