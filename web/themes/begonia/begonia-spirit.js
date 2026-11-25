import { getSpriteMaxWidth } from '../../core/field-engine.js';

/**
 * Big Fish & Begonia Spirit & Living Elements Engine ("Đại Ngư Hải Đường")
 * Orchestrates:
 *   1. Articulated 24-Segment Painterly Great Fish Kun ("Đại Ngư Côn")
 *      - True kinematic spine bending in organic S-curves across sky & mirror lake
 *      - Graceful SDF icon avoidance steering around desktop icons
 *      - Flowing gossamer silk pectoral fins, bifurcated ribbon tail, iconic golden brow horn,
 *        luminous spirit-droplet wake, AND real inverted water-mirror reflection!
 *   2. Continuously Drifting Crimson Begonia Petals (3D flutter/tumble + spawning expanding water ripples!)
 *   3. Warm Glowing Floating Lotus Water Lanterns ("Đèn Hoa Đăng") with live water reflections
 */

function loadGpuSprite(gl, src, onReady) {
  const tex = gl.createTexture();
  let ready = 0.0;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    ready = 1.0;
    onReady?.();
  };
  img.src = src;
  return { tex, get ready() { return ready; } };
}

export function createBegoniaSpirit(gl, onReady) {
  const tulou  = loadGpuSprite(gl, 'assets/begonia-tulou.png', onReady);
  const branch = loadGpuSprite(gl, 'assets/begonia-branch.png', onReady);

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');

  // Pre-baked soft radial halo sprites (eliminates 10+ per-frame createRadialGradient GC allocations!)
  function makeRadialSprite(stops) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    for (const [o, col] of stops) rg.addColorStop(o, col);
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  const kunAuraSprite = makeRadialSprite([
    [0.0, 'rgba(255, 118, 76, 0.24)'],
    [0.55, 'rgba(235, 72, 54, 0.10)'],
    [1.0, 'rgba(235, 72, 54, 0.0)']
  ]);
  const lanternHaloSprite = makeRadialSprite([
    [0.0, 'rgba(255, 194, 96, 0.44)'],
    [0.45, 'rgba(232, 86, 42, 0.17)'],
    [1.0, 'rgba(232, 86, 42, 0.0)']
  ]);

  const spiritTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, spiritTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const HORIZON_NY = 0.56;
  const SEG_COUNT = 24;

  // Tapered sculptural dolphin/whale half-width profile along the 24-node spine (0 = snout, 23 = tail peduncle)
  const SPINE_WIDTH = [
    0.42, 0.72, 0.92, 1.00, 0.98, 0.93, 0.87, 0.80,
    0.73, 0.65, 0.58, 0.51, 0.44, 0.38, 0.32, 0.27,
    0.22, 0.18, 0.145, 0.115, 0.09, 0.072, 0.058, 0.045
  ];

  const state = {
    time: 0,
    tulouRect: new Float32Array(4),
    branchRect: new Float32Array(4),
    // Articulated Great Fish Kun
    fish: {
      x: 420,
      y: 260,
      vx: 72,
      vy: 14,
      orbitPhase: 0.4,
      swimPhase: 0,
      nodes: [],
      sparks: [],
      sparkAcc: 0,
      initialized: false
    },
    petals: [],
    ripples: [],
    lanterns: [],
    initializedWorld: false
  };

  function initWorld(W, H) {
    state.initializedWorld = true;
    const horY = H * HORIZON_NY;

    // Seed drifting crimson Begonia petals across sky & lake
    state.petals.length = 0;
    for (let i = 0; i < 34; i++) {
      state.petals.push(spawnPetal(W, H, true));
    }

    // Seed serene floating lotus water lanterns ("Đèn Hoa Đăng") across the mirror lake
    state.lanterns.length = 0;
    const lanternCount = 8;
    for (let i = 0; i < lanternCount; i++) {
      const depth = 0.14 + (i / lanternCount) * 0.76 + (Math.random() - 0.5) * 0.06;
      state.lanterns.push({
        x: W * (0.08 + ((i * 0.137 + 0.07) % 0.84)),
        y: horY + (H - horY) * Math.max(0.10, Math.min(0.88, depth)),
        depth: Math.max(0.10, Math.min(0.88, depth)),
        vx: 7 + Math.random() * 8,
        bobPhase: Math.random() * Math.PI * 2,
        flickPhase: Math.random() * Math.PI * 2,
        scale: 0.58 + depth * 0.62
      });
    }
  }

  function spawnPetal(W, H, randomPos = false) {
    const startX = randomPos ? Math.random() * W * 0.88 : W * (0.01 + Math.random() * 0.30);
    const startY = randomPos ? Math.random() * H * 0.78 : H * (0.02 + Math.random() * 0.30);
    return {
      x: startX,
      y: startY,
      vx: 18 + Math.random() * 24,
      vy: 14 + Math.random() * 18,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 2.4,
      flutterPhase: Math.random() * Math.PI * 2,
      size: 4.5 + Math.random() * 4.5,
      hueShift: Math.random(),
      landed: false,
      floatAge: 0,
      landY: H * (HORIZON_NY + 0.04 + Math.random() * 0.38)
    };
  }

  function initFish(W, H, sc) {
    const f = state.fish;
    f.x = W * 0.38;
    f.y = H * 0.42;
    f.vx = 68 * sc;
    f.vy = -12 * sc;
    f.nodes.length = 0;
    const segLen = 9.2 * sc;
    for (let i = 0; i < SEG_COUNT; i++) {
      f.nodes.push({ x: f.x - i * segLen, y: f.y + Math.sin(i * 0.25) * 3 * sc });
    }
    f.initialized = true;
  }

  function resize(W, H) {
    const maxW = getSpriteMaxWidth(1920);
    const dpr = Math.min(1.5, Math.max(1.0, window.devicePixelRatio || 1));
    const targetW = Math.min(maxW, Math.round(W * dpr));
    const scale = Math.min(1.5, targetW / Math.max(1, W));
    const nw = Math.max(320, Math.round(W * scale));
    const nh = Math.max(180, Math.round(H * scale));
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw;
      canvas.height = nh;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      gl.bindTexture(gl.TEXTURE_2D, spiritTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    // Anchor Fujian Tulou right onto the horizon promontory (right-mid horizon!)
    const tW = Math.min(W * 0.34, H * 0.58);
    const tH = tW * (480 / 640);
    state.tulouRect[0] = W * 0.80 - tW * 0.5;
    state.tulouRect[1] = H * (HORIZON_NY + 0.015) - tH;
    state.tulouRect[2] = tW;
    state.tulouRect[3] = tH;

    // Anchor Ancient Crimson Begonia Bough flush to the top-left corner (0, 0)
    const bW = Math.min(W * 0.38, H * 0.64);
    const bH = bW * (576 / 768);
    state.branchRect[0] = 0;
    state.branchRect[1] = 0;
    state.branchRect[2] = bW;
    state.branchRect[3] = bH;
  }

  function step(dt, { W, H, flow, showFish, showPetals, showLanterns, sampleSdf, adaptive }) {
    const wind = Math.max(0.06, flow);
    const sc = Math.max(0.55, Math.min(1.20, Math.min(W, H) / 860));
    const horY = H * HORIZON_NY;
    state.time += dt;

    if (!state.initializedWorld) initWorld(W, H);
    if (!state.fish.initialized) initFish(W, H, sc);

    // 1. Step Articulated 24-Segment Great Fish Kun ("Đại Ngư Côn")
    const f = state.fish;
    if (showFish >= 0.5) {
      f.orbitPhase += dt * (0.24 + wind * 0.14);
      f.swimPhase  += dt * (3.6 + wind * 1.4);

      // Graceful wide figure-8 sweeping cleanly between starry sky and mirror water (avoiding right Tulou!)
      const targetX = W * (0.43 + Math.sin(f.orbitPhase) * 0.30);
      const targetY = H * (0.49 + Math.sin(f.orbitPhase * 2.0 + 0.4) * 0.24);

      let ax = (targetX - f.x) * 1.15;
      let ay = (targetY - f.y) * 1.45;

      // Real SDF Steering around desktop icons so Kun bends smoothly between icons!
      if (adaptive >= 0.5 && sampleSdf) {
        const s = sampleSdf(f.x, f.y);
        if (s < 58) {
          const eps = 12;
          const gx = sampleSdf(f.x + eps, f.y) - sampleSdf(f.x - eps, f.y);
          const gy = sampleSdf(f.x, f.y + eps) - sampleSdf(f.x, f.y - eps);
          const gm = Math.hypot(gx, gy) || 1;
          const push = ((58 - s) / 58) * 195 * sc;
          ax += (gx / gm) * push;
          ay += (gy / gm) * push;
        }
      }

      // Gently steer clear of the Fujian Tulou promontory on the right
      const tulCx = state.tulouRect[0] + state.tulouRect[2] * 0.5;
      const tulCy = state.tulouRect[1] + state.tulouRect[3] * 0.55;
      const dxT = f.x - tulCx, dyT = f.y - tulCy;
      const distT = Math.hypot(dxT, dyT);
      const minTulR = state.tulouRect[2] * 0.58;
      if (distT < minTulR && distT > 1) {
        const rep = ((minTulR - distT) / minTulR) * 160 * sc;
        ax += (dxT / distT) * rep;
        ay += (dyT / distT) * rep;
      }

      // Smooth velocity integration with minimum graceful cruising speed (fish never stalls!)
      f.vx += (ax - f.vx * 1.18) * Math.min(1, dt * 1.9);
      f.vy += (ay - f.vy * 1.18) * Math.min(1, dt * 1.9);
      const spd = Math.hypot(f.vx, f.vy);
      const minSpd = 54 * sc;
      const maxSpd = 128 * sc;
      if (spd < minSpd && spd > 0.1) {
        f.vx = (f.vx / spd) * minSpd;
        f.vy = (f.vy / spd) * minSpd;
      } else if (spd > maxSpd) {
        f.vx = (f.vx / spd) * maxSpd;
        f.vy = (f.vy / spd) * maxSpd;
      }

      const prevY = f.y;
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Spawn a subtle shimmering water ripple ring whenever Kun dives/breaches across the mirror horizon!
      if ((prevY < horY && f.y >= horY) || (prevY > horY && f.y <= horY)) {
        state.ripples.push({
          x: f.x,
          y: horY + 6 * sc,
          r: 8 * sc,
          maxR: 92 * sc,
          age: 0,
          life: 2.6,
          warm: 1.0
        });
      }

      // Update 24-node kinematic spine chain with natural lateral swimming undulation!
      const segLen = 9.0 * sc;
      f.nodes[0].x = f.x;
      f.nodes[0].y = f.y;
      for (let i = 1; i < SEG_COUNT; i++) {
        const prev = f.nodes[i - 1];
        const cur = f.nodes[i];
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        // Subtle lateral swimming wave grows gracefully toward the tail
        const uTail = i / (SEG_COUNT - 1);
        const undul = Math.sin(f.swimPhase - i * 0.42) * (0.45 + uTail * uTail * 2.4) * sc * dt * 18.0;
        const nx = prev.x + ux * segLen - uy * undul;
        const ny = prev.y + uy * segLen + ux * undul;
        const dx2 = nx - prev.x, dy2 = ny - prev.y;
        const d2 = Math.hypot(dx2, dy2) || 1;
        cur.x = prev.x + (dx2 / d2) * segLen;
        cur.y = prev.y + (dy2 / d2) * segLen;
      }

      // Luminous spirit stardust droplets trailing off Kun's silk fins & tail
      f.sparkAcc += dt * (10 + wind * 6);
      while (f.sparkAcc >= 1) {
        f.sparkAcc -= 1;
        const idx = 4 + Math.floor(Math.random() * (SEG_COUNT - 5));
        const nd = f.nodes[idx];
        f.sparks.push({
          x: nd.x + (Math.random() - 0.5) * 14 * sc,
          y: nd.y + (Math.random() - 0.5) * 14 * sc,
          vx: (Math.random() - 0.5) * 14 * sc + 8 * wind * sc,
          vy: (Math.random() - 0.5) * 12 * sc - 4 * sc,
          r: (1.2 + Math.random() * 2.2) * sc,
          age: 0,
          life: 1.1 + Math.random() * 1.2,
          gold: Math.random() > 0.42
        });
      }
      for (let i = f.sparks.length - 1; i >= 0; i--) {
        const sp = f.sparks[i];
        sp.age += dt;
        if (sp.age >= sp.life) { f.sparks.splice(i, 1); continue; }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= 0.98;
      }
      while (f.sparks.length > 64) f.sparks.shift();
    }

    // 2. Step Drifting Crimson Begonia Petals & Water Ripples
    if (showPetals >= 0.5) {
      for (let i = 0; i < state.petals.length; i++) {
        const pt = state.petals[i];
        if (!pt.landed) {
          pt.flutterPhase += dt * (2.4 + wind * 1.2);
          pt.x += (pt.vx * wind + Math.sin(pt.flutterPhase) * 14) * dt * sc;
          pt.y += (pt.vy * (0.75 + wind * 0.35) + Math.cos(pt.flutterPhase * 1.3) * 6) * dt * sc;
          pt.rot += pt.spin * dt;
          if (pt.y >= pt.landY) {
            pt.landed = true;
            pt.floatAge = 0;
            if (state.ripples.length < 28) {
              state.ripples.push({
                x: pt.x,
                y: pt.y,
                r: 2.5 * sc,
                maxR: (26 + Math.random() * 20) * sc,
                age: 0,
                life: 1.9 + Math.random() * 0.7,
                warm: 0.45
              });
            }
          } else if (pt.x > W + 30 || pt.y > H + 20) {
            state.petals[i] = spawnPetal(W, H, false);
          }
        } else {
          pt.floatAge += dt;
          pt.x += 12 * wind * dt * sc;
          pt.rot += 0.25 * dt;
          if (pt.floatAge > 4.2 || pt.x > W + 30) {
            state.petals[i] = spawnPetal(W, H, false);
          }
        }
      }
    }

    // Step expanding circular water ripples
    for (let i = state.ripples.length - 1; i >= 0; i--) {
      const rp = state.ripples[i];
      rp.age += dt;
      if (rp.age >= rp.life) { state.ripples.splice(i, 1); continue; }
      const u = rp.age / rp.life;
      rp.r = rp.maxR * (1 - Math.pow(1 - u, 2.2));
    }

    // 3. Step Floating Lotus Water Lanterns ("Đèn Hoa Đăng")
    if (showLanterns >= 0.5) {
      for (const ln of state.lanterns) {
        ln.bobPhase += dt * 1.65;
        ln.flickPhase += dt * 4.2;
        ln.x += ln.vx * (0.45 + wind * 0.55) * dt * sc;
        if (ln.x > W + 45) {
          ln.x = -35;
          ln.depth = 0.14 + Math.random() * 0.74;
          ln.y = horY + (H - horY) * ln.depth;
          ln.scale = 0.58 + ln.depth * 0.62;
        }
        // Soft SDF drift around desktop icons on the water half
        if (adaptive >= 0.5 && sampleSdf) {
          const s = sampleSdf(ln.x, ln.y);
          if (s < 32) {
            const gy = sampleSdf(ln.x, ln.y + 8) - sampleSdf(ln.x, ln.y - 8);
            ln.y += Math.sign(gy || 1) * 18 * dt * sc;
            ln.y = Math.max(horY + 18 * sc, Math.min(H - 22 * sc, ln.y));
          }
        }
      }
    }
  }

  /** Renders the articulated 24-segment Great Fish Kun (used both directly and inverted for lake reflection!) */
  function drawKunFish(nodes, sc, t, alphaScale, isMirror) {
    if (nodes.length < SEG_COUNT) return;
    const baseRad = 22.5 * sc;

    // Precompute smooth tangents & normals at every spine node
    const leftPts = [];
    const rightPts = [];
    const dirs = [];
    for (let i = 0; i < SEG_COUNT; i++) {
      const prev = nodes[Math.max(0, i - 1)];
      const next = nodes[Math.min(SEG_COUNT - 1, i + 1)];
      const dx = prev.x - next.x; // points forward toward head
      const dy = prev.y - next.y;
      const len = Math.hypot(dx, dy) || 1;
      const fx = dx / len, fy = dy / len;
      const nx = -fy, ny = fx;
      dirs.push({ fx, fy, nx, ny });
      const w = SPINE_WIDTH[i] * baseRad;
      leftPts.push({ x: nodes[i].x + nx * w, y: nodes[i].y + ny * w });
      rightPts.push({ x: nodes[i].x - nx * w, y: nodes[i].y - ny * w });
    }

    ctx.save();
    ctx.globalAlpha = alphaScale;

    // 1. Long flowing translucent gossamer pectoral silk fins (emerging at shoulder node 5)
    const sh = nodes[5], shD = dirs[5];
    for (const side of [-1, 1]) {
      const wave1 = Math.sin(t * 3.2 + side * 0.9) * 12 * sc;
      const wave2 = Math.cos(t * 2.6 + side * 1.4) * 16 * sc;
      const rootX = sh.x + shD.nx * side * baseRad * 0.72;
      const rootY = sh.y + shD.ny * side * baseRad * 0.72;
      const midX  = rootX + (-shD.fx * 34 + shD.nx * side * 38) * sc + shD.nx * wave1 * 0.4;
      const midY  = rootY + (-shD.fy * 34 + shD.ny * side * 38) * sc + shD.ny * wave1 * 0.4;
      const tipX  = rootX + (-shD.fx * 86 + shD.nx * side * 44) * sc + shD.nx * wave2 * 0.6;
      const tipY  = rootY + (-shD.fy * 86 + shD.ny * side * 44) * sc + shD.ny * wave2 * 0.6;
      const backX = nodes[10].x + dirs[10].nx * side * baseRad * 0.44;
      const backY = nodes[10].y + dirs[10].ny * side * baseRad * 0.44;

      const fg = ctx.createLinearGradient(rootX, rootY, tipX, tipY);
      fg.addColorStop(0.0, 'rgba(222, 62, 46, 0.80)');
      fg.addColorStop(0.55, 'rgba(246, 132, 92, 0.48)');
      fg.addColorStop(1.0, 'rgba(255, 224, 184, 0.06)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.quadraticCurveTo((tipX + backX) * 0.5 + shD.nx * side * 8 * sc, (tipY + backY) * 0.5 + shD.ny * side * 8 * sc, backX, backY);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Sweeping bifurcated gossamer ribbon tail fin (emerging from tail peduncle node 23)
    const tl = nodes[SEG_COUNT - 1], tlD = dirs[SEG_COUNT - 1];
    for (const side of [-1, 1]) {
      const flutter = Math.sin(t * 4.4 - 2.6 + side * 0.7) * 14 * sc;
      const tipX = tl.x + (-tlD.fx * 74 + tlD.nx * side * 34) * sc + tlD.nx * flutter;
      const tipY = tl.y + (-tlD.fy * 74 + tlD.ny * side * 34) * sc + tlD.ny * flutter;
      const ctrlX = tl.x + (-tlD.fx * 34 + tlD.nx * side * 26) * sc;
      const ctrlY = tl.y + (-tlD.fy * 34 + tlD.ny * side * 26) * sc;
      const midInX = tl.x - tlD.fx * 26 * sc;
      const midInY = tl.y - tlD.fy * 26 * sc;

      const tg = ctx.createLinearGradient(tl.x, tl.y, tipX, tipY);
      tg.addColorStop(0.0, 'rgba(226, 56, 42, 0.88)');
      tg.addColorStop(0.55, 'rgba(248, 134, 96, 0.52)');
      tg.addColorStop(1.0, 'rgba(255, 228, 192, 0.05)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
      ctx.quadraticCurveTo((tipX + midInX) * 0.5, (tipY + midInY) * 0.5, midInX, midInY);
      ctx.closePath();
      ctx.fill();
    }

    // 3. Soft ambient spirit luminescence glow wrapping Kun's body (pre-baked sprite, zero per-frame gradient!)
    const midN = nodes[6];
    const glowR = 72 * sc;
    ctx.drawImage(kunAuraSprite, midN.x - glowR, midN.y - glowR, glowR * 2, glowR * 2);

    // 4. Sculpted continuous crimson-vermilion gouache body polygon along all 24 spine nodes
    const head = nodes[0], headD = dirs[0];
    const snoutX = head.x + headD.fx * 11.5 * sc;
    const snoutY = head.y + headD.fy * 11.5 * sc;

    const bodyGrad = ctx.createLinearGradient(
      head.x + headD.nx * baseRad, head.y + headD.ny * baseRad,
      tl.x - headD.nx * baseRad, tl.y - headD.ny * baseRad
    );
    bodyGrad.addColorStop(0.00, '#c82622');
    bodyGrad.addColorStop(0.35, '#e24432');
    bodyGrad.addColorStop(0.72, '#f0784e');
    bodyGrad.addColorStop(1.00, '#fbd69e');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(snoutX, snoutY);
    for (let i = 0; i < SEG_COUNT; i++) {
      ctx.lineTo(leftPts[i].x, leftPts[i].y);
    }
    for (let i = SEG_COUNT - 1; i >= 0; i--) {
      ctx.lineTo(rightPts[i].x, rightPts[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // 5. Luminous golden-ivory inner belly & dorsal silk crest stroke (painterly 3D volume!)
    const upSide = headD.fx >= 0 ? -1 : 1; // guaranteed skyward normal whether swimming left or right
    ctx.strokeStyle = 'rgba(255, 224, 168, 0.56)';
    ctx.lineWidth = 4.2 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(nodes[2].x - dirs[2].nx * upSide * baseRad * 0.28, nodes[2].y - dirs[2].ny * upSide * baseRad * 0.28);
    for (let i = 3; i < SEG_COUNT - 3; i++) {
      ctx.lineTo(nodes[i].x - dirs[i].nx * upSide * SPINE_WIDTH[i] * baseRad * 0.28, nodes[i].y - dirs[i].ny * upSide * SPINE_WIDTH[i] * baseRad * 0.28);
    }
    ctx.stroke();

    // Soft glowing dorsal spine ridge
    ctx.strokeStyle = 'rgba(255, 198, 146, 0.38)';
    ctx.lineWidth = 2.0 * sc;
    ctx.beginPath();
    ctx.moveTo(nodes[1].x + dirs[1].nx * upSide * baseRad * 0.24, nodes[1].y + dirs[1].ny * upSide * baseRad * 0.24);
    for (let i = 2; i < SEG_COUNT - 1; i++) {
      ctx.lineTo(nodes[i].x + dirs[i].nx * upSide * SPINE_WIDTH[i] * baseRad * 0.24, nodes[i].y + dirs[i].ny * upSide * SPINE_WIDTH[i] * baseRad * 0.24);
    }
    ctx.stroke();

    // 6. Signature Kun details: delicate ivory-gold forehead horn (always skyward!), golden brow mark & soulful dark eye!
    if (!isMirror) {
      const upX = headD.nx * upSide;
      const upY = headD.ny * upSide;
      const browX = nodes[1].x + headD.fx * 2.5 * sc;
      const browY = nodes[1].y + headD.fy * 2.5 * sc;
      // Small curved golden-ivory forehead horn sweeping gracefully upward & forward
      const hornTipX = browX + (headD.fx * 9.5 + upX * 15.5) * sc;
      const hornTipY = browY + (headD.fy * 9.5 + upY * 15.5) * sc;
      ctx.fillStyle = '#fde4a6';
      ctx.beginPath();
      ctx.moveTo(browX + (headD.fx * 2.0 + upX * 5.2) * sc, browY + (headD.fy * 2.0 + upY * 5.2) * sc);
      ctx.quadraticCurveTo(browX + (headD.fx * 7.5 + upX * 10.5) * sc, browY + (headD.fy * 7.5 + upY * 10.5) * sc, hornTipX, hornTipY);
      ctx.quadraticCurveTo(browX + (headD.fx * 1.5 + upX * 11.5) * sc, browY + (headD.fy * 1.5 + upY * 11.5) * sc, browX + (-headD.fx * 3.5 + upX * 6.5) * sc, browY + (-headD.fy * 3.5 + upY * 6.5) * sc);
      ctx.closePath();
      ctx.fill();

      // Golden spirit crest dot on brow
      ctx.fillStyle = 'rgba(255, 232, 160, 0.90)';
      ctx.beginPath();
      ctx.arc(nodes[2].x + upX * 2.5 * sc, nodes[2].y + upY * 2.5 * sc, 2.3 * sc, 0, Math.PI * 2);
      ctx.fill();

      // Expressive dark obsidian eye with tiny luminous catch-light
      const eyeX = nodes[1].x + upX * 3.8 * sc;
      const eyeY = nodes[1].y + upY * 3.8 * sc;
      ctx.fillStyle = '#1d141c';
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 2.4 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff9eb';
      ctx.beginPath();
      ctx.arc(eyeX + 0.7 * sc, eyeY - 0.7 * sc, 0.85 * sc, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawLotusLantern(ln, sc, moodGlow) {
    const x = ln.x;
    const y = ln.y + Math.sin(ln.bobPhase) * 2.2 * sc;
    const s = ln.scale * sc;
    const flick = 0.88 + 0.12 * Math.sin(ln.flickPhase);

    ctx.save();
    // 1. Soft shimmering vertical amber reflection underneath the lotus lantern on the mirror lake!
    const refH = 26 * s;
    const refG = ctx.createLinearGradient(x, y + 3 * s, x, y + refH);
    refG.addColorStop(0.0, `rgba(255, 168, 72, ${(0.42 * moodGlow * flick).toFixed(3)})`);
    refG.addColorStop(0.5, `rgba(235, 96, 46, ${(0.18 * moodGlow * flick).toFixed(3)})`);
    refG.addColorStop(1.0, 'rgba(235, 96, 46, 0)');
    ctx.fillStyle = refG;
    ctx.beginPath();
    ctx.ellipse(x + Math.sin(ln.bobPhase * 2.1) * 1.8 * s, y + refH * 0.42, 7.5 * s, refH * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Warm halo around glowing paper lotus (pre-baked sprite, zero per-frame gradient allocation!)
    if (moodGlow > 0.15) {
      const hR = 24 * s;
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * Math.min(1.0, moodGlow * flick);
      ctx.drawImage(lanternHaloSprite, x - hR, y - 3 * s - hR, hR * 2, hR * 2);
      ctx.globalAlpha = prevA;
    }

    // 3. Dark jade lotus leaf saucer base
    ctx.fillStyle = '#183834';
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * s, 9.5 * s, 3.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Translucent crimson-peach lotus petals cradling the warm candle core
    const petals = [-0.65, -0.25, 0.25, 0.65];
    for (const ang of petals) {
      ctx.save();
      ctx.translate(x, y + 1 * s);
      ctx.rotate(ang);
      ctx.fillStyle = moodGlow > 0.35 ? 'rgba(244, 108, 72, 0.90)' : 'rgba(232, 92, 82, 0.88)';
      ctx.beginPath();
      ctx.ellipse(0, -4.2 * s, 2.7 * s, 5.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. Incandescent golden candle core
    ctx.fillStyle = `rgba(255, 242, 186, ${(0.65 + 0.35 * moodGlow * flick).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y - 3.6 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function renderAndUpload(t, { W, H, showFish, showPetals, showLanterns, sunset, night }) {
    const sx = canvas.width / Math.max(1, W);
    const sy = canvas.height / Math.max(1, H);
    const sc = Math.max(0.55, Math.min(1.20, Math.min(W, H) / 860));
    const horY = H * HORIZON_NY;
    const moodGlow = Math.max(0.18, Math.min(1.0, night * 1.0 + sunset * 0.72));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    // 1. Expanding translucent circular water ripples on mirror lake
    for (const rp of state.ripples) {
      const u = rp.age / rp.life;
      const fade = (1 - u) * (1 - u) * 0.44;
      ctx.strokeStyle = rp.warm > 0.7
        ? `rgba(255, 214, 168, ${fade.toFixed(3)})`
        : `rgba(220, 244, 246, ${(fade * 0.78).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.7, (1.5 - u * 0.8) * sc);
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Real inverted mirror reflection of Great Fish Kun inside the lake whenever Kun glides above horizon!
    const f = state.fish;
    if (showFish >= 0.5 && f.nodes.length === SEG_COUNT) {
      const mirroredNodes = f.nodes.map((nd, idx) => ({
        x: nd.x + Math.sin(t * 2.8 + idx * 0.55) * 4.2 * sc,
        y: 2 * horY - nd.y
      }));
      // Clip reflection strictly to the mirror water half (y > horY)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horY, W, H - horY);
      ctx.clip();
      drawKunFish(mirroredNodes, sc, t, 0.28, true);
      ctx.restore();
    }

    // 3. Floating Glowing Lotus Water Lanterns sorted back-to-front
    if (showLanterns >= 0.5) {
      for (const ln of state.lanterns) {
        drawLotusLantern(ln, sc, moodGlow);
      }
    }

    // 4. Articulated 24-Segment Great Fish Kun + Luminous Spirit Stardust Wake!
    if (showFish >= 0.5 && f.nodes.length === SEG_COUNT) {
      for (const sp of f.sparks) {
        const life = Math.max(0, 1 - sp.age / sp.life);
        ctx.fillStyle = sp.gold
          ? `rgba(255, 232, 168, ${(life * life * 0.78).toFixed(3)})`
          : `rgba(255, 134, 96, ${(life * life * 0.68).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r * (0.4 + 0.6 * life), 0, Math.PI * 2);
        ctx.fill();
      }
      drawKunFish(f.nodes, sc, t, 0.96, false);
    }

    // 5. Drifting & Floating Crimson Begonia Petals (5-petal watercolor curves tumbling in 3D!)
    if (showPetals >= 0.5) {
      for (const pt of state.petals) {
        const fade = pt.landed ? Math.max(0, 1 - pt.floatAge / 4.2) * 0.78 : 0.92;
        if (fade < 0.02) continue;
        const squish = pt.landed ? 0.42 : (0.45 + 0.55 * Math.abs(Math.cos(pt.flutterPhase * 1.4)));
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.scale(1.0, squish);
        ctx.globalAlpha = fade;
        ctx.fillStyle = pt.hueShift > 0.5 ? '#df3c3c' : '#ee635a';
        ctx.beginPath();
        ctx.ellipse(0, 0, pt.size * sc, pt.size * 0.62 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 196, 178, 0.42)';
        ctx.beginPath();
        ctx.ellipse(-pt.size * 0.18 * sc, -pt.size * 0.12 * sc, pt.size * 0.45 * sc, pt.size * 0.25 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, spiritTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  return {
    tulouTexture: tulou.tex,
    branchTexture: branch.tex,
    spiritTexture: spiritTex,
    get tulouReady() { return tulou.ready; },
    get branchReady() { return branch.ready; },
    get tulouRect() { return state.tulouRect; },
    get branchRect() { return state.branchRect; },
    resize,
    step,
    renderAndUpload
  };
}
