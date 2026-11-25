/**
 * Unified Bridge between Theme Page and:
 * 1. C# Host WebView2 (?host=1 / window.chrome.webview)
 * 2. Settings Live Preview iframe (?preview=1 / window.postMessage)
 * 3. Standalone browser prototype (interactive draggable demo icons)
 *
 * Also handles privacy-safe snapshot & WebM clip recording with synthetic icons.
 */
const SAMPLE_LAYOUT = [
  { col: 0, row: 0, kind: 'pc', color: '#4B83A6' },
  { col: 0, row: 1, kind: 'folder', color: '#E0A83E' },
  { col: 0, row: 2, kind: 'folder', color: '#E0A83E' },
  { col: 0, row: 3, kind: 'doc', color: '#4A7BD1' },
  { col: 0, row: 4, kind: 'image', color: '#4EA581' },
  { col: 1, row: 0, kind: 'folder', color: '#E0A83E' },
  { col: 1, row: 1, kind: 'code', color: '#6E74A8' },
  { col: 1, row: 2, kind: 'doc', color: '#D16058' },
  { col: 2, row: 0, kind: 'app', color: '#3996A8' },
  { col: 8, row: 1, kind: 'folder', color: '#E0A83E' },
  { col: 8, row: 2, kind: 'doc', color: '#4A7BD1' },
  { col: 9, row: 1, kind: 'image', color: '#4EA581' }
];

export function createHostBridge(callbacks) {
  const qs = new URLSearchParams(location.search);
  const isPreview = qs.get('preview') === '1';
  const hasWebView2 = !!(window.chrome && window.chrome.webview);
  const hasWebKit = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.scream);
  const hasWebView = hasWebView2 || hasWebKit;
  const isHost = !isPreview && (qs.get('host') === '1' || hasWebView);
  const isStandalone = !isHost && !isPreview;

  let rawIconPayload = null;
  let demoIcons = [];
  let iconsSeen = false;
  let paused = false;

  const postToHost = (obj) => {
    const str = JSON.stringify(obj);
    if (isHost && hasWebView2) {
      window.chrome.webview.postMessage(str);
    } else if (isHost && hasWebKit) {
      window.webkit.messageHandlers.scream.postMessage(str);
    } else if (isPreview && window.parent && window.parent !== window) {
      window.parent.postMessage(str, '*');
    }
  };

  function buildDemoIcons(w, h) {
    const scale = Math.min(w / 1440, h / 900);
    const cellW = Math.max(46, Math.round(86 * scale));
    const cellH = Math.max(58, Math.round(104 * scale));
    const padX = Math.max(10, Math.round(18 * scale));
    const padY = Math.max(10, Math.round(18 * scale));
    const cols = Math.max(3, Math.floor((w - padX * 2) / cellW));
    const rows = Math.max(3, Math.floor((h - padY * 2 - 36 * scale) / cellH));

    return SAMPLE_LAYOUT
      .filter((item) => item.col < cols && item.row < rows)
      .map((item, idx) => {
        const x = padX + item.col * cellW;
        const y = padY + item.row * cellH;
        const iw = Math.round(cellW * 0.86);
        const ih = Math.round(cellH * 0.88);
        return {
          id: idx,
          x,
          y,
          w: iw,
          h: ih,
          kind: item.kind,
          color: item.color
        };
      });
  }

  function mapIconsToViewport(w, h) {
    if (rawIconPayload) {
      if (!rawIconPayload.vis) return [];
      const sw = Math.max(1, rawIconPayload.sw || w);
      const sh = Math.max(1, rawIconPayload.sh || h);
      const sx = w / sw;
      const sy = h / sh;
      return (rawIconPayload.r || []).map((box, idx) => {
        const l = box[0] * sx;
        const t = box[1] * sy;
        const r = box[2] * sx;
        const b = box[3] * sy;
        const width = Math.max(12, r - l);
        const height = Math.max(12, b - t);
        const palette = SAMPLE_LAYOUT[idx % SAMPLE_LAYOUT.length];
        return {
          id: idx,
          x: l,
          y: t,
          w: width,
          h: height,
          cx: l + width * 0.5,
          cy: t + height * 0.5,
          hw: Math.max(4, width * 0.5 - 3),
          hh: Math.max(4, height * 0.5 - 2),
          kind: palette.kind,
          color: palette.color
        };
      });
    }

    if (demoIcons.length === 0) {
      demoIcons = buildDemoIcons(w, h);
    }
    return demoIcons.map((ic) => ({
      ...ic,
      cx: ic.x + ic.w * 0.5,
      cy: ic.y + ic.h * 0.5,
      hw: Math.max(4, ic.w * 0.5 - 3),
      hh: Math.max(4, ic.h * 0.5 - 2)
    }));
  }

  function handleIncoming(raw) {
    let msg = raw;
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
    }
    if (!msg || typeof msg !== 'object') return;

    switch (msg.t) {
      case 'settings':
        if (msg.v && typeof msg.v === 'object') {
          callbacks.onSettings?.(msg.v);
        }
        break;

      case 'reset':
        callbacks.onReset?.();
        break;

      case 'icons':
        rawIconPayload = msg;
        iconsSeen = true;
        callbacks.onIcons?.(mapIconsToViewport(window.innerWidth, window.innerHeight), { fromEmpty: false });
        break;

      case 'pause':
        paused = (isPreview && !msg.manual) ? false : !!msg.v;
        callbacks.onPause?.(paused, iconsSeen);
        break;

      case 'moon':
        callbacks.onMoon?.({
          mode: msg.mode || 'full',
          date: msg.date || '2000-08-15'
        });
        break;

      case 'mouse':
        if (typeof msg.x === 'number' && typeof msg.y === 'number') {
          callbacks.onMouse?.(msg.x, msg.y);
        }
        break;

      case 'snapshot':
        runSnapshotExport();
        break;

      case 'record':
        runRecordExport(Math.max(2, Math.min(8, Number(msg.sec) || 4)));
        break;
    }
  }

  /**
   * Draws synthetic, privacy-safe icons & neutral label color blocks over a share frame
   * so the exported PNG/WebM shows the real adaptive layout without exposing filenames.
   */
  function drawSyntheticIcons(ctx, icons, scaleX, scaleY) {
    for (const ic of icons) {
      const x = ic.x * scaleX;
      const y = ic.y * scaleY;
      const w = ic.w * scaleX;
      const h = ic.h * scaleY;
      const box = Math.min(w * 0.54, h * 0.48);
      const bx = x + (w - box) * 0.5;
      const by = y + h * 0.1;

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 30, 0.22)';
      ctx.shadowBlur = Math.max(4, box * 0.16);
      ctx.shadowOffsetY = Math.max(1.5, box * 0.06);

      ctx.fillStyle = ic.color || '#4B83A6';
      roundRect(ctx, bx, by, box, box * 0.86, Math.max(4, box * 0.18));
      ctx.fill();

      // Subtle glossy highlight on icon tile
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
      roundRect(ctx, bx + box * 0.12, by + box * 0.1, box * 0.76, box * 0.26, Math.max(2, box * 0.08));
      ctx.fill();

      // Abstract pill bar representing filename (zero real text)
      const labelW = Math.min(w * 0.74, box * 1.25);
      const labelH = Math.max(4, box * 0.15);
      ctx.fillStyle = 'rgba(24, 32, 36, 0.42)';
      roundRect(ctx, x + (w - labelW) * 0.5, by + box * 1.02, labelW, labelH, labelH * 0.5);
      ctx.fill();
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function composeShareFrame(outCanvas, glCanvas, overlayCanvas, icons) {
    const ctx = outCanvas.getContext('2d');
    const ow = outCanvas.width;
    const oh = outCanvas.height;
    ctx.clearRect(0, 0, ow, oh);
    ctx.drawImage(glCanvas, 0, 0, ow, oh);
    if (overlayCanvas) {
      ctx.drawImage(overlayCanvas, 0, 0, ow, oh);
    }
    const sx = ow / Math.max(1, window.innerWidth);
    const sy = oh / Math.max(1, window.innerHeight);
    drawSyntheticIcons(ctx, icons, sx, sy);
  }

  function runSnapshotExport() {
    try {
      const canvases = callbacks.getCanvases?.();
      if (!canvases || !canvases.glCanvas) {
        postToHost({ t: 'snapshotResult', ok: false, err: 'Canvas not ready' });
        return;
      }
      callbacks.renderNow?.();
      const out = document.createElement('canvas');
      out.width = canvases.glCanvas.width;
      out.height = canvases.glCanvas.height;
      const icons = mapIconsToViewport(window.innerWidth, window.innerHeight);
      composeShareFrame(out, canvases.glCanvas, canvases.overlayCanvas, icons);
      const dataUrl = out.toDataURL('image/png');
      postToHost({ t: 'snapshotResult', ok: true, ext: 'png', data: dataUrl });
    } catch (err) {
      postToHost({ t: 'snapshotResult', ok: false, err: String(err) });
    }
  }

  function runRecordExport(seconds) {
    try {
      const canvases = callbacks.getCanvases?.();
      if (!canvases || !canvases.glCanvas || typeof MediaRecorder === 'undefined') {
        postToHost({ t: 'recordResult', ok: false, err: 'MediaRecorder unavailable' });
        return;
      }
      const out = document.createElement('canvas');
      const maxW = 1280;
      const ratio = Math.min(1, maxW / Math.max(1, canvases.glCanvas.width));
      out.width = Math.max(320, Math.round(canvases.glCanvas.width * ratio));
      out.height = Math.max(180, Math.round(canvases.glCanvas.height * ratio));

      const stream = out.captureStream(30);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : (MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : (MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : ''));
      const outExt = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const recOpts = mime ? { mimeType: mime, videoBitsPerSecond: 3_500_000 } : { videoBitsPerSecond: 3_500_000 };
      const recorder = new MediaRecorder(stream, recOpts);
      const chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };

      let stopped = false;
      const pump = () => {
        if (stopped) return;
        callbacks.renderNow?.();
        const icons = mapIconsToViewport(window.innerWidth, window.innerHeight);
        composeShareFrame(out, canvases.glCanvas, canvases.overlayCanvas, icons);
        requestAnimationFrame(pump);
      };

      recorder.onstop = () => {
        stopped = true;
        const blob = new Blob(chunks, { type: mime || 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          postToHost({ t: 'recordResult', ok: true, ext: outExt, data: reader.result });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      pump();
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, seconds * 1000);
    } catch (err) {
      postToHost({ t: 'recordResult', ok: false, err: String(err) });
    }
  }

  // Interactive mock icons overlay in standalone / preview drag mode
  function setupStandaloneDemoIcons(containerEl) {
    if (!containerEl) return;
    if (isHost) {
      containerEl.style.display = 'none';
      return;
    }

    const renderDemoDom = () => {
      const icons = mapIconsToViewport(window.innerWidth, window.innerHeight);
      containerEl.innerHTML = '';
      if (rawIconPayload && !isStandalone) {
        // In preview mode when synced to real desktop icons, render clean synthetic markers
        for (const ic of icons) {
          const el = document.createElement('div');
          el.className = 'demo-icon synced';
          el.style.left = ic.x + 'px';
          el.style.top = ic.y + 'px';
          el.style.width = ic.w + 'px';
          el.style.height = ic.h + 'px';
          el.innerHTML = `<div class="tile" style="background:${ic.color}"></div><div class="bar"></div>`;
          containerEl.appendChild(el);
        }
        return;
      }

      for (const ic of icons) {
        const el = document.createElement('div');
        el.className = 'demo-icon draggable';
        el.style.left = ic.x + 'px';
        el.style.top = ic.y + 'px';
        el.style.width = ic.w + 'px';
        el.style.height = ic.h + 'px';
        el.innerHTML = `<div class="tile" style="background:${ic.color}"></div><div class="bar"></div>`;

        el.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          el.setPointerCapture(ev.pointerId);
          const startX = ev.clientX;
          const startY = ev.clientY;
          const origX = ic.x;
          const origY = ic.y;

          const onMove = (mv) => {
            const nx = Math.max(4, Math.min(window.innerWidth - ic.w - 4, origX + (mv.clientX - startX)));
            const ny = Math.max(4, Math.min(window.innerHeight - ic.h - 4, origY + (mv.clientY - startY)));
            const target = demoIcons.find((d) => d.id === ic.id);
            if (target) {
              target.x = nx;
              target.y = ny;
            }
            el.style.left = nx + 'px';
            el.style.top = ny + 'px';
            callbacks.onIcons?.(mapIconsToViewport(window.innerWidth, window.innerHeight), { fromEmpty: false });
          };

          const onUp = () => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
          };

          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
        });

        containerEl.appendChild(el);
      }
    };

    const origOnIcons = callbacks.onIcons;
    callbacks.onIcons = (mapped, opts) => {
      origOnIcons?.(mapped, opts);
      if (rawIconPayload) renderDemoDom();
    };

    window.addEventListener('resize', () => {
      if (!rawIconPayload) demoIcons = buildDemoIcons(window.innerWidth, window.innerHeight);
      renderDemoDom();
    });

    renderDemoDom();
  }

  if (isHost && hasWebView2) {
    window.chrome.webview.addEventListener('message', (ev) => handleIncoming(ev.data));
  }
  if (isHost && hasWebKit) {
    window.__screamReceive = (raw) => handleIncoming(raw);
  }
  window.addEventListener('message', (ev) => handleIncoming(ev.data));
  if (!isHost && typeof window.addEventListener === 'function') {
    window.addEventListener('pointermove', (ev) => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      callbacks.onMouse?.(
        Math.max(0, Math.min(1, ev.clientX / w)),
        Math.max(0, Math.min(1, ev.clientY / h))
      );
    }, { passive: true });
  }
  window.addEventListener('error', (ev) => {
    const msg = ev?.message || String(ev?.error || 'Script error');
    postToHost({ t: 'sceneError', msg });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const msg = ev?.reason?.message || String(ev?.reason || 'Unhandled promise rejection');
    postToHost({ t: 'sceneError', msg });
  });

  return {
    isHost,
    isPreview,
    isStandalone,
    getIcons: () => mapIconsToViewport(window.innerWidth, window.innerHeight),
    notifyReady: () => postToHost({ t: 'ready' }),
    setupStandaloneDemoIcons,
    resetDemoLayout: () => {
      demoIcons = buildDemoIcons(window.innerWidth, window.innerHeight);
      callbacks.onIcons?.(mapIconsToViewport(window.innerWidth, window.innerHeight), { fromEmpty: false });
    }
  };
}
