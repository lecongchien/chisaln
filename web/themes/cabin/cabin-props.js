import { getSpriteMaxWidth } from '../../core/field-engine.js';

/**
 * Sea Train Central-Aisle Cabin Living Engine ("Trong toa tàu biển" — Living Story & Interactive Engine)
 * Loads hand-painted central-aisle interior (`cabin-frame.webp`) & Chihiro + Towering No-Face (`cabin-noface.webp`),
 * sharing exterior seamless Ghibli clouds (`uCloudsTex`) from Sea Railway, and simulates:
 *   1. Critically-damped steel carriage suspension (`bobY`, `swayX`) + smooth 3D mouse parallax (`parallaxX/Y`).
 *   2. Cinematic Story Beats:
 *      - Periodic Passing Counter-Train rushing past the left windows (`passProgress`, `passFlash`),
 *        driving an aerodynamic lateral wind-gust wave across all 12 hanging hand-straps!
 *      - Nostalgic vintage tram power-switch lamp dip (`lampDip`) every ~28s.
 *   3. Hand-inked Studio Ghibli straps (12 receding rings with 2.5D travelling-wave pendulum physics & real lamp falloff).
 *   4. Interactive Studio Ghibli Easter Eggs:
 *      - 3 shy blinking Susuwatari (Soot Sprites / Bồ Hóng) peeking from luggage racks & under the left bench
 *        carrying pastel konpeito star candies (ducking shyly when the mouse approaches or counter-train passes!).
 *      - Ethereal rising gold-dust sparkles around No-Face (periodic or triggered gently on mouse hover!).
 *      - Selective radial-bokeh dust motes strictly lit inside real light cones.
 */

function loadGpuTexture(gl, src, wrapS, onLoaded) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );

  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    onLoaded?.(img);
  };
  img.onerror = () => {
    if (img.src.endsWith(".webp")) img.src = src.replace(/\.webp$/, ".png");
  };
  img.src = src;
  return tex;
}

// Pixel-calibrated centerline of the painted overhead steel handrail pipes in cabin-frame.webp (1440x810)
const LEFT_RAIL = { x0: 0.285, y0: 0.0, x1: 0.427, y1: 0.332 };
const RIGHT_RAIL = { x0: 0.715, y0: 0.0, x1: 0.573, y1: 0.332 };
const STRAP_DEPTHS = [0.1, 0.24, 0.38, 0.52, 0.66, 0.8];
const LAMP_POSITIONS = [
  { x: 0.5, y: 0.012, w: 1.0 },
  { x: 0.5, y: 0.114, w: 0.92 },
  { x: 0.5, y: 0.189, w: 0.8 },
  { x: 0.5, y: 0.242, w: 0.68 },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function mixRgb(day, sun, ngt, sunset, night) {
  const dayW = Math.max(0, 1 - sunset - night);
  const sum = Math.max(0.001, dayW + sunset + night);
  return [
    (day[0] * dayW + sun[0] * sunset + ngt[0] * night) / sum,
    (day[1] * dayW + sun[1] * sunset + ngt[1] * night) / sum,
    (day[2] * dayW + sun[2] * sunset + ngt[2] * night) / sum,
  ];
}

function rgbStr(c, mul = 1, alpha = 1) {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * mul)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * mul)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * mul)));
  return alpha >= 0.999
    ? `rgb(${r},${g},${b})`
    : `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

export function createCabinLivingEngine(gl, onReady, sharedExt = null) {
  let cabinReady = 0.0;
  let noFaceReady = 0.0;
  let localCloudsReady = 0.0;
  let noFaceAspect = 331 / 680;

  const cabinTex = loadGpuTexture(
    gl,
    "assets/cabin-frame.webp",
    gl.CLAMP_TO_EDGE,
    () => {
      cabinReady = 1.0;
      onReady?.();
    },
  );
  const noFaceTex = loadGpuTexture(
    gl,
    "assets/cabin-noface.webp",
    gl.CLAMP_TO_EDGE,
    (img) => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0)
        noFaceAspect = img.naturalWidth / img.naturalHeight;
      noFaceReady = 1.0;
      onReady?.();
    },
  );

  const cloudsTex =
    sharedExt?.cloudsTexture ||
    loadGpuTexture(gl, "assets/seatrain-clouds.webp", gl.REPEAT, () => {
      localCloudsReady = 1.0;
      onReady?.();
    });

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");

  const liveTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, liveTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    canvas.width,
    canvas.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );

  // Build 12 receding perspective hanging hand-straps (6 left rail + 6 right rail), drawn far -> near
  const straps = [];
  for (let side = -1; side <= 1; side += 2) {
    const rail = side < 0 ? LEFT_RAIL : RIGHT_RAIL;
    for (let i = STRAP_DEPTHS.length - 1; i >= 0; i--) {
      const t = STRAP_DEPTHS[i];
      const nx = rail.x0 + (rail.x1 - rail.x0) * t;
      const ny = rail.y0 + (rail.y1 - rail.y0) * t;

      let lampHit = 0;
      for (const lp of LAMP_POSITIONS) {
        const dx = (nx - lp.x) * 1.55;
        const dy = ny + 0.075 * (1 - 0.55 * t) - lp.y;
        lampHit += Math.exp(-(dx * dx + dy * dy) / 0.055) * lp.w;
      }
      lampHit = clamp(lampHit * 0.72, 0.18, 1.0);

      straps.push({
        side,
        idx: i,
        t,
        nx,
        ny,
        lampHit,
        depthScale: 1.0 - 0.56 * t,
        angle: (i % 2 === 0 ? 1 : -1) * 0.045,
        vel: 0,
        pitch: 0,
        pitchVel: 0,
        freq: 3.65 + (i % 3) * 0.24 + (side > 0 ? 0.11 : 0),
        pitchFreq: 4.1 + (i % 2) * 0.28,
        waveDelay: (1.0 - t) * 0.55 + (side > 0 ? 0.14 : 0),
      });
    }
  }

  // 30 delicate atmospheric dust motes (strictly lit inside sunlit beams or warm lamp cones)
  const motes = [];
  for (let i = 0; i < 30; i++) {
    motes.push({
      nx: 0.14 + Math.random() * 0.68,
      ny: 0.1 + Math.random() * 0.72,
      vx: 0.004 + Math.random() * 0.0075,
      vy: 0.0008 + (Math.random() - 0.48) * 0.0055,
      r: 1.35 + Math.random() * 2.15,
      phase: Math.random() * Math.PI * 2,
      speed: 0.85 + Math.random() * 0.75,
    });
  }

  // 3 charming hand-inked Susuwatari (Soot Sprites / Bồ Hóng) tucked naturally into luggage racks & under left bench!
  const sprites = [
    {
      // Left luggage rack peeking up beside the vintage suitcase
      homeX: 0.252,
      homeY: 0.168,
      popDx: 0.004,
      popDy: -0.022,
      rNorm: 0.0142,
      candy: [246, 178, 198], // pastel sakura konpeito star
      lampHit: 0.58,
      mode: "hidden",
      timer: 2.2,
      peek: 0,
      blinkT: 1.8,
      blinkDur: 0,
      shyT: 0,
      seed: 1.3,
    },
    {
      // Under left foreground red velvet bench scurrying slightly onto the wooden floor with a lemon star candy!
      homeX: 0.172,
      homeY: 0.876,
      popDx: 0.036,
      popDy: -0.004,
      rNorm: 0.0175,
      candy: [248, 224, 146], // pastel lemon konpeito star
      lampHit: 0.34,
      mode: "hidden",
      timer: 8.5,
      peek: 0,
      blinkT: 2.4,
      blinkDur: 0,
      shyT: 0,
      seed: 4.7,
    },
    {
      // Right luggage rack peeking down curiously toward Chihiro & No-Face
      homeX: 0.736,
      homeY: 0.158,
      popDx: -0.005,
      popDy: -0.018,
      rNorm: 0.0135,
      candy: [168, 224, 202], // pastel mint konpeito star
      lampHit: 0.56,
      mode: "hidden",
      timer: 14.5,
      peek: 0,
      blinkT: 3.1,
      blinkDur: 0,
      shyT: 0,
      seed: 8.1,
    },
  ];

  // No-Face ethereal gold-dust shimmer particles (periodic or gently triggered when mouse approaches No-Face!)
  const goldDust = [];
  for (let i = 0; i < 20; i++) {
    goldDust.push({
      active: false,
      x: 0.82,
      y: 0.55,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      r: 1.5,
      phase: Math.random() * Math.PI * 2,
    });
  }

  const state = {
    worldScroll: 0.25,
    time: 0,
    bobY: 0,
    bobVel: 0,
    swayX: 0,
    railPhase: 0,
    polePulse: 1.0,
    // Smooth 3D mouse parallax
    mouseX: 0.5,
    mouseY: 0.5,
    parallaxX: 0.0,
    parallaxY: 0.0,
    // Passing Counter-Train cinematic story beat (first pass at 5.5s so viewer sees it immediately!)
    passCooldown: 5.5,
    passActive: false,
    passProgress: 0.0,
    passFlash: 0.0,
    // Vintage tram power-switch subtle lamp flicker
    dipCooldown: 17.0,
    dipElapsed: -1.0,
    lampDip: 1.0,
    // No-Face gold dust burst scheduler
    goldCooldown: 3.8,
    goldHoverCooldown: 0.0,
    noFaceRect: new Float32Array(4),
  };

  function spawnGoldBurst(count = 10, centerX = 0.83, centerY = 0.56) {
    let spawned = 0;
    for (let i = 0; i < goldDust.length && spawned < count; i++) {
      const g = goldDust[i];
      if (g.active) continue;
      g.active = true;
      g.x = centerX + (Math.random() - 0.5) * 0.11;
      g.y = centerY + (Math.random() - 0.35) * 0.32;
      g.vx = (Math.random() - 0.5) * 0.008;
      g.vy = -(0.016 + Math.random() * 0.024);
      g.life = 0;
      g.maxLife = 2.4 + Math.random() * 2.2;
      g.r = 1.4 + Math.random() * 2.1;
      g.phase = Math.random() * Math.PI * 2;
      spawned++;
    }
  }

  function setMouse(nx, ny) {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    state.mouseX = clamp(nx, 0, 1);
    state.mouseY = clamp(ny, 0, 1);

    // Gently trigger No-Face's golden dust shimmer when cursor wanders near No-Face!
    if (
      state.goldHoverCooldown <= 0 &&
      nx > 0.72 &&
      nx < 0.96 &&
      ny > 0.14 &&
      ny < 0.86
    ) {
      spawnGoldBurst(10, nx * 0.35 + 0.83 * 0.65, ny * 0.35 + 0.52 * 0.65);
      state.goldHoverCooldown = 5.5;
    }
  }

  function resize(W, H) {
    const maxW = getSpriteMaxWidth(1920);
    const dpr = Math.min(1.5, Math.max(1.0, window.devicePixelRatio || 1));
    const targetW = Math.min(maxW, Math.round(W * dpr));
    const scale = Math.min(1.5, targetW / Math.max(1, W));
    const nw = Math.max(320, Math.round(W * scale));
    const nh = Math.max(180, Math.round(H * scale));
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw;
      canvas.height = nh;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      gl.bindTexture(gl.TEXTURE_2D, liveTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        nw,
        nh,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
    }
  }

  function step(dt, { W, H, flow, shake }) {
    const pace = Math.max(0.0, flow);
    const shakeAmp = clamp(shake ?? 0.65, 0.0, 1.0);
    const activeMotion = Math.min(1.0, pace * 1.15) * shakeAmp;

    state.time += dt;
    state.worldScroll += dt * 0.38 * pace;
    if (state.goldHoverCooldown > 0)
      state.goldHoverCooldown = Math.max(0, state.goldHoverCooldown - dt);

    // Smooth critically-damped 3D Parallax spring toward cursor
    const tgtPx = (state.mouseX - 0.5) * 2.0;
    const tgtPy = (state.mouseY - 0.5) * 2.0;
    const pLerp = 1.0 - Math.exp(-dt * 4.4);
    state.parallaxX += (tgtPx - state.parallaxX) * pLerp;
    state.parallaxY += (tgtPy - state.parallaxY) * pLerp;

    // 1. Passing Counter-Train Story Beat (~every 20-26s, first pass at 5.5s!)
    let passGust = 0.0;
    if (state.passActive) {
      const passDur = 2.15 / Math.max(0.55, Math.min(1.65, pace || 0.7));
      state.passProgress += dt / passDur;
      if (state.passProgress >= 1.0) {
        state.passActive = false;
        state.passProgress = 0.0;
        state.passFlash = 0.0;
        state.passCooldown = 19.5 + Math.random() * 6.5;
      } else {
        const pr = state.passProgress;
        const env = Math.sin(pr * Math.PI);
        // Bow headlight surge followed by 5 rhythmic glowing carriage window flashes!
        const headFlash = Math.exp(-Math.pow((pr - 0.1) / 0.055, 2)) * 0.85;
        const winStrobe =
          Math.pow(Math.max(0, Math.sin(pr * Math.PI * 10.0)), 2) * env;
        state.passFlash = clamp(headFlash + winStrobe * 0.92, 0.0, 1.0);
        passGust =
          Math.sin(pr * Math.PI) * (0.45 + 0.55 * Math.cos(pr * Math.PI * 6.0));
      }
    } else {
      state.passFlash *= Math.exp(-dt * 12.0);
      if (pace > 0.12) {
        state.passCooldown -= dt;
        if (state.passCooldown <= 0) {
          state.passActive = true;
          state.passProgress = 0.002;
        }
      }
    }

    // 2. Vintage railway power-switch lamp dip (~0.24s subtle nostalgic double-flicker every ~26-34s)
    if (state.dipElapsed >= 0) {
      state.dipElapsed += dt;
      if (state.dipElapsed > 0.28) {
        state.dipElapsed = -1.0;
        state.lampDip = 1.0;
        state.dipCooldown = 25.0 + Math.random() * 10.0;
      } else {
        const d1 =
          Math.exp(-Math.pow((state.dipElapsed - 0.06) / 0.025, 2)) * 0.34;
        const d2 =
          Math.exp(-Math.pow((state.dipElapsed - 0.17) / 0.03, 2)) * 0.22;
        state.lampDip = 1.0 - d1 - d2;
      }
    } else {
      state.lampDip = 1.0;
      state.dipCooldown -= dt;
      if (state.dipCooldown <= 0) state.dipElapsed = 0.0;
    }

    // 3. Silky critically-damped steel carriage bogie suspension + gentle aerodynamic passing-train tremor
    state.railPhase += dt * (2.35 + pace * 1.55);
    const gentleRoll =
      Math.sin(state.time * 1.45) * 0.55 +
      Math.sin(state.time * 0.72 + 1.1) * 0.35;
    const jointRipple =
      Math.sin(state.railPhase) * 0.42 +
      Math.sin(state.railPhase * 2.0 - 0.45) * 0.22;
    const passTremor = passGust * Math.sin(state.time * 24.0) * 0.36;
    const targetBob =
      (gentleRoll * 0.52 + jointRipple * 0.48 + passTremor) *
      activeMotion *
      Math.min(1.15, H / 820);

    const bobAccel = (targetBob - state.bobY) * 28.0 - state.bobVel * 9.2;
    state.bobVel += bobAccel * dt;
    state.bobY += state.bobVel * dt;

    state.swayX =
      (Math.sin(state.time * 0.92) * 0.72 +
        Math.sin(state.time * 1.88 + 0.7) * 0.28 +
        passGust * 0.55) *
      0.95 *
      activeMotion;

    // Exterior pole sunlight pulse
    const polePhase = ((state.worldScroll * 2.15) % 2.65) / 2.65;
    const poleDist = Math.abs(polePhase - 0.5) * 2.0;
    state.polePulse =
      1.0 -
      Math.exp(-Math.pow(poleDist / 0.14, 2)) * 0.24 * Math.min(1.0, pace);

    // 4. 2.5D Damped Harmonic Pendulum Physics for 12 straps (+ aerodynamic passing-train gust wave!)
    for (let i = 0; i < straps.length; i++) {
      const s = straps[i];
      const localPhase = state.railPhase - s.waveDelay * 2.8;
      const gustForce =
        passGust * (1.55 - s.t * 0.65) * (s.side < 0 ? 1.25 : 0.85);
      const latDrive =
        (Math.sin(state.time * 1.18 - s.waveDelay) * 0.65 +
          Math.sin(localPhase * 0.5) * 0.42 +
          Math.sin(state.time * 2.65 + s.idx * 0.9) * 0.28 +
          gustForce) *
        1.35 *
        Math.max(0.28, activeMotion);

      const latAccel = -s.freq * s.freq * s.angle - 1.18 * s.vel + latDrive;
      s.vel += latAccel * dt;
      s.angle = clamp(s.angle + s.vel * dt, -0.32, 0.32);

      const pitchDrive =
        (Math.cos(localPhase * 0.5) * 0.48 +
          Math.sin(state.time * 1.55 - s.waveDelay * 1.4) * 0.35 +
          passGust * 0.65) *
        1.15 *
        Math.max(0.25, activeMotion);
      const pitchAccel =
        -s.pitchFreq * s.pitchFreq * s.pitch - 1.35 * s.pitchVel + pitchDrive;
      s.pitchVel += pitchAccel * dt;
      s.pitch = clamp(s.pitch + s.pitchVel * dt, -0.24, 0.24);
    }

    // 5. Update 3 shy Susuwatari (Soot Sprites)
    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i];
      const curX = sp.homeX + sp.popDx * sp.peek;
      const curY = sp.homeY + sp.popDy * sp.peek;
      const mouseDist = Math.hypot(state.mouseX - curX, state.mouseY - curY);

      // Startle & shyly duck away if cursor gets too close OR passing train rushes loudly by!
      if (
        (mouseDist < 0.085 && sp.peek > 0.3) ||
        (state.passActive &&
          state.passProgress > 0.12 &&
          state.passProgress < 0.55 &&
          i !== 1)
      ) {
        if (sp.mode === "peeking" || sp.mode === "rising") {
          sp.mode = "hiding";
          sp.shyT = 0.45;
        }
      }
      if (sp.shyT > 0) sp.shyT = Math.max(0, sp.shyT - dt);

      if (sp.mode === "hidden") {
        sp.peek = 0;
        sp.timer -= dt;
        if (sp.timer <= 0) {
          sp.mode = "rising";
          sp.timer = 4.8 + Math.random() * 4.5;
        }
      } else if (sp.mode === "rising") {
        sp.peek = Math.min(1, sp.peek + dt * 1.9);
        if (sp.peek >= 1) sp.mode = "peeking";
      } else if (sp.mode === "peeking") {
        sp.timer -= dt;
        if (sp.timer <= 0) sp.mode = "hiding";
      } else if (sp.mode === "hiding") {
        sp.peek = Math.max(0, sp.peek - dt * (sp.shyT > 0 ? 4.2 : 2.1));
        if (sp.peek <= 0) {
          sp.mode = "hidden";
          sp.timer = 7.5 + Math.random() * 9.0;
        }
      }

      // Natural blinking
      if (sp.blinkDur > 0) {
        sp.blinkDur = Math.max(0, sp.blinkDur - dt);
      } else {
        sp.blinkT -= dt;
        if (sp.blinkT <= 0) {
          sp.blinkDur = 0.14;
          sp.blinkT = 2.0 + Math.random() * 2.8;
        }
      }
    }

    // 6. Update No-Face Ethereal Gold Dust Shimmer
    state.goldCooldown -= dt;
    if (state.goldCooldown <= 0) {
      spawnGoldBurst(11, 0.83, 0.58);
      state.goldCooldown = 14.0 + Math.random() * 8.0;
    }
    for (let i = 0; i < goldDust.length; i++) {
      const g = goldDust[i];
      if (!g.active) continue;
      g.life += dt;
      if (g.life >= g.maxLife) {
        g.active = false;
        continue;
      }
      g.phase += dt * 3.1;
      g.x += (g.vx + Math.sin(g.phase) * 0.0055) * dt;
      g.y += g.vy * dt;
    }

    // 7. Drift atmospheric dust motes
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.phase += dt * m.speed;
      m.nx += (m.vx * (0.42 + 0.58 * pace) + Math.sin(m.phase) * 0.0024) * dt;
      m.ny += (m.vy + Math.cos(m.phase * 0.85) * 0.0028) * dt;
      if (m.nx > 0.84) m.nx = 0.12;
      if (m.ny < 0.08) m.ny = 0.8;
      if (m.ny > 0.82) m.ny = 0.1;
    }

    // Anchor Chihiro + Towering No-Face cleanly ABOVE the Windows 11 Taskbar (~4.4% bottom height)
    // so her entire yellow sneakers & grounded floor shadow are clearly visible on the wooden floor!
    const nfH = H * 0.832;
    const nfW = nfH * noFaceAspect;
    state.noFaceRect[0] = W * 0.798 - nfW * 0.5;
    state.noFaceRect[1] = H * 0.934 - nfH;
    state.noFaceRect[2] = nfW;
    state.noFaceRect[3] = nfH;
  }

  function drawFloorRingShadows(W, H, sc, sunset, night, showStraps) {
    const dayAmt = Math.max(0, 1 - sunset - night);
    const sunVis = (dayAmt * 0.92 + sunset * 0.72) * state.polePulse;
    if (showStraps < 0.5 || sunVis < 0.05) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W * 0.44, H * 0.672);
    ctx.lineTo(W * 0.56, H * 0.672);
    ctx.lineTo(W * 0.674, H * 1.0);
    ctx.lineTo(W * 0.326, H * 1.0);
    ctx.closePath();
    ctx.clip();

    const shCol =
      sunset > 0.38
        ? `rgba(92, 54, 40, ${(0.14 * sunVis).toFixed(3)})`
        : `rgba(104, 92, 76, ${(0.135 * sunVis).toFixed(3)})`;
    ctx.strokeStyle = shCol;
    ctx.shadowColor = shCol;
    ctx.shadowBlur = 3.2 * sc;

    for (let i = 0; i < 6; i++) {
      const s = straps[i];
      const fT = 0.14 + (i / 5) * 0.76;
      const py = H * (0.69 + fT * 0.275) + s.pitch * H * (0.008 + 0.014 * fT);
      const rightEdgeX = W * (0.548 + fT * 0.102);
      const swayShift = s.angle * W * (0.018 + 0.028 * fT);
      const rx = W * (0.008 + 0.0155 * fT);
      const ry = H * (0.006 + 0.012 * fT);

      ctx.lineWidth = Math.max(1.2, (1.8 + 2.6 * fT) * sc);
      ctx.beginPath();
      ctx.ellipse(
        rightEdgeX - rx * 0.35 + swayShift,
        py,
        rx,
        ry,
        0.08 + s.angle * 0.4,
        Math.PI * 0.36,
        Math.PI * 1.62,
      );
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /** Draws 3 shy hand-inked Susuwatari (Bồ Hóng) peeking from luggage racks & under left bench! */
  function drawSootSprites(W, H, sc, sunset, night) {
    const dayAmt = Math.max(0, 1 - sunset - night);
    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i];
      if (sp.peek <= 0.02) continue;

      const ease = 1 - Math.pow(1 - sp.peek, 3);
      const cx = (sp.homeX + sp.popDx * ease) * W;
      const cy =
        (sp.homeY + sp.popDy * ease) * H +
        Math.sin(state.time * 4.5 + sp.seed) * 1.2 * sc;
      const r = H * sp.rNorm;

      const lightMul =
        (dayAmt * 0.96 + sunset * 0.88 + night * (0.34 + 0.56 * sp.lampHit)) *
        state.lampDip;
      const passBoost = state.passFlash * (i < 2 ? 0.24 : 0.1);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = clamp(ease * 1.15, 0, 1);

      // Soft ambient contact shadow grounding the soot sprite against luggage/floor
      ctx.fillStyle = "rgba(10, 7, 10, 0.40)";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.86, r * 1.05, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // Fuzzy organic multi-tuft charcoal soot body (never a sterile flat circle!)
      const bodyC = mixRgb(
        [32, 28, 30],
        [34, 24, 24],
        [14, 13, 18],
        sunset,
        night,
      );
      ctx.fillStyle = rgbStr(bodyC, 1 + passBoost * 0.4);
      ctx.beginPath();
      const spikes = 13;
      for (let k = 0; k < spikes * 2; k++) {
        const ang = (k / (spikes * 2)) * Math.PI * 2;
        const wiggle = Math.sin(state.time * 8.5 + k * 1.7 + sp.seed) * 0.06;
        const rad = (k % 2 === 0 ? 1.16 : 0.86) * r * (1.0 + wiggle);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Subtle warm rim glow along top/aisle edge of fuzzy soot body catching overhead lamp light
      ctx.strokeStyle = rgbStr(
        [185, 136, 86],
        clamp(lightMul + passBoost, 0.2, 1.0),
        night > 0.4 ? 0.28 : 0.16,
      );
      ctx.lineWidth = Math.max(0.8, 1.2 * sc);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.86, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();

      // Big expressive warm-ivory eyes (look softly toward cursor or center aisle, blink smoothly!)
      const eyeOpen = sp.blinkDur > 0 ? 0.14 : sp.shyT > 0 ? 1.18 : 1.0;
      const lookDx = clamp((state.mouseX - sp.homeX) * 2.5, -1, 1) * r * 0.11;
      const lookDy = clamp((state.mouseY - sp.homeY) * 2.5, -1, 1) * r * 0.08;
      const eyeC = mixRgb(
        [244, 240, 228],
        [244, 218, 184],
        [218, 198, 168],
        sunset,
        night,
      );
      const eyeRx = r * 0.25;
      const eyeRy = r * 0.3 * eyeOpen;

      for (let side = -1; side <= 1; side += 2) {
        const ex = side * r * 0.3;
        const ey = -r * 0.08;
        ctx.fillStyle = rgbStr(
          eyeC,
          clamp(lightMul * 0.92 + 0.16 + passBoost * 0.35, 0.42, 1.05),
        );
        ctx.strokeStyle = "rgba(20, 12, 10, 0.65)";
        ctx.lineWidth = Math.max(0.55, 0.75 * sc);
        ctx.beginPath();
        ctx.ellipse(ex, ey, eyeRx, Math.max(0.8, eyeRy), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (eyeOpen > 0.35) {
          ctx.fillStyle = "#141010";
          ctx.beginPath();
          ctx.arc(
            ex + lookDx,
            ey + lookDy,
            Math.max(0.9, r * 0.115),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }

      // Tiny pastel Konpeito star candy held beside the sprite (classic Spirited Away delight!)
      const cR = r * 0.38;
      const cX = (i === 2 ? -1 : 1) * r * 0.72;
      const cY = r * 0.42;
      ctx.fillStyle = rgbStr(
        sp.candy,
        clamp(lightMul * 0.88 + 0.14 + passBoost * 0.35, 0.36, 1.02),
      );
      ctx.strokeStyle = "rgba(30, 18, 14, 0.55)";
      ctx.lineWidth = Math.max(0.55, 0.75 * sc);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI * 0.5 + sp.seed;
        const cr = (k % 2 === 0 ? 1.0 : 0.56) * cR;
        const kx = cX + Math.cos(a) * cr;
        const ky = cY + Math.sin(a) * cr;
        if (k === 0) ctx.moveTo(kx, ky);
        else ctx.lineTo(kx, ky);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  /** Draws subtle rising golden dust sparkles around No-Face's misty cloak (Spirited Away gold shimmer!) */
  function drawNoFaceGoldDust(W, H, sc, sunset, night, showNoFace) {
    if (showNoFace < 0.5) return;
    const visScale = night > 0.3 ? 1.0 : sunset > 0.3 ? 0.78 : 0.48;
    ctx.save();
    for (let i = 0; i < goldDust.length; i++) {
      const g = goldDust[i];
      if (!g.active) continue;
      const t = g.life / g.maxLife;
      const env = Math.sin(t * Math.PI);
      const twinkle = 0.55 + 0.45 * Math.sin(g.phase * 2.4);
      const alpha = env * twinkle * 0.72 * visScale;
      if (alpha < 0.03) continue;

      const x = g.x * W;
      const y = g.y * H;
      const r = g.r * sc * (0.85 + 0.3 * twinkle);

      // Soft warm gold bokeh halo
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      grad.addColorStop(0.0, `rgba(255, 236, 162, ${alpha.toFixed(3)})`);
      grad.addColorStop(
        0.42,
        `rgba(248, 192, 74, ${(alpha * 0.55).toFixed(3)})`,
      );
      grad.addColorStop(1.0, "rgba(248, 172, 42, 0.0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Tiny crisp golden grain core
      ctx.fillStyle = `rgba(255, 248, 212, ${(alpha * 0.92).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.65, r * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Renders BOTH receding perspective rows of vintage hand-straps in hand-inked Studio Ghibli style */
  function drawHandStraps(W, H, sc, sunset, night) {
    const dayAmt = Math.max(0, 1 - sunset - night);
    const inkBase = mixRgb(
      [44, 30, 22],
      [38, 22, 16],
      [18, 12, 11],
      sunset,
      night,
    );
    const leatherLitBase = mixRgb(
      [102, 74, 56],
      [108, 66, 44],
      [64, 42, 26],
      sunset,
      night,
    );
    const leatherDarkBase = mixRgb(
      [56, 40, 32],
      [52, 30, 24],
      [22, 16, 17],
      sunset,
      night,
    );
    const ringLitBase = mixRgb(
      [238, 232, 214],
      [244, 208, 162],
      [192, 146, 94],
      sunset,
      night,
    );
    const ringShadeBase = mixRgb(
      [146, 144, 138],
      [136, 96, 82],
      [44, 42, 54],
      sunset,
      night,
    );
    const metalLitBase = mixRgb(
      [152, 152, 148],
      [156, 126, 102],
      [96, 74, 52],
      sunset,
      night,
    );
    const metalDarkBase = mixRgb(
      [78, 78, 82],
      [72, 52, 46],
      [32, 28, 34],
      sunset,
      night,
    );

    for (let i = 0; i < straps.length; i++) {
      const s = straps[i];
      const ax = s.nx * W;
      const ay = s.ny * H;
      const ps = sc * s.depthScale;
      const pitchScale = 1.0 + s.pitch * 0.22;
      const strapLen = H * 0.056 * s.depthScale * pitchScale;
      const ringR = H * 0.024 * s.depthScale;

      const lampExposure = lerp(0.36, 1.05, s.lampHit) * state.lampDip;
      const dayExposure =
        s.side < 0 ? lerp(0.96, 0.88, s.t) : lerp(0.84, 0.9, s.t);
      const passLift =
        state.passFlash * (s.side < 0 ? 0.34 : 0.14) * (0.35 + 0.65 * night);
      const expMul =
        dayExposure * dayAmt +
        lerp(0.76, 1.04, s.lampHit) * sunset +
        lampExposure * night +
        passLift;

      const farFade = lerp(1.0, 0.84, s.t);
      const inkW = Math.max(0.95, 1.55 * ps);
      const aisleDir = -s.side;
      const lightDirX = dayAmt > 0.55 || state.passFlash > 0.35 ? -1 : aisleDir;

      ctx.save();
      ctx.globalAlpha = farFade;
      ctx.translate(ax, ay);
      ctx.rotate(s.angle);

      const clampW = 7.4 * ps;
      const clampH = 8.4 * ps;
      const strapTop = 3.8 * ps;
      const strapWTop = 4.9 * ps;
      const strapWBot = 4.1 * ps;
      const ringCy = strapTop + strapLen + ringR * 0.86;
      const rx = ringR * (0.62 + Math.abs(s.pitch) * 0.16);
      const ry = ringR * (1.04 - Math.abs(s.pitch) * 0.08);
      const lw = Math.max(1.8, 4.1 * ps);

      const clampGrad = ctx.createLinearGradient(
        -clampW * 0.5 * lightDirX,
        0,
        clampW * 0.5 * lightDirX,
        0,
      );
      clampGrad.addColorStop(0, rgbStr(metalDarkBase, expMul));
      clampGrad.addColorStop(1, rgbStr(metalLitBase, expMul));
      ctx.fillStyle = clampGrad;
      ctx.strokeStyle = rgbStr(inkBase, 1, 0.82);
      ctx.lineWidth = inkW;
      ctx.beginPath();
      ctx.roundRect(-clampW * 0.5, -3.6 * ps, clampW, clampH, 2.0 * ps);
      ctx.fill();
      ctx.stroke();

      const lGrad = ctx.createLinearGradient(
        -strapWTop * 0.5 * lightDirX,
        0,
        strapWTop * 0.5 * lightDirX,
        0,
      );
      lGrad.addColorStop(0, rgbStr(leatherDarkBase, expMul));
      lGrad.addColorStop(0.65, rgbStr(leatherLitBase, expMul));
      lGrad.addColorStop(1, rgbStr(leatherLitBase, expMul * 1.12));

      ctx.fillStyle = lGrad;
      ctx.strokeStyle = rgbStr(inkBase, 1, 0.78);
      ctx.lineWidth = Math.max(0.8, 1.15 * ps);
      ctx.beginPath();
      ctx.moveTo(-strapWTop * 0.5, strapTop);
      ctx.lineTo(strapWTop * 0.5, strapTop);
      ctx.lineTo(strapWBot * 0.5, strapTop + strapLen + 2.0 * ps);
      ctx.lineTo(-strapWBot * 0.5, strapTop + strapLen + 2.0 * ps);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(18, 10, 8, 0.34)";
      ctx.fillRect(
        -strapWTop * 0.45,
        strapTop,
        strapWTop * 0.9,
        Math.min(strapLen * 0.35, 3.8 * ps),
      );

      ctx.lineWidth = lw + inkW * 1.75;
      ctx.strokeStyle = rgbStr(inkBase, 1, 0.84);
      ctx.beginPath();
      ctx.ellipse(0, ringCy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      const rGrad = ctx.createLinearGradient(
        -rx * 1.1 * lightDirX,
        ringCy + ry * 0.55,
        rx * 1.1 * lightDirX,
        ringCy - ry * 0.65,
      );
      rGrad.addColorStop(0.0, rgbStr(ringShadeBase, expMul * 0.92));
      rGrad.addColorStop(0.48, rgbStr(ringLitBase, expMul * 0.74));
      rGrad.addColorStop(1.0, rgbStr(ringLitBase, expMul * 1.04));

      ctx.lineWidth = lw;
      ctx.strokeStyle = rGrad;
      ctx.beginPath();
      ctx.ellipse(0, ringCy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      const hiAlpha =
        (dayAmt * 0.34 + sunset * 0.36 + night * (0.14 + 0.28 * s.lampHit)) *
        state.lampDip;
      const hiCol =
        night > 0.45
          ? [255, 224, 164]
          : sunset > 0.35
            ? [255, 232, 188]
            : [255, 252, 240];
      ctx.lineWidth = Math.max(0.75, 1.15 * ps);
      ctx.strokeStyle = rgbStr(hiCol, 1, hiAlpha);
      const startAng = lightDirX > 0 ? -Math.PI * 0.42 : -Math.PI * 0.88;
      const endAng = lightDirX > 0 ? Math.PI * 0.16 : -Math.PI * 0.32;
      ctx.beginPath();
      ctx.ellipse(0, ringCy, rx * 0.9, ry * 0.9, 0, startAng, endAng);
      ctx.stroke();

      const collarW = strapWBot * 1.32;
      const collarH = Math.max(2.6, 5.2 * ps);
      ctx.fillStyle = rgbStr(leatherDarkBase, expMul * 1.08);
      ctx.strokeStyle = rgbStr(inkBase, 1, 0.82);
      ctx.lineWidth = Math.max(0.7, 1.0 * ps);
      ctx.beginPath();
      ctx.roundRect(
        -collarW * 0.5,
        ringCy - ry - collarH * 0.42,
        collarW,
        collarH,
        1.3 * ps,
      );
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawAtmosphereMotes(W, H, sc, sunset, night, showDust) {
    if (showDust < 0.5) return;
    const dayAmt = Math.max(0, 1 - sunset - night);

    if (dayAmt + sunset > 0.05) {
      const beamAlpha = (dayAmt * 0.078 + sunset * 0.12) * state.polePulse;
      const beamCol = sunset > 0.35 ? "255, 198, 128" : "255, 248, 226";
      const shafts = [
        {
          x0: 0.04,
          y0: 0.21,
          x1: 0.13,
          y1: 0.24,
          bx0: 0.33,
          bx1: 0.58,
          by: 0.98,
          aMul: 1.0,
          ph: 0.0,
        },
        {
          x0: 0.15,
          y0: 0.25,
          x1: 0.23,
          y1: 0.28,
          bx0: 0.37,
          bx1: 0.58,
          by: 0.88,
          aMul: 0.86,
          ph: 0.22,
        },
        {
          x0: 0.24,
          y0: 0.29,
          x1: 0.31,
          y1: 0.32,
          bx0: 0.41,
          bx1: 0.57,
          by: 0.78,
          aMul: 0.72,
          ph: 0.44,
        },
        {
          x0: 0.32,
          y0: 0.33,
          x1: 0.37,
          y1: 0.35,
          bx0: 0.44,
          bx1: 0.56,
          by: 0.7,
          aMul: 0.58,
          ph: 0.66,
        },
      ];
      ctx.save();
      for (const s of shafts) {
        const bayMod =
          0.86 + 0.14 * Math.sin(state.worldScroll * 4.8 + s.ph * 6.283);
        const ax0 = s.x0 * W,
          ay0 = s.y0 * H;
        const ax1 = s.x1 * W,
          ay1 = s.y1 * H;
        const bx0 = s.bx0 * W,
          bx1 = s.bx1 * W,
          by = s.by * H;
        const g = ctx.createLinearGradient(ax0, ay0, bx1, by);
        const pk = beamAlpha * s.aMul * bayMod;
        g.addColorStop(0.0, `rgba(${beamCol}, 0.0)`);
        g.addColorStop(0.24, `rgba(${beamCol}, ${pk.toFixed(3)})`);
        g.addColorStop(0.76, `rgba(${beamCol}, ${(pk * 0.44).toFixed(3)})`);
        g.addColorStop(1.0, `rgba(${beamCol}, 0.0)`);
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

    ctx.save();
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const lampConeMask =
        Math.exp(-Math.pow((m.nx - 0.5) / 0.19, 2)) *
        Math.exp(-Math.pow((m.ny - 0.24) / 0.26, 2));
      const sunZoneMask =
        Math.exp(-Math.pow((m.nx - 0.38) / 0.28, 2)) *
        Math.exp(-Math.pow((m.ny - 0.48) / 0.34, 2));
      const zoneVis =
        sunZoneMask * (dayAmt + sunset * 0.85) +
        lampConeMask * (night + sunset * 0.35) * state.lampDip;
      if (zoneVis < 0.08) continue;

      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(m.phase * 1.35));
      const a =
        pulse * zoneVis * (night > 0.5 ? 0.42 : sunset > 0.4 ? 0.48 : 0.38);
      if (a < 0.025) continue;

      const mx = m.nx * W;
      const my = m.ny * H;
      const mr = m.r * sc;
      const rgb =
        night > 0.5
          ? "255, 206, 126"
          : sunset > 0.4
            ? "255, 214, 146"
            : "255, 250, 232";
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      mg.addColorStop(0.0, `rgba(${rgb}, ${a.toFixed(3)})`);
      mg.addColorStop(0.5, `rgba(${rgb}, ${(a * 0.45).toFixed(3)})`);
      mg.addColorStop(1.0, `rgba(${rgb}, 0.0)`);
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderAndUpload({
    W,
    H,
    showStraps,
    showDust,
    showNoFace = 1,
    sunset,
    night,
  }) {
    const sx = canvas.width / Math.max(1, W);
    const sy = canvas.height / Math.max(1, H);
    const sc = Math.max(0.55, Math.min(1.22, Math.min(W, H) / 860));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    drawFloorRingShadows(W, H, sc, sunset, night, showStraps);
    drawSootSprites(W, H, sc, sunset, night);
    drawAtmosphereMotes(W, H, sc, sunset, night, showDust);
    if (showStraps >= 0.5) {
      drawHandStraps(W, H, sc, sunset, night);
    }
    drawNoFaceGoldDust(W, H, sc, sunset, night, showNoFace);

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
    get cabinReady() {
      return cabinReady;
    },
    get noFaceReady() {
      return noFaceReady;
    },
    get cloudsReady() {
      return sharedExt ? sharedExt.cloudsReady : localCloudsReady;
    },
    get worldScroll() {
      return state.worldScroll;
    },
    get bobY() {
      return state.bobY;
    },
    get swayX() {
      return state.swayX;
    },
    get passProgress() {
      return state.passProgress;
    },
    get passFlash() {
      return state.passFlash;
    },
    get lampDip() {
      return state.lampDip;
    },
    get parallaxX() {
      return state.parallaxX;
    },
    get parallaxY() {
      return state.parallaxY;
    },
    get noFaceRect() {
      return state.noFaceRect;
    },
    setMouse,
    resize,
    step,
    renderAndUpload,
  };
}
