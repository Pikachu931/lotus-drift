/**
 * Central tuning values for Lotus Drift.
 * Everything is procedural: no assets, no network requests.
 */

export const APP_NAME = 'Lotus Drift';

/**
 * Change this single constant to put your own name on the credit line
 * and in the manifesto.
 */
export const CREATOR_NAME = 'SA7';

export const WORLD = {
  chunkSize: 40,
  viewRadius: 3,
  waterSize: 420,
  waterSegmentsHigh: 140,
  waterSegmentsLight: 72,
  fogNight: 0.0125,
};

export const PHYSICS = {
  maxSpeed: 4.0,
  reverseSpeed: 1.15,
  strokePeriod: 1.05,
  strokeRateMin: 0.4,
  strokeRateMax: 1.0,
  strokeImpulse: 1.35,
  forwardAccel: 1.5,
  reverseAccel: 1.1,
  drag: 0.55,
  turnRate: 0.92,
  turnDamping: 4.2,
  driftGain: 0.55,
  driftDamping: 3.0,
};

/** Four glow colours, as required by the brief. */
export const FLOWER_COLORS = [
  { name: 'pink', hex: 0xff7fbf, base: 0xefb6c6, weight: 0.34 },
  { name: 'white', hex: 0xf2ecff, base: 0xf2eadb, weight: 0.26 },
  { name: 'cyan', hex: 0x7ef2ff, base: 0xd8dce8, weight: 0.22 },
  { name: 'yellow', hex: 0xffd888, base: 0xf0d7a1, weight: 0.18 },
];

/**
 * Palettes are absolute colours in sRGB; the environment rig interpolates
 * between them every frame, so switching time of day never pops.
 */
export const PALETTES = {
  night: {
    skyTop: 0x040a19,
    skyHorizon: 0x1b3a66,
    skyBottom: 0x142b45,
    fog: 0x142b45,
    fogDensity: 0.0125,
    waterDeep: 0x061726,
    waterShallow: 0x103a54,
    waterReflectivity: 1.05,
    moonColor: 0xd8e7ff,
    moonIntensity: 1.4,
    moonGlow: 0.95,
    starOpacity: 1.0,
    hemiSky: 0x31547f,
    hemiGround: 0x060d16,
    hemiIntensity: 0.72,
    keyColor: 0xbacff0,
    keyIntensity: 1.05,
    bloomStrength: 0.34,
    bloomThreshold: 1.08,
    bloomRadius: 0.46,
    flowerGlow: 1.08,
    lanternIntensity: 3.6,
    lanternGlow: 1.0,
    exposure: 1.0,
  },
  day: {
    skyTop: 0x226096,
    skyHorizon: 0x86b8d8,
    skyBottom: 0x96b9c8,
    fog: 0xa6c5d3,
    fogDensity: 0.0068,
    waterDeep: 0x0c374a,
    waterShallow: 0x2b6f83,
    waterReflectivity: 1.0,
    moonColor: 0xffe2b0,
    moonIntensity: 0.65,
    moonGlow: 1.0,
    starOpacity: 0.0,
    hemiSky: 0xc4dcec,
    hemiGround: 0x3d5a4c,
    hemiIntensity: 0.6,
    keyColor: 0xffefd2,
    keyIntensity: 2.3,
    bloomStrength: 0.08,
    bloomThreshold: 1.3,
    bloomRadius: 0.5,
    flowerGlow: 0.05,
    lanternIntensity: 0.1,
    lanternGlow: 0.05,
    exposure: 1.04,
  },
};

export const MOON_DIRECTION = { x: 0.2, y: 0.14, z: 0.97 };

export const WAKE = {
  maxPoints: 84,
  pointSpacing: 0.34,
  pointLifetime: 5.5,
  rippleSlots: 8,
  rippleLifetime: 2.6,
};

export const STORAGE_KEY = 'lotus-drift:settings:v1';

export const DEFAULT_SETTINGS = Object.freeze({
  timeOfDay: 'night',
  quality: 'auto',
  realism: 'auto',
  boatman: true,
  gentleCamera: true,
  performance: false,
  showFps: false,
  sfx: true,
  music: true,
  sfxVolume: 0.8,
  musicVolume: 0.55,
  joystick: true,
});

export const SETTING_OPTIONS = Object.freeze({
  timeOfDay: ['night', 'day', 'auto'],
  quality: ['high', 'light', 'auto'],
  realism: ['high', 'light', 'auto'],
});
