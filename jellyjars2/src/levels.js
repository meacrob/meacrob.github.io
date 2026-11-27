/* Jelly Journey levels. Design lives here; moves and star thresholds are filled in by sim/levels.js
   (a bot plays each level many times; see TUNED). Presets: '.' empty, 1-6 jelly, x crate, * star jelly, j jam, J jam under jelly. */
(function (root) {
  'use strict';
  const WORLDS = [
    { id: 'grove', name: 'Strawberry Grove', hero: 1, sky: ['#ffd9e8', '#fff1f6'], hill: ['#ffb8d2', '#ff9ec2', '#f78fb6'], accent: '#ff5c8a', jar: 'grove' },
    { id: 'bay', name: 'Blueberry Bay', hero: 2, sky: ['#cfe9ff', '#effaff'], hill: ['#9fd4ff', '#7cc0fb', '#5fb0f5'], accent: '#3f9cff', jar: 'bay' },
    { id: 'isle', name: 'Mango Island', hero: 3, sky: ['#ffeec2', '#fffaea'], hill: ['#ffd56b', '#ffc24a', '#ffb02e'], accent: '#ff9a1f', jar: 'isle' }
  ];
  const E = '........';
  const L = [
    // ---- World 1: Strawberry Grove (lines, score, stars, jar, combo, crates) ----
    { t: 'lines', n: 3, tip: 'Fill a row or column to clear it' },
    { t: 'lines', n: 6 },
    { t: 'score', n: 1500, tip: 'Clear several lines at once for big points' },
    { t: 'stars', p: [E, E, '111*11..', E, E, '..22*222', E, E], tip: 'Clear the lines with star jellies' },
    { t: 'lines', n: 9, p: [E, E, E, E, E, '33....44', '33....44', '11....22'] },
    { t: 'jar', tip: 'Every clear fills the jar. Fill it up!' },
    { t: 'combo', n: 3, tip: 'Clear lines on back-to-back moves for a combo' },
    { t: 'stars', p: [E, '.*....*.', '..1111..', '...*....', '....*...', '..2222..', E, E] },
    { t: 'score', n: 3000 },
    { t: 'crates', p: [E, '.x....x.', E, '...xx...', '...xx...', E, '.x....x.', E], tip: 'Crates break when their line clears', boss: 1 },
    // ---- World 2: Blueberry Bay (jam arrives) ----
    { t: 'jam', p: [E, E, '..jjjj..', E, E, '..jjjj..', E, E], tip: 'Clear lines over the jam to wipe it up' },
    { t: 'lines', n: 12, p: ['55....66', '5......6', E, E, E, E, '6......5', '66....55'] },
    { t: 'stars', p: ['x.*..*.x', E, '.x....x.', E, E, '.x....x.', E, 'x.*..*.x'] },
    { t: 'combo', n: 4 },
    { t: 'jam', p: [E, '.jj..jj.', E, '...JJ...', '...JJ...', E, '.jj..jj.', E] },
    { t: 'score', n: 3500, p: ['2.2.2.2.', E, E, E, E, E, E, '.4.4.4.4'] },
    { t: 'jar', n2: 2, tip: 'Pour, then fill the jar again' },
    { t: 'crates', p: ['xx....xx', 'x......x', E, '..xxxx..', E, E, 'x......x', 'xx....xx'] },
    { t: 'stars', p: ['*.......', '.1....2.', '..1..2..', '...**...', '...**...', '..3..4..', '.3....4.', '.......*'] },
    { t: 'jam', p: ['.jjjjjj.', E, E, '..jjjj..', E, E, E, '.jjjjjj.'], boss: 1 },
    // ---- World 3: Mango Island (mixed, tighter) ----
    { t: 'lines', n: 15, p: ['1.......', '12......', '123.....', '1234....', E, E, E, E] },
    { t: 'crates', p: ['x..xx..x', E, E, 'xx....xx', 'xx....xx', E, E, 'x..xx..x'] },
    { t: 'combo', n: 5 },
    { t: 'stars', p: ['.x*..*x.', '.x....x.', E, '*......*', '*......*', E, '.x....x.', '.x*..*x.'] },
    { t: 'score', n: 3200, p: ['11....22', E, E, E, E, E, E, '33....44'] },
    { t: 'jam', p: ['JJ....JJ', 'J......J', '..jjjj..', '..j..j..', '..j..j..', '..jjjj..', 'J......J', 'JJ....JJ'] },
    { t: 'jar', n2: 2, p: ['3.3.3.3.', E, E, E, E, E, E, '.5.5.5.5'] },
    { t: 'crates', p: ['xxx..xxx', E, 'x.x..x.x', E, E, 'x.x..x.x', E, 'xxx..xxx'] },
    { t: 'stars', p: ['*x....x*', 'xx....xx', '..2..2..', '...**...', '...**...', '..6..6..', 'xx....xx', '*x....x*'] },
    { t: 'jam', p: ['..j..j..', '...xx...', '..x..x..', '.x.JJ.x.', '.x.JJ.x.', '..x..x..', '...xx...', '..j..j..'], boss: 1 }
  ];
  // tuned by sim/levels.js (bot-tested). moves = move limit; s2/s3 = moves LEFT needed for 2 / 3 stars
  const TUNED = {"1":{"moves":15,"s2":4,"s3":5},"2":{"moves":24,"s2":5,"s3":6},"3":{"moves":31,"s2":6,"s3":9},"4":{"moves":7,"s2":3,"s3":5},"5":{"moves":28,"s2":4,"s3":6},"6":{"moves":27,"s2":6,"s3":8},"7":{"moves":25,"s2":12,"s3":14},"8":{"moves":45,"s2":16,"s3":24},"9":{"moves":45,"s2":5,"s3":10},"10":{"moves":45,"s2":9,"s3":17},"11":{"moves":42,"s2":13,"s3":20},"12":{"moves":34,"s2":3,"s3":6},"13":{"moves":37,"s2":15,"s3":21},"14":{"moves":34,"s2":14,"s3":18},"15":{"moves":45,"s2":1,"s3":11},"16":{"moves":45,"s2":5,"s3":11},"17":{"moves":45,"s2":12,"s3":15},"18":{"moves":45,"s2":14,"s3":22},"19":{"moves":45,"s2":19,"s3":28},"20":{"moves":45,"s2":5,"s3":16},"21":{"moves":40,"s2":3,"s3":4},"22":{"moves":34,"s2":8,"s3":15},"23":{"moves":36,"s2":8,"s3":14},"24":{"moves":37,"s2":9,"s3":15},"25":{"moves":45,"s2":5,"s3":10},"26":{"moves":45,"s2":5,"s3":14},"27":{"moves":36,"s2":5,"s3":10},"28":{"moves":39,"s2":14,"s3":20},"29":{"moves":38,"s2":17,"s3":22},"30":{"moves":45,"s2":15,"s3":23}};
  function goalOf(d) {
    if (d.t === 'stars') return [...d.p.join('')].filter(ch => ch === '*').length;
    if (d.t === 'jam') return [...d.p.join('')].filter(ch => ch === 'j' || ch === 'J').length;
    if (d.t === 'crates') return [...d.p.join('')].filter(ch => ch === 'x').length;
    if (d.t === 'jar') return 8 * (d.n2 === 2 ? 2 : 1) - 0.01; // jar units (cap 8): 1 or 2 full jars
    return d.n;
  }
  const LEVELS = L.map((d, i) => {
    const t = TUNED[i + 1] || {};
    return { id: i + 1, world: Math.floor(i / 10), type: d.t, n: goalOf(d), preset: d.p || null, tip: d.tip || null, boss: !!d.boss, jars: d.n2 || 1,
      moves: t.moves || 30, s2: t.s2 == null ? 4 : t.s2, s3: t.s3 == null ? 8 : t.s3 };
  });
  function config(lv) { return { goal: { type: lv.type, n: lv.n, moves: lv.moves }, preset: lv.preset, jarCap: 8, capGrow: lv.type === 'jar' ? 1 : 1.5, friendlyStart: lv.id === 1 }; }
  function starsFor(lv, movesLeft) { return movesLeft >= lv.s3 ? 3 : movesLeft >= lv.s2 ? 2 : 1; }
  const API = { WORLDS, LEVELS, TUNED, config, starsFor, raw: L };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JJLevels = API;
})(typeof window !== 'undefined' ? window : globalThis);
