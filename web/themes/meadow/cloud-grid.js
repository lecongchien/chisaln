/**
 * Volumetric Cumulus Cloud Spatial Grid & Drifting Sky Clouds
 * Builds organic multi-tier cumulus billows around icon SDF islands plus
 * wind-sculpted drifting sky clouds (cumulus clusters, wispy banks, cloudlets),
 * packed into an RGBA32F GPU spatial hash texture (c.w <= 0: icon puff, c.w > 0: sky cloud thickness).
 */
import { hash2 } from '../../core/field-engine.js';
import { CELL_G, CIRC_K, PAD_TL, PAD_BR } from './meadow-shader.js';

// Gentle high-altitude ESE breeze direction — matches CLOUD_DIR in meadow-shader.js
const CLOUD_DIR_X = 0.9507;
const CLOUD_DIR_Y = 0.3102;
const CLOUD_PERP_X = -CLOUD_DIR_Y;
const CLOUD_PERP_Y = CLOUD_DIR_X;

const sstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export function createCloudGrid(gl) {
  let circTex = null;
  let circBuf = null;
  let cgW = 0;
  let cgH = 0;
  let massList = null;
  let massStamp = -1e9;
  let skyClouds = [];

  function buildSkyPuffs(archetype, scale) {
    const puffs = [];
    // Slight natural tilt aligned close to breeze direction so clouds look wind-sculpted
    const tilt = (Math.random() - 0.5) * 0.32;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const rotPush = (lx, ly, r, amp = 1.0) => {
      // Transform local spine coords (along breeze, across breeze) into CSS screen offsets
      const rx = lx * ct - ly * st;
      const ry = lx * st + ly * ct;
      const ox = rx * CLOUD_DIR_X + ry * CLOUD_PERP_X;
      const oy = rx * CLOUD_DIR_Y + ry * CLOUD_PERP_Y;
      puffs.push({
        ox,
        oy,
        r,
        phase: Math.random() * Math.PI * 2,
        morphAmp: (2.2 + Math.random() * 2.6) * scale * amp
      });
    };

    let maxSpanX = 80 * scale;
    let maxSpanY = 55 * scale;

    if (archetype === 0) {
      // Archetype A: Full fair-weather cumulus cluster (asymmetric billows + trailing wispy flanks)
      const halfL = (78 + Math.random() * 34) * scale;
      const spineCurve = (Math.random() - 0.5) * 26 * scale;

      // 3-4 main core billowing domes
      const cores = 3 + ((Math.random() * 2) | 0);
      for (let i = 0; i < cores; i++) {
        const u = (i / Math.max(1, cores - 1)) * 2 - 1;
        const lx = u * halfL * 0.44 + (Math.random() - 0.5) * 16 * scale;
        const ly = (Math.random() - 0.5) * 24 * scale + (1 - u * u) * spineCurve * 0.5;
        const r = (29 + (1 - Math.abs(u) * 0.32) * 15 + Math.random() * 8) * scale;
        rotPush(lx, ly, r, 0.85);
      }

      // 5-7 irregular medium shoulder lobes breaking any oval outline
      const shoulders = 5 + ((Math.random() * 3) | 0);
      for (let i = 0; i < shoulders; i++) {
        const ang = (i / shoulders) * Math.PI * 2 + (Math.random() - 0.5) * 0.55;
        const distL = (0.48 + Math.random() * 0.52) * halfL;
        const distW = (24 + Math.random() * 26) * scale;
        const lx = Math.cos(ang) * distL;
        const ly = Math.sin(ang) * distW + spineCurve * 0.35 * Math.cos(ang);
        const r = (18 + Math.random() * 14) * scale;
        rotPush(lx, ly, r, 1.05);
      }

      // 3-4 smaller trailing fractus/wisp tufts on windward & leeward tails
      const wisps = 3 + ((Math.random() * 2) | 0);
      for (let i = 0; i < wisps; i++) {
        const side = i === 0 ? -1 : (i === 1 ? 1 : (Math.random() < 0.5 ? -1 : 1));
        const lx = side * halfL * (0.85 + Math.random() * 0.48);
        const ly = (Math.random() - 0.5) * 44 * scale;
        const r = (12 + Math.random() * 10) * scale;
        rotPush(lx, ly, r, 1.3);
      }
      maxSpanX = halfL * 1.45 + 48 * scale;
      maxSpanY = halfL * 0.82 + 48 * scale;
    } else if (archetype === 1) {
      // Archetype B: Wind-stretched wispy stratocumulus bank (sleek, elongated, airy)
      const halfL = (98 + Math.random() * 44) * scale;
      const arch = (Math.random() - 0.5) * 32 * scale;
      const count = 9 + ((Math.random() * 4) | 0);
      for (let i = 0; i < count; i++) {
        const u = (i / Math.max(1, count - 1)) * 2 - 1;
        const lx = u * halfL + (Math.random() - 0.5) * 20 * scale;
        const env = Math.max(0.18, 1 - u * u * 0.78);
        const ly = (Math.random() - 0.5) * (28 * env + 10) * scale + arch * (1 - u * u);
        const r = (14 + env * 22 + Math.random() * 9) * scale;
        rotPush(lx, ly, r, 1.15);
      }
      // Detached delicate satellite tuft drifting alongside
      const satSide = Math.random() < 0.5 ? -1 : 1;
      rotPush(
        (Math.random() - 0.5) * halfL * 0.9,
        satSide * (36 + Math.random() * 18) * scale,
        (14 + Math.random() * 9) * scale,
        1.35
      );
      maxSpanX = halfL * 1.25 + 46 * scale;
      maxSpanY = halfL * 0.68 + 50 * scale;
    } else {
      // Archetype C: Small delicate fractus cloudlet (adds depth & scale variety)
      const halfL = (46 + Math.random() * 24) * scale;
      const count = 6 + ((Math.random() * 3) | 0);
      for (let i = 0; i < count; i++) {
        const u = (i / Math.max(1, count - 1)) * 2 - 1;
        const lx = u * halfL + (Math.random() - 0.5) * 14 * scale;
        const ly = (Math.random() - 0.5) * 26 * scale;
        const r = (13 + (1 - Math.abs(u) * 0.45) * 15 + Math.random() * 7) * scale;
        rotPush(lx, ly, r, 1.25);
      }
      maxSpanX = halfL * 1.3 + 38 * scale;
      maxSpanY = halfL * 0.95 + 38 * scale;
    }

    return { puffs, hw: maxSpanX, hh: maxSpanY };
  }

  function makeSkyCloud(x, y, W, H, respawnOffscreen = false) {
    const roll = Math.random();
    const archetype = roll < 0.44 ? 0 : (roll < 0.78 ? 1 : 2);
    const scale = archetype === 2
      ? (0.64 + Math.random() * 0.34)
      : (0.72 + Math.random() * 0.52);

    const { puffs, hw, hh } = buildSkyPuffs(archetype, scale);

    // Optical thickness: fuller cumulus vs lighter semi-translucent wisps (strictly > 0)
    const thickness = archetype === 0
      ? (0.84 + Math.random() * 0.20)
      : (archetype === 1 ? (0.72 + Math.random() * 0.22) : (0.62 + Math.random() * 0.24));

    // Clustered near shared breeze speed (~10.6 px/s) so noise stays naturally locked with gentle internal billow evolution
    const speed = 9.0 + Math.random() * 3.4;

    let sx = x;
    let sy = y;
    if (respawnOffscreen) {
      // Proportional inflow across left & top edges for even ESE coverage across the whole screen
      const fluxLeft = Math.max(1, H) * CLOUD_DIR_X;
      const fluxTop = Math.max(1, W) * CLOUD_DIR_Y;
      if (Math.random() < fluxLeft / (fluxLeft + fluxTop)) {
        sx = -hw - 65 - Math.random() * 70;
        sy = 20 + Math.random() * Math.max(80, H - 60);
      } else {
        sx = -40 + Math.random() * Math.max(120, W * 0.86);
        sy = -hh - 65 - Math.random() * 70;
      }
    }

    return { x: sx, y: sy, hw, hh, speed, thickness, puffs };
  }

  function pickInitialCloudPos(W, H) {
    let bestX = Math.random() * W;
    let bestY = Math.random() * H;
    let bestMinD = -1;
    for (let tries = 0; tries < 7; tries++) {
      const cx = -60 + Math.random() * (W + 120);
      const cy = 40 + Math.random() * Math.max(80, H - 90);
      let minD = 1e9;
      for (let i = 0; i < skyClouds.length; i++) {
        const d = Math.hypot(cx - skyClouds[i].x, cy - skyClouds[i].y);
        if (d < minD) minD = d;
      }
      if (minD > bestMinD) {
        bestMinD = minD;
        bestX = cx;
        bestY = cy;
      }
    }
    return [bestX, bestY];
  }

  function syncSkyClouds(cover, W, H) {
    const target = Math.round(cover * 10);
    while (skyClouds.length > target) skyClouds.pop();
    while (skyClouds.length < target) {
      const [sx, sy] = pickInitialCloudPos(W, H);
      skyClouds.push(makeSkyCloud(sx, sy, W, H, false));
    }
  }

  function stepSkyClouds(dt, flow, cover, W, H) {
    syncSkyClouds(cover, W, H);
    for (let i = 0; i < skyClouds.length; i++) {
      const c = skyClouds[i];
      const step = c.speed * flow * dt;
      c.x += CLOUD_DIR_X * step;
      c.y += CLOUD_DIR_Y * step;
      if (c.x - c.hw > W + 110 || c.y - c.hh > H + 110) {
        skyClouds[i] = makeSkyCloud(0, 0, W, H, true);
      }
    }
  }

  function buildMassCircles(flowT, ctx) {
    const { W, H, hasSdf, adaptive, iconCount, warp, sampleSdf } = ctx;
    const list = [];
    if (!hasSdf || adaptive < 0.5 || iconCount === 0) return list;

    const R = 86;
    const edgeOff = (warp - 36) * 0.45;
    const big = new Map();

    const addLayer = (G, k0, sizeRange, minCi, evalBand, isBig) => {
      const cx0 = -Math.ceil((2 * R) / G);
      const cx1 = Math.ceil((W + 2 * R) / G);
      const cy0 = -Math.ceil((2 * R) / G);
      const cy1 = Math.ceil((H + 2 * R) / G);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const ox = hash2(cx, cy, k0);
          const oy = hash2(cx, cy, k0 + 1);
          const rr = hash2(cx, cy, k0 + 2);
          const ph = hash2(cx, cy, k0 + 3);
          const x = (cx + 0.1 + ox * 0.8) * G;
          const y = (cy + 0.1 + oy * 0.8) * G;
          const ci = sampleSdf(x, y) - edgeOff;
          if (ci > 4 || ci < minCi) continue;

          let r = G * (sizeRange[0] + (sizeRange[1] - sizeRange[0]) * rr) * evalBand(ci);
          const gap = ci + 0.58 * R;
          let att = sstep(gap - 4, gap + 12, r);
          if (!isBig) {
            const bx = Math.floor(x / R), by = Math.floor(y / R);
            for (let j = by - 1; j <= by + 1; j++) {
              for (let i = bx - 1; i <= bx + 1; i++) {
                const o = big.get(i + ',' + j);
                if (!o) continue;
                const ov = o[2] + r - Math.hypot(o[0] - x, o[1] - y);
                att = Math.max(att, sstep(0.18 * r, 0.58 * r, ov));
              }
            }
          }
          r *= att;
          r *= sstep(6, 13, r);
          if (r < 1.2) continue;
          if (isBig) big.set(cx + ',' + cy, [x, y, r]);
          const breathe = 1 + 0.045 * Math.sin(flowT * (0.09 + 0.035 * ph) + ph * 6.283);
          list.push(x, y, r * breathe, ph);
        }
      }
    };

    // Tier 1: Large billowing core cumulus domes cradling icons
    addLayer(R, 11, [0.54, 0.88], -1e9, (ci) => sstep(-0.12 * R, -0.76 * R, ci), true);
    // Tier 2: Organic medium shoulder billows (fine cauliflower wisps are sculpted volumetrically in shader!)
    addLayer(46, 41, [0.46, 0.82], -0.96 * R, (ci) => sstep(2, -0.24 * R, ci) * (1 - sstep(-0.62 * R, -0.92 * R, ci)), false);

    return list;
  }

  function upload(flowT, ctx) {
    const { W, H, curMix } = ctx;
    const gw = Math.ceil(W / CELL_G) + PAD_TL + PAD_BR;
    const gh = Math.ceil(H / CELL_G) + PAD_TL + PAD_BR;
    if (!circTex || gw !== cgW || gh !== cgH) {
      cgW = gw; cgH = gh;
      if (circTex) gl.deleteTexture(circTex);
      circTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, circTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, gw * CIRC_K, gh);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      circBuf = new Float32Array(gw * CIRC_K * gh * 4);
    }

    const morphing = curMix < 1.0 || !massList || massList._w !== W || massList._h !== H;
    if (morphing || flowT - massStamp > 0.45) {
      massList = buildMassCircles(flowT, ctx);
      massList._w = W; massList._h = H;
      massStamp = flowT;
    }

    circBuf.fill(0);
    const counts = new Uint8Array(gw * gh);

    const insertCircle = (x, y, r, meta) => {
      // Mathematically crack-free margin: smin(k=18 -> 4.5px) + FBM outer wisp & soft shadow penumbra(28px) + safety(5.5px) = 38px
      const margin = r + 38;
      const x0 = Math.max(0, Math.floor((x - margin) / CELL_G) + PAD_TL);
      const x1 = Math.min(gw - 1, Math.floor((x + margin) / CELL_G) + PAD_TL);
      const y0 = Math.max(0, Math.floor((y - margin) / CELL_G) + PAD_TL);
      const y1 = Math.min(gh - 1, Math.floor((y + margin) / CELL_G) + PAD_TL);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const ci = cy * gw + cx;
          const k = counts[ci];
          if (k >= CIRC_K) continue;
          counts[ci] = k + 1;
          const base = (cy * gw * CIRC_K + cx * CIRC_K + k) * 4;
          circBuf[base]     = x;
          circBuf[base + 1] = y;
          circBuf[base + 2] = r;
          circBuf[base + 3] = meta;
        }
      }
    };

    // Insert drifting sky cloud puffs FIRST (meta = thickness > 0) with gentle living puff breathing
    for (const sc of skyClouds) {
      for (const pf of sc.puffs) {
        const w = flowT * 0.22 + pf.phase;
        const bx = Math.sin(w) * pf.morphAmp;
        const by = Math.cos(w * 0.83 + 1.1) * pf.morphAmp * 0.75;
        const br = pf.r * (1 + 0.055 * Math.sin(w * 0.72 + 2.3));
        insertCircle(sc.x + pf.ox + bx, sc.y + pf.oy + by, br, sc.thickness);
      }
    }

    // Insert gently rolling icon cumulus circles (meta <= 0 distinguishes icon layer from drifting layer)
    for (let i = 0; i < massList.length; i += 4) {
      const x = massList[i], y = massList[i + 1], r = massList[i + 2], ph = massList[i + 3];
      const amp = 4.0 + 0.10 * r;
      const wx = amp * (0.85 * Math.sin(flowT * 0.22 + x * 0.010 + y * 0.004) + 0.28 * Math.sin(flowT * 0.28 + ph * 6.283));
      const wy = amp * (0.65 * Math.sin(flowT * 0.18 + y * 0.012 - x * 0.006 + 1.7) + 0.24 * Math.cos(flowT * 0.26 + ph * 6.283));
      insertCircle(x + wx, y + wy, r, -0.1 - ph);
    }

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, circTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gw * CIRC_K, gh, gl.RGBA, gl.FLOAT, circBuf);
  }

  return {
    syncSkyClouds,
    stepSkyClouds,
    upload,
    invalidate: () => { massList = null; },
    getTexture: () => circTex,
    getGridSize: () => [cgW, cgH]
  };
}
