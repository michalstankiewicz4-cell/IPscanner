## Skroty

- TBM — Top Bar Menu
- LRSB — Left Shortcut Bar (activity bar, ikony)
- LS — Left Section (panel boczny)
- RS — Right Section
- CS — Central Section
- DS — Down Section (terminal/macro/console)
- DSB — Down Status Bar
- ST — Sub-Tool (litery a/b/c pod numerowanym Tool = jego sub-tools)
- [^nr] - Odnośnik z numerem do informacji z wyjaśnieniami do funkcji/karty
- [HDN] - Hidden (narzędzie/funkcja ukryta za Unfinished Tools)

`DS` (panel terminala) i `DSB` (pasek statusu) to CELOWO dwie rozne rzeczy mimo podobnego skrotu — latwo je pomylic przy szybkim czytaniu, stad to zaznaczenie.

## Notacja dostep/miejsce

Format: `(dostep -> miejsce)`.

- "dostep" = skad mozna to otworzyc (LRSB, TBM - Tools, TBM - Options...). Moze byc wiecej niz jedno miejsce dostepu naraz, wtedy rozdzielone przecinkiem.
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
      - File: new, open, open recent (flyout), import[^1], save, save as, close, exit
      - Options: Country IP Library[HDN][^4], Port Presets, language, General[^2], import tools[^3] 
      - Tools: ShellCraft, IP Scanner, AI Assistant[HDN], Topology[HDN], Globe[HDN]
      - Help: version[^5], download, about, license[^7], assistant[^8]
   c. Przyciski: zamykanie, zarzadzanie ukladem okien, ukrywanie wrazliwych danych, full reset, "Show unfinished tools"[^9]
2. **Left Section (LS)**
3. **Right Section (RS)**
   a. AI Assistant[HDN] (dostep: TBM-Tools -> otwiera sie w: RS)
4. **Center Section (CS)**
   a. logo w tle
   b. ladowanie ostatnich sesji (widok powitalny "Recent sessions")
5. **Down Section (DS)**
   a. Terminal
   b. Macro (wiersz polecen w stylu terminala; `help`/`?` = lista makr)
   c. Console PowerShell
6. **Down Status Bar (DSB)**
   a. loader
   b. ilosc aktywnych procesow
   c. pasek ladowania 0-100%
   d. dodatkowe miejsce na informacje
7. **Left Shortcut Bar (LRSB)**
   a. pierwsza ikona zawsze wskazuje najważniejesze dane (szybki dostęp)
   b. pozostale ikony to skroty do narzedzi z listy `## Tools` ponizej
8. **Shell Craft** (TBM-Tools)
   a. Library -> LS (kategorie blokow: funkcyjne[HDN] + 3 makra; drag-and-drop na canvas)
   b. Inspector -> RS (wlasciwosci kliknietego bloku)
   c. ShellCraft -> CS (canvas blokow; przelacznik widokow
     Flow/Timeline/Tree/Layered — dziala tylko Flow, reszta wyszarzona)

LS, RS, CS powinny miec identyczny system zakladek (parytet tab/window, patrz
CONTRIBUTING.md §3a).

[^1]: Dodać możliwość wyboru danych do zaimportowania. 
[^2]: Checkboxy pamietaj X przy nastepnym uruchomieniu dla ustawien powloki, Nie zapamiętywać checkboxa - "Remember skin/theme" ukryć zmianę UI (zbadać, czy zapamiętany język RTL zainstalował się przy zapamiętaniu czy pozostał LTR)
[^3]: Docelowo dodatek IP Scanner heuristic JS, heurystyczny — patrz FUTURE_PLUGIN_SHELL.md
[^4]: Makro do dopracowania
[^5]: W aktualizowana na żądanie użytkownika, potem zazwyczaj build portable i relase a w przyszłości instalator z WW2 i PS
[^7]: W przyszłości może przetłumaczymy na różne języki
[^8]: Triggerować podpowiedzi dla aktywnej zakładki
[^9]: Pokazuje ukryte funkcje i karty stan trzymany w localStorage
## Tools

1. **IP Scanner** (LRSB, TBM-Tools -> LS)
   - wynik -> CS, jako "IP Results"
   - LS "IP Range": przelacznik Range/CIDR (jeden zakres, dwa tryby wpisywania)
   - RS "Config" (otwiera sie razem z LS/CS przy aktywnym IP Scannerze): Protocol - TCP Connect/UDP/ICMP sa realne i dowolnie laczalne w jednym skanie, bez uprawnien administratora (UDP przez polaczony socket + wykrywanie ECONNRESET, ICMP przez Windows IP Helper API); TCP SYN dalej UI-only scaffolding, ukryty pod "Show unfinished tools" (brak backendu na surowych socketach). Pozostale sekcje Config (Detect/Performance/Security) nieaudytowane przy tej zmianie, patrz ROADMAP item 17
   - ST a. Port Presets (LS, TBM-Options -> CS, jako "Presets")
2. **Country IP Library[HDN]** (TBM-Options)
   - edytor -> LS, jako "IP Library (edytor)"
   - podglad -> CS, jako "IP Library (widok)"
3. **Topology Map[HDN]** (LRSB, TBM-Tools -> CS)
4. **World Globe[HDN]** (LRSB, TBM-Tools -> CS)


- **IP Scanner Heuristic JS[HDN]** — zaimplementowane (2026-07-23): dodatek instalowalny przez Import Tool (LS: target+technika+porty, CS: opis+tabela wynikow), 5 technik dzialajacych w 100% na www (Fetch/Image/Link/WebSocket/IFrame - client-side, uczciwie oznaczone jako heurystyka, nie prawdziwy skan portow — nie ma surowego TCP/SYN, ograniczenia z blokowanych portow przegladarki i CORS opisane w tekscie narzedzia). Osobna, ogolna mozliwosc "run_powershell_with_args" (bezpieczne -File zamiast -Command) zostala w silniku dodatkow dla przyszlych narzedzi, ktore rzeczywiscie potrzebuja realnego TCP connect z desktopa — w tym konkretnym dodatku nie jest juz uzywana (usunieta z UI razem z prosba o uprawnienie "powershell").
- **Shell Craft** — zaimplementowane (2026-07-10/11): edytor blokow (canvas CS + Library LS + Inspector RS, dziala www i desktop, stan w localStorage) oraz 3 makra (External IP / Local IP / Subnets) uruchamiane  — patrz ROADMAP, backlog pkt 11.
- **AI Assistant[HDN]** — moze na www: caly czat, jesli to zwykle zapytania HTTP do API. Tylko desktop: gdyby mial wywolywac PowerShell/pliki lokalne.
- **Topology map[HDN]** — moze na www: rysowanie grafu z juz zebranych danych. Tylko desktop: zbieranie danych (traceroute — do zaimplementowania od zera; wczesniejszy martwy `run_traceroute` w `main.rs` zostal usuniety w ramach sprzatania backendu, patrz `docs/CHANGELOG.md`).
- **Globe[HDN]** — moze na www w calosci, jesli dane sa juz zebrane — to czysty rendering (D3), zero zaleznosci od Tauri.

Ogolna zasada: UI/dane/storage/rendering moze dzialac wszedzie (WASM jak sql.js
pokazal, ze nawet "trudne" rzeczy jak realny plik SQLite sie da); surowe
sockety TCP/ICMP i PowerShell nie dzialaja na www nigdy — to bariera
bezpieczenstwa przegladarki, nie brak implementacji.


