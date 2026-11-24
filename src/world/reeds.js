import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';

const UP = new THREE.Vector3(0, 1, 0);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildReedGeometry() {
  const random = mulberry32(20261121);
  const positions = [];
  const tints = [];
  const kinds = [];
  const uvs = [];
  const indices = [];

  const addBlade = (baseX, baseZ, height, leanX, leanZ, width, kind = 0) => {
    const start = positions.length / 3;
    const segments = 4;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const w = width * (1 - t * 0.82) * (0.65 + 0.35 * Math.sin(t * Math.PI));
      const bend = Math.pow(t, 1.7);
      const x = baseX + leanX * bend;
      const z = baseZ + leanZ * bend;
      const y = height * t;
      positions.push(x - w, y, z, x + w, y, z + 0.004);
      tints.push(0.15 + t * 0.8, 0.15 + t * 0.8);
      kinds.push(kind, kind);
      uvs.push(0, t, 1, t);
    }
    for (let i = 0; i < segments; i += 1) {
      const a = start + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  };

  for (let i = 0; i < 14; i += 1) {
    const a = random() * Math.PI * 2;
    const radius = 0.05 + random() * 0.38;
    const tall = random() > 0.62;
    addBlade(
      Math.cos(a) * radius,
      Math.sin(a) * radius,
      tall ? 1.8 + random() * 0.8 : 0.8 + random() * 1.1,
      Math.cos(a) * (0.15 + random() * 0.4),
      Math.sin(a) * (0.15 + random() * 0.4),
      tall ? 0.012 + random() * 0.011 : 0.02 + random() * 0.022,
    );
  }

  // A handful of thin, dry blades that have gone brown at the tips.
  for (let i = 0; i < 3; i += 1) {
    const a = random() * Math.PI * 2;
    const radius = 0.08 + random() * 0.3;
    addBlade(
      Math.cos(a) * radius,
      Math.sin(a) * radius,
      1.0 + random() * 0.9,
      Math.cos(a) * (0.1 + random() * 0.28),
      Math.sin(a) * (0.1 + random() * 0.28),
      0.009 + random() * 0.007,
      3,
    );
  }

  // Cattails: a thin stalk with a soft brown head.
  for (let c = 0; c < 3; c += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 0.12 + random() * 0.22;
    const baseX = Math.cos(angle) * radius;
    const baseZ = Math.sin(angle) * radius;
    const height = 1.7 + random() * 0.5;
    const leanX = Math.cos(angle) * 0.22;
    const leanZ = Math.sin(angle) * 0.22;

    const start = positions.length / 3;
    const segments = 3;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const x = baseX + leanX * Math.pow(t, 1.8);
      const z = baseZ + leanZ * Math.pow(t, 1.8);
      const y = height * t;
      positions.push(x - 0.012, y, z, x + 0.012, y, z);
      tints.push(0.32, 0.32);
      kinds.push(1, 1);
      uvs.push(0, t, 1, t);
    }
    for (let i = 0; i < segments; i += 1) {
      const a = start + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }

    const headBaseY = height * 0.82;
    const headX = baseX + leanX * 0.82;
    const headZ = baseZ + leanZ * 0.82;
    const headStart = positions.length / 3;
    const radial = 6;
    const headRings = 4;
    for (let ring = 0; ring <= headRings; ring += 1) {
      const t = ring / headRings;
      const r = 0.036 * Math.sin(Math.PI * (0.18 + t * 0.82));
      const y = headBaseY + t * 0.24;
      for (let i = 0; i < radial; i += 1) {
        const a = (i / radial) * Math.PI * 2;
        positions.push(headX + Math.cos(a) * r, y, headZ + Math.sin(a) * r);
        tints.push(0.8);
        kinds.push(2);
        uvs.push(i / radial, t);
      }
    }
    for (let ring = 0; ring < headRings; ring += 1) {
      for (let i = 0; i < radial; i += 1) {
        const a = headStart + ring * radial + i;
        const b = headStart + ring * radial + ((i + 1) % radial);
        const c = a + radial;
        const d = b + radial;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(tints, 1));
  geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const reedVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aTint;
  attribute float aKind;

  uniform float uTime;
  uniform vec3 uMoonDir;
  uniform float uReduced;
  uniform float uWind;

  varying vec3 vColor;
  varying float vTint;
  varying float vKind;
  varying float vLight;
  varying float vFogDepth;

  ${WAVE_GLSL}

  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    float motion = mix(1.0, 0.35, uReduced);
    float hf = clamp(position.y / 1.7, 0.0, 1.0);
    float gust = sin(uTime * 0.37 + aPhase * 6.2831) * 0.5 + 0.5;

    float sway = sin(uTime * 0.85 + aPhase * 5.2 + wp.x * 0.16) * 0.17
               + sin(uTime * 2.1 + aPhase * 2.0) * 0.035;
    sway *= (0.55 + gust * 0.75) * uWind * motion;

    wp.x += sway * pow(hf, 1.55);
    wp.z += sway * 0.4 * pow(hf, 1.55);
    wp.y += waveHeight(wp.xz, uTime) * 0.22;

    mat3 im = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
    vec3 n = normalize(im * normal);
    vLight = 0.5 + 0.5 * abs(dot(n, normalize(uMoonDir)));
    vColor = aColor;
    vTint = aTint;
    vKind = aKind;

    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const reedFragment = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uGlowAmount;

  varying vec3 vColor;
  varying float vTint;
  varying float vKind;
  varying float vLight;
  varying float vFogDepth;

  void main() {
    vec3 col;
    if (vKind > 1.5 && vKind < 2.5) {
      col = vec3(0.19, 0.12, 0.07) * (0.8 + 0.4 * vLight);
    } else if (vKind > 2.5) {
      col = mix(
        vec3(0.25, 0.29, 0.16),
        vec3(0.38, 0.25, 0.12),
        smoothstep(0.45, 1.0, vTint)
      ) * (0.65 + 0.5 * vLight);
    } else if (vKind > 0.5) {
      col = vColor * 0.7 * (0.7 + 0.5 * vLight);
    } else {
      col = vColor * (0.45 + 0.7 * vTint) * (0.55 + 0.65 * vLight);
      col += vec3(0.1, 0.14, 0.08) * pow(vTint, 3.0);
    }
    col *= 0.85 + 0.15 * uGlowAmount;

    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createReedAssets(shared) {
  const geometry = buildReedGeometry();
  const material = new THREE.ShaderMaterial({
    vertexShader: reedVertex,
    fragmentShader: reedFragment,
    uniforms: {
      uTime: shared.uTime,
      uMoonDir: shared.uMoonDir,
      uReduced: shared.uReduced,
      uWind: shared.uWind,
      uGlowAmount: shared.uGlow,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    },
    side: THREE.DoubleSide,
    fog: false,
  });
  return { geometry, material };
}

export function createReedField(assets, clusters) {
  const count = clusters.length;
  const geometry = assets.geometry.clone();
  const mesh = new THREE.InstancedMesh(geometry, assets.material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = 'reeds';

  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const cluster = clusters[i];
    quat.setFromAxisAngle(UP, cluster.rotation);
    scale.set(cluster.scale, cluster.scale, cluster.scale);
    position.set(cluster.x, 0, cluster.z);
    matrix.compose(position, quat, scale);
    mesh.setMatrixAt(i, matrix);
    colors[i * 3] = cluster.color.r;
    colors[i * 3 + 1] = cluster.color.g;
    colors[i * 3 + 2] = cluster.color.b;
    phases[i] = cluster.phase;
  }

  mesh.instanceMatrix.needsUpdate = true;
  geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

  const group = new THREE.Group();
  group.add(mesh);
  return { group, mesh, count };
}
