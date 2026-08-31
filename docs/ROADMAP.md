# Roadmap

Lokalny `npm run audit:archetypes` pozostaje narzędziem kalibracji nowych profili, nie ciężkim
testem CI. Najbliższym dużym systemem po kalibracji są trwałe składy, a następnie rzeczywista
rywalizacja pozycyjna.

## Projekcje kariery i role trenera

- przyszłe role/instrukcje taktyczne trenera obejmą m.in. odwróconego bocznego obrońcę;
- ogólny `CompetitionView` zastąpi panel ligi: tabela dla lig/grup, runda lub drabinka pucharu
  oraz przełączanie ligi, pucharu krajowego, Europy i reprezentacji z poszanowaniem wyboru gracza;
- widok miesiąca pod rozgrywkami pokaże mecze, rywali, trening, zgrupowania, urazy i wydarzenia,
  ale będzie wyłącznie projekcją `CareerCalendar`, terminarza, wydarzeń i treningu — nigdy kopią;
- puchary krajowe, Europa i reprezentacje powstaną dopiero na wspólnej abstrakcji rozgrywek.

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

# NEXT: ClubView presentation

Następny PR prezentacyjny przebuduje `ClubView`, wykorzystując kanoniczną hierarchię składu i fakty
kontraktowe NPC. Nie będzie jeszcze zmieniał zasad wyboru menedżera. Dopiero kolejny etap wdroży
rzeczywistą selekcję i rywalizację pozycyjną.

## Później: Selection & positional competition

Use actual squad members for starter/bench/rotation status, `selectionStanding`, promised roles, offer competition and coach evaluation. This must remain a player-career system: the manager owns the formation and the protagonist does not select the XI.

Later work includes sparse NPC seasonal aging/development, retirements, academy graduates, deliberately imperfect/noisy NPC transfers, foreign leagues with active/background fidelity levels, former teammates becoming coaches, persistent relationships, multiple competitions, cups/Europe/national teams, behaviour-driven PlayStyles, achievements/easter eggs and an interactive isometric decision match engine. Clubs may stockpile positions, miss replacements or buy imperfect fits; AI must not become a perfect squad optimizer.

# Następne kroki

**NEXT: PR #48 — realna rywalizacja pozycyjna i wybór składu.**

Później: rzadki sezonowy rozwój i regres NPC, emerytury, nabór młodzieży, niedoskonałe
transfery NPC, migracje trenerów, byli gracze jako trenerzy, zagraniczne pakiety świata,
poziomy wierności symulacji aktywnej/tła, puchary/Europa/reprezentacje, miesięczny kalendarz,
zmiana rozgrywek, PlayStyles wynikające z zachowania, osiągnięcia/easter eggi oraz interaktywny
izometryczny silnik meczowy oparty na decyzjach.
