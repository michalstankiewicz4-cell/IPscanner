## Skroty

- TBM — Top Bar Menu
- LSB — Left Shortcut Bar (activity bar, ikony)
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

- "dostep" = skad mozna to otworzyc (LSB, TBM - Tools, TBM - Options...). Moze byc
  wiecej niz jedno miejsce dostepu naraz, wtedy rozdzielone przecinkiem.
- "miejsce" = gdzie sie to faktycznie otwiera (LS/RS/CS). Jesli narzedzie otwiera
  wiecej niz jedna zakladke w roznych miejscach, kazda dostaje wlasna linie.

Przyklad:

```
IP Scanner (LSB, TBM-Tools -> LS)
  - wynik otwiera sie osobno: (-> CS, jako "IP Results")
```

## Shell

1. **Top Bar Menu**
   a. Logo — logo + tooltip z nazwa + aktualna wersja.
   b. Menu:
      - File: save, save as, load, close, **import (mock — jeszcze bez dzialajacej logiki)**, exit
      - Options: language, import tools
      - Tools: ShellCraft, AI Assistant
      - Help: version, download, about, license, assistant
   c. Przyciski: zamykanie, zarzadzanie ukladem okien, ukrywanie wrazliwych danych, full reset.
2. **Left Section (LS)**
3. **Right Section (RS)**
   a. AI Assistant (dostep: LSB, TBM-Tools -> otwiera sie w: RS)
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
7. **Left Shortcut Bar (LSB)**
   a. pierwsza ikona zawsze wskazuje dane do zapisywania sesji (Result Data List)
   b. pozostale ikony to skroty do narzedzi z listy `## Tools` ponizej

8. **Shell Craft** (TBM-Tools) — zostaje w Shell, nie jest to IPscanner-owy tool
   a. Library -> LS
   b. Inspector -> LS
   - glowny widok -> CS

LS, RS, CS powinny miec identyczny system zakladek (parytet tab/window, patrz
CONTRIBUTING.md §3a).

## Tools

1. **IP Scanner** (LSB, TBM-Tools -> LS)
   - wynik -> CS, jako "IP Results"
   - ST a. Port Presets (TBM-Options -> CS, jako "Presets")
   - ST b. Default Scan Values (TBM-Options -> CS, jako "Scan Values")
2. **Country IP Library** (TBM-Options)
   - edytor -> LS, jako "IP Library (edytor)"
   - podglad -> CS, jako "IP Library (widok)"
3. **Topology Map** (LSB, TBM-Options -> CS)
4. **World Globe** (LSB, TBM-Options -> CS)

