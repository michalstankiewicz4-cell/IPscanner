# NetRecon IP Auditor — Zasady Rozwoju Projektu

## 1. Architektura — narzędzia (Tools)

- **Każdy nowy tool jest niezależnym modułem** — własny plik JS (`js/tool-name.js`) i własny CSS (`css/tool-name.css`).
- Narzędzia co do zasady nie zależą od siebie — każde jest samodzielne.
- **Wyjątek:** narzędzia wizualizacji danych (np. Globe, Topology) mogą konsumować wyniki skanowania z głównego modułu skanera. W przyszłości możliwy jest przepływ danych między toolami — taki przepływ powinien odbywać się przez wspólne API lub event bus w `app.js`, nie przez bezpośrednie wywołania między modułami.
- Interfejs toola jest osadzony jako panel w głównym oknie aplikacji (`index.html`), otwierany przez menu lub skrót.
- Nowe narzędzia rejestrują się przez `app.js` (powiązanie zdarzeń, inicjalizacja).
- Każdy tool musi mieć wpis w plikach językowych (`lang-en.js` i `lang-pl.js`).

## 2. Clippy / Asystent AI

- Clippy działa jako **natywne okno OS** (Tauri `WebviewWindow`, `clippy.html`) — nie jako DOM overlay.
- Okno Clippy ma `always_on_top`, `transparent`, `decorations: false`, `skip_taskbar`.
- Fallback DOM (`#clippy-container`) jest używany tylko jeśli natywne okno nie odpowie w 1200 ms.
- Główne okno komunikuje się z oknem Clippy przez zdarzenia Tauri (`clippy-window-ready`, `clippy-window-closed`).

## 3. Katalog `app/` — mirror frontendu

- Katalog `app/` jest **generowany automatycznie** i nie jest wersjonowany (`.gitignore`).
- Przed każdym buildem lub uruchomieniem dev serwera należy wykonać:
  ```
  npm run prepare:app
  ```
  Skrypt kopiuje `index.html`, `clippy.html`, `css/`, `js/` do katalogu `app/`.
- **Nigdy nie edytuj plików w `app/` bezpośrednio** — zmiany zostaną nadpisane.

## 4. Wersjonowanie

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

## 5. Tłumaczenia (i18n)

- Każdy nowy tekst interfejsu musi być dodany do obu plików językowych:
  - `js/lang-en.js` — angielski (domyślny)
  - `js/lang-pl.js` — polski
- Klucze tłumaczeń są w formacie camelCase, np. `toolRadarTitle`, `btnScanStart`.
- Nie używaj hardcoded stringów w HTML ani w logice toola — zawsze przez system tłumaczeń.

## 6. Build i release

### Build testowy (tylko .exe, bez instalatora)
```
npm run prepare:app && npx tauri build --no-bundle
```
Wynik: `src-tauri/target/release/ipscanner-tauri.exe`

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

## 7. Git i .gitignore

Ignorowane katalogi (nie wersjonowane):
- `node_modules/`
- `src-tauri/target/` — artefakty Rust
- `src-tauri/gen/` — generowane schematy
- `app/` — mirror frontendu (generowany przez `prepare:app`)
- `release-*/` — foldery z artefaktami releasu
- `package-lock.json`

## 8. Skiny (motywy wizualne)

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

## 9. Konwencje kodu

- JavaScript: vanilla JS, bez frameworków (React/Vue itp.).
- Brak modułów ES (`import/export`) — skrypty ładowane jako `<script>` w HTML.
- CSS per-tool trzymany oddzielnie; zmienne globalne w `theme-base.css`.
- Rust (backend Tauri): logika pozycjonowania okien używa `PhysicalPosition<i32>` (nie `LogicalPosition`) dla poprawnego działania przy różnych DPI i wielu monitorach.
