# Audyt silnika meczu — PR140

## Wniosek

Szczegółowy mecz ma jeden autorytet: `src/core/matchSimulation`. React, renderer, telemetria i
`MatchMoment` wyłącznie obserwują ten stan. `src/core/matchEngine.ts` jest nadal używany przez
karierowy `MatchGame`, więc nie można go jeszcze usunąć; jest jawnie oznaczonym placeholderem i nie
wolno dopisywać do niego nowych mechanik. Puste katalogi `src/core/decisions` i
`src/core/simulation` nie istnieją — nie utrzymujemy mylących namespace'ów.

## Mapa odpowiedzialności

| System | Kanoniczny właściciel | Właściciel prezentacji | Legacy path | Status | Zalecenie |
|---|---|---|---|---|---|
| Fizyka piłki 3D | `ballPhysics.ts`, `ballFlight.ts` | renderer tylko rysuje wysokość | brak | kanoniczny | nie tworzyć łuków w UI |
| Podania / cele | `passLaunchPlan.ts`, `matchActions.ts` | interakcje wybierają istniejącą akcję | `matchEngine.ts` | kanoniczny + legacy | legacy usunąć przy integracji kariery |
| Przyjęcie | `passReception.ts` | menu `incoming_ball` | brak | kanoniczny | kalibrować ETA i wysokość |
| Prowadzenie | `carryExecution.ts` | cel kliknięcia | legacy momenty | kanoniczny | wspólny checkpoint sprawczości |
| Strzał | `shootingOpportunity.ts`, `shotResolver.ts` | płaszczyzna celu | legacy resolver | kanoniczny | nie proxy-resolvować ważnego strzału |
| Bramkarz | `goalkeeperPositioning.ts`, `goalkeeperIntervention.ts` | animacja kontaktu | legacy wynik momentu | kanoniczny | obserwować podania zwrotne |
| Przechwyty / luźna piłka | `passClaimResolver.ts`, `looseBallPhysics.ts`, `playerArrival.ts` | znacznik celu | brak | kanoniczny | dalej kalibrować wolumen |
| Pojedynki | `matchSimulation.ts` | menu zobowiązania | legacy momenty | kanoniczny | wydzielić dopiero przy realnej potrzebie |
| Orientacja / lokomocja | `playerOrientation.ts`, `locomotion.ts` | renderer odczytuje facing | brak | kanoniczny | bez fizyki w rendererze |
| Pozycjonowanie | `tacticalPositioning.ts` | debug overlay | brak | kanoniczny, 10 Hz | semantyczna invalidacja |
| Wznowienia | `restartScenarios.ts`, `restartGeometry.ts`, `matchActions.ts` | wybór legalnej akcji | legacy moment | kanoniczny | watchdog pozostaje safety netem |
| Decyzje gracza | `playerDecision.ts`, `decisionOutcome.ts` | `TacticalMatchSandbox.tsx` | legacy przyciski | kanoniczny | stabilna sygnatura, nie timestamp |
| Projekcja momentów | `matchMoment.ts`, `matchPresentation.ts` | polityka i faza widoku | brak | obserwacyjny | wolno próbkować rutynę |
| Statystyki | `playerMatchStats.ts` | polskie etykiety | statystyki kariery | obserwator kanonicznych zdarzeń | `touches` = wejścia w kontrolowane posiadanie |
| Telemetria | `matchFlowTelemetry.ts` | panele DEV / JSON | brak | obserwacyjny | nie może sterować wynikiem |
| Kamera/rendering | brak | `tacticalRenderer/*` | `MatchGame` DOM | prezentacyjny | PR141/142 |

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

`touches` obecnie oznacza **wejścia w kontrolowane posiadanie piłki**, nie każdy fizyczny kontakt
według dostawców danych. `passesReceived` oznacza ukończone podania do zamierzonego odbiorcy. UI
powinno traktować pierwsze jako „posiadania”, dopóki obserwator nie otrzyma pełnego strumienia
kontaktów. Flaga kontrolowania nie jest wejściem rankingu adresatów, ale wpływ pośredni wymaga
dalszego wieloseedowego A/B; nie wprowadzono kwot pozycyjnych.

## Znane ryzyka

Kalibracja zaangażowania bocznego obrońcy, liczby podań/przechwytów i czułości `key_player` nie jest
uznana za zakończoną. Legacy kariery pozostaje świadomym długiem. Scheduler należy profilować na
realnych 45-minutowych sesjach, a nie zamieniać w większy krok fizyki.
