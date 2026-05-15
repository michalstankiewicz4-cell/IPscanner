function selectIcon(el) {
  const lbl = document.getElementById('iconLabel');
  const img = document.getElementById('iconImg');
  lbl.classList.add('icon-selected');
  img.classList.add('icon-img-selected');
  setTimeout(()=>{ lbl.classList.remove('icon-selected'); img.classList.remove('icon-img-selected'); }, 1200);
}

const APP_NAME = 'NetRecon IP Auditor';
const APP_VERSION = '1.6.4';

function getAppDisplayName() {
  return `${APP_NAME} v${APP_VERSION}`;
}

function applyAppVersionLabels() {
  const appTitle = document.getElementById('appTitle');
  if (appTitle) appTitle.textContent = getAppDisplayName();
  document.title = getAppDisplayName();
}

function openNotepad() {
  document.getElementById('notepadWin').style.display = 'block';
  bringToFront(document.getElementById('notepadWin'));
  document.getElementById('notepadText').value =
`================================================================
  ${getAppDisplayName()}
  by Michał Stankiewicz
================================================================

  Tel. / BLIK:  797 486 355

  Jeżeli podoba Ci się to co robię i chcesz wesprzeć
  projekt — każda złotówka motywuje do kolejnych ficzerów!

  BLIK → 797 486 355   💙  Dziękuję!

  LICENCJA (MIT) — Polski

  Niniejszym udziela się bezpłatnie każdemu, kto uzyska
  kopię tego oprogramowania i powiązanych plików dokumentacji
  (dalej „Oprogramowanie"), pozwolenia na korzystanie
  z Oprogramowania bez ograniczeń, w tym bez ograniczeń
  prawa do używania, kopiowania, modyfikowania, łączenia,
  publikowania, dystrybuowania, udzielania podlicencji
  i/lub sprzedaży kopii Oprogramowania, a także zezwalania
  na to osobom, którym Oprogramowanie jest dostarczane,
  pod następującymi warunkami:

  Powyższa nota autorska oraz niniejsze zezwolenie muszą
  zostać dołączone do wszystkich kopii lub istotnych części
  Oprogramowania.

  OPROGRAMOWANIE JEST DOSTARCZANE „TAKIM, JAKIE JEST",
  BEZ JAKIEJKOLWIEK GWARANCJI, WYRAŹNEJ LUB DOROZUMIANEJ,
  W TYM MIĘDZY INNYMI GWARANCJI PRZYDATNOŚCI HANDLOWEJ,
  PRZYDATNOŚCI DO OKREŚLONEGO CELU I NIENARUSZALNOŚCI.
  W ŻADNYM WYPADKU AUTORZY LUB WŁAŚCICIELE PRAW AUTORSKICH
  NIE PONOSZĄ ODPOWIEDZIALNOŚCI ZA JAKIEKOLWIEK ROSZCZENIA,
  SZKODY LUB INNĄ ODPOWIEDZIALNOŚĆ, CZY TO W RAMACH UMOWY,
  DELIKTU CZY W INNY SPOSÓB, WYNIKAJĄCĄ Z OPROGRAMOWANIA
  LUB KORZYSTANIA Z NIEGO.

  LICENSE (MIT) — English

  Permission is hereby granted, free of charge, to any
  person obtaining a copy of this software and associated
  documentation files (the "Software"), to deal in the
  Software without restriction, including without limitation
  the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the
  Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice
  shall be included in all copies or substantial portions
  of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
  ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
  TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
  PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
  SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
  IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
  DEALINGS IN THE SOFTWARE.

  If you enjoy what I'm building — BLIK is welcome! 🙏
  797 486 355

================================================================`;
}

  function closeNotepad() {
    document.getElementById('notepadWin').style.display = 'none';
  }

  let _windowZCounter = 1200;

  function bringToFront(target) {
    if (!target) return;

    const topZ = ++_windowZCounter;

    const dialogPanel = target.classList?.contains('dlg95') ? target : target.closest?.('.dlg95');
    if (dialogPanel) {
      const overlay = dialogPanel.closest('.dlg-overlay');
      if (overlay) {
        overlay.style.zIndex = String(topZ);
        dialogPanel.style.zIndex = String(topZ + 1);
        return;
      }
      dialogPanel.style.zIndex = String(topZ);
      return;
    }

    if (target.id === 'dlgTrace' || target.closest?.('#dlgTrace')) {
      const overlay = document.getElementById('dlgTraceOverlay');
      const dlgTrace = document.getElementById('dlgTrace');
      if (overlay) overlay.style.zIndex = String(topZ);
      if (dlgTrace) dlgTrace.style.zIndex = String(topZ + 1);
      return;
    }

    if (target.classList?.contains('dlg-overlay')) {
      target.style.zIndex = String(topZ);
      return;
    }

    if (target.style) {
      target.style.zIndex = String(topZ);
    }
  }

  window.bringToFront = bringToFront;

  function initWindowZStacking() {
    const floatingWindowIds = [
      'notepadWin',
      'cmdWin',
      'speedWin',
      'protoWin',
      'macroFolderWin',
      'globeWin',
      'topoWin',
      'wifiRadarWin',
      'btDetectorWin',
      'snifferWin',
      'gnssWin',
      'lteWin',
      'imgMetaWin',
      'dlgScanCountry',
      'dlgTrace'
    ];

    floatingWindowIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.zstackBound === '1') return;
      el.dataset.zstackBound = '1';
      el.addEventListener('pointerdown', () => bringToFront(el));
    });

    document.querySelectorAll('.dlg95').forEach((dlg) => {
      if (dlg.dataset.zstackBound === '1') return;
      dlg.dataset.zstackBound = '1';
      dlg.addEventListener('pointerdown', () => bringToFront(dlg));
    });
  }

  function makeWindowDraggable(winEl, handleEl) {
    if (!winEl || !handleEl || handleEl.dataset.dragBound === '1') return;
    handleEl.dataset.dragBound = '1';
    handleEl.classList.add('cursor-move');

    let dragging = false;
    let activePointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    const stopDragging = () => {
      dragging = false;
      activePointerId = null;
      document.body.classList.remove('dragging');
    };

    handleEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      if (e.target.closest('.title-btn, .titlebar-btns, button, input, select, textarea, a, label')) return;

      const rect = winEl.getBoundingClientRect();
      dragging = true;
      activePointerId = e.pointerId;
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      // Centered dialogs use transform translate; convert to explicit coords before dragging.
      winEl.style.transform = 'none';
      if (winEl.classList?.contains('dlg95')) {
        // Keep dialog width stable while dragging; content should wrap instead of resizing the panel.
        winEl.style.width = rect.width + 'px';
        winEl.style.maxWidth = '94vw';
      }
      winEl.style.left = rect.left + 'px';
      winEl.style.top = rect.top + 'px';

      document.body.classList.add('dragging');
      handleEl.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== activePointerId) return;

      const maxLeft = Math.max(0, window.innerWidth - winEl.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - 28);
      const nextLeft = Math.min(Math.max(0, e.clientX - offsetX), maxLeft);
      const nextTop = Math.min(Math.max(0, e.clientY - offsetY), maxTop);

      winEl.style.left = nextLeft + 'px';
      winEl.style.top = nextTop + 'px';
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerId === activePointerId) stopDragging();
    });

    window.addEventListener('pointercancel', (e) => {
      if (e.pointerId === activePointerId) stopDragging();
    });
  }

  function initAllDialogDragging() {
    makeWindowDraggable(
      document.getElementById('notepadWin'),
      document.querySelector('#notepadWin > div:first-child')
    );

    document.querySelectorAll('.dlg95').forEach((dlg) => {
      makeWindowDraggable(dlg, dlg.querySelector('.dlg-title'));
    });

    // Handle all tool-win-shell windows (Speed, Proto, WiFi Radar, etc.)
    document.querySelectorAll('.tool-win-shell').forEach((toolWin) => {
      const titlebar = toolWin.querySelector('.titlebar');
      if (titlebar) {
        makeWindowDraggable(toolWin, titlebar);
      }
    });

    makeWindowDraggable(
      document.getElementById('dlgScanCountry'),
      document.querySelector('#dlgScanCountry > .titlebar')
    );

    makeWindowDraggable(
      document.getElementById('dlgTrace'),
      document.querySelector('#dlgTrace > .titlebar')
    );
  }

  function closeMainWindow() {
    if (_toolMode) {
      closeCurrentWindowImmediate();
      return;
    }
    requestAppCloseConfirmation();
  }

  let _closeConfirmInProgress = false;

  function requestAppCloseConfirmation() {
    if (_closeConfirmInProgress) return;
    _closeConfirmInProgress = true;

    try {
      const ok = window.confirm(t('closeConfirm'));
      if (!ok) return;

      invokeWindowAction('window_close').then(success => {
        if (!success && !_isTauriDesktop) window.close();
      });
    } finally {
      _closeConfirmInProgress = false;
    }
  }

  function closeCurrentWindowImmediate() {
    invokeWindowAction('window_close').then(success => {
      if (!success) window.close();
    });
  }

  function getTauriCurrentWindow() {
    const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow
      ?? window.__TAURI__?.webviewWindow?.getCurrentWindow
      ?? null;
    if (!getCurrentWindow) return null;
    try { return getCurrentWindow(); } catch { return null; }
  }

  async function invokeWindowAction(commandName) {
    if (_tauriInvoke) {
      try {
        await _tauriInvoke(commandName);
        return true;
      } catch {}
    }
    return false;
  }

  async function minimizeMainWindow() {
    await invokeWindowAction('window_minimize');
  }

  async function toggleMaximizeMainWindow() {
    await invokeWindowAction('window_toggle_maximize');
  }

  async function startMainWindowDrag() {
    await invokeWindowAction('window_start_dragging');
  }

  function openMainWindow() {
    const win = document.getElementById('mainWin');
    if (!win) return;
    win.style.display = 'block';
  }
const WINDOW_CONTEXT_ALLOW_SELECTOR = [
  '#resultBody .result-row',
  '#macroFolderList .macro-row',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
].join(', ');

const WINDOW_CONTEXT_BLOCK_SELECTOR = [
  '.titlebar',
  '.dlg-title',
  '.titlebar-btns',
  '.title-btn',
  '.menubar',
  '.menu-item',
  '.menu-dropdown',
  '.menu-dd-item',
  '.menu-dd-sep',
  '.enrich-popup',
  '.enrich-popup-bar',
].join(', ');

const WINDOW_ROOT_SELECTOR = [
  '.retro-win',
  '.dlg95',
  '#notepadWin',
  '#cmdWin',
  '#speedWin',
  '#protoWin',
  '#macroFolderWin',
  '#globeWin',
  '#topoWin',
  '#dlgScanCountry',
  '#snifferWin',
  '#gnssWin',
  '#lteWin',
  '#dlgTrace',
  '.enrich-popup',
].join(', ');

function shouldBlockWindowRightClick(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest(WINDOW_CONTEXT_ALLOW_SELECTOR)) return false;
  if (target.closest(WINDOW_CONTEXT_BLOCK_SELECTOR)) return true;

  const root = target.closest(WINDOW_ROOT_SELECTOR);
  if (!root) return false;

  // Block everything inside window roots except editable form controls.
  return !target.closest('input, textarea, select, option, [contenteditable="true"]');
}

function initWindowRightClickGuards() {
  if (document.body.dataset.rightClickGuardBound === '1') return;
  document.body.dataset.rightClickGuardBound = '1';

  const blockRightClick = (e) => {
    if (e.button !== 2) return;
    if (!shouldBlockWindowRightClick(e.target)) return;
    // preventDefault stops text-selection on PPM hold; no stopPropagation
    // so bringToFront listeners still receive the pointerdown.
    e.preventDefault();
  };

  document.addEventListener('pointerdown', blockRightClick, true);
  document.addEventListener('mousedown', blockRightClick, true);
  document.addEventListener('contextmenu', (e) => {
    if (!shouldBlockWindowRightClick(e.target)) return;
    e.preventDefault();
  }, true);
}


document.addEventListener('DOMContentLoaded', () => {
  applyAppVersionLabels();

  const closeBtn = document.getElementById('mainCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeMainWindow);

  const minBtn = document.getElementById('mainMinBtn');
  if (minBtn) minBtn.addEventListener('click', minimizeMainWindow);

  const maxBtn = document.getElementById('mainMaxBtn');
  if (maxBtn) maxBtn.addEventListener('click', toggleMaximizeMainWindow);

  const mainTitlebar = document.querySelector('#mainWin > .titlebar');
  if (mainTitlebar) {
    mainTitlebar.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      if (e.target.closest('.titlebar-btns')) return;
      e.preventDefault();
      startMainWindowDrag();
    });
  }

  initWindowRightClickGuards();
  initAllDialogDragging();
  initWindowZStacking();

  // Auto-resize window width to fit all toolbar buttons (min 900px)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    const needed = toolbar.scrollWidth;
    const minW = 900;
    if (needed > window.innerWidth) {
      const newW = Math.max(needed, minW);
      try {
        const tWin = window.__TAURI__?.window?.getCurrentWindow?.();
        if (tWin) tWin.setSize(new window.__TAURI__.dpi.LogicalSize(newW, window.innerHeight));
      } catch (_) {}
    }
  }));
});

// ══════════════════════════════════════════════════
//  i18n
// ══════════════════════════════════════════════════
let lang = localStorage.getItem('netrecon_lang') || 'en';

// Language strings loaded from js/lang-en.js and js/lang-pl.js
const STRINGS = { en: window.LANG_EN, pl: window.LANG_PL };

// ── Cross-window sync (lang + skin) via BroadcastChannel ──
const _syncChannel = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('netrecon-sync')
  : null;

if (_syncChannel) {
  _syncChannel.onmessage = (e) => {
    const { type, value } = e.data;
    if (type === 'lang' && STRINGS[value]) {
      lang = value;
      applyLang(false);
    }
    if (type === 'skin') {
      setBodySkinClass(value, false);
      localStorage.setItem(UI_SKIN_KEY, value);
    }
  };
}

function t(key, ...args) {
  const s = STRINGS[lang];
  const v = s[key] ?? STRINGS['en'][key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

function applyLang(broadcast = true) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const v = t(key);
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const v = t(key);
    if (typeof v === 'string') el.placeholder = v;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const v = t(key);
    if (typeof v === 'string') el.title = v;
  });
  const subnetInput = document.getElementById('topoSubnetFilter');
  const pingInput = document.getElementById('topoPingMax');
  if (subnetInput) subnetInput.placeholder = t('filterSubnetLabel');
  if (pingInput) pingInput.placeholder = t('filterPingPlaceholder');
  if (typeof refreshTopologyFilterOptions === 'function') refreshTopologyFilterOptions();
  // Notify clippy about lang change
  if (typeof window.clippySetLang === 'function') window.clippySetLang(lang);
  // Persist
  localStorage.setItem('netrecon_lang', lang);
  // Broadcast to other windows
  if (broadcast && _syncChannel) _syncChannel.postMessage({ type: 'lang', value: lang });
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function loadScanDefaults() {
  try {
    const raw = localStorage.getItem('netrecon_scan_defaults');
    if (!raw) return { threads: 24, delayMs: 0, delayMsPerPort: 0, portScanMode: 'parallel', chunkSize: 64 };
    const obj = JSON.parse(raw);
    return {
      threads: clampInt(obj.threads, 2, 64, 24),
      delayMs: clampInt(obj.delayMs, 0, 5000, 0),
      delayMsPerPort: clampInt(obj.delayMsPerPort, 0, 1000, 0),
      portScanMode: (obj.portScanMode === 'sequential' ? 'sequential' : 'parallel'),
      chunkSize: clampInt(obj.chunkSize, 10, 500, 64)
    };
  } catch {
    return { threads: 24, delayMs: 0, delayMsPerPort: 0, portScanMode: 'parallel', chunkSize: 64 };
  }
}

function saveScanDefaults(threads, delayMs, delayMsPerPort, portScanMode, chunkSize) {
  const safe = {
    threads: clampInt(threads, 2, 64, 24),
    delayMs: clampInt(delayMs, 0, 5000, 0),
    delayMsPerPort: clampInt(delayMsPerPort, 0, 1000, 0),
    portScanMode: (portScanMode === 'sequential' ? 'sequential' : 'parallel'),
    chunkSize: clampInt(chunkSize, 10, 500, 64)
  };
  localStorage.setItem('netrecon_scan_defaults', JSON.stringify(safe));
  return safe;
}

function applyScanDefaultsToMainInputs(cfg) {
  document.getElementById('concNum').value = String(clampInt(cfg.threads, 2, 64, 24));
  document.getElementById('delayMs').value = String(clampInt(cfg.delayMs, 0, 5000, 0));
}

function factoryResetApp() {
  const confirmText = t('confirmFactoryReset');
  if (!window.confirm(confirmText)) return;

  stopRequested = true;
  try { activeControllers.forEach(controller => controller.abort()); } catch (_) {}

  try { localStorage.clear(); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}

  setTimeout(() => window.location.reload(), 50);
}

// ── Dialog overlay helpers ──
function openOverlay(id) {
  document.getElementById(id).classList.add('open');
  bringToFront(document.querySelector(`#${id} .dlg95`));
}
function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
}
function closeAllMenus() {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
}

// ── Language dialog ──
let _prevLang = lang;
function openLangDlg() {
  _prevLang = lang;
  document.getElementById('radioEn').checked = (lang === 'en');
  document.getElementById('radioPl').checked = (lang === 'pl');
  openOverlay('dlgOverlay');
}
function closeLangDlg() { closeOverlay('dlgOverlay'); }
function cancelLangDlg() {
  lang = _prevLang;
  applyLang();
  closeLangDlg();
}
document.querySelectorAll('input[name=dlgLang]').forEach(el => {
  el.addEventListener('change', () => {
    lang = document.querySelector('input[name=dlgLang]:checked').value;
    applyLang();
  });
});
document.getElementById('dlgOk').addEventListener('click', closeLangDlg);
document.getElementById('dlgCancel').addEventListener('click', cancelLangDlg);

// ── Defaults dialog ──
function openDefaultsDlg() {
  const cfg = loadScanDefaults();
  document.getElementById('dlgDefaultThreads').value = String(cfg.threads);
  document.getElementById('dlgDefaultDelay').value = String(cfg.delayMs);
  document.getElementById('dlgDefaultDelayPerPort').value = String(cfg.delayMsPerPort);
  document.getElementById('dlgDefaultChunkSize').value = String(cfg.chunkSize);
  document.getElementById('radioParallel').checked = (cfg.portScanMode === 'parallel');
  document.getElementById('radioSequential').checked = (cfg.portScanMode === 'sequential');
  updatePortDelayInputState();
  openOverlay('dlgDefaultsOverlay');
}

function updatePortDelayInputState() {
  const delayInput = document.getElementById('dlgDefaultDelayPerPort');
  delayInput.disabled = document.getElementById('radioParallel').checked;
}

function closeDefaultsDlg() { closeOverlay('dlgDefaultsOverlay'); }

// ── Versions dialog ──
function openVersionsDlg() { openOverlay('dlgVersionsOverlay'); }
function closeVersionsDlg() { closeOverlay('dlgVersionsOverlay'); }
function persistDefaultsFromDialog() {
  const portScanMode = document.getElementById('radioSequential').checked ? 'sequential' : 'parallel';
  const cfg = saveScanDefaults(
    document.getElementById('dlgDefaultThreads').value,
    document.getElementById('dlgDefaultDelay').value,
    document.getElementById('dlgDefaultDelayPerPort').value,
    portScanMode,
    document.getElementById('dlgDefaultChunkSize').value
  );
  applyScanDefaultsToMainInputs(cfg);
}
document.getElementById('dlgDefaultThreads').addEventListener('input', persistDefaultsFromDialog);
document.getElementById('dlgDefaultDelay').addEventListener('input', persistDefaultsFromDialog);
document.getElementById('dlgDefaultDelayPerPort').addEventListener('input', persistDefaultsFromDialog);
document.getElementById('dlgDefaultChunkSize').addEventListener('input', persistDefaultsFromDialog);
document.getElementById('radioParallel').addEventListener('change', () => { updatePortDelayInputState(); persistDefaultsFromDialog(); });
document.getElementById('radioSequential').addEventListener('change', () => { updatePortDelayInputState(); persistDefaultsFromDialog(); });
document.getElementById('dlgDefaultsReset').addEventListener('click', () => {
  const cfg = saveScanDefaults(24, 0, 0, 'parallel', 64);
  applyScanDefaultsToMainInputs(cfg);
  openDefaultsDlg();
});
document.getElementById('dlgDefaultsOk').addEventListener('click', () => {
  persistDefaultsFromDialog();
  closeDefaultsDlg();
});
document.getElementById('dlgDefaultsCancel').addEventListener('click', closeDefaultsDlg);

// ── Menu bar ──
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const wasOpen = item.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) item.classList.add('open');
  });
});
document.addEventListener('click', closeAllMenus);
document.getElementById('menuLang').addEventListener('click', () => { closeAllMenus(); openLangDlg(); });
document.getElementById('menuDefaults').addEventListener('click', () => { closeAllMenus(); openDefaultsDlg(); });
document.getElementById('menuVersions').addEventListener('click', () => { closeAllMenus(); openVersionsDlg(); });
document.getElementById('menuDownload').addEventListener('click', () => {
  closeAllMenus();
  openInBrowser('https://github.com/michalstankiewicz4-cell/IPscanner/releases');
});
document.getElementById('menuAbout').addEventListener('click', () => { closeAllMenus(); openNotepad(); });
document.getElementById('menuClippy').addEventListener('click', () => {
  closeAllMenus();
  if (typeof window.clippyShow === 'function') {
    window.clippyShow();
  } else {
    setStatus('Clippy init error: clippyShow unavailable.', 'err');
  }
});
document.getElementById('menuToolTopology').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnTopologyToolbar')?.click(); });
document.getElementById('menuToolGlobe').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnGlobe')?.click(); });
document.getElementById('menuToolProto').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnProtoToolbar')?.click(); });
document.getElementById('menuToolMacro').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnMacroToolbar')?.click(); });
document.getElementById('menuToolSpeed').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnSpeedToolbar')?.click(); });
document.getElementById('menuToolConsole').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnCmdConsole')?.click(); });
document.getElementById('menuToolWifiRadar').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnWifiRadarToolbar')?.click(); });
document.getElementById('menuToolBtDetector').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnBtDetectorToolbar')?.click(); });
document.getElementById('menuToolGnss').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnGnssToolbar')?.click(); });
document.getElementById('menuToolLte').addEventListener('click', () => { closeAllMenus(); window.openLteDlg?.(); });
document.getElementById('menuToolSniffer').addEventListener('click', () => { closeAllMenus(); document.getElementById('btnSnifferToolbar')?.click(); });
document.getElementById('menuToolImgMeta').addEventListener('click', () => { closeAllMenus(); if (typeof openImgMetaDlg === 'function') openImgMetaDlg(); else if (typeof window.openImgMetaDlg === 'function') window.openImgMetaDlg(); });
document.getElementById('dlgVersionsCloseBtn').addEventListener('click', closeVersionsDlg);

function bindClickToGlobal(id, fnName) {
  const el = document.getElementById(id);
  const fn = window[fnName];
  if (el && typeof fn === 'function') el.addEventListener('click', fn);
}

bindClickToGlobal('btnScanSpeed', 'openDefaultsDlg');
bindClickToGlobal('btnNotepadClose', 'closeNotepad');
bindClickToGlobal('btnCountriesCloseX', 'closeCountriesDlg');
bindClickToGlobal('btnCountriesCancel', 'closeCountriesDlg');
bindClickToGlobal('btnPresetsCloseX', 'closePresetsDlg');
bindClickToGlobal('btnPresetsCancel', 'closePresetsDlg');
bindClickToGlobal('btnLangCloseX', 'closeLangDlg');
bindClickToGlobal('btnDefaultsCloseX', 'closeDefaultsDlg');
bindClickToGlobal('btnScanWatchClose', 'closeScanWatchDlg');
bindClickToGlobal('btnWifiDetectorClose', 'closeWifiDetectorDlg');
bindClickToGlobal('btnVersionsCloseX', 'closeVersionsDlg');
bindClickToGlobal('btnCustomizeCancelX', 'cancelCustomizeDlg');
bindClickToGlobal('btnCustomizeOk', 'closeCustomizeDlg');
bindClickToGlobal('btnCustomizeCancel', 'cancelCustomizeDlg');
bindClickToGlobal('btnGlobeClose', 'closeGlobe');
bindClickToGlobal('btnTopoClose', 'closeTopo');
bindClickToGlobal('btnScanCountryCloseX', 'closeScanCountryDlg');
bindClickToGlobal('btnScanCountryNo', 'closeScanCountryDlg');
bindClickToGlobal('btnTraceCloseX', 'closeTraceDlg');
bindClickToGlobal('btnTraceCancel', 'closeTraceDlg');

// ══════════════════════════════════════════════════
//  CUSTOMIZATION
// ══════════════════════════════════════════════════
const TOOLBAR_BTNS_CFG = [
  { chk: 'chkBtnGlobe',   id: 'btnGlobe',        key: 'tb_globe' },
  { chk: 'chkBtnConsole', id: 'btnCmdConsole',   key: 'tb_console' },
  { chk: 'chkBtnMacro',   id: 'btnMacroToolbar', key: 'tb_macro' },
  { chk: 'chkBtnSpeed',      id: 'btnSpeedToolbar',    key: 'tb_speed' },
  { chk: 'chkBtnProto',      id: 'btnProtoToolbar',    key: 'tb_proto' },
  { chk: 'chkBtnTopology',   id: 'btnTopologyToolbar', key: 'tb_topology' },
];
const UI_SKIN_KEY = 'ui_skin';
const UI_SKINS = ['classic', 'glass', 'workbench', 'purple-dark', 'black-flat', 'retrogray'];

function getSavedSkin() {
  const savedSkin = localStorage.getItem(UI_SKIN_KEY);
  return UI_SKINS.includes(savedSkin) ? savedSkin : 'classic';
}

function setBodySkinClass(skin, broadcast = true) {
  document.body.classList.remove('skin-classic', 'skin-glass', 'skin-workbench', 'skin-purple-dark', 'skin-black-flat', 'skin-retrogray');
  document.body.classList.add(`skin-${skin}`);
  // Broadcast to other windows
  if (broadcast && _syncChannel) _syncChannel.postMessage({ type: 'skin', value: skin });
}

function applySkinCustomization() {
  setBodySkinClass(getSavedSkin());
}

function applyToolbarCustomization() {
  TOOLBAR_BTNS_CFG.forEach(({ id, key }) => {
    const hidden = localStorage.getItem(key) === '0';
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('initially-hidden', hidden);
  });
}

let _prevSkin = getSavedSkin();
function openCustomizeDlg() {
  _prevSkin = getSavedSkin();
  TOOLBAR_BTNS_CFG.forEach(({ chk, key }) => {
    const el = document.getElementById(chk);
    if (el) el.checked = localStorage.getItem(key) !== '0';
  });

  const activeSkin = getSavedSkin();
  const skinClassic = document.getElementById('skinClassic');
  const skinGlass = document.getElementById('skinGlass');
  const skinWorkbench = document.getElementById('skinWorkbench');
  const skinPurpleDark = document.getElementById('skinPurpleDark');
  const skinBlackFlat = document.getElementById('skinBlackFlat');
  const skinRetrogray = document.getElementById('skinRetrogray');
  if (skinClassic) skinClassic.checked = activeSkin === 'classic';
  if (skinGlass) skinGlass.checked = activeSkin === 'glass';
  if (skinWorkbench) skinWorkbench.checked = activeSkin === 'workbench';
  if (skinPurpleDark) skinPurpleDark.checked = activeSkin === 'purple-dark';
  if (skinBlackFlat) skinBlackFlat.checked = activeSkin === 'black-flat';
  if (skinRetrogray) skinRetrogray.checked = activeSkin === 'retrogray';

  openOverlay('dlgCustomizeOverlay');
}
function cancelCustomizeDlg() {
  setBodySkinClass(_prevSkin);
  closeOverlay('dlgCustomizeOverlay');
}
function closeCustomizeDlg() {
  TOOLBAR_BTNS_CFG.forEach(({ chk, key }) => {
    const el = document.getElementById(chk);
    if (el) localStorage.setItem(key, el.checked ? '1' : '0');
  });

  const selectedSkin = document.querySelector('input[name="uiSkin"]:checked')?.value;
  localStorage.setItem(UI_SKIN_KEY, UI_SKINS.includes(selectedSkin) ? selectedSkin : 'classic');

  applyToolbarCustomization();
  applySkinCustomization();
  closeOverlay('dlgCustomizeOverlay');
}

document.getElementById('menuCustomize').addEventListener('click', () => { closeAllMenus(); openCustomizeDlg(); });

document.querySelectorAll('input[name="uiSkin"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const skin = document.querySelector('input[name="uiSkin"]:checked')?.value;
    setBodySkinClass(UI_SKINS.includes(skin) ? skin : 'classic');
  });
});

document.getElementById('btnMacroToolbar').addEventListener('click', openMacroFolder);
document.getElementById('btnSpeedToolbar').addEventListener('click', openSpeedWindow);
document.getElementById('btnProtoToolbar').addEventListener('click', openProtoWindow);
document.getElementById('btnWifiRadarToolbar').addEventListener('click', () => window.openWifiRadarDlg?.());
document.getElementById('btnBtDetectorToolbar').addEventListener('click', () => window.openBtDetectorDlg?.());
document.getElementById('btnGnssToolbar').addEventListener('click', () => window.openGnssDlg?.());
document.getElementById('btnSnifferToolbar').addEventListener('click', () => window.openSnifferDlg?.());

applyToolbarCustomization();
applySkinCustomization();

// ══════════════════════════════════════════════════
//  PORT PRESETS
// ══════════════════════════════════════════════════
const DEFAULT_PRESETS = [
  { name: '📹 Cameras',         ports: '80, 8080, 8081, 443, 554, 9000, 37777, 34567' },
  { name: '🖨️ Printers',        ports: '80, 443, 631, 9100, 8080' },
  { name: '📁 Folders / HTTP',  ports: '80, 8080, 8888, 21, 3000, 8000, 5000' },
  { name: '🌐 Routers',         ports: '80, 443, 8080, 8443, 10000' },
  { name: '💾 NAS / Servers',   ports: '80, 443, 5000, 5001, 8080, 8006, 9090' },
  { name: '🔍 All ports',       ports: '80, 443, 8080, 8443, 8081, 554, 9000, 37777, 34567, 631, 9100, 5000, 5001, 8006, 21, 3000, 8000, 8888, 9090, 10000' },
];

function loadPresets() {
  try {
    const saved = localStorage.getItem('netrecon_presets');
    return saved ? JSON.parse(saved) : DEFAULT_PRESETS.map(p => ({...p}));
  } catch { return DEFAULT_PRESETS.map(p => ({...p})); }
}
function savePresetsStorage(arr) {
  localStorage.setItem('netrecon_presets', JSON.stringify(arr));
}

let presets = loadPresets();
let activePresetIdx = +( localStorage.getItem('netrecon_active_preset') || 0 );
if (activePresetIdx >= presets.length) activePresetIdx = 0;
var portsOverride = null;

window.__setPortsOverride = (value) => { portsOverride = value; };
window.__clearPortsOverride = () => { portsOverride = null; };

function getActivePorts() {
  if (portsOverride !== null) return portsOverride;
  const preset = presets[activePresetIdx];
  if (!preset) return [];
  return preset.ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 65535);
}

function findAllPortsPresetIndex() {
  if (!presets.length) return -1;
  let bestIdx = 0;
  let bestCount = -1;
  presets.forEach((p, i) => {
    const ports = (p?.ports || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 65535);
    const name = (p?.name || '').toLowerCase();
    const scoreBonus = (name.includes('all') || name.includes('wszyst')) ? 1000 : 0;
    const score = ports.length + scoreBonus;
    if (score > bestCount) {
      bestCount = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function activatePresetByIndex(idx) {
  if (idx < 0 || idx >= presets.length) return;
  activePresetIdx = idx;
  localStorage.setItem('netrecon_active_preset', activePresetIdx);
  const sel = document.getElementById('presetSelect');
  if (sel) sel.value = String(activePresetIdx);
  updatePortsDisplay();
}

function buildPresetSelect() {
  const sel = document.getElementById('presetSelect');
  sel.innerHTML = '';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name;
    if (i === activePresetIdx) opt.selected = true;
    sel.appendChild(opt);
  });
  updatePortsDisplay();
}

function updatePortsDisplay() {
  const ports = getActivePorts();
  const activePorts = document.getElementById('activePorts');
  if (activePorts) activePorts.textContent = ports.join(', ');
}

document.getElementById('presetSelect').addEventListener('change', function() {
  activePresetIdx = +this.value;
  localStorage.setItem('netrecon_active_preset', activePresetIdx);
  updatePortsDisplay();
});

buildPresetSelect();

// ── Presets Dialog ──
let dlgSelectedPreset = -1;

function openPresetsDlg() {
  dlgSelectedPreset = activePresetIdx;
  renderPresetListBox();
  openOverlay('dlgPresetsOverlay');
}
function closePresetsDlg() { closeOverlay('dlgPresetsOverlay'); }

function renderPresetListBox() {
  const box = document.getElementById('presetListBox');
  box.innerHTML = '';
  presets.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'preset-row' + (i === dlgSelectedPreset ? ' selected' : '');
    row.textContent = p.name;
    row.addEventListener('click', () => {
      dlgSelectedPreset = i;
      renderPresetListBox();
      loadPresetIntoEditor(i);
    });
    box.appendChild(row);
  });
  const editBox = document.getElementById('presetEditBox');
  editBox.classList.toggle('disabled', dlgSelectedPreset < 0);
}

function loadPresetIntoEditor(i) {
  const p = presets[i];
  document.getElementById('presetNameInput').value  = p.name;
  document.getElementById('presetPortsInput').value = p.ports;
  document.getElementById('presetEditBox').classList.remove('disabled');
}

document.getElementById('btnPresetAdd').addEventListener('click', () => {
  presets.push({ name: 'New Preset', ports: '80, 443, 8080' });
  dlgSelectedPreset = presets.length - 1;
  renderPresetListBox();
  loadPresetIntoEditor(dlgSelectedPreset);
  document.getElementById('presetNameInput').focus();
  document.getElementById('presetNameInput').select();
});

document.getElementById('btnPresetDel').addEventListener('click', () => {
  if (dlgSelectedPreset < 0 || presets.length <= 1) return;
  presets.splice(dlgSelectedPreset, 1);
  dlgSelectedPreset = Math.min(dlgSelectedPreset, presets.length - 1);
  renderPresetListBox();
  if (dlgSelectedPreset >= 0) loadPresetIntoEditor(dlgSelectedPreset);
});

document.getElementById('btnPresetUp').addEventListener('click', () => {
  if (dlgSelectedPreset <= 0) return;
  [presets[dlgSelectedPreset-1], presets[dlgSelectedPreset]] =
  [presets[dlgSelectedPreset], presets[dlgSelectedPreset-1]];
  dlgSelectedPreset--;
  renderPresetListBox();
  loadPresetIntoEditor(dlgSelectedPreset);
});

document.getElementById('btnPresetDown').addEventListener('click', () => {
  if (dlgSelectedPreset < 0 || dlgSelectedPreset >= presets.length - 1) return;
  [presets[dlgSelectedPreset+1], presets[dlgSelectedPreset]] =
  [presets[dlgSelectedPreset], presets[dlgSelectedPreset+1]];
  dlgSelectedPreset++;
  renderPresetListBox();
  loadPresetIntoEditor(dlgSelectedPreset);
});

document.getElementById('btnPresetSave').addEventListener('click', () => {
  if (dlgSelectedPreset < 0) return;
  const name  = document.getElementById('presetNameInput').value.trim();
  const ports = document.getElementById('presetPortsInput').value.trim();
  if (!name) return;
  presets[dlgSelectedPreset] = { name, ports };
  renderPresetListBox();
});

document.getElementById('dlgPresetsOk').addEventListener('click', () => {
  // Auto-save any unsaved edits
  if (dlgSelectedPreset >= 0) {
    const name  = document.getElementById('presetNameInput').value.trim();
    const ports = document.getElementById('presetPortsInput').value.trim();
    if (name) presets[dlgSelectedPreset] = { name, ports };
  }
  savePresetsStorage(presets);
  if (activePresetIdx >= presets.length) activePresetIdx = 0;
  buildPresetSelect();
  closePresetsDlg();
});

document.getElementById('menuPresets').addEventListener('click', () => { closeAllMenus(); openPresetsDlg(); });

// ══════════════════════════════════════════════════
//  IP INPUT — auto-jump between octets
// ══════════════════════════════════════════════════
['f0','f1','f2','f3','t0','t1','t2','t3'].forEach((id, idx) => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    el.value = el.value.replace(/[^0-9]/g,'');
    if (+el.value > 255) el.value = '255';
    if (el.value.length === 3) {
      const ids = ['f0','f1','f2','f3','t0','t1','t2','t3'];
      const next = document.getElementById(ids[idx+1]);
      if (next) next.focus();
    }
  });
  el.addEventListener('keydown', e => {
    if (e.key === '.' || e.key === 'Tab') {
      e.preventDefault();
      const ids = ['f0','f1','f2','f3','t0','t1','t2','t3'];
      const next = document.getElementById(ids[idx+1]);
      if (next) next.focus();
    }
    if (e.key === 'Backspace' && el.value === '') {
      const ids = ['f0','f1','f2','f3','t0','t1','t2','t3'];
      const prev = document.getElementById(ids[idx-1]);
      if (prev) prev.focus();
    }
  });
});

function getIP(prefix) {
  return [0,1,2,3].map(i => document.getElementById(prefix+i).value || '0').join('.');
}
function setIP(prefix, ip) {
  const parts = ip.split('.');
  [0,1,2,3].forEach(i => { document.getElementById(prefix+i).value = parts[i]||''; });
}


// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let scanning=false, stopRequested=false;
const activeControllers = new Set();
var foundHostsMap={}, foundPingMap={}, totalFound=0, totalOpenPorts=0;
window.__isScanInProgress = () => scanning;
window.__scanRuntime = {
  get scanning() { return scanning; },
  get stopRequested() { return stopRequested; },
  set stopRequested(value) { stopRequested = !!value; },
  get activeControllers() { return activeControllers; }
};

// ── Scan History ──
const SCAN_HISTORY_KEY = 'netrecon_scan_history';
const MAX_HISTORY_ITEMS = 50;
let scanHistory = JSON.parse(localStorage.getItem(SCAN_HISTORY_KEY)) || [];

function getResultCounts() {
  let activeHosts = 0;
  let deadHosts = 0;
  for (const ports of Object.values(foundHostsMap)) {
    if (Array.isArray(ports) && ports.length > 0) activeHosts++;
    else deadHosts++;
  }
  return { activeHosts, deadHosts, totalHosts: activeHosts + deadHosts };
}

function getFavoriteHostCount() {
  let favoriteHosts = 0;
  for (const [ip, ports] of Object.entries(foundHostsMap)) {
    const hasPortFav = (ports || []).some(port => foundFavSet.has(`${ip}:${port}`));
    if (foundFavSet.has(ip) || hasPortFav) favoriteHosts++;
  }
  return favoriteHosts;
}

function getStatusCountForFilter() {
  const counts = getResultCounts();
  if (_listFilter === 'all') return counts.totalHosts;
  if (_listFilter === 'dead') return counts.deadHosts;
  if (_listFilter === 'favorites') return getFavoriteHostCount();
  return counts.activeHosts;
}

let timerInterval=null, scanStart=0;
const previewContext = window.__previewContext || (window.__previewContext = {
  selectedRowEl: null,
  targetIp: '',
  targetPorts: []
});
let focusedIp = localStorage.getItem('netrecon_focus_ip') || '';

// ══════════════════════════════════════════════════
//  DOM
// ══════════════════════════════════════════════════
const btnGo       = document.getElementById('btnGo');
const btnStop     = document.getElementById('btnStop');
const btnClear    = document.getElementById('btnClear');
const btnFactoryReset = document.getElementById('btnFactoryReset');
const progFill    = document.getElementById('progFill');
const progPct     = document.getElementById('progPct');
const statChecked = document.getElementById('statChecked');
const statFound   = document.getElementById('statFound');
const statPorts   = document.getElementById('statPorts');
const statTime    = document.getElementById('statTime');
const statusMsg   = document.getElementById('statusMsg');
const statusCount = document.getElementById('statusCount');
const listBody    = document.getElementById('listBody');
const emptyRow    = document.getElementById('emptyRow');
const ctxMenu     = document.getElementById('ctxMenu');
window.__scanDom = {
  listBody,
  emptyRow,
  statTime,
  statChecked
};

// ══════════════════════════════════════════════════
//  LIST FILTER
// ══════════════════════════════════════════════════
let _listFilter = 'active'; // 'all' | 'favorites' | 'active' | 'dead'
const foundFavSet   = new Set(); // IP favorites
const foundCheckSet = new Set(); // IP checkmarks
// port keys stored inside foundFavSet as "ip:port"
// port checkmarks stored inside foundPortCheckSet as "ip:port"
const foundPortCheckSet = new Set();
const foundExpandedSet  = new Set(); // IPs with ports row expanded

function saveExpanded() {
  try { localStorage.setItem('netrecon_expanded', JSON.stringify([...foundExpandedSet])); } catch {}
}

function restoreExpanded() {
  try {
    const raw = localStorage.getItem('netrecon_expanded');
    if (!raw) return;
    JSON.parse(raw).forEach(ip => foundExpandedSet.add(ip));
  } catch {}
}
restoreExpanded();

function saveMarks() {
  try {
    localStorage.setItem('netrecon_marks', JSON.stringify({
      favIps:       [...foundFavSet].filter(k => !k.includes(':')),
      favPorts:     [...foundFavSet].filter(k =>  k.includes(':')),
      checkIps:     [...foundCheckSet],
      checkPorts:   [...foundPortCheckSet],
    }));
  } catch {}
}

function restoreMarks() {
  try {
    const raw = localStorage.getItem('netrecon_marks');
    if (!raw) return;
    const { favIps = [], favPorts = [], checkIps = [], checkPorts = [] } = JSON.parse(raw);
    favIps.forEach(k => foundFavSet.add(k));
    favPorts.forEach(k => foundFavSet.add(k));
    checkIps.forEach(k => foundCheckSet.add(k));
    checkPorts.forEach(k => foundPortCheckSet.add(k));
  } catch {}
}
restoreMarks();

function applyListFilter() {
  document.querySelectorAll('.lv-row').forEach(row => {
    const isDead    = row.dataset.hostState === 'dead';
    const isRowFav  = row.querySelector('.lv-star .star-on') !== null;
    const paths = row.nextElementSibling;
    const hasPortFav = paths && paths.classList.contains('paths-row')
      ? paths.querySelector('.star-on') !== null
      : false;
    const isFav = isRowFav || hasPortFav;

    let visible = true;
    if (_listFilter === 'active')         visible = !isDead;
    else if (_listFilter === 'dead')      visible = isDead;
    else if (_listFilter === 'favorites') visible = isFav;

    row.style.display = visible ? '' : 'none';

    if (paths && paths.classList.contains('paths-row')) {
      if (!visible) {
        paths.style.display = 'none';
      } else if (_listFilter === 'favorites' && hasPortFav && !isRowFav) {
        // host not favorited but has favorited ports — auto-expand
        paths.classList.add('open');
        paths.style.display = 'flex';
      } else {
        paths.style.display = paths.classList.contains('open') ? 'flex' : 'none';
      }
      // In favorites mode, hide individual port lines that aren't starred
      paths.querySelectorAll('.path-port-line').forEach(line => {
        if (_listFilter === 'favorites') {
          line.style.display = line.querySelector('.star-on') !== null ? '' : 'none';
        } else {
          line.style.display = '';
        }
      });
    }
  });
  statusCount.textContent = t('statusHosts', getStatusCountForFilter());
}

['btnFilterAll', 'btnFilterFavorites', 'btnFilterActive', 'btnFilterDead'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    _listFilter = id === 'btnFilterAll' ? 'all'
      : id === 'btnFilterFavorites' ? 'favorites'
      : id === 'btnFilterActive'    ? 'active'
      : 'dead';
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    applyListFilter();
  });
});

// Expand / collapse all rows via [+] header click
let _allExpanded = false;
document.getElementById('colExpandAll')?.addEventListener('click', () => {
  _allExpanded = !_allExpanded;
  document.getElementById('colExpandAll').textContent = _allExpanded ? '−' : '+';
  document.querySelectorAll('.paths-row').forEach(paths => {
    const row = paths.previousElementSibling;
    if (row && row.style.display === 'none') return; // skip hidden rows
    const expandBtn = row?.querySelector('.row-expand-btn');
    if (_allExpanded) {
      paths.classList.add('open');
      paths.style.display = 'flex';
      if (expandBtn) expandBtn.textContent = '−';
      if (row?.dataset.ip) foundExpandedSet.add(row.dataset.ip);
    } else {
      paths.classList.remove('open');
      paths.style.display = 'none';
      if (expandBtn) expandBtn.textContent = '+';
      if (row?.dataset.ip) foundExpandedSet.delete(row.dataset.ip);
    }
  });
  saveExpanded();
});

// Check column header — right-click context menu
const checkCtxMenu = document.getElementById('checkCtxMenu');

document.getElementById('colCheckAll')?.addEventListener('contextmenu', e => {
  e.preventDefault();
  e.stopPropagation();
  const vw = window.innerWidth, vh = window.innerHeight;
  checkCtxMenu.style.left = Math.min(e.clientX, vw - 180) + 'px';
  checkCtxMenu.style.top  = Math.min(e.clientY, vh - 80)  + 'px';
  checkCtxMenu.classList.add('open');
});

document.getElementById('checkCtxMarkVisible')?.addEventListener('click', () => {
  checkCtxMenu.classList.remove('open');
  document.querySelectorAll('.lv-row').forEach(row => {
    if (row.style.display === 'none') return;
    const span = row.querySelector('.lv-icon span');
    if (span) { span.className = 'icon-ok'; span.title = 'Marked'; }
    const ip = row.dataset.ip; if (ip) foundCheckSet.add(ip);
  });
  saveMarks();
});

document.getElementById('checkCtxUnmarkVisible')?.addEventListener('click', () => {
  checkCtxMenu.classList.remove('open');
  document.querySelectorAll('.lv-row').forEach(row => {
    if (row.style.display === 'none') return;
    const span = row.querySelector('.lv-icon span');
    if (span) { span.className = 'icon-ok-off'; span.title = 'Mark'; }
    const ip = row.dataset.ip; if (ip) foundCheckSet.delete(ip);
  });
  saveMarks();
});

document.addEventListener('click', () => checkCtxMenu?.classList.remove('open'));

// Favorites column header — right-click context menu
const favCtxMenu = document.getElementById('favCtxMenu');

document.getElementById('colFavAll')?.addEventListener('contextmenu', e => {
  e.preventDefault();
  e.stopPropagation();
  const vw = window.innerWidth, vh = window.innerHeight;
  favCtxMenu.style.left = Math.min(e.clientX, vw - 200) + 'px';
  favCtxMenu.style.top  = Math.min(e.clientY, vh - 80)  + 'px';
  favCtxMenu.classList.add('open');
});

document.getElementById('favCtxAddVisible')?.addEventListener('click', () => {
  favCtxMenu.classList.remove('open');
  document.querySelectorAll('.lv-row').forEach(row => {
    if (row.style.display === 'none') return;
    const span = row.querySelector('.lv-star span');
    if (span) {
      const ip = row.dataset.ip;
      foundFavSet.add(ip);
      span.className = 'star-on';
      span.title = 'Favorite';
    }
  });
  saveMarks();
  if (_listFilter === 'favorites') applyListFilter();
});

document.getElementById('favCtxRemoveVisible')?.addEventListener('click', () => {
  favCtxMenu.classList.remove('open');
  document.querySelectorAll('.lv-row').forEach(row => {
    if (row.style.display === 'none') return;
    const span = row.querySelector('.lv-star span');
    if (span) {
      const ip = row.dataset.ip;
      foundFavSet.delete(ip);
      span.className = 'star-off';
      span.title = 'Add to favorites';
    }
  });
  saveMarks();
  if (_listFilter === 'favorites') applyListFilter();
});

document.addEventListener('click', () => favCtxMenu?.classList.remove('open'));

// ══════════════════════════════════════════════════
//  COLUMN SORTING (IP / Ping)
// ══════════════════════════════════════════════════
let _sortCol = null; // 'ip' | 'ping'
let _sortDir = 1;    // 1 = asc, -1 = desc

function sortListView(col) {
  if (_sortCol === col) _sortDir *= -1;
  else { _sortCol = col; _sortDir = 1; }
  try { localStorage.setItem('netrecon_sort', JSON.stringify({ col: _sortCol, dir: _sortDir })); } catch {}

  // Update header indicators
  const ipEl   = document.getElementById('colSortIp');
  const pingEl = document.getElementById('colSortPing');
  if (ipEl)   ipEl.textContent   = 'IP Address' + (col === 'ip'   ? (_sortDir === 1 ? ' ▲' : ' ▼') : '');
  if (pingEl) pingEl.textContent = 'Ping'        + (col === 'ping' ? (_sortDir === 1 ? ' ▲' : ' ▼') : '');

  // Collect row+pathsRow pairs from listBody
  const listBody = document.getElementById('listBody');
  const pairs = [];
  let child = listBody.firstElementChild;
  while (child) {
    if (child.classList.contains('lv-row')) {
      const next = child.nextElementSibling;
      const pathsRow = (next && next.classList.contains('paths-row')) ? next : null;
      pairs.push({ row: child, pathsRow });
      child = pathsRow ? pathsRow.nextElementSibling : next;
    } else {
      child = child.nextElementSibling;
    }
  }

  pairs.sort((a, b) => {
    if (col === 'ip') {
      return _sortDir * (ipToNum(a.row.dataset.ip) - ipToNum(b.row.dataset.ip));
    } else {
      const p = row => {
        const v = row.dataset.ping;
        return (v !== undefined && v !== '') ? parseInt(v) : Infinity;
      };
      return _sortDir * (p(a.row) - p(b.row));
    }
  });

  // Re-insert in sorted order
  const frag = document.createDocumentFragment();
  pairs.forEach(({ row, pathsRow }) => {
    frag.appendChild(row);
    if (pathsRow) frag.appendChild(pathsRow);
  });
  listBody.appendChild(frag);
}

document.getElementById('colSortIp')?.addEventListener('click',   () => sortListView('ip'));
document.getElementById('colSortPing')?.addEventListener('click', () => sortListView('ping'));

// Restore saved sort state
try {
  const savedSort = JSON.parse(localStorage.getItem('netrecon_sort') || 'null');
  if (savedSort && (savedSort.col === 'ip' || savedSort.col === 'ping')) {
    _sortCol = savedSort.col;
    _sortDir = savedSort.dir === -1 ? -1 : 1;
    const ipEl   = document.getElementById('colSortIp');
    const pingEl = document.getElementById('colSortPing');
    if (ipEl)   ipEl.textContent   = 'IP Address' + (_sortCol === 'ip'   ? (_sortDir === 1 ? ' ▲' : ' ▼') : '');
    if (pingEl) pingEl.textContent = 'Ping'        + (_sortCol === 'ping' ? (_sortDir === 1 ? ' ▲' : ' ▼') : '');
  }
} catch {}

// ══════════════════════════════════════════════════
//  EXTRA COLUMNS (Columns panel)
// ══════════════════════════════════════════════════
const EXTRA_COLS = [
  { key: 'hostname', width: '120px' },
  { key: 'geo',      width: '170px' },
  { key: 'device',   width: '140px' },
  { key: 'title',    width: '200px' },
  { key: 'access',   width: '80px'  },
];
const colsEnabled = { hostname: false, geo: false, device: false, title: false, access: false };
const BASE_LV_COLS = '20px 18px 18px 87px 26px 56px';
const ENRICH_QUEUE_CONCURRENCY = 4;
const enrichQueue = [];
let enrichWorkers = 0;

function queueRowEnrichment(ip, ports, row) {
  if (!row) return;
  if (row.dataset.enrichQueued === '1') return;
  row.dataset.enrichQueued = '1';
  enrichQueue.push({ ip, ports, row });
  drainEnrichQueue();
}

function drainEnrichQueue() {
  while (enrichWorkers < ENRICH_QUEUE_CONCURRENCY && enrichQueue.length) {
    const job = enrichQueue.shift();
    enrichWorkers++;
    Promise.resolve()
      .then(async () => {
        if (!job.row?.isConnected) return;
        await enrichRowCols(job.ip, job.ports, job.row);
      })
      .finally(() => {
        if (job.row) delete job.row.dataset.enrichQueued;
        enrichWorkers--;
        drainEnrichQueue();
      });
  }
}

function updateColsGrid() {
  const extras = EXTRA_COLS.filter(c => colsEnabled[c.key]).map(c => c.width).join(' ');
  const cols = extras ? `${BASE_LV_COLS} ${extras}` : BASE_LV_COLS;
  document.getElementById('listviewWrap')?.style.setProperty('--lv-cols', cols);
  EXTRA_COLS.forEach(({ key }) => {
    const show = colsEnabled[key];
    document.querySelectorAll(`.lv-extra-col[data-col="${key}"]`).forEach(el => {
      el.classList.toggle('is-hidden', !show);
      el.style.display = show ? '' : 'none';
    });
    document.querySelectorAll(`.lv-extra-cell[data-col="${key}"]`).forEach(el => {
      el.classList.toggle('is-hidden', !show);
      el.style.display = show ? '' : 'none';
    });
  });
}

async function enrichRowCols(ip, ports, row) {
  const active = EXTRA_COLS.map(c => c.key).filter(k => colsEnabled[k]);
  if (!active.length) return;
  const cell = key => row.querySelector(`.lv-extra-cell[data-col="${key}"]`);
  const tasks = [];
  if (colsEnabled.hostname) {
    tasks.push(lookupHostname(ip).then(h => {
      const c = cell('hostname'); if (c) c.textContent = h || '—';
    }));
  }
  if (colsEnabled.geo) {
    tasks.push(geoLookup(ip).then(geo => {
      const c = cell('geo');
      if (!c) return;
      if (geo) {
        const vpnTag = geo.proxy ? `<span class="detail-tag tag-vpn">${t('tagVpn')}</span>` : '';
        const dcTag = geo.hosting ? `<span class="detail-tag tag-dc">${t('tagDc')}</span>` : '';
        c.innerHTML =
          `<div class="detail-line"><b>${t('geoCountry')}</b> ${geo.country || '?'} — ${geo.city || '?'}${vpnTag}${dcTag}</div>` +
          `<div class="detail-line"><b>${t('geoIsp')}</b> ${geo.isp || '?'}</div>` +
          `<div class="detail-line"><b>${t('geoAs')}</b> ${geo.as || '?'}</div>`;
      } else {
        c.innerHTML = isPrivateIP(ip)
          ? `<div class="detail-line detail-muted">${t('geoLocal')}</div>`
          : `<div class="detail-line status-error">${t('geoError')}</div>`;
      }
    }));
  }
  if (colsEnabled.device || colsEnabled.title || colsEnabled.access) {
    tasks.push(enrichRow(ip, ports, {
      cGeo:    cell('geo'),
      cDevice: cell('device'),
      cTitle:  cell('title'),
      cAccess: cell('access'),
    }));
  }
  await Promise.all(tasks);
}

// Columns panel toggle
const colsPanel = document.getElementById('colsPanel');
document.getElementById('btnCols')?.addEventListener('click', e => {
  e.stopPropagation();
  const btn = document.getElementById('btnCols');
  const rect = btn.getBoundingClientRect();
  colsPanel.style.position = 'fixed';
  colsPanel.style.top  = rect.bottom + 2 + 'px';
  colsPanel.style.left = rect.left + 'px';
  colsPanel.style.right = '';
  colsPanel.classList.toggle('open');
  btn.classList.toggle('active', colsPanel.classList.contains('open'));
});

document.getElementById('btnBlurIp')?.addEventListener('click', () => {
  const btn = document.getElementById('btnBlurIp');
  const listviewWrap = document.getElementById('listviewWrap');
  const rangeRow = document.querySelector('.range-row');
  const on = listviewWrap.classList.toggle('ip-blur-active');
  rangeRow?.classList.toggle('ip-range-blurred', on);
  document.body.classList.toggle('ip-detect-blurred', on);
  document.body.classList.toggle('ip-blur-active', on);
  btn.classList.toggle('active', on);
  btn.title = on ? 'Click to show IPs' : 'Toggle IP blur';
  if (typeof updateGlobeDots === 'function') updateGlobeDots();
});
document.addEventListener('click', e => {
  if (!colsPanel?.contains(e.target) && e.target.id !== 'btnCols') {
    colsPanel?.classList.remove('open');
    document.getElementById('btnCols')?.classList.remove('active');
  }
});

// Checkbox handlers
document.querySelectorAll('#colsPanel input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    colsEnabled[cb.dataset.col] = cb.checked;
    updateColsGrid();
    if (cb.checked) {
      // Trigger enrichment for all existing rows
      document.querySelectorAll('.lv-row[data-ip]').forEach(row => {
        const ip = row.dataset.ip;
        const ports = foundHostsMap[ip] || [];
        queueRowEnrichment(ip, ports, row);
      });
    }
  });
});

// Apply base column visibility on startup.
updateColsGrid();

// ══════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════
function isIPv4(v) {
  if (!v.match(/^(\d{1,3}\.){3}\d{1,3}$/)) return false;
  return v.split('.').every(p => { const n=+p; return n>=0&&n<=255; });
}
function ipToNum(ip) { return ip.split('.').reduce((a,p)=>((a<<8)+ +p)>>>0,0); }
function numToIp(n)  { return [24,16,8,0].map(s=>(n>>>s)&255).join('.'); }

function isPrivateIp(num) {
  // 10.0.0.0/8
  if (num >= 0x0A000000 && num <= 0x0AFFFFFF) return true;
  // 172.16.0.0/12
  if (num >= 0xAC100000 && num <= 0xAC1FFFFF) return true;
  // 192.168.0.0/16
  if (num >= 0xC0A80000 && num <= 0xC0A8FFFF) return true;
  // 127.0.0.0/8 loopback
  if (num >= 0x7F000000 && num <= 0x7FFFFFFF) return true;
  // 169.254.0.0/16 link-local
  if (num >= 0xA9FE0000 && num <= 0xA9FEFFFF) return true;
  return false;
}


function setStatus(text, type='') {
  statusMsg.textContent = text;
  statusMsg.className = 'status-panel'+(type?' '+type:'');
}
function updateProgress(checked, total, fh, op) {
  const pct = total ? Math.round(checked/total*100) : 0;
  progFill.style.width = pct+'%';
  progPct.textContent = pct+'%';
  statChecked.textContent = checked;
  const counts = getResultCounts();
  statFound.textContent   = counts.activeHosts;
  statFound.title = `Active: ${counts.activeHosts}`;
  statPorts.textContent   = op;
  statusCount.textContent = t('statusHosts', getStatusCountForFilter());
}
function setScanState(on) {
  scanning=on; btnGo.disabled=on; btnStop.disabled=!on;
  if (on) {
    btnGo.classList.add('pressed');
    scanStart=Date.now();
    timerInterval=setInterval(()=>{
      statTime.textContent = ((Date.now()-scanStart)/1000).toFixed(1)+'s';
    },200);
  } else {
    btnGo.classList.remove('pressed');
    clearInterval(timerInterval);
  }
}

// ══════════════════════════════════════════════════
//  PROBE
// ══════════════════════════════════════════════════

// Tauri invoke helper — falls back to null when running in a plain browser
const _tauriInvoke = (window.__TAURI_INTERNALS__?.invoke)
  ?? (window.__TAURI__?.invoke)
  ?? (window.__TAURI__?.core?.invoke)
  ?? null;
window.__tauriInvoke = _tauriInvoke;

const _tauriListen = window.__TAURI__?.event?.listen ?? null;
const _toolMode = (new URLSearchParams((window.location.hash || '').replace(/^#/, ''))).get('tool');
// Declared in globe.js first (loads earlier); guard against duplicate const.
if (typeof _isTauriDesktop === 'undefined') {
  var _isTauriDesktop = !!(window.__TAURI__ || window.__TAURI_INTERNALS__ || navigator.userAgent.toLowerCase().includes('tauri'));
}

function openToolNativeWindow(tool) {
  if (!_tauriInvoke || _toolMode) return false;
  _tauriInvoke('open_tool_window', { tool }).catch(() => {});
  return true;
}

function makeToolChromeCloseOnly(target) {
  const bar = target.querySelector('.titlebar');
  if (!bar) return;

  bar.classList.add('cursor-move');

  let btns = bar.querySelector('.titlebar-btns');
  if (!btns) {
    btns = document.createElement('div');
    btns.className = 'titlebar-btns';
    bar.appendChild(btns);
  }

  const allBtns = Array.from(bar.querySelectorAll('.title-btn, button'));
  let closeBtn = allBtns.find(btn => {
    const id = (btn.id || '').toLowerCase();
    const txt = (btn.textContent || '').trim();
    return id.includes('close') || txt.includes('✕') || txt.toLowerCase() === 'x';
  });

  allBtns.forEach(btn => {
    if (btn !== closeBtn) btn.classList.add('initially-hidden');
  });

  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'title-btn title-btn-close';
    closeBtn.textContent = '✕';
    btns.appendChild(closeBtn);
  }

  closeBtn.classList.remove('initially-hidden');
  closeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeCurrentWindowImmediate();
  };

  if (!bar.dataset.toolDragBound) {
    bar.dataset.toolDragBound = '1';
    bar.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      if (e.target.closest('.title-btn, button')) return;
      e.preventDefault();
      startMainWindowDrag();
    });
  }
}

function hideToolMenus(target) {
  target.querySelectorAll('.menubar').forEach(el => {
    el.classList.add('initially-hidden');
  });

  const cmdMacroMenu = target.querySelector('#cmdMenuMacro');
  if (cmdMacroMenu?.parentElement) {
    cmdMacroMenu.parentElement.classList.add('initially-hidden');
  }
}

function applyToolWindowMode() {
  if (!_toolMode) return;
  document.body.classList.add('tool-window-mode');
  document.documentElement.classList.remove('tool-window-boot');

  const toolToWindow = {
    console: 'cmdWin',
    macro: 'macroFolderWin',
    speed: 'speedWin',
    proto: 'protoWin',
    globe: 'globeWin',
    topology: 'topoWin',
    'wifi-radar': 'wifiRadarWin',
    'bt-detector': 'btDetectorWin',
    gnss: 'gnssWin',
    lte: 'lteWin',
    sniffer: 'snifferWin',
    'imgmeta': 'imgMetaWin',
    'ai-assistant': 'aiAssistantWin',
    'phone-lookup': 'phoneLookupWin',
    'scan-watch': 'scanWatchWin',
    'wifi-detector': 'wifiDetectorWin',
  };

  const targetId = toolToWindow[_toolMode];
  const target = targetId ? document.getElementById(targetId) : null;
  if (!target) return;

  target.classList.add('tool-fullscreen');

  makeToolChromeCloseOnly(target);
  hideToolMenus(target);

  if (_toolMode === 'macro' && typeof renderMacroFiles === 'function') {
    renderMacroFiles();
  }
  if (_toolMode === 'console') {
    if (typeof openCmdConsole === 'function') openCmdConsole();
  }
  if (_toolMode === 'proto' && typeof initProtoCanvas === 'function') {
    initProtoCanvas();
    if (typeof protoRenderLinks === 'function') protoRenderLinks();
  }
  if (_toolMode === 'globe' && typeof initGlobe === 'function') {
    if (!globeReady) initGlobe();
    else { if (typeof drawGlobe === 'function') drawGlobe(); if (typeof startRotation === 'function') startRotation(); }
  }
  if (_toolMode === 'topology' && typeof initTopo === 'function') {
    initTopo();
  }
}

function applyNativeChromeMode() {
  document.body.classList.remove('tauri-native-menu');
}

// Apply as early as possible and re-apply once DOM is fully ready.
applyNativeChromeMode();
window.addEventListener('DOMContentLoaded', () => {
  applyNativeChromeMode();
  applyToolWindowMode();
});

function handleNativeMenuAction(actionId) {
  switch (actionId) {
    case 'scan_start':
      document.getElementById('btnGo')?.click();
      break;
    case 'scan_stop':
      document.getElementById('btnStop')?.click();
      break;
    case 'scan_clear':
      document.getElementById('btnClear')?.click();
      break;
    case 'app_exit':
      closeMainWindow();
      break;
    case 'open_countries':
      document.getElementById('menuCountries')?.click();
      break;
    case 'open_presets':
      document.getElementById('menuPresets')?.click();
      break;
    case 'open_defaults':
      document.getElementById('menuDefaults')?.click();
      break;
    case 'open_lang':
      document.getElementById('menuLang')?.click();
      break;
    case 'open_customize':
      document.getElementById('menuCustomize')?.click();
      break;
    case 'open_globe':
      document.getElementById('btnGlobe')?.click();
      break;
    case 'open_console':
      document.getElementById('btnCmdConsole')?.click();
      break;
    case 'open_macro':
      document.getElementById('btnMacroToolbar')?.click();
      break;
    case 'open_speed':
      document.getElementById('btnSpeedToolbar')?.click();
      break;
    case 'open_proto':
      document.getElementById('btnProtoToolbar')?.click();
      break;
    case 'open_topology':
      document.getElementById('btnTopologyToolbar')?.click();
      break;
    case 'help_versions':
      document.getElementById('menuVersions')?.click();
      break;
    case 'help_about':
      document.getElementById('menuAbout')?.click();
      break;
  }
}

if (_tauriListen) {
  _tauriListen('native-menu', event => {
    if (typeof event?.payload === 'string') {
      handleNativeMenuAction(event.payload);
    }
  }).catch(() => {});
}

async function probePort(ip, port, ms=1500) {
  if (_tauriInvoke) {
    // Native Rust TCP probe — no CORS restrictions
    // Early exit if scan stop was requested
    if (window.__scanRuntime?.stopRequested) {
      return { ok: false, ms: null };
    }
    try {
      const r = await _tauriInvoke('scan_port', { ip, port, timeoutMs: ms });
      return { ok: r.open, ms: r.ms ?? null };
    } catch (e) {
      if (!window.__scanInvokeWarned) {
        window.__scanInvokeWarned = true;
        const msg = (e && e.message) ? e.message : String(e);
        setStatus(`Tauri invoke error: ${msg}`, 'err');
      }
      return { ok: false, ms: null };
    }
  }
  // Browser fallback (used when opening index.html directly)
  // Early exit if scan stop was requested
  if (window.__scanRuntime?.stopRequested) {
    return { ok: false, ms: null };
  }
  const ctrl = new AbortController();
  activeControllers.add(ctrl);
  const tid = setTimeout(()=>ctrl.abort(), ms);
  const t0 = Date.now();
  try {
    const proto = (port===443||port===8443)?'https':'http';
    await fetch(`${proto}://${ip}:${port}/`,{mode:'no-cors',cache:'no-store',signal:ctrl.signal});
    return { ok: true, ms: Date.now() - t0 };
  } catch { return { ok: false, ms: null }; }
  finally { clearTimeout(tid); activeControllers.delete(ctrl); }
}

function tryImageLoad(url, ms=2000) {
  return new Promise(res => {
    const img=new Image();
    const tid=setTimeout(()=>{img.src='';res(false);},ms);
    img.onload =()=>{clearTimeout(tid);res(true); };
    img.onerror=()=>{clearTimeout(tid);res(false);};
    img.src=url;
  });
}

function isPrivateIP(ip) {
  if (!isIPv4(ip)) return false;
  return isPrivateIp(ipToNum(ip));
}

const geoCache = {};
const geoPending = new Map();
const hostnameCache = {};
const hostnamePending = new Map();
let geoApiQueue = Promise.resolve();
let geoApiCooldownUntil = 0;
let geoApiNextAt = 0;
const GEO_API_MIN_GAP_MS = 380;

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPublicIpv4(ip) {
  return isIPv4(ip) && !isPrivateIP(ip);
}

async function queueGeoApiCall(task) {
  const run = geoApiQueue.then(async () => {
    const now = Date.now();
    if (now < geoApiCooldownUntil) return null;
    if (geoApiNextAt > now) await waitMs(geoApiNextAt - now);
    geoApiNextAt = Date.now() + GEO_API_MIN_GAP_MS;
    return task();
  });
  geoApiQueue = run.then(() => null, () => null);
  return run;
}

// ── Geolocation via ip-api.com ──
async function geoLookup(ip) {
  if (!isPublicIpv4(ip)) {
    geoCache[ip] = null;
    return null;
  }
  if (geoCache[ip] !== undefined) return geoCache[ip];
  if (geoPending.has(ip)) return geoPending.get(ip);

  const run = (async () => {
  try {
    const d = await queueGeoApiCall(async () => {
      if (_tauriInvoke) {
        // Rust handles the HTTP request — no CORS/mixed-content issues
        return await _tauriInvoke('geo_lookup', { ip });
      }
      const r = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,country,city,isp,org,proxy,hosting,as,lat,lon`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (r.status === 429) {
        const ttlSec = Math.max(30, Number(r.headers.get('x-ttl') || '60') || 60);
        geoApiCooldownUntil = Date.now() + ttlSec * 1000;
        return null;
      }
      return await r.json();
    });
    if (!d) {
      geoCache[ip] = null;
      return null;
    }
    if (d && d.status === 'success') {
      geoCache[ip] = d;
      if (d.lat && d.lon) {
        ipGeoCoords[ip] = { lat: d.lat, lon: d.lon, country: d.country };
        updateGlobeDots();
      }
      return d;
    }
    geoCache[ip] = null;
    return null;
  } catch {
    geoCache[ip] = null;
    return null;
  }
  })();

  geoPending.set(ip, run);
  return run.finally(() => geoPending.delete(ip));
}

// ── Page title via CORS proxy (external IPs only) ──
async function fetchTitle(ip, port) {
  const proto = (port===443||port===8443)?'https':'http';
  const target = encodeURIComponent(`${proto}://${ip}:${port}/`);
  try {
    const r = await fetch(`https://corsproxy.io/?${target}`,
      { signal: AbortSignal.timeout(5000) });
    const html = await r.text();
    const m = html.match(/<title[^>]*>([^<]{1,100})<\/title>/i);
    return m ? m[1].trim().replace(/\s+/g,' ') : null;
  } catch { return null; }
}

// ── Favicon probe ──
function checkFavicon(ip, port) {
  const proto = (port===443||port===8443)?'https':'http';
  return tryImageLoad(`${proto}://${ip}:${port}/favicon.ico`, 2000);
}

// ── Snapshot / open auth ──
async function checkAuth(ip, ports) {
  const snaps = [
    '/snapshot.jpg','/image.jpg','/jpg/image.jpg',
    '/cgi-bin/snapshot.cgi','/webcapture.jpg',
    '/live/0/mjpeg.jpg','/tmpfs/auto.jpg',
    '/ISAPI/Streaming/channels/101/picture',
    '/onvif/snapshot',
  ];
  for (const port of ports) {
    const proto=(port===443||port===8443)?'https':'http';
    for (const path of snaps)
      if (await tryImageLoad(`${proto}://${ip}:${port}${path}`, 1800)) return true;
  }
  return false;
}

// ── Device fingerprint by known image paths ──
const FP_IMAGES = [
  { path: '/ISAPI/Streaming/channels/101/picture', label: 'Hikvision' },
  { path: '/cgi-bin/snapshot.cgi',                 label: 'Dahua / kamera' },
  { path: '/jpg/image.jpg',                         label: 'Kamera IP' },
  { path: '/webcapture.jpg',                        label: 'Kamera IP' },
  { path: '/onvif/snapshot',                        label: 'ONVIF Camera' },
  { path: '/tmpfs/auto.jpg',                        label: 'Kamera IP (wbudowana)' },
  { path: '/axis-cgi/jpg/image.cgi',                label: 'Axis Camera' },
];

async function fingerprintByImage(ip, ports) {
  for (const port of ports.slice(0, 3)) {
    const proto=(port===443||port===8443)?'https':'http';
    for (const fp of FP_IMAGES) {
      if (await tryImageLoad(`${proto}://${ip}:${port}${fp.path}`, 1400))
        return fp.label;
    }
  }
  return null;
}

// ── Full enrichment (runs async after row is added) ──
async function enrichRow(ip, ports, cells) {
  const { cGeo, cDevice, cTitle, cAccess } = cells;

  // Run geo + fingerprint + favicon + title in parallel
  const [ geo, deviceLabel, hasFavicon, isOpen, title ] = await Promise.all([
    geoLookup(ip),
    fingerprintByImage(ip, ports),
    checkFavicon(ip, ports[0]),
    checkAuth(ip, ports),
    isPrivateIP(ip) ? Promise.resolve(null) : fetchTitle(ip, ports[0]),
  ]);

  // Geo
  if (geo) {
    const vpnTag = geo.proxy   ? `<span class="detail-tag tag-vpn">${t('tagVpn')}</span>` : '';
    const dcTag  = geo.hosting ? `<span class="detail-tag tag-dc">${t('tagDc')}</span>`   : '';
    cGeo.innerHTML =
      `<div class="detail-line"><b>${t('geoCountry')}</b> ${geo.country||'?'} — ${geo.city||'?'}${vpnTag}${dcTag}</div>`+
      `<div class="detail-line"><b>${t('geoIsp')}</b> ${geo.isp||'?'}</div>`+
      `<div class="detail-line"><b>${t('geoAs')}</b> ${geo.as||'?'}</div>`;
  } else {
    cGeo.innerHTML = isPrivateIP(ip)
      ? `<div class="detail-line detail-muted">${t('geoLocal')}</div>`
      : `<div class="detail-line status-error">${t('geoError')}</div>`;
  }

  // Device
  let deviceHtml = '';
  if (deviceLabel) {
    deviceHtml += `<div class="detail-line"><b>${t('deviceType')}</b> ${deviceLabel} <span class="detail-tag tag-device">${t('tagRecognized')}</span></div>`;
  }
  deviceHtml += `<div class="detail-line"><b>${t('deviceFavicon')}</b> ${hasFavicon ? t('deviceFaviconYes') : t('deviceFaviconNo')}</div>`;
  const portGuess = ports.includes(554)  ? t('portRtsp') :
                    ports.includes(631)  ? t('portIpp')  :
                    ports.includes(9100) ? t('portRaw')  :
                    ports.includes(5000)||ports.includes(5001) ? t('portSyn') :
                    ports.includes(8006) ? t('portProx') : null;
  if (portGuess) deviceHtml += `<div class="detail-line"><b>${t('deviceSuggestion')}</b> ${portGuess}</div>`;
  cDevice.innerHTML = deviceHtml || `<div class="detail-line detail-muted">${t('deviceUnknown')}</div>`;

  // Title
  if (title) {
    cTitle.innerHTML = `<div class="detail-line"><b>${t('titleLabel')}</b> "${title}"</div>`;
  } else if (isPrivateIP(ip)) {
    cTitle.innerHTML = `<div class="detail-line detail-muted">${t('titleExtOnly')}</div>`;
  } else {
    cTitle.innerHTML = `<div class="detail-line detail-muted">${t('titleUnavailable')}</div>`;
  }

  // Access
  cAccess.innerHTML = isOpen
    ? `<div class="detail-line"><b>${t('accessLabel')}</b> <span class="text-ok">${t('accessOpen')}</span></div>`
    : `<div class="detail-line"><b>${t('accessLabel')}</b> ${t('accessClosed')}</div>`;
}

// ── Hostname lookup via ip-api (already used for geo, reuse) ──
async function lookupHostname(ip) {
  if (!isPublicIpv4(ip)) {
    hostnameCache[ip] = null;
    return null;
  }
  if (hostnameCache[ip] !== undefined) return hostnameCache[ip];
  if (hostnamePending.has(ip)) return hostnamePending.get(ip);

  const run = (async () => {
  if (_tauriInvoke) {
    try {
      const result = await _tauriInvoke('hostname_lookup', { ip });
      hostnameCache[ip] = result || null;
      return hostnameCache[ip];
    } catch {
      hostnameCache[ip] = null;
      return null;
    }
  }
  try {
    const d = await queueGeoApiCall(async () => {
      const r = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,reverse`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (r.status === 429) {
        const ttlSec = Math.max(30, Number(r.headers.get('x-ttl') || '60') || 60);
        geoApiCooldownUntil = Date.now() + ttlSec * 1000;
        return null;
      }
      return await r.json();
    });
    if (!d) {
      hostnameCache[ip] = null;
      return null;
    }
    const result = (d.status === 'success' && d.reverse) ? d.reverse : null;
    hostnameCache[ip] = result;
    return result;
  } catch { hostnameCache[ip] = null; return null; }

  })();

  hostnamePending.set(ip, run);
  return run.finally(() => hostnamePending.delete(ip));
}

// ══════════════════════════════════════════════════
//  ADD ROW
// ══════════════════════════════════════════════════
function addResultRow(ip, openPorts, pingMs) {
  if (emptyRow.parentNode) emptyRow.remove();

  // If re-scanning "all ports" - remove old row/pathsRow for this IP
  const existingRow = document.querySelector(`.lv-row[data-ip="${ip}"]`);
  if (existingRow && portsOverride !== null) {
    const existingPaths = existingRow.nextElementSibling;
    if (existingPaths && existingPaths.classList.contains('paths-row')) {
      existingPaths.remove();
    }
    existingRow.remove();
  }

  // Generic paths — work for any device type
  const paths = [
    {p:'/',l:'/'}, {p:'/admin',l:'/admin'}, {p:'/video',l:'/video'},
    {p:'/snapshot.jpg',l:'/snapshot'}, {p:'/files',l:'/files'},
    {p:'/status',l:'/status'}, {p:'/stream',l:'/stream'},
    {p:'/mjpeg',l:'/mjpeg'},
  ];

  const row = document.createElement('div');
  row.className = 'lv-row';
  row.dataset.ip = ip;
  row.dataset.hostState = openPorts.length === 0 ? 'dead' : 'active';

  // Icon (toggleable checkmark — off by default)
  const cIcon = document.createElement('div');
  cIcon.className = 'lv-cell lv-icon';
  cIcon.innerHTML = '<span class="icon-ok-off" title="Mark">✔</span>';
  if (foundCheckSet.has(ip)) {
    const s = cIcon.querySelector('span');
    s.className = 'icon-ok'; s.title = 'Marked';
  }
  cIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    const span = cIcon.querySelector('span');
    const on = span.className === 'icon-ok';
    span.className = on ? 'icon-ok-off' : 'icon-ok';
    span.title = on ? 'Mark' : 'Marked';
    if (on) foundCheckSet.delete(ip); else foundCheckSet.add(ip);
    saveMarks();
  });
  row.appendChild(cIcon);

  // Star (favorites)
  const cStar = document.createElement('div');
  cStar.className = 'lv-cell lv-star';
  const isFav = foundFavSet.has(ip);
  cStar.innerHTML = `<span class="${isFav ? 'star-on' : 'star-off'}" title="${isFav ? 'Favorite' : 'Add to favorites'}">★</span>`;
  cStar.addEventListener('click', (e) => {
    e.stopPropagation();
    const span = cStar.querySelector('span');
    if (foundFavSet.has(ip)) {
      foundFavSet.delete(ip);
      span.className = 'star-off';
      span.title = 'Add to favorites';
    } else {
      foundFavSet.add(ip);
      span.className = 'star-on';
      span.title = 'Favorite';
    }
    saveMarks();
    if (_listFilter === 'favorites') applyListFilter();
  });
  row.appendChild(cStar);

  // Status light
  const cLight = document.createElement('div');
  cLight.className = 'lv-cell lv-light';
  const isDead = openPorts.length === 0;
  const lightClass = isDead ? 'light-dead' : 'light-on';
  const lightTitle = isDead ? 'Dead' : 'Active';
  cLight.innerHTML = `<span class="${lightClass}" title="${lightTitle}">●</span>`;
  row.appendChild(cLight);

  // IP
  const cIp = document.createElement('div');
  cIp.className='lv-cell lv-ip-cell';
  cIp.innerHTML = `${ip} <span id="acc_${ip.replace(/\./g,'_')}" class="lv-acc-span"></span>`;
  row.appendChild(cIp);

  // Restore expanded state if this IP was previously expanded
  const wasExpanded = foundExpandedSet.has(ip);

  // Expand (+) — only for hosts with open ports
  const cExpand = document.createElement('div');
  cExpand.className = 'lv-cell lv-expand-cell';
  const expandBtn = document.createElement('span');
  expandBtn.className = 'row-expand-btn';
  if (openPorts.length > 0) {
    expandBtn.textContent = wasExpanded ? '−' : '+';
    if (wasExpanded) expandBtn.classList.add('open');
    expandBtn.title = 'Pokaż udostępnione zasoby';
  } else {
    expandBtn.textContent = '';
    expandBtn.title = '';
    expandBtn.style.cursor = 'default';
  }
  cExpand.appendChild(expandBtn);
  row.appendChild(cExpand);

  // Ping
  const cPing = document.createElement('div');
  cPing.className='lv-cell';
  if (pingMs !== null && pingMs !== undefined) {
    const cls = pingMs < 100 ? 'ping-fast' : pingMs < 500 ? 'ping-ok' : 'ping-slow';
    cPing.innerHTML = `<span class="${cls}">${pingMs} ms</span>`;
    row.dataset.ping = pingMs;
  } else {
    cPing.innerHTML = '<span class="ping-none">-</span>';
    row.dataset.ping = '';
  }
  row.appendChild(cPing);

  // Extra enrichment cells (hidden until column enabled)
  EXTRA_COLS.forEach(({ key }) => {
    const c = document.createElement('div');
    c.className = 'lv-cell lv-extra-cell';
    c.classList.toggle('is-hidden', !colsEnabled[key]);
    c.dataset.col = key;
    c.style.display = colsEnabled[key] ? '' : 'none';
    c.textContent = '…';
    row.appendChild(c);
  });

  // ── Paths sub-row (expandable below the row) ──
  const pathsRow = document.createElement('div');
  pathsRow.className = 'paths-row';
  if (wasExpanded) {
    pathsRow.classList.add('open');
    pathsRow.style.display = 'flex';
  }
  const pFrag = document.createDocumentFragment();
  openPorts.forEach((port) => {
    const line = document.createElement('div');
    line.className = 'path-port-line';

    // Col 1: toggleable ✔ (off by default, per-port key ip:port)
    const sCheck = document.createElement('div');
    sCheck.className = 'path-col-spacer';
    const checkSpan = document.createElement('span');
    const portCheckKey = `${ip}:${port}`;
    checkSpan.className = foundPortCheckSet.has(portCheckKey) ? 'icon-ok' : 'icon-ok-off';
    checkSpan.textContent = '✔';
    checkSpan.title = foundPortCheckSet.has(portCheckKey) ? 'Marked' : 'Mark';
    checkSpan.style.cursor = 'pointer';
    checkSpan.addEventListener('click', e => {
      e.stopPropagation();
      const on = checkSpan.className === 'icon-ok';
      checkSpan.className = on ? 'icon-ok-off' : 'icon-ok';
      checkSpan.title = on ? 'Mark' : 'Marked';
      if (on) foundPortCheckSet.delete(portCheckKey); else foundPortCheckSet.add(portCheckKey);
      saveMarks();
    });
    sCheck.appendChild(checkSpan);
    line.appendChild(sCheck);

    // Col 2: toggleable ★ (off by default, per-port key ip:port)
    const sStar = document.createElement('div');
    sStar.className = 'path-col-spacer';
    const starSpan = document.createElement('span');
    const portKey = `${ip}:${port}`;
    const portFav = foundFavSet.has(portKey);
    starSpan.className = portFav ? 'star-on' : 'star-off';
    starSpan.textContent = '★';
    starSpan.title = portFav ? 'Favorite' : 'Add to favorites';
    starSpan.style.cursor = 'pointer';
    starSpan.addEventListener('click', e => {
      e.stopPropagation();
      const on = starSpan.className === 'star-on';
      if (on) { foundFavSet.delete(portKey); starSpan.className = 'star-off'; starSpan.title = 'Add to favorites'; }
      else     { foundFavSet.add(portKey);    starSpan.className = 'star-on';  starSpan.title = 'Favorite'; }
      saveMarks();
      if (_listFilter === 'favorites') applyListFilter();
    });
    sStar.appendChild(starSpan);
    line.appendChild(sStar);

    // Col 3: empty (light spacer)
    const sLight = document.createElement('div');
    sLight.className = 'path-col-spacer';
    line.appendChild(sLight);

    // Col 4: port label (under IP)
    const label = document.createElement('div');
    label.className = 'path-port-label';
    label.textContent = `:${port}`;
    line.appendChild(label);

    // Spacer for col 5 (+)
    const s5 = document.createElement('div');
    s5.className = 'path-col-spacer';
    line.appendChild(s5);

    // Col 6: links (under ping)
    const linksDiv = document.createElement('div');
    linksDiv.className = 'path-links';
    const proto=(port===443||port===8443)?'https':'http';
    paths.forEach(({p,l}, li) => {
      if (li>0) linksDiv.appendChild(document.createTextNode(' '));
      const a=document.createElement('span'); a.className='path-link';
      const url=`${proto}://${ip}:${port}${p}`;
      a.textContent=l; a.title=url;
      a.addEventListener('click', e=>{ e.stopPropagation(); openPreview(url); });
      linksDiv.appendChild(a);
    });
    line.appendChild(linksDiv);
    pFrag.appendChild(line);
  });
  pathsRow.appendChild(pFrag);

  if (openPorts.length > 0) {
    expandBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = pathsRow.classList.toggle('open');
      pathsRow.style.display = open ? 'flex' : 'none';
      expandBtn.textContent = open ? '−' : '+';
      expandBtn.classList.toggle('open', open);
      if (open) foundExpandedSet.add(ip); else foundExpandedSet.delete(ip);
      saveExpanded();
    });
  }

  // ── Left click → select only (no detail, no preview) ──
  row.addEventListener('click', () => {
    const wasSelected = row.classList.contains('selected');
    document.querySelectorAll('.lv-row.selected').forEach(r => r.classList.remove('selected'));
    if (!wasSelected) {
      row.classList.add('selected');
      previewContext.selectedRowEl = row;
    } else {
      previewContext.selectedRowEl = null;
    }
  });

  // Right click → context menu
  row.addEventListener('contextmenu', e=>{
    e.preventDefault();
    previewContext.targetIp = ip;
    previewContext.targetPorts = openPorts;
    const vw=window.innerWidth, vh=window.innerHeight;
    ctxMenu.style.left=Math.min(e.clientX, vw-175)+'px';
    ctxMenu.style.top=Math.min(e.clientY, vh-220)+'px';
    ctxMenu.classList.add('open');
  });

  listBody.appendChild(row);
  listBody.appendChild(pathsRow);
  applyListFilter();

  // Enrich extra columns if any enabled
  queueRowEnrichment(ip, openPorts, row);

  // ── Auto geo-locate for globe dots ──
  if (!ipGeoCoords[ip]) {
    geoLookup(ip).then(d => {
      // geoLookup already stores in ipGeoCoords and calls updateGlobeDots
      // Also update the IP cell with 🔓 flag if auth check was done separately
    });
  } else {
    updateGlobeDots();
  }

  saveResults();
}

// ══════════════════════════════════════════════════
//  RESULTS PERSISTENCE
// ══════════════════════════════════════════════════
// ── Restore on load ──
restoreResults();
// Re-apply saved sort (pre-flip dir so sortListView flips it back to saved value)
if (_sortCol) { _sortDir *= -1; sortListView(_sortCol); }
// Re-apply saved expanded state
foundExpandedSet.forEach(ip => {
  const row = document.querySelector(`.lv-row[data-ip="${CSS.escape(ip)}"]`);
  if (!row) return;
  const pathsRow = row.nextElementSibling;
  if (!pathsRow || !pathsRow.classList.contains('paths-row')) return;
  pathsRow.classList.add('open');
  pathsRow.style.display = 'flex';
  const btn = row.querySelector('.row-expand-btn');
  if (btn) { btn.textContent = '−'; btn.classList.add('open'); }
});

btnClear.addEventListener('click',()=>{
  foundHostsMap={}; foundPingMap={}; totalFound=0; totalOpenPorts=0;
  traceRoutes = {};
  listBody.innerHTML=''; listBody.appendChild(emptyRow);
  emptyRow.textContent = t('emptyRow');
  updateProgress(0,0,0,0); statTime.textContent='0.0s';
  setStatus(t('statusCleared'));
  const previewWrapEl = document.getElementById('previewWrap');
  const previewFrameEl = document.getElementById('previewFrame');
  if (previewWrapEl) previewWrapEl.classList.remove('open');
  if (previewFrameEl) previewFrameEl.src='about:blank';
  previewContext.selectedRowEl = null;
  previewContext.targetIp = '';
  previewContext.targetPorts = [];
  localStorage.removeItem('netrecon_results');
  localStorage.removeItem('netrecon_results_ts');
  localStorage.removeItem('netrecon_trace_routes');
  refreshTopologyFilterOptions();
  updateGlobeDots();
});

btnFactoryReset?.addEventListener('click', factoryResetApp);



applyLang();
applyScanDefaultsToMainInputs(loadScanDefaults());
restoreTraceRoutes();
refreshTopologyFilterOptions();

// ══════════════════════════════════════════════════
//  SCAN HISTORY MANAGEMENT
// ══════════════════════════════════════════════════

function addToScanHistory(rangeStr) {
  // Remove if already exists (move to front)
  scanHistory = scanHistory.filter(item => item !== rangeStr);
  // Add to front
  scanHistory.unshift(rangeStr);
  // Keep only MAX_HISTORY_ITEMS
  if (scanHistory.length > MAX_HISTORY_ITEMS) {
    scanHistory = scanHistory.slice(0, MAX_HISTORY_ITEMS);
  }
  // Save to localStorage
  localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(scanHistory));
  // Render the list
  renderScanHistory();
}

function removeFromScanHistory(rangeStr) {
  scanHistory = scanHistory.filter(item => item !== rangeStr);
  localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(scanHistory));
  renderScanHistory();
}

function buildHistoryIpNode(ip) {
  const ipWrap = document.createElement('span');
  ipWrap.className = 'scan-history-ip';

  const parts = String(ip || '').trim().split('.');
  if (parts.length !== 4) {
    ipWrap.textContent = String(ip || '').trim();
    return ipWrap;
  }

  parts.forEach((part, idx) => {
    const octet = document.createElement('span');
    octet.className = 'scan-history-octet';
    octet.textContent = String(part).trim();
    ipWrap.appendChild(octet);

    if (idx < 3) {
      const dot = document.createElement('span');
      dot.className = 'scan-history-sep';
      dot.textContent = '.';
      ipWrap.appendChild(dot);
    }
  });

  return ipWrap;
}

function buildHistoryRangeNode(rangeStr) {
  const rangeWrap = document.createElement('span');
  rangeWrap.className = 'scan-history-range-text';

  const parts = String(rangeStr || '').split(' - ').map(s => s.trim());
  if (parts.length !== 2) {
    rangeWrap.textContent = String(rangeStr || '');
    return rangeWrap;
  }

  rangeWrap.appendChild(buildHistoryIpNode(parts[0]));

  const dash = document.createElement('span');
  dash.className = 'scan-history-range-dash';
  dash.textContent = ' - ';
  rangeWrap.appendChild(dash);

  rangeWrap.appendChild(buildHistoryIpNode(parts[1]));
  return rangeWrap;
}

function renderScanHistory() {
  const historyList = document.getElementById('scanHistoryList');
  if (!historyList) return;

  if (scanHistory.length === 0) {
    historyList.innerHTML = '<div class="scan-history-empty">No history</div>';
    return;
  }

  historyList.innerHTML = '';
  scanHistory.forEach((rangeStr) => {
    const item = document.createElement('div');
    item.className = 'scan-history-item';
    item.dataset.range = rangeStr;

    const rangeEl = document.createElement('div');
    rangeEl.className = 'scan-history-item-range';
    rangeEl.appendChild(buildHistoryRangeNode(rangeStr));

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'scan-history-item-delete';
    deleteBtn.title = 'Delete';
    deleteBtn.textContent = '✕';

    item.appendChild(rangeEl);
    item.appendChild(deleteBtn);

    // Double-click to load range
    item.addEventListener('dblclick', () => {
      loadRangeFromHistory(rangeStr);
    });

    // Delete button
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromScanHistory(rangeStr);
    });

    historyList.appendChild(item);
  });
}

function loadRangeFromHistory(rangeStr) {
  // Parse "start - end" format
  const parts = rangeStr.split(' - ').map(s => s.trim());
  if (parts.length !== 2) return;

  const startIp = parts[0];
  const endIp = parts[1];

  // Validate IPs
  if (!isIPv4(startIp) || !isIPv4(endIp)) return;

  // Fill in the IP range fields
  setIP('f', startIp);
  setIP('t', endIp);

  // Highlight the item briefly
  const historyList = document.getElementById('scanHistoryList');
  if (historyList) {
    const items = historyList.querySelectorAll('.scan-history-item');
    items.forEach(item => {
      if (item.dataset.range === rangeStr) {
        item.classList.add('selected');
        setTimeout(() => item.classList.remove('selected'), 800);
      }
    });
  }
}

// Initialize history rendering on page load
renderScanHistory();
