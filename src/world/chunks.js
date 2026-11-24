import * as THREE from 'three';
import { FLOWER_COLORS, WORLD } from '../core/config.js';
import { createLotusAssets, createLotusField } from './lotus.js';
import { createPadAssets, createPadField } from './lilypads.js';
import { createReedAssets, createReedField } from './reeds.js';
import { createLeafAssets, createLeafField } from './leaves.js';
import { makeVeinAtlas } from './textures.js';

const S = WORLD.chunkSize;
const TAU = Math.PI * 2;

const FLOWER_PALETTE = FLOWER_COLORS.map((flower) => ({
  ...flower,
  color: new THREE.Color(flower.hex),
  baseColor: new THREE.Color(flower.base),
}));

function pickStage(random) {
  const roll = random();
  if (roll < 0.12) return 0; // tight bud
  if (roll < 0.34) return 1; // half open
  if (roll < 0.9) return 2; // full bloom
  return 3; // spent pod and dry petals
}

function stageGlow(stage, random) {
  if (stage === 0) return 0.24 + random() * 0.16;
  if (stage === 1) return 0.48 + random() * 0.2;
  if (stage === 3) return 0.16 + random() * 0.12;
  return 0.65 + random() * 0.45;
}

const PAD_PALETTE = [0x1c3d2b, 0x244b33, 0x163421, 0x2a543b, 0x1f4330].map(
  (hex) => new THREE.Color(hex),
);

const REED_PALETTE = [0x2b5138, 0x365f42, 0x1f4130, 0x3c6a48].map(
  (hex) => new THREE.Color(hex),
);

const LEAF_PALETTE = [0x2e5a38, 0x3f6c43, 0x254b30, 0x4c7a4a].map(
  (hex) => new THREE.Color(hex),
);

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

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

function pickFlower(random) {
  const roll = random();
  let acc = 0;
  for (const flower of FLOWER_PALETTE) {
    acc += flower.weight;
    if (roll <= acc) return flower;
  }
  return FLOWER_PALETTE[0];
}

/** Uniforms shared by every flora material, so environment changes are one write. */
export function createFloraShared(ripples = null) {
  const atlas = makeVeinAtlas(512);
  const fallbackRipples = Array.from(
    { length: 8 },
    () => new THREE.Vector4(0, 0, 0, 0),
  );
  return {
    uTime: { value: 0 },
    uBoat: { value: new THREE.Vector2(0, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uReduced: { value: 0 },
    uGlow: { value: 1 },
    uFogColor: { value: new THREE.Color(0x091326) },
    uFogDensity: { value: WORLD.fogNight },
    uWind: { value: 1 },
    uNight: { value: 1 },
    uMoonColor: { value: new THREE.Color(0xd8e7ff) },
    uAtlas: { value: atlas.color },
    uAtlasNormal: { value: atlas.normal },
    uPetalCell: { value: new THREE.Vector2(atlas.cells.petal[0], atlas.cells.petal[1]) },
    uLeafCell: { value: new THREE.Vector2(atlas.cells.leaf[0], atlas.cells.leaf[1]) },
    uRipples: { value: ripples || fallbackRipples },
    atlas,
  };
}

export class ChunkManager {
  constructor(scene, shared, profile) {
    this.scene = scene;
    this.shared = shared;
    this.profile = profile;
    this.time = 0;
    this.boatX = 0;
    this.boatZ = 0;
    this.lodTimer = 0;
    this.lightCount = 0;

    this.group = new THREE.Group();
    this.group.name = 'flora-chunks';
    scene.add(this.group);

    this.assets = {
      lotus: createLotusAssets(shared),
      pads: createPadAssets(shared),
      reeds: createReedAssets(shared),
      leaves: createLeafAssets(shared),
    };

    this.chunks = new Map();
    this.lightSlots = Array.from({ length: 12 }, () => ({
      x: 0,
      z: 0,
      intensity: 0,
      radius: 1,
      color: new THREE.Color(),
    }));
    this.lightDists = new Float32Array(12);

    this.frustum = new THREE.Frustum();
    this.projection = new THREE.Matrix4();
    this.chunkSphere = new THREE.Sphere(new THREE.Vector3(), S * 0.78);

    // Seed the immediate neighbourhood so the first frame already has flowers.
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        this.buildChunk(dx, dz);
      }
    }
    this.applyLod(0, 0);
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  buildChunk(cx, cz) {
    const key = this.key(cx, cz);
    if (this.chunks.has(key)) return this.chunks.get(key);

    const random = mulberry32(hash2(cx, cz));
    const group = new THREE.Group();
    group.position.set(cx * S, 0, cz * S);
    group.name = `chunk-${key}`;

    const flowers = [];
    const flowerClusters = 6 + Math.floor(random() * 3);
    for (let c = 0; c < flowerClusters; c += 1) {
      const clusterX = 4 + random() * (S - 8);
      const clusterZ = 4 + random() * (S - 8);
      const clusterCount = 9 + Math.floor(random() * 7);

      for (let i = 0; i < clusterCount; i += 1) {
        for (let attempt = 0; attempt < 7; attempt += 1) {
          const angle = random() * TAU;
          const radius = Math.sqrt(random()) * 8.8;
          const x = clusterX + Math.cos(angle) * radius;
          const z = clusterZ + Math.sin(angle) * radius;
          if (x < 0.7 || x > S - 0.7 || z < 0.7 || z > S - 0.7) continue;

          let clear = true;
          for (let f = 0; f < flowers.length; f += 1) {
            const dx = flowers[f].x - x;
            const dz = flowers[f].z - z;
            if (dx * dx + dz * dz < 1.05) {
              clear = false;
              break;
            }
          }
          if (!clear) continue;

          const definition = pickFlower(random);
          const stage = pickStage(random);
          flowers.push({
            x,
            z,
            worldX: cx * S + x,
            worldZ: cz * S + z,
            rotation: random() * TAU,
            scale: 1.05 + random() * 0.75,
            color: definition.color,
            baseColor: definition.baseColor,
            stage,
            open: 0.88 + random() * 0.18,
            phase: random(),
            glow: stageGlow(stage, random),
          });
          break;
        }
      }
    }

    // A few loners between the clusters keep the field from looking gridded.
    const singles = 16 + Math.floor(random() * 10);
    for (let i = 0; i < singles; i += 1) {
      const x = 1 + random() * (S - 2);
      const z = 1 + random() * (S - 2);
      let clear = true;
      for (let f = 0; f < flowers.length; f += 1) {
        const dx = flowers[f].x - x;
        const dz = flowers[f].z - z;
        if (dx * dx + dz * dz < 1.2) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const definition = pickFlower(random);
      const stage = pickStage(random);
      flowers.push({
        x,
        z,
        worldX: cx * S + x,
        worldZ: cz * S + z,
        rotation: random() * TAU,
        scale: 1.0 + random() * 0.65,
        color: definition.color,
        baseColor: definition.baseColor,
        stage,
        open: 0.88 + random() * 0.18,
        phase: random(),
        glow: stageGlow(stage, random),
      });
    }

    // Guarantee a generous drift of flowers ahead of the starting point so the
    // first view is framed, without putting huge blossoms against the lens.
    const nearOrigin = (cx === 0 || cx === -1) && cz === 0;
    if (nearOrigin) {
      const anchorX = cx === 0 ? 9 : S - 9;
      for (let i = 0; i < 12; i += 1) {
        const angle = random() * TAU;
        const radius = 4 + random() * 7;
        const x = anchorX + Math.cos(angle) * radius;
        const z = 9 + Math.sin(angle) * radius;
        if (x < 0.7 || x > S - 0.7 || z < 2.5 || z > S - 0.7) continue;
        const worldX = cx * S + x;
        const worldZ = cz * S + z;
        if (worldX * worldX + worldZ * worldZ < 6.5 * 6.5) continue;
        const definition = pickFlower(random);
        const stage = pickStage(random);
        flowers.push({
          x,
          z,
          worldX,
          worldZ,
          rotation: random() * TAU,
          scale: 1.1 + random() * 0.45,
          color: definition.color,
          baseColor: definition.baseColor,
          stage,
          open: 0.9 + random() * 0.16,
          phase: random(),
          glow: stageGlow(stage, random),
        });
      }
    }

    const pads = [];
    const padCount = 24 + Math.floor(random() * 18);
    for (let i = 0; i < padCount; i += 1) {
      pads.push({
        x: 1 + random() * (S - 2),
        z: 1 + random() * (S - 2),
        scale: 0.28 + random() * 0.5,
        stretch: 0.88 + random() * 0.28,
        rotation: random() * TAU,
        phase: random(),
        color: PAD_PALETTE[Math.floor(random() * PAD_PALETTE.length)],
      });
    }

    if (cx >= -1 && cx <= 0 && cz >= -1 && cz <= 0) {
      const anchorX = cx === 0 ? 9 : S - 9;
      const anchorZ = cz === 0 ? 9 : S - 9;
      for (let i = 0; i < 8; i += 1) {
        const angle = random() * TAU;
        const radius = 2.5 + random() * 5.5;
        const x = anchorX + Math.cos(angle) * radius;
        const z = anchorZ + Math.sin(angle) * radius;
        if (x < 0.5 || x > S - 0.5 || z < 0.5 || z > S - 0.5) continue;
        if (x * x + z * z < 4 * 4) continue;
        pads.push({
          x,
          z,
          scale: 0.2 + random() * 0.26,
          stretch: 0.9 + random() * 0.22,
          rotation: random() * TAU,
          phase: random(),
          color: PAD_PALETTE[Math.floor(random() * PAD_PALETTE.length)],
        });
      }
    }

    const clusters = [];
    const reedCount = 1 + Math.floor(random() * 3);
    for (let i = 0; i < reedCount; i += 1) {
      clusters.push({
        x: 2 + random() * (S - 4),
        z: 2 + random() * (S - 4),
        scale: 0.8 + random() * 0.55,
        rotation: random() * TAU,
        phase: random(),
        color: REED_PALETTE[Math.floor(random() * REED_PALETTE.length)],
      });
    }

    const leafData = [];
    const leafCount = 3 + Math.floor(random() * 4);
    for (let i = 0; i < leafCount; i += 1) {
      const x = 2 + random() * (S - 4);
      const z = 2 + random() * (S - 4);
      const worldX = cx * S + x;
      const worldZ = cz * S + z;
      if (worldX * worldX + worldZ * worldZ < 5.5 * 5.5) continue;
      leafData.push({
        x,
        z,
        rotation: random() * TAU,
        scale: 0.72 + random() * 0.62,
        phase: random(),
        color: LEAF_PALETTE[Math.floor(random() * LEAF_PALETTE.length)],
      });
    }

    const lotus = createLotusField(this.assets.lotus, flowers);
    const padField = createPadField(this.assets.pads, pads);
    const reedField = createReedField(this.assets.reeds, clusters);
    const leafField = createLeafField(this.assets.leaves, leafData);
    group.add(lotus.group, padField.group, reedField.group, leafField.group);

    this.group.add(group);

    const sphere = new THREE.Sphere(
      new THREE.Vector3(cx * S + S / 2, 0, cz * S + S / 2),
      S * 0.74,
    );

    const chunk = {
      key,
      cx,
      cz,
      group,
      lotus,
      pads: padField,
      reeds: reedField,
      leaves: leafField,
      flowers,
      sphere,
      counts: {
        flowers: lotus.count,
        pads: padField.count,
        reeds: reedField.count,
        leaves: leafField.count,
      },
      visible: true,
    };

    this.chunks.set(key, chunk);
    this.applyLodToChunk(chunk);
    return chunk;
  }

  disposeChunk(chunk) {
    this.group.remove(chunk.group);
    const fields = [
      chunk.lotus.meshes.high,
      chunk.lotus.meshes.mid,
      chunk.lotus.meshes.low,
      chunk.lotus.glow,
      chunk.pads.mesh,
      chunk.reeds.mesh,
    ];
    if (chunk.leaves) fields.push(chunk.leaves.meshes.high, chunk.leaves.meshes.low);
    for (const field of fields) {
      if (field && field.geometry) field.geometry.dispose();
      if (field && field.dispose) field.dispose();
    }
    this.chunks.delete(chunk.key);
  }

  ensureChunks(cx, cz) {
    const radius = WORLD.viewRadius;
    const missing = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const key = this.key(cx + dx, cz + dz);
        if (!this.chunks.has(key)) missing.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
      }
    }
    if (missing.length === 0) return;
    missing.sort((a, b) => a.d - b.d);
    const budget = Math.min(missing.length, 2);
    for (let i = 0; i < budget; i += 1) {
      this.buildChunk(missing[i].cx, missing[i].cz);
    }
  }

  applyLodToChunk(chunk) {
    if (!chunk) return;
    const dist = Math.hypot(
      (chunk.cx + 0.5) * S - this.boatX,
      (chunk.cz + 0.5) * S - this.boatZ,
    );
    const realism = this.profile.realism ?? 1;
    let level = dist < 30 ? 0 : dist < 62 ? 1 : 2;
    if (realism < 0.62) level = Math.max(1, level);
    if (realism < 0.45 && dist > 34) level = 2;
    chunk.lod = level;
    chunk.lotus.setLod(level, Boolean(this.profile.cheapFlora) || level === 2);

    const density = this.profile.flowerDensity ?? 1;
    const glowDensity = this.profile.glowDensity ?? 1;
    const levelDensity = level === 0 ? 1 : level === 1 ? 0.8 : 0.55;
    const flowerCount = Math.max(
      0,
      Math.min(
        chunk.counts.flowers,
        Math.floor(chunk.counts.flowers * density * levelDensity),
      ),
    );
    for (const quality of ['high', 'mid', 'low']) {
      chunk.lotus.meshes[quality].count = flowerCount;
    }
    chunk.lotus.glow.count = Math.min(
      chunk.counts.flowers,
      Math.floor(flowerCount * glowDensity * (level === 2 ? 0.6 : 1)),
    );
    chunk.pads.mesh.count = Math.max(
      0,
      Math.min(
        chunk.counts.pads,
        Math.floor(
          chunk.counts.pads *
            (level === 2 ? 0.62 : 1) *
            (this.profile.leafDensity ?? 1),
        ),
      ),
    );
    chunk.reeds.mesh.count = chunk.counts.reeds;
    if (chunk.leaves) {
      chunk.leaves.setLod(level, Boolean(this.profile.cheapFlora));
      const leafCount = Math.max(
        0,
        Math.floor(chunk.leaves.count * (level === 2 ? 0.5 : 1)),
      );
      chunk.leaves.meshes.high.count = leafCount;
      chunk.leaves.meshes.low.count = leafCount;
    }
  }

  applyLod() {
    for (const chunk of this.chunks.values()) this.applyLodToChunk(chunk);
  }

  updateVisibility(camera, cx, cz) {
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const radius = WORLD.viewRadius;

    for (const chunk of this.chunks.values()) {
      const dx = chunk.cx - cx;
      const dz = chunk.cz - cz;
      if (Math.abs(dx) > radius + 1 || Math.abs(dz) > radius + 1) {
        this.disposeChunk(chunk);
        continue;
      }
      chunk.group.visible = this.frustum.intersectsSphere(chunk.sphere);
      chunk.visible = chunk.group.visible;
    }
  }

  sampleLights(boat) {
    const max = Math.min(this.profile.waterLights, this.lightSlots.length);
    const slots = this.lightSlots;
    const dists = this.lightDists;
    const cx = Math.floor(boat.x / S);
    const cz = Math.floor(boat.z / S);
    let count = 0;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const chunk = this.chunks.get(this.key(cx + dx, cz + dz));
        if (!chunk) continue;
        const flowers = chunk.flowers;
        for (let i = 0; i < flowers.length; i += 1) {
          const f = flowers[i];
          const ox = f.worldX - boat.x;
          const oz = f.worldZ - boat.z;
          const d2 = ox * ox + oz * oz;
          if (d2 > 46 * 46) continue;

          if (count < max) {
            const slot = slots[count];
            slot.x = f.worldX;
            slot.z = f.worldZ;
            slot.color.copy(f.color);
            slot.radius = f.scale;
            const fade = 1 - Math.sqrt(d2) / 46;
            const stageFactor = f.stage === 3 ? 0.24 : f.stage === 0 ? 0.45 : f.stage === 1 ? 0.72 : 1;
            slot.intensity = f.glow * f.scale * 0.85 * fade * fade * stageFactor;
            dists[count] = d2;
            count += 1;
          } else {
            let worst = -1;
            let worstIndex = -1;
            for (let j = 0; j < count; j += 1) {
              if (dists[j] > worst) {
                worst = dists[j];
                worstIndex = j;
              }
            }
            if (worstIndex >= 0 && d2 < worst) {
              const slot = slots[worstIndex];
              slot.x = f.worldX;
              slot.z = f.worldZ;
              slot.color.copy(f.color);
              slot.radius = f.scale;
              const fade = 1 - Math.sqrt(d2) / 46;
              const stageFactor = f.stage === 3 ? 0.24 : f.stage === 0 ? 0.45 : f.stage === 1 ? 0.72 : 1;
              slot.intensity = f.glow * f.scale * 0.85 * fade * fade * stageFactor;
              dists[worstIndex] = d2;
            }
          }
        }
      }
    }
    this.lightCount = count;
  }

  applyEnvironment(env) {
    this.shared.uGlow.value = env.flowerGlow;
    this.shared.uFogColor.value.copy(env.fog);
    this.shared.uFogDensity.value = env.fogDensity;
    this.shared.uMoonDir.value.copy(env.moonDir);
    this.shared.uNight.value = 1 - env.dayness;
    this.shared.uMoonColor.value.copy(env.moonColor);
  }

  setQuality(profile) {
    this.profile = profile;
    this.applyLod();
  }

  update(dt, boatPosition, camera) {
    this.time += dt;
    this.boatX = boatPosition.x;
    this.boatZ = boatPosition.z;

    this.shared.uTime.value = this.time;
    this.shared.uBoat.value.set(boatPosition.x, boatPosition.z);

    const cx = Math.floor(boatPosition.x / S);
    const cz = Math.floor(boatPosition.z / S);
    this.ensureChunks(cx, cz);

    this.lodTimer += dt;
    if (this.lodTimer > 0.25) {
      this.applyLod(cx, cz);
      this.lodTimer = 0;
    }

    this.updateVisibility(camera, cx, cz);
    this.sampleLights(boatPosition);
  }

  setReducedMotion(reduced) {
    this.shared.uReduced.value = reduced ? 1 : 0;
  }

  dispose() {
    for (const chunk of [...this.chunks.values()]) this.disposeChunk(chunk);
    this.scene.remove(this.group);
    this.assets.lotus.geometries.high.dispose();
    this.assets.lotus.geometries.mid.dispose();
    this.assets.lotus.geometries.low.dispose();
    this.assets.pads.geometry.dispose();
    this.assets.reeds.geometry.dispose();
    this.assets.lotus.material.dispose();
    this.assets.lotus.cheapMaterial.dispose();
    this.assets.lotus.glowMaterial.dispose();
    this.assets.lotus.glowGeometry.dispose();
    this.assets.pads.material.dispose();
    this.assets.reeds.material.dispose();
    this.assets.leaves.geometries.high.dispose();
    this.assets.leaves.geometries.low.dispose();
    this.assets.leaves.material.dispose();
    if (this.shared.atlas) {
      this.shared.atlas.color.dispose();
      this.shared.atlas.normal.dispose();
    }
  }
}
