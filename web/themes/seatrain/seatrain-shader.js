/**
 * Theme #5: Sea Railway ("Chuyến tàu trên Biển Gương") — Spirited Away Tracking-Camera WebGL2 Shader
 * Physically Coherent Lighting & 100% Hand-Painted Studio Ghibli Pipeline:
 *   1. Unified directional light physics (Full Moon upper-right at Night, low golden sun at Sunset,
 *      high summer sun at Day) driving cloud Beer-Lambert silver-lining, cirrus Mie scatter, ocean specular path & rim lights
 *   2. Seamless 4:1 hand-painted cumulus panorama (uCloudsTex) re-lit dynamically from the true light vector
 *   3. Hand-painted Flooded Sixth Station (uStationTex) & Lonely Grassy Island (uIslandTex) with warm glowing windows/lanterns
 *   4. Hero 2-Car Sea Train (uTrainTex + uTrainWinTex) with warm cabin spill onto waterline spray, delicate headlight water glint,
 *      and horizontally flipped real hand-painted passing silhouette train
 *   5. Real-time Fresnel mirror ocean + physically accurate shimmering Moonbeam / Sun Glitter Path + true 3D projective glints
 *   6. Refined Adaptive Desktop Icons: silky light-reactive atmospheric halo + floating Ghibli spirit fireflies above horizon,
 *      and moonlight/sunlit concentric water ripples below horizon (zero plastic sponge blobs!)
 */
export const SEATRAIN_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform sampler2D uTrainTex;
uniform sampler2D uTrainWinTex;
uniform sampler2D uStationTex;
uniform sampler2D uIslandTex;
uniform sampler2D uCloudsTex;

uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uStep;
uniform float uDpr;
uniform float uMix;
uniform float uTime;
uniform float uWindTime;
uniform float uWorldScroll; // Smoothly increasing Left -> Right tracking-camera world travel
uniform float uAdaptive;
uniform float uClouds;      // 0.25..1.0 cumulus cloud scale & prominence
uniform float uRipple;      // 0.0..1.0 mirror sea ripple intensity (lower = pure glass mirror)
uniform float uSunset;      // 0..1 golden sunset ("Hoàng hôn chiều tà" — signature default!)
uniform float uNight;       // 0..1 starlit galaxy night ("Đêm ngân hà")
uniform float uTrainReady;
uniform float uStationReady;
uniform float uIslandReady;
uniform float uCloudsReady;
uniform float uWake;        // 0..1 water splash & wake intensity
uniform float uShowStation; // 0 or 1 flooded sixth station
uniform float uShowIsland;  // 0 or 1 lonely grassy island cottage & tree
uniform float uSeed;

uniform vec4 uTrainRect;    // x, y, w, h in CSS px
uniform vec4 uStationRect;  // x, y, w, h in CSS px
uniform vec4 uIslandRect;   // x, y, w, h in CSS px
uniform vec4 uPassRect;     // x, y, w, h in CSS px (z <= 0 hides foreground passing silhouette train)

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

// Unified celestial light position so clouds, moon/sun halo, icon auras & ocean glitter share 100% consistent physics!
vec2 primaryLightPos(vec2 cssRes, float horizonY, float sunset, float night) {
  vec2 dayPos = vec2(cssRes.x * 0.28, horizonY * 0.14);
  vec2 sunPos = vec2(cssRes.x * 0.34, horizonY * 0.86);
  vec2 ngtPos = vec2(cssRes.x * 0.80, horizonY * 0.20);
  float dayW = max(0.0, 1.0 - sunset - night);
  float sumW = max(0.001, dayW + sunset + night);
  return (dayPos * dayW + sunPos * sunset + ngtPos * night) / sumW;
}

// Wide, wind-sheared silky high-altitude cirrus wisps (strictly horizontal strata, zero vertical smudges!)
vec2 highCirrusLayer(vec2 p, float scrollPx, float coverage) {
  if (coverage <= 0.015) return vec2(0.0);
  vec2 q = vec2(p.x - scrollPx, p.y) * vec2(1.0 / 560.0, 1.0 / 78.0);
  vec4 n1 = N(q * 42.0, 256.0);
  vec2 warp = vec2((n1.r - 0.5) * 0.22, (n1.a - 0.5) * 0.07);
  vec4 n2 = N((q + warp) * 92.0 + vec2(37.0, 19.0), 256.0);
  float shape = ss(0.28, 0.80, n1.r * 0.58 + n2.r * 0.28 + n2.g * 0.14);
  float thresh = 1.0 - coverage;
  float alpha = ss(thresh - 0.08, thresh + 0.12, shape);
  if (alpha <= 0.004) return vec2(0.0);
  float density = ss(thresh, thresh + 0.32, shape);
  return vec2(alpha, density);
}

// Poetic Makoto Shinkai / Ghibli shooting stars (Starlit Night + delicate dusk; mirrored in sea!)
vec3 shootingStars(vec2 p, vec2 cssRes, float t, float sunset, float night, vec2 moonPos, float mRad) {
  float visAmt = clamp(night + sunset * 0.14, 0.0, 1.0);
  if (visAmt < 0.03) return vec3(0.0);
  float ny = p.y / max(1.0, cssRes.y);
  if (ny > 0.58) return vec3(0.0);

  vec3 acc = vec3(0.0);
  float vertFade = 1.0 - ss(0.30, 0.56, ny);
  float glareMask = night > 0.02 ? ss(mRad * 1.3, mRad * 3.0, length(p - moonPos)) : 1.0;

  for (int i = 0; i < 3; i++) {
    if (night < 0.25 && i > 0) continue;
    float fi = float(i);
    float period   = (i == 0) ? 7.8  : ((i == 1) ? 12.4 : 17.1);
    float phaseOff = (i == 0) ? 3.2  : ((i == 1) ? 6.8  : 1.5);
    float dur      = (i == 0) ? 0.90 : ((i == 1) ? 0.82 : 0.74);

    float shifted = t + phaseOff;
    float cyc = floor(shifted / period);
    float localT = shifted - cyc * period;
    if (localT > dur) continue;

    float prog = localT / dur;
    float env = ss(0.0, 0.14, prog) * (1.0 - ss(0.60, 1.0, prog));
    if (env <= 0.004) continue;

    float h1 = hash2(vec2(cyc * 19.3 + fi * 31.7, fi * 11.3 + 4.2));
    float h2 = hash2(vec2(cyc * 29.1 + fi * 13.9, fi * 7.7  + 19.8));
    float h3 = hash2(vec2(cyc * 43.7 + fi * 23.1, fi * 19.3 + 8.6));

    vec2 dir = normalize(vec2(-0.84 - (h3 - 0.5) * 0.14, 0.52 + (h3 - 0.5) * 0.12));
    vec2 start = vec2(cssRes.x * (0.22 + h1 * 0.72), cssRes.y * (0.04 + h2 * 0.22));
    float travel = cssRes.x * (0.15 + h2 * 0.13);
    vec2 head = start + dir * (travel * prog * (1.10 - 0.10 * prog));

    float tailLen = travel * (0.46 + 0.15 * h1) * ss(0.0, 0.26, prog) * (1.0 - ss(0.74, 1.0, prog) * 0.42);
    vec2 q = p - head;
    float along = -dot(q, dir);
    float perp  = abs(-q.x * dir.y + q.y * dir.x);
    if (perp > 20.0 || along < -16.0 || along > tailLen + 10.0) continue;

    float tNorm = clamp(along / max(tailLen, 1.0), 0.0, 1.0);
    float wCore = 1.38 * (1.0 - tNorm * 0.78) + 0.22;
    float wGlow = 4.90 * (1.0 - tNorm * 0.72) + 1.00;
    float longFade = ss(-2.2, 2.0, along) * pow(max(0.0001, 1.0 - tNorm), 1.85);

    float core = exp(-sq(perp / wCore)) * longFade;
    float glow = exp(-sq(perp / wGlow)) * longFade * 0.25;
    float dHead = length(q);
    float headGlow = exp(-sq(dHead / 2.0)) * 1.18 + exp(-sq(dHead / 8.0)) * 0.26;

    vec3 cHead = vec3(1.06, 1.03, 0.96);
    vec3 cTail = mix(vec3(0.58, 0.76, 1.00), vec3(1.00, 0.76, 0.48), sunset * (1.0 - night));
    vec3 colS = mix(cHead, cTail, ss(0.05, 0.85, tNorm));
    float bright = ((i == 0) ? 0.90 : ((i == 1) ? 0.72 : 0.58)) * env * visAmt * vertFade * glareMask;
    acc += (colS * (core + glow) + cHead * headGlow) * bright;
  }
  return acc;
}

// Physically re-lights the hand-painted Studio Ghibli cumulus panorama for Day, Sunset, and directional Moonlit Night!
vec3 gradePaintedCloud(
  vec3 rawRgb,
  float alpha,
  vec2 cUV,
  vec2 sp,
  vec2 cssRes,
  float horizonY,
  float periodW,
  float vSpan,
  vec2 moonPos,
  float mRad,
  float sunset,
  float night
) {
  // Subtle chromatic safeguard eliminating any stray green bounce on semi-transparent edges
  vec3 c = rawRgb;
  float maxRB = max(c.r, c.b);
  c.g = min(c.g, mix(maxRB * 1.01, maxRB * 0.96, 1.0 - alpha));

  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float warmMask = clamp((c.r - c.b) * 1.85, 0.0, 1.0);
  float microTex = (c.r - c.g) * 0.18;

  // 1. SUNSET (matches painted upper-left apricot sun + slate-plum shadowed bases!)
  vec3 colSun = c * vec3(1.02, 0.98, 0.97);
  float sunCrown = ss(0.68, 0.94, lum) * warmMask;
  colSun += vec3(0.060, 0.034, 0.008) * sunCrown;

  // 2. DAY (crisp Miyazaki summer sky cumulus — luminous ivory-white upper-left crowns & cerulean undersides!)
  float dayLit = clamp((lum - 0.28) / 0.62, 0.0, 1.0);
  vec3 dayShd = vec3(0.50, 0.63, 0.81);
  vec3 dayMid = vec3(0.82, 0.89, 0.96);
  vec3 dayHi  = vec3(0.995, 0.994, 0.980);
  vec3 colDay = mix(dayShd, dayMid, ss(0.06, 0.52, dayLit));
  colDay = mix(colDay, dayHi, ss(0.44, 0.92, dayLit));
  colDay += vec3(microTex * 0.14, microTex * 0.10, -microTex * 0.08);

  // 3. NIGHT — CONTINUOUS 5-TAP BEER-LAMBERT VOLUMETRIC MOONLIGHT + INTERNAL 3D BILLOW RELIEF!
  //    (Eliminates chunky 16px/42px cartoon contour bands & preserves painted Kazuo Oga cumulus volume!)
  vec3 colNgt = vec3(0.045, 0.075, 0.16);
  if (night > 0.005) {
    vec2 toMoon = moonPos - sp;
    float dMoon = length(toMoon);
    vec2 dirM = toMoon / max(1.0, dMoon);

    // 5 exponentially-spaced directional taps toward the Full Moon -> continuous silky optical depth (ZERO stepped bands!)
    float pxToV = 1.0 / max(1.0, vSpan * horizonY);
    vec2 pxStep = vec2(dirM.x / periodW, dirM.y * pxToV);

    vec4 t1 = texture(uCloudsTex, vec2(cUV.x + pxStep.x * 2.5,  clamp(cUV.y + pxStep.y * 2.5,  0.0, 1.0)));
    vec4 t2 = texture(uCloudsTex, vec2(cUV.x + pxStep.x * 6.5,  clamp(cUV.y + pxStep.y * 6.5,  0.0, 1.0)));
    vec4 t3 = texture(uCloudsTex, vec2(cUV.x + pxStep.x * 13.0, clamp(cUV.y + pxStep.y * 13.0, 0.0, 1.0)));
    vec4 t4 = texture(uCloudsTex, vec2(cUV.x + pxStep.x * 23.0, clamp(cUV.y + pxStep.y * 23.0, 0.0, 1.0)));
    vec4 t5 = texture(uCloudsTex, vec2(cUV.x + pxStep.x * 38.0, clamp(cUV.y + pxStep.y * 38.0, 0.0, 1.0)));

    // Continuous Beer-Lambert optical thickness along line-of-sight toward the Moon
    float tau = t1.a * 0.28 + t2.a * 0.42 + t3.a * 0.62 + t4.a * 0.85 + t5.a * 1.05;
    float transmittance = exp(-tau * 1.15);

    // Razor-fine feathered Mie silver lining strictly on OPAQUE cloud rims facing the Moon (ZERO rim on translucent rain!)
    float solidCloud = ss(0.56, 0.96, alpha);
    float fineEdge = clamp(alpha - (t1.a * 0.55 + t2.a * 0.30 + t3.a * 0.15), 0.0, 1.0) * solidCloud;
    float softRim  = pow(transmittance, 1.65) * solidCloud;

    // Recover continuous 3D internal cumulus puff relief from the hand-painted gouache luminance gradient!
    float lumNear = dot(t2.rgb, vec3(0.299, 0.587, 0.114)) * t2.a;
    float lumMid  = dot(t3.rgb, vec3(0.299, 0.587, 0.114)) * t3.a;
    float internalRelief = clamp((lum - 0.30) / 0.58, 0.0, 1.0);
    float puffFacingMoon = clamp(0.42 + (lum - lumNear) * 2.2 + (lum - lumMid) * 1.1, 0.0, 1.0);

    // Henyey-Greenstein-like distance & angular falloff from the Full Moon
    float maxSpan = max(cssRes.x, cssRes.y);
    float moonReach = exp(-dMoon / (maxSpan * 0.58));
    float moonMie   = exp(-dMoon / (mRad * 7.5));

    // Realistic night-sky aerial perspective & atmospheric airglow (5km-distant clouds are deep slate-indigo, NEVER #040814 black!)
    vec3 ngtShadow = vec3(0.052, 0.084, 0.168);
    vec3 ngtMid    = vec3(0.115, 0.175, 0.308);
    vec3 ngtPuff   = vec3(0.235, 0.342, 0.530);

    // Base internal 3D cumulus volume illuminated softly by starry zenith airglow & painted puff domes!
    float zenithLit = (1.0 - ss(0.12, 0.86, cUV.y)) * 0.45 + internalRelief * 0.55;
    colNgt = mix(ngtShadow, ngtMid, clamp(zenithLit * 0.85, 0.0, 1.0));

    // Soft directional moonlight illuminating Moon-facing internal puffs & smooth translucent outer layers
    float moonDiff = clamp((softRim * 0.62 + puffFacingMoon * internalRelief * 0.52) * (0.28 + 0.82 * moonReach), 0.0, 1.0);
    colNgt = mix(colNgt, ngtPuff, ss(0.12, 0.88, moonDiff));

    // Delicate, feathered, physically-thin silver lining (strictly 2-8px feathered Mie scatter, NEVER a flat 42px grey ribbon!)
    float silverAmt = fineEdge * (0.28 + 0.72 * pow(moonReach, 1.1)) + moonMie * softRim * 0.48;
    colNgt = mix(colNgt, vec3(0.76, 0.86, 0.98), clamp(silverAmt * 0.72, 0.0, 0.78));

    // Translucent falling rain mist (alpha < 0.55) stays soft atmospheric night rain with zero edge highlight
    vec3 rainNight = vec3(0.068, 0.105, 0.205);
    colNgt = mix(rainNight, colNgt, ss(0.25, 0.65, alpha));
  }

  return moodMix(colDay, colSun, colNgt, sunset, night);
}

// Interleaved Gradient Noise (Jimenez) for butter-smooth zero-banding 3D volumetric raymarching
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Clamped triangular wave for crisp, pleated geomagnetic ribbon sheets (Nimitz physical Aurora method)
float tri(float x) {
  return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
}

// Coupled 2D triangular wave — creates authentic folded S-curve Kelvin-Helmholtz aurora curtains!
vec2 tri2(vec2 p) {
  return vec2(tri(p.x + tri(p.y)), tri(p.y + tri(p.x)));
}

// 5-octave domain-warped geomagnetic sheet density in 3D ionosphere horizontal plane (x, z)
// Pure ALU: blazing fast & produces razor-crisp pleated silk folds + fine vertical magnetic rays!
float auroraSheetDensity(vec2 p, float spd, float t) {
  float z = 1.8;
  float z2 = 2.5;
  float rz = 0.0;
  // Rotate by 1.3 rad so folds sweep naturally diagonally across the sky
  p *= mat2(0.2675, 0.9636, -0.9636, 0.2675);
  vec2 bp = p;
  float ang = t * spd;
  float ca = cos(ang), sa = sin(ang);
  mat2 rotT = mat2(ca, sa, -sa, ca);
  const mat2 m2 = mat2(0.95534, 0.29552, -0.29552, 0.95534);

  for (int i = 0; i < 5; i++) {
    vec2 dg = tri2(bp * 1.85) * 0.75;
    dg = rotT * dg;
    p -= dg / z2;

    bp *= 1.30;
    z2 *= 0.45;
    z  *= 0.42;
    p  *= 1.21 + (rz - 1.0) * 0.02;

    rz += tri(p.x + tri(p.y)) * z;
    p = m2 * p;
  }
  return clamp(1.0 / pow(max(0.025, rz * 29.0), 1.3), 0.0, 0.55);
}

// TRUE 3D PERSPECTIVE VOLUMETRIC RAYMARCHED AURORA BOREALIS (EXACT NIMITZ IONOSPHERE RAYMARCH)!
// Visually verified against real Northern Lights photography:
//   - Pierces 32 rising 3D perspective altitude planes along true upward-tilted sky camera rays
//   - Produces razor-real pleated S-curve curtains, bright vertical flame-needle hems & 3D zenith convergence
//   - Broadly amplified near desktop icon constellations without distorting the crisp vertical magnetic rays
//   - Fully transparent additive emission (stars twinkle cleanly through) + live reflection in mirror ocean!
vec3 evalRealAurora3D(
  vec2 sp,
  vec2 cssRes,
  float horizonY,
  float wt,
  float ny,
  vec2 moonPos,
  float mRad,
  float night,
  bool isRefl
) {
  if (night <= 0.015 || ny > 0.94) return vec3(0.0);

  // Soft horizon extinction + gentle breathing room right around the Full Moon disc
  float horFade = 1.0 - ss(0.72, 0.94, ny);
  if (horFade <= 0.004) return vec3(0.0);
  float moonMask = ss(mRad * 1.4, mRad * 5.6, length(sp - moonPos));

  // True 3D upward-tilted wide-angle sky camera ray!
  vec2 ndc = vec2(
    (sp.x - cssRes.x * 0.5) / max(1.0, cssRes.y),
    (horizonY - sp.y) / max(1.0, horizonY)
  );
  vec3 rd = normalize(vec3(ndc.x * 1.12, ndc.y * 0.56 + 0.04, 1.0));

  // Ultra-broad seamless icon-constellation luminance guidance (ZERO visible circular spotlight edge!)
  float iconBoost = 1.0;
  if (uAdaptive >= 0.5) {
    float sCenter = fieldS(sp);
    float sUp     = fieldS(vec2(sp.x, max(4.0, sp.y - 110.0)));
    float sDown   = fieldS(vec2(sp.x, min(horizonY - 4.0, sp.y + 110.0)));
    float sAvg    = (sCenter + sUp + sDown) * 0.3333;
    iconBoost = mix(0.62, 1.22, ss(360.0, -70.0, sAvg));
  }

  float tA = uTime * 0.65 + wt * 0.25 + 12.5;
  float dither = ign(gl_FragCoord.xy);
  int steps = isRefl ? 16 : 32;
  float fSteps = float(steps);
  float stepScale = 50.0 / fSteps;

  vec3 colAcc = vec3(0.0);
  vec3 avgCol = vec3(0.0);

  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    float fi = float(i);
    float s = fi * stepScale; // Equivalent 0..50 altitude slice index
    float frac = fi / fSteps;

    // Exact perspective altitude-plane intersection: tight thin 3D slice produces tall crisp pleated vertical curtains!
    float of = 0.006 * dither * ss(0.0, 15.0, s);
    float pt = (0.80 + pow(s, 1.4) * 0.002) / (rd.y * 2.0 + 0.40);
    pt -= of;
    vec2 bpos = rd.xz * pt + vec2(0.15 - uWorldScroll * 0.035, 5.5 - tA * 0.018);

    float rzt = auroraSheetDensity(bpos, 0.055, tA);

    // Authentic photographed Northern Lights ionospheric spectrum:
    //   - Lower bright curtain hem (~100km, O 557.7nm): luminous warm chartreuse / yellow-emerald green
    //   - Mid vertical curtain: rich natural emerald -> polar jade green
    //   - Upper fading tips (~250km, O 630nm): whisper-soft dusky violet-indigo
    vec3 cHem = vec3(0.42, 0.98, 0.14);
    vec3 cMid = vec3(0.12, 0.74, 0.34);
    vec3 cTop = vec3(0.40, 0.18, 0.56);
    vec3 bandC = mix(cHem, cMid, ss(0.06, 0.44, frac));
    bandC = mix(bandC, cTop, ss(0.56, 1.00, frac));

    vec3 curCol = bandC * rzt;
    avgCol = (i == 0) ? curCol : mix(avgCol, curCol, 0.50);
    colAcc += avgCol * exp(-s * 0.048) * stepScale * 0.065;
  }

  float elevFade = clamp(rd.y * 4.5 - 0.12, 0.0, 1.0);
  // Trim very dim background noise floor so empty starry sky valleys stay pure deep midnight indigo!
  vec3 rawA = max(vec3(0.0), colAcc * 2.45 * iconBoost - vec3(0.018, 0.024, 0.014));
  vec3 aurora = (vec3(1.0) - exp(-rawA * 1.45)) * 0.96;

  return aurora * elevFade * horFade * (0.32 + 0.68 * moonMask) * night;
}

// Delicate floating Ghibli Spirit Fireflies / Golden Stardust Motes drifting organically around sky icons!
float evalIconFireflies(vec2 sp, float sdf, float t, float ny) {
  if (sdf < -22.0 || sdf > 36.0 || ny > 0.92) return 0.0;
  // Ring envelope softly peaking around icon edges & gently inside icon cluster gaps
  float ringEnv = ss(36.0, 4.0, sdf) * ss(-22.0, -4.0, sdf) * (1.0 - ss(0.80, 0.92, ny));
  if (ringEnv <= 0.01) return 0.0;

  float acc = 0.0;
  for (int L = 0; L < 2; L++) {
    float fL = float(L);
    float cellSize = (L == 0) ? 44.0 : 62.0;
    vec2 drift = vec2(t * (L == 0 ? 4.5 : -3.2), -t * (L == 0 ? 5.8 : 4.1));
    vec2 pGrid = sp - drift;
    vec2 cid = floor(pGrid / cellSize);
    vec2 fuv = fract(pGrid / cellSize) - 0.5;

    float h1 = hash2(cid + vec2(17.3 + fL * 41.0, 29.7));
    if (h1 > (L == 0 ? 0.64 : 0.70)) {
      float h2 = hash2(cid + vec2(61.1, 13.7 + fL * 23.0));
      float h3 = hash2(cid + vec2(83.9 + fL * 11.0, 47.2));
      // Organic lazy sinusoidal hover inside cell
      vec2 motePos = vec2(
        (h2 - 0.5) * 0.54 + sin(t * (0.9 + h3 * 0.8) + h1 * 24.0) * 0.14,
        (h3 - 0.5) * 0.54 + cos(t * (0.8 + h2 * 0.7) + h2 * 19.0) * 0.14
      );
      float dPx = length((fuv - motePos) * cellSize);
      float pulse = 0.42 + 0.58 * pow(0.5 + 0.5 * sin(t * (1.6 + h1 * 1.8) + h3 * 31.0), 1.6);
      float core = exp(-sq(dPx / 1.55)) * 1.05;
      float halo = exp(-sq(dPx / 6.20)) * 0.34;
      acc += (core + halo) * pulse * ringEnv;
    }
  }
  return clamp(acc, 0.0, 1.35);
}

// Evaluates the COMPLETE sky dome + seamless hand-painted Ghibli cumulus panorama + cirrus + stars & moon!
// Called BOTH directly (p.y < horizonY) AND optically mirrored (p.y >= horizonY)!
vec3 evalSkyScene(
  vec2 sp,
  vec2 cssRes,
  float horizonY,
  float wt,
  float scrollPx,
  float sunset,
  float night,
  float dayAmt,
  float cDense,
  bool isRefl
) {
  float ny = clamp(sp.y / max(1.0, horizonY), 0.0, 1.0); // 0 = top zenith, 1 = exact mirror waterline

  // 1. Vast Clean Studio Ghibli Sky Gradient
  vec3 skyTopDay = vec3(0.138, 0.458, 0.828);
  vec3 skyMidDay = vec3(0.395, 0.695, 0.920);
  vec3 skyBotDay = vec3(0.748, 0.896, 0.962);

  vec3 skyTopSun = vec3(0.215, 0.368, 0.708);
  vec3 skyMidSun = vec3(0.362, 0.492, 0.762);
  vec3 skyBotSun = vec3(0.790, 0.612, 0.568);

  vec3 skyTopNgt = vec3(0.013, 0.032, 0.096);
  vec3 skyMidNgt = vec3(0.036, 0.076, 0.184);
  vec3 skyBotNgt = vec3(0.094, 0.150, 0.280);

  vec3 skyTop = moodMix(skyTopDay, skyTopSun, skyTopNgt, sunset, night);
  vec3 skyMid = moodMix(skyMidDay, skyMidSun, skyMidNgt, sunset, night);
  vec3 skyBot = moodMix(skyBotDay, skyBotSun, skyBotNgt, sunset, night);

  vec3 col = mix(skyTop, skyMid, ss(0.0, 0.62, ny));
  col = mix(col, skyBot, ss(0.60, 1.0, ny));

  // Warm apricot-peach horizon haze band glowing gently behind the cloud bases at Sunset
  if (sunset > 0.01) {
    float horBand = exp(-sq((ny - 0.94) / 0.22));
    float sunAzimuth = exp(-sq((sp.x / max(1.0, cssRes.x) - 0.34) / 0.42));
    col += vec3(0.58, 0.33, 0.19) * horBand * (0.26 + 0.22 * sunAzimuth) * sunset;
  }

  // 2. Full Moon & Twinkling Starfield (Starlit Galaxy Night)
  vec2 moonPos = vec2(cssRes.x * 0.80, horizonY * 0.20);
  float mRad = clamp(min(cssRes.x, cssRes.y) * 0.042, 20.0, 38.0);
  float dMoon = length(sp - moonPos);

  if (night > 0.02) {
    // Broad realistic night-sky Rayleigh lunar scatter brightening the sky dome around the Moon
    float skyScatter = exp(-dMoon / (max(cssRes.x, cssRes.y) * 0.36));
    col += vec3(0.085, 0.140, 0.255) * skyScatter * 0.42 * night;

    // Realistic lunar glare suppresses faint nearby stars (real Full Moon is ~60,000x brighter than magnitude-3 stars!)
    float glareMask = ss(mRad * 1.8, mRad * 6.8, dMoon);
    vec2 sC1 = floor(sp / 24.0);
    vec2 sU1 = fract(sp / 24.0) - 0.5;
    float sh1 = hash2(sC1 + 19.3);
    if (sh1 > 0.58) {
      vec2 so = (vec2(hash2(sC1 + 5.7), hash2(sC1 + 41.2)) - 0.5) * 0.64;
      float sd = length(sU1 - so);
      float tw = 0.58 + 0.42 * sin(uTime * (1.8 + sh1 * 2.4) + sh1 * 48.0);
      float vertFade = 1.0 - ss(0.45, 0.94, ny) * 0.55;
      float sb = (1.0 - ss(0.022, 0.082, sd)) * tw * vertFade * glareMask * night;
      col = mix(col, vec3(0.95, 0.98, 1.00), sb * 0.90);
    }
    if (!isRefl) {
      vec2 sC2 = floor((sp + vec2(9.0, 5.0)) / 14.0);
      vec2 sU2 = fract((sp + vec2(9.0, 5.0)) / 14.0) - 0.5;
      float sh2 = hash2(sC2 + 83.1);
      if (sh2 > 0.78) {
        vec2 so2 = (vec2(hash2(sC2 + 31.4), hash2(sC2 + 61.9)) - 0.5) * 0.60;
        float sd2 = length(sU2 - so2);
        float tw2 = 0.52 + 0.48 * sin(uTime * (2.3 + sh2 * 2.0) + sh2 * 37.0);
        float sb2 = (1.0 - ss(0.018, 0.066, sd2)) * tw2 * (1.0 - ss(0.35, 0.85, ny)) * glareMask * night;
        col = mix(col, vec3(0.88, 0.94, 1.00), sb2 * 0.58);
      }
    }

    // Jewel-clean Full Moon with optical limb diffraction bloom + soft organic lunar seas + Rayleigh/Mie corona
    float dOuter = dMoon - mRad;
    float disc = ss(1.8, -1.4, dOuter);
    float limbBloom = exp(-max(dOuter, 0.0) / (mRad * 0.28)) * 0.42;
    float aureole   = exp(-max(dOuter, 0.0) / (mRad * 1.35)) * 0.52;
    float corona    = exp(-max(dOuter, 0.0) / (mRad * 5.20)) * 0.24;
    col += vec3(0.98, 0.98, 0.94) * limbBloom * 0.55 * night;
    col += vec3(0.90, 0.93, 0.96) * aureole   * 0.44 * night;
    col += vec3(0.46, 0.68, 0.96) * corona    * 0.66 * night;
    if (disc > 0.002) {
      vec2 mLocal = (sp - moonPos) / max(1.0, mRad);
      float rN = clamp(length(mLocal), 0.0, 1.0);
      float limb = pow(max(0.0001, 1.0 - rN * rN * 0.65), 0.22);
      float m1 = N(mLocal * 36.0 + vec2(41.0, 27.0), 256.0).r;
      float m2 = N(mLocal * 68.0 + vec2(93.0, 61.0), 256.0).g;
      float maria = ss(0.44, 0.74, m1 * 0.68 + m2 * 0.32) * (1.0 - ss(0.76, 1.0, rN));
      vec3 moonCol = mix(vec3(1.02, 1.01, 0.97), vec3(0.76, 0.81, 0.89), maria * 0.28) * mix(0.92, 1.04, limb);
      col = mix(col, moonCol, disc * night * 0.99);
    }
  }

  if ((night + sunset) > 0.04) {
    col += shootingStars(sp, cssRes, uTime, sunset, night, moonPos, mRad);
  }

  // 3. Silky High-Altitude Horizontal Cirrus Strata (strictly 2D horizontal streaks + Mie glow near Moon, ZERO dark blotches!)
  if (ny < 0.28) {
    float topBand = ss(0.01, 0.07, ny) * (1.0 - ss(0.11, 0.27, ny));
    float highScroll = scrollPx * 0.36 + wt * 10.0;
    // True 2D stretched patch (both X and Y vary softly — never a vertical column!)
    float topPatch = ss(0.48, 0.84, N(vec2((sp.x - highScroll) * 0.36, sp.y * 1.15 + 17.0), 420.0).r);
    // Keep the Moon disc itself clear & jewel-like (softly dissolve opaque wisps right on top of the Moon!)
    float moonClear = night > 0.02 ? ss(mRad * 0.9, mRad * 2.5, dMoon) : 1.0;
    float covTop = clamp(topBand * topPatch * 0.62 * cDense * moonClear, 0.0, 0.58);
    vec2 cTop = highCirrusLayer(sp, highScroll, covTop);
    if (cTop.x > 0.004) {
      float moonMie = night > 0.02 ? exp(-dMoon / (mRad * 5.8)) : 0.0;
      vec3 topDark = moodMix(vec3(0.86, 0.92, 0.98), vec3(0.32, 0.32, 0.48), vec3(0.06, 0.10, 0.22), sunset, night);
      vec3 topRim  = moodMix(vec3(0.99, 0.99, 0.98), vec3(0.68, 0.56, 0.64), vec3(0.34, 0.48, 0.72), sunset, night);
      vec3 cCir = mix(topDark, topRim, cTop.y * 0.55);
      // Forward Mie scattering makes thin cirrus near the Full Moon glow luminous silver instead of dark!
      cCir = mix(cCir, vec3(0.84, 0.91, 1.00), moonMie * 0.72 * night);
      col = mix(col, cCir, cTop.x * 0.52);
    }
  }

  // 4. TRUE 3D VOLUMETRIC RAYMARCHED AURORA BOREALIS AT NIGHT (stars shine THROUGH, clouds sit in front,
  //    AND reflects live in the mirror ocean below!)
  vec3 auroraGlow = vec3(0.0);
  if (night > 0.015) {
    auroraGlow = evalRealAurora3D(sp, cssRes, horizonY, wt, ny, moonPos, mRad, night, isRefl);
    col += auroraGlow * (isRefl ? 0.78 : 0.95);
  }

  // 5. HAND-PAINTED SEAMLESS STUDIO GHIBLI CUMULUS PANORAMA (uCloudsTex, physically lit from Moon/Sun!)
  if (uCloudsReady > 0.5) {
    float vTop = 1.0 - (0.62 + 0.34 * cDense);
    float vBot = 1.01;
    float vSpan = max(0.001, vBot - vTop);
    float cV = (ny - vTop) / vSpan;
    if (cV >= 0.0 && cV <= 1.0) {
      float periodW = max(cssRes.x * 1.55, horizonY * 3.75);
      float cU = sp.x / periodW - uWorldScroll * 0.135 - wt * 0.0026;
      vec4 cTex = texture(uCloudsTex, vec2(cU, cV));
      if (cTex.a > 0.004) {
        vec3 cGraded = gradePaintedCloud(
          cTex.rgb, cTex.a, vec2(cU, cV), sp, cssRes, horizonY, periodW, vSpan, moonPos, mRad, sunset, night
        );
        // Physically accurate subtle emerald subsurface scatter strictly on thin translucent cloud tufts backlit by Aurora!
        if (night > 0.015) {
          float thinCloudRim = cTex.a * (1.0 - cTex.a) * 4.0;
          cGraded += auroraGlow * (0.04 + 0.24 * thinCloudRim);
        }
        // Gentle atmospheric aerial veil down near the horizon waterline
        float horSoft = ss(0.84, 1.0, ny) * 0.24;
        cGraded = mix(cGraded, skyBot, horSoft);
        float cAlpha = cTex.a * ss(0.0, 0.03, cV) * (1.0 - ss(0.96, 1.0, cV) * 0.25);
        col = mix(col, cGraded, clamp(cAlpha * (0.86 + 0.14 * cDense), 0.0, 0.98));
      }
    }
  }

  // Soft low horizon mist band harmonizing cloud bases with the mirror sea waterline
  float seamGlow = exp(-sq((1.0 - ny) / 0.036));
  vec3 seamCol = moodMix(vec3(0.90, 0.96, 0.99), vec3(0.88, 0.68, 0.58), vec3(0.15, 0.25, 0.44), sunset, night);
  col = mix(col, seamCol, seamGlow * mix(0.22, 0.30, sunset) * (1.0 - night * 0.44));

  // 6. SUBTLE FOREGROUND ATMOSPHERIC PRESENCE FOR SKY ICONS
  //    (Strict physical altitude occlusion: 100km Aurora NEVER bleeds in front of 3km opaque clouds — ZERO green bubble!)
  if (uAdaptive >= 0.5 && !isRefl && ny < 0.94) {
    float sdf = fieldS(sp);
    if (sdf < 46.0) {
      float horFade = 1.0 - ss(0.80, 0.94, ny);

      // Day & Sunset: ultra-soft wide atmospheric glow (ZERO neon outline tube, ZERO hard sdf boundary!)
      float daySunW = clamp(1.0 - night, 0.0, 1.0);
      if (daySunW > 0.02) {
        float softMist = ss(36.0, -38.0, sdf) * horFade;
        float broadDrift = N(sp - vec2(wt * 5.0, 0.0), 460.0).r;
        vec3 mistCol = mix(vec3(0.90, 0.95, 1.00), vec3(0.98, 0.74, 0.54), sunset);
        col = mix(col, mistCol, pow(softMist, 1.55) * (0.78 + 0.22 * broadDrift) * 0.22 * daySunW);
      }

      // Delicate floating Ghibli Spirit Fireflies / Stardust Sparks around desktop icons!
      float firefly = evalIconFireflies(sp, sdf, uTime, ny);
      if (firefly > 0.004) {
        vec3 ffCol = moodMix(
          vec3(1.00, 0.98, 0.90),
          vec3(1.05, 0.86, 0.48),
          vec3(0.84, 1.00, 0.68),
          sunset, night
        );
        col += ffCol * firefly * mix(0.28, 0.52, max(night, sunset * 0.65));
      }
    }
  }

  return col;
}

// Ballistic Parabolic Bow Sheet Spray + Bogie Mist + Stern Rooster-Tail (quadratic Froude speed scaling!)
float evalTrainSplash(vec2 sp, float horizonY, float wt) {
  if (uTrainReady < 0.5 || uTrainRect.z <= 1.0 || uWake <= 0.02) return 0.0;
  float trScale = clamp(uTrainRect.w / 100.0, 0.42, 1.35);
  float yAbove = horizonY - sp.y;
  if (yAbove < -1.2 || yAbove > 13.0 * trScale) return 0.0;

  float tL = uTrainRect.x;
  float tW = uTrainRect.z;
  float froude = uWake * (0.45 + 0.55 * uWake); // Quadratic hydrodynamic spray energy vs speed!
  float acc = 0.0;

  float sprayFine = N(vec2(sp.x * 2.2 - uTime * 125.0, yAbove * 3.8), 64.0).g;
  float sprayMist = N(vec2(sp.x * 0.9 - uTime * 78.0,  yAbove * 2.1 + 19.0), 96.0).r;

  // 1. Sleek low waterline foam film hugging submerged bogies along the entire 5-car keel
  float alongKeel = ss(tL - 3.0, tL + 9.0, sp.x) * (1.0 - ss(tL + tW * 0.96, tL + tW + 42.0 * trScale * uWake, sp.x));
  float keelFilm = exp(-max(0.0, yAbove) / max(0.55, (1.10 + 0.95 * sprayFine) * trScale)) * ss(-0.8, 0.7, yAbove) * alongKeel * 0.64;
  acc = max(acc, keelFilm);

  // 2. BALLISTIC PARABOLIC BOW SHEET SPRAY at Car 1's prow (y(x) = hPeak * (1 - ((x - xPeak)/L)^2))
  float bowX = tL + tW * 0.008;
  float bowRelX = sp.x - bowX;
  float bowLen = 28.0 * trScale * (0.50 + 0.50 * froude);
  if (bowRelX > -3.0 * trScale && bowRelX < bowLen * 1.25) {
    float uBow = clamp(bowRelX / max(1.0, bowLen), 0.0, 1.25);
    // Asymmetric gravity parabola: rises sharply at prow (u=0.28), arcs gracefully back down into sea (u=1.05)!
    float arcPeak = 6.8 * trScale * froude * (0.78 + 0.34 * sprayMist);
    float para = max(0.0, 1.0 - sq((uBow - 0.30) / 0.75));
    float arcY = arcPeak * para;
    // Translucent sheet thickness + feathery breaking crest droplets swept rightward
    float sheetFill = ss(arcY + 1.4 * trScale, arcY - 1.2 * trScale, yAbove) * ss(-0.8, 0.8, yAbove);
    float crestRim  = exp(-sq((yAbove - arcY * 0.86) / max(0.8, 1.35 * trScale)));
    float bowSpray = (sheetFill * (0.35 + 0.65 * sprayFine) + crestRim * (0.55 + 0.45 * sprayFine))
                   * ss(-0.08, 0.14, uBow) * (1.0 - ss(0.75, 1.22, uBow));
    acc = max(acc, bowSpray * 0.92);
  }

  // 3. Secondary bogie coupling spray wisps (4 bellows joints) + trailing stern rooster-tail behind Car 5!
  for (int i = 1; i <= 5; i++) {
    float fracX = (i == 1) ? 0.210 : ((i == 2) ? 0.405 : ((i == 3) ? 0.595 : ((i == 4) ? 0.790 : 0.992)));
    float cx = tL + tW * fracX;
    float rx = ((i == 5) ? 24.0 : 10.5) * trScale * (0.55 + 0.45 * froude);
    float ry = ((i == 5) ? 4.0  : 2.9)  * trScale * (0.50 + 0.50 * froude);
    vec2 q = vec2((sp.x - (cx + rx * 0.44)) / max(1.0, rx), max(0.0, yAbove) / max(0.55, ry));
    if (abs(q.x) > 1.35 || q.y > 1.50) continue;

    float sweep = ss(-1.1, 0.25, q.x) * (1.0 - ss(0.15, 1.25, q.x));
    float hProfile = max(0.25, 1.0 - sq(q.x * 0.85)) * (0.65 + 0.55 * sprayMist);
    float vFade = exp(-sq(q.y / hProfile) * 1.65) * ss(-0.7, 0.8, yAbove);
    float feathery = sweep * vFade * ss(0.24, 0.78, sprayFine * 0.65 + sprayMist * 0.35);
    acc = max(acc, feathery * ((i == 5) ? 0.72 : 0.44));
  }

  return clamp(acc * froude, 0.0, 0.88);
}

// Authentic backlit hand-painted passing counter-train: horizontally flipped sample of uTrainTex + uTrainWinTex!
vec4 evalPassingSilhouetteTrain(vec2 sp, float sunset, float night) {
  if (uTrainReady < 0.5 || uPassRect.z <= 1.0) return vec4(0.0);
  vec2 uv = (sp - uPassRect.xy) / uPassRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);

  vec2 fUV = vec2(1.0 - uv.x, uv.y);
  float blurDu = 1.6 / max(1.0, uPassRect.z);
  vec4 trC = texture(uTrainTex, fUV);
  vec4 trL = texture(uTrainTex, vec2(clamp(fUV.x - blurDu, 0.0, 1.0), fUV.y));
  vec4 trR = texture(uTrainTex, vec2(clamp(fUV.x + blurDu, 0.0, 1.0), fUV.y));
  vec4 tr = trC * 0.54 + (trL + trR) * 0.23;
  if (tr.a <= 0.01) return vec4(0.0);

  float winM = texture(uTrainWinTex, fUV).r * 0.6 +
               (texture(uTrainWinTex, vec2(clamp(fUV.x - blurDu, 0.0, 1.0), fUV.y)).r +
                texture(uTrainWinTex, vec2(clamp(fUV.x + blurDu, 0.0, 1.0), fUV.y)).r) * 0.2;

  float trLum = dot(tr.rgb, vec3(0.299, 0.587, 0.114));
  vec3 silDark = moodMix(vec3(0.20, 0.26, 0.36), vec3(0.19, 0.13, 0.19), vec3(0.038, 0.062, 0.130), sunset, night);
  vec3 silMid  = moodMix(vec3(0.38, 0.44, 0.54), vec3(0.38, 0.27, 0.30), vec3(0.105, 0.155, 0.270), sunset, night);
  vec3 col = mix(silDark, silMid, ss(0.15, 0.85, trLum) * 0.70);
  // Directional moonlight rim on right-sloping roof edge at Night
  float topRim = (1.0 - ss(0.04, 0.22, uv.y)) * (night > 0.5 ? (0.14 + 0.18 * uv.x) : 0.20);
  vec3 rimCol = moodMix(vec3(0.75, 0.86, 0.96), vec3(0.88, 0.62, 0.50), vec3(0.46, 0.62, 0.88), sunset, night);
  col = mix(col, rimCol, topRim);

  vec3 winCol = moodMix(vec3(0.78, 0.84, 0.88), vec3(0.96, 0.72, 0.38), vec3(1.06, 0.78, 0.34), sunset, night);
  col = mix(col, winCol, winM * mix(0.42, 0.82, max(sunset, night)));

  return vec4(col, tr.a * 0.95);
}

// Evaluates ALL horizon props (Flooded Sixth Station -> Lonely Island -> Hero Train -> Splash -> Passing Train)!
// Called identically for direct upper view AND optical mirror sea reflection!
vec4 evalHorizonProps(
  vec2 sp,
  float horizonY,
  float wt,
  float sunset,
  float night,
  float dayAmt,
  float lampGlowBoost,
  bool isRefl
) {
  vec4 outC = vec4(0.0);
  vec3 horMist = moodMix(vec3(0.76, 0.89, 0.96), vec3(0.76, 0.58, 0.56), vec3(0.085, 0.142, 0.270), sunset, night);

  // 1. Hand-Painted Flooded Sixth Station ("六番の駅") scrolling smoothly behind the sea train
  if (uShowStation > 0.5 && uStationReady > 0.5 && uStationRect.z > 1.0) {
    vec2 sUV = (sp - uStationRect.xy) / uStationRect.zw;
    if (sUV.x >= 0.0 && sUV.x <= 1.0 && sUV.y >= 0.0 && sUV.y <= 1.0) {
      vec4 st = texture(uStationTex, sUV);
      if (st.a > 0.005) {
        vec3 stRgb = st.rgb;
        stRgb.g = min(stRgb.g, max(stRgb.r, stRgb.b) * 1.01);

        vec3 stDay = stRgb * vec3(0.98, 1.01, 1.04);
        vec3 stSun = stRgb * vec3(1.03, 0.88, 0.80) + vec3(0.020, 0.010, 0.018);
        // Subtle moonlight grazing upper-right roofs & pickets at Night!
        float stMoonRim = (1.0 - ss(0.15, 0.65, sUV.y)) * (0.4 + 0.6 * sUV.x);
        vec3 stNgt = stRgb * (vec3(0.22, 0.31, 0.52) + vec3(0.14, 0.20, 0.34) * stMoonRim) + vec3(0.008, 0.014, 0.036);
        vec3 stCol = moodMix(stDay, stSun, stNgt, sunset, night);

        stCol = mix(stCol, horMist, 0.09);

        // Dual warm flickering lanterns painted in seatrain-station.png:
        vec2 winLampD  = (sUV - vec2(0.364, 0.576)) * vec2(uStationRect.z, uStationRect.w);
        vec2 poleLampD = (sUV - vec2(0.881, 0.456)) * vec2(uStationRect.z, uStationRect.w);
        float winBulb  = exp(-sq(length(winLampD) / 8.0));
        float poleBulb = exp(-sq(length(poleLampD) / 5.5));
        float lampEnergy = (0.42 * sunset + 1.08 * night) * lampGlowBoost;
        stCol += vec3(1.15, 0.78, 0.30) * (winBulb * 0.78 + poleBulb * 0.95) * lampEnergy;
        outC = vec4(stCol, st.a);
      }
    }
    if ((sunset + night) > 0.04) {
      vec2 winPos  = uStationRect.xy + uStationRect.zw * vec2(0.364, 0.576);
      vec2 polePos = uStationRect.xy + uStationRect.zw * vec2(0.881, 0.456);
      float dW = length(sp - winPos);
      float dP = length(sp - polePos);
      float h = 0.0;
      if (dW < 38.0) h += exp(-dW / 12.0) * 0.55;
      if (dP < 34.0) h += exp(-dP / 9.5)  * 0.72;
      h *= (0.24 * sunset + 0.64 * night) * lampGlowBoost;
      if (h > 0.004) {
        outC.rgb = mix(outC.rgb, vec3(1.06, 0.76, 0.34), clamp(h * (1.0 - outC.a * 0.52), 0.0, 1.0));
        outC.a = max(outC.a, clamp(h * 0.55, 0.0, 0.70));
      }
    }
  }

  // 2. Hand-Painted Lonely Tiny Grassy Island (miniature gabled cottage & single upright tree!)
  if (uShowIsland > 0.5 && uIslandReady > 0.5 && uIslandRect.z > 1.0) {
    vec2 iUV = (sp - uIslandRect.xy) / uIslandRect.zw;
    if (iUV.x >= 0.0 && iUV.x <= 1.0 && iUV.y >= 0.0 && iUV.y <= 1.0) {
      vec4 isl = texture(uIslandTex, iUV);
      if (isl.a > 0.005) {
        vec3 iDay = isl.rgb * vec3(0.99, 1.02, 1.00);
        vec3 iSun = isl.rgb * vec3(1.03, 0.89, 0.77) + vec3(0.022, 0.011, 0.018);
        // Subtle moonlight silver rim grazing the upper-right foliage & cottage gable at Night
        float islMoonRim = (1.0 - ss(0.10, 0.72, iUV.y)) * (0.35 + 0.65 * iUV.x);
        vec3 iNgt = isl.rgb * (vec3(0.19, 0.28, 0.48) + vec3(0.15, 0.22, 0.36) * islMoonRim) + vec3(0.006, 0.012, 0.032);
        vec3 iCol = moodMix(iDay, iSun, iNgt, sunset, night);

        iCol = mix(iCol, horMist, 0.14);

        // Cozy warm cottage windows glowing inside seatrain-island.png at Sunset & Night!
        float winRegion = ss(0.23, 0.25, iUV.x) * (1.0 - ss(0.38, 0.40, iUV.x))
                        * ss(0.58, 0.61, iUV.y) * (1.0 - ss(0.71, 0.74, iUV.y));
        float isWin = ss(0.22, 0.42, isl.r - isl.b) * ss(0.68, 0.88, isl.r) * winRegion;
        iCol = mix(iCol, vec3(1.18, 0.84, 0.36), isWin * (0.42 * sunset + 0.98 * night) * lampGlowBoost);

        outC.rgb = mix(outC.rgb, iCol, isl.a);
        outC.a = max(outC.a, isl.a);
      }
    }
  }

  // 3. Hero Centered 5-Car Vintage Sea Train with Articulated Rail-Joint Micro-Suspension (Car 1 -> Car 5 phase lag!)
  if (uTrainReady > 0.5 && uTrainRect.z > 1.0) {
    vec2 tUV = (sp - uTrainRect.xy) / uTrainRect.zw;
    if (tUV.x >= 0.0 && tUV.x <= 1.0 && tUV.y >= -0.02 && tUV.y <= 1.02) {
      // Travelling rail-joint suspension impulse propagating Car 1 -> Car 5 along the submerged tracks!
      float carCoord = clamp(tUV.x * 5.0, 0.0, 4.999);
      float carIdx = floor(carCoord);
      float carFrac = fract(carCoord);
      // Smoothly interpolate across flexible bellows junctions so adjacent cars never tear vertically
      float nextIdx = min(4.0, carIdx + 1.0);
      float prevIdx = max(0.0, carIdx - 1.0);
      float jCur  = uWorldScroll * 26.0 - carIdx * 1.18;
      float jNext = uWorldScroll * 26.0 - nextIdx * 1.18;
      float jPrev = uWorldScroll * 26.0 - prevIdx * 1.18;
      float bCur  = (sin(jCur)  * 0.45 + pow(max(0.0, sin(jCur  * 2.0)), 6.0) * 0.55);
      float bNext = (sin(jNext) * 0.45 + pow(max(0.0, sin(jNext * 2.0)), 6.0) * 0.55);
      float bPrev = (sin(jPrev) * 0.45 + pow(max(0.0, sin(jPrev * 2.0)), 6.0) * 0.55);
      float bump = mix(bCur, bPrev, (1.0 - ss(0.0, 0.08, carFrac)) * 0.5);
      bump = mix(bump, bNext, ss(0.92, 1.0, carFrac) * 0.5);
      float suspUvY = (bump * 0.58 * uWake) / max(1.0, uTrainRect.w);
      vec2 sUVTr = vec2(tUV.x, tUV.y + suspUvY);

      if (sUVTr.y >= 0.0 && sUVTr.y <= 1.0) {
      vec4 tr = texture(uTrainTex, sUVTr);
      if (tr.a > 0.005) {
        float winM = texture(uTrainWinTex, sUVTr).r;

        vec3 trDay = tr.rgb * vec3(1.00, 1.02, 1.03);
        vec3 trSun = tr.rgb * vec3(1.06, 0.93, 0.82) + vec3(0.026, 0.012, 0.015);
        // True directional Night moonlight on train roof: brighter silver-blue sheen toward the right (Moon side)!
        float roofRim = (1.0 - ss(0.05, 0.26, sUVTr.y)) * (0.45 + 0.55 * sUVTr.x);
        vec3 trNgt = tr.rgb * (vec3(0.23, 0.31, 0.50) + vec3(0.22, 0.30, 0.46) * roofRim) + vec3(0.010, 0.018, 0.042);

        vec3 trCol = moodMix(trDay, trSun, trNgt, sunset, night);

        // Subtle warm bounce glow spilling from the lit windows onto nearby window frames & lower hull panel!
        float flicker = 0.97 + 0.03 * sin(uTime * 2.9 + sUVTr.x * 16.0);
        float winPower = (sunset * 0.56 + night * 0.98) * flicker;
        if (winPower > 0.02) {
          float nearWinBand = exp(-sq((sUVTr.y - 0.39) / 0.16)) * ss(0.03, 0.08, sUVTr.x) * (1.0 - ss(0.92, 0.97, sUVTr.x));
          trCol += vec3(0.24, 0.14, 0.04) * nearWinBand * (1.0 - winM) * winPower * 0.42;

          if (winM > 0.02) {
            float glassLum = dot(tr.rgb, vec3(0.299, 0.587, 0.114));
            float passengerKeep = ss(0.10, 0.42, glassLum);
            vec3 warmCabin = mix(vec3(0.30, 0.19, 0.13), vec3(1.16, 0.85, 0.38), 0.35 + 0.65 * passengerKeep);
            trCol = mix(trCol, warmCabin, winM * winPower * 0.88);
          }
        }

        outC.rgb = mix(outC.rgb, trCol, tr.a);
        outC.a = max(outC.a, tr.a);
      }
      }
    }

    // Crisp warm tungsten front headlight lamp + delicate atmospheric forward beam scaled to distant 5-car train!
    if ((sunset + night) > 0.04 && !isRefl) {
      float trS = clamp(uTrainRect.w / 100.0, 0.42, 1.35);
      vec2 headPos = uTrainRect.xy + uTrainRect.zw * vec2(0.013, 0.085);
      vec2 hRel = sp - headPos;
      if (hRel.x < 10.0 * trS && hRel.x > -150.0 * trS && abs(hRel.y) < 44.0 * trS) {
        float beamSpread = 4.2 * trS + max(0.0, -hRel.x) * 0.20;
        float dCone = abs(hRel.y - (-hRel.x) * 0.15) / max(1.0, beamSpread);
        float along = ss(6.0 * trS, -5.0 * trS, hRel.x) * exp(-max(0.0, -hRel.x) / (68.0 * trS));
        float cone = exp(-dCone * dCone * 1.55) * along * (0.16 * sunset + 0.44 * night);
        float lampCore = exp(-sq(length(hRel) / max(1.4, 3.0 * trS))) * (0.48 * sunset + 0.96 * night);
        float lampHalo = exp(-sq(length(hRel) / max(3.5, 9.5 * trS))) * (0.18 * sunset + 0.38 * night);
        float glowM = clamp(cone + lampCore + lampHalo, 0.0, 0.95);
        vec3 beamCol = mix(vec3(1.04, 0.84, 0.46), vec3(1.10, 0.98, 0.78), clamp(lampCore, 0.0, 1.0));
        outC.rgb = mix(outC.rgb, beamCol, glowM * (1.0 - outC.a * 0.50));
        outC.a = max(outC.a, clamp(glowM * 0.68, 0.0, 0.80));
      }
    }
  }

  // 4. Sleek Low Feathery Waterline Spray catching warm interior cabin bounce light!
  float splash = evalTrainSplash(sp, horizonY, wt);
  if (splash > 0.01) {
    vec3 spCol = moodMix(vec3(0.97, 0.99, 1.00), vec3(0.99, 0.90, 0.82), vec3(0.64, 0.78, 0.95), sunset, night);
    // Physically accurate warm amber bounce from lit cabin windows onto spray right beneath the cars!
    if ((sunset + night) > 0.04 && uTrainRect.z > 1.0) {
      float uTx = (sp.x - uTrainRect.x) / uTrainRect.z;
      if (uTx > 0.02 && uTx < 0.98) {
        float winWarmth = texture(uTrainWinTex, vec2(uTx, 0.37)).r;
        spCol = mix(spCol, vec3(1.04, 0.84, 0.50), winWarmth * (0.28 * sunset + 0.58 * night));
      }
    }
    outC.rgb = mix(outC.rgb, spCol, splash * 0.84);
    outC.a = max(outC.a, splash * 0.84);
  }

  // 5. Real Hand-Painted Backlit Counter-Train Silhouette passing swiftly Left -> Right in front!
  vec4 passTr = evalPassingSilhouetteTrain(sp, sunset, night);
  if (passTr.a > 0.005) {
    outC.rgb = mix(outC.rgb, passTr.rgb, passTr.a);
    outC.a = max(outC.a, passTr.a);
  }

  return outC;
}

// True 3D projective flat-plane perspective water glints gliding rigidly Left -> Right!
float evalProjectiveGlints(vec2 p, vec2 cssRes, float waterDepth, float wt, float ripAmt) {
  float horizonFade = ss(0.03, 0.16, waterDepth);
  if (horizonFade <= 0.004) return 0.0;

  float zDist = 1.0 / (waterDepth + 0.055);
  float aspectX = (p.x - cssRes.x * 0.5) / max(1.0, cssRes.y);
  float glintAcc = 0.0;

  for (int L = 0; L < 2; L++) {
    float fL = float(L);
    float sx = (L == 0) ? 1.55 : 0.92;
    float sz = (L == 0) ? 1.35 : 0.78;
    float spd = (L == 0) ? 2.40 : 2.95;

    float wx = aspectX * zDist * sx - uWorldScroll * spd * sx - wt * (0.045 * sx);
    float wz = zDist * sz;

    vec2 cell = floor(vec2(wx, wz));
    vec2 fuv  = fract(vec2(wx, wz));

    float h1 = hash2(cell + vec2(37.1 + fL * 71.0, 19.3));
    if (h1 > (L == 0 ? 0.79 : 0.83)) {
      float h2 = hash2(cell + vec2(11.7, 53.9 + fL * 29.0));
      float h3 = hash2(cell + vec2(91.2, 7.4 + fL * 17.0));
      float lenX = 0.14 + 0.24 * h2;
      float cx = 0.26 + 0.48 * h3;
      float cy = 0.28 + 0.44 * h2;
      float thinZ = clamp(0.042 + 0.055 * waterDepth, 0.04, 0.11);
      float dx = abs(fuv.x - cx) / lenX;
      float dy = abs(fuv.y - cy) / thinZ;
      float streak = (1.0 - ss(0.38, 1.0, dx)) * (1.0 - ss(0.28, 1.0, dy));
      float shimmer = 0.65 + 0.35 * sin(uTime * 2.4 + h1 * 42.0);
      glintAcc = max(glintAcc, streak * shimmer * (0.40 + 0.60 * waterDepth));
    }
  }

  return glintAcc * horizonFade * (0.26 + 0.24 * ripAmt);
}

// Physically accurate microfacet ocean specular glitter column beneath the Full Moon (Night) or setting Sun (Sunset/Day)!
// Uses smooth 2D organic wavelets in logarithmic perspective depth (ZERO horizontal scanline bars, ZERO trapezoid cutoff!)
vec3 evalCelestialWaterPath(
  vec2 p,
  vec2 cssRes,
  float horizonY,
  float depthPx,
  float waterDepth,
  float zSurf,
  float surfX,
  float nRip1,
  float nRip2,
  float ripX,
  float ripAmt,
  float sunset,
  float night
) {
  vec2 lightPos = primaryLightPos(cssRes, horizonY, sunset, night);
  float mRad = clamp(min(cssRes.x, cssRes.y) * 0.042, 20.0, 38.0);

  // Specular cone widens gently with perspective & water ripple roughness!
  float rough = 0.35 + 0.65 * ripAmt;
  float coneW = mix(mRad * 0.95, cssRes.x * (0.11 + 0.05 * rough), pow(waterDepth, 0.72));
  float dx = abs(p.x + ripX * 1.15 - lightPos.x);

  // Compute widest Gaussian FIRST and never clip early before it reaches 0.0005 (eliminates diagonal cone edge!)
  float wideGlow = exp(-sq(dx / max(22.0, coneW * 1.85)));
  if (wideGlow < 0.0008) return vec3(0.0);
  float across = exp(-sq(dx / max(12.0, coneW)));

  // Organic 2D horizontally-stretched ripples in logarithmic depth (smoothly scaled everywhere — ZERO ruler-straight lines!)
  float logZ = log(max(1.0, zSurf));
  vec2 uvG1 = vec2(surfX * 16.0 + nRip1 * 1.4, logZ * 28.0 - uTime * 0.65);
  vec2 uvG2 = vec2(surfX * 38.0 - nRip2 * 1.8 + 41.0, logZ * 62.0 + uTime * 1.05);
  float g1 = N(uvG1, 160.0).r;
  float g2 = N(uvG2, 120.0).g;

  // Soft broken liquid specular facets & delicate diamond water glints (no harsh parallel stripes!)
  float liquidWave = ss(0.42, 0.84, g1 * 0.58 + g2 * 0.42);
  float fineSpark  = ss(0.64, 0.92, g2 * g1 * 1.55);

  float depthEnv = ss(0.015, 0.14, waterDepth) * (1.0 - ss(0.86, 1.0, waterDepth) * 0.22);

  vec3 pathCol = moodMix(
    vec3(0.96, 0.99, 1.00),
    vec3(1.04, 0.78, 0.52),
    vec3(0.82, 0.91, 1.00),
    sunset, night
  );
  float intensity = mix(0.20, 0.56, max(night, sunset * 0.82)) * depthEnv;
  return pathCol * (across * (liquidWave * 0.44 + fineSpark * 0.52) + wideGlow * 0.14) * intensity;
}

// =============================================================================
// MARINE-TRAIN HYDRODYNAMICS: 3D KELVIN V-WAKE (19.47 deg) + TURBULENT STERN TRAIL
// =============================================================================
// Returns vec4(normalPerturbX, normalPerturbY, kelvinCrestSlope, wakeFoam)
// Physically bends mirror reflections across the moving V-wake wave crests & catches directional specular sheen!
vec4 evalTrainHydrodynamics(
  vec2 p,
  vec2 cssRes,
  float horizonY,
  float depthPx,
  float waterDepth,
  float scrollPx,
  float nRip1,
  float nRip2,
  float wt
) {
  if (uTrainReady < 0.5 || uTrainRect.z <= 1.0 || uWake <= 0.015) return vec4(0.0);

  float trS = clamp(uTrainRect.w / 100.0, 0.42, 1.35);
  float bowX  = uTrainRect.x + uTrainRect.z * 0.010;
  float tailX = uTrainRect.x + uTrainRect.z * 0.992;
  float xBehind = p.x - bowX;
  if (xBehind < -18.0 * trS) return vec4(0.0);

  // Project screen depthPx onto the 3D flat ocean plane in front of the train track line!
  // Foreshortening expands gently as waves approach the viewer in the foreground
  float foreshorten = 0.25 + 0.15 * waterDepth;
  float zWorld = depthPx / max(0.10, foreshorten);

  float froude = uWake * (0.45 + 0.55 * uWake);
  float gradX = 0.0;
  float gradY = 0.0;
  float crestSlope = 0.0;
  float foamAcc = 0.0;

  // 1. TRUE KELVIN V-WAKE WEDGE (Exact Lord Kelvin cusp angle: tan(19.4712 deg) = 1/sqrt(8) = 0.35355!)
  float horEntry = ss(0.8, 9.5, depthPx);
  if (xBehind > 0.0 && horEntry > 0.004) {
    float cuspZ = xBehind * 0.35355;
    float uK = zWorld / max(10.0 * trS, cuspZ);

    if (uK < 1.24) {
      // Lord Kelvin asymptotic energy decay along the cusp: A ~ (x / L)^(-1/3), plus gentle wide-screen fade
      float xNorm = xBehind / max(1.0, 62.0 * trS);
      float kelvinDecay = pow(max(1.0, 0.85 + xNorm), -0.36) * exp(-xBehind / max(1.0, cssRes.x * 1.15));
      float startSoft = ss(0.0, 26.0 * trS, xBehind);

      // Primary Kelvin cusp wave right along uK ≈ 0.96 + 3 nested divergent echelon wavelets inside the wedge!
      float distCusp = (uK - 0.96) * max(12.0 * trS, cuspZ * 0.48);
      // Organic slight sea-swell undulation so wave crests feel liquid, NEVER ruler-straight!
      float seaWobble = (nRip1 * 4.5 + nRip2 * 2.2) * trS;
      float cuspWaveEnv = exp(-sq((distCusp + seaWobble) / max(4.0, (9.5 + 0.022 * xBehind) * trS)));

      // Divergent echelon phase marching along the Kelvin cusp (angled ~35 deg to track, flowing rightward with water!)
      float echelonPhase = (xBehind * 0.145 - zWorld * 0.36) / max(0.4, trS) - uTime * 3.4 + nRip1 * 2.6;
      float cuspDeriv = -sin(echelonPhase) * cuspWaveEnv;
      float cuspCrest = max(0.0, cos(echelonPhase)) * cuspWaveEnv;

      // Secondary nested divergent wavelets inside the Kelvin wedge (0.28 < uK < 0.94)
      float innerEnv = ss(0.18, 0.50, uK) * (1.0 - ss(0.86, 1.06, uK));
      float innerPhase = (xBehind * 0.19 - zWorld * 0.54) / max(0.4, trS) - uTime * 4.1 + nRip2 * 3.0;
      float innerDeriv = -sin(innerPhase) * innerEnv * 0.48;
      float innerCrest = max(0.0, cos(innerPhase)) * innerEnv * 0.42;

      float waveAmp = kelvinDecay * startSoft * horEntry * froude;
      float totalDeriv = (cuspDeriv + innerDeriv) * waveAmp;
      // Water height gradient tilts reflection optically across the wave!
      gradX += totalDeriv * 6.5;
      gradY += totalDeriv * 3.6;
      crestSlope += (cuspCrest * 0.85 + innerCrest * 0.55) * waveAmp;

      // Subtle lacey whitecap micro-foam right near the energetic bow cusp (first ~240px behind Car 1 bow!)
      float bowFoamEnv = exp(-xBehind / (220.0 * trS)) * cuspWaveEnv * ss(0.32, 0.82, 0.5 + nRip1 * 0.75 + nRip2 * 0.65);
      foamAcc = max(foamAcc, bowFoamEnv * cuspCrest * 0.36 * froude);
    }
  }

  // 2. TURBULENT STERN SLIPSTREAM WAKE (10 submerged bogies churning a widening corridor far behind Car 5!)
  float xAfterTail = max(0.0, p.x - tailX);
  float alongCorridor = ss(-6.0 * trS, 14.0 * trS, xBehind) * exp(-xAfterTail / (340.0 * trS));
  if (alongCorridor > 0.008) {
    // Viscous turbulent wake corridor widens naturally as sqrt(x_after_tail) behind the 5th car!
    float corridorHalfZ = (14.0 + 22.0 * sqrt(xAfterTail / max(1.0, 90.0 * trS))) * trS * (0.65 + 0.35 * uWake);
    float corrEnv = exp(-sq(zWorld / max(4.0, corridorHalfZ))) * alongCorridor;
    if (corrEnv > 0.008) {
      // Swirling turbulent vortices streaming rightward behind the train!
      float tX = (p.x - scrollPx * 1.05) * 0.95;
      float turb1 = N(vec2(tX, zWorld * 0.55 - uTime * 14.0), 82.0).r - 0.5;
      float turb2 = N(vec2(tX * 1.9 + 31.0, zWorld * 1.15 + uTime * 21.0), 54.0).g - 0.5;
      float turbEnergy = corrEnv * froude;
      // Churns & softly blurs the mirror reflection strictly inside the train's watery slipstream!
      gradX += (turb1 * 7.5 + turb2 * 4.2) * turbEnergy;
      gradY += (turb2 * 2.8 + turb1 * 1.8) * turbEnergy * ss(0.0, 14.0, depthPx);

      // Delicate lace-like bubble foam hugging the submerged keel & dissolving gracefully behind Car 5's tail
      float foamDecay = exp(-xAfterTail / (185.0 * trS));
      float keelTight = exp(-depthPx / max(1.3, (2.4 + 4.4 * uWake) * trS));
      float laceFoam = ss(0.24, 0.80, 0.52 + turb1 * 0.95 + turb2 * 0.72);
      foamAcc = max(foamAcc, laceFoam * max(keelTight * alongCorridor * 0.56, corrEnv * foamDecay * 0.30) * froude);
    }
  }

  return vec4(gradX, gradY, clamp(crestSlope, 0.0, 1.0), clamp(foamAcc, 0.0, 0.72));
}

// Ultra-subtle submerged shallow-water steel rails & passing wooden sleepers refracted beneath the glassy surface!
float evalSubmergedRails(vec2 p, float horizonY, float depthPx, float scrollPx, float ripX, float trS) {
  if (depthPx < 0.5 || depthPx > 12.0 * trS) return 0.0;
  // Twin submerged vintage steel rails resting right below the mirror waterline (y ≈ 1.8px and 5.2px below horizon)
  float r1 = exp(-sq((depthPx - 1.8 * trS) / max(0.55, 0.85 * trS)));
  float r2 = exp(-sq((depthPx - 5.0 * trS) / max(0.65, 1.05 * trS)));
  // Faint passing submerged wooden cross-ties scrolling Left -> Right at exact worldScroll track speed!
  float trackX = (p.x + ripX * 0.45 - scrollPx * 1.0) / max(1.0, 11.0 * trS);
  float tie = ss(0.68, 0.92, abs(fract(trackX) - 0.5) * 2.0)
            * ss(0.6 * trS, 2.2 * trS, depthPx) * (1.0 - ss(4.5 * trS, 7.2 * trS, depthPx));
  // Hide rails directly underneath the opaque train reflection & softly fade outward with water depth
  float depthFade = exp(-depthPx / (5.5 * trS));
  float underTrain = 0.0;
  if (uTrainReady > 0.5 && uTrainRect.z > 1.0) {
    underTrain = ss(uTrainRect.x - 4.0, uTrainRect.x + 8.0, p.x)
               * (1.0 - ss(uTrainRect.x + uTrainRect.z - 8.0, uTrainRect.x + uTrainRect.z + 4.0, p.x));
  }
  return clamp((r1 * 0.65 + r2 * 0.52 + tie * 0.38) * depthFade * (1.0 - underTrain * 0.85), 0.0, 1.0);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 cssRes = max(vec2(1.0), uRes / uDpr);
  float wt = uWindTime;
  float scrollPx = uWorldScroll * cssRes.x;
  float sunset = clamp(uSunset, 0.0, 1.0);
  float night  = clamp(uNight,  0.0, 1.0);
  float dayAmt = max(0.0, 1.0 - sunset - night);
  float cDense = clamp(uClouds, 0.25, 1.0);
  float ripAmt = clamp(uRipple, 0.0, 1.0);
  float horizonY = cssRes.y * 0.735;

  float lampPulse = 0.95 + 0.05 * sin(uTime * 2.3);

  vec2 gp = floor(p * (0.82 * max(uDpr, 1.0)));
  float g1 = hash2(gp + 0.5);

  vec3 col;

  if (p.y < horizonY) {
    // =========================================================================
    // UPPER WORLD: HAND-PAINTED GHIBLI SKY, DIRECTIONAL MOON/SUN LIGHT & TRAIN
    // =========================================================================
    col = evalSkyScene(p, cssRes, horizonY, wt, scrollPx, sunset, night, dayAmt, cDense, false);

    vec4 props = evalHorizonProps(p, horizonY, wt, sunset, night, dayAmt, lampPulse, false);
    if (props.a > 0.004) {
      col = mix(col, props.rgb, props.a);
    }
  } else {
    // =========================================================================
    // LOWER WORLD: FRESNEL MIRROR OCEAN + KELVIN V-WAKE + TURBULENT STERN TRAIL
    // =========================================================================
    float depthPx = p.y - horizonY;
    float waterDepth = clamp(depthPx / max(1.0, cssRes.y - horizonY), 0.0, 1.0);
    float persp = pow(waterDepth, 0.85);
    float trS = clamp(uTrainRect.w / 100.0, 0.42, 1.35);

    // Subtle glassy mirror micro-ripples using smooth logarithmic depth (ZERO venetian-blind stripes on reflections!)
    float zSurf = 1.0 / (waterDepth + 0.08);
    float logZSurf = log(max(1.0, zSurf));
    float surfX = ((p.x - cssRes.x * 0.5) / max(1.0, cssRes.y)) * zSurf - uWorldScroll * 1.65;
    float nRip1 = N(vec2(surfX * 18.0, logZSurf * 34.0 - uTime * 0.55), 180.0).r - 0.5;
    float nRip2 = N(vec2(surfX * 42.0, logZSurf * 68.0 + uTime * 0.95), 110.0).g - 0.5;
    float waveS = sin(logZSurf * 14.0 - uTime * 1.15 + nRip1 * 4.2);

    // Adaptive Icon Liquid Water Disturbance for icons below horizon:
    float iconRippleX = 0.0;
    float iconRippleY = 0.0;
    float iconShimmer = 0.0;
    if (uAdaptive >= 0.5) {
      float horSmooth = ss(4.0, 46.0, depthPx);
      if (horSmooth > 0.004) {
        float sdf = fieldS(p);
        if (sdf < 48.0) {
          float softBand = exp(-sq((sdf - 4.0) / 22.0)) * horSmooth;
          float waveOsc = sin(sdf * 0.17 - uTime * 1.85 + nRip1 * 3.2);
          float waterBreak = ss(0.30, 0.82, 0.50 + nRip1 * 0.72 + nRip2 * 0.58);
          iconRippleX = waveOsc * softBand * 4.4;
          iconRippleY = waveOsc * softBand * 1.1;
          vec2 lPos = primaryLightPos(cssRes, horizonY, sunset, night);
          float lightFace = 0.50 + 0.50 * clamp((lPos.x - p.x) / max(1.0, cssRes.x) + 0.5, 0.0, 1.0);
          iconShimmer = max(0.0, waveOsc) * softBand * waterBreak * 0.14 * lightFace;
        }
      }
    }

    // TRUE MARINE-TRAIN HYDRODYNAMICS: 3D Kelvin V-Wake (19.47 deg) + Turbulent Stern Slipstream!
    vec4 hydro = evalTrainHydrodynamics(p, cssRes, horizonY, depthPx, waterDepth, scrollPx, nRip1, nRip2, wt);
    float kelvinGradX = hydro.x;
    float kelvinGradY = hydro.y;
    float kelvinCrest = hydro.z;
    float wakeRibbon  = hydro.w;

    // Combine ambient sea micro-ripples + icon disturbance + physically accurate Kelvin wake normal bending!
    float ripScale = (0.07 + 0.58 * ripAmt) * (0.10 + 0.90 * persp);
    float ripX = (waveS * 2.4 + nRip1 * 6.8 + nRip2 * 2.6) * ripScale + iconRippleX + kelvinGradX;
    float ripY = (nRip2 * 1.5 + waveS * 0.45) * ripScale * pow(waterDepth, 0.55) + iconRippleY + kelvinGradY;

    // True optical vertical mirror coordinate optically distorted by the moving Kelvin V-wake wave crests!
    vec2 reflP = vec2(p.x + ripX, max(0.5, horizonY - depthPx * 1.02 + ripY));

    // 1. Live mirrored sky, hand-painted directional-lit cumulus panorama, cirrus, stars, aurora & moon!
    vec3 skyRefl = evalSkyScene(reflP, cssRes, horizonY, wt, scrollPx, sunset, night, dayAmt, cDense, true);

    // 2. Live mirrored Flooded Station, Lonely Island, Hero 5-Car Train, Spray & Passing Silhouette Train!
    vec4 propRefl = evalHorizonProps(reflP, horizonY, wt, sunset, night, dayAmt, lampPulse, true);
    if (propRefl.a > 0.004) {
      float reflSharp = mix(0.82, 0.50, waterDepth);
      float reflGain  = mix(0.84, 0.64, waterDepth);
      float keelAO = 1.0 - exp(-depthPx / 3.8) * 0.22;
      skyRefl = mix(skyRefl, propRefl.rgb * reflGain * keelAO, propRefl.a * reflSharp);
    }

    // 2b. Subtle refracted shallow-water submerged steel rails & sleepers visible through the glassy sea!
    float subRail = evalSubmergedRails(p, horizonY, depthPx, scrollPx, ripX, trS);
    if (subRail > 0.005) {
      vec3 railCol = moodMix(vec3(0.24, 0.34, 0.42), vec3(0.26, 0.20, 0.28), vec3(0.025, 0.042, 0.088), sunset, night);
      skyRefl = mix(skyRefl, railCol, subRail * mix(0.26, 0.22, night));
    }

    // 3. Soft liquid wave-dispersed golden window shimmer beneath the distant 5-car train!
    if ((sunset + night) > 0.04 && uTrainReady > 0.5 && uTrainRect.z > 1.0) {
      float uTx = (p.x + ripX * 1.35 - uTrainRect.x) / uTrainRect.z;
      if (uTx > 0.005 && uTx < 0.995) {
        float winReflCenter = uTrainRect.w * 0.52;
        float distBelow = max(0.0, depthPx - winReflCenter * 0.65);
        float disp = (0.009 + 0.026 * clamp(distBelow / (75.0 * trS), 0.0, 1.0)) * (0.75 + 0.65 * ripAmt);
        float winBlur = texture(uTrainWinTex, vec2(uTx, 0.37)).r * 0.30
                      + (texture(uTrainWinTex, vec2(clamp(uTx - disp, 0.0, 1.0), 0.37)).r
                       + texture(uTrainWinTex, vec2(clamp(uTx + disp, 0.0, 1.0), 0.37)).r) * 0.22
                      + (texture(uTrainWinTex, vec2(clamp(uTx - disp * 2.1, 0.0, 1.0), 0.37)).r
                       + texture(uTrainWinTex, vec2(clamp(uTx + disp * 2.1, 0.0, 1.0), 0.37)).r) * 0.13;
        float belowWin = ss(winReflCenter * 0.50, winReflCenter * 1.15, depthPx);
        float trailEnv = belowWin * exp(-distBelow / ((24.0 + 40.0 * night) * trS));
        float waveBreak = ss(0.36, 0.84, 0.50 + nRip1 * 0.88 + nRip2 * 0.62);
        // Kelvin wave crests directly beneath the lit train cars also catch sparkling warm golden cabin reflections!
        float kelvinWinCatch = kelvinCrest * exp(-distBelow / (95.0 * trS)) * 0.55;
        skyRefl += vec3(1.06, 0.76, 0.34) * winBlur * (trailEnv * (0.18 + 0.82 * waveBreak) + kelvinWinCatch) * (0.16 * sunset + 0.36 * night);
      }

      // Delicate warm headlight glint kissing the mirror water just ahead of the train's left nose!
      vec2 headWaterPt = vec2(uTrainRect.x - 32.0 * trS, horizonY + 10.0 * trS);
      vec2 hd = (p - headWaterPt) / vec2(36.0 * trS, 9.0 * trS);
      float headGlint = exp(-dot(hd, hd)) * (0.55 + 0.45 * ss(-0.3, 0.5, nRip1 + nRip2));
      skyRefl += vec3(1.04, 0.84, 0.46) * headGlint * (0.10 * sunset + 0.22 * night);
    }

    // 4. Delicate glass-water Fresnel tint + subtle left-to-right Aurora/Moon hemispherical sky-dome bounce!
    vec3 ngtWaterTint = mix(vec3(0.024, 0.072, 0.132), vec3(0.028, 0.062, 0.148), ss(0.15, 0.80, p.x / cssRes.x));
    vec3 waterTint = moodMix(
      vec3(0.38, 0.64, 0.84),
      vec3(0.44, 0.38, 0.58),
      ngtWaterTint,
      sunset, night
    );
    float fresnelWater = mix(0.0, 0.25, pow(waterDepth, 0.82)) * mix(1.0, 0.85, night);
    col = mix(skyRefl, waterTint, fresnelWater);

    // 5. PHYSICALLY ACCURATE SMOOTH MOONBEAM / SUN GLITTER PATH ON THE MIRROR SEA!
    col += evalCelestialWaterPath(p, cssRes, horizonY, depthPx, waterDepth, zSurf, surfX, nRip1, nRip2, ripX, ripAmt, sunset, night);

    // 5b. DIRECTIONAL KELVIN WAKE WAVE-CREST SPECULAR SHEEN (catches real sky/Moon/Sunset light strictly on wave ridges!)
    if (kelvinCrest > 0.005) {
      vec2 lPos = primaryLightPos(cssRes, horizonY, sunset, night);
      float lightProx = 0.55 + 0.45 * exp(-abs(p.x - lPos.x) / (cssRes.x * 0.48));
      vec3 kSpecCol = moodMix(vec3(0.94, 0.98, 1.00), vec3(1.02, 0.82, 0.68), vec3(0.62, 0.78, 0.96), sunset, night);
      col += kSpecCol * kelvinCrest * lightProx * mix(0.24, 0.28, max(sunset, night));
    }

    // 6. True 3D Projective Horizontal Water-Glint Streaks + soft liquid icon water shimmer!
    float glint = evalProjectiveGlints(p, cssRes, waterDepth, wt, ripAmt);
    vec3 glintCol = moodMix(vec3(0.95, 0.98, 1.00), vec3(0.96, 0.86, 0.82), vec3(0.54, 0.78, 0.92), sunset, night);
    col = mix(col, glintCol, clamp(glint, 0.0, 0.52));
    if (iconShimmer > 0.002) {
      vec3 shCol = moodMix(vec3(0.92, 0.98, 1.00), vec3(0.98, 0.82, 0.68), vec3(0.38, 0.86, 0.68), sunset, night);
      col += shCol * iconShimmer;
    }

    // Hydrodynamic keel & turbulent stern slipstream lace foam (catches warm cabin amber right beneath the cars!)
    if (wakeRibbon > 0.005) {
      vec3 wakeCol = moodMix(vec3(0.98, 0.99, 1.00), vec3(1.00, 0.88, 0.74), vec3(0.60, 0.76, 0.94), sunset, night);
      if ((sunset + night) > 0.04 && uTrainRect.z > 1.0) {
        float uF = (p.x - uTrainRect.x) / uTrainRect.z;
        if (uF > 0.01 && uF < 0.99) {
          float wWarm = texture(uTrainWinTex, vec2(uF, 0.37)).r;
          wakeCol = mix(wakeCol, vec3(1.04, 0.82, 0.46), wWarm * (0.24 * sunset + 0.52 * night));
        }
      }
      col = mix(col, wakeCol, clamp(wakeRibbon, 0.0, 0.60));
    }

    // Ultra-delicate seamless atmospheric horizon mist transition (never a harsh horizontal cut line!)
    float horLine = exp(-depthPx / 3.2);
    vec3 horCol = moodMix(vec3(0.86, 0.94, 0.99), vec3(0.84, 0.66, 0.62), vec3(0.12, 0.20, 0.36), sunset, night);
    col = mix(col, horCol, horLine * 0.11);
  }

  // Unified stationary Studio Ghibli gouache paper stipple grain
  col *= 1.0 + (g1 - 0.5) * mix(0.025, 0.034, max(night, sunset * 0.50));

  // Gentle photographic filmic rolloff
  vec3 cSafe = max(col, vec3(0.0));
  float fLum = dot(cSafe, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = cSafe / (1.0 + max(0.0, fLum - 0.78) * 0.48);
  vec3 hiTarget = mix(vec3(1.00, 0.96, 0.89), vec3(0.95, 0.98, 1.00), night);
  mapped = mix(mapped, hiTarget, ss(0.84, 1.65, fLum) * 0.25);

  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}
`;
