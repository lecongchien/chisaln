/**
 * Sea Train Central-Aisle Cabin View ("Trong toa tàu" — Interactive 35mm Studio Ghibli WebGL2 Shader)
 * Living Story Beats, Rainy Train Glass, True 3-Layer 3D Mouse Parallax & Cinematic Film Lighting:
 *   1. True 3-Layer 3D Depth Parallax driven smoothly by global cursor position (uParallax):
 *      - Far exterior sky/sea/moon shifts opposite through the windows (true window-portal depth!)
 *      - Midground carriage & hand-inked straps shift smoothly together (100% pixel-locked!)
 *      - Foreground Chihiro & Towering No-Face shift deeper in front of the seats!
 *   2. Cinematic Story Beats outside the windows:
 *      - Periodic Passing Counter-Train (uPassProgress / uPassFlash) streaking past the left windows with
 *        motion-blurred warm glowing carriages, mirror ocean reflections, AND live warm amber light flashes
 *        sweeping across the carriage benches, floor runner, Chihiro & No-Face!
 *      - Delicate shooting stars streaking across the night window sky & subtle bioluminescent sea sparks!
 *      - Nostalgic vintage railway power-switch lamp dip (uLampDip).
 *   3. Realistic Wind-Streaked Raindrops on Train Glass (uShowRain):
 *      - Two-layer diagonal sliding raindrops angled by train speed + static clinging micro-beads,
 *        optical refraction of exterior light, warm tungsten lamp catchlights & cold perimeter glass mist!
 *   4. Deep Theatrical 35mm Studio Ghibli Lighting & 3D Volumetric Character Relighting.
 */
export const CABIN_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform sampler2D uCabinTex;
uniform sampler2D uNoFaceTex;
uniform sampler2D uLiveTex;
uniform sampler2D uCloudsTex;
uniform sampler2D uMoonTex;

uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uStep;
uniform float uDpr;
uniform float uMix;
uniform float uTime;
uniform float uWindTime;
uniform float uWorldScroll;
uniform float uAdaptive;
uniform float uSunset;
uniform float uNight;
uniform float uMoonPhase;
uniform float uShowNoFace;
uniform float uShowPoles;
uniform float uShowRain;
uniform float uCabinReady;
uniform float uNoFaceReady;
uniform float uCloudsReady;
uniform float uBobY;
uniform float uSwayX;
uniform float uPassProgress;
uniform float uPassFlash;
uniform float uLampDip;
uniform vec2 uParallax;
uniform float uSeed;

uniform vec4 uNoFaceRect;

out vec4 fragColor;

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

vec4 N(vec2 p, float scale) {
  return texture(uNoise, p / scale + uSeed * 0.017);
}

float fieldS(vec2 p) {
  vec2 uv = (p / uStep + 0.5) / uGrid;
  return mix(texture(uFA, uv).r, texture(uFB, uv).r, uMix);
}

// =============================================================================
// 0. TRUE 3D VOLUMETRIC AURORA BOREALIS CURTAINS (NIMITZ GEOMAGNETIC RAYMARCH)
//    Evaluated strictly on night window-glass sky & ocean reflection pixels!
// =============================================================================
float ignCabin(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float triA(float x) {
  return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
}

vec2 tri2A(vec2 p) {
  return vec2(triA(p.x + triA(p.y)), triA(p.y + triA(p.x)));
}

float cabinAuroraDensity(vec2 p, mat2 rotT) {
  float z = 1.8;
  float z2 = 2.5;
  float rz = 0.0;
  p *= mat2(0.2675, 0.9636, -0.9636, 0.2675);
  vec2 bp = p;
  const mat2 m2 = mat2(0.95534, 0.29552, -0.29552, 0.95534);
  for (int i = 0; i < 4; i++) {
    vec2 dg = rotT * (tri2A(bp * 1.85) * 0.75);
    p -= dg / z2;
    bp *= 1.30;
    z2 *= 0.45;
    z  *= 0.42;
    p  *= 1.21 + (rz - 1.0) * 0.02;
    rz += triA(p.x + triA(p.y)) * z;
    p = m2 * p;
  }
  return clamp(1.0 / pow(max(0.024, rz * 28.5), 1.30), 0.0, 0.62);
}

vec3 evalCabinAurora(vec2 sp, float viewAz, float skyT, float glareMask, float night, bool isDoor, bool isRefl) {
  if (night <= 0.02 || skyT > 0.985) return vec3(0.0);

  // Side windows span skyT 0.16..1.00; arched end-door glass sits at skyT 0.81..1.00 so map its local sky band cleanly!
  float doorLocal = clamp((skyT - 0.79) / 0.21, 0.0, 1.0);
  float horFade = isDoor
    ? (1.0 - ss(0.68, 0.96, doorLocal))
    : (1.0 - ss(0.76, 0.97, skyT));
  if (horFade <= 0.004) return vec3(0.0);

  // Match exterior SEATRAIN_AURORA_FS panoramic elevation so curtains form tall vertical dancing folds!
  float elev = isDoor ? mix(0.74, 0.08, doorLocal) : clamp(1.0 - skyT, 0.02, 1.0);
  vec3 rd = normalize(vec3(viewAz * (isDoor ? 2.5 : 1.16), elev * 0.56 + 0.045, 1.0));

  float tA = uTime * 0.56 + uWindTime * 0.24 + 12.2;
  float ang = tA * 0.055;
  float ca = cos(ang), sa = sin(ang);
  mat2 rotT = mat2(ca, sa, -sa, ca);

  float dither = ignCabin(gl_FragCoord.xy);
  const int STEPS = 16;
  const float FSTEPS = 16.0;
  const float STEP_SCALE = 50.0 / FSTEPS;
  vec2 driftOff = vec2(-0.14 - uWorldScroll * 0.038, 5.15 - tA * 0.018);
  float invRdY = 1.0 / (rd.y * 2.0 + 0.36);

  vec3 colAcc = vec3(0.0);
  vec3 avgCol = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float fi = float(i);
    float s = fi * STEP_SCALE;
    float frac = fi / FSTEPS;

    float of = 0.006 * dither * ss(0.0, 15.0, s);
    float pt = (0.78 + pow(max(0.0001, s), 1.40) * 0.0022) * invRdY - of;
    vec2 bpos = rd.xz * pt + driftOff;

    float rzt = cabinAuroraDensity(bpos, rotT);

    // Authentic polar emission spectrum: vivid emerald-green 557.7nm lower hem -> turquoise mid -> violet 630nm crown!
    vec3 cHem = vec3(0.36, 1.00, 0.28);
    vec3 cMid = vec3(0.08, 0.86, 0.62);
    vec3 cTop = vec3(0.62, 0.24, 0.90);
    vec3 bandC = mix(cHem, cMid, ss(0.06, 0.40, frac));
    bandC = mix(bandC, cTop, ss(0.48, 0.96, frac));

    vec3 curCol = bandC * rzt;
    avgCol = (i == 0) ? curCol : mix(avgCol, curCol, 0.50);
    colAcc += avgCol * exp(-s * 0.044) * STEP_SCALE * 0.082;
  }

  float iconBoost = 1.0;
  if (uAdaptive >= 0.5 && !isDoor && !isRefl) {
    float sVal = fieldS(sp);
    iconBoost = mix(0.95, 1.32, ss(240.0, -40.0, sVal));
  }

  float elevFade = clamp(rd.y * 4.2 - 0.08, 0.0, 1.0);
  vec3 rawA = max(vec3(0.0), colAcc * 3.85 * iconBoost - vec3(0.012, 0.016, 0.010));
  vec3 aurora = (vec3(1.0) - exp(-rawA * 1.65)) * 1.05;
  float doorScale = isDoor ? 1.02 : 1.0;
  float reflScale = isRefl ? 0.90 : 1.0;
  return aurora * elevFade * horFade * (0.58 + 0.42 * glareMask) * doorScale * reflScale * night;
}

// =============================================================================
// 1. PAINTERLY EXTERIOR SKY, STYLIZED GHIBLI MOON, ORGANIC STARS, METEORS & CLOUDS
// =============================================================================
vec3 evalAisleSky(vec2 sp, vec2 cssRes, float horizonY, float wt, float sunset, float night, bool isDoor, bool isRefl) {
  float skyTopY = cssRes.y * 0.15;
  float skyT = clamp((sp.y - skyTopY) / max(1.0, horizonY - skyTopY), 0.0, 1.0);
  float nx = sp.x / max(1.0, cssRes.x);
  float viewAz = atan((nx - 0.5) * 1.65, 1.0);

  vec3 topDay = vec3(0.175, 0.545, 0.875);
  vec3 midDay = vec3(0.455, 0.755, 0.945);
  vec3 botDay = vec3(0.810, 0.930, 0.975);

  vec3 topSun = vec3(0.195, 0.315, 0.615);
  vec3 midSun = vec3(0.555, 0.425, 0.610);
  vec3 botSun = vec3(0.955, 0.625, 0.435);

  vec3 topNgt = vec3(0.009, 0.022, 0.068);
  vec3 midNgt = vec3(0.022, 0.054, 0.138);
  vec3 botNgt = vec3(0.064, 0.122, 0.236);

  vec3 cTop = moodMix(topDay, topSun, topNgt, sunset, night);
  vec3 cMid = moodMix(midDay, midSun, midNgt, sunset, night);
  vec3 cBot = moodMix(botDay, botSun, botNgt, sunset, night);

  vec3 col = mix(cTop, cMid, ss(0.0, 0.56, skyT));
  col = mix(col, cBot, ss(0.44, 1.0, skyT));

  // Rainy atmospheric veil deepens exterior sky slightly for cozy indoor warmth
  if (uShowRain > 0.5) {
    vec3 rainSky = moodMix(vec3(0.36, 0.50, 0.64), vec3(0.36, 0.30, 0.44), vec3(0.014, 0.032, 0.082), sunset, night);
    col = mix(col, rainSky, mix(0.24, 0.18, night));
  }

  float leftSunBias = exp(-sq((nx - 0.10) / 0.36));
  if (sunset > 0.01) {
    float horBand = exp(-sq((skyT - 0.92) / 0.28));
    col += vec3(0.66, 0.34, 0.16) * horBand * (0.28 + 0.42 * leftSunBias) * sunset;
  } else if (night < 0.5) {
    col += vec3(0.14, 0.14, 0.09) * exp(-sq((skyT - 0.88) / 0.34)) * leftSunBias * (1.0 - night);
  }

  vec2 moonPos = vec2(cssRes.x * 0.068, cssRes.y * 0.278);
  float mRad = clamp(min(cssRes.x, cssRes.y) * 0.030, 12.0, 26.0);
  float dMoon = length(sp - moonPos);
  vec3 auroraGlow = vec3(0.0);

  if (night > 0.02) {
    if (!isDoor) {
      float skyScat = exp(-dMoon / (max(cssRes.x, cssRes.y) * 0.34));
      col += vec3(0.068, 0.124, 0.238) * skyScat * 0.42 * night;
    }

    float glareMask = isDoor ? 1.0 : ss(mRad * 1.7, mRad * 5.8, dMoon);
    float horExtinct = 1.0 - ss(0.52, 0.96, skyT) * 0.72;
    float rainDim = uShowRain > 0.5 ? 0.72 : 1.0;

    // Layer A: sparse pinpoint hero stars with warm/cool blackbody tints
    vec2 sC1 = floor(sp / 26.0);
    vec2 sU1 = fract(sp / 26.0) - 0.5;
    float sh1 = hash2(sC1 + 19.3);
    if (sh1 > 0.76) {
      vec2 so = (vec2(hash2(sC1 + 5.7), hash2(sC1 + 41.2)) - 0.5) * 0.68;
      float sd = length(sU1 - so);
      float sRad = mix(0.028, 0.064, fract(sh1 * 17.3));
      float tw = 0.64 + 0.36 * sin(uTime * (1.4 + sh1 * 2.1) + sh1 * 52.0);
      float sb = exp(-sq(sd / sRad)) * tw * horExtinct * glareMask * night * rainDim;
      float temp = fract(sh1 * 31.7);
      vec3 sTint = mix(vec3(1.00, 0.90, 0.76), vec3(0.76, 0.88, 1.00), temp);
      col += sTint * sb * (isRefl ? 0.48 : 0.78);
    }

    // Layer B: faint micro-star dust
    vec2 sC2 = floor((sp + vec2(11.3, 7.1)) / 13.0);
    vec2 sU2 = fract((sp + vec2(11.3, 7.1)) / 13.0) - 0.5;
    float sh2 = hash2(sC2 + 73.1);
    if (sh2 > 0.80) {
      vec2 so2 = (vec2(hash2(sC2 + 13.4), hash2(sC2 + 29.8)) - 0.5) * 0.62;
      float sd2 = length(sU2 - so2);
      float tw2 = 0.70 + 0.30 * sin(uTime * 1.1 + sh2 * 64.0);
      float sb2 = exp(-sq(sd2 / 0.036)) * tw2 * horExtinct * glareMask * night * rainDim;
      col += vec3(0.78, 0.86, 0.98) * sb2 * (isRefl ? 0.22 : 0.34);
    }

    // Periodic delicate Shooting Star streaking across the night window sky (~every 12.5s!)
    if (!isDoor && skyT < 0.78) {
      float mPeriod = 12.5;
      float mCycle = floor((uTime + 4.2) / mPeriod);
      float mLocal = fract((uTime + 4.2) / mPeriod);
      if (mLocal < 0.095) {
        float mT = mLocal / 0.095; // 0..1 over ~1.18s
        float onRight = step(0.45, hash2(vec2(mCycle, 7.3)));
        vec2 mStart = onRight > 0.5
          ? vec2(cssRes.x * 0.955, cssRes.y * (0.215 + 0.07 * hash2(vec2(mCycle, 2.1))))
          : vec2(cssRes.x * 0.225, cssRes.y * (0.230 + 0.06 * hash2(vec2(mCycle, 5.4))));
        vec2 mDir = normalize(onRight > 0.5 ? vec2(-1.0, 0.44) : vec2(-0.88, 0.48));
        float mDist = cssRes.x * 0.145;
        vec2 mHead = mStart + mDir * (mDist * mT);
        vec2 relM = sp - mHead;
        float along = dot(relM, -mDir);
        float perp = abs(relM.x * mDir.y - relM.y * mDir.x);
        float tailLen = cssRes.x * 0.055 * sin(mT * 3.14159);
        if (along > -3.0 && along < tailLen && perp < 6.0) {
          float fadeTail = exp(-max(0.0, along) / max(4.0, tailLen * 0.38)) * ss(-2.5, 1.0, along);
          float core = exp(-sq(perp / 1.35)) * fadeTail * sin(mT * 3.14159);
          float headGlow = exp(-sq(length(relM) / 3.4)) * sin(mT * 3.14159);
          col += (vec3(0.95, 0.98, 1.00) * core + vec3(1.00, 0.94, 0.78) * headGlow * 0.85) * night * (isRefl ? 0.55 : 0.92);
        }
      }
    }

    // True 3D Volumetric Polar Aurora Borealis curtains visible through left, right & end-door night windows!
    auroraGlow = evalCabinAurora(sp, viewAz, skyT, glareMask, night, isDoor, isRefl);
    col += auroraGlow;

    // Stylized Studio Ghibli Gouache Moon (keeps exact birth-date 3D phase & real Maria layout)
    if (!isDoor && nx < 0.36) {
      float moonTheta = uMoonPhase * 6.2831853;
      float moonIllum = 0.5 - 0.5 * cos(moonTheta);
      float phaseGlow = mix(0.18, 1.0, pow(max(0.0001, moonIllum), 0.65));
      vec2 mLocal = (sp - moonPos) / max(1.0, mRad);
      float rN = length(mLocal);
      vec2 rotM = vec2(mLocal.x * 0.97 + mLocal.y * 0.24, -mLocal.x * 0.24 + mLocal.y * 0.97);
      float lx = sin(moonTheta);
      float lz = -cos(moonTheta);
      float dOuter = dMoon - mRad;
      float disc = ss(1.6, -1.2, dOuter);

      float limbDir = mix(clamp(0.55 + 0.45 * (rotM.x / max(0.25, rN)) * lx, 0.18, 1.0), 1.0, moonIllum);
      vec3 skyBeforeMoon = col;
      float limbBloom = exp(-max(dOuter, 0.0) / (mRad * 0.34)) * 0.32 * phaseGlow;
      float aureole   = exp(-max(dOuter, 0.0) / (mRad * 1.65)) * 0.42 * phaseGlow * limbDir;
      float corona    = exp(-max(dOuter, 0.0) / (mRad * 5.20)) * 0.24 * phaseGlow;
      col += vec3(1.00, 0.95, 0.82) * limbBloom * 0.46 * night;
      col += vec3(0.84, 0.90, 0.96) * aureole   * 0.38 * night;
      col += vec3(0.38, 0.58, 0.88) * corona    * 0.56 * night;

      if (disc > 0.002) {
        float rClamped = min(1.0, rN);
        float z3 = sqrt(max(0.0, 1.0 - rClamped * rClamped));
        vec2 mUV = clamp(rotM * 0.480 + 0.5, 0.005, 0.995);
        vec4 mTex = texture(uMoonTex, mUV);
        float h0 = mTex.a;
        float hx = texture(uMoonTex, clamp(mUV + vec2(0.006, 0.0), 0.005, 0.995)).a;
        float ndotlSmooth = rotM.x * lx + z3 * lz;
        float litPhase = ss(-0.07, 0.19, ndotlSmooth + (h0 - 0.5) * 0.032);
        float termBand = exp(-sq((ndotlSmooth - 0.14) / 0.34)) * litPhase;
        float relief = clamp(1.0 + (h0 - hx) * lx * 2.1 * termBand, 0.90, 1.10);
        float mariaLum = dot(mTex.rgb, vec3(0.299, 0.587, 0.114));
        vec3 ghibliMoon = mix(vec3(0.68, 0.69, 0.72), vec3(0.99, 0.96, 0.86), ss(0.26, 0.82, mariaLum));
        float limbSoft = 0.91 + 0.09 * pow(max(0.0001, z3), 0.22);
        vec3 moonLitCol = ghibliMoon * limbSoft * relief;
        vec3 earthshine = skyBeforeMoon * 0.92 + vec3(0.032, 0.054, 0.098);
        col = mix(col, mix(earthshine, moonLitCol, litPhase), disc * night * 0.96);
      }
    }
  }

  // Hand-Painted Seamless Studio Ghibli Cumulus Panorama mapped via cylindrical azimuth
  if (uCloudsReady > 0.5 && skyT >= 0.22) {
    float cV = clamp((skyT - 0.22) / 0.79, 0.0, 1.0);
    float sideSign = (nx < 0.5) ? -1.0 : 1.0;
    float cU = isDoor
      ? (viewAz * 0.85 + 0.25 + wt * 0.0022)
      : (viewAz * 0.72 + sideSign * (uWorldScroll * 0.024 + wt * 0.0025) + (nx > 0.5 ? 0.44 : 0.12));
    vec4 cTex = texture(uCloudsTex, vec2(cU, cV));
    if (cTex.a > 0.004) {
      vec3 c = cTex.rgb;
      float maxRB = max(c.r, c.b);
      c.g = min(c.g, mix(maxRB * 1.01, maxRB * 0.96, 1.0 - cTex.a));
      float lum = dot(c, vec3(0.299, 0.587, 0.114));

      vec3 colDay = mix(vec3(0.56, 0.70, 0.86), vec3(1.00, 1.00, 0.98), ss(0.24, 0.88, lum));
      vec3 colSun = c * vec3(1.04, 0.98, 0.95) + vec3(0.06, 0.030, 0.006) * ss(0.66, 0.92, lum);
      float moonReach = exp(-dMoon / (max(cssRes.x, cssRes.y) * 0.52));
      vec3 colNgt = mix(vec3(0.028, 0.052, 0.118), vec3(0.145, 0.225, 0.375), ss(0.28, 0.88, lum) * (0.36 + 0.64 * moonReach));
      // Subtle emerald-teal aurora backlighting on thin cloud rims so clouds sit physically inside the Northern Lights!
      if (night > 0.02) {
        float thinCloudRim = cTex.a * (1.0 - cTex.a) * 4.0;
        colNgt += auroraGlow * (0.08 + 0.34 * thinCloudRim);
      }
      vec3 cGraded = moodMix(colDay, colSun, colNgt, sunset, night);
      cGraded = mix(cGraded, cBot, ss(0.72, 1.0, skyT) * 0.44);
      float cA = cTex.a * ss(0.22, 0.28, skyT) * (1.0 - ss(0.92, 1.0, skyT) * 0.26);
      col = mix(col, cGraded, clamp(cA * (isDoor ? 0.58 : 0.88), 0.0, 0.92));
    }
  }

  // Occasional tiny distant horizon silhouette islet
  if (!isDoor && skyT > 0.86 && skyT <= 1.0) {
    float sideSign = (nx < 0.5) ? -1.0 : 1.0;
    float islPhase = fract(viewAz * 0.55 + sideSign * uWorldScroll * 0.035 + 0.37);
    float dIsl = abs(islPhase - 0.52);
    if (dIsl < 0.055) {
      float moundH = 0.046 * cos((dIsl / 0.055) * 1.5707);
      float above = 1.0 - skyT;
      if (above < moundH) {
        float edgeS = ss(moundH, moundH - 0.012, above);
        vec3 islCol = moodMix(vec3(0.46, 0.64, 0.66), vec3(0.46, 0.36, 0.42), vec3(0.036, 0.068, 0.135), sunset, night);
        col = mix(col, islCol, edgeS * 0.68);
      }
    }
  }

  float seamG = exp(-sq((1.0 - skyT) / 0.085));
  vec3 seamC = moodMix(vec3(0.88, 0.96, 1.00), vec3(0.94, 0.68, 0.50), vec3(0.092, 0.168, 0.305), sunset, night);
  col = mix(col, seamC, seamG * mix(0.28, 0.36, sunset) * (1.0 - night * 0.28));
  return col;
}

// =============================================================================
// 2. TRUE 3D FORWARD-TRAVELING COASTAL UTILITY POLES & CATENARY WIRES
// =============================================================================
vec4 evalPerspectivePoles(vec2 sp, vec2 cssRes, float horizonY, float perspZ, float sideDepth, float sunset, float night, bool isRefl) {
  if (uShowPoles < 0.5) return vec4(0.0);

  float spacing = 2.65;
  float zWorld = perspZ + uWorldScroll * 2.15;
  float cellPos = fract(zWorld / spacing);
  float relCell = cellPos - 0.5;

  float motionBlur = mix(0.008, 0.024, sideDepth);
  float poleHalfRel = 0.015 + 0.008 * sideDepth;
  float poleM = ss(poleHalfRel + motionBlur, poleHalfRel * 0.35, abs(relCell));

  float poleTopY = mix(cssRes.y * 0.345, cssRes.y * 0.165, sideDepth);
  float crossY   = mix(cssRes.y * 0.368, cssRes.y * 0.228, sideDepth);
  float inPoleH  = ss(poleTopY - 4.0, poleTopY + 3.0, sp.y) * (1.0 - ss(horizonY - 1.0, horizonY + 3.0, sp.y));
  poleM *= inPoleH;

  float crossHalfRel = poleHalfRel * 3.8;
  float crossThick = mix(1.4, 3.6, sideDepth);
  float crossM = ss(crossHalfRel + motionBlur, crossHalfRel * 0.55, abs(relCell))
               * ss(crossThick + 1.0, crossThick * 0.35, abs(sp.y - crossY));

  float insDist = abs(abs(relCell) - crossHalfRel * 0.72);
  float insM = ss(poleHalfRel * 0.85, poleHalfRel * 0.25, insDist)
             * ss(crossThick * 1.4, crossThick * 0.3, abs(sp.y - (crossY - crossThick * 1.1)));

  float uSpan = fract(cellPos + 0.5);
  float sag = 4.0 * uSpan * (1.0 - uSpan);
  float wire1Y = crossY + mix(2.0, 5.0, sideDepth) + sag * mix(5.0, 26.0, sideDepth);
  float wire2Y = crossY + mix(6.5, 18.0, sideDepth) + sag * mix(7.0, 34.0, sideDepth);
  float wThick = mix(0.75, 1.30, sideDepth);
  float w1 = ss(wThick + 0.65, wThick * 0.25, abs(sp.y - wire1Y)) * 0.44;
  float w2 = ss(wThick + 0.55, wThick * 0.25, abs(sp.y - wire2Y)) * 0.34;

  float mask = max(max(poleM, max(crossM, insM)), max(w1, w2));
  if (mask <= 0.004) return vec4(0.0);

  float distFade = mix(0.45, 0.92, sideDepth) * (isRefl ? 0.62 : 1.0);
  float rimEdge = ss(0.0, -poleHalfRel, relCell) * poleM;
  vec3 poleBase = moodMix(vec3(0.24, 0.25, 0.30), vec3(0.22, 0.14, 0.18), vec3(0.012, 0.022, 0.048), sunset, night);
  vec3 poleLit  = moodMix(vec3(0.56, 0.54, 0.52), vec3(0.76, 0.48, 0.34), vec3(0.22, 0.34, 0.56), sunset, night);
  vec3 pCol = mix(poleBase, poleLit, rimEdge * mix(0.30, 0.26, night));
  pCol = mix(pCol, moodMix(vec3(0.92, 0.95, 0.98), vec3(0.96, 0.80, 0.66), vec3(0.36, 0.48, 0.68), sunset, night), insM * 0.65);
  return vec4(pCol, clamp(mask * distFade, 0.0, 0.92));
}

// =============================================================================
// 3. PASSING COUNTER-TRAIN STREAKING OUTSIDE THE LEFT WINDOWS (STORY BEAT!)
// =============================================================================
vec4 evalPassingCounterTrain(vec2 sp, vec2 cssRes, float horizonY, float sideDepth, float sunset, float night, bool isRefl) {
  if (uPassProgress <= 0.001 || uPassProgress >= 0.999) return vec4(0.0);
  float nx = sp.x / max(1.0, cssRes.x);
  if (nx >= 0.44) return vec4(0.0);

  // Train sweeps smoothly from far left window (nx ~ 0.38) rushing outward past foreground (nx ~ 0.0)!
  float trainLen = 1.15;
  float noseX = mix(0.42, -trainLen - 0.12, uPassProgress);
  float tailX = noseX + trainLen;
  float inX = ss(noseX - 0.04, noseX + 0.015, nx) * (1.0 - ss(tailX - 0.03, tailX + 0.03, nx));
  if (inX <= 0.002) return vec4(0.0);

  // Perspective height of passing train scales with sideDepth!
  float trH = mix(cssRes.y * 0.065, cssRes.y * 0.185, sideDepth);
  float yFromWater = horizonY - sp.y;
  float v = yFromWater / max(1.0, trH); // 0 = waterline, 1 = roof
  if (v < -0.02 || v > 1.06) return vec4(0.0);

  float bodyM = ss(-0.01, 0.04, v) * (1.0 - ss(0.92, 1.02, v)) * inX;
  // Motion-blurred warm glowing carriage windows streaking past (5 cars separated by dark coupler gaps!)
  float carCoord = ((nx - noseX) / max(0.01, trainLen)) * 5.0;
  float carU = fract(carCoord);
  float inCar = ss(0.04, 0.10, carU) * (1.0 - ss(0.90, 0.96, carU));
  float winBand = ss(0.32, 0.42, v) * (1.0 - ss(0.70, 0.80, v));
  // Kinetic horizontal motion blur turns individual window panes into silky glowing amber streaks!
  float paneStreak = 0.65 + 0.35 * sin(carU * 31.4159);
  float winGlow = winBand * inCar * paneStreak * bodyM;

  // Bow headlight flash at the leading nose
  float headDist = length(vec2((nx - noseX) * 5.5, (v - 0.72) * 1.4));
  float headFlash = exp(-sq(headDist / 0.18)) * (1.0 - ss(0.75, 1.0, uPassProgress));

  vec3 hullCol = moodMix(vec3(0.28, 0.16, 0.16), vec3(0.20, 0.11, 0.14), vec3(0.032, 0.026, 0.044), sunset, night);
  vec3 winCol  = moodMix(vec3(0.92, 0.84, 0.66), vec3(1.06, 0.78, 0.42), vec3(1.18, 0.82, 0.38), sunset, night);
  vec3 col = mix(hullCol, winCol, winGlow * (0.58 + 0.42 * max(sunset, night)));
  col += vec3(1.15, 0.96, 0.72) * headFlash * (0.45 + 0.55 * night);

  float alpha = clamp(max(bodyM * (isRefl ? 0.56 : 0.88), headFlash * 0.65), 0.0, 0.92);
  return vec4(col, alpha);
}

// =============================================================================
// 4. CRISP ISOTROPIC WIND-SWEPT RAINDROPS ON TRAIN GLASS (ZERO GREY DONUTS!)
//    Returns vec4(refractX, refractY, brightGlint, bottomMeniscusShade)
// =============================================================================
vec4 evalRainLayer(vec2 rg, float cols, float rows, float speed, float seed) {
  vec2 uv = vec2(rg.x * cols, rg.y * rows);
  vec2 cell = floor(uv);
  vec2 f = fract(uv);
  float h1 = hash2(cell + seed);
  float h2 = hash2(cell + seed + 37.2);
  if (h1 < 0.56) return vec4(0.0);

  // Delicate droplet glides smoothly downward along rotated glass axis with subtle organic wobble
  float tSlide = fract(uTime * speed * (0.55 + 0.45 * h2) + h1 * 11.0);
  float dropY = tSlide;
  float dropX = 0.24 + 0.52 * h2 + sin(dropY * 12.0 + h1 * 19.0) * 0.06;

  // True 1:1 isotropic circle metric (aspect = cols / rows so drops stay crisp tiny water beads, NEVER stretched ovals!)
  float aspect = cols / max(1.0, rows);
  vec2 d = vec2(f.x - dropX, (f.y - dropY) * aspect);
  float dist = length(d);
  float rad = 0.13 + 0.06 * h1; // ~3.5-5.5px crisp anime rain bead!
  float lifeEnv = sin(tSlide * 3.14159);
  float drop = ss(rad, rad * 0.35, dist) * lifeEnv;

  // Razor-thin micro-beads clinging along the vertical wet path behind the sliding droplet
  float behindY = dropY - f.y;
  float trailDx = abs(f.x - dropX - sin(f.y * 12.0 + h1 * 19.0) * 0.035);
  float trailMask = ss(0.0, 0.05, behindY) * (1.0 - ss(0.14, 0.55, behindY)) * lifeEnv;
  float beadY = fract(f.y * 7.0 + h2 * 3.0) - 0.5;
  float microBead = ss(0.055, 0.015, length(vec2(trailDx * 1.4, beadY * 0.24))) * trailMask;

  // Convex water-lens refraction (strictly inside droplet)
  vec2 refr = (drop > 0.01) ? (d / max(0.02, rad)) * drop : vec2(0.0);

  // Pinpoint upper-left specular sparkle + tiny hairline lower-rim meniscus (NO hollow grey donut ring!)
  float hiSpot = exp(-sq(length(d - vec2(-rad * 0.28, -rad * 0.30)) / max(0.015, rad * 0.34))) * drop;
  float glint = clamp(hiSpot * 1.15 + microBead * 0.52, 0.0, 1.0);
  float botShade = ss(0.18, 0.88, d.y / max(0.02, rad)) * drop * 0.65;
  return vec4(refr.x, refr.y, glint, botShade);
}

vec4 evalWindowRain(vec2 sp, vec2 cssRes, float nx, float ny, bool isDoor) {
  if (uShowRain < 0.5) return vec4(0.0);
  float sideSign = (nx < 0.5) ? -1.0 : 1.0;
  // Rigid 2D rotation preserves 100% true circularity of every water bead while angling streaks backward!
  float ang = isDoor ? 0.0 : (sideSign * 0.30);
  float ca = cos(ang), sa = sin(ang);
  vec2 g = sp / max(1.0, cssRes.y);
  vec2 rg = vec2(g.x * ca - g.y * sa, g.x * sa + g.y * ca);

  vec4 L1 = evalRainLayer(rg, 36.0, 16.0, 0.26, 11.3);
  vec4 L2 = evalRainLayer(rg + vec2(0.37, 0.19), 54.0, 24.0, 0.17, 47.9);

  // Delicate tiny static clinging micro-drops scattered sparsely on the glass
  vec2 mCell = floor(g * 74.0);
  vec2 mF = fract(g * 74.0) - 0.5;
  float mh = hash2(mCell + 83.1);
  float staticSpark = 0.0;
  if (mh > 0.90) {
    vec2 mo = (vec2(hash2(mCell + 1.9), hash2(mCell + 9.4)) - 0.5) * 0.52;
    staticSpark = ss(0.16, 0.04, length(mF - mo)) * 0.32;
  }

  vec2 refr = L1.xy * 5.2 + L2.xy * 3.0;
  float glint = clamp(L1.z * 0.88 + L2.z * 0.60 + staticSpark, 0.0, 1.0);
  float botShade = clamp(L1.w * 0.85 + L2.w * 0.55, 0.0, 1.0);
  return vec4(refr.x, refr.y, glint, botShade);
}

// =============================================================================
// 5. SUBTLE LIVING SPIRIT PASSENGER SWAY MASK
// =============================================================================
vec2 evalPassengerSwayOffset(vec2 uv, float t) {
  float mLeft = ss(0.17, 0.21, uv.x) * (1.0 - ss(0.33, 0.37, uv.x))
              * ss(0.41, 0.47, uv.y) * (1.0 - ss(0.72, 0.80, uv.y));
  float mStand = ss(0.53, 0.56, uv.x) * (1.0 - ss(0.62, 0.65, uv.x))
               * ss(0.34, 0.40, uv.y) * (1.0 - ss(0.65, 0.72, uv.y));
  float mRight = ss(0.61, 0.64, uv.x) * (1.0 - ss(0.74, 0.77, uv.x))
               * ss(0.44, 0.50, uv.y) * (1.0 - ss(0.69, 0.77, uv.y));

  float leverL = clamp((0.76 - uv.y) / 0.34, 0.0, 1.0);
  float leverS = clamp((0.71 - uv.y) / 0.36, 0.0, 1.0);
  float leverR = clamp((0.74 - uv.y) / 0.30, 0.0, 1.0);

  float dxL = sin(t * 1.12 + 0.4) * 0.0014 * leverL * mLeft;
  float dyL = sin(t * 1.55 + 1.1) * 0.0008 * leverL * mLeft;
  float dxS = sin(t * 0.96 + 1.9) * 0.0018 * leverS * mStand;
  float dyS = sin(t * 1.38 + 0.2) * 0.0009 * leverS * mStand;
  float dxR = sin(t * 1.08 + 2.7) * 0.0014 * leverR * mRight;
  float dyR = sin(t * 1.48 + 2.0) * 0.0008 * leverR * mRight;

  return vec2(dxL + dxS + dxR, dyL + dyS + dyR);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 cssRes = max(vec2(1.0), uRes / uDpr);
  float wt = uWindTime;
  float sunset = clamp(uSunset, 0.0, 1.0);
  float night  = clamp(uNight,  0.0, 1.0);
  float dayAmt = max(0.0, 1.0 - sunset - night);
  vec2 par = clamp(uParallax, vec2(-1.0), vec2(1.0));

  vec2 gp = floor(p * (0.90 * max(uDpr, 1.0)));
  float g1 = hash2(gp + 0.5);
  float g2 = hash2(gp + vec2(37.1, 19.7));
  float filmNoise = (g1 + g2 - 1.0);

  // TRUE 3-LAYER 3D PARALLAX:
  // Midground carriage zooms subtly (1.028x) so mouse parallax NEVER exposes black edges,
  // and uCabinTex + uLiveTex share cabUV 100% identically so straps & Soot Sprites stay pixel-locked!
  vec2 centerP = cssRes * 0.5;
  vec2 cabP = (p - centerP) / 1.028 + centerP - vec2(uSwayX, uBobY) - par * vec2(8.5, 4.5);
  vec2 cabUV = clamp(cabP / cssRes, 0.0, 1.0);
  float asp = cssRes.x / max(1.0, cssRes.y);

  // Overhead brass dome lamp distance fields
  float dL0 = length((cabUV - vec2(0.500, 0.012)) * vec2(asp, 1.0));
  float dL1 = length((cabUV - vec2(0.500, 0.114)) * vec2(asp, 1.0));
  float dL2 = length((cabUV - vec2(0.500, 0.189)) * vec2(asp, 1.0));
  float dL3 = length((cabUV - vec2(0.500, 0.242)) * vec2(asp, 1.0));
  float lampFlick = (0.982 + 0.018 * sin(uTime * 2.4 + sin(uTime * 5.9) * 0.35)) * clamp(uLampDip, 0.45, 1.0);

  // Single crisp sample for dark shadow passengers (ZERO blurry 50/50 ghost double-edge on hats/shoulders!)
  vec4 cabRaw = uCabinReady > 0.5 ? texture(uCabinTex, cabUV) : vec4(0.24, 0.18, 0.14, 1.0);
  vec4 cab = cabRaw;
  float shadowPassengerMask = 0.0;
  if (uCabinReady > 0.5 && cabRaw.a > 0.95) {
    float rawLum = dot(cabRaw.rgb, vec3(0.299, 0.587, 0.114));
    float isShadowRider = (1.0 - ss(0.16, 0.34, rawLum)) * (1.0 - ss(0.14, 0.28, cabRaw.r - cabRaw.b));
    if (isShadowRider > 0.05) {
      vec2 passOff = evalPassengerSwayOffset(cabUV, uTime) * 0.55;
      vec4 cabSway = texture(uCabinTex, clamp(cabUV - passOff, 0.0, 1.0));
      float swayLum = dot(cabSway.rgb, vec3(0.299, 0.587, 0.114));
      if (cabSway.a > 0.95 && swayLum < 0.36) {
        cab = cabSway;
      }
      shadowPassengerMask = isShadowRider;
    }
  }

  vec3 col = vec3(0.0);

  // =========================================================================
  // 1. EXTERIOR SEA WORLD (FAR PARALLAX LAYER) + PASSING TRAIN + RAIN GLASS
  // =========================================================================
  if (cab.a < 0.995) {
    // Far exterior shifts OPPOSITE to cabin parallax -> true 3D window-portal depth!
    vec2 extBaseP = p + par * vec2(11.0, 5.5);
    float nx = extBaseP.x / max(1.0, cssRes.x);
    float ny = extBaseP.y / max(1.0, cssRes.y);
    bool isDoor = (cabUV.x > 0.45 && cabUV.x < 0.55);
    float sideDepth = clamp((abs(cabUV.x - 0.5) - 0.11) / 0.39, 0.0, 1.0);
    float perspZ = 1.65 / max(0.14, abs(cabUV.x - 0.5));
    float horizonY = cssRes.y * 0.452 + par.y * 5.5;

    // Evaluate window-pane wind-streaked raindrops (locked to glass cabP!) BEFORE exterior sampling for real refraction!
    vec4 rain = evalWindowRain(cabP, cssRes, cabUV.x, cabUV.y, isDoor);
    vec2 extP = extBaseP + rain.xy;

    vec3 extCol;
    if (extP.y < horizonY) {
      extCol = evalAisleSky(extP, cssRes, horizonY, wt, sunset, night, isDoor, false);
      if (!isDoor) {
        vec4 pole = evalPerspectivePoles(extP, cssRes, horizonY, perspZ, sideDepth, sunset, night, false);
        if (pole.a > 0.004) extCol = mix(extCol, pole.rgb, pole.a);

        // Passing Counter-Train streaking outside the LEFT windows!
        vec4 passT = evalPassingCounterTrain(extP, cssRes, horizonY, sideDepth, sunset, night, false);
        if (passT.a > 0.004) extCol = mix(extCol, passT.rgb, passT.a);
      }
    } else {
      float depthPx = extP.y - horizonY;
      float waterD = clamp(depthPx / max(1.0, cssRes.y * 0.145), 0.0, 1.0);
      float zSea = 1.0 / (waterD + 0.065);
      float logZ = log(max(1.0, zSea));

      vec2 rUV1 = isDoor
        ? vec2((nx - 0.5) * zSea * 18.0, logZ * 32.0 + uWorldScroll * 28.0)
        : vec2(perspZ * 26.0 + uWorldScroll * 135.0, logZ * 28.0 - uTime * 0.85);
      float n1 = N(rUV1, 160.0).r - 0.5;
      float n2 = N(rUV1 * 1.9 + vec2(37.0, 19.0), 96.0).g - 0.5;
      float rainWave = uShowRain > 0.5 ? (sin(rUV1.x * 1.6 + uTime * 5.5) * cos(rUV1.y * 2.1 - uTime * 4.2) * 0.45) : 0.0;
      float ripX = (n1 * 5.8 + n2 * 2.4 + rainWave) * (0.20 + 0.80 * waterD);
      float ripY = (n2 * 1.8) * pow(waterD, 0.75);

      vec2 refP = vec2(extP.x + ripX, max(cssRes.y * 0.16, horizonY - depthPx * 1.05 + ripY));
      vec3 skyRefl = evalAisleSky(refP, cssRes, horizonY, wt, sunset, night, isDoor, true);
      if (!isDoor) {
        vec4 poleRefl = evalPerspectivePoles(refP, cssRes, horizonY, perspZ, sideDepth, sunset, night, true);
        if (poleRefl.a > 0.004) skyRefl = mix(skyRefl, poleRefl.rgb * 0.82, poleRefl.a * mix(0.75, 0.42, waterD));

        vec4 passRefl = evalPassingCounterTrain(refP, cssRes, horizonY, sideDepth, sunset, night, true);
        if (passRefl.a > 0.004) skyRefl = mix(skyRefl, passRefl.rgb * 0.92, passRefl.a * mix(0.82, 0.48, waterD));
      }

      vec3 waterTint = moodMix(vec3(0.13, 0.52, 0.79), vec3(0.42, 0.32, 0.50), vec3(0.014, 0.044, 0.108), sunset, night);
      float fres = mix(0.16, 0.58, pow(max(0.0001, waterD), 0.78));
      extCol = mix(skyRefl, waterTint, fres);

      float horMist = exp(-waterD / 0.11);
      vec3 horMistC = moodMix(vec3(0.84, 0.94, 0.98), vec3(0.86, 0.60, 0.48), vec3(0.068, 0.128, 0.242), sunset, night);
      extCol = mix(extCol, horMistC, horMist * 0.34);

      if (!isDoor) {
        float gRow = floor(logZ * 6.5);
        float gX = perspZ * 4.5 + uWorldScroll * 11.5;
        vec2 gCell = vec2(floor(gX), gRow);
        vec2 gUv = vec2(fract(gX), fract(logZ * 6.5));
        float gh = hash2(gCell + 23.7);
        if (gh > 0.75) {
          float sDx = abs(gUv.x - 0.5) / (0.18 + 0.22 * hash2(gCell + 9.1));
          float sDy = abs(gUv.y - 0.5) / 0.12;
          float streak = (1.0 - ss(0.35, 1.0, sDx)) * (1.0 - ss(0.25, 1.0, sDy)) * ss(0.05, 0.24, waterD);
          vec3 sCol = moodMix(vec3(0.94, 0.99, 1.00), vec3(1.00, 0.80, 0.60), vec3(0.46, 0.64, 0.88), sunset, night);
          extCol = mix(extCol, sCol, streak * mix(0.32, 0.22, night));
        }

        // Foreground train-side wake foam + subtle Night bioluminescent sea plankton sparks!
        float nearHull = ss(0.64, 1.0, waterD) * ss(0.25, 0.92, sideDepth);
        float wakeN = N(vec2(perspZ * 38.0 + uWorldScroll * 210.0, waterD * 42.0), 78.0).g;
        float wakeFoam = nearHull * ss(0.48, 0.88, wakeN) * mix(0.40, 0.22, night);
        vec3 foamC = moodMix(vec3(0.95, 0.99, 1.00), vec3(0.98, 0.84, 0.70), vec3(0.26, 0.40, 0.62), sunset, night);
        extCol = mix(extCol, foamC, wakeFoam);

        if (night > 0.25 && nearHull > 0.05) {
          float bioCell = hash2(floor(vec2(perspZ * 12.0 + uWorldScroll * 48.0, waterD * 18.0)) + 51.3);
          float bioPulse = ss(0.84, 0.98, bioCell) * (0.4 + 0.6 * sin(uTime * 4.5 + bioCell * 40.0));
          extCol += vec3(0.12, 0.86, 0.82) * bioPulse * nearHull * wakeN * 0.48 * night;
        }
      } else {
        // Far arched end-door glass: dreamy shimmering sea-wake mist receding toward the distant horizon (zero stiff lines!)
        float wakeCenter = exp(-sq((nx - 0.5) / (0.008 + 0.018 * waterD))) * ss(0.05, 0.40, waterD);
        float wakeRip = 0.5 + 0.5 * sin(logZ * 10.0 + uWorldScroll * 16.0);
        vec3 wakeCol = moodMix(vec3(0.84, 0.96, 1.00), vec3(0.98, 0.78, 0.58), vec3(0.24, 0.40, 0.64), sunset, night);
        extCol = mix(extCol, wakeCol, wakeCenter * (0.14 + 0.14 * wakeRip));
      }

      float glintX = mix(cssRes.x * 0.11, cssRes.x * 0.068, night) + par.x * 11.0;
      float dxG = abs(extP.x + ripX - glintX) / (cssRes.x * (0.042 + waterD * 0.085));
      float waveBreak = ss(0.44, 0.88, 0.5 + n1 * 0.95 + n2 * 0.80);
      float fineSpark = ss(0.55, 0.92, N(rUV1 * 2.8 + vec2(uTime * 0.9, 0.0), 48.0).r);
      vec3 pathCol = moodMix(vec3(0.94, 0.99, 1.00), vec3(1.02, 0.76, 0.48), vec3(0.64, 0.78, 0.96), sunset, night);
      float moonIllum = 0.5 - 0.5 * cos(uMoonPhase * 6.2831853);
      float pathInt = mix(0.22, 0.34, sunset) * (1.0 - night) + night * (0.12 + 0.22 * moonIllum);
      extCol += pathCol * exp(-sq(dxG)) * (0.16 + 0.54 * waveBreak + 0.30 * fineSpark) * pathInt;
    }

    if (isDoor) {
      float doorEdge = ss(0.010, 0.024, abs(cabUV.x - 0.50));
      float doorVign = ss(0.39, 0.42, cabUV.y) * (1.0 - ss(0.49, 0.52, cabUV.y));
      vec3 doorMist = moodMix(vec3(0.68, 0.84, 0.95), vec3(0.80, 0.58, 0.50), vec3(0.052, 0.100, 0.198), sunset, night);
      extCol = mix(extCol, doorMist, 0.16 + 0.10 * (1.0 - doorVign));
      // Subtle dark interior wood bevel shadow framing the inside of the arched door glass
      extCol *= (1.0 - doorEdge * 0.16);
      extCol += vec3(0.48, 0.28, 0.12) * doorEdge * (0.06 * sunset + 0.14 * night) * lampFlick;
    }

    // AUTHENTIC NIGHT WINDOW GLASS REFLECTIONS + RAINY CONDENSATION & DROPLET CATCHLIGHTS!
    float glassDiag = ss(0.35, 0.65, fract((cabP.x + cabP.y * 0.58) / max(1.0, cssRes.x * 0.42))) * 0.018;
    extCol += vec3(0.88, 0.94, 1.00) * glassDiag * (0.45 + 0.55 * dayAmt);

    if ((sunset + night) > 0.05 && !isDoor) {
      float sideAbs = abs(cabUV.x - 0.5);
      float gR0 = exp(-sq((sideAbs - 0.44) / 0.030) - sq((cabUV.y - 0.255) / 0.024)) * 0.85;
      float gR1 = exp(-sq((sideAbs - 0.32) / 0.024) - sq((cabUV.y - 0.300) / 0.020)) * 0.72;
      float gR2 = exp(-sq((sideAbs - 0.23) / 0.018) - sq((cabUV.y - 0.335) / 0.016)) * 0.58;
      float ghostLamps = (gR0 + gR1 + gR2) * (0.06 * sunset + 0.15 * night) * lampFlick;
      float glassLower = ss(0.42, 0.56, cabUV.y) * (0.022 * sunset + 0.052 * night);
      extCol += vec3(1.00, 0.76, 0.40) * ghostLamps + vec3(0.28, 0.11, 0.08) * glassLower;
    }

    // Crisp sparkling glass raindrops + subtle cold night condensation (ZERO grey donut smudges!)
    if (uShowRain > 0.5) {
      float coldMist = (0.048 * sunset + 0.068 * night + 0.036 * ss(0.42, 0.56, cabUV.y) * night);
      vec3 mistCol = moodMix(vec3(0.76, 0.86, 0.94), vec3(0.70, 0.54, 0.50), vec3(0.11, 0.17, 0.27), sunset, night);
      extCol = mix(extCol, mistCol, coldMist);

      // Tiny hairline lower meniscus shadow strictly on bottom crescent of each 4-5px bead
      extCol *= (1.0 - rain.w * mix(0.16, 0.22, dayAmt));

      // Sparkling pinpoint specular highlights catching warm indoor lamps + sky/moonlight + emerald aurora tint!
      vec3 dropWarm = vec3(1.00, 0.84, 0.54) * (0.18 * sunset + 0.42 * night + 0.48 * uPassFlash) * lampFlick;
      vec3 dropCool = moodMix(vec3(1.00, 1.00, 1.00) * 0.52, vec3(0.98, 0.84, 0.68) * 0.32, vec3(0.42, 0.88, 0.78) * 0.40, sunset, night);
      extCol += (dropWarm + dropCool) * rain.z;
    }

    // Adaptive Icon readability scrim on bright daytime windows (keeps white Windows desktop icon labels crisp!)
    if (uAdaptive >= 0.5) {
      float sdf = fieldS(p);
      if (sdf < 32.0) {
        float icM = pow(max(0.0001, ss(26.0, -22.0, sdf)), 1.4);
        // In bright Day: subtly deepen glaring cyan sky behind icon text; at Night: soft indigo frost glow
        extCol *= (1.0 - icM * 0.16 * dayAmt);
        vec3 icTint = moodMix(vec3(0.32, 0.54, 0.76), vec3(0.76, 0.56, 0.46), vec3(0.08, 0.15, 0.28), sunset, night);
        extCol = mix(extCol, icTint, icM * mix(0.14, 0.12, night));
      }
    }

    col = extCol;
  }

  // =========================================================================
  // 2. DEEP THEATRICAL CARRIAGE RELIGHTING + PASSING TRAIN AMBER LIGHT FLASH
  // =========================================================================
  float poleSweepAisle = 0.0;
  if (cab.a > 0.004) {
    vec2 nUV = cabUV;
    float rawLum = dot(cab.rgb, vec3(0.299, 0.587, 0.114));

    float lampCore = exp(-sq(dL0 / 0.022)) * 1.00
                   + exp(-sq(dL1 / 0.017)) * 0.92
                   + exp(-sq(dL2 / 0.013)) * 0.80
                   + exp(-sq(dL3 / 0.010)) * 0.68;
    float lampHalation = exp(-dL0 / 0.095) * 0.52
                       + exp(-dL1 / 0.075) * 0.44
                       + exp(-dL2 / 0.058) * 0.36
                       + exp(-dL3 / 0.044) * 0.28;

    vec2 downBias = vec2(1.0, 0.72);
    float dC0 = length((nUV - vec2(0.500, 0.08)) * vec2(asp, 1.0) * downBias);
    float dC1 = length((nUV - vec2(0.500, 0.18)) * vec2(asp, 1.0) * downBias);
    float dC2 = length((nUV - vec2(0.500, 0.25)) * vec2(asp, 1.0) * downBias);
    float lampPool = exp(-sq(dC0 / 0.48)) * 0.62
                   + exp(-sq(dC1 / 0.38)) * 0.54
                   + exp(-sq(dC2 / 0.30)) * 0.44;
    float aisleGlow = exp(-sq((nUV.x - 0.50) / 0.36)) * (0.28 + 0.72 * exp(-sq((nUV.y - 0.24) / 0.52)));
    float ngtKey = clamp(lampPool * 0.62 + aisleGlow * 0.38, 0.0, 1.15) * lampFlick;

    float runnerT = clamp((nUV.y - 0.668) / 0.332, 0.0, 1.0);
    float rLeft  = mix(0.436, 0.324, runnerT);
    float rRight = mix(0.564, 0.676, runnerT);
    float inRunner = ss(0.664, 0.676, nUV.y)
                   * ss(rLeft - 0.008, rLeft + 0.008, nUV.x)
                   * (1.0 - ss(rRight - 0.008, rRight + 0.008, nUV.x));

    float zFloor = 1.15 / max(0.18, runnerT + 0.24);
    float slantPhase = zFloor * 2.55 - (nUV.x - 0.50) * 1.45;
    float paneSun = ss(-0.18, 0.22, sin(slantPhase * 3.14159));

    float poleSweep = 1.0;
    if (uShowPoles > 0.5 && (dayAmt + sunset) > 0.04) {
      float zInterior = mix(4.2, 0.85, clamp((nUV.y - 0.25) / 0.75, 0.0, 1.0));
      float zPole = mod(zInterior + uWorldScroll * 2.15 - (nUV.x - 0.50) * 0.75, 2.65) - 1.325;
      float pBand = exp(-sq(zPole / 0.24));
      poleSweepAisle = pBand;
      float litArea = clamp(inRunner * 1.0 + (1.0 - ss(0.05, 0.72, nUV.x)) * ss(0.25, 0.65, nUV.y) * 0.55, 0.0, 1.0);
      poleSweep = 1.0 - pBand * 0.28 * litArea;
    }
    float floorSunMod = mix(1.0, mix(0.76, 1.14, paneSun), inRunner * (dayAmt + sunset * 0.85)) * poleSweep;

    float ceilingMask = (1.0 - ss(0.18, 0.34, nUV.y)) * ss(0.22, 0.36, nUV.x) * (1.0 - ss(0.64, 0.78, nUV.x));
    float cWave1 = N(vec2(nUV.x * 160.0 + uTime * 11.0, nUV.y * 220.0 + uWorldScroll * 55.0), 140.0).r;
    float cWave2 = N(vec2(nUV.x * 240.0 - uTime * 8.5,  nUV.y * 170.0 + uWorldScroll * 80.0), 110.0).g;
    float caustics = ss(0.48, 0.88, cWave1 * 0.55 + cWave2 * 0.55) * ceilingMask;
    vec3 causticCol = moodMix(vec3(0.45, 0.82, 0.98), vec3(1.00, 0.66, 0.36), vec3(0.22, 0.38, 0.68), sunset, night);

    float leftSunlight = (1.0 - ss(0.05, 0.56, nUV.x)) * ss(0.18, 0.48, nUV.y) * (1.0 - ss(0.84, 0.98, nUV.y));

    vec3 cabDay = cab.rgb * vec3(1.01, 1.02, 1.01) * floorSunMod * (0.96 + 0.09 * leftSunlight)
                + causticCol * caustics * 0.080;

    vec3 cabSunBase = pow(max(cab.rgb, vec3(0.0001)), vec3(1.06));
    vec3 cabSun = cabSunBase * vec3(1.08, 0.91, 0.79) * floorSunMod * (0.90 + 0.15 * leftSunlight)
                + causticCol * caustics * 0.095
                + vec3(0.24, 0.13, 0.04) * clamp(lampPool, 0.0, 1.0) * 0.22 * lampFlick;

    vec3 cabDeep = pow(max(cab.rgb, vec3(0.0001)), vec3(1.26));
    if (inRunner > 0.01) {
      vec3 runnerEven = mix(cabDeep, vec3(0.32, 0.28, 0.24) * (0.68 + 0.32 * rawLum), 0.52);
      cabDeep = mix(cabDeep, runnerEven, inRunner);
    }
    vec3 ngtAmbient = vec3(0.068, 0.096, 0.178);
    vec3 ngtTungsten = vec3(0.92, 0.58, 0.25) * ngtKey;
    float leftMoonSpill  = (1.0 - ss(0.02, 0.34, nUV.x)) * ss(0.22, 0.52, nUV.y) * (1.0 - ss(0.68, 0.96, nUV.y));
    float rightMoonSpill = ss(0.76, 0.98, nUV.x) * ss(0.22, 0.52, nUV.y) * (1.0 - ss(0.66, 0.92, nUV.y));
    // Cool moonlight + whisper-subtle emerald aurora tint grazing left & right wooden window frames!
    vec3 moonSpill = vec3(0.10, 0.23, 0.33) * (leftMoonSpill * 0.75 + rightMoonSpill * 0.52) * ss(0.12, 0.52, rawLum);

    float woodSheen = ss(0.42, 0.84, rawLum) * clamp(lampPool * 0.85, 0.0, 1.0) * (1.0 - ss(0.38, 0.72, nUV.y));
    vec3 cabNgt = cabDeep * (ngtAmbient + ngtTungsten) + moonSpill
                + vec3(0.30, 0.17, 0.05) * woodSheen * 0.45 * lampFlick
                + causticCol * caustics * 0.018;

    vec3 cabCol = moodMix(cabDay, cabSun, cabNgt, sunset, night);

    // Subtle poetic spirit breathing glow on the 5 shadowy passengers
    if (shadowPassengerMask > 0.05) {
      float spiritPulse = (0.5 + 0.5 * sin(uTime * 0.42 + nUV.x * 5.0)) * 0.055 * night;
      cabCol += vec3(0.14, 0.22, 0.34) * shadowPassengerMask * spiritPulse;
    }

    // LIVE PASSING COUNTER-TRAIN WARM AMBER LIGHT SPILL sweeping across the left seats, mullions & floor!
    if (uPassFlash > 0.005) {
      float leftWash = (1.0 - ss(0.04, 0.78, nUV.x)) * ss(0.14, 0.44, nUV.y) * (1.0 - ss(0.86, 1.0, nUV.y));
      float runnerFlash = inRunner * 0.82;
      float flashMask = clamp(leftWash * 0.85 + runnerFlash, 0.0, 1.1) * (0.30 + 0.70 * max(sunset, night));
      cabCol += vec3(0.46, 0.26, 0.09) * (0.28 + 0.72 * rawLum) * flashMask * uPassFlash;
    }

    vec3 domeCoreCol = vec3(1.18, 1.04, 0.78) * clamp(lampCore, 0.0, 1.25) * (0.28 * sunset + 0.78 * night) * lampFlick;
    vec3 domeHaloCol = vec3(0.92, 0.44, 0.14) * clamp(lampHalation, 0.0, 1.0) * (0.14 * sunset + 0.34 * night) * lampFlick;
    cabCol += domeCoreCol + domeHaloCol;

    // Grounded multi-layer floor contact shadow 100% locked in BOTH X & Y to Chihiro's yellow sneakers during 3D parallax!
    if (uShowNoFace > 0.5 && uNoFaceReady > 0.5 && uNoFaceRect.z > 1.0) {
      vec2 fgShift = par * vec2(10.5, 4.0);
      vec2 feetCen = vec2(uNoFaceRect.x + uNoFaceRect.z * 0.22, uNoFaceRect.y + uNoFaceRect.w * 0.996) + fgShift;
      vec2 feetRel = (cabP - feetCen) / vec2(uNoFaceRect.z * 0.23, uNoFaceRect.w * 0.024);
      float feetAO = exp(-dot(feetRel, feetRel)) * 0.62;
      vec2 castCen = vec2(uNoFaceRect.x + uNoFaceRect.z * 0.42, uNoFaceRect.y + uNoFaceRect.w * 0.992) + fgShift;
      vec2 castRel = (cabP - castCen) / vec2(uNoFaceRect.z * 0.44, uNoFaceRect.w * 0.044);
      float castAO = exp(-dot(castRel, castRel)) * mix(0.32, 0.46, night);
      cabCol *= (1.0 - max(feetAO, castAO));
    }

    // Contrast-preserving multiplicative Adaptive Icon micro-sheen (zero milky grey fog!)
    if (uAdaptive >= 0.5) {
      float sdf = fieldS(p);
      if (sdf < 26.0) {
        float icM = ss(22.0, -20.0, sdf);
        cabCol *= (1.0 + icM * mix(0.05, 0.08, night));
      }
    }

    col = mix(col, cabCol, cab.a);
  }

  // =========================================================================
  // 3. PIXEL-LOCKED LIVING LAYER (STRAPS, SOOT SPRITES, GOLD DUST & MOTES)
  // =========================================================================
  vec4 live = texture(uLiveTex, cabUV);
  if (live.a > 0.004) {
    col = mix(col, live.rgb, live.a);
  }

  // =========================================================================
  // 4. FOREGROUND 3D PARALLAX CAST: CHIHIRO & TOWERING NO-FACE
  // =========================================================================
  if (uShowNoFace > 0.5 && uNoFaceReady > 0.5 && uNoFaceRect.z > 1.0) {
    // Foreground shifts deeper than midground cabin -> true 3D stereoscopic-like depth when moving mouse!
    vec2 nfP = cabP - par * vec2(10.5, 4.0);
    vec2 nfUV = (nfP - uNoFaceRect.xy) / uNoFaceRect.zw;
    if (nfUV.x >= -0.02 && nfUV.x <= 1.02 && nfUV.y >= -0.02 && nfUV.y <= 1.02) {
      float isNoFaceSide = ss(0.41, 0.52, nfUV.x);
      float isChihiroSide = 1.0 - isNoFaceSide;

      // Subtle authentic cel-animation breath (ZERO rubbery jelly UV-warp distortion on outlines!)
      float chFeetLock = 1.0 - ss(0.70, 0.92, nfUV.y);
      float chBreath = sin(uTime * 1.35) * 0.0014 * chFeetLock * isChihiroSide;
      float isPonytailTip = isChihiroSide * (1.0 - ss(0.06, 0.16, nfUV.x))
                          * ss(0.28, 0.34, nfUV.y) * (1.0 - ss(0.45, 0.50, nfUV.y));
      float hairWave = sin(uTime * 2.6 - nfUV.y * 12.0) * 0.0016 * isPonytailTip;

      // No-Face stands with eerie stillness; ONLY the ultra-soft misty bottom smoke hem gently breathes!
      float cloakHem = ss(0.62, 0.96, nfUV.y) * isNoFaceSide;
      float nfMaskHover = sin(uTime * 1.05 + 0.8) * 0.0012 * isNoFaceSide;
      float smokeWaveX = sin(nfUV.y * 8.0 - uTime * 1.45) * 0.0015 * cloakHem;

      vec2 animUV = nfUV - vec2(hairWave + smokeWaveX, chBreath + nfMaskHover);
      if (animUV.x >= 0.0 && animUV.x <= 1.0 && animUV.y >= 0.0 && animUV.y <= 1.0) {
        vec4 nf = texture(uNoFaceTex, animUV);
        if (nf.a > 0.005) {
          float isNoFaceBody = ss(0.42, 0.52, animUV.x);
          float lum = dot(nf.rgb, vec3(0.299, 0.587, 0.114));
          float isMask = isNoFaceBody * ss(0.56, 0.82, lum) * (1.0 - ss(0.31, 0.41, animUV.y));

          float aLeftTop = texture(uNoFaceTex, clamp(animUV + vec2(-0.022, -0.014), 0.0, 1.0)).a;
          float aRight   = texture(uNoFaceTex, clamp(animUV + vec2( 0.022,  0.000), 0.0, 1.0)).a;
          float rimWarmEdge = clamp(nf.a - aLeftTop, 0.0, 1.0);
          float rimCoolEdge = clamp(nf.a - aRight,   0.0, 1.0);

          float leftRim = 1.0 - ss(0.0, 0.72, animUV.x);
          float poleDim = 1.0 - poleSweepAisle * 0.14 * (dayAmt + sunset * 0.8);

          // DAY & SUNSET coherent Studio Ghibli directional lighting:
          // Left side catches warm golden window sunlight; right shadow side deepens warmly into the carriage
          // while No-Face's right edge picks up cool cerulean sky bounce from the right window!
          float vertShade = mix(1.02, 0.80, ss(0.36, 0.98, animUV.y));
          float daySculpt = mix(0.88, 1.04, leftRim);
          vec3 nfDay = (nf.rgb * vec3(1.00, 0.99, 0.96) * vertShade * daySculpt
                     + vec3(0.065, 0.052, 0.024) * rimWarmEdge * (1.0 - ss(0.65, 0.95, animUV.y))
                     + vec3(0.045, 0.115, 0.195) * rimCoolEdge * isNoFaceBody * (1.0 - ss(0.56, 0.82, animUV.y))) * poleDim;
          vec3 nfSun = (pow(max(nf.rgb, vec3(0.0001)), vec3(1.06)) * vec3(1.06, 0.88, 0.75) * vertShade * daySculpt
                     + vec3(0.10, 0.052, 0.018) * (leftRim * 0.50 + rimWarmEdge * 0.88)) * poleDim;

          vec3 nfDeep = pow(max(nf.rgb, vec3(0.0001)), vec3(1.22));
          float lampDist = length((cabUV - vec2(0.50, 0.10)) * vec2(asp * 0.92, 1.05));
          float roomLampReach = exp(-sq(lampDist / 0.68)) * lampFlick;
          float yLight = mix(1.00, 0.24, ss(0.14, 0.88, animUV.y));
          float xLight = mix(1.05, 0.58, ss(0.04, 0.88, animUV.x));
          float charKey = clamp(roomLampReach * 0.95 * yLight * xLight, 0.0, 1.0);

          vec2 mRel = (animUV - vec2(0.57, 0.17)) / vec2(0.17, 0.14);
          float maskCurve = clamp(0.88 - mRel.x * 0.30 - mRel.y * 0.26 - dot(mRel, mRel) * 0.16, 0.34, 1.05);
          float maskShading = mix(1.0, maskCurve, isMask);

          vec3 nfAmbient = vec3(0.088, 0.114, 0.195);
          vec3 nfTungsten = vec3(0.76, 0.51, 0.26) * (charKey * 0.88 + isMask * 0.16 * maskCurve);
          vec3 nfNgt = nfDeep * (nfAmbient + nfTungsten) * maskShading;

          float topVis = 1.0 - ss(0.52, 0.94, animUV.y);
          nfNgt += vec3(0.95, 0.60, 0.24) * rimWarmEdge * (0.28 + 0.34 * topVis) * lampFlick;
          float winH = ss(0.06, 0.22, animUV.y) * (1.0 - ss(0.58, 0.84, animUV.y));
          nfNgt += vec3(0.24, 0.42, 0.74) * rimCoolEdge * winH * 0.34;

          vec3 nfCol = moodMix(nfDay, nfSun, nfNgt, sunset, night);

          // Live Passing Counter-Train warm amber flash washing across Chihiro & No-Face's left side!
          if (uPassFlash > 0.005) {
            float hitSide = (0.35 + 0.65 * leftRim) * (0.45 + 0.55 * topVis);
            nfCol += vec3(0.42, 0.23, 0.08) * (0.22 + 0.78 * lum) * hitSide * uPassFlash * (0.32 + 0.68 * max(sunset, night));
            nfCol += vec3(1.00, 0.68, 0.28) * rimWarmEdge * uPassFlash * 0.45;
          }

          float edgeWrap = (1.0 - ss(0.30, 0.92, nf.a)) * 0.28;
          nfCol = mix(nfCol, col, edgeWrap);

          // Subtle breathing modulation on No-Face's already physically translucent watercolor ink hem
          float noFaceHem = isNoFaceBody * ss(0.62, 0.98, animUV.y) * (1.0 - isMask);
          float spiritFade = 0.94 + 0.05 * sin(uTime * 1.2 + animUV.y * 6.0);
          float finalAlpha = nf.a * mix(1.0, spiritFade, noFaceHem);
          col = mix(col, nfCol, finalAlpha);
        }
      }
    }
  }

  // =========================================================================
  // 5. UNIFIED 35MM STUDIO GHIBLI FILM FINISH
  // =========================================================================
  vec3 cSafe = max(col, vec3(0.0));

  vec2 vigP = (cabUV - 0.5) * vec2(1.12, 1.05);
  float vig = 1.0 - dot(vigP, vigP) * mix(0.22, 0.42, night);
  cSafe *= clamp(vig, 0.68, 1.0);

  float cLum = dot(cSafe, vec3(0.2126, 0.7152, 0.0722));
  if (night > 0.02) {
    vec3 coolShad = vec3(0.95, 0.98, 1.06);
    vec3 warmHigh = vec3(1.04, 1.00, 0.94);
    cSafe *= mix(vec3(1.0), mix(coolShad, warmHigh, ss(0.06, 0.42, cLum)), night * 0.65);
  }

  cSafe *= 1.0 + filmNoise * mix(0.018, 0.028, max(night, sunset * 0.5));

  float fLum = dot(cSafe, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = cSafe / (1.0 + max(0.0, fLum - 0.76) * 0.52);
  vec3 hiTarget = mix(vec3(1.00, 0.96, 0.89), vec3(1.00, 0.93, 0.80), night);
  mapped = mix(mapped, hiTarget, ss(0.86, 1.65, fLum) * 0.20);

  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}
`;
