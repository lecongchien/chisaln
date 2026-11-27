/**
 * Arctic Theme WebGL2 Shader — Authentic Matte Studio Ghibli / Kazuo Oga Watercolor Edition
 * Powered by REAL hand-painted cold-press Arches watercolor textures & hand-inked sprite atlases
 * (zero plastic specular gloss, zero synthetic CGI sine grids, zero Voronoi cobwebs!):
 *   1. Real hand-painted cold-press watercolor snow paper (`uSnowTex`) blended across dual rotated
 *      scales (zero tile repeat!) with authentic hand-inked watercolor ice-shelf fracture cracks
 *      (`uCracksTex`) along fractured calving rims and radiating from the carved ice hole.
 *   2. Real hand-painted wet-on-wet Prussian & emerald watercolor glacial sea (`uWaterTex`) animated
 *      with organic dual-layer fluid watercolor advection & translucent emerald current swells
 *      ("thật sóng sánh"), matte dark Prussian shoreline backruns, wavering cliff reflections,
 *      crisp matte gouache white water-sparkles, and 4 real hand-inked floating ice floes (`uFloesTex`)
 *      bobbing with wavy dark-emerald submerged underwater reflections.
 *   3. Stepped matte periwinkle-ice cliff walls with crisp hand-inked contours & vertical fracture lines.
 *   4. Hand-carved faceted aquamarine ice hole with animated watercolor ripples, penguin splash rings,
 *      hand-inked radial fractures, and nighttime Moon Phase + Aurora Borealis reflections.
 *   5. Harmonious Polar Day · Alpenglow Rose Sunset · Starlit Aurora Borealis Night watercolor grading.
 */
export const ARCTIC_FS = `#version 300 es
precision highp float;

uniform sampler2D uFA;
uniform sampler2D uFB;
uniform sampler2D uNoise;
uniform sampler2D uActorsTex;
uniform sampler2D uActorsShadowTex;
uniform sampler2D uMoonTex;
uniform sampler2D uWaterTex;
uniform sampler2D uSnowTex;
uniform sampler2D uFloesTex;

uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uStep;
uniform float uDpr;
uniform float uMix;
uniform float uTime;
uniform float uWindTime;
uniform float uSnow;         // 0..1 snowfall density
uniform float uAurora;       // 0..1 aurora borealis intensity (night)
uniform float uEdge;         // shoreline ice-edge roughness
uniform float uSeed;
uniform float uSunset;       // 0..1 Polar Alpenglow sunset
uniform float uNight;        // 0..1 Polar Aurora Night
uniform float uMoonPhase;    // 0=New, 0.25=First Qtr, 0.5=Full, 0.75=Last Qtr

uniform vec4 uHole;          // xy = ice hole center CSS px, zw = radii (rx, ry); z <= 0 hides hole
uniform vec2 uHoleRipple;    // x = age since splash (sec), y = splash strength (0..1)
uniform vec4 uActorsRect;    // xy = top-left CSS px, zw = size CSS px (z <= 0 disables)

uniform vec4 uWindA[4];
uniform vec4 uWindB[4];
uniform vec4 uWindC[4];

out vec4 fragColor;

const vec2 LIGHT      = vec2(-0.60, -0.80);
const vec2 WIND_DIR   = vec2(0.848, 0.530);
const vec2 WIND_PERP  = vec2(-0.530, 0.848);
const float PI        = 3.14159265;
const float TAU       = 6.28318530;

// Base Studio Ghibli Day watercolor reference tones (for cliffs, ink, hole, and sunset/night grading)
const vec3 D_SNOW_HI     = vec3(0.990, 0.978, 0.942);
const vec3 D_SNOW_WASH   = vec3(0.845, 0.868, 0.942);
const vec3 D_SNOW_SH     = vec3(0.735, 0.775, 0.885);
const vec3 D_ICE_WALL    = vec3(0.742, 0.832, 0.918);
const vec3 D_ICE_SH      = vec3(0.505, 0.658, 0.802);
const vec3 D_SEA_DEEP    = vec3(0.018, 0.195, 0.305);
const vec3 D_SEA_VIRID   = vec3(0.095, 0.545, 0.535);
const vec3 D_SEA_AQUA    = vec3(0.325, 0.768, 0.725);
const vec3 D_HOLE_WATER  = vec3(0.155, 0.718, 0.682);
const vec3 D_HOLE_DEEP   = vec3(0.048, 0.415, 0.495);
const vec3 D_INK         = vec3(0.105, 0.238, 0.335);

// Polar Alpenglow Sunset watercolor grading tones
const vec3 S_SNOW_HI     = vec3(0.985, 0.865, 0.805);
const vec3 S_SNOW_WASH   = vec3(0.705, 0.625, 0.752);
const vec3 S_SNOW_SH     = vec3(0.525, 0.482, 0.652);
const vec3 S_ICE_WALL    = vec3(0.585, 0.635, 0.788);
const vec3 S_ICE_SH      = vec3(0.345, 0.398, 0.562);
const vec3 S_SEA_DEEP    = vec3(0.045, 0.088, 0.202);
const vec3 S_SEA_VIRID   = vec3(0.265, 0.315, 0.468);
const vec3 S_SEA_AQUA    = vec3(0.525, 0.455, 0.598);
const vec3 S_HOLE_WATER  = vec3(0.315, 0.382, 0.528);
const vec3 S_HOLE_DEEP   = vec3(0.118, 0.162, 0.298);
const vec3 S_INK         = vec3(0.152, 0.145, 0.272);

// Arctic Night watercolor grading tones
const vec3 N_SNOW_HI     = vec3(0.405, 0.525, 0.648);
const vec3 N_SNOW_WASH   = vec3(0.175, 0.265, 0.392);
const vec3 N_SNOW_SH     = vec3(0.112, 0.182, 0.292);
const vec3 N_ICE_WALL    = vec3(0.248, 0.445, 0.575);
const vec3 N_ICE_SH      = vec3(0.125, 0.268, 0.392);
const vec3 N_SEA_DEEP    = vec3(0.015, 0.046, 0.102);
const vec3 N_SEA_VIRID   = vec3(0.065, 0.228, 0.305);
const vec3 N_SEA_AQUA    = vec3(0.145, 0.465, 0.545);
const vec3 N_HOLE_WATER  = vec3(0.068, 0.218, 0.298);
const vec3 N_HOLE_DEEP   = vec3(0.022, 0.075, 0.145);
const vec3 N_INK         = vec3(0.042, 0.095, 0.165);

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 texN(vec2 p, float scale) {
  return texture(uNoise, p * scale);
}

float sampleFieldLod(vec2 pCss) {
  vec2 uv = (pCss / uStep + 0.5) / uGrid;
  float a = textureLod(uFA, uv, 0.0).r;
  float b = textureLod(uFB, uv, 0.0).r;
  return mix(a, b, uMix);
}

float sampleField(vec2 pCss) {
  return sampleFieldLod(pCss);
}

// Harmonious Day -> Alpenglow Sunset -> Moonlit Aurora Night grading for painted snow & floes
vec3 gradeSnowArt(vec3 c, vec3 auroraCol) {
  vec3 sunsetCol = c * vec3(1.01, 0.86, 0.83) + vec3(0.035, 0.008, 0.028) * (1.0 - c.b);
  vec3 nightCol  = c * vec3(0.39, 0.52, 0.67) + auroraCol * 0.16;
  return mix(mix(c, sunsetCol, uSunset * 0.88), nightCol, uNight * 0.90);
}

// Harmonious Day -> Sunset -> Night grading for painted Prussian-emerald watercolor sea
vec3 gradeWaterArt(vec3 c) {
  float lum = dot(c, vec3(0.25, 0.52, 0.23));
  vec3 sunsetCol = mix(S_SEA_DEEP, S_SEA_VIRID, smoothstep(0.08, 0.52, lum))
                 + vec3(0.16, 0.07, 0.14) * smoothstep(0.34, 0.72, c.g);
  vec3 nightCol  = c * vec3(0.38, 0.44, 0.58) * 0.68 + vec3(0.006, 0.014, 0.038);
  return mix(mix(c, sunsetCol, uSunset * 0.84), nightCol, uNight * 0.82);
}

// Smooth polar Aurora Borealis curtains shimmering across the polar sea & snow at night
vec3 evalAurora(vec2 pCss, float t) {
  vec2 q = pCss * 0.00145;
  float wave1 = sin(q.x * 3.1 + t * 0.22 + sin(q.y * 2.4 - t * 0.15) * 1.45);
  float wave2 = sin(q.x * 5.2 - q.y * 2.1 - t * 0.19 + cos(q.x * 1.7 + t * 0.11) * 1.2);
  float bandA = exp(-pow(q.y * 1.45 + 0.35 * wave1 - 0.55, 2.0) * 3.4);
  float bandB = exp(-pow(q.y * 1.65 - 0.28 * wave2 - 1.15, 2.0) * 4.2);

  float shimmer = 0.65 + 0.35 * texN(pCss + vec2(t * 14.0, -t * 9.0), 0.0018).r;
  float curtain = (0.55 + 0.45 * sin(q.x * 16.0 + wave1 * 3.5 + t * 0.7)) * shimmer;

  vec3 emerald = vec3(0.14, 0.94, 0.68);
  vec3 cyanIce = vec3(0.22, 0.78, 0.96);
  vec3 violet  = vec3(0.62, 0.36, 0.94);

  vec3 colA = mix(emerald, cyanIce, 0.45 + 0.45 * sin(q.x * 2.2 + t * 0.18));
  vec3 colB = mix(violet, emerald, 0.35 + 0.35 * cos(q.y * 3.0 - t * 0.21));
  return (colA * bandA * 0.85 + colB * bandB * 0.65) * curtain;
}

// Non-repeating dual-rotated sampling of our real hand-painted Arches watercolor snow paper
vec3 samplePaintedSnow(vec2 pCss) {
  vec2 uv1 = pCss / 520.0;
  // Rotate by ~53 deg at non-commensurate scale -> zero tile repetition even on 4K!
  vec2 rP = vec2(pCss.x * 0.602 - pCss.y * 0.799, pCss.x * 0.799 + pCss.y * 0.602);
  vec2 uv2 = (rP + vec2(173.0, -91.0)) / 710.0;
  vec3 s1 = texture(uSnowTex, uv1).rgb;
  vec3 s2 = texture(uSnowTex, uv2).rgb;
  float blendW = smoothstep(0.25, 0.75, texN(pCss + vec2(uSeed * 9.0), 0.0016).r);
  return mix(s1, s2, blendW * 0.58 + 0.21);
}

// Organic fluid watercolor displacement (smooth liquid currents, zero mechanical sine grids!)
// Returns vec3(dispX, dispY, gentleSwell [-1..1])
vec3 evalOrganicFluid(vec2 pCss, float t) {
  vec2 flow1 = texN(pCss + vec2(t * 11.5, -t * 7.8), 0.0031).rg - 0.5;
  vec2 flow2 = texN(pCss * 1.35 + vec2(-t * 8.2, t * 10.4) + flow1 * 48.0, 0.0056).rg - 0.5;
  vec2 flow3 = texN(pCss * 1.9 + vec2(t * 14.0, t * 6.5), 0.0092).rg - 0.5;
  vec2 disp = flow1 * 1.15 + flow2 * 0.78 + flow3 * 0.36;
  float swell = clamp((flow1.x + flow2.y) * 1.45 + flow3.x * 0.55, -1.0, 1.0);
  return vec3(disp, swell);
}

// Exact jagged shoreline displacement helper (shared so brittle cracks snap to exact cliff edge!)
float evalShoreNoise(vec2 pCss) {
  vec4 nMacro = texN(pCss + vec2(uSeed * 19.0), 0.00115);
  vec4 nMid   = texN(pCss + vec2(-uSeed * 7.0, uSeed * 11.0), 0.0039);
  vec4 nBrush = texN(vec2(pCss.x * 0.72 + pCss.y * 0.28, pCss.y * 1.35 - pCss.x * 0.35), 0.0082);
  float edgeAmp = 1.0 + uEdge * 0.022;
  float crackA = 1.0 - abs(nMacro.r * 2.0 - 1.0);
  float crackB = 1.0 - abs(nMid.g * 2.0 - 1.0);
  float crackC = 1.0 - abs(nBrush.r * 2.0 - 1.0);
  return ((nMacro.r - 0.5) * 20.0 + (crackA - 0.5) * 18.0 + (nMid.g - 0.5) * 10.5
        + (crackB - 0.5) * 8.5 + (crackC - 0.5) * 4.5) * edgeAmp;
}

// Analytical point-to-segment distance + parameter t in [0, 1] + signed side (+1 / -1)
vec3 sdSegmentInfo(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(1e-5, dot(ba, ba)), 0.0, 1.0);
  float d = length(pa - ba * h);
  float side = (pa.x * ba.y - pa.y * ba.x) > 0.0 ? 1.0 : -1.0;
  return vec3(d, h, side);
}

// Accumulate one crisp hand-inked brittle crystal segment into (bestInk, bestWash, bestCliffSplit)
void accumCrackSeg(
  vec2 p, vec2 a, vec2 b,
  float u0, float u1,
  float baseW, float tipW, float inkStrength, float washStrength,
  float grain,
  inout float bestInk, inout float bestWash
) {
  vec3 sg = sdSegmentInfo(p, a, b);
  float d = sg.x;
  if (d > baseW + 5.5) return;
  float u = mix(u0, u1, sg.y);
  float w = mix(baseW, tipW, u);
  // Crisp narrow wedge opening right at the cliff mouth (u < 0.14)
  w += clamp((0.14 - u) / 0.14, 0.0, 1.0) * baseW * 0.55;
  float fade = 1.0 - u * 0.58;
  float ink = (1.0 - smoothstep(w * 0.42, w + 0.65, d)) * fade * inkStrength * grain;
  float sideMask = sg.z > 0.0 ? 1.0 : 0.0;
  float wash = (1.0 - smoothstep(w * 0.65, w + 3.4, d)) * sideMask * (1.0 - u) * washStrength;
  bestInk  = max(bestInk, ink);
  bestWash = max(bestWash, wash);
}

// Natural, sparse, physically-anchored brittle polyline glacier cracks!
// Every shoreline crack snaps via Newton projection directly onto the broken ice cliff (sSurf = 0),
// shoots 4 sharp straight crystal segments + 1 crisp Y-fork inland, and drops vertically down the 3D cliff.
// Returns vec3(snowInkAlpha, snowWashAlpha, cliffDropAlpha) — 100% order-independent (zero grid seams!).
vec3 evalBrittleIceCracks(vec2 pCss, float sSurf, float wallThickness, float grain) {
  float bestInk = 0.0;
  float bestWash = 0.0;
  float bestCliff = 0.0;

  // Keep the sleeping Polar Bear's resting snow bed completely smooth
  float bearCalm = 1.0;
  if (uActorsRect.z > 1.0) {
    vec2 bearCenter = uActorsRect.xy + vec2(0.37, 0.56) * uActorsRect.zw;
    float dBear = length((pCss - bearCenter) / max(1.0, uActorsRect.z * 0.25));
    bearCalm = smoothstep(0.68, 1.32, dBear);
  }

  // 1. Two tiny, understated hand-inked brittle hairline ticks tucked into corners of the carved ice hole
  if (uHole.z > 1.0 && sSurf > 0.0) {
    vec2 hRel = pCss - uHole.xy;
    float maxR = max(uHole.z, uHole.w);
    if (dot(hRel, hRel) < (maxR * 1.65) * (maxR * 1.65)) {
      // Micro wobble for authentic dip-pen paper feel
      vec2 pw = pCss + (texN(pCss, 0.065).rg - 0.5) * 1.1;
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float a0 = mix(-2.25, 0.58, fk);
        vec2 dir = vec2(cos(a0), sin(a0));
        vec2 pStart = uHole.xy + dir * (uHole.zw * 0.96);
        float len1 = maxR * mix(0.24, 0.20, fk);
        float len2 = maxR * mix(0.20, 0.16, fk);
        vec2 pMid = pStart + vec2(cos(a0 + 0.16), sin(a0 + 0.16)) * len1;
        vec2 pEnd = pMid   + vec2(cos(a0 - 0.24), sin(a0 - 0.24)) * len2;
        accumCrackSeg(pw, pStart, pMid, 0.0, 0.55, 0.92, 0.28, 0.58, 0.24, grain, bestInk, bestWash);
        accumCrackSeg(pw, pMid,   pEnd, 0.55, 1.0, 0.92, 0.28, 0.58, 0.24, grain, bestInk, bestWash);
      }
    }
  }

  // 2. Sparse brittle polyline shoreline calving cracks (ONLY evaluated within shoreline band!)
  if (sSurf > -wallThickness - 4.0 && sSurf < 155.0 && bearCalm > 0.02) {
    // Subtle hand-drawn dip-pen micro-wobble on textured watercolor paper (never clinical CAD lines!)
    vec2 pw = pCss + (texN(pCss, 0.058).rg - 0.5) * 1.25;

    float cell = 265.0;
    vec2 originCell = floor(pCss / cell - 0.5);
    for (int cy = 0; cy <= 1; cy++) {
      for (int cx = 0; cx <= 1; cx++) {
        vec2 cId = originCell + vec2(float(cx), float(cy));
        float rnd = hash2(cId + uSeed * 4.9);
        // Sparse natural spacing (~2-4 cracks along an entire desktop shoreline!)
        if (rnd > 0.68) continue;

        vec2 jit = (vec2(hash2(cId + 11.3), hash2(cId + 29.7)) - 0.5) * 0.42;
        vec2 cPos = (cId + 0.5 + jit) * cell;

        // Only spawn where the fractured shoreline actually passes near this coarse cell!
        float cSdf = sampleFieldLod(cPos);
        if (abs(cSdf) > 105.0) continue;

        // Compute inward shoreline normal pointing from water -> into snow shelf
        float gx = sampleFieldLod(cPos + vec2(10.0, 0.0)) - sampleFieldLod(cPos - vec2(10.0, 0.0));
        float gy = sampleFieldLod(cPos + vec2(0.0, 10.0)) - sampleFieldLod(cPos - vec2(0.0, 10.0));
        float gLen = length(vec2(gx, gy));
        if (gLen < 0.5) continue;
        vec2 inward = vec2(gx, gy) / gLen;

        // 2-step Newton projection: snap crack mouth P0 squarely onto the jagged ice cliff lip (sSurf = 0)!
        vec2 p0 = cPos - inward * cSdf;
        float s0 = sampleFieldLod(p0) + evalShoreNoise(p0);
        p0 -= inward * s0;

        // Fast bounding reject (max crack reach = 130px)
        vec2 rel0 = pCss - p0;
        if (dot(rel0, rel0) > 142.0 * 142.0) continue;

        float baseAng = atan(inward.y, inward.x) + (fract(rnd * 17.3) - 0.5) * 0.52;
        float totalLen = mix(64.0, 126.0, fract(rnd * 31.7));

        // 4 crisp straight brittle cleavage segments with sharp crystal kinks (±14..28 deg)
        float k1 = (fract(rnd * 43.1) - 0.5) * 0.55;
        float k2 = (fract(rnd * 67.3) - 0.5) * 0.62;
        float k3 = (fract(rnd * 89.9) - 0.5) * 0.50;
        float k4 = (fract(rnd * 103.7) - 0.5) * 0.42;

        float a1 = baseAng + k1 * 0.5;
        float a2 = a1 + k2;
        float a3 = a2 + k3;
        float a4 = a3 + k4;

        vec2 p1 = p0 + vec2(cos(a1), sin(a1)) * (totalLen * 0.28);
        vec2 p2 = p1 + vec2(cos(a2), sin(a2)) * (totalLen * 0.27);
        vec2 p3 = p2 + vec2(cos(a3), sin(a3)) * (totalLen * 0.24);
        vec2 p4 = p3 + vec2(cos(a4), sin(a4)) * (totalLen * 0.21);

        if (sSurf > -1.5) {
          float sInk = 0.0, sWash = 0.0;
          accumCrackSeg(pw, p0, p1, 0.00, 0.28, 1.28, 0.24, 0.80, 0.34, grain, sInk, sWash);
          accumCrackSeg(pw, p1, p2, 0.28, 0.55, 1.28, 0.24, 0.80, 0.34, grain, sInk, sWash);
          accumCrackSeg(pw, p2, p3, 0.55, 0.79, 1.28, 0.24, 0.80, 0.34, grain, sInk, sWash);
          accumCrackSeg(pw, p3, p4, 0.79, 1.00, 1.28, 0.24, 0.80, 0.34, grain, sInk, sWash);

          // 1 crisp angular Y-fork branch forking sharply off vertex p1 (or p2)
          float fSign = fract(rnd * 53.9) > 0.5 ? 1.0 : -1.0;
          vec2 fOrigin = fract(rnd * 23.1) > 0.45 ? p1 : p2;
          float fAng1 = (fract(rnd * 23.1) > 0.45 ? a1 : a2) + fSign * mix(0.46, 0.74, fract(rnd * 71.3));
          float fAng2 = fAng1 - fSign * 0.22;
          float fLen = totalLen * mix(0.32, 0.48, fract(rnd * 97.1));
          vec2 fMid = fOrigin + vec2(cos(fAng1), sin(fAng1)) * (fLen * 0.56);
          vec2 fEnd = fMid    + vec2(cos(fAng2), sin(fAng2)) * (fLen * 0.44);
          accumCrackSeg(pw, fOrigin, fMid, 0.15, 0.62, 0.84, 0.20, 0.66, 0.20, grain, sInk, sWash);
          accumCrackSeg(pw, fMid,    fEnd, 0.62, 1.00, 0.84, 0.20, 0.66, 0.20, grain, sInk, sWash);

          bestInk  = max(bestInk,  sInk  * bearCalm);
          bestWash = max(bestWash, sWash * bearCalm);
        }

        // Crisp vertical cleavage fracture dropping down the 3D vertical ice cliff face from P0!
        if (sSurf < 2.0) {
          vec2 cliffEnd = p0 - inward * (wallThickness * 0.65) + vec2(0.0, wallThickness * 0.85);
          vec3 cg = sdSegmentInfo(pw, p0, cliffEnd);
          float cW = mix(1.25, 0.65, cg.y);
          float cLine = (1.0 - smoothstep(cW * 0.4, cW + 0.65, cg.x)) * grain * 0.82;
          bestCliff = max(bestCliff, cLine);
        }
      }
    }
  }

  return vec3(bestInk, bestWash, bestCliff);
}

// Hand-painted MATTE gouache white flecks & rare tiny crisp snow-sparkles on dark Prussian sea
// Matches the exact hand-splattered gouache speckles in both user reference crops (ZERO neon halo!)
float evalGouacheWaterFlecks(vec2 pCss, float t, vec2 fluidDisp, float swell, float shoreD) {
  float shoreGate = smoothstep(4.0, 14.0, shoreD);
  if (shoreGate <= 0.005) return 0.0;

  // Natural current clustering so speckles gather organically in streams (not uniform grids!)
  float cluster = smoothstep(0.28, 0.72, texN(pCss - WIND_DIR * (t * 2.5), 0.0052).r);

  float accum = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float cell = mix(36.0, 22.0, fl);
    float spd  = mix(3.4, 5.2, fl);
    vec2 flowP = pCss - WIND_DIR * (t * spd) + fluidDisp * mix(5.5, 7.5, fl);
    vec2 gid = floor(flowP / cell);
    vec2 gv  = fract(flowP / cell) - 0.5;

    float h1 = hash2(gid + fl * 43.1 + uSeed * 2.3);
    float h2 = hash2(gid + fl * 87.7 + 19.4);
    float h3 = hash2(gid + fl * 61.3 + 5.9);
    float h4 = hash2(gid + fl * 29.9 + 41.2);

    float prob = mix(0.56, 0.44, fl) * mix(0.45, 1.15, cluster);
    if (h1 < prob) {
      vec2 pos = (vec2(h2, h3) - 0.5) * 0.72;
      pos.x += sin(t * (1.1 + h4 * 0.8) + h1 * 27.0) * 0.032;
      pos.y += cos(t * (0.95 + h3 * 0.7) + h2 * 31.0) * 0.026;

      vec2 d = gv - pos;
      // Organic hand-dabbed gouache dot shape (slightly asymmetric, crisp painted matte edge!)
      float ang = h4 * TAU;
      float ca = cos(ang), sa = sin(ang);
      vec2 dr = vec2(d.x * ca - d.y * sa, (d.x * sa + d.y * ca) * (0.74 + 0.48 * h2));
      float wob = 1.0 + 0.16 * sin(atan(dr.y, dr.x) * 3.0 + h3 * 12.0);

      float r = mix(0.036, 0.074, pow(h4, 1.45)) * mix(1.0, 0.78, fl);
      float dist = length(dr) * wob;
      // Crisp matte gouache edge (NO blurry neon glow!)
      float dab = 1.0 - smoothstep(r * 0.68, r * 1.08, dist);

      // Rare tiny crisp hand-painted white snowflake / glint dot (like in user's crops!)
      float tinyStar = 0.0;
      if (layer == 0 && h4 > 0.87) {
        float a = atan(d.y, d.x) + h2 * 6.0;
        float petals = pow(abs(cos(a * 3.0)), 4.0);
        float sr = r * 1.95;
        tinyStar = (1.0 - smoothstep(sr * 0.55, sr, length(d))) * petals * 0.85;
      }

      // Subtle living shimmer modulation as swells breathe underneath
      float breath = 0.76 + 0.24 * sin(t * (1.8 + h3 * 2.2) + h1 * 42.0 + swell * 1.4);
      accum = max(accum, max(dab, tinyStar) * breath);
    }
  }
  return clamp(accum * shoreGate, 0.0, 1.0);
}

// Helper: evaluates one strictly cell-contained hand-painted Studio Ghibli floating ice floe!
// Every floe + its wavy submerged reflection fits 100% inside its own cell with >8px margin ->
// ZERO grid slicing, ZERO draw-order flips, and explicit textureLod -> ZERO D3D11 mipmap seams!
void evalFloeLayer(
  vec2 pCss,
  float sSurf,
  float t,
  float cell,
  float spd,
  vec2 phaseOff,
  float seedOff,
  float spawnThresh,
  float szMin,
  float szMax,
  float minClear,
  float bobAmp,
  float wobbleAmp,
  out float outUnderAlpha,
  out vec4 outSprite
) {
  outUnderAlpha = 0.0;
  outSprite = vec4(0.0);

  vec2 floeP = pCss - WIND_DIR * (t * spd) + phaseOff;
  vec2 cId = floor(floeP / cell);
  float fRnd = hash2(cId + seedOff + uSeed * 5.7);
  if (fRnd < spawnThresh) return;

  // Bounded jitter keeps floe + submerged reflection strictly inside [cId, cId+1) with >8px safety margin
  vec2 fOff = vec2(
    (hash2(cId + 3.2 + seedOff) - 0.5) * 0.34,
    (hash2(cId + 19.8 + seedOff) - 0.5) * 0.28
  );
  vec2 centerPx = (cId + 0.5 + fOff) * cell;
  float bob = sin(t * (1.15 + fract(fRnd * 13.1) * 0.55) + fRnd * 37.0) * bobAmp;
  vec2 rel = floeP - centerPx - vec2(0.0, bob);

  float sz = mix(szMin, szMax, fract(fRnd * 17.3));
  if (abs(rel.x) > sz * 0.62 || rel.y < -sz * 0.54 || rel.y > sz * 0.72) return;

  // Clean shoreline clearance so floes stay in open water without clipping under ice cliffs
  vec2 worldCenter = centerPx + WIND_DIR * (t * spd) - phaseOff;
  float cSdf = sampleFieldLod(worldCenter);
  float bayGate = smoothstep(minClear + 10.0, minClear - 10.0, cSdf)
                * smoothstep(-6.0, -16.0, sSurf);
  if (bayGate <= 0.01) return;

  float ang = (fract(fRnd * 31.1) - 0.5) * 0.34 + sin(t * 0.58 + fRnd * 19.0) * 0.038;
  float ca = cos(ang), sa = sin(ang);
  float flipX = fract(fRnd * 47.9) > 0.5 ? -1.0 : 1.0;

  float qPick = fract(fRnd * 11.3 + seedOff * 0.013);
  vec2 qOff = qPick < 0.25 ? vec2(0.0, 0.0)
            : (qPick < 0.50 ? vec2(0.5, 0.0)
            : (qPick < 0.75 ? vec2(0.0, 0.5) : vec2(0.5, 0.5)));

  float lod = clamp(log2(256.0 / max(1.0, sz * uDpr)), 0.0, 3.0);

  // 1. Submerged dark-emerald underwater silhouette shifted down & rippled horizontally
  float waveWobble = sin(pCss.y * 0.28 + t * 2.45 + fRnd * 15.0) * wobbleAmp;
  vec2 uRel = rel - vec2(1.4 + waveWobble, sz * 0.13);
  vec2 uRot = vec2(uRel.x * ca - uRel.y * sa, uRel.x * sa + uRel.y * ca);
  uRot.x *= flipX;
  vec2 uUv = uRot / (sz * vec2(1.02, 1.05)) + 0.5;
  if (uUv.x > 0.02 && uUv.x < 0.98 && uUv.y > 0.02 && uUv.y < 0.98) {
    outUnderAlpha = textureLod(uFloesTex, qOff + uUv * 0.5, lod + 0.35).a * bayGate;
  }

  // 2. Crisp hand-painted Studio Ghibli floating ice chunk
  vec2 tRot = vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);
  tRot.x *= flipX;
  vec2 tUv = tRot / sz + 0.5;
  if (tUv.x > 0.02 && tUv.x < 0.98 && tUv.y > 0.02 && tUv.y < 0.98) {
    vec4 sp = textureLod(uFloesTex, qOff + tUv * 0.5, lod);
    outSprite = vec4(sp.rgb, sp.a * bayGate);
  }
}

// Real Hand-Painted Studio Ghibli Floating Ice Floes (uFloesTex)
// Strict 2-stage Z-order: ALL submerged reflections paint first, ALL crisp ice floes paint on top!
void applyPaintedIceFloes(
  inout vec3 seaCol,
  vec2 pCss,
  float sSurf,
  float t,
  vec3 seaDeep,
  vec3 seaVirid,
  vec3 auroraCol
) {
  if (sSurf > -6.0) return;

  float underBig = 0.0, underSmall = 0.0;
  vec4 spBig = vec4(0.0), spSmall = vec4(0.0);

  // Layer 0: Chunky primary floating ice floes (156px cell -> 100% self-contained!)
  evalFloeLayer(
    pCss, sSurf, t,
    156.0, 2.4, vec2(0.0, 0.0), 0.0, 0.44,
    52.0, 76.0, -44.0, 1.7, 2.4,
    underBig, spBig
  );

  // Layer 1: Smaller drifting broken ice chunks (92px cell -> 100% self-contained!)
  evalFloeLayer(
    pCss, sSurf, t,
    92.0, 3.5, vec2(47.0, -33.0), 53.7, 0.64,
    24.0, 38.0, -24.0, 1.1, 1.4,
    underSmall, spSmall
  );

  // Stage 1: Paint ALL matte wavy submerged underwater reflections FIRST (never darkens an ice top!)
  float ripBands = 0.52 + 0.48 * sin(pCss.y * 0.44 - t * 2.7 + pCss.x * 0.03);
  vec3 reflCol = mix(seaDeep * 0.54, mix(seaVirid, seaDeep, 0.32), ripBands * 0.58);
  float totalUnder = clamp(max(underBig * 0.72, underSmall * 0.54), 0.0, 0.78);
  if (totalUnder > 0.008) {
    seaCol = mix(seaCol, reflCol, totalUnder);
  }

  // Stage 2: Paint smaller chunks, then chunky primary floes cleanly on top!
  if (spSmall.a > 0.01) {
    seaCol = mix(seaCol, gradeSnowArt(spSmall.rgb, auroraCol), spSmall.a);
  }
  if (spBig.a > 0.01) {
    seaCol = mix(seaCol, gradeSnowArt(spBig.rgb, auroraCol), spBig.a);
  }
}

// Crisp Studio Ghibli whisper-delicate Arctic wind-snow ribbons
float evalWindRibbons(vec2 pCss) {
  float accum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 wA = uWindA[i];
    vec4 wB = uWindB[i];
    vec4 wC = uWindC[i];
    float life = wC.w;
    if (life <= 0.002) continue;

    float c = cos(wA.z);
    float s = sin(wA.z);
    vec2 rel = pCss - wA.xy;
    float lx = rel.x * c + rel.y * s;
    float ly = -rel.x * s + rel.y * c;

    float headX = wA.w;
    float len   = max(20.0, wB.x);
    float tailX = headX - len;
    if (lx < tailX - 18.0 || lx > headX + 18.0) continue;

    float u = clamp((lx - tailX) / len, 0.0, 1.0);
    float centerY = sin(lx * wB.z + wB.w) * wB.y;
    float dMain = abs(ly - centerY);

    float dCurl = 1e5;
    if (abs(wC.y) > 0.5) {
      float cx = wC.x;
      if (cx > tailX && cx < headX) {
        float cy = sin(cx * wB.z + wB.w) * wB.y + wC.y * wC.z;
        float distLoop = abs(length(vec2(lx - cx, ly - cy)) - wC.z);
        float curlGate = smoothstep(cx - wC.z * 1.15, cx - wC.z * 0.4, headX)
                       * (1.0 - smoothstep(cx - wC.z * 0.4, cx + wC.z * 1.15, tailX));
        dCurl = distLoop + (1.0 - curlGate) * 40.0;
      }
    }

    float d = min(dMain, dCurl);
    float taper = sin(u * PI);
    float halfW = mix(0.65, 2.2, taper);
    float stroke = (1.0 - smoothstep(halfW * 0.4, halfW + 1.4, d)) * pow(taper, 0.65);
    accum = max(accum, stroke * life);
  }
  return clamp(accum, 0.0, 1.0);
}

// Multi-depth soft gouache snowflakes drifting with Arctic wind
float evalSnowfall(vec2 pCss, float windT, float density) {
  if (density <= 0.01) return 0.0;
  float snow = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float cell = mix(46.0, 102.0, fl * 0.5);
    float spd  = mix(22.0, 56.0, fl * 0.5);
    vec2 drift = WIND_DIR * (windT * spd) + vec2(0.0, windT * (16.0 + fl * 11.0));
    vec2 q = pCss - drift;
    vec2 gid = floor(q / cell);
    vec2 gv  = fract(q / cell) - 0.5;

    float h1 = hash2(gid + fl * 37.3 + uSeed);
    float h2 = hash2(gid + fl * 91.7 + 13.1);
    float h3 = hash2(gid + fl * 53.9 + 7.7);

    float spawnProb = mix(0.18, 0.68, density) * mix(1.0, 0.55, fl * 0.4);
    if (h1 < spawnProb) {
      vec2 jitter = (vec2(h2, h3) - 0.5) * 0.64;
      jitter.x += sin(windT * (1.2 + fl * 0.4) + h1 * 19.0) * 0.10;
      float r = mix(0.030, 0.052, h3) * mix(0.75, 1.25, fl * 0.5);
      float d = length(gv - jitter);
      float flake = 1.0 - smoothstep(r * 0.25, r, d);
      snow += flake * mix(0.32, 0.68, fl * 0.45);
    }
  }
  return clamp(snow, 0.0, 0.85);
}

// Crisp reflected lunar disc inside the dark aquamarine ice hole at night
vec3 evalHoleMoon(vec2 localUv, float night, float phase) {
  if (night < 0.04) return vec3(0.0);
  vec2 mPos = vec2(-0.16, -0.14);
  float mRad = 0.30;
  vec2 d = (localUv - mPos) / mRad;
  float r2 = dot(d, d);
  if (r2 > 1.8) return vec3(0.0);

  float disc = 1.0 - smoothstep(0.92, 1.04, sqrt(r2));
  float halo = exp(-r2 * 1.45) * 0.22;

  float ang = (phase - 0.5) * TAU;
  vec3 sunDir = normalize(vec3(sin(ang), 0.14, cos(ang)));
  float nz = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
  vec3 nrm = normalize(vec3(d.x, -d.y, nz));
  float lit = smoothstep(-0.08, 0.22, dot(nrm, sunDir));

  vec2 texUv = d * 0.5 + 0.5;
  float crater = texture(uMoonTex, clamp(texUv, 0.02, 0.98)).r;
  vec3 moonCol = mix(vec3(0.84, 0.91, 0.98), vec3(1.0, 0.985, 0.93), 0.55) * (0.76 + 0.30 * crater);
  vec3 glowCol = vec3(0.55, 0.76, 0.96);

  return (moonCol * disc * (0.08 + 0.92 * lit) + glowCol * halo * (0.35 + 0.65 * lit)) * night;
}

void main() {
  vec2 pCss = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / max(0.5, uDpr);

  // Mood-blended matte watercolor reference tones
  vec3 snowHi    = mix(mix(D_SNOW_HI,    S_SNOW_HI,    uSunset), N_SNOW_HI,    uNight);
  vec3 snowWash  = mix(mix(D_SNOW_WASH,  S_SNOW_WASH,  uSunset), N_SNOW_WASH,  uNight);
  vec3 snowSh    = mix(mix(D_SNOW_SH,    S_SNOW_SH,    uSunset), N_SNOW_SH,    uNight);
  vec3 iceWall   = mix(mix(D_ICE_WALL,   S_ICE_WALL,   uSunset), N_ICE_WALL,   uNight);
  vec3 iceSh     = mix(mix(D_ICE_SH,     S_ICE_SH,     uSunset), N_ICE_SH,     uNight);
  vec3 seaDeep   = mix(mix(D_SEA_DEEP,   S_SEA_DEEP,   uSunset), N_SEA_DEEP,   uNight);
  vec3 seaVirid  = mix(mix(D_SEA_VIRID,  S_SEA_VIRID,  uSunset), N_SEA_VIRID,  uNight);
  vec3 seaAqua   = mix(mix(D_SEA_AQUA,   S_SEA_AQUA,   uSunset), N_SEA_AQUA,   uNight);
  vec3 holeWater = mix(mix(D_HOLE_WATER, S_HOLE_WATER, uSunset), N_HOLE_WATER, uNight);
  vec3 holeDeep  = mix(mix(D_HOLE_DEEP,  S_HOLE_DEEP,  uSunset), N_HOLE_DEEP,  uNight);
  vec3 inkCol    = mix(mix(D_INK,        S_INK,        uSunset), N_INK,        uNight);

  // Organic multi-scale noise for jagged fractured ice shoreline & fine cold-press paper unity
  vec4 nMacro = texN(pCss + vec2(uSeed * 19.0), 0.00115);
  vec4 nMid   = texN(pCss + vec2(-uSeed * 7.0, uSeed * 11.0), 0.0039);
  vec4 nBrush = texN(vec2(pCss.x * 0.72 + pCss.y * 0.28, pCss.y * 1.35 - pCss.x * 0.35), 0.0082);
  vec4 nPaper = texN(pCss, 0.032);
  vec4 nFine  = texN(pCss + vec2(47.3, 19.1), 0.068);
  float paperTooth = ((nPaper.b - 0.5) * 0.65 + (nFine.b - 0.5) * 0.35);

  // Jagged angular hand-drawn fractured ice-shelf shoreline SDF
  float rawSdf = sampleField(pCss);
  float shoreNoise = evalShoreNoise(pCss);
  float sSurf = rawSdf + shoreNoise;

  float auroraAmt = uNight * uAurora;
  vec3 auroraCol = auroraAmt > 0.01 ? evalAurora(pCss, uTime) * auroraAmt : vec3(0.0);

  // Directional shoreline lighting & cliff wall thickness
  float sLight = sampleField(pCss + LIGHT * 8.5) + shoreNoise;
  float slopeL = clamp((sSurf - sLight) * 0.12, -1.0, 1.0);
  float wallThickness = mix(10.0, 17.0, clamp(slopeL * 0.5 + 0.5, 0.0, 1.0));
  float snowMask = smoothstep(-1.0, 1.6, sSurf);

  // Evaluate natural brittle polyline shoreline cracks once (only inside shoreline/hole band!)
  float crackGrain = 0.72 + 0.28 * nBrush.g;
  vec3 crackEval = evalBrittleIceCracks(pCss, sSurf, wallThickness, crackGrain);

  // ---- 1. Real Hand-Painted Watercolor Snow Shelf & Brittle Glacier Cracks (sSurf > -2) ----
  vec3 snowCol = snowHi;
  if (sSurf > -2.0) {
    // Sample real hand-painted cold-press Arches watercolor snow paper (zero tile repeat!)
    vec3 paintedSnow = samplePaintedSnow(pCss);
    snowCol = gradeSnowArt(paintedSnow, auroraCol);

    // Gentle sunlit warm crest & periwinkle snow-hollow wash right along the fractured ice cliff
    float rimZone = smoothstep(0.0, 14.0, sSurf) * (1.0 - smoothstep(14.0, 36.0, sSurf));
    snowCol = mix(snowCol, snowHi, rimZone * clamp(-slopeL, 0.0, 1.0) * 0.45);
    snowCol = mix(snowCol, snowWash, rimZone * clamp(slopeL, 0.0, 1.0) * 0.48);

    // Composite sparse, crisp brittle polyline glacier cracks (matte pale-ice wash + dip-pen ink!)
    if (crackEval.y > 0.004) {
      snowCol = mix(snowCol, mix(snowWash, iceSh, 0.42), crackEval.y);
    }
    if (crackEval.x > 0.004) {
      vec3 fissureInk = mix(mix(iceSh, inkCol, 0.62), inkCol, smoothstep(55.0, 0.0, sSurf) * 0.48);
      snowCol = mix(snowCol, fissureInk, crackEval.x);
    }

    // Subtle sunlit diamond ice-crystal glints on snow
    vec2 spCell = floor(pCss / 24.0);
    float spRnd = hash2(spCell + uSeed * 3.1);
    if (spRnd > 0.94) {
      vec2 spOff = vec2(hash2(spCell + 11.4), hash2(spCell + 27.9));
      vec2 gv = fract(pCss / 24.0) - (0.18 + spOff * 0.64);
      float twinkle = pow(max(0.0, sin(uTime * (1.5 + spRnd * 2.0) + spRnd * 48.0)), 8.0);
      float glint = (1.0 - smoothstep(0.01, 0.085, length(gv))) * twinkle;
      snowCol += mix(vec3(1.0, 0.99, 0.95), vec3(0.84, 0.96, 1.0), uNight) * glint * 0.28;
    }
  }

  // ---- 2. Real Hand-Painted Shimmering ("Sóng Sánh") Watercolor Glacial Sea (sSurf < 2) ----
  vec3 seaCol = seaDeep;
  float shoreWaveOffset = 0.0;
  if (sSurf < 2.0) {
    // Organic liquid fluid advection (soft natural currents — ZERO glossy plastic sine grid!)
    vec3 fluid = evalOrganicFluid(pCss, uWindTime);
    vec2 fDisp = fluid.xy;
    float swell = fluid.z;
    shoreWaveOffset = swell * 2.2;

    // Layer A: Deep velvety wet-on-wet Prussian & emerald watercolor ocean gently undulating!
    vec2 pAdv1 = pCss + fDisp * 18.0 + WIND_DIR * (uWindTime * 4.8);
    vec3 wBase = texture(uWaterTex, pAdv1 / 460.0).rgb;

    // Layer B: Counter-drifting rotated watercolor wash (eliminates tile repeat & creates
    //          genuine living "sóng sánh" underwater light-bloom movement in real brushstrokes!)
    vec2 pRot = vec2(pCss.x * 0.391 - pCss.y * 0.920, pCss.x * 0.920 + pCss.y * 0.391);
    vec2 pAdv2 = pRot - fDisp * 22.0 + vec2(-uWindTime * 6.2, uWindTime * 4.4);
    vec3 wFlow = texture(uWaterTex, (pAdv2 + vec2(190.0, -130.0)) / 590.0).rgb;

    // Layer C: Finer slow-breathing surface ripple pigment warp for gentle liquid shimmer
    vec2 pAdv3 = pCss + fDisp * 28.0 - WIND_PERP * (uWindTime * 3.8);
    vec3 wRipple = texture(uWaterTex, (pAdv3 + vec2(-115.0, 240.0)) / 360.0).rgb;

    // Combine real watercolor layers using authentic MATTE pigment blending (NEVER plastic specular!)
    float swirlW = smoothstep(0.22, 0.78, texN(pCss + fDisp * 32.0 + vec2(uWindTime * 3.0), 0.0024).r);
    vec3 rawSea = mix(wBase, wFlow, swirlW * 0.56 + 0.16);

    // Luminous underwater emerald-jade watercolor currents gently brightening & morphing ("sóng sánh")
    // Extracted purely from the REAL hand-painted jade brush streaks of wFlow & wRipple!
    float jadeLift = smoothstep(0.24, 0.62, wFlow.g - wFlow.r * 0.85)
                   * smoothstep(0.18, 0.58, wRipple.g - wRipple.r * 0.75 + swell * 0.18);
    rawSea = mix(rawSea, max(rawSea, wFlow * 1.16), jadeLift * 0.42);

    // Subtle organic watercolor depth modulation (deeper Prussian velvet away from ice cliff)
    float seaDepth = clamp(-sSurf / 96.0, 0.0, 1.0);
    rawSea *= mix(1.06, 0.88, smoothstep(0.12, 0.88, seaDepth));

    // Apply harmonious Day / Sunset / Aurora Night mood grading
    seaCol = gradeWaterArt(rawSea);

    // Distance into open water beyond the vertical ice cliff
    float shoreD = max(0.0, -(sSurf + wallThickness * 0.88) + swell * 2.6);

    // Subtle translucent shallow emerald-aqua glow hugging the submerged ice shelf
    float apron = exp(-shoreD * 0.052);
    seaCol = mix(seaCol, mix(seaVirid, seaAqua, 0.35), apron * 0.34 * (1.0 - uNight * 0.35));

    // Soft wavering matte reflection of the pale periwinkle ice cliff on dark moving water
    float reflShift = sin(pCss.y * 0.25 + uWindTime * 2.1 + nMid.r * 4.5) * 2.4;
    float cliffReflBand = exp(-pow((shoreD - (5.5 + reflShift * 0.5)) * 0.24, 2.0))
                        * smoothstep(0.0, 3.0, shoreD);
    seaCol = mix(seaCol, mix(seaVirid, iceWall, 0.36), cliffReflBand * 0.28 * (1.0 - uNight * 0.35));

    // Gentle matte watercolor shoreline ripple contour breathing against the ice edge
    float lapPos = 9.5 + 3.0 * sin(uWindTime * 1.45 + nMacro.g * 8.5);
    float lapWave = exp(-pow((shoreD - lapPos) * 0.34, 2.0))
                  * (0.45 + 0.55 * sin(shoreD * 0.28 - uWindTime * 1.9 + nMid.r * 4.5))
                  * (0.65 + 0.35 * nBrush.r);
    seaCol = mix(seaCol, mix(seaAqua, snowHi, 0.24), lapWave * mix(0.28, 0.16, uNight));

    // Authentic dark Prussian watercolor pigment pooling ("backrun") right against the cliff base!
    float edgePool = exp(-shoreD * 0.24) * (0.72 + 0.28 * nBrush.r);
    seaCol = mix(seaCol, seaDeep * 0.56, edgePool * 0.58);

    // Aurora Borealis reflected organically through the rippling watercolor ocean at night
    vec3 auroraRefl = auroraAmt > 0.01 ? evalAurora(pCss + fDisp * 16.0, uTime) * auroraAmt : vec3(0.0);
    seaCol += auroraRefl * (0.46 + 0.24 * jadeLift);

    // Cast soft matte shadow from overhanging snow cliff onto adjacent glacial sea
    float sShadow = sampleField(pCss + LIGHT * 14.0) + shoreNoise;
    float cliffShadow = smoothstep(-2.0, 8.0, sShadow) * (1.0 - smoothstep(-1.0, 2.0, sSurf));
    seaCol *= 1.0 - cliffShadow * mix(0.36, 0.44, uSunset);

    // Hand-painted MATTE gouache white water flecks & rare crisp snow-sparkles (exact crop look!)
    float gouacheFleck = evalGouacheWaterFlecks(pCss, uWindTime, fDisp, swell, shoreD);
    if (gouacheFleck > 0.004) {
      vec3 fleckCol = mix(mix(vec3(0.985, 0.982, 0.955), vec3(0.99, 0.90, 0.86), uSunset),
                          vec3(0.80, 0.93, 0.99), uNight);
      // Matte gouache paper-textured opacity (zero glowing neon!)
      seaCol = mix(seaCol, fleckCol * (1.0 + paperTooth * 0.04), gouacheFleck * mix(0.94, 0.80, uNight));
    }

    // Real hand-painted Studio Ghibli floating ice floes WITH matte wavy submerged reflections!
    applyPaintedIceFloes(seaCol, pCss, sSurf, uWindTime, seaDeep, seaVirid, auroraCol);
  }

  // ---- 3. Stepped Matte Hand-Inked Glacial Ice Cliff Joining Sea & Snow Shelf ----
  float wallBottom = -wallThickness + shoreWaveOffset * 0.40;
  float wallMask = smoothstep(wallBottom, wallBottom + 2.2, sSurf) * (1.0 - smoothstep(-0.8, 1.6, sSurf));

  vec3 wallCol = iceWall;
  if (wallMask > 0.004) {
    // Stepped matte watercolor facet planes (flat painted watercolor washes, NOT smooth plastic!)
    float facetCoord = pCss.x * 0.042 + pCss.y * 0.028 + nMid.r * 1.4;
    float facetId = hash2(vec2(floor(facetCoord), 11.3));
    float facetBand = floor(facetId * 3.0) / 2.0; // crisp 3-step matte watercolor wash tones
    float facetLine = (1.0 - smoothstep(0.0, 0.075, abs(fract(facetCoord) - 0.5) * 2.0))
                    * (0.62 + 0.38 * nBrush.g);

    float wallDepthT = clamp(-sSurf / max(1.0, wallThickness), 0.0, 1.0);
    // Modulate flat matte ice-cliff wash with real cold-press watercolor paper grain from uSnowTex!
    vec3 paperTint = samplePaintedSnow(pCss * 1.25);
    float paperLum = dot(paperTint, vec3(0.30, 0.50, 0.20));
    wallCol = mix(iceWall, iceSh, mix(0.18, 0.72, facetBand) * 0.65 + wallDepthT * 0.42);
    wallCol *= (0.88 + 0.16 * paperLum);
    // Subtle dark wet-ice tone right along the waterline
    wallCol = mix(wallCol, mix(seaVirid, iceSh, 0.58), smoothstep(0.72, 1.0, wallDepthT) * 0.42);
    // Crisp broken dip-pen vertical fracture strokes & connected 3D vertical cliff drops from surface cracks!
    wallCol = mix(wallCol, inkCol, clamp(facetLine * 0.42 + crackEval.z * 0.78, 0.0, 0.85));
  }

  // Crisp broken hand-inked pen contour lines along top snow overhang & lower waterline base
  float inkBreak    = 0.60 + 0.40 * nBrush.g;
  float topInkLine  = (1.0 - smoothstep(0.0, 1.65, abs(sSurf - 0.2))) * inkBreak;
  float baseInkLine = (1.0 - smoothstep(0.0, 1.95, abs(sSurf - wallBottom - 0.4))) * inkBreak;

  vec3 col = seaCol;
  col = mix(col, wallCol, wallMask * 0.98);
  col = mix(col, snowCol, snowMask);
  col = mix(col, inkCol, clamp(topInkLine * 0.52 + baseInkLine * 0.58, 0.0, 0.76));

  // ---- 4. Hand-Painted Faceted Aquamarine Ice Hole (Penguin's Playground!) ----
  if (uHole.z > 1.0 && sSurf > -4.0) {
    vec2 hRel = pCss - uHole.xy;
    vec2 hNorm = hRel / max(vec2(1.0), uHole.zw);
    float hAng = atan(hNorm.y, hNorm.x);
    float facet = 0.068 * cos(hAng * 5.0 + 0.6) + 0.042 * sin(hAng * 3.0 - 1.1)
                + 0.024 * cos(hAng * 7.0 + uSeed) + (nBrush.r - 0.5) * 0.032;
    float hDist = length(hNorm) + facet;

    // Soft matte periwinkle watercolor collar shadow around the carved ice rim
    float outerLip = smoothstep(1.36, 1.05, hDist) * smoothstep(0.96, 1.04, hDist);
    float lipLight = dot(normalize(hNorm + vec2(1e-4)), LIGHT);
    vec3 lipCol = mix(snowSh * 0.95, snowHi, 0.5 + 0.5 * lipLight);
    col = mix(col, lipCol, outerLip * 0.60 * snowMask);

    if (hDist < 1.08) {
      float holeMask = 1.0 - smoothstep(0.98, 1.04, hDist);
      vec2 innerNorm = (hRel - LIGHT * 6.5) / max(vec2(1.0), uHole.zw * 0.87);
      float innerDist = length(innerNorm) + facet;
      float waterMask = 1.0 - smoothstep(0.90, 0.99, innerDist);

      // Real hand-painted watercolor water inside the ice hole, brightened to jewel aquamarine!
      vec3 hFluid = evalOrganicFluid(hRel * 1.65, uTime * 1.05);
      vec2 hUv = (hRel + hFluid.xy * 9.0 + vec2(uTime * 5.0, -uTime * 3.5)) / 320.0;
      vec3 hPainted = texture(uWaterTex, hUv).rgb;
      float hTone = clamp(hPainted.g * 1.45, 0.0, 1.0);
      vec3 hw = mix(holeDeep, holeWater, smoothstep(0.05, 0.85, innerDist) * 0.58 + hTone * 0.45);
      hw = mix(hw, mix(holeWater, snowHi, 0.34), smoothstep(0.72, 0.98, innerDist) * 0.44);
      hw += auroraCol * 0.56;
      hw += evalHoleMoon(innerNorm + hFluid.xy * 0.03, uNight, uMoonPhase);

      // Gentle matte watercolor idle ripples + penguin splash rings
      float idleWave = sin(innerDist * 16.0 - uTime * 2.1 + hFluid.z * 1.4) * 0.5 + 0.5;
      float rippleRing = idleWave * 0.048 * (1.0 - innerDist * 0.45);
      if (uHoleRipple.y > 0.01 && uHoleRipple.x >= 0.0 && uHoleRipple.x < 2.2) {
        float rAge = uHoleRipple.x;
        float rEnv = exp(-rAge * 1.95) * uHoleRipple.y;
        float rad1 = rAge * 0.96;
        float rad2 = max(0.0, (rAge - 0.18) * 0.92);
        float ring1 = exp(-pow((innerDist - rad1) * 14.0, 2.0));
        float ring2 = exp(-pow((innerDist - rad2) * 16.0, 2.0)) * 0.65;
        rippleRing += (ring1 + ring2) * rEnv * 0.72;
      }
      hw = mix(hw, mix(vec3(0.86, 0.97, 0.96), vec3(0.98, 0.86, 0.88), uSunset), clamp(rippleRing, 0.0, 0.78));
      hw *= 1.0 + paperTooth * 0.045;

      // Stepped matte faceted beveled ice wall inside the hole
      float bevelFacet = 1.0 - smoothstep(0.0, 0.11, abs(sin(hAng * 2.5 + 0.3)));
      vec3 bevelCol = mix(iceWall * 1.04, iceSh * 1.02, 0.5 + 0.5 * lipLight) * (1.0 + paperTooth * 0.04);
      bevelCol = mix(bevelCol, inkCol, bevelFacet * 0.28);
      vec3 holeInterior = mix(bevelCol, hw, waterMask);

      float rimInk = (1.0 - smoothstep(0.0, 0.048, abs(hDist - 0.99))) * (0.65 + 0.35 * nBrush.g);
      col = mix(col, holeInterior, holeMask * snowMask);
      col = mix(col, inkCol, rimInk * 0.58 * snowMask);
    }
  }

  // ---- 5. Hand-Painted Studio Ghibli Sleeping Polar Bear & Red-Scarf Penguin ----
  if (uActorsRect.z > 1.0) {
    vec2 aUv = (pCss - uActorsRect.xy) / uActorsRect.zw;
    if (aUv.x >= 0.0 && aUv.x <= 1.0 && aUv.y >= 0.0 && aUv.y <= 1.0) {
      // Soft 5-tap GPU watercolor penumbra shadow directly from shadow FBO (zero CPU blur!)
      vec2 shOff = vec2(0.0085, 0.0085);
      float shAlpha = (
        texture(uActorsShadowTex, aUv).a * 0.36 +
        texture(uActorsShadowTex, aUv + vec2( shOff.x,  0.0)).a * 0.16 +
        texture(uActorsShadowTex, aUv + vec2(-shOff.x,  0.0)).a * 0.16 +
        texture(uActorsShadowTex, aUv + vec2( 0.0,  shOff.y)).a * 0.16 +
        texture(uActorsShadowTex, aUv + vec2( 0.0, -shOff.y)).a * 0.16
      );
      if (shAlpha > 0.004) {
        vec3 shTint = mix(mix(vec3(0.68, 0.75, 0.89), vec3(0.49, 0.43, 0.64), uSunset),
                          vec3(0.08, 0.15, 0.27), uNight);
        col = mix(col, col * mix(vec3(1.0), shTint, 0.54), shAlpha * 0.85);
      }

      // Un-premultiply FBO RGBA cleanly for razor-sharp edge compositing with zero dark halo
      vec4 act = texture(uActorsTex, aUv);
      if (act.a > 0.004) {
        vec3 aCol = clamp(act.rgb / act.a, 0.0, 1.0);
        vec3 sunsetGraded = aCol * vec3(1.01, 0.87, 0.83) + vec3(0.045, 0.015, 0.03) * (1.0 - aCol.b);
        vec3 nightGraded  = aCol * vec3(0.45, 0.57, 0.73) + auroraCol * 0.15;
        aCol = mix(mix(aCol, sunsetGraded, uSunset * 0.85), nightGraded, uNight * 0.88);
        aCol *= 1.0 + paperTooth * 0.028;
        col = mix(col, aCol, act.a);
      }
    }
  }

  // ---- 6. Whisper-Delicate Arctic Wind Ribbons & Falling Gouache Snowflakes ----
  float windStroke = evalWindRibbons(pCss);
  if (windStroke > 0.002) {
    vec3 windCol = mix(mix(vec3(1.0, 0.995, 0.98), vec3(1.0, 0.90, 0.86), uSunset),
                       vec3(0.76, 0.94, 1.0), uNight);
    col = mix(col, windCol, windStroke * 0.45);
  }

  float snowFlakes = evalSnowfall(pCss, uWindTime, uSnow);
  if (snowFlakes > 0.002) {
    vec3 flakeCol = mix(mix(vec3(1.0, 0.995, 0.97), vec3(1.0, 0.91, 0.89), uSunset),
                        vec3(0.80, 0.92, 1.0), uNight);
    col = mix(col, flakeCol, snowFlakes * 0.74);
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
