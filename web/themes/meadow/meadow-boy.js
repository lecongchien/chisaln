/**
 * Studio Ghibli Kite Boy Controller & 3D Running Biomechanics
 * - Hand-painted idle front portrait (meadow-boy-front.png) & rear-aerial running torso (meadow-boy-back.png)
 * - 360-degree Bezier roaming around icon cloud islands and the sunbathing kitten
 * - Ground-locked 3D-projected child running legs (44% stance, zero foot skating, parallel hip lanes,
 *   elongated Studio Ghibli canvas sneakers with proper toe-down push-off rotation)
 * - Dynamic 360-degree trailing kite with spring-damper tug reactions, 3 fluttering rainbow ribbons, and ground shadows
 */
const ACTOR_TEX_W = 480;
const ACTOR_TEX_H = 480;

// Exact 256x256 Studio Ghibli sprite arm-articulation rigs (masks, tucked sleeve stubs, pivots, spool centers)
const FRONT_RIG = {
  spool: [165, 76],
  left: {
    pivot: [105, 103],
    poly: [[88, 107], [99, 107], [109, 112], [108, 121], [106, 134], [105, 150], [106, 168], [88, 168]],
    stub: [106, 99, 103, 110, 4.8, '#f6d7b8']
  },
  right: {
    pivot: [152, 99],
    poly: [[151, 111], [163, 98], [162, 92], [156, 85], [151, 82], [151, 60], [186, 60], [186, 126], [151, 126]],
    stub: [148, 97, 154, 104, 4.5, '#f2cead']
  }
};

const BACK_RIG = {
  spool: [165, 58],
  left: {
    pivot: [110, 103],
    poly: [[54, 96], [100, 102], [109, 114], [109, 140], [54, 140]],
    stub: [113, 102, 102, 109, 5.5, '#f6d6b6']
  },
  right: {
    pivot: [168, 88],
    poly: [[162, 45], [161, 52], [158, 56], [152, 59], [152, 72], [171, 79], [173, 98], [188, 98], [188, 45]],
    stub: [166, 88, 175, 88, 5.4, '#f2cead']
  }
};

function tracePoly(ctx, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
    else ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
}

/**
 * Slices a Studio Ghibli boy PNG once at load time into 3 seamless layers:
 * - torso (coral t-shirt sleeves intact, bare arms erased cleanly outside sleeve cuffs)
 * - leftArm / rightArm (bare arm + hand + wooden spool, with a rounded skin stub tucked inside the sleeve)
 * Drawing arms BEHIND torso lets them rotate smoothly around shoulder pivots with zero gaps or seams.
 */
function buildArticulatedSprite(img, rig) {
  const w = img.naturalWidth || 256;
  const h = img.naturalHeight || 256;

  const torso = document.createElement('canvas');
  torso.width = w; torso.height = h;
  const tCtx = torso.getContext('2d');
  tCtx.drawImage(img, 0, 0, w, h);

  const extractArm = (def) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    // Rounded skin cap tucked behind the t-shirt sleeve so rotation never exposes a gap
    if (def.stub) {
      const [x1, y1, x2, y2, r, fill] = def.stub;
      ctx.save();
      ctx.strokeStyle = fill;
      ctx.lineWidth = r * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    // Copy original hand-painted watercolor arm pixels clipped strictly to polygon mask
    ctx.save();
    tracePoly(ctx, def.poly);
    ctx.clip();
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();

    // Erase arm pixels cleanly from the torso layer
    tCtx.save();
    tCtx.globalCompositeOperation = 'destination-out';
    tracePoly(tCtx, def.poly);
    tCtx.fill();
    tCtx.restore();

    return c;
  };

  return {
    w, h,
    torso,
    leftArm: extractArm(rig.left),
    rightArm: extractArm(rig.right)
  };
}

function loadImg(src, rig = null) {
  const o = { img: new Image(), ready: false, parts: null };
  o.img.onload = () => {
    if (rig) o.parts = buildArticulatedSprite(o.img, rig);
    o.ready = true;
  };
  o.img.src = src;
  return o;
}

function computeBoyArmPose(t, wind, act, tug, isRunningView) {
  if (isRunningView) {
    const g = act.gait || 0;
    const leftAngle = Math.sin(act.phase) * 0.36 * g;
    const rawRight = (0.08 - Math.sin(act.phase) * 0.21 + Math.sin(t * 2.4 * wind) * 0.055) * g;
    const rightAngle = Math.max(-0.11, Math.min(0.33, rawRight));
    return {
      leftAngle,
      rightAngle,
      rightDx: (0.8 - Math.sin(act.phase) * 1.2) * g,
      rightDy: (-Math.cos(act.phase) * 0.9) * g
    };
  }

  // Idle kite-flying: continuous breeze-guiding sway + expressive kite tugs + subtle counter-balance on free arm
  const breezeWave = Math.sin(t * 1.45 * wind) * 0.145 + Math.sin(t * 2.35 * wind + 0.8) * 0.055;
  const rawRight = breezeWave + tug.reach * 0.24 - tug.pull * 0.22;
  const rightAngle = Math.max(-0.21, Math.min(0.36, rawRight));
  const leftAngle = -Math.sin(t * 1.45 * wind - 0.35) * 0.055 + tug.pull * 0.11 - tug.reach * 0.07;
  return {
    leftAngle,
    rightAngle,
    rightDx: Math.sin(t * 1.45 * wind) * 1.2 + tug.reach * 2.0 - tug.pull * 2.0,
    rightDy: -Math.cos(t * 1.45 * wind) * 0.9 - tug.reach * 1.4 + tug.pull * 1.5
  };
}

export function computeBoyTripPose(elapsed, cycles, duration, enter, exit) {
  const ease = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  const turn = enter ? 0 : 0.22;
  const runEnd = turn + duration;
  const turnBackAt = runEnd + 0.16;
  const strideLead = enter ? 0 : 0.07;

  if (elapsed < turn - strideLead) {
    const u = Math.max(0, elapsed / turn);
    return { back: u >= 0.35, progress: 0, running: false, squeeze: 1 - 0.22 * Math.sin(u * Math.PI), phase: 0, gait: 0, bob: 0, done: false };
  }
  if (elapsed < runEnd) {
    const runTime = elapsed - turn;
    const stepTime = Math.max(0, runTime + strideLead);
    const plantTime = enter ? 0 : 0.02;
    const moveTime = Math.max(0, runTime - plantTime);
    const moveDur = Math.max(0.4, duration - plantTime);
    const accel = 0.16, decel = 0.22;
    const rampInt = (t, r) => {
      if (t >= r) return t - r * 0.5;
      const u = Math.max(0, t / r);
      return r * (u * u * u - 0.5 * u * u * u * u);
    };
    const progress = Math.max(0, Math.min(1,
      (rampInt(moveTime, accel) - rampInt(Math.max(0, moveTime - moveDur + decel), decel)) /
      Math.max(0.1, moveDur - (accel + decel) * 0.5)
    ));
    const lead = enter ? 0 : 0.18;
    const phase = (lead * ease(stepTime / 0.10) + (cycles - lead) * progress) * Math.PI * 2;
    const gait = ease(stepTime / 0.08) * (exit ? 1 : ease((duration - runTime) / 0.14));
    const squeeze = elapsed < turn ? 1 - 0.22 * Math.sin((elapsed / turn) * Math.PI) : 1;
    // Physically accurate gravity bob3D (+ = UP in flight apex, - = DOWN in mid-stance compression)
    const bob3D = -1.9 * Math.sin(phase * 2 + 0.35) * gait;
    return { back: true, progress, running: true, squeeze, phase, gait, bob: bob3D, done: false };
  }
  if (exit) return { back: true, progress: 1, running: false, squeeze: 1, phase: 0, gait: 0, bob: 0, done: true };
  if (elapsed < turnBackAt) return { back: true, progress: 1, running: false, squeeze: 1, phase: 0, gait: 0, bob: 0, done: false };
  if (elapsed < turnBackAt + 0.22) {
    const u = (elapsed - turnBackAt) / 0.22;
    return { back: u < 0.65, progress: 1, running: false, squeeze: 1 - 0.22 * Math.sin(u * Math.PI), phase: 0, gait: 0, bob: 0, done: false };
  }
  return { back: false, progress: 1, running: false, squeeze: 1, phase: 0, gait: 0, bob: 0, done: true };
}

export function computeBoyTugPose(age) {
  const ease = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  if (age < 0 || age >= 1.12) return { active: false, reach: 0, pull: 0 };
  const reach = ease(age / 0.16) * (1 - ease((age - 0.16) / 0.20));
  const pull  = ease((age - 0.16) / 0.20) * (1 - ease((age - 0.50) / 0.62));
  return { active: true, reach, pull };
}

export function solveChildRunLegs3D(activity, localDirX, localDirY) {
  const weight = activity.gait || 0;
  const phase = activity.phase || 0;
  const bob3D = activity.bob || 0;
  const STANCE = 0.44;
  const STRIDE_HALF = 8.6;

  const solveOne = (hipX, hipY, restAnkleX, restAnkleY, offset) => {
    const u = ((phase / (Math.PI * 2) + offset) % 1 + 1) % 1;
    const contact = u < STANCE;

    let sFoot, zFoot, footPitch;
    if (contact) {
      const t = u / STANCE;
      sFoot = STRIDE_HALF - t * (STRIDE_HALF * 2);
      zFoot = 0;
      const strike = Math.max(0, 1 - t * 4.5);
      const push = Math.max(0, (t - 0.58) / 0.42);
      footPitch = -strike * 0.22 + push * push * 0.78;
    } else {
      const t = (u - STANCE) / (1 - STANCE);
      const rec = Math.max(0, (t - 0.12) / 0.88);
      const ease = rec * rec * (3 - 2 * rec);
      sFoot = -STRIDE_HALF + (STRIDE_HALF * 2) * ease - Math.sin(Math.PI * t) * (1 - t) * 1.4;
      zFoot = Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.82)) * 7.8);
      const liftAng = Math.sin(Math.PI * Math.min(1, t * 1.1));
      footPitch = 0.78 * (1 - t) * (1 - t) + liftAng * 0.52 - Math.max(0, (t - 0.72) / 0.28) * 0.24;
    }

    const zHip = 17.4 + bob3D;
    const L1 = 9.8, L2 = 9.5;
    const ds = sFoot;
    const dz = zFoot - zHip;
    const raw = Math.hypot(ds, dz);
    const dist = Math.max(2.5, Math.min(L1 + L2 - 0.15, raw));
    const us = ds / Math.max(raw, 0.001);
    const uz = dz / Math.max(raw, 0.001);
    const fs = us * dist;
    const fz = zHip + uz * dist;

    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const bend = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const ks = us * along - uz * bend;
    const kz = zHip + uz * along + us * bend;

    const projSX = localDirX * 0.78;
    const projSY = localDirY * 0.42;
    const projZ  = -0.90;

    const k2x = hipX + ks * projSX;
    const k2y = hipY + ks * projSY + (kz - zHip) * projZ;
    const a2x = hipX + fs * projSX;
    const a2y = hipY + fs * projSY + (fz - zHip) * projZ;

    const fx = restAnkleX + (a2x - restAnkleX) * weight;
    const fy = restAnkleY + (a2y - restAnkleY) * weight;
    const kx = (hipX + restAnkleX) * 0.5 + (k2x - (hipX + restAnkleX) * 0.5) * weight;
    const ky = (hipY + restAnkleY) * 0.5 + (k2y - (hipY + restAnkleY) * 0.5) * weight;

    return {
      hip: [hipX, hipY],
      knee: [kx, ky],
      ankle: [fx, fy],
      kneeS: ks * weight,
      ankleS: fs * weight,
      footPitch: footPitch * weight,
      soleAmt: Math.max(0, Math.min(1, Math.sin(Math.max(0, footPitch)) * 0.85)) * weight,
      footZ: zFoot * weight,
      contact: contact || weight < 0.15
    };
  };

  const yShift = -bob3D * 0.90;
  return {
    left:  solveOne(0.8, 13.5 + yShift, 0.4, 30.0, 0.0),
    right: solveOne(7.4, 15.2 + yShift, 7.6, 31.2, 0.5)
  };
}

function drawTaperedBone(ctx, x1, y1, x2, y2, r1, r2, cLight, cDark, strokeCol, strokeW, shadowOnly) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  ctx.save();
  ctx.beginPath();
  if (len < 0.5) {
    ctx.arc(x1, y1, r1, 0, Math.PI * 2);
  } else {
    const nx = -dy / len, ny = dx / len;
    const ux = dx / len, uy = dy / len;
    ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
    ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
    ctx.quadraticCurveTo(x2 + ux * r2 * 0.65, y2 + uy * r2 * 0.65, x2 - nx * r2, y2 - ny * r2);
    ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
    ctx.quadraticCurveTo(x1 - ux * r1 * 0.65, y1 - uy * r1 * 0.65, x1 + nx * r1, y1 + ny * r1);
    ctx.closePath();
  }
  if (shadowOnly) {
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    return;
  }
  const g = ctx.createLinearGradient(x1 - 4, y1, x2 + 4, y2);
  g.addColorStop(0, cLight);
  g.addColorStop(1, cDark);
  ctx.fillStyle = g;
  ctx.fill();
  if (strokeW > 0) {
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

function drawLeg3D(ctx, lg, ink, shadowOnly) {
  const [hx, hy] = lg.hip;
  const [kx0, ky0] = lg.knee;
  const [ax, ay] = lg.ankle;
  const sx = kx0 + (ax - kx0) * 0.62;
  const sy = ky0 + (ay - ky0) * 0.62;
  const shinInFront = lg.ankleS < lg.kneeS - 1.0;

  if (shadowOnly) {
    drawTaperedBone(ctx, hx, hy, kx0, ky0, 3.6, 2.9, '#000', '#000', '#000', 0, true);
    drawTaperedBone(ctx, kx0, ky0, ax, ay, 2.8, 2.2, '#000', '#000', '#000', 0, true);
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(ax, ay + 2.2, 4.4, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (shinInFront) {
    drawTaperedBone(ctx, hx, hy, kx0, ky0, 3.6, 2.9, '#eed0b2', '#cfa07d', ink, 1.0, false);
    drawTaperedBone(ctx, kx0, ky0, sx, sy, 2.85, 2.35, '#fde4ca', '#e3b28c', ink, 1.0, false);
  } else {
    const dx1 = kx0 - hx, dy1 = ky0 - hy, l1 = Math.max(0.5, Math.hypot(dx1, dy1));
    const dx2 = sx - kx0, dy2 = sy - ky0, l2 = Math.max(0.5, Math.hypot(dx2, dy2));
    const n1x = -dy1 / l1, n1y = dx1 / l1, n2x = -dy2 / l2, n2y = dx2 / l2;
    let nmx = n1x + n2x, nmy = n1y + n2y;
    const nml = Math.hypot(nmx, nmy);
    if (nml < 0.2) { nmx = n1x; nmy = n1y; } else { nmx /= nml; nmy /= nml; }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hx + n1x * 3.6, hy + n1y * 3.6);
    ctx.lineTo(kx0 + nmx * 2.9, ky0 + nmy * 2.9);
    ctx.lineTo(sx + n2x * 2.35, sy + n2y * 2.35);
    ctx.lineTo(sx - n2x * 2.35, sy - n2y * 2.35);
    ctx.lineTo(kx0 - nmx * 2.9, ky0 - nmy * 2.9);
    ctx.lineTo(hx - n1x * 3.6, hy - n1y * 3.6);
    ctx.closePath();
    const sg = ctx.createLinearGradient(kx0 - 4, ky0, kx0 + 4, ky0 + 2);
    sg.addColorStop(0, '#fde4ca');
    sg.addColorStop(1, '#e1ae88');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.0;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // Crisp white ankle sock cuff matching the Ghibli watercolor boy
  drawTaperedBone(ctx, sx, sy, ax, ay, 2.35, 2.05, '#faf8f2', '#e2ded2', ink, 0.90, false);

  // Authentic elongated Studio Ghibli canvas sneaker (-footPitch points toe down & lifts heel on push-off)
  const lift = lg.soleAmt;
  const shoeRot = -lg.footPitch * 0.68;
  ctx.save();
  ctx.translate(ax, ay + 1.5);
  ctx.rotate(shoeRot);

  const shoeG = ctx.createLinearGradient(-5, -2, 4, 3);
  shoeG.addColorStop(0, '#e2ae44');
  shoeG.addColorStop(1, '#b07a28');
  ctx.fillStyle = shoeG;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(-6.2, 1.2);
  ctx.quadraticCurveTo(-4.8, -1.6, -1.0, -2.4);
  ctx.quadraticCurveTo( 2.6, -2.3,  4.2,  0.4);
  ctx.quadraticCurveTo( 4.4,  2.3,  3.2,  2.5);
  ctx.lineTo(-4.8, 2.5);
  ctx.quadraticCurveTo(-6.4, 2.2, -6.2, 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Subtle cream rubber toe-cap
  ctx.fillStyle = '#f5f0e4';
  ctx.strokeStyle = 'rgba(78, 52, 38, 0.55)';
  ctx.lineWidth = 0.72;
  ctx.beginPath();
  ctx.ellipse(-4.9, 0.9, 1.4, 1.25, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Sleek thin outsole (soft muted warm-stone tone when lifted)
  const soleThick = 1.0 + lift * 1.1;
  ctx.fillStyle = lift > 0.35 ? '#d6ccba' : '#f5f0e4';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.82;
  ctx.beginPath();
  ctx.moveTo(-5.8, 1.7);
  ctx.quadraticCurveTo(-1.0, 2.0, 3.7, 1.7);
  ctx.lineTo(3.5, 1.9 + soleThick);
  ctx.quadraticCurveTo(-1.0, 2.3 + soleThick * 1.1, -5.5, 2.0 + soleThick * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function createKiteBoyController(gl) {
  const actorCanvas = document.createElement('canvas');
  actorCanvas.width = ACTOR_TEX_W;
  actorCanvas.height = ACTOR_TEX_H;
  const actorCtx = actorCanvas.getContext('2d');

  const actorShCanvas = document.createElement('canvas');
  actorShCanvas.width = ACTOR_TEX_W;
  actorShCanvas.height = ACTOR_TEX_H;
  const actorShCtx = actorShCanvas.getContext('2d');

  const makeActorTex = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ACTOR_TEX_W, ACTOR_TEX_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  const actorTex = makeActorTex();
  const actorShadowTex = makeActorTex();

  const boyFrontSpr = loadImg('assets/meadow-boy-front.png', FRONT_RIG);
  const boyBackSpr  = loadImg('assets/meadow-boy-back.png', BACK_RIG);
  const kiteSpr     = loadImg('assets/meadow-kite.png');

  const state = {
    x: 520, y: 460,
    fromX: 520, fromY: 460,
    ctrlX: 520, ctrlY: 460,
    tx: 520, ty: 460,
    dirX: -0.6, dirY: -0.8,
    prevDirX: 0, prevDirY: 0,
    mode: 'idle',
    tripElapsed: 0,
    tripDuration: 3.4,
    tripCycles: 5,
    stateTimer: 3.2,
    tugTimer: 1.6,
    tugAge: -1,
    prevPull: 0,
    kiteOffX: 98, kiteOffY: 92,
    kiteVx: 0, kiteVy: 0,
    kiteReact: { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 },
    initialized: false
  };

  let currentActivity = { back: false, progress: 0, running: false, squeeze: 1, phase: 0, gait: 0, bob: 0, done: false };

  function startRoamingRun({ W, H, sampleSdfB, catPos, pondPos }) {
    const padX = Math.max(115, W * 0.10);
    const padY = Math.max(110, H * 0.12);
    const minStep = Math.min(180, Math.min(W, H) * 0.24);
    const maxStep = Math.min(440, Math.max(W, H) * 0.48);

    const pondClear = (px, py) => {
      if (!pondPos || !pondPos.active) return true;
      const dx = (px - pondPos.x) / Math.max(1, pondPos.rx + 46);
      const dy = (py - pondPos.y) / Math.max(1, pondPos.ry + 46);
      return (dx * dx + dy * dy) >= 1.0;
    };

    let best = null;
    for (let gy = 0; gy < 9; gy++) {
      for (let gx = 0; gx < 14; gx++) {
        const jx = (Math.random() - 0.5) * 42;
        const jy = (Math.random() - 0.5) * 34;
        const x = Math.max(padX, Math.min(W - padX, padX + (gx / 13) * Math.max(40, W - padX * 2) + jx));
        const y = Math.max(padY, Math.min(H - padY, padY + (gy / 8) * Math.max(40, H - padY * 2) + jy));
        const dist = Math.hypot(x - state.x, y - state.y);
        if (dist < minStep || dist > maxStep) continue;

        const sEnd = sampleSdfB(x, y);
        if (sEnd < 48) continue;
        const mx = (state.x + x) * 0.5, my = (state.y + y) * 0.5;
        const sMid = sampleSdfB(mx, my);
        if (sMid < 26) continue;
        if (Math.hypot(x - catPos.x, y - catPos.y) < 130) continue;
        if (!pondClear(x, y) || !pondClear(mx, my)) continue;

        const ux = (x - state.x) / dist, uy = (y - state.y) / dist;
        if (uy > 0.62 && Math.abs(ux) < 0.55) continue;
        const sameDirDot = ux * state.prevDirX + uy * state.prevDirY;
        const score = Math.min(160, sEnd) * 0.010 + Math.min(120, sMid) * 0.008
                    + (1.0 - Math.max(0, sameDirDot)) * 1.15
                    + Math.abs(ux) * 0.35
                    + Math.random() * 1.10;
        if (!best || score > best.score) best = { x, y, ux, uy, dist, score };
      }
    }

    if (!best) {
      const ang = Math.atan2(H * 0.5 - state.y, W * 0.5 - state.x) + (Math.random() - 0.5) * 1.0;
      const d = Math.min(260, Math.min(W, H) * 0.32);
      const fx = Math.max(padX, Math.min(W - padX, state.x + Math.cos(ang) * d));
      const fy = Math.max(padY, Math.min(H - padY, state.y + Math.sin(ang) * d));
      const fd = Math.max(80, Math.hypot(fx - state.x, fy - state.y));
      best = { x: fx, y: fy, ux: (fx - state.x) / fd, uy: (fy - state.y) / fd, dist: fd };
    }

    const sc = Math.max(0.64, Math.min(1.06, Math.min(W, H) / 920));
    state.fromX = state.x;
    state.fromY = state.y;
    state.tx = best.x;
    state.ty = best.y;
    const bend = (Math.random() - 0.5) * Math.min(68, best.dist * 0.22);
    state.ctrlX = Math.max(padX * 0.7, Math.min(W - padX * 0.7, (state.fromX + state.tx) * 0.5 - best.uy * bend));
    state.ctrlY = Math.max(padY * 0.7, Math.min(H - padY * 0.7, (state.fromY + state.ty) * 0.5 + best.ux * bend));
    state.dirX = best.ux;
    state.dirY = best.uy;
    state.prevDirX = best.ux;
    state.prevDirY = best.uy;

    const stridePx = 22.5 * sc;
    const speedPx  = 42.0 * sc;
    state.tripCycles = Math.max(3, Math.round(best.dist / stridePx));
    state.tripDuration = Math.max(2.4, Math.min(7.8, best.dist / speedPx));
    state.tripElapsed = 0;
    state.mode = 'trip';
  }

  function step(dt, ctx) {
    const { showBoy, flow, W, H, sampleSdfB, catPos, pondPos } = ctx;
    if (showBoy < 0.5) return;

    const wind = Math.max(0.25, flow);
    let pullImpulse = 0;

    if (state.mode === 'idle') {
      currentActivity = { back: false, progress: 0, running: false, squeeze: 1, phase: 0, gait: 0, bob: 0, done: false };
      state.stateTimer -= dt;
      state.tugTimer -= dt;
      if (state.tugTimer <= 0) {
        state.tugAge = 0;
        state.tugTimer = 2.4 + Math.random() * 2.8;
      }
      if (state.tugAge >= 0) {
        state.tugAge += dt;
        const tp = computeBoyTugPose(state.tugAge);
        pullImpulse = Math.max(0, tp.pull - state.prevPull);
        state.prevPull = tp.pull;
        if (!tp.active) { state.tugAge = -1; state.prevPull = 0; }
      }
      if (state.stateTimer <= 0) {
        startRoamingRun({ W, H, sampleSdfB, catPos, pondPos });
      }
    } else if (state.mode === 'trip') {
      state.tugAge = -1;
      state.prevPull = 0;
      state.tripElapsed += dt * Math.max(0.65, Math.min(1.12, 0.72 + wind * 0.28));
      const act = computeBoyTripPose(state.tripElapsed, state.tripCycles, state.tripDuration, false, false);
      currentActivity = act;

      const u = act.progress, iu = 1 - u;
      state.x = iu * iu * state.fromX + 2 * iu * u * state.ctrlX + u * u * state.tx;
      state.y = iu * iu * state.fromY + 2 * iu * u * state.ctrlY + u * u * state.ty;

      const tanX = 2 * iu * (state.ctrlX - state.fromX) + 2 * u * (state.tx - state.ctrlX);
      const tanY = 2 * iu * (state.ctrlY - state.fromY) + 2 * u * (state.ty - state.ctrlY);
      const tanL = Math.hypot(tanX, tanY);
      if (tanL > 1.0) {
        state.dirX = tanX / tanL;
        state.dirY = tanY / tanL;
      }

      if (act.done) {
        state.mode = 'idle';
        state.stateTimer = 3.4 + Math.random() * 3.8;
      }
    }

    const isMoving = state.mode === 'trip' && currentActivity.gait > 0.05;
    let tgtKX = 96, tgtKY = 86;
    if (isMoving) {
      const rx = -state.dirX * 106 + 22;
      const ry = -state.dirY * 102 + 20;
      const rl = Math.max(1, Math.hypot(rx, ry));
      const dist = 104 + currentActivity.gait * 14;
      tgtKX = (rx / rl) * dist;
      tgtKY = (ry / rl) * dist;
    }
    const kSpring = isMoving ? 5.8 : 2.6;
    const kDamp   = isMoving ? 3.8 : 2.4;
    state.kiteVx += ((tgtKX - state.kiteOffX) * kSpring - state.kiteVx * kDamp) * dt;
    state.kiteVy += ((tgtKY - state.kiteOffY) * kSpring - state.kiteVy * kDamp) * dt;
    state.kiteOffX += state.kiteVx * dt;
    state.kiteOffY += state.kiteVy * dt;

    const kr = state.kiteReact;
    kr.vx -= 78 * pullImpulse;
    kr.vy -= 92 * pullImpulse;
    kr.spin += 2.4 * pullImpulse;
    kr.vx += (-18 * kr.x - 3.4 * kr.vx) * dt;
    kr.vy += (-22 * kr.y - 4.0 * kr.vy) * dt;
    kr.spin += (-24 * kr.angle - 3.8 * kr.spin) * dt;
    kr.x += kr.vx * dt;
    kr.y += kr.vy * dt;
    kr.angle += kr.spin * dt;
  }

  function renderAndUpload(t, { showBoy, flow, W, H }) {
    if (showBoy < 0.5 || !boyFrontSpr.ready || !boyBackSpr.ready) return null;
    const sc = Math.max(0.64, Math.min(1.06, Math.min(W, H) / 920));
    const wind = Math.max(0.25, flow);
    const act = currentActivity;
    const tug = computeBoyTugPose(state.tugAge);

    const isRunningView = act.back;
    const flipX = isRunningView ? (state.dirX > 0.06 ? -1 : 1) : 1;
    const localDirX = -Math.max(0.32, Math.abs(state.dirX));
    const localDirY = Math.max(-0.88, Math.min(0.45, state.dirY));
    const ldl = Math.hypot(localDirX, localDirY);
    const ldx = localDirX / ldl, ldy = localDirY / ldl;

    const legs = solveChildRunLegs3D(act, ldx, ldy);

    const idleSwayX = act.running ? 0 : Math.sin(t * 0.95) * 1.0 - tug.pull * 1.8;
    const idleSwayY = act.running ? 0 : Math.sin(t * 1.85) * 0.5 - tug.pull * 0.9;
    const bx = 240 + idleSwayX;
    const by = 240 + idleSwayY;
    const bobY = isRunningView ? (-act.bob * 0.88) : 0;
    const sprSize = 90;
    const ink = 'rgba(78, 52, 38, 0.88)';

    const bodyRot = isRunningView
      ? (-0.036 * act.gait + Math.sin(act.phase) * 0.044 * act.gait)
      : (Math.sin(t * 1.05) * 0.018 - tug.pull * 0.048);
    const scaleY = isRunningView ? 1.0 : (0.88 * (1.0 + Math.sin(t * 1.85) * 0.011));

    const rig = isRunningView ? BACK_RIG : FRONT_RIG;
    const spr = isRunningView ? boyBackSpr : boyFrontSpr;
    const armPose = computeBoyArmPose(t, wind, act, tug, isRunningView);

    // Transform wooden star spool center through right-arm shoulder pivot + rotation + shoulder heave
    // so the kite string stays 100% locked onto the moving spool at every frame
    const [spX, spY] = rig.spool;
    const [pvX, pvY] = rig.right.pivot;
    const cosA = Math.cos(armPose.rightAngle), sinA = Math.sin(armPose.rightAngle);
    const relSpX = spX - pvX, relSpY = spY - pvY;
    const animSpX = pvX + armPose.rightDx + (relSpX * cosA - relSpY * sinA);
    const animSpY = pvY + armPose.rightDy + (relSpX * sinA + relSpY * cosA);
    const sprW = spr.parts?.w || 256;
    const sprH = spr.parts?.h || 256;

    const spLocX = (animSpX / sprW - 0.5) * sprSize;
    const spLocY = (animSpY / sprH - 0.5) * sprSize;
    const cosR = Math.cos(bodyRot), sinR = Math.sin(bodyRot);
    const handWorldX = bx + (spLocX * cosR - spLocY * sinR) * flipX * act.squeeze;
    const handWorldY = by + (bobY + (spLocX * sinR + spLocY * cosR)) * scaleY;

    const kr = state.kiteReact;
    const kx = bx + state.kiteOffX + Math.sin(t * 1.55 * wind) * 9 + kr.x * 0.30;
    const ky = by + state.kiteOffY + Math.cos(t * 1.95 * wind) * 7 + kr.y * 0.30;
    const kdx = kx - handWorldX, kdy = ky - handWorldY;
    const kdLen = Math.max(1, Math.hypot(kdx, kdy));
    const tux = kdx / kdLen, tuy = kdy / kdLen;
    const kiteTilt = Math.atan2(-tux, tuy) + Math.sin(t * 2.1 * wind) * 0.08 + kr.angle * 0.22;

    const drawRotatedArm = (ctx, armCanvas, pivot, angle, dx, dy) => {
      const px = (pivot[0] / sprW - 0.5) * sprSize;
      const py = (pivot[1] / sprH - 0.5) * sprSize;
      const ox = (dx / sprW) * sprSize;
      const oy = (dy / sprH) * sprSize;
      ctx.save();
      ctx.translate(px + ox, py + oy);
      ctx.rotate(angle);
      ctx.translate(-px, -py);
      ctx.drawImage(armCanvas, -sprSize * 0.5, -sprSize * 0.5, sprSize, sprSize);
      ctx.restore();
    };

    const drawArticulatedBody = (ctx) => {
      if (spr.parts) {
        drawRotatedArm(ctx, spr.parts.leftArm, rig.left.pivot, armPose.leftAngle, 0, 0);
        drawRotatedArm(ctx, spr.parts.rightArm, rig.right.pivot, armPose.rightAngle, armPose.rightDx, armPose.rightDy);
        ctx.drawImage(spr.parts.torso, -sprSize * 0.5, -sprSize * 0.5, sprSize, sprSize);
      } else {
        ctx.drawImage(spr.img, -sprSize * 0.5, -sprSize * 0.5, sprSize, sprSize);
      }
    };

    const drawGhibliBoy = (ctx, shadowOnly) => {
      ctx.save();
      ctx.scale(flipX * act.squeeze, scaleY);
      if (isRunningView) {
        drawLeg3D(ctx, legs.left, ink, shadowOnly);
        drawLeg3D(ctx, legs.right, ink, shadowOnly);
        ctx.translate(0, bobY);
        ctx.rotate(bodyRot);
        drawArticulatedBody(ctx);
      } else {
        ctx.rotate(bodyRot);
        drawArticulatedBody(ctx);
      }
      ctx.restore();
    };

    const drawThreeRibbons = (ctx, startX, startY, dirX, dirY, shadowOnly) => {
      const colors = ['#d95645', '#e5b94c', '#4a8ea8'];
      const gustScale = (0.95 + act.gait * 1.2) * wind;
      const rockAmp = Math.abs(kr.angle) * 5.0;
      const pxN = -dirY, pyN = dirX;
      for (let r = 0; r < 3; r++) {
        const off = (r - 1) * 3.1;
        ctx.save();
        ctx.strokeStyle = shadowOnly ? '#000' : colors[r];
        ctx.lineWidth = shadowOnly ? 2.4 : 2.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          const wave = Math.sin(u * 5.2 - t * (4.0 + act.gait * 3.0) * Math.max(0.4, wind) + r * 0.35) * (5.8 * gustScale + rockAmp) * u;
          const along = u * 62;
          const px = startX + dirX * along + pxN * (off + wave);
          const py = startY + dirY * along + pyN * (off + wave);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }
    };

    // 1. Paint Actor RGBA
    actorCtx.clearRect(0, 0, ACTOR_TEX_W, ACTOR_TEX_H);
    const sag = (12 - act.gait * 6 - tug.pull * 7);
    actorCtx.save();
    actorCtx.strokeStyle = 'rgba(248, 246, 232, 0.78)';
    actorCtx.lineWidth = 1.2;
    actorCtx.beginPath();
    actorCtx.moveTo(handWorldX, handWorldY);
    actorCtx.quadraticCurveTo((handWorldX + kx) * 0.5, (handWorldY + ky) * 0.5 + sag, kx, ky);
    actorCtx.stroke();
    actorCtx.restore();

    actorCtx.save();
    actorCtx.translate(bx, by);
    drawGhibliBoy(actorCtx, false);
    actorCtx.restore();

    const kiteSize = 58;
    const tailRootX = kx + Math.sin(-kiteTilt) * 21;
    const tailRootY = ky + Math.cos(-kiteTilt) * 21;
    drawThreeRibbons(actorCtx, tailRootX, tailRootY, tux, tuy, false);

    if (kiteSpr.ready) {
      actorCtx.save();
      actorCtx.translate(kx, ky);
      actorCtx.rotate(kiteTilt);
      actorCtx.drawImage(kiteSpr.img, -kiteSize * 0.5, -kiteSize * 0.5, kiteSize, kiteSize);
      actorCtx.restore();
    }

    // 2. Paint Ground-Anchored Shadow Alpha
    actorShCtx.clearRect(0, 0, ACTOR_TEX_W, ACTOR_TEX_H);
    const footLocalY = isRunningView ? 33.5 : (sprSize * 0.445 * scaleY);
    const footBaseY = by + footLocalY;
    actorShCtx.save();
    actorShCtx.translate(bx + 1.5, footBaseY);
    actorShCtx.transform(0.92, 0.08, -0.44, -0.68, 0, 0);
    actorShCtx.translate(0, -footLocalY);
    drawGhibliBoy(actorShCtx, true);
    actorShCtx.restore();

    actorShCtx.save();
    actorShCtx.translate(bx, by);
    actorShCtx.scale(flipX * act.squeeze, 1);
    if (isRunningView) {
      for (const lg of [legs.left, legs.right]) {
        const groundY = lg.ankle[1] + lg.footZ * 0.88 + 3.4;
        const alpha = Math.max(0.18, 0.80 * (1 - lg.footZ / 13));
        actorShCtx.globalAlpha = alpha;
        actorShCtx.fillStyle = '#000';
        actorShCtx.beginPath();
        actorShCtx.ellipse(lg.ankle[0], groundY, 4.6, 2.0, 0, 0, Math.PI * 2);
        actorShCtx.fill();
      }
    } else {
      actorShCtx.globalAlpha = 0.62;
      actorShCtx.fillStyle = '#000';
      actorShCtx.beginPath();
      actorShCtx.ellipse(0, footLocalY + 1, 11, 3.2, 0, 0, Math.PI * 2);
      actorShCtx.fill();
    }
    actorShCtx.restore();

    const kShX = kx + 38;
    const kShY = ky + 48;
    const tShX = tailRootX + 38;
    const tShY = tailRootY + 48;
    actorShCtx.save();
    actorShCtx.globalAlpha = 0.90;
    drawThreeRibbons(actorShCtx, tShX, tShY, tux, tuy, true);
    if (kiteSpr.ready) {
      actorShCtx.translate(kShX, kShY);
      actorShCtx.rotate(kiteTilt);
      actorShCtx.drawImage(kiteSpr.img, -27, -27, 54, 54);
    }
    actorShCtx.restore();

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, actorTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, actorCanvas);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, actorShadowTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, actorShCanvas);

    const outW = ACTOR_TEX_W * 0.74 * sc;
    const outH = ACTOR_TEX_H * 0.74 * sc;
    return [
      state.x - (bx / ACTOR_TEX_W) * outW,
      state.y - (by / ACTOR_TEX_H) * outH,
      outW,
      outH
    ];
  }

  return {
    state,
    actorTex,
    actorShadowTex,
    startRoamingRun,
    step,
    renderAndUpload,
    isHighMotion: () => state.mode !== 'idle' || state.tugAge >= 0 || Math.abs(state.kiteReact.vx) > 0.4
  };
}
