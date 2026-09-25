import * as THREE from 'three';

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
    hills.forEach((h) => { h.a *= def.hills / sh; });

    let amp = def.wiggle;
    for (let tries = 0; tries < 16; tries++) {
      this._sample(def.R, amp, harm, hills);
      if (this.minRadius >= 42 && this.minSep >= 140) break;
      amp *= 0.86;
    }
    this._alignStart();
    let minY = Infinity;
    for (let i = 0; i < this.N; i++) minY = Math.min(minY, this.py[i]);
    this.groundY = minY - 4;
    this._out = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1, rx: 1, rz: 0, k: 0 };
  }

  _sample(R, amp, harm, hills) {
    const M = 6000;
    const fx = new Float64Array(M + 1), fy = new Float64Array(M + 1), fz = new Float64Array(M + 1), cum = new Float64Array(M + 1);
    for (let i = 0; i <= M; i++) {
      const th = (i / M) * Math.PI * 2;
      let r = 0; for (const h of harm) r += h.a * Math.sin(h.k * th + h.p);
      r = R * (1 + amp * r);
      let y = 0; for (const h of hills) y += h.a * Math.sin(h.k * th + h.p);
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
  terrainY(base, d) {
    if (d <= EDGE) return base;
    const t = Math.min(1, (d - EDGE) / SHOULDER);
    const e = t < 0.12 ? 0 : (t - 0.12) / 0.88;
    const sm = e * e * (3 - 2 * e);
    return base - (base - this.groundY + 0.8) * sm;
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
      const P = (i, x) => [this.px[i] + this.rx[i] * x, yFn(this.py[i], x) + lift, this.pz[i] + this.rz[i] * x];
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
    const shoulder = quadStrip(xs, (b, x) => this.terrainY(b, Math.abs(x)), (i, m) => {
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
    return group;
  }
}
