/* Jelly Jars 2.0 - synthesized SFX (no files to load). Hard limits so nothing stacks or crackles:
   max 8 voices at once, per-sound minimum gap, priority (low-priority sounds are dropped when busy),
   everything through one compressor + master gain. */
(function () {
  'use strict';
  let ctx = null, master = null, comp = null, noiseBuf = null, on = true;
  const live = []; const last = {}; const MAX = 8;
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function gate(name, gapMs, prio) {
    if (!ctx || !on) return false; const t = performance.now();
    if (last[name] && t - last[name] < gapMs) return false;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].end < ctx.currentTime) live.splice(i, 1);
    if (live.length >= MAX) { if (prio < 2) return false; const v = live.shift(); try { v.g.gain.cancelScheduledValues(ctx.currentTime); v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.01); } catch (e) {} }
    last[name] = t; return true;
  }
  function voice(dur) { const g = ctx.createGain(); g.connect(master); live.push({ g, end: ctx.currentTime + dur }); return g; }
  function tone(type, f0, f1, dur, vol, delay = 0, g0) {
    const t = ctx.currentTime + delay; const g = g0 || voice(dur + delay + 0.05); const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(g); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, delay = 0, g0) {
    const t = ctx.currentTime + delay; const g = g0 || voice(dur + delay + 0.05); const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const e = ctx.createGain(); e.gain.setValueAtTime(vol, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(e); e.connect(g); s.start(t); s.stop(t + dur + 0.02);
  }
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  const S = {
    init, setOn(v) { on = v; }, get on() { return on; },
    pick() { if (!gate('pick', 40, 1)) return; tone('sine', 520, 760, 0.07, 0.22); },
    place(n) { if (!gate('place', 40, 2)) return; const g = voice(0.3); tone('sine', 210 - n * 6, 95, 0.16, 0.55, 0, g); tone('triangle', 900, 600, 0.05, 0.12, 0, g); noise(0.05, 0.12, 2500, 1.2, 0, g); },
    bad() { if (!gate('bad', 80, 1)) return; tone('triangle', 240, 200, 0.12, 0.18); },
    clear(lines, combo) {
      if (!gate('clear', 60, 3)) return; const g = voice(1.0); const root = 72 + Math.min(combo - 1, 6) * 2;
      const notes = Math.min(2 + lines, 6);
      for (let i = 0; i < notes; i++) { const m = root + PENTA[i]; tone('triangle', midi(m), midi(m), 0.32, 0.22, i * 0.045, g); tone('sine', midi(m + 12), midi(m + 12), 0.2, 0.08, i * 0.045, g); }
      noise(0.25, 0.1, 6000, 0.7, 0, g);
    },
    combo(n) { if (!gate('combo', 120, 2)) return; const g = voice(0.6); for (let i = 0; i < 3; i++) tone('sine', midi(84 + Math.min(n, 8) + i * 4), midi(84 + Math.min(n, 8) + i * 4), 0.18, 0.12, 0.12 + i * 0.05, g); },
    jelly() { if (!gate('jelly', 70, 0)) return; tone('sine', 300 + Math.random() * 200, 700 + Math.random() * 300, 0.09, 0.12); },
    ready() { if (!gate('ready', 500, 3)) return; const g = voice(1.4); for (let i = 0; i < 6; i++) tone('sine', midi(76 + PENTA[i]), midi(76 + PENTA[i]), 0.5, 0.14, i * 0.07, g); tone('triangle', midi(88), midi(100), 0.6, 0.06, 0.3, g); },
    pour() { if (!gate('pour', 300, 3)) return; const g = voice(1.2); for (let i = 0; i < 9; i++) tone('sine', 260 + Math.random() * 240, 520 + Math.random() * 400, 0.08, 0.16, i * 0.06, g); noise(0.7, 0.08, 900, 2, 0, g); },
    pop() { if (!gate('pop', 200, 3)) return; const g = voice(0.9); tone('sine', 160, 45, 0.45, 0.8, 0, g); noise(0.35, 0.5, 1200, 0.6, 0, g); tone('triangle', midi(84), midi(96), 0.25, 0.12, 0.05, g); },
    over() { if (!gate('over', 800, 3)) return; const g = voice(1.6); [72, 67, 64, 60].forEach((m, i) => tone('triangle', midi(m), midi(m), 0.4, 0.18, i * 0.16, g)); },
    best() { if (!gate('best', 800, 3)) return; const g = voice(1.6); [72, 76, 79, 84, 88].forEach((m, i) => tone('triangle', midi(m), midi(m), 0.35, 0.18, i * 0.09, g)); },
    click() { if (!gate('click', 60, 1)) return; tone('sine', 880, 660, 0.05, 0.15); },
    voices() { return live.length; }
  };
  window.JJAudio = S;
})();
