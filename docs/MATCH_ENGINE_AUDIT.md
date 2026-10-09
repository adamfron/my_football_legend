# Audyt silnika meczu — PR140 / aktualizacja PR159

## PR159 — continuity, shared spin and state-based restart readiness

Base: merged PR158, `a7c90299c01c080eb356fe88e0ef47d4a7b1f639`. Implementation
replaces live restart snapshot placement with an immutable incident/award, physical
retrieval and existing locomotion toward role zones. Frozen DEV injection remains
explicit. Legal readiness observes the ball and active roster; tactical receiver
readiness is separate. Selection queues one shared action and preserves absolute
controlled non-throw ownership, including no execution RNG/accounting on rejection.

Canonical spin is part of the shared flight/forecast/rebound path. Ordinary direct
shots remain eligible without xG ranking; chip and wall-specific profiles share
physical eligibility with execution. Moving body capsules and actual jump lift
decide wall contact. Post-goal urgency/retrieval and a bounded overlapping-reason
stoppage ledger supply canonical state for PR160/PR161. Frame/replay landmarks are
read-only and distinguish the moving ball from the legal spot.

IFAB 2026/27 location/readiness/scoring/offside contracts are tested, with explicit
scope limits: indirect menu excludes shots even though kicking toward goal is legal
before the required other-player touch; full handball/penalty procedure, countdown,
half-end penalty extension and official added-time policy are deferred. Old optional
save fields retain legacy setup/release and zero-spin behaviour.

Final full verify PASS: lint, 1367 main tests/171 files, five career tests and build.
Code revision: `6e303b97eb1d82685f206fd1aea5dd5aeea5969a`. Focused smoke: 12/12
released and returned to open play, zero player/ball award displacement. Runtime
4357.36→5069.96 ms (+16.4%) for 9600 ticks, with comparable but changed seeded geometry.
160-tick exact-state observer/step-entry parity and save/transport/release parity PASS.
These tests establish specific mechanics, not league flow realism or a general
speedup. Simplified frame rebounds and general source-free own-goal handling remain
limitations. Evidence and the 15 answers are centralized in
[PR159_DEAD_BALL_RESTART_CONTINUITY.md](PR159_DEAD_BALL_RESTART_CONTINUITY.md).

PR158 open issues remain explicit: shots 110→16, goals 68→10; CM touches
4957→3461/receptions 2831→1993; adjacent-tick flips 24→94, spells <0.5 s 51→189;
prolonged/low-progress rotations. The demanded-turn lab separately records

> 360°/net<3 m 2→16 and fouls 90→369. Historical PR158 draft/calibration wording
> below is preserved evidence; PR158 is merged. Reassess the interacting systems
> after PR160 and PR161 through one combined full-match diagnostic and realism audit.

## PR158 — finite contacts, press resistance and situational tactics

Base: merged PR157, `73c0fabed04ee4a31da85fa918f19bbc42344975`. The confirmed controlled-ball
defect was body-relative coordinate replacement every tick: rotation could move the ball
without a foot contact. `ballContactGeometry.ts` now supplies one bounded anticipation plan,
transformed foot/torso access and velocity impulses at actual reachable contacts. Between
contacts the existing rolling integrator advances the ball at the unchanged 0.025 s step.
Ownership never guarantees the next contact or excludes an independent legal defender.

Turn/contact preparation depends continuously on angle, orientation, speed, angular velocity,
relative ball motion, offset, balance and existing skills. Protecting-body compression and
relative speed load balance; Strength/Agility resist that physical load. Exposed-side access
does not disappear for a strong carrier. Release/restart/ownership changes invalidate the plan.
Granular physical evidence still projects one public touch per continuous control episode.
The seeded challenge outcome/foul pipeline and pair re-arm locks remain shared by all sources.

Accounting review found continuous physical-control impulses growing the legacy contact-ID
ledger while public touches stayed at one. The `47f99f54` fix uses one optional latest-contact
timestamp per player, preserves legacy saved IDs, and rejects repeated/older evidence after
release or half-time without mutating earlier statistics branches. Discrete pass/shot/control
ledgers remain. Four new regressions and 34 focused tests pass; all exported football fields
match exactly in 18 windows, 1,760 contact trials and 210 tactical/scenario rows, with only
stated bookkeeping checksums/timing omitted. Final verify passes lint, 1,263 main tests/163
files, five career tests/one file and build; strict benchmark TypeScript passes. Three isolated fresh-process pairs measure elapsed time: release_minimal -2.64%, normal -2.41%, dev +3.02%, capture -1.22%;
the separate observer adds +2.50% median elapsed time. This single-fixture
result does not establish broad speedup, exclusive CPU shares, or browser/video cost.
The bounded diagnostic tracker alone must not be cited as proof of bounded accounting.

Candidate carry ranking considers its proposed contact difficulty, window and defender access.
The six preference axes influence decision/positioning, while active-XI suitability exposes
press cost and line risk. Safe ready outlets can favour screening or a block, and a useful
local counterpress decays with geometry/time rather than an eight-second cancellation.
No style adds a physical success multiplier, no role has a participation quota, and no timer
forces a turnover. PR155 controlled-shot and PR156 non-throw restart ownership remain binding.

`ContactTacticalTracker` separates attempts/results/contact/recovery, six transition clocks,
continuous pressure episodes, carrier rotation and bounded all-22 workload. It is read-only:
snapshots cannot split a live carrier episode, old shot results cannot become post-regain
releases, backward pass labels do not imply progression, and stoppages censor transitions.
Restart placement and dismissed players do not inflate open-play workload. Pressure actors
are independently observed; a nearest-player swap is not a new continuous pressure event.

Presentation picking uses projected 32–48 CSS-pixel player targets and legal contextual IDs.
It does not change physical contact ranges or consume canonical RNG. Accounting regressions
preserve a released advantage shot after a manual DEV restart and reject a pre-execution
whistle-invalidated shot. The missing original 752.05 capture proves no production foul bug.
Live/replay carrying frames must also preserve canonical ball placement; face-relative
animation must not replace the finite physical trajectory with a visually attached ball.

Interpretation limits: reach evidence for a resolved challenge is not evidence for every
unresolved intent; workload speed crossings and lane/exposed-transition samples are proxies;
formal challenge body contacts do not fully measure continuous shielding load. Demanded turn
labs show physical possibility, while autonomous frequency belongs to controlled carrier
episodes in full matches. Provider CHALLENGE/RECOVERY definitions cannot be equated to MFL.
Frozen before/after evidence, verification and performance belong to
[PR158_BALL_CONTACT_PRESSING_TACTICS.md](PR158_BALL_CONTACT_PRESSING_TACTICS.md).
The next scopes are PR159 restarts, PR160 fatigue/injuries/substitutions/added time, and
PR161 presentation/replay/stadium. PR158 enables no stamina depletion or age penalty.

The final paired matrix has 18 fixed 90-minute canonical windows per revision, preserving
actual statuses (PR157 {"second_half":4,"full_time":14}; PR158 {"full_time":12,"second_half":6}).
The acquisition-integration defects are corrected: broad proximity cannot secure control
before actual foot reach, stop pursuit before contact, or reserve a loose ball against another
legally reachable player. A replacement nominee begins fresh preparation without inheriting
the earlier clock/outcome. Completed final-source attempts 6645→4418,
passes 10005→13074, shots 110→16,
goals 68→10, adjacent-tick flips
24→94 and short spells
51→189 remain explicit.
Absolute rotation includes scans/reversals: >180° uses net <2 m; >360° uses net <3 m.
Lab owned movement is censored at the first stoppage as well as ownership loss, preventing
restart placement from being reported as dribble. Final source `47f99f54b75785040c94e7e81c0799af79d42ceb92d501b09388c089be3ca0ba` replaces
superseded prototype evidence; complete validation and tradeoffs are in the PR158 report.
Draft calibration remains necessary before merging: central-midfielder touches
4957→3461 and receptions 2831→1993
regress despite more aggregate passing. Demanded-turn >360°/net<3 m trials
2→16
and lab fouls 90→369 also worsen.

The [evidence manifest](performance/PR158-evidence-manifest.json) inventories archived raw, source and report snapshots. The local output/attachment `outputs/PR158-evidence.zip` contains 824 hash-checked entries; five compact summaries regenerated exactly. Its checksum is retained separately in local metadata.

## PR157 — dynamic pressing and shooting calibration (validated; calibration limits remain)

`derivePressingPlan` projects contain/screen/engage/emergency intentions from attributes,
cover, control exposure, discipline and threat. Engage approaches the exposed ball shoulder;
containment preserves space deliberately. Aggression affects commitment/recruitment/technique,
never the quality of an identical physical challenge. Existing episode locks still prevent re-arm spam.
`onBallPreparation.ts` and `carryExecution.ts` respond to an arriving defender's predicted
trajectory through ordinary locomotion. Local support and smaller remote block shifts use
the existing tactical architecture; no movement timer forces a release or tackle.

Confirmed defects: the shield-only 0.72 m eligibility guard could not be reached under
1.15 m body separation and 0.32–0.38 m ball offset, despite the shared 0.95 m resolver reach;
keeper Positioning leaked into the shooter's pressure/trajectory; and a rejected controlled
shot proposal initialized or pruned the canonical action ledger. The first is corrected by
consistent eligibility/approach geometry, the second by geometric shooting pressure,
the third by preserving the entire football state when only `shotAgencyRequest` is created.
The shooting lab additionally exposed an x-only extension that shifted angled rays at the
goal plane, missing shot results when the touchline was crossed first, and generated headers
defaulting to the keeper's central path. Ray continuation now preserves the sampled aim;
earliest-boundary resolution records the shot once without overwriting an earlier same-shot
save/block. Generated headers use the existing geometry-based placed target, while explicit
human targets remain authoritative.
Exploratory native full matches also exposed excessive committed selection (83 fouls in one
seed). Final selection prioritises an attainable standing poke and forecasts exposed ball/body
geometry at the existing committed/slide preparation times. The shared resolver quality and
discipline remain unchanged; the final full-match matrix, rather than a foul quota, verifies it.

`shootingDifficulty.ts` supplies continuous target-plane uncertainty for distance, angle,
pressure, orientation, weak foot, moving/airborne contact, visible goal area and blockers.
Finishing/Heading, Technique, Composure and Agility answer different demands. The low end
has broad finite error; maximum skill retains uncertainty. Expected placement is an RNG-free
selection approximation. Goals/saves still require the common flight/contact pipeline.

`pressingDiagnostics.ts` observes approach → contain/screen → contact/escape/release →
handoff/recovery. Static-pressure counts require controlled close possession (≤2.6 m),
both actor speeds and actual ball motion relative to the body <0.35 m/s, and ≥2 s without
a sampled meaningful solution change. Assignment
is refreshed at 4 Hz; expensive option/geometry/evolution probes run at 1 Hz, while speeds
and action/carry-mode/microphase changes are observed every 25 ms; a decision-index increment
alone does not reset stationarity. It retains ≤256 episodes ×8 samples plus
a 241-bin duration histogram (one-second bins; final bucket covers ≥240 s). Observer
timers and counters never feed the engine. Extra independently seeded diagnostic rankings
are distinguished from canonical engine RNG draws in integrity evidence.

The benchmark separates execution, projected/public on-target outcome, keeper intervention
and goals. Full verification passed: lint, 1215 main tests/156 files, 5 career tests and build;
four new benchmark scripts pass strict TypeScript. Final integrity preserves 66 disabled
identities, 124,345 enabled pre-decision ticks and normal/DEV/capture canonical/RNG parity;
144 blocked controlled shot proposals consume zero RNG.

Twelve paired 90-minute matches per revision use the same corrected observer: static episodes
164/13,126 (1.25%) → 10/16,243 (0.062%). This remains a bounded diagnostic improvement.
Attempts 1,112→4,207, shots 214→74, high-pressure stationary time 1,824.81→3,327.01 s and shielding
4,390.15→13,016.69 s expose remaining density/selection/passivity weaknesses. Central save
saturation, easy open goals, close/chip geometry and wall blocks also remain calibration limits.
No league-realism conclusion follows. Six alternating 600-second runs (three pairs) show a
median runtime ratio 1.00754 (~+0.75%) without rendering or simulation-frequency changes.
Compact evidence: [flow](performance/PR157-flow-summary.json),
[integrity](performance/PR157-integrity-summary.json), [performance](performance/PR157-performance.json).
Measurements, reproduction and unresolved limits belong to
[PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md](PR157_DYNAMIC_PRESSING_SHOOTING_CALIBRATION.md).
Next: **PR159 — Dead Ball & Restart Continuity**, **PR160 — Fatigue, Injuries, Substitutions &
Added Time**, **PR161 — Match Presentation / Replay / Stadium Polish**.

## PR156 — integrity and difficulty calibration

Disabled controlled identity no longer relabels ordinary actions. Controlled non-throw restart
ownership is enforced before resolution/stepping/DEV delegation; presentation gates cannot
suppress its real human decision. Passing execution and utility share continuous uncertainty
and reception evidence. Low airborne foot control uses continuous segment contact, high-control
waiting creates no contact lock, and explicit ground delivery retains its physical meaning.
Release-time flank relationships survive reception. Bounded network/central/pressure observers
record football causes rather than imposing role shares or a release timer.
Evidence, attribute-scale audit and limitations: [PR156_AGENCY_PASSING_CONNECTIVITY.md](PR156_AGENCY_PASSING_CONNECTIVITY.md).
Historical autonomy descriptions below are constrained by PR155 shot and PR156 restart ownership.

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
Następny zakres po mechanice kontaktów PR158: **PR159 — Dead Ball & Restart Continuity**; implementacja ciągłości wznowień
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
