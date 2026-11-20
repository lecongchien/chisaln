/**
 * Theme #3: Alpine Moving Castle ("Lâu đài trên đồi gió") — Kazuo Oga Gouache WebGL2 Shader
 * Zero-plastic hand-painted Studio Ghibli craft:
 *   1. Crisp Alpine Sky (Day cerulean / Golden Alpenglow Sunset / Starlit Night with real crescent moon & stars)
 *   2. Sharp faceted Ridged-Multifractal Alps peaks (sunlit snow gullies vs cool slate-blue rock cliffs + gouache stipple!)
 *   3. Sculpted Ghibli cel-shaded cumulus clouds & billowing mountain valley mist banks (crisp lit tops + lavender undersides!)
 *   4. Aerial-perspective graded Moving Castle striding BEHIND the foreground grass crest (Calcifer glowing windows at dusk/night!)
 *   5. Rich Kazuo Oga gouache alpine hillside: layered sunlit emerald swells, rocky hill outcrops, slow wind-combed turf waves,
 *      seamless 3x3 painted grass strokes, wildflower specks & soft sunlit golden-meadow icon clearings
 *   6. Hand-painted Thatched Cottage, Cloaked Shepherd & Fluffy Sheep Flock overlay
 *   7. Whisper-delicate occasional Studio Ghibli wind ribbons & nocturnal fireflies
 */
export const CASTLE_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform sampler2D uCastleTex;
uniform sampler2D uFieldTex;
uniform sampler2D uAlpsTex;

uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uStep;
uniform float uDpr;
uniform float uMix;
uniform float uTime;
uniform float uWindTime;
uniform float uAdaptive;
uniform float uMist;
uniform float uSunset;
uniform float uNight;
uniform float uGust;
uniform float uMoonOcc;
uniform float uMoonVis;
uniform float uSunOcc;
uniform float uSunVis;
uniform float uAlpsReady;
uniform float uShowMeteors;
uniform float uSeed;

uniform vec4 uCastleRect;
uniform vec4 uWindFronts[3];
uniform vec4 uWindA[4];
uniform vec4 uWindB[4];
uniform vec4 uWindC[4];

out vec4 fragColor;

const vec2 WIND_DIR  = vec2(0.956, 0.292);
const vec2 WIND_PERP = vec2(-0.292, 0.956);

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

// Poetic Alpine Night Shooting Stars (pure ALU, zero texture fetches, 60 FPS!)
vec3 alpineShootingStars(vec2 p, vec2 cssRes, float t, float night, vec2 moonPos, float mRad) {
  if (night < 0.03) return vec3(0.0);
  float ny = p.y / max(1.0, cssRes.y);
  if (ny > 0.48) return vec3(0.0);

  vec3 acc = vec3(0.0);
  float vertFade = 1.0 - ss(0.26, 0.46, ny);
  float glareMask = ss(mRad * 1.2, mRad * 2.9, length(p - moonPos));

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float period   = (i == 0) ? 6.8  : ((i == 1) ? 11.4 : 16.3);
    float phaseOff = (i == 0) ? 5.0  : ((i == 1) ? 6.2  : 2.5);
    float dur      = (i == 0) ? 0.92 : ((i == 1) ? 0.82 : 0.74);

    float shifted = t + phaseOff;
    float cyc = floor(shifted / period);
    float localT = shifted - cyc * period;
    if (localT > dur) continue;

    float prog = localT / dur;
    float env = ss(0.0, 0.14, prog) * (1.0 - ss(0.60, 1.0, prog));
    if (env <= 0.004) continue;

    float h1 = hash2(vec2(cyc * 19.1 + fi * 29.3, fi * 13.7 + 5.1));
    float h2 = hash2(vec2(cyc * 31.7 + fi * 11.3, fi * 9.1  + 21.4));
    float h3 = hash2(vec2(cyc * 47.3 + fi * 21.9, fi * 17.1 + 7.8));

    vec2 dir = normalize(vec2(-0.86 - (h3 - 0.5) * 0.14, 0.46 + (h3 - 0.5) * 0.12));
    vec2 start = vec2(cssRes.x * (0.20 + h1 * 0.72), cssRes.y * (0.02 + h2 * 0.17));
    float travel = cssRes.x * (0.14 + h2 * 0.12) * ((i == 2) ? 0.78 : 1.0);
    vec2 head = start + dir * (travel * prog * (1.12 - 0.12 * prog));

    float tailLen = travel * (0.46 + 0.14 * h1) * ss(0.0, 0.26, prog) * (1.0 - ss(0.74, 1.0, prog) * 0.42);
    vec2 q = p - head;
    float along = -dot(q, dir);
    float perp  = abs(-q.x * dir.y + q.y * dir.x);
    if (perp > 22.0 || along < -20.0 || along > tailLen + 12.0) continue;

    float tNorm = clamp(along / max(tailLen, 1.0), 0.0, 1.0);
    float wCore = 1.45 * (1.0 - tNorm * 0.78) + 0.22;
    float wGlow = 5.40 * (1.0 - tNorm * 0.72) + 1.10;
    float longFade = ss(-2.2, 2.0, along) * pow(max(0.0001, 1.0 - tNorm), 1.85);
    float shimmer = 0.85 + 0.15 * sin(along * 0.34 - t * 14.0) * cos(along * 0.18 + h1 * 9.0);
    float core = exp(-sq(perp / wCore)) * longFade * shimmer;
    float glow = exp(-sq(perp / wGlow)) * longFade * 0.28;

    float dHead = length(q);
    float headCore = exp(-sq(dHead / 2.0)) * 1.28;
    float headHalo = exp(-sq(dHead / 8.8)) * 0.34;
    float crossGlint = (exp(-sq(q.x / 1.0) - sq(q.y / 8.2)) + exp(-sq(q.y / 1.0) - sq(q.x / 8.2))) * 0.28;

    vec3 cHead = vec3(1.05, 1.04, 0.98);
    vec3 cMid  = vec3(0.76, 0.91, 1.00);
    vec3 cTail = vec3(0.54, 0.66, 0.96);
    vec3 tailCol = mix(mix(cHead, cMid, ss(0.0, 0.22, tNorm)), cTail, ss(0.28, 0.95, tNorm));

    float slotBright = ((i == 0) ? 0.94 : ((i == 1) ? 0.74 : 0.60)) * env * night * vertFade * glareMask;
    acc += (tailCol * (core + glow) + cHead * (headCore + crossGlint) + cMid * headHalo) * slotBright;
  }
  return acc;
}

vec4 N(vec2 p, float scale) {
  return texture(uNoise, p / scale + uSeed * 0.017);
}

float fieldS(vec2 p) {
  vec2 uv = (p / uStep + 0.5) / uGrid;
  return mix(texture(uFA, uv).r, texture(uFB, uv).r, uMix);
}

// Iconic sloping green alpine ridge descending from upper-left to lower-right
float hillsideRidgeY(float nx, float H) {
  float slope = 0.455 + nx * 0.210;
  float gentleUndul = sin(nx * 4.8 + 0.4) * 0.012 + sin(nx * 10.6 + 1.6) * 0.004;
  return (slope + gentleUndul) * H;
}

// Sculpted billowing Studio Ghibli cumulus clouds (3 texture fetches, early-out when empty!)
// Physically flips light probe from top-left (day/night) to underlit bottom-left (low sunset sun!)
// Returns vec2(alpha, litFactor)
vec2 ghibliCloudField(vec2 p, float scaleX, float scaleY, float driftX, float coverage, float sunset) {
  if (coverage <= 0.015) return vec2(0.0);
  vec2 q = vec2(p.x - driftX, p.y) * vec2(1.0 / scaleX, 1.0 / scaleY);
  vec4 t1 = N(q * 56.0, 256.0);
  float d2 = N(q * 112.0 + vec2(41.0, 19.0), 256.0).r;
  float shape = t1.r * 0.56 + d2 * 0.30 + t1.g * 0.14;

  float thresh = 1.0 - coverage;
  float alpha = ss(thresh - 0.045, thresh + 0.055, shape);
  if (alpha <= 0.004) return vec2(0.0);

  // Day/Night: overhead upper-left probe (-0.18, -0.26). Sunset: low horizon sun under-lights bellies (-0.06, +0.24)!
  vec2 qLit = q + mix(vec2(-0.18, -0.26), vec2(-0.06, 0.24), sunset);
  float shapeLit = N(qLit * 56.0, 256.0).r * 0.72 + t1.g * 0.28;
  float rim = ss(-0.10, 0.11, shape - shapeLit) * 0.68 + ss(thresh, thresh + 0.24, shape) * 0.32;
  return vec2(alpha, clamp(rim, 0.0, 1.0));
}

// Shared high-altitude sky cloud deck: powers sky clouds & fiery sunset / silver-lining forward scattering!
vec2 skyCloudAt(vec2 pos, vec2 cssRes, float wt, float mist, float night, float sunset) {
  float nyPos = pos.y / max(1.0, cssRes.y);
  float hiBand = 1.0 - ss(0.26, 0.50, nyPos);
  float cov = mix(0.46, 0.52, night) * hiBand * (0.52 + 0.48 * mist);
  return ghibliCloudField(pos, 380.0, 210.0, wt * 13.5, cov, sunset);
}

// Soft feathered ground-projected cloud shadow (2 fetches + wide penumbra -> NEVER sharp cutout blobs on grass!)
float skyCloudShadowAt(vec2 pos, vec2 cssRes, float wt, float mist, float night) {
  float nyPos = pos.y / max(1.0, cssRes.y);
  float hiBand = 1.0 - ss(0.26, 0.50, nyPos);
  float cov = mix(0.46, 0.52, night) * hiBand * (0.52 + 0.48 * mist);
  if (cov <= 0.015) return 0.0;
  vec2 q = vec2(pos.x - wt * 13.5, pos.y) * vec2(1.0 / 380.0, 1.0 / 210.0);
  vec4 t1 = N(q * 56.0, 256.0);
  float d2 = N(q * 112.0 + vec2(41.0, 19.0), 256.0).r;
  float shape = t1.r * 0.56 + d2 * 0.30 + t1.g * 0.14;
  float thresh = 1.0 - cov;
  return ss(thresh - 0.16, thresh + 0.18, shape);
}

// 3-Tier Depth-Layered Cascade Hillside Wind (Studio Ghibli Multiplane Parallax!)
// Optimized: 3 total noise fetches outside the loop (was 9 inside loop!)
vec2 layeredHillsideWind(vec2 p, float nx, float hillDepth, float wt, float gust) {
  float perspDepth = pow(clamp(hillDepth, 0.0, 1.0), 0.72);
  float c1 = N(p * vec2(0.42, 1.35), 1180.0).r - 0.5;
  float c2 = N(p * vec2(0.78, 1.85) + vec2(93.0, 41.0), 620.0).g - 0.5;
  float terraceStep = sin(perspDepth * 9.4248) * 0.022;
  float cascadeS = perspDepth * 0.74 + nx * 0.36 + c1 * 0.145 + c2 * 0.052 + terraceStep;

  // Shared cross-wind organic breakup sampled ONCE (shifted analytically per front!)
  float basePatch = N(p + vec2(-wt * 26.0, 31.0), 760.0).r;

  float crest  = 0.0;
  float trough = 0.0;

  for (int i = 0; i < 3; i++) {
    vec4 wf = uWindFronts[i];
    if (wf.z <= 0.005) continue;

    float wLoc = wf.y * (0.58 + 0.85 * hillDepth);
    float frontCurve = sin(nx * 5.2 + wf.w + c1 * 2.4) * 0.036;
    float d = (cascadeS + frontCurve - wf.x) / max(0.022, wLoc);
    if (d < -2.6 || d > 1.8) continue;

    float leadCrest   = exp(-pow((d - 0.16) / 0.58, 2.0));
    float trailTrough = exp(-pow((d + 0.72) / 0.84, 2.0));
    float rebound     = exp(-pow((d + 1.62) / 0.62, 2.0)) * 0.30;

    // C-infinity smooth periodic modulation (ZERO fract() sawtooth cliff discontinuity on grass!)
    float patchPhase = (basePatch + wf.w * 0.13 + sin(p.y * 0.006 + wf.w) * 0.12) * 6.2831853;
    float patchM = 0.42 + 0.58 * (0.5 + 0.5 * cos(patchPhase));
    float amp = wf.z * patchM;

    crest  = max(crest,  (leadCrest + rebound) * amp);
    trough = max(trough, trailTrough * amp);
  }

  float ambScale = mix(0.015, 0.0062, hillDepth);
  float ambAlong = dot(p, WIND_DIR) * ambScale + c1 * 3.8;
  float ambWave  = 0.5 + 0.5 * sin(ambAlong - wt * (1.25 + 0.45 * hillDepth));
  float ambCrest = pow(ambWave, 1.8) * (0.45 + 0.55 * basePatch) * (0.14 + 0.10 * gust);

  return vec2(clamp(crest * 1.08 + ambCrest, 0.0, 1.0), clamp(trough * 1.04, 0.0, 1.0));
}

// Organic Kazuo Oga upright fanned grass tufts (\ | /) curving gracefully in wind (2x2 clip-free, ZERO hair!)
vec2 hillsideGrassStrokes(vec2 p, float wt, float windCrest, float gust, float hillDepth) {
  if (hillDepth < 0.18) return vec2(0.0);
  float depthFade = ss(0.18, 0.54, hillDepth);
  const vec2 G = vec2(26.0, 18.0);
  // Shifted 2x2 search guarantees zero clipping for tufts reaching up to 19px tall & 23px downwind
  vec2 c0 = floor((p + vec2(-5.0, 6.5)) / G - 0.5);
  float shade = 0.0;
  float hi = 0.0;
  float persp = 0.54 + 0.72 * hillDepth;

  for (int jy = 0; jy <= 1; jy++) {
    for (int jx = 0; jx <= 1; jx++) {
      vec2 c = c0 + vec2(float(jx), float(jy));
      float h1 = hash2(c + 5.7);
      vec2 cp = (c + 0.5) * G;
      float clumpN = N(cp * vec2(0.65, 1.15), 760.0).r;
      float dens = (0.30 + 0.62 * ss(0.26, 0.74, clumpN)) * ss(0.18, 0.45, hillDepth);
      if (h1 > dens) continue;

      float h2 = hash2(c + 13.1);
      float h3 = hash2(c + 29.4);
      float h4 = hash2(c + 47.9);
      vec2 root = (c + vec2(0.22 + 0.56 * h2, 0.22 + 0.56 * h3)) * G;
      vec2 rel = p - root;
      if (rel.x < -12.0 || rel.x > 22.0 || rel.y < -18.5 || rel.y > 3.5) continue;

      float baseH = min(15.2, (6.0 + 5.4 * h4 * h4) * persp);
      float localW = clamp(windCrest * (0.78 + 0.44 * h2) + gust * 0.12, 0.0, 1.20);
      float flut = sin(wt * (3.0 + h3 * 1.6) + h2 * 6.283 + root.x * 0.03) * (0.05 + localW * 0.13);
      float bend = clamp(0.10 + localW * 0.62 + flut, -0.05, 0.85);
      float tuftAlpha = depthFade * (0.48 + 0.44 * h4);
      int bCount = h4 > 0.34 ? 3 : 2;

      for (int k = 0; k < 3; k++) {
        if (k >= bCount) break;
        float lean0 = (k == 0 ? -0.50 : (k == 1 ? -0.02 : 0.46)) + (h2 - 0.5) * 0.26;
        float hSc   = (k == 0 ?  0.72 : (k == 1 ?  1.00 : 0.82)) + (h3 - 0.5) * 0.16;
        float ox    = (k == 0 ? -1.55 : (k == 1 ?  0.00 : 1.45)) * persp;
        float stiff = (k == 0 ?  0.84 : (k == 1 ?  1.12 : 0.96));
        float wSc   = (k == 0 ?  0.82 : (k == 1 ?  0.96 : 0.86));

        float bh = clamp(baseH * hSc, 2.2, 16.5);
        float bBend = bend * stiff;
        float uRaw = -rel.y / bh;
        float u = clamp(uRaw, 0.0, 1.0);
        float curveX = (lean0 * u + bBend * u * u) * bh;
        float slope = lean0 + 2.0 * bBend * u;
        float dx = ((rel.x - ox) - curveX) * inversesqrt(1.0 + slope * slope);
        float capY = max(0.0, -uRaw) * bh + max(0.0, uRaw - 1.0) * bh;
        float dist = length(vec2(dx, capY));

        float taper = u * (1.22 - 0.22 * u);
        float thick = (0.92 * (1.0 - 0.78 * taper)) * (0.72 + 0.36 * hillDepth) * wSc;
        float rootMerge = ss(0.0, 0.16, u);
        float m = (1.0 - ss(thick * 0.25, thick + 0.55, dist)) * tuftAlpha;
        shade = max(shade, m * (1.0 - ss(0.28, 0.78, u)) * (0.55 + 0.45 * rootMerge));
        hi    = max(hi,    m * ss(0.26, 0.88, u));
      }
    }
  }
  return vec2(shade, hi);
}

// Whisper-delicate occasional Studio Ghibli anime wind ribbons (O(1) per ribbon)
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
    if (x < tailX - len * 0.18 - 32.0 || x > headX + 32.0 || abs(y) > 54.0) continue;

    float amp = wb.y, freq = wb.z, phase = wb.w;
    float yC = amp * sin(x * freq + phase);
    float dy = amp * freq * cos(x * freq + phase);
    float invSlope = inversesqrt(1.0 + dy * dy);

    float u = (x - tailX) / len;
    float a1 = 0.0;
    if (u > 0.0 && u < 1.0) {
      float taper = sin(u * 3.1415926);
      float w1 = 0.16 + 0.80 * pow(taper, 0.85);
      float dist1 = abs(y - yC) * invSlope;
      a1 = (1.0 - ss(w1 * 0.25, w1 + 1.45, dist1)) * pow(taper, 0.82);
    }

    float u2 = (x - (tailX - len * 0.11)) / (len * 0.80);
    float a2 = 0.0;
    if (u2 > 0.0 && u2 < 1.0) {
      float side = wc.y != 0.0 ? -wc.y : 1.0;
      float taper2 = sin(u2 * 3.1415926);
      float yC2 = yC + side * (9.0 + 3.2 * taper2);
      float w2 = 0.14 + 0.44 * pow(taper2, 0.88);
      float dist2 = abs(y - yC2) * invSlope;
      a2 = (1.0 - ss(w2 * 0.25, w2 + 1.25, dist2)) * pow(taper2, 0.88) * 0.34;
    }

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
            float wC = (0.16 + 0.70 * baseJoin) * (0.25 + 0.75 * pow(tipFade, 0.65));
            aCurl = (1.0 - ss(wC * 0.25, wC + 1.35, dSp)) * pow(tipFade, 0.65) * 0.72;
          }
        }
      }
    }
    alpha = max(alpha, max(max(a1, a2), aCurl) * wc.w);
  }
  return clamp(alpha, 0.0, 0.40);
}

vec3 alpineFireflies(vec2 p, float time, float nightAmt) {
  if (nightAmt < 0.03) return vec3(0.0);
  const float CELL = 148.0;
  vec2 baseCell = floor(p / CELL - 0.5);
  vec3 glow = vec3(0.0);
  for (int jy = 0; jy <= 1; jy++) {
    for (int jx = 0; jx <= 1; jx++) {
      vec2 c = baseCell + vec2(float(jx), float(jy));
      float h1 = hash2(c + 23.7);
      if (h1 < 0.60) continue;
      float h2 = hash2(c + 57.1);
      float h3 = hash2(c + 95.4);
      float h4 = hash2(c + 141.9);
      vec2 drift = vec2(
        sin(time * (0.40 + h2 * 0.35) + h3 * 6.283) * 24.0,
        cos(time * (0.35 + h4 * 0.30) + h2 * 6.283) * 18.0
      );
      vec2 pos = (c + vec2(0.22 + h2 * 0.56, 0.22 + h3 * 0.56)) * CELL + drift;
      float d = length(p - pos);
      if (d > 22.0) continue;
      float pulse = pow(clamp(0.5 + 0.5 * sin(time * (1.1 + h4 * 0.9) + h1 * 18.0), 0.0, 1.0), 2.7);
      float core = (1.0 - ss(0.9, 2.3, d)) * 0.95;
      float halo = exp(-d * d / 52.0) * 0.42;
      vec3 fCol = mix(vec3(0.99, 0.84, 0.38), vec3(1.0, 0.97, 0.74), core);
      glow += fCol * (core + halo) * pulse * nightAmt;
    }
  }
  return glow;
}

// Delicate backlit golden dust / dandelion motes drifting along sunset wind shafts (2x2 fast cell loop)
float sunsetSunMotes(vec2 p, float wt, float sunsetAmt) {
  if (sunsetAmt < 0.04) return 0.0;
  const float CELL = 152.0;
  vec2 drifted = p - WIND_DIR * (wt * 26.0);
  vec2 baseCell = floor(drifted / CELL - 0.5);
  float acc = 0.0;
  for (int jy = 0; jy <= 1; jy++) {
    for (int jx = 0; jx <= 1; jx++) {
      vec2 c = baseCell + vec2(float(jx), float(jy));
      float h1 = hash2(c + 71.4);
      if (h1 < 0.66) continue;
      float h2 = hash2(c + 19.3);
      float h3 = hash2(c + 53.8);
      vec2 pos = (c + vec2(0.22 + h2 * 0.56, 0.22 + h3 * 0.56)) * CELL
               + vec2(sin(wt * 1.1 + h2 * 6.283) * 14.0, cos(wt * 0.9 + h3 * 6.283) * 10.0);
      float d = length(drifted - pos);
      if (d > 8.0) continue;
      float tw = 0.45 + 0.55 * sin(wt * 2.1 + h1 * 23.0);
      float core = 1.0 - ss(0.6, 2.2, d);
      float halo = exp(-d * d / 16.0) * 0.35;
      acc += (core + halo) * tw * 0.48;
    }
  }
  return acc * sunsetAmt;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 cssRes = uRes / uDpr;
  float nx = p.x / max(1.0, cssRes.x);
  float ny = p.y / max(1.0, cssRes.y);
  float wt = uWindTime;
  float sunset = clamp(uSunset, 0.0, 1.0);
  float night  = clamp(uNight,  0.0, 1.0);

  // Crisp stationary gouache/print-stipple grain (eliminates smooth CGI plastic gradients everywhere!)
  vec2 gp = floor(p * (0.82 * max(uDpr, 1.0)));
  float g1 = hash2(gp + 0.5);
  float g2 = hash2(gp + 9.7);

  float ridgeY = hillsideRidgeY(nx, cssRes.y);
  float dRidge = p.y - ridgeY;

  // =========================================================================
  // 1. ALPINE SKY, SETTING SUN, FULL MOON + CLOUD-OCCLUSION OPTICS
  // =========================================================================
  vec2 moonPos = vec2(cssRes.x * 0.80, cssRes.y * 0.14);
  float mRad = clamp(min(cssRes.x, cssRes.y) * 0.044, 24.0, 44.0);
  float moonOcc = clamp(uMoonOcc, 0.0, 1.0);
  float moonVis = clamp(uMoonVis, 0.15, 1.0);

  // Setting sun nestled naturally in the open alpine V-pass between Moving Castle & Alps massif!
  vec2 sunPos = vec2(cssRes.x * 0.43, cssRes.y * 0.42);
  float sRad = clamp(min(cssRes.x, cssRes.y) * 0.032, 18.0, 32.0);
  float sunOcc = clamp(uSunOcc, 0.0, 1.0);
  float sunVis = clamp(uSunVis, 0.25, 1.0);

  vec3 skyTopDay = vec3(0.265, 0.585, 0.835);
  vec3 skyBotDay = vec3(0.765, 0.888, 0.948);

  vec3 skyTopNgt = vec3(0.032, 0.072, 0.162) * mix(0.84, 1.12, moonVis);
  vec3 skyBotNgt = vec3(0.105, 0.198, 0.335) * mix(0.78, 1.16, moonVis);

  float skyV = clamp(ny / 0.56 + (g1 - 0.5) * 0.028, 0.0, 1.0);
  vec3 colDay = mix(skyTopDay, skyBotDay, pow(max(0.0001, skyV), 0.86));
  vec3 colNgt = mix(skyTopNgt, skyBotNgt, pow(max(0.0001, skyV), 0.88));

  // Natural Photographic Golden-Hour Rayleigh-Mie sky (visually verified — zero synthwave neon!):
  // twilight steel-blue zenith -> silver-mauve ozone belt -> dusty rose-apricot -> creamy peach-gold horizon
  vec3 skyZenithSun = vec3(0.205, 0.305, 0.465);
  vec3 skyMidHiSun  = vec3(0.465, 0.455, 0.545);
  vec3 skyMidLoSun  = vec3(0.825, 0.565, 0.445);
  vec3 skyHorizSun  = vec3(0.965, 0.775, 0.545);
  vec3 colSun = mix(skyZenithSun, skyMidHiSun, ss(0.00, 0.40, skyV));
  colSun = mix(colSun, skyMidLoSun, ss(0.32, 0.72, skyV));
  colSun = mix(colSun, skyHorizSun, ss(0.64, 1.00, skyV));

  // Radial solar azimuth warmth around the open alpine pass (nx=0.43) vs cooler twilight air toward outer flanks
  float azDist = abs(nx - 0.43);
  float azCool = ss(0.18, 0.65, azDist);
  colSun = mix(colSun, colSun * vec3(0.84, 0.86, 0.98) + vec3(0.015, 0.015, 0.035), azCool * (1.0 - skyV * 0.35) * 0.42);

  vec3 skyBotSun = mix(skyHorizSun, vec3(0.74, 0.58, 0.56), azCool * 0.45);
  vec3 col = mix(mix(colDay, colSun, sunset), colNgt, night);

  // Incandescent HDR Setting Sun nestled in the open alpine V-pass (filmic rolloff -> luminous ivory-gold, zero clip!)
  if (sunset > 0.01 && dRidge < 44.0) {
    vec2 sp = p - sunPos;
    float rSun = length(sp);
    float dSun = rSun - sRad;
    float sDisc = ss(2.4, -1.8, dSun);

    // Balanced creamy-gold Mie aureole + atmospheric horizon haze around the mountain pass
    float innerMie = exp(-max(dSun, 0.0) / (sRad * 2.3)) * (0.44 + 0.22 * sunVis);
    float outerMie = exp(-max(dSun, 0.0) / (sRad * 8.2)) * (0.20 + 0.10 * sunVis);
    float horizGlow = exp(-pow((ny - 0.44) / 0.13, 2.0)) * exp(-pow((nx - 0.43) / 0.38, 2.0)) * 0.22;
    col += vec3(1.00, 0.80, 0.52) * innerMie * sunset;
    col += vec3(0.96, 0.60, 0.36) * (outerMie + horizGlow) * sunset;

    if (sDisc > 0.002) {
      float rN = clamp(rSun / max(1.0, sRad), 0.0, 1.0);
      // True HDR core hotter than Mie corona so filmic tonemap renders pure radiant cream-white core -> apricot edge!
      float limb = pow(max(0.0001, 1.0 - rN * rN), 0.36);
      vec3 discHDR = mix(vec3(1.45, 1.12, 0.72), vec3(2.10, 1.98, 1.72), limb);
      col = mix(col, discHDR, sDisc * sunset * 0.94);
    }
  }

  // Real Alpine Starlit Sky & Luminous Gouache Full Moon high above the right twin peaks!
  if (night > 0.02 && dRidge < 40.0) {
    vec2 stCell = floor(p / 28.0);
    vec2 stUv   = fract(p / 28.0) - 0.5;
    float sh1   = hash2(stCell + 19.3);
    if (sh1 > 0.72) {
      vec2 so = (vec2(hash2(stCell + 5.7), hash2(stCell + 41.2)) - 0.5) * 0.62;
      float sd = length(stUv - so);
      float tw = 0.55 + 0.45 * sin(uTime * (1.8 + sh1 * 2.4) + sh1 * 50.0);
      // Stars dim softly near the radiant full moon glare
      float moonGlareMask = ss(mRad * 1.4, mRad * 4.5, length(p - moonPos));
      float starB = (1.0 - ss(0.025, 0.085, sd)) * tw * (1.0 - ss(0.28, 0.52, ny)) * moonGlareMask * night;
      col = mix(col, vec3(0.93, 0.96, 1.0), starB * 0.88);
    }

    vec2 mp = p - moonPos;
    float rDist = length(mp);
    float dOuter = rDist - mRad;
    float disc = ss(1.4, -1.2, dOuter);

    // Wide atmospheric Mie corona + misty 22-degree lunar halo ring when thin clouds approach!
    float innerCorona = exp(-max(dOuter, 0.0) / (mRad * 1.9)) * (0.34 + 0.24 * moonVis);
    float outerAura   = exp(-max(dOuter, 0.0) / (mRad * 6.2)) * (0.14 + 0.10 * moonVis);
    float veilRing    = exp(-sq((rDist - mRad * 2.35) / (mRad * 0.95))) * (0.04 + 0.15 * moonOcc);
    col += vec3(0.62, 0.80, 0.98) * (innerCorona + outerAura) * night;
    col += vec3(0.76, 0.87, 0.98) * veilRing * night;

    if (disc > 0.002) {
      // Painterly lunar maria (seas) + spherical limb darkening on the Full Moon
      float rNorm = clamp(rDist / max(1.0, mRad), 0.0, 1.0);
      float limb = pow(max(0.0001, 1.0 - rNorm * rNorm), 0.26);
      float m1 = N(mp * 1.85 + vec2(23.0, 11.0), 190.0).r;
      float m2 = N(mp * 3.40 + vec2(61.0, 39.0), 130.0).g;
      float maria = ss(0.42, 0.74, m1 * 0.62 + m2 * 0.38);
      vec3 moonBright = vec3(0.996, 0.984, 0.918);
      vec3 moonMaria  = vec3(0.790, 0.840, 0.888);
      vec3 moonCol = mix(moonBright, moonMaria, maria * 0.44) * mix(0.84, 1.04, limb);
      // Warm luminous rim highlight
      moonCol += vec3(0.08, 0.07, 0.03) * (1.0 - limb);
      col = mix(col, moonCol, disc * night * 0.98);
    }

    if (uShowMeteors > 0.5) {
      col += alpineShootingStars(p, cssRes, uTime, night, moonPos, mRad);
    }
  }

  // Crisp Ghibli painted high cumulus clouds passing IN FRONT of the Setting Sun & Full Moon!
  // At sunset: clean creamy apricot-peach lit bellies near sun + natural dusky slate-mauve shaded backs!
  float cSunFar = ss(0.14, 0.62, azDist);
  vec3 cLitSun = mix(vec3(0.99, 0.86, 0.68), vec3(0.88, 0.68, 0.58), cSunFar * 0.72);
  vec3 cShdSun = mix(vec3(0.56, 0.48, 0.54), vec3(0.36, 0.39, 0.50), cSunFar * 0.78);
  vec3 cLitCol = mix(mix(vec3(0.985, 0.992, 0.988), cLitSun, sunset), vec3(0.56, 0.70, 0.88) * mix(0.62, 1.18, moonVis), night);
  vec3 cShdCol = mix(mix(vec3(0.785, 0.865, 0.925), cShdSun, sunset), vec3(0.16, 0.25, 0.40) * mix(0.72, 1.08, moonVis), night);
  if (dRidge < 24.0) {
    vec2 sc = skyCloudAt(p, cssRes, wt, uMist, night, sunset);
    vec3 skyCloudCol = mix(cShdCol, cLitCol, sc.y);
    if (sunset > 0.02 && sc.x > 0.005) {
      // Silky creamy-gold forward-scattering rim when clouds pass near/over the Setting Sun!
      float dSunC = length(p - sunPos);
      float sProx = exp(-dSunC / (sRad * 5.2));
      float sDiscBehind = exp(-pow(dSunC / (sRad * 1.45), 2.0));
      float thinEdge = sc.x * (1.0 - sc.x * 0.60);
      vec3 fireEdge = vec3(1.00, 0.82, 0.52) * sProx * (0.38 + thinEdge * 1.35);
      vec3 veilSun  = vec3(1.00, 0.84, 0.58) * sDiscBehind * 0.42;
      skyCloudCol = mix(skyCloudCol, vec3(1.00, 0.92, 0.76), clamp(sProx * (0.28 + thinEdge * 0.75), 0.0, 0.85) * sunset);
      skyCloudCol += (fireEdge * 0.28 + veilSun) * sunset;
    }
    if (night > 0.02 && sc.x > 0.005) {
      // Optical silver-lining & forward-scattering glow when clouds pass near/over the Full Moon!
      float dMoon = length(p - moonPos);
      float prox = exp(-dMoon / (mRad * 3.3));
      float discBehind = exp(-pow(dMoon / (mRad * 1.15), 2.0));
      float thinEdge = sc.x * (1.0 - sc.x * 0.62);
      vec3 silverEdge = vec3(0.96, 0.98, 1.00) * prox * (0.55 + thinEdge * 1.35);
      vec3 veilTrans  = vec3(0.82, 0.90, 0.98) * discBehind * 0.48;
      skyCloudCol = mix(skyCloudCol, vec3(0.95, 0.97, 1.0), clamp(prox * (0.35 + thinEdge * 0.85), 0.0, 0.88) * night);
      skyCloudCol += (silverEdge * 0.26 + veilTrans) * night;
    }
    col = mix(col, skyCloudCol, sc.x * mix(0.88, 0.84, max(night, sunset * 0.4)));
  }

  // =========================================================================
  // 2. HAND-PAINTED KAZUO OGA EUROPEAN ALPS MASSIF + BILLOWING VALLEY CLOUDS
  // =========================================================================
  if (dRidge < 24.0) {
    if (uAlpsReady > 0.5) {
      // Map castle-alps.png (1600x722) across the upper-mid alpine panorama,
      // nestled cleanly behind the sloping green ridge with Full Moon cradled in the high saddle!
      float alpsTop = 0.095 * cssRes.y;
      float alpsBot = 0.785 * cssRes.y;
      float aV = (p.y - alpsTop) / max(1.0, alpsBot - alpsTop);
      // Preserve natural mountain proportions on ultrawide / tall displays without stretching
      float screenAspect = cssRes.x / max(1.0, cssRes.y);
      float xSpan = clamp(screenAspect / 1.778, 0.84, 1.18);
      float aU = 0.5 + (nx - 0.5) / xSpan;
      if (aU >= 0.0 && aU <= 1.0 && aV >= 0.0 && aV <= 1.0) {
        vec4 alps = texture(uAlpsTex, vec2(aU, aV));
        if (alps.a > 0.005) {
          float lum = dot(alps.rgb, vec3(0.299, 0.587, 0.114));
          float isSnow = ss(0.60, 0.86, lum);
          float valleyFade = ss(0.32, 0.92, aV);

          // Day: authentic Kazuo Oga gouache painting with delicate distant alpine aerial perspective
          vec3 alpsDay = mix(alps.rgb, skyBotDay, 0.14 + valleyFade * 0.24);

          // Golden Sunset: authentic photographic rose-ivory alpenglow on peaks facing the pass + crisp cool alpine blue-slate rock!
          float sunNearM = exp(-length(p - sunPos) / max(150.0, cssRes.y * 0.46));
          float alpenGlow = 0.35 + 0.65 * ss(0.75, 0.10, azDist);
          vec3 sunRock = alps.rgb * mix(vec3(0.36, 0.40, 0.54), vec3(0.56, 0.45, 0.48), alpenGlow * 0.65) + vec3(0.025, 0.022, 0.045);
          vec3 sunSnow = mix(vec3(0.48, 0.46, 0.58), vec3(0.96, 0.77, 0.63) * mix(0.88, 1.08, sunVis), ss(0.62, 0.94, lum) * (0.40 + 0.60 * alpenGlow));
          vec3 alpsSun = mix(sunRock, sunSnow, isSnow);
          // Warm peach-gold atmospheric haze pooling gently inside the low alpine pass around the setting sun
          alpsSun = mix(alpsSun, skyBotSun, 0.16 + valleyFade * 0.34 + sunNearM * 0.22 * sunVis);

          // Full Moon Night: directional silvery moonlight strongest on right peaks under Full Moon, cooler indigo on far-left!
          float moonSideM = 0.56 + 0.44 * ss(0.06, 0.86, nx);
          vec3 ngtRock = alps.rgb * vec3(0.24, 0.34, 0.50) * mix(0.64, 1.12, moonVis * moonSideM) + vec3(0.015, 0.028, 0.058);
          vec3 ngtSnow = mix(vec3(0.20, 0.31, 0.48), vec3(0.74, 0.86, 0.98) * mix(0.48, 1.20, moonVis * moonSideM), ss(0.64, 0.94, lum));
          vec3 alpsNgt = mix(ngtRock, ngtSnow, isSnow);
          // Soft silvery rim along high alpine ridges facing the upper-right Full Moon
          float moonNear = exp(-length(p - moonPos) / max(140.0, cssRes.y * 0.42));
          alpsNgt += vec3(0.10, 0.18, 0.28) * isSnow * moonNear * moonVis;
          alpsNgt = mix(alpsNgt, skyBotNgt, 0.08 + valleyFade * 0.20);

          vec3 peakCol = mix(mix(alpsDay, alpsSun, sunset), alpsNgt, night);
          col = mix(col, peakCol, alps.a);
        }
      }
    }

    // Sculpted billowing Studio Ghibli cumulus cloud-sea hugging the lower right mountain flank!
    // Early-out in clear high sky to skip redundant cloud fetches!
    if (uMist > 0.02 && p.y > ridgeY - cssRes.y * 0.44) {
      float mistBand = exp(-pow((p.y - (ridgeY - cssRes.y * 0.015)) / (cssRes.y * 0.20), 2.0));
      float rightBias = ss(0.10, 0.58, nx) * 0.78 + 0.22;
      float cov = clamp(mistBand * rightBias * uMist * 1.18, 0.0, 0.92);
      if (cov > 0.02) {
        vec2 vc1 = ghibliCloudField(p + vec2(0.0, 22.0), 320.0, 185.0, wt * 14.0, cov * 0.88, sunset);
        vec2 vc2 = ghibliCloudField(p + vec2(145.0, -10.0), 210.0, 128.0, wt * 21.0, cov * 0.76, sunset);
        float vcAlpha = clamp(max(vc1.x * 0.94, vc2.x * 0.88), 0.0, 0.96);
        if (vcAlpha > 0.004) {
          float vcLit = vc2.x > vc1.x ? vc2.y : vc1.y;
          // Valley mist at sunset stays airy & translucent (warm rose-lavender sky bounce fills shadows — never bruised purple!)
          vec3 vShdSun = mix(vec3(0.66, 0.55, 0.58), vec3(0.46, 0.46, 0.56), cSunFar * 0.75);
          vec3 vLitSun = mix(vec3(0.99, 0.86, 0.68), vec3(0.90, 0.72, 0.62), cSunFar * 0.65);
          vec3 vCloudCol = mix(mix(cShdCol, vShdSun, sunset * (1.0 - night)), mix(cLitCol, vLitSun, sunset * (1.0 - night)), ss(0.20, 0.78, vcLit + (g1 - 0.5) * 0.05));
          if (sunset > 0.02) {
            float vSunNear = exp(-length(p - sunPos) / max(180.0, cssRes.y * 0.55));
            vCloudCol = mix(vCloudCol, vec3(1.00, 0.88, 0.68), vSunNear * 0.48 * sunVis * sunset);
          }
          col = mix(col, vCloudCol, vcAlpha * mix(0.95, 0.82, sunset));
        }
      }
    }
  }

  // Adaptive soft sculpted cloud cushions wrapping icons in the sky region
  float sdf = fieldS(p);
  if (uAdaptive >= 0.5 && dRidge < 16.0) {
    float ic = ss(10.0, -16.0, sdf + (N(p, 210.0).g - 0.5) * 16.0) * ss(16.0, -24.0, dRidge);
    col = mix(col, mix(cShdCol, cLitCol, 0.72), ic * 0.68);
  }

  // =========================================================================
  // 3. MOVING CASTLE WALKING BEHIND THE SUNLIT/MOONLIT GREEN RIDGE CREST
  // =========================================================================
  if (uCastleRect.z > 1.0 && dRidge < 14.0) {
    vec2 cUV = (p - uCastleRect.xy) / uCastleRect.zw;
    if (cUV.x >= 0.0 && cUV.x <= 1.0 && cUV.y >= 0.0 && cUV.y <= 1.0) {
      vec4 castC = texture(uCastleTex, cUV);
      if (castC.a > 0.005) {
        // Warm glowing Calcifer windows pop EVEN WARMER when passing clouds dim the moonlight!
        float amberWin = ss(0.18, 0.42, castC.r - castC.b) * ss(0.45, 0.75, castC.r) * ss(0.24, 0.55, castC.g);
        vec3 aerialTint = mix(mix(vec3(0.74, 0.86, 0.93), vec3(0.84, 0.60, 0.48), sunset), vec3(0.18, 0.28, 0.44) * mix(0.70, 1.15, moonVis), night);
        vec3 castBase = mix(castC.rgb, aerialTint, mix(0.14, 0.24, max(night, sunset * 0.90)));
        // Sunset: deeper cinematic backlit silhouette with crisp warm golden rim along the flank facing the sun pass (nx=0.43)!
        float castleCenterNx = (uCastleRect.x + uCastleRect.z * 0.5) / max(1.0, cssRes.x);
        float sunOnRight = castleCenterNx < 0.43 ? 1.0 : 0.0;
        float rimCoord = mix(1.0 - cUV.x, cUV.x, sunOnRight);
        float sunSideC = ss(0.32, 0.92, rimCoord);
        float isSmokeC = (1.0 - ss(0.28, 0.86, castC.a)) * (1.0 - ss(0.45, 0.85, cUV.y));
        vec3 castSun  = castBase * mix(vec3(0.46, 0.42, 0.52), vec3(0.96, 0.72, 0.48), sunSideC * sunVis)
                      + vec3(0.16, 0.08, 0.02) * sunSideC * sunSideC * sunVis
                      + vec3(0.24, 0.14, 0.06) * isSmokeC * sunVis;
        // Moonlit silver sheen on upper-right side of castle facing the Full Moon
        float moonSide = ss(0.32, 0.88, cUV.x) * (1.0 - ss(0.48, 0.92, cUV.y));
        vec3 castNgt  = castBase * vec3(0.44, 0.55, 0.75) * mix(0.64, 1.18, moonVis)
                      + vec3(0.015, 0.026, 0.054)
                      + vec3(0.14, 0.22, 0.34) * moonSide * moonVis;
        vec3 castGraded = mix(mix(castBase, castSun, sunset), castNgt, night);
        vec3 winGlow = vec3(1.00, 0.78, 0.34) * (1.16 + 0.14 * (1.0 - moonVis) + 0.12 * sin(uTime * 3.4 + p.x * 0.1));
        castGraded = mix(castGraded, winGlow, amberWin * max(sunset * 0.86, night * 0.96));

        float legMist = ss(ridgeY - 58.0, ridgeY + 8.0, p.y) * uMist * 0.22;
        castGraded = mix(castGraded, cLitCol, legMist);
        col = mix(col, castGraded, castC.a);
      }
    }
  }

  // =========================================================================
  // 4. KAZUO OGA GOUACHE SLOPING ALPINE HILLSIDE — 3-TIER LAYERED WIND + MOON!
  // =========================================================================
  float gustAmt = clamp(uGust, 0.0, 1.0);
  float rawHillDepth = clamp(dRidge / max(80.0, cssRes.y * 0.55), 0.0, 1.0);
  vec2 windW = dRidge > -10.0 ? layeredHillsideWind(p, nx, rawHillDepth, wt, gustAmt) : vec2(0.0);
  float windWave = windW.x;
  float windTrough = windW.y;

  // Compute physical lunar (Night) & golden-hour solar (Sunset) hillside illumination:
  // Combines direct disc occlusion (moonVis / sunVis) + soft feathered ground-projected sky cloud shadows!
  float hillMoonLit = moonVis;
  if (night > 0.02 && dRidge > -30.0) {
    vec2 projSky = vec2(mix(p.x, moonPos.x, 0.44), cssRes.y * 0.16 + max(0.0, dRidge) * 0.24);
    float projCloud = skyCloudShadowAt(projSky, cssRes, wt, uMist, night);
    hillMoonLit = clamp(moonVis * (1.0 - projCloud * 0.54), 0.15, 1.0);
  }
  float hillSunLit = sunVis;
  if (sunset > 0.02 && dRidge > -30.0) {
    vec2 projSunSky = vec2(mix(p.x, sunPos.x, 0.50), cssRes.y * 0.24 + max(0.0, dRidge) * 0.18);
    float projSunCloud = skyCloudShadowAt(projSunSky, cssRes, wt, uMist, 0.0);
    hillSunLit = clamp(sunVis * (1.0 - projSunCloud * 0.52), 0.24, 1.0);
  }

  if (dRidge > -6.0) {
    // Organic wind-rippled tufted grass skyline lip reacting right as Tier 1 crosses the distant ridge!
    float crestWave = sin(p.x * 0.022 - wt * 2.5) * (0.9 + windWave * 2.6);
    float crestJit = (N(vec2(p.x * 1.4 - wt * 14.0, 17.0), 48.0).g - 0.5) * 4.8 + crestWave + (g2 - 0.5) * 1.4;
    float hillMask = ss(-1.6, 1.6, dRidge + crestJit);
    float hillDepth = rawHillDepth;

    // Refined Kazuo Oga Daytime meadow (rich lush emerald depth matching original Howl's Moving Castle painting!)
    vec3 gCrestDay = vec3(0.655, 0.785, 0.365);
    vec3 gMidDay   = vec3(0.395, 0.635, 0.270);
    vec3 gDeepDay  = vec3(0.225, 0.445, 0.215);
    vec3 gGustDay  = vec3(0.805, 0.885, 0.475);
    vec3 gInkDay   = vec3(0.165, 0.325, 0.145);

    // Photographic Golden-Hour Sunset meadow (visually verified luminance hierarchy — sky glows above deep velvety dusk grass!):
    float sGain = mix(0.74, 1.12, hillSunLit);
    vec3 gCrestSun = vec3(0.435, 0.395, 0.195) * sGain;
    vec3 gMidSun   = vec3(0.215, 0.295, 0.175) * mix(0.80, 1.08, hillSunLit);
    vec3 gDeepSun  = vec3(0.095, 0.160, 0.175);
    vec3 gGustSun  = vec3(0.695, 0.515, 0.235) * sGain;
    vec3 gInkSun   = vec3(0.075, 0.125, 0.130);

    // Night meadow palette dynamically shifts between deep indigo shade (clouded)
    // and luminous silvery-teal moonlit meadow (clear full moon)!
    float mGain = mix(0.54, 1.24, hillMoonLit);
    vec3 gCrestNgt = vec3(0.165, 0.305, 0.345) * mGain;
    vec3 gMidNgt   = vec3(0.088, 0.192, 0.242) * mix(0.62, 1.18, hillMoonLit);
    vec3 gDeepNgt  = vec3(0.042, 0.104, 0.160) * mix(0.74, 1.06, hillMoonLit);
    vec3 gGustNgt  = vec3(0.295, 0.495, 0.560) * mGain;
    vec3 gInkNgt   = vec3(0.022, 0.058, 0.102);

    vec3 gCrest = mix(mix(gCrestDay, gCrestSun, sunset), gCrestNgt, night);
    vec3 gMid   = mix(mix(gMidDay,   gMidSun,   sunset), gMidNgt,   night);
    vec3 gDeep  = mix(mix(gDeepDay,  gDeepSun,  sunset), gDeepNgt,  night);
    vec3 gGust  = mix(mix(gGustDay,  gGustSun,  sunset), gGustNgt,  night);
    vec3 gInk   = mix(mix(gInkDay,   gInkSun,   sunset), gInkNgt,   night);

    // Painterly terraced gouache hillocks with stipple-dithered tone edges
    float wA = N(p * vec2(0.42, 1.45), 1180.0).r;
    float wB = N(p * vec2(0.72, 1.75) + 190.0, 820.0).g;
    float bandVal = clamp(hillDepth * 0.62 + (wA * 0.64 + wB * 0.36 - 0.46) * 0.76 + (g1 - 0.5) * 0.075, 0.0, 1.0);
    vec3 hillCol = mix(gCrest, gMid, ss(0.12, 0.52, bandVal));
    hillCol = mix(hillCol, gDeep, ss(0.56, 0.90, bandVal) * 0.68);

    // Subtle painterly alpine limestone rocks peeking out along mid-hillside
    float rockSpot = ss(0.75, 0.84, N(p * vec2(0.85, 2.2) + 41.0, 290.0).g) * ss(0.05, 0.22, hillDepth) * (1.0 - ss(0.55, 0.78, hillDepth));
    vec3 stoneCol = mix(mix(vec3(0.74, 0.76, 0.71), vec3(0.72, 0.60, 0.54), sunset), vec3(0.26, 0.35, 0.44) * mix(0.62, 1.24, hillMoonLit), night);
    hillCol = mix(hillCol, stoneCol, rockSpot * 0.58);

    // Silky Kazuo Oga wind-combed gouache grass carpet (calibrated for uNoise .g/.a -> lush brushwork!)
    vec2 windUV = vec2(dot(p, WIND_DIR) * (0.34 + 0.14 * (1.0 - hillDepth)), dot(p, WIND_PERP) * (1.42 + 0.45 * (1.0 - hillDepth)));
    vec2 shift = vec2(-windWave * (11.0 + 12.0 * hillDepth) - sin(wt * 1.9 + windUV.y * 0.018) * (1.1 + windWave * 1.6), windWave * (1.6 + 1.6 * hillDepth));
    float turfA = N(windUV + shift, 760.0).g;
    float turfB = N(windUV * 1.38 + shift * 1.25 + vec2(41.0, 17.0), 560.0).a;
    float combed = turfA * 0.58 + turfB * 0.42;

    // Distinct leading sunlit wave crest + deep pressed emerald trailing trough per wind tier!
    hillCol = mix(hillCol, gDeep * 0.78, (windTrough * 0.74 + ss(0.52, 0.18, combed) * 0.28) * mix(0.42, 0.36, night));
    hillCol = mix(hillCol, gGust, (windWave * 0.78 + ss(0.52, 0.86, combed) * 0.28) * mix(0.52, 0.44 * hillMoonLit + 0.10, night));

    // Soft rolling sunlit pastoral dirt path sweeping naturally near lower-left cottage lane
    float pathCurveY = ridgeY + cssRes.y * (0.295 - 0.045 * sin(nx * 4.2));
    float pathDist = abs(p.y - pathCurveY) / max(14.0, cssRes.y * 0.042);
    float pathMask = (1.0 - ss(0.35, 1.35, pathDist + (N(p, 190.0).r - 0.5) * 0.85)) * ss(0.05, 0.20, nx) * (1.0 - ss(0.45, 0.72, nx));
    vec3 dirtDay = vec3(0.835, 0.760, 0.565);
    vec3 dirtSun = vec3(0.790, 0.625, 0.450);
    vec3 dirtNgt = vec3(0.240, 0.295, 0.345) * mix(0.62, 1.20, hillMoonLit);
    vec3 dirtCol = mix(mix(dirtDay, dirtSun, sunset), dirtNgt, night) * (0.94 + 0.12 * N(p, 95.0).b);
    hillCol = mix(hillCol, dirtCol, pathMask * 0.58);

    // Daytime drifting cloud shadow on hillside (at night/sunset, enhanced by physical ray-projected sky shadows!)
    float cloudSh = ss(0.52, 0.76, N(p + vec2(-wt * 24.0, -wt * 6.0), 1340.0).r);
    vec3 hillShTint = mix(vec3(0.64, 0.76, 0.67), vec3(0.54, 0.50, 0.74), sunset);
    hillCol = mix(hillCol, hillCol * hillShTint, cloudSh * mix(0.46, 0.38, sunset) * (1.0 - night));

    // Golden-Hour grazing warm amber rim along the top ridge near the open sun pass (nx=0.43) + cool twilight foreground depth!
    if (sunset > 0.02) {
      float passBias  = exp(-pow((nx - 0.43) / 0.46, 2.0));
      float ridgeRimS = exp(-max(0.0, dRidge) / max(24.0, cssRes.y * 0.068)) * passBias;
      hillCol += vec3(0.24, 0.13, 0.035) * (ridgeRimS * 0.85 + windWave * 0.18 * passBias) * hillSunLit * sunset;
      // Cool poetic twilight depth settling smoothly into lower foreground meadow
      float duskFg = ss(0.26, 1.0, hillDepth);
      hillCol = mix(hillCol, hillCol * vec3(0.74, 0.78, 0.96) + vec3(0.008, 0.010, 0.028), duskFg * sunset * 0.44);
    }

    // Directional silvery Full Moon beam bathing the right-facing & crest slopes when unoccluded!
    if (night > 0.02) {
      float ridgeRim = exp(-max(0.0, dRidge) / max(32.0, cssRes.y * 0.095));
      float moonPool = exp(-pow((nx - 0.76) / 0.52, 2.0)) * (0.58 + 0.42 * (1.0 - hillDepth));
      float silverSheen = (ridgeRim * 0.48 + moonPool * 0.52 + windWave * 0.28) * hillMoonLit * night;
      hillCol += vec3(0.145, 0.235, 0.315) * silverSheen;
    }

    // Subtle sunlit golden-meadow icon clearings
    if (uAdaptive >= 0.5) {
      float clearM = ss(16.0, -18.0, sdf + (N(p, 190.0).g - 0.5) * 14.0) * ss(10.0, 44.0, dRidge);
      vec3 clearCol = mix(gCrest * 1.05, dirtCol, 0.42);
      hillCol = mix(hillCol, clearCol, clearM * 0.54);
    }

    // Organic upright fanned grass tufts melting naturally out of the hillside (parting around dirt lane & rocks!)
    float tuftZone = (1.0 - pathMask * 0.88) * (1.0 - rockSpot * 0.85);
    if (tuftZone > 0.04 && hillDepth >= 0.18) {
      vec2 strokes = hillsideGrassStrokes(p, wt, windWave, gustAmt, hillDepth) * tuftZone;
      vec3 tuftRootCol = hillCol * mix(mix(vec3(0.74, 0.81, 0.76), vec3(0.64, 0.66, 0.78), sunset), vec3(0.72, 0.78, 0.84), night);
      vec3 tuftTipSun  = mix(hillCol * 1.15, vec3(0.78, 0.58, 0.28), 0.42 + 0.40 * hillSunLit);
      vec3 tuftTipCol  = mix(mix(mix(hillCol, gGust * 1.04, 0.70), tuftTipSun, sunset), mix(hillCol, gGust * 1.05, 0.56 * hillMoonLit + 0.16), night);
      hillCol = mix(hillCol, tuftRootCol, strokes.x * mix(0.54, 0.50, night));
      hillCol = mix(hillCol, tuftTipCol,  strokes.y * mix(mix(0.58, 0.62, sunset), 0.56 * hillMoonLit + 0.18, night));
    }

    // Grounded contact + true radial perspective sunset shadow away from sun pass (nx=0.43) & moon shadow (down-left)!
    if (uCastleRect.z > 1.0) {
      float cMidNx = (uCastleRect.x + uCastleRect.z * 0.5) / max(1.0, cssRes.x);
      float sunCastSign = clamp((cMidNx - 0.43) * 4.0, -1.0, 1.0);
      float cx = uCastleRect.x + uCastleRect.z * (0.45 + 0.20 * sunCastSign * sunset * sunVis - 0.14 * night * moonVis);
      float cy = ridgeY + 5.0 + 14.0 * sunset * sunVis + 10.0 * night * moonVis;
      vec2 dq = (p - vec2(cx, cy)) / vec2(
        uCastleRect.z * (0.32 + 0.22 * sunset * sunVis + 0.12 * night * moonVis),
        uCastleRect.w * (0.075 + 0.055 * sunset * sunVis + 0.045 * night * moonVis)
      );
      float cSh = exp(-dot(dq, dq) * 1.55);
      float shStrength = mix(mix(0.44, 0.26 + 0.30 * sunVis, sunset), 0.18 + 0.36 * moonVis, night);
      vec3 shTint = mix(mix(vec3(0.48, 0.58, 0.56), vec3(0.38, 0.38, 0.54), sunset), vec3(0.44, 0.52, 0.62), night);
      hillCol = mix(hillCol, hillCol * shTint, cSh * shStrength);
    }

    // Alpine daisies & buttercups visibly nodding & swaying across the windy hillside!
    vec2 fCell = floor(p / 26.0);
    vec2 fUv = fract(p / 26.0) - 0.5;
    float fh1 = hash2(fCell + 13.7);
    if (fh1 > 0.86 && hillDepth > 0.08) {
      float fFlut = sin(wt * 3.8 + fh1 * 18.0) * (0.04 + gustAmt * 0.05);
      vec2 fSway = WIND_DIR * (windWave * 0.24 + fFlut);
      vec2 jit = (vec2(hash2(fCell + 29.1), hash2(fCell + 47.3)) - 0.5) * 0.42 + fSway;
      float df = length(fUv - jit);
      float flM = 1.0 - ss(0.045, 0.095, df);
      vec3 flDay = fh1 > 0.93 ? vec3(0.99, 0.98, 0.92) : (fh1 > 0.89 ? vec3(0.98, 0.88, 0.42) : vec3(0.96, 0.82, 0.86));
      vec3 flSun = flDay * mix(vec3(0.56, 0.52, 0.64), vec3(0.84, 0.68, 0.48), hillSunLit);
      vec3 flCol = mix(mix(flDay, flSun, sunset), vec3(0.62, 0.78, 0.90) * mix(0.58, 1.18, hillMoonLit), night);
      hillCol = mix(hillCol, flCol, flM * 0.82);
    }

    col = mix(col, hillCol, hillMask);
  }

  // Delicate atmospheric crepuscular sunbeams fanning softly from the open mountain pass (nx=0.43)
  if (sunset > 0.02 && sunVis > 0.14) {
    vec2 toS = p - sunPos;
    float distS = length(toS);
    vec2 sBeamDir = normalize(vec2(0.25, 0.96));
    float alongS = max(0.0, dot(toS, sBeamDir));
    float perpS  = abs(dot(toS, vec2(-sBeamDir.y, sBeamDir.x)));
    float sConeW = sRad * 2.5 + alongS * 0.68;
    float sAng = atan(toS.y, toS.x);
    float rayMod = 0.55 + 0.25 * sin(sAng * 5.2 + N(p * 0.22 + vec2(wt * 1.4, 0.0), 460.0).r * 2.4)
                 + 0.20 * sin(sAng * 10.7 - wt * 0.18 + 1.4);
    float sShaft = exp(-pow(perpS / max(30.0, sConeW), 2.0))
                 * ss(sRad * 0.5, sRad * 3.5, distS)
                 * (1.0 - ss(cssRes.y * 0.35, cssRes.y * 0.85, alongS))
                 * clamp(rayMod, 0.18, 1.0);
    col += vec3(1.00, 0.68, 0.36) * sShaft * 0.085 * sunVis * sunset;
  }

  // Subtle diagonal volumetric moonlight haze descending from the Full Moon across the valley onto the hill
  if (night > 0.02 && moonVis > 0.12) {
    vec2 toP = p - moonPos;
    float distM = length(toP);
    vec2 beamDir = normalize(vec2(-0.34, 0.94));
    float alongB = max(0.0, dot(toP, beamDir));
    float perpB = abs(dot(toP, vec2(-beamDir.y, beamDir.x)));
    float coneW = mRad * 2.2 + alongB * 0.44;
    float shaft = exp(-pow(perpB / max(24.0, coneW), 2.0)) * ss(mRad * 0.8, mRad * 4.5, distM) * (1.0 - ss(cssRes.y * 0.55, cssRes.y * 1.08, alongB));
    col += vec3(0.32, 0.48, 0.68) * shaft * 0.11 * moonVis * night;
  }

  // =========================================================================
  // 5. FOREGROUND HILLSIDE OVERLAY: HAND-PAINTED COTTAGE, SHEPHERD & SHEEP!
  //    (Cropped strictly to lower hillside band ny >= 0.38 for 4.5x less upload!)
  // =========================================================================
  if (ny >= 0.38) {
    vec2 fgUV = vec2(nx, (ny - 0.38) / 0.62);
    vec4 fg = texture(uFieldTex, fgUV);
    if (fg.a > 0.005) {
      float warmLight = ss(0.26, 0.50, fg.r - fg.b) * ss(0.76, 0.95, fg.r) * ss(0.55, 0.82, fg.g);
      float isSolidF  = ss(0.42, 0.88, fg.a);
      float isSmokeF  = (1.0 - ss(0.22, 0.78, fg.a)) * (1.0 - ss(0.62, 0.82, ny));

      // Sync drifting hillside cloud shadow onto cottage, shepherd & sheep (never floats detached above shadowed grass!)
      float fgCloudSh = ss(0.52, 0.76, N(p + vec2(-wt * 24.0, -wt * 6.0), 1340.0).r);
      vec3 fgCloudTint = mix(vec3(0.72, 0.81, 0.79), vec3(0.66, 0.63, 0.82), sunset);

      // Subtle meadow green ground-bounce light & soft atmospheric integration on daytime plaster/wool/cloak
      vec3 fgDay = mix(fg.rgb, fg.rgb * vec3(0.955, 0.988, 0.920) + vec3(0.010, 0.022, 0.006), isSolidF * 0.62);
      fgDay = mix(fgDay, fgDay * fgCloudTint, fgCloudSh * 0.42);

      // Grounded dusk luminance matching the velvety sunset meadow + warm backlit hearth smoke + sunward golden rim!
      float fgPassLit = clamp((0.55 + 0.45 * exp(-pow((nx - 0.43) / 0.48, 2.0))) * hillSunLit, 0.25, 1.0);
      vec3 fgSun = fg.rgb * mix(vec3(0.50, 0.45, 0.56), vec3(0.76, 0.58, 0.48), fgPassLit)
                 + vec3(0.042, 0.020, 0.005) * fgPassLit
                 + vec3(0.22, 0.13, 0.06) * isSmokeF * sunVis;
      fgSun = mix(fgSun, fgSun * fgCloudTint, fgCloudSh * 0.30);

      vec3 fgNgt = fg.rgb * vec3(0.45, 0.58, 0.78) * mix(0.62, 1.18, hillMoonLit) + vec3(0.012, 0.022, 0.046);

      // 1-tap directional sun/moon rim light hugging edges of cottage roof, shepherd hood & sheep fleece!
      if ((sunset > 0.02 || night > 0.02) && isSolidF > 0.1) {
        vec2 lightPt = night > sunset ? moonPos : sunPos;
        vec2 rimVec = normalize(lightPt - p);
        vec2 rimUV = clamp(fgUV + vec2(rimVec.x * 2.1 / max(1.0, cssRes.x), rimVec.y * 2.1 / max(1.0, cssRes.y * 0.62)), 0.0, 1.0);
        float edgeRim = clamp(fg.a - texture(uFieldTex, rimUV).a, 0.0, 1.0) * isSolidF;
        fgSun += vec3(0.42, 0.24, 0.07) * edgeRim * fgPassLit;
        fgNgt += vec3(0.22, 0.34, 0.48) * edgeRim * hillMoonLit;
      }

      vec3 fgCol = mix(mix(fgDay, fgSun, sunset), fgNgt, night);
      fgCol = mix(fgCol, fg.rgb * (1.16 + 0.16 * (1.0 - hillMoonLit) * night), warmLight * max(sunset * 0.88, night));
      col = mix(col, fgCol, fg.a);
    }
  }

  // Stationary hand-painted gouache paper grain unified across ENTIRE canvas (including cottage, shepherd & sheep!)
  col *= 1.0 + (g1 - 0.5) * mix(0.042, 0.052, max(night, sunset * 0.5));

  // =========================================================================
  // 6. GOLDEN SUN-MOTES, GHIBLI WIND RIBBONS & DUSK/NOCTURNAL FIREFLIES
  // =========================================================================
  if (sunset > 0.04 && dRidge > -60.0) {
    float motes = sunsetSunMotes(p, wt, sunset) * hillSunLit * ss(-60.0, 50.0, dRidge);
    col += vec3(1.00, 0.82, 0.50) * motes * 0.78;
  }

  float duskFirefly = clamp(night + sunset * 0.30, 0.0, 1.0);
  if (duskFirefly > 0.02 && dRidge > -20.0) {
    // Fireflies pop more vividly when clouds veil the moonlight (and wake up softly in cool twilight grass!)
    float fireflyBoost = mix(mix(1.0, 0.78, sunset), mix(1.22, 0.82, hillMoonLit), night);
    col += alpineFireflies(p, uTime, duskFirefly) * fireflyBoost * ss(-20.0, 60.0, dRidge);
  }

  float windRib = ghibliWindRibbons(p);
  if (windRib > 0.002) {
    vec3 ribDay = vec3(0.99, 0.99, 0.95);
    vec3 ribSun = mix(vec3(0.84, 0.72, 0.74), vec3(0.98, 0.86, 0.64), hillSunLit);
    vec3 ribNgt = vec3(0.78, 0.91, 1.00);
    col = mix(col, mix(mix(ribDay, ribSun, sunset), ribNgt, night), windRib);
  }

  // Photographic filmic highlight rolloff (smooth warm ivory sun/sky shoulder -> ZERO digital neon yellow clipping!)
  vec3 cSafe = max(col, vec3(0.0));
  float fLum = dot(cSafe, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = cSafe / (1.0 + max(0.0, fLum - 0.68) * 0.70);
  mapped = mix(mapped, vec3(1.00, 0.97, 0.91), ss(0.72, 1.65, fLum) * 0.44);

  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}`;
