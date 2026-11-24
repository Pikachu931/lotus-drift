import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function buildLeafGeometry(high = true) {
  const positions = [];
  const uvs = [];
  const tints = [];
  const parts = [];
  const indices = [];
  const stemTop = high ? 0.68 : 0.56;
  const radius = high ? 0.42 : 0.36;
  const segments = high ? 24 : 12;
  const rings = high ? 4 : 2;
  const gap = 0.3;

  // A slightly bent stalk rising out of the water.
  const stemLevels = high
    ? [
        { y: -0.05, x: 0.0, z: 0.0, r: 0.019 },
        { y: 0.2, x: 0.02, z: 0.015, r: 0.017 },
        { y: 0.46, x: -0.012, z: 0.028, r: 0.015 },
        { y: stemTop, x: 0.018, z: 0.035, r: 0.014 },
      ]
    : [
        { y: -0.03, x: 0.0, z: 0.0, r: 0.02 },
        { y: stemTop, x: 0.012, z: 0.025, r: 0.015 },
      ];
  const stemSides = high ? 4 : 3;
  const stemStart = positions.length / 3;
  for (let i = 0; i < stemLevels.length; i += 1) {
    const level = stemLevels[i];
    for (let j = 0; j <= stemSides; j += 1) {
      const a = (j / stemSides) * TAU;
      positions.push(
        level.x + Math.cos(a) * level.r,
        level.y,
        level.z + Math.sin(a) * level.r,
      );
      uvs.push(j / stemSides, i / (stemLevels.length - 1));
      tints.push(0.3 + i * 0.1);
      parts.push(1);
    }
  }
  for (let i = 0; i < stemLevels.length - 1; i += 1) {
    for (let j = 0; j < stemSides; j += 1) {
      const a = stemStart + i * (stemSides + 1) + j;
      const b = a + 1;
      const c = a + stemSides + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Cupped, asymmetric leaf with a notch, a few tears and a raised wavy rim.
  const center = positions.length / 3;
  positions.push(0.02, stemTop + 0.005, 0.035);
  uvs.push(0.5, 0.5);
  tints.push(0);
  parts.push(0);
  const ringStarts = [];
  for (let r = 1; r <= rings; r += 1) {
    ringStarts.push(positions.length / 3);
    const q = r / rings;
    for (let i = 0; i <= segments; i += 1) {
      const a = gap + (i / segments) * (TAU - gap * 2);
      const tear = high && r === rings && (i === 5 || i === 17) ? 0.9 : 1;
      const wobble = 1 + Math.sin(a * 6.0) * 0.03 + Math.sin(a * 13.0) * 0.015;
      const rr = q * radius * wobble * tear;
      const y =
        stemTop +
        q * q * 0.09 -
        (1 - q) * (1 - q) * 0.07 +
        Math.sin(a * 7.0) * 0.008 * q * q;
      positions.push(0.02 + Math.cos(a) * rr, y, 0.035 + Math.sin(a) * rr);
      uvs.push(0.5 + Math.cos(a) * q * 0.5, 0.5 + Math.sin(a) * q * 0.5);
      tints.push(0.1 + q * 0.8);
      parts.push(0);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    indices.push(center, ringStarts[0] + i, ringStarts[0] + i + 1);
  }
  for (let r = 0; r < rings - 1; r += 1) {
    const a0 = ringStarts[r];
    const b0 = ringStarts[r + 1];
    for (let i = 0; i < segments; i += 1) {
      if (high && r === rings - 2 && i === 5) continue;
      indices.push(a0 + i, b0 + i, a0 + i + 1, a0 + i + 1, b0 + i, b0 + i + 1);
    }
  }

  if (high) {
    // A small bead of dew resting in the concave centre.
    const dewCenter = positions.length / 3;
    const dewY = stemTop + 0.035;
    positions.push(0.02, dewY + 0.035, 0.035);
    uvs.push(0.5, 0.5);
    tints.push(1.2);
    parts.push(2);
    const dewSegments = 7;
    const dewRings = 4;
    for (let r = 1; r <= dewRings; r += 1) {
      const phi = (r / dewRings) * Math.PI;
      const rr = Math.sin(phi) * 0.034;
      const yy = Math.cos(phi) * 0.032;
      for (let i = 0; i <= dewSegments; i += 1) {
        const a = (i / dewSegments) * TAU;
        positions.push(0.02 + Math.cos(a) * rr, dewY + yy, 0.035 + Math.sin(a) * rr);
        uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
        tints.push(1.15);
        parts.push(2);
      }
    }
    for (let i = 0; i < dewSegments; i += 1) {
      indices.push(dewCenter, dewCenter + 1 + i, dewCenter + 2 + i);
    }
    for (let r = 0; r < dewRings - 1; r += 1) {
      const a0 = dewCenter + 1 + r * (dewSegments + 1);
      const b0 = a0 + dewSegments + 1;
      for (let i = 0; i < dewSegments; i += 1) {
        indices.push(a0 + i, b0 + i, a0 + i + 1, a0 + i + 1, b0 + i, b0 + i + 1);
      }
    }
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

const leafVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aTint;
  attribute float aPart;

  uniform float uTime;
  uniform float uReduced;
  uniform float uWind;
  uniform vec3 uMoonDir;

  varying vec3 vColor;
  varying float vTint;
  varying float vPart;
  varying float vLight;
  varying float vFogDepth;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;

  ${WAVE_GLSL}

  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    float motion = mix(1.0, 0.35, uReduced);
    float hf = smoothstep(0.0, 0.7, position.y);
    float gust = sin(uTime * 0.31 + aPhase * 6.2831) * 0.5 + 0.5;
    float sway = sin(uTime * 0.7 + aPhase * 4.0 + position.y * 1.7) * 0.08;
    sway *= (0.6 + gust * 0.7) * uWind * motion;
    wp.x += sway * hf * hf;
    wp.z += sway * 0.55 * hf * hf;
    wp.y += waveHeight(wp.xz, uTime) * 0.16 * (1.0 - hf);

    mat3 im = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
    vec3 n = normalize(im * normal);
    vLight = 0.45 + 0.55 * max(dot(n, normalize(uMoonDir)), 0.0);
    vColor = aColor;
    vTint = aTint;
    vPart = aPart;
    vUv = uv;
    vWorld = wp.xyz;
    vNormal = n;

    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const leafFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uNight;
  uniform float uGlowAmount;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform sampler2D uAtlas;
  uniform sampler2D uAtlasNormal;
  uniform vec2 uLeafCell;

  varying vec3 vColor;
  varying float vTint;
  varying float vPart;
  varying float vLight;
  varying float vFogDepth;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uMoonDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float waxy = pow(max(dot(N, H), 0.0), 48.0);
    vec3 col;

    if (vPart > 1.5) {
      // Dew bead: crisp highlight, tiny caustic.
      col = vec3(0.55, 0.8, 0.78) * (0.35 + 0.45 * ndl);
      col += uMoonColor * (pow(max(dot(N, H), 0.0), 90.0) * 1.8 + 0.12);
    } else if (vPart > 0.5) {
      col = vec3(0.16, 0.25, 0.12) * (0.7 + 0.5 * vLight);
    } else {
      vec2 atlasUv = clamp(vUv, 0.02, 0.98) * 0.5 + uLeafCell;
      vec3 veins = texture2D(uAtlas, atlasUv).rgb;
      vec3 bump = texture2D(uAtlasNormal, atlasUv).rgb * 2.0 - 1.0;
      N = normalize(N + vec3(bump.x, bump.y, 0.0) * 0.14);
      ndl = max(dot(N, L), 0.0);
      waxy = pow(max(dot(N, H), 0.0), 48.0);
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0;
      col = vColor * (0.56 + 0.54 * ndl) * (0.76 + vTint * 0.3);
      col += vColor * veins.g * 0.28;
      col += uMoonColor * waxy * (0.32 + 0.3 * uNight);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      col += vColor * rim * 0.22;
      float rimCurl = smoothstep(0.8, 1.0, r);
      col = mix(col, col * vec3(0.72, 0.82, 0.62), rimCurl * 0.35);
      float agePatch = smoothstep(0.18, 0.0, length(p - vec2(0.18, -0.12)));
      col = mix(col, col * 0.65, agePatch * 0.35);
    }

    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createLeafAssets(shared) {
  const high = buildLeafGeometry(true);
  const low = buildLeafGeometry(false);
  const material = new THREE.ShaderMaterial({
    vertexShader: leafVertex,
    fragmentShader: leafFragment,
    uniforms: {
      uTime: shared.uTime,
      uReduced: shared.uReduced,
      uWind: shared.uWind,
      uMoonDir: shared.uMoonDir,
      uMoonColor: shared.uMoonColor,
      uNight: shared.uNight,
      uGlowAmount: shared.uGlow,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uAtlas: shared.uAtlas,
      uAtlasNormal: shared.uAtlasNormal,
      uLeafCell: shared.uLeafCell,
    },
    side: THREE.DoubleSide,
    fog: false,
  });
  return { geometries: { high, low }, material };
}

export function createLeafField(assets, leaves) {
  const count = leaves.length;
  const group = new THREE.Group();
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const matrices = [];
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const leaf = leaves[i];
    quat.setFromAxisAngle(UP, leaf.rotation);
    scale.setScalar(leaf.scale);
    position.set(leaf.x, 0, leaf.z);
    matrix.compose(position, quat, scale);
    matrices[i] = matrix.clone();
    colors[i * 3] = leaf.color.r;
    colors[i * 3 + 1] = leaf.color.g;
    colors[i * 3 + 2] = leaf.color.b;
    phases[i] = leaf.phase;
  }

  const meshes = {};
  for (const quality of ['high', 'low']) {
    const geometry = assets.geometries[quality].clone();
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    const mesh = new THREE.InstancedMesh(geometry, assets.material, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.frustumCulled = false;
    mesh.name = `lotus-leaves-${quality}`;
    for (let i = 0; i < count; i += 1) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = quality === 'high';
    meshes[quality] = mesh;
    group.add(mesh);
  }

  return {
    group,
    meshes,
    count,
    setLod(level) {
      meshes.high.visible = level <= 1;
      meshes.low.visible = level > 1;
    },
  };
}
