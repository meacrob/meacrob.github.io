/* Jelly Jars 2.0 - glue: input, game flow, UI, perf overlay. Logic = JJLogic, view = JJView, sound = JJAudio. */
(function () {
  'use strict';
  const L = window.JJLogic, V = window.JJView, A = window.JJAudio;
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const store = { get(k, d) { try { const v = localStorage.getItem('jj2_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('jj2_' + k, JSON.stringify(v)); } catch (e) {} } };
  const cfg = Object.assign({}, L.DEFAULTS, store.get('cfg', {}));
  let S = null, best = store.get('best', 0), mode = 'title', drag = null, aiming = false, shownScore = 0, newBest = false, runs = store.get('runs', 0);

  // ---------- boot ----------
  V.init($('c'));
  window.addEventListener('resize', () => V.resize());
  $('best').textContent = fmt(best);
  V.titleDemo();
  if (Q.get('debug') === '1' || store.get('debug', false)) togglePerf(true);
  A.setOn(store.get('sound', true)); syncSoundBtn();

  function newGame() {
    document.body.classList.remove('attitle');
    S = L.create(cfg); V.clearAll(); V.setTray(S.tray); V.setJar(0, S.cap, false);
    shownScore = 0; setScore(0, true); newBest = false; mode = 'play'; runs++; store.set('runs', runs);
    $('stuck').classList.remove('on'); $('aimHint').classList.remove('on'); hideJarBtn();
    perf.runStart = performance.now();
  }

  // ---------- input (pointer events: touch + mouse) ----------
  const cv = $('c');
  cv.addEventListener('pointerdown', e => {
    A.init(); if (mode !== 'play' || V.tweens.some(t => t.lock)) return;
    if (aiming) { aimAt(e.clientX, e.clientY); return; }
    const i = V.trayHit(e.clientX, e.clientY); if (i < 0 || S.tray[i].used) return;
    drag = { i, id: e.pointerId, lift: Math.min(140, V.h * 0.13) }; cv.setPointerCapture(e.pointerId);
    V.dragStart(i); A.pick(); onDragMove(e.clientX, e.clientY);
  });
  cv.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) onDragMove(e.clientX, e.clientY); else if (aiming && e.buttons) aimAt(e.clientX, e.clientY); });
  cv.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) onDrop(); else if (aiming && aimCell) doPour(); });
  cv.addEventListener('pointercancel', () => { if (drag) { V.dragBack(); drag = null; } });
  function onDragMove(x, y) {
    const cell = V.dragTo(x, y, drag.lift); drag.cell = cell;
    const pv = cell && L.preview(S, drag.i, cell.r, cell.c);
    if (pv) { V.ghostShow(pv, S.tray[drag.i].flav); drag.ok = true; } else { V.ghostHide(); drag.ok = false; }
  }
  function onDrop() {
    const d = drag; drag = null;
    if (!d.ok) { V.dragBack(); A.bad(); return; }
    const ev = L.place(S, d.i, d.cell.r, d.cell.c); if (!ev) { V.dragBack(); return; }
    handle(ev, { r: d.cell.r + 1, c: d.cell.c + 1 });
  }

  // ---------- events from logic -> view/sound/ui ----------
  function handle(ev, origin) {
    let delayTray = 0;
    for (const e of ev) {
      if (e.type === 'place') { V.placePiece(e); A.place(e.cells.length); }
      else if (e.type === 'clear') {
        delayTray = 0.35;
        setTimeout(() => A.clear(e.lines, e.combo), 60);
        V.clearLines(e, origin, () => { V.setJar(S.popReady ? S.cap : S.jar, S.cap, S.popReady); A.jelly(); if (e.charged) { A.ready(); showJarBtn(); } });
        const words = e.boardClear ? 'Board clear!' : e.lines >= 4 ? 'Jelly-licious!' : e.lines === 3 ? 'Sweet!' : e.lines === 2 ? 'Double!' : '';
        if (words) popText(words, 'big');
        if (e.combo >= 2) { setTimeout(() => { popText('Combo x' + e.combo, 'combo'); A.combo(e.combo); }, words ? 260 : 0); }
        floatScore('+' + e.points, origin);
      }
      else if (e.type === 'comboLost') { /* quiet: losing a combo should not feel like punishment */ }
      else if (e.type === 'score') setScore(e.score);
      else if (e.type === 'tray') { setTimeout(() => V.setTray(S.tray), delayTray * 1000 + 120); }
      else if (e.type === 'stuck') { setTimeout(() => { $('stuck').classList.add('on'); V.setMood(2); }, 500); }
      else if (e.type === 'over') { setTimeout(gameOver, 650); }
    }
    // worried faces when the board is crowded
    const fill = S.board.filter(Boolean).length / 64; V.setMood(fill > 0.7 ? 2 : 1);
  }

  // ---------- Jelly Overflow: aim and pour ----------
  let aimCell = null;
  function jarTap(x, y) { const p = V.toScreen(V.JAR_POS.x, V.JAR_POS.y, V.JAR_POS.z); return Math.hypot(x - p.x, y - p.y) < V.h * 0.07; }
  document.addEventListener('pointerdown', e => {
    if (mode !== 'play' || !S || !S.popReady || drag) return;
    if (jarTap(e.clientX, e.clientY)) { e.stopPropagation(); aiming = !aiming; aimCell = null; $('aimHint').classList.toggle('on', aiming); V.ghostHide(); A.click(); }
  }, true);
  function aimAt(x, y) {
    const w = V.toWorld(x, y, 0.28); const c = Math.round(w.x + 3.5), r = Math.round(3.5 - w.y);
    if (r < 0 || r > 7 || c < 0 || c > 7) { aimCell = null; V.ghostHide(); return; }
    aimCell = { r, c }; const cells = L.popCells(S, r, c); const show = cfg.popMode === 'pour' ? cells.filter(([rr, cc]) => !S.board[rr * 8 + cc]) : cells;
    V.ghostShow({ cells: show, rows: [], cols: [] }, 7); for (const b of V.ghost.items) b.flash = 0.3;
  }
  function doPour() {
    const { r, c } = aimCell; aiming = false; aimCell = null; $('aimHint').classList.remove('on'); $('stuck').classList.remove('on'); V.ghostHide(); hideJarBtn();
    const ev = L.pop(S, r, c); if (!ev) return;
    if (ev[0].type === 'pour') {
      A.pour();
      V.pourAnim(ev[0], () => {
        V.setJar(0, S.cap, false);
        if (ev[0].lines) { A.pop(); V.clearLines({ cleared: ev[0].cleared, lines: ev[0].lines }, { r, c }, null); popText(ev[0].lines >= 2 ? 'Jelly Pop x' + ev[0].lines + '!' : 'Jelly Pop!', 'big'); floatScore('+' + ev[1].add, { r, c }); V.shake(0.3); }
        setScore(S.score); afterPop(ev);
      });
    } else { A.pop(); V.popAnim(ev[0]); popText('Jelly Pop!', 'big'); setTimeout(() => afterPop(ev), 300); }
  }
  function afterPop(ev) { for (const e of ev) { if (e.type === 'over') setTimeout(gameOver, 500); if (e.type === 'stuck') $('stuck').classList.add('on'); } const fill = S.board.filter(Boolean).length / 64; V.setMood(fill > 0.7 ? 2 : 1); }
  function showJarBtn() { const p = V.toScreen(V.JAR_POS.x, V.JAR_POS.y, V.JAR_POS.z); $('jarBtn').style.left = p.x + 'px'; $('jarBtn').style.top = (p.y - V.h * 0.115) + 'px'; $('jarBtn').classList.add('on'); }
  function hideJarBtn() { $('jarBtn').classList.remove('on'); }
  $('giveUp').onclick = () => { A.click(); $('stuck').classList.remove('on'); const ev = L.giveUp(S); afterPop(ev); };

  // ---------- UI ----------
  function fmt(n) { return n.toLocaleString('en-US'); }
  let scoreAnim = null;
  function setScore(v, instant) {
    if (instant) { shownScore = v; $('score').textContent = fmt(v); return; }
    const from = shownScore, t0 = performance.now(); cancelAnimationFrame(scoreAnim);
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 380); shownScore = Math.round(from + (v - from) * (1 - Math.pow(1 - k, 3))); $('score').textContent = fmt(shownScore); if (k < 1) scoreAnim = requestAnimationFrame(step); };
    step(); $('score').classList.remove('bump'); void $('score').offsetWidth; $('score').classList.add('bump');
    if (v > best && best > 0 && !newBest) { newBest = true; popText('New best!', 'best'); A.best(); }
  }
  function popText(txt, cls) { const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = txt; $('fx').appendChild(el); setTimeout(() => el.remove(), 1300); }
  function floatScore(txt, at) { const p = V.cellPos(at.r - 0.5, at.c - 0.5); const s = V.toScreen(p.x, p.y, 1); const el = document.createElement('div'); el.className = 'pts'; el.textContent = txt; el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; $('fx').appendChild(el); setTimeout(() => el.remove(), 1000); }

  function gameOver() {
    if (mode !== 'play') return; mode = 'over'; if (Q.get('bot') === '1') console.log('OVER', JSON.stringify({ b: S.board.join(''), tray: S.tray.map(t => t.shape.id + (t.used ? 'u' : '')), stuck: S.stuck, ready: S.popReady, pl: S.placements })); V.gameOverAnim(); A.over();
    const isBest = S.score > best; if (isBest) { best = S.score; store.set('best', best); $('best').textContent = fmt(best); }
    perf.runs.push({ score: S.score, placements: S.placements, lines: S.lines, pops: S.pops, secs: Math.round((performance.now() - perf.runStart) / 1000) });
    setTimeout(() => {
      $('goScore').textContent = '0'; $('goBest').textContent = fmt(best); $('goTitle').textContent = isBest && S.score > 0 ? 'New best!' : 'Out of moves';
      $('goStats').textContent = `${S.lines} lines · best combo x${S.bestCombo} · ${S.pops} pour${S.pops === 1 ? '' : 's'}`;
      $('gameover').classList.add('on');
      const t0 = performance.now(), tgt = S.score; const step = () => { const k = Math.min(1, (performance.now() - t0) / 900); $('goScore').textContent = fmt(Math.round(tgt * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); }; step();
      if (isBest && S.score > 0) A.best();
    }, 700);
  }
  $('again').onclick = () => { A.init(); A.click(); $('gameover').classList.remove('on'); V.wipeBoard(newGame); mode = 'busy'; };
  $('play').onclick = () => { A.init(); A.click(); $('title').classList.remove('on'); mode = 'busy'; V.wipeBoard(newGame); };
  $('home').onclick = () => { A.click(); $('gameover').classList.remove('on'); V.wipeBoard(() => { V.titleDemo(); }); $('title').classList.add('on'); document.body.classList.add('attitle'); mode = 'title'; };
  $('pause').onclick = () => { A.click(); $('menu').classList.add('on'); };
  $('resume').onclick = () => { A.click(); $('menu').classList.remove('on'); };
  $('restart').onclick = () => { A.click(); $('menu').classList.remove('on'); V.wipeBoard(newGame); mode = 'busy'; };
  $('sound').onclick = () => { A.setOn(!A.on); store.set('sound', A.on); syncSoundBtn(); A.click(); };
  function syncSoundBtn() { $('sound').textContent = 'Sound: ' + (A.on ? 'On' : 'Off'); }
  $('perfBtn').onclick = () => { togglePerf(); $('menu').classList.remove('on'); };

  // ---------- experiment knobs (debug panel) ----------
  function syncKnobs() { $('kMode').value = cfg.popMode; $('kShape').value = cfg.popShape; $('kCap').value = cfg.jarCap; $('kGrow').value = cfg.capGrow; }
  ['kMode', 'kShape', 'kCap', 'kGrow'].forEach(id => $(id).onchange = () => {
    cfg.popMode = $('kMode').value; cfg.popShape = $('kShape').value; cfg.jarCap = +$('kCap').value; cfg.capGrow = +$('kGrow').value;
    store.set('cfg', { popMode: cfg.popMode, popShape: cfg.popShape, jarCap: cfg.jarCap, capGrow: cfg.capGrow }); if (mode === 'play') { V.wipeBoard(newGame); mode = 'busy'; }
  });
  syncKnobs();
  $('kDpr').value = store.get('dprLock', 'auto'); if ($('kDpr').value !== 'auto') { V.setDpr(+$('kDpr').value); }
  $('kDpr').onchange = () => { const v = $('kDpr').value; store.set('dprLock', v); if (v !== 'auto') V.setDpr(+v); perf.frames.length = 0; perf.cpu.length = 0; };

  // ---------- performance overlay ----------
  const perf = { cpu: [], frames: [], longFrames: 0, rendered: 0, runs: [], start: performance.now(), dprLog: [], lastAdapt: performance.now(), goodSince: performance.now() };
  let gl = V.renderer.getContext(), gpu = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
  function togglePerf(v) { const on = v == null ? !$('perf').classList.contains('on') : v; $('perf').classList.toggle('on', on); store.set('debug', on); }
  function pct(a, p) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
  function perfText() {
    const f = perf.frames, avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'n/a';
    const info = V.renderer.info;
    return [
      `FPS ${avg ? (1000 / avg).toFixed(0) : '-'}  (frame ${avg.toFixed(1)} ms, p95 ${pct(f, 0.95).toFixed(1)}, max ${Math.max(0, ...f).toFixed(0)})`,
      `CPU (JS+GL submit) ${(perf.cpu.reduce((a, b) => a + b, 0) / Math.max(1, perf.cpu.length)).toFixed(1)} ms, p95 ${pct(perf.cpu, 0.95).toFixed(1)}  -> ${avg && pct(perf.cpu, 0.5) < avg * 0.4 ? 'GPU/display bound' : 'CPU bound'}`,
      `slow frames >33ms: ${perf.longFrames} of ${perf.rendered}`,
      `draw calls ${info.render.calls}, tris ${info.render.triangles}, particles ${V.parts.list.length}`,
      `DPR ${V.dpr.toFixed(2)} / max ${V.dprMax}  canvas ${V.canvas.width}x${V.canvas.height}`,
      `warm-up frame ${(perf.firstFrame || 0).toFixed(0)} ms (shader compile)`,
      `JS heap ${mem}  geo ${info.memory.geometries} tex ${info.memory.textures}`,
      `voices ${A.voices()}  ${V.active ? 'animating' : 'idle (not rendering)'}`,
      `cores ${navigator.hardwareConcurrency || '?'}  RAM ${navigator.deviceMemory || '?'} GB`,
      `GPU ${gpu}`
    ].join('\n');
  }
  $('perfCopy').onclick = () => {
    const sess = (performance.now() - perf.start) / 1000;
    const txt = `Jelly Jars 2.0 prototype perf report\n${navigator.userAgent}\nsession ${sess.toFixed(0)} s, runs ${perf.runs.length}\n` + perfText() +
      `\nDPR changes: ${perf.dprLog.join(', ') || 'none'}\nruns: ${perf.runs.map(r => `${r.score}pts/${r.secs}s/${r.pops}pours`).join(' | ')}\nconfig: ${cfg.popMode} ${cfg.popShape} jar ${cfg.jarCap} x${cfg.capGrow}`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { $('perfCopy').textContent = 'Copied!'; setTimeout(() => $('perfCopy').textContent = 'Copy report', 1200); }).catch(() => { prompt('Copy this report:', txt); });
  };
  $('perfMin').onclick = () => { $('perf').classList.toggle('min'); $('perfMin').textContent = $('perf').classList.contains('min') ? 'more' : 'less'; };
  window.JJPerf = { perf, perfText };
  window.JJState = () => S;
  window.JJCheck = () => { const bad = []; for (let k = 0; k < 64; k++) if (!!S.board[k] !== !!V.board[k]) bad.push(k); return bad; };

  // ---------- main loop: render only when something moves; adapt resolution to measured frame time ----------
  let lastT = performance.now(), lastPerfUi = 0, warm = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = Math.max(0, now - lastT); const dt = Math.min(0.05, raw / 1000); lastT = now; warm++;
    const c0 = performance.now(); const active = V.frame(dt);
    if (active) {
      V.render(); perf.rendered++; const cpu = performance.now() - c0;
      if (warm < 20) { perf.firstFrame = Math.max(perf.firstFrame || 0, cpu); perf.rendered--; return; } // shader compile / warm-up, reported separately
      perf.cpu.push(cpu); if (perf.cpu.length > 180) perf.cpu.shift();
      perf.frames.push(raw); if (perf.frames.length > 180) perf.frames.shift(); if (raw > 33.5) perf.longFrames++;
      // adaptive DPR: drop resolution when frames are slow, never the art
      if ($('kDpr').value === 'auto' && now - perf.lastAdapt > 2000 && perf.frames.length > 60) {
        const recent = perf.frames.slice(-60), avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        if (avg > 24 && V.dpr > 1) { V.setDpr(V.dpr - 0.25); perf.dprLog.push(V.dpr.toFixed(2) + '@' + Math.round(avg) + 'ms'); perf.goodSince = now; perf.frames.length = 0; }
        else if (avg < 17.5 && V.dpr < Math.min(V.dprMax, 1.75) && now - perf.goodSince > 8000) { V.setDpr(V.dpr + 0.25); perf.dprLog.push(V.dpr.toFixed(2) + '+'); perf.goodSince = now; perf.frames.length = 0; }
        else if (avg >= 17.5) perf.goodSince = now;
        perf.lastAdapt = now;
      }
    }
    if ($('perf').classList.contains('on') && now - lastPerfUi > 500) { $('perfTxt').innerHTML = perfText().split('\n').map(l => '<div>' + l.replace(/</g, '&lt;') + '</div>').join(''); lastPerfUi = now; }
  }
  requestAnimationFrame(loop);

  // ---------- test bot (?bot=1): plays real moves through the same code path, for automated testing ----------
  if (Q.get('bot') === '1') {
    const speed = +(Q.get('speed') || 1);
    window.JJBot = { on: true };
    const think = () => {
      if (!window.JJBot.on) return;
      if (mode === 'title') { $('play').click(); return setTimeout(think, 600 / speed); }
      if (mode === 'over') { if ($('gameover').classList.contains('on')) { $('again').click(); } return setTimeout(think, 900 / speed); }
      if (mode !== 'play' || V.tweens.length > 2) return setTimeout(think, 120 / speed);
      if (S.popReady && (S.stuck || Math.random() < 0.15)) {
        let bestP = null; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const empty = L.popCells(S, r, c).filter(([rr, cc]) => !S.board[rr * 8 + cc]).length; if (!bestP || empty > bestP.n) bestP = { r, c, n: empty }; }
        aimCell = { r: bestP.r, c: bestP.c }; aiming = true; doPour(); return setTimeout(think, 1600 / speed);
      }
      if (S.stuck) { $('giveUp').click(); return setTimeout(think, 600 / speed); }
      let bm = null;
      S.tray.forEach((t, ti) => { if (t.used) return; for (let r = 0; r <= 8 - t.shape.h; r++) for (let c = 0; c <= 8 - t.shape.wd; c++) { if (!L.canPlace(S, t.shape, r, c)) continue; const res = L.placeOn(S.board, 8, t.shape, r, c, 1); const sc = (res.rows.length + res.cols.length) * 20 + res.b.filter(v => !v).length - Math.random() * 2; if (!bm || sc > bm.sc) bm = { ti, r, c, sc }; } });
      if (!bm) return setTimeout(think, 300 / speed);
      // simulate the drag visually: pick, move a few frames, drop
      drag = { i: bm.ti, id: -1, lift: 0 }; V.dragStart(bm.ti); A.pick();
      const p = V.cellPos(bm.r, bm.c); const sh = S.tray[bm.ti].shape; const tgt = V.toScreen(p.x + (sh.wd - 1) / 2, p.y - (sh.h - 1) / 2, 0.28);
      const from = V.toScreen(V.TRAY_X[bm.ti], V.TRAY_Y, 0.3); let k = 0;
      const mv = () => { k += 0.2; const x = from.x + (tgt.x - from.x) * Math.min(1, k), y = from.y + (tgt.y - from.y) * Math.min(1, k); onDragMove(x, y); if (k < 1) setTimeout(mv, 30 / speed); else { drag.cell = { r: bm.r, c: bm.c }; drag.ok = true; onDrop(); setTimeout(think, 380 / speed); } };
      mv();
    };
    setTimeout(think, 800);
  }
})();
