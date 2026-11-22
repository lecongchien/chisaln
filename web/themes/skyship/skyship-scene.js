/**
 * Skyship Theme Scene Controller — "Tàu giữa Biển Mây" (Sky Galleon & Cloud Sea)
 * Orchestrates AdaptiveField SDF icon clouds, Day/Sunset/Night/Auto solar clock transitions,
 * CPU-precomputed lunar occlusion, buoyant multiplane sky fleet, and 60 FPS HostBridge sync.
 */
import {
  AdaptiveField,
  FIELD_STEP,
  createShaderProgram,
  createFieldTexture,
  uploadFieldTexture,
  createSeamlessNoiseTexture,
  sampleSeamlessNoise,
  computeRenderDpr
} from '../../core/field-engine.js';
import { createHostBridge } from '../../core/host-bridge.js';
import { SKYSHIP_FS } from './skyship-shader.js';
import { createSkyshipFleet } from './skyship-fleet.js';

const DEFAULTS = {
  timeMode: 1,     // 0 = Day, 1 = Golden Twilight Sunset (signature default!), 2 = Starlit Night, 3 = Auto
  adaptive: 1,
  sigma: 72,
  warp: 34,
  cloudSea: 0.78,
  flow: 1.0,
  showMeteors: 1,
  showEscort: 1,
  showGlider: 1
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

const prog = createShaderProgram(gl, SKYSHIP_FS);
const U = {
  uFA: gl.getUniformLocation(prog, 'uFA'),
  uFB: gl.getUniformLocation(prog, 'uFB'),
  uNoise: gl.getUniformLocation(prog, 'uNoise'),
  uGalleonHullTex: gl.getUniformLocation(prog, 'uGalleonHullTex'),
  uGalleonSailsTex: gl.getUniformLocation(prog, 'uGalleonSailsTex'),
  uGalleonSailMap: gl.getUniformLocation(prog, 'uGalleonSailMap'),
  uSkiffHullTex: gl.getUniformLocation(prog, 'uSkiffHullTex'),
  uSkiffSailsTex: gl.getUniformLocation(prog, 'uSkiffSailsTex'),
  uSkiffSailMap: gl.getUniformLocation(prog, 'uSkiffSailMap'),
  uFgTex: gl.getUniformLocation(prog, 'uFgTex'),
  uRes: gl.getUniformLocation(prog, 'uRes'),
  uGrid: gl.getUniformLocation(prog, 'uGrid'),
  uStep: gl.getUniformLocation(prog, 'uStep'),
  uDpr: gl.getUniformLocation(prog, 'uDpr'),
  uMix: gl.getUniformLocation(prog, 'uMix'),
  uTime: gl.getUniformLocation(prog, 'uTime'),
  uWindTime: gl.getUniformLocation(prog, 'uWindTime'),
  uWindSpeed: gl.getUniformLocation(prog, 'uWindSpeed'),
  uAdaptive: gl.getUniformLocation(prog, 'uAdaptive'),
  uCloudSea: gl.getUniformLocation(prog, 'uCloudSea'),
  uSunset: gl.getUniformLocation(prog, 'uSunset'),
  uNight: gl.getUniformLocation(prog, 'uNight'),
  uMoonOcc: gl.getUniformLocation(prog, 'uMoonOcc'),
  uMoonVis: gl.getUniformLocation(prog, 'uMoonVis'),
  uGalleonReady: gl.getUniformLocation(prog, 'uGalleonReady'),
  uSkiffReady: gl.getUniformLocation(prog, 'uSkiffReady'),
  uShowEscort: gl.getUniformLocation(prog, 'uShowEscort'),
  uShowMeteors: gl.getUniformLocation(prog, 'uShowMeteors'),
  uSeed: gl.getUniformLocation(prog, 'uSeed'),
  uGalleonRect: gl.getUniformLocation(prog, 'uGalleonRect'),
  uGalleonTilt: gl.getUniformLocation(prog, 'uGalleonTilt'),
  uSkiffRect: gl.getUniformLocation(prog, 'uSkiffRect'),
  uSkiffTilt: gl.getUniformLocation(prog, 'uSkiffTilt')
};

const field = new AdaptiveField(FIELD_STEP);
const noiseTex = createSeamlessNoiseTexture(gl, 256);

let texA = null, texB = null;
let sdfA = null, sdfB = null;
let activeIcons = [];
let mixStart = 0, mixDuration = 540, curMix = 1.0;
let W = 1, H = 1, dpr = 1;
let paused = false, needsInitialSettle = true;
const SCENE_SEED = 27.9;

let simTime = 0, flowTime = 0, lastRaf = 0, lastDraw = 0;
let sunsetMix = 1.0, nightMix = 0.0, moodInitialized = false;

const fleet = createSkyshipFleet(gl, () => {
  if (paused) renderFrame(simTime);
});

function sampleSdfB(px, py) {
  return sdfB ? field.sample(sdfB, px, py) : 999;
}

function sstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function targetMoodFromClock() {
  const mode = Math.round(P.timeMode ?? 1);
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

function computeMoonOcclusion() {
  if (nightMix <= 0.02) return { occ: 0, vis: 1 };
  const mx = W * 0.80, my = H * 0.145;
  const nxM = mx / Math.max(1, W), nyM = my / Math.max(1, H);
  const rightCenterY = (0.56 + 0.06 * nightMix) - (nxM - 0.50) * 0.64;
  const rightWall = sstep(0.42, 0.96, nxM) * Math.exp(-Math.pow((nyM - rightCenterY) / 0.34, 2));
  const leftBank = (1.0 - sstep(0.16, 0.54, nxM)) * Math.exp(-Math.pow((nyM - 0.34) / 0.28, 2));
  const lowHorizon = sstep(0.45, 0.95, nyM) * 0.86;
  const cov = Math.min(0.96, (rightWall * 0.96 + leftBank * 0.84 + lowHorizon * 0.74) * (0.45 + 0.68 * P.cloudSea));
  if (cov <= 0.015) return { occ: 0, vis: 1 };
  const qx = (mx - flowTime * 14.5) / 325, qy = my / 215;
  const r1 = sampleSeamlessNoise(noiseTex, qx * 56, qy * 56, 256, SCENE_SEED, 0);
  const g1 = sampleSeamlessNoise(noiseTex, qx * 56, qy * 56, 256, SCENE_SEED, 1);
  const r2 = sampleSeamlessNoise(noiseTex, qx * 112 + 41, qy * 112 + 19, 256, SCENE_SEED, 0);
  const shape = r1 * 0.56 + r2 * 0.30 + g1 * 0.14;
  const thresh = 1 - cov;
  const occ = sstep(thresh - 0.06, thresh + 0.075, shape);
  return { occ, vis: 1 - occ * 0.68 };
}

function allocResources() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  dpr = computeRenderDpr(W, H, isPreview);

  glCanvas.width = Math.round(W * dpr);
  glCanvas.height = Math.round(H * dpr);

  field.resize(W, H);
  if (texA) gl.deleteTexture(texA);
  if (texB) gl.deleteTexture(texB);
  texA = createFieldTexture(gl, field.gw, field.gh);
  texB = createFieldTexture(gl, field.gw, field.gh);

  const rects = P.adaptive >= 0.5 ? activeIcons : [];
  const initSdf = field.compute(rects, P.sigma, P.warp, 0.36);
  sdfA = initSdf; sdfB = initSdf;
  uploadFieldTexture(gl, texA, field, sdfA);
  uploadFieldTexture(gl, texB, field, sdfB);
  curMix = 1.0;

  fleet.resize(W, H);
}

function commitField(animate = true) {
  if (!texA || !texB) return;
  const rects = P.adaptive >= 0.5 ? activeIcons : [];
  const nextSdf = field.compute(rects, P.sigma, P.warp, 0.36);
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

function renderFrame(t) {
  fleet.renderAndUpload(t, {
    W, H,
    flow: P.flow,
    showEscort: P.showEscort,
    showGlider: P.showGlider
  });

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
  gl.bindTexture(gl.TEXTURE_2D, fleet.galleonHullTexture);
  gl.uniform1i(U.uGalleonHullTex, 3);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, fleet.fgTexture);
  gl.uniform1i(U.uFgTex, 4);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, fleet.galleonSailsTexture);
  gl.uniform1i(U.uGalleonSailsTex, 5);

  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, fleet.galleonSailMapTexture);
  gl.uniform1i(U.uGalleonSailMap, 6);

  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, fleet.skiffHullTexture);
  gl.uniform1i(U.uSkiffHullTex, 7);

  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, fleet.skiffSailsTexture);
  gl.uniform1i(U.uSkiffSailsTex, 8);

  gl.activeTexture(gl.TEXTURE9);
  gl.bindTexture(gl.TEXTURE_2D, fleet.skiffSailMapTexture);
  gl.uniform1i(U.uSkiffSailMap, 9);

  const moon = computeMoonOcclusion();
  gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(U.uGrid, field.gw, field.gh);
  gl.uniform1f(U.uStep, field.step);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uMix, curMix);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uWindTime, flowTime);
  gl.uniform1f(U.uWindSpeed, Math.max(0.0, P.flow));
  gl.uniform1f(U.uAdaptive, P.adaptive);
  gl.uniform1f(U.uCloudSea, P.cloudSea);
  gl.uniform1f(U.uSunset, sunsetMix);
  gl.uniform1f(U.uNight, nightMix);
  gl.uniform1f(U.uMoonOcc, moon.occ);
  gl.uniform1f(U.uMoonVis, moon.vis);
  gl.uniform1f(U.uGalleonReady, fleet.galleonReady);
  gl.uniform1f(U.uSkiffReady, fleet.skiffReady);
  gl.uniform1f(U.uShowEscort, P.showEscort);
  gl.uniform1f(U.uShowMeteors, P.showMeteors);
  gl.uniform1f(U.uSeed, SCENE_SEED);

  const gr = fleet.galleonRect;
  const gt = fleet.galleonTilt;
  gl.uniform4f(U.uGalleonRect, gr[0], gr[1], gr[2], gr[3]);
  gl.uniform2f(U.uGalleonTilt, gt[0], gt[1]);

  const sr = fleet.skiffRect;
  const st = fleet.skiffTilt;
  gl.uniform4f(U.uSkiffRect, sr[0], sr[1], sr[2], sr[3]);
  gl.uniform2f(U.uSkiffTilt, st[0], st[1]);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function tick(now) {
  requestAnimationFrame(tick);

  const tgt = targetMoodFromClock();
  if (!moodInitialized) {
    sunsetMix = tgt.sunset;
    nightMix = tgt.night;
    moodInitialized = true;
  }
  const moodChanging = Math.abs(tgt.sunset - sunsetMix) > 0.002 || Math.abs(tgt.night - nightMix) > 0.002;
  if (paused && !needsInitialSettle && !moodChanging) {
    lastRaf = 0;
    return;
  }

  // Smooth vsync-aligned 60 FPS on desktop; lighter 35 FPS in preview iframe
  const targetInterval = isPreview ? 28 : 12;
  if (!needsInitialSettle && lastDraw && now - lastDraw < targetInterval) return;

  const dt = lastRaf ? Math.min(0.05, (now - lastRaf) / 1000) : 0.0167;
  lastRaf = now;
  lastDraw = now;

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
    fleet.step(dt, {
      W, H,
      flow: P.flow,
      showGlider: P.showGlider,
      sampleSdf: sampleSdfB,
      adaptive: P.adaptive
    });
  }

  renderFrame(simTime);
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
