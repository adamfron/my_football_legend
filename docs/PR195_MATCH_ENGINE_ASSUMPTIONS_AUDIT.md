# PR195 — MatchEngine Assumptions Audit, Calibration Registry & Realism Programme

## 1. Executive summary

PR195 establishes a persistent source-backed research and repair programme: **133 stable open items**, the entire initial 128-item checklist plus five discoveries, a source inventory, PR176–194 reconciliation, causal dependency map, calibration protocol and first reproducible pilots. **Zero assumptions are declared COMPLETE.** Canonical remains **NOT READY**, **B remains default**, and independent confirmation remains **sealed**.

The pilot executes **504 controlled requests**, **30 isolated canonical locomotion trials**, and two genuine canonical tick captures with 8 paired alternative continuations. These are development diagnostics. They do not calibrate real football or demonstrate a better match policy. The implementation changes no existing canonical football mechanism, probability, policy default, save schema, attribute or tick rate.

## 2. Source revision and scope

Base: merged PR194, `e828f5a1e41bbec2101c71f42739037702276cce`. [Source inventory](performance/pr195/source-inventory.json) surveys 179 source and 140 test files in the complete MatchEngine subtree. The [pilot archive](performance/pr195/pilot-v1.json.gz) records normalized-LF runtime/harness file hashes; fingerprint **`ce39d2c5ec82d153d55ad0246d24efd14a4cbaabc18b7dec2de617a3a5fa6f0b`**. A Git commit identifies the complete PR; the fingerprint identifies measured runtime/method bytes and is not a Git SHA.

New code is research-only: `assumptionCalibration.ts`, `calibrationMetrics.ts`, scripts and seven measurement regressions. Existing live modules do not import these two new modules. The lockfile and existing canonical sources are unchanged. User-facing gameplay remains Polish; this English report documents engineering research. No browser-specific dependency is added to core simulation.

## 3. Audit coverage and methodology

[SOURCE_AUDIT](match-engine/SOURCE_AUDIT.md) contains the per-file inventory, import reachability, registry contexts, exclusions and limits. AST inspection found 3017 context-bearing comparisons/model calls across source and tests; these are discovery candidates, **not** that many proven defects. Bare literals, loop indices and formatting are not treated as football assumptions. Shared estimates/geometry are deduplicated and traced into their consumers.

Context review follows generation→admission→ranking→preparation→release→movement/contact→consequence/measurement. Historical/full-world policies and bounded O/H/J are separate paths. All major requested subsystems have actual file/symbol references. Complete enumeration is not a claim of complete empirical understanding or per-expression causality. Further discoveries must add stable IDs without deleting inconvenient items.

## 4. Prior research reconciliation

[PRIOR_RESEARCH](match-engine/PRIOR_RESEARCH.md) reconciles every PR176–194 with reusable evidence, changed-consumer limitations and registry IDs. [Report-hash manifest](performance/pr195/prior-research.json) preserves exact normalized report identities. Historical archives remain in place and are not renamed PR195 results.

PR176 identified incompatible values, long-launch disagreements and coupled gates; PR177 added common state-value plumbing. PR178–183 supplied contact, role, tempo, aerial and negative match research. PR184–186 established physical apparatus, attribute sensitivity and cognition contracts while explicitly leaving calibration open. PR187/188 bounded on-ball experiments did not certify all controllers or full-match liveness. PR189–192 repaired contact/reception/recovery and measurement defects without solving match flow. PR193/194 retained substantial policy-specific harms despite promising local mechanisms. Existing exact-source replay CI is preserved.

## 5. Registry statistics and validation layers

[ASSUMPTIONS_REGISTER](match-engine/ASSUMPTIONS_REGISTER.md) is the authoritative editable checklist. Every item records source, rule/values, classification, provenance limits, evidence/missing evidence, consequences, dependencies, severity, lab, strategy, acceptance, status and future closure PR/commit. I/F/E/T/M/C distinguish correctness, feasibility, empirical calibration, tactical validity, full-match transfer and independent confirmation. A related test is partial contract evidence, never item-wide completion.

| Classification | Items |
|---|---:|
| PROBABILITY_CLAIM | 9 |
| STRUCTURAL_GATE | 12 |
| HEURISTIC_UTILITY | 12 |
| SUBJECTIVE_PRIOR | 3 |
| TIMING_ASSUMPTION | 12 |
| EMPIRICAL_PARAMETER | 24 |
| GEOMETRIC_APPROXIMATION | 14 |
| UNIMPLEMENTED_CAPABILITY | 12 |
| TACTICAL_ASSUMPTION | 19 |
| LAW_OR_DEFINITION | 8 |
| ENGINEERING_GUARD | 7 |
| PHYSICAL_CONSTANT | 1 |

| Priority | Items |
|---|---:|
| P0 | 44 |
| P1 | 76 |
| P2 | 12 |
| P3 | 1 |

Statuses: 103 LAB_REQUIRED; 4 REFACTOR_REQUIRED; 14 LAB_ACTIVE; 12 BLOCKED. All boxes remain unchecked. P0/P1 priorities are supported by shared upstream dependencies and known negative research, not a fitted estimate of full-match effect size.

## 6. Most consequential suspicious assumptions

- **DEF-001/002, FIT-002:** bounded opponent envelope defaults to 7.6 m/s and 5.2 m/s²; the canonical model depends on skills, reserves, turning, planting and braking. The ETA projection shares only part of that model.
- **PASS-001/003/006:** completion combines baseline0.96 with lane/race/timing/boundary deductions, error-envelope mass and a separate retention map using reception-quality thresholds0.25/0.5. These are uncalibrated probability claims.
- **DEC-003/005/006:** policies generate different action menus and assign possession, loss and terminal outcomes through different scales/horizons. Shared branch normalisation does not prove comparable value.
- **DEC-013:** B uses the same scoring expectation for driven/placed/chip despite different executed trajectories/error profiles. PR186's concern remains reachable.
- **DRIB-005/006, GK-010, PHYS-002:** finite-contact implementation does not prove anatomically accurate geometry or measured restitution. Upstream response can shape every later event rate.
- **CONTACT-006/012/015:** generic injury assessment lacks a suspected-head pathway, delays assessment for unresolved shots/rebounds, and outside-area dropped-ball selection still uses last touch. Referee/medical priority and current Law 8 need separate repair.

## 7. Candidate-generation and decision-value findings

The source map covers all nine selectable policy IDs. Legacy/risk-ablation, B with role variants, and bounded O/H/J share canonical execution but not identical generation or valuation. B pass range is 2–68 m; bounded range2–36 m. Canonical settled shots permit60 m and incoming29 m, while bounded shots use36 m plus a height-feasibility filter. Incoming bounded choices have a distinct control-first path. Legacy spatial passing retains an ability55 branch and combinations retain prediction thresholds.

The snapshot retains family membership and same-intent membership separately; neither asserts an identical target/delivery candidate or current admissibility. Full candidate records expose feasibility, legality, confidence, expiry, readiness and benefits. Canonical menu eligibility, policy selection and actual release remain separate. A missing incoming candidate can be a generation limitation while contact is physically possible. A present remote-ball shot family can still be explicitly infeasible and rejected.

The comparative-choice principle remains binding: evaluate a difficult shot/pass/clearance against the **other genuinely available actions**, including hold, not an ideal imagined continuation. No named bicycle-kick success chance, possession bonus or shot quota is introduced. The two captured-state experiments retain hold and the policy selection alongside available pass/shot alternatives. They do not constitute a representative full-match opportunity sample.

## 8. Prediction versus execution

The [full results table](performance/pr195/results.md) and [machine summary](performance/pr195/summary.json) show both signs of error. The operational event definition is explicit in [CALIBRATION_PLAN](match-engine/CALIBRATION_PLAN.md): intended-receiver touch in the original delivery before another control/restart, and receiver control plus own-team possession one second later. Existing forecasts do **not** yet have a sufficiently precise externally validated horizon/event contract. Differences below can include semantic mismatch as well as prediction/execution error; they are not pure fitted probability-error estimates.

| Event | Eligible n | Mean forecast | Observed | Forecast−observed | Brier | Clipped log loss |
|---|---:|---:|---:|---:|---:|---:|
| completion | 249 | 0.605 | 0.667 | -0.062 | 0.187 | 0.646 |
| retained | 248 | 0.477 | 0.524 | -0.047 | 0.236 | 1.404 |
| goal | 196 | 0.097 | 0.112 | -0.015 | 0.077 | 0.314 |

Only 249 of252 released passes have resolved completion labels; 248 have resolved retention labels. The remaining horizons are censored. There are196 released shot requests with a resolved requested-shot ID; 28 remote/high contact requests are rejected. Another28 hold requests intentionally have no kick release and are not counted as failed kicks.

Important strata: safe passes reach/control28/28; long passes reach/control0/28 despite mean completion forecast0.509; pressured receivers are touched24/28 but one-second retention occurs7/28. Keeper-away shots score20/28 against mean forecast0.233, while the nominal good-shot scene scores0/28 against0.131. An acceptable-looking pooled goal average would conceal these differences. Scene labels are hypotheses, not guaranteed safety/danger or real-world chance categories.

## 9. Physical feasibility gaps

All28 infeasible high/remote shot requests fail contact and release. An independent test prevents an inherited last-touch ID from becoming a fabricated new touch, and a rejected request cannot inherit a later unrelated goal. Contact witnesses are changes in canonical last-touch/contact facts; spatial proximity is recorded separately.

The engine has driven/placed/chip, first-time/half-volley/volley and header labels with limited contact models. A complete toe-poke or overhead/bicycle takeoff/rotation/airborne contact/landing/recovery/law chain is absent. Optional articulated body-reception experiments do not prove the missing finishing or goalkeeper leg-gap capabilities. SHOT-009/010/011 and DRIB-005/006 remain open.

## 10. Special tactical and restart gaps

GK-008/009 and TACT-010 register last-corner goalkeeper participation. Required paired stakes include forcing extra time, advancing, protecting a sufficient draw, substantial time remaining, league goal difference and different keeper aerial ability. Competition-advancement context is currently a prerequisite gap. Real travel, ordinary aerial contact, return effort and empty-goal counterattack cost must remain physical.

REST-004–008/012 register prepared versus quick corners, tall defenders travelling into the box, fast covering players, and containment buying time for recovery. Legal readiness is distinct from ideal tactical readiness. Liveness diagnostics cannot become universal release deadlines. Full implementation of these future tactical laboratories is outside PR195.

## 11. Pain, injury, fair-play and referee gap analysis

Existing discomfort/playable/unable/absence injuries and an18-second assessment are not a general temporary prone/get-up motor lifecycle. Do not replace the injury system or add random knocks/universal pauses to reach a dead-ball target. CONTACT-001–015 distinguishes physical force/fall, temporary function, medical status, referee authority, legal restart and optional sporting decisions.

Current rules were checked on2026-10-26 against [IFAB Law5](https://www.theifab.com/laws/latest/the-referee/), [Law8](https://theifab.com/laws/latest/the-start-and-restart-of-play/) and the [concussion substitution protocol](https://www.theifab.com/laws/latest/additional-permanent-concussion-substitutions-protocol/). Slight versus serious injury handling, assessment/re-entry conditions, exceptions and suspected-concussion procedures must be explicit. CONTACT-015 records the current outside-area dropped-ball would-retain/gain-possession priority versus the implementation's last-touch shortcut. No law or medical behaviour is changed in this audit. A voluntary kick-out or return is a player/team choice, not an automatic possession swap.

## 12. Pilot laboratory results

The frozen matrix contains18 scenes × seven skill matchups × two seeds × two mirrors. 448 kick releases occur among504 requests; outcome flags are non-exclusive. Original-shot terminal outcomes: 34 miss, 56 save, 22 goal, 80 block, 4 crossbar. Flight/ground contact and later ownership are separately retained. Rebound-capable geometry does not guarantee a rebound/corner; horizon corner/second-ball flags may include later autonomous play and are not direct initial-shot probabilities.

The30 fixed-target movement trials prescribe an8 m objective and use canonical locomotion/fitness. The following table shows one orientation of each mirror pair. Arrival inside0.8 m is a spatial event, not a useful intervention or control.

| Skill / initial momentum | Canonical ETA prediction (s) | Common bounded envelope (s) | Actual canonical movement (s) |
|---|---:|---:|---:|
| 20 / toward | 1.200 | 1.207 | 1.650 |
| 20 / away | 3.050 | 1.942 | 3.500 |
| 20 / transverse | 2.375 | 1.861 | 2.600 |
| 40 / toward | 1.125 | 1.207 | 1.525 |
| 40 / away | 2.575 | 1.942 | 3.000 |
| 40 / transverse | 2.000 | 1.861 | 2.250 |
| 60 / toward | 1.050 | 1.207 | 1.425 |
| 60 / away | 2.275 | 1.942 | 2.650 |
| 60 / transverse | 1.775 | 1.861 | 2.025 |
| 80 / toward | 1.000 | 1.207 | 1.350 |
| 80 / away | 2.025 | 1.942 | 2.375 |
| 80 / transverse | 1.600 | 1.861 | 1.850 |
| 100 / toward | 0.950 | 1.207 | 1.275 |
| 100 / away | 1.850 | 1.942 | 2.175 |
| 100 / transverse | 1.450 | 1.861 | 1.700 |

In this apparatus the canonical ETA is early by 0.225–0.450s. That supports a local model-mismatch hypothesis, not a universal correction factor. Autonomous pass episodes separately record proximity, sampled foot access, contact/disruption and control. Their chosen target can differ from the ETA target; do not fit a movement coefficient from that confounded comparison.

## 13. Negative findings and controls

The deliberately bad pass target produces defender control23/28; the safe delivery produces receiver control/one-second retention28/28. Caution can be justified. Infeasible contacts are rejected, even though later autonomous play may create a different shot. The stale-target experiment retains the actor's actual scene and does not retroactively reveal hidden receiver geometry.

No useful overhead/bicycle implementation, fully bounded defensive/GK/restart cognition, calibrated universal retention model, or independent readiness is demonstrated. No failed experiment is converted into a successful physical capability. The first instrumentation run stopped when an actual receiver left the active XI; the observer now records absence/null distances rather than reinserting the player. Subsequent attribution review removed inherited contacts. Those are apparatus corrections, not gameplay repairs; seven focused tests and final replay cover their contracts. Intermediate scratch runs are not included in the final success counts.

## 14. Calibration limitations and uncertainty

Four trials per scene/matchup, homogeneous abilities, fixed geometries and mirrored/paired seeds are insufficient for empirical calibration. Wilson intervals are descriptive because samples are clustered. Probability-bin and skill tables, Brier, clipped log loss and AUC are included; good discrimination is not good calibration. No real-world dataset was fitted. Existing analytic output semantics need explicit event/horizon agreement before numerical fitting.

Only two states are harvested after controlled autonomous continuation. General selected-action bias remains open until full-match state harvesting and fresh varied geometries are measured. Keeper-away and long-pass discrepancies must be decomposed into prediction, execution, geometry and selection causes. Canonical outcomes are engineering truth for this engine, not proof of real-football truth. Real football, commercial game feedback and enjoyment remain distinct validation evidence.

## 15. Performance, determinism and verification

The final pilot's concurrent-host wall time is 176.8s; CPU user/system 189.0/3.5s; peak RSS 801.6MiB as reported by Node. It is not a serial full-match/no-debug benchmark or a universal speed factor. The10–15-minute full-match engineering target remains future work, with fixed40Hz unchanged.

Deterministic repeated/mutating-observer pairs and a bare canonical-continuation regression protect observation neutrality. The final replay recomputes full outputs before comparing compact hashes and retained witnesses. The hidden-rating test keeps bounded scenes/candidates/O/H/J decisions identical while engineering forecasts may differ. Exact source/input/seed identity and old save/replay contracts remain separate from statistical realism.

Verification status is recorded in [verification.json](performance/pr195/verification.json) with compressed actual logs. Final-head GitHub CI is checked on the PR, not inferred from an earlier revision. Existing historical replay checks are preserved; PR195 adds its own inventory/registry/pilot/summary check and evidence-tree immutability gate. Initial Windows sandbox temporary-file failures were environment/instrumentation failures; test bodies and timeouts were not weakened.

## 16. Dependencies and priority rationale

[MECHANISM_DEPENDENCIES](match-engine/MECHANISM_DEPENDENCIES.md) distinguishes actual source consumption from hypothesised football effects. The upstream order is event semantics→movement/reach/contact→predictions→available alternatives/comparable values→tactical/restart consequences→full-match distributions. Correcting one shared defensive estimate can affect several pass/carry/shot consumers, but no downstream effect size is assumed.

The graph includes shot technique→contact→candidate→value→actual shot→block/keeper/rebound→next possession, and set-piece participants→physical travel/work→readiness→release→cover/second ball→dead-ball time. Timing or event-rate targets are not substitute causes.

## 17. Recommended focused PR bundles

[CALIBRATION_PLAN](match-engine/CALIBRATION_PLAN.md) defines14 dependency-ordered bundles, each potentially several PRs, with qualitative complexity and exit evidence. First narrow the scope to PASS-001/006, DEF-001/002/003, DEC-003/013 and MEAS-011. Freeze a smaller causal subset, agree event semantics, establish baseline, change one mechanism, repeat paired diagnostics and expose regressions before broader transfer. Unrelated items remain open.

Later bundles address passing families, shot consequences, dribbling/contact, keeper/aerial, referee/injury priorities, quick/prepared set pieces, bounded team/competition objectives, fitness/recovery, natural match flow, serial performance and independent multi-policy/human/graphical assessment. There are no invented completion dates or promises to solve one category per PR.

## 18. Explicit unresolved blockers and closure summary

**Investigated:** all initial128 IDs plus DEC-013, CONTACT-015, PHYS-001/002 and MEAS-011; deep pilots for passing, defender arrival/intervention, shooting and measurement. **Completed assumptions:** none. **Blocked:** 12 capability/context items. **New discoveries:** technique-invariant B goal expectation, current dropped-ball recipient drift, shared physical response assumptions and explicit measurement attribution/censoring contracts. **Cross-system regressions:** no canonical behaviour is changed; historical physical/career verification remains required, while all known PR193/194 negative policy results are preserved.

Remaining gates include empirical geometry/response calibration; exact probability meanings; technique-specific forecasts; feasible comparative value; fully bounded controllers; temporary prone/head-impact handling; competition advancement; captain communication; long-phase effort; natural boundaries/restarts; serial no-debug performance; independent confirmation. No item may be deleted/checked solely because changing it is inconvenient or CI is green.

## 19. Canonical readiness decision

**NOT READY. B remains the default. Experimental features remain opt-in. Independent confirmation remains sealed.** PR195 delivers a durable audit/measurement programme, not a policy promotion, global statistical calibration or final MatchEngine improvement. The28 permanent attributes,40Hz canonical simulation, existing laws/physics implementation and historical compatibility remain unchanged by implementation.

## 20. MFL1.0 and possible MFL2.0 implications

The [roadmap](ROADMAP.md) preserves free browser MFL1.0 as the priority, with the full outstanding career/generational/world-strength scope. Conditional on at least moderate success, a more advanced desktop-oriented, graphically richer MFL2.0 may be considered, potentially on Steam at an inexpensive symbolic price. This is no platform/date/price/business commitment. No desktop shell, Steam integration, payment system or new3D renderer is implemented.

Canonical simulation, career/world data, authoritative events, persistence, presentation/rendering and diagnostics/replay remain separated. Future lightweight sequential/conditional simulation must be distilled only from sufficiently credible canonical full matches, preserving coherent results, goals/assists/cards, substitutions/reasons/minutes, important events, fitness and practice progression. No distilled model is trained in PR195.
