/**
 * Arctic Theme Scene Controller — "Bắc Cực: Gấu Trắng & Cánh Cụt"
 * Orchestrates Adaptive Polar Ocean & Snow Shelf SDF around desktop icons,
 * Polar Day / Alpenglow Sunset / Aurora Borealis Night clock transitions,
 * natural Moon-reflecting Arctic ice hole, hilarious sleeping Polar Bear &
 * mischievous red-scarf Penguin comedy loop, and non-blocking parallel WebGL2 rendering.
 */
import {
  AdaptiveField,
  FIELD_STEP,
  startShaderProgram,
  pollShaderProgram,
  createFieldTexture,
  uploadFieldTexture,
  createSeamlessNoiseTexture,
  computeRenderDpr,
  createPerfGovernor
} from '../../core/field-engine.js';
import { createHostBridge } from '../../core/host-bridge.js';
import { resolveMoonConfig, createMoonSurfaceLoader } from '../../core/moon-phase.js';
import { ARCTIC_FS } from './arctic-shader.js';
import { createArcticActorsController, BEAR_NORM } from './arctic-actors.js';
import { createWindRibbonSystem } from './arctic-wind.js';

const DEFAULTS = {
  adaptive: 1,
  sigma: 74,
  warp: 34,
  timeMode: 0,      // 0 = Polar Day, 1 = Alpenglow Sunset, 2 = Aurora Night, 3 = Auto by local clock
  snow: 0.45,
  flow: 1.0,
  aurora: 0.85,
  showFriends: 1,
  mischief: 1.0,
  showBubbles: 1
};
const P = { ...DEFAULTS };

const sstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

const qs = new URLSearchParams(location.search);
const isPreview = qs.get('preview') === '1';
const initTimeParam = qs.get('time');
if (initTimeParam !== null && Number.isFinite(Number(initTimeParam))) {
  P.timeMode = Number(initTimeParam);
}

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

function bindArcticUniforms(program) {
  return {
    uFA: gl.getUniformLocation(program, 'uFA'),
    uFB: gl.getUniformLocation(program, 'uFB'),
    uNoise: gl.getUniformLocation(program, 'uNoise'),
    uActorsTex: gl.getUniformLocation(program, 'uActorsTex'),
    uActorsShadowTex: gl.getUniformLocation(program, 'uActorsShadowTex'),
    uMoonTex: gl.getUniformLocation(program, 'uMoonTex'),
    uWaterTex: gl.getUniformLocation(program, 'uWaterTex'),
    uSnowTex: gl.getUniformLocation(program, 'uSnowTex'),
    uFloesTex: gl.getUniformLocation(program, 'uFloesTex'),
    uRes: gl.getUniformLocation(program, 'uRes'),
    uGrid: gl.getUniformLocation(program, 'uGrid'),
    uStep: gl.getUniformLocation(program, 'uStep'),
    uDpr: gl.getUniformLocation(program, 'uDpr'),
    uMix: gl.getUniformLocation(program, 'uMix'),
    uTime: gl.getUniformLocation(program, 'uTime'),
    uWindTime: gl.getUniformLocation(program, 'uWindTime'),
    uSnow: gl.getUniformLocation(program, 'uSnow'),
    uAurora: gl.getUniformLocation(program, 'uAurora'),
    uEdge: gl.getUniformLocation(program, 'uEdge'),
    uSeed: gl.getUniformLocation(program, 'uSeed'),
    uSunset: gl.getUniformLocation(program, 'uSunset'),
    uNight: gl.getUniformLocation(program, 'uNight'),
    uMoonPhase: gl.getUniformLocation(program, 'uMoonPhase'),
    uMoonPos: gl.getUniformLocation(program, 'uMoonPos'),
    uActorsRect: gl.getUniformLocation(program, 'uActorsRect'),
    uWindA: gl.getUniformLocation(program, 'uWindA'),
    uWindB: gl.getUniformLocation(program, 'uWindB'),
    uWindC: gl.getUniformLocation(program, 'uWindC')
  };
}

function createPaintTexture(glCtx, url, fallbackRgba, repeat, onLoad) {
  const tex = glCtx.createTexture();
  glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
  const wrap = repeat ? glCtx.REPEAT : glCtx.CLAMP_TO_EDGE;
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, wrap);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, wrap);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
  glCtx.texImage2D(
    glCtx.TEXTURE_2D, 0, glCtx.RGBA, 1, 1, 0,
    glCtx.RGBA, glCtx.UNSIGNED_BYTE, new Uint8Array(fallbackRgba)
  );

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, false);
    glCtx.pixelStorei(glCtx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, img);
    glCtx.generateMipmap(glCtx.TEXTURE_2D);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR_MIPMAP_LINEAR);
    onLoad?.();
  };
  img.onerror = () => {
    console.warn('[arctic] paint texture failed to load:', url);
  };
  img.src = url;
  return tex;
}

// Kick off non-blocking parallel shader compilation immediately so CPU init overlaps GPU compile!
const progJob = startShaderProgram(gl, ARCTIC_FS);
let prog = null;
let U = null;
let readyNotified = false;

function ensureProgramReady(forceSync = false) {
  if (prog) return true;
  const linked = pollShaderProgram(gl, progJob, forceSync);
  if (!linked) return false;
  prog = linked;
  U = bindArcticUniforms(prog);
  return true;
}

const field = new AdaptiveField(FIELD_STEP);
const noiseTex = createSeamlessNoiseTexture(gl, 256);
let texA = null, texB = null;
let sdfA = null, sdfB = null;
let activeIcons = [];

let mixStart = 0, mixDuration = 540, curMix = 1.0;
let W = 1, H = 1, dpr = 1;
let paused = false, needsInitialSettle = true;
const SCENE_SEED = 41.7;

let simTime = 0, flowTime = 0, lastRaf = 0, lastDraw = 0;
let sunsetMix = 0, nightMix = 0, moodInitialized = false;
let moonCfg = { mode: 'full', date: '2000-08-15' };
let moonPhase = 0.5;
const moonAnchor = { x: 240, y: 180, r: 48 };

const actors = createArcticActorsController(gl, () => {
  if (paused) renderFrame(simTime, true);
});
const windRibbons = createWindRibbonSystem();
const moonSurface = createMoonSurfaceLoader(gl, () => {
  if (paused) renderFrame(simTime, false);
});

const onPaintReady = () => {
  if (paused) renderFrame(simTime, false);
};
const waterTex  = createPaintTexture(gl, 'assets/arctic-water-tex.webp?v=wc1',      [6, 56, 82, 255],     true,  onPaintReady);
const snowTex   = createPaintTexture(gl, 'assets/arctic-snow-tex.webp?v=glacier2',  [244, 246, 244, 255], true,  onPaintReady);
const floesTex  = createPaintTexture(gl, 'assets/arctic-floes-atlas.webp?v=wc1',    [0, 0, 0, 0],         false, onPaintReady);

function sampleSdfB(px, py) {
  return sdfB ? field.sample(sdfB, px, py) : 999;
}

/**
 * Finds the widest, coziest open snow clearing on the ice shelf where the sleeping
 * Polar Bear rests cleanly away from desktop icons.
 */
function relocateComedyStage(snap = false) {
  if (!sdfB) return;

  const size = Math.round(Math.max(270, Math.min(430, Math.min(W, H) * 0.46)));
  actors.state.size = size;

  const evalClearance = (cx, cy) => {
    const left = cx - size * 0.5;
    const top  = cy - size * 0.5;
    const bearX = left + BEAR_NORM.x * size;
    const bearY = top  + BEAR_NORM.y * size;
    return Math.min(
      sampleSdfB(bearX, bearY),
      sampleSdfB(bearX - size * 0.16, bearY),
      sampleSdfB(bearX + size * 0.18, bearY),
      sampleSdfB(bearX, bearY - size * 0.16),
      sampleSdfB(bearX, bearY + size * 0.16)
    );
  };

  // Keep existing stage anchor if it still sits comfortably on open snow (still refresh open-water Moon spot!)
  if (actors.state.initialized && !snap && evalClearance(actors.state.x, actors.state.y) > 48) {
    relocateMoonSpot();
    return;
  }

  const padX = Math.max(size * 0.44, W * 0.13);
  const padY = Math.max(size * 0.36, H * 0.16);
  const prefX = W * 0.58;
  const prefY = H * 0.54;

  let best = { x: prefX, y: prefY, score: -1e9 };
  const cols = 15, rows = 10;
  for (let gy = 0; gy < rows; gy++) {
    const py = padY + (gy / (rows - 1)) * Math.max(10, H - padY * 2);
    for (let gx = 0; gx < cols; gx++) {
      const px = padX + (gx / (cols - 1)) * Math.max(10, W - padX * 2);
      const clr = evalClearance(px, py);
      const distPref = Math.hypot((px - prefX) / Math.max(1, W), (py - prefY) / Math.max(1, H));
      // Strongly prefer genuinely open snow clearing (> 52px), gently biased toward pleasing center-right framing
      const score = Math.min(clr, 130) - distPref * 85;
      if (score > best.score) {
        best = { x: px, y: py, score };
      }
    }
  }

  actors.state.x = best.x;
  actors.state.y = best.y;
  actors.state.initialized = true;
  relocateMoonSpot();
}

/**
 * Finds the widest open glacial sea bay (most negative SDF away from snow cliffs)
 * so the 3D Moon reflection shines cleanly on dark moving water and casts natural
 * moonlight across the adjacent ice cliffs, snow shelf, and sleeping Polar Bear.
 */
function relocateMoonSpot() {
  if (!sdfB) return;
  const r = Math.round(Math.max(36, Math.min(60, Math.min(W, H) * 0.056)));
  moonAnchor.r = r;

  const padX = Math.max(r * 1.45, W * 0.08);
  const padY = Math.max(r * 1.35, H * 0.10);
  const prefX = W * 0.22;
  const prefY = H * 0.26;

  let best = { x: prefX, y: prefY, score: -1e9 };
  const cols = 16, rows = 10;
  for (let gy = 0; gy < rows; gy++) {
    const py = padY + (gy / (rows - 1)) * Math.max(10, H - padY * 2);
    for (let gx = 0; gx < cols; gx++) {
      const px = padX + (gx / (cols - 1)) * Math.max(10, W - padX * 2);
      // Negative SDF means open water; take max (least negative) around disc perimeter to keep disc off cliffs!
      const worstSdf = Math.max(
        sampleSdfB(px, py),
        sampleSdfB(px - r * 0.72, py),
        sampleSdfB(px + r * 0.72, py),
        sampleSdfB(px, py - r * 0.72),
        sampleSdfB(px, py + r * 0.72)
      );
      const waterOpen = -worstSdf;
      const distPref = Math.hypot((px - prefX) / Math.max(1, W), (py - prefY) / Math.max(1, H));
      // Strongly prefer genuine open ocean bays while favoring scenic upper-third framing
      const score = Math.min(waterOpen, 120) - distPref * 38;
      if (score > best.score) {
        best = { x: px, y: py, score };
      }
    }
  }
  moonAnchor.x = best.x;
  moonAnchor.y = best.y;
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
  const initSdf = field.compute(rects, P.sigma, P.warp, 0.36);
  sdfA = initSdf;
  sdfB = initSdf;
  uploadFieldTexture(gl, texA, field, sdfA);
  uploadFieldTexture(gl, texB, field, sdfB);
  curMix = 1.0;

  relocateComedyStage(true);
}

function commitField(animate = true) {
  if (!texA || !texB) return;
  const rects = P.adaptive >= 0.5 ? activeIcons : [];
  const nextSdf = field.compute(rects, P.sigma, P.warp, 0.36);
  if (!animate || !sdfB) {
    sdfA = nextSdf;
    sdfB = nextSdf;
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
  relocateComedyStage(false);
  if (paused) renderFrame(simTime, true);
}

function computeTargetMood() {
  const mode = Math.round(P.timeMode || 0);
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

function renderFrame(t, upload2d = true, forceSync = false) {
  if (!ensureProgramReady(forceSync)) return false;

  if (upload2d) {
    actors.renderAndUpload(t, {
      showFriends: P.showFriends,
      showBubbles: P.showBubbles,
      flow: P.flow
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
  gl.bindTexture(gl.TEXTURE_2D, actors.actorsTexture);
  gl.uniform1i(U.uActorsTex, 3);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, actors.shadowTexture);
  gl.uniform1i(U.uActorsShadowTex, 4);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, moonSurface.texture);
  gl.uniform1i(U.uMoonTex, 5);

  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, waterTex);
  gl.uniform1i(U.uWaterTex, 6);

  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, snowTex);
  gl.uniform1i(U.uSnowTex, 7);

  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, floesTex);
  gl.uniform1i(U.uFloesTex, 8);

  gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(U.uGrid, field.gw, field.gh);
  gl.uniform1f(U.uStep, field.step);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uMix, curMix);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uWindTime, flowTime);
  gl.uniform1f(U.uSnow, P.snow);
  gl.uniform1f(U.uAurora, P.aurora);
  gl.uniform1f(U.uEdge, (P.warp - 34) * 0.45);
  gl.uniform1f(U.uSeed, SCENE_SEED);
  gl.uniform1f(U.uSunset, sunsetMix);
  gl.uniform1f(U.uNight, nightMix);
  gl.uniform1f(U.uMoonPhase, moonPhase);
  gl.uniform3f(U.uMoonPos, moonAnchor.x, moonAnchor.y, moonAnchor.r);

  const show = P.showFriends >= 0.5;
  const rect = actors.getActorsRectCss();
  gl.uniform4f(U.uActorsRect, rect[0], rect[1], show ? rect[2] : 0, show ? rect[3] : 0);

  gl.uniform4fv(U.uWindA, windRibbons.bufA);
  gl.uniform4fv(U.uWindB, windRibbons.bufB);
  gl.uniform4fv(U.uWindC, windRibbons.bufC);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

function tick(now) {
  requestAnimationFrame(tick);
  if (perf.isHidden || (paused && !needsInitialSettle)) {
    lastRaf = 0;
    perf.resetTiming();
    return;
  }
  if (!ensureProgramReady(false)) return;

  const targetMood = computeTargetMood();
  if (!moodInitialized) {
    sunsetMix = targetMood.sunset;
    nightMix = targetMood.night;
    moodInitialized = true;
  }
  const moodChanging = Math.abs(targetMood.sunset - sunsetMix) > 0.002
                    || Math.abs(targetMood.night - nightMix) > 0.002;
  // Run Arctic actors at true silky 60 FPS in BOTH desktop and Settings preview!
  // (Previously preview throttled rAF to 29ms + upload2d to 40ms -> 15 FPS stutter!)
  const minInterval = isPreview ? 15 : perf.targetInterval;
  if (!needsInitialSettle && lastDraw && now - lastDraw < minInterval) return;

  const elapsedMs = lastRaf ? (now - lastRaf) : 16.7;
  const dt = lastRaf ? Math.min(0.05, elapsedMs / 1000) : 0.0167;
  lastRaf = now;
  lastDraw = now;
  perf.reportFrame(elapsedMs, now);
  simTime += dt;
  flowTime += dt * Math.max(0.05, P.flow);

  if (moodChanging) {
    const k = Math.min(1, dt * 3.0);
    sunsetMix += (targetMood.sunset - sunsetMix) * k;
    nightMix += (targetMood.night - nightMix) * k;
    if (Math.abs(targetMood.sunset - sunsetMix) < 0.002) sunsetMix = targetMood.sunset;
    if (Math.abs(targetMood.night - nightMix) < 0.002) nightMix = targetMood.night;
  }

  if (curMix < 1.0) {
    const rawT = Math.min(1, (now - mixStart) / mixDuration);
    curMix = 1 - Math.pow(1 - rawT, 3);
  }

  windRibbons.step(dt, Math.max(0, P.flow), W, H);
  actors.step(dt, {
    mischief: P.mischief,
    showFriends: P.showFriends,
    showBubbles: P.showBubbles,
    flow: P.flow
  });

  // Actors now render natively on WebGL2 GPU FBO (~0.02ms/mesh) -> update EVERY frame at locked 60 FPS!
  renderFrame(simTime, true);
  if (!readyNotified) {
    readyNotified = true;
    bridge.notifyReady();
  }
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
        const m = computeTargetMood();
        sunsetMix = m.sunset;
        nightMix = m.night;
        moodInitialized = true;
      }
    }
    if (fieldDirty) commitField(false);
    if (paused) renderFrame(simTime, true);
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
  onMouse(nx, ny) {
    actors.setMouse(nx, ny);
  },
  getCanvases: () => ({ glCanvas, overlayCanvas: null }),
  renderNow: () => renderFrame(simTime, true, true)
});

activeIcons = bridge.getIcons();
allocResources();
bridge.setupStandaloneDemoIcons(demoContainer);

window.addEventListener('resize', () => {
  activeIcons = bridge.getIcons();
  allocResources();
  renderFrame(simTime, true);
});

requestAnimationFrame(tick);
