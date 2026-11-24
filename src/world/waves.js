/**
 * One wave model, two languages: the boat samples it on the CPU and the water
 * shader evaluates exactly the same sines on the GPU. Keeping the numbers in
 * one place means the hull always sits on the surface you can see.
 */
export const WAVE_LAYERS = [
  { amp: 0.082, kx: 0.205, kz: 0.071, speed: 0.55, phase: 0.0 },
  { amp: 0.058, kx: -0.084, kz: 0.268, speed: 0.42, phase: 1.3 },
  { amp: 0.038, kx: 0.167, kz: 0.191, speed: -0.33, phase: 2.1 },
  { amp: 0.019, kx: 0.492, kz: -0.361, speed: 0.78, phase: 4.0 },
];

export function waveHeight(x, z, t) {
  let h = 0;
  for (let i = 0; i < WAVE_LAYERS.length; i += 1) {
    const w = WAVE_LAYERS[i];
    h += w.amp * Math.sin(w.kx * x + w.kz * z + w.speed * t + w.phase);
  }
  return h;
}

export function waveSlope(x, z, t) {
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < WAVE_LAYERS.length; i += 1) {
    const w = WAVE_LAYERS[i];
    const c = Math.cos(w.kx * x + w.kz * z + w.speed * t + w.phase);
    sx += w.amp * w.kx * c;
    sz += w.amp * w.kz * c;
  }
  return { x: sx, z: sz };
}

const f = (n) => n.toFixed(5);

export const WAVE_GLSL = /* glsl */ `
float waveHeight(vec2 p, float t) {
  float h = 0.0;
${WAVE_LAYERS.map(
  (w) =>
    `  h += ${f(w.amp)} * sin(${f(w.kx)} * p.x + ${f(w.kz)} * p.y + ${f(w.speed)} * t + ${f(
      w.phase,
    )});`,
).join('\n')}
  return h;
}

vec2 waveSlope(vec2 p, float t) {
  vec2 s = vec2(0.0);
${WAVE_LAYERS.map(
  (w) =>
    `  s += vec2(${f(w.amp * w.kx)}, ${f(w.amp * w.kz)}) * cos(${f(w.kx)} * p.x + ${f(
      w.kz,
    )} * p.y + ${f(w.speed)} * t + ${f(w.phase)});`,
).join('\n')}
  return s;
}
`;
