# My Football Legend

Narracyjny symulator kariery piłkarza działający w przeglądarce.

## Status

Fundament techniczny: React, TypeScript strict, Vite, Vitest, ESLint, Prettier, Zod, deterministyczny RNG i przykładowa walidowana treść. Pełna rozgrywka nie jest jeszcze implementowana.

## Wymagania

Node.js 20+ i npm.

## Instalacja

```bash
npm install
```

## Komendy developerskie

- `npm run dev` — lokalny serwer Vite.
- `npm run lint` — ESLint.
- `npm run test` — testy Vitest.
- `npm run build` — produkcyjny build.
- `npm run format:check` — kontrola formatowania.

## Struktura repozytorium

- `src/app` i `src/components` — powłoka interfejsu.
- `src/core` — logika gry niezależna od Reacta.
- `src/content` — deklaratywne dane treści i lokalizacja.
- `src/schemas` — schematy Zod.
- `src/persistence` — przyszły zapis lokalny.
- `src/devtools` — narzędzia techniczne.
- `docs` — architektura, model narracji, poradnik treści i roadmapa.

## Lokalizacja i fleksja

Domyślnym językiem jest polski. Obecny system obsługuje klucze i proste parametry. Polska fleksja, odmiana nazwisk, płci i liczebników jest świadomie odłożona do osobnego modułu, aby gotowe teksty nie stały się źródłem prawdy o historii.

## Pierwszy grywalny wycinek

Aplikacja prowadzi teraz gracza przez ekran startowy, kreator zawodnika, deterministyczne losowanie atrybutów i zapisanie pierwszej kariery w przeglądarce. Przycisk „Kontynuuj” jest aktywny tylko wtedy, gdy zapis w `localStorage` przejdzie walidację schematem Zod.

Tworzenie profilu odbywa się poza Reactem w `src/core/playerCreator.ts`. Generator korzysta z istniejącego `RandomGenerator`, seeda kariery, danych zawodnika, pozycji i numeru losowania. Gracz widzi pierwsze losowanie oraz maksymalnie dwie ponowne próby. Potencjał jest zapisywany w stanie kariery, ale nie jest prezentowany jako dokładna liczba.

Lokalny zapis ma format `{ version, savedAt, career }` i jest obsługiwany przez `src/core/persistence.ts`. Dane pozostają w tej przeglądarce; etap nie dodaje backendu, kont, zewnętrznych API, analityki ani cookies.

Świadomie odłożone elementy: sezony, mecze, transfery, decyzje treningowe, pełny generator twarzy, archetypy fantasy, poziom trudności, zmiana pozycji i generowana narracja sezonowa.

## Pierwszy łuk akademii

Gra zawiera pierwszy grywalny tydzień w akademii Vistula Nova: rozmowę z trenerem Markiem Wroną, deterministycznie generowanego konkurenta, grę treningową, rozmowę po treningu i podsumowanie tygodnia. Wydarzenia zapisują kanoniczne fakty, relacje i wątki; widoczny tekst jest tylko lokalizowaną interpretacją tych danych.

Weryfikacja projektu odbywa się komendą `npm run verify`, która uruchamia lint, testy i build.

## Aktualny etap prezentacji narracji

Interfejs akademii prezentuje decyzje jako osobne karty z opisem, możliwymi korzyściami i ryzykami zapisanymi językiem świata gry. Historia i relacje korzystają z warstwy prezentacji faktów, dzięki czemu gracz widzi tytuły, streszczenia, ton i uczestników zamiast technicznych identyfikatorów. Zakładka Klub pokazuje pierwszy profil Vistula Nova oparty na danych `Club`, a relacje używają deterministycznych awatarów SVG.

## Drugi tydzień akademii

Po domknięciu pierwszego tygodnia gra pozwala rozpocząć drugi łuk akademii Vistula Nova. Łuk obejmuje informację zwrotną Marka Wrony, wybór przygotowania, dodatkowy trening z konkurentem, końcowy sprawdzian, decyzję o treningach z seniorami, odpowiedź zawodnika i podsumowanie dwóch tygodni. Brak zaproszenia jest ścieżką fail-forward: prowadzi do indywidualnego planu albo dodatkowego sprawdzianu akademii, a nie do końca kariery.

W narzędziach developerskich (`?devtools=1`) dostępna jest ręcznie uruchamiana symulacja naboru do seniorów, która sprawdza rozkład decyzji trenera dla deterministycznych seedów bez zapisywania wyników w stanie kariery.

## Ścieżki po selekcji

Po dwóch tygodniach akademii kariera przechodzi do jednej z czterech ścieżek: próby seniorów, wspólnej szansy, indywidualnego planu albo dodatkowej oceny. Każda kończy się jakościowo opisaną rolą na sierpień 2026; żadna nie jest porażką kończącą karierę. Teksty są wybierane deterministycznie z semantycznych zestawów wariantów.

## Wrzesień 2026: pierwsze mecze

Kariera obejmuje cztery deterministyczne kolejki, lekką rywalizację o skład i tekstowe momenty decyzyjne. Silnik zapisuje strukturalny stan meczu, więc spotkanie można bezpiecznie wznowić po odświeżeniu.

> **The game simulates the player's experience of a football match, not every touch of the ball.**

## Informacja zwrotna meczu i kariery

Wrześniowe spotkania prezentują teraz trwały wynik, minutę, dynamikę, statystyki drużyn i kontekstową ocenę zawodnika. Historia występów pozostaje źródłem bieżących statystyk sezonu, a fakty `attribute_changed` i `play_style_unlocked` tworzą audytowalny zapis rozwoju.

## Wielotygodniowa kariera

Po prologu akademii, sierpniowym planowaniu i pierwszych meczach września kariera korzysta z deterministycznej pętli tygodniowej. Lekki terminarz pozwala rozgrywać kolejne spotkania do końca 2026 roku bez osobnych silników miesięcznych, a Historia domyślnie pokazuje kamienie milowe.
