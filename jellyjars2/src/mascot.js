/* Jelly Jars 2.0 - full-body 3D mascots (three.js r128). Used on Home, inside the jar, unlocks, level complete, promo renders.
   Built from simple robust volumes (plush-friendly: no thin parts), one jelly shader (matcap + fake subsurface + rim + gloss),
   faces are embroidered-style canvas textures projected onto the front, swapped per expression (no per-frame redraw). */
(function () {
  'use strict';
  const T = THREE;
  const lin = h => new T.Color(h).convertSRGBToLinear();
  let MATCAP = null;
  function matcap() {
    if (MATCAP) return MATCAP;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), img = x.createImageData(S, S);
    const L = [-0.45, 0.6, 0.66], ll = Math.hypot(...L); L.forEach((v, i) => L[i] = v / ll);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const nx = (i + 0.5) / S * 2 - 1, ny = 1 - (j + 0.5) / S * 2, r2 = nx * nx + ny * ny, k = (j * S + i) * 4; img.data[k + 3] = 255; if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2), d = nx * L[0] + ny * L[1] + nz * L[2], hz = L[2] + 1, hl = Math.hypot(L[0], L[1], hz);
      const sp = Math.pow(Math.max(0, (nx * L[0] + ny * L[1] + nz * hz) / hl), 90) * 1.6 + Math.pow(Math.max(0, (nx * L[0] + ny * L[1] + nz * hz) / hl), 14) * 0.18 + Math.pow(Math.max(0, nx * 0.55 - ny * 0.35 + nz * 0.75), 40) * 0.3;
      img.data[k] = Math.min(255, (0.3 * Math.max(0, (d + 0.6) / 1.6) + 0.7 * Math.max(0, d)) * 255); img.data[k + 1] = Math.min(255, sp * 255); img.data[k + 2] = Math.min(255, Math.pow(1 - nz, 2.2) * 255);
    }
    x.putImageData(img, 0, 0); MATCAP = new T.CanvasTexture(c); MATCAP.minFilter = T.LinearFilter; MATCAP.generateMipmaps = false; return MATCAP;
  }
  const VS = `varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec3 vON;
    void main(){ vP = position; vON = normal;
    #ifdef USE_INSTANCING
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    #else
      vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal);
    #endif
    vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
  const FS = `uniform vec3 uColor; uniform vec3 uDeep; uniform vec3 uLight; uniform sampler2D uMatcap; uniform sampler2D uFace; uniform float uFaceOn; uniform vec3 uFace0; uniform float uBloom; uniform float uGloss; uniform float uSSS;
    varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec3 vON;
    void main(){
      vec3 n = normalize(vN), v = normalize(vV), x = normalize(vec3(v.z, 0.0, -v.x)), y = cross(v, x);
      vec3 mc = texture2D(uMatcap, vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5).rgb; float f = clamp(dot(n, v), 0.0, 1.0);
      vec3 col = mix(uDeep, uColor, 0.2 + 0.8 * mc.r);
      col = mix(col, uLight, uSSS * pow(f, 2.6));                   // light glowing through the jelly core
      col = mix(col, uDeep * 0.85, pow(1.0 - f, 1.6) * 0.35);      // denser colour toward the edges
      col += uLight * 0.45 * smoothstep(0.55, 1.0, dot(n, normalize(vec3(0.45, -0.6, 0.65))));  // light caught inside, lower right (gummy look)
      col += mix(uColor, vec3(1.0), 0.55) * pow(1.0 - f, 3.0) * 0.55; // thin translucent edges
      float fa = 0.0;
      if (uFaceOn > 0.5 && vON.z > 0.05) {                         // embroidered face, projected from the front
        vec2 uv = (vP.xy - uFace0.xy) / uFace0.z * 0.5 + 0.5; vec4 t = texture2D(uFace, uv);
        fa = t.a * smoothstep(0.05, 0.3, vON.z) * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0); col = mix(col, t.rgb, fa);
      }
      col = mix(col, vec3(0.86, 0.9, 1.0), uBloom * (0.12 + 0.45 * pow(1.0 - f, 2.0)));  // blueberry bloom (powdery)
      col += vec3(1.0) * clamp(mc.g * uGloss * (1.0 - uBloom * 0.55) * (1.0 - 0.85 * fa), 0.0, 1.0);
      gl_FragColor = vec4(col, 1.0);
    }`;
  function jellyMat(o) {
    return new T.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: {
      uColor: { value: lin(o.color) }, uDeep: { value: lin(o.deep) }, uLight: { value: lin(o.light || o.color) }, uMatcap: { value: matcap() },
      uFace: { value: null }, uFaceOn: { value: 0 }, uFace0: { value: new T.Vector3(0, 0, 1) }, uBloom: { value: o.bloom || 0 }, uGloss: { value: o.gloss == null ? 1 : o.gloss }, uSSS: { value: o.sss == null ? 0.45 : o.sss } } });
  }
  // ---------- embroidered faces (canvas), one texture per expression ----------
  const INK = '#40213b';
  function faceTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.scale(2, 2); x.translate(128, 128); x.scale(1.65, 1.65); x.translate(-128, -140); x.lineCap = 'round'; x.lineJoin = 'round'; draw(x); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }
  const E = {
    dot(x, cx, cy, s) { s = s || 1; x.fillStyle = INK; x.beginPath(); x.ellipse(cx, cy, 13 * s, 16 * s, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx + 4.5 * s, cy - 6 * s, 5 * s, 5.5 * s, 0, 0, 7); x.fill(); x.beginPath(); x.arc(cx - 4 * s, cy + 6 * s, 2.2 * s, 0, 7); x.fill(); },
    arc(x, cx, cy) { x.strokeStyle = INK; x.lineWidth = 8; x.beginPath(); x.arc(cx, cy + 8, 13, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); },
    closed(x, cx, cy) { x.strokeStyle = INK; x.lineWidth = 8; x.beginPath(); x.arc(cx, cy - 8, 13, Math.PI * 0.15, Math.PI * 0.85); x.stroke(); },
    wide(x, cx, cy) { x.fillStyle = '#fff'; x.strokeStyle = INK; x.lineWidth = 5; x.beginPath(); x.arc(cx, cy, 17, 0, 7); x.fill(); x.stroke(); x.fillStyle = INK; x.beginPath(); x.arc(cx, cy + 3, 8, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + 3, cy, 2.5, 0, 7); x.fill(); },
    star(x, cx, cy) { x.fillStyle = '#ffc21f'; x.strokeStyle = INK; x.lineWidth = 4; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 8 : 19, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke(); },
    brow(x, x1, y1, x2, y2) { x.strokeStyle = INK; x.lineWidth = 6.5; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); }
  };
  const M = {
    tongue(x) { x.fillStyle = INK; x.beginPath(); x.moveTo(108, 160); x.quadraticCurveTo(128, 190, 148, 160); x.closePath(); x.fill(); x.fillStyle = '#ff7a95'; x.strokeStyle = INK; x.lineWidth = 3; x.beginPath(); x.moveTo(126, 168); x.quadraticCurveTo(137, 192, 146, 167); x.fill(); x.stroke(); },
    grin(x) { x.fillStyle = INK; x.beginPath(); x.moveTo(100, 158); x.quadraticCurveTo(128, 205, 156, 158); x.closePath(); x.fill(); x.fillStyle = '#ff7a95'; x.beginPath(); x.ellipse(128, 178, 15, 8, 0, 0, Math.PI); x.fill(); },
    w(x) { x.strokeStyle = INK; x.lineWidth = 6; x.beginPath(); x.moveTo(114, 162); x.quadraticCurveTo(121, 173, 128, 163); x.quadraticCurveTo(135, 173, 142, 162); x.stroke(); },
    o(x, big) { x.fillStyle = INK; x.beginPath(); x.ellipse(128, 168, big ? 14 : 8, big ? 18 : 10, 0, 0, 7); x.fill(); if (big) { x.fillStyle = '#ff7a95'; x.beginPath(); x.ellipse(128, 178, 9, 6, 0, 0, 7); x.fill(); } },
    wobble(x) { x.strokeStyle = INK; x.lineWidth = 6; x.beginPath(); x.moveTo(110, 170); x.quadraticCurveTo(119, 160, 128, 170); x.quadraticCurveTo(137, 180, 146, 170); x.stroke(); },
    frown(x) { x.strokeStyle = INK; x.lineWidth = 6.5; x.beginPath(); x.moveTo(112, 176); x.quadraticCurveTo(128, 160, 144, 176); x.stroke(); }
  };
  function cheeks(x, big) { x.fillStyle = 'rgba(255,105,140,0.55)'; x.beginPath(); x.ellipse(70, 152, big ? 24 : 17, big ? 14 : 10, 0, 0, 7); x.ellipse(186, 152, big ? 24 : 17, big ? 14 : 10, 0, 0, 7); x.fill(); }
  function makeFaces(id) {
    const big = id === 'bluu', L = 92, R = 164, Y = 118, out = {};
    const add = (k, f) => out[k] = faceTex(x => { cheeks(x, big); f(x); });
    if (id === 'rosie') { add('base', x => { E.arc(x, L, Y); E.dot(x, R, Y); M.tongue(x); }); add('blink', x => { E.arc(x, L, Y); E.closed(x, R, Y); M.tongue(x); }); }
    else { add('base', x => { E.dot(x, L + 6, Y + 6, 0.8); E.dot(x, R - 6, Y + 6, 0.8); M.w(x); }); add('blink', x => { E.closed(x, L + 6, Y + 6); E.closed(x, R - 6, Y + 6); M.w(x); }); }
    add('happy', x => { E.arc(x, L, Y); E.arc(x, R, Y); M.grin(x); });
    add('worried', x => { E.wide(x, L, Y); E.wide(x, R, Y); E.brow(x, L - 16, Y - 28, L + 12, Y - 34); E.brow(x, R + 16, Y - 28, R - 12, Y - 34); M.wobble(x); });
    add('excited', x => { E.star(x, L, Y); E.star(x, R, Y); M.o(x, true); });
    add('sleepy', x => { E.closed(x, L, Y); E.closed(x, R, Y); M.o(x, false); });
    return out;
  }
  // ---------- models ----------
  function lathe(points, seg) { const g = new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), seg || 56); g.computeVertexNormals(); return g; }
  function smooth(pts, n) { const c = new T.SplineCurve(pts.map(([r, y]) => new T.Vector2(r, y))); return c.getPoints(n || 40).map(v => [Math.max(0, v.x), v.y]); }
  function leafGeo() { const s = new T.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.22, 0.12, 0.42, 0); s.quadraticCurveTo(0.22, -0.12, 0, 0); const g = new T.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3, curveSegments: 12 }); g.translate(0, 0, -0.025); g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g; }
  function starGeo(R, r, depth) { const s = new T.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? s.lineTo(px, py) : s.moveTo(px, py); } s.closePath(); const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 6 }); g.computeVertexNormals(); return g; }
  const DEF = {
    rosie: { name: 'Rosie', color: '#ff5f8f', deep: '#c22a5a', light: '#ffc2d4', face0: [0, 0.2, 0.46], build(m, g) {
      const prof = smooth([[0, -1.02], [0.3, -0.86], [0.62, -0.5], [0.88, -0.08], [0.98, 0.3], [0.9, 0.6], [0.62, 0.8], [0.28, 0.84], [0.0, 0.79]], 48);
      const lg0 = lathe(prof); lg0.rotateY(Math.PI); const body = new T.Mesh(lg0, m.body); body.scale.set(1, 1, 0.84); g.add(body); m.bodyMesh = body;
      const seedMat = jellyMat({ color: '#fff0b0', deep: '#e8c060', light: '#fffbe6', sss: 0.2, gloss: 0.3 });
      const sg = new T.SphereGeometry(0.05, 10, 8), seeds = new T.InstancedMesh(sg, seedMat, 40), m4 = new T.Matrix4(), q = new T.Quaternion(); let n = 0;
      for (let row = 0; row < 6; row++) { const y = -0.78 + row * 0.24, count = 6 + row; for (let i = 0; i < count; i++) { const a = (i + (row % 2) * 0.5) / count * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.95 && y > -0.45 && y < 0.62) continue; let r = 0; for (let k = 1; k < prof.length; k++) if (prof[k][1] >= y) { const t = (y - prof[k - 1][1]) / (prof[k][1] - prof[k - 1][1]); r = prof[k - 1][0] + (prof[k][0] - prof[k - 1][0]) * t; break; } const p = new T.Vector3(Math.sin(a) * r * 1.0, y, Math.cos(a) * r * 0.84), nrm = new T.Vector3(Math.sin(a), 0.15, Math.cos(a)).normalize(); q.setFromUnitVectors(new T.Vector3(0, 0, 1), nrm); m4.compose(p, q, new T.Vector3(0.7, 1.05, 0.3)); if (n < 40) seeds.setMatrixAt(n++, m4); } }
      seeds.count = n; g.add(seeds);
      const leafMat = jellyMat({ color: '#5cc860', deep: '#2f8a3a', light: '#a8f0a0', sss: 0.3 }), lg = leafGeo(); m.leaves = [];
      for (let i = 0; i < 5; i++) { const piv = new T.Group(); piv.position.set(0, 0.84, 0); piv.rotation.y = i / 5 * Math.PI * 2 + 0.3; const lf = new T.Mesh(lg, leafMat); lf.scale.set(2.0, 1.4, 2.2); lf.position.x = 0.05; lf.rotation.z = -0.32; piv.add(lf); g.add(piv); m.leaves.push(piv); }
      const stem = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 0.32, 10), leafMat); stem.position.set(0.02, 0.97, 0); stem.rotation.z = -0.25; g.add(stem); m.stem = stem;
    } },
    bluu: { name: 'Bluu', color: '#4f8dff', deep: '#2448b8', light: '#a9c9ff', bloom: 0.55, face0: [0, -0.02, 0.5], build(m, g) {
      const body = new T.Mesh(new T.SphereGeometry(1, 56, 40), m.body); body.scale.set(1, 0.94, 0.95); g.add(body); m.bodyMesh = body;
      const crownMat = jellyMat({ color: '#2f46b8', deep: '#1a2470', light: '#6f86ff', sss: 0.25, gloss: 0.8 });
      const crown = new T.Group(); crown.position.y = 0.86; g.add(crown); m.crown = crown; const pg = new T.SphereGeometry(1, 20, 14);
      for (let i = 0; i < 5; i++) { const piv = new T.Group(); piv.rotation.y = i / 5 * Math.PI * 2; const pt = new T.Mesh(pg, crownMat); pt.scale.set(0.13, 0.3, 0.09); pt.position.set(0, 0.17, 0.17); pt.rotation.x = 0.75; piv.add(pt); crown.add(piv); }
      const nub = new T.Mesh(new T.SphereGeometry(0.2, 18, 12), crownMat); nub.scale.y = 0.55; nub.position.y = 0.9; g.add(nub);
      const footMat = jellyMat({ color: '#3a6fe0', deep: '#1f3c9c', light: '#8fb3ff', bloom: 0.4 });
      for (const s of [-1, 1]) { const f = new T.Mesh(new T.SphereGeometry(0.22, 20, 14), footMat); f.scale.set(1.2, 0.6, 1.1); f.position.set(s * 0.42, -0.9, 0.16); g.add(f); }
    } }
  };
  function create(id) {
    const d = DEF[id], g = new T.Group(), inner = new T.Group(); g.add(inner);
    const m = { id, def: d, group: g, inner, body: jellyMat({ color: d.color, deep: d.deep, light: d.light, bloom: d.bloom }), faces: makeFaces(id), expr: 'base', t: Math.random() * 10, blinkT: 2 + Math.random() * 2, jumpT: -1 };
    m.body.uniforms.uFaceOn.value = 1; m.body.uniforms.uFace0.value.set(...d.face0); m.body.uniforms.uFace.value = m.faces.base;
    d.build(m, inner);
    // soft contact shadow
    const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sx = sc.getContext('2d'), gr = sx.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(110,30,70,0.38)'); gr.addColorStop(1, 'rgba(110,30,70,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
    const sh = new T.Mesh(new T.PlaneGeometry(2.3, 2.3), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = -1.04; sh.renderOrder = -1; g.add(sh); m.shadow = sh;
    m.setExpr = e => { m.expr = e; m.body.uniforms.uFace.value = m.faces[e] || m.faces.base; };
    m.jump = () => { m.jumpT = 0; m.prevExpr = m.expr; m.setExpr('excited'); };
    // idle: breathing, gentle sway, leaf wiggle, blinking. jump: anticipation squash -> stretch up -> land squash -> wobble settle
    m.update = dt => {
      m.t += dt; const t = m.t; let sy = 1 + 0.028 * Math.sin(t * 2.3), sxz = 1 - 0.014 * Math.sin(t * 2.3), y = 0;
      inner.rotation.z = 0.035 * Math.sin(t * 1.1); inner.rotation.y = 0.06 * Math.sin(t * 0.7);
      if (m.jumpT >= 0) {
        m.jumpT += dt; const k = m.jumpT, e = (a, b) => Math.min(1, Math.max(0, (k - a) / (b - a)));
        if (k < 0.16) { const p = Math.sin(e(0, 0.16) * Math.PI / 2); sy = 1 - 0.24 * p; sxz = 1 + 0.16 * p; }
        else if (k < 0.62) { const p = e(0.16, 0.62); y = Math.sin(p * Math.PI) * 0.85; const st = 1 - Math.abs(p - 0.5) * 2; sy = 1 + 0.2 * st; sxz = 1 - 0.1 * st; }
        else if (k < 0.74) { const p = Math.sin(e(0.62, 0.74) * Math.PI); sy = 1 - 0.28 * p; sxz = 1 + 0.2 * p; }
        else { const p = k - 0.74, w = Math.exp(-p * 6) * Math.sin(p * 26); sy = 1 + 0.12 * w; sxz = 1 - 0.07 * w; if (k > 1.5) { m.jumpT = -1; m.setExpr(m.prevExpr === 'excited' ? 'base' : m.prevExpr); } }
      }
      inner.scale.set(sxz, sy, sxz); inner.position.y = y + (sy - 1) * 1.0 * 0.98 * (1);
      inner.position.y = y - (1 - sy) * 1.0; // keep feet on the ground while squashing
      m.shadow.scale.setScalar(1 - Math.min(0.5, y * 0.35)); m.shadow.material.opacity = 1 - Math.min(0.6, y * 0.4);
      if (m.leaves) m.leaves.forEach((l, i) => l.rotation.x = 0.06 * Math.sin(t * 3 + i));
      if (m.jumpT < 0 && m.expr === 'base') { m.blinkT -= dt; if (m.blinkT < 0) { m.body.uniforms.uFace.value = m.faces.blink; if (m.blinkT < -0.12) { m.body.uniforms.uFace.value = m.faces.base; m.blinkT = 2.5 + Math.random() * 2.5; } } }
    };
    return m;
  }
  window.JJMascot = { create, ids: Object.keys(DEF), DEF };
})();
