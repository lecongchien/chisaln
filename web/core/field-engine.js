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
  return tex;
}
