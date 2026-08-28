# Architektura

## Career View

Stały widok sezonu jest podstawową powierzchnią rozgrywki aktywnej kariery. Tabela ligi i
wyprowadzona z danych kanonicznych Oś sezonu są widoczne jednocześnie i aktualizują się wraz z
postępem kariery; nie zapisujemy osobnego modelu osi w save.

Karty zawodnika, klubu, kontraktu/finansów i historii pokazują zwarte podsumowania. Ich szczegóły
rozwijają się nad tym samym widokiem, zamiast przenosić gracza do osobnych ekranów. Na wąskim
ekranie karty przewijają się poziomo, a tabela i oś układają się w jednej kolumnie.

## Playback i autopauza

Play/Pause jest wyłącznie stanem prezentacji i nigdy nie jest zapisywany. React odpowiada za
tempo (jeden krok co 1000 ms), natomiast `advanceSimulationStep` w core pozostaje jedynym źródłem
reguł pojedynczego, deterministycznego kroku. Szybkie przejście także korzysta z tego prymitywu.

Każda decyzja gracza zatrzymuje czas: wydarzenie, ważny mecz, aktywny mecz lub event, decyzja
transferowa/kontraktowa, koniec sezonu, emerytura oraz błąd progresji. Rozwiązanie wydarzenia nie
wznawia automatycznie odtwarzania.

## Jedna pętla kariery

Kariera ma jeden cykl życia: utworzenie zawodnika, inicjalizacja generycznego sezonu, tygodnie kalendarza, zamknięcie sezonu, okno decyzji zawodowych i inicjalizacja następnego sezonu. Pierwszy sezon jest rozgrywką młodzieżową z powodów sportowych, a nie osobnym silnikiem fabularnym. `advanceCareerFlow` wykonuje wyłącznie bezdecyzyjne, idempotentne przejścia.

`CareerCalendarState` jest kanonicznym, widocznym dla zawodnika terminarzem sezonu. Przechowuje spotkania, datowane wydarzenia kontekstowe i bieżącą datę symulacji. `LeagueSeason` pozostaje tymczasowo autorytetem tabeli i wyników rozgrywek, a operacje domeny kalendarza atomowo synchronizują jego przyszłe daty z terminarzem i rejestrem udziału zawodnika.

### Operacyjne tygodnie i dynamiczna przyszłość

`CareerWeek` jest wyłącznie operacyjnym koszykiem dla systemów działających w rytmie tygodniowym. Nie jest właścicielem dat spotkań ani wydarzeń: jego identyfikatory są przebudowywane z kanonicznego kalendarza. Przyszłe spotkania i wydarzenia mogą być dodawane, przekładane lub odraczane wyłącznie przez jawne operacje domenowe. Wykrywają one konflikty, ale nie narzucają priorytetu rozgrywek.

### Niezmienna przeszłość i projekcja osi

Zakończone wyniki, decyzje i fakty są niezmienne i nie są ponownie losowane po zmianie przyszłego terminarza. Przełożenie zachowuje identyfikator spotkania i powiązanie z rejestrem udziału oraz zapisuje semantyczny `HistoryFact`, a nie gotową narrację.

`SeasonTimeline` jest czystą, deterministycznie sortowaną projekcją kalendarza, udziału zawodnika, wydarzeń i historii. Nie jest zapisywana ani nie kopiuje statystyk meczu; wpis spotkania wskazuje jego kanoniczny `SeasonParticipationRecord`. Przyszłe systemy pucharów krajowych, europejskich i reprezentacji skorzystają z tego samego API planowania zamiast tworzyć własne kalendarze. Te rozgrywki nie są jeszcze zaimplementowane.

## Kanoniczny świat futbolu

Liga rozstrzyga pełne kolejki i przechowuje tabelę oraz wyniki jako fakty świata. `ProfessionalClub.strengthRating` jest trwałym źródłem jakości pierwszego zespołu; oceny meczowe są z niego wyprowadzane. Infrastruktura klubu, historia udziału w sezonach i archiwum sezonów nie są alternatywnymi źródłami siły.

Kontrakty, oferty profesjonalne, transfer do pierwszego klubu, kolejne okna transferowe, renegocjacje i preferencje agenta są już częścią generycznego cyklu. Przejście akademia–profesjonalny futbol wynika z wyniku sezonu i decyzji zawodowej, nie ze specjalnego faktu fabularnego.

## Narracja i wydarzenia

`HistoryFact` zapisuje kanoniczne zdarzenia, `RelationshipScores` relacje, a `StoryThread` długotrwałe interpretacyjne konteksty. Tekst lokalizowany jest prezentacją tych danych. `EventDefinition`, `EventInstance`, rejestr, deterministyczna instancjalizacja, resolver i aplikowanie rezultatu pozostają ogólną infrastrukturą dla przyszłych wydarzeń kontekstowych; nie sterują osobnym prologiem.

Cała logika `src/core` pozostaje niezależna od Reacta. Losowania przechodzą przez deterministyczny `RandomGenerator`, a dane domenowe są walidowane schematami Zod.

## Warstwa aplikacji React

`src/app/App.tsx` jest powłoką aplikacji: wybiera ekran startowy, kreator lub karierę oraz zarządza wczytaniem, zapisem i resetem kariery. Komponenty funkcjonalne w `src/app/career`, `src/app/match` i `src/app/shared` odpowiadają za prezentację poszczególnych obszarów interfejsu.

Zależności biegną od Reacta do `src/core`. Ekrany wyświetlają stan i wywołują istniejące operacje domenowe, ale nie implementują reguł rozgrywki; `src/core` nie importuje warstwy React/UI.

## Trwałość danych

Projekt jest wewnętrznym prototypem. Kompatybilność starych zapisów nie jest obecnie ograniczeniem projektowym. Zmiana architektury może podnieść wersję zapisu i czysto odrzucić wcześniejsze dane zamiast utrzymywać migracje oraz pola zapasowe.

## Dalszy kierunek

Planowane osobno są: ujednolicone rozgrywki i kalendarz, rosnąca oś sezonu, responsywny pojedynczy widok kariery oraz przyszły interaktywny silnik migawkowych momentów meczu. Nie są one jeszcze zaimplementowane w obecnej architekturze.
