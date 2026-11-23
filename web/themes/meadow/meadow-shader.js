/**
 * Meadow Theme WebGL2 Shader & Spatial Cloud Grid Constants
 * Studio Ghibli Hand-Painted Aerial Meadow Architecture:
 *   1. Watercolor grass base + dense anisotropic wind-combed turf + slow organic rolling wind gusts
 *   2. Seamless 3x3 top-down curved swaying grass tufts & nodding wildflowers
 *   3. Natural Meadow Pond reflecting summer sky + lily pads (Day) / shimmering crescent moon + stars (Night)
 *   4. True off-screen upper-left moonlight flood (ZERO floating sticker, ZERO stair-stepped ghost shadows!)
 *   5. Kite Boy & Black Kitten ON THE GRASS (underneath clouds, color-graded in moonlight)
 *   6. Single crisp high-altitude cloud shadow cast far southeast (+110, +148 px)
 *   7. Warm honey-gold fireflies (Night) & sunlit pollen motes (Day)
 *   8. Fine 64px-grid Ghibli cel-shaded cumulus clouds (ZERO rectangular cracks)
 */
export const CELL_G = 64;
export const CIRC_K = 48;
export const PAD_TL = 7;
export const PAD_BR = 5;

export const MEADOW_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform highp sampler2D uCirc;
uniform sampler2D uCat;
uniform sampler2D uActor;
uniform sampler2D uActorShadow;
uniform sampler2D uMoonTex;

uniform vec2 uRes;
uniform vec2 uGrid;
uniform vec2 uCGrid;
uniform float uStep;
uniform float uDpr;
uniform float uMix;
uniform float uTime;
uniform float uWindTime;    // Smooth wind-integrated clock driven by flow speed slider
uniform float uFlowers;
uniform float uEdge;
uniform float uSeed;
uniform float uSunset;      // 0.0 -> 1.0 = golden-hour sunset ("ánh chiều tà")
uniform float uNight;       // 0.0 = sunlit day, 1.0 = moonlit night meadow
uniform float uMoonPhase;   // 0=New, 0.25=First Qtr, 0.5=Full (100%), 0.75=Last Qtr
uniform vec4 uPond;         // xy = pond center CSS px, zw = radii (rx, ry); z <= 0 hides pond
uniform vec4 uWindA[4];     // (ox, oy, angle, headX)
uniform vec4 uWindB[4];     // (length, amp, freq, phase)
uniform vec4 uWindC[4];     // (curlX, curlSign, curlR, lifeAlpha)

uniform vec4 uCatRect;      // xy = top-left CSS px, zw = size CSS px (z=0 disables)
uniform vec2 uCatShadow;
uniform vec4 uCatAnim;      // x = tailWavePhase, y = tailSwishAmp, z = breathVal, w = earTwitch
uniform float uCatBlink;    // 0 = eyes open, 1 = sleepy eyelids softly closed
uniform vec4 uActorRect;    // xy = top-left CSS px, zw = size CSS px (z=0 disables)

out vec4 fragColor;

// Daytime Studio Ghibli hand-painted watercolor palette (rich emerald depth matching Kazuo Oga brushwork)
const vec3 G_LIGHT      = vec3(0.745, 0.822, 0.495);
const vec3 G_MID        = vec3(0.585, 0.725, 0.392);
const vec3 G_DEEP       = vec3(0.455, 0.625, 0.315);
const vec3 G_GUST_HI    = vec3(0.835, 0.898, 0.558);
const vec3 INK          = vec3(0.240, 0.392, 0.172);
const vec3 SHADOW       = vec3(0.585, 0.692, 0.542);
const vec3 CLOUD_HI     = vec3(0.996, 0.994, 0.976);
const vec3 CLOUD_BODY   = vec3(0.902, 0.934, 0.962);
const vec3 CLOUD_SH     = vec3(0.735, 0.802, 0.882);

// Refined Photographic Golden-Hour Sunset Studio Ghibli palette ("Hoàng hôn / Ánh chiều tà":
// deep velvety twilight-olive meadow + warm burnished amber wind crests + cool slate-mauve shadows + natural apricot-cream clouds)
const vec3 S_G_LIGHT    = vec3(0.365, 0.435, 0.195);
const vec3 S_G_MID      = vec3(0.210, 0.328, 0.172);
const vec3 S_G_DEEP     = vec3(0.095, 0.188, 0.162);
const vec3 S_G_GUST_HI  = vec3(0.695, 0.565, 0.245);
const vec3 S_INK        = vec3(0.075, 0.145, 0.125);
const vec3 S_SHADOW     = vec3(0.455, 0.470, 0.595);
const vec3 S_CLOUD_HI   = vec3(0.995, 0.855, 0.655);
const vec3 S_CLOUD_BODY = vec3(0.845, 0.605, 0.545);
const vec3 S_CLOUD_SH   = vec3(0.345, 0.365, 0.495);
const vec3 SUNSET_TINT  = vec3(0.985, 0.695, 0.395);

// Moonlit Night Studio Ghibli watercolor palette (deep cool jade-indigo meadow + misty silver-blue clouds)
const vec3 N_G_LIGHT    = vec3(0.168, 0.298, 0.332);
const vec3 N_G_MID      = vec3(0.088, 0.180, 0.236);
const vec3 N_G_DEEP     = vec3(0.046, 0.106, 0.168);
const vec3 N_G_GUST_HI  = vec3(0.285, 0.468, 0.525);
const vec3 N_INK        = vec3(0.028, 0.068, 0.112);
const vec3 N_SHADOW     = vec3(0.455, 0.535, 0.675);
const vec3 N_CLOUD_HI   = vec3(0.635, 0.750, 0.875);
const vec3 N_CLOUD_BODY = vec3(0.228, 0.308, 0.432);
const vec3 N_CLOUD_SH   = vec3(0.112, 0.164, 0.268);
const vec3 MOON_TINT    = vec3(0.735, 0.885, 0.980);

const vec2 LIGHT      = vec2(-0.6, -0.8);
const vec2 SHADOW_OFF = vec2(110.0, 148.0);
const vec2 WIND_DIR   = vec2(0.848, 0.530); // Natural breeze flowing toward ESE
const vec2 WIND_PERP  = vec2(-0.530, 0.848);
const vec2 CLOUD_DIR  = vec2(0.9507, 0.3102); // Gentle high-altitude ESE cloud drift
const vec2 CLOUD_PERP = vec2(-0.3102, 0.9507);

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

vec3 moodMix(vec3 dayC, vec3 sunC, vec3 ngtC, float sunset, float night) {
  float dayW = max(0.0, 1.0 - sunset - night);
  float sumW = max(0.001, dayW + sunset + night);
  return (dayC * dayW + sunC * sunset + ngtC * night) / sumW;
}

vec4 N(vec2 p, float scale) {
  return texture(uNoise, p / scale + uSeed * 0.013);
}

float fieldS(vec2 p) {
  vec2 uv = (p / uStep + 0.5) / uGrid;
  return mix(texture(uFA, uv).r, texture(uFB, uv).r, uMix);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 segDT(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return vec2(length(pa - ba * h), h);
}

// Dynamic rolling Studio Ghibli wind-gust fronts sweeping across tall meadow grass!
// Returns vec2(leadingCrest [0..1], trailingTrough [0..1]) so gusts visibly bow & shimmer the field
vec2 meadowWindWave(vec2 p, float wt) {
  vec2 drift1 = -WIND_DIR * (wt * 46.0);
  vec2 drift2 = -WIND_DIR * (wt * 76.0) + WIND_PERP * (wt * 14.0);
  float f1 = N(p + drift1, 860.0).r;
  float f2 = N(p + drift2, 410.0).g;

  // Curved organic gust fronts sweeping across the meadow (non-uniform surging arcs, ZERO mechanical stripes!)
  float crossBend = sin(dot(p, WIND_PERP) * 0.0042 + wt * 0.28) * 95.0 + (f1 - 0.5) * 320.0;
  float along = dot(p, WIND_DIR) + crossBend;

  // Two interlocking traveling gust swells at incommensurate wavelengths for natural lulls & surges
  float phase1 = fract(along * 0.00145 - wt * 0.135);
  float phase2 = fract(along * 0.00235 - wt * 0.195 + 0.37);
  float g1Crest  = exp(-pow((phase1 - 0.24) / 0.115, 2.0));
  float g1Trough = exp(-pow((phase1 - 0.42) / 0.155, 2.0));
  float g2Crest  = exp(-pow((phase2 - 0.30) / 0.125, 2.0)) * 0.72;
  float g2Trough = exp(-pow((phase2 - 0.49) / 0.160, 2.0)) * 0.65;

  // Localized gust envelopes so gusts roll in organic patches across the field
  float patchEnv = 0.32 + 0.68 * ss(0.24, 0.78, f1 * 0.52 + f2 * 0.48);
  // Subtle rapid secondary shimmer riding atop active gusts
  float ripple = 0.5 + 0.5 * sin(along * 0.022 - wt * 2.1 + f2 * 4.0);

  float crest  = clamp((max(g1Crest, g2Crest) * 0.88 + ripple * 0.24 * patchEnv) * patchEnv, 0.0, 1.0);
  float trough = clamp(max(g1Trough, g2Trough) * patchEnv, 0.0, 1.0);
  return vec2(crest, trough);
}

// Painterly multi-scale gouache meadow turf texture (tight organic grass brushstrokes — ZERO blurry stripes!)
vec2 anisotropicTurf(vec2 p, float wt, float windCrest) {
  // Subtle organic warp so brushstrokes follow natural meadow contours instead of straight lines
  vec4 warpN = N(p, 580.0);
  vec2 q = p + (warpN.rg - 0.5) * 42.0;
  vec2 windUV = vec2(dot(q, WIND_DIR) * 0.64, dot(q, WIND_PERP) * 1.24);
  vec2 shift = vec2(-windCrest * 14.0 - sin(wt * 1.45 + windUV.y * 0.025) * 2.2, windCrest * 2.2);
  float turfMed  = N(windUV + shift, 310.0).g;
  float turfFine = N(windUV * 1.45 + shift * 1.35 + vec2(37.0, 19.0), 165.0).a;
  float combed = turfMed * 0.54 + turfFine * 0.46;
  float ridgeHi = ss(0.48, 0.82, combed) * (0.28 + 0.72 * windCrest);
  float furrow  = ss(0.54, 0.20, combed);
  return vec2(furrow, ridgeHi);
}

// Dense, lively swaying Studio Ghibli meadow grass tufts (\ | /) reacting vividly to rolling wind gusts!
// Clip-free 3x2 grid with tall patchy reed/grass clumps + crisp root shade & sunlit bent tips
vec2 swayingMeadowGrass(vec2 p, float wt, float windCrest, float windTrough) {
  const vec2 G = vec2(20.0, 16.0);
  vec2 c0 = vec2(floor((p.x - 4.0) / G.x), floor((p.y + 6.0) / G.y - 0.5));
  float shade = 0.0;
  float glint = 0.0;

  for (int jy = 0; jy <= 1; jy++) {
    for (int jx = -1; jx <= 1; jx++) {
      vec2 c = c0 + vec2(float(jx), float(jy));
      float h1 = hash2(c + 3.1);
      vec2 cp = (c + 0.5) * G;

      // Natural clump density variation: lush tall meadow patches vs calmer velvety turf
      float clumpField = N(cp, 480.0).r * 0.65 + N(cp + 71.0, 210.0).g * 0.35;
      float dens = 0.52 * ss(0.22, 0.76, clumpField) + 0.42;
      if (h1 > dens) continue;

      float h2 = hash2(c + 11.7);
      float h3 = hash2(c + 23.9);
      float h4 = hash2(c + 41.3);

      vec2 root = (c + vec2(0.25 + 0.50 * h2, 0.25 + 0.50 * h3)) * G;
      vec2 rel = p - root;
      if (rel.x < -8.0 || rel.x > 17.5 || rel.y < -14.5 || rel.y > 2.5) continue;

      float tallPatch = ss(0.40, 0.78, clumpField);
      float baseH = 6.2 + (4.2 + 2.8 * tallPatch) * (0.35 + 0.65 * h4 * h4);
      float gust = clamp(windCrest * (0.85 + 0.45 * h4) + windTrough * 0.25, 0.0, 1.30);
      float flutter = sin(wt * (2.6 + h2 * 1.8) + h3 * 6.283 + dot(root, WIND_DIR) * 0.032) * (0.06 + gust * 0.16);
      float bend = clamp(0.14 + gust * 0.74 + flutter, -0.05, 0.98);
      float tuftAlpha = 0.58 + 0.38 * h4;
      int bCount = h4 > 0.26 ? 3 : 2;

      for (int k = 0; k < 3; k++) {
        if (k >= bCount) break;
        float lean0 = (k == 0 ? -0.46 : (k == 1 ? 0.02 : 0.44)) + (h2 - 0.5) * 0.24;
        float hSc   = (k == 0 ?  0.76 : (k == 1 ? 1.00 : 0.84)) + (h3 - 0.5) * 0.16;
        float ox    = (k == 0 ? -1.55 : (k == 1 ? 0.00 : 1.50));
        float stiff = (k == 0 ?  0.86 : (k == 1 ? 1.14 : 0.96));
        float wSc   = (k == 0 ?  0.84 : (k == 1 ? 1.00 : 0.88));

        float bh = clamp(baseH * hSc, 3.0, 12.8);
        float bBend = bend * stiff;
        float uRaw = -rel.y / bh;
        float u = clamp(uRaw, 0.0, 1.0);
        float curveX = (lean0 * u + bBend * u * u) * bh;
        float slope = lean0 + 2.0 * bBend * u;
        float dx = ((rel.x - ox) - curveX) * inversesqrt(1.0 + slope * slope);
        float capY = max(0.0, -uRaw) * bh + max(0.0, uRaw - 1.0) * bh;
        float dist = length(vec2(dx, capY));

        float taper = u * (1.20 - 0.20 * u);
        float thick = 1.02 * (1.0 - 0.76 * taper) * wSc;
        float rootMerge = ss(0.0, 0.14, u);
        float m = (1.0 - ss(thick * 0.22, thick + 0.55, dist)) * tuftAlpha;
        shade = max(shade, m * (1.0 - ss(0.30, 0.80, u)) * (0.60 + 0.40 * rootMerge));
        glint = max(glint, m * ss(0.22, 0.84, u) * (0.78 + 0.35 * gust));
      }
    }
  }
  return vec2(clamp(shade, 0.0, 1.0), clamp(glint, 0.0, 1.0));
}

// Organic hand-painted meadow pond SDF (negative inside water, positive on grass)
float pondSD(vec2 p) {
  if (uPond.z <= 1.0) return 999.0;
  vec2 rel = p - uPond.xy;
  vec2 q = rel / max(uPond.zw, vec2(1.0));
  // Subtle organic kidney curve + watercolor shoreline irregularity
  q.y += 0.14 * sin(q.x * 2.15 + 0.4);
  float w = (N(p, 210.0).r - 0.5) * 0.24 + (N(p + 83.0, 95.0).g - 0.5) * 0.09;
  float avgR = (uPond.z + uPond.w) * 0.5;
  return (length(q) - 1.0 + w) * avgR;
}

struct CloudMacro {
  float dIcon;
  float domeIcon;
  float dSky;
  float domeSky;
  float thickSky;
};

// Single-loop spatial hash evaluation separating stationary icon cloud deck (c.w <= 0)
// from drifting sky clouds (c.w > 0 = cloud fullness), with C1-smooth pillow dome height
CloudMacro evalCloudMacro(vec2 q) {
  CloudMacro m;
  m.dIcon = fieldS(q) - uEdge + 48.0;
  m.domeIcon = clamp((-m.dIcon) / 62.0, 0.0, 0.82);
  m.dSky = 999.0;
  m.domeSky = 0.0;
  m.thickSky = 0.85;

  ivec2 cell = ivec2(floor(q / ${CELL_G}.0)) + ${PAD_TL};
  if (cell.x < 0 || cell.y < 0 || float(cell.x) >= uCGrid.x || float(cell.y) >= uCGrid.y) return m;

  float skyW = 0.0;
  float skyT = 0.0;

  for (int k = 0; k < ${CIRC_K}; k++) {
    vec4 c = texelFetch(uCirc, ivec2(cell.x * ${CIRC_K} + k, cell.y), 0);
    if (c.z <= 0.0) break;
    float dist = length(q - c.xy);
    float di = dist - c.z;
    float u = clamp(dist / max(c.z, 1.0), 0.0, 1.0);
    float puffDome = (1.0 - u * u);
    puffDome *= puffDome;

    if (c.w <= 0.0) {
      m.dIcon = smin(m.dIcon, di, 18.0);
      float wDom = puffDome * clamp(c.z / 54.0, 0.45, 0.92);
      m.domeIcon = 1.0 - (1.0 - m.domeIcon) * (1.0 - wDom * 0.72);
    } else {
      m.dSky = smin(m.dSky, di, 16.0);
      float wDom = puffDome * clamp(c.z / 42.0, 0.48, 0.95);
      m.domeSky = 1.0 - (1.0 - m.domeSky) * (1.0 - wDom * 0.76);
      float tw = max(0.0, 1.0 - max(0.0, di) / 30.0);
      tw *= tw;
      skyT += c.w * tw;
      skyW += tw;
    }
  }
  if (skyW > 1e-4) m.thickSky = skyT / skyW;
  return m;
}

// Multi-scale domain-warped cumulus turbulence (127px wind-sculpted lobes -> 48px billows -> 17px tufts -> 8px wisps)
// Returns vec2(fbmEdge [0..1], billowHeight [0..1])
vec2 sampleCloudNoise(vec2 q, float evolve) {
  vec2 ev = vec2(evolve * 0.45, sin(evolve * 0.05) * 6.0);
  // Subtle ~1.30:1 breeze elongation on macro shapes so trailing fringes feather naturally with the wind
  vec2 qStretch = vec2(dot(q, CLOUD_DIR) * 0.86, dot(q, CLOUD_PERP) * 1.12);
  vec4 nLarge = N(qStretch + ev, 760.0);
  vec2 warp = (vec2(nLarge.r, nLarge.a) - 0.5) * 56.0;

  vec4 nMed  = N(q + warp - CLOUD_DIR * (evolve * 0.28) + vec2(91.0, 37.0), 340.0);
  vec4 nFine = N(q + warp * 0.55 + CLOUD_DIR * (evolve * 0.40) + vec2(173.0, 113.0), 210.0);

  // Remap seamless 4-octave FBM (~0.24..0.76) to crisp full-range [0..1] organic vapor edge
  float rawEdge = nLarge.r * 0.38 + nMed.r * 0.30 + nMed.g * 0.20 + nFine.g * 0.12;
  float fbmEdge = ss(0.24, 0.76, rawEdge);

  // Rounded billowing cumulus domes (soft cauliflower relief across interior & edges)
  float bLarge = 1.0 - abs(nLarge.r * 2.0 - 1.0);
  float bMed   = 1.0 - abs(nMed.r * 2.0 - 1.0);
  float bFine  = 1.0 - abs(nFine.g * 2.0 - 1.0);
  float rawBillow = bLarge * 0.34 + bMed * 0.38 + nMed.g * 0.16 + bFine * 0.12;
  float billow = ss(0.48, 0.92, rawBillow);

  return vec2(fbmEdge, billow);
}

// Fast 2-tap phase-locked macro edge noise shared by mid-range self-shadowing & ground cloud shadows
float sampleCloudMacroNoise(vec2 q, float evolve) {
  vec2 ev = vec2(evolve * 0.45, sin(evolve * 0.05) * 6.0);
  vec2 qStretch = vec2(dot(q, CLOUD_DIR) * 0.86, dot(q, CLOUD_PERP) * 1.12);
  vec4 nLarge = N(qStretch + ev, 760.0);
  vec2 warp = (vec2(nLarge.r, nLarge.a) - 0.5) * 48.0;
  float nMedR = N(q + warp - CLOUD_DIR * (evolve * 0.28) + vec2(91.0, 37.0), 340.0).r;
  return ss(0.24, 0.76, nLarge.r * 0.55 + nMedR * 0.45);
}

// Evaluates combined volumetric cloud density & 3D cumulus height at pixel p (zero noise swimming!)
// Returns vec2(density, height)
vec2 evalCloudAt(vec2 p, float wt) {
  CloudMacro m = evalCloudMacro(p);
  float densIcon = -0.25;
  float hIcon = 0.0;
  float densSky = -0.25;
  float hSky = 0.0;

  if (m.dIcon < 24.0) {
    vec2 qI = p - CLOUD_DIR * (wt * 2.2);
    vec2 nI = sampleCloudNoise(qI, wt * 2.6);
    float env = ss(22.0, -30.0, m.dIcon);
    float erode = mix(0.56, 0.16, ss(-2.0, -32.0, m.dIcon));
    densIcon = env - (1.0 - nI.x) * erode;
    hIcon = clamp(max(0.0, densIcon) * 0.54 + m.domeIcon * 0.30 + nI.y * 0.40 * ss(-0.04, 0.26, densIcon), 0.0, 1.25);
  }

  if (m.dSky < 24.0) {
    vec2 qS = p - CLOUD_DIR * (wt * 10.6);
    vec2 nS = sampleCloudNoise(qS, wt * 3.6 + 19.0);
    float env = ss(22.0, -28.0, m.dSky);
    float erode = mix(0.62, 0.18, ss(-2.0, -28.0, m.dSky));
    densSky = (env - (1.0 - nS.x) * erode) * m.thickSky;
    hSky = clamp(max(0.0, densSky) * 0.52 + m.domeSky * 0.34 + nS.y * 0.42 * ss(-0.04, 0.26, densSky), 0.0, 1.25);
  }

  // Smooth volumetric union of icon cloud deck & drifting sky clouds
  float dens = max(densIcon, densSky);
  if (densIcon > 0.0 && densSky > 0.0) {
    dens = min(1.15, dens + min(densIcon, densSky) * 0.22);
  }
  float h = max(hIcon, hSky);
  return vec2(dens, h);
}

// Lightweight mid-range optical depth probe toward LIGHT (1 grid lookup + 2 phase-locked noise taps)
float evalCloudLightSample(vec2 p, float wt) {
  CloudMacro m = evalCloudMacro(p);
  float dBest = -0.25;
  if (m.dIcon < 24.0) {
    vec2 qI = p - CLOUD_DIR * (wt * 2.2);
    float n = sampleCloudMacroNoise(qI, wt * 2.6);
    float env = ss(22.0, -30.0, m.dIcon);
    dBest = max(dBest, env - (1.0 - n) * mix(0.56, 0.16, ss(-2.0, -32.0, m.dIcon)));
  }
  if (m.dSky < 24.0) {
    vec2 qK = p - CLOUD_DIR * (wt * 10.6);
    float n = sampleCloudMacroNoise(qK, wt * 3.6 + 19.0);
    float env = ss(22.0, -28.0, m.dSky);
    dBest = max(dBest, (env - (1.0 - n) * mix(0.62, 0.18, ss(-2.0, -28.0, m.dSky))) * m.thickSky);
  }
  return max(0.0, dBest);
}

// Soft feathered high-altitude cloud shadow mask (matches organic wispy cloud contours, ZERO hard black cutouts)
float evalCloudShadow(vec2 pSh, float wt) {
  CloudMacro m = evalCloudMacro(pSh);
  float sh = 0.0;
  if (m.dIcon < 30.0) {
    vec2 qI = pSh - CLOUD_DIR * (wt * 2.2);
    float n = sampleCloudMacroNoise(qI, wt * 2.6);
    float env = ss(28.0, -34.0, m.dIcon);
    float d = env - (1.0 - n) * mix(0.48, 0.14, ss(-4.0, -34.0, m.dIcon));
    sh = max(sh, ss(-0.04, 0.52, d));
  }
  if (m.dSky < 30.0) {
    vec2 qK = pSh - CLOUD_DIR * (wt * 10.6);
    float n = sampleCloudMacroNoise(qK, wt * 3.6 + 19.0);
    float env = ss(28.0, -32.0, m.dSky);
    float d = (env - (1.0 - n) * mix(0.52, 0.16, ss(-4.0, -32.0, m.dSky))) * m.thickSky;
    sh = max(sh, ss(-0.04, 0.54, d) * clamp(m.thickSky * 0.94, 0.48, 1.0));
  }
  return clamp(sh, 0.0, 1.0);
}

// Renders natural Studio Ghibli meadow pond reflecting daytime sky, golden sunset sky + setting sun, OR nighttime crescent moon + stars
vec3 shadeMeadowPond(vec2 p, vec3 grassCol, float dPond, float sunset, float night, float wt, float windWave, float cloudShMask) {
  vec3 col = grassCol;

  // 1. Damp mossy grass bank & tiny river pebbles hugging the pond rim (0..13 px outside water)
  float bankMask = (1.0 - ss(-1.0, 13.0, dPond)) * ss(-2.5, 1.0, dPond);
  vec3 bankTint = moodMix(vec3(0.38, 0.54, 0.29), vec3(0.32, 0.27, 0.22), vec3(0.06, 0.14, 0.20), sunset, night);
  col = mix(col, mix(col, bankTint, 0.55), bankMask * 0.72);

  // Subtle shoreline pebbles along damp bank
  if (dPond > -1.5 && dPond < 7.5) {
    vec2 pebCell = floor(p / 11.0);
    vec2 pebUv = fract(p / 11.0) - 0.5;
    float ph = hash2(pebCell + 57.1);
    if (ph > 0.72) {
      vec2 po = (vec2(hash2(pebCell + 12.3), hash2(pebCell + 91.7)) - 0.5) * 0.45;
      float pd = length((pebUv - po) / vec2(0.24, 0.17));
      float pMask = (1.0 - ss(0.7, 1.05, pd)) * (1.0 - ss(3.0, 7.5, dPond)) * ss(-1.5, 0.8, dPond);
      vec3 pebCol = moodMix(vec3(0.68, 0.66, 0.58), vec3(0.64, 0.48, 0.42), vec3(0.22, 0.28, 0.36), sunset, night);
      col = mix(col, pebCol, pMask * 0.65);
    }
  }

  if (dPond >= 1.5) return col;

  // 2. Water interior coordinates & gentle wind ripples
  float waterCov = ss(1.4, -1.4, dPond);
  float depthK = ss(0.0, -16.0, dPond);
  vec2 rel = p - uPond.xy;

  // Delicate animated water ripples distorting reflections horizontally
  float ripNoise = N(p + vec2(-wt * 10.0, wt * 4.0), 75.0).r;
  float waveRip = sin(rel.y * 0.52 - uTime * 1.9 + ripNoise * 5.2) * (1.4 + windWave * 1.5);
  float fineRip = sin(rel.y * 1.15 + rel.x * 0.18 - uTime * 2.7) * 0.55;
  float ripX = (waveRip + fineRip) * depthK;

  // Expanding periodic dewdrop / water-strider ripple rings on the quiet pond
  float ringAge = fract(uTime * 0.19);
  vec2 ringCenter = uPond.xy + vec2(uPond.z * 0.18, uPond.w * 0.14);
  float ringRad = 4.0 + ringAge * min(uPond.z, uPond.w) * 0.78;
  float ringD = abs(length(p - ringCenter) - ringRad);
  float ringGlow = (1.0 - ss(0.5, 2.2, ringD)) * (1.0 - ringAge) * ss(0.0, 0.12, ringAge) * depthK;

  // Base water colors: sunlit sky-jade (Day) <-> twilight violet-to-apricot mirror (Sunset) <-> midnight mirror (Night)
  float skyGrad = clamp(0.5 - (rel.x * 0.45 + rel.y * 0.55) / max(40.0, uPond.z * 2.0), 0.0, 1.0);
  vec3 dayShallow = vec3(0.48, 0.74, 0.62);
  vec3 dayDeep    = mix(vec3(0.46, 0.75, 0.86), vec3(0.74, 0.89, 0.94), skyGrad);
  vec3 dayWater   = mix(dayShallow, dayDeep, depthK);

  vec3 sunShallow = vec3(0.24, 0.28, 0.28);
  vec3 sunDeep    = mix(vec3(0.145, 0.185, 0.355), vec3(0.785, 0.435, 0.345), pow(skyGrad, 1.35));
  vec3 sunWater   = mix(sunShallow, sunDeep, depthK);

  vec3 nightShallow = vec3(0.07, 0.16, 0.25);
  vec3 nightDeep    = mix(vec3(0.045, 0.105, 0.205), vec3(0.095, 0.200, 0.345), skyGrad);
  vec3 nightWater   = mix(nightShallow, nightDeep, depthK);

  vec3 water = moodMix(dayWater, sunWater, nightWater, sunset, night);

  // Subtle reflected passing sky clouds mirrored inside the water
  float reflCloud = evalCloudShadow(p + vec2(ripX * 2.5 - 22.0, -30.0), wt);
  vec3 reflCloudCol = moodMix(vec3(0.95, 0.97, 0.98), vec3(0.92, 0.58, 0.48), vec3(0.24, 0.34, 0.48), sunset, night);
  water = mix(water, reflCloudCol, reflCloud * depthK * mix(0.42, 0.30, night));

  // Daytime & Golden-hour sunlit water glints
  if (night < 0.95) {
    float daySpark = ss(0.68, 0.92, N(vec2(rel.x * 0.6 + ripX * 2.0, rel.y * 1.4 - wt * 14.0), 54.0).g) * depthK;
    vec3 sparkCol = mix(vec3(0.96, 0.99, 0.98), vec3(1.00, 0.86, 0.54), sunset);
    water = mix(water, sparkCol, daySpark * (1.0 - night) * mix(0.38, 0.48, sunset));
  }

  // --- SUNSET: REFLECTED SETTING SUN ORB & LIQUID-GOLD SUN-PATH ("VỆT NẮNG CHIỀU LOANG MẶT NƯỚC") ---
  if (sunset > 0.02) {
    float clearSun = 1.0 - cloudShMask * 0.58;
    float pondMinR = min(uPond.z, uPond.w);
    vec2 sPos = uPond.xy + vec2(-uPond.z * 0.22, -uPond.w * 0.14);
    vec2 sp = (p - sPos) + vec2(ripX * 1.55, fineRip * 0.50);
    float sRad = clamp(pondMinR * 0.28, 10.0, 20.0);
    float dSun = length(sp) - sRad;

    float sunOrb  = ss(2.0, -1.6, dSun);
    float sunHalo = exp(-max(dSun, 0.0) / (sRad * 1.65)) * 0.48;
    water += vec3(1.00, 0.52, 0.22) * sunHalo * depthK * clearSun * sunset;
    water = mix(water, vec3(1.00, 0.92, 0.66), sunOrb * depthK * clearSun * sunset * 0.90);

    // Shimmering molten amber-gold trail dancing southeast across glassy dark twilight ripples
    vec2 trailRel = p - sPos;
    float tAlong  = dot(trailRel, normalize(vec2(0.62, 0.78)));
    float tAcross = dot(trailRel, normalize(vec2(-0.78, 0.62)));
    float tEnv = ss(sRad * 0.15, sRad * 0.95, tAlong) * (1.0 - ss(sRad * 1.4, sRad * 3.8, tAlong))
               * exp(-pow(tAcross / (sRad * 0.65 + tAlong * 0.14), 2.0));
    float ripBars = ss(0.32, 0.88, sin(rel.y * 0.76 - uTime * 2.2 + ripNoise * 4.8));
    water = mix(water, vec3(1.00, 0.84, 0.48), tEnv * ripBars * depthK * clearSun * sunset * 0.78);
  }

  // --- NIGHTTIME: CRISP REFLECTED CRESCENT MOON ("BÓNG TRĂNG SOI MẶT NƯỚC") & TWINKLING STARS ---
  if (night > 0.02) {
    float clearSky = 1.0 - cloudShMask * 0.62;
    float pondMinR = min(uPond.z, uPond.w);

    // 1. Twinkling reflected stars in the dark water mirror
    vec2 stCell = floor((p + vec2(ripX * 0.4, 0.0)) / 18.0);
    vec2 stUv   = fract((p + vec2(ripX * 0.4, 0.0)) / 18.0) - 0.5;
    float sh1   = hash2(stCell + 31.7);
    if (sh1 > 0.78) {
      vec2 so = (vec2(hash2(stCell + 7.1), hash2(stCell + 19.3)) - 0.5) * 0.55;
      float sd = length(stUv - so);
      float tw = 0.52 + 0.48 * sin(uTime * (2.2 + sh1 * 2.5) + sh1 * 40.0);
      float starDot = (1.0 - ss(0.03, 0.095, sd)) * tw * depthK * clearSky * night;
      water = mix(water, vec3(0.90, 0.95, 1.0), starDot * 0.85);
    }

    // 2. Crisp shimmering real Lunar Surface & 3D phase reflected inside the pond!
    vec2 mPos = uPond.xy + vec2(-uPond.z * 0.14, -uPond.w * 0.08);
    vec2 mp = (p - mPos) + vec2(ripX * 1.45, fineRip * 0.45);
    float mRad = clamp(pondMinR * 0.36, 13.0, 26.0);
    float dOuter = length(mp) - mRad;
    float disc = ss(1.4, -1.0, dOuter);

    float moonTheta = uMoonPhase * 6.2831853;
    float moonIllum = 0.5 - 0.5 * cos(moonTheta);
    float phaseGlow = mix(0.20, 1.0, pow(max(0.0001, moonIllum), 0.65));

    vec2 mLocal = mp / max(1.0, mRad);
    float rN = clamp(length(mLocal), 0.0, 1.0);
    float z3 = sqrt(max(0.0, 1.0 - rN * rN));
    vec2 rotM = vec2(mLocal.x * 0.97 + mLocal.y * 0.24, -mLocal.x * 0.24 + mLocal.y * 0.97);
    float lx = sin(moonTheta);
    float lz = -cos(moonTheta);
    vec2 mUV = clamp(rotM * 0.480 + 0.5, 0.005, 0.995);
    vec4 mTex = texture(uMoonTex, mUV);
    float litPhase = ss(-0.05, 0.16, rotM.x * lx + z3 * lz + (mTex.a - 0.5) * 0.045);

    vec3 moonLitCol = mTex.rgb * vec3(1.02, 1.00, 0.94);
    vec3 moonCore = mix(water * 0.90 + mTex.rgb * vec3(0.06, 0.09, 0.14), moonLitCol, litPhase);
    float moonHalo = exp(-max(dOuter, 0.0) / (mRad * 1.25)) * 0.42 * phaseGlow;
    water += vec3(0.42, 0.66, 0.88) * moonHalo * depthK * clearSky * night;
    water = mix(water, moonCore, disc * depthK * clearSky * night * 0.94);

    // 3. Shimmering broken silver moonlight trail ("vệt trăng loang") dancing on ripples below-right of moon
    vec2 trailRel = p - mPos;
    float tAlong = dot(trailRel, normalize(vec2(0.55, 0.84)));
    float tAcross = dot(trailRel, normalize(vec2(-0.84, 0.55)));
    float tEnv = ss(mRad * 0.2, mRad * 1.1, tAlong) * (1.0 - ss(mRad * 1.2, mRad * 3.1, tAlong))
               * exp(-pow(tAcross / (mRad * 0.62 + tAlong * 0.12), 2.0));
    float ripBars = ss(0.35, 0.88, sin(rel.y * 0.72 - uTime * 2.3 + ripNoise * 4.5));
    water = mix(water, vec3(0.95, 0.97, 0.92), tEnv * ripBars * depthK * clearSky * night * 0.56 * phaseGlow);
  }

  // Concentric ripple ring highlight
  vec3 ringCol = moodMix(vec3(0.92, 0.98, 0.97), vec3(1.00, 0.84, 0.58), vec3(0.76, 0.90, 0.99), sunset, night);
  water = mix(water, ringCol, ringGlow * 0.36);

  // 3. Charming floating Studio Ghibli lily pads (2-3 tiny notched pads bobbing near pond edge!)
  vec2 lp1 = uPond.xy + vec2(uPond.z * 0.44, -uPond.w * 0.16) + vec2(sin(wt * 0.9) * 1.4, cos(wt * 0.8) * 1.0);
  vec2 lp2 = uPond.xy + vec2(uPond.z * 0.26,  uPond.w * 0.42) + vec2(cos(wt * 0.7 + 1.2) * 1.2, sin(wt * 0.85) * 1.0);
  vec2 lp3 = uPond.xy + vec2(-uPond.z * 0.52, uPond.w * 0.24) + vec2(sin(wt * 0.8 + 2.4) * 1.1, cos(wt * 0.75) * 0.9);
  for (int i = 0; i < 3; i++) {
    vec2 lc = i == 0 ? lp1 : (i == 1 ? lp2 : lp3);
    float lr = (i == 0 ? 7.8 : (i == 1 ? 6.2 : 5.4)) * clamp(uPond.z / 76.0, 0.72, 1.15);
    vec2 q = p - lc;
    float ld = length(q) - lr;
    if (ld < 3.0) {
      // Classic tiny V-notch on lily pad
      float ang = atan(q.y, q.x) + float(i) * 1.9;
      float notch = ss(0.18, 0.36, abs(mod(ang + 3.14159, 6.28318) - 3.14159));
      float padM = ss(0.7, -0.7, ld) * mix(1.0, notch, ss(1.0, lr * 0.5, length(q)));
      float padSh = ss(1.5, -1.0, length(q - vec2(1.8, 2.2)) - lr);
      water = mix(water, water * 0.62, padSh * 0.38);
      vec3 padDay   = mix(vec3(0.32, 0.57, 0.29), vec3(0.48, 0.70, 0.36), ss(-lr, lr, -q.x - q.y));
      vec3 padSun   = mix(vec3(0.24, 0.31, 0.22), vec3(0.68, 0.54, 0.28), ss(-lr, lr, -q.x - q.y));
      vec3 padNight = mix(vec3(0.08, 0.20, 0.22), vec3(0.17, 0.34, 0.36), ss(-lr, lr, -q.x - q.y));
      water = mix(water, moodMix(padDay, padSun, padNight, sunset, night), padM);
      // Tiny ivory-pink waterlily bud on the largest lily pad
      if (i == 0) {
        float flD = length(q - vec2(-1.4, -1.2)) - 2.3;
        vec3 budCol = moodMix(vec3(0.99, 0.93, 0.91), vec3(1.00, 0.84, 0.70), vec3(0.76, 0.86, 0.92), sunset, night);
        water = mix(water, budCol, ss(0.6, -0.5, flD));
      }
    }
  }

  // Soft watercolor edge meniscus gently blending pond water into mossy grass bank
  float shoreLine = (1.0 - ss(0.0, 3.6, abs(dPond))) * 0.17;
  water *= 1.0 - shoreLine;

  return mix(col, water, waterCov);
}

// Seamless C1-continuous Kitten deformation (ZERO tail-root seam)
vec4 sampleCat(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  vec2 q = uv;

  if (q.x > 0.515) {
    float u = clamp((q.x - 0.515) / 0.445, 0.0, 1.0);
    float bend = pow(u, 1.55);
    float wave = sin(uCatAnim.x - u * 2.65) * uCatAnim.y
               + sin(uCatAnim.x * 0.42 - u * 1.35) * 0.018;
    float dy = wave * bend;
    float dx = 0.65 * dy * dy * u;
    q.x += dx;
    q.y -= dy;
  }

  float torsoMask = smoothstep(0.56, 0.40, q.x) * smoothstep(0.14, 0.28, q.x)
                  * smoothstep(0.66, 0.42, q.y);
  q.y += uCatAnim.z * 0.012 * torsoMask;

  if (abs(uCatAnim.w) > 0.001) {
    vec2 dEar = q - vec2(0.28, 0.365);
    float earW = exp(-dot(dEar, dEar) / 0.0024);
    q += vec2(uCatAnim.w * 0.016, uCatAnim.w * 0.008) * earW;
  }

  float eyelidDarken = 0.0;
  if (uCatBlink > 0.005) {
    float e1 = length((q - vec2(0.148, 0.512)) / vec2(0.028, 0.019));
    float e2 = length((q - vec2(0.237, 0.485)) / vec2(0.023, 0.019));
    float eyeMask = smoothstep(1.0, 0.22, min(e1, e2));
    q.y -= eyeMask * uCatBlink * 0.020;
    float crease1 = exp(-pow((q.y - 0.513) / 0.0045, 2.0)) * smoothstep(1.0, 0.35, abs(q.x - 0.148) / 0.022);
    float crease2 = exp(-pow((q.y - 0.486) / 0.0045, 2.0)) * smoothstep(1.0, 0.35, abs(q.x - 0.237) / 0.018);
    eyelidDarken = max(crease1, crease2) * uCatBlink * 0.35;
  }

  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0);
  vec4 tex = texture(uCat, q);
  tex.rgb *= (1.0 - eyelidDarken);
  return tex;
}

// Soft drifting warm honey-gold fireflies across the moonlit meadow & pond
vec3 meadowFireflies(vec2 p, float time, float nightAmt) {
  if (nightAmt < 0.02) return vec3(0.0);
  const float CELL = 136.0;
  vec2 baseCell = floor(p / CELL);
  vec3 glow = vec3(0.0);
  for (int jy = -1; jy <= 1; jy++) {
    for (int jx = -1; jx <= 1; jx++) {
      vec2 c = baseCell + vec2(float(jx), float(jy));
      float h1 = hash2(c + 19.7);
      if (h1 < 0.56) continue;
      float h2 = hash2(c + 53.1);
      float h3 = hash2(c + 91.4);
      float h4 = hash2(c + 137.9);
      vec2 drift = vec2(
        sin(time * (0.42 + h2 * 0.36) + h3 * 6.283) * 26.0,
        cos(time * (0.36 + h4 * 0.32) + h2 * 6.283) * 22.0
      );
      vec2 pos = (c + vec2(0.22 + h2 * 0.56, 0.22 + h3 * 0.56)) * CELL + drift;
      float d = length(p - pos);
      if (d > 24.0) continue;
      float pulse = pow(clamp(0.5 + 0.5 * sin(time * (1.15 + h4 * 0.95) + h1 * 18.0), 0.0, 1.0), 2.6);
      float core = (1.0 - ss(0.9, 2.4, d)) * 0.95;
      float halo = exp(-d * d / 58.0) * 0.44;
      vec3 fCol = mix(vec3(0.98, 0.85, 0.36), vec3(1.0, 0.97, 0.72), core);
      glow += fCol * (core + halo) * pulse * nightAmt;
    }
  }
  return glow;
}

// Natural clustered botanical wildflowers (tiny daisies, buttercups & clover blooms nodding in wind — ZERO dust dots!)
vec4 meadowWildflowers(vec2 p, float wt, float windCrest, float density, float sunset, float night, float sunsetPool, float moonPool, float cloudShMask) {
  if (density < 0.01) return vec4(0.0);
  // Natural botanical drift patches (flowers bloom in charming organic clusters, leaving calm green clearings between)
  float driftPatch = ss(0.38, 0.76, N(p, 540.0).r * 0.62 + N(p + 137.0, 240.0).g * 0.38);
  if (driftPatch < 0.02) return vec4(0.0);

  const float FG = 22.0;
  vec2 c0 = floor(p / FG - 0.5);
  vec3 bestCol = vec3(0.0);
  float bestA = 0.0;
  float bestSh = 0.0;

  for (int jy = 0; jy <= 1; jy++) {
    for (int jx = 0; jx <= 1; jx++) {
      vec2 c = c0 + vec2(float(jx), float(jy));
      float fh1 = hash2(c + 11.3);
      float prob = density * (0.16 + 0.52 * driftPatch);
      if (fh1 > prob) continue;

      float fh2 = hash2(c + 27.9);
      float fh3 = hash2(c + 43.1);
      float fh4 = hash2(c + 67.4);

      vec2 basePos = (c + vec2(0.22 + 0.56 * fh2, 0.22 + 0.56 * fh3)) * FG;
      vec2 sway = WIND_DIR * (windCrest * 3.8 + sin(wt * (2.2 + fh4 * 1.4) + fh2 * 6.283) * 1.15);
      vec2 headPos = basePos + sway;

      vec2 rel = p - headPos;
      float r = 1.65 + fh4 * 1.55;
      if (abs(rel.x) > r + 4.0 || abs(rel.y) > r + 4.0) continue;

      // Tiny shadowed foliage base grounding the flower on the meadow grass
      float dSh = length(p - (basePos + vec2(1.0, 1.4)));
      bestSh = max(bestSh, (1.0 - ss(r * 0.55, r * 1.35, dSh)) * 0.42);

      // Subtle 5-petal scalloped meadow blossom silhouette
      float ang = atan(rel.y, rel.x);
      float petalR = r * (0.84 + 0.16 * cos(ang * 5.0 + fh2 * 6.283));
      float dHead = length(rel);
      float flM = 1.0 - ss(petalR * 0.55, petalR + 0.55, dHead);

      if (flM > bestA) {
        bestA = flM;
        float centerM = 1.0 - ss(r * 0.18, r * 0.46, dHead);
        vec3 dayPet, sunPet, ngtPet;
        if (fh2 > 0.54) {
          // Creamy meadow daisy
          dayPet = mix(vec3(0.98, 0.97, 0.90), vec3(0.96, 0.80, 0.26), centerM * 0.88);
          sunPet = mix(vec3(1.00, 0.88, 0.72), vec3(0.98, 0.64, 0.18), centerM * 0.90);
          ngtPet = mix(vec3(0.68, 0.82, 0.92), vec3(0.54, 0.68, 0.66), centerM * 0.65);
        } else if (fh2 > 0.22) {
          // Sunny golden buttercup
          dayPet = mix(vec3(0.97, 0.84, 0.30), vec3(0.84, 0.58, 0.14), centerM * 0.55);
          sunPet = mix(vec3(1.00, 0.74, 0.22), vec3(0.86, 0.42, 0.10), centerM * 0.55);
          ngtPet = vec3(0.58, 0.68, 0.56);
        } else {
          // Delicate wild clover / pinkish twilight blossom
          dayPet = vec3(0.95, 0.76, 0.82);
          sunPet = vec3(0.98, 0.62, 0.66);
          ngtPet = vec3(0.54, 0.62, 0.82);
        }
        sunPet *= (0.72 + 0.44 * sunsetPool * (1.0 - cloudShMask * 0.78));
        ngtPet *= (0.68 + 0.56 * moonPool * (1.0 - cloudShMask * 0.82));
        bestCol = moodMix(dayPet, sunPet, ngtPet, sunset, night);
      }
    }
  }
  // Pack foliage shadow subtly when no petal covers pixel by returning alpha < 0? Keep clean: alpha in .a, shade embedded via col
  if (bestA > 0.01) return vec4(bestCol, bestA * mix(0.90, 0.78, night));
  if (bestSh > 0.01) return vec4(vec3(-1.0), bestSh);
  return vec4(0.0);
}

// Sparse, delicate Studio Ghibli butterflies fluttering lazily above sunlit & golden-hour meadow clearings
vec4 meadowButterflies(vec2 p, float time, float sunset, float night, float cloudShMask) {
  float activeAmt = clamp(1.0 - night * 1.15, 0.0, 1.0);
  if (activeAmt < 0.04) return vec4(0.0);

  const float BCELL = 440.0;
  vec2 c0 = floor(p / BCELL - 0.5);
  for (int jy = 0; jy <= 1; jy++) {
    for (int jx = 0; jx <= 1; jx++) {
      vec2 c = c0 + vec2(float(jx), float(jy));
      float h1 = hash2(c + 113.7);
      if (h1 < 0.56) continue;
      float h2 = hash2(c + 157.3);
      float h3 = hash2(c + 211.9);
      float h4 = hash2(c + 263.1);

      float ph = time * (0.32 + h2 * 0.24) + h3 * 6.283;
      vec2 pos = (c + vec2(0.28 + h2 * 0.44, 0.28 + h3 * 0.44)) * BCELL
               + vec2(sin(ph) * 68.0 + cos(ph * 1.7 + h4 * 4.0) * 28.0,
                      cos(ph * 0.85 + 0.8) * 54.0 + sin(ph * 1.45) * 22.0);
      vec2 rel = p - pos;
      if (abs(rel.x) > 16.0 || abs(rel.y) > 16.0) continue;

      // Tangent heading along flight path
      vec2 vel = vec2(cos(ph) * 68.0 - sin(ph * 1.7 + h4 * 4.0) * 47.6,
                     -sin(ph * 0.85 + 0.8) * 45.9 + cos(ph * 1.45) * 31.9);
      vec2 fwd = normalize(vel + vec2(0.001, 0.0));
      vec2 right = vec2(-fwd.y, fwd.x);

      // Gentle wing-flap envelope
      float flap = 0.24 + 0.76 * abs(sin(time * (7.8 + h4 * 3.8) + h2 * 15.0));
      vec2 b = vec2(dot(rel, right), dot(rel, fwd));

      // Two symmetrical tiny scalloped wings
      vec2 wL = vec2((abs(b.x) - 1.9 * flap) / max(0.45, 2.2 * flap), (b.y - 0.4) / 2.6);
      vec2 wB = vec2((abs(b.x) - 1.25 * flap) / max(0.35, 1.5 * flap), (b.y + 1.5) / 1.7);
      float dWing = min(length(wL), length(wB));
      float wingM = (1.0 - ss(0.72, 1.12, dWing)) * activeAmt;
      if (wingM > 0.02) {
        vec3 dayBf = h4 > 0.45 ? vec3(0.99, 0.97, 0.86) : vec3(0.99, 0.84, 0.36);
        vec3 sunBf = h4 > 0.45 ? vec3(1.00, 0.88, 0.62) : vec3(1.00, 0.70, 0.28);
        vec3 bfCol = mix(dayBf, sunBf, sunset) * (1.0 - cloudShMask * 0.28);
        return vec4(bfCol, wingM * 0.92);
      }
    }
  }
  return vec4(0.0);
}

// Gentle wind-borne sunlit pollen / dandelion motes drifting diagonally in daytime & golden hour
float meadowPollen(vec2 p, float wt, float dayAmt) {
  if (dayAmt < 0.05) return 0.0;
  const float CELL = 165.0;
  vec2 drifted = p - WIND_DIR * (wt * 22.0);
  vec2 baseCell = floor(drifted / CELL);
  float acc = 0.0;
  for (int jy = -1; jy <= 1; jy++) {
    for (int jx = -1; jx <= 1; jx++) {
      vec2 c = baseCell + vec2(float(jx), float(jy));
      float h1 = hash2(c + 83.2);
      if (h1 < 0.72) continue;
      float h2 = hash2(c + 17.4);
      float h3 = hash2(c + 49.8);
      vec2 pos = (c + vec2(0.2 + h2 * 0.6, 0.2 + h3 * 0.6)) * CELL
               + vec2(sin(wt * 0.95 + h2 * 6.283) * 14.0, cos(wt * 0.82 + h3 * 6.283) * 10.0);
      float d = length(drifted - pos);
      if (d > 7.0) continue;
      float tw = 0.45 + 0.55 * sin(wt * 1.4 + h1 * 21.0);
      acc += (1.0 - ss(0.6, 2.4, d)) * tw * 0.38;
    }
  }
  return acc * dayAmt;
}

// Graceful Studio Ghibli anime wind ribbons (O(1) per ribbon: S-curve + companion filament + C1-tangent curl!)
float ghibliWindRibbons(vec2 p) {
  float alpha = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 wc = uWindC[i];
    if (wc.w <= 0.002) continue;

    vec4 wa = uWindA[i];
    vec4 wb = uWindB[i];
    float ca = cos(wa.z), sa = sin(wa.z);
    vec2 rel = p - wa.xy;
    float x = rel.x * ca + rel.y * sa;
    float y = -rel.x * sa + rel.y * ca;

    float headX = wa.w;
    float len = max(1.0, wb.x);
    float tailX = headX - len;

    // Fast O(1) AABB reject (~97% of screen pixels exit immediately!)
    if (x < tailX - len * 0.18 - 32.0 || x > headX + 32.0 || abs(y) > 54.0) continue;

    float amp = wb.y, freq = wb.z, phase = wb.w;
    float yC = amp * sin(x * freq + phase);
    float dy = amp * freq * cos(x * freq + phase);
    float invSlope = inversesqrt(1.0 + dy * dy);

    // 1. Primary whisper-thin silk calligraphy wind stroke
    float u = (x - tailX) / len;
    float a1 = 0.0;
    if (u > 0.0 && u < 1.0) {
      float taper = sin(u * 3.1415926);
      float w1 = 0.16 + 0.82 * pow(taper, 0.85);
      float dist1 = abs(y - yC) * invSlope;
      a1 = (1.0 - ss(w1 * 0.25, w1 + 1.45, dist1)) * pow(taper, 0.82);
    }

    // 2. Delicate companion air filament lagging gently behind
    float u2 = (x - (tailX - len * 0.11)) / (len * 0.80);
    float a2 = 0.0;
    if (u2 > 0.0 && u2 < 1.0) {
      float side = wc.y != 0.0 ? -wc.y : 1.0;
      float taper2 = sin(u2 * 3.1415926);
      float yC2 = yC + side * (9.0 + 3.2 * taper2);
      float w2 = 0.14 + 0.46 * pow(taper2, 0.88);
      float dist2 = abs(y - yC2) * invSlope;
      a2 = (1.0 - ss(w2 * 0.25, w2 + 1.25, dist2)) * pow(taper2, 0.88) * 0.34;
    }

    // 3. Optional C1-tangent miniature anime spiral curl branching seamlessly off the curve
    float aCurl = 0.0;
    if (abs(wc.y) > 0.5) {
      float curlX = wc.x, curlSign = wc.y, curlR = wc.z;
      float maxTheta = 5.20;
      float drawProg = clamp((headX - curlX) / (curlR * 5.6), 0.0, 1.0);
      float fadeProg = clamp((tailX - (curlX - curlR * 0.6)) / (curlR * 5.6), 0.0, 1.0);
      float aStart = fadeProg * maxTheta;
      float aEnd = drawProg * maxTheta;
      if (aEnd > aStart + 0.05) {
        float y0 = amp * sin(curlX * freq + phase);
        float sl = amp * freq * cos(curlX * freq + phase);
        float invSl = inversesqrt(1.0 + sl * sl);
        vec2 dir = vec2(invSl, sl * invSl);
        vec2 nrm = vec2(-dir.y, dir.x) * curlSign;
        vec2 ctr = vec2(curlX, y0) + nrm * curlR;
        vec2 q = vec2(x, y) - ctr;
        float r = length(q);
        if (r < curlR + 6.0) {
          float qx = dot(q, -nrm);
          float qy = dot(q, dir);
          float phi = atan(qy, qx);
          float ang = phi < 0.0 ? phi + 6.2831853 : phi;
          if (ang >= aStart && ang <= aEnd && ang <= maxTheta) {
            float rSp = curlR * (1.0 - 0.134 * ang);
            float dSp = abs(r - rSp);
            float uc = (ang - aStart) / max(0.05, aEnd - aStart);
            float tipFade = sin(clamp(uc, 0.0, 1.0) * 3.1415926);
            float baseJoin = 1.0 - 0.58 * (ang / maxTheta);
            float wC = (0.16 + 0.72 * baseJoin) * (0.25 + 0.75 * pow(tipFade, 0.65));
            aCurl = (1.0 - ss(wC * 0.25, wC + 1.35, dSp)) * pow(tipFade, 0.65) * 0.72;
          }
        }
      }
    }

    alpha = max(alpha, max(max(a1, a2), aCurl) * wc.w);
  }
  return clamp(alpha, 0.0, 0.45);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 cssRes = uRes / uDpr;
  float sunset = clamp(uSunset, 0.0, 1.0);
  float night  = clamp(uNight,  0.0, 1.0);
  float dayAmt = max(0.0, 1.0 - sunset - night);
  float wt = uWindTime;

  vec3 gLight  = moodMix(G_LIGHT,    S_G_LIGHT,    N_G_LIGHT,    sunset, night);
  vec3 gMid    = moodMix(G_MID,      S_G_MID,      N_G_MID,      sunset, night);
  vec3 gDeep   = moodMix(G_DEEP,     S_G_DEEP,     N_G_DEEP,     sunset, night);
  vec3 gGustHi = moodMix(G_GUST_HI,  S_G_GUST_HI,  N_G_GUST_HI,  sunset, night);
  vec3 gInk    = moodMix(INK,        S_INK,        N_INK,        sunset, night);
  vec3 gShadow = moodMix(SHADOW,     S_SHADOW,     N_SHADOW,     sunset, night);
  vec3 cHi     = moodMix(CLOUD_HI,   S_CLOUD_HI,   N_CLOUD_HI,   sunset, night);
  vec3 cBody   = moodMix(CLOUD_BODY, S_CLOUD_BODY, N_CLOUD_BODY, sunset, night);
  vec3 cSh     = moodMix(CLOUD_SH,   S_CLOUD_SH,   N_CLOUD_SH,   sunset, night);

  // --- 1. LUSH WATERCOLOR MEADOW + ROLLING HILLOCK TOPOGRAPHY + SWEEPING WIND-GUST WAVES ---
  vec2 windW = meadowWindWave(p, wt);
  float windWave   = windW.x;
  float windTrough = windW.y;

  // Dynamic solar direction: rotates slightly lower/more lateral during Golden-Hour Sunset to align clouds, hills & shadows!
  vec2 lightDir = normalize(mix(LIGHT, vec2(-0.76, -0.65), sunset));

  // Natural rolling meadow hills & clover valleys (gentle 3D hillock slope shading along lightDir!)
  float w1 = N(p, 1650.0).r;
  float w2 = N(p + 311.0, 560.0).g;
  float hillH = w1 * 0.65 + w2 * 0.35;
  float hillLitH = N(p + lightDir * 65.0, 1650.0).r * 0.65 + N(p + lightDir * 65.0 + 311.0, 560.0).g * 0.35;
  float hillSlope = clamp(0.5 + (hillH - hillLitH) * 2.8, 0.0, 1.0);

  vec3 col = mix(gMid, gLight, ss(0.24, 0.78, hillH * 0.65 + hillSlope * 0.35));
  // Natural deep lush clover/fern meadow hollows
  float cloverPatch = ss(0.46, 0.84, N(p + 977.0, 920.0).r * 0.68 + N(p + 413.0, 380.0).g * 0.32);
  col = mix(col, gDeep, cloverPatch * mix(0.46, 0.56, max(night, sunset * 0.72)));
  col *= 1.0 + mix(0.06, 0.13, max(night, sunset * 0.80)) * (0.5 - (p.x + p.y) / max(1.0, cssRes.x + cssRes.y));

  // Tactile gouache grass brushstrokes + unmistakable rolling wind crests & pressed dark troughs!
  vec2 turf = anisotropicTurf(p, wt, windWave);
  col = mix(col, gDeep * 0.82, clamp(windTrough * 0.52 + turf.x * 0.34, 0.0, 0.72) * mix(0.44, 0.48, max(night, sunset)));
  col = mix(col, gGustHi, clamp(windWave * 0.68 + turf.y * 0.36, 0.0, 0.92) * mix(0.44, 0.50, sunset) * (1.0 - night * 0.20));

  // --- 1B. OFF-SCREEN UPPER-LEFT SUNSET GOLDEN-HOUR BEAM & MOONLIGHT FLOOD ---
  // Low late-afternoon sun stretches cloud shadows further southeast across the meadow!
  vec2 shadowOff = mix(SHADOW_OFF, vec2(158.0, 198.0), sunset);
  float cloudShMask = evalCloudShadow(p - shadowOff, wt);
  float sunsetPool = 0.0;
  float moonPool = 0.0;

  if (sunset > 0.01) {
    // Low setting sun off-screen above upper-left grazing the lush green meadow with warm slanting rays
    vec2 skySun = vec2(-cssRes.x * 0.12, -cssRes.y * 0.08);
    vec2 sDir = normalize(vec2(0.74, 0.67));
    vec2 sPerp = vec2(-sDir.y, sDir.x);
    vec2 relS = p - skySun;
    float sAlong = dot(relS, sDir);
    float sAcross = dot(relS, sPerp);
    float maxDiag = max(640.0, length(cssRes));

    // Wide gentle golden-hour shaft + subtle crepuscular sunbeams (NEVER flat orange desert wash!)
    float coneW = 350.0 + max(0.0, sAlong) * 0.62;
    float beamCross = exp(-pow(sAcross / coneW, 2.0) * 1.05);
    float beamAlong = 1.0 - ss(maxDiag * 0.42, maxDiag * 1.35, sAlong);
    float sunCorner = exp(-dot(relS, relS) / (maxDiag * maxDiag * 0.34));
    float rayAngle = atan(relS.y, relS.x);
    float rayWarp  = N(p * 0.24 + vec2(wt * 1.8, 0.0), 440.0).r * 2.8;
    // Organic irregular multi-frequency crepuscular sunbeams streaming through cloud gaps (never uniform spokes!)
    float rayBand  = 0.56 + 0.24 * sin(rayAngle * 4.6 + rayWarp) + 0.20 * sin(rayAngle * 9.8 - wt * 0.16 + 1.3);
    float sunRays  = mix(0.76, 1.14, clamp(rayBand, 0.0, 1.0) * (1.0 - cloudShMask * 0.48));
    float dapple = 0.85 + 0.15 * ss(0.24, 0.78, N(p + vec2(uTime * 3.0, uTime * 1.8), 860.0).r);
    sunsetPool = clamp((beamCross * beamAlong * 0.86 + sunCorner * 0.58) * sunRays * dapple, 0.0, 1.0);

    // Grazing warm late-afternoon light preserves rich living chlorophyll green while gilding sunlit hills & wind crests!
    float unsh = 1.0 - cloudShMask * 0.82;
    vec3 goldenGrass = col * vec3(1.22, 1.08, 0.78) + vec3(0.055, 0.025, 0.002);
    col = mix(col, goldenGrass, sunsetPool * unsh * sunset * 0.58);
    // Warm amber grazing glow specifically on wind-bent wave crests catching the low sun!
    col = mix(col, mix(col, SUNSET_TINT, 0.48), windWave * sunsetPool * unsh * sunset * 0.42);
    // Delicate atmospheric golden-peach bloom right near the upper-left sunward corner
    col += vec3(1.00, 0.54, 0.24) * sunCorner * (0.40 + 0.60 * unsh) * sunset * 0.12;
    // Cool poetic twilight indigo-emerald shadow tone deepening toward the far lower-right corner
    float duskFar = ss(0.48, 1.18, (p.x + p.y) / max(1.0, cssRes.x + cssRes.y));
    col = mix(col, col * vec3(0.76, 0.84, 0.98) + vec3(0.014, 0.016, 0.044), duskFar * sunset * 0.42);
  }

  if (night > 0.01) {
    // Moon sits high off-screen above upper-left corner matching LIGHT = (-0.6, -0.8)
    vec2 skyMoon = vec2(-cssRes.x * 0.08, -cssRes.y * 0.10);
    vec2 beamDir = normalize(vec2(0.68, 0.73));
    vec2 beamPerp = vec2(-beamDir.y, beamDir.x);
    vec2 relM = p - skyMoon;
    float along = dot(relM, beamDir);
    float across = dot(relM, beamPerp);
    float maxDiag = max(640.0, length(cssRes));

    // Broad, graceful diagonal lunar illumination + gentle atmospheric falloff
    float coneW = 320.0 + max(0.0, along) * 0.56;
    float beamCross = exp(-pow(across / coneW, 2.0) * 1.15);
    float beamAlong = 1.0 - ss(maxDiag * 0.45, maxDiag * 1.30, along);
    float cornerGlow = exp(-dot(relM, relM) / (maxDiag * maxDiag * 0.32));
    float dapple = 0.80 + 0.20 * ss(0.25, 0.78, N(p + vec2(uTime * 3.5, uTime * 2.0), 820.0).r);
    moonPool = clamp((beamCross * beamAlong * 0.86 + cornerGlow * 0.55) * dapple, 0.0, 1.0);

    // Unshadowed grass receives luminous silver-jade moonlight (softly veiled by feathered high-altitude cloud shadows)
    float unshadowed = 1.0 - cloudShMask * 0.78;
    vec3 moonGrass = mix(col * vec3(1.38, 1.58, 1.68), MOON_TINT * 0.58, 0.25);
    col = mix(col, moonGrass, moonPool * unshadowed * night * 0.82);
    col += MOON_TINT * cornerGlow * unshadowed * night * 0.14;
  }

  // Stationary watercolor paper stipple
  float paperGrain = hash2(floor(p * (0.8 * max(uDpr, 1.0))));
  col *= 1.0 + (paperGrain - 0.5) * mix(0.036, 0.044, max(night, sunset * 0.6));

  // --- 1C. DENSE LIVELY SWAYING GRASS TUFTS & CLUSTERED WILDFLOWERS (MASKED CLEANLY OUTSIDE POND!) ---
  float dPond = pondSD(p);
  float landMask = ss(-1.0, 4.0, dPond);

  if (landMask > 0.01) {
    vec2 grass = swayingMeadowGrass(p, wt, windWave, windTrough);
    vec3 tuftRootCol = col * moodMix(vec3(0.68, 0.77, 0.68), vec3(0.58, 0.64, 0.72), vec3(0.66, 0.74, 0.84), sunset, night);
    vec3 tipDay   = mix(col * 1.12, vec3(0.92, 0.96, 0.56), 0.72);
    vec3 tipSun   = mix(col * vec3(1.16, 1.12, 0.80), vec3(0.98, 0.78, 0.30), (0.34 + 0.52 * sunsetPool) * (1.0 - cloudShMask * 0.82));
    vec3 tipNight = mix(col * 1.22, vec3(0.76, 0.90, 0.97), 0.55 * moonPool * (1.0 - cloudShMask * 0.85));
    vec3 tipCol   = moodMix(tipDay, tipSun, tipNight, sunset, night);
    col = mix(col, tuftRootCol, grass.x * mix(0.64, 0.60, night) * landMask);
    col = mix(col, tipCol, grass.y * mix(0.68, 0.72, sunset) * (1.0 - night * 0.14) * landMask);

    // Golden sunset rim glints (Sunset) OR silver moon-dew glints (Night) catching wind-bent grass tips
    float glintAmt = max(night * moonPool, sunset * sunsetPool * (0.35 + 0.65 * windWave));
    if (glintAmt > 0.16) {
      vec2 dewCell = floor(p / 22.0);
      vec2 dewUv = fract(p / 22.0) - 0.5;
      float dh1 = hash2(dewCell + 71.3);
      if (dh1 > 0.87) {
        vec2 sway = WIND_DIR * (windWave * 0.15);
        vec2 dOff = (vec2(hash2(dewCell + 13.7), hash2(dewCell + 39.2)) - 0.5) * 0.56 + sway;
        float dd = length(dewUv - dOff);
        float shimmer = 0.50 + 0.50 * sin(uTime * 2.1 + dh1 * 31.4 + windWave * 3.0);
        float dewDot = (1.0 - ss(0.025, 0.08, dd)) * shimmer * glintAmt * (1.0 - cloudShMask * 0.90) * landMask;
        vec3 glintCol = mix(vec3(1.00, 0.86, 0.44), vec3(0.88, 0.96, 1.0), night / max(0.001, night + sunset));
        col = mix(col, glintCol, dewDot * mix(0.55, 0.68, night));
      }
    }

    // Natural clustered botanical meadow wildflowers swaying in wind gusts
    if (uFlowers > 0.01) {
      vec4 fl = meadowWildflowers(p, wt, windWave, uFlowers, sunset, night, sunsetPool, moonPool, cloudShMask);
      if (fl.a > 0.005) {
        if (fl.r < 0.0) {
          col = mix(col, col * gShadow, fl.a * 0.55 * landMask);
        } else {
          col = mix(col, fl.rgb, fl.a * landMask);
        }
      }
    }
  }

  // --- 1D. POETIC MEADOW POND REFLECTING SKY, SETTING SUN OR CRESCENT MOON ---
  if (dPond < 14.0) {
    col = shadeMeadowPond(p, col, dPond, sunset, night, wt, windWave, cloudShMask);
  }

  // --- 2. KITE BOY & KITE ON THE GRASS (UNDERNEATH FLOATING CLOUDS) ---
  if (uActorRect.z > 1.0) {
    vec2 aUV = (p - uActorRect.xy) / uActorRect.zw;
    if (aUV.x >= 0.0 && aUV.x <= 1.0 && aUV.y >= 0.0 && aUV.y <= 1.0) {
      float shBase = texture(uActorShadow, aUV).a;
      float shA = shBase;
      // Low setting sun stretches the boy's & kite's shadow naturally southeast across the grass!
      if (sunset > 0.02) {
        vec2 aShLongUV = aUV - vec2(0.030, 0.026) * sunset;
        if (aShLongUV.x >= 0.0 && aShLongUV.x <= 1.0 && aShLongUV.y >= 0.0 && aShLongUV.y <= 1.0) {
          shA = max(shBase, texture(uActorShadow, aShLongUV).a * 0.82 * sunset);
        }
      }
      col = mix(col, col * gShadow, shA * mix(0.76, 0.80, max(night, sunset * 0.7)));
      vec4 act = texture(uActor, aUV);
      float sunLitA = sunsetPool * (1.0 - cloudShMask * 0.74);
      // Warm golden-hour rim light catching sun-facing upper-left contour of kite boy & kite
      float rimA = sunset > 0.02 ? clamp(act.a - texture(uActor, clamp(aUV + lightDir * 0.0085, 0.0, 1.0)).a, 0.0, 1.0) : 0.0;
      vec3 actSun  = act.rgb * mix(vec3(0.70, 0.66, 0.80), vec3(1.14, 0.93, 0.74), sunLitA)
                   + vec3(0.07, 0.035, 0.008) * sunLitA
                   + vec3(0.42, 0.24, 0.06) * rimA * sunLitA;
      vec3 actMoon = act.rgb * mix(vec3(0.46, 0.57, 0.74), vec3(0.78, 0.88, 0.98), moonPool * (1.0 - cloudShMask * 0.72));
      actMoon += MOON_TINT * moonPool * (1.0 - cloudShMask * 0.72) * 0.07;
      col = mix(col, moodMix(act.rgb, actSun, actMoon, sunset, night), act.a);
    }
  }

  // --- 3. HAND-PAINTED BLACK KITTEN ON THE GRASS (UNDERNEATH CLOUDS) ---
  if (uCatRect.z > 1.0) {
    vec2 catUV = (p - uCatRect.xy) / uCatRect.zw;
    vec2 shUV  = (p - uCatShadow * mix(1.0, 1.38, sunset) - uCatRect.xy) / uCatRect.zw;
    if (shUV.x >= 0.0 && shUV.x <= 1.0 && shUV.y >= 0.0 && shUV.y <= 1.0) {
      float cs = sampleCat(shUV).a;
      col = mix(col, col * gShadow, cs * mix(0.76, 0.80, max(night, sunset * 0.7)));
    }
    if (catUV.x >= 0.0 && catUV.x <= 1.0 && catUV.y >= 0.0 && catUV.y <= 1.0) {
      vec4 catC = sampleCat(catUV);
      float amberEye = ss(0.10, 0.30, catC.r - catC.b) * ss(0.24, 0.52, catC.r);
      float sunLitC = sunsetPool * (1.0 - cloudShMask * 0.72);
      // Warm sunset golden halo rim along sun-facing upper-left edge of black kitten's fur!
      float rimC = sunset > 0.02 ? clamp(catC.a - sampleCat(clamp(catUV + lightDir * 0.024, 0.0, 1.0)).a, 0.0, 1.0) : 0.0;
      vec3 furSun  = catC.rgb * mix(vec3(0.72, 0.68, 0.82), vec3(1.12, 0.92, 0.74), sunLitC)
                   + vec3(0.04, 0.022, 0.008) * sunLitC
                   + vec3(0.46, 0.26, 0.07) * rimC * sunLitC;
      vec3 eyeSun  = catC.rgb * vec3(1.14, 0.98, 0.68);
      vec3 catSun  = mix(furSun, eyeSun, amberEye);
      vec3 furMoon = catC.rgb * mix(vec3(0.54, 0.66, 0.86), vec3(0.78, 0.90, 1.04), moonPool) + vec3(0.015, 0.028, 0.050);
      vec3 eyeMoon = catC.rgb * vec3(1.06, 0.96, 0.72);
      vec3 catNight = mix(furMoon, eyeMoon, amberEye);
      col = mix(col, moodMix(catC.rgb, catSun, catNight, sunset, night), catC.a);
    }
  }

  // --- 4. SOFT FEATHERED HIGH-ALTITUDE CLOUD SHADOW CAST SOUTHEAST (COOL TWILIGHT VIOLET AT SUNSET!) ---
  col = mix(col, col * gShadow, cloudShMask * mix(0.68, 0.56, night) * mix(1.0, 0.94, sunset));

  // --- 4B. LIVING MEADOW ATMOSPHERE: BUTTERFLIES (DAY/SUNSET), FIREFLIES (NIGHT/DUSK) & SUNLIT POLLEN ---
  if (night < 0.95 && landMask > 0.25) {
    vec4 bf = meadowButterflies(p, uTime, sunset, night, cloudShMask);
    if (bf.a > 0.01) {
      col = mix(col, bf.rgb, bf.a);
    }
  }
  float fireflyAmt = clamp(night + sunset * 0.32, 0.0, 1.0);
  if (fireflyAmt > 0.02) {
    col += meadowFireflies(p, uTime, fireflyAmt) * (1.0 - cloudShMask * 0.36);
  }
  if (night < 0.95) {
    vec3 pollenCol = mix(vec3(1.0, 0.99, 0.88), vec3(1.00, 0.84, 0.44), sunset);
    float polBoost = mix(1.0, 1.40, sunset);
    col = mix(col, pollenCol, clamp(meadowPollen(p, wt, 1.0 - night) * polBoost, 0.0, 0.72) * (1.0 - cloudShMask * 0.5));
  }

  // --- 4C. STUDIO GHIBLI ANIME WIND RIBBONS (SWEEPING ACROSS MEADOW, UNDERNEATH CLOUDS!) ---
  float windRib = ghibliWindRibbons(p);
  if (windRib > 0.002) {
    vec3 ribDay   = vec3(0.99, 0.99, 0.94);
    vec3 ribSun   = mix(vec3(0.86, 0.72, 0.80), vec3(1.00, 0.86, 0.58), sunsetPool * (1.0 - cloudShMask * 0.55));
    vec3 ribNight = mix(vec3(0.62, 0.78, 0.92), vec3(0.84, 0.95, 1.00), moonPool * (1.0 - cloudShMask * 0.6));
    float ribAtten = 1.0 - cloudShMask * mix(0.28, 0.40, night);
    col = mix(col, moodMix(ribDay, ribSun, ribNight, sunset, night), windRib * ribAtten);
  }

  // --- 5. VOLUMETRIC NATURAL CUMULUS CLOUDS (SOFT WISPY EDGES, 3D BILLOWS, ALPENGLOW & SILVER LINING) ---
  vec2 cVol = evalCloudAt(p, wt);
  if (cVol.x > -0.045) {
    float dens = cVol.x;
    float h0   = cVol.y;
    float wispA = ss(-0.045, 0.27, dens);
    float coreA = ss(0.055, 0.34, dens);
    float cloudAlpha = clamp(wispA * 0.42 + coreA * 0.56, 0.0, 0.965);

    if (cloudAlpha > 0.004) {
      // Exact finite-difference directional derivative + mid-range optical depth toward dynamic solar lightDir
      vec2 cNear = evalCloudAt(p + lightDir * 11.0, wt);
      float dMid = evalCloudLightSample(p + lightDir * 28.0, wt);

      float optDepth = max(0.0, cNear.x) * 0.52 + max(0.0, dMid) * 1.12;
      float trans    = exp(-optDepth * 1.52);

      // True 3D cauliflower puff relief across outer rims AND interior cloud domes
      float puffSlope = clamp(0.50 + (h0 - cNear.y) * 2.35, 0.0, 1.0);
      float crownLift = ss(0.28, 0.95, h0) * (0.34 + 0.66 * puffSlope);
      float lit = clamp(
        trans * (0.56 + 0.44 * puffSlope) + crownLift * (0.23 + 0.25 * trans),
        0.0, 1.0
      );

      // Soft multiple-scattering glow + delicate thin-edge forward-scattered rim lining
      float coreBody  = ss(0.02, 0.52, dens);
      float thinRim   = (1.0 - ss(0.05, 0.44, dens)) * ss(-0.02, 0.14, dens);
      float silverRim = trans * thinRim * (0.52 + 0.48 * puffSlope);

      // Smooth 3-stop volumetric shading (cool shadow belly -> fluffy midtone -> luminous lit crown)
      vec3 cc = mix(cSh, cBody, ss(0.06, 0.52, lit * 0.88 + (1.0 - coreBody) * 0.16));
      cc = mix(cc, cHi, ss(0.40, 0.93, lit));

      // Daytime: subtle sunlit meadow bounce under thick bellies + gossamer sunlit vapor rim
      if (dayAmt > 0.02) {
        cc += vec3(0.012, 0.022, 0.008) * (1.0 - lit) * coreBody * dayAmt;
        cc += vec3(0.035, 0.032, 0.020) * silverRim * dayAmt;
      }

      // Sunset ("Ánh chiều tà"): directional molten-gold near-sun glow -> deep rose-violet far-dusk atmospheric gradient!
      if (sunset > 0.02) {
        float sunBoost = 0.76 + 0.56 * sunsetPool;
        float farDusk = ss(0.32, 1.12, (p.x + p.y) / max(1.0, cssRes.x + cssRes.y));
        // Near-sun cloud crowns ignite warm molten gold-apricot; far lower-right bellies sink into rich twilight plum-indigo!
        vec3 sunLitCol = mix(cc, vec3(1.00, 0.88, 0.56), lit * lit * sunsetPool * 0.54);
        sunLitCol = mix(sunLitCol, sunLitCol * vec3(0.74, 0.70, 1.04) + vec3(0.02, 0.015, 0.05), farDusk * (1.0 - lit * 0.58) * 0.46);
        // Fiery golden-tangerine twilight forward-scattering rim along thin sun-facing wisps!
        sunLitCol += vec3(0.42, 0.18, 0.035) * silverRim * sunBoost * (1.0 - farDusk * 0.35);
        cc = mix(cc, sunLitCol, sunset);
      }

      // Nighttime: tie cloud illumination smoothly into upper-left moonlight pool + delicate silver mist rim
      if (night > 0.02) {
        float moonBoost = 0.72 + 0.44 * moonPool;
        vec3 moonLitCol = mix(cc, mix(cc, vec3(0.76, 0.86, 0.96), 0.34), lit * moonPool * 0.65);
        moonLitCol += vec3(0.22, 0.30, 0.40) * silverRim * moonBoost;
        cc = mix(cc, moonLitCol, night);
      }

      // Subtle atmospheric paper grain so clouds harmonize with the painterly meadow
      cc *= 1.0 + (paperGrain - 0.5) * 0.016;
      col = mix(col, cc, cloudAlpha);
    }
  }

  // Subtle photographic filmic highlight rolloff (prevents harsh digital orange/yellow clipping in sun glare & clouds)
  float fLum = dot(max(col, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = max(col, vec3(0.0)) / (1.0 + max(0.0, fLum - 0.72) * 0.62);
  mapped = mix(mapped, vec3(1.00, 0.97, 0.91), ss(0.76, 1.60, fLum) * 0.36);

  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}`;
