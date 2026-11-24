import * as THREE from 'three';
import { WAKE } from '../core/config.js';
import { clamp, damp } from '../core/math.js';
import { waveHeight } from '../world/waves.js';

const ribbonVertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aCross;

  varying float vAlpha;
  varying float vCross;

  void main() {
    vAlpha = aAlpha;
    vCross = aCross;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;

  varying float vAlpha;
  varying float vCross;

  void main() {
    float edge = sin(vCross * 3.14159265);
    float a = vAlpha * pow(clamp(edge, 0.0, 1.0), 1.6);
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * (0.7 + uGlow), a);
  }
`;

/**
 * A fixed-size ring buffer of trail points feeds a triangle-strip ribbon and
 * eight water ripple slots. Nothing is allocated per frame.
 */
export class Wake {
  constructor(scene, rippleUniforms) {
    this.capacity = WAKE.maxPoints;
    this.rippleUniforms = rippleUniforms;

    this.xs = new Float32Array(this.capacity);
    this.zs = new Float32Array(this.capacity);
    this.headings = new Float32Array(this.capacity);
    this.ages = new Float32Array(this.capacity);
    this.count = 0;
    this.head = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.spawnTimer = 0;
    this.rippleTimer = 0;
    this.idleTimer = 2.5;
    this.lastStroke = 0;

    this.ripples = Array.from({ length: WAKE.rippleSlots }, () => ({
      x: 0,
      z: 0,
      age: 0,
      strength: 0,
      active: false,
    }));
    this.rippleIndex = 0;

    const positions = new Float32Array(this.capacity * 2 * 3);
    const alphas = new Float32Array(this.capacity * 2);
    const crosses = new Float32Array(this.capacity * 2);
    const indices = [];
    for (let i = 0; i < this.capacity - 1; i += 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    this.geometry.setAttribute('aCross', new THREE.BufferAttribute(crosses, 1));
    this.geometry.setIndex(indices);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      uniforms: {
        uColor: { value: new THREE.Color(0xbfe9ff) },
        uGlow: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'wake-ribbon';
    scene.add(this.mesh);

    this.glow = 0;
  }

  pushPoint(x, z, heading) {
    const index = this.head;
    this.xs[index] = x;
    this.zs[index] = z;
    this.headings[index] = heading;
    this.ages[index] = 0;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  spawnRipple(x, z, strength) {
    const ripple = this.ripples[this.rippleIndex];
    ripple.x = x;
    ripple.z = z;
    ripple.age = 0;
    ripple.strength = strength;
    ripple.active = true;
    this.rippleIndex = (this.rippleIndex + 1) % this.ripples.length;
  }

  applyEnvironment(env) {
    this.material.uniforms.uGlow.value = 0.25 + env.flowerGlow * 0.35;
  }

  update(dt, state, time) {
    const speed = Math.abs(state.speed);
    const forwardX = Math.sin(state.heading);
    const forwardZ = Math.cos(state.heading);
    const sternX = state.x - forwardX * 0.95;
    const sternZ = state.z - forwardZ * 0.95;

    for (let i = 0; i < this.count; i += 1) {
      const index = (this.head - 1 - i + this.capacity * 2) % this.capacity;
      this.ages[index] += dt;
      if (this.ages[index] > WAKE.pointLifetime) {
        this.count = i;
        break;
      }
    }

    this.spawnTimer -= dt;
    const travelled = Math.hypot(state.x - this.lastX, state.z - this.lastZ);
    if (speed > 0.22 && travelled > WAKE.pointSpacing && this.spawnTimer <= 0) {
      this.pushPoint(sternX, sternZ, state.heading);
      this.lastX = state.x;
      this.lastZ = state.z;
      this.spawnTimer = 0.045;
    }

    this.rippleTimer -= dt;
    if (speed > 0.28 && this.rippleTimer <= 0) {
      this.spawnRipple(sternX, sternZ, clamp(0.32 + speed * 0.1, 0.35, 0.85));
      this.rippleTimer = clamp(0.86 - speed * 0.09, 0.34, 0.9);
    }

    if (state.strokeCount !== this.lastStroke) {
      this.lastStroke = state.strokeCount;
      this.spawnRipple(sternX, sternZ, 0.9);
      this.spawnRipple(state.x + forwardX * 0.9, state.z + forwardZ * 0.9, 0.5);
    }

    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.spawnRipple(
        state.x + (Math.random() - 0.5) * 1.2,
        state.z + (Math.random() - 0.5) * 1.2,
        0.18,
      );
      this.idleTimer = 3.4 + Math.random() * 2.6;
    }

    for (const ripple of this.ripples) {
      if (!ripple.active) continue;
      ripple.age += dt;
      if (ripple.age > WAKE.rippleLifetime) {
        ripple.active = false;
        ripple.strength = 0;
      }
    }
    for (let i = 0; i < this.rippleUniforms.length; i += 1) {
      const ripple = this.ripples[i];
      this.rippleUniforms[i].set(
        ripple.x,
        ripple.z,
        ripple.age,
        ripple.active ? ripple.strength : 0,
      );
    }

    this.glow = damp(this.glow, clamp(speed / 3.2, 0, 1), 2.2, dt);
    this.material.uniforms.uGlow.value = 0.25 + this.glow * 0.55;

    this.buildRibbon(speed, time);
  }

  buildRibbon(speed, time) {
    if (this.count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const positions = this.geometry.attributes.position.array;
    const alphas = this.geometry.attributes.aAlpha.array;
    const crosses = this.geometry.attributes.aCross.array;
    const speedFactor = clamp(speed / 3.0, 0, 1);

    for (let k = 0; k < this.count; k += 1) {
      const index = (this.head - 1 - k + this.capacity * 2) % this.capacity;
      const age = this.ages[index];
      const ageRatio = age / WAKE.pointLifetime;
      const halfWidth = 0.32 + Math.min(k, 34) * 0.052;
      const heading = this.headings[index];
      const rightX = Math.cos(heading);
      const rightZ = -Math.sin(heading);
      const x = this.xs[index];
      const z = this.zs[index];
      const wobble = Math.sin(time * 1.2 + k * 0.4) * 0.045 * (1 - ageRatio);

      const vi = k * 6;
      const leftX = x - rightX * (halfWidth + wobble);
      const leftZ = z - rightZ * (halfWidth + wobble);
      const rightEdgeX = x + rightX * (halfWidth - wobble);
      const rightEdgeZ = z + rightZ * (halfWidth - wobble);

      positions[vi + 0] = leftX;
      positions[vi + 1] = 0.035 + waveHeight(leftX, leftZ, time);
      positions[vi + 2] = leftZ;

      positions[vi + 3] = rightEdgeX;
      positions[vi + 4] = 0.035 + waveHeight(rightEdgeX, rightEdgeZ, time);
      positions[vi + 5] = rightEdgeZ;

      const alpha =
        speedFactor * Math.pow(Math.max(0, 1 - ageRatio), 1.4) * (k < 3 ? 0.95 : 0.8);
      alphas[k * 2] = alpha;
      alphas[k * 2 + 1] = alpha;
      crosses[k * 2] = 0;
      crosses[k * 2 + 1] = 1;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aCross.needsUpdate = true;
    this.geometry.setDrawRange(0, (this.count - 1) * 6);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
