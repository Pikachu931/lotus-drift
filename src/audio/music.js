const CHORDS = [
  [73.42, 110.0, 146.83, 174.61, 220.0],
  [58.27, 87.31, 116.54, 146.83, 174.61],
  [87.31, 130.81, 174.61, 220.0, 261.63],
  [65.41, 98.0, 130.81, 164.81, 196.0],
  [110.0, 164.81, 220.0, 261.63, 329.63],
];

const NOTES = [587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91, 1567.98];

function makePan(ctx, value) {
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = value;
    return panner;
  }
  return ctx.createGain();
}

export class Music {
  constructor({ ctx, output, reverb }) {
    this.ctx = ctx;
    this.output = output;
    this.time = 0;

    this.send = ctx.createGain();
    this.send.gain.value = 0.55;
    this.send.connect(reverb);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 820;
    this.filter.Q.value = 0.4;

    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.2;
    this.filter.connect(this.padGain);
    this.padGain.connect(output);
    this.padGain.connect(this.send);

    this.voices = [];
    const count = 5;
    for (let i = 0; i < count; i += 1) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = CHORDS[0][i];
      osc.detune.value = (i - 2) * 4;

      const gain = ctx.createGain();
      gain.gain.value = i === 0 ? 0.5 : 0.27;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.027 + i * 0.016;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.connect(gain);
      gain.connect(this.filter);
      osc.start();
      lfo.start();
      this.voices.push({ osc, gain });
    }

    // A quiet high shimmer that drifts against the pad.
    this.shimmer = ctx.createOscillator();
    this.shimmer.type = 'sine';
    this.shimmer.frequency.value = 880;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.006;
    const shimmerLfo = ctx.createOscillator();
    shimmerLfo.frequency.value = 0.05;
    const shimmerDepth = ctx.createGain();
    shimmerDepth.gain.value = 0.004;
    shimmerLfo.connect(shimmerDepth);
    shimmerDepth.connect(shimmerGain.gain);
    this.shimmer.connect(shimmerGain);
    shimmerGain.connect(this.send);
    shimmerGain.connect(output);
    this.shimmer.start();
    shimmerLfo.start();

    this.chordIndex = 0;
    this.nextChord = ctx.currentTime + 12;
    this.nextNote = ctx.currentTime + 3.5;
    this.nextTimbre = ctx.currentTime + 1;
  }

  changeChord(index, when) {
    const chord = CHORDS[index];
    for (let i = 0; i < this.voices.length; i += 1) {
      this.voices[i].osc.frequency.setTargetAtTime(chord[i], when, 2.6);
    }
  }

  pluck(frequency, when, level) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;

    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = frequency * 2.008;

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.35;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, when);
    filter.frequency.exponentialRampToValueAtTime(900, when + 2.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(level, when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 3.4);

    const panner = makePan(ctx, Math.random() * 1.4 - 0.7);

    osc.connect(filter);
    overtone.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.output);
    panner.connect(this.send);

    osc.start(when);
    overtone.start(when);
    osc.stop(when + 3.6);
    overtone.stop(when + 3.6);
  }

  update(dayness = 0) {
    const now = this.ctx.currentTime;

    // The pad opens with the morning and closes again at night, so the music
    // follows the palette instead of sitting in one colour all day.
    if (now >= this.nextTimbre) {
      this.filter.frequency.setTargetAtTime(780 + dayness * 720, now, 5);
      this.padGain.gain.setTargetAtTime(0.2 + dayness * 0.025, now, 5);
      this.nextTimbre = now + 2.5;
    }

    if (now >= this.nextChord) {
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      this.changeChord(this.chordIndex, now);
      this.nextChord = now + 15 + Math.random() * 5;
    }
    if (now >= this.nextNote) {
      const frequency = NOTES[Math.floor(Math.random() * NOTES.length)];
      this.pluck(frequency, now + 0.04, 0.045 + Math.random() * 0.03);
      this.nextNote = now + 2.6 + Math.random() * 4.8;
    }
  }
}
