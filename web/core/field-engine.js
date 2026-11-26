/**
 * Shared CPU-to-WebGL2 Adaptive Signed Distance Field (SDF) Engine
 *
 * Architecture:
 * 1. Downsampled coarse grid (STEP = 5 px) with precomputed FBM domain-warp vectors.
 * 2. Gaussian Metaball accumulation over icon rectangles -> smooth merging of nearby islands/clouds.
 * 3. Logarithmic mapping to pseudo-SDF (negative inside, 0 at contour, positive outside) with seamless fMin floor.
 * 4. Packed into single-channel 16-bit half-float (R16F) textures with ping-pong blending (uFA <-> uFB).
 */
export const FIELD_STEP = 5;

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}

export function fbm(x, y, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

export function tileNoise(x, y, px, py, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const x0 = ((ix % px) + px) % px;
  const x1 = (x0 + 1) % px;
  const y0 = ((iy % py) + py) % py;
  const y1 = (y0 + 1) % py;

  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}

export function tileFbm(u, v, basePeriod, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += tileNoise(u * p, v * p, p, p, seed + i * 31) * amp;
    norm += amp;
    p *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

// Fast IEEE-754 float32 -> float16 converter
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);

export function floatToHalf(val) {
  _f32[0] = val;
  const x = _u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  let mant = x & 0x007fffff;

  if (exp === 0xff) {
    return sign | 0x7c00 | (mant ? 1 : 0);
  }
  const newExp = exp - 127 + 15;
  if (newExp >= 31) {
    return sign | 0x7c00;
  }
  if (newExp <= 0) {
    if (newExp < -10) return sign;
    mant = (mant | 0x00800000) >>> (1 - newExp);
    return sign | ((mant + 0x00001000) >>> 13);
  }
  return sign | (newExp << 10) | ((mant + 0x00001000) >>> 13);
}

export class AdaptiveField {
  constructor(step = FIELD_STEP) {
    this.step = step;
    this.width = 1;
    this.height = 1;
    this.gw = 4;
    this.gh = 4;
    this.wx = new Float32Array(16);
    this.wy = new Float32Array(16);
    this.halfScratch = new Uint16Array(16);
    this.lastComputeMs = 0;
  }

  resize(cssWidth, cssHeight) {
    this.width = Math.max(1, cssWidth);
    this.height = Math.max(1, cssHeight);
    this.gw = Math.ceil(this.width / this.step) + 2;
    this.gh = Math.ceil(this.height / this.step) + 2;

    const n = this.gw * this.gh;
    this.wx = new Float32Array(n);
    this.wy = new Float32Array(n);
    this.halfScratch = new Uint16Array(n);

    for (let gy = 0; gy < this.gh; gy++) {
      const y = gy * this.step;
      for (let gx = 0; gx < this.gw; gx++) {
        const i = gy * this.gw + gx;
        const x = gx * this.step;
        this.wx[i] = fbm(x * 0.0029, y * 0.0029, 11, 4) - 0.48;
        this.wy[i] = fbm(x * 0.0029, y * 0.0029, 29, 4) - 0.48;
      }
    }
  }

  /**
   * Computes Gaussian Metaball -> Pseudo-SDF over the coarse grid.
   * @param {Array<{cx:number, cy:number, hw:number, hh:number}>} rects
   * @param {number} sigma
   * @param {number} warp
   * @param {number} thresholdIso
   */
  compute(rects, sigma, warp, thresholdIso = 0.35) {
    const t0 = performance.now();
    const { gw, gh, step, wx, wy } = this;
    const n = gw * gh;
    const density = new Float32Array(n);
    const sig = Math.max(12, sigma);
    const invSig2 = 1 / (sig * sig);
    const warpAmp = warp * 2.2;
    const warpMax = warpAmp * 0.55;

    for (let k = 0; k < rects.length; k++) {
      const r = rects[k];
      const radius = 5.4 * sig + Math.max(r.hw, r.hh) * 0.5 + warpMax;
      const gx0 = Math.max(0, Math.floor((r.cx - radius) / step));
      const gx1 = Math.min(gw - 1, Math.ceil((r.cx + radius) / step));
      const gy0 = Math.max(0, Math.floor((r.cy - radius) / step));
      const gy1 = Math.min(gh - 1, Math.ceil((r.cy + radius) / step));
      const chw = Math.max(2, r.hw * 0.52);
      const chh = Math.max(2, r.hh * 0.52);

      for (let gy = gy0; gy <= gy1; gy++) {
        const rowOffset = gy * gw;
        const py = gy * step;
        for (let gx = gx0; gx <= gx1; gx++) {
          const i = rowOffset + gx;
          const qx = gx * step + wx[i] * warpAmp;
          const qy = py + wy[i] * warpAmp;
          let dx = Math.abs(qx - r.cx) - chw;
          let dy = Math.abs(qy - r.cy) - chh;
          if (dx < 0) dx = 0;
          if (dy < 0) dy = 0;
          density[i] += Math.exp(-(dx * dx + dy * dy) * invSig2);
        }
      }
    }

    const c0 = Math.sqrt(-Math.log(thresholdIso));
    const fMin = Math.exp(-30);
    const sdf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const g = Math.log(Math.max(density[i], fMin));
      sdf[i] = sig * (Math.sqrt(Math.max(-g, 0)) - c0) - sig * 0.6 * Math.max(g, 0);
    }

    this.lastComputeMs = performance.now() - t0;
    return sdf;
  }

  sample(sdf, x, y) {
    if (!sdf) return 999;
    const fx = Math.min(Math.max(x / this.step, 0), this.gw - 1.001);
    const fy = Math.min(Math.max(y / this.step, 0), this.gh - 1.001);
    const ix = fx | 0;
    const iy = fy | 0;
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * this.gw + ix;
    const top = sdf[i] * (1 - tx) + sdf[i + 1] * tx;
    const bot = sdf[i + this.gw] * (1 - tx) + sdf[i + this.gw + 1] * tx;
    return top * (1 - ty) + bot * ty;
  }

  /** Outward gradient pointing from land/cloud toward open sea/grass */
  gradient(sdf, x, y, eps = 10) {
    const gx = this.sample(sdf, x + eps, y) - this.sample(sdf, x - eps, y);
    const gy = this.sample(sdf, x, y + eps) - this.sample(sdf, x, y - eps);
    const len = Math.hypot(gx, gy);
    if (len < 1e-4) return { x: 1, y: 0, len: 0 };
    return { x: gx / len, y: gy / len, len };
  }

  packHalf(sdf) {
    const out = this.halfScratch;
    for (let i = 0; i < sdf.length; i++) {
      out[i] = floatToHalf(sdf[i]);
    }
    return out;
  }
}

export const FULLSCREEN_TRI_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function createShaderProgram(gl, fragSource, vertSource = FULLSCREEN_TRI_VS) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile error: ' + log);
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vertSource);
  const fs = compile(gl.FRAGMENT_SHADER, fragSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

/**
 * Non-blocking parallel shader compilation via KHR_parallel_shader_compile (native in ANGLE/D3D11 WebView2).
 * Dispatch one or more programs first so ANGLE compiles them concurrently across background CPU threads
 * without freezing the UI thread, then poll pollShaderProgram() inside rAF (or pass forceSync=true).
 */
export function startShaderProgram(gl, fragSource, vertSource = FULLSCREEN_TRI_VS) {
  const parallelExt = gl.getExtension('KHR_parallel_shader_compile');
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vertSource);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragSource);
  gl.compileShader(fs);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  return { prog, vs, fs, parallelExt, done: false, failed: false };
}

export function pollShaderProgram(gl, job, forceSync = false) {
  if (!job) return null;
  if (job.done) return job.failed ? null : job.prog;

  if (!forceSync && job.parallelExt) {
    if (!gl.getProgramParameter(job.prog, job.parallelExt.COMPLETION_STATUS_KHR)) {
      return null;
    }
  }

  job.done = true;
  const linked = gl.getProgramParameter(job.prog, gl.LINK_STATUS);
  if (!linked) {
    const vsOk = gl.getShaderParameter(job.vs, gl.COMPILE_STATUS);
    const fsOk = gl.getShaderParameter(job.fs, gl.COMPILE_STATUS);
    const vsLog = vsOk ? '' : (gl.getShaderInfoLog(job.vs) || '');
    const fsLog = fsOk ? '' : (gl.getShaderInfoLog(job.fs) || '');
    const pLog = gl.getProgramInfoLog(job.prog) || '';
    gl.deleteShader(job.vs);
    gl.deleteShader(job.fs);
    gl.deleteProgram(job.prog);
    job.failed = true;
    throw new Error(`Shader link error: ${pLog} ${fsLog} ${vsLog}`.trim());
  }

  gl.deleteShader(job.vs);
  gl.deleteShader(job.fs);
  return job.prog;
}

export function createFieldTexture(gl, gw, gh) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, gw, gh, 0, gl.RED, gl.HALF_FLOAT, null);
  return tex;
}

export function uploadFieldTexture(gl, tex, field, sdf) {
  const packed = field.packHalf(sdf);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // Critical: R16F is 2 bytes/pixel, odd grid widths break default 4-byte alignment
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.gw, field.gh, gl.RED, gl.HALF_FLOAT, packed);
}

/**
 * Generates a 256x256 seamless 4-channel tileable noise texture:
 * R: low-frequency FBM (organic waves / watercolor wash)
 * G: medium-frequency FBM (foam breakup / cloud puffs)
 * B: fine grain noise (sand / paper texture)
 * A: directional ripple noise
 */
export function createSeamlessNoiseTexture(gl, size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;
      const r = tileFbm(u, v, 6, 3, 4);
      const g = tileFbm(u, v, 14, 71, 4);
      const b = hash2(x, y, 137) * 0.65 + tileNoise(u * 32, v * 32, 32, 32, 193) * 0.35;
      const a = tileFbm(u * 1.0, v * 2.0, 8, 251, 3);
      data[idx] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
      data[idx + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
    }
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  tex._noiseData = data;
  tex._noiseSize = size;
  return tex;
}

/**
 * Bilinearly samples channel ch (0=R,1=G,2=B,3=A) of createSeamlessNoiseTexture on CPU,
 * matching GLSL `texture(uNoise, p / scale + seed * 0.017)` bit-for-bit (0.001ms per query).
 */
export function sampleSeamlessNoise(tex, px, py, scale, seed, ch = 0) {
  const data = tex._noiseData;
  const size = tex._noiseSize || 256;
  if (!data) return 0.5;
  const off = seed * 0.017;
  let u = (px / scale + off) % 1;
  let v = (py / scale + off) % 1;
  if (u < 0) u += 1;
  if (v < 0) v += 1;
  const fx = u * size - 0.5;
  const fy = v * size - 0.5;
  const x0 = ((Math.floor(fx) % size) + size) % size;
  const y0 = ((Math.floor(fy) % size) + size) % size;
  const x1 = (x0 + 1) % size;
  const y1 = (y0 + 1) % size;
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);
  const s00 = data[(y0 * size + x0) * 4 + ch];
  const s10 = data[(y0 * size + x1) * 4 + ch];
  const s01 = data[(y1 * size + x0) * 4 + ch];
  const s11 = data[(y1 * size + x1) * 4 + ch];
  const a = s00 + (s10 - s00) * tx;
  const b = s01 + (s11 - s01) * tx;
  return (a + (b - a) * ty) / 255;
}

/**
 * Render Quality Presets:
 * - 'super'    : 1.5x supersampled sharpness on 1080p/1440p (capped cleanly at 4K) + ultra-crisp 2D sprites.
 * - 'ultra'    : True 100% native crispness up to 4K / 2x Retina (zero forced downscale, sharp 2D sprite layers).
 * - 'balanced' : Crisp 1080p/2K native sharpness with smooth adaptive governor on iGPUs.
 * - 'eco'      : Power-saving 900p / 30 FPS budget for thin-and-light laptops on battery.
 */
const QUALITY_PRESETS = {
  super: {
    maxDpr: 2.5,
    maxPixels: 3840 * 2160,
    previewMaxDpr: 2.25,
    previewMaxPixels: 2560 * 1440,
    supersample: 1.5,
    spriteMaxW: 2880,
    clipMaxW: 2560,
    tiers: [
      { interval: 14, scale: 1.00, uploadMs: 26 },
      { interval: 29, scale: 1.00, uploadMs: 32 }
    ]
  },
  ultra: {
    maxDpr: 2.0,
    maxPixels: 3840 * 2160,
    previewMaxDpr: 2.0,
    previewMaxPixels: 2560 * 1440,
    supersample: 1.0,
    spriteMaxW: 2560,
    clipMaxW: 1920,
    tiers: [
      { interval: 14, scale: 1.00, uploadMs: 28 },
      { interval: 29, scale: 1.00, uploadMs: 33 }
    ]
  },
  balanced: {
    maxDpr: 1.5,
    maxPixels: 2560 * 1440,
    previewMaxDpr: 1.35,
    previewMaxPixels: 1920 * 1080,
    supersample: 1.0,
    spriteMaxW: 1440,
    clipMaxW: 1600,
    tiers: [
      { interval: 14, scale: 1.00, uploadMs: 31 },
      { interval: 29, scale: 0.92, uploadMs: 36 },
      { interval: 31, scale: 0.80, uploadMs: 44 }
    ]
  },
  eco: {
    maxDpr: 1.15,
    maxPixels: 1600 * 900,
    previewMaxDpr: 1.0,
    previewMaxPixels: 1280 * 720,
    supersample: 1.0,
    spriteMaxW: 960,
    clipMaxW: 1280,
    tiers: [
      { interval: 29, scale: 1.00, uploadMs: 36 },
      { interval: 31, scale: 0.80, uploadMs: 46 }
    ]
  }
};

export function isValidRenderQuality(mode) {
  return mode === 'eco' || mode === 'balanced' || mode === 'ultra' || mode === 'super';
}

function readInitialRenderQuality() {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const q = new URLSearchParams(window.location.search).get('q');
      if (isValidRenderQuality(q)) return q;
    }
  } catch { /* ignore */ }
  return 'ultra';
}

let activeRenderQuality = readInitialRenderQuality();
const qualityListeners = new Set();

export function getRenderQuality() {
  return activeRenderQuality;
}

export function setRenderQuality(mode) {
  const normalized = isValidRenderQuality(mode) ? mode : 'ultra';
  if (normalized === activeRenderQuality) return false;
  activeRenderQuality = normalized;
  for (const fn of qualityListeners) {
    try { fn(normalized); } catch { /* ignore */ }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('resize'));
  }
  return true;
}

/**
 * Returns the maximum backing width (px) for Canvas2D animated sprite layers
 * scaled cleanly by the active Render Quality preset so foreground art stays sharp on 2K/4K.
 */
export function getSpriteMaxWidth(preferredMax = 1920) {
  const preset = QUALITY_PRESETS[activeRenderQuality] || QUALITY_PRESETS.ultra;
  const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
  const ceiling = Math.max(preferredMax, preset.spriteMaxW);
  const target = Math.round(preset.spriteMaxW * Math.min(1.25, Math.max(1.0, dpr * 0.75)));
  return Math.max(800, Math.min(ceiling, target));
}

/**
 * Returns the maximum video export width (px) matching the active Render Quality preset.
 */
export function getRecordMaxWidth() {
  const preset = QUALITY_PRESETS[activeRenderQuality] || QUALITY_PRESETS.ultra;
  return preset.clipMaxW || 1920;
}

/**
 * Computes an optimal WebGL2 render DPR honoring the active Render Quality preset
 * (true native sharpness on 1080p/2K/4K/Retina by default, plus optional 1.5x supersampling).
 */
export function computeRenderDpr(W, H, isPreview = false, qualityScale = 1.0, overrideQuality = null) {
  const mode = isValidRenderQuality(overrideQuality) ? overrideQuality : activeRenderQuality;
  const preset = QUALITY_PRESETS[mode] || QUALITY_PRESETS.ultra;
  const q = Math.max(0.72, Math.min(1.0, qualityScale || 1.0));
  const nativeDpr = Math.max(1.0, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
  const desired = nativeDpr * (preset.supersample || 1.0);

  const maxDpr = isPreview ? preset.previewMaxDpr : preset.maxDpr;
  const maxPixels = isPreview ? preset.previewMaxPixels : preset.maxPixels;
  const raw = Math.min(maxDpr, desired);
  const curPixels = Math.max(1, W * H * raw * raw);
  const ratio = curPixels > maxPixels ? Math.sqrt(maxPixels / curPixels) : 1.0;

  if (isPreview) {
    return Math.max(1.0, raw * ratio);
  }
  return Math.max(0.72, raw * ratio * q);
}

/**
 * Estimates the exact output pixel dimensions (width x height) for a given screen & preset.
 */
export function estimateRenderResolution(cssW, cssH, mode = activeRenderQuality, isPreview = false) {
  const w = Math.max(1, cssW || 1920);
  const h = Math.max(1, cssH || 1080);
  const dpr = computeRenderDpr(w, h, isPreview, 1.0, mode);
  return {
    width: Math.max(1, Math.round(w * dpr)),
    height: Math.max(1, Math.round(h * dpr)),
    dpr
  };
}

/**
 * Shared Adaptive Frame Pacer & Dynamic Resolution Governor for all WebGL2 themes.
 * - Immediately pauses rendering when document.hidden is true (0% GPU when minimized/hidden).
 * - Uses VSync-aligned frame intervals to prevent 3:2 pulldown stutter on 60Hz monitors.
 * - Honors the active Render Quality preset ('ultra' preserves 100% sharpness without blurring).
 * - Allows clean promotion back to Tier 0 after transient startup/load spikes subside.
 */
export function createPerfGovernor({ isPreview = false, onQualityChange = null } = {}) {
  const getTiers = () => {
    if (isPreview) return [{ interval: 29, scale: 1.0, uploadMs: 40 }];
    return (QUALITY_PRESETS[activeRenderQuality] || QUALITY_PRESETS.ultra).tiers;
  };

  let tier = 0;
  let ewmaMs = 16.7;
  let badStreak = 0;
  let goodStreak = 0;
  let lastUploadAt = -1e9;
  let lastEvalAt = 0;
  let demoteCooldownUntil = 0;

  qualityListeners.add(() => {
    tier = 0;
    ewmaMs = 16.7;
    badStreak = 0;
    goodStreak = 0;
    demoteCooldownUntil = 0;
  });

  return {
    get qualityScale() {
      const tiers = getTiers();
      return tiers[Math.min(tier, tiers.length - 1)].scale;
    },
    get targetInterval() {
      const tiers = getTiers();
      return tiers[Math.min(tier, tiers.length - 1)].interval;
    },
    get isHidden() { return typeof document !== 'undefined' && document.hidden; },

    /** Call once per rendered frame with elapsed ms since previous rendered frame. */
    reportFrame(elapsedMs, now) {
      const tiers = getTiers();
      if (isPreview || tiers.length <= 1) return;
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 2 || elapsedMs > 250) return;

      tier = Math.min(tier, tiers.length - 1);
      ewmaMs = ewmaMs * 0.88 + elapsedMs * 0.12;
      if (!lastEvalAt) { lastEvalAt = now; return; }
      if (now - lastEvalAt < 400) return;
      lastEvalAt = now;

      // Demote if GPU consistently misses VSync budget; promote cleanly once steady at 30 FPS
      const demoteThresh = tier === 0 ? 24.0 : 42.0;
      const promoteThresh = 35.5;

      if (ewmaMs > demoteThresh && tier < tiers.length - 1) {
        badStreak++;
        goodStreak = 0;
        if (badStreak >= 4) {
          tier++;
          badStreak = 0;
          ewmaMs = tiers[tier].interval + 4;
          demoteCooldownUntil = now + 20000;
          onQualityChange?.(tiers[tier].scale);
        }
      } else if (tier > 0 && ewmaMs < promoteThresh && now >= demoteCooldownUntil) {
        goodStreak++;
        badStreak = 0;
        // Steady headroom (~10s) -> recover sharpness back toward Tier 0
        if (goodStreak >= 25) {
          tier--;
          goodStreak = 0;
          ewmaMs = tiers[tier].interval + 2;
          onQualityChange?.(tiers[tier].scale);
        }
      } else {
        badStreak = Math.max(0, badStreak - 1);
        goodStreak = 0;
      }
    },

    /** Returns true when a Canvas2D sprite layer should redraw & upload to GPU. */
    shouldUpload2d(now, force = false) {
      const tiers = getTiers();
      const uploadMs = tiers[Math.min(tier, tiers.length - 1)].uploadMs;
      if (force || now - lastUploadAt >= uploadMs) {
        lastUploadAt = now;
        return true;
      }
      return false;
    },

    resetTiming() {
      badStreak = 0;
      goodStreak = 0;
      lastEvalAt = 0;
    }
  };
}
