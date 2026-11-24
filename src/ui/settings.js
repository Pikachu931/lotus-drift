import { trapFocus } from './focus.js';

export class SettingsPanel {
  constructor(store, { trigger, onOpen, onClose } = {}) {
    this.store = store;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.el = document.getElementById('settings');
    this.scrim = document.getElementById('scrim');
    this.trigger = trigger || document.getElementById('btn-settings');
    this.isOpen = false;
    this.releaseFocus = null;

    this.inputs = Array.from(this.el.querySelectorAll('[data-setting]'));
    this.outputs = new Map();
    for (const output of this.el.querySelectorAll('output[data-value-for]')) {
      this.outputs.set(output.dataset.valueFor, output);
    }

    this.bind();
    this.sync();
    this.unsubscribe = store.subscribe(() => this.sync());
  }

  bind() {
    for (const input of this.inputs) {
      const key = input.dataset.setting;
      if (input.type === 'radio') {
        input.addEventListener('change', () => {
          if (input.checked) this.store.set(key, input.value);
        });
      } else if (input.type === 'checkbox') {
        input.addEventListener('change', () => {
          this.store.set(key, input.checked);
        });
      } else if (input.type === 'range') {
        input.addEventListener('input', () => {
          this.store.set(key, Number(input.value) / 100);
        });
      }
    }

    const closeButton = document.getElementById('btn-settings-close');
    const doneButton = document.getElementById('btn-done');
    const resetButton = document.getElementById('btn-reset');

    this.handleClose = () => this.close();
    closeButton.addEventListener('click', this.handleClose);
    doneButton.addEventListener('click', this.handleClose);
    this.scrim.addEventListener('click', this.handleClose);
    this.trigger.addEventListener('click', () => {
      if (this.isOpen) this.close();
      else this.open();
    });

    this.handleReset = () => this.store.reset();
    resetButton.addEventListener('click', this.handleReset);
  }

  sync() {
    for (const input of this.inputs) {
      const key = input.dataset.setting;
      const value = this.store.get(key);
      if (input.type === 'radio') {
        input.checked = input.value === value;
      } else if (input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else if (input.type === 'range') {
        const percent = Math.round(Number(value) * 100);
        if (input.value !== String(percent)) input.value = String(percent);
      }
    }
    for (const [key, output] of this.outputs) {
      output.textContent = `${Math.round(Number(this.store.get(key)) * 100)}%`;
    }
  }

  open() {
    if (this.isOpen) return;
    this.sync();
    this.el.hidden = false;
    this.scrim.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.isOpen = true;

    const initial =
      this.el.querySelector('.seg input:checked') || this.el.querySelector('button');
    this.releaseFocus = trapFocus(this.el, {
      onEscape: () => this.close(),
      initial,
    });
    if (this.onOpen) this.onOpen();
  }

  close() {
    if (!this.isOpen) return;
    if (this.releaseFocus) this.releaseFocus();
    this.releaseFocus = null;
    this.el.hidden = true;
    this.scrim.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.isOpen = false;
    if (this.onClose) this.onClose();
  }

  dispose() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.releaseFocus) this.releaseFocus();
  }
}
