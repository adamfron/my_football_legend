# Roadmap

## Najbliżej

1. Ujednolicić model rozgrywek i kalendarza bez tworzenia miesięcznych silników.
2. Rozwinąć generyczną oś sezonu (`SeasonTimeline`) na podstawie kanonicznych tygodni i faktów.
3. Uporządkować responsywny, pojedynczy widok kariery bez zmiany domenowej pętli.
4. Zaprojektować interaktywny silnik migawkowych momentów ważnych meczów.

## Później

- rozszerzać świat o kolejne rodzaje rozgrywek dopiero na wspólnym modelu;
- dodawać kontekstowe wydarzenia przez generyczne fakty, relacje i wątki;
- pogłębiać symulację kariery bez duplikowania źródeł prawdy.

Każdy etap musi zachować deterministyczność, niezależność `src/core` od Reacta i walidację nowych danych w Zod. Roadmapa opisuje kierunek, nie funkcje już dostępne.
