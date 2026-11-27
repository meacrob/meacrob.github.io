/* Jelly Jars 2.0 - app shell: screens, game sessions (Classic / Journey / Daily), input, rewards, tutorial, perf overlay.
   Rules: JJLogic. Levels: JJLevels. Progression + save: JJMeta. 3D: JJView. Sound: JJAudio. */
(function () {
  'use strict';
  const L = JJLogic, LV = JJLevels, M = JJMeta, V = JJView, A = JJAudio, B = window.JJBot;
  const $ = id => document.getElementById(id), Q = new URLSearchParams(location.search);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  let save = M.load();
  const events = []; // analytics buffer (Firebase in the app build)
  function track(name, p) { events.push([Date.now(), name, p || {}]); if (events.length > 300) events.shift(); if (Q.get('debug') === '1') console.log('[track]', name, JSON.stringify(p || {})); }
  let saveTimer = 0; function persist(now) { clearTimeout(saveTimer); if (now) M.save(save); else saveTimer = setTimeout(() => M.save(save), 250); }

  // ---------- icons ----------
  const STAR = (on, id) => `<svg viewBox="0 0 24 24" ${id ? `id="${id}"` : ''}><path fill="${on ? '#ffc21f' : '#eadde4'}" stroke="${on ? '#e89b00' : '#d8c6d0'}" stroke-width="1.6" stroke-linejoin="round" d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>`;
  const BEAN = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="8" ry="6.5" fill="#ff7aa8" stroke="#e83d72" stroke-width="1.5"/><ellipse cx="9" cy="10.5" rx="2.6" ry="1.4" fill="#fff" opacity=".8"/></svg>';
  function jarSVG(j) { return `<svg class="jarIco" viewBox="0 0 64 64"><rect x="15" y="8" width="34" height="9" rx="4" fill="${j.lid}"/><rect x="13" y="15" width="38" height="4" rx="2" fill="${j.lid}" opacity=".85"/><path d="M14 20h36v30a8 8 0 01-8 8H22a8 8 0 01-8-8z" fill="${j.glass}" stroke="#fff" stroke-width="2"/><path d="M16 32h32v18a6 6 0 01-6 6H22a6 6 0 01-6-6z" fill="${j.jelly}"/><rect x="18" y="23" width="4" height="26" rx="2" fill="#fff" opacity=".7"/><rect x="24" y="36" width="16" height="10" rx="4" fill="#fffaf2"/><circle cx="29" cy="40.5" r="1.4" fill="#4a2343"/><circle cx="35" cy="40.5" r="1.4" fill="#4a2343"/></svg>`; }
  const GOAL_ICON = {
    lines: '<svg viewBox="0 0 32 32"><rect x="3" y="8" width="26" height="6" rx="3" fill="#ff5f8f"/><rect x="3" y="18" width="26" height="6" rx="3" fill="#4fa3ff"/></svg>',
    score: '<svg viewBox="0 0 32 32"><path d="M9 5h14v5a7 7 0 01-14 0z" fill="#ffc21f"/><path d="M9 7H4a5 5 0 005 6M23 7h5a5 5 0 01-5 6" stroke="#ffc21f" stroke-width="2.5" fill="none"/><rect x="13" y="18" width="6" height="5" fill="#e89b00"/><rect x="9" y="23" width="14" height="5" rx="2" fill="#ffc21f"/></svg>',
    stars: '<svg viewBox="0 0 24 24"><path fill="#ffc21f" stroke="#e89b00" stroke-width="1.6" d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>',
    combo: '<svg viewBox="0 0 32 32"><path d="M16 3c2 6 9 8 9 16a9 9 0 01-18 0c0-4 2-6 4-8 0 3 1 5 3 5-1-5 0-9 2-13z" fill="#ff8a3d"/><path d="M16 15c1 3 5 4 5 8a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-5 1-7z" fill="#ffd34d"/></svg>',
    jam: '<svg viewBox="0 0 32 32"><path d="M5 12c0-5 22-5 22 0v4c0 2-2 2-2 5s-3 3-3 0-2-3-2 0-4 3-4 0-3-3-3 0-3 2-3-1-3-3-3-6z" fill="#c7266a"/><ellipse cx="11" cy="11" rx="3" ry="1.5" fill="#fff" opacity=".6"/></svg>',
    crates: '<svg viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="6" fill="#e6b47a"/><path d="M8 8l16 16M24 8L8 24" stroke="#b98450" stroke-width="3"/><rect x="4" y="4" width="24" height="24" rx="6" fill="none" stroke="#b98450" stroke-width="2.5"/></svg>',
    jar: null
  };
  const goalIcon = t => t === 'jar' ? jarSVG(curJar()) : GOAL_ICON[t];
  function goalText(t, n, short) {
    const N = Math.round(n);
    if (short) return { lines: 'Lines', score: 'Points', stars: 'Stars', jar: 'Jelly', combo: 'Combo', jam: 'Jam', crates: 'Crates' }[t];
    return { lines: `Clear ${N} lines`, score: `Score ${fmt(N)} points`, stars: `Collect ${N} star jellies`, jar: n > 9 ? 'Fill the jar twice' : 'Fill the jar', combo: `Reach a x${N} combo`, jam: `Wipe up all ${N} jam spots`, crates: `Break all ${N} crates` }[t];
  }
  const curJar = () => M.JARS.find(j => j.id === save.jar) || M.JARS[0];

  // ---------- character portraits rendered once from the real 3D shader ----------
  const portraits = [];
  function makePortraits() {
    const T = THREE, g = V.jelly.mesh.geometry.clone();
    const col = new T.InstancedBufferAttribute(new Float32Array(3), 3), an = new T.InstancedBufferAttribute(new Float32Array(4), 4);
    g.setAttribute('aColor', col); g.setAttribute('aAnim', an);
    const mesh = new T.InstancedMesh(g, V.jellyMat, 1), m4 = new T.Matrix4().makeRotationX(-0.35); mesh.setMatrixAt(0, m4);
    const sc = new T.Scene(); sc.add(mesh); const cam = new T.PerspectiveCamera(30, 1, 0.1, 10); cam.position.set(0, 0, 2.6); cam.lookAt(0, 0, 0);
    const S = 160, rt = new T.WebGLRenderTarget(S, S), px = new Uint8Array(S * S * 4), cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d');
    const t0 = V.jellyMat.uniforms.uTime.value; V.jellyMat.uniforms.uTime.value = 1.3; V.jellyMat.uniforms.uBreath.value = 0;
    for (let f = 1; f <= 7; f++) {
      const c = V.colors[f]; col.setXYZ(0, c.r, c.g, c.b); an.setXYZW(0, 0, 0, 0, f); col.needsUpdate = an.needsUpdate = true;
      V.renderer.setRenderTarget(rt); V.renderer.setClearColor(0, 0); V.renderer.clear(); V.renderer.render(sc, cam); V.renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
      const img = cx.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4, o = ((S - 1 - y) * S + x) * 4; for (let k = 0; k < 3; k++) img.data[o + k] = 255 * Math.pow(px[i + k] / 255, 1 / 2.2); img.data[o + 3] = px[i + 3]; }
      cx.putImageData(img, 0, 0); portraits[f] = cv.toDataURL();
    }
    V.renderer.setRenderTarget(null); V.jellyMat.uniforms.uTime.value = t0; rt.dispose(); g.dispose();
  }

  // ---------- world backdrop ----------
  function setWorld(wi) {
    const w = LV.WORLDS[wi] || LV.WORLDS[0], r = document.documentElement.style;
    r.setProperty('--sky1', w.sky[0]); r.setProperty('--sky2', w.sky[1]); r.setProperty('--accent', w.accent); r.setProperty('--h1', w.hill[0]); r.setProperty('--h2', w.hill[1]); r.setProperty('--h3', w.hill[2]);
    const deco = { grove: (x, y) => `<g transform="translate(${x},${y})"><path d="M0 0c-7 0-9 9-4 15 2 3 6 3 8 0 5-6 3-15-4-15z" fill="#ff5f8f"/><path d="M-4 -1l4 3 4-3-4-2z" fill="#4fbf5a"/><circle cx="-2" cy="6" r=".8" fill="#ffe08a"/><circle cx="2" cy="9" r=".8" fill="#ffe08a"/></g>`,
      bay: (x, y) => `<g transform="translate(${x},${y})"><path d="M0 -14v14M0 -14l10 12H0" stroke="#fff" stroke-width="1.5" fill="#fff"/><path d="M-10 0h22l-4 5h-14z" fill="#ff8a6b"/></g>`,
      isle: (x, y) => `<g transform="translate(${x},${y})"><path d="M0 0q2-12 0-24" stroke="#b07a4a" stroke-width="3" fill="none"/><path d="M0 -24q-10-4-16 2M0 -24q10-4 16 2M0 -24q-4-9-12-9M0 -24q4-9 12-9" stroke="#3fbf6a" stroke-width="4" fill="none" stroke-linecap="round"/></g>` }[w.id];
    $('hills').innerHTML = `<path d="M0 120 Q60 70 130 105 T260 95 T400 110 V300 H0z" fill="${w.hill[0]}"/>${deco(70, 96)}${deco(300, 92)}<path d="M0 175 Q80 135 170 168 T330 160 T400 170 V300 H0z" fill="${w.hill[1]}"/>${deco(200, 160)}<path d="M0 235 Q100 205 210 230 T400 225 V300 H0z" fill="${w.hill[2]}"/>`;
    const tint = { grove: { frame: '#ff8fb5', tray: '#fff3f7', slot: '#f8dbe7' }, bay: { frame: '#7cbcff', tray: '#f2f8ff', slot: '#dbe9fb' }, isle: { frame: '#ffb547', tray: '#fffaee', slot: '#f8e9c9' } }[w.id];
    V.setWorld(tint); document.querySelector('meta[name=theme-color]').content = w.sky[0];
  }

  // ---------- screens ----------
  let screen = '';
  function show(name) {
    for (const s of ['home', 'journey', 'collection', 'awards', 'hud']) $(s).classList.toggle('on', s === name);
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
    const was = screen; screen = name;
    if (name !== 'hud') { coach(''); hand(null); drag = null; aiming = false; }
    if (was === 'hud' && name !== 'hud') V.clearAll();
    const inGame = name === 'hud';
    V.showBoard(inGame); V.jar.group.visible = inGame || name === 'home';
    if (name === 'home') { placeJar(true); V.showMascot(LV.WORLDS[worldOfNext()].hero, 1.5); refreshHome(); A.Music.play('menu'); }
    else { V.hideMascot(); placeJar(false); }
    if (!inGame && name !== 'home') A.Music.play('menu');
    if (name === 'journey') buildMap(); if (name === 'collection') buildCollection(); if (name === 'awards') buildAwards();
    if (was && was !== name) A.whoosh && A.whoosh();
    $('c').style.visibility = (inGame || name === 'home') ? 'visible' : 'hidden';
    V.dirty = true;
  }
  function placeJar(home) { const J = V.jar; if (home) { J.base.set(2.7, 5.3, 0.6); J.group.scale.setScalar(0.85); V.setJar(0, false); } else { J.base.copy(V.JAR_POS); J.group.scale.setScalar(1); } J.group.position.copy(J.base); J.group.rotation.z = 0; }
  const worldOfNext = () => M.nextLevel(save, LV.LEVELS).world;
  function refreshHome() {
    const next = M.nextLevel(save, LV.LEVELS), allDone = Object.keys(save.stars).length >= LV.LEVELS.length;
    setWorld(next.world);
    $('hWorld').textContent = LV.WORLDS[next.world].name;
    const rl = save.run && save.run.mode === 'level' ? LV.LEVELS[save.run.level - 1] : null;
    $('hPlay').firstChild.textContent = rl ? 'Continue' : allDone ? 'Replay Journey' : 'Level ' + next.id; $('hPlaySub').textContent = rl ? 'Level ' + rl.id + ' in progress' : goalText(next.type, next.n);
    $('hStars').textContent = M.starCount(save); $('hBeans').textContent = fmt(save.beans);
    const pl = M.playerLevel(save); $('plv').textContent = 'Lv ' + pl.lv; $('avatarImg').src = portraits[LV.WORLDS[next.world].hero] || '';
    const nj = M.nextJarHint(save); $('hNext').innerHTML = nj ? `${jarSVG(nj)}<span>Next: <b>${nj.name}</b> · ${nj.how}</span>` : '<span>All jars collected!</span>';
    $('cClassicSub').textContent = save.run && save.run.mode === 'classic' ? 'Continue run' : 'Best ' + fmt(save.best);
    const d = M.daily(save); $('dIco').textContent = new Date().getDate();
    $('cDailySub').textContent = save.run && save.run.mode === 'daily' ? 'Continue' : d.played ? `Best ${fmt(d.best)} · ${hoursLeft()}` : 'New puzzle!';
    const ms = M.missions(save), dn = ms.list.filter(m => m.prog >= m.n).length, unclaimed = ms.list.some(m => m.prog >= m.n && !m.claimed);
    $('cMissionsSub').textContent = unclaimed ? 'Reward ready!' : `${dn}/3 done`;
    $('colBadge').style.display = Object.keys(save.jars).some(k => !save.seenJars[k]) ? 'grid' : 'none';
  }
  const hoursLeft = () => { const ms = M.msToMidnight(), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60; return h ? `${h}h ${m}m left` : `${m}m left`; };

  // ---------- Journey map ----------
  function buildMap() {
    $('jStars').textContent = M.starCount(save);
    const map = $('map'); let html = '';
    const next = M.nextLevel(save, LV.LEVELS);
    LV.WORLDS.forEach((w, wi) => {
      const lv = LV.LEVELS.filter(l => l.world === wi), unlocked = M.unlocked(save, lv[0].id);
      const stars = lv.reduce((a, l) => a + (save.stars[l.id] || 0), 0);
      let pts = '', nodes = '';
      lv.forEach((l, i) => {
        const y = 600 - i * 60, x = 50 + Math.sin(i * 1.1) * 30; pts += `${i ? 'L' : 'M'}${x * 4} ${y}`;
        const st = save.stars[l.id] || 0, open = M.unlocked(save, l.id), cur = l.id === next.id && !st;
        nodes += `<button class="node ${open ? '' : 'lock'} ${cur ? 'cur' : ''} ${l.boss ? 'boss' : ''}" style="left:${x}%;top:${y}px" data-lv="${l.id}">${open ? l.id : '<svg viewBox="0 0 24 24" width="22"><rect x="6" y="10" width="12" height="10" rx="3" fill="#fff"/><path d="M8.5 10V8a3.5 3.5 0 017 0v2" stroke="#fff" stroke-width="2.5" fill="none"/></svg>'}${st ? `<span class="st">${[0, 1, 2].map(k => `<i>${STAR(k < st)}</i>`).join('')}</span>` : ''}</button>`;
      });
      html = `<div class="worldBlock" style="background:linear-gradient(180deg,${w.hill[2]},${w.hill[0]} 60%,${w.sky[0]})"><h3>${w.name}</h3><div class="wsub">${unlocked ? `${stars}/30 stars` : 'Finish the previous world to unlock'}</div><div class="path"><svg viewBox="0 0 400 640" preserveAspectRatio="none"><path d="${pts}" stroke="rgba(255,255,255,.75)" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="2 22"/></svg>${nodes}</div></div>` + html;
    });
    map.innerHTML = html;
    map.querySelectorAll('.node').forEach(n => n.onclick = () => { A.click(); const l = LV.LEVELS[+n.dataset.lv - 1]; if (!M.unlocked(save, l.id)) { toast('Finish level ' + (l.id - 1) + ' first'); return; } levelIntro(l); });
    requestAnimationFrame(() => { const cur = map.querySelector('.node.cur') || map.querySelector('.node:not(.lock)'); if (cur) cur.scrollIntoView({ block: 'center' }); });
  }
  function levelIntro(l) {
    const st = save.stars[l.id] || 0;
    $('levelBody').innerHTML = `<div class="ribbon">Level ${l.id}</div><div class="sub">${LV.WORLDS[l.world].name}${l.boss ? ' · Boss level' : ''}</div>
      <div class="bigstars" style="height:50px">${[0, 1, 2].map(k => STAR(k < st)).join('')}</div>
      <div class="goal panel" style="justify-content:center"><div class="gi">${goalIcon(l.type)}</div><div style="text-align:left"><b style="font-size:19px">${goalText(l.type, l.n)}</b><span>in ${l.moves} moves</span></div></div>
      ${l.tip ? `<div class="sub">${l.tip}</div>` : ''}
      <button class="btn green" id="lvGo" style="width:100%">Play</button><button class="btn small ghost" data-close>Not now</button>`;
    $('levelBody').querySelectorAll('.bigstars svg').forEach(s => s.classList.add('on'));
    openModal('mLevel'); $('lvGo').onclick = () => { closeModal('mLevel'); A.click(); startLevel(l.id); };
  }

  // ---------- Collection ----------
  let colTab = 'friends';
  function buildCollection() {
    const g = $('colGrid'); const owned = save.chars.filter(Boolean).length + Object.keys(save.jars).length;
    $('colCount').textContent = `${owned}/${6 + M.JARS.length}`;
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === colTab));
    if (colTab === 'friends') {
      g.className = 'grid';
      g.innerHTML = M.CHARS.slice(1).map((c, i) => { const f = i + 1, has = save.chars[f]; return `<div class="item panel ${has ? '' : 'locked'}"><img src="${portraits[f]}" alt=""><b>${has ? c.name : '???'}</b><span>${has ? c.flav + ' · ' + c.bio : 'Clear a line with ' + (/^[AEIOU]/.test(c.flav) ? 'an ' : 'a ') + c.flav.toLowerCase() + ' jelly to meet them'}</span></div>`; }).join('');
    } else {
      g.className = 'grid three';
      g.innerHTML = M.JARS.map(j => { const has = save.jars[j.id], isNew = has && !save.seenJars[j.id]; return `<button class="item panel ${has ? '' : 'locked'} ${isNew ? 'new' : ''}" data-jar="${j.id}">${jarSVG(j)}<b style="font-size:15px">${j.name}</b><span>${has ? (save.jar === j.id ? 'In use' : 'Tap to use') : j.how}</span>${save.jar === j.id ? '<i class="eq">ON</i>' : ''}</button>`; }).join('');
      g.querySelectorAll('[data-jar]').forEach(b => b.onclick = () => { const id = b.dataset.jar; if (!save.jars[id]) { A.bad(); return; } save.jar = id; applyJar(); A.click(); persist(); track('jar_equipped', { id }); buildCollection(); });
      for (const k in save.jars) save.seenJars[k] = true; persist();
    }
  }
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { colTab = b.dataset.tab; A.click(); buildCollection(); });
  function applyJar() { const j = curJar(); V.setJarStyle({ lid: j.lid, jelly: j.jelly, glass: j.glass, accent: j.lid }); }

  function buildAwards() {
    const s = save.stats, pl = M.playerLevel(save);
    $('stats').innerHTML = [['Player level', pl.lv], ['Classic best', fmt(save.best)], ['Best combo', 'x' + save.bestCombo], ['Lines cleared', fmt(s.lines)], ['Jelly pours', fmt(s.pours)], ['Levels won', Object.keys(save.stars).length + '/30'], ['Stars', M.starCount(save) + '/90'], ['Games played', fmt(s.games)]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    $('achList').innerHTML = M.ACH.map(a => `<div class="achRow panel ${save.ach[a.id] ? '' : 'locked'}"><div class="ai">${STAR(!!save.ach[a.id])}</div><div><b>${a.name}</b><span class="sub">${a.how}</span></div><span class="pill">${BEAN}${a.beans}</span></div>`).join('');
  }

  // ---------- modals and toasts ----------
  function openModal(id) { $(id).classList.add('on'); }
  function closeModal(id) { $(id).classList.remove('on'); }
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target.matches('[data-close]')) { A.click(); m.classList.remove('on'); if (m.id === 'mMissions' || m.id === 'mSettings') refreshHome(); } }));
  function toast(txt, img) { const el = document.createElement('div'); el.className = 'pop info'; el.innerHTML = (img ? `<img src="${img}" style="width:34px;height:34px;vertical-align:middle;margin-right:6px">` : '') + txt; $('fx').appendChild(el); setTimeout(() => el.remove(), 1600); }
  function popText(txt, cls) { const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = txt; $('fx').appendChild(el); setTimeout(() => el.remove(), 1250); }
  function floatScore(txt, at) { const p = V.cellPos(at.r - 0.5, at.c - 0.5), s = V.toScreen(p.x, p.y, 1), el = document.createElement('div'); el.className = 'pts'; el.textContent = txt; el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; $('fx').appendChild(el); setTimeout(() => el.remove(), 1000); }

  // ---------- settings ----------
  function syncSettings() { A.set(save.settings); document.querySelectorAll('[data-set]').forEach(b => b.classList.toggle('on', !!save.settings[b.dataset.set])); $('pMusic').textContent = 'Music ' + (save.settings.music ? 'on' : 'off'); $('pSfx').textContent = 'Sound ' + (save.settings.sfx ? 'on' : 'off'); }
  document.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { const k = b.dataset.set; save.settings[k] = !save.settings[k]; syncSettings(); A.click(); persist(); });
  $('pMusic').onclick = () => { save.settings.music = !save.settings.music; syncSettings(); persist(); };
  $('pSfx').onclick = () => { save.settings.sfx = !save.settings.sfx; syncSettings(); A.click(); persist(); };
  $('gear').onclick = () => { A.click(); syncSettings(); openModal('mSettings'); };
  $('resetBtn').onclick = () => { if (confirm('Reset ALL progress? This cannot be undone.')) { save = M.reset(); persist(true); location.reload(); } };
  $('perfBtn').onclick = () => { togglePerf(); closeModal('mSettings'); };
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { A.click(); show(b.dataset.go); });
  document.querySelectorAll('.back').forEach(b => b.onclick = () => { A.click(); show('home'); });
  $('avatar').onclick = () => { A.click(); show('awards'); };
  $('hPlay').onclick = () => { A.click(); if (save.run && save.run.mode === 'level') { startLevel(save.run.level, true); return; } const n = M.nextLevel(save, LV.LEVELS); if (n.id === 1 && !save.stars[1]) startLevel(1); else levelIntro(n); };
  $('cClassic').onclick = () => { A.click(); startClassic(); };
  $('cDaily').onclick = () => { A.click(); dailyIntro(); };
  $('cMissions').onclick = () => { A.click(); missionsModal(); };

  function missionsModal() {
    const ms = M.missions(save);
    $('missionsBody').innerHTML = `<h2>Daily Missions</h2><div class="sub">New missions in ${hoursLeft().replace(' left', '')}</div>` + ms.list.map((m, i) => {
      const d = m.prog >= m.n; return `<div class="mission"><div><b>${M.missionText(m)}</b><div class="bar"><i style="width:${Math.round(m.prog / m.n * 100)}%"></i></div></div>${m.claimed ? '<span class="sub">Done</span>' : d ? `<button class="btn small green" data-claim="${i}">${BEAN}${M.missionBeans(m)}</button>` : `<span class="pill">${BEAN}${M.missionBeans(m)}</span>`}</div>`;
    }).join('') + `<div class="sub">Finish all 3 for a bonus ${BEAN.replace('<svg', '<svg width="16" height="16"')} 50</div><button class="btn" data-close style="width:100%">Close</button>`;
    $('missionsBody').querySelectorAll('[data-claim]').forEach(b => b.onclick = () => {
      const m = ms.list[+b.dataset.claim]; if (m.claimed) return; m.claimed = true; save.beans += M.missionBeans(m); save.stats.missions++; A.coin(); track('mission_claimed', { id: m.id });
      if (!ms.bonus && ms.list.every(x => x.claimed)) { ms.bonus = true; save.beans += 50; A.unlock(); toast('All missions done! +50'); }
      M.checkJars(save); M.checkAch(save); persist(); missionsModal();
    });
    openModal('mMissions');
  }
  function dailyIntro() {
    const d = M.daily(save), dc = M.dailyConfig();
    $('infoBody').innerHTML = `<div class="ribbon" style="background:linear-gradient(#ffd24d,#ff9f1c)">Daily Challenge</div><div class="sub">Everyone gets the same pieces today</div>
      <div class="goal panel"><div class="gi">${GOAL_ICON.score}</div><div style="text-align:left"><b style="font-size:19px">Score as much as you can</b><span>40 moves · target ${fmt(dc.target)}</span></div></div>
      <div class="statgrid"><div><b>${fmt(d.best)}</b><span>Your best today</span></div><div><b>${hoursLeft()}</b><span>Until the next puzzle</span></div></div>
      <div class="sub">Rewards: ${BEAN.replace('<svg', '<svg width="14" height="14"')} 40 for finishing, +30 for reaching the target (once a day)</div>
      <button class="btn green" id="dGo" style="width:100%">${d.played ? 'Play again' : 'Play'}</button><button class="btn small ghost" data-close>Not now</button>`;
    openModal('mInfo'); $('dGo').onclick = () => { closeModal('mInfo'); startDaily(); };
  }

  // ======================================================================
  // ---------- game session ----------
  // ======================================================================
  let S = null, G = null; // G = { mode, level, startT, ... }
  let drag = null, aiming = false, aimCell = null, busyUntil = 0;
  const classicCfg = () => Object.assign({ jarCap: 8, capGrow: 2 }, knobCfg());
  function knobCfg() { const k = save.knobs; return k ? { popMode: k.popMode, popShape: k.popShape, jarCap: k.jarCap, capGrow: k.capGrow } : {}; }

  function begin(mode, state, extra) {
    S = state; G = Object.assign({ mode, startT: performance.now(), lastPlace: 0, newFriends: [] }, extra || {});
    closeAll(); show('hud'); A.Music.play('game'); A.intensity(0);
    setWorld(mode === 'level' ? LV.LEVELS[G.level - 1].world : mode === 'daily' ? 2 : 0);
    V.loadBoard(S); setTimeout(() => V.setTray(S.tray, L), 250);
    V.setJar(S.popReady ? 1 : S.jar / S.cap, S.popReady);
    $('stuck').classList.remove('on'); $('jarTag').classList.remove('on'); aiming = false;
    hudGoal(true); setScore(S.score, true);
    $('scoreSub').textContent = mode === 'classic' ? 'Best ' + fmt(save.best) : mode === 'daily' ? 'Today ' + fmt(M.daily(save).best) : 'Score';
    if (S.popReady) showJarTag();
    saveRun();
    if (mode === 'level' && G.level === 1 && !save.tut.level1) setTimeout(tutorialStep, 900);
  }
  function startClassic() {
    if (save.run && save.run.mode === 'classic') { try { begin('classic', save.run.state); track('run_resumed', { mode: 'classic' }); return; } catch (e) {} }
    const first = !save.stats.games; begin('classic', L.create(Object.assign(classicCfg(), { friendlyStart: first })));
    track('game_start', { mode: 'classic' });
  }
  function startLevel(id, resume) {
    const lv = LV.LEVELS[id - 1];
    if (resume && save.run && save.run.mode === 'level' && save.run.level === id) { begin('level', save.run.state, { level: id }); return; }
    begin('level', L.create(Object.assign(LV.config(lv), knobCfg(), { jarCap: 8 }), 1000 + id * 7919 + (save.stats.fails % 50)), { level: id });
    track('level_start', { level: id });
  }
  function startDaily() { if (save.run && save.run.mode === 'daily' && save.run.day === M.dayKey()) { begin('daily', save.run.state, { target: M.dailyConfig().target }); return; } const dc = M.dailyConfig(); begin('daily', L.create(Object.assign({}, dc.cfg), dc.seed), { target: dc.target }); track('daily_start', { day: M.dayKey() }); }
  function saveRun() { if (!S || S.over) { if (save.run) { save.run = null; persist(); } return; } save.run = { mode: G.mode, level: G.level, day: M.dayKey(), state: S }; persist(); }

  function hudGoal(instant) {
    const g = S.cfg.goal, p = L.progress(S);
    if (G.mode === 'classic') { $('goalIco').innerHTML = GOAL_ICON.lines; $('goalVal').textContent = fmt(S.lines); $('goalTxt').textContent = 'Lines'; $('movesBox').style.display = 'none'; return; }
    $('movesBox').style.display = '';
    if (G.mode === 'daily') { $('goalIco').innerHTML = GOAL_ICON.score; $('goalVal').textContent = fmt(G.target); $('goalTxt').textContent = S.score >= G.target ? 'Target reached!' : 'Daily target'; }
    else { $('goalIco').innerHTML = goalIcon(g.type); $('goalVal').textContent = g.type === 'score' ? `${fmt(p.v)}/${fmt(g.n)}` : g.type === 'jar' ? Math.floor(p.v / g.n * 100) + '%' : `${Math.round(p.v)}/${Math.round(g.n)}`; $('goalTxt').textContent = goalText(g.type, g.n, true); }
    $('moves').textContent = p.movesLeft; $('movesBox').classList.toggle('low', p.movesLeft <= 5);
    if (!instant) { $('goal').classList.remove('bumpG'); void $('goal').offsetWidth; }
  }
  let shownScore = 0, scoreRaf = 0;
  function setScore(v, instant) {
    if (instant) { shownScore = v; $('score').textContent = fmt(v); return; }
    const from = shownScore, t0 = performance.now(); cancelAnimationFrame(scoreRaf);
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 400); shownScore = Math.round(from + (v - from) * (1 - Math.pow(1 - k, 3))); $('score').textContent = fmt(shownScore); if (k < 1) scoreRaf = requestAnimationFrame(step); };
    step(); $('score').classList.remove('bump'); void $('score').offsetWidth; $('score').classList.add('bump');
    if (G.mode === 'classic' && v > save.best && save.best > 0 && !G.newBest) { G.newBest = true; popText('New best!', 'best'); A.best(); }
  }
  const goalPt = () => { const r = $('goalIco').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  // ---------- input ----------
  const cv = $('c');
  document.addEventListener('pointerdown', () => A.init(), { capture: true, passive: true });
  cv.addEventListener('pointerdown', e => {
    if (screen === 'home') { if (V.mascot) { const p = V.toScreen(V.mascot.x, V.mascot.y, 1); if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < V.h * 0.12) { V.pokeMascot(); A.jelly(); } } return; }
    if (screen !== 'hud' || !S || S.over || performance.now() < busyUntil) return;
    if (S.popReady && V.jarHit(e.clientX, e.clientY)) { aiming = !aiming; aimCell = null; V.ghostHide(); A.click(); coach(aiming ? 'Now tap the board where the jelly should go' : ''); if (aiming) { hand(null); } return; }
    if (aiming) { aimAt(e.clientX, e.clientY); return; }
    const i = V.trayHit(e.clientX, e.clientY); if (i < 0 || S.tray[i].used) return;
    drag = { i, id: e.pointerId, lift: Math.min(150, V.h * 0.14) }; try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    V.dragStart(i); A.pick(); onDragMove(e.clientX, e.clientY);
  });
  cv.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) onDragMove(e.clientX, e.clientY); else if (aiming && e.buttons) aimAt(e.clientX, e.clientY); });
  cv.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) onDrop(); else if (aiming && aimCell) doPour(); });
  cv.addEventListener('pointercancel', () => { if (drag) { V.dragBack(); drag = null; } });
  function onDragMove(x, y) {
    if (!drag) return;
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
  function aimAt(x, y) {
    const w = V.toWorld(x, y, V.BZ), c = Math.round(w.x + 3.5), r = Math.round(3.5 - w.y);
    if (r < 0 || r > 7 || c < 0 || c > 7) { aimCell = null; V.ghostHide(); return; }
    aimCell = { r, c }; const cells = L.popCells(S, r, c), show = S.cfg.popMode === 'pour' ? cells.filter(([rr, cc]) => !S.board[rr * 8 + cc]) : cells;
    V.ghostShow({ cells: show, rows: [], cols: [] }, 7, true);
  }
  function doPour() {
    const { r, c } = aimCell; aiming = false; aimCell = null; coach(''); $('stuck').classList.remove('on'); V.ghostHide(); $('jarTag').classList.remove('on');
    const ev = L.pop(S, r, c); if (!ev) return;
    busyUntil = performance.now() + 1500; save.stats.pours++; done(M.progress(save, 'pours', 1)); track('pour', { mode: G.mode, lines: ev[0].lines || 0 });
    if (!save.tut.pour) { save.tut.pour = true; persist(); }
    if (ev[0].type === 'pour') {
      A.pour();
      V.pourAnim(ev[0], () => {
        A.splash(); V.setJar(0, false);
        const pe = ev[0];
        if (pe.lines) { V.clearLines({ cleared: pe.cleared, lines: pe.lines, gains: pe.gains, combo: 1 }, { r, c }, null); A.clear(pe.lines, 1); popText(pe.lines >= 2 ? `Jelly Pour x${pe.lines}!` : 'Jelly Pour!', 'big'); floatScore('+' + ev[1].add, { r: r + 1, c: c + 1 }); gainsFx(pe.gains); countFlavours(pe.cleared); save.stats.lines += pe.lines; done(M.progress(save, 'lines', pe.lines)); }
        setScore(S.score); hudGoal(); after(ev); busyUntil = 0;
      });
    } else { A.pop(); V.popAnim(ev[0]); popText('Jelly Pop!', 'big'); V.setJar(0, false); setTimeout(() => { after(ev); busyUntil = 0; }, 300); }
  }
  $('giveUp').onclick = () => { A.click(); $('stuck').classList.remove('on'); after(L.giveUp(S)); };
  function showJarTag() { const p = V.jarScreen(); $('jarTag').style.left = p.x + 'px'; $('jarTag').style.top = (p.y + V.h * 0.085) + 'px'; $('jarTag').classList.add('on'); }

  // ---------- logic events -> view / sound / rewards ----------
  function handle(ev, origin) {
    let trayDelay = 0;
    for (const e of ev) {
      if (e.type === 'place') { V.placePiece(e); A.place(e.cells.length); save.stats.placed++; done(M.progress(save, 'place', 1)); if (G.tutStep) tutorialAfterPlace(); }
      else if (e.type === 'clear') {
        trayDelay = 0.4;
        setTimeout(() => A.clear(e.lines, e.combo), 50);
        V.clearLines(e, origin, () => { V.setJar(S.popReady ? 1 : S.jar / S.cap, S.popReady); A.jelly(); if (e.charged) { A.ready(); showJarTag(); popText('Jar full!', 'combo'); track('jar_charged', { mode: G.mode }); if (!save.tut.pour) { coach('Your jar is full! Tap it, then tap the board to pour'); handAt(V.jarScreen()); } } else if (S.jar / S.cap > 0.72 && !S.popReady) A.almost(); });
        const words = e.boardClear ? 'Board clear!' : e.lines >= 4 ? 'Jelly-licious!' : e.lines === 3 ? 'Sweet!' : e.lines === 2 ? 'Double!' : '';
        if (words) popText(words, 'big');
        if (e.combo >= 2) setTimeout(() => { popText('Combo x' + e.combo, 'combo'); A.combo(e.combo); }, words ? 280 : 0);
        A.intensity(e.combo >= 4 ? 2 : e.combo >= 2 ? 1 : 0);
        floatScore('+' + e.points, origin); gainsFx(e.gains); countFlavours(e.cleared);
        save.stats.lines += e.lines; save.bestCombo = Math.max(save.bestCombo, e.combo); save.xp += e.lines;
        done(M.progress(save, 'lines', e.lines)); done(M.progress(save, 'combo', e.combo, 'max'));
        track('lines_cleared', { n: e.lines, combo: e.combo, mode: G.mode });
      }
      else if (e.type === 'comboLost') A.intensity(0);
      else if (e.type === 'score') setScore(e.score);
      else if (e.type === 'tray') setTimeout(() => V.setTray(S.tray, L), trayDelay * 1000 + 120);
      else if (e.type === 'stuck') setTimeout(() => { $('stuckTxt').textContent = e.reason === 'moves' ? 'Out of moves! One last pour?' : 'No room! Pour your jar.'; $('stuck').classList.add('on'); V.setMood(1); showJarTag(); }, 500);
      else if (e.type === 'win') setTimeout(levelWin, 900);
      else if (e.type === 'over') setTimeout(gameOver, 700);
    }
    hudGoal();
    const fill = S.board.filter(Boolean).length / 64; if (!S.over) V.setMood(fill > 0.72 ? 1 : 0);
    saveRun();
  }
  function after(ev) { for (const e of ev) { if (e.type === 'over') setTimeout(gameOver, 500); if (e.type === 'win') setTimeout(levelWin, 700); if (e.type === 'stuck') $('stuck').classList.add('on'); } hudGoal(); saveRun(); }
  function gainsFx(g) { if (!g) return; if (g.stars.length) { V.flyTo(g.stars, goalPt(), '#ffcc33', 1); setTimeout(() => A.star(0), 600); } if (g.jam.length && S.cfg.goal && S.cfg.goal.type === 'jam') V.flyTo(g.jam, goalPt(), '#c7266a', 0); }
  function countFlavours(cleared) {
    for (const [, , f] of cleared) if (f >= 1 && f <= 6 && !save.chars[f]) { save.chars[f] = true; G.newFriends.push(f); const c = M.CHARS[f]; setTimeout(() => { toast(`New friend: ${c.name}!`, portraits[f]); A.unlock(); }, 700); track('character_unlocked', { id: f }); }
  }
  function done(list) { for (const m of list || []) { setTimeout(() => toast('Mission done: ' + M.missionText(m)), 900); track('mission_completed', { id: m.id }); } }

  // ---------- end of game ----------
  function closeAll() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('on')); coach(''); hand(null); }
  function finishCommon() {
    save.stats.games++; save.stats.seconds += Math.round((performance.now() - G.startT) / 1000);
    done(M.progress(save, 'score', S.score, 'max'));
    perf.runs.push({ mode: G.mode, score: S.score, placements: S.placements, pours: S.pops, secs: Math.round((performance.now() - G.startT) / 1000) });
    save.run = null; A.intensity(0);
  }
  function unlockCards(extra) {
    const jars = M.checkJars(save), ach = M.checkAch(save);
    jars.forEach(j => track('jar_unlocked', { id: j.id }));
    return (extra || '') + jars.map(j => `<div class="unlockCard">${jarSVG(j)}<b>New jar: ${j.name}</b><span class="sub">Equip it in Collection</span></div>`).join('') + ach.map(a => `<div class="unlockCard"><div style="width:48px;height:48px">${STAR(true)}</div><b>${a.name}</b><span class="sub">${a.how} · +${a.beans}</span></div>`).join('');
  }
  function levelWin() {
    if (G.ended) return; G.ended = true;
    const lv = LV.LEVELS[G.level - 1], p = L.progress(S), stars = LV.starsFor(lv, p.movesLeft), prev = save.stars[lv.id] || 0;
    const rw = M.levelReward(lv, stars, prev); save.stars[lv.id] = Math.max(prev, stars); save.beans += rw.beans; save.xp += rw.xp; save.stats.wins++;
    finishCommon(); if (stars > prev) done(M.progress(save, 'stars', stars - prev)); done(M.progress(save, 'levels', 1));
    if (lv.id === 1) save.tut.level1 = true;
    const newWorld = lv.id % 10 === 0 && !prev && lv.id < 30;
    track('level_complete', { level: lv.id, stars, moves_left: p.movesLeft });
    A.win(); V.celebrate(50); V.setMood(3);
    const cards = unlockCards(newWorld ? `<div class="unlockCard"><b>${LV.WORLDS[lv.world + 1].name} unlocked!</b><span class="sub">A new world to explore</span></div>` : '');
    persist(true);
    const hasNext = lv.id < LV.LEVELS.length;
    $('resultBody').innerHTML = `<div class="ribbon">Level ${lv.id} complete!</div><div class="bigstars">${[0, 1, 2].map(k => STAR(k < stars, 'bs' + k)).join('')}</div>
      <div class="bigScore" id="rScore">0</div><div class="rewards"><span class="pill">${BEAN}+<span id="rBeans">0</span></span><span class="pill">XP +${rw.xp}</span></div>${cards}
      <button class="btn green" id="rNext" style="width:100%">${hasNext ? 'Next level' : 'Journey complete!'}</button><div class="row"><button class="btn small ghost" id="rReplay">Replay</button><button class="btn small ghost" id="rHome">Home</button></div>`;
    setTimeout(() => openModal('mResult'), 600);
    [0, 1, 2].forEach(k => setTimeout(() => { if (k < stars) { $('bs' + k).classList.add('on'); A.star(k); } else $('bs' + k).classList.add('on'); }, 1000 + k * 380));
    countUp('rScore', S.score, 1000); countUp('rBeans', rw.beans, 1600, () => A.coin());
    $('rNext').onclick = () => { A.click(); closeModal('mResult'); V.wipeBoard(() => hasNext ? startLevel(lv.id + 1) : show('journey')); };
    $('rReplay').onclick = () => { A.click(); closeModal('mResult'); V.wipeBoard(() => startLevel(lv.id)); };
    $('rHome').onclick = () => { A.click(); closeModal('mResult'); V.wipeBoard(() => show('home')); };
  }
  function gameOver() {
    if (G.ended || !S.over) return; G.ended = true;
    V.gameOverAnim(); A.over(); finishCommon();
    if (G.mode === 'level') {
      const lv = LV.LEVELS[G.level - 1], p = L.progress(S); save.stats.fails++; track('level_failed', { level: lv.id, progress: p.v / p.n });
      persist(true);
      $('resultBody').innerHTML = `<div class="ribbon fail">${S.stuck || p.movesLeft > 0 ? 'Out of room' : 'Out of moves'}</div><div class="goal panel"><div class="gi">${goalIcon(lv.type)}</div><div style="text-align:left"><b>${lv.type === 'jar' ? Math.floor(p.v / p.n * 100) + '%' : Math.round(p.v) + ' / ' + Math.round(p.n)}</b><span>${goalText(lv.type, lv.n)}</span></div></div>
        <div class="sub">${p.v / p.n > 0.7 ? 'So close! You can do it.' : 'Try clearing lines early to keep the board open.'}</div>
        <button class="btn green" id="rRetry" style="width:100%">Try again</button><button class="btn small ghost" id="rHome">Home</button>`;
      setTimeout(() => openModal('mResult'), 900);
      $('rRetry').onclick = () => { A.click(); closeModal('mResult'); track('retry', { level: lv.id }); V.wipeBoard(() => startLevel(lv.id)); };
      $('rHome').onclick = () => { A.click(); closeModal('mResult'); V.wipeBoard(() => show('home')); };
      return;
    }
    let title = 'Out of moves', extra = '', isBest = false;
    if (G.mode === 'classic') { isBest = S.score > save.best; if (isBest) save.best = S.score; done(M.progress(save, 'classic', 1)); title = isBest && S.score > 0 ? 'New best!' : 'Game over'; track('game_over', { mode: 'classic', score: S.score, best: isBest }); }
    else { const d = M.daily(save), first = !d.played; d.played = true; isBest = S.score > d.best; d.best = Math.max(d.best, S.score); let beans = 0; if (first) { beans += 40; d.total++; } if (S.score >= G.target && !d.claimed) { d.claimed = true; beans += 30; } save.beans += beans; title = 'Daily done!'; extra = beans ? `<div class="rewards"><span class="pill">${BEAN}+${beans}</span></div>` : ''; track('daily_complete', { score: S.score }); }
    save.xp += Math.round(S.score / 200);
    const cards = unlockCards(); persist(true);
    $('resultBody').innerHTML = `<div class="ribbon">${title}</div><div class="bigScore" id="rScore">0</div><div class="sub">${G.mode === 'classic' ? 'Best ' + fmt(save.best) : 'Best today ' + fmt(M.daily(save).best) + ' · target ' + fmt(G.target)}</div>
      <div class="statgrid"><div><b>${S.lines}</b><span>Lines</span></div><div><b>x${S.bestCombo}</b><span>Best combo</span></div><div><b>${S.pops}</b><span>Jelly pours</span></div><div><b>${S.placements}</b><span>Pieces placed</span></div></div>${extra}${cards}
      <button class="btn green" id="rAgain" style="width:100%">Play again</button><button class="btn small ghost" id="rHome">Home</button>`;
    setTimeout(() => { openModal('mResult'); if (isBest && S.score > 0) { A.best(); V.celebrate(40); } }, 900);
    countUp('rScore', S.score, 900);
    $('rAgain').onclick = () => { A.click(); closeModal('mResult'); track('retry', { mode: G.mode }); V.wipeBoard(() => G.mode === 'classic' ? startClassic() : startDaily()); };
    $('rHome').onclick = () => { A.click(); closeModal('mResult'); V.wipeBoard(() => show('home')); };
  }
  function countUp(id, to, ms, tick) { const t0 = performance.now(); let last = 0; const step = () => { const k = Math.min(1, (performance.now() - t0) / ms), v = Math.round(to * (1 - Math.pow(1 - k, 3))); const el = $(id); if (!el) return; el.textContent = fmt(v); if (tick && v !== last && k < 1 && Math.random() < 0.3) tick(); last = v; if (k < 1) requestAnimationFrame(step); }; setTimeout(step, 300); }

  // pause
  $('pause').onclick = () => { A.click(); syncSettings(); openModal('mPause'); };
  $('resume').onclick = () => { A.click(); closeModal('mPause'); };
  $('restart').onclick = () => { A.click(); closeModal('mPause'); save.run = null; V.wipeBoard(() => G.mode === 'level' ? startLevel(G.level) : G.mode === 'daily' ? startDaily() : (save.run = null, begin('classic', L.create(classicCfg())))); };
  $('quit').onclick = () => { A.click(); closeModal('mPause'); saveRun(); V.wipeBoard(() => show('home')); };

  // ---------- tutorial (level 1): hand shows the first two drags, then the clear ----------
  function coach(txt) { $('coach').textContent = txt; $('coach').classList.toggle('on', !!txt); }
  let handAnim = 0;
  function hand(from, to) {
    cancelAnimationFrame(handAnim); const h = $('hand'); if (!from) { h.classList.remove('on'); return; } h.classList.add('on');
    const t0 = performance.now(); const step = () => { const k = ((performance.now() - t0) / 1600) % 1, e = Math.min(1, Math.max(0, (k - 0.15) / 0.6)), ee = e * e * (3 - 2 * e); const x = to ? from.x + (to.x - from.x) * ee : from.x, y = to ? from.y + (to.y - from.y) * ee : from.y + Math.sin(k * 6.28) * 8; h.style.left = (x - 14) + 'px'; h.style.top = (y - 6) + 'px'; h.style.opacity = to ? (k > 0.85 ? 0 : 1) : 1; handAnim = requestAnimationFrame(step); }; step();
  }
  const handAt = p => hand(p);
  function tutorialStep() {
    if (!S || G.mode !== 'level' || G.level !== 1) return;
    const s = S.placements; G.tutStep = s + 1;
    const plan = [[0, 7, 0], [2, 7, 4]][s]; // first tray is 4h, o, 4h: two bars complete the bottom row
    if (!plan || S.tray[plan[0]].used) { coach(s === 2 ? 'Nice! Keep filling rows and columns' : ''); hand(null); G.tutStep = 0; return; }
    const sh = L.SHAPE[S.tray[plan[0]].shape], from = V.toScreen(V.TRAY_X[plan[0]], V.TRAY_Y, 0.3), pc = V.cellPos(plan[1], plan[2] + (sh.wd - 1) / 2), to = V.toScreen(pc.x, pc.y, V.BZ);
    coach(s === 0 ? 'Drag the jelly onto the board' : 'Fill the whole row to clear it!'); hand(from, to);
  }
  function tutorialAfterPlace() { hand(null); setTimeout(tutorialStep, 700); }

  // ---------- performance overlay (?debug=1 or Settings) ----------
  const perf = { cpu: [], frames: [], longFrames: 0, rendered: 0, runs: [], start: performance.now(), dprLog: [], lastAdapt: performance.now(), goodSince: performance.now(), first: 0 };
  let gpu = ''; try { const gl = V.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
  function togglePerf(v) { const on = v == null ? !$('perf').classList.contains('on') : v; $('perf').classList.toggle('on', on); }
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  function perfText() {
    const f = perf.frames, avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0, cpuAvg = perf.cpu.length ? perf.cpu.reduce((a, b) => a + b, 0) / perf.cpu.length : 0;
    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'n/a', info = V.renderer.info;
    return [`FPS ${avg ? (1000 / avg).toFixed(0) : '-'}  frame ${avg.toFixed(1)}ms p95 ${pct(f, 0.95).toFixed(1)} max ${Math.max(0, ...f).toFixed(0)}`,
      `CPU ${cpuAvg.toFixed(1)}ms p95 ${pct(perf.cpu, 0.95).toFixed(1)} -> ${avg && cpuAvg < avg * 0.4 ? 'GPU/display bound' : 'CPU bound'}`,
      `slow frames >33ms: ${perf.longFrames}/${perf.rendered}`, `draw calls ${info.render.calls} tris ${info.render.triangles} particles ${V.parts.list.length}`,
      `DPR ${V.dpr.toFixed(2)}/${V.dprMax} canvas ${V.canvas.width}x${V.canvas.height}`, `warm-up ${perf.first.toFixed(0)}ms  heap ${mem}  geo ${info.memory.geometries} tex ${info.memory.textures}`,
      `voices ${A.voices()}  ${V.active ? 'animating' : 'idle'}  cores ${navigator.hardwareConcurrency || '?'} RAM ${navigator.deviceMemory || '?'}GB`, `GPU ${gpu}`].join('\n');
  }
  $('perfMin').onclick = () => { $('perf').classList.toggle('min'); $('perfMin').textContent = $('perf').classList.contains('min') ? 'more' : 'less'; };
  $('perfCopy').onclick = () => {
    const txt = `Jelly Jars 2.0 perf report\n${navigator.userAgent}\nsession ${((performance.now() - perf.start) / 1000).toFixed(0)}s\n${perfText()}\nDPR changes: ${perf.dprLog.join(', ') || 'none'}\nruns: ${perf.runs.map(r => `${r.mode} ${r.score}pts/${r.secs}s`).join(' | ')}`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { $('perfCopy').textContent = 'Copied!'; setTimeout(() => $('perfCopy').textContent = 'Copy report', 1200); }).catch(() => prompt('Copy this report:', txt));
  };
  function syncKnobs() { const k = Object.assign({ popMode: 'pour', popShape: '3x3', jarCap: 8, capGrow: 2 }, save.knobs || {}); $('kMode').value = k.popMode; $('kShape').value = k.popShape; $('kCap').value = k.jarCap; $('kGrow').value = k.capGrow; }
  ['kMode', 'kShape', 'kCap', 'kGrow'].forEach(id => $(id).onchange = () => { save.knobs = { popMode: $('kMode').value, popShape: $('kShape').value, jarCap: +$('kCap').value, capGrow: +$('kGrow').value }; persist(); toast('Applies to the next game'); });
  $('kDpr').onchange = () => { const v = $('kDpr').value; save.dprLock = v; persist(); if (v !== 'auto') V.setDpr(+v); perf.frames.length = perf.cpu.length = 0; };

  // ---------- main loop: render on demand; gentle idle life at ~20 fps unless battery saver ----------
  let lastT = performance.now(), lastUi = 0, lastIdle = 0, warm = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = Math.max(0, now - lastT), dt = Math.min(0.05, raw / 1000); lastT = now;
    const idleLife = !save.settings.saver && (screen === 'hud' || screen === 'home');
    const c0 = performance.now(), active = V.frame(dt, idleLife);
    if (active || (idleLife && now - lastIdle > 50)) {
      if (!active) lastIdle = now;
      V.render(); const cpu = performance.now() - c0;
      if (warm++ < 20) { perf.first = Math.max(perf.first, cpu); }
      else if (active) {
        perf.rendered++; perf.cpu.push(cpu); perf.frames.push(raw); if (perf.frames.length > 180) { perf.frames.shift(); perf.cpu.shift(); } if (raw > 33.5) perf.longFrames++;
        if ((save.dprLock || 'auto') === 'auto' && now - perf.lastAdapt > 2000 && perf.frames.length > 60) {
          const rec = perf.frames.slice(-60), avg = rec.reduce((a, b) => a + b, 0) / rec.length;
          if (avg > 24 && V.dpr > 1) { V.setDpr(V.dpr - 0.25); perf.dprLog.push(V.dpr.toFixed(2) + '@' + Math.round(avg) + 'ms'); perf.goodSince = now; perf.frames.length = perf.cpu.length = 0; }
          else if (avg < 17.5 && V.dpr < Math.min(V.dprMax, 1.75) && now - perf.goodSince > 8000) { V.setDpr(V.dpr + 0.25); perf.dprLog.push(V.dpr.toFixed(2) + '+'); perf.goodSince = now; perf.frames.length = perf.cpu.length = 0; }
          else if (avg >= 17.5) perf.goodSince = now;
          perf.lastAdapt = now;
        }
      }
    }
    if ($('perf').classList.contains('on') && now - lastUi > 500) { $('perfTxt').innerHTML = perfText().split('\n').map(l => '<div>' + l.replace(/</g, '&lt;') + '</div>').join(''); lastUi = now; }
  }

  // ---------- boot ----------
  V.init($('c')); window.addEventListener('resize', () => V.resize());
  if (save.dprLock && save.dprLock !== 'auto') V.setDpr(+save.dprLock);
  $('kDpr').value = save.dprLock || 'auto'; syncKnobs(); syncSettings();
  applyJar(); makePortraits();
  M.missions(save); M.daily(save); save.stats.sessions++; if (M.markDay(save)) track('day_active', { days: save.days.length }); persist();
  track(save.stats.sessions === 1 ? 'first_open' : 'session_start', { session: save.stats.sessions });
  requestAnimationFrame(loop);
  const go = () => { $('boot').classList.add('gone'); if (!save.stars[1] && !save.stats.games && !Q.get('bot')) { startLevel(save.run && save.run.mode === 'level' ? save.run.level : 1, true); } else show('home'); };
  (document.fonts ? document.fonts.load('800 20px Baloo').catch(() => {}) : Promise.resolve()).then(() => setTimeout(go, 350));
  if (Q.get('debug') === '1') togglePerf(true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveRun(); persist(true); } });

  // ---------- test hooks + autoplay bot (?bot=1 classic, ?bot=journey) ----------
  window.JJApp = { state: () => S, game: () => G, save: () => save, events, perf, perfText, check: () => { const bad = []; for (let k = 0; k < 64; k++) if (!!S.board[k] !== !!V.board[k]) bad.push(k); return bad; }, show, startLevel, startClassic, startDaily };
  if (Q.get('bot')) {
    const speed = +(Q.get('speed') || 1), journey = Q.get('bot') === 'journey'; window.JJBotOn = true;
    const think = () => {
      if (!window.JJBotOn) return;
      const rm = $('mResult').classList.contains('on'), lm = $('mLevel').classList.contains('on');
      if (lm) { $('lvGo').click(); return setTimeout(think, 900 / speed); }
      if (rm) { const b = $('rNext') || $('rRetry') || $('rAgain'); if (b) b.click(); return setTimeout(think, 1200 / speed); }
      if (screen === 'home') { journey ? $('hPlay').click() : $('cClassic').click(); return setTimeout(think, 900 / speed); }
      if (screen !== 'hud' || !S || S.over || V.tweens.length > 3 || performance.now() < busyUntil) return setTimeout(think, 150 / speed);
      if (S.popReady && (S.stuck || Math.random() < 0.1)) { const p = B.bestPop(S); aimCell = { r: p.r, c: p.c }; aiming = true; doPour(); return setTimeout(think, 1800 / speed); }
      if (S.stuck) { $('giveUp').click(); return setTimeout(think, 600 / speed); }
      const bm = B.bestMove(S, 4); if (!bm) return setTimeout(think, 300 / speed);
      drag = { i: bm.ti, id: -1, lift: 0 }; V.dragStart(bm.ti); A.pick();
      const sh = L.SHAPE[S.tray[bm.ti].shape], p = V.cellPos(bm.r + (sh.h - 1) / 2, bm.c + (sh.wd - 1) / 2), tgt = V.toScreen(p.x, p.y, V.BZ), from = V.toScreen(V.TRAY_X[bm.ti], V.TRAY_Y, 0.3); let k = 0;
      const mv = () => { if (!drag) return; k += 0.25; onDragMove(from.x + (tgt.x - from.x) * Math.min(1, k), from.y + (tgt.y - from.y) * Math.min(1, k)); if (k < 1) setTimeout(mv, 30 / speed); else { drag.cell = { r: bm.r, c: bm.c }; drag.ok = true; onDrop(); setTimeout(think, 420 / speed); } };
      mv();
    };
    setTimeout(think, 1200);
  }
})();
