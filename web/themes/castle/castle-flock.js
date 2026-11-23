/**
 * Alpine Cottage, Hand-Painted Ghibli Shepherd & Articulated Sheep Flock Controller
 * - 100% hand-painted Studio Ghibli watercolor sprites (ZERO vector ovals!)
 * - Runtime leg-separated sheep torso + 4-beat quadruped articulated leg gait synced
 *   directly to actual ground displacement (ZERO ice-skating / frozen sliding legs!)
 * - Firmly planted grazing & standing poses with natural nibble nods
 * - Wind-swept cottage grass/flowers + foreground botanical tufts & drifting petals/leaves
 */
import { ridgeYAt } from './castle-walker.js';
import { createSmokePlume } from './castle-smoke.js';

function loadSprite(src, onReady, onLoadExtra) {
  const s = { img: new Image(), ready: false, body: null };
  s.img.onload = () => {
    if (onLoadExtra) s.body = onLoadExtra(s.img);
    s.ready = true;
    onReady?.();
  };
  s.img.src = src;
  return s;
}

/**
 * Extracts a spotless legless watercolor wool torso from assets/castle-sheep-walk.png (128x96)
 * by flood-filling upward from the 4 dark hooves strictly through dark leg pixels (lum < 146)
 * below the wool belly (y >= 64). Preserves 100% of the hand-inked fluffy wool underside!
 */
function buildLeglessSheepBody(img) {
  const w = img.naturalWidth || 128;
  const h = img.naturalHeight || 96;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);

  const imgData = cx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const visited = new Uint8Array(w * h);
  const qx = new Int16Array(w * h);
  const qy = new Int16Array(w * h);
  let head = 0, tail = 0;

  const minLegY = Math.round(h * 0.675); // ~65px — safely below wool torso & dark face
  const seedY   = Math.round(h * 0.79);  // ~76px — pure leg/hoof zone

  // Seed flood-fill from all opaque pixels in the lower leg/hoof zone
  for (let y = seedY; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (d[idx * 4 + 3] > 16) {
        visited[idx] = 1;
        qx[tail] = x;
        qy[tail] = y;
        tail++;
      }
    }
  }

  // Climb upward ONLY through connected dark charcoal leg pixels (stop at pale wool lum >= 146!)
  while (head < tail) {
    const x = qx[head], y = qy[head];
    head++;
    const idx = y * w + x;
    d[idx * 4 + 3] = 0;

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let k = 0; k < 4; k++) {
      const nx = x + dirs[k][0];
      const ny = y + dirs[k][1];
      if (nx < 0 || nx >= w || ny < minLegY || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (visited[nIdx]) continue;
      const p4 = nIdx * 4;
      const a = d[p4 + 3];
      if (a <= 12) continue;
      const lum = 0.299 * d[p4] + 0.587 * d[p4 + 1] + 0.114 * d[p4 + 2];
      // Erase dark leg pixels & any lower anti-aliased hoof fringe below seedY
      if (lum < 146 || ny >= seedY) {
        visited[nIdx] = 1;
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      }
    }
  }

  // Feather 1px anti-aliased fringe along erased leg stubs below wool belly
  for (let y = minLegY + 2; y < h; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const p4 = idx * 4;
      if (d[p4 + 3] === 0) continue;
      const lum = 0.299 * d[p4] + 0.587 * d[p4 + 1] + 0.114 * d[p4 + 2];
      if (lum < 138 && (visited[idx + w] || visited[idx - 1] || visited[idx + 1])) {
        d[p4 + 3] = Math.round(d[p4 + 3] * 0.25);
      }
    }
  }

  // Keep only the main connected wool torso component (eliminates any tiny detached leg/belly specks!)
  const keep = new Uint8Array(w * h);
  let kHead = 0, kTail = 0;
  const cx0 = w >> 1, cy0 = Math.round(h * 0.42);
  if (d[(cy0 * w + cx0) * 4 + 3] > 20) {
    keep[cy0 * w + cx0] = 1;
    qx[kTail] = cx0;
    qy[kTail] = cy0;
    kTail++;
    while (kHead < kTail) {
      const x = qx[kHead], y = qy[kHead];
      kHead++;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let k = 0; k < 4; k++) {
        const nx = x + dirs[k][0], ny = y + dirs[k][1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nIdx = ny * w + nx;
        if (keep[nIdx] || d[nIdx * 4 + 3] <= 12) continue;
        keep[nIdx] = 1;
        qx[kTail] = nx;
        qy[kTail] = ny;
        kTail++;
      }
    }
    for (let i = 0; i < w * h; i++) {
      if (!keep[i]) d[i * 4 + 3] = 0;
    }
  }

  cx.putImageData(imgData, 0, 0);
  return c;
}

// 4-beat natural sheep lateral walking gait sockets in sprite UV (128x96, facing RIGHT +x)
const SHEEP_LEGS = [
  { u: 0.22, v: 0.70, phase: 0.00, far: true,  hind: true  }, // Far-hind  (LH)
  { u: 0.60, v: 0.71, phase: 0.25, far: true,  hind: false }, // Far-front (LF)
  { u: 0.34, v: 0.71, phase: 0.50, far: false, hind: true  }, // Near-hind (RH)
  { u: 0.69, v: 0.72, phase: 0.75, far: false, hind: false }  // Near-front (RF)
];

// Overlay band strictly covers lower hillside (y = 0.38*H .. 1.0*H -> 4.5x less GPU upload per frame!)
export const FIELD_BAND_TOP = 0.38;
export const FIELD_BAND_H = 1.0 - FIELD_BAND_TOP;

// Pre-baked soft warm candlelight halo (avoids per-frame createRadialGradient allocation)
function createWindowGlowCanvas() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const cx = c.getContext('2d');
  const g = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255, 206, 102, 0.52)');
  g.addColorStop(1, 'rgba(255, 180, 80, 0.0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, 64, 64);
  return c;
}

export function createAlpineFlock(gl, onReady) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 335;
  const ctx = canvas.getContext('2d');
  const windowGlowSpr = createWindowGlowCanvas();
  const drawList = [];

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const cottageSpr     = loadSprite('assets/castle-cottage.png', onReady);
  const shepherdSpr    = loadSprite('assets/castle-shepherd.png', onReady);
  const shepherdArmSpr = loadSprite('assets/castle-shepherd-arm.png', onReady);
  const sheepGraze     = loadSprite('assets/castle-sheep-graze.png', onReady); // natural facing LEFT (-1)
  const sheepStand     = loadSprite('assets/castle-sheep-stand.png', onReady); // natural facing LEFT (-1)
  const sheepWalk      = loadSprite('assets/castle-sheep-walk.png', onReady, buildLeglessSheepBody); // natural facing RIGHT (+1)

  const cottage = { x: 260, y: 520, w: 236, h: 148, active: true, initialized: false, gustSmooth: 0.25 };
  const cottageSmoke = createSmokePlume({
    kind: 'hearth',
    spawnRate: 0.062,
    life: 3.1,
    r0: 4.4,
    rGrow: 18.5,
    jetVx: 1.5,
    jetVy: -22.0,
    windVx: 32.0,
    windVy: -10.0,
    windDrag: 1.45,
    curlAmp: 9.5,
    curlFreq: 1.65,
    opacity: 0.34
  });

  function getCottageChimneyMouth() {
    return {
      x: cottage.x + (0.533 - 0.5) * cottage.w,
      y: cottage.y - cottage.h * 0.855 + 0.062 * cottage.h
    };
  }

  const shepherd = {
    x: 680, y: 620,
    vx: 0, vy: 0,
    tx: 680, ty: 620,
    facing: 1,
    moveBlend: 0,
    walkCycle: 0,
    walkPhase: 0,
    swayPhase: 0,
    gustSmooth: 0.25,
    waitTimer: 5.0,
    initialized: false
  };
  const sheep = [];

  function resize(W, H) {
    // Strictly allocate ONLY the lower hillside band (0.38*H..H) capped at 800px wide (~0.9MB vs 8.3MB!)
    const scale = Math.min(1.0, 800 / Math.max(1, W));
    const nw = Math.max(320, Math.round(W * scale));
    const nh = Math.max(120, Math.round(H * FIELD_BAND_H * scale));
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw;
      canvas.height = nh;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  function findHillsideSpot(W, H, sampleSdf, minSdf, preferNorm, avoidList = []) {
    let best = { x: W * preferNorm[0], y: H * preferNorm[1], score: -999, found: false };
    const padX = Math.max(95, W * 0.08);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 14; gx++) {
        const x = padX + (gx / 13) * Math.max(40, W - padX * 2);
        const rY = ridgeYAt(x / Math.max(1, W), H);
        const minY = rY + Math.max(58, H * 0.10);
        const maxY = H - Math.max(40, H * 0.06);
        if (minY >= maxY) continue;
        const y = minY + (gy / 7) * (maxY - minY);
        const s = sampleSdf(x, y);
        if (s < minSdf) continue;

        let blocked = false;
        for (const av of avoidList) {
          if (Math.hypot(x - av.x, y - av.y) < av.minDist) { blocked = true; break; }
        }
        if (blocked) continue;

        const score = Math.min(160, s) * 0.011
                    + (1 - Math.hypot(x / W - preferNorm[0], y / H - preferNorm[1])) * 1.3;
        if (score > best.score) best = { x, y, score, found: true };
      }
    }
    return best;
  }

  function relocate(W, H, sampleSdf, snap = false) {
    const sc = Math.max(0.58, Math.min(1.12, Math.min(W, H) / 900));
    cottage.w = 248 * sc;
    cottage.h = 155 * sc;

    const curCotSdf = cottage.initialized ? sampleSdf(cottage.x, cottage.y) : -999;
    const minCotY = ridgeYAt(cottage.x / Math.max(1, W), H) + 52 * sc;
    if (!cottage.initialized || snap || curCotSdf < 50 || cottage.y < minCotY) {
      const spot = findHillsideSpot(W, H, sampleSdf, 55, [0.27, 0.72]);
      const moved = Math.hypot(spot.x - cottage.x, spot.y - cottage.y) > 24;
      cottage.x = spot.x;
      cottage.y = spot.y;
      cottage.active = true;
      cottage.initialized = true;
      if (moved) cottageSmoke.reset();
    }

    const avoidCot = [{ x: cottage.x, y: cottage.y, minDist: cottage.w * 0.68 }];
    const curShSdf = shepherd.initialized ? sampleSdf(shepherd.x, shepherd.y) : -999;
    if (!shepherd.initialized || snap || curShSdf < 38 || Math.hypot(shepherd.x - cottage.x, shepherd.y - cottage.y) < cottage.w * 0.55) {
      const spot = findHillsideSpot(W, H, sampleSdf, 45, [0.64, 0.80], avoidCot);
      shepherd.x = shepherd.tx = spot.x;
      shepherd.y = shepherd.ty = spot.y;
      shepherd.vx = 0;
      shepherd.vy = 0;
      shepherd.moveBlend = 0;
      shepherd.initialized = true;
    }
  }

  function syncSheepCount(want, W, H, sampleSdf) {
    const target = Math.max(0, Math.min(36, Math.round(want)));
    while (sheep.length > target) sheep.pop();
    while (sheep.length < target) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 125;
      const x = Math.max(45, Math.min(W - 45, shepherd.x + Math.cos(ang) * dist));
      const minY = ridgeYAt(x / Math.max(1, W), H) + 42;
      const y = Math.max(minY, Math.min(H - 28, shepherd.y + Math.sin(ang) * dist * 0.48));
      const rPose = Math.random();
      const mode = rPose < 0.58 ? 'graze' : (rPose < 0.82 ? 'stand' : 'walk');
      sheep.push({
        x, y,
        vx: 0, vy: 0,
        facing: Math.random() < 0.5 ? -1 : 1,
        size: 0.84 + Math.random() * 0.30,
        walkCycle: Math.random(),
        walkBlend: mode === 'walk' ? 1 : 0,
        idlePhase: Math.random() * Math.PI * 2,
        wanderAng: Math.random() * Math.PI * 2,
        mode,
        timer: 2.2 + Math.random() * 5.5
      });
    }
    for (const sh of sheep) {
      if (sampleSdf(sh.x, sh.y) < 12) {
        sh.x = Math.max(45, Math.min(W - 45, shepherd.x + (Math.random() - 0.5) * 95));
        sh.y = Math.max(ridgeYAt(sh.x / Math.max(1, W), H) + 42, Math.min(H - 28, shepherd.y + (Math.random() - 0.5) * 45));
      }
    }
  }

  function step(dt, { W, H, flow, gust = 0.4, breeze = null, sheepCount, sampleSdf, sampleGrad }) {
    const sc = Math.max(0.58, Math.min(1.12, Math.min(W, H) / 900));
    const wind = Math.max(0.15, flow) * (0.78 + gust * 0.65);
    syncSheepCount(sheepCount, W, H, sampleSdf);

    // 1. Tier-2 local wind at the prairie cottage (smoke & base grass bow RIGHT as wind tier arrives!)
    const cotTargetGust = breeze ? breeze.sampleAt(cottage.x / Math.max(1, W), cottage.y, W, H) : gust;
    const cotRate = cotTargetGust > cottage.gustSmooth ? 5.2 : 2.5;
    cottage.gustSmooth += (cotTargetGust - cottage.gustSmooth) * Math.min(1, dt * cotRate);

    if (cottage.active) {
      const m = getCottageChimneyMouth();
      cottageSmoke.step(dt, m.x, m.y, { wind: Math.max(0.15, flow), gust: cottage.gustSmooth, sc, active: true });
    }

    // 2. Shepherd leisurely strolling with buttery-smooth acceleration, deceleration & wind sway
    const dxS = shepherd.tx - shepherd.x;
    const dyS = shepherd.ty - shepherd.y;
    const distS = Math.hypot(dxS, dyS);
    let tvx = 0, tvy = 0;
    if (distS > 4) {
      // Smooth ease-out slowdown as shepherd approaches destination (no abrupt stop!)
      const desiredSpd = Math.min(20 * sc, distS * 0.72);
      tvx = (dxS / distS) * desiredSpd;
      tvy = (dyS / distS) * desiredSpd;
    } else {
      shepherd.waitTimer -= dt;
      if (shepherd.waitTimer <= 0) {
        shepherd.waitTimer = 7.0 + Math.random() * 8.0;
        const avoidCot = [{ x: cottage.x, y: cottage.y, minDist: cottage.w * 0.65 }];
        const target = findHillsideSpot(
          W, H, sampleSdf, 45,
          [0.42 + Math.random() * 0.44, 0.72 + Math.random() * 0.18],
          avoidCot
        );
        if (target.found) {
          shepherd.tx = target.x;
          shepherd.ty = target.y;
        }
      }
    }
    const steerK = Math.min(1, dt * 4.5);
    shepherd.vx += (tvx - shepherd.vx) * steerK;
    shepherd.vy += (tvy - shepherd.vy) * steerK;
    const prevShX = shepherd.x, prevShY = shepherd.y;
    shepherd.x += shepherd.vx * dt;
    shepherd.y += shepherd.vy * dt;
    const shDist = Math.hypot(shepherd.x - prevShX, shepherd.y - prevShY);

    const shSpd = Math.hypot(shepherd.vx, shepherd.vy);
    if (Math.abs(shepherd.vx) > 2.2 * sc) shepherd.facing = shepherd.vx > 0 ? 1 : -1;
    const targetMove = Math.min(1, shSpd / Math.max(4, 10 * sc));
    shepherd.moveBlend += (targetMove - shepherd.moveBlend) * Math.min(1, dt * 6.0);
    // Exact ground-locked bipedal stride cycle: strideAmp(8.4) / STANCE(0.58) = 14.5*sc -> ZERO foot-slip!
    const shStrideGroundLen = 14.5 * sc;
    if (shDist > 0.0005) {
      shepherd.walkCycle = (shepherd.walkCycle + shDist / Math.max(6, shStrideGroundLen)) % 1;
    }
    shepherd.walkPhase = shepherd.walkCycle * Math.PI * 2;
    // Tier-3 local wind at shepherd position (cloak sways right as the wind layer reaches the flock!)
    const shTargetGust = breeze ? breeze.sampleAt(shepherd.x / Math.max(1, W), shepherd.y, W, H) : gust;
    const shRate = shTargetGust > shepherd.gustSmooth ? 5.0 : 2.5;
    shepherd.gustSmooth += (shTargetGust - shepherd.gustSmooth) * Math.min(1, dt * shRate);
    // Strictly monotonic wind sway phase (NEVER t * variable -> zero phase-whip jitter!)
    shepherd.swayPhase += dt * (1.25 + shepherd.gustSmooth * 0.80) * Math.min(1.4, wind);

    // 3. Autonomous grazing sheep flock (ZERO sliding: stationary graze/stand, stride-synced walk!)
    for (let i = 0; i < sheep.length; i++) {
      const sh = sheep[i];
      sh.timer -= dt;
      if (sh.timer <= 0) {
        const r = Math.random();
        sh.mode = r < 0.56 ? 'graze' : (r < 0.78 ? 'stand' : 'walk');
        sh.timer = sh.mode === 'walk' ? (2.0 + Math.random() * 2.8) : (3.4 + Math.random() * 5.8);
        if (sh.mode === 'walk') sh.wanderAng = Math.random() * Math.PI * 2;
      }

      let fx = 0, fy = 0;
      const toShX = shepherd.x - sh.x;
      const toShY = (shepherd.y + 18 * sc) - sh.y;
      const dSh = Math.hypot(toShX, toShY * 1.85);
      if (dSh > 122 * sc) {
        fx += (toShX / Math.max(1, dSh)) * 22;
        fy += (toShY / Math.max(1, dSh)) * 13;
        if (dSh > 175 * sc) sh.mode = 'walk';
      } else if (sh.mode === 'walk') {
        fx += Math.cos(sh.wanderAng) * 14;
        fy += Math.sin(sh.wanderAng) * 6;
      }

      let pushMag = 0;
      for (let j = 0; j < sheep.length; j++) {
        if (i === j) continue;
        const o = sheep[j];
        const rx = sh.x - o.x, ry = (sh.y - o.y) * 1.75;
        const rd = Math.hypot(rx, ry);
        const minGap = 27 * sc;
        if (rd > 0.5 && rd < minGap) {
          const push = (minGap - rd) / minGap;
          fx += (rx / rd) * push * 36;
          fy += ((sh.y - o.y) / rd) * push * 22;
          pushMag += push * 18;
        }
      }

      const sIcon = sampleSdf(sh.x, sh.y);
      if (sIcon < 36) {
        const g = sampleGrad(sh.x, sh.y);
        const push = (36 - sIcon) / 36;
        fx += g.x * push * 72;
        fy += g.y * push * 72;
        pushMag += push * 40;
      }

      if (cottage.active) {
        const cx = (sh.x - cottage.x) / (cottage.w * 0.56);
        const cy = (sh.y - (cottage.y - cottage.h * 0.25)) / (cottage.h * 0.42);
        const cd = Math.hypot(cx, cy);
        if (cd < 1.16 && cd > 0.01) {
          fx += (cx / cd) * (1.16 - cd) * 65;
          fy += (cy / cd) * (1.16 - cd) * 45;
          pushMag += 30;
        }
      }

      const minY = ridgeYAt(sh.x / Math.max(1, W), H) + 38 * sc;
      if (sh.y < minY + 18) { fy += (minY + 18 - sh.y) * 2.4; pushMag += 20; }
      if (sh.y > H - 28)    { fy -= (sh.y - (H - 28)) * 2.4; pushMag += 20; }
      if (sh.x < 36)        { fx += (36 - sh.x) * 2.0; pushMag += 20; }
      if (sh.x > W - 36)    { fx -= (sh.x - (W - 36)) * 2.0; pushMag += 20; }

      // If strongly nudged while grazing/standing, switch to walking so its legs step naturally!
      if (sh.mode !== 'walk' && pushMag > 11) {
        sh.mode = 'walk';
        sh.timer = 1.6 + Math.random() * 1.4;
      }

      const isWalking = sh.mode === 'walk';
      if (isWalking) {
        sh.vx += (fx - sh.vx * 2.4) * dt;
        sh.vy += (fy - sh.vy * 2.4) * dt;
        const maxSpd = 21 * sc;
        const curSpd = Math.hypot(sh.vx, sh.vy);
        if (curSpd > maxSpd) {
          sh.vx = (sh.vx / curSpd) * maxSpd;
          sh.vy = (sh.vy / curSpd) * maxSpd;
        }
      } else {
        // Firmly planted hooves while grazing or standing — ZERO sideways sliding!
        const brake = Math.max(0, 1 - dt * 11.0);
        sh.vx *= brake;
        sh.vy *= brake;
        if (Math.hypot(sh.vx, sh.vy) < 0.8) { sh.vx = 0; sh.vy = 0; }
      }

      const prevX = sh.x, prevY = sh.y;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      const distMoved = Math.hypot(sh.x - prevX, sh.y - prevY);
      const curSpd = Math.hypot(sh.vx, sh.vy);

      if (Math.abs(sh.vx) > 2.2) sh.facing = sh.vx > 0 ? 1 : -1;

      // Sync quadruped stride cycle EXACTLY to ground distance covered (zero ice-skating!)
      const strideGroundLen = 14.5 * sh.size * sc;
      if (distMoved > 0.001) {
        sh.walkCycle = (sh.walkCycle + distMoved / Math.max(6, strideGroundLen)) % 1;
      }

      const wantWalk = (isWalking || curSpd > 2.4 * sc) ? 1 : 0;
      sh.walkBlend += (wantWalk - sh.walkBlend) * Math.min(1, dt * 7.5);
      sh.idlePhase += dt * 1.9;
    }
  }

  /** Draws lush painterly meadow grass tufts & soft moss grounding the cottage foot organically into the hill */
  function drawCottageBaseTufts(x, y, w, sc, t, gust) {
    ctx.save();
    // Soft mossy soil transition tucked right along the cottage stone wall & stucco base
    ctx.fillStyle = 'rgba(54, 82, 34, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x + 2 * sc, y + 0.8 * sc, w * 0.44, 3.6 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    const windBend = (1.4 + gust * 4.2) * sc;
    for (let i = -8; i <= 8; i++) {
      const frac = i / 8.5;
      const tx = x + frac * w * 0.44;
      const ty = y + (Math.sin(i * 2.1) * 1.8 - (i < -3 ? 0.8 : 0)) * sc;
      const sway = windBend + Math.sin(t * 3.1 + i * 1.15) * (0.9 + gust * 1.3) * sc;
      for (let b = -1; b <= 1; b++) {
        const bx = tx + b * 2.1 * sc;
        const h = (4.2 + ((i * 3 + b * 5 + 16) % 3) * 1.9) * sc;
        ctx.strokeStyle = b === 0 ? '#4d7c30' : ((i + b) & 1 ? '#365f26' : '#6f9c3b');
        ctx.lineWidth = Math.max(0.95, (b === 0 ? 1.55 : 1.15) * sc);
        ctx.beginPath();
        ctx.moveTo(bx, ty + 1.8 * sc);
        ctx.quadraticCurveTo(bx + sway * 0.38, ty - h * 0.55, bx + b * 2.5 * sc + sway, ty - h);
        ctx.stroke();
      }
      if (i === -7 || i === -3 || i === 2 || i === 6) {
        ctx.fillStyle = (i & 1) ? '#faf4e2' : '#f4d35c';
        ctx.beginPath();
        ctx.arc(tx + sway * 0.85, ty - 5.4 * sc, 1.35 * sc, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function shadowFillStyle(sunset, night, baseAlpha = 0.28) {
    // Cool violet-plum shadows at sunset, deep moon-indigo at night, verdant shade in daytime
    const r = Math.round(24 + sunset * 16 - night * 12);
    const g = Math.round(48 - sunset * 18 - night * 26);
    const b = Math.round(22 + sunset * 36 + night * 24);
    const a = (baseAlpha + sunset * 0.07 + night * 0.04).toFixed(3);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /** Draws a softly tapered painterly limb segment with delicate warm-umber gouache contour */
  function drawTaperedLimb(x1, y1, x2, y2, r1, r2, fill, stroke, strokeW) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
    ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
    ctx.lineTo(x2 - nx * r2, y2 - ny * r2);
    ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x1, y1, r1 * 0.92, 0, Math.PI * 2);
    ctx.arc(x2, y2, r2 * 0.92, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draws one anatomically proportioned 2-bone human leg + tapered walnut leather boot beneath the cloak
   * (tall straight weight-bearing stance leg, relaxed low grass-skimming swing, 100% symmetric stride!).
   */
  function drawShepherdLeg(hipX, hipY, walkCycle, phaseOff, far, strideBlend, w, h, sc) {
    const u = ((walkCycle + phaseOff) % 1 + 1) % 1;
    const STANCE = 0.58;
    const strideAmp = 8.4 * sc * strideBlend;
    const liftAmp   = 2.35 * sc * strideBlend;

    let stepX = 0;
    let footLift = 0;
    let bootTilt = 0;
    if (u < STANCE) {
      // Stance phase: boot sole stays flat & planted on grass; subtle heel-strike -> flat -> gentle toe push-off
      const sU = u / STANCE;
      stepX = strideAmp * (0.5 - sU);
      footLift = 0;
      if (sU < 0.14) {
        bootTilt = -((0.14 - sU) / 0.14) * 0.14 * strideBlend;
      } else if (sU > 0.80) {
        bootTilt = ((sU - 0.80) / 0.20) * 0.22 * strideBlend;
      }
    } else {
      // Swing phase: relaxed low meadow stroll (~2.3px clearance, NEVER high-knee marching!)
      const t = (u - STANCE) / (1 - STANCE);
      const ease = t * t * (3 - 2 * t);
      stepX = strideAmp * (-0.5 + ease);
      footLift = Math.sin(Math.PI * t) * liftAmp;
      bootTilt = (0.18 * (1 - t) - 0.12 * t) * Math.sin(Math.PI * t) * strideBlend;
    }

    // Blend standing side-by-side rest offset out while walking so left & right steps are 100% symmetric (zero limp!)
    const standOff = far ? -w * 0.055 : w * 0.052;
    const walkOff  = far ? -w * 0.012 : w * 0.012;
    const ankleX = standOff * (1 - strideBlend) + walkOff * strideBlend + stepX;
    const ankleY = -1.65 * sc - footLift;

    // True anatomical human leg proportions from hip (-0.415*h inside cloak) -> knee -> ankle
    // Keeps planted weight-bearing leg tall & straight instead of crouching/squatting!
    const L1 = h * 0.214;
    const L2 = h * 0.206;
    const dx = ankleX - hipX;
    const dy = ankleY - hipY;
    const raw = Math.hypot(dx, dy);
    const dist = Math.max(4.0 * sc, Math.min(L1 + L2 - 0.15 * sc, raw));
    const ux = dx / Math.max(0.001, raw);
    const uy = dy / Math.max(0.001, raw);
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const bend = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const kx = hipX + ux * along + uy * bend; // human knee flexes gently forward (+x)
    const ky = hipY + uy * along - ux * bend;

    const trouserCol = far ? '#4c5046' : '#626558';
    const bootCol    = far ? '#422e23' : '#5c4130';
    const bootHi     = '#7a5a44';
    const inkCol     = '#34261e';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Tapered olive-taupe trouser thigh tucked beneath draping cloak
    drawTaperedLimb(hipX, hipY, kx, ky, 2.2 * sc, 1.85 * sc, trouserCol, inkCol, 0.72 * sc);

    // 2. Tapered walnut leather boot shaft (full calf -> slender ankle, matches gouache cloak!)
    drawTaperedLimb(kx, ky, ankleX, ankleY, 1.78 * sc, 1.26 * sc, bootCol, inkCol, 0.72 * sc);
    if (!far) {
      ctx.strokeStyle = bootHi;
      ctx.lineWidth = 0.85 * sc;
      ctx.beginPath();
      ctx.moveTo(kx + 0.45 * sc, ky + 1.2 * sc);
      ctx.lineTo(ankleX + 0.35 * sc, ankleY - 0.8 * sc);
      ctx.stroke();
    }

    // 3. Sculpted leather boot foot & low heel pivoting smoothly with ankle stride
    ctx.translate(ankleX, ankleY);
    ctx.rotate(bootTilt);
    ctx.fillStyle = bootCol;
    ctx.strokeStyle = inkCol;
    ctx.lineWidth = 0.72 * sc;
    ctx.beginPath();
    ctx.moveTo(-1.8 * sc, -1.0 * sc);
    ctx.lineTo(1.4 * sc, -0.65 * sc);
    ctx.quadraticCurveTo(4.1 * sc, -0.05 * sc, 4.4 * sc, 1.35 * sc);
    ctx.lineTo(0.8 * sc, 1.50 * sc);
    ctx.lineTo(-1.9 * sc, 1.42 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawShepherdSprite(sx, sy, sc, gust, sunset, night, W) {
    if (!shepherdSpr.ready) return;
    const h = 56 * sc;
    const w = h * (256 / 384);
    const strideBlend = Math.min(1, shepherd.moveBlend);

    // Gentle natural bipedal stride bob (highest over mid-stance u=0.25/0.75, lowest at foot-strike u=0/0.5!)
    const bob = (0.5 - 0.5 * Math.cos(shepherd.walkPhase * 2.0)) * 0.95 * sc * strideBlend;
    const walkLean = 0.024 * strideBlend + Math.sin(shepherd.walkPhase * 2.0) * 0.008 * strideBlend;
    const breezeSway = Math.sin(shepherd.swayPhase) * (0.007 + gust * 0.011) + gust * 0.008;

    ctx.save();
    ctx.translate(sx, sy);

    // True radial perspective shadow away from Setting Sun pass (x = 0.43*W) & Moon (x = 0.80*W)!
    const sunDirX = Math.max(-1.2, Math.min(1.2, (sx / Math.max(1, W) - 0.43) * 3.2));
    const shOffX = (2 + sunset * 12.5 * sunDirX - night * 6.0) * sc;
    const shOffY = (1.2 + sunset * 3.4 + night * 1.5) * sc;
    const shRadX = (10.5 + sunset * (9.5 + Math.abs(sunDirX) * 6.0) + night * 5.0) * sc;
    const shRadY = (3.4 + sunset * 1.4 + night * 0.8) * sc;
    ctx.fillStyle = shadowFillStyle(sunset, night, 0.30);
    ctx.beginPath();
    ctx.ellipse(shOffX, shOffY, shRadX, shRadY, sunset * 0.12 * sunDirX - night * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(shepherd.facing, 1);

    // 1. Two tall anatomical walking legs & leather boots (far behind near, emerging naturally below cloak hem!)
    const hipY = -h * 0.415 - bob;
    drawShepherdLeg(-w * 0.020, hipY, shepherd.walkCycle, 0.50, true,  strideBlend, w, h, sc);
    drawShepherdLeg( w * 0.025, hipY, shepherd.walkCycle, 0.00, false, strideBlend, w, h, sc);

    // 2. Hand-painted watercolor hooded cloak + satchel riding smoothly over stepping legs
    ctx.save();
    ctx.translate(0, -bob);
    ctx.rotate(walkLean + breezeSway * shepherd.facing);
    ctx.drawImage(shepherdSpr.img, -w * 0.5, -h * 0.94, w, h);

    // 3. Dignified counter-phase right forearm & wooden shepherd's crook (tip glides cleanly along grass line!)
    if (shepherdArmSpr.ready) {
      const pivX = -w * 0.5 + 0.655 * w;
      const pivY = -h * 0.94 + 0.405 * h;
      const armWave      = -Math.sin(shepherd.walkPhase + 0.25);
      const walkArmSwing = armWave * 0.135 * strideBlend;
      const idleArmSway  = Math.sin(shepherd.swayPhase * 0.62) * 0.026 * (1 - strideBlend * 0.65);
      // Compensates circular pivot arc so the bottom tip of the staff glides along grass without stabbing underground
      const staffLift    = (Math.max(0, -armWave) * 1.8 + Math.abs(armWave) * 0.65) * sc * strideBlend;

      ctx.save();
      ctx.translate(pivX, pivY - staffLift);
      ctx.rotate(walkArmSwing + idleArmSway);
      ctx.drawImage(shepherdArmSpr.img, -0.655 * w, -0.405 * h, w, h);
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  /**
   * Draws one articulated 2-segment watercolor sheep leg in local sprite coordinates
   * (facing RIGHT +x, origin at ground contact center (0, 0), body drawn at [-w/2, -h*0.92]).
   */
  function drawArticulatedSheepLeg(leg, walkCycle, strideBlend, w, h, s) {
    const u = ((walkCycle + leg.phase) % 1 + 1) % 1;
    const STANCE = 0.62;
    const strideAmp = 7.4 * s * strideBlend;
    const liftAmp   = 3.4 * s * strideBlend;

    let footOffX = 0;
    let footLift = 0;
    if (u < STANCE) {
      // Stance phase: hoof firmly planted on grass, sweeping evenly backward relative to moving torso
      footOffX = strideAmp * (0.5 - u / STANCE);
      footLift = 0;
    } else {
      // Swing phase: smooth curved hoof lift and forward reach
      const sw = (u - STANCE) / (1 - STANCE);
      const ease = sw * sw * (3 - 2 * sw);
      footOffX = strideAmp * (-0.5 + ease);
      footLift = Math.sin(sw * Math.PI) * liftAmp;
    }

    const hipX = (leg.u - 0.5) * w;
    const hipY = (leg.v - 0.92) * h;
    const footX = hipX + footOffX;
    const footY = -footLift;

    // 2-bone natural sheep joint: front carpal knee flexes FORWARD (+x -> kneeSign -1),
    // hind hock flexes BACKWARD (-x -> kneeSign +1) while staying straighter at mid-stance!
    const L1 = h * 0.114;
    const L2 = h * 0.114;
    const dx = footX - hipX;
    const dy = footY - hipY;
    const raw = Math.hypot(dx, dy);
    const dist = Math.max(2.0 * s, Math.min(L1 + L2 - 0.12 * s, raw));
    const ux = dx / Math.max(0.001, raw);
    const uy = dy / Math.max(0.001, raw);
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const bend = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const kneeSign = leg.hind ? 1 : -1;
    const kx = hipX + ux * along - uy * bend * kneeSign;
    const ky = hipY + uy * along + ux * bend * kneeSign;

    const legFill = leg.far ? '#363b42' : '#53514e';
    const inkCol  = '#2b2522';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Dark hand-inked outer contour (matches castle-sheep-walk.png ink lines!)
    ctx.strokeStyle = inkCol;
    ctx.lineWidth = 3.1 * s;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY - 0.8 * s);
    ctx.lineTo(kx, ky);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    // Inner charcoal-taupe watercolor leg fill
    ctx.strokeStyle = legFill;
    ctx.lineWidth = 1.9 * s;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY - 0.8 * s);
    ctx.lineTo(kx, ky);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    // Crisp tiny cloven hoof
    ctx.fillStyle = '#2c2725';
    ctx.beginPath();
    ctx.ellipse(footX + 0.55 * s, footY, 1.35 * s, 0.95 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSheepSprite(sh, sc, sunset, night, W) {
    const s = sh.size * sc;
    const w = 36 * s;
    const h = w * (96 / 128);

    ctx.save();
    ctx.translate(sh.x, sh.y);

    // True radial perspective meadow shadow stretching away from the open sun pass (0.43*W)!
    const sunDirX = Math.max(-1.2, Math.min(1.2, (sh.x / Math.max(1, W) - 0.43) * 3.2));
    const shOffX = (1.5 + sunset * 8.2 * sunDirX - night * 4.5) * s;
    const shOffY = (1.2 + sunset * 2.4 + night * 1.0) * s;
    const shRadX = (12.2 + sunset * (6.5 + Math.abs(sunDirX) * 4.2) + night * 3.8) * s;
    const shRadY = (3.8 + sunset * 1.2 + night * 0.6) * s;
    ctx.fillStyle = shadowFillStyle(sunset, night, 0.28);
    ctx.beginPath();
    ctx.ellipse(shOffX, shOffY, shRadX, shRadY, sunset * 0.10 * sunDirX - night * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Walking state: draw articulated 4-beat quadruped legs + legless watercolor torso!
    if (sh.walkBlend > 0.12 && sheepWalk.ready && sheepWalk.body) {
      const strideBlend = Math.min(1, sh.walkBlend);
      // Natural double-beat subtle torso weight shift (NOT cartoonish pogo bouncing!)
      const weightBob = Math.sin(sh.walkCycle * Math.PI * 4) * 0.75 * s * strideBlend;
      const walkPitch = Math.sin(sh.walkCycle * Math.PI * 2) * 0.025 * strideBlend;

      ctx.scale(sh.facing, 1); // sheepWalk naturally faces RIGHT (+1)

      // 1. Draw all 4 articulated legs (far pair first, then near pair) tucked seamlessly under fleece
      for (const leg of SHEEP_LEGS) {
        if (leg.far) drawArticulatedSheepLeg(leg, sh.walkCycle, strideBlend, w, h, s);
      }
      for (const leg of SHEEP_LEGS) {
        if (!leg.far) drawArticulatedSheepLeg(leg, sh.walkCycle, strideBlend, w, h, s);
      }

      // 2. Hand-painted watercolor legless wool body + black face overlapping all 4 hip sockets
      ctx.save();
      ctx.translate(0, -weightBob);
      ctx.rotate(walkPitch);
      ctx.drawImage(sheepWalk.body, -w * 0.5, -h * 0.92, w, h);
      ctx.restore();

      ctx.restore();
      return;
    }

    // Stationary grazing or standing state: rooted hooves + natural subtle nibble/breathing
    const spr = (sh.mode === 'stand' && sheepStand.ready) ? sheepStand : sheepGraze;
    if (!spr.ready) { ctx.restore(); return; }

    // Both sheepGraze and sheepStand face LEFT (-1) naturally
    const flipX = sh.facing === -1 ? 1 : -1;
    // Calm organic grass-nibbling nod (occasional downward dip, hooves stay rooted!)
    const nibbleWave = Math.pow(0.5 + 0.5 * Math.sin(sh.idlePhase * 1.45), 3.0);
    const nibbleTilt = sh.mode === 'graze' ? (-nibbleWave * 0.055) : (Math.sin(sh.idlePhase * 0.8) * 0.012);

    ctx.scale(flipX, 1);
    ctx.rotate(nibbleTilt);
    ctx.drawImage(spr.img, -w * 0.5, -h * 0.92, w, h);
    ctx.restore();
  }

  function renderAndUpload(t, { W, H, flow, gust = 0.4, sunset, night, breeze }) {
    const bandY0 = H * FIELD_BAND_TOP;
    const bandH  = Math.max(1, H * FIELD_BAND_H);
    const sx = canvas.width / Math.max(1, W);
    const sy = canvas.height / bandH;
    const sc = Math.max(0.58, Math.min(1.12, Math.min(W, H) / 900));
    const warmWindowAmt = Math.max(sunset * 0.72, night);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, -bandY0 * sy);

    drawList.length = 0;

    if (cottage.active && cottageSpr.ready) {
      drawList.push({
        y: cottage.y,
        draw: () => {
          // Continuous softly feathered wood-hearth smoke curling from brick chimney
          const m = getCottageChimneyMouth();
          cottageSmoke.draw(ctx, m.x, m.y, sc);

          // Grounded cottage shadow (radiates naturally away from setting sun pass 0.43*W!)
          ctx.save();
          ctx.fillStyle = shadowFillStyle(sunset, night, 0.28);
          ctx.beginPath();
          const cDirX = Math.max(-1.2, Math.min(1.2, (cottage.x / Math.max(1, W) - 0.43) * 3.2));
          const cShX = cottage.x + (8 + sunset * 28 * cDirX - night * 16) * sc;
          const cShY = cottage.y + (2.5 + sunset * 8.5 + night * 3.5) * sc;
          const cRadX = cottage.w * (0.45 + sunset * 0.20 + night * 0.10);
          const cRadY = cottage.h * (0.10 + sunset * 0.048 + night * 0.02);
          ctx.ellipse(cShX, cShY, cRadX, cRadY, sunset * 0.10 * cDirX - night * 0.06, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          const dx = cottage.x - cottage.w * 0.5;
          const dy = cottage.y - cottage.h * 0.855;
          ctx.drawImage(cottageSpr.img, dx, dy, cottage.w, cottage.h);

          // Cozy warm golden candlelight glow inside recessed 4-pane cottage window (preserves wood mullions!)
          if (warmWindowAmt > 0.04) {
            const wx = dx + cottage.w * 0.722;
            const wy = dy + cottage.h * 0.526;
            const ww = cottage.w * 0.064;
            const wh = cottage.h * 0.144;
            const flicker = 0.92 + 0.08 * Math.sin(t * 4.2);
            ctx.save();
            ctx.globalAlpha = warmWindowAmt * 0.86 * flicker;
            ctx.fillStyle = '#ffcb62';
            ctx.fillRect(wx, wy, ww, wh);
            // Delicate timber mullion crossbars over the warm glowing panes
            ctx.fillStyle = '#473628';
            ctx.fillRect(wx + ww * 0.46, wy, ww * 0.09, wh);
            ctx.fillRect(wx, wy + wh * 0.46, ww, wh * 0.08);
            ctx.drawImage(windowGlowSpr, wx - ww * 1.6, wy - wh * 1.2, ww * 4.2, wh * 3.4);
            ctx.restore();
          }

          // Wind-swaying grass tufts & daisies rooted around stone wall base (synced to Tier 2 wind!)
          drawCottageBaseTufts(cottage.x, cottage.y, cottage.w, sc, t, cottage.gustSmooth);
        }
      });
    }

    drawList.push({
      y: shepherd.y,
      draw: () => drawShepherdSprite(shepherd.x, shepherd.y, sc, shepherd.gustSmooth, sunset, night, W)
    });

    for (const sh of sheep) {
      drawList.push({
        y: sh.y,
        draw: () => drawSheepSprite(sh, sc, sunset, night, W)
      });
    }

    drawList.sort((a, b) => a.y - b.y);
    for (const item of drawList) item.draw();

    // Foreground wind-bending wildflowers & tall meadow grass tufts
    if (breeze) {
      breeze.drawForegroundTufts(ctx, t, W, H, flow);
    }

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  return {
    texture: tex,
    resize,
    relocate,
    step,
    renderAndUpload
  };
}
