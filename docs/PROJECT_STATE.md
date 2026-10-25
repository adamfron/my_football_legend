# My Football Legend — Current Project State

## PR191 — First Touch, Directional Control & One-Touch Laboratory (experimental)

Fizyczne próby przyjęcia, kierunkowego kontaktu, odegrania/strzału z pierwszej
piłki i podbijania korzystają z wyrzutni, lotu i ruchu 40 Hz. Wspólny receipt
oddziela zamiar, rzeczywistą powierzchnię, impuls/spin, kontrolę i dalszy wynik.
Tułów i połączone powierzchnie nogi mają rzeczywistą geometrię; przypadkowa
klatka może przerwać zamierzone udo. Foot solver i historyczne główki są zachowane.
W Match Lab: **Widok diagnostyczny → PR191 · Pierwszy kontakt i gra z pierwszej piłki**.

Kontakt tułowia jest dostępny w pełnym meczu wyłącznie po jawnym włączeniu
`experimentalBodyContacts: { version: 'body-v1', readyAt: {}, locks: [] }`.
Trzy pełne development B/WW/SS/SW i autentyczne przechwycone stany nie stanowią
niezależnego potwierdzenia ani dowodu poprawy ataku. Dynamiczne uniesienie uda,
pełne woleje i akrobatyka pozostają otwarte; nowe impulsowe główki są niedostępne.
[Raport, konkretne wyniki i powtarzalne polecenia](PR191_FIRST_TOUCH_DIRECTIONAL_CONTROL_AND_ONE_TOUCH_LAB.md).

**B domyślne; 28 atrybutów zachowane; canonical NOT READY; confirmation nieotwarte.**
Nadmierna cyrkulacja, mało kreacji i zbyt długi czas gry pozostają osobnymi blokerami.
Nowa autorytatywna kolejność: **PR191 laboratorium → PR192 pełne generacje/siła świata
→ PR193 Summary Simulation & PlayStyles → PR194 Career UX → PR195+ World Expansion**.
Przesunięcie dawnego PR191–194+ o jeden jest jawne; całe 20–25 sezonów, NPC ageing/
retirement, akademie i kohorty, trajektorie talentu, silne/słabe kluby, transfery,
wymiana kadr i długoterminowa stabilność siły świata pozostają NIEWYKONANE.
Summary pozostaje zablokowane do walidacji canonical; dalsze zobowiązania w [roadmapie](ROADMAP.md).

## PR190 — Passing, Effective Time & Contact Foundation (staged)

Fizyczny impuls stopy zastępuje absolutny próg wymuszający heavy touch przy
przeciętnych atrybutach. Nieudane przyjęcie zachowuje rzeczywisty pęd piłki.
Indywidualne przygotowanie i motor recovery zastępują wspólną 350 ms blokadę
kontaktu z luźną piłką. Diagnostyka rozróżnia decyzję, release, lot, kontakt,
kontrolę/stratę i statystyki. Pełny czas martwej piłki jest niezależny od kwalifikacji
do czasu doliczonego. Zoom Match Lab wynosi 0–1,5.

WW/H osiąga 912/1430 podań, ale nadal tylko jeden strzał i niemal 90 minut faktycznej
gry. B zmienia liczbę strzałów z 11 do 12 w WW i z 37 do 12 w SS.
To nie jest dowód gotowości futbolu.
Zamrożone pary WW/SS/SW, 768 prób jakości drużyn, nieudane iteracje i 26 rzeczywistych
replayów opisuje [raport PR190](PR190_PASSING_REALISM_EFFECTIVE_PLAYING_TIME_AND_ARTICULATED_CONTACT.md).

Jawna eksperymentalna postawa łączy biodra, kolana, kostki i fizyczne początki stóp
oraz ogranicza orientacyjne kontakty ciał w tym samym integratorze. Pełna wymiana
kolizji kończyn, leg-gap/GK i taktyczne fast-versus-prepared pozostają otwartym
zakresem PR190. Częstość naturalnych przerw, cyrkulacja i tworzenie sytuacji nadal
blokują readiness. **Canonical NOT READY; B `state-value-v1` domyślne; 28 atrybutów
bez zmian; niezależna kohorta confirmation nieotwarta.**

PR192 zachowuje pełne 20–25 sezonów Generational Renewal i analizy siły świata.
PR193 summary/PlayStyles wymaga wiarygodnego canonical. PR194 career UX i PR195+
world expansion zachowują pełne zobowiązania; pozostały zakres PR190 nie jest
niejawnie przenoszony ani oznaczany jako wykonany.

## PR189 — Captured Contact Deadlock Repair (staged)

Odtworzono pełne zamrożone WW/A z PR188: 1 984,7 s bezruchu. Sześć rzeczywistych,
kompletnych stanów obejmuje początek i kolejne etapy epizodu. Replay stanu i zdarzeń
oraz neutralność obserwatora są sprawdzane na zamrożonym i zmienionym silniku.
Przyczyna: oceny polityki co około 0,25 s stale trafiały w przerwę po kontrolnym
dotknięciu, mimo otwierającego się pomiędzy ocenami okna. Przygotowany zamiar może
teraz wywołać ponowną walidację przy fizycznym oknie; odzysk sprawności nogi nadal
obowiązuje i uwzględnia rzeczywisty czas z poprzedniego kontaktu.

Dotknięcia kontrolne respektują ten sam recovery co podanie. Gdy kolejny kontakt
jest już należny, stopa nie sięga piłki, a kolizja blokuje rzeczywisty krok do niej,
kontrola kończy się luźną piłką; dalsze przejęcie rozstrzyga zwykła fizyka.
Pomiar bezruchu używa rzeczywistych pozycji. W końcowym WW/A maksimum wynosi 1,35 s,
ale celność 25/1915 i tylko jeden strzał nadal falsyfikują gotowość futbolu.
Po naprawie drogi obrońcy do legalnej pozycji pełna seria kończy **15/15** meczów
w tym samym limicie 7200 s. SW/C kończy w 6135,5 s. Planner omija wszystkie
blokujące ciała, również rywali poza murem i przy końcu drogi; rzeczywisty dystans
9,15 m nadal obowiązuje. Stary cutoff 14/15 i dokładny silnik pozostają w dowodach.
Poprawa ukończenia nie jest poprawą wszystkich metryk: WW/B ma 11,825 s bezruchu,
a SS/H zero strzałów. B nie jest zastępowane polityką eksperymentalną.

Asekurowany obrońca eksperymentalnej polityki może podejść do nieruchomego,
ustabilizowanego rywala z opcją podania. Decyzja zależy od bieżącej geometrii,
asekuracji i ruchu; nie ma czasu wymuszającego odbiór. Historyczny kontroler B/R3
pozostaje odrębny, wspólna gotowość kontaktu i droga wznowień mają jednak zmierzone
skutki także dla B.

To ograniczony etap naprawczy. Pełna artykulacja dolnej części ciała, dodatkowe
powierzchnie i fizyczne odbicia, leg-gap/GK, fast-versus-prepared oraz zwód są
**NIEWYKONANE**. Pozostałe zastoje i negatywne wyniki pełnych meczów pozostają
w [raporcie PR189](PR189_BALL_CONTACT_DUEL_GEOMETRY_AND_DEADLOCK_RESOLUTION.md).
**Canonical NOT READY; B `state-value-v1` nadal domyślne, 28 atrybutów bez zmian,
niezależna kohorta confirmation zamknięta.**

Aktualna kolejność: **PR189 kontakt/replay → PR190 fundament ciała → PR191 laboratorium → PR192
pełne generacje/siła świata → PR193 summary/PlayStyles → PR194 career UX → PR195+
world expansion**. Pełny zakres generacji, w tym 20–25 sezonów rozwoju i analizy
siły świata, jest zachowany w roadmapie. Żaden z tych etapów nie jest ukończony.

## PR188 — Relative Decisions & Match Stabilization (experimental)

Priorytetem jest stabilizacja decyzji i wznowień po negatywnych wynikach PR187.
Trzy eksperymentalne polityki porównują względne lokalne okazje i krótki koszt
czekania; zamiar przygotowania jest oddzielony od fizycznego wykonania. Ograniczona
pamięć widocznych zdarzeń rywala nie odczytuje ukrytych ocen. Psychologia pozostaje
opcjonalna i domyślnie wyłączona. Nowe preferencje obrony są etapowane wyłącznie
w tych trzech politykach; historyczne legacy/B/R1/R2/R3 zachowują swój kontroler.

Normalny mecz rozpoczyna się nieposiadaną, nieruchomą piłką na środku i kanonicznym
kick-offem. Jawne historyczne aparatury open-play zachowują dotychczasowe warunki.
Ręczny wolny rozróżnia legalne szybkie zagranie z obecnych pozycji oraz fizyczne
przygotowanie drużyny; gotowość nie wybiera kopnięcia za człowieka. Wymiary muru
pozostają bez arbitralnego zwężania, a potencjalna luka nie obiecuje sukcesu.

**B pozostaje domyślne, 28 atrybutów i fizyczny resolver pozostają zachowane.
Canonical NOT READY dla summary; niezależna kohorta pozostaje zamknięta.**
Wyniki rozwojowe, nieudane próby, zakres technicznej weryfikacji i niezaliczone
bramy: [raport PR188](PR188_RELATIVE_DECISION_MAKING_AND_MATCH_STABILIZATION.md).
Pełne WW falsyfikuje ogólną poprawę liveness: trzy polityki eksperymentalne nadal
mają wielominutowe zastoje i bardzo słabą skuteczność podań. Naprawy lokalne oraz
zielone testy techniczne nie zamykają tych bram; PR pozostaje eksperymentalnym szkicem.

Historyczna kolejność PR188: **PR188 stabilizacja → PR189 pełne generacje/siła świata →
PR190 summary/PlayStyles → PR191 career UX → PR192+ world expansion**.
Generacje zachowują całe 20–25-sezonowe zobowiązanie; niczego nie oznaczono jako
wykonane. Sekcje historyczne poniżej zachowują numery planów ze swoich okresów.

## PR187 — Executable Policy Experiments, Validation Incomplete

Nowe `opportunity-driven-v1`, `hierarchical-intent-v1`, `contextual-judgment-v1`
są wybieralne w Match Lab/headless. Odrębne mechanizmy korzystają z nowego
adaptera i kandydatów opartych na obserwacji; nie używają końcowego rankingu B.
Counter support, playmaker cue i press triangle mają live recognition, target,
cancellation i fizyczny ruch. Opcjonalne, jawne dane match-level nie wymyślają historii kariery.

To etap eksperymentalny. **Pozostałe kontrolery obrony/GK/wznowień nadal czytają
pełny stan**, więc nie ma deklaracji pełnego bounded AI. Techniki strzałów mają
oddzielny, słabo skalibrowany estymator; historyczny mismatch jest odizolowany,
nie uznany za rozwiązany. Koordynacja, kontrfaktyczne okna R3, coach/communication,
keeper calibration i pełny human/browser matrix wymagają dalszych prac.

Pełne mecze development i negatywne próby są archiwizowane osobno od niezależnego
potwierdzenia. Nowej kohorty confirmation nie otwarto. **B `state-value-v1` pozostaje
domyślne; 28 atrybutów, stare ID, fizyka i przepisy zachowane. Canonical NOT READY
dla summary.** Dokładne wyniki i final-head CI należy czytać z receipt i PR.

[Raport PR187 i jawne niezakończone bramy](PR187_BOUNDED_FOOTBALL_INTELLIGENCE_AND_POLICY_VALIDATION.md).
Roadmapa zachowuje fizyczną kalibrację, generacje/siłę świata, summary/PlayStyles,
career UX i world expansion; częściowe wdrożenie nie zamyka tych zobowiązań.

## PR186 — Tactical Cognition, Team Familiarity & Attribute Diagnostics

Dodano izolowany, typowany research: trzy wzorce współpracy, system/role/partner
familiarity, oddzielne wymagania coacha i hidden player adaptability, bounded
obserwację/komunikację oraz indywidualne wybory z ograniczonym regret.
Ruch, kontakty, lot i późniejsze podania wykonuje istniejąca fizyka.
Prototypy nie są aktywne w karierze ani schedulerze live.

Nowe próby rozróżniają celność główki od reach, composure pod presją, przygotowanie
od rozpoznania i faktycznego release oraz pierwszy kontakt od odzysku/nawrotu.
Wyniki keeperów i nasycone testy feint pozostają jawnie niejednoznaczne.
Zdiagnozowano wspólne oczekiwanie gola dla różnych technik strzału; korekta
wymaga PR187 i szerzej zamrożonej walidacji. Nie dostrojono fizyki do jednego meczu.

Pełne B/R3 powtarzają stany PR185 dokładnie. Nowe pomiary cyrkulacji i kontaktu
są development evidence, bez deklaracji generalnej poprawy. **B `state-value-v1`
pozostaje domyślne, schemat 28 atrybutów i save bez zmian, canonical NOT READY
do kalibracji summary.** Dokładne wyniki weryfikacji są w receipt PR186.

[Raport i wykonywalne specyfikacje PR187](PR186_TACTICAL_COGNITION_AND_ATTRIBUTE_DIAGNOSTICS.md).
Jawna zmiana sekwencji: **PR186 diagnostyka/prototypy → PR187 eksperymentalne
polityki, pozostała kalibracja i nowe niezależne SS/SW/WW → PR188 generacje/siła
świata i większe prerequisite fizyki → PR189 summary/PlayStyles → PR190 career UX →
PR191+ świat**. Pełny dawny zakres pozostaje w [roadmapie](ROADMAP.md).
Poniższe sekcje zachowują historyczny kontekst swoich etapów.

## PR185 — Extended Physical Testing & Ball-Control Mechanics

Wspólne prowadzenie i przyjęcie używa fizycznych inside/outside/instep/sole/cushion
oraz protection, z ograniczonym impulsem, tarciem i spinem. Ruch ma skończoną
odpowiedź podparcia/równowagi; zwykłe akcje pozwalają wykonać dwukontaktowy zwód
oraz legalny wyrzut bramkarza po catch. Nie ma automatycznego sukcesu lub resetu spinu.

Zachowano 106 historycznych plików PR184. 2 580 zapisanych prób obejmuje m.in.
24/24 ukończone lustrzane slalomy, zwody z sukcesem i porażką, fizyczną obręcz,
powtarzany wysiłek, trajektorie skoków/główki oraz reakcje i dystrybucję GK.
Przyczyna dawnej asymetrii leżała w trasie, pędzie i wymuszonej geometrii stopy.
Adapter celu kończy po 10/10 prób podań, rebound-turn-pass i strzałów.

Skoki mają wspólną fizykę pionową i eligibility przy aktywnym stanie, ale automatyczne
wybicie AI pozostaje etapowane; standardowy aerial zachowuje legacy reach.
Pełne B/R3 kończą mecz, B ma identyczną powtórkę z obserwatorem i bez niego.
Mniej strzałów i większa cyrkulacja w jednym sparowanym SW są jawnym ryzykiem,
nie dowodem poprawy futbolu. Pełne verify i dokładny log opisuje receipt PR185.

**B pozostaje domyślne; canonical nadal NOT READY do kalibracji summary.**
Schemat 28 atrybutów i rozwój kariery pozostają zachowane. [Raport PR185](PR185_EXTENDED_PHYSICAL_TESTING.md)
zawiera etapy, 33 odpowiedzi, ograniczenia i plan: **PR186 kalibracja → PR187 nowe
niezależne mecze → PR188 generacje/siła świata → PR189 summary/PlayStyles →
PR190 career UX → PR191+ świat**. Sekcje poniżej zachowują historyczny kontekst.

## PR184 — Football Performance Lab Core

Wspólny runtime wykonuje fizyczne próby w kroku 0,025 s: sprinty, nawroty, slalom,
podania do celu, odbicie od ściany z przyjęciem i kolejnym podaniem oraz strzały.
Aparatura ma typowane obiekty, bramki z interpolacją czasu, obręcz z kolizją rantu,
małą bramkę i deterministyczną wyrzutnię. Wyniki pochodzą z rzeczywistych pozycji
oraz kontaktów; nieukończone próby zachowują brak czasu ukończenia.

Macierz 28 atrybutów obejmuje bezpośrednie i dynamiczne odczyty oraz deklaratywne
użycie. Pary seedów, pięć pasm i małe interakcje oddzielają pomiar fizyczny od
prognoz, decyzji i kariery. Wszystkie stany są kopiowane; laboratorium nie rozwija
atrybutów ani nie zapisuje kariery. Tryb manual przyjmuje zwykłe MatchAction;
rozbudowany ekran treningowy i adapter wizualnej powtórki pozostają poza zakresem.

[Raport PR184](PR184_FOOTBALL_PERFORMANCE_LAB.md) i `performance/PR184-*.json`
zawierają wyniki, porażki, źródła, koszt oraz bieżący wynik pełnego verify.
**B pozostaje domyślne; canonical nadal NOT READY do kalibracji summary.**
Nie zmieniono współczynników rozgrywki ani schematu 28 atrybutów.

Aktualna kolejność: **PR185 rozszerzone testy fizyczne → PR186 kalibracja →
PR187 przeniesienie do meczów → PR188 generacje/siła świata → PR189 summary i
PlayStyles → PR190 career UX → PR191+ świat**. Pełny dawny zakres tych prac
pozostaje w [roadmapie](ROADMAP.md). Historyczne sekcje poniżej zachowują kontekst
swojego PR, także ówczesną numerację planu.

## PR183 — Match Realism Stabilization

Zapisany zastój luźnej piłki nad zawodnikami otrzymuje rzeczywisty osiągalny kontakt
głową. R3 wykorzystuje okno podania przed impulsem prowadzenia, a wartość wsparcia
uwzględnia faktyczną głębokość na boisku. Wybrane dośrodkowanie zachowuje bieg odbiorcy
po zmianie zawodnika. Siedem zamrożonych cofnięć kończy się podaniem przed 20 s i 12 m;
nie dodano zakazu cofania, limitu dystansu ani wymuszonego podania.

**Pełne `npm run verify`: 2092/2092 testów, lint i build zielone.** 30/30 meczów
development, 15/15 nowego potwierdzenia oraz 3/3 dodatkowych regresji R3 kończy się
poprawnie. Trzy nowe projekty SS/SW/WW są niezależnymi jednostkami; ich piętnastu
wariantów polityk nie liczymy jako piętnastu niezależnych projektów. Każde z 11
cofnięć R3 >=15 m ma odtworzony ranking i fizyczny koniec; maksimum nowego
potwierdzenia to 23,98 m. Pozostają zbyt zachowawcze prowadzenia, cyrkulacja,
skuteczność strzałów i częstotliwość fauli — to ograniczenia kalibracji.

**B `state-value-v1` pozostaje domyślne; pięć polityk zachowane. Canonical nadal
NOT READY do kalibracji summary.** Pełny stan B z obserwatorami i bez nich jest
identyczny po 228597 krokach. Przeglądarkowy R3 i dwie ręczne decyzje B przeszły
bez błędów konsoli. Samo typowanie restartu ma jawny dowód identycznego JavaScriptu;
zamrożone pomiary zachowują swoje oryginalne hashe.

Scalenie wymaga zielonych obowiązkowych kontroli ostatniego commita PR183.
[Aktualny raport](PR183_MATCH_REALISM_STABILIZATION.md) oddziela zamknięte regresje
od pozostałych ograniczeń i [odrzuconego draftu](PR183_REJECTED_DRAFT.md).
Następnie **PR184 generacje/siła świata → PR185 summary i PlayStyles (kalibracja
nadal zablokowana) → PR186 career UX → PR187+ świat**.

## PR182 — Tactical Intelligence & Independent Policy Validation

Trener dobiera uzupełniające się role, zbiera ograniczone i zanikające obserwacje
rywala, ocenia plan w trakcie gry i w przerwie oraz reorganizuje zespół po czerwonej
kartce. Zmiany uwzględniają rzeczywistą rolę i rezerwy, z zachowaniem legalnego
zejścia/wejścia, tożsamości oraz minut. Dwa historyczne zastoje mają naprawioną
fizyczną przyczynę; nowe pozostałe przypadki są jawnie opisane.

**Prowizorycznie domyślne B `state-value-v1`; pięć polityk pozostaje w Match Lab.**
Zamrożony kandydat i harness poprzedzają otwarcie 12 nowych projektów SS/SW/WW.
60/60 pełnych meczów: B poprawia strzały w 12/12, wejścia w pole karne w 9/12,
maksymalny hold 10,95 s. Dodatkowy seryjny pełny pomiar B: +17,2% CPU względem
PR181. R1 i R2 nie osiągają zamrożonego minimum progresji w 8/12; R2 przekracza
również koszt, a R3 ma wielominutowe pętle bramkarza. Wyniki pierwotnej walidacji
dotyczą pierwotnie zamrożonego kandydata. Review naprawia pomijanie kolejnej czerwonej
kartki podczas aktywnej reorganizacji; poprawiony kandydat ma osobny freeze i dodatkowe
potwierdzenie B/legacy na trzech wcześniej nieużytych projektach SS/SW/WW.

**Canonical nadal NOT READY do kalibracji summary.** Nadmierna cyrkulacja i czas
gry, słabe wykonanie techniczne niższych drużyn, skuteczność/oczekiwania strzałów,
niepełne szczegóły czterech prób oraz dośrodkowania i rzadkie pojedynki powietrzne
pozostają konkretnymi ograniczeniami. Z rezerwy `pr180-reserved-*` review wykorzystuje
po jednym projekcie SS/SW/WW; pozostałe dziewięć nie jest uruchamiane. Match Lab zamraża role i taktykę, odtwarza wejścia i eksportuje zwięzłe
porównanie. [Wyniki, metodologia i weryfikacja PR182](PR182_TACTICAL_INTELLIGENCE_AND_POLICY_VALIDATION.md).

Pierwotny kandydat: pełne `npm run verify` **PASS, 2051 testów**, lint, TypeScript i build.
Review dodaje pięć regresji kolejnych wykluczeń oraz osobny pełny przebieg B z karnym
(razem z kontrolą zgodności Node/Vitest: 2058 testów); bieżący wynik sprawdzeń jest w [CI PR182](https://github.com/adamfron/my_football_legend/pull/182/checks).
Osobne potwierdzenie poprawionego kandydata: **6/6 pełnych meczów**, bez patologicznych
holdów; maksymalny hold B 20,2 s. Wynik SW 10:0 i nadmierna cyrkulacja pozostają
ograniczeniami kalibracji. Przeszedł pierwotny test Edge dla rzeczywistego B, pięciu identycznych wejść, eksportów
i ludzkiego podania. Pełny stan B z obserwatorami i bez nich jest identyczny;
kontrakty kariery potwierdzają powtarzalność oraz jednokrotne zapisanie wyniku.

Następny etap: **PR183 generacje/siła świata → PR184 summary i PlayStyles
(kalibracja zablokowana do naprawy wskazanych ograniczeń) → PR185 career UX →
PR186+ świat**. Pełny zakres długiej kariery i wymiany pokoleń pozostaje w planie.

## PR181 — Attacking Depth, Wing Duels & Aerial Football

Wspólny ruch zachowuje zadanie biegu za linię przez kolejne warstwy ustawienia.
Timing korzysta z widocznego przygotowania podającego i rzeczywistej prędkości;
spalonego nadal rozstrzyga moment zagrania. Obrońca śledzi wiarygodne zagrożenie,
może utrzymać linię lub przekazać krycie. Ograniczenie celu na własnej połowie
respektuje przepis o spalonym i nie spycha ataku za linię obrony rywala.

Skrzydłowe wyścigi uwzględniają zwrot, przyspieszenie, pęd i zmęczenie. Izolowany
obrońca może opóźniać atak, a zaangażowane wejście ma fizyczny czas odzyskania
równowagi. Dośrodkowania oceniają osiągalne strefy i rzeczywiste przybycie partnera.
Obie drużyny przewidują lot i walczą o osiągalny kontakt lub drugą piłkę; presja
barkiem jest odróżniona od prawa do dotknięcia piłki.

**Brak promocji polityki; `legacy-pr176` pozostaje domyślne. Canonical nadal
NOT READY do kalibracji summary.** Sześć nowych projektów rozwojowych SS/SW/WW
jest wspólnych dla pięciu polityk. Zarezerwowane wejścia PR182 pozostają nietknięte.
Pomierzono **30/30 pełnych meczów**; pełne `npm run verify` zakończyło się PASS
(2020 testów, lint, TypeScript i build). Raport rozdziela cele podań i intencje
dryblingu od rzeczywistych kontaktów i ciągłych epizodów prowadzenia piłki.
Wyniki, źródła, weryfikacja i ograniczenia: [raport PR181](PR181_ATTACKING_DEPTH_WING_DUELS_AERIAL_FOOTBALL.md).

Następny etap: **PR182 trener i niezależna walidacja → PR183 generacje/siła świata →
PR184 summary i PlayStyles → PR185 career UX → PR186+ świat**.

## PR180 — Football Tempo, First-Touch Decisions & Ball Interaction

Wspólny model pierwszego kontaktu ocenia względną prędkość piłki, geometrię stóp,
orientację przyjścia i kontynuacji, zmianę pędu, spin, przygotowanie, technikę,
presję i rezerwy fizyczne. Odegranie wymaga rzeczywistego kontaktu; niedokładne
połączenie zachowuje część przychodzącego pędu. Kontrola i kierunkowe przyjęcie
konkurują z podaniem w krótkim horyzoncie pierwszego kontaktu, zamiast być
utożsamiane z 2,5 s nieruchomego oczekiwania. Próby i ukończenia first-time
rozliczają kanoniczne ID, także gdy widoczna akcja zdążyła się zmienić.

Pięć pełnych ręcznych eksportów jest dostępnych i zweryfikowanych przez SHA-256.
W najbliższym odtwarzalnym wariancie seedu R1 odtwarza ponad 80% first-time przed
poprawką. Brak kompletnego pierwotnego setupu w eksporcie wyklucza deklarację
identycznych wejść. Nowe sześć projektów SS/SW/WW służy rozwojowi; dwanaście
`pr182-sealed-*` oraz dwanaście historycznych `pr180-reserved-*` pozostają nieuruchomione.

**Brak promocji polityki; legacy pozostaje domyślne. Canonical nadal NOT READY
do kalibracji summary.** Szczegółowe wyniki, weryfikacja i ograniczenia:
[raport PR180](PR180_FOOTBALL_TEMPO_AND_BALL_INTERACTION.md).

Aktualna kolejność: **PR180 wspólne wykonanie → PR181 głębia/skrzydła/powietrze →
PR182 trener i niezależna walidacja → PR183 generacje/siła świata → PR184 summary
i PlayStyles → PR185 career UX → PR186+ świat**. Starsze numery poniżej są historyczne.

## PR179 — Role-Driven Football Intelligence

Wdrożono 29 wspólnych, walidowanych ról oraz trzy polityki na kanonicznej fizyce:
R1 ocenia konsekwencje stanów z uwzględnieniem odpowiedzialności zawodników,
R2 dodaje cele przyjęcia i ruch bez piłki, R3 uzależnia hierarchię od rzeczywistej
fazy. Trener dobiera role deterministycznie z atrybutów, pozycji/duties, preferencji,
stanu fizycznego i sąsiednich odpowiedzialności. Jawne zmiany ról działają w meczu.

Match Lab udostępnia wszystkie pięć polityk, powtórkę zamrożonych składów i seedu,
zmiany ról/taktyki oraz JSON oparty o kanoniczne zdarzenia i oficjalne statystyki.
Diagnostyka odróżnia wybór od fizycznego wykonania i oznacza patologiczny bezruch.
Sześć projektów SS/SW/WW służy rozwojowi; dwanaście nowych projektów pozostaje
nieuruchomionych dla PR180. Role nie przyznają umiejętności ani wyników.

**Polityki pozostają eksperymentalne; domyślne jest `legacy-pr176`.
Canonical nadal NOT READY do kalibracji summary.** Mniejsza stagnacja nie
oznacza automatycznie lepszego futbolu: nadmiar podań i mało okazji wymagają
dalszej pracy. [Raport i reprodukcja](PR179_ROLE_DRIVEN_FOOTBALL_INTELLIGENCE.md).

Ukończono **30/30 pełnych meczów**, 250 kontrolowanych porównań i pełne powtórki
przeglądarkowe. R1/R3 pozostają warunkowymi kandydatami badawczymi; nowy hold
bramkarza z R2 jest odtworzony i blokuje promocję także pozostałych reform.
Końcowe `npm run verify`: **PASS — 1981 testów, lint, TypeScript i build**.
[Weryfikacja](performance/PR179-verification.json),
[porównanie](performance/PR179-policy-comparison.json).

## PR178 — Physical Contact Resolution & Independent Reform Validation

Naprawiono odziedziczoną pętlę kontaktów nakładających się ciał. Kontakt ciągły
uzbraja się ponownie po rzeczywistym rozdzieleniu geometrii; korekta penetracji,
rzeczywista prędkość ciała i podział czasu lotu zachowują fizyczną kontynuację.
Oryginalny frozen state zamiast 200 kontaktów bez ruchu osiąga legalną kontrolę
po 1,6 s w legacy i 1,0 s w B. Naprawiono także ponowne główkowanie tej samej
piłki podczas ciągłego ruchu zawodnika razem z piłką. Bez kwot i timeout escape.

Zamrożona walidacja kończy **36/36 pełnych przebiegów: 12 nowych projektów ×
legacy/A/B**, na wspólnej poprawionej fizyce. B zwiększa kontrataki z dziesięcioma
metrami kontrolowanego postępu (295 vs 95), lecz celność podań spada średnio
o 20,83 pp, straty rosną, a sześć projektów zawiera posiadanie ponad 20 minut.
Tworzenie wiarygodnych okazji pozostaje skupione w kilku konfiguracjach.

**B pozostaje eksperymentalny; domyślny pozostaje `legacy-pr176`.
Canonical nadal ma ocenę NOT READY do kalibracji summary.** Nie oznacza to
zaakceptowania realizmu legacy. Następny krok to precyzyjne rozliczenie długich
kontrolowanych holds oraz utraty ciągłości podanie/bieg/przyjęcie/kolejna akcja,
potem nowa zamknięta walidacja. Obecne 12 projektów jest już zużyte.

Rzeczywisty browser smoke B obejmuje prowadzenie, celne ręczne podanie, strzał,
Simulate Remainder, trwały wynik dokładnie raz i kolejny fixture. Osobne pełne
kariery youth/pro sprawdzają uczestników, zmiany, save/reload i powtórny commit.
Nie wprowadzono migracji aktywnego meczu ani wersji zapisu kariery.
[Raport, decyzja i 42 odpowiedzi](PR178_CONTACT_PHYSICS_AND_MATCH_REFORM_VALIDATION.md),
[porównanie](performance/PR178-policy-comparison.json),
[końcowa weryfikacja](performance/PR178-verification.json).
Końcowe niezmienione `npm run verify`: **PASS — 1954 testy, lint, TypeScript i build**.

Aktualna kolejność: **PR179 role i polityki → PR180 walidacja i trener →
PR181 generacje/siła świata → PR182 summary/PlayStyles po prerequisite canonical →
PR183 career UX → PR184+ świat**. Zakres odłożonych prac pozostaje zachowany.

## PR177 — Match Engine Reform Implementation

Wdrożono odrębną politykę `state-value-v1`: wspólną wartość konsekwencji akcji,
wykonalne warianty podań, niezależne propozycje biegu, hybrid readiness,
końcowy arbitraż ruchu i rozpoznawanie odsłoniętego rywala po odzyskaniu piłki.
`legacy-pr176` oraz ablation A pozostają porównaniami; oryginalny scalony PR176
jest opublikowany jako `match-engine-legacy-pr176` i ma osobny baseline.

**B pozostaje eksperymentalny; domyślna polityka nowych meczów to legacy.**
Materialnie inne decyzje nie oznaczają jeszcze dostatecznego realizmu. Nowe
przebiegi ujawniły pętlę kontaktów nakładających się ciał: ten sam rzeczywisty
stan daje 200 kontaktów przez pięć sekund bez przesunięcia piłki zarówno
w pristine PR176, jak i B. Zapisano kompletną reprodukcję. Osobna optymalizacja
indeksu księgowania kontaktów zachowuje wszystkie sześć pełnych checkpointów
20-minutowej kontynuacji i usuwa koszt wielokrotnej budowy indeksu historii.

Nie wprowadzono migracji aktywnych meczów ani nowej wersji save kariery.
Obie kariery B, wynik dokładnie raz, save/reload ukończonego wyniku i Simulate
Remainder mają osobne receipts. Pełne porównania, walidacja zamrożonego kandydata,
status verify, koszty i ograniczenia są w
[raporcie wdrożenia PR177](PR177_MATCH_ENGINE_REFORM_IMPLEMENTATION.md).
Ocena **NOT READY do kalibracji summary** pozostaje w mocy. PR178 musi rozliczyć
mechaniczny problem kontaktów i niezależnie zweryfikować jakość futbolu na nowych,
zamkniętych projektach; nie stroić na zużytym holdoucie PR177.

## PR176 — Match Engine Mathematical Audit & Reform Blueprint

Baza: scalony PR175 `52748e2`. Audyt rekonstruuje aktualny ranking, powiązania
ryzyka, generowanie kandydatów, czasy i priorytety ruchu. Produkcyjny kod,
fizyka, RNG, opóźnienia, reguły, UI i formaty zapisu pozostają bez zmian.
Hash produkcyjnego matchSimulation nadal `9f6123b5…`.

19 rzeczywistych historycznych stanów: wszystkie akcje i oryginalne składniki,
190 teammate projections, 121 sweeps, 70 planów lotu i 28 rzeczywistych releases
w geometrii prostej/diagonalnej. Ranking i cztery pełne 3-sekundowe stany są
identyczne z instrumentacją i bez niej. Potwierdzono m.in. nakładające się kanały
ryzyka, lokalny paradoks gameReading i niespójność dalekiego lofted planu ponad
30 m/s z release ograniczonym do 30. Cztery krótkie okna nie potwierdziły
zniknięcia nowej okazji podczas blokady; wpływu timerów nie przedstawia się jako
zmierzonej przyczyny całej pasywności.

Wybrano **pakiet B**: wspólna wartość następnego stanu i koszt straty, niezależne
propozycje biegu, fizycznie wykonalny plan oraz hybrid readiness/intentions.
**A** jest fallbackiem i porównaniem, **C** większą modularną alternatywą.
PR177 ma przeprowadzić kontrolowany, materialny eksperyment, a nie ograniczyć
się do kolejnej małej korekty współczynnika. Zamrożono 12 nowych initial states
(6 development / 6 validation), bez wykonania ticka i odczytu wyników.

[Audyt i odpowiedzi](PR176_MATCH_ENGINE_MATHEMATICAL_AUDIT.md),
[warianty](PR176_MATCH_ENGINE_REFORM_OPTIONS.md),
[wykonalny PR177 blueprint](PR176_MATCH_ENGINE_PR177_BLUEPRINT.md),
[timery i progi](PR176_TIMING_AND_THRESHOLD_INVENTORY.md),
[liczby](PR176_NUMERICAL_APPENDIX.md).
Końcowy wynik wymaganej niezmienionej komendy `npm run verify` jest w
[receipcie](performance/PR176-verification.json).

Autorytatywna kolejność: **PR177 reforma → PR178 niezależna walidacja → PR179
generacje/siła świata → PR180 summary/PlayStyles → PR181 career UX → PR182+
świat**. Pełne zadania zachowano w [ROADMAP](ROADMAP.md). Ocena PR175 **NOT READY**
obowiązuje; PR176 nie ogłasza poprawy gameplay. Numery w poniższych historycznych
opisach dokumentują ówczesne plany i nie zastępują tej kolejności.

## PR175 — Independent Match Reality Validation

Zweryfikowano scalony PR174 `d6556eba`, łącznie z poprawką asekuracji po review.
Ponownie zmierzono historyczne 16+8 meczów: wejścia są identyczne z frozen K,
ale 8/24 końcowych stanów się zmienia. Osobne 24 powtórki rozliczają źródła
wszystkich historycznych bramek i odtwarzają pełne stany nowej bazy.

Zamrożono 12 nowych projektów bez lustrzanych duplikatów: sześć development
i sześć zamkniętej walidacji. Wszystkie kończą się prawidłowo. Wynik łączny:
21 306 podań, 14 strzałów, dziewięć goli i sześć rożnych. Rzeczywiste wybory,
kontakty, podania, strzały i posiadania mają powiązane identyfikatory.
208 kontrolowanych strzałów, zamrożone decyzje, próby kombinacji/adaptacji
i dwa pełne przebiegi kariery uzupełniają pomiary meczów.

Niezmieniony `npm run verify`: **PASS — 1894 testy**, lint, TypeScript i build.
Dwa pełne nowe mecze z obserwatorami i bez nich zachowują identyczny cały stan
i liczbę kroków. Koszt diagnostyki i kombinacji oraz startup/save mają osobne
seryjne pomiary; trzy krótkie próby nie izolują stabilnego narzutu CPU.

**NOT READY do statystycznej kalibracji PR177.** Wąskie gardło pozostaje
przed dobrym dostępem do pola karnego i groźnych strzałów. Nie przyjęto nowej
poprawki gameplay: dowody nie izolują bezpiecznej zmiany pojedynczego mechanizmu.
Poprawiono wyłącznie badawcze przypisanie starych wskazówek wznowień i zbyt
szerokich powiązań kombinacji. Źródła produkcyjne pozostają bez zmian.

[Pełny raport, odtwarzanie, ograniczenia i 40 odpowiedzi](PR175_MATCH_REALITY_VALIDATION.md).
Walidacja PR175 została zużyta; przyszłe strojenie wymaga nowego zamkniętego zbioru.
PR176 generacje/siła świata → PR177 summary/PlayStyles → PR178 career UX
→ PR179+ ekspansja pozostają w tej kolejności. Częstości zdarzeń obecnego silnika
nie mogą być traktowane jako wiarygodny cel kalibracji summary.

## PR174 — Combination Play & Tactical Adaptation

Published for review: [PR174](https://github.com/adamfron/my_football_legend/pull/174), based on
merged PR173 `c499123`. Short shared opportunities preserve physically observed pass-and-go,
third-man and flank movement across the first pass. The partner still selects and executes
an ordinary action. Existing threat memory responds gradually to completed attacking evidence.
Canonical physics, human commands and defensive constraints retain authority. Exact retained
restart-wall and unavailable-rest-cover defects have narrow fixes and regressions.

Frozen K validation: unchanged `npm run verify` passes 1884 tests locally and in CI on the same
production/regression source. Original 16 and separate held-out eight matches per engine all
finish; input hashes match and the pristine PR173 replay reproduces all 16 archived final states.
There are 127 paired short continuations, two complete careers, save/reload and observer
equivalence, production-browser smoke, source/raw archives and serial CPU measurements.

Post-publication review extends the available, non-participating rest-cover guard to every
combination candidate, including flank nominations. Four regressions reproduce injured/dismissed
cover bypasses; 30 focused PR174 tests pass with the fix. Sixteen paired opening releases retain
identical ball/pass physics and all four healthy full states. These are separate from the frozen
K whole-match measurements; the latest PR CI validates the review follow-up.

Results remain mixed: original-16 losses 4058→4080, shots 28→24, box entries 72→58;
held-out losses 1727→1671, shots 12→11, box entries 33→32. Natural completed combinations
171+30 include third-man and overlap actions. Completed underlap prevalence, organised pressing
escape and increased long-shot selection remain unproven. This is a reviewable implementation
with explicit acceptance limits, not a completed match-realism claim.

[Full report, measurements and all 36 acceptance answers](PR174_COMBINATION_PLAY_TACTICAL_ADAPTATION.md).
Historical PR171–173 evidence remains unchanged. PR175 should independently validate
advantage-to-shot conversion, losses, pressure/underlap and broader CPU distributions.
Roadmap order remains PR175 reality → PR176 generations/world strength → PR177 summary/PlayStyles
→ PR178 career UX → PR179+ world expansion. Publication does not imply merge.

## PR173 — Dynamic Football Actions & First-Touch Intelligence

Baza: scalony PR172 `7465773`. Kierunkowy pierwszy kontakt nie przesuwa już
piłki do przyszłego punktu, gdy nie istniał plan carry. Używa wspólnego skończonego
impulsu kontroli, zachowując fizyczną pozycję piłki i możliwy pęd zawodnika.
Świadomie wybrany kierunek człowieka ma pierwszeństwo przed propozycją kontynuacji.

Ograniczona prognoza 2,5 s uwzględnia widoczną prędkość, facing, przyspieszanie,
hamowanie, zwinność i rezerwy. Jest przybliżeniem kinematycznym z optymistycznym
założeniem reakcji, bez gwarantowanej granicy czasu ani prawdopodobieństwa. Bliska stopa nadal może
interweniować; cała lokalna asekuracja jest uwzględniana. Rewalidacja dotyczy
istniejącej krótkiej kontynuacji. Nie wdrożono uniwersalnych bonusów ani odrzuconej
zmiany wyboru omijania obrońcy. Stamina i parametry regeneracji pozostają dotychczasowe.

57 parowanych pięciosekundowych prób 1a/1b/2a, naturalne zamrożone decyzje,
audyt obciążeń, deterministyczność, pełna kohorta i weryfikacja są rozliczone w
[raporcie PR173](PR173_DYNAMIC_FOOTBALL_ACTIONS_FIRST_TOUCH.md). Ograniczenia
szerszej kreacji ofensywnej pozostają jawne; lokalna poprawa nie jest dowodem
skalibrowanego realizmu całego meczu.

16/16 pełnych fixtures kończy się bez awarii/cenzorowania; dwa U-17 mają identyczny
cały stan observer ON/OFF. Te same 12: podania 25853→25177, strzały 21→21,
final/box 567/39→608/62, CM 3356→3532 (14,741→16,064% ukończeń).
Straty 2798→3190 i faule 196→219 pogarszają się. Nie deklarujemy rozwiązania
recyklingu: mniej podań na sekwencję może też oznaczać stratę. Pełne źródła,
odrzucone warianty oraz granice prognozy i testów są w raporcie.

Pełny `npm run verify` w CI: **PASS — 1858 testów**, lint, TypeScript i build
(Node 24.21.0 / Ubuntu, `ba2b6d3`, źródła core `72bd46ea…`). Lokalny Node 24.19.0
ma jeden zbiorczy timeout 5 s; izolowany test przechodzi bez zmiany limitów.
Status: **draft do oceny poprawek fizyki i ich kompromisów**, bez deklaracji
pełnego spełnienia aspiracyjnego celu rozumienia przewagi dynamicznej przez AI.

Autorytatywna kolejność: **PR174** kombinacje/adaptacja → **PR175** niezależna
walidacja meczu → **PR176** generacje/siła świata → **PR177** summary/PlayStyles
→ **PR178** UX kariery i strzału → **PR179+** świat. Zakres na początku
[ROADMAP](ROADMAP.md) zastępuje starsze numery w historycznych sekcjach poniżej.

## PR172 — Match Realism: poprawność i zamrożone decyzje

Baza: scalony PR171 `6b2ddaa`. Naprawiono kolejność keeper handover przed geometrią,
nieosiągalny mur przy linii końcowej, autoryzację kickoff dopiero po fizycznym powrocie
keeperów, pełną orientację odbić i różne odpowiedzi normalna/styczna dla block/parry.
Nominalny owner nie może już kopnąć wypchniętej piłki poza zasięgiem stóp. Własny
odzyskiwalny stride nie otwiera błędnego heavy-touch prompt ani nie kończy carry
przed odzyskaniem. W celowaniu technika poprzedza osobne potwierdzenie wykonania.

16/16 tych samych pełnych fixtures kończy się bez awarii i cenzorowania; cztery
dokładne stare stany także kończą. Historyczne pliki PR171 są identyczne. W tych
samych 12 wcześniej pełnych meczach: 26101→25853 podań, 14→21 strzałów,
34→39 box entries, CM 3316→3356 (14,411→14,741% ukończeń), rożne 3→3.
Podania na sekwencję wzrosły 8,962→9,021: kreacja nadal wymaga badań.

40 realnych frozen states / 267 pojedynczych kontrfaktów odtworzono dokładnie
na PR171. Nie wdrożono niepotwierdzonej premii progresji, pozycji CM ani zmian
wsparcia. Dwa pełne U-17 mają identyczny cały stan observer ON/OFF. Spokojny
pomiar 60 s: plain CPU 1257,01→1320,95 ms (+5,09%); nie deklarujemy przyspieszenia.

Końcowy `npm run verify`: **PASS — 1840 testów**, lint, TypeScript i build. Browser smoke w Edge zatrzymało narzędzie
Computer Use z powodu braku pewnego bieżącego URL; pozostaje ręczny przegląd UI.
Przyczyny, wyniki, regresje, wszystkie ograniczenia i polecenia:
[raport PR172](PR172_MATCH_REALISM_CALIBRATION.md).

Następne: **PR173** generacje/siła świata → **PR174** summary/PlayStyles i spójne
dane udziału/zmian. **PR175+** rozszerzanie świata; historia/archiwum/kalendarz
pozostają późniejszym UX. Nie traktować obecnych rzadkich okazji jako gotowego
realistycznego celu dla summary. Autorytatywny zakres jest na początku roadmapy.

## PR171 — Match Reality Diagnostic Audit

Baza: scalony PR170 `1b7e2e0`. Wyłącznie diagnostyka, eksperymenty i raport:
kanoniczne decyzje, fizyka, bilans kariery i format zapisu pozostają bez zmian.
Istniejący lejek ma opt-in okresy, zegary, histogramy, CM sampling i ślady strzałów,
ograniczone pamięciowo i odporne na powtórzone obserwacje/stare eventy prezentacji.

12 pełnych meczów / 24 obserwacje zespołu: średnio 1087,54 podań, 0,58 strzału
i 0,13 rożnego na zespół. Uzgodniono 26101 fizycznych podań z oficjalną księgą;
CM otrzymali 3316/23010 ukończeń. Lejek pokazuje 3041 kontrolowanych sekwencji,
561 wejść final i 34 box. Elitarna referencja StatsBomb jest porównaniem struktury,
z jawnymi różnicami definicji i brakiem odpowiedniej referencji U-17.

Nie ukryto dwóch przebiegów cenzorowanych na 7200 s ani dwóch awarii silny–słaby.
Keeper handover odtwarza brakujący cel geometry jednym tickiem; obie długie
przerwy mają `wall_developing` i rosnący wymagany koniec. Osobne próby badają
orientację odbić, 22 wybory AI, 72 kontakty strzałów, 9 carry i 5 restartów.
Naturalne 14 strzałów nie daje podstaw do strojenia populacyjnej skuteczności.

Pełne mecze U-17 w obu orientacjach mają identyczne hasze całego stanu observer
ON/OFF; krótkie pary i cenzorowane replays także są zgodne. Produkcyjna przeglądarka
potwierdza podanie człowieka, Simulate Remainder, commit/reload wyniku i DEV export.
Pełne `npm run verify`: **PASS — 1801 testów**, lint, TypeScript, build.
Metody, niepewność, koszty observerów, dowody i odpowiedzi na 30 pytań:
[raport PR171](PR171_MATCH_REALITY_DIAGNOSTIC_AUDIT.md).

Następny **PR172**: najpierw keeper handover/restart liveness, potem poparte
eksperymentami mechaniki orientacji, kreacji/CM, kontaktu i human intent.
**PR173** generacje/siła świata → **PR174** summary/PlayStyles i spójne zmiany.
Zwarta historia/archiwum i poprawki kalendarza mają osobny UX follow-up po PR174
(wyjątek: odtworzony blokujący błąd wymagający wcześniejszego maintenance).
Autorytatywny zakres jest na początku [roadmapy](ROADMAP.md).

## PR170 — Match Atmosphere, Stylized Visual Polish & Career UI Refinement

Baza: scalony PR169 `77fd3a3`. Trzy stadiony PR161 mają czytelniejsze sektory,
zadaszenia z odcięciem przy kamerze, tunel i strefę techniczną. Statyczne moduły
są instancjonowane; widownia ma ograniczone kosmetyczne reakcje po prawdziwym
golu. Ławka wykorzystuje wyłącznie rzeczywistych uczestników, poza pickingiem
i fizyką. Stabilne DNA PR165 pozostaje; opcjonalne faceted ma klasyczny fallback.
Krótkie, pomijalne podpisy kanonicznych przejść i podsumowanie końca nie zapisują
wyniku samodzielnie. Usunięto nadmiarowy status gracza i żółte pole interakcji;
wybór gracza/piłki/bramki/punktu i akcje klawiatury są w panelu decyzji.

Wspólna polityka generowania/odczytu/przyjęcia ogranicza oferty zewnętrzne do
sześciu, z osobnym odnowieniem. Siatka 3/2/1 kolumn, prawdziwy ledger finansów,
mały kalendarz tylko do odczytu pod niezależnie przewijaną tabelą. Edge sprawdził
1920/1366/820/390 px, tabele 12/16/20/24, transfer i odnowienie z reloadem oraz
karierę 3D z rzeczywistym podaniem i zapisaną kontynuacją canonical_plus_summary.

Lokalne pełne `npm run verify`: **PASS — 1788 testów**, lint, TypeScript, build.
Końcowy pełny przebieg i dodatkowe 15 regresji po korekcie daty starego zapisu
również zakończyły się sukcesem. W porównaniu z PR169 wszystkie
hasze kanoniczne pozostają identyczne. CPU minuta: 2,378 → 2,464 s bez
obserwatorów; 3,133 → 3,351 s z kontekstem. Draw calls stadionów 964/983/1009
→ 901/903/903, pierwszy import 3D +3137 B, drugi 0 B z cache. Bez obietnicy
przyspieszenia CPU. Dokładna metoda, ograniczenia, zrzuty i 30 odpowiedzi:
[raport PR170](PR170_MATCH_ATMOSPHERE_VISUAL_POLISH.md).

Następne: **PR171** niezależna diagnostyka, **PR172** kalibracja oparta na
dowodach, **PR173** pokolenia/siła świata, **PR174** lekka symulacja/PlayStyles,
**PR175+** rozbudowa świata. Autorytatywny zakres pozostaje na początku
[roadmapy](ROADMAP.md); poniżej historia wcześniejszych etapów.

## PR169 — Career Stories, News, Match Narratives & Career History

Baza: scalony PR168 `19cb7af`. Wiadomości, wątki kariery, podsumowania sezonu
i emerytury są czystymi projekcjami rzeczywistych faktów, księgi udziału,
pamięci i snapshotów. Historia ma zwarte, filtrowane wiersze oraz archiwa
montowane po rozwinięciu. Dawne nazwy klubów i pierwsze osiągnięcia zachowują
własną tożsamość; statystyki kariery nie sumują ponownie bieżącego snapshotu.

Pełny kanoniczny mecz otrzymuje jawną ocenę pozycyjną 3–10, zapisywaną raz
w księdze, historii, receipcie i archiwum. Hybryda bez akcji indywidualnych
końcówki ma jawny brak oceny. Retencja zachowuje dokładne czasy, osoby i znane
powody własnych zmian; szczegóły występu są wyłącznie do odczytu.

Osiągnięcia końca sezonu są zapisywane przed transferem, zmianą roku i emeryturą,
z właściwym sezonem i klubem. Najwyższa liga daje mistrzostwo, niższa odrębne
zwycięstwo ligi. Usunięto stare propozycje płacowe z granicy letniego okna;
przyjęcie umowy ma walidację, blokadę kliknięć, oczekiwanie na zapis i widoczny
błąd/retry. Prawidłowe odnowienia w wieku 25/36 są objęte regresją. Oryginalny
wadliwy zapis użytkownika nie był dostępny; nie przypisujemy usterki wiekowi.

Ta sama rzeczywista kariera 25 sezonów zachowuje identyczne wyniki sportowe
w PR168 i PR169. Zapis: 1 414 514 → 1 414 048 B. Mediana pełnych projekcji
historii/wiadomości/statystyk: 8,61 ms (100 powtórzeń, bez renderowania).
Edge potwierdza filtry, archiwum tylko do odczytu, szerokość 390 px,
odnowienie z reloadem, komunikat błędu, emeryturę i rzeczywistą hybrydę 3D.

Pełny `npm run verify`: **PASS — 1773 testy, lint, TypeScript i build** w
niezmienionym CI. Edge potwierdził także ocenę 6,5 rzeczywistego pełnego meczu.
600 kopii kompaktowych receiptów 3D: 3 461 188 → 3 872 978 B; permanentne dane
rosną liniowo i przy wielu meczach przekraczają soft budget 3 MB.
Szczegółowe dowody, parowane pomiary i ograniczenia zawiera
[raport PR169](PR169_CAREER_STORIES_NEWS_SEASON_NARRATIVES.md).

Następne: **PR170** oprawa i porządki UI, **PR171** diagnostyka,
**PR172** kalibracja oparta na dowodach, **PR173** pokolenia i siła świata,
**PR174** lekka symulacja i PlayStyles, **PR175+** rozbudowa świata.
Autorytatywny zakres jest na początku [roadmapy](ROADMAP.md).
Poniższe etapy i ich ówczesne plany są zapisem historycznym.

## PR168 — Coaches, Tactical Intelligence, Transfers & Career UX

Baza: scalony PR167 `2ddeb35`. Wspólny solver porównuje preferowane i drugie
ustawienie z kosztem zmiany; prognozy transferowe i obecna rola używają tej samej
hierarchii. Lista obejmuje do ośmiu wiarygodnych ofert. Zmiana trenera zachowuje
kontrakt i znajomość pozycji, a zmienione oczekiwania są widoczne.

Opcjonalna ocena sytuacji analizuje kanoniczne dostępne akcje bez RNG lub zmiany
stanu. Indeksy pozostają jawną heurystyką. Poprawka prowadzenia rozdziela dojście
do wypchniętej piłki od kierunku następnego rzeczywistego kontaktu. W kontrolowanych
ostrych skrętach niepotrzebna przejściowa strata spada 2/2→0/2; końcowe posiadanie
pozostaje 2/4. Nie jest to globalna kalibracja ofensywy.

Nowe style człowieka wymagają trzech sezonów i co najmniej 24 miesięcy evidence;
stare osiągnięcia i tożsamości NPC pozostają. Wybór meczu działa w oknie kariery,
emerytura ma jasny układ, rzeczywistą historię i portret, liczby są formatowane
wyłącznie przy wyświetlaniu. Sprawdzono rzeczywiste Edge i 18-sezonową karierę.
Końcowy `npm run verify`: **PASS — 1742 testów, lint, TypeScript i build**.
[Raport PR168](PR168_COACHES_TACTICAL_INTELLIGENCE_CAREER_IMPROVEMENTS.md).

Następne pozostają **PR169** historie/wiadomości i bogatsza prezentacja udziału
w meczach, następnie **PR170** atmosfera i oprawa. Poniżej historia wcześniejszych etapów.

## PR167 — NPC Development, Footballer Diversity & Flexible Career Matches

Baza: scalony PR166 `678c75a`. Osiem istniejących krzywych rozwija teraz
specjalizacje, stabilne okresy stagnacji, charakter i środowisko macierzystego
klubu/akademii. Projekcja po dacie pozostaje czysta; potwierdzone doświadczenie,
wyjątkowe nadpisania i chwilowa kondycja mają osobne warstwy. NPC trafiają do
wspólnego runtime ze swoimi rzeczywistymi profilami i maksymalnie dwoma stylami.
Karty klubowe ujawniają obecne atuty i źródło stylu, bez przyszłych prognoz.

Każdy fixture skierowany przez dotychczasowe reguły do rozgrywania oferuje
„Rozegraj mecz 3D” / „Symuluj mecz” przed importem runtime. „Symuluj do końca”
zatrzymuje kanoniczny prefiks i domyka wyłącznie resztę czasu lekkim modelem.
Kontrakt wyniku v2/source v1 zachowuje wynik, udział, kartki, zmiany, urazy,
kondycję i rzeczywiste decyzje. Indywidualne statystyki akcji końcówki pozostają
jawnie niepełne; nie przypisuje się fikcyjnych strzelców ani kontaktów.

Zapis v7 i trzy bogate wyniki aktywnego sezonu pozostają; kompaktowe receipts
chronią idempotencję i źródło danych. W Edge sprawdzono oba wybory U-17/pro,
trzy wybory w UI (dwa rozstrzygnięte przed przekazaniem) i kontynuację,
anulowanie, odczyt oraz kolejny fixture.
Końcowe `npm run verify`: **PASS — 1702 testy, lint, TypeScript i build**.
Pomiary oraz odpowiedzi na 25 pytań: [raport PR167](PR167_NPC_DEVELOPMENT_FOOTBALLER_DIVERSITY.md).
Otwarte pozostają pełna historia środowisk treningowych, szczegółowe akcje
statystycznej końcówki i zaobserwowany przypadek nadmiernego doliczenia pierwszej
połowy. Nie deklarujemy ogólnej naprawy liveness ani kalibracji silnika.

Następny etap: **PR168 — Coaches, Match Briefings & Tactical Intelligence**,
potem **PR169** narracje i wiadomości oraz **PR170** atmosfera i oprawa.
Poniżej historia wcześniejszych etapów.

## PR166 — Career–Match Integration & Behavioural PlayStyles

Baza: scalony PR165 `ebb88a5`. Grywalny fixture U-17 i profesjonalny przechodzi
przez kontrakt PR164 do współdzielonego runtime 3D, następnie przez jeden
walidowany wynik do księgi udziału, kondycji, dyscypliny, historii i kolejki zapisu.
Trener wybiera rzeczywisty skład oraz siedmiu rezerwowych; ławka nie wymusza
występu. Rutynowa symulacja i istniejący kalendarz pozostają dostępne.

Sześć stylów korzysta z bounded, rozstrzygniętego evidence decyzji człowieka,
przenoszonego między sezonami. Skutki są lokalne: mała ulga przygotowania,
bliska antycypacja albo regeneracja po wysiłku. Trzy ostatnie bogate wyniki
bieżącego sezonu pozostają w zapisie; permanentne receipts chronią rekordy,
progres i idempotencję. Niezapisany mecz restartuje od początku. Przerwanie
ma jawny status; późniejsza adjudykacja i mid-match resume nie są dostarczone.

Druga połowa odwraca fizyczne cele/geometrię/przepisy bez teleportowania ciał
i zmiany klubowej własności score. Menu deduplikuje identyczne mechaniki,
pozostawiając rozróżnialne intencje. Wygląd PR165 i lazy loading są wspólne.

[Raport PR166](PR166_CAREER_MATCH_INTEGRATION_PLAYSTYLES.md) zawiera architekturę,
24 odpowiedzi, końcowe verify, browser smoke, pomiary i ograniczenia.
Następny etap: **PR167 — NPC Development & Footballer Diversity**, potem
PR168 trenerzy/inteligencja, PR169 narracje, PR170 atmosfera. Poniżej historia.

## PR165 — Visual DNA & Character Creator

Baza: scalony PR164 `4f08a37`. Wspólny resolver v1 używa istniejącego `FaceGenome`,
stałego ID/seed oraz daty urodzenia. Model meczowy, replay, portret, kreator i profil
zachowują tę samą twarz. Kreator ma etap wyglądu, profil zapisuje kosmetykę, a starsze
zapisy v3–v7 są zgodne. Wygląd pozostaje poza danymi, RNG i fizyką piłkarską.

Równoważny późny wolny wykazał `wall_developing`: rozdzielanie celów przesuwało mur
w obszar kolizji z markerem. Stałe cele muru przywracają legalne wykonanie w 4/4
wariantach po około 8,6 s. Eksport historyczny nie był dostępny; jego dokładna
przyczyna pozostaje niepotwierdzona. Bramkarz zbiera i przekazuje piłkę zawodnikowi
z pola; maksymalna głębokość od własnej bramki spada z 53,5 do 5,4 m. Transfer oraz
powrót z tylnej siatki są ciągłe, bez dodatkowych statystyk podań.

240 prób podań i 42 eksperymenty krycia rozdzielają ofertę, ranking i wykonanie.
Eksperymentalne krycie pozostaje poza produkcją: lepsza bliskość napastnika kosztuje
rozciągnięcie linii, a osłona skrzydła przez DM może odsłonić środek.
Start nadal pobiera około 116 kB Brotli; podgląd Three.js jest lazy. Mediana zgłoszenia
klatki 22 samych modeli rośnie z 1,2 do 1,9 ms na Radeon 780M, bufory geometrii
pozostają 6,6 kB. Kosmetyka dodaje 340 B zapisu; własna twarz 706 B.

Końcowy status `verify`, 32 odpowiedzi, galeria i ograniczenia:
[raport PR165](PR165_VISUAL_DNA_CHARACTER_CREATOR.md).
Następny pozostaje **PR166 — Career–Match Integration & Playstyles**, potem PR167
rozwój NPC, PR168 trenerzy, PR169 narracje i PR170 atmosfera. Poniżej historia.

## PR164 — Startup, Storage, Match Contracts & Restart Integrity

Baza: scalony PR163 `f812e96`. Wykonany restart zachowuje własność epizodu i nie
wraca do przygotowania po pojawieniu się `ball.shot`. Mur ceremonialnego wolnego
ustawia się przed ostatecznym wyborem; zgoda sędziego pochodzi z gotowości kanonicznej.
Cel bramki wyznacza dostępne techniki, a strzał w rzeczywisty mur korzysta ze wspólnej
fizyki. Replay spalonego zatrzymuje się na zachowanym momencie podania.

Lazy shell/kariery/Lab i nawigacja w aplikacji ograniczają zimny transfer menu
około 402→117 kB Brotli; drugi mecz tej samej sesji pobiera 0 dodatkowych bajtów
modułów. Rzeczywista przeglądarka HTTP oraz artefakty produkcyjne są mierzone osobno.
Deterministyczna kariera ścieżki podsumowań po 20 sezonach ma 1,21 MB UTF-8.
Naprawiono zachowanie kondycji przy zapisie v7 i serializację migracji/operacji storage.

Zod kontrakt wejścia/wyniku v1 łączy prawdziwy fixture kariery z kanonicznym silnikiem,
ogranicza wynik do 96 kB i zapewnia idempotentny commit po save/load. Pełny test
rozgrywa ten sam fixture dwukrotnie z decyzjami człowieka. Integracja ekranów kariery
z kanonicznym meczem oraz archiwizacja bogatych wyników pozostają w PR166.
Obecne UI kariery zachowuje ścieżkę narracyjną. Nie kalibrowano globalnie prędkości
podań: laboratorium 120 prób oddziela lot, opanowanie i następną fizyczną akcję.

Wyniki, status pełnego `verify`, 36 odpowiedzi i ograniczenia są w
[raporcie PR164](PR164_STARTUP_STORAGE_MATCH_CONTRACTS.md).
Oryginalne eksporty `lab-mv3zlmht`/`lab-mv40xcii` nie były dostępne;
regresja restartu ma równoważny fixture. Mała liczba strzałów i asymetria ID 4-4-2
pozostają otwarte. Następny etap: **PR165 — Visual DNA & Character Creator**,
następnie PR166 integracja/style, PR167 rozwój NPC, PR168 trenerzy, PR169 narracje,
PR170 atmosfera. Poniższe sekcje są historią poprzednich etapów.

## PR163 — Offensive Momentum / Space Passing

Baza: scalony PR162 `34ee3da`. Połączono świadome przygotowanie przyjęcia,
kierunkowy kontakt, kontekstowe korytarze sprintu i zwykłe podania NPC w przestrzeń.
Celowe przepuszczenie piłki pozostaje brakiem kontaktu: nie nadaje własności,
zaliczenia podania ani ochrony przed obrońcą. Długi przerzut do tyłu nie uzyskuje
już intencji ofensywnej tylko przez odległość. Człowiek zachowuje wybór,
a jawne prowadzenia zachowują dotychczasową księgę statystyk.

Oryginalny `lab-mv3lzwth`: 1162 próby, 1063 ukończenia, zero strzałów.
Prowadzenie było dostępne i początkowo najlepsze; podczas zatrzymanego przyjęcia
obrońca zmniejszał dystans około 8→5 m. Oryginalny eksport nie zawiera pełnego
stanu/orientacji, więc przypadki Barana i Kowalskiego są równoważnymi fixture.
Wyniki, status pełnej walidacji, parowane mecze, koszt CPU i ograniczenia są w
[raporcie PR163](PR163_OFFENSIVE_MOMENTUM_SPACE_PASSING.md).
Ogólna kreacja strzałów pozostaje otwartym problemem. Asymetria równych 4-4-2
i rozbieżność prognoz ukończenia pozostają jawne.

Następny etap: **PR164 — Startup, Storage & Match Contract Audit**.
Poniższe sekcje opisują wcześniejsze etapy.

## PR162 — Integrated Match Realism / Formation Geometry Audit

Baza: scalony PR161, `4d61ee8`. Dodano legalne, równe składy wszystkich pięciu
formacji, niezależny lejek ataku, sparowane seedy/orientacje i wznawialny headless
benchmark. Poprawki dotyczą czasu percepcji przy zachowaniu fizycznej gotowości,
zadania głębi/kompensacji, wspólnej prognozy podań, wykonalnej geometrii wznowień
oraz prawdziwych współrzędnych kontaktu przy linii.

Oryginalny eksport `lab-mv2ymq0c` potwierdza 930 podań, 0 strzałów i 0 wejść w pole
karne. Trzy kontrolowane sytuacje przy polu karnym: strzały 1→5, oczekiwanie
5,04→0,40 s. Szybsza cyrkulacja sama nie rozwiązuje braku okazji. Nie uznajemy
balansu ofensywy za naprawiony; pokrycie, wyniki 120/120 pełnych meczów i ograniczenia są w
[raporcie PR162](PR162_INTEGRATED_MATCH_REALISM_AUDIT.md) oraz
[tabelach kanonicznych](performance/PR162-EVIDENCE_TABLES.md).

Macierz 12 seedów × 5 formacji × 2 strony daje tylko 36 strzałów; wykryto też asymetrię równych 4-4-2 przy zachowanych logicznych ID. Osobno: 6 meczów klubów, 18 okien wrażliwości, 2 pełne mecze 70/50 i 12 legalnych prób dobitki na każdej rewizji. Publiczne raporty liczbowe mają źródła i hashe; pełne dane pozostają w lokalnym archiwum. Końcowa poprawka schematu pamięci fizycznego kontaktu ma osobny dowód identyczności dwóch pełnych meczów.

Nie zmieniono skuteczności strzałów, odbioru ani praw człowieka do decyzji.
Stadion nadal zależy od klubu; modele piłkarzy, widzowie/sprite i zapełnione ławki
pozostają osobnym zadaniem prezentacyjnym. Szczegóły poprzednich PR poniżej są historią.

## PR161 — Match Presentation, Replay, Stadium Polish & Boundary-Ball Liveness

Baza: scalony PR160 / `main`, `d4b389b3db5e14e9ebc61bb1ec8bce21e3557a85`.
Wdrożono wspólne fakty kanonicznej prezentacji, kontakty/keyframes, oddzielne
tożsamości zmian, overhead/diagnostykę, sterowanie replay, zegar okresu/doliczenia,
dwie rezerwy w UI i kosmetyczne stadiony stabilne dla klubu.

Potwierdzono w równoważnym fixture `lab-mv2640wz` niezgodność legalnego środka piłki
z walidacją celu acquisition: y=-0,0324 odrzucało pursuit mimo piłki nadal w grze.
Poprawka pozostawia prawdziwą piłkę i istniejący zasięg stopy; odzyskanie po 0,775 s,
12/12 przypadków granicy, realny release i open play po prawidłowym aucie. Oryginalnego
pełnego eksportu nie dostarczono. Renderer/replay nie rozstrzygają futbolu.

Pełne `npm run verify`: lint, 1529 testów głównych/182 pliki, 5 testów kariery,
TypeScript i build PASS. Medianowy koszt minimalnego fixture +0,24%; osobny zapis
replay/context +16,48%. Mecz kontrolny kończy się przy 90+1: 877 prób podań,
1100 kontaktów publicznych, 5 zmian, 0 strzałów; bez zakleszczenia.
Wyniki wszystkich trybów i 30 odpowiedzi: [raport PR161](PR161_MATCH_PRESENTATION_REPLAY_STADIUM.md).
Małe eksporty rzeczywistej sceny/rigów SVG są dowodem software; natywne WebGL/FPS
i układ UI wymagają interaktywnego przeglądu po timeout lokalnej przeglądarki narzędziowej.
Następnie **Combined Match Engine Realism & Playability Audit**. Zero/niski wolumen
strzałów, udział CM, obroty, sztywne odtwarzanie formacji i contest/ranking nadal otwarte.
Poniższe wyniki PR160 i starszych etapów zachowano jako historię.

## PR160 — Fatigue, Injuries, Substitutions & Added Time

Baza: scalony PR159, `09c05fa9c09edf89cd8310485a61560eb67e4cde`.
Implementacja i pełne `npm run verify` zakończone: lint, 1452 testy główne w 177
plikach, 5 testów kariery i build. Pełny mecz kontrolny kończy się legalnie po
90+1 minutach; 5 rzeczywistych zmian, 1 przejściowy dyskomfort i 0 strzałów.
Skupiony pomiar CPU wykazuje +22,54% kosztu (8,221→10,073 s na 300 s symulacji).
Oryginalny seed i XI odtwarzają
naturalny faul/karny: jeden uczestnik zatrzymywał się w promieniu dojścia, lecz nadal
w polu karnym. Istniejący margines celu 0,3 m obejmuje teraz także cel tuż za linią.
Ten sam zakleszczony stan wykonuje karny po 0,375 s; CPU matrix 6/10→10/10.

Kanoniczny rzeczywisty ruch/kontakt zmienia długą rezerwę i szybką gotowość;
fizyczne efekty mają wspólną ścieżkę człowieka/NPC. Kontekstowe urazy, rzeczywista
ławka, legalne wyjście/wejście, decyzje trenera, statystyki i kontrola gracza są
połączone z ledgerem utraconego czasu. Minimum ogłoszonego doliczenia jest monotoniczne,
a końcowy karny/retake kończy się fizycznie przed gwizdkiem. UI/replay projektują
zejście, wejście, nazwane wydarzenia i czas; nie podejmują decyzji futbolowych.

Datowana kondycja i zdrowie korzystają z obecnego kalendarza/overlay świata.
Adapter i zapis kanonicznego występu zachowują rzeczywiste obciążenie; obecna narracyjna
ścieżka kariery jawnie używa `source: summary`. Przyszłe podłączenie kanonicznego
ekranu kariery i wszystkie obciążenia NPC z meczów tła pozostają granicą integracji.
Nie ma nowego kalendarza, mutacji trwałych atrybutów ani kampanii 18 meczów.

[Raport PR160: 30 odpowiedzi, liczby, trace i granice](PR160_FATIGUE_INJURIES_SUBSTITUTIONS_ADDED_TIME.md).
Otwarte problemy PR158/PR159 nadal obowiązują. Następny **PR161 — Match Presentation /
Replay / Stadium Polish**, potem wspólny audyt całego silnika. Poniższe sekcje
zachowują wyniki historycznych etapów; PR159 jest scalony.

## PR159 — Dead Ball & Restart Continuity

Baza: scalony PR158, `main`, `a7c90299c01c080eb356fe88e0ef47d4a7b1f639`.
Implementacja i wymagana walidacja zakończone, draft do przeglądu. Końcowe
`npm run verify` PASS: lint, 1367 testów głównych, 5 kariery i build. Kod dowodów:
`6e303b97eb1d82685f206fd1aea5dd5aeea5969a`. Krótki smoke: 12/12 release/open play,
0 m award displacement; focused runtime +16,4%, bez wniosków o całych meczach.

Naturalny restart zachowuje pozycje/prędkości i realną piłkę. Niezmienny incident
oraz legalny spot prowadzą przez odzyskanie, ruch do stref, odczyt gotowości,
wybór i fizyczne przygotowanie do wspólnego resolvera. DEV injection pozostaje
jawnym zamrożonym fixture. Controlled non-throw restart zawsze wymaga człowieka;
odrzucona autonomous propozycja nie zużywa execution RNG ani nie tworzy statystyk.
Menu daje wide direct shots i kilku odbiorców/delivery bez filtra xG. Canonical
spin/Magnus rozróżnia curl/dip; mur używa rzeczywistych kapsuł, prześwitów i skoku.
UI/replay tylko projektują realny ball, spot, taker, mur, target i readiness.

Po golu kontekstowa reakcja oraz rzeczywisty retriever prowadzą do kickoff dla
zespołu, który stracił gola. Ograniczony ledger zapisuje kanoniczne przerwy i
milestone; actual added-time policy należy do PR160. Testowane przepisy mają
referencję IFAB 2026/27. Pełny handball, countdown/pełny penalty protocol i
przedłużenie połowy na penalty pozostają poza obecnym wdrożeniem. Indirect goal
wymaga innego kontaktu; obecne menu indirect nadal nie proponuje shot ku bramce.

Otwarte diagnozy PR158 pozostają: shots 110→16, goals 68→10, CM touches
4957→3461/receptions 2831→1993, adjacent-tick flips 24→94, spells <0,5 s
51→189 oraz prolonged/low-progress rotations. Naprawa wznowień nie dowodzi
poprawy open-play realism. Historyczne wyniki i draft/calibration uwagi PR158
poniżej zachowano jako dokumentację tamtego etapu; PR158 jest już scalony.

Dowody skupione, exact-state observer parity, odpowiedzi na 15 pytań i ograniczenia:
[PR159_DEAD_BALL_RESTART_CONTINUITY.md](PR159_DEAD_BALL_RESTART_CONTINUITY.md).
Następnie PR160 fatigue/injuries/substitutions/added time, PR161 presentation/replay/stadium,
potem wspólny full-match diagnostic and realism audit.

## PR158 — Ball Contact Geometry, Press Resistance, Duel Cadence & Tactical Pressing Intelligence

Baza: scalony PR157 / `main`, `73c0fabed04ee4a31da85fa918f19bbc42344975`.
Kontrolowana piłka ma jeden ograniczony plan kolejnego kontaktu i rzeczywistą prędkość.
Między osiągalnymi kontaktami stóp porusza ją wspólny integrator; sam obrót ciała nie
obraca ani nie przenosi piłki. Geometria stóp i osłaniającego tułowia rozróżnia dostęp
do odsłoniętej piłki od samej bliskości posiadacza. Siła i zwinność wpływają na utrzymanie
równowagi przy rzeczywistym kontakcie z osłaniającym ciałem. Identyczne wybrane kontakty
człowieka i NPC nadal korzystają ze wspólnego resolvera oraz istniejących blokad pojedynku.
Publiczny kontakt pozostaje jednym ciągłym epizodem kontroli, mimo wielu mikrokontaktów.
Fizyczne kontakty nie dopisują już historii ID przy każdym impulsie: deduplikację zapewnia
jeden opcjonalny znacznik ostatniego kontaktu na zawodnika. Stare zapisy zachowują historyczne
ID, a odtworzenie kontaktu po zakończeniu kontroli lub połowy nadal nie dubluje statystyk.
Rejestry podań, strzałów i epizodów kontroli pozostają dyskretną księgowością.
Naprawa `47f99f54` ma 34 zaliczone testy skupione i dokładny parytet eksportowanego futbolu:
18 okien, 1760 prób kontaktowych i 210 scenariuszy taktycznych. Pełne `npm run verify`
zalicza lint, 1263 testy główne/163 pliki, 5 testów kariery/1 plik i build; skrypty
benchmarkowe przechodzą ścisły TypeScript. Izolowane trzy pary jednej konfiguracji raportują release_minimal -2.64%, normal -2.41%, dev +3.02%, capture -1.22%;
osobny obserwator dodaje +2.50% mediany czasu. Wynik nie dowodzi szerokiego
przyspieszenia; pełne zakresy, hashe i ograniczenia są w raporcie.

Sześć ciągłych preferencji opisuje wysokość i zwartość bloku, pressing zorganizowany,
counterpressing, cierpliwość oraz pionową progresję. Gotowość odbiorców, dostępne wyjścia,
orientacja, jakość kontaktu, lokalna przewaga i asekuracja decydują o pressingu albo
osłonie linii. Dopasowanie do rzeczywistej XI jest ciągłe; preferencja nie zwiększa jakości
fizycznego wykonania. Krótsza użyteczna trasa może być cenniejsza od niepotrzebnego sprintu.

Obserwator oddziela stratę→presję, stratę→opanowane odzyskanie, presję→odzyskanie,
odzyskanie→progresję, strzał i gol. Zegary nie są deadline'ami; przerwy cenzurują epizody.
Obciążenie ruchowe jest ograniczonym pomiarem bez utraty kondycji. Cel interakcji ma
32–48 pikseli CSS zależnie od projekcji i filtruje legalnych zawodników; fizyczny zasięg
odbioru pozostaje niezależny. Testy rozdzielają faktyczny faul/korzyść i ręczny scenariusz
DEV: późniejsze wznowienie DEV nie usuwa wcześniej prawidłowo wykonanego strzału.
Projekcja prowadzenia na żywo i w powtórce zachowuje pozycję kanonicznej piłki; animacja
nie przykleja jej ponownie do orientacji twarzy i nie maskuje ruchu między kontaktami.

Nie odnaleziono oryginalnego interaktywnego eksportu z 208 próbami ani opisanego capture
752,05 s; te liczby nie są zweryfikowaną bazą. Pełne pomiary, weryfikacja, jawne pogorszenia
i ograniczenia: [PR158_BALL_CONTACT_PRESSING_TACTICS.md](PR158_BALL_CONTACT_PRESSING_TACTICS.md).
Osie trenerskie: [PR158_TACTICAL_PREFERENCES.md](PR158_TACTICAL_PREFERENCES.md).

Końcowa macierz zawiera 18 sparowanych okien po 90 minut na rewizję. Faktyczne statusy:
PR157 {"second_half":4,"full_time":14}, PR158 {"full_time":12,"second_half":6}; natywnego gwizdka
nie zastępuje sztuczne full-time. Próby odbioru 6645→4418, ukończone podania
10005→13074, strzały 110→16,
gole 68→10, sąsiednie przeskoki posiadania
24→94 i epizody <0,5 s
51→189 pozostają jawne.
Opanowanie luźnej piłki wymaga osiągalnego kontaktu stopy; wcześniejsza nominacja nie
rezerwuje piłki, nie zatrzymuje pogoni i nie przekazuje obcemu zawodnikowi zegara przygotowania.
Próg obrotu >180° ma przemieszczenie <2 m, >360° ma <3 m; sumuje także skany i odwracanie
kierunku. Dane dotyczą końcowego kodu `47f99f54b75785040c94e7e81c0799af79d42ceb92d501b09388c089be3ca0ba`, po naprawach wspólnej ścieżki
opanowania. Draft wymaga kalibracji przed scaleniem: udział środkowych pomocników
(publiczne epizody kontroli — touch — 4957→3461, przyjęcia 2831→1993)
spadł mimo większej liczby podań. Lab wymaganych zwrotów pogorszył obrót >360°/net<3 m
2→16
i faule 90→369.
Dowody integralności, wydajności, pełnego verify i ograniczenia zawiera raport.

Aktualna kolejność: **PR159 — Dead Ball & Restart Continuity**, **PR160 — Fatigue,
Injuries, Substitutions & Added Time**, **PR161 — Match Presentation / Replay / Stadium Polish**.
PR160 rozdzieli długotrwałą rezerwę i krótkotrwałą gotowość do intensywnego wysiłku;
PR158 nie włącza zużycia/regeneracji, urazów, zmian ani modyfikatorów wieku. Profile trenerów
i rozwój/starzenie pozostają później, bez wspólnej kary wieku na wszystkie umiejętności.

[Manifest dowodów](performance/PR158-evidence-manifest.json) opisuje zamrożone wejścia, kod i raporty w archiwum. Lokalny plik wynikowy/załącznik `outputs/PR158-evidence.zip` zawiera 824 wpisy ze sprawdzonymi hashami; pięć podsumowań odtworzono dokładnie z wejść. Sumę kontrolną ZIP zapisano osobno w lokalnych metadanych.

## PR157 — Dynamic Pressing, Ball-Carrier Response & Shooting Difficulty Calibration

Implementacja i wymagane walidacje zakończone na scalonym PR156, `83570049`.
Zamrożony kod kanoniczny: `977e70b1…`. Intencja pressingu
rozróżnia contain, screen, engage i emergency; cel engage prowadzi do fizycznie
dostępnego boku piłki. Agresja zmienia skłonność do zaangażowania, a kartka,
asekuracja i zagrożenie zmieniają ryzyko. Jakość identycznego kontaktu nadal zależy
od umiejętności i fizyki, bez premii do odbioru za samą agresję.
Posiadacz koryguje istniejące mikrocele i trasę prowadzenia względem przewidywanego
pędu pressującego; obrót, przyspieszenie i odzyskanie równowagi pozostają fizyczne.

`shootingDifficulty.ts` rozdziela ciągłą trudność strzału od końcowego wyniku:
finishing/heading odpowiada za umiejscowienie, technique za trudny kontakt/zwrot,
composure za presję, agility za kontrolę ciała. Ten sam profil służy resolverowi
i przybliżeniu oczekiwanego wykonania. Bramkarz nadal potrzebuje fizycznego kontaktu.
Naprawiono wpływ jego atrybutów na trajektorię strzelca oraz zmianę rejestru akcji
przez odrzuconą autonomiczną propozycję kontrolowanego strzału.
Usunięto niespójny warunek dostępu do osłanianej piłki, który wymagał dystansu
mniejszego niż dopuszczała separacja ciał; zasięg wspólnego resolvera pozostał ten sam.
Naprawiono też przedłużenie ukośnej trajektorii za linię bramkową i zapis fizycznego
wyjścia strzału za linię boczną. Wcześniejsza obrona/blok tego samego strzału pozostaje
ostatecznym wynikiem. Generowane główki NPC wybierają istniejący cel umiejscowienia;
jawny cel wybrany przez człowieka pozostaje wiążący.

`PressingTracker` jest wyłącznie obserwatorem: podejście → contain/screen → kontakt,
ucieczka/wypuszczenie → przekazanie/odzyskanie struktury. Statyczny epizod wymaga
bliskości do 2,6 m, prędkości obu aktorów i piłki względem ciała poniżej 0,35 m/s,
kontrolowanej piłki i co najmniej 2 s bez zmiany próbkowanego rozwiązania. Próby kontaktu są oddzielone
od zakończenia epizodu. Przypisanie pressującego jest odświeżane przy 4 Hz,
kosztowne opcje/geometria i próbki ewolucji przy 1 Hz, a prędkości oraz zmiany akcji,
trybu prowadzenia i mikrofazy są obserwowane co 25 ms. Sam wzrost indeksu decyzji
nie zeruje statycznego epizodu. Retencja to 256 epizodów po maksymalnie 8 próbek i histogram
w sekundowych przedziałach, z ostatnim przedziałem dla ≥240 s. Timer nie wpływa na decyzje ani ruch.

`npm run verify` przeszedł: lint, 1215 testów głównych w 156 plikach, 5 testów kariery
i build. Cztery nowe benchmarki przeszły ścisłą kontrolę TypeScript. Integralność obejmuje
66 porównań tożsamości, 124345 ticków przed decyzją, identyczne hashe/RNG normal/DEV/capture,
18 porównań wykonania strzału i 144 odrzucone propozycje z zerowym użyciem RNG.
W 12 sparowanych pełnych meczach na rewizję statyczne epizody spadły z 164/13126 (1,25%)
do 10/16243 (0,062%). Sześć naprzemiennych przebiegów po 600 s (3 pary) daje medianę
kosztu czasu ×1,00754, około +0,75%, bez renderera i bez zmiany kroku symulacji.

Ograniczenia pozostają istotne: liczba prób odbioru wzrosła 1112→4207, a strzałów spadła
214→74. Czas stania posiadacza pod dużą presją wzrósł 1824,81→3327,01 s, osłaniania
4390,15→13016,69 s. Mniej statycznych epizodów nie oznacza rozwiązania wszystkich
pasywnych sytuacji ani dowodu realizmu. Nasycone łatwe strzały/obrony, bloki muru,
geometria bramkarza i ostrożne zatrzymane mikroduelowe przypadki są jawnie opisane.
Raport, odtworzenie i dowody: [PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md](PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md).
Zwięzłe dane: [flow](performance/PR157-flow-summary.json),
[integralność](performance/PR157-integrity-summary.json),
[wydajność](performance/PR157-performance.json).

Aktualna kolejność po PR158: **PR159 — Dead Ball & Restart Continuity**, **PR160 — Fatigue,
Injuries, Substitutions & Added Time**, **PR161 — Match Presentation / Replay / Stadium Polish**.
PR157 nie dodaje menu wolnych PR159, kondycji, zmian ani nowej prezentacji.

## PR156 — Agency Parity, Passing Difficulty & Connectivity

Baza: scalony PR155, `cdbf07e0`. Wyłączona sprawczość zachowuje obserwacyjną tożsamość
kontroli, również w źródłach akcji. Każde wznowienie kontrolowanego wykonawcy poza autem
wymaga jawnego `human_selected`; rutyna, DEV i watchdog nie mogą go wykonać.
Podania korzystają ze wspólnej ciągłej trudności wykonania i prognozy przyjęcia/utrzymania.
Dolny zakres atrybutów oznacza bardzo słabą umiejętność; generowanie świata i OVR są bez zmian.
Niskie piłki w powietrzu mają rzeczywisty kontakt przyjęcia, oczekiwanie nie zakłada blokady,
a relacja overlap/underlap zostaje na tożsamości podania z chwili wypuszczenia.
Diagnostyka sieci, centralnych alternatyw i ewolucji wsparcia pozostaje ograniczonym obserwatorem.
Dowody, odtworzenie i ograniczenia: [PR156_AGENCY_PASSING_CONNECTIVITY.md](PR156_AGENCY_PASSING_CONNECTIVITY.md).

Aktualna kolejność po PR158: **PR159 — Dead Ball & Restart Continuity**, **PR160 — Fatigue, Injuries,
Substitutions & Added Time**, **PR161 — Match Presentation / Replay / Stadium Polish**.

## PR155 — Player Agency, First-Time Passing & Possession Stability

Baza: scalony GitHub #154, `235caf8a`. Każdy strzał kontrolowanego piłkarza przy
włączonej sprawczości wymaga `human_selected`, również pierwszy kontakt, główka,
karne i wolne. Autonomiczna propozycja strzału otwiera rzeczywistą decyzję niezależnie
od czułości oglądania i wcześniejszego przekazania rutynowej gry. Jawny tryb
`playerAgencyEnabled: false` nadal służy porównaniom bez interwencji.

Podania z pierwszej piłki korzystają ze wspólnego resolvera podań: do nogi, na dobieg,
do przestrzeni i górą. Mają fizyczny kontakt, błąd zależny od atrybutów/kontekstu
i zerowe oczekiwanie na opanowanie; NPC porównuje je z nowym przyjęciem, bez
dziedziczenia zegara poprzedniego posiadacza. Rutynowe przyjęcia pozostają autonomiczne.

Kontakt głową nie przyznaje już automatycznie posiadania. Oddzielono kontakt,
próbę opanowania i zabezpieczoną piłkę; ten sam nakładający się pojedynek powietrzny
uzbraja się ponownie dopiero po rozdzieleniu. Lokalne wsparcie obejmuje wyjście,
centralny pivot, trzeciego zawodnika, bieg szeroki i asekurację. Kolejna linia pomocy
może zejść do głębokiego rozegrania. Nie ma kwot kontaktów ani premii użytkowej CM.

Zakres, odtworzenie, wyniki wielu seedów i ograniczenia:
[PR155_PLAYER_AGENCY_STABILITY.md](PR155_PLAYER_AGENCY_STABILITY.md).
Historyczny opis autonomii PR152 poniżej jest od PR155 ograniczony twardą własnością
strzału człowieka. Pełna choreografia wznowień pozostaje kolejnym etapem.

Aktualna kolejność po PR158: **PR159 — Dead Ball & Restart Continuity**, **PR160 — Fatigue, Injuries,
Substitutions & Added Time**, **PR161 — Match Presentation / Replay / Stadium Polish**.

## PR154 — Situational Football Intelligence, Attribute Fidelity & Anti-Deadlock Calibration

Baza to scalony GitHub #153 (`7b175c7a`), uzupełniający statystyki/dyscyplinę PR152.
Dobór podania uwzględnia ETA odbiorcy i obrońców, zajętość korytarza oraz ryzyko wyjścia
piłki. Fizyczne wykonanie ma osobną, deterministyczną diagnostykę błędu. Zespół tworzy
natychmiastowe połączenia z pomocą i stoperem; presja zwiększa wartość wyjścia z posiadania.
Krótka pamięć rozwiązań rozszerza istniejącą `threatMemory`. Bramkarz i obrońca mają jednego
głównego wykonawcę interwencji, a pressujący zachowuje groźne krycie do bezpiecznego przekazania.

DEV zawiera macierz pojedynczych atrybutów, OVR zawodnika/XI/kadry i epizody reakcji wsparcia.
Dystans strzału ma jedno źródło w kanonicznym zdarzeniu strzału. Inwarianty kontroli,
statystyk i kroku 25 ms pozostają obowiązujące. Architektura, odtworzenie i dowody:
[PR154_FOOTBALL_INTELLIGENCE.md](PR154_FOOTBALL_INTELLIGENCE.md).

Kolejność planowana przy PR154 została zaktualizowana w PR155 powyżej.

## Rozszerzony zakres PR152 — statystyki i dyscyplina

Po scaleniu pierwotnego PR152 uzupełniono semantykę strat/wznowień, aktywne minuty decyzji,
kontrakt epizodów posiadania i bezpieczniejszy autonomiczny dobór wejść defensywnych.
W DEV rozdzielono udział kanoniczny, widoczny i rzeczywiste pytania człowieka; telemetria
obejmuje przyczyny strat oraz faule/kartki według techniki. Wyniki i ograniczenia:
[PR152_STATISTICS_DISCIPLINE.md](PR152_STATISTICS_DISCIPLINE.md).

## PR152 — Canonical Player Participation, Statistical Invariants & Match Sanity

Kontrolowany piłkarz korzysta ze wspólnej autonomii poza rzeczywistą decyzją człowieka.
Zachowano rzadkie znaczące wejścia PR151 i ciągłość wybranej intencji. Tożsamość sterowania
nie rezerwuje już samodzielnie terminalnych zagrań ani obrony, a jawny tryb bez interwencji
umożliwia deterministyczne porównanie tego samego zawodnika z NPC.

Odbiory mają jednoznaczną tożsamość próby/wyniku i wykonawcę; przydział posiadania zachowuje
uczestników po natychmiastowym wypuszczeniu piłki. Oddzielono odzyskania, bloki i pojedynki.
Eksport Match Lab v5 pokazuje tani raport kanoniczny i udział ukryty/widoczny bez DEV.
Pasmo ostrzeżeń pozostaje diagnostyczne. Audyt i dowody:
[PR152_CANONICAL_PARTICIPATION.md](PR152_CANONICAL_PARTICIPATION.md).

Po mechanice kontaktów PR158 kolejny etap to **PR159 — Dead Ball & Restart Continuity**: fizyczne ustawianie do wznowień,
reakcja po golu, celebracja/pilne wznowienie według wyniku i czasu, odzyskanie piłki po późnym
golu, gotowość wznowienia i fundament doliczonego czasu. PR152 nie implementuje tego etapu.

## PR151 — Match Cadence Calibration + Reactive Team Tactics

Połączono domknięcie playtestu PR150 z pierwszą reaktywną warstwą zespołów. Ograniczona,
zanikająca pamięć strat i zagrożeń zmienia normalne cele bloku, zwartość, wsparcie oraz
wybór bezpiecznego rozegrania. Lokalny drugi obrońca doskakuje tylko z zachowaniem osłony.
Zachowuje blokady par obrońca–posiadacz i korzysta ze wspólnego resolvera kontaktu.
Mniej rutynowych przyjęć otwiera sekwencje; istniejące posiadanie człowieka zachowuje sprawczość.
Karne mają legalne pozycje odbitek i rozwiązują ustawienie po kopnięciu. Profil ruchu korzysta
ze wspólnych atrybutów, a eksport odróżnia niezbierane dane od zmierzonego zera.

Architektura, definicje pomiarów, audyt wspólnego strzału i ograniczenia:
[PR151_REACTIVE_TACTICS.md](PR151_REACTIVE_TACTICS.md).
Pełne fatigue, urazy, czas doliczony i inteligencja zmian pozostają później.

## PR150 — Continuous Ball Control, Intent-Based Play & Space Passing

Domknięcie PR149 i PR150 zachowuje rytm PR148. Publiczny kontakt to jeden ciągły epizod
kontroli, a wewnętrzne kontakty pozostają szczegółowe. Intencje prowadzenia, sprintu,
dryblingu i osłony trwają przez mikroakcje; przyjęcie zachowuje pęd zależnie od jakości.
Cel w wolnym polu wybiera miejsce i bieg partnera, a geometria i atrybuty określają
wykonanie płaskie lub górne. Spalony odczytuje pozycje z chwili zagrania.

Sieć podań przenosi pierwotną próbę na rzeczywistego odbiorcę udanego podania, zachowując
zamierzony cel w diagnostyce. Nie tworzy dodatkowych prób ani podań do siebie. Dodano
wektory rzeczywistego ruchu w decyzjach, drużynę przy faulach i ustawienie ofensywnych wolnych.
Kontrakty, ograniczenia i walidacja: [PR150_CONTINUOUS_INTENT.md](PR150_CONTINUOUS_INTENT.md),
[PR150_ACCOUNTING.md](PR150_ACCOUNTING.md).
Pełne porównanie 45/90 minut, deterministyczne hashe, wydajność i jawne ograniczenia:
[PR150_CALIBRATION.md](PR150_CALIBRATION.md).
Rozszerzenie opisuje PR151 powyżej; poprzedni plan kondycji przeniesiono do późniejszego etapu.

## PR149 — Match Readability, Animation & Match Centre v2

Spokojniejsze tempo PR148 pozostaje punktem odniesienia. Przygotowanie właściciela piłki ma
kanoniczne kontrolowanie, zwrot, korektę pozycji, skanowanie, osłonę i odzyskiwanie równowagi.
Ruch, pozycja piłki i orientacja wyrażają tę pracę bez dodatkowych większych decyzji człowieka.
Przyjęcie zachowuje rzeczywistą prędkość/wysokość/kierunek kontaktu; ciężkie i nieudane
kontrole tworzą luźną piłkę oraz odzyskiwanie kontroli. Zapisano kontekst jakości przyjęcia.

Stałe **Centrum meczu** odczytuje pełny kanoniczny dziennik bramek, kartek, karnych i fauli,
niezależnie od polityki oglądania. Wiarygodne statystyki obejmują czas posiadania, strzały,
podania, dyscyplinę, wznowienia i obronę. Naprawiono utratę dowodu przyjęcia przy natychmiastowym
kolejnym podaniu oraz zliczanie skutecznego kontaktu kolegi innego niż pierwotny adresat.

Semantyczne pozy i krótkie etykiety używają dowodów core. Bufor powtórek przechowuje próbki
5 Hz / 12 s i osiem okien ważnych zdarzeń, także z symulacji w tle; odtwarzanie nie zmienia
żywego meczu. Szczegóły, pomiary, testy i ograniczenia:
[PR149_IMPLEMENTATION_CALIBRATION.md](PR149_IMPLEMENTATION_CALIBRATION.md).
Pierwotny plan kondycji przesunięto za PR150. Bogatsze powtórki, finalna sztuka,
parametryczne stadiony i duża kalibracja lig pozostają osobnymi późniejszymi zadaniami.

## PR148 — defensive realism, discipline and match cadence

Połączono poprawki PR147.1 z kalibracją PR148 w jednym kanonicznym silniku. `abandoned`
oraz `termination.reason = insufficient_players` kończą mecz natychmiast poniżej siedmiu
aktywnych piłkarzy, zachowując wynik i czas. Wykluczeni tracą ruch, akcje, cele i udział w
formacji; historia pozostaje, a minuty są zamrożone dokładnie przy wydaniu kartki.

Ryzyko NPC uwzględnia kartkę (także oczekującą), atrybuty, osłonę, pozycję, zagrożenie i wynik.
Rutynowa autonomia człowieka wycofuje niebezpieczny kontakt. Pojedynek ma ograniczony epizod;
stale bliska para nie inicjuje kolejnych prób wyłącznie po wygaśnięciu timera.
Podania/odbiór/ruch są faktycznymi zachowaniami core, bez dzielenia statystyk przed wyświetleniem.
Kontakty są dyskretne, sprint jest epizodem z trwałym wejściem i ponownym uzbrojeniem;
korekcja kolizji nie jest przebiegniętym dystansem. Kanoniczne `dribble` uzupełnia dowody akcji.

Definicje, pełne pomiary BEFORE/AFTER, weryfikacja oraz ograniczenia:
[PR148_CALIBRATION.md](PR148_CALIBRATION.md). Następny etap prezentacji wdrożono w PR149.
Pełne stamina, pogoda/nawierzchnia, sędziowie, tunel, finalna sztuka i
długookresowa kalibracja lig pozostają później.

## PR147 — verified rules, discipline and canonical feedback

Wdrożono wspólne fizyczne intencje standing/committed/slide/tactical, faule, żółtą/drugą żółtą/
czerwoną, korzyść z powrotem i opóźnioną kartką oraz istniejące wolne/karne z dowodu kontaktu.
`src/core/matchSimulation` pozostaje jedynym autorytetem; krok 0,025 s, istniejące atrybuty,
seeded RNG i rozdział prezentacji/sprawczości zachowano. Rutynowa obrona jest autonomiczna,
wysokie ryzyko człowieka wymaga jawnego wyboru lub jawnej delegacji DEV.

Wykluczenie usuwa aktywnego piłkarza przy wydaniu kanonicznej kartki, zachowując statystyki/
dyscyplinę. Zespół kontynuuje w dziesięciu bez automatycznego zmiennika. Guard odrzuca stare
akcje/cele/prompty dotyczące wykluczonego; renderer/picker odzwierciedla kadrę klatki.
`discipline.sentOffAt`/`TacticalFrame.dismissals` zachowują granicę niezależnie od etykiety:
historia sprzed kartki może pokazać aktora, późniejsza nie może go przywrócić. Minimalny fallback
bramkarza wybiera istniejącego kolegę według `reflexes`, zmieniając wyłącznie profil meczu.
Poprawiono konwencję orientacji, rzeczywisty czas końca zaakceptowanego kontaktu i zakończenie
lifecycle autu po pierwszym fizycznym kontakcie innego piłkarza, bez strojenia częstości.

Strumień dowodów ma 16 rodzajów, 12 s / maks. 96 zdarzeń. Maks. trzy deduplikowane,
priorytetowe mikroetykiety używają czasu klatki live/lead-in/replay, bez RNG. Podanie → ciężkie
przyjęcie → przechwyt może zostać pokazane bez promptu. Kontekst zachowuje 10 Hz / 6 s / <=62.
Telemetria zapisuje próby/wyniki, dyscyplinarne podtypy, karne i zastosowanie/cofnięcie korzyści.

Finalne `VITEST_MAX_WORKERS=2 npm run verify`: **exit 0**, lint, **120 plików / 777 testów**,
**1 plik / 5 pełnej kariery**, TypeScript/Vite build **279 modułów** — **782 testy łącznie**.
Wzrost głównego zestawu względem PR146: 57 testów. Nie osłabiono asercji; korekty historycznych
oczekiwań/hashów oparto na śladach zamierzonej zmiany reguł i liveness pierwotnego wznowienia.
Test rzeczywistego UI sprawdza brak render/capture w tle. Browser smoke: pauza 04:39, brak
błędów konsoli; nie jest to pełny mecz ani wizualny dowód wykluczenia.
Pierwszy CI przekroczył domyślne 5 s w teście czterech trybów A–D z capture/export;
ten test ma teraz jawny limit 30 s, przy zachowanych 480 tickach na tryb i wszystkich asercjach.

Trzy naprzemienne normal10 BEFORE/AFTER: mediana **16,300 → 13,302 s**, średnia
**16,111 → 13,924 s**; 24 000 ticków, jawne wejścia **3 → 8**, wynik **0–2 → 0–1**.
W każdej wersji wszystkie hashe trzech powtórzeń są identyczne; finalne minimum/normal/DEV10
mają te same hashe stanu/zawodników/statystyk/zdarzeń/RNG i osiem wejść. Nie stwierdzono
spowolnienia tej próbki. Zmienił się jednak futbol i liczba aktywnych piłkarzy, więc niższy czas
nie dowodzi optymalizacji ani pełnego 90-minutowego budżetu przeglądarki.

**Dyscyplina nie jest jeszcze realistycznie skalibrowana:** próbka 10 min ma **47 prób,
17 fauli, 13 żółtych i 5 wykluczeń po drugiej żółtej**; kończy z 9 aktywnymi gospodarzami
i 8 gośćmi, zachowując 22 rekordy statystyk. Nie zamaskowano tych wyników tuningiem PR147.
PR148 musi zbadać rozkłady pełnych meczów po ustabilizowaniu lejka kontaktu/pojedynku.
Szczegóły i surowe dane:
[RULES_DISCIPLINE_MATCH_FEEDBACK.md](RULES_DISCIPLINE_MATCH_FEEDBACK.md).

Roadmapa zachowuje kolejność **PR147 → PR148 — Possession Rhythm, Roles & Duel Calibration →
PR149 — Animation, Replay & Match Presentation v2**. Późniejsze fitness/obciążenie/regeneracja,
pogoda/murawa/piłka, kariera/oceny meczowe, trwały rynek i świat NPC, młodzież, modularna narracja,
wyróżnienia, lekka ekonomia stylu życia/inwestycji, bogatszy kreator i parametryczne twarze są
wyraźnie poza PR147. Klubowy stadion docelowo ma stabilny seed/profil; pogoda, tłum, banery,
światło i zużycie murawy mogą zmieniać się osobno, a arenę zmienią jawne wydarzenia świata.
MFL nie ma planu minigry budowy stadionu.
PR148 zachowuje dotychczasowy zakres rytmu, kontaktów/podań/przechwytów, geometrii podań
na dobieg, overlap/underlap/cutback, ról, pojedynków i różnic jakości. Dodano jawne
**Discipline realism calibration** po ustabilizowaniu zmierzonego lejka pojedynku/kontaktu,
oparte na wiarygodnych rozkładach rzeczywistego futbolu i dużych deterministycznych próbach,
bez wymuszania średniej w każdym meczu. PR147 mierzy konteksty/próby i wyniki, nie tuninguje
globalnej częstości fauli/kartek/karnych. Obecne „opportunities” oznacza przyjęte fizyczne próby,
nie wszystkie podejścia; pełny lejek podejście → dostępność → próba → kontakt → wynik to PR148.

## PR146 — verified Single Match Lab state

Ukończono **Background Simulation Performance** na zweryfikowanym main po PR145
(`fb48abbf03a97af7e69a2fe4d787f6933c2318b9`). Futbol pozostał identyczny: jeden silnik,
0,025 s, seeded RNG, pełne statystyki i dokładne ludzkie decyzje. Nowa komenda
`npm run benchmark:performance` mierzy 10/45/90 minut, pięciominutowe przedziały,
podsystemy, pamięć/kolekcje, reuse planowania i pełne hashe. Tryby `release_minimal`,
`normal`, `dev`, `capture` oddzielają required gameplay od drogich diagnostyk.

Pomiar potwierdził historyczne spowolnienie: DEV45 **466,186 → 62,153 s (7,50× szybciej)**,
koszt ostatniego/pierwszego przedziału **8,36× → 1,48×**. Copy-on-write, indeksy dowodów
i inkrementalna telemetria usuwają pracę pełnej historii co tick; MatchMoment ponownie używa
dokładnego negatywnego probe. Cały wynik PR14545, statystyki, zdarzenia/RNG oraz 4 wybory są
identyczne. Final90: minimum **117,901 s**, normal **108,360 s / 49,83×**, DEV **121,804 s**.
A–C mają ten sam wynik 0–5, 216107 ticków, 9 wyborów, pełne hashe i checkpoint PR14545.
A–D10 również zgadzają się z zamrożoną bazą. Ratio gate 3 przechodzi; normal90 ratio 0,98.

Normalny Lab zachowuje momenty, sprawczość, statystyki i kontekst PR143 we wszystkich trybach.
Kontekst kosztuje <0,5%, zachowuje 10 Hz / 6 s / <=62 próbek, renderer tła 0. React publikuje
co 250 ms oraz natychmiast przy decyzji/wyniku/części/błędzie; ref kanoniczny nie zależy od
renderu. Zwijane inspektory są lazy. Capture JSON jest jawny, WebM ma osobny opt-in i nie
nagrywa ukrytego starego boiska. Runtime errors są bounded; pierwsza awaria zachowuje
dokładny ostatni poprawny tick. Pełne historie zdarzeń pozostają, brak dowodu niższego peak RAM.

Finalne `VITEST_MAX_WORKERS=2 npm run verify`: **exit 0** — lint, **116 plików / 720 testów**,
**1 plik / 5 full-career**, TypeScript/Vite build (**275 modułów**). Bez osłabienia testów.
Rzeczywisty browser smoke dotarł do decyzji **24:36.150** z równym czasem prezentacji,
gotowym rendererem, Runtime OK i 0 renderów tła; max decision→commit 11,4 ms.

Headless normal90 spełnia milestone <5 min i pozostawia szacunkowo **132–252 s** w budżecie
240–360 s na widoczny kontekst/akcje, replay, yield i deliberację. To nie jest jeszcze pomiar
pełnego interaktywnego meczu. Capture10 nadal kosztuje **77,813 s**, głównie budowanie ramki,
nie końcowy JSON (53 ms); D90 estymuje ~700 s i nie był wykonywany. Video pozostaje niezmierzone.
Agency/ETA, capture i event-frequency copy są precyzyjnie opisanymi dalszymi hot paths.
Środowisko, pełna macierz, buckety i ograniczenia:
[BACKGROUND_SIMULATION_PERFORMANCE.md](BACKGROUND_SIMULATION_PERFORMANCE.md).

Plan po PR146 (historyczny): **PR147 — Rules, Discipline & Match Feedback**, następnie
**PR148 — Possession Rhythm, Roles & Duel Calibration** oraz
**PR149 — Animation, Replay & Match Presentation v2**. PR146 nie implementowało fauli/kartek,
rytmu, redesignu ról, nowych technik, stamina/fatigue, zmian, pogody czy stadionów.

## PR145 — previous verified Single Match Lab state

Ukończono **Match Behaviour & Calibration Pass** na zweryfikowanym main po PR144
(`dd70e788f0c0f00559d958c43c4f632595e7c14f`). `matchSimulation` pozostaje jedynym autorytetem;
krok 0,025 s, seeded RNG i obserwacyjna prezentacja są zachowane. `projectPassReception`
iteruje osiągalny punkt spotkania po ścieżce odbiorcy (horyzont do 2,5 s); facing nie zastępuje
ruchu, check-back/stanie bez zamiaru ruchu staje się support. Lot i ETA zaczynają się w
rzeczywistej pozycji piłki. Wspólny loft 3D zależy od dystansu/rodzaju/wykonania, a oba dawne
modele toczenia zastępuje dokładna deceleracja 3,2 m/s² z neutralnym mnożnikiem 1.
Piłka nie wyhamowuje ani nie traci wysokości przy samym zadanym celu podania.

Celowane auty wybierają legalnego kolegę, zachowują przesunięcie wybranego celu i mają wspólny
fallback człowieka/NPC. Wykonawca nie może otrzymać, prowadzić ani ponownie uderzyć własnego
autu do fizycznego kontaktu innego zawodnika. Diagnostyka zapisuje wybór, wektor i następny
kontakt. Po wypuszczeniu wznowienia przygotowanie odbiorcy i wybór przyjęcia są zachowane;
człowiek otrzymuje dalszą terminalną decyzję, a carry zachowuje epizod PR144.

`contactEvidence.ts` deduplikuje fizyczne kontakty, w tym pierwsze przyjęcie/strzał i
substep catch/owner. Jedno ukończenie podania jednocześnie zwiększa passer/receiver/network,
wyłącznie dla zamierzonego odbiorcy z dowodem kontaktu. Carries liczą epizody, nie ticki ani
stare akcje przy kolejnych indeksach AI. UI używa „Kontakty”. Telemetria kopiuje wspólne sumy.
Rutynowe shielding, recycling, close-down i mały krok w linię nie wymagają promptu; wyraźnie
wcześniejszy kolega posiada przechwyt. Istotne ryzyko/wykończenie zachowuje sprawczość.

Strzał ma jawne sigma błędu według jakości, odległości, kąta, presji, kontaktu, orientacji
i nogi. Bounded normal-like seeded RNG ma poprawną wariancję. Bramkarz porusza rzeczywiste
ciało, zużywa czas reakcji i wymaga kolizji przed catch/parry. Zasięg aktywny 1,25 m jest
osobny od pasywnego tułowia 0,5 m na wysokości 1,05 m. Kontakt przed reakcją powoduje
fizyczny block/failed_save, bez statystyki obrony; nie ma przenikania przez ciało.

Finalne `npm run verify`: **exit 0** — lint, **112 plików / 697 testów głównych**,
**1 plik / 5 testów full-career**, TypeScript/Vite build (**273 moduły**).
Lokalnie użyto `VITEST_MAX_WORKERS=2`: domyślna równoległość powodowała timeout istniejącego
testu deterministyczności debug capture; osobno 25/25 i cały zestaw przeszły bez zmiany
asercji lub limitu czasu. Pozostały nieblokujące ostrzeżenia Node experimental transform types,
mieszany import `careerStorage` i chunk >500 kB.

`npm run benchmark:calibration`: **exit 0**, trzy stałe seedy po 600 s, te same składy/pozycje
i jawny DEV wybór co w próbce czystego PR144. Decyzje człowieka **136 → 14**; projekcja
na 90 min **408 → 42** (pozycje po zmianie: CM 9, LB 72, ST 45). W meczu: 4 strzały,
2 celne, 2 gole, 0 obron; ta mała próbka nie wyznacza skuteczności bramkarzy. Podania
380/629, a completed = received = network = 380; zero `passesReceived > touches` i zero
lead za aktywnym ruchem. Osobny równoważony zestaw 224 rzeczywistych wykonań siedmiu rodzin:
148 celnych (66,07%), 73 gole, 75 obron, 76 kontaktów bramkarza, 3 bloki, 0 nierozstrzygniętych.
Szczegóły, BEFORE/AFTER, definicje i ograniczenia:
[MATCH_BEHAVIOUR_CALIBRATION.md](MATCH_BEHAVIOUR_CALIBRATION.md).
Krótka kalibracja nie dowodzi końcowego realizmu ani pełnego rozkładu 90-minutowych meczów.

Plan po PR145 (historyczny): **PR146 — Background Simulation Performance**. **PR147 — Rules, Discipline & Match
Feedback** pozostaje planowany po nim. Nie wdrożono optymalizacji runtime PR146, fauli/kartek,
pogody, spin/Magnus, nowych improwizowanych technik, ceremonii, zmian ani nowego silnika futbolu.

## PR144 — previous verified Single Match Lab state

**Shooting & Final-Third Action Variety** zachowuje `matchSimulation` jako jedyny autorytet
futbolu. `enumerateCanonicalShootingOptions` w `shootingOptions.ts` generuje wspólną rodzinę
legalnych wykończeń dla menu target-first i rankingu NPC. `shotIntent.ts` rozdziela technikę
(`driven`, `placed`, `chip`) od kontaktu (`settled`, `first_time`, `half_volley`, `volley`,
`header`); nowe dane są walidowane Zod. Wysokość, szybkość/timing przychodzącej piłki, fizyczne
ETA, orientacja ciała, dominująca noga, atrybuty i kontekst bramki ograniczają dostępność.
AI może wybrać strzał bez przyjęcia, lecz kontakt nadal wymaga kanonicznego dojścia do piłki;
nie ma teleportu, osobnej trajektorii ani kontaktu rozstrzyganego przez animację.

`deriveShotExecutionProfile` jawnie różnicuje prędkość, błąd wykonania, presję, przygotowanie,
trudność pierwszego kontaktu/orientacji/nogi oraz loft. `shotResolver` i wspólna fizyka piłki
wykonują jeden lot 3D. Chip ma minimalną rzeczywistą pionową składową startową, również przy
niskim celu wybranym na płaszczyźnie bramki PR141. Utrwalony `ShotDiagnostic`/telemetria zawierają
intencję, kontakt/first-time, wysokości decyzji i kontaktu, zamierzony/rzeczywisty cel, błąd,
launch speed/vertical, profil, klasyfikację, interwencję bramkarza i wynik. To dowody do PR145,
bez szerokiej kalibracji skuteczności w PR144.

`possessionAgency.ts` utrzymuje epizod posiadania człowieka po carry/hold; cooldown nie oddaje
terminalnej akcji AI. Rutynowe dotknięcia i ruch pozostają kanoniczne. Epizod kończy wybrana
terminalna akcja albo fizyczna zmiana/utrata posiadania lub jawna granica. Wybrany cel carry jest
punktem następnej decyzji: osiągnięcie/bliskość/przekroczenie promienia oraz istotne zmiany
bramkarza, nowy kierunek presji, wejście w strefę, otwarcie/zamknięcie strzału, decydujące podanie,
ciężki kontakt lub contested mogą wywołać wcześniejszą okazję. Porównanie do semantycznego
kontekstu ostatniej decyzji i pamięć już oferowanych rodzin ograniczają powtarzanie podobnych
promptów; kalibracja częstości pozostaje PR145.

`TacticalFrame`/`PresentationFrameProjector` zachowują kanoniczny typ kontaktu/intencję, także
w historii tła PR143 i replayu. Lekkie gesty rozróżniają zwykły strzał, podcinkę, pierwszą piłkę,
półwolej/wolej i główkę. Ogólna wskazówka `kind` może później zasilić feedback PR147; pełnego
systemu etykiet przy akcji nie wdrożono. Goal picker i celowanie obsługują również `header_shot`;
Polskie etykiety menu wynikają z opcji core.

Kontrolowany żółty ring ma promienie 0,87–1,02 m, turkusowy owner 0,72–0,86 m, z odstępem 1 cm.
Oba leżą na y=0,007 m (2 mm nad najwyższą trawą), używają depth test i zwykłego porządku rysowania;
ciało/stopy zasłaniają część z tyłu. Są stałe w metrach, niezależne od zoomu; cel i actionable
zachowują osobną semantykę. Zegar gracza ma `MM:SS`, a ułamki do 0,001 s tylko formatter DEV.

Weryfikacja pełna: `npm run verify` passed, exit 0: lint, 109 plików / 640 testów głównych,
1 plik / 5 testów full-career oraz TypeScript/Vite build (270 modułów). Build zgłasza nieblokujące
ostrzeżenia o mieszanym imporcie `careerStorage` i chunk >500 kB; Node o experimental transform
types. Krótki smoke w przeglądarce potwierdził Runtime OK, decyzję człowieka, zegar MM:SS i
zmniejszony ring na murawie. Regresje obejmują legalność i parytet strzałów, pierwsze kontakty NPC/człowieka,
loft podcinki, ciągłość posiadania, waypoint/wczesne decyzje i brak prompt spam; także geometrię/depth
markerów, format czasu, deterministyczne gesty i metadata strzału w widocznej/historii klatce.
Niezależny przegląd potwierdził brak automatycznej główki po wybranym przyjęciu i brak powtórnego
kontaktu już wypuszczonej główki. Bezpośredni resolver również odrzuca ponowne uderzenie aktywnego
strzału. Długie manualne playtesty i kalibracja częstości decyzji pozostają PR145.

Plan po PR144 (historyczny): **PR145 — Match Behaviour & Calibration Pass**, następnie
**PR146 — Background Simulation Performance**, planowany **PR147 — Rules, Discipline & Match
Feedback**. PR145 obejmuje lead-pass według ścieżki odbiorcy, integralność autów (cel/odbiorca,
zakaz self-receive i carry), prawdziwy loft podań, opór toczenia po trawie, spójność statystyk,
własność przechwytów, częstość znaczących decyzji i lejek strzał/on-target/keeper/goals.
Typowy pełny mecz powinien później zawierać kilkadziesiąt znaczących decyzji, ustalone playtestami,
bez sztywnej kwoty. PR146 ma cel produktu 4–6 minut dla meczu `key_player` z kontekstem/wyborami,
bez długiego namysłu; technicznie ukryte 90 minut komfortowo <5 minut, dalej jeśli potrzeba.
Macierz A/B rozdzieli minimum/release, normalne obserwatory, DEV, rolling debug JSON i WebM;
koszt zbierania/buforowania oddziela od serializacji/zapisu i wymaga identycznych hashy stanu.
PR147 doda przepisy/dyscyplinę i kanoniczny feedback; ryzykowne agresywne decyzje kontrolowanego
obrońcy zwykle wymagają człowieka. Pogoda, warianty wyglądu piłki (w tym żółta/pomarańczowa dla
śniegu), spin/Magnus i techniki curl oraz ceremonie przed/po meczu pozostają później.

## PR143 — previous verified Single Match Lab state

Ukończono **Interactive Moment Context & Presentation Windows**. `matchSimulation` pozostaje
jedynym autorytetem futbolu. `projectPlayerAgency` decyduje o znaczącej, legalnej okazji człowieka;
`MatchMoment` / polityka wybierają otaczający materiał do oglądania. Żaden próg prezentacji nie
deleguje okazji gracza. Usunięto `presentation_policy_proxy`; jawne DEV AI używa wspólnego rankingu
i kategorii `dev_ai_selected`. Przy jednej rzeczywistej opcji nie ma blokującego promptu.
Enumeracja uwzględnia różne legalne adresaty/miejsca w tej samej rodzinie intencji oraz faktyczne
opcje menu defensywnego; samotny doskok jest autonomiczny, normalny/ostry odbiór pozostają wyborem.

Faza prezentacji jest jednym enumem: `background_simulation` → `lead_in` →
`awaiting_player_decision` → `post_moment` → tło lub `full_match`. Nieinteraktywne momenty
używają `presenting_live_moment`; jawny `replay` zachowuje fazę powrotu. Podczas lead-inu
kanoniczny stan stoi w T, a zapisane klatki i wyświetlany zegar przechodzą od T−N do T.
Nie odtwarzamy ticków/akcji ani RNG, a cele i kontrolki pochodzą wyłącznie z aktualnego stanu w T.
Kamera Action/Player/Overview i kosmetyczne offsety pozostają architekturą PR141/142.

`PresentationContextHistory` próbuje ticki przy 10 Hz, trzyma 6 s / maks. 62 lekkie klatki oraz
jedną poprzednią obserwację. Kopiuje pozycje, prędkości, facing, piłkę i lekkie wskazówki kontaktu;
nie uruchamia Three.js, pozowania, WebGL ani integracji animacji w tle. Interpolacja PR142 działa
na sąsiednich próbkach <=150 ms, z granicami kontaktu/posiadania/wznowienia. Lead-in 2,5/3/4 s
zależy od kontekstu; rzeczywista dostępność jest osobno raportowana. Jawny replay nadal pochodzi
z widocznego bufora 40 Hz i nie zawiera kontekstu tła. Ball owner ma mały turkusowy pierścień,
piłka dyskretny obrys; żółta kontrola, jasne cele i zaznaczenie pozostają odrębne.

Okno konsekwencji obserwuje wynik decyzji, kontakt, przyjęcie/przechwyt, zmianę posiadania lub aut.
Po wyniku zachowuje ogon 2,5 s, groźna akcja 4 s, gol 5 s. Bliskie groźne akcje mogą się łączyć;
nowa znacząca decyzja ma pierwszeństwo. Limit bezpieczeństwa wynosi 25 s na wynik i 35 s dla
nieinteraktywnego epizodu. Te stałe są centralne w `presentationWindows.ts`, nie sterują futbolem.

Eksport benchmark-session zawiera niezależne od polityki liczniki kandydatów sprawczości,
decyzji człowieka, rutyny/jednej opcji, rodzajów i decyzji na kanoniczne 45/90 minut; także
diagnozy własności, ukrytego materiału, lead-inów, zakończeń/łączenia okien i metryki bufora.
Nie narzucono docelowej liczby decyzji. Regresje obejmują wszystkie pięć polityk z identycznymi
wyborami, pełną zgodność stanu, kontekst ukryty, czas aktywacji, wynik, groźną kontynuację,
jedną opcję, niemutowanie klatek i ograniczoną pamięć.

Pomiar `npm run benchmark:context`: Node 24.19.0, seed `pr143-buffer-cost`, pięć kanonicznych
minut, rozgrzewka obu ścieżek i sześć naprzemiennych prób. Bez bufora średnio 1784,23 ms,
z buforem 1776,19 ms (−0,45%, szum pomiarowy, nie przyspieszenie). Praca próbkująca 22–25 ms;
61 próbek / 3000 zapisów, ~394 kB serializacji JSON historii (nie pomiar heap). Hash całego stanu
kanonicznego identyczny we wszystkich próbach. Nie jest to benchmark pełnej sesji React/DEV ani
obietnica czasu 90-minutowego meczu; większa optymalizacja pozostaje PR146.

Weryfikacja: `npm run verify` — lint, 105 plików / 588 testów main, 1 plik / 5 testów full-career,
build. Ostrzeżenia Vite dotyczą istniejącego dynamic/static import i rozmiaru chunku.
Wizualny smoke test pozostaje nieweryfikowany: narzędzie przeglądarki nie związało lokalnej karty.

NEXT: **PR144 — Shooting & Final-Third Action Variety**, potem **PR145 — Match Behaviour &
Calibration Pass** (geometria podań na dobieg/through-ball, cele autów, lot podań górą, statystyki
touches/podań, własność przechwytów, liczba momentów/sprawczości, strzelanie/scoring/keeper).
**PR146 — Background Simulation Performance**: późniejszy cel <=5 minut czasu rzeczywistego dla
ukrytych 90 minut na zwykłym komputerze, z jednym kanonicznym silnikiem. Przepisy/faule/kartki,
pogoda/warianty piłki, ceremonia, szersze asysty, AI first-time, shooting/chip/loft calibration oraz
pełne release/mobile UI nie są wdrożone w PR143.

## PR142 — previous Single Match Lab state

Ukończono **Match Animation & 3D Presentation v1**. Kanoniczne mechaniki i testy futbolu nie
zostały zmienione. `PresentationFrameProjector` obserwuje widoczne ticki oraz akcje człowieka:
prędkość, facing, wzrost/masa/dominująca noga, release/flightTime, przyjęcie, kontakt bramkarza
oraz wynik pojedynku powietrznego trafiają do walidowalnego `TacticalFrame`.
Nie wywołuje resolverów, prognoz fizyki ani RNG. Jedna krótka wskazówka na zawodnika wygasa
według czasu kanonicznego; kontakty bez timestampu są oznaczane czasem obserwowanego ticka.

`PlayerModel` ma lekki torso/head/hip/knee/arm/elbow rig z prostych geometrii Three.js.
Wzrost i masa skalują wyłącznie ciało; root, facing i osobny niewidzialny picker pozostają
niezależne od póz. Współdzielone geometrie/materiały powstają raz, a scratch pose jest używany
ponownie. `animation.ts` rozróżnia idle/walk/run/sprint, płynnie wygasza follow-through,
pokazuje przyjęcie, dośrodkowanie, główkę/pojedynek oraz oburęczny aut. Przed wypuszczeniem
piłka może być kosmetycznie między dłońmi właściciela; po release zawsze rysujemy kanoniczny lot.
Gotowość, przemieszczanie, claim/catch, niska/wysoka obrona i dystrybucja bramkarza wynikają
z istniejącej interwencji i kontaktów. Żadna animacja nie przyznaje zasięgu ani sukcesu obrony.

Stroje używają wyłącznie `projectMatchKits`: panele koszulki/kołnierz, spodenki, skarpety,
rękawice bramkarza oraz gotowe warianty pattern z istniejącego schematu prezentacji.
Aktualne ClubVisualIdentity ma tylko primary/secondary, więc projekcja nadal wybiera solid;
nie dopisano bazy klubowych wzorów. Fallback kontrastu PR141 pozostaje bez zmian.
Piłka ma kanoniczny promień 0,11 m, kontrastowy materiał i zachowany cień PR141.

Bufor 10 s zapisuje widoczne kanoniczne ticki (40 Hz). Powtórka 0,5× interpoluje wyłącznie
sąsiednie zapisane próbki oraz najkrótszy kąt facing, śledzi faktyczną piłkę i nie interpoluje
kontaktów, zmian posiadania, teleportów ani luk tła. Ukryty mecz nie wykonuje pracy animacji.
Zwijany panel diagnostyki/scenariuszy/eksportów przeniesiono nad viewport bez przebudowy UI.

Weryfikacja: `npm run verify` (lint, test:main, test:full-career, build). Nowe testy obejmują
stan animacji, kontakt/release, bramkarza, geometrię/stroje, niezależność pickera, granice
interpolacji i brak mutacji/wpływu na wynik kanoniczny. Launcher testów full-career jest teraz
przenośnym skryptem Node zamiast poleceń POSIX; zestaw testów i flagi pozostają te same.

Ograniczenia: nie ma IK/stawiania stóp ani fizycznego szkieletu. Header w core może po kontakcie
uruchomić lot od height=0; animacja tego nie koryguje. Taker autu ma pozycję kanoniczną ~0,4 m
wewnątrz boiska, a release=1,9 m może nie pokryć się idealnie z dłońmi dla każdego wzrostu.
Nie przesuwamy root ani toru piłki, aby to ukryć. Kontakty odtwarzane są z dokładnością ticka,
a kamera/pauza nie dopisują czasu futbolowego. Nie wykonano benchmarku GPU/mobile.
Podczas smoke testu DEV/React zaobserwowano observer_error w niezmienionym observeMatchFlow:
ujemny actionTempoSamples.interval. Nie zmieniano tej telemetrii ani kalibracji w PR142.
Próbki animacji są konsumowane dopiero dla zatwierdzonego wyniku React, dzięki czemu ponowna
ewaluacja updatera nie cofa bufora powtórki.

Następne: **PR143 — Interactive Moment Context & Presentation Windows**, potem **PR144 —
Shooting & Final-Third Action Variety**, **PR145 — Match Behaviour & Calibration Pass**.
Kalibracja lofted-pass, statystyk, defensywnej sprawczości, czułości momentów oraz scoring/keeper
pozostaje odłożona. Spin/Magnus/wiatr, first-time AI i pełny release/mobile UI nie są wdrożone.

## PR141 — previous Single Match Lab state

Single Match Lab ma zwarty interfejs w stylu Windows 95–98: wynik, zegar, odtwarzanie i czułość
nad boiskiem, status/decyzja obok, pełna diagnostyka i eksport JSON/WebM w zwijanych panelach.
Kontrolki współdzielą styl CareerView. Barwy strojów pochodzą z kanonicznego visualIdentity
przez resolveClubVisualIdentity; strój alternatywny i bramkarze mają deterministyczny fallback
kontrastu bez modyfikacji danych klubu. Wzory strojów i animacje pozostają zakresem PR142.

Kółko płynnie zmienia ograniczony zoom, środkowy przycisk obraca wokół aktualnego pivotu,
Shift + środkowy przesuwa pivot, a Resetuj widok przywraca orientację i zoom aktywnego presetu.
Overview, Action i Player mają odrębne kadrowanie ortograficzne. Offsety i zegar animacji zoomu
należą wyłącznie do renderera. Capture/cancel gestu odcina wybór futbolowy. W celowaniu i powtórce
kamera ma dedykowane kadrowanie. Touch ma przygotowane wspólne operacje, bez adaptera gestów.

Cel strzału przechodzi screen → promień kamery → płaszczyzna fizycznej bramki → kanoniczna
baza kierunku ataku. Marker, cel akcji i resolver współdzielą goalCoordinates; usunięto rozbieżne
znaki osi bez zmiany błędu wykonania, RNG ani kalibracji strzału. Testy obejmują oba kierunki
ataku i kamery przed/za bramką oraz pod kątem. Jedynym autorytetem pozostaje matchSimulation.

Weryfikacja: npm run verify przechodzi (lint, pełne testy oraz build). Następny etap:
**PR142 — Match Animation & 3D Presentation v1**. Znane problemy przepływu, przechwytów,
statystyk posiadania oraz czułości momentów pozostają otwarte, zgodnie z audytem PR140.

## PR140 — previous Single Match Lab state

Fizyka i kontakty nadal działają ze stałym krokiem 0,025 s. Kanoniczny scheduler przelicza drogie
cele taktyczne co 0,1 s, lecz natychmiast unieważnia plan po zmianie posiadania, epizodu/lotu piłki,
fazy lub wznowienia. Runtime najpierw wykonuje dokładną projekcję decyzji człowieka, a następnie
korzysta z wejścia fast path, które pomija wyłącznie powtórzenie tej samej czystej projekcji.
Wybrana akcja człowieka utrzymuje prezentację do kanonicznego wyniku, nie przez arbitralny timeout.
Pełna mapa systemu i stan dalszych prac są w `MATCH_ENGINE_AUDIT.md` oraz
`MATCH_ENGINE_HANDOFF.md`.

## PR139 — previous Single Match Lab state

Ukryta symulacja raportuje monotoniczny czas rzeczywisty, przepustowość kanoniczną, ticki/s oraz
ograniczone próbki p50/p90/p95/p99 i stabilność rolling. Eksport sesji zawiera to samo podsumowanie,
a `npm run benchmark:background` uruchamia bez renderera te same deterministyczne ticki dla 5, 15
lub 45 minut w oddzielnych trybach core, telemetry, MatchMoment, complete i sampled profile.
Profilowanie jest obserwacyjne i nie steruje RNG ani wynikiem. Rekomendacja po PR139 to **B**:
mierzyć i przenosić wyłącznie udowodnione obserwacje/planowanie na cadence zdarzeniową, zachowując
jeden mecz kanoniczny. Nie wdrożono drugiego symulatora.

`key_player` pozostaje rzadki, lecz wiarygodna okazja strzelecka z co najmniej dwiema semantycznymi
możliwościami jest wyjątkiem od ogólnego progu. Rutynowe wybory nadal mogą być rozwiązywane proxy.

## PR138 — previous Single Match Lab state

Single Match Lab nadal używa jednego deterministycznego `matchSimulation`. Warstwa prezentacji
może wykonywać jego ticki 0,025 s w ograniczonych batchach, całkowicie pomijać ich renderowanie i wracać do
widoku przy ważnym `MatchMomentEpisode`. Pięć deklaratywnych polityk ustala progi, a `full_match`
pozostaje niefiltrowanym punktem odniesienia. Ukryta okazja kontrolowanego zawodnika używa tego
samego rankingu AI lub jawnie przekazuje sterowanie kanonicznej autonomii; kontrolowane wznowienie
wykonuje legalną akcję z tego samego enumeratora. Okazja pokazana zatrzymuje czas przed wyborem.
Kosmetyczny zegar wyświetlany nadrabia czas kanoniczny bez wpływu na fizykę lub RNG. Bufor klatek
zawiera tylko faktycznie renderowane, spójne czasowo klatki; migawki kanoniczne są odrębnym pojęciem.
Watchdog wznowienia jest deterministyczną, diagnozowaną siatką bezpieczeństwa.

Reakcja bramkarza jest
liczona od początku lotu strzału, a jego fizyczny ruch i ograniczona obwiednia kontaktu nie dublują
tego samego zasięgu. Epizody sprintu mają histerezę wyjścia. Czysty `projectMatchMoment` obserwuje
stan, istniejące okazje decyzyjne, zagrożenie, strzały, interwencje i wznowienia oraz może ocenić je
według przyszłych polityk prezentacji bez mutacji stanu i bez losowania. Telemetria benchmarkowa
liczy kandydatów i wyniki tych polityk. Nie dodano drugiego symulatora ani integracji z karierą;
kalibracja przechwytów, bramkarzy, pressingu i gry skrzydłami pozostaje iteracyjna. Posiadanie
bramkarza nogami jest zwykłym, możliwym do pressingu stanem przy piłce; złapanie/pewne przejęcie
pozostaje odrębnym stanem kontrolowanej dystrybucji. Nie dodano zmęczenia ani integracji kariery.

## PR128 — earlier Single Match Lab foundation

Single Match Lab uses the deterministic `matchSimulation` as its sole football authority. Tactical
action and player-focus cameras track current presentation positions, while canonical body orientation
is independent from velocity. Shot aiming maps the goal mouth to bounded intent; every released ball,
including throw-ins, crosses and goalkeeper kicks, then uses one velocity-based physical integrator. A
canonical agency checkpoint guarantees that retained possession after a human-selected action opens
the next on-ball choice for the human rather than routine AI. The legacy career `MatchGame` remains
a temporary separate placeholder and will eventually be replaced, not synchronized with this flow.

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

Obowiązuje **ONE FOOTBALL ECONOMY**: protagonista i NPC korzystają z jednej bazowej wyceny pensji,
wartości zawodnika, wag ról oraz wspólnego buildera kontraktu. Niedoskonałość konkretnej oferty jest
osobną, deterministyczną i ograniczoną warstwą. Podpisana pensja jest trwałym faktem kontraktowym —
nie przelicza się po rozwoju OVR, zmianie roli ani awansie lub spadku klubu. Letni rynek nadal używa
miękkich budżetów wyłącznie jako kontekstu i nie może pozbawić świata grywalnych kadr.

## Current UI

Dostępne są kreator, `PlayerCard` z pogrupowanymi atrybutami i radarem, `CareerView`, sezonowa tabela i oś oraz nowy `ClubView`: boisko formacji, XI / ławka / głęboka rezerwa, sytuacja protagonisty, konkurencja pozycyjna i wspólny podgląd kart zawodników. Tymczasowy `MatchGame` pozostaje placeholderem.

## Immediate next gameplay development

Bieżącym fundamentem jest DEV Single Match Lab z kanonicznym `matchSimulation`, rendererem oraz
jawnym eksportem diagnostycznym JSON + opcjonalny WebM. Ten dokument opisuje stan wdrożony;
jedyną autorytatywną, uporządkowaną kolejność następnych PR-ów utrzymuje sekcja `NEXT` w
`ROADMAP.md`.

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

Emerytura NPC jest stabilną projekcją końca kariery z tożsamości, pozycji, trajektorii i charakteru,
a nie ponawianym co rok losowaniem. Bramkarze mają przesunięty rozkład ku późniejszym latom, a
twarde maksimum 43 lat obowiązuje niezależnie od liczebności kadry klubu.

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

- Pozycje: `POSITION_COMPATIBILITY` klasyfikuje relacje naturalne, opanowane, sąsiednie i
  niedozwolone. Ten sam model zasila selekcję, konkurencję, naukę oraz efektywne pokrycie kadry.
- Bieżący wiek protagonisty: wyłącznie `dateOfBirth + currentDate`; pole `age` jest zgodnością
  bootstrap/legacy, a nie drugim zegarem rozgrywki.
- Rola kontraktowa jest podpisaną obietnicą. Niezadowolenie wynika z rozbieżności tej obietnicy z
  aktualnym statusem sportowym; dopiero nowa umowa ponownie wycenia rolę.

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

## Parametryczny rozwój NPC

Efektywny świat składa się obecnie jako **świat statyczny + proceduralne generowanie zawodników +
projekcja względem daty + rzadka nakładka stanu kariery**. Nabór U-17 jest odtwarzany z
wersjonowanych identyfikatorów, a zwykłe zmiany klubu, kontraktu i statusu nie kopiują pełnej karty.
Po niedoskonałym rynku działa osobny deterministyczny bezpiecznik integralności, który naprawia
wyłącznie niegrywalne kadry; nie jest optymalizatorem transferowym.

**NATURALNY ROZWÓJ NPC JEST PROJEKCJĄ ZALEŻNĄ OD DATY, A NIE TRWAŁĄ COROCZNĄ MUTACJĄ.**
Osiem współdzielonych krzywych opisuje szeroką trajektorię rodzin fizycznej, technicznej,
mentalnej i bramkarskiej. `DevelopmentProfile`, charakter oraz stabilny identyfikator nadają jej
indywidualny kształt. Resolver może przejść bezpośrednio do dowolnego wieku, bez odtwarzania
wcześniejszych sezonów. `footballerAttributeOverrides` pozostaje wyłącznie dla wyjątkowych,
jawnych konsekwencji; naturalne starzenie nie powiększa zapisu.

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

**JAKOŚĆ AKADEMII PRZESUWA ROZKŁAD PRAWDOPODOBIEŃSTWA. NIE TWORZY BEZPOŚREDNIO
GOTOWEGO SENIORSKIEGO OVR.** Jeden wersjonowany model talentu obsługuje startową kohortę 2026 i
każdy późniejszy nabór. Bieżąca umiejętność ma skupiony rozkład z coraz rzadszym ogonem mocnych,
elitarnych i wyjątkowych nastolatków. Potencjał rodzin rozwoju jest losowany osobno, choć środowisko
akademii lekko poprawia jego prawdopodobieństwo. Zawodnicy uzupełniający rynek są osobną,
ograniczoną podażą poziomu głębi/rotacji, a nie ukrytym źródłem wonderkidów. Porównywalny audyt jest
dostępny przez `npm run audit:youth`.

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

Po ukończeniu sezonu system kolejno: archiwizuje sezon protagonisty, rozwiązuje bieżące kohorty U-17 i graduację, rozstrzyga deterministyczne daty emerytur, tworzy kohorty następnego sezonu, stosuje rollover klubów, a na końcu inicjalizuje sezon i hierarchię protagonisty. Markery trwałych operacji oraz autorytatywne klucze kohort zapewniają idempotencję. Emeryci pozostają tożsamościami w delcie, lecz znikają z aktywnych resolverów i składów; liczebność kadry nie może zatrzymać emerytury.

## Macro Gameplay Stabilization — kanoniczne kadry

Runtime używa jednej efektywnej kadry seniorów: statyczne ID są bootstrapem, a rzadka delta,
emerytury i członkostwo protagonisty są składane przez wspólny resolver. Letnia graduacja nie ma
już osobnej ekonomii pierwszych kontraktów. Absolwenci trafiają do wspólnej puli jednego rynku,
który po emeryturach rozwiązuje wygaśnięcia, ograniczone odejścia sportowe, kierunkowe podkupienia
i kaskadowe uzupełnianie kadr. Wolni zawodnicy są wykorzystywani przed deterministycznymi
uzupełniającymi absolwentami/newgenami. Osobny critical repair nie mutuje świata.

Zawodowa piramida ma skończoną liczbę miejsc pracy. Niezatrudnieni po letnim rynku absolwenci i
wolni zawodnicy opuszczają aktywną symulację profesjonalną, zamiast liniowo powiększać zapis.
Wyjście rynkowe jest odrębne od emerytury wieku. Gracz z ważnym kontraktem, który tylko chce
transferu, nadal pozostaje pracownikiem klubu. Generowanie uzupełniające jest absolutnym ostatnim
źródłem obsady realnych wakatów.

## Canonical XI, club strength i Player Model (PR77)

Model zawiera teraz odrębne `positioning`, `goalkeeperKicking` i `goalkeeperThrowing`. Kanoniczne radary mają osiem rozłącznych osi i są prezentacją; wzrost nie wchodzi do radaru. OVR liczy jakość sportową ze średnich grup ważonych według pozycji, a znajomość pozycji pozostaje osobnym modyfikatorem. Jeden legalny selektor XI z fallbackiem formacji zasila hierarchię, siłę klubu i wybór meczowy. Selekcja trenera dodaje do efektywnego OVR jedynie ograniczone dopasowanie stylu, mały kontekst i jawne kary fitness. Bieżąca siła to średni OVR legalnej XI; statyczny rating jest wyłącznie bootstrapem/fallbackiem. Statystyki bramkarza są warunkowane oficjalnym wynikiem, a oferty pokazują konkretnych rywali w docelowej kadrze i prognozowany status.

## PR78 — obserwowalność klubu i jedna bieżąca siła

**ONE CURRENT CLUB STRENGTH = średnia efektywnego OVR kanonicznej legalnej XI.** `getCareerClubStrength()` jest jedynym resolverem żywej jakości sportowej i jawnie zgłasza błąd, gdy znormalizowany klub zawodowy nie potrafi wystawić legalnej XI. `strengthRating`/`overallStrength` oraz `getBootstrapClubStrength()` są wyłącznie wejściem generowania przed utworzeniem realnych kadr; reputacja, finanse i infrastruktura pozostają odrębnymi pojęciami.

Oferty pokazują konkretną konkurencję na planowanej pozycji (efektywny OVR oraz prognozowany status). Kadra pokazuje deterministyczną zmianę nominalnego OVR od 1 lipca, znacznik NOWY wyprowadzony z kontraktu/rekordu transferu oraz wyłącznie kanoniczną dostępność protagonisty. Reużywalny `ClubPreview` prezentuje realnych liderów i najlepszego zawodnika U21. DEV World Browser jest deterministycznym, tylko-do-odczytu widokiem zawodowego świata; audyt klubów publikuje siłę XI, wykonalność formacji i lukę najsłabszego slotu.

## PR80 — Position & Selection 3.0

Środkowa pomoc jest jedną pozycją ŚP; pionowe role są zadaniami slotów formacji. Selekcja i projekcja
ofert korzystają z `evaluateCandidateForSlot`, a akceptacja oferty ma jawną walidację widoczną w UI.
Statyczny fitness NPC pozostaje świadomie znanym długiem do wspólnego modelu PR81; przed jego
wdrożeniem nie wykonujemy makrokalibracji długich karier. Adaptacyjna zmiana formacji również należy
do PR81, a inteligencja rekrutacji oparta na lukach jakości do PR82.
