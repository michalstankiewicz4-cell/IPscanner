# Style List

Katalog wszystkich elementów wizualnych aplikacji — punkt wyjścia do
zaprojektowania nowego UI. Podgląd na żywo: zakładka **Style** w CS (Options -> General -> Appearance
-> przycisk [Style]).

Odhaczamy tu, co już ma działający podgląd / ustalone źródło prawdy /
docelowy nowy styl. Format: `[ ]` do zrobienia, `[x]` zrobione.

## Inputy (natywne typy `<input>` + pokrewne)

1. [x] text - Standardowe jednolinijkowe pole tekstowe.
2. [x] password - Pole tekstowe maskujące wpisane znaki kropkami.
3. [x] email - Pole sprawdzające poprawność formatu adresu e-mail.
4. [x] number - Pole akceptujące tylko cyfry z suwakiem góra/dół.
5. [x] checkbox - Kwadratowe pole wielokrotnego wyboru (zaznacz/odznacz).
6. [x] radio - Okrągły przycisk jednokrotnego wyboru w ramach jednej grupy.
7. [x] file - Przycisk umożliwiający przesłanie pliku z dysku komputera.
8. [x] date - Kalendarz do wyboru konkretnego dnia, miesiąca i roku.
9. [x] datetime-local - Pole do wyboru daty oraz godziny bez strefy czasowej.
10. [x] time - Pole do wyboru konkretnej godziny (godziny i minuty).
11. [x] month - Pole ograniczone do wyboru wyłącznie miesiąca i roku.
12. [x] week - Pole ograniczone do wyboru numeru tygodnia oraz roku.
13. [x] color - Przycisk otwierający paletę do wyboru koloru.
14. [x] range - Suwak do wyboru przybliżonej wartości numerycznej.
15. [x] search - Pole tekstowe zoptymalizowane pod kątem wpisywania fraz wyszukiwania.
16. [x] tel - Pole zoptymalizowane do wprowadzania numerów telefonów.
17. [x] url - Pole sprawdzające poprawność formatu adresu internetowego.
18. [x] hidden - Ukryte pole przechowujące dane niewidoczne dla użytkownika.
19. [x] button (`input[type=button]`) - Zwykły przycisk aktywowany najczęściej przez JavaScript.
20. [x] submit (`input[type=submit]`) - Przycisk wysyłający dane z całego formularza na serwer.
21. [x] reset (`input[type=reset]`) - Przycisk przywracający wszystkim polom wartości domyślne.
22. [x] image (`input[type=image]`) - Przycisk graficzny działający tak samo jak submit.
23. [x] textarea - Pole do wprowadzania wielu linijek tekstu (np. komentarze).
24. [x] select - Rozwijana lista wyboru zawierająca znaczniki option.
25. [x] form-button (`<button>`) - Znacznik `<button>` do klikania, mogący zawierać tekst lub grafikę.

Podgląd żywy dla wszystkich 25 gotowy w zakładce CS (`renderLoremIpsumTool()`,
`panel-content-runtime.js`) - bez stylowania natywnych widgetów (kalendarz,
kolor, suwak itp. wyglądają jak w przeglądarce), tylko ujednolicone
tło/obramowanie/typografia dla pól tekstowych.

---

## Inne style (propozycja, do dopracowania)

Na podstawie realnych klas już używanych w aplikacji (`css/new-ui/components/`,
`css/new-ui/layout/`) — nie z ogólnej wiedzy, tylko z tego co faktycznie
istnieje w kodzie:

1. [x] Pasek pionowy (custom scrollbar) - `.v1-faux-scrollbar` / `.v1-faux-scrollbar-thumb`, wlasny system zamiast natywnego paska przegladarki.
2. [x] Pasek poziomy (custom scrollbar) - `.v1-faux-scrollbar-h` / `.v1-faux-scrollbar-thumb-h`, ten sam system w wariancie poziomym.
3. [ ] Przyciski - warianty (zwykły / primary / danger) - dziś np. `.v1-exit-btn`, `.v1-exit-btn--primary`.
4. [ ] Zakładki (tab) - 4 warianty w różnych miejscach: CS (`.v1-tab`), LS (`.v1-sidebar-tool-tab`), RS (`.v1-right-tab`), DS (`.v1-console-tab`).
5. [ ] Karty / panele treści - `.v1-card`, `.tool-detail`.
6. [ ] Rozwijane menu (dropdown) - `.v1-menu-dropdown`, `.v1-menu-dd-item`, submenu-flyout.
7. [ ] Modal / dialog potwierdzenia - `.v1-exit-modal` (dziś używany m.in. przy Exit, zamykaniu sesji).
8. [ ] Odznaki / pigułki (badge/pill) - `.v1-pill`, `.v1-ai-badge`, `.v1-catalog-installed-badge`, `.v1-ip-port-badge`.
9. [ ] Chipy (np. porty/usługi) - `.v1-ip-port-chip-emoji`.
10. [ ] Pasek postępu - `.v1-status-progress-bar`.
11. [ ] Loader / spinner - `.v1-status-loader`.
12. [ ] Tabela danych - `.v1-results-table`, `.v1-presets-table`, `.v1-iplib-table`.
13. [ ] Sekcja zwijana (accordion) - `.v1-section-header` + `.v1-section-body` + strzałka zwijania.
14. [ ] Toggle / przełącznik w pasku menu - `.v1-menubar-toggle` (dziś zwykły checkbox, do rozważenia realny switch).
15. [ ] Tooltip - dziś natywny atrybut `title` przeglądarki, brak własnego stylu.
16. [ ] Powiadomienie / toast - nie istnieje dziś w aplikacji, do rozważenia.
17. [ ] Menu kontekstowe (prawy klik) - nie istnieje dziś w aplikacji, do rozważenia.

Podgląd żywy pkt 1-2 gotowy w zakładce CS (te same, prawdziwe boxy scrollujące,
zarejestrowane w `SHELL_SCROLL_TARGETS`, nie statyczna makieta).
