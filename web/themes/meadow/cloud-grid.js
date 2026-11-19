/**
 * Ghibli Cumulus Cloud Spatial Grid & Drifting Sky Clouds
 * Builds 3 overlapping tiers of cumulus puff circles around icon SDF islands
 * plus drifting free sky clouds, packed into an RGBA32F GPU spatial hash texture.
 */
import { hash2 } from '../../core/field-engine.js';
import { CELL_G, CIRC_K, PAD_TL, PAD_BR } from './meadow-shader.js';

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

  function makeSkyCloud(startX, H) {
    const scale = 0.72 + Math.random() * 0.58;
    const puffs = [];
    const count = 6 + ((Math.random() * 5) | 0);
    const halfW = 54 * scale;
    for (let i = 0; i < count; i++) {
      const u = (i / Math.max(1, count - 1)) * 2 - 1;
      const px = u * halfW * 0.85 + (Math.random() - 0.5) * 18 * scale;
      const py = (Math.random() - 0.5) * 26 * scale + Math.abs(u) * 8 * scale;
      const r = (22 + (1 - Math.abs(u) * 0.55) * 26 + Math.random() * 14) * scale;
      puffs.push({ ox: px, oy: py, r, tone: Math.random() });
    }
    return {
      x: startX,
      y: 65 + Math.random() * Math.max(80, H - 150),
      hw: halfW + 46 * scale,
      speed: 7 + Math.random() * 9,
      puffs
    };
  }

  function syncSkyClouds(cover, W, H) {
    const target = Math.round(cover * 9);
    while (skyClouds.length > target) skyClouds.pop();
    while (skyClouds.length < target) {
      skyClouds.push(makeSkyCloud(-120 + Math.random() * (W + 240), H));
    }
  }

  function stepSkyClouds(dt, flow, cover, W, H) {
    syncSkyClouds(cover, W, H);
    for (let i = 0; i < skyClouds.length; i++) {
      const c = skyClouds[i];
      c.x += c.speed * flow * dt;
      if (c.x - c.hw > W + 80) skyClouds[i] = makeSkyCloud(-c.hw - 80, H);
    }
  }

  function buildMassCircles(flowT, ctx) {
    const { W, H, hasSdf, adaptive, iconCount, warp, sampleSdf } = ctx;
    const list = [];
    if (!hasSdf || adaptive < 0.5 || iconCount === 0) return list;

    const R = 90;
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
          const gap = ci + 0.6 * R;
          let att = sstep(gap - 4, gap + 12, r);
          if (!isBig) {
            const bx = Math.floor(x / R), by = Math.floor(y / R);
            for (let j = by - 1; j <= by + 1; j++) {
              for (let i = bx - 1; i <= bx + 1; i++) {
                const o = big.get(i + ',' + j);
                if (!o) continue;
                const ov = o[2] + r - Math.hypot(o[0] - x, o[1] - y);
                att = Math.max(att, sstep(0.2 * r, 0.6 * r, ov));
              }
            }
          }
          r *= att;
          r *= sstep(5, 11, r);
          if (r < 0.8) continue;
          if (isBig) big.set(cx + ',' + cy, [x, y, r]);
          const breathe = 1 + 0.04 * Math.sin(flowT * (0.09 + 0.035 * ph) + ph * 6.283);
          list.push(x, y, r * breathe, ph);
        }
      }
    };

    // Large interior & rim billows
    addLayer(R, 11, [0.55, 0.90], -1e9, (ci) => sstep(-0.14 * R, -0.78 * R, ci), true);
    // Medium puffy cumulus edges
    addLayer(34, 41, [0.50, 0.90], -1.05 * R, (ci) => sstep(-0.04 * R, -0.28 * R, ci) * (1 - sstep(-0.68 * R, -1.0 * R, ci)), false);
    // Fine cauliflower contour puffs
    addLayer(24, 71, [0.46, 0.82], -0.65 * R, (ci) => sstep(2, -0.14 * R, ci) * (1 - sstep(-0.38 * R, -0.60 * R, ci)), false);

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

    const insertCircle = (x, y, r, tone) => {
      // Exact mathematically sufficient margin: smin(k=6) + edge AA(3) + safety(5) = 14px
      const margin = r + 14;
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
          circBuf[base + 3] = tone;
        }
      }
    };

    // Insert drifting free sky cloud puffs FIRST so they never drop in dense icon cells
    for (const sc of skyClouds) {
      for (const pf of sc.puffs) {
        insertCircle(sc.x + pf.ox, sc.y + pf.oy, pf.r, pf.tone);
      }
    }

    // Insert gently rolling icon cumulus circles (already ordered large -> medium -> small)
    for (let i = 0; i < massList.length; i += 4) {
      const x = massList[i], y = massList[i + 1], r = massList[i + 2], ph = massList[i + 3];
      const amp = 4.2 + 0.11 * r;
      const wx = amp * (0.85 * Math.sin(flowT * 0.24 + x * 0.011 + y * 0.004) + 0.30 * Math.sin(flowT * 0.30 + ph * 6.283));
      const wy = amp * (0.65 * Math.sin(flowT * 0.20 + y * 0.013 - x * 0.006 + 1.7) + 0.25 * Math.cos(flowT * 0.28 + ph * 6.283));
      insertCircle(x + wx, y + wy, r, ph);
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
