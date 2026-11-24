import { PHYSICS } from '../core/config.js';
import { clamp, damp } from '../core/math.js';

/** Phase window shared with the boatman, so splash and SFX land on the pull. */
export const STROKE_ENTRY = 0.55;
export const STROKE_EXIT = 0.9;

/**
 * Kinematic boat model: a scalar forward speed driven by periodic stroke
 * impulses, angular velocity with damping, and a little lateral slip so the
 * hull carves rather than rotating on a rail.
 */
export class BoatPhysics {
  constructor() {
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.drift = 0;
    this.angVel = 0;
    this.throttle = 0;
    this.steer = 0;
    this.strokePhase = 0;
    this.strokeCount = 0;
    this.strokeStrength = 0;
    this.forwardAccel = 0;
    this.rowBlend = 0;
    this.time = 0;
    this.rowing = false;
    this.strokeRate = PHYSICS.strokeRateMin;
    this._strokeFired = false;
    this._previousSpeed = 0;
  }

  update(dt, input) {
    if (dt <= 0) return;

    this.time += dt;
    const targetThrottle = clamp(input.throttle, -1, 1);
    const targetSteer = clamp(input.steer, -1, 1);
    this.throttle = damp(this.throttle, targetThrottle, 4.2, dt);
    this.steer = damp(this.steer, targetSteer, 5.4, dt);

    const forwardRequest = this.throttle > 0.06;
    const reverseRequest = this.throttle < -0.06;
    this.rowing = forwardRequest;
    this.rowBlend = damp(this.rowBlend, forwardRequest ? 1 : 0, 4, dt);

    // Rowing is a rhythm: each stroke adds a discrete push, drag eats it back.
    // The cycle length follows boat speed, not just the key: a slow drift is
    // lazy (~0.4 strokes/s), a committed pull settles near 1 stroke/s.
    if (forwardRequest) {
      const speedFactor = clamp(Math.abs(this.speed) / PHYSICS.maxSpeed, 0, 1);
      this.strokeRate =
        PHYSICS.strokeRateMin +
        (PHYSICS.strokeRateMax - PHYSICS.strokeRateMin) *
          (0.35 + 0.65 * speedFactor) *
          (0.82 + 0.18 * Math.abs(this.throttle));
      this.strokePhase += dt * this.strokeRate;
      if (!this._strokeFired && this.strokePhase >= STROKE_ENTRY) {
        this._strokeFired = true;
        this.strokeCount += 1;
        this.strokeStrength = 0.55 + Math.abs(this.throttle) * 0.45;
        this.speed += PHYSICS.strokeImpulse * Math.abs(this.throttle) * this.strokeStrength;
      }
      if (this.strokePhase >= 1) {
        this.strokePhase -= 1;
        this._strokeFired = false;
      }
      this.speed += PHYSICS.forwardAccel * this.throttle * dt;
    } else if (reverseRequest) {
      if (this.speed > 0.05) {
        this.speed -= 2.1 * Math.abs(this.throttle) * dt;
      } else {
        this.speed -= PHYSICS.reverseAccel * Math.abs(this.throttle) * dt;
      }
    }

    const drag = PHYSICS.drag + (forwardRequest ? 0.02 : 0.42);
    this.speed -= this.speed * drag * dt;
    this.speed = clamp(this.speed, -PHYSICS.reverseSpeed, PHYSICS.maxSpeed);
    if (!forwardRequest && !reverseRequest && Math.abs(this.speed) < 0.015) this.speed = 0;

    const speedFactor = Math.min(1, Math.abs(this.speed) / 1.7);
    const direction = this.speed < -0.08 ? -1 : 1;
    const targetAngVel =
      -this.steer *
      PHYSICS.turnRate *
      (0.32 + 0.68 * speedFactor) *
      direction *
      (0.6 + 0.4 * Math.min(1, Math.abs(this.throttle) + 0.25));
    this.angVel = damp(this.angVel, targetAngVel, PHYSICS.turnDamping, dt);
    this.heading += this.angVel * dt;

    const targetDrift = -this.angVel * this.speed * PHYSICS.driftGain * 0.22;
    this.drift = damp(this.drift, targetDrift, PHYSICS.driftDamping, dt);

    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);

    this.x += (forwardX * this.speed + rightX * this.drift) * dt;
    this.z += (forwardZ * this.speed + rightZ * this.drift) * dt;

    const rawAccel = (this.speed - this._previousSpeed) / Math.max(dt, 0.0001);
    this.forwardAccel = damp(this.forwardAccel, clamp(rawAccel, -8, 8), 6, dt);
    this._previousSpeed = this.speed;
  }

  get speedRatio() {
    return Math.min(1, Math.abs(this.speed) / PHYSICS.maxSpeed);
  }

  snapCameraTarget() {
    return { x: this.x, z: this.z, heading: this.heading };
  }
}
