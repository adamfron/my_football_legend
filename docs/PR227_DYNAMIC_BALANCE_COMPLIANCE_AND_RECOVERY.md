# PR227 — Dynamic balance, compliant contact and recovery

**Decision — RETAIN_EXPERIMENTAL.** Single Match Lab recipe G adds a reduced angular body, bounded support, a finite corrective step and reaction to incidental ball and player impulses. G advances the frozen 52:57, 63:12.875, 71:58.875, 89:51.125 and independent 134.387 s contact cases under the existing solver limits. Four archived restart stalls still reach legal release. All three 22-player starts now reach 180 seconds. The historical F traces reproduce. Time-dependent ball compliance, body–ground impact and get-up from a fallen pose remain open.

## 1. Starting point and sequence of work

PR226 merged into `main` at `14dd34bdfcf4ad3da4fe018cab06eb4f3e74918c`. Its final head `f52acaa568f6f5df9e0d2a82f7d560ab8a662e8b` has the same tree `f0dc762a3c080fe71e2b5e0708099693d17b89e1`. The final PR226 GitHub Actions run passed. [PR226](https://github.com/adamfron/my_football_legend/pull/226) · [PR226 CI](https://github.com/adamfron/my_football_legend/actions/runs/44961469675).

1. Replay the original PR223–PR226 sources and reconstruct 89:51 and 63:12 separately.
2. Add versioned body state over the 19-segment skeleton and the existing stance, rebase and action paths.
3. Verify impulse transmission, traction, slip and corrective stepping. Test the free-flight search bound and compliant normal-pair law independently.
4. Compare native checkpoints, real actions, replay parity and 22-player windows. Run full matches only after the developmental windows pass.

| Edition | Executing identity                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR201/B | Maintained `realism-candidate-v1` with policy B at 40 Hz                                                                                         |
| PR223/D | Historical articulated stance and parked remainder                                                                                               |
| PR224/E | Historical composed leg contacts and original rebound                                                                                            |
| PR225   | Canonical skeleton and individual geometry, with the E lab selection                                                                             |
| PR226/F | `holistic-limb-impulse-dev-v1`, coupled leg impulse                                                                                              |
| PR227/G | `holistic-dynamic-balance-dev-v1`, finite limb-impulse feedback and a certified free-flight prefix. New matches select `dynamic-balance-dev-v2`. |

The selector is explicit. Older native saves may omit it and the balance fields. G recordings carry the edition and torso angles in compact replay. The 28 permanent attributes, human command selection and NPC decision policies retain their contracts.

## 2. Physical ownership

| Owner                                    | Path                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical movement and articulated gait  | Existing root motor and stance advance. G gives the stance a correction target and can release or slide an overloaded anchor.                                                                                                                    |
| Full-body skeleton                       | World joint and segment transforms supply the mass geometry and replay pose. Pitch and roll rotate the pelvis, spine, head and upper limbs. Anchored ankles and leg IK keep their world-space constraints.                                       |
| Shared contact interval                  | The actual event and time supply the impact point. Ball-to-player reaction rebases the remaining root path. Body-to-body contact uses the existing pair or cluster owner for translation and supplies its consumed impulse to the angular state. |
| Ball contact resolution                  | The same impulse sets ball translation and spin. In G, effective body mobility contributes to the impact denominator and opposite reaction.                                                                                                      |
| Ball physics and the supported transport | Ground and boot chronology determine the true ball sample at each queried time. A bounded prefix can certify where the free trajectory is valid.                                                                                                 |
| Referee, action and ownership            | The existing rules process observed challenges, advantage, legal restarts and the next action. A solver halt remains a physical diagnostic.                                                                                                      |

The upper-body orientation is part of the canonical pose. The active upright torso collision proxy retains its existing dimensions and axes. Segment-level ground collision and a tilted torso collision proxy require their own continuous geometry work.

## 3. COM, inertia and support

G applies each segment's reference mass fraction to the midpoint of its current canonical endpoints. Summing those vectors yields the three-dimensional centre of mass in metres. Finite differences of successive available poses estimate its velocity. The angular state integrates world X/Y angular momentum in `kg m²/s`, with angular velocity given by diagonal inverse inertia. The inertia sums distributed segment approximations and the parallel-axis terms about the COM in `kg m²`. Vertical root motion retains the canonical jump and articulated pose constraints.

Mass fractions sum to one. Pelvis, lower trunk, thorax, neck and head use 14%, 13%, 16.4%, 1.2% and 5.7%. Each arm contributes 2.7%, 1.6% and 0.6% at upper arm, forearm and hand. Each leg contributes 14.2%, 4.3% and 1.45% at thigh, shank and foot. Girdle mass is grouped with the thorax. These rounded engineering groupings and uniform segment midpoints approximate the reference study. Individual geometry moves the mass and changes leverage and inertia at the same player mass. [de Leva, 1996](https://pubmed.ncbi.nlm.nih.gov/8872282/).

The designated stance boot at ground height supports the quasi-static load `N = mg`. Swing and airborne phases supply zero load when there is no grounded anchor. The inherited surface coefficient bounds translational motor impulse by `μ N Δt`. The angular controller uses a limited centre-of-pressure arm and available traction to oppose tilt and angular rate. At a chronological rebase, the tick has already spent the nominal motor budget, so the rebased remainder earns no additional restoring moment. The model represents one nominated load-bearing foot per player. Dynamic two-foot load distribution and vertical support shocks remain open.

At the stance reach limit, the loaded anchor can slide in the outward root direction by at most the smaller of the reach excess and the distance corresponding to outward speed beyond `μg Δt`. The foot retains its ground height. Existing IK checks both legs. A low-load control retains the anchor, and the slip control measures finite displacement on the same support foot.

## 4. Perturbation and recovery

The contact point and current COM form the moment arm. Pitch/roll momentum changes by the corresponding components of `r × J`. An incidental limb contact adds `−Jxy / m` to the canonical root velocity through the shared rebase. The body solver already applies the opponent's translational reaction. Its angular load uses the recorded pair impulse and an assumed torso-height lever arm. The unmodelled vertical component of ball reaction is available in the load receipt.

G uses current tilt and angular rate to select the direction of a step. It requires a grounded stance and an available swing foot, checks the target against actual leg geometry and predicted root travel, and executes through the existing stance clock and swing-speed limit. An active football foot retains priority. Focused tests cover a small impulse with no recovery step, a disturbance with finite swing and replanting, and a stronger disturbance that reaches the bounded tipping state. Loss stops the ordinary motor and remains in the native state until the body can recover. The angular model remains bounded at 0.5 rad. Body–ground impact and getting up from a fallen pose remain dependencies.

Edition `dynamic-balance-dev-v2` uses the actual stance to recover from the reduced loss state. A grounded support boot dissipates horizontal speed by at most `μg Δt` and opposes yaw with the existing resistance bound. The root keeps its integrated motion and the planted boot can slide at the reach boundary over the residual outward travel. The angular controller uses the same centre-of-pressure limit and the friction left after braking. The ordinary motor resumes once both boots are down, the body has a designated grounded support and there is no active action foot. The root must be slower than 0.1 m/s, with at most 0.025 rad of tilt and 0.12 rad/s of pitch/roll speed. An airborne or unsupported player earns no ground braking or restoring moment. Native saves and replays carry the edition. The earlier balance edition remains executable for comparison.

## 5. Compliant ball contact and work

Isolated contacts can use the reduced body's effective contact mass. The simultaneous normal solve uses the forward velocities of the actual capsules because torso rotation does not drive the lower-limb IK. G adds the reaction's displacement to the remaining root chord and retains the ankle chord already issued by the motor. During a witnessed alternating shin encounter, a short-range approaching counterpart reduces restitution and tangential response to zero on the struck surface. The second shin receives an impulse only when the original geometric contact tolerance admits the measured pair. The 5 mm observation band and 9 ms history are development parameters for this dissipative branch. Collision radius, detection tolerance and search budgets retain their physical definitions.

After a confirmed press by both shins, a free swing can yield horizontally. The model projects the measured normal impulse through the finite-difference derivative of the shin gap with respect to the ankle. Effective swing mass comes from the shank and foot fractions. Each swing's recoil energy is bounded by one quarter of the joint normal response's dissipated energy. The new ankle endpoint must satisfy the original swing speed and canonical IK, and the ball receives no corrective position shift. The two shins remain in the continuous search after this response.

The offline compliant pair uses unilateral Kelvin–Voigt compression with backward Euler and four possible active sets. Depth is in metres, closure in `m/s`, stiffness in `N/m` and damping in `N s/m`. Storage is `½k δ²`. The midpoint impulse work gives the kinetic change of the normal modes. Their energy decrement after subtracting storage is reported as dissipation, including numerical dissipation from backward Euler. Active contact requires a nonnegative force, and depths over 25 mm produce an unsupported result. The trial uses measured incoming normals and velocities from F's synchronous knee–thigh contact, fixed local normals, finite participant masses and 1 ms development steps.

|  Stiffness | Peak depth | Peak stored energy | Dissipated over 40 ms |
| ---------: | ---------: | -----------------: | --------------------: |
| 10,000 N/m |   12.45 mm |            0.826 J |               1.643 J |
| 20,000 N/m |    9.14 mm |            0.879 J |               1.587 J |
| 40,000 N/m |    6.48 mm |            0.883 J |               1.586 J |

The energy residual is below `7 × 10⁻¹⁶ J` on these trials. At 40 ms the softest run retains about 79 μm of compression on one patch with zero applied impulse. The other runs reach zero depth. This calculation tests bounded storage and release in the reduced normal modes. The three stiffness values and 30 `N s/m` damping are development parameters. High-speed instep measurements show deformation and millisecond-scale interactions, and their geometry differs from a shin pinch. [Shinkai et al., 2009](https://pubmed.ncbi.nlm.nih.gov/19276844/).

The experiment requires a certified multi-surface interval before it can take ownership of live ball motion. The live ball keeps its existing 0.11 m detection radius and ground rebound. In the refined football continuation receipts the largest G ball impulse-account residual was about `5.68 × 10⁻¹⁴ J`. That identity covers ball kinetic energy and measured contact work. A complete human–ball work account would also need muscle work, vertical impulses, the ground constraint and independently validated limb motion.

## 6. Source-bound checkpoints

The [original checkpoint archive](performance/pr227-checkpoints.json.gz) preserves the first PR227 candidate. The [refinement archive](performance/pr227-contact-refinement.json.gz) records input digests, ordered events, contact work, endpoint geometry, maximum sample counts and G continuation. The reproduction command checks serialized F traces against the original archive. The 26 F continuity scenarios also reproduce byte for byte. An event from a rolled-back tick is an attempted response.

### 89:51.125 — alternating shin pressure

The ball enters at `(50.657, 56.276, 0.258)` m, moving near `(-1.861, 1.652, -0.910)` m/s. The first opposing traces involve right shins of `footballer_pro_9_18` and `footballer_pro_1_10`. The former is on its right anchor, with the ball-side patch moving about `(-0.029, 0.400, -0.004)` m/s. The latter carries its load on the left anchor while the right patch moves about `(-1.227, 1.420, -1.379)` m/s. Local normals have opposing horizontal components. The two first measured incoming normal speeds are about −1.54 and −1.43 m/s. The archive preserves the contact poses, plant coordinates, tangential components and commands alongside three early body clusters. It gives no clearance certificate or synchronous active pair before the halt, and establishes no offence.

F attempts 13 limb responses and approaches a 96 ns gap between events before rollback. The first G prototype also rolls back. Refined G commits the tick with 13 events across the shared timeline and five limb responses. The two dissipative returns occur when the previous shin is separated by 1.61 mm and 43.4 μm, respectively. The synchronous impulse follows at 13.937 ms into the tick. The right swing ankle of `footballer_pro_1_10` moves about 1.45 mm from its commanded endpoint. Its relative recoil uses 0.0375 J of the joint response's 0.2017 J dissipated work. The ball's impulse-account residual stays below `1.2 × 10⁻¹⁶ J` for this tick.

With the same root and ball endpoints and the original ankle target, the swing-side capsule would overlap the ball by 0.350 mm. The executed swing leaves 0.854 mm of clearance. The grounded shin leaves 2.263 mm. Rechecking both shins certifies the tail through four clear search frontiers and a final clear segment. The case uses 1,417 geometry samples across multiple calls and at most 192 in any single search. Play continues for 300 ms beyond the original tick without an invented owner or offence.

### 63:12.875 — near-ground graze

The ball is roughly 43 μm above the pitch, with an existing right-boot support and micro-bounces. Many of the late F prefixes show the supported point equal to the free-flight point and the boot slightly clear. A later possible bounce or projection prevents F from offering the tighter acceleration bound over the whole candidate interval. It spends 3,150 samples across 51 calls and halts with no new limb impulse.

G asks how far the _same_ free-flight equation can be certified before either a pitch crossing or any possible boot correction. It uses the existing analytic ground root and the affine boot squared-distance lower bound. The short prefix gives the existing relative-chord separation search a bounded acceleration. All other branches still use the existing fallback enclosure and sample cap. G uses 505 samples in 15 calls, completes the 25 ms interval, preserves the owner and records no new limb impact. Ordinary ground bounces remain under the ball integrator. A kinematic intersection control and the ground-root crossing control continue to admit actual contact. This is a result on the frozen tick, with no claim that the historical match would now finish.

### Knee–thigh and earlier pressure

At 52:57 the first G prototype treated torso mobility as instantaneous motion of the knee and thigh and reissued the ankle trajectory after each recoil. This caused an additional contact at effectively zero elapsed time. The refined G rebase keeps the ankle motion and solves against actual forward velocities. It commits with the existing 16-event budget, one simultaneous response and final gaps of 3.895 mm at the knee and 1.538 mm at the thigh. The 650 ms continuity window completes.

At 41:56 refined G runs the 650 ms window with the ball loose at 600 ms. The stored F path still records two retained boot touches and has `footballer_pro_1_4` on the ball at 600 ms. The original PR223 parked-foot and post-impact evidence replays against its own commit. [Original continuation archive](performance/pr227-continuity.json.gz) · [Refined observations](performance/pr227-contact-refinement-windows.json).

At 71:58.875 the same player's two shins press the ball during a right-to-left support transfer. After 12 individual contacts, the measured pair admits a positive impulse at each shin. In this grounded handover the pair returns a fraction `e²` of the compression work, using the existing `e = 0.38` limb restitution. The equal release coefficients along the two normals yield about 0.258 m/s opening speed at each measured patch. Both impulses load the same body in one rebase. The outgoing support foot holds its anchor and the incoming foot yields 3.90 mm before landing. The swing uses 0.250 J and the ball contact frame dissipates 1.001 J. The continued search certifies the rest of the tick. It commits with 13 of 16 shared events, a peak 60 of 192 limb geometry samples per search and 6.810/8.888 mm of shin clearance. The 650 ms continuation has no halt. A separate boot-and-shin sequence in the very next tick still ends with 16.9 mm of right-shin overlap. [Support and restart receipts](performance/pr227-support-and-restarts.json).

At 134.387 s in the independent run, the right foot of `geometry:anchor:9` stays planted while the left shin sweeps across a ball that starts at rest on the turf. In the earlier replay, one body collision precedes the shin contacts. The ball bounces on the turf after the first impact, then alternating shin rebounds approach a simultaneous squeeze. After the joint response, small changes in limb velocity cause two more contacts at the same clock. The interval spends all 16 events with another boot contact still ahead.

In current G the third shin contact at 11.759 ms provides the first pressure witness. The previous shin is 1.689 mm away and the measured closure between the patches is 7.071 m/s. When the same foot stays grounded across the tick and the other foot is free to swing, the existing dissipative response treats the repeated arrival as compression. Restitution and tangential impulse are zero for these witnessed single strikes. If the impulse is on the swing shin, the existing ankle recoil uses its normal impulse and at most a quarter of the contact-frame work dissipated. The two swing responses spend 2.840 J and 0.337 J. The support ankle keeps its world position. The ordinary search still races the subsequent boot, shin and turf response. The tick finishes with 12 of 16 shared events and reaches, without exceeding, the existing 192-sample search budget. End-of-tick clearances are 31.200/98.336 mm to the shins and 15.115/96.173 mm to the boots. The loose ball continues for the 650 ms observation. [Frozen source, contact sequence and work](performance/pr227-independent-contact.json).

## 7. Referee and football continuity

Law 12 separates legal shielding of a playable ball from holding a player, impeding with contact, and playing dangerously. Holding and impeding with contact are direct-free-kick offences, whereas playing dangerously and impeding without contact ordinarily use the indirect restart. Existing challenge and advantage consumers retain their ownership. The late-shin F halt and G clearance preserve the original discipline state. The existing discipline regressions cover the established offence and legal-contact paths. [IFAB Laws of the Game 2026/27, Law 12](https://www.theifab.com/laws/latest/fouls-and-misconduct/).

G reproduces the executed ordinary and moving low passes at 10.088 and 10.067 s and the clean swing miss. It preserves the first touch at 10.366 s with no second retention in the early-lateral case. In pressure the opponent still owns the ball at 600 ms. The early-pressure release seen in F is absent in G; the stronger-pressure and unreachable scenarios still fail to retain or make contact as applicable. The regression at 41:56 blocks any general claim about second touches. Source variants cover asymmetric leg lengths, knee alignment, proportions and foot sizes. The additional stress body changes COM and inertia without altering the player's profile.

G now assigns the retrieving and taking roles independently to teammates with an available grounded motor. A lost handler releases the ball from its current world position. The new handler approaches and transports it, and the liveness observer uses the distance remaining for that part of the approach or transport. Existing readiness and opponent restrictions govern release. A ball already placed remains available if its retriever then loses support.

| Archived G restart | Source state | Result                                                                                         |
| ------------------ | -----------: | ---------------------------------------------------------------------------------------------- |
| Paired throw-in    |     56.350 s | New carrier and taker. Legal release at 68.350 s.                                              |
| Native-a goal kick |     72.425 s | The existing goalkeeper takes over retrieval. Legal release at 91.925 s.                       |
| Independent corner |     97.000 s | Ball placed at 123.750 s. Two opponents in the loss state are too close at the 153.750 s halt. |

In the earlier corner replay, the two opponents were about 0.459 m and 7.214 m from the corner. Both counted towards `opponent_restriction`. If nobody on the restarting team could retrieve, the detached ball continued its trajectory while the unresolved award stayed in preparation. [Earlier source snapshots and release evidence](performance/pr227-support-and-restarts.json).

The three later G v1 halts have the same underlying cause. All 56 players in the loss state across these snapshots still have a designated grounded boot. Their last recorded loads are opponent impulses. G v1 permanently disabled both horizontal braking and the restoring moment after entering `lost`, so the affected players could drift but could never regain the motor needed to retrieve or take legal positions. The legal checks exposed different consequences of the same loss.

| Frozen award                | Exact blocker in G v1                                                                                                                                                                                    | Result in G v2                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Paired kickoff after a goal | Ball and taker ready. Seven participants in the wrong half were all in the loss state. The assigned taker was also the home goalkeeper, whose tactical starting depth conflicted with taking at halfway. | Recovered players return to legal positions. The goalkeeper takes the kickoff at 140.600 s, 22.600 s after the snapshot. |
| Native-a throw-in           | Ball already placed. The last taker was 16.620 m from the spot and the restarting team had zero eligible players.                                                                                        | A recovered outfielder takes the throw at 151.125 s, after 16.975 s.                                                     |
| Independent corner          | Zero eligible home players. The ball was still beyond the goal line with no retriever.                                                                                                                   | A recovered team retrieves and places the ball. The corner executes at 155.425 s, after 37.400 s.                        |
| Earlier independent corner  | The keeper could retrieve, but two opponents in the loss state were unable to clear the distance restriction.                                                                                            | Opponents clear the required area and the corner executes at 124.275 s, after 27.275 s.                                  |

The kickoff exemption applies to the keeper's tactical goal-area positioning only, while that keeper is the current taker. Legal requirements for position, distance and the ball still apply. The restart observer reports `no_available_restart_handler` when there is genuinely nobody to retrieve and starts a new observation when the balance edition changes. The 30/10-second observation budgets remain the same. Each replay preserves its award and verifies movement of the released ball. [Source hashes and comparison receipts](performance/pr227-grounded-recovery.json).

## 8. Integration windows, cost and gates

G v1 was rerun from all three source kickoffs in the previous follow-up. Its three uncapped runs halted during restart preparation. The [G v1 window receipts](performance/pr227-followup-match-windows.json) link each halt to a native snapshot. The [previous windows](performance/pr227-contact-refinement-windows.json) and [original performance receipts](performance/pr227-match-windows.json) preserve the earlier stops and paired 8-second F/G cost comparison. Pose timing covers skeleton composition and validation. Three.js scene update and end-user browser frame time remain unmeasured.

| Paired 8 s, untraced  |              F |               G |
| --------------------- | -------------: | --------------: |
| Mean tick             |        2.31 ms |         4.16 ms |
| P95 / P99             | 4.94 / 8.78 ms | 7.28 / 13.31 ms |
| Peak sampled heap     |      142.6 MiB |       195.3 MiB |
| Terminal native state |      226,488 B |       242,730 B |
| Terminal replay frame |       70,750 B |        71,909 B |

The separate traced sample estimates 1.63 ms of inclusive balance work per tick from nine sampled ticks. The sampled windows show up to 22 load-bearing feet across participants. In the paired 8-second G window, 27 of 176 sampled player-frames are in the loss state. Those repeats measure persistence, and may include the same player across several samples. This rate, the 80% mean CPU increase in the matched local sample and the early halts block promotion. Heap measurements are snapshots of an allocating process under Node, so the difference includes garbage-collection timing.

| Start             | Historical F               | Earlier G v1 halt           | Follow-up G v1 120-second window     | G v1 uncapped attempt                                                                |
| ----------------- | -------------------------- | --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Paired            | Physical halt at 89:51.125 | 56.375 s, `ball_not_placed` | 118.025 s, `participant_restriction` | Same halt. Lost players cannot return to legal kickoff positions after a goal.       |
| Native-a          | Physical halt at 63:12.875 | 72.450 s, `ball_not_placed` | Reaches 120 s                        | 134.175 s, `taker_not_ready`. The ball is placed by the time the last taker is lost. |
| Independent PR214 | Full time, 1:1             | 97.025 s, `ball_not_placed` | 118.050 s, `missing_retrieval_state` | Same halt. No eligible teammate is left to retrieve the ball for a corner.           |

The first G v2 windows reach 180 seconds with paired 1–0 and native-a 0–0. Independent reaches 134.375 s, then rolls back an open-play interval at 134.387 s with `pendingStrikeInterval.event_budget`. [Earlier G v2 windows and the original halt](performance/pr227-grounded-recovery-match-windows.json).

With the grounded shin pressure response, all three starts reach 180 seconds with zero invalid sampled poses. Paired and native-a reproduce their terminal hashes and seven restart awards each. Independent reaches 180 seconds at 0–0 with eight restart awards. The four frozen restart receipts reproduce exactly.

The longer paired and independent attempts advance through 660.025 s. They were stopped by the operator after that sample to free the local verification workers. Native-a halts at 372.175 s while preparing a throw-in. The ball and taker are ready, and two opposing players are about 1.95 m from the award spot. The control rerun on `fa07a3c` reproduces the same halt time, terminal state hash and native snapshot bytes. [Current match windows, longer attempts and the native-a snapshot](performance/pr227-independent-contact-match-windows.json).

| Gate                              | Verdict                      | Evidence                                                                                                                                                                                        |
| --------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Historical provenance           | PASS for scoped replays      | PR223 source verification, E/F checkpoint controls and archived PR226 match receipts.                                                                                                           |
| 2 Body mass and angular state     | PASS for reduced state       | Joint geometry and the loaded limb impulse survive native reload and compact replay.                                                                                                            |
| 3 Support                         | PARTIAL                      | Finite single-foot load, traction and a slip fixture. Multi-foot distribution remains open.                                                                                                     |
| 4 Perturbation and recovery       | PARTIAL                      | Finite corrective swing, bounded loss and recovery on already grounded boots. Fall impact and get-up remain open.                                                                               |
| 5 Compression                     | PARTIAL                      | Passive offline normal-pair trials. Live compression ownership remains open.                                                                                                                    |
| 6 Shared contact and yield        | PARTIAL                      | Chronological reaction and finite swing yield clear the archived shin pair. Other pressured encounters remain open.                                                                             |
| 7 Referee                         | PASS within existing scope   | Existing discipline controls and unchanged discipline across the F halt and G clearance.                                                                                                        |
| 8 Historical solver halts         | PASS for five replayed ticks | 52:57, 63:12, 71:58, 89:51 and 134.387 s all advance in G. A later contact still leaves shin overlap in the 71:58 continuation.                                                                 |
| 9 Football continuity             | PARTIAL                      | Real passes, a miss and a pressure loss. Other next actions and the historical second touch regress.                                                                                            |
| 10 Ordinary 22-player integration | FAIL                         | Four archived releases succeed and all three starts complete 180 seconds. The later native-a throw-in stops its longer run.                                                                     |
| 11 Verification                   | See PR checks                | Focused physics, morphology, native reload, visual parity, source replay, discipline, lint, typecheck and production build are tracked separately from hosted CI and local full-suite timeouts. |

## 9. Reproduction and next dependency

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/reportPr227Checkpoints.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/reportPr227SupportAndRestarts.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/reportPr227GroundedRecovery.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/reportPr227IndependentContact.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr226Continuity.mjs --pr227
node scripts/ci/replayPr223Check.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225FullMatches.mjs paired G --pr227 --seconds=120
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225FullMatches.mjs paired G --pr227 --grounded-recovery --seconds=180
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225FullMatches.mjs paired G --pr227 --seconds=8 --profile
npm run verify
```

Run the development-window command separately for `native-a` and `independent`. Omit `--seconds=120` to reproduce the attempted full matches. Benchmark outputs go to `.benchmark-artifacts/pr227`. PR226 figures and input snapshots remain available at their original paths.

The restored contact ticks provide controls for extending persistent contact and deriving inverse mass from stance and swing response. Ground impact, fall and finite get-up require a separate verified contact and motor primitive. The archived restarts and the later native-a throw-in provide controls for that work. The current performance and football evidence support isolated development use.
