import './ui/styles.css';
import * as THREE from 'three';

import { APP_NAME, CREATOR_NAME } from './core/config.js';
import { SettingsStore } from './core/settings.js';
import { QualityManager } from './core/quality.js';
import { Loop } from './core/loop.js';
import { createPost, createRenderer } from './core/renderer.js';
import { CameraRig } from './core/cameraRig.js';
import { clamp, wrapAngle } from './core/math.js';
import { buildReport, copyText } from './core/diagnostics.js';
import { EnvironmentRig } from './world/environment.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { ChunkManager, createFloraShared } from './world/chunks.js';
import { Particles } from './world/particles.js';
import { Mist } from './world/mist.js';
import { Boat } from './boat/boat.js';
import { BoatPhysics } from './boat/physics.js';
import { Wake } from './boat/wake.js';
import { Keyboard } from './input/keyboard.js';
import { PointerSteer } from './input/pointer.js';
import { Joystick } from './input/joystick.js';
import { AudioEngine } from './audio/engine.js';
import { Hud } from './ui/hud.js';
import { SettingsPanel } from './ui/settings.js';
import { Manifesto } from './ui/manifesto.js';
import { showToast } from './ui/toast.js';

const ZERO_INPUT = { throttle: 0, steer: 0 };

function hasWebGL2() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

function setCredits() {
  document.title = `${APP_NAME} — a quiet night pond`;
  const credit = document.getElementById('credit-name');
  if (credit) credit.textContent = CREATOR_NAME;
  for (const element of document.querySelectorAll('[data-credit]')) {
    element.textContent = CREATOR_NAME;
  }
}

function boot() {
  setCredits();

  const settings = new SettingsStore();
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const quality = new QualityManager(settings, { coarse: coarsePointer });
  let profile = quality.profile;

  const canvas = document.getElementById('scene');
  const renderer = createRenderer(canvas, profile);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x091326, 0.0125);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    1400,
  );
  camera.position.set(0, 4.9, -13.2);

  const sky = new Sky();
  scene.add(sky.group);

  const water = new Water(profile);
  scene.add(water.mesh);

  const floraShared = createFloraShared(water.uniforms.uRipples.value);
  const chunks = new ChunkManager(scene, floraShared, profile);

  const particles = new Particles(profile);
  scene.add(particles.points);

  const mist = new Mist(profile);
  scene.add(mist.group);

  const boat = new Boat(profile);
  scene.add(boat.group);
  boat.setBoatmanVisible(settings.get('boatman'));
  boat.applyQuality(profile);

  const wake = new Wake(scene, water.uniforms.uRipples.value);
  const physics = new BoatPhysics();
  const rig = new CameraRig(camera, settings);
  const environment = new EnvironmentRig();
  let env = environment.copy(0);

  const post = createPost(renderer, scene, camera, profile);

  const hemisphere = new THREE.HemisphereLight(0x27456f, 0x04070c, 0.5);
  scene.add(hemisphere);

  const moonLight = new THREE.DirectionalLight(0x9db8e8, 0.85);
  scene.add(moonLight);
  scene.add(moonLight.target);

  // A cool fill from behind the camera keeps the boat and petals readable
  // against the night without flattening the moonlight.
  const fillLight = new THREE.DirectionalLight(0x8fb4e0, 0.32);
  fillLight.position.set(-24, 30, -46);
  scene.add(fillLight);

  const audio = new AudioEngine(settings);
  const hud = new Hud(settings);
  const keyboard = new Keyboard();
  const pointer = new PointerSteer(canvas, camera);
  const joystick = new Joystick(
    document.getElementById('joystick'),
    document.getElementById('joystick-knob'),
  );

  const hudElement = document.getElementById('hud');
  const startOverlay = document.getElementById('start');
  const startButton = document.getElementById('btn-start');
  let started = false;
  let starting = false;
  let modalsOpen = false;
  let elapsed = 0;
  let worldTime = 0;
  let distance = 0;
  let lastStroke = 0;
  let chimeCooldown = 0;

  hudElement.inert = true;
  hud.hideHint();

  function updateJoystickVisibility() {
    const show = settings.get('joystick') && coarsePointer && started && !modalsOpen;
    joystick.setVisible(show);
  }

  function refreshPlayState() {
    modalsOpen = settingsPanel.isOpen || manifesto.isOpen;
    keyboard.enabled = started && !modalsOpen;
    pointer.enabled = started && !modalsOpen;
    if (modalsOpen) {
      pointer.cancel();
      joystick.reset();
      keyboard.clear();
    }
    updateJoystickVisibility();
    if (started && !modalsOpen) {
      window.setTimeout(() => {
        if (started && !modalsOpen) canvas.focus({ preventScroll: true });
      }, 0);
    }
  }

  const settingsPanel = new SettingsPanel(settings, {
    trigger: document.getElementById('btn-settings'),
    onOpen: () => {
      manifesto.close();
      refreshPlayState();
    },
    onClose: () => refreshPlayState(),
  });

  const manifesto = new Manifesto({
    trigger: document.getElementById('btn-manifesto'),
    onOpen: () => {
      settingsPanel.close();
      refreshPlayState();
    },
    onClose: () => refreshPlayState(),
  });

  const diagnosticsButton = document.getElementById('btn-diagnostics');
  if (diagnosticsButton) {
    diagnosticsButton.addEventListener('click', async () => {
      const report = buildReport({ renderer, quality, settings });
      const copied = await copyText(report);
      if (copied) {
        showToast('Performance report copied.', 2600);
      } else {
        console.info(report);
        showToast('Copy is unavailable — the report is in the console.', 4200);
      }
    });
  }

  function applyEnvironment(current) {
    water.applyEnvironment(current);
    sky.applyEnvironment(current);
    chunks.applyEnvironment(current);
    particles.applyEnvironment(current);
    mist.applyEnvironment(current);
    wake.applyEnvironment(current);

    scene.fog.color.copy(current.fog);
    scene.fog.density = current.fogDensity;

    hemisphere.color.copy(current.hemiSky);
    hemisphere.groundColor.copy(current.hemiGround);
    hemisphere.intensity = current.hemiIntensity;

    moonLight.color.copy(current.keyColor);
    moonLight.intensity = current.keyIntensity;
    fillLight.intensity = 0.16 + current.dayness * 0.35;
    fillLight.color.copy(current.hemiSky);

    renderer.toneMappingExposure = current.exposure;
    post.applyEnvironment(current, quality.profile);
  }

  function applyQuality(next) {
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    post.setQuality(next);
    post.resize(window.innerWidth, window.innerHeight, quality.pixelRatio);
    chunks.setQuality(next);
    boat.applyQuality(next);
    particles.setQuality(next);
    water.setQuality(next);
    mist.setQuality(next);
    sky.setPixelRatio(renderer.getPixelRatio());
    particles.setPixelRatio(renderer.getPixelRatio());
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(width, height, false);
    post.resize(width, height, quality.pixelRatio);
    sky.setPixelRatio(renderer.getPixelRatio());
    particles.setPixelRatio(renderer.getPixelRatio());
  }

  quality.onChange((next) => {
    profile = next;
    applyQuality(next);
  });
  // Resolution steps do not rebuild materials or density; they only resize.
  quality.onScaleChange(() => resize());
  profile = quality.profile;
  applyQuality(profile);
  applyEnvironment(env);

  settings.subscribe((key) => {
    quality.refresh();
    audio.applySettings();
    if (key === 'showFps' || key === null) hud.applyFpsVisibility();
    if (key === 'joystick' || key === null) updateJoystickVisibility();
    if (key === 'boatman' || key === null) {
      boat.setBoatmanVisible(settings.get('boatman'));
    }
  });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  function applyMotionPreference() {
    chunks.setReducedMotion(reducedMotion);
    particles.setReducedMotion(reducedMotion);
    sky.setReducedMotion(reducedMotion);
    if (mist.setReducedMotion) mist.setReducedMotion(reducedMotion);
  }
  motionQuery.addEventListener('change', (event) => {
    reducedMotion = event.matches;
    applyMotionPreference();
  });
  applyMotionPreference();

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      quality.refresh();
      resize();
    });
  });
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      quality.refresh();
      resize();
    }, 260);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      loop.stop();
      audio.suspend();
    } else {
      audio.resume();
      loop.start();
    }
  });

  // Safari pinch gestures are blocked on the canvas while playing.
  const preventGesture = (event) => {
    event.preventDefault();
  };
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.code !== 'KeyF') return;
    const target = event.target;
    if (
      target instanceof Element &&
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
    ) {
      return;
    }
    settings.set('showFps', !settings.get('showFps'));
  });

  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    loop.stop();
    showToast('The pond is holding its breath — restoring the view…', 8000);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    try {
      resize();
      applyQuality(quality.profile);
      loop.start();
      showToast('Back on the water.', 2600);
    } catch {
      showToast('The view could not be restored. Reload to return to the pond.', 9000);
    }
  });

  function readInput() {
    if (!started || modalsOpen) return ZERO_INPUT;

    if (pointer.active && pointer.hasPoint) {
      const dx = pointer.point.x - physics.x;
      const dz = pointer.point.z - physics.z;
      const targetDistance = Math.hypot(dx, dz);
      if (targetDistance > 0.8) {
        const desired = Math.atan2(dx, dz);
        const difference = wrapAngle(desired - physics.heading);
        return {
          throttle: targetDistance > 2.4 ? 0.95 : 0.4,
          steer: clamp(-difference * 2.1, -1, 1),
        };
      }
      return { throttle: 0.15, steer: 0 };
    }

    let throttle = keyboard.throttle;
    let steer = keyboard.steer;
    if (joystick.active) {
      throttle += joystick.value.y;
      steer += joystick.value.x;
    }
    return { throttle: clamp(throttle, -1, 1), steer: clamp(steer, -1, 1) };
  }

  const loop = new Loop((dt, raw) => {
    worldTime += dt;

    const input = readInput();
    physics.update(dt, input);
    if (started) {
      elapsed += dt;
      distance += Math.abs(physics.speed) * dt;
    }

    if (physics.strokeCount !== lastStroke) {
      lastStroke = physics.strokeCount;
      boat.onStroke();
    }

    if (Math.abs(input.throttle) > 0.05 || Math.abs(input.steer) > 0.05) hud.hideHint();

    env = environment.update(dt, worldTime, settings.get('timeOfDay'));
    applyEnvironment(env);

    rig.update(dt, physics, reducedMotion, worldTime);
    chunks.update(dt, physics, camera);

    const nearestFlower = chunks.lightCount > 0 ? chunks.lightSlots[0] : null;
    boat.update(dt, physics, env, worldTime, reducedMotion, nearestFlower);
    for (const event of boat.consumeOarEvents()) {
      wake.spawnRipple(event.x, event.z, event.type === 'enter' ? 0.9 : 0.48);
      if (event.type === 'enter') {
        audio.stroke(physics.strokeStrength);
        audio.splash(0.42 + physics.strokeStrength * 0.5);
      } else {
        audio.splash(0.3);
      }
    }

    water.setLights(chunks.lightSlots, chunks.lightCount);
    water.update(dt, worldTime, camera, physics);
    wake.update(dt, physics, worldTime);
    sky.update(worldTime, camera);
    particles.update(worldTime, physics);
    mist.update(dt, physics);

    moonLight.position.set(
      physics.x + sky.moonDir.x * 60,
      sky.moonDir.y * 60,
      physics.z + sky.moonDir.z * 60,
    );
    moonLight.target.position.set(physics.x, 0, physics.z);
    moonLight.target.updateMatrixWorld();

    chimeCooldown -= dt;
    if (started && chimeCooldown <= 0 && Math.abs(physics.speed) > 0.25) {
      let nearest = Infinity;
      for (let i = 0; i < chunks.lightCount; i += 1) {
        const light = chunks.lightSlots[i];
        const dx = light.x - physics.x;
        const dz = light.z - physics.z;
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      if (nearest < 2.9) {
        audio.chime();
        chimeCooldown = 1.15;
      }
    }

    post.render();

    hud.update(dt, { distance, elapsed, fps: quality.getFps() });
    quality.recordFrame(raw);
    audio.update(dt, { speed: physics.speed, dayness: env.dayness });
  });

  async function begin() {
    if (starting || started) return;
    starting = true;
    startButton.disabled = true;

    const audioReady = await audio.start();
    started = true;
    starting = false;

    hudElement.inert = false;
    refreshPlayState();
    startOverlay.classList.add('is-leaving');
    window.setTimeout(() => {
      startOverlay.hidden = true;
    }, 950);

    if (!audioReady) {
      showToast('Audio is unavailable in this browser. The pond continues in silence.', 4600);
    }
    hud.showHint(11);
    canvas.focus({ preventScroll: true });
  }

  startButton.addEventListener('click', begin);

  rig.snap(physics);
  boat.update(0.016, physics, env, worldTime, reducedMotion, null);
  sky.update(0, camera);
  water.update(0.016, 0, camera, physics);
  resize();
  loop.start();

  window.setTimeout(() => {
    if (!started) startButton.focus({ preventScroll: true });
  }, 600);
}

if (hasWebGL2()) {
  boot();
} else {
  const fallback = document.getElementById('fallback');
  const startOverlay = document.getElementById('start');
  if (startOverlay) startOverlay.hidden = true;
  if (fallback) fallback.hidden = false;
  const sceneCanvas = document.getElementById('scene');
  if (sceneCanvas) sceneCanvas.hidden = true;
}
