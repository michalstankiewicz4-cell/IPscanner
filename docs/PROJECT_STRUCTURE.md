# Struktura projektu

Ogolny przeglad folderow i plikow w repo. Szczegolowe zasady (podzial
shell/tool, konwencje nazewnictwa, warstwa mirror `app/`) sa w
`CONTRIBUTING.md`, sekcje 3 i 12 - ten plik to tylko mapa "co gdzie jest".

## Drzewko

```
IPscanner/
├── index.html                     # entrypoint New UI
├── test-ui.html                   # placeholder do testu przelaczania UI
├── package.json                   # skrypty npm (prepare:app, dev, tauri:*)
├── zebrus.png                     # logo aplikacji
├── README.md
├── CONTRIBUTING.md                # glowny dokument zasad projektu
├── CODE_OF_CONDUCT.md / SECURITY.md / LICENSE.md
├── CNAME / .nojekyll / google....html   # konfiguracja GitHub Pages
│
├── docs/
│   ├── PROJECT_STRUCTURE.md       # ten plik
│   ├── CHANGELOG.md
│   ├── ROADMAP.md
│   ├── FUTURE_PLUGIN_SHELL.md
│   ├── SHELL_PROGRESS.md
│   ├── SESSION_DATABASE_SCHEMA.md
│   ├── MEMORY_SESSION.md
│   ├── TROUBLESHOOTING.md
│   └── STYLELIST.md
│
├── css/new-ui/
│   ├── new-ui.css                 # glowny import calego lancucha
│   ├── base/                      # tokens.css, scrollbars.css
│   ├── components/                # cards, menubar, statusbar, console,
│   │                               #   assistant, clippy, extensions
│   ├── layout/main.css             # siatka activity bar/LS/CS/RS
│   ├── shell/preload.css
│   ├── skins/default.css
│   └── tools/
│       ├── ip-scanner/            # scanner-actions.css, scanner-sidebar-controls.css
│       └── shellcraft/shellcraft.css
│
├── js/new-ui/
│   ├── core/
│   │   ├── bootstrap-runtime.js   # orkiestracja calej aplikacji
│   │   ├── store.js / i18n.js / theme.js
│   │   ├── tool-catalog.js / ui-definitions.js
│   │   ├── extensions.js          # host rozszerzen
│   │   ├── menu-runtime.js
│   │   ├── panels-runtime.js      # routing + silnik detached-card
│   │   ├── panel-content-runtime.js / panel-content-config.js
│   │   ├── panel-renderers-runtime.js
│   │   ├── panel-interactions-runtime.js
│   │   ├── scanner-sidebar-runtime.js
│   │   ├── session-runtime.js
│   │   ├── general-settings-runtime.js
│   │   ├── macros-runtime.js / shellcraft-canvas-runtime.js
│   │   ├── powershell-console-runtime.js
│   │   ├── presets-runtime.js
│   │   ├── platform-runtime.js    # adapter desktop/web
│   │   ├── app-version.js / versions-data.js
│   │   │
│   │   ├── runtimes/
│   │   │   ├── navigation-runtime.js
│   │   │   ├── ip-inputs-runtime.js
│   │   │   ├── ip-library-runtime.js
│   │   │   ├── language-catalog-runtime.js
│   │   │   ├── addon-catalog-runtime.js
│   │   │   ├── layout-runtime.js
│   │   │   ├── custom-scrollbar-runtime.js
│   │   │   ├── command-bus-runtime.js
│   │   │   ├── session-sqlite-runtime.js
│   │   │   ├── status-log-runtime.js
│   │   │   ├── statusbar-loader-runtime.js
│   │   │   ├── clippy-runtime.js
│   │   │   └── update-check-runtime.js
│   │   │
│   │   └── utils/
│   │       ├── dom-utils.js
│   │       └── net-utils.js
│   │
│   └── vendor/sql-js/              # sql.js (SQLite w JS/WASM)
│
├── languages/                      # jezyki doinstalowywane: ar.json, de.json, pl.json
│
├── scripts/
│   └── sync-version.js
│
├── src-tauri/                      # backend desktopowy (Tauri v2, Rust)
│   ├── src/main.rs                 # komendy Tauri (invoke)
│   ├── tauri.conf.json
│   ├── Cargo.toml / Cargo.lock
│   ├── build.rs
│   ├── capabilities/default.json
│   ├── icons/
│   ├── nsis/                       # szablon instalatora Windows
│   └── gen/schemas/                # wygenerowane, nie edytowac
│
├── tools/                          # katalog dodatkow (manifest + ikona)
│
├── .github/                        # szablony issue/PR
│
└── app/                            # (nie w repo) mirror generowany przez
                                     #   npm run prepare:app - nigdy nie edytowac
```

## Pliki w katalogu glownym

- `index.html` - aktywny, domyslny entrypoint aplikacji (New UI). Jedyne
  miejsce, gdzie recznie dodaje sie `<script>`/`<link>` do plikow z
  `css/new-ui/**` i `js/new-ui/**`.
- `test-ui.html` - minimalny placeholder, demonstrowal kiedys koncepcje
  przelaczania UI przez zwykla podmiane strony (bez zapisu wyboru); jedyny
  punkt dostepu (radio "Default"/"Test" w Options -> General) zostal
  usuniety razem z mechanizmem "Show unfinished tools" - plik nadal
  istnieje i jest kopiowany do builda (`prepare:app`), ale nic go dzis nie
  linkuje.
- `package.json` - skrypty npm (`prepare:app`, `dev`, `tauri:dev`,
  `tauri:build`, `sync-version`) i devDependencies (Tauri CLI, http-server).
- `zebrus.png` - logo/branding aplikacji.
- `CNAME`, `.nojekyll`, `google92e57e1469c0d4f8.html` - konfiguracja GitHub
  Pages (`ipscanner.pl`) i weryfikacja Google Search Console.
- `README.md` - opis projektu dla odwiedzajacych repo.
- `CONTRIBUTING.md` - glowny dokument zasad: architektura New UI, podzial
  shell/tool, konwencje nazewnictwa, system dodatkow, jezyki, smoke-test
  matrix. Punkt startowy przed kazda wieksza zmiana.
- `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE.md` - standardowe
  dokumenty spolecznosciowe/prawne.
- `.gitignore` - m.in. wyklucza `app/` (mirror buildowy) i `node_modules/`.

## `docs/`

Dokumentacja pomocnicza, nie ladowana przez aplikacje:

- `CHANGELOG.md` - dziennik zmian w formie notatek per data.
- `ROADMAP.md` - zaplanowane/odlozone funkcje (backlog), w tym pozycje
  zapamietane z rozmow "zrob to pozniej".
- `FUTURE_PLUGIN_SHELL.md` - docelowa wizja: IP Scanner jako
  instalowalny/odinstalowywalny dodatek na neutralnej powloce; opisuje tez
  odrzucona sciezke sandboxingu przez WASM.
- `SHELL_PROGRESS.md` - postep rozdzielania kodu na warstwe shell (generyczna)
  i tool (specyficzna dla IP Scannera).
- `SESSION_DATABASE_SCHEMA.md` - schemat bazy SQLite uzywanej do zapisu/
  odczytu sesji (zakladki, layout, historia).
- `MEMORY_SESSION.md` - notatki miedzy-sesyjne (kontekst dla dalszej pracy).
- `TROUBLESHOOTING.md` - znane problemy i ich rozwiazania.
- `STYLELIST.md` - notatki z powolnego, przyrostowego eksperymentu z
  alternatywnym UI (zakladka "Style" w CS).
- `PROJECT_STRUCTURE.md` - ten plik.

## `css/new-ui/`

Style aktywnego UI (jedyne ladowane arkusze, poza starymi `css/*.css`
legacy, ktore nie sa juz uzywane):

- `new-ui.css` - glowny plik spinajacy import calego lancucha arkuszy.
- `base/` - fundamenty: `tokens.css` (zmienne/kolory/spacing), `scrollbars.css`
  (custom/faux scrollbar).
- `components/` - style komponentow uzywanych w wielu miejscach: `cards.css`
  (karty/panele/ustawienia), `menubar.css`, `statusbar.css`, `console.css`,
  `assistant.css` (RS/AI Assistant i Profiles), `clippy.css`, `extensions.css`.
- `layout/main.css` - siatka glownego ukladu (activity bar/LS/CS/RS, resizery).
- `shell/preload.css` - style ladowane najwczesniej (unikanie FOUC).
- `skins/default.css` - domyslny skin (motyw kolorystyczny).
- `tools/ip-scanner/` - style specyficzne dla narzedzia IP Scanner
  (`scanner-actions.css`, `scanner-sidebar-controls.css`).
- `tools/shellcraft/shellcraft.css` - style narzedzia ShellCraft (biblioteka/
  canvas/inspector do budowania makr).

## `js/new-ui/`

Logika aktywnego UI, zaladowana wylacznie jako zwykle `<script>` (bez
bundlera), kazdy plik w IIFE rejestrujacym sie na
`window.NetReconNewUICore`:

- `core/` - moduly bazowe i orkiestracja:
  - `bootstrap-runtime.js` - orkiestruje cala aplikacje przy starcie
    (tworzy/spina wszystkie runtime, ale nie implementuje logiki docelowo
    zyjacej gdzie indziej).
  - `store.js` - stan UI i subskrypcje.
  - `i18n.js` - wbudowane slowniki (en/pl) i wybor jezyka.
  - `theme.js` - wybor skinu i podmiana arkusza.
  - `tool-catalog.js`, `ui-definitions.js` - katalog metadanych narzedzi i
    mapa odpowiedzialnosci menu/paneli.
  - `extensions.js` - host rozszerzen: manifest, uprawnienia, install/
    uninstall, katalog.
  - `menu-runtime.js` - obsluga menubara i akcji menu.
  - `panels-runtime.js` - routing aktywnego narzedzia, generyczny silnik
    detached-card/workbench-tab (open/close/detach/arrange/resize).
  - `panel-content-runtime.js` / `panel-content-config.js` - renderowanie
    tresci/szablonow narzedzi (markup), bez logiki stanu.
  - `panel-renderers-runtime.js` - renderery fragmentow (listy/tabele) bez
    event bindingu.
  - `panel-interactions-runtime.js` - interakcje specyficzne dla widokow
    (timeline, tabela wynikow, ustawienia General itp.).
  - `scanner-sidebar-runtime.js` - sidebar skanera IP (Range/CIDR, Ports/ICMP,
    Config, Profiles, wykrywanie IP).
  - `session-runtime.js` - zapis/odczyt/zamkniecie sesji, przywracanie ukladu
    zakladek.
  - `general-settings-runtime.js` - ustawienia ogolne (co jest pamietane przy
    starcie).
  - `macros-runtime.js`, `shellcraft-canvas-runtime.js` - narzedzie ShellCraft
    (biblioteka/canvas/makra).
  - `powershell-console-runtime.js` - zintegrowana konsola PowerShell.
  - `presets-runtime.js` - presety portow skanera.
  - `platform-runtime.js` - adapter platformy (desktop Tauri / web), jedyny
    punkt wejscia do invoke/window/storage.
  - `app-version.js`, `versions-data.js` - wersja aplikacji i historia wersji
    (zakladka Versions).
- `core/runtimes/` - dodatkowe runtime UI, kazdy jako osobna "siostrzana"
  fabryka wolana z `panels-runtime.js` lub `bootstrap-runtime.js`:
  - `navigation-runtime.js` - start/stop skanu, wykrywanie IP (External/
    Local/Subnets), inline skrypty PowerShell.
  - `ip-inputs-runtime.js` - segmentowane pola IP, tryb Range/CIDR.
  - `ip-library-runtime.js` - narzedzie Country IP Library (parsowanie,
    cache, PowerShell update).
  - `language-catalog-runtime.js` - katalog jezykow z GitHuba (Language
    Manager).
  - `addon-catalog-runtime.js` - katalog dodatkow z GitHuba ("www addons").
  - `layout-runtime.js` - resizery i zachowanie paneli (left/right/bottom).
  - `custom-scrollbar-runtime.js` - faux scrollbar, odswiezanie hostow.
  - `command-bus-runtime.js` - generyczny rejestr komend (`register`/
    `invoke`), uzywany przez komendy z dodatkow.
  - `session-sqlite-runtime.js` - warstwa SQLite (w tym WASM na www) pod
    sesje.
  - `status-log-runtime.js` - centralny log statusow (dolna zakladka
    Console).
  - `statusbar-loader-runtime.js` - licznik zajetosci/loader w pasku stanu.
  - `clippy-runtime.js` - asystent/maskotka UI.
  - `update-check-runtime.js` - sprawdzanie aktualizacji przy starcie
    (GitHub Releases), z przelacznikiem w ustawieniach.
- `core/utils/` - pomocnicze funkcje bez logiki widokowej: `dom-utils.js`
  (m.in. `escapeHtml`), `net-utils.js` (walidacja/parsowanie IP, CIDR).
- `vendor/sql-js/` - biblioteka sql.js (SQLite w JS/WASM) do zapisu sesji w
  trybie www.

## `languages/`

Doinstalowywalne jezyki UI jako pliki `.json` (`code`/`name`/`version`/
`flag`/opcjonalnie `rtl`/`dictionary`) - dziala z nimi Language Manager
(katalog z GitHuba lub import lokalny). Angielski i polski sa wbudowane
inline w `i18n.js` i nie potrzebuja tu pliku; `ar.json`/`de.json`/`pl.json`
to jezyki doinstalowywane.

## `scripts/`

- `sync-version.js` - synchronizuje numer wersji miedzy `package.json` a
  `tauri.conf.json`/UI. Jedyny plik w tym katalogu - logika PowerShell
  aktualizujaca Country IP Library jest teraz inline w
  `ip-library-runtime.js` (`buildUpdateCountryIpLibraryCommand`), tak samo
  jak wykrywanie IP w `navigation-runtime.js`.

## `src-tauri/`

Backend desktopowy (Tauri v2, Rust):

- `src/main.rs` - komendy Tauri (`invoke`), w tym `run_powershell` i
  wykrywanie IP; logika niezalezna od konkretnego UI.
- `tauri.conf.json` - konfiguracja aplikacji (m.in. `frontendDist: "../app"`,
  CSP, `bundle.resources`).
- `Cargo.toml`/`Cargo.lock` - zaleznosci Rust.
- `build.rs` - skrypt budowania Tauri.
- `capabilities/default.json` - uprawnienia/capability Tauri v2.
- `icons/` - ikony aplikacji w roznych rozdzielczosciach (`.png`/`.ico`).
- `nsis/` - szablon instalatora Windows (NSIS).
- `gen/schemas/` - wygenerowane schematy (nie edytowac recznie).

## `tools/`

Katalog dodatkow (addonow) wystawiany przez GitHub Contents API jako
katalog instalowalny z UI (Options -> Import Tool). Kazdy dodatek to para
plikow `<nazwa>.json` (manifest z `contributions`) + opcjonalnie
`<nazwa>.png`/`.svg` (ikona parowana po nazwie pliku).

## `.github/`

Szablony spolecznosciowe GitHuba: `ISSUE_TEMPLATE/` (bug report, feature
request, config) i `PULL_REQUEST_TEMPLATE.md`.

## `app/` (nie w repo, generowane)

Mirror buildowy tworzony przez `npm run prepare:app` (kopiuje `index.html`,
`test-ui.html`, `zebrus.png`, `css/new-ui/**`, `js/new-ui/**`). To wlasnie
ten folder pakuje Tauri (`frontendDist: "../app"`) i serwuje `npm run dev`.
Nigdy nie edytowac recznie - kazda zmiana ma zrodlo w `index.html`/`css/`/
`js/` w katalogu glownym.
