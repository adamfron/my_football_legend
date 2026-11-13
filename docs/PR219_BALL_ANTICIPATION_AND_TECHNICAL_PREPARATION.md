# PR219 — Ball anticipation and technical preparation

**Draft · RETAIN_EXPERIMENTAL.** Single Match Lab can select the PR218 articulated
edition. A separately selected research arm evaluates observation-driven low passes.
Maintained PR201/B, career defaults and the sealed confirmation cohort retain their
existing selections. Base is merged PR218 `9c35e8cc5f048767ea170ce7c5748fb118f5a523`.

## Evidence before changing the motor

The [PR218 attempt-6 receipt](performance/pr218/full-stance-v2-summary-attempt-6.json)
has 255 active-foot attempts over 228001 canonical steps: 84 contacts, 159 misses,
7 interruptions and 5 cancellations. Pass completion is separate. The native archive
preserves action ID, actor, episode, requested time, outcome and contact receipts.
Every miss carries `swing_completed_without_contact`. The terminal state and sparse
checkpoint hashes alone cannot identify its cause.

The diagnostic runner starts from the native input in the archived receipt and
repeats the same human menu rule. The recorded baseline reproduced **255/255**
action IDs, outcome/reason and event time within 0.1 μs, the 39 human choices and the
95-minute 1–1 terminal. It records the committed plan and seeded noise, player
attributes, observed belief, actual ball and root state, both world-space boots,
support, active boot endpoint/velocity and local body contacts. It collects only
around selected actions. Authoritative ball samples and the zero-error
counterfactual are processed offline.

| Condition sampled around the committed swing                           | Misses / 159 | Contacts / 84 |
| ---------------------------------------------------------------------- | -----------: | ------------: |
| Relative swing scaled below 1 by the existing actuator envelope        |          133 |            54 |
| No planted foot at one or more samples                                 |          123 |            54 |
| Ball > 0.145 m from the intended ball point at the nearest grid sample |           27 |            20 |
| Both actuator scaling and the ball-point residual                      |           19 |            16 |
| Neither of those two conditions                                        |           18 |            26 |
| Articulated joint stop observed                                        |            9 |             3 |
| Body interference observed                                             |           13 |             6 |
| Preparation clock < 0.12 s                                             |           14 |             2 |
| Belief absent or older than 0.15 s at the first sample                 |            5 |             1 |

Counts overlap. The actuator clips a cubic when the requested displacement,
terminal velocity or follow-through exceed its engineering envelope. That is the
most frequent measurable precursor to a miss, followed by sampled loss of support.
Neither observation independently proves that a feasible action existed, or that
removing the limit would have produced contact. The 84 contacts provide direct
counterexamples to either condition as a sufficient cause. Simulator knowledge
of the ball at selection was used by the old strike planner, so belief age by
itself cannot explain an old strike's targeting error.

- **Perception and prediction.** The historical plan aimed at selection-time ball
  position. In action 4 (`footballer_pro_9_17`) the ball was 0.277 m from that point
  near the intended instant, while the actuator scale was 0.865.
- **Timing, position and reach.** Action 24 (`footballer_pro_9_3`) missed a stationary
  ball. The nearest grid sample was 0.326 m from the actual boot and the planned
  path scale was 0.452. Action 7 missed with scale 1 and an unplanted sample.
  Joint limits, support and contact timing describe distinct constraints.
- **Seeded motor error.** Replacing perturbation on the observed body trajectory
  produced no grid-sampled overlap among misses where the actual samples stayed
  outside the contact envelope. A grid sample may miss a shorter interval and
  this conditional comparison does not rerun subsequent impacts.
- **Interference.** Two `active_challenge` and five `competing_foot` interruptions
  have direct event identities. Five cancellations record another touch, current
  capability or unsupported challenge timing. Body impacts during 13 misses are
  contributing observations whose individual counterfactuals remain unknown.
- **Difficulty and numerical resolution.** There were no terminal strike
  outcomes labelled unresolved in the reference. Certified continuous search
  remains the physical authority. Grid sampling cannot establish that a
  separating touch or a substep search frontier would have produced a valid
  alternative impulse.

The number of misses caused primarily by each condition remains unknown. The
evidence supports investigating the requested path and the body/ball alignment
first. Preserve the finite speed, joint and contact bounds.

## Observation and motor experiment

`advanceLiveBallFlight` owns bounded optical acquisition, occlusion and age.
`predictFlightBelief` projects the last acquisition with growing uncertainty and
no unseen spin. The ordinary decision observation and local reception planning
retain their separate authority. The strike experiment accepts a current optical
position or a sighting up to 150 ms old. A fresh optical position without a usable
velocity estimate can still support a stationary hypothesis. The same existing
observed-flight step estimates position and incoming velocity at the selected
contact time. A new acquisition can change a subsequent intention. A committed
swing keeps one deadline and one seeded perturbation.

The research selector `observed-low-pass-dev-v1` requires articulated v2, bounded
flight and the pending low-pass timeline. The motor evaluates 50, 75 and 100 ms
swing commands against the existing nominal actuator envelope, using the actual
world-space boot origin and preserving the planted boot when a foot is
unspecified. The earliest unscaled command wins, or the least scaled candidate
with a forecast inside the low-contact height. The lower bound on ability still
comes from the same finite trajectory, gait and actual contact search. Joint
limits, opponent impacts and moving-ball error remain authoritative. No
position/velocity correction, impact coefficients or hitbox changes are part of
the experiment.

Existing `concentration` affects the optical acquisition interval and
`gameReading` affects the motion estimate's finite-difference correction.
`agility`, technique, passing, strength, weak-foot proficiency and composure
remain in their existing motor/capability/perturbation consumers. The experiment
does not establish an empirical attribute curve or a causal skill ladder.

## Reception, decisions and limits

Existing `localReception`, `preReceptionPlanning` and `receiverReadiness` project
intentions and keep actual contact separate from control. The shared low-foot
interval and `footContact` own finite contact impulse, tangential slip, spin and
the resulting loose ball or controlled continuation. The 54-arm canonical
reception study measured the existing v2 consumer at three first-touch values
and three seeds.

| Setup                                              | Initial receiver contact / 9 | Any receiver control / 9 | Receiver still owns at 600 ms / 9 |
| -------------------------------------------------- | ---------------------------: | -----------------------: | --------------------------------: |
| Frontal, 4 m/s                                     |                            9 |                        9 |                                 9 |
| Lateral, clear approach                            |                            9 |                        9 |                                 9 |
| Running, 4 m/s                                     |                            9 |                        9 |                                 6 |
| Defender approaching, 4 m/s                        |                            9 |                        9 |                                 0 |
| Frontal, 18 m/s                                    |                            9 |                        9 |                                 9 |
| Lateral, initially inside opposite boot's envelope |                            0 |                        0 |                                 0 |

At first touch 25 in seed `pr219-a`, the frontal ball slowed from 3.73 m/s to
zero with an observed 1.61 N·s cushion impulse. The running receiver left the
ball at 1.44 m/s after contacting it at 3.59 m/s. The 18 m/s case slowed from
17.95 to 10.61 m/s on the first contact and stayed loose until later recovery.
The penetrating lateral setup stopped conservatively before contact in all nine
arms (initial overlap 14.6 mm against the opposite boot). Its legal mirrored arm
provides a separate lateral control. First-time redirection and movement
preparation gains under pressure need matched follow-up measurements. Human
incoming menu readiness uses the existing contract.

The research arm can decline a pass when its sighting is absent or all sampled
contact points are above the supported height. The ordinary hold, carry and
shielding paths remain available. The [120-second ranking capture](performance/pr219/passing-lanes.json.gz)
observed eight rankings with passes, comprising 107 variants. Twenty-eight
central-midfield variants qualified for ranking, 24 had nonnegative receiver
preparation margin and none ranked first. Other slots had 79 variants, 72 with
nonnegative preparation margin and seven ranked first. The same interval
recorded seven resolved passes from all release paths. Variants include multiple
deliveries and targets for the same receiver, and ranking first can precede a
miss. This sample flags ranking as another possible explanation and cannot
quantify a whole-match positional bias. Tactical ranking is unchanged.

A multi-step pre-commit locomotion controller, distinct readiness decisions for
repeated impossible attempts, new first-touch calibration and the full A–O
matrix remain open. The next dependency is verified body/boot alignment before
commitment, followed by matched first-touch preparation interventions.

## Lab, browser and replay

Single Match Lab adds **Holistyczna + szkielet v2 (eksperymentalna)**. A shared
initializer applies the holistic recipe and native v2 stance before canonical
play. Time-zero kickoff positions re-anchor the boots at their new roots.
Historical v1 saves require their historical runtime. The HUD, export and replay
identify the effective selectors, and the readout keeps attempts, contacts,
misses, interruptions, cancellations and unresolved events visible. Viewer
replay uses the canonical poses in the existing render buffer. The research
selector stays outside the ordinary menu.

Edge 155 exercised startup, play, pause, canonical replay, export and same-seed
restart for spectator and controlled-player sessions at both 1366×768 and
1920×1080 against the [production build](performance/pr219/browser-production.jsonl).
Core replay tests verify that the saved frames carry v2 body geometry. The
targeted suite passed 111 tests. The subsequent reset regression, which covers
explicit developer scenario placement, passed in the focused 24-test rerun.

Reproduce using Node 24 and the existing TypeScript loader.

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Preparation.mjs --version=baseline
node scripts/auditPr219Attempts.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Preparation.mjs --lanes --seconds=120 --version=lanes
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Preparation.mjs --observed --validate-poses --seconds=120 --version=observed-smoke
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Preparation.mjs --observed --validate-poses --version=observed-full
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Skill.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Reception.mjs
node scripts/ci/replayPr218Check.mjs
```

The paired baseline/research experiments share the frozen initial state and
human test-driver rule. Subsequent trajectories can diverge. In the initial
120-second probe the baseline yielded six attempts (one contact, three misses,
two interruptions). The research arm yielded one contact, one miss and one
pending attempt at the cutoff. Different opportunities and the small sample
preclude a contact-rate conclusion.

The [full research trajectory](performance/pr219/observed-full.json.gz) consumed
the identical frozen starting state, reached full time after 5641.525 s and
225661 canonical steps, and ended 1–1. Every sampled active lineup had a valid
composed pose, and the run recorded no safety halt or unresolved strike. It
exercised 37 human menus. The paired baseline ended 1–1 after 5700 s.

| Active-foot outcome   | PR218 baseline | Observed preparation |
| --------------------- | -------------: | -------------------: |
| Attempts              |            255 |                  265 |
| Contacts              |             84 |                   86 |
| Genuine misses        |            159 |                  159 |
| Interrupted           |              7 |                    4 |
| Cancelled             |              5 |                   16 |
| Actuator-limited path |            197 |                  156 |

Actuator scaling fell while genuine misses stayed at 159. Eleven research
cancellations reported `current_capability`, versus three in the baseline.
The 100 ms swing was selected in 184 attempts, 75 ms in 39, and 50 ms in 42.
A longer estimate does not reserve the opportunity, and reducing path clipping
does not ensure alignment or availability when the actual contact is resolved.
This trajectory supports continued experimentation. It provides no convincing
match-level execution improvement and does not warrant enabling the research
selector in the Lab menu.

The two extra 120 s runs reused the formation and changed only the seed,
[`pr219-alt-a`](performance/pr219/independent-a.json.gz) and
[`pr219-alt-b`](performance/pr219/independent-b.json.gz). Both stayed live with
valid active poses. The first recorded one contact, four misses, two interrupted
and three cancelled. The second recorded one contact and two misses. These
development seeds do not open the independent confirmation cohort. The full
observed run used 1564.0 s wall and 619.7 MiB peak RSS during concurrent local
tests and per-tick pose projection.

The matched local laboratory ran 150 arms (three seeds, five trajectory classes,
five technique levels, two editions). Every fixture deliberately selected one low
pass. Its separate physical contact results were:

| Initial trajectory        | PR218 contacts / 15 | Observed contacts / 15 |
| ------------------------- | ------------------: | ---------------------: |
| Stationary                |                  15 |                     15 |
| Approaching at 1.5 m/s    |                  15 |                     15 |
| Receding at 1.5 m/s       |                   0 |                     14 |
| Lateral at 3 m/s          |                   0 |                     15 |
| Fast approaching at 8 m/s |                  15 |                     15 |

The fast approaching ball intersects the boot in this arrangement. Speed alone
is insufficient to order contact difficulty. The observed receding miss at
technique 25 in seed `pr219-a` had actuator scale 1.
Mean absolute seeded timing error with technique 25/45/65/80/95 was
3.78/2.99/2.19/1.59/1.00 ms in the observed arm. This is sensitivity to the
existing execution model with other attributes fixed. The contact count was
14/15 at level 25 and 15/15 at each higher level. These small, intentionally
repeated setups do not establish real-world calibration or a robust skill ladder.

Raw [baseline attempt diagnostics](performance/pr219/reconstructed-pr218-attempt-6.json.gz),
[initial observed smoke](performance/pr219/observed-smoke.json.gz) and
[matched skill arms](performance/pr219/skill.json.gz) and
[reception arms](performance/pr219/reception.json.gz) retain unsuccessful trials.
Reconstructing the baseline with extra sampling took 867.4 s wall and 639.5 MiB
peak RSS on the local machine. The local skill matrix took 5.8 s wall. These runs
had different observation loads and are not directly comparable performance
measurements.

The local canonical tests exercise stationary, approaching, receding, lateral
and fast balls, early/late defender arrival, identical preparation with altered
hidden spin/velocity, and native reload around commitment. Historical gait,
release/recovery and replay tests cover v2 finite support and pose parity. The
historical consolidated CI checks PR218 in its exact archived tree and preserves
the original receipts, while the current suite exercises the live selector.

Production build, TypeScript, lint, the five full-career tests, the consolidated
manifest/workflow, seven CI contracts, and the original PR217/PR218 source-bound
checks passed locally. The unit phase of `npm run verify` passed 2696 tests and
exceeded wall-clock limits in ten tests while full trajectories and historical
checks were running concurrently. A separate integration invocation passed
53/56 and hit two half-match child-process time limits plus a 5 s UI test limit.
The Draft status reflects the incomplete consolidated verification on this
Windows host and the provisional research result.

## Readiness and next dependency

1. The strongest observed precursor is actuator-limited swing amplitude (133/159
   misses), with support, motion and interference contributing. Majority causal
   attribution remains unproven.
2. The trial forecasts local contact from a bounded sighting. Test coverage
   establishes the observed information path in the local cases.
3. Some willing swings preserve the plant and use a longer bounded trajectory.
   Reliable early body placement across a match remains unproven.
4. The isolated technique sweep measured the existing timing-perturbation response.
   Joint cognitive and locomotion calibration remains open.
5. Local tests exercise the difficulty range and retain real misses. They do
   not establish population-level success ordering.
6. Canonical receiving yielded cushioning, loose contact, later recovery and
   short-lived control under pressure in the matched reception laboratory.
7. The strike experiment retains contact search, limits and event order;
   its late defender and fast-ball arms exercise actual canonical outcomes.
8. The v2 selector is available in Single Match Lab in spectator and player mode.
9. Local save/replay is deterministic. Both full trajectories ended legally.
   Whole-match improvement and broad research readiness remain unproven.
10. Prioritize technical preparation and matched first-touch evidence before
    conditioning calibration. Keep non-boot surface coverage as an explicit
    integration dependency.
