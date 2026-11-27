/**
 * Arctic Comedy Duo Controller — Hand-Painted Studio Ghibli Watercolor + 60 FPS WebGL2 GPU Edition
 *
 * Uses our two crisp, torso- & ground-locked Studio Ghibli watercolor WebP atlases:
 *   - `assets/arctic-bear-atlas.webp`    (1152x1152, 6x6 = 36 frames, 221.1 KB disk, 5.06 MB RAM)
 *   - `assets/arctic-penguin-atlas.webp` (1008x576,  7x4 = 28 frames, 130.8 KB disk, 2.21 MB RAM)
 *
 * Rendered natively at 60 FPS on WebGL2 GPU FBOs (`arctic-rig.js`, ~0.07ms CPU/frame!) with:
 *   - True Cause -> Effect comedic choreography (Bear stays asleep until prank lands; Penguin
 *     flips & dives completely underwater before Bear finishes sitting up looking at the empty hole!)
 *   - Unified right-flowing red scarf across all upright penguin poses & left-flipper waving AT Bear
 *   - 2nd-order damped spring physics, parabolic gravity arcs, hydrodynamic water drag,
 *     velocity-coupled scarf waves, animated waterline foam ring, and ground-pinned snow shadows.
 */

import {
  prepareAtlasCanvas,
  uploadAtlasTexture,
  uploadFlowTexture,
  createGpuRigRenderer,
  radialWeight,
  applyWeightedRotation,
  drawLiveWatercolorEye
} from './arctic-rig.js';

import {
  BEAR_ATLAS_META,
  PENG_ATLAS_META,
  BEAR_TILES_90,
  BEAR_FLOW_MAP,
  PENG_FLOW_MAP
} from './arctic-flow-manifest.js';

import {
  createSpring,
  createBallisticBody,
  volumeScale,
  sampleMammalianBreath,
  createMicroMorphTrack
} from './arctic-physics.js';

const TEX_SIZE = 560;

export const BEAR_NORM = { x: 0.37, y: 0.56 };
export const HOLE_NORM = { x: 0.74, y: 0.57, rx: 0.142, ry: 0.106 };

const BEAR_CELL = BEAR_ATLAS_META.cell, BEAR_REF = 512, BEAR_PIVOT_Y = 180 / 192;
const PENG_CELL = PENG_ATLAS_META.cell, PENG_REF = 384, PENG_PIVOT_Y = 136 / 144;

// 10x9 = 90 hand-painted Studio Ghibli Polar Bear keyframes + 60 FPS GPU Optical-Flow Morphing!
const BEAR_TILES = BEAR_TILES_90;

const PENG_TILES = {
  pengCrownPeek:     [0, 0],
  pengPopStand:      [1, 0],
  pengLookBear:      [2, 0],
  pengPeek:          [3, 0],
  pengFlapPeek:      [4, 0],
  pengTipToePoke:    [5, 0],
  pengAimReady:      [6, 0],

  pengWave:          [0, 1],
  pengWaveJoy:       [1, 1],
  pengChirpNoot:     [2, 1],
  pengWaveMid:       [3, 1],
  pengWaveLow:       [4, 1],
  pengWindUp:        [5, 1],
  pengThrow:         [6, 1],

  pengFollowThrough: [0, 2],
  pengGiggle:        [1, 2],
  pengGiggleBounce:  [2, 2],
  pengSneakA:        [3, 2],
  pengSneakB:        [4, 2],
  pengSneak:         [5, 2],
  pengOhNo:          [6, 2],

  pengPanic:         [0, 3],
  pengTumble:        [1, 3],
  pengTuckFlip:      [2, 3],
  pengDive:          [3, 3],
  pengKickA:         [4, 3],
  pengFeetSplash:    [5, 3],
  pengKickB:         [6, 3]
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = clamp(t, 0, 1) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
};

export function createArcticActorsController(gl, onReady) {
  const gpuRig = createGpuRigRenderer(gl, TEX_SIZE, 280, 12);

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = TEX_SIZE;
  overlayCanvas.height = TEX_SIZE;
  const ctx = overlayCanvas.getContext('2d');

  let bearAtlas = null;
  let bearFlowAtlas = null;
  let pengAtlas = null;
  let pengFlowAtlas = null;

  // 1. Upload 1600x1440 (10x9) Studio Ghibli Polar Bear WebP Atlas + GPU Flow Map
  //    (Uses only peaceful curled-up sleeping, breathing, squint & cozy snuggle frames — zero upright sit!)
  {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      bearAtlas = uploadAtlasTexture(gl, img);
      onReady?.();
    };
    img.src = 'assets/arctic-bear-atlas.webp?v=ghibli90';
  }
  {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      bearFlowAtlas = uploadFlowTexture(gl, img);
      onReady?.();
    };
    img.src = 'assets/arctic-bear-flow.png?v=ghibli90';
  }

  // 2. Upload 1008x576 Studio Ghibli Penguin WebP Atlas + GPU Flow Map
  {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      pengAtlas = uploadAtlasTexture(gl, img);
      onReady?.();
    };
    img.src = 'assets/arctic-penguin-atlas.webp?v=ghibli3';
  }
  {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      pengFlowAtlas = uploadFlowTexture(gl, img);
      onReady?.();
    };
    img.src = 'assets/arctic-penguin-flow.png?v=ghibli90';
  }

  // Continuous 60 FPS keyframe-chain sampler: maps u -> { keyA, keyB, morphT in [0..1] }
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

  // Unified GPU Flow-Morph renderer: warps A -> B continuously at 60 FPS using baked optical-flow map!
  function drawFlowActor(atlas, flowAtlas, tilesMap, flowMap, meta, keyA, keyB, morphT, refSize, cx, cy, dw, dh, deformFn, opts) {
    if (!atlas || !keyA || !tilesMap[keyA]) return;
    if (!keyB || keyB === keyA || !tilesMap[keyB] || morphT <= 0.004) {
      const [c, r] = tilesMap[keyA];
      gpuRig.drawTile(atlas, c, r, meta.cell, refSize, cx, cy, dw, dh, deformFn, opts);
      return;
    }
    if (morphT >= 0.996) {
      const [c, r] = tilesMap[keyB];
      gpuRig.drawTile(atlas, c, r, meta.cell, refSize, cx, cy, dw, dh, deformFn, opts);
      return;
    }
    const fwd = flowMap[`${keyA}->${keyB}`];
    if (fwd && flowAtlas) {
      const [cA, rA] = tilesMap[keyA];
      const [cB, rB] = tilesMap[keyB];
      gpuRig.drawMorphPair(
        atlas, flowAtlas,
        cA, rA, cB, rB,
        fwd[0], fwd[1], meta.flowTile, meta.maxFlowPx,
        meta.cell, refSize, cx, cy, dw, dh,
        morphT, deformFn, opts
      );
      return;
    }
    // Symmetric reverse flow support (B->A flow inverted at 1 - morphT!)
    const rev = flowMap[`${keyB}->${keyA}`];
    if (rev && flowAtlas) {
      const [cA, rA] = tilesMap[keyB];
      const [cB, rB] = tilesMap[keyA];
      gpuRig.drawMorphPair(
        atlas, flowAtlas,
        cA, rA, cB, rB,
        rev[0], rev[1], meta.flowTile, meta.maxFlowPx,
        meta.cell, refSize, cx, cy, dw, dh,
        1 - morphT, deformFn, opts
      );
      return;
    }
    // Clean fallback if flow pair is not in manifest: crisp nearest keyframe (never double-ghost!)
    const pick = morphT < 0.5 ? keyA : keyB;
    const [c, r] = tilesMap[pick];
    gpuRig.drawTile(atlas, c, r, meta.cell, refSize, cx, cy, dw, dh, deformFn, opts);
  }

  // Exact ground-contact anchors (matching pivotY = BEAR_PIVOT_Y & PENG_PIVOT_Y in arctic-rig.js!)
  const BX = BEAR_NORM.x * TEX_SIZE;
  const BY_CENTER = BEAR_NORM.y * TEX_SIZE - 8;
  const BEAR_W = 266;
  const BEAR_PIV_OFF = (BEAR_PIVOT_Y - 0.5) * BEAR_W;
  const BY_GROUND = BY_CENTER + BEAR_PIV_OFF;

  const HX = HOLE_NORM.x * TEX_SIZE;
  const HY = HOLE_NORM.y * TEX_SIZE;
  const HRX = HOLE_NORM.rx * TEX_SIZE;
  const HRY = HOLE_NORM.ry * TEX_SIZE;
  const HOLE_CLIP = [HX, HY, HRX * 0.94, HRY * 0.90];
  const PENG_W = 116;
  const PENG_PIV_OFF = (PENG_PIVOT_Y - 0.5) * PENG_W;

  // Calibrated anatomical landmarks in TEX_SIZE space
  const SNOUT_X = BX + ((415.0 / BEAR_REF) - 0.5) * BEAR_W;
  const SNOUT_Y = BY_CENTER + ((369.8 / BEAR_REF) - 0.5) * BEAR_W;
  const YAWN_MOUTH_X = BX + ((391.6 / BEAR_REF) - 0.5) * BEAR_W;
  const YAWN_MOUTH_Y = BY_CENTER + ((249.8 / BEAR_REF) - 0.5) * BEAR_W;

  const mouse = { nx: 0.5, ny: 0.5, active: false, idleSec: 99 };

  // ==================== 2ND-ORDER PHYSICS STATE ====================
  const phys = {
    simT: 0,
    lastDt: 1 / 60,

    bearBody:    createBallisticBody(1040),
    bearSquash:  createSpring(0, 210, 14.5),
    bearTurnSx:  createSpring(1, 180, 16.0),
    bearLean:    createSpring(0, 140, 12.5),
    bearRecoilX: createSpring(0, 195, 13.5),
    bearEar:     createSpring(0, 260, 11.5),
    bearBelly:   createSpring(0, 145, 9.5),
    bearLookX:   createSpring(0.85, 105, 14.5),
    bearLookY:   createSpring(0.18, 105, 14.5),
    bearTrack:   createMicroMorphTrack(0.04),
    bearLaunched: false,
    bearLanded:   false,

    pengBody:    createBallisticBody(1240),
    pengEmerge:  createSpring(0, 115, 11.2),
    pengX:       createSpring(0, 125, 12.8),
    pengSquash:  createSpring(0, 225, 14.2),
    pengTilt:    createSpring(0, 150, 13.0),
    scarfLagX:   createSpring(0, 82, 8.2),
    scarfLagY:   createSpring(0, 82, 8.2),
    pengTrack:   createMicroMorphTrack(0.035),
    pengLaunched: false,
    pengSubmerged: false,
    lastGiggleTick: -1,
    lastChirpTick: -1,

    snowball: {
      active: false,
      held: false,
      x: 0, y: 0,
      vx: 0, vy: 0,
      g: 560,
      t: 0, dur: 0.64,
      groundY0: 0, groundY1: 0,
      rot: 0
    }
  };

  const sm = {
    phase: 'SLEEPING',
    t: 0,
    dur: 4.0,
    variant: 1,
    prankCount: 0,
    didPop: false,
    didDiveSplash: false,
    didDiveSplash2: false,
    didPeekSplash: false,
    didSneakSplash: false,
    didSnowLaunch: false,
    didSnowImpact: false,
    didFlopDust: false,
    didShakeImpulse: -1,
    rippleAge: 10.0,
    rippleStrength: 0.0,
    splashes: [],
    popDrops: [],
    airBubbles: [],
    breathPuffs: [],
    zzzParticles: [],
    zzzTimer: 0.35,
    bubbleTimer: 0.42,
    x: 640,
    y: 420,
    size: 360,
    initialized: false
  };

  function setMouse(nx, ny) {
    mouse.nx = clamp(nx, 0, 1);
    mouse.ny = clamp(ny, 0, 1);
    mouse.active = true;
    mouse.idleSec = 0;
  }

  function triggerSplash(strength = 1.0, count = 12, upward = 1.0) {
    sm.rippleAge = 0.0;
    sm.rippleStrength = Math.max(sm.rippleStrength * 0.45, strength);
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI * (0.12 + Math.random() * 0.76);
      const spd = (56 + Math.random() * 124) * upward;
      sm.splashes.push({
        x: HX + (Math.random() - 0.5) * HRX * 0.85,
        y: HY + (Math.random() - 0.5) * HRY * 0.40,
        vx: Math.cos(ang) * spd * 0.94,
        vy: Math.sin(ang) * spd - 36,
        r: 2.2 + Math.random() * 3.5,
        age: 0,
        life: 0.50 + Math.random() * 0.36,
        col: Math.random() < 0.56 ? '#f6fefe' : '#7fdbe0',
        bounced: false
      });
    }
  }

  function triggerPopPuff(x, y, isSnow = false, spread = 1.0) {
    const n = isSnow ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.48;
      const spd = (32 + Math.random() * 76) * spread;
      sm.popDrops.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * (isSnow ? 0.65 : 1.0) - (isSnow ? 38 : 16),
        r: isSnow ? (2.5 + Math.random() * 3.6) : (2.1 + Math.random() * 2.6),
        age: 0,
        life: 0.40 + Math.random() * 0.28,
        col: isSnow ? (Math.random() < 0.7 ? '#fdfaf2' : '#dfe9f4') : '#bfe8f7',
        isSnow
      });
    }
  }

  function triggerSnowThudRing(cx, cy, intensity = 1.0) {
    const n = Math.round(12 * intensity);
    for (let i = 0; i < n; i++) {
      const dir = (i % 2 === 0 ? 1 : -1) * (0.4 + Math.random() * 0.8);
      sm.popDrops.push({
        x: cx + (Math.random() - 0.5) * 96,
        y: cy + (Math.random() - 0.5) * 14,
        vx: dir * (45 + Math.random() * 62) * intensity,
        vy: -(18 + Math.random() * 36) * intensity,
        r: 2.8 + Math.random() * 3.6,
        age: 0,
        life: 0.42 + Math.random() * 0.26,
        col: Math.random() < 0.65 ? '#fdfaf2' : '#d8e6f2',
        isSnow: true
      });
    }
  }

  function launchSnowball(sx0, sy0, targetX, targetY, flightDur = 0.64) {
    const sb = phys.snowball;
    sb.active = true;
    sb.held = false;
    sb.t = 0;
    sb.dur = flightDur;
    sb.x = sx0;
    sb.y = sy0;
    sb.groundY0 = HY + 10;
    sb.groundY1 = SNOUT_Y + 34;
    sb.vx = (targetX - sx0) / flightDur;
    sb.vy = (targetY - sy0 - 0.5 * sb.g * flightDur * flightDur) / flightDur;
    sb.rot = 0;
  }

  function enterPhase(nextPhase, mischief = 1.0) {
    sm.phase = nextPhase;
    sm.t = 0;
    sm.didPop = false;
    sm.didDiveSplash = false;
    sm.didDiveSplash2 = false;
    sm.didPeekSplash = false;
    sm.didSneakSplash = false;
    sm.didSnowLaunch = false;
    sm.didSnowImpact = false;
    sm.didFlopDust = false;
    sm.didShakeImpulse = -1;

    phys.bearLaunched = false;
    phys.bearLanded = false;
    phys.pengLaunched = false;
    phys.pengSubmerged = false;
    phys.lastGiggleTick = -1;
    phys.lastChirpTick = -1;
    phys.snowball.active = false;
    phys.snowball.held = false;

    const pace = clamp(mischief, 0.35, 2.2);
    switch (nextPhase) {
      case 'SLEEPING': {
        const baseSleep = 6.8 + Math.random() * 4.2;
        sm.dur = clamp(baseSleep / pace, 3.2, 16.0);
        phys.bearBody.reset(0, 0);
        phys.pengBody.reset(0, 0);
        phys.pengEmerge.snap(0);
        phys.pengX.snap(0);
        break;
      }
      case 'PEEKING': {
        sm.variant = (sm.prankCount + (Math.random() < 0.25 ? 1 : 0)) % 3;
        sm.prankCount++;
        sm.dur = sm.variant === 1 ? 3.05 : (sm.variant === 2 ? 2.95 : 2.85);
        phys.pengBody.reset(0, 0);
        phys.pengEmerge.snap(0.06);
        phys.pengEmerge.impulse(4.2);
        phys.pengX.snap(0);
        break;
      }
      case 'COZY_STIR':
        // Bear stays curled up peacefully sleeping (ear twitch + sleepy sigh + cozy snuggle smile!)
        // while the playful penguin splashes back down into the aquamarine ice hole.
        sm.dur = 3.40;
        phys.bearBody.reset(0, 0);
        phys.bearSquash.impulse(-0.28);
        phys.bearEar.impulse(7.2);
        phys.bearBelly.impulse(14.0);
        phys.pengBody.reset(phys.pengX.x, 62 - phys.pengEmerge.x * 48);
        phys.pengSquash.impulse(-0.85);
        break;
    }
  }

  function step(dt, { mischief = 1.0, showFriends = 1 } = {}) {
    if (showFriends < 0.5) return;

    const d = Math.min(0.05, Math.max(0, dt));
    phys.lastDt = d;
    phys.simT += d;
    sm.t += d;
    sm.rippleAge += d;
    mouse.idleSec += d;
    if (sm.rippleAge > 2.6) sm.rippleStrength = 0;

    let bearSquashTarget = 0;
    let bearTurnSxTarget = 1.0;
    let bearLeanTarget = 0;
    let bearLookTargetX = 0.85;
    let bearLookTargetY = 0.18;

    let pengEmergeTarget = 0;
    let pengXTarget = 0;
    let pengTiltTarget = 0;
    let pengSquashTarget = 0;

    const prevPengX = phys.pengX.x;
    const prevPengEmerge = phys.pengEmerge.x;

    if (sm.phase === 'SLEEPING') {
      sm.zzzTimer -= d;
      if (sm.zzzTimer <= 0) {
        sm.zzzTimer = 1.18 + Math.random() * 0.45;
        sm.zzzParticles.push({
          x: SNOUT_X + 8 + (Math.random() - 0.5) * 10,
          y: SNOUT_Y - 34,
          age: 0,
          life: 2.35,
          size: 14 + Math.random() * 5,
          drift: (Math.random() - 0.5) * 14
        });
      }
      if (sm.t >= sm.dur) enterPhase('PEEKING', mischief);

    } else if (sm.phase === 'PEEKING') {
      const u = clamp(sm.t / sm.dur, 0, 1);
      if (!sm.didPeekSplash && sm.t >= 0.10) {
        sm.didPeekSplash = true;
        triggerSplash(0.65, 9, 0.76);
      }

      const waterBob = Math.sin(phys.simT * 3.8) * 0.032;

      if (u < 0.09) {
        pengEmergeTarget = 0.56;
      } else if (u < 0.18) {
        pengEmergeTarget = 0.92 + waterBob;
        pengXTarget = -4;
      } else if (sm.variant === 0) {
        pengEmergeTarget = 0.98 + waterBob;
        pengXTarget = u > 0.70 ? -6 : -12;
        if (u > 0.70) {
          if (u < 0.90) {
            const gTick = Math.floor(sm.t * 4.2);
            if (gTick !== phys.lastGiggleTick) {
              phys.lastGiggleTick = gTick;
              phys.pengSquash.impulse(gTick % 2 === 1 ? 0.85 : -0.55);
            }
          }
        } else {
          const cTick = Math.floor(sm.t * 2.8);
          if (cTick !== phys.lastChirpTick) {
            phys.lastChirpTick = cTick;
            if (cTick % 2 === 1) {
              phys.pengSquash.impulse(0.38);
              phys.bearEar.impulse(6.5);
            }
          }
          if (u >= 0.66 && !sm.didSnowImpact) {
            sm.didSnowImpact = true;
            phys.bearEar.impulse(12.5);
            phys.bearRecoilX.impulse(-38);
          }
          pengTiltTarget = Math.sin(phys.simT * 5.2) * 0.055;
        }
      } else if (sm.variant === 1) {
        pengEmergeTarget = 0.98 + waterBob;
        if (u < 0.34) {
          pengXTarget = 8;
          pengTiltTarget = 0.13;
          pengSquashTarget = -0.05;
          phys.snowball.held = true;
          phys.snowball.x = HX + phys.pengX.x - 20;
          phys.snowball.y = HY + 62 - phys.pengEmerge.x * 48 - 10;
        } else if (u < 0.42) {
          pengXTarget = 4;
          pengTiltTarget = 0.05;
          phys.snowball.held = true;
          phys.snowball.x = HX + phys.pengX.x - 24;
          phys.snowball.y = HY + 62 - phys.pengEmerge.x * 48 - 12;
        } else if (u < 0.70) {
          if (!sm.didSnowLaunch) {
            sm.didSnowLaunch = true;
            const launchX = HX + phys.pengX.x - 26;
            const launchY = HY + 62 - phys.pengEmerge.x * 48 - 14;
            launchSnowball(launchX, launchY, SNOUT_X, SNOUT_Y, sm.dur * 0.26);
            phys.pengX.impulse(-95);
            phys.pengTilt.impulse(-1.9);
            phys.pengSquash.impulse(0.82);
          }
          pengXTarget = u > 0.52 ? -12 : -9;
          pengTiltTarget = -0.11;
        } else {
          pengXTarget = -5;
          pengTiltTarget = 0;
          if (u < 0.90) {
            const gTick = Math.floor(sm.t * 4.2);
            if (gTick !== phys.lastGiggleTick) {
              phys.lastGiggleTick = gTick;
              phys.pengSquash.impulse(gTick % 2 === 1 ? 0.85 : -0.55);
            }
          }
        }
      } else {
        pengEmergeTarget = 1.04 + waterBob;
        if (u < 0.70) {
          const poke = sstep(0.18, 0.64, u);
          pengXTarget = lerp(-4, -58, poke);
          pengTiltTarget = -0.22 * poke;
          if (u >= 0.66 && !sm.didSnowImpact) {
            sm.didSnowImpact = true;
            triggerPopPuff(SNOUT_X + 10, SNOUT_Y + 2, false, 1.15);
            phys.bearRecoilX.impulse(-62);
            phys.bearEar.impulse(10.5);
            phys.pengX.impulse(115);
          }
        } else {
          pengXTarget = -14;
          pengTiltTarget = 0.02;
          if (u < 0.90) {
            const gTick = Math.floor(sm.t * 4.2);
            if (gTick !== phys.lastGiggleTick) {
              phys.lastGiggleTick = gTick;
              phys.pengSquash.impulse(gTick % 2 === 1 ? 0.85 : -0.55);
            }
          }
        }
      }

      const sb = phys.snowball;
      if (sb.active) {
        sb.t += d;
        sb.vy += sb.g * d;
        sb.x += sb.vx * d;
        sb.y += sb.vy * d;
        sb.rot += 7.0 * d;
        if (sb.t >= sb.dur && !sm.didSnowImpact) {
          sb.active = false;
          sm.didSnowImpact = true;
          triggerPopPuff(SNOUT_X, SNOUT_Y, true, 1.15);
          phys.bearRecoilX.impulse(-92);
          phys.bearSquash.impulse(-0.65);
          phys.bearLean.impulse(-1.25);
          phys.bearEar.impulse(11.0);
          phys.bearBelly.impulse(-40);
        }
      }

      if (sm.t >= sm.dur) enterPhase('COZY_STIR', mischief);

    } else if (sm.phase === 'COZY_STIR') {
      const u = clamp(sm.t / sm.dur, 0, 1);
      if (!sm.didPop && sm.t >= 0.02) {
        sm.didPop = true;
        if (!sm.didSnowImpact) triggerPopPuff(SNOUT_X + 10, SNOUT_Y + 2, false);
      }

      // Soft sleepy sigh puff as the curled-up bear settles deeper into its nap
      if (u > 0.22 && u < 0.42 && Math.random() < d * 6.5) {
        sm.breathPuffs.push({
          x: SNOUT_X + 6 + (Math.random() - 0.5) * 6,
          y: SNOUT_Y - 4 + (Math.random() - 0.5) * 5,
          vx: 10 + Math.random() * 10,
          vy: -14 - Math.random() * 10,
          r: 4.5 + Math.random() * 3.5,
          age: 0,
          life: 1.05 + Math.random() * 0.30
        });
      }

      // Gentle cozy curl squash while snuggling (never jumps or sits upright!)
      bearSquashTarget = -Math.sin(clamp((u - 0.18) / 0.56, 0, 1) * Math.PI) * 0.024;
      bearLeanTarget = Math.sin(u * Math.PI) * 0.012;

      // Playful penguin splashes happily back into the aquamarine ice hole
      if (sm.t < 0.10) {
        pengEmergeTarget = 1.00;
        pengSquashTarget = -0.10;
        pengXTarget = sm.variant === 2 ? -14 : -4;
      } else if (!phys.pengLaunched) {
        phys.pengLaunched = true;
        const startX = phys.pengX.x;
        const startY = 62 - phys.pengEmerge.x * 48;
        const vxToHole = -startX * 1.95;
        phys.pengBody.launch(startX, startY, vxToHole, -295, 0, 0);
        phys.pengSquash.impulse(0.82);
      }

      if (phys.pengLaunched) {
        const inWater = phys.pengBody.y >= 22;
        phys.pengBody.g = inWater ? 260 : 1240;
        const pEv = phys.pengBody.step(d, { waterY: 22, dragX: inWater ? 3.5 : 0.9 });
        if (inWater) {
          phys.pengBody.vy *= Math.exp(-5.4 * d);
        }
        if (pEv.crossedWaterDown && !sm.didDiveSplash) {
          sm.didDiveSplash = true;
          phys.pengSubmerged = true;
          const str = clamp(pEv.impactVy / 310, 0.72, 1.25);
          triggerSplash(str, 16, 1.16);
        }
        if (phys.pengBody.y > 54 && !sm.didDiveSplash2) {
          sm.didDiveSplash2 = true;
          triggerSplash(0.76, 11, 0.88);
        }
      }

      // Gentle underwater air bubbles after penguin dives back in
      if (phys.pengSubmerged && u > 0.38 && u < 0.88) {
        sm.bubbleTimer -= d;
        if (sm.bubbleTimer <= 0) {
          sm.bubbleTimer = 0.44 + Math.random() * 0.28;
          sm.airBubbles.push({
            x: HX + (Math.random() - 0.5) * HRX * 0.62,
            y: HY + (Math.random() - 0.5) * HRY * 0.40,
            r: 2.6 + Math.random() * 3.0,
            age: 0,
            life: 0.90 + Math.random() * 0.36
          });
        }
      }

      if (sm.t >= sm.dur) enterPhase('SLEEPING', mischief);
    }

    phys.bearSquash.step(d, bearSquashTarget);
    phys.bearTurnSx.step(d, bearTurnSxTarget);
    phys.bearLean.step(d, bearLeanTarget);
    phys.bearRecoilX.step(d, 0);
    phys.bearEar.step(d, 0);
    phys.bearBelly.step(d, 0);
    phys.bearLookX.step(d, bearLookTargetX);
    phys.bearLookY.step(d, bearLookTargetY);

    phys.pengEmerge.step(d, pengEmergeTarget);
    phys.pengX.step(d, pengXTarget);
    phys.pengSquash.step(d, pengSquashTarget);
    const velTilt = clamp(phys.pengX.v * 0.0012, -0.12, 0.12);
    phys.pengTilt.step(d, pengTiltTarget + velTilt);

    let pVx = 0, pVy = 0;
    if (sm.phase === 'COZY_STIR' && phys.pengLaunched) {
      pVx = phys.pengBody.vx;
      pVy = phys.pengBody.vy;
    } else {
      pVx = (phys.pengX.x - prevPengX) / Math.max(0.004, d);
      pVy = -((phys.pengEmerge.x - prevPengEmerge) * 48) / Math.max(0.004, d);
    }
    phys.scarfLagX.step(d, clamp(-pVx * 0.085, -18, 18));
    phys.scarfLagY.step(d, clamp(-pVy * 0.070, -22, 22));

    for (let i = sm.splashes.length - 1; i >= 0; i--) {
      const p = sm.splashes[i];
      p.age += d;
      p.vx *= Math.exp(-0.8 * d);
      p.vy += 340 * d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      if (!p.bounced && p.y > HY + HRY * 0.45 && p.vy > 0) {
        p.bounced = true;
        p.vy = -p.vy * 0.28;
        p.vx *= 0.65;
      }
      if (p.age >= p.life) sm.splashes.splice(i, 1);
    }
    for (let i = sm.popDrops.length - 1; i >= 0; i--) {
      const p = sm.popDrops[i];
      p.age += d;
      const drag = p.isSnow ? 3.2 : 1.8;
      p.vx *= Math.exp(-drag * d);
      p.vy = p.vy * Math.exp(-drag * 0.6 * d) + (p.isSnow ? 165 : 95) * d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      if (p.age >= p.life) sm.popDrops.splice(i, 1);
    }
    for (let i = sm.airBubbles.length - 1; i >= 0; i--) {
      const b = sm.airBubbles[i];
      b.age += d;
      b.y -= 12 * d;
      b.x += Math.sin(b.age * 7.5 + b.r) * 7 * d;
      if (b.age >= b.life) sm.airBubbles.splice(i, 1);
    }
    for (let i = sm.breathPuffs.length - 1; i >= 0; i--) {
      const b = sm.breathPuffs[i];
      b.age += d;
      b.vx *= Math.exp(-1.1 * d);
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.r += 9.5 * d;
      if (b.age >= b.life) sm.breathPuffs.splice(i, 1);
    }
    for (let i = sm.zzzParticles.length - 1; i >= 0; i--) {
      const z = sm.zzzParticles[i];
      z.age += d;
      z.y -= 26 * d;
      z.x += (11 + Math.sin(z.age * 3.2) * 13 + z.drift * 0.2) * d;
      if (z.age >= z.life) sm.zzzParticles.splice(i, 1);
    }
  }

  // ==================== 60 FPS GPU MESH DEFORMERS ====================

  function makeBearSleepDeform(breathSigned, earImpulse, bellyJiggle, recoilX) {
    return (u, v, out) => {
      const anchor = clamp((446 - v) / 150, 0, 1);
      const wBreath = radialWeight(u, v, 212, 252, 200, 155) * anchor;
      out[0] -= breathSigned * 3.2 * wBreath;
      out[1] -= (breathSigned * 8.2 - bellyJiggle * 0.25) * wBreath;
      const wHead = radialWeight(u, v, 392, 335, 118, 102) * anchor;
      out[0] += recoilX * 0.45 * wHead;
      out[1] -= breathSigned * 2.2 * wHead;
      if (Math.abs(earImpulse) > 0.02) {
        const e = clamp(earImpulse * 0.036, -0.34, 0.34);
        applyWeightedRotation(out, 326, 265,  e, radialWeight(u, v, 324, 248, 42, 40));
        applyWeightedRotation(out, 456, 280, -e * 0.9, radialWeight(u, v, 460, 266, 38, 38));
      }
    };
  }

  function makeBearJoltDeform(springAmt, lookX, lookY, earImpulse) {
    return (u, v, out) => {
      const anchor = clamp((460 - v) / 150, 0, 1);
      const wUpper = radialWeight(u, v, 330, 195, 175, 160) * anchor;
      out[1] -= springAmt * 14.0 * wUpper;
      out[0] += lookX * 7.5 * wUpper;
      out[1] += lookY * 5.0 * wUpper;
      const e = clamp(-springAmt * 0.24 + earImpulse * 0.03, -0.40, 0.40);
      applyWeightedRotation(out, 276, 136,  e, radialWeight(u, v, 266, 118, 44, 42));
      applyWeightedRotation(out, 392, 108, -e * 0.9, radialWeight(u, v, 398, 92, 42, 42));
    };
  }

  function makeBearAwakeDeform(breathSigned, lookX, lookY, scratchWave, earImpulse, bellyJiggle) {
    return (u, v, out) => {
      const anchor = clamp((455 - v) / 170, 0, 1);
      const wChest = radialWeight(u, v, 275, 320, 145, 110) * anchor;
      out[0] += (u - 275) * (breathSigned * 0.022 + bellyJiggle * 0.0012) * wChest;
      out[1] -= (breathSigned * 5.5 - bellyJiggle * 0.28) * wChest;
      const wHead = radialWeight(u, v, 290, 168, 138, 125) * anchor;
      out[0] += lookX * 11.5 * wHead;
      out[1] += lookY * 7.5 * wHead;
      const e = clamp(earImpulse * 0.032, -0.36, 0.36);
      applyWeightedRotation(out, 206, 148, -e + lookX * 0.07, radialWeight(u, v, 192, 132, 44, 42));
      applyWeightedRotation(out, 334, 72,   e + lookX * 0.07, radialWeight(u, v, 342, 56, 44, 42));
      if (Math.abs(scratchWave) > 0.005) {
        const wPaw = radialWeight(u, v, 192, 232, 82, 96);
        applyWeightedRotation(out, 132, 342, scratchWave * 0.24, wPaw);
        out[1] += scratchWave * 10.5 * wPaw;
      }
    };
  }

  function makeBearLookLeftDeform(breathSigned, lookX, lookY, scratchWave, earImpulse, bellyJiggle) {
    return (u, v, out) => {
      const anchor = clamp((455 - v) / 170, 0, 1);
      const wChest = radialWeight(u, v, 236, 320, 145, 110) * anchor;
      out[0] += (u - 236) * (breathSigned * 0.022 + bellyJiggle * 0.0012) * wChest;
      out[1] -= (breathSigned * 5.5 - bellyJiggle * 0.28) * wChest;
      const wHead = radialWeight(u, v, 218, 168, 138, 125) * anchor;
      out[0] += lookX * 11.5 * wHead;
      out[1] += lookY * 7.5 * wHead;
      const e = clamp(earImpulse * 0.032, -0.36, 0.36);
      applyWeightedRotation(out, 178, 72,  -e - lookX * 0.07, radialWeight(u, v, 170, 56, 44, 42));
      applyWeightedRotation(out, 306, 148,  e - lookX * 0.07, radialWeight(u, v, 320, 132, 44, 42));
      if (Math.abs(scratchWave) > 0.005) {
        const wPaw = radialWeight(u, v, 320, 232, 82, 96);
        applyWeightedRotation(out, 380, 342, -scratchWave * 0.24, wPaw);
        out[1] += scratchWave * 10.5 * wPaw;
      }
    };
  }

  function makeBearShakeDeform(shakeWave, breathSigned) {
    return (u, v, out) => {
      const anchor = clamp((455 - v) / 170, 0, 1);
      const wHead = radialWeight(u, v, 265, 162, 152, 132) * anchor;
      out[0] += shakeWave * 22.0 * wHead;
      applyWeightedRotation(out, 260, 278, shakeWave * 0.14, wHead);
      out[1] -= breathSigned * 4.5 * anchor;
    };
  }

  function makeBearSoftBodyDeform(breathSigned, bellyJiggle, earImpulse, stretchAmt = 0) {
    return (u, v, out) => {
      const anchor = clamp((455 - v) / 160, 0, 1);
      const wBack = radialWeight(u, v, 250, 230, 195, 155) * anchor;
      out[1] -= (breathSigned * 7.2 + stretchAmt * 11.0 - bellyJiggle * 0.32) * wBack;
      if (Math.abs(earImpulse) > 0.05) {
        const e = clamp(earImpulse * 0.025, -0.32, 0.32);
        const wTop = radialWeight(u, v, 270, 110, 145, 75);
        out[0] += e * 12.0 * wTop;
      }
    };
  }

  function makeBearYawnDeform(breathSigned, yawnPeak) {
    return (u, v, out) => {
      const anchor = clamp((458 - v) / 150, 0, 1);
      const wBack = radialWeight(u, v, 215, 225, 180, 150) * anchor;
      out[1] -= (breathSigned * 6.5 + yawnPeak * 12.0) * wBack;
      const wHead = radialWeight(u, v, 372, 225, 118, 108) * anchor;
      applyWeightedRotation(out, 322, 295, -yawnPeak * 0.12, wHead);
      out[1] += yawnPeak * 9.0 * radialWeight(u, v, 388, 275, 52, 48);
    };
  }

  function makeBearStretchDeform(stretchPeak) {
    return (u, v, out) => {
      const anchor = clamp((460 - v) / 155, 0, 1);
      const wBack = radialWeight(u, v, 195, 200, 170, 140) * anchor;
      out[1] -= stretchPeak * 13.5 * wBack;
      out[0] -= stretchPeak * 6.5 * wBack;
      const wPaws = radialWeight(u, v, 408, 418, 115, 85);
      out[0] += stretchPeak * 13.0 * wPaws;
    };
  }

  function makePengScarfRightDeform(simT, windAmp, lagX, lagY, armReach = 0) {
    return (u, v, out) => {
      if (u > 224 && v < 236) {
        const tailT = clamp((u - 224) / 145, 0, 1);
        const w = Math.pow(tailT, 1.25) * (1 - sstep(192, 236, v));
        out[1] += (Math.sin(simT * 7.8 - u * 0.044) * 12.5 * windAmp + lagY * 1.15) * w;
        out[0] += (Math.cos(simT * 7.8 - u * 0.044) * 3.6 * windAmp + lagX * 0.95) * w;
      }
      if (armReach > 0.01 && u < 145 && v > 140 && v < 290) {
        const wArm = clamp((145 - u) / 68, 0, 1) * sstep(140, 175, v) * (1 - sstep(255, 290, v));
        out[0] -= armReach * 16.0 * wArm;
        out[1] -= armReach * 5.0 * wArm;
      }
    };
  }

  function makePengWaveDeform(simT, windAmp, lagX, lagY, waveAng) {
    return (u, v, out) => {
      if (u > 256 && v > 110 && v < 258) {
        const tailT = clamp((u - 256) / 106, 0, 1);
        const w = Math.pow(tailT, 1.25) * sstep(110, 140, v) * (1 - sstep(225, 258, v));
        out[1] += (Math.sin(simT * 8.2 - u * 0.05) * 12.0 * windAmp + lagY * 1.1) * w;
        out[0] += lagX * 0.8 * w;
      }
      if (u < 126 && v < 228) {
        const wFlip = clamp((126 - u) / 48, 0, 1) * (1 - sstep(192, 228, v));
        applyWeightedRotation(out, 108, 172, -waveAng, wFlip);
      }
    };
  }

  function makePengGiggleDeform(simT, windAmp, lagY) {
    return (u, v, out) => {
      const gig = Math.sin(simT * 14.0);
      const wBody = radialWeight(u, v, 192, 210, 128, 128);
      out[1] += gig * 4.8 * wBody;
      if (u > 250 && v < 215) {
        const tailT = clamp((u - 250) / 122, 0, 1);
        const w = Math.pow(tailT, 1.25) * (1 - sstep(176, 215, v));
        out[1] += (Math.sin(simT * 10.5 - u * 0.05) * 12.5 * windAmp + lagY * 0.9) * w;
      }
    };
  }

  function makePengOhNoFlapDeform(simT, flapPhase, lagX, lagY) {
    return (u, v, out) => {
      if (u > 236 && v < 200) {
        const tailT = clamp((u - 236) / 132, 0, 1);
        const w = Math.pow(tailT, 1.2) * (1 - sstep(160, 200, v));
        out[1] += (Math.sin(simT * 18.0 - u * 0.06) * 13.0 + lagY * 1.35) * w;
        out[0] += lagX * 0.95 * w;
      }
      if (u < 118 && v < 245) {
        const wL = clamp((118 - u) / 48, 0, 1) * (1 - sstep(210, 245, v));
        applyWeightedRotation(out, 114, 198, Math.sin(flapPhase) * 0.44, wL);
      }
      if (u > 252 && v > 125 && v < 268) {
        const wR = clamp((u - 252) / 48, 0, 1) * sstep(125, 155, v) * (1 - sstep(235, 268, v));
        applyWeightedRotation(out, 256, 204, -Math.sin(flapPhase + 0.5) * 0.42, wR);
      }
    };
  }

  function makePengDiveDeform(simT, kickPhase, lagY) {
    return (u, v, out) => {
      if (v < 160) {
        const wTop = 1 - sstep(115, 160, v);
        out[1] += clamp(lagY * 0.55, -16, 12) * wTop;
      }
      if (u > 105 && u < 195 && v < 110) {
        const wFootL = (1 - sstep(78, 110, v)) * sstep(105, 128, u) * (1 - sstep(178, 195, u));
        applyWeightedRotation(out, 158, 86, Math.sin(kickPhase) * 0.42, wFootL);
        out[1] += Math.cos(kickPhase) * 6.0 * wFootL;
      }
      if (u > 240 && v < 142) {
        const wFootR = clamp((u - 240) / 42, 0, 1) * (1 - sstep(108, 142, v));
        applyWeightedRotation(out, 272, 118, -Math.sin(kickPhase + 0.9) * 0.44, wFootR);
        out[1] -= Math.cos(kickPhase + 0.9) * 6.0 * wFootR;
      }
    };
  }

  // Exact pivot-synced live watercolor eyes (matches arctic-rig.js pivotX/pivotY identically!)
  function drawRiggedEyes(pivXWorld, pivYWorld, dw, srcSize, rot, sx, sy, pivotY, eyeSpecs, lookX, lookY, blink, deformFn, alpha = 1) {
    if (alpha <= 0.04) return;
    const scale = dw / srcSize;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pivXWorld, pivYWorld);
    if (rot) ctx.rotate(rot);
    ctx.scale(sx * scale, sy * scale);
    ctx.translate(-0.5 * srcSize, -pivotY * srcSize);

    for (const e of eyeSpecs) {
      const pt = [e.x, e.y];
      if (deformFn) deformFn(e.x, e.y, pt);
      drawLiveWatercolorEye(ctx, {
        x: pt[0], y: pt[1], rx: e.rx, ry: e.ry,
        lookX, lookY, pupilR: e.pupilR, blink,
        lidColor: e.lidColor || '#f8f2e2',
        inkColor: e.inkColor || '#4c382c',
        pupilColor: e.pupilColor || '#2d1c14',
        jitterX: e.jitterX || 0,
        jitterY: e.jitterY || 0
      });
    }
    ctx.restore();
  }

  const JOLT_EYES = [
    { x: 337.2, y: 193.9, rx: 12.6, ry: 13.8, pupilR: 4.4 },
    { x: 399.9, y: 176.1, rx: 11.2, ry: 12.6, pupilR: 4.1 }
  ];
  const AWAKE_EYES = [
    { x: 296.1, y: 194.8, rx: 12.4, ry: 13.4, pupilR: 5.6 },
    { x: 359.2, y: 161.3, rx: 11.2, ry: 12.8, pupilR: 5.2 }
  ];
  const LOOK_LEFT_EYES = [
    { x: 148.4, y: 157.4, rx: 11.2, ry: 12.8, pupilR: 5.2 },
    { x: 209.3, y: 185.4, rx: 12.4, ry: 13.4, pupilR: 5.6 }
  ];

  function getBearDeformForKey(key, breathSigned, scratchWave, shakeWave, yawnPeak, stretchPeak) {
    const ear = phys.bearEar.x;
    const belly = phys.bearBelly.x;
    const recoil = phys.bearRecoilX.x;
    const lx = phys.bearLookX.x;
    const ly = phys.bearLookY.x;

    if (
      key === 'bearSleep' || key === 'bearSleepDeep' ||
      key === 'bearSleepMid' || key === 'bearSleepInhale' ||
      key === 'bearPeekSquint' || key === 'bearPeekEye' ||
      key === 'bearSnuggle' || key === 'bearDrowsySmile' ||
      key === 'bearRestHead' || key === 'bearSettleLoop' ||
      key === 'bearCurlSide' || key === 'bearCurlInToSide' || key === 'bearDrowsy'
    ) {
      return makeBearSleepDeform(breathSigned, ear, belly, recoil);
    }
    if (
      key === 'bearJolt' || key === 'bearJoltPush' ||
      key === 'bearLiftToSpring' || key === 'bearStartleSpring' ||
      key === 'bearPushRise' || key === 'bearRiseToJoltPush' ||
      key === 'bearJoltRecoil' || key === 'bearRecoilToHaunch'
    ) {
      const springAmt = clamp(-phys.bearBody.vy / 280, -0.2, 1.0);
      return makeBearJoltDeform(springAmt, lx, ly, ear);
    }
    if (key === 'bearAwake' || key === 'bearScratchUp' || key === 'bearScratchMid' || key === 'bearScratchLow') {
      return makeBearAwakeDeform(breathSigned, lx, ly, scratchWave, ear, belly);
    }
    if (key === 'bearLookLeft' || key === 'bearLookLeftScratchUp' || key === 'bearLookLeftSusp') {
      return makeBearLookLeftDeform(breathSigned, lx, ly, scratchWave, ear, belly);
    }
    if (
      key === 'bearShakePrep' || key === 'bearPrepToShakeL' ||
      key === 'bearShakeLeft' || key === 'bearShakeWhipL' ||
      key === 'bearShake' || key === 'bearShakeFur' ||
      key === 'bearShakeWhipR' || key === 'bearShakeRight'
    ) {
      return makeBearShakeDeform(shakeWave, breathSigned);
    }
    if (key === 'bearYawn' || key === 'bearYawnPeakHold' || key === 'bearYawnMid' || key === 'bearYawnOpen1') {
      return makeBearYawnDeform(breathSigned, yawnPeak);
    }
    if (
      key === 'bearStretchReach' || key === 'bearStretchStart' ||
      key === 'bearStretch' || key === 'bearStretchDeep' ||
      key === 'bearStretchRecoil' || key === 'bearStretchToCurl'
    ) {
      return makeBearStretchDeform(stretchPeak);
    }
    return makeBearSoftBodyDeform(breathSigned, belly, ear, 0);
  }

  // Peaceful curled-up snuggle reaction — 100% silhouette-locked & baked optical-flow pairs!
  const BEAR_COZY_STIR_STOPS = [
    [0.00, 'bearSleepMid'],
    [0.14, 'bearPeekSquint'],
    [0.30, 'bearSleepMid'],
    [0.42, 'bearSettleLoop'],
    [0.54, 'bearSnuggle'],
    [0.67, 'bearDrowsySmile'],
    [0.80, 'bearSnuggle'],
    [0.91, 'bearSettleLoop'],
    [1.00, 'bearSleepMid']
  ];

  function resolveBearFrame(simT) {
    const breathObj = sampleMammalianBreath(simT, 4.35);
    const breathLag = sampleMammalianBreath(simT - 0.24, 4.35);
    const breathSigned = breathObj.signed;

    let keyA = 'bearSleepMid';
    let keyB = 'bearSleepMid';
    let morphT = 0;
    let bubbleScale = 0;

    if (sm.phase === 'SLEEPING') {
      // Silky 60 FPS silhouette-locked breathing wave: bearSettleLoop <-> bearSleepMid <-> bearSleepInhale
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

    } else if (sm.phase === 'PEEKING') {
      const u = clamp(sm.t / sm.dur, 0, 1);
      const lvl = clamp(breathObj.level, 0, 1);
      if (lvl < 0.5) {
        keyA = 'bearSettleLoop'; keyB = 'bearSleepMid'; morphT = lvl * 2.0;
      } else {
        keyA = 'bearSleepMid'; keyB = 'bearSleepInhale'; morphT = (lvl - 0.5) * 2.0;
      }
      bubbleScale = sm.didSnowImpact ? 0 : (0.62 + 0.36 * breathLag.level) * (1 - sstep(0.92, 1.0, u) * 0.25);

    } else if (sm.phase === 'COZY_STIR') {
      const u = clamp(sm.t / sm.dur, 0, 1);
      const c = sampleFlowChain(u, BEAR_COZY_STIR_STOPS);
      keyA = c.keyA; keyB = c.keyB; morphT = c.morphT;
      bubbleScale = sstep(0.84, 1.0, u) * (0.58 + 0.30 * breathLag.level);
    }

    const { sx: volSx, sy } = volumeScale(phys.bearSquash.x);
    const sx = volSx * phys.bearTurnSx.x;
    const airY = phys.bearBody.y;
    const drawX = BX + phys.bearRecoilX.x * 0.25;
    const drawPivY = BY_GROUND + airY;
    const rot = phys.bearLean.x;

    return {
      keyA, keyB, morphT,
      currKey: morphT < 0.5 ? keyA : keyB,
      drawX, drawPivY, drawCenterY: BY_CENTER + airY, airY, rot, sx, sy,
      breathSigned, scratchWave: 0, shakeWave: 0, yawnPeak: 0, stretchPeak: 0, blink: 0,
      bubbleScale, bangAlpha: 0, bangScale: 0, questAlpha: 0
    };
  }

  function isAerialPengKey(k) {
    return k === 'pengTumble' || k === 'pengTuckFlip' || k === 'pengDive' || k === 'pengFeetSplash';
  }

  function getPengDeformForKey(key, simT, windAmp, waveAng, armReach) {
    const lagX = phys.scarfLagX.x;
    const lagY = phys.scarfLagY.x;
    if (
      key === 'pengTipToePoke' || key === 'pengAimReady' || key === 'pengWindUp' ||
      key === 'pengThrow' || key === 'pengFollowThrough' ||
      key === 'pengPeek' || key === 'pengSneak'
    ) {
      return makePengScarfRightDeform(simT, windAmp, lagX, lagY, key === 'pengTipToePoke' ? armReach : 0);
    }
    if (key === 'pengWave' || key === 'pengChirpNoot') {
      return makePengWaveDeform(simT, windAmp, lagX, lagY, waveAng);
    }
    if (key === 'pengGiggle' || key === 'pengGiggleBounce') {
      return makePengGiggleDeform(simT, windAmp, lagY);
    }
    if (key === 'pengOhNo') {
      return makePengOhNoFlapDeform(simT, simT * 24.0, lagX, lagY);
    }
    if (key === 'pengDive' || key === 'pengFeetSplash') {
      return makePengDiveDeform(simT, simT * 24.0, lagY);
    }
    return null;
  }

  function resolvePenguinFrame(simT, flowSpeed) {
    const windAmp = clamp(0.65 + flowSpeed * 0.55, 0.45, 1.75);
    let visible = false;
    let keyA = 'pengPopStand';
    let keyB = 'pengPopStand';
    let morphT = 0;
    let waveAng = 0;
    let armReach = 0;
    let chirpAlpha = 0;

    let px = HX + phys.pengX.x;
    let py = HY + 62 - phys.pengEmerge.x * 48;
    let rot = phys.pengTilt.x;
    let squashAmt = phys.pengSquash.x;

    if (sm.phase === 'PEEKING') {
      visible = true;
      const u = clamp(sm.t / sm.dur, 0, 1);

      if (sm.variant === 0) {
        const c = sampleFlowChain(u, [
          [0.00, 'pengCrownPeek'],
          [0.08, 'pengPopStand'],
          [0.14, 'pengLookBear'],
          [0.20, 'pengPeek'],
          [0.25, 'pengWaveLow'],
          [0.30, 'pengWaveMid'],
          [0.36, 'pengWave'],
          [0.44, 'pengWaveJoy'],
          [0.52, 'pengChirpNoot'],
          [0.60, 'pengWave'],
          [0.68, 'pengWaveJoy'],
          [0.74, 'pengGiggle'],
          [0.81, 'pengGiggleBounce'],
          [0.88, 'pengGiggle'],
          [0.95, 'pengOhNo'],
          [1.00, 'pengOhNo']
        ]);
        keyA = c.keyA; keyB = c.keyB; morphT = c.morphT;
        waveAng = Math.sin(simT * 13.5) * 0.40;
        chirpAlpha = sstep(0.24, 0.34, u) * (1 - sstep(0.66, 0.72, u));
      } else if (sm.variant === 1) {
        const c = sampleFlowChain(u, [
          [0.00, 'pengCrownPeek'],
          [0.08, 'pengPopStand'],
          [0.14, 'pengLookBear'],
          [0.20, 'pengPeek'],
          [0.28, 'pengAimReady'],
          [0.38, 'pengWindUp'],
          [0.47, 'pengThrow'],
          [0.58, 'pengFollowThrough'],
          [0.70, 'pengGiggle'],
          [0.79, 'pengGiggleBounce'],
          [0.87, 'pengGiggle'],
          [0.94, 'pengOhNo'],
          [1.00, 'pengOhNo']
        ]);
        keyA = c.keyA; keyB = c.keyB; morphT = c.morphT;
      } else {
        const c = sampleFlowChain(u, [
          [0.00, 'pengCrownPeek'],
          [0.08, 'pengPopStand'],
          [0.14, 'pengLookBear'],
          [0.20, 'pengPeek'],
          [0.32, 'pengTipToePoke'],
          [0.66, 'pengTipToePoke'],
          [0.74, 'pengGiggle'],
          [0.82, 'pengGiggleBounce'],
          [0.92, 'pengOhNo'],
          [1.00, 'pengOhNo']
        ]);
        keyA = c.keyA; keyB = c.keyB; morphT = c.morphT;
        armReach = sstep(0.36, 0.64, u);
      }

    } else if (sm.phase === 'COZY_STIR') {
      const t = sm.t;
      if (t < 0.10) {
        visible = true;
        const c = sampleFlowChain(t / 0.10, [[0, 'pengOhNo'], [1, 'pengPanic']]);
        keyA = c.keyA; keyB = c.keyB; morphT = c.morphT;
      } else if (phys.pengLaunched) {
        px = HX + phys.pengBody.x;
        py = HY + phys.pengBody.y;
        const vy = phys.pengBody.vy;

        if (phys.pengBody.y < 90) {
          visible = true;
          if (!phys.pengSubmerged && vy < -85) {
            const pitchT = clamp((vy + 295) / 210, 0, 1);
            keyA = 'pengPanic'; keyB = 'pengTumble'; morphT = pitchT * 0.6;
            rot = lerp(-0.08, -0.52, pitchT);
            squashAmt = clamp(-vy / 2400, -0.04, 0.09);
          } else if (!phys.pengSubmerged && vy < 15) {
            const rollT = clamp((vy + 85) / 100, 0, 1);
            keyA = 'pengTumble'; keyB = 'pengTuckFlip'; morphT = rollT;
            rot = lerp(0.24, -0.20, rollT);
            squashAmt = -0.03;
          } else if (!phys.pengSubmerged && vy < 135) {
            const tuckT = clamp((vy - 15) / 120, 0, 1);
            keyA = 'pengTuckFlip'; keyB = 'pengDive'; morphT = tuckT;
            rot = lerp(0.24, -0.10, tuckT);
            squashAmt = 0.02;
          } else if (!phys.pengSubmerged) {
            keyA = 'pengDive'; keyB = 'pengKickA'; morphT = clamp((vy - 135) / 150, 0, 1);
            rot = lerp(-0.10, 0.0, morphT);
            squashAmt = clamp(vy / 2600, 0.02, 0.10);
          } else {
            const kickPhase = (sm.t * 4.5) % 2.0;
            if (kickPhase < 1.0) {
              keyA = 'pengKickA'; keyB = 'pengFeetSplash'; morphT = kickPhase;
            } else {
              keyA = 'pengFeetSplash'; keyB = 'pengKickB'; morphT = kickPhase - 1.0;
            }
            rot = Math.sin(simT * 20) * 0.05;
            squashAmt = clamp(vy / 2600, 0.02, 0.10);
          }
        } else {
          visible = false;
        }
      }
    }

    if (!visible) {
      return { visible: false };
    }

    const { sx, sy } = volumeScale(squashAmt);
    const inWaterSurface = (sm.phase === 'PEEKING') && phys.pengEmerge.x > 0.14;
    return {
      visible: true,
      keyA, keyB, morphT,
      currKey: morphT < 0.5 ? keyA : keyB,
      px, py, rot, sx, sy,
      windAmp, waveAng, armReach, chirpAlpha,
      inWaterSurface
    };
  }

  // ==================== GPU SHADOW + GPU COLOR + OVERLAY ====================

  function drawBearShadowGpu(bf) {
    if (!bearAtlas || !bf) return;
    const lift = clamp(-bf.airY / 48, 0, 1);
    const shScale = 1 - lift * 0.14;
    const shAlpha = clamp(0.86 * (1 - lift * 0.38) * (1 + clamp((1 - bf.sy) * 0.65, -0.1, 0.18)), 0, 0.92);
    const sx = bf.sx * 1.03 * shScale;
    const sy = 0.85 * shScale;
    const shX = bf.drawX + 12 + lift * 8;
    const shY = BY_GROUND + 14 + lift * 5;
    const shRot = bf.rot * 0.45;

    drawFlowActor(
      bearAtlas, bearFlowAtlas, BEAR_TILES, BEAR_FLOW_MAP, BEAR_ATLAS_META,
      bf.keyA, bf.keyB, bf.morphT, BEAR_REF,
      shX, shY, BEAR_W, BEAR_W, null,
      { rot: shRot, sx, sy, alpha: shAlpha, pivotY: BEAR_PIVOT_Y }
    );
  }

  function drawPengShadowGpu(pf) {
    if (!pengAtlas || !pf || !pf.visible) return;
    if (sm.phase === 'COZY_STIR' || phys.pengEmerge.x <= 0.42) return;
    const shAlpha = clamp((phys.pengEmerge.x - 0.42) * 0.72, 0, 0.54);
    drawFlowActor(
      pengAtlas, pengFlowAtlas, PENG_TILES, PENG_FLOW_MAP, PENG_ATLAS_META,
      pf.keyA, pf.keyB, pf.morphT, PENG_REF,
      pf.px + 10, HY + 6 + PENG_PIV_OFF, PENG_W, PENG_W, null,
      { rot: pf.rot * 0.45, sx: pf.sx * 1.02, sy: 0.84, alpha: shAlpha, pivotY: PENG_PIVOT_Y }
    );
  }

  function drawBearEyesIfRigged(key, bf, deformFn, alpha) {
    if (alpha <= 0.05) return;
    if (key === 'bearJolt') {
      drawRiggedEyes(bf.drawX, bf.drawPivY, BEAR_W, BEAR_REF, bf.rot, bf.sx, bf.sy, BEAR_PIVOT_Y, JOLT_EYES, 0.82, 0.16, 0, deformFn, alpha);
    } else if (key === 'bearAwake') {
      drawRiggedEyes(bf.drawX, bf.drawPivY, BEAR_W, BEAR_REF, bf.rot, bf.sx, bf.sy, BEAR_PIVOT_Y, AWAKE_EYES, phys.bearLookX.x, phys.bearLookY.x, bf.blink, deformFn, alpha);
    } else if (key === 'bearLookLeft') {
      drawRiggedEyes(bf.drawX, bf.drawPivY, BEAR_W, BEAR_REF, bf.rot, bf.sx, bf.sy, BEAR_PIVOT_Y, LOOK_LEFT_EYES, phys.bearLookX.x, phys.bearLookY.x, bf.blink, deformFn, alpha);
    }
  }

  function drawVectorOverlay(simT, showBubbles, bf, bearDefA, bearDefB, pf) {
    ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);

    if (bf) {
      if (bf.keyA === bf.keyB || bf.morphT <= 0.004) {
        drawBearEyesIfRigged(bf.keyA, bf, bearDefA, 1);
      } else {
        // Gently fade live tracking eyes in/out strictly near the pure live-eye keyframe endpoints
        const aA = 1 - sstep(0.0, 0.32, bf.morphT);
        const aB = sstep(0.68, 1.0, bf.morphT);
        if (aA > 0.04) drawBearEyesIfRigged(bf.keyA, bf, bearDefA, aA);
        if (aB > 0.04) drawBearEyesIfRigged(bf.keyB, bf, bearDefB, aB);
      }
    }

    for (const b of sm.airBubbles) {
      const u = b.age / b.life;
      ctx.save();
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.82;
      ctx.fillStyle = 'rgba(220, 248, 250, 0.45)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.7 + 0.4 * u), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (pf && pf.visible && pf.inWaterSurface) {
      const foamR = 30 + Math.sin(simT * 4.2) * 2.5;
      const foamY = Math.min(HY + HRY * 0.72, pf.py + 34);
      ctx.save();
      ctx.globalAlpha = clamp((phys.pengEmerge.x - 0.14) * 0.85, 0, 0.72);
      ctx.strokeStyle = 'rgba(244, 253, 255, 0.90)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(pf.px, foamY, foamR, foamR * 0.32, 0, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(130, 224, 232, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(pf.px, foamY + 2.5, foamR * 1.18, foamR * 0.38, 0, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    if (showBubbles >= 0.5 && pf && pf.visible && pf.chirpAlpha > 0.04) {
      ctx.save();
      ctx.globalAlpha = pf.chirpAlpha;
      ctx.strokeStyle = '#3b4f62';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      const cx0 = pf.px - 38;
      const cy0 = pf.py - 18;
      for (let r = 0; r < 2; r++) {
        const rad = 11 + r * 8 + Math.sin(simT * 16) * 1.4;
        ctx.beginPath();
        ctx.arc(cx0, cy0, rad, Math.PI * 0.76, Math.PI * 1.24);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (bf && bf.bubbleScale > 0.04) {
      const wobble = Math.sin(simT * 5.0) * 0.035;
      const br = 13.0 * bf.bubbleScale * (1 + wobble);
      const bx = SNOUT_X + phys.bearRecoilX.x * 0.4 + br * 0.72;
      const by = SNOUT_Y + br * 0.10 - bf.breathSigned * 1.6;
      ctx.save();
      const bg = ctx.createRadialGradient(bx - br * 0.32, by - br * 0.35, br * 0.1, bx, by, br);
      bg.addColorStop(0.0, 'rgba(255, 255, 255, 0.88)');
      bg.addColorStop(0.55, 'rgba(182, 224, 240, 0.45)');
      bg.addColorStop(0.92, 'rgba(128, 184, 212, 0.64)');
      bg.addColorStop(1.0, 'rgba(84, 134, 168, 0.52)');
      ctx.fillStyle = bg;
      ctx.strokeStyle = 'rgba(72, 108, 132, 0.48)';
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

    const sb = phys.snowball;
    if (sb.active || sb.held) {
      if (sb.active) {
        const ft = clamp(sb.t / sb.dur, 0, 1);
        const gY = lerp(sb.groundY0, sb.groundY1, ft);
        const alt = Math.max(0, gY - sb.y);
        const shAlpha = clamp(0.28 - alt * 0.0018, 0.06, 0.28);
        const shRx = clamp(10.0 - alt * 0.032, 4.4, 10.0);
        ctx.save();
        ctx.globalAlpha = shAlpha;
        ctx.fillStyle = '#4c6282';
        ctx.beginPath();
        ctx.ellipse(sb.x + 4, gY, shRx, shRx * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(sb.x, sb.y);
      ctx.rotate(sb.rot);
      const g = ctx.createRadialGradient(-2.5, -2.5, 1, 0, 0, 8.8);
      g.addColorStop(0.0, '#fffdf7');
      g.addColorStop(0.65, '#eef3f9');
      g.addColorStop(1.0, '#bacce0');
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(68, 88, 110, 0.62)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 8.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const p of sm.splashes) {
      const al = 1.0 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = clamp(al * 1.15, 0, 1);
      ctx.fillStyle = p.col;
      ctx.strokeStyle = 'rgba(42, 108, 126, 0.35)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.55 + 0.45 * al), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (const p of sm.popDrops) {
      const al = 1.0 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = clamp(al * 1.15, 0, 1);
      ctx.fillStyle = p.col;
      if (p.isSnow) {
        ctx.strokeStyle = 'rgba(110, 134, 160, 0.32)';
        ctx.lineWidth = 0.9;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.48 + 0.52 * al), 0, Math.PI * 2);
      ctx.fill();
      if (p.isSnow) ctx.stroke();
      ctx.restore();
    }
    for (const b of sm.breathPuffs) {
      const u = b.age / b.life;
      ctx.save();
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.40;
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
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.85;
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
      if (bf && bf.bangAlpha > 0.02) {
        ctx.save();
        ctx.translate(bf.drawX + 46, bf.drawCenterY - 94);
        ctx.scale(bf.bangScale, bf.bangScale);
        ctx.rotate(0.08 + bf.rot * 0.6);
        ctx.globalAlpha = bf.bangAlpha;
        ctx.font = '900 38px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#fbf7ec';
        ctx.lineWidth = 5.5;
        ctx.lineJoin = 'round';
        ctx.strokeText('!', 0, 0);
        ctx.fillStyle = '#c8423b';
        ctx.fillText('!', 0, 0);
        ctx.restore();
      }
      if (bf && bf.questAlpha > 0.02) {
        const floatY = Math.sin(simT * 4.2) * 4.5;
        ctx.save();
        ctx.translate(bf.drawX + 48, bf.drawCenterY - 102 + floatY);
        ctx.rotate(Math.sin(simT * 2.8) * 0.11);
        ctx.globalAlpha = bf.questAlpha;
        ctx.font = 'italic 800 34px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#fbf7ec';
        ctx.lineWidth = 5.0;
        ctx.lineJoin = 'round';
        ctx.strokeText('?', 0, 0);
        ctx.fillStyle = '#33658a';
        ctx.fillText('?', 0, 0);
        ctx.restore();
      }
    }
  }

  function renderAndUpload(simT, { showFriends = 1, showBubbles = 1, flow = 1.0 } = {}) {
    if (showFriends < 0.5 || (!bearAtlas && !pengAtlas)) {
      gpuRig.beginShadow();
      gpuRig.beginColor();
      gpuRig.end();
      return;
    }

    const bf = bearAtlas ? resolveBearFrame(simT) : null;
    const pf = pengAtlas ? resolvePenguinFrame(simT, flow) : { visible: false };

    gpuRig.beginShadow();
    drawPengShadowGpu(pf);
    drawBearShadowGpu(bf);

    gpuRig.beginColor();

    if (pf.visible && pengAtlas) {
      const inDive = (sm.phase === 'COZY_STIR');
      const aerial = isAerialPengKey(pf.currKey) || inDive;
      const pivotY = aerial ? 0.5 : PENG_PIVOT_Y;
      const drawPy = aerial ? pf.py : (pf.py + PENG_PIV_OFF);
      const pDef = getPengDeformForKey(pf.currKey, simT, pf.windAmp, pf.waveAng, pf.armReach);
      drawFlowActor(
        pengAtlas, pengFlowAtlas, PENG_TILES, PENG_FLOW_MAP, PENG_ATLAS_META,
        pf.keyA, pf.keyB, pf.morphT, PENG_REF,
        pf.px, drawPy, PENG_W, PENG_W, pDef,
        { rot: pf.rot, sx: pf.sx, sy: pf.sy, alpha: 1, pivotY, clipHole: HOLE_CLIP }
      );
    }

    let bearDefA = null;
    let bearDefB = null;
    if (bf && bearAtlas) {
      bearDefA = getBearDeformForKey(bf.keyA, bf.breathSigned, bf.scratchWave, bf.shakeWave, bf.yawnPeak, bf.stretchPeak);
      bearDefB = bf.keyB === bf.keyA
        ? bearDefA
        : getBearDeformForKey(bf.keyB, bf.breathSigned, bf.scratchWave, bf.shakeWave, bf.yawnPeak, bf.stretchPeak);
      const activeDef = bf.morphT < 0.5 ? bearDefA : bearDefB;
      drawFlowActor(
        bearAtlas, bearFlowAtlas, BEAR_TILES, BEAR_FLOW_MAP, BEAR_ATLAS_META,
        bf.keyA, bf.keyB, bf.morphT, BEAR_REF,
        bf.drawX, bf.drawPivY, BEAR_W, BEAR_W, activeDef,
        { rot: bf.rot, sx: bf.sx, sy: bf.sy, alpha: 1, pivotY: BEAR_PIVOT_Y }
      );
    }

    drawVectorOverlay(simT, showBubbles, bf, bearDefA, bearDefB, pf);
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
    getRipple: () => [sm.rippleAge, sm.rippleStrength]
  };
}
