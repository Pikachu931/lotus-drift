import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';

const UP = new THREE.Vector3(0, 1, 0);

function buildPadGeometry() {
  const positions = [];
  const uvs = [];
  const tints = [];
  const indices = [];
  const segments = 28;
  const gap = 0.16;
  const rings = [0.2, 0.52, 0.78, 1.0];

  const centerIndex = 0;
  positions.push(0, -0.01, 0);
  uvs.push(0.5, 0.5);
  tints.push(0);
  const ringStarts = [];

  for (const r of rings) {
    ringStarts.push(positions.length / 3);
    for (let i = 0; i <= segments; i += 1) {
      const a = gap + (i / segments) * (Math.PI * 2 - gap * 2);
      const wobble = 1 + Math.sin(a * 5.0) * 0.022 * r + Math.sin(a * 11.0) * 0.012 * r;
      const tear = r > 0.9 && (a > 2.0 && a < 2.18) ? 0.88 : 1;
      const y = -0.01 + r * r * 0.058 + Math.sin(a * 3.0) * 0.008 * r * r;
      positions.push(
        Math.cos(a) * r * wobble * tear,
        y,
        Math.sin(a) * r * wobble * tear,
      );
      uvs.push(0.5 + Math.cos(a) * r * 0.5, 0.5 + Math.sin(a) * r * 0.5);
      tints.push(0.22 + r * 0.78);
    }
  }

  for (let i = 0; i < segments; i += 1) {
    indices.push(centerIndex, ringStarts[0] + i, ringStarts[0] + i + 1);
  }
  for (let r = 0; r < rings.length - 1; r += 1) {
    const a0 = ringStarts[r];
    const b0 = ringStarts[r + 1];
    for (let i = 0; i < segments; i += 1) {
      if (r === rings.length - 2 && i === 10) continue;
      indices.push(a0 + i, b0 + i, a0 + i + 1, a0 + i + 1, b0 + i, b0 + i + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(tints, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const padVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aTint;

  uniform float uTime;
  uniform vec2 uBoat;
  uniform vec3 uMoonDir;
  uniform float uReduced;
  uniform vec4 uRipples[8];

  varying vec3 vColor;
  varying float vTint;
  varying float vLight;
  varying float vFogDepth;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vRipple;

  ${WAVE_GLSL}

  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    float motion = mix(1.0, 0.4, uReduced);
    float bob = sin(uTime * 0.85 + aPhase * 6.2831) * 0.012 * motion;

    float ripple = 0.0;
    vec2 rippleGrad = vec2(0.0);
    for (int i = 0; i < 8; i++) {
      vec4 r = uRipples[i];
      if (r.w <= 0.0008) { continue; }
      vec2 delta = wp.xz - r.xy;
      float dist = length(delta) + 0.0001;
      float radius = r.z * 1.65;
      float band = exp(-pow((dist - radius) * 1.8, 2.0));
      float amp = sin((dist - radius) * 3.1) * band * r.w * exp(-r.z * 0.8);
      ripple += amp;
      rippleGrad += (delta / dist) * amp;
    }

    vec2 toBoat = wp.xz - uBoat;
    float boatDist = length(toBoat);
    vec2 toBoatN = toBoat / max(boatDist, 0.0001);
    float near = smoothstep(3.1, 0.25, boatDist);
    wp.xz += toBoatN * near * 0.5;
    wp.y += bob + near * 0.026 + ripple * 0.045 * motion;
    wp.y += waveHeight(wp.xz, uTime) * 0.95;

    float localR = length(position.xz);
    wp.xz += normalize(position.xz + 0.0001) * near * 0.1 * localR;

    mat3 im = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
    vec3 n = normalize(im * normal);
    float tilt = near * 0.35 + ripple * 0.8;
    n = normalize(n + vec3(-toBoatN.x, 0.0, -toBoatN.y) * tilt * 0.35);

    vLight = 0.5 + 0.5 * max(dot(n, normalize(uMoonDir)), 0.0);
    vColor = aColor;
    vTint = aTint;
    vUv = uv;
    vWorld = wp.xyz;
    vNormal = n;
    vRipple = abs(ripple) + near;

    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const padFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uGlowAmount;
  uniform float uNight;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform sampler2D uAtlas;
  uniform sampler2D uAtlasNormal;
  uniform vec2 uLeafCell;

  varying vec3 vColor;
  varying float vTint;
  varying float vLight;
  varying float vFogDepth;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vRipple;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float angle = atan(p.y, p.x);
    vec2 atlasUv = clamp(vUv, 0.02, 0.98) * 0.5 + uLeafCell;
    vec3 veins = texture2D(uAtlas, atlasUv).rgb;
    vec3 bump = texture2D(uAtlasNormal, atlasUv).rgb * 2.0 - 1.0;

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    N = normalize(N + vec3(bump.x, bump.y, 0.0) * 0.12);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uMoonDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = max(dot(N, V), 0.0);
    float rim = pow(1.0 - ndv, 3.0);
    float waxy = pow(max(dot(N, H), 0.0), 52.0);

    vec3 col = vColor * (0.58 + 0.52 * ndl) * (0.76 + vTint * 0.28);
    col += vColor * veins.g * 0.32 + vec3(0.16, 0.24, 0.15) * rim * 0.4;
    col += uMoonColor * waxy * (0.3 + 0.35 * uNight);
    col *= 0.94 + 0.08 * uGlowAmount;

    // Dark age patches, then a few wet glints that catch the moon.
    float agePatch = smoothstep(0.24, 0.0, length(p - vec2(-0.22, 0.13)));
    col = mix(col, col * 0.58 + vec3(0.01, 0.02, 0.015), agePatch * 0.5);

    vec2 dropA = vec2(0.17 + sin(vTint * 21.0) * 0.07, 0.18 + cos(vTint * 15.0) * 0.06);
    vec2 dropB = vec2(-0.2, -0.1 - vTint * 0.08);
    float drop = smoothstep(0.052, 0.018, length(p - dropA))
               + smoothstep(0.036, 0.011, length(p - dropB));
    float glint = drop * pow(max(dot(N, H), 0.0), 18.0) * 2.2;
    col += uMoonColor * glint * (0.5 + 0.7 * uNight);
    col += uMoonColor * smoothstep(0.06, 0.0, abs(r - 0.72)) * 0.04;

    float edge = smoothstep(0.8, 1.0, r);
    col = mix(col, col * vec3(0.65, 0.78, 0.58), edge * 0.45);

    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createPadAssets(shared) {
  const geometry = buildPadGeometry();
  const material = new THREE.ShaderMaterial({
    vertexShader: padVertex,
    fragmentShader: padFragment,
    uniforms: {
      uTime: shared.uTime,
      uBoat: shared.uBoat,
      uMoonDir: shared.uMoonDir,
      uReduced: shared.uReduced,
      uGlowAmount: shared.uGlow,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uNight: shared.uNight,
      uMoonColor: shared.uMoonColor,
      uAtlas: shared.uAtlas,
      uAtlasNormal: shared.uAtlasNormal,
      uLeafCell: shared.uLeafCell,
      uRipples: shared.uRipples,
    },
    side: THREE.DoubleSide,
    fog: false,
  });
  return { geometry, material };
}

export function createPadField(assets, pads) {
  const count = pads.length;
  const geometry = assets.geometry.clone();
  const mesh = new THREE.InstancedMesh(geometry, assets.material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = 'lily-pads';

  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const pad = pads[i];
    quat.setFromAxisAngle(UP, pad.rotation);
    scale.set(pad.scale, 1, pad.scale * (pad.stretch || 1));
    position.set(pad.x, 0, pad.z);
    matrix.compose(position, quat, scale);
    mesh.setMatrixAt(i, matrix);
    colors[i * 3] = pad.color.r;
    colors[i * 3 + 1] = pad.color.g;
    colors[i * 3 + 2] = pad.color.b;
    phases[i] = pad.phase;
  }

  mesh.instanceMatrix.needsUpdate = true;
  geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

  const group = new THREE.Group();
  group.add(mesh);
  return { group, mesh, count };
}
