// Teclado, toque e controle (gamepad) num só lugar.
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, accel: false, brake: false };
    this.edges = new Set();
    this.steer = 0; this.throttle = false; this.brake = false; this.nitroTap = false;
    this.padPrev = [];
    // inclinação do aparelho (volante): beta no modo deitado, gamma em pé
    this.tiltOn = false; this.tiltInvert = false; this.tiltRaw = 0; this.tiltZero = 0; this.tiltSeen = false;
    addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      const ang = ((((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) % 360) + 360) % 360;
      this.tiltRaw = ang === 90 ? e.beta : ang === 270 ? -e.beta : ang === 180 ? -e.gamma : e.gamma;
      this.tiltSeen = true;
    });
    const map = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    };
    addEventListener('keydown', (e) => {
      const k = map[e.code];
      if (k) this.keys.add(k);
      if (!e.repeat) {
        if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyN') this.edges.add('nitro');
        if (e.code === 'Escape' || e.code === 'KeyP') this.edges.add('pause');
        if (e.code === 'Enter') this.edges.add('confirm');
        if (e.code === 'KeyC') this.edges.add('camera');
        if (e.code === 'KeyM') this.edges.add('mute');
      }
      if (this.capture && (k || e.code === 'Space')) e.preventDefault();
    });
    addEventListener('keyup', (e) => { const k = map[e.code]; if (k) this.keys.delete(k); });
    addEventListener('blur', () => { this.keys.clear(); Object.keys(this.touch).forEach((k) => { this.touch[k] = false; }); });
  }

  calibrate() { this.tiltZero = this.tiltRaw; }

  // iPhone pede permissão; precisa ser chamado dentro de um toque
  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        return (await DeviceOrientationEvent.requestPermission()) === 'granted';
      }
      return 'DeviceOrientationEvent' in window;
    } catch (err) { return false; }
  }

  bindTouch(root) {
    root.querySelectorAll('[data-touch]').forEach((el) => {
      const k = el.dataset.touch;
      const on = (e) => {
        e.preventDefault();
        if (k === 'nitro') this.edges.add('nitro'); else this.touch[k] = true;
        el.classList.add('on');
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      };
      const off = () => { if (k !== 'nitro') this.touch[k] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  poll() {
    let steer = 0;
    if (this.keys.has('left') || this.touch.left) steer -= 1;
    if (this.keys.has('right') || this.touch.right) steer += 1;
    let throttle = this.keys.has('up') || this.touch.accel;
    let brake = this.keys.has('down') || this.touch.brake;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = Math.max(-1, Math.min(1, ax * 1.15));
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.3);
      if (b(14)) steer = -1; if (b(15)) steer = 1;
      if (b(0) || b(7)) throttle = true;
      if (b(1) || b(6)) brake = true;
      const edge = (i, name) => { const p = b(i); if (p && !this.padPrev[i]) this.edges.add(name); this.padPrev[i] = p; };
      edge(2, 'nitro'); edge(3, 'nitro'); edge(5, 'nitro'); edge(9, 'pause'); edge(4, 'camera');
      break;
    }
    if (this.tiltOn && this.tiltSeen && steer === 0) {
      let t = (this.tiltRaw - this.tiltZero) / 18;
      if (this.tiltInvert) t = -t;
      t = Math.abs(t) < 0.08 ? 0 : t - Math.sign(t) * 0.08;
      steer = Math.max(-1, Math.min(1, t * 1.1));
    }
    this.steer = steer; this.throttle = throttle; this.brake = brake;
    this.nitroTap = this.edges.has('nitro');
  }

  take(name) { const h = this.edges.has(name); this.edges.delete(name); return h; }
  endFrame() { this.edges.clear(); }
}
