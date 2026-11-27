/* Jelly Jars 2.0 - 3D view. Three.js r128 (global THREE).
   Budget: ~10 draw calls. All jelly cubes (board + tray + drag) = ONE InstancedMesh with a custom matcap shader
   (gloss, rim, fake subsurface, squash/wobble and cute faces all in-shader, no lights, no shadows, no post-processing).
   Particles = one Points object (pooled). Glass jar = fresnel shader, no refraction. */
(function () {
  'use strict';
  const T = THREE;
  const PAL = [null, '#ff4d6d', '#ffa62e', '#ffe14d', '#7be04a', '#3fa8ff', '#2fe3c8', '#ff5fa8']; // strawberry, orange, lemon, lime, blueberry, mint, pour-jelly pink
  const CELL = 1, BOX = 0.9, N = 8, BZ = 0.28; // BZ: board jelly height (sits on the sockets)
  const TRAY_Y = -6.55, TRAY_X = [-3.05, 0, 3.05], TRAY_S = 0.58;
  const JAR_POS = new T.Vector3(3.05, 5.95, 0.6);

  // ---------- procedural matcap (r = diffuse, g = specular, b = rim) ----------
  function matcapTex() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const img = x.createImageData(S, S); const L = [-0.45, 0.55, 0.7]; const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const nx = (i + 0.5) / S * 2 - 1, ny = 1 - (j + 0.5) / S * 2, r2 = nx * nx + ny * ny; const k = (j * S + i) * 4;
      if (r2 > 1) { img.data[k + 3] = 255; continue; }
      const nz = Math.sqrt(1 - r2); const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const wrap = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2] + 0.45) / 1.45);
      // half-vector specular for viewer on +z
      const hx = L[0], hy = L[1], hz = L[2] + 1, hl = Math.hypot(hx, hy, hz); const sp = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 60);
      const sp2 = Math.pow(Math.max(0, (nx * 0.55 + ny * -0.45 + nz * 0.7)), 40) * 0.35; // soft bounce highlight bottom-right
      const rim = Math.pow(1 - nz, 2.2);
      img.data[k] = Math.min(255, (0.25 * wrap + 0.75 * d) * 255);
      img.data[k + 1] = Math.min(255, (sp * 1.4 + sp2) * 255);
      img.data[k + 2] = Math.min(255, rim * 255);
      img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; t.generateMipmaps = false; return t;
  }

  // ---------- rounded box geometry (box subdivided, corners pushed out to a radius) ----------
  function roundedBox(w, h, d, r, seg) {
    const g = new T.BoxGeometry(1, 1, 1, seg, seg, seg); const p = g.attributes.position; const v = new T.Vector3(), inner = new T.Vector3();
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); v.set(v.x * w, v.y * h, v.z * d);
      inner.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
      const n = v.clone().sub(inner); if (n.lengthSq() > 1e-9) n.normalize().multiplyScalar(r); v.copy(inner).add(n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  const JELLY_VS = `
    attribute vec3 aColor; attribute vec4 aAnim; // x wobble amp, y phase, z flash, w face (0 none, 1 happy, 2 worried, 3 sleepy)
    uniform float uTime;
    varying vec3 vN; varying vec3 vV; varying vec3 vColor; varying vec3 vL; varying vec2 vAF;
    void main(){
      vec3 p = position;
      float w = aAnim.x * sin(uTime*16.0 + aAnim.y);
      float h = clamp(p.z + 0.5, 0.0, 1.0);
      p.xy *= 1.0 + w*0.55*h; p.z *= 1.0 - w*0.6;
      p.x += aAnim.x * 0.35 * sin(uTime*11.0 + aAnim.y*1.7) * h;
      vL = position;
      #ifdef INST
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
        vColor = aColor; vAF = aAnim.zw;
      #else
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vColor = uColor; vAF = vec2(0.0);
      #endif
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const JELLY_FS = `
    uniform sampler2D uMatcap; uniform float uAlpha; uniform float uGloss; uniform float uSSS;
    varying vec3 vN; varying vec3 vV; varying vec3 vColor; varying vec3 vL; varying vec2 vAF;
    float circle(vec2 p, vec2 c, float r){ return 1.0 - smoothstep(r-0.012, r+0.012, length(p-c)); }
    void main(){
      vec3 n = normalize(vN); vec3 v = normalize(vV);
      vec3 x = normalize(vec3(v.z, 0.0, -v.x)); vec3 y = cross(v, x);
      vec2 uv = vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5;
      vec3 mc = texture2D(uMatcap, uv).rgb;
      float facing = clamp(dot(n, v), 0.0, 1.0);
      vec3 base = vColor;
      vec3 col = base * (0.42 + 0.78*mc.r);
      col += base * uSSS * pow(facing, 2.5);                 // fake subsurface glow (translucent gummy)
      col += mix(base, vec3(1.0), 0.55) * mc.b * 0.45;        // rim
      col = mix(col, vec3(1.0), clamp(mc.g*uGloss, 0.0, 1.0)); // glossy highlight
      #ifdef INST
      if (vAF.y > 0.5 && vL.z > 0.43) {                       // cute face on the top (camera-facing) side
        vec2 f = vL.xy; vec3 ink = vec3(0.16, 0.08, 0.2);
        float e;
        if (vAF.y > 2.5) { e = (1.0 - smoothstep(0.012, 0.026, abs(f.y-0.05))) * step(abs(abs(f.x)-0.17), 0.06); }
        else { e = circle(f, vec2(-0.17, 0.06), 0.058) + circle(f, vec2(0.17, 0.06), 0.058);
               float gl = circle(f, vec2(-0.15, 0.085), 0.02) + circle(f, vec2(0.19, 0.085), 0.02); col = mix(col, ink, clamp(e,0.0,1.0)); col = mix(col, vec3(1.0), clamp(gl,0.0,1.0)*clamp(e,0.0,1.0)); e = 0.0; }
        col = mix(col, ink, clamp(e, 0.0, 1.0));
        float r = length(f - vec2(0.0, vAF.y > 1.5 && vAF.y < 2.5 ? -0.2 : -0.04)); float mouth = (1.0 - smoothstep(0.012, 0.026, abs(r - 0.1)));
        mouth *= vAF.y > 1.5 && vAF.y < 2.5 ? step(-0.16, f.y) * step(f.y, -0.12) : step(f.y, -0.09);
        col = mix(col, ink, clamp(mouth, 0.0, 1.0) * step(abs(f.x), 0.12));
        float blush = circle(f, vec2(-0.27, -0.06), 0.06) + circle(f, vec2(0.27, -0.06), 0.06); col = mix(col, vec3(1.0, 0.55, 0.65), clamp(blush,0.0,1.0)*0.35);
      }
      col = mix(col, vec3(1.0), vAF.x);
      #endif
      gl_FragColor = vec4(col, uAlpha);
    }`;

  function jellyMat(opts) {
    const m = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMatcap: { value: View.matcap }, uAlpha: { value: opts.alpha || 1 }, uGloss: { value: opts.gloss == null ? 1 : opts.gloss }, uSSS: { value: opts.sss == null ? 0.32 : opts.sss }, uColor: { value: new T.Color(opts.color || '#ffffff') } },
      vertexShader: (opts.instanced ? '' : 'uniform vec3 uColor;\n') + JELLY_VS, fragmentShader: JELLY_FS,
      transparent: (opts.alpha || 1) < 1, depthWrite: (opts.alpha || 1) >= 1, defines: opts.instanced ? { INST: 1 } : {}
    });
    return m;
  }

  // ---------- instanced pool of jelly cubes ----------
  function Pool(geo, mat, max) {
    const mesh = new T.InstancedMesh(geo, mat, max); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false;
    const col = new T.InstancedBufferAttribute(new Float32Array(max * 3), 3), anim = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    col.setUsage(T.DynamicDrawUsage); anim.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('aColor', col); geo.setAttribute('aAnim', anim);
    const items = []; const free = [];
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pos = new T.Vector3(), sc = new T.Vector3();
    return {
      mesh, items,
      add(o) { const b = Object.assign({ x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rx: 0, ry: 0, rz: 0, c: new T.Color('#fff'), wob: 0, ph: Math.random() * 6.28, flash: 0, face: 1, alive: true }, o); items.push(b); return b; },
      remove(b) { b.alive = false; },
      sync() {
        let n = 0;
        for (let i = 0; i < items.length; i++) {
          const b = items[i]; if (!b.alive) continue;
          pos.set(b.x, b.y, b.z); sc.set(b.sx, b.sy, b.sz); e.set(b.rx, b.ry, b.rz); q.setFromEuler(e); m4.compose(pos, q, sc);
          mesh.setMatrixAt(n, m4); col.setXYZ(n, b.c.r, b.c.g, b.c.b); anim.setXYZW(n, b.wob, b.ph, b.flash, b.face); n++;
        }
        if (n < items.length * 0.6 && items.length > 64) { for (let i = items.length - 1; i >= 0; i--) if (!items[i].alive) items.splice(i, 1); }
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true; col.needsUpdate = true; anim.needsUpdate = true;
      }
    };
  }

  // ---------- particles (one draw call) ----------
  function Particles(max) {
    const g = new T.BufferGeometry(); const P = new Float32Array(max * 3), C = new Float32Array(max * 3), S = new Float32Array(max), A = new Float32Array(max);
    g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('aColor', new T.BufferAttribute(C, 3)); g.setAttribute('aSize', new T.BufferAttribute(S, 1)); g.setAttribute('aAlpha', new T.BufferAttribute(A, 1));
    const mat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 300 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord*2.0-1.0; float d = dot(p,p); if (d>1.0) discard;
        float hl = smoothstep(0.35, 0.0, length(p - vec2(-0.35, 0.35))); vec3 c = mix(vC*(1.05-0.35*d), vec3(1.0), hl*0.8); gl_FragColor = vec4(c, vA*(1.0-smoothstep(0.8,1.0,d))); }`
    });
    const pts = new T.Points(g, mat); pts.frustumCulled = false;
    const list = [];
    return {
      pts, mat, list,
      emit(o) { if (list.length >= max) list.shift(); list.push(Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: -14, life: 0.8, t: 0, s: 0.3, c: new T.Color('#fff'), drag: 0.98, target: null }, o)); },
      update(dt) {
        let n = 0;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]; p.t += dt; if (p.t >= p.life) { list.splice(i, 1); continue; }
          if (p.target) { const k = Math.min(1, p.t / p.life); const e = k * k * (3 - 2 * k); p.x = p.sx + (p.target.x - p.sx) * e + Math.sin(k * 3.14) * p.arc; p.y = p.sy + (p.target.y - p.sy) * e + Math.sin(k * 3.14) * 1.2; p.z = p.sz + (p.target.z - p.sz) * e; }
          else { p.vz += 0; p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
        }
        for (const p of list) { const k = p.t / p.life; P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z; C[n * 3] = p.c.r; C[n * 3 + 1] = p.c.g; C[n * 3 + 2] = p.c.b; S[n] = p.s * (p.target ? 1 - 0.5 * k : 1 - k * 0.6); A[n] = p.target ? 1 : Math.min(1, (1 - k) * 2); n++; }
        g.setDrawRange(0, n); for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[k].needsUpdate = true;
        return n;
      }
    };
  }

  const View = {
    PAL, CELL, N, TRAY_Y, TRAY_X, TRAY_S, JAR_POS,
    tweens: [], time: 0, active: false, idleSince: 0,
    init(canvas) {
      this.canvas = canvas;
      const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false, depth: true });
      r.setClearColor(0x000000, 0); r.outputEncoding = T.sRGBEncoding; r.sortObjects = true;
      this.dprMax = Math.min(window.devicePixelRatio || 1, 2); this.dpr = Math.min(this.dprMax, 1.75);
      this.scene = new T.Scene(); this.cam = new T.PerspectiveCamera(30, 1, 1, 120);
      this.matcap = View.matcap = matcapTex();
      this.colors = PAL.map(h => h ? new T.Color(h).convertSRGBToLinear() : null);
      // board base: rounded candy-glass slab
      const shape = new T.Shape(); const W = 8.7, H = 8.7, R = 0.7, x0 = -W / 2, y0 = -H / 2;
      shape.moveTo(x0 + R, y0); shape.lineTo(x0 + W - R, y0); shape.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + R); shape.lineTo(x0 + W, y0 + H - R); shape.quadraticCurveTo(x0 + W, y0 + H, x0 + W - R, y0 + H); shape.lineTo(x0 + R, y0 + H); shape.quadraticCurveTo(x0, y0 + H, x0, y0 + H - R); shape.lineTo(x0, y0 + R); shape.quadraticCurveTo(x0, y0, x0 + R, y0);
      const bg = new T.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 4, curveSegments: 10 }); bg.translate(0, 0, -0.95);
      this.boardMat = jellyMat({ color: new T.Color('#b9a3ff').convertSRGBToLinear(), gloss: 0.7, sss: 0.18 });
      const base = new T.Mesh(bg, this.boardMat); this.scene.add(base);
      // sockets (instanced, same shader, no faces)
      const sg = roundedBox(0.92, 0.92, 0.2, 0.1, 4); // real-size geometry: non-uniform instance scaling skews matcap normals
      this.sockets = Pool(sg, jellyMat({ instanced: true, gloss: 0.15, sss: 0.0 }), N * N); this.scene.add(this.sockets.mesh);
      const sc = new T.Color('#5338c4').convertSRGBToLinear();
      for (let r2 = 0; r2 < N; r2++) for (let c = 0; c < N; c++) { const p = this.cellPos(r2, c); this.sockets.add({ x: p.x, y: p.y, z: -0.2, sx: 1, sy: 1, sz: 1, c: sc.clone(), face: 0, wob: 0 }); }
      // jelly cubes (board + tray + drag): one InstancedMesh
      this.jellyGeo = roundedBox(BOX, BOX, BOX, 0.2, 4);
      this.jellyMat = jellyMat({ instanced: true });
      this.jelly = Pool(this.jellyGeo, this.jellyMat, 160); this.scene.add(this.jelly.mesh);
      // ghost preview (separate transparent pool)
      this.ghostMat = jellyMat({ instanced: true, alpha: 0.55, gloss: 0.5, sss: 0.3 });
      this.ghost = Pool(roundedBox(BOX, BOX, BOX, 0.2, 3), this.ghostMat, 24); this.ghost.mesh.renderOrder = 2; this.scene.add(this.ghost.mesh);
      // glass jar meter
      this.jar = this.buildJar(); this.scene.add(this.jar.group);
      // drag shadow blob
      const shc = document.createElement('canvas'); shc.width = shc.height = 64; const sx = shc.getContext('2d'); const gr = sx.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(40,10,80,0.45)'); gr.addColorStop(1, 'rgba(40,10,80,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
      this.shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shc), transparent: true, depthWrite: false })); this.shadow.visible = false; this.shadow.renderOrder = 1; this.scene.add(this.shadow);
      this.parts = Particles(420); this.scene.add(this.parts.pts);
      this.board = new Array(N * N).fill(null); this.trayB = [[], [], []];
      this.resize(); this.clock = performance.now();
    },
    buildJar() {
      const group = new T.Group(); group.position.copy(JAR_POS);
      const glassMat = new T.ShaderMaterial({
        uniforms: { uGlow: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL; void main(){ vL = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform float uGlow; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vL;
          void main(){ vec3 n = normalize(vN); vec3 v = normalize(vV); float f = pow(1.0 - abs(dot(n, v)), 2.2);
            float streak = smoothstep(0.08, 0.0, abs(atan(vL.x, vL.z) + 0.9)) * 0.55 + smoothstep(0.05, 0.0, abs(atan(vL.x, vL.z) - 1.1)) * 0.25;
            vec3 c = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.75, 0.95), uGlow);
            float a = 0.06 + f * 0.55 + streak + uGlow * (0.25 + 0.15 * sin(uTime * 9.0));
            gl_FragColor = vec4(c * (1.0 + streak), clamp(a, 0.0, 0.85)); }`
      });
      const R = 0.95, H = 2.1;
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const y = -H / 2 + t * H; const r = R * (t < 0.08 ? 0.75 + t * 3 : t > 0.86 ? 1 - (t - 0.86) * 1.3 : 1); pts.push(new T.Vector2(r, y)); }
      const glass = new T.Mesh(new T.LatheGeometry(pts, 32), glassMat); glass.renderOrder = 3;
      const fillMat = jellyMat({ color: new T.Color('#ff5fa8').convertSRGBToLinear(), gloss: 0.9, sss: 0.45 });
      const fillGeo = new T.CylinderGeometry(R * 0.86, R * 0.8, 1, 28, 6); fillGeo.translate(0, 0.5, 0);
      const fill = new T.Mesh(fillGeo, fillMat); fill.position.y = -H / 2 + 0.12; fill.scale.y = 0.001;
      const lidMat = jellyMat({ color: new T.Color('#ffb02e').convertSRGBToLinear(), gloss: 0.8, sss: 0.15 });
      const lid = new T.Mesh(new T.CylinderGeometry(R * 0.92, R * 0.92, 0.32, 28), lidMat); lid.position.y = H / 2 + 0.1;
      const rimTop = new T.Mesh(new T.TorusGeometry(R * 0.86, 0.09, 8, 28), lidMat); rimTop.rotation.x = Math.PI / 2; rimTop.position.y = H / 2 - 0.06;
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 128; const lx = lc.getContext('2d');
      const drawLabel = () => { lx.clearRect(0, 0, 256, 128); lx.setLineDash([]);
      lx.fillStyle = '#fff6e8'; lx.beginPath(); lx.ellipse(128, 64, 122, 58, 0, 0, 6.283); lx.fill(); lx.lineWidth = 7; lx.strokeStyle = '#ff5fa8'; lx.setLineDash([14, 9]); lx.beginPath(); lx.ellipse(128, 64, 108, 46, 0, 0, 6.283); lx.stroke();
      lx.fillStyle = '#e8327f'; lx.font = '800 52px Baloo, Nunito, sans-serif'; lx.textAlign = 'center'; lx.textBaseline = 'middle'; lx.fillText('JELLY', 128, 68); };
      drawLabel(); const lt = new T.CanvasTexture(lc);
      if (document.fonts) document.fonts.load('800 52px Baloo').then(() => { drawLabel(); lt.needsUpdate = true; this.dirty = true; }).catch(() => {});
      const label = new T.Mesh(new T.CylinderGeometry(R * 1.005, R * 1.005, 0.62, 24, 1, true, -0.95, 1.9), new T.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false }));
      label.position.y = -0.25; label.renderOrder = 4; label.material.map.encoding = T.sRGBEncoding;
      group.add(fill, glass, lid, rimTop, label); group.rotation.x = 0.35;
      return { group, glass, glassMat, fill, fillMat, lid, H, level: 0, shown: 0, pressure: 0, base: JAR_POS.clone() };
    },
    resize() {
      const w = window.innerWidth, h = window.innerHeight; this.w = w; this.h = h;
      this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(w, h, false);
      const asp = w / h; this.cam.aspect = asp;
      // fit: board (8.7 wide) + jar above + tray below
      const needH = asp > 0.52 ? 18.4 : 16.6, needW = 9.55; const t = Math.tan(T.MathUtils.degToRad(this.cam.fov / 2));
      const dist = Math.max(needH / (2 * t), needW / (2 * t * asp));
      this.cam.position.set(0, -2.3, dist); this.cam.lookAt(0, asp < 0.52 ? 0.25 : 0.05, 0); this.cam.updateProjectionMatrix();
      this.parts.mat.uniforms.uScale.value = h * this.dpr / (2 * t);
      this.dirty = true;
    },
    setDpr(d) { this.dpr = Math.max(1, Math.min(this.dprMax, d)); this.resize(); },
    cellPos(r, c) { return { x: (c - 3.5) * CELL, y: (3.5 - r) * CELL }; },
    // screen -> world on plane z
    toWorld(px, py, z) {
      const v = new T.Vector3((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1, 0.5).unproject(this.cam);
      const d = v.sub(this.cam.position).normalize(); const t = (z - this.cam.position.z) / d.z; return this.cam.position.clone().add(d.multiplyScalar(t));
    },
    toScreen(x, y, z) { const v = new T.Vector3(x, y, z).project(this.cam); return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h }; },
    tween(dur, fn, delay = 0, done) { this.tweens.push({ t: -delay, dur, fn, done }); this.dirty = true; },

    // ---------- game-facing API ----------
    clearAll() { for (const b of this.jelly.items) b.alive = false; this.board.fill(null); this.trayB = [[], [], []]; this.ghostHide(); },
    flavourColor(f) { return this.colors[f]; },
    setTray(tray) {
      for (let i = 0; i < 3; i++) {
        for (const b of this.trayB[i]) b.alive = false; this.trayB[i] = [];
        const t = tray[i]; if (!t || t.used) continue;
        const sh = t.shape; const ox = (sh.wd - 1) / 2, oy = (sh.h - 1) / 2;
        for (const [dr, dc] of sh.cells) {
          const b = this.jelly.add({ c: this.colors[t.flav].clone(), face: 1 });
          b.lx = dc - ox; b.ly = oy - dr; b.slot = i;
          b.x = TRAY_X[i] + b.lx * TRAY_S; b.y = TRAY_Y + b.ly * TRAY_S - 3; b.z = 0.3; b.sx = b.sy = b.sz = 0.01;
          this.trayB[i].push(b);
          const d = i * 0.06 + Math.random() * 0.05;
          this.tween(0.42, k => { const e = backOut(k); b.y = TRAY_Y + b.ly * TRAY_S - 3 * (1 - e); const s = TRAY_S * Math.min(1, k * 2.2) * 1; b.sx = b.sy = b.sz = s; }, d, () => { b.wob = 0.14; });
        }
      }
    },
    trayHit(px, py) { // which slot was touched (generous zones)
      const w = this.toWorld(px, py, 0.3); if (w.y > TRAY_Y + 2.1 || w.y < TRAY_Y - 2.6) return -1;
      let best = -1, bd = 9; for (let i = 0; i < 3; i++) { if (!this.trayB[i].length) continue; const d = Math.abs(w.x - TRAY_X[i]); if (d < bd && d < 1.9) { bd = d; best = i; } } return best;
    },
    // dragging: piece floats above the finger, full board size, lifted toward camera
    dragStart(i) { this.drag = { i, k: 0 }; for (const b of this.trayB[i]) { b.wob = 0.12; } this.tween(0.14, k => { if (this.drag) this.drag.k = k; }); },
    dragTo(px, py, liftPx) {
      if (!this.drag) return null; const i = this.drag.i, k = this.drag.k;
      const w = this.toWorld(px, py - liftPx, 1.0);
      const s = TRAY_S + (1.02 - TRAY_S) * k;
      for (const b of this.trayB[i]) { b.x = w.x + b.lx * s; b.y = w.y + b.ly * s; b.z = 0.3 + 0.7 * k; b.sx = b.sy = b.sz = s * 0.97; }
      // shadow
      this.shadow.visible = true; const pw = this.toWorld(px, py - liftPx, BZ); this.shadow.position.set(pw.x + 0.25, pw.y - 0.35, -0.08);
      const arr = this.trayB[i]; const sw = (Math.max(...arr.map(b => b.lx)) - Math.min(...arr.map(b => b.lx)) + 1.6), shh = (Math.max(...arr.map(b => b.ly)) - Math.min(...arr.map(b => b.ly)) + 1.6); this.shadow.scale.set(sw, shh, 1);
      this.dirty = true;
      // top-left cell of the shape under the piece (use shape-centre projected onto the board plane)
      const c0 = Math.min(...arr.map(b => b.lx)), r0 = Math.max(...arr.map(b => b.ly));
      const cx = pw.x + c0, cy = pw.y + r0;
      return { c: Math.round(cx / CELL + 3.5), r: Math.round(3.5 - cy / CELL) };
    },
    dragBack() { // return to tray with a springy bounce
      const i = this.drag.i; this.drag = null; this.shadow.visible = false; this.ghostHide();
      for (const b of this.trayB[i]) { const fx = b.x, fy = b.y, fz = b.z, fs = b.sx; const tx = TRAY_X[i] + b.lx * TRAY_S, ty = TRAY_Y + b.ly * TRAY_S; this.tween(0.32, k => { const e = backOut(k); b.x = fx + (tx - fx) * e; b.y = fy + (ty - fy) * e; b.z = fz + (0.3 - fz) * e; b.sx = b.sy = b.sz = fs + (TRAY_S - fs) * e; }, 0, () => { b.wob = 0.1; }); }
    },
    ghostShow(pv, flav, cleared) {
      for (const b of this.ghost.items) b.alive = false; this.ghost.items.length = 0;
      const c = this.colors[flav];
      for (const [r, cc] of pv.cells) { const p = this.cellPos(r, cc); this.ghost.add({ x: p.x, y: p.y, z: BZ, sx: 0.9, sy: 0.9, sz: 0.55, c: c.clone(), face: 0, wob: 0 }); }
      // lines that would clear: board jellies glow
      const glow = new Set(); for (const r of pv.rows) for (let j = 0; j < N; j++) glow.add(r * N + j); for (const cc of pv.cols) for (let j = 0; j < N; j++) glow.add(j * N + cc);
      for (let k = 0; k < N * N; k++) { const b = this.board[k]; if (b) b.flash = glow.has(k) ? 0.38 : 0; }
      this.glowing = glow.size > 0; this.dirty = true;
    },
    ghostHide() { for (const b of this.ghost.items) b.alive = false; this.ghost.items.length = 0; if (this.glowing) { for (const b of this.board) if (b) b.flash = 0; this.glowing = false; } },
    // the dragged piece drops into its cells
    placePiece(ev) {
      const i = ev.ti; const arr = this.trayB[i]; this.trayB[i] = []; this.drag = null; this.shadow.visible = false; this.ghostHide();
      ev.cells.forEach(([r, c], n) => {
        const b = arr[n]; const p = this.cellPos(r, c); const fx = b.x, fy = b.y, fz = b.z, fs = b.sx;
        this.board[r * N + c] = b;
        this.tween(0.09, k => { b.x = fx + (p.x - fx) * k; b.y = fy + (p.y - fy) * k; b.z = fz + (BZ - fz) * k; b.sx = b.sy = fs + (1 - fs) * k; b.sz = fs + (1 - fs) * k; }, 0, () => {
          this.tween(0.32, k => { const sq = Math.sin(k * Math.PI) * (1 - k); b.sz = 1 - 0.38 * sq; b.sx = b.sy = 1 + 0.2 * sq; }, 0, () => { b.sx = b.sy = b.sz = 1; });
          b.wob = 0.11;
        });
      });
      // neighbours ripple
      setTimeout(() => { for (const [r, c] of ev.cells) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (r + dr) * N + c + dc; if (r + dr >= 0 && r + dr < N && c + dc >= 0 && c + dc < N && this.board[k]) this.board[k].wob = Math.max(this.board[k].wob, 0.06); } }, 90);
    },
    // line clear: flash, swell, burst into particles that stream into the jar
    clearLines(ev, origin, onJelly) {
      const o = origin || { r: 3.5, c: 3.5 };
      const jarTop = new T.Vector3(JAR_POS.x, JAR_POS.y + 1.0, JAR_POS.z);
      ev.cleared.forEach(([r, c, f], n) => {
        const k = r * N + c; const b = this.board[k]; this.board[k] = null; if (!b) return;
        const d = Math.hypot(r - o.r, c - o.c) * 0.028;
        b.face = 1;
        this.tween(0.1, t => { b.flash = t * 0.85; b.sx = b.sy = b.sz = 1 + 0.22 * t; b.z = BZ + 0.25 * t; }, d, () => {
          this.tween(0.12, t => { b.sx = b.sy = b.sz = 1.22 * (1 - t); b.flash = 0.85 * (1 - t); }, 0, () => { b.alive = false; });
          const p = this.cellPos(r, c); const col = this.colors[f] || this.colors[7];
          for (let q = 0; q < 5; q++) this.parts.emit({ x: p.x, y: p.y, z: 0.5, vx: (Math.random() - 0.5) * 7, vy: Math.random() * 6 + 1, vz: 0, g: -16, life: 0.45 + Math.random() * 0.35, s: 0.22 + Math.random() * 0.18, c: col.clone().lerp(new T.Color(1, 1, 1), 0.15) });
          if (n % 2 === 0) this.parts.emit({ sx: p.x, sy: p.y, sz: 0.6, x: p.x, y: p.y, z: 0.6, target: jarTop, arc: (Math.random() - 0.5) * 2.5, life: 0.55 + Math.random() * 0.25, s: 0.3, c: col.clone() });
        });
      });
      const maxD = ev.cleared.reduce((m, [r, c]) => Math.max(m, Math.hypot(r - o.r, c - o.c) * 0.028), 0);
      setTimeout(() => onJelly && onJelly(), (maxD + 0.55) * 1000);
      if (ev.lines >= 2 || ev.boardClear) this.shake(ev.boardClear ? 0.35 : 0.12 + ev.lines * 0.04);
    },
    setJar(level, cap, ready) {
      const J = this.jar; J.target = Math.min(1, level / cap); J.ready = ready; this.dirty = true;
    },
    // pour: jar flies over the target, tips, jelly falls into the empty cells
    pourAnim(ev, onLand) {
      const J = this.jar; const tc = this.cellPos(ev.r, ev.c); const tgt = new T.Vector3(tc.x + 1.25, tc.y + 2.4, 2.2);
      const start = J.group.position.clone(); const pink = this.colors[7];
      this.tween(0.32, k => { const e = easeInOut(k); J.group.position.lerpVectors(start, tgt, e); J.group.rotation.z = 0.9 * e; J.group.scale.setScalar(1 + 0.15 * e); }, 0, () => {
        // stream
        const mouth = () => J.group.position.clone().add(new T.Vector3(-0.85, -0.35, 0));
        for (let q = 0; q < 46; q++) setTimeout(() => { const m = mouth(); const cell = ev.area[q % ev.area.length]; const p = this.cellPos(cell[0], cell[1]); this.parts.emit({ sx: m.x, sy: m.y, sz: m.z, x: m.x, y: m.y, z: m.z, target: { x: p.x, y: p.y, z: 0.4 }, arc: 0.4, life: 0.28, s: 0.34, c: pink.clone() }); }, q * 9);
        J.target = 0;
        setTimeout(() => {
          ev.poured.forEach(([r, c], n) => {
            const p = this.cellPos(r, c); const b = this.jelly.add({ x: p.x, y: p.y, z: 0.8, sx: 0.01, sy: 0.01, sz: 0.01, c: pink.clone(), face: 1 });
            this.board[r * N + c] = b;
            this.tween(0.3, k => { const e = backOut(k); b.sx = b.sy = b.sz = e; b.z = BZ + 0.6 * (1 - k); }, n * 0.03, () => { b.wob = 0.16; });
          });
          setTimeout(() => onLand && onLand(), 360 + ev.poured.length * 30);
        }, 300);
        this.tween(0.38, k => { const e = easeInOut(k); J.group.position.lerpVectors(tgt, J.base, e); J.group.rotation.z = 0.9 * (1 - e); J.group.scale.setScalar(1.15 - 0.15 * e); }, 0.75);
      });
    },
    // 'clear' mode pop: burst the jellies in the area
    popAnim(ev) {
      const c0 = this.cellPos(ev.r, ev.c);
      for (let q = 0; q < 40; q++) { const a = Math.random() * 6.28, sp = 4 + Math.random() * 8; this.parts.emit({ x: c0.x, y: c0.y, z: 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: -6, life: 0.6 + Math.random() * 0.3, s: 0.3 + Math.random() * 0.25, c: this.colors[7].clone() }); }
      ev.cleared.forEach(([r, c, f]) => { const k = r * N + c, b = this.board[k]; this.board[k] = null; if (!b) return; this.tween(0.18, t => { b.sx = b.sy = b.sz = 1 + 0.4 * t; b.flash = t; }, Math.random() * 0.05, () => { b.alive = false; }); });
      this.jar.target = 0; this.shake(0.3);
    },
    titleDemo() { // a little jelly arrangement behind the title, so the first screen is alive
      const pat = ['........', '.11..22.', '.11..22.', '........', '3......4', '.3....4.', '..5555..', '........'];
      pat.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '.') return; const p = this.cellPos(r, c); const f = +ch; const b = this.jelly.add({ x: p.x, y: p.y, z: BZ, sx: 0.01, sy: 0.01, sz: 0.01, c: this.colors[f].clone(), face: 1 }); this.board[r * N + c] = b; this.tween(0.45, k => { b.sx = b.sy = b.sz = backOut(k); }, 0.15 + (r + c) * 0.04, () => { b.wob = 0.12; }); }));
    },
    shake(a) { this.shakeAmp = Math.max(this.shakeAmp || 0, a); },
    setMood(m) { for (const b of this.board) if (b) b.face = m; for (const arr of this.trayB) for (const b of arr) b.face = m; this.dirty = true; },
    gameOverAnim() { let n = 0; for (let r = N - 1; r >= 0; r--) for (let c = 0; c < N; c++) { const b = this.board[r * N + c]; if (!b) continue; const col = b.c.clone(); this.tween(0.3, k => { b.c.copy(col).lerp(new T.Color(0.32, 0.3, 0.38), k * 0.75); b.face = 3; }, (N - 1 - r) * 0.06 + c * 0.01); n++; } },
    wipeBoard(done) { let d = 0; for (let k = 0; k < N * N; k++) { const b = this.board[k]; if (!b) continue; this.board[k] = null; d = Math.max(d, (k % N) * 0.015 + Math.floor(k / N) * 0.02); this.tween(0.16, t => { b.sx = b.sy = b.sz = 1 - t; }, (k % N) * 0.015 + Math.floor(k / N) * 0.02, () => { b.alive = false; }); } for (const arr of this.trayB) for (const b of arr) b.alive = false; this.trayB = [[], [], []]; setTimeout(done, d * 1000 + 180); },

    frame(dt) {
      this.time += dt; const busy = this.tweens.length > 0 || !!this.drag || this.parts.list.length > 0;
      for (let i = this.tweens.length - 1; i >= 0; i--) { const t = this.tweens[i]; t.t += dt; if (t.t < 0) continue; const k = Math.min(1, t.t / t.dur); t.fn(k); if (k >= 1) { this.tweens.splice(i, 1); t.done && t.done(); } }
      let wob = false; for (const b of this.jelly.items) { if (b.wob > 0.002) { b.wob *= Math.pow(0.0025, dt); wob = true; } else b.wob = 0; }
      // jar: fill level spring + pressure wobble when full
      const J = this.jar; J.shown += ((J.target || 0) - J.shown) * Math.min(1, dt * 6);
      J.fill.scale.y = Math.max(0.001, J.shown * (J.H - 0.3)); J.fill.visible = J.shown > 0.01;
      J.glassMat.uniforms.uGlow.value += ((J.ready ? 1 : 0) - J.glassMat.uniforms.uGlow.value) * Math.min(1, dt * 5);
      J.glassMat.uniforms.uTime.value = this.time;
      if (J.ready && !this.tweens.some(t => t.jar)) { J.group.rotation.z = Math.sin(this.time * 18) * 0.035; J.lid.position.y = J.H / 2 + 0.1 + Math.abs(Math.sin(this.time * 9)) * 0.06; }
      else if (!this.pouring) { J.lid.position.y = J.H / 2 + 0.1; }
      // camera shake
      if (this.shakeAmp > 0.001) { this.shakeAmp *= Math.pow(0.002, dt); this.cam.position.x = (Math.random() - 0.5) * this.shakeAmp; } else if (this.shakeAmp) { this.shakeAmp = 0; this.cam.position.x = 0; }
      const np = this.parts.update(dt);
      this.jellyMat.uniforms.uTime.value = this.time; this.ghostMat.uniforms.uTime.value = this.time;
      this.ghost.items.forEach(b => { b.sz = 0.55 + Math.sin(this.time * 7) * 0.05; });
      const active = busy || wob || np > 0 || Math.abs(J.shown - (J.target || 0)) > 0.002 || J.ready || this.dirty || this.shakeAmp > 0;
      this.active = active;
      if (active) this.idleSince = this.time;
      return active;
    },
    render() { this.jelly.sync(); this.ghost.sync(); this.sockets.sync(); this.renderer.render(this.scene, this.cam); this.dirty = false; }
  };
  function backOut(k) { const s = 1.70158; k -= 1; return k * k * ((s + 1) * k + s) + 1; }
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  window.JJView = View;
})();
