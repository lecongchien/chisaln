/**
 * Sea Train Central-Aisle Cabin View ("Trong toa tàu" — Exact Image-2 One-Point Perspective WebGL2 Shader)
 * Faithful Spirited Away central-aisle interior merged directly as View Mode 1 inside Sea Railway:
 *   1. Exterior World (ONLY evaluated through transparent left windows, right windows & far arched door window!):
 *      - True one-point perspective receding coastal sea & sky (Day cerulean blue, Golden Sunset, Starlit Night)
 *      - REAL Birth-Date 3D Lunar Phase (`uMoonTex` + `uMoonPhase`) framed cleanly inside the unobstructed left foreground window!
 *      - Seamless hand-painted Ghibli cumulus clouds (`uCloudsTex`), perspective-foreshortened passing wooden coastal utility poles
 *        & catenary wires rushing from the far windows toward the foreground on BOTH sides of the car!
 *      - Soft distant receding sea horizon through the far arched end-door glass
 *   2. Hand-Painted Spirited Away Central-Aisle Cabin (`uCabinTex`):
 *      - Signature Image-2 slanted sunlit window-frame light bars projected onto the pale cream center aisle floor runner,
 *        rhythmically pulsing as outside coastal poles flash past the sun (Day & Sunset)
 *      - 4 receding centerline brass dome ceiling lamps casting warm incandescent tungsten pools down the wooden car at Night
 *      - Subtle rail-joint micro-suspension bounce (`uBobY`, `uSwayX`) synchronized with the 12 pendulum straps
 *   3. Living Overlay (`uLiveTex`): curved swinging floor ring shadows, diagonal sunlit shafts, golden dust motes,
 *      and 2 receding rows of 6 swinging ivory hand-straps attached pixel-exact to the overhead steel rails
 *   4. Foreground Cast (`uNoFaceTex`, toggled by `uShowNoFace`): Chihiro looking up at towering No-Face in the right foreground
 *      with grounded sneaker contact shadow, smoky lower cloak translucency ONLY on No-Face, and coherent Day/Sunset/Night lighting!
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
uniform float uCabinReady;
uniform float uNoFaceReady;
uniform float uCloudsReady;
uniform float uBobY;
uniform float uSwayX;
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

// Evaluates exterior sky + Real NASA Birth-Date Moon + painted Ghibli cumulus clouds
vec3 evalAisleSky(vec2 sp, vec2 cssRes, float horizonY, float wt, float sunset, float night, float perspZ, bool isDoor, bool isRefl) {
  float skyTopY = cssRes.y * 0.18;
  float skyT = clamp((sp.y - skyTopY) / max(1.0, horizonY - skyTopY), 0.0, 1.0);

  // Image-2 luminous Studio Ghibli cerulean summer sky (Day), warm apricot twilight (Sunset), starlit indigo (Night)
  vec3 topDay = vec3(0.220, 0.595, 0.905);
  vec3 midDay = vec3(0.495, 0.785, 0.955);
  vec3 botDay = vec3(0.835, 0.942, 0.980);

  vec3 topSun = vec3(0.225, 0.355, 0.665);
  vec3 midSun = vec3(0.575, 0.455, 0.645);
  vec3 botSun = vec3(0.965, 0.650, 0.465);

  vec3 topNgt = vec3(0.014, 0.036, 0.102);
  vec3 midNgt = vec3(0.036, 0.082, 0.192);
  vec3 botNgt = vec3(0.092, 0.162, 0.292);

  vec3 cTop = moodMix(topDay, topSun, topNgt, sunset, night);
  vec3 cMid = moodMix(midDay, midSun, midNgt, sunset, night);
  vec3 cBot = moodMix(botDay, botSun, botNgt, sunset, night);

  vec3 col = mix(cTop, cMid, ss(0.0, 0.55, skyT));
  col = mix(col, cBot, ss(0.48, 1.0, skyT));

  // Left-side warm sun/sunset glow (consistent with sunlight pouring from the LEFT windows into the aisle!)
  float nx = sp.x / max(1.0, cssRes.x);
  float leftSunBias = exp(-sq((nx - 0.12) / 0.36));
  if (sunset > 0.01) {
    float horBand = exp(-sq((skyT - 0.92) / 0.30));
    col += vec3(0.68, 0.36, 0.18) * horBand * (0.30 + 0.42 * leftSunBias) * sunset;
  } else if (night < 0.5) {
    // Crisp afternoon sun radiance outside the left windows
    col += vec3(0.14, 0.14, 0.10) * exp(-sq((skyT - 0.88) / 0.34)) * leftSunBias * (1.0 - night);
  }

  // Real Birth-Date 3D Moon framed cleanly inside the unobstructed upper-left foreground window!
  vec2 moonPos = vec2(cssRes.x * 0.072, cssRes.y * 0.290);
  float mRad = clamp(min(cssRes.x, cssRes.y) * 0.034, 14.0, 32.0);
  float dMoon = length(sp - moonPos);

  if (night > 0.02) {
    // Soft emerald-jade polar aurora ribbon dancing outside the night train windows
    if (skyT < 0.88) {
      float w1 = sin(perspZ * 1.4 - uWorldScroll * 0.65 + sin(perspZ * 2.6 + uTime * 0.20) * 0.7);
      float w2 = sin(perspZ * 2.5 - uWorldScroll * 1.10 - uTime * 0.24);
      float curtain = ss(0.16, 0.94, 0.5 + 0.34 * w1 + 0.24 * w2) * exp(-sq((skyT - 0.34) / 0.32));
      float rayStreak = 0.68 + 0.32 * sin(perspZ * 9.0 - uWorldScroll * 2.4 + w1 * 2.0);
      vec3 aurCol = mix(vec3(0.18, 0.86, 0.44), vec3(0.28, 0.44, 0.80), 1.0 - skyT);
      col += aurCol * curtain * rayStreak * 0.22 * night * (isRefl ? 0.72 : 1.0);
    }

    // Broad lunar Rayleigh scatter
    if (!isDoor) {
      float skyScat = exp(-dMoon / (max(cssRes.x, cssRes.y) * 0.28));
      col += vec3(0.085, 0.145, 0.265) * skyScat * 0.36 * night;
    }

    // Twinkling stars
    float glareMask = isDoor ? 1.0 : ss(mRad * 1.5, mRad * 4.6, dMoon);
    vec2 sC1 = floor(sp / 19.0);
    vec2 sU1 = fract(sp / 19.0) - 0.5;
    float sh1 = hash2(sC1 + 19.3);
    if (sh1 > 0.62) {
      vec2 so = (vec2(hash2(sC1 + 5.7), hash2(sC1 + 41.2)) - 0.5) * 0.64;
      float sd = length(sU1 - so);
      float tw = 0.58 + 0.42 * sin(uTime * (1.8 + sh1 * 2.4) + sh1 * 48.0);
      float sb = (1.0 - ss(0.024, 0.086, sd)) * tw * (1.0 - ss(0.56, 0.98, skyT) * 0.55) * glareMask * night;
      col = mix(col, vec3(0.95, 0.98, 1.00), sb * (isRefl ? 0.65 : 0.90));
    }

    // Real NASA Near-Side Lunar Surface (uMoonTex) + Exact Birth-Date 3D Phase + Earthshine (in left foreground window!)
    if (!isDoor && nx < 0.38) {
      float moonTheta = uMoonPhase * 6.2831853;
      float moonIllum = 0.5 - 0.5 * cos(moonTheta);
      float phaseGlow = mix(0.18, 1.0, pow(max(0.0001, moonIllum), 0.65));
      vec2 mLocal = (sp - moonPos) / max(1.0, mRad);
      float rN = length(mLocal);
      vec2 rotM = vec2(mLocal.x * 0.97 + mLocal.y * 0.24, -mLocal.x * 0.24 + mLocal.y * 0.97);
      float lx = sin(moonTheta);
      float lz = -cos(moonTheta);
      float dOuter = dMoon - mRad;
      float disc = ss(1.6, -1.3, dOuter);

      float limbDir = mix(clamp(0.55 + 0.45 * (rotM.x / max(0.25, rN)) * lx, 0.18, 1.0), 1.0, moonIllum);
      vec3 skyBeforeMoon = col;
      float aureole = exp(-max(dOuter, 0.0) / (mRad * 1.25)) * 0.46 * phaseGlow * limbDir;
      float corona  = exp(-max(dOuter, 0.0) / (mRad * 4.60)) * 0.22 * phaseGlow;
      col += vec3(0.92, 0.95, 0.97) * aureole * 0.44 * night;
      col += vec3(0.46, 0.68, 0.96) * corona  * 0.62 * night;

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
        vec3 moonLitCol = mTex.rgb * regolith * relief * vec3(1.04, 1.03, 0.99);
        vec3 earthshine = skyBeforeMoon * 0.88 + mTex.rgb * vec3(0.062, 0.088, 0.132) + vec3(0.008, 0.015, 0.032);
        col = mix(col, mix(earthshine, moonLitCol, litPhase), disc * night * 0.99);
      }
    }
  }

  // Hand-Painted Seamless Studio Ghibli Cumulus Panorama receding softly along both side windows!
  if (uCloudsReady > 0.5) {
    float cV = clamp((skyT - 0.24) / 0.78, 0.0, 1.0);
    if (skyT >= 0.24) {
      float cU = isDoor
        ? (nx * 1.8 + wt * 0.0025)
        : (perspZ * 0.10 - uWorldScroll * 0.09 - wt * 0.0022 + (nx > 0.5 ? 0.42 : 0.0));
      vec4 cTex = texture(uCloudsTex, vec2(cU, cV));
      if (cTex.a > 0.004) {
        vec3 c = cTex.rgb;
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 colDay = mix(vec3(0.62, 0.76, 0.90), vec3(1.00, 1.00, 0.98), ss(0.24, 0.88, lum));
        vec3 colSun = c * vec3(1.04, 0.98, 0.95) + vec3(0.05, 0.025, 0.005) * ss(0.65, 0.92, lum);
        vec3 colNgt = mix(vec3(0.055, 0.088, 0.175), vec3(0.22, 0.34, 0.52), ss(0.26, 0.88, lum) * 0.72);
        vec3 cGraded = moodMix(colDay, colSun, colNgt, sunset, night);
        cGraded = mix(cGraded, cBot, ss(0.80, 1.0, skyT) * 0.34);
        float cA = cTex.a * ss(0.24, 0.30, skyT) * (1.0 - ss(0.94, 1.0, skyT) * 0.22);
        col = mix(col, cGraded, clamp(cA * (isDoor ? 0.65 : 0.90), 0.0, 0.94));
      }
    }
  }

  // Horizon misty atmospheric glow uniting sky & mirror ocean
  float seamG = exp(-sq((1.0 - skyT) / 0.055));
  vec3 seamC = moodMix(vec3(0.90, 0.97, 1.00), vec3(0.96, 0.70, 0.52), vec3(0.14, 0.25, 0.44), sunset, night);
  col = mix(col, seamC, seamG * mix(0.26, 0.34, sunset) * (1.0 - night * 0.38));
  return col;
}

// Perspective-foreshortened passing wooden coastal utility poles rushing along BOTH sides of the moving car!
vec4 evalPerspectivePoles(vec2 p, vec2 cssRes, float horizonY, float perspZ, float sideDepth, float sunset, float night) {
  if (uShowPoles < 0.5) return vec4(0.0);
  // Real 3D forward travel: poles scroll smoothly from far (large perspZ) toward near outer windows (small perspZ)!
  float spacing = 2.65;
  float zMove = perspZ - uWorldScroll * 2.15;
  float cell = mod(zMove, spacing);
  float relZ = cell - spacing * 0.5;

  // Pole appears thicker in the foreground windows and thinner in the distance!
  float poleHalfZ = 0.036 + 0.018 * (1.0 - sideDepth);
  float poleM = ss(poleHalfZ + 0.015, poleHalfZ * 0.45, abs(relZ));

  // Crossarm near top of receding window perspective
  float crossY = mix(cssRes.y * 0.375, cssRes.y * 0.245, sideDepth);
  float crossM = ss(poleHalfZ * 4.6, poleHalfZ * 2.4, abs(relZ)) * ss(3.0, 0.8, abs(p.y - crossY));

  // Two graceful perspective-converging catenary power wires sweeping between receding poles
  float uSpan = cell / spacing;
  float sag = 4.0 * uSpan * (1.0 - uSpan);
  float wire1Y = crossY + 4.0 + sag * mix(6.0, 26.0, sideDepth);
  float wire2Y = crossY + mix(8.0, 20.0, sideDepth) + sag * mix(8.0, 34.0, sideDepth);
  float w1 = ss(1.5, 0.35, abs(p.y - wire1Y)) * 0.65;
  float w2 = ss(1.4, 0.35, abs(p.y - wire2Y)) * 0.55;

  float mask = max(max(poleM, crossM), max(w1, w2));
  if (mask <= 0.004) return vec4(0.0);
  // Gentle atmospheric distance fade for far poles
  float distFade = mix(0.55, 0.92, sideDepth);
  vec3 poleCol = moodMix(vec3(0.25, 0.27, 0.32), vec3(0.23, 0.14, 0.19), vec3(0.034, 0.054, 0.108), sunset, night);
  return vec4(poleCol, clamp(mask * distFade, 0.0, 0.90));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 cssRes = max(vec2(1.0), uRes / uDpr);
  float wt = uWindTime;
  float sunset = clamp(uSunset, 0.0, 1.0);
  float night  = clamp(uNight,  0.0, 1.0);
  float dayAmt = max(0.0, 1.0 - sunset - night);

  vec2 gp = floor(p * (0.82 * max(uDpr, 1.0)));
  float g1 = hash2(gp + 0.5);

  // Sample hand-painted Image-2 central-aisle cabin interior (with subtle rail-joint micro-suspension bob!)
  vec2 cabP = p - vec2(uSwayX, uBobY);
  vec2 cabUV = clamp(cabP / cssRes, 0.0, 1.0);
  vec4 cab = uCabinReady > 0.5 ? texture(uCabinTex, cabUV) : vec4(0.24, 0.18, 0.14, 1.0);

  vec3 col = vec3(0.0);

  // =========================================================================
  // 1. EXTERIOR ONE-POINT PERSPECTIVE SEA WORLD (ONLY INSIDE TRANSPARENT GLASS!)
  // =========================================================================
  if (cab.a < 0.995) {
    float nx = p.x / max(1.0, cssRes.x);
    bool isDoor = (nx > 0.45 && nx < 0.55);
    // Distance from center vanishing axis: ~0.16 at far side windows -> ~0.96 at outer foreground windows
    float sideDepth = clamp((abs(nx - 0.5) - 0.11) / 0.39, 0.0, 1.0);
    // True perspective depth coordinate Z along the train track (far = large Z, near = small Z)
    float perspZ = 1.65 / max(0.14, abs(nx - 0.5));
    float horizonY = cssRes.y * 0.452;

    vec3 extCol;
    if (p.y < horizonY) {
      extCol = evalAisleSky(p, cssRes, horizonY, wt, sunset, night, perspZ, isDoor, false);
    } else {
      float depthPx = p.y - horizonY;
      float waterD = clamp(depthPx / max(1.0, cssRes.y * 0.135), 0.0, 1.0);
      vec2 rUV1 = isDoor
        ? vec2(nx * 24.0, depthPx * 2.4 - uWorldScroll * 60.0)
        : vec2(perspZ * 55.0 - uWorldScroll * 210.0, depthPx * 2.2 / (0.24 + waterD));
      float n1 = N(rUV1, 160.0).r - 0.5;
      float n2 = N(rUV1 * 1.9 + vec2(37.0, 19.0), 96.0).g - 0.5;
      float ripX = (n1 * 6.8 + n2 * 2.8) * (0.24 + 0.76 * waterD);
      float ripY = (n2 * 2.2) * waterD;

      vec2 refP = vec2(p.x + ripX, max(cssRes.y * 0.19, horizonY - depthPx * 1.06 + ripY));
      vec3 skyRefl = evalAisleSky(refP, cssRes, horizonY, wt, sunset, night, perspZ, isDoor, true);

      // Image-2 luminous turquoise-cerulean sea in Day; plum-gold at Sunset; deep marine indigo at Night
      vec3 waterTint = moodMix(vec3(0.14, 0.54, 0.80), vec3(0.44, 0.34, 0.52), vec3(0.022, 0.064, 0.142), sunset, night);
      float fres = mix(0.24, 0.54, pow(max(0.0001, waterD), 0.72));
      extCol = mix(skyRefl, waterTint, fres);

      // Subtle sun/moon sea sparkles gliding outside the windows
      float glintX = mix(cssRes.x * 0.14, cssRes.x * 0.072, night);
      float dxG = abs(p.x + ripX - glintX) / (cssRes.x * (0.055 + waterD * 0.10));
      float spark = ss(0.40, 0.86, 0.5 + n1 * 0.85 + n2 * 0.70);
      vec3 pathCol = moodMix(vec3(0.92, 0.99, 1.00), vec3(1.04, 0.76, 0.46), vec3(0.82, 0.91, 1.00), sunset, night);
      float moonIllum = 0.5 - 0.5 * cos(uMoonPhase * 6.2831853);
      float pathInt = mix(0.22, 0.48, max(sunset * 0.80, night * mix(0.30, 1.0, moonIllum)));
      extCol += pathCol * exp(-sq(dxG)) * (0.24 + 0.76 * spark) * pathInt;
    }

    // Passing perspective wooden coastal utility poles on left & right side windows (never inside back door glass!)
    if (!isDoor) {
      vec4 pole = evalPerspectivePoles(p, cssRes, horizonY, perspZ, sideDepth, sunset, night);
      if (pole.a > 0.004) {
        extCol = mix(extCol, pole.rgb, pole.a);
      }
    } else {
      // Soft receding distance mist through the far arched door window
      vec3 doorMist = moodMix(vec3(0.76, 0.88, 0.96), vec3(0.84, 0.62, 0.54), vec3(0.08, 0.14, 0.25), sunset, night);
      extCol = mix(extCol, doorMist, 0.18);
    }

    // Subtle physical window glass sheen + gentle warm ceiling-lamp reflection at Night
    float glassDiag = ss(0.28, 0.64, fract((p.x + p.y * 0.65) / max(1.0, cssRes.x * 0.36))) * 0.028;
    extCol += vec3(0.88, 0.94, 1.00) * glassDiag * (0.50 + 0.50 * dayAmt);
    if ((sunset + night) > 0.05 && !isDoor) {
      float reflY = abs(p.y / max(1.0, cssRes.y) - 0.34);
      float reflGlow = exp(-sq(reflY / 0.10)) * (0.04 * sunset + 0.11 * night);
      extCol += vec3(1.00, 0.82, 0.48) * reflGlow;
    }

    // Adaptive Icon delicate atmospheric mist halo on glass (keeps left-side desktop icons razor-legible!)
    if (uAdaptive >= 0.5) {
      float sdf = fieldS(p);
      if (sdf < 34.0) {
        float icM = ss(28.0, -24.0, sdf);
        vec3 icTint = moodMix(vec3(0.88, 0.95, 1.00), vec3(0.98, 0.78, 0.62), vec3(0.14, 0.25, 0.42), sunset, night);
        extCol = mix(extCol, icTint, pow(max(0.0001, icM), 1.45) * 0.20);
      }
    }

    col = extCol;
  }

  // =========================================================================
  // 2. HAND-PAINTED IMAGE-2 CENTRAL-AISLE INTERIOR + SUNLIGHT BARS + 4 LAMPS
  // =========================================================================
  if (cab.a > 0.004) {
    vec2 nUV = cabUV;
    float asp = cssRes.x / max(1.0, cssRes.y);

    // 4 Receding Centerline Brass Ceiling Dome Lamps (pixel-calibrated from cabin-frame.png!)
    float dL0 = length((nUV - vec2(0.500, 0.012)) * vec2(asp, 1.0));
    float dL1 = length((nUV - vec2(0.500, 0.114)) * vec2(asp, 1.0));
    float dL2 = length((nUV - vec2(0.500, 0.189)) * vec2(asp, 1.0));
    float dL3 = length((nUV - vec2(0.500, 0.242)) * vec2(asp, 1.0));

    float lampBulb = exp(-sq(dL0 / 0.040)) * 1.00
                   + exp(-sq(dL1 / 0.032)) * 0.92
                   + exp(-sq(dL2 / 0.024)) * 0.80
                   + exp(-sq(dL3 / 0.018)) * 0.68;
    float lampCone = exp(-sq(dL0 / 0.46)) * 0.62
                   + exp(-sq(dL1 / 0.36)) * 0.54
                   + exp(-sq(dL2 / 0.28)) * 0.44
                   + exp(-sq(dL3 / 0.22)) * 0.36;
    // Soft centerline aisle glow carrying warm dome light down onto the red velvet benches & floor runner
    float aisleWarm = exp(-sq((nUV.x - 0.50) / 0.42)) * (0.52 + 0.48 * (1.0 - nUV.y));
    float lampFlick = 0.975 + 0.025 * sin(uTime * 2.8 + sin(uTime * 6.7) * 0.4);

    // SIGNATURE IMAGE-2 DETAIL: Slanted sunlit window-frame bars projected across the pale cream center aisle runner!
    float runnerT = clamp((nUV.y - 0.668) / 0.332, 0.0, 1.0);
    float rLeft  = mix(0.436, 0.324, runnerT);
    float rRight = mix(0.564, 0.676, runnerT);
    float inRunner = ss(0.664, 0.676, nUV.y)
                   * ss(rLeft - 0.008, rLeft + 0.008, nUV.x)
                   * (1.0 - ss(rRight - 0.008, rRight + 0.008, nUV.x));

    // Perspective-foreshortened sunlit pane bands & dark wooden mullion shadow stripes receding down the aisle!
    float zFloor = 1.15 / max(0.18, runnerT + 0.24);
    float slantPhase = zFloor * 2.55 - (nUV.x - 0.50) * 1.45;
    float paneSun = ss(-0.18, 0.22, sin(slantPhase * 3.14159));

    // Rhythmic sweeping pole shadow passing across the sunlit aisle runner when outside poles flash past the sun!
    float poleSweep = 1.0;
    if (uShowPoles > 0.5 && (dayAmt + sunset) > 0.04) {
      float zPole = mod(zFloor * 1.45 - uWorldScroll * 2.15, 2.65) - 1.325;
      float pBand = exp(-sq(zPole / 0.22));
      poleSweep = 1.0 - pBand * 0.26 * inRunner;
    }

    // Crisp sunlit vs mullion-shadow modulation on the pale cream floor runner (identical rhythm to Image 2!)
    float floorSunMod = mix(1.0, mix(0.76, 1.15, paneSun) * poleSweep, inRunner * (dayAmt + sunset * 0.85));

    // Warm sunlit bounce hitting left-side benches & wood sills (since sun pours in from the LEFT windows)
    float leftSunlight = (1.0 - ss(0.05, 0.56, nUV.x)) * ss(0.18, 0.48, nUV.y) * (1.0 - ss(0.84, 0.98, nUV.y));

    // Coherent mood color grading:
    vec3 cabDay = cab.rgb * vec3(1.01, 1.02, 1.01) * floorSunMod * (0.96 + 0.09 * leftSunlight);
    vec3 cabSun = cab.rgb * vec3(1.08, 0.93, 0.82) * floorSunMod * (0.92 + 0.14 * leftSunlight)
                + vec3(0.16, 0.09, 0.03) * clamp(lampCone, 0.0, 1.0) * 0.24 * lampFlick;
    // Cozy nocturnal Spirited Away carriage: cool deep shadow corners + warm golden tungsten glow from all 4 ceiling lamps!
    float ngtLight = clamp(lampCone * 0.58 + aisleWarm * 0.42, 0.0, 1.0) * lampFlick;
    vec3 cabNgt = cab.rgb * (vec3(0.16, 0.21, 0.33) + vec3(0.62, 0.46, 0.26) * ngtLight);
    cabNgt += vec3(0.46, 0.30, 0.12) * clamp(lampBulb, 0.0, 1.35) * 0.56 * lampFlick;

    vec3 cabCol = moodMix(cabDay, cabSun, cabNgt, sunset, night);
    // Warm incandescent frosted glass dome lamp glow (Sunset & Night)
    cabCol += vec3(1.08, 0.86, 0.48) * clamp(lampBulb, 0.0, 1.4) * (0.24 * sunset + 0.68 * night) * lampFlick;

    // Grounded contact shadow beneath Chihiro's yellow sneakers on the wooden aisle edge!
    if (uShowNoFace > 0.5 && uNoFaceReady > 0.5 && uNoFaceRect.z > 1.0) {
      vec2 feetCen = vec2(uNoFaceRect.x + uNoFaceRect.z * 0.30, uNoFaceRect.y + uNoFaceRect.w * 0.985);
      vec2 feetRel = (p - feetCen) / vec2(uNoFaceRect.z * 0.24, uNoFaceRect.w * 0.035);
      float feetAO = exp(-dot(feetRel, feetRel)) * 0.52;
      // Subtle cool shadow on wooden aisle extending slightly right from Chihiro's feet in Day/Sunset
      vec2 castCen = vec2(uNoFaceRect.x + uNoFaceRect.z * 0.42, uNoFaceRect.y + uNoFaceRect.w * 0.980);
      vec2 castRel = (p - castCen) / vec2(uNoFaceRect.z * 0.38, uNoFaceRect.w * 0.045);
      float castAO = exp(-dot(castRel, castRel)) * 0.28 * (dayAmt + sunset * 0.75);
      cabCol *= (1.0 - max(feetAO, castAO));
    }

    // Subtle Adaptive Icon warm readability lift on interior surfaces
    if (uAdaptive >= 0.5) {
      float sdf = fieldS(p);
      if (sdf < 28.0) {
        float icM = ss(24.0, -20.0, sdf);
        cabCol += moodMix(vec3(0.035, 0.035, 0.035), vec3(0.055, 0.038, 0.020), vec3(0.045, 0.058, 0.088), sunset, night) * icM;
      }
    }

    col = mix(col, cabCol, cab.a);
  }

  // =========================================================================
  // 3. LIVING LAYER (FLOOR RING SHADOWS, DIAGONAL SUNBEAMS, DUST & 12 SWINGING STRAPS)
  // =========================================================================
  vec4 live = texture(uLiveTex, p / cssRes);
  if (live.a > 0.004) {
    col = mix(col, live.rgb, live.a);
  }

  // =========================================================================
  // 4. FOREGROUND CAST: CHIHIRO LOOKING UP AT TOWERING NO-FACE (RIGHT FOREGROUND)
  // =========================================================================
  if (uShowNoFace > 0.5 && uNoFaceReady > 0.5 && uNoFaceRect.z > 1.0) {
    vec2 nfUV = (p - uNoFaceRect.xy) / uNoFaceRect.zw;
    if (nfUV.x >= 0.0 && nfUV.x <= 1.0 && nfUV.y >= 0.0 && nfUV.y <= 1.0) {
      vec4 nf = texture(uNoFaceTex, nfUV);
      if (nf.a > 0.005) {
        // Distinguish No-Face (right half, nfUV.x > 0.44) vs solid Chihiro (left half, nfUV.x <= 0.46)
        float isNoFaceBody = ss(0.43, 0.52, nfUV.x);
        float lum = dot(nf.rgb, vec3(0.299, 0.587, 0.114));
        float isMask = isNoFaceBody * ss(0.58, 0.84, lum) * (1.0 - ss(0.32, 0.42, nfUV.y));

        // Coherent interior lighting across Day / Sunset / Night:
        // Left-side sunlight rim (from left windows across the aisle) gently touches Chihiro's shoulder & No-Face's left profile!
        float leftRim = 1.0 - ss(0.0, 0.72, nfUV.x);
        vec3 nfDay = nf.rgb * vec3(1.00, 1.01, 1.01) + vec3(0.025, 0.025, 0.015) * leftRim;
        vec3 nfSun = nf.rgb * vec3(1.08, 0.94, 0.84) + vec3(0.06, 0.032, 0.012) * leftRim;
        // Cozy warm overhead ceiling-lamp illumination from upper-left (the 4 centerline ceiling lamps!) at Night
        float lampTop = (1.0 - ss(0.05, 0.92, nfUV.y)) * (0.65 + 0.35 * leftRim);
        vec3 nfNgt = nf.rgb * mix(vec3(0.30, 0.35, 0.48), vec3(0.80, 0.70, 0.56), clamp(lampTop * 0.76 + isMask * 0.38, 0.0, 1.0));
        vec3 nfCol = moodMix(nfDay, nfSun, nfNgt, sunset, night);

        // Subtle ghostly Spirit translucency STRICTLY on No-Face's wispy lower smoky cloak hem (Chihiro stays 100% solid!)
        float noFaceHem = isNoFaceBody * ss(0.68, 0.98, nfUV.y) * (1.0 - isMask);
        float finalAlpha = nf.a * mix(1.0, 0.82, noFaceHem);
        col = mix(col, nfCol, finalAlpha);
      }
    }
  }

  // Unified Studio Ghibli cold-press watercolor paper grain
  col *= 1.0 + (g1 - 0.5) * mix(0.024, 0.034, max(night, sunset * 0.5));

  // Photographic Filmic Highlight Rolloff
  vec3 cSafe = max(col, vec3(0.0));
  float fLum = dot(cSafe, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = cSafe / (1.0 + max(0.0, fLum - 0.78) * 0.50);
  vec3 hiTarget = mix(vec3(1.00, 0.96, 0.89), vec3(0.96, 0.98, 1.00), night);
  mapped = mix(mapped, hiTarget, ss(0.84, 1.65, fLum) * 0.22);

  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}
`;
