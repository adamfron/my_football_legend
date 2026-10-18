# PR176 — Match Engine Reform Options

**Wybrać pakiet B jako pierwszy eksperyment PR177.** Wdrożyć wspólny risk/value, prospective run candidates i hybrid readiness w istniejącym silniku; zachować literalny baseline do porównań. Pakiet A jest prostszym fallbackiem i ablation comparator. Pakiet C ma sens dopiero, jeśli utrzymywanie arbitrażu w dotychczasowych modułach uniemożliwi rzetelne porównanie albo B nie poprawi kreacji.

To projekt przyszłych zmian. Żaden wzór w tym dokumencie nie steruje produkcją PR176. [Audit](PR176_MATCH_ENGINE_MATHEMATICAL_AUDIT.md) rozdziela potwierdzone mechanizmy od nieustalonego wpływu na cały mecz; [rejestr](performance/PR176-issue-solution-registry.json) wiąże rekomendacje ze źródłami i badaniami.

## 1. Cztery modele utility

### Model A — porównywalna heurystyka bez powielonych kanałów

Moduły: `matchActions.ts`, `passDecision.ts`, `shootingOptions.ts`. Zachować obecne rewards progression/style/continuity; zostawić forecast retention jako główny kanał geometrycznego ryzyka. W eksperymencie wyłączyć direct lane/receiver-pressure penalty, a historyczny człon zastąpić wyłącznie residual history. Nie usuwać offside, bounds, foot/contact feasibility ani rzeczywistych błędów wykonania.

```text
UA(a)=Ubaseline(a)−correlatedDirectRiskTerms(a)+residualHistory(a)
residualHistory=−wH*boundedEvidence*max(0,observedFailureRate−forecastFailureRate)
```

Residual wymaga uczciwych liczników successes/failures i confidence shrinkage. Jeżeli obecna pamięć nie przechowuje właściwych mianowników, w pierwszym A użyć historycznej preferencji kanału z małym capem, a nie nazywać jej residual probability. Porównać trzy ablations: direct geometry only OFF, adaptive geometry OFF, oba OFF. Nazwa „duplicate” nie jest wystarczającym powodem do usunięcia wszystkich trzech naraz bez porównania.

Zysk: najszybsze sprawdzenie, czy obecny stacking tłumi środek i forward passes. Ryzyko: stary carry/cross/shot nadal mają inne jednostki i forward metri/field-value może być nadmiernie nagradzane. Nie daje pełnej oceny następnego kontaktu. Model nie jest automatycznie skalibrowanym EV.

### Model B — expected subsequent-state value

Moduły: nowy `decisionStateValue.ts` oraz adaptery w `matchActions.ts`, `passDecision.ts`, `carryOpportunity.ts`, `shootingOpportunity.ts`, `combinationPlay.ts`.

```text
QB(s,a)=Σk pk(s,a)*[rk(s,a)+γ(tk)*V(sk)]−V(s)−λE*effort(a)
γ(t)=exp(−t/τ), początkowy eksperyment τ=12s, sensitivity 8/20s
V(s)=P(next meaningful shot)*E(goal difference | next shot/context)
```

`k` to rozłączne gałęzie: successful controlled reception/continuation, unstable ball with own/opponent recovery, intercepted/out/lawful restart. W pierwszej wersji trzy gałęzie controlled/contested/opponent wystarczą, jeśli ich wagi sumują się do 1 i outcome value ma jawne założenia. Obecne R może być startowym **uncalibrated proxy**, ale nie udawać niezależności lane, race i reception. Nie odejmować następnie kolejnego ogólnego `-pressure`, jeżeli ten sam koszt jest już w p i Vfailure.

Nie trzeba sieci neuronowej ani backendu. Początkowe bounded `V` jest jawnym modelem inżynierskim: aktualne shot opportunity, osiągalne następne outlet/shot, pressure at actual meeting, orientation/readiness, opponents between ball and goal, rest cover i wartość rywala po stracie. Najwyżej jedna dalsza akcja, top 3 alternatives i częściowe cache. Zaczynać od deterministycznej analitycznej projekcji, nie od canonical rollout 22 players na każdą opcję. Odróżnić parametry rankingu od obietnicy empirycznego xG.

Wartość strzału jest gałęzią tego samego Q: `Pgoal*1 + Psave/block/miss*V(rebound/restart) − V(s)`. Pgoal forecast i rzeczywista shot physics muszą pozostać osobne; nie pobierać przyszłego seeded shot result. Hold ma koszt utraty otwarcia/press exposure w przyszłym stanie, a nie arbitralną premię za posiadanie. Carry ocenia free/control endpoint i recovery margin, nie sam requested waypoint. Nie premiować CM przez slot.

Przykład **hipotetyczny, w jednostkach goal difference**, nie dopasowane dane MFL:

| Akcja                              | Pcontrolled | Vsuccess | Vfailure | EV przed wspólnym V(s) |
| ---------------------------------- | ----------: | -------: | -------: | ---------------------: |
| Bezpieczne podanie do obrońcy      |         .94 |     .015 |    -.050 |                  .0111 |
| Podanie między linie               |         .68 |     .100 |    -.025 |                  .0600 |
| To samo ryzyko przed własną bramką |         .68 |     .030 |    -.180 |                 -.0372 |

Pokazuje to dlaczego niższa completion może być racjonalna. Nie dowodzi, że konkretne ryzykowne podanie jest lepsze. Forecast musi obejmować faktyczne położenie i timing, a nie sam kolor strefy.

Kierunek wspólnej wyceny kolejnych stanów jest zgodny z [VAEP, Decroos i in.](https://arxiv.org/abs/1802.07127) i rozdzieleniem pass/drive/shot w [EPV, Fernández, Bornn, Cervone](https://arxiv.org/abs/2011.09426). Nasza mała deterministyczna heurystyka nie dziedziczy empirycznej kalibracji modeli z tych prac. Ich trained models nie są zależnością gry.

### Model C — phase- i territory-sensitive risk/reward

Moduły: `decisionStateValue.ts`, `tacticalPreferences.ts`, `teamThreatMemory.ts`.

```text
QC=Pcontrol*Vattack(success)−(1−Pcontrol)*Cturnover(s,a)+Vrestart−Ceffort
Cturnover=c0+cOwn*ownGoalExposure+cSpace*opponentRunway
          +cNumbers*numericalDeficit−cCover*availableRestCover
```

Wszystkie features [0,1]; koszt przeciwnika rośnie przy niebronionym środku i otwartej kontrze. Territory może być smooth prior (`sigmoid((ownDangerDepth−depth)/scale)`), lecz nie wystarcza: strata w ataku z dwoma exposed CB też może być droga. Phase, score i time korygują V/utility, nie fizyczną możliwość akcji. Nie karać straty w atakującej tercji tak samo jak przed własną bramką przy identycznym zagrożeniu obronnym; jednocześnie nie ustawiać kosztu atakującej straty na 0.

Ten model jest agresywniejszą, łatwiejszą do uruchomienia wersją B bez pełnego next-action valuation. Powinien być **trzecim rankingowym comparatorem** obok B i A, nie kolejną ukrytą poprawką obecnej funkcji. Początkowe współczynniki są jawnymi kandydatami badawczymi; przeanalizować zakres, nie uzależniać pierwszego eksperymentu od wcześniejszego dowodu każdego parametru.

### Model D — kontrolowana różnorodność wiarygodnych decyzji

Moduły: `decisionSelection.ts`/adapter `rankAvailableActionsForAI`, `tacticalPreferences.ts`. Po feasibility i wspólnej ocenie odrzucić akcje rażąco zdominowane. Z pozostałych max 3 z `Q≥Qbest−ε` wybierać reproducibly:

```text
P(a|s)=exp((Q(a)−Qbest)/temperature)/Σeligible exp((Q−Qbest)/temperature)
```

ε i temperature mają jednostki **tego samego** Q; nie przenosić obecnego noise±4 bezpośrednio do goal-value. Dedykowany seed `${matchSeed}:policy:${policyVersion}:${decisionEpisode}:${actorId}:${candidateKey}`; kolejność generacji nie może przestawiać noise pozostałych kandydatów. Odrębny policy stream, żadnego wykorzystania RNG fizyki do shadow comparison. Zapis/replay musi identyfikować policy. Zero temperature daje deterministic argmax.

Różnicować risk preference trenera/roli/match context oraz competence percepcji/wykonania. Skill nie powinien automatycznie oznaczać większej awersji do straty. D nie naprawi brakujących kandydatów ani błędnego Q; włączyć dopiero po porównaniu deterministic B/C. Alternatywa bez losowania: stabilna preferencja gracza nad równorzędnymi opcjami, z bounded tie-break.

### Ranking scoring reforms

1. **B+C**: wspólna wartość następnego stanu z kosztem kontry zależnym od geometrii. Największa szansa materialnej zmiany; ryzyko złego proxy i CPU.
2. **A**: geometry-risk ablation i naprawa gate/forecast. Szybki, interpretowalny fallback; może pozostawić carry/shot scale mismatch.
3. **Agresywny C+line-break experiment**: eksperymentalne `+wBreak*expectedControlledLineBreak` i niższa cena straty w dobrze asekurowanym ataku; porównać przeciw B. Definicja break=kontrolowany contact za rzeczywistą linią obrony, z dalszą akcją i defensywnym cover, nie sam wzrostX ani slot CM. Możliwy trap/route exploitation; zachować negative results.
4. **D** jako późniejsza warstwa, gdy pierwsze trzy dają wiarygodne alternatives. Większa różnorodność sama nie oznacza lepszego futbolu.

## 2. Dwa odrębne modele prędkości podania

### Envelope — fizycznie wykonalne opcje

`passLaunchPlan.ts`, `receiverReadiness.ts`, `passReception.ts`, release w `matchActions.ts`:

```text
F={v,delivery | v≤vMax, ball reaches meeting envelope,
               receiver can arrive/contact at height/speed,
               execution difficulty finite, legal destination}
vChosen=argmax(v∈F) [Pcontrol(v)*Vsuccess(v)−(1−Pcontrol(v))*Closs(v)]
```

Zacząć od 3 reprezentantów: gentle reception, firm escape, runner continuation. Ground candidate z arrival speed `vr` ma `v0=sqrt(vr²+2ad)`, a ETA `(v0−vr)/a`, jeżeli ograniczenie energii spełnione. Nie ustawiać desired deadline, który wymaga niewykonalnej energii. Aerial plan musi przejść **ten sam limit, wysokość i integrator co release**; jeśli cel przy takiej energii nieosiągalny, jawny infeasible plan. Nie planować 33.8 i wykonać 30.

Koszt O(C*K*D) lokalnych ocen, K≤3, D liczba relevant defenders; użyć closed-form ground i conservative pruning, current canonical integrator do finalistów. Istniejący baseline ma już wielokrotne launch forecasts; cache per `(snapshot,actor,receiver,target,delivery,speed)` zmniejsza powtórzenia. Migracja: immutable `FeasibleDeliveryPlan` przechodzi generation→valuation→release; error sampler nakłada legalny błąd energii/kierunku i nie reinterpretowuje nominalnego planu.

### Arrival optimisation — czas jako zmienna taktyczna

```text
T*=argmaxT [Pcontrol(T)*Vnext(T)−Pintercept(T)*Vopponent(T)−Cdelay(T)]
subject to v0(T)=d/T+aT/2≤vMax, receiver readiness/contact, offside at release
```

Uwzględnić defender arrival **wzdłuż** lotu, receiver acceleration/awareness i continuation po kontakcie; nie tylko endpoint ETA. Najpierw 4–6 przedziałów T wokół finite receiver arrival i momentów interwencji; refinement jednego najlepszego przedziału, bez continuous global solver 40 Hz. Aerial wymaga oddzielnej family envelope, nie podstawienia wzoru ground.

Koszt wyższy, O(C*K*D\*pathSamples); latched candidate plan i budżet pruning obowiązkowe. Zysk: słabszy rywal/ruch receivera może uzasadnić wolniejszy kontakt, presja szybszy, niezależnie od słowa „direct”. Ryzyko: zbyt optymistyczny model przyszłych zmian obrony i drogie przeszukiwanie. **Rekomendacja pierwsza: envelope + mały arrival search**, nie pełny optimiser na każdą opcję.

## 3. Trzy modele timing

| Model                       | Reguła                                                                                                                                           | Zysk / koszt / ograniczenie                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: krótsze context waits    | Zastąpić 1.6/1.3 funkcją pressure, skill, ball/control; zachować globalną strukturę                                                              | Najmniejsza migracja i prosty comparator; nadal może przegapić krótką nową okazję, a krótszy fixed timer dać zbyt szybki recykling.                     |
| B: event-driven readiness   | Meaningful event unieważnia zamiar; action execute dopiero po rzeczywistym contact/turn/awareness                                                | Najmniej zbędnego czekania; potrzeba jawnego commitment, debounce i owner/episode lifecycle, inaczej churn.                                             |
| **C: hybrid — preferowany** | Perception latency .12–.30 s jako początkowy eksperymentalny zakres, physical commitment osobno, latched events i max 10 Hz pełnego reevaluation | Łączy reakcję i finity. Zakres latency to propozycja, nie pomiar człowieka. Nie usuwać cooldownu zastępującego kontakt bez nowego właściciela kontaktu. |

Events: nowy realny passing corridor, runner przed offside, opponent contact/press geometry, materialna zmiana shot value, ball control deterioration, possession/restart/substitution. Minor centimetres nie są eventem. Evaluate score eventów tanio 40 Hz; expensive candidate ranking maksymalnie 10 Hz, wcześniej cached urgency interrupt po minimum latency. Jeden uncommitted intent można zastąpić; po punkcie realnego strike/slide commitment kończyć fizycznie albo legalnie anulować przed kontaktem. Żadnych teleportacji lub resetowania pędu.

Human agency pozostaje właścicielem świadomego zamiaru. NPC reevaluation nie klika za użytkownika i nie otwiera powtarzających się rutynowych menu. Restarts wymagają actual legal/tactical readiness; watchdog nie autoryzuje nielegalnego release. Pamięć 180 s i response 2 s nie są blackoutem i nie wymagają przyspieszania z powodu reformy timing.

## 4. Candidate generation i movement coordination

**Korytarze:** dla maksymalnie 3 runnerów ocenić bieżący bieg, start od postoju i jedną reakcję na nadchodzącą piłkę. Zmienić `passReception`/`spacePassing`, nie usunąć wszystkich gates. Jawne `RunProposal {origin, corridor, reactionAt, arrivalEnvelope, continuation}` nie wymaga oddalonego starego target. Physically unavailable player, offside at release, boundary i contact height nadal twarde. Risk gates przenieść do value, gdy nie są prawami/wykonalnością; powody odrzucenia rejestrować.

**Ruch:** `tacticalPositioning`, `matchSimulation`, `combinationPlay`, `receptionContinuation`. Arbiter oddziela authority od preferencji: lawful restart/period → human explicit command → committed physical action → actual ball contact/reception/keeper → coordinated run/cover → press/mark/screen → structural support. To ranking bazowy, nie pozwolenie, by human command ominął fizykę: human może zrezygnować z planned reception, ale nie anuluje wykonanego kontaktu. Sprzeczne jednoczesne physical owners powinny być błędem walidacji, nie cichą kolejnością kodu.

Rozwiązywać konkretnie: CM support vs box occupation przez wspólny job budget; combination vs loose pursuit przez ten sam live ball episode; challenge vs reception przez actual possession/flight; owner micro vs new carry przez replacement zamiaru, nie przyciąganie do dawnego origin; fullback overlap vs rest-cover przez available nonparticipants. Defenders zmieniają głębokość przez przypisanie runnera/pressure cover i handoff, zachowując koordynację spalonego. Nie poprawiać wyglądu linii losowym staggerem.

Short planning: dwóch partnerów i maksymalnie 2 actions. `Vsuccess` uwzględnia czy receiver będzie mógł odwrócić się, zagrać trzeci kontakt albo strzelić przed zamknięciem. Odwołanie planu po nowej realnej przeszkodzie jest prawidłowe; expiry powinno wynikać z ETA/opportunity, nie odnawiać się bez końca przez sam replanning.

## 5. Trzy pakiety implementacyjne

| Wymiar                     | A — Conservative but decisive                                                                      | B — Risk/value/timing reform                                                                                              | C — Modular MatchEngine v 3 policy                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Problem                    | Risk stacking, niezgodny launch, bramki i stałe oczekiwanie                                        | Te same plus wspólne consequence/value, przerwanie zamiaru, ruch i kreacja                                                | Granice między percepcją, generation, feasibility, value, selection, intent, execution, feedback                                        |
| Moduły                     | matchActions/passDecision/passLaunchPlan/passReception/spacePassing/onBallPreparation              | A + decisionStateValue/decisionReadiness/movementAuthority/tacticalPositioning/combinationPlay                            | Nowy policy adapter i moduły perception/candidates/feasibility/tacticalValue/selector/intention; istniejący loop tylko wywołuje granice |
| Matematyka                 | A utility ablation; consistent feasible launch; independent prospective corridor; contextual waits | B+C Q-value, common turnover consequences, envelope planner, hybrid readiness                                             | Wymienne typed strategies A/B/C za tym samym snapshot/plan contract                                                                     |
| Interfaces                 | `RiskEvidence`, `FeasibleDeliveryPlan`, `DecisionTrace`                                            | A + `OutcomeEnvelope`, `StateValue`, `Readiness`, `MovementProposal`                                                      | `DecisionPolicy`, `PerceptionSnapshot`, `IntentionLifecycle`, `FeedbackEvidence`                                                        |
| Zysk                       | Szybkie, widoczne sprawdzenie mocnej hipotezy                                                      | Materialnie inny sposób wyboru futbolu i tworzenia możliwości                                                             | Najczytelniejsze granice i porównania całych policies                                                                                   |
| Limity                     | Stare rodziny nadal niespójne i krótkowzroczne                                                     | V jest proxy, nie empiryczne EPV; bounded forecast myli się                                                               | Największa powierzchnia migracji; sama modularność nie daje lepszych decyzji                                                            |
| Ryzyko                     | Wzrost strat i nowy bezcelowy forward spam                                                         | Błędne next-state features, CPU, machine-gun passing, exposed defence                                                     | Rozjechanie human/legacy state/replay; koszt architektury bez efektu                                                                    |
| Nakład orientacyjny        | 3–5 dni inżynierskich + benchmarky                                                                 | 7–12 dni + benchmarky i interpretacja                                                                                     | 15–25 dni + dłuższy migration audit                                                                                                     |
| Runtime budget proponowany | Median serial CPU ≤1.15×baseline, worst design≤1.3×                                                | ≤1.35×, worst≤1.6×; budget exit zamiast cichego throttlingu fizyki                                                        | ≤1.5×; wymagany profiler każdej granicy                                                                                                 |
| Migracja                   | Literal baseline default; flags research; release plan equality contract                           | Policy version/hash w match context i replay; zapisać readiness/intention albo deterministic reconstruct contract         | Adapter starych stanów, schema migration i wersjonowany całkowity policy context                                                        |
| Tests                      | Source-preserving baseline, flight/release parity, gates, timer interrupts, offside/cover          | A + common outcome sums/value tests, human boundaries, interrupted intent persistence, controlled creation/counterattacks | Wszystkie plus interfejsy etapów, ownership i save/replay cross-version                                                                 |
| Sukces                     | Lepsze selected routes/retained control i konkretna zmiana full-match behaviour                    | Więcej meaningful access i normalnych shots/second balls bez kosztu defence/CPU                                           | Jak B oraz utrzymanie porównywalnych policies i determinism                                                                             |
| Wycofanie                  | Wyłączyć policy; preserve baseline receipts                                                        | Nie promować eksperymentu, przestawić nowe mecze na A; istniejące replay z wersją                                         | Zachować stary adapter, porzucić v 3 wrapper jeśli nie daje korzyści                                                                    |

Nakłady i budżety są szacunkami projektowymi, nie zmierzoną wydajnością nowego kodu. Zwykły verify nie może uruchamiać kosztownej kohorty.

**Kolejność wyboru:** B daje szansę przerwać cykl drobnych zmian bez efektu; A pozostawia zbyt wiele nieporównywalnych utilities, ale nadaje się do diagnozy i szybkiego fallbacku; C jest wartościowym wyższym ryzykiem, gdy problemem staje się możliwość zarządzania samą polityką. Żaden pakiet nie uzasadnia przepisania piłki, goalkeeperów czy kariery.

## 6. Registry parametrów

Nie wdrażać `globalMatchWeights.ts` w PR176. W PR177 użyć wąskiego `matchDecisionPolicy.ts`/`decisionPolicyConfig.ts`, jeśli służy odtwarzaniu B/A; szersze tunery zostawić po wyborze architektury.

```ts
type PolicyId = 'legacy-pr175' | 'risk-ablation-v1' | 'state-value-v1';
interface DecisionPolicyConfig {
  readonly id: PolicyId;
  readonly version: number;
  readonly value: Readonly<{ continuationHorizon: number; turnoverScale: number }>;
  readonly perception: Readonly<{ minimumLatency: number; maximumRankHz: number }>;
  readonly selection: Readonly<{ temperature: number; plausibleGap: number }>;
  readonly hash: string;
}
```

Towarzyszące Zod schema: finite numeric, jawne units/ranges, cross-field validation; immutable runtime snapshot i canonical serialisation/hash. Legacy preset wiernie zachowuje dotychczasowe liczby. Experimental presets nazwane i wersjonowane; brak tuning UI w normalnej grze i brak mutacji w połowie meczu.

Oddzielne moduły: physics/mechanics (gravity, drag, rolling, foot reach), tactical preferences (patience/verticality/block), heuristic/value weights, perception/reaction/readiness, law/restart time, research/benchmark controls. Physical constants nie trafiają do decision weights. Save/replay zapisuje policy version/preset hash i seed derivation version; stare saved matches używają legacy. Nowy save bez rozpoznanej policy nie może po cichu przejść na inny scoring.

## 7. Zachować i falsyfikować

Zachować canonical ball/contacts/CCD, goalie/rebound corrections, offside i endsSwitched, restart legal geometry/identity, first-touch momentum, actual fitness, dostępne rest cover, human terminal ownership, career/save/stats/exactly-once i hybrid canonical→summary. Zmieniać przewidywanie/wybór/intent granice, gdy badania wskazują realny konflikt; nie przepisywać działających mechanik dlatego, że nazwa nowego pakietu zawiera v 3.

Hipotezy można rozdzielić eksperymentami: score-only na identycznych kandydatach; candidate-only z legacy scoring; geometry-only przeciw value-only przeciw combined; matched launch/release bez execution error i z identycznymi quantiles; timer-only na rzeczywistych okazjach z physical commitment; memory channels ablations; formation/depth/cover strata. PR177 powinien zachować również nieudane próby, a PR178 ocenić niezależne pełne mecze. [Dokładny plan](PR176_MATCH_ENGINE_PR177_BLUEPRINT.md).
