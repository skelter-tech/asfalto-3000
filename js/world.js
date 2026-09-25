import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANETS } from './data.js';
import { Track, HALF, EDGE, ROAD_W } from './track.js';
import { SCENERY, GLOW_TYPES, prep, windowTextures } from './models.js';
import { mulberry32 } from './save.js';

const C = (h) => new THREE.Color(h);

function skyMaterial(def, sunDir) {
  const s = def.sun;
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: C(def.sky.top) }, horizon: { value: C(def.sky.horizon) }, bottom: { value: C(def.sky.bottom) },
      sunDir: { value: sunDir }, sunColor: { value: C(s ? s.color : '#000') },
      sunSize: { value: s ? s.size : 0 }, sunGlow: { value: s ? s.glow : 0 },
      stripes: { value: s && s.stripes ? 1 : 0 }, hasSun: { value: s ? 1 : 0 }, time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, horizon, bottom, sunDir, sunColor; uniform float sunSize, sunGlow, stripes, hasSun, time;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.5)) : mix(horizon, bottom, clamp(-h*8.0,0.0,1.0));
        if (hasSun > 0.5) {
          float ca = dot(d, sunDir);
          c += sunColor * sunGlow * (pow(max(ca,0.0), 8.0) * 0.35 + pow(max(ca,0.0), 90.0) * 0.6);
          float ang = acos(clamp(ca,-1.0,1.0));
          float disc = 1.0 - smoothstep(sunSize*0.96, sunSize, ang);
          if (stripes > 0.5) {
            float yy = (d.y - sunDir.y) / sunSize;
            float g = fract(yy * 7.0 - time * 0.15);
            float cut = yy < 0.15 ? step(0.18 + clamp(-yy, 0.0, 1.0) * 0.45, g) : 1.0;
            disc *= cut;
            vec3 sc = mix(sunColor, vec3(1.0,0.25,0.55), clamp(0.5 - yy*0.6, 0.0, 1.0));
            c = mix(c, sc * 1.9, disc);
          } else {
            c = mix(c, sunColor * 2.2, disc);
          }
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function mountainRing(rng, radius, segs, hMin, hMax, y0, colBottom, colTop, snowCol) {
  const hs = [];
  const p1 = rng() * 6, p2 = rng() * 6, p3 = rng() * 6;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const n = 0.5 + 0.5 * (0.55 * Math.sin(3 * a + p1) + 0.3 * Math.sin(7 * a + p2) + 0.2 * Math.sin(17 * a + p3));
    hs.push(hMin + (hMax - hMin) * n * (0.75 + rng() * 0.25) + (i % 2 ? rng() * 0.3 * (hMax - hMin) : 0));
  }
  const pos = [], col = [];
  const cb = C(colBottom), ct = C(colTop), cs = snowCol ? C(snowCol) : null;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const h0 = hs[i], h1 = hs[(i + 1) % segs];
    const B0 = [Math.cos(a0) * radius, y0, Math.sin(a0) * radius], B1 = [Math.cos(a1) * radius, y0, Math.sin(a1) * radius];
    const T0 = [Math.cos(a0) * radius, y0 + h0, Math.sin(a0) * radius], T1 = [Math.cos(a1) * radius, y0 + h1, Math.sin(a1) * radius];
    const tc = (h) => (cs && h > hMax * 0.78 ? cs : ct);
    pos.push(...B0, ...T0, ...B1, ...B1, ...T0, ...T1);
    col.push(cb.r, cb.g, cb.b, tc(h0).r, tc(h0).g, tc(h0).b, cb.r, cb.g, cb.b, cb.r, cb.g, cb.b, tc(h0).r, tc(h0).g, tc(h0).b, tc(h1).r, tc(h1).g, tc(h1).b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
}

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function yawTo(dx, dz) { return Math.atan2(dx, dz); } // local +z -> (dx,dz)

export function buildWorld(def) {
  const planet = PLANETS[def.planet];
  const rng = mulberry32(def.seed * 7919 + 13);
  const track = new Track(def, rng);
  const scene = new THREE.Scene();
  const night = !!def.night;
  scene.fog = new THREE.Fog(def.fog, def.fogNear, def.fogFar);
  scene.background = C(def.fog);

  // luz
  scene.add(new THREE.HemisphereLight(def.hemi[0], def.hemi[1], def.hemi[2]));
  const s0 = track.sample(0, {});
  const startYaw = Math.atan2(s0.tx, s0.tz);
  const sun = def.sun || { az: 0.6, el: 0.5 };
  const az = startYaw + sun.az;
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(sun.el), Math.sin(sun.el), Math.cos(az) * Math.cos(sun.el)).normalize();
  const dl = new THREE.DirectionalLight(def.dir[0], def.dir[1]);
  const ldir = sunDir.clone(); ldir.y = Math.max(ldir.y, 0.35); ldir.normalize();
  dl.position.copy(ldir).multiplyScalar(100);
  scene.add(dl);

  // céu (acompanha a câmera)
  const skyGroup = new THREE.Group();
  const skyMat = skyMaterial(def, sunDir);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat);
  sky.renderOrder = -10;
  skyGroup.add(sky);
  if (def.stars) {
    const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, e = Math.asin(0.04 + rng() * 0.96);
      p[i * 3] = Math.cos(a) * Math.cos(e) * 2800; p[i * 3 + 1] = Math.sin(e) * 2800; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 2800;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.6, 1.8), size: 1.8, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    st.renderOrder = -9;
    skyGroup.add(st);
  }
  for (const m of def.moons || []) {
    const a = startYaw + m.az;
    const tex = canvasTex(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 10, 64, 64, 64);
      g.addColorStop(0, '#fff'); g.addColorStop(0.72, '#fff'); g.addColorStop(0.78, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      c.fillStyle = 'rgba(120,120,150,0.25)';
      [[50, 48, 12], [78, 70, 9], [60, 82, 7], [82, 44, 5]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); });
    });
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(m.size * 2.6, m.size * 2.6), new THREE.MeshBasicMaterial({ map: tex, color: C(m.color).multiplyScalar(1.5), transparent: true, fog: false, depthWrite: false }));
    mm.position.set(Math.sin(a) * Math.cos(m.el) * 2500, Math.sin(m.el) * 2500, Math.cos(a) * Math.cos(m.el) * 2500);
    mm.lookAt(0, 0, 0);
    mm.renderOrder = -8;
    skyGroup.add(mm);
  }
  scene.add(skyGroup);

  // pista
  scene.add(track.buildMeshes(planet, def));

  // montanhas / cidade distante
  const R = def.R;
  const hor = C(def.sky.horizon);
  const mix = (hex, t) => '#' + C(hex).lerp(hor, t).getHexString();
  const mountY = track.groundY - 8;
  if (!planet.cityRing) {
    scene.add(mountainRing(rng, R * 3.9, 90, 180, 420, mountY, mix(planet.mount, 0.72), mix(planet.mount, 0.6), planet.snow && !night ? mix('#ffffff', 0.35) : null));
    scene.add(mountainRing(rng, R * 3.0, 110, 70, 230, mountY, mix(planet.mount, 0.45), mix(planet.mount, 0.3), planet.snow && !night ? mix('#ffffff', 0.15) : null));
  } else {
    scene.add(mountainRing(rng, R * 4.0, 70, 60, 180, mountY, mix(planet.mount, 0.5), mix(planet.mount, 0.4), null));
  }

  const wt = windowTextures(def.seed);
  const bldMat = (fog, tint) => new THREE.MeshLambertMaterial({
    map: night ? null : wt.day, color: tint, fog,
    emissive: night ? C('#ffffff') : C('#000000'), emissiveMap: night ? wt.night : null, emissiveIntensity: night ? 1.6 : 0,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);

  if (planet.skyline || planet.cityRing) {
    const ring = planet.cityRing;
    const count = ring ? 220 : 60;
    const mesh = new THREE.InstancedMesh(boxGeo, bldMat(false, night ? C('#1a1530') : C(mix('#8aa0c8', 0.45))), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const a0 = startYaw + 0.4;
    for (let i = 0; i < count; i++) {
      const a = ring ? rng() * Math.PI * 2 : a0 + (rng() - 0.5) * 0.9;
      const rad = (ring ? R * 2.7 : R * 2.6) + rng() * R * 0.8;
      const h = ring ? 80 + rng() * 320 : 40 + rng() * 170;
      p.set(Math.sin(a) * rad, mountY, Math.cos(a) * rad);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      sc.set(30 + rng() * 40, h, 30 + rng() * 40);
      mesh.setMatrixAt(i, m4.compose(p, q, sc));
    }
    scene.add(mesh);
  }

  // nuvens
  if (def.clouds) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.IcosahedronGeometry(1, 0); g.scale(1.3, 0.6, 1); g.translate((i - 2) * 1.1, Math.abs(i - 2) * -0.15, (i % 2) * 0.4);
      parts.push(prep(g, def.clouds));
    }
    const cg = mergeGeometries(parts);
    const cm = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }), 26);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, rad = R * 1.8 + rng() * R * 2;
      p.set(Math.sin(a) * rad, 160 + rng() * 200, Math.cos(a) * rad);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6);
      const s = 30 + rng() * 45; sc.set(s, s * 0.8, s);
      cm.setMatrixAt(i, m4.compose(p, q, sc));
    }
    scene.add(cm);
  }

  // aurora
  let auroraMat = null;
  if (def.aurora) {
    auroraMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vUv; uniform float time;
        void main(){ vUv = uv; vec3 p = position; p.xz *= 1.0 + 0.04*sin(uv.x*18.0 + time*0.4);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float time;
        void main(){ float y = vUv.y;
          float a = smoothstep(0.0,0.25,y) * pow(1.0-y, 1.6);
          a *= 0.55 + 0.45*sin(vUv.x*60.0 + time*0.8 + sin(vUv.x*9.0+time*0.3)*3.0);
          vec3 c = mix(vec3(0.2,1.6,0.8), vec3(1.0,0.3,1.4), y);
          gl_FragColor = vec4(c*a*0.9, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    for (let k = 0; k < 3; k++) {
      const segs = 80, pos = [], uv = [], idx = [];
      const a0 = startYaw + k * 2.1 - 0.6, span = 1.6, rad = 1900 + k * 150;
      for (let i = 0; i <= segs; i++) {
        const a = a0 + (i / segs) * span;
        const r2 = rad + Math.sin(i * 0.25 + k) * 120;
        for (const [y, v] of [[250, 0], [900, 1]]) { pos.push(Math.sin(a) * r2, y, Math.cos(a) * r2); uv.push(i / segs, v); }
        if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, auroraMat); m.renderOrder = -5;
      scene.add(m);
    }
  }

  // ---------- objetos ao lado da pista
  const L = track.length;
  const tmpS = {};
  const placements = {}; // type -> [{x,y,z,yaw,s}]
  const add = (type, o) => { (placements[type] = placements[type] || []).push(o); };
  const weights = planet.scenery;
  const wsum = weights.reduce((s, w) => s + w[1], 0);
  const pick = () => { let r = rng() * wsum; for (const [t, w] of weights) { r -= w; if (r <= 0) return t; } return weights[0][0]; };
  const isCity = planet.cityRing;
  const count = Math.floor(L / (isCity ? 11 : 6.5));
  for (let n = 0; n < count; n++) {
    const s = rng() * L;
    const side = rng() < 0.5 ? -1 : 1;
    const type = pick();
    const big = type === 'building' || type === 'mesa' || type === 'dome';
    const off = EDGE + (big ? 22 + rng() * 70 : 4 + Math.pow(rng(), 1.7) * 60);
    track.sample(s, tmpS);
    const x = tmpS.x + tmpS.rx * off * side, z = tmpS.z + tmpS.rz * off * side;
    const clear = big ? EDGE + 18 : EDGE + 3;
    if (track.distToTrack(x, z) < clear) continue;
    add(type, { x, y: track.terrainY(tmpS.y, off), z, yaw: rng() * Math.PI * 2, sc: 0.75 + rng() * 0.6, s });
  }

  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(night ? 1.8 : 1.15, night ? 1.8 : 1.15, night ? 1.8 : 1.15) });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (const type of Object.keys(placements)) {
    const list = placements[type];
    if (type === 'building') {
      const mesh = new THREE.InstancedMesh(boxGeo, bldMat(true, C('#ffffff')), list.length);
      const pal = night ? ['#2a2250', '#1d2a4a', '#3a1f4a', '#20203a'] : ['#c7d0e0', '#b8c4d9', '#d8dde8'];
      list.forEach((o, i) => {
        track.sample(o.s, tmpS);
        p.set(o.x, o.y - 1, o.z);
        q.setFromAxisAngle(UP, Math.atan2(tmpS.tx, tmpS.tz));
        sc.set(14 + rng() * 16, 25 + rng() * 90, 14 + rng() * 16);
        mesh.setMatrixAt(i, m4.compose(p, q, sc));
        mesh.setColorAt(i, tint.set(pal[i % pal.length]));
      });
      scene.add(mesh);
      continue;
    }
    const geo = SCENERY[type]();
    const mesh = new THREE.InstancedMesh(geo, GLOW_TYPES.has(type) ? glowMat : vcMat, list.length);
    list.forEach((o, i) => {
      p.set(o.x, o.y - 0.15, o.z);
      q.setFromAxisAngle(UP, o.yaw);
      sc.setScalar(o.sc);
      mesh.setMatrixAt(i, m4.compose(p, q, sc));
      mesh.setColorAt(i, tint.setHSL(0, 0, 0.85 + rng() * 0.3));
    });
    scene.add(mesh);
  }

  // placas de curva (chevrons)
  const chevTex = canvasTex(128, 64, (c) => {
    c.fillStyle = '#ffd21f'; c.fillRect(0, 0, 128, 64);
    c.fillStyle = '#16161a';
    for (let i = 0; i < 3; i++) { const x = 14 + i * 36; c.beginPath(); c.moveTo(x, 8); c.lineTo(x + 22, 32); c.lineTo(x, 56); c.lineTo(x + 12, 56); c.lineTo(x + 34, 32); c.lineTo(x + 12, 8); c.fill(); }
    c.strokeStyle = '#16161a'; c.lineWidth = 6; c.strokeRect(3, 3, 122, 58);
  });
  const signGeo = mergeGeometries([
    (() => { const g = new THREE.PlaneGeometry(3.2, 1.6); g.translate(0, 2.4, 0); return g; })(),
  ]);
  const postGeo = new THREE.BoxGeometry(0.14, 1.8, 0.14); postGeo.translate(0, 0.9, -0.05);
  const signs = [];
  for (let s = 0; s < L; s += 26) {
    const k = track.curvAt(s);
    if (Math.abs(k) < 1 / 170) continue;
    track.sample(s, tmpS);
    const side = k > 0 ? -1 : 1; // lado de fora da curva
    const off = EDGE + 2.2;
    const right = k > 0;
    signs.push({ x: tmpS.x + tmpS.rx * off * side, y: tmpS.y, z: tmpS.z + tmpS.rz * off * side, yaw: right ? yawTo(-tmpS.tx, -tmpS.tz) : yawTo(tmpS.tx, tmpS.tz) });
  }
  if (signs.length) {
    const sm = new THREE.InstancedMesh(signGeo, new THREE.MeshLambertMaterial({ map: chevTex, side: THREE.DoubleSide, emissive: C('#ffffff'), emissiveMap: chevTex, emissiveIntensity: night ? 0.6 : 0.15 }), signs.length);
    const pm = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: '#3a3d45' }), signs.length * 2);
    signs.forEach((o, i) => {
      q.setFromAxisAngle(UP, o.yaw); sc.setScalar(1);
      sm.setMatrixAt(i, m4.compose(p.set(o.x, o.y, o.z), q, sc));
      const rx = Math.cos(o.yaw), rz = -Math.sin(o.yaw);
      pm.setMatrixAt(i * 2, m4.compose(p.set(o.x + rx * 1.2, o.y, o.z + rz * 1.2), q, sc));
      pm.setMatrixAt(i * 2 + 1, m4.compose(p.set(o.x - rx * 1.2, o.y, o.z - rz * 1.2), q, sc));
    });
    scene.add(sm, pm);
  }

  // postes de luz (noite)
  if (def.lamps && !isCity) {
    const pole = mergeGeometries([
      prep((() => { const g = new THREE.CylinderGeometry(0.1, 0.16, 7.6, 6); g.translate(0, 3.8, 0); return g; })(), '#4a4e58'),
      prep((() => { const g = new THREE.BoxGeometry(2.4, 0.12, 0.12); g.translate(1.2, 7.5, 0); return g; })(), '#4a4e58'),
    ]);
    const headG = new THREE.BoxGeometry(0.9, 0.16, 0.5); headG.translate(2.2, 7.4, 0);
    const lamps = [];
    for (let s = 20, k = 0; s < L; s += 42, k++) {
      const side = k % 2 ? 1 : -1;
      track.sample(s, tmpS);
      const off = EDGE + 1.6;
      lamps.push({ x: tmpS.x + tmpS.rx * off * side, y: tmpS.y, z: tmpS.z + tmpS.rz * off * side, dx: -tmpS.rx * side, dz: -tmpS.rz * side });
    }
    const pm = new THREE.InstancedMesh(pole, vcMat, lamps.length);
    const hm = new THREE.InstancedMesh(headG, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.5) }), lamps.length);
    lamps.forEach((o, i) => {
      q.setFromAxisAngle(UP, Math.atan2(-o.dz, o.dx)); sc.setScalar(1); p.set(o.x, o.y, o.z);
      m4.compose(p, q, sc); pm.setMatrixAt(i, m4); hm.setMatrixAt(i, m4);
    });
    scene.add(pm, hm);
  }

  // arcos de néon (Neo Tóquio)
  if (planet.neonArches) {
    const arch = mergeGeometries([
      prep((() => { const g = new THREE.BoxGeometry(0.7, 11, 0.7); g.translate(HALF + 2, 5.5, 0); return g; })(), '#ffffff'),
      prep((() => { const g = new THREE.BoxGeometry(0.7, 11, 0.7); g.translate(-HALF - 2, 5.5, 0); return g; })(), '#ffffff'),
      prep((() => { const g = new THREE.BoxGeometry(ROAD_W + 4.7, 0.7, 0.7); g.translate(0, 11, 0); return g; })(), '#ffffff'),
    ]);
    const list = [];
    for (let s = 90; s < L - 40; s += 150) list.push(s);
    const am = new THREE.InstancedMesh(arch, new THREE.MeshBasicMaterial({ vertexColors: true }), list.length);
    const cols = [new THREE.Color(0.2, 2.2, 2.6), new THREE.Color(2.6, 0.3, 2.1), new THREE.Color(2.6, 1.6, 0.3)];
    list.forEach((s, i) => {
      track.sample(s, tmpS);
      q.setFromAxisAngle(UP, Math.atan2(-tmpS.rz, tmpS.rx)); sc.setScalar(1);
      am.setMatrixAt(i, m4.compose(p.set(tmpS.x, tmpS.y, tmpS.z), q, sc));
      am.setColorAt(i, cols[i % cols.length]);
    });
    scene.add(am);
  }

  // outdoors (Terra Nova)
  if (planet.billboards) {
    const ads = [['ASFALTO', '3000', '#ff5a1f', '#1b1140'], ['NITRO-X', 'COMBUSTÍVEL ESTELAR', '#18c6ff', '#0f1630'], ['VOLTA FINAL', 'RÁDIO 88.3', '#ffd21f', '#301018'], ['ÓRBITA', 'PNEUS DE CORRIDA', '#34d27a', '#0e2a1c']];
    ads.forEach((ad, i) => {
      const tex = canvasTex(512, 200, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, ad[3]); g.addColorStop(1, '#000');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = ad[2]; c.fillRect(0, h - 18, w, 18);
        c.font = 'italic 900 96px "Racing Sans One", Impact, sans-serif'; c.fillStyle = '#fff'; c.textBaseline = 'middle';
        c.fillText(ad[0], 24, 80);
        c.font = '700 34px "Chakra Petch", Arial, sans-serif'; c.fillStyle = ad[2]; c.fillText(ad[1], 28, 150);
      });
      const s = L * (0.12 + i * 0.23);
      track.sample(s, tmpS);
      const side = i % 2 ? 1 : -1, off = EDGE + 12;
      const b = new THREE.Group();
      b.position.set(tmpS.x + tmpS.rx * off * side, tmpS.y, tmpS.z + tmpS.rz * off * side);
      b.rotation.y = yawTo(-tmpS.tx - tmpS.rx * side * 0.6, -tmpS.tz - tmpS.rz * side * 0.6);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(13, 5.1), new THREE.MeshBasicMaterial({ map: tex, color: night ? C('#ffffff') : C('#e6e6e6') }));
      board.position.y = 7;
      b.add(board);
      const back = new THREE.Mesh(new THREE.BoxGeometry(13.4, 5.5, 0.3), new THREE.MeshLambertMaterial({ color: '#2b2e36' }));
      back.position.set(0, 7, -0.2); b.add(back);
      for (const px of [-4, 4]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), new THREE.MeshLambertMaterial({ color: '#3a3d45' })); pl.position.set(px, 2.5, -0.3); b.add(pl); }
      scene.add(b);
    });
  }

  // pórtico de largada
  {
    const tex = canvasTex(1024, 128, (c, w, h) => {
      for (let a = 0; a < 64; a++) for (let b = 0; b < 2; b++) { c.fillStyle = (a + b) % 2 ? '#111' : '#f5f5f5'; c.fillRect(a * 16, b * 16 + (b ? h - 32 : 0), 16, 16); }
      c.fillStyle = '#12102a'; c.fillRect(0, 32, w, h - 64);
      c.font = 'italic 64px "Racing Sans One", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#ffc83d'; c.fillText('ASFALTO 3000  ·  LARGADA', w / 2, h / 2 + 2);
    });
    const g = new THREE.Group();
    g.position.set(s0.x, s0.y, s0.z);
    g.rotation.y = startYaw;
    const mat = new THREE.MeshLambertMaterial({ color: '#2d3140' });
    for (const px of [-HALF - 2.2, HALF + 2.2]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 1.2), mat); pl.position.set(px, 5, 0); g.add(pl); }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 5.6, 2.4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, color: new THREE.Color(1.2, 1.2, 1.2) }));
    banner.position.set(0, 9, 0);
    banner.rotation.y = Math.PI;
    g.add(banner);
    const lights = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 5.6, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 2.8) }));
    lights.position.set(0, 10.4, 0); g.add(lights);
    scene.add(g);
  }

  return {
    scene, track, def, planet, night,
    update(t, camera) {
      skyGroup.position.copy(camera.position);
      skyMat.uniforms.time.value = t;
      if (auroraMat) auroraMat.uniforms.time.value = t;
    },
    dispose() {
      scene.traverse((o) => {
        if (o.geometry && !o.userData.shared) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) { for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].dispose(); m.dispose(); }
      });
    },
  };
}
