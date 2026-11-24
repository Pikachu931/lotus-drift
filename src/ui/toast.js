let hideTimer = 0;

export function showToast(message, duration = 3200) {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    element.hidden = true;
  }, duration);
}
