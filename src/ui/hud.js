import { formatDistance, formatTime } from '../core/math.js';

export class Hud {
  constructor(store) {
    this.store = store;
    this.distanceEl = document.getElementById('hud-distance');
    this.timeEl = document.getElementById('hud-time');
    this.fpsEl = document.getElementById('hud-fps');
    this.fpsWrap = document.getElementById('hud-fps-wrap');
    this.hint = document.getElementById('hint');

    this.lastDistanceText = '';
    this.lastTimeText = '';
    this.lastFpsText = '';
    this.displayTimer = 0;
    this.fpsTimer = 0;
    this.hintTimer = 0;

    this.fpsVisible = store.get('showFps');
    this.applyFpsVisibility();
  }

  applyFpsVisibility() {
    this.fpsVisible = this.store.get('showFps');
    this.fpsWrap.hidden = !this.fpsVisible;
  }

  setFpsVisible() {
    this.applyFpsVisibility();
  }

  update(dt, stats) {
    this.displayTimer += dt;
    this.fpsTimer += dt;

    if (this.displayTimer >= 0.12) {
      const distanceText = formatDistance(stats.distance);
      if (distanceText !== this.lastDistanceText) {
        this.distanceEl.textContent = distanceText;
        this.lastDistanceText = distanceText;
      }
      const timeText = formatTime(stats.elapsed);
      if (timeText !== this.lastTimeText) {
        this.timeEl.textContent = timeText;
        this.lastTimeText = timeText;
      }
      this.displayTimer = 0;
    }

    if (this.fpsVisible && this.fpsTimer >= 0.45) {
      const fpsText = String(Math.round(stats.fps));
      if (fpsText !== this.lastFpsText) {
        this.fpsEl.textContent = fpsText;
        this.lastFpsText = fpsText;
      }
      this.fpsTimer = 0;
    }

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hideHint();
    }
  }

  showHint(seconds = 11) {
    this.hint.classList.remove('is-hidden');
    this.hintTimer = seconds;
  }

  hideHint() {
    this.hint.classList.add('is-hidden');
    this.hintTimer = 0;
  }
}
