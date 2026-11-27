/* Jelly Jars 2.0 - world backdrops. Layered SVG (far / mid / near) behind the 3D canvas, cheap CSS-only motion:
   slow drift, swaying plants, a few floating petals, and a small tilt parallax. Nothing here sits on the board. */
(function () {
  'use strict';
  const svg = (vb, inner, cls) => `<svg class="${cls}" viewBox="${vb}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${inner}</svg>`;
  // ---- reusable props ----
  const strawberryPlant = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="sway"><path d="M0 0C-20-6-34-24-26-34C-16-30-6-18 0-6C6-18 16-30 26-34C34-24 20-6 0 0Z" fill="#59b85c"/><path d="M0 0C-6-16-4-34 0-40C4-34 6-16 0 0Z" fill="#4aa64f"/><g transform="translate(-16 -10)"><path d="M0 0c-7 0-9 9-4 15 2 3 6 3 8 0 5-6 3-15-4-15z" fill="#ff5f8f"/><path d="M-4 -1l4 3 4-3-4-2z" fill="#3f9a45"/></g><g transform="translate(15 -6) scale(.8)"><path d="M0 0c-7 0-9 9-4 15 2 3 6 3 8 0 5-6 3-15-4-15z" fill="#ff7aa2"/><path d="M-4 -1l4 3 4-3-4-2z" fill="#3f9a45"/></g></g></g>`;
  const flower = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="sway2"><path d="M0 14V0" stroke="#5fae5a" stroke-width="2.4"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-5" rx="3.6" ry="5.5" fill="${c}" transform="rotate(${a})"/>`).join('')}<circle r="3" fill="#ffd34d"/></g></g>`;
  const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity=".85"><ellipse cx="0" cy="0" rx="34" ry="12"/><ellipse cx="-12" cy="-8" rx="14" ry="12"/><ellipse cx="10" cy="-11" rx="17" ry="15"/></g>`;
  const palm = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="sway"><path d="M0 0Q6-30 2-62" stroke="#b07a4a" stroke-width="7" fill="none" stroke-linecap="round"/><g transform="translate(2 -62)" fill="#3fbf6a"><path d="M0 0Q-22-14-40-2Q-22-4 0 0Z"/><path d="M0 0Q22-14 40-2Q22-4 0 0Z"/><path d="M0 0Q-12-22-30-26Q-12-10 0 0Z"/><path d="M0 0Q12-22 30-26Q12-10 0 0Z"/><path d="M0 0Q0-24-4-32Q2-14 0 0Z"/></g></g></g>`;
  const boat = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="bob"><path d="M0 -26v24M0 -26l14 20H0" stroke="#fff" stroke-width="2" fill="#fff"/><path d="M-16 0h32l-6 7h-20z" fill="#ff8a6b"/></g></g>`;
  const W = {
    grove: { // Strawberry Grove: rolling pink hills, strawberry plants, flowers
      far: `${cloud(70, 60, 1.1)}${cloud(330, 40, 0.8)}<path d="M0 210Q70 150 150 190T300 175T400 190V400H0z" fill="#ffc9dc"/><path d="M0 230Q90 190 190 220T400 205V400H0z" fill="#ffb3cf"/>`,
      mid: `<path d="M0 270Q100 230 210 262T400 250V400H0z" fill="#ff9ec2"/>${[30, 120, 250, 350].map((x, i) => strawberryPlant(x, 262 - (i % 2) * 8, 0.55 + (i % 2) * 0.15)).join('')}`,
      near: `<path d="M0 330Q120 300 240 322T400 310V400H0z" fill="#f78fb6"/>${[20, 70, 340, 380].map((x, i) => strawberryPlant(x, 330 - i % 2 * 6, 0.85)).join('')}${[[45, 345, '#fff'], [110, 352, '#ffe14d'], [290, 344, '#fff'], [360, 352, '#ffd0e0'], [200, 360, '#fff']].map(([x, y, c]) => flower(x, y, 1.1, c)).join('')}`,
      petals: '#ff8fb5'
    },
    bay: {
      far: `${cloud(60, 50, 1)}${cloud(320, 70, 0.9)}<circle cx="320" cy="140" r="34" fill="#fff6c8" opacity=".9"/><path d="M0 220H400V400H0z" fill="#9fd4ff"/>${boat(100, 216, 0.8)}`,
      mid: `<path class="wave" d="M-40 250q20-10 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0V400H-40z" fill="#7cc0fb"/>${boat(300, 246, 1)}`,
      near: `<path d="M0 330Q120 304 240 326T400 312V400H0z" fill="#ffe3b0"/><path class="wave" d="M-40 336q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0V400H-40z" fill="#5fb0f5" opacity=".55"/>${[[40, 350, '#fff'], [360, 348, '#ffd0e0']].map(([x, y, c]) => flower(x, y, 1, c)).join('')}`,
      petals: '#ffffff'
    },
    isle: {
      far: `<circle cx="300" cy="120" r="40" fill="#fff3b0"/>${cloud(80, 60, 1)}<path d="M0 230H400V400H0z" fill="#8fd8ff"/><path d="M120 232Q200 200 280 232z" fill="#ffd56b"/>${palm(200, 226, 0.5)}`,
      mid: `<path d="M0 270Q100 240 210 266T400 255V400H0z" fill="#ffd56b"/>${palm(40, 268, 0.85)}${palm(360, 262, 0.75)}`,
      near: `<path d="M0 330Q120 306 240 326T400 314V400H0z" fill="#ffb02e"/>${[[60, 348, '#fff'], [330, 346, '#ff8ab0']].map(([x, y, c]) => flower(x, y, 1.1, c)).join('')}`,
      petals: '#ffe28a'
    }
  };
  const S = {
    build(el, id) {
      const w = W[id] || W.grove;
      el.innerHTML = `<div class="lay far">${svg('0 0 400 400', w.far, '')}</div><div class="lay mid">${svg('0 0 400 400', w.mid, '')}</div><div class="lay near">${svg('0 0 400 400', w.near, '')}</div>` +
        [0, 1, 2, 3, 4].map(i => `<i class="petal" style="left:${10 + i * 19}%;animation-delay:${-i * 3.7}s;animation-duration:${14 + i * 2}s;background:${w.petals}"></i>`).join('');
    },
    // small parallax from device tilt (Android needs no permission) or pointer, layers only, never the board
    parallax(el) {
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      const apply = () => { cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08; el.style.setProperty('--px', cx.toFixed(2)); el.style.setProperty('--py', cy.toFixed(2)); if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(apply); else raf = 0; };
      const go = () => { if (!raf) raf = requestAnimationFrame(apply); };
      window.addEventListener('deviceorientation', e => { if (e.gamma == null) return; tx = Math.max(-1, Math.min(1, e.gamma / 25)); ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); go(); });
      window.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1; go(); });
    }
  };
  window.JJScenery = S;
})();
