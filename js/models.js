import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './save.js';

// Converte para não indexado, remove UV e pinta com cor por vértice.
export function prep(geo, hex, keepUv = false) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!keepUv && g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const merge = (parts) => mergeGeometries(parts, false);
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function radialTexture(inner = 'rgba(0,0,0,0.75)', outer = 'rgba(0,0,0,0)') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// ------------------------------------------------------------------ carro
// Carroceria "loftada": seções transversais ao longo do comprimento, ligadas com normais suaves.
function ring(st) {
  const { hw, yb, yt, belt } = st;
  const R = [[0, yb], [hw * 0.8, yb], [hw * 0.97, yb + (belt - yb) * 0.4], [hw, belt], [hw * 0.95, belt + (yt - belt) * 0.5], [hw * 0.78, yt - (yt - belt) * 0.08], [hw * 0.42, yt], [0, yt]];
  return R.concat(R.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
}
function loft(stations) {
  const rings = stations.map(ring);
  const n = rings[0].length;
  const pos = [], idx = [];
  stations.forEach((st, s) => rings[s].forEach(([x, y]) => pos.push(x, y, st.z)));
  for (let s = 0; s < stations.length - 1; s++) {
    for (let k = 0; k < n; k++) {
      const a = s * n + k, b = s * n + ((k + 1) % n), c = (s + 1) * n + k, d = (s + 1) * n + ((k + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mid = Math.floor(stations.length / 2) * n + 7; // centro do topo
  if (g.attributes.normal.getY(mid) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  const caps = [];
  for (const [s, flip] of [[0, true], [stations.length - 1, false]]) {
    const shp = new THREE.Shape(rings[s].map(([x, y]) => new THREE.Vector2(x, y)));
    const cg = new THREE.ShapeGeometry(shp);
    cg.deleteAttribute('uv');
    if (flip) cg.rotateY(Math.PI);
    cg.translate(0, 0, stations[s].z);
    caps.push(cg);
  }
  return mergeGeometries([g, ...caps], false);
}
const S = (z, hw, yb, belt, yt) => ({ z, hw, yb, belt, yt });

let CAR = null;
function carGeometries() {
  if (CAR) return CAR;
  const body = loft([
    S(-2.34, 0.80, 0.32, 0.50, 0.80), S(-2.30, 0.90, 0.26, 0.54, 0.88), S(-2.15, 0.95, 0.23, 0.58, 0.94),
    S(-1.88, 0.97, 0.23, 0.61, 0.96), S(-1.74, 0.97, 0.36, 0.62, 0.97), S(-1.56, 0.97, 0.50, 0.63, 0.97),
    S(-1.42, 0.97, 0.54, 0.63, 0.97), S(-1.28, 0.97, 0.50, 0.63, 0.96), S(-1.10, 0.97, 0.36, 0.62, 0.95),
    S(-0.96, 0.97, 0.23, 0.61, 0.94), S(-0.40, 0.95, 0.22, 0.59, 0.92), S(0.30, 0.93, 0.22, 0.57, 0.88),
    S(0.95, 0.91, 0.23, 0.56, 0.83), S(1.09, 0.91, 0.36, 0.60, 0.80), S(1.27, 0.91, 0.49, 0.64, 0.78),
    S(1.45, 0.91, 0.53, 0.66, 0.78), S(1.63, 0.90, 0.49, 0.64, 0.74), S(1.81, 0.88, 0.36, 0.57, 0.68),
    S(1.95, 0.86, 0.24, 0.50, 0.62), S(2.15, 0.80, 0.24, 0.43, 0.53), S(2.30, 0.68, 0.27, 0.38, 0.45),
    S(2.37, 0.52, 0.31, 0.36, 0.40),
  ]);
  const cabin = loft([
    S(-1.40, 0.70, 0.93, 0.95, 0.97), S(-1.15, 0.74, 0.90, 0.97, 1.10), S(-0.70, 0.76, 0.88, 0.97, 1.24),
    S(0.05, 0.76, 0.86, 0.95, 1.27), S(0.45, 0.74, 0.84, 0.92, 1.18), S(0.85, 0.70, 0.80, 0.85, 0.95),
    S(1.08, 0.64, 0.78, 0.80, 0.81),
  ]);
  const roof = loft([
    S(-0.80, 0.40, 1.17, 1.20, 1.235), S(-0.55, 0.44, 1.20, 1.235, 1.262), S(0.05, 0.44, 1.215, 1.25, 1.285),
    S(0.35, 0.42, 1.17, 1.21, 1.235),
  ]);
  const box = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); g.deleteAttribute('uv'); return g; };
  const paintParts = mergeGeometries([
    body, roof,
    box(1.86, 0.05, 0.38, 0, 1.13, -2.0, -0.08),
    box(0.04, 0.26, 0.48, 0.93, 1.08, -2.0), box(0.04, 0.26, 0.48, -0.93, 1.08, -2.0),
    box(0.16, 0.08, 0.11, 0.86, 0.95, 0.72), box(0.16, 0.08, 0.11, -0.86, 0.95, 0.72),
  ].map((g) => (g.index ? g.toNonIndexed() : g)), false);
  const darkList = [
    box(0.06, 0.2, 0.14, 0.52, 0.99, -1.96), box(0.06, 0.2, 0.14, -0.52, 0.99, -1.96),
    box(1.2, 0.1, 0.14, 0, 0.3, -2.3), box(0.9, 0.08, 0.05, 0, 0.33, 2.35),
  ];
  for (let r = 0; r < 4; r++) {
    darkList.push(box(1.52, 0.022, 0.03, 0, 0.525 + r * 0.05, -2.37));
    darkList.push(box(0.03, 0.03, 0.9, 0.955, 0.42 + r * 0.045, -0.55), box(0.03, 0.03, 0.9, -0.955, 0.42 + r * 0.045, -0.55));
  }
  const dark = mergeGeometries(darkList, false);
  const tail = box(1.46, 0.19, 0.03, 0, 0.6, -2.35);
  const head = mergeGeometries([box(0.5, 0.06, 0.04, 0.45, 0.43, 2.33), box(0.5, 0.06, 0.04, -0.45, 0.43, 2.33)], false);
  const plate = box(0.44, 0.12, 0.02, 0, 0.42, -2.35);
  const exh = [0.42, -0.42].map((x) => { const g = new THREE.CylinderGeometry(0.065, 0.065, 0.2, 12); g.rotateX(Math.PI / 2); g.translate(x, 0.33, -2.36); g.deleteAttribute('uv'); return g; });
  const chrome = mergeGeometries(exh, false);

  const tire = new THREE.LatheGeometry([[0.24, -0.14], [0.3, -0.15], [0.34, -0.12], [0.35, 0], [0.34, 0.12], [0.3, 0.15], [0.24, 0.14]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  tire.rotateZ(Math.PI / 2);
  const rimParts = [];
  const disc = new THREE.CylinderGeometry(0.245, 0.245, 0.24, 20); disc.rotateZ(Math.PI / 2); rimParts.push(prep(disc, '#5d6470'));
  for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(0.03, 0.055, 0.42); sp.translate(0, 0, 0.1); sp.rotateX((k / 5) * Math.PI * 2); sp.translate(0.125, 0, 0); rimParts.push(prep(sp, '#e8ebf1')); }
  const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10); hub.rotateZ(Math.PI / 2); hub.translate(0.135, 0, 0); rimParts.push(prep(hub, '#c4c9d3'));
  const rim = mergeGeometries(rimParts, false);

  const flame = new THREE.ConeGeometry(0.15, 1.1, 8); flame.rotateX(-Math.PI / 2); flame.translate(0, 0, -0.55);
  const flameCore = new THREE.ConeGeometry(0.08, 0.6, 8); flameCore.rotateX(-Math.PI / 2); flameCore.translate(0, 0, -0.3);
  const shadow = new THREE.PlaneGeometry(2.5, 5.2); shadow.rotateX(-Math.PI / 2);
  const glow = new THREE.PlaneGeometry(2.2, 4.6); glow.rotateX(-Math.PI / 2);
  CAR = {
    cabin, paintParts, dark, tail, head, plate, chrome, tire, rim, flame, flameCore, shadow, glow,
    shadowTex: radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'),
    glowTex: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    glassMat: new THREE.MeshStandardMaterial({ color: '#0a0f1e', metalness: 0.7, roughness: 0.06 }),
    darkMat: new THREE.MeshStandardMaterial({ color: '#121318', metalness: 0.2, roughness: 0.55 }),
    chromeMat: new THREE.MeshStandardMaterial({ color: '#e6e8ee', metalness: 1, roughness: 0.2 }),
    tireMat: new THREE.MeshStandardMaterial({ color: '#19191d', roughness: 0.9, side: THREE.DoubleSide }),
    rimMat: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.28 }),
    plateMat: new THREE.MeshStandardMaterial({ color: '#f2cd3c', roughness: 0.5 }),
    headMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 1.9) }),
  };
  return CAR;
}

export function createCar(hex, { player = false, night = false, quality = 'alta', ghost = false } = {}) {
  const G = carGeometries();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = quality === 'alta'
    ? new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.12, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 })
    : new THREE.MeshStandardMaterial({ color: hex, metalness: 0.12, roughness: 0.32 });
  if (night) paint.emissive = new THREE.Color(hex).multiplyScalar(0.07);
  body.add(new THREE.Mesh(G.paintParts, paint));
  body.add(new THREE.Mesh(G.cabin, G.glassMat));
  body.add(new THREE.Mesh(G.dark, G.darkMat));
  body.add(new THREE.Mesh(G.chrome, G.chromeMat));
  body.add(new THREE.Mesh(G.plate, G.plateMat));
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.08, 0.1) });
  body.add(new THREE.Mesh(G.tail, tailMat));
  body.add(new THREE.Mesh(G.head, G.headMat));

  const wheels = [], steerers = [];
  for (const [x, z, front] of [[0.84, 1.45, true], [-0.84, 1.45, true], [0.84, -1.42, false], [-0.84, -1.42, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.35, z);
    const spin = new THREE.Group();
    const side = new THREE.Group(); if (x < 0) side.rotation.y = Math.PI;
    side.add(new THREE.Mesh(G.tire, G.tireMat), new THREE.Mesh(G.rim, G.rimMat));
    spin.add(side); pivot.add(spin); root.add(pivot);
    wheels.push(spin); if (front) steerers.push(pivot);
  }

  const shadow = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ map: G.shadowTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  shadow.position.y = 0.04; shadow.renderOrder = 1;
  root.add(shadow);

  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.1, 0.25), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.8, 3.0), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const x of [0.42, -0.42]) {
    const f = new THREE.Group(); f.position.set(x, 0.33, -2.4);
    f.add(new THREE.Mesh(G.flame, flameMat)); f.add(new THREE.Mesh(G.flameCore, coreMat));
    f.visible = false; body.add(f); flames.push(f);
  }

  if (player && !ghost) {
    const glow = new THREE.Mesh(G.glow, new THREE.MeshBasicMaterial({ map: G.glowTex, color: new THREE.Color(0.1, 0.9, 1.4), transparent: true, opacity: night ? 0.7 : 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = 0.06; glow.renderOrder = 2;
    root.add(glow);
  }
  if (player && night && !ghost) {
    const spot = new THREE.SpotLight('#fff3d6', 22, 80, 0.5, 0.6, 1.2);
    spot.position.set(0, 0.8, 1.8);
    const tgt = new THREE.Object3D(); tgt.position.set(0, 0, 30);
    root.add(tgt); spot.target = tgt; root.add(spot);
  }
  if (ghost) {
    shadow.visible = false;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true; o.material.opacity = 0.32; o.material.depthWrite = false;
    });
  }
  return { root, body, wheels, steerers, flames, tailMat, paint, shadow };
}

// ------------------------------------------------------------------ cenário
function jitterRock(geo, seed, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const n = (h - Math.floor(h)) * 2 - 1;
    p.setXYZ(i, x * (1 + n * amt), y * (1 + n * amt * 0.7), z * (1 + n * amt));
  }
  return geo;
}

export const SCENERY = {
  palm() {
    const parts = []; let x = 0;
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(0.24 - i * 0.02, 0.3 - i * 0.02, 1.7, 6);
      g.translate(x, 0.85 + i * 1.6, 0); x += 0.1 + i * 0.06;
      parts.push(prep(g, i % 2 ? '#8b5e3c' : '#7a5234'));
    }
    const top = new THREE.Vector3(x, 8.1, 0);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.ConeGeometry(0.75, 4.4, 4);
      g.translate(0, 2.2, 0);
      g.rotateZ(-Math.PI / 2 - 0.5 - (i % 2) * 0.15);
      g.scale(1, 0.4, 1);
      g.rotateY((i / 7) * Math.PI * 2 + 0.3);
      g.translate(top.x, top.y, top.z);
      parts.push(prep(g, i % 2 ? '#2f9a48' : '#3fb85a'));
    }
    for (let i = 0; i < 3; i++) {
      const g = new THREE.IcosahedronGeometry(0.26, 0);
      g.translate(top.x + Math.cos(i * 2.1) * 0.35, top.y - 0.35, Math.sin(i * 2.1) * 0.35);
      parts.push(prep(g, '#6b4a2a'));
    }
    return merge(parts);
  },
  roundTree() {
    const t = new THREE.CylinderGeometry(0.28, 0.38, 3, 6); t.translate(0, 1.5, 0);
    const a = new THREE.IcosahedronGeometry(2.3, 0); a.translate(0, 4.6, 0);
    const b = new THREE.IcosahedronGeometry(1.6, 0); b.translate(1.2, 5.6, 0.4);
    return merge([prep(t, '#7a5536'), prep(a, '#3f9e3a'), prep(b, '#4db545')]);
  },
  bush() {
    const a = new THREE.IcosahedronGeometry(1.3, 0); a.scale(1.4, 0.85, 1.2); a.translate(0, 0.8, 0);
    const b = new THREE.IcosahedronGeometry(0.9, 0); b.translate(1.1, 0.6, 0.3);
    return merge([prep(a, '#4aa83e'), prep(b, '#5cbd4a')]);
  },
  flowers() {
    const base = new THREE.IcosahedronGeometry(1.1, 0); base.scale(1.5, 0.55, 1.3); base.translate(0, 0.45, 0);
    const parts = [prep(base, '#4caf45')];
    const r = mulberry32(3), cols = ['#ff5fa2', '#ffd23f', '#ffffff', '#ff7a3d', '#c77dff'];
    for (let i = 0; i < 9; i++) {
      const f = new THREE.IcosahedronGeometry(0.22, 0);
      const a = r() * Math.PI * 2, d = r() * 1.3;
      f.translate(Math.cos(a) * d, 0.85 + r() * 0.15, Math.sin(a) * d * 0.9);
      parts.push(prep(f, cols[i % cols.length]));
    }
    return merge(parts);
  },
  pine() {
    const t = new THREE.CylinderGeometry(0.25, 0.35, 2, 6); t.translate(0, 1, 0);
    const parts = [prep(t, '#6b4a33')];
    [[2.6, 3.6, 3.2, '#2c6e54'], [2.0, 3.0, 5.2, '#317a5c'], [1.3, 2.6, 7.0, '#378563'], [0.6, 1.2, 8.3, '#f4f9ff']].forEach(([r, h, y, c]) => {
      const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); parts.push(prep(g, c));
    });
    return merge(parts);
  },
  rock(color = '#9c4a2c') {
    const g = jitterRock(new THREE.DodecahedronGeometry(1.8, 0), 3, 0.22);
    g.scale(1.3, 0.8, 1.1); g.translate(0, 0.9, 0);
    return prep(g, color);
  },
  rockSmall() { const g = SCENERY.rock('#b8603a'); g.scale(0.5, 0.45, 0.5); return g; },
  iceRock() { return SCENERY.rock('#d3e5f5'); },
  mesa() {
    const parts = [];
    [[9, 11, 6, 3, '#b4552e'], [8, 9, 5, 8.5, '#c86a3c'], [7, 8, 4, 13, '#a84b29']].forEach(([rt, rb, h, y, c]) => {
      const g = new THREE.CylinderGeometry(rt, rb, h, 7); g.translate(0, y, 0); parts.push(prep(jitterRock(g, y, 0.06), c));
    });
    return merge(parts);
  },
  dome() {
    const d = new THREE.SphereGeometry(5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); d.translate(0, 0.7, 0);
    const b = new THREE.CylinderGeometry(5.4, 5.8, 0.8, 12); b.translate(0, 0.4, 0);
    const door = new THREE.BoxGeometry(1.6, 2, 1.2); door.translate(0, 1.3, 4.9);
    return merge([prep(d, '#d8ecfb'), prep(b, '#8b909c'), prep(door, '#5a606b')]);
  },
  antenna() {
    const m = new THREE.CylinderGeometry(0.15, 0.3, 14, 5); m.translate(0, 7, 0);
    const c1 = new THREE.BoxGeometry(3, 0.15, 0.15); c1.translate(0, 10, 0);
    const c2 = new THREE.BoxGeometry(2, 0.15, 0.15); c2.translate(0, 12, 0);
    const dish = new THREE.SphereGeometry(1.8, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3); dish.rotateX(0.9); dish.translate(0, 8, 0.9);
    const bea = new THREE.IcosahedronGeometry(0.3, 0); bea.translate(0, 14.2, 0);
    return merge([prep(m, '#9aa0aa'), prep(c1, '#9aa0aa'), prep(c2, '#9aa0aa'), prep(dish, '#e6e9ee'), prep(bea, '#ff3b3b')]);
  },
  crystal() {
    const r = mulberry32(7); const parts = [];
    const cols = ['#5ef2ff', '#b388ff', '#ff7ae0', '#7cf7c9'];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.OctahedronGeometry(1, 0);
      const h = 2.2 + r() * 2.4;
      g.scale(0.55 + r() * 0.3, h, 0.55 + r() * 0.3);
      g.rotateZ((r() - 0.5) * 0.7); g.rotateX((r() - 0.5) * 0.7);
      g.translate((r() - 0.5) * 2.2, h * 0.75, (r() - 0.5) * 2.2);
      parts.push(prep(g, cols[i % cols.length]));
    }
    return merge(parts);
  },
};
export const GLOW_TYPES = new Set(['crystal']);

// Textura de janelas para prédios (dia: mapa; noite: emissivo)
export function windowTextures(seed = 1) {
  const r = mulberry32(seed);
  const mk = (night) => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = night ? '#000000' : '#c9d3e3'; c.fillRect(0, 0, 64, 256);
    const lit = ['#ffd27a', '#7ff0ff', '#ff7ad9', '#fff4e0'];
    for (let y = 6; y < 250; y += 10) for (let x = 5; x < 60; x += 9) {
      const on = r() < 0.55;
      c.fillStyle = night ? (on ? lit[Math.floor(r() * lit.length)] : '#000') : (on ? '#6d86ad' : '#8fa3c4');
      c.fillRect(x, y, 5, 6);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
    return t;
  };
  return { day: mk(false), night: mk(true) };
}
