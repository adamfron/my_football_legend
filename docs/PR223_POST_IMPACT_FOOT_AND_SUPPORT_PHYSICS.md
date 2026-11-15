# PR223 — Post-impact foot kinematics and continuous support

**RETAIN_EXPERIMENTAL.** The historical launch came from rebuilding a parked
swing-foot path with the post-impact root velocity and an already sampled reach
pose. The resulting prescribed boot could do the work the ball solver computed,
but the torso solve supplied no matching leg impulse or new motor command.
Variant D continues an already parked stance for the remainder of that motor
tick if its feet remain reachable. In the frozen case it removes the launch
and exposes an earlier defender win. A separate stronger impact permits an
actual second controlled touch. The maintained integration profile is PR201/B.

## Gates and replay lineage

1. Reproduce PR222 on unmodified merged main and compare the 24- and 64-tick
   receipts. The PR222 head and its merge have identical trees.
2. Record the event-time root, world boots, joints and ordinary support
   transaction. Replay the same committed surfaces with finer subdivisions.
3. Test the source-level correction for an already parked segment, keeping
   the body collision, root displacement and football decisions paired.
4. Check physical contacts, ownership, follow-up action and native reload,
   including the changed-defender controls below.
5. Use the two ordinary 22-player PR222 seeds for a 30-second compatibility
   smoke after the focused controls. Keep the v2 candidate experimental.

Merged baseline is **6faedb7b935a3c81169d5b8753640fcc2d160527**. The frozen
record was made on **b1eb83755e85d85cb5efc14f0399134158825da6**. The pressure
input is reconstructed by PR221's `createTrial` with scene `pressure`, seed
`pr219-a`, First Touch 60 and native time 10.000 s. The new runner checks all
24 raw state hashes and both serialized terminal hashes for each A/B/C arm.
It compares traced with untraced steps and repeats native JSON/schema reloads
across all 24 prefix boundaries. The [attribution receipt](performance/pr223/post-impact.json.gz)
records full source identifiers, normalized runtime file hashes, chronology,
both feet, the committed contact inputs, and the variant and control hashes.

| Arm | Initial state SHA-256 | 24-tick terminal | 64-tick terminal |
| --- | --------------------- | ---------------- | ---------------- |
| A   | `ea4c18fa9eff…`       | `fad76dea40ea…`  | `2a38e154ace4…`  |
| B   | `bf730ceb50fd…`       | `fc81c5b94a77…`  | `4356cb4fb8d6…`  |
| C   | `782a0c9b8a44…`       | `9d3dc0eaf5fa…`  | `d8ed56017a99…`  |

Run from the repository root with Node 24.

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr222Reception.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr223Support.mjs --check
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr223Support.mjs --check --smoke
```

The last command checks the [ordinary smoke receipt](performance/pr223/smoke.json.gz).
The CLI prints the receipt without a mode flag and writes the compressed
receipts with `--record`. The historical checker remains source-bound.

## Who owns the physical sequence

| Authority                    | Implementation and handoff                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movement objective and root  | `movementAuthority` selects the physical intent. `matchSimulation` supplies it to `canonicalMovement`, samples the reach pose and advances the nominal articulated stance. `integrateCanonicalBodyRemainder` owns root transport after a torso event.                                                                                                                                           |
| Support, swing and joints    | `articulatedGait` writes world-space stance anchors. `articulatedBodyState.activeArticulatedFoot` identifies active actions and recovery. `lowerBodyGeometry.deriveLowerBodyGeometry` links both anchored feet to their hips and knees. `pendingStrike.canonicalStrikeFoot` supplies the finite boot to swept contact and to `articulatedBody.projectArticulatedBody`.                          |
| Torso impact and rebase      | `pendingStrikeInterval` orders the event and `multiBodyContact.resolveMultiBodyContact` supplies the impulse, root velocity and balance. The pair solver lives in `playerBodyContact`. The interval's `rebasePlayer` replaces the participant's segment from the event pose.                                                                                                                    |
| Ball and continuous contacts | `ordinaryContactInterval` admits supported low play to `pendingStrikeInterval`. There the latches identify bodies and boots, `integrateBallFlight` advances the free ball and `supportContinuousBodyContacts` applies unilateral velocity correction and position projection. The same interval arbitrates foot/body contacts and pitch exits, and advances the ball across the selected event. |
| Reception and follow-up      | `matchSimulation.changePossession` consumes the witnessed boot. `passReception`, `firstTouch` and `footContact` resolve the first touch. `carryExecution` contributes the next movement target. `ballContactGeometry.advanceControlledBall` checks readiness, reach and the actual possession envelope.                                                                                         |

The opt-in observation extends `receptionTrace`. It samples the committed
contact interval, including zero velocity responses, rather than collecting
CCD trial evaluations. The trace is external to native state.

## Gate 1–2 — The frozen 13.079 ms

Times are relative to scene start. The first contact at **83.546 ms** uses
the stationary right boot at (40.800, 34.170, 0.040) m. Left support is
(40.800, 33.830, 0.040) m. Incoming ball speed is 3.733 m/s, and the
cushion impulse is about −1.605 N·s in x with zero outgoing speed and spin.
At **86.921 ms** the real torso impact acts on two 75 kg players. Its
receiver-facing normal is (0.882353, −0.470588), the normal impulse is
44.055 N·s and the tangential impulse is zero. The receiver root velocity
jumps from (0, 0) to (0.518290, −0.276421) m/s. The torso pair loses
23.413 J in the planar solve. The root and both ankle positions agree
across the event itself.

| Baseline at the torso event | Immediately before               | Immediately after      | At 100 ms                        |
| --------------------------- | -------------------------------- | ---------------------- | -------------------------------- |
| Root XY (m)                 | (41.000000, 34.000000)           | (41.000000, 34.000000) | (41.006779, 33.996385)           |
| Facing (rad)                | −1.562254                        | −1.562254              | −1.559994                        |
| Left foot XYZ (m)           | (40.800000, 33.830000, 0.040000) | same                   | same                             |
| Right foot XYZ (m)          | (40.800000, 34.170000, 0.040000) | same                   | (40.734291, 34.155215, 0.074711) |
| Left knee flexion (rad)     | 0.672968                         | 0.672968               | 0.664070                         |
| Right knee flexion (rad)    | 0.670184                         | 0.670184               | 0.755502                         |
| Support and gait clock      | left, 11.921 ms of 175 ms        | same                   | left, 25 ms of 175 ms            |

The receiver moves **(+6.779, −3.615) mm** at the root. The contact boot
moves **(−65.709, −14.785, +34.711) mm**, or **(−5.024, −1.130, +2.654)
m/s**, magnitude 5.793 m/s. Its pre-event world velocity is zero. The right
hip, knee and ankle average velocities are respectively (0.535, −0.277, 0),
(−3.203, −0.744, 2.802) and (−5.024, −1.130, 2.654) m/s. Mean knee-flexion
rates are −0.680 left and +6.523 right rad/s. The canonical IK admits the
sampled geometry at fixed thigh and shin lengths of 0.4410 and 0.4428 m.
The authored movement objective was structural adjustment, with an earlier
low-ball reach offset of about 0.10025 m longitudinally in `lowerBodyPose`.
No active stroke or boot recovery owned the receiving foot at this event.

The original unimpacted actuator endpoint had both boots stationary and
`elapsed = 0`. `bodyAt` nevertheless interpolates an advancing stance
clock inside such a segment. `rebasePlayer` uses the new torso velocity to
run `advanceArticulatedStance` again. This crosses the gait's rest condition,
uses the nominal geometry with that reach offset, adds 50 ms of velocity
lookahead and evaluates the vertical swing at 25 ms of a 175 ms step. The
nominal right boot target before lookahead is (40.708376, 34.169036, 0.040000)
m. Most of the x motion is toward that previously dormant pose, opposite
the direction of root travel. Resetting only the phantom phase in a
diagnostic removes 16.10 mm of lift but preserves the horizontal stroke
and leaves about 4.48 m/s of ball speed.

This supports a **gait remainder and motor-authority inconsistency**, plus
a smaller numerical sensitivity in continuous support. The foot was
geometrically reachable and below the existing 24 m/s engineering swing
limit. Those constraints admit a pose sequence. They supply no leg mass,
angular response, actuator torque or ground reaction to explain the sudden
velocity. The observations exclude root translation of the boot, a
teleportation, and a switch of the planted foot. They do not certify the
feasibility of a 5.79 m/s foot response in real football. The model has
upright planar body impulses, derived two-bone angles, a finite gait and
approximated traction. It lacks joint dynamics, a support polygon with
validated slip, three-axis COM dynamics and a recovery-step controller.

## Continuous support and work

The right reception boot is latched throughout the observed remainder.
Free flight leaves the ball at (40.673016, 34.170000, 0.110000) m with zero
velocity. No torso–ball support is present. The endpoint boot sphere has
at most 72.760 mm of raw penetration into the free trajectory. The solver
moves the ball by (−61.725, +14.894, +35.548) mm, ending at (40.611291,
34.184894, 0.145548) m with 10 μm clearance. Its correction normal is
(−0.848220, +0.204669, +0.488502). The velocity response removes closing
normal speed of 5.326558 m/s, bringing relative normal speed to zero.
The resulting ball velocity is (−4.518090, +1.090181, +2.602034) m/s.
The impulses inferred at the 0.43 kg ball are 2.29042 N·s normal and
0 N·s tangent. The first counted boot contact remains the only one in
the critical tick.

| Quantity                                                         |                        Result |
| ---------------------------------------------------------------- | ----------------------------: |
| Linear kinetic energy before / free / supported                  |              0 / 0 / 6.1000 J |
| Rotational kinetic energy before / after                         |                       0 / 0 J |
| Prescribed surface work estimate, `J · v_surface`                |                    +12.2001 J |
| Relative normal energy dissipated in a zero-restitution response |                      6.1000 J |
| Residual of the above kinetic identity                           | below 2 × 10⁻¹⁵ J in this run |
| Potential added by positional lift, `mg Δz`                      |                     +0.1500 J |

The work is that of an effectively prescribed, infinitely stiff surface and
is derived from the same impulse. It is an accounting identity, with no
measured equal-and-opposite work on the leg. There is no velocity term
proportional to the magnitude of positional correction. The projection
does choose the response normal, and the lift contributes potential without
an independently balanced ground/leg budget. The ball can receive energy
from a genuinely actuated foot through this branch.

To test book-keeping sensitivity, the runner holds the exact measured
linear boot chord and incoming ball, calls the same flight and support
kernels for each subdivision, and changes only the partition.

| Partitions | Exit speed (m/s) | Velocity responses |
| ---------: | ---------------: | -----------------: |
|          1 |          5.32656 |                  1 |
|          2 |          5.55750 |                  1 |
|          4 |          5.59738 |                  1 |
|          8 |          5.60933 |                  1 |
|         32 |          5.61589 |                  1 |
|        128 |          5.61726 |                  1 |

The response tends toward roughly 5.618 m/s with finer steps, 5.46% above
the one-interval result. The direction changes as the projection normal
is sampled closer to first penetration. This local experiment holds the
real torso history fixed and does not change the engine's 40 Hz rate. It
rules out repeated impulses as the cause in this witness and shows that
a finer partition alone would not prevent the launch. A swept or
time-consistent continuous support normal remains a separate solver question.

## Gate 3–4 — Candidate and paired football consequences

`parked-stance-remainder-dev-v1` is an explicit native development selector
on top of C. At a real torso impact, the interval checks that its authored
stance segment was parked with a supporting foot and both world boot
anchors stationary, that there is no active action/recovery or jump, and
that the preserved anchors fit canonical IK and the existing horizontal
workspace at the rebased endpoint. If admitted, the segment ends with its
parked anchors and clock. The torso impulse, root transport, facing,
balance, ball solver, support latch and next 40 Hz motor update retain their
existing owners. Other trajectories follow the existing continuation.
The native schema and effective recipe identify D on serialization.

| Frozen input milestone                               | A/B/C                                        | D                                                                      |
| ---------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| First retained right-foot touch                      | 83.546 ms                                    | 83.546 ms                                                              |
| Torso impact and impulse                             | 86.921 ms, 44.055 N·s                        | same                                                                   |
| Boot and ball through 100 ms                         | 75.77 mm boot travel, 5.327 m/s ball         | both boots stationary, ball at rest                                    |
| Next action                                          | carry selected at 275 ms, movement at 300 ms | opponent wins before a carry is selected                               |
| Due reach / executed second retained touch           | 425 ms reach fails, zero second contacts     | no receiver second contact before first loss                           |
| First loss                                           | 500 ms, failed-control envelope exit         | opponent left-boot contact at 177.576 ms, opponent ownership at 200 ms |
| Continuous control for 600 ms                        | no                                           | no                                                                     |
| 700 ms sample, first sample at/after control +600 ms | loose                                        | opponent owns                                                          |
| Receiver reacquisition during the 64 ticks           | none                                         | 875 ms, separate possession                                            |

The defender variants change initial position, heading or velocity only as
specified in the [receipt](performance/pr223/post-impact.json.gz). They are
separate counterfactual scenes. A slower approach can alter earlier foot
competition, so its torso impulse alone is not a clean intervention on a
successful first touch.

| Control                                            | Measured sequence and outcome                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighter collisions (33.31 and 39.47 N·s)           | Approach and timing differ. Neither arm records a retained first touch by this receiver in the observed window.                                                                                                                                                                                                                    |
| Earlier same-side collision (46.38 N·s)            | Impact precedes the historical touch time. Neither arm records a retained first touch by this receiver.                                                                                                                                                                                                                            |
| Opposite side (48.33 N·s)                          | A real torso hit precedes the first retained touch in both arms. Both own at the control-relative sample. C loses at 950 ms. D has no observed loss by 1.6 s, and neither arm records another retained touch before first loss or censoring.                                                                                       |
| Delayed and wide approaches                        | First control precedes the later torso collision by hundreds of milliseconds. Neither arm activates the correction at reception.                                                                                                                                                                                                   |
| Approaching defender with no receiver torso impact | Both arms reproduce first control at 83.546 ms and a loose ball at 850 ms. There is no second retained receiver contact and the corrected branch has no event to process.                                                                                                                                                          |
| Stronger post-touch collision (88.53 N·s)          | First touch and torso impulse agree. C loses to the defender by 175 ms. D retains ownership through the 600 ms milestone and executes a swept, reachable outside-of-right-boot contact at 459.232 ms during a selected carry. Its finite contact sends the ball at (−0.399, +2.647, 0) m/s. D's first loss is observed at 1425 ms. |

The observed winning defender in the frozen D case and the unchanged misses
in the lighter and pre-contact controls preserve genuine failure. The
stronger example demonstrates one physically reachable continuation in the
laboratory. A different approach also changed access to competing feet, so
these cases do not imply a monotone relation between torso impulse and
possession. The receipts distinguish reacquisition and frame-sampled
ownership from first retained control and executed contact.

The focused tests cover reachable fixed anchors, the opposing root
transport, active feet, existing swing, support release, airborne and
unreachable poses. The existing contact tests exercise latched separation,
moving and stationary support, nearby competing bodies and boots, pitch
boundaries, ground/body rebound, and recovery. Those existing fixtures
cover the underlying authorities and chiefly exercise the historical
edition. They do not individually validate D activation. The paired native
runner checks D separately through the real collision, subsequent track
and native reload.

## Gate 5–6 — Ordinary integration and verification

The two PR222 22-player inputs, `lab-mw3xhr6o` and `pr222-native-a`, use
the exact archived kickoff plus each seed and ordinary policy for 1,200
ticks. The A/B/C oracle is the full regenerated PR222 receipt. D audits
subframe event order, composed stance, planted drift, latched ball clearance,
native reload and safety. See the [smoke receipt](performance/pr223/smoke.json.gz).

Both D trajectories have identical physical and action projections to their
archived C counterparts through all 1,200 ticks. They contain 16 and 12 torso
impacts respectively, with zero admitted parked remainders. There are zero
safety halts, event-order errors, invalid bodies or measured base planted-foot
drift. Minimum frame-end ball clearance on latched boots is about 0.059 μm and
10 μm respectively. Both normalized terminal hashes agree with their native
reload run. The second seed retains the PR222 shot-diagnostic metadata drift
at tick 825, after the prepared-recovery window. Its B/C/D prepared recovery
is still at 8.796139 s. Neither seed supplies a direct first-control to
follow-up chain under the corrected branch. This establishes compatibility
and leaves ordinary-match transfer unobserved.

The source-bound PR222 check preserves the 24-tick case, PR221 clear lateral
control and prepared-recovery chronology. PR221's 261 executions match
their archive. PR219's reception benchmark runs, and PR220's `final`
archive matches on merged source `a0fb76e`, including the negative placement
outcomes. Local targeted tests pass (121), along with TypeScript.
The PR218 checker passes all six source-bound gates and validates the
archived complete-match receipt from the shorter historical checkout. The
longer Windows worktree yields missing archived paths during extraction.
The PR217 local check hits Windows junction `EPERM`. GitHub Actions runs
the source-bound verification and the new PR223 focused benchmark.

The PR description and Checks tab record the complete local verification and
hosted run status for the final commit.

PR201/B, 40 Hz, the 28 attributes and the existing A/B/C selections remain
the maintained integration contract. The independent confirmation corpus
remains sealed. The ordinary smoke covers two short trajectories and the
full-match gate remains closed.

The next dependency is to observe actual post-impact balance and recovery
steps in naturally pressured open-play receptions, including active and
near-reach-limit stances. A following study can pair an event-time support
normal against the same prescribed paths and test a physically coupled,
finite recovery step. Promotion requires ordinary-match activation of the
affected branch, preservation of legitimate competition, and observed
action continuity over more than one altered laboratory approach.
