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
uniform float uNight;       // 0.0 = sunlit day, 1.0 = moonlit night meadow
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

// Daytime Studio Ghibli hand-painted watercolor palette
const vec3 G_LIGHT      = vec3(0.755, 0.832, 0.505);
const vec3 G_MID        = vec3(0.610, 0.742, 0.408);
const vec3 G_DEEP       = vec3(0.492, 0.656, 0.345);
const vec3 G_GUST_HI    = vec3(0.835, 0.898, 0.558);
const vec3 INK          = vec3(0.240, 0.392, 0.172);
const vec3 SHADOW       = vec3(0.555, 0.662, 0.518);
const vec3 CLOUD_HI     = vec3(0.996, 0.998, 0.988);
const vec3 CLOUD_BODY   = vec3(0.904, 0.932, 0.958);
const vec3 CLOUD_SH     = vec3(0.804, 0.854, 0.902);

// Moonlit Night Studio Ghibli watercolor palette (deep cool jade-indigo meadow + crisp moonlight)
const vec3 N_G_LIGHT    = vec3(0.168, 0.298, 0.332);
const vec3 N_G_MID      = vec3(0.088, 0.180, 0.236);
const vec3 N_G_DEEP     = vec3(0.046, 0.106, 0.168);
const vec3 N_G_GUST_HI  = vec3(0.285, 0.468, 0.525);
const vec3 N_INK        = vec3(0.028, 0.068, 0.112);
const vec3 N_SHADOW     = vec3(0.305, 0.375, 0.525);
const vec3 N_CLOUD_HI   = vec3(0.885, 0.945, 0.992);
const vec3 N_CLOUD_BODY = vec3(0.205, 0.278, 0.395);
const vec3 N_CLOUD_SH   = vec3(0.105, 0.152, 0.258);
const vec3 MOON_TINT    = vec3(0.735, 0.885, 0.980);

const vec2 LIGHT      = vec2(-0.6, -0.8);
const vec2 SHADOW_OFF = vec2(110.0, 148.0);
const vec2 WIND_DIR   = vec2(0.848, 0.530); // Natural breeze flowing toward ESE
const vec2 WIND_PERP  = vec2(-0.530, 0.848);

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

// Slow, organic, breathing Studio Ghibli wind-gust waves (lulls & sweeping swells — NOT mechanical sine stripes!)
float meadowWindWave(vec2 p, float wt) {
  vec2 drift1 = -WIND_DIR * (wt * 36.0);
  vec2 drift2 = -WIND_DIR * (wt * 58.0) + WIND_PERP * (wt * 11.0);
  float f1 = N(p + drift1, 880.0).r;
  float f2 = N(p + drift2, 460.0).g;
  // Soft elongated gust fronts warped by organic noise (periods ~5-7s, never frantic)
  float along = dot(p, WIND_DIR) + (f1 - 0.5) * 340.0;
  float swell = 0.5 + 0.5 * sin(along * 0.0085 - wt * 0.88);
  float gustMask = ss(0.26, 0.82, f1 * 0.55 + f2 * 0.45);
  return clamp(pow(swell * 0.62 + gustMask * 0.58, 1.55), 0.0, 1.0);
}

// Dense anisotropic painterly grass carpet combed along the wind direction (turns flat ground into lush turf!)
vec2 anisotropicTurf(vec2 p, float wt, float windWave) {
  // Compress along wind direction, stretch across -> soft directional grass brushstrokes
  vec2 windUV = vec2(dot(p, WIND_DIR) * 0.28, dot(p, WIND_PERP) * 1.45);
  // Subtle physical bending shift as each wind wave rolls across the carpet
  vec2 shift = vec2(-windWave * 7.5 - sin(wt * 0.9 + windUV.y * 0.02) * 1.2, windWave * 1.8);
  float turfBroad = N(windUV + shift, 195.0).g;
  float turfFine  = N(windUV * 1.85 + shift * 1.35 + vec2(37.0, 19.0), 105.0).a;
  float combed = turfBroad * 0.58 + turfFine * 0.42;
  float ridgeHi = ss(0.50, 0.84, combed) * (0.28 + 0.72 * windWave);
  float furrow  = ss(0.52, 0.20, combed);
  return vec2(furrow, ridgeHi);
}

// Dense, seamless 3x3 perspective-accurate top-down curved grass tufts (blends softly into lush turf!)
vec2 swayingMeadowGrass(vec2 p, float wt, float localWind) {
  const vec2 G = vec2(14.0, 12.0);
  vec2 c0 = floor(p / G);
  float shade = 0.0;
  float glint = 0.0;

  for (int jy = -1; jy <= 1; jy++) {
    for (int jx = -1; jx <= 1; jx++) {
      vec2 c = c0 + vec2(float(jx), float(jy));
      float h1 = hash2(c + 3.1);
      vec2 cp = (c + 0.5) * G;

      // Natural organic meadow clump density
      float dens = 0.74 * ss(0.24, 0.72, N(cp, 740.0).r) + 0.16;
      if (h1 > dens) continue;

      float h2 = hash2(c + 11.7);
      float h3 = hash2(c + 23.9);
      float h4 = hash2(c + 41.3);

      vec2 root = cp + (vec2(h2, h3) - 0.5) * vec2(10.0, 8.5);
      vec2 rel = p - root;
      if (abs(rel.x) > 11.5 || abs(rel.y) > 9.5) continue;

      // Top-down foreshortened blade leaning naturally along WIND_DIR (NOT straight up like a 2D side-scroller!)
      float gust = localWind * (0.75 + 0.45 * h4);
      float flutter = sin(wt * (2.1 + h2 * 1.4) + h3 * 6.283 + dot(root, WIND_DIR) * 0.025) * (0.75 + gust * 0.9);
      vec2 baseDir = WIND_DIR * (3.6 + h4 * 3.0) + WIND_PERP * ((h2 - 0.5) * 3.4 - 1.2);
      vec2 tipOff  = baseDir + WIND_DIR * (gust * 4.8 + flutter) + vec2(0.0, -1.6 + gust * 1.1);
      vec2 midOff  = tipOff * 0.52 + vec2(-0.5, -1.1);

      vec2 s1 = segDT(p, root, root + midOff);
      vec2 s2 = segDT(p, root + midOff, root + tipOff);
      float dMain = min(s1.x, s2.x);
      float tMain = s1.x < s2.x ? s1.y * 0.5 : 0.5 + s2.y * 0.5;
      float thick = mix(0.95, 0.34, tMain);
      float mask  = (1.0 - ss(thick * 0.4, thick + 0.58, dMain)) * (0.42 + 0.36 * h3);

      shade = max(shade, mask * (1.0 - tMain * 0.52));
      glint = max(glint, mask * ss(0.42, 0.95, tMain) * ss(0.24, 0.92, gust));
    }
  }
  return vec2(shade, glint);
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

// Evaluates union of icon cloud core + overlapping cumulus puff circles in fine 64px spatial grid
float cloudDist(vec2 q, bool trackFront, inout vec4 fc) {
  float d = fieldS(q) - uEdge + 54.0;
  ivec2 cell = ivec2(floor(q / ${CELL_G}.0)) + ${PAD_TL};
  if (cell.x < 0 || cell.y < 0 || float(cell.x) >= uCGrid.x || float(cell.y) >= uCGrid.y) return d;
  for (int k = 0; k < ${CIRC_K}; k++) {
    vec4 c = texelFetch(uCirc, ivec2(cell.x * ${CIRC_K} + k, cell.y), 0);
    if (c.z <= 0.0) break;
    float di = length(q - c.xy) - c.z;
    d = smin(d, di, 6.0);
    if (trackFront && di < 0.0 && c.y > fc.y) fc = c;
  }
  return d;
}

float cloudDistSimple(vec2 q) {
  vec4 dummy = vec4(0.0, -1e9, 0.0, 0.0);
  return cloudDist(q, false, dummy);
}

// Renders natural Studio Ghibli meadow pond reflecting daytime sky + lily pads OR nighttime crescent moon + stars
vec3 shadeMeadowPond(vec2 p, vec3 grassCol, float dPond, float night, float wt, float windWave, float cloudShMask) {
  vec3 col = grassCol;

  // 1. Damp mossy grass bank & tiny river pebbles hugging the pond rim (0..13 px outside water)
  float bankMask = (1.0 - ss(-1.0, 13.0, dPond)) * ss(-2.5, 1.0, dPond);
  vec3 bankTint = mix(vec3(0.38, 0.54, 0.29), vec3(0.06, 0.14, 0.20), night);
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
      vec3 pebCol = mix(vec3(0.68, 0.66, 0.58), vec3(0.22, 0.28, 0.36), night);
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

  // Base water colors: sunlit sky-jade reflection (Day) <-> velvet starry midnight mirror (Night)
  float skyGrad = clamp(0.5 - (rel.x * 0.4 + rel.y * 0.6) / max(40.0, uPond.z * 2.0), 0.0, 1.0);
  vec3 dayShallow = vec3(0.48, 0.74, 0.62);
  vec3 dayDeep    = mix(vec3(0.46, 0.75, 0.86), vec3(0.74, 0.89, 0.94), skyGrad);
  vec3 dayWater   = mix(dayShallow, dayDeep, depthK);

  vec3 nightShallow = vec3(0.07, 0.16, 0.25);
  vec3 nightDeep    = mix(vec3(0.045, 0.105, 0.205), vec3(0.095, 0.200, 0.345), skyGrad);
  vec3 nightWater   = mix(nightShallow, nightDeep, depthK);

  vec3 water = mix(dayWater, nightWater, night);

  // Subtle reflected passing sky clouds mirrored inside the water
  float reflCloud = ss(6.0, -14.0, cloudDistSimple(p + vec2(ripX * 2.5 - 22.0, -30.0)));
  vec3 reflCloudCol = mix(vec3(0.95, 0.97, 0.98), vec3(0.22, 0.31, 0.45), night);
  water = mix(water, reflCloudCol, reflCloud * depthK * mix(0.44, 0.32, night));

  // Daytime subtle sunlit water glints
  if (night < 0.95) {
    float daySpark = ss(0.68, 0.92, N(vec2(rel.x * 0.6 + ripX * 2.0, rel.y * 1.4 - wt * 14.0), 54.0).g) * depthK;
    water = mix(water, vec3(0.96, 0.99, 0.98), daySpark * (1.0 - night) * 0.38);
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

    // 2. Crisp shimmering crescent moon reflected inside the pond!
    vec2 mPos = uPond.xy + vec2(-uPond.z * 0.14, -uPond.w * 0.08);
    vec2 mp = (p - mPos) + vec2(ripX * 1.45, fineRip * 0.45);
    float mRad = clamp(pondMinR * 0.36, 13.0, 26.0);
    float dOuter = length(mp) - mRad;
    // Shadow-bite offset matching LIGHT = (-0.6, -0.8) so bright crescent faces upper-left!
    float dCut = length(mp - vec2(mRad * 0.44, mRad * 0.34)) - mRad * 0.86;
    float crescent = ss(1.4, -1.0, dOuter) * ss(-1.0, 1.4, dCut);

    // Subtle watercolor lunar surface shading + soft watery bloom around crescent
    float moonTex = 0.92 + 0.08 * N(mp * 2.2, 42.0).r;
    vec3 moonCore = mix(vec3(0.86, 0.93, 1.0), vec3(1.00, 0.97, 0.86), 0.72) * moonTex;
    float moonHalo = exp(-max(dOuter, 0.0) / (mRad * 1.25)) * 0.42;
    water += vec3(0.42, 0.66, 0.88) * moonHalo * depthK * clearSky * night;
    water = mix(water, moonCore, crescent * depthK * clearSky * night * 0.94);

    // 3. Shimmering broken silver moonlight trail ("vệt trăng loang") dancing on ripples below-right of crescent
    vec2 trailRel = p - mPos;
    float tAlong = dot(trailRel, normalize(vec2(0.55, 0.84)));
    float tAcross = dot(trailRel, normalize(vec2(-0.84, 0.55)));
    float tEnv = ss(mRad * 0.2, mRad * 1.1, tAlong) * (1.0 - ss(mRad * 1.2, mRad * 3.1, tAlong))
               * exp(-pow(tAcross / (mRad * 0.62 + tAlong * 0.12), 2.0));
    float ripBars = ss(0.35, 0.88, sin(rel.y * 0.72 - uTime * 2.3 + ripNoise * 4.5));
    water = mix(water, vec3(0.95, 0.97, 0.92), tEnv * ripBars * depthK * clearSky * night * 0.56);
  }

  // Concentric ripple ring highlight
  water = mix(water, mix(vec3(0.92, 0.98, 0.97), vec3(0.76, 0.90, 0.99), night), ringGlow * 0.34);

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
      vec3 padNight = mix(vec3(0.08, 0.20, 0.22), vec3(0.17, 0.34, 0.36), ss(-lr, lr, -q.x - q.y));
      water = mix(water, mix(padDay, padNight, night), padM);
      // Tiny ivory-pink waterlily bud on the largest lily pad
      if (i == 0) {
        float flD = length(q - vec2(-1.4, -1.2)) - 2.3;
        vec3 budCol = mix(vec3(0.99, 0.93, 0.91), vec3(0.76, 0.86, 0.92), night);
        water = mix(water, budCol, ss(0.6, -0.5, flD));
      }
    }
  }

  // Soft watercolor edge meniscus darkening right at shoreline
  float shoreLine = (1.0 - ss(0.0, 3.2, abs(dPond))) * 0.28;
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

// Gentle wind-borne sunlit pollen / dandelion motes drifting diagonally in daytime
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
  float night = clamp(uNight, 0.0, 1.0);
  float wt = uWindTime;

  vec3 gLight  = mix(G_LIGHT,   N_G_LIGHT,   night);
  vec3 gMid    = mix(G_MID,     N_G_MID,     night);
  vec3 gDeep   = mix(G_DEEP,    N_G_DEEP,    night);
  vec3 gGustHi = mix(G_GUST_HI, N_G_GUST_HI, night);
  vec3 gInk    = mix(INK,       N_INK,       night);
  vec3 gShadow = mix(SHADOW,    N_SHADOW,    night);
  vec3 cHi     = mix(CLOUD_HI,   N_CLOUD_HI,   night);
  vec3 cBody   = mix(CLOUD_BODY, N_CLOUD_BODY, night);
  vec3 cSh     = mix(CLOUD_SH,   N_CLOUD_SH,   night);

  // --- 1. LUSH WATERCOLOR MEADOW + ANISOTROPIC WIND-COMBED TURF + SLOW ROLLING GUSTS ---
  float windWave = meadowWindWave(p, wt);
  float w1 = N(p, 1900.0).r;
  float w2 = N(p + 311.0, 650.0).g;
  vec3 col = mix(gMid, gLight, ss(0.28, 0.76, w1 * 0.68 + w2 * 0.32));
  col = mix(col, gDeep, ss(0.45, 0.85, N(p + 977.0, 1300.0).r) * mix(0.42, 0.56, night));
  col *= 1.0 + mix(0.055, 0.14, night) * (0.5 - (p.x + p.y) / max(1.0, cssRes.x + cssRes.y));

  // Plush wind-combed grass carpet strokes (gives deep velvety meadow volume!)
  vec2 turf = anisotropicTurf(p, wt, windWave);
  col = mix(col, gDeep * 0.88, turf.x * mix(0.30, 0.34, night));
  col = mix(col, gGustHi, (windWave * 0.45 + turf.y * 0.55) * mix(0.32, 0.26, night));

  // --- 1B. TRUE OFF-SCREEN UPPER-LEFT MOONLIGHT FLOOD (ZERO GHOST BANDS, ZERO STICKER!) ---
  float cloudShMask = ss(4.2, -3.4, cloudDistSimple(p - SHADOW_OFF));
  float moonPool = 0.0;
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

    // Unshadowed grass receives luminous silver-jade moonlight (sharply carved by the single crisp cloud shadow!)
    float unshadowed = 1.0 - cloudShMask * 0.90;
    vec3 moonGrass = mix(col * vec3(1.38, 1.58, 1.68), MOON_TINT * 0.58, 0.25);
    col = mix(col, moonGrass, moonPool * unshadowed * night * 0.82);
    col += MOON_TINT * cornerGlow * unshadowed * night * 0.14;
  }

  // Stationary watercolor paper stipple
  float paperGrain = hash2(floor(p * (0.8 * max(uDpr, 1.0))));
  col *= 1.0 + (paperGrain - 0.5) * mix(0.036, 0.044, night);

  // --- 1C. DENSE TOP-DOWN SWAYING GRASS TUFTS & WILDFLOWERS (MASKED CLEANLY OUTSIDE POND!) ---
  float dPond = pondSD(p);
  float landMask = ss(-1.0, 4.0, dPond);

  if (landMask > 0.01) {
    vec2 grass = swayingMeadowGrass(p, wt, windWave);
    col = mix(col, gInk, grass.x * mix(0.42, 0.44, night) * landMask);
    vec3 tipCol = mix(
      vec3(0.90, 0.94, 0.62),
      mix(vec3(0.24, 0.40, 0.46), vec3(0.76, 0.90, 0.97), moonPool * (1.0 - cloudShMask * 0.85)),
      night
    );
    col = mix(col, tipCol, grass.y * mix(0.36, 0.44, night) * landMask);

    // Silver moon-dew glints catching wind-bent grass tips outside cloud shadows
    if (night > 0.02 && moonPool > 0.14) {
      vec2 dewCell = floor(p / 20.0);
      vec2 dewUv = fract(p / 20.0) - 0.5;
      float dh1 = hash2(dewCell + 71.3);
      if (dh1 > 0.85) {
        vec2 sway = WIND_DIR * (windWave * 0.13);
        vec2 dOff = (vec2(hash2(dewCell + 13.7), hash2(dewCell + 39.2)) - 0.5) * 0.56 + sway;
        float dd = length(dewUv - dOff);
        float shimmer = 0.50 + 0.50 * sin(uTime * 1.9 + dh1 * 31.4 + windWave * 2.5);
        float dewDot = (1.0 - ss(0.03, 0.085, dd)) * shimmer * moonPool * (1.0 - cloudShMask * 0.92) * night * landMask;
        col = mix(col, vec3(0.88, 0.96, 1.0), dewDot * 0.68);
      }
    }

    // Gently nodding wildflowers swaying smoothly with slow wind gusts
    if (uFlowers > 0.01) {
      vec2 fCell = floor(p / 28.0);
      vec2 fUv = fract(p / 28.0) - 0.5;
      float fh1 = hash2(fCell + 11.3);
      float fh2 = hash2(fCell + 27.9);
      float fh3 = hash2(fCell + 43.1);
      if (fh1 > 1.0 - uFlowers * 0.15) {
        vec2 flSway = WIND_DIR * (windWave * 0.13 + sin(wt * 1.9 + fh2 * 6.283) * 0.035);
        vec2 jitter = (vec2(fh2, fh3) - 0.5) * 0.48 + flSway;
        float df = length(fUv - jitter);
        float dotMask = (1.0 - ss(0.055, 0.095, df)) * landMask;
        vec3 dayFl   = fh2 > 0.45 ? vec3(0.98, 0.97, 0.91) : vec3(0.96, 0.86, 0.46);
        vec3 nightFl = fh2 > 0.45 ? vec3(0.64, 0.79, 0.88) : vec3(0.58, 0.70, 0.62);
        nightFl *= (0.72 + 0.56 * moonPool * (1.0 - cloudShMask * 0.82));
        col = mix(col, mix(dayFl, nightFl, night), dotMask * mix(0.84, 0.74, night));
      }
    }
  }

  // --- 1D. POETIC MEADOW POND REFLECTING SKY & CRESCENT MOON ("BÓNG TRĂNG SOI MẶT NƯỚC") ---
  if (dPond < 14.0) {
    col = shadeMeadowPond(p, col, dPond, night, wt, windWave, cloudShMask);
  }

  // --- 2. KITE BOY & KITE ON THE GRASS (UNDERNEATH FLOATING CLOUDS) ---
  if (uActorRect.z > 1.0) {
    vec2 aUV = (p - uActorRect.xy) / uActorRect.zw;
    if (aUV.x >= 0.0 && aUV.x <= 1.0 && aUV.y >= 0.0 && aUV.y <= 1.0) {
      float shA = texture(uActorShadow, aUV).a;
      col = mix(col, col * gShadow, shA * mix(0.76, 0.80, night));
      vec4 act = texture(uActor, aUV);
      vec3 actMoon = act.rgb * mix(vec3(0.46, 0.57, 0.74), vec3(0.78, 0.88, 0.98), moonPool * (1.0 - cloudShMask * 0.72));
      actMoon += MOON_TINT * moonPool * (1.0 - cloudShMask * 0.72) * 0.07;
      col = mix(col, mix(act.rgb, actMoon, night), act.a);
    }
  }

  // --- 3. HAND-PAINTED BLACK KITTEN ON THE GRASS (UNDERNEATH CLOUDS) ---
  if (uCatRect.z > 1.0) {
    vec2 catUV = (p - uCatRect.xy) / uCatRect.zw;
    vec2 shUV  = (p - uCatShadow - uCatRect.xy) / uCatRect.zw;
    if (shUV.x >= 0.0 && shUV.x <= 1.0 && shUV.y >= 0.0 && shUV.y <= 1.0) {
      float cs = sampleCat(shUV).a;
      col = mix(col, col * gShadow, cs * mix(0.76, 0.80, night));
    }
    if (catUV.x >= 0.0 && catUV.x <= 1.0 && catUV.y >= 0.0 && catUV.y <= 1.0) {
      vec4 catC = sampleCat(catUV);
      float amberEye = ss(0.10, 0.30, catC.r - catC.b) * ss(0.24, 0.52, catC.r);
      vec3 furMoon = catC.rgb * mix(vec3(0.54, 0.66, 0.86), vec3(0.78, 0.90, 1.04), moonPool) + vec3(0.015, 0.028, 0.050);
      vec3 eyeMoon = catC.rgb * vec3(1.06, 0.96, 0.72);
      vec3 catNight = mix(furMoon, eyeMoon, amberEye);
      col = mix(col, mix(catC.rgb, catNight, night), catC.a);
    }
  }

  // --- 4. SINGLE CRISP HIGH-ALTITUDE CLOUD SHADOW CAST FAR SOUTHEAST (DEEP MOON-SHADOW AT NIGHT) ---
  col = mix(col, col * gShadow, cloudShMask * mix(0.84, 0.86, night));

  // --- 4B. FLOATING ATMOSPHERE: FIREFLIES (NIGHT) + DRIFTING SUNLIT POLLEN (DAY) ---
  if (night > 0.02) {
    col += meadowFireflies(p, uTime, night) * (1.0 - cloudShMask * 0.42);
  }
  if (night < 0.95) {
    col = mix(col, vec3(1.0, 0.99, 0.88), meadowPollen(p, wt, 1.0 - night) * (1.0 - cloudShMask * 0.5));
  }

  // --- 4C. STUDIO GHIBLI ANIME WIND RIBBONS (SWEEPING ACROSS MEADOW, UNDERNEATH CLOUDS!) ---
  float windRib = ghibliWindRibbons(p);
  if (windRib > 0.002) {
    vec3 ribDay   = vec3(0.99, 0.99, 0.94);
    vec3 ribNight = mix(vec3(0.62, 0.78, 0.92), vec3(0.84, 0.95, 1.00), moonPool * (1.0 - cloudShMask * 0.6));
    float ribAtten = 1.0 - cloudShMask * mix(0.28, 0.40, night);
    col = mix(col, mix(ribDay, ribNight, night), windRib * ribAtten);
  }

  // --- 5. STUDIO GHIBLI CEL-SHADED CUMULUS CLOUDS (SILVER-LINED AT NIGHT, ZERO CRACKS!) ---
  vec4 fc = vec4(0.0, -1e9, 0.0, 0.0);
  float d = cloudDist(p, true, fc);
  if (d < 1.5) {
    float hi = d > -21.0 ? ss(-1.0, 1.0, cloudDistSimple(p + LIGHT * 19.5)) : 0.0;
    vec3 cc = fc.y > -1e8 ? mix(cBody, cSh, fc.w * 0.58) : mix(cBody, cSh, 0.42);
    cc = mix(cc, cHi, hi * mix(1.0, 0.94, night));
    if (night > 0.02) {
      float rimEdge = ss(-7.5, 0.0, d) * hi;
      cc += vec3(0.16, 0.24, 0.34) * rimEdge * (0.85 + 0.55 * moonPool) * night;
    }
    cc *= 1.0 + (paperGrain - 0.5) * 0.018;
    col = mix(col, cc, ss(1.0, -1.0, d));
  }

  fragColor = vec4(col, 1.0);
}`;
