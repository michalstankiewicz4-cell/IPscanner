# Troubleshooting

Nietypowe problemy napotkane w tym repo i ich przyczyny — zeby nie
odkrywac ich po raz drugi. Ogolne konwencje kodu sa w
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Build: `failed to remove file ...OSINTNETAuditor.exe` / "Odmowa dostepu"

`npx tauri build` (lub `cargo build`) probuje nadpisac plik `.exe` w
`src-tauri/target/release/`, ktory jest zablokowany przez system plikow.
Najczestsze przyczyny:

- aplikacja z poprzedniego builda nadal dziala (sprawdz
  `tasklist //FI "IMAGENAME eq OSINTNETAuditor.exe"` lub
  `Get-Process | Where-Object { $_.ProcessName -like "*OSINTNET*" }`),
- Windows Defender / antywirus akurat skanuje swiezo napisany `.exe` (typowy
  false-positive lock, mija po kilku sekundach),
- otwarty Eksplorator plikow / okno wlasciwosci na tym pliku.

Jesli zaden proces nie trzyma pliku (patrz wyzej), zwykle wystarczy po
prostu powtorzyc `npx tauri build --no-bundle` — to byl transient lock, nie
realny konflikt.

## Drag-and-drop (HTML5) nie dziala w aplikacji, ale dziala na www

Domyslnie Tauri v2 przechwytuje `dragstart`/`dragover`/`drop` na poziomie
webview (natywna obsluga file-drop), co konsumuje te zdarzenia zanim
dotrze do nich JS. Efekt: `draggable="true"` + `dataTransfer` dziala
bez bledow w przegladarce (F12 czysty), ale nic sie nie dzieje w
aplikacji desktopowej.

Naprawa: `"app": { "windows": [{ ..., "dragDropEnabled": false }] }` w
`src-tauri/tauri.conf.json` — wylacza natywne przechwytywanie i oddaje
zdarzenia do zwyklego HTML5 Drag and Drop API. Zobacz ShellCraft
(`shellcraft-canvas-runtime.js`) jako dzialajacy przyklad.

## Po edycji JS/CSS aplikacja nadal pokazuje stary kod

Kazdy `<script>`/`<link>` w `index.html` ma cache-busting `?v=DATA` na
koncu URL-a. Sama edycja pliku `.js`/`.css` nie wystarczy — jesli nie
podbijesz `?v=`, WebView2 (i przegladarka na www) moze serwowac
zcache'owana, stara wersje pliku. Podbijaj `?v=` dla **kazdego** dotknietego
pliku w tej samej turze zmian, inaczej dostaniesz niespojny stan (czesc
plikow nowa, czesc stara).

## "Czarne miejsce" / martwy gutter tam, gdzie nie ma paska przewijania

`custom-scrollbar-runtime.js` (`attachItem()`) bezwarunkowo dodaje klase
`.v1-custom-scroll-host` (a z nia `padding-inline-end:
var(--v1-scroll-safe-gutter)`) do **kazdego** elementu wpisanego do tablicy
`SHELL_SCROLL_TARGETS` — niezaleznie od tego, czy ten element realnie ma
overflow. Krotka lista, ktora nigdy sie nie przewija, i tak dostaje
zarezerwowany gutter, co wyglada jak martwe czarne miejsce z boku.

Naprawa: jesli lista/panel nie potrzebuje customowego paska (bo i tak
rzadko/nigdy nie przekracza wysokosci), po prostu **nie rejestruj go** w
`SHELL_SCROLL_TARGETS` i zostaw zwykle natywne `overflow-y: auto`.

## Zakladka odczepiona (detached/floating) nie reaguje na klikniecia

`panels-runtime.js`'s `createDetachedCard()` (`stripIds()`) usuwa **wszystkie**
atrybuty `id="..."` z HTML-a narzedzia przed zamontowaniem go w osobnym,
odczepionym oknie — zeby uniknac duplikatow id z zadokowanym oryginalem.
Kazdy kod JS, ktory szuka swojego mount-pointu przez `document.getElementById`
albo `#jakis-id`, przestaje dzialac po odczepieniu, bez zadnego bledu w
konsoli.

Naprawa: dla elementow, ktore moga byc renderowane w trybie detached, szukaj
po klasie (`.v1-jakas-klasa`), nie po `id`. `stripIds()` zostawia klasy bez
zmian.

## Listener leak przy powtarzanym otwieraniu tej samej zakladki

Typowy idiom w tym kodzie to strażnik `element.dataset.xBound === "1"`
sprawdzany przed podpieciem listenerow, zeby nie podpinac ich drugi raz przy
ponownym renderze. Dziala to tylko wtedy, gdy sprawdzany `element` jest
**stabilny** (nigdy nie tworzony od nowa). Jesli element jest za kazdym
razem rekreowany (np. przez `v1Detail.innerHTML = buildDetailHtml(...)`, jak
canvas ShellCraft), strażnik nigdy realnie nie trafia, a listenery
zarejestrowane na `document` (poza samym elementem) po prostu sie kumuluja
przy kazdym przelaczeniu zakladki.

Naprawa: albo (a) jawny teardown przed kazdym ponownym podpieciem
(modulowa zmienna trzymajaca `removeEventListener` z nazwanymi handlerami),
albo (b) jesli mount faktycznie jest stabilny, przenies strażnik tak, zeby
obejmowal rowniez listenery na `document`, nie tylko te lokalne dla
elementu. Zobacz `wireShellCraftCanvas`/`wireShellCraftInspector` w
`panel-interactions-runtime.js` jako przyklady obu wariantow.
