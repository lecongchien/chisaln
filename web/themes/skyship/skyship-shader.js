/**
 * Skyship Theme WebGL2 Fragment Shader — "Tàu giữa Biển Mây" (Sky Galleon & Cloud Sea)
 * Studio Ghibli / Kazuo Oga multiplane atmospheric gouache composition:
 *   1. Stratospheric Cobalt Sky + Early Twilight / Cosmic Starfield + Full Moon with Mie corona
 *   2. Towering Background Cumulus Ridges + Off-Screen Parallel Diagonal Crepuscular God-Rays
 *   3. Hero 3-Masted Sky Galleon with LIVE wind-billowing sail UV wave + warm stern cabin lanterns
 *   4. Foreground Billowing Cloud Sea wrapping cleanly OVER the galleon's lower keel + Adaptive Icon Clouds
 *   5. Foreground Sky Fleet Overlay (Escort Skiff, Soaring Winged Glider, Cloud Wake)
 *   6. Distant Sky Birds + Unified Stationary Gouache Paper Grain + Golden Sky Motes + Filmic Rolloff
 */

export const SKYSHIP_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform sampler2D uGalleonHullTex;
uniform sampler2D uGalleonSailsTex;
uniform sampler2D uGalleonSailMap;
uniform sampler2D uSkiffHullTex;
uniform sampler2D uSkiffSailsTex;
uniform sampler2D uSkiffSailMap;
uniform sampler2D uFgTex;
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
uniform float uCloudSea;
uniform float uSunset;
uniform float uNight;
uniform float uMoonOcc;
uniform float uMoonVis;
uniform float uGalleonReady;
uniform float uSkiffReady;
uniform float uShowEscort;
uniform float uShowMeteors;
uniform float uMoonPhase;   // 0=New, 0.25=First Qtr, 0.5=Full (100%), 0.75=Last Qtr
uniform float uSeed;

uniform vec4 uGalleonRect;   // x, y, w, h in CSS px
uniform vec2 uGalleonTilt;   // pitchRad, bobPx
uniform vec4 uSkiffRect;     // x, y, w, h in CSS px
uniform vec2 uSkiffTilt;     // rotRad, bobPx

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

vec2 moodMix2(vec2 dayV, vec2 sunV, vec2 ngtV, float sunset, float night) {
  float dayW = max(0.0, 1.0 - sunset - night);
  float sumW = max(0.001, dayW + sunset + night);
  return (dayV * dayW + sunV * sunset + ngtV * night) / sumW;
}

vec4 N(vec2 p, float scale) {
  return texture(uNoise, p / scale + uSeed * 0.013);
}

float fieldS(vec2 p) {
  vec2 uv = (p / uStep + 0.5) / uGrid;
  return mix(texture(uFA, uv).r, texture(uFB, uv).r, uMix);
}

// Sculpted Studio Ghibli volumetric cumulus cloud field (3 texture fetches + early-out when empty!)
// Single-Source-of-Truth directional lighting: lightStep points strictly TOWARD the active Sun or Moon!
vec2 ghibliCloudSea(vec2 p, float scaleX, float scaleY, float driftX, float coverage, vec2 lightStep) {
  if (coverage <= 0.015) return vec2(0.0);
  vec2 q = vec2(p.x - driftX, p.y) * vec2(1.0 / scaleX, 1.0 / scaleY);
  vec4 t1 = N(q * 56.0, 256.0);
  float d2 = N(q * 112.0 + vec2(41.0, 19.0), 256.0).r;
  float shape = t1.r * 0.56 + d2 * 0.30 + t1.g * 0.14;

  float thresh = 1.0 - coverage;
  float alpha = ss(thresh - 0.06, thresh + 0.075, shape);
  if (alpha <= 0.004) return vec2(0.0);

  vec2 qLit = q + lightStep;
  float shapeLit = N(qLit * 56.0, 256.0).r * 0.72 + t1.g * 0.28;
  float rim = ss(-0.11, 0.13, shape - shapeLit) * 0.72 + ss(thresh, thresh + 0.28, shape) * 0.28;
  return vec2(alpha, clamp(rim, 0.0, 1.0));
}

// Delicate luminous golden sky dust / star-motes drifting smoothly across the high clouds (2x2 fast loop)
float skyMotes(vec2 p, float wt, float amt) {
  if (amt < 0.04) return 0.0;
  const float CELL = 160.0;
  vec2 drifted = p - vec2(wt * 22.0, -wt * 6.0);
  vec2 baseCell = floor(drifted / CELL - 0.5);
  float acc = 0.0;
  for (int jy = 0; jy <= 1; jy++) {
    for (int jx = 0; jx <= 1; jx++) {
      vec2 c = baseCell + vec2(float(jx), float(jy));
      float h1 = hash2(c + 67.3);
      if (h1 < 0.68) continue;
      float h2 = hash2(c + 19.1);
      float h3 = hash2(c + 53.7);
      vec2 pos = (c + vec2(0.22 + h2 * 0.56, 0.22 + h3 * 0.56)) * CELL
               + vec2(sin(wt * 0.95 + h2 * 6.283) * 14.0, cos(wt * 0.8 + h3 * 6.283) * 10.0);
      float d = length(drifted - pos);
      if (d > 8.0) continue;
      float tw = 0.45 + 0.55 * sin(wt * 1.9 + h1 * 21.0);
      float core = 1.0 - ss(0.5, 2.1, d);
      float halo = exp(-d * d / 16.0) * 0.32;
      acc += (core + halo) * tw * 0.44;
    }
  }
  return acc * amt;
}

// Poetic Makoto Shinkai / Studio Ghibli Shooting Stars (pure ALU, zero texture fetches, 60 FPS!)
// 3 asynchronous celestial meteor slots with incandescent white-gold head, diffraction glint,
// and physical color-temperature plasma tail (cream-white -> cyan-silver -> vanishing violet/gold dust).
vec3 shootingStars(vec2 p, vec2 cssRes, float t, float sunset, float night, vec2 moonPos, float mRad) {
  float visAmt = clamp(night + sunset * 0.52, 0.0, 1.0);
  if (visAmt < 0.03) return vec3(0.0);
  float ny = p.y / max(1.0, cssRes.y);
  if (ny > 0.72) return vec3(0.0);

  vec3 acc = vec3(0.0);
  float vertFade = 1.0 - ss(0.42, 0.70, ny);
  float glareMask = night > 0.02 ? ss(mRad * 1.15, mRad * 2.8, length(p - moonPos)) : 1.0;

  for (int i = 0; i < 3; i++) {
    // In twilight sunset, show rarer delicate meteors (slot 0 & 1); full shower in cosmic night!
    if (night < 0.25 && i == 2) continue;
    float fi = float(i);
    float period   = (i == 0) ? 6.2  : ((i == 1) ? 10.7 : 15.1);
    float phaseOff = (i == 0) ? 4.6  : ((i == 1) ? 5.4  : 2.1);
    float dur      = (i == 0) ? 0.96 : ((i == 1) ? 0.86 : 0.76);

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

    // Shared celestial radiant entering from upper-right toward lower-left with subtle natural variance
    vec2 dir = normalize(vec2(-0.85 - (h3 - 0.5) * 0.14, 0.49 + (h3 - 0.5) * 0.12));
    vec2 start = vec2(cssRes.x * (0.24 + h1 * 0.72), cssRes.y * (0.025 + h2 * 0.24));
    float travel = cssRes.x * (0.16 + h2 * 0.14) * ((i == 2) ? 0.78 : 1.0);
    float moveK = prog * (1.12 - 0.12 * prog);
    vec2 head = start + dir * (travel * moveK);

    float tailLen = travel * (0.48 + 0.16 * h1) * ss(0.0, 0.26, prog) * (1.0 - ss(0.74, 1.0, prog) * 0.42);
    vec2 q = p - head;
    float along = -dot(q, dir);
    float perp  = abs(-q.x * dir.y + q.y * dir.x);
    if (perp > 24.0 || along < -22.0 || along > tailLen + 12.0) continue;

    float tNorm = clamp(along / max(tailLen, 1.0), 0.0, 1.0);
    float wCore = 1.55 * (1.0 - tNorm * 0.78) + 0.24;
    float wGlow = 5.80 * (1.0 - tNorm * 0.72) + 1.15;

    float longFade = ss(-2.4, 2.2, along) * pow(max(0.0001, 1.0 - tNorm), 1.85);
    float shimmer = 0.85 + 0.15 * sin(along * 0.34 - t * 14.0) * cos(along * 0.18 + h1 * 9.0);
    float core = exp(-sq(perp / wCore)) * longFade * shimmer;
    float glow = exp(-sq(perp / wGlow)) * longFade * 0.30;

    float dHead = length(q);
    float headCore = exp(-sq(dHead / 2.1)) * 1.32;
    float headHalo = exp(-sq(dHead / 9.2)) * 0.36;
    float crossGlint = (exp(-sq(q.x / 1.05) - sq(q.y / 8.8)) + exp(-sq(q.y / 1.05) - sq(q.x / 8.8))) * 0.30;

    float warmMix = sunset * (1.0 - night);
    vec3 cHead = vec3(1.06, 1.04, 0.98);
    vec3 cMid  = mix(vec3(0.74, 0.90, 1.00), vec3(1.00, 0.90, 0.70), warmMix);
    vec3 cTail = mix(vec3(0.52, 0.64, 0.96), vec3(0.96, 0.66, 0.42), warmMix);

    vec3 tailCol = mix(cHead, cMid, ss(0.0, 0.22, tNorm));
    tailCol = mix(tailCol, cTail, ss(0.28, 0.95, tNorm));

    float slotBright = ((i == 0) ? 0.96 : ((i == 1) ? 0.76 : 0.62)) * env * visAmt * vertFade * glareMask;
    acc += (tailCol * (core + glow) + cHead * (headCore + crossGlint) + cMid * headHalo) * slotBright;
  }
  return acc;
}

// Tiny distant soaring white birds gliding gracefully near the right sunlit god-rays
float distantSkyBirds(vec2 p, vec2 cssRes, float t) {
  float m = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float bx = cssRes.x * (0.74 + fi * 0.042 + sin(t * 0.14 + fi * 1.9) * 0.028);
    float by = cssRes.y * (0.43 + sin(fi * 2.4) * 0.055 + cos(t * 0.19 + fi * 1.4) * 0.018);
    vec2 q = p - vec2(bx, by);
    if (abs(q.x) > 10.0 || abs(q.y) > 7.0) continue;
    float flap = sin(t * (4.6 + fi * 0.45) + fi * 2.1);
    float wingY = abs(q.x) * (0.28 + 0.22 * flap) - abs(q.x) * abs(q.x) * 0.045;
    float d = abs(q.y + wingY);
    float span = 4.5 + mod(fi, 2.0) * 1.4;
    float b = (1.0 - ss(0.55, 1.35, d)) * (1.0 - ss(span * 0.72, span, abs(q.x)));
    m = max(m, b);
  }
  return m;
}

// Aerodynamic GPU Canvas Sail Simulator:
// Evaluates baked yardarm-pinned cloth weights (R), free-hem flutter (G), mast-to-mast gust phase (B),
// and local wave coordinate (A) to drive 3 physical wind modes + directional moonlight/sunlight + 3D cloth-fold shading!
vec4 evalBillowingSails(
  vec2 uv,
  sampler2D sailsTex,
  sampler2D sailMapTex,
  float wt,
  float windAmp,
  float phaseOff,
  float scaleBoost,
  float sunset,
  float night,
  float moonVis,
  vec2 toMoonLocal,
  float isGalleon
) {
  vec4 sm = texture(sailMapTex, clamp(uv, 0.0, 1.0));
  float clothW = sm.r;
  float edgeFl = sm.g;
  float mastPh = sm.b * 4.2 + phaseOff;
  float waveC  = sm.a;

  // 1. Rolling aerodynamic gust breath cascading from stern -> mizzen -> main -> fore -> jibs
  float gust = 0.50 + 0.50 * (0.64 * sin(wt * 1.15 - mastPh) + 0.36 * sin(wt * 2.45 - mastPh * 1.35 + 1.2));
  float puff = (gust - 0.38) * 0.0175 * scaleBoost * clothW * windAmp;

  // 2. Broad traveling cloth billows sweeping across canvas bellies away from pinned yardarms
  float w1Arg = waveC * 10.5 - wt * 4.4 + mastPh * 0.85 + uv.x * 6.5;
  float w2Arg = waveC * 15.0 - wt * 6.8 + mastPh * 1.45 - uv.x * 8.0;
  float ripple = (sin(w1Arg) * 0.0072 + sin(w2Arg) * 0.0024) * scaleBoost * clothW * (0.58 + 0.42 * gust) * windAmp;

  // 3. Snappy high-frequency luffing flutter strictly along free lower feet & trailing leeches
  float luffArg = uv.x * 24.0 + uv.y * 16.0 - wt * 11.2 + mastPh * 2.1;
  float luff = sin(luffArg) * 0.0044 * scaleBoost * edgeFl * (0.50 + 0.50 * gust) * windAmp;

  // Inverse UV sample pushes sail visibly forward-left & slightly upward into the sky airstream
  vec2 disp = vec2(
    -0.88 * puff - 0.72 * ripple - 0.52 * luff,
    -0.34 * puff + 0.58 * ripple - 0.78 * luff
  );
  vec2 sUV = uv - disp;
  if (sUV.x < 0.0 || sUV.x > 1.0 || sUV.y < 0.0 || sUV.y > 1.0) return vec4(0.0);

  vec4 s = texture(sailsTex, sUV);
  if (s.a <= 0.005) return vec4(0.0);

  // Directional light alignment across the ship's canvas (facing upper-right Moon/Sun vs shaded bow/lee)
  vec2 localRel = (uv - 0.5) * 2.0;
  float moonFacing = ss(-0.88, 0.88, dot(localRel, toMoonLocal));
  float sunFacing  = ss(-0.85, 0.85, dot(localRel, normalize(vec2(0.75, -0.45))));

  // Mood grading for translucent backlit sailcloth with physically accurate shadow side vs lit side!
  vec3 sailDay = s.rgb * mix(0.92, 1.04, sunFacing);
  vec3 sailSun = s.rgb * vec3(1.07, 0.95, 0.72) * mix(0.86, 1.06, sunFacing) + vec3(0.052, 0.032, 0.004) * sunFacing;

  // Night: moon-facing sails glow crisp cool silver-blue; shadow-side jibs & lower curves sink into velvety indigo!
  float sMoonLit = (0.34 + 0.66 * moonFacing) * mix(0.62, 1.18, moonVis);
  vec3 sailNgt = s.rgb * (vec3(0.46, 0.60, 0.84) * sMoonLit + vec3(0.075, 0.125, 0.235));

  // Silky 1-tap moonlight silver rim strictly along solid edges facing moonPos (zero aliased stairstep!)
  if (night > 0.02) {
    vec2 rimUv = clamp(sUV + toMoonLocal * 0.0046, 0.0, 1.0);
    float rawRim = clamp(s.a - texture(sailsTex, rimUv).a, 0.0, 1.0);
    float sRim = ss(0.16, 0.88, rawRim) * ss(0.55, 0.96, s.a);
    sailNgt += vec3(0.54, 0.72, 0.96) * sRim * (0.35 + 0.65 * moonFacing) * moonVis;
    // Warm amber stern-lantern upward glow kissing the underside of the lower mizzen & spanker sails!
    if (isGalleon > 0.5) {
      vec2 dLan = (uv - vec2(0.82, 0.58)) / vec2(0.18, 0.16);
      float sailWarm = exp(-dot(dLan, dLan)) * 0.36;
      sailNgt += vec3(0.92, 0.56, 0.18) * sailWarm;
    }
  }

  vec3 sCol = moodMix(sailDay, sailSun, sailNgt, sunset, night);

  // 4. Dynamic 3D cloth-fold normal shading synchronized with the moving wave slope & active light direction!
  float ampVis = min(1.30, windAmp);
  float foldSlope = (cos(w1Arg) * 0.62 + cos(w2Arg) * 0.22 + cos(luffArg) * 0.22 * edgeFl) * clothW * ampVis;
  float bellyLift = (gust - 0.5) * clothW * 0.14 * ampVis;
  float crest  = max(0.0, foldSlope) * 0.85 + max(0.0, bellyLift);
  float trough = max(0.0, -foldSlope);

  vec3 crestCol   = moodMix(vec3(0.11, 0.10, 0.08), vec3(0.145, 0.105, 0.038), vec3(0.095, 0.135, 0.195) * (0.45 + 0.55 * moonFacing) * moonVis, sunset, night);
  vec3 troughTint = moodMix(vec3(0.84, 0.87, 0.93), vec3(0.80, 0.77, 0.86), vec3(0.68, 0.76, 0.90), sunset, night);
  sCol += crestCol * crest;
  sCol *= mix(vec3(1.0), troughTint, clamp(trough * 0.44, 0.0, 0.36));

  return vec4(sCol, s.a);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 cssRes = max(vec2(1.0), uRes / uDpr);
  float nx = p.x / cssRes.x;
  float ny = p.y / cssRes.y;
  float wt = uWindTime;
  float sunset = clamp(uSunset, 0.0, 1.0);
  float night  = clamp(uNight,  0.0, 1.0);
  float dayAmt = max(0.0, 1.0 - sunset - night);
  float cDense = clamp(uCloudSea, 0.2, 1.0);

  vec2 gp = floor(p * (0.80 * max(uDpr, 1.0)));
  float g1 = hash2(gp + 0.5);

  vec2 moonPos = vec2(cssRes.x * 0.80, cssRes.y * 0.145);
  float mRad = clamp(min(cssRes.x, cssRes.y) * 0.048, 22.0, 44.0);
  float moonOcc = clamp(uMoonOcc, 0.0, 1.0);
  float moonVis = clamp(uMoonVis, 0.20, 1.0);
  vec2 mp = p - moonPos;
  float dMoon = length(mp);
  vec2 toMoon = (moonPos - p) / max(dMoon, 1.0);
  // Broad physical radial moonlight falloff across the entire sky & cloud sea
  float moonFalloff = 0.40 + 0.60 * exp(-dMoon / (cssRes.x * 0.62));
  // Single-Source-of-Truth cloud directional light vector (Day: upper-right sun, Sunset: low right horizon, Night: exact radial Moon!)
  vec2 cloudLightStep = moodMix2(vec2(0.20, -0.22), vec2(0.22, 0.16), toMoon * 0.26, sunset, night);

  // =========================================================================
  // 1. STRATOSPHERIC COBALT SKY, TWILIGHT/COSMIC STARS & FULL MOON
  // =========================================================================
  vec3 skyTopDay = vec3(0.145, 0.455, 0.785);
  vec3 skyBotDay = vec3(0.595, 0.815, 0.945);

  // Iconic twilight cerulean-cobalt zenith warming smoothly toward golden horizon (matches reference painting!)
  vec3 skyTopSun = vec3(0.105, 0.305, 0.585);
  vec3 skyBotSun = vec3(0.305, 0.535, 0.765);

  // Deep velvety cosmic night zenith on the dark side -> broad Rayleigh lunar scatter dome around Moon!
  vec3 skyTopNgt = vec3(0.015, 0.036, 0.095) * mix(0.88, 1.08, moonVis);
  vec3 skyBotNgt = vec3(0.058, 0.118, 0.238) * mix(0.82, 1.14, moonVis);

  vec3 skyTop = moodMix(skyTopDay, skyTopSun, skyTopNgt, sunset, night);
  vec3 skyBot = moodMix(skyBotDay, skyBotSun, skyBotNgt, sunset, night);
  vec3 col = mix(skyTop, skyBot, pow(clamp(ny + (g1 - 0.5) * 0.025, 0.0001, 1.0), 0.86));

  // Broad atmospheric Rayleigh/aerosol lunar dome scatter centered at moonPos at Night
  if (night > 0.01) {
    float moonDome = exp(-dMoon / (cssRes.x * 0.42)) * (0.55 + 0.45 * moonVis);
    col += vec3(0.095, 0.175, 0.305) * moonDome * 0.68 * night;
  }

  // Warm golden-apricot atmospheric glow radiating upward behind the cloud sea at Sunset
  if (sunset > 0.01) {
    float horGlow = exp(-sq((ny - 0.74) / 0.34)) * exp(-sq((nx - 0.55) / 0.68));
    col += vec3(0.78, 0.48, 0.26) * horGlow * 0.36 * sunset;
  }

  // Multi-tier twinkling starfield (delicate early stars in Sunset cerulean sky + rich cosmos at Night!)
  float starAmt = clamp(night + sunset * 0.82, 0.0, 1.0);
  if (starAmt > 0.02) {
    float glareMask = night > 0.02 ? ss(mRad * 1.6, mRad * 5.2, dMoon) : 1.0;
    // Layer A: primary crisp stars (vivid in dark cosmic zenith, naturally drowned near Moon glare!)
    vec2 sC1 = floor(p / 24.0);
    vec2 sU1 = fract(p / 24.0) - 0.5;
    float sh1 = hash2(sC1 + 19.3);
    if (sh1 > mix(0.72, 0.60, night)) {
      vec2 so = (vec2(hash2(sC1 + 5.7), hash2(sC1 + 41.2)) - 0.5) * 0.66;
      float sd = length(sU1 - so);
      float tw = 0.54 + 0.46 * sin(uTime * (1.7 + sh1 * 2.4) + sh1 * 50.0);
      float vertFade = 1.0 - ss(0.46, 0.90, ny) * (1.0 - night * 0.45);
      float sb = (1.0 - ss(0.022, 0.082, sd)) * tw * vertFade * glareMask * starAmt;
      col = mix(col, vec3(0.96, 0.98, 1.00), sb * 0.90);
    }
    // Layer B: fine cosmic stardust specks in upper sky
    vec2 sC2 = floor((p + vec2(11.0, 7.0)) / 14.0);
    vec2 sU2 = fract((p + vec2(11.0, 7.0)) / 14.0) - 0.5;
    float sh2 = hash2(sC2 + 83.1);
    if (sh2 > 0.81) {
      vec2 so2 = (vec2(hash2(sC2 + 31.4), hash2(sC2 + 61.9)) - 0.5) * 0.62;
      float sd2 = length(sU2 - so2);
      float tw2 = 0.50 + 0.50 * sin(uTime * (2.2 + sh2 * 2.0) + sh2 * 37.0);
      float sb2 = (1.0 - ss(0.018, 0.068, sd2)) * tw2 * (1.0 - ss(0.35, 0.72, ny)) * glareMask * starAmt;
      col = mix(col, vec3(0.90, 0.95, 1.00), sb2 * 0.58);
    }
  }

  // Real NASA-grade Near-Side Lunar Surface (uMoonTex) + 3D Spherical Phase + Earthshine + directional halo!
  if (night > 0.02) {
    float moonTheta = uMoonPhase * 6.2831853;
    float moonIllum = 0.5 - 0.5 * cos(moonTheta);
    float phaseGlow = mix(0.18, 1.0, pow(max(0.0001, moonIllum), 0.65));
    vec2 mLocal = mp / max(1.0, mRad);
    float rN = length(mLocal);
    vec2 rotM = vec2(mLocal.x * 0.97 + mLocal.y * 0.24, -mLocal.x * 0.24 + mLocal.y * 0.97);
    float lx = sin(moonTheta);
    float lz = -cos(moonTheta);
    float dOuter = dMoon - mRad;
    float disc = ss(1.5, -1.2, dOuter);

    float limbDir = mix(clamp(0.55 + 0.45 * (rotM.x / max(0.25, rN)) * lx, 0.18, 1.0), 1.0, moonIllum);
    vec3 skyBeforeMoon = col;
    float aureole = exp(-max(dOuter, 0.0) / (mRad * 1.15)) * (0.48 + 0.34 * moonVis) * phaseGlow * limbDir;
    float corona  = exp(-max(dOuter, 0.0) / (mRad * 4.40)) * (0.20 + 0.16 * moonVis) * phaseGlow;
    float iceHalo = exp(-sq((dMoon - mRad * 2.85) / (mRad * 0.72))) * (0.04 + 0.18 * moonOcc) * phaseGlow;
    col += vec3(0.95, 0.94, 0.86) * aureole * 0.46 * night;
    col += vec3(0.52, 0.72, 0.96) * corona  * 0.74 * night;
    col += vec3(0.74, 0.86, 0.98) * iceHalo * night;

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
      vec3 earthshine = skyBeforeMoon * 0.88 + mTex.rgb * vec3(0.060, 0.086, 0.132) + vec3(0.008, 0.015, 0.032);
      vec3 moonCol = mix(earthshine, moonLitCol, litPhase);
      col = mix(col, moonCol, disc * night * 0.99);
    }
  }

  // Poetic Makoto Shinkai / Studio Ghibli Shooting Stars streaking behind the clouds & sails!
  if (uShowMeteors > 0.5 && (night + sunset) > 0.04) {
    col += shootingStars(p, cssRes, uTime, sunset, night, moonPos, mRad);
  }

  // Cloud Sea 3-stop painterly palette (Day: sunlit ivory; Sunset: apricot-gold vs indigo; Night: silver-blue vs Prussian shadow!)
  vec3 cLit = moodMix(vec3(0.992, 0.992, 0.972), vec3(1.000, 0.875, 0.565), vec3(0.56, 0.73, 0.93) * mix(0.66, 1.18, moonVis), sunset, night);
  vec3 cMid = moodMix(vec3(0.840, 0.900, 0.950), vec3(0.905, 0.645, 0.485), vec3(0.18, 0.29, 0.47) * mix(0.72, 1.12, moonVis), sunset, night);
  vec3 cShd = moodMix(vec3(0.610, 0.735, 0.880), vec3(0.280, 0.385, 0.585), vec3(0.045, 0.085, 0.185) * mix(0.78, 1.06, moonVis), sunset, night);

  // =========================================================================
  // 2. TOWERING BACKGROUND CUMULUS RIDGES + SOLAR / LUNAR CREPUSCULAR RAYS
  // =========================================================================
  float rightCenterY = mix(0.56, 0.62, night) - (nx - 0.50) * 0.64;
  float rightWall  = ss(0.42, 0.96, nx) * exp(-sq((ny - rightCenterY) / 0.34));
  float leftBank   = (1.0 - ss(0.16, 0.54, nx)) * exp(-sq((ny - 0.34) / 0.28));
  float lowHorizon = ss(0.45, 0.95, ny) * 0.86;
  float covBack = clamp((rightWall * 0.96 + leftBank * 0.84 + lowHorizon * 0.74) * (0.45 + 0.68 * cDense), 0.0, 0.96);

  vec2 bc = ghibliCloudSea(p, 325.0, 215.0, wt * 14.5, covBack, cloudLightStep);
  if (bc.x > 0.004) {
    float litWeight = ss(0.44, 0.95, bc.y) * mix(1.0, moonFalloff, night);
    vec3 bCol = mix(cShd, cMid, ss(0.08, 0.62, bc.y));
    bCol = mix(bCol, cLit, litWeight);
    // Physical Mie Forward Scattering at Night: thick cloud belly stays moody silhouette while thin rim blazes silver!
    if (night > 0.02) {
      float prox = exp(-dMoon / (mRad * 4.2));
      float thinEdge = bc.x * (1.0 - bc.x) * 4.0;
      float silverRim = clamp(prox * (thinEdge * 1.15 + ss(0.58, 0.96, bc.y) * 0.45), 0.0, 1.0);
      bCol = mix(bCol, vec3(0.96, 0.98, 1.00), silverRim * 0.82 * night);
      bCol += vec3(0.76, 0.89, 1.00) * prox * thinEdge * 0.54 * night;
    }
    col = mix(col, bCol, bc.x * 0.96);
  }

  // Velvety parallel-diagonal solar god-rays at Day/Sunset (from off-screen upper-right)
  if ((sunset + dayAmt) > 0.04) {
    vec2 rayOrig = vec2(cssRes.x * 1.24, -cssRes.y * 0.32);
    vec2 toR = p - rayOrig;
    vec2 rDir = normalize(vec2(-0.56, 0.83));
    float rPerp  = dot(toR, vec2(-rDir.y, rDir.x));
    float warpR  = N(p * 0.25 + vec2(-wt * 2.2, 0.0), 480.0).r * 3.2;
    float bands  = 0.52 + 0.28 * sin(rPerp * 0.022 + warpR) + 0.20 * sin(rPerp * 0.049 - wt * 0.14 + 1.4);
    float envR   = ss(0.46, 0.78, nx) * ss(0.04, 0.28, ny) * (1.0 - ss(0.65, 1.02, ny));
    float shaft  = envR * clamp(bands, 0.0, 1.0) * (0.55 + 0.45 * (1.0 - bc.x * 0.45));
    vec3 rayCol  = mix(vec3(1.00, 0.96, 0.86), vec3(1.00, 0.82, 0.52), sunset);
    col += rayCol * shaft * (0.145 * sunset + 0.095 * dayAmt);
  }

  // Soft radial Lunar Crepuscular Rays streaming cleanly outward from moonPos across the starry cloud sea at Night!
  if (night > 0.04) {
    float angM = atan(mp.y, mp.x + 0.001);
    float warpM = N(p * 0.22 + vec2(-wt * 1.6, 0.0), 520.0).r * 2.4;
    float lBands = 0.50 + 0.30 * sin(angM * 11.0 + warpM) + 0.20 * sin(angM * 21.0 - wt * 0.12 - 0.8);
    float angMask = ss(0.95, 1.45, angM) * (1.0 - ss(2.55, 3.05, angM));
    float radMask = ss(mRad * 1.1, mRad * 2.8, dMoon) * exp(-dMoon / (cssRes.x * 0.68));
    float lShaft = angMask * radMask * clamp(lBands, 0.0, 1.0) * (0.45 + 0.55 * (1.0 - bc.x * 0.55)) * moonVis;
    col += vec3(0.62, 0.80, 1.00) * lShaft * 0.16 * night;
  }

  // Distant tiny soaring white birds gliding gracefully through the right sunlit sky gap
  float dBirds = distantSkyBirds(p, cssRes, uTime);
  if (dBirds > 0.01) {
    vec3 bBirdCol = moodMix(vec3(0.98, 0.98, 0.96), vec3(1.00, 0.91, 0.74), vec3(0.68, 0.80, 0.94), sunset, night);
    col = mix(col, bBirdCol, dBirds * 0.82);
  }

  // =========================================================================
  // 3. HERO ROYAL SKY-GALLEON (WINGED PROW, AERIAL FIN + 11 BILLOWING SAILS!)
  // =========================================================================
  float windAmp = ss(0.0, 0.22, uWindSpeed) * clamp(0.28 + uWindSpeed * 0.72, 0.0, 1.75);
  vec2 sternPos = vec2(uGalleonRect.x + uGalleonRect.z * 0.86, uGalleonRect.y + uGalleonRect.w * 0.70);
  if (uGalleonReady > 0.5 && uGalleonRect.z > 1.0) {
    // Rotate sample coordinates softly around ship center for buoyant aerodynamic pitch sway
    vec2 gCenter = uGalleonRect.xy + uGalleonRect.zw * 0.5;
    vec2 relG = p - gCenter;
    float ca = cos(-uGalleonTilt.x), sa = sin(-uGalleonTilt.x);
    vec2 rotG = vec2(relG.x * ca - relG.y * sa, relG.x * sa + relG.y * ca);
    vec2 gUV = (rotG + uGalleonRect.zw * 0.5) / uGalleonRect.zw;

    if (gUV.x >= -0.04 && gUV.x <= 1.04 && gUV.y >= -0.04 && gUV.y <= 1.04) {
      // Transform world-space toMoon direction into ship's rotated local UV frame
      vec2 toMoonG = normalize(vec2(toMoon.x * ca - toMoon.y * sa, toMoon.x * sa + toMoon.y * ca));
      float lanFlick = 0.91 + 0.09 * sin(uTime * 3.8 + p.x * 0.07);

      // Layer 3A: Royal Rigid Timber Hull, Winged Figurehead, Aerial Fin, Slender Masts & Yardarms
      if (gUV.x >= 0.0 && gUV.x <= 1.0 && gUV.y >= 0.0 && gUV.y <= 1.0) {
        vec4 hull = texture(uGalleonHullTex, gUV);
        if (hull.a > 0.005) {
          // Detect glowing amber captain's stern gallery glass panes & two upper brass stern lanterns!
          float amberWin = ss(0.18, 0.42, hull.r - hull.b) * ss(0.55, 0.84, hull.r) * ss(0.56, 0.64, gUV.y) * ss(0.79, 0.83, gUV.x);
          float hMoonFace = ss(-0.85, 0.85, dot((gUV - 0.5) * 2.0, toMoonG));
          float keelShade = 1.0 - ss(0.74, 0.94, gUV.y) * 0.52;

          vec3 hullDay = hull.rgb * vec3(0.96, 0.99, 1.04);
          // Sunset: rich rosewood-violet atmospheric bounce melting seamlessly into golden-indigo clouds!
          vec3 hullSun = hull.rgb * vec3(0.84, 0.64, 0.74) + vec3(0.032, 0.018, 0.048);

          // Night: deep shaded keel vs cool silver-moonlit top decks/masts + crisp 1-tap silver rim light!
          float hLitNgt = (0.30 + 0.70 * hMoonFace) * keelShade * mix(0.64, 1.12, moonVis);
          vec3 hullNgt = hull.rgb * (vec3(0.24, 0.34, 0.56) * hLitNgt + vec3(0.068, 0.108, 0.200)) + vec3(0.008, 0.016, 0.038);
          if (night > 0.02) {
            float rawHRim = clamp(hull.a - texture(uGalleonHullTex, clamp(gUV + toMoonG * 0.0040, 0.0, 1.0)).a, 0.0, 1.0);
            float hRim = ss(0.24, 0.92, rawHRim) * ss(0.72, 0.98, hull.a);
            hullNgt += vec3(0.42, 0.60, 0.88) * hRim * (0.38 + 0.62 * hMoonFace) * moonVis;
            // Warm amber light spill from captain's stern gallery & twin brass stern lanterns onto carved timber & aerial fin!
            vec2 dGal = (gUV - vec2(0.86, 0.69)) / vec2(0.11, 0.10);
            vec2 dLanT = (gUV - vec2(0.86, 0.60)) / vec2(0.09, 0.06);
            float warmSpill = exp(-dot(dGal, dGal)) * 0.68 + exp(-dot(dLanT, dLanT)) * 0.36;
            hullNgt += vec3(0.92, 0.56, 0.18) * warmSpill * (0.40 + 0.60 * hull.r) * lanFlick;
          }

          vec3 hullCol = moodMix(hullDay, hullSun, hullNgt, sunset, night);

          // Flickering warm captain's stern gallery & twin stern lanterns at Sunset & Night
          vec3 winGlow = vec3(1.24, 0.88, 0.36) * lanFlick;
          hullCol = mix(hullCol, winGlow, amberWin * max(sunset * 0.85, night * 0.98));

          // Soft atmospheric cloud-mist bounce & gentle edge integration hugging the lower keel belly!
          float keelMist = ss(0.80, 0.95, gUV.y);
          vec3 mistCol = mix(cMid, cLit, 0.26 + 0.24 * sunset);
          hullCol = mix(hullCol, mistCol, keelMist * 0.44);
          float keelFade = hull.a * (1.0 - ss(0.91, 0.97, gUV.y) * 0.30);
          col = mix(col, hullCol, keelFade);
        }
      }

      // Layer 3B: Aerodynamic GPU Billowing Canvas Sails (pinned strictly to yardarms, moonlit & 3D cloth-fold shaded!)
      vec4 sails = evalBillowingSails(
        gUV, uGalleonSailsTex, uGalleonSailMap,
        wt, windAmp, 0.0, 1.0,
        sunset, night, moonVis, toMoonG, 1.0
      );
      if (sails.a > 0.005) {
        col = mix(col, sails.rgb, sails.a);
      }

      // Live soft golden lantern halos blooming around the captain's gallery & twin stern brass lanterns!
      if ((sunset + night) > 0.04) {
        vec2 dL1 = (gUV - vec2(0.898, 0.592)) / vec2(0.036, 0.048);
        vec2 dL2 = (gUV - vec2(0.825, 0.602)) / vec2(0.032, 0.042);
        vec2 dCG = (gUV - vec2(0.860, 0.692)) / vec2(0.068, 0.062);
        float lanAura = (exp(-dot(dL1, dL1)) * 0.72 + exp(-dot(dL2, dL2)) * 0.54 + exp(-dot(dCG, dCG)) * 0.58) * lanFlick;
        col += vec3(1.05, 0.70, 0.26) * lanAura * (0.26 * sunset + 0.52 * night);
      }
    }
  }

  // =========================================================================
  // 4. FOREGROUND BILLOWING CLOUD SEA (WRAPS OVER GALLEON KEEL!) + ICON CLOUDS
  // =========================================================================
  // Sculpted wave crest rises gracefully right across the ship's keel so it plows THROUGH the clouds!
  float keelWave = 0.625 - 0.055 * sin(nx * 5.2 + 0.55) - 0.145 * ss(0.60, 1.00, nx) - 0.075 * (1.0 - ss(0.0, 0.26, nx));
  float covFg = clamp(ss(keelWave - 0.11, keelWave + 0.17, ny) * (0.55 + 0.50 * cDense), 0.0, 0.96);

  vec2 fc = ghibliCloudSea(p, 265.0, 170.0, wt * 26.5, covFg, cloudLightStep);
  if (fc.x > 0.004) {
    float fgLitW = ss(0.42, 0.94, fc.y) * mix(1.0, moonFalloff, night);
    vec3 fCol = mix(cShd, cMid, ss(0.08, 0.60, fc.y));
    fCol = mix(fCol, cLit, fgLitW);
    if (night > 0.02) {
      // Silvery moonlight crest catch-light along foreground cloud wave tops facing moonPos!
      float fgThin = fc.x * (1.0 - fc.x) * 3.6;
      fCol += vec3(0.66, 0.82, 1.00) * fgThin * moonFalloff * 0.30 * moonVis * night;
      // Soft physical cast shadow of the giant flying galleon onto the cloud sea to the lower-left (away from Moon!)
      if (uGalleonRect.z > 1.0) {
        vec2 shCen = vec2(uGalleonRect.x + uGalleonRect.z * 0.36, uGalleonRect.y + uGalleonRect.w * 0.95);
        vec2 dSh = (p - shCen) / vec2(uGalleonRect.z * 0.38, uGalleonRect.w * 0.18);
        float galShadow = exp(-dot(dSh, dSh)) * 0.44 * moonVis * night;
        fCol *= (1.0 - galShadow);
      }
    }
    // Warm golden stern-lantern bounce illuminating the swirling clouds right beneath the galleon's stern!
    vec2 dStern = (p - sternPos) / vec2(110.0, 62.0);
    float sternGlow = exp(-dot(dStern, dStern));
    fCol += vec3(1.04, 0.66, 0.24) * sternGlow * (0.24 * sunset + 0.46 * night);
    col = mix(col, fCol, fc.x * 0.96);
  }

  // Adaptive soft sunlit/moonlit billowing cloud cushions cradling desktop icons!
  if (uAdaptive >= 0.5) {
    float sdf = fieldS(p);
    float icWarp = (N(p - vec2(wt * 12.0, 0.0), 190.0).g - 0.5) * 18.0;
    float icMask = ss(12.0, -18.0, sdf + icWarp);
    if (icMask > 0.004) {
      vec2 icOff = cloudLightStep * 75.0;
      float icLit = ss(0.28, 0.78, N(p - vec2(wt * 12.0, 0.0) + icOff, 210.0).r) * mix(1.0, moonFalloff, night);
      vec3 icCol = mix(cMid, cLit, 0.36 + 0.64 * icLit);
      col = mix(col, icCol, icMask * 0.76);
    }
  }

  // =========================================================================
  // 4B. COMPANION ESCORT SKY-SKIFF (RIGID TIMBER + GPU BILLOWING WINGED SAILS!)
  // =========================================================================
  if (uShowEscort > 0.5 && uSkiffReady > 0.5 && uSkiffRect.z > 1.0) {
    vec2 sCenter = uSkiffRect.xy + uSkiffRect.zw * 0.5;
    vec2 relS = p - sCenter;
    float cs = cos(-uSkiffTilt.x), ssR = sin(-uSkiffTilt.x);
    vec2 rotS = vec2(relS.x * cs - relS.y * ssR, relS.x * ssR + relS.y * cs);
    vec2 sUV = (rotS + uSkiffRect.zw * 0.5) / uSkiffRect.zw;

    if (sUV.x >= -0.04 && sUV.x <= 1.04 && sUV.y >= -0.04 && sUV.y <= 1.04) {
      vec2 toMoonS = normalize(vec2(toMoon.x * cs - toMoon.y * ssR, toMoon.x * ssR + toMoon.y * cs));

      if (sUV.x >= 0.0 && sUV.x <= 1.0 && sUV.y >= 0.0 && sUV.y <= 1.0) {
        vec4 sHull = texture(uSkiffHullTex, sUV);
        if (sHull.a > 0.005) {
          float sMoonFace = ss(-0.85, 0.85, dot((sUV - 0.5) * 2.0, toMoonS));
          float sKeelSh   = 1.0 - ss(0.74, 0.95, sUV.y) * 0.50;
          vec3 shDay = sHull.rgb;
          vec3 shSun = sHull.rgb * vec3(0.84, 0.66, 0.68) + vec3(0.025, 0.012, 0.024);
          float shLitN = (0.30 + 0.70 * sMoonFace) * sKeelSh * mix(0.66, 1.14, moonVis);
          vec3 shNgt = sHull.rgb * (vec3(0.24, 0.34, 0.56) * shLitN + vec3(0.06, 0.10, 0.19)) + vec3(0.008, 0.016, 0.036);
          if (night > 0.02) {
            float shRim = clamp(sHull.a - texture(uSkiffHullTex, clamp(sUV + toMoonS * 0.007, 0.0, 1.0)).a, 0.0, 1.0);
            shNgt += vec3(0.56, 0.74, 0.98) * shRim * (0.40 + 0.60 * sMoonFace) * moonVis;
          }
          col = mix(col, moodMix(shDay, shSun, shNgt, sunset, night), sHull.a);
        }
      }

      vec4 sSails = evalBillowingSails(
        sUV, uSkiffSailsTex, uSkiffSailMap,
        wt, windAmp, 2.35, 1.25,
        sunset, night, moonVis, toMoonS, 0.0
      );
      if (sSails.a > 0.005) {
        col = mix(col, sSails.rgb, sSails.a);
      }
    }
  }

  // =========================================================================
  // 5. FOREGROUND FLEET OVERLAY (WINGED GLIDER & CLOUD WAKE)
  // =========================================================================
  vec2 screenUV = p / cssRes;
  vec4 fg = texture(uFgTex, screenUV);
  if (fg.a > 0.005) {
    float isSolid = ss(0.36, 0.85, fg.a);
    float isMist  = 1.0 - isSolid;
    vec3 fgDay = fg.rgb;
    vec3 fgSun = mix(
      mix(cMid, cLit, 0.65),
      fg.rgb * vec3(1.04, 0.88, 0.68) + vec3(0.03, 0.015, 0.0),
      isSolid
    );
    vec3 fgNgt = mix(
      mix(cShd, cLit, 0.45),
      fg.rgb * vec3(0.48, 0.62, 0.82) * mix(0.70, 1.15, moonVis) + vec3(0.012, 0.022, 0.048),
      isSolid
    );

    // Subtle 1-tap sun/moon rim light strictly along solid foreground vessel edges facing the light source!
    if ((sunset > 0.02 || night > 0.02) && isSolid > 0.1) {
      vec2 rimStep = night > sunset
        ? toMoon * (2.4 / cssRes)
        : vec2(1.4 / cssRes.x, -1.6 / cssRes.y);
      float rim = clamp(fg.a - texture(uFgTex, clamp(screenUV + rimStep, 0.0, 1.0)).a, 0.0, 1.0) * isSolid;
      fgSun += vec3(0.42, 0.28, 0.08) * rim;
      fgNgt += vec3(0.56, 0.74, 0.98) * rim * moonFalloff * moonVis;
    }

    vec3 fgCol = moodMix(fgDay, fgSun, fgNgt, sunset, night);
    // Preserve warm silhouette contrast on mist wake puffs
    fgCol = mix(fgCol, cLit, isMist * 0.25 * dayAmt);
    col = mix(col, fgCol, fg.a);
  }

  // Delicate sunlit golden sky motes / cosmic stardust floating in the breeze
  float moteAmt = clamp(sunset * 0.85 + dayAmt * 0.40 + night * 0.45, 0.0, 1.0);
  if (moteAmt > 0.04) {
    float motes = skyMotes(p, wt, moteAmt);
    vec3 mCol = moodMix(vec3(1.00, 0.99, 0.92), vec3(1.00, 0.86, 0.54), vec3(0.80, 0.92, 1.00), sunset, night);
    col += mCol * motes;
  }

  // Unified stationary hand-painted gouache paper grain across ENTIRE canvas (zero plastic overlay!)
  col *= 1.0 + (g1 - 0.5) * mix(0.038, 0.048, max(night, sunset * 0.5));

  // Photographic filmic highlight rolloff (warm butter-cream at Day/Sunset, pure pearl-silver at Night — ZERO clipping!)
  vec3 cSafe = max(col, vec3(0.0));
  float fLum = dot(cSafe, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = cSafe / (1.0 + max(0.0, fLum - 0.72) * 0.62);
  vec3 hiTarget = mix(vec3(1.00, 0.97, 0.91), vec3(0.96, 0.98, 1.00), night);
  mapped = mix(mapped, hiTarget, ss(0.75, 1.65, fLum) * 0.38);

  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}`;
