import * as THREE from 'three';
import { makeMistTexture } from './textures.js';

export class Mist {
  constructor(profile) {
    this.group = new THREE.Group();
    this.group.name = 'mist';

    const texture = makeMistTexture();
    this.layers = [];

    const config = [
      { y: 0.24, size: 460, opacity: 0.006, speed: 0.004, color: 0x9fc6e8, rotation: 0 },
      { y: 0.9, size: 520, opacity: 0.005, speed: -0.0026, color: 0xb7d3ea, rotation: 1.7 },
      { y: 2.15, size: 600, opacity: 0.004, speed: 0.0018, color: 0xd0e2f2, rotation: 0.8 },
    ];
    const lowHaze = {
      y: 0.11,
      size: 540,
      opacity: 0.001,
      speed: 0.0015,
      color: 0xa9cbdc,
      rotation: 0.3,
    };

    const count = profile.name === 'light' ? 1 : profile.name === 'economy' ? 2 : 3;
    const layers = profile.realism >= 0.62 ? [lowHaze, ...config] : config;

    for (let i = 0; i < Math.min(layers.length, count + (profile.realism >= 0.62 ? 1 : 0)); i += 1) {
      const layerConfig = layers[i];
      const map = texture.clone();
      map.needsUpdate = true;
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(2.2 + i * 0.6, 2.2 + i * 0.6);
      map.offset.set(Math.random(), Math.random());

      const material = new THREE.MeshBasicMaterial({
        map,
        color: new THREE.Color(layerConfig.color),
        transparent: true,
        opacity: layerConfig.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(layerConfig.size, layerConfig.size),
        material,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = layerConfig.rotation;
      mesh.position.y = layerConfig.y;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.layers.push({ mesh, material, map, speed: layerConfig.speed, baseOpacity: layerConfig.opacity });
    }
    this.group.renderOrder = 1;
    this.baseTexture = texture;
    this.dayBlend = 0;
    this.tint = new THREE.Color();
    this.dayTint = new THREE.Color(0xcfe4ec);
  }

  setQuality() {
    // Layer count is fixed at construction; low tiers keep their cheaper setup.
  }

  setPixelRatio() {}

  setReducedMotion() {}

  applyEnvironment(env) {
    this.dayBlend = env.dayness;
    this.tint.copy(env.moonColor).multiplyScalar(0.55).lerp(this.dayTint, env.dayness);
    for (const layer of this.layers) {
      layer.material.opacity = layer.baseOpacity * (1 - env.dayness * 0.9);
      layer.material.color.copy(this.tint);
    }
  }

  update(dt, boatPosition) {
    for (const layer of this.layers) {
      layer.mesh.position.x = boatPosition.x;
      layer.mesh.position.z = boatPosition.z;
      layer.map.offset.x += dt * layer.speed;
      layer.map.offset.y += dt * layer.speed * 0.45;
    }
  }

  dispose() {
    for (const layer of this.layers) {
      layer.mesh.geometry.dispose();
      layer.material.dispose();
      layer.map.dispose();
    }
    this.baseTexture.dispose();
  }
}
