import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.5 },
    uTint: { value: new THREE.Color(0xffffff) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform vec3 uTint;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(color, color * vec3(0.93, 0.985, 1.06), 0.16);
      color = mix(color, color * uTint, smoothstep(0.15, 0.8, luminance) * 0.2);

      vec2 p = vUv - 0.5;
      float edge = smoothstep(0.32, 0.92, length(p * vec2(1.0, 1.12)));
      color *= 1.0 - edge * uStrength;

      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

export function createRenderer(canvas, profile) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });

  renderer.setPixelRatio(profile.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x05070f, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = false;

  return renderer;
}

export function createPost(renderer, scene, camera, profile) {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: profile.msaa,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(profile.dpr);
  composer.setSize(size.x || window.innerWidth, size.y || window.innerHeight);

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x || window.innerWidth, size.y || window.innerHeight),
    0.9,
    0.7,
    0.6,
  );
  const vignettePass = new ShaderPass(vignetteShader);
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(vignettePass);
  composer.addPass(outputPass);

  const post = {
    composer,
    bloomPass,
    vignettePass,
    renderer,
    msaa: profile.msaa,

    setQuality(nextProfile) {
      bloomPass.enabled = nextProfile.bloom;
      bloomPass.strength = nextProfile.bloomScale;
    },

    applyEnvironment(env, nextProfile) {
      bloomPass.enabled = nextProfile.bloom;
      bloomPass.strength = env.bloomStrength * nextProfile.bloomScale;
      bloomPass.radius = env.bloomRadius;
      bloomPass.threshold = env.bloomThreshold;
      vignettePass.uniforms.uStrength.value = 0.52 - env.dayness * 0.26;
      vignettePass.uniforms.uTint.value.setRGB(1.0, 0.98, 0.94);
    },

    resize(width, height, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
    },

    render() {
      composer.render();
    },

    dispose() {
      composer.dispose();
      target.dispose();
    },
  };

  post.setQuality(profile);
  return post;
}
