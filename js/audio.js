// Todo o som é sintetizado com Web Audio: motor, efeitos e trilha synthwave.

// Trilhas synthwave, uma por planeta. Melodias em graus da escala menor: [passo, grau, duração] em 32 passos (2 compassos).
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
const STYLES = [
  { // Terra Nova — Lá menor, ensolarada
    bpm: 124, key: 45, lead: 'sawtooth',
    prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M'], [0, 'm'], [-4, 'M'], [-2, 'M'], [-5, 'M']],
    A: [[0, 4, 3], [3, 5, 1], [4, 4, 2], [6, 2, 2], [8, 0, 4], [12, 2, 2], [14, 4, 2], [16, 5, 4], [20, 4, 2], [22, 5, 2], [24, 6, 6], [30, 5, 2]],
    B: [[0, 7, 4], [4, 6, 2], [6, 5, 2], [8, 4, 4], [12, 5, 2], [14, 6, 2], [16, 7, 3], [19, 8, 1], [20, 7, 4], [24, 5, 4], [28, 4, 4]],
  },
  { // Duna Vermelha — Ré menor, pesada
    bpm: 112, key: 38, lead: 'square',
    prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [5, 'm'], [5, 'm'], [3, 'M'], [7, 'M']],
    A: [[0, 0, 2], [2, 2, 2], [4, 3, 4], [10, 2, 2], [12, 0, 4], [16, 4, 6], [22, 3, 2], [24, 2, 4], [28, 1, 4]],
    B: [[0, 4, 2], [2, 5, 2], [4, 7, 6], [12, 6, 4], [16, 5, 2], [18, 4, 2], [20, 5, 4], [24, 4, 8]],
  },
  { // Cristalis — Mi menor, etérea
    bpm: 104, key: 40, lead: 'triangle',
    prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M'], [5, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M']],
    A: [[0, 7, 6], [6, 6, 2], [8, 4, 8], [16, 5, 4], [20, 4, 2], [22, 2, 2], [24, 4, 8]],
    B: [[0, 9, 4], [4, 8, 4], [8, 7, 8], [16, 8, 2], [18, 7, 2], [20, 6, 4], [24, 7, 8]],
  },
  { // Neo Tóquio 3000 — Fá# menor, rápida
    bpm: 132, key: 42, lead: 'sawtooth',
    prog: [[0, 'm'], [-4, 'M'], [-2, 'M'], [3, 'M'], [0, 'm'], [-4, 'M'], [-2, 'M'], [-2, 'M']],
    A: [[0, 4, 1], [1, 4, 1], [2, 5, 2], [4, 4, 2], [6, 2, 2], [8, 3, 2], [10, 2, 2], [12, 0, 4], [16, 4, 1], [17, 4, 1], [18, 5, 2], [20, 6, 2], [22, 7, 4], [26, 6, 2], [28, 5, 4]],
    B: [[0, 7, 2], [2, 9, 2], [4, 8, 2], [6, 7, 2], [8, 6, 4], [12, 4, 4], [16, 7, 2], [18, 9, 2], [20, 11, 4], [24, 9, 2], [26, 8, 2], [28, 7, 4]],
  },
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
    this.style = style; this.hype = false;
    const ctx = this.ctx;
    if (!this.duck) {
      // ducking: graves e pad "respiram" a cada bumbo
      this.duck = ctx.createGain(); this.duck.connect(this.musicBus);
      this.verb = ctx.createConvolver();
      const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      this.verb.buffer = ir;
      this.verbG = ctx.createGain(); this.verbG.gain.value = 0.35;
      this.verb.connect(this.verbG); this.verbG.connect(this.musicBus);
    }
    const S = STYLES[style];
    this.step = 0; this.next = ctx.currentTime + 0.1;
    const spb = 60 / S.bpm / 4;
    this.timer = setInterval(() => {
      if (!this.ctx) return;
      while (this.next < this.ctx.currentTime + 0.15) { this.playStep(S, this.step, this.next, spb); this.next += spb; this.step++; }
    }, 25);
  }
  setHype(on) { this.hype = on; }
  stopMusic() { if (this.timer) clearInterval(this.timer); this.timer = null; this.style = -1; }

  voice(type, freq, t, dur, vol, dest, { cutoff = 2400, detune = 0, attack = 0.005, glide = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
    if (glide) { o.frequency.setValueAtTime(freq * glide, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.05); } else o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); for (const d of dest) g.connect(d);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  playStep(S, step, t, spb) {
    const ctx = this.ctx, bus = this.musicBus;
    const bar = Math.floor(step / 16), st = step % 16;
    // forma: 4 compassos de introdução, depois ciclo de 12 (A, A, B, B, A oitava acima, B)
    const intro = bar < 4;
    const cyc = intro ? -1 : (bar - 4) % 12;
    const chorus = cyc >= 4;
    const [off, q] = S.prog[bar % S.prog.length];
    const root = S.key + off, third = q === 'm' ? 3 : 4;
    const when = t - ctx.currentTime;
    const hype = this.hype;
    const section = !intro && st === 0 && cyc % 4 === 0;

    // bateria
    if (st % 4 === 0) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
      const g = ctx.createGain(); g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
      this.noiseHit(0.015, 0.25, 'highpass', 3000, 2500, when, bus);
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setValueAtTime(0.35, t); this.duck.gain.linearRampToValueAtTime(1, t + spb * 3);
    }
    if (st === 4 || st === 12) {
      this.noiseHit(0.22, 0.45, 'bandpass', 1800, 1200, when, bus, 0.8);
      this.noiseHit(0.3, 0.25, 'bandpass', 1800, 1200, when, this.verb, 0.8);
      this.voice('triangle', 190, t, 0.1, 0.25, [bus]);
      if (chorus || hype) this.noiseHit(0.12, 0.3, 'bandpass', 1100, 900, when + 0.012, bus, 1.5);
    }
    if (!intro && st === 14 && bar % 2 === 1) this.noiseHit(0.12, 0.3, 'bandpass', 1800, 1200, when, bus, 0.8);
    const hatEvery = chorus || hype ? 1 : 2;
    if (st % hatEvery === 0 && st % 4 !== 0) this.noiseHit(st % 4 === 2 ? 0.09 : 0.03, st % 4 === 2 ? 0.14 : 0.08, 'highpass', 8000, 7000, when, bus);
    if (section) this.noiseHit(1.6, 0.35, 'highpass', 5000, 3000, when, this.verb);

    // baixo pulsando em colcheias
    if (st % 2 === 0 || chorus) {
      const n = root - 12 + (st % 8 === 6 ? 12 : 0);
      this.voice('sawtooth', mtof(n), t, spb * (chorus ? 0.9 : 1.8), 0.24, [this.duck], { cutoff: 500 + (chorus ? 500 : 200) });
    }
    // arpejo
    if (!intro || bar >= 2) {
      const pat = [0, third, 7, 12, 7, third, 12, 7 + 12];
      const an = root + 12 + pat[st % 8];
      this.voice('square', mtof(an), t, spb * 0.8, hype ? 0.06 : 0.045, [bus, this.delay], { cutoff: chorus ? 3200 : 1800 });
    }
    // pad
    if (st === 0) {
      const dur = spb * 16;
      for (const n of [0, third, 7, 12]) for (const det of [-9, 9]) this.voice('sawtooth', mtof(root + n), t, dur, 0.022, [this.duck, this.verb], { cutoff: 1500, detune: det, attack: 0.35 });
    }
    // melodia
    if (!intro) {
      const phrase = [S.A, S.A, S.B, S.B, S.A, S.B][Math.floor(cyc / 2)];
      const up = Math.floor(cyc / 2) === 4 || hype ? 12 : 0;
      const pos = (bar % 2) * 16 + st;
      for (const [p, deg, len] of phrase) {
        if (p !== pos) continue;
        const n = S.key + 12 + SCALE[deg % SCALE.length] + up;
        const dur = spb * len;
        for (const det of [-6, 6]) {
          const o = this.voice(S.lead, mtof(n), t, dur, S.lead === 'triangle' ? 0.09 : 0.05, [bus, this.delay, this.verb], { cutoff: S.lead === 'triangle' ? 4000 : 2600, detune: det, glide: 0.97 });
          if (dur > spb * 2) { const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(o.detune); lfo.start(t + 0.15); lfo.stop(t + dur); }
        }
      }
    }
  }
}
