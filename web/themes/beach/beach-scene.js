/**
 * Beach Theme Scene Controller
 * Orchestrates adaptive coastal SDF islands, swash animation, kayaks,
 * seabirds, watercolor palm atlas rendering, and HostBridge synchronization.
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
import { BEACH_FS, PALM_VS, PALM_FS } from './beach-shader.js';
import { createPalmAtlasLoader, computePalmSpots } from './palm-atlas.js';

const DEFAULTS = {
  timeMode: 0, // 0 = Day, 1 = Golden Coastal Sunset, 2 = Moonlit Night, 3 = Auto by local clock
  sigma: 84,
  warp: 34,
  shoal: 96,
  shallow: 350,
  speed: 1.0,
  waves: 1.0,
  palms: 5,
  kayaks: 2,
  birds: 4
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

const terrainProg = createShaderProgram(gl, BEACH_FS);
const palmProg = createShaderProgram(gl, PALM_FS, PALM_VS);

const U = {
  uFA: gl.getUniformLocation(terrainProg, 'uFA'),
  uFB: gl.getUniformLocation(terrainProg, 'uFB'),
  uNoise: gl.getUniformLocation(terrainProg, 'uNoise'),
  uRes: gl.getUniformLocation(terrainProg, 'uRes'),
  uGrid: gl.getUniformLocation(terrainProg, 'uGrid'),
  uStep: gl.getUniformLocation(terrainProg, 'uStep'),
  uDpr: gl.getUniformLocation(terrainProg, 'uDpr'),
  uMix: gl.getUniformLocation(terrainProg, 'uMix'),
  uTime: gl.getUniformLocation(terrainProg, 'uTime'),
  uSpeed: gl.getUniformLocation(terrainProg, 'uSpeed'),
  uWaves: gl.getUniformLocation(terrainProg, 'uWaves'),
  uShoal: gl.getUniformLocation(terrainProg, 'uShoal'),
  uShallow: gl.getUniformLocation(terrainProg, 'uShallow'),
  uSigma: gl.getUniformLocation(terrainProg, 'uSigma'),
  uSunset: gl.getUniformLocation(terrainProg, 'uSunset'),
  uNight: gl.getUniformLocation(terrainProg, 'uNight'),
  uSeed: gl.getUniformLocation(terrainProg, 'uSeed'),
  uKayN: gl.getUniformLocation(terrainProg, 'uKayN'),
  uKay: gl.getUniformLocation(terrainProg, 'uKay'),
  uRip: gl.getUniformLocation(terrainProg, 'uRip'),
  uBirdN: gl.getUniformLocation(terrainProg, 'uBirdN'),
  uBird: gl.getUniformLocation(terrainProg, 'uBird')
};

const UP = {
  uRes: gl.getUniformLocation(palmProg, 'uRes'),
  uResPx: gl.getUniformLocation(palmProg, 'uResPx'),
  uDpr: gl.getUniformLocation(palmProg, 'uDpr'),
  uPalm: gl.getUniformLocation(palmProg, 'uPalm'),
  uMirror: gl.getUniformLocation(palmProg, 'uMirror'),
  uTime: gl.getUniformLocation(palmProg, 'uTime'),
  uPhase: gl.getUniformLocation(palmProg, 'uPhase'),
  uSpeed: gl.getUniformLocation(palmProg, 'uSpeed'),
  uSunset: gl.getUniformLocation(palmProg, 'uSunset'),
  uNight: gl.getUniformLocation(palmProg, 'uNight'),
  uAtlas: gl.getUniformLocation(palmProg, 'uAtlas'),
  uBirdN: gl.getUniformLocation(palmProg, 'uBirdN'),
  uBird: gl.getUniformLocation(palmProg, 'uBird')
};

const field = new AdaptiveField(FIELD_STEP);
const noiseTex = createSeamlessNoiseTexture(gl, 256);
let texA = null, texB = null;
let sdfA = null, sdfB = null;
let activeIcons = [];

let mixStart = 0, mixDuration = 540, curMix = 1.0;
let W = 1, H = 1, dpr = 1;
let paused = false, needsInitialSettle = true;
const SCENE_SEED = 11.7;

let palmSpots = [];
const kayaks = [];
const ripples = [];
const birds = [];
const kayUniforms = new Float32Array(4 * 4);
const ripUniforms = new Float32Array(6 * 4);
const birdUniforms = new Float32Array(8 * 4);
let nextRipIdx = 0;

let simTime = 0, lastRaf = 0, lastDraw = 0;
let sunsetMix = 0, nightMix = 0, moodInitialized = false;

function sstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function targetMoodFromClock() {
  const mode = Math.round(P.timeMode || 0);
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

const palmAtlas = createPalmAtlasLoader(gl, () => {
  if (paused) renderFrame(simTime);
});

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

  const initialSdf = field.compute(activeIcons, P.sigma, P.warp, 0.35);
  sdfA = initialSdf; sdfB = initialSdf;
  uploadFieldTexture(gl, texA, field, sdfA);
  uploadFieldTexture(gl, texB, field, sdfB);
  curMix = 1.0;

  palmSpots = computePalmSpots(field, sdfB, activeIcons, W, H, P.palms);
  syncKayaks();
  syncBirds();
}

function commitField(animate = true) {
  if (!texA || !texB) return;
  const nextSdf = field.compute(activeIcons, P.sigma, P.warp, 0.35);
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
  palmSpots = computePalmSpots(field, sdfB, activeIcons, W, H, P.palms);
  if (paused) renderFrame(simTime);
}

function sampleActiveSdf(x, y) {
  if (!sdfB) return 999;
  if (curMix >= 0.99 || !sdfA) return field.sample(sdfB, x, y);
  return field.sample(sdfA, x, y) * (1 - curMix) + field.sample(sdfB, x, y) * curMix;
}

function syncKayaks() {
  const want = Math.round(P.kayaks);
  while (kayaks.length > want) kayaks.pop();
  while (kayaks.length < want) {
    let sx = W * (0.35 + Math.random() * 0.55);
    let sy = H * (0.2 + Math.random() * 0.65);
    for (let tries = 0; tries < 40; tries++) {
      const tx = 70 + Math.random() * Math.max(40, W - 140);
      const ty = 70 + Math.random() * Math.max(40, H - 140);
      if (sampleActiveSdf(tx, ty) > 68) { sx = tx; sy = ty; break; }
    }
    kayaks.push({
      x: sx, y: sy,
      angle: Math.random() * Math.PI * 2,
      speed: 14 + Math.random() * 7,
      phase: Math.random() * Math.PI * 2,
      lastDipSide: 0
    });
  }
}

function spawnRipple(x, y) {
  ripples[nextRipIdx] = { x, y, t: simTime, s: 0.85 + Math.random() * 0.3 };
  nextRipIdx = (nextRipIdx + 1) % 6;
}

function stepKayaks(dt) {
  const speedScale = Math.max(0.2, P.speed);
  for (let i = 0; i < kayaks.length; i++) {
    const k = kayaks[i];
    const s = sampleActiveSdf(k.x, k.y);
    const vx = Math.cos(k.angle), vy = Math.sin(k.angle);
    let turn = Math.sin(simTime * 0.36 + k.phase) * 0.42;

    if (s < 88) {
      const g = field.gradient(sdfB, k.x, k.y, 14);
      const push = Math.min(1, (88 - s) / 56);
      const cross = vx * g.y - vy * g.x;
      turn += (cross >= 0 ? 1 : -1) * push * 2.6;
      if (s < 36) {
        k.x += g.x * (36 - s) * 0.08;
        k.y += g.y * (36 - s) * 0.08;
      }
    }

    const margin = 58;
    if (k.x < margin) turn += (vy >= 0 ? -1 : 1) * 1.3;
    if (k.x > W - margin) turn += (vy >= 0 ? 1 : -1) * 1.3;
    if (k.y < margin) turn += (vx >= 0 ? 1 : -1) * 1.3;
    if (k.y > H - margin) turn += (vx >= 0 ? -1 : 1) * 1.3;

    for (let j = 0; j < kayaks.length; j++) {
      if (i === j) continue;
      const o = kayaks[j];
      const dx = k.x - o.x, dy = k.y - o.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && dist < 125) {
        const cross = vx * (dy / dist) - vy * (dx / dist);
        turn += (cross >= 0 ? 1 : -1) * ((125 - dist) / 125) * 2.2;
      }
    }

    k.angle += turn * dt * 1.15;
    const curSpeed = k.speed * speedScale * (s < 48 ? 0.55 : 1.0);
    k.x = Math.max(20, Math.min(W - 20, k.x + Math.cos(k.angle) * curSpeed * dt));
    k.y = Math.max(20, Math.min(H - 20, k.y + Math.sin(k.angle) * curSpeed * dt));
    k.phase += dt * 3.1 * speedScale;

    const dipSide = Math.sin(k.phase) >= 0 ? 1 : -1;
    if (dipSide !== k.lastDipSide && s > 22) {
      k.lastDipSide = dipSide;
      const nx = -Math.sin(k.angle), ny = Math.cos(k.angle);
      spawnRipple(k.x + nx * 13 * dipSide, k.y + ny * 13 * dipSide);
    }
  }

  kayUniforms.fill(0);
  for (let i = 0; i < Math.min(4, kayaks.length); i++) {
    const k = kayaks[i];
    kayUniforms[i * 4]     = k.x;
    kayUniforms[i * 4 + 1] = k.y;
    kayUniforms[i * 4 + 2] = k.angle;
    kayUniforms[i * 4 + 3] = k.phase;
  }

  ripUniforms.fill(0);
  for (let i = 0; i < 6; i++) {
    const rp = ripples[i];
    if (!rp) continue;
    ripUniforms[i * 4]     = rp.x;
    ripUniforms[i * 4 + 1] = rp.y;
    ripUniforms[i * 4 + 2] = rp.t;
    ripUniforms[i * 4 + 3] = rp.s;
  }
}

function syncBirds() {
  const want = Math.round(P.birds);
  while (birds.length > want) birds.pop();
  while (birds.length < want) {
    const edge = Math.random() < 0.5;
    birds.push({
      x: edge ? -45 : Math.random() * W,
      y: edge ? Math.random() * H : -45,
      angle: 0.25 + Math.random() * 0.7,
      speed: 34 + Math.random() * 18,
      wingPhase: Math.random() * Math.PI * 2,
      turnBias: (Math.random() - 0.5) * 0.22
    });
  }
}

function stepBirds(dt) {
  const sp = Math.max(0.25, P.speed);
  for (const b of birds) {
    b.angle += Math.sin(simTime * 0.32 + b.wingPhase) * 0.18 * dt + b.turnBias * dt * 0.14;
    b.x += Math.cos(b.angle) * b.speed * sp * dt;
    b.y += Math.sin(b.angle) * b.speed * sp * dt;
    b.wingPhase += dt * 4.4 * sp;
    const pad = 75;
    if (b.x > W + pad) b.x = -pad;
    if (b.x < -pad) b.x = W + pad;
    if (b.y > H + pad) b.y = -pad;
    if (b.y < -pad) b.y = H + pad;
  }

  birdUniforms.fill(0);
  for (let i = 0; i < Math.min(8, birds.length); i++) {
    const b = birds[i];
    birdUniforms[i * 4]     = b.x;
    birdUniforms[i * 4 + 1] = b.y;
    birdUniforms[i * 4 + 2] = b.angle;
    birdUniforms[i * 4 + 3] = 0.72 + 0.28 * Math.sin(b.wingPhase);
  }
}

function renderFrame(t) {
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);

  // 1. Render stippled gouache ocean, sand, 3 swash sheets, SDF kayaks & gulls
  gl.disable(gl.BLEND);
  gl.useProgram(terrainProg);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.uniform1i(U.uFA, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texB);
  gl.uniform1i(U.uFB, 1);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, noiseTex);
  gl.uniform1i(U.uNoise, 2);

  gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
  gl.uniform2f(U.uGrid, field.gw, field.gh);
  gl.uniform1f(U.uStep, field.step);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uMix, curMix);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uSpeed, P.speed);
  gl.uniform1f(U.uWaves, P.waves);
  gl.uniform1f(U.uShoal, P.shoal);
  gl.uniform1f(U.uShallow, P.shallow);
  gl.uniform1f(U.uSigma, P.sigma);
  gl.uniform1f(U.uSunset, sunsetMix);
  gl.uniform1f(U.uNight, nightMix);
  gl.uniform1f(U.uSeed, SCENE_SEED);

  gl.uniform1f(U.uKayN, kayaks.length);
  gl.uniform4fv(U.uKay, kayUniforms);
  gl.uniform4fv(U.uRip, ripUniforms);
  gl.uniform1f(U.uBirdN, birds.length);
  gl.uniform4fv(U.uBird, birdUniforms);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // 2. Render watercolor palm atlas quads (birds soar cleanly ABOVE fronds via gullSD discard)
  const palmAtlasTex = palmAtlas.getTexture();
  if (palmAtlasTex && palmSpots.length > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(palmProg);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, palmAtlasTex);
    gl.uniform1i(UP.uAtlas, 3);
    gl.uniform2f(UP.uRes, W, H);
    gl.uniform2f(UP.uResPx, glCanvas.width, glCanvas.height);
    gl.uniform1f(UP.uDpr, dpr);
    gl.uniform1f(UP.uTime, t);
    gl.uniform1f(UP.uSpeed, P.speed);
    gl.uniform1f(UP.uSunset, sunsetMix);
    gl.uniform1f(UP.uNight, nightMix);
    gl.uniform1f(UP.uBirdN, birds.length);
    gl.uniform4fv(UP.uBird, birdUniforms);

    const viewScale = Math.max(0.55, Math.min(1.06, Math.min(W, H) / 880));
    for (const p of palmSpots) {
      gl.uniform4f(UP.uPalm, p.x, p.y, p.scale * viewScale, p.variant);
      gl.uniform1f(UP.uMirror, p.mirror);
      gl.uniform1f(UP.uPhase, p.phase);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
  }
}

function tick(now) {
  requestAnimationFrame(tick);
  if (paused && !needsInitialSettle) {
    lastRaf = 0;
    return;
  }

  // Smooth vsync-aligned 60 FPS on desktop (removes old 33ms 30fps cap); lighter 35 FPS in preview iframe
  const targetInterval = isPreview ? 28 : 12;
  if (!needsInitialSettle && lastDraw && now - lastDraw < targetInterval) return;

  const dt = lastRaf ? Math.min(0.05, (now - lastRaf) / 1000) : 0.0167;
  lastRaf = now;
  lastDraw = now;
  simTime += dt;

  if (curMix < 1.0) {
    const rawT = Math.min(1, (now - mixStart) / mixDuration);
    curMix = 1 - Math.pow(1 - rawT, 3);
  }

  const tgt = targetMoodFromClock();
  if (!moodInitialized) {
    sunsetMix = tgt.sunset;
    nightMix = tgt.night;
    moodInitialized = true;
  } else {
    const k = Math.min(1, dt * 1.45);
    sunsetMix += (tgt.sunset - sunsetMix) * k;
    nightMix  += (tgt.night  - nightMix)  * k;
    if (Math.abs(tgt.sunset - sunsetMix) < 0.002) sunsetMix = tgt.sunset;
    if (Math.abs(tgt.night  - nightMix)  < 0.002) nightMix  = tgt.night;
  }

  stepKayaks(dt);
  stepBirds(dt);
  renderFrame(simTime);
  needsInitialSettle = false;
}

const bridge = createHostBridge({
  onSettings(partial) {
    let fieldDirty = false;
    let entitiesDirty = false;
    for (const [k, v] of Object.entries(partial)) {
      if (!(k in P)) continue;
      const num = Number(v);
      if (!Number.isFinite(num) || P[k] === num) continue;
      P[k] = num;
      if (k === 'sigma' || k === 'warp') fieldDirty = true;
      if (k === 'palms' || k === 'kayaks' || k === 'birds') entitiesDirty = true;
      if (k === 'timeMode' && (!moodInitialized || paused)) {
        const tgt = targetMoodFromClock();
        sunsetMix = tgt.sunset;
        nightMix = tgt.night;
        moodInitialized = true;
      }
    }
    if (fieldDirty) commitField(false);
    if (entitiesDirty) {
      palmSpots = computePalmSpots(field, sdfB, activeIcons, W, H, P.palms);
      syncKayaks();
      syncBirds();
    }
    if (paused) renderFrame(simTime);
  },
  onReset() {
    Object.assign(P, DEFAULTS);
    commitField(true);
    syncKayaks();
    syncBirds();
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
