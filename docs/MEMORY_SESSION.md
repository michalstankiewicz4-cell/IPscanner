# IPscanner New UI — local memory (localStorage)

Uwaga:
- Lista dotyczy aktualnego New UI (`index.html` + `js/new-ui`).
- Dane sa zapisywane przez `localStorage` albo przez adapter `platform.storage` (desktop parity).
- Czesc kluczy jest zapisywana warunkowo, dopiero po wykonaniu danej akcji przez uzytkownika.

Klucze sa podzielone na dwie grupy, bo maja rozny cykl zycia:

- **A. Ustawienia aplikacji** — trwaja zawsze, niezaleznie od otwierania/zamykania projektu i od Save/Load/Close Session.
- **B. Dane sesji** — to jest dokladnie to, co ląduje w pliku `.sqlite3` (Save/Save As), co czysci Close Session, i co docelowo ma wracac do zera przy kazdym nowym uruchomieniu aplikacji (patrz plan w rozmowie — jeszcze niezaimplementowany).

---

## A. Ustawienia aplikacji (persystentne, niezalezne od sesji)

### 1) Jezyk i slowniki

`netrecon_lang`
- Aktualny jezyk interfejsu.
- Typ: string (np. `"en"`, `"pl"`).
- Fallback: `"en"`.

`netrecon_custom_i18n`
- Wlasne slowniki dodane przez Language Manager / extension host.
- Typ: JSON object (`code -> dictionary`).
- Fallback: brak klucza = tylko slowniki bazowe.

### 2) Motyw UI

`netrecon_newui_skin`
- Aktualny skin New UI.
- Typ: string.
- Fallback: `"default"`.

### 3) Rozszerzenia

`netrecon_newui_extensions`
- Zainstalowane rozszerzenia (manifesty i contributions).
- Typ: JSON array.
- Fallback: `[]` (brak zainstalowanych rozszerzen).

### 4) Clippy

`netrecon_newui_clippy_enabled`
- Czy Clippy jest wlaczony (przyklad "czy pomoc byla ostatnio wlaczona").
- Typ: `"1"` albo `"0"`.
- Fallback: traktowane jak `"0"` (wylaczone).

### 5) Historia i widoki pomocnicze (wygoda, nie tresc sesji)

`netrecon_range_history`
- Historia ostatnich zakresow IP (From/To) z lewego panelu.
- Typ: JSON array, max 24 wpisy.
- Fallback: `[]` gdy brak klucza lub uszkodzony JSON.

`netrecon_results_ip_result_state_v1`
- Stan sortowania/rozwiniecia wierszy w tabeli wynikow (panel Results IP).
- Typ: JSON object.

`netrecon_results_ip_columns_v1`
- Ktore kolumny tabeli wynikow sa widoczne.
- Typ: JSON object (`kolumna -> bool`).

`netrecon_results_ip_filters_v1`
- Aktywne filtry tabeli wynikow.
- Typ: JSON object.

### 6) Detached windows i ich uklad

`netrecon_detached_layouts_v1`
- Zapamietane pozycje i rozmiary undocked kart narzedzi.
- Typ: JSON object (`tool -> {top,left,width,height}`).
- Fallback: `{}`.

`netrecon_detached_arrange_state_v1`
- Stan wariantu auto-arrange dla 2/3 okien detached.
- Typ: JSON object.
- Fallback: `{}`.

`netrecon_detached_auto_arrange_enabled_v1`
- Czy auto-arrange po undock jest wlaczone.
- Typ: `"1"` albo `"0"`.
- Fallback: wlaczone (true).

### 7) Tryb parity (desktop/web)

`netrecon_desktop_parity`
- Wymuszenie parity mode dla uruchomienia bez Tauri invoke.
- Typ: `"1"` albo `"0"` (akceptowane tez `true`/`on`).
- Fallback: off.

### 8) Wewnetrzny znacznik migracji (nie ustawienie uzytkownika, ale tez nie dane sesji)

`netrecon_scan_presets_default_allports_migrated_v1`
- Znacznik "czy jednorazowa migracja domyslnego presetu All ports juz sie wykonala".
- Typ: `"1"` po wykonaniu.
- Nie jest to preferencja uzytkownika ani zawartosc sesji — to wewnetrzny stan kodu, zyje tak dlugo jak instalacja.

### 9) Ustawienia samej funkcji sesji (nie mylic z danymi sesji!)

`netrecon_session_recent_v1`
- Lista MRU (max 10) ostatnio zapisanych/wczytanych plikow sesji, pokazywana na ekranie powitalnym.
- Typ: JSON array `[{path, name, savedAt}]`.
- Ma przetrwac restart aplikacji — to lista "Recent", nie zawartosc biezacej sesji (analogicznie do VS Code: "Recent" nie znika po zamknieciu programu).

`netrecon_session_last_dir`
- Ostatni katalog uzyty w oknie dialogowym zapisu/wczytania — domyslny katalog dla nastepnego dialogu.
- Typ: string (sciezka).

---

## B. Dane sesji (to samo co zapisuje Save/Save As do pliku `.sqlite3`, czysci Close Session)

### 1) Wyniki i postep skanu

`netrecon_scan_results_v1`
- Zeskanowane adresy IP wraz z portami/hostname/ISP/AS/status.
- Typ: JSON array wierszy wynikow.

`netrecon_scan_progress_v1`
- Biezacy postep skanu (state/processed/total/found).
- Typ: JSON object.

### 2) IP Library

`netrecon_country_ip_library_json`
- Biblioteka zakresow IP wg krajow (edytowalna przez uzytkownika, tez zapisywana w sesji).
- Typ: JSON string (tablica rekordow).

`netrecon_country_ip_library_updated_at`
- Czas ostatniej aktualizacji biblioteki IP.
- Typ: string (ISO datetime).
- Fallback: `"-"` w UI.

### 3) Presety portow i domyslne wartosci skanu

`netrecon_scan_presets_v1`
- Wspolny stan presetow portow dla panelu Presets i lewego comboboxa IP Scanner.
- Typ: JSON object `{ defaultPresetId, presets:[{id,name,ports}] }`.
- Fallback: wbudowana lista presetow (Cameras, Printers, Folders/HTTP, Routers, NAS/Servers, Windows/SMB, All ports).
- Uwaga: to jest jednoczesnie "zywy" stan roboczy podczas normalnej pracy z aplikacja I zawartosc zapisywana/wczytywana przez sesje — Load Session nadpisuje ten klucz danymi z pliku.

`netrecon_scan_defaults_v1`
- Domyslne `timeoutMs`/`concurrency` dla skanu.
- Typ: JSON object.

### 4) Uklad i biezaca sesja

`netrecon_active_tool`
- Ostatnie aktywowane narzedzie (poza scan-runner).
- Typ: string.
- Uwaga: w aktualnym kodzie klucz jest zapisywany, ale nie jest odczytywany przy zwyklym starcie — odczytywany tylko posrednio przez `session-runtime.js` przy Close Session.

`netrecon_session_pending_layout_v1`
- Jednorazowy znacznik ukladu zakladek (center/left/right) do przywrocenia zaraz po `window.location.reload()` wywolanym przez Load Session.
- Typ: JSON object, kasowany natychmiast po odczycie.

`netrecon_session_current_path`
- Sciezka pliku `.sqlite3`, do ktorego nalezy biezaca, "zywa" sesja — to ten klucz steruje etykieta na pasku menu i tym, czy plain "Save" nadpisuje cicho czy pyta o plik.
- Typ: string (sciezka) albo brak klucza (sesja bez przypisanego pliku).
- To jest dokladnie ten klucz, ktory ma wracac do braku wartosci przy kazdym nowym otwarciu/zamknieciu projektu (planowana zmiana, patrz rozmowa).

---

## Podsumowanie praktyczne

Program zapamietuje dane w dwoch niezaleznych warstwach:

- **Ustawienia** (grupa A) — dotycza calej instalacji, nie sesji: jezyk, skin, stan Clippy, historia zakresow, rozszerzenia, uklad undocked okien, lista "Recent sessions".
- **Dane sesji** (grupa B) — dotycza konkretnego projektu/pliku: wyniki skanu, biblioteka IP, presety, domyslne wartosci skanu, uklad zakladek, sciezka biezacego pliku sesji.

Blad znaleziony przy tej analizie: `closeSession()` w `session-runtime.js` dzisiaj czysci tylko `netrecon_scan_results_v1`, `netrecon_scan_progress_v1`, `netrecon_active_tool`, `netrecon_session_pending_layout_v1`, `netrecon_session_current_path` — **nie czysci** `netrecon_country_ip_library_json`, `netrecon_country_ip_library_updated_at`, `netrecon_scan_presets_v1`, `netrecon_scan_defaults_v1`, mimo ze wszystkie te klucze naleza do grupy B. Do naprawy w ramach planowanej zmiany "nowa sesja przy otwarciu/zamknieciu projektu".
