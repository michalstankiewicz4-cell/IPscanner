## Skroty

- TBM — Top Bar Menu
- LRSB — Left Shortcut Bar (activity bar, ikony)
- LS — Left Section (panel boczny)
- RS — Right Section
- CS — Central Section
- DS — Down Section (terminal/macro/console)
- DSB — Down Status Bar
- ST — Sub-Tool (litery a/b/c pod numerowanym Tool = jego sub-tools)

`DS` (panel terminala) i `DSB` (pasek statusu) to CELOWO dwie rozne rzeczy mimo
podobnego skrotu — latwo je pomylic przy szybkim czytaniu, stad to zaznaczenie.

## Notacja dostep/miejsce

Format: `(dostep -> miejsce)`.

- "dostep" = skad mozna to otworzyc (LRSB, TBM - Tools, TBM - Options...). Moze byc
  wiecej niz jedno miejsce dostepu naraz, wtedy rozdzielone przecinkiem.
- "miejsce" = gdzie sie to faktycznie otwiera (LS/RS/CS). Jesli narzedzie otwiera
  wiecej niz jedna zakladke w roznych miejscach, kazda dostaje wlasna linie.

Przyklad:

```
IP Scanner (LRSB, TBM-Tools -> LS)
  - wynik otwiera sie osobno: (-> CS, jako "IP Results")
```

## Shell

1. **Top Bar Menu**
   a. Logo — logo + tooltip z nazwa + aktualna wersja.
   b. Menu:
      - File: new, open, open recent (flyout), **import (mock — jeszcze bez
        dzialajacej logiki; aktywny tylko przy otwartej sesji)**, save,
        save as, close, exit
      - Options: Country IP Library, Port Presets, Default Scan Values,
        language, **General** (checkboxy "pamietaj X przy nastepnym
        uruchomieniu" dla ustawien powloki, w tym "Auto Load last session"),
        import tools (trzy pierwsze to docelowo domena dodatku IPscanner,
        nie podstawy — patrz FUTURE_PLUGIN_SHELL.md)
      - Tools: AI Assistant, ShellCraft, IP Scanner (+ ukryte Topology i
        Globe — pokazuje je dopiero "Show unfinished tools" na TBM)
      - Help: version, download, about, license, assistant
   c. Przyciski: zamykanie, zarzadzanie ukladem okien, ukrywanie wrazliwych
      danych, full reset, "Show unfinished tools" (🚧 — pokazuje ukryte
      Topology/Globe w TBM-Tools i na LRSB; stan trzymany w localStorage).
2. **Left Section (LS)**
3. **Right Section (RS)**
   a. AI Assistant (dostep: TBM-Tools -> otwiera sie w: RS; brak ikony na LRSB)
4. **Center Section (CS)**
   a. logo w tle
   b. ladowanie ostatnich sesji (widok powitalny "Recent sessions")
5. **Down Section (DS)**
   a. Terminal
   b. Macro
   c. Console PowerShell
6. **Down Status Bar (DSB)**
   a. loader
   b. ilosc aktywnych procesow
   c. pasek ladowania 0-100%
   d. dodatkowe miejsce na informacje
7. **Left Shortcut Bar (LRSB)**
   a. pierwsza ikona zawsze wskazuje dane do zapisywania sesji (Result Data List)
   b. pozostale ikony to skroty do narzedzi z listy `## Tools` ponizej

8. **Shell Craft** (TBM-Tools) — zostaje w Shell, nie jest to IPscanner-owy tool
   a. Library -> LS (kategorie blokow: funkcyjne + makra; drag-and-drop na canvas)
   b. Inspector -> RS (wlasciwosci kliknietego bloku; przeniesiony z LS 2026-07-10)
   - glowny widok -> CS (canvas blokow; przelacznik widokow
     Flow/Timeline/Tree/Layered — dziala tylko Flow, reszta wyszarzona)
   - makra: DS zakladka "Macro" (wiersz polecen w stylu terminala;
     `help`/`?` = lista makr)

LS, RS, CS powinny miec identyczny system zakladek (parytet tab/window, patrz
CONTRIBUTING.md §3a).

## Tools

1. **IP Scanner** (LRSB, TBM-Tools -> LS)
   - wynik -> CS, jako "IP Results"
   - ST a. Port Presets (TBM-Options -> CS, jako "Presets")
   - ST b. Default Scan Values (TBM-Options -> CS, jako "Scan Values")
2. **Country IP Library** (TBM-Options)
   - edytor -> LS, jako "IP Library (edytor)"
   - podglad -> CS, jako "IP Library (widok)"
3. **Topology Map** (LRSB, TBM-Tools -> CS; domyslnie ukryty — widoczny po
   wlaczeniu "Show unfinished tools" na TBM)
4. **World Globe** (LRSB, TBM-Tools -> CS; domyslnie ukryty — jak wyzej)

Funkcje lub czesc funkcji dzialajacych tylko w aplikacji (stan na 2026-07-11,
po weryfikacji kodu — AI Assistant/Topology/Globe nie maja dzis zadnej
logiki, to same statyczne karty w `tool-catalog.js`, wiec dla nich ponizszy
podzial to plan na przyszlosc; ShellCraft ma juz realny edytor blokow i
makra, patrz jego punkt nizej):

- **IP Scanner** — moze na www: UI, presety, biblioteka IP, sesje (zrobione,
  patrz sql.js session save/load). Tylko desktop: samo skanowanie portow
  (przegladarka nie ma surowych socketow TCP — twardy limit, nie do obejscia).
- **Shell Craft** — zaimplementowane (2026-07-10/11): edytor blokow (canvas
  CS + Library LS + Inspector RS, dziala www i desktop, stan w localStorage)
  oraz 3 makra (External IP / Local IP / Subnets) uruchamiane z zakladki
  Macro w DS albo z bloku na canvas. **Uruchomienie** makra odpala realne
  akcje Detect (PowerShell) — dziala tylko na desktopie. Bloki If/Repeat
  Until/PowerShell sa przeciagalne i edytowalne, ale jeszcze nie wykonywalne
  (brak interpretera — patrz ROADMAP, backlog pkt 12).
- **AI Assistant** — moze na www: caly czat, jesli to zwykle zapytania HTTP do
  API. Tylko desktop: gdyby mial wywolywac PowerShell/pliki lokalne.
- **Topology map** — moze na www: rysowanie grafu z juz zebranych danych.
  Tylko desktop: zbieranie danych (traceroute — do zaimplementowania od zera;
  wczesniejszy martwy `run_traceroute` w `main.rs` zostal usuniety w ramach
  sprzatania backendu, patrz `docs/CHANGELOG.md`).
- **Globe** — moze na www w calosci, jesli dane sa juz zebrane — to czysty
  rendering (D3), zero zaleznosci od Tauri.

Ogolna zasada: UI/dane/storage/rendering moze dzialac wszedzie (WASM jak sql.js
pokazal, ze nawet "trudne" rzeczy jak realny plik SQLite sie da); surowe
sockety TCP/ICMP i PowerShell nie dzialaja na www nigdy — to bariera
bezpieczenstwa przegladarki, nie brak implementacji.


