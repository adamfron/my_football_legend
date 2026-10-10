# My Football Legend — Current Project State

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
