/* Jelly Journey levels. Design lives here; moves and star thresholds are filled in by sim/levels.js
   (a bot plays each level many times; see TUNED). Presets: '.' empty, 1-6 jelly, x crate, * star jelly, j jam, J jam under jelly. */
(function (root) {
  'use strict';
  const WORLDS = [
    { id: 'grove', need: 0, name: 'Strawberry Grove', hero: 1, sky: ['#ffd9e8', '#fff1f6'], hill: ['#ffb8d2', '#ff9ec2', '#f78fb6'], accent: '#ff5c8a', jar: 'grove' },
    { id: 'bay', need: 18, name: 'Blueberry Bay', hero: 2, sky: ['#cfe9ff', '#effaff'], hill: ['#9fd4ff', '#7cc0fb', '#5fb0f5'], accent: '#3f9cff', jar: 'bay' },
    { id: 'isle', need: 38, name: 'Mango Island', hero: 3, sky: ['#ffeec2', '#fffaea'], hill: ['#ffd56b', '#ffc24a', '#ffb02e'], accent: '#ff9a1f', jar: 'isle' }
  ];
  const E = '........';
  const L = [
    // ---- World 1: Strawberry Grove. Basics (1-3), Jelly Pour: intro 4, practice 5-6. Star jellies: intro 7, practice 8, combined 9-10 ----
    { t: 'lines', n: 3, tip: 'Fill a row or column to clear it' },
    { t: 'lines', n: 6 },
    { t: 'score', n: 1500, tip: 'Clear several lines at once for big points' },
    { t: 'jar', intro: 'jar', tip: 'Clear lines to fill the jar, then pour it' },
    { t: 'lines', n: 9, p: [E, E, E, E, E, '33....44', '33....44', '11....22'] },
    { t: 'jar', n2: 2, tip: 'Pour, then fill the jar again' },
    { t: 'stars', p: [E, E, '111*11..', E, E, '..22*222', E, E], intro: 'stars', tip: 'Clear the lines with star jellies' },
    { t: 'stars', p: [E, '.*....*.', '..1111..', '...*....', '....*...', '..2222..', E, E] },
    { t: 'score', n: 3000 },
    { t: 'stars', p: ['*.......', '.1....2.', '..1..2..', '...**...', '...**...', '..3..4..', '.3....4.', '.......*'], boss: 1 },
    // ---- World 2: Blueberry Bay. Jam: intro 11, practice 12. Combos: intro 13, practice 14. Crates: intro 15, practice 16. Mixed 17-20 ----
    { t: 'jam', p: [E, E, '..jjjj..', E, E, '..jjjj..', E, E], intro: 'jam', tip: 'Clear lines over the jam to wipe it up' },
    { t: 'jam', p: [E, '.jj..jj.', E, '...JJ...', '...JJ...', E, '.jj..jj.', E] },
    { t: 'combo', n: 3, intro: 'combo', tip: 'Clear lines on back-to-back moves' },
    { t: 'lines', n: 12, p: ['55....66', '5......6', E, E, E, E, '6......5', '66....55'] },
    { t: 'crates', p: [E, '.x....x.', E, '...xx...', '...xx...', E, '.x....x.', E], intro: 'crates', tip: 'Crates break when their line clears' },
    { t: 'crates', p: ['xx....xx', 'x......x', E, '..xxxx..', E, E, 'x......x', 'xx....xx'] },
    { t: 'combo', n: 4 },
    { t: 'score', n: 2800, p: ['2.2.2.2.', E, E, E, E, E, E, '.4.4.4.4'] },
    { t: 'stars', p: ['x.*..*.x', E, '.x....x.', E, E, '.x....x.', E, 'x.*..*.x'] },
    { t: 'jam', p: ['.jjjjjj.', E, E, '..jjjj..', E, E, E, '.jjjjjj.'], boss: 1 },
    // ---- World 3: Mango Island. Everything combined, tighter ----
    { t: 'lines', n: 15, p: ['1.......', '12......', '123.....', '1234....', E, E, E, E] },
    { t: 'crates', p: ['x..xx..x', E, E, 'xx....xx', 'xx....xx', E, E, 'x..xx..x'] },
    { t: 'combo', n: 5 },
    { t: 'stars', p: ['.x*..*x.', '.x....x.', E, '*......*', '*......*', E, '.x....x.', '.x*..*x.'] },
    { t: 'score', n: 3200, p: ['11....22', E, E, E, E, E, E, '33....44'] },
    { t: 'jam', p: ['JJ....JJ', 'J......J', '..jjjj..', '..j..j..', '..j..j..', '..jjjj..', 'J......J', 'JJ....JJ'] },
    { t: 'jar', n2: 2, p: ['3.3.3.3.', E, E, E, E, E, E, '.5.5.5.5'] },
    { t: 'crates', p: ['xxx..xxx', E, 'x.x..x.x', E, E, 'x.x..x.x', E, 'xxx..xxx'] },
    { t: 'stars', p: ['*x....x*', 'xx....xx', '..2..2..', '...**...', '...**...', '..6..6..', 'xx....xx', '*x....x*'] },
    { t: 'jam', p: ['........', '...xx...', '..x..x..', '.x.JJ.x.', '.x.JJ.x.', '..x..x..', '...xx...', 'j......j'], boss: 1 }
  ];
  // tuned by sim/levels.js (bot-tested). moves = move limit; s2/s3 = moves LEFT needed for 2 / 3 stars
  const TUNED = {"1":{"moves":16,"s2":3,"s3":6,"seed":8919},"2":{"moves":24,"s2":4,"s3":5,"seed":16838},"3":{"moves":33,"s2":5,"s3":8,"seed":24757},"4":{"moves":25,"s2":5,"s3":7,"seed":137405},"5":{"moves":27,"s2":5,"s3":7,"seed":145324},"6":{"moves":42,"s2":5,"s3":10,"seed":153243},"7":{"moves":6,"s2":2,"s3":2,"seed":56433},"8":{"moves":45,"s2":17,"s3":25,"seed":378539},"9":{"moves":45,"s2":8,"s3":11,"seed":177000},"10":{"moves":39,"s2":10,"s3":17,"seed":184919},"11":{"moves":39,"s2":10,"s3":16,"seed":297567},"12":{"moves":45,"s2":2,"s3":13,"seed":96028},"13":{"moves":19,"s2":6,"s3":7,"seed":103947},"14":{"moves":30,"s2":2,"s3":5,"seed":426053},"15":{"moves":45,"s2":8,"s3":17,"seed":538701},"16":{"moves":45,"s2":14,"s3":21,"seed":232433},"17":{"moves":33,"s2":14,"s3":17,"seed":240352},"18":{"moves":45,"s2":5,"s3":10,"seed":143542},"19":{"moves":37,"s2":19,"s3":24,"seed":151461},"20":{"moves":45,"s2":1,"s3":11,"seed":368838},"21":{"moves":42,"s2":4,"s3":5,"seed":690944},"22":{"moves":30,"s2":8,"s3":14,"seed":279947},"23":{"moves":27,"s2":3,"s3":9,"seed":183137},"24":{"moves":40,"s2":6,"s3":14,"seed":191056},"25":{"moves":45,"s2":4,"s3":8,"seed":408433},"26":{"moves":45,"s2":4,"s3":12,"seed":206894},"27":{"moves":42,"s2":5,"s3":8,"seed":738458},"28":{"moves":33,"s2":8,"s3":19,"seed":432190},"29":{"moves":42,"s2":20,"s3":25,"seed":440109},"30":{"moves":33,"s2":2,"s3":13,"seed":552757}};
  function goalOf(d) {
    if (d.t === 'stars') return [...d.p.join('')].filter(ch => ch === '*').length;
    if (d.t === 'jam') return [...d.p.join('')].filter(ch => ch === 'j' || ch === 'J').length;
    if (d.t === 'crates') return [...d.p.join('')].filter(ch => ch === 'x').length;
    if (d.t === 'jar') return d.n2 || 1; // number of pours
    return d.n;
  }
  const LEVELS = L.map((d, i) => {
    const t = TUNED[i + 1] || {};
    return { id: i + 1, world: Math.floor(i / 10), type: d.t, n: goalOf(d), preset: d.p || null, tip: d.tip || null, intro: d.intro || null, boss: !!d.boss, jars: d.n2 || 1,
      seed: t.seed || 0, moves: t.moves || 30, s2: t.s2 == null ? 4 : t.s2, s3: t.s3 == null ? 8 : t.s3 };
  });
  function seedOf(lv) { return lv.seed || 1000 + lv.id * 7919; }
  function config(lv) { return { fixedSeq: true, goal: { type: lv.type, n: lv.n, moves: lv.moves }, preset: lv.preset, jarCap: 8, capGrow: lv.type === 'jar' ? 1.25 : 1.5, friendlyStart: lv.id === 1 }; }
  function starsFor(lv, movesLeft) { return movesLeft >= lv.s3 ? 3 : movesLeft >= lv.s2 ? 2 : 1; }
  const API = { WORLDS, LEVELS, TUNED, config, starsFor, seedOf, raw: L };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JJLevels = API;
})(typeof window !== 'undefined' ? window : globalThis);
