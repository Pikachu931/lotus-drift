import * as THREE from 'three';
import { clamp, damp } from './math.js';
import { waveHeight } from '../world/waves.js';

export class CameraRig {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.position = new THREE.Vector3(0, 4.9, -13.2);
    this.velocity = new THREE.Vector3();
    this.look = new THREE.Vector3(0, 1.2, 0);
    this.time = 0;
    this.roll = 0;
    this.fov = camera.fov;
    this.tmpTarget = new THREE.Vector3();
    this.tmpLook = new THREE.Vector3();
  }

  snap(state) {
    const forwardX = Math.sin(state.heading);
    const forwardZ = Math.cos(state.heading);
    this.position.set(state.x - forwardX * 13.2, 4.9, state.z - forwardZ * 13.2);
    this.velocity.set(0, 0, 0);
    this.look.set(state.x + forwardX * 1.5, 1.2, state.z + forwardZ * 1.5);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
  }

  update(dt, state, reduced, time) {
    this.time += dt;
    const gentle = this.settings.gentleCamera;
    const speedRatio = clamp(Math.abs(state.speed) / 4, 0, 1);
    const motion = reduced ? 0.3 : 1;

    const forwardX = Math.sin(state.heading);
    const forwardZ = Math.cos(state.heading);
    const back = 13.2 + speedRatio * 1.1;
    const height = 4.9 + speedRatio * 0.3;

    const floatX = gentle ? Math.sin(this.time * 0.31) * 0.55 * motion : 0;
    const floatZ = gentle ? Math.cos(this.time * 0.27) * 0.5 * motion : 0;
    const floatY = gentle ? Math.sin(this.time * 0.23 + 1.1) * 0.22 * motion : 0;

    this.tmpTarget.set(
      state.x - forwardX * back + floatX,
      height + floatY,
      state.z - forwardZ * back + floatZ,
    );

    const spring = gentle ? 1.9 : 6.5;
    const damping = gentle ? 2.3 : 5.6;
    this.velocity.x += (this.tmpTarget.x - this.position.x) * spring * dt;
    this.velocity.y += (this.tmpTarget.y - this.position.y) * spring * dt;
    this.velocity.z += (this.tmpTarget.z - this.position.z) * spring * dt;
    const decay = Math.exp(-damping * dt);
    this.velocity.multiplyScalar(decay);
    this.position.addScaledVector(this.velocity, dt);

    const minY = waveHeight(this.position.x, this.position.z, time) + 1.4;
    if (this.position.y < minY) {
      this.position.y = minY;
      this.velocity.y = Math.max(0, this.velocity.y);
    }

    const lookAhead = 1.5 + speedRatio * 2.0;
    const lookFloatX = gentle ? Math.sin(this.time * 0.37 + 2.0) * 0.45 * motion : 0;
    const lookFloatZ = gentle ? Math.cos(this.time * 0.33 + 0.7) * 0.4 * motion : 0;
    this.tmpLook.set(
      state.x + forwardX * lookAhead + lookFloatX,
      1.2 + (gentle ? Math.sin(this.time * 0.29) * 0.1 : 0),
      state.z + forwardZ * lookAhead + lookFloatZ,
    );

    const lookRate = gentle ? 2.4 : 7.5;
    this.look.x = damp(this.look.x, this.tmpLook.x, lookRate, dt);
    this.look.y = damp(this.look.y, this.tmpLook.y, lookRate, dt);
    this.look.z = damp(this.look.z, this.tmpLook.z, lookRate, dt);

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);

    const targetRoll =
      (gentle ? Math.sin(this.time * 0.41) * 0.012 : 0) +
      clamp(state.angVel * 0.03, -0.035, 0.035);
    this.roll = damp(this.roll, targetRoll * motion, 2.5, dt);
    this.camera.rotateZ(this.roll);

    const targetFov = 55 + speedRatio * 6;
    this.fov = damp(this.fov, targetFov, 1.8, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
