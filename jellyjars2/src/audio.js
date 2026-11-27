/* Jelly Jars 2.0 - audio. Same original synth sounds as before, but rendered ONCE into audio buffers
   (OfflineAudioContext) and then played back as plain buffers:
   - music: each theme is pre-rendered as a seamless loop (base layer + a "lift" layer that fades in when the jar is full),
     so playing music costs one looping buffer, not hundreds of oscillators per minute;
   - sound effects: each sound (and its variants) is rendered the first time it is needed and cached.
   Why: building oscillator graphs live on every note kept the audio thread and garbage collector busy, which on phones
   caused crackles (buffer underruns) and extra heat. Playback is capped at 8 voices with priorities and a limiter. */
(function () {
  'use strict';
  let ctx = null, master, limiter, sfxBus, musBus, liftGain, sfxOn = true, musOn = true, hapOn = true;
  const SR = 32000, PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24], MAX = 8;
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  const live = [], last = {}, cache = {}, pending = {};
  const vib = p => { if (hapOn && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };

  // ---------- synth building blocks (work on any context: live or offline) ----------
  const noiseBufs = new WeakMap();
  function noiseBuf(c) { let b = noiseBufs.get(c); if (!b) { b = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate); const d = b.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; } noiseBufs.set(c, b); } return b; }
  function tone(c, out, type, f0, f1, dur, vol, t, atk) {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const e = c.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.006)); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(c, out, dur, vol, freq, q, t, type) {
    const s = c.createBufferSource(); s.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const e = c.createGain(); e.gain.setValueAtTime(vol, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(e); e.connect(out); s.start(t); s.stop(t + dur + 0.02);
  }
  const marimba = (c, o, m, t, v) => { tone(c, o, 'sine', midi(m), midi(m), 0.42, v, t); tone(c, o, 'sine', midi(m) * 4, midi(m) * 4, 0.08, v * 0.25, t); };
  const bell = (c, o, m, t, v) => { tone(c, o, 'sine', midi(m), midi(m), 0.9, v, t); tone(c, o, 'sine', midi(m) * 2.76, midi(m) * 2.76, 0.35, v * 0.22, t); };
  const pluckBass = (c, o, m, t, v) => { tone(c, o, 'triangle', midi(m), midi(m), 0.32, v, t); tone(c, o, 'sine', midi(m), midi(m), 0.45, v * 0.7, t); };
  const pad = (c, o, ms, t, dur, v) => { for (const m of ms) { tone(c, o, 'triangle', midi(m) * 1.003, midi(m) * 1.003, dur, v, t, 0.25); tone(c, o, 'triangle', midi(m) * 0.997, midi(m) * 0.997, dur, v, t, 0.25); } };
  function render(dur, draw) { // -> Promise<AudioBuffer>
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; const oc = new OC(1, Math.ceil(dur * SR), SR);
    const g = oc.createGain(); g.connect(oc.destination); draw(oc, g, 0.005); return oc.startRendering();
  }

  // ---------- music: composed loops, rendered once ----------
  const CH = { C: [48, 52, 55], Am: [45, 48, 52], F: [41, 45, 48], G: [43, 47, 50], Em: [40, 43, 47], Dm: [38, 41, 45] };
  const THEMES = {
    game: { bpm: 100, prog: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'G'], arp: [0, 1, 2, 1, 3, 2, 1, 2], seed: 7, melBars: [8, 16], drums: true },
    menu: { bpm: 112, prog: ['F', 'G', 'C', 'Am', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'Am', 'F', 'G', 'C', 'C'], arp: [0, 2, 1, 3, 2, 1, 3, 2], seed: 3, melBars: [0, 16], drums: false }
  };
  function melody(th) { let a = th.seed; const R = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; const p = []; for (let b = 0; b < 4; b++) for (let s = 0; s < 8; s++) p.push(s % 2 === 0 ? (R() < 0.82 ? Math.floor(R() * 3) : -1) : (R() < 0.3 ? 10 + Math.floor(R() * 2) : -1)); return p; }
  function drawLoop(th, layer) { // layer 'base' or 'lift'
    const spb = 60 / th.bpm / 2, steps = th.prog.length * 8, mel = melody(th);
    return (c, o, t0) => {
      for (let st = 0; st < steps; st++) {
        const bar = Math.floor(st / 8), s = st % 8, t = t0 + st * spb, ch = CH[th.prog[bar]], tt = t + (s % 2 ? spb * 0.12 : 0);
        const inMel = bar >= th.melBars[0] && bar < th.melBars[1], n = mel[(bar % 4) * 8 + s];
        const note = n >= 0 ? (n >= 10 ? ch[(n - 10 + 1) % 3] + 26 : ch[n] + 24) : null;
        if (layer === 'base') {
          marimba(c, o, ch[th.arp[s] % 3] + 12 + (th.arp[s] === 3 ? 12 : 0), tt, 0.11);
          if (s === 0) { pluckBass(c, o, ch[0] - 12, t, 0.22); pad(c, o, ch.map(m => m + 12), t, spb * 8 * 0.95, 0.014); }
          if (s === 4) pluckBass(c, o, ch[2] - 12, t, 0.16);
          if (s === 6 && bar % 2 === 1) pluckBass(c, o, ch[1] - 12, t, 0.12);
          if (th.drums) { if (s % 2 === 1) noise(c, o, 0.04, 0.05, 9000, 0.8, tt, 'highpass'); if (s === 0 || s === 4) tone(c, o, 'sine', 110, 45, 0.18, 0.18, t); }
          if (inMel && note) bell(c, o, note, tt, 0.07);
        } else { // lift: the extra energy that fades in while the jar is full / during big combos
          if (s % 2 === 1) noise(c, o, 0.04, 0.03, 9000, 0.8, tt, 'highpass');
          if (s % 4 === 2) noise(c, o, 0.08, 0.06, 2500, 1, t);
          if (!th.drums && (s === 0 || s === 4)) tone(c, o, 'sine', 110, 45, 0.18, 0.16, t);
          if (!inMel && note) bell(c, o, note, tt, 0.07);
          if (s === 0) bell(c, o, ch[0] + 36, t, 0.035);
        }
      }
    };
  }
  // render loop + 2s tail, then fold the tail back onto the start so the loop point is seamless
  async function renderLoop(name, layer) {
    const th = THEMES[name], dur = th.prog.length * 8 * (60 / th.bpm / 2);
    const buf = await render(dur + 2, drawLoop(th, layer)), n = Math.round(dur * SR), d = buf.getChannelData(0);
    const out = ctx.createBuffer(1, n, SR), o = out.getChannelData(0); o.set(d.subarray(0, n)); for (let i = n; i < d.length; i++) o[i - n] += d[i];
    return out;
  }
  const Music = {
    want: null, cur: null, src: null, lift: null, intensity: 0, bufs: {},
    async load(name) { if (!this.bufs[name]) this.bufs[name] = Promise.all([renderLoop(name, 'base'), renderLoop(name, 'lift')]); return this.bufs[name]; },
    play(name) {
      this.want = name; if (!ctx || !musOn) return; if (this.cur === name && this.src) return;
      this.cur = name; const token = this.token = {};
      this.load(name).then(([base, lift]) => {
        if (this.token !== token || !musOn) return;
        this.stopSources(0.3);
        const t = ctx.currentTime + 0.05, a = ctx.createBufferSource(), b = ctx.createBufferSource(); a.buffer = base; b.buffer = lift; a.loop = b.loop = true;
        const fade = ctx.createGain(); fade.gain.setValueAtTime(0.0001, t); fade.gain.exponentialRampToValueAtTime(1, t + 0.8); fade.connect(musBus);
        a.connect(fade); b.connect(liftGain); liftGain.connect(fade); a.start(t); b.start(t);
        this.src = a; this.lift = b; this.fade = fade; this.setLift();
      });
    },
    stopSources(f) { if (!this.src) return; const t = ctx.currentTime, fd = this.fade, a = this.src, b = this.lift; fd.gain.cancelScheduledValues(t); fd.gain.setValueAtTime(Math.max(0.0001, fd.gain.value), t); fd.gain.exponentialRampToValueAtTime(0.0001, t + f); a.stop(t + f + 0.05); b.stop(t + f + 0.05); this.src = this.lift = null; liftGain.disconnect(); liftGain = ctx.createGain(); liftGain.gain.value = 0; },
    stop() { this.want = null; this.cur = null; this.token = null; if (ctx) this.stopSources(0.25); },
    setLift() { if (!liftGain) return; const t = ctx.currentTime; liftGain.gain.cancelScheduledValues(t); liftGain.gain.setTargetAtTime(this.intensity > 0 ? 1 : 0, t, 0.35); }
  };

  // ---------- sound effects: rendered on first use, cached, played as buffers ----------
  const SFX = {
    pick: { dur: 0.12, prio: 1, gap: 40, draw: (c, o, t) => tone(c, o, 'sine', 520, 820, 0.08, 0.2, t), hap: 6 },
    place: { dur: 0.25, prio: 2, gap: 40, key: n => Math.min(9, n || 1), draw: (c, o, t, n) => { tone(c, o, 'sine', 230 - n * 6, 90, 0.17, 0.55, t); tone(c, o, 'triangle', 1100, 700, 0.05, 0.1, t); noise(c, o, 0.05, 0.12, 2400, 1.2, t); }, hap: 12 },
    bad: { dur: 0.15, prio: 1, gap: 80, draw: (c, o, t) => tone(c, o, 'triangle', 260, 200, 0.12, 0.15, t) },
    clear: { dur: 0.9, prio: 3, gap: 60, key: (l, cb) => Math.min(l, 5) + '_' + Math.min(cb, 7), draw: (c, o, t, key) => {
      const [lines, combo] = key.split('_').map(Number), root = 72 + (combo - 1) * 2, notes = Math.min(2 + lines, 7);
      for (let i = 0; i < notes; i++) { const m = root + PENTA[i]; tone(c, o, 'triangle', midi(m), midi(m), 0.34, 0.2, t + i * 0.042); tone(c, o, 'sine', midi(m + 12), midi(m + 12), 0.22, 0.07, t + i * 0.042); }
      noise(c, o, 0.3, 0.08, 6500, 0.7, t); if (lines >= 2) for (let i = 0; i < 4; i++) tone(c, o, 'sine', midi(96 + PENTA[i]), midi(96 + PENTA[i]), 0.2, 0.05, t + 0.25 + i * 0.05);
    }, hap: (l) => l >= 2 ? [20, 30, 25] : 22 },
    combo: { dur: 0.7, prio: 2, gap: 120, key: n => Math.min(n, 8), draw: (c, o, t, n) => { for (let i = 0; i < 3 + Math.min(n, 5); i++) tone(c, o, 'sine', midi(84 + n + PENTA[i]), midi(84 + n + PENTA[i]), 0.16, 0.1, t + 0.1 + i * 0.045); } },
    jelly: { dur: 0.25, prio: 0, gap: 70, key: () => Math.floor(Math.random() * 3), draw: (c, o, t, v) => { const R = [[340, 760, 420, 900, 520, 820], [300, 700, 460, 980, 380, 760], [420, 880, 330, 720, 500, 940]][v]; for (let i = 0; i < 3; i++) tone(c, o, 'sine', R[i * 2], R[i * 2 + 1], 0.07, 0.1, t + i * 0.05); } },
    almost: { dur: 0.45, prio: 1, gap: 900, draw: (c, o, t) => [79, 83, 86].forEach((m, i) => tone(c, o, 'triangle', midi(m), midi(m), 0.18, 0.1, t + i * 0.08)) },
    ready: { dur: 1.4, prio: 3, gap: 500, draw: (c, o, t) => { for (let i = 0; i < 7; i++) bell(c, o, 76 + PENTA[i], t + i * 0.07, 0.12); tone(c, o, 'triangle', midi(88), midi(100), 0.6, 0.05, t + 0.35); }, hap: [15, 40, 15, 40, 30] },
    pour: { dur: 1.1, prio: 3, gap: 300, draw: (c, o, t) => { tone(c, o, 'sine', 600, 1500, 0.12, 0.2, t); const f = [[300, 600], [420, 760], [260, 520], [380, 820], [330, 700], [450, 860], [280, 560], [400, 780], [350, 690], [430, 840], [300, 640], [390, 760]]; f.forEach(([a, b], i) => tone(c, o, 'sine', a, b, 0.09, 0.15, t + 0.2 + i * 0.05)); noise(c, o, 0.8, 0.07, 800, 2, t + 0.2); }, hap: [10, 30, 10, 30, 10, 30] },
    splash: { dur: 0.45, prio: 2, gap: 120, draw: (c, o, t) => { noise(c, o, 0.35, 0.35, 1100, 0.7, t); tone(c, o, 'sine', 180, 60, 0.3, 0.5, t); }, hap: 35 },
    pop: { dur: 0.55, prio: 3, gap: 200, draw: (c, o, t) => { tone(c, o, 'sine', 160, 45, 0.45, 0.7, t); noise(c, o, 0.35, 0.4, 1200, 0.6, t); } },
    over: { dur: 1.2, prio: 3, gap: 800, draw: (c, o, t) => [72, 67, 64, 60].forEach((m, i) => tone(c, o, 'triangle', midi(m), midi(m), 0.42, 0.17, t + i * 0.17)) },
    win: { dur: 1.9, prio: 3, gap: 800, draw: (c, o, t) => { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => { tone(c, o, 'triangle', midi(m), midi(m), 0.4, 0.15, t + i * 0.07); bell(c, o, m + 12, t + i * 0.07, 0.05); }); [72, 76, 79].forEach(m => tone(c, o, 'triangle', midi(m), midi(m), 1.0, 0.1, t + 0.6)); }, hap: [20, 50, 20, 50, 40] },
    star: { dur: 0.95, prio: 3, gap: 100, key: i => i % 3, draw: (c, o, t, i) => { bell(c, o, 84 + [0, 4, 7][i], t, 0.16); tone(c, o, 'triangle', midi(96 + [0, 4, 7][i]), midi(96 + [0, 4, 7][i]), 0.2, 0.06, t); }, hap: 15 },
    coin: { dur: 0.25, prio: 1, gap: 50, draw: (c, o, t) => { tone(c, o, 'square', midi(88), midi(88), 0.06, 0.04, t); tone(c, o, 'square', midi(93), midi(93), 0.15, 0.04, t + 0.06); } },
    unlock: { dur: 1.9, prio: 3, gap: 600, draw: (c, o, t) => { for (let i = 0; i < 8; i++) bell(c, o, 72 + PENTA[i], t + i * 0.06, 0.1); [72, 76, 79, 84].forEach(m => tone(c, o, 'triangle', midi(m), midi(m), 1.2, 0.07, t + 0.55)); }, hap: [20, 40, 60] },
    best: { dur: 0.9, prio: 3, gap: 800, draw: (c, o, t) => [72, 76, 79, 84, 88].forEach((m, i) => tone(c, o, 'triangle', midi(m), midi(m), 0.35, 0.16, t + i * 0.09)) },
    whoosh: { dur: 0.35, prio: 0, gap: 150, draw: (c, o, t) => { const s = c.createBufferSource(); s.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.25); const e = c.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.12, t + 0.08); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); s.connect(f); f.connect(e); e.connect(o); s.start(t); s.stop(t + 0.35); } },
    click: { dur: 0.08, prio: 1, gap: 60, draw: (c, o, t) => tone(c, o, 'sine', 900, 650, 0.05, 0.14, t), hap: 5 }
  };
  function bufFor(name, key) {
    const id = name + ':' + key; if (cache[id]) return cache[id];
    if (!pending[id]) { const d = SFX[name]; pending[id] = render(d.dur, (c, o, t) => d.draw(c, o, t, key)).then(b => { cache[id] = b; return b; }); }
    return null;
  }
  function play(name, a, b) {
    if (!ctx || !sfxOn) return; const d = SFX[name], nowMs = performance.now();
    if (last[name] && nowMs - last[name] < d.gap) return; last[name] = nowMs;
    const key = d.key ? d.key(a, b) : 0, buf = bufFor(name, key);
    if (d.hap) vib(typeof d.hap === 'function' ? d.hap(a, b) : d.hap);
    const go = bf => {
      const t = ctx.currentTime;
      for (let i = live.length - 1; i >= 0; i--) if (live[i].end < t) live.splice(i, 1);
      if (live.length >= MAX) { let k = -1; for (let i = 0; i < live.length; i++) if (live[i].prio <= d.prio && (k < 0 || live[i].prio < live[k].prio)) k = i; if (k < 0) return; const v = live.splice(k, 1)[0]; try { v.g.gain.setTargetAtTime(0, t, 0.01); v.s.stop(t + 0.05); } catch (e) {} }
      const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = bf; s.connect(g); g.connect(sfxBus); s.start(t); live.push({ s, g, prio: d.prio, end: t + bf.duration });
      s.onended = () => { s.disconnect(); g.disconnect(); };
    };
    if (buf) go(buf); else pending[name + ':' + key].then(bf => { if (performance.now() - nowMs < 120) go(bf); }); // first use: play if it renders fast enough
  }
  function prewarm() { // common sounds rendered right after start, in small batches so they never compete with gameplay
    const list = [['pick'], ['place', 1], ['place', 2], ['place', 3], ['place', 4], ['bad'], ['click'], ['jelly', 0], ['jelly', 1], ['jelly', 2], ['coin'], ['whoosh'], ['splash'], ['almost'], ['ready'], ['pour'], ['win'], ['over'], ['star', 0], ['star', 1], ['star', 2], ['unlock'], ['best']];
    for (let l = 1; l <= 4; l++) for (let cb = 1; cb <= 4; cb++) list.push(['clear', l + '_' + cb]); for (let n = 2; n <= 6; n++) list.push(['combo', n]);
    let i = 0; const step = () => { const end = Math.min(list.length, i + 4); for (; i < end; i++) bufFor(list[i][0], list[i][1] == null ? 0 : list[i][1]); if (i < list.length) setTimeout(step, 120); }; step();
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    // a slightly larger output buffer than 'interactive' so a busy main thread or a warm phone cannot starve it (crackles)
    try { ctx = new AC({ latencyHint: 0.06 }); } catch (e) { ctx = new AC(); }
    limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 16; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(limiter); limiter.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.8 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0.5; musBus.connect(master);
    liftGain = ctx.createGain(); liftGain.gain.value = 0;
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
    prewarm(); Music.load('menu'); setTimeout(() => Music.load('game'), 1500);
    if (Music.want) Music.play(Music.want);
  }
  const S = {
    init, Music,
    set(o) { if (o.sfx != null) { sfxOn = o.sfx; if (sfxBus) sfxBus.gain.value = sfxOn ? 0.8 : 0; } if (o.music != null) { musOn = o.music; if (!musOn) { const w = Music.want; Music.stop(); Music.want = w; } else if (Music.want) Music.play(Music.want); } if (o.haptics != null) hapOn = o.haptics; },
    get state() { return { sfx: sfxOn, music: musOn, haptics: hapOn }; },
    intensity(v) { Music.intensity = v; if (ctx) Music.setLift(); },
    voices() { for (let i = live.length - 1; i >= 0; i--) if (!ctx || live[i].end < ctx.currentTime) live.splice(i, 1); return live.length; },
    stats() { return { voices: S.voices(), cached: Object.keys(cache).length, rate: ctx ? ctx.sampleRate : 0, latency: ctx ? Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000) : 0, state: ctx ? ctx.state : 'off' }; },
    tap() { const d = ctx.createMediaStreamDestination(); limiter.connect(d); return d.stream; }
  };
  for (const k of Object.keys(SFX)) S[k] = (a, b) => play(k, a, b);
  window.JJAudio = S;
})();
