import * as THREE from 'three';
import { HALF, EDGE } from './track.js';
import { createCar, radialTexture } from './models.js';
import { playerStats, RIVALS, AI_COLORS, CAR_COLORS } from './data.js';

const UP = new THREE.Vector3(0, 1, 0);
const GEARS = [0, 0.16, 0.31, 0.47, 0.63, 0.8];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

class Particles {
  constructor(scene, max, color, size, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3).fill(-9999);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      color, size, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.6,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 4 * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export class Race {
  constructor({ world, index, save, audio, attract = false }) {
    this.world = world; this.track = world.track; this.scene = world.scene;
    this.index = index; this.save = save; this.audio = audio; this.attract = attract;
    this.L = this.track.length;
    this.laps = attract ? 9999 : world.def.laps;
    this.phase = attract ? 'race' : 'countdown';
    this.countdown = 3.999;
    this.time = 0;
    this.events = [];
    this.done = false;
    this.coins = 0;
    this.shake = 0;
    this.camX = 0; this.fov = 62;
    this.cine = { mode: 0, t: 0, focus: 0, anchor: 0 };
    this.lastCountShown = 4;
    this.throttleHeld = 0;
    this.drainPerM = 100 / (2.3 * this.L);

    const ps = playerStats(save.upgrades);
    const aiFactor = attract ? 0.95 : 0.87 + index * 0.017;
    this.cars = [];
    const n = 12;
    for (let g = 0; g < n; g++) {
      const isPlayer = !attract && g === n - 1;
      const color = isPlayer ? CAR_COLORS[save.color].hex : g === n - 1 ? CAR_COLORS[save.color].hex : AI_COLORS[g % AI_COLORS.length];
      const model = createCar(color, { player: isPlayer, night: world.night && isPlayer });
      if (world.night) model.paint.emissive = new THREE.Color(color).multiplyScalar(0.14);
      this.scene.add(model.root);
      const row = Math.floor(g / 2), col = g % 2;
      const skill = 1.0 - g * 0.006 - Math.random() * 0.03;
      const c = {
        i: g, isPlayer, name: isPlayer ? 'Você' : RIVALS[g % RIVALS.length], model,
        dist: -8 - row * 9, x: col ? 3.4 : -3.4, v: 0, steer: 0, yawVis: 0, roll: 0, pitch: 0,
        vmax: isPlayer ? ps.vmax : 80 * aiFactor * skill,
        accel: isPlayer ? ps.accel : 14 + 3 * aiFactor,
        cf: ps.cf, armor: ps.armor, nitro: isPlayer ? ps.nitro : 0, nitroMax: ps.nitro,
        aLat: 48 * aiFactor, energy: 100, nitroT: 0, boostT: 0, padCool: 0, backfire: 0,
        finished: false, finishTime: 0, pos: g + 1, gear: 1, rpm: 0, lap: 0,
        lane: col ? 3.4 : -3.4, laneBase: col ? 3.4 : -3.4, laneT: 2 + Math.random() * 3,
        startDelay: attract ? 0 : 0.05 + Math.random() * 0.4, offroad: false, lastLapTime: 0,
      };
      this.cars.push(c);
    }
    this.player = this.cars.find((c) => c.isPlayer) || null;
    this.focus = this.player || this.cars[0];
    this.lapStart = 0; this.bestLap = Infinity;

    const planet = world.planet;
    this.dust = new Particles(this.scene, 220, planet.dust, 1.4, false);
    this.sparks = new Particles(this.scene, 120, new THREE.Color(3, 2, 0.8), 0.5, true);
    this.buildPickups();
    this.placeAll(0);
  }

  // ---------------------------------------------------------------- itens
  buildPickups() {
    const L = this.L, tr = this.track;
    this.pickups = [];
    if (this.attract) return;
    const lanes = [-4.8, 0, 4.8];
    const coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 18); coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshPhongMaterial({ color: '#ffc21a', emissive: '#7a4a00', specular: '#ffffff', shininess: 90 });
    const nitroGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.3, 12);
    const nitroMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.5, 2.8) });
    const energyGeo = new THREE.OctahedronGeometry(0.75, 0);
    const energyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 0.9) });
    const padTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
      const c = cv.getContext('2d'); c.fillStyle = '#ff5a1f'; c.fillRect(0, 0, 64, 128);
      c.fillStyle = '#ffe14d';
      for (let i = 0; i < 3; i++) { const y = 100 - i * 40; c.beginPath(); c.moveTo(6, y + 18); c.lineTo(32, y - 8); c.lineTo(58, y + 18); c.lineTo(58, y + 30); c.lineTo(32, y + 4); c.lineTo(6, y + 30); c.fill(); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const padGeo = new THREE.PlaneGeometry(4, 7); padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshBasicMaterial({ map: padTex, color: new THREE.Color(1.5, 1.5, 1.5), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

    const addP = (type, s, x) => {
      let mesh;
      if (type === 'coin') mesh = new THREE.Mesh(coinGeo, coinMat);
      else if (type === 'nitro') mesh = new THREE.Mesh(nitroGeo, nitroMat);
      else if (type === 'energy') mesh = new THREE.Mesh(energyGeo, energyMat);
      else mesh = new THREE.Mesh(padGeo, padMat);
      const smp = tr.sample(s, {});
      mesh.position.set(smp.x + smp.rx * x, smp.y + (type === 'pad' ? 0.04 : 1.2), smp.z + smp.rz * x);
      if (type === 'pad') mesh.rotation.y = Math.atan2(smp.tx, smp.tz);
      this.scene.add(mesh);
      this.pickups.push({ type, s: tr.wrap(s), x, mesh, lapTaken: -99, baseY: mesh.position.y });
    };
    const r = () => Math.random();
    const groups = 6;
    for (let g = 0; g < groups; g++) {
      const s0 = 120 + (L - 200) * (g / groups) + r() * 60;
      const lane = lanes[Math.floor(r() * 3)];
      for (let j = 0; j < 5; j++) addP('coin', s0 + j * 7, lane);
    }
    [0.33, 0.78].forEach((f) => addP('nitro', L * f + r() * 50, lanes[Math.floor(r() * 3)]));
    [0.2, 0.52, 0.9].forEach((f) => addP('energy', L * f + r() * 40, lanes[Math.floor(r() * 3)]));
    // boost pads em retas
    const pads = [];
    for (let s = 200; s < L - 150 && pads.length < 3; s += 37) {
      if (Math.abs(tr.curvAt(s)) < 1 / 900 && Math.abs(tr.curvAt(s + 40)) < 1 / 500 && (!pads.length || s - pads[pads.length - 1] > L / 4)) pads.push(s);
    }
    pads.forEach((s) => addP('pad', s, lanes[Math.floor(r() * 3)]));
  }

  // ---------------------------------------------------------------- update
  update(dt, input, opts) {
    const P = this.player;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const shown = Math.ceil(this.countdown);
      if (shown !== this.lastCountShown && shown > 0) { this.lastCountShown = shown; this.events.push({ type: 'count', n: shown }); this.audio.sfx('beep'); }
      if (P) {
        const thr = input.throttle || opts.autoAccel;
        this.throttleHeld = input.throttle ? this.throttleHeld + dt : 0;
        if (input.nitroTap) this.nitroTapAt = this.countdown;
        this.audio.engine(thr ? 0.55 + Math.sin(this.time * 30) * 0.05 : 0.12, thr ? 1 : 0, 0, false, 0);
      }
      if (this.countdown <= 0) {
        this.phase = 'race';
        this.events.push({ type: 'count', n: 0 });
        this.audio.sfx('go');
        if (P) {
          const perfect = (this.throttleHeld > 0 && this.throttleHeld < 0.75) || (this.nitroTapAt !== undefined && this.nitroTapAt < 0.6);
          if (perfect) { P.boostT = 1.6; this.events.push({ type: 'msg', text: 'LARGADA PERFEITA!', kind: 'good' }); this.audio.sfx('boost'); }
          else if (this.throttleHeld > 1.6 && !opts.autoAccel) { P.startDelay = 0.7; this.events.push({ type: 'msg', text: 'PATINOU NA LARGADA', kind: 'bad' }); }
        }
      }
      this.placeAll(dt);
      return;
    }

    this.time += dt;
    const racing = this.phase === 'race' || this.phase === 'finish';
    for (const c of this.cars) {
      const human = c === P && this.phase === 'race';
      this.stepCar(c, dt, human ? input : null, opts);
    }
    this.collide(dt);
    if (P && this.phase === 'race') this.checkPickups(P);
    this.rank();
    this.checkLaps();
    if (this.phase === 'finish') {
      this.finishT -= dt;
      if (this.finishT <= 0 && !this.done) { this.done = true; this.result = this.buildResult(); }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.placeAll(dt);
    this.dust.update(dt); this.sparks.update(dt);
    if (P && racing && !this.done) {
      const boosting = P.nitroT > 0 || P.boostT > 0;
      this.audio.engine(P.rpm, P.throttle ? 1 : 0.2, P.v / 90, boosting, P.offroad ? Math.min(1, P.v / 40) : 0);
    }
  }

  stepCar(c, dt, input, opts) {
    const tr = this.track;
    const s = c.dist;
    const smp = tr.sample(s);
    const k = smp.k, slope = smp.ty;
    let throttle = false, brake = false, steerT = 0;

    if (input) {
      throttle = input.throttle || opts.autoAccel;
      brake = input.brake;
      if (brake && opts.autoAccel) throttle = false;
      steerT = input.steer;
      const rate = steerT === 0 ? 9 : Math.sign(steerT) !== Math.sign(c.steer) ? 12 : 6;
      c.steer += clamp(steerT - c.steer, -rate * dt, rate * dt);
      if (input.nitroTap && c.nitro > 0 && c.nitroT <= 0 && c.energy > 0) {
        c.nitro--; c.nitroT = 3.2; this.audio.sfx('nitro');
        this.events.push({ type: 'nitro' });
      }
    } else {
      ({ throttle, brake } = this.ai(c, dt, s, k));
    }
    c.throttle = throttle;
    c.braking = brake;

    if (c.startDelay > 0) { c.startDelay -= dt; throttle = false; }
    const boosting = c.nitroT > 0 || c.boostT > 0;
    c.nitroT = Math.max(0, c.nitroT - dt); c.boostT = Math.max(0, c.boostT - dt); c.padCool = Math.max(0, c.padCool - dt);

    let vmax = c.vmax;
    if (c.isPlayer && c.energy <= 0) vmax = 48;
    if (boosting) vmax += 24;
    const ax = Math.abs(c.x);
    c.offroad = ax > EDGE + 0.2;
    if (c.offroad) vmax *= 0.55;

    if (throttle) {
      const r = Math.max(0, c.v / vmax);
      const a = c.accel * (boosting ? 1.9 : 1) * Math.max(0, 1 - Math.pow(r, 2.2));
      c.v += a * dt;
    } else {
      c.v -= (2.5 + c.v * 0.012) * dt;
    }
    if (brake) c.v -= 40 * dt;
    c.v -= slope * 9.8 * 0.35 * dt;
    if (c.v > vmax) c.v = Math.max(vmax, c.v - (c.offroad ? 30 : 12) * dt);
    c.v = Math.max(0, c.v);

    if (c.isPlayer && !c.aiDriven) {
      const lat = 12.5 * Math.min(1, c.v / 26);
      c.x += c.steer * lat * dt;
      c.x -= k * c.v * c.v * c.cf * dt;
      const lim = EDGE + 9;
      if (Math.abs(c.x) > lim) { c.x = Math.sign(c.x) * lim; c.v *= 1 - 1.5 * dt; }
      c.energy = Math.max(0, c.energy - c.v * dt * this.drainPerM);
      if (c.energy <= 0 && !this.warnedEnergy) { this.warnedEnergy = true; this.events.push({ type: 'msg', text: 'SEM ENERGIA!', kind: 'bad' }); }
      if (c.offroad && c.v > 8) {
        this.shake = Math.max(this.shake, 0.25);
        if (Math.random() < 0.8) this.emitDust(c);
      }
    }

    // câmbio (efeito visual e sonoro)
    const rr = c.v / c.vmax;
    let gear = 1; for (let g = 1; g < GEARS.length; g++) if (rr >= GEARS[g]) gear = g + 1;
    const lo = GEARS[gear - 1], hi = gear < GEARS.length ? GEARS[gear] : 1.0;
    c.rpm = clamp(0.3 + 0.7 * (rr - lo) / (hi - lo), 0.3, 1.08);
    if (gear > c.gear && throttle) { c.backfire = 0.14; if (c.isPlayer) this.audio.sfx('shift'); }
    c.gear = gear;
    c.backfire = Math.max(0, c.backfire - dt);

    // visual
    const yawT = c.steer * 0.14 + clamp(k * c.v * 1.2, -0.12, 0.12);
    c.yawVis += (yawT - c.yawVis) * Math.min(1, dt * 8);
    c.roll += (-c.steer * 0.04 * Math.min(1, c.v / 50) - c.roll) * Math.min(1, dt * 6);
    c.pitch += ((brake ? 0.025 : throttle && c.v < c.vmax * 0.6 ? -0.02 : 0) - c.pitch) * Math.min(1, dt * 5);
    c.dist += c.v * dt;
  }

  ai(c, dt, s, k) {
    const tr = this.track;
    const look = 25 + c.v * 1.3;
    let kmax = 0;
    for (let d = 10; d <= look; d += 10) { const kk = Math.abs(tr.curvAt(s + d)); if (kk > kmax) kmax = kk; }
    let target = c.vmax + (c.nitroT > 0 || c.boostT > 0 ? 24 : 0);
    if (kmax > 1e-4) target = Math.min(target, Math.sqrt(c.aLat / kmax));
    const P = this.player;
    if (P && !c.isPlayer && !this.attract) {
      const gap = c.dist - P.dist;
      if (gap > 260) target *= 0.95; else if (gap < -260) target *= 1.05;
    }
    // faixa: linha de corrida + desvio
    c.laneT -= dt;
    if (c.laneT <= 0) { c.laneBase = (Math.random() * 2 - 1) * (HALF - 2); c.laneT = 3 + Math.random() * 4; }
    const kA = tr.curvAt(s + 35);
    let lane = c.laneBase + clamp(kA * 450, -1, 1) * 2.6;
    for (const o of this.cars) {
      if (o === c) continue;
      const dd = o.dist - c.dist;
      if (dd > 0 && dd < 24 && Math.abs(o.x - c.x) < 2.4 && o.v < c.v + 1) {
        const left = o.x - 3.3, right = o.x + 3.3;
        const canL = left > -HALF + 1.2, canR = right < HALF - 1.2;
        lane = canL && (!canR || Math.abs(left - c.x) < Math.abs(right - c.x)) ? left : canR ? right : lane;
        if (!canL && !canR) target = Math.min(target, o.v);
        break;
      }
    }
    c.lane = clamp(lane, -HALF + 1.2, HALF - 1.2);
    const mv = 4.5 * dt;
    const prevX = c.x;
    c.x += clamp(c.lane - c.x, -mv, mv);
    if (Math.abs(c.x) > HALF) c.x += clamp(Math.sign(c.x) * (HALF - 1.5) - c.x, -mv * 2, mv * 2);
    c.steer = clamp((c.x - prevX) / Math.max(dt, 1e-3) / 6, -1, 1);
    return { throttle: c.v < target, brake: c.v > target + 3 };
  }

  collide(dt) {
    const cars = this.cars, P = this.player;
    for (let a = 0; a < cars.length; a++) {
      for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a], B = cars[b];
        const dd = B.dist - A.dist, dx = B.x - A.x;
        if (Math.abs(dd) >= 4.5 || Math.abs(dx) >= 1.95) continue;
        const ns = (4.5 - Math.abs(dd)) / 4.5, nx = (1.95 - Math.abs(dx)) / 1.95;
        const front = dd > 0 ? B : A, back = dd > 0 ? A : B;
        const withPlayer = A === P || B === P;
        let hard = false;
        if (ns < nx) {
          back.dist = front.dist - 4.5;
          const rel = back.v - front.v;
          back.v = Math.max(0, Math.min(back.v, front.v) - (withPlayer ? 3 : 1));
          front.v += Math.max(0, rel) * 0.3;
          hard = rel > 4;
        } else {
          const push = (1.95 - Math.abs(dx)) / 2 + 0.05;
          const sg = dx >= 0 ? 1 : -1;
          A.x -= sg * push; B.x += sg * push;
          A.v *= 0.985; B.v *= 0.985;
          hard = true;
        }
        if (withPlayer && hard && (this.bumpCool || 0) <= this.time) {
          this.bumpCool = this.time + 0.35;
          P.energy = Math.max(0, P.energy - 3.5 * P.armor);
          this.shake = 0.6;
          this.audio.sfx('bump');
          const sm = this.track.sample(P.dist + 2);
          const px = sm.x + sm.rx * (P.x + dx * 0.5 * (A === P ? 1 : -1)), pz = sm.z + sm.rz * (P.x);
          for (let i = 0; i < 14; i++) this.sparks.emit(px, sm.y + 0.6, pz, (Math.random() - 0.5) * 10, 2 + Math.random() * 5, (Math.random() - 0.5) * 10, 0.4 + Math.random() * 0.3);
          this.events.push({ type: 'hit' });
        }
      }
    }
  }

  checkPickups(P) {
    const L = this.L;
    const lap = Math.floor(P.dist / L);
    const ps = this.track.wrap(P.dist);
    for (const p of this.pickups) {
      if (p.type !== 'pad' && p.lapTaken === lap) continue;
      let d = p.s - ps; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
      const hitS = p.type === 'pad' ? 3.8 : 2.4, hitX = p.type === 'pad' ? 2.3 : 1.8;
      if (Math.abs(d) > hitS || Math.abs(p.x - P.x) > hitX) continue;
      if (p.type === 'pad') {
        if (P.padCool > 0) continue;
        P.padCool = 1; P.boostT = Math.max(P.boostT, 1.5); this.audio.sfx('boost');
        this.events.push({ type: 'msg', text: 'TURBO!', kind: 'boost' });
        continue;
      }
      p.lapTaken = lap;
      if (p.type === 'coin') { this.coins++; this.audio.sfx('coin'); this.events.push({ type: 'coin' }); }
      else if (p.type === 'nitro') {
        if (P.nitro < P.nitroMax + 2) P.nitro++;
        this.audio.sfx('pickup'); this.events.push({ type: 'msg', text: '+1 NITRO', kind: 'nitro' });
      } else if (p.type === 'energy') {
        P.energy = Math.min(100, P.energy + 32); if (P.energy > 0) this.warnedEnergy = false;
        this.audio.sfx('pickup'); this.events.push({ type: 'msg', text: '+ENERGIA', kind: 'energy' });
      }
    }
  }

  rank() {
    const order = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.dist - a.dist;
    });
    order.forEach((c, i) => { c.pos = i + 1; });
    this.order = order;
    const P = this.player;
    if (P) {
      if (this.prevPos && P.pos < this.prevPos && this.phase === 'race') this.audio.sfx('whoosh');
      this.prevPos = P.pos;
    }
  }

  checkLaps() {
    const L = this.L, P = this.player;
    for (const c of this.cars) {
      const done = Math.floor(c.dist / L);
      if (done >= this.laps && !c.finished) {
        c.finished = true;
        c.finishTime = this.time - (c.dist - this.laps * L) / Math.max(c.v, 1);
        if (c === P) {
          this.phase = 'finish'; this.finishT = 3.2; P.aiDriven = true; P.laneBase = P.x;
          this.audio.sfx('finish');
          this.events.push({ type: 'finish', pos: P.pos });
        }
      }
      if (c === P && done > c.lap && done < this.laps) {
        c.lap = done;
        const lt = this.time - this.lapStart; this.lapStart = this.time;
        this.bestLap = Math.min(this.bestLap, lt);
        if (done === this.laps - 1) { this.events.push({ type: 'msg', text: 'VOLTA FINAL!', kind: 'final' }); this.audio.sfx('final'); }
        else { this.events.push({ type: 'msg', text: `VOLTA ${done + 1}`, kind: 'lap' }); this.audio.sfx('lap'); }
      }
    }
  }

  buildResult() {
    const L = this.L;
    const rows = this.cars.map((c) => ({
      name: c.name, isPlayer: c.isPlayer, color: c.isPlayer ? CAR_COLORS[this.save.color].hex : AI_COLORS[c.i % AI_COLORS.length],
      time: c.finished ? c.finishTime : this.time + (this.laps * L - c.dist) / Math.max(c.v, 45),
      est: !c.finished,
    }));
    rows.sort((a, b) => a.time - b.time);
    const pos = rows.findIndex((r) => r.isPlayer) + 1;
    return { rows, pos, coins: this.coins, bestLap: this.bestLap };
  }

  emitDust(c) {
    const sm = this.track.sample(c.dist - 2);
    const x = sm.x + sm.rx * c.x, z = sm.z + sm.rz * c.x;
    const y = this.track.terrainY(sm.y, Math.abs(c.x)) + 0.4;
    this.dust.emit(x + (Math.random() - 0.5) * 2, y, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4 - sm.tx * c.v * 0.1, 1 + Math.random() * 2, (Math.random() - 0.5) * 4 - sm.tz * c.v * 0.1, 0.6 + Math.random() * 0.5);
  }

  // ---------------------------------------------------------------- visual
  placeAll(dt) {
    const tr = this.track;
    const f = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), xa = new THREE.Vector3(), m = new THREE.Matrix4();
    for (const c of this.cars) {
      const sm = tr.sample(c.dist);
      f.set(sm.tx, sm.ty, sm.tz).normalize();
      r.set(sm.rx, 0, sm.rz);
      u.crossVectors(r, f).normalize();
      const yaw = c.yawVis;
      const fx = f.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(r, Math.sin(yaw)).normalize();
      xa.crossVectors(u, fx).normalize();
      m.makeBasis(xa, u, fx);
      const ax = Math.abs(c.x);
      const y = ax > EDGE ? tr.terrainY(sm.y, ax) : sm.y;
      const root = c.model.root;
      root.position.set(sm.x + sm.rx * c.x, y, sm.z + sm.rz * c.x);
      root.quaternion.setFromRotationMatrix(m);
      const body = c.model.body;
      body.rotation.z = c.roll; body.rotation.x = c.pitch;
      if (c.offroad) body.position.y = (Math.random() - 0.5) * 0.05; else body.position.y = 0;
      for (const w of c.model.wheels) w.rotation.x += (c.v * dt) / 0.37;
      for (const p of c.model.steerers) p.rotation.y = -c.steer * 0.35;
      const boosting = c.nitroT > 0 || c.boostT > 0;
      const fl = boosting || c.backfire > 0;
      for (const fm of c.model.flames) {
        fm.visible = fl;
        if (fl) { const k = boosting ? 0.8 + Math.random() * 0.6 : 0.35 + Math.random() * 0.2; fm.scale.set(1, 1, k); }
      }
      const tb = c.braking ? 3.2 : 1.6;
      c.model.tailMat.color.setRGB(tb, 0.08 * tb, 0.1 * tb);
    }
    const t = this.time;
    const lap = this.player ? Math.floor(this.player.dist / this.L) : 0;
    for (const p of this.pickups) {
      if (p.type === 'pad') continue;
      p.mesh.visible = p.lapTaken !== lap;
      p.mesh.rotation.y = t * 3 + p.s;
      p.mesh.position.y = p.baseY + Math.sin(t * 3 + p.s) * 0.2;
    }
  }

  updateCamera(cam, dt, opts, aspect) {
    const tr = this.track;
    if (this.attract) return this.cinematic(cam, dt, aspect);
    const c = this.focus;
    const far = opts.cam === 1;
    const portrait = aspect < 1;
    const dist = (far ? 10.5 : 7.4) * (portrait ? 1.25 : 1);
    const h = (far ? 3.9 : 2.55) * (portrait ? 1.15 : 1);
    this.camX += (c.x * 0.82 - this.camX) * Math.min(1, dt * 7);
    const a = tr.sample(c.dist - dist, {});
    const b = tr.sample(c.dist + 14, {});
    const ya = Math.max(a.y, tr.terrainY(a.y, Math.abs(this.camX)));
    const sh = this.shake;
    cam.position.set(a.x + a.rx * this.camX + (Math.random() - 0.5) * sh * 0.25, ya + h + (Math.random() - 0.5) * sh * 0.2, a.z + a.rz * this.camX);
    cam.up.set(0, 1, 0);
    cam.lookAt(b.x + b.rx * c.x * 0.9, b.y + 1.1, b.z + b.rz * c.x * 0.9);
    cam.rotateZ(-c.steer * 0.018);
    const boosting = c.nitroT > 0 || c.boostT > 0;
    const base = portrait ? 78 : 60;
    const fovT = base + Math.min(1, c.v / 90) * 9 + (boosting ? 9 : 0);
    this.fov += (fovT - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  cinematic(cam, dt, aspect) {
    const tr = this.track, cc = this.cine;
    cc.t -= dt;
    if (cc.t <= 0) {
      cc.mode = (cc.mode + 1) % 4; cc.t = 7;
      const lead = this.order ? this.order[Math.floor(Math.random() * 5)] : this.cars[0];
      this.focus = lead;
      cc.anchor = lead.dist + 70;
      cc.side = Math.random() < 0.5 ? -1 : 1;
      cc.ang = Math.random() * 6;
    }
    const c = this.focus;
    const cp = tr.sample(c.dist, {});
    const carPos = new THREE.Vector3(cp.x + cp.rx * c.x, cp.y + 0.8, cp.z + cp.rz * c.x);
    let pos;
    if (cc.mode === 0) {
      const a = tr.sample(c.dist - 9, {});
      pos = new THREE.Vector3(a.x + a.rx * (c.x + 2.5 * cc.side), a.y + 1.6, a.z + a.rz * (c.x + 2.5 * cc.side));
      cam.lookAt(carPos);
    }
    if (cc.mode === 1) {
      if (c.dist > cc.anchor + 25) cc.anchor = c.dist + 80;
      const a = tr.sample(cc.anchor, {});
      pos = new THREE.Vector3(a.x + a.rx * (EDGE + 4) * cc.side, a.y + 2.2, a.z + a.rz * (EDGE + 4) * cc.side);
    }
    if (cc.mode === 2) {
      cc.ang += dt * 0.35;
      pos = carPos.clone().add(new THREE.Vector3(Math.sin(cc.ang) * 8, 1.8, Math.cos(cc.ang) * 8));
    }
    if (cc.mode === 3) {
      const a = tr.sample(c.dist - 26, {});
      pos = new THREE.Vector3(a.x + a.rx * 6 * cc.side, a.y + 16, a.z + a.rz * 6 * cc.side);
    }
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(carPos);
    const fov = aspect < 1 ? 75 : 55;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  dispose() {
    for (const c of this.cars) this.scene.remove(c.model.root);
  }
}
