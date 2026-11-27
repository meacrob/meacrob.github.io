/* Greedy test bot shared by the balance sim, the level calibrator and the in-browser autoplay (?bot=1).
   One-step lookahead: good board shape + line clears + (levels) clearing targets. Roughly a decent casual player. */
(function (root) {
  'use strict';
  const L = root.JJLogic || require('./logic.js');
  const N = 8;
  const BIG = ['sq3', '5h', '5v'].map(id => L.SHAPE[id]);
  function quality(b) {
    let empty = 0, holes = 0, edges = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = b[r * N + c];
      if (!v) { empty++; let nb = 0; for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= N || cc >= N || b[rr * N + cc]) nb++; } if (nb >= 3) holes++; }
      if (c < N - 1 && !!v !== !!b[r * N + c + 1]) edges++;
      if (r < N - 1 && !!v !== !!b[(r + 1) * N + c]) edges++;
    }
    return empty - holes * 4 - edges * 0.35 + BIG.filter(s => L.fitsAnywhere(b, N, s)).length * 6;
  }
  function goalBonus(s, rows, cols) {
    const g = s.cfg.goal; if (!g || !(g.type === 'stars' || g.type === 'jam' || g.type === 'crates')) return 0;
    let n = 0; const ks = new Set(); for (const i of rows) for (let j = 0; j < N; j++) ks.add(i * N + j); for (const i of cols) for (let j = 0; j < N; j++) ks.add(j * N + i);
    for (const k of ks) n += g.type === 'stars' ? s.mark[k] : g.type === 'jam' ? s.jam[k] : (s.board[k] === 8 ? 1 : 0);
    return n * 25;
  }
  function bestMove(s, noise) {
    let best = null;
    s.tray.forEach((t, ti) => {
      if (t.used) return; const sh = L.SHAPE[t.shape];
      for (let r = 0; r + sh.h <= N; r++) for (let c = 0; c + sh.wd <= N; c++) {
        if (!L.canPlace(s, sh, r, c)) continue;
        const { b, rows, cols } = L.placeOn(s.board, N, sh, r, c, 1), lines = rows.length + cols.length;
        const sc = quality(b) + lines * 14 + (lines > 1 ? lines * 6 : 0) + goalBonus(s, rows, cols) + (noise ? (Math.random() - 0.5) * noise : 0);
        if (!best || sc > best.sc) best = { ti, r, c, sc };
      }
    });
    return best;
  }
  function bestPop(s) {
    let best = null;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const t = JSON.parse(JSON.stringify(s)); const ev = L.pop(t, r, c); if (!ev) continue;
      const q = quality(t.board) + (ev[0].lines || 0) * 14 + (s.cfg.goal ? (L.progress(t).v - L.progress(s).v) * 25 : 0);
      if (!best || q > best.q) best = { r, c, q };
    }
    return best;
  }
  // play one full game; returns the final state
  function play(cfg, seed, opt) {
    opt = opt || {}; const s = L.create(cfg, seed); let guard = 0;
    while (!s.over && guard++ < (opt.max || 3000)) {
      if (s.popReady && (s.stuck || opt.popEarly)) { const p = bestPop(s); L.pop(s, p.r, p.c); continue; }
      if (s.stuck) { L.giveUp(s); break; }
      const m = bestMove(s, opt.noise); if (!m) break; L.place(s, m.ti, m.r, m.c);
    }
    return s;
  }
  const API = { quality, bestMove, bestPop, play };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JJBot = API;
})(typeof window !== 'undefined' ? window : globalThis);
