# Wydawanie nowej wersji (Release)

Cały proces jest reczny (brak CI/GitHub Actions) - ta lista to checklist,
zeby nie pominac kroku. Ogolne konwencje kodu sa w
[CONTRIBUTING.md](../CONTRIBUTING.md).

Kazde wydanie ma **3 assety** w GitHub Release: portable zip (bez zmian od
lat), NSIS installer (`.exe`), `latest.json` (manifest auto-update). Tylko
uzytkownicy installer-a dostaja realne auto-update - portable zip dziala
dokladnie jak dotychczas (przycisk "Pobierz" w dialogu otwiera strone
Releases, nic nie instaluje samo).

## 1. Bump wersji

`package.json` -> pole `version`, potem:

```
npm run sync-version
```

Propaguje wersje do `Cargo.toml`, `tauri.conf.json`, NSIS template,
`app-version.js`, `index.html`. Dopisz tez wpis do
`js/new-ui/core/versions-data.js` (Help -> Versions) i do `docs/CHANGELOG.md`.

## 2. Build + podpisanie (jeden krok)

Ustaw zmienne srodowiskowe PRZED buildem - `tauri build` podpisuje NSIS
installer automatycznie, jesli je widzi:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\ipscanner-updater.key" -Raw
# klucz jest bez hasla (wygenerowany z --ci) - nie ustawiaj PASSWORD
npm run tauri:build
```

Efekt w `src-tauri/target/release/bundle/`:
- `OSINTNETAuditor.exe` (portable, jak zawsze),
- `nsis/OSINTNETAuditor_<wersja>_x64-setup.exe` + `.sig` obok niego (podpis).

Jesli `.sig` sie nie pojawil - zmienna srodowiskowa nie byla ustawiona w tej
samej sesji shell-a co `npm run tauri:build`.

## 3. Portable zip (bez zmian)

Jak dotychczas: `OSINTNETAuditor.exe` + `scripts/*.ps1` (ze zrodel repo, NIE
z `_up_/scripts` w katalogu builda) w plaskiej strukturze, spakowane
`Compress-Archive`.

**Zmien nazwe NSIS installer-a PRZED uploadem** - `tauri build` generuje go
ze spacjami (`OSINT NET Auditor_X.Y.Z_x64-setup.exe`), a GitHub przy
uploadzie cicho zamienia spacje na kropki (`OSINT.NET.Auditor_...`). Jesli
wgrasz plik ze spacjami bezposrednio, jego prawdziwa nazwa na GitHubie NIE
bedzie pasowac do `url` w `latest.json` (krok 4 nizej) - auto-update
sciagnie 404 i cicho sie wywali (tylko status-line, latwo przeoczyc, "klikam
Zainstaluj i nic sie nie dzieje"). Skopiuj/zmien nazwe na bezspacyjna (np.
`OSINTNETAuditor_X.Y.Z_x64-setup.exe`) ZANIM go wgrasz, i uzyj DOKLADNIE tej
samej nazwy w `latest.json`'s `url`.

**Zrodlo spacji to `productName` w `tauri.conf.json` (`"OSINT NET
Auditor"`)** - to jedno pole rozlewa sie na nazwe instalatora, MSI, i
folder instalacji `%LOCALAPPDATA%\OSINT NET Auditor\`. Rozwazane i
SWIADOMIE odrzucone: zmiana `productName` na cos bezspacyjnego (np.
`OSINTNETAuditor`) zeby ten caly problem znikl u zrodla. Nie robic tego bez
dobrego powodu - zmiana `productName` zmienia tez folder instalacji, co
osieroca juz zainstalowane (przez NSIS) kopie u userow (nowy wpis w
"Dodaj/Usun programy" zamiast czystego upgrade'u w miejscu) i wymaga
przy okazji poprawienia sciezki zaszytej w `is_installer_install()`
(`main.rs`). Recznie zmienianie nazwy pliku przed uploadem (wyzej) zostaje
jako swiadomy kompromis - udokumentowany, jednolinijkowy krok checklisty,
nie ukryty bug.

## 4. latest.json

```json
{
  "version": "2.7.1",
  "notes": "Krotki opis zmian.",
  "pub_date": "2026-08-10T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<zawartosc pliku .sig, base64, jedna linia>",
      "url": "https://github.com/michalstankiewicz4-cell/IPscanner/releases/download/v2.7.1/OSINTNETAuditor_2.7.1_x64-setup.exe"
    }
  }
}
```

Wazne: `url` musi wskazywac na KONKRETNY tag wydania (`.../releases/download/vX.Y.Z/...`),
nie na `/latest/` - `/latest/` to adres, pod ktorym `tauri.conf.json` znajduje
sam `latest.json`, nie moze prowadzic sam do siebie w kolko.

## 5. Publikacja

```
gh release create vX.Y.Z <portable.zip> <nsis-setup.exe> latest.json \
  --title "vX.Y.Z" --notes-file <plik z notatkami> --target main
```

## 6. Weryfikacja (nie pomijac)

- Zainstaluj poprzednia wersje przez NSIS installer (nie portable), odczekaj
  az "Sprawdz aktualizacje przy starcie" w Opcjach -> General zadziala (albo
  wywolaj recznie) - potwierdz ze wykrywa nowa wersje, pobiera, instaluje i
  restartuje aplikacje do nowej wersji.
- Ten sam portable zip, uruchomiony z dowolnego folderu - potwierdz ze
  "Sprawdz aktualizacje" nadal tylko proponuje otwarcie strony Releases
  (nie probuje natywnej instalacji - `is_installer_install` w `main.rs` ma
  to wykryc po sciezce `%LOCALAPPDATA%\OSINT NET Auditor\`).

## 7. Inne kanaly dystrybucji (irm, winget, scoop)

Trzy sposoby instalacji obok siebie - kazdy ma inny cykl aktualizacji, zeby
nie pomylic "nic nie trzeba robic" z "trzeba zrobic nowy PR":

### irm (jednolinijkowiec PowerShell) - NIC nie trzeba robic

`install.ps1` (repo root) czyta `latest.json` w locie przy kazdym
uruchomieniu - dokladnie ten sam plik co auto-update w apce (krok 4 wyzej).
Nowe wydanie = automatycznie nowa wersja dla `irm ... | iex`, zero
dodatkowej pracy. Nie trzeba tego nigdzie aktualizowac.

### winget - NOWY manifest + PR przy KAZDYM wydaniu

Pakiet: `michalstankiewicz.OSINTNETAuditor` (pierwsze wydanie: PR
[#416981](https://github.com/microsoft/winget-pkgs/pull/416981), v2.8.3).
Manifesty referencyjne trzymane w `winget/manifests/m/michalstankiewicz/
OSINTNETAuditor/<wersja>/` w tym repo (kopia tego co poszlo do
`winget-pkgs`, nie zrodlo prawdy - `winget-pkgs` jest zrodlem prawdy).

Wymaga `wingetcreate` (`winget install Microsoft.WingetCreate`, raz).
Przy kazdym nowym wydaniu (PO opublikowaniu release'u z krokow 1-6 wyzej,
zeby URL/hash byly aktualne):

```powershell
wingetcreate update michalstankiewicz.OSINTNETAuditor `
  --version X.Y.Z `
  --urls "https://github.com/michalstankiewicz4-cell/IPscanner/releases/download/vX.Y.Z/OSINTNETAuditor_X.Y.Z_x64-setup.exe" `
  --submit
```

To samo narzedzie co przy pierwszym wydaniu, ale komenda `update` (nie
`new`) - samo sciaga poprzedni manifest z `winget-pkgs`, podmienia
wersje/URL, liczy nowy SHA256, i sklada PR. Otworzy przegladarke do
logowania GitHub (Device Flow - kod do wpisania na
`github.com/login/device`, tak jak przy pierwszym wydaniu). Po zlozeniu
PR-a: sprawdz go, dodaj komentarz `@microsoft-github-policy-service agree`
jesli bot o to poprosi (CLA - zwykle wystarczy raz na konto, ale sprawdz),
poczekaj na automatyczna walidacje (`gh pr view <numer> --repo
microsoft/winget-pkgs --json statusCheckRollup`).

Skopiuj tez wygenerowane pliki do `winget/manifests/.../<nowa-wersja>/` w
tym repo dla historii (opcjonalne, ale wygodne).

### scoop - wlasny bucket dziala, Extras zalezne od zgody maintainera

Wlasny bucket: `michalstankiewicz4-cell/scoop-bucket` (osobne repo),
manifest w `bucket/osintnetauditor.json` tam ORAZ kopia w tym repo w
`scoop/bucket/osintnetauditor.json` (kopia dla historii, nie zrodlo
prawdy - `scoop-bucket` jest zrodlem prawdy, tak samo jak przy winget).
Wskazuje na PORTABLE ZIP z kroku 3 wyzej (nie na installer - Scoop wprost
tego preferuje), przetestowane end-to-end (`scoop install`/`uninstall`
lokalnie i przez prawdziwy URL buckета).

Manifest ma skonfigurowane `checkver`/`autoupdate` (`"github":
"https://github.com/michalstankiewicz4-cell/IPscanner"` - Scoop sam
odpyta najnowszy tag Release). To NIE dziala samo z siebie - ktos/cos
musi odpalic `checkver -u` zeby faktycznie przepisac `version`/`url`/
`hash` w manifescie. Recznie, przy kazdym nowym wydaniu:

```powershell
cd sciezka\do\sklonowanego\scoop-bucket
scoop update  # zeby miec swiezy silnik checkver
.\bin\checkver.ps1 osintnetauditor -u  # wymaga oficjalnych skryptow Scoopa w repo, patrz nizej
git commit -am "osintnetauditor: update to <wersja>"
git push
```

(`bin/checkver.ps1`/`bin/auto-pr.ps1` nie sa jeszcze skopiowane do naszego
`scoop-bucket` - trzeba je wziac z `ScoopInstaller/Excavator` albo
`ScoopInstaller/BucketTemplate` zanim powyzsze zadziala. Alternatywa,
mniej pracy na przyszlosc: dodac scheduled GitHub Action w `scoop-bucket`
uzywajacy oficjalnego `ScoopInstaller/GithubActions` workflow - wtedy
odpala sie samo, nic nie trzeba pamietac. Nie zrobione jeszcze, tylko
zaplanowane).

Extras (`ScoopInstaller/Extras`, bardziej odkrywalne): WYMAGA otwarcia
issue z propozycja pakietu i zgody maintainera PRZED PR-em (inaczej niz
winget - "We are very reluctant to accept random pull requests without a
related issue created first"). Status: issue otwarte -
[ScoopInstaller/Extras#18520](https://github.com/ScoopInstaller/Extras/issues/18520),
czeka na ocene maintainera. Jesli/kiedy zaakceptowane, PR z manifestem
(ten sam format co wlasny bucket) + komentarz `/verify` po zlozeniu zeby
odpalic automatyczny walidator.

## Uwagi

- Prywatny klucz podpisujacy (`%USERPROFILE%\.tauri\ipscanner-updater.key`)
  NIE jest w repo i nie ma hasla - pilnuj go, bez niego nie da sie podpisac
  kolejnych wydan zgodnych z kluczem publicznym juz zaszytym w
  `tauri.conf.json` (`plugins.updater.pubkey`).
- Endpoint `tauri.conf.json`'s `plugins.updater.endpoints` wskazuje na staly
  adres `.../releases/latest/download/latest.json` - dziala automatycznie
  dla kazdego kolejnego wydania, nic tam nie trzeba zmieniac miedzy
  wersjami.
