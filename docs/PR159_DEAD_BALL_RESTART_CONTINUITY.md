# PR159 — Dead Ball & Restart Continuity

Baza: scalony PR158, `main`, `a7c90299c01c080eb356fe88e0ef47d4a7b1f639`.
Status: implementacja i wymagana walidacja zakończone; zmiana przygotowana do
przeglądu jako draft PR. Kod dowodów: `6e303b97eb1d82685f206fd1aea5dd5aeea5969a`,
tree `2d8bce620269164141d95726323d5d032408590e`. Dokumentacja i wyniki pomiaru
są osobnym kolejnym commitem, bez zmiany zweryfikowanego kodu.

## Zmiana zachowania

Naturalny gwizdek tworzy award z niezmiennym punktem zdarzenia i legalnym miejscem
wznowienia. Zachowuje aktualną piłkę, pozycje i prędkości zawodników. Lokomocja,
odzyskanie piłki, jej transport i legalne ustawienie prowadzą do gotowości. Wybór
człowieka zostaje zapisany raz; kopnięcie następuje przez przygotowanie i wspólny
resolver. Wymagane pozycje prawne oraz taktyczna gotowość odbiorcy są osobnymi
warunkami. Zawodnicy mogą pozostać wewnątrz użytecznych stref, zamiast trafiać w
idealne punkty formacji.

`applyRestartScenario` nadal jawnie buduje zamrożone fixture DEV. Rzeczywiste
zdarzenia korzystają z `awardNaturalRestart`; `origin` rozróżnia te ścieżki.
Naturalne przygotowanie nie używa dawnego globalnego progu 2,1 s jako pozwolenia
na wykonanie. Krótki czas przygotowania konkretnego kontaktu oraz kontekstowa
reakcja po golu pozostają częścią modelu; same nie zastępują fizycznej gotowości.

| Obszar        | Baza PR158                                                 | PR159                                                                       |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Gwizdek       | Wspólny setup przypisywał nowe pozycje i zerował prędkości | Live award zachowuje fizyczny snapshot; zmienia obowiązki i cele ruchu      |
| Wykonanie     | Setup oparty w dużej części na 2,1 s                       | Piłka, zasięg wykonawcy, przepisy, wybrana akcja i przygotowanie kontaktu   |
| Szeroki wolny | Zwykle jedna predefiniowana wrzutka                        | Strzał, różne wrzutki, kilku odbiorców, krótkie podanie, przestrzeń i reset |
| Podkręcenie   | Brak kanonicznego spin/Magnus                              | Wspólny integrator z ograniczonym spin, oporem, odbiciami i zanikiem        |
| Gol           | Krótki stały powrót do kickoff                             | Kanoniczna reakcja, dalszy ruch piłki, kontekst pilności i odzyskanie       |
| Czas przerwy  | Brak jawnego pełnego interwału                             | Jeden ograniczony ledger z powodami, milestone i końcem                     |

## Kanoniczne kontrakty

Nadal działa jeden deterministyczny silnik ze stałym krokiem **0,025 s** i seeded
RNG. PR156 passing, PR157 shooting i PR158 contact/tactics pozostają wspólnymi
ścieżkami wykonania; wznowienie nie tworzy drugiej symulacji.

Wznowienie ma `origin`, `awardId`, `spot`, wykonawcę, role/strefy, opcjonalnie
`selectedAction`/`selectedSource`, odzyskanie piłki i bieżący odczyt gotowości.
Naturalna ścieżka przechodzi przez `preparing`, `awaiting_decision`,
`kick_preparation`, `release`; odzyskanie ma etapy `approach`, `transport`, `placed`.
Zachowane `setup` oznacza legacy/DEV fixture. `blockedSince` diagnozuje brak
postępu; nie daje zgody na automatyczną decyzję kontrolowanego wykonawcy.

`incident -> award -> setup -> execution -> result` zachowuje tożsamość zdarzenia.
`lastRestartAward` utrwala eventAt/incidentPosition/legalRestartPosition/team/indirect,
a foul dodatkowo fouledPlayerId/offendingPlayerId oraz ewentualne recalledAdvantageId.
Punkt zdarzenia nie podąża za późniejszym ruchem faulowanego zawodnika.
Powtórzenie tego samego incident nie tworzy nowego award. Wykonawca lub retriever
usunięty z aktywnej XI zostaje zastąpiony bez odtworzenia sceny i bez zmiany incident.
Połowa, koniec meczu i stan abandoned kończą bieżącą przerwę oraz unieważniają
niewykonane przygotowanie. Awaryjny bramkarz pozostaje legalnym wykonawcą.

Czas przygotowania kontaktu zaczyna się dopiero przy legalnej i taktycznej
gotowości; wcześniejszy wybór nie zużywa tego czasu podczas odzyskiwania piłki.
Utrata gotowości resetuje `preparationStartedAt`.
Gdy inny zawodnik przynosi piłkę, wykonawca czeka 2,5 m za spot, aby pozostawić
korytarz do jej ustawienia. Po usunięciu odbiorcy albo zamknięciu wybranego
prześwitu nieaktualna akcja wraca do wyboru w tym samym award. Tuż przed
wykonaniem gotowość i wymagania profilu są sprawdzane ponownie.

Wyliczenie menu, profilów, projekcji celu i gotowości jest czyste. Przygotowane
warunki kontaktu są prognozą dostępności menu; nie przenoszą kanonicznej piłki
ani wykonawcy. Odrzucony autonomiczny restart kontrolowanego zawodnika nie zużywa
kanonicznego execution RNG i nie dopisuje akcji ani statystyk. Jedna dostępna
opcja nadal wymaga człowieka. Rzut z autu zachowuje istniejący wyjątek PR156.
Układ ról i reakcje używają osobnych deterministycznych ziaren.

Role wybierane przy award lub zmianie delivery uwzględniają atrybuty, aktualne
pozycje, koszt dotarcia, preferencje, rywala, wynik i czas. Najpierw rezerwowane
są dwa lub trzy miejsca asekuracji; wybrany odbiorca pozostaje odbiorcą. Krótkie
podanie, near/central/far cross i strzał powodują różne cele, w tym drugi kontakt
po strzale. Bieżący ruch używa zapisanych stref, aktualnego markera i wybranego
delivery, bez pełnej przebudowy all-pairs geometrii w każdym ticku. Po release
działają zwykłe podania, wrzutki, przechwyty, kontakty powietrzne i strzały.

## Przepisy i granice wdrożenia

`RESTART_LAWS_VERSION = IFAB_2026_27`. Punkt przewinienia jest oddzielny od
legalnego miejsca: m.in. atakujący indirect w polu bramkowym przesuwa się na
najbliższą równoległą linię pola; goal kick, corner, penalty i kickoff mają
własne obszary. Offside używa miejsca rzeczywistego zaangażowania, także we
własnej połowie. Natychmiastowe przyjęcie goal kick, corner lub throw-in jest
wyjątkiem od offside; zwykły wolny i kickoff nie mają tego wyjątku.

Direct free kick, corner, goal kick, kickoff i penalty mogą dać bezpośredni gol
przeciwnikowi; własna bramka bez innego kontaktu daje właściwy restart. Indirect
i throw-in wymagają kontaktu innego zawodnika. Fizyczna defleksja jest takim
kontaktem; ziemia, słupek i ponowne dotknięcie wykonawcy nim nie są. To rozróżnienie
nie zmienia publicznego `touch = continuous control episode`.

Gotowość bada realną piłkę i zawodników: położenie oraz uspokojenie piłki,
zasięg wykonawcy, odległości/obszary, linię bramkarza i penalty encroachment.
Quick free kick może zostać wykonany, gdy przeciwnik nie zdążył odejść na 9,15 m;
ograniczenie 1 m dla atakującego przy murze co najmniej trzech obrońców nadal
obowiązuje. Corner mierzy wymaganą odległość od łuku, nie od przesuniętej piłki.
To zestaw testowanych kontraktów, a nie kompletna implementacja wszystkich
procedur sędziowskich.

Jawne ograniczenie: obecny canonical action contract nie proponuje `shot` dla
indirect. Prawo pozwala kopnąć ku bramce, lecz zabrania przyznać gol przed innym
kontaktem; brak takiej opcji jest ograniczeniem menu, nie zakazem kopnięcia.
Pass/cross/space nadal są dostępne, a touch-required adjudication jest testowane.
Wdrożenie nie obejmuje kompletnego handball, całego penalty retake/double-touch
protocol ani referee countdown dla celowo opóźnianych throw-in/goal kick.
Przedłużenie połowy na dokończenie penalty oraz rzeczywista polityka added time
pozostają jawnie odroczone do PR160; zachowany jest obecny terminal whistle contract.

Źródła pierwotne: [IFAB Law 13 — Free kicks](https://www.theifab.com/laws/latest/free-kicks/),
[Law 11 — Offside](https://www.theifab.com/laws/latest/offside/),
[Law 8 — Start and restart](https://www.theifab.com/laws/latest/the-start-and-restart-of-play/),
[Law 14 — Penalty](https://www.theifab.com/laws/latest/the-penalty-kick/),
[Law 15 — Throw-in](https://www.theifab.com/laws/latest/the-throw-in/),
[Law 16 — Goal kick](https://www.theifab.com/laws/latest/the-goal-kick/),
[Law 17 — Corner](https://www.theifab.com/laws/latest/the-corner-kick/),
[countdown protocol](https://www.theifab.com/laws/latest/throw-in-and-goal-kick-countdown-protocol/).
Adresy `latest` są zmienne; wersję wdrożonego kontraktu utrwala stała w kodzie.

## Fizyka i prezentacja

`ball.spin` jest opcjonalnym kanonicznym wektorem. Brak spin zachowuje dokładnie
dotychczasową trajektorię. Zmieniony wspólny integrator zasila runtime i forecast:
lateral spin daje zakręt, topspin zmienia pionową prędkość i opadanie, kontakt
z podłożem i przeszkodą tłumi spin. Profile `power_bend`, `controlled_curl`,
`dipping`, `under_wall`, `wall_gap` zmieniają launch i wymagania wykonania przez
wspólny shot resolver. Atrybuty set pieces/technique i błąd wykonania pozostają
istotne; nazwa profilu nie przyznaje gola.

Ordinary placed/driven pozostają dostępne przy legalnym direct restart również
z wąskiego kąta i dużej odległości. Chip pojawia się tylko przy warunkach
obsługiwanych przez canonical shooting options, w tym penalty. Profil pod murem
wymaga niskiego celu i rzeczywistej osi muru. Gap wymaga miejsca dla promienia
piłki między aktualnymi kapsułami ciał. Resolver ponownie sprawdza geometrię.
Obrońcy mogą trzymać pozycję, skakać lub reagować z opóźnieniem według własnego
seed/atrybutów; nikt nie ma nakazanego sukcesu ani zsynchronizowanego skoku.

UI grupuje kanoniczne akcje po polsku: strzały/profil, wrzutki/obszar/odbiorca,
krótkie podania, przestrzeń i reset. Pokazuje rozwijające się cele. Oddzielne
znaczniki oznaczają rzeczywistą piłkę, niezmienny spot, wykonawcę, mur, wybrany
delivery i gotowość. Celowanie wybiera kierunek i wysokość, także przy penalty;
nie dodaje timed-button minigame. Frame/replay projekcja obserwuje stan i nie
przenosi piłki. Finalne animacje celebracji, stadion i cinematic replay należą do PR161.

Po golu wynik zostaje rozstrzygnięty wcześniej. `postGoal` nadaje proste cele
ruchu i pilność według czasu oraz wyniku. Obecny model pilności zaczyna się od 75. minuty, gdy strzelający po golu nadal przegrywa lub remisuje. Zespół wyraźnie
prowadzący może krótko celebrować. Pilny retriever musi dojść do rzeczywistej
piłki; jej ruch kończy wspólna fizyka i prosta kanoniczna obudowa bramki.
Transport zachowuje podpisany offset względem ciała i realne przemieszczenie.
Kickoff należy do zespołu, który stracił gola, i czeka na legalny stan w centrum.
Ten minimalny model nie opisuje kompletnej psychologii celebracji.

Abstrakcyjny teren do odzyskania piłki kończy się 8 m za granicami boiska.
Kanoniczna obudowa tłumi ruch piłki, a cele retrievera używają tej samej granicy;
nie zależy to od grafiki stadionu. Model spin/Magnus jest uproszczony i ograniczony.
Istniejący model odbicia od słupka/poprzeczki kieruje piłkę od bramki; nie odtwarza
wszystkich normalnych kontaktu, np. wewnętrzny słupek → siatka. Loose ball bez
źródła wcześniejszego strzału nadal jest rozstrzygany jako wyjście za linię,
również w świetle bramki: ogólne samobóje po dalszych kontaktach pozostają luką
silnika. Przetestowana reguła bezpośredniego własnego gola ze wznowienia daje
corner, lecz nie jest dowodem kompletnej obsługi wszystkich samobójów.

## Dowody skupione

Poniższe liczby są sprawdzanymi warunkami deterministycznych testów, nie
statystykami ligowymi ani pomiarem produkcyjnego pełnego meczu.

| Przykład        | Kanoniczny ślad / wynik                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foul provenance | incident `physical-foul-123`, event 123,25 s, punkt (78,125; 8,75), award 123,5 s; spot pozostaje taki sam, mimo ball (79; 9) i velocity (4; −1)                                         |
| Ciągłość award  | Wszystkie player position/velocity pozostają równe wejściu, w tym velocity (2,1; −0,3); wcześniejsze latestAction/statistics zachowane; drugie nadanie tego incident zwraca ten sam stan |
| Mur             | Low segment z=0,11 m: mur grounded blokuje; lift 0,45 m przepuszcza, 0,12 m nadal blokuje. Spacing 1,2 m daje prześwit, 0,6 m kontakt                                                    |
| Curl/dip        | Przy jednakowych fixture prognoza 0,5 s: curl odbiega bocznie od własnej wersji zero-spin o >0,2 m, dip jest >0,25 m niżej od własnej wersji zero-spin                                   |
| Ledger          | event 99 s → stop 100 → discipline 102 → preparation 103 → ballReady 104 → legalReady 106 → execution/end 108; jeden interwał 8 s, trzy powody, ponowne end bez zmian                    |
| Menu            | Obie strony × wide/corner/GK/GK short/kickoff/penalty: ordinary shot obecny, każdy oferowany shot wykonywalny w prognozowanych warunkach kontaktu; chip odpowiada shared eligibility     |

Końcowe `npm run verify`: **PASS**, exit 0. Lint oraz `tsc -b && vite build`
przeszły; główny zestaw ma **1367 testów / 171 plików PASS**, pełna kariera
**5 testów / 1 plik PASS** (łącznie 1372). Główne testy trwały 193,21 s, kariera
52,15 s. Ze względu na ograniczenia hosta ustawiono dwa workers dla test:main
oraz zapisywalny TEMP; zakres, wykluczenia i asercje wymaganej komendy pozostały
takie same. Build nadal zgłasza istniejące ostrzeżenia o rozmiarze bundle i
statycznym/dynamicznym imporcie careerStorage.

`pr159Integrity.test.ts` porównuje cały stan przez 160 ticków / 4 s w
release_minimal/normal/DEV/capture, z profilerem, trackerem i projekcją klatek.
Oba wejścia ticka dają identyczny wynik, w tym rzeczywisty curl release i spin.
Pozostałe przypadki sprawdzają wznowienie po parse/save z signed physical transport,
queued/unselected human przy końcu czasu oraz ponowny wybór po unieważnieniu
odbiorcy/odbiorcy wrzutki/gap. Oddzielny continuity test sprawdza schemat zapisu
transportu poza boiskiem. To dowody konkretnych kontraktów, nie wszystkich
możliwych stanów ani browser/video performance.

Macierz wymaganych scenariuszy używa istniejących testów zamiast osobnego engine.
Wpis oznacza miejsce sprawdzania zachowania; wszystkie wymienione testy są
objęte końcowym pełnym verify PASS.

| #     | Scenariusz                        | Dowód                                                                                           |
| ----- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1     | Realny foul i dokładny spot       | `pr147Rules.test.ts` full-tick foul/advantage, `pr159RestartContinuity.test.ts` immutable award |
| 2     | Wyjście na aut                    | `pr159RestartContinuity.test.ts` live boundary                                                  |
| 3     | Corner/goal kick z linii końcowej | ten sam test + `pr159RestartLaws.test.ts` legal areas                                           |
| 4     | Wide shot/cross/short             | `pr159RestartOptions.test.ts`, `pr159RestartGeometry.test.ts`                                   |
| 5     | Indirect touch-required           | `pr159RestartLaws.test.ts`, menu limitation opisana powyżej                                     |
| 6     | Centralny wolny/mur               | `pr150SetPieces.test.ts`, `shootingOptions.test.ts`                                             |
| 7     | Curl/dip różne trajektorie        | `shotResolver.test.ts`, `ballPhysics.test.ts`                                                   |
| 8–9   | Pod skaczącym / blok stojącego    | `ballFlight.test.ts` rzeczywista wysokość i kontakt                                             |
| 10    | Realny gap                        | `ballFlight.test.ts`, `shootingOptions.test.ts`                                                 |
| 11    | Corner/kilku ruchomych odbiorców  | `pr159RestartGeometry.test.ts`, `pr159RestartOptions.test.ts`                                   |
| 12    | Short corner                      | geometry selected-pass oraz canonical corner options                                            |
| 13    | Penalty                           | `pr159RestartLaws.test.ts`, `shootingOptions.test.ts`, menu obu stron                           |
| 14    | Keeper goal kick                  | menu short/long/direct, controlled rejection w continuity                                       |
| 15    | Second-half kickoff               | continuity: away kickoff, ball/body/velocity zachowane, fizyczny release w oknie <40 s          |
| 16–17 | Późny pilny / zwykły gol          | `pr159RestartContinuity.test.ts` post-goal fixtures                                             |
| 18    | Odrzucone autonomous controlled   | continuity matrix, spy execution RNG i immutable statistics                                     |
| 19    | Jawny human-selected              | continuity queued-pass → przygotowanie → release                                                |
| 20    | Whistle/advantage accounting      | `pr158RestartAccounting.test.ts`, `pr147Rules.test.ts`                                          |
| 21    | Terminal/abandoned w setup        | continuity period_end/abandoned i terminal rejected action                                      |
| 22    | Removed taker/retriever           | continuity reassignment z tym samym award                                                       |

## Odpowiedzi na 15 pytań raportu

| #   | Odpowiedź i zakres dowodu                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tak: zapis incidentPosition/eventAt pozostaje stały; legalRestartPosition osobno obejmuje wyjątki prawa i boundary crossing.                                                                                                                      |
| 2   | Live award zachowuje realny snapshot; assembly używa lokomocji. Testy zdarzeń + 12/12 krótkich restart windows PASS; award displacement 0 m. DEV injection nadal jawnie ustawia fixture.                                                          |
| 3   | Tak: zone radius, marker i wybrane delivery dają użyteczne pozycje; exact idealTarget nie jest globalnym wymaganiem.                                                                                                                              |
| 4   | Tak: readiness wylicza stan piłki, wykonawcy i ustawienie prawne; tactical receiver readiness jest osobne.                                                                                                                                        |
| 5   | Tak: wide direct ordinary shot dostępny bez filtra xG; human selection kolejkuje shared execution.                                                                                                                                                |
| 6   | Tak: kilka odbiorców i near/central/far/edge targets, floated/driven/cutback, short/space/reset.                                                                                                                                                  |
| 7   | Tak: launch spin/energia i wspólny integrator dają różne fizyczne trajektorie; testy porównują także ten sam launch bez spin.                                                                                                                     |
| 8   | Tak w modelu kapsuł i promienia piłki: grounded/lifted wall oraz rzeczywisty gap mają różne wyniki. Reakcja muru nie gwarantuje otwarcia.                                                                                                         |
| 9   | Cele zmieniają realny ruch i marking; po release obowiązują standardowe swept contacts/interception. Częstość skutecznych set pieces w pełnych meczach nie została skalibrowana.                                                                  |
| 10  | Tak: każdy controlled non-throw restart wymaga jawnego wyboru, także przy jednej opcji/watchdog; reject nie pobiera execution RNG ani nie zapisuje akcji.                                                                                         |
| 11  | Tak: pilny scorer-side retriever dochodzi do rzeczywistej piłki i transportuje ją; nie ma obowiązkowej długiej celebracji.                                                                                                                        |
| 12  | Tak: niepilny gol pozwala na prostą kontekstową reakcję oraz ruch współpartnerów; finalna animacja odroczona.                                                                                                                                     |
| 13  | Tak w lifecycle: po reakcji powstaje kickoff dla conceding team i czeka na placement/readiness/decision. Testy pilnego/zwykłego gola i kickoff smoke PASS.                                                                                        |
| 14  | Tak: kanoniczne milestone, nakładające się powody i pojedynczy interval pozwalają PR160 wybrać politykę. Ledger nie dolicza automatycznie sekund.                                                                                                 |
| 15  | Pełny verify 1372 PASS i 160-tick exact-state parity nie wykazują naruszeń testowanych kontraktów. Shot/goal accounting zachowuje dedup także po rebound; zero-spin zachowuje stare obliczenia. Runtime +16,4%; jawne luki reguł opisano powyżej. |

## Ledger, zgodność i pomiar

Ledger zachowuje jeden aktywny interval oraz ostatnie 512 zakończonych. Łączne
`completedSeconds` i `completedCount` nie znikają po odrzuceniu starych rekordów.
Nakładające się foul/discipline/setup dopisują powody do tej samej przerwy.
Kategorie obejmują goal, foul, penalty, corner, goal kick, throw-in, offside,
discipline i restart preparation. Injury/substitution to obecnie nieaktywne
etykiety schematu dla PR160. Role, retrieval i postGoal zachowują tylko bieżący
stan oraz ograniczone relacje aktywnej XI, bez historii narastającej co tick.
`eventAt`, start, first ballReady/legalReady, execution i end używają wyłącznie
zegara kanonicznego, bez czasu oglądania UI. Human wait może zatrzymywać ten zegar
zgodnie z dotychczasowym policy; czas rzeczywisty użytkownika nie staje się added time.

Opcjonalne nowe pola Zod pozwalają odczytać stare setup/release bez origin/spot/award,
ball bez spin oraz stan bez ledger/postGoal. Round-trip przerwy i podpisany offset
retrieval mają testy. Legacy setup zachowuje zamrożoną semantykę fixture.
Schematy zagnieżdżonych team/player/ball zachowują dotychczasowe runtime metadata
przez passthrough, a velocity ma walidowane opcjonalne pole; zapis nie usuwa
informacji potrzebnej do identycznego dalszego ruchu i wykonania.

Focused smoke/performance harness: `scripts/benchmarkPr159Restarts.ts`.
[Kompaktowy zapis przed/po](performance/PR159-restarts-summary.json) utrwala
rewizje, wyniki 12 komórek, trace faz i podsumowanie walidacji. Każda rewizja ma
6 restart scenarios × 2 ziarna × 20 s, dt 0,025 s: **9600 ticków / 240 s**.
Izolowane procesy wykonano kolejno; 40 ticków warm-up i konstrukcja fixture są
poza pomiarem, ruch i accounting są w środku. Wyłącznie NPC/spectator; benchmark
nie podejmuje decyzji za człowieka. Każdy silnik buduje własny seeded DEV fixture,
używając pierwszych dwóch klubów kanonicznej world database (clubs[0]/clubs[1])
i ziarna `pr159-focused-runtime-${scenario}-${repetition}`,
następnie otrzymuje takie same ograniczone przesunięcia. Warunki są porównywalne,
lecz początkowa geometria nie jest byte-identical, ponieważ role zmieniły się.

| Pomiar                                 |              PR158 |                   PR159 |
| -------------------------------------- | -----------------: | ----------------------: |
| Runtime 9600 ticków                    |         4357,36 ms | 5069,96 ms (**+16,4%**) |
| Średni tick                            |           0,454 ms |                0,528 ms |
| Wykonane początkowe wznowienia         |              12/12 |                   12/12 |
| Powrót do open play                    |              12/12 |                   12/12 |
| Maks. zmiana pozycji gracza przy award |              2,5 m |                 **0 m** |
| Maks. zmiana pozycji piłki przy award  |           2,8284 m |                 **0 m** |
| Maks. krok gracza przed release        | 0 m (frozen setup) |                0,1383 m |
| Maks. krok piłki przed release         | 0 m (frozen setup) |               0,04475 m |

Wszystkie końcowe blockers są puste. Czasy PR159 release wynoszą: kickoff
2,475 s, goal kick 5,725 s, corner 2,425 s, wide free kick 2,700 s, close free kick
6,375/6,300 s i penalty 2,600 s. To wynik stanu fixture, nie nowe stałe lifecycle.
Wyższy koszt obejmuje teraz fizyczny stopped play; pojedyncza para procesów
i różna geometria nie pozwalają przypisać +16,4% jednemu modułowi ani uogólnić
wyniku na wszystkie mecze. Nie dostrajano silnika do liczbowego celu.

Reprezentatywne ślady, czas kanoniczny od fixture award:

| Scenariusz       | PR158                                         | PR159                                                                                                        |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Kickoff seed 0   | 0,025 setup → 2,125 release → 3,150 open play | 0,025 preparing (ball_not_placed/taker_not_ready) → 2,275 kick_preparation → 2,475 release → 3,300 open play |
| Goal kick seed 0 | frozen setup; pełny ślad w JSON               | 0,025 preparing → 5,550 kick_preparation → 5,725 release → 7,500 open play                                   |

Realny foul zachowuje `eventAt=37,105`, `award.at=37,125`, victim/offender i ID
kontaktu; legalny spot jest dokładnie w (23,2; 34), a piłka pozostaje w realnej
pozycji. Boundary zapisuje czas przecięcia wewnątrz ticka i osobny incident/spot;
fizyczna piłka pozostaje po integracji. Cała piłka o promieniu 0,11 m musi
przekroczyć linię; frame/body contact ma pierwszeństwo przed golem.

Dodatkowy pomiar wspólnego integratora z tym samym launch (20; 34; 1), velocity
(28; 0; 9), po 0,6 s: zero-spin y=34, z=4,34231; lateral spin (0; 0; 80 rad/s)
y=34,53912 (**+0,53912 m zakrętu**); topspin (0; 100; 0 rad/s) z=3,66359
(**−0,67872 m wysokości**). Trajektoria wynika z integracji, nie korekty toru
po release; testy osobno chronią zerowy spin i geometryczne wall/gap kontakty.

Odtworzenie w bieżącym checkout z zainstalowanymi zależnościami:

```sh
npm run verify
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr159Restarts.ts --seconds=20 --repetitions=2 --output=tmp/pr159-after.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr159Restarts.ts --engine-root=../mfl-pr158 --seconds=20 --repetitions=2 --output=tmp/pr159-before.json
```

`../mfl-pr158` musi wskazywać checkout rewizji bazowej z zależnościami. Nie
wykonano dodatkowej kampanii 18 pełnych meczów wyłącznie dla PR159. Krótkie okna
nie uzasadniają wniosków o realistycznych rozkładach goli, strzałów i posiadania.

## Jawne otwarte problemy PR158 i następne etapy

Zachowujemy końcową sparowaną diagnostykę PR158: strzały **110 → 16**, gole
**68 → 10** w 18 oknach po 90 minut; CM touches **4957 → 3461**, receptions
**2831 → 1993**; adjacent-tick possession flips **24 → 94**, spells <0,5 s
**51 → 189**. Pozostały prolonged/low-progress carrier rotations. Osobny lab
zwrotów miał >360°/net<3 m **2 → 16** i faule **90 → 369**. To różne zbiory dowodów,
a nie statystyczne cele do wymuszenia. Pełny kontekst i historyczne zastrzeżenia
pozostają w [raporcie PR158](PR158_BALL_CONTACT_PRESSING_TACTICS.md).

PR159 nie rozwiązuje tych problemów przez kwoty ani nie dowodzi poprawy realizmu
open play samą ciągłością wznowień. **PR160** wdroży fatigue/conditioning,
injuries, substitutions i actual added-time policy. **PR161** wdroży końcową
prezentację/replay/stadium. Po obu etapach należy wykonać wspólny full-match
diagnostic and realism audit wzajemnie oddziałujących systemów.
