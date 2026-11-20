/**
 * Theme #3: Alpine Moving Castle Scene Controller
 * Orchestrates AdaptiveField SDF, Day/Sunset/Night/Auto solar transitions,
 * Howl's Moving Castle mechanical walker, thatched cottage + shepherd + grazing sheep flock,
 * occasional Studio Ghibli wind ribbons, WebGL2 render loop, and HostBridge sync.
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
import { createWindRibbonSystem } from '../meadow/meadow-wind.js';
import { CASTLE_FS } from './castle-shader.js';
import { createCastleWalker, ridgeYAt } from './castle-walker.js';
import { createAlpineFlock } from './castle-flock.js';
import { createAlpineBreeze } from './castle-breeze.js';

const DEFAULTS = {
  adaptive: 1,
  sigma: 70,
  warp: 32,
  timeMode: 0, // 0 = Day, 1 = Golden Sunset, 2 = Starlit Night, 3 = Auto by local clock
  mist: 0.72,
  flow: 1.0,
  showMeteors: 1,
  castleSpeed: 1.0,
  showCastle: 1,
  sheep: 22
};
const P = { ...DEFAULTS };

const sstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

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

const prog = createShaderProgram(gl, CASTLE_FS);
const U = {
  uFA: gl.getUniformLocation(prog, 'uFA'),
  uFB: gl.getUniformLocation(prog, 'uFB'),
  uNoise: gl.getUniformLocation(prog, 'uNoise'),
  uCastleTex: gl.getUniformLocation(prog, 'uCastleTex'),
  uFieldTex: gl.getUniformLocation(prog, 'uFieldTex'),
  uAlpsTex: gl.getUniformLocation(prog, 'uAlpsTex'),
  uAlpsReady: gl.getUniformLocation(prog, 'uAlpsReady'),
  uShowMeteors: gl.getUniformLocation(prog, 'uShowMeteors'),
  uRes: gl.getUniformLocation(prog, 'uRes'),
  uGrid: gl.getUniformLocation(prog, 'uGrid'),
  uStep: gl.getUniformLocation(prog, 'uStep'),
  uDpr: gl.getUniformLocation(prog, 'uDpr'),
  uMix: gl.getUniformLocation(prog, 'uMix'),
  uTime: gl.getUniformLocation(prog, 'uTime'),
  uWindTime: gl.getUniformLocation(prog, 'uWindTime'),
  uAdaptive: gl.getUniformLocation(prog, 'uAdaptive'),
  uMist: gl.getUniformLocation(prog, 'uMist'),
  uSunset: gl.getUniformLocation(prog, 'uSunset'),
  uNight: gl.getUniformLocation(prog, 'uNight'),
  uGust: gl.getUniformLocation(prog, 'uGust'),
  uMoonOcc: gl.getUniformLocation(prog, 'uMoonOcc'),
  uMoonVis: gl.getUniformLocation(prog, 'uMoonVis'),
  uSunOcc: gl.getUniformLocation(prog, 'uSunOcc'),
  uSunVis: gl.getUniformLocation(prog, 'uSunVis'),
  uSeed: gl.getUniformLocation(prog, 'uSeed'),
  uCastleRect: gl.getUniformLocation(prog, 'uCastleRect'),
  uWindFronts: gl.getUniformLocation(prog, 'uWindFronts'),
  uWindA: gl.getUniformLocation(prog, 'uWindA'),
  uWindB: gl.getUniformLocation(prog, 'uWindB'),
  uWindC: gl.getUniformLocation(prog, 'uWindC')
};

const field = new AdaptiveField(FIELD_STEP);
const noiseTex = createSeamlessNoiseTexture(gl, 256);

// Hand-painted Kazuo Oga snow-capped European Alps backdrop texture (zero-halo RGBA)
const alpsTex = gl.createTexture();
let alpsReady = 0.0;
gl.bindTexture(gl.TEXTURE_2D, alpsTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
const alpsImg = new Image();
alpsImg.onload = () => {
  gl.bindTexture(gl.TEXTURE_2D, alpsTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, alpsImg);
  alpsReady = 1.0;
  if (paused) renderFrame(simTime);
};
alpsImg.src = 'assets/castle-alps.png';

let texA = null, texB = null;
let sdfA = null, sdfB = null;
let activeIcons = [];

let mixStart = 0, mixDuration = 540, curMix = 1.0;
let W = 1, H = 1, dpr = 1;
let paused = false, needsInitialSettle = true;
const SCENE_SEED = 23.9;

let simTime = 0, flowTime = 0, lastRaf = 0, lastDraw = 0;
let sunsetMix = 0, nightMix = 0, moodInitialized = false;

const castle = createCastleWalker(gl, () => {
  if (paused) renderFrame(simTime);
});
const flock = createAlpineFlock(gl, () => {
  if (paused) renderFrame(simTime);
});
const breeze = createAlpineBreeze();
const windRibbons = createWindRibbonSystem();

function sampleSdfB(x, y) {
  return sdfB ? field.sample(sdfB, x, y) : 999;
}

function sampleGradB(x, y) {
  return sdfB ? field.gradient(sdfB, x, y, 12) : { x: 1, y: 0, len: 0 };
}

function computeTargetMood() {
  const mode = Math.round(P.timeMode || 0);
  if (mode === 0) return { sunset: 0.0, night: 0.0 };
  if (mode === 1) return { sunset: 1.0, night: 0.0 };
  if (mode === 2) return { sunset: 0.0, night: 1.0 };

  // Auto local solar clock: Day 06:30-16:45, Golden Sunset 16:45-19:15, Starlit Night 19:15-05:15, Dawn 05:15-06:30
  const now = new Date();
  const hr = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
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

function sampleSkyCloudAlphaCpu(px, py) {
  const nyPos = py / Math.max(1, H);
  const hiBand = 1 - sstep(0.26, 0.50, nyPos);
  const cov = (0.46 + (0.52 - 0.46) * nightMix) * hiBand * (0.52 + 0.48 * P.mist);
  if (cov <= 0.015) return 0;
  const qx = (px - flowTime * 13.5) / 380;
  const qy = py / 210;
  const r1 = sampleSeamlessNoise(noiseTex, qx * 56, qy * 56, 256, SCENE_SEED, 0);
  const g1 = sampleSeamlessNoise(noiseTex, qx * 56, qy * 56, 256, SCENE_SEED, 1);
  const r2 = sampleSeamlessNoise(noiseTex, qx * 112 + 41, qy * 112 + 19, 256, SCENE_SEED, 0);
  const shape = r1 * 0.56 + r2 * 0.30 + g1 * 0.14;
  const thresh = 1 - cov;
  return sstep(thresh - 0.045, thresh + 0.055, shape);
}

function computeMoonOcclusion() {
  if (nightMix <= 0.02) return { occ: 0, vis: 1 };
  const mx = W * 0.80, my = H * 0.14;
  const mRad = Math.max(24, Math.min(44, Math.min(W, H) * 0.044));
  const c0 = sampleSkyCloudAlphaCpu(mx, my);
  const cL = sampleSkyCloudAlphaCpu(mx - mRad * 0.65, my);
  const cR = sampleSkyCloudAlphaCpu(mx + mRad * 0.65, my);
  const occ = Math.max(0, Math.min(1, c0 * 0.50 + cL * 0.25 + cR * 0.25));
  return { occ, vis: 1 - occ * 0.78 };
}

function computeSunOcclusion() {
  if (sunsetMix <= 0.02) return { occ: 0, vis: 1 };
  const sx = W * 0.43, sy = H * 0.42;
  const sRad = Math.max(18, Math.min(32, Math.min(W, H) * 0.032));
  const c0 = sampleSkyCloudAlphaCpu(sx, sy);
  const cL = sampleSkyCloudAlphaCpu(sx - sRad * 0.70, sy - sRad * 0.25);
  const cR = sampleSkyCloudAlphaCpu(sx + sRad * 0.70, sy - sRad * 0.25);
  const occ = Math.max(0, Math.min(1, c0 * 0.50 + cL * 0.25 + cR * 0.25));
  return { occ, vis: 1 - occ * 0.62 };
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

  flock.resize(W, H);
  flock.relocate(W, H, sampleSdfB, true);
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
  flock.relocate(W, H, sampleSdfB, false);
  if (paused) renderFrame(simTime);
}

function renderFrame(t) {
  const castleRect = castle.renderAndUpload(t, {
    W, H,
    showCastle: P.showCastle,
    speed: P.castleSpeed
  });
  flock.renderAndUpload(t, {
    W, H,
    flow: P.flow,
    gust: breeze.gust,
    sunset: sunsetMix,
    night: nightMix,
    breeze
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
  gl.bindTexture(gl.TEXTURE_2D, castle.texture);
  gl.uniform1i(U.uCastleTex, 3);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, flock.texture);
  gl.uniform1i(U.uFieldTex, 4);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, alpsTex);
  gl.uniform1i(U.uAlpsTex, 5);

  gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(U.uGrid, field.gw, field.gh);
  gl.uniform1f(U.uStep, field.step);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uMix, curMix);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uWindTime, flowTime);
  gl.uniform1f(U.uAdaptive, P.adaptive);
  gl.uniform1f(U.uMist, P.mist);
  const moon = computeMoonOcclusion();
  const sun = computeSunOcclusion();
  gl.uniform1f(U.uSunset, sunsetMix);
  gl.uniform1f(U.uNight, nightMix);
  gl.uniform1f(U.uGust, breeze.gust);
  gl.uniform1f(U.uMoonOcc, moon.occ);
  gl.uniform1f(U.uMoonVis, moon.vis);
  gl.uniform1f(U.uSunOcc, sun.occ);
  gl.uniform1f(U.uSunVis, sun.vis);
  gl.uniform1f(U.uAlpsReady, alpsReady);
  gl.uniform1f(U.uShowMeteors, P.showMeteors);
  gl.uniform1f(U.uSeed, SCENE_SEED);

  if (castleRect) {
    gl.uniform4f(U.uCastleRect, castleRect[0], castleRect[1], castleRect[2], castleRect[3]);
  } else {
    gl.uniform4f(U.uCastleRect, 0, 0, 0, 0);
  }

  gl.uniform4fv(U.uWindFronts, breeze.frontsBuf);
  gl.uniform4fv(U.uWindA, windRibbons.bufA);
  gl.uniform4fv(U.uWindB, windRibbons.bufB);
  gl.uniform4fv(U.uWindC, windRibbons.bufC);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function tick(now) {
  requestAnimationFrame(tick);
  if (paused && !needsInitialSettle) {
    lastRaf = 0;
    return;
  }

  const tgt = computeTargetMood();
  if (!moodInitialized) {
    sunsetMix = tgt.sunset;
    nightMix = tgt.night;
    moodInitialized = true;
  }
  const moodChanging = Math.abs(tgt.sunset - sunsetMix) > 0.002 || Math.abs(tgt.night - nightMix) > 0.002;
  // Smooth vsync-aligned 60 FPS on desktop (zero dropped 60Hz frames); lighter 35 FPS in small preview iframe
  const targetInterval = isPreview ? 28 : 12;
  if (!needsInitialSettle && lastDraw && now - lastDraw < targetInterval) return;

  const dt = lastRaf ? Math.min(0.05, (now - lastRaf) / 1000) : 0.0167;
  lastRaf = now;
  lastDraw = now;
  simTime += dt;
  flowTime += dt * Math.max(0.05, P.flow);

  if (moodChanging) {
    const k = Math.min(1, dt * 3.0);
    sunsetMix += (tgt.sunset - sunsetMix) * k;
    nightMix  += (tgt.night  - nightMix)  * k;
    if (Math.abs(tgt.sunset - sunsetMix) < 0.002) sunsetMix = tgt.sunset;
    if (Math.abs(tgt.night  - nightMix)  < 0.002) nightMix  = tgt.night;
  }

  if (curMix < 1.0) {
    const rawT = Math.min(1, (now - mixStart) / mixDuration);
    curMix = 1 - Math.pow(1 - rawT, 3);
  }

  breeze.step(dt, { W, H, flow: P.flow });
  const castleRidgeGust = breeze.sampleAt(castle.state.nx, ridgeYAt(castle.state.nx, H), W, H);
  castle.step(dt, { speed: P.castleSpeed, flow: P.flow, gust: castleRidgeGust, showCastle: P.showCastle });
  flock.step(dt, {
    W, H,
    flow: P.flow,
    gust: breeze.gust,
    breeze,
    sheepCount: P.sheep,
    sampleSdf: sampleSdfB,
    sampleGrad: sampleGradB
  });
  windRibbons.step(dt, Math.max(0, P.flow) * (0.75 + breeze.gust * 0.50), W, H);

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
      if (k === 'sigma' || k === 'warp' || k === 'adaptive') fieldDirty = true;
      if (k === 'timeMode' && (!moodInitialized || paused)) {
        const tgt = computeTargetMood();
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
