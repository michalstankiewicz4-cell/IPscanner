# NetRecon IP Auditor - CONTRIBUTING

## 1. Aktualny kierunek projektu

Repo zawiera stabilny rdzen skanera oraz kilka wariantow UI. Aktualny kierunek rozwoju to:

- utrzymanie kompatybilnosci istniejacej logiki skanera,
- modularyzacja newUI (core + adaptery UI),
- przygotowanie systemu rozszerzen (manifest contributions),
- porzadkowanie stylow i i18n bez regresji funkcjonalnych.

W praktyce: zmiany w warstwie UI powinny byc izolowane od logiki skanowania.

## 2. Zasady zmian

- Nie mieszaj refaktoru UI z duzymi zmianami backendu skanera w jednym PR.
- Nie edytuj katalogu app recznie - to mirror generowany skryptem.
- W new UI preferuj male moduly w js/new-ui/core zamiast rozbudowy inline script.
- Zanim dodasz nowy tekst UI, dodaj klucze do i18n.
- Nie zostawiaj hardcoded tekstow user-facing (tooltip, aria-label, status line) w runtime; tekst powinien przechodzic przez i18n.
- Dla opisow narzedzi (tool catalog) uzywaj kluczy i18n w formacie toolText_<tool_id_z_podkresleniami>.
- W ui-definitions preferuj purposeKey; pole purpose traktuj jako awaryjny fallback.
- Zachowuj backward compatibility danych i stanu (localStorage keys, nazwy akcji itp.).
- Kazdy nowy przewijalny obszar New UI musi byc zgodny z systemem custom scrollbar (faux scrollbar).
- W frameless window (decorations=false) nie przechwytuj zdarzen klikniecia elementow interaktywnych przez logike drag okna.

## 3. Architektura New UI (stan docelowy)

Minimalny podzial odpowiedzialnosci:

- store.js - stan UI i subskrypcje,
- i18n.js - slowniki i wybor jezyka,
- theme.js - wybor skinu i podmiana arkusza skinu,
- tool-catalog.js - katalog metadanych narzedzi,
- extensions.js - host rozszerzen i contributions.
- ui-definitions.js - mapa odpowiedzialnosci menu i paneli.
- menu-runtime.js - obsluga menubar i akcji menu.
- panels-runtime.js - routing aktywnego narzedzia i odswiezanie panelu glownego.
- extension-manager-runtime.js - obsluga panelu rozszerzen i jezykow.
- scanner-sidebar-runtime.js - obsluga sidebaru skanera (wykrywanie IP, historia zakresow, extractor).
- powershell-console-runtime.js - obsluga zintegrowanej konsoli PowerShell.
- runtimes/status-log-runtime.js - centralny log statusow (dolna zakladka Console / pane info).
- runtimes/layout-runtime.js - resizery i zachowanie paneli (left/right/bottom).
- runtimes/custom-scrollbar-runtime.js - faux scrollbar i odswiezanie hostow przewijania.
- runtimes/ip-inputs-runtime.js - segmentowane pola IP oraz synchronizacja hidden inputow zakresu.
- runtimes/navigation-runtime.js - obsluga aktywnosci sidebar/results, zakladek dolnego panelu i routingu klikniec data-tool.

Skrypty PowerShell (source of truth):

- katalog `scripts/` zawiera skrypty uruchamiane przez runtime/desktop (Tauri `run_powershell`),
- wykrywanie IP jest rozdzielone na osobne skrypty: `detect-external-ip.ps1`, `detect-local-ip.ps1`, `detect-subnet-cidr.ps1`,
- aktualizacja biblioteki krajow jest realizowana przez `update-country-ip-library.ps1`,
- przy zmianie logiki preferuj edycje skryptu w `scripts/` zamiast rozbudowy inline command string w JS.

index.html powinien byc glownie adapterem DOM i eventow.

### 3a. Granica UI vs Content (obowiazkowa)

Dla warstwy paneli utrzymujemy twardy podzial odpowiedzialnosci:

- `panel-content-runtime.js` - renderowanie tresci i szablonow (markup), bez logiki stanu i bez routingu narzedzi.
- `panels-runtime.js` - stan aktywnego narzedzia, routing, lifecycle renderu i obsluga zdarzen UI.
- `panel-interactions-runtime.js` - interakcje specyficzne dla widokow (timeline, tabela wynikow, itp.).

Zasady:

- Nie umieszczaj logiki biznesowej skanera ani logiki routingu w rendererach tresci.
- Nie przenos event bindingu globalnego do `panel-content-runtime.js`.
- Teksty user-facing musza przechodzic przez i18n (brak nowych hardcoded tekstow w rendererach).
- Duze statyczne tresci (np. About/License/help text) utrzymuj jako dane wejsciowe konfiguracji, a nie rozproszony inline markup w wielu runtime.

Mapa odpowiedzialnosci jest utrzymywana centralnie i nie powinna byc dublowana w wielu miejscach.

- definicje menu i akcji: `js/new-ui/core/ui-definitions.js`,
- definicje paneli: `js/new-ui/core/ui-definitions.js`,
- wykonanie zachowan akcji: runtime modules + `index.html` jako bootstrap/adaptor New UI.

Aktualne pliki wejściowe UI:

- `index.html` - New UI (aktywny domyślny entrypoint aplikacji),
- `old-ui.html` - Legacy UI (utrzymanie kompatybilności / referencja migracyjna),
- katalog `app/` - mirror generowany przez `npm run prepare:app` (nie edytujemy ręcznie).

## 4. Rozszerzenia (plugin-like)

System rozszerzen jest oparty o manifest JSON. Dopuszczone contributions:

- contributions.tools - dodanie lub nadpisanie wpisow katalogu narzedzi,
- contributions.menuActions - dodanie lub nadpisanie etykiet akcji menu,
- contributions.i18n - dodanie slownikow jezykowych (key -> text).

Przykladowy manifest:

```json
{
  "id": "com.example.demo",
  "name": "Demo Extension",
  "version": "0.1.0",
  "contributions": {
    "tools": {
      "demo-tool": {
        "title": "Demo Tool",
        "text": "Opis narzedzia z rozszerzenia.",
        "points": ["A", "B", "C"]
      }
    },
    "menuActions": {
      "demo-action": "Demo action"
    }
  }
}
```

## 5. Dodawanie nowego jezyka

Mozliwe sa dwie sciezki:

- przez UI: Options -> Customization -> Language Manager,
- przez rozszerzenie: `contributions.i18n` w manifescie.

Minimalny format slownika to obiekt JSON `key -> text`, np.:

```json
{
  "menuFile": "Datei",
  "menuOptions": "Optionen",
  "menuTools": "Werkzeuge",
  "menuHelp": "Hilfe"
}
```

Przykladowy fragment manifestu rozszerzenia z jezykiem:

```json
{
  "contributions": {
    "i18n": {
      "de": {
        "menuFile": "Datei",
        "menuOptions": "Optionen"
      }
    }
  }
}
```

Zasady:

- kod jezyka: lowercase (np. `de`, `es`, `pt-br`),
- nie usuwaj kluczy bazowych - brakujace wpisy fallbackuja do EN,
- po dodaniu jezyka sprawdz menu, zakladke Logs i panel rozszerzen.
- po dodaniu jezyka sprawdz menu, dolna zakladke Console (pane info) i panel rozszerzen.

## 5a. Polityka logowania (obowiazkowa)

- Logi programu (statusy, runtime events, wyniki automatycznych akcji PS) kierujemy do dolnego panelu `Console`, pane `info` (`#v1InfoLog`).
- Zakladka `Terminal` (`pane console`) sluzy glownie do interaktywnej sesji PowerShell.
- Nie duplikuj nowych strumieni logow w wielu pane; domyslny cel dla logow aplikacyjnych to `info`.
- Dla eventow unread używaj `newui:console-pane-update` z `detail.pane = "info"` dla logow programu.

## 6. Scrollbar policy (New UI)

- W New UI nie mieszamy natywnych i custom scrollbar w tym samym przeplywie widoku.
- Jezeli nowy kontener ma `overflow: auto`, upewnij sie, ze jest hostem custom scrollbar albo jest wewnatrz hosta obslugujacego przewijanie.
- Po zmianie layoutu i po renderze dynamicznej zawartosci odswiez `refreshCustomScrollbars()`.

## 7. Build i release

- Domyslnie do testow uzywamy builda bez bundli:
  - npm run prepare:app && npx tauri build --no-bundle
- Pelne bundlowanie (NSIS/MSI) tylko gdy jest to jawnie wymagane do releasu.
- Nie uruchamiaj publikacji ani releasu bez wyraznej zgody maintainera.

Checklist przed testowym buildem desktop:

- Upewnij sie, ze wszystkie zmiany sa w zrodlach root (index.html, css/, js/) i NIE byly robione recznie w app/.
- Uruchom npm run prepare:app i sprawdz czy mirror app/ zawiera te same zmiany.
- Dla zmian UI uruchom get_errors na zmienionych plikach przed buildem.
- Dla testow lokalnych preferuj plik: src-tauri/target/release/ipscanner.exe.

Plan rozwoju instalatora (roadmapa):

- W kolejnych iteracjach rozbudowujemy instalator o dodatkowe opcjonalne skladniki.
- Kazdy nowy skladnik powinien miec autodetekcje istniejacej instalacji i bezpieczny domyslny stan checkboxa.
- Nie usuwamy wspoldzielonych runtime'ow systemowych bez jawnej, osobnej zgody uzytkownika.

## 8. Workflow PR

- Tworz male, tematyczne PR-y.
- W opisie PR podaj: zakres, ryzyko regresji, test manualny.
- Jesli zmieniasz UI, zalacz kroki reprodukcji i oczekiwany efekt.
- Dla zmian UI uruchom i odnotuj wynik smoke-matrycy z sekcji 13.

## 9. Czego nie robimy w PR do new UI

- Nie przepinamy calej aplikacji na new UI w jednym kroku.
- Nie usuwamy legacy UI bez uzgodnionego planu migracji.
- Nie dokladamy nowego dlugu technicznego przez kolejne duze skrypty inline.

## 10. Definition of done (UI/i18n)

- Tooltipy i aria-labele dzialaja w en i pl (bez hardcoded PL przy domyslnym en).
- Status line nie zawiera mieszanego jezyka dla tej samej akcji.
- Nowe kontrolki menubara nie sa blokowane przez logike drag okna.
- Zmiany root -> app sa zsynchronizowane przez npm run prepare:app.
- Build testowy --no-bundle przechodzi i generuje exe.

## 11. Naming conventions (obowiazkowe)

Cel: jednolite nazwy i szybsze code review.

- Pliki JS runtime: kebab-case + sufiks `-runtime.js` (np. `menu-runtime.js`, `layout-runtime.js`).
- Pliki core (nie-runtime): kebab-case bez sufiksu runtime (np. `ui-definitions.js`, `tool-catalog.js`).
- Foldery: lowercase + kebab-case (np. `new-ui`, `core`, `runtimes`, `utils`).
- Funkcje i metody JS: camelCase (np. `openExternalUrl`, `initMenuActions`).
- Zmienne JS: camelCase.
- Stale JS: UPPER_SNAKE_CASE (np. `DETACHED_LAYOUTS_KEY`, `LANG_KEY`).
- Klucze i18n: lowerCamelCase dla ogolnych kluczy (np. `menuFile`) oraz `toolText_<tool_id_z_podkresleniami>` dla opisow narzedzi.
- Atrybuty `data-*` w HTML: kebab-case (np. `data-menu-action`, `data-panel-toggle`).
- ID w HTML: prefiks funkcjonalny i spojnosc nazewnicza, preferowany styl istniejacy w projekcie (`v1...`).
- Nazwy komend Tauri (invoke): snake_case po stronie Rust/command (np. `window_toggle_fullscreen`) i nie tlumaczymy ich na wiele aliasow w JS.

Zasada zgodnosci wstecznej:

- Przy zmianie nazwy publicznej (klucz i18n, localStorage key, data attribute, action id) zapewnij migracje lub fallback.

## 12. System podzialu projektu na pliki

Repo ma formalny podzial warstw. Trzymaj sie go w kazdym PR.

Warstwa zrodlowa (source of truth):

- `index.html`, `css/`, `js/` sa jedynym miejscem recznych zmian frontendu.

Warstwa mirror/build:

- `app/` to mirror generowany przez `npm run prepare:app`.
- Nie edytujemy `app/` recznie, chyba ze awaryjna diagnostyka lokalna (bez commitowania takich zmian).

Podzial odpowiedzialnosci New UI:

- `js/new-ui/core/` - moduly bazowe i orkiestracja.
- `js/new-ui/core/runtimes/` - runtime UI (layout, nawigacja, logi, scroll, itp.).
- `js/new-ui/core/utils/` - pomocnicze utility bez logiki widokowej.
- `js/new-ui/core/platform-runtime.js` - adapter platformy (desktop/web), punkt centralny dla invoke/window/storage/openExternalUrl.

Reguly dodawania nowego kodu:

- Nie dokladaj nowej logiki biznesowej bezposrednio do `index.html` poza bootstrap/adaptor.
- Nie duplikuj tej samej logiki w wielu runtime; wyciagaj do `core/` lub `utils/`.
- Integracje desktop/web prowadzone przez adapter platformy, nie przez bezposrednie `window.__TAURI__` w wielu plikach.
- Kazda nowa funkcjonalnosc powinna wskazac docelowy modul (gdzie zyje logika) i punkt wejscia (kto ja wywoluje).

## 13. Smoke test matrix (standard)

Minimalny standard testu manualnego po zmianach UI/runtime:

1. HTML normal
- Tryb: bez flag parity.
- Oczekiwane:
  - aplikacja startuje bez bledow,
  - menu i przelaczanie kart dziala,
  - linki zewnetrzne otwieraja sie poprawnie,
  - resize paneli (left/right/bottom) dziala.

2. HTML parity
- Tryb: `?nr_parity=1` lub `localStorage.setItem("netrecon_desktop_parity", "1")`.
- Oczekiwane:
  - status zawiera "Desktop parity mode enabled",
  - fallback web dziala bez invoke Tauri,
  - akcje desktop-only nie wywalaja UI.

3. EXE no-bundle
- Tryb: `npm run prepare:app && npx tauri build --no-bundle`.
- Oczekiwane:
  - aplikacja uruchamia sie z `src-tauri/target/release/ipscanner.exe`,
  - menu dziala,
  - akcje okna (min/max/fullscreen/close) dzialaja,
  - funkcje krytyczne zmieniane w PR przechodza bez regresji.

Raportowanie w PR:

- Dodaj krotka sekcje `Smoke matrix` z wynikiem: `HTML normal: PASS/FAIL`, `HTML parity: PASS/FAIL`, `EXE no-bundle: PASS/FAIL`.

## 14. Status migracji platformy (maj 2026)

Stan bazowy po migracji:

- Integracje desktop/web w `js/new-ui/core/**` sa scentralizowane przez `js/new-ui/core/platform-runtime.js`.
- Bezposrednie odwolania `window.__TAURI__` i `window.__TAURI_INTERNALS__` sa dozwolone tylko w adapterze platformy.
- Runtime modules korzystaja z adaptera (`platform.getInvoke`, `platform.invoke`, `platform.windowAction`, `platform.storage`).

Zasada utrzymaniowa:

- Kazdy nowy kod, ktory potrzebuje funkcji desktop, musi przechodzic przez adapter platformy.
- PR, ktory dodaje bezposrednie odwolanie do API Tauri poza adapterem, traktujemy jako regresje architektury.

Dokumentacja robocza:

- Tymczasowy plik `contextmigration.md` zostal wycofany po domknieciu migracji.
- Jedynym zrodlem zasad i workflow pozostaje ten plik CONTRIBUTING.

