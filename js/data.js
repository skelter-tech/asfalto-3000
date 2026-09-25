// Planetas, pistas, rivais e upgrades de Asfalto 3000.

export const PLANETS = [
  {
    id: 'terra', name: 'Terra Nova',
    tagline: 'Litoral ensolarado, palmeiras e uma metrópole no horizonte.',
    road: ['#5d616e', '#585c69'], line: '#f2f2f2', kerb: ['#e8323c', '#f4f4f4'],
    ground: ['#67bd4e', '#5db345'], groundFar: '#4f9a3e', mount: '#4d74b0', snow: true,
    scenery: [['palm', 5], ['roundTree', 3], ['bush', 3]],
    skyline: true, billboards: true, music: 0, dust: '#d8c9a0', chip: 'linear-gradient(135deg,#2b74e0,#bfe4ff 60%,#67bd4e)',
  },
  {
    id: 'marte', name: 'Duna Vermelha',
    tagline: 'Cânions de ferro, domos de colônia e poeira fina.',
    road: ['#6b5048', '#654a42'], line: '#ffe9c7', kerb: ['#f4f4f4', '#2a2a2e'],
    ground: ['#d4733f', '#c96a38'], groundFar: '#b25a2f', mount: '#8e3b22', snow: false,
    scenery: [['rock', 6], ['rockSmall', 4], ['mesa', 0.7], ['dome', 1], ['antenna', 0.8]],
    music: 1, dust: '#e8a070', chip: 'linear-gradient(135deg,#b8744a,#f0c393 60%,#c96a38)',
  },
  {
    id: 'cristalis', name: 'Cristalis',
    tagline: 'Lua gelada de cristais que brilham no escuro.',
    road: ['#56647a', '#505e74'], line: '#eafcff', kerb: ['#2fb8f5', '#f4f7fb'],
    ground: ['#e9f1f9', '#dde8f3'], groundFar: '#c9d8ea', mount: '#7890bb', snow: true,
    scenery: [['pine', 5], ['crystal', 3], ['iceRock', 2]],
    music: 2, dust: '#ffffff', chip: 'linear-gradient(135deg,#3f95e0,#e6f6ff 60%,#b388ff)',
  },
  {
    id: 'neo', name: 'Neo Tóquio 3000',
    tagline: 'Via expressa entre torres de néon que nunca apagam.',
    road: ['#2b2740', '#27233b'], line: '#ff3bd4', lineGlow: true, kerb: ['#18e0ff', '#1c1830'],
    ground: ['#2a2342', '#241e3a'], groundFar: '#1d1830', mount: '#2a1d4d', snow: false,
    scenery: [['building', 1]], neonArches: true, cityRing: true, music: 3, dust: '#9a7cff',
    chip: 'linear-gradient(135deg,#1a0f40,#ff4f8b 60%,#18e0ff)',
  },
];

// Cada pista: forma (R, wiggle, hills), paleta do céu e da luz.
// sun.az é relativo à direção da largada (0 = sol bem à frente).
export const RACES = [
  // ---------- Terra Nova ----------
  {
    id: 't1', planet: 0, name: 'Costa Dourada', time: 'Manhã', seed: 11, R: 480, wiggle: 0.30, hills: 12, laps: 3,
    sky: { top: '#2b74e0', horizon: '#c4e6ff', bottom: '#a7d4f5' }, fog: '#cfe9ff', fogNear: 140, fogFar: 1150,
    sun: { az: 0.5, el: 0.55, color: '#fff3cf', size: 0.035, glow: 0.35 },
    hemi: ['#e3f3ff', '#6d8f4a', 1.7], dir: ['#fff1d6', 2.6], clouds: '#ffffff',
  },
  {
    id: 't2', planet: 0, name: 'Baía do Poente', time: 'Pôr do sol', seed: 23, R: 520, wiggle: 0.34, hills: 16, laps: 3,
    sky: { top: '#2c1f5e', horizon: '#ff8f4f', bottom: '#ffb36b' }, fog: '#f39a6d', fogNear: 110, fogFar: 1000,
    sun: { az: 0, el: 0.05, color: '#ffd27a', size: 0.10, glow: 0.9, stripes: true },
    hemi: ['#ffc9a8', '#5a4a6a', 1.5], dir: ['#ffb070', 2.2], clouds: '#ffb08a',
  },
  {
    id: 't3', planet: 0, name: 'Avenida Lunar', time: 'Noite', seed: 37, R: 560, wiggle: 0.36, hills: 18, laps: 3,
    sky: { top: '#050a22', horizon: '#27407a', bottom: '#1a2a55' }, fog: '#1d2d5c', fogNear: 90, fogFar: 850,
    moons: [{ az: 0.7, el: 0.32, size: 90, color: '#f3f0ff' }], stars: true, night: true, lamps: true,
    hemi: ['#7d96d9', '#252a44', 1.25], dir: ['#a9bcff', 1.0],
  },
  // ---------- Duna Vermelha ----------
  {
    id: 'm1', planet: 1, name: 'Cânion Olympus', time: 'Tarde', seed: 51, R: 520, wiggle: 0.36, hills: 20, laps: 3,
    sky: { top: '#b8744a', horizon: '#f2c89c', bottom: '#e6b58a' }, fog: '#eab98c', fogNear: 120, fogFar: 1000,
    sun: { az: -0.6, el: 0.45, color: '#fff6e8', size: 0.025, glow: 0.3 },
    hemi: ['#ffdcbc', '#8a4a2a', 1.6], dir: ['#fff0dc', 2.5],
  },
  {
    id: 'm2', planet: 1, name: 'Poente Azul', time: 'Pôr do sol marciano', seed: 67, R: 560, wiggle: 0.40, hills: 22, laps: 3,
    sky: { top: '#1b2552', horizon: '#93b8e2', bottom: '#6e8fc0' }, fog: '#7092c0', fogNear: 110, fogFar: 950,
    sun: { az: 0.2, el: 0.06, color: '#eaf4ff', size: 0.035, glow: 1.1 },
    hemi: ['#a9c1ec', '#5a3a33', 1.45], dir: ['#cfe0ff', 1.8],
  },
  {
    id: 'm3', planet: 1, name: 'Noite das Duas Luas', time: 'Noite', seed: 79, R: 600, wiggle: 0.42, hills: 24, laps: 3,
    sky: { top: '#0c0409', horizon: '#56211f', bottom: '#3a1515' }, fog: '#381617', fogNear: 90, fogFar: 820,
    moons: [{ az: 0.5, el: 0.28, size: 40, color: '#ffe2cc' }, { az: -0.4, el: 0.45, size: 24, color: '#e8d6ff' }],
    stars: true, night: true, lamps: true,
    hemi: ['#d99a88', '#2a1414', 1.2], dir: ['#ffc2a8', 0.9],
  },
  // ---------- Cristalis ----------
  {
    id: 'c1', planet: 2, name: 'Geleira Clara', time: 'Dia', seed: 97, R: 540, wiggle: 0.38, hills: 18, laps: 3,
    sky: { top: '#3f95e0', horizon: '#e8f7ff', bottom: '#d4ecfa' }, fog: '#e3f2fb', fogNear: 140, fogFar: 1100,
    sun: { az: 0.9, el: 0.5, color: '#ffffff', size: 0.03, glow: 0.4 },
    hemi: ['#eef8ff', '#8aa0bf', 1.35], dir: ['#ffffff', 2.0], clouds: '#ffffff',
  },
  {
    id: 'c2', planet: 2, name: 'Aurora', time: 'Noite polar', seed: 113, R: 580, wiggle: 0.42, hills: 20, laps: 3,
    sky: { top: '#040a1a', horizon: '#17565f', bottom: '#10313b' }, fog: '#10323c', fogNear: 90, fogFar: 850,
    stars: true, night: true, aurora: true, lamps: true,
    hemi: ['#6fc3d4', '#1b2a3a', 1.3], dir: ['#a8f0ff', 1.0],
  },
  {
    id: 'c3', planet: 2, name: 'Alvorada de Gelo', time: 'Amanhecer', seed: 131, R: 620, wiggle: 0.44, hills: 22, laps: 3,
    sky: { top: '#6a78d0', horizon: '#ffc4d8', bottom: '#f2c7d8' }, fog: '#f2c9da', fogNear: 120, fogFar: 1000,
    sun: { az: -0.2, el: 0.07, color: '#fff2f6', size: 0.05, glow: 0.9 },
    hemi: ['#ffdbe8', '#7d86b8', 1.35], dir: ['#ffd0dc', 2.0], clouds: '#ffd6e4',
  },
  // ---------- Neo Tóquio 3000 ----------
  {
    id: 'n1', planet: 3, name: 'Anel de Néon', time: 'Crepúsculo', seed: 151, R: 560, wiggle: 0.40, hills: 16, laps: 3,
    sky: { top: '#1a0f40', horizon: '#ff4f8b', bottom: '#a02a6a' }, fog: '#6d2a70', fogNear: 110, fogFar: 950,
    sun: { az: 0, el: 0.04, color: '#ffb36b', size: 0.11, glow: 1.0, stripes: true }, night: true,
    hemi: ['#d08ae0', '#2a1d4d', 1.4], dir: ['#ff9a8a', 1.5],
  },
  {
    id: 'n2', planet: 3, name: 'Distrito 3000', time: 'Noite', seed: 173, R: 600, wiggle: 0.44, hills: 20, laps: 3,
    sky: { top: '#04030e', horizon: '#3e1b70', bottom: '#241244' }, fog: '#1f1239', fogNear: 90, fogFar: 850,
    stars: true, night: true, moons: [{ az: -0.8, el: 0.4, size: 70, color: '#ffd9f4' }],
    hemi: ['#8a7ae6', '#1a1433', 1.3], dir: ['#b7a8ff', 0.9],
  },
  {
    id: 'n3', planet: 3, name: 'Via Expressa Zero', time: 'Madrugada', seed: 197, R: 650, wiggle: 0.46, hills: 24, laps: 3,
    sky: { top: '#020617', horizon: '#106070', bottom: '#0b2a33' }, fog: '#0c2c36', fogNear: 90, fogFar: 850,
    stars: true, night: true,
    hemi: ['#62d6e6', '#101c2a', 1.3], dir: ['#9ff3ff', 0.9],
  },
];

export const RIVALS = [
  'Kira Voss', 'Duda Raio', 'Max Nebulosa', 'Tetsuo K.', 'Lia Cometa', 'Brutus V8',
  'Nina Turbo', 'Otto Kraft', 'Zé Foguete', 'Yumi Hiro', 'Rex Órbita',
];

export const AI_COLORS = [
  '#f5f5f5', '#ffc400', '#1e88ff', '#12c48b', '#8e44ff', '#ff7a2e',
  '#1fd1e0', '#23252b', '#ff4fa3', '#b8d12c', '#6d4c41',
];

export const CAR_COLORS = [
  { name: 'Vermelho Rosso', hex: '#e3202c' },
  { name: 'Amarelo Solar', hex: '#ffc21a' },
  { name: 'Azul Órbita', hex: '#1f7bff' },
  { name: 'Verde Nebulosa', hex: '#10c486' },
  { name: 'Rosa Néon', hex: '#ff4fb0' },
  { name: 'Branco Gelo', hex: '#f2f4f7' },
  { name: 'Violeta Pulsar', hex: '#7040ff' },
  { name: 'Preto Vácuo', hex: '#17181d' },
];

export const UPGRADES = [
  { id: 'eng', name: 'Motor', desc: 'Velocidade máxima' },
  { id: 'acc', name: 'Turbina', desc: 'Aceleração' },
  { id: 'grip', name: 'Pneus', desc: 'Aderência nas curvas' },
  { id: 'nitro', name: 'Nitro', desc: '+1 carga por corrida' },
  { id: 'armor', name: 'Blindagem', desc: 'Menos energia perdida em batidas' },
];
export const UPGRADE_COST = [1000, 2000, 3500, 5500, 8000];
export const MAX_LEVEL = UPGRADE_COST.length;

export const PRIZES = [3000, 2200, 1600, 1250, 1000, 800, 650, 500, 400, 300, 200, 100];
export const COIN_VALUE = 20;

export function playerStats(u) {
  return {
    vmax: 74 + u.eng * 4.2,        // m/s (74 = 266 km/h)
    accel: 15 + u.acc * 2.4,
    cf: 0.135 * (1 - u.grip * 0.11), // força centrífuga sentida
    nitro: 3 + u.nitro,
    armor: 1 - u.armor * 0.15,
  };
}

export function isUnlocked(save, index) {
  if (index === 0) return true;
  const prev = save.best[RACES[index - 1].id];
  return prev !== undefined && prev <= 3;
}
