# Roadmap

## Następny fundament: trwałe składy klubowe

- **Persistent club squads:** prawdziwi zawodnicy przypisani do klubów (pozycja, znajomość pozycji,
  archetyp i OVR), wyjściowa jedenastka, ławka, stali koledzy oraz sezonowe transfery.
- **Selection competition:** rola i minuty wynikające z rywalizacji z konkretnymi zawodnikami na
  pozycji, nie tylko z porównania OVR do jednej abstrakcyjnej siły klubu.
- **Offer role:** przyszła rola w kontrakcie lub ofercie uwzględni realną konkurencję w klubie celu.

Po tym fundamencie pozostają planowane: interaktywny izometryczny silnik decyzji meczowych,
style gry nabywane przez zachowanie oraz osiągnięcia i easter eggi.

## Główne etapy

1. Player Model 2.0.
2. Play Styles / Strengths 2.0.
3. Świat, ligi zagraniczne i globalna normalizacja siły.
4. Puchary i europejskie rozgrywki.
5. Reprezentacje i turnieje międzynarodowe.
6. Rozbudowa wydarzeń i narracji.
7. Ekonomia, styl życia i inwestycje.
8. Trwali koledzy z drużyny, trenerzy i relacje.
9. Interaktywny, izometryczny i decyzyjny silnik meczu.

Osobiście rozgrywane ważne mecze otrzymają docelowo izometryczny interfejs taktycznej migawki. Gracz kliknie kontekstowy cel — przestrzeń boiska, kolegę, rywala lub bramkę — a następnie wybierze z radialnego menu podanie, drybling, strzał, ruch lub inną akcję. Kliknięte miejsce przekaże zamierzony cel albo umiejscowienie, natomiast dokładność wykonania rozstrzygną atrybuty i kontekst. Będzie to system decyzyjny, nie gra akcji ani refleksu. Obecny tymczasowy `MatchGame` ma zostać zastąpiony, a nie rozwijany.

## Później

- rozszerzać świat o kolejne rodzaje rozgrywek dopiero na wspólnym modelu;
- dodawać kontekstowe wydarzenia przez generyczne fakty, relacje i wątki;
- pogłębiać symulację kariery bez duplikowania źródeł prawdy.
- dodać kompaktowe podglądy encji po wskazaniu nazwy, czerpiące wyłącznie z kanonicznych danych klubów i osób.

Każdy etap musi zachować deterministyczność, niezależność `src/core` od Reacta i walidację nowych danych w Zod. Roadmapa opisuje kierunek, nie funkcje już dostępne.

## Po Player Model 2.0

- behawioralne zdobywanie PlayStyle wraz z powiadomieniami,
- osiągnięcia, kamienie milowe i sekretne osiągnięcia,
- kreator z własnym budżetem atrybutów i archetypy fantasy,
- sugestie trenera dotyczące przekwalifikowania i roli,
- bogatsza rehabilitacja kontuzji oraz kryzysy psychologiczne,
- interaktywny izometryczny silnik meczu oparty na decyzjach,
- trwałe składy, koledzy i trenerzy oraz bogatsze kadry klubów,
- ligi zagraniczne, puchary, Europa i reprezentacje.
