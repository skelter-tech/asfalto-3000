import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ROAD_W = 15;
export const HALF = ROAD_W / 2;
export const KERB_W = 1.3;
export const EDGE = HALF + KERB_W;
const DS = 2.5;
const SHOULDER = 64;

// Pista fechada: curva polar r(θ) com harmônicos (nunca se cruza) e morros periódicos.
export class Track {
  constructor(def, rng) {
    const harm = [];
    for (let k = 2; k <= 6; k++) harm.push({ k, a: (0.35 + rng() * 0.65) / Math.pow(k, 1.15), p: rng() * Math.PI * 2 });
    const sa = harm.reduce((s, h) => s + h.a, 0);
    harm.forEach((h) => { h.a /= sa; });
    const hills = [2, 3, 4, 6, 9].map((k) => ({ k, a: (0.3 + rng() * 0.7) / Math.sqrt(k), p: rng() * Math.PI * 2 }));
    const sh = hills.reduce((s, h) => s + h.a, 0);
    hills.forEach((h) => { h.a *= (def.hills * 1.45) / sh; });
    // lombadas curtas: é nelas que o carro tira as rodas do chão
    for (const k of [12, 15, 19]) hills.push({ k, a: def.hills * (0.11 + rng() * 0.07), p: rng() * Math.PI * 2 });

    let amp = def.wiggle, hs = 1;
    for (let tries = 0; tries < 24; tries++) {
      this._sample(def.R, amp, harm, hills, hs);
      const shape = this.minRadius >= 42 && this.minSep >= 140, slope = this.maxSlope <= 0.19;
      if (shape && slope) break;
      if (!shape) amp *= 0.86;
      if (!slope) hs *= 0.88;
    }
    this._alignStart();
    let minY = Infinity;
    for (let i = 0; i < this.N; i++) minY = Math.min(minY, this.py[i]);
    this.groundY = minY - 4;
    this._features();
    this._out = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1, rx: 1, rz: 0, k: 0 };
  }

  _sample(R, amp, harm, hills, hs = 1) {
    const M = 6000;
    const fx = new Float64Array(M + 1), fy = new Float64Array(M + 1), fz = new Float64Array(M + 1), cum = new Float64Array(M + 1);
    for (let i = 0; i <= M; i++) {
      const th = (i / M) * Math.PI * 2;
      let r = 0; for (const h of harm) r += h.a * Math.sin(h.k * th + h.p);
      r = R * (1 + amp * r);
      let y = 0; for (const h of hills) y += h.a * Math.sin(h.k * th + h.p);
      y *= hs;
      fx[i] = r * Math.cos(th); fz[i] = r * Math.sin(th); fy[i] = y;
      if (i > 0) cum[i] = cum[i - 1] + Math.hypot(fx[i] - fx[i - 1], fy[i] - fy[i - 1], fz[i] - fz[i - 1]);
    }
    const L = cum[M];
    const N = Math.round(L / DS);
    const ds = L / N;
    this.length = L; this.N = N; this.ds = ds;
    const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * ds;
      while (j < M - 1 && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      px[i] = fx[j] + (fx[j + 1] - fx[j]) * f;
      py[i] = fy[j] + (fy[j + 1] - fy[j]) * f;
      pz[i] = fz[j] + (fz[j + 1] - fz[j]) * f;
    }
    this.px = px; this.py = py; this.pz = pz;
    this._frames();

    // separação mínima entre trechos distantes da pista
    const step = 8, gap = Math.ceil(320 / ds);
    let minSep = Infinity;
    for (let a = 0; a < N; a += step) {
      for (let b = a + step; b < N; b += step) {
        const g = Math.min(b - a, N - (b - a));
        if (g < gap) continue;
        const d = Math.hypot(px[a] - px[b], pz[a] - pz[b]);
        if (d < minSep) minSep = d;
      }
    }
    this.minSep = minSep;
  }

  _frames() {
    const { N, px, py, pz, ds } = this;
    const tx = new Float32Array(N), ty = new Float32Array(N), tz = new Float32Array(N);
    const rx = new Float32Array(N), rz = new Float32Array(N), k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dy, dz);
      tx[i] = dx / l; ty[i] = dy / l; tz[i] = dz / l;
      const lf = Math.hypot(dx, dz);
      rx[i] = -dz / lf; rz[i] = dx / lf; // cross(t, up)
    }
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const fa = Math.hypot(tx[a], tz[a]), fb = Math.hypot(tx[b], tz[b]);
      const dxt = tx[b] / fb - tx[a] / fa, dzt = tz[b] / fb - tz[a] / fa;
      raw[i] = (dxt * rx[i] + dzt * rz[i]) / (2 * ds);
    }
    let maxK = 0;
    for (let i = 0; i < N; i++) {
      let s = 0; for (let d = -4; d <= 4; d++) s += raw[(i + d + N) % N];
      k[i] = s / 9;
      maxK = Math.max(maxK, Math.abs(k[i]));
    }
    this.tx = tx; this.ty = ty; this.tz = tz; this.rx = rx; this.rz = rz; this.k = k;
    this.minRadius = 1 / Math.max(maxK, 1e-6);
    let ms = 0; for (let i = 0; i < N; i++) ms = Math.max(ms, Math.abs(ty[i]));
    this.maxSlope = ms;
  }

  _alignStart() {
    const { N, k } = this;
    let best = 0, bestV = Infinity;
    for (let i = 0; i < N; i += 2) {
      let v = 0;
      for (let d = -40; d <= 70; d += 2) v += Math.abs(k[(i + d + N) % N]);
      if (v < bestV) { bestV = v; best = i; }
    }
    const rot = (arr) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = arr[(i + best) % N]; return o; };
    for (const key of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'rx', 'rz', 'k']) this[key] = rot(this[key]);
  }

  // Ponte: o trecho mais longo bem acima do chão. Túnel: o trecho mais rente ao chão, longe da ponte.
  _features() {
    const { N, ds, py, groundY } = this;
    this.bf = new Float32Array(N); this.tf = new Float32Array(N);
    this.bridge = null; this.tunnel = null;
    const lo = Math.ceil(160 / ds), hi = N - Math.ceil(120 / ds);
    let best = null, run = null;
    for (let i = lo; i <= hi; i++) {
      const high = i < hi && py[i] - groundY > 15;
      if (high) { if (!run) run = { i0: i, i1: i }; run.i1 = i; }
      else if (run) { if (!best || run.i1 - run.i0 > best.i1 - best.i0) best = run; run = null; }
    }
    if (best && best.i1 - best.i0 >= Math.ceil(110 / ds)) {
      const mid = (best.i0 + best.i1) >> 1, half = Math.min(Math.ceil(130 / ds), (best.i1 - best.i0 - 8) >> 1);
      this.bridge = { i0: mid - half, i1: mid + half };
      for (let i = mid - half; i <= mid + half; i++) {
        const e = Math.min(1, Math.min(i - (mid - half), mid + half - i) / 10);
        this.bf[i] = e * e * (3 - 2 * e);
      }
    }
    const tl = Math.ceil(210 / ds);
    let bi = -1, bv = Infinity;
    for (let i = Math.ceil(320 / ds); i < N - tl - Math.ceil(160 / ds); i += 4) {
      if (this.bridge && i + tl > this.bridge.i0 - 60 && i < this.bridge.i1 + 60) continue;
      let v = 0; for (let j = 0; j < tl; j += 4) v += py[i + j] - groundY;
      if (v < bv) { bv = v; bi = i; }
    }
    if (bi >= 0) { this.tunnel = { i0: bi, i1: bi + tl }; for (let i = bi; i <= bi + tl; i++) this.tf[i] = 1; }
  }
  _idx(s) { return Math.floor(this.wrap(s) / this.ds) % this.N; }
  bfAt(s) { return this.bf[this._idx(s)]; }
  tfAt(s) { return this.tf[this._idx(s)]; }
  inTunnelZone(s, margin) {
    if (!this.tunnel) return false;
    const w = this.wrap(s), a = this.tunnel.i0 * this.ds - margin, b = this.tunnel.i1 * this.ds + margin;
    return w > a && w < b;
  }

  wrap(s) { const L = this.length; return ((s % L) + L) % L; }

  // Amostra interpolada em s. Reusa o mesmo objeto de saída se `out` não for passado.
  sample(s, out = this._out) {
    const u = this.wrap(s) / this.ds;
    const i = Math.floor(u) % this.N, j = (i + 1) % this.N, f = u - Math.floor(u);
    const L = (arr) => arr[i] + (arr[j] - arr[i]) * f;
    out.x = L(this.px); out.y = L(this.py); out.z = L(this.pz);
    out.tx = L(this.tx); out.ty = L(this.ty); out.tz = L(this.tz);
    const rx = L(this.rx), rz = L(this.rz), rl = Math.hypot(rx, rz);
    out.rx = rx / rl; out.rz = rz / rl;
    out.k = L(this.k);
    return out;
  }

  curvAt(s) {
    const u = this.wrap(s) / this.ds;
    return this.k[Math.floor(u) % this.N];
  }

  // Altura do terreno a uma distância lateral d (>= 0) do centro, dada a altura da pista.
  terrainY(base, d, bf = 0) {
    if (d <= EDGE) return base;
    const t = Math.min(1, (d - EDGE) / SHOULDER);
    const e = t < 0.12 ? 0 : (t - 0.12) / 0.88;
    const sm = e * e * (3 - 2 * e);
    const y = base - (base - this.groundY + 0.8) * sm;
    return bf > 0 ? y + (this.groundY - 1.5 - y) * bf : y;
  }

  // Distância horizontal aproximada até a pista mais próxima (amostragem grossa).
  distToTrack(x, z) {
    let m = Infinity;
    for (let i = 0; i < this.N; i += 3) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  }

  // ----- Geometria -----
  buildMeshes(planet, def) {
    const group = new THREE.Group();
    const N = this.N, ds = this.ds;
    const col = (h) => new THREE.Color(h);
    const roadA = col(planet.road[0]), roadB = col(planet.road[1]);
    const kerbA = col(planet.kerb[0]), kerbB = col(planet.kerb[1]);
    const gA = col(planet.ground[0]), gB = col(planet.ground[1]), gFar = col(planet.groundFar);

    const quadStrip = (xs, yFn, colorFn, lift = 0) => {
      const pos = [], cols = [];
      const P = (i, x) => [this.px[i] + this.rx[i] * x, yFn(this.py[i], x, i) + lift, this.pz[i] + this.rz[i] * x];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        for (let m = 0; m < xs.length - 1; m++) {
          const x0 = xs[m], x1 = xs[m + 1];
          const c = colorFn(i, m);
          if (!c) continue;
          const A = P(i, x0), B = P(j, x0), C = P(j, x1), D = P(i, x1);
          pos.push(...A, ...C, ...B, ...A, ...D, ...C);
          for (let q = 0; q < 6; q++) cols.push(c.r, c.g, c.b);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      return g;
    };

    const lambert = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
    const flat = (b) => b;
    const band = (i, len) => Math.floor((i * ds) / len) % 2;

    // asfalto
    const road = quadStrip([-HALF, HALF], flat, (i) => (band(i, 14) ? roadA : roadB));
    group.add(new THREE.Mesh(road, lambert()));

    // zebras
    const kerb = quadStrip([-EDGE, -HALF, HALF, EDGE], (b) => b + 0.03, (i, m) => (m === 1 ? null : band(i, 5) ? kerbA : kerbB));
    group.add(new THREE.Mesh(kerb, lambert()));

    // acostamento / grama em faixas alternadas
    const offs = [0, 3, 8, 15, 24, 36, 50, SHOULDER + 4];
    const xs = [];
    for (let q = offs.length - 1; q >= 0; q--) xs.push(-(EDGE + offs[q]));
    for (let q = 0; q < offs.length; q++) xs.push(EDGE + offs[q]);
    const mid = offs.length - 1;
    const tmp = new THREE.Color();
    const shoulder = quadStrip(xs, (b, x, i) => this.terrainY(b, Math.abs(x), this.bf[i]), (i, m) => {
      if (m === mid) return null;
      const dist = m < mid ? mid - 1 - m : m - mid - 1; // 0 = junto à pista
      const base = band(i, 18) ? gA : gB;
      return tmp.copy(base).lerp(gFar, Math.min(1, dist / 5) * 0.8).clone();
    });
    group.add(new THREE.Mesh(shoulder, lambert()));

    // chão distante
    const ground = new THREE.Mesh(new THREE.CircleGeometry(5000, 48), new THREE.MeshLambertMaterial({ color: gFar }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = this.groundY - 0.3;
    group.add(ground);

    // faixas pintadas
    const lineCol = col(planet.line);
    const lineMat = planet.lineGlow
      ? new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) })
      : lambert();
    lineMat.polygonOffset = true; lineMat.polygonOffsetFactor = -2; lineMat.polygonOffsetUnits = -2;
    const white = new THREE.Color('#f4f4f4');
    const lines = quadStrip(
      [-HALF + 0.35, -HALF + 0.65, -HALF / 3 - 0.12, -HALF / 3 + 0.12, HALF / 3 - 0.12, HALF / 3 + 0.12, HALF - 0.65, HALF - 0.35],
      (b) => b + 0.02,
      (i, m) => {
        if (m === 0 || m === 6) return lineCol;
        if (m === 2 || m === 4) return band(i, 7) ? (planet.lineGlow ? lineCol : white) : null;
        return null;
      },
    );
    group.add(new THREE.Mesh(lines, lineMat));

    // linha de largada quadriculada
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
    const cx = cv.getContext('2d');
    for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) { cx.fillStyle = (a + b) % 2 ? '#111' : '#f5f5f5'; cx.fillRect(a * 8, b * 8, 8, 8); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const slMat = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const s0 = this.sample(0, {});
    const holder = new THREE.Group();
    holder.position.set(s0.x, s0.y + 0.03, s0.z);
    holder.rotation.y = Math.atan2(s0.tx, s0.tz);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 3.2), slMat);
    plane.rotation.x = -Math.PI / 2;
    holder.add(plane);
    group.add(holder);
    if (this.bridge) group.add(this._bridgeMeshes());
    if (this.tunnel) group.add(this._tunnelMeshes(planet));
    return group;
  }

  // peça posicionada no referencial da pista: x lateral, y acima da pista
  _placed(geo, i, x, y, yawExtra = 0) {
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(this.tx[i], this.tz[i]) + yawExtra);
    m.setPosition(this.px[i] + this.rx[i] * x, this.py[i] + y, this.pz[i] + this.rz[i] * x);
    return geo.clone().applyMatrix4(m);
  }

  _bridgeMeshes() {
    const g = new THREE.Group();
    const { i0, i1 } = this.bridge;
    const side = [], rails = [], pillars = [];
    for (let i = i0; i < i1; i++) {
      const j = i + 1;
      for (const sd of [-1, 1]) {
        const x = sd * EDGE;
        const A = [this.px[i] + this.rx[i] * x, this.py[i] + 0.04, this.pz[i] + this.rz[i] * x];
        const B = [this.px[j] + this.rx[j] * x, this.py[j] + 0.04, this.pz[j] + this.rz[j] * x];
        side.push(...A, ...B, B[0], B[1] - 1.6, B[2], ...A, B[0], B[1] - 1.6, B[2], A[0], A[1] - 1.6, A[2]);
      }
      if ((i - i0) % 2 === 0) {
        const len = this.ds * 2 + 0.05;
        const rail = new THREE.BoxGeometry(0.22, 0.28, len); rail.translate(0, 0.85, len / 2 - 0.02);
        const post = new THREE.BoxGeometry(0.14, 0.9, 0.14); post.translate(0, 0.45, 0);
        for (const sd of [-1, 1]) { rails.push(this._placed(rail, i, sd * (EDGE - 0.2), 0), this._placed(post, i, sd * (EDGE - 0.2), 0)); }
      }
      if ((i - i0) % 10 === 5 && this.bf[i] > 0.6) {
        const h = this.py[i] - 1.6 - (this.groundY - 2);
        const p = new THREE.CylinderGeometry(1.1, 1.4, h, 10); p.translate(0, -1.6 - h / 2, 0);
        const cap = new THREE.BoxGeometry(ROAD_W + 1, 0.9, 2.2); cap.translate(0, -2.05, 0);
        pillars.push(this._placed(p, i, -HALF + 2.5, 0), this._placed(p, i, HALF - 2.5, 0), this._placed(cap, i, 0, 0));
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
    sg.computeVertexNormals();
    const concrete = new THREE.MeshLambertMaterial({ color: '#9ba1ad', side: THREE.DoubleSide, flatShading: true });
    g.add(new THREE.Mesh(sg, concrete));
    if (rails.length) g.add(new THREE.Mesh(mergeGeometries(rails.map((r) => r.toNonIndexed()), false), new THREE.MeshLambertMaterial({ color: '#e9ecf2' })));
    if (pillars.length) g.add(new THREE.Mesh(mergeGeometries(pillars.map((r) => r.toNonIndexed()), false), concrete));
    return g;
  }

  _tunnelMeshes(planet) {
    const g = new THREE.Group();
    const { i0, i1 } = this.tunnel;
    const W = EDGE + 0.9;
    const arch = [[-W, 0]];
    for (let a = 0; a <= 10; a++) { const t = Math.PI - (a / 10) * Math.PI; arch.push([Math.cos(t) * W, 4 + Math.sin(t) * 4.8]); }
    arch.push([W, 0]);
    const MW = 46;
    const moundX = []; for (let x = -MW; x <= MW + 0.01; x += 7.666) moundX.push(x);
    const moundY = (base, x) => { const c = Math.pow(Math.cos((Math.abs(x) / MW) * Math.PI / 2), 1.3); return (this.terrainY(base, Math.abs(x)) - 1.2) * (1 - c) + (base + 16) * c; };
    const tones = {
      terra: ['#7a7f8c', '#6c717e', '#5fae47'], marte: ['#8a5540', '#7c4b38', '#b8603a'],
      cristalis: ['#9bbad8', '#8cadcc', '#e4eef8'], neo: ['#2a2344', '#241e3b', '#2b2442'],
    }[planet.id];
    const cA = new THREE.Color(tones[0]), cB = new THREE.Color(tones[1]), cM = new THREE.Color(tones[2]), cM2 = cM.clone().multiplyScalar(0.9);
    const inner = [], innerC = [], mound = [], moundC = [];
    const P = (i, x, y) => [this.px[i] + this.rx[i] * x, y, this.pz[i] + this.rz[i] * x];
    for (let i = i0; i < i1; i++) {
      const j = i + 1, band = Math.floor((i * this.ds) / 8) % 2, c = band ? cA : cB;
      for (let m = 0; m < arch.length - 1; m++) {
        const [x0, y0] = arch[m], [x1, y1] = arch[m + 1];
        const A = P(i, x0, this.py[i] + y0), B = P(j, x0, this.py[j] + y0), C = P(j, x1, this.py[j] + y1), D = P(i, x1, this.py[i] + y1);
        inner.push(...A, ...B, ...C, ...A, ...C, ...D);
        for (let q = 0; q < 6; q++) innerC.push(c.r, c.g, c.b);
      }
      for (let m = 0; m < moundX.length - 1; m++) {
        const x0 = moundX[m], x1 = moundX[m + 1];
        const A = P(i, x0, moundY(this.py[i], x0)), B = P(j, x0, moundY(this.py[j], x0)), C = P(j, x1, moundY(this.py[j], x1)), D = P(i, x1, moundY(this.py[i], x1));
        mound.push(...A, ...C, ...B, ...A, ...D, ...C);
        const mc = (m + band) % 2 ? cM : cM2;
        for (let q = 0; q < 6; q++) moundC.push(mc.r, mc.g, mc.b);
      }
    }
    // bocas do túnel: contorno do morro com o arco vazado
    for (const i of [i0, i1]) {
      const base = this.py[i];
      const contour = moundX.map((x) => new THREE.Vector2(x, moundY(base, x) - base));
      const low = Math.min(-4, ...contour.map((v) => v.y)) - 1;
      contour.push(new THREE.Vector2(MW, low), new THREE.Vector2(-MW, low));
      const hole = arch.map(([x, y]) => new THREE.Vector2(x, y + 0.01));
      const tris = THREE.ShapeUtils.triangulateShape(contour, [hole]);
      const all = contour.concat(hole);
      for (const t of tris) for (const k of t) { const v = all[k]; mound.push(...P(i, v.x, base + v.y)); moundC.push(cA.r * 0.85, cA.g * 0.85, cA.b * 0.85); }
    }
    const mk = (pos, col, opts) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, ...opts }));
    };
    g.add(mk(inner, innerC), mk(mound, moundC));
    // luzes: faixas nas paredes e luminárias no teto
    const glowCol = planet.id === 'cristalis' ? new THREE.Color(0.4, 2.2, 2.8) : planet.id === 'neo' ? new THREE.Color(2.6, 0.3, 2.2) : new THREE.Color(2.8, 1.5, 0.35);
    const lights = [];
    const strip = new THREE.BoxGeometry(0.08, 0.16, this.ds * 1.02); strip.translate(0, 1.4, this.ds / 2);
    const lamp = new THREE.BoxGeometry(2.4, 0.08, 1.4);
    for (let i = i0; i < i1; i++) {
      lights.push(this._placed(strip, i, -W + 0.1, 0), this._placed(strip, i, W - 0.1, 0));
      if ((i - i0) % 5 === 0) { const l = lamp.clone(); l.translate(0, 8.7, 0); lights.push(this._placed(l, i, 0, 0)); }
    }
    g.add(new THREE.Mesh(mergeGeometries(lights.map((l) => l.toNonIndexed()), false), new THREE.MeshBasicMaterial({ color: glowCol })));
    return g;
  }
}
