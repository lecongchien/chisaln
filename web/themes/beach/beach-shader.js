/**
 * Beach Theme WebGL2 Shaders & Palm Atlas Geometry Constants
 * - Print-stipple gouache ocean, bathymetry, sun glitter, 3 swash sheets, Worley foam lace
 * - Crisp SDF kayaks (animated paddles + circular ripples) & sculpted seabirds
 * - Watercolor palm atlas vertex/fragment shaders with seabird Z-discard
 */
export const PALM_STYLES = [
  { file: 'assets/palm-windswept.png', footX: 0.881, footY: 0.97, drawW: 112, drawH: 192, leanDir: -1 },
  { file: 'assets/palm-arched.png',    footX: 0.829, footY: 0.97, drawW: 126, drawH: 168, leanDir: -1 },
  { file: 'assets/palm-tall.png',      footX: 0.168, footY: 0.97, drawW: 124, drawH: 190, leanDir:  1 }
];

export const PALM_CELL_W = 260;
export const PALM_CELL_H = 310;
export const PALM_FOOT_ANCHOR_X = 130;
export const PALM_FOOT_ANCHOR_Y = 212;

// Shared sculpted gull SDF so both beach FS (drawing birds) & palm FS (discarding canopy behind birds) match 100%
export const GULL_COMMON_GLSL = `
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec3 gullSD(vec2 q, float span) {
  float body = (length((q - vec2(0.8, 0.0)) / vec2(6.0, 1.8)) - 1.0) * 1.8;
  float tail = max(abs(q.y) - 1.35 - (-q.x - 4.0) * 0.25, max(-q.x - 8.2, q.x + 4.0));
  float y = abs(q.y), reach = 14.5 * span;
  float u = clamp((y - 1.0) / max(reach, 1.0), 0.0, 1.0);
  float lead = 1.0 + 1.3 * sin(u * 3.14159) - 4.0 * u * u;
  float chord = mix(4.2, 1.25, u);
  float wing = max(max(q.x - lead, lead - chord - q.x), y - reach - 1.0);
  return vec3(min(body, tail), wing, u);
}`;

export const BEACH_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uStep;
uniform float uDpr;
uniform float uMix;
uniform float uTime;
uniform float uSpeed;
uniform float uWaves;
uniform float uShoal;
uniform float uShallow;
uniform float uSigma;
uniform float uSeed;

uniform float uKayN;
uniform vec4 uKay[4];     // x, y, heading, paddlePhase
uniform vec4 uRip[6];     // x, y, birthTime, radiusScale
uniform float uBirdN;
uniform vec4 uBird[8];    // x, y, heading, wingSpan

out vec4 fragColor;

// Japanese gouache / print coastal palette
const vec3 SEA0 = vec3(0.74, 0.93, 0.87);
const vec3 SEA1 = vec3(0.47, 0.87, 0.84);
const vec3 SEA2 = vec3(0.17, 0.76, 0.81);
const vec3 SEA3 = vec3(0.03, 0.66, 0.79);
const vec3 SEA4 = vec3(0.00, 0.56, 0.73);

const vec3 SAND0   = vec3(0.97, 0.93, 0.88);
const vec3 SAND1   = vec3(0.91, 0.85, 0.83);
const vec3 SAND2   = vec3(0.83, 0.77, 0.79);
const vec3 SAND3   = vec3(0.72, 0.68, 0.75);
const vec3 WETSAND = vec3(0.93, 0.86, 0.72);
const vec3 FOAM    = vec3(0.98, 0.99, 0.98);

${GULL_COMMON_GLSL}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

vec4 N(vec2 p, float scale) {
  return texture(uNoise, p / scale + uSeed * 0.013);
}

float SF(vec2 p) {
  vec2 uv = (p / uStep + 0.5) / uGrid;
  return mix(texture(uFA, uv).r, texture(uFB, uv).r, uMix);
}

vec3 seaRamp(float v) {
  v = clamp(v, 0.0, 1.0) * 4.0;
  if (v < 1.0) return mix(SEA0, SEA1, v);
  if (v < 2.0) return mix(SEA1, SEA2, v - 1.0);
  if (v < 3.0) return mix(SEA2, SEA3, v - 2.0);
  return mix(SEA3, SEA4, v - 3.0);
}

vec3 sandRamp(float v) {
  v = clamp(v, 0.0, 1.0) * 3.0;
  if (v < 1.0) return mix(SAND0, SAND1, v);
  if (v < 2.0) return mix(SAND1, SAND2, v - 1.0);
  return mix(SAND2, SAND3, v - 2.0);
}

vec2 worley(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), c = i + g;
      vec2 r = g + vec2(hash(c + uSeed), hash(c + uSeed + 17.3)) * 0.8 + 0.1 - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec2(sqrt(d1), sqrt(d2));
}

float segSD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float hullSD(vec2 q) {
  float L = 21.0, Wd = 5.2;
  float t = clamp(q.x / L, -1.0, 1.0);
  float w = Wd * (1.0 - t * t);
  return max(abs(q.y) - w, abs(q.x) - L);
}

vec2 paddleSD(vec2 q, float ph) {
  float a = 1.5708 + sin(ph) * 0.52;
  vec2 dir = vec2(cos(a), sin(a)), c = vec2(0.5, 0.0);
  float shaft = segSD(q, c - dir * 12.5, c + dir * 12.5) - 0.68;
  vec2 b1 = q - (c + dir * 13.0), b2 = q - (c - dir * 13.0);
  mat2 r = rot(-a);
  vec2 l1 = r * b1, l2 = r * b2;
  float blade = min(length(l1 / vec2(3.5, 1.55)) - 1.0, length(l2 / vec2(3.5, 1.55)) - 1.0) * 1.55;
  return vec2(shaft, blade);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  float t = uTime;

  // Stationary ~1.3px screen-pixel risograph/gouache stipple grain
  vec2 gp = floor(p * (0.78 * max(uDpr, 1.0)));
  float g1 = hash2(gp + 0.5);
  float g2 = hash2(gp + 7.3);

  float s0 = SF(p);
  float s = s0 + (N(p, 700.0).r - 0.5) * 10.0;

  // Coherent wave clock along broad coastline arcs
  float lam = 72.0 / max(0.45, uWaves);
  float along = N(p, 4200.0).r * 1.15;
  float u = t * (19.0 * max(0.05, uSpeed)) / lam + along;
  float fu = fract(u);
  float cyc = floor(u);

  // Outward normal & open-sea energy (enclosed icon pockets stay calm & glassy)
  vec2 gr = vec2(SF(p + vec2(6.0, 0.0)) - SF(p - vec2(6.0, 0.0)), SF(p + vec2(0.0, 6.0)) - SF(p - vec2(0.0, 6.0)));
  vec2 nrm = length(gr) > 1e-4 ? normalize(gr) : vec2(0.0, 1.0);
  float sIn  = SF(p - nrm * 45.0);
  float sOut = SF(p + nrm * 70.0);
  float energy = mix(ss(2.0, -18.0, sIn), 1.0, ss(15.0, 40.0, s)) * ss(25.0, 70.0, sOut);

  float shoreE = 0.0, sW = s;
  if (s < 4.0 && s > -uSigma * 0.78 - 14.0) {
    float fR = SF(p + vec2(10.0, 0.0)), fL = SF(p - vec2(10.0, 0.0));
    float fD = SF(p + vec2(0.0, 10.0)), fU = SF(p - vec2(0.0, 10.0));
    vec2 g10 = vec2(fR - fL, fD - fU);
    vec2 n10 = length(g10) > 1e-3 ? normalize(g10) : nrm;
    vec2 sp = p - n10 * s0;
    shoreE = ss(2.0, -18.0, SF(sp - n10 * 45.0)) * ss(25.0, 70.0, SF(sp + n10 * 70.0));
    sW = mix(s, (fR + fL + fD + fU) * 0.25 + (s - s0), ss(-2.0, -16.0, s));
  }

  vec3 col;
  if (s > 2.0) {
    // ---------- OCEAN WITH STIPPLED BATHYMETRY & SUN GLITTER ----------
    float depth = pow(clamp(max(s - uShoal * 0.45, 0.0) / max(80.0, uShallow * 1.25), 0.0, 1.0), 0.62);
    col = seaRamp(depth + (g1 - 0.5) * 0.085);

    vec2 drift = vec2(t * 2.2, t * 0.9);
    float deepK = ss(uShallow * 0.35, uShallow * 1.1, s);
    col *= 1.0 + (N(p + drift * 4.0, 1600.0).r - 0.5) * 0.07 * ss(0.0, uShoal + 40.0, s);

    // Two rotated jittered glitter lattices clustered by large noise
    float glitterMask = ss(0.34, 0.74, N(p + drift * 3.0, 520.0).g) * deepK;
    if (glitterMask > 0.01) {
      vec2 pg1 = rot(0.37) * p / 19.0;
      vec2 c1 = floor(pg1), f1 = fract(pg1);
      vec2 o1 = vec2(hash2(c1 + 1.3), hash2(c1 + 9.7)) * 0.72 + 0.14;
      float ph1 = sin(t * (1.8 + hash2(c1 + 5.1) * 2.4) + hash2(c1 + 3.2) * 6.283);
      float dot1 = (1.0 - ss(0.04, 0.14, length(f1 - o1))) * ss(0.55, 0.96, ph1);

      vec2 pg2 = rot(-0.52) * p / 26.0;
      vec2 c2 = floor(pg2), f2 = fract(pg2);
      vec2 o2 = vec2(hash2(c2 + 13.7), hash2(c2 + 21.1)) * 0.72 + 0.14;
      float ph2 = sin(t * (1.4 + hash2(c2 + 7.9) * 2.1) + hash2(c2 + 11.4) * 6.283);
      float dot2 = (1.0 - ss(0.04, 0.13, length(f2 - o2))) * ss(0.60, 0.96, ph2);

      col = mix(col, FOAM, clamp((dot1 + dot2 * 0.8) * glitterMask * 0.85, 0.0, 0.9));
    }

    // Shallow turquoise caustics broken with Worley cells & stipple grain
    float shoalFade = (1.0 - ss(uShoal * 0.25, max(40.0, uShoal * 1.45), s)) * ss(3.0, 18.0, s);
    if (shoalFade > 0.01) {
      vec2 wc = worley((p + vec2(t * 4.5, -t * 2.6)) / 24.0);
      float net = (1.0 - ss(0.04, 0.18, wc.y - wc.x)) * shoalFade;
      col = mix(col, SEA0 * 1.04, step(g2, net * 0.65) * 0.42 + net * 0.18);
    }

    // Crisp stippled offshore incoming wave crests
    float wPhase = fract(s / lam + u);
    float wDist = abs(wPhase - 0.5) * lam;
    float wEnv = ss(10.0, 34.0, s) * (1.0 - ss(160.0, 340.0, s)) * energy;
    if (wEnv > 0.01) {
      float brk = ss(0.32, 0.76, N(p + vec2(t * 3.0, 0.0), 210.0).g);
      float crest = (1.0 - ss(0.8, 2.2, wDist)) * wEnv * brk * 0.78;
      float spray = exp(-max(wDist - 1.5, 0.0) / 6.5) * wEnv * brk * 0.42;
      col = mix(col, FOAM, max(crest, step(g2, spray)));
    }

    // Expanding circular kayak paddle ripples on ocean surface
    for (int i = 0; i < 6; i++) {
      vec4 rp = uRip[i];
      if (rp.w <= 0.0) continue;
      float age = t - rp.z;
      if (age < 0.0 || age > 2.2) continue;
      float rad = 4.0 + age * 14.0 * rp.w;
      float dr = abs(length(p - rp.xy) - rad);
      float ring = (1.0 - ss(0.4, 1.7, dr)) * (1.0 - age / 2.2) * 0.52;
      col = mix(col, FOAM, ring);
    }
  } else {
    // ---------- WARM SAND WITH DUSTY-MAUVE SHADOW GRADATION + STIPPLE ----------
    float wet = ss(-26.0, 2.0, s);
    float sandV = clamp(wet * 0.72 + (g1 - 0.5) * 0.09, 0.0, 1.0);
    col = sandRamp(sandV);
    col = mix(col, WETSAND, clamp(wet * 0.65, 0.0, 0.7));
    col *= 1.0 - 0.035 * ss(0.4, 0.8, N(p, 900.0).r) * (1.0 - wet);
  }

  // ---------- 3 OVERLAPPING THIN SWASH WATER SHEETS ON SAND ----------
  float reachBase = min(30.0 * shoreE * (0.85 + 0.30 * N(p, 900.0).g), uSigma * 0.76);
  float wk = (1.0 - ss(2.0, 38.0, s)) * mix(1.0, energy, ss(2.0, 10.0, s));
  if ((s < 4.0 && reachBase > 0.5) || (s >= 4.0 && wk > 0.01)) {
    const vec3 FILM = WETSAND;
    const vec3 MARK = WETSAND * 0.965;
    float onSand = step(s, 4.0);
    vec2 wl = worley((p - nrm * fu * 8.0) / 7.5);
    float laceNet = (1.0 - ss(0.03, 0.11, wl.y - wl.x)) * ss(0.40, 0.64, N(p + vec2(t * 2.0, 0.0), 120.0).g);

    float wetMem = 0.0, filmA = 0.0;
    vec4 layers[3];
    for (int j = 0; j < 3; j++) {
      float a = fu + float(j);
      float amp = reachBase * (0.52 + 0.48 * hash(vec2(cyc - float(j), 3.7)));
      float front = a < 0.45
        ? mix(3.0, -amp, 1.0 - pow(1.0 - a / 0.45, 2.2))
        : mix(-amp, 3.0, ss(0.45, 1.4, a));
      float reached = ss(-amp - 4.0, -amp + 12.0, sW);
      wetMem = max(wetMem, reached * (1.0 - ss(0.45, 2.8, a)) * ss(0.20, 0.45, a));
      float alpha = a < 0.45 ? 0.42 : 0.42 * (1.0 - ss(0.45, 1.4, a));
      float feather = 1.0 + 16.0 * ss(0.45, 1.1, a);
      filmA = max(filmA, ss(front - 1.0, front + feather, sW) * alpha * 1.55);
      layers[j] = vec4(front, a, amp, feather);
    }

    col = mix(col, MARK, wetMem * 0.22 * wk);
    col = mix(col, mix(col * vec3(0.98, 0.96, 0.90), FILM, 0.58), filmA * wk);

    for (int j = 2; j >= 0; j--) {
      float front = layers[j].x, a = layers[j].y, feather = layers[j].w;
      float cov = ss(front - 1.0, front + feather, sW);
      float lace = laceNet * cov * ss(0.40, 0.60, a) * (1.0 - ss(0.70, 1.40, a)) * wk;
      col = mix(col, FOAM, lace * 0.74);

      float edgeK = a < 0.45 ? 1.0 : 1.0 - ss(0.45, 1.05, a);
      float d = sW - front;
      float lineE = (1.0 - ss(0.8, 1.9, abs(d - 0.9))) * edgeK * onSand;
      float sprayE = exp(-max(d, 0.0) / 5.2) * cov * edgeK * 0.50 * onSand;
      col = mix(col, FOAM, max(lineE * 0.95, step(g1, sprayE)));
    }
  }

  // ---------- CRISP ANTI-ALIASED SDF KAYAKS ----------
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uKayN) break;
    vec4 k = uKay[i];
    vec2 q = rot(-k.z) * (p - k.xy);
    if (dot(q, q) > 1024.0) continue;

    // Subtle sunken shadow on seabed
    vec2 qs = rot(-k.z) * (p - (k.xy + vec2(4.0, 5.5)));
    float shMask = ss(1.6, -1.2, hullSD(qs));
    col = mix(col, col * vec3(0.62, 0.72, 0.76), shMask * 0.48);

    float sd = hullSD(q);
    vec2 pd = paddleSD(q, k.w);
    float mHull = ss(0.7, -0.7, sd);
    if (mHull > 0.0) {
      float tt = clamp(q.x / 21.0, -1.0, 1.0);
      float wd = 5.2 * (1.0 - tt * tt);
      vec3 baseA = mod(float(i), 2.0) < 0.5 ? vec3(0.98, 0.83, 0.22) : vec3(0.92, 0.46, 0.34);
      vec3 baseB = mod(float(i), 2.0) < 0.5 ? vec3(1.00, 0.93, 0.48) : vec3(0.98, 0.62, 0.46);
      vec3 baseC = mod(float(i), 2.0) < 0.5 ? vec3(0.86, 0.62, 0.12) : vec3(0.72, 0.30, 0.22);
      vec3 hull = mix(baseA, baseB, 1.0 - ss(0.2, 0.7, abs(q.y) / max(wd, 0.5)));
      hull = mix(hull, baseC, ss(0.78, 1.0, abs(q.y) / max(wd, 0.5)));
      // Hatch dots
      hull = mix(hull, vec3(0.97, 0.96, 0.91), 1.0 - ss(0.9, 1.5, length(q - vec2(12.5, 0.0))));
      hull = mix(hull, vec3(0.97, 0.96, 0.91), 1.0 - ss(0.9, 1.5, length(q - vec2(-11.5, 0.0))));
      // Cockpit
      hull = mix(hull, vec3(0.28, 0.23, 0.19), 1.0 - ss(0.0, 0.6, length((q - vec2(-1.0, 0.0)) / vec2(5.6, 2.7)) - 1.0));
      col = mix(col, hull, mHull);
    }

    // Paddler (coral-orange vest + woven straw hat)
    float vest = ss(0.6, -0.6, length((q - vec2(-0.8, 0.0)) / vec2(2.6, 3.6)) - 1.0);
    col = mix(col, vec3(0.94, 0.46, 0.24), vest);
    float hat = ss(0.55, -0.55, length(q - vec2(-0.5, 0.0)) - 2.35);
    col = mix(col, vec3(0.94, 0.87, 0.70), hat);
    float crown = ss(0.45, -0.45, length(q - vec2(-0.5, 0.0)) - 1.25);
    col = mix(col, vec3(0.74, 0.44, 0.30), crown * 0.55);

    // Twin-blade paddle over cockpit
    col = mix(col, vec3(0.26, 0.22, 0.19), ss(0.55, -0.55, pd.x));
    col = mix(col, vec3(0.86, 0.30, 0.24), ss(0.55, -0.55, pd.y));
  }

  // ---------- CRISP SCULPTED SEABIRDS + DISTANT SHADOWS ----------
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uBirdN) break;
    vec4 b = uBird[i];
    // Distant soft shadow on ocean/sand
    vec2 qs = rot(-b.z) * (p - (b.xy + vec2(22.0, 28.0)));
    if (dot(qs, qs) < 420.0) {
      vec3 bs = gullSD(qs, b.w);
      float bm = ss(1.4, -0.6, min(bs.x, bs.y));
      col = mix(col, col * vec3(0.70, 0.76, 0.80), bm * 0.36);
    }
    // Crisp white seabird with slate wingtips
    vec2 q = rot(-b.z) * (p - b.xy);
    if (dot(q, q) < 400.0) {
      vec3 g = gullSD(q, b.w);
      float dMin = min(g.x, g.y);
      float m = ss(0.65, -0.55, dMin);
      if (m > 0.0) {
        vec3 birdCol = mix(vec3(0.98, 0.98, 0.96), vec3(0.84, 0.87, 0.90), ss(0.2, 0.85, g.z) * 0.45);
        birdCol = mix(birdCol, vec3(0.24, 0.27, 0.30), ss(0.76, 0.94, g.z) * step(g.y, g.x + 0.5));
        col = mix(col, birdCol, m);
      }
    }
  }

  fragColor = vec4(col, 1.0);
}`;

export const PALM_VS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec4 uPalm;
uniform float uMirror;
uniform float uTime;
uniform float uPhase;
uniform float uSpeed;
out vec2 vUV;

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 local = corner * vec2(${PALM_CELL_W}.0, ${PALM_CELL_H}.0) - vec2(${PALM_FOOT_ANCHOR_X}.0, ${PALM_FOOT_ANCHOR_Y}.0);
  local.x *= uMirror;
  float sway = sin(uTime * 0.65 * max(0.25, uSpeed) + uPhase) * 0.011;
  float c = cos(sway), s = sin(sway);
  local = mat2(c, s, -s, c) * local;
  vec2 p = uPalm.xy + local * uPalm.z;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
  vUV = vec2((corner.x + uPalm.w) / ${PALM_STYLES.length}.0, corner.y);
}`;

export const PALM_FS = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uResPx;
uniform float uDpr;
uniform float uBirdN;
uniform vec4 uBird[8];
in vec2 vUV;
out vec4 fragColor;

${GULL_COMMON_GLSL}

void main() {
  vec4 tree = texture(uAtlas, vUV);
  if (tree.a < 0.003) discard;
  vec2 p = vec2(gl_FragCoord.x, uResPx.y - gl_FragCoord.y) / uDpr;
  // Seabirds always fly ABOVE palm canopies
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uBirdN) break;
    vec4 b = uBird[i];
    vec2 q = rot(-b.z) * (p - b.xy);
    if (dot(q, q) < 400.0) {
      vec3 g = gullSD(q, b.w);
      if (min(g.x, g.y) < 0.6) discard;
    }
  }
  fragColor = tree;
}`;
