# PR172 — Match Realism: poprawność, rzeczywiste decyzje i fizyczne kontakty

Baza: scalony PR171, `6b2ddaa9ae14c2ca98a078b85b69b202b812196f`.
Zmierzony końcowy kod kanoniczny: `ea7fc0ae71e8b95e34516f89ef52eb7a1d24960af52f9fa8f6998ea563512003`
(SHA256 według istniejącego `benchmarkPr171.ts`, normalizacja CRLF, bez testów).
`baseCommit` w receiptach oznacza rodzica mierzonego drzewa roboczego; jego zawartość identyfikuje `sourceHash`.

**Wynik mechaniczny: 16/16 pełnych meczów, 0 awarii, 0 cenzorowanych przebiegów.**
PR171 miał 12 pełnych, 2 awarie i 2 przebiegi bez końca. Również wszystkie cztery
oryginalne zapisane stany dochodzą do full time. Futbol nadal ma za dużo recyklingu
i mało groźnych ataków. Nie przedstawiamy wzrostu 14→21 strzałów jako rozwiązania realizmu.

Końcowy `npm run verify`: **PASS — 1840 testów**, lint, TypeScript i build produkcyjny.
Pełny kontrakt kariery U-17 i senior obejmuje ludzkie decyzje, wynik, zapis/odczyt,
odrzucenie duplikatu i przejście kalendarza. [Receipt weryfikacji](performance/PR172-verification.json).
Test rzeczywistego interfejsu w Edge został zatrzymany przez kontrolę Computer Use:
narzędzie nie potrafiło wiarygodnie ustalić aktualnego URL. Brak dowodu końcowego smoke
produkcyjnej przeglądarki; ten element wymaga ręcznego przeglądu. Testy DOM, renderera,
kanonicznych kontraktów kariery i numerycznych projekcji są raportowane osobno.

## Przygotowanie i zachowanie dowodów

Przejrzano PROJECT_STATE, ROADMAP, MATCH_BEHAVIOUR_CALIBRATION, raport PR171, wszystkie
14 plików `PR171-*.json`, raporty PR162/163/168 oraz istniejących właścicieli restartów,
zmian, pozycji, podań, strzałów, kontaktu i agency. Nie dodano nowego systemu telemetrycznego.

[Manifest bazowy](performance/PR172-baseline-manifest.json) zachowuje rewizję, SHA256 każdego
historycznego receiptu i dokładnych czterech stanów. Oryginalne pliki PR171 pozostają identyczne
bajtowo. Kompletne stany wejściowe skompresowano w `performance/pr172-states/`; nie są to
rekonstrukcje podobnych sytuacji. Seedy, profile, formacje, style, ustawienia diagnostyczne,
fixtureHash i dt=0,025 s pochodzą z niezmienionego `pr171Fixtures.ts`.

Kolejność wykonania: A — poprawność zmian, muru, zegara i kickoff; B — odbicia;
C — rzeczywiste zamrożone decyzje i pojedyncze kontrfakty; D — kontakt i tożsamość strzału;
E — intencja carry i ograniczony UX; F — pełna powtórka, deterministyczność, koszt, verify.
Gate A ukończył sześć pełnych meczów strong_weak/central_possession/press_low w obu
orientacjach, zanim wdrożono dalsze zmiany zachowania.

## A. Zmiana bramkarza, mur i czas

### Przyczyna obu awarii

Podczas fizycznego wejścia nowego GK emergency `goalkeeperRole` nadal należało do zawodnika
pola. `advanceMatchSubstitutions` przeliczało geometrię przed późniejszym `ensureMatchGoalkeepers`.
Geometria usuwała obu keeperów z grupy pola, ale przydzielała punkt jednemu; `spreadCluster`
odczytywało nieistniejący punkt drugiego. Naprawa uzgadnia role po zaktualizowaniu aktywnego
składu, przed wyborem zastępczego takera i geometrią. Nie dodano pozycji awaryjnej maskującej błąd.

Jednotickowe regresje sprawdzają obie dokładne próbki, pojedynczego aktywnego keepera, cele
wszystkich uczestników, brak duplikatów/teleportacji/powrotu zmienionego gracza i deterministyczny
reload. W odwróconej próbce drugi gracz pola legalnie dopiero wchodzi: liczba aktywnych wynosi
`11 − liczba oczekujących wejść`, a nie arbitralnie 11 w każdej przejściowej klatce.
Istniejące testy emergency keeper, zmian, urazów i rzutu karnego pozostają obowiązujące.

### Przyczyna obu `wall_developing`

Cele ściany prostopadłej do kierunku piłka–bramka były niezależnie przycinane przy linii
końcowej. W press_low dwa cele miały x=104,6 i odstęp około **0,092 m**; w drugim stanie
skrajny odstęp również spadał poniżej fizycznego 1,15 m. Separacja ciał stale wypychała
graczy; prędkość około 0,65 m/s nie spełniała gotowości ≤0,5 m/s. Nie była to decyzja człowieka.

Cała ściana przesuwa się teraz wzdłuż swojej stycznej, zachowując odstępy 1,3 m. Pozostają
projekcje ograniczeń prawnych i zwykły ruch z przyspieszaniem/hamowaniem. Wadliwy stary plan
jest naprawiany raz przez tę samą konstrukcję celów; nie zmienia to ciał, piłki, award ID ani
wybranej ludzkiej akcji. Naprawa jest idempotentna. Testy obu rzeczywistych stanów potwierdzają
legal readiness przed wykonaniem, brak teleportacji i ograniczone osiągnięcie release.

W Gate A dokładne cenzorowane restarty zwalniały po **0,550 s** i **1,475 s** od zapisanej
klatki 7200 s. Końcowe cztery kontynuacje mają osobne `PR172-after-recovery-*.json`;
wcześniejsze wyniki zachowano jako `PR172-gate-a-recovery-*.json`.

### Zegar: naprawiono przyczynę oczekiwania, nie skasowano straconego czasu

`qualifyingStoppageSeconds` prawidłowo liczy unię kwalifikowanych przerw i allowance zwykłego
wznowienia. W zapętlonej geometrii aktywna przerwa rosła wraz z każdą sekundą, więc zegar
prawidłowo widział stale rosnący stracony czas. Błędem była nieosiągalna konfiguracja muru.

Nie zmieniono polityki doliczenia, nie dodano maksymalnego czasu ani automatycznego release.
Po osiągalnym legalnym wykonaniu interwał się zamyka i przestaje przesuwać deadline. Oryginalna
historia przerwy pozostaje: kontynuacja central_possession od 7200 s kończy się dopiero przy
**12283,875 s**, a press_low przy **7381,500 s**. Nowe pełne fixtures nie dziedziczą tego
historycznego wielogodzinnego oczekiwania. Nie obcięto starych receiptów do sztucznego 90 min.

Regresje `pr172Mechanical`, istniejące `pr160Timekeeping`, human restart i terminal penalty
sprawdzają legalne warunki, rozdzielenie prawdziwej decyzji człowieka, skończone przygotowanie
i brak nowej pętli. To dowód dla odtworzonych stanów i zmierzonej kohorty, nie formalny dowód
terminacji wszystkich matematycznie możliwych stanów silnika.

### Bramkarze po przerwie

Legalna własna połowa nie jest gotowością taktyczną. Przy live kickoff osobna gotowość wymaga
obu realnych keeperów na głębokości ≤9 m od własnego końca i ≤5 m od środka bramki. Jest to
istniejący plan głębokości 5,5 m z jego strefą wsparcia i tolerancją hamowania. Ruch pozostaje fizyczny.
Nie odblokowuje się przedwcześnie `awaiting_decision` ani autoryzacja wykonania.

Kontrolny halftime: zgodność z Law 8 występuje po 22,750 s, gdy jeden GK ma jeszcze głębokość
48,102 m. Ludzki kickoff otwiera się dopiero po **44,850 s**, z keeperami na **8,569 i 8,992 m**.
Ceremonia szatni nie steruje piłką ani wynikiem.

## B. Odbicia i rzeczywiste rożne

`findFirstBallContact` zwraca normalną dokładnie tej sfery/kapsuły i pozycji w swept CCD,
która spowodowała kontakt. Dla kapsuły używany jest najbliższy punkt na jej osi.
Odbicie rozdziela składową normalną i styczną. Współczynniki normalna/styczna:
block **0,38/0,72**, parry **0,30/0,60**, parry-away **0,52/0,74**, partial/failed-save **0,12/0,86**.
Energia translacyjna nie rośnie; usunięto sztuczną minimalną prędkość 5 m/s. Oddalający się
overlap nie odbija piłki ponownie w ciało.

Model dłoni nie istnieje. Parry-away jest jawnym przybliżeniem płaszczyzny ręki: ograniczone
odchylenie normalnej na zewnątrz od środka bramki, bez gwarancji bezpiecznego wyniku. Catch
zatrzymuje piłkę przez istniejący resolver; umiejętności i losowanie catch/parry są niezmienione.
Brak normalnej w historycznym kontakcie daje przeciwną do nadlatującej piłki płaszczyznę,
a nie stały znak X. Kontekst pełnej orientacji przechodzi przez kontakt strzału, kolejne luźne
odbicia i ocenę wariantów wolnego.

[112 kontaktów CCD](performance/PR172-deflection-physics.json): po 28 block/parry/parry-away/partial,
obie drużyny i połowy. Składowa w stronę atakowanej bramki pozostaje w 16/28 block, 16/28 parry,
8/28 parry-away i 16/28 partial. To celowa siatka kontaktów i nieosłonięte kontynuacje, nie
populacyjna częstość saves lub corners. Próby energii i symetrii są w `pr172Rebounds.test.ts`.

Dwa testy przeprowadzają rzeczywisty glancing defender contact przez produkcyjne CCD,
odbicie, ostatnie dotknięcie i przekroczenie linii do canonical corner. Nie wpisują rożnego
do statystyk ręcznie. Oddzielne 72 przepisane próby PR171 nadal dają początkowe wyniki kontaktu
35 save, 3 goal, 22 block, 12 miss; trajektorie i późniejsze granice są osobnymi polami.
Właściciel shot ID, last touch i restart laws pozostaje dotychczasowy.

## C. Rzeczywiste decyzje i odrzucone zmiany taktyczne

Zapisano **40** naturalnych stanów z central_possession, wide_direct i youth_native:
obrona, środkowy build-up, attacking midfield, szerokość, kontra, ostatnia tercja oraz poprzednik
straty. Każdy ma pełny stan, role/formację/taktykę, presję, wszystkie wygenerowane akcje,
ranking z seed-derived noise, rozkład członów oceny podań, reception forecast, faktyczne wykonanie
i pięciosekundową kontynuację. Archiwa są w `performance/pr172-decisions/`.

Opt-in Node loader instrumentuje istniejący `chooseNpcAction`/`chooseIncomingShotAction` i
czysty scorer tylko w runnerze badawczym. Nie jest importowany przez produkt, save ani worker
zwykłej kariery. Nie dodaje RNG, pola zapisu lub produkcyjnego observera per physics tick.

[267 kontrolowanych kontynuacji](performance/PR172-tactical-experiments.json) porównuje w tym samym
stanie: zwycięzcę, najwyższe wygenerowane podanie progresywne, najlepsze podanie do CM,
techniczną jakość odbiorcy 50/90, pozycję CM przesuniętą o 2 m od najbliższego markera oraz
sam nominalny slot. Zmieniano jeden czynnik naraz. Wszystkie 40 wierszy wraz z wynikami
kontynuacji odtworzono identycznie na niezmienionym PR171 — nie tylko końcowe sumy.

| Eksperyment | Kontrola | Kontrfaktyczny wybór / stan | Wniosek |
| --- | --- | --- | --- |
| Progressive action, 27 par | Średnio 5,789 m maksymalnej kontrolowanej progresji, 9 strat, 0 final presence | 12,400 m, 10 strat, 2 final presence, 0 box w obu | Warto badać, lecz nie dowodzi bezpiecznej uniwersalnej premii |
| Central action, 40 par | 10 strat, 6 final presence | 12 strat, 1 final presence | Automatyczny wybór CM nie jest uzasadnioną naprawą |
| Jakość techniczna 50/90 | Ta sama geometria i przeciwnicy | Zmiana zwycięzcy w 2 / 5 stanach | Odbiorca jest oceniany; nie dowodzi to braku rozpoznania jakości |
| Przesunięcie wsparcia 2 m, 40 par | Średnia progresja 5,522 m | 4,708 m; 11 strat wobec 10 | Sam pozornie otwarty punkt nie gwarantuje lepszej kontynuacji |
| Nominalny slot | Te same atrybuty i fizyka | Brak zmiany zwycięzcy w 40 stanach | Drobne różnice punktów pochodzą z istniejącej oceny składu/taktyki, nie target bonus |

`finalEntry`/`boxEntry` we wczesnym receipcie kontrfaktycznym oznaczają **kontrolowaną obecność
w pięciosekundowym oknie**, także gdy atak zaczynał się już wysoko. Nie są tym samym co
`final_entry`/`box_entry` autorytatywnego lejka; raport porównawczy nazywa je `finalPresent`/`boxPresent`.

Wsparcie, depth runs, bezpieczne centralne opcje, szerokość i rest defence są zachowane w
każdym stanie. Przesunięcie odbiorcy jest hipotetycznym endpointem, nie dowodem, że nowa polityka
ruchu go tworzy. Nie wdrożono zmian tacticalPositioning, passDecision, wag progresji/retencji,
agresji ani bonusu nominalnego CM. Przyczyny niskiego udziału CM pozostają złożone. Nie
wyciągamy uniwersalnego wniosku z dwóch bliskich stanów, nazwy formacji lub jakości 50/90.

## D. Okazja, wybór i kontakt strzału

W 40 wczesnych stanach okazje były non_viable. Osobny pełny przebieg zapisał rzeczywiste
wiarygodne odrzucenia strzału przy 3154,575/3154,850 s i dwa wybrane wykończenia incoming
przy 3306,175/4881,675 s. Zapisano aktualną akcję i faktyczny shot ID po kontakcie:
`pr171-b:central_possession:shot:1572:footballer_pro_10_22` oraz
`pr171-b:central_possession:shot:2293:footballer_pro_10_19`. To obserwacje po Gate B;
nie są dodatkową niezależną kohortą.

Odrzucone placed shots miały około 3,39/5,33 punktu wobec carry 37,79/35,04. Rozróżnienie
szansy, presji, ustawienia ciała, przygotowania i innych opcji nie dowodzi nieprawidłowego
odrzucenia. Nie podniesiono shot utility. Wszystkie 11 kontrolowanych kontekstów i oba
seedy PR171 zachowano, łącznie z long-range, first-time, cutback, 2v1 i zamkniętym blokiem.

**Potwierdzony błąd wykonania:** `settled` sprawdzało nominalnego ownera i wysokość, ale
nie zasięg kopnięcia. Pushed-ball z piłką około 2,8 m od ciała mógł od razu wystrzelić.
Opcje i ponowna walidacja korzystają teraz z istniejących realnych stóp i footReach z
`playerContactGeometry`. Nie dodano nowego promienia ani przyciągania piłki. Preview wyboru
wznowienia może nadal poprzedzać placement; fizyczny release jest sprawdzany ponownie.

Kandydat strzału ma deterministyczną oczekiwaną tożsamość następnej decyzji; accepted/contact/
released dla zwykłego kanonicznego kick są jedną transakcją. Resolver zachowuje ten sam ID
podczas wyniku i odbić. Incoming ma ponowną weryfikację przy kontakcie; pozbawiony kontaktu
lub przechwycony strzał zostaje odrzucony bez release, zmiany wyniku lub dopisania statystyk.
Nie dodano fikcyjnego asynchronicznego etapu przygotowania ani gwarancji wykonania.

## E. Intencja człowieka i celowanie

Pościg za własnym, fizycznie odzyskiwalnym wypchnięciem nie jest sam w sobie `heavy_touch`
wymagającym nowego menu. Osiągnięcie body waypoint nie kończy carry przed odzyskaniem piłki.
Kontakt, przeciwnik, out, nieosiągalność, wygaśnięcie i świadomy nowy zamiar nadal unieważniają
lub zastępują intencję. Ważne strefy, nowa okazja strzału, presja i defender angle pozostają
granicami decyzji. Próba usunięcia zone boundary została odrzucona: naruszała uzgodniony
kontrakt agency i stare regresje; końcowy kod zachowuje go.

Dziewięć pełnych prób pozostaje opt-in. Straight: błędny prompt heavy_touch 1,450 s znika;
następny prawdziwy attacking_zone występuje po 1,550 s. Destination-reached czeka do 3,525 s
zamiast 2,050 s. Presja nadal otwiera decyzję po 1,275 s jako possession_contested. To
ograniczona poprawa semantyki, nie dowód populacyjnego spadku strat lub wszystkich promptów.
Cztery dodatkowe rzeczywiste geometrie z aktywowanym human ownership mają te same istotne
granice i fizyczne kontakty przed/po; nie ukrywamy braku poprawy w tych czterech przypadkach.

Renderer już obsługiwał wybór goal point w poziomie i wysokości przed techniką. Dodano
oddzielne potwierdzenie: **bramka/punkt → technika → Wykonaj strzał**. Zmiana celu nie
wykonuje akcji; anulowanie i Escape nie kopią piłki. Zniknięcie techniki blokuje potwierdzenie.
Marker, world-goal projection, oba kierunki, suwaki klawiatury i aktualny target/endsSwitched
używają istniejących kontraktów. Cel nadal podlega błędowi wykonania i fizyce. Nie przebudowano renderera.

## F. Porównanie statystyczne

Wszystkie 16 fixtures po zmianach są zachowane. **Tabela niżej porównuje tylko te same
12 wcześniej pełnych meczów, 24 zależne obserwacje zespołu**; początkowe hasze i fixtureHash
są identyczne. Cztery odzyskane fixtures są osobno w [comparison](performance/PR172-comparison.json),
a pełny nowy zbiór w [after-baseline](performance/PR172-after-baseline.json).

| Metryka w dopasowanych 12 meczach | PR171 | PR172 |
| --- | ---: | ---: |
| Podania / ukończenia | 26101 / 23010 | 25853 / 22767 |
| Średnia podań na zespół | 1087,54 | 1077,21 |
| Średnia ukończeń % / zespół | 86,129% | 86,175% |
| Forward / lateral / backward | 7448 / 6638 / 12015 | 7481 / 6536 / 11836 |
| Podania na sekwencję, średnia | 8,962 | 9,021 |
| Kontrolowane sekwencje | 3041 | 3001 |
| Final-third / penalty-area entries | 561 / 34 | 567 / 39 |
| Wiarygodna pozycja — sekwencje | 19 | 31 |
| Próbkowany wykonalny shot — sekwencje | 1002 | 730 |
| Ranking samples z shot / shot poniżej pass | 1488 / 746 | 1003 / 428 |
| Zaobserwowane wybrane / fizyczne strzały | 14 / 14 | 21 / 21 |
| Celne / blocks / saves / gole | 13 / 0 / 5 / 8 | 19 / 1 / 6 / 13 |
| Rożne | 3 | 3 |
| Przyjęcia CM / udział ukończeń | 3316 / 14,411% | 3356 / 14,741% |
| Carry / straty posiadania | 3444 / 2849 | 3517 / 2798 |
| Próby / wygrane tackle; interceptions | 1715 / 683; 1349 | 1721 / 669; 1302 |
| Łączny elapsed / live / stopped, sekundy meczu | 66704,15 / 63286,875 / 3417,275 | 67007,625 / 63082,875 / 3924,750 |

Mean/median/P10/P90/min/max/SD, histogramy sekwencji, role/minuty, sieci, turnover causes,
per-period counters, individual shot outcomes i wszystkie paired deltas są w JSON.
Lejek `shot` liczy sekwencje, a fizyczne strzały liczy ledger: 9→16 sekwencji nie jest
sprzecznością z 14→21 release. Nie utożsamiamy próbek rankingu ze wszystkimi faktycznymi wyborami.

Wyniki są mieszane. Box access wzrosło o pięć epizodów, ale passes/possession wzrosło,
live time spadło o 204 s, stopped time wzrosło o 507,475 s, a tackle wins/interceptions spadły.
Recykling i rzadkie okazje pozostają. Wzrost CM wynika ze zmienionego przebiegu rzeczywistych
meczów po poprawkach mechanicznych, nie z premii pozycji. Nie rozdzielono wkładu każdej
naprawy w kohortowy wzrost goli; nie należy przypisywać go wyłącznie poprawie taktyki.

Dokładny rozkład czasu każdego restartu pełnej kohorty nie był zachowany w PR171. Dostępne
są porównywalne live/stopped, dokładne oryginalne blokady oraz pięć kontrolowanych restartów.
Nie dorobiono nieistniejącego mianownika. Human frequency w spectator cohort jest zerem
z konfiguracji; dziewięć kontrolowanych i cztery naturalne geometrie raportujemy osobno.

Ponownie użyto zamrożonej referencji StatsBomb MŚ 2022, commit
`4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`, te same 12 meczów i SHA256. Różnice definicji
z PR171 obowiązują. Brak odpowiedniej referencji młodzieżowej; średnie elitarne nie są celami MFL.

## Determinizm, koszt i weryfikacja

Dwa pełne U-17, obie orientacje: identyczny **cały stan kanoniczny** z observerami i bez:
`6f5f1dc860ee700f4d37a3a4daa09c0ac4715498e73e131d54d8e986f02d2851` oraz
`d81845503adc1040a19e2bc294e6b2eb6ada9d6ec899e29e85fecd1331559afa`.
Kontynuacje dokładnych czterech stanów wielokrotnie porównują następny krok po schema-validated
save/reload, po normalizacji kolejności kluczy i odrzuceniu nadmiarowych właściwości diagnostycznych.
Nie pomija się żadnego pola z kontraktu stanu.
Krótka próba finalnego Node loadera decyzji (central_possession, 60 s) również daje
identyczny cały stan jak plain i istniejące observers. Zakresy i hashe są w
[receipcie deterministyczności](performance/PR172-determinism.json); nie jest to pełny mecz z loaderem.

Seryjny, spokojny pomiar CPU: po rozgrzaniu, po trzy 60-sekundowe próbki/tryb/rewizję,
ten sam fixture, naprzemienna kolejność silników, Node 24.19.0. Mediany:

| Tryb / 2400 ticków | PR171 | PR172 |
| --- | ---: | ---: |
| Bez research observers | 1257,01 ms | 1320,95 ms |
| Istniejące observers | 1578,31 ms | 1648,21 ms |
| Z rozszerzonym audit | 1608,36 ms | 1629,94 ms |

Plain CPU wzrasta około **5,09%**, przepustowość około 1909→1817 tick/s. To mała próba
krótkich okien, nie FPS ani izolowany koszt pojedynczej funkcji. Różnica extended/existing
w PR172 jest ujemna w tej próbie: nie nazywamy jej przyspieszeniem. Wszystkie tryby zachowują
całkowitą zgodność stanu. Rzeczywiste czasy zakończenia wszystkich pełnych meczów są w receiptach,
ale konkurujące procesy i verify nie pozwalają na porównanie tych wall times jako wydajności CPU.
Nie dodano produkcyjnego przewidywania całego boiska ani research traces w zapisach kariery.

Końcowy verify: **PASS**, 1779 testów głównych + 52 integracyjne + 4 kontraktu kariery
+ 5 pełnej kariery = **1840**; lint i build przechodzą. Dodatkowe skrypty PR172 przechodzą
ścisłą kontrolę TypeScript. Dwa wcześniejsze nieudane przebiegi obejmowały timeout
nowej zbyt ciężkiej próby w default CI oraz timeout istniejącego testu
pełnej połowy przy równoległych benchmarkach. Nie zmieniono timeoutów, workerów ani starych
asercji. Ciężkie dziewięć badań carry ma oddzielny opt-in runner; CI sprawdza ich krytyczne
przejścia. Końcowy verify wykonano bez procesów badawczych.

## Odpowiedzi odbioru

| # | Odpowiedź i dowód |
| --- | --- |
| 1–2 | Oba strong_weak kończą; konflikt usunięty przy zmianie składu przed geometry, nie fallbackiem. One-tick i pełne receipts. |
| 3–6 | Oba cenzorowane kończą; mur był fizycznie spakowany przez clamp. Osiągalny legalny release zamyka ledger; nie ograniczono praw ani doliczenia. |
| 7–10 | Pełna orientacja, rozróżnione normal/tangent/parry, naturalny corner po kontakcie, zachowane shot ID i ledger. 112 kontaktów, 72 próby, regression suites. |
| 11 | Potwierdzono gęsty realny obieg i mało groźnego dostępu; nie dowiedziono jednego wadliwego członu utility. Dodatkowo potwierdzono remote settled shot. |
| 12–14 | 40 realnych frozen states i 267 kontrfaktów przed korektą kontaktu. Brak zmian wsparcia/rankingu; odrzucono ogólną premię progresji, CM i sam endpoint displacement. |
| 15–17 | CM 3316→3356 i 14,411→14,741%; final 561→567, box 34→39. Brak target boost; przyczyna konkretnej zmiany udziału nie jest rozdzielona od przebiegu meczu. |
| 18–19 | Dwa wiarygodne odrzucenia nie uzasadniły podbicia utility. Wykazany defekt to kick bez zasięgu. Candidate/selection/contact/release/outcome łączą się deterministycznym ID; incoming śledzony przy kontakcie. |
| 20 | Fizyczne bloki, catches, parries, tackles i interceptions działają; nie osłabiono parametrów obrony. Rozkład cohort jest mały i zmienny. |
| 21–22 | Znika prompt własnego odzyskiwalnego stride i przedwczesne ukończenie waypoint. Presja nadal promptuje; cztery naturalne przykłady nie wykazały spadku promptów. |
| 23 | Przed autoryzacją live kickoff obaj keeperzy spełniają osobną gotowość; kontrola 8,569/8,992 m. |
| 24 | Wykorzystano istniejący goal picker/height; dodano jawne potwierdzenie po technice. Browser smoke zablokowany przez narzędzie; nie deklarujemy jego zaliczenia. |
| 25–27 | Pełne liczby i regresje w tabeli/JSON; brak wymuszonych wyników. Pas/sekwencję i stopped time wzrosły, tackle wins/interceptions spadły. |
| 28 | Seryjne plain CPU +5,09%, nie przyspieszenie; osobny koszt observerów i caveat wall times. |
| 29 | Oryginalne 14 plików PR171 identyczne; wszystkie seedy/fixtureHash zachowane; 40/267 odtworzone dokładnie na PR171. |
| 30 | Nadal: nadmierny recykling, rzadkie groźne pozycje i rożne, ograniczone reference U-17, brak causal policy fix dla CM, brak browser smoke. |
| 31 | Poprawki stabilizują podstawę PR173/174. Nie wolno traktować tych skąpych rozkładów jako gotowego celu kalibracji summary; roadmapa pozostaje. |

## Odtworzenie

`npm ci`, `npm run generate:world-db`. Baseline do izolowanych badań (osobna kopia,
nie nadpisywać historycznych receiptów):

```text
git worktree add --detach ../pr171-baseline 6b2ddaa9ae14c2ca98a078b85b69b202b812196f
npm --prefix ../pr171-baseline ci
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr172Tactics.ts --engine-root=../pr171-baseline --output=../pr172-reproduced-tactics.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr172Probes.ts --engine-root=../pr171-baseline --stage=before --output-dir=../pr172-before-replay
```

Końcowy kod i te same seedy:

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr172Recovery.ts --stage=after
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr172Physics.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr172Probes.ts --stage=after
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr171.ts --output-dir=../pr172-final
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr171.ts --families=senior_balanced,wide_direct --replicate=extra-a --output-dir=../pr172-final
node scripts/summarizePr171.mjs --input-dir=../pr172-final --receipt-prefix=PR172-after --minimum-matches=16
node scripts/comparePr172.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr171.ts --mode=confirm --families=youth_native --output-dir=../pr172-final
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr172Human.ts --baseline-root=../pr171-baseline
```

Po zatrzymaniu innych obciążeń: `benchmarkPr172Performance.ts --baseline-root=../pr171-baseline`
z tym samym Node loaderem. Rejestracja rzeczywistych nowych decyzji: zamiast zwykłego loadera
`--import ./scripts/registerPr172DecisionObserver.mjs scripts/capturePr172Decisions.ts
--family=central_possession --seconds=900 --tag=nowy-pomiar`. Dla incoming: `--seconds=7200 --shots-only`.
Nowe po pomiarze poprawionego kontaktu rankingi mogą różnić się od historycznych; oryginalne
archiwa i eksperymenty odtwarza się na PR171, nie żąda identycznego przebiegu po zmianie fizyki.

Bramka: `npm run verify`. Research cohorts nie są dodane do default CI.

Po przygotowaniu surowych wyników polecenie
`node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/reportPr172.ts`
sprawdza zachowanie archiwów, pełne hashe observer ON/OFF, identyczność 40 kontrfaktów,
save/reload i końcowy log verify; tworzy receipts weryfikacji i deterministyczności.
Ścieżki wyników można podać przez `--raw-dir`, `--verify-log` i `--tactics-replay`.
Krótki parity input wymaga `benchmarkPr171.ts --mode=equivalence --families=central_possession --seconds=60 --output-dir=../pr172-observer-final`
oraz capture z loaderem, `--family=central_possession --seconds=60 --tag=parity --output-dir=../pr172-hook-parity`.

## Roadmapa i ograniczenia dostarczenia

PR173: generacje i siła świata; PR174: summary/PlayStyles i spójna księga udziału/zmian;
PR175+: rozszerzanie świata. Zwarta historia sezonu, archiwum i kalendarz pozostają późniejszym UX.
Nie zmieniono wzrostu NPC, transferów, emerytur, lig, lekkiego silnika ani nabywania PlayStyles.
PR dostarcza poprawki mechanik i odtwarzalne badania; dalsza kreacja ofensywna i ręczny smoke UI
pozostają jawnymi ograniczeniami, a nie zadeklarowanymi sukcesami.
