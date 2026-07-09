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

  id         - zawsze 1
  saved_at   - znacznik czasu ostatniego zapisu tego pliku sesji
  version    - numer wersji formatu pliku sesji (obecnie zawsze 1)


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
