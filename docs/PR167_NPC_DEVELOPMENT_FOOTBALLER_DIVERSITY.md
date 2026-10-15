# PR167 — NPC Development, Footballer Diversity & Flexible Career Matches

Base: merged PR166, `678c75a520cffda4e770c3c3c4cc92a17bc4db6c`.

## Initial audit (before implementation)

- `seasonDevelopment.ts` already has eight deterministic family trajectories and
  random-access date projection. Season processing deliberately writes no natural
  growth. Character affects rates, but position/specialisation, stagnation resistance
  and the accepted `clubEnvironment` argument do not affect progression.
- `playerCreator.ts` and `footballArchetypes.ts` already generate positional biases,
  individual strengths/weaknesses and compatible secondary positions. Player Model
  2.0 OVR is family/position weighted. Reuse this generation; do not reroll identities.
- Career resolvers project attributes before absolute exceptional overlays and
  temporary condition recovery. Squad selection, youth selection, transfer ranking,
  contracts and canonical participants already consume effective profiles. The older
  base-world resolver does not project, and club-strength caching can retain results
  from a different career object with the same date/IDs.
- Retirement is a stable DOB/character/development fact (maximum age 43). Summer
  market, positional squad repair, procedural youth IDs and graduation already exist.
  They must remain the owners of turnover, rather than generating extra activity.
- PR166 styles require resolved human decisions. NPC rosters have a style field but
  receive no derived styles. Shared contextual mechanics already work for any body.
- `MatchGame` prepares a real squad but imports the runtime and starts canonical
  state before its intro. It only offers Play/Return. Routine summary simulation
  already owns calendar/appearance consequences and must be reused for full Simulate.
- Canonical result v1 validates terminal fixtures and participation, retains three
  detailed results and permanent compact receipts, and applies once through the save
  queue. It has no ongoing-match continuation boundary. Full-match summary totals
  cannot safely be added to a canonical prefix.

## Execution order

1. Extend pure natural development with stable specialisation, individual plateaus
   and origin-club training environment; preserve sparse overrides and identity.
2. Derive bounded NPC styles from attributes/role and honest retained experience;
   pass them through the shared roster and expose them in existing career profiles.
3. Put a lightweight fixture choice before all canonical/runtime imports; reuse the
   existing whole-fixture summary path and permanent preference.
4. Add a versioned, validated canonical-prefix/summary-suffix contract. Freeze at a
   consistent state, preserve evidence, simulate remaining duration only, commit once.
5. Add focused deterministic, transaction, UI and 20-season checks; measure actual
   time/storage, run `npm run verify`, inspect a browser, document limits and open PR.

## Delivered behaviour and ownership

Natural development remains a pure projection in
[`seasonDevelopment.ts`](../src/core/seasonDevelopment.ts). It combines the existing
family curves with primary/secondary position focus, baseline specialisation,
capacity headroom, character, stable annual plateaus and the origin development
environment. The rate multiplier for the latter is bounded to 0.85–1.15. Existing
`getClubDevelopmentEnvironment` supplies coaching/facilities quality. Immutable
academy membership and procedural origin IDs find the real parent academy; absent
facilities use neutral 50. A transfer changes membership, never the origin anchor,
DOB, face, growth history or per-attribute variation. Natural variation also does
not depend on the protagonist career seed.

| Curve | Distinguishing behaviour (relative to the existing individual family ages) |
| --- | --- |
| early_peak | Physical peak three years earlier, faster youth growth, stronger physical decline. |
| rapid_start | Faster initial growth, smaller peak shifts, ordinary later physical decline. |
| balanced | Existing family timing: physical skills mature before mental skills. |
| steady | Slower growth, later peaks and gentler losses. |
| late_bloomer | Later technical/mental peaks (+3 years), later physical peak (+2). |
| long_prime | Later peak/prime and the slowest general losses. |
| physical_early_mental_late | Earlier physical peak (−3), later mental peak (+4). |
| goalkeeper_late_prime | Later specialist peak (+5), restrained physical growth and slow specialist decline. |

Growth does not target an OVR. Familiarity, primary/secondary positions, foot and
archetype generation remain unchanged. Strong skills receive a different growth
weight from weak ones; capacity headroom prevents universal inflation. A capacity
below an already established baseline skill does not instantly erase that skill:
the effective ceiling is the greater of its original value and family capacity.
Age decline still applies. Stable professionalism/determination/ambition are not
naturally inflated. Calendar queries never persist projected profiles.

Repeated queries reuse one latest projection per immutable profile in a `WeakMap`.
Age, origin environment, curve and source attribute/development references are
checked before reuse; changing any of them recomputes the projection. This is
ephemeral CPU memoization, never saved growth. Family means are computed once per
projection. A differential comparison against the pre-optimization implementation
found zero differences in 2,400 projections across all eight curves, two positions,
ages and environments ([receipt](performance/PR167-development-parity.json)).
An explicit regression checks cache invalidation and fresh-profile equality.

[`worldDatabase.ts`](../src/core/worldDatabase.ts) composes natural projection,
known-experience adjustments, absolute exceptional overrides, then temporary
condition recovery. Retained, genuine participation supplies at most two points
to two relevant non-physical strengths, per 900 known minutes; distinct recorded
injury recovery days reduce that credit. It is recomputed from receipts, not
added again on save or season rollover. No fictional detailed actions are used.
The bounded historical receipt is the evidence owner; there is no additional NPC
career ledger. Transfers, retirement, market ranking, youth and squad repair keep
their existing owners. Club strength caching now follows the immutable career
object, avoiding cross-save/date/roster cache collisions.

The environment is a stable origin proxy. The world does not record a complete
history of every NPC's training environments, so destination-club exposure is not
retroactively reconstructed. Real injuries retain the existing condition/recovery
model; this PR does not invent permanent damage from a temporary condition.

## NPC styles and presentation

[`npcFootballIdentity.ts`](../src/core/npcFootballIdentity.ts) derives at most two
compatible styles, with three honest sources:

- **Established:** an adult baseline identity with relevant minimum attributes ≥52
  and stable identity affinity; relevant current ability must remain ≥48.
- **Development:** age ≥22, relevant skill ≥56 and at least three points above the
  immutable baseline, with a narrower stable affinity. No match actions are claimed.
- **Career experience:** at least 12 retained appearances/900 minutes, relevant skill
  ≥60 and an improvement of at least two points. These are participation facts,
  not invented passes, tackles or shots.

Age alone awards nothing. Goalkeeper Distributor requires a goalkeeper; Ball Winner
and Calm Finisher cannot be combined. A player may have no style. Selection uses
stable identity affinity and actual strengths rather than a fixed archetype class.
[`npcCareerIdentity.ts`](../src/core/npcCareerIdentity.ts) resolves current age from
DOB even when the stored profile retains its original projection anchor age.

The same roster style fields reach canonical starters and substitutes. Existing
PR166 mechanics remain the only effects: contextual preparation relief up to
0.04 s, nearby ball-winning anticipation +0.02 s and late low-work recovery +3%.
Shared physical readiness, injuries, fitness, legality and contact resolution still
apply. No independent NPC style success multiplier or RNG was added. The summary
model does not invent physical situations to apply these effects.

Existing club hover cards show current OVR, strengths, age, positions, qualitative
maturity and styles with their source. Hidden curve parameters/potential/peak dates
are not shown. Canonical NPC profiles now carry the actual DOB-based match-date age
as well as the same effective attributes used by career selection.

## Play or Simulate

[`MatchGame.tsx`](../src/app/match/MatchGame.tsx) is the lightweight fixture screen.
It shows competition/date, teams and explicitly predicted participation. “Rozegraj
mecz 3D” imports [`CareerCanonicalMatch`](../src/app/match/CareerCanonicalMatch.tsx)
and only then creates canonical input/state and loads the shared runtime. “Symuluj
mecz” calls the existing routine-summary path through
`simulateSelectedCareerFixture`; it settles the calendar, updates participation,
fitness/development/history and returns without canonical physics or runtime import.
The helper also advances the actual fixture date and logs the result.

The permanent `matchPresentation` preference is unchanged. Existing routine and
`simulate_all` routing stays automatic. Return from preflight clears only the
pending presentation marker; it cannot settle the fixture. A completed fixture is
not offered again. Failed summary persistence retains the exact computed career
for retry and prevents switching to Play after computation has begun.

## Canonical prefix → summary remainder

[`careerMatchContinuation.ts`](../src/core/careerMatchContinuation.ts),
[`careerMatchProvenance.ts`](../src/core/careerMatchProvenance.ts) and the extended
[`careerMatchContract.ts`](../src/core/careerMatchContract.ts) implement result v2
with continuation/source v1. Existing input/result v1 and full canonical results
remain supported. The result source is `canonical_plus_summary`.

The career toolbar freezes the authoritative state before opening the requested
confirmation, including when an unselected human decision is pending. Cancel
restores its previous running/paused state. Referee/card/advantage, injury assessment,
substitution entry and released-shot/challenge transitions must reach a safe boundary
first. The feature is absent from ordinary developer Match Lab controls.

The detached, validated prefix retains elapsed time, period end, score, every
participant's genuine statistics/condition/injury, active identities, cards,
completed substitutions, consumed substitution opportunities, important canonical
match events and the fingerprint of the actual controlled decision evidence. A
selected but unresolved action has explicit `unresolved_at_handoff` disposition;
an unselected prompt is recorded without selecting anything on the human's behalf.

The suffix seed uses fixture identity and a football-only handoff fingerprint.
Whether React has displayed an unselected decision prompt cannot affect this seed.
Appearance, camera and presentation seed are absent. Identical state/context repeats
exactly. Different genuine handoff states can produce different suffixes.

[`summaryMatchContinuation.ts`](../src/core/summaryMatchContinuation.ts) extends
lightweight summary football with a duration interface. A Poisson goal contribution
integrates bounded quality/home/condition/player-number context over remaining
seconds. It never draws a whole 90-minute score to add, targets a full-match score,
or advances hidden physical ticks. Known added time from the actual period ledger
is included; the approximation generates no new detailed stoppage history.

The suffix deliberately models team score, continued participation and additional
condition cost only. It makes no further tactical substitutions or injuries/cards,
and never re-enters an outgoing/dismissed/unavailable player. Existing bench players
remain unused unless they genuinely entered before handoff. All individual action
counters and team accounting remain **partial canonical prefix values**, exactly
unchanged. It does not attribute estimated goals to invented individual scorers,
assists, contacts, saves or decisions. The record's explicit coverage is
`canonical_prefix_only_except_minutes_and_condition`; career UI discloses this.
A mixed goalkeeper appearance cannot manufacture a clean sheet from partial data.

The result validator rejects changed prefix counters, evidence, cards, substitutions,
injuries, reversed score increments, illegal minutes/entry, unknown participants,
invalid period/duration accounting and lost/exceeded substitution allowance. Existing
ownership, input fingerprint, stale fixture and conflicting-result checks then apply.
One immutable commit uses the existing save queue and one fixture participation row.
Computation failure leaves the original runtime; storage failure retains the final
combined result for retry. Successful completion and stale/double callbacks are guarded.
No recovery, development or fitness is applied a second time on retry.

## Persistence and retention

Save v7 receives additive optional provenance/source values; old v3–v7 saves and
fully canonical v1 records remain readable. Natural growth/styles introduce no
persisted full NPC copies. Exceptional attribute overlays retain their existing
absolute precedence. Condition records identify mixed provenance explicitly.

The existing 96,000-byte result limit and three-rich-result active-season window
remain. Permanent compact receipts retain score, identity, discipline, important
prefix events/substitutions, coverage, handoff time, prefix fingerprint and decision
style evidence. Expired rich results are removed; their idempotency receipts remain.
The prefix is football summary data, never ball/body physics or a resumable full
snapshot. Uncommitted refresh still restarts the fixture, as in PR166. Recovery
from failed storage keeps the previous saved career intact; the retryable result
is held in the open tab.

## Verification and reproducibility

Focused suites:

- [`pr167NpcDevelopment.test.ts`](../src/core/pr167NpcDevelopment.test.ts): all eight
  curves, random access, family/character/environment differences, equal-OVR diversity,
  goalkeeper aging, origin academy and legacy transfer consistency, appearance,
  overlays/save/load, six styles, future cohorts and actual squad strength.
- [`careerMatchContinuation.test.ts`](../src/core/careerMatchContinuation.test.ts):
  0:0/12', 2:1/63', halftime, 3:2/89', outgoing/incoming/unused bench, controlled
  dismissal/injury consequences, pending selected/unselected decisions, corrupt
  prefixes, presentation-independent RNG, compact receipts and save/load/next fixture.
- [`pr166CareerMatch.test.tsx`](../src/app/match/pr166CareerMatch.test.tsx): actual
  fixture choice, no-runtime summary, cancel/return, double/stale callbacks and
  failed-save retries for both new paths.
- [`backgroundOrchestration.test.tsx`](../src/app/match/backgroundOrchestration.test.tsx):
  authoritative freeze, modal cancel/resume, exactly one accepted handoff and no
  further ticks. Existing PR166 PlayStyle tests exercise all six real shared effects
  on canonical bodies. Existing storage tests cover failed/aborted queued writes.

No existing timeout/assertion was relaxed. The first parallel main run passed
1,660 tests but the existing controlled-substitution UI case exceeded its unchanged
30-second timeout (31.611 s). Its unchanged isolated suite passed all 21 tests,
including that case in 26.037 s. The CPU-sensitive orchestration suite now joins
the existing serial restart/renderer integration stage in `package.json`, running
exactly once under the same `npm run verify`; no test is omitted or weakened. The
second full run passed main, serial integration and canonical contract suites, then
three full-career cases exceeded their unchanged 60-second limits (69.8–72.3 s).
Repeated pure NPC projections were the avoidable CPU cost; the bounded cache above
removed it without changing outputs. The unchanged five-test full-career suite
then passed in 53.09 s total. The old start-button assertion follows its requested
new label and prepares a real selected fixture. Complete `npm run verify` status
and final measurement tables follow below.

Reproduce with `npm run verify`, then:

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr167Diversity.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr167Continuation.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr167.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/preparePr167Browser.ts
node scripts/benchmarkPr167Browser.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr167.ts ../pr167-browser-career-save.json
```

Browser work requires a local production `dist`, Playwright (`MFL_PLAYWRIGHT_MODULE`
when external) and Edge or `MFL_BROWSER_CHANNEL`. The professional browser source
save is built through real career APIs; the youth career is created through the UI.
The actual browser save remains a local intermediate, not a committed world dump.
The fixed-minute benchmark states are constructed contract fixtures, clearly distinct
from the physically observed browser prefix.

## Browser evidence and limits

[Browser receipt](performance/PR167-browser.json) records actual headless Edge over
local uncompressed production HTTP. It covers youth/professional Summary, professional
Play → Remainder, youth Play → deliberate UI choices → Remainder, cancel, durable
reload equality and advancement to a different fixture. It checks that canonical
modules are absent before the choice and after full Summary. No match state was
injected. [Confirmation screenshot](images/PR167-remainder-confirmation.png) was
visually inspected. Heap samples are live JS heap snapshots, not peak memory/GPU FPS.

An exploratory automation waiting for eight future choices remained at three
selections and displayed first-half added time `45+113:07`. That run was stopped
without a result commit; its physical cause was not traced. The scoped smoke
finishes through the requested continuation after actual deliberate decisions. It
establishes continuation/persistence, not universal canonical match liveness or a
new attacking-flow calibration. No action quotas or broad engine changes were added.

## Questions from the implementation request

| # | Answer and evidence |
| --- | --- |
| 1 | Eight natural curves, archetypes, position-weighted OVR, DOB aging, sparse overlays, youth/retirement/transfer/selection and canonical roster integration already existed; see initial audit. |
| 2 | Specialised growth/plateaus/environment, current profile propagation, NPC shared styles and career-scoped strength caching affect real selection/quality/actions; NPC and existing shared-effect suites verify this. |
| 3 | The eight family timing/rate differences are listed above and measured on the same seeded cohort below. |
| 4 | Yes: equal-age/equal-OVR cohorts retain different attributes, character, headroom, trajectory and stable variation; the diversity regression checks their different development. |
| 5 | Yes: physical decline starts earlier and is stronger while mental growth/retention can continue. All eight curve tests compare these families. |
| 6 | Yes: distinct goalkeeper family/late-prime timing and preserved specialist positions; goalkeeper/outfield aging regressions cover it. |
| 7 | Real origin club/parent academy coaching and facilities change growth within bounded rates. Unknown environments are neutral; destination history is not reconstructed. |
| 8 | Pure projection, a capped evidence-derived experience layer, absolute exceptional overlays, then temporary condition recovery; no seasonal natural-growth writes. Save/reload tests ensure no double growth. |
| 9 | Yes: existing effective resolvers feed selection, transfer/contract ranking and turnover. Retirement remains the existing stable DOB/character policy, not a new fluctuating quality lottery. |
| 10 | Yes: actual XI strength changes with profiles/membership; the same-date/same-roster changed-career regression proves cache invalidation. Routine league ratings retain their existing refresh schedule. |
| 11 | Stable role/attribute affinity, measurable skill development and separately labelled known participation. No detailed NPC action histories are invented. |
| 12 | Yes: canonical starter/bench bodies receive the same style fields and PR166 contextual mechanics; actual input/body equality and all six shared-effect tests verify this. |
| 13 | Every fixture that the existing career rules route to Play first shows the two choices. Routine/`simulate_all` fixtures remain automatic. |
| 14 | Yes: the full Summary path executes no canonical ticks or runtime import; both youth and professional browser scenarios verify it. |
| 15 | Yes: it remains the permanent preference and the existing automatic path; the new per-fixture helper preserves it. |
| 16 | Yes: the career toolbar freezes a valid canonical prefix, confirms and integrates only its remaining duration. |
| 17 | Yes: the prefix score is an immutable additive starting value; 2:1/63' and 3:2/89' regressions cover it. |
| 18 | Yes: prefix participants, substitutions/opportunities, cards and injuries are preserved; inactive players receive no further minutes or condition cost. |
| 19 | Validators reject negative/changed action counters and illegal participation. Unknown suffix individual statistics are explicitly partial, not fabricated. |
| 20 | Yes: result v2, continuation v1, `canonical_plus_summary`, timestamp/fingerprint and explicit coverage survive compact retention. |
| 21 | One existing fixture ledger/receipt and save transaction; duplicate/stale callbacks and conflicting commits are tested, including retry after a failed write. |
| 22 | Yes: both new routes pass core save/hydrate and actual browser durable reload, then reach a different fixture. |
| 23 | The fresh and actual-browser careers run through 20 seasons, checking legal squads and save/load identity at milestones; distributions and turnover are below. This is summary-led long-career evidence with one actual mixed fixture, not 20 seasons of physical 3D games. |
| 24 | Measured CPU, heap and save/result sizes are below and in the machine receipts; no isolated GPU/FPS claim is made. |
| 25 | PR168 retains coaching preferences/briefings, opponent analysis and richer situation/decision/tactical evaluation. PR169 stories/news and PR170 atmosphere/visual polish remain in order. |

## Remaining scope

No full training-environment history, detailed statistical suffix player actions,
new suffix coaching/substitution/injury model, mid-match persistence checkpoint,
complete replay archive, general match-balance calibration or narrative/news system
is included. The observed extended first-half case remains open. These limitations
are explicit in the data/UI and are not hidden by fabricated statistics or outcomes.


## Controlled equal-OVR cohort

[640-profile receipt](performance/PR167-diversity.json): 80 profiles per position, all age 18/target OVR 58, using the existing archetype generator. These are measurement fixtures, never additional in-game recruits. Family distributions and standard deviations are in the JSON.

| Position | Initial OVR range | Age 28 OVR mean (range) | Age 38 OVR mean (range) | Initial pace − technique range |
| --- | ---: | ---: | ---: | ---: |
| goalkeeper | 58–58 | 60.40 (59–64) | 59.29 (56–66) | -21…25 |
| center_back | 58–58 | 61.25 (58–65) | 58.08 (53–64) | -21…23 |
| left_back | 58–58 | 60.70 (57–64) | 56.62 (50–62) | -24…39 |
| right_back | 58–58 | 60.69 (57–64) | 56.64 (49–62) | -21…40 |
| central_midfielder | 58–58 | 61.10 (59–64) | 58.25 (53–63) | -30…20 |
| left_winger | 58–58 | 61.02 (58–64) | 57.49 (51–63) | -23…32 |
| right_winger | 58–58 | 60.90 (58–64) | 57.29 (51–62) | -23…29 |
| striker | 58–58 | 60.77 (58–63) | 56.88 (50–62) | -25…31 |

Representative equal-OVR examples (all at age 18; deterministic IDs in the receipt):

| Position / example | OVR | Pace | Technique | Strength | Passing | Tackling | Heading | Handling / kicking |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| goalkeeper / 1 | 58 | 62 | 51 | 58 | 53 | 51 | 68 | 68 / 70 |
| goalkeeper / 2 | 58 | 46 | 50 | 42 | 36 | 57 | 63 | 91 / 52 |
| center_back / 1 | 58 | 47 | 68 | 60 | 61 | 63 | 50 | 11 / 19 |
| center_back / 2 | 58 | 59 | 36 | 73 | 37 | 61 | 71 | 23 / 16 |
| central_midfielder / 1 | 58 | 44 | 74 | 56 | 70 | 43 | 47 | 17 / 17 |
| central_midfielder / 2 | 58 | 70 | 50 | 49 | 57 | 54 | 40 | 10 / 5 |
| left_winger / 1 | 58 | 53 | 76 | 56 | 56 | 35 | 53 | 19 / 11 |
| left_winger / 2 | 58 | 80 | 48 | 48 | 49 | 39 | 62 | 23 / 6 |
| striker / 1 | 58 | 38 | 63 | 55 | 46 | 36 | 62 | 13 / 5 |
| striker / 2 | 58 | 70 | 39 | 44 | 54 | 45 | 51 | 6 / 17 |

The measured range is not a target population quota. The keeper examples distinguish line skill from distribution within the same specialist OVR. Attribute changes alter positional usefulness without rewriting the player’s positions or familiarity.

## Final verification and bounded measurements

`npm run verify`: **PASS**, 1,702 tests, lint and production build; elapsed 1434.6 s. [Verification receipt](performance/PR167-verification.json). All original test timeouts/assertions remain; no tests were skipped to obtain this result.

| Verify stage | Passed tests |
| --- | ---: |
| main | 1641 |
| serial match integration | 52 |
| full canonical contract | 4 |
| full careers | 5 |

Warm local Node measurements ([receipt](performance/PR167-continuation.json)). Handoffs are constructed consistent fixtures, not timed physical games. Each suffix was repeated 100 times with identical results and zero physical ticks.

| Handoff | Remaining seconds | Median / p95 ms | Result bytes |
| --- | ---: | ---: | ---: |
| 12' / 0:0 | 4680 | 6.85 / 9.72 | 39,225 |
| 45' / 0:0 | 2700 | 6.51 / 8.03 | 39,228 |
| 63' / 2:1 | 1620 | 8.59 / 11.13 | 39,227 |
| 89' / 3:2 | 60 | 8.40 / 10.06 | 39,229 |

Whole-fixture routine summary: median 0.107 ms, p95 0.317 ms over 100 warm repeats. These measurements include no network/storage and are distinct from browser click-to-saved-career latency below.

| Actual Edge scenario | Click-to-summary-and-save ms | Save bytes | Reload / different next fixture / errors |
| --- | ---: | ---: | --- |
| youth-summary | 30 | 49,542 | True / True / 0 |
| professional-summary | 60 | 73,889 | True / True / 0 |
| professional-play | not separately timed | 123,636 | True / True / 0 |
| youth-play-remainder | not separately timed | 103,492 | True / True / 0 |

The observed youth prefix handed off at 517.000 simulated seconds after 3 selected / 2 genuinely resolved UI decisions. Combined result: 44,291 bytes; modal cancel preserved the match. The professional Play scenario also reached the real runtime and committed a remainder. Both whole-summary scenarios loaded no canonical module before/after the choice.

Two independent 20-season runs use existing routine-summary career progression: [fresh](performance/PR167-world.json) and [actual browser mixed-result save](performance/PR167-world-browser.json). The latter preserves its original receipt/fingerprint through NPC turnover, rich-result compaction and reload. Each run checks all 64 clubs at every season boundary; milestone saves are parsed/hydrated and all effective profiles compared.

| Source / completed seasons | Mean OVR (p10 / median / p90) | Mean age | Squad min | Retired | Save bytes | Projection ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fresh / 0 | 57.11 (42 / 57 / 73) | 26.26 | 24 | 0 | 45,749 | 16.81 |
| fresh / 1 | 57.14 (42 / 57 / 73) | 27.18 | 24 | 0 | 91,810 | 46.79 |
| fresh / 5 | 57.13 (45 / 55 / 72) | 27.05 | 24 | 304 | 707,406 | 117.99 |
| fresh / 10 | 56.15 (48 / 54 / 69) | 26.66 | 24 | 755 | 886,456 | 171.28 |
| fresh / 20 | 53.68 (49 / 53 / 59) | 26.63 | 24 | 1623 | 1,214,191 | 254.60 |
| browser / 0 | 57.11 (42 / 57 / 73) | 26.45 | 24 | 0 | 103,492 | 30.23 |
| browser / 1 | 57.14 (42 / 57 / 73) | 27.18 | 24 | 0 | 163,286 | 44.64 |
| browser / 5 | 57.08 (45 / 55 / 72) | 27.09 | 24 | 313 | 712,094 | 113.00 |
| browser / 10 | 56.01 (47 / 54 / 69) | 26.64 | 24 | 759 | 911,262 | 163.96 |
| browser / 20 | 53.82 (49 / 53 / 59) | 26.67 | 24 | 1620 | 1,218,672 | 242.13 |

| Source | Total run seconds | Ordinary transfers by season 20 | Critical repair signings | Final active seniors | Final live heap before → after MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| fresh | 25.67 | 605 | 0 | 1536 | 199.3 → 253.9 |
| browser | 25.75 | 581 | 0 | 1536 | 250.7 → 246.1 |

Both runs retain legal squads: no club below 18, without a goalkeeper/ten outfield players, or with duplicate senior membership at any sampled boundary. Youth replacement and bounded existing transfers maintain population without extra activity generation. The distributions show differentiated development and generational turnover, not universal OVR inflation. Per-position/family distributions, example identities, style counts, attribute overlays and all season health rows are retained in the receipts.

Heap values are live samples taken around generation/audit/serialization and may rise or fall with garbage collection. They are neither peak memory nor retained-allocation/leak measurements. CPU values are single local runs, without concurrent heavy benchmarks; no GPU/FPS claim is made.

The same 547 original U-21 NPCs are rebased to age 18 only for the following controlled comparison, retaining each individual profile/capacity/character. These are measurement fixtures, not new recruits. All eight curves use exactly the same cohort.

| Curve | Mean OVR at 18 → 23 → 28 → 33 → 38 | Mean pace 28 → 38 | Mean reading 28 → 38 |
| --- | --- | ---: | ---: |
| early_peak | 50.46 → 52.50 → 52.44 → 49.81 → 46.16 | 48.71 → 35.84 | 57.82 → 57.47 |
| rapid_start | 50.46 → 52.98 → 54.05 → 52.45 → 49.55 | 51.96 → 42.06 | 58.52 → 59.38 |
| balanced | 50.46 → 52.53 → 53.82 → 52.42 → 49.48 | 52.26 → 42.51 | 57.82 → 58.56 |
| steady | 50.46 → 52.21 → 53.51 → 52.91 → 50.62 | 52.34 → 45.04 | 57.42 → 58.72 |
| late_bloomer | 50.46 → 52.35 → 54.01 → 54.12 → 52.11 | 52.73 → 45.99 | 57.82 → 60.60 |
| long_prime | 50.46 → 52.39 → 54.03 → 54.16 → 52.62 | 52.99 → 47.93 | 57.63 → 60.27 |
| physical_early_mental_late | 50.46 → 52.37 → 52.46 → 50.48 → 47.58 | 48.66 → 35.30 | 57.15 → 59.95 |
| goalkeeper_late_prime | 50.46 → 52.01 → 53.04 → 52.22 → 50.07 | 51.10 → 42.24 | 57.42 → 59.88 |
