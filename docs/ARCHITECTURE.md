# Architektura

## Jedna pętla kariery

Kariera ma jeden cykl życia: utworzenie zawodnika, inicjalizacja generycznego sezonu, tygodnie kalendarza, zamknięcie sezonu, okno decyzji zawodowych i inicjalizacja następnego sezonu. Pierwszy sezon jest rozgrywką młodzieżową z powodów sportowych, a nie osobnym silnikiem fabularnym. `advanceCareerFlow` wykonuje wyłącznie bezdecyzyjne, idempotentne przejścia.

`CareerWeek`, `CareerCalendarState`, `LeagueSeason` i udział zawodnika w spotkaniach stanowią kanoniczną architekturę każdego sezonu. Mecze rutynowe mogą być symulowane, a znaczące zatrzymują kalendarz na interakcji. Dostępność, kontuzje, zawieszenia, trening, rozwój i starzenie korzystają z tej samej osi czasu.

## Kanoniczny świat futbolu

Liga rozstrzyga pełne kolejki i przechowuje tabelę oraz wyniki jako fakty świata. `ProfessionalClub.strengthRating` jest trwałym źródłem jakości pierwszego zespołu; oceny meczowe są z niego wyprowadzane. Infrastruktura klubu, historia udziału w sezonach i archiwum sezonów nie są alternatywnymi źródłami siły.

Kontrakty, oferty profesjonalne, transfer do pierwszego klubu, kolejne okna transferowe, renegocjacje i preferencje agenta są już częścią generycznego cyklu. Przejście akademia–profesjonalny futbol wynika z wyniku sezonu i decyzji zawodowej, nie ze specjalnego faktu fabularnego.

## Narracja i wydarzenia

`HistoryFact` zapisuje kanoniczne zdarzenia, `RelationshipScores` relacje, a `StoryThread` długotrwałe interpretacyjne konteksty. Tekst lokalizowany jest prezentacją tych danych. `EventDefinition`, `EventInstance`, rejestr, deterministyczna instancjalizacja, resolver i aplikowanie rezultatu pozostają ogólną infrastrukturą dla przyszłych wydarzeń kontekstowych; nie sterują osobnym prologiem.

Cała logika `src/core` pozostaje niezależna od Reacta. Losowania przechodzą przez deterministyczny `RandomGenerator`, a dane domenowe są walidowane schematami Zod.

## Trwałość danych

Projekt jest wewnętrznym prototypem. Kompatybilność starych zapisów nie jest obecnie ograniczeniem projektowym. Zmiana architektury może podnieść wersję zapisu i czysto odrzucić wcześniejsze dane zamiast utrzymywać migracje oraz pola zapasowe.

## Dalszy kierunek

Planowane osobno są: ujednolicone rozgrywki i kalendarz, rosnąca oś sezonu, responsywny pojedynczy widok kariery oraz przyszły interaktywny silnik migawkowych momentów meczu. Nie są one jeszcze zaimplementowane w obecnej architekturze.
