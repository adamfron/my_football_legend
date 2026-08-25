# Model narracyjny

## Uwaga gracza

Routine time should disappear quickly. Player attention is a scarce resource. A season therefore aims for only a few interactive matches and three contextual strategic event windows; ordinary non-selection is not itself a story beat. Injuries interrupt fast-forward only when their consequences are meaningful.

1. `EventDefinition` opisuje możliwą sytuację, obsadę, decyzje, ukryte testy i konsekwencje.
2. `EventInstance` zapisuje konkretny przebieg, kontekst, wybór i stan losowości.
3. Obiektywny rezultat jest danymi: co zaszło w świecie gry.
4. Interpretacje społeczne opisują, jak postacie odczytują rezultat.
5. `HistoryFact` jest kanonicznym faktem kariery.
6. `StoryThread` łączy fakty i postacie w długotrwały wątek.
7. Tekstowa prezentacja narracji powstaje na końcu z faktów, wątków i lokalizacji.

Gotowe teksty nie są źródłem prawdy o historii. Źródłem prawdy są fakty, wątki, relacje i konsekwencje.

## Przykład przepływu: pierwsza gra treningowa

`EventDefinition` `academy_first_scrimmage` opisuje scenę, obsadę, widoczne informacje i decyzje. `EventInstance` zapisuje konkretną obsadę, datę, seed losowania i późniejszy rezultat. Po wyborze, np. szybkiego podania do konkurenta, resolver wykonuje ukryty test z atrybutów, morale, kondycji, faktów kontekstowych i deterministycznego modyfikatora. Wynik techniczny daje `ResolutionTier`, ale gracz widzi tylko opis konsekwencji. Obiektywny rezultat może mówić, że akcja pomogła drużynie, a osobne `SocialInterpretation` zapisuje, że konkurent czuje wdzięczność, trener widzi dojrzałość, a zawodnik nie zostaje indywidualnym bohaterem. Następnie powstaje `HistoryFact` z aktorami, klubem, decyzją, rezultatem, przyczynami, tonem i tagami recall. `StoryThread` trenera lub konkurenta łączy fakty w dłuższy wątek. Tekst w UI jest deterministycznie składany z lokalizacji i danych faktu, nie jest źródłem prawdy.

## Prezentacja faktów i podsumowań

Fakty pozostają źródłem prawdy: zapisują typ, decyzję, rezultat, aktorów, cele, klub i powiązania przyczynowe. Teksty dla gracza powstają dopiero w warstwie prezentacji faktów. Podsumowanie pierwszego tygodnia jest deterministycznie składane z faktów pierwszego wrażenia, gry treningowej, rozmowy z konkurentem i aktualnego kontekstu walki o szansę u seniorów.

## Selekcja seniorów jako fakty i interpretacje

Końcowy sprawdzian nie jest tym samym co decyzja trenera. Sprawdzian zapisuje fakt występu i wewnętrzny raport oceny kandydata, natomiast decyzja Marka Wrony zapisuje osobny fakt selekcji. Decyzja uwzględnia wcześniejsze fakty: pierwsze wrażenie, pierwszą grę treningową, kierunek przygotowań, dodatkową pracę z konkurentem oraz relacje z trenerem i rywalem.

Konkurent ma lekki deterministyczny profil akademii zamiast pełnej symulacji składu. Profil opisuje jakość bazową, gotowość, dopasowanie taktyczne i reakcję na presję, ale liczby nigdy nie są prezentowane graczowi. Podsumowanie drugiego tygodnia jest składane z kanonicznych faktów, relacji i wątków, a nie zapisywane jako gotowy tekst źródłowy.

## Deterministyczne warianty

Fakty przechowują decyzje, uczestników, przyczyny i semantyczne wyniki, nigdy wybrane akapity. `selectNarrativeVariant` tworzy prywatny generator z seeda kariery, identyfikatora zestawu, zakresu i kanonicznego kontekstu. Dzięki temu warstwa prezentacji może zmieniać opis sceny, rezultatu, historii, relacji i podsumowania bez zużywania generatora symulacji. Podsumowania składają niezależne części: otwarcie, decyzję, wynik, callback relacji i następny krok.

## Narracja meczu

Sytuacje są deklaratywnymi `MatchMomentDefinition`, a tekst wejścia ma warianty wybierane deterministycznie. Rozstrzygnięcie zachowuje trzy osobne interpretacje: **personal impact** (jakość i widoczność gracza), **team impact** (korzyść dla wyniku i kontroli) oraz **coach interpretation** (ocena decyzji przez profil trenera). Dobra akcja nie gwarantuje gola, a słabsza nie przesądza wyniku.

## Ocena występu i interpretacja trenera

Rating jest obiektywizującą, kontekstową oceną działań boiskowych (minuty, pozycja, trudność i koszt sytuacji oraz statystyki). Coach interpretation pozostaje subiektywną interpretacją realizacji zadania, dyscypliny taktycznej, relacji i potrzeb zespołu. Mechanizmy nie wyznaczają się wzajemnie: wysoka ocena może współistnieć z zastrzeżeniem trenera, a przeciętna nota z pochwałą taktyczną.

Zmiany atrybutów i atuty są faktami kanonicznymi, nie gotowymi tekstami. Warianty feedbacku powinny korzystać z semantycznego kontekstu: dobrej lub kosztownej akcji, kreacji bez asysty, wyniku drużyny, rozwoju miesiąca i przyczyn odblokowania stylu.

## Recall i kamienie milowe

Opcjonalne wydarzenia zapisują semantyczne `recallTags` (np. presja treningowa, pomoc mentora, poświęcenie dla drużyny), zamiast utrwalać wyłącznie gotowy tekst. `getCareerMilestones` klasyfikuje fakty prezentacyjnie: debiuty, pierwsze gole i asysty, zmiany roli, Play Style oraz punkty zwrotne. Zwykły mecz i techniczny fakt tygodnia pozostają w pełnym logu, ale nie trafiają automatycznie do widoku „Najważniejsze”.

Selektor krótkich podsumowań korzysta z pamięci ostatnich kluczy wariantów. Najpierw preferuje wariant ostatnio niewykorzystany, po czym dokonuje deterministycznego wyboru z seeda i identyfikatora tygodnia.

## Rutynowe mecze jako fakty

Brak interakcji w rutynowym meczu nie oznacza braku znaczenia narracyjnego. Quick simulation zapisuje występ i fakty; mogą one później wyjaśniać formę, serię, zmianę roli albo milestone. Tekst podsumowania jest prezentacją danych, a nie ich źródłem prawdy.

## Academy graduation

Season 1 is an academy prologue. Vistula Nova can win its youth league, but the club is never promoted into professional football: the player graduates. Canonical `academy_graduated`, `first_professional_contract`, and `joined_professional_club` facts preserve the transition and its causes.

## Kontekst historyczny i bieżący

Kontekst historyczny jest niezmienny. Aktualne opisy korzystają z bieżącego sezonu, klubu i afiliowanego sztabu, dzięki czemu dawna relacja z trenerem akademii pozostaje w historii bez przedstawiania go jako trenera kolejnego klubu.
