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

- `pl-2026-v2` zawiera 64 polskie kluby zawodowe i około 1536 pełnych NPC Player Model 2.0.
- Kluby przechowują identyfikatory zawodników; model to statyczna baza plus delta kariery.
- Menedżer ma preferowaną formację, a żywa siła jest wyprowadzana z najlepszej XI.
- Generator buduje konkurencję z jawnych poziomów głębi dla każdej pozycji; kształt pozycyjny
  poprzedza wariant archetypu, więc kolejność kadry nie koduje jakości.
- Kanoniczna identyfikacja wizualna dopuszcza również biały/biały.
- Pełne karty NPC są trwałe; przyszła symulacja tła pozostanie rzadka.

## Contracts/economy

Pensja protagonisty trafia co miesiąc do księgi. Oferty i negocjacje końca sezonu zachowują niezmienniki cyklu. Startowe role kontraktowe NPC wynikają z kompletnej hierarchii kadry, a rola rozwojowa jest przeznaczona dla młodych piłkarzy. Letni rynek NPC wyprowadza sezonową pojemność finansową, budżet opłat i limit płac z poziomu ligi oraz profilu klubu. Nie zapisuje konta klubu: podczas okna utrzymuje tylko roboczy bilans, a w delcie pozostawia ukończone ruchy i ich zwięzłą historię.

## Current UI

Dostępne są kreator, `PlayerCard` z pogrupowanymi atrybutami i radarem, `CareerView`, sezonowa tabela i oś oraz nowy `ClubView`: boisko formacji, XI / ławka / głęboka rezerwa, sytuacja protagonisty, konkurencja pozycyjna i wspólny podgląd kart zawodników. Tymczasowy `MatchGame` pozostaje placeholderem.

## Immediate next gameplay development

**Zrealizowano ograniczony ekonomią niedoskonały rynek transferowy NPC.** Globalna granica sezonu obejmuje
teraz coroczną graduację, rzadki rozwój/regres NPC, emerytury, ograniczony letni obieg wolnych i
kontraktowych seniorów oraz uzupełnianie kohort U-17. Kluby oglądają małe, zaszumione listy i mogą
nie wykonać żadnego ruchu; opłaty, płace i prosta zgoda sprzedającego ograniczają wybór, ale system nie optymalizuje globalnie składów ani nie symuluje pełnej księgowości.

Trwały cykl trenerów fazy 1 jest wdrożony: coroczna ocena, zwolnienia, nominacje i historia ruchów korzystają z jednej projekcji wyników.

Dalsza kolejność: (1) zagraniczne
pakiety świata, (6) rozbudowa rozgrywek i kalendarza, (7) Fitness/Morale 2.0 przed dojrzałą
warstwą silnika meczu, (8) behawioralne PlayStyles, (9) osiągnięcia/easter eggi, (10) styl
życia/inwestycje/ekonomia, (11) interaktywny
izometryczny silnik decyzji.

Wraz z trwałym rozwojem NPC i symulacją rozgrywek pojawią się tanie migawki typowego wyboru
klubów tła, przeliczane na granicy sezonu oraz po transferze, awansie z akademii, emeryturze,
zmianie trenera, ważnej zmianie dostępności lub okazjonalnym checkpointcie. Mecze tła wykorzystają
hierarchię, dostępność i małą deterministyczną rotację, co umożliwi trwałe zagregowane statystyki
sezonowe NPC (występy, starty, minuty, gole, asysty, kartki i średnią ocenę/MVP) bez pełnej historii
każdego meczu. Klub protagonisty może zachować selekcję o większej szczegółowości.

Trwały `CoachProfile` obejmuje preferowane formacje, tożsamość taktyczną, rotację, zaufanie
do młodzieży, preferencję doświadczenia, elastyczność pozycyjną, cierpliwość/wrażliwość na formę,
reputację i datę urodzenia. Profil roli wskazuje na osobną, stabilną tożsamość `Person`, a bieżące
przypisanie klubu rozwiązuje bazowy `managerId` oraz rzadki override delty. Przejściowe
`ProfessionalClub.coachYouthTrust` nie zastępuje osobistego `CoachProfile.youthTrust`.
Zatrudnianie i zwalnianie uwzględnia wyniki względem oczekiwań,
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

- Klub/trener będzie przypisywać wykonawców stałych fragmentów (karne, bezpośrednie wolne i rożne),
  co wyjątkowo pozwoli wyznaczyć także odpowiedniego bramkarza.
- Szerszy cykl życia osób powinien wyprowadzać wiek z daty lub roku urodzenia przed globalnym
  sezonowym starzeniem NPC, bez osobnego `CareerWorldDelta` tylko po to, by zwiększyć wiek każdej osoby.
- Kalibracja ekonomii elitarnych ofert/ról oraz późniejsze skalowanie opłat i płac rynku transferowego.
- Realna konkurencja zamiast abstrakcyjnych estymat roli; obecna preferowana XI jest ewaluatorem przejściowym.
- Rozbudowa trofeów/historii, trwałych kolegów, trenerów i opowieści o spotkaniach po latach.
- Reguły konfliktów kalendarza, bogatsza prezentacja historii/zdarzeń i realizm minut/zmian.
- Zastąpienie tymczasowego `MatchGame`.
- Statystyki bramkarza muszą zostać związane z kanonicznym wynikiem: przy pełnych 90 minutach
  gole stracone mają równać się golom rywala, więc 2:2 wyklucza czyste konto. xGA, strzały i obrony
  mogą być symulowane wokół tych goli; zmiany wymagają później czasu zdarzeń meczowych.
- Wszystkie kontrakty piłkarzy powinny korzystać z jednej polityki wyceny płac według jakości,
  ligi, możliwości klubu, roli, wieku i reputacji. Oferty protagonisty, rynek NPC i kontrakty
  świata startowego mogą odchylać się od wspólnej wartości oczekiwanej.

## Source-of-truth map

- Atrybuty i profil: `FootballerProfile` w `src/types/domain.ts` oraz schematy generowania w `src/core/playerCreator.ts`; prezentacja: `ATTRIBUTE_PRESENTATION` w `src/core/attributePresentation.ts`.
- Archetypy: `FOOTBALL_ARCHETYPES` i `getRankedFootballArchetypes()` w `src/core/footballArchetypes.ts`.
- OVR: `getPlayerOverall()` / `getEffectivePositionOverall()` w `src/core/playerOverall.ts`; radar: `getPlayerRadarAxes()` w `src/core/radar.ts`.
- Baza świata: generator `scripts/createCanonicalWorldDatabase.ts`, wersja i schemat w `src/core/worldDatabase.ts` oraz budowany artefakt w `.generated-public`; przyszły ręcznie tworzony content pozostanie w małych definicjach `src/content/world/`. Delta: `CareerWorldDelta` oraz resolvery w `src/core/worldDatabase.ts`.
- XI / siła: czysty `selectBestXI()` służy jakości klubu, a `deriveSquadHierarchy()` osobno wyprowadza rzeczywisty wybór trenera i `getSquadDerivedClubStrength()` siłę w `src/core/footballerWorld.ts`.
- Kontrakty: `Contract` w `src/types/domain.ts`, przepływ w `src/core/contracts.ts` i `src/core/professionalClubs.ts`.
- Kalendarz/historia: `src/core/careerCalendar.ts`, fakty `HistoryFact` w `src/types/domain.ts` i projekcja `src/core/seasonTimeline.ts`.
- Operacyjny tydzień wybiera datowane wydarzenia i mecze chronologicznie; przy tej samej dacie
  decyzja gracza poprzedza rozstrzygnięcie spotkania.
- Rozwój protagonisty: `developPlayer()` w `src/core/development.ts` i migawki w `src/core/seasonArchive.ts`; rzadka projekcja NPC i idempotentny przebieg świata są w `src/core/seasonDevelopment.ts`.

## Rzadki sezonowy rozwój NPC

Na granicy sezonu aktywny NPC efektywnego świata jest oceniany dokładnie raz. Deterministyczna projekcja używa kanonicznego `DevelopmentProfile`, wieku z `dateOfBirth`, rodzin atrybutów i środowiska klubu. Zmienia małą liczbę atrybutów, nie tożsamość, pozycję, klub ani kontrakt. Override powstaje tylko dla rzeczywistej zmiany, a marker sezonu zapewnia idempotencję. Kolejność to zakończenie sezonu i graduacja U-17, rozwój NPC, a następnie nowy sezon i hierarchia. Wiek prezentacyjny jest projekcją bieżącej daty i nie tworzy delty.

Przed proponowaniem zmian strukturalnych w nowej rozmowie projektowej/deweloperskiej przeczytaj `PROJECT_STATE.md`, `ARCHITECTURE.md` i `ROADMAP.md`.

## Fundament wieku i tożsamości

Trwałe profile generowane mają deterministyczne `dateOfBirth`; jeden helper wylicza wiek względem
daty symulacji. Legacy `age` nadal się wczytuje, lecz migracja utrwala stabilną datę urodzenia.
Graduacja U-17 ocenia wiek na granicy sezonu bez masowych override'ów. Ta sama stabilna osoba ma
w przyszłości zachować twarz, relacje i historię przy przejściu z kariery piłkarskiej do sztabowej.

# Pozycje: źródła prawdy

Świat generuje deterministycznie specjalistów i zawodników wielopozycyjnych, a profil piłkarski
przechowuje wyłącznie pozycję nominalną (`primaryPosition`) oraz wyuczone pozycje
(`secondaryPositions` i `positionFamiliarity`). Rzeczywiste ustawienie protagonisty w spotkaniu
jest osobnym, opcjonalnym faktem `SeasonParticipationRecord.assignedPosition`. Oferta zawodowa
zapisuje bieżący zamiar klubu jako `ProfessionalOffer.plannedPosition` (i najwyżej dwie wiarygodne
alternatywy), niezależnie od obiecanej `Contract.squadRole`.

## Kontekst meczów i urazów na osi sezonu

Oś sezonu oraz zwarte listy spotkań korzystają ze wspólnej projekcji prezentacyjnej udziału:
faktyczna pozycja, statystyki bramkarza, ocena i kartki pochodzą wyłącznie z kanonicznego rejestru
meczowego. `PlayerInjury` przechowuje kanoniczny typ urazu, obszar, źródło oraz datę wyleczenia;
polskie rozpoznanie jest wyprowadzane w prezentacji. Zachowanie wyleczonych urazów pozwala wiązać
historyczny brak występu z właściwym urazem bez osobnej bazy danych osi.

## Trwały świat U-17

Kanoniczna baza `pl-2026-v2` zawiera 12 trwałych kohort U-17: niezależną Vistulę Nova oraz 11
akademii powiązanych z klubami zawodowymi. Młodzież korzysta z tego samego
`WorldFootballer` / `FootballerProfile`, skali OVR i profilu rozwoju co seniorzy, ale nie należy do
ich kadr i nie ma kontraktów zawodowych. Pierwszy grywalny sezon używa realnej ligi 12 drużyn oraz tych kohort. `ClubView`, hierarchia,
rywalizacja pozycyjna i `assignedPosition` korzystają z wyborów młodzieżowego trenera. Protagonista
jest wyłącznie runtime'ową nakładką na 24-osobową kohortę Vistuli; baza pozostaje niezmienna, a zapis
nie przechowuje statycznego indeksu kohort. Na granicy sezonu wiek NPC jest wyliczany z daty urodzenia; osiągnięcie wieku 17 lat kończy kohortę U-17.
Zmiana członkostwa, awanse, pierwsze kontrakty i wolni zawodnicy są zapisywani wyłącznie w
`CareerWorldDelta`; baza i nawodnione kohorty pozostają niezmienne. Rozwój atrybutów rozwiązuje najpierw efektywnego zawodnika i zapisuje tylko rzeczywiste zmiany.

## Kanoniczna granica sezonu świata

Po ukończeniu sezonu system kolejno: archiwizuje sezon protagonisty, rozwiązuje bieżące kohorty U-17 i graduację, wykonuje rzadki rozwój NPC, rozstrzyga emerytury, tworzy kohorty następnego sezonu, stosuje rollover klubów, a na końcu inicjalizuje sezon i hierarchię protagonisty. Markery sezonowe oraz autorytatywne klucze kohort zapewniają idempotencję. Emeryci pozostają tożsamościami w delcie, lecz znikają z aktywnych resolverów i składów; tymczasowe minimum 18 seniorów chroni symulację do czasu rynku transferowego NPC.
