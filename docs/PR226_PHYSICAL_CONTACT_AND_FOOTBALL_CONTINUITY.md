# PR226 — Physical contact, energy transfer and football continuity

**Decision: RETAIN_EXPERIMENTAL.** Single Match Lab can select
`holistic-limb-impulse-dev-v1` (F). This recipe combines the PR225 skeleton
with `composed-leg-impulse-dev-v2`. Native state records the physical edition
explicitly. The supported integration profile is PR201/B at 40 Hz.

## Plan and baseline

| Task                                       | Acceptance evidence                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Reconstruct the contact sequence           | Verify archived episodes and replay the native CCD and opposing-shin checkpoints.                                  |
| Fix the demonstrated impulse inconsistency | Explain world-space work and test one impulse for linear and angular momentum.                                     |
| Follow the football                        | Trace the selected action, the real boot or limb contact, the resulting ownership and the next contact or failure. |
| Compare ordinary play                      | Use identical archived 22-player starts, validate the old arms and retain candidate failures with their input.     |
| Decide what moves forward                  | Record separate release decisions for the mechanism, gameplay, performance and integration.                        |

The first branch commit is based on merged PR225
`f3482d03bd221ec65820f94c7e77cc6fe51fcd83` (PR head
`6f1d31653669adeaa3569abd0b0df09304d82739`). PR225 established the
19-segment/18-joint hierarchy and reproduced all six PR224 D/E terminal
hashes across 1,374,558 ticks. It separately validated 754,489 poses.
[PR225 report](PR225_UNIFIED_FULL_BODY_SKELETON.md).

| E archive         | Limb events | Retained boots | Pass releases | Clearance episodes | A–B–A candidates | Clean defender wins |
| ----------------- | ----------: | -------------: | ------------: | -----------------: | ---------------: | ------------------: |
| Paired            |         527 |            765 |           290 |                900 |               32 |                   5 |
| Native-a          |         533 |            709 |           285 |                839 |               35 |                   9 |
| Independent PR214 |         450 |            659 |           232 |                811 |               17 |                   3 |

D recorded zero composed-limb events, 1,049/1,168/1,042 retained boots and
355/388/262 pass releases. E races the actual shins and thighs against the
boot and torso events, including recovering limbs. Some of the first
intersections therefore change the ball path before the later boot can
arrive. These counts describe the two solver editions and their diverging
trajectories. They do not calibrate the frequency of shin deflections in
football.

## Ownership and encounter taxonomy

| Owner                                             | Responsibility                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Articulated gait and canonical movement           | Actual before/after root, finite stance, planted foot, recovery and rebasing after body impulses   |
| Lower-body geometry, morphology and full skeleton | Canonical two-bone geometry, tapered limb proxies and presentation/replay transforms               |
| Composed leg CCD and shared contact timeline      | Certified prefixes, earliest contact, capsule region, evaluated velocity and bounds                |
| Pending strike interval                           | Event ordering and continuation with the existing boot, challenge, body, boundary and law handlers |
| Ball contact resolution                           | Passive limb impulse and existing joint opposing normals                                           |
| Ball physics and existing contact support         | Ground flight/bounce and boot or torso support transport                                           |
| Canonical action and possession rules             | Intended strike, retained touch, legal turnover, subsequent decision and restart                   |

Keep separate evidence for independent arrivals, returns separated by
clearance, persistent contact with one surface, migration to another
anatomical surface, simultaneous response, compression, serial A–B–A,
intended action, incidental deflection, defender intervention and unresolved
geometry. Categories can overlap. Consecutive observed episodes have a
canonical clearance certificate. The first and last boundaries are open
unless independently observed. Within an episode, the absence of a
certificate is uncertainty. The original PR225 `adjacentSurfaces` column
counts distinct physical surfaces, including surfaces on different players.

### Archived encounters

The three E files contain 899/838/810 boundaries between observed episodes
in the full encounter stream. These are lower bounds across all boot, limb
and observed torso encounters. There is no defensible one-event-per-shin
conversion. In the paired archive, 1,523 solver events belong to 900 observed
episodes, 116 with repeated surfaces, 255 with multiple surfaces, one with
joint pressure and 409 with an incidental contact.

The deterministic selection in [the episode report](performance/pr226-match-comparison.json)
ranks A–B–A candidates by recorded event count and includes joint responses,
mixed intended/incidental encounters, recoveries and large absolute work
residuals. [The compressed archive](performance/pr226-contact-encounters.json.gz)
retains the committed limb contact facts for selected rows. Boot/torso
identities are available where their native witnesses or the local trace
record them. A mixed-surface row alone cannot prove a particular anatomical
migration or an illegal ownership change.

| Archived E input  | Highest-volume repeated episode | Interpretation                                                                                                                                       |
| ----------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paired            | #380, 41:55.838, 29 events      | Two-player compression is certified at the joint response inside the episode.                                                                        |
| Native-a          | #638, 71:58.728, 31 events      | Same-player compression near the support transfer. The earlier serial hits do not each establish clearance.                                          |
| Independent PR214 | #527, 62:11.653, 24 events      | Nine limb-only A–B–A patterns in the available committed samples. No joint response was observed. The samples do not certify continuous compression. |

The archived E arms reproduce 508/517/431 limb-response residuals above
1 nJ in magnitude, including energy sinks. Their maximum absolute
residuals are 16.251/21.329/15.547 J. These counts compare an impulse account
with the actual legacy spin change. They do not assign each case to a defect
in collision detection.

## Root cause and impulse accounting

E applies a moving-surface linear rebound, then separately scales spin by
0.3 and reverses the world-Z component. The linear impulse at the contact
point generally cannot generate that angular impulse. The native checkpoint
at **31:16.207**, across two grounded players, provides the same first
contact for comparison. On entry the ball carries 135.751 J of linear and
5.020 J of rotational energy. E removes 112.812 J total with a **−7.861 J**
residual relative to the contact-point impulse. F removes 102.986 J and
leaves a residual of **2.84 × 10⁻¹⁴ J** in magnitude. The effect concerns the
mechanism of energy transfer, including unsupported loss. F can legitimately
leave more kinetic energy than E in a particular trajectory.

F retains normal restitution 0.38 and computes Coulomb-limited slip with
the existing 0.43 kg, 0.11 m hollow-sphere parameters. A tangential impulse
changes both linear momentum and spin about the contact lever arm. Its
angular limit scales the same impulse. The friction coefficient 0.42 is an
engineering choice for this experiment. It has no anatomy or skill modifier.
No geometric projection is applied in the limb impulse. Ground, active
strikes and continuous boot/torso support retain their existing owners.

For a committed event the trace records pre/post centre position, velocity,
spin and kinetic energy; event order; contact region, points, normals and
surface velocities; relative normal and tangential motion; restitution,
friction or the legacy retention factors; modeled impulses; current ball
ownership, body root, stance and active command. Continuous support
receipts separately record free and supported transport. With impulse
**J**, inferred kinematic work is **J · surface velocity**. Ball patch
velocity at the impulse midpoint gives the exact discrete kinetic-energy
identity of this ball model. The residual is the difference after subtracting
surface work and contact-frame work.

Capsule-axis point motion estimates tangential surface transport. Independent
material roll, muscle work, compliant tissue, recoil and the player's 3D
angular momentum are unavailable. The work account does not close the
human–ball system. Pitch support can act before or after a limb collision
under ground-event physics. A foot/limb/ground manifold has not been measured.

| Native event                                    | Ball energy change E / F | Inferred surface work E / F |
| ----------------------------------------------- | -----------------------: | --------------------------: |
| Moving shin after the PR224 native-a boot graze |      +26.629 / +29.681 J |         +36.554 / +36.034 J |
| Nearly stationary receiving shin under pressure |        −2.527 / −2.516 J |         −0.0045 / −0.0045 J |
| Opposing shins at 41:56 (joint response)        |      +6.047 / about +6 J |       +11.493 / about +12 J |

The 41:56 pair demonstrates compression and a subsequent escape. Applying
independent restitution can restore closure against the other shin. The
two-normal solver still finds a simultaneous nonpenetrating velocity when
both impulses are positive. This supports the joint result while leaving the
large near-opposing impulses an uncalibrated consequence of prescribed
kinematics. A rapid A–B–A sequence without measured co-contact remains
insufficient evidence of a numerical error.

At 71:58, the first F prototype applied a second opposed response at the
same simulation timestamp after the search changed from a centred velocity
sample to a forward one. The second response added about 4.09 μJ.
The candidate samples both touching surfaces in the remainder's forward
direction for the joint solve. The original E checkpoint and order retain
their historical meaning. No event or sample budget, reach, tolerance,
boot patch, player pose override or defender reward is added.

The first full paired F run stopped at 52:57.175. A thigh and an opposing
knee alternated from 2.15 ms between contacts down to 87 ns, repeatedly
regaining about 2.82 m/s of incoming normal closure. There was no
independent sporting event between these responses. At the original budget
boundary the solver attempted another impact at the same clock time. F now
uses the same two-normal response for the two actual tapered capsule
proxies, after A–B–A and measured co-contact. The
[frozen input](performance/pr226-knee-thigh-checkpoint.json.gz) completes
with two body clusters and 14 leg encounters including one joint response.
The solver certifies the free tail, with no additional event budget.

The native-a comparison yields a
[near-ground graze at 63:12.875](performance/pr226-ground-graze-checkpoint.json.gz).
The final F match reaches the same byte-identical freeze as the prototype,
after 151,715 committed ticks. Successive
192-sample searches certify diminishing clear prefixes around the same
player, including a final witnessed 25 μs prefix. No new limb impulse is
observed in that suffix. This is a continuous-search limitation near
the ground, separate from the serial knee/thigh impulses.

The corrected paired trajectory passes the original 52:57 checkpoint in
ordinary play. It later stops at
[89:51.125](performance/pr226-late-shin-pinch-checkpoint.json.gz).
Three body clusters occur early in the tick. Two shins then alternate
with about 1.23 m/s of incoming closure while the time between responses
shrinks toward 96 ns. The last search still sees another contact after
the 16th event, so the engine rolls the tick back. This is a serial
pressure failure with coupled body motion. The evidence supports two
alternating ball surfaces and leaves pre-contact impulse timing open.

## Football continuation and morphology

The [native continuation archive](performance/pr226-continuity.json.gz)
records D/E/F arms through the canonical tick pipeline, including selection,
motor commitment, boot execution, deflection, body events, ownership changes,
follow-through, failure and the next act. Native serialization and observation
are checked on every tick of these scenarios. Compact replay is checked at
observed contacts and sampled endpoints.

| Scenario                               | Observation                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Ground pass and forward-moving pass | F releases from the actual inside-foot contact at 10.088 s and 10.067 s. The motor then continues from the actual exit pose.                                                                 |
| B. Directional first touch             | The early-lateral receiver takes the ball with the inside of the boot at 10.366 s. D later records a second touch. E and F still fail to produce that second touch.                          |
| C. Reception under pressure            | E and F see a shin before the receiver's cushion. The opponent owns the ball at the first-touch-relative 600 ms horizon. The early-pressure control can produce a later intentional release. |
| D. Consecutive touches                 | At 41:56, E and F both achieve two retained boot contacts. F retains at 600 ms after the first touch, where E is loose.                                                                      |
| E. Incidental shin                     | A moving recovering shin changes spin and flight via the measured impulse. It earns no deliberate release or possession.                                                                     |
| F. Collision after first contact       | The stronger-pressure arm remains a failure in E/F even though PR223/D can reach another boot contact. Finite stance, rebase and ownership continue from the actual geometry.                |
| G. Defender authority                  | The opponent wins via an actual boot contact at 10.725 s in F and still owns the ball at the first-touch-relative 600 ms horizon. Challenge telemetry alone does not certify ownership.      |
| H. Real failures                       | The selected swing misses with no release. The unreachable receiver has no executed contact in the observed horizon.                                                                         |

The 41:56 and 71:58 native starts cover two-player opposition and a same-player
support transfer. Candidate trajectories can produce different later boot
opportunities. There is no new owner override. The candidate changes
incidental momentum and spin before the ordinary control/release race.

Default morphology and asymmetric lengths, different knee alignment and
different lower-limb proportions are exercised using fixed-world approaches
and separate geometry-relative inputs. The inherited authored-body search
bounded knee travel by the whole thigh even when the interval shrank.
For the asymmetric low-shin input this consumed 17 searches of 192 samples
and advanced the ball about 1.7 μm in a nominal 25 ms tick. F bounds the
knee over the actual reachable interval, including the interior extremum
for unequal bones and the rotating bend plane. In the scoped cases, it
resolves one real limb contact for each authored body at the same limits.
Across each geometry-relative 12-tick fixture E uses 39,168 samples with
204 exhausted searches. F uses 69–71 evaluations in 14 searches and
completes all three intervals without an exhausted search.
Degenerate bounds still use the existing conservative envelope.
The large/small-foot comparison produces identical contact work on the
same path because foot dimensions remain anatomical. The established
physical boot patch is 35 mm. Upper-body, hand and head contacts remain
inactive. PR225 supplies geometry for Three.js and compact replay.

## 22-player comparisons, performance and verification

See the [matched receipts](performance/pr226-match-comparison.json) for
kickoff and terminal digests, simulated duration, game events, solver halts,
pose samples, search work and engine timings. The three starts are the PR224
paired save, PR222 native-a and the independent PR214 archived kickoff.
Full runs select autonomous authority. Controlled laboratory actions use the
existing action resolver. The quantified stability and costs apply to these
inputs and observed contexts.

All six D/E runs reproduce the archived terminal hash and exact episode
rows. Their scores, goal times, boot counters, pass releases and restarts
also agree with the PR224/225 receipts. The kickoff hash in the comparison
is the archived identity before F's explicit selector is applied.

| F input           | Completion             | Score at stop | Pass releases | Retained boots | Limb responses | Clearance episodes | A–B–A candidates |
| ----------------- | ---------------------- | ------------: | ------------: | -------------: | -------------: | -----------------: | ---------------: |
| Paired            | Halt at 89:51.125      |           1:0 |           271 |            653 |            497 |                765 |               26 |
| Native-a          | Halt at 63:12.875      |           0:0 |           186 |            537 |            383 |                609 |               20 |
| Independent PR214 | Full time at 95:00.325 |           1:1 |           216 |            759 |            474 |                860 |               22 |

No invalid pose was observed in the 22-player samples. Both halted matches
are right-censored. The independent full match records a changed trajectory
and 22 possible repetitions versus 17 in E. This and the two halted paths
leave the ordinary-play gate open. With 1,354 committed F limb responses,
the largest observed absolute work residual is **5.69 × 10⁻¹⁴ J**.
The halted tick's attempted work is excluded from the committed summaries.

Traced timing includes the observer. The fixed-window untraced arm measures
the same physical trajectory, with separate inclusive search time and sample
counts in traced runs. Full-body composition is measured separately from
the engine tick and invoked on selected poses. Native/replay sizes are raw
JSON samples. Heap values are process samples including allocations and GC.

| Paired 120 s, Windows / Node 24.22.1 |         E traced |        F traced |      F untraced |
| ------------------------------------ | ---------------: | --------------: | --------------: |
| Mean tick                            |          5.43 ms |         4.84 ms |         3.93 ms |
| P95 / P99 tick                       | 11.23 / 16.91 ms | 9.35 / 13.36 ms | 7.99 / 13.23 ms |
| Capsule search per sample window     |         520.5 ms |        237.4 ms |      Unobserved |
| Geometry evaluations / search calls  |   11,576 / 2,598 |     4,148 / 955 |      Unobserved |
| Raw terminal native bytes            |          247,037 |         239,722 |         239,722 |
| Raw terminal replay sample bytes     |           69,912 |          70,713 |          70,713 |

F's two paths have the same exact terminal digest. The E and F matches
change their sporting trajectories and are run under varying concurrent
load. The timings cannot isolate a speed change due to the contact law.
The sample limit is still 192. The reported mean composition with
validation is 0.53–0.58 ms per sampled body in these runs.

Reproduction from the repository root:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr226Continuity.mjs --record
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225FullMatches.mjs paired F --pr226 --final-candidate
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225FullMatches.mjs paired F --pr226 --seconds=120 --untraced
node scripts/reportPr226ContactEpisodes.mjs --record
npm run verify
```

Run D/E against the same sources and repeat on native-a and independent.
The `--pr226` runner writes scratch data and leaves historical receipts intact.

## Completion register and next dependency

| Gate                             | Scope of result                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encounter forensics              | Clearance-certified grouping with uncertain edges. Native paired compression, serial samples and incidental work identified. Full material motion and every mixed-surface event are outside the available evidence. |
| Impulse and work                 | Coupled impulse closes the measured ball account. This is a scoped contact mechanism, without external calibration.                                                                                                 |
| Multiple surfaces                | Existing two-shin response survives the native cases. There is no broader proof for adjoining boot/knee/ground constraints or three simultaneous surfaces.                                                          |
| Football continuation            | Demonstrated native second touch and subsequent retention. Pressure losses, unreachable branches and the weaker directional continuation remain.                                                                    |
| Whole body                       | PR225 geometry, individual morphology, real anchors and compact replay remain the basis.                                                                                                                            |
| Ordinary play                    | One full F match completed. Two F starts reach explicit event-budget halts.                                                                                                                                         |
| Historical and tool verification | Six D/E exact terminal/episode replays. TypeScript, lint, production build and focused F checks pass locally. Full acceptance follows the final PR checks.                                                          |

The isolated contact law is suitable for development use. Pressure outcomes,
ordinary-play conclusions and performance remain scoped to the tests.
General integration remains **RETAIN_EXPERIMENTAL**. A parked foot still
needs measured load and feasible support after a large torso impulse.
PR227 should own 3D centre-of-mass and torso angular response, planted-foot
traction and support feasibility, tipping, a real recovery step, and then
fall/get-up. Test those mechanics first on the 41:56, 71:58 and historical
PR223 pressure checkpoints. Add adjacent and three-surface constraints only
after the event evidence identifies their missing load path.
