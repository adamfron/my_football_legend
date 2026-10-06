# Audyt silnika meczu — PR140 / aktualizacja PR155

PR155: `actionAgency.ts` i ostatnia granica `resolveMatchAction` rezerwują wszystkie
strzały dla człowieka przy włączonej sprawczości. `playerDecision.ts` projektuje
autonomiczną propozycję strzału jako obowiązkową decyzję, niezależnie od polityki
prezentacji. Wspólne opcje/resolvery fizyczne pozostają identyczne dla human/NPC.

`firstTimePassing.ts` używa prognozy kontaktu z `shootingOptions.ts` oraz istniejących
celów/planów/resolvera podania. Porównanie NPC z przyjęciem rozpoczyna świeży zegar
kontroli. `ballAcquisition.ts` zachowuje jednego nominowanego uczestnika do rozstrzygnięcia
fizycznego opanowania. Kontakt głową w `matchSimulation.ts` nie oznacza posiadania;
`aerialPlay.ts` blokuje powtórzenie nakładającego się kontaktu do rozdzielenia geometrii.
Ścieżka pościgu celuje w rzeczywisty punkt kontaktu, bez domieszki kotwicy formacyjnej.

`tacticalPositioning.ts` przydziela komplementarne zadania wsparcia i pozwala kolejnej
linii pomocy zejść po głębokie rozegranie. Diagnostyka presji i centralnych połączeń
jest ograniczonym obserwatorem; nie wpływa na RNG, decyzje, statystyki ani renderer.
Dowody, definicje i ograniczenia:
[PR155_PLAYER_AGENCY_STABILITY.md](PR155_PLAYER_AGENCY_STABILITY.md).
Historyczny kontrakt autonomii strzału PR152 poniżej zastępuje twarda własność PR155.

PR154 extends the merged GitHub #153 baseline with intended-pass ETA/lane/boundary scoring,
seeded physical execution diagnostics, receiver meeting-point movement, pressure-driven utility,
immediate formation support and bounded recent-solution memory. Mark handoff and keeper claim
ownership use current physical geometry. Micro-lab/OVR/support diagnostics remain observational.
Shot-distance aggregation now reads the canonical shot record after resolution/restarts.
The full calibration and invariants are documented in
[PR154_FOOTBALL_INTELLIGENCE.md](PR154_FOOTBALL_INTELLIGENCE.md).

Rozszerzony prompt PR152: przyczyna straty i przyznanie wznowienia mają oddzielne kanoniczne
fakty. Publiczne epizody kontroli nie naliczają przypadkowych bloków/parad. Aktywne minuty
ograniczają wskaźniki decyzji; dostęp do piłki ogranicza autonomiczne ryzykowne wejścia.
Aktualne definicje, macierz regresji i wyniki:
[PR152_STATISTICS_DISCIPLINE.md](PR152_STATISTICS_DISCIPLINE.md).

PR152: audyt rozdziela udział w kanonicznym futbolu, oczekującą decyzję człowieka i widoczne
ujęcia. Usunięto rezerwowanie strzału/dośrodkowania, pierwszego kontaktu, wznowienia i wyboru
obronnego wyłącznie na podstawie tożsamości sterowania. Rzeczywista decyzja i wybrana intencja
nadal zatrzymują/przejmują właściwą granicę. Odbiory są liczone według wykonawcy i tożsamości
próby, a zdobycie piłki zachowuje uczestników również po natychmiastowym wypuszczeniu.
Przechwyt, odzyskanie luźnej piłki, blok i wygrany pojedynek nie zastępują udanego odbioru.
Tani eksport kanoniczny oraz udział ukryty/widoczny działają bez obserwatora DEV.

Potwierdzono twardy reset w `restartScenarios.ts:applyRestartScenario`: przypisanie pozycji,
celu/idealnego celu i zerowej prędkości. Wywołują go granice boiska, strzał poza bramkę,
koniec 0,55-sekundowego interwału gola, faul/korzyść, spalony, zmiana wykonawcy po kartce,
druga połowa i jawny wybór scenariusza DEV. Dokładna mapa, testy, wyniki i ograniczenia:
[PR152_CANONICAL_PARTICIPATION.md](PR152_CANONICAL_PARTICIPATION.md).
Następny zakres: **PR156 — Dead Ball & Restart Continuity**; implementacja ciągłości wznowień
pozostaje poza PR152.

PR151: ograniczona pamięć zagrożeń należy do core i wpływa na istniejące cele bloku,
wsparcie oraz rzeczywisty wybór podań. Odpowiedź narasta stopniowo, zanika i zachowuje osłonę
przy lokalnym podwojeniu. Podwojenie zachowuje blokady par, fizyczny dostęp do piłki
i wspólny resolver odbioru. Poprawiono legalne pozycje karnych i reakcję na odbitkę,
wspólny profil ruchu oraz semantykę niezbieranej telemetrii. Selekcja nowych sekwencji pozostaje
niezależna od ciągłości ludzkiego posiadania. Audyt parytetu używa tego samego fizycznego
stanu i resolvera. Architektura, pomiary, odtworzenie i ograniczenia:
[PR151_REACTIVE_TACTICS.md](PR151_REACTIVE_TACTICS.md).

PR150: publiczne kontakty opisują ciągły epizod kontroli; wewnętrzne dowody kontaktów
pozostają szczegółowe. Sieć udanego podania ma rzeczywistego odbiorcę zarówno dla próby,
jak i ukończenia, z zachowaniem zamierzonego celu w diagnostyce. Rutynowe mikroakcje
zachowują wybraną intencję, przyjęcie zachowuje pęd, a zagranie do wolnego pola korzysta
z pozycji i ruchu partnerów. Spalony korzysta z migawki chwili zagrania; wektory UI
obserwują obecną prędkość. Szczegóły: [PR150_CONTINUOUS_INTENT.md](PR150_CONTINUOUS_INTENT.md)
i [PR150_ACCOUNTING.md](PR150_ACCOUNTING.md).

PR149: ustalono, że pauza NPC wynika z zachowanego timera skanowania PR148 oraz przypięcia
właściciela do pozycji. Istniejący `onBallPreparation` ma teraz jawny mikrostan i lokalny ruch,
bez nowego źródła decyzji. Przy kontakcie gubiono prędkość/wysokość piłki; odbiorca zachowuje
te dowody, a ciężkie/nieudane przyjęcie rzeczywiście pozostawia luźną piłkę. Dwa błędy podań
otrzymanych to nadpisanie wyniku kontaktem kolejnej akcji oraz pominięcie udanego kontaktu
niezamierzonego kolegi. `lastResolvedPass` i `actualReceiverId` są wspólnymi dowodami statystyk,
kontaktu i feedbacku. Definicja celów sieci podań rozróżnia zamiar od rzeczywistego odbiorcy.

`matchEventFeed` jest trwałym obserwatorem core. `MatchReplayHistory` zapisuje ograniczone
próbki także w tle, a UI odczytuje je bez wywołania rozstrzygnięć futbolu. Centrum meczu
projektuje pełne dane niezależnie od kamery. Czas posiadania i wznowienia są zliczane w core.
Architektura, testy, kalibracja oraz dokładne ograniczenia:
[PR149_IMPLEMENTATION_CALIBRATION.md](PR149_IMPLEMENTATION_CALIBRATION.md).

PR148: zidentyfikowano utratę pochodzenia kontaktu w ball-follow, odnawianie starego przyjęcia
przez innego aktora, ponawianie bliskiego pojedynku po timerze, wybór ryzyka bez kartki,
niemal natychmiastowe podania zwrotne, błędne czyszczenie epizodu sprintu i zliczanie korekcji
kolizji jako ruchu. Poprawki należą do dotychczasowych właścicieli core; renderer odczytuje
aktywną kadrę i terminalny stan. Nie dodano osobnego silnika, limitów statystyk ani stamina.
Kontrakty i pomiary: [PR148_CALIBRATION.md](PR148_CALIBRATION.md).

## Wniosek

Szczegółowy mecz ma jeden autorytet: `src/core/matchSimulation`. React, renderer, telemetria i
`MatchMoment` wyłącznie obserwują ten stan. `src/core/matchEngine.ts` jest nadal używany przez
karierowy `MatchGame`, więc nie można go jeszcze usunąć; jest jawnie oznaczonym placeholderem i nie
wolno dopisywać do niego nowych mechanik. Puste katalogi `src/core/decisions` i
`src/core/simulation` nie istnieją — nie utrzymujemy mylących namespace'ów.

## Mapa odpowiedzialności

| System                     | Kanoniczny właściciel                                                              | Właściciel prezentacji                | Legacy path          | Status                          | Zalecenie                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- | -------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Fizyka piłki 3D            | `ballPhysics.ts`, `ballFlight.ts`                                                  | renderer tylko rysuje wysokość        | brak                 | kanoniczny                      | nie tworzyć łuków w UI                                                    |
| Podania / cele             | `passLaunchPlan.ts`, `matchActions.ts`                                             | interakcje wybierają istniejącą akcję | `matchEngine.ts`     | kanoniczny + legacy             | legacy usunąć przy integracji kariery                                     |
| Przyjęcie                  | `passReception.ts`                                                                 | menu `incoming_ball`                  | brak                 | kanoniczny                      | kalibrować ETA i wysokość                                                 |
| Prowadzenie                | `carryExecution.ts`                                                                | cel kliknięcia                        | legacy momenty       | kanoniczny                      | wspólny checkpoint sprawczości                                            |
| Strzał                     | `shootingOptions.ts`, `shotIntent.ts`, `shootingOpportunity.ts`, `shotResolver.ts` | płaszczyzna celu i kanoniczne opcje   | legacy resolver      | kanoniczny                      | wspólne możliwości człowieka/NPC, jeden lot 3D                            |
| Bramkarz                   | `goalkeeperPositioning.ts`, `goalkeeperIntervention.ts`                            | animacja kontaktu                     | legacy wynik momentu | kanoniczny                      | obserwować podania zwrotne                                                |
| Przechwyty / luźna piłka   | `passClaimResolver.ts`, `looseBallPhysics.ts`, `playerArrival.ts`                  | znacznik celu                         | brak                 | kanoniczny                      | dalej kalibrować wolumen                                                  |
| Pojedynki                  | `matchSimulation.ts`                                                               | menu zobowiązania                     | legacy momenty       | kanoniczny                      | wydzielić dopiero przy realnej potrzebie                                  |
| Intencje/wykonanie odbioru | `defensiveChallenges.ts`, `matchActions.ts`                                        | kontekstowe menu celu                 | brak                 | kanoniczny, PR147               | jeden resolver człowieka/NPC; PR148 kalibruje lejek i pojedynki           |
| Faule/kartki/korzyść       | `matchRules.ts`                                                                    | pokazuje kanoniczne fakty             | brak                 | kanoniczny, PR147               | restart z miejsca kontaktu; bez rollbacku albo decyzji z animacji         |
| Strumień akcji             | `actionEvents.ts`                                                                  | `actionFeedback.ts`/ramki/renderer    | brak                 | dowody kanoniczne, ograniczone  | 12 s / <=96 zdarzeń; nie duplikować statystyk                             |
| Orientacja / lokomocja     | `playerOrientation.ts`, `locomotion.ts`                                            | renderer odczytuje facing             | brak                 | kanoniczny                      | bez fizyki w rendererze                                                   |
| Pozycjonowanie             | `tacticalPositioning.ts`                                                           | debug overlay                         | brak                 | kanoniczny, 10 Hz               | semantyczna invalidacja                                                   |
| Wznowienia                 | `restartScenarios.ts`, `restartGeometry.ts`, `matchActions.ts`                     | wybór legalnej akcji                  | legacy moment        | kanoniczny                      | watchdog pozostaje safety netem                                           |
| Decyzje gracza             | `playerDecision.ts`, `possessionAgency.ts`, `decisionOutcome.ts`                   | `TacticalMatchSandbox.tsx`            | legacy przyciski     | kanoniczny                      | epizod posiadania i semantyczne granice ponownej decyzji                  |
| Projekcja momentów         | `matchMoment.ts`, `matchPresentation.ts`                                           | polityka i faza widoku                | brak                 | obserwacyjny                    | wolno próbkować rutynę                                                    |
| Statystyki                 | `contactEvidence.ts`, `playerMatchStats.ts`                                        | polskie etykiety                      | statystyki kariery   | obserwator kanonicznych zdarzeń | jeden fizyczny kontakt i jedna wspólna realizacja passer/receiver/network |
| Telemetria                 | `matchFlowTelemetry.ts`                                                            | panele DEV / JSON                     | brak                 | obserwacyjny                    | nie może sterować wynikiem                                                |
| Kamera/rendering           | brak                                                                               | `tacticalRenderer/*`                  | `MatchGame` DOM      | prezentacyjny                   | PR141/142                                                                 |

## Wyniki wyszukiwania duplikatów

- Nie znaleziono aktywnego renderer-side generatora toru piłki, paraboli `peakHeight` ani drugiego
  probabilistycznego resolvera obrony w szczegółowym meczu.
- Transformacje kierunku ataku pozostają w `matchSpace.ts`; renderer mapuje tylko osie świata.
- Enumeracja i wykonanie wznowień korzystają ze wspólnych akcji; watchdog nie jest alternatywną
  mechaniką, lecz deterministycznym fallbackiem żywotności.
- `MatchGame` + `matchEngine` dublują zjawiska wyłącznie jako nadal używany, ryzykowny do usunięcia
  placeholder kariery. Usunięcie należy połączyć z integracją kariery, nie z PR140.
- `postActionAgencyCheckpoint` jest wspólnym mechanizmem ciągłości; nie dodano osobnych handoffów
  dla odbioru, odbioru defensywnego i prezentacji.

## Statystyka kontaktów i magnetyzm

PR145 zastępuje dawną definicję wejść w posiadanie dowodami rzeczywistych kanonicznych kontaktów.
`contactEvidence.ts` scala wypuszczenie, przyjęcie, kontakt lotu i zmianę kontroli według
zawodnika/czasu. Przyjęcie i strzał z pierwszej piłki albo catch/owner bramkarza liczą się raz.
Tick prowadzenia z przyczepioną piłką nie tworzy fikcyjnego kontaktu. UI używa „Kontakty”.
Ukończone podanie wymaga fizycznego kontaktu kolegi z drużyny; PR152 przypisuje je do
`actualReceiverId`, a zamierzony cel zachowuje jako diagnostykę. Razem zwiększa licznik
podającego, otrzymane podania rzeczywistego odbiorcy oraz krawędź sieci.
Telemetria korzysta z tych samych sum.
Dokładne definicje, świadome ograniczenia kategorii i stałe opisuje
[MATCH_BEHAVIOUR_CALIBRATION.md](MATCH_BEHAVIOUR_CALIBRATION.md).
Flaga kontrolowania nie jest wejściem rankingu adresatów; nie wprowadzono kwot pozycyjnych.

## PR147 — przepisy i czytelność akcji

`defensiveChallenges.ts` zapisuje fizyczny zamiar odbioru i wynik jednej próby: brak kontaktu,
minięcie, czysty odbiór, luźną piłkę albo faul. Geometria i kanoniczne atrybuty ograniczają
dostępność zwykłej/zaangażowanej próby, wślizgu i taktycznego zatrzymania; menu pozostaje
target-first. PR152 rezerwuje granicę faktycznej oczekującej decyzji człowieka; poza nią
kontrolowany zawodnik korzysta z tej samej autonomicznej polityki i resolvera co NPC.

`matchRules.ts` klasyfikuje dowód kontaktu, przechowuje dyscyplinę i kolejkę opóźnionych kartek,
prowadzi trzysekundowe okno korzyści oraz używa istniejących wznowień z kanonicznej lokalizacji.
Wykluczony piłkarz znika z aktywnej kadry, zachowując tożsamość w dyscyplinie/statystykach.
`actionEvents.ts` daje prezentacji ograniczone czasowo/ilościowo fakty, nie drugi stan futbolu.
`actionFeedback.ts` wybiera maksymalnie trzy priorytetowe, deduplikowane etykiety według czasu
wyświetlanej klatki; widok może wyjaśnić ciężkie przyjęcie → przechwyt bez wymyślania promptu.
Dokładny zakres, ograniczenia i status weryfikacji:
[RULES_DISCIPLINE_MATCH_FEEDBACK.md](RULES_DISCIPLINE_MATCH_FEEDBACK.md).

## Znane ryzyka

Krótka kalibracja PR145 nie ustala końcowego realizmu, rozkładu pełnych meczów ani ostatecznej
częstości decyzji dla wszystkich pozycji. Legacy kariery pozostaje świadomym długiem.
PR146 zmierzył progressive slowdown: DEV45 466,19 → 62,15 s, normal90 108,36 s.
Usunięto rutynowe kopie/skany historycznych obserwatorów, podwójny negatywny agency probe
i koszt DEV z domyślnego normal. Krok oraz pełne hashe futbolu pozostają identyczne;
granicę decyzji i niezależność ref od React sprawdzają regresje. Pozostały agency/ETA,
event-frequency copy i jawny drogi capture; video i pełna grywalna długość wymagają pomiaru.
[BACKGROUND_SIMULATION_PERFORMANCE.md](BACKGROUND_SIMULATION_PERFORMANCE.md).
