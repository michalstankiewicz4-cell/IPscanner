# chrome-extension/

Rozszerzenie do Chrome (Manifest V3), towarzyszące OSINT NET Auditor.
Na razie w wersji 0.1 - **tylko wykrywanie**, bez komunikacji z apką
desktopową (to kolejny krok).

## Co robi teraz

- Podświetla na każdej stronie adresy IPv4, domeny (z listy popularnych
  TLD-ów, żeby nie łapać przypadkowych skrótów typu "np.") i adresy email.
- Wykrywa "ukryte"/zwodnicze linki: `<a>`, którego widoczny tekst wygląda
  jak konkretny adres (np. "paypal.com" albo "192.168.1.1"), ale `href`
  prowadzi na inny host - podświetla je na czerwono, falistym podkreśleniem,
  z tooltipem pokazującym rzeczywisty cel. Subdomeny tego samego hosta
  (`shop.example.com` z tekstem "example.com") nie są traktowane jako
  podejrzane.
- Klik ikony rozszerzenia otwiera popup z regulacją podświetlenia: osobny
  przełącznik dla każdego typu (IP / domeny / emaile / ukryte linki),
  globalny włącznik/wyłącznik i suwak intensywności. Zmiana działa od razu
  na wszystkich otwartych kartach (przez `chrome.storage.onChanged`), bez
  przeładowania strony - to czysto wizualne przełączenie, sam tekst nigdy
  nie znika, znika tylko podświetlenie.
- Dodaje do menu kontekstowego pozycje "Skanuj w OSINT NET Auditor" i "Dodaj
  do bazy OSINT NET Auditor" - pokazują się **tylko** przy prawym kliknięciu
  dokładnie na naszym podświetleniu (nie przy dowolnym zaznaczeniu czy
  dowolnym linku). Jeśli dany typ jest akurat wyłączony w popupie, menu też
  się nie pojawia dla niego. Kliknięcie kopiuje wykrytą wartość do schowka i
  pokazuje toast z potwierdzeniem - patrz niżej, to stan tymczasowy.
  Techniczna uwaga: widoczność jest przełączana dynamicznie
  (`chrome.contextMenus.update`) na podstawie zdarzenia `contextmenu` z
  content scriptu, więc przy pierwszym kliknięciu po dłuższej bezczynności
  (service worker musi się dopiero obudzić) menu może się raz nie pokazać -
  kolejne kliknięcia już działają normalnie.

## Czego jeszcze nie robi

- Nie wysyła nic bezpośrednio do apki desktopowej - klik w menu tylko
  kopiuje wartość do schowka (trzeba ręcznie wkleić w apce). To świadomy
  krok przejściowy: docelowy mechanizm (własny protokół URL zarejestrowany
  przez Tauri, np. `osintnetauditor://scan?target=...`, albo lokalny
  endpoint, który apka nasłuchuje gdy jest uruchomiona) wymaga zmian po
  stronie Tauri i nowego wydania instalatora, więc czeka na decyzję, zanim
  go zbudujemy.

## Jak uruchomić lokalnie (tryb deweloperski)

1. Otwórz `chrome://extensions` w Chrome.
2. Włącz "Tryb dewelopera" (przełącznik w prawym górnym rogu).
3. "Wczytaj rozpakowane" -> wskaż ten folder (`chrome-extension/`).
4. Odśwież dowolną stronę - podświetlenia powinny się pojawić od razu.

Po każdej zmianie w plikach: wróć na `chrome://extensions` i kliknij ikonę
odświeżania przy rozszerzeniu (dla `content.js`/`highlight.css` wystarczy
też samo odświeżenie strony testowej, jeśli manifest się nie zmienił).

## Pliki

| Plik | Rola |
| --- | --- |
| `manifest.json` | Deklaracja MV3 - permissions, content script, service worker, popup. |
| `settings.js` | Wspólne dla `content.js` i `popup.js` - domyślne ustawienia + odczyt/zapis `chrome.storage.local`. |
| `content.js` | Skanuje DOM (TreeWalker + MutationObserver dla SPA), podświetla trafienia i ukryte linki, stosuje ustawienia z popupu, na `contextmenu` zgłasza cel do background (`CONTEXT_TARGET`), obsługuje `SHOW_TOAST`/`COPY_TO_CLIPBOARD`. |
| `background.js` | Service worker - rejestruje menu kontekstowe (domyślnie ukryte), przełącza widoczność wg `CONTEXT_TARGET`, wykrywa typ wartości, wysyła `COPY_TO_CLIPBOARD` do karty. |
| `popup.html` / `popup.js` / `popup.css` | Popup pod ikoną rozszerzenia - przełączniki typów + suwak intensywności. |
| `highlight.css` | Style podświetleń, ukrytych linków, toasta i klas `osint-hide-*`/`osint-disabled`. |
| `icons/` | Skopiowane z `src-tauri/icons/` (spójność z ikoną apki desktopowej). |
