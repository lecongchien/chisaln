/**
 * Meadow Theme Scene Controller
 * Orchestrates adaptive icon cloud islands, Day / Moonlit Night solar clock transitions,
 * moon-reflecting meadow pond, Studio Ghibli black kitten, 360-degree roaming kite boy,
 * WebGL2 render loop, and HostBridge sync.
 */
import {
  AdaptiveField,
  FIELD_STEP,
  createShaderProgram,
  createFieldTexture,
  uploadFieldTexture,
  createSeamlessNoiseTexture,
  computeRenderDpr
} from '../../core/field-engine.js';
import { createHostBridge } from '../../core/host-bridge.js';
import { MEADOW_FS } from './meadow-shader.js';
import { createCloudGrid } from './cloud-grid.js';
import { createKittenController } from './meadow-kitten.js';
import { createKiteBoyController } from './meadow-boy.js';
import { createWindRibbonSystem } from './meadow-wind.js';

const DEFAULTS = {
  adaptive: 1,
  sigma: 74,
  warp: 36,
  timeMode: 0, // 0 = Day, 1 = Golden Sunset, 2 = Moonlit Night, 3 = Auto by local clock
  cover: 0.34,
  flow: 1.0,
  flowers: 0.55,
  showBoy: 1,
  showCat: 1
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

const prog = createShaderProgram(gl, MEADOW_FS);
const U = {
  uFA: gl.getUniformLocation(prog, 'uFA'),
  uFB: gl.getUniformLocation(prog, 'uFB'),
  uNoise: gl.getUniformLocation(prog, 'uNoise'),
  uCirc: gl.getUniformLocation(prog, 'uCirc'),
  uCat: gl.getUniformLocation(prog, 'uCat'),
  uActor: gl.getUniformLocation(prog, 'uActor'),
  uActorShadow: gl.getUniformLocation(prog, 'uActorShadow'),
  uRes: gl.getUniformLocation(prog, 'uRes'),
  uGrid: gl.getUniformLocation(prog, 'uGrid'),
  uCGrid: gl.getUniformLocation(prog, 'uCGrid'),
  uStep: gl.getUniformLocation(prog, 'uStep'),
  uDpr: gl.getUniformLocation(prog, 'uDpr'),
  uMix: gl.getUniformLocation(prog, 'uMix'),
  uTime: gl.getUniformLocation(prog, 'uTime'),
  uWindTime: gl.getUniformLocation(prog, 'uWindTime'),
  uFlowers: gl.getUniformLocation(prog, 'uFlowers'),
  uEdge: gl.getUniformLocation(prog, 'uEdge'),
  uSeed: gl.getUniformLocation(prog, 'uSeed'),
  uSunset: gl.getUniformLocation(prog, 'uSunset'),
  uNight: gl.getUniformLocation(prog, 'uNight'),
  uPond: gl.getUniformLocation(prog, 'uPond'),
  uWindA: gl.getUniformLocation(prog, 'uWindA'),
  uWindB: gl.getUniformLocation(prog, 'uWindB'),
  uWindC: gl.getUniformLocation(prog, 'uWindC'),
  uCatRect: gl.getUniformLocation(prog, 'uCatRect'),
  uCatShadow: gl.getUniformLocation(prog, 'uCatShadow'),
  uCatAnim: gl.getUniformLocation(prog, 'uCatAnim'),
  uCatBlink: gl.getUniformLocation(prog, 'uCatBlink'),
  uActorRect: gl.getUniformLocation(prog, 'uActorRect')
};

const field = new AdaptiveField(FIELD_STEP);
const noiseTex = createSeamlessNoiseTexture(gl, 256);
const cloudGrid = createCloudGrid(gl);
let texA = null, texB = null;
let sdfA = null, sdfB = null;
let activeIcons = [];

let mixStart = 0, mixDuration = 540, curMix = 1.0;
let W = 1, H = 1, dpr = 1;
let paused = false, needsInitialSettle = true;
const SCENE_SEED = 17.3;

let simTime = 0, flowTime = 0, lastRaf = 0, lastDraw = 0;
let sunsetMix = 0, nightMix = 0, moodInitialized = false;

const pond = { x: 0, y: 0, rx: 0, ry: 0, active: false, initialized: false };

const kitten = createKittenController(gl, () => {
  if (paused) renderFrame(simTime);
});
const kiteBoy = createKiteBoyController(gl);
const windRibbons = createWindRibbonSystem();

function curS(x, y) {
  if (!sdfB) return 999;
  if (curMix >= 0.99 || !sdfA) return field.sample(sdfB, x, y);
  return field.sample(sdfA, x, y) * (1 - curMix) + field.sample(sdfB, x, y) * curMix;
}

function sampleSdfB(x, y) {
  return sdfB ? field.sample(sdfB, x, y) : 999;
}

function findOpenMeadowSpot(avoidList, minSdf, preferNorm = [0.58, 0.58], padScale = 1.0) {
  let best = { x: W * preferNorm[0], y: H * preferNorm[1], score: -999, found: false };
  const padX = Math.max(92, W * 0.09) * padScale;
  const padY = Math.max(105, H * 0.14) * padScale;

  for (let gy = 0; gy < 9; gy++) {
    for (let gx = 0; gx < 14; gx++) {
      const x = padX + (gx / 13) * Math.max(40, W - padX * 2);
      const y = padY + (gy / 8) * Math.max(40, H - padY * 2);
      const s = sampleSdfB(x, y);
      if (s < minSdf) continue;

      let blocked = false;
      for (const av of avoidList) {
        if (Math.hypot(x - av.x, y - av.y) < av.minDist) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const score = Math.min(200, s) * 0.011
                  + (1 - Math.hypot((x / W) - preferNorm[0], (y / H) - preferNorm[1])) * 1.15;
      if (score > best.score) best = { x, y, score, found: true };
    }
  }
  return best;
}

function relocatePond(snap = false) {
  if (!sdfB) return;
  const sc = Math.max(0.62, Math.min(1.12, Math.min(W, H) / 900));
  const rx = Math.round(78 * sc);
  const ry = Math.round(52 * sc);

  const curSdf = pond.initialized ? sampleSdfB(pond.x, pond.y) : -999;
  if (!pond.initialized || snap || !pond.active || curSdf < 68) {
    // Prefer open upper-center-right meadow clearing away from left icon columns
    const spot = findOpenMeadowSpot([], 82, [0.68, 0.34], 1.18);
    if (spot.found) {
      pond.x = spot.x;
      pond.y = spot.y;
      pond.rx = rx;
      pond.ry = ry;
      pond.active = true;
    } else {
      const fallback = findOpenMeadowSpot([], 58, [0.64, 0.42], 1.05);
      if (fallback.found) {
        pond.x = fallback.x;
        pond.y = fallback.y;
        pond.rx = Math.round(rx * 0.82);
        pond.ry = Math.round(ry * 0.82);
        pond.active = true;
      } else {
        pond.active = false;
        pond.rx = 0;
        pond.ry = 0;
      }
    }
    pond.initialized = true;
  }
}

function relocateCharacters(snap = false) {
  if (!sdfB) return;
  relocatePond(snap);

  const boy = kiteBoy.state;
  const cat = kitten.state;
  const avoidPond = pond.active ? [{ x: pond.x, y: pond.y, minDist: pond.rx + 85 }] : [];

  const boyInPond = pond.active && Math.hypot(boy.x - pond.x, boy.y - pond.y) < pond.rx + 52;
  if (!boy.initialized || snap) {
    const spot = findOpenMeadowSpot(avoidPond, 60, [0.54, 0.62]);
    boy.x = boy.fromX = boy.ctrlX = boy.tx = Math.max(120, Math.min(W - 140, spot.x));
    boy.y = boy.fromY = boy.ctrlY = boy.ty = Math.max(120, Math.min(H - 120, spot.y));
    boy.mode = 'idle';
    boy.stateTimer = 2.6;
    boy.initialized = true;
  } else if (boy.mode === 'idle' && (sampleSdfB(boy.x, boy.y) < 38 || boyInPond)) {
    kiteBoy.startRoamingRun({ W, H, sampleSdfB, catPos: cat, pondPos: pond });
  }

  const curCatSdf = sampleSdfB(cat.x, cat.y);
  const catDistBoy = Math.hypot(cat.x - boy.x, cat.y - boy.y);
  const catInPond = pond.active && Math.hypot(cat.x - pond.x, cat.y - pond.y) < pond.rx + 56;
  if (!cat.initialized || curCatSdf < 48 || catDistBoy < 140 || catInPond) {
    const avoidAll = [...avoidPond, { x: boy.x, y: boy.y, minDist: 155 }];
    const spot = findOpenMeadowSpot(avoidAll, 56, [0.76, 0.70]);
    cat.x = spot.x;
    cat.y = spot.y;
    cat.initialized = true;
  }
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
  cloudGrid.invalidate();

  cloudGrid.syncSkyClouds(P.cover, W, H);
  relocateCharacters(true);
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
  cloudGrid.invalidate();
  relocateCharacters(false);
  if (paused) renderFrame(simTime);
}

function computeTargetMood() {
  const mode = Math.round(P.timeMode || 0);
  if (mode === 0) return { sunset: 0.0, night: 0.0 };
  if (mode === 1) return { sunset: 1.0, night: 0.0 };
  if (mode === 2) return { sunset: 0.0, night: 1.0 };

  // Auto local solar clock: Day 06:30-16:45, Golden Sunset 16:45-19:15, Moonlit Night 19:15-05:15, Dawn 05:15-06:30
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

function renderFrame(t) {
  cloudGrid.upload(flowTime, {
    W, H, curMix,
    hasSdf: !!sdfB,
    adaptive: P.adaptive,
    iconCount: activeIcons.length,
    warp: P.warp,
    sampleSdf: curS
  });
  const actorRect = kiteBoy.renderAndUpload(t, { showBoy: P.showBoy, flow: P.flow, W, H });
  const [cgW, cgH] = cloudGrid.getGridSize();

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
  gl.bindTexture(gl.TEXTURE_2D, cloudGrid.getTexture());
  gl.uniform1i(U.uCirc, 3);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, kitten.texture);
  gl.uniform1i(U.uCat, 4);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, kiteBoy.actorTex);
  gl.uniform1i(U.uActor, 5);

  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, kiteBoy.actorShadowTex);
  gl.uniform1i(U.uActorShadow, 6);

  gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(U.uGrid, field.gw, field.gh);
  gl.uniform2f(U.uCGrid, cgW, cgH);
  gl.uniform1f(U.uStep, field.step);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uMix, curMix);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uWindTime, flowTime);
  gl.uniform1f(U.uFlowers, P.flowers);
  gl.uniform1f(U.uEdge, (P.warp - 36) * 0.45);
  gl.uniform1f(U.uSeed, SCENE_SEED);
  gl.uniform1f(U.uSunset, sunsetMix);
  gl.uniform1f(U.uNight, nightMix);
  gl.uniform4f(U.uPond, pond.x, pond.y, pond.active ? pond.rx : 0, pond.active ? pond.ry : 0);
  gl.uniform4fv(U.uWindA, windRibbons.bufA);
  gl.uniform4fv(U.uWindB, windRibbons.bufB);
  gl.uniform4fv(U.uWindC, windRibbons.bufC);

  if (P.showCat >= 0.5 && kitten.isReady()) {
    const catSize = Math.max(40, Math.min(72, Math.min(W, H) * 0.068));
    const { anim, blink } = kitten.computeAnim(t, P.flow);
    gl.uniform4f(U.uCatRect, kitten.state.x - catSize * 0.5, kitten.state.y - catSize * 0.5, catSize, catSize);
    gl.uniform2f(U.uCatShadow, catSize * 0.055, catSize * 0.075);
    gl.uniform4f(U.uCatAnim, anim[0], anim[1], anim[2], anim[3]);
    gl.uniform1f(U.uCatBlink, blink);
  } else {
    gl.uniform4f(U.uCatRect, 0, 0, 0, 0);
    gl.uniform1f(U.uCatBlink, 0);
  }

  if (actorRect) {
    gl.uniform4f(U.uActorRect, actorRect[0], actorRect[1], actorRect[2], actorRect[3]);
  } else {
    gl.uniform4f(U.uActorRect, 0, 0, 0, 0);
  }

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function tick(now) {
  requestAnimationFrame(tick);
  if (paused && !needsInitialSettle) {
    lastRaf = 0;
    return;
  }

  const targetMood = computeTargetMood();
  if (!moodInitialized) {
    sunsetMix = targetMood.sunset;
    nightMix = targetMood.night;
    moodInitialized = true;
  }
  const moodChanging = Math.abs(targetMood.sunset - sunsetMix) > 0.002
                    || Math.abs(targetMood.night - nightMix) > 0.002;
  // Smooth vsync-aligned 60 FPS on desktop (zero 30fps hitch); lighter 35 FPS in small preview iframe
  const targetInterval = isPreview ? 28 : 12;
  if (!needsInitialSettle && lastDraw && now - lastDraw < targetInterval) return;

  const dt = lastRaf ? Math.min(0.05, (now - lastRaf) / 1000) : 0.0167;
  lastRaf = now;
  lastDraw = now;
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

  cloudGrid.stepSkyClouds(dt, Math.max(0, P.flow), P.cover, W, H);
  windRibbons.step(dt, Math.max(0, P.flow), W, H);
  kiteBoy.step(dt, { showBoy: P.showBoy, flow: Math.max(0, P.flow), W, H, sampleSdfB, catPos: kitten.state, pondPos: pond });
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
      if (k === 'cover') cloudGrid.syncSkyClouds(P.cover, W, H);
      if (k === 'timeMode' && (!moodInitialized || paused)) {
        const m = computeTargetMood();
        sunsetMix = m.sunset;
        nightMix = m.night;
        moodInitialized = true;
      }
    }
    if (fieldDirty) commitField(false);
    if (paused) renderFrame(simTime);
  },
  onReset() {
    Object.assign(P, DEFAULTS);
    cloudGrid.syncSkyClouds(P.cover, W, H);
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
