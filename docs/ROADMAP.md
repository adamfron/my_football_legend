# Roadmap

Lokalny `npm run audit:archetypes` pozostaje narzędziem kalibracji nowych profili, nie ciężkim
testem CI. Rzeczywista selekcja i rywalizacja pozycyjna są fundamentem; najbliższym dużym systemem
jest świat akademii / U-17 i przepływ absolwentów. Trwali młodzi piłkarze powstaną przed wspólnym
systemem rzadkiego rozwoju seniorów i akademii.

## Projekcje kariery i role trenera

- cztery górne kafle podsumowania `CareerView` pozostaną głównym modelem nawigacji;
- rozwinięty ZAWODNIK stanie się jednym gęstym, pełnoekranowym `PlayerView`, bez wewnętrznych
  zakładek i bez deweloperskiego seedu kariery; rozwój pozostanie zintegrowany z atrybutami przez
  delty oraz radar wartości bazowych i bieżących;
- `ClubView` i przyszła mapa pozycji zawodnika użyją jednej kanonicznej geometrii boiska;
- `PlayerView` może zwięźle pokazywać statystyki bieżącego sezonu, natomiast pełne statystyki
  kariery trafią do rozwiniętej KARIERA / `HistoryView`;
- `HistoryView` połączy oś kariery, biografię generowaną z kanonicznych faktów i aktualne statystyki
  sezon po sezonie;
- mini-kafelek KARIERA będzie mógł priorytetyzować pilny stan widoczny dla gracza (uraz lub
  zawieszenie), a w pozostałych sytuacjach ostatnie znaczące wydarzenie kariery;
- KONTRAKT / FINANSE może rozwinąć inwestycje, usługi i zakupy bez nowej nawigacji najwyższego
  poziomu.

- przyszłe role/instrukcje taktyczne trenera obejmą m.in. odwróconego bocznego obrońcę;
- ogólny `CompetitionView` zastąpi panel ligi: tabela dla lig/grup, runda lub drabinka pucharu
  oraz przełączanie ligi, pucharu krajowego, Europy i reprezentacji z poszanowaniem wyboru gracza;
- widok miesiąca pod rozgrywkami pokaże mecze, rywali, trening, zgrupowania, urazy i wydarzenia,
  ale będzie wyłącznie projekcją `CareerCalendar`, terminarza, wydarzeń i treningu — nigdy kopią;
- puchary krajowe, Europa i reprezentacje powstaną dopiero na wspólnej abstrakcji rozgrywek.

## Zrealizowany fundament: realna selekcja i rywalizacja pozycyjna

- **Selection competition:** rola i minuty wynikające z rywalizacji z konkretnymi zawodnikami na
  pozycji, nie tylko z porównania OVR do jednej abstrakcyjnej siły klubu.
- **Offer role:** przyszła rola w kontrakcie lub ofercie uwzględni realną konkurencję w klubie celu.

Po tym fundamencie pozostają planowane: interaktywny izometryczny silnik decyzji meczowych,
style gry nabywane przez zachowanie oraz osiągnięcia i easter eggi.

## Kolejność kolejnych dużych systemów

**NEXT: akademia / świat U-17 i przepływ absolwentów.** Następnie: rzadki sezonowy rozwój/regres
NPC; emerytury i cykliczny nabór młodzieży; niedoskonały rynek transferowy NPC; trwałe profile i
cykl życia trenerów; zagraniczne pakiety świata; rozbudowa rozgrywek i kalendarza; Fitness/Morale
2.0 przed dojrzałą warstwą silnika meczu; behawioralne PlayStyles; osiągnięcia/easter eggi; styl
życia/ekonomia; interaktywny izometryczny silnik decyzji.

Migawki typowej selekcji klubów tła i tanie sezonowe statystyki NPC będą częścią etapów trwałego
rozwoju NPC i symulacji rozgrywek, nie osobnym wielkim podsystemem. Migawka będzie odświeżana przy
granicy sezonu, transferach, awansie z akademii, emeryturze, zmianie trenera, ważnej dostępności lub
rzadkim checkpointcie. Hierarchia + dostępność + mała deterministyczna rotacja pozwolą agregować
występy, starty, minuty, gole, asysty, kartki oraz średnią ocenę/MVP bez szczegółowych historii.

`CoachProfile` docelowo zachowa preferowane formacje, taktykę, rotację, zaufanie do młodzieży,
preferencję doświadczenia, elastyczność pozycyjną, cierpliwość wobec formy, reputację, wiek i etap
kariery. Zatrudnienie/zwolnienie uwzględni wyniki względem oczekiwań, reputację, dopasowanie do DNA,
finanse/kontrakt i dostępność; zmiana trenera przeliczy hierarchię. Byli gracze będą mogli przejść
do ról trenera młodzieży, asystenta lub menedżera.

Emerytura nie będzie uniwersalnym progiem wieku 40, lecz deterministycznie zróżnicowanym modelem
probabilistycznym zależnym od pozycji, regresu, urazów, minut, ofert, reputacji, ambicji,
profesjonalizmu i gotowości zejścia ligę niżej. Twardy limit testowy pozostanie tylko bezpiecznikiem.

Fitness/Morale 2.0 połączy minuty, kumulację zmęczenia, terminarz, regenerację, wytrzymałość, wiek
i środowisko klubu. Reakcja morale na grę poza opanowaną pozycją będzie kontekstowa (ambicja,
profesjonalizm, adaptacja, minuty, rola, relacja z trenerem i czas), a nie uniwersalnym modyfikatorem.

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

## Zrealizowany fundament: Selection & positional competition

Use actual squad members for starter/bench/rotation status, `selectionStanding`, promised roles, offer competition and coach evaluation. This must remain a player-career system: the manager owns the formation and the protagonist does not select the XI.

Later work includes sparse NPC seasonal aging/development, retirements, academy graduates, deliberately imperfect/noisy NPC transfers, foreign leagues with active/background fidelity levels, former teammates becoming coaches, persistent relationships, multiple competitions, cups/Europe/national teams, behaviour-driven PlayStyles, achievements/easter eggs and an interactive isometric decision match engine. Clubs may stockpile positions, miss replacements or buy imperfect fits; AI must not become a perfect squad optimizer.

# Prezentacja historii kariery / biografii — przyszłe TODO

Przyszłe `PlayerCard` / `CareerView` pokażą historię sezon po sezonie wyprowadzoną z
`CompletedSeasonSnapshot`: klub, występy, gole/asysty oraz dostępne ligi, trofea i nagrody.
Tekstowa biografia będzie generowaną projekcją kanonicznych `HistoryFact`, transferów, klubów,
trofeów, kamieni milowych i ważnych momentów — bez zapisywania duplikatu historii jako swobodnego
tekstu. Inspiracją jest gęstość informacji FM, nie kopiowanie interfejsu. Projekt powstanie później
po dostarczeniu referencji wizualnych; ten etap nie implementuje UI biografii.

# Następny fundament: świat akademii / U-17 i absolwenci

Obecny specjalny, abstrakcyjny pierwszy sezon Vistuli zostanie w przyszłości zastąpiony prawdziwym
światem młodzieżowym. Osobna liga U-17 obejmie niezależną Vistulę Nova oraz drużyny U-17 wybranych
polskich klubów zawodowych, w tym kilka czołowych akademii. Każdy zespół otrzyma trwałą kadrę,
złożoną początkowo głównie z kohorty szesnastolatków, ale wykorzystującą dokładnie ten sam
kanoniczny model `FootballerProfile` / `WorldFootballer` — bez osobnego typu `YouthPlayer`.

Menedżerowie, formacje, selekcja, XI, ławka i rywalizacja pozycyjna skorzystają z tych samych
ogólnych zasad co futbol zawodowy, dzięki czemu `ClubView` będzie znaczący już w pierwszym sezonie.
Rozgrywki młodzieżowe wejdą do kanonicznej architektury rozgrywek i kalendarza, zamiast tworzyć
drugi, specjalny silnik sezonu.

Na koniec sezonu klub zawodowy oceni zawodników swojej akademii. Awans do kadry seniorów uwzględni
jakość, potencjał i profil, potrzeby pozycyjne oraz politykę młodzieżową klubu — nie stałą liczbę ani
mechanicznie najwyższy OVR. Niepozostawieni zawodnicy wejdą na wspólny rynek pierwszych kontraktów:
mogą trafić do innego klubu lub niższej ligi, a część początkowo pozostać bez profesjonalnego klubu.
Niezależna Vistula Nova nie ma automatycznej pierwszej drużyny, więc wszyscy jej absolwenci, także
protagonista, szukają zatrudnienia przez te same mechanizmy ofert.

Trwali koledzy z U-17 pozostaną w świecie jako przyszli ponowni koledzy, przeciwnicy, rywale, cele
transferowe, a znacznie później potencjalni trenerzy. Po tym fundamencie coroczny nabór młodzieży
będzie uzupełniać akademie kolejnymi kohortami.

# Następne kroki

1. Akademia / świat U-17 i przepływ absolwentów.
2. Rzadki sezonowy rozwój i regres NPC.
3. Emerytury i cykliczny nabór młodzieży.
4. Niedoskonały rynek transferowy NPC.
5. Trwałość i zmiany menedżerów/trenerów.
6. Zagraniczne pakiety świata.
7. Rozbudowa rozgrywek i kalendarza.
8. PlayStyles wynikające z zachowania.
9. Osiągnięcia i easter eggi.
10. Rozbudowa stylu życia i ekonomii.
11. Interaktywny izometryczny silnik meczowy oparty na decyzjach.
