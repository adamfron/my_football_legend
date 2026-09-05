# Roadmap

## Natychmiastowa kolejność po PR77

1. Obserwowalność kadry i dostępności: sezonowa delta OVR, znacznik NEW, widoczny fitness, urazy/zawieszenia, początkowa architektura morale oraz późniejsza karta hover trenera.
2. Makrokalibracja długich karier.
3. Sandbox Single Match [DEV].
4. Vertical slice decyzyjnego izometrycznego silnika meczu.
5. Pomeczowy fitness/regeneracja i głębsza integracja morale.
6. Competition / Calendar 2.0 później.

Canonical XI, siła klubu i audyt Player Model/radaru są ukończonym fundamentem. Radar pozostaje prezentacją, OVR jakością sportową, a jedna legalna XI źródłem bieżącej siły.

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

Po ukończeniu Economy 2.0 obowiązuje kolejność:

1. **Zrealizowano:** kalibracja jakości młodzieży i rozkładu absolwentów;
2. Manager Selection / zgodność pozycji / Position Learning / rozmowa z trenerem o roli;
3. kanoniczna siła klubu oraz audyt Player Model / radaru;
4. obserwowalność kadry (sezonowa delta OVR i oznaczenie nowego zawodnika);
5. długokarierowa kalibracja makroświata;
6. deweloperski sandbox Single Match;
7. vertical slice decyzyjnego izometrycznego silnika meczu;
8. Competition / Calendar 2.0 później.

Silnik meczu nie wyprzedza stabilności populacji, kadr i rynku.

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

- dodać klubowe/trenerskie przypisania wykonawców karnych, bezpośrednich wolnych i rożnych,
  z możliwością wyjątkowego wyznaczenia bramkarza;
- wyprowadzać wiek osób z daty lub roku urodzenia przed globalnym sezonowym starzeniem NPC,
  zamiast tworzyć osobny `CareerWorldDelta` na każde proste zwiększenie wieku;
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

Later work includes compact generated-youth persistence, position learning, the interactive match-engine slice, and only then broader competitions. Clubs may stockpile positions, miss replacements or buy imperfect fits; AI must not become a perfect squad optimizer.

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

Model cyklu życia to **statyczna tożsamość + data + rzadkie mutacje kariery**. Aktualną kolejność
NEXT definiuje lista „Kolejność kolejnych dużych systemów”; starsze plany pakietów zagranicznych
nie wyprzedzają silnika meczu.

1. **Zrealizowano w PR #69:** cykl trwałych menedżerów — ocena, zwolnienia, nominacje, ograniczony ruch oraz
   przebudowa hierarchii po zmianie trenera.
2. **Zrealizowano:** trwałość proceduralnej młodzieży, rzadka nakładka stanu oraz minimalna naprawa kadr.
3. **Następne:** pozycje/rozmowy z trenerem, vertical slice meczu i Competition/Calendar 2.0.

## Zachowane przyszłe TODO (poza bieżącym zakresem)

- Minuty na faktycznie przypisanej pozycji będą zwiększać `positionFamiliarity`; próg opanowania
  pozostaje 0,75. Tempo uwzględni adaptację, profesjonalizm, wiek i zgodność pozycji, a konwersja
  bramkarz/pole pozostanie wyjątkowa. Długotrwałe opanowanie wielu pozycji może zapewnić zdobywaną
  cechę „Uniwersalny” i ograniczyć tarcie nieznanej pozycji.
- Tylko XI ma slot formacji. Ławka i głęboka rezerwa pokazują `Ust. = —` oraz nominalny OVR;
  `assignedPosition` powstaje dopiero po wejściu na boisko.
- Przyszłe przypisania stałych fragmentów obejmą karne, bezpośrednie wolne i rożne, także wyjątkowych bramkarzy-wykonawców.
- Kreator piłkarza pozwoli wybrać dzień i miesiąc urodzenia, wyprowadzając rok dla dokładnie 16 lat na starcie; przyszły kreator menedżera przyjmie pełną datę i zmienny wiek.
- Czerwona kartka materialnie obniży ocenę (bezpośrednia i druga żółta mogą różnić się karą), z zachowaniem kanonicznej chronologii.
- Jasne herby dostaną kontrastowy obrys. Ekran końca kariery przejmie język `CareerView` / `ClubView` i wykres OVR z istniejących migawek, bez duplikowania historii.
- Późniejsza kontynuacja kariery pozwoli protagoniście przejść po zakończeniu gry do roli trenera
  lub menedżera.

# Ostatnio domknięte fundamenty pozycji

- faktyczna pozycja protagonisty jest zachowywana przy każdym występie i widoczna na osi sezonu;
- oferta zawodowa ma jawny zamiar pozycyjny, niezależny od roli kontraktowej;
- przyszły bogatszy HistoryView może agregować sezonowe i karierowe użycie pozycji;
- trwała zmiana pozycji może kiedyś tworzyć kamień milowy narracji, bez spamu faktami meczowymi.

Następnym dużym systemem jest niedoskonały rynek transferowy NPC.

## Domknięty krok trwałych danych U-17

Grywalny pierwszy sezon jest podłączony do trwałych kadr, prawdziwej selekcji trenera i realnej ligi 12 drużyn. Ukończenie akademii, pierwsze kontrakty oraz rzadki sezonowy rozwój NPC są wdrożone.

- Ławka opisuje pokrycie pozycji, ale nie przydział na boisku: rezerwowy ma prezentować OVR dla
  pozycji nominalnej i otrzymuje faktyczną `assignedPosition` dopiero po wejściu na murawę.
- Czas leczenia urazów wymaga kalibracji opartej na typie, ciężkości, podatności, jakości opieki i
  ewentualnie wieku/nawrotach. Długie leczenie (np. około dwóch miesięcy po ciężkim wstrząśnieniu)
  ma pozostać możliwe, lecz nie być ogólną wartością domyślną.
- Wynik meczu stanie się jedynym źródłem goli straconych i czystego konta bramkarza; xGA, strzały,
  obrony i przyszłe statystyki zmian będą budowane wokół kanonicznych goli oraz czasu zdarzeń.
- Jedna kanoniczna polityka płac połączy oferty protagonisty, transfery NPC i kontrakty świata
  startowego, używając jakości, poziomu ligi, finansów klubu, roli, wieku i reputacji, z kontrolowaną
  wariancją indywidualnych ofert.

## Kolejność po PR78

1. PR79 — spójna obserwowalność siły, sezonowego OVR, członkostwa i ofert taktycznych.
2. Następny duży PR — makrokalibracja długich karier i audyt rozwoju na danych statystycznych.
3. Single Match [DEV] sandbox.
4. Decyzyjny, izometryczny vertical slice silnika meczu.
5. Zużycie fitness/regeneracja oraz pełny system morale.
6. Competition / Calendar 2.0.
7. Pełny przegląd krzywych rozwoju dopiero po dodaniu pucharów, Europy, reprezentacji i inwestycji.

Przyszły audyt rozwoju porówna poziom trudności ze startowym i szczytowym OVR, liczbą sezonów, meczów i minut, rozmiarem lig oraz meczami pucharowymi, europejskimi i reprezentacyjnymi, a także inwestycjami. Obecna skrócona kariera krajowa nie jest podstawą do strojenia krzywych ani dodawania trybu Very Easy.
