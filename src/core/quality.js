import { clamp } from './math.js';

/**
 * Level 0 is the light path (no bloom, DPR 1, half particles); level 3 is the
 * full night pond. Automatic quality walks between them from measured frames.
 */
const LEVELS = [
  {
    name: 'light',
    dprCap: 1,
    bloom: false,
    bloomScale: 0,
    particleScale: 0.45,
    waterLights: 3,
    flowerDensity: 0.62,
    glowDensity: 0.34,
    realism: 0.35,
    msaa: 2,
  },
  {
    name: 'economy',
    dprCap: 1.2,
    bloom: true,
    bloomScale: 0.62,
    particleScale: 0.62,
    waterLights: 4,
    flowerDensity: 0.76,
    glowDensity: 0.55,
    realism: 0.55,
    msaa: 2,
  },
  {
    name: 'balanced',
    dprCap: 1.6,
    bloom: true,
    bloomScale: 0.86,
    particleScale: 0.82,
    waterLights: 6,
    flowerDensity: 0.9,
    glowDensity: 0.78,
    realism: 0.82,
    msaa: 2,
  },
  {
    name: 'high',
    dprCap: 2,
    bloom: true,
    bloomScale: 1,
    particleScale: 1,
    waterLights: 8,
    flowerDensity: 1,
    glowDensity: 0.95,
    realism: 1,
    msaa: 4,
  },
];

export class QualityManager {
  constructor(settings, { coarse = false } = {}) {
    this.settings = settings;
    this.coarse = coarse;
    this.autoLevel = coarse ? 1 : 2;
    this.level = 2;
    this.profile = null;
    this.listeners = new Set();

    this.fps = 60;
    this.avgFps = 60;
    this.timeSum = 0;
    this.frames = 0;
    this.lowWindows = 0;
    this.highWindows = 0;
    this.cooldown = 5;
    this.lastMode = this.qualityMode;

    // Continuous resolution headroom inside Automatic. Softening the internal
    // resolution costs far less visually than dropping a whole quality tier.
    this.renderScale = 1;
    this.scaleCooldown = 0;
    this.scaleListeners = new Set();

    this.refresh(true);
  }

  get qualityMode() {
    return this.settings.get('quality');
  }

  /** Device pixels per CSS pixel, including the automatic render scale. */
  get pixelRatio() {
    if (!this.profile) return 1;
    return Math.max(0.5, this.profile.dpr * this.getRenderScale());
  }

  getRenderScale() {
    return this.qualityMode === 'auto' ? this.renderScale : 1;
  }

  buildProfile() {
    const performance = this.settings.get('performance');
    const effectiveLevel = performance ? Math.min(1, this.level) : this.level;
    const base = LEVELS[clamp(Math.round(effectiveLevel), 0, 3)];
    const manualLight = this.qualityMode === 'light';
    const cap = performance || manualLight ? 1 : base.dprCap;
    const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const dpr = Math.min(devicePixelRatio, cap);
    const bloom = performance || manualLight ? false : base.bloom;
    const realismMode = this.settings.get('realism');
    const realism =
      realismMode === 'high'
        ? 1
        : realismMode === 'light'
          ? 0.34
          : Math.min(1, base.realism * (performance ? 0.78 : 1));
    return {
      ...base,
      level: base.name === 'light' ? 0 : base.name === 'economy' ? 1 : base.name === 'balanced' ? 2 : 3,
      dpr,
      bloom,
      bloomScale: bloom ? base.bloomScale : 0,
      realism,
      realismMode,
      cheapFlora: realism < 0.48 || performance,
      boatmanDetail: realism >= 0.62,
      leafDensity: realism < 0.48 ? 0.45 : realism < 0.75 ? 0.7 : 1,
      performance,
    };
  }

  refresh(initial = false) {
    const mode = this.qualityMode;
    const previousMode = this.lastMode;
    // Returning to Automatic after a manual choice should start fresh rather
    // than inheriting a level that was lowered during an earlier hiccup.
    if (mode === 'auto' && this.lastMode !== 'auto') {
      this.autoLevel = this.coarse ? 1 : 2;
    }
    this.lastMode = mode;
    // A manual tier is a fixed look; automatic scaling belongs to Automatic.
    if (mode !== 'auto') this.renderScale = 1;
    if (mode === 'high') this.level = 3;
    else if (mode === 'light') this.level = 0;
    else this.level = this.autoLevel;

    const previous = this.profile;
    const next = this.buildProfile();
    this.profile = next;

    const changed =
      !previous ||
      previousMode !== mode ||
      previous.name !== next.name ||
      Math.abs(previous.dpr - next.dpr) > 0.001 ||
      previous.bloom !== next.bloom ||
      Math.abs(previous.realism - next.realism) > 0.01;

    if (!initial && changed) this.notify(next);
  }

  notify(profile) {
    for (const listener of this.listeners) {
      try {
        listener(profile);
      } catch (error) {
        console.error('Quality listener failed', error);
      }
    }
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onScaleChange(listener) {
    this.scaleListeners.add(listener);
    return () => this.scaleListeners.delete(listener);
  }

  notifyScale() {
    const ratio = this.pixelRatio;
    for (const listener of this.scaleListeners) {
      try {
        listener(ratio);
      } catch (error) {
        console.error('Render scale listener failed', error);
      }
    }
  }

  recordFrame(dt) {
    if (dt <= 0) return;
    const instantaneous = 1 / Math.max(dt, 0.0001);
    this.fps = this.fps * 0.93 + instantaneous * 0.07;

    if (this.qualityMode !== 'auto') return;

    this.cooldown = Math.max(0, this.cooldown - dt);
    this.scaleCooldown = Math.max(0, this.scaleCooldown - dt);
    this.timeSum += dt;
    this.frames += 1;
    if (this.timeSum < 2) return;

    const measured = this.frames / this.timeSum;
    this.avgFps = measured;
    this.timeSum = 0;
    this.frames = 0;

    // A 60 Hz desktop and a 30 Hz phone have different definitions of slow.
    const lowScaleFps = this.coarse ? 28 : 50;
    const highScaleFps = this.coarse ? 34 : 58;

    if (measured < lowScaleFps) {
      this.highWindows = 0;
      // Spend the cheap headroom first. Changing bloom, MSAA and density is a
      // visible pop; a slightly softer image is not.
      if (this.renderScale > 0.6) {
        if (this.scaleCooldown <= 0) {
          const step = measured < lowScaleFps * 0.8 ? 0.16 : 0.08;
          this.renderScale = Math.max(0.6, this.renderScale - step);
          this.scaleCooldown = 1.4;
          this.notifyScale();
        }
        this.lowWindows = 0;
        return;
      }
      this.lowWindows += 1;
      if (this.lowWindows >= 2 && this.level > 0 && this.cooldown <= 0) {
        this.autoLevel = Math.max(0, this.level - 1);
        this.lowWindows = 0;
        this.cooldown = 8;
        this.refresh();
      }
    } else if (measured > highScaleFps) {
      this.highWindows += 1;
      this.lowWindows = 0;
      if (this.renderScale < 1) {
        if (this.highWindows >= 2 && this.scaleCooldown <= 0) {
          this.renderScale = Math.min(1, this.renderScale + 0.05);
          this.scaleCooldown = 1.4;
          this.notifyScale();
        }
        return;
      }
      if (this.highWindows >= 4 && this.level < 3 && this.cooldown <= 0) {
        this.autoLevel = Math.min(3, this.level + 1);
        this.highWindows = 0;
        this.cooldown = 14;
        this.refresh();
      }
    } else {
      this.lowWindows = 0;
      this.highWindows = 0;
    }
  }

  getFps() {
    return this.fps;
  }
}
