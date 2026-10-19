# PR177 — State-value decisions, dynamic attacks and transitions

PR177 implements a separate consequence-based autonomous policy inside the canonical physical engine. It also retains the original ranking and a risk-ablation comparator. Implementation alone does not establish plausible football. The final comparison and promotion decision are recorded below after development, sealed validation and verification.

## Work stages and acceptance

| Gate | Work and evidence |
| --- | --- |
| 0 | Freeze merged PR176, source/lock hashes, published backup branch, clean detached baseline, reproduce 19 rankings and four complete continuations; preregister outcome and correctness measures. |
| 1 | Runtime policy contract: `legacy-pr176`, `risk-ablation-v1`, `state-value-v1`. Preserve normal action resolution, human ownership and completed-career persistence. |
| 2 | Bounded physical pass envelopes and prospective receiving corridors, including stationary runners. Keep existing space-pass semantics. |
| 3 | Common next-state value and controlled/contested/opponent/restart/goal branches. Compare A risk-channel ablations. |
| 4 | Perception and reconsideration separately from physical preparation, feet and contact interval. |
| 5 | One final movement owner, PR174 combination continuation, current ball episode and human/restart priority. |
| 6 | Post-recovery exposure, prospective runs, direct routes and physical defensive recovery. |
| 7 | Frozen decisions, 2/5/8-second continuations, controlled geometries, all six development designs and documented rejected revisions. |
| 8 | Freeze the candidate before opening six validation fixtures. Run each once, preserve failures and make an explicit promotion decision. |
| 9 | Unmodified `npm run verify`, youth/professional careers, human actions, Simulate Remainder, exactly-once results, browser smoke and serial CPU measurements. |

No shot, goal, pass, turnover or counterattack quota is used. More legitimate counterattacks and turnovers are not automatic defensive failures. The historical blueprint's active-match migration and +20% counterattack ceiling are superseded by the task instructions.

## Frozen source, backup and rollback

The exact merged PR176 commit is **`df8e532ecf29d6c0a7e92ec241795a6a37250e1c`**. The initial tracked tree was clean. [Baseline manifest](performance/PR177-baseline.json) records every source and dependency-lockfile hash before gameplay edits, plus the evaluation preregistration. The original normalized match-engine hash is `9f6123b5e9861d07b945253c0f1a98934326fb66da8246ca85fd96735c761d21`.

Git confirmed publication of `origin/match-engine-legacy-pr176`. A detached worktree contains untouched canonical PR176 source. The replay of PR176's original plain audit exactly reproduces all 19 ranking hashes and four complete 3-second final-state hashes in `PR176-research-integrity.json`; there is no assertion that the altered in-tree legacy engine has the same whole-match states.

To restore an untouched comparator without rewriting the project:

```sh
git fetch origin match-engine-legacy-pr176
git worktree add --detach ../baseline-pr176 df8e532ecf29d6c0a7e92ec241795a6a37250e1c
cd ../baseline-pr176
npm ci
```

For a new-match policy rollback, change the single `DEFAULT_DECISION_POLICY` export in `src/core/matchSimulation/decisionPolicyConfig.ts`. Existing runtime matches retain their selected ID. No completed career history is rewritten, and unrelated goalkeeper, restart-law and physical fixes remain. Pristine PR176 and in-tree legacy must be identified separately in every comparison: the common lofted-pass energy correction deliberately changes some forecasts.

## Policy and value architecture

`decisionPolicyConfig.ts` supplies Zod-validated immutable engineering parameters, candidate/delivery/runner limits, perception latency, discount and transition horizon. `matchState.ts` validates optional runtime policy/readiness fields and the selected nominal pass plan. There is no career schema bump, legacy replay conversion or live-match migration.

Legacy keeps the original candidate generation, utility and seed sequence. A keeps those units while removing the selected direct geometry or adaptive risk channels. Its `direct-risk` and `adaptive-risk` ablations separately retain the other channel. This is a heuristic comparator, not calibrated expected value. A also retains the old game-reading-dependent utility penalty; the investigation and replacement concern B.

B uses `enumerateStateValueActions` and `evaluateStateValueAction`, replacing the old scorer rather than adding a forward-pass bonus to it. It evaluates:

```text
Q(s,a) = sum_k p_k * (reward_k + exp(-elapsed_k / 12) * V(next_k)) - V(s) - effort(a)
```

The mutually exclusive branches are controlled success, contested ball, opponent control, legal restart and terminal goal. Probabilities sum to one. They and the state values are explicitly **uncalibrated engineering proxies**, not real-world xG or empirically fitted EPV. They never read a future seeded kick or shot outcome.

Controlled state value uses territory, useful shooting geometry, current space, available outlets and temporary transition exposure. It does not award a CM slot bonus. A carry earns only its reachable controlled corridor within the short horizon, including acceleration and actual reserves; it does not earn the full requested endpoint while a pass pays every failure penalty. Loss value uses the opponent's next controlled state, own available cover, nearby opponent runners and recovery time, with late score context. A failed ambitious pass near the opponent's goal can therefore cost less than a similar loss in front of one's own goal, but advanced territory does not erase exposed rest defence.

The pass evidence consumes the shared trajectory, endpoint race, execution envelope and reception estimate once. B does not subsequently subtract the legacy lane, receiver-pressure, through-context, solution-memory and adaptive geometry utility penalties. Space can still affect the usefulness of the resulting state; that is distinct from charging the same interception event again. Shot value has a goal-reward branch plus contested/restart/opponent outcomes. All generated shot techniques currently share the opportunity evaluator's goal proxy; technique-specific empirical calibration remains a limitation.

Execution ability still belongs to the physical skill/error model. Game reading affects perception and the spread of deterministic decision noise, not a general aversion multiplier. Noise is keyed by policy, episode, actor and candidate identity. Candidate insertion does not reshuffle the noise of unrelated B actions. Tactical preferences, fatigue, late score objectives and physical capability remain separate inputs; the current tactical value model is deliberately small.

## Delivery, receiving and independent runs

Ordinary lofted planning now applies the same 30 m/s ceiling as ordinary release. The aerial integrator measures the resulting flight and target miss; B rejects an infeasible nominal loft instead of evaluating a faster imaginary kick. Goalkeeper distributions, throws and crosses retain their own physical delivery profiles. Execution error still changes the actual kick.

B considers up to three delivery alternatives per target: a controllable arrival speed, a firmer arrival speed and, where relevant and feasible, a loft. Ground energy derives from arrival speed and canonical rolling deceleration; direct/through labels no longer impose a universal 1.45-second arrival. The selected `deliveryPlan` passes through valuation, interception/reception forecast and execution without nominal replanning. Target error and range-energy error are applied by the existing execution sampler. Actual arrival and reception remain uncertain.

`prospectiveSpaceTargets` extends the existing ball-into-space concept. It nominates at most three onside receivers and bounded straight/diagonal corridors. It does not require an accepted legacy lead projection, an already moving target or a sprint that has begun. Acceleration/turning arrival and finite awareness must fit the delivery. The actual receiver pursues the meeting point through normal locomotion; its position and velocity are never assigned to the forecast endpoint. `space_pass` remains available, and planned spatial passes retain its diagnostic source semantics.

## Readiness, contact and movement

Hybrid readiness recognises changed pressure, ball episode and local corridor geometry, with perception latency and a maximum full-ranking cadence of 10 Hz for routine possession. Quiet intentions also receive bounded reconsideration. Hold/carry cooldowns do not block that reconsideration. Action-specific preparation remains in force, and a controlled release requires the ordinary finite foot envelope, legal ball height and an interval from the last executed control contact. A decision can change while movement continues; that does not create a second instantaneous contact.

First-time candidates retain the normal incoming-contact legality checks. B compares them with fresh control in common value units instead of adding the legacy 18–36-point control premium to goal-value units. No human command is manufactured by B, and human commands retain the existing contact requirements.

`movementAuthority.ts` selects one physical destination immediately before locomotion. The current restart lifecycle, explicit human intent, committed action, keeper/reception, coordination and structural plans have explicit priorities and validity/episode checks. Target replacement preserves position, velocity and canonical acceleration. PR174's available nonparticipant cover guards remain. Combination continuation values one additional feasible return/third-man opportunity, never a forced return.

The restart lifecycle owns retrieval as well as legal setup. A development run exposed an error in the first arbiter: replacing a retriever's current route with its static setup spot stranded an out-of-play ball. The corrected priority passes through the lifecycle's current target, including a legitimate retrieval destination outside the pitch. A dedicated regression covers this case; rejected and censored runs are retained.

### Promotion blocker discovered in real play

The strong/weak development design exposed an inherited overlapping-body rebound loop. A five-second replay of the identical real state in **pristine PR176 and B** produces **200 new contact identities with only 9.2e-11 metres horizontal ball displacement**. The canonical ball remains loose rather than returning to normal play. This is a mechanical failure, not productive football risk, and disqualifies B from ordinary-default promotion. [Reproduction and all frames](performance/PR177-loose-contact-loop.json) and the compressed complete initial state are retained. PR177 does not conceal the resulting low pass volume as tactical improvement or remove the physical event history to improve its statistics.

Profiling this state also found repeated rebuilding of identity membership sets in `playerMatchStats`. `identityHistory.ts` reuses an external append index while checking each candidate position against the authoritative immutable array. Differently positioned IDs in sibling branches cannot contaminate older snapshots. Serialized histories, ordering, statistics, contacts and football decisions remain identical. Existing scan-count assertions remain unchanged. Two branch/hydration regressions and a **48,000-tick before/after replay** verify equality of six complete checkpoints. Measured process CPU for that isolated window fell from **334,156 to 66,781 ms**; these are profiling runs, not the separate serial policy-budget estimate. The physical overlap loop itself remains unresolved and is an explicit PR178 prerequisite.

## Attacking transitions

Actual possession changes create an eight-second opportunity window only when the opponent is exposed. The model records opponents advanced beyond the recovery, covering bodies, runway, recovery direction/speed and time. It increases prospective controlled-state value while that advantage remains. At most two coordinated forward runs are nominated with available rest cover. Existing physical sprint recovery, pressing, marking, tackles and interception remain active.

The policy may choose a forward pass, a long ball into space, a carry, a combination or patience. A lower completion chance can win on subsequent value; risk itself is not rewarded. A weaker side can exploit its fast runner against an advanced stronger side without imposed possession or shot parity. Clearances and defensive headers keep their existing physical execution; uncontrolled clearances are not relabelled accurate planned passes.

The offline transition observer distinguishes exposed recoveries from all turnovers. It retains the first forward action and time, maximum actually controlled depth, opponent cover recovery, ensuing shot IDs, stoppages and subsequent losses. These are operational opportunity/action measurements, not a claim that every forward pass is a counterattack. Controlled corner/free-kick/blocked-shot geometries begin at a prescribed recovery; complete real set-piece ancestry requires the natural event records and independent replay review.

## Development history and final evidence

The initial 180-second smoke failed through excessive passive holding: effort had the wrong magnitude for goal-value units. Development revision 1 reduced the explicit effort coefficient from .001 to .00005 without changing execution accuracy or physics. It produced progression and losses in a 300-second smoke, then exposed the retrieval-authority defect in full matches. Two completed 7200-second censored runs and the interrupted third run are retained, and are **not** counted as full matches.

Development revision 2 fixes restart retrieval priority. It also uses the appropriate first-time comparison units and preserves the same effort revision. No tuning is permitted after the sealed validation candidate is frozen. Detailed source snapshots, exact hashes, all accepted/rejected outcomes and serial performance measurements accompany the final receipts.

<!-- PR177_RESULTS_START -->
**Promotion decision: retain legacy as the ordinary default; B is experimental and fails promotion.** The inherited mechanical overlap loop, not an increase in legitimate counterattacks, is the decisive blocker.

| Cohort / policy | Full time | Passes | Shots | Goals | Blocks | Corners | Controlled forward passes | Exposed recoveries / attempts / >=10m |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pristine-development | 6/6 | 10601 | 11 | 7 | 1 | 6 | 2436 | 715 / 335 / 48 |
| legacy-development | 6/6 | 10583 | 12 | 6 | 2 | 6 | 2399 | 729 / 344 / 55 |
| A-development | 6/6 | 11734 | 4 | 2 | 0 | 2 | 2640 | 792 / 380 / 65 |
| B-development | 6/6 | 8087 | 22 | 7 | 3 | 2 | 1669 | 988 / 722 / 152 |
| pristine-validation | 6/6 | 10691 | 7 | 3 | 1 | 3 | 2263 | 651 / 309 / 37 |
| B-validation | 6/6 | 8986 | 27 | 12 | 3 | 2 | 1746 | 1177 / 845 / 179 |


36/36 runs reached canonical full time. The same six development designs were used for each policy; six separate sealed validation designs were executed once per preregistered policy after the source freeze. Every result, repeated source-parity replay, rejected smoke and censored run is retained. These are dependent stress strata, not independent league estimates.

B changes action family/receiver/intent in **13/19 (68.4%)** historical decisions. Target/weight-only changes are excluded from that count. Both risky forward and conservative choices exist; divergence alone is not success.

The initial-CM metric uses starter identities, since substitute natural positions do not prove actual slot minutes. Legacy score>0-based "viable pass" observer fields are not compared across the incompatible old/B value scales. Counterattack≥10m and unsuccessful<5m labels are descriptive posthoc bins, not preregistered acceptance quotas.

### Component ablations

| Disabled component | Policy | Changed winner /19 | Changed physical checkpoints /19 |
| --- | --- | ---: | ---: |
| adaptive-risk | risk-ablation-v1 | 1 | 8 |
| continuation | state-value-v1 | 0 | 0 |
| delivery | state-value-v1 | 3 | 11 |
| direct-risk | risk-ablation-v1 | 0 | 3 |
| movement | state-value-v1 | 0 | 19 |
| readiness | state-value-v1 | 0 | 17 |
| runs | state-value-v1 | 1 | 2 |
| transitions | state-value-v1 | 2 | 13 |

All ablations use the same 19 dependent historical inputs and ordinary paired continuations. Policy-ID-only hash differences are excluded from the physical comparison. These local results do not estimate each component's marginal full-league effect.

### Verification and performance

Unchanged **npm run verify: PASS — 1918 tests** (1857 + 52 + 4 + 5), ESLint, TypeScript and production build. Focused new/existing contact and branching tests also pass, and the original scan-count assertion is unchanged. A concurrent earlier run hit the unchanged statistics test's 5-second timeout; the same targeted suite passed without assertion/timeout/worker changes. Interrupted attempts and full final logs are archived.

Two full B careers preserve deliberate human actions, completed saves, next fixture and exactly-once results; both exercise deterministic Simulate Remainder. Their source epoch predates only the proven output-preserving identity-index optimization. Eight whole-match replays and six 20-minute checkpoints preserve full state across that optimization. Browser smoke verifies the retained default, not a falsely promoted B default.

The separate warm alternating serial benchmark has 124 recorded 60-second trials. B/pristine median ratio **1.162×**, worst design **1.391×**. Sampled profiler spans are inclusive wall time, not additive exclusive CPU; passing plans sit inside candidate generation, with the separate flight-planning receipt retaining direct call measurements. Event-observer equivalence excludes the opt-in full decision-capture loader's overhead. Full-match CPU/wall/memory receipts are retained and their concurrent collection is explicit. These opening windows do not certify the full-match tail budget.

### Required final answers

| # | Answer |
| ---: | --- |
| 1 | Yes. Git confirmed the remote backup branch at df8e532ecf29d6c0a7e92ec241795a6a37250e1c; the pristine worktree reproduced the original evidence. |
| 2 | Yes. Fetch the named reference and add the detached worktree shown above. A policy rollback is one DEFAULT_DECISION_POLICY change for new matches. |
| 3 | The original autonomous enumeration, utility and noise remain in legacy-pr176. Pristine whole-state history uses the separate original source, not a claim of in-tree parity. |
| 4 | Yes for B autonomous attacking choices. Expected subsequent consequences replace old on-ball utility. Restart laws, defensive challenge execution and human ownership retain their canonical paths. |
| 5 | The repeated direct/adaptive/solution/through utility deductions are absent from B. The shared probability forecast still contains approximate correlated geometry and reception proxies; this is not empirically calibrated independence. |
| 6 | No in the tested prepared counterfactual. Same-geometry gameReading20→99 improves B from -0.008185 to -0.008082 instead of the original 4.077→0.111 decline. The untouched original clock is correctly reported as physically unprepared. |
| 7 | Yes. Independent spatial candidates exist while the winger is motionless; a prescribed covered-winger pass reaches the intended receiver after finite acceleration. Other stationary attempts are intercepted; availability does not promise success. |
| 8 | Yes. The prospective space corridors do not call the old accepted-lead gate. |
| 9 | The selected nominal target, launch speed/elevation and readiness/ETA plan are shared with release; ordinary loft planning obeys the same 30m/s ceiling. Actual kick error changes the flight. Reception, height conventions and cross outcome estimates remain approximations. |
| 10 | Yes. B offers controllable/firm/loft envelopes with different arrival, interception and control consequences. Controlled releases include both receptions and interceptions; the faster covered-winger alternative can beat intervention. |
| 11 | Yes. A latched corridor/pressure/episode change can trigger reconsideration during hold/carry cooldown. Quiet plans are also revisited at bounded cadence; polling is not instantaneous. |
| 12 | Yes for the new autonomous release path: action preparation, finite feet, height and last-contact interval remain. First-time and human paths retain their canonical legality/agency guards. |
| 13 | The final arbiter and PR174 continuation prevent specific overriding/stale-target cases. They preserve momentum and two available nonparticipant cover guards. A full tactical job architecture and universal run coherence are not claimed. |
| 14 | B has no CM-slot bonus. Initial-CM players received 1550/5227 development receptions versus 914/8411 in pristine. Substitute runtime-slot minutes were not inferred from natural position. |
| 15 | Yes in prescribed central/transition geometries: a progressive or through pass wins on its subsequent state despite failure risk. The records retain all generated alternatives and outcome branches. |
| 16 | Yes. The late-lead conservative geometry selects a support pass; the failed-counter geometry can hold. Risk itself never gets a success guarantee. |
| 17 | Some materially different attacks are produced: 22 development shots versus 11. Overall plausible football is still not established; the inherited physical loop and poor conversion in several designs prevent promotion. |
| 18 | Yes in controlled moderate-range selection and some natural releases, including a natural approximately.066 scoring-expectation proxy. B does not require an almost certain goal, but shooting remains too scarce across several designs. |
| 19 | Canonical blockers and keepers are unchanged. Development B records 3 blocked shots and 12 on-target shots; all actual outcome IDs and keeper/player records are archived, including misses/saves. |
| 20 | Transition options are available to weaker teams without possession/shot parity. The prescribed weak-v-strong geometry chose hold, so a consistent weak-team counterattacking advantage is not demonstrated. Asymmetric full rows are retained. |
| 21 | A real canonical recovery of a prescribed corner delivery activates the transition and creates a through option and actual progress. This proves the local mechanism, not every preceding corner setup or a natural-match prevalence claim. |
| 22 | The blocked-shot recovery geometry generates an immediate attacking option. Full-match shot/recovery records remain available, but complete natural blocked-shot-to-counter ancestry needs independent replay validation. |
| 23 | Existing physical clearances/headers remain, and useful corridors can be chased. Long releases retain execution error, speed limits and interception; infeasible nominal lofts are not treated as certain receptions. |
| 24 | Yes. Physical acceleration, fatigue, direction and interception govern actual recoveries. Cover/no-cover and momentum scenarios are retained; defenders are not frozen or teleported. |
| 25 | Choices and actual pass results make losses auditable. Development B has 2555 player-credited losses and 2600 turnover facts. Mechanical contact churn is separated from ordinary failed attacking risk. |
| 26 | Both occur under descriptive posthoc reporting bins: 152 exposed development recoveries gain ≥10m controlled depth, while 458 attempted transitions fail to gain 5m. These are posthoc classifications, not preregistered acceptance quotas. |
| 27 | Development passing changes 10601→8087; validation 10691→8986. The strong/weak overlap-loop match contributes to the reduction; do not attribute all of it to better tactical flow. |
| 28 | Controlled forward pass contacts change 2436→1669 in development and 2263→1746 in validation. This is reception gain, not guaranteed retention after eight seconds; paired checkpoints expose subsequent outcomes. |
| 29 | Natural events are measured, not forced. Development corners 6→2 and fouls 67→102; validation corners 3→2. The tables/archives retain dead/live time and every design. |
| 30 | Development shots/goals 11/7→22/7; validation 7/3→27/12. These six-design blocks are heterogeneous descriptive observations, not league estimates. |
| 31 | A, B, in-tree legacy and pristine all have the same six development input hashes. The table shows materially changed B, weaker attacking A and nonidentical pristine/in-tree outcomes. No policy is selected solely for retaining possession. |
| 32 | All six sealed designs were run once for B and once for pristine after freeze e0054db436aa0d5d56c218a06c805b911454728c32003c07526e63bada4feeaf. No tuning followed. The validation shot total is 7→27; this does not overturn the mechanical promotion failure. |
| 33 | Final verify and career receipts preserve normal laws, identities, saves, human boundaries and exactly-once results. The new football exposes an inherited overlapping-body contact loop, independently reproduced in pristine; B is therefore not accepted as fully correct realistic play. |
| 34 | Opening-window serial CPU: B/pristine median 1.162×, worst design 1.391×, five 60-second trials/design. Opening-window budget PASS against preregistered 1.35× median and 1.60× worst-design ceilings. Full-match process CPU is also retained, but those research runs overlapped jobs and are not claimed to meet a complete-match serial tail budget. |
| 35 | legacy-pr176 remains the default. B stays selectable for research, A stays a comparator/fallback. The decision is based on a concrete physical failure and incomplete football quality, not a possession-retention preference. |
| 36 | The reform demonstrably changes decisions, deliveries, progress and shooting in some designs. It does not establish an accepted plausible match engine; the correct status remains NOT READY. |
| 37 | Independently resolve overlapping-body repeat contacts before promotion, then test new sealed seeds, attack-to-shot conversion, receiver control, long/through delivery, first-time actions, asymmetric counters, natural set-piece ancestry, recovery, late-match CPU and human careers. PR177 validation is consumed; no summary calibration yet. |

<!-- PR177_RESULTS_END -->

## Reproduction

Node 24 and the unchanged dependency lockfile are required. Offline scripts do not run in normal gameplay or `verify`.

```sh
node scripts/preparePr176.mjs
node scripts/preparePr177Baseline.mjs ../baseline-pr176
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr177.mjs --mode=frozen --policy=state-value-v1
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr177.mjs --mode=scenarios --policy=state-value-v1
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr177.mjs --mode=flight --policy=state-value-v1
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr177.mjs --mode=development --policy=state-value-v1
# Only after freezing production/config/harness hashes:
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr177.mjs --mode=validation --policy=state-value-v1
npm run verify
```

Repeat development for `legacy-pr176` and `risk-ablation-v1`, and execute the prepared harness inside the pristine worktree for the historical comparator. Existing receipts only resume when source, harness, limit and input hashes agree. A 7200-second safety cutoff is reported as censored unless the canonical status actually reaches full time. Physics is always stepped at .025 seconds.

## PR178 priorities

Use newly sealed seeds and designs: PR177's validation set is consumed after this experiment. Independently inspect attack-to-shot conversion, reception losses, stationary-runner acceleration, through/switch interception, first-time contacts, successful and failed transitions from genuine set pieces, defender recovery and CPU distributions. Check complete footage and human-controlled career matches, including fatigue and substitutions. Preserve source/input/policy identity. Summary-simulator calibration remains blocked until canonical football itself meets the independent realism assessment.
