/**
 * Arctic AI Video Stage Controller — True 24-60 FPS Studio Ghibli Film Loop Engine
 *
 * Automatically checks for `assets/arctic-stage.webm` (or `assets/arctic-stage.mp4`):
 *   - If present: decodes on GPU hardware via <video>, uploads frames ONLY when a new video
 *     frame decodes (`requestVideoFrameCallback`), pauses cleanly when wallpaper is hidden
 *     (0% CPU/GPU), and reports `isReady() === true` so `arctic-scene.js` seamlessly switches
 *     from sprite actors to the real AI-generated Studio Ghibli animation loop!
 *   - If absent: stays cleanly inactive (`isReady() === false`) with zero console errors so
 *     the existing sprite actors continue running automatically as fallback.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createArcticVideoStage(gl, onStateChange) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0])
  );

  const bust = Date.now();
  const candidates = [
    `assets/arctic-stage.webm?v=${bust}`,
    `assets/arctic-stage.mp4?v=${bust}`
  ];

  let video = null;
  let ready = false;
  let hasAlpha = false;
  let aspect = 1.0;
  let dirtyFrame = false;
  let lastUploadedTime = -1;
  let paused = false;
  let destroyed = false;
  let sampleBg = [0.976, 0.961, 0.922]; // Default warm Arches snow paper (#f9f5eb)

  // Sample average border snow color once on load so the shader harmonizes paper tone invisibly!
  function calibrateBorderPaperColor(vid) {
    try {
      const probe = document.createElement('canvas');
      probe.width = 32;
      probe.height = 32;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(vid, 0, 0, 32, 32);
      const data = pctx.getImageData(0, 0, 32, 32).data;
      let r = 0, g = 0, b = 0, aMin = 255, n = 0;
      for (let i = 0; i < 32; i++) {
        const edges = [
          (0 * 32 + i) * 4,
          (31 * 32 + i) * 4,
          (i * 32 + 0) * 4,
          (i * 32 + 31) * 4
        ];
        for (const idx of edges) {
          const a = data[idx + 3];
          if (a < aMin) aMin = a;
          if (a > 240) {
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            n++;
          }
        }
      }
      hasAlpha = aMin < 200;
      if (n > 8) {
        sampleBg = [
          clamp(r / (n * 255), 0.75, 1.0),
          clamp(g / (n * 255), 0.75, 1.0),
          clamp(b / (n * 255), 0.70, 1.0)
        ];
      }
    } catch {
      // Ignore cross-origin / headless canvas probe failures safely
    }
  }

  function scheduleVideoFrameCallback(vid) {
    if (destroyed || !vid || typeof vid.requestVideoFrameCallback !== 'function') return;
    vid.requestVideoFrameCallback(() => {
      if (destroyed) return;
      dirtyFrame = true;
      scheduleVideoFrameCallback(vid);
    });
  }

  function tryLoadCandidate(index) {
    if (destroyed || index >= candidates.length) return;
    const url = candidates[index];

    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';

    let settled = false;
    const onFail = () => {
      if (settled || destroyed) return;
      settled = true;
      v.removeAttribute('src');
      v.load();
      tryLoadCandidate(index + 1);
    };

    const onLoaded = () => {
      if (settled || destroyed) return;
      if (!v.videoWidth || !v.videoHeight) {
        onFail();
        return;
      }
      settled = true;
      video = v;
      aspect = v.videoWidth / v.videoHeight;
      ready = true;
      dirtyFrame = true;
      calibrateBorderPaperColor(v);
      scheduleVideoFrameCallback(v);
      if (!paused) {
        v.play().catch(() => {});
      }
      onStateChange?.(true);
    };

    v.addEventListener('loadeddata', onLoaded, { once: true });
    v.addEventListener('error', onFail, { once: true });
    v.src = url;
    v.load();
  }

  // Non-blocking background probe — silently falls back to sprites if no video clip exists yet
  tryLoadCandidate(0);

  function uploadIfNeeded() {
    if (!ready || !video || video.readyState < 2) return false;
    const hasRVFC = typeof video.requestVideoFrameCallback === 'function';
    const timeChanged = Math.abs(video.currentTime - lastUploadedTime) > 1e-4;
    if (!dirtyFrame && (hasRVFC || !timeChanged)) return false;

    dirtyFrame = false;
    lastUploadedTime = video.currentTime;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    return true;
  }

  function setPaused(isPaused) {
    paused = !!isPaused;
    if (!video || !ready) return;
    if (paused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }

  function setSpeed(flow) {
    if (!video || !ready) return;
    const rate = clamp(0.65 + (Number(flow) || 1.0) * 0.35, 0.5, 1.5);
    if (Math.abs(video.playbackRate - rate) > 0.02) {
      video.playbackRate = rate;
    }
  }

  return {
    texture,
    isReady: () => ready,
    hasAlpha: () => hasAlpha,
    getAspect: () => aspect,
    getBorderBg: () => sampleBg,
    uploadIfNeeded,
    setPaused,
    setSpeed,
    destroy() {
      destroyed = true;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }
  };
}
