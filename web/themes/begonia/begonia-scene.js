/**
 * Big Fish & Begonia Scene Controller — "Đại Ngư Hải Đường"
 * Orchestrates AdaptiveField SDF ripples/halos, Day/Sunset/Night/Auto transitions (defaulting to
 * iconic Lantern Night), CPU solar/lunar cloud occlusion, articulated 24-segment Great Fish Kun,
 * floating lotus lanterns, drifting Begonia petals, and 60 FPS HostBridge sync.
 */
import {
  AdaptiveField,
  FIELD_STEP,
  createShaderProgram,
  createFieldTexture,
  uploadFieldTexture,
  createSeamlessNoiseTexture,
  sampleSeamlessNoise,
  computeRenderDpr,
  createPerfGovernor
} from '../../core/field-engine.js';
import { createHostBridge } from '../../core/host-bridge.js';
import { resolveMoonConfig, createMoonSurfaceLoader } from '../../core/moon-phase.js';
import { BEGONIA_FS } from './begonia-shader.js';
import { createBegoniaSpirit } from './begonia-spirit.js';

const DEFAULTS = {
  timeMode: 2,      // 0 = Day, 1 = Vermilion Sunset, 2 = Starlit Lantern Night (iconic default!), 3 = Auto
  waterMist: 0.68,
  flow: 1.0,
  showMeteors: 1,
  adaptive: 1,
  sigma: 68,
  warp: 28,
  showFish: 1,
  showPetals: 1,
  showLanterns: 1
};
const P = { ...DEFAULTS };

const isPreview = new URLSearchParams(location.search).get('preview') === '1';
const glCanvas = document.getElementById('gl');
const demoContainer = document.getElementById('demo-icons');

const gl = glCanvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: 'default'
});

if (!gl) {
  document.getElementById('nogl').style.display = 'grid';
  throw new Error('WebGL2 unavailable');
}

gl.getExtension('OES_texture_half_float_linear');

const prog = createShaderProgram(gl, BEGONIA_FS);
const U = {
  uFA: gl.getUniformLocation(prog, 'uFA'),
  uFB: gl.getUniformLocation(prog, 'uFB'),
  uNoise: gl.getUniformLocation(prog, 'uNoise'),
  uTulouTex: gl.getUniformLocation(prog, 'uTulouTex'),
  uBranchTex: gl.getUniformLocation(prog, 'uBranchTex'),
  uSpiritTex: gl.getUniformLocation(prog, 'uSpiritTex'),
  uMoonTex: gl.getUniformLocation(prog, 'uMoonTex'),
  uRes: gl.getUniformLocation(prog, 'uRes'),
  uGrid: gl.getUniformLocation(prog, 'uGrid'),
  uStep: gl.getUniformLocation(prog, 'uStep'),
  uDpr: gl.getUniformLocation(prog, 'uDpr'),
  uMix: gl.getUniformLocation(prog, 'uMix'),
  uTime: gl.getUniformLocation(prog, 'uTime'),
  uWindTime: gl.getUniformLocation(prog, 'uWindTime'),
  uWindSpeed: gl.getUniformLocation(prog, 'uWindSpeed'),
  uAdaptive: gl.getUniformLocation(prog, 'uAdaptive'),
  uWaterMist: gl.getUniformLocation(prog, 'uWaterMist'),
  uSunset: gl.getUniformLocation(prog, 'uSunset'),
  uNight: gl.getUniformLocation(prog, 'uNight'),
  uMoonOcc: gl.getUniformLocation(prog, 'uMoonOcc'),
  uMoonVis: gl.getUniformLocation(prog, 'uMoonVis'),
  uSunVis: gl.getUniformLocation(prog, 'uSunVis'),
  uShowMeteors: gl.getUniformLocation(prog, 'uShowMeteors'),
  uTulouReady: gl.getUniformLocation(prog, 'uTulouReady'),
  uBranchReady: gl.getUniformLocation(prog, 'uBranchReady'),
  uMoonPhase: gl.getUniformLocation(prog, 'uMoonPhase'),
  uSeed: gl.getUniformLocation(prog, 'uSeed'),
  uTulouRect: gl.getUniformLocation(prog, 'uTulouRect'),
  uBranchRect: gl.getUniformLocation(prog, 'uBranchRect')
};

const field = new AdaptiveField(FIELD_STEP);
const noiseTex = createSeamlessNoiseTexture(gl, 256);

let texA = null, texB = null;
let sdfA = null, sdfB = null;
let activeIcons = [];
let mixStart = 0, mixDuration = 540, curMix = 1.0;
let W = 1, H = 1, dpr = 1;
let paused = false, needsInitialSettle = true;
const SCENE_SEED = 43.2;

let simTime = 0, flowTime = 0, lastRaf = 0, lastDraw = 0;
let sunsetMix = 0.0, nightMix = 1.0, moodInitialized = false;
let moonCfg = { mode: 'full', date: '2000-08-15' };
let moonPhase = 0.5;

const spirit = createBegoniaSpirit(gl, () => {
  if (paused) renderFrame(simTime);
});
const moonSurface = createMoonSurfaceLoader(gl, () => {
  if (paused) renderFrame(simTime, false);
});

function sampleSdfB(px, py) {
  return sdfB ? field.sample(sdfB, px, py) : 999;
}

function sstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function targetMoodFromClock() {
  const mode = Math.round(P.timeMode ?? 2);
  if (mode === 0) return { sunset: 0.0, night: 0.0 };
  if (mode === 1) return { sunset: 1.0, night: 0.0 };
  if (mode === 2) return { sunset: 0.0, night: 1.0 };
  const now = new Date();
  const hr = now.getHours() + now.getMinutes() / 60;
  if (hr >= 19.25 || hr < 5.25) return { sunset: 0.0, night: 1.0 };
  if (hr >= 6.5 && hr < 16.75) return { sunset: 0.0, night: 0.0 };
  if (hr >= 16.75 && hr < 18.0) return { sunset: sstep(16.75, 18.0, hr), night: 0.0 };
  if (hr >= 18.0 && hr < 19.25) {
    const k = sstep(18.0, 19.25, hr);
    return { sunset: 1.0 - k, night: k };
  }
  const k = sstep(5.25, 6.5, hr);
  return { sunset: Math.sin(k * Math.PI) * 0.65, night: 1.0 - k };
}

function computeSkyBodyOcclusion(nxPos, nyPos) {
  const skyT = Math.max(0, Math.min(1, nyPos / 0.56));
  const cov = Math.min(0.86, sstep(0.10, 0.44, skyT) * (1.0 - sstep(0.76, 1.02, skyT)) * (0.42 + 0.52 * P.waterMist));
  if (cov <= 0.015) return 0;
  const px = W * nxPos, py = H * nyPos;
  const qx = (px - flowTime * 13.0) / 310, qy = py / 175;
  const r1 = sampleSeamlessNoise(noiseTex, qx * 56, qy * 56, 256, SCENE_SEED, 0);
  const g1 = sampleSeamlessNoise(noiseTex, qx * 56, qy * 56, 256, SCENE_SEED, 1);
  const r2 = sampleSeamlessNoise(noiseTex, qx * 112 + 37, qy * 112 + 23, 256, SCENE_SEED, 0);
  const shape = r1 * 0.58 + r2 * 0.28 + g1 * 0.14;
  const thresh = 1 - cov;
  return sstep(thresh - 0.065, thresh + 0.085, shape);
}

const perf = createPerfGovernor({
  isPreview,
  onQualityChange() {
    dpr = computeRenderDpr(W, H, isPreview, perf.qualityScale);
    glCanvas.width = Math.max(1, Math.round(W * dpr));
    glCanvas.height = Math.max(1, Math.round(H * dpr));
  }
});

function allocResources() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  dpr = computeRenderDpr(W, H, isPreview, perf.qualityScale);

  glCanvas.width = Math.max(1, Math.round(W * dpr));
  glCanvas.height = Math.max(1, Math.round(H * dpr));

  field.resize(W, H);
  if (texA) gl.deleteTexture(texA);
  if (texB) gl.deleteTexture(texB);
  texA = createFieldTexture(gl, field.gw, field.gh);
  texB = createFieldTexture(gl, field.gw, field.gh);

  const rects = P.adaptive >= 0.5 ? activeIcons : [];
  const initSdf = field.compute(rects, P.sigma, P.warp, 0.34);
  sdfA = initSdf; sdfB = initSdf;
  uploadFieldTexture(gl, texA, field, sdfA);
  uploadFieldTexture(gl, texB, field, sdfB);
  curMix = 1.0;

  spirit.resize(W, H);
}

function commitField(animate = true) {
  if (!texA || !texB) return;
  const rects = P.adaptive >= 0.5 ? activeIcons : [];
  const nextSdf = field.compute(rects, P.sigma, P.warp, 0.34);
  if (!animate || !sdfB) {
    sdfA = nextSdf; sdfB = nextSdf;
    uploadFieldTexture(gl, texA, field, sdfA);
    uploadFieldTexture(gl, texB, field, sdfB);
    curMix = 1.0;
  } else {
    if (curMix < 0.99 && sdfA) {
      const blended = new Float32Array(sdfB.length);
      const m = curMix, im = 1 - m;
      for (let i = 0; i < blended.length; i++) blended[i] = sdfA[i] * im + sdfB[i] * m;
      sdfA = blended;
    } else {
      sdfA = sdfB;
    }
    sdfB = nextSdf;
    uploadFieldTexture(gl, texA, field, sdfA);
    uploadFieldTexture(gl, texB, field, sdfB);
    curMix = 0.0;
    mixStart = performance.now();
  }
  if (paused) renderFrame(simTime);
}

function renderFrame(t, upload2d = true) {
  if (upload2d) {
    spirit.renderAndUpload(t, {
      W, H,
      showFish: P.showFish,
      showPetals: P.showPetals,
      showLanterns: P.showLanterns,
      sunset: sunsetMix,
      night: nightMix
    });
  }

  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.disable(gl.BLEND);
  gl.useProgram(prog);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.uniform1i(U.uFA, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texB);
  gl.uniform1i(U.uFB, 1);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, noiseTex);
  gl.uniform1i(U.uNoise, 2);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, spirit.tulouTexture);
  gl.uniform1i(U.uTulouTex, 3);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, spirit.branchTexture);
  gl.uniform1i(U.uBranchTex, 4);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, spirit.spiritTexture);
  gl.uniform1i(U.uSpiritTex, 5);

  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, moonSurface.texture);
  gl.uniform1i(U.uMoonTex, 6);

  const moonOcc = nightMix > 0.02 ? computeSkyBodyOcclusion(0.28, 0.18) : 0;
  const sunOcc  = sunsetMix > 0.02 ? computeSkyBodyOcclusion(0.36, 0.44) : 0;

  gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(U.uGrid, field.gw, field.gh);
  gl.uniform1f(U.uStep, field.step);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uMix, curMix);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uWindTime, flowTime);
  gl.uniform1f(U.uWindSpeed, Math.max(0.0, P.flow));
  gl.uniform1f(U.uAdaptive, P.adaptive);
  gl.uniform1f(U.uWaterMist, P.waterMist);
  gl.uniform1f(U.uSunset, sunsetMix);
  gl.uniform1f(U.uNight, nightMix);
  gl.uniform1f(U.uMoonOcc, moonOcc);
  gl.uniform1f(U.uMoonVis, 1 - moonOcc * 0.65);
  gl.uniform1f(U.uSunVis, 1 - sunOcc * 0.60);
  gl.uniform1f(U.uShowMeteors, P.showMeteors);
  gl.uniform1f(U.uTulouReady, spirit.tulouReady);
  gl.uniform1f(U.uBranchReady, spirit.branchReady);
  gl.uniform1f(U.uMoonPhase, moonPhase);
  gl.uniform1f(U.uSeed, SCENE_SEED);

  const tr = spirit.tulouRect;
  const br = spirit.branchRect;
  gl.uniform4f(U.uTulouRect, tr[0], tr[1], tr[2], tr[3]);
  gl.uniform4f(U.uBranchRect, br[0], br[1], br[2], br[3]);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function tick(now) {
  requestAnimationFrame(tick);

  if (perf.isHidden) {
    lastRaf = 0;
    perf.resetTiming();
    return;
  }

  const tgt = targetMoodFromClock();
  if (!moodInitialized) {
    sunsetMix = tgt.sunset;
    nightMix = tgt.night;
    moodInitialized = true;
  }
  const moodChanging = Math.abs(tgt.sunset - sunsetMix) > 0.002 || Math.abs(tgt.night - nightMix) > 0.002;
  if (paused && !needsInitialSettle && !moodChanging) {
    lastRaf = 0;
    perf.resetTiming();
    return;
  }

  if (!needsInitialSettle && lastDraw && now - lastDraw < perf.targetInterval) return;

  const elapsedMs = lastRaf ? (now - lastRaf) : 16.7;
  const dt = lastRaf ? Math.min(0.05, elapsedMs / 1000) : 0.0167;
  lastRaf = now;
  lastDraw = now;
  perf.reportFrame(elapsedMs, now);

  const k = Math.min(1, dt * 1.45);
  sunsetMix += (tgt.sunset - sunsetMix) * k;
  nightMix  += (tgt.night  - nightMix)  * k;
  if (Math.abs(tgt.sunset - sunsetMix) < 0.002) sunsetMix = tgt.sunset;
  if (Math.abs(tgt.night  - nightMix)  < 0.002) nightMix  = tgt.night;

  if (!paused || needsInitialSettle) {
    simTime += dt;
    flowTime += dt * Math.max(0.0, P.flow);
    if (curMix < 1.0) {
      const rawT = Math.min(1, (now - mixStart) / mixDuration);
      curMix = 1 - Math.pow(1 - rawT, 3);
    }
    spirit.step(dt, {
      W, H,
      flow: P.flow,
      showFish: P.showFish,
      showPetals: P.showPetals,
      showLanterns: P.showLanterns,
      sampleSdf: sampleSdfB,
      adaptive: P.adaptive
    });
  }

  renderFrame(simTime, perf.shouldUpload2d(now, needsInitialSettle));
  needsInitialSettle = false;
}

const bridge = createHostBridge({
  onSettings(partial) {
    let fieldDirty = false;
    for (const [k, v] of Object.entries(partial)) {
      if (!(k in P)) continue;
      const num = Number(v);
      if (!Number.isFinite(num) || P[k] === num) continue;
      P[k] = num;
      if (k === 'adaptive' || k === 'sigma' || k === 'warp') fieldDirty = true;
      if (k === 'timeMode' && (!moodInitialized || paused)) {
        const tgt = targetMoodFromClock();
        sunsetMix = tgt.sunset;
        nightMix = tgt.night;
        moodInitialized = true;
      }
    }
    if (fieldDirty) commitField(false);
    if (paused) renderFrame(simTime);
  },
  onReset() {
    Object.assign(P, DEFAULTS);
    commitField(true);
  },
  onIcons(mapped) {
    activeIcons = mapped;
    commitField(true);
    needsInitialSettle = true;
  },
  onPause(isPaused, iconsSeen) {
    paused = isPaused;
    if (paused && iconsSeen) {
      curMix = 1.0;
      needsInitialSettle = true;
    }
  },
  onMoon(cfg) {
    moonCfg = cfg;
    moonPhase = resolveMoonConfig(moonCfg).phase;
    if (paused) renderFrame(simTime, false);
  },
  getCanvases: () => ({ glCanvas, overlayCanvas: null }),
  renderNow: () => renderFrame(simTime)
});

activeIcons = bridge.getIcons();
allocResources();
bridge.setupStandaloneDemoIcons(demoContainer);

window.addEventListener('resize', () => {
  activeIcons = bridge.getIcons();
  allocResources();
  renderFrame(simTime);
});

bridge.notifyReady();
requestAnimationFrame(tick);
