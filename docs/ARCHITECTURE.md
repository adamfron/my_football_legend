# Architektura

## Player Model 2.0

`FOOTBALL_ARCHETYPES` jest jedynym rejestrem archetypów: określa ich dostępność, kształtuje
atrybuty przed normalizacją OVR i dostarcza prezentację profilu. Kreator pokazuje zawsze wszystkie
archetypy dopuszczone dla wybranej pozycji, w stabilnej kolejności rejestru.

Generowanie korzysta z jawnych dodatnich i ujemnych `generationBias`; kolejność atutów
prezentacyjnych nie wpływa na liczby. Archetyp redystrybuuje wspólny budżet talentu danej pozycji
i trudności, a normalizacja zachowuje kształt profilu zamiast premiować specjalizacje wyższym OVR.
Etykieta archetypu opisuje zawodnika, nie instrukcję taktyczną. Dlatego Regista jest jedynym
głębokim kreatorem, a odwrócony boczny obrońca trafi w przyszłości do warstwy ról trenera.

`ATTRIBUTE_PRESENTATION` jest kanonicznym źródłem polskich nazw, grup i kolejności wszystkich 25
atrybutów. Rozwój korzysta z tego samego przypisania atrybutu do rodziny oraz z pojemności właściwej
rodziny, zamiast wspólnego maksimum potencjału. Warstwa Play sprawdza domenowy blocker progresji
przed uruchomieniem odtwarzania; oczekiwanie na decyzję jest normalnym stanem, nie błędem runtime.

## Warstwa prezentacji kariery

### Tożsamość wizualna klubu

Klub jest właścicielem kanonicznej, deterministycznej `ClubVisualIdentity` z kolorem
podstawowym i dodatkowym. Para jest metadanymi prezentacyjnymi, niezależnymi od siły
sportowej, i może być później współdzielona przez UI, herby oraz stroje. React korzysta
z zapisanej tożsamości (z deterministycznym fallbackiem dla starszego zapisu), zamiast
wyliczać własny kolor z ID. Biel pozostaje bielą w danych; obrys i krawędź zapewniające
kontrast są wyłącznie zachowaniem CSS.

### Semantyka osi sezonu

Etykiety zdarzeń osi pochodzą z metadanych/treści definicji wydarzenia. Stan kariery
przechowuje identyfikator, a nie wyrenderowaną polską frazę. Brak specjalnej etykiety
korzysta z tytułu wydarzenia, nigdy z ogólnego statusu implementacyjnego.

Przy braku występu oś prezentuje kanoniczny `SeasonParticipationRecord.status`, dzięki
czemu rozróżnia między innymi kontuzję, zawieszenie, ławkę i brak powołania.

Wspólna czysta projekcja udziału w meczu zasila Oś sezonu i zwarte listy spotkań. Pozycja jest
wyświetlana wyłącznie z `assignedPosition`, a kartki pozostają danymi domenowymi renderowanymi
przez dostępne wskaźniki CSS. `PlayerAvailabilityState` zachowuje aktywne i wyleczone urazy z
kanonicznym typem, źródłem, obszarem oraz granicami dat; oś wyszukuje uraz po dokładnym powiązaniu
występu albo zakresie dat, zamiast kopiować stan lub używać bieżącej kontuzji w historycznym meczu.

### Prezentacja zawodnika

Radar ma jawne semantyki migawek: aktywny sezon porównuje kanoniczny początek z bieżącymi atrybutami, a podsumowanie — zamrożony początek z zamrożonym końcem z `CompletedSeasonSnapshot.development`. Etykiety są semantyką prezentacji, nie stanem kariery. Stała paleta radaru nie zależy od barw klubu.

Style gry oraz poziomy zaangażowania są projekcjami istniejących danych `Player` i
`CareerState`; panel zawodnika nie utrzymuje ich kopii ani nie dodaje drugiego systemu
cech. Opis zawodnika pozostaje tymczasowo powiązany z profilem startowym. W Player Model
2.0 powinien stać się opisem wyprowadzanym z aktualnych atrybutów, stylów, roli i etapu
kariery. Realizm zmian minut (w tym zmian gwiazd około 70–85 minuty) pozostaje zadaniem
przyszłego projektu selekcji/minut, a nie losową korektą zakresu w tej warstwie.

## Wspólna powłoka wizualna

Kreator i Career View korzystają z jednego zwartego języka aplikacji: prostokątnych paneli,
cienkich obramowań, oszczędnego akcentu klubowego, małej typografii i subtelnych krawędzi
wgłębionych/wypukłych. Inspiracja oprogramowaniem desktopowym końca lat 90. jest wyłącznie
warstwą prezentacji i nie zmienia architektury ani balansu rozgrywki.

Kroki kreatora są komponentami funkcji w `src/app/creator`, oddzielonymi od generowania gracza w
core. Opcjonalne moduły archetypu fizycznego lub zaawansowanego kreatora mogą zostać w przyszłości
dołączone do tej powłoki bez zmiany istniejących reguł generowania. Są to punkty rozszerzeń, a nie
zaimplementowane mechaniki.

## Career View

Stały widok sezonu jest podstawową powierzchnią rozgrywki aktywnej kariery. Tabela ligi i
wyprowadzona z danych kanonicznych Oś sezonu są widoczne jednocześnie i aktualizują się wraz z
postępem kariery; nie zapisujemy osobnego modelu osi w save.

Karty zawodnika, klubu, kontraktu/finansów i historii pokazują zwarte podsumowania. Ich szczegóły
rozwijają się nad tym samym widokiem, zamiast przenosić gracza do osobnych ekranów. Na wąskim
ekranie karty przewijają się poziomo, a tabela i oś układają się w jednej kolumnie.
Jednocześnie otwarta jest najwyżej jedna współdzielona powierzchnia szczegółów; jej otwarcie nie
odmontowuje stałego obszaru tabeli i Osi sezonu. Ponowne wybranie aktywnej karty lub przycisk `×`
zamyka szczegóły.

Pensja z profesjonalnego kontraktu jest księgowana raz za każdy ukończony, objęty kontraktem
miesiąc jako idempotentna transakcja `salary` w głównej księdze finansowej. Saldo pozostaje
wyłącznie projekcją tej księgi.

Okna pierwszego planu są dopasowane do treści pod wspólną kotwicą workspace; po osiągnięciu maksymalnej wysokości przewijają się wewnątrz. Herb jest jednym statycznym komponentem zasilanym `ClubVisualIdentity`; warianty zmieniają tylko rozmiar.

## Playback i autopauza

Play/Pause jest wyłącznie stanem prezentacji i nigdy nie jest zapisywany. React odpowiada za
tempo (jeden krok co 1000 ms), natomiast `advanceSimulationStep` w core pozostaje jedynym źródłem
reguł pojedynczego, deterministycznego kroku. Szybkie przejście także korzysta z tego prymitywu.

Każda decyzja gracza zatrzymuje czas: wydarzenie, ważny mecz, aktywny mecz lub event, decyzja
transferowa/kontraktowa, koniec sezonu, emerytura oraz błąd progresji. Zwykłe wydarzenie wznawia odtwarzanie tylko, gdy to odtwarzanie spowodowało pauzę i nie pozostał blocker. Ręczna pauza, ważny mecz i koniec sezonu nie uruchamiają czasu automatycznie.

## Jedna pętla kariery

Kariera ma jeden cykl życia: utworzenie zawodnika, inicjalizacja generycznego sezonu, tygodnie kalendarza, zamknięcie sezonu, okno decyzji zawodowych i inicjalizacja następnego sezonu. Pierwszy sezon jest rozgrywką młodzieżową z powodów sportowych, a nie osobnym silnikiem fabularnym. `advanceCareerFlow` wykonuje wyłącznie bezdecyzyjne, idempotentne przejścia.

`CareerCalendarState` jest kanonicznym, widocznym dla zawodnika terminarzem sezonu. Przechowuje spotkania, datowane wydarzenia kontekstowe i bieżącą datę symulacji. `LeagueSeason` pozostaje tymczasowo autorytetem tabeli i wyników rozgrywek, a operacje domeny kalendarza atomowo synchronizują jego przyszłe daty z terminarzem i rejestrem udziału zawodnika.

### Operacyjne tygodnie i dynamiczna przyszłość

`CareerWeek` jest wyłącznie operacyjnym koszykiem dla systemów działających w rytmie tygodniowym. Nie jest właścicielem dat spotkań ani wydarzeń: jego identyfikatory są przebudowywane z kanonicznego kalendarza. Przyszłe spotkania i wydarzenia mogą być dodawane, przekładane lub odraczane wyłącznie przez jawne operacje domenowe. Wykrywają one konflikty, ale nie narzucają priorytetu rozgrywek.

Wewnątrz koszyka kolejne nierozstrzygnięte momenty są wybierane według dat z
`CareerCalendar`: wcześniejszy moment zawsze jest pierwszy, a przy tej samej dacie decyzja gracza
poprzedza spotkanie. Zawodowy koszyk obejmuje krótki, niepokrywający się okres przygotowania
zakończony datą meczu; nie tworzy to dziennej pętli ani dodatkowej osi stanu.

### Niezmienna przeszłość i projekcja osi

Zakończone wyniki, decyzje i fakty są niezmienne i nie są ponownie losowane po zmianie przyszłego terminarza. Przełożenie zachowuje identyfikator spotkania i powiązanie z rejestrem udziału oraz zapisuje semantyczny `HistoryFact`, a nie gotową narrację.

`SeasonTimeline` jest czystą, deterministycznie sortowaną projekcją kalendarza, udziału zawodnika, wydarzeń i historii. Nie jest zapisywana ani nie kopiuje statystyk meczu; wpis spotkania wskazuje jego kanoniczny `SeasonParticipationRecord`. Przyszłe systemy pucharów krajowych, europejskich i reprezentacji skorzystają z tego samego API planowania zamiast tworzyć własne kalendarze. Te rozgrywki nie są jeszcze zaimplementowane.

## Kanoniczny świat futbolu

Liga rozstrzyga pełne kolejki i przechowuje tabelę oraz wyniki jako fakty świata. `ProfessionalClub.strengthRating` jest trwałym źródłem jakości pierwszego zespołu; oceny meczowe są z niego wyprowadzane. Infrastruktura klubu, historia udziału w sezonach i archiwum sezonów nie są alternatywnymi źródłami siły.

Kontrakty, oferty profesjonalne, transfer do pierwszego klubu, kolejne okna transferowe, renegocjacje i preferencje agenta są już częścią generycznego cyklu. Przejście akademia–profesjonalny futbol wynika z wyniku sezonu i decyzji zawodowej, nie ze specjalnego faktu fabularnego.

## Narracja i wydarzenia

`HistoryFact` zapisuje kanoniczne zdarzenia, `RelationshipScores` relacje, a `StoryThread` długotrwałe interpretacyjne konteksty. Tekst lokalizowany jest prezentacją tych danych. `EventDefinition`, `EventInstance`, rejestr, deterministyczna instancjalizacja, resolver i aplikowanie rezultatu pozostają ogólną infrastrukturą dla przyszłych wydarzeń kontekstowych; nie sterują osobnym prologiem.

Cała logika `src/core` pozostaje niezależna od Reacta. Losowania przechodzą przez deterministyczny `RandomGenerator`, a dane domenowe są walidowane schematami Zod.

## Warstwa aplikacji React

`src/app/App.tsx` jest powłoką aplikacji: wybiera ekran startowy, kreator lub karierę oraz zarządza wczytaniem, zapisem i resetem kariery. Komponenty funkcjonalne w `src/app/career`, `src/app/match` i `src/app/shared` odpowiadają za prezentację poszczególnych obszarów interfejsu.

Zależności biegną od Reacta do `src/core`. Ekrany wyświetlają stan i wywołują istniejące operacje domenowe, ale nie implementują reguł rozgrywki; `src/core` nie importuje warstwy React/UI.

## Trwałość danych

Projekt jest wewnętrznym prototypem. Kompatybilność starych zapisów nie jest obecnie ograniczeniem projektowym. Zmiana architektury może podnieść wersję zapisu i czysto odrzucić wcześniejsze dane zamiast utrzymywać migracje oraz pola zapasowe.

## Dalszy kierunek

Planowane osobno są: ujednolicone rozgrywki i kalendarz, rosnąca oś sezonu, responsywny pojedynczy widok kariery oraz przyszły interaktywny silnik migawkowych momentów meczu. Nie są one jeszcze zaimplementowane w obecnej architekturze.

## Tabela ofert na koniec sezonu

Bieżący kontrakt jest stanem referencyjnym, a `ProfessionalOffer` jedynym pojęciem aktywnej oferty. Propozycja obecnego klubu pozwala ją przyjąć albo podjąć jedną próbę negocjacji; wynikowa kontroferta pozwala już tylko na przyjęcie. Oferty zewnętrzne również mają wyłącznie akcję przyjęcia. Oglądanie lub negocjowanie propozycji nie odrzuca pozostałych ofert.

Przyjęcie dowolnej oferty atomowo instaluje dokładnie jej kontrakt, zamyka wszystkie konkurencyjne oferty i renegocjację oraz dokładnie raz przechodzi granicę sezonu. Kontynuacja niezmienionej umowy jest ścieżką awaryjną tylko wtedy, gdy umowa obejmuje 1 lipca nowego sezonu i nie ma propozycji obecnego klubu. Gdy umowa wygasa, przygotowanie rynku gwarantuje co najmniej jedną deterministyczną ofertę od prawdziwego klubu z bieżącego świata. Profesjonalny sezon nie może rozpocząć się na wygasłym kontrakcie.

Nazwy encji mogą w przyszłości prezentować zwarte podglądy oparte na danych kanonicznych, bez osobnej bazy UI: dla klubu herb, ligę, siłę, reputację, pozycję i infrastrukturę, a dla osoby portret, wiek, pozycję lub rolę, znany OVR, obecny klub i istotną relację.

## Player Model 2.0

Zawodnik ma jedno kanoniczne źródło danych: 25 widocznych atrybutów (w tym cztery bramkarskie u każdego zawodnika), osiem ukrytych wymiarów osobowości oraz jawne dane obu nóg. Boisko dzieli się na dokładnie dziewięć stref. OVR pozycyjny jest wyłącznie ważonym skrótem prezentacyjnym; osobno stosowana znajomość pozycji opisuje doświadczenie w strefie bez zmiany bazowych umiejętności.

Archetyp piłkarski jest deterministycznie wyprowadzanym, rankingowanym opisem profilu, a nie zapisaną klasą. Przyszły PlayStyle pozostaje odrębną specjalizacją behawioralną. Rozwój nie ma globalnego, twardego potencjału: używa miękkiej pojemności, wieku szczytu i początku regresu dla rodzin technicznej, mentalnej, fizycznej i bramkarskiej. Trudność kariery wpływa tylko na generowanie i przewidywalność rozwoju protagonisty, nigdy na siłę świata.

# Persistent footballer world

`FootballerProfile` is the canonical Player Model 2.0 card shared by the protagonist and NPCs. The protagonist composes it with player-only preferences and career controls; `WorldFootballer` adds only persistent career status and a `DevelopmentProfile`. `CareerState.footballerWorld` is a normalized registry, while professional clubs store only `squadPlayerIds`; the protagonist is resolved directly from `career.player` and is never cloned into the registry.

Managers deterministically own one preferred evaluation formation. Live club strength is the rounded mean of the globally optimized best XI's effective positional OVR, including canonical familiarity penalties. `strengthRating` remains solely a squad bootstrap target and legacy fallback when a normalized squad is absent.

Full cards are intentionally retained at the current Polish-world scale. Derived OVR, radar and archetype scores are not persisted, and background players do not receive weekly match logs, narrative state or protagonist development simulation. Future larger worlds can keep canonical cards while using sparse seasonal development and coarser background competition simulation.

Club colours, including white/white and similar pairs, remain canonical data. Neutral outlines are derived only in presentation when contrast would otherwise disappear.

# Świat statyczny i zapis kariery

Kanoniczna baza świata jest deterministycznym artefaktem budowania, a nie formatem autorskim.
Generator łączy wersję i seed świata, proceduralne reguły oraz małe, przeglądalne definicje
źródłowe. Przyszłe definicje klubów, akademii, specjalnych piłkarzy i humorystycznych odniesień
powinny trafiać do `src/content/world/`; generator zwaliduje połączony wynik schematem Zod i zapisze
go w ignorowanym `.generated-public`. Wielki serializowany JSON nigdy nie powinien być edytowany
ręcznie ani służyć jako format authoringu.

`STATIC WORLD DATABASE + CAREER WORLD DELTA = EFFECTIVE WORLD`.

Globalna granica ukończonego sezonu ma jednego właściciela i kolejność: (1) archiwum protagonisty, (2) graduacja bieżących U-17, (3) rzadki rozwój NPC, (4) emerytury NPC, (5) nabór i kohorty następnego sezonu, (6) rollover świata klubów, (7) inicjalizacja sezonu i hierarchii protagonisty. Nowy nabór istnieje wyłącznie w `newFootballers` i `youthCohortOverrides`; emerytura zachowuje kartę osoby, zapisuje status oraz usuwa ID ze składu przez rzadki `squadOverrides`. Minimum 18 aktywnych seniorów jest jawnie tymczasowym mostem do rynku transferowego NPC, nie optymalizatorem kadry.

Kohorta U-17 jest rozwiązywana jako `youthCohortOverrides[key] ?? youthCohorts[key]`. Na granicy
sezonu każdy NPC kohorty jest postarzany dokładnie raz, a zawodnik osiągający 17 lat kończy U-17.
Obecność nakładki kohorty jest jednocześnie kanonicznym znacznikiem wykonanego przejścia. Awans,
pierwszy kontrakt lub pozostanie bez klubu zmieniają wyłącznie deltę; protagonista nie uczestniczy
w tym pipeline i zachowuje osobny przepływ ofert sterowany przez gracza.

Wyjściowe kluby, menedżerowie, składy i pełne karty Player Model 2.0 są niezmiennym,
wersjonowanym contentem gry. Seed kariery steruje zdarzeniami i przyszłą ewolucją, ale nie
odtwarza początkowej rzeczywistości. Stabilne identyfikatory są wspólne dla wszystkich karier,
a zapis przechowuje protagonistę i wyłącznie zmienione lub nowe encje. OVR, radar, najlepsza
jedenastka i siła klubu są wartościami pochodnymi, nie danymi autorytatywnymi.

Generowanie kadry używa jawnych poziomów głębi osobno dla każdej pozycji, nigdy globalnego indeksu
listy. Najpierw szeroki kształt pozycyjny nadaje profilowi także słabości, potem archetyp wprowadza
charakterystyczne wyjątki, a OVR pozycji głównej jest kalibrowany do poziomu klubu i roli w głębi.

Bazę można w przyszłości dzielić na leniwie ładowane pakiety krajów i rozgrywek oraz statyczne
kohorty młodzieży. Pełna tożsamość NPC pozostaje zachowana; bliscy NPC mogą być aktualizowani
szczegółowo, a tło będzie rozwijane deterministycznie sezonowo lub w rzadkich checkpointach,
zamiast symulacji treningu 52 razy w roku dla całego świata.

Wyjściowe profesjonalne kontrakty NPC są faktami niezmiennej bazy świata. Dopiero przyszła zmiana
umowy zapisze pełnego zawodnika w `footballerOverrides`; świeży `CareerWorldDelta` nie kopiuje tych
kontraktów. Nie symulujemy jeszcze listy płac NPC, wypłat ani obciążania budżetów klubów — księga
miesięcznej pensji protagonisty pozostaje jedyną symulacją finansową kontraktu.
Generator przypisuje początkową obietnicę kontraktową dopiero po zbudowaniu całej kadry i ocenie
realnej hierarchii. `development_player` oznacza młodego zawodnika rozwijanego przez klub, a nie
automatyczną etykietę dowolnego seniora znajdującego się głęboko w składzie.

`selectBestXI()` jest czystym, globalnie optymalnym ewaluatorem jakości używanym do wyprowadzania
siły klubu. Osobny `deriveSquadHierarchy()` modeluje niedoskonały wybór trenera: efektywny OVR i
dopasowanie pozycyjne dominują, a kondycja, stabilna preferencja i `selectionStanding` rozstrzygają
bliskie porównania. `selectionStanding` oznacza wolno zmieniające się zaufanie sztabu, a nie drugi
OVR, dlatego ma mały, ograniczony wpływ i nie odwraca dużych różnic jakości.

Status sportowy XI / ławka / głęboka rezerwa jest projekcją bieżącej hierarchii i nie pochodzi z
kontraktu. `Contract.squadRole` pozostaje obietnicą lub oczekiwaniem z chwili zawierania umowy;
obie wartości mogą celowo się rozjechać. Nowe oferty i odnowienia projektują rolę kontraktową przez
realną konkurencję pozycyjną w składzie klubu celu i formację jego trenera. Ta sama hierarchia
steruje zawodowym powołaniem oraz planowanymi minutami.

`ClubView` wyprowadza pogrupowaną XI, siedmioosobową ławkę i głęboką rezerwę wyłącznie przez
kanoniczne `deriveSquadHierarchy()`. Rywalizacja pozycyjna korzysta z tego samego ewaluatora,
a status sportowy jest opisany osobno od roli kontraktowej. Boisko i lista są projekcjami tej samej hierarchii i nie
udostępniają edycji taktyki. Jeden portal `FootballerHoverCard` rozwiązuje dopiero wskazanego
zawodnika i współdzieli `ATTRIBUTE_PRESENTATION`, radar, ranking archetypów, pozycyjny OVR,
lokalizację pozycji oraz kanoniczny kontrakt z Player Model 2.0. Nie powstają ukryte pełne karty
dla całej kadry ani osobny model prezentacyjny.

Każdy przydział XI zachowuje tożsamość indeksu kanonicznego slotu formacji; selekcja, lista i
boisko odnoszą się dzięki temu do tego samego przydziału także przy powtarzających się pozycjach.
Bramkarz i zawodnik z pola należą w normalnej selekcji do rozłącznych zbiorów kwalifikacji — dotyczy
to XI, ławki i rywalizacji pozycyjnej. Normalna siedmioosobowa ławka zawiera jednego bramkarza;
drugi może wejść tylko przy niedoborze aktywnych graczy z pola. Crossover może w przyszłości nastąpić wyłącznie przez jawną
mechanikę pozycji awaryjnej, np. po czerwonej kartce lub urazie, gdy wykorzystano wszystkie zmiany.

# Mapa źródeł prawdy dla pozycji i roli

- `FootballerProfile.primaryPosition` opisuje nominalną tożsamość piłkarską.
- `secondaryPositions` i `positionFamiliarity` opisują wyuczone możliwości; przydział meczowy ich
  nie zmienia.
- `ProfessionalOffer.plannedPosition` opisuje zamiar trenera klubu docelowego w chwili oferty.
- `SeasonParticipationRecord.assignedPosition` jest faktem o faktycznym slocie formacji w danym
  występie; brak występu oznacza brak pola, a stare rekordy bez pola pozostają poprawne.
- `Contract.squadRole` jest obietnicą kontraktową, zaś status sportowy jest bieżącą hierarchią XI,
  ławki i rezerw. Żadne z tych pojęć nie zastępuje pozostałych.

Zbiorcze użycie pozycji w sezonie jest tanią projekcją `deriveSeasonPositionUsage`, a nie
duplikowanym stanem. Nie powstaje fakt historii za każdy występ poza pozycją. W przyszłości dopiero
trwała, znacząca konwersja może stać się wydarzeniem narracyjnym lub faktem historii.

## Kanoniczne kohorty młodzieżowe

## Tożsamość, data i cykl życia

`dateOfBirth` jest kanonicznym źródłem wieku trwałej osoby; `age` pozostaje przejściowym polem
zgodności i projekcją. Wiek wylicza jeden kalendarzowy helper względem autorytatywnego
`currentDate`, bez mutowania świata wraz z upływem sezonu. Model pozostaje równaniem **statyczna
tożsamość + data + rzadka delta kariery = efektywny świat**. Migracja starych kart wyprowadza datę
deterministycznie z wieku, daty startowej i stabilnego ID, nie tworząc masowych override'ów.

Tożsamość osoby (ID, imię, narodowość, data urodzenia, twarz, relacje i pamięć narracyjna) jest
niezależna od nakładających się karier/rol. Przyszły emerytowany piłkarz będący trenerem,
asystentem lub menedżerem pozostaje tą samą osobą; stan kariery piłkarskiej i przyszłej kariery
sztabowej nie będzie wzajemnie wykluczającym polem `role`.

Początkowe kadry U-17 są trwałymi `WorldFootballer` w tej samej mapie co seniorzy, a przynależność
przechowuje sezonowy klucz `u17:<teamId>:<season>` w `WorldDatabase.youthCohorts`. Definicja
drużyny młodzieżowej przechowuje tylko stabilną tożsamość i powiązanie; nazwę, region, identyfikację
wizualną oraz środowisko akademii wyprowadza się z rodzica `ProfessionalClub`. Brak kontraktu i
`currentClubId` odróżnia członka kohorty od zawodnika pierwszej drużyny. Graduacja poprzedza sezonowy przebieg rozwoju, więc absolwent nie jest pomijany ani rozwijany dwukrotnie. Rozwój rodzin atrybutów zapisuje rzadki override; sam upływ wieku nie zmienia świata.

`CareerState.youthCohorts` jest runtime’owym widokiem niezmiennej bazy, usuwanym z zapisu i ponownie
hydratowanym razem z `clubWorld` i `footballerWorld`. `SquadSelectionContext` pozwala wspólnemu
silnikowi selekcji obsługiwać profesjonalny klub i drużynę U-17 bez tworzenia fikcyjnego kontraktu.
Grywalna Vistula projektuje 24 kanoniczne ID plus protagonistę dokładnie raz. Siła drużyn ligi jest
jednorazowo wyprowadzana z rzeczywistej XI w preferowanej formacji trenera.
