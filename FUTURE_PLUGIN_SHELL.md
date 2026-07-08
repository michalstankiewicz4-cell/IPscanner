# Wizja: IPscanner jako dodatek na czystej powłoce

Ten plik opisywal pierwotnie kierunek rozwoju, ktory NIE byl jeszcze
realizowany. Od tego czasu czesc wizji zostala sprototypowana (bez WASM -
patrz sekcja "Stan obecny" nizej) - plik zostaje jako zapis pelnej, docelowej
wizji i listy tego, co jeszcze nie jest zrobione, zeby nie trzeba bylo
odtwarzac tej rozmowy od zera.

## Kolejność prac (zaktualizowana)

Pierwotne zalozenie bylo: najpierw w pelni dokonczyc IP Scanner, dopiero potem
przeksztalcac go w dodatek na powloce. **To zalozenie zostalo swiadomie
odwrocone przez uzytkownika** - priorytetem jest praca nad powloka (shell) i
systemem dodatkow, poprawki/dokonczanie skanera schodza na dalszy plan.

Niezmienna zasada mimo odwrocenia priorytetu: **nic z dzisiejszych funkcji
skanera nie znika/nie chowa sie, dopoki nie ma czym tego zastapic.** Pelny
podzial shell/tool w calym `js/new-ui/core/**` (11 inkrementow, patrz
`SHELL_PROGRESS.md` i CONTRIBUTING §12) zostal **ukonczony** - same
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

### Manager zarządzania dodatkami (do zrobienia)

- **Instalacja** dodatków.
- **Dezinstalacja** dodatków.
- **Ustawienia** - konfiguracja per-dodatek, widoczna w jednym miejscu.

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
   **Ustalone (2026-07-08): mechanizmem sandboxingu będzie WASM** - patrz
   nowa sekcja "Magistrala zdarzeń/komend i punkty kontrybucji (pod WASM)"
   niżej, to już nie jest otwarta opcja tylko podjęta decyzja.
6. **Wersjonowanie dodatków** i podstawowe sprawdzanie
   kompatybilności/aktualizacji (dodatek działa z wersją X powłoki wzwyż).
7. **Wiele jednoczesnych ikon w activity bar** - jedna na każdy
   zainstalowany dodatek (nie tylko ta jedna wbudowana pozycja z podstawy),
   żeby dodatki mogły mieć własne, niezależne wejście do lewego panelu.

## Stan obecny (zaktualizowany po pierwszym, nie-WASM prototypie)

Pierwsza wersja tej sekcji (ponizej jako "Stan pierwotny (przed prototypem)")
opisywala punkt wyjscia sprzed rozbudowy systemu dodatkow o realne punkty
kontrybucji. Ten prototyp **dziala dzis w JS, bez WASM/sandboxingu** - patrz
CONTRIBUTING §4 po pelny opis manifestu i przyklad. Skrot stanu na dzis
(zbadane w `js/new-ui/core/extensions.js`, `bootstrap-runtime.js`,
`panels-runtime.js`, `runtimes/navigation-runtime.js`,
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
- **Instalacja/dezinstalacja w czasie dzialania aplikacji**: **juz dziala**,
  ale inaczej niz zaklada sekcja WASM nizej (patrz tam "Uwaga" pod naglowkiem
  Instalacja/dezinstalacja) - dzis to manifest JSON (plik lub katalog z
  GitHuba), nie skompilowany `.wasm`; jest realne okno potwierdzenia
  uprawnien przed instalacja, ale tylko dla jednego uprawnienia
  (`"powershell"`), nie pelny model capability-based z sekcji nizej.

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
osobnego, porządnego planowania (patrz sekcja "Kolejność prac" wyżej - robimy
to dopiero po dokończeniu w pełni działającego skanera).

## Magistrala zdarzeń/komend i punkty kontrybucji (pod WASM)

Ustalone: mechanizmem instalowania/sandboxingu dodatków będzie **WASM** (dodatek
skompilowany do WebAssembly, uruchamiany w piaskownicy wbudowanej w apkę Rust).
To nie jest szczegół implementacyjny odłożony na później - **zmienia ksztalt
calego API kontrybucji już teraz**, więc projektujemy to od razu z tym
zalozeniem, zamiast projektować "generyczne JS API" i potem je przerabiać.

### Dlaczego WASM zmienia kształt API

Moduł WASM działa w piaskownicy z własną pamięcią liniową. Może wymieniać z
hostem (JS/Rust) tylko dane **serializowalne** (liczby, stringi/bufory przez
wspólną pamięć) - nie może:

- trzymać żywej referencji do węzła DOM,
- otrzymać referencji do funkcji JS jako callbacka,
- samodzielnie manipulować DOM-em (nie ma dostępu do przeglądarki/DOM-u wprost).

Innymi słowy: **dodatek nie może "zawołać" żywego elementu ani przekazać
funkcji zwrotnej** tak jak dziś robi to JS-do-JS. Musi to wyglądać jak wymiana
wiadomości: dodatek dostaje serializowany opis sytuacji, zwraca serializowany
opis tego co ma się stać, a host (JS shell) faktycznie dotyka DOM-u.

**Dobra wiadomość:** część dzisiejszego kodu już ma dokładnie ten kształt.
`panel-content-runtime.js`'s `buildDetailHtml(tool)` **już dziś zwraca string
HTML** zamiast manipulować DOM-em bezpośrednio - host (`panels-runtime.js`)
wstawia ten string do kontenera. To jest dokładnie wzorzec zgodny z WASM, tylko
trzeba go sformalizować i zastosować konsekwentnie wszędzie (dziś
`panel-interactions-runtime.js`'s `wireXXXTool(rootEl)` łamie ten wzorzec,
bo dostaje żywy `rootEl` i sam podpina listenery - to trzeba będzie przerobić
na delegację zdarzeń, patrz niżej).

### Gdzie faktycznie działa WASM (dotąd nieustalone, ustalane teraz)

Dwie opcje, trzeba wybrać jedną, bo to zmienia implementację:

**Opcja A - WASM w webview (JS), rekomendowana.** Nowoczesne webview (WebView2
na Windows, którego używa Tauri) mają wbudowane, natywne wsparcie
`WebAssembly.instantiate()` w JS - bez żadnego udziału Rusta. Cały system
kontrybucji (render/handle_event, command bus, event bus) może działać
wyłącznie po stronie JS. Piaskownica bierze się z samej natury WASM (własna
pamięć liniowa, zero ambient authority) plus z tego, że host (JS) świadomie
udostępnia dodatkowi tylko wybrane funkcje importu, zgodnie z `permissions`.

**Opcja B - WASM w backendzie Rust (np. `wasmtime`).** Wymagałoby dodatkowego
przeskoku JS <-> Tauri `invoke()` <-> Rust-hosted-WASM na każdą interakcję -
więcej złożoności i opóźnień, bez wyraźnej korzyści, skoro webview i tak już
umie hostować WASM sam.

**Rekomendacja: Opcja A.** Rust/Tauri zostaje tym, czym jest dziś -
uprzywilejowaną bramką do rzeczy systemowych (sieć, pliki, PowerShell) poprzez
`invoke()`. Ważne: **`platform-runtime.js` już dziś jest dokładnie taką bramką**
(jedyne miejsce z bezpośrednim dostępem do `window.__TAURI__`, patrz
CONTRIBUTING §14/§12) - model uprawnień dla dodatków to naturalne rozszerzenie
tego co już istnieje, nie nowy koncept. Dodatek WASM woła funkcję importu JS
(np. `host_tcp_connect`), ta funkcja **wewnątrz** sprawdza `permissions` danego
dodatku i dopiero wtedy (albo nie) woła `platform.invoke(...)`. Brak
uprawnienia = host w ogóle nie rejestruje tej funkcji importu dla tej instancji
WASM, więc dodatek nie ma nawet czego zawołać.

**Konsekwencja dla wersji www (`ipscanner.pl`, bez backendu Tauri - ustalone w
rozmowie):** skoro WASM działa w webview (Opcja A), cała warstwa UI dodatku
(`render`/`handle_event`, panele, zakładki, menu, activity bar) **działa
identycznie na www i na desktopie** - to czysty JS+WASM, nie potrzebuje
Tauri. Different jest tylko dostępność uprawnień wymagających realnego
systemu (`network.tcp`, `shell.powershell`, dostęp do plików): na www host po
prostu nigdy ich nie przyznaje, niezależnie co deklaruje manifest dodatku -
dokładnie tak jak dziś działa `platform-runtime.js`'s tryb parity
(`isParityMode()`, CONTRIBUTING §13 "HTML parity": "akcje desktop-only nie
wywalają UI"). Czyli: zakładki się otwierają, panele renderują, nawigacja
działa wszędzie: funkcje wymagające Tauri po prostu nie są dostępne na www,
bez wywalania reszty interfejsu - nie nowa zasada, tylko zastosowanie już
istniejącej do nowego systemu dodatków.

### Kształt pojedynczego punktu kontrybucji

Dla każdej sekcji (lewy/prawy/centralny panel, status bar, activity bar, menu)
dodatek eksportuje dwie funkcje o serializowalnych sygnaturach:

```
render(context: JSON) -> html: String
handle_event(event: JSON) -> patch: JSON
```

- `render` dostaje kontekst (np. `{tool: "results-ip", state: {...}}` jako
  JSON) i zwraca gotowy HTML string do wstawienia - dokładnie jak dzisiejsze
  `buildDetailHtml`.
- Host podpina **jeden generyczny, delegowany listener** na kontener danego
  panelu (nie per-dodatek), łapie kliknięcia/inputy wewnątrz, buduje z nich
  serializowalny opis zdarzenia (`{type: "click", target: "[data-preset-action=add]", ...}`)
  i woła `handle_event` dodatku.
- `handle_event` zwraca "patch" - opis co ma się zmienić (np. `{rerender: true}`
  albo `{updateText: {selector, value}}`) - host wykonuje to na prawdziwym DOM-ie.
  Dodatek nigdy nie dotyka DOM-u sam.

### Command bus (rejestr nazwanych komend)

Wspólny rejestr `command-id -> handler`, do którego wpisuje się zarówno
podstawa jak i dodatki (przez manifest, `contributions.commands`). Wywołanie
komendy to zawsze `invoke(commandId, argsJson) -> resultJson` - ten sam
serializowalny kształt co wyżej, więc działa identycznie dla JS-owych
wbudowanych komend i dla komend z dodatku WASM. To od razu daje za darmo
**paletę komend** (punkt 1 z listy dodatkowych możliwości) - paleta to po
prostu lista wszystkich zarejestrowanych `command-id` z etykietą.

### Event bus (nazwane, wersjonowane tematy)

Dzisiejsze ad-hoc `CustomEvent`y (`newui:sidebar-tab-intent-open`,
`newui:console-pane-update` itd., patrz sekcja "Stan obecny" wyżej) zostają
zebrane w jeden udokumentowany katalog tematów, każdy z wersją i schematem
payloadu (np. `sidebar.tab.open.v1`). Dodatek może subskrybować/emitować tylko
tematy, na które manifest deklaruje uprawnienie (patrz niżej) - to samo w
sobie ogranicza co złośliwy dodatek może "podsłuchać".

### Manifest kontrybucji i uprawnień (rozszerzenie dzisiejszego)

Dzisiejszy manifest (`contributions.tools`/`menuActions`/`i18n` w
`extensions.js`) rozszerza się o:

```json
{
  "contributions": {
    "leftPanel": [...], "rightPanel": [...], "centerPanel": [...],
    "statusBar": [...], "activityBar": [...], "commands": [...],
    "settings": [...], "keybindings": [...]
  },
  "permissions": ["network.tcp", "shell.powershell", "storage", "panel.left", "panel.center"],
  "minShellVersion": "2.0.0"
}
```

`permissions` decyduje, jakie funkcje hosta (importy) w ogóle są widoczne dla
instancji WASM tego dodatku - klasyczny model capability-based. Brak
zadeklarowanego `network.tcp` = host nie daje dodatkowi żadnej funkcji do
otwierania połączeń, więc nawet gdyby dodatek chciał, fizycznie nie może.
`minShellVersion` realizuje punkt 6 (wersjonowanie dodatków) wprost.

### Pozostałe zaakceptowane funkcje - to samo API, nie osobne mechanizmy

Activity bar, ustawienia, powiadomienia i skróty klawiszowe to **nie są nowe
mechanizmy** - to kolejne typy kontrybucji w tym samym `render`/`handle_event`
+ manifest + `permissions` wzorcu co wyżej. Rozpisane osobno, żeby nie kusiło
zaprojektować dla każdego bespoke rozwiązania:

- **Activity bar (punkt 7 - wiele ikon)**: `contributions.activityBar` to
  lista `{id, icon, title}`; kliknięcie ikony to zwykłe wywołanie komendy
  (`contributions.commands`) przypisanej do tej ikony - żaden nowy mechanizm,
  tylko kolejny wpis w już zaprojektowanym command bus.
- **Ustawienia (punkt 2)**: `contributions.settings` to schemat pól (podobnie
  jak dziś `contributions.tools` opisuje kartę narzędzia) - ujednolicony panel
  ustawień to po prostu `render()` całego schematu wszystkich dodatków razem,
  a zapis zmiany to `handle_event()` jak każda inna interakcja panelu.
- **Powiadomienia (punkt 3)**: nowy temat w event bus (np. `notification.show.v1`
  z payloadem `{level, text}`), na który dodatek ma uprawnienie *emitować*, ale
  nie subskrybować cudzych powiadomień. Host renderuje toast - dodatek nigdy
  nie dotyka DOM-u toastu bezpośrednio, tak jak wszędzie indziej.
- **Skróty klawiszowe (punkt 4)**: `contributions.keybindings` to mapowanie
  `key-combo -> command-id` - działa na tym samym command bus, więc skrót
  klawiszowy i kliknięcie w palecie komend wywołują dokładnie tę samą ścieżkę.

### Instalacja/dezinstalacja (doprecyzowane z rozmowy)

**Uwaga (aktualizacja):** ponizszy opis to docelowa wizja pod WASM, jeszcze
niezrealizowana. Realnie dzialajacy dzis prototyp (patrz "Stan obecny" wyzej
i CONTRIBUTING §4) realizuje tylko punkty 2 i czesciowo 4 z listy nizej, bez
`.wasm` - manifest to nadal czysty JSON (z pliku lub katalogu na GitHubie),
a `permissions` to dzis jedna wartosc (`"powershell"`), nie pelny model
capability-based z listy uprawnien ponizej. Punkt 4 (dezinstalacja z pelnym
wyrejestrowaniem) dziala juz dla istniejacych rejestrow (LS/RS/CS/command
bus/Options-menu), ale nie dla keybindings/ustawien, bo te jeszcze nie
istnieja.

Instalacja **nie jest w pełni cicha/automatyczna** - to celowe, bo inaczej
`permissions` z manifestu nigdy nie byłyby nikomu pokazane:

1. Użytkownik wskazuje plik/folder z manifestem + skompilowanym `.wasm`
   (zastępuje to dzisiejsze pole "wklej JSON" w Import Tool - wklejanie tekstu
   nie ma sensu, gdy w grę wchodzi binarka).
2. Host parsuje manifest, **pokazuje listę żądanych `permissions`** do
   potwierdzenia (jak prompt uprawnień w przeglądarce/VS Code) - zanim
   cokolwiek się załaduje.
3. Po potwierdzeniu: host kopiuje pliki dodatku do trwałej lokalizacji (żeby
   przetrwały restart appki), ładuje moduł WASM, rejestruje jego kontrybucje
   (panele/komendy/ustawienia/skróty/ikona activity bar) ograniczone dokładnie
   do potwierdzonych uprawnień.
4. **Dezinstalacja** to operacja odwrotna: wyrejestrowanie wszystkich
   kontrybucji danego dodatku z każdego rejestru (panele, command bus, event
   bus, keybindings, activity bar), zwolnienie instancji WASM, usunięcie
   plików. Wymaga, żeby każdy rejestr wewnętrznie wiedział "co należy do
   którego dodatku", nie tylko "co jest zarejestrowane" - do uwzględnienia przy
   projektowaniu samych rejestrów, nie tylko przy samej dezinstalacji.

### Co jeszcze otwarte (nie rozstrzygać teraz, tylko odnotować)

- Dokładny format "na drucie" między hostem a WASM - JSON (prosty, czytelny,
  wolniejszy) vs format binarny typu MessagePack/FlatBuffers (szybszy,
  bardziej roboty). Dla zaczątku prawdopodobnie JSON - można zmienić później
  bez zmiany reszty API, bo to szczegół serializacji, nie kształtu API.
- Dokładne sygnatury funkcji importu/eksportu WASM (jak dokładnie przekazuje
  się stringi przez pamięć liniową - wskaźnik+długość, czy coś gotowego jak
  `wasm-bindgen`).
- Ile z dzisiejszego kodu (`panel-content-runtime.js`, `panel-renderers-runtime.js`)
  da się bezpośrednio zaadaptować (prawdopodobnie sporo, bo już zwraca HTML
  string) vs ile trzeba przepisać (`panel-interactions-runtime.js` - żywe
  listenery na `rootEl`, do przerobienia na delegację + `handle_event`).
- Czy AI Assistant (ma mieć "dostęp do wszystkiego") dostaje specjalne,
  szersze uprawnienia domyślnie, czy też deklaruje je w swoim manifeście jak
  każdy inny dodatek podstawy.
