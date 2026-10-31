# PR210 — Human agency and physical ball readiness

Research change: reuse the canonical release-contact window at ordinary human decision boundaries, while retaining explicit incoming preparation and prospective movement. Local result: the paired eight-case corpus removes **5 premature on-ball prompts → 0**, with real recovery and failure cases. Integration effect: the live human agency lifecycle changes; the physical executor, profile definitions, default B policy, 40 Hz and 28 permanent attributes remain. Promotion decision: this is a focused correctness patch, **not promotion of an experimental realism profile**; maintained PR201 remains experimental / NOT_READY_FOR_PROMOTION and confirmation stays sealed. Next dependency: PR211's persisted intentional-strike lifecycle and shared contact arbitration.

## Source and diagnosis — Gate A

Base is merged main including PR209, `f2cab2a8b14d943e980e0665f2bc8ac3899d7fb9`. Authoritative state, roadmap, integration architecture, dependency/assumption registers and PR205–209 reports were consulted. The source trace covers `playerDecision`, `possessionAgency`, `carryPursuit`, `carryExecution`, `matchActions`, `matchSimulation`, `matchState`, `ballContactGeometry`, `playerArrival`, `TacticalMatchSandbox` and the career wrapper. Career and sandbox share the same canonical runtime; React does not own a second simulation.

The historical user save is unavailable. `scripts/pr210Scenarios.ts` constructs a physically equivalent, deterministic right-back checkpoint between touches, without claiming that its separation is the user's exact 8–10 m. The existing pursuit bounds are unchanged.

The first causal defect is in `projectPlayerAgency`: `humanPossessionRedecisionReason` correctly observes an attacking-zone transition, but an active episode plus nominal `ball.ownerId` admits `kind: on_ball` without checking the already-existing `releaseContactReadiness`. Only the waypoint/heavy-touch triggers explicitly considered pursuit. The action enumerator then advertised ordinary carries and passes. Cooldown expiry is not the reproduced cause; the semantic reason bypasses the continuing-episode suppression.

| Canonical evidence | Before, first offending boundary |
| --- | --- |
| Human action | Sprint carry to world point `(96,8)`; original body `(69.99,8)`, velocity `(6,0)` m/s, facing π/2 |
| Initial pushed ball | `(72.19,8)`, velocity `(7,0,0)` m/s, height 0.11 m, own last touch and nominal owner |
| Next 40 Hz state | t=20.025 s; body `(70.144212,8)`, speed 6.168470 m/s; ball `(72.364,8)`, speed 6.92 m/s |
| Physical access | Closest foot distance **2.026930 m**, inherited reach **0.82 m**; `out_of_reach` |
| Intention / forecast | Human episode and sprint destination remain; the existing pursuit forecast supplies a bounded approach, not ownership/contact permission |
| Opponents | Full canonical coordinates/proximity in the receipt; the sparse original scene has no arriving challenge at this boundary |
| Incorrect opportunity | `on_ball`, reason `attacking_zone`; ordinary action families despite unavailable current foot contact |

The initial pursuit forecast estimates an approach to `(76.54,8)` in about 0.775 s. This is a positional forecast with inherited arrival tolerance, not a guaranteed earliest collision time. The observed first finite touch is at t=20.675 s. No new separation threshold or invented recovery deadline is introduced.

## Agency versus possession — Gate B

`canOfferOwnedBallActions` derives current availability from existing foot geometry and motor recovery, physical participation, the real playing boundary and lawful goalkeeper handling. It does not store a new ball-state flag. Ordinary human enumeration, projection and contextual interactions share it. Cached ordinary UI selections are checked again before consumption. NPC selection/execution contracts are retained; this patch does not rewrite historical direct DEV release APIs or introduce another physics executor.

| Situation | Existing representation / behaviour |
| --- | --- |
| On-ball executable | Actual owned foot/recovery window or lawful keeper handling; ordinary menu can be considered |
| Committed carry continuation | Existing episode + carry intent + pursuit; canonical ticks continue while ordinary contact is unavailable |
| Incoming-ball preparation | Existing `incoming_ball` and `pendingReceptionIntent`; the new schema-backed call context `incoming_preparation` explicitly enumerates forecast contacts, then execution still waits for the real contact |
| Off-ball actionable | Existing movement/defensive kinds; a pursuit threat uses movement-only `loose_ball` options |
| Possession terminated | Another touch/owner, boundary/restart, failed pursuit, explicit new movement, dismissal or inability to participate invalidates the old episode/intention |

An executed controlled foot contact now records its actor as the last toucher. It does not award control, change any impulse, or turn a glancing touch into a new ordinary menu. Real acquisition, finite control contacts and failed control facts remain separate witnesses. The inherited legacy acquisition route can record `lastBallRecovery` at an available foot without a new finite `lastGroundContact` receipt; that limitation is reported rather than relabelling its old failed-control witness as an executed touch.

### Semantic triggers

| Trigger | While the ball is not currently playable | At an executable contact |
| --- | --- | --- |
| `carry_decision_waypoint` | Continue valid pursuit; existing spatial overshoot semantics retain the world target | Offer the next ordinary choice |
| `route_blocked`, `major_pressure`, `new_defender_angle` | Immediate movement/stop intervention when a lawful pursuit exists | Ordinary tactical reconsideration |
| Keeper rush / challenge / contested possession | Movement intervention during pursuit; independent defensive and keeper response routes remain | Ordinary on-ball alternatives |
| `attacking_zone`, `new_shooting_opportunity`, `shooting_lane_open`, `shooting_opportunity_closing`, `decisive_pass_available` | Recompute and wait for contact; do not advertise a kick from afar or latch an obsolete opportunity | Offer only the still-current opportunity |
| `heavy_touch` | Let recovery, loose-ball competition or actual loss resolve; no automatic return of control | Existing semantic reconsideration if still meaningful |
| Retain/support triggers | A recent touch/recovery is not itself permission for another immediate menu | Timely support/outlet choice when the existing motor window is ready |

Movement choices preserve absolute world-space coordinates. An explicit movement replaces the old carry and checkpoint immediately, including in saves. No old target is silently reinterpreted as a relative offset. Existing `hasReachedCarryDecisionWaypoint` handles a passed destination; pursuit is not ended merely because the body crosses it. The observed sprint has zero unnecessary direction reversals. This is bounded local evidence, not a universal assertion about all routes.

## Canonical continuation — Gates C/D

Candidate ranking has an explicit `prospective_ranking` context: it may evaluate an intention before it becomes executable, without advertising it as an ordinary human menu. The existing routine human/NPC circulation parity test still requires identical players and statistics. A new explicit carry also replaces a previous pursuit movement target after recovery; first-time passing retains its independent run-continuation contract.

The [before](performance/pr210/before.json.gz) and [after](performance/pr210/after.json.gz) receipts retain identical inputs, seeds, every observed physical/agency frame, foot distance/readiness at decisions, full initial states, pursuit forecasts, body velocity/facing, ball state, last-touch/contact/recovery facts, possession episodes and terminal hashes. Four additional separation/velocity/orientation/body-speed variants exercise braking and failure. No outcome is forced.

| Scenario | Observed corrected result |
| --- | --- |
| Sprint, 2.2 m initial separation | No t=20.025 menu; finite controlling foot impulse at **20.675 s**, later loose continuation, real recovery and executable `attacking_zone` decision at **23.400 s**; about 24.3 m progression |
| Longer 4 m loose chase | Initial loss of nominal ownership; canonical acquisition at **21.525 s**, foot distance **0.781750 m**; immediate valid decision, no added cooldown |
| Short controlled dribble | Actual contact at **20.025 s**; motor ready **20.148827 s**; menu at **20.150 s**, within one 25 ms tick of readiness |
| Opponent first | Opponent recovery **20.250 s**; original human carry terminates; later opponent play continues, no fictional human restoration |
| Teammate first | Teammate recovery **20.275 s**; original instruction terminates; its later goal-line exit is retained as negative continuation evidence |
| Touchline exit | Real raw ball crossing, away throw-in at **20.025 s**; no on-ball menu and no old carry |
| Unreachable fast ball | No manufactured recovery; actual goal-line crossing and away goal kick at **21.625 s** |
| New close defender during pursuit | Immediate `major_pressure` movement-only decision at **20.000 s**; world-space movement selection consumes the old carry without moving the ball |

The sprint's first contact does not guarantee retained possession or instantly open an ordinary menu. The 4 m route uses the existing geometry-gated acquisition pathway; its recovery is not falsely presented as a finite impulse receipt. Failed/loose continuations, deflections, rival contacts and recovery by each team are represented independently in the receipts and existing contact regression suites.

For the unchanged prescribed physical continuation, **all 140 consecutive body/ball/contact/recovery frames have the identical before/after SHA-256** `a128d95d1c5b78c0d3f3bae0fc1268fe79d1876eba3364074e5ebc5b466bd08d`. This diagnostic comparison bypasses the pause observer in both editions only to compare the executor. It is explicitly separate from the real agency traces, which stop at the decision. No physical acceleration, slowdown, turn-speed, reach, grass, elasticity or kick-impulse coefficient changes.

## Compatibility, pause, replay and presentation

The supplementary [action execution audit](performance/pr210/action-execution.json) attempts **all 77 offered ordinary actions** across the three resulting on-ball boundaries in cloned canonical states: 77 produce the expected release or committed intention, with an available physical contact window. Carry/hold are recorded as intentions rather than fabricated touches. The [separately hashed method](performance/pr210/action-execution-method.mjs) repeats this result with `--check` and checks source identity before and after.

Live regression tests cover first-time pass/shot preparation, incoming control and directional touches, manual defensive actions, off-ball movement, restart selection, goalkeeper responses and routine AI continuation. Forecast first-time enumeration explicitly requests `incoming_preparation`; it is not mistaken for a current owned-ball action.

The selected decision freezes the entire canonical state across repeated steps. `projectMatchMoment.detectedAt`, the opportunity's `openedAt` and the current physical state agree; repeated observational projection does not mutate it. Existing presentation lead-in uses render history while the authoritative opportunity remains frozen. The career component shares the sandbox runtime and persistence transaction. Valid intent survives schema-validated JSON reload with identical continuation; replaced/terminated intent does not return. Restart and timekeeping regressions are preserved.

Some older tests demanded a menu during foot recovery or assumed a prompt must occur before an eventual loss. They now assert the physical boundary: the exact PR171 stride genuinely recovers/touches then loses the ball without requiring a fictional intervening menu; the retained-ball pressure scene observes contested state during recovery and later offers a playable support outlet. Telemetry reference hashes remain unchanged; no frozen receipt is rewritten.

## Calendar — Gate E

Existing negative controls also run real 25 ms canonical glancing-contact/boundary continuations (`pr172Rebounds.test.ts`), loose spin/vertical/competing-body continuations (`pr159ReboundIntegration.test.ts`) and finite failed reception (`pr190Reception.test.ts`). These are supplementary controls, not additional successful recoveries invented for the primary eight scenes.

The local calendar previously captured today's date only in `useState` initializers. It now derives the visible date/month from the authoritative date while following today. Manual day/month navigation exits that mode; `Dziś` restores it. Four React tests cover day/month/year changes, deliberate browsing, arrows and focus, including preserving focus on the `Dziś` button. No career progression, fixture date, event history or stored fact changes.

## Verification and performance

Final normalized production/harness/configuration fingerprint: `8bfc326a81b5cb33a6531c7abe484fbb2feae02b0316ade88baae446618d30ba`. The original before edition is merged main plus the exact shared laboratory files preserved in [before-source.json.gz](performance/pr210/before-source.json.gz). The final guarded exact replay reproduces the same after result hash; verification records bind those measurements and their logs to this source.

| Final local gate | Result |
| --- | --- |
| `npm run verify` | **PASS: 2569/2569 unique tests**, lint, TypeScript and production build |
| Test groups | 2504 unit, 56 integration, 4 career-contract, 5 full-career cases; no skipped-case substitution |
| Native verification context | Node 24.22.1, 256 MiB young-generation setting, as in the prior PR209 local run; assertions/timeouts unchanged |
| Source-bound history | PR198/203/204 original source checks; PR205–209 original checks/replays PASS |
| Current compatibility gates | Authority/information boundary, PR205/206 contracts, five CI contracts, manifest/workflow, corruption rejection and realism register PASS |
| Exact development replay | Paired result hash repeats; all 77 offered-action requests repeat |
| Representative interactive smoke | **Full time**, 228427 canonical ticks, 12 explicit test-driver choices, t=5710.675 s; source matches the final binding |

The final smoke records wall 240.723 s, CPU 259.828 s and peak RSS 585532 KiB. It is one representative B/right-back test-driver match, not a new policy matrix or an empirical career calibration. Hosted CI is assessed independently on the published commit; this table reports completed local checks. Earlier failed/interrupted attempts remain separately archived and are not counted as passing verification.

Exact command statuses and archived logs are recorded in [verification](performance/pr210/verification.json). The final source binding and reconstructible delta archive are in [source.json](performance/pr210/source.json). `scripts/checkPr210Evidence.mjs --check --replay` verifies paired receipts and repeats the current experiment exactly.

One paired laboratory measurement recorded before/after wall **1.873 / 1.741 s**, CPU **2.625 / 2.469 s**, peak RSS **366232 / 382260 KiB**, and 1000 repeated probes **0.192 / 0.153 s**. These single-process development measurements include different trace lengths; they do not establish a speedup or a general memory regression. The added work is bounded by the existing player set and pursuit forecast; no growing cache or persistent planner is added.

The existing consolidated manifest retains **28 jobs, 124 historical commands, 144 explicit cases and 63 historical full-match executions**. PR210 adds its focused checks inside the existing main job and normal unit suites. Historical source checks use their original code, receipts and profiles. Raw historical Git bytes are protected against Windows newline conversion; temporary replay trees are excluded from ESLint so archive cleanup cannot race file discovery. No broad WW/SS/SW matrix or confirmation run is introduced.

The [single full-match smoke receipt](performance/pr210/interactive-smoke.json) states its exact source, policy, terminal state, choice count and CPU/memory. It uses an explicit deterministic test driver with human agency enabled; it is **not a claim of a manual browser career playtest**.

Reproduction entry points (Node 24, installed locked dependencies, full Git history):

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/checkPr210Evidence.mjs --check --replay
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs docs/performance/pr210/action-execution-method.mjs --check
node scripts/ci/replayPr209Check.mjs --replay
npm run verify
```

To recreate the before arm, export the stated merged-main source and materialize the two exact laboratory files in `before-source.json.gz`, then run `scripts/benchmarkPr210.mjs --arm=before`. The before and after share their initial canonical states and seeds; no favourable resampling is used.

## Release readiness, limits and PR211 handoff

The durable [release-readiness backlog](RELEASE_READINESS_BACKLOG.md) preserves every career-playtest item, scope, priority, acceptance criterion and useful dependency, including the user-reported 25-season right-back career. Only agency correctness and the independent calendar fix are implemented here.

The constructed checkpoint is not the unavailable user save. A local recovery cannot certify all high-ball, glancing-contact, goalkeeper or empirical realism mechanisms. Existing legacy acquisition/release abstractions are not redesigned. The maintained PR201 candidate's mechanism selections/checksums stay unchanged; a human lifecycle correction is not evidence that historical interactive trajectories must remain identical. Frozen historical replay sources retain their original contracts. Independent confirmation remains sealed and no assumption is marked COMPLETE.

**PR211:** persist a prepared intentional strike in the existing canonical executor; coordinate real moving body/ball segments, earliest competing player contacts, boundaries/restarts, cancellations and genuine misses. Reuse PR209's finite temporal primitive only after that lifecycle is lawful. Do not perform an offline mini-match inside synchronous action resolution, grant remote contact or promote `temporal-contact-dev-v1` merely because these agency gates pass.

The handoff order is:

1. Bind prepared strike state to the selected actor, ball episode and human/NPC intention; invalidate it on replacement, another touch, restart or loss of physical participation.
2. Derive body/foot and ball segments inside the same 40 Hz step, then arbitrate the earliest real contact against competing players and boundaries.
3. Preserve real no-contact outcomes and cancellations, with no automatic possession or invented impulse; retain the existing physical edition/profile identities.
4. Verify moving approach/departure/crossing, competing touch, boundary, cancellation and genuine miss cases, plus human anticipation and exact save/replay continuation, before considering live promotion.
