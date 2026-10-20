# PR178 — Physical Contact Resolution, MatchEngine Reform Validation & Policy Promotion

## Reproducible candidate and scope

Base: merged PR177 `f063363a3b2c0a77131da807dba6c26160e97a97`.
The published pristine reference `match-engine-legacy-pr176` resolves to
`df8e532ecf29d6c0a7e92ec241795a6a37250e1c` and is retained.
The final common-physics source fingerprint is
`145b111a81870ad3bfc8b3673599465006cf3c8dc861aa102682de497e3269ec`.
Fingerprints use the existing normalized PR172 source-hash method; they are
not Git commit IDs. [Baseline](performance/PR178-baseline.json) records the
unchanged merged source before editing. Historical PR175–177 receipts are preserved.

This change repairs shared collision lifecycle and one demonstrated aerial
continuity defect. Policy weights, candidate generation, readiness, movement
authority and the PR177 contact-accounting index are unchanged. No shot/goal
quotas, possession assignment, liveness timeout, save migration or heavy
dependency was added.

## Exact inherited failure

The original compressed input is
`performance/pr177-evidence/loose-contact-loop-input.json.gz`, whose decoded
state hash is `5dd675727630c61d2bd57ef01f1de912a70d38a93fd461231c0ffd15184c5fad`.
Both merged legacy and B reproduce 200 new contact identities in five seconds,
`9.215166776853878e-11` m horizontal movement and no possession recovery.
The original historical pristine result remains separately attributable to PR176.
See [before](performance/PR178-contact-loop-before.json),
[after](performance/PR178-contact-loop-after.json) and their tick traces.

Players `footballer_pro_3_19` and `footballer_pro_3_22` alternate fraction-zero
collisions. Bodies `_57_3` and `_57_5` also overlap the region. Initial overlap
is correctly detectable, but was repeatedly treated as a fresh impact. The old
short suppression covered only the last player, so the other player bypassed it.
The tiny horizontal displacement did not resolve sphere/body penetration when
velocity was predominantly vertical. Each collision discarded the remainder of
the physical step. Repeated gravity and damping approached a vertical velocity
near −0.63049 m/s with ball height near 0.41987 m while position stayed fixed.

The shot-continuation branch also called `makeLoose` repeatedly, resetting
`looseSince`/episode, then returned before legal acquisition. Body centres barely
moved despite desired locomotion velocities; treating desired velocity as actual
surface motion would inject an unsupported physical impulse. These mechanisms
interact: increasing a cooldown alone would leave the penetration unresolved.

## Physical repair and limits

`ballContactResolution.ts` uses the existing expanded sphere/capsule collision
geometry. A small geometric projection resolves penetration, constrained by the
grass plane. When a downward projection crosses grass, the horizontal radius
comes from the same sphere cross-section at ball-floor height. The singular
centre fallback uses opposite relative motion, then a deterministic axis.

The optional, Zod-validated `ball.continuousBodyContacts` records bodies still
supporting a continuous contact (at most the 22 players). A body re-arms only
after more than 1 cm geometric clearance. Another player remains eligible
immediately. Eight bounded support iterations remove penetration and inward
relative normal velocity without crediting another independent impact.
This is a lightweight continuation of the existing simulator, not a general
rigid-body momentum solver. Restitution is dissipative in the measured body's
rest frame; a separating linear velocity is neither reflected nor damped again.

Surface velocity comes from actual centre displacement divided by the physical
step, rather than desired locomotion velocity. The incoming flight is evaluated
at the detected contact fraction from the original flight state. Only the
remaining time is integrated after response, preserving spin/bounce history and
avoiding double gravity/drag. Zero-duration portions are not integrated.
The continuation checks the next body and the actual field boundary. The existing
one-new-impact-per-tick architecture remains; subsequent bodies are supported
without tunnelling and can produce a real impact on a later physical tick.

The original loose-ball start is retained, and legal acquisition is attempted
after physical resolution. Last touch, keeper-specific response, shot identity,
restart restrictions, offside and boundary adjudication continue through the
canonical paths. The algorithm neither selects a possession winner nor generates
a restart to escape the overlap.

In the final exact replay, legacy first reaches legal control at 1.6 s and B at
1.0 s. After five seconds there are 7/11 total canonical contacts and
15.156901/21.105185 m horizontal displacement respectively. These totals include
ordinary control/release events after recovery; displacement is observed, not an
acceptance quota. B subsequently reaches a natural corner to home.
The complete deterministic final hashes are legacy
`0e03a8fbcff07f181148ee59ce12348c245e87e05586489cd21f859fea9dca3e`
and B `28cb88da583a07cb30ac78364ddedd1569bc132e21ef7811c9f7ad805d5ef5d1`.

## Demonstrated corrections and rejected measurements

Development R1 fixed the inherited body loop, then a genuine floated-corner
sequence revealed headers at 51.075 and 51.250 s by the same player while
ball/player distance never exceeded 0.711 m. The existing aerial lock released
after 2.4 world metres despite co-motion. Removing only that world-distance
condition retains relative horizontal/vertical separation and immediate contact
by another player. Three of five new focused tests failed before this correction.

R2 included that aerial fix. Review then exposed a mistake in the new remainder
integration: the already full-step-integrated incoming velocity was integrated
again after a fraction-zero impact. A new regression failed with incoming speed
0.875679901 instead of the original 0.630489529 m/s. R3 partitions the physical
time correctly and passes that regression. No final validation fixture had been
opened before these corrections.

[Revision history](performance/PR178-development-revision-history.json) and the
compact R1/R2 diagnostic archives retain exact sources, prior receipts and failing
regression evidence. Those runs are consumed development evidence, not independent
final validation. An autonomous corner trace that recovered only after an
intervening throw-in was rejected as proof of a direct corner counterattack.
The later prescribed-corner experiment prescribes only an enumerated legal
delivery; it never chooses the header winner, possession winner or next AI action.

## Independent design and interpretation

[Fixture manifest](performance/PR178-new-fixture-manifest.json) contains four
diagnostic designs and twelve reserved final designs with new seeds, clubs,
formations, tactics, player attributes and fitness. They include youth/pro,
equal/unequal strength, possession/pressing/direct/low-block/high-line setups,
keeper quality, midfield shape, technique and pace variation. None is a reflected
duplicate. Input/session hashes reproduce without stepping the simulator.
A pre-step manifest correction replaced an unused `condition` field with actual
canonical `fitness`; no outcome had been inspected.

R1's four diagnostic designs were consumed before the two focused corrections.
The final R3 candidate repeats the keeper diagnostic across legacy/A/B and the
historical strong/weak case across all three, with a complete B observer-off
replay. Only after those smokes does `freezePr178.mjs` freeze source, harness,
policy, observer, input archive and hardware fingerprints. Twelve previously
unused designs then run to canonical full time for each policy. No policy tuning
is allowed after opening that set. 7200 s is a failure censor, not completion.

The independent sample unit is a fixture (12 paired validation designs), not its
two teams, frames, contacts, decisions or possession episodes. Descriptive team
rows are explicitly dependent. Paired 4000-draw seeded bootstrap intervals are
exploratory, conditional on these heterogeneous fixed designs; they are not a
league-population confidence guarantee. The one final development design has no
inferential interval. Historical one-fixture repair contrasts do not estimate an
engine-wide distributional effect.

Possession, credible owner decisions, incoming decisions and actual releases
are separate stages. A first-time or restart shot need not have an owner-ranker
decision. Generated/executable shot candidates are not synonymous with a credible
chance. Opportunity categories and scoring expectation are model diagnostics,
not calibrated real-world xG. Each release retains canonical shot, actor, choice,
episode and restart lineage when applicable; a shot can have an early block and
a later final outcome without becoming two independent shots.

## Historical physics contrast

On the identical `pr177-dev-strength` input, fixed legacy retains 1565 passes,
7 shots, 5 goals and 3591 contacts. A retains 1731 passes, 1 shot, 1 goal and
3869 contacts. B changes from 251 passes, 7 shots, 2 goals and 104723 contacts
to **671 passes, 12 shots, 4 goals and 1519 contacts**. These are common-physics
repairs with unchanged policy weights. They are not new evidence that B's AI
improved between PR177 and PR178. In this one design, 420 additional B passes
restore about 32% of the old 1314-pass legacy/B gap; this descriptive coupled
contrast cannot identify an engine-wide fraction of tactical passing differences.
[Full three-reference baseline](performance/PR178-physics-baseline.json).

Historical full-match rows retain their own PR177 source fingerprint
`e0054db4…`; they are not relabelled as newly measured merged-source runs.
The exact merged frozen-loop baseline is `33138592…` and additionally contains
PR177's accounting-index optimization, whose canonical equivalence is documented
in PR177. That optimization remains unchanged here. Both historical provenance
and the actual PR178 parent/source are preserved in the receipts.

## Final independent football results

All **36/36 held-out policy runs reach canonical full time** on the frozen R3
source. Together with the final keeper diagnostic, that is 39 new complete
policy runs on 13 new independent designs. Historical smoke contributes another
three policy runs, not three new designs. The abandoned initial scheduling of
validation was restarted as six disjoint batches of six fixtures for throughput;
source, input, harness and selected designs did not change, and incomplete prefixes
are not counted as extra samples. [Freeze](performance/PR178-validation-freeze.json),
[paired rows/distributions](performance/PR178-policy-comparison.json),
[compressed evidence index](performance/PR178-evidence-index.json).

The table contains validation match means, combining both teams within each
independent fixture. Completion is the mean of fixture percentages.

| Metric, 12 independent fixtures per policy | Fixed legacy | A | B |
| --- | ---: | ---: | ---: |
| Pass attempts | 1827.4 | 2024.2 | 1228.4 |
| Completion | 78.63% | 76.78% | 57.80% |
| Controlled forward passing metres | 5703.5 | 6036.8 | 3186.9 |
| Controlled final-third episodes | 44.8 | 47.3 | 80.8 |
| Penalty-area control episodes | 3.92 | 4.42 | 4.17 |
| Credible-opportunity episodes | 1.25 | 1.75 | 1.67 |
| Credible owner decisions | 3.25 | 4.58 | 7.92 |
| Physically released shots | 1.83 | 0.75 | 4.25 |
| Goals | 1.08 | 0.58 | 1.08 |
| Exposed recoveries with ≥10 m controlled progress | 7.92 | 8.25 | 24.58 |
| Player-credited possession losses | 215.3 | 233.4 | 409.3 |
| Corners | 0.67 | 0.33 | 0.25 |
| Longest possession episode, median seconds | 161.6 | 186.8 | 769.8 |

B's paired controlled-transition improvement is +16.67 per fixture, exploratory
95% bootstrap interval **[10.67, 22.75]**. Completion changes by **−20.83 percentage
points [−23.48, −18.08]**, and controlled forward passing metres by
**−2516.6 [−3383.7, −1724.8]**. Credible episodes change by +0.42
**[−1.08, 2.25]**; shots by +2.42 **[−0.58, 6.25]**; goals by 0.00
**[−0.75, 0.83]**. The creation/shot differences are not robust across these
fixtures, while greater transition progress survives every paired design.

B releases 51 shots, but 38 are concentrated in three designs (22 direct
strong/weak, 8 low-block strong/weak, 8 press-escape). Seven of twelve B designs
have **zero credible episodes**, compared with four legacy designs. Seventeen of
B's twenty credible episodes occur in only two designs. One attractive 5–0 match
therefore cannot establish general realism. Aggregate B goals remain 13, exactly
the legacy total. A's 9 shots/7 goals do not justify promoting A either.

### Possession-to-shot lineage and outcomes

Across validation, legacy/A/B have 45/62/100 credible decisions, including
39/55/95 owner decisions and 6/7/5 incoming decisions. Selected shot actions are
20/8/47, and every one links to a physical release. Total releases are 22/9/51;
the 2/1/4 additional releases are penalties outside the owner/incoming ranking
hook, not missing ordinary decisions. Credible release contexts are 17/9/20.
B's actual contacts comprise 39 settled kicks, 10 first-time kicks and 2 half
volleys. No actual headed shot occurred in these validation fixtures; aerial
capability is established separately by the physical corner/header regressions.
[Funnel](performance/PR178-possession-to-shot-funnel.json),
[per-shot geometry/outcomes/lineage](performance/PR178-shooting-outcomes.json).

Final diagnostic outcomes for B are 13 goals, 14 misses, 13 saves, 10 blocks and
one post. The official accounting records 16 keeper saves and four initial
blocked-shot outcomes. Three parried shots later have a final `block` diagnostic
(two `parry_away`, one `parry`), explaining the 16 versus 13 saves. Statistics
credit the first outcome once; later physical continuation can change the final
diagnostic of that same shot. Final trajectory outcome, earlier keeper intervention
and subsequent body contact are different observables; these totals must not be
added as independent shots. Canonical shot IDs, original contact attribution and
statistical invariants are retained. Physical catch/parry, unreachable keeper,
frame priority and exactly-once tests pass; these small, highly heterogeneous
outcome counts are not a real-world shooting calibration.

### Passing, first touch and meaningful continuation

B attempts 14741 passes versus legacy's 21929 and A's 24290. Forward intended
passes are 7586/7423/8837 (B/legacy/A), but completed forward passes are
3537/5818/6544 and their controlled metres are 38243/68442/72441.
B's 1197 reciprocal passes are fewer than legacy's 1441, yet their share of all
passes is **8.12% versus 6.57%**. Lower absolute recycling is not established as
a football improvement: reduced passing, turnovers and long holds confound it.

The 57 prescribed scenarios and 56 straight/diagonal, covered/uncovered,
ground/lofted deliveries retain actual launch plans, execution error, interception
and reception. A receiver starting at rest obtains real run proposals and moves
under canonical locomotion. The two selected stationary-winger continuations
are intercepted; diagonal and covering-defender alternatives include genuine
completions. Viable planning is not guaranteed successful delivery.
[Controlled summary](performance/PR178-controlled-summary.json),
[reception continuations](performance/PR178-regressions.json),
[autonomous passing/reception](performance/PR178-passing-and-reception.json).
Reception-to-next-release is already a duration in the existing observer; the
report uses that duration directly, rather than subtracting the absolute reception
time again. This reporting correction does not alter the frozen simulator or runs.

Recorded same-episode reception-to-next-pass pairs have descriptive mean delays
1.825/1.855/2.821 s (legacy/A/B; 16606/17895/5440 pairs). Receptions without a next
pass are excluded, so these means cannot represent unreleased long holds.
Same-team pass-release cadence averages 6.024/5.425/8.305 s and includes intervening
stoppages/holds. Ground/lofted-through execution modes complete 1098/1413,
1248/1674 and 289/500 deliveries. This execution-mode grouping does not isolate
the new independent prospective-run candidate mechanism, and these dependent
event counts are not independent fixture samples.

Completed combinations number 52/73/79 for legacy/A/B; only 1/0/3 link to a
subsequent actual shot. B additionally has 206 contact-failed and 138 expired
combination attempts. More recorded combinations do not establish reliable
attacking continuation. [Combination lineage](performance/PR178-combinations.json).

### Counterattacks, weak teams and physical recovery

Exposed recoveries total 1233/1309/1883, with 592/597/1375 forward attempts and
95/99/295 continuations achieving ten controlled metres (legacy/A/B). Unsuccessful
attempts below five metres remain common: 381/373/928. Forward intention is not
counted as completed progression. The prescribed floated-corner and physical
blocked-shot traces include real release, aerial/body contact, recovery, selected
continuation, defender motion, stoppage and failed transition outcomes.
[Counterattacks](performance/PR178-counterattacks.json),
[legal corner traces](performance/PR178-physical-transitions-prescribed.json),
[autonomous traces](performance/PR178-physical-transitions.json).

Only recoveries starting with fewer than five covering opponents are eligible
for "defence regained five cover". There are 644/657/704 eligible events and
390/397/454 recoveries, with descriptive event-weighted delays 1.85/1.81/1.54 s.
These are movement observations inside an eight-second window, not independent
fixture samples or proof that every defence is coherent. Opponent position/velocity
records remain in the compressed evidence. [Defensive recovery](performance/PR178-defensive-recovery.json).

Weak teams can physically break forward in prescribed geometry (B weak/strong
trace gains 16.5 m), but robust dangerous weak-team finishing is not established.
The two held-out strength mismatches finish 5–0 and 3–0 for the stronger home
team under B. Attacking structure works in some setups and fails badly in others.
The scenario named `rejected-counter` is a geometry label: its actual forward
continuation is reported, not relabelled as a successful conservative rejection.

### Positions, stoppages and controlled-possession stagnation

Actual central-midfielder runtime sums to roughly 6455/6443/6454 minutes across
the twelve fixtures (legacy/A/B), including actual substitutions. CM-associated
players receive 2402/3568/2840 recorded passes. B increases their forward-pass
and pressing involvement, but whole-player statistics are not allocated between
multiple runtime roles. Role-specific goals or receptions cannot be inferred
precisely for players who switch roles. The receipt explicitly separates actual
role time/movement from associated whole-player statistics.
[Positional involvement](performance/PR178-positional-involvement.json).

Canonical fouls total 100/96/211, throw-ins 79/54/74, corners 8/4/3, goal kicks
32/38/51 and offsides 1/0/0. Mean stopped time is 283.6/233.8/340.5 s and mean
live time 5252.9/5292.1/5190.8 s. Greater B stoppage time is largely accompanied
by more fouls, not more corners. Existing boundary, last-touch, offside and
restart restrictions remain authoritative. [Stoppages](performance/PR178-stoppages.json).

The important remaining failure is **controlled-possession stagnation**. B has
six fixtures with an episode exceeding twenty minutes; the worst is 2625.175 s
in `pr178-val-high-line`. Its median longest episode is 769.84 s versus legacy's
161.58 s. Across B validation there are 96388 selected holds. These are observed
decision counts, not independent samples. The historical B replay also has a
1177 s final possession from time 4403 to full time, with 2456 decisions, no
pass and little net territory. Near time 5579, `footballer_pro_57_4` owns the
ball, readiness has long elapsed, and hold outranks the available negative-valued
carries. This is a decision/pressure/outlet problem, not the repaired duplicate
impact loop. Long-possession analysis was added after that diagnostic discovery;
it changes neither source nor held-out inputs. Detailed sampled rankings within
long possessions are preserved in the compressed records.

## Promotion and readiness decision

**Do not promote B. Keep `state-value-v1` experimental; retain the existing
`legacy-pr176` default. Canonical football is NOT READY for PR180 calibration.**
This does not endorse legacy realism: its excessive pass volume, few chances and
high goal/shot ratio also fail as a statistical reference. B's transition progress
is a real independent improvement, and the shared physical repair is accepted.
The rejection follows the held-out losses in completion/controlled passing,
concentrated chance creation and severe controlled-possession stagnation, rather
than a preference for conservative play. No hidden legacy layer was added to B.

The smallest corrective sequence before PR180 is:

1. Reproduce the long controlled holds by fixture/time/decision ID; inspect
   executable outlets, hold/carry ranking and opponents' physical pressure response
   together. Fix the demonstrated mechanism, without a forced-pass timeout or a
   blanket hold penalty. Require bounded meaningful continuation in those exact
   traces and ordinary ball retention where justified.
2. Trace the loss-heavy forward deliveries and failed/expired combinations from
   actual release to run, finite contact and next action. Repair demonstrated
   outlet/support/preparation inconsistencies, then test final-third entry through
   credible opportunity and real shot, including weak-team transitions. Do not
   increase shot propensity to compensate for missing chances.
3. Re-freeze and use a genuinely new cohort after any gameplay correction.
   These twelve validation designs are now consumed. Promote/calibrate only when
   useful progression, chance creation, turnover geography and tail possession
   behaviour hold across setups. This is a prerequisite check, not another broad
   world/UX rewrite.

Physical contact identity, deterministic stepping, canonical result accounting
and explicitly labelled hybrid coverage can be used downstream as contracts.
Shot/goal/corner rates, turnover rates, positional scoring shares, style effects
and autonomous match distributions cannot yet be used as summary targets.

## Career, human agency and deterministic integration

The actual browser research build uses B via an asserted Vite default-literal
override, with all other R3 source unchanged; the production default is not changed
to conduct the experiment. A fresh youth career fixture includes controlled carry
at 04:03, completed manual pass at 04:06 and a physically credited technical free
kick at 08:22. A 05:00 incoming-header attempt did not produce a shot and is
explicitly not counted as the successful shot smoke. Simulate Remainder returns
to career with 0–0 and one appearance; reload retains the same single result.
The following Sep12 fixture and subsequent calendar fixtures are recorded normally.
Those later fixtures and the summary remainder are not claimed as canonical
full-match samples. [Browser receipt and screenshots](performance/PR178-browser.json).
The [exact research Vite configuration, hash and launch command](performance/pr178-evidence/browser-config.json)
are retained; only the default-policy export is overridden for this browser run.

Two additional complete B canonical careers cover youth/professional participation,
deliberate human actions, schema/JSON reload continuation, substitutions, duplicate
commit as a no-op, final save reload and next-fixture progression. Their separate
hybrid prefix/remainder checks preserve the explicit statistical coverage contract.
[Career receipt](performance/PR178-career.json).
The historical full B replay is identical in complete final-state hash and tick
count with the full ranker/event observer enabled and disabled.
[Observer equivalence](performance/PR178-observer-equivalence.json).

## Regression coverage, performance and final verification

New focused coverage contains 36 tests: 15 body-contact/time integration, five
relative aerial continuity, twelve boundary/last-touch/clearance tests across both
policies and both halves, and four real keeper catch/parry-into-traffic cases.
The keeper scenarios credit one save/shot and permit a subsequent real attacker touch;
they do not assign possession to force the outcome. Existing frame, goalkeeper,
rebound, offside, restart, statistics, career and human-action assertions remain
unchanged. [Twenty-case coverage map](performance/PR178-contact-resolution-regressions.json).

The serial experiment runs after the cohort/career/test workers stop, on the same
AMD Ryzen 7 260 / 16 logical CPUs / 32 GB host, Node v24.19.0. Each trial has the
same sparse profiler, warm-up and physical step. Disabled hooks remain installed
in plain trials; observed trials enable full ranker/incoming/component/event
capture. The measured interval covers stepping/live observation; final snapshot,
hashing and evidence serialization are outside it.

| Complete serial trial | CPU seconds | Wall seconds | Sampled peak RSS / heap, MiB |
| --- | ---: | ---: | ---: |
| Historical strong, legacy plain | 137.30 | 125.27 | 399.5 / 191.5 |
| Historical strong, B plain | 145.75 | 140.75 | 409.3 / 186.7 |
| New keeper, legacy plain | 133.31 | 128.29 | 423.4 / 199.0 |
| New keeper, B plain | 159.56 | 152.46 | 419.3 / 197.3 |
| Historical strong, B full observer | 155.16 | 149.89 | 429.2 / 215.8 |
| New keeper, legacy full observer | 143.10 | 139.09 | 567.0 / 350.0 |

B/legacy CPU ratios are **1.0616** and **1.1969**; wall ratios **1.1235** and
**1.1884**. Full observation adds **6.45% CPU / 6.49% wall** to the B historical
trial and **7.34% CPU / 8.42% wall** to the keeper legacy trial. All six complete
final hashes match their separately measured full-ranker reference, including
profiler and observer variants. Five exact high-contact repeats per policy all
match the exact repair regression hashes; mean CPU is 206.4 ms legacy / 228.2 ms B
for five physical seconds, with mean wall 183.6 / 208.9 ms.

Inclusive, sparsely sampled spans identify movement as the largest measured
component (B approximately 54.7/53.7 s); candidate generation 19.5/16.4 s,
valuation 12.9/23.6 s and statistics 9.3/10.0 s. New CCD/support spans are small
in these sampled match trajectories, but rare impact sampling cannot establish a
reliable collision-only ceiling. Ordinary acquisition and full ball physics are
separate components; unmeasured categories are not zero. Inclusive spans must
not be summed as exclusive CPU percentages. The receipt preserves every component,
late checkpoint, sampled memory value and stress repetition.

This is one warm trial per cell on two designs, not a league benchmark or a
confidence interval for general throughput. Policies generate different action
workloads; B's historical trial includes its controlled-hold deficiency. Sampled
memory is not a true allocation peak, and OS process high water spans preceding
trials. There is no measured inherited contact-led late explosion in these runs;
cheap late held possessions are not evidence of correct football. Concurrent
cohort timings are not used for ratios. [Performance](performance/PR178-performance.json).

**Final unchanged `npm run verify`: PASS — 1954 tests (1893 + 52 + 4 + 5),
ESLint, TypeScript project build and Vite production build; exit code 0.**
[Verification and complete logs](performance/PR178-verification.json).
The first attempt passed all tests but its build caught an invalid `sourceAction`
literal in the new boundary-test fixture. After correcting only that test tag,
the same complete command was rerun successfully. The frozen production source
and all held-out match evidence remain unchanged. No existing test timeout,
assertion, package script or dependency was weakened.
An additional artifact check validates 42 indexed match receipts and compressed
hashes, 692 state-value outcome envelopes, both career result schemas, all six
serial full-state references, ten exact stress repetitions and 39 nonnegative
reception-duration summaries. [Receipt validation](performance/PR178-receipt-validation.json).

## Required answers

| # | Question | Evidence-based answer |
| --- | --- | --- |
| 1 | Exact reproduced state? | Original decoded hash `5dd67572…`, full 200-tick replay, same players/velocities/shot continuation as merged PR177. |
| 2 | Repeated identities caused by? | Reprocessing unresolved fraction-zero overlap as a new impact on each tick. |
| 3 | Why did the lock fail? | Last-player-only suppression lets two overlapping bodies alternate; aerial world-distance lock separately re-arms during co-motion. |
| 4 | Insufficient separation? | Yes: a horizontal epsilon cannot resolve predominantly vertical sphere/body penetration. |
| 5 | Normal/rebound contribution? | Yes: separating overlap was damped again; desired body velocity differs from measured motion; discarded continuation traps position. R3 uses relative normal response and correct time partition. |
| 6 | Multiple bodies? | Four nearby bodies participate in the original region; two alternate recorded impacts. Two/three moving-body variants also pass. |
| 7 | Ownership/episode reset contribution? | Repeated `makeLoose` resets loose start/episode and early return prevents acquisition. Original loose start and canonical acquisition are now retained. |
| 8 | Implemented solution? | Geometry/floor depenetration, per-body continuous support, clearance-based rearm, measured relative response, contact-time incoming flight and remaining-time continuation. |
| 9 | Natural escape/control? | Exact input obtains legal control at 1.6 s legacy/1.0 s B; B later reaches a naturally adjudicated corner. |
| 10 | Legitimate consecutive impacts? | Immediate other-player contact and same-player recontact after relative separation pass; no blanket timed suppression. |
| 11 | Keepers/blocks? | New actual catch/parry-to-attacker tests pass under both policies, alongside unchanged close-block/unreachable-keeper/frame tests. |
| 12 | Last touch/restarts? | Twelve new tests cover touchline and attacker/defender goal-line exits before/after real halftime; unchanged restart/offside laws remain authoritative. |
| 13 | Original loop demonstrably fixed? | 200 → 7/11 total contacts, real control and exact repeatable whole-state hashes; no displacement quota. |
| 14 | Legacy distribution changed? | Relevant paired historical design retains its football totals (1565 passes, 7 shots, 5 goals). One design cannot estimate the engine-wide repair effect. |
| 15 | B historical distribution changed? | Same historical input changes 251 → 671 passes, 7 → 12 shots, 2 → 4 goals; contacts 104723 → 1519. Broader source-level causal distribution is not inferred. |
| 16 | How much reduced passing was physics? | 420 passes restored, about 32% of this one historical legacy/B gap. The remaining gap and new fixtures show substantial decision effects. |
| 17 | More credible chances? | Validation 20 vs 15 credible episodes, paired +0.42 interval −1.08..2.25; seven B designs have zero. General improvement is not established. |
| 18 | More selected/released shots? | B 47 ordinary selected actions → 47 physical releases plus four penalties; legacy 20 + two penalties. B's 51 total is concentrated in three designs. |
| 19 | More plausible outcomes? | Finite save/block/frame/goal mechanics pass. B's 13 goals/51 shots and heterogeneous final outcomes do not establish calibrated football realism. |
| 20 | Long/through balls work? | Real plans/releases/errors/receptions/interceptions exist in 56 controlled deliveries and autonomous records; success remains highly geometry-dependent. |
| 21 | Stationary player can run? | Yes, independent proposals cause actual locomotion from rest; both selected stationary-winger continuations are intercepted, so no guaranteed completion is claimed. |
| 22 | More natural CM participation? | Actual CM role time is measured; CM-associated receptions 2402 legacy/2840 B and different forward/press activity. Natural positional scoring is not validated, and multi-role whole-player stats are not apportioned. |
| 23 | Useful continuation after combinations? | B completes 79/745 combinations; only three link to later shots, with 206 contact failures/138 expiries. Not yet reliable. |
| 24 | Strong-team structure? | Works in some held-out mismatches (5–0, 3–0), but controlled holds and setup dependence prevent general acceptance. |
| 25 | Dangerous weak-team counters? | Physical breakouts occur (prescribed B weak/strong +16.5 m), but held-out mismatches give the weak team no goals; robust dangerous finishing is unproven. |
| 26 | Real transitions after corners/blocks? | Yes in complete legal floated-corner and physical blocked-shot traces; intervening-restart examples are excluded as direct-corner proof. |
| 27 | Defenders recover physically? | B regains five-cover in 454/704 initially under-covered exposed recoveries, descriptive delay 1.54 s; actual opponent motion is retained. |
| 28 | Failed counters represented? | Yes: B 928 forward attempts fail to gain five controlled metres, with turnovers/stoppages/window endings recorded. |
| 29 | More genuine stoppages? | B stopped time 340.5 vs 283.6 s/fixture, accompanied by 211 vs 100 fouls; corners fall 8 → 3 across the cohort. No manufactured restart. |
| 30 | Reciprocal passing reduced for football reasons? | Absolute 1441 → 1197, but share rises 6.57% → 8.12%; reduction cannot be credited as better football. |
| 31 | Appropriate attacking risk? | Not established: completion −20.83 pp, losses +194.08/fixture and weak continuation are material adverse evidence. |
| 32 | What did independence reveal? | Positive controlled counter progress coexists with sparse/concentrated chances, costly turnovers and very long controlled possessions. |
| 33 | Improvements surviving validation? | Controlled counter progress: +16.67/fixture, interval 10.67..22.75. Shot/credible-chance/goal differences do not show the same robustness. |
| 34 | Rejected artifacts? | R1/R2 are consumed diagnostics; duplicate co-moving headers and double integration were corrected before holdout. A throw-in-interrupted corner and absolute reciprocal reduction are not improvement proofs. Reception duration reporting was corrected without altering any match. |
| 35 | CPU/memory cost? | Separate serial complete-match measurements, sparse component profiling, sampled memory and exact stress repeats are reported below and in `PR178-performance.json`; concurrent cohort timings are excluded from ratios. |
| 36 | Complete regression suite? | **PASS: unchanged `npm run verify`, 1954 tests, ESLint, TypeScript and production build, exit0.** Both verification attempts and the corrected test-only type error are retained. No existing timeout/assertion was weakened. |
| 37 | Human B career works? | Actual browser carry, completed pass, credited free-kick shot, remainder, return, reload and following fixture pass; separate youth/pro complete canonical careers also pass. |
| 38 | Exactly-once persistence? | Duplicate result application is a no-op after save/hydration in both careers; browser reload retains one Sep5 appearance/result, then advances normally. |
| 39 | Observer equality? | Full historical B final hash/ticks match with ranker/event observer on/off; serial profiler/full-observer repetitions additionally compare complete final states. |
| 40 | Promote B? | No. Keep B experimental and existing legacy default; decision follows adverse independent evidence, not conservative preference. |
| 41 | Canonical readiness? | **NOT READY** for summary calibration despite accepted physical repair and playable human integration. |
| 42 | Before PR180? | Resolve controlled-hold/outlet/pressure sink and fragile run/reception/continuation, then validate chance creation and tails on a new frozen cohort. Rates/positional scoring/styles remain unsuitable targets. |

## Reproduction

Use the locked dependencies and generated public world data required by the
repository. Standard commands run from the repository root. To regenerate the
final-source smoke directories before freezing, the following PowerShell loop
uses disjoint policy output folders and adds the complete B plain replay:

```powershell
$pr178Policies = 'legacy-pr176', 'risk-ablation-v1', 'state-value-v1'
foreach ($pr178Policy in $pr178Policies) {
  node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178.mjs --policy=$pr178Policy --ids=pr178-dev-keepers
  $pr178Eq = @()
  if ($pr178Policy -eq 'state-value-v1') { $pr178Eq = @('--equivalence') }
  node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178.mjs --policy=$pr178Policy --historical --ids=pr177-dev-strength --out="../pr178-final-historical-$pr178Policy" @pr178Eq
}
```

Then run:

```sh
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/preparePr178Fixtures.mjs --check
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178Contact.mjs
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/freezePr178.mjs
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178.mjs --policy=legacy-pr176 --split=validation
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178.mjs --policy=risk-ablation-v1 --split=validation
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178.mjs --policy=state-value-v1 --split=validation
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/reportPr178.mjs
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/packagePr178Evidence.mjs
node --expose-gc --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178Performance.mjs
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/validatePr178Receipts.mjs
npm run verify
```

Additional prescribed and career evidence uses the existing drivers without
overwriting their default historical receipts:

```sh
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr177Controlled.mjs --prefix=PR178
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr177Regressions.mjs --prefix=PR178
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178Transitions.mjs --prescribed
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr178Transitions.mjs
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr177Career.ts --prefix=PR178
node scripts/compactPr178Receipts.mjs
```

The freeze command also requires completed final-source development and historical
smokes as checked in its implementation. Performance runs must be serial with
other simulation/test jobs stopped. Research receipts preserve concurrent-run
timing only as provenance; policy CPU ratios use the separate serial experiment.
Raw evidence is compressed once, with compact linked summaries rather than
duplicate expanded decision streams.
