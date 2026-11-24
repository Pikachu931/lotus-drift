import * as THREE from 'three';

const MAX_PARTICLES = 1200;
const RANGE = 70;

const vertexShader = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  attribute float aKind;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uRange;
  uniform float uReduced;
  uniform float uOpacity;
  uniform float uScale;
  uniform vec3 uBoatPos;

  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float drift = mix(1.0, 0.35, uReduced);
    vec3 p = position;
    p.x += sin(uTime * 0.21 + aPhase * 12.0) * 1.9 * drift;
    p.z += cos(uTime * 0.17 + aPhase * 9.0) * 1.9 * drift;
    p.y += sin(uTime * 0.33 + aPhase * 5.0) * 0.3 * drift;

    vec3 rel = p - uBoatPos;
    rel.x = mod(rel.x + uRange * 0.5, uRange) - uRange * 0.5;
    rel.z = mod(rel.z + uRange * 0.5, uRange) - uRange * 0.5;
    vec3 wp = uBoatPos + rel;

    if (aKind > 1.5) {
      wp.y = uBoatPos.y + 0.12 + mod(position.y + uTime * 0.18 + aPhase * 4.0, 3.2);
      wp.x += sin(uTime * 0.3 + aPhase * 9.0) * 0.35;
      wp.z += cos(uTime * 0.27 + aPhase * 7.0) * 0.35;
    } else if (aKind > 0.5) {
      wp.y = uBoatPos.y + mod(position.y + uTime * 0.26 + aPhase * 9.0, 11.0);
    } else {
      wp.y = uBoatPos.y + 0.45 + mod(position.y + 2.0, 3.1);
    }

    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;

    float twinkle = 0.55 + 0.45 * sin(uTime * 1.9 + aPhase * 41.0);
    float edge = smoothstep(uRange * 0.5, uRange * 0.28, length(rel.xz));
    vAlpha = uOpacity * edge * mix(1.0, twinkle, 0.55 * (1.0 - uReduced * 0.7));

    if (aKind > 1.5) {
      vColor = mix(vec3(1.0, 0.85, 0.48), vec3(0.74, 0.94, 0.55), fract(aPhase * 5.3));
    } else if (aKind > 0.5) {
      vColor = mix(vec3(0.6, 0.88, 1.0), vec3(0.8, 0.96, 1.0), fract(aPhase * 5.3));
    } else {
      vColor = mix(vec3(1.0, 0.82, 0.45), vec3(1.0, 0.94, 0.68), fract(aPhase * 7.1));
    }

    float size = aSize * uScale * (aKind > 1.5 ? 0.8 : aKind > 0.5 ? 0.7 : 1.0);
    gl_PointSize = clamp(size * uPixelRatio * (300.0 / max(-mv.z, 1.0)), 1.0, 28.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(smoothstep(1.0, 0.0, d), 1.9);
    gl_FragColor = vec4(vColor * (1.0 + a * 0.6), a * vAlpha);
  }
`;

export class Particles {
  constructor(profile) {
    this.count = MAX_PARTICLES;
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const phases = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    const kinds = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const isPollen = i % 13 === 0;
      const isMote = i % 5 === 0 && !isPollen;
      positions[i * 3 + 0] = (Math.random() - 0.5) * RANGE;
      positions[i * 3 + 1] = isMote
        ? Math.random() * 11
        : isPollen
          ? Math.random() * 3.2
          : Math.random() * 3.1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE;
      phases[i] = Math.random();
      sizes[i] = isPollen
        ? 0.6 + Math.random() * 1.2
        : isMote
          ? 0.7 + Math.random() * 0.9
          : 1.4 + Math.random() * 2.6;
      kinds[i] = isPollen ? 2 : isMote ? 1 : 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uRange: { value: RANGE },
      uReduced: { value: 0 },
      uOpacity: { value: 1 },
      uScale: { value: 1 },
      uBoatPos: { value: new THREE.Vector3() },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'fireflies';
    this.geometry = geometry;
    this.setQuality(profile);
  }

  setQuality(profile) {
    const count = Math.max(40, Math.floor(MAX_PARTICLES * profile.particleScale));
    this.geometry.setDrawRange(0, count);
    this.uniforms.uScale.value = profile.name === 'light' ? 0.85 : 1;
  }

  setPixelRatio(ratio) {
    this.uniforms.uPixelRatio.value = ratio;
  }

  setReducedMotion(reduced) {
    this.uniforms.uReduced.value = reduced ? 1 : 0;
  }

  applyEnvironment(env) {
    this.uniforms.uOpacity.value = 0.35 + env.starOpacity * 0.65;
  }

  update(time, boatPosition) {
    this.uniforms.uTime.value = time;
    this.uniforms.uBoatPos.value.copy(boatPosition);
    this.points.position.set(0, 0, 0);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
