import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, smoothstep } from '../core/math.js';
import { waveHeight } from '../world/waves.js';
import {
  makeClothMaps,
  makeFoamTexture,
  makeGlowTexture,
  makePaperMaps,
  makeShadowTexture,
  makeWoodMaps,
} from '../world/textures.js';
import { Boatman } from './boatman.js';

const LENGTH = 3.5;
const BEAM = 1.24;
const DEPTH = 0.52;
const STATIONS = 22;
const GIRTH = 12;
const TAU = Math.PI * 2;

function station(t) {
  return {
    z: (t - 0.5) * LENGTH,
    width: Math.sin(Math.PI * Math.pow(t, 0.84)) * BEAM * 0.5,
    depth: Math.pow(Math.sin(Math.PI * t), 0.62) * DEPTH,
    lift: 0.03 + Math.pow(Math.abs(t - 0.5) * 2, 2.5) * 0.35,
  };
}

function hullPoint(t, u, offset = 0) {
  const st = station(t);
  const theta = (u - 0.5) * Math.PI;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const x = sin * st.width;
  const y = -st.depth * Math.pow(Math.max(0, cos), 0.92) + st.lift * sin * sin;
  if (offset !== 0) {
    const len = Math.hypot(st.width, st.depth) + 0.001;
    const nx = (sin / Math.max(st.width, 0.001)) * (st.width / len);
    const ny = (-cos / Math.max(st.depth, 0.001)) * (st.depth / len);
    const n = Math.hypot(nx, ny) || 1;
    return new THREE.Vector3(x + (nx / n) * offset, y + (ny / n) * offset, st.z);
  }
  return new THREE.Vector3(x, y, st.z);
}

function thetaAtY(t, y) {
  const st = station(t);
  if (y >= st.lift) return Math.PI / 2;
  if (y <= -st.depth) return 0;
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) * 0.5;
    const yy = -st.depth * Math.pow(Math.cos(mid), 0.92) + st.lift * Math.sin(mid) * Math.sin(mid);
    if (yy < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

function buildHullGeometry(girth = GIRTH) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= STATIONS; i += 1) {
    const t = i / STATIONS;
    for (let j = 0; j <= girth; j += 1) {
      const u = j / girth;
      const p = hullPoint(t, u);
      positions.push(p.x, p.y, p.z);
      uvs.push(u * 2.4, t * 2.4);
    }
  }
  for (let i = 0; i < STATIONS; i += 1) {
    for (let j = 0; j < girth; j += 1) {
      const a = i * (girth + 1) + j;
      const b = a + 1;
      const c = a + girth + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeAll(list) {
  if (!list.length) return new THREE.BufferGeometry();
  const prepared = [];
  for (const geometry of list) {
    prepared.push(geometry.index ? geometry.toNonIndexed() : geometry);
  }
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) {
    if (!list.includes(geometry)) geometry.dispose();
  }
  for (const geometry of list) geometry.dispose();
  if (!merged) {
    console.warn('Lotus Drift: a boat detail failed to merge; using a fallback.');
    return new THREE.BufferGeometry();
  }
  merged.computeVertexNormals();
  return merged;
}

function tubeBetween(start, end, radius, material, segments = 6) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 5, 1),
    material,
  );
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function ribbon(t0, t1, v0, v1, sign, offset0, offset1) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const t = t0 + (t1 - t0) * (i / steps);
    const uLower = 0.5 + sign * 0.5 * v0;
    const uUpper = 0.5 + sign * 0.5 * v1;
    const lower = hullPoint(t, uLower, offset0);
    const upper = hullPoint(t, uUpper, offset1);
    positions.push(lower.x, lower.y, lower.z, upper.x, upper.y, upper.z);
    uvs.push((t - t0) * 4.2, 0, (t - t0) * 4.2, 1);
  }
  for (let i = 0; i < steps; i += 1) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildWetBand() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = [0.08, -0.18];
  for (let side = 0; side < 2; side += 1) {
    const sign = side === 0 ? 1 : -1;
    const start = positions.length / 3;
    for (let i = 0; i <= STATIONS; i += 1) {
      const t = i / STATIONS;
      for (const y of rows) {
        const theta = thetaAtY(t, y);
        const st = station(t);
        const x = sign * (Math.sin(theta) * st.width + 0.029);
        positions.push(x, y, st.z);
        uvs.push(t * 5, y > 0 ? 1 : 0);
      }
    }
    for (let i = 0; i < STATIONS; i += 1) {
      const a = start + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCanopyGeometry(radius = 0.82, height = 0.35) {
  const segments = 28;
  const rings = 5;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r <= rings; r += 1) {
    const q = r / rings;
    const ringRadius = q * radius;
    const y = height * (1 - Math.pow(q, 1.5)) - q * q * 0.025;
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * TAU;
      const scallop = 1 + Math.sin(a * 14) * 0.012 * q;
      positions.push(
        Math.cos(a) * ringRadius * scallop,
        y + (r === rings ? Math.sin(a * 14) * 0.006 : 0),
        Math.sin(a) * ringRadius * scallop,
      );
      uvs.push(i / segments, q);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = r * (segments + 1) + i;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class Boat {
  constructor(profile = null) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.group.name = 'boat';
    this.profile = profile;
    this.strokeKick = 0;
    this.lanternSwing = 0;
    this.boatmanVisible = true;
    this.oarEvents = [];
    this.fineDetails = [];
    this.heave = 0;
    this.heaveVel = 0;
    this.roll = 0;
    this.rollVel = 0;
    this.pitch = 0;
    this.pitchVel = 0;
    this._lastStrokePhase = 0;

    this.woodMaps = makeWoodMaps(512);
    this.clothMaps = makeClothMaps(256);
    this.paperMaps = makePaperMaps(256);
    this.glowTexture = makeGlowTexture();
    this.foamTexture = makeFoamTexture(256);
    this.shadowTexture = makeShadowTexture();

    this.buildMaterials();
    this.buildHull();
    this.buildDeckDetails();
    this.buildUmbrella();
    this.buildLantern();
    this.buildBowWave();

    this.boatman = new Boatman({
      woodMaps: this.woodMaps,
      clothMaps: this.clothMaps,
      foamTexture: this.foamTexture,
      trimMaterial: this.trimMaterial,
      darkWoodMaterial: this.darkWoodMaterial,
    });
    this.group.add(this.boatman.group);

    this.crewLight = new THREE.PointLight(0xffbd78, 1.6, 5.0, 2);
    this.crewLight.position.set(0.16, 0.92, -0.36);
    this.group.add(this.crewLight);

    // A cool stern key reveals the outside planks and the rower's back
    // without flattening the lantern-lit silhouette.
    this.sternKey = new THREE.DirectionalLight(0xb9cfdf, 1.1);
    this.sternKey.position.set(0.0, 3.4, -5.5);
    this.sternKey.target.position.set(0.0, 0.3, -0.4);
    this.group.add(this.sternKey, this.sternKey.target);

    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 5.6),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        color: 0x000000,
      }),
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.015;
    this.contactShadow.renderOrder = 2;
    this.group.add(this.contactShadow);

    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
  }

  buildMaterials() {
    this.hullBackingMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      color: 0x5b402a,
      roughness: 0.91,
      metalness: 0.02,
      side: THREE.DoubleSide,
      emissive: 0x5a3c24,
      emissiveIntensity: 1.2,
    });
    this.plankMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      normalMap: this.woodMaps.normal,
      roughnessMap: this.woodMaps.roughness,
      color: 0xd7b48d,
      roughness: 0.72,
      metalness: 0.025,
      side: THREE.DoubleSide,
      emissive: 0x7a502c,
      emissiveIntensity: 1.4,
    });
    this.plankEdgeMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      normalMap: this.woodMaps.normal,
      color: 0xd0a46e,
      roughness: 0.5,
      metalness: 0.03,
      emissive: 0x5a3818,
      emissiveIntensity: 0.9,
    });
    this.ribMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      normalMap: this.woodMaps.normal,
      roughnessMap: this.woodMaps.roughness,
      color: 0x9a704b,
      roughness: 0.6,
      metalness: 0.03,
      emissive: 0x2a1a0c,
      emissiveIntensity: 0.4,
    });
    this.innerPlankMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      normalMap: this.woodMaps.normal,
      roughnessMap: this.woodMaps.roughness,
      color: 0xc29b70,
      roughness: 0.8,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    this.trimMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      normalMap: this.woodMaps.normal,
      roughnessMap: this.woodMaps.roughness,
      color: 0xa77f55,
      roughness: 0.64,
      metalness: 0.03,
    });
    this.darkWoodMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      color: 0x4a3423,
      roughness: 0.82,
      metalness: 0.03,
    });
    this.tarMaterial = new THREE.MeshStandardMaterial({
      color: 0x16120e,
      roughness: 0.38,
      metalness: 0.08,
    });
    this.wetMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      normalMap: this.woodMaps.normal,
      color: 0x3a2718,
      roughness: 0.12,
      metalness: 0.12,
      side: THREE.DoubleSide,
      emissive: 0x0a1418,
      emissiveIntensity: 0.55,
    });
    this.waterlineMaterial = new THREE.MeshBasicMaterial({
      color: 0xa9d8d8,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x292723,
      roughness: 0.4,
      metalness: 0.62,
    });
    this.matMaterial = new THREE.MeshStandardMaterial({
      map: this.clothMaps.color,
      normalMap: this.clothMaps.normal,
      color: 0x1e150d,
      roughness: 1.0,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.ropeMaterial = new THREE.MeshStandardMaterial({
      color: 0x8e7251,
      roughness: 0.95,
      metalness: 0,
    });
    this.bambooMaterial = new THREE.MeshStandardMaterial({
      map: this.woodMaps.color,
      normalMap: this.woodMaps.normal,
      color: 0xbfae72,
      roughness: 0.55,
      metalness: 0.02,
    });
    this.paperMaterial = new THREE.MeshStandardMaterial({
      map: this.paperMaps.color,
      normalMap: this.paperMaps.normal,
      color: 0xf1d7af,
      roughness: 0.91,
      metalness: 0,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      emissive: 0x3d2a15,
      emissiveIntensity: 0.5,
      depthWrite: false,
    });
    this.canopyMaterial = this.paperMaterial.clone();
    this.canopyMaterial.color.setHex(0xf0d7b3);
    this.canopyMaterial.opacity = 0.9;
    this.canopyMaterial.emissive.setHex(0x3b2914);
    this.canopyMaterial.emissiveIntensity = 0.72;
    this.lanternPaperMaterial = this.paperMaterial.clone();
    this.lanternPaperMaterial.color.setHex(0xffd7a0);
    this.lanternPaperMaterial.opacity = 0.46;
    this.lanternPaperMaterial.emissiveIntensity = 1.6;
    this.lanternPaperMaterial.side = THREE.DoubleSide;
    this.foamMaterial = new THREE.MeshBasicMaterial({
      map: this.foamTexture,
      color: 0xc9e8e1,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
  }

  buildHull() {
    const hull = new THREE.Mesh(buildHullGeometry(), this.hullBackingMaterial);
    hull.name = 'planked-hull-backing';
    this.group.add(hull);

    const planks = [];
    const innerPlanks = [];
    const seams = [];
    const plankEdges = [];
    for (const sign of [-1, 1]) {
      const strakes = 6;
      for (let s = 0; s < strakes; s += 1) {
        const v0 = s / strakes;
        const v1 = (s + 1) / strakes;
        const tGap = 0.008 + (s % 2) * 0.003;
        const split = 0.5;
        for (let k = 0; k < 2; k += 1) {
          const t0 = Math.max(0.005, k * split + tGap);
          const t1 = Math.min(0.995, (k + 1) * split - tGap);
          const lowerOffset = 0.022 - v0 * 0.008;
          const upperOffset = 0.014 - v1 * 0.006;
          planks.push(ribbon(t0, t1, v0 + 0.004, v1 - 0.004, sign, lowerOffset, upperOffset));
          innerPlanks.push(ribbon(t0, t1, v0 + 0.005, v1 - 0.005, sign, -0.011, -0.011));
        }

        const boundary = v1;
        if (s < strakes - 1) {
          const points = [];
          for (let i = 0; i <= 12; i += 1) {
            const t = 0.015 + (i / 12) * 0.97;
            const p = hullPoint(t, 0.5 + sign * 0.5 * boundary, 0.024);
            points.push(p);
          }
          const curve = new THREE.CatmullRomCurve3(points);
          seams.push(new THREE.TubeGeometry(curve, 28, 0.0075, 4, false));

          const edgePoints = [];
          for (let i = 0; i <= 12; i += 1) {
            const t = 0.015 + (i / 12) * 0.97;
            const p = hullPoint(t, 0.5 + sign * 0.5 * boundary, 0.026);
            edgePoints.push(p);
          }
          plankEdges.push(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(edgePoints),
              28,
              0.0055,
              4,
              false,
            ),
          );

          const innerPoints = [];
          for (let i = 0; i <= 12; i += 1) {
            const t = 0.015 + (i / 12) * 0.97;
            const p = hullPoint(t, 0.5 + sign * 0.5 * boundary, -0.014);
            innerPoints.push(p);
          }
          const innerCurve = new THREE.CatmullRomCurve3(innerPoints);
          seams.push(new THREE.TubeGeometry(innerCurve, 28, 0.0055, 4, false));
        }
      }
    }

    this.group.add(new THREE.Mesh(mergeAll(planks), this.plankMaterial));
    this.group.add(new THREE.Mesh(mergeAll(plankEdges), this.plankEdgeMaterial));
    this.group.add(new THREE.Mesh(mergeAll(innerPlanks), this.innerPlankMaterial));
    this.group.add(new THREE.Mesh(mergeAll(seams), this.tarMaterial));

    // Curved internal frames make the hull read as a built wooden boat, not a
    // single moulded shell.
    const ribs = [];
    for (let i = 0; i < 7; i += 1) {
      const t = 0.08 + (i / 6) * 0.84;
      const points = [];
      for (let j = 0; j <= 16; j += 1) {
        const u = j / 16;
        const p = hullPoint(t, u, -0.028);
        p.y += 0.018;
        points.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(points);
      ribs.push(new THREE.TubeGeometry(curve, 22, 0.023, 5, false));
    }
    const ribMesh = new THREE.Mesh(mergeAll(ribs), this.ribMaterial);
    ribMesh.name = 'hull-ribs';
    this.group.add(ribMesh);

    const rails = [];
    for (const sign of [-1, 1]) {
      const points = [];
      for (let i = 0; i <= 20; i += 1) {
        const t = i / 20;
        const u = sign > 0 ? 1 : 0;
        const p = hullPoint(t, u, 0.006);
        points.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(points);
      rails.push(new THREE.TubeGeometry(curve, 42, 0.041, 6, false));
    }
    const railMesh = new THREE.Mesh(mergeAll(rails), this.trimMaterial);
    railMesh.name = 'gunwale';
    this.group.add(railMesh);

    const posts = [];
    for (const end of [0, 1]) {
      const z = (end === 0 ? -1 : 1) * (LENGTH * 0.5 + 0.02);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.22, z),
        new THREE.Vector3(0, 0.12, z + (end === 0 ? -0.03 : 0.03)),
        new THREE.Vector3(0, 0.58, z + (end === 0 ? -0.08 : 0.08)),
        new THREE.Vector3(0, 0.8, z + (end === 0 ? -0.16 : 0.16)),
      ]);
      posts.push(new THREE.TubeGeometry(curve, 20, 0.043, 6, false));
    }
    this.group.add(new THREE.Mesh(mergeAll(posts), this.trimMaterial));

    // The wet belt is deliberately a separate, glossier surface. It is dark
    // and reflective from the waterline to roughly 0.15 m above it.
    const wet = new THREE.Mesh(buildWetBand(), this.wetMaterial);
    wet.name = 'wet-waterline';
    this.group.add(wet);

    const highlights = [];
    for (const sign of [-1, 1]) {
      const points = [];
      for (let i = 0; i <= 20; i += 1) {
        const t = i / 20;
        const st = station(t);
        const theta = thetaAtY(t, -0.055);
        points.push(
          new THREE.Vector3(
            sign * (Math.sin(theta) * st.width + 0.032),
            -0.055,
            st.z,
          ),
        );
      }
      highlights.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, 0.0035, 4, false),
      );
    }
    const highlight = new THREE.Mesh(mergeAll(highlights), this.waterlineMaterial);
    this.group.add(highlight);
  }

  buildDeckDetails() {
    const floorboards = [];
    for (let i = 0; i < 4; i += 1) {
      const board = new THREE.BoxGeometry(0.2, 0.028, 1.95);
      board.translate(-0.3 + i * 0.2, -0.15, -0.02);
      floorboards.push(board);
    }
    this.group.add(new THREE.Mesh(mergeAll(floorboards), this.darkWoodMaterial));

    const seats = [];
    const seatData = [
      { z: 0.48, width: 0.9 },
      { z: -0.82, width: 0.82 },
    ];
    for (const data of seatData) {
      const seat = new THREE.BoxGeometry(data.width, 0.06, 0.29);
      seat.translate(0, 0.13, data.z);
      seats.push(seat);
      for (const side of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.055, 0.24, 0.12);
        leg.translate(side * data.width * 0.36, 0.0, data.z);
        seats.push(leg);
      }
    }
    const seatMesh = new THREE.Mesh(mergeAll(seats), this.trimMaterial);
    seatMesh.name = 'thwart-seats';
    this.group.add(seatMesh);

    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 1.5, 1, 1),
      this.matMaterial,
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, -0.132, -0.08);
    this.group.add(mat);

    // A woven mat has a visible border and a couple of darker worn strips.
    const border = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.35, -0.128, -0.83),
          new THREE.Vector3(0.35, -0.128, -0.83),
          new THREE.Vector3(0.35, -0.128, 0.67),
          new THREE.Vector3(-0.35, -0.128, 0.67),
          new THREE.Vector3(-0.35, -0.128, -0.83),
        ]),
        20,
        0.008,
        4,
        true,
      ),
      this.ropeMaterial,
    );
    this.group.add(border);

    const coil = new THREE.Group();
    coil.position.set(-0.33, 0.075, -1.28);
    const coil1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.017, 5, 22),
      this.ropeMaterial,
    );
    coil1.rotation.x = Math.PI / 2;
    coil.add(coil1);
    const coil2 = coil1.clone();
    coil2.scale.setScalar(0.78);
    coil2.rotation.z = 0.25;
    coil2.position.y = 0.035;
    coil.add(coil2);
    const ropeTail = tubeBetween(
      new THREE.Vector3(-0.2, 0.06, -1.22),
      new THREE.Vector3(0.05, 0.04, -1.02),
      0.014,
      this.ropeMaterial,
      5,
    );
    coil.add(ropeTail);
    this.group.add(coil);
    this.ropeCoil = coil;

    const bamboo = new THREE.Group();
    bamboo.position.set(-0.45, 0.07, -0.12);
    bamboo.rotation.y = 0.03;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.032, 2.15, 7),
      this.bambooMaterial,
    );
    pole.rotation.x = Math.PI / 2;
    pole.position.z = 0.05;
    bamboo.add(pole);
    for (let i = 0; i < 5; i += 1) {
      const node = new THREE.Mesh(
        new THREE.TorusGeometry(0.033, 0.006, 4, 9),
        this.ropeMaterial,
      );
      node.rotation.y = Math.PI / 2;
      node.position.set(0, 0, -0.8 + i * 0.4);
      node.rotation.x = Math.PI / 2;
      bamboo.add(node);
    }
    this.group.add(bamboo);
    this.bambooPole = bamboo;
    this.fineDetails.push(bamboo);

    // Worn repair patches: small darker rectangles stitched onto the hull.
    for (let i = 0; i < 2; i += 1) {
      const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.09),
        new THREE.MeshStandardMaterial({
          map: this.woodMaps.color,
          color: 0x4e3522,
          roughness: 0.9,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
      );
      patch.position.set(i === 0 ? -0.58 : 0.59, 0.05, i === 0 ? 0.35 : -0.1);
      patch.rotation.y = (i === 0 ? 1 : -1) * 0.16;
      this.group.add(patch);
      this.fineDetails.push(patch);
    }

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.06, 0.38),
      this.trimMaterial,
    );
    deck.position.set(0.28, 0.14, 1.15);
    this.group.add(deck);
  }

  buildUmbrella() {
    const umbrella = new THREE.Group();
    umbrella.position.set(-0.54, 0, 0.42);
    umbrella.name = 'umbrella';

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.03, 1.68, 8),
      this.bambooMaterial,
    );
    pole.position.y = 0.84;
    umbrella.add(pole);

    const canopy = new THREE.Mesh(buildCanopyGeometry(), this.canopyMaterial);
    canopy.position.y = 1.58;
    canopy.renderOrder = 1;
    umbrella.add(canopy);

    // Ribs are visible through the oiled paper, and their slight bow gives the
    // canopy a hand-built asymmetry.
    const ribs = [];
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * TAU;
      const points = [
        new THREE.Vector3(0, 1.94, 0),
        new THREE.Vector3(Math.cos(angle) * 0.3, 1.88, Math.sin(angle) * 0.3),
        new THREE.Vector3(Math.cos(angle) * 0.68, 1.68, Math.sin(angle) * 0.68),
        new THREE.Vector3(Math.cos(angle) * 0.81, 1.53, Math.sin(angle) * 0.81),
      ];
      ribs.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.008, 4, false),
      );
    }
    const ribMesh = new THREE.Mesh(mergeAll(ribs), this.darkWoodMaterial);
    umbrella.add(ribMesh);

    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          Array.from({ length: 29 }, (_, i) => {
            const a = (i / 28) * TAU;
            return new THREE.Vector3(Math.cos(a) * 0.82, 1.535, Math.sin(a) * 0.82);
          }),
        ),
        28,
        0.009,
        4,
        true,
      ),
      this.bambooMaterial,
    );
    umbrella.add(rim);

    const finial = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      this.metalMaterial,
    );
    finial.position.y = 1.96;
    umbrella.add(finial);

    this.umbrella = umbrella;
    this.group.add(umbrella);
  }

  buildLantern() {
    const crook = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.28, 0.17, 1.15),
      new THREE.Vector3(0.34, 0.9, 1.12),
      new THREE.Vector3(0.38, 1.25, 1.04),
      new THREE.Vector3(0.38, 1.25, 0.96),
    ]);
    this.group.add(
      new THREE.Mesh(new THREE.TubeGeometry(crook, 26, 0.019, 5, false), this.metalMaterial),
    );

    const lantern = new THREE.Group();
    lantern.position.set(0.38, 1.22, 0.96);
    lantern.name = 'lantern';
    this.lantern = lantern;

    const hanger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4),
      this.metalMaterial,
    );
    hanger.position.y = -0.06;
    lantern.add(hanger);

    const paper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.27, 12, 1, true),
      this.lanternPaperMaterial,
    );
    paper.position.y = -0.28;
    lantern.add(paper);

    const topCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.135, 0.025, 12),
      this.darkWoodMaterial,
    );
    topCap.position.y = -0.145;
    lantern.add(topCap);
    const bottomCap = topCap.clone();
    bottomCap.position.y = -0.415;
    lantern.add(bottomCap);

    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU;
      const rib = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.265, 3),
        this.darkWoodMaterial,
      );
      rib.position.set(Math.cos(angle) * 0.128, -0.28, Math.sin(angle) * 0.128);
      lantern.add(rib);
    }

    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    coreMaterial.color.setRGB(2.2, 1.25, 0.5);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), coreMaterial);
    core.scale.set(1, 1.35, 1);
    core.position.y = -0.3;
    lantern.add(core);
    this.lanternCoreMaterial = coreMaterial;

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.042, 0.17, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
    );
    flame.position.y = -0.3;
    flame.rotation.z = 0.12;
    lantern.add(flame);
    this.flame = flame;

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xffbc72,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    halo.scale.setScalar(3.2);
    halo.position.y = -0.29;
    lantern.add(halo);

    const innerHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xfff0cc,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    innerHalo.scale.setScalar(1.25);
    innerHalo.position.y = -0.29;
    lantern.add(innerHalo);

    const light = new THREE.PointLight(0xffb066, 8, 20, 2);
    light.position.y = -0.28;
    lantern.add(light);

    this.lanternLight = light;
    this.lanternHalo = halo;
    this.lanternInner = innerHalo;
    this.group.add(lantern);

    const waterGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 3.8),
      new THREE.MeshBasicMaterial({
        map: this.glowTexture,
        color: 0xffb672,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    waterGlow.rotation.x = -Math.PI / 2;
    waterGlow.position.set(0.38, 0.035, 0.98);
    waterGlow.renderOrder = 2;
    this.waterGlow = waterGlow;
    this.group.add(waterGlow);
  }

  buildBowWave() {
    this.bowFoam = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), this.foamMaterial);
    this.bowFoam.rotation.x = -Math.PI / 2;
    this.bowFoam.position.set(0, 0.026, 1.68);
    this.bowFoam.renderOrder = 3;
    this.group.add(this.bowFoam);

    this.sternFoam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), this.foamMaterial);
    this.sternFoam.rotation.x = -Math.PI / 2;
    this.sternFoam.position.set(0, 0.026, -1.7);
    this.sternFoam.renderOrder = 3;
    this.group.add(this.sternFoam);
  }

  onStroke() {
    this.strokeKick = 1;
    this.heaveVel += 0.05;
    this.pitchVel -= 0.07;
  }

  setBoatmanVisible(visible) {
    this.boatmanVisible = visible;
    this.boatman.setVisible(visible);
  }

  applyQuality(profile) {
    this.profile = profile;
    if (!profile) return;
    this.boatman.setDetail(Boolean(profile.boatmanDetail));
    for (const detail of this.fineDetails) detail.visible = profile.realism > 0.48;
    this.crewLight.visible = profile.realism > 0.42;
  }

  consumeOarEvents() {
    if (this.oarEvents.length === 0) return this.oarEvents;
    const result = this.oarEvents;
    this.oarEvents = [];
    return result;
  }

  update(dt, state, env, time, reduced, nearestFlower = null) {
    if (dt > 0.1) dt = 0.1;
    const motion = reduced ? 0.5 : 1;
    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    const rx = Math.cos(state.heading);
    const rz = -Math.sin(state.heading);

    const center = waveHeight(state.x, state.z, time);
    const front = waveHeight(state.x + fx * 1.35, state.z + fz * 1.35, time);
    const back = waveHeight(state.x - fx * 1.35, state.z - fz * 1.35, time);
    const right = waveHeight(state.x + rx * 0.62, state.z + rz * 0.62, time);
    const left = waveHeight(state.x - rx * 0.62, state.z - rz * 0.62, time);
    const speed = Math.abs(state.speed);
    const speedRatio = clamp(speed / 3.6, 0, 1);

    this.strokeKick = damp(this.strokeKick, 0, 7.5, dt);

    const heaveTarget =
      center * 0.82 + Math.sin(time * 0.82) * 0.014 * motion + this.strokeKick * 0.024;
    this.heaveVel += (heaveTarget - this.heave) * 13.5 * dt;
    this.heaveVel *= Math.exp(-4.3 * dt);
    this.heave += this.heaveVel * dt;
    this.heave = clamp(this.heave, -0.2, 0.2);

    const pullPhase =
      smoothstep(0.55, 0.64, state.strokePhase) *
      (1 - smoothstep(0.86, 0.9, state.strokePhase));
    const crew = pullPhase * state.rowBlend * motion;
    const rollTarget =
      (right - left) * 0.55 +
      clamp(state.angVel * state.speed * 0.055, -0.15, 0.15) * motion -
      crew * 0.052 +
      Math.sin(time * 0.61 + 0.4) * 0.008 * motion;
    this.rollVel += (rollTarget - this.roll) * 9.5 * dt;
    this.rollVel *= Math.exp(-3.8 * dt);
    this.roll += this.rollVel * dt;
    this.roll = clamp(this.roll, -0.28, 0.28);

    const pitchTarget =
      -(front - back) * 0.82 -
      clamp(state.forwardAccel * 0.022, -0.055, 0.055) * motion -
      this.strokeKick * 0.025 +
      Math.sin(time * 0.7) * 0.006 * motion;
    this.pitchVel += (pitchTarget - this.pitch) * 11.5 * dt;
    this.pitchVel *= Math.exp(-4.1 * dt);
    this.pitch += this.pitchVel * dt;
    this.pitch = clamp(this.pitch, -0.16, 0.16);

    this.group.position.set(state.x, 0.105 + this.heave, state.z);
    this.group.rotation.y = state.heading;
    this.group.rotation.x = this.pitch;
    this.group.rotation.z = this.roll;

    // Keep the child matrices current before the boatman solves his IK and
    // before the splash effects are placed on the water surface.
    this.group.updateMatrixWorld(true);

    const surfaceY = -this.group.position.y + 0.018;
    this.boatman.update(
      dt,
      state,
      env,
      time,
      reduced,
      nearestFlower,
      surfaceY,
    );

    const c = Math.cos(state.heading);
    const s = Math.sin(state.heading);
    this.oarEvents = this.boatman.events.map((event) => ({
      type: event.type,
      strength: event.strength,
      x: state.x + event.x * c + event.z * s,
      z: state.z - event.x * s + event.z * c,
    }));

    this.lanternSwing = damp(
      this.lanternSwing,
      -this.roll * 0.9 - state.angVel * 0.16,
      2.4,
      dt,
    );
    this.lantern.rotation.z = this.lanternSwing + Math.sin(time * 1.35) * 0.018 * motion;
    this.lantern.rotation.x = damp(this.lantern.rotation.x, -this.pitch * 0.7, 2.2, dt);

    this.umbrella.rotation.z = damp(
      this.umbrella.rotation.z,
      -this.roll * 0.3 + Math.sin(time * 0.52) * 0.01,
      1.8,
      dt,
    );
    this.umbrella.rotation.x = damp(
      this.umbrella.rotation.x,
      -this.pitch * 0.2,
      1.8,
      dt,
    );

    const flicker = 0.94 + 0.04 * Math.sin(time * 6.3) + 0.02 * Math.sin(time * 11.7 + 1.7);
    const dayDim = 0.12 + (1 - env.dayness) * 0.88;
    this.lanternLight.intensity = env.lanternIntensity * 6.4 * flicker * dayDim;
    const flame = 0.04 + (1 - env.dayness) * 0.96;
    this.lanternCoreMaterial.color.setRGB(2.2 * flicker * flame, 1.25 * flicker * flame, 0.5 * flicker * flame);
    this.lanternHalo.material.opacity = (0.16 + env.lanternGlow * 0.64) * (1 - env.dayness);
    this.lanternInner.material.opacity = (0.18 + env.lanternGlow * 0.72) * (1 - env.dayness);
    this.lanternPaperMaterial.emissiveIntensity = 0.03 + env.lanternGlow * 1.7;
    this.flame.scale.set(
      0.8 + 0.16 * flicker,
      0.82 + 0.22 * Math.sin(time * 8.7),
      0.8 + 0.16 * flicker,
    );
    this.crewLight.intensity = (0.9 + env.lanternGlow * 1.7) * (1 - env.dayness * 0.75);
    this.sternKey.intensity = 0.3 + env.lanternGlow * 0.85 + env.dayness * 0.25;
    this.plankMaterial.emissiveIntensity = 1.4 - env.dayness * 1.24;
    this.hullBackingMaterial.emissiveIntensity = 1.2 - env.dayness * 1.08;
    this.waterGlow.material.opacity = env.lanternGlow * 0.22 * (1 - env.dayness);
    this.waterGlow.visible = env.lanternGlow > 0.03;

    const foamOpacity = clamp((speedRatio - 0.05) * 0.75, 0, 0.5);
    this.foamMaterial.opacity = foamOpacity;
    this.bowFoam.visible = foamOpacity > 0.008;
    this.sternFoam.visible = foamOpacity > 0.008;
    this.bowFoam.scale.set(0.75 + speedRatio * 0.55, 0.65 + speedRatio * 0.7, 1);
    this.bowFoam.position.y = 0.025 + center * 0.9;
    this.sternFoam.scale.set(0.75 + speedRatio * 0.35, 0.7 + speedRatio * 0.45, 1);
    this.sternFoam.position.y = 0.025 + back * 0.9;

    this.contactShadow.material.opacity = 0.1 + env.dayness * 0.25;
    this.contactShadow.position.y = 0.014 + center * 0.55;

    this._lastStrokePhase = state.strokePhase;
  }

  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
    });
    for (const map of Object.values(this.woodMaps)) map.dispose();
    for (const map of Object.values(this.clothMaps)) map.dispose();
    for (const map of Object.values(this.paperMaps)) map.dispose();
    this.glowTexture.dispose();
    this.foamTexture.dispose();
    this.shadowTexture.dispose();
    this.boatman.dispose();
  }
}
