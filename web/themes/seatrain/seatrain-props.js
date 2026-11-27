/**
 * Sea Railway ("Chuyến tàu trên Biển Gương") — Tracking-Camera World & Hand-Painted Studio Ghibli Sprites
 * Loads 100% hand-painted Kazuo Oga gouache RGBA textures (zero flat Canvas2D geometry!):
 *   - seatrain-clouds.png  (seamless tileable monumental sunset cumulus panorama)
 *   - seatrain-train.png   (sleek low-profile 2-car vintage sea train) + seatrain-winmask.png
 *   - seatrain-station.png (flooded Sixth Station: white picket fence, dark wooden booth, signal pole)
 *   - seatrain-island.png  (lonely tiny grassy island with miniature gabled cottage & single upright tree)
 */

function createEmptyTexture(gl, wrapS = gl.CLAMP_TO_EDGE) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  return tex;
}

function loadGpuTexture(gl, src, wrapS, onLoaded) {
  const tex = createEmptyTexture(gl, wrapS);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    onLoaded?.(img);
  };
  img.onerror = () => {
    if (img.src.endsWith('.webp')) img.src = src.replace(/\.webp$/, '.png');
  };
  img.src = src;
  return tex;
}

/**
 * Lightweight shared seamless Ghibli cumulus cloud panorama texture used by both
 * Exterior ("Ngoài tàu") and Cabin ("Trong toa") views so starting in Cabin mode never
 * downloads unused exterior train/station/island sprites!
 */
export function createSharedCloudsLoader(gl, onReady) {
  let cloudsReady = 0.0;
  const cloudsTex = loadGpuTexture(gl, 'assets/seatrain-clouds.webp', gl.REPEAT, () => {
    cloudsReady = 1.0;
    onReady?.();
  });
  return {
    cloudsTexture: cloudsTex,
    get cloudsReady() { return cloudsReady; }
  };
}

export function createSeaTrainController(gl, onReady, sharedClouds = null) {
  let trainReady = 0.0;
  let stationReady = 0.0;
  let islandReady = 0.0;
  let localCloudsReady = 0.0;

  let trainAspect = 9.962;
  let stationAspect = 2.190;
  let islandAspect = 3.024;

  const trainTex = loadGpuTexture(gl, 'assets/seatrain-train.webp', gl.CLAMP_TO_EDGE, (img) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) trainAspect = img.naturalWidth / img.naturalHeight;
    trainReady = 1.0;
    onReady?.();
  });

  const winMaskTex = loadGpuTexture(gl, 'assets/seatrain-winmask.webp', gl.CLAMP_TO_EDGE, () => {
    onReady?.();
  });

  const stationTex = loadGpuTexture(gl, 'assets/seatrain-station.webp', gl.CLAMP_TO_EDGE, (img) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) stationAspect = img.naturalWidth / img.naturalHeight;
    stationReady = 1.0;
    onReady?.();
  });

  const islandTex = loadGpuTexture(gl, 'assets/seatrain-island.webp', gl.CLAMP_TO_EDGE, (img) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) islandAspect = img.naturalWidth / img.naturalHeight;
    islandReady = 1.0;
    onReady?.();
  });

  // Horizontally seamless panoramic Ghibli cumulus cloudscape (reuses shared loader when provided!)
  const cloudsTex = sharedClouds?.cloudsTexture || loadGpuTexture(gl, 'assets/seatrain-clouds.webp', gl.REPEAT, () => {
    localCloudsReady = 1.0;
    onReady?.();
  });

  // Meditative Spirited Away tracking-camera world cycle (in screen-widths):
  // Station glides past at STATION_WORLD, Passing Silhouette Train briefly crosses nearby, Lonely Island at ISLAND_WORLD!
  const WORLD_LOOP    = 4.5;
  const STATION_POS   = 1.10;
  const STATION_WORLD = STATION_POS - 0.50; // World origin where wrapScreenX(STATION_WORLD) === 0 (left edge)
  const ISLAND_POS    = 3.25;

  const state = {
    worldScroll: 0.72,    // Starts with Sixth Station entering serenely on the left horizon!
    speed: 0.155,         // Meditative dreamy tracking pace (~29s per full ocean loop)
    wake: 1.0,
    bobPhase: 0.0,
    stopState: 'cruising',
    dwellTimer: 0.0,
    dockFrac: 0.352,      // Exact normalized screen-X where station aligns directly behind Car 1-2 boarding doors
    trainRect: new Float32Array(4),
    stationRect: new Float32Array(4),
    islandRect: new Float32Array(4),
    passRect: new Float32Array(4)
  };

  function resetToStation() {
    // Place station center directly at state.dockFrac * W (right behind Car 1-2, zero water gap!)
    state.worldScroll = STATION_WORLD + state.dockFrac;
    state.speed = 0.0;
    state.wake = 0.0;
    state.stopState = 'docked';
    state.dwellTimer = 6.5;
  }

  function step(dt, { W, H, flow, trainMode, showPassing }) {
    const mode = Math.round(trainMode ?? 0);
    const horizonY = H * 0.735;

    // Distant panoramic Spirited Away scale: sleek 5-car train viewed from afar, dwarfed by monumental sky & mirror sea!
    const trainW = Math.min(W * 0.37, H * 0.66);
    const trainH = trainW / Math.max(4.0, trainAspect);
    // Size Flooded Sixth Station & Lonely Island strictly relative to trainH so distant perspective stays 100% authentic!
    const stationH = trainH * 2.15;
    const stationW = stationH * Math.max(1.5, stationAspect);
    const islandH = trainH * 0.84;
    const islandW = islandH * Math.max(1.0, islandAspect);

    // Exact docking target: Sixth Station waiting shelter & doorway sit directly behind Car 1-2 boarding doors
    // with the white picket fence extending softly ahead of Car 1's nose and signal pole rising behind Car 2!
    const baseTx = W * 0.50 - trainW * 0.5;
    const dockScreenFrac = (baseTx + trainW * 0.10) / Math.max(1, W);
    state.dockFrac = dockScreenFrac;
    const dockTargetMod = ((STATION_WORLD + dockScreenFrac) % WORLD_LOOP + WORLD_LOOP) % WORLD_LOOP;

    const pace = Math.max(0.0, flow);
    const cruiseSpeed = 0.155 * pace;

    if (mode === 2 || pace <= 0.01) {
      // Mode 2: Docked Still — ease smoothly until station docks directly behind Car 1-2, then rest calmly
      const curMod = ((state.worldScroll % WORLD_LOOP) + WORLD_LOOP) % WORLD_LOOP;
      let diff = dockTargetMod - curMod;
      if (diff < -WORLD_LOOP * 0.5) diff += WORLD_LOOP;
      if (diff >  WORLD_LOOP * 0.5) diff -= WORLD_LOOP;
      state.speed += (Math.max(-0.18, Math.min(0.18, diff * 0.95)) - state.speed) * Math.min(1, dt * 3.2);
      if (Math.abs(diff) < 0.002 && Math.abs(state.speed) < 0.004) {
        state.worldScroll += diff;
        state.speed = 0.0;
      } else {
        state.worldScroll += state.speed * dt;
      }
      state.stopState = 'docked';
    } else if (mode === 1) {
      // Mode 1: Station Stop Cycle — tracks smoothly, slows gently to dock directly at Sixth Station, then departs!
      const curMod = ((state.worldScroll % WORLD_LOOP) + WORLD_LOOP) % WORLD_LOOP;
      let distToDock = dockTargetMod - curMod;
      if (distToDock < -WORLD_LOOP * 0.5) distToDock += WORLD_LOOP;
      if (distToDock >  WORLD_LOOP * 0.5) distToDock -= WORLD_LOOP;

      if (state.stopState === 'docked') {
        state.speed += (0.0 - state.speed) * Math.min(1, dt * 4.5);
        state.dwellTimer -= dt * Math.max(0.5, pace);
        if (state.dwellTimer <= 0) state.stopState = 'departing';
      } else if (state.stopState === 'departing') {
        state.speed += (cruiseSpeed - state.speed) * Math.min(1, dt * 0.80);
        state.worldScroll += state.speed * dt;
        if (Math.abs(distToDock) > 0.35) state.stopState = 'cruising';
      } else if (distToDock > 0.0 && distToDock < 0.55) {
        const desired = Math.min(cruiseSpeed, Math.max(0.012, distToDock * 0.36));
        state.speed += (desired - state.speed) * Math.min(1, dt * 2.2);
        state.worldScroll += state.speed * dt;
        if (distToDock <= 0.004) {
          state.worldScroll += distToDock;
          state.speed = 0.0;
          state.stopState = 'docked';
          state.dwellTimer = 7.5;
        }
      } else {
        state.speed += (cruiseSpeed - state.speed) * Math.min(1, dt * 1.8);
        state.worldScroll += state.speed * dt;
      }
    } else {
      // Mode 0 (Default — exact Pinterest video loop!): Endless meditative tracking journey!
      state.speed += (cruiseSpeed - state.speed) * Math.min(1, dt * 2.0);
      state.worldScroll += state.speed * dt;
      state.stopState = 'cruising';
    }

    const speedNorm = Math.min(1.0, Math.abs(state.speed) / Math.max(0.05, Math.max(0.155, cruiseSpeed)));
    state.wake += (speedNorm - state.wake) * Math.min(1, dt * 3.0);
    state.bobPhase += dt * (1.8 + speedNorm * 4.5);

    const camSwayX = Math.sin(state.bobPhase * 0.24) * 2.6 * speedNorm;
    const railBob  = Math.sin(state.bobPhase) * 0.28 * speedNorm;

    // 1. Hero 5-Car Train centered on screen; bogie bottom sits cleanly submerged at the mirror waterline!
    const tx = baseTx + camSwayX;
    const ty = horizonY - trainH * 0.86 + railBob;
    state.trainRect[0] = tx;
    state.trainRect[1] = ty;
    state.trainRect[2] = trainW;
    state.trainRect[3] = trainH;

    // Convert world X into scrolling Left -> Right screen X
    const wrapScreenX = (worldPos) => {
      let rel = ((state.worldScroll - worldPos) % WORLD_LOOP + WORLD_LOOP) % WORLD_LOOP;
      if (rel > WORLD_LOOP - 0.65) rel -= WORLD_LOOP;
      return rel * W;
    };

    // 2. Hand-Painted Flooded Sixth Station scrolling smoothly Left -> Right behind the train
    const stCenterX = wrapScreenX(STATION_WORLD);
    state.stationRect[0] = stCenterX - stationW * 0.5;
    state.stationRect[1] = horizonY - stationH + stationH * 0.032;
    state.stationRect[2] = stationW;
    state.stationRect[3] = stationH;

    // 3. Hand-Painted Lonely Tiny Grassy Island (cottage + lone tree) scrolling Left -> Right
    const islCenterX = wrapScreenX(ISLAND_POS - 0.50);
    state.islandRect[0] = islCenterX - islandW * 0.5;
    state.islandRect[1] = horizonY - islandH + 2.5;
    state.islandRect[2] = islandW;
    state.islandRect[3] = islandH;

    // 4. Periodic Backlit Hand-Painted Counter-Train Silhouette gliding swiftly Left -> Right in front of hero train
    if (showPassing >= 0.5 && mode !== 2 && speedNorm > 0.25) {
      let passRel = ((state.worldScroll - (STATION_POS + 0.06)) % WORLD_LOOP + WORLD_LOOP) % WORLD_LOOP;
      if (passRel > WORLD_LOOP - 0.30) passRel -= WORLD_LOOP;
      const passX = (passRel * 2.35 - 0.22) * W;
      const passW = trainW * 1.02;
      const passH = trainH * 1.04;
      if (passX + passW * 0.6 > -40 && passX - passW * 0.6 < W + 40) {
        state.passRect[0] = passX - passW * 0.5;
        state.passRect[1] = horizonY - passH * 0.85;
        state.passRect[2] = passW;
        state.passRect[3] = passH;
      } else {
        state.passRect[2] = 0;
      }
    } else {
      state.passRect[2] = 0;
    }
  }

  return {
    trainTexture: trainTex,
    winMaskTexture: winMaskTex,
    stationTexture: stationTex,
    islandTexture: islandTex,
    cloudsTexture: cloudsTex,
    get trainReady() { return trainReady; },
    get stationReady() { return stationReady; },
    get islandReady() { return islandReady; },
    get cloudsReady() { return sharedClouds ? sharedClouds.cloudsReady : localCloudsReady; },
    get trainRect() { return state.trainRect; },
    get stationRect() { return state.stationRect; },
    get islandRect() { return state.islandRect; },
    get passRect() { return state.passRect; },
    get worldScroll() { return state.worldScroll; },
    get wake() { return state.wake; },
    resetToStation,
    step
  };
}
