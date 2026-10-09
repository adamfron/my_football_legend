# Roadmap

## Historyczne / późniejsze pomysły równowagi pozycyjnej

- Rozszerzyć wspólny model o człon kompensacji pustych stref po czerwonych kartkach albo
  opuszczeniu strefy przez zawodnika, bez przebudowywania formacji od zera.
- Dodać modyfikatory ról dla libero i wahadłowych oraz bogatsze ograniczenia pozycyjne stałych
  fragmentów gry na wspólnym modelu celu.
- Dodać późniejszy widok debug taktyki z góry do kalibracji bloków, średnich pozycji i przestrzeni.

Elementy te są punktami rozwoju architektury i nie są obecnie zaimplementowane.

## Autorytatywna kolejność rozwoju Single Match

GitHub #153 scalił uzupełnienie PR152: semantykę strat/wznowień, aktywne minuty decyzji
i kalibrację dyscypliny. PR154 rozwija sytuacyjną inteligencję, atrybuty oraz wyjście z presji.
PR155 stabilizuje własność strzału człowieka, wspólne podanie z pierwszej piłki,
kanoniczne opanowanie luźnej piłki oraz geometrię wsparcia i połączenia pomocy.
PR156 dodaje integralność sprawczości, trudność podań, diagnostykę centralnych połączeń i przepływu.
PR157 rozwija dynamiczne intencje pressingu, fizyczną reakcję posiadacza i kalibrację
strzałów według umiejętności × ciągłej trudności. Implementacja i wymagana walidacja PR157
są zakończone. PR158 dodaje kolejne fizyczne kontakty z piłką, odporność na presję,
rytm pojedynków i sytuacyjne preferencje taktyczne; pełna choreografia
wznowień i bogatsze menu wolnych należą do PR159. Dokumenty wyników:
[PR158_BALL_CONTACT_PRESSING_TACTICS.md](PR158_BALL_CONTACT_PRESSING_TACTICS.md),
[PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md](PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md),
[PR156_AGENCY_PASSING_CONNECTIVITY.md](PR156_AGENCY_PASSING_CONNECTIVITY.md),
[PR155_PLAYER_AGENCY_STABILITY.md](PR155_PLAYER_AGENCY_STABILITY.md),
[PR154_FOOTBALL_INTELLIGENCE.md](PR154_FOOTBALL_INTELLIGENCE.md),
[PR152_STATISTICS_DISCIPLINE.md](PR152_STATISTICS_DISCIPLINE.md).

### COMPLETED

PR105–PR157 są zaimplementowane w opisanym zakresie. PR151 łączy kalibrację po playteście PR150
z reaktywną taktyką zespołów; PR152 oddziela autonomię piłkarza od ludzkiej sprawczości i dodaje
kanoniczne inwarianty oraz diagnostykę udziału/statystyk. Kondycja i urazy pozostają później.
W szczególności:

- **PR118:** fizyczne ETA przechwytu i przekazanie sprawczości zawodnikowi.
- **PR119:** kalibracja przepływu meczu, strzałów i xG.
- **PR120:** części meczu, statystyki zawodnika i fundament powtórek.
- **PR121:** sprawczość bramkarza i celowanie na płaszczyźnie bramki.
- **PR122:** stabilność posiadania i relacje na skrzydle.
- **PR123:** zajmowanie ostatniej tercji, kombinacje skrzydłowe i integralność interakcji.
- **PR124:** telemetria posiadania, fizyczne prowadzenie, presety/zoom kamery i prezentacja piłki prowadzonej.
- **PR125:** podania kontekstowe i na dobieg, stabilność posiadania oraz dopracowanie interakcji.
- **PR126:** stabilne śledzenie kamery, twarde przekazanie sprawczości po akcji, niezawodne
  celowanie i kanoniczny powietrzny profil autu.
- **PR128 — Body Orientation, Unified Ball Physics & Goalkeeping Fundamentals:** kanoniczna orientacja
  ciała, jeden lot oparty na prędkości 3D oraz czasowa, geometryczna interwencja bramkarza. Usunięto
  skryptowane łuki i rozstrzyganie obrony przed fizycznym kontaktem.

- **PR129 — Interaction Integrity, Wide Play & Crossing Calibration:** integralność interakcji,
  relacje na skrzydle i kontekstowe dośrodkowania.
- **PR130 — Match Flow, Reception & Contextual Carry Calibration:** wspólny plan podania,
  fizyczne przyjęcia oraz kontekstowe prowadzenie.
- **PR131 — Match Flow & Runtime Hardening:** gotowość odbiorcy, bezpieczna geometria celów i
  stabilność wznowień.
- **PR132 — Possession Rhythm, Terminal Decisions & Geometry Integrity:** przygotowanie akcji przy
  piłce, rytm posiadania oraz integralność geometrii i decyzji terminalnych.
- **PR133 — Player Interaction, Reception & Runtime Hardening:** interakcje gracza, kierunkowe
  przyjęcia oraz stałokrokowy runtime z bezpiecznym nadrabianiem czasu.
- **PR134 — Possession Contests, Goalkeeping & Decision/Restart Hardening:** fizyczna dostępność
  przechwytów i pojedynków, aktywna interwencja bramkarza oraz semantyczne decyzje i żywotność wznowień.
- **PR135 — Goalkeeping, Interception Calibration & Match Moment Foundations:** kalibracja reakcji
  i fizycznego kontaktu bramkarza, lejka przechwytów, biegów skrzydłowych i epizodów sprintu oraz
  czysta, obserwacyjna projekcja ważnych momentów.
- **PR136 — Match Interaction Completeness & Tempo Calibration:** kompletność interakcji,
  podania górą, asysty, fizyczne obrony bramkarza i spokojniejszy rytm posiadania.
- **PR137 — Background Match Presentation & Moment Sensitivity:** batchowe wykonywanie jednego
  kanonicznego meczu, epizody momentów i polityki czułości.
- **PR138 — Background Presentation Hardening & Decision Liveness:** ukryty renderer, żywotność
  decyzji i wznowień oraz rozdzielony zegar prezentacji.
- **PR139 — Background Simulation Performance Benchmark:** powtarzalny profil core/obserwatorów.
- **PR140 — Canonical Fast Simulation Path, Interactive Player Episodes & Match Engine Audit:**
  planowanie 10 Hz z semantyczną invalidacją, dokładna granica sprawczości, zdarzeniowe okno wyniku
  i mapa właścicieli mechanik.

- **PR141 — Windows-95 Match Presentation & Camera Interaction:** zwarty interfejs wspólny z
  CareerView, klubowe stroje z fallbackiem kolizji, czytelniejsze boisko/bramki i cele, kamera
  desktop z pivotem śledzenia oraz wspólna transformacja celu bramki. Diagnostyka pozostaje
  dostępna w zwijanych panelach. Zweryfikowano przez `npm run verify`.

- **PR142 — Match Animation & 3D Presentation v1:** lekki model przegubowy, detale strojów,
  lokomocja z prędkości kanonicznej, gesty kontaktu/przyjęcia, oburęczny aut, główki i bramkarz.
  Powtórka interpoluje zapisane klatki; picker pozostaje niezależny od kończyn. Zwijane narzędzia
  DEV są nad boiskiem. Zweryfikowano przez `npm run verify`.

- **PR143 — Interactive Moment Context & Presentation Windows:** sprawczość jest niezależna od
  czułości oglądania. Każda znacząca decyzja zatrzymuje jeden silnik; ukryte ticki zapisują lekki
  bufor 10 Hz / 6 s (maks. 62 próbki). Historyczny lead-in dochodzi do nieruchomej granicy decyzji,
  a kontrolki aktywują się dopiero wtedy. Wynik ma zdarzeniowe okno, krótki ogon i ograniczone
  łączenie groźnych sytuacji. Jedna rzeczywista opcja pozostaje autonomiczna. Dodano telemetrię
  sprawczości, okien i kosztu bufora oraz regresje. Zweryfikowano przez `npm run verify`.

- **PR144 — Shooting & Final-Third Action Variety:** wspólny generator kontekstowych strzałów
  człowieka i AI, mechaniczne profile mocnego/technicznego/lobu, rzeczywiste pierwsze kontakty,
  półwoleje/woleje/główki oraz loft podcinki w jednej fizyce 3D. Epizod posiadania człowieka
  zachowuje własność decyzji terminalnych; carry ma semantyczny waypoint i wcześniejsze decyzje
  przy istotnej zmianie sytuacji. Dodano telemetrię stylów, gesty kontaktu, mniejsze ringi z depth
  test i zegar MM:SS. Zweryfikowano przez `npm run verify`; szeroka kalibracja pozostaje PR145.

- **PR145 — Match Behaviour & Calibration Pass:** osiągalne podania na dobieg z wektora ruchu
  odbiorcy i wspólnego ETA; check-back/support ma osobną semantykę. Legalne, celowane auty
  zachowują wybranego odbiorcę i zakaz ponownego kontaktu wykonawcy. Wspólna fizyka 3D tworzy
  loft zależny od dystansu, a toczenie ma opór 3,2 m/s² bez zatrzymywania przy zadanym celu.
  Kontakty i ukończone podania mają wspólne dowody/identyfikatory i spójną sieć. Rutynowa
  obrona pozostaje autonomiczna, przechwyt uwzględnia ETA kolegów; epizod człowieka PR144
  zachowuje terminalną sprawczość również po aucie. Jawny błąd wykonania strzału, fizyczna
  reakcja/zasięg bramkarza i pasywna kolizja tułowia zastępują patologiczne przypadki.
  `npm run verify`: exit 0, 697 testów głównych + 5 kariery, lint i build. Benchmark 3 × 600 s:
  136 → 14 decyzji względem PR144 (projekcja 408 → 42 / 90 min), zero niespójnych przyjęć;
  kontrolowane 224 strzały: 148 celnych, 73 gole, 75 obron, 76 kontaktów bramkarza.
  To ograniczone dowody, nie końcowy realizm. Definicje i stałe:
  [MATCH_BEHAVIOUR_CALIBRATION.md](MATCH_BEHAVIOUR_CALIBRATION.md).

- **PR146 — Background Simulation Performance:** deterministyczny benchmark 10/45/90 min,
  pięciominutowe buckety, profil podsystemów i jawne tryby normal/DEV/capture. Usunięto
  rutynowe kopie/skany rosnących historii i powtarzany probe MatchMoment; UI publikuje tło
  co 250 ms, z natychmiastową granicą decyzji. DEV45: **466,19 → 62,15 s (7,50×)**,
  degradacja końca/początku **8,36× → 1,48×**. Normal90: **108,36 s (49,83×)**,
  minimum 117,90 s, DEV 121,80 s; identyczne hashe A–D10/A–C90 oraz checkpoint PR14545.
  Krok 0,025 s, statystyki, sprawczość, kontekst 10 Hz / 6 s / <=62 i 0 renderów tła zachowane.
  `npm run verify`: exit 0, **720 + 5 testów**, lint/build. Milestone headless <5 min spełniony;
  pełny interaktywny mecz 4–6 min i video koszt pozostają do pomiaru. Drogi capture jest opcjonalny
  (77,81 s / 10 min); pełnego D90 nie wykonano. Dowody i ograniczenia:
  [BACKGROUND_SIMULATION_PERFORMANCE.md](BACKGROUND_SIMULATION_PERFORMANCE.md).

**PR147 — Rules, Discipline & Match Feedback**

- faule wynikające z kanonicznego kontaktu, żółte/czerwone kartki, korzyść z ewentualnym
  powrotem do przewinienia, opóźniona kartka, wolne/karne z rzeczywistego miejsca kontaktu;
- rutynowa autonomiczna obrona kontrolowanego zawodnika używa zwykłych akcji o niskim ryzyku;
  jawnie agresywny/lekkomyślny odbiór o wysokim ryzyku kartki zwykle wymaga decyzji człowieka.
  Zwykła fizyczna gra może przypadkowo skończyć się faulem, ale autonomia nie wybiera po cichu
  niebezpiecznej akcji, by następnie jedynie poinformować gracza o wyrzuceniu;
  ten historyczny kontrakt PR147 zastępuje PR152: faktyczna oczekująca decyzja pozostaje
  zarezerwowana dla człowieka, a poza nią działa wspólna polityka autonomiczna wszystkich piłkarzy;
- czytelny feedback akcji/kontaktu z kanonicznych zdarzeń: subtelne, krótkie etykiety przy akcji,
  np. „odbiór”, „wślizg”, „podanie”, „strzał”, „faul”. To prezentacja dowodów, nie drugi silnik
  przepisów ani wnioskowanie z animacji. Łańcuch podanie → ciężkie przyjęcie → przechwyt może
  wyjaśnić epizod bez promptu, jeśli piłka została utracona przed znaczącym oknem sprawczości;
- dostępność technik defensywnych wynika z celu, geometrii, czasu i ryzyka. Nie tworzymy
  stałego pięcioprzyciskowego menu obrony ani promptu dla każdego rutynowego kontaktu;
- ograniczony strumień zdarzeń i uczciwa telemetria rozróżniają próbę, brak kontaktu, czysty
  odbiór, luźną piłkę, faul/kartkę i korzyść; benchmark BEFORE/AFTER zachowuje kontrakt PR146.
- zweryfikowano kanoniczne wykluczenie/ten-man, celowanie, historyczną granicę kartki i
  minimalny fallback bramkarza; `npm run verify`: exit 0, 777 + 5 testów, lint/build;
- normal10, trzy naprzemienne próby: mediana 16,300 → 13,302 s; równe hashe powtórzeń
  i minimum/normal/DEV. To nie dowód optymalizacji: zmienił się futbol/aktywny skład.
  Próbka ma 17 fauli, 13 żółtych i 5 drugich żółtych/czerwonych; bez strojenia rozkładów w PR147.
  Architektura, dowody i ograniczenia:
  [RULES_DISCIPLINE_MATCH_FEEDBACK.md](RULES_DISCIPLINE_MATCH_FEEDBACK.md).

**PR148 — Defensive Realism, Discipline & Match-Cadence Calibration**

- wspólny milestone PR147.1/PR148: przerwanie meczu poniżej siedmiu aktywnych zawodników,
  ze stanem `abandoned`, powodem `insufficient_players`, rzeczywistym wynikiem i czasem;
- kompletne usunięcie wykluczonego z aktywnego składu i celów, zachowanie historii i zamrożenie minut;
- ryzyko odbioru zależne od kartki, atrybutów i kontekstu; historyczna konserwatywna autonomia
  człowieka zastąpiona w PR152 wspólną polityką poza faktyczną oczekującą decyzją;
- epizody pojedynków, kalibracja fauli/kartek i znaczenie składowych jakości obrońcy;
- dyskretne kontakty z piłką, epizody sprintu oraz rzeczywisty rytm podań i ruchu;
- deterministyczny benchmark wielu seedów z surowymi liczbami, per-90, rozkładami i dowodami
  kanonicznymi. Definicje, pomiary i ograniczenia: [PR148_CALIBRATION.md](PR148_CALIBRATION.md).

### Dalsza kalibracja ról i kombinacji

- audyt i kalibracja nadmiernego wolumenu kontaktów, podań i przechwytów; dalsza gęstość decyzji
  na podstawie pełnych interaktywnych playtestów, bez tłumienia sprawczości dla wydajności;
- różnorodność ważnych akcji: nie powtarzać dziesięć razy tej samej progresji lewy obrońca → skrzydłowy;
- podanie na dobieg definiuje spotkanie przed odbiorcą wzdłuż **jego wektora ruchu**. Cel boczny
  albo nieco cofnięty w osiach boiska może być prawdziwym lead pass, także przy cutback;
- domknięcie overlap/underlap, wsparcie bocznych obrońców w ataku pozycyjnym, cutback i kombinacje szerokie;
- role, mentalność, instrukcje, atrybuty i kontekst różnicują ruch: selektywnie ofensywny,
  technicznie/pozycyjnie mocny boczny obrońca oraz agresywny, pracowity ofensywny obrońca
  nie mają identycznego profilu. Bez nazw realnych graczy i reguły „LB zawsze obiega”;
- pełna kalibracja pojedynków obrońca–drybler oraz lejka okazja → próba → kontakt → wynik,
  z wykorzystaniem kanonicznych dowodów PR147. Próba odbioru nie jest dowodem wygranego odbioru;
- kalibracja różnic jakości wykonania/pojedynków między atrybutami, rolami i poziomami zawodników;
- **Discipline realism calibration**, po pomiarze i ustabilizowaniu lejka pojedynku/kontaktu.
  Reprezentatywne pełne mecze i duże deterministyczne batchy należy porównywać z rozkładami
  rzeczywistego futbolu, korzystając z wiarygodnych referencyjnych zbiorów danych, gdy są dostępne:
  faule na zespół/90 min, żółte kartki na mecz, czerwone na 100 meczów, karne na mecz,
  kartki na faul, faule na próbę defensywną, częstość korzyści oraz rozkłady względem stylu,
  pozycji i jakości zawodnika. Celem są wiarygodne rozkłady, nie sprowadzanie każdego meczu
  do średniej. Atrybuty i kontekst różnicują skłonność; interpretacja ligi/sędziego może później
  stać się osobnym parametrem. PR147 dostarcza telemetrię, bez globalnego tuningu częstości
  do arbitralnych liczb. PR148 dostarcza mały zestaw kalibracyjny; długookresowe rozkłady
  lig, sędziów i stylów wymagają większych batchy oraz referencyjnych danych.

Motywacja z playtestów: wiele rozpoczętych overlapów przy bardzo małej/zerowej liczbie użytecznych
ukończonych kombinacji. Analizować wspólny lejek **start biegu → dostępność → wybór podania →
udane przyjęcie → dośrodkowanie/cutback/kontynuacja**. Celem są spójne, zróżnicowane kombinacje.
PR148 koryguje rytm i semantykę dystansu/sprintów bez maskowania ich zmęczeniem.

**PR149 — Match Readability, Animation & Match Centre v2**

- zachowany timer większych decyzji PR148; kanoniczne kontrolowanie, zwrot, skanowanie,
  korekta, osłona i odzyskiwanie kontroli z lokalnym ruchem/orientacją/pozycją piłki;
- przyjęcie z rzeczywistego kontaktu, jawnym kontekstem jakości i mechanicznym luźnym ciężkim
  lub nieudanym przyjęciem; naprawione otrzymane podania i rzeczywisty adresat kontaktu;
- trwały feed core dla bramek, kartek, karnych i fauli oraz niezależne od polityki oglądania
  Centrum meczu ze statystykami kanonicznymi;
- semantyczne pozy i ograniczone etykiety akcji; sampled replay także z tła: 5 Hz, 12 s,
  osiem okien ważnych zdarzeń, bez mutacji żywego meczu;
- raport, deterministyczne porównania i ograniczenia:
  [PR149_IMPLEMENTATION_CALIBRATION.md](PR149_IMPLEMENTATION_CALIBRATION.md).

**PR150 — Continuous Ball Control, Intent-Based Play & Space Passing**

- trwała intencja człowieka, tryby prowadzenia/sprintu/dryblingu/osłony i zachowanie pędu przyjęcia;
- jeden publiczny kontakt na epizod kontroli; spójna sieć podań i audyt sprintu;
- zagrania do biegnących partnerów w wolne pole, płaskie i górne podania prostopadłe;
- spalony przy zagraniu, pośredni wolny, ustawienie ofensywnych wolnych i aktualne wektory ruchu;
- architektura, testy i pomiary: [PR150_CONTINUOUS_INTENT.md](PR150_CONTINUOUS_INTENT.md).

**PR151 — Match Cadence Calibration + Reactive Team Tactics**

- ograniczona, zanikająca pamięć zagrożeń i stopniowa odpowiedź w normalnym pozycjonowaniu;
- bezpieczniejsze rozegranie, krótkie wsparcie, ochrona kanału i kontekstowy drugi obrońca;
- mniej rutynowych nowych sekwencji przy zachowaniu ciągłości znaczących wyborów człowieka;
- legalne pozycje karnych, wspólny profil ruchu, parytet strzałów i jawny zakres telemetrii;
- deterministyczne scenariusze, kilka seedów 45/90 minut i dowody:
  [PR151_REACTIVE_TACTICS.md](PR151_REACTIVE_TACTICS.md).

**PR152 — Canonical Player Participation, Statistical Invariants & Match Sanity**

- pełna autonomia kontrolowanego piłkarza poza rzeczywistą oczekującą decyzją człowieka;
- ciągłe epizody kontroli piłki i próby/wygrane odbiory z jednoznacznych zdarzeń;
- tani raport kanoniczny bez obserwatora DEV, udział ukryty/widoczny i pasma ostrzeżeń;
- porównanie tego samego zawodnika z NPC, wiele seedów 45/90 minut i deterministyczne dowody;
- audyt resetów pozycji, bez implementowania kolejnej fazy wizualnej:
  [PR152_CANONICAL_PARTICIPATION.md](PR152_CANONICAL_PARTICIPATION.md).

### COMPLETED — PR157 (implementacja i walidacja zakończone)

**PR157 — Dynamic Pressing, Ball-Carrier Response & Shooting Difficulty Calibration**

- reprodukcja statycznego pressingu i ograniczona obserwacja całego epizodu;
- obserwator: przypisanie 4 Hz, opcje/geometria/ewolucja 1 Hz, prędkości i istotne zmiany akcji co 25 ms;
- contain/screen/engage/emergency, agresja jako zaangażowanie, kontekstowe ryzyko kartki;
- dojście do dostępnej piłki, reakcja posiadacza na pęd rywala i lokalne przesunięcia zespołów;
- ciągła trudność strzału, izolacja atrybutów, fizyczny lejek strzału/bramkarza i istniejące wolne;
- deterministyczne macierze before/after, wydajność oraz kontrakty sprawczości PR155/PR156;
- brak pełnej choreografii wznowień, nowych menu wolnych, kondycji i przebudowy prezentacji.

Walidacja: `npm run verify` (lint, 1215 testów głównych +5 kariery, build), ścisły TypeScript
czterech benchmarków, 66 porównań tożsamości i 144 odrzucone propozycje strzału bez RNG.
Pełny przepływ 24 meczów: statyczne epizody 164/13126→10/16243; mediana kosztu symulacji
około +0,75% w 3 sparowanych pomiarach 600 s. Pozostają większa gęstość prób odbioru
(1112→4207), mniej strzałów (214→74), więcej stania pod dużą presją i osłaniania oraz
nasycone geometrie strzału/bramkarza. Nie jest to potwierdzenie realizmu ani uzasadnienie
statystycznych celów. [Przepływ](performance/PR157-flow-summary.json),
[integralność](performance/PR157-integrity-summary.json), [wydajność](performance/PR157-performance.json).

### CURRENT — PR158

**PR158 — Ball Contact Geometry, Press Resistance, Duel Cadence & Tactical Pressing Intelligence**

- rzeczywista piłka pomiędzy osiągalnymi kontaktami, jeden ograniczony plan kolejnego kontaktu;
- fizyczna trudność zwrotu, osłaniający tułów, odsłonięta piłka i dostęp drugiego obrońcy;
- ranking proponowanego prowadzenia według kontaktu/ekspozycji i legalne proste wyjścia podaniem;
- sytuacyjny pressing, counterpressing i blok z sześcioma ciągłymi preferencjami;
- ciągłe dopasowanie do rzeczywistej XI oraz ekonomiczne trasy i wartościowe pozycje;
- sześć niezależnych zegarów przejścia, cenzurowanie przerw i ograniczone pomiary obciążenia;
- publiczny kontakt jako epizod kontroli, wspólny resolver human/NPC i istniejąca sprawczość;
- ograniczona deduplikacja kontaktów fizycznych przez znacznik czasu na zawodnika, z obsługą
  starych zapisów i ochroną przed ponownym kontaktem po zamknięciu epizodu lub połowy;
- wygodniejszy ekranowy wybór legalnego celu bez powiększania fizycznego zasięgu;
- pozycja prowadzonej piłki zgodna z kanoniczną trajektorią także w animacji i powtórce;
- deterministyczne scenariusze, sparowane pełne mecze, wydajność oraz parytet obserwatorów;
- brak pełnej przebudowy wznowień, zużycia kondycji, starzenia i nowych systemów trenera.

Pomiar, weryfikacja i jawne ograniczenia:
[PR158_BALL_CONTACT_PRESSING_TACTICS.md](PR158_BALL_CONTACT_PRESSING_TACTICS.md).
Kontrakt przyszłego profilu trenera: [PR158_TACTICAL_PREFERENCES.md](PR158_TACTICAL_PREFERENCES.md).

Audyt księgowości wykrył wzrost historycznych ID wraz z każdym impulsem fizycznym.
Naprawa `47f99f54` ma 34 zaliczone testy skupione oraz dokładny parytet eksportowanego
futbolu w 18 oknach, 1760 próbach kontaktowych i 210 scenariuszach taktycznych. Dyskretne
rejestry podań, strzałów i kontroli pozostają zachowane. Pełne verify zalicza lint,
1263 testy główne/163 pliki, 5 testów kariery/1 plik i build; benchmarki przechodzą
ścisły TypeScript. Izolowane trzy pary jednej konfiguracji: release_minimal -2.64%, normal -2.41%, dev +3.02%, capture -1.22%;
osobny obserwator +2.50% mediany czasu. Nie jest to dowód ogólnego przyspieszenia
ani kosztu przeglądarki/wideo; dokładne zakresy i hashe zawiera raport.

Końcowa macierz 18 sparowanych okien po 90 minut na rewizję raportuje próby odbioru
6645→4418, ukończone podania 10005→13074,
strzały 110→16, gole 68→10,
sąsiednie przeskoki posiadania 24→94
i krótkie epizody 51→189.
Naprawiono przedwczesne opanowanie bez kontaktu stopy oraz rezerwowanie luźnej piłki
przez wcześniejszą nominację. Każde okno zachowuje faktyczny status natywnego końca części.
Wyniki, ograniczenia, integralność i pełne verify są w raporcie; liczby nie są kwotami
ani dowodem zakończenia kalibracji całego futbolu. PR pozostaje draftem przed scaleniem:
spadł udział środkowych pomocników (publiczne epizody kontroli — touch — 4957→3461,
przyjęcia 2831→1993); lab wymaganych zwrotów
pogorszył obrót >360°/net<3 m 2→16
i faule 90→369.

[Manifest dowodów](performance/PR158-evidence-manifest.json) opisuje zamrożone wejścia, kod i raporty w archiwum. Lokalny plik wynikowy/załącznik `outputs/PR158-evidence.zip` zawiera 824 wpisy ze sprawdzonymi hashami; pięć podsumowań odtworzono dokładnie z wejść. Sumę kontrolną ZIP zapisano osobno w lokalnych metadanych.

### NEXT

**PR159 — Dead Ball & Restart Continuity**

- fizyczne przejście z bieżących pozycji do legalnego ustawienia wznowienia;
- stan reakcji po golu i wybór celebracji albo pilnego wznowienia według wyniku/czasu;
- odzyskanie piłki z bramki po późnym golu odrabiającym stratę;
- gotowość wznowienia oparta na pozycjach i dostępności piłki;
- fundament doliczonego czasu oparty na kanonicznych przerwach.

Dokładne wejścia obecnego teleportowania zapisano w audycie PR152. PR157 kalibruje istniejącą
fizykę wolnego, ale nie implementuje pełnej ciągłości wznowień ani menu technik PR159.

Po ciągłości wznowień:

**PR160 — Fatigue, Injuries, Substitutions & Added Time**

- kanoniczne obciążenie, kondycja, zmęczenie i regeneracja, z trwałością między spotkaniami;
- osobno długotrwała rezerwa/zdolność oraz krótkotrwała gotowość do powtarzanego intensywnego
  wysiłku, ograniczona przez tę rezerwę; obserwacje PR158 nie są jeszcze krzywą zużycia;
- kontekstowe efekty fizyczne dla sprintu/ruchu/wykonania, oparte na jawnych danych i testach;
- ryzyko urazów, doliczony czas i decyzje zmian, oparte na tym samym obciążeniu człowieka i NPC;
- integracja kariery i kalibracja deterministycznych pełnych meczów, bez maskowania rytmu kwotami.

**PR161 — Match Presentation / Replay / Stadium Polish**: filmowe powtórki, finalne animacje,
parametryczne stadiony. Później: duża kalibracja lig, świadomy wybór piętki i
parametryczne stadiony z trwałą tożsamością klubu. Stadion pozostaje kosmetyczny; PR149 nie
wdraża jego geometrii ani sztuki.

Później: trwałe profile trenerów korzystające z istniejących osi, rozwój i starzenie zawodników.
Spadek możliwości fizycznych nie oznacza takiej samej utraty techniki, podań, wykończenia albo
inteligencji pozycyjnej. Oddzielić umiejętności, kondycję, obciążenie i regenerację; dopuścić
wczesny spadek fizyczny oraz wyjątkową długowieczność bez wyjątków dla nazwanych zawodników.

Późniejsza stamina/fatigue ograniczy powtarzane sprinty, regenerację, szybkość lokomocji,
jakość wykonania i gotowość do długich biegów. Najpierw należy ustalić rozsądny rytm ruchu
bez piłki; zmęczenie nie jest łatką na nadmierną obecną częstość biegów. PR146 nie implementuje
PR147–PR149, zmęczenia, zmian, nowych stylów strzału/curl/Magnus, pogody, tekstur ani ceremonii.

Prezentacja nadal obserwuje `matchSimulation`; nie tworzy drugiego stanu futbolu.
Celowanie używa promienia kamery i kanonicznej bazy `goalCoordinates`. Overview, Action,
Player, zoom, orbit, pan i Reset zachowują pivot PR141. Touch i pełny kompaktowy układ
Full-HD/mobile pozostają przyszłą pracą; narzędzia DEV nie należą do release UI.

### LATER

Poniższe tematy należą do późniejszych etapów i nie są implementowane w PR148:

- pełny model stamina/conditioning, osobowości i surowość sędziów;
- ławka/tunel po wykluczeniu, bogatsze animacje, finalne małe etykiety akcji;
- system migawek/powtórek, archetypy tłumu/stadionu oraz bogatsze techniki strzału;
- rozbudowane decyzje człowieka o agresywnym faulowaniu;
- długookresowa kalibracja lig/sędziów/stylów oparta na rzeczywistych statystykach;

- fitness, obciążenie wysiłkiem i regeneracja;
- pogoda oraz środowisko murawy i piłki, z kanonicznym wpływem na fizykę;
- integracja kanonicznego silnika meczu z karierą;
- kanoniczne oceny meczowe według własnej, wyjaśnialnej metodologii MFL;
- trwały rynek transferowy i piłkarski świat NPC;
- lekka generacja i rozwój młodzieży;
- oszczędna, modułowa narracja kariery;
- trwałe wyróżnienia, nagrody i najważniejsze momenty kariery;
- lekka ekonomia stylu życia/inwestycji w duchu New Star Soccer, bez gry typu tycoon,
  garażu, wyścigów czy metagry kolekcjonerskiej;
- bogatszy początkowy kreator zawodnika;
- deterministyczne, parametryczne twarze zawodników wspólne dla kariery i renderera meczu.

**MFL nie będzie miało minigry budowy stadionu.** Stadiony będą kontekstowe/parametryczne.
Docelowo każdy trwały klub otrzyma stabilny seed/profil stadionu, aby ten sam gospodarz nie
dostawał zupełnie innej areny w każdym meczu. Pogoda, tłum, banery, oświetlenie i zużycie
murawy mogą zmieniać się niezależnie od tożsamości stadionu. Sam stadion mogą zmienić
dopiero jawne późniejsze wydarzenia świata. PR149 może rozwinąć prezentacyjne archetypy;
pełny generator/profil trwałego stadionu oraz wydarzenia świata pozostają późniejszym etapem.

Pogoda/warianty piłki i ceremonialna prezentacja pozostają po obecnej pracy kalibracyjnej.
Planowane warianty wyglądu piłki: standardowa jasna, alternatywne wzory oraz dobrze widoczna
żółta/pomarańczowa, m.in. dla śniegu/jasnego tła. Pogoda/rozgrywki mogą później wybrać wygląd;
tekstura/kolor są prezentacją, wpływ pogody na tarcie/lot należy do przyszłej kanonicznej fizyki.

Późniejsza ceremonia obejmuje wyjście z szatni/tunelu, hymn i ustawienie składów, zdjęcie przed
meczem, szpaler, przywitanie sędziego, wręczenie trofeum i celebracje. Spin piłki, siła Magnusa,
wiatr i zależności pogodowe pozostają osobnym rozszerzeniem po kalibracji bazowego lotu.
Curled shot, outside-foot/trivela, toe-poke i improvised finish mogą rozszerzyć model intencji
strzału później; curl pojawi się w normalnym menu dopiero wtedy, gdy prawdziwa fizyka spin/Magnus
potrafi zakrzywić tor. Nie rysujemy pozornej krzywizny w rendererze.

### AFTER PR126 — systemy symulacji meczu

- **Kontekst stanu meczu:** zmęczenie, zmiany, wpływ wyniku na taktykę i ryzyko w końcówce.
- **Przepisy:** faule, żółte/czerwone kartki, korzyść, karne z fauli, VAR i czas doliczony.
- **Występ zawodnika:** końcowa ocena liczbowa z kanonicznych dowodów akcji/wyników; osobno
  decyzja i wykonanie; kreacja strzałów, progresja i wkład defensywny; bez nagrody za sam wybór
  dobrze wyglądającego przycisku.
- **Integracja kariery:** dopiero po dojrzeniu pętli Single Match: Single Match Lab → kanoniczny
  mecz kariery → grywalne ważne spotkania → ten sam resolver → kanoniczne statystyki →
  konsekwencje fitnessu, morale i historii.
- **Późniejsze systemy:** instrukcje trenera; odwróceni boczni obrońcy i bogatsze role; wykonawcy
  stałych fragmentów; rozwój terminarza/rozgrywek, puchary krajowe, Europa i reprezentacje.

**Rutynowy futbol jest symulowany. Znaczący futbol jest rozgrywany.**

**Single Match Lab → kanoniczna migawka → znacząca decyzja gracza → wspólny resolver →
fizyczny wynik → nowa migawka.**

Materiał kalibracyjny udostępniamy zależnie od skali: szczegółowy incydent jako istniejący JSON
±10 s (oraz WebM, gdy istotny jest ruch), a wielominutowy trend zachowania jako kompaktowe
podsumowanie benchmarku sesji JSON.

Warstwy kanonicznego podejmowania akcji pozostają rozdzielone: **formacja → kontekst zespołu →
relacje ról / intencje ruchu → krótkoterminowa predykcja osiągalnej przestrzeni → obserwacja
podającego / obrońcy → wybór akcji → kanoniczny ruch + fizyka piłki**. Predykcja jest czystą,
obserwacyjną projekcją, a nie drugim przebiegiem symulacji ani skryptem ruchu.

Docelowy przepływ pracy: **Single Match Lab → snapshot → decyzja gracza → rozstrzygnięcie core →
animowany wynik → nowy snapshot**. Dopiero dojrzała pętla zostanie włączona do meczów kariery.

Architektura interakcji: **stan kanoniczny → ewaluator sytuacji → istotność dla kontrolowanego
piłkarza → okazja decyzyjna → wybór celu → kanoniczne interakcje dla celu → wybór intencji →
wspólny resolver → fizyczny wynik → ewentualny nowy węzeł decyzji**. UI target-first jest projekcją
kanonicznego futbolu, nie drugim silnikiem reguł.

## Historia — stabilizacja integracji asynchronicznego zapisu (PR85)

Ten zapis dokumentuje ówczesną stabilizację integracji przepływu kariery z asynchronicznym zapisem
v7. Wskazana w nim dawna kolejność została zrealizowana lub zastąpiona i nie konkuruje z bieżącą
sekcją `NEXT`.

## Historia — kolejność planowana po PR77

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
NEXT definiuje sekcja „Autorytatywna kolejność rozwoju Single Match”: po stabilizacji PR155 ciągłość martwej piłki
i wznowień, następnie rozwój kondycji,
urazów, doliczonego czasu i inteligencji zmian.
Poniższa lista jest historycznym kontekstem systemów kariery; starsze plany pakietów
zagranicznych nie wyprzedzają obecnej kolejności silnika meczu.

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
  `assignedPosition` powstaje dopiero po wejściu na boisko. Rezerwowy musi wtedy otrzymać faktyczny
  użyty slot/pozycję taktyczną, nigdy automatycznie `primaryPosition` z braku przydziału XI.
- Trener zainteresowany zawodnikiem o pozycji nieużywanej w formacji może w przyszłości zaproponować
  konkretną zmianę pozycji lub rolę alternatywną; nie jest to automatyczne dopasowanie.
- Należy ponownie przeanalizować rozdział pozycji nominalnej, slotu taktycznego oraz roli/duty.
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

Późniejszym dużym systemem kariery pozostaje niedoskonały rynek transferowy NPC, po obecnej
kolejności rozwoju Single Match.

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

Przyszły audyt rozwoju porówna poziom trudności ze startowym i szczytowym OVR, liczbą sezonów, meczów i minut, rozmiarem lig oraz meczami pucharowymi, europejskimi i reprezentacyjnymi, a także inwestycjami. Obecna skrócona kariera krajowa nie jest podstawą do strojenia krzywych ani dodawania trybu Very Easy.

## Plan po PR83

Persistence 2.0 / normalizacja świata jest ukończonym fundamentem: zapis kariery i świata ma jawne granice, proceduralne
tożsamości są rekonstruowane, a przynależność zawodowych NPC ma jeden kanoniczny, player-centric
stan. Globalna kalibracja rozwoju i populacji jest świadomie odłożona do czasu Competition/Calendar
2.0, rozszerzenia lig oraz pucharów krajowych i innych znaczących spotkań.

**Zrealizowano w PR84:** przeglądarkowy zapis IndexedDB z bezpieczną migracją dawnego zapisu
`localStorage`, jawnym trybem awaryjnym i asynchroniczną, szeregowaną granicą zapisu.

**Zrealizowano w PR85:** ustabilizowano asynchroniczny zapis i przepływ kariery.

**Zrealizowano w PR86:** powstał odizolowany, developerski sandbox animowanego meczu z kanoniczną
geometrią 105 × 68, stałą kamerą izometryczną i trzema deterministycznymi sekwencjami.

**Następny krok — PR87:** Animated Tactical Decision Vertical Slice połączy prawdziwe decyzje
`MatchMoment` z geometrią taktyczną i animacją, bez przenoszenia rozstrzygnięć do renderera.

### Animowane sekwencje decyzji taktycznych

Ważne mecze rozgrywane osobiście użyją izometrycznego renderera taktycznego o stałej orientacji:

`migawka / bramka decyzyjna → decyzja gracza → deterministyczne rozstrzygnięcie core → krótka
animacja → autonomiczna kontynuacja → kolejna bramka, gdy protagonista znów jest istotny`.

Mecz pozostaje decyzyjny, nigdy zręcznościowy ani refleksowy. Renderer nigdy nie rozstrzyga wyniku
sportowego. Warstwa wizualna może docelowo użyć Three.js, `OrthographicCamera`, `WebGLRenderer`
oraz prostych modeli low-poly lub billboard sprites; silnik fizyki nie jest potrzebny. Core zapisuje
kanoniczne współrzędne boiska, a współrzędne renderowania są wyłącznie pochodnym stanem prezentacji.
Orientacja kamery pozostaje stabilna, aby gracz nie musiał mentalnie obracać boiska.

### Position & Tactical Role Design Revisit

Po testach gry należy ponownie ocenić kanoniczny zestaw pozycji nominalnych — zwłaszcza czy ofensywny
i defensywny pomocnik pozostają jednym nominalnym CM opisanym geometrią i duty — oraz zgodność
skrzydłowych, wahadłowych i bocznych obrońców. Nie należy rozwiązywać tego przez mnożenie pozycji:
pozycja nominalna, slot taktyczny i rola/duty powinny pozostać osobnymi pojęciami.

### Rekrutacja i spójność taktyczna

Klub nie powinien mocno zabiegać o pozycję nieobecną w modelu taktycznym trenera, chyba że trener
realnie planuje inną formację, zawodnik pasuje do innego slotu albo sztab proponuje konkretny cel
przekwalifikowania (np. „Trener widzi cię docelowo jako prawego wahadłowego.”). Gotowość do nauki
ma zależeć od adaptacji, wieku, znajomości pozycji i `positionalFlexibility` trenera.

### Gwiazda kontra system

Przyszły trener może zmienić formację dla wyjątkowego zawodnika, użyć go w sąsiedniej roli,
zaproponować przekwalifikowanie albo zachować system i zaakceptować frustrację oraz możliwe odejście.

### Termin makrokalibracji

Kalibracja globalna nastąpi dopiero po Competition/Calendar 2.0, większej strukturze ligowej oraz
pucharach i dodatkowych znaczących meczach. Audyt ma śledzić według sezonu i poziomu: min/P10/
medianę/P90/max siły XI, wiek i udział 33+, OVR nowych juniorów, zmianę OVR około 18→21→24 lat,
jakość transferów przychodzących i wychodzących oraz liczbę realnych kandydatów na jedno miejsce w
kadrze zawodowej.

### Prezentacja emerytury

`EndCareerView` docelowo przejmie język wizualny `CareerView`; trzeba sprawdzić wiek emerytury przez
kanoniczny resolver daty/wieku, przypisanie trofeów i osiągnięć do właściwego zakończonego sezonu
oraz użyć istniejących sezonowych migawek OVR do wykresu całej kariery.

## Po PR89 — rozwój kanonicznego meczu

**Zrealizowano w PR91:** intencja ataku v1 dodaje wartość terytorium, progresywne i bezpośrednie
podania (w tym podanie w przestrzeń), wielokierunkowe prowadzenie, ograniczone biegi ofensywne,
overlap bocznego obrońcy, głębsze przesunięcie bloku oraz DEV harness wznowień.

**Zrealizowano w PR92:** tymczasowa, deterministyczna geometria wznowień obejmuje długi i krótki
wariant od bramkarza, strefowe rożne, trzy warianty wolnego z fundamentem muru oraz prawidłowe
ustawienie karnego. Kanoniczny cykl przygotowanie–wykonanie–wygaszanie płynnie oddaje sterowanie
równowadze gry otwartej, bez teleportacji i bez osobnego silnika stałych fragmentów.

**Zrealizowano w PR93:** pierwsza pełna pętla interakcji łączy presję, odbiory, przechwyty w locie,
piłki bezpańskie, strzały, reakcję bramkarza, wynik oraz wykonywalne wznowienia.

**Zrealizowano — research-driven Tactical Situation Playbook v1:** sytuacyjne role i strefy są
nakładane na kanoniczną równowagę pozycyjną. Warstwa obejmuje rozpoczęcie, długi i krótki wariant
bramkarza, deterministycznie zróżnicowane rożne, trzy wolne oraz legalny karny; udostępnia też
efemeryczne metryki kształtu drużyny w Single Match Lab.

**Zrealizowano w PR95 — Aerial Play v1:** wspólne dośrodkowania i dostawy ze stałych fragmentów,
parametryczny lot, lokalny wybór uczestników pojedynku, główki, wyjścia bramkarza, reakcje na drugą
piłkę oraz minimalny resolver piłki poza grą korzystają z ról playbooka i wracają do jednego obiegu
posiadania/piłki bezpańskiej.

**Zrealizowano — Shot & Goalkeeping v2:** intencja i błąd umiejscowienia, geometryczne pudła i
obramowanie, lokalne bloki, model zasięgu bramkarza oraz kanoniczne odbitki domykają wspólną pętlę
strzału także dla główek. Diagnostyka Single Match Lab pokazuje wynik resolvera, nie tworzy go.

**Historyczna kolejność (zrealizowana lub zastąpiona):** (1) rozdzielenie Match Time & Kinematics od czasu prezentacji,
(2) bufor powtórki 0,5×, (3) Match Moment / Situation Evaluator, (4) kalibracja Tactical Situations
& Set Pieces v2, (5) vertical slice kontekstowych decyzji zawodnika. Nadal odłożone są pełna
fizyka piłki, menu kontekstowe, integracja meczu kariery oraz ogólna kalibracja zegara meczu.

Pierwszy autonomiczny rdzeń taktyczny współdzieli reguły protagonisty i NPC oraz obsługuje
spektatora. Kolejne kroki to: (1) rozbudowa akcji i rozstrzygnięć o podania prostopadłe, odbiory,
strzały, reakcje bramkarza i czasowy spalony; (2) indywidualne tendencje taktyczne; (3) dopiero po
dojrzeniu kanonicznego zestawu akcji — kontekstowe menu gracza jako UI nad tym samym zbiorem.
Globalna kalibracja kariery i rozwoju pozostaje odłożona do ukończenia rozszerzenia rozgrywek.

### Historia rozwoju meczu — PR117–PR124 (zrealizowana)

- **PR117 — ukończony:** podania uwzględniające ruch odbiorcy i Tactical Match Presentation v1.
- **PR118 — ukończony:** fizyczna osiągalność przechwytu, przekazanie sprawczości po akcji gracza
  oraz czytelność proceduralnych postaci v2.
- **PR119 — ukończony:** płynność meczu, wybór strzałów, kalibracja xG i integralność telemetrii.
- **PR120 — ukończony:** cykl części meczu, kanoniczne statystyki występu, wynik końcowy i fundament
  powtórek bramek.
- **PR121 — ukończony:** sprawczość bramkarza, celowanie strzału i bezpieczne trajektorie za linią
  bramkową.
- **PR122 — ukończony:** stabilność i progresja posiadania oraz relacje bocznego obrońcy ze
  skrzydłowym.
- **PR123 — ukończony:** zajmowanie ostatniej tercji, kombinacje skrzydłowe i integralność
  interakcji.
- **PR124 — ukończony:** rytm i przeżywalność posiadania, fizyczna semantyka prowadzenia oraz
  pierwsze preferencje kamery meczu.

Dalszą, jedyną autorytatywną kolejność opisuje sekcja na początku dokumentu.

- **PR132 — ukończony:** rytm posiadania, kanoniczne przygotowanie piłki, wartość zachowania
  terminalnego zagrożenia oraz integralność geometrii `PitchPoint` i projekcji bramkarza.
- **PR133 — następny:** Windows-95 Match Presentation, bez tworzenia równoległej logiki futbolu.

- **Później:** zmęczenie, zmiany i kontekst wyniku; faule, kartki, VAR i czas doliczony;
  integracja meczu kariery; agregacja oceny meczowej; stroje, herby i logotypy; profile siły Elo
  oraz polityki transferowej klubów.

Dogrywany czas powinien w przyszłości wynikać z kanonicznych zdarzeń utraconego czasu (kontuzji,
zmian, bramek i wznowień, VAR-u, kartek, fauli i długich przygotowań stałych fragmentów), nigdy z
losowego „+3”. Implementacja czeka na istnienie tych źródeł zdarzeń.

Daleki wrzut z autu pozostaje przyszłą, kontekstową opcją wznowienia zależną m.in. od siły,
techniki/setPieces, odległości od pola karnego, odbiorcy, pojedynku w powietrzu i ryzyka. Nie będzie
uniwersalnie mocniejszym wariantem każdego autu.

Przyszły rynek transferowy powinien opierać hierarchię siły i prestiżu klubów na globalnym
ratingu siły (Elo lub modelu równoważnym), a nie wyłącznie na miejscu w tabeli ligi. Kluby otrzymają
kanoniczne profile polityki transferowej obejmujące preferowany wiek, rekrutację krajową i
zagraniczną, skłonność do rozwoju talentów lub wydatków na gwiazdy, dyscyplinę płacową, próg
sprzedaży i planowanie pozycji. To nota architektoniczna, nie implementacja logiki transferów.
