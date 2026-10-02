# Rules, Discipline & Canonical Match Feedback — PR147

`src/core/matchSimulation` remains the only football authority. The human chooses intent;
the footballer executes it through the existing attributes, geometry, pressure and physical
timeline. The fixed physics step is 0.025 s. Referee decisions and presentation do not consume
an independent random stream or replay football to determine an outcome.

This document describes the verified PR147 working-tree implementation and its bounded evidence.
Mechanical consistency is verified; disciplinary frequencies and full-match realism are not calibrated.
The resumed scope preserves the valid inherited rules/feedback work and adds dismissal,
ten-player continuation, historical presentation and more detailed discipline instrumentation.
Frequency calibration is explicitly deferred to PR148.

## Canonical defence and contact

`defensiveChallenges.ts` owns the Zod-validated `standing`, `committed`, `slide` and `tactical`
challenge intent, one active attempt, its physical diagnostic and fixed-size defensive totals.
`matchActions.ts` exposes the same actions to target-first human interaction and NPC ranking.
There is no permanently available defence menu. The existing attribute vocabulary is reused.

The context projection measures opponent/ball distance, facing error and relative speed,
plus attacking progress, attacker movement and nearby cover. A low ball and an opponent
within 4.5 m are general eligibility requirements. Routine standing access is narrow;
committed/slide actions require a significant defensive commitment or danger, and tactical
stopping requires a promising attack with little cover. Slide access also requires actual
relative motion and an achievable facing/distance window. These thresholds are calibration
inputs, not a promise of successful contact.

Starting an action records intent and gives existing locomotion an independent challenge-target
override, preserving the controlled player's unrelated movement intent. Execution waits
for the required technique preparation time and reachable ball/opponent contact; an attempt
can expire without contact. The resolver uses the current geometry, ball height, facing,
relative speed, approach from behind, lateness, commitment and seeded execution. It records
ball-first/opponent-contact evidence and resolves `clean_win`, `loose_ball`, `missed`, `beaten`
or `foul`. Choosing tactical stopping still has to reach the opponent. Choosing a slide is
neither a guaranteed ball win nor a guaranteed foul. Ordinary standing contact can accidentally
produce a foul. Possession/loose-ball handling uses the existing lifecycle.

For the controlled player, an autonomous source cannot start a non-standing technique.
Explicit human selection and the opt-in DEV AI delegation may do so. Routine standing defence
remains autonomous; significant contextual alternatives preserve human ownership. NPCs use
the same challenge action/resolver and can select higher risk through contextual ranking.
Presentation sensitivity does not decide whether the human owns a choice.

## Referee, discipline and restarts

`matchRules.ts` classifies an evidenced physical foul as ordinary, reckless or excessive force.
The immutable foul fact stores challenge identity, canonical contact time/location, actor,
opponent, awarded side, tactical/promising-attack/DOGSO context, penalty classification and
intended disciplinary consequence. A selected action alone does not award a restart.

Recklessness considers force, lateness and a slide from behind. Excessive force and selected
DOGSO contexts produce straight red; cautionable contact or tactical stopping of a promising
attack produces yellow. A second yellow becomes `second_yellow_red`. Discipline is a canonical
player-identity map. Sent-off players leave the active roster but retain discipline/statistics;
if the dismissed player was the last goalkeeper, a surviving teammate with the highest existing
`reflexes` attribute becomes the deterministic emergency keeper. This is a fallback,
not a substitution system.

Dismissal takes effect when the canonical card is issued. A delayed second-yellow dismissal
after advantage does not remove the player at the earlier foul time. Once issued, the player
is absent from `state.players`: no movement, physical tactical occupancy, spacing/pressure,
collisions, pass/action participation, target enumeration, NPC availability or human prompts.
The team continues with ten active players and an uncovered tactical role; no bench actor is
introduced. In-app live frames reflect the active roster. Saved replay/context frames before
the card may still correctly contain the player, while frames after the boundary may not.
Canonical `discipline.sentOffAt` and the bounded `TacticalFrame.dismissals` timestamp map preserve that boundary
independently of the short-lived card label. An expired 1.6-second label or a longer gap between
recorded frames cannot resurrect a dismissed actor in historical interpolation.
The renderer detaches absent actors/debug markers and restricts both picking paths to the displayed
frame roster. A cached rig can return for an earlier replay frame; detached resources are disposed
with the renderer. Live targeting never uses that presentation cache as a canonical player source.
The pure `hasActiveMatchActionParticipants` guard rejects cached actions involving a removed
actor/receiver/opponent before gating in both action APIs. Human/DEV application also rejects
a cached controlled-player opportunity after that controlled actor is no longer active.
Walk-off/tunnel/dressing-room animation and ten-player tactical reorganization remain later.

Penalty classification uses the defending side's own canonical penalty rectangle. Outside
the area, the actual contact point selects the existing far/close/wide free-kick setup. Inside
the area, the existing penalty setup uses the penalty spot. `applyRestartScenario` and its
geometry/taker/liveness lifecycle remain authoritative; there is no parallel free-kick system.
Foul stoppage clears incompatible carry/reception/agency execution state.
The resumed throw-in lifecycle fix ends the released throw setup on the first valid other-player
physical contact, before a subsequent action in the same tick. Previously a four-second release
tail could misclassify the receiver's ordinary pass as a new throw and retain the old scenario;
new legitimate fouls exposed that stale-state assumption. The airborne/no-contact throw and
thrower's second-touch restriction remain until actual physical evidence, not a timeout shortcut.

Advantage is deterministic and follows one forward timeline. A non-penalty, non-red foul may
continue when the fouled side retains useful attacking possession in the final attacking
portion of the pitch under tolerable pressure. The current window is three canonical seconds.
Progress of five metres, an actual released shot, a goal, or useful possession at expiry realizes
the advantage. Opponent possession, material backward retreat, loose possession persisting
0.6 s, a stoppage or expiry without useful possession recalls the original foul/location.
Cards are queued by foul identity and shown at the next restart, goal or period stoppage.
The delayed card stores both foul time and card time. No rollback/resimulation is performed.
An accepted physical attempt may finish just beyond the 2700/5400 s threshold within its bounded
execution window. Both fixed-step entry points preserve that actual final canonical time rather
than rewinding the contact/card evidence; an ordinary threshold-only end stays exact. Existing
advantage settles at the whistle and no new advantage starts during `periodEndPending`.
Fresh routine/NPC attempts cannot start past the threshold, and transient attempts clear at the
boundary. Persistent discipline survives into the next half; this is no added-time redesign.

## Canonical action evidence

`actionEvents.ts` emits typed events only after authoritative transitions. Each fact has a
stable seeded identity, sequence, canonical time, kind, actor/team, position, outcome and cause;
opponent/target and causal parent are included where evidence allows. Schemas validate the
event stream and its state containers. Events expose pass/through-pass/cross, reception/heavy
touch, interception, challenge/tackle/slide, block/clearance, shot/save, foul/card and advantage.
The stream observes canonical diagnostics and never assigns statistics or disciplinary results.

The ledger retains the last 12 canonical seconds with a hard capacity of 96 events, sufficient
for the six-second context and ten-second replay contracts. Stable event identities suppress
duplicate observations. A heavy first touch can parent the subsequent interception, so an
important lost-ball episode remains explainable even if it resolves before meaningful human
agency exists. Rendering does not invent a prompt or infer the event from a pose.

## Micro-feedback and canonical presentation time

`actionFeedback.ts` is a pure declarative Polish projection of canonical action events. It does
not read pose/animation to decide what happened and consumes no RNG. Live frames, the 10 Hz
lead-in context and saved replay frames carry compact recent evidence. Label age always uses
the displayed frame's canonical time, so replay/lead-in cannot show a future action early or
expire it according to the live simulation clock.

At most three labels are visible. One actor gets one label, duplicate event IDs are ignored,
and repeated same-kind/same-team events within 450 ms share a slot. Priority is disciplinary
card → foul → save → shot/advantage → heavy touch/interception → block → won challenge/slide
→ cross/clearance → routine delivery. Ordinary successful reception, missed/beaten/loose-ball
routine challenge feedback and already-realized advantage stay quiet. Labels last 650–1600 ms
(routine pass 700 ms), with a 180 ms fade. The maximum frame-evidence lifetime is 1600 ms.
Second-yellow/straight-red events use „CZERWONA KARTKA”; recalled advantage uses
„WRACAMY DO FAULU”.

The anchor uses the relevant actor in the displayed frame, with canonical event position as
fallback. Camera transforms affect placement, not event lifetime or selection. Important
heavy-touch/interception/foul/shot/save feedback therefore outranks repeated routine releases
and cannot create an extra decision prompt.
The actual renderer projects world anchors through the active camera, clamps text into the
viewport and suppresses overlapping screen-space rectangles. A neutral background and team
border provide contrast. Overlay nodes expire and are disposed with the renderer. Frame
interpolation unions adjacent recorded event evidence, then gates it by the requested canonical
time so an event between two samples becomes visible at its real timestamp.

## Defensive telemetry

Canonical scalar totals and a roster-sized `byPlayer` map count accepted challenge opportunities,
attempts, missed/no-contact, beaten, clean wins, loose balls, fouls, yellow/red cards, slide
attempts, tactical intents and advantages. Opportunity counts currently describe accepted
physical attempts, not every approach considered by tactical planning. Attempted challenge
and won tackle are distinct denominators; failed execution no longer disappears from the funnel.
These totals are retained in normal mode, without enabling full DEV histories or capture.
The existing DEV benchmark-session export includes `current.defensiveTelemetry`, `discipline`
and `recentCanonicalActionEvents`. `benchmark:performance` reports the same canonical defensive
totals/discipline and bucket counts for action events, pending cards and player counters, with
capacity assertions. The frozen PR146 harness did not expose these new fields; absence in its
raw report means unavailable, not zero defensive opportunities.
The resumed counters `highRiskIntents`, `secondYellowDismissals`, `straightReds`, `penalties`
and `advantageRecalled` distinguish disciplinary subtypes. A bounded `lastPenaltyAwardId`
prevents repeated counting of one penalty award; repeated booking/recall is idempotent. It is telemetry,
not a new frequency model. PR148 measures the full approach → availability → accepted attempt
→ contact → outcome funnel, then runs **Discipline realism calibration** on representative
full matches and large deterministic batches against reliable real-football distributions
where datasets are available. Metrics include fouls/team/90, yellows/match, reds/100 matches,
penalties/match, cards/foul, fouls/challenge and advantage across style/position/quality.
The aim is plausible distributions, not forcing each match to a mean. Individual attributes
and tactics retain influence; league/referee interpretation is a later parameter.

## Known scope limits

- This is a coherent subset of rules, not all IFAB edge cases. Advantage, cover/DOGSO and contact
  thresholds are deterministic bounded heuristics requiring further football calibration.
- Contact geometry approximates accessible ball/feet/body contact using canonical positions,
  facing and velocities; it is not a physical skeleton or a simulated injury model.
- No persistent match injury consequence, substitutions, VAR or new added-time model is added.
- No walk-off/tunnel/dressing-room sequence, bench UI, referee personality, league-specific
  card profile or tuning to real-league frequencies is added.
- Red-card space compensation and broader formation/role adaptation remain later work.
- PR148 owns full defender-versus-dribbler calibration, approach/opportunity funnels, decision
  density, possession rhythm, overlap/underlap/cutback and attribute-driven role differences.
- PR149 owns richer challenge animation and replay/match presentation. Labels are evidence,
  not proof of animation fidelity or final visual polish.
- Optional canvas-only WebM recording currently excludes the DOM label overlay. The in-app
  replay/lead-in use canonical label evidence; no video-overlay capture result is claimed.
- Weather, workload/recovery, career integration, ratings, transfers/youth/narrative/economy,
  permanent highlights, richer creator/faces and stable parametric stadium profiles remain later.
  There is no stadium-construction minigame.

## Validation and benchmark

Final `VITEST_MAX_WORKERS=2 npm run verify` exited **0**: lint, **120 files / 777 main tests**,
**one file / five full-career tests**, TypeScript and Vite build (**279 modules**). The complete
suite contains **782 tests**, 57 more main tests than PR146. Existing experimental-transform,
mixed `careerStorage` import and large-chunk warnings remain nonblocking. Assertions were not
weakened; historical expected hashes and liveness fixtures changed only after intentional
behaviour was confirmed by deterministic traces. The first Linux CI run exceeded the default
5-second timeout only in the four-mode A–D capture/export integration test; that test now has an
explicit 30-second timeout with all four 480-tick runs and every assertion retained.
Targeted coverage includes:

- `pr147Rules.test.ts`: clean standing/missed/clean-slide/mistimed-slide execution, accidental
  ordinary foul, unreachable tactical intent, shared NPC execution, controlled-player risk
  guard, yellow/second-yellow/straight-red/DOGSO, outside-area free kick, penalty, successful
  advantage, recall, delayed card at stoppage/recall and fixed-step entry-point/schema parity.
  Contact execution tests exercise the physical resolver; referee classification fixtures also
  inject structured physical diagnostics to isolate the rules from approach geometry. Further
  full-tick tests cover autonomous accidental foul/free kick and selected committed physical
  contact/card/restart/events, duplicate-booking idempotence, independent NPC/human movement,
  no theft from an unrelated ball owner and bounded period completion. Resumed coverage adds
  subtype counters, ten active players with 22 preserved statistics records, goalkeeper dismissal
  and legal goal-kick fallback, delayed second-yellow timing and actual period-end event time.
  Throw regressions verify the first-contact handoff and normal subsequent action in the complete
  timeline; legacy restart-liveness tests observe the original restart before a lawful later foul.
- `pr147Agency.test.ts`: autonomous harmless defence, context/target-dependent slide/tactical
  options, human intent through the shared action path, no silent high-risk selection, NPC
  parity and waiting for an actual missed result with attempts/wins recorded independently.
- `actionEvents.test.ts`: real pass release evidence/ID/schema/deduplication, 12 s/capacity
  retention, new touch time independent of a stale pass, actual released pass → real poor
  first touch → opponent interception with the complete causal parent chain before a prompt,
  and exact complete-state equality with presentation.
- `actionFeedback.test.ts`: Polish canonical labels/lifetimes, priority/suppression/deduplication,
  three-slot bound, actor/fallback anchor, and event activation between saved frame samples at
  the correct replay/lead-in canonical time. Renderer regressions additionally cover DOM
  label placement, expiry and disposal; resumed cases exercise actual red-card context before/after
  issue time, roster/picker/cache lifecycle and a long gap after the card label has expired.
- `backgroundOrchestration.test.tsx` spies on the actual UI renderer/capture and asserts that
  hidden simulation does not call either path. The headless harness's literal zero-renderer
  contract alone is not a measured browser count. Browser smoke is a limited session check,
  not a complete 90-minute or visual dismissal demonstration.

The frozen baseline is upstream PR146 main
`023fd3c9a217c4cde27479b356b4edf5fab2789d`, preserved separately from the edited source.
The representative fixture uses the existing `benchmark:performance` harness: ten canonical
minutes, normal observers, fixed controlled central midfielder, seed
`pr146-performance:balanced:a`, 20-tick batches and profiling at 1/37 ticks. Six runs were
sequential after verification, with the browser paused and no competing heavy agent work:
before2 → after1 → before3 → after2 → before4 → after3. The initial earlier 13.346 s baseline
is preserved as exploratory evidence and excluded from these comparison statistics.

| Measure | Frozen PR146 | Final PR147 |
| --- | ---: | ---: |
| Work seconds, three runs | 16.300 / 15.643 / 16.390 | 13.217 / 13.302 / 15.253 |
| Median / mean work seconds | 16.300 / 16.111 | 13.302 / 13.924 |
| Fixed ticks / canonical seconds | 24,000 / 600 | 24,000 / 600 |
| Explicit DEV inputs | 3 | 8 |
| Score | 0–2 | 0–1 |
| Context retained / written | 61 / 6,000 | 61 / 6,000 |
| Normal debug frames | 0 | 0 |

Median measured work is 18.4% lower (mean 13.6% lower), but this is **not an optimisation
claim**: authoritative rules, orientation/lifecycle corrections, changed trajectories, different
inputs and fewer active players change the work. This short case shows no material slowdown,
not a full-match performance guarantee. Windows/Node 24.19.0, AMD Ryzen 7 260, 16 logical CPUs;
all raw hardware, buckets, profiles, memory, collections, hashes and discipline records are in
[performance/PR147-results.json](performance/PR147-results.json).

Each revision's three repetitions have exactly the same six canonical evidence values.
The final within-PR147 release_minimal/normal/DEV ten-minute matrix also matches all six hashes
and eight inputs; work is 14.314 / 14.619 / 16.266 s respectively. Final state SHA-256:
`88a9927e4c799bcce580b32f865674a23dbe227afc1fc2dd331e4459fae6773c`.
Frozen PR146 state SHA-256:
`3df3965604affa102fc3e6a69f72a0b2c6edb96b28f92a88dc1ad5e2d0669c01`.
Normal retains nine action events at both five-minute buckets, <=96; pending cards are 0/1,
player-counter identities 14/17, statistics identities remain 22, and DEV history arrays remain
empty. The harness checks collection caps. Its zero rendering is a headless contract; the actual
hidden UI render/capture contract is checked by the spy regression above.

**The disciplinary distribution is uncalibrated and currently a material limitation.** In this
single ten-minute seed: 47 accepted attempts = 12 clean wins + 3 loose balls + 7 misses + 8 beaten
and 17 fouls; 13 yellows, five second-yellow dismissals, no straight red/penalty, 31 high-risk
commitments, three slides, no tactical intent, five advantages and two recalls. Final active
counts are home nine / away eight. This proves observable coherent consequences, not realistic
rates. PR148's Discipline realism calibration must measure full-match distributions after the
duel/contact funnel stabilizes; no arbitrary frequency tuning was applied in PR147.

PR147 can legitimately change football relative to PR146 through new authoritative rules;
before/after hashes must therefore be reported separately. Observer-policy/mode equality is
required within the same PR147 source, seed and input policy. Headless sample throughput does
not establish full 90-minute browser or interactive-match duration, nor WebM encoding cost.
