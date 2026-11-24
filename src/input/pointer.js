import * as THREE from 'three';

/**
 * Press-and-hold / drag steering. A ray is cast against the horizontal plane
 * at y=0; the boat turns toward the hit point while the pointer is down.
 * A second finger cancels steering instead of zooming the page.
 */
export class PointerSteer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.enabled = true;
    this.active = false;
    this.hasPoint = false;
    this.pointerId = null;
    this.pointers = new Set();
    this.point = new THREE.Vector3();

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ndc = new THREE.Vector2();
    this.hit = new THREE.Vector3();

    this.handleDown = this.handleDown.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleUp = this.handleUp.bind(this);

    canvas.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleUp);
  }

  updateFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const result = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (result) {
      this.point.copy(this.hit);
      this.hasPoint = true;
    } else {
      this.hasPoint = false;
    }
  }

  handleDown(event) {
    if (!this.enabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1) {
      this.cancel();
      return;
    }

    this.pointerId = event.pointerId;
    this.active = true;
    this.updateFromEvent(event);
    event.preventDefault();
  }

  handleMove(event) {
    if (!this.active || event.pointerId !== this.pointerId) return;
    this.updateFromEvent(event);
    event.preventDefault();
  }

  handleUp(event) {
    this.pointers.delete(event.pointerId);
    if (event.pointerId === this.pointerId) {
      this.active = false;
      this.hasPoint = false;
      this.pointerId = null;
    }
  }

  cancel() {
    this.active = false;
    this.hasPoint = false;
    this.pointerId = null;
    this.pointers.clear();
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    window.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
    window.removeEventListener('pointercancel', this.handleUp);
  }
}
