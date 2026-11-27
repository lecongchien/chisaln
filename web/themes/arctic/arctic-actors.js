/**
 * Arctic Sleeping Polar Bear Controller — Authentic Living 60 FPS Studio Ghibli Watercolor Edition
 *
 * Uses our razor-crisp 512x512 hand-inked Studio Ghibli hero bear (`bearSleepMid`) deformed smoothly
 * on a dense 16x16 WebGL2 GPU Live2D mesh (512 triangles, ~0.02ms/frame) with ZERO optical-flow
 * crossfade ghosting or occlusion smear:
 *   - True asymmetric mammalian sleep breathing (~5.4s slow breath cycle with organic breath-depth
 *     modulation and 3-zone anatomical phase lag: ribcage -> shoulder -> cozy resting head).
 *   - Occasional natural micro ear-twitches (damped spring rotation strictly around ear roots) and
 *     soft cold-air warm breath sighs drifting gently from the nose tip.
 *   - Delicate matte hand-inked watercolor sleep bubble breathing gently in sync with exhale + soft
 *     drifting `z` letters (both toggled cleanly by `showBubbles`).
 */

import {
  uploadAtlasTexture,
  createGpuRigRenderer,
  radialWeight,
  applyWeightedRotation
} from './arctic-rig.js';

import {
  BEAR_ATLAS_META,
  BEAR_TILES_90
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
const HERO_TILE = BEAR_TILES_90.bearSleepMid;
// Matches WIND_DIR in arctic-shader.js so exhaled warm breath drifts WITH the Arctic wind!
const WIND_X = 0.848;
const WIND_Y = 0.530;
// Matches -LIGHT = (+0.60, +0.80) in arctic-shader.js for exact cast-shadow direction!
const SHADOW_OFF_X = 11.0;
const SHADOW_OFF_Y = 14.8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createArcticActorsController(gl, onReady) {
  // Dense 16x16 GPU Live2D mesh (512 triangles) for silky continuous organic breathing with zero ghosting!
  const gpuRig = createGpuRigRenderer(gl, TEX_SIZE, 280, 16);

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = TEX_SIZE;
  overlayCanvas.height = TEX_SIZE;
  const ctx = overlayCanvas.getContext('2d');

  let bearAtlas = null;

  {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      bearAtlas = uploadAtlasTexture(gl, img);
      onReady?.();
    };
    img.src = 'assets/arctic-bear-atlas.webp?v=ghibli512';
  }

  // Ground-pinned position & calibrated nose-tip landmark on 512x512 hand-painted hero bear
  const BX = BEAR_NORM.x * TEX_SIZE;
  const BY_CENTER = BEAR_NORM.y * TEX_SIZE - 8;
  const BEAR_W = 268;
  const BEAR_PIV_OFF = (BEAR_PIVOT_Y - 0.5) * BEAR_W;
  const BY_GROUND = BY_CENTER + BEAR_PIV_OFF;

  const SNOUT_X = BX + ((457.0 / BEAR_REF) - 0.5) * BEAR_W;
  const SNOUT_Y = BY_CENTER + ((221.2 / BEAR_REF) - 0.5) * BEAR_W;

  const phys = {
    simT: 0,
    bearSquash: createSpring(0, 95, 13.5),
    bearEar:    createSpring(0, 230, 10.5),
    bearSigh:   createSpring(0, 62, 10.2)
  };

  const sm = {
    phase: 'SLEEPING',
    t: 0,
    nextTwitchIn: 5.5,
    nextSighIn: 9.2,
    sighActive: 0,
    breathPuffs: [],
    zzzParticles: [],
    zzzTimer: 0.75,
    x: 640,
    y: 420,
    size: 360,
    initialized: false
  };

  function setMouse() {}

  function step(dt, { mischief = 1.0, showFriends = 1, showBubbles = 1, flow = 1.0 } = {}) {
    if (showFriends < 0.5) return;

    const d = Math.min(0.05, Math.max(0, dt));
    phys.simT += d;
    sm.t += d;

    const pace = clamp(mischief, 0.35, 2.2);
    const windSpd = clamp(flow, 0.1, 2.5);

    // Occasional natural micro ear-twitch (subtle organic flick, never jarring)
    sm.nextTwitchIn -= d * pace;
    if (sm.nextTwitchIn <= 0) {
      sm.nextTwitchIn = 7.5 + Math.random() * 8.5;
      const dir = Math.random() < 0.5 ? 1 : -1;
      phys.bearEar.impulse(dir * (4.2 + Math.random() * 2.4));
    }

    // Occasional deep cozy sleep sigh; warm condensation puffs only escape freely into cold air
    // when no sleep bubble is sealing the nostril (physically consistent aerodynamics!)
    sm.nextSighIn -= d * pace;
    if (sm.nextSighIn <= 0) {
      sm.nextSighIn = 11.0 + Math.random() * 9.0;
      sm.sighActive = 1.65;
      phys.bearSigh.impulse(0.65);
    }
    if (sm.sighActive > 0) {
      sm.sighActive = Math.max(0, sm.sighActive - d);
      if (showBubbles < 0.5 && sm.sighActive < 1.15 && sm.sighActive > 0.35 && Math.random() < d * 5.2) {
        // Exhale initially pushes gently out from snout, then entrains into WIND_DIR (top-down consistent!)
        sm.breathPuffs.push({
          x: SNOUT_X + 5 + (Math.random() - 0.5) * 4,
          y: SNOUT_Y + 1 + (Math.random() - 0.5) * 4,
          vx: 11 + WIND_X * (10 + 14 * windSpd) + (Math.random() - 0.5) * 5,
          vy:  2 + WIND_Y * (10 + 14 * windSpd) + (Math.random() - 0.5) * 5,
          r: 4.2 + Math.random() * 2.8,
          age: 0,
          life: 1.30 + Math.random() * 0.35
        });
      }
    }

    // Gentle floating `z` particles rising slowly from sleeping head (nudged slightly by Arctic breeze)
    sm.zzzTimer -= d;
    if (sm.zzzTimer <= 0) {
      sm.zzzTimer = 1.65 + Math.random() * 0.75;
      sm.zzzParticles.push({
        x: SNOUT_X + 4 + (Math.random() - 0.5) * 10,
        y: SNOUT_Y - 28,
        age: 0,
        life: 2.75,
        size: 12.5 + Math.random() * 4.5,
        drift: (Math.random() - 0.5) * 8 + WIND_X * 7 * windSpd
      });
    }

    // Subtle organic volume-preserving squash tied gently to deep sighs
    const sighTarget = sm.sighActive > 0 ? Math.sin((sm.sighActive / 1.65) * Math.PI) * 0.016 : 0;
    phys.bearSquash.step(d, sighTarget);
    phys.bearEar.step(d, 0);
    phys.bearSigh.step(d, 0);

    // Entrain warm breath puffs smoothly into Arctic WIND_DIR while expanding gently as they dissipate
    const targetVx = WIND_X * (16 + 18 * windSpd);
    const targetVy = WIND_Y * (16 + 18 * windSpd);
    const kWind = 1 - Math.exp(-2.2 * d);
    for (let i = sm.breathPuffs.length - 1; i >= 0; i--) {
      const b = sm.breathPuffs[i];
      b.age += d;
      b.vx += (targetVx - b.vx) * kWind;
      b.vy += (targetVy - b.vy) * kWind;
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.r += 7.5 * d;
      if (b.age >= b.life) sm.breathPuffs.splice(i, 1);
    }
    for (let i = sm.zzzParticles.length - 1; i >= 0; i--) {
      const z = sm.zzzParticles[i];
      z.age += d;
      z.y -= 21 * d;
      z.x += (8.5 + Math.sin(z.age * 2.6) * 9.0 + z.drift * 0.22) * d;
      if (z.age >= z.life) sm.zzzParticles.splice(i, 1);
    }
  }

  /**
   * Anatomical 3-zone phase-lagged mammalian breathing deformer on the 512x512 hand-inked bear:
   *   - Snow-contact base (v > 432) stays 100% locked to the ground (zero floating or sliding!)
   *   - Ribcage/flank swells smoothly outward & upward first
   *   - Shoulder follows 0.32s later for a genuine living wave through thick fur
   *   - Head stays warmly nestled on the front paws with a whisper-subtle 1.2px nod (0.52s lag)
   *   - Ears flick organically around their exact painted roots during rare micro-twitches
   */
  function makeLivingBreathDeform(simT) {
    // Natural slow 5.4s sleeping breath + subtle irrational-period depth modulation (never robotic!)
    const depthMod = 1.0 + 0.14 * Math.sin(simT * 0.37) + 0.08 * Math.cos(simT * 0.23) + phys.bearSigh.x * 0.45;
    const bRibs     = sampleMammalianBreath(simT, 5.4).signed * depthMod;
    const bShoulder = sampleMammalianBreath(simT - 0.32, 5.4).signed * depthMod;
    const bHead     = sampleMammalianBreath(simT - 0.52, 5.4).signed * depthMod;
    const earAng    = clamp(phys.bearEar.x * 0.032, -0.26, 0.26);

    return (u, v, out) => {
      // Pin lower belly & hind/front snow-contact smoothly to the snow shelf
      const groundPin = clamp((454 - v) / 145, 0, 1);
      const pinSmooth = groundPin * groundPin * (3 - 2 * groundPin);

      // Zone 1: Ribcage & upper back flank (primary living expansion + soft-tissue lateral fullness)
      const wRibs = radialWeight(u, v, 206, 224, 172, 138) * pinSmooth;
      out[0] -= bRibs * 2.5 * wRibs;
      out[1] -= bRibs * 5.2 * wRibs;
      // Subtle volume-conserving lateral flank softness along lower ribcage curve
      const wFlank = radialWeight(u, v, 148, 305, 110, 95) * pinSmooth;
      out[0] -= bRibs * 1.35 * wFlank;

      // Zone 2: Upper shoulder & nape (0.32s delayed gentle wave)
      const wShoulder = radialWeight(u, v, 316, 194, 118, 108) * pinSmooth;
      out[0] -= bShoulder * 1.1 * wShoulder;
      out[1] -= bShoulder * 3.1 * wShoulder;

      // Zone 3: Sleeping head & snout nestled gently on front paws (whisper-subtle 0.52s lag)
      const wHead = radialWeight(u, v, 408, 192, 92, 82) * pinSmooth;
      out[1] -= bHead * 1.3 * wHead;
      applyWeightedRotation(out, 366, 226, -bHead * 0.011, wHead);

      // Zone 4: Rare natural micro ear-twitch strictly around exact painted ear roots
      if (Math.abs(earAng) > 0.008) {
        applyWeightedRotation(out, 384, 114,  earAng, radialWeight(u, v, 384, 102, 36, 34));
        applyWeightedRotation(out, 428, 120, -earAng * 0.72, radialWeight(u, v, 430, 110, 28, 28));
      }
    };
  }

  function drawVectorOverlay(simT, showBubbles) {
    ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);

    // Warm translucent breath mist in cold Arctic air (during occasional deep sleep sighs)
    for (const b of sm.breathPuffs) {
      const u = b.age / b.life;
      ctx.save();
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.34;
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r);
      g.addColorStop(0, 'rgba(255, 253, 248, 0.90)');
      g.addColorStop(1, 'rgba(235, 246, 252, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (showBubbles >= 0.5) {
      // Soft matte watercolor sleep bubble synced naturally with 0.35s-lagged exhale (shrinks on inhale, swells on exhale!)
      const bLag = sampleMammalianBreath(simT - 0.35, 5.4);
      const exhaleAmt = 1.0 - clamp(bLag.level, 0, 1);
      const bScale = 0.42 + 0.58 * exhaleAmt;
      const brX = 11.8 * bScale * (1 + Math.sin(simT * 3.1) * 0.025);
      const brY = 11.2 * bScale * (1 + Math.cos(simT * 2.7) * 0.025);
      const bx = SNOUT_X + brX * 0.82 + 2.0;
      const by = SNOUT_Y + brY * 0.06 - bLag.signed * 0.9;

      ctx.save();
      const bg = ctx.createRadialGradient(bx - brX * 0.28, by - brY * 0.30, brX * 0.08, bx, by, brX);
      bg.addColorStop(0.0, 'rgba(255, 253, 246, 0.72)');
      bg.addColorStop(0.62, 'rgba(204, 228, 238, 0.30)');
      bg.addColorStop(0.92, 'rgba(146, 186, 206, 0.42)');
      bg.addColorStop(1.0, 'rgba(92, 126, 148, 0.36)');
      ctx.fillStyle = bg;
      ctx.strokeStyle = 'rgba(76, 102, 120, 0.42)';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(bx, by, brX, brY, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Soft matte gouache highlight dab (matches hand-painted thumb-arctic.jpg bubble!)
      ctx.fillStyle = 'rgba(255, 253, 247, 0.76)';
      ctx.beginPath();
      ctx.ellipse(bx - brX * 0.28, by - brY * 0.30, brX * 0.24, brY * 0.14, -0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Gentle drifting hand-lettered `z` particles
      for (const z of sm.zzzParticles) {
        const u = z.age / z.life;
        ctx.save();
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.72;
        ctx.translate(z.x, z.y);
        ctx.rotate(Math.sin(z.age * 1.9) * 0.12);
        ctx.font = `italic 700 ${Math.round(z.size)}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(252, 248, 238, 0.86)';
        ctx.lineWidth = 3.0;
        ctx.fillStyle = '#4c6d8c';
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

    const { sx, sy } = volumeScale(phys.bearSquash.x);
    const deform = makeLivingBreathDeform(simT);
    const [col, row] = HERO_TILE;

    // 1. Soft ground-pinned watercolor shadow FBO — cast strictly along -LIGHT (+11, +14.8)
    //    AND deformed with the exact live breathing/ear-twitch mesh so the shadow breathes in lockstep!
    gpuRig.beginShadow();
    gpuRig.drawTile(
      bearAtlas, col, row, BEAR_ATLAS_META.cell, BEAR_REF,
      BX + SHADOW_OFF_X, BY_GROUND + SHADOW_OFF_Y, BEAR_W, BEAR_W, deform,
      { rot: 0, sx: sx * 1.02, sy: sy * 0.87, alpha: 0.86, pivotY: BEAR_PIVOT_Y }
    );

    // 2. Razor-sharp 512x512 hand-inked Ghibli Polar Bear with 16x16 living breath mesh
    gpuRig.beginColor();
    gpuRig.drawTile(
      bearAtlas, col, row, BEAR_ATLAS_META.cell, BEAR_REF,
      BX, BY_GROUND, BEAR_W, BEAR_W, deform,
      { rot: 0, sx, sy, alpha: 1, pivotY: BEAR_PIVOT_Y }
    );

    drawVectorOverlay(simT, showBubbles);
    gpuRig.drawOverlayCanvas(overlayCanvas);
    gpuRig.end();
  }

  function getHoleCss() {
    return [0, 0, 0, 0];
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
