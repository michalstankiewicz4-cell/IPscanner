const TIPS = {
  en: [
    "It looks like you're scanning a network!\nClick [+] on any row to expand open ports.",
    "Right-click an IP address for Geo, Device, Title and Access enrichment options.",
    "You can save Port Presets in Options -> Port Presets... for quick reuse.",
    "Use the Macro folder to automate repetitive scan tasks.",
    "The Speed Test button measures your current internet connection speed.",
    "The Globe view shows discovered hosts on a world map.",
    "Tip: increase Threads for faster scans on a reliable network.",
    "The Console lets you run raw ping, traceroute and nmap commands.",
    "You can switch UI skin to Classic or Glass under Options -> Customization...",
    "Click me for another tip!"
  ],
  pl: [
    "Wyglada na to, ze skanujesz siec!\nKliknij [+] w wierszu, aby rozwinac otwarte porty.",
    "Kliknij prawym na adres IP, aby uzyskac opcje Geo, Urzadzenie, Tytul i Dostep.",
    "Mozesz zapisac Presety Portow w Opcje -> Presety portow... i szybko je ponownie uzywac.",
    "Uzyj folderu Makr, aby zautomatyzowac powtarzalne zadania skanowania.",
    "Przycisk Speed Test mierzy aktualna predkosc twojego lacza internetowego.",
    "Widok Globus pokazuje wykryte hosty na mapie swiata.",
    "Wskazowka: zwieksz liczbe watkow, aby przyspieszyc skanowanie w stabilnej sieci.",
    "Konsola pozwala uruchamiac ping, traceroute i polecenia nmap bezposrednio.",
    "Mozesz zmienic wyglad aplikacji na Classic lub Glass w Opcje -> Dostosowanie...",
    "Kliknij mnie, zeby zobaczyc kolejna wskazowke!"
  ],
};

const params = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
let lang = params.get("lang") || "en";
if (!TIPS[lang]) lang = "en";

let tipIndex = 0;
let tipTimer = null;
const TIP_INTERVAL_MS = 9000;

const _invoke = window.__TAURI_INTERNALS__?.invoke;
const _getCurrentWindow =
  window.__TAURI__?.window?.getCurrentWindow ||
  window.__TAURI__?.webviewWindow?.getCurrentWindow ||
  window.__TAURI_INTERNALS__?.window?.getCurrentWindow;

function _startDraggingFallback() {
  const w = _getCurrentWindow ? _getCurrentWindow() : null;
  if (w && typeof w.startDragging === "function") {
    return w.startDragging();
  }
  return Promise.reject(new Error("startDragging unavailable"));
}

function _closeWindowFallback() {
  const w = _getCurrentWindow ? _getCurrentWindow() : null;
  if (w && typeof w.close === "function") {
    return w.close();
  }
  return Promise.reject(new Error("close unavailable"));
}

function tips() {
  return TIPS[lang];
}

function showTip(next) {
  if (next) tipIndex = (tipIndex + 1) % tips().length;
  const el = document.getElementById("clippy-tip-text");
  if (el) el.textContent = tips()[tipIndex];
  wiggle();
}

function wiggle() {
  const ch = document.getElementById("clippy-char");
  if (!ch) return;
  ch.classList.remove("clippy-wiggle");
  void ch.offsetWidth;
  ch.classList.add("clippy-wiggle");
}

function startTimer() {
  stopTimer();
  tipTimer = setInterval(() => showTip(true), TIP_INTERVAL_MS);
}

function stopTimer() {
  if (tipTimer) {
    clearInterval(tipTimer);
    tipTimer = null;
  }
}

document.getElementById("clippy-char").addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  if (_invoke) {
    _invoke("window_start_dragging").catch(() => {
      _startDraggingFallback().catch(() => {});
    });
    return;
  }
  _startDraggingFallback().catch(() => {});
});

document.getElementById("clippy-char").addEventListener("click", () => {
  showTip(true);
  startTimer();
});

document.getElementById("clippy-bubble").addEventListener("click", (e) => {
  if (e.target.id === "clippy-close") return;
  showTip(true);
  startTimer();
});

document.getElementById("clippy-close").addEventListener("click", () => {
  stopTimer();
  if (_invoke) {
    _invoke("window_close").catch(() => {
      _closeWindowFallback().catch(() => {});
    });
    return;
  }
  _closeWindowFallback().catch(() => {});
});

showTip(false);
startTimer();

if (_invoke) {
  _invoke("clippy_window_ready").catch(() => {});
}
