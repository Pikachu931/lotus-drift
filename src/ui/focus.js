const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab inside `container` and calls onEscape when Escape is pressed.
 * Returns a release function that also restores the previously focused element.
 */
export function trapFocus(container, { onEscape, initial } = {}) {
  const previous = document.activeElement;

  const getFocusable = () =>
    Array.from(container.querySelectorAll(FOCUSABLE)).filter((element) => {
      if (element.hidden || element.disabled) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      return element.getClientRects().length > 0;
    });

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (onEscape) onEscape();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusable();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;

    if (event.shiftKey && (current === first || !container.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !container.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', handleKeyDown, true);

  requestAnimationFrame(() => {
    const target = initial || getFocusable()[0] || container;
    if (target && typeof target.focus === 'function') target.focus();
  });

  return function release() {
    document.removeEventListener('keydown', handleKeyDown, true);
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
      previous.focus();
    }
  };
}
