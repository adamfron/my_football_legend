# Architektura

Aplikacja jest lokalną grą przeglądarkową bez backendu. UI w `src/app` czyta stan i prezentuje go, ale reguły kariery pozostają w `src/core`. Treści w `src/content` są deklaratywne i przechodzą przez schematy z `src/schemas`.

## Przepływ danych

Seed tworzy deterministyczny generator. Generator i definicje wydarzeń produkują instancje wydarzeń, konsekwencje, fakty historii oraz zmiany wątków. Warstwa narracji zamienia fakty i interpretacje na tekst.

## Granice odpowiedzialności

React odpowiada za ekran. Core odpowiada za reguły. Content odpowiada za dane. Persistence będzie odpowiadać za zapis lokalny.

## Zapis lokalny

Pierwszy plan zakłada localStorage dla małych zapisów, walidację wersji Zod i późniejszą migrację. IndexedDB jest poza aktualnym zakresem.

## Symulacja sezonów

Późniejsza symulacja ma być lekka: najpierw istotne decyzje, relacje i fakty, a nie pełna symulacja wszystkich meczów.

## Kreator zawodnika i zapis lokalny

Logika kreatora jest domenowa i niezależna od Reacta. `src/core/playerCreator.ts` definiuje schematy Zod dla formularzy, listę pozycji, domyślne parametry ciała, limit ponownych losowań, deterministyczne generowanie profilu oraz fabrykę początkowego `CareerState`.

Deterministyczność profilu wynika z użycia `RandomGenerator.fromSeed` z kluczem złożonym z seeda kariery, podstawowych danych zawodnika, pozycji i `rollIndex`. Pozycja wpływa na bias atrybutów, ale dodatkowy szum deterministyczny pozwala tworzyć nietypowe profile.

`src/core/persistence.ts` jest małym modułem bez zależności od UI. Zapisuje `version`, `savedAt` i `career` w `localStorage`, a przy odczycie odróżnia brak zapisu, uszkodzony JSON, niezgodną wersję oraz dane niezgodne ze schematem `careerStateSchema`.

Pierwszy ekran kariery pozostaje statycznym prologiem. Nie zawiera jeszcze symulacji czasu, wydarzeń narracyjnych ani mechanik sezonu.

## Minimalny silnik wydarzeń akademii

Moduły `src/core/events` są niezależne od Reacta. `eventRegistry.ts` udostępnia deklaratywne definicje wydarzeń, `instantiateEvent.ts` tworzy instancje, `resolveEventChoice.ts` rozstrzyga wybory i ukryte testy przez `RandomGenerator`, a `applyEventResolution.ts` stosuje obiektywne konsekwencje do `CareerState` i zapisuje karierę po decyzji. `academyArc.ts` zapewnia idempotentną inicjalizację trenera, konkurenta i aktywnego wydarzenia dla nowych oraz starszych zapisów.

## Warstwa prezentacji narracji

`src/core/narrative/factPresentation.ts` tłumaczy kanoniczne fakty kariery na tytuł, opis, ton, uczestników i klub bez modyfikowania `HistoryFact`. React korzysta z tej warstwy w historii, relacjach i podsumowaniu tygodnia, ale logika pozostaje w `src/core` i nie zależy od komponentów.

`src/core/characters/avatarGenome.ts` generuje deterministyczny opis prostego awatara SVG na podstawie seedu, wieku i wersji generatora. Komponent `PersonAvatar` renderuje ten genom, a nie zapisuje twarzy w stanie kariery.

## Resolver registry wydarzeń akademii

Logika rozstrzygania decyzji jest podzielona na resolvery pierwszego i drugiego tygodnia w `src/core/events/resolvers`. Publiczna funkcja `resolveEventChoice` pobiera aktywne wydarzenie i deleguje do rejestru resolverów, dzięki czemu komponenty Reacta nie zawierają logiki scen, a logika `src/core` pozostaje niezależna od UI.

Drugi tydzień jest inicjalizowany idempotentnie przez `initializeSecondAcademyWeek`: wymaga ukończenia pierwszego tygodnia, braku aktywnego wydarzenia i braku zapisanego wyniku selekcji. Dane mieszczą się w istniejących strukturach `HistoryFact`, `StoryThread`, `EventInstance` i `relationships`, więc nie zwiększają wersji zapisu.

## Router po selekcji

`initializePostSelectionPath` jest czystym, idempotentnym routerem. Odczytuje ostatni kanoniczny fakt `academy_selection_result`, nie dodaje pola ścieżki do stanu i odtwarza następne wydarzenie z faktów po odświeżeniu. Logika postaci, wyniku i wariantów pozostaje w `src/core`, bez zależności od Reacta. Wszystkie gałęzie zbiegają się w faktach przypisania roli i ukończenia ścieżki.

## Reusable match engine

`src/core/septemberMatches.ts` nie zależy od Reacta. Łączy profil konkurencyjny klubu, profil selekcyjny trenera, anonimową dostępność grup pozycyjnych i deterministyczne tło wyniku. `MatchState` jest strukturalnym źródłem prawdy i może być zapisany w połowie meczu; cztery wrześniowe kolejki używają tego samego przebiegu.

**The game simulates the player's experience of a football match, not every touch of the ball.** Wynik drużyny jest symulowany osobno od kilku sytuacji ważnych dla zawodnika.

## Match feedback pipeline

> The game simulates the player's experience of a football match, not every touch of the ball.

Istniejący silnik jest rozszerzany jednym deterministycznym przepływem:

`Match simulation → background segments → score/stats/momentum → player moment → hidden resolution → personal impact → team impact → coach interpretation → live rating → final appearance`.

Wynik, `MatchTeamStats`, punkty `MatchMomentumPoint` i ocena powstają w domenie; React wyłącznie je prezentuje. Dane są częścią `MatchState`, dzięki czemu zapis i odświeżenie nie uruchamiają symulacji ponownie. `matchHistory` jest kanonicznym źródłem agregatów sezonu, a opcjonalne nowe pola zachowują zgodność wcześniejszych zapisów.

`SeasonContextOpportunity` jest deklaratywnym fundamentem przyszłych kontekstów końcówki sezonu. `club_strength_changed` ma model danych, ale fakt powstanie dopiero wraz z rzeczywistą zmianą kadry lub sztabu.

## Career loop

`CareerWeek` jest jednostką kalendarza domenowego, niewidoczną jako techniczny model w UI:

`CareerWeek → schedule events → squad evaluation → fixture / no fixture → match → consequences → optional off-field event → complete week → next week`.

`careerWeeks.ts` tworzy terminarz deterministycznie, pilnuje idempotencji, pamięci wariantów i checkpointów. Dowolny `Fixture` jest przekazywany adapterem do istniejącego silnika meczowego; nie istnieją silniki października czy listopada. **Months are presentation checkpoints, not separate engines** — tydzień może swobodnie przekroczyć granicę miesiąca.

Stare etapy pozostają źródłem prawdy dla rozpoczętych zapisów. Fakt ukończenia września jest granicą migracyjną uruchamiającą reusable loop.

## Career simulation

```text
current state
→ simulate routine time
→ quick fixtures
→ world results
→ league table
→ event scheduling
→ DecisionPoint?
   ├─ no → continue
   └─ yes → stop for player
```

`src/core/leagueSeason.ts` przechowuje lekki świat ligi, generuje terminarz i wylicza tabelę. `src/core/careerSimulation.ts` używa istniejącej oceny szans na skład i zatrzymuje pętlę przy ważnym meczu albo wydarzeniu. React jedynie prezentuje wynik domeny.

Zasada projektu: **Routine football is simulated. Meaningful football is played.**
