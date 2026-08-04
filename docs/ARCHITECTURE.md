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
