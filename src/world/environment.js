import * as THREE from 'three';
import { MOON_DIRECTION, PALETTES } from '../core/config.js';
import { clamp, damp, smoothstep } from '../core/math.js';

const COLOR_KEYS = [
  'skyTop',
  'skyHorizon',
  'skyBottom',
  'fog',
  'waterDeep',
  'waterShallow',
  'moonColor',
  'hemiSky',
  'hemiGround',
  'keyColor',
];

const NUMBER_KEYS = [
  'fogDensity',
  'waterReflectivity',
  'moonIntensity',
  'moonGlow',
  'starOpacity',
  'hemiIntensity',
  'keyIntensity',
  'bloomStrength',
  'bloomThreshold',
  'bloomRadius',
  'flowerGlow',
  'lanternIntensity',
  'lanternGlow',
  'exposure',
];

function prepare(palette) {
  const prepared = {};
  for (const key of COLOR_KEYS) prepared[key] = new THREE.Color(palette[key]);
  for (const key of NUMBER_KEYS) prepared[key] = palette[key];
  return prepared;
}

/**
 * Holds the live environment values. Everything downstream reads from
 * `rig.env` each frame; colours are preallocated so no garbage is produced.
 */
export class EnvironmentRig {
  constructor() {
    this.dayness = 0;
    this.night = prepare(PALETTES.night);
    this.day = prepare(PALETTES.day);

    this.env = {};
    for (const key of COLOR_KEYS) this.env[key] = new THREE.Color();
    for (const key of NUMBER_KEYS) this.env[key] = 0;
    this.env.moonDir = new THREE.Vector3(
      MOON_DIRECTION.x,
      MOON_DIRECTION.y,
      MOON_DIRECTION.z,
    ).normalize();
    this.env.dayness = 0;

    this.copy(0);
  }

  copy(t) {
    for (const key of COLOR_KEYS) {
      this.env[key].lerpColors(this.night[key], this.day[key], t);
    }
    for (const key of NUMBER_KEYS) {
      const a = this.night[key];
      const b = this.day[key];
      this.env[key] = a + (b - a) * t;
    }
    this.env.dayness = t;
    return this.env;
  }

  update(dt, elapsed, mode) {
    let target = 0;
    if (mode === 'day') target = 1;
    else if (mode === 'auto') {
      target = 0.5 - 0.5 * Math.cos((elapsed / 240) * Math.PI * 2);
    }
    const rate = mode === 'auto' ? 0.9 : 1.6;
    this.dayness = clamp(damp(this.dayness, target, rate, dt), 0, 1);
    return this.copy(smoothstep(0, 1, this.dayness));
  }
}
