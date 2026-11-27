/* Jelly Jars 2.0 - all audio is synthesized (no files): original looping music + SFX.
   SFX: max 8 voices, per-sound gap, priority stealing, one compressor. Music: lookahead sequencer, two themes
   (menu / game), A and B sections with a generated-once melody, layers that come in with game intensity. */
(function () {
  'use strict';
  let ctx = null, master, sfxBus, musBus, comp, noiseBuf, sfxOn = true, musOn = true, hapOn = true;
  const live = [], last = {}, MAX = 8, PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.15;
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.85 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0; musBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
    if (Music.want) Music.play(Music.want);
  }
  function gate(name, gapMs, prio) {
    if (!ctx || !sfxOn) return false; const t = performance.now();
    if (last[name] && t - last[name] < gapMs) return false;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].end < ctx.currentTime) live.splice(i, 1);
    if (live.length >= MAX) { if (prio < 2) return false; const v = live.shift(); try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.01); } catch (e) {} }
    last[name] = t; return true;
  }
  function voice(dur, bus) { const g = ctx.createGain(); g.connect(bus || sfxBus); if (!bus) live.push({ g, end: ctx.currentTime + dur }); return g; }
  function tone(type, f0, f1, dur, vol, at, out, atk) {
    const t = at; const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.006)); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(out); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, freq, q, at, out, type) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const e = ctx.createGain(); e.gain.setValueAtTime(vol, at); e.gain.exponentialRampToValueAtTime(0.0001, at + dur); s.connect(f); f.connect(e); e.connect(out); s.start(at); s.stop(at + dur + 0.03);
  }
  const now = () => ctx.currentTime;
  const vib = p => { if (hapOn && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };

  // ---------- music ----------
  const marimba = (m, t, v, out) => { tone('sine', midi(m), midi(m), 0.42, v, t, out); tone('sine', midi(m) * 4, midi(m) * 4, 0.08, v * 0.25, t, out); };
  const bell = (m, t, v, out) => { tone('sine', midi(m), midi(m), 0.9, v, t, out); tone('sine', midi(m) * 2.76, midi(m) * 2.76, 0.35, v * 0.22, t, out); };
  const pluckBass = (m, t, v, out) => { tone('triangle', midi(m), midi(m), 0.32, v, t, out); tone('sine', midi(m), midi(m), 0.45, v * 0.7, t, out); };
  const pad = (ms, t, dur, v, out) => { for (const m of ms) { tone('triangle', midi(m) * 1.003, midi(m) * 1.003, dur, v, t, out, 0.25); tone('triangle', midi(m) * 0.997, midi(m) * 0.997, dur, v, t, out, 0.25); } };
  // chords as midi triads (root octave 48-60)
  const CH = { C: [48, 52, 55], Am: [45, 48, 52], F: [41, 45, 48], G: [43, 47, 50], Em: [40, 43, 47], Dm: [38, 41, 45] };
  const THEMES = {
    game: { bpm: 100, prog: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'G'], arp: [0, 1, 2, 1, 3, 2, 1, 2], seed: 7, melBars: [8, 16] },
    menu: { bpm: 112, prog: ['F', 'G', 'C', 'Am', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'Am', 'F', 'G', 'C', 'C'], arp: [0, 2, 1, 3, 2, 1, 3, 2], seed: 3, melBars: [0, 16] }
  };
  // melody: generated once per theme from a fixed seed (so it is a composed, repeatable tune), chord tones on strong beats
  function makeMelody(th) {
    let a = th.seed; const R = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const phrase = []; // 4 bars x 8 steps, -1 = rest
    for (let b = 0; b < 4; b++) for (let s = 0; s < 8; s++) phrase.push(s % 2 === 0 ? (R() < 0.82 ? Math.floor(R() * 3) : -1) : (R() < 0.3 ? 10 + Math.floor(R() * 2) : -1));
    return phrase;
  }
  const Music = {
    want: null, cur: null, step: 0, timer: null, next: 0, intensity: 0,
    play(name) {
      this.want = name; if (!ctx || !musOn) return; if (this.cur === name && this.timer) return;
      const fadeIn = () => { musBus.gain.cancelScheduledValues(now()); musBus.gain.setValueAtTime(musBus.gain.value, now()); musBus.gain.linearRampToValueAtTime(0.5, now() + 0.8); };
      if (this.timer) { musBus.gain.setTargetAtTime(0, now(), 0.15); clearInterval(this.timer); this.timer = null; setTimeout(() => this.start(name, fadeIn), 350); }
      else this.start(name, fadeIn);
    },
    start(name, fadeIn) {
      const th = THEMES[name]; this.cur = name; this.th = th; this.mel = th.mel || (th.mel = makeMelody(th)); this.step = 0; this.next = now() + 0.08; fadeIn();
      this.timer = setInterval(() => this.tick(), 40);
    },
    stop() { this.want = null; if (this.timer) { clearInterval(this.timer); this.timer = null; } this.cur = null; if (musBus) musBus.gain.setTargetAtTime(0, now(), 0.2); },
    tick() {
      const th = this.th, spb = 60 / th.bpm / 2; // eighth notes
      while (this.next < now() + 0.2) {
        const st = this.step, bar = Math.floor(st / 8) % th.prog.length, s = st % 8, t = this.next, ch = CH[th.prog[bar]], out = musBus, lift = this.intensity;
        const swing = s % 2 ? spb * 0.12 : 0, tt = t + swing;
        marimba(ch[th.arp[s] % 3] + 12 + (th.arp[s] === 3 ? 12 : 0), tt, 0.11, out);
        if (s === 0) { pluckBass(ch[0] - 12, t, 0.22, out); pad(ch.map(m => m + 12), t, spb * 8 * 0.95, 0.014, out); }
        if (s === 4) pluckBass(ch[2] - 12, t, 0.16, out);
        if (s === 6 && bar % 2 === 1) pluckBass(ch[1] - 12, t, 0.12, out);
        if (this.cur === 'game' || lift > 0) { if (s % 2 === 1) noise(0.04, 0.05 + lift * 0.02, 9000, 0.8, tt, out, 'highpass'); if (s === 0 || s === 4) tone('sine', 110, 45, 0.18, 0.18, t, out); }
        if (lift > 1 && s % 4 === 2) noise(0.08, 0.06, 2500, 1, t, out);
        const inMel = bar >= th.melBars[0] && bar < th.melBars[1];
        if (inMel || lift > 0) { const n = this.mel[(bar % 4) * 8 + s]; if (n >= 0) { const m = n >= 10 ? ch[(n - 10 + 1) % 3] + 26 : ch[n] + 24; bell(m, tt, 0.07, out); } }
        this.next += spb; this.step++;
      }
    }
  };

  const S = {
    init, Music,
    set(o) { if (o.sfx != null) { sfxOn = o.sfx; if (sfxBus) sfxBus.gain.value = sfxOn ? 0.85 : 0; } if (o.music != null) { musOn = o.music; if (!musOn) { const w = Music.want; Music.stop(); Music.want = w; } else if (Music.want) Music.play(Music.want); } if (o.haptics != null) hapOn = o.haptics; },
    get state() { return { sfx: sfxOn, music: musOn, haptics: hapOn }; },
    intensity(v) { Music.intensity = v; },
    pick() { if (!gate('pick', 40, 1)) return; const g = voice(0.15); tone('sine', 520, 820, 0.08, 0.2, now(), g); vib(6); },
    place(n) { if (!gate('place', 40, 2)) return; const g = voice(0.3), t = now(); tone('sine', 230 - n * 6, 90, 0.17, 0.55, t, g); tone('triangle', 1100, 700, 0.05, 0.1, t, g); noise(0.05, 0.12, 2400, 1.2, t, g); vib(12); },
    bad() { if (!gate('bad', 80, 1)) return; tone('triangle', 260, 200, 0.12, 0.15, now(), voice(0.15)); },
    clear(lines, combo) {
      if (!gate('clear', 60, 3)) return; const g = voice(1.2), t = now(), root = 72 + Math.min(combo - 1, 6) * 2, notes = Math.min(2 + lines, 7);
      for (let i = 0; i < notes; i++) { const m = root + PENTA[i]; tone('triangle', midi(m), midi(m), 0.34, 0.2, t + i * 0.042, g); tone('sine', midi(m + 12), midi(m + 12), 0.22, 0.07, t + i * 0.042, g); }
      noise(0.3, 0.08, 6500, 0.7, t, g); if (lines >= 2) { for (let i = 0; i < 4; i++) tone('sine', midi(96 + PENTA[i]), midi(96 + PENTA[i]), 0.2, 0.05, t + 0.25 + i * 0.05, g); } vib(lines >= 2 ? [20, 30, 25] : 22);
    },
    combo(n) { if (!gate('combo', 120, 2)) return; const g = voice(0.7), t = now(); for (let i = 0; i < 3 + Math.min(n, 5); i++) tone('sine', midi(84 + Math.min(n, 8) + PENTA[i]), midi(84 + Math.min(n, 8) + PENTA[i]), 0.16, 0.1, t + 0.1 + i * 0.045, g); },
    jelly() { if (!gate('jelly', 70, 0)) return; const g = voice(0.3), t = now(); for (let i = 0; i < 3; i++) tone('sine', 300 + Math.random() * 300, 700 + Math.random() * 400, 0.07, 0.1, t + i * 0.05, g); },
    almost() { if (!gate('almost', 900, 1)) return; const g = voice(0.6), t = now(); [79, 83, 86].forEach((m, i) => tone('triangle', midi(m), midi(m), 0.18, 0.1, t + i * 0.08, g)); },
    ready() { if (!gate('ready', 500, 3)) return; const g = voice(1.6), t = now(); for (let i = 0; i < 7; i++) bell(76 + PENTA[i], t + i * 0.07, 0.12, g); tone('triangle', midi(88), midi(100), 0.6, 0.05, t + 0.35, g); vib([15, 40, 15, 40, 30]); },
    pour() { if (!gate('pour', 300, 3)) return; const g = voice(1.4), t = now(); tone('sine', 600, 1500, 0.12, 0.2, t, g); for (let i = 0; i < 12; i++) tone('sine', 220 + Math.random() * 260, 480 + Math.random() * 380, 0.09, 0.15, t + 0.2 + i * 0.05, g); noise(0.8, 0.07, 800, 2, t + 0.2, g); vib([10, 30, 10, 30, 10, 30]); },
    splash() { if (!gate('splash', 120, 2)) return; const g = voice(0.6), t = now(); noise(0.35, 0.35, 1100, 0.7, t, g); tone('sine', 180, 60, 0.3, 0.5, t, g); vib(35); },
    pop() { if (!gate('pop', 200, 3)) return; const g = voice(0.9), t = now(); tone('sine', 160, 45, 0.45, 0.7, t, g); noise(0.35, 0.4, 1200, 0.6, t, g); },
    over() { if (!gate('over', 800, 3)) return; const g = voice(1.6), t = now(); [72, 67, 64, 60].forEach((m, i) => tone('triangle', midi(m), midi(m), 0.42, 0.17, t + i * 0.17, g)); },
    win() { if (!gate('win', 800, 3)) return; const g = voice(2.2), t = now(); [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => { tone('triangle', midi(m), midi(m), 0.4, 0.15, t + i * 0.07, g); bell(m + 12, t + i * 0.07, 0.05, g); }); [72, 76, 79].forEach(m => tone('triangle', midi(m), midi(m), 1.0, 0.1, t + 0.6, g)); vib([20, 50, 20, 50, 40]); },
    star(i) { if (!gate('star' + i, 100, 3)) return; const g = voice(0.8), t = now(); bell(84 + [0, 4, 7][i % 3], t, 0.16, g); tone('triangle', midi(96 + [0, 4, 7][i % 3]), midi(96 + [0, 4, 7][i % 3]), 0.2, 0.06, t, g); vib(15); },
    coin() { if (!gate('coin', 50, 1)) return; const g = voice(0.3), t = now(); tone('square', midi(88), midi(88), 0.06, 0.04, t, g); tone('square', midi(93), midi(93), 0.15, 0.04, t + 0.06, g); },
    unlock() { if (!gate('unlock', 600, 3)) return; const g = voice(2), t = now(); for (let i = 0; i < 8; i++) bell(72 + PENTA[i], t + i * 0.06, 0.1, g); [72, 76, 79, 84].forEach(m => tone('triangle', midi(m), midi(m), 1.2, 0.07, t + 0.55, g)); vib([20, 40, 60]); },
    best() { if (!gate('best', 800, 3)) return; const g = voice(1.6), t = now(); [72, 76, 79, 84, 88].forEach((m, i) => tone('triangle', midi(m), midi(m), 0.35, 0.16, t + i * 0.09, g)); },
    whoosh() { if (!gate('whoosh', 150, 0)) return; const g = voice(0.4), s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; const t = now(); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.25); const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.12, t + 0.08); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); s.connect(f); f.connect(e); e.connect(g); s.start(t); s.stop(t + 0.35); },
    click() { if (!gate('click', 60, 1)) return; const g = voice(0.1), t = now(); tone('sine', 900, 650, 0.05, 0.14, t, g); vib(5); },
    voices() { return live.length; },
    tap() { const d = ctx.createMediaStreamDestination(); comp.connect(d); return d.stream; } // for recording audio samples
  };
  window.JJAudio = S;
})();
