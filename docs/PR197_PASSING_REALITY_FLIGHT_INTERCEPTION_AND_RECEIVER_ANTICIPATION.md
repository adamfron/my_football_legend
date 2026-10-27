# PR197 — Passing Reality: Flight, Interception & Receiver Anticipation

## 1. Executive summary

PR197 reproduces the original 28 failed long passes and identifies a physical asymmetry: an opponent's incoming **hold/control** choice could enter `changePossession` above foot height, while a teammate had to satisfy the finite-foot and height guard. The ball could become owned at roughly two metres without a foot reception. An independent, opt-in correction applies the existing guard to both sides. It changes no rating, launch, gravity, dispersion coefficient or success probability.

| Model | Released | Direct touch | Control | Retained | Opponent control | High ownership bypass | Censored |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 28 | 0 | 0 | 0 | 27 | 27 | 0 |
| defence | 28 | 14 | 11 | 8 | 8 | 0 | 0 |
| combined | 28 | 14 | 12 | 10 | 8 | 0 | 0 |

There are three independent experimental booleans: `experimentalDefensiveReception`, `experimentalHeightAwarePassing` and `experimentalReceiverAnticipation`. They are absent by default. `experimentalCanonicalArrival` remains a separate opt-in. A narrow unflagged repair also prevents an out-of-pitch remembered sighting from being parsed as an in-play tactical coordinate.

Seven paired development matches cover WW/SS/SW and B, R3, Opportunity, Hierarchical and Contextual. Aggregate shots are **64 → 67**, with policy-specific regressions. This is not promotion evidence. **Canonical NOT READY; B remains default; independent confirmation sealed.**

## 2. Frozen PR196 baseline

The merged PR196 commit is `81e0457a0fc344cdedaa18d035121cb7fe51bcc2`; its final implementation/report head is `0498cf6bb63d81224493c8a67c232c0980f1b853`. [Frozen manifest](performance/pr197/frozen-pr196.json) records normalized source hashes, all 134 registry identities/statuses, and immutable Git blob identities for PR195/196 evidence. The baseline source fingerprint is `142e32d18ccf2e51a9d04f55ec62bb3d1f5b1a5da9148d5f9c6d85ae09dc0f0a`.

PR195's pilots, PR196's 336 pass requests, 28 original long-pass inputs/factor trials, 360 movement trials, 118 captured states, counterfactuals, seven historical match pairs and negative controls remain untouched. Their earlier 0.306 → 0.004 s held-out positional ETA MAE is consistency with canonical movement, not independent physiological calibration. Their 75 → 67 shots remain negative/mixed historical transfer evidence.

The four historical reproduction commands passed before editing. `benchmark:pr196:check` now exports the exact merged source and runs its original checks; `benchmark:pr196:replay` separately checks current unflagged continuations. No old physics assertion, integration timeout or expected receipt is weakened.

## 3. Registry IDs and dependency scope

Primary: PASS-001/003/004/005/006/007/008/009/010, DEF-003/004 and MEAS-011/012. Scoped secondary findings concern TACT-009 and PHYS-002. Other perception, movement, tactical and performance IDs are dependencies, not silently completed work.

The [register](match-engine/ASSUMPTIONS_REGISTER.md), [dependency graph](match-engine/MECHANISM_DEPENDENCIES.md) and [calibration plan](match-engine/CALIBRATION_PLAN.md) retain I/F/E/T/M/C separation. There are no new IDs and no COMPLETE entries. No global utility, shooting, stamina, goalkeeper or restart rebalance is included.

## 4. Long-pass failure decomposition

The exact seven skill matchups × two PR195 development seeds × two mirrors are regenerated, not replaced by easier inputs. The [baseline](performance/pr197/long-pass-baseline-v6.json.gz), [symmetric-control branch](performance/pr197/long-pass-defence-v4.json.gz) and [combined branch](performance/pr197/long-pass-combined-v5.json.gz) retain initial bodies, requested/actual intended points, desired launch, actual velocity/elevation, dispersion, free-flight forecast, all eleven opponents, receiver targets/facing/momentum, canonical aerial opportunities, actual contact/release witnesses, first control, terminal state and full tick-stream hashes. Body frames are sampled at 0.25 s plus events; exact 40 Hz streams are reproducible.

| Skill A:D | Baseline n/touch/control/retained/opp.control | Defence | Combined |
| --- | --- | --- | --- |
| 20:20 | 4/0/0/0/3 | 4/0/0/0/2 | 4/0/0/0/2 |
| 40:40 | 4/0/0/0/4 | 4/0/0/0/1 | 4/0/0/0/1 |
| 60:60 | 4/0/0/0/4 | 4/4/1/0/2 | 4/4/2/0/2 |
| 80:80 | 4/0/0/0/4 | 4/4/4/2/0 | 4/4/4/4/0 |
| 100:100 | 4/0/0/0/4 | 4/4/4/4/0 | 4/4/4/4/0 |
| 40:80 | 4/0/0/0/4 | 4/0/0/0/1 | 4/0/0/0/1 |
| 80:40 | 4/0/0/0/4 | 4/2/2/2/2 | 4/2/2/2/2 |

Causes overlap. Weak launchers have large physical aim deviations; a successful ideal plan is not an accurate actual release. Opposition can intervene before a receiver's eventual opportunity is observable. Twenty-seven historical episodes show opponent ownership after an aerial contest without the teammate-equivalent foot guard. One original ball leaves play. These observations do not justify attributing every failure to receiver recognition or assigning one exclusive root cause.

The observed guard violation is in [`changePossession`](../src/core/matchSimulation/matchSimulation.ts), reached through `tryIncomingFinish`'s incoming control choice. It is not a defect in the flight integrator. The designated defender is not the entire opposition: every opponent is retained and attribution uses actual contacts/control. Candidate aerial geometry is explicitly separated from executed contact.

## 5. Same-release counterfactual experiments

Eleven branches begin from the identical actually released ball. They vary awareness timing, first-touch ability, initial facing, initial velocity, initial position, one/all opponents' initial geometry, or one experimental mechanism. Every branch asserts the same complete launched-ball hash. Remote opposition continues to move and compete; it is not disabled.

| Same actual release intervention | Touch | Control | Retained | Terminal | Receiver contact time |
| --- | --- | --- | --- | --- | --- |
| unchanged | yes | no | no | control | 12.100 |
| physical_defence | yes | no | no | control | 12.100 |
| bounded_receiver | yes | no | no | control | 12.100 |
| awareness_late | yes | yes | yes | control | 12.925 |
| first_touch_20 | yes | no | no | restart | 12.100 |
| first_touch_100 | yes | yes | yes | control | 12.100 |
| facing_away | yes | no | no | control | 12.100 |
| moving_toward | no | no | no | restart | unavailable |
| receiver_near_flight | yes | no | no | control | 12.100 |
| remote_one_defender | yes | no | no | control | 12.100 |
| remote_opposition | yes | no | no | control | 12.100 |

Changing passer skill or desired trajectory is a separate launch experiment. Initial fixture placement is an intervention at the branch boundary, never a teleport during live play. A failed control remains a failed control even if later autonomous football produces another useful action.

## 6. Launch physics and execution accuracy

[`passLaunchPlan`](../src/core/matchSimulation/passLaunchPlan.ts), [`passExecution`](../src/core/matchSimulation/passExecution.ts), [`matchActions`](../src/core/matchSimulation/matchActions.ts) and the finite-contact modules retain their physical launch rules. [Launch evidence](performance/pr197/launch-v1.json.gz) contains 3840 deterministic error samples across 7/20/42/55 m, ground/lofted delivery, five ability values, twelve seeds and one-factor passing/technique/reading/composure/orientation/weak-foot/fatigue/pressure contrasts.

Ideal target miss, sampled aim error, actual launch energy/direction and unobstructed actual-ball travel are separate fields. Forty selected ordinary live releases are compared with their own physical forecasts. Pure weak-foot distribution probes describe the execution model conditional on a selected foot; they are not a claim that an unreachable opposite-foot contact occurred. Supported first-time passing is also physically requested in the family laboratory.

No universal long-pass accuracy multiplier, extra lead range, perfect release, synthetic rebound or post-release retargeting is introduced.

## 7. Flight prediction accuracy

The forty live comparisons and all original long-pass trials agree with `ballPhysics` until the first canonical intervention: maximum recorded position and velocity errors are zero. This tests the ball that was actually launched, including sampled execution error, against the shared 25 ms integrator. It does not prove real-football drag, restitution, spin response or anatomical contact calibration.

The ideal launch plan and actual release can differ substantially without an integration defect. No flight equation is changed. The player's motor forecast remains an approximation and must not be confused with the exact engineering reference.

## 8. Height-aware interception

[`passInterception`](../src/core/matchSimulation/passInterception.ts) adds a privileged engineering forecast for lofted lane evaluation. It follows the shared 25 ms trajectory, samples bounded candidate times, and shortlists at most three detailed arrival probes per opponent. It records spatial margin, height-eligible margin, point/time, contact family and whether an existing jump is scheduled. It stops at the first pitch exit, rather than passing an off-field point into an in-play ETA schema or clipping the ball back onto the pitch.

[Interception controls](performance/pr197/interception-v2.json.gz) cover ground, above-foot, descending, aerial access, late jump, adverse facing, acceleration, two opponents, overhit request, outside-foot geometry and a strong aerial opponent. [Aerial controls](performance/pr197/aerial-controls-v2.json.gz) preserve actual autonomous header redirects in B, R3 and legacy play. Bounded O/H/J retain their existing incoming control-only restriction; no privileged first-time ranking is injected into them.

The forecast grants neither disruption nor ownership. Foot access and the legacy aerial envelope are distinct; the 0.65–1.45 m unsupported control gap is not labelled chest/thigh control. Existing `verticalJump` states are advanced, but a new autonomous takeoff is not invented. The fallback aerial envelope, approximate ETA, omitted body collisions in forecasts and goalkeeper handling remain calibration blockers. `detailedProbes` records the shortlisted probe budget; cheap bounds can avoid an actual ETA call.

The bounded `opportunityWindows` path still describes its native ground deliveries. Its height-aware lofted consumer is blocked by candidate/information scope; it is not silently replaced with the engineering world model.

## 9. Receiver anticipation

The opt-in receiver adapter reuses [`observeReceptionBall`](../src/core/matchSimulation/ballOrientedMovement.ts) and the existing `planBallOrientedMovement`. An actual sighting's time is preserved; unknown spin is not refreshed from authoritative state. An absent/stale sighting cannot supply a new reception target. The receiver updates a local meeting objective from observed position/velocity, own movement capability and finite awareness, with normal acceleration, turning, braking and contact resolution.

The prepared continuation comes from the existing bounded plan rather than the omniscient run-on projection. Incoming orientation uses observed velocity. Hidden destination, hidden opponent ratings and a changed unseen actual ball do not change the pure receiver forecast when its observation is fixed. The integrated movement override additionally requires a separately persisted `observedContactPoint`; a local forecast that finds no contact clears that point and cannot borrow the old release-time engineering target. The privileged run-on is cleared even when no local meeting point exists. Explicit tests cover this no-fallback rule, schema persistence, updated motion, missing observation, stale observation, hidden spin and independent switch persistence.

This does not certify every existing off-ball/aerial/formation controller as bounded. The motor forecast is approximate, and the original expected-arrival clock/physical preparation can still disagree with its revised spatial objective. These are measured follow-up questions, not a reason to grant instantaneous movement or guaranteed control.

## 10. Physical receiving readiness

The existing PR191/192 first-touch apparatus is reused for 120 trials: stationary, toward, across, away, behind, fast low, bounce, rising/uncomfortable height, aerial, descending, pressure and late preparation, at five genuine weak/strong bands and two seeds. [Readiness evidence](performance/pr197/readiness-v1.json.gz) retains finite-surface contacts, incoming/outgoing velocity/spin, actual versus requested surface, body state, later control and continuation metrics.

| Condition | n | Actor contact | Later control | Defender contact |
| --- | --- | --- | --- | --- |
| ground | 10 | 10 | 10 | 0 |
| toward | 10 | 10 | 10 | 0 |
| across | 10 | 8 | 8 | 0 |
| away | 10 | 10 | 10 | 0 |
| fast_low | 10 | 10 | 8 | 0 |
| rising | 10 | 10 | 10 | 0 |
| flat_aerial | 10 | 10 | 10 | 0 |
| descending_thigh | 10 | 10 | 6 | 0 |
| bouncing | 10 | 10 | 10 | 0 |
| behind | 10 | 10 | 10 | 0 |
| late_preparation | 10 | 10 | 10 | 0 |
| pressure | 10 | 10 | 10 | 10 |

These are prescribed laboratory objectives, not autonomous tactical success. Experimental chest/thigh surfaces in that apparatus are not enabled in the full-match cohort. A requested thigh touch can be blocked by another actual surface; no foot action is relabelled as a chest reception. Touch, cushioning/deflection, control and a later team-possession endpoint remain different events.

## 11. Direct touch, control and retention prediction contracts

New PR197 receipts explicitly use **`original-delivery-v3`**. Versions 1 and 2 retain their historical ordering. Version 3 records an actual header or incoming first-time release, credits its genuine physical contact, then ends the incoming delivery. A new pass/shot without such an incoming-contact witness still terminates before credit. A later control from a headed/redelivered ball cannot rescue the original request. Contacts are timestamp-ordered. The initial first-time release is excluded by the original release-time boundary.

Three direct-path diagnostic claims are compared: direct intended-receiver touch; direct touch followed by original-delivery receiver control; and that controlled path with own-team possession one second later. The existing completion estimate, existing quality-to-control map and existing recovery factor define these **unfitted historical claims**. Deflected routes remain separately observed; unrelated heuristics are not promoted into a calibrated probability model.

The family experiment contains 1100 requests: 220 per model, comprising 180 ordinary releases and 40 physically rejected remote/high-contact requests. Rejection is not failed completion, and subsequent autonomous actions do not rescue it. Forecasts are taken from the executor's ideal selected launch before sampling technical error; the request-target forecast is retained separately because a moving-run projection can change the intended meeting point.

| Model/event | Eligible | Mean claim | Observed | Bias | Brier | Log loss | Descriptive Wilson95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline/touch | 180 | 0.661 | 0.889 | -0.228 | 0.253 | 0.870 | 0.835–0.927 |
| baseline/control | 180 | 0.557 | 0.711 | -0.155 | 0.191 | 1.325 | 0.641–0.772 |
| baseline/retained | 180 | 0.545 | 0.594 | -0.049 | 0.208 | 0.948 | 0.521–0.663 |
| defence/touch | 180 | 0.661 | 0.889 | -0.228 | 0.253 | 0.870 | 0.835–0.927 |
| defence/control | 180 | 0.557 | 0.711 | -0.155 | 0.191 | 1.325 | 0.641–0.772 |
| defence/retained | 180 | 0.545 | 0.594 | -0.049 | 0.208 | 0.948 | 0.521–0.663 |
| height/touch | 180 | 0.661 | 0.889 | -0.228 | 0.253 | 0.870 | 0.835–0.927 |
| height/control | 180 | 0.557 | 0.711 | -0.155 | 0.191 | 1.325 | 0.641–0.772 |
| height/retained | 180 | 0.545 | 0.594 | -0.049 | 0.208 | 0.948 | 0.521–0.663 |
| receiver/touch | 180 | 0.661 | 0.856 | -0.195 | 0.225 | 0.748 | 0.797–0.899 |
| receiver/control | 180 | 0.557 | 0.683 | -0.127 | 0.178 | 1.155 | 0.612–0.747 |
| receiver/retained | 180 | 0.545 | 0.644 | -0.099 | 0.141 | 0.879 | 0.572–0.711 |
| combined/touch | 180 | 0.661 | 0.856 | -0.195 | 0.225 | 0.748 | 0.797–0.899 |
| combined/control | 180 | 0.557 | 0.683 | -0.127 | 0.178 | 1.155 | 0.612–0.747 |
| combined/retained | 180 | 0.545 | 0.644 | -0.099 | 0.141 | 0.879 | 0.572–0.711 |

Probability bins, clipped log loss (epsilon 1e-12), bias, Brier score and skill/family strata are in [summary](performance/pr197/summary.json). Ninety released cases per model use separately named development-evaluation seeds. Mirrors, skill/geometry reuse and shared seeds are dependent; Wilson intervals are descriptive, not nominal independent confidence guarantees. No parameter is fitted on this catalogue. A good pooled number cannot close E/T/M/C.

## 12. Attribute sensitivity

The launch catalogue varies one relevant attribute at a time while retaining other passing attributes at 80 and opposition at 60. Bands are 20/40/60/80/100. Body orientation and pressure contrasts are physical constraints, not extra ratings. Homogeneous weak/strong family/readiness profiles and the original mixed 40:80/80:40 inputs provide complementary contrasts. First-touch-only released-ball branches preserve the same launch.

The unbounded Gaussian execution tails remain: weak players are not prohibited from good connections, and elite players are not guaranteed accuracy. The sample is too small to calibrate rare tails or real squad distributions. Fatigue, foot preference and pressure are not retuned to manufacture pass completion.

## 13. Positive and negative laboratory findings

The old high-control asymmetry is reproduced and isolated. Genuine defensive headers remain possible; direct touches can still produce heavy/failed control. Original bad long releases, opposing interventions, out-of-play balls, late awareness, poor first touch, adverse motion, rejected contact requests and unresolved branches remain in the evidence.

The broad family catalogue does not reproduce the same defensive-guard effect as the original 28: geometry matters. Receiver anticipation can reduce direct touches/control while improving one-second retention. In the same 180 released family cases, the final no-fallback gate changes receiver/combined control 121→123 and retention 112→116 relative to the retained pre-gate families-v4 receipt; direct touches remain 154. The baseline has 160 direct touches and 128 controls, so this local gain does not erase the regression. Height-aware prediction can change a lane estimate without changing the winning policy action. None is automatically an improvement.

Exploratory first-time v1 requests omitted incoming-delivery context and were rejected; v2 corrected that apparatus. Later probability receipts distinguish requested versus actually selected launch forecasts. Early source-archive creation had a write race; atomic publication fixes it. A pre-fix full-match baseline and a new forecast exposed two boundary-schema failures; immutable failing states, stacks and successful regressions remain. Final integration review also exposed a receiver fallback: when the local forecast returned no contact, the old engineering point could still drive movement. The explicit observed-point gate fixes it; affected laboratories and all seven experimental full matches are rerun without changing their seeds. Duplicate exploratory body traces are represented by hashes, compact outcomes and equivalent final tick-stream hashes, with representative final traces retained.

## 14. Autonomous diagonal-run benchmark

The winger starts standing, wide of two defenders, with one poorly oriented opponent. The existing role/opportunity controllers, passer and both teams act autonomously for twelve seconds. There is no guaranteed pass, initial diagonal velocity, scripted defensive error or demanded goal. Eleven initial variants × five policies × two seeds produce 110 runs.

| Actual stage | Runs /110 |
| --- | --- |
| recognisedOpportunities | 69 |
| runs | 110 |
| diagonalRuns | 104 |
| passerObserves | 108 |
| candidate | 43 |
| loftedCandidate | 4 |
| selected | 46 |
| autonomousLoftedRelease | 0 |

Recognition is an actual receiving-position proposal, not inferred merely from movement. The initial midfielder's sightings, candidate generation, selection, preparation, actual releases/offside snapshots and both teams' motion are retained. A moving body can be making an ordinary shape adjustment; it is not automatically recognition of the desired attack.

The complete lofted causal sequence is **NOT ELICITED**, not passed. B/R3 candidate inspection is explicitly full-world; O/H/J use their bounded menu. Poor delivery/slow runner are initial negative conditions, not forced overhit/unreachable outcomes. The unseen/stale variants record actual later sightings rather than assuming the runner remains unseen. A lawful moving-run free-kick sequence is deferred under REST-004/009/012 and TACT-002/004; no new set-piece system is claimed.

## 15. Candidate-generation audit

Fifteen first captured PR196 baseline development states are selected without reading outcomes. Native bounded scenes/menus remain identical under the engineering switches. B/R3 winners do not change in this sample; forced physical continuations of available winners are retained. This is a negative finding, not evidence that every policy's action menu is complete.

Twenty controlled boundary cases separately inspect observed eligibility, B/R3 menus and actual ordinary requests from 21 to 69 m. At 36 m, one observed, physically controlled case is absent from the bounded menu after observation jitter/range admission. At 69 m, both supplied requests reach control while the B/R3 receiver family is absent beyond its fixed range. At 37–55 m the receiver is outside the bounded sight range: a full-world physical success is not relabelled as knowledge the passer possessed.

These are structural examples, not a mandate to standardise all policies or raise range globally. B/R3 2–68 m, bounded 2–36 m, observation restrictions, candidate caps, ideal-plan feasibility, ranking, preparation, actual release and final reception remain separate. No candidate gate is broadened in PR197.

## 16. Corrections implemented and rejected hypotheses

| Finding | Scoped action | Preserved boundary |
|---|---|---|
| Opponent incoming control bypasses teammate-equivalent foot/height guard | Separate experimental symmetric guard | Real headers, opponent ratings, canonical contact and failed controls remain |
| Loft risk treats ground projection as intervention access | Separate experimental height/time forecast | No ownership or bounded-world privilege |
| Receiver objective can use authoritative flight/initial destination, including a no-contact fallback | Separate local observed motor adapter and explicit observed-contact admission | No engineering fallback, teleport, exact future landing point or perfect-control bonus |
| Header/first-time release can inherit the old episode's later outcome | Version 3 measurement contract | Frozen v1/v2 definitions and physical trajectories preserved |
| Out-of-pitch memory parsed as in-play tactical point | Represent that tactical point as unavailable | Physical sighting and ball unchanged |
| Off-field forecast sample passed to in-play ETA | End forecast at first pitch exit | No trajectory clipping or physics relaxation |

The actual-ball integrator defect is not reproduced. No universal launch correction is made. A general candidate redesign, autonomous jump scheduler, all-policy first-time menu, action-value rebuild, shooting or restart redesign is not implemented merely because it could improve a statistic.

## 17. Policy decision changes

The frozen fifteen-state audit changes no B/R3 winner and no bounded menu/scene. It therefore does not demonstrate a newly chosen progressive pass or a better cautious/aggressive choice. Before/after full menus and physical continuations remain available in the candidate receipt.

The controlled height contrasts show changed interception estimates and distinguish overflight from descending/aerial opportunity. The receiver contrasts show different meeting objectives from changed permitted observations. A changed rank or contact count is not itself validation. Native bounded incoming decisions still select control first; this is a named remaining candidate/decision limitation, not a privileged forecast injection.

## 18. Full-match development results

Fresh, preselected development seeds retain the five pathological configurations plus WW/R3 and SW/Contextual. Both cohorts use the same PR194 experimental recovery/restart/perception/position/tempo/transition/clearance settings, with canonical arrival **false** in both. Only the three PR197 switches differ. Successful source-bound v1/v2 records and failures are retained. All seven experimental cases are rerun as v3 after the explicit observed-target gate; baseline selection retains the successful original source-bound runs. No seed is replaced to obtain a better score. File version v3 and outcome-contract version3 are separate identifiers.

| Pair | Attempted/completed baseline → combined | Shots | Score | In-play min | Wall s |
| --- | --- | --- | --- | --- | --- |
| SS/O | 1503/781 → 785/400 | 2 → 2 | 0–0 → 0–0 | 83.1 → 85.3 | 610.6 → 633.3 |
| SS/B | 2012/1477 → 2116/1568 | 4 → 5 | 0–0 → 1–1 | 78.4 → 81.6 | 460.9 → 596.1 |
| SW/J | 1055/491 → 1128/512 | 27 → 28 | 10–0 → 13–0 | 84.4 → 85.9 | 651.5 → 799.2 |
| SW/B | 1486/1006 → 1457/1026 | 13 → 17 | 3–0 → 5–1 | 83.6 → 81.0 | 536.5 → 583.1 |
| WW/H | 894/355 → 889/349 | 3 → 2 | 0–1 → 0–0 | 85.4 → 83.2 | 608.5 → 760.0 |
| WW/R3 | 615/428 → 620/408 | 11 → 13 | 2–2 → 0–2 | 82.6 → 82.9 | 571.6 → 662.3 |
| WW/O | 1031/371 → 1011/362 | 4 → 0 | 0–1 → 0–0 | 86.0 → 84.6 | 656.6 → 721.3 |

Non-restart released-delivery metrics (control can follow an intervening deflection; it is not restricted to the direct-touch path in this table):

| Pair/model | Releases | Direct touch/control/retained | Opp.contact/control | Disruption/censored | Ground/lofted/long/progressive | Lead/through | v3 changed attributions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SS/O/combined | 761 | 345/349/160 | 321/244 | 0/0 | 761/0/26/164 | 0/252 | 0 |
| SS/B/baseline | 1926 | 1267/1132/424 | 441/317 | 19/0 | 1818/108/25/467 | 0/190 | 187 |
| SS/B/combined | 2050 | 1321/1225/390 | 459/365 | 7/1 | 1925/125/34/467 | 0/178 | 128 |
| SW/J/baseline | 1004 | 439/451/246 | 459/328 | 0/1 | 1004/0/62/229 | 0/410 | 0 |
| SW/J/combined | 1073 | 414/433/217 | 504/347 | 0/1 | 1073/0/59/233 | 0/437 | 0 |
| SW/B/baseline | 1419 | 848/769/427 | 381/277 | 22/1 | 1271/148/94/293 | 0/127 | 140 |
| WW/H/baseline | 860 | 365/379/271 | 392/288 | 0/2 | 860/0/28/146 | 0/241 | 0 |
| WW/H/combined | 848 | 327/367/225 | 397/281 | 0/0 | 848/0/43/154 | 0/260 | 0 |
| WW/R3/baseline | 555 | 369/376/347 | 123/101 | 0/1 | 554/1/10/88 | 0/1 | 29 |
| SS/O/baseline | 1446 | 655/662/331 | 616/484 | 0/0 | 1446/0/53/272 | 0/454 | 0 |
| SW/B/combined | 1368 | 840/798/439 | 337/262 | 8/0 | 1217/151/81/277 | 0/89 | 93 |
| WW/O/baseline | 1008 | 373/396/250 | 513/378 | 0/1 | 1008/0/49/241 | 0/368 | 0 |
| WW/O/combined | 976 | 332/367/217 | 513/378 | 0/4 | 976/0/59/223 | 0/322 | 0 |
| WW/R3/combined | 560 | 355/362/332 | 160/125 | 0/1 | 557/3/9/75 | 0/1 | 14 |

Territory, touch quality and ordinary continuations:

| Pair/model | Final-third/box entries | Clean/directional/heavy/failed | Carries | Restart awards | Attempts/selected observer events | Preparation failures |
| --- | --- | --- | --- | --- | --- | --- |
| SS/O/combined | 65/7 | 91/276/23/0 | 3415 | 31 | 14576/15572 | {"not_owner":31,"executed_without_release":7} |
| SS/B/baseline | 122/9 | 273/909/60/0 | 8525 | 75 | 0/0 | {} |
| SS/B/combined | 133/11 | 173/1111/45/3 | 8954 | 62 | 0/0 | {} |
| SW/J/baseline | 111/63 | 123/326/30/12 | 8312 | 55 | 10126/11905 | {"not_owner":55,"executed_without_release":6} |
| SW/J/combined | 115/76 | 97/346/37/14 | 8065 | 53 | 9948/12144 | {"not_owner":53,"executed_without_release":2} |
| SW/B/baseline | 197/33 | 201/606/38/19 | 9441 | 52 | 0/0 | {} |
| WW/H/baseline | 82/22 | 73/253/28/44 | 6908 | 37 | 9790/12026 | {"not_owner":37,"out_of_reach":3} |
| WW/H/combined | 87/23 | 42/272/27/40 | 6450 | 45 | 9200/11265 | {"not_owner":44,"executed_without_release":3} |
| WW/R3/baseline | 99/31 | 91/297/11/18 | 10188 | 48 | 0/0 | {} |
| SS/O/baseline | 87/10 | 232/488/53/0 | 5994 | 61 | 9018/10935 | {"not_owner":60,"executed_without_release":4} |
| SW/B/combined | 156/36 | 98/742/34/16 | 9451 | 70 | 0/0 | {} |
| WW/O/baseline | 94/28 | 78/249/34/42 | 6759 | 28 | 8853/10760 | {"not_owner":27,"executed_without_release":4} |
| WW/O/combined | 106/20 | 35/270/23/38 | 6677 | 37 | 8663/10693 | {"not_owner":37,"executed_without_release":2} |
| WW/R3/combined | 91/33 | 42/331/10/6 | 10672 | 47 | 0/0 | {} |

The observer counts decision-index transitions/attempt events, not a complete denominator of every policy candidate. Long-pass and through/progressive observer counts can differ from the original-episode denominator. Natural restart durations, reasons and distributions are in each raw match receipt; no restart count is treated as a target.

Current-kernel full replays equivalent: **14/14**; total changed measured episode records: **591**. Physical final hashes and exact release lists are checked independently of those changed measurements.

Paired shot regressions: WW/H 3→2; WW/O 4→0. Box-entry regressions: SS/O 10→7; WW/O 28→20. Excessive circulation and SW mismatch scores remain realism concerns. These policy-specific results prevent an inference of general football improvement from the pooled shot total.

All fourteen complete matches are replayed through the current physical kernel with the version 3 observer; final physical state hashes, ticks and release identities must remain identical. The new contact/control ledger is separate from the original immutable v2 receipts. Differences in measured attribution are reported, not silently overwritten.

Canonical attempt/completion/shot/score totals cover whole matches. Touch/control/retention/family counts expose a non-restart-release denominator. Ground/lofted, long (at least 30 m), progressive (at least 10 m), through/lead, disruption, control, heavy/failed receptions, carries, territory and natural restarts are retained where observed. Complete candidate-availability/rejection denominators across all full-world policies and every tactical decision remain unavailable; zero is not substituted. No corner/throw-in quota or attacking bonus is used.

## 19. Computational cost

| Process | Probe | Canonical ETA | Model | Calls | Wall ms | CPU user/system ms |
| --- | --- | --- | --- | --- | --- | --- |
| serial | pass_forecast | no | baseline | 120 | 33.08 | 31.0/0.0 |
| serial | pass_forecast | no | height | 120 | 39.84 | 16.0/16.0 |
| serial | pass_forecast | yes | baseline | 120 | 41.13 | 94.0/15.0 |
| serial | pass_forecast | yes | height | 120 | 129.32 | 156.0/0.0 |
| serial | receiver_forecast | n/a | baseline | 1200 | 13.07 | 0.0/0.0 |
| serial | receiver_forecast | n/a | receiver | 1200 | 8.55 | 15.0/0.0 |
| concurrent-1 | pass_forecast | no | baseline | 120 | 39.28 | 63.0/32.0 |
| concurrent-1 | pass_forecast | no | height | 120 | 43.21 | 31.0/15.0 |
| concurrent-1 | pass_forecast | yes | baseline | 120 | 46.82 | 109.0/31.0 |
| concurrent-1 | pass_forecast | yes | height | 120 | 134.63 | 141.0/32.0 |
| concurrent-1 | receiver_forecast | n/a | baseline | 1200 | 14.89 | 15.0/0.0 |
| concurrent-1 | receiver_forecast | n/a | receiver | 1200 | 11.25 | 16.0/15.0 |
| concurrent-2 | pass_forecast | no | baseline | 120 | 37.23 | 63.0/0.0 |
| concurrent-2 | pass_forecast | no | height | 120 | 54.36 | 78.0/0.0 |
| concurrent-2 | pass_forecast | yes | baseline | 120 | 43.87 | 31.0/0.0 |
| concurrent-2 | pass_forecast | yes | height | 120 | 133.55 | 172.0/31.0 |
| concurrent-2 | receiver_forecast | n/a | baseline | 1200 | 12.94 | 15.0/0.0 |
| concurrent-2 | receiver_forecast | n/a | receiver | 1200 | 9.71 | 32.0/0.0 |

| Process | Peak RSS MiB |
| --- | --- |
| serial | 214.8 |
| concurrent-1 | 232.4 |
| concurrent-2 | 276.4 |

The forecast reuses existing physics, bounds detailed movement work and has no persistent world cache. Existing canonical-arrival caching remains transaction-scoped and independently controllable. Serial means one measured profile process; concurrent means two identical profile workers. Other development jobs can still compete on the host, so these are not isolated-host speed guarantees. CPU time, wall time and peak RSS are retained separately for matches and full observer replays. The 10–15-minute no-debug 90-minute target is not claimed achieved.

## 20. Historical and current replay compatibility

PR195/196 source/evidence remain immutable. Old save fields, absent experimental switches, B default, all 28 attributes, canonical 40 Hz, agency and laws remain. The boundary-memory exception repair is explicitly versioned as a correction to a formerly throwing case, not claimed identical old failure behaviour.

Historical source checks and current unflagged saved-state checks are distinct. New saved prefixes test schema retention and a mutating bounded observer. Full current-kernel match replays establish physical neutrality of the measurement change. Exact-source laboratory reconstruction exports the merged baseline, restores archived normalized source deltas, checks all hashes, and runs read-only `--check` against retained receipts.

## 21. Updated checklist status

Fifteen items are investigated: the thirteen primary IDs plus TACT-009 and PHYS-002. Six scoped repairs in section 16 span PASS-003/004/006/007/009, DEF-003/004, MEAS-011/012 and TACT-009; these ten items have partial structural evidence, not item closure. Four CALIBRATION_REQUIRED items (PASS-001/005/008 and PHYS-002) gain diagnostic coverage, without a fitted coefficient or empirical closure. All fifteen investigated items remain open; the full register retains 134 open items and no completed items. PASS-010 remains REFACTOR_REQUIRED. New IDs: zero. COMPLETE: zero. Major regressions: the receiver contact/control reduction and policy-specific match harms reported above. The next scope is receiver meeting-target/time/body preparation, then the first missing autonomous candidate stage and broader probability calibration.

| Investigated ID | Historical PR196 | PR197 status | Closure |
| --- | --- | --- | --- |
| PASS-001 | LAB_ACTIVE | CALIBRATION_REQUIRED | OPEN |
| PASS-003 | LAB_ACTIVE | LAB_ACTIVE | OPEN |
| PASS-004 | LAB_REQUIRED | LAB_ACTIVE | OPEN |
| PASS-005 | LAB_REQUIRED | CALIBRATION_REQUIRED | OPEN |
| PASS-006 | LAB_ACTIVE | LAB_ACTIVE | OPEN |
| PASS-007 | LAB_ACTIVE | LAB_ACTIVE | OPEN |
| PASS-008 | LAB_REQUIRED | CALIBRATION_REQUIRED | OPEN |
| PASS-009 | LAB_REQUIRED | LAB_ACTIVE | OPEN |
| PASS-010 | LAB_REQUIRED | REFACTOR_REQUIRED | OPEN |
| DEF-003 | LAB_ACTIVE | LAB_ACTIVE | OPEN |
| DEF-004 | LAB_ACTIVE | LAB_ACTIVE | OPEN |
| MEAS-011 | LAB_ACTIVE | LAB_ACTIVE | OPEN |
| MEAS-012 | LAB_ACTIVE | LAB_ACTIVE | OPEN |
| TACT-009 | LAB_REQUIRED | LAB_ACTIVE | OPEN |
| PHYS-002 | LAB_REQUIRED | CALIBRATION_REQUIRED | OPEN |

The acceptance checklist is tracked by evidence rather than a blanket green claim. Frozen reproduction, original 28 attribution, same-release separation, live flight comparison, weak/strong and negative cases, explicit outcomes, all-policy development, performance and replay checks are present. Full autonomous diagonal-loft behaviour, calibrated cognitive probabilities, accurate anatomical aerial contact/takeoff and independent confirmation are not passed.

| Acceptance group | Evidence / status |
|---|---|
| Frozen PR196 and PR195/196 reproduction | Frozen Git/source manifest; historical and current replay commands in verification receipt |
| Exact28, complete opposition and physical-stage attribution | Sections 4–5; actual launch/contact/control/release witnesses and unchanged same-release hashes |
| Actual flight, short/medium/long, ground/lofted and skill sensitivity | Sections 6–8/11–12; no integrator retuning justified |
| Height reach/proximity/control, real aerial successes | Section 8; implemented engineering forecast, actual B/R3/legacy headers, approximate aerial envelope remains open |
| Observed receiver retargeting, finite body movement, no hidden future landing | Sections 9–10; opt-in local adapter and invariance tests; broader controller boundedness remains open |
| Touch/control/later retention, all three contracts, rejection/censor/lineage | Section 11; unfitted claims, original-delivery-v3 and immutable v1/v2 |
| Negative cases and autonomous diagonal run | Sections 13–14; attempted, full lofted sequence NOT ELICITED |
| Candidate blind spots and scoped evidence-supported corrections | Sections 15–17; omissions measured, gates unchanged; no synthetic success or defence-rating reduction |
| Multiple complete matches, policy harms, CPU/RSS | Sections 18–19; seven exact-input pairs; pooled result insufficient for promotion |
| Saves/replay, stable registry, protected confirmation | Sections 20–21; fourteen full physical-equivalence replays plus saved prefixes; 134 IDs; confirmation sealed |
| Local verify and final-head CI | Local status in section 24/verification receipt; exact-head CI reported on PR |
| Canonical readiness | NOT READY; B default and independent opt-ins |

## 22. Remaining blockers

- The autonomous recognition → observed run → selected loft → useful reception chain remains unproven, with zero complete lofted releases in this catalogue.
- Receiver meeting-point changes need body preparation, braking/orientation and timing calibration; fewer touches/control are a real regression.
- Height-aware margins remain forecasts with approximate movement/aerial envelopes, incomplete jump scheduling and goalkeeper/body-contact limits.
- Bounded/full-world candidate sets and incoming first-time choices differ; physically useful absent options require scoped information-aware follow-up.
- Three outcome claims remain unfitted; dependence, selection bias, deflected routes and weak/strong geometry interactions prevent a robust probability claim.
- Full-match circulation/creation, SW mismatch scores and natural active-time distributions remain unrealistic. Observer selected-action counts do not supply every missing candidate denominator.
- Independent confirmation is sealed. No career/distilled simulation readiness follows from this work.

## 23. Recommended PR198 scope

Start from PASS-004/006/009 and the measured receiver regressions: freeze changed observed meeting targets, their timing, actual body/foot preparation and first-touch outcomes on the same releases. Compare the actually available continuation, not an imagined ideal reception. In parallel only where causally required, investigate PASS-010/TACT-002/004's verified boundary omissions and the first broken stage of the autonomous run sequence.

Then calibrate PASS-001's distinct direct-touch/control/retention forecasts against the corrected physical outcomes using broader held-out development geometries and appropriate clustered uncertainty. Keep engineering truth separate from subjective belief. Do not begin global shooting/action-value, stamina, goalkeeper or restart rebalancing because a pooled match statistic looks poor.

## 24. Canonical readiness decision

**NOT READY. B remains default. Each new experiment remains independently opt-in. `experimentalCanonicalArrival` remains separate. Independent confirmation stays sealed.**

Local final verification: **PASS — local verify, frozen/current replay, eleven exact-source laboratories and fourteen full physical-equivalence replays**. Final-head CI is reported on the PR against its exact head; it is not inferred from a prior commit or embedded as a self-referential Git receipt.

```sh
npm run benchmark:pr195:check
npm run benchmark:pr196:historical
npm run benchmark:pr196:check
npm run benchmark:pr196:replay
npm run benchmark:pr197:check
npm run benchmark:pr197:replay
npm run benchmark:pr197:source-replay
npm run verify
```

Versioned recording refuses to overwrite receipts. [Compact summary](performance/pr197/summary.json), [verification](performance/pr197/verification.json), source archives and whole-match lineage replays supply the evidence behind this decision.
