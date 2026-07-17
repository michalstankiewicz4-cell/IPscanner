# ShellCraft: makro "Skanowanie zakresu IP" — propozycja (Polish)

Notatka z dyskusji o tym, jak mogłoby wyglądać makro odpowiadające
skanowaniu całego zakresu IP (a nie tylko pojedynczej akcji, jak dziś
External IP / Local IP / Subnets). Wyłącznie propozycja do przemyślenia —
nic z tego nie jest zaimplementowane.

## Problem

Dzisiejsze 3 makra są proste: jedna komenda PowerShell -> jeden wynik
(string), gotowe. Skanowanie zakresu IP zwraca coś zupełnie innego:
**serię rekordów** (adresy, dla każdego adresu porty, dla każdego portu/hosta
dane zależne od zaznaczonych checkboxów w RS "Config" -> Detect). To nie
mieści się w modelu "1 komenda = 1 wynik".

## Wariant A — proste makro (jedna "czarna skrzynka")

Całe skanowanie (z konfiguracją z RS Config) jako **jeden** blok. Bez
żadnych nowych pojęć w ShellCraft — wynik to dokładnie to, co dziś ląduje
w tabeli "IP Results" po kliknięciu Start.

```
+-------------------------------+
|  Blok: "Skanuj zakres IP"     |
|  ----------------------------  |
|  Wejscie:                      |
|    - Od:      192.168.1.1      |
|    - Do:      192.168.1.254    |
|    - Config:  (z zakladki RS)  |
|                                 |
|  Wyjscie:                      |
|    -> tabela "IP Results"      |
|       (identyczna jak po       |
|        wcisnieciu Start)       |
+-------------------------------+
```

Zaleta: działa od razu, zero nowej infrastruktury.
Wada: nie da się "wejść w środek" — nie ma dostępu do pojedynczego hosta
w trakcie skanowania, tylko gotowy wynik na końcu.

## Wariant B — pełna dekompozycja (zmienna-kolekcja + pętla + bloki per-pole)

To odpowiada dokładnie pomysłowi z pytania: zmienna trzymająca zeskanowany
adres, a każda dana (HTTP title, banner, itd.) jako osobna, wywoływalna
funkcja działająca na tej zmiennej.

```
+---------------------------------------------------+
| Blok: "Skanuj zakres IP"                           |
| Wejscie: Od / Do                                   |
| Wyjscie: $hosts  (KOLEKCJA adresow, bez enrichmentu)|
+---------------------------+-------------------------+
                            |
                            v
+---------------------------------------------------------+
| Blok: "Dla kazdego" (petla po kolekcji)                  |
| Kolekcja: $hosts                                          |
| Zmienna iteracji: $host   <-- to jest ta "zmienna z pytania"|
|-----------------------------------------------------------|
|  wewnatrz petli, dla kazdego $host z osobna:               |
|                                                             |
|   +--------------------------------+                      |
|   | Blok: "Reverse DNS($host)"      | --> $hostname         |
|   +--------------------------------+                      |
|   +--------------------------------+                      |
|   | Blok: "Geo / ISP / AS($host)"   | --> $isp $as $flag    |
|   +--------------------------------+                      |
|   +--------------------------------+                      |
|   | Blok: "HTTP Title($host:port)"  | --> $title  (Tier 2 - |
|   +--------------------------------+      brak backendu)   |
|   +--------------------------------+                      |
|   | Blok: "Banner($host:port)"      | --> $banner (Tier 2)  |
|   +--------------------------------+                      |
|   +--------------------------------+                      |
|   | Blok: "Zapisz wiersz"           | --> tabela wynikow    |
|   +--------------------------------+                      |
+---------------------------------------------------------+
```

### Czego dziś brakuje, żeby Wariant B zadziałał

1. **Interpreter bloków** — dziś `If` / `Repeat Until` / `PowerShell` /
   `Time Trigger` są tylko wizualne, nic nie wykonują
   (`shellcraft-canvas-runtime.js` nie ma żadnej funkcji uruchamiającej).
2. **Typ zmiennej "kolekcja"** — dziś makro zwraca wyłącznie pojedynczy
   string, nie ma pojęcia listy/rekordów.
3. **Blok "Dla każdego" / iterator** — nie istnieje. `Repeat Until` to
   warunek stopu, nie iteracja po liście elementów — to inny blok.
4. **Osobne, wywoływalne komendy per pole**:
   - Reverse DNS i Geo/ISP/AS **już są prawdziwymi komendami Rust**
     (`hostname_lookup`, `geo_lookup`) — dałoby się je opakować w bloki
     stosunkowo małym kosztem.
   - HTTP Page Title / Banner Grabbing / SSL Cert Info to dziś **czysta
     atrapa UI** (kolumny istnieją, backend nie) — patrz zaległość
     "Tier 2" w `ROADMAP.md` / backlog item 17. Blok odpytujący te pola
     nie miałby dziś czego wywołać.
5. **Docelowe miejsce wyniku pętli** — czy trafia do istniejącej tabeli
   "IP Results", czy do osobnej struktury, przez blok w stylu
   "Zapisz wiersz"?

## Rekomendacja

Zacząć od **Wariantu A** — jedno makro = cały scan z bieżącym configiem,
wynik identyczny jak dziś po Start. Działa natychmiast, nie wymaga żadnej
nowej infrastruktury w ShellCraft.

**Wariant B** to właściwa, docelowa wersja pomysłu z pytania, ale to
naturalnie kolejny, większy etap — sensowny dopiero **po**:
- zbudowaniu interpretera bloków (żeby cokolwiek w ogóle się wykonywało),
- dokończeniu Tier 2 backendu (żeby było co odpytywać per pole).

Do tego czasu Wariant A daje realną wartość (można odpalić skan z poziomu
makra/ShellCraft) bez czekania na całą resztę.
