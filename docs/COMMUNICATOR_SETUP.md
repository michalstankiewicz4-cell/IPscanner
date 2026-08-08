# Komunikator (Communicator) — konfiguracja Firebase

Instrukcja dla kogoś, kto chce **założyć własną grupę** w Komunikatorze
(zakładka Tools -> Communicator). Appka nie ma żadnego wspólnego,
wbudowanego backendu — każdy założyciel przynosi własny projekt Firebase,
konfiguruje go raz, i dopiero wtedy zaprasza znajomych. Zobacz też
[CHANGELOG.md](CHANGELOG.md) dla historii tej funkcji.

## Kto musi to zrobić?

Tylko **jedna osoba na grupę** — założyciel (pierwszy, kto się zaloguje w
świeżo skonfigurowanym projekcie, staje się `founderUid` pokoju). Zaproszeni
znajomi **nie** przechodzą przez ten proces — patrz sekcja
["Dołączanie jako zaproszony"](#dołączanie-jako-zaproszony-krótka-wersja)
na końcu.

## Krok 1 — projekt Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) ->
   "Add project" -> dowolna nazwa -> pomiń Google Analytics (niepotrzebne).
2. Na stronie projektu kliknij ikonę "</>" (Web) -> zarejestruj aplikację
   Web (dowolna nazwa) -> pomiń ofertę Firebase Hosting jeśli się pojawi.
3. Skopiuj pokazany obiekt `firebaseConfig` — będzie potrzebny w kroku 5.

## Krok 2 — Firestore Database

Build -> Firestore Database -> **"Create database"** -> dowolny region ->
**zostaw domyślną (default) bazę** — nie twórz nazwanej/dodatkowej bazy,
to płatna opcja i całkowicie niepotrzebna. Bez tego kroku appka dostanie
`Missing or insufficient permissions` przy każdej próbie zapisu, nawet z
poprawnymi regułami — sama baza po prostu jeszcze nie istnieje.

## Krok 3 — Google Sign-In + OAuth client (Desktop app)

Appka desktopowa **nie może** logować się przez zwykłe okienko w webview —
Google blokuje to od 2023 (`disallowed_useragent`). Zamiast tego appka
otwiera ekran logowania w Twojej zwykłej przeglądarce i łapie odpowiedź
przez chwilowy lokalny nasłuch na porcie `53682`.

1. Authentication -> Sign-in method -> włącz dostawcę **Google**.
2. Przejdź do **console.cloud.google.com/apis/credentials** (ten sam
   projekt, powinien być już wybrany w selektorze u góry).
3. **"+ CREATE CREDENTIALS" -> "OAuth client ID"** -> Application type:
   **"Desktop app"** (NIE używaj klienta "Web client (auto created by
   Google Service)", który Firebase tworzy automatycznie — ten wymaga
   `client_secret` i ścisłego dopasowania portu przekierowania, i jest
   dużo bardziej kłopotliwy).
4. Nadaj dowolną nazwę, kliknij "Create".
5. Zapisz sobie **Client ID** (kończy się na `.apps.googleusercontent.com`)
   **i Client secret** (zaczyna się od `GOCSPX-`) — mimo że to "Desktop
   app" typ, Google i tak wymaga `client_secret` przy wymianie kodu na
   token (odstępstwo od czystej specyfikacji PKCE, ale tak działa ich
   implementacja — potwierdzone empirycznie).
6. W tym samym oknie edycji klienta, sekcja **"Authorized redirect URIs"**
   -> dodaj dokładnie: `http://localhost:53682/` (ze slashem na końcu).

## Krok 4 — reguły bezpieczeństwa Firestore

Firestore Database -> zakładka **Rules** -> zamień całą zawartość na:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isMember(roomId) {
      return request.auth != null &&
        exists(/databases/$(database)/documents/rooms/$(roomId)/members/$(request.auth.uid));
    }

    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.founderUid == request.auth.uid;
      allow update, delete: if false;
    }

    match /rooms/{roomId}/messages/{messageId} {
      allow read: if isMember(roomId);
      allow create: if isMember(roomId) && request.resource.data.senderUid == request.auth.uid;
      allow update, delete: if false;
    }

    match /rooms/{roomId}/members/{uid} {
      allow read: if isMember(roomId);
      allow create: if request.auth != null && request.auth.uid == uid && (
        get(/databases/$(database)/documents/rooms/$(roomId)).data.founderUid == request.auth.uid ||
        ( request.resource.data.viaInviteCode is string &&
          get(/databases/$(database)/documents/invites/$(request.resource.data.viaInviteCode)).data.roomId == roomId &&
          get(/databases/$(database)/documents/invites/$(request.resource.data.viaInviteCode)).data.usedCount <
            get(/databases/$(database)/documents/invites/$(request.resource.data.viaInviteCode)).data.maxUses )
      );
    }

    match /invites/{code} {
      allow read: if request.auth != null;
      allow create: if isMember(request.resource.data.roomId);
      allow update: if request.auth != null
        && request.resource.data.usedCount == resource.data.usedCount + 1
        && resource.data.usedCount < resource.data.maxUses;
    }
  }
}
```

Kliknij **Publish**. Bez tego kroku wszystkie odczyty/zapisy są domyślnie
zablokowane.

To najlepszy-wysiłek zestaw reguł dla małej grupy zaufanych znajomych —
bez Cloud Functions robiących atomową walidację. Dostęp do wiadomości i
listy członków jest realnie zamknięty regułami (nie tylko UI appki) — obcy,
który nie ma kodu zaproszenia, nic nie zobaczy ani nie napisze, nawet
mając Twój `firebaseConfig`.

## Krok 5 — wklej dane do appki

W appce: **Options -> General -> "Firebase (Communicator)"** — uzupełnij 4
pola:

| Pole | Skąd |
|---|---|
| API key | `firebaseConfig.apiKey` z kroku 1 |
| Auth domain | `firebaseConfig.authDomain` z kroku 1 |
| Project ID | `firebaseConfig.projectId` z kroku 1 |
| OAuth client ID (Desktop app type) | Client ID z kroku 3 |

(Client secret wpisuje się w osobnym polu pojawiającym się przy logowaniu
— patrz kod appki, `komunikator-runtime.js`, jeśli pole nie jest widoczne
w Twojej wersji.)

## Krok 6 — zaloguj się i zaproś znajomych

1. Tools -> Communicator -> "Sign in with Google" — otworzy się przeglądarka,
   zaloguj się.
2. Po powrocie do appki jesteś automatycznie założycielem pokoju (widzisz
   od razu pusty czat).
3. Panel RS (Members) -> **"Generate invite code"** — jednorazowy kod,
   wyślij go znajomemu dowolnym kanałem (Discord, SMS, mail).
4. Wygeneruj osobny kod dla każdej zapraszanej osoby (każdy kod działa
   raz).

## Dołączanie jako zaproszony (krótka wersja)

Zaproszony **nie** zakłada własnego Firebase. Potrzebuje tylko:

1. Tej samej appki.
2. Tych 4 wartości z kroku 5 powyżej — założyciel po prostu mu je przesyła
   (to nie są sekrety w sensie bezpieczeństwa — Google/Firebase projektuje
   `apiKey`/OAuth Client ID jako bezpieczne do współdzielenia po stronie
   klienta; prawdziwa ochrona żyje w regułach Firestore, nie w ukrywaniu
   tych wartości).
3. Wkleja je w Options -> General, loguje się swoim kontem Google.
4. Panel RS (Members) -> wpisuje kod zaproszenia od założyciela ->
   "Join room".

## Znane ograniczenia

- Tylko **jeden wspólny pokój** (`rooms/main`) — brak zarządzania wieloma
  pokojami w tej wersji.
- Reguły nie sprawdzają `expiresAt` zaproszenia (pole istnieje, ale nie
  jest egzekwowane) — kod działa dopóki `usedCount < maxUses` (domyślnie
  1 użycie).
- Działa tylko w aplikacji desktopowej — logowanie Google przez lokalny
  nasłuch wymaga backendu Rust (`start_oauth_listener` w `main.rs`),
  którego nie ma na www/ipscanner.pl.
