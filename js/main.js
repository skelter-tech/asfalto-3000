import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradePass } from './gradepass.js';
import { PLANETS, RACES, UPGRADES, UPGRADE_COST, MAX_LEVEL, CAR_COLORS, PRIZES, COIN_VALUE, isUnlocked } from './data.js';
import { loadSave, writeSave, resetSave, IS_TOUCH } from './save.js';
import { buildWorld } from './world.js';
import { Race } from './race.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { createCar } from './models.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let save = loadSave();
const audio = new AudioSys();
audio.musicOn = save.opts.music; audio.sfxOn = save.opts.sfx;
const input = new Input();

// ------------------------------------------------------------------ render
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NoToneMapping;
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 7000);
let composer = null, renderPass = null, bloom = null;
let prScale = 1;

function basePixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  return save.opts.quality === 'alta' ? Math.min(dpr, 2) : Math.min(dpr, 1.25);
}
function setupRender() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(basePixelRatio() * prScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  showroom.cam.aspect = w / h; showroom.cam.updateProjectionMatrix();
  if (save.opts.quality === 'alta') {
    if (!composer) {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      renderPass = new RenderPass(new THREE.Scene(), camera);
      bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.4, 0.97);
      composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new GradePass()); composer.addPass(new OutputPass());
    }
    composer.setPixelRatio(basePixelRatio() * prScale);
    composer.setSize(w, h);
  } else if (composer) {
    composer.dispose(); composer = null;
  }
  $('#rotate').hidden = !(IS_TOUCH && h > w && state !== 'race');
}
function render(scene, cam) {
  if (composer) { renderPass.scene = scene; renderPass.camera = cam; composer.render(); }
  else renderer.render(scene, cam);
}

// ------------------------------------------------------------------ garagem 3D
const showroom = (() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#120e2c');
  scene.fog = new THREE.Fog('#120e2c', 14, 40);
  scene.add(new THREE.HemisphereLight('#b9a8ff', '#1a1236', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.6); key.position.set(5, 8, 6); scene.add(key);
  const rim = new THREE.DirectionalLight('#29d3ff', 2.2); rim.position.set(-6, 3, -6); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 48), new THREE.MeshLambertMaterial({ color: '#221a4a' }));
  floor.position.y = -0.13; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.95, 1.25) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
  const grid = new THREE.GridHelper(80, 40, '#ff3d8b', '#3a2a6a'); grid.position.y = -0.26; scene.add(grid);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  let car = null, ang = 0.6;
  return {
    scene, cam,
    setColor(hex) {
      if (car) scene.remove(car.root);
      car = createCar(hex, { player: true, night: false });
      scene.add(car.root);
    },
    update(dt) {
      ang += dt * 0.35;
      if (car) car.root.rotation.y = ang;
      const narrow = innerWidth < 720 && innerHeight > innerWidth * 0.8;
      const land = innerWidth > innerHeight;
      cam.position.set(0, narrow ? 4.2 : 3.2, narrow ? 15 : 12);
      cam.lookAt(0, narrow ? -0.6 : 0.5, 0);
      if (land) cam.setViewOffset(innerWidth, innerHeight, innerWidth * 0.2, 0, innerWidth, innerHeight);
      else cam.clearViewOffset();
    },
  };
})();

// ------------------------------------------------------------------ estado
let state = 'loading';
let world = null, race = null, raceIndex = 0, attractIdx = 0;
let paused = false;
const screens = ['#loading', '#scr-title', '#scr-menu', '#scr-champ', '#scr-garage', '#scr-options', '#scr-pause', '#scr-results'];

function show(id) {
  for (const s of screens) $(s).hidden = s !== id;
  const racing = id === null;
  $('#hud').hidden = !racing && id !== '#scr-pause';
  $('#touch').hidden = !(racing && IS_TOUCH);
  input.capture = racing;
  if (id !== null) $('#speedlines').classList.remove('on');
  $$('.credits').forEach((e) => { e.textContent = save.credits.toLocaleString('pt-BR'); });
}

function loadWorld(index, attract) {
  if (race) { race.dispose(); race = null; }
  if (world) { world.dispose(); world = null; }
  world = buildWorld(RACES[index]);
  race = new Race({ world, index, save, audio, attract });
  if (!attract) drawMinimapBase();
}

function goAttract() {
  attractIdx = (attractIdx + 1) % RACES.length;
  const unlocked = RACES.map((_, i) => i).filter((i) => isUnlocked(save, i));
  const idx = unlocked[attractIdx % unlocked.length];
  loadWorld(idx, true);
  audio.engineOff();
  audio.music(PLANETS[RACES[idx].planet].music);
}

function withLoading(text, fn) {
  $('#loading-text').textContent = text;
  show('#loading');
  setTimeout(() => { fn(); }, 40);
}

function startRace(index) {
  raceIndex = index;
  paused = false;
  withLoading(`${PLANETS[RACES[index].planet].name} · ${RACES[index].name}`, () => {
    loadWorld(index, false);
    state = 'race';
    show(null);
    $('#t-accel').hidden = save.opts.autoAccel;
    $('#h-lap').textContent = `1/${race.laps}`;
    audio.music(PLANETS[RACES[index].planet].music);
    setupRender();
  });
}

function toMenu(id = '#scr-menu') {
  if (state === 'race' || state === 'results' || !world || (race && !race.attract)) goAttract();
  state = 'menu';
  paused = false;
  show(id);
  if (id === '#scr-champ') buildChamp();
  setupRender();
}

// ------------------------------------------------------------------ campeonato
function buildChamp() {
  const root = $('#planets');
  root.innerHTML = '';
  PLANETS.forEach((p, pi) => {
    const idxs = RACES.map((r, i) => [r, i]).filter(([r]) => r.planet === pi);
    const locked = !isUnlocked(save, idxs[0][1]);
    const card = document.createElement('div');
    card.className = 'planet' + (locked ? ' locked' : '');
    card.innerHTML = `<div class="head" style="background:${p.chip}"><h3>${p.name}</h3><p>${p.tagline}</p></div><div class="races"></div>`;
    const list = card.querySelector('.races');
    idxs.forEach(([r, i], k) => {
      const un = isUnlocked(save, i);
      const best = save.best[r.id];
      const b = document.createElement('button');
      b.className = 'race'; b.disabled = !un;
      const medal = !un ? '<span class="medal lock">🔒</span>' : best ? `<span class="medal ${best <= 3 ? 'p' + best : 'px'}">${best}º</span>` : '<span class="medal px">—</span>';
      b.innerHTML = `<span class="n">${k + 1}</span><span><span class="nm">${r.name}</span><span class="tm">${r.time} · ${r.laps} voltas</span></span>${medal}`;
      b.addEventListener('click', () => { audio.sfx('ui'); startRace(i); });
      list.appendChild(b);
    });
    root.appendChild(card);
  });
}

// ------------------------------------------------------------------ garagem
function buildGarage() {
  const root = $('#upgrades');
  root.innerHTML = '';
  UPGRADES.forEach((u) => {
    const lv = save.upgrades[u.id];
    const cost = lv < MAX_LEVEL ? UPGRADE_COST[lv] : null;
    const el = document.createElement('div');
    el.className = 'upg';
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    const can = cost !== null && save.credits >= cost;
    el.innerHTML = `<span class="nm">${u.name}</span>
      <button class="btn buy ${can ? 'primary' : 'cant'}" ${cost === null ? 'disabled' : ''}>${cost === null ? 'Máximo' : 'Melhorar'}${cost === null ? '' : `<small>${cost.toLocaleString('pt-BR')} cr</small>`}</button>
      <span class="ds">${u.desc}</span><span class="lv">${pips}</span>`;
    el.querySelector('.buy').addEventListener('click', () => {
      if (cost === null) return;
      if (save.credits < cost) { audio.sfx('deny'); return; }
      save.credits -= cost; save.upgrades[u.id]++;
      writeSave(save); audio.sfx('buy');
      buildGarage(); show('#scr-garage');
    });
    root.appendChild(el);
  });
  const sw = $('#swatches');
  sw.innerHTML = '';
  CAR_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === save.color ? ' on' : '');
    b.style.background = c.hex; b.title = c.name; b.setAttribute('aria-label', c.name);
    b.addEventListener('click', () => { save.color = i; writeSave(save); audio.sfx('ui'); showroom.setColor(c.hex); buildGarage(); });
    sw.appendChild(b);
  });
  $('#color-name').textContent = CAR_COLORS[save.color].name;
}
function openGarage() {
  state = 'garage';
  showroom.setColor(CAR_COLORS[save.color].hex);
  buildGarage();
  show('#scr-garage');
  setupRender();
}

// ------------------------------------------------------------------ opções
function syncOptions() {
  $$('.seg').forEach((seg) => {
    const k = seg.dataset.opt;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(save.opts[k]) === b.dataset.v));
  });
}
$$('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
  const k = seg.dataset.opt; let v = b.dataset.v;
  if (v === 'true') v = true; else if (v === 'false') v = false; else if (k === 'cam') v = Number(v);
  save.opts[k] = v; writeSave(save); audio.sfx('ui');
  if (k === 'music') audio.setMusic(v);
  if (k === 'sfx') audio.setSfx(v);
  if (k === 'quality') { prScale = 1; setupRender(); }
  syncOptions();
})));
let resetArmed = false;
$('#btn-reset').addEventListener('click', (e) => {
  if (!resetArmed) { resetArmed = true; e.target.textContent = 'Toque de novo para apagar tudo'; return; }
  save = resetSave(); writeSave(save); resetArmed = false; e.target.textContent = 'Progresso apagado';
  syncOptions();
});

// ------------------------------------------------------------------ navegação
$$('[data-go]').forEach((b) => b.addEventListener('click', () => {
  audio.unlock(); audio.sfx('ui');
  const go = b.dataset.go;
  if (go === 'menu') toMenu('#scr-menu');
  if (go === 'champ') toMenu('#scr-champ');
  if (go === 'options') { syncOptions(); resetArmed = false; $('#btn-reset').textContent = 'Apagar progresso'; toMenu('#scr-options'); }
  if (go === 'garage') openGarage();
  if (go === 'quick') {
    const un = RACES.map((_, i) => i).filter((i) => isUnlocked(save, i));
    startRace(un[Math.floor(Math.random() * un.length)]);
  }
}));
function begin() {
  if (state !== 'title') return;
  audio.unlock(); audio.sfx('go');
  const idx = RACES.findIndex((r) => r === race?.world.def);
  audio.music(PLANETS[RACES[Math.max(0, idx)].planet].music);
  state = 'menu'; show('#scr-menu');
}
$('#btn-start').addEventListener('click', begin);
$('#scr-title').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) begin(); });
$('#btn-fullscreen').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); }
    else await document.exitFullscreen();
  } catch (err) { /* nem todo navegador deixa */ }
});
$('#btn-pause').addEventListener('click', () => setPause(true));
$('#btn-resume').addEventListener('click', () => setPause(false));
$('#btn-restart').addEventListener('click', () => startRace(raceIndex));
$('#btn-quit').addEventListener('click', () => { audio.engineOff(); toMenu('#scr-menu'); });
$('#btn-next').addEventListener('click', () => startRace(Math.min(raceIndex + 1, RACES.length - 1)));
$('#btn-again').addEventListener('click', () => startRace(raceIndex));
$('#btn-res-garage').addEventListener('click', () => { goAttract(); openGarage(); });
$('#btn-res-menu').addEventListener('click', () => toMenu('#scr-champ'));

function setPause(p) {
  if (state !== 'race') return;
  paused = p;
  $('#scr-pause').hidden = !p;
  $('#touch').hidden = p || !IS_TOUCH;
  if (p) audio.engineOff();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });

// ------------------------------------------------------------------ resultado
function finishRace(res) {
  state = 'results';
  audio.engineOff();
  const def = RACES[raceIndex];
  const prize = Math.round(PRIZES[res.pos - 1] * (1 + raceIndex * 0.12) / 10) * 10;
  const coinCr = res.coins * COIN_VALUE;
  const wasUnlocked = raceIndex + 1 < RACES.length && isUnlocked(save, raceIndex + 1);
  save.credits += prize + coinCr;
  const prev = save.best[def.id];
  if (prev === undefined || res.pos < prev) save.best[def.id] = res.pos;
  writeSave(save);

  $('#res-track').textContent = `${PLANETS[def.planet].name} · ${def.name}`;
  $('#res-title').textContent = res.pos === 1 ? 'Vitória!' : `${res.pos}º lugar`;
  const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
  $('#res-table').innerHTML = res.rows.map((r, i) =>
    `<li class="${r.isPlayer ? 'me' : ''}"><span class="p">${i + 1}</span><span class="c" style="background:${r.color}"></span><span>${r.name}</span><span class="t">${r.est ? '~' : ''}${fmt(r.time)}</span></li>`).join('');
  $('#res-prize').textContent = prize.toLocaleString('pt-BR');
  $('#res-coins').textContent = `${res.coins} × ${COIN_VALUE} = ${coinCr.toLocaleString('pt-BR')}`;
  $('#res-total').textContent = '+' + (prize + coinCr).toLocaleString('pt-BR');
  $('#res-lap').textContent = isFinite(res.bestLap) ? fmt(res.bestLap) : '—';
  const nextOk = raceIndex + 1 < RACES.length && isUnlocked(save, raceIndex + 1);
  const note = $('#res-note');
  if (res.pos <= 3 && raceIndex === RACES.length - 1) { note.textContent = 'Campeão das 12 pistas. Tente vencer todas em 1º.'; note.className = 'res-note good'; }
  else if (nextOk && !wasUnlocked) { note.textContent = `Pista liberada: ${RACES[raceIndex + 1].name}`; note.className = 'res-note good'; }
  else if (!nextOk) { note.textContent = 'Chegue até o 3º lugar para liberar a próxima pista. Melhorias na garagem ajudam.'; note.className = 'res-note bad'; }
  else { note.textContent = ''; note.className = 'res-note'; }
  $('#btn-next').hidden = !nextOk;
  show('#scr-results');
}

// ------------------------------------------------------------------ HUD
const mm = $('#minimap'), mmc = mm.getContext('2d');
let mmBase = null, mmX = null;
function drawMinimapBase() {
  const tr = world.track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tr.N; i++) { minX = Math.min(minX, tr.px[i]); maxX = Math.max(maxX, tr.px[i]); minZ = Math.min(minZ, tr.pz[i]); maxZ = Math.max(maxZ, tr.pz[i]); }
  const S = 160, pad = 14, sc = (S - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (S - (maxX - minX) * sc) / 2, oz = (S - (maxZ - minZ) * sc) / 2;
  mmX = (x, z) => [ox + (x - minX) * sc, oz + (z - minZ) * sc];
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= tr.N; i += 4) { const [x, y] = mmX(tr.px[i % tr.N], tr.pz[i % tr.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
  path(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9; g.stroke();
  path(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.stroke();
  const [sx, sy] = mmX(tr.px[0], tr.pz[0]);
  g.fillStyle = '#ffc83d'; g.fillRect(sx - 4, sy - 4, 8, 8);
  mmBase = c;
}
function drawMinimap() {
  if (!mmBase) return;
  mmc.clearRect(0, 0, 160, 160);
  mmc.drawImage(mmBase, 0, 0);
  const tr = world.track;
  for (const c of race.cars) {
    const s = tr.sample(c.dist);
    const [x, y] = mmX(s.x, s.z);
    mmc.beginPath(); mmc.arc(x, y, c.isPlayer ? 5.5 : 3.2, 0, 7);
    mmc.fillStyle = c.isPlayer ? '#ffc83d' : '#ff3d8b';
    mmc.fill();
    if (c.isPlayer) { mmc.lineWidth = 2; mmc.strokeStyle = '#000'; mmc.stroke(); }
  }
}
const rpmEl = $('#h-rpm');
rpmEl.innerHTML = Array.from({ length: 14 }, (_, i) => `<i class="${i >= 11 ? 'r' : i >= 8 ? 'y' : ''}"></i>`).join('');
const rpmBars = [...rpmEl.children];
let lastHud = {};
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
function msg(text, kind) {
  const m = $('#msg');
  m.className = 'msg'; void m.offsetWidth;
  m.textContent = text; m.className = `msg show ${kind || ''}`;
}
function updateHud() {
  const P = race.player;
  for (const e of race.events.splice(0)) {
    if (e.type === 'count') {
      const cnt = $('#count'); cnt.hidden = false;
      const lights = [...cnt.querySelectorAll('i')];
      const n = $('#count-n');
      if (e.n > 0) {
        lights.forEach((l, i) => { l.className = i < 4 - e.n ? 'red' : ''; });
        n.textContent = e.n; n.className = 'count-n';
      } else {
        lights.forEach((l) => { l.className = 'green'; });
        n.textContent = 'VAI!'; n.className = 'count-n go';
        setTimeout(() => { cnt.hidden = true; }, 900);
      }
    } else if (e.type === 'msg') msg(e.text, e.kind);
    else if (e.type === 'nitro') msg('NITRO!', 'nitro');
    else if (e.type === 'finish') msg(e.pos === 1 ? 'VITÓRIA!' : `${e.pos}º LUGAR`, e.pos <= 3 ? 'good' : 'lap');
  }
  if (!P) return;
  const posEl = $('#h-pos');
  if (lastHud.pos !== P.pos) { if (lastHud.pos) { const p = posEl.parentElement; p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse'); } lastHud.pos = P.pos; posEl.textContent = P.pos; }
  setText('#h-lap', `${Math.min(race.laps, Math.max(1, Math.floor(P.dist / race.L) + 1))}/${race.laps}`);
  const t = race.time, m = Math.floor(t / 60);
  setText('#h-time', `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`);
  setText('#h-speed', String(Math.round(P.v * 3.6)));
  setText('#h-gear', String(P.gear));
  setText('#h-coins', String(race.coins));
  const on = Math.round(P.rpm / 1.08 * rpmBars.length);
  if (lastHud.rpm !== on) { lastHud.rpm = on; rpmBars.forEach((b, i) => b.classList.toggle('on', i < on)); }
  const en = Math.round(P.energy);
  if (lastHud.en !== en) { lastHud.en = en; const e = $('#h-energy'); e.style.width = en + '%'; e.classList.toggle('low', en < 25); }
  const nk = `${P.nitro}/${P.nitroMax}`;
  if (lastHud.nk !== nk) { lastHud.nk = nk; $('#h-nitro').innerHTML = Array.from({ length: Math.max(P.nitro, P.nitroMax) }, (_, i) => `<i class="${i < P.nitro ? '' : 'off'}"></i>`).join(''); }
  $('#speedlines').classList.toggle('on', P.nitroT > 0 || P.boostT > 0);
  drawMinimap();
}

// ------------------------------------------------------------------ laço
let last = performance.now(), time = 0;
let fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  input.poll();

  if (input.take('confirm') && state === 'title') begin();
  if (state === 'race') {
    if (input.take('pause')) setPause(!paused);
    if (input.take('camera')) { save.opts.cam = save.opts.cam ? 0 : 1; writeSave(save); }
  }
  if (input.take('mute')) { save.opts.music = !save.opts.music; audio.setMusic(save.opts.music); writeSave(save); }

  if (state === 'garage') {
    showroom.update(dt);
    render(showroom.scene, showroom.cam);
  } else if (world && race) {
    if (!paused) {
      race.update(dt, input, { autoAccel: save.opts.autoAccel });
      if (state === 'race') {
        updateHud();
        if (race.done && race.result) finishRace(race.result);
      }
    }
    race.updateCamera(camera, dt, save.opts, camera.aspect);
    world.update(time, camera);
    render(world.scene, camera);
  }
  input.endFrame();

  // resolução dinâmica: se cair abaixo de ~45 fps, reduz a escala
  if (state === 'race' && !paused) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2.5) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 45 && prScale > 0.6) { prScale = Math.max(0.6, prScale - 0.15); setupRender(); }
      else if (fps > 58 && prScale < 1) { prScale = Math.min(1, prScale + 0.1); setupRender(); }
    }
  }
}

addEventListener('resize', setupRender);
// gancho para testes automatizados
window.__asfalto = { get race() { return race; }, get state() { return state; }, input, save: () => save };
input.bindTouch($('#touch'));
if (IS_TOUCH) $('#start-hint').textContent = 'Toque para começar';

// início
document.fonts?.ready.catch(() => {}).finally?.(() => {});
setTimeout(() => {
  loadWorld(0, true);
  setupRender();
  state = 'title';
  show('#scr-title');
  requestAnimationFrame(frame);
}, 30);
