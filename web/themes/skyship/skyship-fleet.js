/**
 * Skyship Theme Fleet & Foreground Sky Controller ("Tàu giữa Biển Mây")
 * Orchestrates:
 *   - Hero Flying Sky Galleon buoyant pitch/heave & continuous bow/stern cloud-wake plumes
 *   - Companion Escort Skiff sailing smoothly with out-of-phase buoyancy on the left
 *   - Soaring Winged Sky Glider banking with real roll tilt, SDF icon avoidance & wingtip wind trails
 *   - Optional poetic Lookout Platform & Wind-Swept Figure emerging from the right cloud bank
 */
import { createSmokePlume } from '../castle/castle-smoke.js';

function loadSprite(src, onReady) {
  const s = { img: new Image(), ready: false };
  s.img.onload = () => {
    s.ready = true;
    onReady?.();
  };
  s.img.src = src;
  return s;
}

function createGpuSpriteTexture(gl, src, onLoaded) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    onLoaded?.();
  };
  img.src = src;
  return tex;
}

export function createSkyshipFleet(gl, onReady) {
  // 2-Layer Rigid-Timber + GPU Billowing Sails + Baked Cloth Physics Maps (loaded ONCE, zero per-frame upload!)
  let galleonLoadCount = 0;
  let galleonReady = 0.0;
  const markGalleon = () => {
    if (++galleonLoadCount >= 3) {
      galleonReady = 1.0;
      onReady?.();
    }
  };
  const galleonHullTex    = createGpuSpriteTexture(gl, 'assets/skyship-galleon-hull.png', markGalleon);
  const galleonSailsTex   = createGpuSpriteTexture(gl, 'assets/skyship-galleon-sails.png', markGalleon);
  const galleonSailMapTex = createGpuSpriteTexture(gl, 'assets/skyship-galleon-sailmap.png', markGalleon);

  let skiffLoadCount = 0;
  let skiffReady = 0.0;
  const markSkiff = () => {
    if (++skiffLoadCount >= 3) {
      skiffReady = 1.0;
      onReady?.();
    }
  };
  const skiffHullTex    = createGpuSpriteTexture(gl, 'assets/skyship-skiff-hull.png', markSkiff);
  const skiffSailsTex   = createGpuSpriteTexture(gl, 'assets/skyship-skiff-sails.png', markSkiff);
  const skiffSailMapTex = createGpuSpriteTexture(gl, 'assets/skyship-skiff-sailmap.png', markSkiff);

  // Foreground dynamic overlay (capped cleanly at 1152px wide for fast GPU upload & 60 FPS!)
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');

  const fgTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fgTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const gliderSpr = loadSprite('assets/skyship-glider.png', onReady);

  // Cloud-wake vapor plumes streaming off the galleon bow & stern as it plows through the cloud sea
  const bowWake = createSmokePlume({
    kind: 'steam',
    spawnRate: 0.085,
    life: 2.8,
    r0: 10.0,
    rGrow: 28.0,
    jetVx: 14.0,
    jetVy: 5.0,
    windVx: 42.0,
    windVy: 8.0,
    windDrag: 1.5,
    curlAmp: 7.5,
    curlFreq: 1.35,
    opacity: 0.28
  });

  const sternWake = createSmokePlume({
    kind: 'steam',
    spawnRate: 0.075,
    life: 3.1,
    r0: 12.0,
    rGrow: 34.0,
    jetVx: 20.0,
    jetVy: 3.5,
    windVx: 48.0,
    windVy: 6.0,
    windDrag: 1.35,
    curlAmp: 9.5,
    curlFreq: 1.2,
    opacity: 0.24
  });

  const state = {
    phase: 0,
    galleonRect: new Float32Array(4),
    galleonTilt: new Float32Array(2),
    skiffRect: new Float32Array(4),
    skiffTilt: new Float32Array(2),
    // Soaring winged glider physics state
    glider: {
      x: 720,
      y: 420,
      vx: -28,
      vy: -6,
      bank: 0,
      hoverPhase: 0,
      trailL: [],
      trailR: [],
      initialized: false
    }
  };

  function resize(W, H) {
    const scale = Math.min(1.0, 1152 / Math.max(1, W));
    const nw = Math.max(320, Math.round(W * scale));
    const nh = Math.max(180, Math.round(H * scale));
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw;
      canvas.height = nh;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      gl.bindTexture(gl.TEXTURE_2D, fgTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  function step(dt, { W, H, flow, showGlider, sampleSdf, adaptive }) {
    const wind = Math.max(0.08, flow);
    const sc = Math.max(0.55, Math.min(1.18, Math.min(W, H) / 860));
    state.phase += dt * (0.72 + wind * 0.45);

    // 1. Hero Sky Galleon majestic aerodynamic heave & gentle pitch synced to sky gusts
    const gW = Math.min(W * 0.50, H * 0.90);
    const gH = gW * (720 / 960);
    const heaveY = Math.sin(state.phase * 1.15) * 9.5 * sc + Math.sin(state.phase * 2.1 + 1.2) * 2.8 * sc;
    const driftX = Math.cos(state.phase * 0.62) * 8.0 * sc;
    const pitch  = Math.sin(state.phase * 1.15 - 0.55) * 0.022;

    const gx = W * 0.44 - gW * 0.5 + driftX;
    const gy = H * 0.37 - gH * 0.5 + heaveY;
    state.galleonRect[0] = gx;
    state.galleonRect[1] = gy;
    state.galleonRect[2] = gW;
    state.galleonRect[3] = gH;
    state.galleonTilt[0] = pitch;
    state.galleonTilt[1] = heaveY;

    // 1b. Companion Escort Sky-Skiff GPU rect & out-of-phase buoyant roll on the left cloud wave
    const sSize = Math.min(W * 0.165, H * 0.295);
    const skBob = Math.sin(state.phase * 1.42 + 1.9) * 8.5 * sc;
    const skX   = W * 0.13 + Math.cos(state.phase * 0.78 + 0.8) * 7.5 * sc;
    const skY   = H * 0.65 + skBob;
    const skRot = Math.sin(state.phase * 1.42 + 1.2) * 0.038;
    state.skiffRect[0] = skX - sSize * 0.5;
    state.skiffRect[1] = skY - sSize * 0.5;
    state.skiffRect[2] = sSize;
    state.skiffRect[3] = sSize;
    state.skiffTilt[0] = skRot;
    state.skiffTilt[1] = skBob;

    // Step cloud-wake vapor ribbons streaming off bow & stern keel
    bowWake.step(dt, gx + gW * 0.31, gy + gH * 0.85, { wind, gust: 0.45, sc, active: true });
    sternWake.step(dt, gx + gW * 0.78, gy + gH * 0.86, { wind, gust: 0.45, sc, active: true });

    // 2. Soaring Winged Sky Glider gliding gracefully in foreground right (figure-8 thermal + SDF icon avoidance!)
    const glid = state.glider;
    if (!glid.initialized) {
      glid.x = W * 0.70;
      glid.y = H * 0.77;
      glid.initialized = true;
    }

    if (showGlider >= 0.5) {
      glid.hoverPhase += dt * (0.44 + wind * 0.24);
      // Graceful wide figure-8 thermal orbit across the lower-right foreground cloud sea
      const anchorX = W * 0.69 + Math.sin(glid.hoverPhase * 0.85) * W * 0.14;
      const anchorY = H * 0.78 + Math.sin(glid.hoverPhase * 1.70) * H * 0.065;

      let ax = (anchorX - glid.x) * 1.45;
      let ay = (anchorY - glid.y) * 1.85;

      // Smooth SDF steering around desktop icon clouds when adaptive mode is active
      if (adaptive >= 0.5 && sampleSdf) {
        const s = sampleSdf(glid.x, glid.y);
        if (s < 52) {
          const eps = 10;
          const gxS = sampleSdf(glid.x + eps, glid.y) - sampleSdf(glid.x - eps, glid.y);
          const gyS = sampleSdf(glid.x, glid.y + eps) - sampleSdf(glid.x, glid.y - eps);
          const gm = Math.hypot(gxS, gyS) || 1;
          const push = ((52 - s) / 52) * 145;
          ax += (gxS / gm) * push;
          ay += (gyS / gm) * push;
        }
      }

      glid.vx += (ax - glid.vx * 1.65) * Math.min(1, dt * 2.2);
      glid.vy += (ay - glid.vy * 1.65) * Math.min(1, dt * 2.2);
      glid.x += glid.vx * dt;
      glid.y += glid.vy * dt;

      // Banking roll responds smoothly to horizontal acceleration + gentle thermal sway
      const targetBank = Math.max(-0.24, Math.min(0.24, glid.vx * 0.0028 + Math.sin(glid.hoverPhase * 1.7) * 0.06));
      glid.bank += (targetBank - glid.bank) * Math.min(1, dt * 4.5);

      // Update whisper-thin dual wingtip vortex wind trails
      const glW = Math.min(W * 0.25, H * 0.44);
      const glH = glW * (380 / 540);
      const cB = Math.cos(glid.bank), sB = Math.sin(glid.bank);
      const tipLX = glid.x + (-glW * 0.46 * cB - (-glH * 0.34) * sB);
      const tipLY = glid.y + (-glW * 0.46 * sB + (-glH * 0.34) * cB);
      const tipRX = glid.x + ( glW * 0.46 * cB - ( glH * 0.42) * sB);
      const tipRY = glid.y + ( glW * 0.46 * sB + ( glH * 0.42) * cB);

      const driftTrailX = 36 * wind * dt * sc;
      const driftTrailY = 5 * wind * dt * sc;
      for (const tr of [glid.trailL, glid.trailR]) {
        for (const pt of tr) { pt.x += driftTrailX; pt.y += driftTrailY; pt.age += dt; }
        while (tr.length > 0 && tr[0].age > 1.35) tr.shift();
      }
      if (!glid.trailL.length || glid.trailL[glid.trailL.length - 1].age > 0.045) {
        glid.trailL.push({ x: tipLX, y: tipLY, age: 0 });
        glid.trailR.push({ x: tipRX, y: tipRY, age: 0 });
      }
    }
  }

  function drawWingtipTrail(pts, sc) {
    if (pts.length < 3) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const life = Math.max(0, 1 - b.age / 1.35);
      const fade = life * life * Math.min(1, i / 4);
      ctx.strokeStyle = `rgba(255, 250, 236, ${(fade * 0.26).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.7, (0.6 + fade * 1.4) * sc);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Draws the poetic diving-board lookout ledge & wind-swept figure on the right cloud bank */
  function drawLookoutLedge(W, H, sc, t, wind) {
    const lx = W * 0.72;
    const ly = H * 0.605;
    const boardLen = 78 * sc;
    const boardH = 7.5 * sc;

    ctx.save();
    ctx.translate(lx, ly);

    // Steel ladder descending into the billowing right cloud bank
    ctx.strokeStyle = '#333b52';
    ctx.lineWidth = 1.8 * sc;
    const ladX = boardLen * 0.20;
    const ladH = 38 * sc;
    ctx.beginPath();
    ctx.moveTo(ladX, boardH * 0.8);
    ctx.lineTo(ladX - 3 * sc, ladH);
    ctx.moveTo(ladX + 8.5 * sc, boardH * 0.8);
    ctx.lineTo(ladX + 5.5 * sc, ladH);
    for (let r = 1; r <= 4; r++) {
      const ry = boardH + r * 6.5 * sc;
      const rx = ladX - (r / 5) * 2.5 * sc;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 8.5 * sc, ry);
    }
    ctx.stroke();

    // Perspective sky-plank / diving board jutting out over the cloud abyss
    ctx.fillStyle = '#4e5d7a';
    ctx.beginPath();
    ctx.moveTo(-boardLen * 0.52, -boardH * 0.15);
    ctx.lineTo(boardLen * 0.50, -boardH * 0.60);
    ctx.lineTo(boardLen * 0.56, boardH * 0.28);
    ctx.lineTo(-boardLen * 0.52, boardH * 0.55);
    ctx.closePath();
    ctx.fill();

    // Sunlit top face of plank
    ctx.fillStyle = '#8b9db8';
    ctx.beginPath();
    ctx.moveTo(-boardLen * 0.52, -boardH * 0.15);
    ctx.lineTo(boardLen * 0.50, -boardH * 0.60);
    ctx.lineTo(boardLen * 0.52, -boardH * 0.12);
    ctx.lineTo(-boardLen * 0.52, boardH * 0.14);
    ctx.closePath();
    ctx.fill();

    // Tiny wind-swept silhouette standing at the tip with outstretched arms welcoming the sky breeze!
    const fx = -boardLen * 0.34;
    const fy = -boardH * 0.15;
    const fh = 24 * sc;
    const flutter = Math.sin(t * (4.5 + wind * 2.2)) * 1.4 * sc;

    ctx.translate(fx, fy);
    // Legs
    ctx.strokeStyle = '#2b2d3b';
    ctx.lineWidth = 1.75 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-1.8 * sc, 0); ctx.lineTo(-1.3 * sc, -fh * 0.42);
    ctx.moveTo( 1.8 * sc, 0); ctx.lineTo( 1.3 * sc, -fh * 0.42);
    ctx.stroke();

    // White breeze-blown shirt / tunic
    ctx.fillStyle = '#f2ede2';
    ctx.beginPath();
    ctx.moveTo(-2.6 * sc, -fh * 0.40);
    ctx.lineTo( 2.8 * sc + flutter * 0.35, -fh * 0.40);
    ctx.lineTo( 2.4 * sc, -fh * 0.78);
    ctx.lineTo(-2.4 * sc, -fh * 0.78);
    ctx.closePath();
    ctx.fill();

    // Outstretched arms welcoming the sky wind
    const armWave = Math.sin(t * 2.1) * 0.8 * sc;
    ctx.strokeStyle = '#e8d2be';
    ctx.lineWidth = 1.55 * sc;
    ctx.beginPath();
    ctx.moveTo(-2.2 * sc, -fh * 0.74);
    ctx.lineTo(-8.8 * sc, -fh * 0.78 + armWave);
    ctx.moveTo( 2.2 * sc, -fh * 0.74);
    ctx.lineTo( 8.8 * sc, -fh * 0.77 - armWave);
    ctx.stroke();

    // Head + wind-blown hair streamer
    ctx.fillStyle = '#332d34';
    ctx.beginPath();
    ctx.arc(0, -fh * 0.88, 2.3 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#332d34';
    ctx.lineWidth = 1.3 * sc;
    ctx.beginPath();
    ctx.moveTo(1.5 * sc, -fh * 0.88);
    ctx.quadraticCurveTo(4.2 * sc, -fh * 0.90 + flutter * 0.5, 6.2 * sc + flutter * 0.6, -fh * 0.84 + flutter * 0.4);
    ctx.stroke();

    ctx.restore();
  }

  function renderAndUpload(t, { W, H, flow, showEscort, showGlider, showLookout }) {
    const sx = canvas.width / Math.max(1, W);
    const sy = canvas.height / Math.max(1, H);
    const sc = Math.max(0.55, Math.min(1.18, Math.min(W, H) / 860));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    // 1. Soft swirling cloud-wake mist ribbons trailing off the Galleon's bow & stern keel
    bowWake.draw(ctx, state.galleonRect[0] + state.galleonRect[2] * 0.31, state.galleonRect[1] + state.galleonRect[3] * 0.85, sc);
    sternWake.draw(ctx, state.galleonRect[0] + state.galleonRect[2] * 0.78, state.galleonRect[1] + state.galleonRect[3] * 0.86, sc);

    // 2. Poetic Lookout Platform & Wind-Swept Figure on right cloud bank (optional toggle)
    if (showLookout >= 0.5) {
      drawLookoutLedge(W, H, sc, t, Math.max(0.1, flow));
    }

    // 3. Foreground Soaring Winged Sky Glider + Dual Wingtip Wind Trails!
    // (Escort Sky-Skiff now renders directly in WebGL2 with live GPU cloth-billowing sails!)
    if (showGlider >= 0.5 && gliderSpr.ready) {
      const glid = state.glider;
      drawWingtipTrail(glid.trailL, sc);
      drawWingtipTrail(glid.trailR, sc);

      const glW = Math.min(W * 0.25, H * 0.44);
      const glH = glW * (380 / 540);
      ctx.save();
      ctx.translate(glid.x, glid.y);
      ctx.rotate(glid.bank);
      ctx.drawImage(gliderSpr.img, -glW * 0.5, -glH * 0.5, glW, glH);
      ctx.restore();
    }

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, fgTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  return {
    galleonHullTexture: galleonHullTex,
    galleonSailsTexture: galleonSailsTex,
    galleonSailMapTexture: galleonSailMapTex,
    skiffHullTexture: skiffHullTex,
    skiffSailsTexture: skiffSailsTex,
    skiffSailMapTexture: skiffSailMapTex,
    fgTexture: fgTex,
    get galleonReady() { return galleonReady; },
    get skiffReady() { return skiffReady; },
    get galleonRect() { return state.galleonRect; },
    get galleonTilt() { return state.galleonTilt; },
    get skiffRect() { return state.skiffRect; },
    get skiffTilt() { return state.skiffTilt; },
    resize,
    step,
    renderAndUpload
  };
}
