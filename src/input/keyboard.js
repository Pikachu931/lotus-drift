const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

function isFormField(target) {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export class Keyboard {
  constructor() {
    this.keys = new Set();
    this.enabled = true;

    this.handleDown = (event) => {
      if (!this.enabled || isFormField(event.target)) return;
      if (GAME_KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    };
    this.handleUp = (event) => {
      this.keys.delete(event.code);
    };
    this.handleBlur = () => this.clear();

    window.addEventListener('keydown', this.handleDown);
    window.addEventListener('keyup', this.handleUp);
    window.addEventListener('blur', this.handleBlur);
  }

  isDown(...codes) {
    for (const code of codes) {
      if (this.keys.has(code)) return true;
    }
    return false;
  }

  get throttle() {
    let value = 0;
    if (this.isDown('KeyW', 'ArrowUp')) value += 1;
    if (this.isDown('KeyS', 'ArrowDown')) value -= 1;
    return value;
  }

  get steer() {
    let value = 0;
    if (this.isDown('KeyD', 'ArrowRight')) value += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) value -= 1;
    return value;
  }

  clear() {
    this.keys.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this.handleDown);
    window.removeEventListener('keyup', this.handleUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
