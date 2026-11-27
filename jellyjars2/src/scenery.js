/* Jelly Jars 2.0 - world backdrops. Decoration lives where the player can actually see it on a portrait phone:
   a sky band at the top (behind the HUD and jar) and a ground band at the bottom (around the tray).
   Each band is its own SVG sized to its band, so props are not cropped away. Motion is CSS only (cheap):
   swaying plants, drifting clouds and birds, rolling waves, a few petals, small tilt parallax. Battery saver stops it. */
(function () {
  'use strict';
  const band = (cls, vb, ar, inner) => `<div class="lay ${cls}"><svg viewBox="${vb}" preserveAspectRatio="${ar}" aria-hidden="true">${inner}</svg></div>`;
  const G = (x, y, s, inner, cls) => `<g transform="translate(${x} ${y}) scale(${s})"><g${cls ? ` class="${cls}"` : ''}>${inner}</g></g>`;
  // ---- props (drawn around their own origin, base at y=0) ----
  const berry = (c) => `<path d="M0 0c-7 0-9 9-4 15 2 3 6 3 8 0 5-6 3-15-4-15z" fill="${c || '#ff5f8f'}"/><path d="M-4 -1l4 3 4-3-4-2z" fill="#3f9a45"/><circle cx="-2" cy="6" r=".9" fill="#ffe08a"/><circle cx="2" cy="9" r=".9" fill="#ffe08a"/>`;
  const bush = `<path d="M0 0C-24-4-36-26-26-36C-16-32-6-20 0-8C6-20 16-32 26-36C36-26 24-4 0 0Z" fill="#59b85c"/><path d="M0 0C-8-18-6-38 0-44C6-38 8-18 0 0Z" fill="#4aa64f"/><g transform="translate(-17 -16)">${berry()}</g><g transform="translate(14 -12) scale(.85)">${berry('#ff7aa2')}</g><g transform="translate(-2 -30) scale(.7)">${berry()}</g>`;
  const flower = (c) => `<path d="M0 0V-16" stroke="#5fae5a" stroke-width="2.4"/><path d="M0 -6q-7-3-9 2q6 2 9-2z" fill="#6cc46a"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-5" rx="3.6" ry="5.5" fill="${c}" transform="translate(0 -16) rotate(${a})"/>`).join('')}<circle cy="-16" r="3" fill="#ffd34d"/>`;
  const tuft = (c) => `<path d="M-8 0Q-6-10-3-14Q-2-6 0 0Q2-12 5-16Q5-6 7 0Z" fill="${c}"/>`;
  const fence = `<g fill="#fff6ee" stroke="#f0c9d6" stroke-width="1.2">${[0, 14, 28, 42].map(x => `<path d="M${x - 4} 0V-22l4-5 4 5V0Z"/>`).join('')}<rect x="-6" y="-17" width="54" height="4" rx="2"/><rect x="-6" y="-8" width="54" height="4" rx="2"/></g>`;
  const mushroom = `<rect x="-3" y="-9" width="6" height="9" rx="3" fill="#fff6ee"/><path d="M-11-8a11 9 0 0 1 22 0z" fill="#ff6f91"/><circle cx="-4" cy="-13" r="2" fill="#fff"/><circle cx="4" cy="-11" r="1.6" fill="#fff"/>`;
  const cloud = `<ellipse cx="0" cy="0" rx="34" ry="11" fill="#fff"/><ellipse cx="-12" cy="-8" rx="14" ry="11" fill="#fff"/><ellipse cx="10" cy="-11" rx="17" ry="14" fill="#fff"/>`;
  const bird = `<path d="M-7 0q3.5-4 7 0q3.5-4 7 0" stroke="#7a6a8a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  const boat = `<path d="M0 -26v24M0 -26l14 20H0" stroke="#fff" stroke-width="2" fill="#fff"/><path d="M-16 0h32l-6 7h-20z" fill="#ff8a6b"/>`;
  const shell = `<path d="M0 0c-8 0-10-10-6-14c3 3 4 3 6 0c2 3 3 3 6 0c4 4 2 14-6 14z" fill="#ffd0dc"/><path d="M0 0V-12M-4 -1l-3-9M4 -1l3-9" stroke="#f3a9bd" stroke-width="1"/>`;
  const star = `<path d="M0-11l3 7 7 1-5 5 1.5 7L0-4l-6.5 3L-5-6l-5-5 7-1z" fill="#ff9f5a"/>`;
  const bucket = `<path d="M-9-16h18l-3 16h-12z" fill="#4fa3ff"/><path d="M-9-16q9-12 18 0" stroke="#2f60d6" stroke-width="1.6" fill="none"/><rect x="-10" y="-18" width="20" height="4" rx="2" fill="#2f60d6"/>`;
  const lighthouse = `<path d="M-6 0l2-34h8l2 34z" fill="#fff"/><path d="M-5.5 -10h11M-5 -20h10" stroke="#ff6f6f" stroke-width="4"/><rect x="-5" y="-40" width="10" height="7" rx="2" fill="#ffe28a"/><path d="M-6 -40l6-6 6 6z" fill="#ff6f6f"/>`;
  const palm = `<path d="M0 0Q8-34 2-70" stroke="#b07a4a" stroke-width="8" fill="none" stroke-linecap="round"/><g transform="translate(2 -70)" fill="#3fbf6a"><path d="M0 0Q-26-16-46-2Q-24-6 0 0Z"/><path d="M0 0Q26-16 46-2Q24-6 0 0Z"/><path d="M0 0Q-14-26-34-30Q-14-12 0 0Z"/><path d="M0 0Q14-26 34-30Q14-12 0 0Z"/><circle cx="-4" cy="4" r="4" fill="#8a5a2b"/><circle cx="4" cy="5" r="4" fill="#7a4a1b"/></g>`;
  const hibiscus = `<path d="M0 0V-14" stroke="#4f9a4a" stroke-width="2.4"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-7" rx="5" ry="7.5" fill="#ff5a7a" transform="translate(0 -16) rotate(${a})"/>`).join('')}<circle cy="-16" r="2.6" fill="#ffd34d"/>`;
  const ball = `<circle r="10" cy="-10" fill="#fff"/><path d="M-10-10a10 10 0 0 1 10-10v20a10 10 0 0 1-10-10z" fill="#ff6f91"/><path d="M0-20a10 10 0 0 1 10 10H0z" fill="#4fa3ff"/>`;
  const crab = `<ellipse cx="0" cy="-6" rx="10" ry="6" fill="#ff6a4d"/><circle cx="-4" cy="-13" r="2.2" fill="#40213b"/><circle cx="4" cy="-13" r="2.2" fill="#40213b"/><path d="M-10-6l-6-6M10-6l6-6" stroke="#ff6a4d" stroke-width="3" stroke-linecap="round"/>`;
  const wave = (y, c, o, h) => `<path class="wave" d="M-40 ${y}q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0V${h ? y + h : 300}H-40z" fill="${c}" opacity="${o || 1}"/>`;
  const W = {
    grove: {
      sky: `${G(60, 70, 1, cloud, 'drift')}${G(330, 40, .75, cloud, 'drift slow')}${G(250, 120, .5, cloud, 'drift')}${G(120, 40, 1, bird, 'fly')}${G(140, 52, .8, bird, 'fly')}<path d="M0 240Q60 200 120 222T240 214T400 226V240H0z" fill="#ffc9dc"/>`,
      back: `<path d="M0 70Q70 36 150 58T300 48T400 60V260H0z" fill="#ffb3cf"/>${G(30, 62, .55, bush, 'sway')}${G(370, 56, .5, bush, 'sway')}${G(200, 54, .45, bush, 'sway2')}`,
      front: `<path d="M0 150Q120 120 240 140T400 132V260H0z" fill="#f78fb6"/>${G(40, 176, .9, fence)}${G(18, 214, 1.05, bush, 'sway')}${G(384, 210, 1.1, bush, 'sway2')}${G(330, 200, 1, mushroom)}${G(70, 232, 1.2, flower('#fff'), 'sway2')}${G(120, 246, 1, flower('#ffe14d'), 'sway')}${G(290, 240, 1.1, flower('#fff'), 'sway')}${G(240, 252, .9, flower('#ffd0e0'), 'sway2')}${G(170, 236, 1, tuft('#ef7aa8'))}${G(350, 250, 1, tuft('#ef7aa8'))}`,
      petal: '#ff8fb5'
    },
    bay: {
      sky: `<circle cx="320" cy="70" r="30" fill="#fff6c8"/>${G(70, 60, 1, cloud, 'drift')}${G(230, 110, .6, cloud, 'drift slow')}${G(150, 50, 1, bird, 'fly')}${G(176, 62, .8, bird, 'fly')}${G(366, 238, .9, lighthouse)}<path d="M0 236H400V240H0z" fill="#9fd4ff"/>`,
      back: `<path d="M0 40H400V260H0z" fill="#9fd4ff"/>${G(110, 58, .9, boat, 'bob')}${wave(78, '#7cc0fb')}${G(300, 96, 1, boat, 'bob')}${wave(110, '#68b4f7')}`,
      front: `<path d="M0 160Q120 138 240 156T400 150V260H0z" fill="#ffe3b0"/>${wave(160, '#bfe6ff', .9, 10)}${G(40, 214, 1.2, shell)}${G(350, 226, 1.3, star)}${G(300, 198, 1, bucket)}${G(110, 244, 1, star)}${G(220, 236, 1.1, shell)}${G(70, 190, 1, tuft('#e9c98a'))}`,
      petal: '#ffffff'
    },
    isle: {
      sky: `<circle cx="300" cy="80" r="42" fill="#fff3b0"/><circle cx="300" cy="80" r="56" fill="#fff3b0" opacity=".35"/>${G(80, 60, 1, cloud, 'drift')}${G(200, 120, .55, cloud, 'drift slow')}${G(130, 44, 1, bird, 'fly')}<path d="M330 240q30-34 60 0z" fill="#9fdc8f"/><path d="M0 236H400V240H0z" fill="#8fd8ff"/>`,
      back: `<path d="M0 40H400V260H0z" fill="#8fd8ff"/>${wave(70, '#6cc6f5')}<path d="M0 110Q100 92 210 106T400 100V260H0z" fill="#ffd56b"/>${G(30, 112, .85, palm, 'sway')}${G(376, 108, .75, palm, 'sway2')}`,
      front: `<path d="M0 160Q120 140 240 156T400 150V260H0z" fill="#ffc24a"/>${G(-4, 250, 1.25, palm, 'sway2')}${G(404, 246, 1.2, palm, 'sway')}${G(90, 224, 1.2, hibiscus, 'sway')}${G(320, 220, 1.1, hibiscus, 'sway2')}${G(250, 244, 1, ball)}${G(150, 248, 1, crab, 'scuttle')}${G(200, 214, 1, tuft('#f0a830'))}`,
      petal: '#ffe28a'
    }
  };
  const S = {
    build(el, id) {
      const w = W[id] || W.grove;
      el.innerHTML = band('sky', '0 0 400 240', 'xMidYMin slice', w.sky) + band('back', '0 0 400 260', 'xMidYMax slice', w.back) + band('front', '0 0 400 260', 'xMidYMax slice', w.front) +
        [0, 1, 2, 3].map(i => `<i class="petal" style="left:${12 + i * 24}%;animation-delay:${-i * 4.1}s;animation-duration:${15 + i * 2}s;background:${w.petal}"></i>`).join('');
    },
    parallax(el) {
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      const apply = () => { cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08; el.style.setProperty('--px', cx.toFixed(2)); el.style.setProperty('--py', cy.toFixed(2)); raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.01 ? requestAnimationFrame(apply) : 0; };
      const go = () => { const b = document.body.classList; if (!raf && !b.contains('saver') && !b.contains('playing')) raf = requestAnimationFrame(apply); };
      window.addEventListener('deviceorientation', e => { if (e.gamma == null) return; const nx = Math.max(-1, Math.min(1, e.gamma / 25)), ny = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); if (Math.abs(nx - tx) + Math.abs(ny - ty) < 0.04) return; tx = nx; ty = ny; go(); }); // ignore hand tremor
      window.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1; go(); });
    }
  };
  window.JJScenery = S;
})();
