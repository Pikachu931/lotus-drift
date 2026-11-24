import * as THREE from 'three';
import { WORLD } from '../core/config.js';
import { WAVE_GLSL } from './waves.js';

const vertexShader = /* glsl */ `
  uniform float uTime;

  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec2 vXZ;

  ${WAVE_GLSL}

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.y += waveHeight(world.xz, uTime);

    vec2 slope = waveSlope(world.xz, uTime);
    vNrm = normalize(vec3(-slope.x, 1.0, -slope.y));

    vWorld = world.xyz;
    vXZ = world.xz;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vWorld;
  varying vec3 vNrm;
  varying vec2 vXZ;

  uniform float uTime;
  uniform vec3 uCamPos;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uFogColor;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform float uFogDensity;
  uniform float uMoonIntensity;
  uniform float uReflectivity;
  uniform float uGlowAmount;
  uniform float uRippleNormal;
  uniform vec2 uBoat;
  uniform float uBoatHeading;
  uniform float uBoatSpeed;

  uniform vec4 uRipples[8];
  uniform vec4 uLights[8];
  uniform vec3 uLightColors[8];

  void main() {
    vec3 n = normalize(vNrm);
    float ringMask = 0.0;

    for (int i = 0; i < 8; i++) {
      vec4 r = uRipples[i];
      if (r.w <= 0.0008) { continue; }
      vec2 delta = vXZ - r.xy;
      float dist = length(delta) + 0.0001;
      float radius = r.z * 1.65;
      float env = exp(-r.z * 0.8) * r.w * smoothstep(0.0, 0.22, r.z);
      float band = exp(-pow((dist - radius) * 1.7, 2.0));
      float wave = sin((dist - radius) * 3.1);
      n.xz += (delta / dist) * wave * band * env * 0.6 * uRippleNormal;
      ringMask += band * env;
    }

    // The hull sits in the surface: a local, elongated normal disturbance and
    // a thin collar of displaced water make the boat feel buoyant.
    vec2 boatDelta = vXZ - uBoat;
    float bc = cos(uBoatHeading);
    float bs = sin(uBoatHeading);
    vec2 boatLocal = vec2(
      boatDelta.x * bc - boatDelta.y * bs,
      boatDelta.x * bs + boatDelta.y * bc
    );
    float hullDist = length(vec2(boatLocal.x / 0.7, boatLocal.y / 1.95));
    float speedScale = smoothstep(0.04, 1.0, uBoatSpeed);
    float hullMask = smoothstep(1.45, 0.6, hullDist) * (0.35 + 0.65 * speedScale);
    n.xz += normalize(boatDelta + 0.0001) * hullMask * 0.32;
    ringMask += hullMask * 0.22;

    float nearFade = exp(-length(uCamPos - vWorld) * 0.035);
    float micro = sin(vXZ.x * 3.1 + uTime * 0.9) * sin(vXZ.y * 3.7 - uTime * 0.7);
    n.x += micro * 0.012 * nearFade;
    n.z += micro * 0.009 * nearFade;
    n = normalize(n);

    vec3 V = normalize(uCamPos - vWorld);
    float ndv = clamp(dot(V, n), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);

    vec3 R = reflect(-V, n);
    vec3 sky = mix(uHorizonColor, uSkyColor, clamp(R.y * 2.2, 0.0, 1.0));
    vec3 base = mix(uDeepColor, uShallowColor, clamp(0.42 + 0.58 * fres, 0.0, 1.0));
    vec3 col = base + sky * (0.2 + 0.85 * fres) * 0.62 * uReflectivity;

    vec3 moonDir = normalize(uMoonDir);
    vec3 H = normalize(moonDir + V);
    float ndh = max(dot(n, H), 0.0);
    col += uMoonColor * (pow(ndh, 240.0) * 1.5 + pow(ndh, 28.0) * 0.1) * uMoonIntensity;

    // A broad, broken moon path running toward the viewer.
    vec2 moonFlat = normalize(moonDir.xz + vec2(0.0001, 0.0));
    vec2 toCamera = normalize(uCamPos.xz - vXZ);
    float alignment = max(dot(toCamera, -moonFlat), 0.0);
    float path = pow(alignment, 46.0);
    float shimmer = 0.65 + 0.35 * sin(vXZ.x * 0.9 + uTime * 0.8) * sin(vXZ.y * 0.7 - uTime * 0.6);
    col += uMoonColor * path * (0.045 + 0.07 * shimmer + ndh * 0.12) * uMoonIntensity * uReflectivity;

    for (int i = 0; i < 8; i++) {
      vec4 l = uLights[i];
      if (l.z <= 0.001) { continue; }
      vec2 lp = l.xy;
      vec2 toCam = normalize(uCamPos.xz - lp + 0.0001);
      vec2 rel = vXZ - lp;
      float along = dot(rel, toCam);
      vec2 side = vec2(-toCam.y, toCam.x);
      float perp = dot(rel, side);
      float wobble = sin(along * 1.6 + uTime * 0.9 + float(i) * 2.3) * (0.05 + max(along, 0.0) * 0.03);
      float width = 0.26 + max(along, 0.0) * 0.05;
      float streak = exp(-pow((perp - wobble) / width, 2.0));
      streak *= exp(-max(along, 0.0) * 0.16) * smoothstep(-0.35, 0.25, along);
      float pool = exp(-length(rel) * 1.5);
      col += uLightColors[i] * (streak * 0.32 + pool * 0.34) * l.z * uGlowAmount;
    }

    col += vec3(0.52, 0.78, 0.9) * ringMask * 0.42 * uGlowAmount;

    float depth = length(uCamPos - vWorld);
    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Water {
  constructor(profile) {
    this.maxLights = 8;
    this.uniforms = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uDeepColor: { value: new THREE.Color(0x02050c) },
      uShallowColor: { value: new THREE.Color(0x0a1a2b) },
      uSkyColor: { value: new THREE.Color(0x0a1430) },
      uHorizonColor: { value: new THREE.Color(0x0a1430) },
      uFogColor: { value: new THREE.Color(0x091326) },
      uFogDensity: { value: WORLD.fogNight },
      uMoonColor: { value: new THREE.Color(0xbfd4ff) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonIntensity: { value: 1 },
      uReflectivity: { value: 1 },
      uGlowAmount: { value: 1 },
      uRippleNormal: { value: profile.name === 'light' ? 0.55 : 1 },
      uBoat: { value: new THREE.Vector2() },
      uBoatHeading: { value: 0 },
      uBoatSpeed: { value: 0 },
      uRipples: {
        value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      uLights: {
        value: Array.from({ length: this.maxLights }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      uLightColors: {
        value: Array.from({ length: this.maxLights }, () => new THREE.Color(0, 0, 0)),
      },
    };

    const segments =
      profile.name === 'light' ? WORLD.waterSegmentsLight : WORLD.waterSegmentsHigh;
    const geometry = new THREE.PlaneGeometry(
      WORLD.waterSize,
      WORLD.waterSize,
      segments,
      segments,
    );
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      fog: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = true;
    this.mesh.receiveShadow = false;
    this.mesh.name = 'water';

    // A coarse outer skirt continues the pond past the detailed plane so the
    // fogged horizon never reveals the edge of the world.
    const skirtGeometry = new THREE.PlaneGeometry(6000, 6000, 8, 8);
    skirtGeometry.rotateX(-Math.PI / 2);
    this.skirt = new THREE.Mesh(skirtGeometry, material);
    this.skirt.position.y = -0.5;
    this.skirt.frustumCulled = false;
    this.skirt.name = 'water-horizon';
    this.mesh.add(this.skirt);
  }

  setQuality(profile) {
    this.uniforms.uRippleNormal.value = profile.name === 'light' ? 0.55 : 1;
  }

  applyEnvironment(env) {
    this.uniforms.uDeepColor.value.copy(env.waterDeep);
    this.uniforms.uShallowColor.value.copy(env.waterShallow);
    this.uniforms.uSkyColor.value.copy(env.skyTop);
    this.uniforms.uHorizonColor.value.copy(env.skyHorizon);
    this.uniforms.uFogColor.value.copy(env.fog);
    this.uniforms.uFogDensity.value = env.fogDensity;
    this.uniforms.uMoonColor.value.copy(env.moonColor);
    this.uniforms.uMoonIntensity.value = env.moonIntensity;
    this.uniforms.uReflectivity.value = env.waterReflectivity;
    this.uniforms.uGlowAmount.value = env.flowerGlow;
  }

  update(dt, time, camera, boatPosition) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCamPos.value.copy(camera.position);
    this.uniforms.uBoat.value.set(boatPosition.x, boatPosition.z);
    this.uniforms.uBoatHeading.value = boatPosition.heading;
    this.uniforms.uBoatSpeed.value = Math.abs(boatPosition.speed);
    this.mesh.position.x = boatPosition.x;
    this.mesh.position.z = boatPosition.z;
  }

  /** Writes the first `max` lights; the rest are zeroed so the shader skips them. */
  setLights(lights, max) {
    const count = Math.min(max, this.maxLights);
    for (let i = 0; i < this.maxLights; i += 1) {
      const slot = this.uniforms.uLights.value[i];
      const color = this.uniforms.uLightColors.value[i];
      if (i < count && lights[i] && lights[i].intensity > 0.001) {
        slot.set(lights[i].x, lights[i].z, lights[i].intensity, lights[i].radius);
        color.copy(lights[i].color);
      } else {
        slot.set(0, 0, 0, 0);
        color.setRGB(0, 0, 0);
      }
    }
  }
}
