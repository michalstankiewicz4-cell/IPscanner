// ══════════════════════════════════════════════════
//  Clippy — pomocnik 📎
// ══════════════════════════════════════════════════

(function () {
  const STORAGE_KEY = 'clippy_enabled';
  const TIP_INTERVAL_MS = 9000;

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

  // ── Public API ───────────────────────────────────
  window.clippySetLang = function (lang) {
    currentLang = lang && TIPS[lang] ? lang : 'en';
  };

  window.clippyShow = function () {
    const el = document.getElementById('clippy-container');
    if (el) {
      el.classList.remove('clippy-hidden');
      localStorage.setItem(STORAGE_KEY, '1');
      _showTip();
      _startTimer();
    }
  };

  window.clippyHide = function () {
    const el = document.getElementById('clippy-container');
    if (el) el.classList.add('clippy-hidden');
    localStorage.setItem(STORAGE_KEY, '0');
    _stopTimer();
  };

  window.clippyToggle = function () {
    const el = document.getElementById('clippy-container');
    if (!el) return;
    if (el.classList.contains('clippy-hidden')) {
      window.clippyShow();
    } else {
      window.clippyHide();
    }
  };

  window.clippyIsVisible = function () {
    const el = document.getElementById('clippy-container');
    return el && !el.classList.contains('clippy-hidden');
  };

  // ── Internals ────────────────────────────────────
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
    // force reflow so animation restarts
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

  // ── Init ─────────────────────────────────────────
  function _init() {
    const container = document.getElementById('clippy-container');
    if (!container) return;

    // Restore visibility from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === '1') {
      container.classList.remove('clippy-hidden');
      _showTip();
      _startTimer();
    } else {
      container.classList.add('clippy-hidden');
    }

    // Click character → next tip + restart timer
    const charEl = document.getElementById('clippy-char');
    if (charEl) {
      charEl.addEventListener('click', () => {
        _showTip(true);
        _startTimer();
      });
    }

    // Click bubble → next tip + restart timer
    const bubble = document.getElementById('clippy-bubble');
    if (bubble) {
      bubble.addEventListener('click', (e) => {
        if (e.target.id === 'clippy-close') return;
        _showTip(true);
        _startTimer();
      });
    }

    // Close [x] → hide
    const closeBtn = document.getElementById('clippy-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => window.clippyHide());
    }

    // Draggable
    _makeDraggable(container);
  }

  function _makeDraggable(el) {
    let startX, startY, origRight, origBottom;

    const handle = document.getElementById('clippy-char');
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
      // Only left button
      if (e.button !== 0) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      // Convert right/bottom to left/top for easier dragging
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = rect.left + 'px';
      el.style.top  = rect.top  + 'px';

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        el.style.left = (rect.left + dx) + 'px';
        el.style.top  = (rect.top  + dy) + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
