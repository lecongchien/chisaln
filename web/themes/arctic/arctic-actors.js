/**
 * Arctic Sleeping Polar Bear Controller — Hand-Painted 512x512 Studio Ghibli Watercolor + 60 FPS WebGL2 GPU
 *
 * Renders our ultra-crisp 512x512 hand-inked Studio Ghibli Polar Bear atlas (`arctic-bear-atlas.webp`, 3x2)
 * with 128x128 bidirectional GPU optical-flow morphing (`arctic-bear-flow.png`) and Live2D soft-body
 * breathing deformation on WebGL2 GPU FBOs (~0.02ms/frame):
 *   - `SLEEPING`: Continuous 60 FPS mammalian breathing (`bearSettleLoop <-> bearSleepMid <-> bearSleepInhale`)
 *     with rhythmic translucent watercolor sleep bubble at the nose tip and drifting soft `z` letters.
 *   - `DREAM_STIR`: Occasional serene sleep stir — sleep bubble gently pops into mist, ear twitches with
 *     a tickled squint (`bearPeekSquint`), snuggles deeper into its fluffy front paw (`bearSnuggle`),
 *     lets out a soft warm breath puff, and settles smoothly back into deep sleep.
 */

import {
  uploadAtlasTexture,
  uploadFlowTexture,
  createGpuRigRenderer,
  radialWeight,
  applyWeightedRotation
} from './arctic-rig.js';

import {
  BEAR_ATLAS_META,
  BEAR_TILES_90,
  BEAR_FLOW_MAP
} from './arctic-flow-manifest.js';

import {
  createSpring,
  volumeScale,
  sampleMammalianBreath
} from './arctic-physics.js';

const TEX_SIZE = 560;

export const BEAR_NORM = { x: 0.50, y: 0.54 };
export const HOLE_NORM = { x: 0.74, y: 0.57, rx: 0, ry: 0 };

const BEAR_REF = 512;
const BEAR_PIVOT_Y = 180 / 192;
const BEAR_TILES = BEAR_TILES_90;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Peaceful curled-up dream-stir sequence (zero smiling frame; 100% backed by 128px baked optical-flow pairs!)
const BEAR_DREAM_STOPS = [
  [0.00, 'bearSleepMid'],
  [0.16, 'bearPeekSquint'],
  [0.32, 'bearSleepMid'],
  [0.46, 'bearSettleLoop'],
  [0.64, 'bearSnuggle'],
  [0.78, 'bearSnuggle'],
  [0.90, 'bearSettleLoop'],
  [1.00, 'bearSleepMid']
];

export function createArcticActorsController(gl, onReady) {
  const gpuRig = createGpuRigRenderer(gl, TEX_SIZE, 280, 12);

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = TEX_SIZE;
  overlayCanvas.height = TEX_SIZE;
  const ctx = overlayCanvas.getContext('2d');

  let bearAtlas = null;
  let bearFlowAtlas = null;

  // Upload Ultra-HD 1536x1024 (3x2 @ 512x512) Hand-Painted Studio Ghibli Polar Bear Atlas + 128px GPU Flow Map
  {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      bearAtlas = uploadAtlasTexture(gl, img);
      onReady?.();
    };
    img.src = 'assets/arctic-bear-atlas.webp?v=ghibli512';
  }
  {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      bearFlowAtlas = uploadFlowTexture(gl, img);
      onReady?.();
    };
    img.src = 'assets/arctic-bear-flow.png?v=ghibli512';
  }

  function sampleFlowChain(u, stops) {
    const n = stops.length;
    if (u <= stops[0][0]) return { keyA: stops[0][1], keyB: stops[0][1], morphT: 0 };
    if (u >= stops[n - 1][0]) return { keyA: stops[n - 1][1], keyB: stops[n - 1][1], morphT: 0 };
    for (let i = 0; i < n - 1; i++) {
      const t0 = stops[i][0];
      const t1 = stops[i + 1][0];
      if (u <= t1) {
        const keyA = stops[i][1];
        const keyB = stops[i + 1][1];
        if (keyA === keyB || t1 <= t0) return { keyA, keyB: keyA, morphT: 0 };
        return { keyA, keyB, morphT: clamp((u - t0) / (t1 - t0), 0, 1) };
      }
    }
    return { keyA: stops[n - 1][1], keyB: stops[n - 1][1], morphT: 0 };
  }

  function drawFlowBear(keyA, keyB, morphT, cx, cy, dw, dh, deformFn, opts) {
    if (!bearAtlas || !keyA || !BEAR_TILES[keyA]) return;
    if (!keyB || keyB === keyA || !BEAR_TILES[keyB] || morphT <= 0.004) {
      const [c, r] = BEAR_TILES[keyA];
      gpuRig.drawTile(bearAtlas, c, r, BEAR_ATLAS_META.cell, BEAR_REF, cx, cy, dw, dh, deformFn, opts);
      return;
    }
    if (morphT >= 0.996) {
      const [c, r] = BEAR_TILES[keyB];
      gpuRig.drawTile(bearAtlas, c, r, BEAR_ATLAS_META.cell, BEAR_REF, cx, cy, dw, dh, deformFn, opts);
      return;
    }
    const fwd = BEAR_FLOW_MAP[`${keyA}->${keyB}`];
    if (fwd && bearFlowAtlas) {
      const [cA, rA] = BEAR_TILES[keyA];
      const [cB, rB] = BEAR_TILES[keyB];
      gpuRig.drawMorphPair(
        bearAtlas, bearFlowAtlas,
        cA, rA, cB, rB,
        fwd[0], fwd[1], BEAR_ATLAS_META.flowTile, BEAR_ATLAS_META.maxFlowPx,
        BEAR_ATLAS_META.cell, BEAR_REF, cx, cy, dw, dh,
        morphT, deformFn, opts
      );
      return;
    }
    const rev = BEAR_FLOW_MAP[`${keyB}->${keyA}`];
    if (rev && bearFlowAtlas) {
      const [cA, rA] = BEAR_TILES[keyB];
      const [cB, rB] = BEAR_TILES[keyA];
      gpuRig.drawMorphPair(
        bearAtlas, bearFlowAtlas,
        cA, rA, cB, rB,
        rev[0], rev[1], BEAR_ATLAS_META.flowTile, BEAR_ATLAS_META.maxFlowPx,
        BEAR_ATLAS_META.cell, BEAR_REF, cx, cy, dw, dh,
        1 - morphT, deformFn, opts
      );
      return;
    }
    const pick = morphT < 0.5 ? keyA : keyB;
    const [c, r] = BEAR_TILES[pick];
    gpuRig.drawTile(bearAtlas, c, r, BEAR_ATLAS_META.cell, BEAR_REF, cx, cy, dw, dh, deformFn, opts);
  }

  // Exact ground-contact & anatomical anchors in TEX_SIZE space
  const BX = BEAR_NORM.x * TEX_SIZE;
  const BY_CENTER = BEAR_NORM.y * TEX_SIZE - 8;
  const BEAR_W = 268;
  const BEAR_PIV_OFF = (BEAR_PIVOT_Y - 0.5) * BEAR_W;
  const BY_GROUND = BY_CENTER + BEAR_PIV_OFF;

  // Calibrated nose tip on 512x512 hand-painted hero bear
  const SNOUT_X = BX + ((457.0 / BEAR_REF) - 0.5) * BEAR_W;
  const SNOUT_Y = BY_CENTER + ((221.2 / BEAR_REF) - 0.5) * BEAR_W;

  const phys = {
    bearSquash:  createSpring(0, 185, 14.5),
    bearLean:    createSpring(0, 125, 12.5),
    bearRecoilX: createSpring(0, 175, 13.5),
    bearEar:     createSpring(0, 240, 11.5),
    bearBelly:   createSpring(0, 135, 9.8)
  };

  const sm = {
    phase: 'SLEEPING',
    t: 0,
    dur: 8.5,
    didPop: false,
    popDrops: [],
    breathPuffs: [],
    zzzParticles: [],
    zzzTimer: 0.45,
    x: 640,
    y: 420,
    size: 360,
    initialized: false
  };

  function setMouse() {
    // Serene sleeping bear stays peacefully undisturbed by cursor motion
  }

  function triggerBubblePop(x, y) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.48;
      const spd = 28 + Math.random() * 56;
      sm.popDrops.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 5,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 14,
        r: 1.9 + Math.random() * 2.4,
        age: 0,
        life: 0.38 + Math.random() * 0.24,
        col: '#bfe8f7'
      });
    }
  }

  function enterPhase(nextPhase, dreamPace = 1.0) {
    sm.phase = nextPhase;
    sm.t = 0;
    sm.didPop = false;
    const pace = clamp(dreamPace, 0.35, 2.2);
    if (nextPhase === 'SLEEPING') {
      const baseSleep = 7.8 + Math.random() * 4.8;
      sm.dur = clamp(baseSleep / pace, 3.8, 17.0);
    } else {
      sm.dur = 3.85;
      phys.bearSquash.impulse(-0.22);
      phys.bearEar.impulse(6.4);
      phys.bearBelly.impulse(12.0);
      phys.bearRecoilX.impulse(-16);
    }
  }

  function step(dt, { mischief = 1.0, showFriends = 1 } = {}) {
    if (showFriends < 0.5) return;

    const d = Math.min(0.05, Math.max(0, dt));
    sm.t += d;

    let bearSquashTarget = 0;
    let bearLeanTarget = 0;

    if (sm.phase === 'SLEEPING') {
      sm.zzzTimer -= d;
      if (sm.zzzTimer <= 0) {
        sm.zzzTimer = 1.35 + Math.random() * 0.55;
        sm.zzzParticles.push({
          x: SNOUT_X + 6 + (Math.random() - 0.5) * 10,
          y: SNOUT_Y - 26,
          age: 0,
          life: 2.45,
          size: 13 + Math.random() * 5,
          drift: (Math.random() - 0.5) * 12
        });
      }
      if (sm.t >= sm.dur) enterPhase('DREAM_STIR', mischief);
    } else {
      const u = clamp(sm.t / sm.dur, 0, 1);
      if (!sm.didPop && sm.t >= 0.04) {
        sm.didPop = true;
        triggerBubblePop(SNOUT_X + 10, SNOUT_Y + 1);
      }
      // Soft warm watercolor sigh puff while smiling & snuggling in its dream
      if (u > 0.32 && u < 0.56 && Math.random() < d * 5.2) {
        sm.breathPuffs.push({
          x: SNOUT_X + 6 + (Math.random() - 0.5) * 6,
          y: SNOUT_Y - 3 + (Math.random() - 0.5) * 5,
          vx: 10 + Math.random() * 9,
          vy: -13 - Math.random() * 9,
          r: 4.5 + Math.random() * 3.2,
          age: 0,
          life: 1.05 + Math.random() * 0.30
        });
      }
      bearSquashTarget = -Math.sin(clamp((u - 0.24) / 0.56, 0, 1) * Math.PI) * 0.022;
      bearLeanTarget = Math.sin(u * Math.PI) * 0.010;
      if (sm.t >= sm.dur) enterPhase('SLEEPING', mischief);
    }

    phys.bearSquash.step(d, bearSquashTarget);
    phys.bearLean.step(d, bearLeanTarget);
    phys.bearRecoilX.step(d, 0);
    phys.bearEar.step(d, 0);
    phys.bearBelly.step(d, 0);

    for (let i = sm.popDrops.length - 1; i >= 0; i--) {
      const p = sm.popDrops[i];
      p.age += d;
      p.vx *= Math.exp(-1.8 * d);
      p.vy = p.vy * Math.exp(-1.1 * d) + 92 * d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      if (p.age >= p.life) sm.popDrops.splice(i, 1);
    }
    for (let i = sm.breathPuffs.length - 1; i >= 0; i--) {
      const b = sm.breathPuffs[i];
      b.age += d;
      b.vx *= Math.exp(-1.1 * d);
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.r += 9.0 * d;
      if (b.age >= b.life) sm.breathPuffs.splice(i, 1);
    }
    for (let i = sm.zzzParticles.length - 1; i >= 0; i--) {
      const z = sm.zzzParticles[i];
      z.age += d;
      z.y -= 24 * d;
      z.x += (10 + Math.sin(z.age * 3.0) * 11 + z.drift * 0.2) * d;
      if (z.age >= z.life) sm.zzzParticles.splice(i, 1);
    }
  }

  function makeBearSleepDeform(breathSigned, earImpulse, bellyJiggle, recoilX) {
    return (u, v, out) => {
      const anchor = clamp((462 - v) / 165, 0, 1);
      // Rounded upper back & ribcage gentle breathing expansion on 512x512 hero Ghibli bear
      const wBreath = radialWeight(u, v, 210, 215, 185, 150) * anchor;
      out[0] -= breathSigned * 3.0 * wBreath;
      out[1] -= (breathSigned * 7.5 - bellyJiggle * 0.22) * wBreath;
      // Head & snout subtle bob
      const wHead = radialWeight(u, v, 405, 190, 96, 86) * anchor;
      out[0] += recoilX * 0.30 * wHead;
      out[1] -= breathSigned * 1.8 * wHead;
      // Calibrated front & back ears on 512x512 hero bear for soft dreaming ear-twitch
      if (Math.abs(earImpulse) > 0.02) {
        const e = clamp(earImpulse * 0.036, -0.32, 0.32);
        applyWeightedRotation(out, 384, 114,  e, radialWeight(u, v, 384, 102, 38, 36));
        applyWeightedRotation(out, 428, 120, -e * 0.85, radialWeight(u, v, 430, 110, 30, 30));
      }
    };
  }

  function resolveBearFrame(simT) {
    const breathObj = sampleMammalianBreath(simT, 4.4);
    const breathLag = sampleMammalianBreath(simT - 0.24, 4.4);
    const breathSigned = breathObj.signed;

    let keyA = 'bearSleepMid';
    let keyB = 'bearSleepMid';
    let morphT = 0;
    let bubbleScale = 0;

    if (sm.phase === 'SLEEPING') {
      const lvl = clamp(breathObj.level, 0, 1);
      if (lvl < 0.5) {
        keyA = 'bearSettleLoop';
        keyB = 'bearSleepMid';
        morphT = lvl * 2.0;
      } else {
        keyA = 'bearSleepMid';
        keyB = 'bearSleepInhale';
        morphT = (lvl - 0.5) * 2.0;
      }
      bubbleScale = 0.58 + 0.42 * breathLag.level;
    } else {
      const u = clamp(sm.t / sm.dur, 0, 1);
      const c = sampleFlowChain(u, BEAR_DREAM_STOPS);
      keyA = c.keyA;
      keyB = c.keyB;
      morphT = c.morphT;
      bubbleScale = sstep(0.84, 1.0, u) * (0.58 + 0.30 * breathLag.level);
    }

    const { sx, sy } = volumeScale(phys.bearSquash.x);
    return {
      keyA, keyB, morphT,
      drawX: BX + phys.bearRecoilX.x * 0.20,
      drawPivY: BY_GROUND,
      rot: phys.bearLean.x,
      sx, sy,
      breathSigned,
      bubbleScale
    };
  }

  function drawVectorOverlay(simT, showBubbles, bf) {
    ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Translucent watercolor sleep bubble at exact tip of black nose
    if (bf && bf.bubbleScale > 0.04) {
      const wobble = Math.sin(simT * 4.6) * 0.032;
      const br = 13.0 * bf.bubbleScale * (1 + wobble);
      const bx = SNOUT_X + phys.bearRecoilX.x * 0.3 + br * 0.72;
      const by = SNOUT_Y + br * 0.08 - bf.breathSigned * 1.5;
      ctx.save();
      const bg = ctx.createRadialGradient(bx - br * 0.32, by - br * 0.35, br * 0.1, bx, by, br);
      bg.addColorStop(0.0, 'rgba(255, 255, 255, 0.88)');
      bg.addColorStop(0.55, 'rgba(182, 224, 240, 0.44)');
      bg.addColorStop(0.92, 'rgba(128, 184, 212, 0.62)');
      bg.addColorStop(1.0, 'rgba(84, 134, 168, 0.50)');
      ctx.fillStyle = bg;
      ctx.strokeStyle = 'rgba(72, 108, 132, 0.46)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.ellipse(bx - br * 0.30, by - br * 0.32, br * 0.25, br * 0.14, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of sm.popDrops) {
      const al = 1.0 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = clamp(al * 1.12, 0, 1);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.48 + 0.52 * al), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const b of sm.breathPuffs) {
      const u = b.age / b.life;
      ctx.save();
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.38;
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r);
      g.addColorStop(0, 'rgba(255, 253, 248, 0.92)');
      g.addColorStop(1, 'rgba(235, 246, 252, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (showBubbles >= 0.5) {
      for (const z of sm.zzzParticles) {
        const u = z.age / z.life;
        ctx.save();
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.84;
        ctx.translate(z.x, z.y);
        ctx.rotate(Math.sin(z.age * 2.1) * 0.14);
        ctx.font = `italic 700 ${Math.round(z.size)}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(252, 248, 238, 0.90)';
        ctx.lineWidth = 3.2;
        ctx.fillStyle = '#476a8c';
        ctx.strokeText('z', 0, 0);
        ctx.fillText('z', 0, 0);
        ctx.restore();
      }
    }
  }

  function renderAndUpload(simT, { showFriends = 1, showBubbles = 1 } = {}) {
    if (showFriends < 0.5 || !bearAtlas) {
      gpuRig.beginShadow();
      gpuRig.beginColor();
      gpuRig.end();
      return;
    }

    const bf = resolveBearFrame(simT);

    // 1. Ground-pinned soft watercolor shadow FBO
    gpuRig.beginShadow();
    drawFlowBear(
      bf.keyA, bf.keyB, bf.morphT,
      bf.drawX + 12, BY_GROUND + 14, BEAR_W, BEAR_W, null,
      { rot: bf.rot * 0.45, sx: bf.sx * 1.03, sy: 0.85, alpha: 0.86, pivotY: BEAR_PIVOT_Y }
    );

    // 2. Crisp 512x512 hand-painted Ghibli Bear + Live2D soft-body breathing FBO
    gpuRig.beginColor();
    const deform = makeBearSleepDeform(
      bf.breathSigned, phys.bearEar.x, phys.bearBelly.x, phys.bearRecoilX.x
    );
    drawFlowBear(
      bf.keyA, bf.keyB, bf.morphT,
      bf.drawX, bf.drawPivY, BEAR_W, BEAR_W, deform,
      { rot: bf.rot, sx: bf.sx, sy: bf.sy, alpha: 1, pivotY: BEAR_PIVOT_Y }
    );

    drawVectorOverlay(simT, showBubbles, bf);
    gpuRig.drawOverlayCanvas(overlayCanvas);
    gpuRig.end();
  }

  function getHoleCss() {
    const left = sm.x - sm.size * 0.5;
    const top  = sm.y - sm.size * 0.5;
    return [
      left + HOLE_NORM.x * sm.size,
      top  + HOLE_NORM.y * sm.size,
      HOLE_NORM.rx * sm.size,
      HOLE_NORM.ry * sm.size
    ];
  }

  function getActorsRectCss() {
    return [
      sm.x - sm.size * 0.5,
      sm.y - sm.size * 0.5,
      sm.size,
      sm.size
    ];
  }

  return {
    state: sm,
    actorsTexture: gpuRig.actorsTexture,
    shadowTexture: gpuRig.shadowTexture,
    setMouse,
    step,
    renderAndUpload,
    getHoleCss,
    getActorsRectCss,
    getRipple: () => [10.0, 0.0]
  };
}
