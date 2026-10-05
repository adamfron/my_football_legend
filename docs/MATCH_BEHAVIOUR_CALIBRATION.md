# Match Behaviour & Calibration — PR145

The expanded PR152 follow-up adds causal turnover/restart accounting, active-player agency
rates and contextual defensive calibration. Shared challenge selection tests ball access
before risky commitment; missed standing pokes no longer become fouls from proximity alone.
New evidence and limits supersede the earlier PR152 discipline audit where they differ:
[PR152_STATISTICS_DISCIPLINE.md](PR152_STATISTICS_DISCIPLINE.md).

PR152 updates the canonical participation/accounting contracts without role-specific touch
quotas or a new presentation cadence. Public contacts remain continuous episodes; tackle
commitments/results share stable identities, and restart deliveries are included in live
possession accounting while setup/goal-completion intervals are excluded. Current multi-seed
participation, discipline/restart evidence and limits are in
[PR152_CANONICAL_PARTICIPATION.md](PR152_CANONICAL_PARTICIPATION.md), with the statistical
glossary in [PR152_ACCOUNTING.md](PR152_ACCOUNTING.md). Historical PR145 contact definitions
below have been superseded by PR150's episode semantics.

`src/core/matchSimulation` remains the sole football authority. All execution randomness uses
the seeded generator. Presentation, contact statistics and calibration reports observe the
same state; the fixed physics step remains 0.025 s.

## Passing and throws

`projectPassReception` predicts a meeting point from the receiver's actual velocity. Below
0.35 m/s it may use the existing tactical target, with awareness delay and canonical locomotion
capability. Facing alone does not define a run. Three meeting iterations compare the shared
ground/aerial launch ETA with receiver arrival, bounded to 2.5 s. Unreachable targets retreat
along the same path; clipped touchline motion fades outward movement. Receiver arrival has
0.2 s tolerance. Path separation below 1.6 m, stationary receivers without a movement intent
and check-back movement reclassify a proposed lead/through pass as support (projection up to
0.32 s according to passer reading). Human and NPC
options use this same projection; duplicate support/path choices are removed.

Launch forecasts start at the canonical ball position. A selected receiver-relative offset
survives receiver movement before release. Throws select a teammate other than the taker,
within 35 m. Missing, opposing or distant receiver requests use the shared deterministic legal
fallback and record the reason. `ThrowInDiagnostic` records requested/released target, selected
receiver, velocity and the next actual contact. `throwInRestriction` prevents the thrower from
receiving, carrying, shooting or heading their own throw until any other player physically
touches it. Eligibility checks and restart presentation expiry cannot clear this restriction.
Released restart play allows incoming choices and preserves human possession continuity.
Throw reception preparation uses the actual aerial ETA and target rather than stale setup
geometry.

`deriveAerialLaunchPlan` produces positive vertical launch velocity and forecasts the same 3D
integrator used at runtime. Nominal apex bounds before ability/error adjustment and drag are
metres above the pitch; slopes are m/m:

| Delivery | Base + distance slope | Minimum / maximum apex | Arrival height |
|---|---|---|---|
| Lofted pass | 0.65 + 0.105 × distance | 0.95 / 10.5 m | 0.65 m |
| Long pass | 0.9 + 0.12 × distance | 1.2 / 12 m | 0.8 m |
| Floated cross | 0.9 + 0.085 × distance | 1.2 / 5.8 m | 1.9 m |
| Driven cross | 0.45 + 0.035 × distance | 0.8 / 2.4 m | 0.65 m |
| Throw-in | 2.15 + 0.045 × distance | 2.35 / 4.75 m | 0.65 m |

Ability/execution terms and drag correction affect launch parameters; the renderer only draws
canonical height. Throw release height is 1.9 m. These constants remain calibration inputs,
not cosmetic animation controls.

## Ground rolling

Neutral grass uses constant horizontal deceleration **3.2 m/s²** while the ball is grounded.
`integrateGroundRolling` is shared by the 3D integrator and loose-ball prediction. It integrates
distance exactly until stopping: `t = v/a`, `d = v²/(2a)`. The environment multiplier defaults
to 1 and is explicitly validated; weather is deferred. Gravity, air drag and bounce loss remain
separate airborne/contact regimes. There is no artificial maximum travel distance.
Passing the declared reception target does not alter velocity or flatten flight. An unclaimed
delivery keeps the same 3D state through bounces and rolling; it becomes an ordinary loose-ball
episode near physical rest (horizontal speed below 0.25 m/s), without fictional
`actualContactPoint` evidence. Ground rolling continues to zero after that handoff.

| Initial speed | Stop time | Unobstructed ground distance |
|---|---:|---:|
| 8 m/s | 2.5 s | 10 m |
| 15 m/s | 4.6875 s | 35.15625 m |
| 27 m/s | 8.4375 s | 113.90625 m |

## Statistical definitions

`contactEvidence.ts` gathers canonical release, reception, flight contact and controlled-contact
evidence. A seeded player/contact-time identity deduplicates overlapping observations of one
physical contact, including first-time reception/shot and substep goalkeeper catch/ownership.
An attached-ball tick or rendered foot movement is not an additional contact.

- **Touch:** one evidenced canonical physical contact, including unsuccessful control, releases
  and goalkeeper contacts. It is no longer named possession in the UI.
- **Pass attempted:** one released `PassDiagnostic.passId`, including targeted throws and
  restart passes. Release is a touch. Crosses and non-shot headers are currently separate
  delivery categories: they generate contact evidence but no pass/network edge.
- **Pass completed / received:** a teammate's completed physical reception, with
  `actualReceiverId`, `actualContactPoint` and `resolvedAt`. PR150/152 credit the actual
  receiver even when different from the intended target. The passer, receiver and network
  edge increment together once. Opponent interceptions and mere deflections do not complete it.
- **Shot:** one actual released shot ID; its later outcome updates the same shot once.
  On-target means final goal or save. Frame hits which stay out and blocked attempts are
  separate outcomes. Unobstructed projected classification is diagnostic, not a second result.
- **Carry:** one canonical carrier intent episode (`actorId`, `startedAt`), not every movement
  tick or a later unrelated AI decision index carrying an old action.
- **Interception / ball win:** one canonical possession-change event of the corresponding
  cause. PR145 tackle counters describe won tackle possession changes; failed attempts
  were not yet exhaustively represented in that historical calibration and are not invented
  in its recorded numbers. PR147 adds separate canonical challenge attempts/outcomes below.

The invariants are `passesReceived <= touches` per player and equal totals of completed
passes, received passes and completed network edges. Telemetry copies these canonical totals
when available. Observers do not consume RNG or change the physical result.

### PR147 defensive evidence

`defensiveTelemetry` adds fixed scalar totals and a roster-sized per-player map for accepted
challenge opportunities/attempts, missed/no-contact, beaten, clean wins, loose balls, fouls,
cards, slide attempts, tactical intents and advantage. `highRiskIntents`, `secondYellowDismissals`,
`straightReds`, `penalties` and `advantageRecalled` expose disciplinary subtypes without
statistical tuning. Opportunity means an accepted physical
attempt in this PR, not every tactical approach. A clean ball win remains the existing canonical
possession-change/statistical fact; challenge attempts are a separate denominator. Do not
calculate defensive success by dividing won tackles by the same won-tackle counter.

Foul/contact evidence and card/advantage are authoritative, while bounded action events and
micro labels observe the outcome. The heavy-touch → interception chain may be shown without
a prompt when no meaningful human window existed. Full defender-versus-dribbler and approach
funnel calibration remains PR148, together with possession rhythm and role differences.
That stage includes **Discipline realism calibration**, after the measured duel/contact rhythm
is stable. Large deterministic full-match batches should compare fouls/team/90, yellow cards,
reds/100 matches, penalties, cards/foul, fouls/challenge and advantage across styles, positions
and qualities against reliable real-football datasets where available. The target is plausible
distributions, not a forced mean for every match; individual attributes/tactics affect propensity.
League/referee interpretation is a later parameter. PR147 instruments outcomes without arbitrary
global frequency tuning. Ten-player tactical adaptation is also deferred; dismissal removes the
active physical actor while retaining match statistics and discipline, with no automatic replacement.
Scope, exact validation status and representative performance evidence:
[RULES_DISCIPLINE_MATCH_FEEDBACK.md](RULES_DISCIPLINE_MATCH_FEEDBACK.md).

## Agency

Routine shielding, safe recycling, close-down, line holding and small lane adjustments remain
autonomous. Pressure or multiple labels in a menu alone do not make a meaningful decision.
Committed challenges, important incoming finishes and dangerous-space tradeoffs retain human
agency. Friendly incoming decisions require the actual intended receiver. Opposition deliveries
are evaluated as interceptions. Teammates with an arrival advantage of 0.25 s, or an earlier
physical lane contact by 0.15 s, own ordinary interceptions; the controlled player maintains
their role. Significant commitments use 2.5 m minimum interception movement, 4.5 m shape
departure and 34 m own-goal danger context (`PLAYER_AGENCY_CALIBRATION`).

Physical pass/delivery and opponent-possession episodes identify decisions. Unrelated global
decision indices and tiny geometry changes cannot reopen the same choice. Tracker reports
semantic families and ownership reasons. Human terminal possession ownership from PR144
survives chosen reception, hold and carry; no prompt quota or presentation proxy is introduced.

## Shots and goalkeeper

`deriveShotExecutionErrorProfile` exposes horizontal/vertical target-plane sigma in metres.
Ability, distance, angle, pressure, contact difficulty, body orientation and dominant foot
affect the profile. Twelve seeded uniform samples produce bounded approximately normal
unit-variance error; the former six-sample scaling unintentionally had sigma around 0.58.
Sigma floors are 0.12 m horizontal / 0.1 m vertical, with a 1.65 m ceiling. Driven, placed,
chip and contact families preserve distinct launch/error profiles. Classification observes
the integrated flight; it does not preselect a goal or keeper save.

Keeper base position is 1–3.5 m from the line, replacing routine positions near 7 m which
favoured chips. Reaction uses `0.36 s - reflexes × 0.002 s` plus facing penalty up to 0.18 s.
Locomotion retains lateral momentum toward contact. Active contact reach is bounded to 1.25 m
around height 1.05 m; actual collision must precede catch/parry resolution. A physically
unreachable shot cannot be saved by a successful probability roll. A passive 0.5 m body
sphere remains collidable before reaction; such a contact physically deflects the ball as
`failed_save` / `block`, without catch/parry or save credit. Keeper-contact counts therefore
include passive blocks and may exceed saves.

## Bounded evidence

Run `npm run benchmark:calibration`. Default: three seeds, 600 canonical seconds each, a
central midfielder, left back and striker, plus 32 controlled executions for each of seven
shot families. Optional `MFL_CALIBRATION_SECONDS` is bounded to 60–1200 and
`MFL_CALIBRATION_SEEDS` to 1–4. Input uses explicit DEV AI selection when a human opportunity
exists, with the ordinary fixed-step engine. Per-seed hashes, agency/reason counts, pass
invariants, release/result counts and shot-family funnel are emitted as compact JSON.

The short match windows are comparable to the clean PR144 main baseline. Per-90 agency values
are projections of those windows, not full-match observations. Controlled shots are equal
family-weighted fixtures with prescribed opportunities/keeper position; they are a diagnostic
sample, not a normal match distribution. Neither sample establishes final realism, a definitive
decision-density range or full-match scoring frequency. Future playtests must refine those.

### Verified run — 2026-10-01

Baseline is clean PR144 main `dd70e788f0c0f00559d958c43c4f632595e7c14f`, with the same bounded
match-window harness and DEV selection policy. Final PR145 command exited 0. Aggregated
canonical duration is 1800 s (three 600 s windows); floating-point time is rounded here.
Pass/contact definitions were corrected, so raw pass changes also reflect semantic repair.

| Comparable match-window metric | PR144 | PR145 |
|---|---:|---:|
| Meaningful human decisions | 136 | 14 |
| Projected decisions / 90 min | 408 | 42 |
| Pass attempts / completions | 555 / 379 | 629 / 380 |
| Completion rate | 68.3% | 60.4% |
| Player/seed cases received > touches | 11 | 0 |
| Shots / on-target | 7 / 7 | 4 / 2 |
| On-target rate | 100% | 50% |
| Goals / saves / keeper contacts | 5 / 2 / 2 | 2 / 0 / 0 |
| Path deliveries behind active movement | 0 / 222 | 0 / 179 |

| Controlled position | Before decisions / projected 90 | After decisions / projected 90 |
|---|---:|---:|
| Central midfielder | 78 / 702 | 1 / 9 |
| Left back | 23 / 207 | 8 / 72 |
| Striker | 35 / 315 | 5 / 45 |

Final agency mix: 12 on-ball and 2 defensive decisions. Of 168 semantic candidates, 99 stayed
routine and 55 had a single meaningful option. The approximate 20–40 reference is a tuning
guide, not a quota: position spread (9–72 projected) still needs longer playtests. The sample
supports removal of routine prompt spam; it does not establish each role's full-match density.
Completed, received and completed network totals are all 380. The four match shots were driven
settled shots; there were no keeper contacts in this tiny window, so it cannot measure normal
save effectiveness. The separate physical fixtures cover the full family funnel:

| Family | Attempts | Final on-target | Goals | Keeper contacts | Saves | Blocks |
|---|---:|---:|---:|---:|---:|---:|
| Driven | 32 | 25 | 12 | 13 | 13 | 0 |
| Placed | 32 | 26 | 9 | 18 | 17 | 1 |
| Chip | 32 | 23 | 19 | 4 | 4 | 2 |
| First-time | 32 | 22 | 13 | 9 | 9 | 0 |
| Half-volley | 32 | 20 | 9 | 11 | 11 | 0 |
| Volley | 32 | 17 | 7 | 10 | 10 | 0 |
| Header | 32 | 15 | 4 | 11 | 11 | 0 |
| Total | 224 | 148 | 73 | 76 | 75 | 3 |

Fixture final on-target is 66.07%; unobstructed projected on-target is also 148 in aggregate,
but individual families differ because physical contact can change the result. Zero attempts
remained unresolved. Placed keeper contacts exceed saves by one passive body block. Chip
fixtures deliberately use a keeper 5 m from the line; other families use 2 m. This, equal
family weighting and unpressured aligned shooters prevent treating fixture conversion as
normal match scoring frequency. Pressure/quality/foot/orientation relationships are covered
by regression tests rather than claimed from these fixtures.

Final `npm run verify` exited 0: lint; 112 main files / 697 tests; one full-career file / 5 tests;
TypeScript and Vite build / 273 modules. Local `VITEST_MAX_WORKERS=2` avoided CPU contention
timeouts in the existing capture determinism test. Its assertions and 5000 ms timeout were
unchanged; isolated capture tests also passed 25/25. Existing experimental-transform,
mixed `careerStorage` import and bundle-size warnings remain nonblocking. No runtime
performance redesign or longer/coarser physics step was introduced.
