/**
 * Big Fish & Begonia Theme WebGL2 Fragment Shader — "Đại Ngư Hải Đường"
 * East-Asian watercolor & gouache cinema multiplane optics:
 *   1. Vast Celestial Sky (Mineral Jade Day / Vermilion-Cinnabar Sunset / Starlit Jade-Indigo Night)
 *   2. Luminous Full Moon (Night) / Low Setting Crimson-Gold Sun (Sunset) + Multi-tier Starfield + Shooting Stars
 *   3. Painterly Cumulus Clouds obeying Single-Source-of-Truth radial lighting + Mie Silver Lining
 *   4. Layered Ink-Wash Karst Mountains + Illuminated Fujian Tulou (flickering red lanterns & amber windows)
 *   5. Real Sky-Mirror Lake (ny > 0.56) physically reflecting Sky, Stars, Clouds, Moon/Sun shimmer path,
 *      Karst silhouettes, AND the Glowing Fujian Tulou upside-down with organic Fresnel water ripples!
 *   6. Adaptive Icon World (Jade-Gold Lotus Water Ripples on lake + Soft Spirit-Mist Halos on sky)
 *   7. Dynamic Spirit Layer (24-segment Articulated Great Fish Kun + its Lake Reflection, Drifting Begonia Petals,
 *      Expanding Water Ripples, and Floating Lotus Water Lanterns)
 *   8. Foreground Swaying Ancient Crimson Begonia Bough (pinned to top-left corner) + Paper Grain + Filmic Rolloff
 */

export const BEGONIA_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform sampler2D uTulouTex;
uniform sampler2D uBranchTex;
uniform sampler2D uSpiritTex;
uniform sampler2D uMoonTex;

uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uStep;
uniform float uDpr;
uniform float uMix;
uniform float uTime;
uniform float uWindTime;
uniform float uWindSpeed;
uniform float uAdaptive;
uniform float uWaterMist;
uniform float uSunset;
uniform float uNight;
uniform float uMoonOcc;
uniform float uMoonVis;
uniform float uSunVis;
uniform float uShowMeteors;
uniform float uTulouReady;
uniform float uBranchReady;
uniform float uMoonPhase;   // 0=New, 0.25=First Qtr, 0.5=Full (100%), 0.75=Last Qtr
uniform float uSeed;

uniform vec4 uTulouRect;   // x, y, w, h in CSS px
uniform vec4 uBranchRect;  // x, y, w, h in CSS px

out vec4 fragColor;

const float HORIZON_NY = 0.56;

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float sq(float x) { return x * x; }

vec3 moodMix(vec3 dayC, vec3 sunC, vec3 ngtC, float sunset, float night) {
  float dayW = max(0.0, 1.0 - sunset - night);
  float sumW = max(0.001, dayW + sunset + night);
  return (dayC * dayW + sunC * sunset + ngtC * night) / sumW;
}

vec2 moodMix2(vec2 dayV, vec2 sunV, vec2 ngtV, float sunset, float night) {
  float dayW = max(0.0, 1.0 - sunset - night);
  float sumW = max(0.001, dayW + sunset + night);
  return (dayV * dayW + sunV * sunset + ngtV * night) / sumW;
}

vec4 N(vec2 p, float scale) {
  return texture(uNoise, p / scale + uSeed * 0.017);
}

float fieldS(vec2 p) {
  vec2 uv = (p / uStep + 0.5) / uGrid;
  return mix(texture(uFA, uv).r, texture(uFB, uv).r, uMix);
}

// Painterly Chinese sky clouds with Single-Source-of-Truth directional lighting (fast 1-tap on mirror reflection)
vec2 skyCloud(vec2 p, float scaleX, float scaleY, float driftX, float coverage, vec2 lightStep, bool fastMode) {
  if (coverage <= 0.015) return vec2(0.0);
  vec2 q = vec2(p.x - driftX, p.y) * vec2(1.0 / scaleX, 1.0 / scaleY);
  vec4 t1 = N(q * 56.0, 256.0);
  float shape = fastMode
    ? (t1.r * 0.72 + t1.g * 0.28)
    : (t1.r * 0.58 + N(q * 112.0 + vec2(37.0, 23.0), 256.0).r * 0.28 + t1.g * 0.14);
  float thresh = 1.0 - coverage;
  float alpha = ss(thresh - 0.065, thresh + 0.085, shape);
  if (alpha <= 0.004) return vec2(0.0);
  if (fastMode) {
    return vec2(alpha, ss(thresh, thresh + 0.26, shape));
  }
  float shapeLit = N((q + lightStep) * 56.0, 256.0).r * 0.72 + t1.g * 0.28;
  float rim = ss(-0.11, 0.13, shape - shapeLit) * 0.72 + ss(thresh, thresh + 0.26, shape) * 0.28;
  return vec2(alpha, clamp(rim, 0.0, 1.0));
}

// Smooth ink-wash karst hill silhouette profiles along horizon (layer 0 = far, layer 1 = near)
float karstRidgeNy(float nx, float layer) {
  if (layer < 0.5) {
    float h = 0.070 * sin(nx * 5.8 + 0.6)
            + 0.042 * sin(nx * 12.5 - 1.1)
            + 0.022 * cos(nx * 23.0 + 2.4);
    // Gentle valley dip in the center-left so Moon/Sun & sky mirror open wide!
    float valley = exp(-sq((nx - 0.34) / 0.28)) * 0.048;
    return HORIZON_NY - max(0.012, 0.072 + h * 0.62 - valley);
  } else {
    float h = 0.042 * sin(nx * 8.2 + 2.3)
            + 0.024 * cos(nx * 17.5 + 0.8)
            + 0.012 * sin(nx * 31.0 - 0.4);
    float rightShoulder = ss(0.54, 0.88, nx) * 0.024;
    float leftShoulder  = (1.0 - ss(0.05, 0.32, nx)) * 0.020;
    return HORIZON_NY - max(0.006, 0.028 + h * 0.45 + rightShoulder + leftShoulder);
  }
}

// Poetic celestial shooting stars (pure ALU, zero texture fetches!)
vec3 begoniaShootingStars(vec2 p, vec2 cssRes, float t, float sunset, float night, vec2 moonPos, float mRad) {
  float visAmt = clamp(night + sunset * 0.45, 0.0, 1.0);
  if (visAmt < 0.03) return vec3(0.0);
  float ny = p.y / max(1.0, cssRes.y);
  if (ny > HORIZON_NY) return vec3(0.0);

  vec3 acc = vec3(0.0);
  float vertFade = 1.0 - ss(0.32, HORIZON_NY, ny);
  float glareMask = night > 0.02 ? ss(mRad * 1.15, mRad * 2.8, length(p - moonPos)) : 1.0;

  for (int i = 0; i < 3; i++) {
    if (night < 0.25 && i == 2) continue;
    float fi = float(i);
    float period   = (i == 0) ? 6.4  : ((i == 1) ? 11.1 : 15.7);
    float phaseOff = (i == 0) ? 4.8  : ((i == 1) ? 6.0  : 2.3);
    float dur      = (i == 0) ? 0.94 : ((i == 1) ? 0.84 : 0.76);

    float shifted = t + phaseOff;
    float cyc = floor(shifted / period);
    float localT = shifted - cyc * period;
    if (localT > dur) continue;

    float prog = localT / dur;
    float env = ss(0.0, 0.14, prog) * (1.0 - ss(0.60, 1.0, prog));
    if (env <= 0.004) continue;

    float h1 = hash2(vec2(cyc * 17.3 + fi * 31.7, fi * 11.3 + 4.2));
    float h2 = hash2(vec2(cyc * 29.1 + fi * 13.9, fi * 7.7  + 19.8));
    float h3 = hash2(vec2(cyc * 43.7 + fi * 23.1, fi * 19.3 + 8.6));

    vec2 dir = normalize(vec2(-0.84 - (h3 - 0.5) * 0.14, 0.50 + (h3 - 0.5) * 0.12));
    vec2 start = vec2(cssRes.x * (0.28 + h1 * 0.68), cssRes.y * (0.02 + h2 * 0.20));
    float travel = cssRes.x * (0.15 + h2 * 0.13) * ((i == 2) ? 0.78 : 1.0);
    vec2 head = start + dir * (travel * prog * (1.12 - 0.12 * prog));

    float tailLen = travel * (0.46 + 0.15 * h1) * ss(0.0, 0.26, prog) * (1.0 - ss(0.74, 1.0, prog) * 0.42);
    vec2 q = p - head;
    float along = -dot(q, dir);
    float perp  = abs(-q.x * dir.y + q.y * dir.x);
    if (perp > 22.0 || along < -20.0 || along > tailLen + 12.0) continue;

    float tNorm = clamp(along / max(tailLen, 1.0), 0.0, 1.0);
    float wCore = 1.48 * (1.0 - tNorm * 0.78) + 0.22;
    float wGlow = 5.40 * (1.0 - tNorm * 0.72) + 1.10;
    float longFade = ss(-2.2, 2.0, along) * pow(max(0.0001, 1.0 - tNorm), 1.85);
    float core = exp(-sq(perp / wCore)) * longFade;
    float glow = exp(-sq(perp / wGlow)) * longFade * 0.28;

    float dHead = length(q);
    float headCore = exp(-sq(dHead / 2.0)) * 1.26;
    float headHalo = exp(-sq(dHead / 8.8)) * 0.34;
    float crossGlint = (exp(-sq(q.x / 1.0) - sq(q.y / 8.2)) + exp(-sq(q.y / 1.0) - sq(q.x / 8.2))) * 0.28;

    float warmMix = sunset * (1.0 - night);
    vec3 cHead = vec3(1.06, 1.04, 0.98);
    vec3 cMid  = mix(vec3(0.78, 0.94, 1.00), vec3(1.00, 0.88, 0.72), warmMix);
    vec3 cTail = mix(vec3(0.56, 0.74, 0.96), vec3(0.95, 0.54, 0.42), warmMix);
    vec3 tailCol = mix(mix(cHead, cMid, ss(0.0, 0.22, tNorm)), cTail, ss(0.28, 0.95, tNorm));

    float slotBright = ((i == 0) ? 0.94 : ((i == 1) ? 0.74 : 0.60)) * env * visAmt * vertFade * glareMask;
    acc += (tailCol * (core + glow) + cHead * (headCore + crossGlint) + cMid * headHalo) * slotBright;
  }
  return acc;
}

// Evaluates the full upper sky + celestial bodies + clouds + ink-wash karst hills + Fujian Tulou
// Called BOTH for the real upper sky AND upside-down inside the Sky-Mirror Lake reflection!
vec3 evalSkyAndHorizon(
  vec2 sp,
  vec2 cssRes,
  float wt,
  float g1,
  float sunset,
  float night,
  float dayAmt,
  float moonVis,
  float moonOcc,
  float sunVis,
  vec2 moonPos,
  float mRad,
  vec2 sunPos,
  float sRad,
  float mistAmt,
  bool isReflection
) {
  float nx = clamp(sp.x / cssRes.x, 0.0, 1.0);
  float ny = clamp(sp.y / cssRes.y, 0.0, HORIZON_NY);
  float skyT = clamp(ny / HORIZON_NY, 0.0001, 1.0);

  // 1. Mineral East-Asian Sky Gradient (Jade-Celadon Day / Vermilion-Cinnabar Sunset / Deep Jade-Indigo Night)
  vec3 topDay = vec3(0.145, 0.435, 0.615);
  vec3 midDay = vec3(0.365, 0.665, 0.755);
  vec3 horDay = vec3(0.685, 0.855, 0.855);

  vec3 topSun = vec3(0.105, 0.165, 0.345);
  vec3 midSun = vec3(0.545, 0.255, 0.345);
  vec3 horSun = vec3(0.965, 0.565, 0.345);

  vec3 topNgt = vec3(0.015, 0.042, 0.095) * mix(0.88, 1.08, moonVis);
  vec3 midNgt = vec3(0.028, 0.078, 0.155) * mix(0.84, 1.12, moonVis);
  vec3 horNgt = vec3(0.056, 0.142, 0.232) * mix(0.80, 1.16, moonVis);

  vec3 cTop = moodMix(topDay, topSun, topNgt, sunset, night);
  vec3 cMid = moodMix(midDay, midSun, midNgt, sunset, night);
  vec3 cHor = moodMix(horDay, horSun, horNgt, sunset, night);

  float stG = clamp(skyT + (g1 - 0.5) * 0.02, 0.0, 1.0);
  vec3 col = mix(cTop, cMid, ss(0.0, 0.58, stG));
  col = mix(col, cHor, ss(0.45, 1.0, stG));

  // Broad atmospheric scattering dome around Moon (Night) or Setting Sun (Sunset)
  vec2 mp = sp - moonPos;
  float dMoon = length(mp);
  if (night > 0.01) {
    float dome = exp(-dMoon / (cssRes.x * 0.42)) * (0.52 + 0.48 * moonVis);
    col += vec3(0.085, 0.185, 0.285) * dome * 0.62 * night;
  }
  if (sunset > 0.01) {
    float dSun = length(sp - sunPos);
    float sDome = exp(-dSun / (cssRes.x * 0.38)) * (0.60 + 0.40 * sunVis);
    col += vec3(0.88, 0.38, 0.22) * sDome * 0.42 * sunset;
  }

  // 2. Crisp Twinkling Celestial Starfield (vivid at Night + delicate early stars at Sunset zenith)
  float starAmt = clamp(night + sunset * 0.42, 0.0, 1.0);
  if (starAmt > 0.03) {
    float glareM = night > 0.02 ? ss(mRad * 1.5, mRad * 4.8, dMoon) : 1.0;
    float vFade = 1.0 - ss(0.48, 0.96, skyT) * (1.0 - night * 0.35);
    vec2 sC1 = floor(sp / 24.0);
    vec2 sU1 = fract(sp / 24.0) - 0.5;
    float sh1 = hash2(sC1 + 17.3);
    if (sh1 > mix(0.76, 0.62, night)) {
      vec2 so = (vec2(hash2(sC1 + 5.1), hash2(sC1 + 43.7)) - 0.5) * 0.66;
      float sd = length(sU1 - so);
      float tw = 0.54 + 0.46 * sin(uTime * (1.6 + sh1 * 2.5) + sh1 * 48.0);
      float sb = (1.0 - ss(0.022, 0.084, sd)) * tw * vFade * glareM * starAmt;
      col = mix(col, vec3(0.95, 0.98, 1.00), sb * (isReflection ? 0.68 : 0.90));
    }
    if (!isReflection) {
      vec2 sC2 = floor((sp + vec2(9.0, 13.0)) / 15.0);
      vec2 sU2 = fract((sp + vec2(9.0, 13.0)) / 15.0) - 0.5;
      float sh2 = hash2(sC2 + 89.2);
      if (sh2 > 0.82) {
        vec2 so2 = (vec2(hash2(sC2 + 27.4), hash2(sC2 + 63.1)) - 0.5) * 0.62;
        float sd2 = length(sU2 - so2);
        float tw2 = 0.50 + 0.50 * sin(uTime * (2.1 + sh2 * 2.0) + sh2 * 35.0);
        float sb2 = (1.0 - ss(0.018, 0.068, sd2)) * tw2 * (1.0 - ss(0.30, 0.72, skyT)) * glareM * starAmt;
        col = mix(col, vec3(0.88, 0.96, 1.00), sb2 * 0.56);
      }
    }
  }

  // 3. Setting Crimson-Gold Sun (Sunset) OR Luminous Gouache Full Moon (Night)
  if (sunset > 0.02) {
    float dS = length(sp - sunPos);
    float dO = dS - sRad;
    float disc = ss(1.6, -1.2, dO);
    float sAura1 = exp(-max(dO, 0.0) / (sRad * 1.4)) * (0.55 + 0.35 * sunVis);
    float sAura2 = exp(-max(dO, 0.0) / (sRad * 4.8)) * (0.24 + 0.14 * sunVis);
    col += vec3(1.00, 0.72, 0.42) * sAura1 * 0.52 * sunset;
    col += vec3(0.96, 0.44, 0.28) * sAura2 * 0.45 * sunset;
    if (disc > 0.002) {
      vec3 sunDisc = vec3(1.16, 0.96, 0.74);
      col = mix(col, sunDisc, disc * sunset * 0.96);
    }
  }

  if (night > 0.02) {
    float moonTheta = uMoonPhase * 6.2831853;
    float moonIllum = 0.5 - 0.5 * cos(moonTheta);
    float phaseGlow = mix(0.18, 1.0, pow(max(0.0001, moonIllum), 0.65));
    vec2 mLocal = mp / max(1.0, mRad);
    float rN = length(mLocal);
    vec2 rotM = vec2(mLocal.x * 0.97 + mLocal.y * 0.24, -mLocal.x * 0.24 + mLocal.y * 0.97);
    float lx = sin(moonTheta);
    float lz = -cos(moonTheta);
    float dO = dMoon - mRad;
    float disc = ss(1.5, -1.2, dO);
    float limbDir = mix(clamp(0.55 + 0.45 * (rotM.x / max(0.25, rN)) * lx, 0.18, 1.0), 1.0, moonIllum);
    vec3 skyBeforeMoon = col;
    float aureole = exp(-max(dO, 0.0) / (mRad * 1.15)) * (0.48 + 0.34 * moonVis) * phaseGlow * limbDir;
    float corona  = exp(-max(dO, 0.0) / (mRad * 4.40)) * (0.20 + 0.16 * moonVis) * phaseGlow;
    float iceHalo = exp(-sq((dMoon - mRad * 2.85) / (mRad * 0.72))) * (0.04 + 0.18 * moonOcc) * phaseGlow;
    col += vec3(0.96, 0.95, 0.88) * aureole * 0.44 * night;
    col += vec3(0.46, 0.76, 0.94) * corona  * 0.72 * night;
    col += vec3(0.72, 0.88, 0.98) * iceHalo * night;
    if (disc > 0.002) {
      float rClamped = min(1.0, rN);
      float z3 = sqrt(max(0.0, 1.0 - rClamped * rClamped));
      vec2 mUV = clamp(rotM * 0.480 + 0.5, 0.005, 0.995);
      vec4 mTex = texture(uMoonTex, mUV);
      float h0 = mTex.a;
      float hx = texture(uMoonTex, clamp(mUV + vec2(0.0058, 0.0), 0.005, 0.995)).a;
      float ndotlSmooth = rotM.x * lx + z3 * lz;
      float litPhase = ss(-0.05, 0.16, ndotlSmooth + (h0 - 0.5) * 0.045);
      float termBand = exp(-sq((ndotlSmooth - 0.14) / 0.316)) * litPhase;
      float relief = clamp(1.0 + (h0 - hx) * lx * 4.2 * termBand, 0.78, 1.24);
      float regolith = 0.94 + 0.12 * pow(max(0.0001, z3), 0.14);
      vec3 moonLitCol = mTex.rgb * regolith * relief * vec3(1.06, 1.04, 0.98);
      vec3 earthshine = skyBeforeMoon * 0.88 + mTex.rgb * vec3(0.055, 0.088, 0.128) + vec3(0.008, 0.018, 0.032);
      vec3 moonCol = mix(earthshine, moonLitCol, litPhase);
      col = mix(col, moonCol, disc * night * 0.99);
    }
  }

  // Shooting stars strictly in upper sky (before clouds & mountains so clouds naturally occlude them!)
  if (!isReflection && uShowMeteors > 0.5 && (night + sunset) > 0.04) {
    col += begoniaShootingStars(sp, cssRes, uTime, sunset, night, moonPos, mRad);
  }

  // 4. Sculpted Painterly Sky Clouds obeying Single-Source-of-Truth radial light vector
  vec2 toMoon = (moonPos - sp) / max(dMoon, 1.0);
  vec2 toSun  = (sunPos - sp) / max(length(sunPos - sp), 1.0);
  vec2 cLightStep = moodMix2(vec2(0.18, -0.22), toSun * 0.24, toMoon * 0.25, sunset, night);
  float moonFalloff = 0.42 + 0.58 * exp(-dMoon / (cssRes.x * 0.62));

  float cov = clamp(ss(0.10, 0.44, skyT) * (1.0 - ss(0.76, 1.02, skyT)) * (0.42 + 0.52 * mistAmt), 0.0, 0.86);
  vec2 cl = skyCloud(sp, 310.0, 175.0, wt * 13.0, cov, cLightStep, isReflection);
  if (cl.x > 0.004) {
    vec3 clLit = moodMix(vec3(0.99, 0.99, 0.96), vec3(1.00, 0.76, 0.50), vec3(0.52, 0.74, 0.90) * mix(0.66, 1.18, moonVis), sunset, night);
    vec3 clMid = moodMix(vec3(0.80, 0.90, 0.92), vec3(0.82, 0.44, 0.40), vec3(0.16, 0.29, 0.45) * mix(0.72, 1.12, moonVis), sunset, night);
    vec3 clShd = moodMix(vec3(0.54, 0.72, 0.80), vec3(0.24, 0.23, 0.39), vec3(0.045, 0.095, 0.185), sunset, night);
    vec3 cCol = mix(clShd, clMid, ss(0.10, 0.58, cl.y));
    cCol = mix(cCol, clLit, ss(0.45, 0.94, cl.y) * mix(1.0, moonFalloff, night));
    if (night > 0.02) {
      float prox = exp(-dMoon / (mRad * 4.2));
      float thinEdge = cl.x * (1.0 - cl.x) * 4.0;
      cCol = mix(cCol, vec3(0.95, 0.98, 1.00), clamp(prox * thinEdge * 1.15, 0.0, 0.88) * night);
    }
    col = mix(col, cCol, cl.x * 0.86);
  }

  // 5. Two Layered Chinese Ink-Wash Misty Karst Mountains receding along the horizon
  float rFar = karstRidgeNy(nx, 0.0);
  if (ny > rFar - 0.01) {
    float mFar = ss(rFar - 0.004, rFar + 0.006, ny);
    vec3 farDay = vec3(0.39, 0.58, 0.64);
    vec3 farSun = vec3(0.34, 0.25, 0.36);
    vec3 farNgt = vec3(0.045, 0.112, 0.188) * mix(0.84, 1.14, moonVis);
    vec3 farCol = moodMix(farDay, farSun, farNgt, sunset, night);
    // Mist veil softening the mountain feet cleanly into the mirror lake horizon!
    float footMist = ss(rFar, HORIZON_NY, ny) * (0.42 + 0.34 * mistAmt);
    farCol = mix(farCol, cHor, footMist);
    col = mix(col, farCol, mFar * 0.94);
  }

  float rNear = karstRidgeNy(nx, 1.0);
  if (ny > rNear - 0.01) {
    float mNear = ss(rNear - 0.003, rNear + 0.005, ny);
    vec3 nrDay = vec3(0.24, 0.42, 0.49);
    vec3 nrSun = vec3(0.22, 0.16, 0.26);
    vec3 nrNgt = vec3(0.028, 0.074, 0.132) * mix(0.82, 1.14, moonVis);
    vec3 nrCol = moodMix(nrDay, nrSun, nrNgt, sunset, night);
    float footMist2 = ss(rNear, HORIZON_NY, ny) * (0.30 + 0.28 * mistAmt);
    nrCol = mix(nrCol, cHor, footMist2);
    col = mix(col, nrCol, mNear * 0.96);
  }

  // 6. Iconic Hand-Painted Fujian Tulou (Thổ Lâu Phúc Kiến) with Flickering Red Lanterns & Amber Windows!
  if (uTulouReady > 0.5 && uTulouRect.z > 1.0) {
    vec2 tUV = (sp - uTulouRect.xy) / uTulouRect.zw;
    if (tUV.x >= 0.0 && tUV.x <= 1.0 && tUV.y >= 0.0 && tUV.y <= 1.0) {
      vec4 tul = texture(uTulouTex, tUV);
      if (tul.a > 0.005) {
        // Detect hanging crimson-red paper lanterns & warm amber arched windows inside the Tulou
        float isRedLantern = ss(0.18, 0.38, tul.r - tul.g) * ss(0.42, 0.72, tul.r) * ss(0.18, 0.62, tUV.y) * (1.0 - ss(0.60, 0.72, tUV.y));
        float isAmberWin   = ss(0.26, 0.52, tul.r - tul.b) * ss(0.68, 0.90, tul.r) * ss(0.42, 0.74, tul.g) * ss(0.24, 0.72, tUV.y) * (1.0 - ss(0.72, 0.80, tUV.y));
        float flick = 0.92 + 0.08 * sin(uTime * 3.6 + tUV.x * 24.0);

        // Directional moonlight facing LEFT/TOP toward moonPos at (0.28, 0.18)
        float tMoonFace = ss(-0.8, 0.8, dot((tUV - 0.5) * 2.0, toMoon));
        vec3 tulDay = mix(tul.rgb, tul.rgb * vec3(0.95, 1.00, 1.02), 0.20);
        vec3 tulSun = tul.rgb * vec3(0.84, 0.62, 0.64) + vec3(0.032, 0.015, 0.025);
        vec3 tulNgt = tul.rgb * (vec3(0.22, 0.34, 0.50) * (0.34 + 0.66 * tMoonFace) * mix(0.68, 1.15, moonVis) + vec3(0.055, 0.095, 0.165));

        // 1-tap silver moon rim along moon-facing tiled roofs & eaves at Night!
        if (night > 0.02 && !isReflection) {
          float rawRim = clamp(tul.a - texture(uTulouTex, clamp(tUV + toMoon * 0.0042, 0.0, 1.0)).a, 0.0, 1.0);
          float tRim = ss(0.24, 0.90, rawRim) * ss(0.70, 0.98, tul.a);
          tulNgt += vec3(0.46, 0.68, 0.90) * tRim * (0.40 + 0.60 * tMoonFace) * moonVis;
        }

        // Warm interior lantern & gallery bounce illuminating the circular wooden corridors at Sunset & Night
        float lanBand = exp(-sq((tUV.y - 0.44) / 0.18)) * exp(-sq((tUV.x - 0.50) / 0.42));
        tulSun += vec3(0.22, 0.09, 0.03) * lanBand * 0.45;
        tulNgt += vec3(0.32, 0.11, 0.04) * lanBand * 0.65 * flick;

        vec3 tulCol = moodMix(tulDay, tulSun, tulNgt, sunset, night);
        float glowBoost = max(sunset * 0.72, night * 1.0);
        // Luminous glowing vermilion-red silk lanterns & golden arched windows!
        tulCol = mix(tulCol, vec3(1.24, 0.34, 0.16) * flick, isRedLantern * glowBoost * 0.94);
        tulCol = mix(tulCol, vec3(1.24, 0.82, 0.34) * flick, isAmberWin   * glowBoost * 0.96);

        // Soft lakeside mist wrapping the bottom rocks into the horizon line
        float baseMist = ss(0.84, 0.98, tUV.y) * (0.32 + 0.25 * mistAmt);
        tulCol = mix(tulCol, cHor, baseMist);
        col = mix(col, tulCol, tul.a);
      }
    }
    // Soft warm crimson-amber lantern aura radiating gently around the Tulou's glowing eaves at Night & Sunset!
    float auraBoost = max(sunset * 0.32, night * 0.72);
    if (auraBoost > 0.02) {
      vec2 tCen = uTulouRect.xy + uTulouRect.zw * vec2(0.50, 0.52);
      vec2 dT = (sp - tCen) / (uTulouRect.zw * vec2(0.52, 0.34));
      float tAura = exp(-dot(dT, dT));
      col += vec3(0.95, 0.34, 0.14) * tAura * 0.22 * auraBoost;
    }
  }

  return col;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 cssRes = max(vec2(1.0), uRes / uDpr);
  float nx = p.x / cssRes.x;
  float ny = p.y / cssRes.y;
  float horY = cssRes.y * HORIZON_NY;
  float wt = uWindTime;
  float sunset = clamp(uSunset, 0.0, 1.0);
  float night  = clamp(uNight,  0.0, 1.0);
  float dayAmt = max(0.0, 1.0 - sunset - night);
  float mistAmt = clamp(uWaterMist, 0.0, 1.0);

  vec2 gp = floor(p * (0.80 * max(uDpr, 1.0)));
  float g1 = hash2(gp + 0.5);

  vec2 moonPos = vec2(cssRes.x * 0.28, cssRes.y * 0.18);
  float mRad   = clamp(min(cssRes.x, cssRes.y) * 0.048, 22.0, 44.0);
  vec2 sunPos  = vec2(cssRes.x * 0.36, cssRes.y * 0.44);
  float sRad   = clamp(min(cssRes.x, cssRes.y) * 0.042, 18.0, 38.0);
  float moonOcc = clamp(uMoonOcc, 0.0, 1.0);
  float moonVis = clamp(uMoonVis, 0.22, 1.0);
  float sunVis  = clamp(uSunVis,  0.25, 1.0);

  vec3 col;

  if (ny <= HORIZON_NY) {
    // =========================================================================
    // UPPER WORLD: CELESTIAL SKY, STARS, MOON/SUN, KARST HILLS & FUJIAN TULOU
    // =========================================================================
    col = evalSkyAndHorizon(
      p, cssRes, wt, g1, sunset, night, dayAmt,
      moonVis, moonOcc, sunVis, moonPos, mRad, sunPos, sRad, mistAmt, false
    );

    // Subtle adaptive translucent spirit-mist halo behind sky-half desktop icons
    if (uAdaptive >= 0.5) {
      float sdf = fieldS(p);
      float icW = (N(p - vec2(wt * 10.0, 0.0), 180.0).g - 0.5) * 14.0;
      float icM = ss(10.0, -16.0, sdf + icW);
      if (icM > 0.004) {
        vec3 haloCol = moodMix(vec3(0.86, 0.94, 0.94), vec3(0.95, 0.72, 0.60), vec3(0.14, 0.26, 0.38), sunset, night);
        col = mix(col, haloCol, icM * 0.34);
      }
    }
  } else {
    // =========================================================================
    // LOWER WORLD: REAL SKY-MIRROR LAKE ("MẶT GƯƠNG THÔNG THIÊN") + RIPPLES!
    // =========================================================================
    float waterD = clamp((ny - HORIZON_NY) / (1.0 - HORIZON_NY), 0.0, 1.0);
    float persp  = 0.22 + waterD * 0.95;

    // Silky horizontal watercolor ripples (fine near horizon, broader near viewer)
    vec2 rQ1 = vec2(p.x * 0.55 - wt * 14.0, p.y * 2.4 / persp + wt * 6.5);
    vec2 rQ2 = vec2(p.x * 1.15 + wt * 9.0,  p.y * 4.8 / persp - wt * 10.0);
    vec4 rn1 = N(rQ1, 220.0);
    vec4 rn2 = N(rQ2, 160.0);
    float ripWaveX = (rn1.r - 0.5) * 18.0 + (rn2.g - 0.5) * 8.0;
    float ripWaveY = (rn1.g - 0.5) * 9.0  + (rn2.r - 0.5) * 4.5;

    // Adaptive icon water-calming: flatten ripples gently right under desktop icons!
    float sdf = uAdaptive >= 0.5 ? fieldS(p) : 999.0;
    float iconCalm = uAdaptive >= 0.5 ? ss(22.0, -12.0, sdf) : 0.0;
    float ripScale = (0.28 + 0.72 * waterD) * (1.0 - iconCalm * 0.65);

    vec2 refP = vec2(p.x + ripWaveX * ripScale, 2.0 * horY - p.y + ripWaveY * ripScale);
    refP.y = clamp(refP.y, 1.0, horY - 1.0);

    vec3 refCol = evalSkyAndHorizon(
      refP, cssRes, wt, g1, sunset, night, dayAmt,
      moonVis, moonOcc, sunVis, moonPos, mRad, sunPos, sRad, mistAmt, true
    );

    // Physical Fresnel reflectivity: near-perfect mirror by horizon, rich mineral jade depth in foreground
    vec3 deepDay = vec3(0.085, 0.285, 0.345);
    vec3 deepSun = vec3(0.145, 0.135, 0.235);
    vec3 deepNgt = vec3(0.018, 0.068, 0.118);
    vec3 waterBase = moodMix(deepDay, deepSun, deepNgt, sunset, night);
    float fresnel = mix(0.88, 0.54, pow(max(0.0001, waterD), 0.75));
    col = mix(waterBase, refCol, fresnel);

    // Shimmering broken-ripple Moon path (Night) & Crimson-Gold Sun path (Sunset) down the water!
    float shimmerNoise = ss(0.42, 0.88, rn1.b * 0.55 + rn2.r * 0.45);
    if (night > 0.02) {
      float dxM = abs(p.x - moonPos.x + ripWaveX * 0.55) / (mRad * (1.2 + waterD * 3.8));
      float mPath = exp(-sq(dxM)) * (0.25 + 0.75 * shimmerNoise) * (1.0 - waterD * 0.35) * moonVis;
      col += vec3(0.76, 0.90, 1.00) * mPath * 0.46 * night;
    }
    if (sunset > 0.02) {
      float dxS = abs(p.x - sunPos.x + ripWaveX * 0.55) / (sRad * (1.4 + waterD * 4.4));
      float sPath = exp(-sq(dxS)) * (0.25 + 0.75 * shimmerNoise) * (1.0 - waterD * 0.30) * sunVis;
      col += vec3(1.00, 0.68, 0.38) * sPath * 0.52 * sunset;
    }

    // Warm shimmering crimson-gold reflection column beneath the Fujian Tulou's red lanterns!
    if (uTulouReady > 0.5 && uTulouRect.z > 1.0 && (sunset + night) > 0.04) {
      float tCenX = uTulouRect.x + uTulouRect.z * 0.50;
      float dxT = abs(p.x - tCenX + ripWaveX * 0.65) / (uTulouRect.z * (0.34 + waterD * 0.24));
      float lanStreak = exp(-sq(dxT)) * exp(-waterD * 2.4) * (0.35 + 0.65 * shimmerNoise);
      col += vec3(1.04, 0.38, 0.16) * lanStreak * (0.22 * sunset + 0.44 * night);
    }

    // Soft silky mist seam right along the horizon line uniting sky and mirror water!
    float horMist = exp(-sq(waterD / 0.085)) * (0.32 + 0.36 * mistAmt);
    vec3 horMistCol = moodMix(vec3(0.70, 0.86, 0.87), vec3(0.95, 0.58, 0.38), vec3(0.075, 0.165, 0.255), sunset, night);
    col = mix(col, horMistCol, horMist);

    // Adaptive Icon Jade-Gold Lotus Ripple Pool cradling water-half desktop icons!
    if (uAdaptive >= 0.5) {
      float icPool = ss(10.0, -18.0, sdf);
      if (icPool > 0.004) {
        vec3 poolTint = moodMix(vec3(0.28, 0.58, 0.60), vec3(0.46, 0.26, 0.32), vec3(0.075, 0.175, 0.235), sunset, night);
        col = mix(col, poolTint, icPool * 0.42);
      }
      // Delicate animated concentric jade-gold ripple rings just outside each icon cushion!
      if (sdf > -10.0 && sdf < 44.0) {
        float ringEnv = ss(-10.0, 6.0, sdf) * (1.0 - ss(18.0, 44.0, sdf));
        float ringWave = pow(max(0.0001, 0.5 + 0.5 * sin(sdf * 0.34 - uTime * 2.2)), 4.0);
        vec3 ringCol = moodMix(vec3(0.86, 0.96, 0.95), vec3(1.00, 0.78, 0.56), vec3(0.62, 0.86, 0.94), sunset, night);
        col += ringCol * ringEnv * ringWave * 0.22;
      }
    }
  }

  // =========================================================================
  // DYNAMIC SPIRIT LAYER: GREAT FISH KUN (+ REFLECTION), BEGONIA PETALS,
  // WATER RIPPLES & GLOWING FLOATING LOTUS WATER LANTERNS
  // =========================================================================
  vec2 screenUV = p / cssRes;
  vec4 spTex = texture(uSpiritTex, screenUV);
  if (spTex.a > 0.004) {
    // Spirit layer already paints rich luminous crimson/gold Kun, petals & warm lanterns;
    // gently harmonize ambient brightness with Day / Sunset / Night while keeping Kun & lanterns glowing!
    float isWarmGlow = ss(0.18, 0.45, spTex.r - spTex.b) * ss(0.50, 0.85, spTex.r);
    vec3 spDay = spTex.rgb;
    vec3 spSun = spTex.rgb * vec3(1.04, 0.90, 0.82);
    vec3 spNgt = mix(spTex.rgb * vec3(0.76, 0.88, 1.00), spTex.rgb * vec3(1.08, 0.94, 0.86), isWarmGlow);
    vec3 spCol = moodMix(spDay, spSun, spNgt, sunset, night);
    col = mix(col, spCol, spTex.a);
  }

  // =========================================================================
  // FOREGROUND SWAYING ANCIENT CRIMSON BEGONIA BOUGH (PINNED AT TOP-LEFT 0,0!)
  // =========================================================================
  if (uBranchReady > 0.5 && uBranchRect.z > 1.0) {
    vec2 bUV = (p - uBranchRect.xy) / uBranchRect.zw;
    if (bUV.x >= 0.0 && bUV.x <= 1.0 && bUV.y >= 0.0 && bUV.y <= 1.0) {
      // Smooth elastic wind sway pinned strictly at top-left anchor (0, 0) — ZERO detachment!
      float swayW = ss(0.06, 0.88, length(bUV));
      float windAmp = ss(0.0, 0.22, uWindSpeed) * clamp(0.32 + uWindSpeed * 0.68, 0.0, 1.65);
      float sway = (sin(wt * 1.45 - bUV.x * 2.8) * 0.011 + sin(wt * 2.95 + bUV.y * 4.5) * 0.0038) * swayW * windAmp;
      vec2 sbUV = bUV - vec2(sway * 0.65, sway * 1.15);
      if (sbUV.x >= 0.0 && sbUV.x <= 1.0 && sbUV.y >= 0.0 && sbUV.y <= 1.0) {
        vec4 br = texture(uBranchTex, sbUV);
        if (br.a > 0.005) {
          float isPetal = ss(0.14, 0.34, br.r - br.g) * ss(0.45, 0.78, br.r);
          vec3 brDay = br.rgb;
          vec3 brSun = mix(br.rgb * vec3(0.84, 0.66, 0.68), br.rgb * vec3(1.06, 0.88, 0.78), isPetal);
          vec3 brNgt = mix(
            br.rgb * vec3(0.34, 0.48, 0.64) * mix(0.72, 1.14, moonVis),
            br.rgb * vec3(0.82, 0.56, 0.64) * mix(0.78, 1.14, moonVis) + vec3(0.04, 0.01, 0.02),
            isPetal
          );
          // Delicate moonlit silver rim on branch blossoms facing Moon at (0.28, 0.18)!
          if (night > 0.02) {
            vec2 toM = normalize(moonPos - p);
            float rawBR = clamp(br.a - texture(uBranchTex, clamp(sbUV + toM * 0.005, 0.0, 1.0)).a, 0.0, 1.0);
            brNgt += vec3(0.55, 0.74, 0.92) * ss(0.22, 0.88, rawBR) * ss(0.65, 0.96, br.a) * 0.44 * moonVis;
          }
          vec3 brCol = moodMix(brDay, brSun, brNgt, sunset, night);
          col = mix(col, brCol, br.a);
        }
      }
    }
  }

  // Unified stationary East-Asian watercolor paper grain across ENTIRE canvas
  col *= 1.0 + (g1 - 0.5) * mix(0.036, 0.046, max(night, sunset * 0.5));

  // Photographic Filmic Highlight Rolloff (cool pearl-silver at Night, warm ivory at Day/Sunset)
  vec3 cSafe = max(col, vec3(0.0));
  float fLum = dot(cSafe, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = cSafe / (1.0 + max(0.0, fLum - 0.72) * 0.60);
  vec3 hiTarget = mix(vec3(1.00, 0.96, 0.90), vec3(0.95, 0.98, 1.00), night);
  mapped = mix(mapped, hiTarget, ss(0.76, 1.65, fLum) * 0.36);

  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}
`;
