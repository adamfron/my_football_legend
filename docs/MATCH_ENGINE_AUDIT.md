# Audyt silnika meczu — PR140 / aktualizacja PR146

## Wniosek

Szczegółowy mecz ma jeden autorytet: `src/core/matchSimulation`. React, renderer, telemetria i
`MatchMoment` wyłącznie obserwują ten stan. `src/core/matchEngine.ts` jest nadal używany przez
karierowy `MatchGame`, więc nie można go jeszcze usunąć; jest jawnie oznaczonym placeholderem i nie
wolno dopisywać do niego nowych mechanik. Puste katalogi `src/core/decisions` i
`src/core/simulation` nie istnieją — nie utrzymujemy mylących namespace'ów.

## Mapa odpowiedzialności

| System                   | Kanoniczny właściciel                                                              | Właściciel prezentacji                | Legacy path          | Status                          | Zalecenie                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------- | -------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Fizyka piłki 3D          | `ballPhysics.ts`, `ballFlight.ts`                                                  | renderer tylko rysuje wysokość        | brak                 | kanoniczny                      | nie tworzyć łuków w UI                                                    |
| Podania / cele           | `passLaunchPlan.ts`, `matchActions.ts`                                             | interakcje wybierają istniejącą akcję | `matchEngine.ts`     | kanoniczny + legacy             | legacy usunąć przy integracji kariery                                     |
| Przyjęcie                | `passReception.ts`                                                                 | menu `incoming_ball`                  | brak                 | kanoniczny                      | kalibrować ETA i wysokość                                                 |
| Prowadzenie              | `carryExecution.ts`                                                                | cel kliknięcia                        | legacy momenty       | kanoniczny                      | wspólny checkpoint sprawczości                                            |
| Strzał                   | `shootingOptions.ts`, `shotIntent.ts`, `shootingOpportunity.ts`, `shotResolver.ts` | płaszczyzna celu i kanoniczne opcje   | legacy resolver      | kanoniczny                      | wspólne możliwości człowieka/NPC, jeden lot 3D                            |
| Bramkarz                 | `goalkeeperPositioning.ts`, `goalkeeperIntervention.ts`                            | animacja kontaktu                     | legacy wynik momentu | kanoniczny                      | obserwować podania zwrotne                                                |
| Przechwyty / luźna piłka | `passClaimResolver.ts`, `looseBallPhysics.ts`, `playerArrival.ts`                  | znacznik celu                         | brak                 | kanoniczny                      | dalej kalibrować wolumen                                                  |
| Pojedynki                | `matchSimulation.ts`                                                               | menu zobowiązania                     | legacy momenty       | kanoniczny                      | wydzielić dopiero przy realnej potrzebie                                  |
| Orientacja / lokomocja   | `playerOrientation.ts`, `locomotion.ts`                                            | renderer odczytuje facing             | brak                 | kanoniczny                      | bez fizyki w rendererze                                                   |
| Pozycjonowanie           | `tacticalPositioning.ts`                                                           | debug overlay                         | brak                 | kanoniczny, 10 Hz               | semantyczna invalidacja                                                   |
| Wznowienia               | `restartScenarios.ts`, `restartGeometry.ts`, `matchActions.ts`                     | wybór legalnej akcji                  | legacy moment        | kanoniczny                      | watchdog pozostaje safety netem                                           |
| Decyzje gracza           | `playerDecision.ts`, `possessionAgency.ts`, `decisionOutcome.ts`                   | `TacticalMatchSandbox.tsx`            | legacy przyciski     | kanoniczny                      | epizod posiadania i semantyczne granice ponownej decyzji                  |
| Projekcja momentów       | `matchMoment.ts`, `matchPresentation.ts`                                           | polityka i faza widoku                | brak                 | obserwacyjny                    | wolno próbkować rutynę                                                    |
| Statystyki               | `contactEvidence.ts`, `playerMatchStats.ts`                                        | polskie etykiety                      | statystyki kariery   | obserwator kanonicznych zdarzeń | jeden fizyczny kontakt i jedna wspólna realizacja passer/receiver/network |
| Telemetria               | `matchFlowTelemetry.ts`                                                            | panele DEV / JSON                     | brak                 | obserwacyjny                    | nie może sterować wynikiem                                                |
| Kamera/rendering         | brak                                                                               | `tacticalRenderer/*`                  | `MatchGame` DOM      | prezentacyjny                   | PR141/142                                                                 |

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
Ukończone podanie wymaga kontaktu zamierzonego odbiorcy i razem zwiększa licznik podającego,
otrzymane podania odbiorcy oraz krawędź sieci. Telemetria korzysta z tych samych sum.
Dokładne definicje, świadome ograniczenia kategorii i stałe opisuje
[MATCH_BEHAVIOUR_CALIBRATION.md](MATCH_BEHAVIOUR_CALIBRATION.md).
Flaga kontrolowania nie jest wejściem rankingu adresatów; nie wprowadzono kwot pozycyjnych.

## Znane ryzyka

Krótka kalibracja PR145 nie ustala końcowego realizmu, rozkładu pełnych meczów ani ostatecznej
częstości decyzji dla wszystkich pozycji. Legacy kariery pozostaje świadomym długiem.
PR146 zmierzył progressive slowdown: DEV45 466,19 → 62,15 s, normal90 108,36 s.
Usunięto rutynowe kopie/skany historycznych obserwatorów, podwójny negatywny agency probe
i koszt DEV z domyślnego normal. Krok oraz pełne hashe futbolu pozostają identyczne;
granicę decyzji i niezależność ref od React sprawdzają regresje. Pozostały agency/ETA,
event-frequency copy i jawny drogi capture; video i pełna grywalna długość wymagają pomiaru.
[BACKGROUND_SIMULATION_PERFORMANCE.md](BACKGROUND_SIMULATION_PERFORMANCE.md).
