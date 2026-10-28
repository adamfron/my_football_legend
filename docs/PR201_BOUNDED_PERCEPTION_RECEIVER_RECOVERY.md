# PR201 — Bounded Perception & Receiver Recovery

## Outcome and scope

The causally supported defect is a motor-authority fallback: when no usable local reception target exists, the bounded receiver can abandon its present location for a remote formation anchor. This turns missing interception evidence into an unrelated movement instruction. The opt-in `hold-local-v1` correction brakes at the player's own position until an observed target or a higher authority supplies a destination. It changes the acting canonical MatchEngine, not an outcome observer.

Frozen 180-ball direct contact/control/one-second retention improves **100/73/73 → 124/97/96**, with censoring **1 → 1**. PR200 fresh 90 improves **27/22/20 → 36/32/28**, censoring **4 → 4**. New development 90 improves **26/22/21 → 35/32/31**, censoring **7 → 3**. Seven paired local retention losses remain. These are dependent development comparisons, not external calibration or independent confirmation.

`realism-candidate-v0` retains its historical selection, checksum and behaviour. `realism-candidate-v1` identifies the new optional behaviour; `realism-candidate-no-recovery-v1` is its isolated ablation. The configuration schema remains edition 0; the profile ID and implementation identify the changed behaviour. The original 16 feature switches, policy choice and auxiliary settings remain separate from the versioned recovery selection.

**Mechanism decision: RETAIN_EXPERIMENTAL. Whole candidate: NOT_READY_FOR_PROMOTION. Canonical NOT READY; B default; independent confirmation sealed; 135 IDs, zero COMPLETE.**

## Work stages and baseline

The work followed five gates: reproduce PR200; distinguish information and motor hypotheses; implement one bounded correction; validate real reception/keeper/negative cases; compare maintained full matches and prepare this report. No protected confirmation cohort was opened.

Base: merged PR200 `df6d93df39d1bebfa5d395e29620224670520971`; PR200 head `27fc1a0cf3a2900df2415048e11c64983985b521`; normalized base source fingerprint `ae47eb1fdef3168e9ae2c729b201ffbfea39a2977684f21496c6586fabff97c0`. The [frozen manifest](performance/pr201/frozen-pr200.json) retains 2,087 Git blob identities and all 135 issue IDs. Source archives store normalized byte manifests and changes against this exact base. Every measured receipt binds its implementation archive, input/release/seed identities and complete final-state hash.

Before changing runtime code, this actual command passed every original result/hash assertion:

```sh
node scripts/replayPr200Experiment.mjs --case=frozen-final,fresh-final,diagnosis-final,keepers-v3,information
```

That covers 900 frozen, 450 fresh, 55 selected diagnostic and 84 keeper continuations, plus seven information interventions. R remains154/123/116 and S149/113/108 on the same180; incoming-facing155/117/112 remains a historical negative comparison against R's control/retention. Original receipts and definitions are unchanged.

## Diagnosis and competing hypotheses

Actual path: `advanceLiveBallFlight` acquires positions before the tactical update; `observeReceptionBall` feeds receiver planning on the existing tactical cadence; `projectLiveReceptionTarget` and `receptionMovementContactTarget` propose a local target; the final `boundedMovementTarget` chooses authority; `integrateCanonicalMovement` executes finite acceleration, braking and turning; native foot/body contacts and first touch determine outcomes. Keeper positioning and active-save permission use the same sensory boundary.

`observedMotorBall()` does return null without usable velocity. However, a single position already supports facing through `observedFlight`; it does not imply total bodily inactivity. In the eleven selected cases, usable optical motion commonly arrives with the first actual acquisition. Neither adding position-only pursuit nor refreshing the motor view each tick recovers a contact in those cases. This does not disprove a position-only problem in other geometries; it rejects installing it as the explanation for these losses.

| Intervention on identical 11 releases | Direct touch | Direct control | Direct retention | Censored |
| --- | ---: | ---: | ---: | ---: |
| PR200 bounded | 0 | 0 | 0 | 0 |
| Position-only response before velocity | 0 | 0 | 0 | 0 |
| Freshest legal motor view at each tick | 0 | 0 | 0 | 0 |
| Both information interventions | 0 | 0 | 0 | 0 |
| Hold only before any remembered sighting | 5 | 3 | 2 | 0 |
| Hold while no local reception plan exists | 5 | 4 | 4 | 0 |
| Hold, then pursue remembered position without a plan | 5 | 4 | 4 | 0 |
| Actual production recovery path | 5 | 4 | 4 | 0 |

The positional-pursuit arm also has one deflected control, recorded separately; it does not become a sixth direct success. The smaller hold correction was selected before the full180/fresh comparisons. It supplies no guessed velocity or future interception. Earlier diagnostic next-action counters are retained in their source edition; the production trace and main comparisons condition those counters on control in the original episode.

The [initial information interventions](performance/pr201/receivers-diagnosis-initial-v1.json.gz), [fallback interventions](performance/pr201/receivers-diagnosis-fallback-v1.json.gz) and [production traces](performance/pr201/receivers-diagnosis-v2.json.gz) preserve all eleven cases. Traces include actual acquisition/motion clocks, uncertainty, memory age, target, canonical movement inputs, facing/velocity/plant balance, real ball height, finite foot access, contacts, control and opposition intervention. Sampled access alone is not proof that a useful controlled contact was possible.

A concrete recovered example is cross_field/80/sample2. The old first motor destination is(38.23,40.24) from a body at(80,10); the recovery destination is its own position. Acquisition is actually later,11.900s rather than11.775s, yet a real contact occurs at11.925s and control at12.575s. This recovery cannot be attributed to privileged fresh information. Cross_field/60/sample3 records a passive contact at11.950s before acquired information at11.975s, without control: bodily presence is not an active or controlled reception. The remaining six no-contact cases are not relabelled feasible successes.

## Code correction and compatibility

The behavioural change is the fallback destination inside `liveBallFlight.boundedMovementTarget`, gated by optional, schema-validated `boundedReceiverRecovery: 'hold-local-v1'`. It applies only to an unowned ball with the named reception preparation and no local reception target. An observed target, known challenge/carry, human movement or keeper command retains the existing authority order. Restarts and the existing human movement bypass remain in their canonical callers.

No observation cadence, velocity estimate, uncertainty coefficient, release-time target, first-touch formula, foot radius, physical speed, ball integration, ownership award or action quota changes. Zero target displacement requests native braking; it does not zero or teleport velocity. Sightings remain absent, single-position, inferred or remembered according to the unchanged belief contract.

The profile resolver writes/clears the optional selection atomically, gives the successor a separate implementation identity and rejects incompatible saved selections. Old saves keep the field absent. New profile metadata explicitly inventories the recovery mechanism; the original PR200 feature catalogue and checksums remain reproducible. Tests exercise absent/valid/invalid state, round-trip continuation, actual hidden-truth motor equality, commitment expiry and historical profile checksums.

The complete-state audit caught an important baseline-edition distinction. All seven PR200 candidate-v0 matches reproduce their historical v3 final hashes exactly. The seven historical canonical v1 receipts use `pr200-integration-v0`; final merged PR200 already uses `pr200-integration-v0-final` with explicit auxiliary metadata. Their initial and final hashes therefore differ from the final merged source, despite identical physical ledgers. Their original exact-source replay assertions remain unchanged. An additional seven complete matches execute every runtime source byte from final merged PR200 with the archived measurement harness and require equality of the entire current canonical result, initial hash and final state hash. These [final-main compatibility proofs](performance/pr201/baseline-final-pr200/) are separate from the 28 primary development matches; no metadata is removed from the comparison and no score-only substitute is accepted.

The existing named-receiver dispatch and broader tactical controllers are not newly certified as wholly bounded. The correction adds no release truth to actor knowledge.

## Physical reception evidence

| Corpus | Trials per arm | PR200 bounded touch/control/retention | Recovery touch/control/retention | Censored before/after | Paired retention gains/losses |
| --- | ---: | --- | --- | --- | --- |
| Frozen PR198/200 | 180 | 100/73/73 | 124/97/96 | 1/1 | 27/4 |
| PR200 fresh development | 90 | 27/22/20 | 36/32/28 | 4/4 | 10/2 |
| New PR201 development | 90 | 26/22/21 | 35/32/31 | 7/3 | 11/1 |

The [180-ball receipt](performance/pr201/receivers-frozen-v1.json.gz) and [PR200 fresh receipt](performance/pr201/receivers-fresh200-v1.json.gz) retain exact original baseline final hashes. [New development](performance/pr201/receivers-fresh201-v1.json.gz) uses30 new seed/geometry keys, each with unpressured, immediate-pressure and late-reacquisition continuations: ground, long ground, lofted, diagonal and moving-lead families, abilities25/55/85, altered lateral/distance geometry and momentum. Initial release uses ordinary `resolveMatchAction`; all90 requests release. These are new development, not confirmation.

The primary local control/retention columns require a direct receiver touch. Raw original-episode control, deflected touches, uninterrupted retention, opponent control and censoring are also retained independently. On the frozen corpus raw receiver control is74→102 while direct control is73→97; this distinction is not hidden.

Actual availability for another decision requires original-episode receiver control, later ownership, `canReconsiderDecision` and real release access. Frozen opportunity counts are74→100; PR200 fresh21→32; new fresh22→35. Subsequent actions are separately recorded within the remaining eight-second observation window. Successful next passes remain sparse: zero in the frozen arms, one in each PR200 fresh arm, and0→1 in new development. The experiment does not establish general improvement in the quality of the next pass or a complete deliberate attacking sequence.

## Regressions, negatives and attributes

All seven strict-retention losses and two original positive controls have [dedicated physical traces](performance/pr201/receivers-diagnosis-regressions-v1.json.gz). Three losses are weak first_time cases: holding changes the route by which a body enters visual acquisition range; sample0 acquires at12.625s rather than12.025s and never records the original contact. The weak medium_ground case controls later,12.225s rather than12.100s, with greater pressure and loses one-second retention. Two PR200 short pressured balls still touch and control but retain less often. The new pressured short-ground loss is a direct-delivery loss followed by a deflected control/retention, preserved under both labels. These are limitations of local waiting and acquisition/preparation, not evidence for a speed bonus.

[Negative physical controls](performance/pr201/receivers-negative-v1.json.gz) use four development families with unreachable geometry, real opponent screens and adverse facing. Unreachable and screened arms remain0/4 direct receptions in both variants; adverse facing changes0→1 real controlled retained reception. The seven [information controls](performance/pr201/information-boundary-final-v2.json.gz) cover hidden velocity/spin/target, true optical intervals, unseen deflection with unchanged evidence clocks, stale active memory, actual keeper movement and withholding active-save permission. No hidden reflection becomes a fresh observation. Ordinary physical rebounds/deflected receptions remain in the canonical outcome ledgers.

The [attribute sweep](performance/pr201/receivers-attributes-v1.json.gz) contains56 controlled inputs × two variants: four same-launch development families, six existing attributes at20/80, plus acquisition-angle controls. Game reading changes interpretation, concentration affects acquisition cadence and also existing technical handling, agility/pace affect movement, and firstTouch/technique affect handling. There is no separate permanent observation attribute to invent; sensory exposure is controlled through geometry and existing concentration.

For recovery, the four-case direct control/retention aggregate is1/4 at both levels in these small attribute arms. Concentration still changes clocks: short-ground first acquisition1.025→0.900s and cross-field1.825→1.775s; the latter motion evidence is1.900s at high concentration, showing why no per-trial monotonic outcome is assumed. Facing toward the ball advances acquisition to0.175–0.325s versus0.925–1.975s in adverse-angle arms. These measurements show distinct mechanisms but are insufficient to calibrate an attribute response curve.

The first new-development observer run failed when a receiver legally left the player list. The observer was repaired to record absence and the complete90 cases were rerun; no result was dropped or credited. This was an apparatus error, preserved with its log.

Receiver continuations reuse the existing PR198 laboratory and release fixtures. Match, keeper and information runners reuse the maintained PR200 physical harnesses through small edition wrappers; no second set of physical executors or forecasting infrastructure was added. Their original defaults and historical archived editions retain exact comparisons.

## Keeper regression control

The [126 continuations](performance/pr201/goalkeepers-v1.json.gz) comprise42 legacy,42 bounded and42 recovery runs across clear/high_early/too_late/wall_initial/teammate_screen/facing_away/rotating_free_kick. Every recovery final state equals its bounded counterpart after removing only the recovery selection field: **42/42 complete-state hash matches**. The correction does not tune keeper performance.

Clear contact remains6/6; high_early5/6, too_late0/6, wall_initial0/6, teammate_screen3/6, facing_away3/6 and rotating_free_kick0/6 remain unchanged. Native contact/rebound witnesses are retained separately from actual catch/parry actions and goals. The historical contact witness does not identify which overlapping body/active envelope produced an intersection, so these are not relabelled as proven passive or active-only hits. Passive-body availability and withholding active-save permission remain separately tested. Screens that block the original shot are not keeper failures. Historical difficult-save regressions and uncalibrated anatomy remain open.

## Full-match integration and cost

<!-- PR201_MATCH_MATRIX:START -->

All **28 complete matches** finished. The table uses strict direct touch/control/one-second retention (D/C/R). Each cell also gives actual shots and score. The recovery-off successor independently reproduces every original pass/physical telemetry ledger of PR200 in all seven fixtures; its separately replayed complete state hashes and all four arms remain in [the summary](performance/pr201/summary.json) and source-bound receipts. Different profile selections remain part of the complete state identity.

| Fixture | Canonical D/C/R; shots; score | PR200 D/C/R; shots; score | Recovery D/C/R; shots; score |
| --- | --- | --- | --- |
| ss/opportunity-driven-v1 | 797/797/299; 0; 0:0 | 862/861/317; 0; 0:0 | 955/953/334; 0; 0:0 |
| ss/state-value-v1 | 1198/1029/455; 10; 4:0 | 1138/972/347; 8; 2:2 | 1302/1123/433; 10; 3:0 |
| sw/contextual-judgment-v1 | 959/954/479; 31; 7:0 | 858/855/446; 54; 12:0 | 1205/1201/574; 30; 12:0 |
| sw/state-value-v1 | 895/794/471; 26; 13:0 | 630/541/302; 15; 6:0 | 864/776/432; 33; 9:0 |
| ww/hierarchical-intent-v1 | 926/917/594; 2; 0:1 | 908/895/535; 1; 0:1 | 1149/1144/698; 0; 0:0 |
| ww/opportunity-driven-v1 | 537/495/230; 4; 2:1 | 543/516/193; 1; 0:0 | 608/576/241; 1; 0:1 |
| ww/phase-role-hybrid-v1 | 355/306/285; 8; 0:2 | 307/264/242; 16; 1:1 | 352/323/299; 16; 1:2 |

| Fixture | Passes attempted/completed: PR200 → recovery | CPU seconds: before → after (ratio) | Wall seconds: before → after | Peak RSS MiB: before → after |
| --- | --- | --- | --- | --- |
| ss/opportunity-driven-v1 | 2464/995 → 2638/1128 | 340.0 → 300.7 (0.88×) | 318.1 → 279.0 | 477.3 → 497.7 |
| ss/state-value-v1 | 2356/1408 → 2438/1553 | 321.5 → 320.9 (1.00×) | 294.6 → 291.9 | 552.2 → 553.3 |
| sw/contextual-judgment-v1 | 1243/887 → 1517/1276 | 354.0 → 408.4 (1.15×) | 332.9 → 383.5 | 506.8 → 498.2 |
| sw/state-value-v1 | 1561/738 → 1707/942 | 261.8 → 275.8 (1.05×) | 239.6 → 250.9 | 496.3 → 554.4 |
| ww/hierarchical-intent-v1 | 1400/870 → 1566/1182 | 407.5 → 364.3 (0.89×) | 384.1 → 344.4 | 590.2 → 499.8 |
| ww/opportunity-driven-v1 | 1810/517 → 1901/582 | 286.2 → 294.0 (1.03×) | 267.5 → 273.7 | 503.0 → 460.6 |
| ww/phase-role-hybrid-v1 | 704/322 → 710/371 | 309.6 → 307.2 (0.99×) | 285.2 → 283.8 | 482.0 → 500.5 |

CPU is measured user+system process time; RSS is each process maximum. No serial/no-debug budget or real-world calibration is certified. Per-configuration progression, shot consequences, turnovers, playing time, source/input/configuration identities and full hashes are in the summary.

<!-- PR201_MATCH_MATRIX:END -->

Every complete run uses `resolveIntegrationProfile`/`withIntegrationProfile`, the maintained WW/SS/SW inputs and unchanged PR200 development seeds. Policies are B/state-value, R3/phase-role-hybrid, O/opportunity, H/hierarchical and J/contextual. Four arms separate canonical, original candidate, recovery and the recovery-off successor ablation. Full state hashes, configuration manifests, source archives, all pass outcomes, progression, shot/score, turnover/recovery, keeper/rebound ledgers, ball-in-play time and CPU/wall/RSS remain in compact receipts. Full-match raw control/retention counters are not necessarily nested under direct touch; strict direct counters are reported alongside them.

These are one seed per representative configuration, not independent match populations. Whole-match CPU ratios include changed stoppages and event histories; concurrent-host wall times do not establish a portable serial match budget.

Strict direct control and retention improve in all seven recovery comparisons, but usable football does not follow uniformly. SS/O still has zero shots. WW/O still has one shot, and WW/R3 remains at sixteen. SS/B improves retained receptions347→433 and shots8→10; SW/B improves302→432 and15→33 but still finishes9:0. SW/J retains more receptions446→574 while shots fall54→30 and the12:0 extreme persists. These outcomes support a reception mechanism, not calibrated chance creation, shooting or competitive balance.

WW/H illustrates the remaining disconnect: completed passes rise870→1182 and strict retention535→698, while lateral passes rise808→973; final-third entries rise67→78 but possession time there falls532.3→424.475 seconds, box entries fall9→3 and box touches7→0. Tackle losses rise345→404 while bad-pass losses fall73→32. The old match's sole shot belonged to the opposition; total shots1→0 therefore does not demonstrate suppression of an available own-team shot. Reduced penetration and absent productive attack remain observable. Candidate-menu evidence is unavailable, so the next diagnosis must inspect the actual decision path before claiming why shooting was absent.

The harness audit found an additional measurement limit: actual decision traces omit candidate arrays when both active perception and transition intelligence are disabled, including these bounded profiles. Inherited zero menu/rejection counters are therefore unavailable data, not evidence that no candidates existed. The summary labels this explicitly; historical rows are preserved. Actual decisions, attempted actions, releases and their physical outcomes remain measured. No claim about missing shot candidates is inferred from those zeros.

## Reproduction and verification

The measured receiver invocations used `node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerPr199Lab.mjs scripts/benchmarkPr201Receivers.mjs`, with the individual `--mode` values below. Match coordinators used direct `node scripts/runPr201Development.mjs` with the shown pilot/remaining arguments. The npm aliases provide the same entry points. Exact executed commands, exit results and compressed log hashes are in the [core verification receipt](performance/pr201/verification/core-v1.json) and [final matrix/check logs](performance/pr201/verification/final-v1.json).

```sh
npm run benchmark:pr201:local -- --mode=frozen
npm run benchmark:pr201:local -- --mode=fresh200
npm run benchmark:pr201:local -- --mode=fresh201
npm run benchmark:pr201:local -- --mode=negative
npm run benchmark:pr201:local -- --mode=attributes
npm run benchmark:pr201:local -- --mode=diagnosis --version=v2
npm run benchmark:pr201:matches -- --pilot --workers=2 --version=v1
npm run benchmark:pr201:matches -- --remaining --workers=2 --version=v1
node scripts/runPr201Development.mjs --baseline-runtime --workers=4 --version=v1
npm run benchmark:pr200:check
npm run benchmark:pr201:source-replay
npm run benchmark:pr201:check
npm run benchmark:realism:check
npm run verify
```

Record commands refuse to overwrite; choose a new version for a new measurement. Read-only source replay reconstructs archived bytes against merged PR200, verifies every source hash, and compares all original results and final-state hashes. Match receipts are bound to the recorded Windows/Node24.22.1 environment; the inherited cross-platform long-match bit-identity limitation remains. Historical PR200 assertions run against its exact merged source and original documentation, with a private Git index/work tree. They are not weakened to accept changed current source.

`npm run verify` passed: 2,388 unit tests, 56 integration tests, four career-contract tests and five full-career tests, **2,453 total**, plus lint and the TypeScript/production build. The runtime stayed unchanged during verification; later tooling and documentation edits receive final lint, evidence/progress checks and current-harness equality checks. All twelve local archived source replays passed, including the failed-reception traces, negative controls and actual information interventions. The original merged PR200 evidence check also passed without changing its assertions. The initial apparatus failures and baseline-edition mismatch are preserved alongside successful reruns in the verification records. Exact pushed-head CI remains an additional required gate.

## Decisions and next gates

Research change: one local motor fallback. Local result: paired direct control/retention improves with seven preserved losses. Integration effect: stated per policy above. Promotion: retain the versioned experiment; whole candidate NOT_READY_FOR_PROMOTION. Next dependency: lawful acquisition/search and preparation for short blind/pressured arrivals, including the route to the first useful contact and the next real decision. Do not repair the remaining no-information cases by feeding release truth back to the player.

The [generated issue progress](match-engine/REALISM_PROGRESS.md) adds scoped evidence to existing PASS-004/006/009, TACT-009 and keeper regression control, with historical scopes preserved. One shared fallback repair is counted once. The separate [PR201 integration mapping](match-engine/INTEGRATION_EVIDENCE_PR201.json) records the new mechanism; the [PR200 mapping](match-engine/INTEGRATION_EVIDENCE.json) remains historical evidence for inherited components. No original I/F/E/T/M/C acceptance criterion is closed.

[PR202: Lean CI & Historical Evidence Preservation](PR202_LEAN_CI_AND_HISTORICAL_EVIDENCE_PRESERVATION_PROPOSAL.md) proposes measured job packing, shared installs and verified immutable source reuse. PR201 keeps the43-check surface: new unit contracts enter the existing verify job, lightweight receipts enter historical perception, the12 local source replays join the existing Windows platform job within30 minutes, and two new complete-match source replays plus one final-main canonical verification join each of the seven existing Windows current-cohort jobs within its unchanged45-minute limit. No large workflow rebuild is included.

Further football work follows gates, not a numbered PR-per-problem schedule: first useful physical control and continuation; then bounded off-ball cooperation/pressing/cover; then coherent policy-specific complete matches and measured cost; then a complete playable career with meaningful player choices, seasons/generations and presentation. Existing career/world/20–25-season obligations remain in the roadmap. Routine football is simulated; meaningful football is played. Optional MFL2.0 models are not a prerequisite for finishing MFL1.0.
