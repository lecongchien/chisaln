/**
 * Painterly Studio Ghibli Fluid Smoke Engine for Theme #3 ("Lâu đài trên đồi gió")
 * Renders continuous, organically curling smoke ribbons using pre-baked multi-lobe
 * soft radial watercolor stamps + smooth aerodynamic wind-shear trajectories:
 * - ZERO discrete hard-edged circle beads ("chùm nho / bóng bay")
 * - Always anchored cleanly to the live chimney mouth (follows Howl's walking bob & tilt!)
 * - Supports both Howl's dense charcoal coal plumes (dark core -> smoky slate fade)
 *   and the prairie cottage's lazy, delicate wood-hearth smoke wisp.
 */

function createSmokeStamp(innerRgb, midRgb, outerRgb, seed = 1) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');

  // 7 asymmetric overlapping ultra-soft Gaussian lobes -> organic watercolor cloud wisp (ZERO circular edge!)
  const lobes = [
    { x:  0.00, y:  0.00, r: 0.44, a: 0.56 },
    { x: -0.18, y:  0.06, r: 0.34, a: 0.38 },
    { x:  0.19, y: -0.07, r: 0.35, a: 0.38 },
    { x:  0.05, y: -0.17, r: 0.30, a: 0.34 },
    { x: -0.07, y:  0.16, r: 0.31, a: 0.32 },
    { x:  0.24, y:  0.11, r: 0.24, a: 0.24 },
    { x: -0.23, y: -0.12, r: 0.25, a: 0.24 }
  ];

  // Deterministic slight angular variation per palette
  const ang = seed * 1.17;
  const ca = Math.cos(ang), sa = Math.sin(ang);

  for (const lb of lobes) {
    const rx = (lb.x * ca - lb.y * sa) * S + S * 0.5;
    const ry = (lb.x * sa + lb.y * ca) * S + S * 0.5;
    const rad = lb.r * S;
    const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    g.addColorStop(0.00, `rgba(${innerRgb}, ${lb.a})`);
    g.addColorStop(0.42, `rgba(${midRgb}, ${lb.a * 0.62})`);
    g.addColorStop(0.76, `rgba(${outerRgb}, ${lb.a * 0.18})`);
    g.addColorStop(1.00, `rgba(${outerRgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

let STAMPS = null;
function getStamps() {
  if (!STAMPS) {
    STAMPS = {
      sootDark:   createSmokeStamp('26, 29, 35',   '46, 52, 60',   '74, 82, 92',   1),
      sootHaze:   createSmokeStamp('74, 82, 94',   '112, 122, 134','150, 160, 170', 2),
      steamWisp:  createSmokeStamp('244, 248, 252','232, 240, 246','220, 232, 240', 3),
      hearthWisp: createSmokeStamp('246, 245, 238','234, 236, 232','218, 224, 226', 4)
    };
  }
  return STAMPS;
}

/**
 * Creates a continuous aerodynamic smoke plume anchored to a chimney nozzle.
 * @param {object} cfg
 *   kind: 'coal' | 'steam' | 'hearth'
 *   spawnRate: seconds between emitted fluid nodes (keep small ~0.04-0.07s for continuous ribbon!)
 *   life: lifetime of each parcel in seconds
 *   r0: initial radius right at chimney lip
 *   rGrow: total expansion radius over lifetime
 *   jetVx, jetVy: initial chimney-barrel exhaust velocity
 *   windVx, windVy: ambient downwind advection velocity at flow=1
 *   curlAmp: sinusoidal Kelvin-Helmholtz vortex curl amplitude
 *   curlFreq: vortex curl frequency
 *   opacity: peak opacity
 */
export function createSmokePlume(cfg) {
  const nodes = [];
  let spawnAcc = 0;
  let wavePhase = Math.random() * Math.PI * 2;
  let initialized = false;

  function emitNode(mx, my, wind, sc = 1) {
    const jitter = (Math.random() - 0.5);
    nodes.push({
      x: mx,
      y: my,
      vx: (cfg.jetVx + jitter * 5.0) * sc,
      vy: (cfg.jetVy + (Math.random() - 0.5) * 3.5) * sc,
      age: 0,
      life: cfg.life * (0.90 + Math.random() * 0.22),
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.55),
      curlOff: (Math.random() - 0.5) * 0.65,
      sizeMul: 0.90 + Math.random() * 0.22,
      seed: Math.random() * Math.PI * 2
    });
  }

  function step(dt, mx, my, { wind = 1.0, gust = 0.4, sc = 1.0, active = true }) {
    if (!active) return;

    // Pre-warm natural ribbon on first step so smoke is already flowing smoothly at frame 1
    if (!initialized) {
      initialized = true;
      const preStep = 0.06;
      const steps = Math.min(48, Math.ceil((cfg.life * 0.85) / preStep));
      for (let k = 0; k < steps; k++) {
        stepInternal(preStep, mx, my, wind, gust, sc);
      }
      return;
    }

    stepInternal(dt, mx, my, wind, gust, sc);
  }

  function stepInternal(dt, mx, my, wind, gust, sc) {
    const effWind = Math.max(0.18, wind) * (0.80 + gust * 0.55);
    wavePhase += dt * (cfg.curlFreq || 2.1) * (0.75 + gust * 0.5);

    spawnAcc += dt;
    const interval = Math.max(0.025, cfg.spawnRate / (0.75 + Math.min(1.4, effWind) * 0.35));
    while (spawnAcc >= interval) {
      spawnAcc -= interval;
      emitNode(mx, my, effWind, sc);
    }

    const targetVx = cfg.windVx * effWind * sc;
    const targetVy = cfg.windVy * (0.85 + 0.25 * gust) * sc;
    const drag = cfg.windDrag ?? 2.35;

    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      n.age += dt;
      if (n.age >= n.life) {
        nodes.splice(i, 1);
        continue;
      }

      const u = n.age / n.life;
      // Smooth aerodynamic bend from upward chimney jet into horizontal alpine breeze
      const bendK = Math.min(1, dt * (drag * (0.45 + u * 1.4)));
      n.vx += (targetVx - n.vx) * bendK;
      n.vy += (targetVy - n.vy) * bendK;

      // Gentle Kelvin-Helmholtz sinuous curl perpendicular to wind (grows gently downwind)
      const curlFade = Math.min(1, u * 3.2) * (1 - u * 0.25);
      const eddy = Math.sin(wavePhase - n.age * 3.1 + n.seed * 0.35) * (cfg.curlAmp || 12) * curlFade * sc;
      const eddyX = Math.cos(wavePhase * 0.7 - n.age * 2.3 + n.seed) * (cfg.curlAmp || 12) * 0.28 * curlFade * sc;

      n.x += (n.vx + eddyX) * dt;
      n.y += (n.vy + eddy) * dt;
      n.rot += n.spin * dt;
    }

    // Cap safety bound
    while (nodes.length > 72) nodes.shift();
  }

  function draw(ctx, mx, my, sc = 1.0) {
    if (nodes.length < 2) return;
    const stamps = getStamps();

    ctx.save();

    // 1. Soft interpolated watercolor micro-stamps right at the chimney lip (zero gap, zero hard line!)
    const mouthStamp = cfg.kind === 'coal'
      ? stamps.sootDark
      : (cfg.kind === 'steam' ? stamps.steamWisp : stamps.hearthWisp);
    const newest = nodes[nodes.length - 1];
    for (let k = 0; k < 2; k++) {
      const f = k * 0.5;
      const px = mx + (newest.x - mx) * f;
      const py = my + (newest.y - my) * f;
      const mr = cfg.r0 * (0.78 + f * 0.22) * sc;
      ctx.globalAlpha = cfg.opacity * (cfg.kind === 'coal' ? 0.55 : 0.42);
      ctx.drawImage(mouthStamp, px - mr, py - mr, mr * 2, mr * 2);
    }

    // 2. Render continuous overlapping soft watercolor smoke stamps (oldest -> youngest so dark fresh soot stays crisp!)
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const u = n.age / n.life;

      // Smooth fade-in right out of lip, soft atmospheric dissolution at tail
      const fadeIn  = Math.min(1, u / 0.08);
      const fadeOut = Math.pow(Math.max(0, 1 - u), cfg.kind === 'coal' ? 1.45 : 1.30);
      const alpha   = fadeIn * fadeOut * cfg.opacity;
      if (alpha < 0.008) continue;

      const r = (cfg.r0 + Math.pow(u, 0.80) * cfg.rGrow) * n.sizeMul * sc;
      // Gently stretch downwind as air shear pulls the smoke into wispy filaments
      const stretchX = 1.0 + u * (cfg.kind === 'coal' ? 0.68 : 0.45);
      const stretchY = 1.0 - u * 0.14;

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.rot * 0.35);
      ctx.scale(stretchX, stretchY);

      if (cfg.kind === 'coal') {
        // Fresh dark charcoal near stack mouth smoothly transitions to pale blue-grey smoky haze downwind!
        const darkMix = Math.max(0, 1 - u * 1.75);
        if (darkMix > 0.02) {
          ctx.globalAlpha = alpha * darkMix * 0.92;
          ctx.drawImage(stamps.sootDark, -r, -r, r * 2, r * 2);
        }
        const hazeMix = Math.min(1, u * 1.45 + 0.18);
        ctx.globalAlpha = alpha * hazeMix * 0.62;
        ctx.drawImage(stamps.sootHaze, -r * 1.16, -r * 1.16, r * 2.32, r * 2.32);
      } else if (cfg.kind === 'steam') {
        ctx.globalAlpha = alpha * 0.85;
        ctx.drawImage(stamps.steamWisp, -r, -r, r * 2, r * 2);
      } else {
        // Gentle translucent wood-hearth smoke from the prairie thatched cottage
        ctx.globalAlpha = alpha * 0.82;
        ctx.drawImage(stamps.hearthWisp, -r, -r, r * 2, r * 2);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function reset() {
    nodes.length = 0;
    spawnAcc = 0;
    initialized = false;
  }

  return { step, draw, reset };
}
