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
