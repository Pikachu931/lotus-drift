import { trapFocus } from './focus.js';

export class Manifesto {
  constructor({ trigger, onOpen, onClose } = {}) {
    this.el = document.getElementById('manifesto');
    this.trigger = trigger || document.getElementById('btn-manifesto');
    this.closeButton = document.getElementById('btn-manifesto-close');
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.isOpen = false;
    this.releaseFocus = null;

    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (event) => {
      if (event.target === this.el) this.close();
    });
  }

  open() {
    if (this.isOpen) return;
    this.el.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.isOpen = true;
    this.releaseFocus = trapFocus(this.el, {
      onEscape: () => this.close(),
      initial: this.closeButton,
    });
    if (this.onOpen) this.onOpen();
  }

  close() {
    if (!this.isOpen) return;
    if (this.releaseFocus) this.releaseFocus();
    this.releaseFocus = null;
    this.el.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.isOpen = false;
    if (this.onClose) this.onClose();
  }

  dispose() {
    if (this.releaseFocus) this.releaseFocus();
  }
}
