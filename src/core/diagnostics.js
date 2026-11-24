/**
 * A short, copyable snapshot of what the renderer is actually doing. Useful
 * when a device stutters: the report carries the GPU, the real canvas size and
 * the current quality tier, none of which are visible from the scene itself.
 */
function describeGpu(renderer) {
  try {
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    if (extension) {
      return String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || 'unknown');
    }
    return String(gl.getParameter(gl.RENDERER) || 'unknown');
  } catch {
    return 'unavailable';
  }
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

export function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

export function buildReport({ renderer, quality, settings }) {
  const info = renderer.info;
  const canvas = renderer.domElement;
  const profile = quality.profile || {};
  const state = settings.getState();
  const fps = quality.getFps();
  const pixelRatio = quality.pixelRatio;
  const scale = quality.getRenderScale();
  const frameMs = 1000 / Math.max(fps, 1);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const programs = info.programs ? info.programs.length : '—';

  return [
    'Lotus Drift — performance report',
    new Date().toISOString(),
    '',
    `Viewport: ${window.innerWidth}×${window.innerHeight} CSS · canvas ${canvas.width}×${canvas.height} device px`,
    `Pixel ratio: ${pixelRatio.toFixed(2)}× (device ${(window.devicePixelRatio || 1).toFixed(2)} · automatic scale ${scale.toFixed(2)}×)`,
    `Quality: ${profile.name || '—'} (mode ${quality.qualityMode}) · realism ${state.realism} · performance mode ${state.performance ? 'on' : 'off'}`,
    `Frame: ${frameMs.toFixed(1)} ms · ${fps.toFixed(1)} fps (last 2 s window ${quality.avgFps.toFixed(1)})`,
    `GPU: ${describeGpu(renderer)}`,
    `Draw calls: ${info.render.calls} · triangles: ${info.render.triangles.toLocaleString('en-US')}`,
    `Geometries: ${info.memory.geometries} · textures: ${info.memory.textures} · programs: ${programs}`,
    `WebGL ${renderer.capabilities.isWebGL2 ? 2 : 1} · max texture ${renderer.capabilities.maxTextureSize} · touch ${quality.coarse ? 'yes' : 'no'}`,
    `Reduced motion: ${reduced ? 'yes' : 'no'} · hardware threads: ${navigator.hardwareConcurrency || '—'}`,
    `Browser: ${navigator.userAgent}`,
  ].join('\n');
}
