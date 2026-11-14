# PR222 — Natural reception and second-touch continuity

**RETAIN_EXPERIMENTAL.** This stage adds an observer and an executable paired
replay. PR201/B remains the maintained integration profile. Native A/B/C use
the same previous experimental editions, rules, 28 attributes and 40 Hz
step. The independent confirmation cohort remains sealed.

## Prior evidence and scope

[PR219](PR219_BALL_ANTICIPATION_AND_TECHNICAL_PREPARATION.md) supplied the
historical reception scenes and the bounded flight path. [PR220](PR220_LEARNED_MOTOR_PREPARATION.md)
recovered none of its three strike misses with late placement and lost
41, 39 and 35 previously successful contacts against its corresponding
time-matched controls. The motor change stayed in the laboratory.
[PR221](PR221_ANTICIPATORY_RECEPTION.md) ran 87 paired inputs and 261 executions.
The visible, longer deliveries showed gains from adaptive touch, with root
paths within 1 mm in two successful examples. In the historical pressure
matrix each arm touched 9/9 and held 0/9 at 600 ms from scene start.
The original 22-player smoke had 24 plan ticks and zero prepared touches.

The [PR195 assumptions audit](PR195_MATCH_ENGINE_ASSUMPTIONS_AUDIT.md),
[holistic protocol](match-engine/HOLISTIC_MATCH_PROTOCOL.md),
[PR217 reliability record](PR217_HOLISTIC_MATCH_RELIABILITY_AND_PLAYTEST_EVIDENCE.md)
and [PR218 stance gates](PR218_STANCE_V2_GATE_REPAIR.md) govern attribution.
An optical sample, motion acquisition, plan, authoritative target, collision,
retained impulse, ownership, action choice and executed continuation are
separate witnesses.

## Replay and source lineage

Base `3013ac29a15977b7951421dfb0999f660d035f3c`. The
[receipt](performance/pr222/reception.json.gz) uses the canonical archived
[PR217 kickoff](performance/pr217/session-input.json.gz) with the same body
edition and autonomous control as PR221. Use the archived seed
`lab-mw3xhr6o` and a second development seed `pr222-native-a`. Each of the
six trajectories has at most 1,200 ticks (30 s). The second input changes
only the initial seed. All 22 players run ordinary policy throughout.
The historical pressure input is `pr219-a`, First Touch 60. Use the exact
24-tick prefix and continue the same input to 64 ticks to observe retention
relative to control. The longer pressured and clear lateral scenes use the
same seed and attribute. The other PR221 controls are checked against the
original receipt.

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr222Reception.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr222Reception.mjs --lab-only
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr221Reception.mjs --check
```

Use Node 24. The first command regenerates the full SHA-256 comparison,
including the kickoff archive, per-arm input, every tick and native terminal
state. The second command writes just the supplementary lab receipts to
`.benchmark-artifacts/pr222`. A/B/C change the selector at kickoff or scene
start. They are paired trajectories and can produce different decisions
from that point. A release that appears in one arm cannot be assumed to
have the same identity in another. The first projected body, ball or
action divergence is retained in the receipt.

- `liveBallFlight.advanceLiveBallFlight` records the optical sample, gaze,
  blocker and actual acquisition clock. `activePerception` supplies gaze
  and remembered geometry. `preReceptionPlanning.advancePreReceptionPlans`
  logs the local planner input, its review and the emitted plan.
- `localReception` admits plans under finite confidence, freshness and
  timing. `movementAuthority` resolves priorities. The observer records the
  target passed to `integrateCanonicalMovement`, whether the early reception
  proposal won, and the v2 support and moving boots seen by the interval.
- `pendingStrikeInterval` records the chosen collision and post-impact
  support remainder. `changePossession` records the plan committed before
  the interval, the witnessed foot and the consumer's actual timing.
  `passReception`, `firstTouch` and `footContact` supply the finite impulse.
- `carryExecution` supplies the route and pursuit intent.
  `ballContactGeometry.advanceControlledBall` logs the readiness deadline,
  current reach check, next objective and the actual envelope exit.
  A carry intent is executed in this report when a following retained boot
  touch actually occurs. A temporal pass requires its matching strike
  contact and release. The runner keeps other release metadata for review.

The observer lives outside native state. Each traced tick is checked against
an untraced tick on the same trajectory. C also replays from a JSON/native
schema round-trip at every tick, with a sorted-key projection of physical
and action state and a normalized terminal hash. The projected XY movement
target contains the two coordinates consumed by locomotion. Live targets
occasionally carry extra fields from a BallState object that native parsing
strips.
The relevant reception windows match across reloads. The second C run
has a projected metadata difference at tick 825 (20.625 s), after the
reception trace. Native parsing strips four extra shot-diagnostic fields
(`goalPoint`, `heightMetres`, `launchVelocity` and `launchElevation`).
Both runs have identical normalized native terminal hashes.

## Ordinary 22-player evidence

The search records every new open-play pass diagnostic and preserves the
matched temporal strike where present. It retains up to 3.5 s after release
or through the next pass tick, plus 0.5 s before intention or release. The
prepared-contact window retains the preceding 3.2 s and following 1.5 s.
A several-metre defender at release is a pressure opportunity. An actual
challenge or contact requires its own event.

| Kickoff seed | Arm | Open-play pass diagnostics / matched physical strikes | Plan ticks / distinct plans / positive reviews | Early target wins | Prepared contacts |
| --- | --- | ---: | ---: | ---: | ---: |
| lab-mw3xhr6o | A | 1 / 1 | 0 / 0 / 0 | 0 | 0 |
| lab-mw3xhr6o | B and C, each | 2 / 1 | 24 / 4 / 4 | 2 | 0 |
| pr222-native-a | A | 4 / 4 | 0 / 0 / 0 | 0 | 0 |
| pr222-native-a | B and C, each | 3 / 1 | 124 / 10 / 22 | 31 | 1 |

All six runs reached 30 s with 22 finite poses and no safety halt. A/B
first diverged at tick 22 (0.550 s) in both seeds. B/C had identical
projected bodies, ball and policy decisions throughout both runs. No
open-play pass in the table produced a logged first ground contact by its
intended receiver within the retained episode. In the first seed A's
17.556 s low pass reached an opponent's foot at 20.912 s. The intended
receiver had 133 out-of-view samples and eight occluded samples in the
window. B/C's 24.930 s low pass gave the intended receiver optical
acquisition at 25.075 s, with rejected meetings and then out-of-range
samples.

In the first seed B/C, four plans formed from 2.325 to 3.825 s. Two
locomotion ticks used the early target for `footballer_pro_1_22` at 2.875
and 2.900 s. Its 4.816 s predicted meeting disappeared at the 2.925 s
review, when observed horizontal speed fell to 0.47 m/s. The other plans
also ended at a no-meeting review. No planned actor entered the contact
handoff while its plan remained live.

The most direct live-pressure pass in the open-play search occurred in
second-seed A. At the 27.207 s release towards `footballer_pro_9_7`, the
nearest opponent was 2.14 m from the receiver. The intended receiver
acquired an optical observation at 27.400 s. The passer reached the
ball at 27.646 s and `footballer_pro_1_4` entered the contact race with a
standing challenge at 27.787 s. In B/C, after the 9.935 s delivery described
below, `footballer_pro_9_3` saw the ball at 9.950 s between acquisition
windows. Seven occluded samples and subsequent out-of-view samples followed.
A teammate's foot reached the ball at 10.743 s before any new receiver
acquisition or plan.

### Native prepared recovery and subsequent release

In second-seed B/C the most complete trace begins with a legal restart
pass by `footballer_pro_9_12` for `footballer_pro_9_7`. The runner records
its actual ball flight, release diagnostic and receiver collision. This
restart delivery is outside the open-play temporal-strike count.

| Match time (s) | Source event |
| ---: | --- |
| 6.200 | Restart pass diagnostic and release for `footballer_pro_9_7`. |
| 6.952 | Receiver's right boot makes the delivery's first retained contact. The plan handoff is absent. |
| 7.125 | The receiver loses control through the control envelope before a retained follow-up. |
| 7.337 | The loose ball hits `footballer_pro_9_12` in a body collision. Its speed falls from 17.78 to 6.40 m/s and it returns towards `footballer_pro_9_7`. |
| 7.425–8.625 | A local plan forms at 7.425 and is replaced at 7.825. The last pre-contact review estimates 8.869. A reception target wins at 8.475, over 320 ms before impact. |
| 8.796 | The right boot physically intersects the loose ball. The committed plan is used with right support and 971 ms elapsed since creation. The latest motor observation is from 8.775. The cushion receives 2.21 m/s horizontally and leaves near-zero horizontal speed and 0.415 m/s vertical. The closest opponent is about 11 m away. |
| 8.975–9.224 | Carry is selected. A later pass is committed at 9.150, then cancelled at 9.224 with `current_capability`. Ownership ends before any retained follow-up. |
| 9.386–9.935 | The receiver regains control with the left boot, then commits and physically releases a pass to `footballer_pro_9_3`. This is a new control episode. |

B and C show the same support, cushion and chronology. This is a native
plan surviving to an actual boot contact and a later physical next action
after reacquisition. The planned contact was with a loose return from
a teammate's body after an earlier failed hold. The direct pressured
pass-to-continuation gate remains open.

At 600 ms after the 8.796 s control, the sampled owner is again the
receiver (9.400 s sample). The loss at 9.224 s and left-boot reacquisition
at 9.386 s sit between those endpoints. Continuous retention and a second
controlled touch within the first spell both fail.

## Historical pressure case

Times below are milliseconds from the native lab scene start at 10.000 s.
They agree across A/B/C through the 24-tick prefix.

| Time | Observed authority and consequence |
| ---: | --- |
| 25 | First optical acquisition, without motion history. Contact precedes the next scheduled acquisition. The plan consumer has no valid flight plan. |
| 83.546 | Receiver's right boot intersects at (40.6730, 34.1700, 0.1100) m. The left foot supports. The colliding boot is stationary, the ball arrives at 3.733 m/s, and the spherical collision normal is (−0.876, 0, 0.483). The cushion logs a horizontal surface normal, −1.605 N·s along x, zero outgoing velocity and spin, and retained control. The first owned sample is the 100 ms frame. |
| 86.921 | The moving challenger makes a real torso impact. The receiver's root takes velocity (0.518, −0.276) m/s. At this instant the ball is still stationary and owned. |
| 86.921–100 | The contact interval rebases the receiver and projects the ball against its already latched right boot. The boot moves 6.6 cm in x, 1.5 cm in y and rises 3.5 cm over 13.079 ms. The same remainder's free flight leaves the ball at rest. Continuous support sends it to (40.6113, 34.1849, 0.1455) with velocity (−4.518, 1.090, 2.602) m/s. There is no new counted boot strike. |
| 275–300 | The ordinary policy selects carry and the movement consumer applies an evade/pursuit target. The initial motor deadline is 324.041 ms. A revision puts the planned follow-up at 420.8 ms. |
| 425 | Support switches from right to left. The due controlled contact fails the reach check. The receiver moves towards the departing ball and never intersects it with a free boot while retaining control. |
| 500 | Separation exceeds the 2.05 m control envelope. The engine emits a failed-control fact and makes the ball loose. There is no awarded defender boot touch in this window. |

The earliest witnessed break is the velocity change during the continuous
boot-support remainder after the defender's torso impact. The first-touch
receipt on its own misses it. Pursuit was selected and executed as
locomotion, with no second controlled contact. The 600 ms scene sample is
loose in all arms. The 24-tick case censors the sample 600 ms after control.
The 64-tick replay reaches that milestone at the 700 ms sample, where the
ball is still loose. The current readiness deadline is measured. An
independent feasible alternative boot trajectory is unavailable.

In the longer pressure scene the challenger occludes the sightline from
125 to 400 ms. Visibility resumes at 425 ms and contact occurs at 440.435 ms
with no acquired motion history and no valid plan. The gap is observed
before contact. The clear lateral control produces the same contact instant
in all three arms. C retains a later boot contact at 741.788 ms, versus none
before first possession ends in A or B for this seed. A/B first differ by
movement at 275 ms and B/C at the first contact tick (375 ms). The latter
shows the existing touch change. The pressure case still fails.

## Negative controls and verification

- The original PR221 matrix keeps blind start and later acquisition,
  changed flight, unreachable delivery, competing foot, awkward support
  and successful baseline scenes. All 261 executions match its archived
  receipt. PR222 adds direct optical blocker evidence from the moving
  challenger, the native teammate-first example and the native standing
  challenge chronology.
- All three arms reproduce the pressure prefix. The extended prefix
  observes the control-relative milestone and retains the same failure.
  The clear lateral C control still produces its later retained touch.
  Existing adaptive-reception, first-touch and spin tests pass (20 tests).
- The complete PR222 archived receipt regenerates with identical hashes.
  All captured ticks match the corresponding untraced state.
- The PR219 reception benchmark runs and the exact PR220 final placement
  receipt checks out on its merged source (`a0fb76e`). Running the PR220
  hash check against later source produces drift, so the historical
  verification is source-bound.
- Local lint, TypeScript, production build and the source-bound PR218
  checker pass. The PR217 checker reaches the Windows junction step and
  returns `EPERM`. Full local `npm run verify` reached the unit suite
  during draft preparation. See the draft PR for the hosted verification
  of the final code and the status of the full local run.

## Promotion gates

Gates 1 and 2 retain a positive native preparation witness and distinct
causal failures. The pressured lab case shows live defensive body contact,
a solver-mediated outlet and an ensuing reach failure. The evidence does
not establish how much of the supported boot movement is a feasible
balance response and how much comes from reconstructing the gait remainder.
A targeted change requires a paired trace of the same stance through that
impact, including the foot's feasible transport, support work and the
defender's response. Earlier sight or a different nominal cushion alone
cannot settle that question.

Gate 3 did not admit an arm D. Gate 4 did not open. The two short trajectories
are Gate 1 development evidence. Broader match evaluation requires a
physically justified improvement under pressure and a complete natural
pass-to-continuation chain. No full match was run.
