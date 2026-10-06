/* Löwenküche – kleine Klänge mit WebAudio (keine Dateien). Leise und abschaltbar. */
(function () {
  'use strict';
  let ctx = null, haupt = null;
  let an = true;
  try { an = localStorage.getItem('lk-ton') !== 'aus'; } catch (_) { /* egal */ }

  function start() {
    if (ctx || !an) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      haupt = ctx.createGain(); haupt.gain.value = 0.22; haupt.connect(ctx.destination);
    } catch (_) { ctx = null; }
  }
  function ton(freq, dauer, art = 'sine', laut = 0.5, gleit = 0, verz = 0) {
    if (!ctx || !an) return;
    const t = ctx.currentTime + verz;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = art; o.frequency.setValueAtTime(freq, t);
    if (gleit) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * gleit), t + dauer);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(laut, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    o.connect(g); g.connect(haupt);
    o.start(t); o.stop(t + dauer + 0.02);
  }
  function rauschen(dauer, laut = 0.3, hoch = 2000) {
    if (!ctx || !an) return;
    const n = Math.floor(ctx.sampleRate * dauer);
    const puffer = ctx.createBuffer(1, n, ctx.sampleRate), d = puffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const q = ctx.createBufferSource(); q.buffer = puffer;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hoch;
    const g = ctx.createGain(); g.gain.value = laut;
    q.connect(f); f.connect(g); g.connect(haupt); q.start();
  }

  window.Ton = {
    start,
    get an() { return an; },
    umschalten() {
      an = !an;
      try { localStorage.setItem('lk-ton', an ? 'an' : 'aus'); } catch (_) { /* egal */ }
      if (an) start();
      return an;
    },
    klick: () => ton(660, 0.06, 'triangle', 0.3),
    nimm: () => ton(520, 0.07, 'triangle', 0.35, 1.4),
    leg: () => ton(420, 0.07, 'triangle', 0.35, 0.7),
    hack: () => rauschen(0.05, 0.4, 3200),
    fertig: () => { ton(880, 0.1, 'sine', 0.35); ton(1320, 0.14, 'sine', 0.3, 1, 0.08); },
    gar: () => ton(990, 0.18, 'sine', 0.25),
    muenzen: () => { ton(1046, 0.08, 'square', 0.12); ton(1568, 0.16, 'square', 0.12, 1, 0.07); },
    aerger: () => { ton(180, 0.3, 'sawtooth', 0.2, 0.7); },
    verbrannt: () => rauschen(0.5, 0.25, 900),
    bestellt: () => ton(740, 0.08, 'sine', 0.25),
    serviert: () => { ton(660, 0.08, 'sine', 0.3); ton(880, 0.1, 'sine', 0.3, 1, 0.06); },
    kauf: () => { ton(523, 0.08, 'triangle', 0.3); ton(784, 0.12, 'triangle', 0.3, 1, 0.07); },
    tag: () => [523, 659, 784, 1046].forEach((f, i) => ton(f, 0.18, 'triangle', 0.25, 1, i * 0.1)),
    nacht: () => [784, 659, 523].forEach((f, i) => ton(f, 0.25, 'sine', 0.22, 1, i * 0.14)),
    fehler: () => ton(200, 0.15, 'square', 0.15),
    sieg: () => [523, 659, 784, 1046, 1318].forEach((f, i) => ton(f, 0.22, 'triangle', 0.25, 1, i * 0.11))
  };
})();
