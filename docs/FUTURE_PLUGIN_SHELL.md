# Wizja: IPscanner jako dodatek na czystej powłoce

Ten plik opisywal pierwotnie kierunek rozwoju, ktory NIE byl jeszcze
realizowany. Od tego czasu czesc wizji zostala sprototypowana - patrz sekcja
"Stan obecny" nizej - plik zostaje jako zapis pelnej, docelowej wizji i listy
tego, co jeszcze nie jest zrobione, zeby nie trzeba bylo odtwarzac tej
rozmowy od zera.

**Aktualizacja (2026-07-09):** WASM byl rozwazany jako mechanizm sandboxingu
dodatkow i oceniony na dzialajacym prototypie (skompilowany modul `.wasm`,
wymiana stringow przez pamiec liniowa) - **swiadomie odrzucony**: zbyt duza
zlozonosc debugowania (pamiec liniowa, brak czytelnych komunikatow bledow
przy panice) wzgledem korzysci na tym etapie. System dodatkow zostaje w
calosci w JS (patrz CONTRIBUTING §4) i tak dalej sie rozwija - instalowanie,
odinstalowywanie i punkty kontrybucji dzialaja i beda dalej rozbudowywane bez
WASM.

## Kolejność prac (zaktualizowana)

Pierwotne zalozenie bylo: najpierw w pelni dokonczyc IP Scanner, dopiero potem
przeksztalcac go w dodatek na powloce. **To zalozenie zostalo swiadomie
odwrocone przez uzytkownika** - priorytetem jest praca nad powloka (shell) i
systemem dodatkow, poprawki/dokonczanie skanera schodza na dalszy plan.

Niezmienna zasada mimo odwrocenia priorytetu: **nic z dzisiejszych funkcji
skanera nie znika/nie chowa sie, dopoki nie ma czym tego zastapic.** Pelny
podzial shell/tool w calym `js/new-ui/core/**` (11 inkrementow, patrz
`PROGRESS.md` i CONTRIBUTING §12) zostal **ukonczony** - same
niskoryzykowne, bezbehawioralne kroki, jeden plik na raz, z dzialajacym
buildem i smoke-testem po kazdym. Ten sam rygor (male, weryfikowalne kroki)
obowiazuje przy dalszej rozbudowie systemu dodatkow opisanej nizej.

## Docelowa wizja (punkt 2)

Aplikacja ma być "czystym programem" - generyczną powłoką złożoną z:

- paska menu na górze,
- lewej kolumny/paska (activity bar) z przyciskami,
- lewej sekcji (panel),
- prawej sekcji (panel),
- centralnej sekcji (panel),
- dolnego panelu (terminal / macro / console),
- dolnego niebieskiego paska informacyjnego (status bar).

IPscanner (skaner IP, biblioteka krajów, presety, wyniki, konsola PowerShell
itd.) ma być **zainstalowanym dodatkiem** na tej powłoce - czymś, co można
zainstalować i odinstalować, tak jak rozszerzenie w edytorze typu VS Code.
Powłoka sama w sobie ma być pusta/neutralna bez zainstalowanych dodatków.

### Wymagane możliwości dodatków (nie tylko IPscanner)

- Dodatek może dodać własną zawartość do lewej sekcji, prawej sekcji,
  centralnej sekcji ORAZ do lewej kolumny z przyciskami (activity bar) - nie
  tylko do panelu centralnego jak dziś.
- Dodatek może wchodzić w interakcję z dolnym panelem (terminal/macro/console)
  - np. wysyłać komendy, nasłuchiwać zdarzeń, dopisywać własne zakładki.
- Możliwa jest interakcja pomiędzy wszystkimi panelami nawzajem (lewy, prawy,
  centralny, dolny) - potrzebna jest jakaś wspólna magistrala
  zdarzeń/komend, a nie tylko lokalny stan każdego runtime z osobna.
- Dodatek może wchodzić w interakcję z dolnym niebieskim paskiem
  informacyjnym (status bar) i z paskiem menu (nie tylko dodawać pozycje
  menu, tak jak dziś przez `contributions.menuActions`).

## Co dokładnie ma zawierać powłoka/podstawa (rozpisane)

### Górny pasek menu

- **File** - zostają wszystkie obecne opcje (Save session / Save session
  as... / Load session / Close session / Import another session data / Exit).
- **Options** - okrojony do tylko: **Language** i **Import Tools**. Reszta
  dzisiejszych pozycji (Country IP Library, Port Presets, Default Scan
  Values) to domena dodatku IPscanner, nie podstawy.
- **Tools** - okrojony do tylko: **ShellCraft** i **AI Assistant**. Reszta
  (scan-runner/IP Scanner, Topology, Globe) to narzędzia dostarczane przez
  dodatek IPscanner, nie wbudowane w podstawę.
- **Help** - zostaje bez zmian, wszystkie obecne opcje.

### Lewa listwa z przyciskami (activity bar)

W podstawie zostaje **tylko jedna pozycja** (reszta ikon aktywności, jak
dzisiejsze skaner/topology/globe, to już funkcje dodatku IPscanner, nie
podstawy):

- Dzisiejsze "IP Scan Results" trzeba przemianować na coś w stylu
  **"Lista danych wynikowych"** (Result Data List). Kliknięcie nie pokazuje
  już z góry ustalonych danych skanera, tylko otwiera w lewym panelu
  **listę dostępnych widoków/zakładek centralnych** - czyli to, co akurat
  dostarczają zainstalowane dodatki (np. wyniki skanowania, biblioteka IP i
  inne, gdy zainstalowany jest dodatek IPscanner).

### Prawy panel - AI Assistant

- AI Assistant zostaje wbudowanym elementem **podstawy** (nie dodatkiem), ale
  ma mieć **dostęp do wszystkiego** - danych i zdarzeń ze wszystkich paneli i
  wszystkich zainstalowanych dodatków, nie tylko do tego co sam renderuje.

### Lewy panel

- Domyślnie **całkowicie pusty**, bez żadnych zaszytych na sztywno zakładek.
  Zakładki dopisują wyłącznie zainstalowane dodatki.

### Panel centralny

- Też domyślnie **pusty/czysty**, ale **z zachowaniem możliwości wczytania
  sesji** - mechanizm Recent Sessions / Save-Load Session, który już mamy,
  zostaje częścią **podstawy** (to funkcja powłoki, nie konkretnego
  narzędzia), nawet jeśli akurat żaden dodatek nie jest zainstalowany.

### Dolny środkowy panel (Terminal / Macro / Console PowerShell)

- Te trzy zakładki zostają **nienaruszalną, niemodyfikowalną częścią
  podstawy** (dodatki nie mogą ich usunąć ani zastąpić własnymi).
- Mimo to dodatki mają móc **wchodzić z nimi w interakcję** dokładnie tak
  samo jak z lewym, centralnym i prawym panelem (np. wysyłać komendy do
  terminala, dopisywać wpisy do Console, nasłuchiwać zdarzeń stąd).

### Dolny niebieski pasek informacyjny (status bar)

- Też ma mieć API interakcji dla dodatków (dodatek może tam coś wyświetlić
  albo zaktualizować).
- Elementy do zaprojektowania w tym pasku:
  - **Loader** - wskaźnik "coś się aktualnie dzieje" (aktywna operacja).
  - **Licznik uruchomionych procesów** (ile operacji/zadań trwa równolegle).
  - **Pasek ładowania 0-100%** dla operacji z mierzalnym postępem.
  - **Dodatkowe, rozszerzalne miejsce** na wyświetlanie różnych
    zmiennych/wartości/powiadomień - slot, w którym każdy dodatek (i sama
    podstawa) może wystawić własny mini-widget statusu.

### Manager zarządzania dodatkami (częściowo zrobiony)

- **Instalacja** dodatków - dziala (katalog z GitHuba w Import Tool + plik
  lokalny; patrz "Stan obecny" nizej i CONTRIBUTING §4).
- **Dezinstalacja** dodatków - dziala (z pelnym sprzataniem dynamicznie
  utworzonych zakladek, paneli i wpisow menu).
- **Ustawienia** - konfiguracja per-dodatek, widoczna w jednym miejscu -
  **do zrobienia**.

## Dodatkowe możliwości (zaakceptowane, dorzucone przez Claude'a)

Poniższe propozycje zostały zaakceptowane i dochodzą do ustalonej wizji powyżej:

1. **Paleta komend (Command Palette)** - okno wyszukiwania (np. pod
   Ctrl+Shift+P jak w VS Code) z listą wszystkich komend z podstawy i
   wszystkich zainstalowanych dodatków, żeby nie trzeba było szukać
   wszystkiego wyłącznie po menu.
2. **Ujednolicony system ustawień** - dodatki kontrybuują własny schemat
   ustawień (podobnie jak `contributions.tools` dziś), a użytkownik widzi
   ustawienia podstawy i wszystkich dodatków w jednym, wspólnym miejscu
   zamiast każdy dodatek robił to po swojemu.
3. **System powiadomień (toast/notification)** - odrębny od paska statusu,
   do tymczasowych, znikających komunikatów wywoływanych przez dodatki
   (np. "skan zakończony", "błąd połączenia").
4. **Zarządzanie skrótami klawiszowymi (keybindings)** dla komend
   dostarczanych przez dodatki, z możliwością przypisania własnych skrótów.
5. **Model uprawnień/sandboxing dla dodatków** - istotne akurat dla
   narzędzia sieciowego/bezpieczeństwa: dodatek powinien deklarować w
   manifeście, czego potrzebuje (dostęp do PowerShell, sieci, plików,
   konkretnych paneli), żeby ograniczyć ryzyko instalacji złośliwego
   dodatku. Bez tego "instalowalne dodatki" to też potencjalna furtka
   bezpieczeństwa, o czym warto pamiętać projektując manager z sekcji wyżej.
   Mechanizm sandboxingu pozostaje otwartym pytaniem (WASM byl rozwazany i
   odrzucony po prototypie - patrz notatka na gorze pliku); dzisiejszy,
   dzialajacy model to reczne potwierdzenie `permissions` z manifestu przy
   instalacji (patrz CONTRIBUTING §4), bez izolacji na poziomie runtime.
6. **Wersjonowanie dodatków** i podstawowe sprawdzanie
   kompatybilności/aktualizacji (dodatek działa z wersją X powłoki wzwyż).
7. **Wiele jednoczesnych ikon w activity bar** - jedna na każdy
   zainstalowany dodatek (nie tylko ta jedna wbudowana pozycja z podstawy),
   żeby dodatki mogły mieć własne, niezależne wejście do lewego panelu.

## Stan obecny

Pierwsza wersja tej sekcji (ponizej jako "Stan pierwotny (przed prototypem)")
opisywala punkt wyjscia sprzed rozbudowy systemu dodatkow o realne punkty
kontrybucji. Ten prototyp **dziala w calosci w JS**, bez sandboxingu na
poziomie runtime - patrz CONTRIBUTING §4 po pelny opis manifestu i przyklad.
Skrot stanu na dzis (zbadane w `js/new-ui/core/extensions.js`,
`bootstrap-runtime.js`, `panels-runtime.js`, `runtimes/navigation-runtime.js`,
`runtimes/command-bus-runtime.js`, `menu-runtime.js`):

- **Panel centralny**: jak wczesniej - `contributions.tools` + fallback
  `renderDefaultTool` (title/text/points), rozszerzony dzis o `actions`
  (przyciski wywolujace komendy) i `resultKey` (wyswietlanie wyniku).
  Nadal tylko statyczna karta + lista przyciskow - brak dowolnego, wlasnego
  markupu/interaktywnosci dodatku.
- **Lewy panel boczny**: **juz nie w 100% na sztywno.** Dodatek z
  `ui.showInLeftPanel: true` dostaje prawdziwy, dynamicznie tworzony panel
  (`syncExtensionToolUi()` w `bootstrap-runtime.js`), tresc renderowana tym
  samym `buildDetailHtml()` co panel centralny. Wciaz brak wlasnego,
  dowolnego markupu poza tym schematem (title/text/points/actions).
- **Prawy panel**: **juz nie w 100% na sztywno.** Analogicznie do lewego,
  przez `ui.showInRightPanel: true` - nowa zakladka + pane w prawym panelu,
  ta sama tresc co lewy/centralny.
- **Dolny panel (terminal/macro/console)**: bez zmian - bespoke, scisle
  powiazany z `powershell-console-runtime.js` i
  `runtimes/status-log-runtime.js`; brak API rozszerzen.
- **Pasek menu**: rozszerzalny na dwa sposoby dzis - `contributions.menuActions`
  (relabeling istniejacych, zaszytych na sztywno pozycji, bez zmiany
  zachowania) ORAZ (nowe) `contributions.optionsMenu` - realna, nowa pozycja
  w menu Options tworzona przez dodatek, otwierajaca naraz jego wlasne
  narzedzia przez ich flagi `ui` (LS/RS/CS).
- **Pasek statusu (dolny, niebieski)**: bez zmian - brak API rozszerzen.
- **Magistrala komend**: juz nie brak - `runtimes/command-bus-runtime.js`
  (generyczny rejestr `register`/`invoke`/`unregisterAllFor`) istnieje i ma
  realne rejestracje: `contributions.commands` dodatku (dzis tylko typ
  `"powershell"`) rejestruje sie tam przy instalacji, `actions` na narzedziu
  wywoluja komende przez ten sam bus. To jeszcze nie pelna "paleta komend"
  (punkt 1 z listy nizej) - nie ma UI do przegladania/wyszukiwania
  zarejestrowanych komend, ale mechanizm rejestru juz dziala.
- **Magistrala zdarzen**: nadal ad-hoc `CustomEvent`y, nie sformalizowany
  katalog tematow z wersjami/schematem - `newui:sidebar-tab-intent-open` i
  nowy `newui:right-tab-intent-open` dzialaja analogicznie do siebie, ale to
  wciaz dwa osobno zdefiniowane zdarzenia, nie jeden udokumentowany system.
- **Instalacja/dezinstalacja w czasie dzialania aplikacji**: **juz dziala** -
  manifest JSON (plik lub katalog z GitHuba), z realnym oknem potwierdzenia
  uprawnien przed instalacja, ale tylko dla jednego uprawnienia
  (`"powershell"`), nie pelny model capability-based.

### Stan pierwotny (przed prototypem, dla kontekstu historycznego)

Przed powyzszym prototypem: panel centralny byl jedynym miejscem z
jakimkolwiek mechanizmem rozszerzen; lewy i prawy panel byly w 100% zaszyte
na sztywno bez zadnego dynamicznego mechanizmu; jedynym wyjatkiem od "wszystko
na sztywno" bylo `contributions.menuActions`; nie istnial zaden rejestr
komend ani zaden mechanizm instalacji/dezinstalacji w czasie dzialania
aplikacji poza wklejeniem JSON w Import Tool.

## Co realnie trzeba zaprojektować, żeby to zrobić dobrze

To nie jest refaktor "przy okazji" - to decyzja architektoniczna na poziomie
całej aplikacji, analogiczna do tego jak od początku zaprojektowany jest VS
Code (czysta powłoka + wszystko inne jako wbudowane rozszerzenia). Żeby
zrobić to porządnie, potrzeba:

1. **Prawdziwego API punktów kontrybucji (contribution points)** dla każdej
   sekcji z osobna: lewy panel, prawy panel, panel centralny, dolny panel,
   pasek statusu, pasek menu, activity bar - analogicznie do tego jak VS
   Code definiuje `contributes.views`, `contributes.viewsContainers` itd.
2. **Magistrali zdarzeń/komend (event bus / command bus)** wspólnej dla
   całej aplikacji, żeby dodatki mogły się komunikować między sobą i z
   powłoką w spójny, udokumentowany sposób (zamiast obecnych ad-hoc
   `CustomEvent`ów rozsianych po runtime'ach).
3. **Migracji całej dzisiejszej funkcjonalności IPscanner** (skaner, biblioteka
   IP, presety, wyniki, konsola PowerShell) tak, żeby stała się "pierwszym
   zainstalowanym dodatkiem" na tej powłoce, zamiast być wbudowana
   bezpośrednio w `panels-runtime.js`/`navigation-runtime.js`/
   `powershell-console-runtime.js` na sztywno.
4. Prawdopodobnie też mechanizmu **instalacji/deinstalacji** dodatków w
   czasie działania aplikacji (nie tylko wczytania manifestu JSON jak dziś w
   Import Tool), skoro dodatek ma być "instalowalny i odinstalowywalny".
5. Uwzględnienia zaakceptowanych dodatkowych możliwości z sekcji wyżej już na
   etapie projektowania API kontrybucji - w szczególności paletę komend,
   ujednolicony system ustawień, powiadomienia, skróty klawiszowe, model
   uprawnień/sandboxing dla dodatków, wersjonowanie oraz wiele ikon activity
   bar (po jednej na dodatek) - żeby nie trzeba było później przerabiać
   samego API kontrybucji pod te funkcje.

To dotknie praktycznie każdego pliku runtime w `js/new-ui/core/**` i wymaga
osobnego, porządnego planowania (patrz sekcja "Kolejność prac" wyżej -
priorytet zostal odwrocony: najpierw powloka i system dodatkow, dokonczenie
skanera schodzi na dalszy plan). Dalszy rozwój
punktow kontrybucji (nowe sekcje, event bus, command palette, ustawienia,
itd.) zostaje w calosci w JS - patrz notatka na gorze pliku.
