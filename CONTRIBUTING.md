# NetRecon IP Auditor - CONTRIBUTING

## 1. Aktualny kierunek projektu

Repo zawiera stabilny rdzen skanera oraz kilka wariantow UI. Aktualny kierunek rozwoju to:

- utrzymanie kompatybilnosci istniejacej logiki skanera,
- modularyzacja newUI (core + adaptery UI),
- przygotowanie systemu rozszerzen (manifest contributions),
- porzadkowanie stylow i i18n bez regresji funkcjonalnych.

W praktyce: zmiany w warstwie UI powinny byc izolowane od logiki skanowania.

## 2. Zasady zmian

- Nie mieszaj refaktoru UI z duzymi zmianami backendu skanera w jednym PR.
- Nie edytuj katalogu app recznie - to mirror generowany skryptem.
- W new UI preferuj male moduly w js/new-ui/core zamiast rozbudowy inline script.
- Zanim dodasz nowy tekst UI, dodaj klucze do i18n.
- Zachowuj backward compatibility danych i stanu (localStorage keys, nazwy akcji itp.).

## 3. Architektura New UI (stan docelowy)

Minimalny podzial odpowiedzialnosci:

- store.js - stan UI i subskrypcje,
- i18n.js - slowniki i wybor jezyka,
- theme.js - wybor skinu i podmiana arkusza skinu,
- tool-catalog.js - katalog metadanych narzedzi,
- extensions.js - host rozszerzen i contributions.
- ui-definitions.js - mapa odpowiedzialnosci menu i paneli.
- menu-runtime.js - obsluga menubar i akcji menu.
- panels-runtime.js - routing aktywnego narzedzia i odswiezanie panelu glownego.
- extension-manager-runtime.js - obsluga panelu rozszerzen i jezykow.

newUI.html powinien byc glownie adapterem DOM i eventow.

Mapa odpowiedzialnosci jest utrzymywana centralnie i nie powinna byc dublowana w wielu miejscach.

- definicje menu i akcji: `js/new-ui/core/ui-definitions.js`,
- definicje paneli: `js/new-ui/core/ui-definitions.js`,
- wykonanie zachowan akcji: `newUI.html` (adapter runtime).

## 4. Rozszerzenia (plugin-like)

System rozszerzen jest oparty o manifest JSON. Dopuszczone contributions:

- contributions.tools - dodanie lub nadpisanie wpisow katalogu narzedzi,
- contributions.menuActions - dodanie lub nadpisanie etykiet akcji menu.

Przykladowy manifest:

```json
{
  "id": "com.example.demo",
  "name": "Demo Extension",
  "version": "0.1.0",
  "contributions": {
    "tools": {
      "demo-tool": {
        "title": "Demo Tool",
        "text": "Opis narzedzia z rozszerzenia.",
        "points": ["A", "B", "C"]
      }
    },
    "menuActions": {
      "demo-action": "Demo action"
    }
  }
}
```

## 5. Dodawanie nowego jezyka

Mozliwe sa dwie sciezki:

- przez UI: Options -> Customization -> Language Manager,
- przez rozszerzenie: `contributions.i18n` w manifescie.

Minimalny format slownika to obiekt JSON `key -> text`, np.:

```json
{
  "menuFile": "Datei",
  "menuOptions": "Optionen",
  "menuTools": "Werkzeuge",
  "menuHelp": "Hilfe"
}
```

Przykladowy fragment manifestu rozszerzenia z jezykiem:

```json
{
  "contributions": {
    "i18n": {
      "de": {
        "menuFile": "Datei",
        "menuOptions": "Optionen"
      }
    }
  }
}
```

Zasady:

- kod jezyka: lowercase (np. `de`, `es`, `pt-br`),
- nie usuwaj kluczy bazowych - brakujace wpisy fallbackuja do EN,
- po dodaniu jezyka sprawdz menu, status line i panel rozszerzen.

## 6. Build i release

- Domyslnie do testow uzywamy builda bez bundli:
  - npm run prepare:app && npx tauri build --no-bundle
- Pelne bundlowanie (NSIS/MSI) tylko gdy jest to jawnie wymagane do releasu.
- Nie uruchamiaj publikacji ani releasu bez wyraznej zgody maintainera.

## 7. Workflow PR

- Tworz male, tematyczne PR-y.
- W opisie PR podaj: zakres, ryzyko regresji, test manualny.
- Jesli zmieniasz UI, zalacz kroki reprodukcji i oczekiwany efekt.

## 8. Czego nie robimy w PR do new UI

- Nie przepinamy calej aplikacji na new UI w jednym kroku.
- Nie usuwamy legacy UI bez uzgodnionego planu migracji.
- Nie dokladamy nowego dlugu technicznego przez kolejne duze skrypty inline.
