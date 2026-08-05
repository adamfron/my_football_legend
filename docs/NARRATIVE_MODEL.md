# Model narracyjny

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
