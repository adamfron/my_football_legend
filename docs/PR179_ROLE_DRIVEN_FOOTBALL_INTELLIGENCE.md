# PR179 — Role-Driven Football Intelligence

**Experimental implementation; no default promotion.** Three runnable role policies share
the canonical ball, contacts, laws, locomotion, attributes, substitutions and result accounting.
`legacy-pr176` remains the default. Neither legacy nor the new policies are accepted as a
statistical calibration source for summary simulation. PR180 must independently evaluate
football quality, including remaining holding and recycling failures.

## Architecture and reused mechanisms

The merged base is PR178, `c8cd8157f64803a3cf19f86cd4b32513176a7b89`.
Existing position slots are GK/CB/LB/RB/CM/LW/RW/ST; defensive/advanced midfield
families are derived from formation slot duties and depth, not invented player positions.
Position, role, permanent attributes and collective phase are separate concepts.

Reused: PR158 six-axis team preferences and suitability; existing coach identity and
formation selection; PR174 combinations, overlaps/underlaps, support and threat memory;
PR177 prospective space passes, feasible delivery plans, state value, transitions,
hybrid readiness and movement authority; PR178 physical contacts; canonical statistics,
match lifecycle, human ownership and the existing Match Lab. There is no additional resolver.

`tacticalRoles.ts` contains a Zod-validated, data-driven catalogue of 29 roles. Instructions
compose width, depth, coming short, combinations, overlaps, underlaps, central support,
cover, long distribution, crossing, box occupation, shooting, pressing, holding position
and counter support. Every role permits departure for a dominant opportunity, defensive
emergency, unavailable cover, physical contact or a human command.

| Position family | Roles |
| --- | --- |
| Goalkeeper | Traditional, sweeper, distributing |
| Centre-back | Stopper, covering, ball-playing |
| Fullback | Defensive, attacking, inverted, wide playmaker |
| Defensive midfield | Anchor, ball winner, deep playmaker |
| Central midfield | Playmaker, box-to-box, controlling, mezzala |
| Attacking midfield | Creative ten, shadow striker, pressing midfielder |
| Winger | Traditional, inside forward, wide playmaker, defensive |
| Striker | Target, false nine, advanced, poacher, pressing |

The catalogue supplies receiving/movement goals, passing/carrying/shooting intent,
support, defensive/transition responsibilities, attribute requirements and complementary
neighbour instructions. These are composed primitives, not twenty-nine scripts. Existing
attributes determine actual passing, shooting, speed, acceleration, turning and contact.
There is no acceleration attribute to manufacture: canonical acceleration derives from
pace, agility, strength and current fitness.

## Coach allocation and live changes

Two deterministic coordinate sweeps inspect at most five primary roles per slot, with
compatible CM alternatives. Suitability averages the role's relevant attributes, adjusted
for condition and intensive-work demands. Neighbour compatibility, existing team
preferences, depth runners and defensive cover affect the collective choice. Opposition
input is visible tactical shape/preferences; no hidden opponent attributes, execution RNG
or future outcomes are consulted. Formation is represented by the actual slot geometry.

Initial assignments are fixed for each experiment. `changeTacticalRole` validates the
available player and position, records from/to/time and invalidates cached readiness.
Incoming substitutes inherit a compatible slot responsibility; otherwise they receive
an attribute-suitable compatible role. This is not the autonomous role-sensitive
substitution/adaptation project reserved for PR180. Explicit adjustments are bounded.

## Three competing policies

**R1 — `role-value-v1`.** Keeps B's candidate repertoire and structural movement.
It changes the value of controlled before/after states. Wide crossing access requires
actual box partners and passing capability; central combination access requires
unblocked teammates; central shooting access uses finishing/positioning; carrying/depth
access uses pace/dribbling; cover uses actual teammates behind the ball. The same
features value the current and resulting states. There is no flat preferred-action bonus.

**R2 — `role-intent-v1`.** Keeps the common B endpoint evaluator, with role-conditioned
off-ball movement and up to three additional receiving invitations. The common delivery
planner must establish finite arrival/contact feasibility. Traditional wingers attack
reachable depth while keeping width; inside forwards offer central depth; false nines
come short; fullbacks offer wide overlaps or central support. Two available outfield
cover players protect attacking fullback commitments. A depth invitation compares owner
depth with a reachable objective ahead of the runner; an already advanced winger is not
instructed backwards simply because the ball is behind them.

**R3 — `phase-role-hybrid-v1`.** Combines role consequences and invitations with a
phase-dependent hierarchy: additional outlet/space value in buildup, stronger temporary
transition value, counter-role movement priority during transition, and remote defensive
cover recovery. Role weight changes between buildup, settled attack, final third and
rapid transition. This is an explicit small hierarchy, not autonomous tactical learning.

Phases are set piece, ball recovery, organised defending, defensive transition,
rapid attacking transition, buildup, settled attack and final-third attack. Ownership,
recent recovery, opponent exposure, defensive bodies, nearby support and goal access
precede the territorial distinctions. Moving the ball over one X coordinate alone
does not determine the phase. Set-piece duties and actual contact retain existing authority.

All policies use the same bounded 48-action search, finite physical forecasts and canonical
execution. Role movement enters before combination, loose-ball, onside and restart
priorities. Explicit human movement and committed/contact/keeper actions retain the
existing arbiter. R1/R2/R3 all recognise a physically executable unguarded-goal shot;
no role prohibits the dominant action and no goal is awarded by role.

## Holding investigation and correction

B repeatedly compares short, often negative action values with retaining its current
state. The inherited worst PR178 high-line possession begins around 74.825 s and lasts
until first-half end. Its original frozen fixture is reproduced to 120 s, then the exact
state is paired across all five policies for 120 physical seconds.

New role policies forecast remaining stationary for 2.5 s: finite opponent arrival and
possible intervention, reachable requested teammate movement, updated outlets/space,
and expiration of temporary advantage. This is a counterfactual forecast, not a forced
pass after a possession timer, a hold-count penalty or a change to physical pressure.
Unchanged possession receives no new benefit merely for being reconsidered. Waiting
for useful support can still win. B is retained unchanged as an experimental control.

[Exact inherited input and replay](performance/pr179-evidence/hold-replays.json.gz):
B selects 266 holds over 119.95 s and moves only 1.179 m from its initial point.
The three role policies leave that particular hold through actual actions, with maximum
hold runs below 0.21 s in that continuation. This does **not** establish a general cure:
R2 creates a new approximately 42.5-minute stationary hold in development SS1.
That is a major realism failure regardless of its possession or score.

[Reproduced R2 keeper state, all candidates and five-policy 2/5/8 s continuations](performance/PR179-stagnation-investigation.json)
is captured at 2979.2 s after 161 selected holds. The traditional keeper owns a
stationary ground ball about 1.29 m from the body; `canReleaseControlledAction` is
false even though nominal preparation time has passed. Of 48 generated actions,
only hold and seven carries survive evaluation. Hold is negative (−0.000895),
but less negative than the best carry (−0.007846). It is not deliberate protection
under pressure: measured pressure/interventions are zero and no actual outlet is
released. Projected support movement does not restore foot controllability.

All four reform policies keep holding in this exact state's eight-second replay;
legacy approaches/releases and continues through ordinary passes. Consequently the
absence of long R1/R3 holds in the six complete matches is not a general escape
guarantee. The first PR180 repair must separate physical approach/touch preparation
from the tactical value of progressing with a carry. Use existing movement/contact
authority to regain an executable control state, without teleporting, granting a
pass outside the foot envelope or forcing a pass after elapsed time. This defect
is preserved as a blocker, not hidden by a keeper-specific action bonus.

Diagnostics retain consecutive selected holds, displacement, alternatives, teammate
movement, intervention and the waiting reason. The strict automatic stagnation flag
uses >=30 s, >=3 holds and <1 m displacement. It is a conservative detector: the B
example's 1.179 m drift misses that flag, so duration/displacement are separately
reported and screened as major failures. The report never treats a zero strict-flag
count as proof that pathological holding is absent. No match is ended to conceal it.

The smallest next correction is physical control preparation followed by a consistent comparison of waiting, carrying and release
over matched decision/physical horizons, plus useful support continuation. The present
waiting forecast can exchange a static-hold sink for rapid low-value recycling. Increasing
pass counts or a universal shooting bonus would conceal that problem.

## Controlled divergence and canonical continuation

[Controlled summary](performance/PR179-controlled-summary.json),
[full candidate/outcome receipts](performance/pr179-evidence/controlled.json.gz).
There are **250 policy cells**: 50 prescribed role/opponent/capability cells × five
policies, each continued for 2, 5 and 8 s. These are paired mechanism probes, not
250 independent matches. Every cell additionally repeats the complete eight-second
trajectory without observers and requires an identical full-state hash.

Fullbacks compare attacking/inverted/defensive roles with and without cover. Wingers
compare traditional/inside/playmaker against low/high blocks, slow/fast fullbacks and
available overlap, repeated with fast less-technical and slower technical profiles.
Strikers compare target/false-nine/advanced roles against two structures. Midfielders
compare deep playmaker/box-to-box/controlling/creative ten in buildup and transition.
Receipts retain candidate plans/reasons, selected proposal, target, physical capability,
position/velocity, contact/pass/shot/combination facts and short continuation.

These probes establish actual movement and consideration differences, not that every
new invitation is chosen or completed. Aerial involvement, back-to-goal play and complete
role passing networks are not calibrated population outcomes. Canonical player-ID pass
edges and role/time histories remain available; do not apportion an entire player's
match totals to their final role after an explicit switch.

## Strength cohorts and real references

[Frozen fixture manifest](performance/PR179-fixture-manifest.json) declares strength
before play: 0.85 effective starting-XI quality plus 0.15 available bench quality in
the native senior population. Effective slot quality includes position/duty fit;
selection respects injury/availability. Population upper/lower quartiles define strong
and weak. All experimental inputs are fresh and fit, so fatigue is held equal, not
invented as another strength difference. Actual formation-specific XI strength is
retained separately. No tier or expected winner is inferred from a score.

Six development designs comprise two SS, two SW and two WW; every policy receives
the same complete state/session, seed, formation, attributes, tactical preferences,
venue/presentation and fitness. Twelve genuinely new heterogeneous PR180 designs
(four per tier) are materialised and hashed but **never simulated in PR179**.

[Exact recomputed intervals](performance/PR179-reference-intervals.json) use the
original frozen StatsBomb Open Data commit `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`.
Linear empirical interpolation uses index `(n-1)*p` over each chronological twelve-match
sample. Original licensing, attribution, event-file hashes and provenance remain in
PR171/PR175; historical receipts are unchanged.

| Full match, both teams, P10–P90 | World Cup 2022 | Bundesliga 2023/24 |
| --- | ---: | ---: |
| Non-cross passes | 893.5–1195.9 | 1067.1–1244.7 |
| Shots | 13–30.6 | 16.4–30.9 |
| Corners | 5–12.9 | 6.1–14.8 |
| Fouls | unavailable | 14.4–26.9 |

These are broad external context, not acceptance bands for each simulated match.
Real samples have no validated SS/SW/WW labels. World Cup FIFA playing-time context
is not combined with these event samples into a fabricated live-minute rate. Incomplete
non-cross passes can be derived exactly from the frozen completion counts, but are
not equated with MFL controlled-possession losses. The files do not supply equivalent
event-level miscontrol/dispossession/tackle/recovery ledgers; no incompatible raw sum
or arbitrary online average is substituted.

## Full-match findings and candidate selection

<!-- PR179_RESULTS -->
**30/30 full-time matches pass canonical statistics/state invariants**, with identical
input/session hashes within each five-policy fixture. The six designs, not the thirty
executions, are the experimental units. [All pairs and tier splits](performance/PR179-policy-comparison.json).

| Per full match, both teams (mean) | Legacy | B | R1 | R2 | R3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Passes | 1906.33 | 1737.67 | 4033.50 | 3117.00 | 4005.17 |
| Physical shots | 1.50 | 11.50 | 2.50 | 2.33 | 3.00 |
| Possession losses | 251.17 | 593.67 | 556.17 | 483.17 | 528.17 |
| Fouls | 11.00 | 29.50 | 25.17 | 20.67 | 18.67 |
| Maximum consecutive hold, seconds | 4.875 | 1675.05 | 2.175 | 2550.525 | 2.700 |
| Exposed recoveries with >=10 m controlled progress (cohort total) | 76 | 188 | 74 | 86 | 81 |

R1/R3 remove very long holds in this cohort but roughly double legacy passing.
Their shot creation remains sparse and controlled transition progression falls well
below B. R2's SS1 hold is a separate major failure. B generates more shots and useful
controlled transition progress here, alongside long holds, fragile weak-team execution
and very uneven SW shot counts. More B losses are not themselves the rejection reason.
The SW shot imbalance is descriptive, not an automatic regression or a requirement
to impose shot/possession parity on a strength mismatch.

The two SW designs distinguish native squad quality: B finishes 3–0 and 8–0, R3 0–0
and 3–0; these are descriptive paired outcomes, not mandated winners. Weak teams have
recoveries/progression but their dangerous finishing is not established. SS and WW
remain markedly heterogeneous. All individual zeros and outliers stay in the table.

**No new policy establishes better overall football. Retain R1 and R3 as the two
conditional PR180 research candidates**, since they expose role-consequence-only
versus phase/intent cooperation without encountering the R2 stationary sink in their
six cohort trajectories. They still fail its frozen-state replay above. Their
advancement requires correction of recycling and matched decision horizons first;
neither is a release recommendation. Preserve R2 as a diagnostic ablation and B as a
mandatory control. This is a multi-dimensional judgment, not a lowest-turnover ranking.

More incomplete passes, losses, missed shots, counters or weak-team low possession
are never automatic rejection rules. Loss contexts include area, attempted action,
role, capability, pressure, sampled alternatives, actual recovery and subsequent shot
IDs within ten seconds. This is temporal lineage, not proof the attacking decision
caused a later shot. Exposed recoveries and actual controlled ten-metre progression
are distinguished from all possession changes.

Per-team official statistics, shot distances/outcomes, stoppages, positional samples,
passing edges, action distributions, possession durations and transitions are retained.
Counts come from canonical IDs/decisions, not repeated observer frames or animations.
Role-target conflict diagnostics are one-second samples, not independent conflict events.
Fixture-level distributions and tier splits keep the paired design visible.

## Match Lab, browser checks and JSON contract

Open **Pojedynczy mecz [DEV]**, choose teams, seed and one of the five policies.
The policy and fixture identity are visible during the match. **Powtórz te same składy
i seed** clones the complete original session, changing only the policy; it does not
regenerate squads. **Restart — ten sam seed** also clones the frozen session.
In **Role taktyczne i zmiany instrukcji**, explicit role and existing team-style changes
can be made live or at halftime. Roles remain guidance, not guaranteed teammate passes.

**Eksportuj eksperyment ról JSON** exports `mfl-role-experiment-v1`: policy/revision/runtime,
seed, teams/formations, complete frozen inputs, initial/final roles, adjustments, result,
official and canonical statistics, positional involvement, pass types, shot diagnostics,
loss areas/consequences, transitions, stoppages, possessions and bounded meaningful
trace. Selected actions and physical releases are separate. Top rejected alternatives
are sampled from the actual ranker, never recomputed from a later displayed frame.

The default trace keeps the last 1024 meaningful entries; hold detail keeps 128 episodes.
Omitted counts and whole-observation totals/maximums are explicit. Existing full debug
capture and session benchmark exports remain available. This is not an unbounded
frame dump or an assertion that a bounded tail contains every historical alternative.
Build metadata includes the Git revision and source digest; restart a dev server after
source edits before a frozen manual comparison. The source hash in research receipts
identifies the measured working tree, not an unmodified parent commit.

Actual browser tests use a fresh fixture, R2 through full time, a halftime target-forward
to advanced-forward change and pressing to low block/counter change, followed by R3
with the same frozen inputs. Browser exports and the verification receipt are retained
under `pr179-evidence/`. These two visual runs are exploratory, not an independent cohort.

The original accelerated R3 run exposed repeated React development warnings. The
renderer reports successful frames through the existing lifecycle callback; the controller
previously notified React even when lifecycle remained `ready`, feeding a rendering loop.
An idempotence guard now notifies only actual lifecycle changes, with a regression test
covering repeated successful frames and context loss/restoration. Original browser
warnings and receipts remain preserved, separately from the post-fix browser follow-up.
The fresh-server follow-up reaches full time with no console warnings/errors and
identical complete canonical statistics, official statistics and frozen inputs to the
original R3 run. Subsequent UI changes add accessible names and restrict the experimental
policy metadata to Match Lab. The final integration selectors identify presentation
sensitivity and match clock by their explicit
names, independently of the new replay-policy selector and policy metadata paragraph.

A separate short responsiveness probe performs six role-panel toggles paused and six
at the selected 16× multiplier: all twelve visibility checks pass, with round trips of
275–286 ms paused and 279–499 ms running. These include the browser automation bridge
and DOM confirmation; they are not isolated input latency or proof of 16× throughput.
See [the raw probe](performance/pr179-evidence/browser-responsiveness.json).

## Performance, determinism and verification

Role allocation is bounded to two sweeps; extra invitations are capped at three and
the total remains 48. Role movement runs on existing tactical replanning, not a new
physics tick rate. Observation is enabled in Match Lab or an explicit offline scope;
normal career stepping has no active ranking sink. Core logic remains React-independent.

Concurrent cohort CPU/wall and sampled RSS/heap are provenance, not reliable policy
cost ratios. Separate serial full-match trials report decision candidate/value spans,
movement calculations and full-match cost. Inclusive sampled profiler spans overlap
and must not be summed as exclusive CPU. Sampled memory is not a true allocation peak.
One design cannot establish league-wide throughput. Role-assignment microcost and
browser responsiveness are reported separately where measured.

[Serial performance receipt](performance/PR179-performance.json), same native SW2 input:

| Complete observed/profiled policy | Process CPU s | Wall s | CPU / legacy |
| --- | ---: | ---: | ---: |
| Legacy | 130.000 | 228.276 | 1.000 |
| B | 208.266 | 187.421 | 1.602 |
| R1 | 172.594 | 152.361 | 1.328 |
| R2 | 174.390 | 154.460 | 1.341 |
| R3 | 176.952 | 157.356 | 1.361 |

All five complete final-state hashes match their cohort counterparts. A sixth full
R3 trajectory with observers/profiling disabled also matches the complete hash and
223674 ticks (173.719 CPU s, 154.035 wall s). This one-cell comparison gives about
1.86% observed CPU overhead; it is not a universal observer budget. Allocation of
both teams' roles takes median 0.302 ms and P90 0.647 ms over 200 repetitions.
Sampled RSS ranges approximately 384–445 MiB across the observed trials.

The legacy wall-time outlier does not imply that the more complex policies improve
engine throughput. OS scheduling/host activity and incidental artifact checks can
affect elapsed time. No competing simulation/test workers run during these trials;
process CPU, workload-dependent candidate counts and inclusive component spans are
the more useful evidence. Policies generate different football workloads, so neither
CPU nor wall ratios isolate the cost of one scoring function alone.

Focused tests cover validated catalogue/allocation, cover/condition, attribute
counterfactuals, live movement, role invitations, phase changes at identical ball
coordinates, repeatable ranks, normalised branches, actual physical release parity
across all five policies, human/loose/restart priority and dominant open-goal shots.
The complete existing verification command remains `npm run verify`; no test,
timeout, assertion, dependency or CI budget is weakened.

The first concurrent verification attempt contained a new test that looked for a shot
diagnostic before the canonical flight observer creates it; the corrected assertion
checks actual released ball/shot/velocity. A pre-existing five-second statistics test
also exceeded its timeout while research workers were competing for CPU. The failed
attempt is retained; final verification runs after research workers stop.
The next full run passes all 1920 unit tests but exposes old integration selectors that
choose the first navigation select/paragraph. After adding the replay policy and its
metadata these identify the wrong controls. Explicit accessible names fix the selectors;
all 21 background orchestration tests then pass without changing their assertions.

The final unchanged `npm run verify` is **PASS: 1981 tests** (1920 unit, 52 match
integration, 4 career-match contract, 5 full-career), ESLint, TypeScript and production
build. [Verification receipt](performance/PR179-verification.json) retains the final
compressed log and earlier attempts. A final targeted lint also covers the UI selector
and receipt-validator edits. The [receipt audit](performance/PR179-receipt-validation.json)
passes all 30 full-match envelopes, 250 observer equalities, five serial/cohort state
equalities, the full-match R3 observer equality and 51 indexed evidence artifacts.

## PR180 blueprint and required answers

Freeze the candidate source and measurement definitions before opening the twelve
reserved designs. First correct decision/continuation horizon consistency, diagnose
remaining no-support/pressure sinks and validate continuity from invitation to actual
receipt and next useful action. Develop substantive coach evaluation from observable
match facts, complementary role changes, halftime adjustments and role-sensitive
substitutions. Preserve human ownership, legal restart and goalkeeper state.

Evaluate attacks, cover, risk purpose and failure consequences independently. Use no
single arbitrary realism score. Only promote a policy after fresh SS/SW/WW outcomes,
credible opportunity-to-physical-shot conversion, diverse attacks, absence of prolonged
nonproductive holds, lawful deterministic completion, human/career contracts and an
acceptable measured cost. Combining parts of R1/R2/R3 remains a hypothesis.

| # | Required question | Answer |
| --- | --- | --- |
| 1 | Existing mechanisms reused? | Preferences/duties, positioning, space passes, combinations, threat memory, transitions, readiness, movement authority and canonical execution/accounting. |
| 2 | New primitives? | A small shared role instruction vocabulary and role-specific endpoint consequences/receiving invitations; no new physical skill. |
| 3 | Same athlete, different roles? | Yes: fullback/winger/striker/CM counterfactuals retain the body and produce distinct targets and actual continuations. |
| 4 | Attribute suitability? | Yes: role-relevant attribute means and condition; physical execution still uses existing skills. |
| 5 | Complementarity? | Bounded neighbour/cover/depth scoring; not eleven independent best-role choices. |
| 6 | R1 substantive? | It values actual wide/central/shot/cover consequences in both before and after states; whole-match football quality still fails. |
| 7 | R2 new opportunities? | Yes: extra physically planned invitations plus changed movement; candidate creation is not guaranteed reception. |
| 8 | R3 phases? | Yes: ownership/exposure/organisation-aware phases change value and movement authority. |
| 9 | Strong/weak distinguishable? | Predeclared native strength differs; paired SW outcomes and team statistics are retained without imposing winners. |
| 10 | Weak transitions? | Exposed recoveries and controlled progression are measured separately by team; robust dangerous finishing is not established. |
| 11 | Useful risk allowed? | Yes. Physical feasibility and contextual branch consequences decide; no turnover quota. |
| 12 | Contextual losses? | Area/purpose/role/attributes/pressure/alternatives/recovery and subsequent shot IDs are recorded; temporal links are not causal proof. |
| 13 | Pathological holding avoided? | No: inherited hold improves in role probes, but R2 has a severe new full-match hold and all four reform policies fail its physical-readiness replay. Strict flags are conservative. |
| 14 | Live role change? | Actual browser halftime change and controlled movement/candidate tests; no granted ability. |
| 15 | Shape and cover? | Shared shape/press/marking and emergency/contact authority remain; role overlaps require available cover. Population defensive quality remains unvalidated. |
| 16 | Varied attacks? | Several mechanisms execute, but excessive recycling and sparse shots prevent a realism claim. |
| 17 | Credible chances to shots? | Actual selections/releases/outcomes are separate; dominant open-goal physical tests pass, cohort conversion remains limited. |
| 18 | Skills in execution? | Same explicit pass has identical canonical release under all five policies; exchanged capabilities retain different physical envelopes. |
| 19 | Real intervals interpreted? | Frozen small-sample descriptive quantiles, no forced targets, invented strength labels or mixed live-minute denominator. |
| 20 | Better/worse evidence? | Paired full-match table plus 250 controlled cells; less holding alone is insufficient and no general superiority is established. |
| 21 | Two PR180 candidates? | See the explicit development selection below; advancement is for independent research, not release promotion. |
| 22 | Hybrid preferable? | Phase/role cooperation is plausible, not independently demonstrated as superior. |
| 23 | Cost? | Full-match CPU/wall/memory and inclusive spans are retained; separate serial comparisons avoid concurrent-run ratios. |
| 24 | Five matched replays? | Yes, through the visible Match Lab policy control with a cloned original session. |
| 25 | Exports complete/labelled? | Zod-validated canonical summaries with policy/input/role metadata and explicit bounded trace coverage; no animation inference. |
| 26 | Coaching next? | Observable feedback, bounded autonomous adjustments, role-sensitive substitutions, new frozen validation and failure-specific continuation repair. |
| 27 | Default promotion? | Fresh independent football-quality, laws, determinism, human/career and performance evidence; current evidence does not justify it. |

## Reproduction

Install locked dependencies, generate world data, then run from the repository root:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/preparePr179Fixtures.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr179Controlled.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr179Stagnation.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr179.mjs --policy=legacy-pr176 --out=../pr179-final-legacy-pr176
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr179.mjs --policy=state-value-v1 --out=../pr179-final-state-value-v1
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr179.mjs --policy=role-value-v1 --out=../pr179-final-role-value-v1
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr179.mjs --policy=role-intent-v1 --out=../pr179-final-role-intent-v1
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr179.mjs --policy=phase-role-hybrid-v1 --out=../pr179-final-phase-role-hybrid-v1
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/reportPr179.mjs
npm run verify
```

Run serial performance trials with other simulation/test workers stopped, using
`benchmarkPr179.mjs --serial --ids=pr179-dev-sw-2 --out=<fresh-directory>` for each
policy. Partial/failed runs retain diagnostics and cannot pass as full time. Reusing
a receipt requires compatible source/harness hashes. The default full-match runner
only opens development designs, leaving reserved PR180 outcomes untouched.
