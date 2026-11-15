# PR224 — Canonical body physics and visual integration

## Full match with `pr222-native-a`

This pairing uses the same archived initial situation as the first full
match and the alternate `pr222-native-a` seed. Both arms have 22 players,
autonomous control and the 25 ms simulation step. The E selector is the
only difference between arms at kickoff.

On `076bfc8`, E reached 71:58.875 while leading 2–0, then halted with
`pendingStrikeInterval.event_budget`. A native reload reproduced
alternating contacts on both shins of `footballer_pro_9_7`, ending with
three observations at the same solver time. The existing joint response
recognized contacts on different players. It now identifies a surface by
player and foot, so the same A–B–A and simultaneous-touch checks apply
when the opposite shins belong to one player.

The [archived step](performance/pr224-native-a-halt.json.gz) completes with
14 shin events, one of them the joint response. The right ankle stays at
its original anchor, the root advances and the planned support transfers
to the left foot. The ball exits the pinch loose. The change preserves
the 16-event and 192-sample limits and the existing geometric tolerances.

Both runs from kickoff reached full time after the repair to E:

| Measurement | D | E |
| --- | ---: | ---: |
| Half-time score | 0–0 | 1–0 |
| Full-time score | 0–1 | 2–0 |
| Full-time clock | 95:25.500 | 95:00.000 |
| Pass releases | 388 | 285 |
| Retained boot contacts | 1,168 | 709 |
| Shin contacts | 0 | 533 |
| Ownership changes | 1,723 | 1,017 |
| Restarts | 185 | 216 |

D's goal arrived at 64:53.900. E scored at 36:47.525 and 62:39.450.
The continuation from 71:58.875 also reached full time at 2–0. The
[match receipt](performance/pr224-full-match-pr222-native-a.json) retains
the original E halt, the repaired step, both full-match results and
comparable clock checkpoints.

The `076bfc8` Actions run passed all 28 jobs. The repair passes the
focused regressions and the deterministic 30 s and 120 s gates for both
seeds. **RETAIN_EXPERIMENTAL.** PR201/B remains the maintained integration
profile. The two seed results share the initial situation. Further
validation depends on independently recorded situations and simultaneous
contact with more than two surfaces.

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224FullMatch.mjs D second-seed --seed pr222-native-a
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224FullMatch.mjs E second-seed --seed pr222-native-a
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224FullMatch.mjs E second-seed-replay docs/performance/pr224-native-a-halt.json.gz
```

## Follow-up — simultaneous shin pressure at 41:56

The archived 41:56 step reached two opposing shin surfaces at the same time.
Applying independent rebounds made the second impulse continually restore
closing velocity against the first surface. After an observed A–B–A shin
sequence by two players, the solver now samples the other shin at the actual
contact time. Both surfaces must touch the ball within the existing
`1e-7 m` clearance tolerance. Existing continuous boot or torso support
keeps the ordinary path.

When both normal impulses are positive, the two-by-two Gram system
finds the minimum velocity change that meets both moving surfaces'
non-penetration constraints. The joint normal response uses zero restitution
and leaves tangential motion and ball spin intact. Parallel incompatible
normals keep the bounds and unresolved behavior of the ordinary race.
The response uses the velocities of the swept surfaces and preserves the
canonically integrated root paths and planted feet.

The native 41:56 step now consumes 13 shin events, including the joint
response, one player cluster and two boot events. The joint response took
the ball from 0.76 m/s to 5.36 m/s as the actuated shins closed, sending it
down to the normal boot race. This is a kinematic contact result, with no
claim that the moving surface work is biomechanically calibrated. Both
players' roots advanced, both right plant anchors stayed fixed, and the
second boot event retained the ball. After the 16th event, the ordinary
search certified the final 48 μs clear. It can commit a clear tail only.
Another event or unresolved search still reaches the same safety halt,
with the same 16-event and 192-sample limits and geometric tolerances.

Replay the tracked native step with:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224FullMatch.mjs E paired-replay docs/performance/pr224-full-match-checkpoints.json.gz
```

### Full match after the repair

Both arms finished from kickoff without a solver halt, using the same
22-player autonomous save and 25 ms tick. D reproduced its previous
terminal state exactly.

| Measurement | D | E |
| --- | ---: | ---: |
| Half-time score | 1–1 | 0–0 |
| Full-time score | 1–2 | 3–1 |
| Full-time clock | 95:23.450 | 96:00.000 |
| Pass releases | 355 | 290 |
| Retained boot contacts | 1,049 | 765 |
| Shin contacts | 0 | 527 |
| Ownership changes | 1,588 | 1,088 |
| Restarts | 194 | 212 |

E's four goals arrived in the second half, at 64:23.300, 70:23.600,
80:53.300 and 88:42.500. The continuation from 41:56 also reached full
time with the same goal timeline. The result is from one pairing.
See the [match and checkpoint receipt](performance/pr224-full-match-paired.json).

**Promotion decision — RETAIN_EXPERIMENTAL.** Both 22-player inputs also
passed the deterministic 30 s and 120 s gates. PR201/B remains the maintained
integration profile. Wider validation depends on additional full-match saves
and evidence for simultaneous contact across more than two surfaces.

## Previous full-match follow-up

Both arms use the same archived `lab-mw3xhr6o` save, with 22 players at kickoff,
autonomous control on both sides and 25 ms simulation ticks. The runner resumes
through the normal second-half entry point and runs until the simulator reports
full time or records a halt. E differs from D by the composed-leg selector.

| Measurement                         |                      D |            E with the four repairs |
| ----------------------------------- | ---------------------: | ---------------------------------: |
| End of run                          | Full time at 95:23.450 | Halt before half time at 41:56.000 |
| End score                           |                    1–2 |                                0–0 |
| Score at 41:00                      |                    1–1 |                                0–0 |
| Pass releases by 41:00              |                    163 |                                126 |
| Retained boot contacts by 41:00     |                    472 |                                318 |
| Distinct body-impact times by 41:00 |                  1,725 |                              1,857 |
| Shin impacts by 41:00               |                      0 |                                209 |
| Ownership changes by 41:00          |                    711 |                                455 |
| Restarts by 41:00                   |                     82 |                                 97 |

D was 1–1 at half time. Its goals came at 23:32.500, 40:49.325 and
55:20.075 on the simulation clock. At the common 41-minute checkpoint, E had
fewer controlled contacts and pass releases and more restarts. These are
results for one deterministic pairing with different trajectories.
See the [match receipt](performance/pr224-full-match.json) for both runs.

Exact native reloads reproduced four `pendingStrikeInterval.event_budget` stops
in E. The [checkpoints](performance/pr224-full-match-checkpoints.json.gz) retain
the input to each failed step and its diagnostic:

| Match clock at start of the step | Cause                                                                                                                                                         | Result after the repair                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13:04.025                        | The ball had separated from a boot after a rebound. The latched boot still widened the travel enclosure, consuming 13 search frontiers.                       | The relative distance bound proves the boot cannot project the ball during the remainder. The saved step advances through one frontier and records a right shin impact. |
| 4:01.975                         | Opposed shins on one player bounced the ball back and forth 16 times while the swing continued against a planted left leg.                                    | The swing yields after the second impact. The saved step records three shin impacts, retains the left plant and leaves the ball loose.                                  |
| 26:11.925                        | A stationary ground ball remained outside a latched, planted boot. The broad support enclosure spent all 16 events on search frontiers.                       | The same distance proof applies to a stationary ball, whose centre stays fixed as spin decays. The saved step retains ball control and records no shin impact.          |
| 31:16.200                        | Two players' shins trapped the ball. Fifteen shin impacts and one torso cluster exhausted the interval. The swing ankle continued driving the shins together. | A return impact on the first shin triggers the same swing yield across players. The saved step finishes with four shin impacts, a preserved plant and a loose ball.     |

The distance proof applies to affine boot motion when every latched boot is
clear and there is no torso support. The ball follows the event-v1 free
trajectory under constant acceleration up to the next ground impact, or
keeps its centre fixed at rest on the ground. A quadratic lower bound on
squared relative distance discards a nonnegative quartic term and bounds the
cubic term over the interval. Possible boot support and a possible ground
impact keep the general enclosure. The support projector remains authoritative.

The shin response yields the remaining swing command for one tick in a
grounded pinch with opposing contact normals. A cross-player pinch requires
an impact back on the first shin. The planned root
endpoint and existing plant remain, and the new endpoint must admit valid
two-bone geometry. Each observed ball impulse still uses the original
contact response. The 192-sample search and 16-event interval limits and
geometric tolerances are unchanged.

The repaired E run and the continuation from 31:16 both stopped at
41:56.000. Exact reload reproduced 16 alternating shin impacts by
`footballer_pro_1_4` and `footballer_pro_1_17`, including three at the
same solver time. The swing had already yielded, but the players' remaining
root motion still closed the gap. Removing the inward root velocity along
the pinch axis still exhausted the event budget. Holding both complete
poses completed that tick but lacks a supported grounded response for the
players' momentum, so neither prototype is included. The frozen
`remaining` case records the failed step. A bounded response to simultaneous
contacts with two moving shins remains the full-match dependency.

**Promotion decision — RETAIN_EXPERIMENTAL.** The four repaired steps and
the 30 s and 120 s gates pass. The full-match attempt in E remains blocked
before half time. PR201/B remains the maintained integration profile.

Run both arms from kickoff with distinct labels:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224FullMatch.mjs D compare
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224FullMatch.mjs E compare
```

The runner writes one set of receipts per label and arm under
`.benchmark-artifacts/pr224-full`. Passing a compressed halt receipt as a
third argument runs the saved tick with mechanics tracing. The tracked
`docs/performance/pr224-full-match-checkpoints.json.gz` also works as the
third argument and replays the remaining stop. The 30 s and
120 s checks compare deterministic sporting digests in the new
`pr224-body-full-gate-*.json` receipts. The earlier receipts remain
reproducible on `35110e4`.

## Follow-up — continuous search through the archived stops

Replaying `8b8432a` reproduced both original 22-player halts at
25.037684 s (`footballer_pro_1_3`) and 5.364954 s (`footballer_pro_9_12`).
In both, sustained contact with the left boot brought the ball close to
that player's shin. The shin search had already certified 9.381 and 3.071 ms
of the respective remainders when it used its last sample. Restarting the
next capsule at local zero with the exhausted shared cache discarded that
progress, even though the right shin began 265 and 303 mm clear.

The search now traverses time once for the union of all candidate capsules.
Every rejected interval has a bound for all surfaces that could still make
contact. The tapered capsule's supporting plane bounds the proximal and
distal caps individually. Near the ankle, the distal cap moves mostly with
the ankle, with only its actual geometric share of knee travel. The
resulting earliest clear prefix survives exhaustion.

The first two-minute pilot exposed a different limit near 101.1 s in
`pr222-native-a`. A single grazing approach in free flight spent all 16
interval events certifying ever shorter prefixes. For affine boot motion
and free, bounded ball transport, the revised search uses a relative
endpoint chord. The analytically bounded acceleration of the two-bone
chain and ball limits the deviation from that chord to `A * dt² / 8`.
This certifies near-comoving approaches with a tighter separating plane.
Projected support, a possible ground impact, a pelvis cap switch and
singular geometry continue to use the more general travel enclosure.

The three [native checkpoints](performance/pr224-ccd-checkpoints.json.gz)
now advance through the original halted tick. The two supported-ball
checkpoints continue without a new shin impulse. The third records a single
left-shin graze at 101.114169 s, with ball speed changing from 3.771 to
3.644 m/s. The 192-sample and 16-event limits, contact dimensions and
distance and time tolerances have their original values.

### Ordinary play after the repair

| Archived 22-player input | 30 s ticks D/E | 120 s ticks D/E | E shin contacts, 30 s / 120 s | E controlled boot contacts, 120 s | E pass releases, 120 s | E possession changes / restart awards, 120 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| lab-mw3xhr6o | 1200 / 1200 | 4800 / 4800 | 1 / 4 | 16 | 8 | 24 / 5 |
| pr222-native-a | 1200 / 1200 | 4800 / 4800 | 1 / 7 | 21 | 7 | 30 / 6 |

Both E playtests complete at 40 Hz with zero safety halts and zero invalid
projected poses. Ordinary play activates the new contacts beyond the first
30 seconds. The focused PR223 pressure scene completes 64 ticks with four
lower-limb contacts and two controlled boot contacts. The earlier incidental
deflection still changes its sequence relative to D. The outcome does not
establish improved pass retention. Neither two-minute playback exercises a
keeper intervention. Human-controlled continuations and a complete match
are future evaluation gates.

The two shorter runs preserve D's terminal hashes from the original receipt.
The long-run engine timings are 4.77/4.81 ms per tick (D/E) for the first
input and 4.72/4.13 ms for the second on this Windows run. Different
football trajectories make those comparisons observational.

**RETAIN_EXPERIMENTAL.** The repaired candidate passes the bounded development
playtest. PR201/B is the maintained profile. Further promotion depends on
additional independent trajectories, concurrent support bounds and keeper
and human controls.

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224Body.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224Body.mjs --extended --check
```

[30-second comparisons](performance/pr224-body-continuation.json) ·
[120-second comparisons](performance/pr224-body-playtest.json) ·
[Original halted comparisons](performance/pr224-body.json)

## Plan and source baseline

The base is merged main `6d59d05bdc1c40543a16c902447ef588de796978` (PR223).
The maintained recipe is PR201/B at 40 Hz with 28 permanent attributes. The
product sequence remains canonical MatchEngine, validated statistical distillation,
then broader career, world and presentation. This work supports the first stage.
See [product roadmap](MFL_PRODUCT_ROADMAP.md) and
[integration architecture](match-engine/INTEGRATION_ARCHITECTURE.md).

1. Inventory physical, presentation and replay ownership on merged main.
2. Reuse the two-foot canonical trajectory selection to compose both legs at any
   queried time. Connect low-ball limb impacts to the existing event race.
3. Measure support interruption and next-step feasibility. Preserve explicit
   failure where the upright constraints cannot produce a valid step.
4. Run native action cycles, numerical Three.js/replay gates and historical checks
   before expanding to ordinary team play. Preserve outcome-changing controls.
5. Assess experimental readiness against real activation, cost and regression data.

## Baseline physical/visual capability matrix

This inventory describes PR223 before the implementation below. All articulated
rows use one root from the movement integrator, compact stance and motor state in
native saves, derived landmarks in presentation, and held whole replay snapshots
between recorded ticks. A body impulse rebases transport in the shared interval.
Prepared trajectories and actual receiving impulses have their own evidence.

| Movement | Classification | Ownership, contact and joints | Presentation, interruption and limits |
| --- | --- | --- | --- |
| Stationary stance and adjustment | SHARED_AND_TESTED | `articulatedGait` parks world anchors. `lowerBodyGeometry` solves two fixed-length chains from the pelvis. Boots participate in the low-ball race. | `PlayerModel.applyCanonicalBody` maps the same landmarks. PR218 tested support and native round trips. D can hold reachable anchors through a torso event. |
| Walk, jog, sprint | SHARED_BUT_INCOMPLETE | `locomotion` and `canonicalMovement` own root speed. Gait updates one swing and one support with finite foot velocity and explicit grip. | Geometry is shared. PR218 v2 measured sprints and replay. Impacts rebase the remainder. Running flight and empirical gait calibration remain open. |
| Start, stop, brake | SHARED_BUT_INCOMPLETE | Traction limits root acceleration and braking while a support exists. Lower body follows authored feet. | Physical pose is projected when reachable. An impact can invalidate support. No dynamic tipping or stud slip. |
| Turn, pivot, lateral motion | SHARED_BUT_INCOMPLETE | Gait preserves planted yaw and applies a finite angular budget. Hip and knees follow IK. | Rendered planted boot yaw is canonical. Torso impulses affect transport. Pivot response lacks calibrated torsional slip. |
| Backpedal and rapid reversal | UNSUPPORTED_OR_UNVERIFIED | The same planar actuator and kinematic gait can move against facing. | Same projection and rebase apply. Dedicated reversal/contact feasibility gates are absent. |
| Reception and directional touch | SHARED_BUT_INCOMPLETE | `passReception` and PR221 prepared reception affect execution after real boot CCD. Incidental torso coverage uses a coarse capsule. | PR221–PR223 archived positive touches and pressure losses. Renderer projects the boot. Sparse replay can omit the contact-time pose. |
| Carry and consecutive touches | SHARED_BUT_INCOMPLETE | `carryExecution` expresses motor intent; ordinary shared low-ball contact gates actual acquisition and later impulses. | Foot and stance project from physical state. Another defender can win the race. PR223 reproduced a second touch under one intervention. |
| Ground passes and shots | SHARED_BUT_INCOMPLETE | Selected low passes use `pendingStrike` and moving boot CCD. Shots and some deliveries retain separate physical execution paths. | The prepared pass foot is projected. Other shot cues lack this continuous articulated contract. Chronological interruption applies to selected low passes. |
| Follow-through and motor recovery | SHARED_BUT_INCOMPLETE | Latched prepared contact and `recoveringFeet` own finite boot offsets. Ordinary non-boot paths have no composed time-dependent capsules. | `projectArticulatedBody` reconstructs knees and hips for display. Replay holds whole recorded poses. Root events can change the baseline anchor. |
| Standing defence and body collision | PHYSICAL_APPROXIMATION | Standing attempts use the shared boot; `playerBodyContact` and `multiBodyContact` solve upright torso cores. No articulated player–player limb solver. | Contact changes root motion and subsequent stance. Current collision envelopes do not exactly follow visible kits or skeletal volume. |
| Disrupted balance and return | PHYSICAL_APPROXIMATION | D preserves reachable parked stance within the impacted tick. Ordinary gait governs the next tick. | Presentation shows the resulting state. No validated balance-loss, fall or get-up dynamics. |
| Jump and landing | SHARED_BUT_INCOMPLETE | Existing ballistic root jump and stance support release move feet. Landing feeds gait. | Root and legs project when reachable. Ground reaction, one-foot landing and coordinated aerial limbs are unverified. |
| Low-ball shin, knee and thigh | MISSING | Ordinary path has the boot sphere and torso surrogate. `ballSurfaceContact` has separate optional base-pose body-reception geometry. | The renderer projects composed segments, but their ordinary collision authority is absent. |
| High-ball and keeper movement | PHYSICAL_APPROXIMATION | Heading, aerial and keeper modules own their current reach, root and law logic. | Existing display and replay support approximations. Shared articulated saves and head/hand surfaces remain unverified. |
| Arm and head gestures | VISUAL_ONLY | Secondary rig cues lack physical authority. | They can react to match cues without claiming new surfaces or actions. |

Source and evidence references

[PR195 physical gaps](PR195_MATCH_ENGINE_ASSUMPTIONS_AUDIT.md#9-physical-feasibility-gaps),
[PR218 model](PR218_CANONICAL_ARTICULATED_BODY_AND_GAIT.md),
[PR218 v2 continuation](PR218_STANCE_V2_GATE_REPAIR.md),
[PR219](PR219_BALL_ANTICIPATION_AND_TECHNICAL_PREPARATION.md),
[PR220](PR220_LEARNED_MOTOR_PREPARATION.md),
[PR221](PR221_ANTICIPATORY_RECEPTION.md),
[PR222](PR222_NATURAL_RECEPTION_AND_SECOND_TOUCH.md),
[PR223](PR223_POST_IMPACT_FOOT_AND_SUPPORT_PHYSICS.md),
[match protocol](match-engine/HOLISTIC_MATCH_PROTOCOL.md),
[mechanism inventory](match-engine/HOLISTIC_MECHANISM_INVENTORY.md),
[mechanism dependencies](match-engine/MECHANISM_DEPENDENCIES.md).

The main duplication is the separate pending/challenge/latched/recovering-foot
lookup in `articulatedBody` and `pendingStrikeInterval`. The boot solver validates
one boot against the other base anchor. The observer solves both effective boots
together. The ordinary race considers separate boot, torso, player collision,
boundary and frame events. The optional PR190 body-reception experiment and
keeper/aerial consumers retain their own scope. The replay projector coalesces
important state changes into bounded samples, then holds all articulated landmarks
and the root together through an unsampled interval.

## Initial integration decision

**RETAIN_EXPERIMENTAL — draft.** E is `composed-leg-contact-dev-v1` over
PR223/D, articulated v2 and the existing standing-contact timeline. The examples
prove distinct real shin impacts, shared leg posing and a complete selected
low-pass cycle. Both 22-player E arms eventually exhausted the limb CCD
search. The pressure control changed before its first controlled touch. This
blocks the longer playtest and any default or realism-registry promotion.

## Shared geometry and chronological contact

- **Research change.** `effectiveArticulatedFoot` owns the pending pass, standing
  attempt, latched path and recovery lookup for the interval and presentation.
  `composeArticulatedLegs` solves the common pelvis, both two-bone chains and
  capsule axes from those effective boots. The grounded non-action foot keeps
  its stance anchor. An unreachable composition has an explicit unavailable
  projection or contact safety halt. The renderer consumes it through
  `canonicalPresentation` and `PlayerModel.applyCanonicalBody`.
- **Contact coverage.** In the selected ordinary low-ball intervals, the existing
  event queue compares composed outfield thigh and shin sweeps with player
  collisions, boot contacts, boundaries and expiry. The rounded ends expose
  the knee. The shin tapers from the canonical proximal radius to a 17.5 mm
  distal cap above the ankle plane. This uncalibrated shape avoids extending
  the calf's full radius into the boot. The existing 35 mm boot sphere is
  preserved. Gear and visible mesh thickness remain presentation approximations.
- **Time of impact.** The sweep samples exact composed joints at queried times,
  with interval bounds from foot transport, pelvis reach and two-bone IK.
  It derives the normal from the actual ball and capsule axis and estimates the
  material velocity from the same segment within 1 μs of impact. Search shares
  the interval's ball sampler. The existing projected support curve remains an
  approximation. Its speed envelope and the boundary between supported
  projection and free flight still need an independent grazing-contact bound.
  An exhausted search can commit a certified clear prefix in the same event
  queue. Unresolved remainder is a safety halt.
- **Attribution.** A limb deflection runs the existing body/law callback and
  physical rebound with measured surface velocity and normal. It clears
  possession and never produces an intentional kick or a controlled touch
  receipt. Initial penetrations and continuous adjacent boot contacts cannot
  re-arm a second impact while overlapped. A genuine earlier boot event still
  wins. The incumbent torso, keeper and aerial paths stay in their existing
  scope. Articulated limb–limb and limb–torso player collisions are outside E.
- **State and replay.** Native state still stores the compact stance and action
  state. E retains at most the interval's bounded 16 limb receipts, including
  each event time, surface point, normal, velocity and effective axis. Replay
  retains the receipts and bracket snapshots when observed at the engine tick
  rate, and holds a whole articulated pose on sparse seek. The event is
  inspectable at its physical timestamp. The visual player still uses the
  observed frame at either side of that timestamp, so an exact impact-time rig
  cannot be inferred between those frames. Historical/native optional fields
  and non-articulated replay fallback are supported.

## Focused football and stance results

| Canonical 40 Hz fixture | E result |
| --- | --- |
| Left 165 cm / reduced grip, right 195 cm / firm grass | One actual shin rebound per approach on both sides, including when the leg is recovering. No possession, controlled contact or release credited. |
| Lateral clearance | Zero shin impacts; the ball continues through the actual miss. |
| PR211 right and weak-left passes, advance and turning approaches | Each completes the preparing → swinging → contact → recovery → planted-support cycle. E preserves the intentional release in all four. |
| PR211 outrunning ball | Physical miss with recovery and renewed support. Zero releases. |
| PR218 lateral torso impact | Both arms execute 40 ticks with two torso impact instants and a restart. After the first impact, both affected players transfer to grounded support after 97.49 and 172.49 ms. E produces identical support locations and chronology to D. |
| PR223 pressured reception | D completes 64 ticks and records six boot contacts. E registers a right shin contact at 10.081261 s (3.740 → 1.495 m/s), then reaches its CCD budget at 10.104433 s. The archived recovery and subsequent turnover are no longer reproduced by E. |

The lateral-impact fixture demonstrates reuse of the existing finite recovery
of support with continuous root transport. E adds no acceleration, timer,
possession or guaranteed recovery step. In D's pressured scene, the receiver
plants left 238.08 ms after the first torso impact and the challenger plants
right after 88.08 ms. E preserves the unsupported outcome in its failed
interval. Existing stance applies zero ground delta-v without support and
keeps the actual external impulse. A general upright balance or fall solver
remains a dependency.

## Time-of-contact and support evidence

The new witnessed shin impacts solve the contact normal on the incoming event
geometry before any positional correction. The historical PR223 driver
continues to reproduce the 5.3266 m/s one-chord support rebound and its
approximately 5.618 m/s partition limit on the original measured source.
The historical result attributes the false launch to the boot trajectory,
with an additional numerical sensitivity to the correction normal. The
support impulse solver is retained. An opt-in mechanics trace reproduces
the E pressure halt with no committed persistent support in either of the
two involved ticks. The next search fails after another shin candidate
inside the tick that rolls back. The failure can occur in free flight, so
the pressure scene establishes no causal case for changing support normals.
Certify the free-flight search before validating its supported-ball variant.

## Renderer and native replay parity

The numerical Three.js tests cover 33 samples per pass fixture from initial
stance through recovery and subsequent support. They compare root, pelvis,
hips, knees, ankles and boot landmarks, reload native state every step, and
seek between samples. The maximum permitted world-space error is 1e-10 m.
The separate engine benchmark samples continuous poses across both 22-player
trajectories for valid geometry up to their stop. Its measured maximum bone
length error is below 1.5e-14 m. A rig fallback still displays old recordings;
arm/head poses are cosmetic and cannot change a collision shape.

The existing browser harness captured three paired WebGL scenes in Edge
157.0.4341.46 at **1366×768** and **1920×1080**. It reused the actual Three.js
player model, kit and landmark transforms. Maximum measured candidate error
was **9.20e-15 m**. The gold overlay in the shin scene marks the real
event point and collision axis. The visible body is the recorded post-tick
pose. [Measurements](performance/pr224-browser/report.json) ·
[1366×768](performance/pr224-browser/recovering-shin-1366.png) ·
[1920×1080](performance/pr224-browser/recovering-shin-1920.png)

## Historical controls and original 22-player integration

PR218 established stance, connected bones and a shared rig. PR219 established
observed preparation and retained misses. PR220 retained failed placement
interventions. PR221 and PR222 added prepared reception, possession races and
their negative pressure controls. PR223 isolated the parked remainder and
preserved the defender's actual win. E reuses the same runtime and preserves
the archived A–D selectors. Its pressure trial has new physical contact and
a new explicit failure. It supplies no evidence that E reproduces D's
directional reception and second controlled touch under that pressure.

| Archived development input | D ticks | E ticks | E composed contacts | E executed boot contacts | E torso impact instants | E ownership changes | E legal restart awards |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lab-mw3xhr6o | 1200 | 1001 | 3 | 6 | 23 | 7 | 2 |
| pr222-native-a | 1200 | 214 | 1 | 2 | 7 | 4 | 1 |

E made two and one pass releases respectively and exercised real lower-limb
activation. The safety halt occurs in the 25.025–25.050 s interval in the
first input and in the 5.350–5.375 s interval in the second. These are failed
smokes. D completed both targets. The samples show 40 Hz movement, body
contacts and legal restarts. Competitive second-touch completion, active keeper
intervention and human-controlled match continuations are still unverified
for E. The deterministic evidence stores the halt actor, time, ball and
velocity. No longer representative or full development match was run.
[Paired receipts](performance/pr224-body.json)

## Performance and verification

One Windows Node 24.22.1 bounded run measured mean engine time of 5.44/3.46
ms per completed tick (D/E) on the first match input and 6.60/7.97 ms on the
second. Sampled process heap was approximately 158/173 MiB and 182/182 MiB
respectively. These costs include different traversed match prefixes, action
counts and concurrent host workload. A matched complete-match overhead claim
requires passing the liveness gate. Browser median CPU submission over the
six scene/viewport pairs was 0.9–3.0 ms for D and 1.0–3.5 ms for E. The
diagnostic overlay adds draws only to the browser probe.

```sh
node scripts/ci/replayPr218Check.mjs
node scripts/ci/replayPr223Check.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr224Body.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr218Browser.mjs --pr224
npm run verify
```

PR218 and PR223 source-bound archive checks pass. PR220's negative placement
controls pass against merged PR220, and the PR219, PR221 and PR222 controls
reproduce using the PR223 tree. The 12 focused tests, TypeScript and the
production build pass. The first full local verify had 2717 passing unit
tests and three existing time-budget failures. The local retry and hosted
results are tracked in the PR.

## Physical/Visual Footballer Completion Register

| Classification | Evidence and remaining work |
| --- | --- |
| A. Implemented and validated locally | Authoritative root, planted-foot anchors, finite traction/gait and fixed-length chains. Canonical boot contacts and rendered landmarks for selected ground passes. Whole-pose replay hold and native reload. PR218 and PR224 regression tests. |
| B. Implemented; broader confirmation needed | E's timed shin deflections, leg receipt replay and kinematic replanting after a real body impact. The repaired search passes three frozen checkpoints and both two-minute 22-player trajectories. Upper capsule and knee race code require independent ordinary-play activation. |
| C. Incomplete in the current body | General search bounds with several persistent support surfaces, stable ground/boot/shin ownership near the ankle seam, quantitative limits on accidental impulse and recoverable balance, exact event-time rig rendering, directional reception and second touch under pressure. Natural acceleration, sharp reversal and lateral gait need more sequence coverage. |
| D. Requires new physical mechanics | Empirical running flight, stud slip and recovery, 3D COM and angular balance, tipping/fall and get-up, upper-body/head contact, articulated keeper saves and advanced aerial football. |

### Minimum dependency order

1. Retain the three frozen checkpoints and verify the shared search against
   more projected-support and competing-surface inputs, including grounded
   transitions, with existing boot coverage and defender authority.
2. Repeat the pressure pair with defensible ankle/shin coverage. Validate
   the incidental impulse and a real interception, directional first touch
   and subsequent controlled action. Retain the negative outcomes.
3. Measure support release, movement constraint and replanting through
   larger interruptions. Explicitly retain infeasible outcomes that need
   dynamics. Add compact impact-time presentation evidence only where the
   canonical solver can supply it.
4. Extend the successful 120-second 22-player trajectories to independent
   fixtures with measured activation, legal restarts, keeper and human
   controls. Justify a full match from those results before considering
   promotion. MatchEngine readiness remains upstream of statistical
   distillation and wider career development.
