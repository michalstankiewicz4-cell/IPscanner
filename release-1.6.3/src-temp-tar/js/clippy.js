// ══════════════════════════════════════════════════
//  Clippy — pomocnik 📎
// ══════════════════════════════════════════════════

(function () {
  const STORAGE_KEY = 'clippy_enabled';
  const TIP_INTERVAL_MS = 9000;
  const FORCE_DOM_CLIPPY = true;

  // ── Skip in tool sub-windows (each is a separate WebviewWindow) ──
  const _isToolWindow = typeof _toolMode !== 'undefined' && !!_toolMode;
  if (_isToolWindow) return;

  const TIPS = {
    en: [
      "It looks like you're scanning a network!\nClick [+] on any row to expand open ports.",
      "Right-click an IP address for Geo, Device, Title and Access enrichment options.",
      "You can save Port Presets in Options → Port Presets... for quick reuse.",
      "Use the Macro folder to automate repetitive scan tasks.",
      "The Speed Test button measures your current internet connection speed.",
      "The Globe 🌍 view shows discovered hosts on a world map.",
      "Tip: increase Threads for faster scans on a reliable network.",
      "The Console ⌨ lets you run raw ping, traceroute and nmap commands.",
      "You can switch UI skin to Classic or Glass under Options → Customization...",
      "Click me for another tip! 😄",
    ],
    pl: [
      "Wygląda na to, że skanujesz sieć!\nKliknij [+] w wierszu, aby rozwinąć otwarte porty.",
      "Kliknij prawym na adres IP, aby uzyskać opcje Geo, Urządzenie, Tytuł i Dostęp.",
      "Możesz zapisać Presety Portów w Opcje → Presety portów... i szybko je ponownie używać.",
      "Użyj folderu Makr, aby zautomatyzować powtarzalne zadania skanowania.",
      "Przycisk Speed Test mierzy aktualną prędkość twojego łącza internetowego.",
      "Widok Globus 🌍 pokazuje wykryte hosty na mapie świata.",
      "Wskazówka: zwiększ liczbę wątków, aby przyspieszyć skanowanie w stabilnej sieci.",
      "Konsola ⌨ pozwala uruchamiać ping, traceroute i polecenia nmap bezpośrednio.",
      "Możesz zmienić wygląd aplikacji na Classic lub Glass w Opcje → Dostosowanie...",
      "Kliknij mnie, żeby zobaczyć kolejną wskazówkę! 😄",
    ],
  };

  let tipIndex = 0;
  let tipTimer = null;
  let currentLang = 'en';
  let nativeOpenAckAt = 0;

  // Reuse _tauriInvoke defined in app.js (loaded before clippy.js)
  const _invoke = (typeof _tauriInvoke !== 'undefined') ? _tauriInvoke : null;

  // ── Tauri native-window helpers ──────────────────────────────────
  function _openNativeClippy() {
    if (FORCE_DOM_CLIPPY) return false;
    if (!_invoke) return false;
    const requestStartedAt = Date.now();
    _invoke('open_clippy_window', { lang: currentLang }).catch((err) => {
      console.warn('open_clippy_window failed, using DOM fallback:', err);
      _showDOM();
    });
    setTimeout(() => {
      if (localStorage.getItem(STORAGE_KEY) !== '1') return;
      if (nativeOpenAckAt < requestStartedAt) {
        _showDOM();
      }
    }, 450);
    return true;
  }

  function _closeNativeClippy() {
    if (FORCE_DOM_CLIPPY) return false;
    if (!_invoke) return false;
    _invoke('close_clippy_window').catch((err) => {
      console.warn('close_clippy_window failed:', err);
    });
    return true;
  }

  // ── DOM fallback helpers (browser / non-Tauri) ───────────────────
  function _showDOM() {
    const el = document.getElementById('clippy-container');
    if (el) el.classList.remove('clippy-hidden');
    _showTip();
    _startTimer();
  }

  function _hideDOM() {
    const el = document.getElementById('clippy-container');
    if (el) el.classList.add('clippy-hidden');
  }

  // ── Public API ───────────────────────────────────────────────────
  window.clippySetLang = function (lang) {
    const prev = currentLang;
    currentLang = lang && TIPS[lang] ? lang : 'en';
    // Reopen native window with updated language
    if (_invoke && prev !== currentLang && localStorage.getItem(STORAGE_KEY) === '1') {
      _invoke('close_clippy_window')
        .catch((err) => {
          console.warn('close_clippy_window failed during lang switch:', err);
        })
        .finally(() => {
          _invoke('open_clippy_window', { lang: currentLang }).catch((err) => {
            console.warn('open_clippy_window failed during lang switch, using DOM fallback:', err);
            _showDOM();
          });
        });
    }
  };

  window.clippyShow = function () {
    localStorage.setItem(STORAGE_KEY, '1');
    _hideDOM();
    if (!_openNativeClippy()) {
      _showDOM();
    }
  };

  window.clippyHide = function () {
    localStorage.setItem(STORAGE_KEY, '0');
    _stopTimer();
    _closeNativeClippy();
    _hideDOM();
  };

  window.clippyToggle = function () {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      window.clippyHide();
    } else {
      window.clippyShow();
    }
  };

  window.clippyIsVisible = function () {
    return localStorage.getItem(STORAGE_KEY) === '1';
  };

  // ── Internals ────────────────────────────────────────────────────
  function _tips() {
    return TIPS[currentLang] || TIPS.en;
  }

  function _showTip(next) {
    const tips = _tips();
    if (next) {
      tipIndex = (tipIndex + 1) % tips.length;
    }
    const textEl = document.getElementById('clippy-tip-text');
    if (textEl) {
      textEl.textContent = tips[tipIndex];
    }
    _wiggle();
  }

  function _wiggle() {
    const ch = document.getElementById('clippy-char');
    if (!ch) return;
    ch.classList.remove('clippy-wiggle');
    void ch.offsetWidth;
    ch.classList.add('clippy-wiggle');
  }

  function _startTimer() {
    _stopTimer();
    tipTimer = setInterval(() => _showTip(true), TIP_INTERVAL_MS);
  }

  function _stopTimer() {
    if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
  }

  // ── Init ─────────────────────────────────────────────────────────
  function _init() {
    if (!FORCE_DOM_CLIPPY && window.__TAURI__?.event?.listen) {
      window.__TAURI__.event.listen('clippy-window-opened', () => {
        nativeOpenAckAt = Date.now();
        _hideDOM();
      }).catch(() => {});
    }

    // Listen for native clippy window closed event (user clicked ✕ in OS window)
    if (!FORCE_DOM_CLIPPY && window.__TAURI__?.event?.listen) {
      window.__TAURI__.event.listen('clippy-window-closed', () => {
        localStorage.setItem(STORAGE_KEY, '0');
      }).catch(() => {});
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === '1') {
      if (!_openNativeClippy()) {
        _showDOM();
      }
    }

    // DOM clippy event handlers (fallback / non-Tauri)
    const charEl = document.getElementById('clippy-char');
    if (charEl) {
      charEl.addEventListener('click', () => {
        _showTip(true);
        _startTimer();
      });
    }

    const bubble = document.getElementById('clippy-bubble');
    if (bubble) {
      bubble.addEventListener('click', (e) => {
        if (e.target.id === 'clippy-close') return;
        _showTip(true);
        _startTimer();
      });
    }

    const closeBtn = document.getElementById('clippy-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => window.clippyHide());
    }

    _makeDraggable(document.getElementById('clippy-container'));
  }

  function _makeDraggable(el) {
    if (!el) return;
    const handle = document.getElementById('clippy-char');
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = rect.left + 'px';
      el.style.top  = rect.top  + 'px';

      function onMove(ev) {
        el.style.left = (rect.left + (ev.clientX - startX)) + 'px';
        el.style.top  = (rect.top  + (ev.clientY - startY)) + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
