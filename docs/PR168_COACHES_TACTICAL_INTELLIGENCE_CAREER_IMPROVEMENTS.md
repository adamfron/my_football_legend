# PR168 — Coaches, Tactical Intelligence & Career Consistency

Base: merged PR167, `2ddeb35`. Final `npm run verify`: **PASS — 1742 tests, lint, TypeScript and production build**. Focused and browser evidence below.

## Work plan and architectural audit

1. Freeze the baseline; inspect PR166–167 contracts, selection, transfers and physics.
2. Add a read-only evaluation of generated actions, explicit heuristic uncertainty and
   outcome-independent decision feedback. Preserve existing production action ranking.
3. Compare preferred/secondary formations using the canonical XI solver, real positional
   costs and bounded switching costs. Share selection with offer projections and briefings.
4. Correct sporting interest and shortlist truncation; resolve current managers and expose
   changes in expectations without changing contracts or positional familiarity.
5. Reconstruct pushed-touch states; retain a reachable human pursuit and acquire the ball
   physically before following a new destination. Preserve interceptions and terminal release.
6. Require longitudinal PlayStyle evidence, retain legacy achievements, hide exact normal UI
   thresholds, and rebuild prematch/retirement presentation with career primitives.
7. Run focused matrices, browser checks, a transfer/match/progression smoke and full verify.
8. Record measurements, limitations and deferred PR169/170 work; open a reviewable PR.

Verified source issues: offer intent uses only the preferred formation; the XI solver only
considers another legal formation when the first is illegal; reputation bands reserve shortlist
slots before the 3/4-offer cap; summer offers truncate again. Sporting interest mixes reputation
and bootstrap positional need with current ability. The prematch choice replaces the career
screen; retirement hardcodes the first club; UI leaks raw fractional fitness/minutes and exact
four-match PlayStyle thresholds.

Pushed-ball hypotheses under investigation: ownership loss discards both human possession
and carry intention. Even while ownership remains, a replacement carry immediately changes
the locomotion destination despite the ball being between contacts. The user's original debug
export is unavailable; reconstructed fixtures must be identified as equivalent, not exact replay.

No new engine, outcome multipliers, shot quotas, or global tactical calibration are planned.

## Situation evaluation and coaching

`tacticalActionEvaluator.ts` complements the existing situation classifier. It consumes the
canonical enumerator, rejects unavailable participants and evaluates at most 96 generated
choices. Structured context includes controllability at the feet, actual speed/orientation,
local support/opposition, opponent line depth, formation, fatigue, score and time. Passing
reuses the existing launch/arrival/reception forecast; receiver space and nearby second-ball
support are explicit. Defensive exposure detects advancing defenders without central cover.
Shooting distinguishes geometry from execution. Coach compatibility uses the existing
physical tactical axes. A short outlet can be useful while a progressive pass offers more
territory at greater interception risk.

Retention/chance/exposure indices and the composite score are **uncalibrated heuristics**.
Missing forecasts are null. `explainTacticalOutcome` keeps the original decision assessment
separate from the subsequent result; a failure does not rewrite the pre-action score. This
is a foundation for feedback, not a complete post-match relationship or narrative system.
The optional Polish “Ocena sytuacji” button evaluates a paused human decision on demand.
Autonomous production action ranking is unchanged.

Ten frozen PR165 pass probes (one seed, baseline and blocked build-up) yielded the same
mean completion forecast **0.7394**, **7/10** intended receiver contacts/completions and
**7/10** retained two seconds later on both revisions. This is limited empirical evidence,
not probability calibration or proof that the new composite score predicts match success.
The 12-state test matrix checks determinism, no mutation, available candidates, pressure,
fatigue, time/score reasons and outcome-independent assessment. The benchmark evaluates
25 generated actions in about **10 ms median** (ten warm calls; see receipt for exact time).
There is no exhaustive future search or per-tick evaluator invocation.

Persistent coach identities still own preferred/secondary formation, style, trust, experience,
rotation, patience and adaptability. `coachTactics.ts` maps them to the existing bounded press,
compactness, patience and verticality mechanics. The adjustments are small stable differences
inside a philosophy, not success modifiers. Existing tactical positioning responds to the actual
match and opposing bodies. No global shooting/passing/defending calibration was performed.

The existing canonical XI assignment solver compares preferred and secondary shapes.
The alternative pays **8 + (100 − adaptability) × 0.16** summed selection points; effective
positional ability, familiarity, availability, fitness, duty and bounded trust remain in the
selection score. Other shapes are emergency fallbacks when neither familiar shape is legal.
An explicitly requested legal formation stays explicit, preserving laboratory comparisons.
Normal career, single-match setup, hierarchy, youth strength and observability share adaptive
selection. This avoids a second team selector. The specialist regression selects a natural
right-wing slot in a reasonable secondary 4-3-3 for a 3-5-2 coach, while preserving the winger's
low defensive familiarity. Goalkeepers remain isolated from outfield adaptation.

`matchBriefing.ts` resolves current squads and coach, projected participation/assigned position,
selected formation and the opponent's strongest current unit by actual effective XI quality.
Two instructions describe supported passing, space, pressure and cover responsibilities.
It does not claim scouting knowledge about tendencies the game has not recorded. Briefings
are inside the compact fixture choice and add no compulsory step. Opponent-specific formation
search and persistent marking handovers remain limited; this PR does not claim a new global
opponent preparation engine.

## Transfers, promises and appointments

The previous interest equation mixed ability with club reputation and static generated depth;
shortlist reputation bands reserved slots, including a lower-level club, then capped the result
at four (three for older players). The summer window truncated again. The position planner
only examined the preferred shape, and missing nominal positions forced deep-reserve forecasts.
These source causes are verified. A universal inability of a 73-OVR winger to attract first-tier
interest was **not** reproduced: the baseline cross-sectional fixture already had one such offer.
The unavailable original career cannot be reconstructed exactly.

Canonical interest now combines effective current squad strength, positional competitors,
the actual projected XI/bench standing, bounded form/performance, age, youth potential and
reputation. Pre-normalization club descriptors retain the legacy bootstrap route. Attractive
players can receive up to eight serious offers (five for age 35+); no minimum offer count or
division is forced. Existing career preferences and contract economics still apply. In their
absence, credible sporting opportunities rank before artificially reserved reputation bands.

Position intent comes from the same projected hierarchy used for selection. Competitors
include every normally eligible adjacent position, with its real effective familiarity cost.
Renewal/expected-role evaluation also uses the actually assigned position, avoiding a second
nominal-position-only promise. Contracts distinguish the contractual expectation from current
sporting standing; they do not grant automatic selection.

Recruitment also handles a temporarily unfieldable destination without masking the strict
live match-strength invariant. It uses the actual XI when legal, otherwise a complete projected
XI only if this recruit repairs the missing role. If neither XI is legal, the club is excluded
from serious offers until its squad is repaired; no reputation-based strength is invented.
Two focused keeper-gap fixtures verify both rejection and a genuine repair, including a
ten-player roster. The strict live strength resolver continues to reject the original roster.

| Player fixture | Baseline offers / tiers | PR168 offers / tiers |
| --- | --- | --- |
| RW, age 18, OVR 60 | 4 / 4,2,2,1 | 8 / 2,2,3,3,2,2,3,3 |
| RW, age 25, OVR 73 | 4 / 4,2,1,4 | 8 / 1,1,1,2,2,2,2,1 |
| RW, age 33, OVR 73 | 3 / 4,2,1 | 8 / 1,1,1,2,2,2,2,2 |
| CM, age 25, OVR 73 | 4 / 4,1,1,4 | 8 / 1,1,1,1,1,1,2,1 |
| ST, age 27, OVR 78 | 4 / 4,1,1,4 | 8 / first tier |
| GK, age 27, OVR 78 | 4 / 4,1,1,4 | 8 / first tier |
| ST, age 37, OVR 58 | 4 / 4,2,3,2 | 5 / third tier |

Across these 53 PR168 offers there are **zero projected/current-selection mismatches** and
**zero important/star promises for a player immediately outside the projected XI**. These
are comparisons at the same frozen sporting context, not lifetime promises. Seven deterministic
test profiles cover youth, aging, winger/midfield adaptation, striker competition and goalkeeper
roles. The ordinary 18-season career fixture naturally reached OVR 72, 440 appearances,
378 starts, 150 goals and 126 assists. Its real offer/club trajectory is retained separately;
neither OVR progression nor trophies were forced.

Offers resolve manager overrides at projection/acceptance. Annual appointments continue to
run normally. A coach-change fact now retains contractual, previous and re-evaluated sporting
roles and the new preferred/secondary shapes. The career interface exposes the change and
current expectation. Tests replace a coach before accepting and after signing; contract,
selection standing and position familiarity are preserved. Future sporting selection can change
with real competition, development, injuries and coaching; the change is no longer silent.

## Pushed-touch reproduction and correction

This is an **equivalent controlled fixture**, not the missing original replay. A human winger
at 600 s runs at 6 m/s with the ball 2.6 m ahead rolling at 7 m/s. Another sprint can request a
sharp reverse/diagonal destination while the ball is outside the feet's contact geometry.

Verified causes:

- Replacement carries immediately used the new destination for locomotion, leaving the
  still-moving ball behind during a sharp turn.
- Ownership loss cleared both `humanPossessionEpisode` and `ballCarrierIntent` even when
  the actor's own pushed touch was reachable. That also removed the distinction from ordinary
  off-ball movement.
- A naive pursuit-only correction aimed each following touch along the pursuit route, keeping
  the player pushing straight ahead. The final correction separates approach and contact aim.

`carryPursuit.ts` requires an existing human carry, the actor's own last touch, an open-play
ground ball, a live bounded intention, physical availability and no terminal release/opponent
ownership or deliberate off-ball movement. Eight rolling-ball samples over two seconds reuse
the canonical acceleration/turn arrival estimator. It respects the shared whole-ball boundary.
An aligned owned carry retains its existing stride. A route that leaves the reachable ball
approaches its forecast contact point first. Only the real foot-contact integrator can impart
the next directional touch; ball coordinates and ownership are never granted by the forecast.
The last loose approach tick preserves intention until physical acquisition. Successful contact
then continues the selected destination with ordinary locomotion and control costs.

Sixteen four-second continuations cover ownership/separation, repeated sprint, sharp turn,
pressure and both orientations. Focused regressions add impossible distance/speed, touchline,
explicit movement, terminal release, real contact, final loose acquisition and complete-state
determinism. Actual pressured canonical probes still finish with opponent possession in some
cases. There is no protected claimant or lower defender effectiveness.

| Initially controlled, unpressured cases | PR167 | PR168 |
| --- | ---: | ---: |
| Cases | 4 | 4 |
| Any transient loss of physical control | 4 | 2 |
| Sharp-turn cases with transient control loss | 2/2 | 0/2 |
| Possession retained at four seconds | 2/4 | 2/4 |

The correction removes unnecessary sharp-turn control loss in this bounded sample. It does
**not** demonstrate a population-wide reduction in turnovers, guarantee sprint success or
increase shot production. Initially loose cases and failures remain visible in the raw receipt.

## Longitudinal PlayStyles and compatibility

New human acquisitions require three distinct evidence seasons spanning at least 24 complete
calendar months, 12 meaningful matches, 24 qualifying situations, three contexts, supporting
attributes ≥50 and consistent execution evidence. Most styles require six successful actions;
Calm Finisher requires five. Relevant football experience is 720 minutes for Calm Finisher,
900 for progressive/between-lines/GK distribution and 1080 for Ball Winner/Engine.

At the existing roughly four playable fixtures per season, the first acquisition is achievable
during the third or a later season; the actual dates must still span two full years. Existing
per-five-minute/per-fixture evidence limits remain. Receipt IDs are deduplicated before progress
aggregation. Simulating calendar years adds no behavioural evidence. Tests cover three-season
unlock/save/reload/idempotency, single-season farming, repeated receipts and legacy unlocks.
The old four-match test fixtures were strengthened to twelve matches/three seasons; the obsolete
four-offer assertion now requires exactly eight unique, genuinely interested clubs. No assertion
was deleted, test timeout increased or failed check bypassed.

Earned legacy facts are never revoked. PR167 NPC styles retain their explicit established,
development and experience provenance: they describe current NPC identity, not newly observed
human behavioural acquisitions. No NPC action history is fabricated to apply the human rules.
Effects remain the existing contextual preparation/anticipation/recovery effects.

Normal UI presents descriptions and developing-style feedback. `?devtools=1` reveals evidence,
seasons/months and detailed requirements. Existing permanent compact match receipts supply
progress; no replay history or parallel growth ledger is added. Save v7, result v1/v2 and
canonical-plus-summary contracts/readers/retention remain intact.

## Career presentation and actual browser evidence

The fixture choice is now a native modal inside `CareerView`, using the existing light career
panels and controls. It shows competition/date, actual clubs, predicted involvement and the
briefing. The old `match-shell` class was removed; legacy completed-result readers remain.
3D still imports only after Play. Summary save/retry uses one retained result; Return/Escape
does not settle a fixture. Native modal focus is contained and restored on unmount.

Retirement uses compact light panels, the same stable portrait, career/retirement dates, actual
first/final clubs, total seasons with recorded participation, appearances/starts/minutes/G/A,
highest OVR, a scrollable season table and fact-backed honours. A partially played current
season can contribute without writing another canonical snapshot. Missing honours stay absent.
History actually opens and returns; New Career waits for the existing asynchronous save deletion.

`numberPresentation.ts` rounds only at display boundaries. The header, squad fitness, season
summary, retirement totals and timeline log use whole numbers; sums retain internal precision.
`68.59231372170186 → 69`, `28009.017083333085 → 28 009`; ratings remain one decimal.
Profile attributes are laid out across compact groups, with darker hints and styles close to
the card rather than below a tall empty column.

Actual headless Microsoft Edge over production HTTP covered U-17/pro Play and Simulate,
Escape/return, contained keyboard focus, 390 px fixture layout, valid results, reload equality,
next fixture, normal profile thresholds, an actual 3D prefix with three resolved human decisions,
summary remainder/cancel, and 18-row retirement/history/new-career actions. The two play paths
record canonical-plus-summary provenance; they are not claimed as two complete browser-played
90-minute matches. Full physical matches are covered by the contract test suite.

Screenshots: [fixture](images/PR168-youth-summary-prematch.png),
[mobile fixture](images/PR168-prematch-mobile.png), [profile](images/PR168-profile.png),
[remainder](images/PR168-remainder-confirmation.png),
[retirement](images/PR168-retirement.png), [mobile retirement](images/PR168-retirement-mobile.png).
Retirement table text uses #20272b on white; controls use dark text on light panels. The 390 px
retirement panel is 370 px wide and its wide table scrolls inside the panel.

## Evidence and verification

- [Frozen PR167 baseline](performance/PR168-baseline.json),
  [PR168 raw comparison](performance/PR168-after.json),
  [summary/source digest](performance/PR168-comparison.json).
- [Eighteen-season genuine routine career](performance/PR168-career-trajectory.json).
- [Actual Edge scenarios and persisted results](performance/PR168-browser.json).
- Focused tests: `pr168Intelligence.test.ts`, `pr168Career.test.ts`, existing PlayStyle,
  manager, squad, contact and runtime-save suites. All focused runs passed before full verify.
- Final `npm run verify`: **PASS — 1742 tests** (1681 main, 52 serial integration, four canonical contract and five full-career tests), lint, TypeScript and production build.
  [Verification receipt](performance/PR168-verification.json). No test exclusions/workers/timeouts or package dependencies were changed.

Benchmarks run before publication against the uncommitted implementation: `sourceCommit`
records its Git parent (`2ddeb35`), while `canonicalSourceHash` / `sourceDigest` identify the
actual normalized source contents. The final verification receipt also fingerprints the staged
source/script blob inventory. The publication commit is created after the successful checks.

The first sandboxed Vitest launch could not rename its OS temporary cache; using the workspace
temporary directory resolved this without altering tests. Edge required normal process access
outside the restricted sandbox. A browser assertion initially checked the creator before async
save deletion completed; it now waits for the visible form. An initial verify was interrupted
to add the final loose-acquisition boundary correction; the final run starts from the final code.

The first completed main suite passed 1674/1679 tests and exposed five failures. Two were the
intentional coach/formation telemetry changes: the pristine PR167 references and both new
references were independently reproduced twice at 2400 ticks, preserving all 80 fields,
runtime schemas, turnover/restart identity ledgers and invariant assertions. The exact full-hash
assertion remains; only its documented behavioural references change. Paired evidence and
field differences: [telemetry reference](performance/PR168-telemetry-reference.json),
[complete eight payloads](performance/PR168-telemetry-complete.json.gz).

The new persistent coach axes and adaptive XI shape change the autonomous inputs, while the
action-ranking algorithm itself remains unchanged. In the paired 60-second spectator probes:

| Seed | Pass attempts/completions before→after | Progressive passes | Carries | Possession changes | Shots |
| --- | --- | --- | --- | --- | --- |
| a | 24/23→26/24 | 10→8 | 1→0 | 0→1 | 0→0 |
| b | 27/21→26/22 | 12→8 | 0→0 | 2→3 | 0→0 |

The after losses are one interception in a, and two interceptions/one failed control in b.
These small samples document a behavioural consequence, not a claim of globally improved
passing, turnover rates or chance creation. The controlled human-carry comparison above is
a separate experiment.

Two PR148 fixtures explicitly requested balanced football by changing its label alone; they now
also set balanced tactical axes, retaining every original action/defensive-responsibility assertion.
The fifth failure caught an overly broad possession-epoch continuation. The production fix now
requires a reachable own loose touch or a fresh canonical reacquisition; an arbitrary epoch jump
still ends agency. The existing PR144 test and all PR148/new continuity tests then passed (53/53).
The final markup cleanup uses a neutral match host around `CareerView`, preserving one main
landmark while the career-backed modal is open; the changed component passed ESLint again.

The next full pipeline passed the main, integration and complete canonical-match stages,
then exposed a long-career boundary in seed `full-simulation-2`: in May 2037, `pro_34` had
24 footballers but no eligible right-back. Querying strict live strength for every prospective
employer threw before recruitment could reject that destination. The correction above keeps
match integrity strict and permits a recruit to repair a genuine gap. Both new focused cases
and all five unchanged full-career tests then passed; the final complete pipeline outcome is recorded above.

The final canonical contract run completed a full U-17 match (0:0, four human choices),
then two identical professional fixtures (0:0, 6 choices / 5 resolved, 1 substitutions).
The professional fixture begins with a genuine offer acceptance and actual coach selection;
commit/reload, duplicate/conflict rejection and subsequent career/calendar progression passed.
All five full-career tests passed under their unchanged limits. Existing bundler chunk-size
and mixed static/dynamic import warnings remain; the production build exits successfully.

## Final acceptance answers

| # | Concrete answer / evidence |
| --- | --- |
| 1 | Generated alternatives now expose progression, dynamic arrival risk, reception retention, receiver space, support, cover, coach fit and match context. |
| 2 | Yes; a frozen assessment is preserved separately by `explainTacticalOutcome`; success/failure does not rescore it. |
| 3 | Canonical generated actions and active-participant checks only; no imaginary alternatives. |
| 4 | Ten probes give 7 contacts/completions versus mean forecast 0.7394, unchanged on the frozen baseline. Calibration remains limited and explicitly uncertain. |
| 5 | Repeated evaluations are equal and the entire input is unchanged in all twelve tactical fixtures; no physics stepping/RNG consumption. |
| 6 | Stable style plus bounded coach preferences feed real press/compactness/patience/verticality and effective XI fit. |
| 7 | A legal secondary shape must overcome a summed switching cost; unfamiliar shapes require both familiar shapes to be unavailable. |
| 8 | Yes; the strong RW/3-5-2 fixture selects secondary 4-3-3 and retains poor defensive familiarity. |
| 9 | Current coach, exact XI/bench role, formation and effective opponent-unit quality; no fabricated scouting tendencies. |
| 10 | Static/reputation interest, preferred-only position intent, reputation-band reservations and repeated shortlist caps; universal failure was not reproduced. |
| 11 | The age-25 OVR-73 RW receives eight credible first/second-tier alternatives versus four baseline offers across tiers 4/2/1/4. |
| 12 | All 53 offers in seven fixtures match the projected canonical standing; zero immediately misleading star/important promises. |
| 13 | Contractual expectation is preserved; real future selection can change. Current sporting role is resolved again rather than silently forcing or cancelling the promise. |
| 14 | Annual appointments remain canonical; changed expectations are retained in a fact and visible in the career interface. Tests change the coach before and after signing. |
| 15 | New destination owned locomotion while the ball was separated; ownership loss also discarded continuing carry/agency. Reconstructed fixture, not an exact original replay. |
| 16 | Yes; forecast approach precedes the new route, and real foot contact supplies the directional impulse. Final loose acquisition is explicitly tested. |
| 17 | Yes; impossible/boundary/terminal/opponent cases reject pursuit, and actual pressured probes include opponent possession. |
| 18 | Sharp-turn transient loss 2/2→0/2; all initially controlled unpressured cases 4/4→2/4; final possession remains 2/4. |
| 19 | At least three evidence seasons and 24 months, typically third or later playable season; per-style experience/consistency/attributes also apply. |
| 20 | Yes; descriptive normal UI, detailed opt-in developer counts/requirements; legacy achievements retained. |
| 21 | Yes; career remains behind the accessible compact modal, confirmed in Edge. |
| 22 | The obsolete `match-shell` presentation/style is removed; compatibility readers remain. |
| 23 | Light compact career panels, stable portrait, real history and readable table; actual desktop/mobile screenshots included. |
| 24 | Helpers round aggregated display values only; tests check the supplied examples and aggregation of fractional values. |
| 25 | Existing storage/result versions, idempotent retry and provenance remain; full verification and contract tests establish the final status. |
| 26 | PR169: richer stories/news/feedback and timeline involvement with genuine substitution provenance; PR170: atmosphere/assets/stylized match polish. |

## Deferred work and limits

PR169 must present started/substituted/unused, entry/exit minutes, actual replaced/replacing IDs
and a substitution reason **only where a canonical structured event records that reason**.
Retain the existing compact structured substitutions/provenance; do not duplicate full matches
or infer fatigue/tactical/injury motives from minute/statistics alone. Broader coaching narrative,
relationships and news remain PR169. Extensive new assets and atmosphere remain PR170.
Further empirical forecast calibration, opponent-specific formation search, persistent defensive
handover/cover and complete replay/checkpoint history need separate measured work.
