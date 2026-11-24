import * as THREE from 'three';
import { clamp, damp, smoothstep } from '../core/math.js';
import { STROKE_ENTRY, STROKE_EXIT } from './physics.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

/** Local boat-space anchor for the seated figure. */
const FIGURE = new THREE.Vector3(0.02, 0.11, -0.82);
/** Oarlock position on the starboard gunwale. */
const OARLOCK = new THREE.Vector3(0.64, 0.42, -0.55);
const GRIP_INNER = -0.44;
const GRIP_OUTER = -0.24;
const UPPER_ARM = 0.3;
const FOREARM = 0.3;

function capsule(radius, length, radial = 8) {
  return new THREE.CapsuleGeometry(
    radius,
    Math.max(0.015, length - radius * 2),
    3,
    radial,
  );
}

function standard(options) {
  const material = new THREE.MeshStandardMaterial(options);
  material.shadowSide = THREE.DoubleSide;
  return material;
}

/**
 * A small procedural boatman and his side oar. The figure is posed by hand
 * (breathing, head turns, torso lean) and the arms are solved every frame with
 * a two-bone IK so the hands stay on the moving oar grips.
 */
export class Boatman {
  constructor({ woodMaps, clothMaps, foamTexture, trimMaterial, darkWoodMaterial }) {
    this.group = new THREE.Group();
    this.group.name = 'boatman-rig';
    this.group.position.set(0, 0, 0);

    this.materials = {
      skin: standard({ color: 0xad7c5b, roughness: 0.6, metalness: 0 }),
      shirt: standard({
        color: 0x5c7284,
        map: clothMaps.color,
        normalMap: clothMaps.normal,
        roughness: 0.93,
        metalness: 0,
        emissive: 0x1b2b38,
        emissiveIntensity: 0.8,
      }),
      lungi: standard({
        color: 0x9c6b50,
        map: clothMaps.color,
        normalMap: clothMaps.normal,
        roughness: 0.96,
        metalness: 0,
        emissive: 0x2a1a0f,
        emissiveIntensity: 0.7,
      }),
      straw: standard({
        color: 0xd4bb88,
        map: woodMaps.color,
        normalMap: clothMaps.normal,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        emissive: 0x4a3319,
        emissiveIntensity: 0.85,
      }),
      hair: standard({ color: 0x1c1713, roughness: 0.8, metalness: 0 }),
      leather: standard({ color: 0x3d2b1e, roughness: 0.72, metalness: 0.04 }),
      rope: standard({ color: 0x8a7054, roughness: 0.92, metalness: 0 }),
      bamboo: standard({
        color: 0xc0ab74,
        map: woodMaps.color,
        normalMap: woodMaps.normal,
        roughness: 0.6,
        metalness: 0,
        emissive: 0x4a3518,
        emissiveIntensity: 0.85,
      }),
      dark: darkWoodMaterial || standard({ color: 0x2d2117, roughness: 0.85 }),
      metal: standard({ color: 0x332f28, roughness: 0.42, metalness: 0.55 }),
      trim: trimMaterial,
    };

    this.fineMeshes = [];
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._v4 = new THREE.Vector3();
    this._v5 = new THREE.Vector3();
    this._q1 = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._targetWorld = new THREE.Vector3();
    this._targetChest = new THREE.Vector3();
    this._gripInner = new THREE.Vector3();
    this._gripOuter = new THREE.Vector3();
    this._innerFigure = new THREE.Vector3();
    this._outerFigure = new THREE.Vector3();
    this._blade = new THREE.Vector3();
    this._poleL = new THREE.Vector3(-0.8, -0.55, 0.2);
    this._poleR = new THREE.Vector3(0.8, -0.55, 0.2);
    this.surfaceY = 0.02;

    this.buildFigure(woodMaps, clothMaps);
    this.buildOar(woodMaps, clothMaps);
    this.buildSplash(foamTexture);

    this.events = [];
    this.lastPhase = null;
    this.wasRowing = false;
    this.weightShift = 0;
    this.rowPower = 0;
    this.detail = true;
    this.splashLife = 0;
    this.sprayLife = 0;
    this.dripLife = 0;
    this.splashWorld = new THREE.Vector3();
  }

  markFine(object) {
    this.fineMeshes.push(object);
    return object;
  }

  buildFigure(woodMaps, clothMaps) {
    const figure = new THREE.Group();
    figure.name = 'boatman';
    figure.position.copy(FIGURE);
    this.figure = figure;
    this.group.add(figure);

    const hips = new THREE.Group();
    hips.position.y = 0.13;
    figure.add(hips);
    this.hips = hips;

    const hipMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 14, 9),
      this.materials.lungi,
    );
    hipMesh.scale.set(1.0, 0.72, 0.86);
    hipMesh.position.y = 0.03;
    hips.add(hipMesh);

    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.25, 0.25, 14, 1, true),
      this.materials.lungi,
    );
    skirt.position.y = -0.02;
    hips.add(skirt);

    const spine = new THREE.Group();
    spine.position.y = 0.16;
    hips.add(spine);
    this.spine = spine;

    const chest = new THREE.Group();
    chest.position.y = 0.02;
    spine.add(chest);
    this.chest = chest;

    // Loose shirt / kurta, wider at the shoulders and falling to the waist.
    const profile = [
      new THREE.Vector2(0.13, -0.16),
      new THREE.Vector2(0.165, -0.08),
      new THREE.Vector2(0.18, 0.04),
      new THREE.Vector2(0.19, 0.16),
      new THREE.Vector2(0.17, 0.25),
      new THREE.Vector2(0.1, 0.31),
    ];
    const torso = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 16),
      this.materials.shirt,
    );
    torso.position.y = 0;
    chest.add(torso);

    const sash = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.018, 5, 18),
      this.materials.rope,
    );
    sash.rotation.x = Math.PI / 2;
    sash.position.y = -0.08;
    chest.add(sash);
    this.markFine(sash);

    // A short hanging sash end gives the seated silhouette a little asymmetry.
    const sashEnd = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.24, 0.018),
      this.materials.lungi,
    );
    sashEnd.position.set(0.17, -0.17, 0.02);
    sashEnd.rotation.z = 0.18;
    chest.add(sashEnd);
    this.markFine(sashEnd);

    // Neck and softly rounded head under the wide conical hat.
    const neck = new THREE.Group();
    neck.position.y = 0.32;
    chest.add(neck);
    this.neck = neck;

    const neckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.075, 0.11, 10),
      this.materials.skin,
    );
    neckMesh.position.y = 0.02;
    neck.add(neckMesh);

    const head = new THREE.Group();
    head.position.y = 0.08;
    neck.add(head);
    this.head = head;

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 16, 12),
      this.materials.skin,
    );
    skull.scale.set(0.92, 1.06, 0.96);
    skull.position.y = 0.105;
    head.add(skull);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.116, 16, 8, 0, TAU, 0, Math.PI * 0.55),
      this.materials.hair,
    );
    hair.position.y = 0.112;
    hair.scale.set(0.94, 1.03, 0.98);
    head.add(hair);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.065, 7),
      this.materials.skin,
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.085, 0.108);
    head.add(nose);
    this.markFine(nose);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.031, 8, 6),
        this.materials.skin,
      );
      ear.scale.set(0.55, 1.1, 0.8);
      ear.position.set(side * 0.105, 0.09, 0.015);
      head.add(ear);
    }

    // Hat: a broad straw cone with a bamboo band. It deliberately hides the
    // eyes, keeping the face calm and unreadable rather than uncanny.
    const hat = new THREE.Group();
    hat.position.y = 0.19;
    head.add(hat);
    this.hat = hat;

    const brim = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.2, 28, 1, true),
      this.materials.straw,
    );
    brim.position.y = 0.08;
    hat.add(brim);

    const brimEdge = new THREE.Mesh(
      new THREE.TorusGeometry(0.347, 0.01, 4, 30),
      this.materials.bamboo,
    );
    brimEdge.rotation.x = Math.PI / 2;
    brimEdge.position.y = -0.02;
    hat.add(brimEdge);

    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.012, 4, 18),
      this.materials.rope,
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.005;
    hat.add(band);

    const apex = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 8, 6),
      this.materials.bamboo,
    );
    apex.position.y = 0.185;
    hat.add(apex);
    this.markFine(band);

    // Arms. The visual segments live under joint groups; the joint groups are
    // rotated each frame from the IK solution.
    this.arms = [this.buildArm(-1), this.buildArm(1)];

    // Seated legs, with the lungi falling across the lap.
    this.legs = [this.buildLeg(-1), this.buildLeg(1)];

    const lapCloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.018, 0.31),
      this.materials.lungi,
    );
    lapCloth.position.set(0, 0.065, 0.17);
    lapCloth.rotation.x = 0.1;
    hips.add(lapCloth);
    this.markFine(lapCloth);

    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.36),
      this.materials.lungi,
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.065, 0.19);
    hips.add(mat);
    this.markFine(mat);

    // A small cloth bundle at the stern, out of the rower's way.
    const bundle = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 7),
      this.materials.lungi,
    );
    bundle.scale.set(1.1, 0.55, 0.8);
    bundle.position.set(-0.3, 0.12, -0.16);
    figure.add(bundle);
    this.markFine(bundle);
  }

  buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.19, 0.24, 0);
    this.chest.add(shoulder);
    shoulder.rotation.order = 'YXZ';

    const upper = new THREE.Mesh(capsule(0.06, UPPER_ARM, 8), this.materials.skin);
    upper.position.y = -UPPER_ARM * 0.5;
    shoulder.add(upper);

    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.067, 0.13, 9, 1, true),
      this.materials.shirt,
    );
    sleeve.position.y = -0.075;
    shoulder.add(sleeve);

    const cuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.058, 0.008, 4, 10),
      this.materials.shirt,
    );
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.135;
    shoulder.add(cuff);

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM;
    shoulder.add(elbow);
    elbow.rotation.order = 'YXZ';

    const fore = new THREE.Mesh(capsule(0.047, FOREARM, 8), this.materials.skin);
    fore.position.y = -FOREARM * 0.5;
    elbow.add(fore);

    const wrist = new THREE.Group();
    wrist.position.y = -FOREARM;
    elbow.add(wrist);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      this.materials.skin,
    );
    hand.scale.set(0.82, 1.12, 0.62);
    hand.position.y = -0.04;
    wrist.add(hand);

    const thumb = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 5),
      this.materials.skin,
    );
    thumb.scale.set(0.7, 1.3, 0.7);
    thumb.position.set(side * 0.028, -0.025, 0.035);
    wrist.add(thumb);

    return { side, shoulder, elbow, wrist, hand };
  }

  buildLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.115, 0.02, 0.02);
    this.hips.add(hip);
    hip.rotation.order = 'YXZ';
    hip.rotation.x = 1.72;
    hip.rotation.z = side * 0.06;

    const thigh = new THREE.Mesh(capsule(0.085, 0.32, 8), this.materials.lungi);
    thigh.position.y = 0.16;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = 0.3;
    hip.add(knee);
    knee.rotation.x = Math.PI - 1.72;

    const shin = new THREE.Mesh(capsule(0.058, 0.29, 8), this.materials.skin);
    shin.position.y = 0.145;
    knee.add(shin);

    const cuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.062, 0.009, 4, 10),
      this.materials.lungi,
    );
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = 0.045;
    knee.add(cuff);
    this.markFine(cuff);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.115, 0.045, 0.24),
      this.materials.leather,
    );
    foot.position.set(0, 0.285, 0.075);
    knee.add(foot);
    this.markFine(foot);

    return { side, hip, knee };
  }

  buildOar(woodMaps, clothMaps) {
    const oar = new THREE.Group();
    oar.position.copy(OARLOCK);
    oar.name = 'oar';
    oar.rotation.order = 'YXZ';
    this.oarGroup = oar;
    this.group.add(oar);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.026, 3.05, 7),
      this.materials.bamboo,
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = 1.02;
    oar.add(shaft);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.03, 0.19, 8),
      this.materials.leather,
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.x = -0.47;
    oar.add(handle);

    for (const x of [-0.21, 0.56, 1.35]) {
      const node = new THREE.Mesh(
        new THREE.TorusGeometry(0.026, 0.005, 4, 9),
        this.materials.rope,
      );
      node.rotation.y = Math.PI / 2;
      node.position.x = x;
      oar.add(node);
      this.markFine(node);
    }

    const blade = new THREE.Group();
    blade.position.x = 2.27;
    blade.rotation.order = 'XYZ';
    oar.add(blade);
    this.bladeGroup = blade;

    const paddle = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.026, 0.3),
      this.materials.bamboo,
    );
    paddle.position.x = 0.12;
    blade.add(paddle);

    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.032, 0.28),
      this.materials.dark,
    );
    tip.position.set(0.38, 0, 0);
    blade.add(tip);

    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.018, 0.038),
      this.materials.rope,
    );
    rib.position.set(0.12, 0.018, 0);
    blade.add(rib);
    this.markFine(rib);

    // Fixed oarlock post; the oar pivots around it.
    const lock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.043, 0.15, 7),
      this.materials.dark,
    );
    lock.position.set(OARLOCK.x, OARLOCK.y - 0.09, OARLOCK.z);
    this.group.add(lock);

    const lockTop = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.014, 5, 10, Math.PI),
      this.materials.metal,
    );
    lockTop.rotation.y = Math.PI / 2;
    lockTop.position.set(OARLOCK.x, OARLOCK.y + 0.01, OARLOCK.z);
    this.group.add(lockTop);
  }

  buildSplash(foamTexture) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      map: foamTexture,
      color: 0xcdeee7,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 4;
    ring.visible = false;
    this.group.add(ring);
    this.splashRing = ring;

    const sprayMaterial = new THREE.SpriteMaterial({
      map: foamTexture,
      color: 0xd7f2ea,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const spray = new THREE.Sprite(sprayMaterial);
    spray.visible = false;
    spray.renderOrder = 4;
    this.group.add(spray);
    this.spray = spray;

    const dripPositions = new Float32Array(24 * 3);
    const dripGeometry = new THREE.BufferGeometry();
    dripGeometry.setAttribute('position', new THREE.BufferAttribute(dripPositions, 3));
    const dripMaterial = new THREE.PointsMaterial({
      color: 0xc9ebe4,
      size: 0.038,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const drips = new THREE.Points(dripGeometry, dripMaterial);
    drips.frustumCulled = false;
    drips.visible = false;
    this.group.add(drips);
    this.drips = drips;
    this.dripVelocities = Array.from({ length: 24 }, () => new THREE.Vector3());
  }

  setDetail(high) {
    this.detail = high;
    for (const mesh of this.fineMeshes) mesh.visible = high;
    if (!high) {
      if (this.spray) this.spray.visible = false;
      if (this.splashRing) this.splashRing.visible = false;
      if (this.drips) this.drips.visible = false;
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  emit(type, x, z, strength) {
    this.events.push({ type, x, z, strength });
    const local = this._v1.set(x, this.surfaceY, z);
    if (type === 'enter') {
      this.spawnSplash(local, 1);
    } else {
      this.spawnSplash(local, 0.45);
      this.spawnDrips(local);
    }
  }

  spawnSplash(local, scale) {
    this.splashRing.position.set(local.x, local.y, local.z);
    this.splashRing.visible = true;
    this.splashRing.scale.setScalar(0.18);
    this.splashRing.material.opacity = 0.55 * scale;
    this.splashLife = 0.85;
    this.spray.position.set(local.x, local.y + 0.13, local.z);
    this.spray.scale.setScalar(0.3);
    this.spray.material.opacity = 0.38 * scale;
    this.spray.visible = true;
    this.sprayLife = 0.6;
  }

  spawnDrips(local) {
    if (!this.detail) return;
    const positions = this.drips.geometry.attributes.position.array;
    for (let i = 0; i < 24; i += 1) {
      positions[i * 3] = local.x + (Math.random() - 0.5) * 0.22;
      positions[i * 3 + 1] = local.y + 0.04 + Math.random() * 0.16;
      positions[i * 3 + 2] = local.z + (Math.random() - 0.5) * 0.22;
      const v = this.dripVelocities[i];
      v.set(
        (Math.random() - 0.5) * 0.35,
        0.15 + Math.random() * 0.35,
        (Math.random() - 0.5) * 0.35,
      );
    }
    this.drips.geometry.attributes.position.needsUpdate = true;
    this.drips.material.opacity = 0.8;
    this.drips.visible = true;
    this.dripLife = 0.9;
  }

  updateSplash(dt) {
    if (this.splashLife > 0) {
      this.splashLife = Math.max(0, this.splashLife - dt);
      const t = 1 - this.splashLife / 0.85;
      this.splashRing.scale.setScalar(0.18 + t * 1.2);
      this.splashRing.material.opacity = (1 - t) * 0.5;
      this.splashRing.visible = this.splashLife > 0;
    }
    if (this.sprayLife > 0) {
      this.sprayLife = Math.max(0, this.sprayLife - dt);
      const t = 1 - this.sprayLife / 0.6;
      this.spray.position.y += dt * 0.25;
      this.spray.scale.setScalar(0.3 + t * 0.55);
      this.spray.material.opacity = (1 - t) * 0.34;
      this.spray.visible = this.sprayLife > 0;
    }
    if (this.dripLife > 0) {
      this.dripLife = Math.max(0, this.dripLife - dt);
      const positions = this.drips.geometry.attributes.position.array;
      for (let i = 0; i < 24; i += 1) {
        const v = this.dripVelocities[i];
        v.y -= 2.4 * dt;
        positions[i * 3] += v.x * dt;
        positions[i * 3 + 1] = Math.max(0.01, positions[i * 3 + 1] + v.y * dt);
        positions[i * 3 + 2] += v.z * dt;
      }
      this.drips.geometry.attributes.position.needsUpdate = true;
      this.drips.material.opacity = Math.min(0.7, this.dripLife);
      if (this.dripLife <= 0) this.drips.visible = false;
    }
  }

  solveArm(arm, targetChest, pole) {
    const side = arm.side;
    const shoulder = arm.shoulder;
    const local = this._v1.copy(targetChest).sub(shoulder.position);
    let distance = local.length();
    if (distance < 0.001) return;
    const maxReach = UPPER_ARM + FOREARM - 0.004;
    if (distance > maxReach) {
      local.multiplyScalar(maxReach / distance);
      distance = maxReach;
    }
    const dir = this._v2.copy(local).divideScalar(distance);
    const shoulderX = THREE.MathUtils.clamp(
      (UPPER_ARM * UPPER_ARM + distance * distance - FOREARM * FOREARM) /
        (2 * UPPER_ARM * distance),
      -1,
      1,
    );
    const angle = Math.acos(shoulderX);

    const bend = this._v3.copy(pole);
    bend.addScaledVector(dir, -bend.dot(dir));
    if (bend.lengthSq() < 0.0001) bend.set(side, -0.5, 0.25);
    bend.normalize();

    const upperDir = this._v4
      .copy(dir)
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(bend, Math.sin(angle))
      .normalize();

    this._q1.setFromUnitVectors(DOWN, upperDir);
    shoulder.quaternion.copy(this._q1);

    const elbowPos = this._v2.copy(upperDir).multiplyScalar(UPPER_ARM);
    const foreDir = this._v3.copy(local).sub(elbowPos).normalize();
    const foreLocal = this._v5.copy(foreDir).applyQuaternion(this._q2.copy(this._q1).invert());
    arm.elbow.quaternion.setFromUnitVectors(DOWN, foreLocal);
    arm.wrist.position.y = -FOREARM;

    // A small wrist roll helps the hands read as holding the shaft.
    arm.wrist.rotation.x = 0.5;
    arm.wrist.rotation.z = side * 0.12;
  }

  update(dt, state, env, time, reduced, nearestFlower, surfaceY = 0.02) {
    if (dt > 0.1) dt = 0.1;
    this.events.length = 0;
    this.surfaceY = surfaceY;

    const row = clamp(state.rowBlend ?? (state.rowing ? 1 : 0), 0, 1);
    const p = state.strokePhase;
    const prev = this.lastPhase;

    if (prev !== null && state.rowing) {
      if (prev < STROKE_ENTRY && p >= STROKE_ENTRY) {
        this.oarGroup.updateMatrix();
        const blade = this._blade.set(2.4, 0, 0).applyMatrix4(this.oarGroup.matrix);
        this.emit('enter', blade.x, blade.z, 0.7 + row * 0.3);
      }
      if (prev < STROKE_EXIT && p >= STROKE_EXIT) {
        this.oarGroup.updateMatrix();
        const blade = this._blade.set(2.4, 0, 0).applyMatrix4(this.oarGroup.matrix);
        this.emit('exit', blade.x, blade.z, 0.45);
      }
      // If a long frame straddles the wrap, make sure the release is not lost.
      if (p < prev && prev > 0.8 && prev < STROKE_EXIT) {
        this.oarGroup.updateMatrix();
        const blade = this._blade.set(2.4, 0, 0).applyMatrix4(this.oarGroup.matrix);
        this.emit('exit', blade.x, blade.z, 0.4);
      }
    }
    this.lastPhase = p;
    this.wasRowing = state.rowing;

    // Rowing phases: catch at .55, pull through .9, then a long relaxed return.
    let sweep;
    let dip;
    if (p >= STROKE_ENTRY && p < STROKE_EXIT) {
      const t = smoothstep(STROKE_ENTRY, STROKE_EXIT, p);
      sweep = -0.3 + 0.6 * t;
      dip =
        0.29 *
        smoothstep(STROKE_ENTRY, STROKE_ENTRY + 0.045, p) *
        (1 - smoothstep(STROKE_EXIT - 0.055, STROKE_EXIT, p));
    } else if (p < 0.32) {
      sweep = 0.3 - 0.6 * smoothstep(0, 0.32, p);
      dip = 0;
    } else {
      sweep = -0.3;
      dip = 0;
    }

    const rowBlend = damp(
      this._rowBlend ?? 0,
      row,
      row > 0.05 ? 4.5 : 2.6,
      dt,
    );
    this._rowBlend = rowBlend;

    const pull =
      rowBlend *
      smoothstep(STROKE_ENTRY, STROKE_ENTRY + 0.09, p) *
      (1 - smoothstep(STROKE_EXIT - 0.045, STROKE_EXIT, p));
    const turn = clamp(state.angVel * Math.max(Math.abs(state.speed), 0.3) * 0.055, -0.16, 0.16);
    const still = 1 - rowBlend;
    const breath = Math.sin(time * 1.18) * 0.008 * still;
    const idleShift = Math.sin(time * 0.17 + 1.4) * 0.018 * still;
    const motionScale = reduced ? 0.45 : 1;

    this.weightShift = (pull * 0.88 + idleShift * 0.2) * rowBlend * motionScale;

    this.hips.position.x = idleShift * 0.5 + pull * 0.028 * motionScale;
    this.hips.position.y = 0.13 + breath * 0.35;
    this.hips.rotation.z = -pull * 0.065 * motionScale + turn * 0.16;

    this.spine.rotation.x = 0.035 * still + pull * 0.075 * motionScale;
    this.spine.rotation.y = -pull * 0.08 * motionScale + idleShift * 0.4;
    this.chest.rotation.y = 0.12 + pull * 0.16 * motionScale;
    this.chest.rotation.z = -pull * 0.04 * motionScale - turn * 0.2;
    this.chest.rotation.x = breath;

    let flowerYaw = 0;
    if (nearestFlower) {
      const dx = nearestFlower.x - state.x;
      const dz = nearestFlower.z - state.z;
      const relative = Math.atan2(dx, dz) - state.heading;
      const wrapped = Math.atan2(Math.sin(relative), Math.cos(relative));
      flowerYaw = clamp(wrapped, -0.55, 0.55) * 0.55 * still;
    }
    const headTarget =
      flowerYaw + Math.sin(time * 0.23 + 0.6) * 0.035 * still - pull * 0.06;
    this.head.rotation.y = damp(this.head.rotation.y, headTarget, 1.8, dt);
    this.head.rotation.x = damp(
      this.head.rotation.x,
      0.03 + breath * 0.8 + Math.sin(time * 0.31) * 0.012 * still,
      1.5,
      dt,
    );

    // Oar pose. The long recovery is visible and the blade feathers on exit.
    const oarBlend = rowBlend;
    this.oarGroup.rotation.y = sweep * oarBlend * motionScale;
    this.oarGroup.rotation.z = -dip * oarBlend * motionScale;
    this.oarGroup.rotation.x = 0.04 * (1 - oarBlend);
    const feather = (1 - smoothstep(STROKE_ENTRY, STROKE_ENTRY + 0.03, p)) * 0.65;
    this.bladeGroup.rotation.x = feather * oarBlend;

    // The rower is strong on the pull and relaxed on the return.
    this.rowPower = pull;

    // Solve both hands onto the actual oar grips. The oar matrix is in boat
    // space; move the grips into figure space first, then into chest space so
    // the IK follows the leaning torso exactly.
    this.figure.updateWorldMatrix(true, false);
    this.chest.updateWorldMatrix(true, false);
    this.oarGroup.updateMatrix();

    this._gripInner.set(GRIP_INNER, 0, 0).applyMatrix4(this.oarGroup.matrix);
    this._gripOuter.set(GRIP_OUTER, 0, 0).applyMatrix4(this.oarGroup.matrix);
    this._innerFigure.copy(this._gripInner).sub(FIGURE);
    this._outerFigure.copy(this._gripOuter).sub(FIGURE);

    // figure-local → world → chest-local. Both matrices are current, so the
    // boat's own transform cancels out cleanly.
    this._targetWorld.copy(this._innerFigure);
    this.figure.localToWorld(this._targetWorld);
    this.chest.worldToLocal(this._targetWorld);
    this._targetChest.copy(this._targetWorld);
    this.solveArm(this.arms[0], this._targetChest, this._poleL);

    this._targetWorld.copy(this._outerFigure);
    this.figure.localToWorld(this._targetWorld);
    this.chest.worldToLocal(this._targetWorld);
    this._targetChest.copy(this._targetWorld);
    this.solveArm(this.arms[1], this._targetChest, this._poleR);

    // Legs breathe a little with the body; keep the feet planted.
    this.legs[0].hip.rotation.z = 0.06 + idleShift * 0.2;
    this.legs[1].hip.rotation.z = -0.06 + idleShift * 0.2;

    this.updateSplash(dt);
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.group.traverse((child) => {
      if (child.geometry) geometries.add(child.geometry);
      if (child.material) {
        if (Array.isArray(child.material)) {
          for (const material of child.material) materials.add(material);
        } else {
          materials.add(child.material);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
