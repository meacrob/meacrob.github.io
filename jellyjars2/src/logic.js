/* Jelly Jars 2.0 - pure game logic (no rendering). Browser: window.JJLogic, Node: module.exports.
   Board: N x N, 0 = empty, 1..6 flavours, 7 = poured jelly, 8 = crate (obstacle, cleared by lines).
   Overlays: mark[k] = star jelly (level target), jam[k] = sticky jam under a cell (cleaned when its line clears).
   State is plain JSON (RNG state included) so a run can be saved and resumed exactly. */
(function (root) {
  'use strict';

  const DEFAULTS = {
    size: 8, flavours: 6,
    jarCap: 6,           // jelly units for the first charge (sim: ~20-25 good placements)
    popMode: 'pour',     // 'pour' (default) fills the area's empty cells; 'clear' (experiment) bursts the area
    capGrow: 1.4,        // each pour makes the next charge bigger (keeps endless runs finite)
    popShape: '3x3', popScores: false, comboGrace: 3, fairTries: 40,
    friendlyStart: false,// first tray sets up an easy clear (tutorial / first ever run only)
    fixedSeq: false,     // daily challenge: trays depend only on the seed, so every player gets the same sequence
    goal: null,          // levels: { type: 'lines'|'score'|'stars'|'jar'|'combo'|'jam'|'crates', n, moves }
    trays: null,         // tutorial: scripted trays [[[shapeId, flavour], ...], ...]
    preset: null         // levels: array of 8 strings. '.' empty, 1-6 jelly, 'x' crate, '*' star jelly, 'j' jam (empty), 'J' jam under jelly
  };

  // ---------- RNG: state lives in s.seed so it survives JSON save/load ----------
  function rnd(s, key) { let a = s[key || 'seed'] | 0; a = a + 0x6D2B79F5 | 0; s[key || 'seed'] = a; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function mulberry(a) { const o = { seed: a }; return () => rnd(o); }

  // ---------- pieces: [id, cells, weight, tier 0 small / 1 medium / 2 big] ----------
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
  const SHAPES = RAW.map(([id, cells, w, tier]) => ({ id, cells, w, tier, h: Math.max(...cells.map(c => c[0])) + 1, wd: Math.max(...cells.map(c => c[1])) + 1, n: cells.length }));
  const SHAPE = Object.fromEntries(SHAPES.map(s => [s.id, s]));

  const POP = {
    '3x3': [[-1,-1],[-1,0],[-1,1],[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]],
    'plus': [[-2,0],[-1,0],[0,-2],[0,-1],[0,0],[0,1],[0,2],[1,0],[2,0]],
    'small': [[-1,0],[0,-1],[0,0],[0,1],[1,0]],
    'diamond': [[-2,0],[-1,-1],[-1,0],[-1,1],[0,-2],[0,-1],[0,0],[0,1],[0,2],[1,-1],[1,0],[1,1],[2,0]],
    'cross': null
  };
  function popCells(s, r, c) {
    const N = s.cfg.size, out = [];
    if (s.cfg.popShape === 'cross') { for (let i = 0; i < N; i++) { out.push([r, i]); if (i !== r) out.push([i, c]); } return out; }
    for (const [dr, dc] of POP[s.cfg.popShape] || POP['3x3']) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push([rr, cc]); }
    return out;
  }

  // ---------- board helpers ----------
  const shapeOf = t => SHAPE[t.shape];
  function canPlace(s, shape, r, c) {
    const N = s.cfg.size; if (typeof shape === 'string') shape = SHAPE[shape];
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
  function fullLines(b, N) {
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) { let fr = true, fc = true; for (let j = 0; j < N; j++) { if (!b[i * N + j]) fr = false; if (!b[j * N + i]) fc = false; } if (fr) rows.push(i); if (fc) cols.push(i); }
    return { rows, cols };
  }
  function placeOn(board, N, shape, r, c, v) {
    const b = board.slice(); for (const [dr, dc] of shape.cells) b[(r + dr) * N + c + dc] = v;
    const { rows, cols } = fullLines(b, N);
    for (const i of rows) for (let j = 0; j < N; j++) b[i * N + j] = 0;
    for (const i of cols) for (let j = 0; j < N; j++) b[j * N + i] = 0;
    return { b, rows, cols };
  }
  function solvable(board, N, pieces, budget) {
    if (!pieces.length) return true;
    for (let i = 0; i < pieces.length; i++) {
      const sh = pieces[i], rest = pieces.filter((_, k) => k !== i);
      for (let r = 0; r + sh.h <= N; r++) for (let c = 0; c + sh.wd <= N; c++) {
        let ok = true; for (const [dr, dc] of sh.cells) if (board[(r + dr) * N + c + dc]) { ok = false; break; }
        if (!ok) continue;
        if (--budget.n < 0) return true;
        if (solvable(placeOn(board, N, sh, r, c, 1).b, N, rest, budget)) return true;
      }
    }
    return false;
  }

  // ---------- tray generator ----------
  // Fair: never deals an unplaceable tray when a placeable one exists. Gentle help on crowded boards.
  // Daily (fixedSeq): trays come only from the seed, so everyone gets the same pieces in the same order.
  function fill(s) {
    const N = s.cfg.size, filled = s.board.filter(Boolean).length / (N * N);
    const key = s.cfg.fixedSeq ? 'seqSeed' : 'seed';
    const R = () => rnd(s, key);
    const pick = () => {
      let tot = 0; const ws = SHAPES.map(sh => { let w = sh.w; if (!s.cfg.fixedSeq) { if (filled > 0.55 && sh.tier === 2) w *= 0.35; if (filled < 0.25 && sh.tier === 0) w *= 0.6; } tot += w; return w; });
      let x = R() * tot; for (let i = 0; i < SHAPES.length; i++) { x -= ws[i]; if (x <= 0) return SHAPES[i]; } return SHAPES[0];
    };
    let tray = null;
    const script = s.cfg.trays && s.cfg.trays[s.traysDealt]; // tutorial: exact pieces and flavours
    if (script) { s.tray = script.map(([id, f]) => ({ shape: id, flav: f, used: false })); s.traysDealt++; return; }
    if (s.traysDealt === 0 && s.cfg.friendlyStart) tray = [SHAPE['4h'], SHAPE.o, SHAPE['4h']];
    for (let t = 0; !tray && t < s.cfg.fairTries; t++) {
      const cand = [pick(), pick(), pick()];
      if (cand.filter(c => c.tier === 2).length > 1 && (s.cfg.fixedSeq || t < s.cfg.fairTries - 5)) continue;
      if (s.traysDealt === 1 && s.cfg.friendlyStart && cand.some(c => c.tier === 2) && t < s.cfg.fairTries - 5) continue;
      if (s.cfg.fixedSeq || solvable(s.board, N, cand, { n: 4000 })) { tray = cand; break; }
    }
    if (!tray) tray = [SHAPE['1'], SHAPE['2h'], SHAPE['3h']];
    const fl = [1, 2, 3, 4, 5, 6]; for (let i = 5; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [fl[i], fl[j]] = [fl[j], fl[i]]; }
    s.tray = tray.map((sh, i) => ({ shape: sh.id, flav: fl[i], used: false }));
    s.traysDealt++;
  }

  // ---------- state ----------
  function create(cfg, seed) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const N = cfg.size, sd = seed == null ? (Date.now() & 0x7fffffff) : seed;
    const s = { v: 2, cfg, seed: sd, seqSeed: sd ^ 0x5bd1e995, board: new Array(N * N).fill(0), mark: new Array(N * N).fill(0), jam: new Array(N * N).fill(0),
      tray: [], cap: cfg.jarCap, score: 0, combo: 0, sinceClear: 0, jar: 0, jarTotal: 0, popReady: false, stuck: false, over: false, won: false,
      placements: 0, lines: 0, clears: 0, pops: 0, bestCombo: 0, traysDealt: 0, maxMulti: 0, starsGot: 0, jamCleaned: 0, cratesCleared: 0,
      starsTotal: 0, jamTotal: 0, cratesTotal: 0, flavCleared: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
    if (cfg.preset) cfg.preset.forEach((row, r) => [...row].forEach((ch, c) => {
      const k = r * N + c;
      if (ch >= '1' && ch <= '6') s.board[k] = +ch;
      else if (ch === 'x') { s.board[k] = 8; s.cratesTotal++; }
      else if (ch === '*') { s.board[k] = 1 + (k * 7) % 6; s.mark[k] = 1; s.starsTotal++; }
      else if (ch === 'j') { s.jam[k] = 1; s.jamTotal++; }
      else if (ch === 'J') { s.board[k] = 1 + (k * 5) % 6; s.jam[k] = 1; s.jamTotal++; }
    }));
    fill(s);
    return s;
  }

  function progress(s) {
    const g = s.cfg.goal; if (!g) return null;
    const v = { lines: s.lines, score: s.score, stars: s.starsGot, jar: s.pops, combo: s.bestCombo, jam: s.jamCleaned, crates: s.cratesCleared }[g.type] || 0;
    return { v: Math.min(v, g.n), n: g.n, movesLeft: g.moves ? Math.max(0, g.moves - s.placements) : null };
  }

  // remove the cells of the full lines; collect targets/jam/crates; returns { cleared, lines, gains }
  function resolve(s, rows, cols) {
    const N = s.cfg.size, seen = new Set(), cleared = [], gains = { stars: [], jam: [], crates: 0 };
    for (const i of rows) for (let j = 0; j < N; j++) seen.add(i * N + j);
    for (const i of cols) for (let j = 0; j < N; j++) seen.add(j * N + i);
    for (const k of seen) {
      const r = Math.floor(k / N), c = k % N, v = s.board[k];
      cleared.push([r, c, v]); s.flavCleared[v]++;
      if (s.mark[k]) { s.mark[k] = 0; s.starsGot++; gains.stars.push([r, c]); }
      if (s.jam[k]) { s.jam[k] = 0; s.jamCleaned++; gains.jam.push([r, c]); }
      if (v === 8) { s.cratesCleared++; gains.crates++; }
      s.board[k] = 0;
    }
    return { cleared, gains };
  }

  function place(s, ti, r, c) {
    const t = s.tray[ti];
    if (!t || t.used || s.over || !canPlace(s, SHAPE[t.shape], r, c)) return null;
    if (s.cfg.goal && s.cfg.goal.moves && s.placements >= s.cfg.goal.moves) return null;
    const N = s.cfg.size, ev = [], sh = SHAPE[t.shape];
    const cells = sh.cells.map(([dr, dc]) => [r + dr, c + dc]);
    for (const [rr, cc] of cells) s.board[rr * N + cc] = t.flav;
    t.used = true; s.placements++;
    let pts = cells.length;
    ev.push({ type: 'place', cells, flav: t.flav, ti });
    const { rows, cols } = fullLines(s.board, N), lines = rows.length + cols.length;
    if (lines) {
      const { cleared, gains } = resolve(s, rows, cols);
      s.combo++; s.sinceClear = 0; s.clears++; s.lines += lines;
      s.bestCombo = Math.max(s.bestCombo, s.combo); s.maxMulti = Math.max(s.maxMulti, lines);
      const linePts = Math.round([0, 100, 300, 600, 1000, 1500, 2100, 2800][Math.min(lines, 7)] * (1 + 0.5 * (s.combo - 1)));
      pts += linePts;
      const boardClear = s.board.every(v => !v); if (boardClear) pts += 1500;
      const jelly = lines * (1 + 0.25 * (s.combo - 1)) + (lines >= 2 ? (lines - 1) * 0.5 : 0) + (boardClear ? 4 : 0);
      const before = s.jar;
      s.jarTotal += jelly; // total jelly earned (jar levels count overflow too)
      if (!s.popReady) { s.jar = Math.min(s.cap, s.jar + jelly); if (s.jar >= s.cap) s.popReady = true; }
      ev.push({ type: 'clear', rows, cols, cleared, gains, lines, combo: s.combo, points: linePts, boardClear, jelly, jarFrom: before, jarTo: s.jar, jarCap: s.cap, charged: s.popReady && before < s.cap });
    } else {
      s.sinceClear++;
      if (s.combo && s.sinceClear >= s.cfg.comboGrace) { ev.push({ type: 'comboLost', combo: s.combo }); s.combo = 0; }
    }
    s.score += pts;
    ev.push({ type: 'score', score: s.score, add: pts });
    if (s.tray.every(x => x.used)) { fill(s); ev.push({ type: 'tray' }); }
    after(s, ev);
    return ev;
  }

  function pop(s, r, c) {
    if (!s.popReady || s.over) return null;
    const N = s.cfg.size, cells = popCells(s, r, c);
    let ev;
    if (s.cfg.popMode === 'pour') {
      const poured = []; for (const [rr, cc] of cells) if (!s.board[rr * N + cc]) { s.board[rr * N + cc] = 7; poured.push([rr, cc]); }
      const { rows, cols } = fullLines(s.board, N), lines = rows.length + cols.length;
      const { cleared, gains } = resolve(s, rows, cols);
      const pts = [0, 100, 300, 600, 1000, 1500, 2100, 2800][Math.min(lines, 7)];
      s.score += pts; s.lines += lines;
      ev = [{ type: 'pour', r, c, area: cells, poured, rows, cols, cleared, gains, lines }, { type: 'score', score: s.score, add: pts }];
    } else {
      const cleared = []; for (const [rr, cc] of cells) { const k = rr * N + cc, v = s.board[k]; if (v) { cleared.push([rr, cc, v]); s.board[k] = 0; s.mark[k] = 0; } }
      ev = [{ type: 'pop', r, c, area: cells, cleared }];
    }
    s.popReady = false; s.jar = 0; s.pops++; s.cap *= s.cfg.capGrow;
    after(s, ev);
    return ev;
  }

  function anyMove(s) { return s.tray.some(t => !t.used && fitsAnywhere(s.board, s.cfg.size, SHAPE[t.shape])); }
  // after every action: level win / out of moves / no room
  function after(s, ev) {
    const g = s.cfg.goal;
    if (g) {
      const p = progress(s);
      if (p.v >= g.n) { s.over = true; s.won = true; ev.push({ type: 'win', score: s.score, movesLeft: p.movesLeft }); return; }
      if (g.moves && s.placements >= g.moves) {
        if (s.popReady) { s.stuck = true; ev.push({ type: 'stuck', reason: 'moves' }); return; } // one last pour allowed
        s.over = true; ev.push({ type: 'over', reason: 'moves', score: s.score }); return;
      }
    }
    if (anyMove(s)) { s.stuck = false; return; }
    if (s.popReady) { s.stuck = true; ev.push({ type: 'stuck' }); return; }
    s.over = true; ev.push({ type: 'over', reason: 'room', score: s.score });
  }
  function giveUp(s) { s.over = true; return [{ type: 'over', reason: s.stuck ? 'room' : 'moves', score: s.score }]; }
  // revive (rewarded ad later): clear a 3x3 hole in the most crowded spot and deal a fresh tray
  function revive(s, extraMoves) {
    const N = s.cfg.size; let best = null;
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) { let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (s.board[(r + dr) * N + c + dc]) n++; if (!best || n > best.n) best = { r, c, n }; }
    const cleared = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const k = (best.r + dr) * N + best.c + dc; if (s.board[k] && s.board[k] !== 8) { cleared.push([best.r + dr, best.c + dc, s.board[k]]); s.board[k] = 0; s.mark[k] = 0; } }
    if (extraMoves && s.cfg.goal) s.cfg.goal = Object.assign({}, s.cfg.goal, { moves: s.cfg.goal.moves + extraMoves });
    s.over = false; s.stuck = false; fill(s);
    return [{ type: 'revive', cleared }, { type: 'tray' }];
  }

  // what a pour at (r,c) would do, without changing the state: for the confirm preview
  function pourPreview(s, r, c) {
    const N = s.cfg.size, area = popCells(s, r, c), b = s.board.slice(), poured = [];
    for (const [rr, cc] of area) if (!b[rr * N + cc]) { b[rr * N + cc] = 7; poured.push([rr, cc]); }
    const { rows, cols } = fullLines(b, N), gone = new Set();
    for (const i of rows) for (let j = 0; j < N; j++) gone.add(i * N + j);
    for (const i of cols) for (let j = 0; j < N; j++) gone.add(j * N + i);
    return { area, poured, rows, cols, lines: rows.length + cols.length, stays: poured.filter(([rr, cc]) => !gone.has(rr * N + cc)), clearsCells: [...gone].map(k => [Math.floor(k / N), k % N]) };
  }
  function preview(s, ti, r, c) {
    const t = s.tray[ti]; if (!t || t.used || !canPlace(s, SHAPE[t.shape], r, c)) return null;
    const N = s.cfg.size, b = s.board.slice(), sh = SHAPE[t.shape];
    for (const [dr, dc] of sh.cells) b[(r + dr) * N + c + dc] = 9;
    const { rows, cols } = fullLines(b, N);
    return { cells: sh.cells.map(([dr, dc]) => [r + dr, c + dc]), rows, cols };
  }

  const API = { DEFAULTS, SHAPES, SHAPE, POP, create, place, pop, giveUp, revive, canPlace, preview, pourPreview, popCells, fitsAnywhere, anyMove, mulberry, placeOn, progress, shapeOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JJLogic = API;
})(typeof window !== 'undefined' ? window : globalThis);
