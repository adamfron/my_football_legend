# PR174 — Combination Play & Tactical Adaptation

Status: reviewable draft. Base: merged PR173 `c499123`. Final production stage: K (H4 cover availability),
source hash `afa0c77c984b8a5b5040dbd976836496c4ccc54034de214f0392a26a426278da`.
Validation is being assembled below. Do not interpret the draft as a completed realism claim.

## 1. Audit, plan and existing foundations

Read AGENTS, PROJECT_STATE, the authoritative ROADMAP, MATCH_BEHAVIOUR_CALIBRATION,
PR171–173 reports, their fixtures/receipts, canonical actions/positioning/locomotion,
passing/reception, dynamic intervention, threat memory and career accounting before editing.
The sequence was: freeze PR173 → measure → movement-only → candidate integration → bounded
adaptation → reserved validation → full cohorts/career/browser → unchanged verification → CPU.

Reused build-up support, third-man roles, flank relationships and rest cover; locomotion,
fitness and sprint readiness; PR173 momentum-aware interception; ordinary pass projection,
release and reception; first-time contacts; action agency; release-time offside; existing
team threat memory, shooting utility, shot physics and restart laws. No second tactical engine.

## 2. Baseline and confirmed integration gaps

Support assignments were recomputed around the next owner. There was no short shared opportunity
preserving the original passer/third runner through ownership change. The stale-return test
looked at displacement of B, rather than original passer A. This can reject a useful moving
return. A pass still has to survive the independent current physical forecast.

The matched original 12 PR172→173 games had passes 25,853→25,177, completions 22,767→21,987,
central receptions 3,356→3,532, final-third entries 567→608, box entries 39→62, shots 21→21,
goals 13→12, possession losses 2,798→3,190 and fouls 196→219. More access did not establish
better shooting or fewer turnovers. These are reused dependent fixtures, not population rates.

## 3. Combination-intention data contract

Optional Zod-validated `combinationIntent` plus `lastCombination`; one active and one last
record. Stable canonical first/continuation pass IDs, team, kind, initiator/partner/runner,
origin/target, expiry, phase and physically observed milestones. Maximum three distinct
participants, two releases, normally 2.5–4.5 s and at most 6 s through continuation flight.
No per-tick canonical history. Diagnostics are opt-in and retain at most 128 traces.

Cancellation: possession loss, failed/different contact, alternative action, restart/period/end,
expiry, unavailable participant/substitution, unreachable destination and conflicting human
movement. At most two distinct runners receive the bounded kinematic forecast at actual release;
there is no canonical lookahead tree or hidden multi-second rollout.

## 4. Pass-and-go and independent return decisions

An actual canonical pass release starts an opportunity; assignment alone does not count.
The original passer must physically travel toward the route before recognition. Pass-and-go
requires forward displacement. Existing positioning, onside constraints and locomotion perform
the run. The receiver ranks ordinary pass/carry/shot alternatives. Candidate deduplication
prevents double utility for the same target. No fixed combination/progressive/position bonus.

The stale-return exemption is narrow: the original passer has actually moved, the intent is
live, and the current independently assessed lane remains safe. Contact, interception, control,
technical execution and offside retain canonical authority.

## 5. Third-man movement

Preserve the *actual existing* `third_man` assignment, rather than relabel a convenient player.
A purposeful lateral run is useful when it opens a forward connection from B; requiring every
third runner to advance in x incorrectly discarded these runs. Pass-and-go retains its forward
requirement. The regression covers this distinction.

In the post-validation complete 27-case geometry grid, one third-man action completes through
physical movement and an independently selected B→C pass. C moves 9.419 m; A→B completes at
20.999999999999943, B→C at 22.424999999999862. Initial C=(57,52), planned target=(63,47).
All nine third-man cases remain in the receipt: six intentions, five started runs, one completed
continuation, five alternative selections. This establishes possibility, not natural frequency.

## 6. Overlap and underlap

Reuse existing flank relationships and their actual targets. The same route/cover/offside and
pass forecasts apply. Timed overlap completes two physical passes, then independent carries;
run distance 12.191 m, contact at 24.70 s, maximum controlled progression 25.85 m.
Underlap is represented and can generate an ordinary candidate, but the controlled tests often
prefer another outlet. A robust rate of *completed underlaps* is not established here.

## 7. Pressing escape

Local observable pressure can justify a pass-and-go. Rest cover, current lane occupation,
defender ETA and control risk can veto it. The dedicated central two-presser family does not
improve: mean controlled progression 2.818 m and one loss in five development variants on both
engines; no new intention. An unsafe press is not disabled to make a combination work.
Natural/winger successes do not prove general coordinated escape from organised pressing.

## 8. Relative player strength

The nine paired attribute/momentum probes use actual canonical initial choices and 8 s
continuations. Own passing, receiver passing and receiver first touch vary separately. A weak
passer can choose the stronger teammate, but reducing that teammate's *passing* alone does not
change the initial reception choice; it is not a first-touch attribute. Own passing 90 also
retains this outlet. Do not claim a universal strongest-player preference or add OVR bonuses.

A fast winger gets a viable lead option; the slow variant chooses another support player.
Fatigue does not remove short passing. Outcomes/identities/rankings are retained in
`PR174-player-matchups.json`; the variants share geometry and are dependent.

## 9. Tactical mismatch and available evidence

PR173's forecast uses visible positions, velocity, facing, agility/turning and physical capacity.
The new combination layer calls it for at most two runners at release. A recovering/crossing
presser can change space-pass versus lead/short choices. It does not inspect future outcomes,
use opponent RNG or mutate a defender to open a lane. The approximation is not a guaranteed
intervention time or calibrated probability.

## 10. Existing threat-memory adaptation

Extend the existing bounded channel memory: completed-contact windows, origin/maximum/last
controlled depth and six-contact closure. Count retained progress, not a temporary visit
forward followed by recycling. Distinguish technically failed execution from repeatedly
intercepted decisions. Decay through the existing 180 s mechanism; retain the existing gradual
response rates/persistence and coach/game-state constraints. One failure is not an instruction
to switch tactics. Protecting a late lead constrains variation.

The 600 s actual canonical history yields 36 qualifying episodes and both a failed and a
successful memory. Identical present geometry with these legitimate histories isolates the
response. Lead/trailing/ability/block/keeper/rebound variants are explicit counterfactuals,
not independently sampled match rates. Initial failed G classification and its receipt remain.

## 11. Contextual long-range shooting

Small context term only at 20–31 m with adequate skill (>0.6), angle (>0.5), pressure (<0.65),
blockers, keeper exposure and rebound support. The ordinary alternative ranking and physical
release/resolution decide. No shot quotas, goal targets or goalkeeper adjustment.

All ten adaptation probes initially choose carry. Two later goals are close-range continuations;
they are not evidence of improved long-range shooting. Tests establish conditional score
eligibility/rejection; the scenarios do not establish that the new distance option is selected
more often. This remains an explicit acceptance limit.

## 12. Short collective continuation methodology

Full 22-player states, ordinary ball/players/opponents, one prescribed *opening release* only,
then 320 fixed 0.025 s ticks (8 s). Observe actual choices/pass IDs/results, movement, controlled
forward access, loss events, fouls, samples at 1/2/5/8 s and complete schema-normalised reload
continuation. Human cases stop at real pending choices. Ownership samples exclude flight.
A run assignment, safe option, selected release, completed contact and shot are distinct events.

Development=12 families×5 variants=60; reserved mirror/seed set=24; later targeted safety/timing
set=16. Post-validation exploratory geometry=27 (all three kinds×3 x offsets×3 y offsets),
only three attackers translated, all defenders unchanged. This grid was not used to tune policy.
An invalid first grid used y=-8 and placed a winger outside the pitch; the schema rejection and
raw attempt remain, excluded from valid comparisons. Corrected offsets are -3/0/8.

Observation-only shot tracking leaves all 100 H3 complete final states identical. Natural
combination diagnostics track progression, but do not retain an 8 s post-combination shot
attribution window. That natural causal conversion metric is explicitly unmeasured.

## 13. Controlled before/after experiments

| Set | Cases | Mean maximum controlled gain PR173→174 | Loss events PR173→174 | Completed recorded combinations |
|---|---:|---:|---:|---:|
| Development | 60 | 3.123→4.818 m | 17→20 | 9 pass-and-go |
| Reserved short continuations | 24 | 3.738→8.191 m | 7→6 | 6 pass-and-go |
| Later timing/safety probes | 16 | 3.166→2.696 m | 0→0 | 1 overlap |
| Post-validation complete grid | 27 | 7.226→5.461 m | 7→8 | 1 third-man, 1 overlap |

Development own-team owner at 5 s=19→18 and at 8 s=13→12; reserved at 5 s=3→3 and 8 s=1→8.
Four development human variants stop at a pending choice (not all five); both reserved human
variants do. None of the 127 final short probes releases a shot. Baseline shot instrumentation
is reported independently rather than treating an absent field as measured zero.

Early paired stages: A1 baseline/B movement-only/C recognition/E adaptation/D fallback have
mean gains 3.034/5.827/4.072/4.072/6.064 m, losses 21/21/18/18/21. Fixtures were revised after
finding prospective C was not the actual assigned third man; do not compare these across
revisions as if identical. Sources, raw runs and rejected variants are retained.

## 14. Accepted, rejected and narrowly necessary fixes

Accepted: shared ownership-spanning opportunity; correct original-passer motion test; two
bounded distinct candidates; purposeful lateral third-man movement; retained-depth evidence.
Rejected: movement alone proves better decisions; every prospective third player has that
role; a covered route should be forced; a temporary forward touch makes recycling effective;
more progression proves better conversion; another universal passing bonus.

G exposed a real new senior free-kick soft lock: an encroaching marker's legal destination lay
behind its own settled wall. Exact compressed canonical state retained. Narrow restart fix
searches bounded legal destinations around the wall only for this condition (>=3 own wall,
non-wall encroaching opponent <9.3 m, obstructed route). No ball/body placement or law threshold
changes. G remains blocked for 30 s; H's insufficient angular search fails; final H3 walks
legally and physically releases after 2.175 s. Maximum body step 0.059655 m; every legal-readiness
condition true before release. Focused regressions use this exact state.

The final cover check also excludes physically unavailable or sent-off covering teammates.
A paired full-state probe reproduces the H3 defect (two injured cover players still allowed
pass-and-go); K rejects it while retaining the healthy counterpart and identical opening
ball/pass physics. The new regression passes. Intermediate H3 cohort processes were stopped
after supersession; every completed receipt and partial log is retained, never labelled final.
The final K cohort and career runs use the corrected frozen source.

## 15. Full-match outcomes

<!-- FULL_RESULTS -->

## 16. Positional participation

<!-- POSITION_RESULTS -->

Role groups come from actual active/departed players and played minutes, not preferred
positions or assigned-role bonuses. The full receipt retains every team and paired fixture.

## 17. Shooting and attacking conversion

<!-- CONVERSION_RESULTS -->

A completed combination followed by controlled progression is measured separately from
final-third/box entry and independently released shots. More access alone cannot establish
more credible shot selection. The deliberate career action policy is accounting/agency
validation and is not a natural match-rate sample.

## 18. Turnovers, defence and discipline

<!-- DEFENCE_RESULTS -->

Unchanged defensive locomotion, tackling, interference, interception, contact and offside rules.
This does not prove defensive behaviour unaffected: new attacking choices branch future
states, so actual defensive/discipline outcomes and losses are reported above. No compensating
nerf or goal/foul target was introduced. The uncovered and covered counterparts are both retained.

## 19. Performance and bounded work

<!-- PERFORMANCE_RESULTS -->

Release-time local planning checks at most two distinct runners. One active/last record,
three participants, two passes; no state history or tick-time candidate tree. Candidate counts
include existing ordinary actions and are diagnostic observations, not a raised global budget.
Full-cohort concurrent wall times are never used as a CPU speed comparison.

## 20. Determinism and save compatibility

Optional schema fields preserve old saves. At 1/2/5/8 s compare the *entire serialisable*
next canonical state after schema normalisation on both paths. No projection excludes
combination/threat/contact fields. Undefined in-memory optional keys are not JSON data;
raw `deepStrictEqual` can distinguish them, whereas complete serialisable states agree.

Both full career matches exercise 50 reload checkpoints, including 7/5 checkpoints with an
active intention (periodic checkpoints can add to the four explicitly requested ones).
U17=5520.725 s, 23 deliberate choices, 1:0, rating 6.4; professional=5580.25 s, 33 choices,
0:0, rating 6.7. Full evidence, minutes, substitutions, save/hydrate, next fixture and
idempotent result commit pass. Canonical career payloads are 101,247/128,619 bytes.

<!-- DETERMINISM_RESULTS -->

## 21. Tests and production-browser evidence

<!-- VERIFICATION_RESULTS -->

Windows Node v24.19.0; unchanged package lock/dependencies; repo's original npm verify command,
worker limits, assertions, timeouts and ticks. Research remains outside routine CI.
The first local aggregate run under simultaneous cohort load had five timing failures and one
changed complete telemetry reference; all logs retained. Initial CI passed 1817/1818 main tests,
with only telemetry seed b changed. Both seed outputs reproduced twice per engine in fresh
processes before updating only the changed all-field golden. Seed a unchanged; no field removed.

Production browser: real youth career, 3D prefix to human choices at 00:38/01:05, explicit
teammate pass and explicit-point carry, cancel/confirm finish by summary, visible full minutes
and honest partial-action-stat disclaimer, persisted result/calendar. This physical prefix
used stage G. Final rebuilt H3 loads the same save and preserves seven appearances after six
additional summary-mode fixtures. Its visible data survive reload; selected calendar date
resets, so whole DOM equality is *false* in that final check. Earlier G result DOM equality
was true. Neither smoke test is mislabelled a full canonical browser match. Headless careers
above are full canonical games. PNGs and DOM receipts are archived with this evidence.

## 22. Limitations and acceptance assessment

Mechanisms and reviewable evidence are delivered; several aspirational behaviour claims remain
limited. Development losses worsen, the geometry grid's average gain worsens, the dedicated
organised press family does not improve, completed underlap prevalence is not established,
long-range choice selection is not demonstrated, and natural post-combination shot attribution
is not measured. Keep the PR draft for review; do not assert the entire football-realism DoD.
Small reused and mirrored fixtures have dependent outcomes, and reserved eight-game cohort
has four design blocks. No confidence claim based on counting every tick/variant as a new match.

## 23. Reproduction and PR175 proposals

Use Node 24 with `npm ci`; pristine before tree is PR173 `c499123`. Commands use the repo's
`--experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs` runner.
Retained source snapshots, raw receipts and harnesses in `performance/pr174-experiments/`.
Restore exact measured source for each rejected stage; do not relabel current code as old policy.

```text
node scripts/benchmarkPr174Telemetry.mjs --baseline-root=../baseline-pr173
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr174.ts --stage=I --output-dir=../pr174-research
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr174Cohort.ts --mode=cohort --output-dir=../pr174-H3-full
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr174Cohort.ts --mode=cohort --families=senior_balanced,wide_direct --replicate=extra-a --output-dir=../pr174-H3-full
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr174Cohort.ts --held-out --families=youth_native,senior_balanced,strong_weak,press_low --output-dir=../pr174-H3-heldout
node scripts/summarizePr174.mjs --input-dir=../pr174-H3-full --receipt-prefix=PR174-after --minimum-matches=16
node scripts/reportPr174.mjs
npm run verify
```

Before engines use `--engine-root=../baseline-pr173`; run original baseline cohort via pristine
`benchmarkPr171.ts`. Controlled `--set=held-out` and `--set=targeted` are separate; geometry uses
`benchmarkPr174Geometry.ts`. CPU/startup/full-match scripts take `--baseline-root=../baseline-pr173`
and must run serially after other loads. Verify all fixture/source hashes, not just seed labels.

PR175 should independently sample new canonical club/formation/strength/coach combinations,
compare actual play with real match references, measure option→release→control→advantage→shot
on the same episode including lost balls, examine third-man/underlap rejection reasons and
organised pressure, validate long-shot choice against carry/pass alternatives and repeat CPU
across several full trajectories. Any correction must be narrow and paired. Preserve roadmap:
PR175 reality → PR176 generational/world strength → PR177 summary/PlayStyles → PR178 career UX
→ PR179+ world expansion. Integer PRs only.

## Acceptance questions (36)

1. Existing foundations: section 1; no new generic engine.
2. Confirmed gaps: ownership-spanning assignment and wrong passer displacement, section 2.
3. Physical forward run after release: section 4 and actual pass-and-go traces.
4. Receiver recognition: ordinary independently evaluated candidates; full natural funnel below.
5. Reject unsafe return: covered/offside/unavailable counterparts and specific regressions pass.
6. Independent one-two: 9 development +6 reserved completed pass-and-go; no contact override.
7. Progressive third option: real assignment, lateral/forward connection and complete third-man trace, section 5.
8. Existing third assignment exploited: preserved identity, not a scenario label; one completed exploratory sequence, natural counts below.
9. Flank usefulness: completed overlap; underlap recognition exists, robust completed-underlap evidence limited.
10. Overlap vs underlap: retain distinct existing relationship/target geometry; no universal flank preference.
11. Cover limits risk: >=2 rest-cover condition plus lane/ETA/reception/offside vetoes; covered probes retained.
12. Genuine pressing escape: some pass-and-go works; dedicated two-presser family has no demonstrated improvement (section 7).
13. Press can win: failed contacts, lost-ball and rejected options remain; defence unchanged.
14. Attribute differences: nine canonical matchup cases; no OVR term (section 8).
15. Delegate to stronger passer: occurs, but changing B passing alone does not establish preference causation.
16. Fast winger: fast lead vs slow alternative in the paired matchup; not a population frequency claim.
17. Fatigue: ordinary capability and readiness apply; short pass remains legal.
18. Opponent knowledge: present visible kinematics and completed bounded history, no future result access.
19. Ineffective recycling: retained-depth six-contact windows; transient progress regression.
20. Stable adaptation: decay/persistence, gradual response, single-failure/lead regressions.
21. Distance context: conditional score eligibility, ten initial carry selections; increased long-shot choice unproven.
22. Shots physical: ordinary launch/keeper/block/rebound path; no instant shot result.
23. Advantage use: controlled releases/contact/progression plus natural funnel; natural 8 s shot attribution unmeasured.
24. Loss after combination: retain explicit intention result and 8 s loss events; the latter need not be caused by combination.
25. Possession losses: 17→20 development, 7→6 reserved short probes; full cohorts below.
26. Position participation: actual receptions/minutes by role, section 16 and full team rows.
27. Final-third/box access: paired full-match stages, section 15/17.
28. Credible shots: section 17; access alone is insufficient, no realism claim.
29. Defence: no locomotion/contact nerf; observed outcomes section 18, not a claim that trajectories stay unchanged.
30. Fouls/cards: exact full-cohort counts and paired deltas, section 18.
31. CPU: serial windows, profiler, startup/save/load and one full paired trajectory, section 19; not browser FPS.
32. Determinism: complete-state observer equivalence, repeated full telemetry seeds, source/fixture hashes.
33. Reload: all controlled continuations and 100 career checkpoints, including active intentions.
34. Human authority: no automatic run without compatible explicit command; real pending choices and browser pass/carry.
35. Rejected hypotheses/fixes: sections 13–14, including failed G restart and insufficient H repair.
36. PR175: independent validation, shot conversion, pressure/underlap/third-man rejection and CPU distribution (section 23).
