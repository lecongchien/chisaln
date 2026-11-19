/**
 * 3-Tier Depth-Layered Cascade Hillside Wind System for Theme #3 ("Lâu đài trên đồi gió")
 * Models discrete rolling alpine wind layers sweeping sequentially from:
 *   Tier 1 (Upper distant ridge & Howl's Moving Castle)
 *   -> Tier 2 (Mid-slope terraces, prairie cottage smoke & base grass)
 *   -> Tier 3 (Foreground sheep flock, shepherd cloak & bottom-edge wildflower tufts)
 *
 * Exposes:
 * - frontsBuf (Float32Array(12) -> 3 x vec4 uniform uWindFronts[3] for WebGL2 shader)
 * - sampleAt(nx, y, W, H): exact physical wind crest/trough at ANY point on the hill!
 * - drawForegroundTufts: domino-cascading foreground flowers & tall grass synced 1:1 with Tier 3!
 */
import { ridgeYAt } from './castle-walker.js';

const MAX_FRONTS = 3;

export function createAlpineBreeze() {
  const tufts = [];
  const fronts = [];
  const frontsBuf = new Float32Array(MAX_FRONTS * 4);

  let spawnCooldown = 1.6;
  let flutterPhase = 0;
  let globalGust = 0.35;
  let lastW = 0, lastH = 0;

  // Pre-seed 1 graceful active wind layer mid-hill on frame 1 so the scene feels alive immediately
  fronts.push({
    pos: 0.34,
    speed: 0.165,
    width: 0.115,
    peak: 0.92,
    seed: 3.7,
    active: true
  });
  for (let i = 1; i < MAX_FRONTS; i++) {
    fronts.push({ pos: -1, speed: 0.16, width: 0.11, peak: 0, seed: i * 5.3, active: false });
  }

  /**
   * Computes the shared perspective cascade coordinate s in [0..~1.12]
   * matching castle-shader.js 1:1:
   *   0.00..0.28 = Tier 1 (distant upper-left ridge)
   *   0.28..0.68 = Tier 2 (mid-hillside & cottage)
   *   0.68..1.12 = Tier 3 (foreground flock & bottom wildflower edge)
   */
  function cascadeCoord(nx, y, W, H) {
    const rY = ridgeYAt(nx, H);
    const hillDepth = Math.max(0, Math.min(1, (y - rY) / Math.max(80, H * 0.55)));
    const perspDepth = Math.pow(hillDepth, 0.72);
    return {
      s: perspDepth * 0.74 + nx * 0.36,
      hillDepth
    };
  }

  function frontEnvelope(pos, peak) {
    // Smooth rise entering distant ridge (-0.18 -> 0.08), graceful dissolve past bottom-right (1.06 -> 1.38)
    const enter = Math.max(0, Math.min(1, (pos + 0.18) / 0.26));
    const exit  = Math.max(0, Math.min(1, (1.38 - pos) / 0.32));
    const e1 = enter * enter * (3 - 2 * enter);
    const e2 = exit * exit * (3 - 2 * exit);
    return e1 * e2 * peak;
  }

  /** Samples the exact live wind crest (0..1) passing through point (nx, y) on the hill */
  function sampleAt(nx, y, W, H) {
    const { s, hillDepth } = cascadeCoord(nx, y, W, H);
    let crest = 0;
    for (let i = 0; i < MAX_FRONTS; i++) {
      const f = fronts[i];
      if (!f.active) continue;
      const env = frontEnvelope(f.pos, f.peak);
      if (env <= 0.005) continue;
      const wLoc = f.width * (0.58 + 0.85 * hillDepth);
      const d = (s - f.pos) / Math.max(0.025, wLoc);
      const lead = Math.exp(-Math.pow((d - 0.16) / 0.72, 2)) * env;
      const tail = Math.exp(-Math.pow((d + 0.62) / 0.95, 2)) * env * 0.55;
      crest = Math.max(crest, lead, tail);
    }
    return Math.min(1, 0.14 + crest * 0.86);
  }

  function rebuildTufts(W, H) {
    tufts.length = 0;
    lastW = W;
    lastH = H;
    const sc = Math.max(0.58, Math.min(1.12, Math.min(W, H) / 900));

    const spots = [
      { nx: 0.03, ny: 0.985, count: 9, scale: 1.08, flowers: true },
      { nx: 0.09, ny: 0.992, count: 7, scale: 0.90, flowers: true },
      { nx: 0.17, ny: 0.996, count: 6, scale: 0.78, flowers: false },
      { nx: 0.34, ny: 0.994, count: 6, scale: 0.76, flowers: true },
      { nx: 0.52, ny: 0.996, count: 5, scale: 0.72, flowers: false },
      { nx: 0.76, ny: 0.992, count: 7, scale: 0.88, flowers: true },
      { nx: 0.86, ny: 0.988, count: 9, scale: 1.02, flowers: true },
      { nx: 0.95, ny: 0.984, count: 10, scale: 1.12, flowers: true }
    ];

    let seed = 17;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (const sp of spots) {
      const cx = sp.nx * W;
      const cy = sp.ny * H;
      const blades = [];
      for (let i = 0; i < sp.count; i++) {
        const ox = (rnd() - 0.5) * 78 * sc * sp.scale;
        const oy = (rnd() - 0.5) * 14 * sc;
        const isFlower = sp.flowers && rnd() > 0.58;
        const h = (isFlower ? (24 + rnd() * 20) : (18 + rnd() * 22)) * sc * sp.scale;
        blades.push({
          ox, oy, h,
          baseLean: 0.10 + rnd() * 0.20,
          stiff: 0.72 + rnd() * 0.52,
          phase: rnd() * Math.PI * 2,
          isFlower,
          flowerColor: isFlower
            ? (rnd() < 0.48 ? '#fdfbf2' : (rnd() < 0.78 ? '#f9da58' : '#b8d7f6'))
            : null,
          leafShade: rnd() < 0.45 ? '#356426' : (rnd() < 0.8 ? '#4c822e' : '#6b9d38'),
          width: (isFlower ? 1.25 : (1.5 + rnd() * 1.1)) * sc
        });
      }
      tufts.push({ nx: sp.nx, x: cx, y: cy, bendSmooth: 0.18, blades });
    }
  }

  function spawnFront() {
    for (let i = 0; i < MAX_FRONTS; i++) {
      if (!fronts[i].active) {
        fronts[i].active = true;
        fronts[i].pos = -0.18;
        fronts[i].speed = 0.145 + Math.random() * 0.055; // ~6.5-8.5s full ridge-to-foreground cascade!
        fronts[i].width = 0.095 + Math.random() * 0.045;
        fronts[i].peak  = 0.78 + Math.random() * 0.22;
        fronts[i].seed  = Math.random() * 24.0;
        return true;
      }
    }
    return false;
  }

  function step(dt, { W, H, flow }) {
    if (W !== lastW || H !== lastH) rebuildTufts(W, H);
    const wind = Math.max(0.05, flow);

    // Advance active wind tiers from distant ridge (pos = -0.18) down through foreground (pos = 1.40)
    let activePeak = 0;
    let nearestNew = 9.0;
    for (let i = 0; i < MAX_FRONTS; i++) {
      const f = fronts[i];
      if (!f.active) continue;
      // Subtle natural perspective acceleration as the gust sweeps off the ridge into the open slope
      const accel = 0.82 + 0.36 * Math.max(0, Math.min(1, f.pos));
      f.pos += dt * f.speed * accel * (0.45 + wind * 0.65);
      if (f.pos < nearestNew) nearestNew = f.pos;
      const env = frontEnvelope(f.pos, f.peak);
      if (env > activePeak) activePeak = env;
      if (f.pos > 1.42) f.active = false;
    }

    // Spawn the next staggered tier with a natural breathing pause (never overlapping too tightly!)
    spawnCooldown -= dt * (0.50 + wind * 0.55);
    if (spawnCooldown <= 0 && nearestNew > 0.42) {
      if (spawnFront()) {
        // Organic breathing rhythm: 2.6s..5.2s between successive mountain wind layers
        spawnCooldown = 2.6 + Math.random() * 2.6;
      } else {
        spawnCooldown = 1.0;
      }
    }

    // Smooth global gust indicator (for subtle secondary ambient cues)
    const targetGlobal = Math.max(0.16, Math.min(1.0, (0.18 + activePeak * 0.82) * Math.min(1.3, wind)));
    globalGust += (targetGlobal - globalGust) * Math.min(1, dt * 3.5);

    // Strictly monotonic blade-tip flutter phase
    flutterPhase += dt * (3.2 + globalGust * 2.4) * Math.min(1.35, wind);

    // Smoothly spring-ease each foreground tuft's bend to its EXACT local Tier-3 wind front!
    for (const tf of tufts) {
      const localW = sampleAt(tf.nx, tf.y, W, H);
      // Fast bend downwind when hit by gust, slower elastic spring-back upright!
      const rate = localW > tf.bendSmooth ? 5.8 : 2.6;
      tf.bendSmooth += (localW - tf.bendSmooth) * Math.min(1, dt * rate);
    }

    // Pack 3 wind layers cleanly into Float32Array for WebGL2 uWindFronts[3]
    for (let i = 0; i < MAX_FRONTS; i++) {
      const f = fronts[i];
      const o = i * 4;
      if (f.active) {
        frontsBuf[o]     = f.pos;
        frontsBuf[o + 1] = f.width;
        frontsBuf[o + 2] = frontEnvelope(f.pos, f.peak) * Math.min(1.25, wind);
        frontsBuf[o + 3] = f.seed;
      } else {
        frontsBuf[o]     = -2.0;
        frontsBuf[o + 1] = 0.1;
        frontsBuf[o + 2] = 0.0;
        frontsBuf[o + 3] = 0.0;
      }
    }
  }

  /** Draws foreground wildflower & tall grass tufts bowing in a domino ripple as Tier 3 passes! */
  function drawForegroundTufts(ctx, _t, _W, _H, flow) {
    if (!tufts.length) return;
    const wind = Math.max(0.08, flow);

    ctx.save();
    ctx.lineCap = 'round';
    for (const tf of tufts) {
      const localG = tf.bendSmooth;
      const bendMag = (0.14 + localG * 0.92) * Math.min(1.35, wind);

      for (const b of tf.blades) {
        const bx = tf.x + b.ox;
        const by = tf.y + b.oy;
        const flutter = Math.sin(flutterPhase * b.stiff + b.phase + tf.x * 0.02) * (0.04 + localG * 0.15);
        const lean = b.baseLean + bendMag * b.stiff + flutter;
        const tipX = bx + Math.sin(lean) * b.h * 1.18;
        const tipY = by - Math.cos(Math.min(1.32, lean * 0.84)) * b.h;
        const ctrlX = bx + Math.sin(lean * 0.45) * b.h * 0.52;
        const ctrlY = by - b.h * 0.56;

        ctx.strokeStyle = b.leafShade;
        ctx.lineWidth = b.width;
        ctx.beginPath();
        ctx.moveTo(bx, by + 3);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();

        if (b.isFlower) {
          ctx.save();
          ctx.translate(tipX, tipY);
          ctx.rotate(lean * 0.72);
          const r = b.width * 2.15;
          ctx.fillStyle = b.flowerColor;
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, r * 0.62, r * 0.36, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#e5a826';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  return {
    get gust() { return globalGust; },
    frontsBuf,
    sampleAt,
    step,
    drawForegroundTufts
  };
}
