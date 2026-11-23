/**
 * Sea Railway Theme Scene Controller — "Chuyến tàu trên Biển Gương"
 * Supports TWO instant seamlessly integrated camera views under one unified theme (`viewMode`):
 *   - viewMode = 0 ("Ngoài tàu"): Distant 5-Car Vintage Sea Train gliding across the mirror sea,
 *     Flooded Sixth Station, Lonely Island Cottage, Passing Counter-Train, Quarter-Res 3D Volumetric Aurora,
 *     and Real Birth-Date 3D Lunar Phase (`uMoonTex`).
 *   - viewMode = 1 ("Trong toa"): Exact Spirited Away central-aisle one-point perspective cabin interior
 *     (lazily initialized on first switch for 0% overhead in exterior view!), with 2 receding rows of 6 swinging
 *     pendulum hand-straps + live floor ring shadows, slanted aisle sunbeam bars, 4 receding brass ceiling lamps,
 *     5 translucent shadow passengers, Chihiro looking up at towering No-Face, passing perspective utility poles,
 *     and the same Real Birth-Date 3D Lunar Phase visible through the night cabin window!
 */
import {
  AdaptiveField,
  FIELD_STEP,
  createShaderProgram,
  createFieldTexture,
  uploadFieldTexture,
  createSeamlessNoiseTexture,
  computeRenderDpr,
  createPerfGovernor
} from '../../core/field-engine.js';
import { createHostBridge } from '../../core/host-bridge.js';
import { resolveMoonConfig, createMoonSurfaceLoader } from '../../core/moon-phase.js';
import { SEATRAIN_FS, SEATRAIN_AURORA_FS } from './seatrain-shader.js';
import { createSeaTrainController } from './seatrain-props.js';
import { CABIN_FS } from '../cabin/cabin-shader.js';
import { createCabinLivingEngine } from '../cabin/cabin-props.js';

const DEFAULTS = {
  viewMode: 0,     // 0 = Exterior ("Ngoài tàu"), 1 = Inside Cabin ("Trong toa")
  timeMode: 1,     // 0 = Day, 1 = Golden Sunset, 2 = Starlit Night, 3 = Auto
  trainMode: 0,    // Exterior: 0 = Endless Glide, 1 = Station Stop, 2 = Docked Still
  clouds: 0.85,
  ripple: 0.30,
  flow: 1.0,
  showStation: 1,
  showIsland: 1,
  showPassing: 1,
  // Interior Cabin View controls
  shake: 0.65,
  showNoFace: 1,
  showStraps: 1,
  showPoles: 1,
  showDust: 1,
  // Shared Adaptive Desktop Icon SDF controls
  adaptive: 1,
  sigma: 72,
  warp: 34
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

const prog = createShaderProgram(gl, SEATRAIN_FS);
const auroraProg = createShaderProgram(gl, SEATRAIN_AURORA_FS);

const U = {
  uFA: gl.getUniformLocation(prog, 'uFA'),
  uFB: gl.getUniformLocation(prog, 'uFB'),
  uNoise: gl.getUniformLocation(prog, 'uNoise'),
  uTrainTex: gl.getUniformLocation(prog, 'uTrainTex'),
  uTrainWinTex: gl.getUniformLocation(prog, 'uTrainWinTex'),
  uStationTex: gl.getUniformLocation(prog, 'uStationTex'),
  uIslandTex: gl.getUniformLocation(prog, 'uIslandTex'),
  uCloudsTex: gl.getUniformLocation(prog, 'uCloudsTex'),
  uAuroraTex: gl.getUniformLocation(prog, 'uAuroraTex'),
  uMoonTex: gl.getUniformLocation(prog, 'uMoonTex'),
  uRes: gl.getUniformLocation(prog, 'uRes'),
  uGrid: gl.getUniformLocation(prog, 'uGrid'),
  uStep: gl.getUniformLocation(prog, 'uStep'),
  uDpr: gl.getUniformLocation(prog, 'uDpr'),
  uMix: gl.getUniformLocation(prog, 'uMix'),
  uTime: gl.getUniformLocation(prog, 'uTime'),
  uWindTime: gl.getUniformLocation(prog, 'uWindTime'),
  uWorldScroll: gl.getUniformLocation(prog, 'uWorldScroll'),
  uAdaptive: gl.getUniformLocation(prog, 'uAdaptive'),
  uClouds: gl.getUniformLocation(prog, 'uClouds'),
  uRipple: gl.getUniformLocation(prog, 'uRipple'),
  uSunset: gl.getUniformLocation(prog, 'uSunset'),
  uNight: gl.getUniformLocation(prog, 'uNight'),
  uTrainReady: gl.getUniformLocation(prog, 'uTrainReady'),
  uStationReady: gl.getUniformLocation(prog, 'uStationReady'),
  uIslandReady: gl.getUniformLocation(prog, 'uIslandReady'),
  uCloudsReady: gl.getUniformLocation(prog, 'uCloudsReady'),
  uWake: gl.getUniformLocation(prog, 'uWake'),
  uShowStation: gl.getUniformLocation(prog, 'uShowStation'),
  uShowIsland: gl.getUniformLocation(prog, 'uShowIsland'),
  uMoonPhase: gl.getUniformLocation(prog, 'uMoonPhase'),
  uSeed: gl.getUniformLocation(prog, 'uSeed'),
  uTrainRect: gl.getUniformLocation(prog, 'uTrainRect'),
  uStationRect: gl.getUniformLocation(prog, 'uStationRect'),
  uIslandRect: gl.getUniformLocation(prog, 'uIslandRect'),
  uPassRect: gl.getUniformLocation(prog, 'uPassRect')
};

const UA = {
  uFA: gl.getUniformLocation(auroraProg, 'uFA'),
  uFB: gl.getUniformLocation(auroraProg, 'uFB'),
  uAuroraRes: gl.getUniformLocation(auroraProg, 'uAuroraRes'),
  uCssRes: gl.getUniformLocation(auroraProg, 'uCssRes'),
  uGrid: gl.getUniformLocation(auroraProg, 'uGrid'),
  uStep: gl.getUniformLocation(auroraProg, 'uStep'),
  uMix: gl.getUniformLocation(auroraProg, 'uMix'),
  uTime: gl.getUniformLocation(auroraProg, 'uTime'),
  uWindTime: gl.getUniformLocation(auroraProg, 'uWindTime'),
  uWorldScroll: gl.getUniformLocation(auroraProg, 'uWorldScroll'),
  uAdaptive: gl.getUniformLocation(auroraProg, 'uAdaptive'),
  uNight: gl.getUniformLocation(auroraProg, 'uNight')
};

// Lazy Cabin Interior pipeline — allocated on first switch to viewMode = 1 (zero startup/VRAM cost in exterior mode!)
let cabinProg = null;
let UC = null;
let cabinCtrl = null;
let cabinOverlayDirty = true;

function ensureCabinInitialized() {
  if (cabinProg && cabinCtrl) return;
  cabinProg = createShaderProgram(gl, CABIN_FS);
  UC = {
    uFA: gl.getUniformLocation(cabinProg, 'uFA'),
    uFB: gl.getUniformLocation(cabinProg, 'uFB'),
    uNoise: gl.getUniformLocation(cabinProg, 'uNoise'),
    uCabinTex: gl.getUniformLocation(cabinProg, 'uCabinTex'),
    uNoFaceTex: gl.getUniformLocation(cabinProg, 'uNoFaceTex'),
    uLiveTex: gl.getUniformLocation(cabinProg, 'uLiveTex'),
    uCloudsTex: gl.getUniformLocation(cabinProg, 'uCloudsTex'),
    uMoonTex: gl.getUniformLocation(cabinProg, 'uMoonTex'),
    uRes: gl.getUniformLocation(cabinProg, 'uRes'),
    uGrid: gl.getUniformLocation(cabinProg, 'uGrid'),
    uStep: gl.getUniformLocation(cabinProg, 'uStep'),
    uDpr: gl.getUniformLocation(cabinProg, 'uDpr'),
    uMix: gl.getUniformLocation(cabinProg, 'uMix'),
    uTime: gl.getUniformLocation(cabinProg, 'uTime'),
    uWindTime: gl.getUniformLocation(cabinProg, 'uWindTime'),
    uWorldScroll: gl.getUniformLocation(cabinProg, 'uWorldScroll'),
    uAdaptive: gl.getUniformLocation(cabinProg, 'uAdaptive'),
    uSunset: gl.getUniformLocation(cabinProg, 'uSunset'),
    uNight: gl.getUniformLocation(cabinProg, 'uNight'),
    uMoonPhase: gl.getUniformLocation(cabinProg, 'uMoonPhase'),
    uShowNoFace: gl.getUniformLocation(cabinProg, 'uShowNoFace'),
    uShowPoles: gl.getUniformLocation(cabinProg, 'uShowPoles'),
    uCabinReady: gl.getUniformLocation(cabinProg, 'uCabinReady'),
    uNoFaceReady: gl.getUniformLocation(cabinProg, 'uNoFaceReady'),
    uCloudsReady: gl.getUniformLocation(cabinProg, 'uCloudsReady'),
    uBobY: gl.getUniformLocation(cabinProg, 'uBobY'),
    uSwayX: gl.getUniformLocation(cabinProg, 'uSwayX'),
    uSeed: gl.getUniformLocation(cabinProg, 'uSeed'),
    uNoFaceRect: gl.getUniformLocation(cabinProg, 'uNoFaceRect')
  };
  cabinCtrl = createCabinLivingEngine(
    gl,
    () => {
      cabinOverlayDirty = true;
      if (paused && P.viewMode >= 0.5) renderFrame(simTime);
    },
    trainCtrl // Shares seamless Ghibli cloud panorama texture (zero duplicate VRAM!)
  );
  cabinCtrl.resize(W, H);
  cabinCtrl.step(0, { W, H, flow: P.flow, shake: P.shake });
  cabinOverlayDirty = true;
}

const field = new AdaptiveField(FIELD_STEP);
const noiseTex = createSeamlessNoiseTexture(gl, 256);

let texA = null, texB = null;
let auroraFbo = null, auroraTex = null, auroraW = 1, auroraH = 1;
let sdfA = null, sdfB = null;
let activeIcons = [];
let mixStart = 0, mixDuration = 540, curMix = 1.0;
let W = 1, H = 1, dpr = 1;
let paused = false, needsInitialSettle = true;
const SCENE_SEED = 31.4;

let simTime = 0, flowTime = 0, lastRaf = 0, lastDraw = 0;
let sunsetMix = 1.0, nightMix = 0.0, moodInitialized = false;
let moonCfg = { mode: 'full', date: '2000-08-15' };
let moonPhase = 0.5;

const perf = createPerfGovernor({
  isPreview,
  onQualityChange() {
    resizeBackbuffer();
  }
});

function allocAuroraFbo() {
  const nw = Math.max(120, Math.round(glCanvas.width * 0.25));
  const nh = Math.max(64, Math.round(glCanvas.height * 0.735 * 0.25));
  if (auroraTex && nw === auroraW && nh === auroraH) return;
  auroraW = nw;
  auroraH = nh;
  if (auroraTex) gl.deleteTexture(auroraTex);
  if (auroraFbo) gl.deleteFramebuffer(auroraFbo);

  auroraTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, auroraTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, auroraW, auroraH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  auroraFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, auroraFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, auroraTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function resizeBackbuffer() {
  dpr = computeRenderDpr(W, H, isPreview, perf.qualityScale);
  glCanvas.width = Math.max(1, Math.round(W * dpr));
  glCanvas.height = Math.max(1, Math.round(H * dpr));
  allocAuroraFbo();
}

const trainCtrl = createSeaTrainController(gl, () => {
  if (paused) renderFrame(simTime);
});
const moonSurface = createMoonSurfaceLoader(gl, () => {
  if (paused) renderFrame(simTime);
});

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
  const hr = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  if (hr >= 19.25 || hr < 5.25) return { sunset: 0.0, night: 1.0 };
  if (hr >= 6.5 && hr < 16.75) return { sunset: 0.0, night: 0.0 };
  if (hr >= 16.75 && hr < 18.0) return { sunset: sstep(16.75, 18.0, hr), night: 0.0 };
  if (hr >= 18.0 && hr < 19.25) {
    const k = sstep(18.0, 19.25, hr);
    return { sunset: 1.0 - k, night: k };
  }
  const k = sstep(5.25, 6.5, hr);
  return { sunset: Math.sin(k * Math.PI) * 0.72, night: 1.0 - k };
}

function allocResources() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  resizeBackbuffer();

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

  trainCtrl.step(0, { W, H, flow: P.flow, trainMode: P.trainMode, showPassing: P.showPassing });
  if (cabinCtrl) {
    cabinCtrl.resize(W, H);
    cabinCtrl.step(0, { W, H, flow: P.flow, shake: P.shake });
    cabinOverlayDirty = true;
  }
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

function renderCabinFrame(t, nowMs) {
  ensureCabinInitialized();
  if (cabinOverlayDirty || perf.shouldUploadOverlay(nowMs, 33)) {
    cabinCtrl.renderAndUpload({
      W,
      H,
      showStraps: P.showStraps,
      showDust: P.showDust,
      sunset: sunsetMix,
      night: nightMix
    });
    cabinOverlayDirty = false;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.useProgram(cabinProg);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.uniform1i(UC.uFA, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texB);
  gl.uniform1i(UC.uFB, 1);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, noiseTex);
  gl.uniform1i(UC.uNoise, 2);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, cabinCtrl.cabinTexture);
  gl.uniform1i(UC.uCabinTex, 3);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, cabinCtrl.noFaceTexture);
  gl.uniform1i(UC.uNoFaceTex, 4);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, cabinCtrl.liveTexture);
  gl.uniform1i(UC.uLiveTex, 5);

  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, cabinCtrl.cloudsTexture);
  gl.uniform1i(UC.uCloudsTex, 6);

  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, moonSurface.texture);
  gl.uniform1i(UC.uMoonTex, 7);

  gl.uniform2f(UC.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(UC.uGrid, field.gw, field.gh);
  gl.uniform1f(UC.uStep, field.step);
  gl.uniform1f(UC.uDpr, dpr);
  gl.uniform1f(UC.uMix, curMix);
  gl.uniform1f(UC.uTime, t);
  gl.uniform1f(UC.uWindTime, flowTime);
  gl.uniform1f(UC.uWorldScroll, cabinCtrl.worldScroll);
  gl.uniform1f(UC.uAdaptive, P.adaptive);
  gl.uniform1f(UC.uSunset, sunsetMix);
  gl.uniform1f(UC.uNight, nightMix);
  gl.uniform1f(UC.uMoonPhase, moonPhase);
  gl.uniform1f(UC.uShowNoFace, P.showNoFace);
  gl.uniform1f(UC.uShowPoles, P.showPoles);
  gl.uniform1f(UC.uCabinReady, cabinCtrl.cabinReady);
  gl.uniform1f(UC.uNoFaceReady, cabinCtrl.noFaceReady);
  gl.uniform1f(UC.uCloudsReady, cabinCtrl.cloudsReady);
  gl.uniform1f(UC.uBobY, cabinCtrl.bobY);
  gl.uniform1f(UC.uSwayX, cabinCtrl.swayX);
  gl.uniform1f(UC.uSeed, SCENE_SEED);

  const nf = cabinCtrl.noFaceRect;
  gl.uniform4f(UC.uNoFaceRect, nf[0], nf[1], nf[2], nf[3]);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function renderExteriorFrame(t) {
  // Pass 1 (Night only): Quarter-res 3D Volumetric Aurora FBO (~40x fewer GPU ALU ops than full-res raymarching!)
  if (nightMix > 0.015 && auroraFbo && auroraTex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, auroraFbo);
    gl.viewport(0, 0, auroraW, auroraH);
    gl.useProgram(auroraProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(UA.uFA, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1i(UA.uFB, 1);

    gl.uniform2f(UA.uAuroraRes, auroraW, auroraH);
    gl.uniform2f(UA.uCssRes, W, H);
    gl.uniform2f(UA.uGrid, field.gw, field.gh);
    gl.uniform1f(UA.uStep, field.step);
    gl.uniform1f(UA.uMix, curMix);
    gl.uniform1f(UA.uTime, t);
    gl.uniform1f(UA.uWindTime, flowTime);
    gl.uniform1f(UA.uWorldScroll, trainCtrl.worldScroll);
    gl.uniform1f(UA.uAdaptive, P.adaptive);
    gl.uniform1f(UA.uNight, nightMix);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Pass 2: Main fullscreen Sea Railway composition sampling pre-rendered uAuroraTex in 1 tap!
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
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
  gl.bindTexture(gl.TEXTURE_2D, trainCtrl.trainTexture);
  gl.uniform1i(U.uTrainTex, 3);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, trainCtrl.winMaskTexture);
  gl.uniform1i(U.uTrainWinTex, 4);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, trainCtrl.stationTexture);
  gl.uniform1i(U.uStationTex, 5);

  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, trainCtrl.islandTexture);
  gl.uniform1i(U.uIslandTex, 6);

  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, trainCtrl.cloudsTexture);
  gl.uniform1i(U.uCloudsTex, 7);

  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, auroraTex);
  gl.uniform1i(U.uAuroraTex, 8);

  gl.activeTexture(gl.TEXTURE9);
  gl.bindTexture(gl.TEXTURE_2D, moonSurface.texture);
  gl.uniform1i(U.uMoonTex, 9);

  gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(U.uGrid, field.gw, field.gh);
  gl.uniform1f(U.uStep, field.step);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uMix, curMix);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uWindTime, flowTime);
  gl.uniform1f(U.uWorldScroll, trainCtrl.worldScroll);
  gl.uniform1f(U.uAdaptive, P.adaptive);
  gl.uniform1f(U.uClouds, P.clouds);
  gl.uniform1f(U.uRipple, P.ripple);
  gl.uniform1f(U.uSunset, sunsetMix);
  gl.uniform1f(U.uNight, nightMix);
  gl.uniform1f(U.uTrainReady, trainCtrl.trainReady);
  gl.uniform1f(U.uStationReady, trainCtrl.stationReady);
  gl.uniform1f(U.uIslandReady, trainCtrl.islandReady);
  gl.uniform1f(U.uCloudsReady, trainCtrl.cloudsReady);
  gl.uniform1f(U.uWake, trainCtrl.wake);
  gl.uniform1f(U.uShowStation, P.showStation);
  gl.uniform1f(U.uShowIsland, P.showIsland);
  gl.uniform1f(U.uMoonPhase, moonPhase);
  gl.uniform1f(U.uSeed, SCENE_SEED);

  const tr = trainCtrl.trainRect;
  const sr = trainCtrl.stationRect;
  const ir = trainCtrl.islandRect;
  const pr = trainCtrl.passRect;
  gl.uniform4f(U.uTrainRect, tr[0], tr[1], tr[2], tr[3]);
  gl.uniform4f(U.uStationRect, sr[0], sr[1], sr[2], sr[3]);
  gl.uniform4f(U.uIslandRect, ir[0], ir[1], ir[2], ir[3]);
  gl.uniform4f(U.uPassRect, pr[0], pr[1], pr[2], pr[3]);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function renderFrame(t, nowMs = performance.now()) {
  gl.disable(gl.BLEND);
  if (P.viewMode >= 0.5) {
    renderCabinFrame(t, nowMs);
  } else {
    renderExteriorFrame(t);
  }
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

  const k = Math.min(1, dt * 1.8);
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
    if (P.viewMode >= 0.5) {
      ensureCabinInitialized();
      cabinCtrl.step(dt, { W, H, flow: P.flow, shake: P.shake });
    } else {
      trainCtrl.step(dt, { W, H, flow: P.flow, trainMode: P.trainMode, showPassing: P.showPassing });
    }
  }

  renderFrame(simTime, now);
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
      if (k === 'trainMode' && Math.round(num) === 2) {
        trainCtrl.resetToStation();
      }
      if (k === 'viewMode' && num >= 0.5) {
        ensureCabinInitialized();
        cabinOverlayDirty = true;
      }
      if (k === 'showStraps' || k === 'showDust') {
        cabinOverlayDirty = true;
      }
      if (k === 'timeMode' && (!moodInitialized || paused)) {
        const tgt = targetMoodFromClock();
        sunsetMix = tgt.sunset;
        nightMix = tgt.night;
        moodInitialized = true;
        cabinOverlayDirty = true;
      }
    }
    if (fieldDirty) commitField(false);
    if (paused) renderFrame(simTime);
  },
  onReset() {
    Object.assign(P, DEFAULTS);
    cabinOverlayDirty = true;
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
    if (paused) renderFrame(simTime);
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
