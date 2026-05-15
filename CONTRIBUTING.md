# NetRecon IP Auditor — Zasady Rozwoju Projektu

## 1. Architektura — narzędzia (Tools)

- **Każdy nowy tool jest niezależnym modułem** — własny plik JS (`js/tool-name.js`) i własny CSS (`css/tool-name.css`).
- Narzędzia co do zasady nie zależą od siebie — każde jest samodzielne.
- **Wyjątek:** narzędzia wizualizacji danych (np. Globe, Topology) mogą konsumować wyniki skanowania z głównego modułu skanera. Przepływ danych między toolami powinien odbywać się przez wspólne API lub event bus w `app.js`, nie przez bezpośrednie wywołania między modułami.
- Interfejs toola jest osadzony jako `tool-win-shell` div w `index.html`; otwierany przez menu lub skrót klawiaturowy.
- Nowe narzędzia rejestrują się przez `app.js` (powiązanie zdarzeń, inicjalizacja) i/lub we własnym pliku JS.
- Każdy tool musi mieć wpis w plikach językowych (`lang-en.js` i `lang-pl.js`).

### Natywne okna toolów (Tauri desktop)

W trybie desktop każdy `tool-win-shell` może być otwarty jako **osobne natywne okno OS** (`WebviewWindow`) zamiast pływającego panelu w głównym oknie.

**Aby dodać tool jako natywne okno:**

1. **Kontener HTML:** użyj `<div class="tool-win-shell" id="nazwaWin" style="display:none">` z tytelbarem `<div class="titlebar cursor-move" id="nazwaTitlebar">` i przyciskiem `<button id="btnNazwaClose">✕</button>`.

2. **Rust — rejestracja okna (`src-tauri/src/main.rs`):**
   - W `open_tool_window` dodaj case:
     ```rust
     "nazwa-toola" => ("tool-label", "NetRecon - Tytuł", szerokość, wysokość),
     ```
   - W `const TOOL_WINDOW_LABELS: &[&str]` dodaj `"tool-label"` — to zapewni zamknięcie okna wraz z głównym oknem aplikacji.

3. **JS — funkcja open:** wywołaj `openToolNativeWindow('nazwa-toola')` przed fallbackiem DOM:
   ```js
   function openNazwaDlg() {
     if (typeof openToolNativeWindow === 'function' && openToolNativeWindow('nazwa-toola')) return;
     const win = document.getElementById('nazwaWin');
     if (!win) return;
     win.style.display = 'flex';
     // ...
   }
   ```

4. **JS — funkcja close:** obsłuż tryb standalone:
   ```js
   function closeNazwaDlg() {
     if (typeof _toolMode !== 'undefined' && _toolMode === 'nazwa-toola') {
       if (typeof closeMainWindow === 'function') closeMainWindow();
       return;
     }
     document.getElementById('nazwaWin').style.display = 'none';
   }
   ```

5. **`toolToWindow` w `app.js`:** dodaj wpis w mapie `toolToWindow` wewnątrz `applyToolWindowMode()`:
   ```js
   'nazwa-toola': 'nazwaWin',
   ```

6. **CSS (`theme-base.css`):** dodaj klasy `.nazwa-win`, `.nazwa-body` (wzoruj się na `.sniffer-win`, `.sniffer-body`).

7. **Auto-init w trybie standalone** (gdy tool uruchamia się w osobnym oknie, `_toolMode === 'nazwa-toola'`): na końcu pliku JS toola dodaj blok inicjalizujący.

## 2. Wersja web vs wersja desktop

Aplikacja działa w **dwóch trybach**:

| Tryb | Jak uruchamiany | Dostępność |
|------|-----------------|------------|
| **Desktop (Tauri)** | `ipscanner.exe` | Pełna funkcjonalność |
| **Web (przeglądarka)** | GitHub Pages / [ipscanner.pl](https://ipscanner.pl) | Ograniczona — patrz niżej |

### Funkcje dostępne tylko w trybie desktop

Kod sprawdza `_isTauriDesktop` (flaga z `app.js`) lub `_tauriInvoke` (null w przeglądarce). Następujące funkcje są **niedostępne w trybie web**:

- Skanowanie portów TCP przez Rust (`scan_port`) — fallback przez `fetch()` no-cors (mniej dokładny)
- Otwieranie toolów jako natywne okna OS (`open_tool_window`)
- Network Sniffer (`get_connections`) — wymaga dostępu do netstat przez Rust
- WiFi Detector (`list_wifi_networks`, `get_wifi_network_details`)
- IP Scan Watch (`check_scan_watch`) — wymaga netstat
- Geo lookup przez lokalną bazę GeoIP (`geo_lookup`) — fallback przez zewnętrzne API
- Hostname lookup (`hostname_lookup`)
- Clippy jako natywne okno — fallback na DOM overlay
- Wszystkie komendy konsoli systemowej (`run_command`)

### Zasady pisania kodu dla obu trybów

- Zawsze sprawdzaj `_tauriInvoke` przed wywołaniem komendy Tauri i zapewnij fallback lub informację o braku funkcji w przeglądarce.
- Dla toolów wymagających backendu Rust wyświetl komunikat typu `"Funkcja dostępna tylko w wersji desktop"`.
- Skanowanie TCP ma automatyczny fallback na `fetch()` — nie wymaga osobnej obsługi.

## 3. Clippy / Asystent AI

- Clippy działa jako **natywne okno OS** (Tauri `WebviewWindow`, `clippy.html`) — nie jako DOM overlay.
- Okno Clippy ma `always_on_top`, `transparent`, `decorations: false`, `skip_taskbar`.
- Fallback DOM (`#clippy-container`) jest używany tylko jeśli natywne okno nie odpowie w 1200 ms.
- Główne okno komunikuje się z oknem Clippy przez zdarzenia Tauri (`clippy-window-ready`, `clippy-window-closed`).

## 4. Katalog `app/` — mirror frontendu

- Katalog `app/` jest **generowany automatycznie** i nie jest wersjonowany (`.gitignore`).
- Przed każdym buildem lub uruchomieniem dev serwera należy wykonać:
  ```
  npm run prepare:app
  ```
  Skrypt kopiuje `index.html`, `clippy.html`, `css/`, `js/` do katalogu `app/`.
- **Nigdy nie edytuj plików w `app/` bezpośrednio** — zmiany zostaną nadpisane.

## 5. Wersjonowanie

Wersja jest przechowywana w **4 miejscach** — wszystkie muszą być zsynchronizowane ręcznie lub przez skrypt:

| Plik | Lokalizacja |
|------|-------------|
| `package.json` | `"version": "x.y.z"` |
| `src-tauri/Cargo.toml` | `version = "x.y.z"` |
| `src-tauri/tauri.conf.json` | `"version": "x.y.z"` i `"title"` |
| `js/app.js` | `const APP_VERSION = 'x.y.z'` |

Skrypt synchronizacji (może wymagać korekty na Windows):
```
npm run sync-version
```

Przy każdym bumpieniu wersji dodaj też wpis do **Help → Versions** w `index.html` (sekcja `#dlgVersionsOverlay`).

## 6. Tłumaczenia (i18n)

- Każdy nowy tekst interfejsu musi być dodany do obu plików językowych:
  - `js/lang-en.js` — angielski (domyślny)
  - `js/lang-pl.js` — polski
- Klucze tłumaczeń są w formacie camelCase, np. `toolRadarTitle`, `btnScanStart`.
- Nie używaj hardcoded stringów w HTML ani w logice toola — zawsze przez system tłumaczeń.

## 7. Build i release

### Serwer deweloperski (web)
```
npm run dev
```
Uruchamia `http-server` na porcie 1420. Otwórz `http://localhost:1420` w przeglądarce. Uwaga: tryb web ma ograniczenia (patrz sekcja 2).

### Build testowy (tylko .exe, bez instalatora)
```
npm run prepare:app && npx tauri build --no-bundle
```
Wynik: `src-tauri/target/release/ipscanner.exe`

### Build pełny (z instalatorami)
```
npm run tauri:build
```
Wynik: `.exe` portable, NSIS setup, MSI — w `src-tauri/target/release/bundle/`

### Wymagane artefakty każdego releasu

Każdy publiczny release **musi zawierać 4 pliki**:

| Artefakt | Opis |
|----------|------|
| `*-portable.exe` | Przenośny plik `.exe`, bez instalacji |
| `*-setup.exe` | Instalator NSIS |
| `*.msi` | Instalator MSI (Windows Installer) |
| `source-vX.Y.Z.zip` | Kod źródłowy do samodzielnej kompilacji |

Paczka źródłowa (`source-*.zip`) powinna zawierać kod bez `node_modules/`, `src-tauri/target/` i `app/` — tylko to co jest w repozytorium.

### Release na GitHub
1. Zbuduj artefakty (pełny build).
2. Utwórz tag Git: `git tag v1.x.y && git push origin v1.x.y`
3. Spakuj kod źródłowy: `git archive --format=zip HEAD -o source-v1.x.y.zip`
4. Opublikuj release przez GitHub CLI:
   ```
   gh release create v1.x.y --title "v1.x.y" --notes "..." portable.exe setup.exe installer.msi source-v1.x.y.zip
   ```

### Zasady buildu
- Domyślnie build tylko `.exe` (`--no-bundle`) na potrzeby testów.
- Pełne pakiety (NSIS/MSI) tworzy się tylko na potrzeby releasu publicznego.
- Nigdy nie pushuj kodu ani nie twórz releasu bez wyraźnej zgody.

## 8. Git i .gitignore

Ignorowane katalogi (nie wersjonowane):
- `node_modules/`
- `src-tauri/target/` — artefakty Rust
- `src-tauri/gen/` — generowane schematy
- `app/` — mirror frontendu (generowany przez `prepare:app`)
- `release-*/` — foldery z artefaktami releasu
- `package-lock.json`

## 9. Skiny (motywy wizualne)

Aplikacja posiada **6 wbudowanych skinów**. Każdy nowy tool musi być z nimi kompatybilny:

| Plik CSS | Nazwa skinu |
|----------|-------------|
| `theme-base.css` | baza (zmienne współdzielone, zawsze ładowana) |
| `theme-black-flat.css` | Black Flat |
| `theme-glass.css` | Glass |
| `theme-purple-dark.css` | Purple Dark |
| `theme-retrogray.css` | Retro Gray |
| `theme-workbench.css` | Workbench |

**Zasady:**
- Używaj wyłącznie zmiennych CSS z `theme-base.css` (np. `--color-bg`, `--color-accent`) — nie hardcoduj kolorów.
- Nie dodawaj reguł specyficznych dla konkretnego skinu do pliku toola.
- Po dodaniu nowego toola przetestuj go wizualnie na każdym ze skinów.

## 10. Konwencje kodu

- JavaScript: vanilla JS, bez frameworków (React/Vue itp.).
- Brak modułów ES (`import/export`) — skrypty ładowane jako `<script>` w HTML w określonej kolejności.
- CSS per-tool trzymany oddzielnie; zmienne globalne w `theme-base.css`.
- Rust (backend Tauri): logika pozycjonowania okien używa `PhysicalPosition<i32>` (nie `LogicalPosition`) dla poprawnego działania przy różnych DPI i wielu monitorach.

### Kolejność ładowania skryptów w `index.html`

Kolejność `<script>` na końcu `index.html` jest istotna — moduły zależą od globalnych zmiennych poprzednich:

```
js/lang-en.js / js/lang-pl.js   — i18n (pierwsze)
js/scan-guards.js               — dialogi potwierdzające skanowanie
js/scan-results-persistence.js  — zapis/odczyt wyników
js/preview-context.js           — podgląd i kontekst hosta
js/app.js                       — główna logika, globalne zmienne (_tauriInvoke, _toolMode, itp.)
js/scan-runner.js               — startScan/stopScan (wymaga app.js)
js/ip-detection.js              — detekcja IP (wymaga app.js)
[narzędzia]                     — każdy tool JS po app.js
```

### Globalne mosty (bridges)

| Zmienna | Opis |
|---------|------|
| `_tauriInvoke` | Funkcja do wywoływania komend Rust; `null` w przeglądarce |
| `_isTauriDesktop` | Boolean: czy środowisko to Tauri |
| `_toolMode` | String: nazwa toola gdy okno otwarte jako standalone, np. `'sniffer'`; `null` w głównym oknie |
| `window.__tauriInvoke` | Publiczny alias `_tauriInvoke` dla modułów |
| `window.__scanRuntime` | Bridge do stanu skanowania (moduł `scan-runner.js`) |
| `window.__scanDom` | Bridge do elementów DOM skanowania |
| `window.__previewContext` | Bridge do kontekstu podglądu hosta |
