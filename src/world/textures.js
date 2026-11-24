import * as THREE from 'three';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function rng(seed = 0x5a71) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function texture(canvas, { srgb = false, repeat = 1, clamp = false, mips = true } = {}) {
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  map.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.anisotropy = 4;
  if (!mips) {
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
  }
  map.needsUpdate = true;
  return map;
}

/** Convert a grayscale height canvas into a tangent-space normal map. */
function normalFromHeight(source, strength = 2.4) {
  const width = source.width;
  const height = source.height;
  const sourceCtx = source.getContext('2d');
  const data = sourceCtx.getImageData(0, 0, width, height).data;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(width, height);
  const pixel = (x, y) => {
    const xi = ((x % width) + width) % width;
    const yi = ((y % height) + height) % height;
    const i = (yi * width + xi) * 4;
    return (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (pixel(x + 1, y) - pixel(x - 1, y)) * strength;
      const dy = (pixel(x, y + 1) - pixel(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      out.data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** Soft radial halo used for flower glows, fireflies and the lantern. */
export function makeGlowTexture() {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.34, 'rgba(255,255,255,0.36)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.09)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** The moon: a tight disc with a soft halo, tinted by the sky rig. */
export function makeMoonTexture() {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.16, 'rgba(252,253,255,0.98)');
  g.addColorStop(0.195, 'rgba(240,247,255,0.55)');
  g.addColorStop(0.32, 'rgba(210,232,255,0.13)');
  g.addColorStop(0.6, 'rgba(190,220,255,0.03)');
  g.addColorStop(1, 'rgba(190,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // A few soft maria so the disc is not perfectly flat.
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 8; i += 1) {
    const r = 10 + Math.random() * 22;
    const x = size / 2 + (Math.random() - 0.5) * 70;
    const y = size / 2 + (Math.random() - 0.5) * 70;
    const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
    patch.addColorStop(0, 'rgba(176,198,224,0.28)');
    patch.addColorStop(1, 'rgba(176,198,224,0)');
    ctx.fillStyle = patch;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Faint drifting mist: overlapping soft blobs, tileable enough. */
export function makeMistTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 46; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.05})`);
    g.addColorStop(0.55, 'rgba(255,255,255,0.025)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 2.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Warm vertical wood grain, used by the hull, seats and umbrella pole. */
export function makeWoodTexture() {
  const width = 256;
  const height = 512;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, width, 0);
  base.addColorStop(0, '#4a3120');
  base.addColorStop(0.35, '#6d4a2f');
  base.addColorStop(0.6, '#5a3c26');
  base.addColorStop(1, '#3f2a1b');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * width;
    const alpha = 0.04 + Math.random() * 0.14;
    const light = Math.random() > 0.55;
    ctx.strokeStyle = light
      ? `rgba(196, 152, 106, ${alpha})`
      : `rgba(28, 16, 8, ${alpha + 0.05})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.6;
    ctx.beginPath();
    for (let y = -10; y <= height + 10; y += 18) {
      const xx = x + Math.sin(y * 0.017 + i * 1.7) * 5 + Math.sin(y * 0.004 + i) * 9;
      if (y === -10) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 4; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = 5 + Math.random() * 9;
    for (let ring = r; ring > 0; ring -= 1.6) {
      ctx.strokeStyle = `rgba(30, 18, 9, ${0.05 + (1 - ring / r) * 0.12})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(x, y, ring, ring * 1.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * PBR wood set: albedo, roughness and normal. The grain is a height field so
 * the normal and roughness stay registered with the colour.
 */
export function makeWoodMaps(size = 512) {
  const random = rng(0x77aa11);
  const color = makeCanvas(size, size);
  const rough = makeCanvas(size, size);
  const height = makeCanvas(size, size);
  const c = color.getContext('2d');
  const r = rough.getContext('2d');
  const h = height.getContext('2d');

  const base = c.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, '#513722');
  base.addColorStop(0.32, '#7d5738');
  base.addColorStop(0.66, '#67482e');
  base.addColorStop(1, '#452f1f');
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);
  h.fillStyle = '#808080';
  h.fillRect(0, 0, size, size);
  r.fillStyle = '#b4b4b4';
  r.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i += 1) {
    const x = random() * size;
    const w = 0.5 + random() * 2.8;
    const alpha = 0.045 + random() * 0.16;
    const light = random() > 0.58;
    c.strokeStyle = light
      ? `rgba(206, 164, 116, ${alpha})`
      : `rgba(30, 18, 9, ${alpha + 0.055})`;
    c.lineWidth = w;
    r.strokeStyle = light ? 'rgba(220,220,220,0.15)' : 'rgba(90,90,90,0.22)';
    r.lineWidth = w;
    h.strokeStyle = light ? 'rgba(190,190,190,0.28)' : 'rgba(58,58,58,0.32)';
    h.lineWidth = w;
    c.beginPath();
    r.beginPath();
    h.beginPath();
    for (let y = -16; y <= size + 16; y += 12) {
      const xx =
        x +
        Math.sin(y * 0.014 + i * 1.41) * 6 +
        Math.sin(y * 0.0047 + i * 0.7) * 12;
      if (y === -16) {
        c.moveTo(xx, y);
        r.moveTo(xx, y);
        h.moveTo(xx, y);
      } else {
        c.lineTo(xx, y);
        r.lineTo(xx, y);
        h.lineTo(xx, y);
      }
    }
    c.stroke();
    r.stroke();
    h.stroke();
  }

  // Knots and small dark checks in the grain.
  for (let i = 0; i < 6; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 7 + random() * 17;
    for (let ring = radius; ring > 0; ring -= 2.1) {
      const dark = 0.1 + (1 - ring / radius) * 0.16;
      c.strokeStyle = `rgba(37, 22, 12, ${dark})`;
      c.lineWidth = 1.3;
      c.beginPath();
      c.ellipse(x, y, ring, ring * 1.9, 0, 0, Math.PI * 2);
      c.stroke();
      h.strokeStyle = `rgba(50,50,50,${dark})`;
      h.lineWidth = 1.6;
      h.beginPath();
      h.ellipse(x, y, ring, ring * 1.9, 0, 0, Math.PI * 2);
      h.stroke();
    }
  }

  // Worn, paler patches and darker damp areas.
  for (let i = 0; i < 7; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const rx = 22 + random() * 54;
    const ry = 7 + random() * 20;
    const g = c.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(196, 160, 112, 0.11)');
    g.addColorStop(1, 'rgba(196, 160, 112, 0)');
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();

    const roughG = r.createRadialGradient(x, y, 0, x, y, rx);
    roughG.addColorStop(0, 'rgba(245,245,245,0.55)');
    roughG.addColorStop(1, 'rgba(245,245,245,0)');
    r.save();
    r.translate(x, y);
    r.scale(1, ry / rx);
    r.fillStyle = roughG;
    r.beginPath();
    r.arc(0, 0, rx, 0, Math.PI * 2);
    r.fill();
    r.restore();
  }

  return {
    color: texture(color, { srgb: true }),
    roughness: texture(rough),
    normal: texture(normalFromHeight(height, 2.2)),
  };
}

/** Loose woven cloth with a fine normal map, used for clothes and the mat. */
export function makeClothMaps(size = 256) {
  const random = rng(0x9911);
  const color = makeCanvas(size, size);
  const height = makeCanvas(size, size);
  const c = color.getContext('2d');
  const h = height.getContext('2d');

  c.fillStyle = '#c9c1b4';
  c.fillRect(0, 0, size, size);
  h.fillStyle = '#808080';
  h.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 3) {
    const light = y % 6 === 0;
    c.fillStyle = light ? 'rgba(238,232,220,0.22)' : 'rgba(88,78,66,0.1)';
    c.fillRect(0, y, size, 1.2);
    h.fillStyle = light ? 'rgba(180,180,180,0.35)' : 'rgba(72,72,72,0.35)';
    h.fillRect(0, y, size, 1.2);
  }
  for (let x = 0; x < size; x += 4) {
    c.fillStyle = 'rgba(96,84,70,0.09)';
    c.fillRect(x, 0, 1, size);
    h.fillStyle = 'rgba(68,68,68,0.24)';
    h.fillRect(x, 0, 1, size);
  }
  for (let i = 0; i < 80; i += 1) {
    c.fillStyle = `rgba(255,255,255,${random() * 0.04})`;
    c.fillRect(random() * size, random() * size, 2, 2);
  }

  return {
    color: texture(color, { srgb: true }),
    normal: texture(normalFromHeight(height, 1.35)),
  };
}

/** Warm oiled paper with scattered fibres. */
export function makePaperMaps(size = 256) {
  const random = rng(0x44c2);
  const color = makeCanvas(size, size);
  const height = makeCanvas(size, size);
  const c = color.getContext('2d');
  const h = height.getContext('2d');
  c.fillStyle = '#e3d3b8';
  c.fillRect(0, 0, size, size);
  h.fillStyle = '#888888';
  h.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const len = 3 + random() * 15;
    const a = random() * Math.PI;
    c.strokeStyle = `rgba(116, 92, 58, ${0.025 + random() * 0.05})`;
    c.lineWidth = 0.5 + random();
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
    h.strokeStyle = `rgba(${random() > 0.5 ? 190 : 60},${random() > 0.5 ? 190 : 60},${random() > 0.5 ? 190 : 60},0.2)`;
    h.lineWidth = 0.6;
    h.beginPath();
    h.moveTo(x, y);
    h.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    h.stroke();
  }
  return {
    color: texture(color, { srgb: true }),
    normal: texture(normalFromHeight(height, 0.75)),
  };
}

/** Soft contact shadow used under the hull, with no real shadow map. */
export function makeShadowTexture() {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return texture(canvas, { srgb: true, clamp: true, mips: false });
}

/** Foam for the bow wave and the oar splash. */
export function makeFoamTexture(size = 256) {
  const random = rng(0xf0a3);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 380; i += 1) {
    const a = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.65) * size * 0.44;
    const x = size / 2 + Math.cos(a) * radius;
    const y = size / 2 + Math.sin(a) * radius * 0.72;
    const r = 0.6 + random() * 3.4;
    ctx.fillStyle = `rgba(255,255,255,${0.035 + random() * 0.11})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 8; i += 1) {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, `rgba(255,255,255,${0.03 + random() * 0.03})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(canvas, { srgb: true, clamp: true, mips: false });
}

/**
 * Shared 2×2 detail atlas for petals, leaves, cloth and wood inlays.
 * The shaders use it as a subtle vein / fibre mask and a normal perturbation.
 */
export function makeVeinAtlas(size = 512) {
  const color = makeCanvas(size, size);
  const height = makeCanvas(size, size);
  const c = color.getContext('2d');
  const h = height.getContext('2d');
  const half = size / 2;
  c.fillStyle = '#b8b8b8';
  c.fillRect(0, 0, size, size);
  h.fillStyle = '#808080';
  h.fillRect(0, 0, size, size);

  // Cell (0,0): petal veins — fine longitudinal threads with a few forks.
  c.save();
  c.translate(0, 0);
  for (let i = 0; i < 24; i += 1) {
    const x = (i / 24) * half + (Math.random() - 0.5) * 5;
    c.strokeStyle = `rgba(238,238,238,${0.16 + Math.random() * 0.2})`;
    c.lineWidth = 0.7 + Math.random() * 0.8;
    c.beginPath();
    c.moveTo(x, half * 0.92);
    c.bezierCurveTo(x + 6, half * 0.64, x - 4, half * 0.28, x + (Math.random() - 0.5) * 10, half * 0.04);
    c.stroke();
  }
  c.restore();
  h.save();
  h.translate(0, 0);
  for (let i = 0; i < 24; i += 1) {
    const x = (i / 24) * half + (Math.random() - 0.5) * 5;
    h.strokeStyle = 'rgba(40,40,40,0.45)';
    h.lineWidth = 1.2;
    h.beginPath();
    h.moveTo(x, half * 0.92);
    h.bezierCurveTo(x + 6, half * 0.64, x - 4, half * 0.28, x + (Math.random() - 0.5) * 10, half * 0.04);
    h.stroke();
  }
  h.restore();

  // Cell (1,0): leaf veins — radial ribs from a notch.
  c.save();
  c.translate(half, 0);
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    c.strokeStyle = `rgba(232,240,225,${0.16 + Math.random() * 0.16})`;
    c.lineWidth = 0.8 + Math.random() * 0.9;
    c.beginPath();
    c.moveTo(half * 0.5, half * 0.64);
    c.quadraticCurveTo(
      half * 0.5 + Math.cos(a) * half * 0.27,
      half * 0.5 + Math.sin(a) * half * 0.27,
      half * 0.5 + Math.cos(a) * half * 0.45,
      half * 0.5 + Math.sin(a) * half * 0.45,
    );
    c.stroke();
  }
  c.restore();
  h.save();
  h.translate(half, 0);
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    h.strokeStyle = 'rgba(48,48,48,0.4)';
    h.lineWidth = 1.4;
    h.beginPath();
    h.moveTo(half * 0.5, half * 0.64);
    h.quadraticCurveTo(
      half * 0.5 + Math.cos(a) * half * 0.27,
      half * 0.5 + Math.sin(a) * half * 0.27,
      half * 0.5 + Math.cos(a) * half * 0.45,
      half * 0.5 + Math.sin(a) * half * 0.45,
    );
    h.stroke();
  }
  h.restore();

  // Cell (0,1): cloth weave.
  c.save();
  c.translate(0, half);
  for (let y = 0; y < half; y += 4) {
    c.fillStyle = y % 8 === 0 ? 'rgba(245,245,245,0.16)' : 'rgba(54,54,54,0.13)';
    c.fillRect(0, y, half, 1.4);
    h.fillStyle = y % 8 === 0 ? 'rgba(180,180,180,0.4)' : 'rgba(70,70,70,0.35)';
    h.fillRect(0, y, half, 1.4);
  }
  for (let x = 0; x < half; x += 5) {
    c.fillStyle = 'rgba(54,54,54,0.1)';
    c.fillRect(x, 0, 1, half);
    h.fillStyle = 'rgba(70,70,70,0.28)';
    h.fillRect(x, 0, 1, half);
  }
  c.restore();
  h.restore();

  // Cell (1,1): fine wood grain, useful for small inlays.
  c.save();
  c.translate(half, half);
  for (let i = 0; i < 34; i += 1) {
    const x = (i / 34) * half;
    c.strokeStyle = `rgba(60,40,24,${0.07 + Math.random() * 0.1})`;
    c.lineWidth = 0.7 + Math.random() * 1.2;
    c.beginPath();
    for (let y = 0; y <= half; y += 8) {
      const xx = x + Math.sin(y * 0.02 + i) * 4;
      if (y === 0) c.moveTo(xx, y);
      else c.lineTo(xx, y);
    }
    c.stroke();
  }
  c.restore();
  h.save();
  h.translate(half, half);
  for (let i = 0; i < 34; i += 1) {
    const x = (i / 34) * half;
    h.strokeStyle = 'rgba(90,90,90,0.32)';
    h.lineWidth = 1.2;
    h.beginPath();
    for (let y = 0; y <= half; y += 8) {
      const xx = x + Math.sin(y * 0.02 + i) * 4;
      if (y === 0) h.moveTo(xx, y);
      else h.lineTo(xx, y);
    }
    h.stroke();
  }
  h.restore();

  return {
    color: texture(color, { clamp: true, mips: false }),
    normal: texture(normalFromHeight(height, 1.9), { clamp: true, mips: false }),
    cells: {
      petal: [0.5, 0.0],
      leaf: [0.0, 0.0],
      cloth: [0.0, 0.5],
      wood: [0.5, 0.5],
    },
  };
}

/** A little woven fabric for the umbrella, with faint radial seams. */
export function makeFabricTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c9b7a4';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  for (let i = 0; i < 12; i += 1) {
    ctx.strokeStyle = 'rgba(120, 96, 78, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    const a = (i / 12) * Math.PI * 2;
    ctx.lineTo(size / 2 + Math.cos(a) * size, size / 2 + Math.sin(a) * size);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
