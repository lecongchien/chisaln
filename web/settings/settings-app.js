/**
 * Settings Window Application Controller
 * Orchestrates theme catalog rendering, compact toggle/slider controls with dependency dimming,
 * zero-flash single-load preview sync, quick time-of-day HUD, Reset+Undo, Light/Dark appearance,
 * and robust bidirectional WebView2 communication with WallpaperCoordinator.
 */
import { COPY, THEME_THUMBS, THEME_SUBTITLES } from './settings-copy.js';
import { estimateRenderResolution, isValidRenderQuality } from '../core/field-engine.js';
import { resolveMoonConfig, parseIsoDate, formatIsoDate, drawMiniMoonCanvas } from '../core/moon-phase.js';

const hasWebView2 = !!(window.chrome && window.chrome.webview);
const hasWebKit = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.scream);
const hasHost = hasWebView2 || hasWebKit;
const APPEARANCE_KEY = 'scream.ui.appearance';
const MOON_THEMES = new Set(['seatrain', 'begonia', 'skyship', 'arctic']);
const darkMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// Dependent controls: auto-dimmed when parent toggle is OFF, or hidden cleanly per camera viewMode
const PARAM_DEPS = {
  sigma: { parent: 'adaptive', min: 0.5 },
  warp: { parent: 'adaptive', min: 0.5 },
  margin: { parent: 'adaptive', min: 0.5 },
  radius: { parent: 'adaptive', min: 0.5 },
  mischief: { parent: 'showFriends', min: 0.5 },
  showBubbles: { parent: 'showFriends', min: 0.5 },
  // Sea Railway exterior-only controls (hidden cleanly in Inside Cabin view)
  clouds: { parent: 'viewMode', equals: 0, hide: true },
  ripple: { parent: 'viewMode', equals: 0, hide: true },
  trainMode: { parent: 'viewMode', equals: 0, hide: true },
  showStation: { parent: 'viewMode', equals: 0, hide: true },
  showIsland: { parent: 'viewMode', equals: 0, hide: true },
  showPassing: { parent: 'viewMode', equals: 0, hide: true },
  // Sea Railway cabin-only controls (hidden cleanly in Exterior view)
  shake: { parent: 'viewMode', equals: 1, hide: true },
  showNoFace: { parent: 'viewMode', equals: 1, hide: true },
  showStraps: { parent: 'viewMode', equals: 1, hide: true },
  showPoles: { parent: 'viewMode', equals: 1, hide: true },
  showDust: { parent: 'viewMode', equals: 1, hide: true },
  showRain: { parent: 'viewMode', equals: 1, hide: true }
};

const state = {
  manifest: null,
  themeId: 'arctic',
  lang: 'vi',
  activeTab: 'scene',
  appearance: loadSavedAppearance(), // 'auto' | 'light' | 'dark'
  moonMode: 'full',                  // 'full' | 'today' | 'birthday'
  moonDate: '2000-08-15',            // 'YYYY-MM-DD'
  paramsByTheme: {},
  paused: false,
  manualPause: false,
  autostart: false,
  autopause: true,
  autoupdate: true,
  renderQuality: 'ultra',
  multimonitor: false,
  platform: hasWebKit ? 'macos' : 'windows',
  appVersion: '1.0.0',
  update: {
    state: 'idle',
    currentVersion: '1.0.0',
    latestVersion: '',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    errorCode: '',
    message: '',
    canInstall: false,
    isDevBuild: false,
    userInitiated: false
  },
  screenCount: 1,
  iconCount: 12,
  latestIconsMsg: null,
  previewStageLoaded: false,
  previewReady: false,
  previewPage: '',
  wallpaperReady: !hasHost,
  pendingPreview: null,
  hostInitialized: false,
  exporting: false,
  lastResetSnapshot: null
};

const el = {
  previewShell: document.getElementById('preview-shell'),
  previewFrame: document.getElementById('preview-frame'),
  previewPoster: document.getElementById('preview-poster'),
  previewLoading: document.getElementById('preview-loading'),
  previewLoadingText: document.getElementById('preview-loading-text'),
  previewPausedOverlay: document.getElementById('preview-paused-overlay'),
  previewPausedText: document.getElementById('preview-paused-text'),
  previewNote: document.getElementById('preview-note'),
  previewBadgeDot: document.getElementById('preview-badge-dot'),
  previewNoteText: document.getElementById('preview-note-text'),
  quickTimeDock: document.getElementById('quick-time-dock'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  themeGrid: document.getElementById('theme-grid'),
  inspectorScroll: document.getElementById('inspector-scroll'),
  paramsContainer: document.getElementById('params-container'),
  tabBtnScene: document.getElementById('tab-btn-scene'),
  tabBtnSystem: document.getElementById('tab-btn-system'),
  tabBtnSystemLabel: document.getElementById('tab-btn-system-label'),
  tabUpdateDot: document.getElementById('tab-update-dot'),
  tabPanelScene: document.getElementById('tab-panel-scene'),
  tabPanelSystem: document.getElementById('tab-panel-system'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  iconCountText: document.getElementById('icon-count-text'),
  btnPause: document.getElementById('btn-pause'),
  btnPauseLabel: document.getElementById('btn-pause-label'),
  pauseIcon: document.getElementById('pause-icon'),
  btnReload: document.getElementById('btn-reload'),
  btnReloadLabel: document.getElementById('btn-reload-label'),
  btnAppearance: document.getElementById('btn-appearance'),
  appearanceIcon: document.getElementById('appearance-icon'),
  appearanceSeg: document.getElementById('appearance-seg'),
  valAppearance: document.getElementById('val-appearance'),
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
  togAutoupdate: document.getElementById('tog-autoupdate'),
  qualitySeg: document.getElementById('quality-seg'),
  valQuality: document.getElementById('val-quality'),
  updateVersion: document.getElementById('update-version'),
  updatePill: document.getElementById('update-pill'),
  updateDetail: document.getElementById('update-detail'),
  btnUpdateAction: document.getElementById('btn-update-action'),
  btnUpdateLabel: document.getElementById('btn-update-label'),
  updateSpinner: document.getElementById('update-spinner'),
  updateProgressWrap: document.getElementById('update-progress-wrap'),
  updateProgressBar: document.getElementById('update-progress-bar'),
  updateProgressFill: document.getElementById('update-progress-fill'),
  errorBox: document.getElementById('error-box'),
  errorMsg: document.getElementById('error-msg'),
  btnRetry: document.getElementById('btn-retry'),
  toast: document.getElementById('toast'),
  toastText: document.getElementById('toast-text'),
  toastAction: document.getElementById('toast-action')
};

function loadSavedAppearance() {
  try {
    const saved = localStorage.getItem(APPEARANCE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch { /* ignore storage restrictions */ }
  return 'auto';
}

function resolveDarkAppearance() {
  if (state.appearance === 'dark') return true;
  if (state.appearance === 'light') return false;
  return !!(darkMedia && darkMedia.matches);
}

function applyAppearance() {
  const isDark = resolveDarkAppearance();
  document.documentElement.setAttribute('data-appearance', isDark ? 'dark' : 'light');
  sendToHost({ t: 'uiTheme', dark: isDark });

  if (el.appearanceIcon) {
    el.appearanceIcon.innerHTML = isDark
      ? '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="4.9" y1="4.9" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="19.1" y2="19.1"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="4.9" y1="19.1" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="19.1" y2="4.9"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  if (el.valAppearance) {
    el.valAppearance.textContent = t('appearanceOpts')[state.appearance] || state.appearance;
  }
  if (el.appearanceSeg) {
    el.appearanceSeg.querySelectorAll('button').forEach((btn) => {
      const active = btn.dataset.appearance === state.appearance;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
      const lbl = t('appearanceOpts')[btn.dataset.appearance];
      if (lbl) btn.textContent = lbl;
    });
  }
}

function setAppearance(mode) {
  state.appearance = mode;
  try { localStorage.setItem(APPEARANCE_KEY, mode); } catch { /* ignore */ }
  applyAppearance();
}

function t(key) {
  return COPY[state.lang]?.[key] ?? COPY.vi[key];
}

function sendToHost(obj) {
  const str = JSON.stringify(obj);
  if (hasWebView2) {
    window.chrome.webview.postMessage(str);
  } else if (hasWebKit) {
    window.webkit.messageHandlers.scream.postMessage(str);
  }
}

function sendToPreview(obj, { allowStage = false } = {}) {
  if (el.previewFrame.contentWindow && (state.previewReady || (allowStage && state.previewStageLoaded))) {
    el.previewFrame.contentWindow.postMessage(JSON.stringify(obj), '*');
  }
}

function setPreviewPoster(themeId, visible) {
  if (!el.previewPoster) return;
  const thumb = THEME_THUMBS[themeId] || '';
  if (thumb && el.previewPoster.getAttribute('src') !== thumb) {
    el.previewPoster.setAttribute('src', thumb);
  }
  el.previewPoster.classList.toggle('hidden', !visible || !thumb);
}

let toastTimer = null;
function showToast(msg, actionLabel = null, onAction = null, durationMs = 4400) {
  el.toastText.textContent = msg;
  if (actionLabel && onAction) {
    el.toastAction.textContent = actionLabel;
    el.toastAction.style.display = 'inline-block';
    el.toastAction.onclick = () => {
      clearTimeout(toastTimer);
      el.toast.classList.remove('visible');
      onAction();
    };
  } else {
    el.toastAction.style.display = 'none';
    el.toastAction.onclick = null;
  }
  el.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('visible'), durationMs);
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

function isBinaryToggleParam(param) {
  return param?.control !== 'segmented' && Array.isArray(param?.options?.vi) && param.options.vi.length === 2;
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

let previewDeferTimer = null;
let previewSpinnerTimer = null;

function buildPreviewQuery(themeObj) {
  const bag = ensureThemeParams(themeObj);
  let q = '';
  if (bag.viewMode !== undefined) q += `&view=${Math.round(Number(bag.viewMode) || 0)}`;
  if (bag.timeMode !== undefined) q += `&time=${Math.round(Number(bag.timeMode) || 0)}`;
  q += `&q=${state.renderQuality || 'ultra'}`;
  return q;
}

function loadPreviewForTheme(themeObj, forceReload = false) {
  if (!themeObj) return;
  clearTimeout(previewDeferTimer);
  previewDeferTimer = null;
  clearTimeout(previewSpinnerTimer);
  previewSpinnerTimer = null;
  state.pendingPreview = null;

  el.previewLoading.classList.remove('is-error');
  el.previewLoadingText.textContent = t('loadingPreview');

  if (!forceReload && state.previewPage === themeObj.page) {
    if (state.previewReady) {
      el.previewLoading.classList.add('hidden');
      setPreviewPoster(themeObj.id, false);
      syncPreviewState();
    } else {
      setPreviewPoster(themeObj.id, true);
    }
    return;
  }

  // Fast path: stage.html is already live -> instant 0ms switch without reloading WebGL2!
  if (!forceReload && state.previewStageLoaded) {
    state.previewPage = themeObj.page;
    state.previewReady = false;
    const bag = ensureThemeParams(themeObj);
    // Keep poster source prepped in case target theme hasn't finished background pre-warming yet
    const thumb = THEME_THUMBS[themeObj.id] || '';
    if (thumb && el.previewPoster && el.previewPoster.getAttribute('src') !== thumb) {
      el.previewPoster.setAttribute('src', thumb);
    }
    sendToPreview({
      t: 'switchTheme',
      id: themeObj.id,
      page: themeObj.page,
      query: buildPreviewQuery(themeObj),
      settings: bag
    }, { allowStage: true });

    // Only show poster + sleek corner indicator if the target theme hasn't finished pre-warming yet
    previewSpinnerTimer = setTimeout(() => {
      previewSpinnerTimer = null;
      if (!state.previewReady) {
        setPreviewPoster(themeObj.id, true);
        el.previewLoading.classList.remove('hidden');
      }
    }, 160);
    return;
  }

  state.previewStageLoaded = false;
  state.previewReady = false;
  state.previewPage = themeObj.page;
  setPreviewPoster(themeObj.id, true);
  el.previewLoading.classList.remove('hidden');
  const q = buildPreviewQuery(themeObj);
  const bust = forceReload ? `&r=${Date.now()}` : '';
  el.previewFrame.src = `stage.html?preview=1&theme=${encodeURIComponent(themeObj.id)}${q}${bust}`;
}

/**
 * Coordinates preview iframe startup with the desktop wallpaper so both do not fight
 * over Chromium's single GPU shader compiler simultaneously. Displays the high-res
 * painted artwork instantly (0ms) while WebGL2 compiles asynchronously in parallel.
 */
function schedulePreviewLoad(themeObj, { forceReload = false, waitDesktopMs = 0 } = {}) {
  if (!themeObj) return;
  if (forceReload || !hasHost || state.wallpaperReady || waitDesktopMs <= 0) {
    loadPreviewForTheme(themeObj, forceReload);
    return;
  }
  clearTimeout(previewDeferTimer);
  state.pendingPreview = themeObj;
  state.previewReady = false;
  setPreviewPoster(themeObj.id, true);
  el.previewLoading.classList.remove('hidden');
  previewDeferTimer = setTimeout(() => {
    previewDeferTimer = null;
    if (state.pendingPreview) {
      const target = state.pendingPreview;
      state.pendingPreview = null;
      loadPreviewForTheme(target, false);
    }
  }, waitDesktopMs);
}

function syncPreviewState() {
  const themeObj = getThemeObj();
  if (!themeObj) return;
  const bag = ensureThemeParams(themeObj);
  sendToPreview({ t: 'settings', v: bag });
  sendToPreview({ t: 'moon', mode: state.moonMode, date: state.moonDate });
  sendToPreview({ t: 'quality', v: state.renderQuality || 'ultra' });
  if (state.latestIconsMsg) {
    sendToPreview(state.latestIconsMsg);
  }
  sendToPreview({ t: 'pause', v: state.manualPause, manual: true });
}

function updateMoonConfig(mode, dateStr) {
  const validMode = (mode === 'today' || mode === 'birthday') ? mode : 'full';
  state.moonMode = validMode;
  if (typeof dateStr === 'string' && dateStr.trim()) {
    const p = parseIsoDate(dateStr);
    state.moonDate = formatIsoDate(p.year, p.month, p.day);
  }
  const msg = { t: 'moon', mode: state.moonMode, date: state.moonDate };
  sendToHost(msg);
  sendToPreview(msg);
}

function syncQuickTimeDock() {
  const themeObj = getThemeObj();
  const hasTimeMode = !!themeObj?.groups?.some((g) => g.params?.some((p) => p.key === 'timeMode'));
  el.quickTimeDock.classList.toggle('hidden', !hasTimeMode);
  if (!hasTimeMode) return;
  const bag = ensureThemeParams(themeObj);
  const curMode = Math.round(bag.timeMode ?? 0);
  const titles = t('timeQuickTitles');
  el.quickTimeDock.querySelectorAll('button[data-time]').forEach((btn) => {
    const idx = Number(btn.dataset.time);
    const active = idx === curMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    if (titles[idx]) {
      btn.title = titles[idx];
      btn.setAttribute('aria-label', titles[idx]);
    }
  });
}

function updateParamValue(key, val, { syncInspector = true } = {}) {
  const themeObj = getThemeObj();
  if (!themeObj) return;
  const bag = ensureThemeParams(themeObj);
  bag[key] = val;
  sendToHost({ t: 'set', k: key, v: val });
  sendToPreview({ t: 'settings', v: { [key]: val } });
  if (key === 'timeMode') {
    syncQuickTimeDock();
    const tip = el.paramsContainer.querySelector('.moon-night-tip');
    if (tip) tip.style.display = (Math.round(val) !== 2 && state.moonMode !== 'full') ? 'flex' : 'none';
  }
  if (syncInspector) {
    refreshDependentStates();
  }
}

function refreshDependentStates() {
  const themeObj = getThemeObj();
  if (!themeObj) return;
  const bag = ensureThemeParams(themeObj);
  for (const [depKey, rule] of Object.entries(PARAM_DEPS)) {
    const row = el.paramsContainer.querySelector(`.param-row[data-param-key="${depKey}"]`);
    if (!row) continue;
    const parentVal = bag[rule.parent];
    let disabled = false;
    if (parentVal !== undefined) {
      if (rule.equals !== undefined) {
        disabled = Math.round(Number(parentVal)) !== rule.equals;
      } else if (rule.min !== undefined) {
        disabled = Number(parentVal) < rule.min;
      }
    }
    if (rule.hide) {
      row.hidden = disabled;
    } else {
      row.hidden = false;
      row.classList.toggle('is-disabled', disabled);
      row.querySelectorAll('input, button').forEach((ctrl) => {
        ctrl.disabled = disabled;
      });
    }
  }
  // Hide any parameter group card whose rows are all currently hidden (e.g. Exterior vs Cabin groups)
  el.paramsContainer.querySelectorAll('.param-group').forEach((grp) => {
    const rows = grp.querySelectorAll('.param-row');
    if (rows.length === 0) return;
    const anyVisible = Array.from(rows).some((r) => !r.hidden);
    grp.hidden = !anyVisible;
  });
}

function switchTab(tabName) {
  state.activeTab = tabName === 'system' ? 'system' : 'scene';
  const isScene = state.activeTab === 'scene';
  el.tabBtnScene.classList.toggle('active', isScene);
  el.tabBtnScene.setAttribute('aria-selected', String(isScene));
  el.tabBtnSystem.classList.toggle('active', !isScene);
  el.tabBtnSystem.setAttribute('aria-selected', String(!isScene));
  el.tabPanelScene.hidden = !isScene;
  el.tabPanelSystem.hidden = isScene;
  el.btnReset.style.visibility = isScene ? 'visible' : 'hidden';
}

function applyStaticCopy() {
  document.documentElement.lang = state.lang;
  document.body.setAttribute('data-theme', state.themeId);

  el.statusDot.classList.toggle('paused', state.paused);
  el.previewBadgeDot.classList.toggle('paused', state.manualPause);
  el.previewPausedOverlay.classList.toggle('visible', state.manualPause);
  el.previewPausedOverlay.setAttribute('aria-hidden', String(!state.manualPause));
  el.previewPausedText.textContent = t('paused');
  el.previewLoadingText.textContent = t('loadingPreview');

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
  el.btnAppearance.title = t('appearanceToggleHint');
  el.btnAppearance.setAttribute('aria-label', t('appearanceToggleHint'));
  const isMac = state.platform === 'macos';
  el.btnTrayLabel.textContent = isMac ? t('hideMenuBar') : t('hideTray');
  el.btnTray.style.display = hasHost ? 'inline-flex' : 'none';
  el.btnFullscreen.title = t('fullscreen');
  el.btnFullscreen.setAttribute('aria-label', t('fullscreen'));
  if (!state.exporting) {
    el.btnSharePngLabel.textContent = t('sharePng');
    el.btnShareVideoLabel.textContent = t('shareVideo');
  }

  el.tabBtnScene.textContent = t('tabScene');
  if (el.tabBtnSystemLabel) {
    el.tabBtnSystemLabel.textContent = t('tabSystem');
  }
  document.getElementById('themes-heading').textContent = t('themesHeading');
  document.getElementById('lbl-system-group').textContent = t('systemGroup');
  document.getElementById('lbl-update-group').textContent = t('updateGroup');
  document.getElementById('lbl-autoupdate').textContent = t('autoupdate');
  document.getElementById('hint-autoupdate').textContent = t('autoupdateHint');
  document.getElementById('lbl-appearance-group').textContent = t('appearanceGroup');
  document.getElementById('lbl-appearance').textContent = t('appearanceLabel');
  document.getElementById('hint-appearance').textContent = t('appearanceHint');
  document.getElementById('lbl-shortcuts-group').textContent = t('shortcutsGroup');
  document.getElementById('lbl-sc-night').textContent = t('scNight');
  document.getElementById('lbl-sc-pause').textContent = t('scPause');
  document.getElementById('lbl-sc-settings').textContent = t('scSettings');

  el.btnResetLabel.textContent = t('reset');
  document.getElementById('lbl-autopause').textContent = t('autopause');
  document.getElementById('hint-autopause').textContent = t('autopauseHint');
  document.getElementById('lbl-multimon').textContent = t('multimon');
  document.getElementById('hint-multimon').textContent = t('multimonHint')(state.screenCount);
  document.getElementById('lbl-autostart').textContent = isMac ? t('autostartMac') : t('autostart');
  document.getElementById('hint-autostart').textContent = isMac ? t('autostartMacHint') : t('autostartHint');
  const lblQ = document.getElementById('lbl-quality');
  const hintQ = document.getElementById('hint-quality');
  if (lblQ) lblQ.textContent = t('qualityLabel');
  if (hintQ) hintQ.textContent = t('qualityHint');
  if (el.valQuality) {
    const qLabel = t('qualityOpts')[state.renderQuality] || state.renderQuality;
    const screenW = (typeof window !== 'undefined' && window.screen?.width) || 1920;
    const screenH = (typeof window !== 'undefined' && window.screen?.height) || 1080;
    const est = estimateRenderResolution(screenW, screenH, state.renderQuality, false);
    el.valQuality.textContent = `${qLabel} · ${est.width}×${est.height}`;
  }
  if (el.qualitySeg) {
    el.qualitySeg.querySelectorAll('button[data-quality]').forEach((btn) => {
      const active = btn.dataset.quality === state.renderQuality;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
      const lbl = t('qualityOpts')[btn.dataset.quality];
      if (lbl) btn.textContent = lbl;
    });
  }

  el.togAutopause.setAttribute('aria-checked', String(!!state.autopause));
  el.togMultimon.setAttribute('aria-checked', String(!!state.multimonitor));
  el.togAutostart.setAttribute('aria-checked', String(!!state.autostart));
  if (el.togAutoupdate) {
    el.togAutoupdate.setAttribute('aria-checked', String(!!state.autoupdate));
  }

  document.querySelectorAll('.lang-pill button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === state.lang);
  });

  applyAppearance();
  syncQuickTimeDock();
  renderUpdateSection();
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function renderUpdateSection() {
  if (!el.updateVersion || !el.btnUpdateAction) return;
  const u = state.update;
  const curVer = u.currentVersion || state.appVersion || '1.0.0';
  const latestVer = u.latestVersion || '';
  const st = u.state || 'idle';

  el.updateVersion.textContent = `Scream v${curVer}`;

  // Tab indicator dot when an update is pending or actively downloading/installing
  const showDot = st === 'available' || st === 'readyToInstall' || st === 'downloading' || st === 'installing';
  if (el.tabUpdateDot) {
    el.tabUpdateDot.classList.toggle('visible', showDot);
  }

  // Pill badge
  el.updatePill.className = 'update-pill';
  if (st === 'upToDate') {
    el.updatePill.hidden = false;
    el.updatePill.classList.add('is-ok');
    el.updatePill.textContent = t('updateUpToDatePill');
  } else if ((st === 'available' || st === 'readyToInstall' || st === 'downloading' || st === 'installing') && latestVer) {
    el.updatePill.hidden = false;
    el.updatePill.classList.add('is-available');
    el.updatePill.textContent = t('updateAvailablePill')(latestVer);
  } else if (st === 'error') {
    el.updatePill.hidden = false;
    el.updatePill.classList.add('is-error');
    el.updatePill.textContent = t('updateErrorPill');
  } else {
    el.updatePill.hidden = true;
    el.updatePill.textContent = '';
  }

  // Progress bar
  const isDownloading = st === 'downloading';
  const isInstalling = st === 'installing';
  el.updateProgressWrap.hidden = !(isDownloading || isInstalling);
  const pct = isInstalling ? 100 : Math.max(0, Math.min(100, Number(u.progress) || 0));
  el.updateProgressFill.style.width = `${pct}%`;
  el.updateProgressBar.setAttribute('aria-valuenow', String(pct));

  // Detail line + Action button
  const busy = st === 'checking' || isDownloading || isInstalling;
  el.btnUpdateAction.disabled = busy;
  el.updateSpinner.hidden = !busy;
  const canInstallNow = (st === 'available' || st === 'readyToInstall') && !!latestVer && !u.isDevBuild;
  el.btnUpdateAction.classList.toggle('btn-primary', canInstallNow);

  switch (st) {
    case 'checking':
      el.updateDetail.textContent = t('updateCheckingDetail');
      el.btnUpdateLabel.textContent = t('updateCheckingBtn');
      break;
    case 'upToDate':
      el.updateDetail.textContent = t('updateUpToDateDetail');
      el.btnUpdateLabel.textContent = t('updateCheckBtn');
      break;
    case 'available':
      el.updateDetail.textContent = u.isDevBuild
        ? t('updateDevReadyDetail')(latestVer)
        : t('updateAvailableDetail')(latestVer);
      el.btnUpdateLabel.textContent = u.isDevBuild
        ? t('updateCheckBtn')
        : t('updateInstallBtn')(latestVer);
      break;
    case 'downloading':
      el.updateDetail.textContent = t('updateDownloadingDetail')(
        latestVer,
        formatBytes(u.downloadedBytes),
        formatBytes(u.totalBytes),
        pct
      );
      el.btnUpdateLabel.textContent = t('updateDownloadingBtn')(pct);
      break;
    case 'readyToInstall':
      el.updateDetail.textContent = u.isDevBuild
        ? t('updateDevReadyDetail')(latestVer)
        : t('updateReadyDetail')(latestVer);
      el.btnUpdateLabel.textContent = u.isDevBuild
        ? t('updateCheckBtn')
        : t('updateInstallBtn')(latestVer);
      break;
    case 'installing':
      el.updateDetail.textContent = t('updateInstallingDetail')(latestVer);
      el.btnUpdateLabel.textContent = t('updateInstallingBtn');
      break;
    case 'error':
      el.updateDetail.textContent = t('updateErrorDetail')(u.message || 'Unknown');
      el.btnUpdateLabel.textContent = t('updateRetryBtn');
      break;
    default:
      el.updateDetail.textContent = t('updateIdleDetail');
      el.btnUpdateLabel.textContent = t('updateCheckBtn');
      break;
  }
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
    btn.setAttribute('aria-pressed', String(theme.id === state.themeId));
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
      state.lastResetSnapshot = null;
      sendToHost({ t: 'theme', id: theme.id });
      renderAll({ preserveScroll: false });
      loadPreviewForTheme(theme, false);
    });
    el.themeGrid.appendChild(btn);
  }
}

function renderParams({ preserveScroll = true } = {}) {
  const themeObj = getThemeObj();
  if (!themeObj) return;
  const savedScroll = preserveScroll && el.inspectorScroll ? el.inspectorScroll.scrollTop : 0;
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
      const ctrlId = `param-${themeObj.id}-${param.key}`;
      const labelText = param.label[state.lang] || param.label.vi;
      const hintText = param.hint ? (param.hint[state.lang] || param.hint.vi) : '';

      if (isBinaryToggleParam(param)) {
        // Compact 1-row native spring toggle for 2-state On/Off & Show/Hide params!
        const row = document.createElement('div');
        row.className = 'switch-row param-row';
        row.dataset.paramKey = param.key;

        const copyWrap = document.createElement('span');
        copyWrap.className = 'switch-row-copy';
        const lbl = document.createElement('label');
        lbl.className = 'switch-title';
        lbl.id = `${ctrlId}-lbl`;
        lbl.htmlFor = ctrlId;
        lbl.textContent = labelText;
        copyWrap.appendChild(lbl);

        if (hintText) {
          const small = document.createElement('small');
          small.textContent = hintText;
          copyWrap.appendChild(small);
        }

        const tog = document.createElement('button');
        tog.type = 'button';
        tog.id = ctrlId;
        tog.className = 'toggle';
        tog.setAttribute('role', 'switch');
        tog.setAttribute('aria-labelledby', lbl.id);
        tog.setAttribute('aria-checked', String(Math.round(curVal) >= 1));
        tog.addEventListener('click', () => {
          const next = Math.round(bag[param.key] ?? param.default) >= 1 ? 0 : 1;
          tog.setAttribute('aria-checked', String(next === 1));
          updateParamValue(param.key, next);
        });

        row.append(copyWrap, tog);
        card.appendChild(row);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'param-row';
      row.dataset.paramKey = param.key;

      const top = document.createElement('div');
      top.className = 'param-top';

      const lbl = document.createElement('label');
      lbl.className = 'param-label';
      lbl.id = `${ctrlId}-lbl`;
      lbl.textContent = labelText;

      const valEl = document.createElement('span');
      valEl.className = 'param-val';
      valEl.textContent = formatValue(param, curVal);

      top.append(lbl, valEl);
      row.appendChild(top);

      if (hintText) {
        const hint = document.createElement('div');
        hint.className = 'param-hint';
        hint.textContent = hintText;
        row.appendChild(hint);
      }

      if (param.options) {
        const seg = document.createElement('div');
        seg.className = 'seg-control';
        seg.setAttribute('role', 'radiogroup');
        seg.setAttribute('aria-labelledby', lbl.id);
        const opts = param.options[state.lang] || param.options.vi;
        seg.style.setProperty('--cols', String(opts.length));
        opts.forEach((optText, idx) => {
          const ob = document.createElement('button');
          ob.type = 'button';
          ob.textContent = optText;
          ob.title = optText;
          const isActive = Math.round(curVal) === idx;
          ob.classList.toggle('active', isActive);
          ob.setAttribute('aria-pressed', String(isActive));
          ob.addEventListener('click', () => {
            valEl.textContent = formatValue(param, idx);
            seg.querySelectorAll('button').forEach((b, bi) => {
              b.classList.toggle('active', bi === idx);
              b.setAttribute('aria-pressed', String(bi === idx));
            });
            updateParamValue(param.key, idx);
          });
          seg.appendChild(ob);
        });
        row.appendChild(seg);
      } else {
        lbl.htmlFor = ctrlId;
        const input = document.createElement('input');
        input.id = ctrlId;
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
          valEl.textContent = formatValue(param, nv);
          setFill(nv);
          updateParamValue(param.key, nv, { syncInspector: false });
        });
        row.appendChild(input);
      }

      card.appendChild(row);
    }
    sec.appendChild(card);
    el.paramsContainer.appendChild(sec);
  }

  if (MOON_THEMES.has(themeObj.id)) {
    el.paramsContainer.appendChild(buildMoonPhaseGroup(bag));
  }

  refreshDependentStates();
  if (el.inspectorScroll) {
    el.inspectorScroll.scrollTop = preserveScroll ? savedScroll : 0;
  }
}

function buildMoonPhaseGroup(bag) {
  const sec = document.createElement('section');
  sec.className = 'param-group';

  const title = document.createElement('div');
  title.className = 'group-title';
  title.textContent = t('moonGroup');
  sec.appendChild(title);

  const card = document.createElement('div');
  card.className = 'group-card';

  const row = document.createElement('div');
  row.className = 'param-row';

  const top = document.createElement('div');
  top.className = 'param-top';
  const lbl = document.createElement('span');
  lbl.className = 'param-label';
  lbl.textContent = t('moonLabel');
  const valEl = document.createElement('span');
  valEl.className = 'param-val';
  top.appendChild(lbl);
  top.appendChild(valEl);
  row.appendChild(top);

  const hint = document.createElement('div');
  hint.className = 'param-hint';
  hint.textContent = t('moonHint');
  row.appendChild(hint);

  // 3-mode Segmented Control: Full Moon | Today | Birth Date
  const modes = ['full', 'today', 'birthday'];
  const optsCopy = t('moonOpts');
  const seg = document.createElement('div');
  seg.className = 'seg-control';
  seg.setAttribute('role', 'radiogroup');
  seg.style.setProperty('--cols', '3');

  // Live Mini 3D Moon Preview Strip
  const previewStrip = document.createElement('div');
  previewStrip.className = 'moon-preview-strip';
  const miniCanvas = document.createElement('canvas');
  miniCanvas.className = 'moon-mini-canvas';
  miniCanvas.width = 88;
  miniCanvas.height = 88;
  const infoBox = document.createElement('div');
  infoBox.className = 'moon-info';
  const phaseNameEl = document.createElement('div');
  phaseNameEl.className = 'moon-phase-name';
  const phaseMetaEl = document.createElement('div');
  phaseMetaEl.className = 'moon-phase-meta';
  infoBox.appendChild(phaseNameEl);
  infoBox.appendChild(phaseMetaEl);
  previewStrip.appendChild(miniCanvas);
  previewStrip.appendChild(infoBox);

  // Vietnamese-friendly DD / MM / YYYY birth-date picker (zero US locale ambiguity!)
  const dateGrid = document.createElement('div');
  dateGrid.className = 'moon-date-grid';

  const parsed = parseIsoDate(state.moonDate);

  const dayField = document.createElement('div');
  dayField.className = 'moon-date-field';
  const dayLbl = document.createElement('label');
  dayLbl.htmlFor = 'moon-day';
  dayLbl.textContent = t('moonDay');
  const daySel = document.createElement('select');
  daySel.id = 'moon-day';
  dayField.appendChild(dayLbl);
  dayField.appendChild(daySel);

  const monField = document.createElement('div');
  monField.className = 'moon-date-field';
  const monLbl = document.createElement('label');
  monLbl.htmlFor = 'moon-month';
  monLbl.textContent = t('moonMonth');
  const monSel = document.createElement('select');
  monSel.id = 'moon-month';
  for (let m = 1; m <= 12; m++) {
    const o = document.createElement('option');
    o.value = String(m);
    o.textContent = String(m).padStart(2, '0');
    monSel.appendChild(o);
  }
  monSel.value = String(parsed.month);
  monField.appendChild(monLbl);
  monField.appendChild(monSel);

  const yrField = document.createElement('div');
  yrField.className = 'moon-date-field';
  const yrLbl = document.createElement('label');
  yrLbl.htmlFor = 'moon-year';
  yrLbl.textContent = t('moonYear');
  const yrInput = document.createElement('input');
  yrInput.id = 'moon-year';
  yrInput.type = 'number';
  yrInput.min = '1900';
  yrInput.max = '2100';
  yrInput.step = '1';
  yrInput.value = String(parsed.year);
  yrField.appendChild(yrLbl);
  yrField.appendChild(yrInput);

  dateGrid.appendChild(dayField);
  dateGrid.appendChild(monField);
  dateGrid.appendChild(yrField);

  const rebuildDays = (y, m, keepDay) => {
    const maxD = new Date(y, m, 0).getDate();
    const clamped = Math.max(1, Math.min(maxD, keepDay));
    daySel.innerHTML = '';
    for (let d = 1; d <= maxD; d++) {
      const o = document.createElement('option');
      o.value = String(d);
      o.textContent = String(d).padStart(2, '0');
      daySel.appendChild(o);
    }
    daySel.value = String(clamped);
    return clamped;
  };
  rebuildDays(parsed.year, parsed.month, parsed.day);

  // Subtle helper button when current scene is not in Night mode
  const nightTip = document.createElement('div');
  nightTip.className = 'moon-night-tip';
  const tipText = document.createElement('span');
  tipText.textContent = t('moonNightTip');
  const tipBtn = document.createElement('button');
  tipBtn.type = 'button';
  tipBtn.textContent = t('timeQuickTitles')[2];
  tipBtn.addEventListener('click', () => {
    updateParamValue('timeMode', 2);
    renderParams({ preserveScroll: true });
  });
  nightTip.appendChild(tipText);
  nightTip.appendChild(tipBtn);

  const refreshMoonUi = () => {
    const info = resolveMoonConfig({ mode: state.moonMode, date: state.moonDate });
    valEl.textContent = t('moonPctFmt')(info.pct);
    phaseNameEl.textContent = state.lang === 'en' ? info.nameEn : info.nameVi;
    const dateTag = info.year
      ? `${String(info.day).padStart(2, '0')}/${String(info.month).padStart(2, '0')}/${info.year} · `
      : '';
    phaseMetaEl.textContent = `${dateTag}${t('moonPctFmt')(info.pct)} · ${t('moonAgeFmt')(info.ageDays)}`;
    drawMiniMoonCanvas(miniCanvas, info.phase);
    dateGrid.style.display = state.moonMode === 'birthday' ? 'grid' : 'none';
    const isNightNow = Math.round(bag.timeMode ?? 0) === 2;
    nightTip.style.display = (!isNightNow && state.moonMode !== 'full') ? 'flex' : 'none';
  };

  modes.forEach((mKey) => {
    const ob = document.createElement('button');
    ob.type = 'button';
    ob.textContent = optsCopy[mKey];
    const active = state.moonMode === mKey;
    ob.classList.toggle('active', active);
    ob.setAttribute('aria-pressed', String(active));
    ob.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((b, bi) => {
        const isOn = modes[bi] === mKey;
        b.classList.toggle('active', isOn);
        b.setAttribute('aria-pressed', String(isOn));
      });
      updateMoonConfig(mKey, state.moonDate);
      refreshMoonUi();
    });
    seg.appendChild(ob);
  });

  const commitDateInputs = () => {
    const rawY = Number(yrInput.value);
    if (!Number.isFinite(rawY) || rawY < 1900 || rawY > 2100) return;
    const y = Math.round(rawY);
    const m = Number(monSel.value) || 1;
    const d = rebuildDays(y, m, Number(daySel.value) || 1);
    updateMoonConfig('birthday', formatIsoDate(y, m, d));
    refreshMoonUi();
  };

  daySel.addEventListener('change', commitDateInputs);
  monSel.addEventListener('change', commitDateInputs);
  yrInput.addEventListener('input', commitDateInputs);
  yrInput.addEventListener('change', () => {
    const clampedY = Math.max(1900, Math.min(2100, Math.round(Number(yrInput.value) || 2000)));
    yrInput.value = String(clampedY);
    commitDateInputs();
  });

  row.appendChild(seg);
  row.appendChild(previewStrip);
  row.appendChild(dateGrid);
  row.appendChild(nightTip);
  card.appendChild(row);
  sec.appendChild(card);

  refreshMoonUi();
  return sec;
}

function renderAll({ preserveScroll = true } = {}) {
  applyStaticCopy();
  renderThemes();
  renderParams({ preserveScroll });
}

let shareWatchdog = null;
function setExportingState(kind) {
  state.exporting = !!kind;
  el.btnSharePng.disabled = state.exporting;
  el.btnShareVideo.disabled = state.exporting;
  el.btnSharePngLabel.textContent = kind === 'image' ? t('capturing') : t('sharePng');
  el.btnShareVideoLabel.textContent = kind === 'video' ? t('recording') : t('shareVideo');
  clearTimeout(shareWatchdog);
  if (state.exporting) {
    shareWatchdog = setTimeout(() => {
      if (!state.exporting) return;
      setExportingState(null);
      showToast(t('shareTimeout'));
    }, 12000);
  }
}

function bindEvents() {
  el.btnPause.addEventListener('click', () => {
    if (hasHost) {
      sendToHost({ t: 'togglePause' });
    } else {
      state.manualPause = !state.manualPause;
      state.paused = state.manualPause;
      applyStaticCopy();
      sendToPreview({ t: 'pause', v: state.manualPause, manual: true });
    }
  });

  el.btnReload.addEventListener('click', () => {
    sendToHost({ t: 'reload' });
    const themeObj = getThemeObj();
    if (themeObj) {
      loadPreviewForTheme(themeObj, true);
    }
    showToast(t('reloadToast'));
  });

  el.btnAppearance.addEventListener('click', () => {
    setAppearance(resolveDarkAppearance() ? 'light' : 'dark');
  });

  el.appearanceSeg.querySelectorAll('button[data-appearance]').forEach((btn) => {
    btn.addEventListener('click', () => setAppearance(btn.dataset.appearance));
  });

  if (darkMedia && typeof darkMedia.addEventListener === 'function') {
    darkMedia.addEventListener('change', () => {
      if (state.appearance === 'auto') applyAppearance();
    });
  }

  el.btnTray.addEventListener('click', () => sendToHost({ t: 'minimizeToTray' }));

  el.tabBtnScene.addEventListener('click', () => switchTab('scene'));
  el.tabBtnSystem.addEventListener('click', () => switchTab('system'));

  // Quick Time-of-Day Pill inside Preview HUD
  el.quickTimeDock.querySelectorAll('button[data-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.time);
      updateParamValue('timeMode', idx);
      // Sync inspector timeMode segmented control without resetting scroll position
      const row = el.paramsContainer.querySelector('.param-row[data-param-key="timeMode"]');
      if (row) {
        const themeObj = getThemeObj();
        const param = themeObj?.groups?.flatMap((g) => g.params || []).find((p) => p.key === 'timeMode');
        const valEl = row.querySelector('.param-val');
        if (valEl && param) valEl.textContent = formatValue(param, idx);
        row.querySelectorAll('.seg-control button').forEach((b, bi) => {
          b.classList.toggle('active', bi === idx);
          b.setAttribute('aria-pressed', String(bi === idx));
        });
      }
    });
  });

  // Reset with 1-Click Undo Toast!
  el.btnReset.addEventListener('click', () => {
    const themeObj = getThemeObj();
    if (!themeObj) return;
    const prevBag = { ...ensureThemeParams(themeObj) };
    state.lastResetSnapshot = { themeId: themeObj.id, params: prevBag };

    delete state.paramsByTheme[themeObj.id];
    const fresh = ensureThemeParams(themeObj);
    sendToHost({ t: 'reset' });
    sendToPreview({ t: 'settings', v: fresh });
    renderParams({ preserveScroll: true });
    syncQuickTimeDock();

    showToast(t('resetToast'), t('undo'), () => {
      if (!state.lastResetSnapshot || state.lastResetSnapshot.themeId !== state.themeId) return;
      const restore = { ...state.lastResetSnapshot.params };
      state.paramsByTheme[state.themeId] = restore;
      for (const [k, v] of Object.entries(restore)) {
        sendToHost({ t: 'set', k, v: Number(v) });
      }
      sendToPreview({ t: 'settings', v: restore });
      renderParams({ preserveScroll: true });
      syncQuickTimeDock();
      showToast(t('undoToast'), null, null, 2800);
    }, 6000);
  });

  document.querySelectorAll('.lang-pill button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextLang = btn.dataset.lang;
      if (state.lang === nextLang) return;
      state.lang = nextLang;
      sendToHost({ t: 'lang', v: nextLang });
      renderAll({ preserveScroll: true });
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

  if (el.togAutoupdate) {
    el.togAutoupdate.addEventListener('click', () => {
      state.autoupdate = !state.autoupdate;
      sendToHost({ t: 'autoupdate', v: state.autoupdate });
      applyStaticCopy();
    });
  }

  if (el.qualitySeg) {
    el.qualitySeg.querySelectorAll('button[data-quality]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextQ = btn.dataset.quality;
        if (!isValidRenderQuality(nextQ)) return;
        if (state.renderQuality === nextQ) return;
        state.renderQuality = nextQ;
        sendToHost({ t: 'quality', v: nextQ });
        sendToPreview({ t: 'quality', v: nextQ });
        applyStaticCopy();
      });
    });
  }

  if (el.btnUpdateAction) {
    el.btnUpdateAction.addEventListener('click', () => {
      if (!hasHost) {
        showToast(t('updateHostOnly'));
        return;
      }
      const st = state.update.state;
      if ((st === 'available' || st === 'readyToInstall') && !state.update.isDevBuild) {
        sendToHost({ t: 'installUpdate' });
      } else {
        sendToHost({ t: 'checkUpdate' });
      }
    });
  }

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
    if (state.exporting) return;
    setExportingState('image');
    sendToHost({ t: 'shareImage' });
  });

  el.btnShareVideo.addEventListener('click', () => {
    if (!hasHost) {
      showToast(t('hostRequired'));
      return;
    }
    if (state.exporting) return;
    setExportingState('video');
    sendToHost({ t: 'shareVideo' });
  });

  window.addEventListener('message', (ev) => {
    let msg = ev.data;
    if (typeof msg === 'string') {
      try { msg = JSON.parse(msg); } catch { return; }
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'stageReady') {
      state.previewStageLoaded = true;
      const curTheme = getThemeObj();
      if (curTheme && msg.theme && msg.theme !== curTheme.id) {
        sendToPreview({
          t: 'switchTheme',
          id: curTheme.id,
          page: curTheme.page,
          query: buildPreviewQuery(curTheme),
          settings: ensureThemeParams(curTheme)
        }, { allowStage: true });
      }
    } else if (msg.t === 'ready') {
      // Ignore stale ready events from a theme the user already clicked away from
      if (msg.theme && state.themeId && msg.theme !== state.themeId) return;
      clearTimeout(previewSpinnerTimer);
      previewSpinnerTimer = null;
      state.previewStageLoaded = true;
      state.previewReady = true;
      el.previewLoading.classList.remove('is-error');
      el.previewLoading.classList.add('hidden');
      setPreviewPoster(state.themeId, false);
      syncPreviewState();
    } else if (msg.t === 'sceneError') {
      clearTimeout(previewSpinnerTimer);
      previewSpinnerTimer = null;
      el.previewLoading.classList.add('is-error');
      el.previewLoading.classList.remove('hidden');
      el.previewLoadingText.textContent = `Lỗi WebGL2: ${msg.msg || 'Unknown'}`;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!state.previewReady) return;
    sendToPreview({ t: 'pause', v: document.hidden || state.manualPause, manual: true });
  });

  if (hasHost) {
    const handleHostMessage = (rawData) => {
      let msg = rawData;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch { return; }
      }
      if (!msg || typeof msg !== 'object') return;

      switch (msg.t) {
        case 'previewVis':
          if (state.previewReady) {
            sendToPreview({ t: 'pause', v: !msg.v || state.manualPause, manual: true });
          }
          break;

        case 'wallpaperReady': {
          state.wallpaperReady = true;
          if (state.pendingPreview) {
            const target = state.pendingPreview;
            state.pendingPreview = null;
            loadPreviewForTheme(target, false);
          }
          break;
        }

        case 'init': {
          const prevTheme = state.themeId;
          state.hostInitialized = true;
          if (msg.platform) state.platform = msg.platform;
          if (msg.appVersion) {
            state.appVersion = msg.appVersion;
            state.update.currentVersion = msg.appVersion;
          }
          if (msg.theme) state.themeId = msg.theme;
          if (msg.lang) state.lang = msg.lang;
          if (msg.moonMode) state.moonMode = msg.moonMode;
          if (msg.moonDate) state.moonDate = msg.moonDate;
          if (isValidRenderQuality(msg.renderQuality)) {
            state.renderQuality = msg.renderQuality;
          }
          if (msg.paramsByTheme) state.paramsByTheme = msg.paramsByTheme;
          state.autostart = !!msg.autostart;
          state.autopause = msg.autopause !== false;
          state.autoupdate = msg.autoupdate !== false;
          state.multimonitor = !!msg.multimonitor;
          state.screenCount = msg.screenCount || 1;
          state.paused = !!msg.paused;
          state.manualPause = !!msg.manualPause;
          state.wallpaperReady = msg.wallpaperReady !== false;
          if (typeof msg.iconCount === 'number') state.iconCount = msg.iconCount;

          renderAll({ preserveScroll: prevTheme === state.themeId });
          const themeObj = getThemeObj();
          if (themeObj && state.previewPage !== themeObj.page) {
            schedulePreviewLoad(themeObj, { waitDesktopMs: state.wallpaperReady ? 0 : 250 });
          } else {
            syncPreviewState();
          }
          break;
        }
        case 'status':
          state.autostart = !!msg.autostart;
          state.autopause = msg.autopause !== false;
          if (typeof msg.autoupdate === 'boolean') state.autoupdate = msg.autoupdate;
          state.multimonitor = !!msg.multimonitor;
          state.screenCount = msg.screenCount || 1;
          state.paused = !!msg.paused;
          state.manualPause = !!msg.manualPause;
          if (typeof msg.iconCount === 'number') state.iconCount = msg.iconCount;
          applyStaticCopy();
          sendToPreview({ t: 'pause', v: state.manualPause, manual: true });
          break;

        case 'updateState': {
          const prevState = state.update.state;
          state.update = {
            state: msg.state || 'idle',
            currentVersion: msg.currentVersion || state.appVersion,
            latestVersion: msg.latestVersion || '',
            progress: typeof msg.progress === 'number' ? msg.progress : 0,
            downloadedBytes: Number(msg.downloadedBytes) || 0,
            totalBytes: Number(msg.totalBytes) || 0,
            errorCode: msg.errorCode || '',
            message: msg.message || '',
            canInstall: !!msg.canInstall,
            isDevBuild: !!msg.isDevBuild,
            userInitiated: !!msg.userInitiated
          };
          if (typeof msg.autoupdate === 'boolean') {
            state.autoupdate = msg.autoupdate;
            if (el.togAutoupdate) {
              el.togAutoupdate.setAttribute('aria-checked', String(state.autoupdate));
            }
          }
          renderUpdateSection();
          if (msg.userInitiated && prevState !== state.update.state) {
            if (state.update.state === 'upToDate') {
              showToast(t('updateToastUpToDate')(state.update.currentVersion), null, null, 3400);
            } else if (state.update.state === 'available' && state.update.latestVersion) {
              showToast(t('updateToastAvailable')(state.update.latestVersion), null, null, 3800);
            } else if (state.update.state === 'error' && state.update.message) {
              showToast(t('updateToastError')(state.update.message), null, null, 4600);
            }
          }
          break;
        }

        case 'openTab':
          if (msg.tab === 'system' || msg.tab === 'scene') {
            switchTab(msg.tab);
          }
          break;

        case 'icons':
          state.latestIconsMsg = msg;
          state.iconCount = Array.isArray(msg.r) ? msg.r.length : 0;
          applyStaticCopy();
          sendToPreview(msg);
          break;

        case 'shareResult':
          setExportingState(null);
          if (msg.ok) {
            showToast(t('shareOk')(msg.info), t('openFolder'), () => {
              sendToHost({ t: 'revealFile', path: msg.path });
            });
          } else {
            showToast(t('shareFail')(msg.info || 'Unknown'));
          }
          break;
      }
    };

    if (hasWebView2) {
      window.chrome.webview.addEventListener('message', (ev) => handleHostMessage(ev.data));
    }
    if (hasWebKit) {
      window.__screamReceive = handleHostMessage;
    }
  }

  el.btnRetry.addEventListener('click', boot);
}

async function boot() {
  el.errorBox.classList.remove('visible');
  applyAppearance();
  try {
    const res = await fetch('./themes.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.manifest = await res.json();

    if (hasHost) {
      // Wait for C# 'init' (~5ms) before setting poster or WebGL preview -> ZERO wrong-theme flash!
      renderThemes();
      applyStaticCopy();
      sendToHost({ t: 'hello' });
      setTimeout(() => {
        if (!state.hostInitialized && !state.previewPage) {
          renderAll({ preserveScroll: false });
          loadPreviewForTheme(getThemeObj());
        }
      }, 650);
    } else {
      renderAll({ preserveScroll: false });
      loadPreviewForTheme(getThemeObj());
    }
  } catch (err) {
    el.errorMsg.textContent = `Không thể nạp themes.json (${err.message})`;
    el.errorBox.classList.add('visible');
  }
}

bindEvents();
boot();
