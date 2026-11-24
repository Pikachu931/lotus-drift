import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function addPetal(positions, uvs, tints, parts, indices, options, lengthSegments, widthSegments) {
  const {
    angle,
    tilt,
    baseY,
    radius,
    length,
    width,
    shade,
    tipCurl = 0.08,
  } = options;
  const start = positions.length / 3;
  const L = lengthSegments;
  const W = widthSegments;
  for (let i = 0; i <= L; i += 1) {
    const u = i / L;
    const taper = Math.sin(Math.PI * Math.pow(u, 0.72));
    const halfWidth = taper * width;
    for (let j = 0; j <= W; j += 1) {
      const v = j / W;
      const across = (v - 0.5) * 2;
      const localX = across * halfWidth;
      const localY = u * length;
      const cup =
        -Math.pow(Math.abs(across), 1.6) * width * 0.44 - u * u * length * 0.1;
      const leanedX = localX * Math.cos(tilt) + localY * Math.sin(tilt);
      const leanedY = -localX * Math.sin(tilt) + localY * Math.cos(tilt);
      const curl = Math.pow(u, 2.2) * tipCurl;
      const radial = radius + curl;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      positions.push(
        radial * cosA + leanedX * cosA - cup * sinA,
        baseY + leanedY + Math.pow(u, 2.3) * 0.025,
        radial * sinA + leanedX * sinA + cup * cosA,
      );
      uvs.push(u, v);
      tints.push(
        Math.min(
          1.18,
          shade * (0.38 + 0.72 * u) + Math.abs(across) * 0.035 + (v - 0.5) * 0.02,
        ),
      );
      parts.push(0);
    }
  }
  for (let i = 0; i < L; i += 1) {
    for (let j = 0; j < W; j += 1) {
      const a = start + i * (W + 1) + j;
      const b = a + 1;
      const c = a + (W + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
}

function addPod(positions, uvs, tints, parts, indices, segments = 12) {
  const bottom = 0.105;
  const top = 0.215;
  const radiusBottom = 0.058;
  const radiusTop = 0.077;
  const start = positions.length / 3;
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * TAU;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    positions.push(cos * radiusBottom, bottom, sin * radiusBottom);
    uvs.push(i / segments, 0);
    tints.push(0.52);
    parts.push(2);
  }
  const middle = positions.length / 3;
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * TAU;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    positions.push(cos * radiusTop, top, sin * radiusTop);
    uvs.push(i / segments, 1);
    tints.push(0.7);
    parts.push(2);
  }
  const center = positions.length / 3;
  positions.push(0, top + 0.001, 0);
  uvs.push(0.5, 0.5);
  tints.push(0.82);
  parts.push(2);
  for (let i = 0; i < segments; i += 1) {
    const a = start + i;
    const b = start + i + 1;
    const c = middle + i;
    const d = middle + i + 1;
    indices.push(a, c, b, b, c, d);
    indices.push(center, middle + i, middle + i + 1);
  }
}

function addStamens(positions, uvs, tints, parts, indices, count = 12) {
  for (let s = 0; s < count; s += 1) {
    const angle = (s / count) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const baseRadius = 0.052;
    const tipRadius = 0.092;
    const baseY = 0.19;
    const tipY = 0.275;
    const width = 0.006;
    const side = 0.006;
    const start = positions.length / 3;
    for (let i = 0; i <= 2; i += 1) {
      const t = i / 2;
      const r = baseRadius + (tipRadius - baseRadius) * t;
      const y = baseY + (tipY - baseY) * t + Math.sin(t * Math.PI) * 0.008;
      const tangentX = -sin;
      const tangentZ = cos;
      positions.push(
        cos * r + tangentX * width,
        y,
        sin * r + tangentZ * width,
        cos * r - tangentX * width,
        y,
        sin * r - tangentZ * width,
      );
      uvs.push(0, t, 1, t);
      tints.push(0.78 + t * 0.22, 0.78 + t * 0.22);
      parts.push(3, 3);
    }
    for (let i = 0; i < 2; i += 1) {
      const a = start + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    // Anther tip.
    const tipStart = positions.length / 3;
    const tx = cos * tipRadius;
    const tz = sin * tipRadius;
    positions.push(
      tx - sin * side,
      tipY,
      tz + cos * side,
      tx + sin * side,
      tipY,
      tz - cos * side,
      tx,
      tipY + 0.026,
      tz,
    );
    uvs.push(0, 1, 1, 1, 0.5, 1);
    tints.push(1.1, 1.1, 1.18);
    parts.push(3, 3, 3);
    indices.push(tipStart, tipStart + 2, tipStart + 1);
  }
}

function addStem(positions, uvs, tints, parts, indices, segments = 4) {
  const levels = [
    { y: -0.34, x: 0.0, z: 0.0, r: 0.014 },
    { y: -0.12, x: 0.012, z: 0.008, r: 0.013 },
    { y: 0.035, x: 0.02, z: 0.014, r: 0.012 },
    { y: 0.115, x: 0.012, z: 0.006, r: 0.016 },
  ];
  const start = positions.length / 3;
  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i];
    for (let j = 0; j <= segments; j += 1) {
      const a = (j / segments) * TAU;
      positions.push(
        level.x + Math.cos(a) * level.r,
        level.y,
        level.z + Math.sin(a) * level.r,
      );
      uvs.push(j / segments, i / (levels.length - 1));
      tints.push(0.3 + i * 0.14);
      parts.push(1);
    }
  }
  for (let i = 0; i < levels.length - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = start + i * (segments + 1) + j;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
}

function addCore(positions, uvs, tints, parts, indices, segments = 8) {
  const center = positions.length / 3;
  positions.push(0, 0.228, 0);
  uvs.push(0.5, 0.5);
  tints.push(1.2);
  parts.push(4);
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * TAU;
    positions.push(Math.cos(a) * 0.026, 0.229, Math.sin(a) * 0.026);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    tints.push(1.1);
    parts.push(4);
  }
  for (let i = 0; i < segments; i += 1) {
    indices.push(center, center + 1 + i, center + 2 + i);
  }
}

function buildLotusGeometry(quality) {
  const positions = [];
  const uvs = [];
  const tints = [];
  const parts = [];
  const indices = [];
  const high = quality === 'high';
  const low = quality === 'low';
  const L = high ? 3 : low ? 1 : 2;
  const W = low ? 1 : 2;

  const rings = high
    ? [
        { count: 16, tilt: 1.12, baseY: 0.11, radius: 0.02, length: 0.36, width: 0.085, shade: 0.42, offset: 0 },
        { count: 14, tilt: 0.85, baseY: 0.145, radius: 0.015, length: 0.31, width: 0.073, shade: 0.7, offset: 0.41 },
        { count: 12, tilt: 0.54, baseY: 0.18, radius: 0.009, length: 0.245, width: 0.058, shade: 1.0, offset: 0.19 },
      ]
    : low
      ? [
          { count: 12, tilt: 0.9, baseY: 0.12, radius: 0.02, length: 0.33, width: 0.08, shade: 0.72, offset: 0 },
        ]
      : [
          { count: 12, tilt: 1.05, baseY: 0.11, radius: 0.02, length: 0.35, width: 0.083, shade: 0.48, offset: 0 },
          { count: 10, tilt: 0.72, baseY: 0.155, radius: 0.012, length: 0.27, width: 0.064, shade: 0.9, offset: 0.36 },
        ];

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i += 1) {
      addPetal(
        positions,
        uvs,
        tints,
        parts,
        indices,
        {
          angle: ring.offset + (i / ring.count) * TAU,
          tilt: ring.tilt,
          baseY: ring.baseY,
          radius: ring.radius,
          length: ring.length,
          width: ring.width,
          shade: ring.shade,
          tipCurl: high ? 0.075 : 0.06,
        },
        L,
        W,
      );
    }
  }

  if (!low) {
    addStem(positions, uvs, tints, parts, indices, high ? 4 : 3);
    addPod(positions, uvs, tints, parts, indices, high ? 12 : 8);
    addStamens(positions, uvs, tints, parts, indices, high ? 12 : 6);
    addCore(positions, uvs, tints, parts, indices, high ? 8 : 6);
  } else {
    addPod(positions, uvs, tints, parts, indices, 6);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(tints, 1));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const lotusVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 aBase;
  attribute float aPhase;
  attribute float aGlow;
  attribute float aStage;
  attribute float aOpen;
  attribute float aTint;
  attribute float aPart;

  uniform float uTime;
  uniform vec2 uBoat;
  uniform vec3 uMoonDir;
  uniform float uReduced;

  varying vec3 vColor;
  varying vec3 vBase;
  varying float vTint;
  varying float vPart;
  varying float vStage;
  varying float vGlow;
  varying float vLight;
  varying float vFogDepth;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;

  ${WAVE_GLSL}

  void main() {
    float openness = aStage < 0.5 ? 0.16 : aStage < 1.5 ? 0.58 : aStage < 2.5 ? 1.0 : 0.06;
    openness *= aOpen;
    vec3 local = position;
    if (aPart < 0.5) {
      local.xz *= mix(0.28, 1.0, openness);
      local.y *= mix(1.16, 1.0, openness);
    }

    vec4 wp = modelMatrix * instanceMatrix * vec4(local, 1.0);
    float hf = smoothstep(-0.12, 0.42, position.y);
    float motion = mix(1.0, 0.4, uReduced);

    float sway = sin(uTime * 0.62 + aPhase * 6.2831) * 0.045
               + sin(uTime * 1.37 + aPhase * 2.7) * 0.012;
    wp.xz += vec2(sway, sway * 0.72) * hf * motion;
    wp.y += sin(uTime * 1.05 + aPhase * 6.2831) * 0.006 * hf * motion;

    vec2 toBoat = wp.xz - uBoat;
    float dist = length(toBoat);
    float near = smoothstep(3.2, 0.25, dist);
    wp.xz += normalize(toBoat + 0.0001) * near * 0.3 * hf;
    wp.y += near * 0.045 * hf;

    wp.y += waveHeight(wp.xz, uTime) * 0.94;

    mat3 im = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
    vec3 n = normalize(im * normal);
    vLight = 0.4 + 0.6 * max(dot(n, normalize(uMoonDir)), 0.0);

    vColor = aColor;
    vBase = aBase;
    vTint = aTint;
    vPart = aPart;
    vStage = aStage;
    vGlow = aGlow;
    vUv = uv;
    vWorld = wp.xyz;
    vNormal = n;
    vLocal = position;

    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const lotusFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uGlowAmount;
  uniform float uNight;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform sampler2D uAtlas;
  uniform sampler2D uAtlasNormal;
  uniform vec2 uPetalCell;

  varying vec3 vColor;
  varying vec3 vBase;
  varying float vTint;
  varying float vPart;
  varying float vStage;
  varying float vGlow;
  varying float vLight;
  varying float vFogDepth;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;

  void main() {
    if (vPart < 0.5 && vStage > 2.5) discard;
    if (vStage < 0.75 && vPart > 1.5) discard;
    if (vStage > 2.5 && vPart > 2.5) discard;

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uMoonDir);
    vec3 col = vec3(0.0);

    if (vPart < 0.5) {
      vec2 atlasUv = clamp(vUv, 0.015, 0.985) * 0.5 + uPetalCell;
      vec3 veins = texture2D(uAtlas, atlasUv).rgb;
      vec3 bump = texture2D(uAtlasNormal, atlasUv).rgb * 2.0 - 1.0;
      vec3 Nv = normalize(N + vec3(bump.x, bump.y, 0.0) * 0.12);

      float ndl = max(dot(Nv, L), 0.0);
      float back = pow(max(dot(-V, L), 0.0), 2.6);
      float rim = pow(1.0 - max(dot(Nv, V), 0.0), 3.2);
      float waxy = pow(max(dot(Nv, normalize(L + V)), 0.0), 58.0);

      vec3 base = mix(vBase, mix(vBase, vColor, 0.7), uNight);
      float tip = smoothstep(0.12, 1.0, vUv.y);
      base *= mix(0.66, 1.02, tip);
      base *= 0.9 + veins.g * 0.17;

      vec3 dayLit = base * (0.44 + 0.58 * ndl);
      vec3 nightLit = base * (0.3 + 0.43 * ndl)
                    + vColor * back * 0.24 * uGlowAmount
                    + vColor * tip * 0.12 * uGlowAmount;
      col = mix(dayLit, nightLit, uNight);
      col += vColor * rim * (0.07 + 0.2 * uNight) * uGlowAmount;
      col += vColor * vGlow * smoothstep(0.78, 1.0, vUv.y) * uGlowAmount * 0.3;
      col += uMoonColor * waxy * (0.16 + 0.22 * uNight);
      col = min(col, vec3(0.96));
    } else if (vPart < 1.5) {
      col = vec3(0.14, 0.23, 0.12) * (0.7 + 0.6 * vLight);
    } else if (vPart < 2.5) {
      vec3 green = vec3(0.28, 0.4, 0.19);
      float mature = smoothstep(0.25, 0.9, vTint);
      col = green * (0.58 + 0.4 * vLight) * (0.7 + mature * 0.45);
      if (vStage > 2.5) col = mix(col, vec3(0.28, 0.2, 0.11), 0.82);
      vec2 q = vLocal.xz;
      float seedMask = 0.0;
      if (vLocal.y > 0.2) {
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 c = vec2(cos(a), sin(a)) * 0.048;
          seedMask = max(seedMask, smoothstep(0.014, 0.0, length(q - c)));
        }
        col = mix(col, col * 0.2, seedMask);
      }
    } else if (vPart < 3.5) {
      col = vec3(0.95, 0.7, 0.19) * (0.62 + 0.5 * vLight);
      col += vec3(1.0, 0.82, 0.3) * smoothstep(0.6, 1.0, vUv.y) * (0.2 + uNight * 0.25);
    } else {
      col = mix(vec3(1.0, 0.94, 0.74), vColor, 0.32);
      col *= 0.72 + uNight * vGlow * 1.6;
    }

    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const lotusCheapFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uGlowAmount;
  uniform float uNight;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;

  varying vec3 vColor;
  varying vec3 vBase;
  varying float vTint;
  varying float vPart;
  varying float vStage;
  varying float vGlow;
  varying float vLight;
  varying float vFogDepth;
  varying vec2 vUv;

  void main() {
    if (vPart < 0.5 && vStage > 2.5) discard;
    if (vStage < 0.75 && vPart > 1.5) discard;
    if (vStage > 2.5 && vPart > 2.5) discard;

    vec3 col;
    if (vPart < 0.5) {
      vec3 base = mix(vBase, mix(vBase, vColor, 0.62), uNight);
      float tip = smoothstep(0.2, 1.0, vUv.y);
      col = base * (0.4 + 0.52 * vLight) * mix(0.78, 1.0, tip);
      col += vColor * tip * (0.09 + 0.24 * uNight) * uGlowAmount;
      col = min(col, vec3(0.98));
    } else if (vPart < 1.5) {
      col = vec3(0.14, 0.23, 0.12) * (0.7 + 0.5 * vLight);
    } else if (vPart < 2.5) {
      col = vec3(0.3, 0.38, 0.19) * (0.7 + 0.4 * vLight);
      if (vStage > 2.5) col = vec3(0.28, 0.2, 0.11);
    } else if (vPart < 3.5) {
      col = vec3(0.9, 0.66, 0.18) * (0.65 + 0.4 * vLight);
    } else {
      col = mix(vec3(1.0, 0.94, 0.7), vColor, 0.3) * (0.7 + uNight * 0.8);
    }

    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const haloVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aGlow;
  attribute float aStage;

  uniform float uTime;
  uniform float uGlowAmount;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  ${WAVE_GLSL}

  void main() {
    vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    center.y += waveHeight(center.xz, uTime) * 0.94 + 0.25;

    float stageScale = aStage < 0.5 ? 0.58 : aStage < 1.5 ? 0.82 : aStage < 2.5 ? 1.0 : 0.6;
    float pulse = 1.0 + 0.13 * sin(uTime * 1.05 + aPhase * 6.2831);
    float size = aGlow * stageScale * 0.95 * pulse;

    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = center + (right * position.x + up * position.y) * size;

    vUv = uv;
    vColor = aColor;
    float camDist = length((viewMatrix * vec4(center, 1.0)).xyz);
    vAlpha = uGlowAmount * stageScale * (0.55 + 0.45 * pulse) * smoothstep(1.5, 8.0, camDist);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const haloFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(smoothstep(1.0, 0.0, d), 2.4);
    vec3 col = vColor * (1.05 + 0.5 * a);
    gl_FragColor = vec4(col, a * vAlpha * 0.16);
  }
`;

export function createLotusAssets(shared) {
  const high = buildLotusGeometry('high');
  const mid = buildLotusGeometry('mid');
  const low = buildLotusGeometry('low');

  const uniforms = {
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
    uPetalCell: shared.uPetalCell,
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: lotusVertex,
    fragmentShader: lotusFragment,
    uniforms,
    side: THREE.DoubleSide,
    fog: false,
  });

  const cheapMaterial = new THREE.ShaderMaterial({
    vertexShader: lotusVertex,
    fragmentShader: lotusCheapFragment,
    uniforms,
    side: THREE.DoubleSide,
    fog: false,
  });

  const glowMaterial = new THREE.ShaderMaterial({
    vertexShader: haloVertex,
    fragmentShader: haloFragment,
    uniforms: {
      uTime: shared.uTime,
      uGlowAmount: shared.uGlow,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  return {
    geometries: { high, mid, low },
    material,
    cheapMaterial,
    glowMaterial,
    glowGeometry: new THREE.PlaneGeometry(1, 1),
    uniforms,
  };
}

function applyInstanceAttributes(geometry, data) {
  geometry.setAttribute('aColor', data.colors);
  geometry.setAttribute('aBase', data.bases);
  geometry.setAttribute('aPhase', data.phases);
  geometry.setAttribute('aGlow', data.glows);
  geometry.setAttribute('aStage', data.stages);
  geometry.setAttribute('aOpen', data.opens);
}

/**
 * One chunk's lotus field. All three LODs share the same instances; only the
 * active one is rendered, so the draw-call cost stays flat.
 */
export function createLotusField(assets, flowers) {
  const count = flowers.length;
  const group = new THREE.Group();

  const colors = new Float32Array(count * 3);
  const bases = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const glows = new Float32Array(count);
  const stages = new Float32Array(count);
  const opens = new Float32Array(count);
  const glowColors = new Float32Array(count * 3);
  const glowPhases = new Float32Array(count);
  const glowStages = new Float32Array(count);

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const matrices = [];

  for (let i = 0; i < count; i += 1) {
    const f = flowers[i];
    quat.setFromAxisAngle(UP, f.rotation);
    scale.setScalar(f.scale);
    position.set(f.x, 0, f.z);
    matrix.compose(position, quat, scale);
    matrices[i] = matrix.clone();
    colors[i * 3] = f.color.r;
    colors[i * 3 + 1] = f.color.g;
    colors[i * 3 + 2] = f.color.b;
    const base = f.baseColor || f.color;
    bases[i * 3] = base.r;
    bases[i * 3 + 1] = base.g;
    bases[i * 3 + 2] = base.b;
    phases[i] = f.phase;
    glows[i] = f.glow;
    stages[i] = f.stage ?? 2;
    opens[i] = f.open ?? 1;
    glowColors[i * 3] = f.color.r;
    glowColors[i * 3 + 1] = f.color.g;
    glowColors[i * 3 + 2] = f.color.b;
    glowPhases[i] = f.phase;
    glowStages[i] = f.stage ?? 2;
  }

  const data = {
    colors: new THREE.InstancedBufferAttribute(colors, 3),
    bases: new THREE.InstancedBufferAttribute(bases, 3),
    phases: new THREE.InstancedBufferAttribute(phases, 1),
    glows: new THREE.InstancedBufferAttribute(glows, 1),
    stages: new THREE.InstancedBufferAttribute(stages, 1),
    opens: new THREE.InstancedBufferAttribute(opens, 1),
  };

  const meshes = {};
  for (const quality of ['high', 'mid', 'low']) {
    const geometry = assets.geometries[quality].clone();
    geometry.setAttribute('aColor', data.colors);
    geometry.setAttribute('aBase', data.bases);
    geometry.setAttribute('aPhase', data.phases);
    geometry.setAttribute('aGlow', data.glows);
    geometry.setAttribute('aStage', data.stages);
    geometry.setAttribute('aOpen', data.opens);
    const mesh = new THREE.InstancedMesh(geometry, assets.material, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.frustumCulled = false;
    mesh.name = `lotus-${quality}`;
    for (let i = 0; i < count; i += 1) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = quality === 'high';
    meshes[quality] = mesh;
    group.add(mesh);
  }

  const glowGeometry = assets.glowGeometry.clone();
  glowGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(glowColors, 3));
  glowGeometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(glowPhases, 1));
  glowGeometry.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glows.slice(), 1));
  glowGeometry.setAttribute('aStage', new THREE.InstancedBufferAttribute(glowStages, 1));
  const glow = new THREE.InstancedMesh(glowGeometry, assets.glowMaterial, count);
  glow.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  glow.frustumCulled = false;
  glow.name = 'lotus-halos';
  for (let i = 0; i < count; i += 1) {
    const f = flowers[i];
    quat.setFromAxisAngle(UP, f.rotation);
    scale.setScalar(1);
    position.set(f.x, 0, f.z);
    matrix.compose(position, quat, scale);
    glow.setMatrixAt(i, matrix);
  }
  glow.instanceMatrix.needsUpdate = true;
  group.add(glow);

  return {
    group,
    meshes,
    glow,
    count,
    level: 0,
    setLod(level, cheap) {
      const target = level <= 0 ? 'high' : level === 1 ? 'mid' : 'low';
      this.level = level;
      for (const quality of ['high', 'mid', 'low']) {
        const mesh = meshes[quality];
        mesh.visible = quality === target;
        mesh.material = cheap || quality === 'low' ? assets.cheapMaterial : assets.material;
      }
      glow.visible = true;
    },
  };
}
