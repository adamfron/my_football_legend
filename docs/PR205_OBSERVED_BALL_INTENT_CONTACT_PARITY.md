# PR205 — Observed ball intent and physical contact parity

## Decision and scope

**RETAIN_EXPERIMENTAL; whole MatchEngine NOT_READY_FOR_PROMOTION.** Base is merged PR204, `372a2fda0b59a54706c6e11e63ef88ada48380a1`. PR201 `realism-candidate-v1` remains the maintained candidate, B remains the default policy, canonical time remains 40 Hz, all 28 attributes remain, and independent confirmation stays sealed. No full-match integration gate is claimed or entered.

Research change: the separately selected `prospectiveMovement: observed-ball-contact-dev-v1` inherits PR204 local reception/continuity and repairs the demonstrated loose-race selector, outfield low-ball contact routes and a physical handoff that discarded spin. The historical `two-pass-v1`, `two-pass-continuity-dev-v1`, all existing profiles and their checksums remain selectable with their previous behaviour. This adds no integration profile or planning architecture. The maintained candidate is unchanged.

Local result: equal lawful recovery evidence no longer changes the audited movement command when hidden event metadata changes. Real optically acquired recoveries still reach finite contacts. Paired clear low-foot contacts agree for teammate and opponent routes. The already-active continuous-body route still fails parity and remains NEEDS_REPAIR. Reception regression results remain weak/mixed: the fixed-release corpus has no gain in direct control or retention, and the selected endogenous support corpus still loses controls against PR203. Integration effect: **unchanged for the maintained candidate; experimental local repair with remaining dependencies**.

## Baseline and source identities

Read together with [PR203](PR203_SITUATIONAL_AWARENESS_PROSPECTIVE_PLAY.md), [PR204](PR204_INTENT_CONTINUITY_COGNITIVE_TECHNICAL_RECEPTION.md), the frozen PR204 loose-race counterfactual and [open-case forensics](performance/pr204/open-regression-forensics.md). Historical PR195–204 evidence and source archives are unchanged.

The frozen PR204 example at t=10, player (62,38), target/ball (66,38), identical bodies and observations, produced **jog / maintain_shape / 3.65 m/s** with `travelKind: pass` and **sprint / loose_ball_race / 8.51 m/s** without it. This is a causal selector counterfactual, not a natural-match frequency estimate.

PR205 repeats that mechanism with an isolated actor at (50,34), ball (54,34). `baseline-final.json.gz` was executed in an isolated export of merged PR204 with only the two final laboratory files added. Its manifest `28a395c9e8a2186324b3bf49e5dbb32538e1086ca469d5c05d25b2b383cfb5c2` matches every original file in the maintained PR204 binding; `baseline-source.json.gz` supplies the two added files against the merged base. It reproduces the same 3.65/8.51 distinction, including unseen/stale-ball negative controls.

Final current source is bound by [current-source.json](performance/pr205/current-source.json), fingerprint `81936c1d77e61e3cfc5827334849647a4af2a602f8ba8fcea19f63ea7a621e69`. Every `source-*.json.gz` is a compact reconstructible delta against the merged base, with normalized file hashes and exact changed text. No duplicate historical full source archive is generated.

`development-final`, `recovery-final` and `receiving-final` were measured on `0e41d14f…`; `support-final2` on `c2e0cc56…`. These source archives are retained. Subsequent changes repaired JSON replay comparisons, added the evidence checker/CI wiring, and restricted finite recovery to explicit low-ground entry points. The last restriction prevents the shared possession function from changing aerial-claim handling; a canonical airborne-opponent checkpoint equals the historical executor. All four receipts replay with exact serialized rows/results after this scope correction (`replay-scoped-proof.json`). JSON comparison intentionally follows the saved contract: it represents −0 as 0 and omits undefined object properties. It does not round any finite nonzero number, omit failed cases or replace physical hashes. The signed-zero comparison failures and scratch-directory lint/test-discovery failures are retained in verification logs. Historical source exports must finish before running repository-wide lint or Vitest discovery; concurrent discovery briefly selected temporary historical test paths that were then cleaned up.

## Acting information versus physical truth

| Consumer | Audit and treatment |
| --- | --- |
| `locomotion.ts` loose-race selector | Historical branch reads authoritative owner, `travelKind`, `looseSince` and geometry. New revision requires an existing `BallMovementPlan`, its real observation timestamp, a recovery/contest intention and agreement with the selected target. Coincidence with hidden physical ball coordinates cannot create this plan. |
| `localReception.ts` | Recovery consumes existing optical belief and fresh direct body sightings, own body/capability and own motor recovery deadline. Both position and motion evidence must be no more than 0.5 s old and never in the future. Nearby observed control yields to ordinary press/duel authority; two nearer observed teammates suppress an additional recovery. The existing local movement estimator must find low contact within 2.5 s and the observed ball must be within 15 m. These inherited/local thresholds are development assumptions, not empirical calibration. |
| `matchSimulation.ts` movement | Deliberate observed reception takes precedence over recovery. The recovery proposal enters the existing bounded movement authority. Human movement/control, carry, defensive challenge, keeper and restart authorities retain priority. Sprint uses the existing locomotion projection, tempo, capacity, acceleration and braking. No position or velocity is assigned by the recovery proposal. |
| `liveBallFlight.ts` / `boundedPerception.ts` | Existing optical acquisition, real evidence clocks, occlusion and uncertain belief are reused. No release target, physical velocity/spin or event label is copied into recovery evidence. Prediction does not refresh observation age. No production observation is fabricated. |
| `situationalAwareness.ts` / `receivingPositions.ts` | Existing inference/leases and local incoming-plan priority are retained for both development revisions. No new tactical state store or recognition architecture is added. |
| `passReception.ts` / `firstTouch.ts` | Incoming physical velocity/spin, body geometry and actual pressure are legitimate resolver inputs at contact. The new revision inherits PR204's exclusion of hidden release preparation relief. A player's deliberate carry/first-time selection can legitimately change an impulse; the counterfactuals hold that choice fixed. |
| `passClaimResolver.ts` / acquisition | A low physical segment nominates an actually reachable, legally eligible foot. New outfield routes respect native motor recovery and participant eligibility. Acquisition nomination is permission to attempt the native impulse, not secure possession. |
| `ballContactResolution.ts` / native body | Physical separation and continuous-body support consume actual contact geometry and relative motion. They have no event-label input and remain unchanged. High body-v1 pass/cross contacts are checked in the canonical executor separately from foot contact. |

This is a scoped repair, not a claim that all existing full-world tactical controllers are observation bounded. `travelKind` still appears in physical flight dispatch, diagnostic/event bookkeeping and planning scheduling. Historical own-touch/carry, broad tactical/spatial and high-ball routes remain separate audit scopes. Their truth-reading inputs are not relabelled as lawful observations by this PR. Identical *future observations* are not assumed after other actors' trajectories diverge.

## Laboratories A, B and E: recovery decisions and continuation

In `development-final`, the same actor/ball/history is paired with `pass`, `cross` or no label:

| Evidence / selected target | Old PR204 selector | New revision, all three labels |
| --- | --- | --- |
| Unseen ball; tactical target happens to coincide | jog / jog / sprint | jog, 3.65 m/s |
| Actual recent optical motion and selected recovery target | jog / jog / sprint | sprint, 8.51 m/s |
| Observation older than 0.5 s | jog / jog / sprint | jog, 3.65 m/s |
| Ball remains above playable height throughout local horizon | jog / jog / sprint | jog, 3.65 m/s |
| Wrong tactical destination | jog / jog / jog | jog, 3.65 m/s |

Unit counterfactuals additionally change authoritative position, physical velocity, intended recipient and release target while preserving the local evidence and avoiding physical collision. Actual integrated actor position, velocity, target, facing and intensity remain equal. The first acceleration stays finite. Tests cover future evidence, observed nearby opponent control, existing defensive challenge, explicit human destination, restart, inaccessible height/reach, save validation and deterministic continuation.

`recovery-final` runs six ordinary 200-tick continuations, two roles × three labels. **No belief is injected**: the ordinary optical adapter must acquire the ball. Both roles first see it at 10.025 s and first infer recovery at 10.175 s. The actual actor mode also becomes `loose_ball_race` at 10.175 s in all six runs; this is an accepted motor command, not merely an observer's proposal. The teammate controls at 11.125 s and carries at 11.400 s; the opponent controls at 11.250 s and carries at 11.525 s. All six retain team possession one second after control. Every physical frame, evidence clock, locomotion target/mode, acceleration vector, real contact witness and subsequent action is retained. These are six deterministic trajectories from two constructed role geometries, not six independent football samples or a recovery success rate.

## Laboratories C and D: contact parity

The triples hold ball position, velocity, spin, height, body, facing, motor recovery, possession/collision state, seed and canonical time fixed; only the historical label changes. Within each role, direct contact completion, continuous foot access and one-step canonical execution agree for all three labels at 6, 18 and 30 m/s. There are 18 paired route/role/speed groups (54 labelled executions). The role itself is not asserted interchangeable: actual attributes, pressure and legal permissions can differ.

Before repair, teammate direct contact already used PR204's finite foot resolver, but the canonical free-ball path waited through a separate acquisition route. The opponent route could replace the incoming ball with a stationary owned ball after its interception lottery, so even 18/30 m/s contacts had ownership and no native foot witness. The new revision routes eligible continuous low deliveries/free balls and ready acquisition attempts through the same finite impulse. **At 18 and 30 m/s both roles leave a genuinely loose ball with an executed foot contact; at 6 m/s they can retain control.** A difficult opponent touch does not record a turnover until control really occurs. Deflection bookkeeping retains the preceding team's pass/loss context.

For example, direct opponent contact at incoming (18,1,0) m/s now has outgoing approximately (13.60255,0.73640,0) m/s for every label, with no owner. The historical route instead granted ownership with no velocity/foot impulse. Full precision, spin, selected surface, quality, actual pressure and contact geometry are in the receipt. These deterministic comparisons do not calibrate the impulse model.

Actual first-time action selection uses the same low-contact executor for the three labels; an explicit selected action remains intentional rather than an automatic possession award. Throw-in contact eligibility and offside adjudication remain authoritative. High/distant balls do not manufacture foot contacts. The existing collision race still determines which actor reaches a contact.

Finite recovery is explicitly nominated only by the finite-control apparatus, continuous ground contact, stationary ground claim and ready loose-ball acquisition. Other shared possession callers, including aerial claims, do not opt into the new foot path. Opponent first-time option generation remains inherited interception policy; this audit does not establish equal tactical option menus for the two roles.

A second causal defect appeared during the real recovery continuation: ending an unclaimed slow delivery called a two-dimensional handoff that discarded height and spin without a collision. At 10.250 s the labelled arm had lost its height/spin while the otherwise equivalent free arm retained z=0.11 and spin z≈1.09762. The new low-ball handoff preserves the canonical physical fields. Pilot `recovery-v1` retains the discrepancy; final data contain the repaired continuation. Pilot receipts retain their recorded fingerprints but are exploratory where no complete interim source delta exists; the reconstructed merged baseline and final archives carry the reproducible causal claims.

Native body-v1 contacts at height 1.1 m are separately tested for both teammate and opponent: pass/cross produce equal actual body contacts and rebound, with no foot execution. This does **not** validate high free-ball equivalence, headers or aerial duels. Nine keeper direct-contact controls preserve historical handling across revisions; their pass/cross/free outcomes still differ. Goalkeeper parity and high free-ball/body/aerial dispatch remain **unresolved dependencies**, isolated without forcing them through the ground-foot resolver. Existing swept-segment timing/within-tick allocation is retained; this PR does not establish a new sub-tick collision solver.

### Open continuous-body dependency

`continuous-contact-open-v2.json.gz` deliberately repeats the low 6 m/s case with `continuousBodyContacts: [actor.id]` and a consistent last-touch actor. Complete input hashes after removing only `travelKind` agree within each role. Both teammate and opponent still differ: pass/cross execute a foot contact and retain control, while the free-ball branch preserves continuous body support, starts acquisition and has no new foot impulse on that tick (vx=5.92 m/s). The free low-foot shortcut explicitly excludes already-active body contacts, while the labelled route has different lifecycle handling. **This is a retained parity failure, not a passed contact group.**

Safe repair requires common arbitration between persistent body support, re-arming and an intentional ready foot. Simply removing the guard would bypass an existing physical contact; forcing the labelled branch into delayed acquisition could suppress a valid deliberate reception. PR205 therefore isolates this dependency rather than widening the corrective change. Contact parity is locally demonstrated for the clear-foot triples, and for the separate native body-v1 pass/cross tests; the whole contact lifecycle remains NEEDS_REPAIR. The receipt includes the exact probe text, import paths, source/archive identity and all six results. Its earlier `continuous-contact-open` pilot used post-step input hashes; v2 supplies the verified pre-step common-state identities and is the causal receipt.

To repeat this small open probe, import the three modules listed in its `imports`, create `const rows = []`, execute its stored `harness` in that scope, and compare serialized rows. These are synthetic collision-history counterfactuals, not observed natural-match frequency or promotion evidence.

## Reception regression controls

### Matched released-ball corpus

Twenty identical releases from the maintained PR201 apparatus: five families (short ground, long ground, long lofted, moving lead, cross field) × two sample geometries × unpressured/immediate-pressure, skill fixed at 55. Each release has the same complete release identity and physical ball hash across the PR204 and PR205 continuation. Forty ordinary 320-tick continuations retain first lawful sight, recovery inference, motion/braking, finite contact, outcome, retention, subsequent action and all failures/censors.

| Outcome | PR204 development | PR205 development |
| --- | ---: | ---: |
| Direct receiver touch | 5/20 | 5/20 |
| Direct touch and control | 4/20 | 4/20 |
| Direct touch and team possession at one second | 3/20 | 3/20 |
| Censored outcome | 1/20 | 0/20 |

Moving-lead sample 1/unpressured changes from unresolved null touch/control/retention to confirmed false/false/false. It is a measured negative resolution, not an improvement or an imputed failure in the old denominator. Other known binary outcomes agree, although movement and contact times can differ (short-ground sample 0 under pressure touches 25 ms earlier and still loses retention). One-second team possession is not continuous individual retention or a successful next action. Raw subsequent actions are recorded independently. This is a small, fixed fixture corpus; the pressure factors share seed labels and are not independent samples.

In general corpus telemetry, `firstRecovery` is the first available local proposal sampled by the read-only observer. It does not by itself prove movement authority accepted that proposal: actual locomotion reason and target are recorded separately, and deliberate reception/higher commitments can take priority.

### Selected PR203/204 support failures

Seeds 1, 2, 3 and 5, reading 85, open/pressure, three profiles: 24 scenes. The 16 historical PR203/204 rows reproduce every serialized decision, menu, release and physical outcome in the untouched PR204 decision corpus. Frames add actual C movement, evidence, contact geometry/impulses and pressure context. Deliveries are endogenous and can change before B→C; this is not a same-ball causal comparison.

| Profile, eight scenes each | B→C episodes | Scenes with direct C control | Scenes with direct touch and 1 s team possession |
| --- | ---: | ---: | ---: |
| PR203 prospective | 10 | 5 | 3 |
| PR204 continuity development | 10 | 1 | 1 |
| PR205 observed-contact development | 7 | 3 | 3 |

All sampled episode outcomes are uncensored, while seed 1/pressure in PR205 has **no B→C release** and remains in the scene denominator. PR205 gains open seeds 1 and 2 and pressure seed 5 relative to PR204; it loses PR204's pressure seed 2 control/retention. Open seeds 3 and 5 still fail. Thus it does not restore PR203's five control scenes and does not close the downstream support gate. Examples: seed 1/open B releases 13.375 s in PR204 versus 12.425 s in PR205, so the new C control at 13.375 s cannot be attributed to handling of an identical delivery. Seed 2/pressure changes from control/retention at 14.850 s to no direct C touch after an earlier 12.200 s release; this negative is retained, not explained away as better cognition.

PR204's original `gameReading × firstTouch` negative/inconclusive evidence remains historical. Its assigned observation windows produced zero prospective recognitions and do not establish compensation. **No factorial is repeated in PR205.**

## Cost, verification and reproduction

Windows, Node 24.22.1; laboratory semi-space 64 MiB. Aggregate local costs, with concurrent load and warm/cold filesystem differences:

| Measurement | Wall s | Process CPU s | Peak RSS KiB |
| --- | ---: | ---: | ---: |
| Reconstructed baseline selector/contact lab | 8.495 | 1.328 | 280844 |
| Development selector/contact lab | 0.738 | 0.828 | 291212 |
| Six actual recovery continuations | 2.912 | 3.781 | 307764 |
| Forty matched receiving continuations | 24.882 | 29.907 | 426316 |
| Twenty-four support scenes | 18.614 | 21.796 | 356416 |

These are measurements, not portable budgets or an optimization claim. No paired full-match CPU benefit is established. Evidence is compact rather than a duplicate archive of historical matches.

A 128 MiB semi-space verify attempt passed 2438/2439 unit tests but the unchanged PR151 reactive-tactics test exceeded its 5000 ms budget (5087 ms). Its isolated rerun passed at 3930 ms without an assertion or timeout change. Final full verification uses 256 MiB semi-space; the measured laboratory receipts retain their original 64 MiB setting. Both the timeout and isolated passing log are retained.

**Final local `npm run verify` PASS (exit 0): 2504 tests — 2439 unit, 56 integration, four career contracts and five full-career tests — plus lint, TypeScript and production build.** Runtime/harness source remained `81936c1d…` throughout the final run, with Windows Node 24.22.1 and 256 MiB semi-space. The targeted PR203/204/205 contact/reception/authority and aerial selection also passed 45 distinct tests. The compressed complete log is `performance/pr205/verification/pr205-verify-final256.log.gz` (SHA256 `9e443e02bcff07e41f638c803039da6a1ea3191b4ab2f2bc7bb4432d9d6654e3`); `verification-final.json` records exact source/head/environment/counts. Vite retained its existing large-chunk and mixed-import warnings. The three remote verify groups passed on code head `257043e6…`; full historical-match jobs were still running at this report update. The final documentation/evidence commit must be assessed on its own actual CI head. The consolidated CI layout retains 28 jobs, 124 historical commands and 63 complete matches. PR204's source-bound decision checker now runs unchanged in an isolated merged-PR204 export, like the existing PR201/203 isolation; no receipt identity is silently rebound. New checks stay in the existing main group. No timeout or historical task is removed. The first CI head exposed a stale generated registry hash after adding the PR205 assumptions note; regenerating `REALISM_PROGRESS.json` changes only that hash, with all statuses, counts and evidence mapping unchanged. The failing job log is retained.

Run from the repository root with installed dependencies:

```sh
node scripts/checkPr205Evidence.mjs
node scripts/checkPr205Evidence.mjs --replay
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr205.mjs --contracts
npm run ci:manifest
npm run ci:contracts
node scripts/ci/renderWorkflow.mjs --check
npm run verify
```

Exact recorded continuations are checked in their measured Windows/Node environment; CI paired contracts run within the CI environment. No cross-platform long-continuation equivalence is claimed. To reconstruct a measured source, export the archive's `base`, restore its `contents` paths, verify every normalized file hash against `manifest`, and run the named harness/version in that tree. Record commands refuse overwrite; `--check` compares every serialized result/row, including failures and censors.

## PR206 recommendation

First qualify a **real pre-release recognition interval**, before scheduling a 2×2 study. Use a bounded set of prospective A→B→C scenes with actual visible passer/body preparation and permitted optical history. Require the logged C job's lawful recognition time and its first commanded movement to precede the relevant release by at least two canonical ticks; preserve episodes that fail to qualify, including unseen, stale, marked and withdrawn-support controls. Assigned visibility, prior velocity or an observer's predicted opportunity is insufficient. If no such episode exists, report that dependency and stop the factorial.

Only after qualification, pair `gameReading` 20/85 × `firstTouch` 20/85 within each identical scene/seed and record actual recognition latency, movement, orientation, arrival, contact, control, retention and next action. Separate a recognition/movement phase from an execution phase: use the same reference release and other bodies for the former, and a matched pre-contact body/ball/RNG/time checkpoint for the latter. Keep the existing direct numerical `gameReading` route in receiver readiness separately identified; it is not anticipation. Report paired discordances, censoring and failures, without claiming cognitive compensation unless earlier recognized anticipation actually mediates the physical outcome. Full integration promotion remains a separate gate.

The initial controlled execution cohort must explicitly exclude or separately stratify the unresolved already-active continuous-body, keeper and high free-ball routes, preserving those exclusions. Passing that cognition experiment would not close these physical dependencies.
