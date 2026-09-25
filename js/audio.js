// Todo o som é sintetizado com Web Audio: motor, efeitos e trilha synthwave.

const STYLES = [
  { bpm: 124, key: 45, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },   // Terra Nova: Lá menor
  { bpm: 116, key: 38, prog: [[0, 'm'], [-4, 'M'], [5, 'm'], [7, 'M']] },    // Duna Vermelha: Ré menor
  { bpm: 108, key: 40, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },   // Cristalis: Mi menor
  { bpm: 132, key: 42, prog: [[0, 'm'], [-4, 'M'], [-2, 'M'], [3, 'M']] },   // Neo Tóquio: Fá# menor
];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  constructor() { this.ctx = null; this.musicOn = true; this.sfxOn = true; this.style = -1; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxOn ? 0.8 : 0; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.32 : 0; this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // eco para o arpejo
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.28;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2500;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.musicBus);
    this.buildEngine();
    if (this.pendingStyle !== undefined) this.music(this.pendingStyle);
  }

  weather(kind) {
    if (!this.ctx) return;
    if (!this.rainLoop) {
      const n = this.ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
      const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 7000;
      this.rainLoop = this.ctx.createGain(); this.rainLoop.gain.value = 0;
      n.connect(f); f.connect(f2); f2.connect(this.rainLoop); this.rainLoop.connect(this.sfxBus); n.start();
    }
    this.rainLoop.gain.setTargetAtTime(kind === 'chuva' ? 0.16 : 0, this.ctx.currentTime, 0.4);
  }

  setMusic(on) { this.musicOn = on; if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1); }
  setSfx(on) { this.sfxOn = on; if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05); }

  // ---------------------------------------------------------------- motor
  buildEngine() {
    const ctx = this.ctx;
    const g = this.engGain = ctx.createGain(); g.gain.value = 0;
    const f = this.engFilter = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4; f.frequency.value = 600;
    // saturação: dá "grão" ao ronco
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 2.6); }
    sh.curve = curve; sh.oversample = '2x';
    f.connect(sh); sh.connect(g); g.connect(this.sfxBus);
    const o1 = this.o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = this.o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = this.o3 = ctx.createOscillator(); o3.type = 'triangle';
    const sub = this.sub = ctx.createOscillator(); sub.type = 'sine';
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    const g3 = this.whineG = ctx.createGain(); g3.gain.value = 0.04;
    const gs = ctx.createGain(); gs.gain.value = 0.7;
    o1.connect(f); o2.connect(g2); g2.connect(f); sub.connect(gs); gs.connect(f); o3.connect(g3); g3.connect(g);
    o1.start(); o2.start(); o3.start(); sub.start();
    // turbina (nitro)
    const tb = this.turbo = ctx.createOscillator(); tb.type = 'sine'; tb.frequency.value = 1800;
    this.turboG = ctx.createGain(); this.turboG.gain.value = 0; tb.connect(this.turboG); this.turboG.connect(this.sfxBus); tb.start();
    const loopNoise = (type, freq, q) => {
      const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = type; nf.frequency.value = freq; nf.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = 0;
      n.connect(nf); nf.connect(gg); gg.connect(this.sfxBus); n.start(Math.random());
      return { gain: gg, filter: nf };
    };
    this.off = loopNoise('lowpass', 380, 1);          // ronco na terra
    this.wind = loopNoise('bandpass', 900, 0.6);       // vento
    this.screech = loopNoise('bandpass', 2300, 7);     // pneu cantando
    this.lastLoad = 0;
  }

  engine(rpm, load, speed, boost, offroad, drift = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fr = 46 + rpm * 120 + speed * 22;
    this.o1.frequency.setTargetAtTime(fr, t, 0.03);
    this.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.03);
    this.sub.frequency.setTargetAtTime(fr * 0.5, t, 0.03);
    this.o3.frequency.setTargetAtTime(fr * 3.02, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(280 + load * 1200 + rpm * 1000, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.07 + load * 0.06, t, 0.05);
    this.turboG.gain.setTargetAtTime(boost ? 0.035 : 0, t, 0.1);
    this.turbo.frequency.setTargetAtTime(1500 + rpm * 1400, t, 0.05);
    this.off.gain.gain.setTargetAtTime(offroad * 0.5, t, 0.05);
    this.wind.gain.gain.setTargetAtTime(speed * speed * 0.22, t, 0.1);
    this.wind.filter.frequency.setTargetAtTime(600 + speed * 900, t, 0.1);
    this.screech.gain.gain.setTargetAtTime(drift * 0.16, t, 0.05);
    this.screech.filter.frequency.setTargetAtTime(2100 + Math.sin(t * 23) * 250, t, 0.02);
    // tirou o pé em giro alto: estouros no escapamento
    if (this.lastLoad > 0.8 && load < 0.5 && rpm > 0.6 && this.sfxOn) {
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this.noiseHit(0.05, 0.35 + Math.random() * 0.2, 'lowpass', 1100, 300, 0.05 + i * (0.06 + Math.random() * 0.08));
    }
    this.lastLoad = load;
  }
  engineOff() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const gg of [this.engGain.gain, this.turboG.gain, this.off.gain.gain, this.wind.gain.gain, this.screech.gain.gain]) gg.setTargetAtTime(0, t, 0.08);
  }

  // ---------------------------------------------------------------- efeitos
  tone(type, f0, f1, dur, vol, when = 0, bus = this.sfxBus) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(dur, vol, type, f0, f1, when = 0, bus = this.sfxBus, q = 1) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(bus); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }
  sfx(name) {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'beep': this.tone('square', 660, 660, 0.18, 0.25); break;
      case 'go': this.tone('square', 990, 990, 0.5, 0.28); this.tone('square', 1980, 1980, 0.5, 0.08); break;
      case 'coin': this.tone('square', 1318, 1318, 0.06, 0.12); this.tone('square', 1760, 1760, 0.14, 0.12, 0.06); break;
      case 'pickup': [0, 4, 7, 12].forEach((n, i) => this.tone('triangle', mtof(72 + n), mtof(72 + n), 0.12, 0.25, i * 0.05)); break;
      case 'nitro': this.noiseHit(1.1, 0.5, 'bandpass', 300, 3200, 0, this.sfxBus, 2); this.tone('sawtooth', 110, 440, 0.9, 0.12); break;
      case 'boost': this.noiseHit(0.6, 0.35, 'bandpass', 500, 2600, 0, this.sfxBus, 2); break;
      case 'bump': this.noiseHit(0.25, 0.7, 'lowpass', 1200, 200); this.tone('sine', 120, 45, 0.25, 0.6); break;
      case 'whoosh': this.noiseHit(0.4, 0.22, 'bandpass', 2400, 500, 0, this.sfxBus, 3); break;
      case 'shift': this.noiseHit(0.07, 0.3, 'lowpass', 900, 300); break;
      case 'lap': this.tone('triangle', mtof(79), mtof(79), 0.18, 0.3); this.tone('triangle', mtof(84), mtof(84), 0.3, 0.3, 0.14); break;
      case 'final': [0, 0.14, 0.28].forEach((w, i) => this.tone('square', mtof(76 + i * 4), mtof(76 + i * 4), 0.16, 0.18, w)); break;
      case 'finish': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone('square', mtof(64 + n), mtof(64 + n), 0.22, 0.14, i * 0.08)); break;
      case 'ui': this.tone('square', 880, 880, 0.04, 0.08); break;
      case 'buy': [0, 7, 12, 19].forEach((n, i) => this.tone('triangle', mtof(76 + n), mtof(76 + n), 0.14, 0.22, i * 0.06)); break;
      case 'land': this.noiseHit(0.3, 0.8, 'lowpass', 600, 80); this.tone('sine', 90, 38, 0.3, 0.7); break;
      case 'scrape': this.noiseHit(0.22, 0.35, 'bandpass', 3200, 1800, 0, this.sfxBus, 4); break;
      case 'deny': this.tone('square', 180, 120, 0.2, 0.15); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- música
  music(style) {
    if (!this.ctx) { this.pendingStyle = style; return; }
    if (style === this.style && this.timer) return;
    this.stopMusic();
    this.style = style;
    const S = STYLES[style];
    this.step = 0; this.next = this.ctx.currentTime + 0.1;
    const spb = 60 / S.bpm / 4;
    this.timer = setInterval(() => {
      if (!this.ctx) return;
      while (this.next < this.ctx.currentTime + 0.15) { this.playStep(S, this.step, this.next, spb); this.next += spb; this.step++; }
    }, 25);
  }
  stopMusic() { if (this.timer) clearInterval(this.timer); this.timer = null; this.style = -1; }

  playStep(S, step, t, spb) {
    const ctx = this.ctx, bus = this.musicBus;
    const bar = Math.floor(step / 16) % S.prog.length, st = step % 16;
    const [off, q] = S.prog[bar];
    const root = S.key + off;
    const third = q === 'm' ? 3 : 4;
    const chord = [0, third, 7, 12];
    const when = t - ctx.currentTime;
    // bumbo
    if (st % 4 === 0) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25);
    }
    if (st === 4 || st === 12) this.noiseHit(0.18, 0.4, 'highpass', 1500, 900, when, bus);
    if (st % 2 === 1) this.noiseHit(0.04, 0.12, 'highpass', 7000, 6000, when, bus);
    // baixo em colcheias
    if (st % 2 === 0) {
      const n = root + (st % 4 === 2 ? 12 : 0);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(200, t + spb * 1.8);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.9);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + spb * 2);
    }
    // arpejo
    const an = root + 24 + chord[[0, 1, 2, 3, 2, 1, 0, 2][st % 8]];
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = mtof(an);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.055, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
    o.connect(g); g.connect(bus); g.connect(this.delay); o.start(t); o.stop(t + spb);
    // pad
    if (st === 0) {
      const dur = spb * 16;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const pg = ctx.createGain(); pg.gain.setValueAtTime(0.0001, t); pg.gain.linearRampToValueAtTime(0.05, t + 0.4); pg.gain.linearRampToValueAtTime(0.0001, t + dur);
      f.connect(pg); pg.connect(bus);
      for (const n of [0, third, 7]) for (const det of [-6, 6]) {
        const po = ctx.createOscillator(); po.type = 'sawtooth'; po.frequency.value = mtof(root + 12 + n); po.detune.value = det;
        po.connect(f); po.start(t); po.stop(t + dur + 0.05);
      }
    }
  }
}
