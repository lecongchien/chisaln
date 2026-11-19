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
uniform float uAlpsReady;
uniform float uSeed;

uniform vec4 uCastleRect;
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

// Sculpted billowing Studio Ghibli cumulus clouds (broad 140-320px cauliflower domes + crisp sunlit tops!)
// Returns vec2(alpha, sunlitTopFactor)
vec2 ghibliCloudField(vec2 p, float scaleX, float scaleY, float driftX, float coverage) {
  vec2 q = vec2(p.x - driftX, p.y) * vec2(1.0 / scaleX, 1.0 / scaleY);
  // uNoise.r has 6 cyc/UV -> q * 1.0 spans 6 broad domes per scale unit; multiply by 0.22 -> ~1.3 huge domes per scale!
  float d1 = N(q * 56.0, 256.0).r;
  float d2 = N(q * 112.0 + vec2(41.0, 19.0), 256.0).r;
  float d3 = N(q * 94.0 + vec2(83.0, 63.0), 256.0).g;
  // Plump rounded dome profile (soft cauliflower billows)
  float shape = d1 * 0.56 + d2 * 0.30 + d3 * 0.14;

  // Directional probe up-left for crisp Studio Ghibli sunlit cloud crown vs cool lavender belly
  vec2 qLit = q + vec2(-0.18, -0.26);
  float shapeLit = N(qLit * 56.0, 256.0).r * 0.62 + N(qLit * 112.0 + vec2(41.0, 19.0), 256.0).r * 0.38;

  float thresh = 1.0 - coverage;
  float alpha = ss(thresh - 0.045, thresh + 0.055, shape);
  float rim = ss(-0.10, 0.11, shape - shapeLit) * 0.68 + ss(thresh, thresh + 0.24, shape) * 0.32;
  return vec2(alpha, clamp(rim, 0.0, 1.0));
}

// Shared high-altitude sky cloud deck: powers sky clouds, lunar cloud occlusion,
// silver-lining forward scattering, AND ray-projected moonlight shadows on the hillside!
vec2 skyCloudAt(vec2 pos, vec2 cssRes, float wt, float mist, float night) {
  float nyPos = pos.y / max(1.0, cssRes.y);
  float hiBand = 1.0 - ss(0.26, 0.50, nyPos);
  // Subtle extra lunar-altitude coverage at night so clouds gracefully cross the full moon
  float cov = mix(0.46, 0.52, night) * hiBand * (0.52 + 0.48 * mist);
  return ghibliCloudField(pos, 380.0, 210.0, wt * 13.5, cov);
}

// Rolling Studio Ghibli grass-wind waves sweeping across the ENTIRE hillside!
// Returns vec2(sunlitCrest, bowedShadowTrough) for authentic Miyazaki wind-river contrast
vec2 alpineWindWave(vec2 p, float wt, float gust) {
  vec2 d1 = -WIND_DIR * (wt * 68.0);
  vec2 d2 = -WIND_DIR * (wt * 108.0) + WIND_PERP * (wt * 14.0);
  float f1 = N(p + d1, 1380.0).r;
  float f2 = N(p + d2, 740.0).r;
  float along = dot(p, WIND_DIR) + (f1 - 0.5) * 440.0 + (f2 - 0.5) * 145.0;
  float s1 = sin(along * 0.0068 - wt * 1.95);
  float s2 = sin(along * 0.0132 - wt * 2.85 + f1 * 2.6);
  float waveVal = s1 * 0.64 + s2 * 0.36;
  float gustMask = ss(0.16, 0.84, f1 * 0.62 + f2 * 0.38);
  float gAmp = 0.66 + 0.56 * gust;
  float crest  = clamp(pow(max(0.0,  waveVal * 0.5 + 0.5), 1.32) * (0.44 + 0.56 * gustMask) * gAmp, 0.0, 1.0);
  float trough = clamp(pow(max(0.0, -waveVal * 0.5 + 0.5), 1.62) * (0.36 + 0.64 * gustMask) * (0.58 + 0.42 * gust), 0.0, 1.0);
  return vec2(crest, trough);
}

// Expressive perspective-scaled Kazuo Oga grass strokes bowing deeply in gusts (3x3 100% seamless!)
vec2 hillsideGrassStrokes(vec2 p, float wt, float windCrest, float gust, float hillDepth) {
  const vec2 G = vec2(18.0, 12.0);
  vec2 c0 = floor(p / G);
  float shade = 0.0;
  float hi = 0.0;
  float persp = 0.68 + 0.58 * hillDepth;
  for (int jy = -1; jy <= 1; jy++) {
    for (int jx = -1; jx <= 1; jx++) {
      vec2 c = c0 + vec2(float(jx), float(jy));
      float h1 = hash2(c + 5.7);
      vec2 cp = (c + 0.5) * G;
      float dens = (0.42 + 0.44 * hillDepth) * ss(0.18, 0.72, N(cp, 840.0).r) + 0.14;
      if (h1 > dens) continue;

      float h2 = hash2(c + 13.1);
      float h3 = hash2(c + 29.4);
      vec2 root = cp + (vec2(h2, h3) - 0.5) * vec2(10.0, 6.0);
      vec2 rel = p - root;
      if (abs(rel.x) > 17.5 || abs(rel.y) > 10.5) continue;

      float localG = clamp(windCrest * (0.82 + 0.45 * h2) + gust * 0.24, 0.0, 1.35);
      float flut = sin(wt * (3.4 + h3 * 1.8) + h2 * 6.283 + root.x * 0.04) * (0.85 + localG * 1.25);
      float reach = min(15.8, (4.8 + h3 * 4.0 + localG * 6.4 + flut) * persp);
      float liftY = clamp((-2.6 + localG * 1.8) * persp, -5.5, 2.5);
      vec2 tip = WIND_DIR * reach + vec2(0.0, liftY);
      vec2 pa = rel;
      float tSeg = clamp(dot(pa, tip) / max(dot(tip, tip), 1e-4), 0.0, 1.0);
      float dSeg = length(pa - tip * tSeg);
      float thick = mix(1.02, 0.30, tSeg) * (0.82 + 0.30 * hillDepth);
      float m = (1.0 - ss(thick * 0.38, thick + 0.55, dSeg)) * (0.42 + 0.36 * h3);
      shade = max(shade, m * (1.0 - tSeg * 0.48));
      hi = max(hi, m * ss(0.40, 0.94, tSeg) * ss(0.22, 0.88, localG));
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
  vec2 baseCell = floor(p / CELL);
  vec3 glow = vec3(0.0);
  for (int jy = -1; jy <= 1; jy++) {
    for (int jx = -1; jx <= 1; jx++) {
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
  // 1. ALPINE SKY, STARS, FULL MOON + REAL-TIME CLOUD-OCCLUSION OPTICS
  // =========================================================================
  vec2 moonPos = vec2(cssRes.x * 0.80, cssRes.y * 0.14);
  float mRad = clamp(min(cssRes.x, cssRes.y) * 0.044, 24.0, 44.0);

  // Sample drifting sky clouds directly across the Full Moon's face (3-point smooth eclipse!)
  float moonOcc = 0.0;
  float moonVis = 1.0;
  if (night > 0.02) {
    float cM0 = skyCloudAt(moonPos, cssRes, wt, uMist, night).x;
    float cML = skyCloudAt(moonPos + vec2(-mRad * 0.65, 0.0), cssRes, wt, uMist, night).x;
    float cMR = skyCloudAt(moonPos + vec2( mRad * 0.65, 0.0), cssRes, wt, uMist, night).x;
    moonOcc = clamp(cM0 * 0.50 + cML * 0.25 + cMR * 0.25, 0.0, 1.0);
    // 1.0 = clear radiant full moon; 0.22 = softly veiled behind thick drifting cloud
    moonVis = 1.0 - moonOcc * 0.78;
  }

  vec3 skyTopDay = vec3(0.285, 0.640, 0.865);
  vec3 skyBotDay = vec3(0.745, 0.895, 0.960);

  vec3 skyTopSun = vec3(0.255, 0.345, 0.560);
  vec3 skyBotSun = vec3(0.965, 0.680, 0.465);

  vec3 skyTopNgt = vec3(0.032, 0.072, 0.162) * mix(0.84, 1.12, moonVis);
  vec3 skyBotNgt = vec3(0.105, 0.198, 0.335) * mix(0.78, 1.16, moonVis);

  vec3 skyTop = mix(mix(skyTopDay, skyTopSun, sunset), skyTopNgt, night);
  vec3 skyBot = mix(mix(skyBotDay, skyBotSun, sunset), skyBotNgt, night);

  float skyV = clamp(ny / 0.54 + (g1 - 0.5) * 0.035, 0.0, 1.0);
  vec3 col = mix(skyTop, skyBot, pow(skyV, 0.88));

  if (sunset > 0.01) {
    float sunGlow = exp(-pow((nx - 0.24) / 0.44, 2.0)) * exp(-pow((ny - 0.34) / 0.26, 2.0));
    col += vec3(0.99, 0.72, 0.42) * sunGlow * sunset * 0.34;
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
    float veilRing    = exp(-pow((rDist - mRad * 2.35) / (mRad * 0.95), 2.0)) * (0.04 + 0.15 * moonOcc);
    col += vec3(0.62, 0.80, 0.98) * (innerCorona + outerAura) * night;
    col += vec3(0.76, 0.87, 0.98) * veilRing * night;

    if (disc > 0.002) {
      // Painterly lunar maria (seas) + spherical limb darkening on the Full Moon
      float rNorm = clamp(rDist / max(1.0, mRad), 0.0, 1.0);
      float limb = pow(max(0.0, 1.0 - rNorm * rNorm), 0.26);
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
  }

  // Crisp Ghibli painted high cumulus clouds passing IN FRONT of the Full Moon with silver-lining!
  vec3 cLitCol = mix(mix(vec3(0.985, 0.992, 0.988), vec3(0.99, 0.86, 0.74), sunset), vec3(0.56, 0.70, 0.88) * mix(0.62, 1.18, moonVis), night);
  vec3 cShdCol = mix(mix(vec3(0.795, 0.875, 0.935), vec3(0.77, 0.60, 0.66), sunset), vec3(0.16, 0.25, 0.40) * mix(0.72, 1.08, moonVis), night);
  if (dRidge < 24.0) {
    vec2 sc = skyCloudAt(p, cssRes, wt, uMist, night);
    vec3 skyCloudCol = mix(cShdCol, cLitCol, sc.y);
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
    col = mix(col, skyCloudCol, sc.x * mix(0.88, 0.84, night));
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
          vec3 alpsDay = mix(alps.rgb, skyBotDay, 0.12 + valleyFade * 0.22);

          // Golden Sunset: sunlit snow ledges ignite into warm rose-gold alpenglow, cliffs drop into violet-slate
          vec3 sunRock = alps.rgb * vec3(0.76, 0.56, 0.64) + vec3(0.06, 0.02, 0.05);
          vec3 sunSnow = mix(vec3(0.74, 0.54, 0.66), vec3(1.00, 0.80, 0.64), ss(0.68, 0.95, lum));
          vec3 alpsSun = mix(sunRock, sunSnow, isSnow);
          alpsSun = mix(alpsSun, skyBotSun, 0.10 + valleyFade * 0.22);

          // Full Moon Night: responds dynamically to moonVis as clouds drift across the Full Moon!
          vec3 ngtRock = alps.rgb * vec3(0.24, 0.34, 0.50) * mix(0.66, 1.12, moonVis) + vec3(0.015, 0.028, 0.058);
          vec3 ngtSnow = mix(vec3(0.22, 0.34, 0.52), vec3(0.74, 0.86, 0.98) * mix(0.48, 1.22, moonVis), ss(0.64, 0.94, lum));
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
    float mistBand = exp(-pow((p.y - (ridgeY - cssRes.y * 0.015)) / (cssRes.y * 0.20), 2.0));
    float rightBias = ss(0.10, 0.58, nx) * 0.78 + 0.22;
    float cov = clamp(mistBand * rightBias * uMist * 1.18, 0.0, 0.92);
    vec2 vc1 = ghibliCloudField(p + vec2(0.0, 22.0), 320.0, 185.0, wt * 14.0, cov * 0.88);
    vec2 vc2 = ghibliCloudField(p + vec2(145.0, -10.0), 210.0, 128.0, wt * 21.0, cov * 0.76);
    float vcAlpha = clamp(max(vc1.x * 0.94, vc2.x * 0.88), 0.0, 0.96);
    float vcLit = vc2.x > vc1.x ? vc2.y : vc1.y;
    vec3 vCloudCol = mix(cShdCol, cLitCol, ss(0.24, 0.72, vcLit + (g1 - 0.5) * 0.05));
    col = mix(col, vCloudCol, vcAlpha);
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
        vec3 aerialTint = mix(mix(vec3(0.74, 0.86, 0.93), vec3(0.95, 0.74, 0.62), sunset), vec3(0.18, 0.28, 0.44) * mix(0.70, 1.15, moonVis), night);
        vec3 castBase = mix(castC.rgb, aerialTint, mix(0.14, 0.22, night));
        vec3 castSun  = castBase * vec3(1.06, 0.88, 0.75) + vec3(0.05, 0.02, 0.0);
        // Moonlit silver sheen on upper-right side of castle facing the Full Moon
        float moonSide = ss(0.32, 0.88, cUV.x) * (1.0 - ss(0.48, 0.92, cUV.y));
        vec3 castNgt  = castBase * vec3(0.44, 0.55, 0.75) * mix(0.64, 1.18, moonVis)
                      + vec3(0.015, 0.026, 0.054)
                      + vec3(0.14, 0.22, 0.34) * moonSide * moonVis;
        vec3 castGraded = mix(mix(castBase, castSun, sunset), castNgt, night);
        vec3 winGlow = vec3(1.00, 0.78, 0.34) * (1.16 + 0.14 * (1.0 - moonVis) + 0.12 * sin(uTime * 3.4 + p.x * 0.1));
        castGraded = mix(castGraded, winGlow, amberWin * max(sunset * 0.68, night * 0.96));

        float legMist = ss(ridgeY - 58.0, ridgeY + 8.0, p.y) * uMist * 0.22;
        castGraded = mix(castGraded, cLitCol, legMist);
        col = mix(col, castGraded, castC.a);
      }
    }
  }

  // =========================================================================
  // 4. KAZUO OGA GOUACHE SLOPING ALPINE HILLSIDE — WIND + MOONLIGHT OPTICS!
  // =========================================================================
  float gustAmt = clamp(uGust, 0.0, 1.0);
  vec2 windW = alpineWindWave(p, wt, gustAmt);
  float windWave = windW.x;
  float windTrough = windW.y;

  // Compute physical lunar illumination on the hillside:
  // Combines (A) direct Full Moon occlusion (moonVis) when clouds cross the lunar disc,
  // and (B) ray-projected drifting cloud shadows gliding across the meadow from skyCloudAt!
  float hillMoonLit = moonVis;
  if (night > 0.02 && dRidge > -30.0) {
    vec2 projSky = vec2(mix(p.x, moonPos.x, 0.44), cssRes.y * 0.16 + max(0.0, dRidge) * 0.24);
    float projCloud = skyCloudAt(projSky, cssRes, wt, uMist, night).x;
    hillMoonLit = clamp(moonVis * (1.0 - projCloud * 0.54), 0.15, 1.0);
  }

  if (dRidge > -6.0) {
    // Organic wind-rippled tufted grass skyline lip right along the ridge crest!
    float crestWave = sin(p.x * 0.018 - wt * 2.4) * (1.1 + gustAmt * 1.6);
    float crestJit = (N(vec2(p.x * 1.4 - wt * 14.0, 17.0), 48.0).g - 0.5) * 4.8 + crestWave + (g2 - 0.5) * 1.4;
    float hillMask = ss(-1.6, 1.6, dRidge + crestJit);
    float hillDepth = clamp(dRidge / max(80.0, cssRes.y * 0.55), 0.0, 1.0);

    vec3 gCrestDay = vec3(0.730, 0.848, 0.405);
    vec3 gMidDay   = vec3(0.475, 0.715, 0.310);
    vec3 gDeepDay  = vec3(0.305, 0.548, 0.240);
    vec3 gGustDay  = vec3(0.870, 0.932, 0.515);
    vec3 gInkDay   = vec3(0.205, 0.375, 0.165);

    vec3 gCrestSun = vec3(0.695, 0.655, 0.330);
    vec3 gMidSun   = vec3(0.435, 0.505, 0.265);
    vec3 gDeepSun  = vec3(0.255, 0.345, 0.205);
    vec3 gGustSun  = vec3(0.885, 0.775, 0.425);
    vec3 gInkSun   = vec3(0.185, 0.235, 0.145);

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

    // Anisotropic wind-combed gouache grass carpet visibly flexing in rolling gusts!
    vec2 windUV = vec2(dot(p, WIND_DIR) * 0.24, dot(p, WIND_PERP) * 1.55);
    vec2 shift = vec2(-windWave * 14.5 - sin(wt * 2.15 + windUV.y * 0.022) * (1.4 + gustAmt * 2.1), windWave * 2.8);
    float turfA = N(windUV + shift, 190.0).g;
    float turfB = N(windUV * 1.85 + shift * 1.35 + vec2(41.0, 17.0), 104.0).a;
    float combed = turfA * 0.58 + turfB * 0.42;

    hillCol = mix(hillCol, gDeep * 0.80, (windTrough * 0.68 + ss(0.52, 0.16, combed) * 0.38) * mix(0.42, 0.34, night));
    hillCol = mix(hillCol, gGust, (windWave * 0.68 + ss(0.46, 0.84, combed) * 0.42) * mix(0.50, 0.40 * hillMoonLit + 0.10, night));

    // Soft rolling sunlit pastoral dirt path sweeping naturally near lower-left cottage lane
    float pathCurveY = ridgeY + cssRes.y * (0.295 - 0.045 * sin(nx * 4.2));
    float pathDist = abs(p.y - pathCurveY) / max(14.0, cssRes.y * 0.042);
    float pathMask = (1.0 - ss(0.35, 1.35, pathDist + (N(p, 190.0).r - 0.5) * 0.85)) * ss(0.05, 0.20, nx) * (1.0 - ss(0.45, 0.72, nx));
    vec3 dirtDay = vec3(0.835, 0.760, 0.565);
    vec3 dirtSun = vec3(0.790, 0.625, 0.450);
    vec3 dirtNgt = vec3(0.240, 0.295, 0.345) * mix(0.62, 1.20, hillMoonLit);
    vec3 dirtCol = mix(mix(dirtDay, dirtSun, sunset), dirtNgt, night) * (0.94 + 0.12 * N(p, 95.0).b);
    hillCol = mix(hillCol, dirtCol, pathMask * 0.58);

    // Daytime drifting cloud shadow on hillside (at night, replaced by physical ray-projected lunar shadows!)
    float cloudSh = ss(0.52, 0.76, N(p + vec2(-wt * 24.0, -wt * 6.0), 1340.0).r);
    vec3 hillShTint = mix(vec3(0.64, 0.76, 0.67), vec3(0.60, 0.56, 0.70), sunset);
    hillCol = mix(hillCol, hillCol * hillShTint, cloudSh * 0.46 * (1.0 - night));

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

    // Crisp swaying painted grass blades bending vigorously with the passing gust!
    vec2 strokes = hillsideGrassStrokes(p, wt, windWave, gustAmt, hillDepth);
    hillCol = mix(hillCol, gInk, strokes.x * mix(0.44, 0.46, night));
    hillCol = mix(hillCol, gGust * 1.12, strokes.y * mix(0.42, 0.48 * hillMoonLit + 0.12, night));

    // Grounded contact + directional nocturnal moon shadow stretching down-left behind Moving Castle!
    if (uCastleRect.z > 1.0) {
      float cx = uCastleRect.x + uCastleRect.z * (0.45 - 0.14 * night * moonVis);
      float cy = ridgeY + 5.0 + 10.0 * night * moonVis;
      vec2 dq = (p - vec2(cx, cy)) / vec2(uCastleRect.z * (0.32 + 0.12 * night * moonVis), uCastleRect.w * (0.075 + 0.045 * night * moonVis));
      float cSh = exp(-dot(dq, dq) * 1.55);
      // Cast shadow sharpens when moon is clear, softens/fades when clouds veil the moon!
      float shStrength = mix(0.44, 0.18 + 0.36 * moonVis, night);
      hillCol = mix(hillCol, hillCol * vec3(0.48, 0.58, 0.56), cSh * shStrength);
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
      vec3 flCol = mix(mix(flDay, flDay * vec3(1.0, 0.84, 0.68), sunset), vec3(0.62, 0.78, 0.90) * mix(0.58, 1.18, hillMoonLit), night);
      hillCol = mix(hillCol, flCol, flM * 0.82);
    }

    col = mix(col, hillCol, hillMask);
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

  // Stationary hand-painted gouache paper grain across whole canvas
  col *= 1.0 + (g1 - 0.5) * mix(0.042, 0.052, night);

  // =========================================================================
  // 5. FOREGROUND HILLSIDE OVERLAY: HAND-PAINTED COTTAGE, SHEPHERD & SHEEP!
  // =========================================================================
  vec2 screenUV = p / max(cssRes, vec2(1.0));
  vec4 fg = texture(uFieldTex, screenUV);
  if (fg.a > 0.005) {
    float warmLight = ss(0.26, 0.50, fg.r - fg.b) * ss(0.76, 0.95, fg.r) * ss(0.55, 0.82, fg.g);
    vec3 fgSun = fg.rgb * vec3(1.05, 0.88, 0.74);
    // Cottage, shepherd & sheep naturally brighten in clear moonlight & dim when clouds cross the moon,
    // while warm cottage hearth candlelight glows EVEN WARMER in the moon-cloud shadow!
    vec3 fgNgt = fg.rgb * vec3(0.45, 0.58, 0.78) * mix(0.62, 1.18, hillMoonLit) + vec3(0.012, 0.022, 0.046);
    vec3 fgCol = mix(mix(fg.rgb, fgSun, sunset), fgNgt, night);
    fgCol = mix(fgCol, fg.rgb * (1.12 + 0.16 * (1.0 - hillMoonLit) * night), warmLight * max(sunset * 0.7, night));
    col = mix(col, fgCol, fg.a);
  }

  // =========================================================================
  // 6. SUBTLE OCCASIONAL GHIBLI WIND RIBBONS & NOCTURNAL FIREFLIES
  // =========================================================================
  if (night > 0.02 && dRidge > -20.0) {
    // Fireflies pop more vividly when clouds veil the moonlight!
    float fireflyBoost = mix(1.22, 0.82, hillMoonLit);
    col += alpineFireflies(p, uTime, night) * fireflyBoost * ss(-20.0, 60.0, dRidge);
  }

  float windRib = ghibliWindRibbons(p);
  if (windRib > 0.002) {
    vec3 ribDay = vec3(0.99, 0.99, 0.95);
    vec3 ribSun = vec3(1.00, 0.92, 0.80);
    vec3 ribNgt = vec3(0.78, 0.91, 1.00);
    col = mix(col, mix(mix(ribDay, ribSun, sunset), ribNgt, night), windRib);
  }

  fragColor = vec4(col, 1.0);
}`;
