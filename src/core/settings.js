import { DEFAULT_SETTINGS, SETTING_OPTIONS, STORAGE_KEY } from './config.js';

const BOOLEAN_KEYS = new Set([
  'gentleCamera',
  'boatman',
  'performance',
  'showFps',
  'sfx',
  'music',
  'joystick',
]);

const VOLUME_KEYS = new Set(['sfxVolume', 'musicVolume']);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function coerce(key, value) {
  if (BOOLEAN_KEYS.has(key)) return Boolean(value);
  if (VOLUME_KEYS.has(key)) return clamp01(value);
  if (SETTING_OPTIONS[key]) {
    return SETTING_OPTIONS[key].includes(value) ? value : DEFAULT_SETTINGS[key];
  }
  return undefined;
}

/**
 * A tiny observable store. Settings are validated, clamped and written to
 * localStorage; private-mode / blocked storage is handled silently.
 */
export class SettingsStore {
  constructor() {
    this.state = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.storageAvailable = true;
    this.load();
  }

  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!(key in parsed)) continue;
        const safe = coerce(key, parsed[key]);
        if (safe !== undefined) this.state[key] = safe;
      }
    } catch {
      this.storageAvailable = false;
    }
  }

  save() {
    if (!this.storageAvailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      this.storageAvailable = false;
    }
  }

  get(key) {
    return this.state[key];
  }

  getState() {
    return this.state;
  }

  set(key, value, { silent = false } = {}) {
    const safe = coerce(key, value);
    if (safe === undefined || this.state[key] === safe) return false;
    this.state[key] = safe;
    this.save();
    if (!silent) this.emit(key);
    return true;
  }

  patch(partial) {
    let changed = false;
    for (const key of Object.keys(partial)) {
      if (this.set(key, partial[key], { silent: true })) changed = true;
    }
    if (changed) this.emit(null);
    return changed;
  }

  reset() {
    this.state = { ...DEFAULT_SETTINGS };
    this.save();
    this.emit(null);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(key) {
    for (const listener of this.listeners) {
      try {
        listener(key, this.state);
      } catch (error) {
        console.error('Setting listener failed', error);
      }
    }
  }
}
