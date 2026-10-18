# PR176 — Executable PR177 Blueprint

**Pierwszy eksperyment: pakiet B, wspierany przez A jako comparator/fallback.** Celem jest materialnie inny wybór i tworzenie akcji: kontrolowany dostęp między linie, wykorzystywanie biegu i umiarkowanych okazji strzeleckich, mniejsza jałowa cyrkulacja przy zachowanej obronie. Wynik może być negatywny; nie wystarczy „wszystkie testy przechodzą” i niezmieniony futbol.

PR176 dostarcza specyfikację, aktualne [mathematics](PR176_MATCH_ENGINE_MATHEMATICAL_AUDIT.md), [options](PR176_MATCH_ENGINE_REFORM_OPTIONS.md), [timing inventory](PR176_TIMING_AND_THRESHOLD_INVENTORY.md), receipts oraz nowe initial inputs. **Nie zawiera wdrożenia poniższych interfejsów/policies.** PR177 ma implementować i porównać, PR178 niezależnie potwierdzić. Summary calibration przesuwa się do PR180 i pozostaje zależna od oceny PR178.

## 1. Granice i moduły

| Moduł                                                  | Aktualne zachowanie                                             | Proponowana konkretna zmiana                                                                                                | Zachowany kontrakt / ryzyko                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| matchActions.ts                                        | Enumeration, mixed scoring, selection, timing i execution razem | Adapter policy przed wyborem; legacy code literalnie zachowany; new policy oddaje zwykły MatchAction + chosen feasible plan | resolveMatchAction jako wspólny wykonawca; human shot guard, stats, seeded execution i offside  |
| passDecision.ts                                        | Geometry→completion→retention plus utility penalty              | Rozdzielić evidence od policy utility; expose correlated risk channels i branches                                           | Baseline output/ordering dokładnie takie samo; nie przeliczać błędu drugi raz                   |
| passLaunchPlan.ts / receiverReadiness.ts               | Intent deadline i osobny aerial planner                         | Immutable feasible plan z rzeczywistym energy/contact envelope;3 speed choices max                                          | Ten sam nominalny plan w valuation i release; actual error nie przekracza mechanical capability |
| passReception.ts / spacePassing.ts / reachableSpace.ts | Existing target/velocity i lead dependency; top 3 nearest       | Prospective run corridor od postoju lub pass-triggered movement; through niezależny od starego lead gate                    | Onside at release, bounds, arrival/reach, no teleport; candidate cap                            |
| carryOpportunity.ts                                    | Requested endpoint skill/value, sprint clipped corridor         | Outcome envelope controlled/contested/loss; wspólna consequence scale z pass                                                | carryExecution i contact/locomotion pozostają fizyczną prawdą                                   |
| shootingOpportunity.ts / shootingOptions.ts            | Terminal expectation, range/physical options, style             | Adapter do common value; first-time utility ocenia ten sam contact state                                                    | Ranges/reach/laws, target error i GK/CCD bez coefficient inflation                              |
| onBallPreparation.ts                                   | Physical readyAt i micro phases/passingAngle                    | Physical readiness evidence i interruptible micro intention; angle invalidated semantic change                              | Pęd, feet i first touch; nie znika preparation bo cooldown OFF                                  |
| matchSimulation.ts                                     | Cooldown + routine delay gate, imperative movement overrides    | Wąski readiness/intent adapter w istniejącym miejscu wyboru; arbiter movement proposals                                     | Fixed 25 ms stepping, period/restart/flight/contact order i agency zachowane                    |
| tacticalPositioning.ts                                 | Structural/blended support/occupation/run/loose sequence        | Emit proposals z authority/job/cancellation; one owner of final movementTarget                                              | Available rest cover, legal onside projection, goalkeepers i defensive shape                    |
| combinationPlay.ts / receptionContinuation.ts          | Krótki shared run, ordinary next pass value                     | Max 2-action continuation value i progress-aware opportunity lifecycle                                                      | No guaranteed return; actual pass IDs/contact; two available nonparticipant cover               |
| teamThreatMemory.ts / tacticalPreferences.ts           | Geometry penalties i bounded learned channels                   | History residual/tactical purpose, nie następna kopia geometry risk                                                         | Bounded memory, actual evidence, source/preset identity                                         |
| Nowe research policy modules                           | Brak common contract                                            | decisionPolicy, decisionStateValue, decisionReadiness, movementAuthority, decisionPolicyConfig                              | Nie przepisywać piłki ani kariery pod nazwą v 3                                                 |

## 2. Proponowane interfejsy TypeScript

Każdy rzeczywiście zapisany lub przyjmowany z konfiguracji typ musi mieć Zod schema. Poniżej projekt API, nie produkcyjny kod PR176. `MatchAction`, `TacticalMatchState`, contact identity i existing resolver pozostają wspólnymi interfejsami.

```ts
type DecisionPolicyId = 'legacy-pr175' | 'risk-ablation-v1' | 'state-value-v1';
interface PolicyContext {
  readonly id: DecisionPolicyId;
  readonly version: number;
  readonly presetHash: string;
  readonly seedVersion: number;
}
interface PerceptionSnapshot {
  readonly at: number;
  readonly ballEpisode: number;
  readonly actorId: string;
  readonly sourceStateHash: string; // diagnostics only, never hash full state per tick
}
interface RunProposal {
  readonly receiverId: string;
  readonly origin: PitchPoint;
  readonly meetingPoint: PitchPoint;
  readonly reactionAt: number;
  readonly earliestArrival: number;
  readonly continuationTarget?: PitchPoint;
}
interface FeasibleDeliveryPlan {
  readonly target: PitchPoint;
  readonly velocity: Readonly<{ x: number; y: number; z: number }>;
  readonly releaseHeight: number;
  readonly predictedArrivalTime: number;
  readonly predictedArrivalSpeed: number;
  readonly expectedContactHeight: number;
  readonly receiverId: string;
  readonly risk: Readonly<RiskEvidence>;
  readonly planHash: string;
}
interface OutcomeEnvelope {
  readonly branches: readonly {
    readonly kind: 'controlled' | 'contested' | 'opponent' | 'restart';
    readonly probabilityProxy: number;
    readonly elapsed: number;
    readonly valueFeatures: Readonly<StateValueFeatures>;
  }[];
}
interface DecisionEvaluation {
  readonly action: MatchAction;
  readonly deliveryPlan?: FeasibleDeliveryPlan;
  readonly value: number;
  readonly reasonCodes: readonly string[];
  readonly expected: OutcomeEnvelope;
}
interface DecisionReadiness {
  readonly perceivedAt: number;
  readonly earliestContactAt: number;
  readonly committedUntil?: number;
  readonly dirtyReasons: readonly string[];
  readonly lastEvaluatedAt: number;
}
interface MovementProposal {
  readonly playerId: string;
  readonly authority:
    | 'human'
    | 'contact'
    | 'restart'
    | 'combination'
    | 'press'
    | 'support'
    | 'shape';
  readonly episodeKey: string;
  readonly target: PitchPoint;
  readonly validUntil: number;
  readonly coverIds: readonly string[];
}
interface DecisionPolicy {
  readonly context: PolicyContext;
  evaluate(state: Readonly<TacticalMatchState>, actorId: string): readonly DecisionEvaluation[];
}
```

Zod sprawdza finite values, [0,1] dla probability proxies, sumę branches≈1, positive ETA/energy, legal participants, declared units i enum wersji. `RiskEvidence` przechowuje lane/race/execution/reception raz; nie jest kolejną listą wag do odejmowania w każdym callerze. `StateValueFeatures`: shot access/quality, forward controlled line break, orientation, next outlet, opponent runway/rest cover. `sourceStateHash` i detailed traces wyłącznie opt-in — per tick cache keys używają canonical episode/planning revision.

## 3. Matematyczny kontrakt pierwszego wariantu

1. `Q(s,a)=Σp[k]*(r[k]+exp(−elapsed[k]/12)*V(s[k]))−V(s)−effortCost`.
2. `V` ma jednostki expected goal difference proxy, jawne components i nie czyta przyszłego wyniku. Początkowy horyzont następnej akcji max 2.5 s; jedna dalsza akcja max 3 options, nie recursive match rollout.
3. Failure value wynika z kontry rywala: own-goal distance, open runway, outnumbering i available cover. Same intent/territory nie gwarantują taniej straty.
4. Successful pass bierze receiver w faktycznie osiągalnym contact envelope, pressure/orientation/ball speed w chwili przyjęcia. Vnext nagradza możliwość shot/pass/carry po kontroli, nie nominalny CM slot.
5. Carry bierze prawdopodobny kontrollowany punkt i kontakt, shot bierze terminal/rebound/restart branches, hold bierze rozwój presji i możliwe zamknięcie/opłacalne otwarcie. To usuwa asymetrię „pass pays entire turnover, carry values requested endpoint”.
6. Dla każdego pass rozważyć≤3 wykonalne energie. Ground `v0=sqrt(vArrival²+2ad)`; aerial current integrator i **ten sam** speed ceiling jak release. `planHash` sprawdza identical nominal planning; seeded error jest osobnym wynikiem wykonania.
7. Początkowo deterministic argmax. Controlled variety D dopiero jako oddzielna zamrożona ablation; seed per stable candidate key, bez naruszania physical RNG stream.

Przykład do testu algebraicznego: safe(.94,.015,−.05)=.0111; central(.68,.10,−.025)=.0600; exposed-own-goal(.68,.03,−.18)=−.0372 przed wspólnym V(s). To **syntetyczne wartości projektowe**. Rzeczywiste dane frozen: CB safe support 21.613 raw vs CM support 6.406 raw, through winger−21.438 raw; ze względu na physical q nie oczekiwać, że new policy ma zawsze odwrócić tę konkretną kolejność. Wymagany test musi również zachować wygrywający safe pass wobec realnej pułapki.

## 4. Kolejność implementacji i bramki

| Etap | Co zbudować                                                                                                                 | Warunek przejścia                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Snapshot baseline `52748e2`, source/lockfile hashes, exact fixture inputs; ustalić primary metrics i budgets przed wynikami | Legacy wrapper odtwarza wszystkie 19 rankings i 4 whole-state continuations oraz pełne historyczne inputs                        |
| 1    | Read-only candidate/evidence/plan contracts i trace; legacy default                                                         | Zero source-behaviour delta dla baseline, nieprzesunięty RNG, no trace in normal save                                            |
| 2    | Wspólny feasible launch/release, w tym long lofted ceiling/height; independent run corridors                                | Nominal plan==release przed error; exact ground/aerial trajectory checks, stationary receiver/offside/cover                      |
| 3    | Common value B+C; równolegle A jako comparator                                                                              | Frozen cases zawierają both safe wins i aggressive wins; negative outcomes retained; brak forced goals/CM privilege              |
| 4    | Hybrid readiness i finite intention state; semantic invalidation passingAngle                                               | New opening during hold/carry can cause reconsideration po latency, ale execution czeka na actual contact; no duplicated release |
| 5    | Movement arbiter i max 2-action coordinated support                                                                         | Explicit human, reception, challenge, keeper, loose i restart conflicts rozstrzygnięte; available cover i valid offside          |
| 6    | Paired 8 s continuations, development cohorts i serial CPU                                                                  | Materialna zmiana korzystnej geometrii/wyborów i defence/performance gates; najwyżej 2 predeclared revisions                     |
| 7    | Freeze final source/policy/preset, dopiero new validation 6                                                                 | Jednokrotny holdout odczyt; brak tuningu po odczycie; wszystkie wyniki/failures retained                                         |
| 8    | Pełny verify, schema/save/replay/career/hybrid/browser smoke; raport dla PR178                                              | Green checks i jawne ograniczenia; separate independent PR178 assessment                                                         |

Etapy 2–5 włączać osobno dla diagnozy mechanizmów, potem w **jednym spójnym pakiecie B**. Nie wymagać z góry dowodu, że każdy parametr jest lepszy; wymagać zachowania baseline i możliwości falsyfikacji. Nie wolno uznać samej możliwości przejścia nowego interfejsu za materialną reformę.

## 5. Baseline i nowe fixtures

PR17516 original+8 previous-reserved+12 new=36 pełnych projektów jest teraz **historycznym** zbiorem regression/development. Wszelkie lustrzane pary liczą się jako jeden design block dla niepewności. Dawny validation PR175 jest już consumed i nie może być opisywany jako nowy holdout PR177.

PR176 utworzył [12 nowych predeclared fixtures](performance/PR176-pr177-new-fixtures.json) z pełnymi [initial states](performance/PR176-pr177-initial-states.json.gz), po 6 development/validation, seed prefix `pr177-unseen-20261018-v1:`. Rzeczywiste session/state hashes,22 players, formacje, style, skills i IDs są zamrożone. `preparePr177Fixtures.mjs` rejestruje nowe designs wyłącznie w swoim procesie i używa niezmienionego canonical factory PR175. Wykonane ticks=0, odczytane wyniki=0. To nowe seed-specific wejścia w tych samych celowo wybranych stress strata, nie losowa populacja ligi.

Strata: U17, senior balanced, strong/weak, central possession vs press, wide direct/pace imbalance, strong/weak keeper; formacje 4-3-3/4-4-2/4-2-3-1/3-5-2/3-4-2-1. Ten sam klub/roster może powtarzać się między badaniami; nowy seed nie czyni ich niezależnymi reprezentantami całego świata. Nie ma mirrors w nowych 12.

W PR177 najpierw hash-check wszystkich wejść. Stare receipts nie są before dla zmienionego source bez replay or verified identical input/source. Development 6 może służyć do wyboru≤2 variants. Final validation 6 uruchomić po zamrożeniu, serial/bez podglądania podczas tuningu. PR178 musi otrzymać **jeszcze inne**, zamknięte seeds dla potwierdzenia; te 6 po PR177 również będą consumed.

## 6. Wymagane benchmarki

`Teraz` oznacza PR176 read-only feasibility/ranking/source probes, `PR177` rzeczywiste paired policies. Każdy wiersz ma pełne initial state hash i stable candidate identity. Próbki boundary: ε=0.001 m/s, .01 m, .025 s; ciągłe ranges z adaptive refinement przy zmianie rankingu. Nie wygładzać laws/contact regimes dla wyglądu wykresu.

| ID / kategoria | Stan i eksperyment                                                                   | Pomiar / wymagany kontrakt                                                                             | Etap                                                 |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| M1 ranking     | CB→FB vs unmarked CM vs moderately pressured CM; actor/receiver abilities separately | all candidate terms, actual retention i 8 snext-action/counterattack; safe trap loses                  | Teraz frozen geometry; PR177 paired                  |
| M2 ranking     | Through vs support, fast winger/striker, stationary receiver                         | independent generation + feasibility + selected utility; .2 s advantage i .62 completion sweeps osobno | Teraz source/gates; PR177 boundary fixtures          |
| M3 ranking     | Carry into space vs backward pass; held first-touch plan                             | requested vs controlled endpoint, progress retained after 5/8 s, lost ball and opponent threat         | Teraz frozen; PR177 paired                           |
| M4 ranking     | Hold vs immediate pass in low/high pressure                                          | opportunity duration, actual readiness, selection, contact spacing                                     | Teraz windows; PR177 triggered lane                  |
| M5 ranking     | Shot vs recycling at 12/20/25/30 m, varying goal exposure/rebound support            | natural release, misses/blocks/saves/goals same shotID, no accuracy changes                            | Teraz frozen and PR175 controlled; PR177 new choice  |
| M6 ranking     | First-time pass vs control; first-time shot vs turn                                  | incoming contact state consistency, early/late forecasts, control premium                              | PR175 historical; PR177 new contact sweeps           |
| M7 ranking     | Long ground vs lofted diagonal, distances 5–60 m                                     | nominal plan/release speed,height,ETA and sampled-error branch; intercept/quality                      | Teraz 70 plans+28 releases; PR177 feasibility policy |
| T1 timing      | Lane appears during hold 1.6 s                                                       | freeze at appearance; unfinished physical action, remaining wait, expiry; compare 0.1 s traces         | Teraz 4 windows; PR177 purposeful event              |
| T2 timing      | Runner appears during carry 1.3 s                                                    | reconsider while movement continues, no second contact before ready, no phantom carry reset            | PR177                                                |
| T3 timing      | Reception readiness vs flight anticipation                                           | awareness overlap, facing/feet, ball speed; no sum of independent blackout clocks                      | Teraz source/frozen; PR177                           |
| T4 timing      | Temporary lane closes / runner reaches offside line                                  | choice before/after window; actual release-time offside, no stale cached legality                      | PR177                                                |
| T5 timing      | Free-kick legal prep and wall/retrieval                                              | law/tactical ready before release; watchdog and current known soft-lock regressions                    | Existing tests + PR177 regression                    |
| T6 timing      | Physical sprint initiation from rest/low burst                                       | acceleration/turn/contact, .65 s accounting not startup freeze                                         | Existing PR173+PR177 readiness                       |
| G1 generation  | Fast stationary winger at old target±1.6 m                                           | candidate reason codes; starting acceleration/reaction; .349/.350 m/s switch                           | Teraz measured; PR177 alternative                    |
| G2 generation  | Winger starts reacting after pass                                                    | incoming event triggers real run, not teleport target; after-contact continuation                      | PR177                                                |
| G3 generation  | Central pivot between two cover shadows                                              | useful angle now and at arrival, pressure/ability/after-reception choices                              | Teraz 19 plans; PR177 matched trajectories           |
| G4 generation  | Overlap/underlap at outsideSpace 4.99/5/5.01 m and width 19.99/20/20.01 m            | job continuity, available nonparticipant cover; no forced delivery                                     | Teraz source; PR177 boundaries                       |
| G5 generation  | Third-man purposeful lateral run                                                     | nominated actual role, motion/contact/IDs and next tactical value                                      | PR174 historical+PR177                               |
| G6 generation  | Long diagonal switch with stationary far runner                                      | avoid nearest-three starvation; successful claim vs opponents and out                                  | Teraz release; PR177 new runner chooser              |
| G7 generation  | Low block with no clear forward lane                                                 | plausible shot/carry/switch/hold tradeoffs, avoid guaranteed through and blind central traps           | PR177                                                |
| P1 positioning | Back four respond to wide attack                                                     | pressure/cover/handoff/depth and offside, no cosmetic stagger                                          | PR177                                                |
| P2 positioning | CB follows dropping striker                                                          | explicit marking responsibility vs line/rest cover; no global simultaneous chase                       | PR177                                                |
| P3 positioning | CM escapes cover shadow                                                              | actual path/orientation/clear line duration, not just target count                                     | PR177                                                |
| P4 positioning | Fullback overlap with healthy/injured/dismissed cover                                | two available nonparticipants required; orientation mirrors                                            | Existing PR174 regressions+PR177                     |
| P5 positioning | High line and attack-space request                                                   | legal release snapshot, reachable ball, no declaration of success from target beyond line              | PR177                                                |
| P6 positioning | Pressing, withdrawal, recovery; keeper intervention vs explicit movement             | one movement owner, finite commitment, no erased human order                                           | PR177                                                |
| F1 full match  | Same 36 historical and new 6 development                                             | paired whole match distributions, no censored match relabelled fulltime                                | PR177 regression/development                         |
| F2 full match  | New 6 validation after freeze                                                        | all outcomes once, denominator match/design; no tuning                                                 | PR177 holdout                                        |
| F3 full match  | Different formations, skill, attacking/defensive and strong/weak                     | prespecified strata, within-team role minutes and CM duty context                                      | 12 newinputs already generated                       |
| F4 integration | U17+senior careers, watched/headless, human pass/shot/carry, simulate remainder      | save/reload, exactly-once result, next fixture, truthful stats source                                  | Existing verify + PR177 browser                      |
| F5 performance | alternating warm serial baseline/A/B across 6 designs                                | 5×60 footballsec per mode, CPU and wall separately, tail/per-function/candidate count                  | PR177 after other work stops                         |

Najpierw≤3 development designs dla szybkiego falsyfikowania, potem wszystkie 36 historical +12 new na final candidate/baseline:96 pełnych przebiegów dla 2 policies. Dodatkowy A comparator może użyć development, nie musi mnożyć holdoutu. Resume tylko przy exact source/input/preset hashes; archiwizować failed/censored runs, source snapshots i actual completion state. 7200 s safety limit nie oznacza full_time i nie normalizuje się go do 90 min.

## 7. Metryki i acceptance

Primary: epizody controlled line-breaking progression i retained depth po 5/8 s; liczba i jakość credible shooting conditions; selected→actual release; final-third→danger conversion; CM receptions/minutes/share z actual duty context; reciprocal/backward zero-gain chains; natural turnovers/restarts i opponent counterattack access. Same pięć metrów do przodu bez utrzymania nie stanowi sukcesu.

Predeclare engineering gates przed wynikami, z jawną adnotacją że poniższe **proponowane relatywne progi są gates eksperymentu, nie futbolowe kwoty**:

- Hard correctness:0 nowego nielegalnego contact/restart/offside, duplicate pass/shot/goal/result, missing actor, save/replay divergence i human action takeover. Determinism na identycznej policy/input; zmiana policy może legalnie zmienić cały mecz.
- Materiality: final candidate zmienia≥15% decyzji na preregistereddevelopment states poza samotnymi noise ties **oraz** poprawia meaningful controlled-danger episode rate≥25% w paired development bez collapse defence. Progi nie wymagają 25%wzrostu od zera; przy rzadkich przypadkach podać absolute counts, trajectories i denominator. Nie przyjmować ich jako statistical significance.
- Football outcome: nowa walidacja ma wykazać ten sam kierunek poprawy access/shot creation w większości design strata; sam wynik bramek lub wysoka conversion nie wystarcza. Utrzymujący się rząd wielkości niedoboru shots albo bezcelowy pass volume oznacza insufficient solution, nawet gdy relative gain formalnie duży.
- Defence gate: report counterattack credible access i own-third dangerous losses per possession. Wzrost>20% mediany paireddevelopment lub jeden design>50% bez mierzalnego zysku danger wymaga zatrzymania/review; nie kompensować keeper nerfem. Zera i małe mianowniki wymagają absolute comparison, nie dzielenia przez 0.
- Performance: median serial CPU≤1.35×legacy, worst design≤1.6×; candidate count≤48 i≤3 delivery plans na target, max 3 prospective runners, expensive rank≤10 Hz. To proponowane budżety, do potwierdzenia actual profiler. Przekroczenie oznacza pruning/cache/design change, nigdy grubszy physics tick.
- Normal save detailed trace delta=0; bounded extra policy/intention fields z osobnym serialized-byte report. Badawcze receipts poza save.

Nie wymagać dokładnie 900 podań/20 strzałów/3 goli/10 rożnych. Rozkłady real-football z PR175 są kontekstem i ostrzeżeniem przed ekstremami; brak youth reference i odmienne definicje zachowane. Analizować per-match/team/possession/live exposure w zgodnych denominatorach. Ocena credible to proxy, nie prawdziwe xG. Video/replay ocenia aktualne trajektorie/opportunity identity, nie dekoracyjny ruch i same scorelines.

## 8. Determinism, saves i migracja

Legacy policy wybiera dotychczasową kolejność i noise; baseline musi odtworzyć existing hashes. Shadow evaluation nie wywołuje `interpretPassExecution`, `resolveCanonicalShot` ani wspólnego RNG. Nowa policy selection seed ma wersję i stable candidate key; porównanie divergence nie wymaga identycznych kolejnych stanów RNG po różnych fizycznych akcjach. Common seeds służą paired design, nie obietnicy identycznych trajektorii po rozgałęzieniu.

PR176 nie zmienia save schemas. PR177 przed merge musi ustalić explicit schema migration dla zapisywanych readiness/intention/policy fields; stare career saves bez aktywnego meczu pozostają czytelne, stare replay/match contexts dostają legacy-pr 175. Nie reinterpretować starego active state nową policy przy reload. Jeśli konfiguracja jest tylko research, zwykłe nowe mecze nadal baseline do świadomej promocji final candidate. Match-result/stats identity, canonical prefix w hybrid i lightweight tail contracts pozostają.

Testować schema-normalised full state przed/poJSON reload w trakcie control, receiving, carry, committed pass/shot/slide, restart, substitution, halftime i post-goal. Następny canonical tick musi być identyczny w tej samejpolicy. Captions/rendered animation/replay sampling nigdy nie sterują physical readiness.

## 9. Stop, rollback i PR178

Każda hard correctness regression zatrzymuje promocję. Nie obniżać starych testów, timeoutów, workerów, cover requirements lub fixture lengths, aby przepchnąć candidate. GdyB przekracza performance albo daje nadmierne straty, uruchomić A na tych samych frozen/development inputs i zachować oba wyniki. Gdy po maksymalnie 2 predeclared revisions nie ma materialnej poprawy, porzucić wybraną wersjęB zamiast stroić trzeci raz na validation. Przejść doA albo nowego ograniczonego C z nową hipotezą i nowym holdoutem.

Rollback: legacy-pr 175 pozostaje selectable dla nowych meczów, a istniejące replays/save używają zapisanej wersji. Usunąć nietrafiony experimental preset z promotion path, zachować źródła/receipts i support adapter. Nie cofać napraw laws/physics i nie przepisywać historii kariery. Każda ocena failure opisuje mechanizm, koszty i source/input hashes; nie usuwać przegranego eksperymentu z raportu.

PR178: wygenerować nowy niezależny seed/design set po prerejestracji miar, bez powtarzania już zużytych validation labels. Potwierdzić naturalne shots, saves, blocks, corners, turnover/restart/live-time, central participation i defensive balance. Dopiero jawna decyzja o dostatecznym realizmie umożliwia statystyczną kalibrację summary w PR180.
