/**
 * Settings Window Application Controller
 * Orchestrates theme catalog rendering, parameter controls, live preview sync,
 * and bidirectional WebView2 communication with the C# WallpaperCoordinator.
 */
import { COPY, THEME_THUMBS, THEME_SUBTITLES } from './settings-copy.js';

const hasHost = !!(window.chrome && window.chrome.webview);

const state = {
  manifest: null,
  themeId: 'beach',
  lang: 'vi',
  paramsByTheme: {},
  paused: false,
  manualPause: false,
  autostart: false,
  autopause: true,
  multimonitor: false,
  screenCount: 1,
  iconCount: 12,
  latestIconsMsg: null,
  previewReady: false
};

const el = {
  previewShell: document.getElementById('preview-shell'),
  previewFrame: document.getElementById('preview-frame'),
  previewLoading: document.getElementById('preview-loading'),
  previewNote: document.getElementById('preview-note'),
  previewNoteText: document.getElementById('preview-note-text'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  themeGrid: document.getElementById('theme-grid'),
  paramsContainer: document.getElementById('params-container'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  iconCountText: document.getElementById('icon-count-text'),
  btnPause: document.getElementById('btn-pause'),
  btnPauseLabel: document.getElementById('btn-pause-label'),
  pauseIcon: document.getElementById('pause-icon'),
  btnReload: document.getElementById('btn-reload'),
  btnReloadLabel: document.getElementById('btn-reload-label'),
  btnTray: document.getElementById('btn-tray'),
  btnTrayLabel: document.getElementById('btn-tray-label'),
  btnReset: document.getElementById('btn-reset'),
  btnResetLabel: document.getElementById('btn-reset-label'),
  btnSharePng: document.getElementById('btn-share-png'),
  btnSharePngLabel: document.getElementById('btn-share-png-label'),
  btnShareVideo: document.getElementById('btn-share-video'),
  btnShareVideoLabel: document.getElementById('btn-share-video-label'),
  togAutopause: document.getElementById('tog-autopause'),
  togMultimon: document.getElementById('tog-multimon'),
  togAutostart: document.getElementById('tog-autostart'),
  errorBox: document.getElementById('error-box'),
  errorMsg: document.getElementById('error-msg'),
  btnRetry: document.getElementById('btn-retry'),
  toast: document.getElementById('toast'),
  toastText: document.getElementById('toast-text'),
  toastAction: document.getElementById('toast-action')
};

function t(key) {
  return COPY[state.lang]?.[key] ?? COPY.vi[key];
}

function sendToHost(obj) {
  if (hasHost) {
    window.chrome.webview.postMessage(JSON.stringify(obj));
  }
}

function sendToPreview(obj) {
  if (el.previewFrame.contentWindow && state.previewReady) {
    el.previewFrame.contentWindow.postMessage(JSON.stringify(obj), '*');
  }
}

let toastTimer = null;
function showToast(msg, actionLabel = null, onAction = null) {
  el.toastText.textContent = msg;
  if (actionLabel && onAction) {
    el.toastAction.textContent = actionLabel;
    el.toastAction.style.display = 'inline-block';
    el.toastAction.onclick = onAction;
  } else {
    el.toastAction.style.display = 'none';
  }
  el.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 4200);
}

function getThemeObj(id = state.themeId) {
  return state.manifest?.themes?.find((x) => x.id === id) || state.manifest?.themes?.[0];
}

function ensureThemeParams(themeObj) {
  if (!themeObj) return {};
  if (!state.paramsByTheme[themeObj.id]) {
    state.paramsByTheme[themeObj.id] = {};
  }
  const bag = state.paramsByTheme[themeObj.id];
  for (const g of themeObj.groups || []) {
    for (const p of g.params || []) {
      if (bag[p.key] === undefined) bag[p.key] = p.default;
    }
  }
  return bag;
}

function formatValue(param, val) {
  if (param.options) {
    const opts = param.options[state.lang] || param.options.vi;
    return opts[Math.round(val)] ?? String(val);
  }
  if (param.format === 'percent') return `${Math.round(val * 100)}%`;
  if (param.format === 'times') return `${Number(val).toFixed(2)}×`;
  if (param.unit) return `${Math.round(val)} ${param.unit}`;
  return String(Math.round(val));
}

function loadPreviewForTheme(themeObj) {
  if (!themeObj) return;
  state.previewReady = false;
  el.previewLoading.classList.remove('hidden');
  const targetSrc = `${themeObj.page}?preview=1`;
  if (!el.previewFrame.getAttribute('src') || !el.previewFrame.getAttribute('src').endsWith(targetSrc)) {
    el.previewFrame.src = targetSrc;
  } else {
    state.previewReady = true;
    el.previewLoading.classList.add('hidden');
    syncPreviewState();
  }
}

function syncPreviewState() {
  const themeObj = getThemeObj();
  if (!themeObj) return;
  const bag = ensureThemeParams(themeObj);
  sendToPreview({ t: 'settings', v: bag });
  if (state.latestIconsMsg) {
    sendToPreview(state.latestIconsMsg);
  }
}

function applyStaticCopy() {
  document.documentElement.lang = state.lang;
  document.body.setAttribute('data-theme', state.themeId);

  el.statusDot.classList.toggle('paused', state.paused);
  el.statusText.textContent = hasHost
    ? (state.paused ? t('paused') : t('running'))
    : t('previewOnly');
  el.iconCountText.textContent = t('iconsFmt')(state.iconCount);
  const isSynced = !!(hasHost && state.latestIconsMsg);
  if (el.previewNoteText) {
    el.previewNoteText.textContent = isSynced ? t('syncedBadge')(state.iconCount) : t('dragBadge');
  }
  el.previewNote.title = isSynced ? t('syncedHint') : t('dragHint');

  el.btnPauseLabel.textContent = state.manualPause ? t('resume') : t('pause');
  el.pauseIcon.innerHTML = state.manualPause
    ? '<polygon points="6 4 20 12 6 20 6 4"/>'
    : '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
  el.btnReloadLabel.textContent = t('reload');
  el.btnTrayLabel.textContent = t('hideTray');
  el.btnTray.style.display = hasHost ? 'inline-flex' : 'none';
  el.btnFullscreen.title = t('fullscreen');
  el.btnFullscreen.setAttribute('aria-label', t('fullscreen'));
  el.btnSharePngLabel.textContent = t('sharePng');
  el.btnShareVideoLabel.textContent = t('shareVideo');
  document.getElementById('themes-heading').textContent = t('themesHeading');
  document.getElementById('inspector-title').textContent = t('customize');
  document.getElementById('lbl-system-group').textContent = t('systemGroup');
  el.btnResetLabel.textContent = t('reset');
  document.getElementById('lbl-autopause').textContent = t('autopause');
  document.getElementById('hint-autopause').textContent = t('autopauseHint');
  document.getElementById('lbl-multimon').textContent = t('multimon');
  document.getElementById('hint-multimon').textContent = t('multimonHint')(state.screenCount);
  document.getElementById('lbl-autostart').textContent = t('autostart');
  document.getElementById('hint-autostart').textContent = t('autostartHint');

  el.togAutopause.setAttribute('aria-checked', String(!!state.autopause));
  el.togMultimon.setAttribute('aria-checked', String(!!state.multimonitor));
  el.togAutostart.setAttribute('aria-checked', String(!!state.autostart));

  document.querySelectorAll('.lang-pill button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === state.lang);
  });
}

function renderThemes() {
  if (!state.manifest) return;
  el.themeGrid.innerHTML = '';
  for (const theme of state.manifest.themes) {
    const thumbSrc = THEME_THUMBS[theme.id] || '';
    const titleText = theme.name[state.lang] || theme.name.vi;
    const subText = THEME_SUBTITLES[theme.id]?.[state.lang] || theme.desc[state.lang] || theme.desc.vi;
    const fullDesc = theme.desc[state.lang] || theme.desc.vi;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-card' + (theme.id === state.themeId ? ' active' : '');
    btn.title = fullDesc;
    btn.innerHTML = `
      <div class="theme-thumb">
        <img src="${thumbSrc}" alt="${titleText}" loading="eager" decoding="async" />
        <span class="theme-check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      </div>
      <div class="theme-meta">
        <span class="theme-name">${titleText}</span>
        <span class="theme-desc">${subText}</span>
      </div>
    `;
    btn.addEventListener('click', () => {
      if (state.themeId === theme.id) return;
      state.themeId = theme.id;
      sendToHost({ t: 'theme', id: theme.id });
      renderAll();
      loadPreviewForTheme(theme);
    });
    el.themeGrid.appendChild(btn);
  }
}

function renderParams() {
  const themeObj = getThemeObj();
  if (!themeObj) return;
  const bag = ensureThemeParams(themeObj);
  el.paramsContainer.innerHTML = '';

  for (const group of themeObj.groups || []) {
    const sec = document.createElement('div');
    sec.className = 'param-group';

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = group.name[state.lang] || group.name.vi;
    sec.appendChild(title);

    const card = document.createElement('div');
    card.className = 'group-card';

    for (const param of group.params || []) {
      const curVal = bag[param.key] ?? param.default;
      const row = document.createElement('div');
      row.className = 'param-row';

      const top = document.createElement('div');
      top.className = 'param-top';

      const lbl = document.createElement('label');
      lbl.className = 'param-label';
      lbl.textContent = param.label[state.lang] || param.label.vi;

      const valEl = document.createElement('span');
      valEl.className = 'param-val';
      valEl.textContent = formatValue(param, curVal);

      top.append(lbl, valEl);
      row.appendChild(top);

      if (param.hint) {
        const hint = document.createElement('div');
        hint.className = 'param-hint';
        hint.textContent = param.hint[state.lang] || param.hint.vi;
        row.appendChild(hint);
      }

      if (param.options) {
        const seg = document.createElement('div');
        seg.className = 'seg-control';
        const opts = param.options[state.lang] || param.options.vi;
        seg.style.setProperty('--cols', String(opts.length));
        opts.forEach((optText, idx) => {
          const ob = document.createElement('button');
          ob.type = 'button';
          ob.textContent = optText;
          ob.classList.toggle('active', Math.round(curVal) === idx);
          ob.addEventListener('click', () => {
            bag[param.key] = idx;
            valEl.textContent = formatValue(param, idx);
            seg.querySelectorAll('button').forEach((b, bi) => b.classList.toggle('active', bi === idx));
            sendToHost({ t: 'set', k: param.key, v: idx });
            sendToPreview({ t: 'settings', v: { [param.key]: idx } });
          });
          seg.appendChild(ob);
        });
        row.appendChild(seg);
      } else {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(param.min);
        input.max = String(param.max);
        input.step = String(param.step);
        input.value = String(curVal);
        const setFill = (v) => {
          const pct = ((v - param.min) / Math.max(1e-6, param.max - param.min)) * 100;
          input.style.setProperty('--pct', `${Math.max(0, Math.min(100, pct))}%`);
        };
        setFill(curVal);
        input.addEventListener('input', () => {
          const nv = Number(input.value);
          bag[param.key] = nv;
          valEl.textContent = formatValue(param, nv);
          setFill(nv);
          sendToHost({ t: 'set', k: param.key, v: nv });
          sendToPreview({ t: 'settings', v: { [param.key]: nv } });
        });
        row.appendChild(input);
      }

      card.appendChild(row);
    }
    sec.appendChild(card);
    el.paramsContainer.appendChild(sec);
  }
}

function renderAll() {
  applyStaticCopy();
  renderThemes();
  renderParams();
}

function bindEvents() {
  el.btnPause.addEventListener('click', () => {
    if (hasHost) {
      sendToHost({ t: 'togglePause' });
    } else {
      state.manualPause = !state.manualPause;
      state.paused = state.manualPause;
      applyStaticCopy();
    }
  });

  el.btnReload.addEventListener('click', () => {
    sendToHost({ t: 'reload' });
    const themeObj = getThemeObj();
    if (themeObj) {
      el.previewFrame.src = `${themeObj.page}?preview=1&r=${Date.now()}`;
    }
    showToast(t('reloadToast'));
  });

  el.btnTray.addEventListener('click', () => sendToHost({ t: 'minimizeToTray' }));

  el.btnReset.addEventListener('click', () => {
    const themeObj = getThemeObj();
    if (!themeObj) return;
    delete state.paramsByTheme[themeObj.id];
    const fresh = ensureThemeParams(themeObj);
    sendToHost({ t: 'reset' });
    sendToPreview({ t: 'settings', v: fresh });
    renderParams();
    showToast(t('resetToast'));
  });

  document.querySelectorAll('.lang-pill button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextLang = btn.dataset.lang;
      if (state.lang === nextLang) return;
      state.lang = nextLang;
      sendToHost({ t: 'lang', v: nextLang });
      renderAll();
    });
  });

  el.togAutopause.addEventListener('click', () => {
    state.autopause = !state.autopause;
    sendToHost({ t: 'autopause', v: state.autopause });
    applyStaticCopy();
  });

  el.togMultimon.addEventListener('click', () => {
    state.multimonitor = !state.multimonitor;
    sendToHost({ t: 'multimonitor', v: state.multimonitor });
    applyStaticCopy();
  });

  el.togAutostart.addEventListener('click', () => {
    state.autostart = !state.autostart;
    sendToHost({ t: 'autostart', v: state.autostart });
    applyStaticCopy();
  });

  el.btnFullscreen.addEventListener('click', () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (el.previewShell?.requestFullscreen) {
        el.previewShell.requestFullscreen();
      }
    } catch (err) {
      showToast(t('shareFail')(err.message || String(err)));
    }
  });

  el.btnSharePng.addEventListener('click', () => {
    if (!hasHost) {
      showToast(t('hostRequired'));
      return;
    }
    el.btnSharePng.disabled = true;
    el.btnSharePngLabel.textContent = t('capturing');
    sendToHost({ t: 'shareImage' });
  });

  el.btnShareVideo.addEventListener('click', () => {
    if (!hasHost) {
      showToast(t('hostRequired'));
      return;
    }
    el.btnShareVideo.disabled = true;
    el.btnShareVideoLabel.textContent = t('recording');
    sendToHost({ t: 'shareVideo' });
  });

  window.addEventListener('message', (ev) => {
    let msg = ev.data;
    if (typeof msg === 'string') {
      try { msg = JSON.parse(msg); } catch { return; }
    }
    if (msg && msg.t === 'ready') {
      state.previewReady = true;
      el.previewLoading.classList.add('hidden');
      syncPreviewState();
    }
  });

  if (hasHost) {
    window.chrome.webview.addEventListener('message', (ev) => {
      let msg = ev.data;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch { return; }
      }
      if (!msg || typeof msg !== 'object') return;

      switch (msg.t) {
        case 'init': {
          const themeChanged = msg.theme && msg.theme !== state.themeId;
          if (msg.theme) state.themeId = msg.theme;
          if (msg.lang) state.lang = msg.lang;
          if (msg.paramsByTheme) state.paramsByTheme = msg.paramsByTheme;
          state.autostart = !!msg.autostart;
          state.autopause = msg.autopause !== false;
          state.multimonitor = !!msg.multimonitor;
          state.screenCount = msg.screenCount || 1;
          state.paused = !!msg.paused;
          state.manualPause = !!msg.manualPause;
          if (typeof msg.iconCount === 'number') state.iconCount = msg.iconCount;
          renderAll();
          if (themeChanged || !el.previewFrame.getAttribute('src')) {
            loadPreviewForTheme(getThemeObj());
          } else {
            syncPreviewState();
          }
          break;
        }
        case 'status':
          state.autostart = !!msg.autostart;
          state.autopause = msg.autopause !== false;
          state.multimonitor = !!msg.multimonitor;
          state.screenCount = msg.screenCount || 1;
          state.paused = !!msg.paused;
          state.manualPause = !!msg.manualPause;
          if (typeof msg.iconCount === 'number') state.iconCount = msg.iconCount;
          applyStaticCopy();
          break;

        case 'icons':
          state.latestIconsMsg = msg;
          state.iconCount = Array.isArray(msg.r) ? msg.r.length : 0;
          applyStaticCopy();
          sendToPreview(msg);
          break;

        case 'shareResult':
          el.btnSharePng.disabled = false;
          el.btnShareVideo.disabled = false;
          el.btnSharePngLabel.textContent = t('sharePng');
          el.btnShareVideoLabel.textContent = t('shareVideo');
          if (msg.ok) {
            showToast(t('shareOk')(msg.info), t('openFolder'), () => {
              sendToHost({ t: 'revealFile', path: msg.path });
            });
          } else {
            showToast(t('shareFail')(msg.info || 'Unknown'));
          }
          break;
      }
    });
  }

  el.btnRetry.addEventListener('click', boot);
}

async function boot() {
  el.errorBox.classList.remove('visible');
  try {
    const res = await fetch('./themes.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.manifest = await res.json();
    renderAll();
    loadPreviewForTheme(getThemeObj());
    sendToHost({ t: 'hello' });
  } catch (err) {
    el.errorMsg.textContent = `Không thể nạp themes.json (${err.message})`;
    el.errorBox.classList.add('visible');
  }
}

bindEvents();
boot();
