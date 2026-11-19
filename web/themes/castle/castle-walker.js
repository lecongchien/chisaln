/**
 * Howl's Moving Castle Walker Controller (Studio Ghibli Painterly Edition)
 * Renders the hand-painted Moving Castle sprite with:
 * - 4 slender, weathered riveted-iron mechanical bird legs (2-bone IK + jointed claws)
 *   striding heavily along the distant alpine ridge crest
 * - Weighty mechanical lurch, gentle sway, and subtle dust puffs on iron foot-strikes
 * - Continuous, organically curling Studio Ghibli charcoal & steam plumes locked
 *   to the swaying chimney nozzles via castle-smoke.js
 */
import { createSmokePlume } from './castle-smoke.js';

const CASTLE_TEX_W = 720;
const CASTLE_TEX_H = 640;
const TEX_SCALE = 0.75; // 540x480 backing texture: 44% less per-frame GPU upload, zero visual loss!
const BACK_W = Math.round(CASTLE_TEX_W * TEX_SCALE);
const BACK_H = Math.round(CASTLE_TEX_H * TEX_SCALE);
const BODY_SIZE = 330;
const BODY_BX = CASTLE_TEX_W * 0.39;
const BODY_BY = CASTLE_TEX_H * 0.51;

// Normalized smokestack nozzle positions inside assets/castle-body.png (512x512)
const STACKS = [
  {
    u: 0.772, v: 0.064,
    cfg: {
      kind: 'coal', spawnRate: 0.042, life: 2.85,
      r0: 9.5, rGrow: 38.0,
      jetVx: 12, jetVy: -28, windVx: 86, windVy: -10,
      windDrag: 2.15, curlAmp: 15, curlFreq: 2.2, opacity: 0.54
    }
  },
  {
    u: 0.648, v: 0.114,
    cfg: {
      kind: 'coal', spawnRate: 0.056, life: 2.35,
      r0: 7.0, rGrow: 27.0,
      jetVx: 6, jetVy: -22, windVx: 78, windVy: -12,
      windDrag: 2.0, curlAmp: 13, curlFreq: 2.5, opacity: 0.38
    }
  },
  {
    u: 0.746, v: 0.412,
    cfg: {
      kind: 'steam', spawnRate: 0.058, life: 1.35,
      r0: 5.2, rGrow: 17.5,
      jetVx: 5, jetVy: -24, windVx: 46, windVy: -15,
      windDrag: 2.4, curlAmp: 9, curlFreq: 3.1, opacity: 0.34
    }
  }
];

// 4 mechanical leg sockets tucked cleanly behind the curved riveted iron belly
const LEG_SPECS = [
  { u: 0.27, v: 0.80, phase: 0.00, far: true,  footRestX: -0.04 },
  { u: 0.58, v: 0.79, phase: 0.50, far: true,  footRestX:  0.04 },
  { u: 0.36, v: 0.85, phase: 0.25, far: false, footRestX: -0.02 },
  { u: 0.50, v: 0.85, phase: 0.75, far: false, footRestX:  0.03 }
];

// Configurable ridge curve (updated automatically when castle-bg.png loads & gets scanned!)
let ridgeAnchorLeft = 0.455;
let ridgeAnchorRight = 0.665;

export function setRidgeProfile(leftNorm, rightNorm) {
  ridgeAnchorLeft = leftNorm;
  ridgeAnchorRight = rightNorm;
}

export function ridgeYAt(nx, H) {
  const slope = ridgeAnchorLeft + nx * (ridgeAnchorRight - ridgeAnchorLeft);
  const undul = Math.sin(nx * 4.8 + 0.4) * 0.012 + Math.sin(nx * 10.6 + 1.6) * 0.004;
  return (slope + undul) * H;
}

export function createCastleWalker(gl, onReady) {
  const canvas = document.createElement('canvas');
  canvas.width = BACK_W;
  canvas.height = BACK_H;
  const ctx = canvas.getContext('2d');

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, BACK_W, BACK_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const sprite = { img: new Image(), ready: false };
  sprite.img.onload = () => {
    sprite.ready = true;
    onReady?.();
  };
  sprite.img.src = 'assets/castle-body.png';

  const plumes = STACKS.map((st) => createSmokePlume(st.cfg));

  const state = {
    nx: 0.29,            // Iconic hero upper-left ridge position matching movie frame
    dir: -1,             // -1 = marching left (sprite natural facing), +1 = mirrored right
    stridePhase: 0,
    bobY: 0,
    bodyRot: 0,
    time: 0,
    prevContact: [true, true, true, true],
    dust: []
  };

  function getStackMouth(st, flipX, bobY, bodyRot) {
    const lx = (st.u - 0.5) * BODY_SIZE;
    const ly = (st.v - 0.5) * BODY_SIZE;
    const cR = Math.cos(bodyRot), sR = Math.sin(bodyRot);
    return {
      x: BODY_BX + (lx * cR - ly * sR) * flipX,
      y: BODY_BY + bobY + (lx * sR + ly * cR)
    };
  }

  function step(dt, { speed, flow, gust = 0.4, showCastle }) {
    if (showCastle < 0.5) return;

    state.time += dt;
    const walkRate = Math.max(0, speed);
    const wind = Math.max(0.18, flow);

    if (walkRate > 0.01) {
      const prevNx = state.nx;
      state.nx += state.dir * 0.0068 * walkRate * dt;
      state.stridePhase += dt * 0.38 * walkRate;

      if (state.nx < 0.17 && prevNx >= 0.17) {
        state.dir = 1;
        for (const pl of plumes) pl.reset();
      } else if (state.nx > 0.72 && prevNx <= 0.72) {
        state.dir = -1;
        for (const pl of plumes) pl.reset();
      }
    }

    const lurchAmt = walkRate > 0.01 ? 1.0 : 0.16;
    state.bobY = (-(0.5 - 0.5 * Math.cos(state.stridePhase * Math.PI * 4)) * 4.8 + Math.sin(state.time * 1.1) * 1.0) * lurchAmt;
    state.bodyRot = (Math.sin(state.stridePhase * Math.PI * 2 + 0.4) * 0.026 + Math.sin(state.time * 0.8) * 0.007) * lurchAmt;

    // Advance continuous watercolor coal & steam plumes anchored to live bobbing chimneys
    const flipX = -state.dir;
    for (let i = 0; i < STACKS.length; i++) {
      const m = getStackMouth(STACKS[i], flipX, state.bobY, state.bodyRot);
      plumes[i].step(dt, m.x, m.y, { wind, gust, sc: 1.0, active: true });
    }

    for (let i = state.dust.length - 1; i >= 0; i--) {
      const dp = state.dust[i];
      dp.age += dt;
      if (dp.age >= dp.life) { state.dust.splice(i, 1); continue; }
      dp.x += dp.vx * dt;
      dp.y += dp.vy * dt;
      dp.r += dt * 7.0;
    }
  }

  function drawMechanicalLeg(legSpec, legIdx, bodySize, flipX, bx, by, bobY, bodyRot, groundY, walkRate) {
    const u = ((state.stridePhase + legSpec.phase) % 1 + 1) % 1;
    const STANCE = 0.62;
    const isContact = u < STANCE;

    if (isContact && !state.prevContact[legIdx] && walkRate > 0.05) {
      const fx = bx + ((legSpec.u - 0.5) * bodySize * flipX);
      for (let k = 0; k < 3; k++) {
        state.dust.push({
          x: fx + (Math.random() - 0.5) * 14,
          y: groundY - 2,
          vx: (Math.random() - 0.25) * 16,
          vy: -(5 + Math.random() * 8),
          r: 3.2 + Math.random() * 2.8,
          age: 0,
          life: 0.75 + Math.random() * 0.35
        });
      }
    }
    state.prevContact[legIdx] = isContact;

    const strideAmp = 22 * (walkRate > 0.01 ? 1 : 0);
    let footSwing = 0, footLift = 0;
    if (isContact) {
      footSwing = strideAmp * (0.5 - u / STANCE);
    } else {
      const t = (u - STANCE) / (1 - STANCE);
      footSwing = strideAmp * (-0.5 + t * t * (3 - 2 * t));
      footLift = Math.sin(Math.PI * t) * 18;
    }

    const locX = (legSpec.u - 0.5) * bodySize;
    const locY = (legSpec.v - 0.5) * bodySize;
    const cR = Math.cos(bodyRot), sR = Math.sin(bodyRot);
    const hipX = bx + (locX * cR - locY * sR) * flipX;
    const hipY = by + bobY + (locX * sR + locY * cR);

    const footX = bx + ((legSpec.u + legSpec.footRestX - 0.5) * bodySize) * flipX + footSwing * state.dir;
    const footY = groundY - footLift;

    // Slender spindly Howl bird-iron legs (2-bone backward knee IK)
    const L1 = 34, L2 = 40;
    const dx = footX - hipX, dy = footY - hipY;
    const raw = Math.hypot(dx, dy);
    const dist = Math.max(14, Math.min(L1 + L2 - 1, raw));
    const ux = dx / Math.max(1, raw), uy = dy / Math.max(1, raw);
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const bend = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const kneeSign = -state.dir;
    const kx = hipX + ux * along - uy * bend * kneeSign;
    const ky = hipY + uy * along + ux * bend * kneeSign;

    const metalDark = legSpec.far ? '#394048' : '#4e5862';
    const metalLit  = legSpec.far ? '#5b646e' : '#7c868e';
    const ink       = '#2a2420';

    const drawStrut = (x1, y1, x2, y2, w1, w2) => {
      const sdx = x2 - x1, sdy = y2 - y1, len = Math.max(1, Math.hypot(sdx, sdy));
      const nx = -sdy / len, ny = sdx / len;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
      ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
      ctx.lineTo(x2 - nx * w2, y2 - ny * w2);
      ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
      ctx.closePath();
      const g = ctx.createLinearGradient(x1 - 5, y1, x2 + 5, y2);
      g.addColorStop(0, metalLit);
      g.addColorStop(1, metalDark);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.45;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    };

    drawStrut(hipX, hipY, kx, ky, 5.2, 3.6);
    drawStrut(kx, ky, footX, footY, 3.4, 2.3);

    // Weathered iron-brass knee pivot joint
    ctx.save();
    ctx.fillStyle = legSpec.far ? '#4b5054' : '#7b6e5e';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.arc(kx, ky, 4.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3-toed mechanical bird claw gripping the alpine ridge
    ctx.save();
    ctx.translate(footX, footY);
    ctx.strokeStyle = ink;
    ctx.fillStyle = metalDark;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const fwd = state.dir;
    for (const [tx, ty] of [[fwd * 14, 2], [fwd * 9, 5], [-fwd * 10, 2.5]]) {
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.quadraticCurveTo(tx * 0.55, -2.2, tx, ty);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, -1, 3.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function renderAndUpload(t, { W, H, showCastle, speed }) {
    if (showCastle < 0.5 || !sprite.ready) return null;

    const sc = Math.max(0.55, Math.min(1.12, Math.min(W, H) / 900));
    const walkRate = Math.max(0, speed);
    const bodySize = BODY_SIZE;
    const bx = BODY_BX;
    const by = BODY_BY;
    const groundY = by + bodySize * 0.545;

    const bobY = state.bobY;
    const bodyRot = state.bodyRot;
    const flipX = -state.dir;

    ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
    ctx.clearRect(0, 0, CASTLE_TEX_W, CASTLE_TEX_H);

    // 1. Continuous watercolor charcoal & steam plumes streaming behind swaying chimneys
    for (let i = 0; i < STACKS.length; i++) {
      const m = getStackMouth(STACKS[i], flipX, bobY, bodyRot);
      plumes[i].draw(ctx, m.x, m.y, 1.0);
    }

    // 2. Far mechanical bird legs behind iron belly
    for (let i = 0; i < LEG_SPECS.length; i++) {
      if (LEG_SPECS[i].far) {
        drawMechanicalLeg(LEG_SPECS[i], i, bodySize, flipX, bx, by, bobY, bodyRot, groundY, walkRate);
      }
    }

    // 3. Hand-painted Studio Ghibli Moving Castle body
    ctx.save();
    ctx.translate(bx, by + bobY);
    ctx.scale(flipX, 1);
    ctx.rotate(bodyRot);
    ctx.drawImage(sprite.img, -bodySize * 0.5, -bodySize * 0.5, bodySize, bodySize);
    ctx.restore();

    // 4. Near mechanical bird legs
    for (let i = 0; i < LEG_SPECS.length; i++) {
      if (!LEG_SPECS[i].far) {
        drawMechanicalLeg(LEG_SPECS[i], i, bodySize, flipX, bx, by, bobY, bodyRot, groundY, walkRate);
      }
    }

    // 5. Foot-strike alpine dust wisps
    for (const dp of state.dust) {
      const u = dp.age / dp.life;
      ctx.save();
      ctx.globalAlpha = (1 - u) * 0.30;
      ctx.fillStyle = '#dddac6';
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, dp.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    // Anchor claws gently into the sunlit tufted ridge crest so all 4 bird-iron legs read clearly!
    const castleScreenX = state.nx * W;
    const castleRidgeY = ridgeYAt(state.nx, H) + 4 * sc;
    const outW = 560 * sc;
    const outH = 498 * sc;
    return [
      castleScreenX - (bx / CASTLE_TEX_W) * outW,
      castleRidgeY - (groundY / CASTLE_TEX_H) * outH,
      outW,
      outH
    ];
  }

  return {
    state,
    texture: tex,
    step,
    renderAndUpload
  };
}
