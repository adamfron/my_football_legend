# PR192 — Ball-Oriented Movement, Recovery Intelligence & Natural Match Flow

## 1. Executive summary and readiness

**Experimental draft; canonical NOT READY; independent confirmation remains sealed.**
The original 45°/90° failures are reconstructed on an unedited canonical Adam
Krawczyk card. The first impulses remain unchanged; subsequent movement meets the
observed ball instead of unconditionally pursuing the final destination. Recovery
still needs another physical foot contact and canonical control.

Two independent match switches isolate the mechanisms:

- A: `experimentalBallRecovery: true` — observed next-contact movement for existing
  carry/recovery intentions and removal of the absolute directional-attempt gate.
- B: `experimentalRestartPreparation: true` — finite dead-ball lifting before a
  throw-in, correcting a reproduced ground-to-release-height discontinuity.

Both are absent by default. `state-value-v1` (B) remains the default policy. The
laboratory uses the new movement by default and retains `movementModel: 'pr191'`
as a diagnostic comparison, with original experiment IDs unchanged.

Better recovery increases ball-in-play time in the A-only development fixtures.
This is a causal trade-off, not a successful statistical calibration. Low natural
boundary incidence, excessive circulation and attacking creation remain blockers.

## 2. Frozen baseline and experiment provenance

Merged PR191: **`9ea0e599f72800f4210092df2722e2ee16778ab7`**; its head was
`1a5e056acff341cf77cb7daf3936c397ca0c7608`. Canonical physics remains 40 Hz / 0.025 s.
PR189–191 reports, receipts, pathological captures and rejected cycles remain
unchanged. Their checks run against archived original source; they are not
rewritten to fit the new laboratory schema or outcomes.

`performance/pr192/reconstructed-pr191.json` retains the initial neutral-profile
reconstruction. `reconstructed-human.json` contains the later matching card,
original inputs, complete old/current contacts and traces, deterministic seeds,
hashes and all same-name candidate errors. Browser exports were unavailable.

Full matches reuse the unchanged WW/SS/SW × five-policy PR188 development inputs
already retained by PR190. Every input is checked against its original hash. These
are paired development fixtures, not a new independent cohort. The optional PR191
body experiment is off in these comparisons; it is a separate intervention.

Each match records its actual normalized source manifest, input hash, seed, status,
final full-state hash, CPU and memory. Early baseline/flow runs began before the
throw preparation change. Their exact source bytes are retained in compact
`source-overlays/`, checked file-by-file against the recorded manifests. The early
SS `flow` receipt is an **observer-only** control, not evidence for physical B.
Use the `flow-final` receipts for the final four-way comparison.

## 3. Human-observed directional failures

The supplied human observations were 2.975 m / 3.417 m separation, no canonical
control, first contact at approximately 0.450 s, and 3 / 2 actor contacts.
The world stores cards under `footballers[id].profile`; twelve canonical cards have
the supplied name. Comparing both rounded velocity vectors, separations and
contact counts identifies **`footballer_pro_9_12`**, without editing its attributes,
dimensions, foot preference or identity. This is an explicitly documented
reconstruction and identity inference, not a replay of an unavailable export.

The first exploratory lookup mistakenly inspected the wrapper rather than
`.profile`; its neutral-profile trials are retained and are not presented as the
human trials. The matching-card reconstruction supersedes that limitation.

## 4. Original 45°/90° comparison

Seed: **`pr191-inspection`**. Original PR191 catalog inputs and 6 s limits:

| Trial            | PR191 final separation | Current separation | PR191 → current outcome          |
| ---------------- | ---------------------: | -----------------: | -------------------------------- |
| direction_45     |          2.975046505 m |      0.967688878 m | time limit → physical control    |
| direction_90     |          3.416948561 m |      0.963599114 m | time limit → physical control    |
| lifted_thigh     |          6.346786215 m |      0.761467996 m | defender control → actor control |
| descending_chest |          0.273864690 m |      0.466456819 m | actor control → actor control    |
| descending_thigh |          0.300488975 m |      0.465143630 m | actor control → actor control    |
| flat_aerial      |          0.492406440 m |      0.468227144 m | actor control → actor control    |

The first directional contact receipts are byte-equivalent as structured data.
These six favorable continuations do not imply that every touch or defender
configuration should succeed. Opposed paired trials retain real losses.

## 5. Cause of running away from the ball

The PR191 laboratory changed its immediate target to `c.target` after the first
directional contact. The ball's friction, subsequent contacts and actual location
no longer constrained that destination chase. The original target is eight metres
from the initial player, whereas the contact occurs after approaching the incoming
ball. The destination was therefore neither the next contact nor necessarily on
the outgoing trajectory.

The new controller preserves the tactical destination but supplies a separate
motor target. After observing a real directional/body contact it prepares a
settling contact rather than repeatedly issuing the original directional impulse.
The existing movement integrator brakes, turns and accelerates the actual body.

## 6. Ball-oriented movement implementation

`ballOrientedMovement.ts` is a bounded motor estimator, not another tactical policy
or possession state machine. Existing carry and pending-loss intentions own the
canonical objective. Receive, recover, contest, release, leave and defensive
transition labels describe the resulting motor plan.

The adapter reuses `observeBoundedScene`: visible ball position/velocity and nearby
body positions/velocities are whitelisted. It adds a coarse visible spin estimate
in 5 rad/s increments. It never reads opponent ratings, targets or intentions.
Sightings update every 0.08–0.22 s according to the existing cognitive attributes;
motor correction extrapolates the last sighting between updates. An unpredictable
change is not known before another observation. Own momentum, facing, capability,
balance, fitness/braking and contact recovery constrain the reach estimate.

The forecast is at most 24 × 0.1 s, using approximate rolling deceleration,
gravity, spin curvature and bounce. It does **not** call the authoritative future
trajectory integrator or simulate another match. Its 0.55 m reach approximation,
common opponent movement envelope and hand-lift speed are engineering assumptions,
not physiological calibration. The real foot/body solver remains authoritative.

The laboratory keeps the tactical destination separate throughout continuation.
Canonical A activates the motor correction for a loose own touch or separation
above 0.8 m inside an existing carry/loss intention. That distance is an activation
threshold, not a possession award. Retained observations and canonical braking
limit immediate corrections, but threshold/target oscillation has not been
independently calibrated. No hidden successful-control timeout is introduced.

## 7. Recovery and loose-ball contests

A heavy touch is not immediately a possession loss and a favorable ETA is not
ownership. Existing contact recovery, legal height/reach, physical impulses and
ordinary acquisition decide the actual result. The ball is never attached to a
foot, repositioned to the estimator, or assigned to the predicted winner.

Canonical A applies only to an existing own carry/poor-touch continuation in open
play. Actual passes, shots, another player's control and explicit human movement
are excluded. Human carry selection remains its existing authority. Bounded
sightings are optional validated player state and are discarded outside the
relevant continuation; there is no growing trajectory history in gameplay state.

An intentional laboratory pass stops personal retention. An intentional leave
uses actual side-stepping to clear the delivery path; the body remains solid and
the teammate still has to move and contact the ball. It receives no reserved claim.

## 8. Relative attacker/defender experiments

`laboratory-v3.json` contains 40:40, 80:80, 40:80 and 80:40 duels in front/behind
approaches and mirrored geometry. Incoming seeds and physical setup are paired.
The mirror also swaps the selected/dominant foot, including the defender's foot.
Earlier receipts with the fixed right defender foot remain staged evidence, not
the final mirrored comparison.

At each rating pairing the front approach permits attacker recovery and the
behind approach permits defender control. Thus a 40 attacker can retain against
80 in one real geometry, while 80 can lose to 40 in another. These prescribed
reaction setups are a small physical sensitivity experiment, not estimates of
skill-tier win probabilities or complete autonomous defender cognition.

The old `quality >= 0.64` veto remains only in the historical/default route. With A,
moving prepared intention can attempt directional control below that score.
`technique` records the attempted technique separately from retained/heavy/failed
outcome; the same finite surface impulse can still fail.

## 9. Directional-angle definitions

All reported lab angles are radians from world +x, positive toward +y; the UI
converts to degrees. This is distinct from the engine facing convention, where
zero faces +y. Incoming/outgoing ball velocity, redirection, pre-contact player
velocity, desired movement from the actual contact point, net actual player
movement turn, initial-position target angle, first impulse error and final moving
ball direction are separate fields. A stationary direction is null.

The catalog's 45°/90° IDs refer to the fixed target from the **initial** player
position. They do not promise a 45°/90° player turn or exact ball redirection.
Approach is approximately 180°; the nominal 45° destination can therefore require
roughly 135° or more player movement change after the displaced contact. The UI
labels state that these are target directions, while retaining historical IDs.

## 10. Match Lab diagnostics and acceptance

The existing renderer, camera controls, expanded zoom and pause/scrubber remain.
Optional targets/contact markers and trajectory polylines distinguish tactical
target (pink), estimated contact (green), motor target/body trail (blue), actual
ball trail (yellow), last physical contact (white) and first executed release
direction (orange). Desired/actual release arrows share the actual first-contact
origin. The summary exposes separation, intention/reason, observation time and
attacker/opponent/teammate arrival estimates.

The final control sample is now retained, including its actual owner, outgoing
velocity and body state. This repairs the old inspection trace ending before its
terminal control. Observer callbacks receive detached copies.

New catalog exercises cover heavy release, front/rear defenders, deliberate leave
and touchline control. Browser inspection exercised 90°, overlay toggles and end
scrubbing using a normal Match Lab card; control occurred at 1.475 s and displayed
0.95 m separation. It is development UI verification, not independent human match
acceptance. Animation is still not a receipt proving an anatomical collision.

## 11. Touchline and boundary experiments

`natural-flow-laboratory-v5.json` reconstructs prescribed setups from a retained
input and the versioned runner. Parallel ground travel stays in play; angled
ground, fast aerial and inaccurate cross-field trajectories physically cross the
touchline. A loose recovery attempt can fail before crossing. No event is inserted
to satisfy a count. Attacker/defender last touches beyond the goal line respectively
award the actual goal kick/corner.

Prescribed standing-foot disruption and clearance impulses remain in play in
their selected cases. The shin attempt is **surface_unavailable**, not evidence of
a successful shin deflection. `touchline-challenges.json` adds 32 actual canonical
standing/sliding challenges and unpressured/pressured dribbles at 40/80, with
mirrored setups and paired seeds. Front slides can win cleanly, rear challenges
retain actual fouls, and some missed challenges/pressured carries produce real
throw-ins. Ordinary carry cases remain in play. These use the existing geometric
duel resolver; they are not newly articulated limb impulses. Broader autonomous
tactical clearance choice remains open.

The whole-ball test is retained (a centre at −0.10 m is still partly in play for
the 0.11 m radius). This agrees with [IFAB Law 9](https://www.theifab.com/laws/latest/the-ball-in-and-out-of-play/).

## 12. Goal-line, block and deflection experiments

Prescribed canonical shot flights execute a legal goal crossing, actual post and
crossbar rebounds, an outfield block, a generic body-height deflection and keeper
interventions. The parry case produces a real keeper touch followed by a corner.
A fast high arrival can beat the keeper. A high ball across the area leaves for a
goal kick. Contact kind/location and outgoing physical state are retained.

The legacy generic outfield collider cannot independently identify an anatomical
foot versus shin at those heights. These are not claims of newly validated
articulated shot blocking. Existing PR191 body infrastructure remains available
but is not silently enabled as part of A or B. Successful prescribed goal-line
outcomes do not establish a realistic match frequency of crosses or parries.

## 13. Restart preparation and lawful timing

The validated apparatus covers throw-in, goal kick, corner, direct/indirect free
kick, penalty, kick-off, quick free kick and nearby quick throw. It starts from an
explicit prescribed restart award, separately labelled from generated boundary
events. Preparation is timed through actual retrieval/transport, readiness blockers,
tactical/legal phases and execution. Blocker durations overlap and must not be
summed as a partition of dead time.

Baseline nearby throw: 0.225 s, with the ball raised from ground to the existing
1.9 m release height only at launch. B makes the actual taker retrieve and lift it
at a finite 1.6 m/s until that existing release envelope is reached. Readiness
checks the held height; no blanket waiting constant is added. This case becomes
1.350 s, while the nearby quick free kick stays **0.350 s** with B off/on. Already
completed physical preparation adds no separate mean-duration penalty.

This is a limited kinematic dead-ball handling correction, not a full articulated
arm, handoff or throwing animation. It does not attach a live ball to a foot or
change goalkeeper collision rules. [IFAB Law 15](https://www.theifab.com/laws/latest/the-throw-in/)
describes the actual throwing action; 1.9 m and 1.6 m/s are model parameters, not
legal requirements. Other restart preparation remains its existing physical path.

## 14. Effective time and clock interpretation

`measureEffectivePlayingTime` retains full dead-ball ledger durations, regulation,
added time actually played, qualifying referee allowance and external human pauses
as separate quantities. No stopped clock, quota or target in-play percentage is
introduced. A longer physical restart does not automatically make all of it added
time; [IFAB Law 7](https://www.theifab.com/laws/latest/the-duration-of-the-match/)
remains the external rule context.

The supplied 55–60-minute context is not an optimization objective. All 15 frozen
combined development matches finished, with **79.308–89.042 active minutes**. This
remains a negative result for natural match flow. The four-way comparison below
shows that neither intervention reliably reduces active time; A alone increases
it in all three paired fixtures.

## 15. Foul-frequency audit

The observer deduplicates actual challenge IDs and separates technique, outcome,
front/behind approach and ball reachability. Existing physical force, careless
contact, commitment, episode locks and recovery are preserved. A standing attempt
is not automatically a foul; existing routine rear withdrawal remains operative.
No threshold was lowered to improve a foul total and no other fixture was made
more foul-prone to compensate. Final full-match distributions are retained in each
observed receipt. In final SS/B there are 63 actual foul challenges: 42 from behind,
46 with the ball in reach, and one ball-first event. Mean recorded force is 1.982
(existing model units), maximum 3.862. The distribution includes 17 standing rear
fouls and 23 committed rear fouls; 26 standing rear attempts miss rather than foul.
The stoppage ledger contains 60 foul restarts, a different quantity from foul
challenges because not every challenge immediately stops play. SS policy totals
range from 51 to 73 actual foul challenges. High speed, rear contact and commitment
are measurable contributors, but these data do not establish that every foul is
correct. Force/contact calibration and a captured-contact adjudication remain open.

## 16. Passing tempo versus active time

All match receipts report attempts/completions, actual active minutes and attempts
per active minute. Observed runs additionally retain shots/rate, final-third/box
entries, carries, reception counts, possession changes and same-team recoveries.
Lower totals alone are not evidence of better tempo; longer possession alone is
not evidence of useful attacking progress. No pass quota or forced technical error
was introduced. The A-only increase in effective time demonstrates why these axes
must remain separate.

## 17. Full-match development comparisons

The runner has independent baseline, A-only, B-only and combined modes. Final B-only
uses `flow-final`; initial source stages remain explicit, including the SS
observer-only control. All five historical policy IDs are tested on WW/SS/SW with
both interventions, while B has the full four-way comparison. Full combined B
observer-off repeats compare complete authoritative state hashes, not score totals.

There are **44 retained full-match receipts**, including staged comparisons and
repeats. The selected final cohort is exactly 15 `combined-final-v2` receipts,
all full-time without runner failure. Their source and runner hashes must match
the frozen current runtime. Aborted runs without a completed receipt are excluded.

Default-policy four-way comparison (attempts/completions; rates per active minute):

| Fixture | Intervention | Active min |    Passes | Attempts/min | Shots |
| ------- | ------------ | ---------: | --------: | -----------: | ----: |
| WW      | Baseline     |     79.121 |   675/321 |         8.53 |    12 |
| WW      | A only       |     82.362 |   631/316 |         7.66 |    12 |
| WW      | B only       |     79.284 |   653/353 |         8.24 |    16 |
| WW      | A+B          |     83.815 |   667/364 |         7.96 |    11 |
| SS      | Baseline     |     77.184 | 2238/1547 |        29.00 |    12 |
| SS      | A only       |     80.270 | 2316/1501 |        28.85 |    19 |
| SS      | B only       |     79.893 | 2317/1475 |        29.00 |    16 |
| SS      | A+B          |     79.308 | 2241/1445 |        28.26 |    23 |
| SW      | Baseline     |     79.681 |  1692/966 |        21.23 |    23 |
| SW      | A only       |     81.331 | 1800/1086 |        22.13 |    39 |
| SW      | B only       |     79.130 |  1628/894 |        20.57 |    35 |
| SW      | A+B          |     80.387 | 1753/1031 |        21.81 |    39 |

Final combined cohort. B/R3/O/H/C are the historical state-value, phase-role,
opportunity, hierarchical and contextual policies. TI/C/GK count completed
throw-in/corner/goal-kick ledger episodes, not synthetic scheduled events.

| Fixture/policy | Active min |    Passes | Attempts/min | Shots | TI/C/GK | Fouls |
| -------------- | ---------: | --------: | -----------: | ----: | ------: | ----: |
| WW/B           |     83.815 |   667/364 |         7.96 |    11 | 11/2/17 |     8 |
| WW/R3          |     83.010 |   729/411 |         8.78 |    14 | 19/4/17 |     6 |
| WW/O           |     88.274 |  1899/523 |        21.51 |     5 |   5/1/2 |    16 |
| WW/H           |     89.042 |  1498/985 |        16.82 |     3 |   0/1/2 |    12 |
| WW/C           |     89.028 | 1645/1108 |        18.48 |     3 |   1/1/2 |    14 |
| SS/B           |     79.308 | 2241/1445 |        28.26 |    23 |  5/2/16 |    63 |
| SS/R3          |     79.661 | 2305/1559 |        28.94 |    16 |  11/0/7 |    68 |
| SS/O           |     82.669 |  2430/938 |        29.39 |     1 |   0/0/2 |    73 |
| SS/H           |     84.921 | 1334/1102 |        15.71 |     5 |   0/0/2 |    67 |
| SS/C           |     87.068 | 1832/1540 |        21.04 |     2 |   0/0/4 |    51 |
| SW/B           |     80.387 | 1753/1031 |        21.81 |    39 |  7/4/14 |    41 |
| SW/R3          |     82.174 | 1703/1058 |        20.72 |    35 | 12/2/18 |    39 |
| SW/O           |     85.218 |  2261/738 |        26.53 |     0 |   2/2/2 |    38 |
| SW/H           |     85.223 |  1172/901 |        13.75 |    38 |   1/4/8 |    46 |
| SW/C           |     88.178 |   904/707 |        10.25 |    19 |   0/3/5 |    17 |

Full precision, hashes, actual completion totals and detailed measurements are
authoritative in `performance/pr192/development-summary.json`. Prescribed boundary
experiments establish that the crossing/award path works, while full matches show
that some policies scarcely generate those situations. This narrows the remaining
problem to upstream tactical choices and physical deliveries, but does not prove
one universal cause or validate a replacement policy. In SS/B the five observed
touchline exits follow four passes and one carry; corners follow a shot block
and a keeper intervention. The exact local velocity/contact contexts are retained.

No policy is promoted and independent confirmation remains sealed.

## 18. Negative evidence and open gates

- Original human 45°/90° failures remain, with exact reconstructed traces.
- Neutral exploratory reconstruction initially missed the nested player card;
  it is retained separately from the matching-card reconstruction.
- Mirrored early duels retained a right-foot defender selection; the final
  mirrored experiment uses its selected dominant foot.
- Early restart apparatus used an unsupported `free_kick_short` identifier.
  Final setups validate against `tacticalMatchStateSchema` and use `free_kick`.
  Those early receipts are explicitly superseded apparatus evidence.
- An early observer lost penalty execution when its restart was removed on the
  shot tick; the final observer reads the actual stoppage execution receipt.
- Initial full-match capture names collided between A and combined. Overlapped
  bytes are retained as rejected captures. The original A state is restored only
  by replaying its exact full-match prefix and matching its previously recorded
  complete state hash. No coordinate or physical state is edited to reconstruct it.
- Shin unavailability, weak/late defender losses, unsupported head/overhead,
  pathological PR189 states, PR190/191 rejected apparatus and circulation/time
  blockers are preserved. Sparse throw-ins/corners are not solved by this PR.
- A broad autonomous near-line/sliding/clearance matrix, empirically calibrated
  reach/opponent uncertainty, articulated arms, richer post-deflection anticipation
  and independent match acceptance remain open. Full new animation is out of scope.

## 19. Determinism, compatibility, performance and verification

All 33 final neutral-profile laboratory inputs and the six matching-card
reconstructions repeat with deliberately mutating detached observers. Genuine
full-match captures are independently reconstructed from their full input prefix,
then replayed 320 ticks observed twice and unobserved; exact hashes must agree.
The 15 retained capture references represent six distinct state hashes, not 15
independent fixtures. They occur early, at approximately 1.550/34.725/81.625 s;
late-match stress and other policies are not covered by these short replays.
Full matches retain fixed 40 Hz integration, player identity, the same 28 attributes,
fitness/balance, laws, offside, discipline, injuries, human agency and old policy IDs.
New observations and experiment flags have optional validation schemas; old saved
states still parse without them.

`npm run verify`, historical replays, current-source evidence checks and final-head
CI are required. `verification.json` states their actual results; pending or failed
runs are not called ready. Earlier failed and interrupted attempts are retained
under `verification-logs/` and classified in `negative-evidence.json`.

Final local `npm run verify`: **PASS**, with 2,250 unit, 56 integration, four career
contract and five full-career tests (**2,315 total**), plus lint, TypeScript and
production build. The six focused files pass all 67 tests again after packaging.
All PR186–191 historical/frozen checks and current PR192 evidence checks pass.
That original run retained the original limits. The follow-up audit below records
one explicit, justified legacy budget change. Required suites remain unchanged.
Vite still warns about
large chunks and mixed static/dynamic imports; those warnings remain in the log.
Remote CI must be read from this PR's final commit, separately from these local
results.

The first CI head failed twice at the legacy native child cap. A matched-source
control on the actual failing EPYC 7763 host also kills **merged PR191** at the same
89.5 s limit, with the identical input; the waiting parent uses only 0.305 s CPU.
The old 90 s legacy budget is inadequate for current canonical physics on supported
hosted hardware. Only that budget is aligned with B's existing 180 s cap; the child
margin, every football assertion, 40 Hz ticks, short parity test and other limits
remain. This is an explicit budget exception, not a claimed speed optimization.
See [the investigation and retained rejected experiments](PR192_INTEGRATION_TIMEOUT_INVESTIGATION.md).
Follow-up verification and final-head checks must confirm completion of the same
full-half contract with that corrected safety budget.

The isolated local cost probe measured 10,000 estimator calls at **18.8 µs CPU/call**
and 2,000 observation updates at **70.0 µs CPU/call**. Four ABBA runs of 4,000 ticks
from the same genuine state have identical final hashes, with 4.014–5.098 s elapsed
and 326–372 MB endpoint RSS. Warm-up makes the observed runs faster in this sample;
this cannot establish a negative instrumentation cost or a portable performance
limit. Final full-match workers ran concurrently: their 354–502 s elapsed times and
461–569 MB endpoint RSS are descriptive. The estimator has a fixed local horizon
rather than per-tick full-match rollouts.

Gate status: 1–5 have reproducible laboratory evidence; 6–7 are partial audits
(boundary incidence, other restart mechanisms and foul adjudication remain open);
8 has the isolated finite throw-preparation correction; 9 has the complete paired
development cohort; 10 follows the actual verification/CI receipts. These findings
do not satisfy independent canonical match acceptance.

## 20. Reproduction, remaining work and roadmap

```sh
npm run benchmark:pr192:baseline
npm run benchmark:pr192:check
npm run benchmark:pr192:matches -- --design=ww --policy=state-value-v1 --mode=baseline
npm run benchmark:pr192:matches -- --design=ww --policy=state-value-v1 --mode=recovery
npm run benchmark:pr192:matches -- --design=ww --policy=state-value-v1 --mode=flow --version=final
npm run benchmark:pr192:matches -- --design=ww --policy=state-value-v1 --mode=combined
npm run verify
```

Full-match writers refuse to overwrite retained evidence. For a fresh match use
another explicit version/output or a clean archived checkout. Source overlays
retain exact development-stage bytes. Large JSON receipts are preserved losslessly
as `.json.gz` with small checked pointers; `readPr192Evidence.mjs` verifies both
compressed and original-byte hashes before reading them. See
`performance/pr192/README.md` for layout, checks and staged-result interpretation.

The roadmap explicitly moves the complete unimplemented Generational Renewal &
World Strength programme to **PR193**: 20–25-season evolution, squad/best-XI OVR and
positional quality, age distribution, academies, youth integration/blockage, ageing,
retirement, replacements, talent trajectories/caps, strong/weak-club transfers and
long-term world strength. **PR194 Summary Simulation & PlayStyles** remains blocked
on independently credible canonical behavior; **PR195 Career UX Consolidation**
and **PR196+ World Expansion** preserve their full prior commitments. None of those
postponed requirements is marked complete.
