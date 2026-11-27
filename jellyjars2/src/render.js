/* Jelly Jars 2.0 - 3D view (three.js r128, global THREE).
   Draw-call budget ~12: board frame, board tray, sockets (instanced), shadows (instanced), jellies (instanced, all characters),
   ghost (instanced), jar (glass, fill, lid, label, bubbles), glow, particles (atlas points).
   Characters, faces, blinking, breathing and squash are all in one shader: no textures per character, no lights, no shadow maps. */
(function () {
  'use strict';
  const T = THREE;
  // flavour palette (sRGB): 1 strawberry, 2 blueberry, 3 mango, 4 grape, 5 lime, 6 orange, 7 jar jelly, 8 crate
  const PAL = [null, '#ff5f8f', '#4fa3ff', '#ffc93c', '#a67cff', '#6fd65a', '#ff9440', '#ff7ab8', '#e6b47a'];
  const NAMES = [null, 'Strawberry', 'Blueberry', 'Mango', 'Grape', 'Lime', 'Orange'];
  const N = 8, BOX = 0.9, BZ = 0.3;
  const TRAY_Y = -6.55, TRAY_X = [-3.1, 0, 3.1], TRAY_S = 0.66;
  const JAR_POS = new T.Vector3(0, 6.15, 0.4);
  const lin = h => new T.Color(h).convertSRGBToLinear();

  // ---------- procedural textures ----------
  function matcapTex() { // r = diffuse (soft key from top-left), g = specular, b = rim
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), img = x.createImageData(S, S);
    const L = [-0.4, 0.6, 0.7], ll = Math.hypot(...L); L.forEach((v, i) => L[i] = v / ll);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const nx = (i + 0.5) / S * 2 - 1, ny = 1 - (j + 0.5) / S * 2, r2 = nx * nx + ny * ny, k = (j * S + i) * 4; img.data[k + 3] = 255;
      if (r2 > 1) continue; const nz = Math.sqrt(1 - r2), d = nx * L[0] + ny * L[1] + nz * L[2];
      const wrap = Math.max(0, (d + 0.6) / 1.6), hz = L[2] + 1, hl = Math.hypot(L[0], L[1], hz);
      const sp = Math.pow(Math.max(0, (nx * L[0] + ny * L[1] + nz * hz) / hl), 70) * 1.5 + Math.pow(Math.max(0, nx * 0.5 - ny * 0.5 + nz * 0.7), 30) * 0.25;
      img.data[k] = Math.min(255, (0.35 * wrap + 0.65 * Math.max(0, d)) * 255); img.data[k + 1] = Math.min(255, sp * 255); img.data[k + 2] = Math.min(255, Math.pow(1 - nz, 2) * 255);
    }
    x.putImageData(img, 0, 0); const t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; t.generateMipmaps = false; return t;
  }
  function blobTex(inner, outer) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 1, 32, 32, 31); g.addColorStop(0, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); }
  function atlasTex() { // 2x2: droplet, star, heart, sparkle (white, tinted in shader)
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 2; const x = c.getContext('2d'); x.fillStyle = '#fff';
    const at = (i, f) => { x.save(); x.translate((i % 2) * S + S / 2, Math.floor(i / 2) * S + S / 2); f(); x.restore(); };
    at(0, () => { x.beginPath(); x.arc(0, 10, 40, 0, 7); x.moveTo(-34, -10); x.quadraticCurveTo(0, -80, 34, -10); x.fill(); });
    at(1, () => { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 54, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.lineJoin = 'round'; x.lineWidth = 12; x.strokeStyle = '#fff'; x.stroke(); x.fill(); });
    at(2, () => { x.beginPath(); x.moveTo(0, 46); x.bezierCurveTo(-70, -2, -36, -60, 0, -22); x.bezierCurveTo(36, -60, 70, -2, 0, 46); x.fill(); });
    at(3, () => { x.beginPath(); x.moveTo(0, -58); x.quadraticCurveTo(6, -6, 58, 0); x.quadraticCurveTo(6, 6, 0, 58); x.quadraticCurveTo(-6, 6, -58, 0); x.quadraticCurveTo(-6, -6, 0, -58); x.fill(); });
    const t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; return t;
  }
  function roundedBox(w, h, d, r, seg) {
    const g = new T.BoxGeometry(1, 1, 1, seg, seg, seg), p = g.attributes.position, v = new T.Vector3(), q = new T.Vector3();
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.set(v.x * w, v.y * h, v.z * d); q.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z))); const n = v.clone().sub(q); if (n.lengthSq() > 1e-9) n.normalize().multiplyScalar(r); v.copy(q).add(n); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  }
  function roundRectShape(W, H, R) { const s = new T.Shape(), x0 = -W / 2, y0 = -H / 2; s.moveTo(x0 + R, y0); s.lineTo(x0 + W - R, y0); s.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + R); s.lineTo(x0 + W, y0 + H - R); s.quadraticCurveTo(x0 + W, y0 + H, x0 + W - R, y0 + H); s.lineTo(x0 + R, y0 + H); s.quadraticCurveTo(x0, y0 + H, x0, y0 + H - R); s.lineTo(x0, y0 + R); s.quadraticCurveTo(x0, y0, x0 + R, y0); return s; }

  // ---------- the jelly / material shader ----------
  const VS = `
    attribute vec3 aColor; attribute vec4 aAnim; // x wobble, y phase, z flash, w face code (flavour + 10*mood + 100*star)
    uniform float uTime; uniform float uBreath;
    varying vec3 vN; varying vec3 vV; varying vec3 vColor; varying vec3 vL; varying vec3 vON; varying vec3 vAF;
    void main(){
      vec3 p = position;
      #ifdef INST
        float ph = aAnim.y; float w = aAnim.x * sin(uTime*15.0 + ph);
        float h = clamp(p.z / 0.45 * 0.5 + 0.5, 0.0, 1.0);
        float br = uBreath * 0.022 * sin(uTime*2.3 + ph*2.0);
        p.xy *= 1.0 + w*0.5*h - br*0.5; p.z *= 1.0 - w*0.55 + br;
        p.x += aAnim.x * 0.3 * sin(uTime*10.0 + ph*1.7) * h;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
        vColor = aColor; vAF = vec3(aAnim.z, aAnim.w, ph);
      #else
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vColor = uColor; vAF = vec3(0.0);
      #endif
      vL = position; vON = normal; vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const FS = `
    uniform sampler2D uMatcap; uniform float uAlpha; uniform float uGloss; uniform float uSSS; uniform float uInvert; uniform float uTime;
    varying vec3 vN; varying vec3 vV; varying vec3 vColor; varying vec3 vL; varying vec3 vON; varying vec3 vAF;
    float disc(vec2 p, vec2 c, float r){ return 1.0 - smoothstep(r - 0.01, r + 0.01, length(p - c)); }
    float ring(vec2 p, vec2 c, float r, float t){ return 1.0 - smoothstep(t - 0.008, t + 0.008, abs(length(p - c) - r)); }
    float seg(vec2 p, vec2 a, vec2 b, float t){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return 1.0 - smoothstep(t - 0.008, t + 0.008, length(pa - ba*h)); }
    float star(vec2 p, float r){ float a = atan(p.x, p.y); float s = r*(0.6 + 0.4*abs(cos(a*2.5))); return 1.0 - smoothstep(s - 0.01, s + 0.01, length(p)); }
    void main(){
      vec3 ink = vec3(0.22, 0.1, 0.2);
      vec3 n = normalize(vN); vec3 v = normalize(vV);
      if (uInvert > 0.5) n.xy = -n.xy * 0.7;
      vec3 x = normalize(vec3(v.z, 0.0, -v.x)); vec3 y = cross(v, x);
      vec3 mc = texture2D(uMatcap, vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5).rgb;
      float facing = clamp(dot(n, v), 0.0, 1.0);
      vec3 base = vColor; float gloss = uGloss;
      #ifdef INST
      float code = vAF.y; float fl = mod(code, 10.0); float mood = mod(floor(code/10.0), 10.0); float marked = step(99.5, code);
      if (fl > 7.5) { // crate: candy-wood with planks
        float pl = smoothstep(0.02, 0.0, abs(fract(vL.y*2.2 + 0.5) - 0.5) - 0.2); base *= 0.86 + 0.14*pl; gloss *= 0.35;
        float cr = step(abs(vL.x - vL.y), 0.05) + step(abs(vL.x + vL.y), 0.05); base = mix(base, base*0.72, clamp(cr,0.0,1.0)*step(0.3, vON.z));
      }
      #endif
      vec3 col = base * (0.5 + 0.7*mc.r);
      col += base * uSSS * pow(facing, 2.0);
      col += mix(base, vec3(1.0), 0.6) * mc.b * 0.4;
      #ifdef INST
      if (fl > 0.5 && fl < 7.5 && vON.z > 0.55) {
        vec2 f = vL.xy;
        float blink = step(fract(uTime*0.23 + vAF.z*0.37), 0.022);
        vec3 c = col;
        if (fl < 1.5) { // strawberry: seeds + leaf
          vec2 g = fract(f*9.0 + 0.5) - 0.5; float seeds = step(length(g), 0.07) * step(0.2, abs(f.y + 0.02) + abs(f.x)*0.6) * step(f.y, 0.25);
          c = mix(c, vec3(1.0, 0.9, 0.55), seeds*0.75);
          float leaf = disc(f, vec2(-0.06, 0.36), 0.075) + disc(f, vec2(0.06, 0.36), 0.075); c = mix(c, vec3(0.35, 0.78, 0.35), clamp(leaf,0.0,1.0));
        } else if (fl < 2.5) { // blueberry: little crown
          c = mix(c, base*0.55, star(f - vec2(0.0, 0.33), 0.075));
        } else if (fl < 3.5) { // mango: ripe blush
          c = mix(c, vec3(1.0, 0.45, 0.25), smoothstep(0.1, 0.55, f.x - f.y*0.8) * 0.45);
        } else if (fl < 4.5) { // grape: bubbly highlights
          c += (disc(f, vec2(-0.27, 0.27), 0.06) + disc(f, vec2(-0.17, 0.33), 0.04) + disc(f, vec2(0.3, -0.28), 0.04)) * 0.25;
        } else if (fl < 5.5) { // lime: citrus specks + side leaf
          vec2 g = fract(f*11.0) - 0.5; c += step(length(g), 0.06) * 0.08;
          c = mix(c, vec3(0.2, 0.55, 0.22), disc(f, vec2(0.3, 0.32), 0.06));
        } else if (fl < 6.5) { // orange: peel dimples
          vec2 g = fract(f*13.0 + 0.3) - 0.5; c *= 1.0 - step(length(g), 0.08) * 0.08;
        }
        vec2 eL = vec2(-0.13, 0.06), eR = vec2(0.13, 0.06);
        float eyes = 0.0, shine = 0.0, lines = 0.0, er = 0.062, m = mood;
        bool happyEyes = (m > 2.5) || (fl > 2.5 && fl < 3.5 && m < 0.5) || fl > 6.5;
        bool sleepyEyes = (fl > 3.5 && fl < 4.5 && m < 0.5);
        if (m > 1.5 && m < 2.5) { lines = seg(f, eL - vec2(0.05, 0.0), eL + vec2(0.05, 0.0), 0.016) + seg(f, eR - vec2(0.05, 0.0), eR + vec2(0.05, 0.0), 0.016); }
        else if (happyEyes) { lines = ring(f, eL - vec2(0.0, 0.03), 0.05, 0.016) * step(eL.y - 0.02, f.y) + ring(f, eR - vec2(0.0, 0.03), 0.05, 0.016) * step(eR.y - 0.02, f.y); }
        else if (sleepyEyes || blink > 0.5) { lines = ring(f, eL + vec2(0.0, 0.03), 0.05, 0.015) * step(f.y, eL.y) + ring(f, eR + vec2(0.0, 0.03), 0.05, 0.015) * step(f.y, eR.y); }
        else {
          if (fl > 5.5 && fl < 6.5) er = 0.078; if (fl > 1.5 && fl < 2.5) er = 0.05; if (m > 0.5 && m < 1.5) er = 0.075;
          vec2 look = (fl > 1.5 && fl < 2.5) ? vec2(0.01, -0.02) : vec2(0.0);
          eyes = disc(f, eL, er) + disc(f, eR, er);
          shine = disc(f, eL + look + vec2(0.022, 0.025), er*0.38) + disc(f, eR + look + vec2(0.022, 0.025), er*0.38);
          if (fl > 5.5 && fl < 6.5) shine += disc(f, eL + vec2(-0.025, -0.025), 0.013) + disc(f, eR + vec2(-0.025, -0.025), 0.013);
          if (fl > 4.5 && fl < 5.5) { eyes *= step(f.y, eL.y + 0.02); lines += seg(f, vec2(0.07, 0.15), vec2(0.2, 0.18), 0.014); }
        }
        c = mix(c, ink, clamp(eyes + lines, 0.0, 1.0)); c = mix(c, vec3(1.0), clamp(shine, 0.0, 1.0) * clamp(eyes, 0.0, 1.0));
        vec2 mo = vec2(0.0, -0.1); float mouth = 0.0; float fill = 0.0;
        if (m > 1.5 && m < 2.5) mouth = ring(f, mo - vec2(0.0, 0.09), 0.07, 0.014) * step(mo.y - 0.06, f.y);
        else if (m > 0.5 && m < 1.5) fill = disc(f, mo + vec2(0.0, -0.01), 0.035);
        else if (m > 2.5 || (fl > 2.5 && fl < 3.5)) fill = disc(f, mo + vec2(0.0, 0.02), 0.085) * step(f.y, mo.y + 0.02);
        else if (fl < 1.5) fill = disc(f, mo + vec2(0.0, 0.015), 0.06) * step(f.y, mo.y + 0.015);
        else if (fl < 2.5) mouth = ring(f, mo + vec2(-0.025, 0.02), 0.025, 0.011) * step(f.y, mo.y + 0.02) + ring(f, mo + vec2(0.025, 0.02), 0.025, 0.011) * step(f.y, mo.y + 0.02);
        else if (fl < 4.5) fill = disc(f, mo + vec2(0.0, -0.005), 0.028);
        else if (fl < 5.5) mouth = ring(f, mo + vec2(0.05, 0.05), 0.07, 0.013) * step(f.y, mo.y) * step(0.0, f.x);
        else if (fl < 6.5) fill = disc(f, mo + vec2(0.0, -0.01), 0.045);
        else mouth = ring(f, mo + vec2(0.0, 0.04), 0.06, 0.013) * step(f.y, mo.y);
        c = mix(c, ink, clamp(mouth + fill, 0.0, 1.0));
        if (fill > 0.0) c = mix(c, vec3(1.0, 0.45, 0.55), disc(f, mo + vec2(0.0, -0.055), 0.04) * fill);
        float bl = (fl > 1.5 && fl < 2.5) ? 0.55 : 0.3;
        c = mix(c, vec3(1.0, 0.5, 0.62), (disc(f, vec2(-0.25, -0.05), 0.06) + disc(f, vec2(0.25, -0.05), 0.06)) * bl);
        col = c;
      }
      if (marked > 0.5 && vON.z > 0.4) { float s = star(vL.xy - vec2(0.22, 0.24), 0.15 + 0.015*sin(uTime*5.0)); col = mix(col, vec3(1.0, 0.82, 0.2), s); col += s * 0.25; }
      col = mix(col, vec3(1.0), vAF.x);
      #endif
      col = mix(col, vec3(1.0), clamp(mc.g * gloss, 0.0, 1.0));
      gl_FragColor = vec4(col, uAlpha);
    }`;
  function mat(o) {
    return new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBreath: { value: 1 }, uMatcap: { value: View.matcap }, uAlpha: { value: o.alpha || 1 }, uGloss: { value: o.gloss == null ? 1 : o.gloss }, uSSS: { value: o.sss == null ? 0.3 : o.sss }, uInvert: { value: o.invert ? 1 : 0 }, uColor: { value: lin(o.color || '#ffffff') } },
      vertexShader: (o.instanced ? '' : 'uniform vec3 uColor;\n') + VS, fragmentShader: FS, defines: o.instanced ? { INST: 1 } : {},
      transparent: (o.alpha || 1) < 1, depthWrite: (o.alpha || 1) >= 1
    });
  }

  function Pool(geo, material, max) {
    const mesh = new T.InstancedMesh(geo, material, max); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false;
    const col = new T.InstancedBufferAttribute(new Float32Array(max * 3), 3), anim = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    col.setUsage(T.DynamicDrawUsage); anim.setUsage(T.DynamicDrawUsage); geo.setAttribute('aColor', col); geo.setAttribute('aAnim', anim);
    const items = [], m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pos = new T.Vector3(), sc = new T.Vector3();
    return {
      mesh, items, max,
      add(o) { const b = Object.assign({ x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rx: 0, ry: 0, rz: 0, c: new T.Color(1, 1, 1), wob: 0, ph: Math.random() * 6.28, flash: 0, fl: 0, mood: 0, mark: 0, alive: true, shadow: true }, o); items.push(b); return b; },
      sync() {
        let n = 0;
        for (let i = 0; i < items.length && n < max; i++) {
          const b = items[i]; if (!b.alive) continue;
          pos.set(b.x, b.y, b.z); sc.set(b.sx, b.sy, b.sz); e.set(b.rx, b.ry, b.rz); q.setFromEuler(e); m4.compose(pos, q, sc);
          mesh.setMatrixAt(n, m4); col.setXYZ(n, b.c.r, b.c.g, b.c.b); anim.setXYZW(n, b.wob, b.ph, b.flash, b.fl + 10 * b.mood + 100 * b.mark); n++;
        }
        if (items.length > 48 && n < items.length * 0.6) for (let i = items.length - 1; i >= 0; i--) if (!items[i].alive) items.splice(i, 1);
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true; col.needsUpdate = true; anim.needsUpdate = true; return n;
      }
    };
  }

  function Particles(max, tex) {
    const g = new T.BufferGeometry(), P = new Float32Array(max * 3), C = new Float32Array(max * 4), S = new Float32Array(max * 2);
    g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('aC', new T.BufferAttribute(C, 4)); g.setAttribute('aS', new T.BufferAttribute(S, 2));
    const m = new T.ShaderMaterial({
      uniforms: { uScale: { value: 300 }, uTex: { value: tex } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 aC; attribute vec2 aS; uniform float uScale; varying vec4 vC; varying float vT;
        void main(){ vC = aC; vT = aS.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aS.x * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vC; varying float vT;
        void main(){ vec2 cell = vec2(mod(vT, 2.0), floor(vT / 2.0)); vec2 uv = vec2((gl_PointCoord.x + cell.x) * 0.5, 1.0 - (gl_PointCoord.y + cell.y) * 0.5);
          vec4 t = texture2D(uTex, uv); if (t.a < 0.02) discard; float hl = vT < 0.5 ? smoothstep(0.3, 0.0, length(gl_PointCoord - vec2(0.38, 0.5))) : 0.0;
          gl_FragColor = vec4(mix(vC.rgb, vec3(1.0), hl * 0.85), t.a * vC.a); }`
    });
    const pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 10;
    const list = [];
    return {
      pts, mat: m, list,
      emit(o) { if (list.length >= max) list.shift(); list.push(Object.assign({ x: 0, y: 0, z: 0.6, vx: 0, vy: 0, g: -14, life: 0.8, t: 0, s: 0.3, c: new T.Color(1, 1, 1), drag: 0.985, type: 0, target: null }, o)); },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]; p.t += dt; if (p.t >= p.life) { list.splice(i, 1); continue; }
          if (p.target) { const k = Math.min(1, p.t / p.life), e = k * k * (3 - 2 * k); p.x = p.sx + (p.target.x - p.sx) * e + Math.sin(k * 3.14) * p.arc; p.y = p.sy + (p.target.y - p.sy) * e + Math.sin(k * 3.14) * 1.4; p.z = p.sz + (p.target.z - p.sz) * e; }
          else { p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx * dt; p.y += p.vy * dt; }
        }
        let n = 0;
        for (const p of list) { const k = p.t / p.life; P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z; C[n * 4] = p.c.r; C[n * 4 + 1] = p.c.g; C[n * 4 + 2] = p.c.b; C[n * 4 + 3] = p.target ? 1 : Math.min(1, (1 - k) * 2.5); S[n * 2] = p.s * (p.type === 3 ? Math.sin(k * 3.14) * 1.4 : p.target ? 1 - 0.5 * k : 1 - k * 0.4); S[n * 2 + 1] = p.type; n++; }
        g.setDrawRange(0, n); for (const k of ['position', 'aC', 'aS']) g.attributes[k].needsUpdate = true; return n;
      }
    };
  }

  const View = {
    PAL, NAMES, N, TRAY_Y, TRAY_X, TRAY_S, JAR_POS, BZ, tweens: [], time: 0, active: false,
    init(canvas) {
      this.canvas = canvas;
      const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false });
      r.setClearColor(0, 0); r.outputEncoding = T.sRGBEncoding;
      this.dprMax = Math.min(window.devicePixelRatio || 1, 2); this.dpr = Math.min(this.dprMax, 1.75);
      this.scene = new T.Scene(); this.cam = new T.PerspectiveCamera(30, 1, 1, 120);
      this.matcap = View.matcap = matcapTex();
      this.colors = PAL.map(h => h ? lin(h) : null);
      this.mats = [];
      const M = o => { const m = mat(o); this.mats.push(m); return m; };
      this.boardGroup = new T.Group(); this.scene.add(this.boardGroup);
      const fg = new T.ExtrudeGeometry(roundRectShape(9.3, 9.3, 0.9), { depth: 0.4, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 5, curveSegments: 12 }); fg.translate(0, 0, -0.75);
      this.frameMat = M({ color: '#ff8fb5', gloss: 0.9, sss: 0.25 });
      this.boardGroup.add(new T.Mesh(fg, this.frameMat));
      const tg = new T.ExtrudeGeometry(roundRectShape(8.55, 8.55, 0.55), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 10 }); tg.translate(0, 0, -0.32);
      this.trayMat = M({ color: '#fff3f7', gloss: 0.35, sss: 0.1 });
      this.boardGroup.add(new T.Mesh(tg, this.trayMat));
      this.sockets = Pool(roundedBox(0.94, 0.94, 0.2, 0.13, 4), M({ instanced: true, gloss: 0.25, sss: 0.05, invert: true }), N * N); this.boardGroup.add(this.sockets.mesh);
      this.slotColor = lin('#f7dce8'); this.jamColor = lin('#c7266a');
      for (let rr = 0; rr < N; rr++) for (let c = 0; c < N; c++) { const p = this.cellPos(rr, c); this.sockets.add({ x: p.x, y: p.y, z: -0.12, c: this.slotColor.clone(), shadow: false }); }
      this.shadowTex = blobTex('rgba(120,40,80,0.42)', 'rgba(120,40,80,0)');
      this.shadows = new T.InstancedMesh(new T.PlaneGeometry(1.25, 1.25), new T.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }), 200); this.shadows.frustumCulled = false; this.shadows.renderOrder = 1; this.scene.add(this.shadows);
      this.jellyMat = M({ instanced: true, gloss: 1, sss: 0.34 });
      this.jelly = Pool(roundedBox(BOX, BOX, BOX, 0.27, 5), this.jellyMat, 200); this.scene.add(this.jelly.mesh);
      this.ghostMat = M({ instanced: true, alpha: 0.5, gloss: 0.6, sss: 0.4 });
      this.ghost = Pool(roundedBox(BOX, BOX, BOX, 0.27, 3), this.ghostMat, 24); this.ghost.mesh.renderOrder = 2; this.scene.add(this.ghost.mesh);
      this.jar = this.buildJar(); this.scene.add(this.jar.group);
      this.parts = Particles(450, atlasTex()); this.scene.add(this.parts.pts);
      this.board = new Array(N * N).fill(null); this.trayB = [[], [], []];
      this.resize();
    },
    setWorld(w) { this.frameMat.uniforms.uColor.value = lin(w.frame); this.trayMat.uniforms.uColor.value = lin(w.tray); this.slotColor = lin(w.slot); for (const s of this.sockets.items) if (!s.jam) s.c.copy(this.slotColor); this.dirty = true; },
    showBoard(v) { this.boardGroup.visible = v; this.dirty = true; },

    buildJar() {
      const group = new T.Group(); group.position.copy(JAR_POS);
      const R = 1.1, H = 2.3;
      const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16, y = -H / 2 + t * H; let r = R; if (t < 0.07) r = R * (0.8 + t * 2.8); else if (t > 0.8) r = R * (1 - (t - 0.8) * 1.6); prof.push(new T.Vector2(r, y)); }
      const glassMat = new T.ShaderMaterial({
        uniforms: { uGlow: { value: 0 }, uTime: { value: 0 }, uTint: { value: new T.Color(0.85, 0.93, 1) } }, transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL; void main(){ vL = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform float uGlow; uniform float uTime; uniform vec3 uTint; varying vec3 vN; varying vec3 vV; varying vec3 vL;
          void main(){ vec3 n = normalize(vN), v = normalize(vV); float f = pow(1.0 - abs(dot(n, v)), 2.0); float a = atan(vL.x, vL.z);
            float streak = smoothstep(0.1, 0.0, abs(a + 0.75)) * 0.6 + smoothstep(0.05, 0.0, abs(a + 0.45)) * 0.35 + smoothstep(0.06, 0.0, abs(a - 1.05)) * 0.2;
            vec3 c = mix(uTint, vec3(1.0, 0.8, 0.95), uGlow * (0.6 + 0.4 * sin(uTime * 8.0)));
            gl_FragColor = vec4(c + streak, clamp(0.08 + f * 0.6 + streak + uGlow * 0.18, 0.0, 0.9)); }`
      });
      const glass = new T.Mesh(new T.LatheGeometry(prof, 40), glassMat); glass.renderOrder = 4;
      const fillGeo = new T.CylinderGeometry(R * 0.9, R * 0.78, 1, 32, 1); fillGeo.translate(0, 0.5, 0);
      const fillMat = new T.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uAgit: { value: 0 }, uMatcap: { value: this.matcap }, uColor: { value: lin('#ff6aa8') }, uLevel: { value: 0.01 } },
        vertexShader: `uniform float uTime; uniform float uAgit; uniform float uLevel; varying vec3 vN; varying vec3 vV; varying float vTop;
          void main(){ vec3 p = position; vTop = step(0.99, p.y); p.y *= uLevel;
            if (vTop > 0.5) p.y += (sin(p.x*3.0 + uTime*4.0) * 0.04 + sin(p.z*4.0 - uTime*5.0) * 0.03) * (0.4 + uAgit);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uMatcap; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vTop;
          void main(){ vec3 n = normalize(vN), v = normalize(vV); vec3 x = normalize(vec3(v.z, 0.0, -v.x)), y = cross(v, x); vec3 mc = texture2D(uMatcap, vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5).rgb;
            vec3 c = uColor * (0.55 + 0.6 * mc.r) + uColor * 0.35 * pow(clamp(dot(n, v), 0.0, 1.0), 2.0); c = mix(c, vec3(1.0), clamp(mc.g, 0.0, 1.0) * 0.8); if (vTop > 0.5) c = mix(c, vec3(1.0, 0.85, 0.92), 0.25);
            gl_FragColor = vec4(c, 1.0); }`
      });
      const fill = new T.Mesh(fillGeo, fillMat); fill.position.y = -H / 2 + 0.1;
      const bn = 26, bp = new Float32Array(bn * 3); for (let i = 0; i < bn; i++) { const a = Math.random() * 6.28, rr = Math.random() * R * 0.7; bp[i * 3] = Math.cos(a) * rr; bp[i * 3 + 1] = Math.random(); bp[i * 3 + 2] = Math.sin(a) * rr; }
      const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(bp, 3));
      const bubMat = new T.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uTop: { value: 0 }, uBase: { value: -H / 2 + 0.15 }, uScale: { value: 300 }, uSpeed: { value: 0.25 } }, transparent: true, depthWrite: false,
        vertexShader: `uniform float uTime; uniform float uTop; uniform float uBase; uniform float uScale; uniform float uSpeed; varying float vA;
          void main(){ float h = max(uTop - uBase, 0.0); float k = fract(position.y + uTime * uSpeed * (0.7 + position.x * 0.3)); vec3 p = vec3(position.x + sin(uTime*3.0 + position.z*9.0)*0.04, uBase + k * h, position.z);
            vA = h > 0.12 ? smoothstep(0.0, 0.15, k) * smoothstep(1.0, 0.8, k) : 0.0; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (0.07 + 0.06 * fract(position.x*13.0)) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; void main(){ vec2 p = gl_PointCoord*2.0-1.0; float d = length(p); if (d > 1.0) discard; float ringA = smoothstep(0.55, 0.95, d) * (1.0 - smoothstep(0.95, 1.0, d)); float hl = smoothstep(0.35, 0.0, length(p - vec2(-0.35, 0.35)));
          gl_FragColor = vec4(vec3(1.0), (ringA * 0.8 + hl) * vA * 0.9); }` });
      const bubbles = new T.Points(bg, bubMat); bubbles.renderOrder = 3; bubbles.frustumCulled = false;
      const lidMat = mat({ color: '#ff7aa8', gloss: 0.9, sss: 0.2 }); this.mats.push(lidMat);
      const lid = new T.Group(); lid.position.y = H / 2 + 0.12;
      const cap = new T.Mesh(new T.CylinderGeometry(R * 0.86, R * 0.86, 0.36, 36, 1), lidMat);
      const knob = new T.Mesh(new T.SphereGeometry(0.22, 18, 12), lidMat); knob.position.y = 0.26; knob.scale.y = 0.7;
      const rim = new T.Mesh(new T.TorusGeometry(R * 0.86, 0.1, 10, 36), lidMat); rim.rotation.x = Math.PI / 2; rim.position.y = -0.17;
      lid.add(cap, knob, rim);
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 160; const lt = new T.CanvasTexture(lc); lt.encoding = T.sRGBEncoding;
      const label = new T.Mesh(new T.CylinderGeometry(R * 1.006, R * 1.006, 0.95, 32, 1, true, -0.9, 1.8), new T.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false }));
      label.position.y = -0.25; label.renderOrder = 5;
      const glow = new T.Mesh(new T.PlaneGeometry(4.6, 4.6), new T.MeshBasicMaterial({ map: blobTex('rgba(255,170,215,0.9)', 'rgba(255,170,215,0)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      glow.position.z = -1.2; glow.renderOrder = 0; glow.material.opacity = 0;
      group.add(glow, fill, bubbles, glass, label, lid); group.rotation.x = 0.28;
      return { group, glass, glassMat, fill, fillMat, bubbles, bubMat, lid, lidMat, label, lc, lt, glow, H, R, shown: 0, target: 0, base: JAR_POS.clone(), face: '' };
    },
    jarFace(state) { // empty, fill, almost, ready, pour, after
      const J = this.jar; if (J.face === state) return; J.face = state; const x = J.lc.getContext('2d'); x.clearRect(0, 0, 256, 160);
      const rr = (a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
      x.fillStyle = '#fffaf2'; rr(28, 22, 200, 116, 40); x.fill();
      x.strokeStyle = this.jarAccent || '#ff5c8a'; x.lineWidth = 6; x.setLineDash([12, 8]); rr(40, 34, 176, 92, 30); x.stroke(); x.setLineDash([]);
      const ink = '#4a2343'; x.fillStyle = ink; x.strokeStyle = ink; x.lineWidth = 7; x.lineCap = 'round';
      const eye = (cx, open) => { if (open === 'arc') { x.beginPath(); x.arc(cx, 82, 11, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); } else if (open === 'line') { x.beginPath(); x.moveTo(cx - 10, 78); x.lineTo(cx + 10, 78); x.stroke(); } else if (open === 'star') { x.save(); x.fillStyle = '#ffb400'; x.translate(cx, 76); x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 15, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.fill(); x.restore(); } else { x.beginPath(); x.arc(cx, 76, open === 'big' ? 13 : 10, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + 4, 72, 4, 0, 7); x.fill(); x.fillStyle = ink; } };
      const L = 100, Rr = 156;
      if (state === 'empty') { eye(L, 'line'); eye(Rr, 'line'); x.beginPath(); x.arc(128, 106, 7, 0, 7); x.stroke(); x.font = '800 22px Baloo, sans-serif'; x.fillText('z', 196, 56); x.font = '800 16px Baloo, sans-serif'; x.fillText('z', 212, 42); }
      else if (state === 'fill') { eye(L); eye(Rr); x.beginPath(); x.arc(128, 98, 14, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); }
      else if (state === 'almost') { eye(L, 'big'); eye(Rr, 'big'); x.beginPath(); x.ellipse(128, 106, 10, 12, 0, 0, 7); x.fill(); }
      else if (state === 'ready') { eye(L, 'star'); eye(Rr, 'star'); x.beginPath(); x.arc(128, 96, 20, 0, Math.PI); x.fill(); x.fillStyle = '#ff6f91'; x.beginPath(); x.arc(128, 108, 9, 0, Math.PI); x.fill(); }
      else if (state === 'pour') { eye(L, 'arc'); eye(Rr, 'arc'); x.beginPath(); x.ellipse(128, 104, 14, 17, 0, 0, 7); x.fill(); }
      else { eye(L, 'arc'); eye(Rr, 'arc'); x.beginPath(); x.arc(128, 96, 13, 0.1 * Math.PI, 0.9 * Math.PI); x.stroke(); }
      x.fillStyle = 'rgba(255,120,160,0.45)'; x.beginPath(); x.arc(72, 98, 12, 0, 7); x.arc(184, 98, 12, 0, 7); x.fill();
      J.lt.needsUpdate = true; this.dirty = true;
    },
    setJarStyle(st) { const J = this.jar; J.lidMat.uniforms.uColor.value = lin(st.lid); J.fillMat.uniforms.uColor.value = lin(st.jelly); J.glassMat.uniforms.uTint.value = new T.Color(st.glass || '#d9edff'); this.jarAccent = st.accent || st.lid; this.pourColor = lin(st.jelly); this.colors[7] = lin(st.jelly); const f = J.face; J.face = ''; this.jarFace(f || 'empty'); },

    resize() {
      const w = window.innerWidth, h = window.innerHeight; this.w = w; this.h = h;
      this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(w, h, false);
      const asp = w / h; this.cam.aspect = asp;
      const t = Math.tan(T.MathUtils.degToRad(this.cam.fov / 2));
      const needH = 17.6, needW = 10.0, dist = Math.max(needH / (2 * t), needW / (2 * t * asp));
      this.cam.position.set(0, -2.0, dist); this.cam.lookAt(0, asp < 0.52 ? 0.2 : 0.35, 0); this.cam.updateProjectionMatrix();
      const sc = h * this.dpr / (2 * t); this.parts.mat.uniforms.uScale.value = sc; this.jar.bubMat.uniforms.uScale.value = sc;
      this.dirty = true;
    },
    setDpr(d) { this.dpr = Math.max(0.75, Math.min(this.dprMax, d)); this.resize(); },
    cellPos(r, c) { return { x: c - 3.5, y: 3.5 - r }; },
    toWorld(px, py, z) { const v = new T.Vector3((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1, 0.5).unproject(this.cam); const d = v.sub(this.cam.position).normalize(); return this.cam.position.clone().add(d.multiplyScalar((z - this.cam.position.z) / d.z)); },
    toScreen(x, y, z) { const v = new T.Vector3(x, y, z).project(this.cam); return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h }; },
    tween(dur, fn, delay, done) { this.tweens.push({ t: -(delay || 0), dur, fn, done }); this.dirty = true; },

    clearAll() { for (const b of this.jelly.items) b.alive = false; this.jelly.items.length = 0; this.board.fill(null); this.trayB = [[], [], []]; this.ghostHide(); this.mascot = null; for (const s of this.sockets.items) { s.jam = 0; s.c.copy(this.slotColor); s.sz = 1; } },
    addJelly(r, c, v, mark, pop) {
      const p = this.cellPos(r, c), b = this.jelly.add({ x: p.x, y: p.y, z: BZ, c: this.colors[v].clone(), fl: v, mark: mark ? 1 : 0, sx: pop ? 0.01 : 1, sy: pop ? 0.01 : 1, sz: pop ? 0.01 : 1 });
      this.board[r * N + c] = b; if (pop) this.tween(0.4, k => { b.sx = b.sy = b.sz = backOut(k); }, pop, () => { b.wob = 0.1; }); return b;
    },
    setJam(r, c, on) { const s = this.sockets.items[r * N + c]; if (!s) return; s.jam = on ? 1 : 0; if (on) { s.c.copy(this.jamColor); s.sz = 1.4; } else { const from = s.c.clone(); this.tween(0.35, k => { s.c.copy(from).lerp(this.slotColor, k); s.sz = 1.4 - 0.4 * k; }); } this.dirty = true; },
    loadBoard(S) {
      this.clearAll();
      for (let k = 0; k < N * N; k++) { if (S.jam[k]) this.setJam(Math.floor(k / N), k % N, 1); if (S.board[k]) this.addJelly(Math.floor(k / N), k % N, S.board[k], S.mark[k], 0.05 + (Math.floor(k / N) + (k % N)) * 0.025); }
    },
    setTray(tray, L) {
      for (let i = 0; i < 3; i++) {
        for (const b of this.trayB[i]) b.alive = false; this.trayB[i] = [];
        const t = tray[i]; if (!t || t.used) continue;
        const sh = L.SHAPE[t.shape], ox = (sh.wd - 1) / 2, oy = (sh.h - 1) / 2;
        for (const [dr, dc] of sh.cells) {
          const b = this.jelly.add({ c: this.colors[t.flav].clone(), fl: t.flav });
          b.lx = dc - ox; b.ly = oy - dr; b.x = TRAY_X[i] + b.lx * TRAY_S; b.y = TRAY_Y + b.ly * TRAY_S - 2.5; b.z = 0.3; b.sx = b.sy = b.sz = 0.01;
          this.trayB[i].push(b);
          this.tween(0.45, k => { const e = backOut(k); b.y = TRAY_Y + b.ly * TRAY_S - 2.5 * (1 - e); b.sx = b.sy = b.sz = TRAY_S * Math.min(1, k * 2.2); }, i * 0.07 + Math.random() * 0.04, () => { b.wob = 0.14; });
        }
      }
    },
    trayHit(px, py) {
      const w = this.toWorld(px, py, 0.3); if (w.y > TRAY_Y + 2.2 || w.y < TRAY_Y - 2.8) return -1;
      let best = -1, bd = 9; for (let i = 0; i < 3; i++) { if (!this.trayB[i].length) continue; const d = Math.abs(w.x - TRAY_X[i]); if (d < bd && d < 2) { bd = d; best = i; } } return best;
    },
    dragStart(i) { this.drag = { i, k: 0 }; for (const b of this.trayB[i]) { b.wob = 0.14; b.mood = 3; } this.tween(0.12, k => { if (this.drag) this.drag.k = k; }); },
    dragTo(px, py, liftPx, snap) {
      if (!this.drag) return null; const i = this.drag.i, k = this.drag.k, arr = this.trayB[i];
      const w = this.toWorld(px, py - liftPx, 1.0), s = TRAY_S + (1 - TRAY_S) * k, f = snap ? 1 : 0.6;
      for (const b of arr) { const tx = w.x + b.lx * s, ty = w.y + b.ly * s; b.rz = (tx - b.x) * -0.04; b.x += (tx - b.x) * f; b.y += (ty - b.y) * f; b.z = 0.3 + 0.9 * k; b.sx = b.sy = b.sz = s * 0.97; }
      const pw = this.toWorld(px, py - liftPx, BZ); this.dirty = true;
      const c0 = Math.min(...arr.map(b => b.lx)), r0 = Math.max(...arr.map(b => b.ly));
      return { c: Math.round(pw.x + c0 + 3.5), r: Math.round(3.5 - (pw.y + r0)) };
    },
    dragBack() {
      const i = this.drag.i; this.drag = null; this.ghostHide();
      for (const b of this.trayB[i]) { const fx = b.x, fy = b.y, fz = b.z, fs = b.sx, tx = TRAY_X[i] + b.lx * TRAY_S, ty = TRAY_Y + b.ly * TRAY_S; b.mood = 0; b.rz = 0; this.tween(0.32, k => { const e = backOut(k); b.x = fx + (tx - fx) * e; b.y = fy + (ty - fy) * e; b.z = fz + (0.3 - fz) * e; b.sx = b.sy = b.sz = fs + (TRAY_S - fs) * e; }, 0, () => { b.wob = 0.1; }); }
    },
    ghostShow(pv, flav, flashGhost) {
      for (const b of this.ghost.items) b.alive = false; this.ghost.items.length = 0;
      const c = this.colors[flav];
      for (const [r, cc] of pv.cells) { const p = this.cellPos(r, cc); this.ghost.add({ x: p.x, y: p.y, z: BZ - 0.1, sx: 0.92, sy: 0.92, sz: 0.5, c: c.clone(), fl: 0, flash: flashGhost ? 0.35 : 0 }); }
      const glow = new Set(); for (const r of pv.rows) for (let j = 0; j < N; j++) glow.add(r * N + j); for (const cc of pv.cols) for (let j = 0; j < N; j++) glow.add(j * N + cc);
      for (let k = 0; k < N * N; k++) { const b = this.board[k]; if (b) { b.flash = glow.has(k) ? 0.32 : 0; b.mood = glow.has(k) ? 3 : b.baseMood || 0; } }
      this.glowing = glow.size > 0; this.dirty = true;
    },
    ghostHide() { for (const b of this.ghost.items) b.alive = false; this.ghost.items.length = 0; if (this.glowing) { for (const b of this.board) if (b) { b.flash = 0; b.mood = b.baseMood || 0; } this.glowing = false; } },
    placePiece(ev) {
      const arr = this.trayB[ev.ti]; this.trayB[ev.ti] = []; this.drag = null; this.ghostHide();
      ev.cells.forEach(([r, c], n) => {
        const b = arr[n], p = this.cellPos(r, c), fx = b.x, fy = b.y, fz = b.z, fs = b.sx; b.rz = 0; this.board[r * N + c] = b;
        this.tween(0.08, k => { b.x = fx + (p.x - fx) * k; b.y = fy + (p.y - fy) * k; b.z = fz + (BZ - fz) * k; b.sx = b.sy = b.sz = fs + (1 - fs) * k; }, 0, () => {
          b.mood = 0; this.tween(0.34, k => { const sq = Math.sin(k * Math.PI) * (1 - k); b.sz = 1 - 0.4 * sq; b.sx = b.sy = 1 + 0.22 * sq; }, 0, () => { b.sx = b.sy = b.sz = 1; }); b.wob = 0.12;
        });
      });
      setTimeout(() => { for (const [r, c] of ev.cells) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N && this.board[rr * N + cc]) this.board[rr * N + cc].wob = Math.max(this.board[rr * N + cc].wob, 0.07); } }, 80);
    },
    clearLines(ev, origin, onJar) {
      const o = origin || { r: 3.5, c: 3.5 }, combo = ev.combo || 1, big = (ev.lines || 1) >= 2 || combo >= 3;
      const jarTop = { x: JAR_POS.x, y: JAR_POS.y + 0.9, z: JAR_POS.z };
      let maxD = 0;
      ev.cleared.forEach(([r, c, f], n) => {
        const k = r * N + c, b = this.board[k]; this.board[k] = null; if (!b) return;
        const d = Math.hypot(r - o.r, c - o.c) * 0.035; maxD = Math.max(maxD, d); b.mood = 3;
        this.tween(0.12, t => { b.flash = t * 0.7; b.sx = b.sy = b.sz = 1 + 0.25 * t; b.z = BZ + 0.3 * t; }, d, () => {
          this.tween(0.1, t => { b.sx = b.sy = b.sz = 1.25 * (1 - t); }, 0, () => { b.alive = false; });
          const p = this.cellPos(r, c), col = this.colors[f] || this.colors[7];
          for (let q = 0; q < (big ? 4 : 3); q++) this.parts.emit({ x: p.x, y: p.y, z: 0.7, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5 + 2, g: -15, life: 0.5 + Math.random() * 0.3, s: 0.26 + Math.random() * 0.14, c: col.clone(), type: 0 });
          if (n % 2 === 0) this.parts.emit({ sx: p.x, sy: p.y, sz: 0.7, x: p.x, y: p.y, z: 0.7, target: jarTop, arc: (Math.random() - 0.5) * 3, life: 0.6 + Math.random() * 0.25, s: 0.28, c: col.clone(), type: 0 });
          if (combo >= 2 && n % 3 === 0) this.parts.emit({ x: p.x, y: p.y, z: 1, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 1, g: -4, life: 0.7, s: 0.45, c: new T.Color(1, 0.9, 0.5), type: combo >= 4 ? 2 : 1 });
        });
      });
      if (ev.gains) for (const [r, c] of ev.gains.jam || []) this.setJam(r, c, 0);
      if (ev.boardClear) for (let q = 0; q < 30; q++) { const a = Math.random() * 6.28; this.parts.emit({ x: 0, y: 0, z: 1.5, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, g: -5, life: 1.1, s: 0.5, c: this.colors[1 + q % 6].clone(), type: 1 + (q % 3) }); }
      setTimeout(() => onJar && onJar(), (maxD + 0.62) * 1000);
      if (big || ev.boardClear) this.shake(ev.boardClear ? 0.35 : 0.08 + (ev.lines || 1) * 0.04 + Math.min(combo, 6) * 0.02);
    },
    setJar(level, ready) {
      const J = this.jar, old = J.target; J.target = Math.max(0, Math.min(1, level)); J.ready = ready;
      if (J.target > old + 0.001) { J.slosh = 1; J.squash = 1; }
      if (!this.pouring) this.jarFace(ready ? 'ready' : J.target <= 0.01 ? 'empty' : J.target >= 0.72 ? 'almost' : 'fill'); this.dirty = true;
    },
    jarScreen() { return this.toScreen(JAR_POS.x, JAR_POS.y, JAR_POS.z); },
    jarHit(px, py) { const p = this.jarScreen(), s = this.toScreen(JAR_POS.x + this.jar.R, JAR_POS.y, JAR_POS.z); return Math.hypot(px - p.x, py - p.y) < Math.abs(s.x - p.x) * 1.4; },
    pourAnim(ev, onLand) {
      const J = this.jar, tc = this.cellPos(ev.r, ev.c), tgt = new T.Vector3(tc.x + 1.5, tc.y + 2.6, 2.6), start = J.group.position.clone(), col = this.pourColor || this.colors[7];
      this.pouring = true; this.jarFace('pour');
      this.tween(0.25, k => { J.lid.position.y = J.H / 2 + 0.12 + k * 1.2; J.lid.rotation.z = k * 0.8; });
      this.tween(0.35, k => { const e = easeInOut(k); J.group.position.lerpVectors(start, tgt, e); J.group.rotation.z = 1.15 * e; J.group.scale.setScalar(1 - 0.15 * e); }, 0.12, () => {
        const mouth = () => J.group.localToWorld(new T.Vector3(0, J.H / 2, 0));
        for (let q = 0; q < 40; q++) setTimeout(() => { const m = mouth(), cell = ev.area[q % ev.area.length], p = this.cellPos(cell[0], cell[1]); this.parts.emit({ sx: m.x, sy: m.y, sz: m.z, x: m.x, y: m.y, z: m.z, target: { x: p.x + (Math.random() - 0.5) * 0.3, y: p.y, z: 0.5 }, arc: 0.3, life: 0.26, s: 0.42, c: col.clone(), type: 0 }); }, q * 9);
        J.target = 0;
        setTimeout(() => {
          ev.poured.forEach(([r, c], n) => {
            const p = this.cellPos(r, c), b = this.jelly.add({ x: p.x, y: p.y, z: BZ + 0.6, sx: 0.01, sy: 0.01, sz: 0.01, c: this.colors[7].clone(), fl: 7 });
            this.board[r * N + c] = b;
            this.tween(0.32, k => { const e = backOut(k); b.sx = b.sy = e * (1 + 0.15 * (1 - k)); b.sz = e * (1 - 0.2 * (1 - k)); b.z = BZ + 0.6 * (1 - k); }, n * 0.03, () => { b.wob = 0.16; });
            for (let q = 0; q < 3; q++) this.parts.emit({ x: p.x, y: p.y, z: 0.8, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 1, g: -14, life: 0.45, s: 0.2, c: col.clone(), type: 0 });
          });
          this.shake(0.12);
          setTimeout(() => onLand && onLand(), 340 + ev.poured.length * 30);
        }, 280);
        this.tween(0.4, k => { const e = easeInOut(k); J.group.position.lerpVectors(tgt, J.base, e); J.group.rotation.z = 1.15 * (1 - e); J.group.scale.setScalar(0.85 + 0.15 * e); }, 0.8);
        this.tween(0.35, k => { J.lid.position.y = J.H / 2 + 1.32 - 1.2 * backOut(k); J.lid.rotation.z = 0.8 * (1 - k); }, 1.15, () => { this.pouring = false; J.squash = 1; this.jarFace('after'); setTimeout(() => { if (this.jar.target < 0.01 && !this.pouring) this.jarFace('empty'); }, 1800); });
      });
    },
    popAnim(ev) {
      const c0 = this.cellPos(ev.r, ev.c);
      for (let q = 0; q < 30; q++) { const a = Math.random() * 6.28, sp = 4 + Math.random() * 7; this.parts.emit({ x: c0.x, y: c0.y, z: 0.7, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: -6, life: 0.7, s: 0.3, c: this.colors[7].clone(), type: q % 2 ? 0 : 3 }); }
      ev.cleared.forEach(([r, c]) => { const k = r * N + c, b = this.board[k]; this.board[k] = null; if (b) this.tween(0.18, t => { b.sx = b.sy = b.sz = 1 + 0.4 * t; b.flash = t; }, Math.random() * 0.05, () => { b.alive = false; }); });
      this.jar.target = 0; this.shake(0.25);
    },
    flyTo(cells, pt, color, type) { const w = this.toWorld(pt.x, pt.y, 1.5); for (const [r, c] of cells) { const p = this.cellPos(r, c); this.parts.emit({ sx: p.x, sy: p.y, sz: 1, x: p.x, y: p.y, z: 1, target: w, arc: 1.5, life: 0.75, s: 0.6, c: new T.Color(color || '#ffcc33'), type: type == null ? 1 : type }); } },
    celebrate(n) { for (let q = 0; q < (n || 40); q++) { const a = Math.random() * 6.28, sp = 5 + Math.random() * 7; this.parts.emit({ x: (Math.random() - 0.5) * 6, y: 2 + Math.random() * 2, z: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 4, g: -9, life: 1.4, s: 0.45 + Math.random() * 0.3, c: this.colors[1 + q % 6].clone(), type: 1 + q % 3 }); } },
    shake(a) { this.shakeAmp = Math.max(this.shakeAmp || 0, a); },
    setMood(m) { for (const b of this.board) if (b) { b.baseMood = m; if (!this.glowing) b.mood = m; } this.dirty = true; },
    gameOverAnim() { for (let r = N - 1; r >= 0; r--) for (let c = 0; c < N; c++) { const b = this.board[r * N + c]; if (!b) continue; const from = b.c.clone(); this.tween(0.35, k => { b.c.copy(from).lerp(new T.Color(0.55, 0.5, 0.58), k * 0.6); b.mood = 2; b.baseMood = 2; }, (N - 1 - r) * 0.06 + c * 0.012, () => { b.wob = 0.05; }); } },
    wipeBoard(done) {
      let d = 0; for (let k = 0; k < N * N; k++) { const b = this.board[k]; if (!b) continue; this.board[k] = null; const dl = (k % N) * 0.014 + Math.floor(k / N) * 0.02; d = Math.max(d, dl); this.tween(0.16, t => { b.sx = b.sy = b.sz = 1 - t; }, dl, () => { b.alive = false; }); }
      for (const arr of this.trayB) for (const b of arr) b.alive = false; this.trayB = [[], [], []]; this.ghostHide();
      for (const s of this.sockets.items) if (s.jam) { s.jam = 0; s.c.copy(this.slotColor); s.sz = 1; }
      setTimeout(done, d * 1000 + 200);
    },
    showMascot(fl, y) {
      if (this.mascot) this.mascot.alive = false;
      const b = this.mascot = this.jelly.add({ x: 0, y: y || 0.6, z: 1, sx: 0.01, sy: 0.01, sz: 0.01, c: this.colors[fl].clone(), fl, big: 1 }); b.home = y || 0.6;
      this.tween(0.6, k => { b.sx = b.sy = b.sz = 3.2 * backOut(k); }, 0.1, () => { b.wob = 0.15; });
      return b;
    },
    pokeMascot() { const b = this.mascot; if (!b) return; b.wob = 0.2; b.mood = 3; this.tween(0.5, k => { const s = Math.sin(k * Math.PI) * (1 - k); b.sz = 3.2 * (1 - 0.35 * s); b.sx = b.sy = 3.2 * (1 + 0.2 * s); b.y = b.home + Math.sin(k * Math.PI) * 0.9; }, 0, () => { b.mood = 0; }); for (let q = 0; q < 8; q++) this.parts.emit({ x: b.x + (Math.random() - 0.5) * 2.5, y: b.y + 1.8, z: 2.5, vx: (Math.random() - 0.5) * 5, vy: 4 + Math.random() * 3, g: -8, life: 0.9, s: 0.4, c: new T.Color('#ff8fb5'), type: 2 }); },
    hideMascot() { if (this.mascot) { const b = this.mascot; this.mascot = null; this.tween(0.2, k => { b.sx = b.sy = b.sz = 3.2 * (1 - k); }, 0, () => { b.alive = false; }); } },

    frame(dt, idleAnim) {
      this.time += dt; const busy = this.tweens.length > 0 || !!this.drag;
      for (let i = this.tweens.length - 1; i >= 0; i--) { const t = this.tweens[i]; t.t += dt; if (t.t < 0) continue; const k = Math.min(1, t.t / t.dur); t.fn(k); if (k >= 1) { this.tweens.splice(i, 1); t.done && t.done(); } }
      let wob = false; for (const b of this.jelly.items) { if (b.wob > 0.002) { b.wob *= Math.pow(0.003, dt); wob = true; } else b.wob = 0; }
      const J = this.jar; J.shown += (J.target - J.shown) * Math.min(1, dt * 5);
      const lvl = Math.max(0.01, J.shown * (J.H - 0.45)); J.fillMat.uniforms.uLevel.value = lvl; J.fill.visible = J.shown > 0.008;
      J.slosh = (J.slosh || 0) * Math.pow(0.05, dt); J.fillMat.uniforms.uAgit.value = J.slosh * 2 + (J.ready ? 0.8 : J.target > 0.72 ? 0.35 : 0);
      J.bubMat.uniforms.uTop.value = J.fill.position.y + lvl - 0.05; J.bubMat.uniforms.uSpeed.value = J.ready ? 0.7 : J.target > 0.72 ? 0.45 : 0.22;
      J.glassMat.uniforms.uGlow.value += ((J.ready ? 1 : 0) - J.glassMat.uniforms.uGlow.value) * Math.min(1, dt * 4);
      J.glow.material.opacity = J.glassMat.uniforms.uGlow.value * (0.55 + 0.25 * Math.sin(this.time * 6));
      J.squash = (J.squash || 0) * Math.pow(0.02, dt);
      if (!this.pouring) {
        const s = Math.sin(this.time * 14) * J.squash * 0.08; J.group.scale.set(1 + s, 1 - s, 1 + s);
        if (J.ready) { J.lid.position.y = J.H / 2 + 0.12 + Math.abs(Math.sin(this.time * 7)) * 0.12; J.lid.rotation.z = Math.sin(this.time * 14) * 0.06; J.group.rotation.z = Math.sin(this.time * 3) * 0.04; if (Math.random() < dt * 4) this.parts.emit({ x: JAR_POS.x + (Math.random() - 0.5) * 2.6, y: JAR_POS.y + (Math.random() - 0.3) * 2.4, z: 1.6, vx: 0, vy: 0.6, g: 0, life: 0.9, s: 0.38, c: new T.Color(1, 0.95, 0.7), type: 3 }); }
        else { J.lid.position.y = J.H / 2 + 0.12; J.lid.rotation.z = J.target > 0.72 ? Math.sin(this.time * 20) * 0.02 : 0; J.group.rotation.z *= 0.9; }
      }
      if (this.mascot && !busy) { const b = this.mascot; b.y = b.home + Math.abs(Math.sin(this.time * 2.2)) * 0.18; b.sz = 3.2 * (1 - 0.05 * Math.max(0, Math.cos(this.time * 4.4))); }
      if (this.shakeAmp > 0.001) { this.shakeAmp *= Math.pow(0.002, dt); this.cam.position.x = (Math.random() - 0.5) * this.shakeAmp; } else if (this.shakeAmp) { this.shakeAmp = 0; this.cam.position.x = 0; }
      const np = this.parts.update(dt);
      for (const m of this.mats) { m.uniforms.uTime.value = this.time; m.uniforms.uBreath.value = idleAnim ? 1 : 0; }
      J.glassMat.uniforms.uTime.value = J.fillMat.uniforms.uTime.value = J.bubMat.uniforms.uTime.value = this.time;
      const active = busy || wob || np > 0 || Math.abs(J.shown - J.target) > 0.002 || J.ready || J.slosh > 0.02 || J.squash > 0.02 || this.dirty || this.shakeAmp > 0 || this.glowing;
      this.active = active; return active;
    },
    render() {
      this.jelly.sync(); this.ghost.sync(); this.sockets.sync();
      let n = 0; const m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3();
      for (const b of this.jelly.items) { if (!b.alive || !b.shadow || n >= 200) continue; const h = Math.max(0, b.z - BZ), k = Math.max(0.3, 1 - h * 0.35) * b.sx; if (b.big) { p.set(b.x + 0.15, b.y - b.sx * 0.5 - 0.1, -0.3); s.set(b.sx * 1.1, b.sx * 0.4, 1); } else { p.set(b.x + 0.12 + h * 0.25, b.y - 0.14 - h * 0.35, BZ - 0.42); s.set(k, k, 1); } m4.compose(p, q, s); this.shadows.setMatrixAt(n++, m4); }
      this.shadows.count = n; this.shadows.instanceMatrix.needsUpdate = true;
      this.renderer.render(this.scene, this.cam); this.dirty = false;
    }
  };
  function backOut(k) { const s = 1.70158; k -= 1; return k * k * ((s + 1) * k + s) + 1; }
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  View.backOut = backOut;
  window.JJView = View;
})();
