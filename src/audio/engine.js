import { Music } from './music.js';
import { Sfx } from './sfx.js';

function makeImpulseResponse(ctx, seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] =
        (Math.random() * 2 - 1) *
        Math.pow(1 - t, 2.8) *
        (1 - Math.exp(-i / (rate * 0.008)));
    }
  }
  return buffer;
}

/**
 * Audio is only created after a user gesture, so autoplay policy never
 * complains. Master → destination, with independent Music and SFX buses and a
 * shared procedural reverb.
 */
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.music = null;
    this.sfx = null;
  }

  async start() {
    if (this.ready) {
      await this.resume();
      return true;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch {
      this.ctx = null;
      return false;
    }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0;
    this.sfxBus.connect(this.master);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulseResponse(ctx, 3.4);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.55;
    reverb.connect(reverbReturn);
    reverbReturn.connect(this.master);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(reverb);

    this.music = new Music({ ctx, output: this.musicBus, reverb: reverbSend });
    this.sfx = new Sfx({ ctx, output: this.sfxBus, reverb: reverbSend });

    this.ready = true;
    this.applySettings(true);
    return true;
  }

  applySettings(immediate = false) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const timeConstant = immediate ? 0.01 : 0.18;
    const musicLevel = this.settings.get('music')
      ? this.settings.get('musicVolume') * 0.6
      : 0;
    const sfxLevel = this.settings.get('sfx') ? this.settings.get('sfxVolume') * 0.95 : 0;

    this.musicBus.gain.setTargetAtTime(musicLevel, now, timeConstant);
    this.sfxBus.gain.setTargetAtTime(sfxLevel, now, timeConstant);
  }

  async resume() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* the next gesture will try again */
      }
    }
  }

  async suspend() {
    if (!this.ctx) return;
    try {
      await this.ctx.suspend();
    } catch {
      /* not fatal */
    }
  }

  splash(intensity) {
    if (this.ready && this.sfx) this.sfx.splash(intensity);
  }

  stroke(intensity) {
    if (this.ready && this.sfx) this.sfx.stroke(intensity);
  }

  chime() {
    if (this.ready && this.sfx) this.sfx.chime();
  }

  update(dt, state) {
    if (!this.ready) return;
    this.music.update(state && typeof state.dayness === 'number' ? state.dayness : 0);
    this.sfx.update(dt, state);
  }
}
