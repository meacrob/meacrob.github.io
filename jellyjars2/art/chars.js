/* Jelly Jars character art (SVG). Source of truth for the 6 flagship characters: concept sheet, UI portraits, marketing.
   JJArt.svg(id, view, expr, size) -> SVG string. view: front | side | back | sil. expr: base | happy | worried | sleepy | excited */
(function (root) {
  'use strict';
  const C = {
    rosie: { name: 'Rosie', fruit: 'Strawberry', c: '#ff5f8f', d: '#d63a6c', l: '#ffa3c0', personality: 'Cheeky show-off. Sticks her tongue out at everything, then pretends she did not.', sig: ['Strawberry body that tapers to a point', 'Four-leaf crown', 'Golden seeds', 'Signature wink + tongue'] },
    bluu: { name: 'Bluu', fruit: 'Blueberry', c: '#4f8dff', d: '#2f60d6', l: '#9cc0ff', personality: 'Shy and sweet. Blushes when anyone looks, hides behind other jellies.', sig: ['Perfect round body', 'Star-shaped crown', 'Huge blush', 'Tiny "w" mouth'] },
    sunny: { name: 'Sunny', fruit: 'Mango', c: '#ffc23a', d: '#ef9a12', l: '#ffe28a', personality: 'Always smiling, always sunny. The friend who cheers loudest for your combos.', sig: ['Tall leaning bean body', 'One big leaf on a stem', 'Ripe sunset blush', 'Biggest grin in the jar'] },
    snooze: { name: 'Snooze', fruit: 'Grape', c: '#a67cff', d: '#7a52d9', l: '#cbb3ff', personality: 'Professional napper. Falls asleep mid-puzzle, wakes up for big clears.', sig: ['Bumpy grape-bunch body', 'Curly vine on top', 'Sleepy eyes', 'Floating z'] },
    zest: { name: 'Zest', fruit: 'Lime', c: '#63cf55', d: '#36a335', l: '#aef08f', personality: 'Mischief maker. One eyebrow always up, definitely planning something.', sig: ['Wide lime body with pointy tips', 'Raised eyebrow', 'Sly smirk', 'Tiny side leaf'] },
    pip: { name: 'Pip', fruit: 'Orange', c: '#ff9440', d: '#e2681c', l: '#ffc08a', personality: 'Hyper and excitable. Arms always up, bounces everywhere, SO EXCITED.', sig: ['Squat round body', 'Springy peel curl', 'Little arms always raised', 'Sparkly eyes'] }
  };
  const ORDER = ['rosie', 'bluu', 'sunny', 'snooze', 'zest', 'pip'];
  const INK = '#40213b';
  // ---- bodies (front, 120x120 box, ground y=110) ----
  const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const ell = (x, y, rx, ry) => `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  const BODY = {
    rosie: 'M60 26C90 20 106 38 99 62C94 84 74 102 60 109C46 102 26 84 21 62C14 38 30 20 60 26Z',
    bluu: circ(60, 68, 40),
    sunny: 'M64 16C90 16 102 44 99 70C96 96 80 110 58 110C34 110 21 92 23 68C25 42 40 16 64 16Z',
    snooze: [circ(60, 74, 34), circ(34, 54, 16), circ(52, 42, 17), circ(74, 42, 17), circ(90, 56, 15), circ(30, 78, 15), circ(91, 80, 15), circ(60, 96, 15)].join(''),
    zest: 'M8 72C14 64 20 64 24 60C34 44 86 44 96 60C100 64 106 64 112 72C106 80 100 80 96 84C86 100 34 100 24 84C20 80 14 80 8 72Z',
    pip: ell(60, 72, 40, 36)
  };
  const FEET = { bluu: 1, sunny: 1, snooze: 1, zest: 1, pip: 1 };
  const FACE = { rosie: [60, 60], bluu: [60, 70], sunny: [58, 68], snooze: [60, 76], zest: [60, 72], pip: [60, 74] };
  function extras(id, view) { // signature features drawn on top of the body
    const k = C[id];
    if (id === 'rosie') {
      const leaves = `<g fill="#4fbf5a" stroke="#2f8a3a" stroke-width="1.5" stroke-linejoin="round"><path d="M60 28L42 14L48 30Z"/><path d="M60 28L78 14L72 30Z"/><path d="M60 28L50 8L60 24L70 8Z"/></g><path d="M60 24V10" stroke="#2f8a3a" stroke-width="3" stroke-linecap="round"/>`;
      const seeds = [[40, 46], [80, 46], [32, 66], [88, 66], [46, 84], [74, 84], [60, 96]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.8" ry="2.8" fill="#ffe08a"/>`).join('');
      return { under: '', over: leaves + seeds };
    }
    if (id === 'bluu') return { under: '', over: `<g fill="#2f46b8" stroke="#1a2470" stroke-width="1.4"><ellipse cx="60" cy="18" rx="6" ry="12"/><ellipse cx="47" cy="22" rx="5.5" ry="11" transform="rotate(-40 47 22)"/><ellipse cx="73" cy="22" rx="5.5" ry="11" transform="rotate(40 73 22)"/><ellipse cx="40" cy="30" rx="5" ry="9" transform="rotate(-70 40 30)"/><ellipse cx="80" cy="30" rx="5" ry="9" transform="rotate(70 80 30)"/><ellipse cx="60" cy="30" rx="12" ry="5"/></g>` };
    if (id === 'sunny') return { under: '', over: `<path d="M64 17Q66 8 70 4" stroke="#7a4a1a" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M70 6C84 -2 102 4 106 14C94 20 78 18 70 6Z" fill="#4fbf5a" stroke="#2f8a3a" stroke-width="1.5"/><path d="M72 7Q88 8 104 14" stroke="#2f8a3a" stroke-width="1" fill="none"/>` + (view !== 'back' ? `<ellipse cx="82" cy="88" rx="16" ry="13" fill="#ff7a45" opacity=".35"/>` : '') };
    if (id === 'snooze') return { under: '', over: `<path d="M62 26C62 16 70 14 72 8C74 2 68 0 66 4" stroke="#5aa64a" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M62 26C56 20 46 22 46 14C50 12 58 16 62 26Z" fill="#6fc65c" stroke="#3f8a3a" stroke-width="1.3"/>` + (view === 'front' ? `<text x="96" y="30" font-family="Baloo,sans-serif" font-weight="800" font-size="15" fill="${k.d}">z</text><text x="106" y="18" font-family="Baloo,sans-serif" font-weight="800" font-size="10" fill="${k.d}">z</text>` : '') };
    if (id === 'zest') return { under: '', over: `<path d="M34 50C30 40 36 32 46 34C46 42 40 48 34 50Z" fill="#3f9a3a" stroke="#2a6e28" stroke-width="1.3"/>` + `<path d="M40 82Q60 90 80 82" stroke="${k.l}" stroke-width="2" fill="none" opacity=".7"/>` };
    if (id === 'pip') return {
      under: `<g fill="${k.c}" stroke="${k.d}" stroke-width="2"><path d="M26 66C12 60 2 42 8 34C14 28 22 38 30 54Z"/><path d="M94 66C108 60 118 42 112 34C106 28 98 38 90 54Z"/></g>`,
      over: `<path d="M60 37C60 24 72 22 74 13C76 3 63 -1 58 6C55 12 63 16 66 10" stroke="${k.d}" stroke-width="7.5" fill="none" stroke-linecap="round"/><path d="M60 37C62 30 70 30 76 32C72 38 66 40 60 37Z" fill="#4fbf5a" stroke="#2f8a3a" stroke-width="1.3"/>` + [[44, 58], [76, 60], [38, 80], [82, 84], [60, 94]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${k.d}" opacity=".45"/>`).join('')
    };
  }
  // ---- faces ----
  function eye(x, y, t, k, s) {
    s = s || 1;
    if (t === 'dot') return `<ellipse cx="${x}" cy="${y}" rx="${5 * s}" ry="${6 * s}" fill="${INK}"/><circle cx="${x + 1.8 * s}" cy="${y - 2.2 * s}" r="${2 * s}" fill="#fff"/>`;
    if (t === 'small') return `<ellipse cx="${x}" cy="${y + 1}" rx="3.6" ry="4.3" fill="${INK}"/><circle cx="${x + 1}" cy="${y - 0.6}" r="1.4" fill="#fff"/>`;
    if (t === 'happy') return `<path d="M${x - 5} ${y + 2}Q${x} ${y - 6} ${x + 5} ${y + 2}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (t === 'closed') return `<path d="M${x - 5} ${y - 1}Q${x} ${y + 5} ${x + 5} ${y - 1}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (t === 'half') return `<path d="M${x - 5} ${y}a5 5 0 0 0 10 0Z" fill="${INK}"/><path d="M${x - 6} ${y}H${x + 6}" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x + 2}" cy="${y + 2}" r="1.3" fill="#fff"/>`;
    if (t === 'wide') return `<circle cx="${x}" cy="${y}" r="7" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y + 1}" r="3.5" fill="${INK}"/>`;
    if (t === 'sparkle') return `<ellipse cx="${x}" cy="${y}" rx="6.5" ry="7.5" fill="${INK}"/><circle cx="${x + 2.2}" cy="${y - 2.6}" r="2.6" fill="#fff"/><circle cx="${x - 2.2}" cy="${y + 2.8}" r="1.3" fill="#fff"/>`;
    if (t === 'star') return `<path d="M${x} ${y - 7}l2 5 5 .5-4 3.5 1.3 5-4.3-2.8-4.3 2.8 1.3-5-4-3.5 5-.5z" fill="#ffc21f" stroke="${INK}" stroke-width="1"/>`;
    return '';
  }
  function mouth(x, y, t, k) {
    if (t === 'tongue') return `<path d="M${x - 7} ${y}Q${x} ${y + 9} ${x + 7} ${y}Z" fill="${INK}"/><path d="M${x - 1} ${y + 3}q4 7 7 0" fill="#ff7a95" stroke="${INK}" stroke-width="1.2"/>`;
    if (t === 'w') return `<path d="M${x - 5} ${y}q2.5 4 5 0q2.5 4 5 0" stroke="${INK}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`;
    if (t === 'grin') return `<path d="M${x - 10} ${y - 1}Q${x} ${y + 14} ${x + 10} ${y - 1}Z" fill="${INK}"/><path d="M${x - 5} ${y + 5}q5 5 10 0" fill="#ff7a95"/>`;
    if (t === 'o') return `<ellipse cx="${x}" cy="${y + 2}" rx="2.8" ry="3.4" fill="${INK}"/>`;
    if (t === 'O') return `<ellipse cx="${x}" cy="${y + 3}" rx="5.5" ry="7" fill="${INK}"/><ellipse cx="${x}" cy="${y + 6}" rx="3.5" ry="2.5" fill="#ff7a95"/>`;
    if (t === 'smirk') return `<path d="M${x - 6} ${y + 2}Q${x + 2} ${y + 6} ${x + 8} ${y - 2}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    if (t === 'wobble') return `<path d="M${x - 6} ${y + 3}q3-3 6 0q3 3 6 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    if (t === 'frown') return `<path d="M${x - 6} ${y + 5}Q${x} ${y - 2} ${x + 6} ${y + 5}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    if (t === 'smile') return `<path d="M${x - 6} ${y}Q${x} ${y + 7} ${x + 6} ${y}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    return '';
  }
  const BASE = { rosie: ['happy', 'dot', 'tongue'], bluu: ['small', 'small', 'w'], sunny: ['happy', 'happy', 'grin'], snooze: ['closed', 'closed', 'o'], zest: ['half', 'dot', 'smirk'], pip: ['sparkle', 'sparkle', 'O'] };
  const EXPR = { happy: ['happy', 'happy', 'grin'], worried: ['wide', 'wide', 'wobble'], sleepy: ['closed', 'closed', 'frown'], excited: ['star', 'star', 'O'] };
  function face(id, expr, side) {
    const [x, y] = FACE[id], k = C[id], f = expr === 'base' ? BASE[id] : EXPR[expr], blush = id === 'bluu' ? 0.75 : 0.45;
    if (side) return `<g transform="translate(${x + 26} ${y}) scale(.8)">${eye(0, -4, f[1], k)}${mouth(4, 8, f[2], k)}<ellipse cx="-4" cy="6" rx="6" ry="3.5" fill="#ff6f91" opacity="${blush}"/></g>`;
    let s = eye(x - 13, y - 4, f[0], k) + eye(x + 13, y - 4, f[1], k) + mouth(x, y + 8, f[2], k);
    s += `<ellipse cx="${x - 22}" cy="${y + 6}" rx="${id === 'bluu' ? 8 : 6}" ry="${id === 'bluu' ? 5 : 3.5}" fill="#ff6f91" opacity="${blush}"/><ellipse cx="${x + 22}" cy="${y + 6}" rx="${id === 'bluu' ? 8 : 6}" ry="${id === 'bluu' ? 5 : 3.5}" fill="#ff6f91" opacity="${blush}"/>`;
    if (id === 'zest' && expr === 'base') s += `<path d="M${x + 6} ${y - 16}L${x + 20} ${y - 19}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    return s;
  }
  function svg(id, view, expr, size) {
    const k = C[id], gid = 'g' + id + Math.random().toString(36).slice(2, 7);
    view = view || 'front'; expr = expr || 'base';
    const sil = view === 'sil', side = view === 'side';
    const fill = sil ? '#2b1a29' : `url(#${gid})`, stroke = sil ? '#2b1a29' : k.d;
    let body = BODY[id];
    let tr = '';
    if (side) tr = id === 'zest' ? '' : 'translate(60 0) scale(.78 1) translate(-60 0)';
    if (side && id === 'zest') body = circ(60, 72, 30) + 'M86 66L98 72L86 78Z';
    const ex = extras(id, view === 'back' ? 'back' : side ? 'side' : 'front');
    const fy = id === 'zest' ? (side ? 101 : 96) : 109; const feet = FEET[id] ? `<g fill="${sil ? '#2b1a29' : k.d}"><ellipse cx="${side ? 58 : 46}" cy="${fy}" rx="${side ? 12 : 9}" ry="5"/>${side ? '' : `<ellipse cx="74" cy="${fy}" rx="9" ry="5"/>`}</g>` : '';
    const sil2 = s => sil ? s.replace(/fill="[^"]*"/g, 'fill="#2b1a29"').replace(/stroke="(?!none)[^"]*"/g, 'stroke="#2b1a29"').replace(/<text[^>]*>z<\/text>/g, '').replace(/<(ellipse|circle)[^>]*opacity="[^"]*"[^>]*\/>/g, '') : s;
    const shine = sil ? '' : `<ellipse cx="${side ? 50 : 42}" cy="${id === 'zest' ? 60 : 46}" rx="9" ry="5.5" fill="#fff" opacity=".7" transform="rotate(-25 42 46)"/><circle cx="${side ? 60 : 54}" cy="${id === 'zest' ? 56 : 40}" r="2.2" fill="#fff" opacity=".8"/>`;
    const tag = view === 'back' ? `<rect x="52" y="${id === 'rosie' ? 90 : 96}" width="16" height="10" rx="2" fill="#fffaf2" stroke="${k.d}" stroke-width="1"/><text x="60" y="${id === 'rosie' ? 98 : 104}" text-anchor="middle" font-family="Baloo,sans-serif" font-weight="800" font-size="7" fill="${k.d}">JJ</text>` : '';
    const inner = `${feet}${sil2(ex.under)}<path d="${body}" fill="${stroke}" stroke="${stroke}" stroke-width="4.4" stroke-linejoin="round"/><path d="${body}" fill="${fill}"/>${shine}${sil2(ex.over)}${view === 'front' ? face(id, expr) : ''}${side ? face(id, expr, true) : ''}${tag}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 120 124" width="${size || 120}" height="${size || 120}"><defs><radialGradient id="${gid}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${k.l}"/><stop offset=".55" stop-color="${k.c}"/><stop offset="1" stop-color="${k.d}"/></radialGradient></defs><ellipse cx="60" cy="112" rx="34" ry="4" fill="#000" opacity="${sil ? 0 : 0.12}"/><g transform="${tr}">${inner}</g></svg>`;
  }
  const TOP = {
    rosie: '<g fill="#4fbf5a" stroke="#2f8a3a" stroke-width="1.2"><path d="M60 24L48 14L52 26Z"/><path d="M60 24L72 14L68 26Z"/><path d="M60 24L54 10L60 20L66 10Z"/></g>',
    bluu: '<path d="M60 16l3 5 5-1.5-2 5 4.5 3-5 .7 0 5-5.5-3-5.5 3 0-5-5-.7 4.5-3-2-5 5 1.5z" fill="#2a3f9e"/>',
    sunny: '<path d="M60 24Q61 18 64 15" stroke="#7a4a1a" stroke-width="3" fill="none"/><path d="M64 16C72 10 84 13 86 19C79 22 70 21 64 16Z" fill="#4fbf5a" stroke="#2f8a3a" stroke-width="1.2"/>',
    snooze: '<path d="M60 26C60 18 67 17 68 12C69 8 64 7 63 10" stroke="#5aa64a" stroke-width="3" fill="none" stroke-linecap="round"/>',
    zest: '<path d="M30 30C28 22 33 17 41 19C41 25 36 29 30 30Z" fill="#3f9a3a" stroke="#2a6e28" stroke-width="1.2"/>',
    pip: '<path d="M60 26C60 19 67 18 68 12C69 7 62 5 60 9" stroke="#e2681c" stroke-width="4" fill="none" stroke-linecap="round"/>'
  };
  function piece(id, size) { // the simplified board piece: same cell size for all, character read by face + topper + colour
    const k = C[id], gid = 'p' + id + Math.random().toString(36).slice(2, 7), [fx, fy] = [60, 66];
    const f = BASE[id];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 6 92 104" width="${size || 80}" height="${size || 80}"><defs><radialGradient id="${gid}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${k.l}"/><stop offset=".5" stop-color="${k.c}"/><stop offset="1" stop-color="${k.d}"/></radialGradient></defs><rect x="22" y="26" width="76" height="76" rx="22" fill="url(#${gid})" stroke="${k.d}" stroke-width="2.4"/><ellipse cx="42" cy="40" rx="10" ry="6" fill="#fff" opacity=".7" transform="rotate(-25 42 40)"/>${TOP[id]}${eye(fx - 13, fy - 4, f[0], k)}${eye(fx + 13, fy - 4, f[1], k)}${mouth(fx, fy + 8, f[2], k)}<ellipse cx="${fx - 22}" cy="${fy + 6}" rx="6" ry="3.5" fill="#ff6f91" opacity=".5"/><ellipse cx="${fx + 22}" cy="${fy + 6}" rx="6" ry="3.5" fill="#ff6f91" opacity=".5"/></svg>`;
  }
  const API = { CHARS: C, ORDER, svg, piece };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JJArt = API;
})(typeof window !== 'undefined' ? window : globalThis);
