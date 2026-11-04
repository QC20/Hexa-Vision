// ─────────────────────────────────────────────────────────────────────────────
// Hexa Vision — Sensors
//
// Optional inputs: device tilt (tablets and phones) and the microphone.
// Both must be started from a tap, because iOS only asks for permission
// inside a user gesture.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TILT_DEGREES = 35;

// ─────────────────────────────────────────────────────────────────────────────
// Tilt
// ─────────────────────────────────────────────────────────────────────────────

export class Tilt {
  constructor() {
    this.x = 0; // -1..1, tilt left/right relative to how the device was held when enabled
    this.y = 0; // -1..1, tilt toward/away
    this.active = false;
    this.base = null;
    this.baseAngle = 0;
    this.onOrientation = this.onOrientation.bind(this);
  }

  get supported() {
    return 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;
  }

  async start() {
    const { DeviceOrientationEvent } = window;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const answer = await DeviceOrientationEvent.requestPermission();
      if (answer !== 'granted') throw new Error('Motion permission denied');
    }
    this.base = null;
    window.addEventListener('deviceorientation', this.onOrientation);
    this.active = true;
  }

  stop() {
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.active = false;
    this.x = 0;
    this.y = 0;
  }

  onOrientation(event) {
    if (event.beta == null || event.gamma == null) return;

    const angle = ((screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    const { beta, gamma } = event;

    // Map the device axes onto the screen axes for the current rotation.
    let x = gamma;
    let y = beta;
    if (angle === 90)  { x = beta;   y = -gamma; }
    if (angle === 180) { x = -gamma; y = -beta; }
    if (angle === 270) { x = -beta;  y = gamma; }

    if (!this.base || angle !== this.baseAngle) {
      this.base = { x, y };
      this.baseAngle = angle;
    }

    const clamp = v => Math.max(-1, Math.min(1, v / MAX_TILT_DEGREES));
    this.x = clamp(x - this.base.x);
    this.y = clamp(y - this.base.y);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Microphone
// ─────────────────────────────────────────────────────────────────────────────

export class Microphone {
  constructor() {
    this.level = 0; // 0..1, overall loudness
    this.bass = 0;  // 0..1, low end only
    this.active = false;
  }

  get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  }

  async start() {
    // The AudioContext has to exist before the first await, or Safari keeps it suspended.
    const Context = window.AudioContext || window.webkitAudioContext;
    this.context = new Context();
    this.context.resume();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
    } catch (err) {
      this.context.close();
      throw err;
    }

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.context.createMediaStreamSource(this.stream).connect(this.analyser);
    this.active = true;
  }

  stop() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.context?.close();
    this.active = false;
    this.level = 0;
    this.bass = 0;
  }

  update() {
    if (!this.active) return;
    this.analyser.getByteFrequencyData(this.data);
    this.bass = average(this.data, 1, 8) / 255;
    this.level = average(this.data, 1, 64) / 255;
  }
}

function average(data, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i];
  return sum / (to - from);
}
