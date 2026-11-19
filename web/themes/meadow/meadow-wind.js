/**
 * Studio Ghibli Anime Wind Ribbon Controller (Subtle Gust Scheduler)
 * Keeps the meadow calm and uncluttered most of the time; every 6-12 seconds
 * a single gentle breeze gust sweeps across, spawning 1-2 whisper-delicate
 * translucent wind ribbons that glide smoothly along WIND_DIR and dissolve.
 *
 * Packs up to MAX_WIND_RIBBONS into 3 GPU uniform vec4 arrays:
 *   uWindA[i] = (ox, oy, angle, headX)
 *   uWindB[i] = (length, amp, freq, phase)
 *   uWindC[i] = (curlX, curlSign, curlR, lifeAlpha)
 */
export const MAX_WIND_RIBBONS = 4;

const BASE_WIND_ANGLE = Math.atan2(0.530, 0.848); // Matches WIND_DIR in meadow-shader.js

const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const easeInOutSine = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);

export function createWindRibbonSystem() {
  const bufA = new Float32Array(MAX_WIND_RIBBONS * 4);
  const bufB = new Float32Array(MAX_WIND_RIBBONS * 4);
  const bufC = new Float32Array(MAX_WIND_RIBBONS * 4);

  const slots = Array.from({ length: MAX_WIND_RIBBONS }, () => ({
    active: false,
    delay: 0,
    age: 0,
    duration: 3.6,
    ox: 0,
    oy: 0,
    angle: BASE_WIND_ANGLE,
    travelDist: 560,
    length: 250,
    amp: 11,
    freq: 0.015,
    phase: 0,
    curlX: 200,
    curlSign: 0,
    curlR: 17,
    peakAlpha: 0.22
  }));

  // First subtle breeze arrives softly ~2.2s after launch; afterwards calm pauses of 6.5-12.5s
  let gustCooldown = 2.2;
  let lastLane = -1;

  function allocSlot() {
    return slots.find((s) => !s.active && s.delay <= 0) || null;
  }

  function scheduleRibbon(slot, W, H, flow, anchorX, anchorY, baseAng, delaySec, allowCurl) {
    const sc = Math.max(0.68, Math.min(1.18, Math.min(W, H) / 900));
    slot.ox = anchorX;
    slot.oy = anchorY;
    slot.angle = baseAng + (Math.random() - 0.5) * 0.07;

    slot.length = (220 + Math.random() * 125) * sc;
    slot.travelDist = (480 + Math.random() * 260) * sc;
    slot.amp = (8 + Math.random() * 7) * sc;
    slot.freq = (0.012 + Math.random() * 0.005) / sc;
    slot.phase = Math.random() * Math.PI * 2;

    // Rare, understated anime curl flourish (~35% on primary ribbon only)
    const hasCurl = allowCurl && Math.random() < 0.35;
    slot.curlSign = hasCurl ? (Math.random() < 0.5 ? -1 : 1) : 0;
    slot.curlR = (14 + Math.random() * 6.5) * sc;
    slot.curlX = slot.travelDist * (0.36 + Math.random() * 0.22);

    const speedFactor = Math.max(0.55, Math.min(1.65, 0.72 + flow * 0.30));
    slot.duration = (3.2 + Math.random() * 1.25) / speedFactor;
    slot.age = 0;
    slot.delay = delaySec;
    // Whisper-delicate translucent opacity (refined & airy, never stark)
    slot.peakAlpha = 0.19 + Math.random() * 0.075;
    slot.active = delaySec <= 0;
  }

  function triggerGust(W, H, flow) {
    const sc = Math.max(0.68, Math.min(1.18, Math.min(W, H) / 900));
    let lane = (Math.random() * 4) | 0;
    if (lane === lastLane) lane = (lane + 1 + ((Math.random() * 2) | 0)) % 4;
    lastLane = lane;

    const laneFrac = (lane + 0.25 + Math.random() * 0.5) / 4;
    const ox = W * (0.04 + Math.random() * 0.46) - 35 * sc;
    const oy = H * (0.10 + laneFrac * 0.68) - 20 * sc;
    const ang = BASE_WIND_ANGLE + (Math.random() - 0.5) * 0.12;

    const s1 = allocSlot();
    if (s1) {
      scheduleRibbon(s1, W, H, flow, ox, oy, ang, 0, true);
    }

    // 45% of gusts carry a gentle companion breeze trailing slightly offset ~0.55s later
    if (Math.random() < 0.45) {
      const s2 = allocSlot();
      if (s2) {
        const perpOff = (Math.random() < 0.5 ? -1 : 1) * (58 + Math.random() * 54) * sc;
        const ox2 = ox - Math.sin(ang) * perpOff + Math.cos(ang) * (35 * sc);
        const oy2 = oy + Math.cos(ang) * perpOff + Math.sin(ang) * (35 * sc);
        scheduleRibbon(s2, W, H, flow, ox2, oy2, ang, 0.48 + Math.random() * 0.35, false);
        s2.peakAlpha *= 0.82;
      }
    }
  }

  function step(dt, flow, W, H) {
    const f = Math.max(0, flow);
    bufA.fill(0);
    bufB.fill(0);
    bufC.fill(0);

    // Calm interval between occasional gusts (6.5-12.5s at normal wind)
    if (f > 0.05) {
      gustCooldown -= dt * (0.45 + Math.min(2.0, f) * 0.55);
      if (gustCooldown <= 0) {
        triggerGust(W, H, f);
        gustCooldown = 6.5 + Math.random() * 6.0;
      }
    }

    for (let i = 0; i < MAX_WIND_RIBBONS; i++) {
      const s = slots[i];
      if (!s.active) {
        if (s.delay > 0) {
          s.delay -= dt;
          if (s.delay <= 0) {
            s.delay = 0;
            s.active = true;
          }
        }
        continue;
      }

      s.age += dt * (0.52 + Math.min(2.0, f) * 0.48);
      const u = s.age / Math.max(0.2, s.duration);
      if (u >= 1.0) {
        s.active = false;
        continue;
      }

      // Lazy, airy glide with soft gradual fade-in (26%) and misty fade-out (44%)
      const headX = (easeInOutSine(u) * 0.52 + easeOutCubic(u) * 0.48) * s.travelDist + s.length * 0.22;
      const fi = Math.min(1, u / 0.26);
      const fo = Math.min(1, (1 - u) / 0.44);
      const lifeAlpha = s.peakAlpha
                      * (fi * fi * (3 - 2 * fi))
                      * (fo * fo * (3 - 2 * fo))
                      * Math.min(1, f * 2.0);

      const base = i * 4;
      bufA[base]     = s.ox;
      bufA[base + 1] = s.oy;
      bufA[base + 2] = s.angle;
      bufA[base + 3] = headX;

      bufB[base]     = s.length;
      bufB[base + 1] = s.amp;
      bufB[base + 2] = s.freq;
      bufB[base + 3] = s.phase;

      bufC[base]     = s.curlX;
      bufC[base + 1] = s.curlSign;
      bufC[base + 2] = s.curlR;
      bufC[base + 3] = lifeAlpha;
    }
  }

  return {
    step,
    bufA,
    bufB,
    bufC
  };
}
