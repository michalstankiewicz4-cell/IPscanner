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

## Uwagi

- Prywatny klucz podpisujacy (`%USERPROFILE%\.tauri\ipscanner-updater.key`)
  NIE jest w repo i nie ma hasla - pilnuj go, bez niego nie da sie podpisac
  kolejnych wydan zgodnych z kluczem publicznym juz zaszytym w
  `tauri.conf.json` (`plugins.updater.pubkey`).
- Endpoint `tauri.conf.json`'s `plugins.updater.endpoints` wskazuje na staly
  adres `.../releases/latest/download/latest.json` - dziala automatycznie
  dla kazdego kolejnego wydania, nic tam nie trzeba zmieniac miedzy
  wersjami.
