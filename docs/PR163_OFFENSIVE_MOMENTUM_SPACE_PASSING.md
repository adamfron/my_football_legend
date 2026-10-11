# PR163 — Offensive Momentum, Run-On Passing & Contextual Ball Progression

Baseline: merged PR162, `34ee3da98b20195841f87d0156d965649bb97f1a`. PR163 connects the existing reception, burst carry, space passing, arrival and contact systems. It does not add a second engine, a success roll for deliberate non-contact, protected ownership, club bonuses or guaranteed attacking outcomes.

## Original evidence and causal finding

Both original `lab-mv3lzwth` exports were found locally. The session covers 2760.125 canonical seconds, with **1162 attempted / 1063 completed passes and zero shots**. The debug export contains 800 frames covering 1532.7–1552.675 s. [Receipts and bounded original traces](performance/PR163-original-evidence.json) contain SHA-256 fingerprints and selected observations; the 49 MB of original archives and player profiles are not committed.

Baran's diagonal carry was already first at 1535.2: **46.398**, against hold **43.178** and straight carry **28.275**. He stood at `(64.049,58.196)`, speed zero, with the nearest defender **8.184 m** away. At 1536.125, his speed was only **0.578 m/s**, separation **5.256 m** and a backward support pass scored **31.086**, above carry **29.164**. The actual backward release followed at 1536.15. A missing carry candidate was not the cause: the opening lost value while reception/movement/readiness elapsed.

Kowalski likewise had a preferred diagonal carry at 1544.5 (**29.753**, hold **29.614**). At 1545.075, carry was **23.385**, a backward support pass **26.331**, and a long backward lofted `direct` pass **25.223**. He released the latter at 1545.1 toward approximately `(42.435,48.037)`. Its length had selected `direct` despite backward progression. The final release frame has no ranking, so the preceding ranking is not presented as the exact release-time winner.

The original export does not contain facing angles, the complete preparation/carrier intentions, next-contact and defender-contact ETA or a complete RNG/source checkpoint. Those facts remain **unknown**. The two regression fixtures are equivalent geometries with stated orientation/history assumptions, not exact historical replays. [Fixture reception diagnostics](performance/PR163-reception-diagnostics.json) separately record actual pre-awareness velocity/facing, awareness, contact/target, defender velocity, common forward ETA, available actions/contact preparation, ranking, choice and subsequent play.

## Canonical implementation

- Reception preparation can hold a bounded continuation after awareness of the **actual** flight. It is discarded on trajectory disagreement, inadequate clearance, depleted readiness, expiration or human ownership. Facing opens through the existing angular integrator. Movement can continue past a meeting point only during the final low phase of flight; an accurate high switch remains receivable.
- A real directional contact starts a finite impulse at the contact coordinate. Subsequent control uses existing contact windows, balance, turning, weak-foot/height costs, acceleration, interception and fatigue. The passer's leftover cooldown no longer delays a physically prepared anticipated reception.
- Carry generation retains cautious short options and adds at most three forward/inward/outward sprint corridors, sampled at at most six points each. Shared physical arrival estimates discount defender recovery and pushed-ball exposure. Sprint ranking values reachable free progression and supported crossing access, while charging turning, stamina and contact risk. Controlled dribbles retain their existing progression value and physical evasion/contact penalties: an uncontested-corridor forecast cannot treat every contestable dribble as zero progress. The four pre-existing short actions retain their original movement semantics. A five-point continuity preference keeps a still-valid target competitive; NPC reevaluation can retain that existing intent without authoring a new execution. Explicitly executed carries retain their existing statistical contract.
- Ordinary NPCs can generate at most three space passes to prospective attackers, including a currently stationary runner. The existing space-pass resolver, actual launch uncertainty, awareness, movement, offside at release, goalkeeper and contact races still decide the result.
- An intended receiver may omit an early low contact when a later useful meeting on the actual trajectory is reachable. Only that receiver is omitted from that particular contact race. Other players still compete. This decision creates **no touch, owner, completed pass or receiver credit**. It is reconsidered immediately when a defender arrives, the flight disagrees or the later target is reached; final credit requires a real legal contact.
- Pass metadata derives independent length (`<=15`, `<=30`, `>30 m`), direction and purpose. New NPC backward switches use `support`; historical `direct` actions remain readable. Length alone no longer grants attacking/direct utility or high-impact agency semantics. Selection quality and tactical opportunity remain separate quantities.

The fixed step stays **0.025 s**. Reception forecasts run on the existing 10 Hz preparation cadence. Candidate generation happens at decision evaluation, with bounded runners/corridors and no spatial grid. No dependencies or presentation assets were added.

## Evidence protocol and metric definitions

`npm run benchmark:offensive-momentum -- --mode=scenarios|passing|matches|performance --output=...` selects the headless lab. `--engine-root=../baseline` loads the pristine old engine. Scenario inputs and per-match fixture/initial-state hashes must match across revisions; source fingerprints prevent mixing changed trees. The manifest's `commit` is the parent HEAD at measurement time; the **source hash identifies the measured working tree**, rather than implying that the dirty PR tree equals baseline HEAD.

The scenario matrix uses three matched seeds and 12-second windows for all 22 requested cases plus Baran/Kowalski. A scenario name describes its initial challenge, not a scripted successful outcome. The human reception window ends when its actual decision opens. Displacement is the receiver's body displacement, including movement after losing possession; it is never used as a proxy for a successful carry.

The passing lab crosses eight base distances (5–60 m), four passer ability levels (25/50/75/95), three pressure levels, eleven receiver/defender perturbations and two delivery types: **2112 cells × four samples = 8448 physical attempts per revision**. Contexts are one-factor perturbations, not a full factorial of every receiver property. Error samples use matched seeds; context/delivery samples are reused across distances, ability and pressure. The metre label is the original receiver geometry; a lead target can move farther away. Completion requires the actual intended receiver. Target error measures intended versus sampled physical target; minimum ball-target separation is a separate flight statistic. Arrival uses the first resolved result, with unresolved 8-second windows censored at 8 s. Retention samples ownership at least one second after completion within the two-second follow-up; useful progression requires at least five owned forward metres. No empirical success is inferred from a forecast.

PR162's attacking funnel stays **version 3**, with its original definitions and benchmark CLI. PR163's independent continuation observer has bounded 32-item samples/traces, one pending continuation and online counters. Useful continuation means five owned forward metres within five seconds. Follow-up actions, first real control, planned run-on and deliberately bypassed early contact are separate stages; moving body coordinates alone are insufficient. A superseded or closed unsuccessful window is counted explicitly. The release/selection stage is atomic for ordinary canonical on-ball passes; pre-release queued human actions are not invented as released attempts. Sampled forecast means are labelled as samples, not full-match means.

Representative full matches use one matched seed in both orientations for native clubs, balanced 70s, equal 60s, strong/weak passer with fast wings, technical midfield versus pressing, and equal 4-4-2. This is a targeted 14-match cohort on each source, **not a new formation superiority study**. Abandoned/censored runs, if any, are separate from completed matches. Equal-4-4-2 logical-identity asymmetry remains visible; no result balancing is applied.

## Numeric before/after results

All 14 mirrored rows complete full time. The table contains raw matched rows, with paired deltas in the JSON. Full-match completion comes from official statistics, not predicted probabilities.

| Fixture / reversed                | Attempts B→A | Completed B→A | Final-third B→A | Box B→A | Shots B→A | Goals B→A |
| --------------------------------- | ------------ | ------------- | --------------- | ------- | --------- | --------- |
| clubs / false                     | 2235→2230    | 2009→2017     | 74→77           | 1→4     | 0→2       | 0→1       |
| clubs / true                      | 2197→2146    | 1990→1915     | 80→80           | 2→7     | 1→5       | 1→2       |
| balanced / false                  | 2195→2244    | 2027→2089     | 72→69           | 5→2     | 4→0       | 4→0       |
| balanced / true                   | 2134→2246    | 1955→2092     | 75→65           | 9→3     | 6→2       | 4→1       |
| equal / false                     | 1809→1769    | 1559→1493     | 41→44           | 0→2     | 0→1       | 0→0       |
| equal / true                      | 1827→1789    | 1564→1516     | 31→52           | 1→0     | 1→2       | 0→0       |
| strong_passer_fast_winger / false | 1771→1784    | 1504→1520     | 46→60           | 1→1     | 0→1       | 0→0       |
| strong_passer_fast_winger / true  | 1824→1818    | 1555→1513     | 46→57           | 3→6     | 0→2       | 0→2       |
| weak_passer_fast_winger / false   | 1828→1775    | 1589→1489     | 36→60           | 3→4     | 0→3       | 0→2       |
| weak_passer_fast_winger / true    | 1859→1787    | 1574→1489     | 39→58           | 2→1     | 1→0       | 1→0       |
| technical_midfield / false        | 1817→1708    | 1563→1435     | 49→52           | 3→6     | 1→4       | 1→0       |
| technical_midfield / true         | 1850→1713    | 1589→1455     | 48→62           | 0→6     | 0→2       | 0→1       |
| equal_442 / false                 | 1854→1879    | 1592→1636     | 21→22           | 2→1     | 2→0       | 0→0       |
| equal_442 / true                  | 1847→1877    | 1624→1625     | 15→23           | 0→2     | 0→1       | 0→1       |

The balanced fixture explicitly sets balanced tactics. The crowded-midfield fixture sets the opponent to pressing with compactness 0.95 and organised press 0.9. Other artificial quality fixtures retain the neutral manager’s canonical **pressing** style; they are not described as balanced tactics. One seed block does not establish league-wide improvement, formation superiority or precise uncertainty intervals.

Equal 4-4-2 is shown by logical identity below: anchor is home in the first orientation and away when reversed. These are measured side totals; no result balancing is applied.

| Equal 4-4-2 / reversed | Logical team | Possession seconds B/A | Final-third B/A | Box B/A | Shot releases B/A |
| ---------------------- | ------------ | ---------------------- | --------------- | ------- | ----------------- |
| false                  | anchor       | 2660.125/2522.55       | 14/14           | 1/1     | 2/0               |
| false                  | opponent     | 2594.9/2812.7          | 7/8             | 1/0     | 0/0               |
| true                   | anchor       | 2507.9/2364.65         | 11/14           | 0/0     | 0/1               |
| true                   | opponent     | 2810.575/2946.275      | 4/9             | 0/2     | 0/0               |

| Total metric                   | Before    | After     | Paired sum delta |
| ------------------------------ | --------- | --------- | ---------------- |
| passesAttempted                | 27047     | 26765     | -282             |
| passesCompleted                | 23694     | 23284     | -410             |
| carries                        | 7166      | 7495      | 329              |
| shots                          | 16        | 25        | 9                |
| goals                          | 11        | 10        | -1               |
| possessionLost                 | 4195      | 4389      | 194              |
| sprintDistance                 | 18944.748 | 28480.465 | 9535.716         |
| sprintBursts                   | 1434      | 2143      | 709              |
| final_entry                    | 673       | 781       | 108              |
| box_entry                      | 32        | 45        | 13               |
| midfield_controlled_receptions | 2253      | 2330      | 77               |
| winger_controlled_receptions   | 6136      | 5913      | -223             |
| striker_controlled_receptions  | 1202      | 1152      | -50              |

In this targeted cohort, box entries rise **32→45**, shots **16→25** and useful owned continuations **990→1321**; goals are **11→10**. Improvement is mixed across fixtures: balanced shots fall **10→2** while other geometries improve. These aggregate gains do not establish a universal tactical improvement or a complete solution to the sparse-shot problem.

| Physical length | Attempts B | Attempts A | Completed rate B | Completed rate A | Forecast mean B | Forecast mean A |
| --------------- | ---------- | ---------- | ---------------- | ---------------- | --------------- | --------------- |
| short           | 9399       | 9764       | 0.934            | 0.932            | 0.922           | 0.92            |
| medium          | 16354      | 15762      | 0.867            | 0.857            | 0.894           | 0.89            |
| long            | 1294       | 1239       | 0.567            | 0.55             | 0.798           | 0.78            |

Completion forecasts are demonstrably conservative in this lab. They are **not claimed calibrated**. The matched physical error increases with range; this supports keeping the existing skill/pressure/range distribution rather than globally reducing long-pass accuracy. Receptions and tactical value still change. See [the full passing summary](performance/PR163-passing-summary.json).

| Base distance m | n each | Predicted B/A | Completed B | Completed A | Mean sampled target error m B/A |
| --------------- | ------ | ------------- | ----------- | ----------- | ------------------------------- |
| 5               | 1056   | 0.797/0.797   | 0.903       | 0.9         | 0.609/0.609                     |
| 10              | 1056   | 0.741/0.741   | 0.902       | 0.87        | 0.936/0.936                     |
| 15              | 1056   | 0.694/0.694   | 0.894       | 0.85        | 1.357/1.357                     |
| 20              | 1056   | 0.649/0.649   | 0.894       | 0.875       | 1.878/1.878                     |
| 30              | 1056   | 0.563/0.563   | 0.851       | 0.84        | 3.193/3.193                     |
| 40              | 1056   | 0.477/0.477   | 0.787       | 0.823       | 4.915/4.915                     |
| 50              | 1056   | 0.404/0.404   | 0.759       | 0.78        | 7.036/7.036                     |
| 60              | 1056   | 0.34/0.34     | 0.707       | 0.708       | 9.498/9.498                     |

| Passer ability | n each | Target error B/A | Completed B/A |
| -------------- | ------ | ---------------- | ------------- |
| 25             | 2112   | 10.034/10.034    | 0.642/0.654   |
| 50             | 2112   | 3/3              | 0.87/0.871    |
| 75             | 2112   | 1.039/1.039      | 0.92/0.904    |
| 95             | 2112   | 0.638/0.638      | 0.918/0.894   |

Continuation counts use final observer v2. Its resolved completion and release totals match the official ledger on every full match. A passer recollecting their own flight is **self-reclaim**, not a completed pass. First legal opportunities include observed unsettled low opportunities and actual settled receiver controls/failures, because an immediate contact can clear preparation within one canonical step. The table’s sprint counter is a **follow-up action inside the five-second reception window**, not every off-ball sprint or every carry in a match.

| Continuation stage                 | Before | After |
| ---------------------------------- | ------ | ----- |
| released                           | 27047  | 26765 |
| result_completed                   | 23694  | 23284 |
| space_pass                         | 1      | 244   |
| space_pass_result_completed        | 1      | 184   |
| space_pass_intended_completed      | 1      | 126   |
| lead                               | 5006   | 5173  |
| through                            | 2989   | 3214  |
| backward_switch                    | 2846   | 2447  |
| first_legal_opportunity            | 24880  | 24431 |
| anticipating_run                   | 24364  | 23875 |
| directional_reception              | 8488   | 9082  |
| run_on_planned                     | 0      | 572   |
| bypassed_early_contact             | 0      | 88    |
| run_on_completed                   | 0      | 85    |
| run_on_failed                      | 0      | 3     |
| retained_after_one_second          | 5044   | 5279  |
| useful_forward_continuation        | 990    | 1321  |
| carry_entering_final_third         | 237    | 367   |
| wide_continuation_to_crossing_area | 1      | 75    |
| forward_carry                      | 5859   | 5778  |
| sprint_carry                       | 0      | 342   |
| progressive_followup               | 7274   | 7203  |
| cross_released                     | 70     | 89    |
| cutback_released                   | 28     | 27    |
| no_useful_continuation             | 22692  | 21952 |
| defensive_recovery                 | 2740   | 2633  |
| first_touch_failure                | 1179   | 1131  |
| passer_reclaimed                   | 6      | 3     |

The following means use the **first at most 32 samples per match**; they are bounded diagnostic samples, not unbiased full-match averages. Latency samples include useful continuations only.

`run_on_completed` counts a physically completed pass after an observed bypass, including a different teammate recovering the flight; it is not automatically intended-runner success. `run_on_failed` includes technical failure and other terminal unsuccessful outcomes. The `failed_control` regression proves that an actual bypass can still fail without completion credit. Space-pass intended-recipient completions remain a separate counter.

| Bounded diagnostic sample | n before/after | Mean before/after |
| ------------------------- | -------------- | ----------------- |
| momentumAtRelease         | 448/448        | 2.544/2.548       |
| momentumAtReception       | 448/448        | 0.842/0.847       |
| continuationLatency       | 448/448        | 2.546/2.235       |

## Scenario coverage and original ranking comparison

| Canonical challenge        | Initial pass completed B/A | Initial reception gained 5 owned m B/A | Actual cross releases B/A |
| -------------------------- | -------------------------- | -------------------------------------- | ------------------------- |
| elite_winger               | 3/3 → 3/3                  | 0→3                                    | 0→0                       |
| average_winger             | 3/3 → 3/3                  | 0→2                                    | 0→0                       |
| recovering_fullback        | 3/3 → 3/3                  | 0→0                                    | 0→0                       |
| immediate_pressure         | 3/3 → 3/3                  | 0→0                                    | 0→0                       |
| directional_touch          | 3/3 → 3/3                  | 0→1                                    | 0→0                       |
| failed_control             | 0/3 → 0/3                  | 0→0                                    | 0→0                       |
| byline_sprint              | carry start                | not a reception                        | 1→0                       |
| heavy_sprint               | carry start                | not a reception                        | 0→0                       |
| push_and_run               | carry start                | not a reception                        | 1→0                       |
| second_touch_recovery      | carry start                | not a reception                        | 0→1                       |
| let_ball_run               | 3/3 → 3/3                  | 0→1                                    | 0→0                       |
| run_on_intercepted         | 3/3 → 3/3                  | 0→0                                    | 0→0                       |
| run_on_out                 | 0/3 → 0/3                  | 0→0                                    | 0→0                       |
| central_through            | 3/3 → 3/3                  | 2→2                                    | 0→0                       |
| offside_striker            | 0/3 → 0/3                  | 0→0                                    | 0→0                       |
| central_vs_backward_switch | carry start                | not a reception                        | 0→0                       |
| accurate_switch            | 3/3 → 3/3                  | 0→0                                    | 0→0                       |
| pressed_switch             | 1/3 → 1/3                  | 0→0                                    | 0→0                       |
| cross_after_carry          | carry start                | not a reception                        | 0→0                       |
| fatigued_winger            | carry start                | not a reception                        | 0→0                       |
| human_winger               | 3/3 → 3/3                  | 0→0                                    | 0→0                       |
| npc_equivalent             | carry start                | not a reception                        | 1→0                       |
| baran_equivalent           | 3/3 → 3/3                  | 0→0                                    | 0→0                       |
| kowalski_equivalent        | 3/3 → 3/3                  | 0→0                                    | 0→0                       |

Names such as `run_on_intercepted`, `run_on_out` and `cross_after_carry` describe attempted geometries. They do not promise a bypass/interception/out/cross in every seed. The trace records actual alternatives and failures. The body can keep running after possession loss, so final displacement is not a successful push-and-run statistic.

A trace frame stores the latest canonical action. That action can repeat on contact or ownership-change frames; repeated frames are not new executions. Release/action counters use canonical identities and timing, not the number of printed frames.

### baran_equivalent: first real control, matched seed pr163-case-1

| Rank | Baseline action / score           | PR163 action / score              |
| ---- | --------------------------------- | --------------------------------- |
| 1    | hold / 36.264                     | hold / 36.264                     |
| 2    | carry/carry (61.8,52.2) / 32.046  | carry/carry (61.8,52.2) / 32.046  |
| 3    | carry/carry (69.8,63.3) / 31.331  | carry/carry (69.8,63.3) / 31.602  |
| 4    | carry/carry (74.8,49.8) / 27.550  | carry/carry (70.8,58.3) / 27.764  |
| 5    | carry/carry (70.8,58.3) / 27.433  | carry/carry (74.8,49.8) / 27.550  |
| 6    | pass/support (51.8,24.1) / -8.492 | pass/support (51.8,24.1) / -8.492 |
| 7    | pass/support (46.8,31.1) / -8.706 | pass/support (46.8,31.1) / -8.706 |
| 8    | pass/support (51.8,24.1) / -9.624 | pass/support (51.8,24.1) / -9.624 |

### kowalski_equivalent: first real control, matched seed pr163-case-1

| Rank | Baseline action / score           | PR163 action / score              |
| ---- | --------------------------------- | --------------------------------- |
| 1    | carry/carry (74.4,19.0) / 46.473  | carry/carry (74.4,19.0) / 46.473  |
| 2    | carry/carry (69.4,6.0) / 33.207   | carry/carry (69.4,6.0) / 33.433   |
| 3    | hold / 33.068                     | hold / 33.068                     |
| 4    | carry/carry (61.4,16.7) / 29.615  | carry/carry (61.4,16.7) / 29.615  |
| 5    | carry/carry (70.4,11.0) / 24.676  | carry/carry (70.4,11.0) / 24.963  |
| 6    | pass/support (41.9,20.6) / 0.026  | pass/support (41.9,20.6) / 0.026  |
| 7    | pass/support (45.7,25.5) / -1.147 | pass/support (45.7,25.5) / -1.147 |
| 8    | pass/support (40.6,20.2) / -6.268 | pass/support (40.6,20.2) / -6.268 |

The equivalent historical geometry still permits recycling when recovery ETA closes the corridor. Successful open-wing fixtures establish that forward continuation is executable; they do not prove that Baran/Kowalski must beat an eight-metre recovering defender. [Complete compact scenario evidence](performance/PR163-scenarios-summary.json) and [bounded reception windows](performance/PR163-reception-diagnostics.json) retain this distinction.

## Performance, determinism and validation

| Ranking context    | Before median ms | After median ms | Change % | Candidates B/A |
| ------------------ | ---------------- | --------------- | -------- | -------------- |
| elite_winger       | 3.186            | 4.325           | 35.745   | 22/24          |
| immediate_pressure | 4.342            | 4.977           | 14.615   | 22/22          |
| baran_equivalent   | 3.903            | 4.113           | 5.39     | 25/25          |

| Independent generation   | Median ms | Candidate count |
| ------------------------ | --------- | --------------- |
| elite_winger/carry       | 0.466     | 6               |
| elite_winger/space       | 0.504     | 1               |
| immediate_pressure/carry | 0.034     | 4               |
| immediate_pressure/space | 0.452     | 0               |
| baran_equivalent/carry   | 0.071     | 4               |
| baran_equivalent/space   | 0.595     | 2               |

300 canonical seconds, seven alternating measured blocks after warmup: **6027.926→5402.162 ms (-10.381%)**. These runs are serial after the long labs; their timings are separate from contended full-match wall times. There is no renderer or stadium. Repeated ranking/generation leaves the entire canonical state unchanged.

The whole-physics comparison includes the changed football workload and action sequence; it does not prove an isolated per-step optimisation. Ranking costs increase in the fixed contexts above, so the whole-window improvement must not hide candidate-evaluation overhead.

Complete 2400-tick telemetry repeats twice for each of two seeds on both revisions; every exported field and identity invariant is checked. Observer/ranking versus plain stepping is byte-identical over the regression window. Active human and NPC executions of the same sprint retain identical ball, body, velocity and fitness over twelve physics steps. Original PR162 format and all-five-formation mirrored smoke remain executable. Full-match aggregate pass ledgers are checked independently. No automated classifier proves that every risky action is tactically justified; physical and accounting invariant violations are checked, and broader plausibility remains a limitation.

Final `npm run verify`: **PASS** — lint, 1538 main tests in 184 files, 29 match-integration tests, five career tests, TypeScript and production build. No timeout was increased. An earlier crowded run exceeded the existing 90-second CPU-half limit; final results use the successful complete run. Existing bundle-size/static-plus-dynamic-import warnings remain for PR164 measurement, not a new dependency change.

## Answers to the 25 requested questions

| #   | Question                                                | Evidence-backed answer                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Why did Baran recycle?                                  | Baran already had the best diagonal carry, but stood still while separation shrank 8.184→5.256 m; the later backward utility won. Exact original preparation/facing are unavailable.                                                             |
| 2   | Why did Kowalski abandon the initial carry?             | Kowalski lost the initial carry advantage during the same reception/recovery interval. A long backward release also carried the old length-driven `direct` label; the exact release ranking is missing.                                          |
| 3   | Were forward carries absent, misranked or unexecutable? | Available and initially well ranked, not absent. Short targets, reception braking/cooldown and recovery prevented useful execution in some situations.                                                                                           |
| 4   | Can a free technical winger accelerate?                 | Yes in the genuinely open canonical wing fixtures; the scenario table separates first-reception owned gain from later team movement.                                                                                                             |
| 5   | Can defenders catch or dispossess him?                  | Yes. Recovering/immediate-pressure fixtures, real carrier-contact failures and full-match turnovers remain. No protected possession is added.                                                                                                    |
| 6   | Can directional control preserve momentum?              | Yes: a real directional impulse and retained body velocity can preserve momentum; actual turning/contact risk can still spoil the next touch.                                                                                                    |
| 7   | Can a receiver intentionally let the ball run?          | Yes, after actual awareness and only toward a later reachable low trajectory point. The planned and executed bypass counts are separate.                                                                                                         |
| 8   | Is the ball contestable before contact?                 | Yes. No owner/touch/completion before contact; only the intended receiver is omitted, and every opponent/keeper retains the canonical race.                                                                                                      |
| 9   | Can ordinary NPCs pass to open grass?                   | Yes, at most three prospective space options, including stationary attackers; existing ordinary release/contact machinery executes them.                                                                                                         |
| 10  | How often do these passes produce receptions?           | The full-match table reports space-pass releases, actual completions and completions by the intended recipient; no completion is inferred from an ETA.                                                                                           |
| 11  | Does length still determine direct intent?              | No for newly generated actions: positive progression, rather than length alone, selects direct attack. Historical actions retain schema compatibility.                                                                                           |
| 12  | Are comparable long passes more accurate?               | No overall in matched geometry: target error rises with range and the aggregate completion rate falls toward 60 m. Particular open switches can remain excellent.                                                                                |
| 13  | Are forecasts and observed completion calibrated?       | Not fully: the measured forecasts are conservative, especially for low passer ability with an excellent receiver. Numerical predicted/observed rates are exposed; no calibration success is claimed.                                             |
| 14  | What causes long-pass overuse?                          | The observed misleading intent and excessive recycling are selection/reception issues. The lab confirms physical range/skill costs; receiver geometry and anticipation still change observed completion.                                         |
| 15  | Can short central passes beat backward switches?        | The short central outlet remains competitive in the matched fixture, but an open carry wins in all three seeds. This fixture does not establish a higher frequency of central-pass selection; no pass is forced to obtain the requested outcome. |
| 16  | Does ranking value genuine attacking opportunity?       | Yes, via reachable corridor progression, defensive recovery and supported crossing access; the bonus is bounded and competes with contact, fatigue and pass risk.                                                                                |
| 17  | Do wingers reach crossing positions?                    | Wide continuations and real crosses occur in fixed-seed play. Scenario labels do not guarantee crossing, and aggregate reaching/cross-release counts are reported separately.                                                                    |
| 18  | Do actual box entries increase?                         | The full-match table gives the actual paired box-entry delta; it is not inferred from more carries or target coordinates.                                                                                                                        |
| 19  | Do shots emerge through credible chains?                | Some actual chains release shots, with PR162 possession stages retained. The cohort remains sparse and does not establish a general solution to attack creation.                                                                                 |
| 20  | Can progressive actions fail?                           | Yes: interceptions, technical failures, unclaimed/out balls, self-reclaims and failed carrier contacts remain possible and recorded.                                                                                                             |
| 21  | Do passing and defensive attributes matter?             | Yes: matched skill/pressure/error tables and recovering defenders retain actual consequences, rather than identity bonuses.                                                                                                                      |
| 22  | Does fatigue impose physical costs?                     | Yes: existing capacity/reserve/acceleration/contact costs suppress sprint candidates and affect workload; a depleted fixture shares the fresh physical geometry.                                                                                 |
| 23  | Do human and NPC executions agree?                      | Yes for the same explicitly selected physical action, including active human control. The existing shared resolver and physics, not a human-specific success path, execute it.                                                                   |
| 24  | Are determinism and agency preserved?                   | Complete-field deterministic repetitions, state-equality observer checks, agency regressions and full verify pass. Human shots/non-throw restarts and live offside remain authoritative.                                                         |
| 25  | What limitations remain?                                | Sparse shots, conservative completion forecasts, small matched seed coverage, equivalent-not-exact historical reconstruction and equal-4-4-2 identity asymmetry remain. Next is PR164 startup/storage/match-contract audit.                      |

[Full-match numerical rows](performance/PR163-full-match-summary.json), [bounded match traces](performance/PR163-full-match-traces.json), [passing tables](performance/PR163-passing-summary.json), [performance samples](performance/PR163-performance.json), [complete telemetry receipts](performance/PR163-telemetry-reference.json) and [source/archive receipts](performance/PR163-evidence-manifest.json) retain denominators and provenance. Full local numerical lab outputs remain outside Git; no raw per-tick/world-profile archive is committed.
