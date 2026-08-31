# My Football Legend — Current Project State

## Product philosophy

- Symulator kariery piłkarza, nie gra menedżerska: rutynowy futbol jest symulowany, a znaczący ma być interaktywny.
- Symulacja jest deterministyczna, a każda mechanika ma jedno kanoniczne źródło prawdy.
- Interfejs jest zwarty, inspirowany programami Windows z końca lat 90.
- To prototyp; zgodność starych zapisów nie jest istotnym ograniczeniem projektu.

## Player Model 2.0

Model obejmuje 25 widocznych i 8 ukrytych atrybutów, dziewięć stref boiska, dominującą i słabszą nogę, znajomość pozycji, pozycyjny OVR oraz radar ośmioosiowy. Rozwój działa rodzinami. Startowy OVR protagonisty wynosi w przybliżeniu: Easy 60, Normal 50, Hard 40. Istnieją profile wczesnego, normalnego i późnego rozwoju. Archetyp jest wyprowadzanym kształtem profilu; przyszły PlayStyle będzie osobną cechą zachowania.

## Current archetype design

Kanoniczny rejestr `FOOTBALL_ARCHETYPES` obejmuje profile napastników, skrzydłowych, ofensywnych i defensywnych pomocników, bocznych i środkowych obrońców oraz bramkarzy. Regista pozostał jedynym głębokim kreatorem, duplikat cofniętego rozgrywającego usunięto, a odwróconego bocznego obrońcę odłożono do warstwy taktycznej roli trenera. Generowanie ma jawne dodatnie i ujemne `generationBias`; kalibrację sprawdza `npm run audit:archetypes`.

## Club/world model

- `pl-2026-v1` zawiera 64 polskie kluby zawodowe i około 1536 pełnych NPC Player Model 2.0.
- Kluby przechowują identyfikatory zawodników; model to statyczna baza plus delta kariery.
- Menedżer ma preferowaną formację, a żywa siła jest wyprowadzana z najlepszej XI.
- Kanoniczna identyfikacja wizualna dopuszcza również biały/biały.
- Pełne karty NPC są trwałe; przyszła symulacja tła pozostanie rzadka.

## Contracts/economy

Pensja protagonisty trafia co miesiąc do księgi. Oferty i negocjacje końca sezonu zachowują niezmienniki cyklu. Startowe kontrakty NPC są trwałymi faktami świata, ale ich pensje nie obciążają jeszcze finansów klubów.

## Current UI

Dostępne są kreator, `PlayerCard` z pogrupowanymi atrybutami i radarem, `CareerView`, sezonowa tabela i oś oraz nowy `ClubView`: boisko formacji, XI / ławka / głęboka rezerwa, sytuacja protagonisty, konkurencja pozycyjna i wspólny podgląd kart zawodników. Tymczasowy `MatchGame` pozostaje placeholderem.

## Immediate next gameplay development

**NEXT: academy / U-17 world and graduation pipeline.** Realna selekcja porównuje już zawodnika
z konkretnymi rywalami w formacji trenera. Następny fundament zastąpi abstrakcyjny pierwszy sezon
trwałą ligą U-17 i kadrami w tym samym modelu `FootballerProfile` / `WorldFootballer`, a absolwenci
przejdą przez awans do pierwszej drużyny albo wspólny rynek pierwszych kontraktów. Dopiero potem
powstanie rzadki sezonowy rozwój/regres NPC, wspólny dla seniorów i akademii, a następnie emerytury
i cykliczny nabór młodzieży.

Dalsza kolejność: (1) akademia / świat U-17 i absolwenci, (2) rzadki sezonowy rozwój/regres NPC,
(3) emerytury i cykliczny nabór młodzieży, (4) niedoskonały rynek transferowy NPC, (5) trwałość
i zmiany trenerów, (6) zagraniczne pakiety świata, (7) rozbudowa rozgrywek i kalendarza,
(8) Fitness/Morale 2.0 przed dojrzałą warstwą silnika meczu, (9) behawioralne PlayStyles,
(10) osiągnięcia/easter eggi, (11) styl życia/inwestycje/ekonomia, (12) interaktywny
izometryczny silnik decyzji.

Wraz z trwałym rozwojem NPC i symulacją rozgrywek pojawią się tanie migawki typowego wyboru
klubów tła, przeliczane na granicy sezonu oraz po transferze, awansie z akademii, emeryturze,
zmianie trenera, ważnej zmianie dostępności lub okazjonalnym checkpointcie. Mecze tła wykorzystają
hierarchię, dostępność i małą deterministyczną rotację, co umożliwi trwałe zagregowane statystyki
sezonowe NPC (występy, starty, minuty, gole, asysty, kartki i średnią ocenę/MVP) bez pełnej historii
każdego meczu. Klub protagonisty może zachować selekcję o większej szczegółowości.

Przyszły trwały `CoachProfile` obejmie preferowane formacje, tożsamość taktyczną, rotację, zaufanie
do młodzieży, preferencję doświadczenia, elastyczność pozycyjną, cierpliwość/wrażliwość na formę,
reputację, wiek i etap kariery. Zatrudnianie i zwalnianie uwzględni wyniki względem oczekiwań,
reputację, DNA/politykę młodzieżową klubu, finanse, kontrakt i dostępność, a zmiana trenera wymusi
reewaluację hierarchii. Byli piłkarze będą mogli później zostać trenerami młodzieży, asystentami
lub menedżerami.

Emerytura będzie probabilistyczna i kontekstowa, zależna m.in. od wieku, pozycji (bramkarze zwykle
później), regresu fizycznego, urazów, minut, dostępnego poziomu kontraktu, reputacji, ambicji,
profesjonalizmu, gotowości zejścia ligę niżej i deterministycznej indywidualnej zmienności. Wiek 40
nie jest uniwersalną regułą; część zakończy karierę wyraźnie wcześniej, a mniejszość nieco później.
Twarde maksimum w testach jest wyłącznie bezpiecznikiem.

Fitness/Morale 2.0 powiąże minuty z narastającym zmęczeniem, zagęszczeniem terminarza, regeneracją,
wytrzymałością, wiekiem oraz środowiskiem medyczno-treningowym, naturalnie wywołując rotację.
Morale zareaguje kontekstowo na grę poza opanowaną pozycją zależnie m.in. od ambicji,
profesjonalizmu, adaptacji, minut, roli kontraktowej, zaufania trenera i czasu trwania sytuacji —
może spaść, pozostać neutralne albo wzrosnąć u zawodnika zadowolonego z samej szansy gry.

## Future match-engine concept

Silnik ma być izometryczny i decyzyjny, nie zręcznościowy: kliknięcie boiska, kolegi, rywala lub bramki wybierze cel, a radialne akcje — intencję. Atrybuty i kontekst rozstrzygną wykonanie; znaczenie będą miały słabsza noga, style i ustawienie. Rutynowe mecze pozostaną symulowane, a ważne będą mogły być rozgrywane.

## PlayStyle / achievements concepts

Style mogą wyłaniać się z powtarzanego zachowania (np. długich podań lub strzałów), z wyraźnym wydarzeniem nauczenia. Mają budować specjalizację i tożsamość, nie etykiety „+5%”. Planowane są osiągnięcia nietypowych karier i rzadkie humorystyczne easter eggi.

## Known future TODO

- Kalibracja ekonomii elitarnych ofert/ról oraz późniejsze skalowanie opłat i płac rynku transferowego.
- Realna konkurencja zamiast abstrakcyjnych estymat roli; obecna preferowana XI jest ewaluatorem przejściowym.
- Rozbudowa trofeów/historii, trwałych kolegów, trenerów i opowieści o spotkaniach po latach.
- Reguły konfliktów kalendarza, bogatsza prezentacja historii/zdarzeń i realizm minut/zmian.
- Zastąpienie tymczasowego `MatchGame`.

## Source-of-truth map

- Atrybuty i profil: `FootballerProfile` w `src/types/domain.ts` oraz schematy generowania w `src/core/playerCreator.ts`; prezentacja: `ATTRIBUTE_PRESENTATION` w `src/core/attributePresentation.ts`.
- Archetypy: `FOOTBALL_ARCHETYPES` i `getRankedFootballArchetypes()` w `src/core/footballArchetypes.ts`.
- OVR: `getPlayerOverall()` / `getEffectivePositionOverall()` w `src/core/playerOverall.ts`; radar: `getPlayerRadarAxes()` w `src/core/radar.ts`.
- Baza świata: generator `scripts/createCanonicalWorldDatabase.ts`, wersja i schemat w `src/core/worldDatabase.ts` oraz budowany artefakt w `.generated-public`; przyszły ręcznie tworzony content pozostanie w małych definicjach `src/content/world/`. Delta: `CareerWorldDelta` oraz resolvery w `src/core/worldDatabase.ts`.
- XI / siła: czysty `selectBestXI()` służy jakości klubu, a `deriveSquadHierarchy()` osobno wyprowadza rzeczywisty wybór trenera i `getSquadDerivedClubStrength()` siłę w `src/core/footballerWorld.ts`.
- Kontrakty: `Contract` w `src/types/domain.ts`, przepływ w `src/core/contracts.ts` i `src/core/professionalClubs.ts`.
- Kalendarz/historia: `src/core/careerCalendar.ts`, fakty `HistoryFact` w `src/types/domain.ts` i projekcja `src/core/seasonTimeline.ts`.
- Rozwój: `developPlayer()` w `src/core/development.ts` i sezonowe migawki w `src/core/seasonArchive.ts`.

Przed proponowaniem zmian strukturalnych w nowej rozmowie projektowej/deweloperskiej przeczytaj `PROJECT_STATE.md`, `ARCHITECTURE.md` i `ROADMAP.md`.
