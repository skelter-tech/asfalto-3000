const KEY = 'asfalto3000.save.v1';

export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function defaults() {
  return {
    credits: 1500,
    upgrades: { eng: 0, acc: 0, grip: 0, nitro: 0, armor: 0 },
    color: 0,
    best: {},
    opts: { quality: IS_TOUCH ? 'leve' : 'alta', autoAccel: IS_TOUCH, music: true, sfx: true, cam: 0 },
  };
}

export function loadSave() {
  const d = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') {
      return {
        ...d, ...s,
        upgrades: { ...d.upgrades, ...(s.upgrades || {}) },
        opts: { ...d.opts, ...(s.opts || {}) },
        best: { ...(s.best || {}) },
      };
    }
  } catch (e) { /* sem armazenamento: joga sem salvar */ }
  return d;
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignora */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
  return defaults();
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
