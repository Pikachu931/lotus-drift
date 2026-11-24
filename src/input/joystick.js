export class Joystick {
  constructor(root, knob) {
    this.root = root;
    this.base = root.querySelector('.joystick__base');
    this.knob = knob;
    this.visible = false;
    this.active = false;
    this.pointerId = null;
    this.value = { x: 0, y: 0 };

    this.handleDown = this.handleDown.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleUp = this.handleUp.bind(this);

    root.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleUp);
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) this.reset();
  }

  handleDown(event) {
    if (!this.visible) return;
    event.preventDefault();
    this.active = true;
    this.pointerId = event.pointerId;
    if (this.root.setPointerCapture) {
      try {
        this.root.setPointerCapture(event.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
    }
    this.compute(event);
  }

  handleMove(event) {
    if (!this.active || event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.compute(event);
  }

  handleUp(event) {
    if (event.pointerId !== this.pointerId) return;
    this.reset();
  }

  compute(event) {
    const rect = this.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const limit = rect.width * 0.32;

    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > limit && distance > 0) {
      dx = (dx / distance) * limit;
      dy = (dy / distance) * limit;
    }

    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.value.x = dx / limit;
    this.value.y = -dy / limit;
  }

  reset() {
    this.active = false;
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  dispose() {
    this.root.removeEventListener('pointerdown', this.handleDown);
    window.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
    window.removeEventListener('pointercancel', this.handleUp);
  }
}
