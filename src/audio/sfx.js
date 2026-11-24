function makeNoiseBuffer(ctx, seconds = 2) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function makePan(ctx, value) {
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = value;
    return panner;
  }
  return ctx.createGain();
}

const CHIME_NOTES = [587.33, 698.46, 880.0, 1046.5, 1174.66, 1396.91];

export class Sfx {
  constructor({ ctx, output, reverb }) {
    this.ctx = ctx;
    this.output = output;
    this.noise = makeNoiseBuffer(ctx, 2);

    this.send = ctx.createGain();
    this.send.gain.value = 0.4;
    this.send.connect(reverb);

    this.lastChime = -10;
    this.cricketTimer = 1.2 + Math.random() * 2;
    this.waterGain = null;
    this.startAmbience();
  }

  startAmbience() {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.04;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    source.start();
    lfo.start();
    this.waterGain = gain;
    this.waterSource = source;
  }

  splash(intensity = 1) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const amount = Math.min(1.2, Math.max(0.2, intensity));

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(1100 + amount * 700, now);
    band.frequency.exponentialRampToValueAtTime(420, now + 0.34);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12 * amount, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    source.connect(band);
    band.connect(gain);
    gain.connect(this.output);
    gain.connect(this.send);

    source.start(now);
    source.stop(now + 0.55);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, now);
    thump.frequency.exponentialRampToValueAtTime(72, now + 0.2);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(0.05 * amount, now + 0.02);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    thump.connect(thumpGain);
    thumpGain.connect(this.output);
    thump.start(now);
    thump.stop(now + 0.3);
  }

  stroke(intensity = 1) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(360, now);
    filter.frequency.exponentialRampToValueAtTime(720, now + 0.12);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.36);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.085 * intensity, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    gain.connect(this.send);
    source.start(now);
    source.stop(now + 0.46);
  }

  chime() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastChime < 0.9) return;
    this.lastChime = now;

    const frequency = CHIME_NOTES[Math.floor(Math.random() * CHIME_NOTES.length)];
    const panner = makePan(ctx, Math.random() * 1.2 - 0.6);
    panner.connect(this.output);
    panner.connect(this.send);

    const partials = [
      { ratio: 1, level: 0.035, decay: 2.2 },
      { ratio: 2.01, level: 0.014, decay: 1.6 },
      { ratio: 3.02, level: 0.007, decay: 1.1 },
    ];

    for (const partial of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency * partial.ratio;
      const gain = ctx.createGain();
      const when = now + 0.02;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(partial.level, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + partial.decay);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(when);
      osc.stop(when + partial.decay + 0.05);
    }
  }

  cricket(dayness = 0) {
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.03;
    const chirps = 2 + Math.floor(Math.random() * 3);
    const panner = makePan(ctx, Math.random() * 1.8 - 0.9);
    panner.connect(this.output);

    for (let i = 0; i < chirps; i += 1) {
      const when = start + i * 0.072;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 4200 + Math.random() * 700;
      const gain = ctx.createGain();
      const level = 0.006 * (1 - dayness * 0.82);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(level, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(when);
      osc.stop(when + 0.06);
    }
  }

  update(dt, state) {
    const now = this.ctx.currentTime;
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricket(state.dayness || 0);
      this.cricketTimer = 1.6 + Math.random() * 3.1;
    }
    if (this.waterGain) {
      const target = 0.03 + Math.min(0.05, Math.abs(state.speed || 0) * 0.012);
      this.waterGain.gain.setTargetAtTime(target, now, 0.5);
    }
  }

  dispose() {
    if (this.waterSource) {
      try {
        this.waterSource.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}
