PLIK BAZY DANYCH SESJI (.sqlite3) - OPIS STRUKTURY
====================================================

Co to za plik
--------------
Plik tworzony przez File > Save Session / Save Session As w aplikacji.
To zwykla baza SQLite - mozna ja otworzyc dowolnym narzedziem do przegladania
SQLite (np. DB Browser for SQLite: https://sqlitebrowser.org/) i podejrzec
lub recznie zmienic zawartosc kazdej tabeli.

Kazdy zapis sesji (Save Session / Save Session As) czysci zawartosc
wszystkich tabel i wstawia ja na nowo - plik zawsze odzwierciedla aktualny
stan aplikacji z chwili zapisu (nie jest to historia zmian, tylko jedna
"biezaca" migawka).

Zrodlo w kodzie: src-tauri/src/main.rs, funkcje write_session_data (zapis)
i read_session_data (odczyt), stala SESSION_SCHEMA_SQL (definicja tabel).

Od wersji z zapisem/odczytem sesji na www (przegladarka, ipscanner.pl) istnieje
DRUGIE, rownolegle zrodlo tego samego schematu: js/new-ui/core/runtimes/
session-sqlite-runtime.js (funkcje encodeSessionData/decodeSessionBytes,
stala SESSION_SCHEMA_SQL w JS), dzialajace przez sql.js zamiast rusqlite -
bo przegladarka nie ma dostepu do backendu Rust. Oba miejsca musza definiowac
identyczny schemat i identyczna kolejnosc zapytan (SELECT ... ORDER BY),
zeby plik zapisany na jednej platformie dal sie poprawnie odczytac na drugiej -
patrz komentarz na gorze tego pliku JS.


TABELA: scan_results
---------------------
Jeden wiersz = jeden zeskanowany adres IP (wynik skanu).

  id                     - numer wiersza (klucz glowny, nadawany automatycznie)
  ip                     - zeskanowany adres IP
  ping                   - czas odpowiedzi ping w formie tekstowej, np. "12 ms" albo "-"
  hostname               - rozpoznana nazwa hosta (albo "-" jesli nieznana)
  flag                   - flaga/kod kraju powiazany z tym IP (albo "-")
  isp                    - nazwa dostawcy internetu (ISP) dla tego IP (albo "-")
  as_info                - numer/opis systemu autonomicznego (AS) dla tego IP
  device_identification  - rozpoznany typ urzadzenia, np. "Proxy / Hosting" (moze byc puste)
  city                   - rozpoznane miasto powiazane z tym IP (geolokalizacja
                           hosta, wlaczana w Config -> Host Enrichment), puste
                           jesli nieznane albo enrichment byl wylaczony
  country_code           - kod kraju z geolokalizacji hosta (np. "PL", "US"),
                           osobna kolumna od "flag" wyzej (ten sam wynik
                           lookupu, ale surowy kod ISO zamiast gotowej flagi
                           do UI); puste jesli nieznane
  lat                    - szerokosc geograficzna hosta (liczba zmiennoprzecinkowa),
                           NULL jesli nieznana - uzywane m.in. przez widok Globe
  lon                    - dlugosc geograficzna hosta, NULL jesli nieznana
  status                 - status hosta, np. "active"
  status_class           - klasa stylu statusu uzywana w interfejsie, np. "is-up"

Powiazana tabela: scan_result_ports (patrz nizej) - otwarte porty dla
kazdego wiersza z tej tabeli.


TABELA: scan_result_ports
--------------------------
Jeden wiersz = jeden otwarty port znaleziony na danym IP.
Relacja 1-do-wielu wzgledem scan_results (jeden host moze miec wiele portow).

  id         - numer wiersza (klucz glowny)
  result_id  - wskazuje na scan_results.id (ktorego hosta dotyczy ten port);
               przy usunieciu wiersza z scan_results, powiazane porty
               usuwaja sie automatycznie (ON DELETE CASCADE)
  port       - numer portu (np. 80, 443, 22)
  protocol   - protokol tego portu: "TCP" albo "UDP" (aplikacja realnie
               skanuje oba, bez uprawnien administratora - UDP przez
               polaczony socket, wykrywanie ECONNRESET jako sygnal
               "port zamkniety")
  status     - "open" (potwierdzony otwarty - dla TCP zawsze, dla UDP tylko
               gdy przyszla realna odpowiedz) albo "open_filtered" (tylko
               UDP - brak jakiejkolwiek odpowiedzi w limicie czasu, co dla
               UDP moze znaczyc zarowno "otwarty" jak i "cicho filtrowany
               przez firewall" - nie da sie tego rozroznic, to wlasciwosc
               samego protokolu UDP, nie ograniczenie tej aplikacji)
  service    - rozpoznana nazwa uslugi dla tego portu (np. "HTTP" dla 80),
               z tabeli w js/new-ui/core/utils/net-utils.js; puste jesli port
               nie jest rozpoznany. Zapisywane w chwili skanu, nie przeliczane
               na nowo przy kazdym wczytaniu - zmiana tabeli rozpoznawania w
               przyszlej wersji aplikacji nie zmieni etykiet w juz zapisanych
               sesjach
  ping       - czas odpowiedzi (ping) zmierzony dla hosta przy tym porcie,
               jako tekst gotowy do wyswietlenia (np. "12 ms"); domyslnie "-"
               gdy nieznany

Uwaga (migracja): pliki sesji zapisane przed dodaniem protocol/service/ping
maja tylko 3 kolumny (id, result_id, port); pliki zapisane przed dodaniem
status (UDP open|filtered) maja protocol/service/ping ale nie status. Zapis
takiego pliku dopisuje brakujace kolumny automatycznie (ALTER TABLE, patrz
open_session_sqlite_conn w main.rs, migracja per-kolumna: protocol ->
DEFAULT 'TCP', status -> DEFAULT 'open', service -> DEFAULT '', ping ->
DEFAULT '-'); odczyt starego pliku bez zapisywania go od razu dziala tez
poprawnie - ma osobny fallback co najmniej 4-tier (pelny SELECT z
protocol/status/service/ping, potem coraz wezsze warianty dla starszych
plikow), brakujace wartosci pokazuja sie jako protocol="TCP", status="open",
service="", ping="-". To samo dotyczy rownoleglego schematu w JS
(session-sqlite-runtime.js, uzywany przez sql.js na www) - identyczna
4-tier logika fallbacku, patrz komentarz na gorze tego pliku.


TABELA: ip_library_entries
----------------------------
Jeden wiersz = jeden zakres/adres IP z biblioteki krajow (Country IP Library).

  id            - numer wiersza (klucz glowny)
  country_code  - kod kraju przypisany do tego zakresu (np. "PL", "US")
  cidr          - zakres adresow w notacji CIDR (np. "1.2.3.0/24")


TABELA: ip_library_meta
-------------------------
Pojedynczy wiersz (zawsze id=1) z metadanymi biblioteki krajow.

  id          - zawsze 1 (tabela ma tylko jeden wiersz)
  updated_at  - znacznik czasu ostatniej aktualizacji biblioteki IP


TABELA: port_presets
----------------------
Jeden wiersz = jeden zdefiniowany preset portow (np. "Cameras", "Printers").

  id          - identyfikator presetu (np. "all-ports", "cameras")
  emoji       - ikona/emoji presetu wyswietlana w UI
  name        - nazwa presetu widoczna dla uzytkownika
  ports       - lista portow presetu jako tekst rozdzielony przecinkami
                (np. "80,443,554,8080"), tak jak edytuje sie to w aplikacji
  is_default  - 1 jesli to jest domyslnie wybrany preset, w przeciwnym razie 0


TABELA: scan_defaults
-----------------------
Pojedynczy wiersz (zawsze id=1) z domyslnymi wartosciami skanowania.

  id           - zawsze 1
  timeout_ms   - domyslny timeout skanu w milisekundach
  concurrency  - domyslna liczba rownoleglych polaczen podczas skanu


TABELA: scan_progress
-----------------------
Pojedynczy wiersz (zawsze id=1) z ostatnim zapisanym stanem postepu skanu.

  id         - zawsze 1
  state      - stan skanu w chwili zapisu, np. "start", "update", "done",
               "cancelled", "error", "reset"
  processed  - liczba przetworzonych adresow IP
  total      - laczna liczba adresow IP do przeskanowania
  found      - liczba znalezionych/aktywnych hostow


TABELA: session_layout_tabs
-----------------------------
Jeden wiersz = jedna otwarta zakladka/narzedzie w ktorejs z trzech sekcji
interfejsu w chwili zapisu (lewy panel, prawy panel, panel centralny).
Uzywana do przywrocenia ukladu okna po wczytaniu sesji.

  id         - numer wiersza (klucz glowny)
  section    - ktora sekcja interfejsu: "center", "left" albo "right"
  tool       - identyfikator narzedzia/zakladki (np. "ip-library", "presets")
  is_active  - 1 jesli ta zakladka byla aktywna (widoczna) w danej sekcji
               w chwili zapisu, w przeciwnym razie 0

Uwaga: narzedzia ktore w chwili zapisu byly odczepione do plywajacego okna
sa tutaj zapisywane tak samo jak zwykle otwarte zakladki - po wczytaniu
sesji wracaja jako normalne zakladki (nie jako odczepione okna). Pozycja
i rozmiar odczepionego okna nie sa czescia pliku sesji.


TABELA: session_meta
----------------------
Pojedynczy wiersz (zawsze id=1) z metadanymi samego zapisu sesji.

  id           - zawsze 1
  saved_at     - znacznik czasu ostatniego zapisu tego pliku sesji
  version      - numer wersji formatu pliku sesji (obecnie zawsze 1)
  app_version  - wersja aplikacji (np. "2.8.5"), ktora zapisala ten plik;
                 uzywana przy wczytywaniu do ostrzezenia, jesli plik
                 pochodzi z innej wersji aplikacji niz ta aktualnie
                 uruchomiona. Puste w plikach zapisanych przed dodaniem tej
                 kolumny


TABELA: agent_profiles
------------------------
Jeden wiersz = jedna zapisana tozsamosc OSINT (funkcja Agent Identity,
Options -> Agent Identity) - dane uzywane do zakladania kont/rejestracji
na potrzeby researchu, nie dane samego uzytkownika aplikacji.

  id        - identyfikator profilu (tekstowy, generowany w JS)
  name      - imie/nazwa wyswietlana profilu
  nickname  - pseudonim/nick powiazany z tozsamoscia
  email     - adres e-mail tozsamosci
  login     - login/nazwa uzytkownika
  password  - haslo tozsamosci - UWAGA: zapisywane w postaci JAWNEGO TEKSTU,
              bez szyfrowania (ten sam poziom ochrony co reszta pliku sesji -
              plik sesji nie jest w zaden sposob szyfrowany, wiec nie
              przechowuj tu hasel do prawdziwych/waznych kont)
  note      - dowolna notatka tekstowa do profilu


TABELA: agent_profile_attachments
------------------------------------
Jeden wiersz = jeden zalacznik (zdjecie albo plik) powiazany z profilem.
Relacja 1-do-wielu wzgledem agent_profiles (ON DELETE CASCADE).

  id            - identyfikator zalacznika (tekstowy)
  profile_id    - wskazuje na agent_profiles.id
  filename      - oryginalna nazwa pliku
  mime_type     - typ MIME pliku (np. "image/png")
  role          - rola zalacznika, np. "photo" (zdjecie profilowe) albo
                  "file" (zwykly zalacznik) - domyslnie "file"
  data          - zawartosc pliku jako surowe bajty (BLOB)


TABELA: agent_profile_services
---------------------------------
Jeden wiersz = jeden serwis/konto powiazane z profilem (np. "Facebook",
"Instagram" - dowolna, wpisywana recznie nazwa). Relacja 1-do-wielu
wzgledem agent_profiles (ON DELETE CASCADE).

  id          - identyfikator serwisu (tekstowy)
  profile_id  - wskazuje na agent_profiles.id
  name        - nazwa serwisu wpisana przez uzytkownika


TABELA: agent_profile_service_fields
---------------------------------------
Jeden wiersz = jedno dowolne pole danych w ramach serwisu (np. "PIN",
"Data urodzenia uzyta przy rejestracji"). Relacja 1-do-wielu wzgledem
agent_profile_services (ON DELETE CASCADE).

  id          - identyfikator pola (tekstowy)
  service_id  - wskazuje na agent_profile_services.id
  label       - etykieta pola wpisana przez uzytkownika (dowolny tekst)
  type        - typ pola do celow wyswietlania w UI, np. "text" albo
                "password" (steruje np. przyciskiem pokaz/ukryj) - domyslnie "text"
  value       - wartosc pola (jawny tekst, ta sama uwaga co przy
                agent_profiles.password)


TABELA: session_extensions
-----------------------------
Jeden wiersz = jeden zainstalowany dodatek (addon) w chwili zapisu sesji.
Uzywana przy wczytywaniu do wykrycia brakujacych dodatkow (jesli plik
sesji zapisano na innym komputerze/profilu) i zaproponowania ich
ponownej instalacji jednym klikniem, bez potrzeby laczenia sie z
internetem od razu (pelny manifest jest zapisany w pliku).

  id             - identyfikator dodatku (ten sam co jego "id" w manifescie)
  name           - nazwa dodatku w chwili zapisu
  version        - wersja dodatku w chwili zapisu
  manifest_json  - pelna tresc manifestu dodatku (JSON, jako tekst) - dzieki
                   temu ponowna instalacja z pliku sesji nie wymaga
                   pobierania niczego z GitHuba


TABELA: https_audit_history
------------------------------
Jeden wiersz = jeden zapisany wynik narzedzia HTTPS Auditor (Tools ->
HTTPS Auditor). Lista tych wpisow jest widoczna w lewym panelu jako
"Audit history" po otwarciu narzedzia.

  id             - identyfikator wpisu (tekstowy, generowany w JS)
  audited_at     - znacznik czasu (ISO 8601) kiedy wykonano ten audyt
  requested_url  - adres URL wpisany przez uzytkownika do sprawdzenia
  final_url      - adres URL po ewentualnych przekierowaniach
  grade          - ocena literowa A-F wyliczona dla tego wyniku (moze byc
                   puste dla bardzo starych wpisow sprzed dodania oceny)
  result_json    - pelny wynik audytu (naglowki, certyfikat, lancuch
                   przekierowan, mixed content) jako JSON zapisany w
                   postaci tekstu - UI odtwarza z tego caly widok wyniku
                   bez ponownego wykonywania zadania sieciowego


TABELA: memory_notepad
------------------------
Pojedynczy wiersz (zawsze id=1) z zawartoscia notatnika zakladki "Memory"
(tryb skanowania Memory obok Range/CIDR - patrz sidebar, sekcja IP Range).

  id       - zawsze 1
  content  - pelna, surowa tresc notatnika (jeden adres IP na linie,
             albo oddzielone spacjami/przecinkami) jako zwykly tekst


TABELA: ip_extractor_state
-----------------------------
Pojedynczy wiersz (zawsze id=1) z ostatnio wpisanym tekstem w polu
wejsciowym narzedzia IP Extractor (sidebar skanera).

  id          - zawsze 1
  input_text  - surowy tekst ostatnio wpisany/wklejony w pole wejsciowe
                IP Extractora (przed ekstrakcja)


TABELA: ip_extractor_entries
-------------------------------
Jeden wiersz = jeden adres IP na liscie wyekstrahowanych przez IP Extractor
(wynik klikniecia "Add / Extract", widoczny ponizej pola wejsciowego).

  id  - numer wiersza (klucz glowny, nadawany automatycznie)
  ip  - wyekstrahowany adres IP


TABELE, KTORYCH APLIKACJA NIE TWORZY SAMA W BIEZACEJ WERSJI
==============================================================

Jesli otwierasz starszy plik sesji (zapisany wczesniejsza wersja aplikacji
albo pochodzacy z pliku, ktory byl zapisywany rowniez starszym kodem), mozesz
dodatkowo zobaczyc:

TABELA: session
------------------
Pozostalosc po wczesniejszej wersji formatu pliku sesji, w ktorej caly stan
aplikacji byl trzymany jako jeden wiersz z kolumna payload_json (jeden duzy
tekst JSON), zamiast osobnych tabel opisanych wyzej. Aktualny kod przy kazdym
zapisie (Save Session / Save Session As) usuwa te tabele, jesli natrafi na
nia w istniejacym pliku (DROP TABLE IF EXISTS session) - wiec po jednym
kolejnym zapisie tego samego pliku ta tabela zniknie. Nie jest juz uzywana
do niczego przez aplikacje.

TABELA: sqlite_sequence
--------------------------
To nie jest tabela stworzona przez aplikacje - tworzy ja automatycznie sam
silnik SQLite, poniewaz kilka tabel uzywa kolumny "INTEGER PRIMARY KEY
AUTOINCREMENT" (scan_results, scan_result_ports, ip_library_entries,
session_layout_tabs). SQLite trzyma w niej ostatnio uzyty numer id dla
kazdej takiej tabeli, zeby nowe wiersze zawsze dostawaly wyzszy numer, nawet
po usunieciu wczesniejszych wierszy. Mozna ja zignorowac - nie trzeba jej
recznie edytowac ani sie nia przejmowac.
