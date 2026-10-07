# PR156 — Agency Parity, Passing Difficulty, Central Connectivity & Possession Flow Calibration

Base: merged PR155 / `main`, `cdbf07e0696f95e17d9f064552e861cb5bff64e4`.
This is an integrity/calibration change to the existing engine. The canonical step
remains **0.025 s**. No role quotas, forced-pass timer, team-strength multiplier,
fatigue, substitutions, restart choreography or presentation feature is added.

## Confirmed defects and measured weaknesses

| Finding                                                                 | Evidence and correction                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Disabled controlled identity leaked into action source                  | The pristine PR155 one-minute all-22 comparison found first differences at 5.725 s / 18.9 s in action-source fields. Ordinary autonomous actions now retain `autonomous_npc` regardless of selected identity. The complete state, including sources and ledgers, stays in the parity comparison.                                                                               |
| Controlled non-throw restart could be delegated or released by fallback | A single `requiresHumanRestart` contract guards the canonical resolver, both stepping entry points and DEV delegation. Human projection bypasses option-count, repeated-situation and presentation gates. A rejected proposal returns the same state before ball/statistics/ledger/RNG work. Throw-ins retain their explicit exception.                                        |
| Overlap completion recomputed a later relationship                      | `receiverRelationshipAtRelease` is preserved on the pass identity. Attempts, completions and out-of-play outcomes use that same fact. Underlap/other relationships are also retained for downstream diagnostics. The resolved diagnostic takes precedence over its older launch copy.                                                                                          |
| Depth error did not change launch energy                                | A sampled longitudinal error used to change an objective without changing launch speed. Speed now scales continuously with sampled range demand; the canonical integrator determines the actual flight. An objective never snaps or settles a ball.                                                                                                                            |
| Low technical attributes were far too accurate at range                 | In 64 paired samples per cell, PR155 unpressured ground support passes completed 64/64 at every tested distance and every bundled ability, including 5–20. Mean 50 m execution error was only about 0.44 m at ability 10. The new continuous distribution gives the low end a broad, nonzero-tailed error envelope.                                                            |
| Airborne foot-control gap                                               | Ordinary control was attempted only after grounded flight, while the 0.20–0.65 m airborne branch supported incoming strikes. Low airborne reception now uses the same continuous physical contact resolver, clipped to reachable height and ordered against boundaries. This removed an inversion where more accurate aerial deliveries could fare worse than inaccurate ones. |
| Waiting created an aerial contact lock without a touch                  | A selected receiver waiting above control height could acquire a lock that suppressed the later real receive. Waiting now creates neither a contact nor a lock; actual aerial contacts retain the PR155 overlap lock.                                                                                                                                                          |
| Explicit long ground delivery could become a high aerial launch         | `direct + ground` inherited a long-pass aerial profile. Delivery now selects the physical regime: explicit ground stays ground; lofted remains aerial.                                                                                                                                                                                                                         |

The conditional flight experiment that exposed the airborne gap is retained in
the validation summary. It is an exploratory diagnosis, not final calibration
evidence. No completion assertion was relaxed to hide that defect.

The additional balanced fixture also confirmed an unconditional flank-change
reward: crossing the centre line counted as useful circulation even if both pockets
were equally open, and could excuse an unchanged return to the previous passer.
Switch/width value now depends continuously on space released or pressure escaped.
It remains useful when the opposite flank has a real advantage. An exploratory
balanced run with execution risk alone produced zero shots; the contextual switch
correction restored forward solutions. That exploratory run is not substituted
for the final multi-seed matrix.

## Meaning of the attribute scale

These are meanings of an **individual skill**, not generation cut-offs or OVR:

| Attribute | Intended competence                                                 |
| --------- | ------------------------------------------------------------------- |
| 90–100    | World-class / historically exceptional in that skill                |
| 75–89     | Excellent professional                                              |
| 60–74     | Strong professional / elite prospect skill                          |
| 40–59     | Weak professional, developmental, academy or lower-level skill      |
| 20–39     | Below serious professional standard; unreliable technical execution |
| 10–19     | Very poor; demanding professional execution is unusual              |
| 0–9       | Near the bottom of the representable competence scale               |

`playerCreator.ts` uses difficulty targets 60/50/40, then shapes a profile with
archetype/position variation. `playerOverall.ts` averages groups with positional
weights and familiarity; an OVR of 60 never asserts that Passing, Technique and
every other skill equal 60. `seasonDevelopment.ts` limits growth to attribute
capacity and 1–100. **Generation, OVR and progression distributions are unchanged.**
Zero is a mathematical calibration boundary; persisted attributes still use their
existing domain range. This PR does not silently redefine existing saves or
repopulate the world database.

## Shared difficulty, execution and selection

`derivePassDifficulty` is RNG-free and shared by physical execution and expected
outcome scoring. Effective ability geometrically combines the primary passing
skill (goalkeeper kicking for long goal-kick distribution), technique, reading and
composure. A missing passing skill cannot be averaged away by otherwise good skills.

Continuous demand includes range, lateral displacement, loft, a moving lead/through
target, body turn, passer pressure, weak-foot context and incoming first-time speed/
height. Gaussian lateral and longitudinal errors use the existing seeded release
identity and two draws. Low skill never creates an impossible-success gate; elite
skill retains nonzero uncertainty and unbounded tails.

The aware receiver updates a movement objective from the **actual canonical
flight** at the existing 10 Hz tactical cadence. It prepares low control near the
desired meeting location, rather than chasing an optimistic earliest intercept.
Awareness delay, acceleration, turning, braking, contact geometry and first touch
still decide whether the body arrives. There is no teleport or guaranteed catch.

Sampled range error scales launch energy within the ordinary planner's existing
30 m/s ceiling. Launch metadata records the actual sampled speed. Throw-ins and
long goalkeeper distribution retain their specialised physical launch profiles.

Selection uses the same uncertainty, the real reception-quality resolver, defender
recovery time and continuous receiver-adjustment cost. A completely open segment
does not make a long delivery safe. The probability envelope/recovery terms are
forecast approximations, not a second simulated match or a claim of statistically
calibrated probability. There is no pass-length threshold penalty or CM bonus.

## Measurement definitions and reproduction

Reporting bands are **<8 / 8–<18 / 18–<30 / 30–<45 / >=45 m**. They distinguish
nearby combinations, one-zone links, line-to-line football, long circulation and
major switches relative to a 68 m pitch width. These are reporting bins only;
neither execution nor utility changes discontinuously at a bin boundary.

```sh
npm run benchmark:agency -- --seeds=lab-muwhj3er,pr155-natural-b,pr155-natural-c --minutes=90
npm run benchmark:passing-difficulty -- --repetitions=64
npm run benchmark:passing-difficulty -- --attribute=passing --contexts=feet-ground,diagonal-switch,turning-pressured --lengths=12,50 --repetitions=64
npm run benchmark:connectivity -- --matrix --minutes=45
npm run benchmark:connectivity -- --pass-matrix
```

All three tools accept `--out`. The agency and flow tools accept `--engine-root`
for the pristine baseline; the passing tool accepts it too, plus `--bands`,
`--lengths`, `--contexts`, `--attribute` and optional bounded `--trace` examples.
The extra contexts isolate passer pressure, receiving pressure, body turn, lateral
ground delivery and first-time incoming speed/height. First-time source parity also
uses the established PR155 matrix, with unchanged accounting/invariant assertions.

The main passing matrix fixes receiving skills at 60 and pairs each sample seed
across ability bands. The bundled sweep changes Passing/Technique/Reading/Composure
together. Individual sweeps change one skill with all other attributes at 60.
Distance is the initial geometry; the release diagnostic also records the actual
projected meeting point. A cell is a controlled experiment, not a league average.

Each cell records attempts, physical outcomes, completion, canonical turnover
events, interception/out-of-play, clean/directional/heavy/failed control, execution
and angular error, travel time, desired receiver displacement, actual adjustment
and retained momentum. Secure completion requires a completed pass and secure home
ownership **in open play one second later**. Restart placement does not count as
retention. Recovery of a failed delivery is recorded separately as secure team
possession; `unsecuredCompletion` is separate from a real canonical turnover.

Execution error is the displacement of the sampled launch objective from the
intended objective, in metres, rather than the integrated landing error. Angular
error is the change in the launch bearing. Travel, contact position, adjustment
and retained momentum come from the integrated flight and actual control; the
uncertain objective itself never creates ownership. Required receiver displacement
is measured from the receiver's release position to the desired meeting point.

## Agency comparison

The XI is fixed once from the spectator session. Identity selection never calls
`forceIntoXI`. Each seed has one complete CPU reference and 22 complete disabled-
agency runs, including the second half. Only the two experimental inputs
`controlledFootballerId` and `playerAgencyEnabled` are excluded from canonical JSON.
All football fields, source identities, statistics, network and support remain.

Complete hashes are checked every 10 canonical seconds and at full time. A failed
checkpoint is replayed at 25 ms from the preceding matching checkpoint to locate
the first differing field. This detects persistent divergence; it is not a proof
that an arbitrary transient difference cannot arise and disappear between checks.
The all-22 regression additionally compares every canonical frame of its window.

Actual RNG observation wraps `RandomGenerator.prototype.float`, including seeded,
forked and imported instances. It hashes each post-draw seed/state/call-count in
order without extra draws, with bounded batches of 8192. Diagnostic refinement and
enabled-prefix experiments do not contaminate a disabled-run stream. Both final
state and actual draw sequence must match the CPU reference.

Enabled comparisons inspect every frame until the first real opportunity, record
the player's involvement, explicitly select an available option and identify the
first difference relative to that choice. They are prefix experiments, not 22
complete synthetic human careers. Disabled mode exposes no human opportunities
by contract. Mandatory controlled restarts cannot be released by DEV.

A choice can become available inside a canonical tick. CPU then executes its
autonomous action, while the controlled actor waits for that newly opened choice.
That raw pre-application difference is retained with its exact field/time and both
boundary hashes, separately from earlier identity drift. The complete matching
prefix ends at the preceding 25ms frame; no action fields are filtered. The explicit
choice is applied at the boundary's same simulation time. The exported relative
classification distinguishes this wait from a difference caused by applying a choice.

The prefix comparator visits every canonical property directly, with no ledger or
source exclusions; full prefix hashes are also exported. Its regression tests
cover equal separately allocated objects, the last ledger source, the last starter's
counter, array length/shape and optional JSON fields. `--resume` reuses completed
runs only after recomputing and matching the entire CPU reference, actual RNG stream,
configuration, full statistics and support hashes. `--recheck-enabled` explicitly
replays every enabled prefix while preserving validated complete disabled games;
an optional comma-separated identity value selects particular prefixes for replay.

## Connectivity, pressure and stability observers

`PassingConnectivityTracker` records release distances, intended edges, actual
receiving edges, reciprocal volume and sequences restricted to 2/3 players. It
preserves release origin for progression and never feeds a flag back to selection.
The 64-pass sequence window, 256 sequence rows, 512 central rows, 64 pending
release origins and at most 462 directed edges keep memory bounded.

Central rows use the canonical ranking immediately before release: marker clearance,
orientation, receiver/defender ETA, uncertainty, reception/retention forecasts,
selected alternative and utility difference. A credible lane has zero lane
occupation, lateness below 0.3 s and expected completion above 0.5. These are
diagnostic definitions, not extra AI bonuses. The pre-release sample is at most one
fixed tick before the actual decision, so a marginal ranking tie is not causal proof.
The selected utility comes from the exact released action rather than the first
proposal for that receiver. Rows are candidate actions, potentially multiple intents
per central receiver; they are not counts of distinct midfielders or possessions.

Pressure evidence samples at 1 Hz and retains 64 option-evolution points per episode:
escape, pivot, third man, width, reset, viable carry/pass count and the carrier's
best solution/reason. Up to 256 completed episodes are retained. Hold duration and
stationary high-pressure stall are distinct: a moving pressured possession is not
automatically a failed support response. No timer forces release.

Adjacent flips retain every exported event. Evidence includes the ownership change,
challenge, ball segment, acquisition/recovery and aerial/contact facts. Immediate
tackles and an incoming pass intercepted at physical contact are legitimate short
contests. A stale `lastBallContact` is not evidence that the current control change
occurred at that old point. Any unclassified row remains visible for audit.

## Before/after evidence

The final flow matrix uses four matched 45-minute fixtures and three seeds. A/B/C
mean `lab-muwhj3er` / `pr155-natural-b` / `pr155-natural-c`. Counts sum both XIs;
`CM/FB` means actual receives, and sequence length is the largest 2/3-player window.
The player fixture has a forced CM XI and explicit choices; the observer fixture
uses the native XI with balanced 4-3-3 versus pressing 4-4-2. Balanced and strong/weak
fixtures avoid tuning only that network. Each row is PR155 → PR156.

| Fixture / seed | attempted / completed | CM / FB receives | reciprocal share | max small-group sequence | shots  |
| -------------- | --------------------- | ---------------- | ---------------- | ------------------------ | ------ |
| Player A       | 401/352 → 398/348     | 65/148 → 96/129  | .531 → .516      | 9 → 18                   | 9 → 15 |
| Player B       | 428/362 → 402/371     | 81/164 → 81/149  | .560 → .470      | 13 → 7                   | 7 → 8  |
| Player C       | 421/342 → 408/376     | 90/105 → 89/151  | .592 → .514      | 6 → 8                    | 12 → 5 |
| Observer A     | 407/379 → 391/370     | 70/242 → 109/188 | .698 → .650      | 34 → 14                  | 5 → 7  |
| Observer B     | 418/367 → 402/345     | 76/182 → 90/141  | .651 → .592      | 21 → 10                  | 6 → 8  |
| Observer C     | 435/378 → 400/382     | 90/173 → 107/209 | .584 → .620      | 14 → 18                  | 9 → 4  |
| Balanced A     | 401/376 → 409/392     | 81/230 → 102/202 | .713 → .562      | 23 → 15                  | 6 → 4  |
| Balanced B     | 401/375 → 394/385     | 69/192 → 94/191  | .613 → .685      | 17 → 13                  | 7 → 5  |
| Balanced C     | 412/399 → 379/346     | 54/284 → 78/154  | .728 → .533      | 32 → 12                  | 1 → 10 |
| Strong/weak A  | 412/271 → 364/207     | 51/125 → 44/55   | .723 → .593      | 22 → 7                   | 4 → 16 |
| Strong/weak B  | 441/224 → 364/214     | 50/32 → 34/41    | .649 → .549      | 5 → 4                    | 6 → 11 |
| Strong/weak C  | 423/288 → 365/207     | 54/155 → 41/37   | .681 → .597      | 29 → 4                   | 5 → 12 |

Central receives increase in all three native and all three balanced fixtures;
they do not universally increase in player or strong/weak fixtures. Reciprocity
decreases in 10/12 cases, with remaining concentration visible. This supports the
identified execution/width mechanism, not a claim that CM involvement is now a
real-football target share. The weak side cannot keep exploiting the former low-skill
long-pass accuracy; its changed network is reported separately rather than corrected
with a strength multiplier or role quota.

**Disproved hypothesis:** >=45 m switches did not dominate PR155 circulation. The
reference observer seeds had 2/7/12 very-long attempts, while the dominant fullback
edges were mainly medium/long. After calibration those counts are 6/8/4: legitimate
long switches remain, and a universal reduction was neither requested nor obtained.
The pathology was repeated relatively safe circulation, including an unconditional
flank reward. In the bounded credible-CM rejection sample, long fullback alternatives
fall from 18/19/28 to 4/5/25 in the observer seeds; most remaining cases have greater
alternative football value, with five C rows showing reception/execution risk.
These are candidate-action rows, not an exhaustive causal count.

Machine-readable fixture reports retain all 22 players' public counters, per-role/
per-line involvement, complete directed edges and distance bands, realised receiving
edges, CB/FB/CM/attack connections, reception outcomes, turnovers, possession spells,
first-time intent/distance/pressure, overlap counts, territory and pressure evidence:
[player](performance/PR156-flow-supplied-player.json),
[native observer](performance/PR156-flow-supplied-observer.json),
[balanced](performance/PR156-flow-balanced-balanced.json),
[strong/weak](performance/PR156-flow-strong-weak.json).

The passing lab has **280 cells × 64 repetitions per revision**; four individual
attribute sweeps have 42 cells × 64 repetitions each, and isolated context controls
add 72 × 32. Examples from the bundled final matrix:

| Context / ability   | 5m completion   | 50m completion | 50m mean objective error | 50m mean actual contact adjustment |
| ------------------- | --------------- | -------------- | ------------------------ | ---------------------------------- |
| feet / 10           | 61/64           | 15/64          | 28.78m                   | 17.43m                             |
| feet / 20           | 64/64           | 26/64          | 14.96m                   | 5.88m                              |
| feet / 60           | 64/64           | 64/64          | 2.16m                    | 1.99m                              |
| feet / 100          | 64/64           | 64/64          | 0.69m                    | 1.16m                              |
| progressive / 10    | see full matrix | 6/64           | 38.04m                   | 21.73m                             |
| progressive / 20    | see full matrix | 12/64          | 19.75m                   | 15.47m                             |
| diagonal loft / 10  | see full matrix | 9/64           | 58.91m                   | 31.63m                             |
| diagonal loft / 20  | see full matrix | 12/64          | 30.59m                   | 27.23m                             |
| diagonal loft / 100 | see full matrix | 64/64          | 1.31m                    | 1.18m                              |

Changing **Passing alone**, with the other skills at 60, gives 10/12/55/64 completed
50m diagonal deliveries at Passing 10/20/60/100, with mean errors 33.28/18.57/4.35/
1.68m. Technique, reading and composure also improve the execution distribution;
their individual weights differ. The old 740-row attribute micro-lab is rerun on
both revisions and retains ordered means. The main matrix has no unresolved flights.

**Explained nonmonotonic reception cell:** a 50m turned/pressured delivery also gives
the receiver an awkward 2.4-radian initial orientation and receiving skills of 60.
At passing bundle 60/80/100, completions are 10/8/3, heavy touches 41/56/61, but secure
team possession after physical recovery is 51/64/64 and canonical turnover counts
are 13/0/0. More accurate fast arrivals expose the difficult first touch; lower skill
often sends the ball out or away from the pocket. This is neither an interception
inversion nor a guarantee of clean reception. Isolated turn/pressure controls and
the open diagonal fixture improve with ability. Completed passes, failed control,
physical recovery and real possession loss are deliberately kept separate.

[Compact ability × distance tables](performance/PR156-passing-summary.md) show
before/after completion/error and final clean/secure counts. Full cells:
[before](performance/PR156-passing-before.json),
[after](performance/PR156-passing-after.json),
[individual skills](performance/PR156-passing-attributes.json),
[isolated contexts](performance/PR156-passing-contexts.json),
[legacy attribute lab](performance/PR156-legacy-attributes.json).

Pressure holds **do not uniformly shorten**. Native high-pressure p95 durations are
7.38/10.58/11.88 → 10.63/9.65/13.03 seconds; maximum stationary stalls are
4.13/3.65/2.48 → 3.60/3.70/1.93 seconds. The C 22.075-second possession contains only
0.225 seconds of stationary high-pressure stall, a roughly 1-second sampled support
response and a committed carry with changing escape/reset offers. The strong/weak
B 26.025-second hold contains 1.975 seconds stationary stall, an initially poor
release set, then a moving carry ending in a cross. These are meaningful distinctions,
not grounds for forcing a pass. Full high-pressure duration histograms, every long
hold and bounded option-evolution examples remain in the fixture JSON. Support
availability and action/commitment selection both matter; this PR does not declare
every long possession solved.

All nine baseline adjacent flips are inspected: eight immediate clean tackles and
one next-segment first-time pass interception at 2532.45s in observer B. The latter
has old challenge/aerial/contact facts which do not describe that interception.
The final matrix retains three genuine immediate tackles. No exported flip is
discarded to obtain zero. Release-labelled overlap attempts/completions in the
native seeds change from 24/0, 28/0, 38/0 to 22/20, 31/26, 16/12;
the original zero-completion impression was substantially a semantic measurement
defect, not evidence that every physical overlap failed.

## Verification, determinism and performance

`npm run verify` passes: **152 main test files / 1180 tests**, plus **5 career
continuity tests**, lint, TypeScript and the production build. All three benchmark
scripts also pass standalone strict TypeScript checking. Existing large-bundle and
mixed static/dynamic `careerStorage` warnings remain. Full canonical telemetry
references were regenerated for the physical change and reproduced twice per seed;
the previous references remain in the PR155 evidence.

[Agency evidence](performance/PR156-agency.json) contains **three complete 90-minute
CPU references and 66 complete disabled-identity games**, through the second half.
Every canonical hash, actual RNG draw sequence/count, complete public statistics/
network, positional hash and team-support hash matches. All disabled opportunity
counts are zero. Earlier baseline identity drift remains documented rather than
being hidden by excluding source fields.

All **66 enabled prefixes** match before a real decision opportunity. In 65 cases
the pre-choice boundary state also matches and applying the explicit choice creates
the first difference. For away `footballer_pro_1_22` in seed A, the raw boundary
difference is `.decisionIndex` at **2421.675s**, when CPU executes its pass and the
controlled actor waits for the newly available choice. The preceding complete frame
at **2421.650s** matches; both differing boundary hashes and the player's involvement
remain exported. The explicit choice has the same simulation time. This is one
pre-application action-boundary difference, not a claim that all 66 unchosen boundary
states are identical, and not an earlier movement/ranking leak.

The **80 PR156 regression cases** include all 22 disabled identities, physical
human/NPC parity, continuous attribute influence and contact/flight/telemetry
defects. Controlled non-throw restarts cover nine types × four blocked sources ×
five presentation/watch policies, both stepping entry points and DEV, with identical
state and no RNG draw on rejection. The existing shot-ownership suite and canonical
guard retain zero autonomous controlled shots. These are contract checks, not
full-match enabled-human intervention totals.

[First-time evidence](performance/PR156-first-time.json) contains **960 cells × four
repetitions**, with zero physical source-parity failures, error-ordering failures or
unresolved flights. Incoming speed/height, body angle, pressure, intent and delivery
vary; ordinary human/NPC releases use the same physical resolver.

The exploratory airborne diagnosis varied Passing alone with other skills at 60.
With the waiting lock already removed but low-flight foot contact still missing,
50m diagonal completion was **18/64 at Passing 60 and 4/64 at 100**. Enabling real
continuous foot contact changed those intermediate results to **52/64 and 64/64**,
without changing their sampled objective-error means. These intermediate experiments
precede the final speed/width calibration; they explain the confirmed resolver defect
and are separate from the final acceptance cells. The validation JSON retains them.

[Observer evidence](performance/PR156-observers.json) compares normal, DEV replay/
diagnostic observation and debug capture on three five-minute player seeds. Complete
canonical hashes match with no identity or ledger exclusions. Capture uses the
headless recorder, without a renderer. Capture/browser/video wall time is not claimed.

[Performance evidence](performance/PR156-performance.json) uses sequential normal
headless 45-minute native spectator runs, after an excluded three-minute warm-up
per revision, with no concurrent benchmark/verification jobs:

| Seed | PR155 wall time | PR156 wall time | paired change |
| ---- | --------------- | --------------- | ------------- |
| A    | 16.906s         | 17.757s         | +5.0%         |
| B    | 17.478s         | 18.385s         | +5.2%         |
| C    | 18.228s         | 17.324s         | −5.0%         |

The median paired ratio is **1.0503**. Separate wall-time medians are 17.478s and
17.757s. All six runs contain 108,000 canonical steps; complete normal and DEV
hashes match at 45 minutes in both revisions and all three seeds. Timing includes
stepping, public statistics, flip accounting and report assembly, excludes world/XI
setup. These are same-machine descriptive timings on different resulting football
trajectories, not proof of an exact per-operation cost. The approximately 5% median
paired increase is reported openly; diagnostic capacity and agency cadence were not
reduced. Environment and full hashes remain in the JSON.

[Validation manifest](performance/PR156-validation.json) records the verification,
matrix sizes, baseline leak, raw action-boundary distinction, classification counts,
limitations and SHA256 checksums of machine-readable evidence. Presentation metrics
are rounded to six decimals; canonical hashes are computed from unrounded full state.

## Limits and next work

Matched seeds use identical initial fixtures, not identical subsequent possessions
after calibration changes. Forced-CM player fixtures deliberately have a different
XI from the native spectator fixture and are compared only with their own baseline.
The deterministic human input policy chooses the highest canonical score among
surfaced options; it is not the missing original human playtest tape.

The lab includes favourable empty receiving pockets and deliberately contested
ones. A 64/64 favourable cell is sample saturation, not guaranteed skill-100 success.
Completion alone can include an expensive recovery adjustment; retain the travel,
control, adjustment and momentum evidence. Small nonmonotonic sample counts do not
override a distribution; structural inversions are investigated rather than hidden.

Bounded central/pressure evidence is a diagnostic sample, not exhaustive spatial
tracking of every possession. The data can support or reject a specific mechanism;
it cannot establish real-football CM shares or league-wide passing realism. No
external football dataset was used, and browser/3D/video performance was not measured.

Next: **PR157 — Dead Ball & Restart Continuity**, **PR158 — Fatigue, Injuries,
Substitutions & Added Time**, **PR159 — Match Presentation / Replay / Stadium Polish**.
