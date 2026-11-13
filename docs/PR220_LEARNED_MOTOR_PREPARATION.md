# PR220 — Learned football motor primitives and pre-commit body placement

**Decision · EXPAND_INVESTIGATION / RETAIN_EXPERIMENTAL.** This PR adds a controlled laboratory objective and the evidence needed to evaluate it. In the tested windows it lost contacts and recovered none against its time-matched controls. The maintained recipe remains PR201/B. Single Match Lab and ordinary career continue to use their existing editions.

## Work stages and decision gates

1. Audit the source and frozen results through merged PR219.
2. Replay a short prefix of the native PR218 match and capture the actual pre-commit inputs at the resolver boundary. Check the baseline identity before making a counterfactual.
3. Test A/B/C and the timing, foot and forecast controls through the same canonical executor. Keep failed arms, first contacts, release decisions and loss of opportunity as distinct observations.
4. A live integration requires evidence of gain on native failures with successful controls preserved. The laboratory objective is the smallest tested implementation at this gate. A reception handoff and a new integrated smoke require a candidate with demonstrated value.

Base `1e2ebdce868efaac81191908db08c796019ec949`. The [PR195 audit](PR195_MATCH_ENGINE_ASSUMPTIONS_AUDIT.md), [assumptions registry](match-engine/ASSUMPTIONS_REGISTER.md) and [realism progress](match-engine/REALISM_PROGRESS.md) retain their original classifications. PR203–206 supply prospective recognition, local perception and preparation evidence. PR207–211 supply finite contact, ground continuity, temporal strikes and separate human readiness. PR212–214 share standing/ball/body event order. PR215–218 add playable integration, finite gait, support/traction and post-impact remainder handling. [Architecture](match-engine/INTEGRATION_ARCHITECTURE.md) · [Compatibility](match-engine/HOLISTIC_COMPATIBILITY_MATRIX.md) · [PR218 v2 gates](PR218_STANCE_V2_GATE_REPAIR.md) · [PR219 evidence](PR219_BALL_ANTICIPATION_AND_TECHNICAL_PREPARATION.md).

## Motor skill inventory

The five stages map to the authorities below. Gap categories apply to the specific family and selected edition.

| Family | Recognition and intention | Anticipatory positioning | Body and supporting foot | Execution | Recovery and next action | Principal open gap |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary grounded pass | `matchActions.chooseNpcRoutineAction`, policy ranking and `playerDecision` | `onBallPreparation` selects local scanning and alignment | `articulatedGait` and `decisionReadiness` expose the actual stance and a current contact window | `pendingStrike.commitPendingPass` and `pendingStrikeInterval` own the finite selected low-pass swing | `beginFootRecovery` and the shared continuation restore ordinary play | Scheduling and learned pattern. The current release window admits some strokes whose body configuration cannot deliver the requested path. An early, feasible plant and active-foot objective is missing. |
| Ordinary first touch and directional reception | `localReception`, `preReceptionPlanning`, human incoming choices | `passReception`, `receiverReadiness` and `ballOrientedMovement` select a meeting and movement | Canonical gait and contact access establish the actual pose at arrival | `firstTouch`, `footContact` and shared low-ball contact resolve the impulse and retention | Control, loose-ball pursuit or `preparedContinuation` follow the touch | Incomplete integration and perception. PR206 measured a handoff discontinuity between observed preparation age and the physical preparation input. |
| Receive and turn under pressure | `preReceptionPlanning` proposes a next action and `onBallPreparation` reacts to pressure | Incoming meeting and local pressure-side movement | Finite turning and plant balance through `canonicalMovement` | Directional first touch and shielding use finite contact | `carryExecution` and on-ball continuation take over | Learned movement pattern and calibration. The receiving turn needs a coordinated plant and outlet movement across the contact, including timing against a challenger. |
| Carry and change direction | Carry/retain choice through `matchActions` and `carryOpportunity` | `carryExecution.deriveCarryExecution` selects local route, protection and touch objective | `locomotion` and `articulatedGait` brake and turn | `footContact` selects supported surfaces and the ordinary interval arbitrates | `carryPursuit` pursues an actual loose touch | Learned movement pattern and calibration. Brake, touch and re-accelerate need a timed sequence around support and pressure. |
| Standing tackle and interception | `defensiveChallenges` evaluates access and chooses an approach | Pressing and ball-oriented locomotion close the gap | Finite stance and challenge load constrain the attempt | PR212/214 standing poke uses the shared contact timeline and competing events | Challenge recovery and actual loose-ball or clean-win state | Scheduling and incomplete integration. Time the plant and poke against the observed opportunity. Slides and complex collisions need separate physical coverage. |
| Basic shot | `shootingOptions` and `playerDecision` select a legal shot | On-ball preparation clocks and orientation | Gait and plant balance are available | `kickExecution` has finite impact in its scope. The canonical pending low-pass timeline covers passes. | Existing shot flight, keeper response and generic next play | Scheduling and incomplete integration. A settled shot needs a finite run-up, plant, stroke and recovery on the shared timeline. |
| Heading and aerial reception | `aerialPlay` and `aerialPositioning` evaluate contests | Jump timing and arrival targets | Existing ballistic jump and articulated legs | Existing aerial contact families and locks | Generic landing, recovery and second-ball positioning | Physical representation and calibration. Full head/torso geometry, planned neck/body contact and landing transitions are open. |
| Goalkeeper preparation | `goalkeeperPositioning`, `goalkeeperIntervention` and `liveBallFlight.boundedKeeperCommand` | Goal coverage and observed interception approach | Finite locomotion and projected reach | Existing save/claim/handling and rebound ownership | Distribution, second saves and recovery to position | Physical representation and incomplete integration. An articulated set step, dive, landing and next save require keeper contact geometry and motor phases. |

Source paths are under [matchSimulation](../src/core/matchSimulation). The shared priorities are an earlier observable motor opportunity, a feasible contact/plant objective that survives existing gait transitions, and a handoff from real contact to recovery and the next action. Candidate generation, ranking and execution admission remain separate possible causes. PR219's sampled passing-lane rankings motivate a distinct tactical audit.

## Controlled replay and intervention

The first 104 seconds of the PR218 attempt-6 native input yield six archived attempts. A reproduces all six by ID, outcome, reason and event time within 0.1 μs. Each intervention starts from the same captured pre-commit state, action, source and seed. The canonical contact executor runs through the swing, interruption or cancellation. The research loader witnesses the canonical movement boundary, postpones routine decisions for the tested owner in that window, and leaves other players and physical events in the simulation. It bypasses duplicate agency probes during the isolated forks. The prefix uses the original human menu rule. New laboratory continuation tests use the spectator/NPC and human-selected resolver sources. Product menu behaviour with a live preparation lifecycle remains a future gate.

| Arm | At the pre-commit boundary |
| --- | --- |
| A | Direct PR218 nominal swing. |
| O | Direct PR219 observed swing. |
| D | Wait with ordinary movement, then use the nominal swing. |
| E | Same wait with body placement, then let the nominal executor choose its foot. |
| B | Same placement with an explicit active-foot objective when the action leaves the foot open, then use the nominal swing. |
| P | Same wait with ordinary movement, then use the PR219 observed swing. |
| C | Same wait with placement and the PR219 bounded prediction and swing. |

The experimental objective in [passBodyPlacement](../src/core/matchSimulation/passBodyPlacement.ts) consumes PR219's current or recent optical sighting and nominal articulated foot geometry. It selects a desired root/facing and uses the opposite foot of the current support where possible. The body uses the existing walk-speed motor with actual balance, acceleration and traction. Gait selects where and when the feet really plant. The 0.12 m approach margin is a provisional engineering objective. The runner lets observations revise it before commitment. It gives each arm at most one committed swing, whose seeded perturbation, actuator envelope, contact ordering, cancellation and recovery remain with the canonical executor. Preparation is scoped to each trial and uses no new native state.

The final receipt has 735 arms across six native and 39 constructed inputs. The windows are 50, 100 and 175 ms, plus a 25 ms control on otherwise playable inputs. Window variants share seeds and initial state. The commanded movement can change later ball contacts and therefore later sights. The constructed velocity-change scenario applies the same explicit apparatus disturbance if the original opportunity remains. The no-observation control removes acquired evidence before it reaches the laboratory consumer. An immediate arm can resolve before a later disturbance.

## Results

| Native action | A | D at 50 ms | E at 50 ms | B at 50 ms | P at 50 ms | C at 50 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 4, moving ball and timing residual | Miss | Miss | Miss | Miss | Miss | Miss |
| 7, initial swing scale 1 | Miss | Miss | Miss | Declined | Miss | Declined |
| 17, competing action | Interrupted | Interrupted | Interrupted | Interrupted | Declined | Declined |
| 24, stationary ball | Miss | Miss | Miss | Miss | Miss | Miss |
| 40, competing action | Interrupted | Opportunity lost | Opportunity lost | Opportunity lost | Opportunity lost | Opportunity lost |
| 50, successful control | Contact | Contact | Contact | Miss | Contact | Contact |

- **Cause of the historical misses.** PR219 measured clipping in 133/159 misses and 54/84 contacts, with an absent plant sample in 123/159 misses and 54/84 contacts. In action 4 the ball was 0.277 m from the intended point near contact. O and P produced unscaled strokes that still missed. In action 7 A missed with scale 1 and started with the active foot as support, while retaining default foot selection in E kept a swing available. Action 24 missed on a stationary ball at scale 0.452. Its 50 ms B objective still had about 1.00 m root error and 0.45 m plant error. This controller could not reach that objective in the available time. These measurements leave the split between body placement, available time, stroke timing, foot choice and interference unresolved for the 159 historical misses.
- **Preparation and window cost.** B gained zero and lost 41 physical contacts against D across matched windows. E gained zero and lost 39 against D. B lost two more against E. The shorter 50 ms B lost the successful native control even though D and E retained it. At 175 ms every delayed arm declined that control because the ordinary release window was in motor recovery. Some comfortable setups attained contact with preparation, including all three stationary seeds at every tested window. The study found no preparation-assisted recovery of the selected native misses.
- **Forecast and moving balls.** On the lateral input A/D/E/B had 0/3 contacts. O and each P window had 3/3. C had 2/3, 0/3 and 2/3 as the window increased. C gained zero and lost 35 contacts against P overall. The receding input had 0/3 in A, 3/3 in O and all D/P windows, and 2/3, 0/3, 0/3 in C. Fast incoming contacts were 3/3 in A/O and lost across delayed arms. The gain seen in the initial lateral pilot is attributable to the forecast/swing path on these matched cases.
- **Negative controls.** No arm contacted the unreachable configuration. The 25 ms sample remained playable on its own, so it establishes a short-window boundary without demonstrating a failure caused by insufficient time in isolation. In the pressure fixture all 100 ms delayed arms were interrupted by a competing foot and by 175 ms the opponent already owned the ball. Stale observation produced no observed strike or laboratory motion. Actual post-selection velocity changes, support release and post-impact recovery appear in the raw frames. The paired runs had no safety halt. The historical articulated-body tests exercise post-impact remainder handling and retain the existing motor and solver limits.
- **Attributes.** At 50 ms in the offset C scenario, technique 25/60/95 reduced mean absolute seeded timing error from 3.78 to 2.39 to 1.00 ms. All three levels made 3/3 contacts at that window. The sensitivity comes from existing execution code, with a common geometric objective and the same 28-attribute model. It does not establish calibration or monotonic contact rates.
- **Native round-trip.** Reload on every step of the isolated preparation, commitment and recovery produced equal native terminal and renderer-frame fingerprints on three checked paths. The pressured trace's raw challenge target contains extra ball fields on the live object. The existing native schema retains x/y and strips those extra fields. The receipt keeps both raw targets and checks the entire semantic trace with that one target normalization. The laboratory driver supplies the same action and remaining window across reload. There is no new saved preparation lifecycle.

## Reception transfer and integration decision

A repeat of the [PR219 reception matrix](performance/pr220/reception-baseline.json.gz) reproduced its published counts. Lateral clear approach reached initial contact, first control and ownership at 600 ms in 9/9. Under pressure it reached 9/9, 9/9 and 0/9 respectively. The overlapping lateral input still stops conservatively in all nine trials. Incoming/outgoing velocities and the first control timestamp are in the receipt. This runner does not report the first subsequent feasible-action time. A B/C transfer would require an observable receiver plan, plant/active-foot ownership through the ordinary shared contact and a continuation command. The strike intervention failed its gate and the receiving contact contract lacks that validated handoff. Reception transfer therefore remains unmeasured.

**Integration effect.** The preparation objective stays in the research runner. The sole runtime-module change exposes PR219's existing sighting helper to that runner and leaves its logic intact. The same 40 Hz integrator, 28 attributes, shared solver tolerances, PR201/B and career defaults apply. Existing physical editions, historical CI contracts and the sealed confirmation corpus are preserved. No realism registry dimension is promoted.

**Next dependency.** Capture lawful preparation before the current release window and test a support-phase commitment with evidence that the actual foot will be ready. Audit loss of contact caused by changes in the root objective and the selected swing independently. Full non-boot action/recovery geometry matters for tackles, aerials and collisions beyond low passes. Natural running flight, stud slip/recovery, 3D centre of mass/falling and keeper-specific landing are later physical work. Tactical ranking, advanced tricks and intermittent effort/fatigue have separate milestones. The present results do not clear a new 22-player smoke or a full-match integration gate.

## Raw evidence and replay

Use Node 24.22.1. The final archive records all measured arms, actual and observed ball frames, body and pelvis orientation, root velocity, support state and target errors, joint workspace, planned path, physical receipt, interruption, recovery and native/render fingerprints. The source manifest hashes normalized source bytes. Intermediate branches preserve their exact source. The PR219 replay input and receipt are read directly from their historical archives.

```sh
node --experimental-transform-types --import ./scripts/registerPr220Lab.mjs scripts/benchmarkPr220Placement.mjs final --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Reception.mjs
```

| Evidence | Measured source | Reproduction |
| --- | --- | --- |
| [Final receipt](performance/pr220/final.json.gz) | `d80a8e4afd17e959c72b6ae8f563d28b900fbbebe590285d909528ef6c1264d7` | First command above. |
| [Window and observation controls](performance/pr220/bounded-windows.json.gz) | Manifest `386ab03adb8c1c7f1e455bed105916d1ae46881075d57a234cbc396d7695e17b` binds the intermediate worktree before the E ablation. | Original command `node --experimental-transform-types --import ./scripts/registerPr220Lab.mjs scripts/benchmarkPr220Placement.mjs bounded-windows`. The final matrix repeats these controls and adds E. |
| [Initial pilot](performance/pr220/pilot.json.gz) | Commit `a5abca7f873b5d4f0e0e1e7df0537cf1783b0d08` | Use the first command at that commit with `pilot` as the last argument. Its early stale-sight setup allowed fresh reacquisition. |
| [Reception baseline](performance/pr220/reception-baseline.json.gz) | Merged PR219 runner, repeated on PR220 | Second command above. |

The initial native check of the pressure control failed on the extra live target fields. The final receipt preserves that discrepancy while comparing normalized native continuation. Both historical variant archives include all unsuccessful and inconclusive results.
