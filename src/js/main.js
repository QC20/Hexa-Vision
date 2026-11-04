// ─────────────────────────────────────────────────────────────────────────────
// Hexa Vision
//
// A real-time WebGL visualization simulating compound eye vision
// through animated Voronoi patterns and hexagonal post-processing
//
// By Jonas Kjeldmand Jensen
//
// March 2026
// ─────────────────────────────────────────────────────────────────────────────

// "three" is resolved by the import map in index.html.
import * as THREE from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OrbitControls }   from 'three/examples/jsm/controls/OrbitControls.js';

import {
  RIPPLE_COUNT,
  surfaceVertexShader,
  surfaceFragmentShader,
  hexPassVertexShader,
  hexPassFragmentShader,
} from './shaders.js';
import { PALETTES, randomPalette } from './palettes.js';
import { Tilt, Microphone } from './sensors.js';
import { createUI } from './ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 1;
const BASE_DISTANCE   = 6;
const DRIFT_INTERVAL  = 12;  // seconds between shuffles in drift mode
const DOUBLE_TAP_MS   = 320;
const TAP_MAX_MS      = 350;
const TAP_SLOP_PX     = 10;

// Everything the panel can change. The scene eases toward these values
// rather than jumping to them.
const DEFAULTS = {
  cellSize:      3,     // CSS pixels
  facets:        0,
  gap:           0.06,
  eye:           1,
  displacement:  1.2,
  scale:         6,
  depth:         1,
  noiseScale:    1.5,
  noiseStrength: 1.0,
  outline:       0.5,
  flow:          0.12,
  glow:          1.3,
  spin:          1,
  size:          1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('scene');
let renderer;

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  document.documentElement.classList.add('has-failed');
  throw err;
}

renderer.setClearColor(0x000000, 1);

let pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

// Safari can drop the context when the tab sits in the background for a while.
canvas.addEventListener('webglcontextlost', e => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());

// ─────────────────────────────────────────────────────────────────────────────
// Scene
// ─────────────────────────────────────────────────────────────────────────────

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

// Portrait screens are narrow, so pull the camera back until the spikes fit.
const fitDistance = () => BASE_DISTANCE * Math.max(1, 0.85 / (window.innerWidth / window.innerHeight));
let baseDistance = fitDistance();
camera.position.set(0, 0, baseDistance);

const tiltGroup = new THREE.Group();
scene.add(tiltGroup);

const surfaceUniforms = {
  uTime:                 { value: 0 },
  uFlowTime:             { value: 0 },
  uScale:                { value: DEFAULTS.scale },
  uDepth:                { value: DEFAULTS.depth },
  uColor:                { value: new THREE.Color() },
  uNoiseScale:           { value: DEFAULTS.noiseScale },
  uNoiseStrength:        { value: DEFAULTS.noiseStrength },
  uOutlineWidth:         { value: DEFAULTS.outline },
  uOutlineColor:         { value: new THREE.Color() },
  uSecondaryColor:       { value: new THREE.Color() },
  uDisplacementStrength: { value: DEFAULTS.displacement },
  uRipples:              { value: Array.from({ length: RIPPLE_COUNT }, () => new THREE.Vector4(0, 0, 1, -1000)) },
};

const material = new THREE.ShaderMaterial({
  uniforms: surfaceUniforms,
  vertexShader: surfaceVertexShader,
  fragmentShader: surfaceFragmentShader,
  wireframe: true,
});

const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 30), material);
tiltGroup.add(mesh);

// ─────────────────────────────────────────────────────────────────────────────
// Controls
// One finger or mouse drag spins (with a long glide after a flick),
// pinch or scroll zooms.
// ─────────────────────────────────────────────────────────────────────────────

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.035;
controls.rotateSpeed   = 0.6;
controls.enablePan     = false;
controls.zoomSpeed     = 0.8;
controls.minDistance   = 1.6;
controls.maxDistance   = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Post-Processing
// Bloom runs first so glow stays contained within hex cells.
// The HexaVision pass is the final output.
// ─────────────────────────────────────────────────────────────────────────────

const composer  = new EffectComposer(renderer);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), DEFAULTS.glow, 0.4, 0.0);
const hexPass   = new ShaderPass({
  uniforms: {
    tDiffuse:    { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCellSize:   { value: 6 },
    uFacet:      { value: 0 },
    uGap:        { value: DEFAULTS.gap },
    uPrism:      { value: 0.3 },
    uMix:        { value: 1 },
    uLens:       { value: new THREE.Vector3(0.5, 0.5, 0) },
    uLensRadius: { value: 0.28 },
  },
  vertexShader: hexPassVertexShader,
  fragmentShader: hexPassFragmentShader,
});

composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloomPass);
composer.addPass(hexPass);

// ─────────────────────────────────────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────────────────────────────────────

function resize() {
  const width  = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // Keep whatever zoom the viewer chose, relative to the new framing.
  const next = fitDistance();
  camera.position.multiplyScalar(next / baseDistance);
  baseDistance = next;

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  hexPass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
}

window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

// ─────────────────────────────────────────────────────────────────────────────
// State
// `target` is what the controls ask for; `current` eases toward it each frame.
// ─────────────────────────────────────────────────────────────────────────────

const target  = { ...DEFAULTS };
const current = { ...DEFAULTS };

const colorTarget  = { outline: new THREE.Color(), fill: new THREE.Color(), highlight: new THREE.Color() };
const colorCurrent = { outline: new THREE.Color(), fill: new THREE.Color(), highlight: new THREE.Color() };

let easeRate = 3;

function applyPalette(palette, rate = 3) {
  colorTarget.outline.set(palette.outline);
  colorTarget.fill.set(palette.fill);
  colorTarget.highlight.set(palette.highlight);
  easeRate = rate;
  app.palette = palette;

  const accent = colorTarget.highlight;
  const rgb = [accent.r, accent.g, accent.b].map(c => Math.round(c * 255)).join(', ');
  document.documentElement.style.setProperty('--accent-rgb', rgb);
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = list => list[Math.floor(Math.random() * list.length)];

function shuffle({ slow = false } = {}) {
  Object.assign(target, {
    scale:         rand(2.5, 14),
    depth:         rand(0.4, 1.8),
    noiseScale:    rand(0.3, 4),
    noiseStrength: rand(0, 1.4),
    outline:       rand(0.1, 0.8),
    displacement:  rand(-0.3, 3.2),
  });
  applyPalette(Math.random() < 0.55 ? pick(PALETTES) : randomPalette(), slow ? 0.6 : 2.2);
  driftClock = 0;
  ui.sync();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ripples
// ─────────────────────────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const hitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
let rippleIndex = 0;
let elapsed = 0;

function addRipple(direction) {
  surfaceUniforms.uRipples.value[rippleIndex].set(direction.x, direction.y, direction.z, elapsed);
  rippleIndex = (rippleIndex + 1) % RIPPLE_COUNT;
}

// Where on the sphere (in its own rotating space) a screen point lands.
// A miss still counts: it uses the closest point along the ray instead.
function surfaceDirection(clientX, clientY) {
  pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  hitSphere.radius = Math.max(current.size, 0.01) * 1.05;

  const point = new THREE.Vector3();
  if (!raycaster.ray.intersectSphere(hitSphere, point)) {
    raycaster.ray.closestPointToPoint(hitSphere.center, point);
  }
  return mesh.worldToLocal(point).normalize();
}

function randomDirection() {
  return new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestures
// Tap → ripple, double tap → shuffle, press and drag → fisheye under the finger.
// Built on pointer events because iOS doesn't send dblclick to a canvas
// with touch-action: none.
// ─────────────────────────────────────────────────────────────────────────────

const pointers = new Map();
const lens = { x: 0.5, y: 0.5, strength: 0, active: false };
let gestureHadMultiTouch = false;
let lastTap = { time: 0, x: 0, y: 0 };

function moveLens(e) {
  lens.x = e.clientX / window.innerWidth;
  lens.y = 1 - e.clientY / window.innerHeight;
}

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, time: performance.now(), moved: false });
  canvas.classList.add('is-grabbing');

  if (pointers.size === 1) {
    lens.active = true;
    moveLens(e);
  } else {
    gestureHadMultiTouch = true;
    lens.active = false;
  }
});

canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP_PX) p.moved = true;
  if (lens.active) moveLens(e);
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);

  const isTap = e.type === 'pointerup' && !p.moved && !gestureHadMultiTouch
    && performance.now() - p.time < TAP_MAX_MS;
  if (isTap) handleTap(e.clientX, e.clientY);

  if (pointers.size === 0) {
    lens.active = false;
    gestureHadMultiTouch = false;
    canvas.classList.remove('is-grabbing');
  }
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function handleTap(x, y) {
  addRipple(surfaceDirection(x, y));

  const now = performance.now();
  if (now - lastTap.time < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
    shuffle();
    lastTap.time = 0;
  } else {
    lastTap = { time: now, x, y };
  }
}

// Stop Safari from zooming the page itself.
document.addEventListener('gesturestart', e => e.preventDefault());

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot & Fullscreen
// ─────────────────────────────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const bytes = atob(data);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: header.match(/:(.*?);/)[1] });
}

async function snapshot() {
  // Read the canvas straight after rendering, before the browser clears it.
  composer.render();
  const blob = dataUrlToBlob(canvas.toDataURL('image/png'));
  const name = `hexa-vision-${Date.now()}.png`;

  // On tablets and phones the share sheet is the natural way to save to Photos.
  const file = new File([blob], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Hexa Vision' });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  return 'saved';
}

const root = document.documentElement;
const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen)
  && (document.fullscreenEnabled || document.webkitFullscreenEnabled);

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// App API (used by the control panel)
// ─────────────────────────────────────────────────────────────────────────────

const tilt = new Tilt();
const mic  = new Microphone();
let driftClock = 0;

const app = {
  params: target,
  palettes: PALETTES,
  palette: PALETTES[0],
  drift: false,
  tilt,
  mic,
  canFullscreen,

  get wireframe() { return material.wireframe; },

  setParam(key, value) {
    target[key] = value;
    easeRate = 10;
    if (app.drift) app.setDrift(false);
  },
  setDrift(on) {
    app.drift = on;
    driftClock = DRIFT_INTERVAL - 1.5; // first change comes almost straight away
    ui.sync();
  },
  choosePalette(palette) {
    applyPalette(palette);
    if (app.drift) app.setDrift(false);
  },
  setWireframe(on) { material.wireframe = on; },
  setEye(on) { app.setParam('eye', on ? 1 : 0); },
  shuffle,
  snapshot,
  toggleFullscreen,
};

const ui = createUI(app);
applyPalette(PALETTES[0]);
for (const key in colorCurrent) colorCurrent[key].copy(colorTarget[key]);

// ─────────────────────────────────────────────────────────────────────────────
// Intro
// The eye starts badly out of focus (huge cells, no glow, nothing there)
// and settles into the default look once the title overlay clears.
// ─────────────────────────────────────────────────────────────────────────────

Object.assign(current, { cellSize: 70, size: 0, glow: 0, displacement: -0.5 });
const introTarget = { ...target };
Object.assign(target, current);

function beginReveal() {
  Object.assign(target, introTarget);
  easeRate = 1.6;
  addRipple(new THREE.Vector3(0, 0, 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptive Resolution
// If the device can't keep up, render fewer pixels. The hex mosaic hides most
// of the difference.
// ─────────────────────────────────────────────────────────────────────────────

const perf = { time: 0, frames: 0, warmup: 3 };

function watchPerformance(dt, rawDt) {
  if (rawDt > 0.25) { perf.time = 0; perf.frames = 0; return; } // tab was hidden
  if (perf.warmup > 0) { perf.warmup -= dt; return; }

  perf.time += dt;
  perf.frames++;
  if (perf.time < 2) return;

  const fps = perf.frames / perf.time;
  if (fps < 40 && pixelRatio > MIN_PIXEL_RATIO) {
    pixelRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio - 0.25);
    resize();
  }
  perf.time = 0;
  perf.frames = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation Loop
// ─────────────────────────────────────────────────────────────────────────────

let lastTime = performance.now();
let flowTime = 0;
let bassAverage = 0;
let lastBeat = 0;
let started = false;

function animate(now) {
  requestAnimationFrame(animate);

  const rawDt = (now - lastTime) / 1000;
  const dt = Math.min(Math.max(rawDt, 0), 0.1);
  lastTime = now;
  elapsed += dt;

  // Ease everything toward its target.
  const k = 1 - Math.exp(-dt * easeRate);
  for (const key in target) current[key] += (target[key] - current[key]) * k;
  for (const key in colorTarget) colorCurrent[key].lerp(colorTarget[key], k);

  lens.strength += ((lens.active ? 1 : 0) - lens.strength) * (1 - Math.exp(-dt * 7));

  // Drift mode.
  if (app.drift) {
    driftClock += dt;
    if (driftClock > DRIFT_INTERVAL) shuffle({ slow: true });
  }

  // Microphone: loudness swells the spikes, bass hits send ripples.
  mic.update();
  if (mic.active) {
    bassAverage += (mic.bass - bassAverage) * 0.05;
    if (mic.bass > 0.25 && mic.bass > bassAverage * 1.35 && elapsed - lastBeat > 0.28) {
      addRipple(randomDirection());
      lastBeat = elapsed;
    }
  }

  // Surface.
  flowTime += dt * current.flow;
  surfaceUniforms.uTime.value                 = elapsed;
  surfaceUniforms.uFlowTime.value             = flowTime;
  surfaceUniforms.uScale.value                = current.scale;
  surfaceUniforms.uDepth.value                = current.depth;
  surfaceUniforms.uNoiseScale.value           = current.noiseScale;
  surfaceUniforms.uNoiseStrength.value        = current.noiseStrength;
  surfaceUniforms.uOutlineWidth.value         = current.outline;
  surfaceUniforms.uDisplacementStrength.value = current.displacement + mic.level * 1.6;
  surfaceUniforms.uColor.value.copy(colorCurrent.highlight);
  surfaceUniforms.uOutlineColor.value.copy(colorCurrent.outline);
  surfaceUniforms.uSecondaryColor.value.copy(colorCurrent.fill);

  // Post.
  bloomPass.strength = current.glow + mic.bass * 0.9;
  const hex = hexPass.uniforms;
  hex.uCellSize.value = Math.max(1, current.cellSize * pixelRatio);
  hex.uFacet.value    = current.facets;
  hex.uGap.value      = current.gap;
  hex.uMix.value      = current.eye;
  hex.uLens.value.set(lens.x, lens.y, lens.strength);

  // Motion.
  mesh.scale.setScalar(Math.max(current.size, 0.0001));
  mesh.rotation.x += 0.012 * current.spin * dt;
  mesh.rotation.y += 0.06  * current.spin * dt;
  mesh.rotation.z += 0.012 * current.spin * dt;

  const tk = 1 - Math.exp(-dt * 4);
  tiltGroup.rotation.y += (tilt.x * 0.6 - tiltGroup.rotation.y) * tk;
  tiltGroup.rotation.x += (tilt.y * 0.6 - tiltGroup.rotation.x) * tk;

  controls.update();
  composer.render();
  watchPerformance(dt, rawDt);

  if (!started) {
    started = true;
    window.__hexaVisionReady = true;
    ui.playIntro({ onReveal: beginReveal });
  }
}

requestAnimationFrame(animate);
