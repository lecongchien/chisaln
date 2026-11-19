/**
 * Alpine Breeze & Foreground Meadow Sway System for Theme #3 ("Lâu đài trên đồi gió")
 * Drives cohesive Studio Ghibli mountain wind gusts across the entire scene:
 * - Organic rolling alpine gust pulse (shared with hillside grass waves, smoke, shepherd, & wind ribbons)
 * - Graceful foreground wildflower & tall-grass tufts bending smoothly in real-time gusts
 *   (monotonic accumulated phase guarantees silky motion with zero phase-jump jitter!)
 */
export function createAlpineBreeze() {
  const tufts = [];
  let gustPhase = 0;
  let tuftWavePhase = 0;
  let flutterPhase = 0;
  let gustStrength = 0.42;
  let lastW = 0, lastH = 0;

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
          baseLean: 0.14 + rnd() * 0.24,
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
      tufts.push({ x: cx, y: cy, blades });
    }
  }

  function step(dt, { W, H, flow }) {
    if (W !== lastW || H !== lastH) rebuildTufts(W, H);
    const wind = Math.max(0.05, flow);

    // Organic alpine gust swell (periodic mountain wind surges + gentle lulls)
    gustPhase += dt * (0.42 + wind * 0.34);
    const wave1 = 0.5 + 0.5 * Math.sin(gustPhase);
    const wave2 = 0.5 + 0.5 * Math.sin(gustPhase * 2.37 + 1.4);
    const rawGust = Math.pow(wave1 * 0.65 + wave2 * 0.35, 1.35);
    gustStrength = Math.max(0.18, Math.min(1.0, (0.24 + rawGust * 0.76) * Math.min(1.35, wind)));

    // Strictly monotonic accumulated wave phases (never t * variable -> zero jitter!)
    tuftWavePhase += dt * (1.75 + wind * 0.90);
    flutterPhase  += dt * (3.6 + gustStrength * 1.8) * Math.min(1.4, wind);
  }

  /** Draws foreground swaying wildflower & tall grass tufts anchored along bottom edge */
  function drawForegroundTufts(ctx, _t, _W, _H, flow) {
    if (!tufts.length) return;
    const wind = Math.max(0.08, flow);

    ctx.save();
    ctx.lineCap = 'round';
    for (const tf of tufts) {
      const localWave = 0.5 + 0.5 * Math.sin(tf.x * 0.0055 - tuftWavePhase);
      const bendMag = (0.26 + gustStrength * 0.58 + localWave * 0.42) * Math.min(1.35, wind);

      for (const b of tf.blades) {
        const bx = tf.x + b.ox;
        const by = tf.y + b.oy;
        const flutter = Math.sin(flutterPhase * b.stiff + b.phase + tf.x * 0.02) * (0.07 + gustStrength * 0.11);
        const lean = b.baseLean + bendMag * b.stiff + flutter;
        const tipX = bx + Math.sin(lean) * b.h * 1.15;
        const tipY = by - Math.cos(Math.min(1.28, lean * 0.82)) * b.h;
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
          ctx.rotate(lean * 0.7);
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
    get gust() { return gustStrength; },
    step,
    drawForegroundTufts
  };
}
