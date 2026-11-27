/* Jelly Jars 2.0 - progression and content (no UI): save data, rewards, unlocks, missions, daily challenge.
   Pure functions over a plain save object, so it can be unit-tested in Node and synced to a server later. */
(function (root) {
  'use strict';
  const KEY = 'jj2_save_v1';
  const CHARS = [null,
    { name: 'Rosie', flav: 'Strawberry', bio: 'Cheeky. Always has her tongue out.' },
    { name: 'Bluu', flav: 'Blueberry', bio: 'Shy, blushes at everything.' },
    { name: 'Sunny', flav: 'Mango', bio: 'Cannot stop smiling.' },
    { name: 'Snooze', flav: 'Grape', bio: 'Will nap anywhere. Even mid-puzzle.' },
    { name: 'Zest', flav: 'Lime', bio: 'Up to something. Probably.' },
    { name: 'Pip', flav: 'Orange', bio: 'SO EXCITED. About everything.' }];
  // 12 jar designs and how to get each (no randomness, no paid gacha)
  const JARS = [
    { id: 'grove', name: 'Berry Jar', lid: '#ff7aa8', jelly: '#ff6aa8', glass: '#e4f1ff', how: 'Starter jar', test: () => true },
    { id: 'mint', name: 'Mint Jar', lid: '#2fc79a', jelly: '#7be6c4', glass: '#e4fff6', how: 'Buy for 150 beans', price: 150, test: () => false },
    { id: 'bay', name: 'Bay Jar', lid: '#3f8cff', jelly: '#6db6ff', glass: '#e0f0ff', how: 'Finish Strawberry Grove', test: s => done(s, 10) },
    { id: 'grape', name: 'Grape Jar', lid: '#8e5cff', jelly: '#b08cff', glass: '#efe6ff', how: 'Buy for 250 beans', price: 250, test: () => false },
    { id: 'isle', name: 'Mango Jar', lid: '#ff9f1c', jelly: '#ffc93c', glass: '#fff6dc', how: 'Finish Blueberry Bay', test: s => done(s, 20) },
    { id: 'gold', name: 'Golden Jar', lid: '#e8a800', jelly: '#ffd84d', glass: '#fff3c4', how: 'Finish Mango Island', test: s => done(s, 30) },
    { id: 'sunset', name: 'Sunset Jar', lid: '#ff6a4d', jelly: '#ffa36b', glass: '#fff0e6', how: 'Buy for 300 beans', price: 300, test: () => false },
    { id: 'frost', name: 'Frost Jar', lid: '#52c6f2', jelly: '#bdefff', glass: '#ecfbff', how: 'Buy for 400 beans', price: 400, test: () => false },
    { id: 'cocoa', name: 'Cocoa Jar', lid: '#8a5a3b', jelly: '#c88a5e', glass: '#fbf0e8', how: 'Buy for 450 beans', price: 450, test: () => false },
    { id: 'night', name: 'Midnight Jar', lid: '#3b3f8f', jelly: '#7d84ff', glass: '#dfe1ff', how: 'Buy for 500 beans', price: 500, test: () => false },
    { id: 'lemon', name: 'Lemon Jar', lid: '#f2c400', jelly: '#fff07a', glass: '#fffbe0', how: 'Buy for 600 beans', price: 600, test: () => false },
    { id: 'gum', name: 'Bubblegum Jar', lid: '#ff6fcf', jelly: '#ffb3e6', glass: '#ffeefa', how: 'Buy for 700 beans', price: 700, test: () => false }
  ];
  const MISSIONS = [
    { id: 'lines', text: n => `Clear ${n} lines`, n: [15, 25], beans: 40 },
    { id: 'combo', text: n => `Reach a x${n} combo`, n: [3, 4], beans: 40 },
    { id: 'pours', text: n => `Pour the jar ${n} times`, n: [2, 3], beans: 50 },
    { id: 'classic', text: n => `Play ${n} Classic games`, n: [2, 2], beans: 30 },
    { id: 'levels', text: n => `Win ${n} Journey levels`, n: [2, 3], beans: 50 },
    { id: 'score', text: n => `Score ${n.toLocaleString('en-US')} in one game`, n: [3000, 5000], beans: 50 },
    { id: 'place', text: n => `Place ${n} pieces`, n: [50, 80], beans: 30 },
    { id: 'stars', text: n => `Earn ${n} stars`, n: [3, 5], beans: 40 }
  ];
  function done(s, id) { return (s.stars[id] || 0) > 0; }
  function starCount(s) { return Object.values(s.stars).reduce((a, b) => a + b, 0); }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; }
  function fresh() {
    return { v: 1, created: Date.now(), beans: 0, xp: 0, stars: {}, best: 0, bestCombo: 0,
      stats: { games: 0, lines: 0, pours: 0, placed: 0, wins: 0, fails: 0, missions: 0, sessions: 0, seconds: 0, bestDaily: 0 },
      chars: [false, true, false, false, false, false, false], buddy: 'rosie', homeVar: Math.random() < 0.5 ? 'journey' : 'classic', levelStats: {}, jars: { grove: true }, jar: 'grove', seenJars: { grove: true },
      missions: null, daily: { day: 0, best: 0, played: false, total: 0, claimed: false }, settings: { music: true, sfx: true, haptics: true, saver: false },
      tut: { level1: false, pour: false }, run: null, ach: {}, days: [] };
  }
  const Meta = {
    CHARS, JARS, MISSIONS, dayKey, starCount,
    // first 2.0 launch on a phone that had 1.0: same app, same storage. 1.0's save ('jellyjars_v3') is left untouched (safe to roll back);
    // 2.0 starts its own save and carries over what still means something: sound settings, No Ads, and a thank-you gift based on 1.0 progress.
    fromV1() {
      try {
        const raw = localStorage.getItem('jellyjars_v3'); if (!raw) return null; const o = JSON.parse(raw), s = fresh();
        const level = Math.max(1, +o.level || 1), paid = !!o.noAds || ((o.stats && o.stats.iap) || 0) > 0;
        s.settings.music = o.music !== false; s.settings.sfx = o.sfx !== false;
        s.noAds = !!o.noAds; s.beans = Math.min(800, 150 + Math.floor(Math.min(level, 130) * 5)) + (paid ? 300 : 0);
        s.fromV1 = { level, coins: +o.coins || 0, noAds: !!o.noAds, iap: (o.stats && o.stats.iap) || 0, gift: s.beans, at: Date.now(), shown: false };
        return s;
      } catch (e) { return null; }
    },
    load() { try { const raw = localStorage.getItem(KEY); if (!raw) { const m = this.fromV1(); if (m) return m; } if (raw) { const s = Object.assign(fresh(), JSON.parse(raw)); s.chars[1] = true; s.stats = Object.assign(fresh().stats, s.stats); s.settings = Object.assign(fresh().settings, s.settings); return s; } } catch (e) {} return fresh(); },
    save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } },
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} return fresh(); },
    playerLevel(s) { const lv = Math.floor(Math.sqrt(s.xp / 60)) + 1, a = (lv - 1) * (lv - 1) * 60, b = lv * lv * 60; return { lv, frac: (s.xp - a) / (b - a) }; },
    nextLevel(s, LEVELS) { for (const l of LEVELS) if (!done(s, l.id)) return l; return LEVELS[LEVELS.length - 1]; },
    unlocked(s, id) { return id === 1 || done(s, id - 1); },
    // newly met jar conditions -> list of jar defs (and marks them owned)
    // jelly friends join at Journey milestones (Rosie from the start): a real collectible, not tied to board colours
    CHAR_AT: [0, 0, 5, 10, 15, 20, 25],
    // ready(f): is this friend's 3D model finished? Unfinished friends are never awarded; they arrive later for players already past their level
    checkChars(s, ready) { const out = []; for (let f = 1; f <= 6; f++) if (!s.chars[f] && (!ready || ready(f)) && (this.CHAR_AT[f] === 0 || done(s, this.CHAR_AT[f]))) { s.chars[f] = true; out.push(f); } return out; },
    checkJars(s) { const out = []; for (const j of JARS) if (!s.jars[j.id] && j.test(s)) { s.jars[j.id] = true; out.push(j); } return out; },
    nextJarHint(s) { const j = JARS.find(j => !s.jars[j.id]); return j ? j : null; },
    // ---- daily missions: 3 per day, picked from the date, achievable in normal play ----
    missions(s) {
      const d = dayKey();
      if (!s.missions || s.missions.day !== d) {
        const pool = MISSIONS.map(m => m.id), list = []; let h = hash(d);
        while (list.length < 3) { const id = pool.splice(h % pool.length, 1)[0]; const m = MISSIONS.find(x => x.id === id); list.push({ id, n: m.n[(h >> 3) % 2], prog: 0, claimed: false }); h = hash(h + 7); }
        s.missions = { day: d, list, bonus: false };
      }
      return s.missions;
    },
    missionText(m) { return MISSIONS.find(x => x.id === m.id).text(m.n); },
    missionBeans(m) { return MISSIONS.find(x => x.id === m.id).beans; },
    // feed gameplay facts into missions; returns missions that just completed
    progress(s, id, amount, mode) {
      const ms = this.missions(s), out = [];
      for (const m of ms.list) {
        if (m.id !== id || m.prog >= m.n) continue;
        m.prog = mode === 'max' ? Math.max(m.prog, amount) : m.prog + amount;
        if (m.prog >= m.n) { m.prog = m.n; out.push(m); }
      }
      return out;
    },
    // ---- daily challenge: same seed + same piece sequence for everyone today ----
    daily(s) { const d = dayKey(); if (s.daily.day !== d) s.daily = { day: d, best: 0, played: false, total: s.daily.total || 0, claimed: false }; return s.daily; },
    dailyConfig() { const d = dayKey(); return { cfg: { fixedSeq: true, goal: { type: 'score', n: 1e9, moves: 40 }, jarCap: 8, capGrow: 1.5 }, seed: hash(d) & 0x7fffffff, target: 4000 }; },
    msToMidnight() { const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0); return m - n; },
    // ---- level rewards ----
    levelReward(lv, stars, prevStars) { const first = !prevStars; return { beans: (first ? 20 : 0) + Math.max(0, stars - (prevStars || 0)) * 10 + (lv.boss && first ? 50 : 0), xp: (first ? 30 : 5) + stars * 10 }; },
    // ---- achievements (lifetime milestones) ----
    ACH: [
      { id: 'first_line', name: 'First Squish', how: 'Clear your first line', test: s => s.stats.lines >= 1, beans: 10 },
      { id: 'lines100', name: 'Line Lover', how: 'Clear 100 lines', test: s => s.stats.lines >= 100, beans: 40 },
      { id: 'lines1000', name: 'Jelly Legend', how: 'Clear 1,000 lines', test: s => s.stats.lines >= 1000, beans: 150 },
      { id: 'combo5', name: 'On a Roll', how: 'Reach a x5 combo', test: s => s.bestCombo >= 5, beans: 40 },
      { id: 'levels5', name: 'Journey Begins', how: 'Complete 5 levels', test: s => Object.keys(s.stars).length >= 5, beans: 30 },
      { id: 'world1', name: 'Grove Guardian', how: 'Finish Strawberry Grove', test: s => done(s, 10), beans: 60 },
      { id: 'pour10', name: 'Pour Master', how: 'Pour the jar 10 times', test: s => s.stats.pours >= 10, beans: 40 },
      { id: 'daily1', name: 'Daily Dipper', how: 'Finish a Daily Challenge', test: s => s.daily.total >= 1, beans: 20 },
      { id: 'friends', name: 'Full Fruit Bowl', how: 'Meet all 6 jelly friends', test: s => s.chars.slice(1).every(Boolean), beans: 50 },
      { id: 'best', name: 'Personal Best', how: 'Score 5,000 in Classic', test: s => s.best >= 5000, beans: 30 }
    ],
    checkAch(s) { const out = []; for (const a of this.ACH) if (!s.ach[a.id] && a.test(s)) { s.ach[a.id] = Date.now(); s.beans += a.beans; out.push(a); } return out; },
    // returning-player tracking for D1/D7 style analytics (no streak punishment)
    markDay(s) { const d = dayKey(); if (!s.days.includes(d)) { s.days.push(d); if (s.days.length > 60) s.days.shift(); return true; } return false; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Meta; else root.JJMeta = Meta;
})(typeof window !== 'undefined' ? window : globalThis);
