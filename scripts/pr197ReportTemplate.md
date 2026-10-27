# PR197 — Passing Reality: Flight, Interception & Receiver Anticipation

## 1. Executive summary

PR197 reproduces the original 28 failed long passes and identifies a physical asymmetry: an opponent's incoming **hold/control** choice could enter `changePossession` above foot height, while a teammate had to satisfy the finite-foot and height guard. The ball could become owned at roughly two metres without a foot reception. An independent, opt-in correction applies the existing guard to both sides. It changes no rating, launch, gravity, dispersion coefficient or success probability.

{{LONG_TOTALS}}

There are three independent experimental booleans: `experimentalDefensiveReception`, `experimentalHeightAwarePassing` and `experimentalReceiverAnticipation`. They are absent by default. `experimentalCanonicalArrival` remains a separate opt-in. A narrow unflagged repair also prevents an out-of-pitch remembered sighting from being parsed as an in-play tactical coordinate.

Seven paired development matches cover WW/SS/SW and B, R3, Opportunity, Hierarchical and Contextual. Aggregate shots are **{{SHOTS}}**, with policy-specific regressions. This is not promotion evidence. **Canonical NOT READY; B remains default; independent confirmation sealed.**

## 2. Frozen PR196 baseline

The merged PR196 commit is `81e0457a0fc344cdedaa18d035121cb7fe51bcc2`; its final implementation/report head is `0498cf6bb63d81224493c8a67c232c0980f1b853`. [Frozen manifest](performance/pr197/frozen-pr196.json) records normalized source hashes, all 134 registry identities/statuses, and immutable Git blob identities for PR195/196 evidence. The baseline source fingerprint is `142e32d18ccf2e51a9d04f55ec62bb3d1f5b1a5da9148d5f9c6d85ae09dc0f0a`.

PR195's pilots, PR196's 336 pass requests, 28 original long-pass inputs/factor trials, 360 movement trials, 118 captured states, counterfactuals, seven historical match pairs and negative controls remain untouched. Their earlier 0.306 → 0.004 s held-out positional ETA MAE is consistency with canonical movement, not independent physiological calibration. Their 75 → 67 shots remain negative/mixed historical transfer evidence.

The four historical reproduction commands passed before editing. `benchmark:pr196:check` now exports the exact merged source and runs its original checks; `benchmark:pr196:replay` separately checks current unflagged continuations. No old physics assertion, integration timeout or expected receipt is weakened.

## 3. Registry IDs and dependency scope

Primary: PASS-001/003/004/005/006/007/008/009/010, DEF-003/004 and MEAS-011/012. Scoped secondary findings concern TACT-009 and PHYS-002. Other perception, movement, tactical and performance IDs are dependencies, not silently completed work.

The [register](match-engine/ASSUMPTIONS_REGISTER.md), [dependency graph](match-engine/MECHANISM_DEPENDENCIES.md) and [calibration plan](match-engine/CALIBRATION_PLAN.md) retain I/F/E/T/M/C separation. There are no new IDs and no COMPLETE entries. No global utility, shooting, stamina, goalkeeper or restart rebalance is included.

## 4. Long-pass failure decomposition

The exact seven skill matchups × two PR195 development seeds × two mirrors are regenerated, not replaced by easier inputs. The [baseline](performance/pr197/long-pass-baseline-v6.json.gz), [symmetric-control branch](performance/pr197/long-pass-defence-v4.json.gz) and [combined branch](performance/pr197/long-pass-combined-v5.json.gz) retain initial bodies, requested/actual intended points, desired launch, actual velocity/elevation, dispersion, free-flight forecast, all eleven opponents, receiver targets/facing/momentum, canonical aerial opportunities, actual contact/release witnesses, first control, terminal state and full tick-stream hashes. Body frames are sampled at 0.25 s plus events; exact 40 Hz streams are reproducible.

{{LONG_BANDS}}

Causes overlap. Weak launchers have large physical aim deviations; a successful ideal plan is not an accurate actual release. Opposition can intervene before a receiver's eventual opportunity is observable. Twenty-seven historical episodes show opponent ownership after an aerial contest without the teammate-equivalent foot guard. One original ball leaves play. These observations do not justify attributing every failure to receiver recognition or assigning one exclusive root cause.

The observed guard violation is in [`changePossession`](../src/core/matchSimulation/matchSimulation.ts), reached through `tryIncomingFinish`'s incoming control choice. It is not a defect in the flight integrator. The designated defender is not the entire opposition: every opponent is retained and attribution uses actual contacts/control. Candidate aerial geometry is explicitly separated from executed contact.

## 5. Same-release counterfactual experiments

Eleven branches begin from the identical actually released ball. They vary awareness timing, first-touch ability, initial facing, initial velocity, initial position, one/all opponents' initial geometry, or one experimental mechanism. Every branch asserts the same complete launched-ball hash. Remote opposition continues to move and compete; it is not disabled.

{{SAME_RELEASE}}

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

{{READINESS}}

These are prescribed laboratory objectives, not autonomous tactical success. Experimental chest/thigh surfaces in that apparatus are not enabled in the full-match cohort. A requested thigh touch can be blocked by another actual surface; no foot action is relabelled as a chest reception. Touch, cushioning/deflection, control and a later team-possession endpoint remain different events.

## 11. Direct touch, control and retention prediction contracts

New PR197 receipts explicitly use **`original-delivery-v3`**. Versions 1 and 2 retain their historical ordering. Version 3 records an actual header or incoming first-time release, credits its genuine physical contact, then ends the incoming delivery. A new pass/shot without such an incoming-contact witness still terminates before credit. A later control from a headed/redelivered ball cannot rescue the original request. Contacts are timestamp-ordered. The initial first-time release is excluded by the original release-time boundary.

Three direct-path diagnostic claims are compared: direct intended-receiver touch; direct touch followed by original-delivery receiver control; and that controlled path with own-team possession one second later. The existing completion estimate, existing quality-to-control map and existing recovery factor define these **unfitted historical claims**. Deflected routes remain separately observed; unrelated heuristics are not promoted into a calibrated probability model.

The family experiment contains 1100 requests: 220 per model, comprising 180 ordinary releases and 40 physically rejected remote/high-contact requests. Rejection is not failed completion, and subsequent autonomous actions do not rescue it. Forecasts are taken from the executor's ideal selected launch before sampling technical error; the request-target forecast is retained separately because a moving-run projection can change the intended meeting point.

{{CALIBRATION}}

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

{{AUTONOMOUS}}

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

{{MATCHES}}

{{MATCH_DETAILS}}

All fourteen complete matches are replayed through the current physical kernel with the version 3 observer; final physical state hashes, ticks and release identities must remain identical. The new contact/control ledger is separate from the original immutable v2 receipts. Differences in measured attribution are reported, not silently overwritten.

Canonical attempt/completion/shot/score totals cover whole matches. Touch/control/retention/family counts expose a non-restart-release denominator. Ground/lofted, long (at least 30 m), progressive (at least 10 m), through/lead, disruption, control, heavy/failed receptions, carries, territory and natural restarts are retained where observed. Complete candidate-availability/rejection denominators across all full-world policies and every tactical decision remain unavailable; zero is not substituted. No corner/throw-in quota or attacking bonus is used.

## 19. Computational cost

{{PERFORMANCE}}

The forecast reuses existing physics, bounds detailed movement work and has no persistent world cache. Existing canonical-arrival caching remains transaction-scoped and independently controllable. Serial means one measured profile process; concurrent means two identical profile workers. Other development jobs can still compete on the host, so these are not isolated-host speed guarantees. CPU time, wall time and peak RSS are retained separately for matches and full observer replays. The 10–15-minute no-debug 90-minute target is not claimed achieved.

## 20. Historical and current replay compatibility

PR195/196 source/evidence remain immutable. Old save fields, absent experimental switches, B default, all 28 attributes, canonical 40 Hz, agency and laws remain. The boundary-memory exception repair is explicitly versioned as a correction to a formerly throwing case, not claimed identical old failure behaviour.

Historical source checks and current unflagged saved-state checks are distinct. New saved prefixes test schema retention and a mutating bounded observer. Full current-kernel match replays establish physical neutrality of the measurement change. Exact-source laboratory reconstruction exports the merged baseline, restores archived normalized source deltas, checks all hashes, and runs read-only `--check` against retained receipts.

## 21. Updated checklist status

Fifteen items are investigated: the thirteen primary IDs plus TACT-009 and PHYS-002. Six scoped repairs in section 16 span PASS-003/004/006/007/009, DEF-003/004, MEAS-011/012 and TACT-009; these ten items have partial structural evidence, not item closure. Four CALIBRATION_REQUIRED items (PASS-001/005/008 and PHYS-002) gain diagnostic coverage, without a fitted coefficient or empirical closure. All fifteen investigated items remain open; the full register retains 134 open items and no completed items. PASS-010 remains REFACTOR_REQUIRED. New IDs: zero. COMPLETE: zero. Major regressions: the receiver contact/control reduction and policy-specific match harms reported above. The next scope is receiver meeting-target/time/body preparation, then the first missing autonomous candidate stage and broader probability calibration.

{{REGISTRY_STATUS}}

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

Local final verification: **{{VERIFY_STATUS}}**. Final-head CI is reported on the PR against its exact head; it is not inferred from a prior commit or embedded as a self-referential Git receipt.

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
