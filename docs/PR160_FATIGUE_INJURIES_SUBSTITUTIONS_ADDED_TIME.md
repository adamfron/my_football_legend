# PR160 — Fatigue, Injuries, Substitutions & Added Time

Base: merged PR159, `09c05fa9c09edf89cd8310485a61560eb67e4cde`.
PR160 also fixes the original observer penalty deadlock. PR161 remains the next
feature: Match Presentation / Replay / Stadium Polish, followed by the combined
integrated-match diagnostic audit.

## Implementation and verification

Implementation complete; focused tests and final performance measurements passed.
`npm run verify` passed: lint, 1,452 main tests across 177 files, five career
regressions and the production build.
The simulation retains its fixed `0.025 s` step, seeded RNG and common human/NPC
physics. New saved fields are optional for old states and have Zod schemas.
Evidence is deliberately compact:

- [Fitness and contextual injury probes](performance/PR160-fitness-injuries.json)
- [Original penalty reconstruction, CPU matrix and clock contracts](performance/PR160-penalty-clock.json)
- [Alternating before/after runtime measurements](performance/PR160-performance.json)
- [Complete telemetry reference and independent hash reproductions](performance/PR160-telemetry-reference.json)

## Original penalty failure and the owning correction

The original `lab-mv1fg3zw-benchmark-sesji.json` was found in the local MFL playtest
folder. It contains telemetry rather than a serialized initial canonical state
or an engine revision. Its 22 player identities identify `pro_9` versus `pro_1`
and match their default XI. Running merged PR159 with those clubs, default tactics
and seed `lab-mv1fg3zw` reproduces the sampled ball/owner at 2.5 seconds exactly;
the checked ball fingerprints at 100.5 and 414.5 seconds differ by less than
`4.1e-13 m`, with the same owner. The same goalkeeper foul awards the away penalty at
`415.1249999998963 s`, and the ball settles at the reported coordinates.
All seven canonical pass/shot/restart/challenge ID arrays in the original 2700 s
export exactly match the reconstructed baseline at 600 s. The original export's
stationary ball and unchanged event ledgers show that football did not resume
after the penalty. These comparisons establish the reconstructed failure; they
do not establish equality of every byte of the original state. The source export
SHA-256, XI, ID-array hashes and ball fingerprints are retained in the compact
evidence. Continuing the complete frozen PR159 state at 600 s through the corrected
engine, with its bodies, ball, roles and selection intact, releases the same award's
autonomous penalty at **600.375 s**, after **0.375 s**.

| Canonical fact          | Reconstructed PR159 failure                                       |
| ----------------------- | ----------------------------------------------------------------- |
| Ball                    | `(11.050017293264, 34.037071252247)`, settled, retrieval `placed` |
| Blocking actor          | `footballer_pro_1_12`                                             |
| Actual body             | `(16.487311408931, 47.015041654328)`, velocity zero               |
| Movement target         | `(16.503302916222, 47.082018990217)`                              |
| Body-to-target distance | `0.06885994 m`; locomotion arrival radius `0.08 m`                |
| Legal condition         | Body still inside the penalty area (`x < 16.5`)                   |
| Readiness               | Ball/taker/goalkeeper ready; `participant_restriction` remains    |
| Selection/preparation   | No selected action/source or preparation start; execution false   |

`legalizeRestartPlayerTarget` previously accepted an intention just beyond the
penalty-area line. The body could finish its legitimate physical movement within
the arrival radius while still illegally inside. PR160 applies the already
existing `0.3 m` clearance to proposed targets near the outside edge as well.
The body physically moves clear; the Law 14 readiness test and arrival radius are unchanged.
There is no timeout shot, teleport, fabricated readiness or erased penalty.

A second synthetic unavailable-goalkeeper fixture exposed inconsistent actor
selection: geometry chose an outfielder fallback while legal readiness searched
only permanent goalkeeper positions. `goalkeeperRole` now identifies the actual
match goalkeeper without changing the footballer's permanent profile. Award,
movement, readiness and goalkeeper physics use that same identity. A real
goalkeeper entering later restores the role arrangement. The original export has
no yellow/red cards; this unavailable-keeper fixture is additional coverage rather
than the cause of the historical failure.

The paired 10-cell matrix covers both directions, ordinary penalties, unavailable
keeper/taker, distant taker with illegal players and terminal boundaries. PR159
released 6/10; PR160 releases 10/10. The historical replay and exact release trace
are recorded separately from this synthetic matrix.

The full-half smoke also found a scored-ball kickoff lock after the injected
penalty had executed and scored. The stationary ball was 1.15975 m beyond the
goal line; the nominated goalkeeper retriever targeted it, but an unconditional
keeper x-clamp held the actual body at the line, outside the unchanged 1.1 m
pickup radius. Only a nominated live-restart retriever in `approach`/`transport`
now uses the existing stopped-play enclosure bounds. The ball remains physically
retrieved and carried. Both goal-line regressions assert body crossing, unchanged
ball position before pickup and autonomous execution of the same kickoff award.
The subsequent standalone full-half run passed in 81.284 s; final verification
repeated it successfully. This is additional kickoff continuity coverage, separate from the
historical penalty-area failure.

## Physical model, measurements and attribute audit

`matchFitness` keeps slow `longTermCapacity` and fast `burstReadiness`, both in
`[0,1]`, with readiness capped by capacity. Fixed-size counters record actual
walk/jog/run/sprint distance, sprint time/bursts, acceleration, braking,
velocity-heading turns, intensive pressing and real body contact. Work uses
integrated displacement/velocity, including pitch clamping; an intended sprint
with no movement earns no sprint distance. Contact work does not recount movement
time. Referee-held intervals recover retained players without inventing braking.

The supported conditioning attribute is **stamina**. **Pace** determines initial
speed, **agility** contributes to acceleration/turning, and **strength** contributes
to actual contact/shielding. There are no separate acceleration or recovery
attributes to invent. Game reading, positioning, composure and technical skills
keep their meanings. No position, age or named-player stamina exceptions exist.

The same athlete, stamina 60, completes paired 900-second physical drills:

| Completed workload                           | Capacity | Burst readiness | Attainable speed, m/s | Acceleration, m/s² | Next 8 s sprint, m |
| -------------------------------------------- | -------: | --------------: | --------------------: | -----------------: | -----------------: |
| Continuous jog                               |  0.98245 |         0.98245 |                  9.25 |               7.79 |              64.03 |
| Repeated sprints / intensive press           |  0.81318 |         0.00801 |                  7.81 |               4.84 |              51.86 |
| Isolated sprint with low-intensity intervals |   ≈1.000 |          ≈1.000 |                  9.27 |               7.82 |              64.16 |
| Economical screening                         |  0.99780 |         0.99780 |                  9.27 |               7.81 |              64.14 |
| Repeated turns/braking                       |  0.93233 |         0.00948 |                  7.92 |               5.01 |              52.96 |
| Shielding with actual contacts               |  0.96030 |         0.04798 |                  8.00 |               5.16 |              53.35 |
| Halftime rest after repeated sprints         |  0.82365 |         0.67683 |                  8.87 |               7.08 |              60.52 |
| Rested substitute at 4500 s                  |    1.000 |           1.000 |                  9.27 |               7.82 |              64.16 |

The machine evidence includes stamina 30/60/90, actual workload, reserve
expenditure/recovery and contextual difficult-action cost. These are controlled
completed-work drills, not a prediction of every forward's halftime condition.
Jogging restores short readiness while retaining a small slow-reserve cost;
standing/walking recover within the available capacity. Two seconds cannot
restore full reserves. Physical modifiers retain a positive acceleration floor,
so even a depleted athlete can produce a short effort, at a repeatability cost.
Halftime is an abstract 15-minute rest interval and does not add 900 seconds to
the football clock.

Physical consequences flow through locomotion acceleration/speed/braking,
orientation, balance/contact recovery and shielding. Difficult passes/finishes
receive extra execution difficulty only through measured body-control demand.
A settled simple pass has zero such demand. There is no universal minute-based
Passing/Vision/Finishing/Composure reduction. Existing shot and keeper calibration
remains the physical execution model. Tactical effort valuation considers actual
fitness, score and the six preference axes; it never scripts a retreating line.

## Career recovery and its precise boundary

Sparse `footballerConditionOverrides` preserve capacity, canonical appearance
date/minutes, match identity and injury deadline. Permanent attributes remain
unchanged. Recovery uses existing ISO career dates, is deterministic and
idempotent, and projects into world selection and the next kickoff. A condition
of 65 at stamina 60 becomes **87.63 after one rest day**, **98.45 after three**;
an injured recovery interval restores more slowly. Unused bench players receive
no appearance cost; substituted/dismissed players retain their own final body
and participation history.

`createCareerSingleMatchSession` composes real club membership, profiles,
condition and health from the career/world overlays. `commitCanonicalMatchCondition`
commits actual participants only after `full_time`/`abandoned`, including departed
and still-pending outgoing bodies, and rejects duplicate/stale commits. Tests
exercise the next fixture with insufficient rest and injured selection.

The current career product still uses its narrative/quick-match appearance
simulation rather than the canonical Single Match UI. That path now uses the
same dated recovery and explicitly labels estimated appearance workload
`source: summary`; it cannot claim measured metres or physical contacts. The
canonical adapter/committer is ready and tested, but connecting that future
career match screen and collecting condition for every background league NPC
remain integration work. No second calendar or pretend canonical workload is added.
The legacy narrative injury events are also distinct from the new contextual
canonical injury mechanism.

## Injuries, legal substitutions and shared presentation

Movement hazard comes from completed high-speed effort, awkward braking/turns
and fatigue/recovery context; contact hazard requires an actual contact/tackle
episode. Movement exposure is assessed once per canonical second, and a contact
watermark prevents rerolls. Low capacity without physical exposure is not an
injury timer. Discomfort, playable injury, inability to continue and absence
have distinct effects; the injury ledger retains 32 recent facts. Recovery is
bounded to the project's day-level abstraction, at most 28 days.

| Independent seeded exposure probe         | Outcomes / 4096 | Severity breakdown                  |
| ----------------------------------------- | --------------: | ----------------------------------- |
| Exhausted, zero physical exposure         |               0 | none                                |
| Integrated 900 s repeated-sprint exposure |               1 | 1 discomfort                        |
| One forceful contact, fresh               |               7 | 7 discomfort                        |
| One forceful contact, depleted            |              15 | 12 discomfort, 2 playable, 1 unable |

These are exposure probes, **not match injury incidence**. The injury/substitution
full-half smoke deliberately injects an unable actor to verify removal and flow;
its forced event cannot be used to estimate natural frequency. A separate
integrated test obtains a serious injury from measured turns/braking with a
deterministic seed, then checks removal before same-tick contacts/actions.

Unable players immediately lose active football participation while retaining
statistics and their own identity. An already released shot remains physically live before
assessment. A focused regression exposed an active-only shooter lookup after injury
removal: the shot crashed and keeper selection could use the wrong team. Released
action resolution now reads the historical participant identity, including departed
and pending outgoing bodies, without restoring physical participation. The regression
requires the real flight outcome, shooter credit and frozen departure minutes.
An 18-second assessment holds play, merged with existing stoppage
reasons. Existing restarts resume; otherwise a physical dropped ball at the actual
ball point goes to the goalkeeper inside its penalty area or the clearly possessing
team outside, with other bodies at least 4 m away until ground contact. Goals require
contacts by two different players. Full treatment cinematics, detailed medical
re-entry protocols and general source-free own-goal physics are outside this scope.

Bench players come from the actual active eligible club squad, with their own
profiles, condition and persisted playable injuries. The compact configurable
default is five replacements, three opportunities, nine named substitutes and
no return substitutions. Multiple changes share one interruption; halftime costs
no opportunity. In the verified 2026/27 time-limited procedure the outgoing body
uses the nearest boundary, the incoming body stages outside halfway and enters
after legal exit/referee permission. A delayed departure holds the entrant until
the first eligible stoppage after 60 seconds of restarted canonical play; genuine
injury removal is exempt. The temporary protocol shortage is excluded from the
seven-player check. Serious unreplaced shortage still abandons the match. These
contracts follow [Law 3](https://www.theifab.com/laws/latest/the-players/), the
[time-limited substitution protocol](https://www.theifab.com/laws/latest/time-limited-substitution-protocol/)
and [2026/27 changes](https://theifab.com/law-changes/latest/).

Coach planning runs at legal interruptions, comparing reserve/readiness, injury,
real positional/tactical fit, alternatives, score, time and substitution budget.
It has no fixed-minute or five-change quota. Replaced players never return under
the default rules. Cleanup invalidates stale possession, contact, action, marking,
pressing and retrieval references. Incoming minutes start at entry; outgoing
minutes end at exit. The original profile is never overwritten in a slot.

Match Centre shows named substitution/injury events, counts and the announced
minimum. A departing body remains visible while physically leaving, and replay
samples that same canonical body. A departed controlled footballer retains their
summary and ID, stops receiving football decisions, and watches the remainder.
Control is never transferred automatically. Final animation polish belongs to PR161.

## Added time and terminal decisions

PR159's ledger remains the single source. It distinguishes elapsed dead-ball
seconds from qualifying lost seconds. The explicit default allows 30 seconds of
ordinary restart preparation; significant excess qualifies. Goals, substitutions,
injury assessment/removal and discipline count from their actual reason start.
Overlapping reasons form one interval/union, never summed durations. Completed
period totals survive the 512-interval retention cap. This policy is an engine
abstraction, not an IFAB-prescribed 30-second allowance.

At the nominal 2700-second boundary the referee rounds qualifying loss upward
to the minimum whole minute. New qualifying loss during added time extends the
required end; the minimum never decreases. The second half starts from the actual
first-half whistle and gets its own 2700 seconds and ledger total. Timekeeping
uses no renderer timer, desired result or suspense rule. See
[Law 7](https://www.theifab.com/laws/latest/the-duration-of-the-match/).

An ordinary unreleased attack receives no automatic extension. An accepted
challenge or already released pass/shot completes its existing physics. A terminal
penalty/retake extends until its genuine outcome: a keeper parry/frame rebound
alone is insufficient, whereas goal, miss, held save, stopping ball or subsequent
eligible touch completes the kick. An awarded retake resets the terminal kick's
completion tracking. A terminal goal ends the period without a new kickoff.
A keeper-only deflection labelled `failed_save`/`block` also remains live;
the semantic result alone cannot substitute for physical kick completion.
A serious injury removes the unavailable body immediately, but its assessment
cannot freeze or replace an incomplete terminal rebound with a dropped ball.
Focused canonical continuation verifies that a moving parry can still enter
the goal and complete the period while preserving the departed actor's history.
A human-owned restart becomes a pending selection after the ball, taker and
participants satisfy full physical legal readiness. A legally arranged group
with an unplaced ball remains physical preparation in diagnostics. CPU blockers
stay observable and cannot be silently waived. Delayed cards settle at the whistle,
including the minimum-player abandonment rule.

## Answers to the 30 acceptance questions

1. **Cause:** the historical participant stopped within the locomotion arrival radius while still inside the forbidden penalty area; exact trace above.
2. **Reproduction:** original seed, reconstructed clubs/default XI and default tactics reproduce the keeper foul and reported ball. All seven ID arrays match exactly; three ball fingerprints match within 4.1e-13 m. The export lacks a complete initial state and engine hash, so full original-state byte identity is not claimed. Synthetic variants supplement this reconstruction.
3. **Failed condition:** `participant_restriction`; ball, taker and keeper were ready, action selection/preparation never began.
4. **Correction:** apply existing 0.3 m legal intention clearance near the boundary; match goalkeeper role also aligns geometry and legal/physical actors.
5. **CPU execution:** 10/10 recorded focused matrix cells release, plus the historical blocked-state replay, both scored-ball keeper retrieval directions and a passing full-half smoke after the kickoff correction. Final verification repeated the full-half test successfully. Physical conditions remain required.
6. **Human ownership:** physically ready human-owned restarts freeze for selection and expose a real restart decision opportunity; observer calls classify pending human input without executing or spending RNG. Legal participant positions with an unplaced ball remain a physical blocker.
7. **Slow reserve:** jogging 0.98245 versus repeated sprinting 0.81318 at the same 900 s; 30/60/90 bands are in machine evidence.
8. **Fast recovery:** standing/walking/jogging restore readiness toward current capacity; injury restriction slows restoration and halftime recovers a fraction.
9. **Repeated effort:** next 8 s sprint falls from 64.16 to 51.86 m; separated efforts recover to about 64.16 m.
10. **Physical performance:** sprint example acceleration 7.82→4.84 m/s², attainable speed 9.27→7.81 m/s; balance and demanding contact/action preparation also respond.
11. **Decisive bursts:** continuous modifiers retain nonzero acceleration; conservation/rest restores readiness even when capacity remains below one.
12. **Economy:** screening ends 0.99780/0.99780 without a smart-player bonus; actual shorter/slower work costs less.
13. **Next match:** dated condition persists; one-day recovery from 65 reaches 87.63, not 100. Canonical and summary paths are distinguished above.
14. **Risk context:** actual speed, braking/turns, contacts/tackles, reserve/readiness and existing health; no exposure means no roll.
15. **Frequency:** 0/1/7/15 outcomes in the four 4096-seed exposure probes; forced smoke injury is not incidence evidence.
16. **Legal/statistical changes:** named eligibility, limits/opportunities, real exit/entry, goalkeeper role, no stale participation and distinct minutes are covered by focused regressions.
17. **Coach response:** a measured intensive-press drill supplies depleted fitness to a canonical match continuation, which produces a beneficial real-bench replacement, one lawful opportunity and merged qualifying delay. Alternatives, score and tactical fit affect valuation; this fixture is not a naturally observed whole-match substitution rate.
18. **Controlled departure:** inactive actor receives no new decisions or automatic replacement control; historical summary and named events remain visible.
19. **Identity:** actual squad profiles and permanent attributes survive substitution/injury/temporary goalkeeper assignment; unused bench condition is retained.
20. **Lost time:** canonical reason starts and significant excess over the configurable ordinary allowance determine qualifying seconds.
21. **Overlap:** one active interval and earliest qualifying reason start yield the union, not the sum; focused tests cover injury plus substitution and later reason starts.
22. **Announcement:** rounded minimum is monotonic; loss after announcement increases the actual deadline.
23. **Period end:** independent period clock, released commitment completion, delayed cards and abandonment are deterministic; ordinary exact boundaries remain tested.
24. **Terminal penalty:** release and physical completion are required; an awarded retake resets completion, and a terminal goal creates no kickoff. Tests distinguish held saves, moving parries and keeper-only failed-save blocks, verify that real nonkeeper contact completes a deflection, preserve a rebound through an actual goal alongside a pending injury, and cover both period endings.
25. **No concealment:** full-half smokes require actual penalty/replacement execution and a legal whistle, reject 180 s without canonical football/restart progress and sustained 120 s restart locks, and check continued participation. Reaching nominal time alone cannot pass.
26. **Determinism:** full-state and actual RNG export/value/call equality across normal/DEV/capture and negative-probe entry is asserted, including a substitution.
27. **Parity:** selected fatigued human/NPC passes share exact physics/RNG; injury and fitness use actor state, not action source.
28. **Performance:** three alternating fresh-process 300 s pairs against merged PR159 measure **+22.54%** median runtime (8.221→10.073 s). Each revision replays its state/RNG evidence identically across all three runs; divergent natural football limits cost attribution.
29. **Unresolved flow:** low shot frequency, low CM participation, carrier rotation, unstable possession contests, overly precise formations and pressure/carry ranking remain open. No scoring or participation tuning is claimed.
30. **PR161 visual checks:** departure/entry at real boundaries, delayed entry, assisted injury removal/drop separation, controlled spectator transition, added-time display, terminal penalty/save/rebound/retake, temporary keeper rig, replay identity/minutes and fatigue gait/contact recovery.

## Runtime and final validation

| Frozen 300 s / 12,000-tick CPU window | Median, ms | Three-run range, ms |
| ------------------------------------- | ---------: | ------------------: |
| Merged PR159                          |    8220.72 |     8218.30–8339.13 |
| PR160                                 |   10073.37 |    9764.43–10081.04 |

The measured cost increases **22.54%**. Pairs alternate revision order and run
sequentially in fresh Node 24.19.0 processes without concurrent tests, profiling,
renderer or video capture. Both revisions process the same canonical horizon;
fitness naturally changes subsequent football, so this is a focused equivalent
starting fixture rather than attribution of every millisecond to one subsystem.
Source fingerprints, per-run values and state/RNG evidence are in the JSON.

The [complete telemetry reference](performance/PR160-telemetry-reference.json)
retains all 80 exported fields, schema checks and possession/restart identity
ledgers. Both pristine PR159 hashes and new PR160 hashes were reproduced twice
per seed in eight fresh sequential processes, using the unchanged two seeds and
2,400-tick spectator fixture. The PR160 hashes start `ced0737b` and `b245012a`.
Changed fields cover pass/contact cadence, receiver geometry and possession
spells: attempted/completed passes change from 9/7 to 11/9 for seed A and 9/6
to 10/7 for seed B. Restart awards, shots and goals remain zero in both fixtures.
The complete sorted all-field hash assertions remain in the reference test;
this is focused deterministic evidence rather than scoring calibration.

All three PR160 TypeScript benchmarks pass strict compilation using the node
project settings plus the engine's DOM/JSON declarations; both performance and
telemetry MJS runners pass syntax checking. Complete `npm run verify` passed:
lint, 1,452 main tests across 177 files, five career regressions and the production
build. No 18-match calibration campaign.

The [uninjected full-match sanity](performance/PR160-full-match-sanity.json)
reaches native halftime at 2,700 s and full time at the required 5,460 s deadline
(90+1 minutes), with 874 attempted passes, 1,061 touches and zero shots. Five real
fatigue substitutions complete (home two, away three), and one contextual
temporary muscle discomfort resolves during play. Statistics invariants pass;
the longest gap without football/restart progress is 17.75 s and the longest
unchanged restart blocker is 16.175 s, with no liveness diagnostics. This single
fixed spectator seed checks completion and participation, not shooting realism.
