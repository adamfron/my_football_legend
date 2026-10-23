# PR184 — Football Performance Lab Core

The laboratory measures canonical physical execution in headless, fixed 0.025 s
trials. A projected arrival, a selected carry and an intended kick target cannot
complete an exercise. Completion requires the body, controlled ball or released
trajectory to reach the configured physical geometry. Misses, recoveries, failures
and timeouts remain in the receipts.

Base: merged PR183 `6377a9338eb0fbba54cb2c7062f12e924124b924`.
No tactical policy, match coefficient, attribute schema, save migration or career
development rule is calibrated here. B remains the provisional match default and
canonical remains **NOT READY for summary-simulation calibration**.

## Implemented work and architecture

| Task | Implementation and verification |
| --- | --- |
| Inspect existing research | PR180–183 reports, `attributeMicroLab`, `fitnessMicroLab`, canonical movement, fitness, carry/pursuit, first touch, pass/shot, aerial and keeper resolvers inspected; previous receipts preserved |
| Shared runtime | `runFootballSkillTrial(config, exactFootballerProfile, seed, observer?)`; serialisable Zod configuration/result, bounded ticks, detached observer samples, copied fitness and profile |
| Shared body integration | `integrateCanonicalMovement` extracted from the existing match loop with the same arithmetic, facing rate, relative movement, finite acceleration and braking; match boundaries/body separation remain in the match caller |
| Canonical physical work | `deriveMovementCapability`, `sprintSpeedAt`, `projectSprintEpisode`, `advanceMatchFitness`; expenditure follows actual integrated movement |
| Canonical ball control | `deriveCarryExecution`, `deriveCarryPursuit`, `advanceControlledBall`, `advanceBallAcquisition` and the guarded `applyCanonicalBallControl` wrapper around the existing possession/reception lifecycle |
| Canonical kicks and flight | Ordinary `MatchAction` and `resolveMatchAction`, pass launch/execution, shot resolver, first touch, `integrateBallFlight`, ground rolling, spin, bounce and rebound response |
| Apparatus | Data-driven cones/poles, player/ball gates, rectangle/ellipse targets and zones, restitution/tangent wall and markings, oriented hoop with a physical rim, configurable canonical goal geometry and deterministic launcher |
| Evidence | Paired seeds/bands/interactions, 28-field type-aware source inventory, result/input SHA256, compressed complete example traces, headless replay verifier |
| Repository regression | PASS: complete `npm run verify`; final focused laboratory suite 35/35 |

The original micro tools remain useful references with their original definitions.
`PR184-micro-lab-reference.json` executes `runAttributeMicroLab` with 16 paired
repetitions at bands 20/100 and an eight-second `runFitnessDrill` reference. Those
resolver scores and projected ETAs are not renamed completed field tests.

The laboratory alone chooses route objectives, apparatus geometry, checkpoint
tolerances, exercise phases and stopping conditions. It never authors a ball curve
or adds an attribute-dependent finishing penalty. Obstacles are absent from normal
matches. Static player–apparatus collision constraints are laboratory geometry;
they do not claim mannequin wrestling or a new player contact model. Cones use a
finite narrow capsule approximation, rather than deformable cone geometry.

The canonical pass planner requires a receiver readiness context. A fixed,
stationary reference card with all attributes 60 is used **only while constructing
the ordinary pass**, then removed before flight. Its attributes never follow the
attribute counterfactual. No receiver exists at the physical target and no reception
error, pass-completion label or phantom interception contributes to target accuracy.
This standardises the existing launch planner; it is a stated apparatus assumption.

An optional explicit pass `foot` carries a prescribed restriction into the actual
canonical kick. The requested foot must physically reach the ball. Existing
weak-foot difficulty is reused; absent `foot` preserves ordinary inferred behavior.
Carry restrictions similarly gate actual contacts and record the executed foot;
they add no final-score penalty or new weak-foot control coefficient.

## Three execution modes

* **Prescribed:** the controller supplies an external football objective and uses
  the common body/contact/release paths. This is the sensitivity benchmark mode.
* **Autonomous:** technical trials record canonical generated alternatives, utility,
  pass/shot error forecasts and the selected action. A selected hold or carry is
  actually executed; failure to fulfil the target objective remains incomplete.
  The fixed reference receiver is a planning context, so these ranks are not a
  validated model of wall-drill expertise or receiver-completion calibration.
* **Manual:** timestamped ordinary `MatchAction` commands enter the same executor.
  A normal pass/carry command is covered by tests. This is an adapter boundary for
  normal controls, not a new polished training-screen UI.

No mode receives privileged movement, contact reach, ball attachment or a separate
human/AI kick formula. The exported input is independent of a saved career.

## Physical objects and measurement

Each object has identity, position and physical dimensions. Cones/poles explicitly
separate `collision` from route `checkpoint`; a marker does not silently become a
solid obstacle. Gates are oriented finite planes with subject and entry direction.
Crossing time is interpolated between actual integrated positions; a shared endpoint
is counted once. Ball events retain local impact coordinates, height, speed, spin,
geometric error, hit/miss and zone membership. A wide miss still has a measurable
plane intersection; a ball stopping before the plane has no invented impact.

Walls reflect at the ball-radius-offset surface. Their configured restitution and
tangential retention enter the canonical dissipative response; the remaining tick
continues physically after impact. Attached markings retain their geometry and
contact coordinates. There is no return teleport. Hoop detection includes the ball
radius, valid direction and conservative swept torus-rim contact; centre proximity
alone cannot score. Small goals reuse canonical post/crossbar/opening contact
geometry with explicit dimensions. Goal-target accuracy is separate from match
goal statistics and the absence of a goalkeeper is deliberate.

The launcher has initial position, velocity, spin, release time and optional seeded
dispersion. It has no player attributes. A non-grid release at 0.013 s is tested
against the physical 0.012 s remainder of that tick. Subsequent ball motion uses
the normal solver. A collision budget raises an explicit apparatus error instead
of silently dropping unintegrated time.

## Exercise protocols

**Sprint:** standing and 4 m/s moving starts over 5, 10, 20, 30 and 40 m.
The controller targets past the finish, while finite gates measure actual body
crossings and splits. Samples retain speed, acceleration, position, peak speed,
time to peak, distance and completed-work fitness. Runner elapsed time includes
the final full tick; interpolated `finishSeconds` is the gate measurement.

**Turns:** both directions of 10 m out-and-back, twelve 10 m shuttle legs, and
505 geometry. The 505 starts at x=20, passes the timing gate at x=30, reaches the
turn line x=35, then returns through x=30: **10 m approach, 5 m in and 5 m out**.
The timed result is the difference between the two interpolated gate events;
the total trial additionally includes the approach. Body-centre crossing replaces
a real plant-foot line contact, so `published_geometry` does not claim the exact
published protocol. Actual paths, braking, minimum turn speed, body rotation,
reacceleration and fitness are retained. A straight stop/reverse may have zero
velocity-heading turning load while still incurring braking and acceleration work.

**Slalom:** four cones at x=22+i×spacing, y=34, with spacing 2/4/6 m. Each outbound
cone has before/after waypoints at x±0.7 m and alternating y=34±1.3 m, followed by
an end turn, mirrored return and a finish at (20,34). Both the physical player and
ball must enter each ordered 0.65 m checkpoint envelope. Exact polyline lengths
are exported in the catalogue; the three spacings are different courses, not a
normalised universal slalom score. Forced dominant/weak/unrestricted feet and the
four pace/dribbling profiles share all other attributes and initial states.
Controllers may seek a reachable foot contact after miscontrol; they never move
the ball to a waypoint. A timeout retains missed checkpoints and no finish time.

**Passing:** 5/10/20/30 m ground/elevated targets, two target sizes, dominant/weak
foot, prepared and physically eligible first-time releases. Initial sampled kick
error, post-release physical flight and target-plane intersection remain separate.
The first-time case starts with a real incoming delivery, rather than marking an
owned stationary ball `firstTime`. Preparation comes from canonical readiness.

**Pass/rebound/receive/turn/pass:** a first release hits a finite wall at x=28,
returns physically, meets the moving player, uses canonical first-touch control or
loose-ball recovery, traverses three waypoints around an off-beam pole and releases
a second pass. Incoming speed/quality, reception, control time, touches, route,
second release and both geometric errors remain individually inspectable.

**Reception:** launcher-style initial deliveries at 6/18/26 m/s, height 0.8 m,
upward speed 1.5 m/s, with zero or 60 rad/s sidespin. Gravity, bounce and relative
contact speed determine the contact. A difficult ball may be missed initially,
chased after bouncing, controlled heavily or recovered later. Final completion
alone therefore does not measure initial reception quality.

**Shooting:** stationary, after carry, after turn and first-time shots, placed/
driven/chip, low/elevated targets and both feet. Actual canonical preparation,
shot launch, spin, flight, target-plane error and frame contacts are measured
without a keeper. Isolated accuracy does not set a match conversion quota.

## Measured results and sensitivity

Each configuration uses **30 matched seeds**. These are physical measurements in metres/seconds, not attribute-derived exercise scores.

| Controlled change (all other inputs fixed) | Band 20 | Band 100 | Measured quantity |
| --- | ---: | ---: | --- |
| `pace` — sprint-5-standing | 1.295 | 1.179 | finishSeconds |
| `pace` — sprint-30-standing | 4.972 | 3.841 | finishSeconds |
| `agility` — sprint-5-standing | 1.389 | 1.118 | finishSeconds |
| `agility` — 505-left | 5.274 | 4.346 | finishSeconds |
| `passing` — pass-10-dominant-ground | 0.804 | 0.329 | targetErrorMetres |
| `passing` — pass-30-dominant-ground | 2.631 | 0.434 | targetErrorMetres |
| `technique` — pass-30-dominant-ground | 1.281 | 0.586 | targetErrorMetres |
| `finishing` — shot-stationary-placed-dominant | 1.646 | 0.407 | targetErrorMetres |
| `firstTouch` — wall-receive-turn | 0.631 | 0.940 | receptionQuality |
| `dribbling` — slalom-2-unrestricted | 13.800 | 12.725 | finishSeconds |
| `dribbling` — slalom-6-unrestricted | 13.400 | 13.400 | finishSeconds |
| `stamina` — shuttle-left | 32.971 | 32.732 | finishSeconds |
| `weakFootProficiency` — pass-30-weak-ground | 1.106 | 0.992 | targetErrorMetres |
| `weakFootProficiency` — slalom-2-weak | 13.250 | 13.250 | finishSeconds |

The 505 values above include the approach; `timed505Seconds` separately measures the 5 m out/5 m back gate interval. The neutral 505 timed interval is 2.877 s.

| Catalogue group | Completed | Failed | Incomplete |
| --- | ---: | ---: | ---: |
| sprint-results | 300 | 0 | 0 |
| turning-results | 180 | 0 | 0 |
| slalom-results | 240 | 30 | 0 |
| passing-accuracy | 540 | 0 | 0 |
| rebound-results | 30 | 0 | 0 |
| first-touch-results | 180 | 0 | 0 |
| shooting-results | 660 | 0 | 60 |

Completion means the physical measurement endpoint was reached; a completed target trial may still be a geometric miss. The 2 m forced-dominant slalom records 30/30 collision failures in this fixed course. Forced-weak and unrestricted counterparts finish; this asymmetric route/controller result is not evidence that weak-foot ability exceeds dominant-foot ability. The actual failed trajectory is retained. Both first-time chip configurations remain 30/30 incomplete because that contact/technique is not a released canonical option in this setup. Nothing turns those cases into slow successes.

All 28 schema attributes receive five-band negative/positive controls at
20/40/60/80/100 with matched seed sets. Twelve attributes have an intended physical
context in this apparatus; the others' sprint controls are explicitly **not** tests
of their intended tackling, leadership, aerial, goalkeeper or career behavior.
Weak-foot proficiency is additionally tested as a body property outside the 28.
The seven small 2×2 interaction designs cover pace×agility, pace×dribbling,
dribbling×firstTouch, passing×technique, passing×weakFoot, stamina×pace under
repeated work, and finishing×technique. Contact-strength interaction is explicitly
unsupported until a proper opposing-body protocol exists.

| Interaction | Context | Difference in differences of cell means |
| --- | --- | ---: |
| pace-agility | 505-left | 0.117 |
| pace-dribbling | slalom-2-unrestricted | -0.150 |
| dribbling-firstTouch | slalom-2-unrestricted | 0.100 |
| passing-technique | pass-30-dominant-ground | 1.328 |
| passing-weakFoot | pass-30-weak-ground | 0.458 |
| stamina-pace-repeated-work | shuttle-left | 0.046 |
| finishing-technique | shot-stationary-placed-dominant | -0.009 |

These are descriptive interactions of the stated metric, conditional on its available physical observations. Every cell retains completion/failure counts and nullable times. They do not establish a universal ranking or population significance.

Each series retains every seed, status, failure, nullable measured finish, sample
count and exact SHA256 of input and result. `physicalSha256` separately fingerprints
sampled state/events/fitness, so identical physical behavior can be distinguished
from different input cards. Distribution summaries report mean, median, p05/p95,
range and missing counts. Failed/non-completing trials remain in the denominator;
conditional finishing distributions are labelled by their non-missing counts.
Time steps from one run are never independent trial samples. Deterministic running
under 30 seeds gives identical mechanical realizations, not 30 different athletes.

## Coverage of all attributes

The TypeScript checker inventories reads on `PlayerAttributes`-shaped objects,
including aliases such as `a.pace`. Direct assignment writes are excluded.
Dynamic indexed reads, whole-vector consumers and declarative field memberships
are listed separately; a direct-property search is not sufficient to declare an
attribute unused. Existing test references and new drill contexts are attached.
Role flags classify direct source evidence; a false flag does not disprove a
dynamic consumer. `goalkeeperThrowing`, for example, belongs to radar/OVR and
generation/development tables despite lacking a direct match-execution read.

P=physical, G=candidate generation, D=decision, F=fitness/recovery, K=keeper, C=career **direct-source evidence**. Indexed/table consumers are additionally retained in JSON; a dash is not proof of no indirect use.

| Attribute | Direct read sites | Direct roles | Intended lab context | Finding |
| --- | ---: | --- | --- | --- |
| `technique` | 50 | P G D K | pass-30-dominant-ground, shot-stationary-placed-dominant | measured_effect |
| `firstTouch` | 25 | P G D K | receive-18-spin-60, wall-receive-turn | measured_effect |
| `passing` | 29 | P G D K | pass-10-dominant-ground, pass-30-dominant-ground | measured_effect |
| `dribbling` | 12 | P G D | slalom-2-unrestricted, slalom-6-unrestricted | measured_effect |
| `finishing` | 13 | P G D | shot-stationary-placed-dominant | measured_effect |
| `tackling` | 14 | P D | negative sprint control only | not_exercised_in_intended_context |
| `positioning` | 32 | P D K | negative sprint control only | not_exercised_in_intended_context |
| `heading` | 8 | P G D | negative sprint control only | not_exercised_in_intended_context |
| `setPieces` | 8 | P G C | negative sprint control only | not_exercised_in_intended_context |
| `gameReading` | 58 | P G D K | pass-30-dominant-ground | measured_effect |
| `composure` | 35 | P G D K | pass-30-dominant-ground | measured_effect |
| `concentration` | 14 | P D K | receive-18-spin-60 | measured_effect |
| `leadership` | 1 | K | negative sprint control only | not_exercised_in_intended_context |
| `determination` | 7 | C | negative sprint control only | not_exercised_in_intended_context |
| `aggression` | 9 | P D | negative sprint control only | not_exercised_in_intended_context |
| `pace` | 30 | P D F | sprint-5-standing, sprint-30-standing | measured_effect |
| `stamina` | 13 | P D F | shuttle-left | measured_effect |
| `strength` | 14 | P D K | sprint-5-standing | measured_effect |
| `agility` | 36 | P G D K | 505-left, sprint-5-standing | measured_effect |
| `jumping` | 11 | P G K | negative sprint control only | not_exercised_in_intended_context |
| `ambition` | 5 | C | negative sprint control only | not_exercised_in_intended_context |
| `professionalism` | 11 | C | negative sprint control only | not_exercised_in_intended_context |
| `reflexes` | 6 | P K | negative sprint control only | not_exercised_in_intended_context |
| `handling` | 5 | P K | negative sprint control only | not_exercised_in_intended_context |
| `oneOnOnes` | 3 | P K | negative sprint control only | not_exercised_in_intended_context |
| `goalkeeperSweeping` | 4 | G K | negative sprint control only | not_exercised_in_intended_context |
| `goalkeeperKicking` | 3 | P D K | negative sprint control only | not_exercised_in_intended_context |
| `goalkeeperThrowing` | 0 | K | negative sprint control only | not_exercised_in_intended_context |

## Prediction versus observed execution

Pre-kick `derivePassDifficulty` and `deriveShotExecutionErrorProfile` mean/sigma
forecasts are compared with the **signed sampled lateral aim error before flight**.
The report retains bias, RMSE, predicted sigma and empirical one/two-sigma coverage
per drill/attribute context. Conditional `projectFutureBallTrajectory` forecasts
start from the actual released ball and compare the same physical target plane;
contacts that change the trajectory mark that comparison incompatible. This is
solver consistency after release, not proof that autonomous AI predicts its own
pre-action success correctly.

Arrival-envelope ETA and a crossing of an unbraked timing plane have different
termination definitions. Both are recorded, with `comparable=false` and no fabricated
ETA error. Receiver-completion probabilities are never compared with wall-target
hits. The minimal autonomous adapter records choices and physical outcomes; broad
decision calibration remains PR186 work.

| Baseline forecast/context | Comparable observations | Bias (m) | RMSE (m) | Within 1σ | Within 2σ |
| --- | ---: | ---: | ---: | ---: | ---: |
| derivePassDifficulty / pass-30-dominant-ground | 30 | 0.162 | 0.807 | 0.700 | 1.000 |
| derivePassDifficulty / pass-30-weak-ground | 30 | 0.333 | 1.229 | 0.533 | 0.933 |
| deriveShotExecutionErrorProfile / shot-stationary-placed-dominant | 30 | -0.046 | 0.726 | 0.800 | 0.933 |

Across comparable post-release flight groups, the maximum signed radial-error discrepancy is 0 m. This agreement checks the shared solver and timestep. Sigma coverage is descriptive at n=30 per baseline configuration, not evidence that receiver-completion probabilities are calibrated. Empirical percentiles use the lower order statistic, including the reported p50/median.

## Scientific references and boundaries

[Ali et al. (2007)](https://pubmed.ncbi.nlm.nih.gov/17852682/) studied two groups of
24 university players. Its LSPT consists of 16 passes and includes penalties;
reported overall times were 43.6 and 52.5 s. This wall drill reproduces neither the
complete geometry/sequence, scoring nor familiarisation, so those numbers are
reference evidence, not a target time for MFL.

[Wen et al.](https://pubmed.ncbi.nlm.nih.gov/29171340/) review 25 LSPT studies and
discuss reliability and interpretation limits. [Asimakidis et al. (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11467003/)
review heterogeneous strength/jump tests in senior professional and elite youth
males; the populations and measurement methods must stay distinct. No jump or
strength norms are calibrated here. [Lockie et al. (2017)](https://doi.org/10.1519/JSC.0000000000001490)
describe the traditional 505's 10 m approach and 5 m turning distance; that geometry
is retained. **Exact published protocols: none.** Other configurations are adapted
MFL or custom physics tests. No named-star laboratory measurements are invented.

## Repeatability, cost and verification

The complete bounded run executes **9,360 trials** and
**1,960,776 canonical ticks** in **28.87 wall seconds**,
with **40.23 process CPU seconds**, peak RSS **945.6 MiB**
and final heap **676.6 MiB**. This includes SHA256/JSON work,
compressed traces, the TypeScript source inventory and the existing micro references;
the high memory peak includes the type checker, not just one physical trial.
Host context is `serial-headless-final`; wall time is descriptive, not a serial
before/after performance-regression claim. Platform: win32,
Node v24.19.0, AMD Ryzen 7 260 w/ Radeon 780M Graphics.
Each trial is capped at 300 s/12,000 ticks and 100 objects; standard catalogue trials
use much smaller budgets. Experiments run in separate headless batches.

LF-normalised production scope SHA256: `f084ab7f4e5ce9976c6c198ccfcecf4eacaf5ef51e59b16efde62cef6b90b622`.
Harness SHA256: `146cb32b16abf68070fd28ec6ba3fd52351a8092fa277c6c4c6e980bae2bb2ab`. The benchmark rejects a source
or harness change during measurement. Each trace carries its exact config/card/seed;
series receipts additionally use cryptographic input, result and physical-trace hashes.

A separate serial drills-only batch executes 3,120 trials in 10.73 wall seconds / 15.59 CPU seconds, with peak RSS 476.1 MiB; it excludes the source type-checker inventory and existing micro references. Both cost receipts name their scope and host context.

The unchanged **`npm run verify` exits 0**: ESLint, 2,060 main tests, 56 match-integration tests, four career contracts and five full-career tests (**2,125 total**), TypeScript and Vite build. Its unit stage contained 33 laboratory tests. Two further lab regressions (incidental targets and manual carry identity) plus lab-only control corrections are covered by the final **35/35** focused suite; final lint/type checks are repeated. The shared ordinary-match physical code did not change between these stages. The complete final test catalogue therefore contains 2,127 tests; that is not misreported as the count of the earlier full command. Exact-head GitHub CI is reported separately after publication.

Nine compressed successful, failed and autonomous traces are rerun through the public headless API and compared by complete SHA256. The verification receipt retains command results, hashes and compressed logs; no timeout, test expectation or match length was changed.

The apparatus has no save access and copies the complete input profile/fitness.
It does not train attributes or apply career results. Existing canonical full-match,
human agency, laws, historical telemetry and career-contract tests remain required.
No test deadline or expectation is relaxed. Historical benchmark receipts remain
unchanged. Compressed example trials are fully self-contained and can be rerun
without the world database or browser.

```sh
npm ci
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr184.ts --repetitions=30
# Batches: --batch=drills, --batch=sensitivity, --batch=coverage
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/replayFootballSkillTrial.ts docs/performance/pr184-traces/sprint-20-standing.json.gz
npm run verify
```

The catalogue, coverage, sensitivity, sprint, turning, slalom, profile comparisons,
passing, rebound, first-touch, shooting, prediction calibration, body controls,
reference index, micro reference, performance and verification are in
`docs/performance/PR184-*.json`. Complete first-seed traces for each catalogue drill
are under `docs/performance/pr184-traces/`. A polished browser view and visual replay
adapter are not shipped or claimed tested; raw positions support their later use
with the existing renderer. No independent rendering engine was introduced.

## Deficiencies and next work

* **Distinct but overlapping movement:** pace changes maximum sprint capability and also acceleration; agility changes acceleration and body rotation. The short-start agility effect is larger than the isolated pace effect here. This supports further capability separation analysis, not a schema split now.
* **Technical context overlap:** gameReading and composure enter the same sum in the stationary passing ability term and have equal isolated effects in that context. Their other reads differ; this does not establish global redundancy.
* **Carry plateaus and foot coverage:** dribbling changes the tight result at the low band but not wide-course finishing times. Weak-foot proficiency 20→100 produces identical weak-foot slalom times (13.250 s) despite its measurable passing effect. Required-foot geometry and proficiency are different questions. Tight forced-dominant collision failure also exposes route/controller asymmetry; mirror/footwork studies should precede broad conclusions.
* **Recovery masks poor reception:** spin/relative speed can produce a heavy or failed first touch followed by successful recovery. All six baseline reception configurations eventually finish; the 18 m/s spinning delivery can finish sooner than the non-spinning case because the trajectory/contact opportunity differs. Quality, contact time and actual incoming speed—not completion alone—must define difficulty.
* **Technique feasibility is real:** the two incoming chip configurations never release and remain incomplete. Other prescribed shot families retain measured hits/misses. This is not repaired by inventing a chip action outside canonical eligibility.
* **Body and workload gaps:** exact height/mass controls produce the same isolated sprint result. This apparatus does not establish their contact/jump influence. A straight stop/reverse can report braking cost with zero velocity-heading turning load; limb planting and lateral body mechanics remain unmodelled.
* **Goalkeeper throwing:** no direct physical throwing read is demonstrated, while radar/OVR and development/generation references remain. It is therefore a physical-coverage candidate, not an unused-game-attribute verdict.
* **Autonomous objective mismatch:** all 30 autonomous shooting trials reach their plane; the passing objective is 30/30 incomplete after canonical choices, and the wall objective is 29 incomplete/one physical failure. Their choices and actual states are preserved, not replaced by prescribed passes. Sparse training context and one-step choice require richer PR186 decision studies.
* **Scope limits:** goalkeeper saves, real planted-foot 505 mechanics, contact/jump tests, exact LSPT/LSST, a polished browser laboratory and visual replay are not implemented in this PR. None is claimed calibrated from these results.

PR185 should extend physical protocols: repeated sprint/recovery, actual jumps
and heading reach, keeper reaction/interception, moving aerial deliveries,
shield/contact/tackle apparatus and body-parameter coverage. PR186 should then
calibrate demonstrated dependencies, separate execution from choice predictions,
and evaluate schema proposals without assuming one test establishes redundancy.
PR187 must test transfer to new full matches across all policies before summary
calibration. Generations/world strength move intact to PR188; summary/PlayStyles
to PR189, career UX to PR190 and world expansion to PR191+. SSS is outside PR184.

## Answers to the 28 required questions

1. **Reused tools:** both existing micro labs and their canonical resolvers, plus
   the shared movement, fitness, contact, launch, shot and ball-flight paths above.
2. **Actual player movement:** yes; every body sample is a finite integrated position.
3. **Physical sprint timing:** yes; real gate crossings determine splits/finish.
4. **Miss/fail:** yes; target misses, lost control, collision failure and incomplete
   routes remain explicit. A timeout never receives an artificial finish time.
5. **Turning/braking:** yes; actual velocities, orientation and completed work affect
   results. Straight reversal is not a model of a planted leg or lateral biomechanics.
6. **Pace versus agility:** physically distinct in the measured sprint/turn controls;
   see the table, including agility's strong short-start effect.
7. **Dribbling at speed:** measured in tight/wide controls; plateau or failure is
   retained rather than a forced smooth ranking.
8. **Weak foot:** physical contacts are restricted; pass execution reuses proficiency.
   Carry proficiency effects must be assessed separately from which foot touches.
9. **Recovery after a heavy touch:** yes; finite pursuit/acquisition is exercised,
   while all non-recoveries remain in trial outcomes.
10. **Passing attributes:** physical target errors respond to passing/technique in
    matched experiments; no absent receiver contributes a technical failure.
11. **Long versus short:** distinct measured error/speed distributions; this is
    evidence of sensitivity, not a claim that absolute difficulty is calibrated.
12. **Reproducible launcher:** yes, including velocity/spin and fractional release.
13. **Fast bouncing reception:** tested with actual bounce/contact/recovery; incoming
    relative speed and quality must accompany completion, which can follow a chase.
14. **First-time versus prepared:** actual incoming versus owned/ready contact, with
    different preparation and canonical momentum connection.
15. **Canonical shooting:** yes; ordinary shot resolution and integrated trajectory,
    initially without a keeper.
16. **Apparatus interference:** solid objects intentionally change trajectories;
    target markings/gates observe, and marker-only obstacles do not collide.
17. **All 28 classified:** yes, with direct, dynamic and declarative source evidence.
18. **No demonstrated influence:** sprint negative controls do not prove intended
    contexts unused; the explicit coverage findings and deficiencies separate them.
19. **Overload/redundancy candidates:** see measured context overlaps and plateaus;
    no schema change or global redundancy claim is made.
20. **Physical/tactical/career:** source roles and the coverage table distinguish
    execution, candidate/decision, fitness, keeper and career consumers.
21. **AI prediction accuracy:** sampled kick forecasts and post-release flight
    consistency are measured; general autonomous success calibration is not proven.
22. **Urgent dependencies:** the deficiencies below prioritise physical/control
    coverage and prediction semantics before coefficient or schema changes.
23. **Exact references:** none fully reproduced; 505 geometry is retained and its
    body-centre protocol limitation is explicit. LSPT is reference-only.
24. **Repeatability:** paired 30-seed designs, exact input/result hashes, full traces
    and replay checks; no independent-athlete claim for identical locomotion runs.
25. **Headless:** yes, including all experiments and result replay.
26. **Visual replay:** complete positions are exported; an existing-renderer adapter
    and browser view are future work, not a completed verification claim.
27. **Matches/saves:** isolated copied state and unchanged football paths, with full
    regression verification recorded above; no career mutation or migration.
28. **PR185/186 priority:** broaden actual physical/keeper/contact protocols, then
    calibrate demonstrated execution and decision errors and consider schema changes.
