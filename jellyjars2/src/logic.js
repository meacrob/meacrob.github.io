/* Jelly Jars 2.0 - pure game logic (no rendering). Runs in the browser (window.JJLogic) and in Node (module.exports).
   Board: N x N cells, 0 = empty, otherwise flavour id 1..F.
   Turn: player places pieces from a 3-piece tray; full rows/cols clear at once; tray refills when empty.
   Jelly Overflow: line clears pour jelly into the jar; a full jar = one stored Jelly Pop (area clear, no score). */
(function (root) {
  'use strict';

  const DEFAULTS = {
    size: 8,
    flavours: 6,
    jarCap: 6,           // jelly units for the first charge (sim: ~20-25 good placements, about 60-80 s)
    popMode: 'pour',     // 'clear' = burst the jellies in the area; 'pour' = fill the area's empty cells with jelly (can complete lines)
    capGrow: 1.4,        // each pop makes the next charge this much bigger (keeps runs finite)
    popShape: '3x3',     // '3x3' | 'plus' | 'cross' (row+col of 5) | 'diamond'
    popScores: false,    // pop-cleared cells give no points (keeps the leaderboard fair)
    comboGrace: 3,       // combo survives this many placements without a clear
    fairTries: 40,
    friendlyStart: true  // first tray guarantees an early line clear; second tray has no big pieces
  };

  // ---------- RNG (seedable, so daily challenge can reuse it) ----------
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- pieces ----------
  // each shape: list of [row, col]; weight = how often it appears; tier: 0 small, 1 medium, 2 big
  const RAW = [
    ['1', [[0,0]], 2, 0],
    ['2h', [[0,0],[0,1]], 3, 0], ['2v', [[0,0],[1,0]], 3, 0],
    ['3h', [[0,0],[0,1],[0,2]], 3, 0], ['3v', [[0,0],[1,0],[2,0]], 3, 0],
    ['4h', [[0,0],[0,1],[0,2],[0,3]], 2, 1], ['4v', [[0,0],[1,0],[2,0],[3,0]], 2, 1],
    ['5h', [[0,0],[0,1],[0,2],[0,3],[0,4]], 1.2, 2], ['5v', [[0,0],[1,0],[2,0],[3,0],[4,0]], 1.2, 2],
    ['o', [[0,0],[0,1],[1,0],[1,1]], 3, 1],
    ['l3a', [[0,0],[1,0],[1,1]], 2, 0], ['l3b', [[0,1],[1,0],[1,1]], 2, 0], ['l3c', [[0,0],[0,1],[1,0]], 2, 0], ['l3d', [[0,0],[0,1],[1,1]], 2, 0],
    ['t1', [[0,0],[0,1],[0,2],[1,1]], 1.2, 1], ['t2', [[1,0],[1,1],[1,2],[0,1]], 1.2, 1], ['t3', [[0,0],[1,0],[2,0],[1,1]], 1.2, 1], ['t4', [[0,1],[1,1],[2,1],[1,0]], 1.2, 1],
    ['s1', [[0,1],[0,2],[1,0],[1,1]], 0.9, 1], ['s2', [[0,0],[1,0],[1,1],[2,1]], 0.9, 1], ['z1', [[0,0],[0,1],[1,1],[1,2]], 0.9, 1], ['z2', [[0,1],[1,0],[1,1],[2,0]], 0.9, 1],
    ['l4a', [[0,0],[1,0],[2,0],[2,1]], 1, 1], ['l4b', [[0,0],[0,1],[0,2],[1,0]], 1, 1], ['l4c', [[0,0],[0,1],[1,1],[2,1]], 1, 1], ['l4d', [[1,0],[1,1],[1,2],[0,2]], 1, 1],
    ['j4a', [[0,1],[1,1],[2,1],[2,0]], 1, 1], ['j4b', [[0,0],[1,0],[1,1],[1,2]], 1, 1], ['j4c', [[0,0],[0,1],[1,0],[2,0]], 1, 1], ['j4d', [[0,0],[0,1],[0,2],[1,2]], 1, 1],
    ['r23', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], 1.1, 2], ['r32', [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]], 1.1, 2],
    ['sq3', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], 0.7, 2],
    ['L5a', [[0,0],[1,0],[2,0],[2,1],[2,2]], 0.8, 2], ['L5b', [[0,0],[0,1],[0,2],[1,0],[2,0]], 0.8, 2], ['L5c', [[0,0],[0,1],[0,2],[1,2],[2,2]], 0.8, 2], ['L5d', [[0,2],[1,2],[2,0],[2,1],[2,2]], 0.8, 2]
  ];
  const SHAPES = RAW.map(([id, cells, w, tier]) => {
    const h = Math.max(...cells.map(c => c[0])) + 1, wd = Math.max(...cells.map(c => c[1])) + 1;
    return { id, cells, w, tier, h, wd, n: cells.length };
  });

  // ---------- pop shapes (experiment knob) ----------
  const POP = {
    '3x3': [[-1,-1],[-1,0],[-1,1],[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]],
    'plus': [[-2,0],[-1,0],[0,-2],[0,-1],[0,0],[0,1],[0,2],[1,0],[2,0]],
    'small': [[-1,0],[0,-1],[0,0],[0,1],[1,0]],
    'diamond': [[-2,0],[-1,-1],[-1,0],[-1,1],[0,-2],[0,-1],[0,0],[0,1],[0,2],[1,-1],[1,0],[1,1],[2,0]],
    'cross': null // whole row + whole column through the target
  };
  function popCells(state, r, c) {
    const N = state.cfg.size, out = [];
    if (state.cfg.popShape === 'cross') { for (let i = 0; i < N; i++) { out.push([r, i]); if (i !== r) out.push([i, c]); } return out; }
    for (const [dr, dc] of POP[state.cfg.popShape] || POP['3x3']) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push([rr, cc]); }
    return out;
  }

  // ---------- board helpers ----------
  const idx = (s, r, c) => r * s.cfg.size + c;
  function canPlace(s, shape, r, c) {
    const N = s.cfg.size;
    if (r < 0 || c < 0 || r + shape.h > N || c + shape.wd > N) return false;
    for (const [dr, dc] of shape.cells) if (s.board[(r + dr) * N + c + dc]) return false;
    return true;
  }
  function fitsAnywhere(board, N, shape) {
    for (let r = 0; r + shape.h <= N; r++) for (let c = 0; c + shape.wd <= N; c++) {
      let ok = true; for (const [dr, dc] of shape.cells) if (board[(r + dr) * N + c + dc]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  function placeOn(board, N, shape, r, c, v) {
    const b = board.slice(); for (const [dr, dc] of shape.cells) b[(r + dr) * N + c + dc] = v;
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      let fr = true, fc = true;
      for (let j = 0; j < N; j++) { if (!b[i * N + j]) fr = false; if (!b[j * N + i]) fc = false; }
      if (fr) rows.push(i); if (fc) cols.push(i);
    }
    for (const i of rows) for (let j = 0; j < N; j++) b[i * N + j] = 0;
    for (const i of cols) for (let j = 0; j < N; j++) b[j * N + i] = 0;
    return { b, rows, cols };
  }
  // can all pieces in `pieces` be placed in some order? (bounded DFS)
  function solvable(board, N, pieces, budget) {
    if (!pieces.length) return true;
    for (let i = 0; i < pieces.length; i++) {
      const sh = pieces[i], rest = pieces.filter((_, k) => k !== i);
      for (let r = 0; r + sh.h <= N; r++) for (let c = 0; c + sh.wd <= N; c++) {
        let ok = true; for (const [dr, dc] of sh.cells) if (board[(r + dr) * N + c + dc]) { ok = false; break; }
        if (!ok) continue;
        if (--budget.n < 0) return true; // out of budget: assume fine (rare, only on very open boards)
        if (solvable(placeOn(board, N, sh, r, c, 1).b, N, rest, budget)) return true;
      }
    }
    return false;
  }

  // ---------- fair generator ----------
  // Never deals a tray that cannot be fully placed (when any placeable tray exists).
  // Gentle help when the board is crowded, gentle challenge when it is open. No hidden "punish good players".
  function fill(s) {
    const N = s.cfg.size, R = s.rng, filled = s.board.filter(Boolean).length / (N * N);
    const pick = () => {
      let tot = 0; const ws = SHAPES.map(sh => { let w = sh.w; if (filled > 0.55 && sh.tier === 2) w *= 0.35; if (filled < 0.25 && sh.tier === 0) w *= 0.6; tot += w; return w; });
      let x = R() * tot; for (let i = 0; i < SHAPES.length; i++) { x -= ws[i]; if (x <= 0) return SHAPES[i]; } return SHAPES[0];
    };
    let tray = null;
    // opening: the first tray always allows a line clear on move 2 (two 4-long bars fill a row), the second has no big pieces
    if (s.traysDealt === 0 && s.cfg.friendlyStart) { const by = id => SHAPES.find(x => x.id === id); tray = [by('4h'), by('o'), by('4h')]; }
    for (let t = 0; !tray && t < s.cfg.fairTries; t++) {
      const cand = [pick(), pick(), pick()];
      if (s.traysDealt === 1 && s.cfg.friendlyStart && cand.some(c => c.tier === 2) && t < s.cfg.fairTries - 5) continue;
      if (cand.filter(c => c.tier === 2).length > 1 && t < s.cfg.fairTries - 5) continue; // at most one big piece per tray
      if (solvable(s.board, N, cand, { n: 4000 })) { tray = cand; break; }
      }
    if (!tray) { // board is genuinely jammed: deal small pieces; game may end, which is honest
      tray = [SHAPES[0], SHAPES[1], SHAPES[3]].map(x => x).sort(() => R() - 0.5);
    }
    const fl = [1, 2, 3, 4, 5, 6].sort(() => R() - 0.5); // three different flavours per tray, so pieces read apart
    s.tray = tray.map((sh, i) => ({ shape: sh, flav: s.cfg.flavours >= 3 ? fl[i] : 1 + Math.floor(R() * s.cfg.flavours), used: false }));
    s.traysDealt++;
  }

  // ---------- state ----------
  function create(cfg, seed) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const s = { cfg, rng: mulberry(seed == null ? (Date.now() & 0x7fffffff) : seed), board: new Array(cfg.size * cfg.size).fill(0),
      tray: [], cap: cfg.jarCap, score: 0, combo: 0, sinceClear: 0, jar: 0, popReady: false, over: false,
      placements: 0, lines: 0, clears: 0, pops: 0, bestCombo: 0, traysDealt: 0, maxMulti: 0 };
    fill(s);
    return s;
  }

  // returns an event list for the renderer
  function place(s, ti, r, c) {
    const t = s.tray[ti];
    if (!t || t.used || s.over || !canPlace(s, t.shape, r, c)) return null;
    const N = s.cfg.size, ev = [];
    const cells = t.shape.cells.map(([dr, dc]) => [r + dr, c + dc]);
    for (const [rr, cc] of cells) s.board[rr * N + cc] = t.flav;
    t.used = true; s.placements++;
    let pts = cells.length; // placement points
    ev.push({ type: 'place', cells, flav: t.flav, ti });
    // clears
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      let fr = true, fc = true;
      for (let j = 0; j < N; j++) { if (!s.board[i * N + j]) fr = false; if (!s.board[j * N + i]) fc = false; }
      if (fr) rows.push(i); if (fc) cols.push(i);
    }
    const lines = rows.length + cols.length;
    if (lines) {
      const cleared = []; const seen = new Set();
      for (const i of rows) for (let j = 0; j < N; j++) { const k = i * N + j; if (!seen.has(k)) { seen.add(k); cleared.push([i, j, s.board[k]]); } }
      for (const i of cols) for (let j = 0; j < N; j++) { const k = j * N + i; if (!seen.has(k)) { seen.add(k); cleared.push([j, i, s.board[k]]); } }
      for (const [rr, cc] of cleared) s.board[rr * N + cc] = 0;
      s.combo++; s.sinceClear = 0; s.clears++; s.lines += lines;
      s.bestCombo = Math.max(s.bestCombo, s.combo); s.maxMulti = Math.max(s.maxMulti, lines);
      const base = [0, 100, 300, 600, 1000, 1500, 2100, 2800][Math.min(lines, 7)];
      const mult = 1 + 0.5 * (s.combo - 1);
      const linePts = Math.round(base * mult);
      pts += linePts;
      const boardClear = s.board.every(v => !v);
      if (boardClear) pts += 1500;
      // Jelly Overflow: more lines and longer combos pour more jelly
      let jelly = lines * (1 + 0.25 * (s.combo - 1)) + (lines >= 2 ? (lines - 1) * 0.5 : 0) + (boardClear ? 4 : 0);
      const before = s.jar;
      if (!s.popReady) { s.jar = Math.min(s.cap, s.jar + jelly); if (s.jar >= s.cap) { s.popReady = true; } }
      ev.push({ type: 'clear', rows, cols, cleared, lines, combo: s.combo, points: linePts, boardClear, jelly, jarFrom: before, jarTo: s.jar, jarCap: s.cap, charged: s.popReady && before < s.cap });
    } else {
      s.sinceClear++;
      if (s.combo && s.sinceClear >= s.cfg.comboGrace) { ev.push({ type: 'comboLost', combo: s.combo }); s.combo = 0; }
    }
    s.score += pts;
    ev.push({ type: 'score', score: s.score, add: pts });
    if (s.tray.every(x => x.used)) { fill(s); ev.push({ type: 'tray' }); }
    checkOver(s, ev);
    return ev;
  }

  function pop(s, r, c) {
    if (!s.popReady || s.over) return null;
    const N = s.cfg.size, cells = popCells(s, r, c), cleared = [];
    if (s.cfg.popMode === 'pour') {
      const poured = []; for (const [rr, cc] of cells) if (!s.board[rr * N + cc]) { s.board[rr * N + cc] = 7; poured.push([rr, cc]); }
      const rows = [], cols = [];
      for (let i = 0; i < N; i++) { let fr = true, fc = true; for (let j = 0; j < N; j++) { if (!s.board[i * N + j]) fr = false; if (!s.board[j * N + i]) fc = false; } if (fr) rows.push(i); if (fc) cols.push(i); }
      const seen = new Set();
      for (const i of rows) for (let j = 0; j < N; j++) seen.add(i * N + j);
      for (const i of cols) for (let j = 0; j < N; j++) seen.add(j * N + i);
      for (const k of seen) { cleared.push([Math.floor(k / N), k % N, s.board[k]]); s.board[k] = 0; }
      const lines = rows.length + cols.length, pts = [0, 100, 300, 600, 1000, 1500, 2100, 2800][Math.min(lines, 7)];
      s.score += pts; s.lines += lines;
      s.popReady = false; s.jar = 0; s.pops++; s.cap = s.cap * s.cfg.capGrow;
      const ev = [{ type: 'pour', r, c, area: cells, poured, rows, cols, cleared, lines }, { type: 'score', score: s.score, add: pts }];
      checkOver(s, ev); return ev;
    }
    for (const [rr, cc] of cells) { const v = s.board[rr * N + cc]; if (v) { cleared.push([rr, cc, v]); s.board[rr * N + cc] = 0; } }
    s.popReady = false; s.jar = 0; s.pops++; s.cap = s.cap * s.cfg.capGrow;
    const ev = [{ type: 'pop', r, c, area: cells, cleared }];
    if (s.cfg.popScores) { s.score += cleared.length * 10; ev.push({ type: 'score', score: s.score, add: cleared.length * 10 }); }
    s.over = false; checkOver(s, ev);
    return ev;
  }

  function anyMove(s) { return s.tray.some(t => !t.used && fitsAnywhere(s.board, s.cfg.size, t.shape)); }
  function checkOver(s, ev) {
    if (anyMove(s)) { s.stuck = false; return; }
    if (s.popReady) { s.stuck = true; ev.push({ type: 'stuck' }); return; } // must use the pop (or give up)
    s.over = true; ev.push({ type: 'over', score: s.score });
  }
  function giveUp(s) { s.over = true; return [{ type: 'over', score: s.score }]; }

  // where would the shape land, and which lines would it complete? (for ghost + line highlight)
  function preview(s, ti, r, c) {
    const t = s.tray[ti]; if (!t || !canPlace(s, t.shape, r, c)) return null;
    const N = s.cfg.size, b = s.board.slice();
    for (const [dr, dc] of t.shape.cells) b[(r + dr) * N + c + dc] = 9;
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) { let fr = true, fc = true; for (let j = 0; j < N; j++) { if (!b[i * N + j]) fr = false; if (!b[j * N + i]) fc = false; } if (fr) rows.push(i); if (fc) cols.push(i); }
    return { cells: t.shape.cells.map(([dr, dc]) => [r + dr, c + dc]), rows, cols };
  }

  const API = { DEFAULTS, SHAPES, POP, create, place, pop, giveUp, canPlace, preview, popCells, fitsAnywhere, anyMove, mulberry, placeOn };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JJLogic = API;
})(typeof window !== 'undefined' ? window : globalThis);
