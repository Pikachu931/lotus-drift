import * as THREE from 'three';
import { MOON_DIRECTION } from '../core/config.js';
import { makeMoonTexture } from './textures.js';

const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFragment = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform float uMoonGlow;

  void main() {
    vec3 dir = normalize(vDir);
    float y = dir.y;

    vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.72, y));
    col = mix(uBottom, col, smoothstep(-0.42, 0.0, y));

    // Bury the seam between the distant water and the sky in haze.
    float horizonHaze = 1.0 - smoothstep(-0.06, 0.06, y);
    col = mix(col, uBottom, horizonHaze * 0.9);

    float m = max(dot(dir, normalize(uMoonDir)), 0.0);
    col += uMoonColor * pow(m, 260.0) * 0.2 * uMoonGlow;
    col += uMoonColor * pow(m, 16.0) * 0.03 * uMoonGlow;
    col += uMoonColor * pow(m, 6.0) * 0.035 * uMoonGlow;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const starVertex = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  attribute float aTint;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uReduced;

  varying float vTwinkle;
  varying vec3 vColor;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    float speed = mix(1.7, 0.35, uReduced);
    float twinkle = 0.55 + 0.45 * sin(uTime * speed + aPhase * 37.0);
    vTwinkle = mix(1.0, twinkle, 0.75 * (1.0 - uReduced * 0.6));
    vColor = mix(vec3(0.78, 0.87, 1.0), vec3(1.0, 0.94, 0.84), aTint);
    gl_PointSize = aSize * uPixelRatio * (0.75 + vTwinkle * 0.5);
  }
`;

const starFragment = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(0.55, 0.0, d);
    float halo = smoothstep(1.0, 0.2, d) * 0.35;
    float alpha = (core + halo) * vTwinkle * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(vColor * (0.7 + vTwinkle * 0.8), alpha);
  }
`;

export class Sky {
  constructor() {
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.moonDir = new THREE.Vector3(
      MOON_DIRECTION.x,
      MOON_DIRECTION.y,
      MOON_DIRECTION.z,
    ).normalize();

    this.uniforms = {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(0x03060f) },
      uHorizon: { value: new THREE.Color(0x0a1430) },
      uBottom: { value: new THREE.Color(0x04070f) },
      uMoonColor: { value: new THREE.Color(0xbfd4ff) },
      uMoonDir: { value: this.moonDir.clone() },
      uMoonGlow: { value: 1 },
      uStarOpacity: { value: 1 },
      uPixelRatio: { value: 1 },
      uReduced: { value: 0 },
    };

    const domeGeometry = new THREE.SphereGeometry(880, 40, 26);
    const domeMaterial = new THREE.ShaderMaterial({
      vertexShader: domeVertex,
      fragmentShader: domeFragment,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(domeGeometry, domeMaterial);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -20;
    this.group.add(this.dome);

    this.starUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 1 },
      uReduced: { value: 0 },
    };
    const starGeometry = new THREE.BufferGeometry();
    const count = 1700;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const tints = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const y = 0.02 + Math.random() * 0.95;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      const radius = 820;
      positions[i * 3 + 0] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = y * radius;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius;
      phases[i] = Math.random();
      const bright = Math.random();
      sizes[i] = bright > 0.985 ? 2.6 + Math.random() * 1.4 : 0.7 + bright * 1.4;
      tints[i] = Math.random();
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 1));

    const starMaterial = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: this.starUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -19;
    this.group.add(this.stars);

    const moonTexture = makeMoonTexture();
    this.moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTexture,
        color: new THREE.Color(0xffffff),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        opacity: 1,
      }),
    );
    this.moon.scale.setScalar(24);
    this.moon.position.copy(this.moonDir).multiplyScalar(620);
    this.moon.renderOrder = -18;
    this.group.add(this.moon);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTexture,
        color: new THREE.Color(0x9dc4ff),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        opacity: 0.2,
      }),
    );
    this.halo.scale.setScalar(84);
    this.halo.position.copy(this.moonDir).multiplyScalar(640);
    this.halo.renderOrder = -18;
    this.group.add(this.halo);
  }

  setPixelRatio(ratio) {
    this.uniforms.uPixelRatio.value = ratio;
    this.starUniforms.uPixelRatio.value = ratio;
  }

  setReducedMotion(reduced) {
    this.uniforms.uReduced.value = reduced ? 1 : 0;
    this.starUniforms.uReduced.value = reduced ? 1 : 0;
  }

  applyEnvironment(env) {
    this.uniforms.uTop.value.copy(env.skyTop);
    this.uniforms.uHorizon.value.copy(env.skyHorizon);
    this.uniforms.uBottom.value.copy(env.skyBottom);
    this.uniforms.uMoonColor.value.copy(env.moonColor);
    this.uniforms.uMoonGlow.value = env.moonGlow;
    this.starUniforms.uOpacity.value = env.starOpacity;
    this.stars.visible = env.starOpacity > 0.01;

    this.moon.material.color.copy(env.moonColor);
    this.moon.material.opacity = 0.5 + env.moonGlow * 0.45;
    this.moon.scale.setScalar(24 + env.dayness * 8);
    this.halo.material.color.copy(env.moonColor);
    this.halo.material.opacity = (0.025 + env.moonGlow * 0.075) * (1 + env.dayness * 0.6);
    this.halo.scale.setScalar(84 + env.dayness * 30);
    this.moon.visible = env.moonGlow > 0.02;
    this.halo.visible = env.moonGlow > 0.02;
  }

  update(time, camera) {
    this.uniforms.uTime.value = time;
    this.starUniforms.uTime.value = time;
    this.group.position.copy(camera.position);
    this.group.updateMatrix();
  }
}
