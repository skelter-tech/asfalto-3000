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
let CAR = null;
function carGeometries() {
  if (CAR) return CAR;
  const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); return s; };

  // carroceria: perfil lateral em cunha, extrudado na largura e afinado nas pontas
  const bodyShape = shape([[-2.22, 0.24], [-2.3, 0.64], [-2.18, 0.88], [-1.2, 0.97], [0.95, 0.9], [1.9, 0.7], [2.3, 0.52], [2.32, 0.34], [2.15, 0.22], [-2.1, 0.2]]);
  let body = new THREE.ExtrudeGeometry(bodyShape, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 1 });
  body.translate(0, 0, -0.92);
  body.rotateY(-Math.PI / 2);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const f = (1 - 0.12 * smooth((y - 0.55) / 0.4)) * (1 - 0.14 * smooth((z - 1.3) / 1.0)) * (1 - 0.05 * smooth((-z - 1.6) / 0.7));
    bp.setX(i, x * f);
  }
  body = prep(body, '#ffffff');

  const cabinShape = shape([[-1.32, 0.9], [-0.55, 1.27], [0.3, 1.3], [1.15, 0.88]]);
  let cabin = new THREE.ExtrudeGeometry(cabinShape, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  cabin.translate(0, 0, -0.7);
  cabin.rotateY(-Math.PI / 2);
  const cp = cabin.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setX(i, cp.getX(i) * (1 - 0.2 * smooth((cp.getY(i) - 0.95) / 0.33)));
  cabin = prep(cabin, '#ffffff');

  const box = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return prep(g, hex); };
  const wing = merge([
    box(1.92, 0.07, 0.46, 0, 1.17, -1.96, '#ffffff'),
    box(0.05, 0.28, 0.6, 0.96, 1.12, -1.96, '#ffffff'),
    box(0.05, 0.28, 0.6, -0.96, 1.12, -1.96, '#ffffff'),
  ]);
  const darkParts = [
    box(0.08, 0.24, 0.18, 0.55, 1.02, -1.92, '#1a1b20'),
    box(0.08, 0.24, 0.18, -0.55, 1.02, -1.92, '#1a1b20'),
    box(1.3, 0.12, 0.06, 0, 0.32, 2.28, '#101114'),
    box(1.5, 0.14, 0.05, 0, 0.36, -2.3, '#101114'),
  ];
  for (let r = 0; r < 3; r++) {
    darkParts.push(box(0.05, 0.05, 1.05, 0.9, 0.5 + r * 0.1, -0.75, '#16171b'));
    darkParts.push(box(0.05, 0.05, 1.05, -0.9, 0.5 + r * 0.1, -0.75, '#16171b'));
  }
  const dark = merge(darkParts);
  const tail = merge([box(1.66, 0.13, 0.05, 0, 0.66, -2.3, '#ffffff')]);
  const head = merge([box(0.46, 0.09, 0.08, 0.58, 0.49, 2.24, '#ffffff'), box(0.46, 0.09, 0.08, -0.58, 0.49, 2.24, '#ffffff')]);

  const tire = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 14); tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.23, 0.23, 0.32, 6); rim.rotateZ(Math.PI / 2);
  const wheel = merge([prep(tire, '#18181b'), prep(rim, '#c9ced8')]);

  const flame = new THREE.ConeGeometry(0.15, 1.1, 8); flame.rotateX(-Math.PI / 2); flame.translate(0, 0, -0.55);
  const flameCore = new THREE.ConeGeometry(0.08, 0.6, 8); flameCore.rotateX(-Math.PI / 2); flameCore.translate(0, 0, -0.3);
  const shadow = new THREE.PlaneGeometry(2.5, 5.2); shadow.rotateX(-Math.PI / 2);
  const glow = new THREE.PlaneGeometry(2.2, 4.6); glow.rotateX(-Math.PI / 2);
  CAR = {
    body, cabin, wing, dark, tail, head, wheel, flame, flameCore, shadow, glow,
    shadowTex: radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'),
    glowTex: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    darkMat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glassMat: new THREE.MeshPhongMaterial({ color: '#131a2e', specular: '#8fa6d6', shininess: 120, flatShading: true }),
    wheelMat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    headMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 1.9) }),
  };
  return CAR;
}

let OUTLINE_MAT = null;
function outlineMat() {
  if (!OUTLINE_MAT) OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: '#0c0c14', side: THREE.BackSide });
  return OUTLINE_MAT;
}
function outline(geo, scale) {
  const m = new THREE.Mesh(geo, outlineMat());
  m.scale.setScalar(scale);
  return m;
}

export function createCar(hex, { player = false, night = false } = {}) {
  const G = carGeometries();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhongMaterial({ color: hex, specular: '#ffffff', shininess: 130, flatShading: true, vertexColors: true });
  if (night) paint.emissive = new THREE.Color(hex).multiplyScalar(0.18);
  body.add(new THREE.Mesh(G.body, paint));
  body.add(new THREE.Mesh(G.cabin, G.glassMat));
  body.add(new THREE.Mesh(G.wing, paint));
  body.add(new THREE.Mesh(G.dark, G.darkMat));
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.08, 0.1) });
  body.add(new THREE.Mesh(G.tail, tailMat));
  body.add(new THREE.Mesh(G.head, G.headMat));
  // contorno preto (casco invertido) — o traço de carrinho de brinquedo do gênero
  body.add(outline(G.body, 1.028));
  body.add(outline(G.cabin, 1.05));
  body.add(outline(G.wing, 1.05));

  const wheels = [], steerers = [];
  for (const [x, z, front] of [[0.86, 1.45, true], [-0.86, 1.45, true], [0.86, -1.42, false], [-0.86, -1.42, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.37, z);
    const w = new THREE.Mesh(G.wheel, G.wheelMat);
    pivot.add(w); pivot.add(outline(G.wheel, 1.16));
    root.add(pivot);
    wheels.push(w); if (front) steerers.push(pivot);
  }

  const shadow = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ map: G.shadowTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  shadow.position.y = 0.04; shadow.renderOrder = 1;
  root.add(shadow);

  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.1, 0.25), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.8, 3.0), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const x of [0.45, -0.45]) {
    const f = new THREE.Group(); f.position.set(x, 0.36, -2.32);
    f.add(new THREE.Mesh(G.flame, flameMat)); f.add(new THREE.Mesh(G.flameCore, coreMat));
    f.visible = false; body.add(f); flames.push(f);
  }

  if (player) {
    const glow = new THREE.Mesh(G.glow, new THREE.MeshBasicMaterial({ map: G.glowTex, color: new THREE.Color(0.1, 0.9, 1.4), transparent: true, opacity: night ? 0.7 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = 0.06; glow.renderOrder = 2;
    root.add(glow);
  }
  if (player && night) {
    const spot = new THREE.SpotLight('#fff3d6', 22, 80, 0.5, 0.6, 1.2);
    spot.position.set(0, 0.8, 1.8);
    const tgt = new THREE.Object3D(); tgt.position.set(0, 0, 30);
    root.add(tgt); spot.target = tgt; root.add(spot);
  }
  return { root, body, wheels, steerers, flames, tailMat, paint };
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
