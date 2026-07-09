# OSINT NET Auditor - CONTRIBUTING

## 1. Aktualny kierunek projektu

Repo zawiera stabilny rdzen skanera i jedno UI (New UI, uklad podobny do VS Code).
Priorytet zostal swiadomie odwrocony wzgledem pierwotnego zalozenia: zamiast
najpierw domykac w pelni skaner, a dopiero potem zajmowac sie powloka,
**priorytetem jest praca nad powloka (shell) i systemem dodatkow** - poprawki
skanera schodza na dalszy plan, dopoki powloka nie jest gotowa (patrz
`FUTURE_PLUGIN_SHELL.md`, sekcja "Kolejnosc prac").

Aktualny kierunek rozwoju to:

- rozdzielanie kodu na warstwe shell (generyczna, dla dowolnego dodatku) i
  warstwe tool (specyficzna dla IP Scannera) w calym `js/new-ui/core/**`,
- rozbudowa systemu rozszerzen (manifest `contributions`) o realne punkty
  kontrybucji - dzis: `tools`/`menuActions`/`i18n`/`commands`/`optionsMenu`,
  flagi `ui.showInLeftPanel`/`showInRightPanel`/`showAsTab`, model uprawnien
  (`permissions`) i katalog dodatkow z GitHuba (patrz sekcja 4),
  docelowo: pelne API kontrybucji pod WASM opisane w `FUTURE_PLUGIN_SHELL.md`,
- utrzymanie kompatybilnosci istniejacej logiki skanera (bez regresji, ale bez
  priorytetu na nowe funkcje skanera),
- porzadkowanie stylow i i18n bez regresji funkcjonalnych.

W praktyce: zmiany w warstwie UI powinny byc izolowane od logiki skanowania,
a nowy kod w miare mozliwosci pisany od razu z podzialem shell/tool w glowie
(patrz komentarze `// shell:` / `// ip-scanner tool:` w kodzie).

Docelowa wizja (IPscanner jako instalowalny/odinstalowywalny dodatek na
neutralnej powloce, z sandboxingiem przez WASM) jest opisana w
`FUTURE_PLUGIN_SHELL.md`. Nie jest w pelni zrealizowana - dzis dziala
prototyp bez WASM (patrz ten plik, sekcja "Stan obecny").

### 1a. Historia: model dwoch galezi (zakonczony)

Projekt dzialal wczesniej w modelu dwoch galezi: `main` z legacy UI (Windows-95-style)
i `feature/new-ui-skins` z New UI, pokazywanymi obok siebie przez dual-view host na
`ipscanner.pl`. Ten model zostal **swiadomie zakonczony** - legacy UI zostal usuniety
z `main`, a zawartosc `feature/new-ui-skins` zostala przeniesiona na `main` jako
jedyna, docelowa wersja UI. Galaz `feature/new-ui-skins` jest przeznaczona do
usuniecia (moze juz nie istniec, w zaleznosci kiedy to czytasz). Repo dziala/bedzie
dzialac w modelu jednej galezi (`main`). Ten podpunkt zostaje jako notatka
historyczna - nie ma juz aktywnych zasad synchronizacji miedzy galeziami do
przestrzegania.

## 2. Zasady zmian

- Nie mieszaj refaktoru UI z duzymi zmianami backendu skanera w jednym PR.
- Nie edytuj katalogu app recznie - to mirror generowany skryptem (szczegoly: sekcja 12).
- W new UI preferuj male moduly w js/new-ui/core zamiast rozbudowy inline script.
- Nie dodawaj nowych odwolan do starych, usunietych legacy plikow `css/*.css` i `js/*.js` (poza `css/new-ui/**`/`js/new-ui/**`); wejscie ma ladowac wyłącznie `css/new-ui/**` i `js/new-ui/**`.
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
- extensions.js - host rozszerzen i contributions (manifest, permissions, install/uninstall, katalog).
- ui-definitions.js - mapa odpowiedzialnosci menu i paneli.
- menu-runtime.js - obsluga menubar i akcji menu (w tym Options-menu dodane przez rozszerzenia).
- panels-runtime.js - routing aktywnego narzedzia, odswiezanie panelu glownego, oraz katalog dodatkow z GitHuba (`fetchCatalog`/`renderCatalog`) i instalacja/deinstalacja (`installManifestObject`/`performUninstall`).
- bootstrap-runtime.js - orkiestracja calej aplikacji (patrz sekcja 12); dla rozszerzen: `syncExtensionToolUi()`/`syncExtensionOptionsMenuUi()` (tworzenie dynamicznego UI dodatkow - zakladki, LS/RS panele, ikony, wpisy menu) i `openExtensionTool()` (jedyne miejsce wiedzace jak otworzyc narzedzie dodatku przez jego flagi `ui`).
- session-runtime.js - zapis/odczyt/zamkniecie sesji (SQLite), lista ostatnich sesji, przywracanie ukladu zakladek po reload (schemat bazy: `SESSION_DATABASE_SCHEMA.md`).
- extension-manager-runtime.js - obsluga starszego panelu "Customization" (modal) i jezykow; nie podpiety pod dynamiczne UI dodatkow, patrz sekcja 4.
- scanner-sidebar-runtime.js - obsluga sidebaru skanera (wykrywanie IP, historia zakresow, extractor).
- powershell-console-runtime.js - obsluga zintegrowanej konsoli PowerShell.
- runtimes/status-log-runtime.js - centralny log statusow (dolna zakladka Console / pane info).
- runtimes/layout-runtime.js - resizery i zachowanie paneli (left/right/bottom).
- runtimes/custom-scrollbar-runtime.js - faux scrollbar i odswiezanie hostow przewijania.
- runtimes/ip-inputs-runtime.js - segmentowane pola IP oraz synchronizacja hidden inputow zakresu.
- runtimes/navigation-runtime.js - obsluga aktywnosci sidebar/results, zakladek dolnego panelu i routingu klikniec data-tool; LS/RS otwieranie zakladek dla dodatkow przez zdarzenia `newui:sidebar-tab-intent-open`/`newui:right-tab-intent-open`.
- runtimes/command-bus-runtime.js - generyczny rejestr nazwanych komend (`register`/`invoke`/`unregisterAllFor`); dzis uzywany przez komendy PowerShell zadeklarowane w `contributions.commands` rozszerzen (patrz sekcja 4).

Skrypty PowerShell (source of truth):

- katalog `scripts/` zawiera skrypty uruchamiane przez runtime/desktop (Tauri `run_powershell`),
- wykrywanie IP jest rozdzielone na osobne skrypty: `detect-external-ip.ps1`, `detect-local-ip.ps1`, `detect-subnet-cidr.ps1`,
- aktualizacja biblioteki krajow jest realizowana przez `update-country-ip-library.ps1`,
- przy zmianie logiki preferuj edycje skryptu w `scripts/` zamiast rozbudowy inline command string w JS.

index.html powinien byc glownie adapterem DOM i eventow.

### 3a. Granica UI vs Content (obowiazkowa)

Dla warstwy paneli utrzymujemy twardy podzial odpowiedzialnosci:

- `panel-content-runtime.js` - renderowanie tresci i szablonow (markup), bez logiki stanu i bez routingu narzedzi.
- `panel-renderers-runtime.js` - renderery fragmentow sekcji (np. listy/tabele), bez event bindingu i bez mutacji stanu aplikacji.
- `panels-runtime.js` - stan aktywnego narzedzia, routing, lifecycle renderu i obsluga zdarzen UI.
- `panel-interactions-runtime.js` - interakcje specyficzne dla widokow (timeline, tabela wynikow, itp.).

Zasady:

- Nie umieszczaj logiki biznesowej skanera ani logiki routingu w rendererach tresci.
- Nie przenos event bindingu globalnego do `panel-content-runtime.js`.
- Nie przenos event bindingu globalnego do `panel-renderers-runtime.js`.
- Dla centralnego panelu obowiazuje parytet `tab` vs `window`: zawartosc i zachowanie odczepionego okna musi byc 1:1 wzgledem aktywnej zakladki tego samego narzedzia.
- Dla centralnego panelu obowiazuje takze parytet stylow `tab` vs `window`: spacing, typografia, kolory i stany hover/focus musza pozostac 1:1.
- Nie opieraj krytycznych interakcji centralnego panelu tylko na selektorach `id`, jesli widok moze dzialac w trybie `window` (detached), gdzie `id` moze byc normalizowane lub usuwane.
- Teksty user-facing musza przechodzic przez i18n (brak nowych hardcoded tekstow w rendererach).
- Duze statyczne tresci (np. About/License/help text) utrzymuj jako dane wejsciowe konfiguracji, a nie rozproszony inline markup w wielu runtime.
- Kazdy listener globalny (`window`/`document`) dodany przez runtime musi miec jawny cleanup w lifecycle (`destroy`, `dispose`, `unmount`) tego samego widoku.

Checklist PR dla warstwy paneli:

- `panel-content-runtime.js` nie zawiera routingu narzedzi ani globalnych listenerow.
- `panels-runtime.js` nie buduje recznie dlugich blokow HTML dla sekcji danych (uzywa dedykowanych rendererow).
- Dla kazdego zmienionego narzedzia centralnego panelu potwierdz parity smoke test: `tab` i `window` maja ten sam markup funkcjonalny oraz te same akcje.
- Dla kazdego zmienionego narzedzia centralnego panelu potwierdz parity smoke test stylow: `tab` i `window` maja ten sam layout i te same klasy stylujace dla kluczowych sekcji.
- Dla zmian dodajacych listenery globalne potwierdz, ze cleanup dziala po zamknieciu/odczepieniu widoku i nie kumuluje callbackow.
- Po zmianach uruchom `npm run prepare:app` i sprawdz mirror `app/`.

Mapa odpowiedzialnosci jest utrzymywana centralnie i nie powinna byc dublowana w wielu miejscach.

- definicje menu i akcji: `js/new-ui/core/ui-definitions.js`,
- definicje paneli: `js/new-ui/core/ui-definitions.js`,
- wykonanie zachowan akcji: runtime modules + `index.html` jako bootstrap/adaptor New UI.

Pliki wejsciowe UI i zasady warstwy zrodlo/mirror: zob. sekcja 12.

## 4. Rozszerzenia (plugin-like)

System rozszerzen jest oparty o manifest JSON (`js/new-ui/core/extensions.js`).
To pierwszy, nie-WASM prototyp docelowej wizji z `FUTURE_PLUGIN_SHELL.md` -
dziala w calosci w JS, bez sandboxingu poza jednym, recznie sprawdzanym
uprawnieniem (`permissions: ["powershell"]`).

Pola na poziomie manifestu:

- `id`, `name`, `version` - identyfikacja rozszerzenia (`id` musi byc unikalne
  i nie powinno zawierac `:` - patrz ponizej przy Options-menu).
- `description` - krotki opis pokazywany w katalogu dodatkow (Import Tool).
- `permissions` - tablica uprawnien; dzis jedyna rozpoznawana wartosc to
  `"powershell"`. Inne wartosci sa po cichu odrzucane przy walidacji manifestu.
  Przy instalacji uzytkownik widzi okno z prosba o potwierdzenie zadanych
  uprawnien, zanim rozszerzenie zostanie zarejestrowane.

Dopuszczone `contributions`:

- `contributions.tools` - dodanie lub nadpisanie wpisow katalogu narzedzi.
  Kazdy wpis moze miec:
  - `title`, `text`, `points` - tresc statycznej karty (fallback rendering).
  - `icon` - emoji/tekst LUB pelny URL obrazka (`http(s):`/`data:`) - wtedy
    renderowany jako `<img>` (patrz `renderExtIcon` w `bootstrap-runtime.js`).
  - `actions` - lista przyciskow `{label, commandId, resultKey?, openTool?}`;
    klikniecie wywoluje komende z `contributions.commands` przez command bus
    (`js/new-ui/core/runtimes/command-bus-runtime.js`). `resultKey` zapisuje
    wynik w generycznym store pod tym kluczem; `openTool` (opcjonalnie) od
    razu przelacza na wskazane narzedzie po sukcesie - tak dziala pokazywanie
    wyniku z LS w zakladce CS.
  - `resultKey` (na samym narzedziu, nie w `actions`) - narzedzie renderuje
    ostatnia wartosc zapisana pod tym kluczem (np. zakladka "tylko wynik").
  - `ui.showInToolsMenu` (domyslnie pokazane, `false` = ukryte),
    `ui.showInActivityBar` (domyslnie ukryte, `true` = ikona w pasku
    aktywnosci - wymaga tez sensownej `icon`), `ui.showInLeftPanel` (`true` =
    dedykowany panel w lewym sidebarze zamiast wpisu w liscie scan-runnera),
    `ui.showInRightPanel` (`true` = zakladka w prawym panelu),
    `ui.showAsTab` (domyslnie `true` = zakladka na srodku; `false` gdy
    narzedzie ma zyc wylacznie w LS/RS).
- `contributions.commands` - komendy wywolywalne z `actions` powyzej. Dzis
  jedyny obslugiwany typ: `{"type": "powershell", "script": "..."}` -
  wykonywany przez istniejacy `run_powershell` (Tauri), gated na
  `permissions` zawierajace `"powershell"`.
- `contributions.optionsMenu` - nowy wpis w menu Options otwierajacy naraz
  liste wlasnych narzedzi rozszerzenia przez ich `ui` flagi:
  `{"<actionKey>": {"label": "...", "openTools": ["tool-a", "tool-b"]}}`.
- `contributions.menuActions` - dodanie lub nadpisanie etykiet istniejacych
  akcji menu (dziala tylko dla juz istniejacych, zaszytych na sztywno
  `data-menu-action` w `index.html` - to NIE tworzy nowej pozycji menu, do
  tego sluzy `contributions.optionsMenu` powyzej).
- `contributions.i18n` - dodanie slownikow jezykowych (key -> text).

Przykladowy manifest (skrocona wersja `tools/ipscanner.json`, demo z LS + CS + RS + Options-menu):

```json
{
  "id": "ip-scanner-detect-address-poc",
  "name": "IP Scanner: Detect Address",
  "description": "Wykrywa adres IP i pokazuje wynik w osobnej zakladce.",
  "version": "0.1.0",
  "permissions": ["powershell"],
  "contributions": {
    "commands": {
      "detectAddressPoc": { "type": "powershell", "script": "..." }
    },
    "optionsMenu": {
      "detectAddressPoc": {
        "label": "Detect Address",
        "openTools": ["detect-address-ls", "detect-address-cs"]
      }
    },
    "tools": {
      "detect-address-ls": {
        "title": "Detect Address",
        "actions": [{ "label": "Wykryj adres", "commandId": "detectAddressPoc", "resultKey": "detect-address-result", "openTool": "detect-address-cs" }],
        "ui": { "showInLeftPanel": true, "showAsTab": false }
      },
      "detect-address-cs": {
        "title": "Detect Address - Result",
        "resultKey": "detect-address-result",
        "ui": { "showInToolsMenu": false }
      }
    }
  }
}
```

Instalacja i katalog dodatkow (Options -> Import Tool):

- Zakladka "Www addons" automatycznie wczytuje liste dodatkow z folderu
  `tools/` w tym repo na GitHubie (`fetchCatalog()` w `panels-runtime.js`) -
  dla kazdego `<nazwa>.json` paruje plik ikony o tej samej nazwie
  (`<nazwa>.png`/`.svg`/...), jesli istnieje. Wynik jest cache'owany w
  ramach sesji aplikacji (nie odpytuje GitHuba przy kazdym otwarciu
  zakladki), zeby nie wyczerpac limitu nieautoryzowanego API GitHuba
  (60 zapytan/h na adres IP).
- Klikniecie "Install" na wpisie katalogu instaluje bezposrednio (po
  potwierdzeniu uprawnien, jesli manifest je deklaruje); przycisk zmienia
  sie na "Uninstall", gdy dodatek jest juz zainstalowany.
- "Load from file..." pozwala zainstalowac manifest z lokalnego pliku
  `.json` (natywne okno wyboru pliku, Tauri `open_extension_manifest_dialog`).
- Lista "Installed extensions" pokazuje wszystko, co jest zainstalowane
  (niezaleznie od zrodla) z przyciskiem Uninstall przy kazdej pozycji.
- Osobny, starszy panel "Customization" (modal, `extension-manager-runtime.js`)
  nadal istnieje i tez umie instalowac/odinstalowywac przez wklejenie JSON,
  ale nie jest podpiety pod `syncExtensionToolUi()` - zainstalowane stamtad
  dodatki nie tworza dynamicznego UI (menu/aktywnosc/LS/RS) bez restartu
  aplikacji. Nie jest to sciezka zalecana do testowania nowych dodatkow.

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
- w obrebie jednego locale (np. `en`, `pl`) klucz i18n moze wystapic tylko raz; duplikaty sa traktowane jako blad review,
- przed pushem zmian i18n uruchom szybki check duplikatow kluczy (np. skrypt Node/CI) i odnotuj wynik w PR,
- po dodaniu jezyka sprawdz menu, zakladke Logs i panel rozszerzen.

## 5a. Polityka logowania (obowiazkowa)

- Logi programu (statusy, runtime events, wyniki automatycznych akcji PS) kierujemy do dolnego panelu `Console`, pane `info` (`#v1InfoLog`).
- Zakladka `Terminal` (`pane console`) sluzy glownie do interaktywnej sesji PowerShell.
- Nie duplikuj nowych strumieni logow w wielu pane; domyslny cel dla logow aplikacyjnych to `info`.
- Dla eventow unread używaj `newui:console-pane-update` z `detail.pane = "info"` dla logow programu.

## 6. Scrollbar policy (New UI)

- W New UI nie mieszamy natywnych i custom scrollbar w tym samym przeplywie widoku.
- Jezeli nowy kontener ma `overflow: auto`, upewnij sie, ze jest hostem custom scrollbar albo jest wewnatrz hosta obslugujacego przewijanie.
- Po zmianie layoutu i po renderze dynamicznej zawartosci odswiez `refreshCustomScrollbars()`.
- Dla widokow centralnych wymagajacych parytetu `tab` vs `window` nie wprowadzaj trwalego bypassu custom-scrollbar (np. `data-native-hscroll`) bez jawnej decyzji architektonicznej.
- Przy debugowaniu poziomego paska preferuj najpierw diagnoze `scrollWidth/clientWidth/overflowX` i layoutu kontenera; dopiero potem zmieniaj runtime scrollbar.
- W layoutach grid/flex dla hostow tabel i wrapperow przewijania utrzymuj `min-width: 0`, aby overflow powstawal w kontenerze scroll i nie "uciekal" do rodzica.
- Tymczasowe markery/testy diagnostyczne (np. probe classes, dodatkowe tabele testowe) musza byc usuniete przed zamknieciem taska i przed push.

## 7. Build i release

- Domyslnie do testow uzywamy builda bez bundli:
  - npm run prepare:app && npx tauri build --no-bundle
- Pelne bundlowanie (NSIS/MSI) tylko gdy jest to jawnie wymagane do releasu.
- Nie uruchamiaj publikacji ani releasu bez wyraznej zgody maintainera.

Checklist przed testowym buildem desktop:

- Upewnij sie, ze wszystkie zmiany sa w zrodlach root (index.html, css/, js/) i NIE byly robione recznie w app/.
- Uruchom npm run prepare:app i sprawdz czy mirror app/ zawiera te same zmiany.
- Dla zmian UI uruchom get_errors na zmienionych plikach przed buildem.
- Dla testow lokalnych preferuj plik: src-tauri/target/release/OSINTNETAuditor.exe.

### 7a. Plan rozwoju instalatora (roadmapa)

- W kolejnych iteracjach rozbudowujemy instalator o dodatkowe opcjonalne skladniki.
- Kazdy nowy skladnik powinien miec autodetekcje istniejacej instalacji i bezpieczny domyslny stan checkboxa.
- Nie usuwamy wspoldzielonych runtime'ow systemowych bez jawnej, osobnej zgody uzytkownika.

## 8. Workflow PR

- Tworz male, tematyczne PR-y.
- W opisie PR podaj: zakres, ryzyko regresji, test manualny.
- Jesli zmieniasz UI, zalacz kroki reprodukcji i oczekiwany efekt.
- Dla zmian UI uruchom i odnotuj wynik smoke-matrycy z sekcji 13 (dla zmian tylko CSS/i18n bez logiki runtime dopuszczalny jest brak EXE, ale z jawnym uzasadnieniem w PR).

## 9. Czego nie robimy w PR do new UI

- Nie przepinamy calej aplikacji na new UI w jednym kroku.
- Nie usuwamy aktywnych entrypointow UI bez uzgodnionego planu migracji w ramach danej galezi.
- Nie dokladamy nowego dlugu technicznego przez kolejne duze skrypty inline.

## 10. Definition of done (UI/i18n)

- Tooltipy i aria-labele dzialaja w en i pl (bez hardcoded PL przy domyslnym en).
- Status line nie zawiera mieszanego jezyka dla tej samej akcji.
- Nowe kontrolki menubara nie sa blokowane przez logike drag okna.
- Zmiany root -> app sa zsynchronizowane przez npm run prepare:app.
- Build testowy --no-bundle przechodzi i generuje exe dla zmian runtime/desktop/platform; dla zmian tylko CSS/i18n wymagane jest uzasadnienie pominiecia EXE.

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

- `index.html`, `css/`, `js/` sa jedynym miejscem recznych zmian frontendu; `index.html` to aktywny domyslny entrypoint aplikacji (New UI).

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
- Kazdy nowy kod, ktory potrzebuje funkcji desktop (invoke, okno, storage), musi przechodzic przez adapter platformy `platform-runtime.js` (`platform.getInvoke`, `platform.invoke`, `platform.windowAction`, `platform.storage`); bezposrednie odwolanie do `window.__TAURI__`/`window.__TAURI_INTERNALS__` poza adapterem traktujemy jako regresje architektury.
- `bootstrap-runtime.js` orkiestruje, nie implementuje: dla logiki, ktora docelowo zyje w innym module (np. routing aktywnego narzedzia i odswiezanie panelu w `panels-runtime.js`), bootstrap-runtime.js ma tylko przypisywac/wywolywac gotowa implementacje (np. `setTooltips = panelsRuntime.setTooltips`), a nie pisac wlasnej, rownoleglej wersji tej samej logiki - taka kopia latwo staje sie martwym kodem, gdy zostanie nadpisana zaraz po utworzeniu wlasciwego runtime.
- Jesli nazwa (np. `setTooltips`, `switchTool`) musi istniec w zasiegu zanim wlasciwy modul zostanie utworzony, uzyj wzorca `let nazwa = function () {};` na gorze pliku z pozniejszym przypisaniem realnej implementacji (patrz istniejacy `refreshCustomScrollbars` w bootstrap-runtime.js), zamiast pisac tymczasowa logike w miejscu deklaracji.
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
  - aplikacja uruchamia sie z `src-tauri/target/release/OSINTNETAuditor.exe`,
  - menu dziala,
  - akcje okna (min/max/fullscreen/close) dzialaja,
  - funkcje krytyczne zmieniane w PR przechodza bez regresji.

Raportowanie w PR:

- Dodaj krotka sekcje `Smoke matrix` z wynikiem: `HTML normal: PASS/FAIL`, `HTML parity: PASS/FAIL`, `EXE no-bundle: PASS/FAIL`.
- Jesli EXE jest pomijane (tylko CSS/i18n, brak zmian runtime), wpisz `EXE no-bundle: SKIPPED (reason: ...)`.

## 14. Status migracji platformy (maj 2026, kontekst historyczny)

Stan bazowy po migracji:

- Integracje desktop/web w `js/new-ui/core/**` sa scentralizowane przez `js/new-ui/core/platform-runtime.js`.
- Bezposrednie odwolania `window.__TAURI__` i `window.__TAURI_INTERNALS__` sa dozwolone tylko w adapterze platformy.
- Runtime modules korzystaja z adaptera (`platform.getInvoke`, `platform.invoke`, `platform.windowAction`, `platform.storage`).

Wiazaca zasada dla nowego kodu (nie tylko historia migracji): zob. sekcja 12, "Reguly dodawania nowego kodu".

Dokumentacja robocza:

- Tymczasowy plik `contextmigration.md` zostal wycofany po domknieciu migracji.
- Jedynym zrodlem zasad i workflow pozostaje ten plik CONTRIBUTING.

