/**
 * Sea Train Central-Aisle Cabin Living Engine ("Trong toa tàu biển" — Image-2 One-Point Perspective)
 * Loads hand-painted central-aisle interior (`cabin-frame.png`) & Chihiro + Towering No-Face (`cabin-noface.png`),
 * optionally reusing shared exterior textures (`clouds`, `island`, `station`) from Sea Railway for zero VRAM duplication,
 * and simulates:
 *   1. TWO receding one-point perspective rows of 6 ivory circular hand-straps (12 total) attached pixel-exact
 *      to both painted overhead steel handrail bars, swinging physically on damped pendulums driven by
 *      periodic submerged rail-joint impulses ("click-clack")!
 *   2. Signature Spirited Away curved hand-strap ring shadows swaying live along the right edge of the pale cream
 *      center aisle walkway runner during Day & Sunset!
 *   3. Soft diagonal volumetric sunbeams pouring from the receding left windows across the center aisle
 *      + gently drifting golden dust motes!
 *   4. Calm living breathing motion on Chihiro + towering No-Face standing in the right foreground.
 */

function loadGpuTexture(gl, src, wrapS, onLoaded) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    onLoaded?.(img);
  };
  img.src = src;
  return tex;
}

// Measured pixel-exact overhead steel handrail bars inside cabin-frame.png (1440x810)
const LEFT_RAIL  = { x0: 0.291, y0: 0.004, x1: 0.430, y1: 0.314 };
const RIGHT_RAIL = { x0: 0.709, y0: 0.004, x1: 0.570, y1: 0.314 };
const STRAP_DEPTHS = [0.09, 0.23, 0.37, 0.51, 0.65, 0.79];

export function createCabinLivingEngine(gl, onReady, sharedExt = null) {
  let cabinReady = 0.0;
  let noFaceReady = 0.0;
  let localCloudsReady = 0.0;
  let noFaceAspect = 331 / 680;

  const cabinTex = loadGpuTexture(gl, 'assets/cabin-frame.png', gl.CLAMP_TO_EDGE, () => {
    cabinReady = 1.0;
    onReady?.();
  });
  const noFaceTex = loadGpuTexture(gl, 'assets/cabin-noface.png', gl.CLAMP_TO_EDGE, (img) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) noFaceAspect = img.naturalWidth / img.naturalHeight;
    noFaceReady = 1.0;
    onReady?.();
  });

  // Reuse shared Sea Railway seamless cloud panorama whenever merged inside seatrain-scene.js!
  const cloudsTex = sharedExt?.cloudsTexture || loadGpuTexture(gl, 'assets/seatrain-clouds.png', gl.REPEAT, () => {
    localCloudsReady = 1.0;
    onReady?.();
  });

  // Lightweight capped Canvas2D living overlay (800x450 -> ultra-fast software draw & 30 Hz GPU upload!)
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');

  const liveTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, liveTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  // Build 12 perspective hanging hand-straps (6 left rail + 6 right rail), drawn far -> near for depth layering!
  const straps = [];
  for (let side = -1; side <= 1; side += 2) {
    const rail = side < 0 ? LEFT_RAIL : RIGHT_RAIL;
    for (let i = STRAP_DEPTHS.length - 1; i >= 0; i--) {
      const t = STRAP_DEPTHS[i];
      straps.push({
        side,
        idx: i,
        t,
        nx: rail.x0 + (rail.x1 - rail.x0) * t,
        ny: rail.y0 + (rail.y1 - rail.y0) * t,
        // Perspective depth scaling: foreground straps are bold & full-sized, far straps shrink cleanly
        depthScale: 1.0 - 0.56 * t,
        angle: (i % 2 === 0 ? 1 : -1) * 0.032,
        vel: 0,
        freq: 4.15 + (i % 3) * 0.32 + (side > 0 ? 0.14 : 0),
        phase: i * 0.85 + (side > 0 ? 1.7 : 0)
      });
    }
  }

  // 26 lazy golden dust motes drifting across the sunlit central aisle
  const motes = [];
  for (let i = 0; i < 26; i++) {
    motes.push({
      nx: 0.14 + Math.random() * 0.62,
      ny: 0.16 + Math.random() * 0.76,
      vx: 0.004 + Math.random() * 0.007,
      vy: 0.001 + (Math.random() - 0.45) * 0.006,
      r: 0.95 + Math.random() * 1.75,
      phase: Math.random() * Math.PI * 2
    });
  }

  const state = {
    worldScroll: 0.25,
    time: 0,
    bobY: 0,
    swayX: 0,
    railPhase: 0,
    breathPhase: 0,
    noFaceRect: new Float32Array(4)
  };

  function resize(W, H) {
    const scale = Math.min(1.0, 800 / Math.max(1, W));
    const nw = Math.max(320, Math.round(W * scale));
    const nh = Math.max(180, Math.round(H * scale));
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw;
      canvas.height = nh;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      gl.bindTexture(gl.TEXTURE_2D, liveTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  function step(dt, { W, H, flow, shake }) {
    const pace = Math.max(0.0, flow);
    const shakeAmp = Math.max(0.0, Math.min(1.0, shake ?? 0.65));
    state.time += dt;
    state.worldScroll += dt * 0.36 * pace;
    state.breathPhase += dt * 1.28;

    // Periodic submerged rail-joint impulse ("click-clack ... click-clack") driving cabin bounce & strap pendulums!
    state.railPhase += dt * (2.05 + pace * 1.65);
    const jointRaw = Math.sin(state.railPhase);
    const jointKick = Math.pow(Math.max(0, Math.sin(state.railPhase * 0.5)), 10.0)
                    - Math.pow(Math.max(0, Math.sin(state.railPhase * 0.5 + 0.34)), 10.0);

    const activeMotion = Math.min(1.0, pace * 1.1) * shakeAmp;
    state.bobY = (jointRaw * 0.72 + jointKick * 1.55) * activeMotion * Math.min(1.15, H / 820);
    state.swayX = Math.sin(state.time * 1.35) * 0.55 * activeMotion;

    // Damped harmonic pendulum integration for all 12 receding perspective hand-straps
    for (let i = 0; i < straps.length; i++) {
      const s = straps[i];
      const swayForce = (Math.sin(state.time * 1.22 + s.phase) * 0.24 + jointKick * 1.75) * activeMotion;
      const accel = -s.freq * s.freq * s.angle - 1.42 * s.vel + swayForce;
      s.vel += accel * dt;
      s.angle += s.vel * dt;
      s.angle = Math.max(-0.26, Math.min(0.26, s.angle));
    }

    // Drift golden dust motes lazily through the sunlit left-to-right aisle shafts
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.phase += dt * 1.35;
      m.nx += (m.vx * (0.45 + 0.55 * pace) + Math.sin(m.phase) * 0.002) * dt;
      m.ny += (m.vy + Math.cos(m.phase * 0.8) * 0.0025) * dt;
      if (m.nx > 0.78) m.nx = 0.12;
      if (m.ny < 0.14) m.ny = 0.90;
      if (m.ny > 0.92) m.ny = 0.16;
    }

    // Position Chihiro + Towering No-Face faithfully in the right foreground (matching Image 2!)
    // Chihiro's yellow sneakers stand cleanly on the wooden aisle edge right beside the crimson bench,
    // leaving the sage-green "ゆ" bundle cleanly visible at the bottom-right corner!
    const nfH = H * 0.895;
    const nfW = nfH * noFaceAspect;
    const breathY = Math.sin(state.breathPhase) * 0.95;
    state.noFaceRect[0] = W * 0.798 - nfW * 0.5 + state.swayX * 0.35;
    state.noFaceRect[1] = H * 0.978 - nfH + state.bobY + breathY;
    state.noFaceRect[2] = nfW;
    state.noFaceRect[3] = nfH;
  }

  /**
   * Renders the iconic Spirited Away curved hand-strap ring shadows swaying gently along
   * the right border of the pale cream center aisle runner during Day & Sunset!
   */
  function drawFloorRingShadows(W, H, sc, sunset, night, showStraps) {
    const dayAmt = Math.max(0, 1 - sunset - night);
    const sunVis = dayAmt * 0.95 + sunset * 0.72;
    if (showStraps < 0.5 || sunVis < 0.05) return;

    ctx.save();
    // Clip softly to the pale cream center aisle runner trapezoid
    ctx.beginPath();
    ctx.moveTo(W * 0.440, H * 0.672 + state.bobY);
    ctx.lineTo(W * 0.560, H * 0.672 + state.bobY);
    ctx.lineTo(W * 0.674, H * 1.000 + state.bobY);
    ctx.lineTo(W * 0.326, H * 1.000 + state.bobY);
    ctx.closePath();
    ctx.clip();

    const shCol = sunset > 0.38
      ? `rgba(104, 62, 48, ${(0.24 * sunVis).toFixed(3)})`
      : `rgba(110, 96, 78, ${(0.26 * sunVis).toFixed(3)})`;
    ctx.strokeStyle = shCol;

    // Use the 6 left-side swinging strap angles to drive the 6 curved ring shadows on the right edge of the runner!
    for (let i = 0; i < 6; i++) {
      // straps[0..5] are side === -1 ordered far -> near (t = 0.79 down to 0.09)
      const s = straps[i];
      // Map depth along the floor runner: far (i=0) -> near foreground (i=5)
      const fT = 0.14 + (i / 5) * 0.78;
      const py = H * (0.688 + fT * 0.285) + state.bobY;
      // Right border of the white runner widens linearly with fT
      const rightEdgeX = W * (0.552 + fT * 0.105);
      const swayShift = s.angle * W * (0.012 + 0.018 * fT);
      const rx = W * (0.0085 + 0.0165 * fT);
      const ry = H * (0.0065 + 0.0135 * fT);

      ctx.lineWidth = Math.max(1.4, (2.2 + 3.2 * fT) * sc);
      ctx.beginPath();
      // C-shaped open curve hugging the right runner border (identical to Spirited Away Image 2!)
      ctx.ellipse(rightEdgeX - rx * 0.35 + swayShift, py, rx, ry, 0.06, Math.PI * 0.32, Math.PI * 1.68);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Renders BOTH receding perspective rows of vintage circular ivory hand-straps */
  function drawHandStraps(W, H, sc, sunset, night) {
    const leatherCol = night > 0.5 ? '#261e1c' : (sunset > 0.4 ? '#4d3328' : '#574337');
    const ringCol    = night > 0.5 ? '#c4b496' : (sunset > 0.4 ? '#f5e4c6' : '#f4efe2');
    const ringHi     = night > 0.5 ? '#ead8b2' : '#ffffff';
    const metalCol   = night > 0.5 ? '#525666' : '#8d8c89';

    for (let i = 0; i < straps.length; i++) {
      const s = straps[i];
      const ax = s.nx * W + state.swayX * (1.0 - s.t * 0.5);
      const ay = s.ny * H + state.bobY;
      const ps = sc * s.depthScale;
      const strapLen = H * 0.056 * s.depthScale;
      const ringR = H * 0.024 * s.depthScale;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(s.angle);

      // Steel collar clamp gripping the receding overhead bar
      ctx.fillStyle = metalCol;
      ctx.beginPath();
      ctx.roundRect(-3.6 * ps, -3.5 * ps, 7.2 * ps, 8.2 * ps, 2.2 * ps);
      ctx.fill();

      // Vintage leather strap hanging downward
      ctx.fillStyle = leatherCol;
      ctx.fillRect(-2.4 * ps, 4.0 * ps, 4.8 * ps, strapLen);

      // Subtle sunlit edge highlight on the strap side facing the left windows
      ctx.fillStyle = 'rgba(255, 242, 218, 0.22)';
      ctx.fillRect(-2.0 * ps, 4.5 * ps, 1.3 * ps, Math.max(2, strapLen - 2 * ps));

      // Perspective-foreshortened circular ivory ring (slightly narrower ellipse in 3/4 aisle perspective!)
      const ringCy = 4.0 * ps + strapLen + ringR * 0.86;
      const rx = ringR * 0.62;
      const ry = ringR * 1.04;
      const lw = Math.max(1.8, 4.4 * ps);

      // Soft depth rim shadow
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(28, 20, 16, 0.34)';
      ctx.beginPath();
      ctx.ellipse(1.1 * ps, ringCy + 1.1 * ps, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Crisp ivory-cream railway ring
      ctx.strokeStyle = ringCol;
      ctx.beginPath();
      ctx.ellipse(0, ringCy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Specular rim catchlight facing the left sunlit windows (or warm dome lamps at night)
      ctx.lineWidth = Math.max(0.8, 1.35 * ps);
      ctx.strokeStyle = ringHi;
      ctx.globalAlpha = night > 0.5 ? 0.36 : 0.62;
      ctx.beginPath();
      ctx.ellipse(0, ringCy, rx * 0.94, ry * 0.94, 0, -Math.PI * 0.85, -Math.PI * 0.22);
      ctx.stroke();

      ctx.restore();
    }
  }

  /** Renders slanted diagonal sunbeams pouring from the LEFT receding windows across the aisle + drifting motes */
  function drawAtmosphereMotes(W, H, sc, sunset, night, showDust) {
    if (showDust < 0.5) return;
    const dayAmt = Math.max(0, 1 - sunset - night);

    // 1. Slanted volumetric sunbeams pouring left-to-right from the receding left windows down onto the center aisle!
    if (dayAmt + sunset > 0.05) {
      const beamAlpha = dayAmt * 0.072 + sunset * 0.115;
      const beamCol = sunset > 0.35 ? '255, 208, 146' : '255, 250, 232';
      // 4 receding left window bays throwing slanted sun shafts onto the pale cream aisle runner
      const shafts = [
        { x0: 0.04, y0: 0.21, x1: 0.13, y1: 0.24, bx0: 0.33, bx1: 0.58, by: 0.98, aMul: 1.00 },
        { x0: 0.15, y0: 0.25, x1: 0.23, y1: 0.28, bx0: 0.37, bx1: 0.58, by: 0.88, aMul: 0.85 },
        { x0: 0.24, y0: 0.29, x1: 0.31, y1: 0.32, bx0: 0.41, bx1: 0.57, by: 0.78, aMul: 0.70 },
        { x0: 0.32, y0: 0.33, x1: 0.37, y1: 0.35, bx0: 0.44, bx1: 0.56, by: 0.70, aMul: 0.55 }
      ];
      ctx.save();
      for (const s of shafts) {
        const ax0 = s.x0 * W, ay0 = s.y0 * H + state.bobY;
        const ax1 = s.x1 * W, ay1 = s.y1 * H + state.bobY;
        const bx0 = s.bx0 * W, bx1 = s.bx1 * W, by = s.by * H + state.bobY;
        const g = ctx.createLinearGradient(ax0, ay0, bx1, by);
        const pk = beamAlpha * s.aMul;
        g.addColorStop(0.00, `rgba(${beamCol}, 0.0)`);
        g.addColorStop(0.24, `rgba(${beamCol}, ${pk.toFixed(3)})`);
        g.addColorStop(0.76, `rgba(${beamCol}, ${(pk * 0.42).toFixed(3)})`);
        g.addColorStop(1.00, `rgba(${beamCol}, 0.0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ax0, ay0);
        ctx.lineTo(ax1, ay1);
        ctx.lineTo(bx1, by);
        ctx.lineTo(bx0, by);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. Lazy drifting golden dust motes catching the window sunlight (or warm dome lamps at night)
    ctx.save();
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const pulse = 0.36 + 0.64 * (0.5 + 0.5 * Math.sin(m.phase * 1.25));
      const a = pulse * (night > 0.5 ? 0.32 : (sunset > 0.4 ? 0.52 : 0.40));
      const mx = m.nx * W;
      const my = m.ny * H + state.bobY * 0.6;
      const mr = m.r * sc;
      ctx.fillStyle = night > 0.5
        ? `rgba(255, 224, 152, ${a.toFixed(3)})`
        : (sunset > 0.4 ? `rgba(255, 224, 162, ${a.toFixed(3)})` : `rgba(255, 252, 236, ${a.toFixed(3)})`);
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderAndUpload({ W, H, showStraps, showDust, sunset, night }) {
    const sx = canvas.width / Math.max(1, W);
    const sy = canvas.height / Math.max(1, H);
    const sc = Math.max(0.55, Math.min(1.22, Math.min(W, H) / 860));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    // Draw curved hand-strap ring shadows along the right border of the center aisle runner first
    drawFloorRingShadows(W, H, sc, sunset, night, showStraps);
    // Volumetric sunbeams & golden dust motes
    drawAtmosphereMotes(W, H, sc, sunset, night, showDust);
    // Both receding rows of swinging vintage ivory hand-straps on top!
    if (showStraps >= 0.5) {
      drawHandStraps(W, H, sc, sunset, night);
    }

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, liveTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  return {
    cabinTexture: cabinTex,
    noFaceTexture: noFaceTex,
    liveTexture: liveTex,
    cloudsTexture: cloudsTex,
    get cabinReady() { return cabinReady; },
    get noFaceReady() { return noFaceReady; },
    get cloudsReady() { return sharedExt ? sharedExt.cloudsReady : localCloudsReady; },
    get worldScroll() { return state.worldScroll; },
    get bobY() { return state.bobY; },
    get swayX() { return state.swayX; },
    get noFaceRect() { return state.noFaceRect; },
    resize,
    step,
    renderAndUpload
  };
}
