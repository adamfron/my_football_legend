# PR211 — Canonical pending strike lifecycle

## Gate A — execution and ownership audit (before implementation)

Base: merged main `0f817849e4f76aad9f72cb99b066895822ae9d42`, including PR210. Read the PR209/210 reports, project state, roadmap, release backlog and integration/dependency/assumption/calibration documents. This report distinguishes the proposed extension below from the base implementation.

The canonical entry is `stepCanonicalMatch`, normally called every 0.025 s. It prepares injuries, minimum players, keepers, substitutions, tactics and period-end rules. `stepTacticalMatchCore` resolves a pending human choice, reconciles possession, and freezes the complete snapshot at an actual human decision. Otherwise it advances clock/cooldown, restart/preparation records and movement intentions; chooses tactical targets; applies finite facing, balance, locomotion, lower-body pose and fitness; then advances injuries. Ball handling follows: post-goal/restart, active delivery, loose-ball, or owned-ball branch. Delivery/loose branches integrate the shared ball physics and compare their own contact/boundary candidates; owned control may select an NPC action then advance a finite carry contact. Pressure/challenge/action resolution follows ball handling. The outer wrapper applies laws, injuries/substitutions and period termination, reconciles physical control, observes liveness, emits action/match events and updates statistics. Save schemas persist `TacticalMatchState`; UI/career use this same executor.

**A. Ownership:** `ownerId` is identity, not attachment. `advanceControlledBall` independently integrates velocity/height/spin between finite touches. It can also supply a carry impulse, so an intentional pending swing must bypass ordinary carry contact without freezing the ball. Missing velocity is a legacy initialization convention; do not infer the runner's velocity as observed ball motion.

**B. Lifecycle:** `actionLifecycle.isActionResolutionInProgress` currently derives activity from flight/carry/restart/goal completion. It has no persisted intentional foot path. Extend that lifecycle with one schema-backed pending action, rather than another executor. Keep selected action distinct from executed release/events.

**C. First contact:** the canonical ball branch owns physical integration. There is no global scheduler in the base: delivery, loose, carry and later defensive challenge paths have separate ordering. A pending interval must explicitly arbitrate its finite foot, eligible competing feet/bodies and whole-ball boundary, then use existing law/contact/restart consumers. A selected striker has no implicit priority.

**D. Intervention:** base synchronous kicks cannot be interrupted between choice and release. The pending extension must end on an earlier touch, invalid episode/eligibility, boundary/restart, or finite swing expiry; it must not later award the old pass. Existing law consumers retain offside, goalkeeper, foul and restart authority. Terminal outer transitions must also remove pending state.

**E. Laboratory limitations:** PR209 evaluates a complete 120 ms window and extrapolates constant body velocity. Its privileged fixture meeting point, fixed original pose and absence of other bodies/laws cannot become live player knowledge or execution. Reuse its bounded effective path/contact solver, but supply each actual canonical body segment and only the current physical interval. Engineering foot radius/timing/capability and numerical uncertainty remain uncalibrated.

Gate A decision: pending state belongs to the existing action lifecycle; physical event ownership belongs to the canonical ball interval, with explicit deterministic event-time arbitration. Initial integration scope is an opt-in low inside-foot ground pass. Other action families retain their historical consumers. Implementation, evidence and promotion decisions follow below after validation.

## Research change and supported selection

`experimentalPendingStrike: low-pass-dev-v1` installs the low **inside-foot ground-pass family only**, for an owned ball at height ≤0.24 m, in open play without an existing challenge/restart, for an outfield actor. `matchActions` retains its ordinary participant, physical readiness and human-authority checks. Its existing nominal pass planner prepares launch metadata; nominal-contact interpretation bypasses the legacy endpoint-error sampler. The proposed launch is never installed as the live ball before contact. Shot/volley/header/cross/loft/first-time/keeper/free-kick families retain their historical paths. There is no new default, profile or attribute.

`actionLifecycle` recognises one `pendingStrike`, and `playerDecision` blocks ordinary menus for its actor while the existing executor continues. Repeated requests from that actor are rejected; the existing authority does not provide unrestricted mid-swing replacement. A real decision for another human participant still pauses the complete world. Incoming preparations retain their independent pending-reception path.

## Persistent representation and integration points

`pendingStrikeState.ts` defines versioned selection and resolution schemas; `matchState.ts` reuses the action, source and pass-diagnostic schemas. Pending state holds deterministic identity/actor/episode, original last-touch identity, selection/expiry clocks, phase, the finite prepared plan/path, one sampled perturbation and compact nominal pass metadata. It contains no duplicated world, player population or future ball trajectory. The measured pending record is **2724–2978 JSON bytes** across the 19 scenes. The runtime retains one pending record and one latest resolution, not a growing frame archive.

`commitPendingPass` preserves the original ball exactly. Execution perturbation is sampled from the existing seeded action convention once at commit. Timing is clipped to the disclosed ±20 ms experimental domain; timing's former duplicate patch/effort terms are removed. The intended meeting point is the current owned-ball point, without querying future authoritative motion. Consequently an unexpectedly departing or crossing ball can really miss. Initial capability retains PR207/209's disclosed assumed preparation fallback where no witnessed on-ball clock exists; it is not proof of a complete recognition-to-wind-up model. Actual pending elapsed time is added at contact, while the prepared spatial path is never silently replanned.

`matchSimulation` adds a pending-ball branch after canonical locomotion/lower-body updates and before ordinary flight/loose/carry handling. `pendingStrikeInterval` receives that exact body's start/end snapshots. `canonicalStrikeFoot` combines interpolated actual foot anchors, the PR209 body-relative finite stroke, actual canonical turn and anchor/rotational velocity. It never extrapolates the original body's velocity through the whole swing. The impulse is still `executeFootContact`; foot radius, reach, balance, preparation, current capability, actual height, velocity and spin remain finite. Uncontacted bodies retain their actual end-of-step velocities. A receiving body's existing finite control response can alter its velocity.

Each invocation consumes only its current interval. A batched pending call re-enters the same canonical executor in intervals ≤25 ms, including laws and observers; four 25 ms steps equal a 100 ms batched request. There is no private match simulation or final-state overwrite from PR209's 120 ms laboratory executor. `executeTemporalStrike` itself remains a laboratory consumer; live use reuses its prepared path and finite contact primitive.

## Arbitration, outcomes and conservative limits

Within a pending interval the candidate set includes the intentional foot, physically intersecting competing foot centres on canonical body segments, existing swept passive-body geometry, and whole-ball pitch-boundary crossings. A cheap broad phase nominates bodies; it grants neither contact nor the inherited 0.82 m reach as an enlarged collision radius. The foot search uses actual shared ball integration with at most 160 evaluations per actor/foot/interval. Whole-ball boundary time is refined with 32 bounded integrator evaluations. At most four events are serviced in an interval; already serviced actors cannot receive the same impulse again.

Times are ordered in deterministic 1 ns buckets. A tie uses boundary, passive/uncertain geometry, competing foot, intentional foot, then expiry; stable actor/foot identity breaks remaining ties. Selection does not grant the striker priority. Contact uses the actual incoming ball, contact normal, foot velocity, impulse and torque. The unused current interval continues from that physical result. Existing contact/reception/offside and restart consumers remain authoritative. Offside is captured at actual release, rather than selection.

| Result | Canonical consequence |
| --- | --- |
| Contact | One finite impulse; actual release metadata/pass identity and ground-contact fact are created then; the canonical event/statistics observer emits one executed pass |
| Earlier other foot/body | End the old intention; use actual finite reception or existing passive rebound; control is a separate result and may fail or be lost later |
| Earlier whole-ball exit | Cancel the old pass, preserve last real toucher and existing boundary/goal/restart laws; no selected-pass statistic |
| Geometric miss | End at the finite 120 ms expiry, without impulse/flight/pass/shot; drop nominal ownership and continue the real loose ball |
| Invalid episode/another touch/height/participation/restart/terminal state | Cancel and remove pending state; never later resurrect the selected pass |
| Unresolved search/initial overlap/tangent/separated geometry | Preserve `unresolved`; apply no speculative impulse and continue the unstruck ball against remaining known events. Uncertainty is not counted as a clean miss |
| Event-budget exhaustion | Preserve the last witnessed site conservatively for the next tick; retain a separate `continuationUnresolvedReason`, including after a known successful contact |

**Major remaining dependency:** existing `defensiveChallenge` resolves reach, readiness and possible body/foul outcomes at its step boundary and does not expose a precise shared substep contact event. This PR does not fabricate one or award the pending striker precedence. An active/new challenge conservatively cancels the pending intention with `challenge_timing_not_supported`, then the historical challenge/rules consumer continues. This is a lawful bounded termination, **not proof of physically earliest active-tackle arbitration**. Passive-body CCD also retains its inherited swept-segment approximation; near-coincident nonlinear body/foot events need a shared refined event contract. Goalkeeper active reach, articulated tackle feet and empirical preparation remain unvalidated.

Gate D therefore has positive local foot/boundary competition evidence but remains **PARTIAL / BLOCKED_BY_DEPENDENCY for general contact arbitration**. The implementation stops at this bounded complete experimental lifecycle instead of expanding into a second universal scheduler. No new opt-in full-match smoke or WW/SS/SW matrix is run before that dependency passes. Required historical/default tests remain separate compatibility controls.

## Canonical development evidence

The immutable [final receipt](performance/pr211/canonical-final-v4.json.gz), [source binding](performance/pr211/source.json) and reconstructible `source-<fingerprint>.json.gz` archives bind the complete runtime/harness/CI inventory and focused tests. Final source fingerprint is `cf232abc0869ca4f95aaf1fbcfc7429119c2f262f4fcc964af14a0622ed5867f`. The original attempt `canonical-v1.json.gz`, its cost and source archives remain with their original identities; later corrections do not overwrite it. Failed/interrupted command logs are retained in the verification archive.

The 19 deliberately constructed scenes yield **11 contacts, 2 genuine misses, 5 earlier-event interruptions and 1 unresolved initial penetration**. These are dependent engineering interventions, not empirical success probabilities. The full initial/selected state, action ID/episode, plan/perturbation, every 25 ms body/ball frame, contact vector/normal/impulse/spin, event/statistics output and continuation are retained. Normal/tangent impulse components are reproducible from stored `J` and unit `n`: `Jn = J·n`, `Jt = J − Jn*n`. Physical success is reported separately from later owner, restart and pass result.

| Scene | Observed physical outcome |
| --- | --- |
| Ordinary 0.5 m/s rolling ball | Selection at 10.000 s changes no ball state; contact **10.078915781 s**, outgoing `(8.715449, 0, ~0)` m/s |
| Advancing / braking / turning | Actual canonical movement continues; contact **10.083836836 / 10.082925100 / 10.082269904 s**; turning produces lateral velocity and spin |
| Defender first / teammate first | Actual finite competing contacts **10.006083924 / 10.006400149 s**; no delayed original pass. Later turnover remains a separate real event |
| Defender late | Intended foot contacts first; a later defender may still make the pass tactically unsuccessful |
| Touchline / goal-line | Real whole-ball crossing **10.012046437 s**, away throw-in / goal kick, unchanged score, pending pass ended |
| Goal post | Existing frame collision/rebound interrupts before the foot; no fabricated pass or goal; passive keeper geometry also reuses its shared constants |
| 8 m/s departing / 3 m/s crossing | Swing ends at **10.120 s** with no fabricated impulse or release |
| Initial penetration | `unresolved` at **10.000 s**, with unstruck conservative continuation |
| Weak foot / initially hurried | Both contact in these particular geometries; bounded weak-foot capability and finite elapsed preparation remain, without a guaranteed skill penalty or success claim |

The timing intervention uses the same 1 m/s crossing ball and spatial path; no endpoint noise is added:

| Onset perturbation | Actual contact, s | Outgoing vx/vy, m/s | Spin z, rad/s |
| ---: | ---: | ---: | ---: |
| −10 ms | 10.065823534 | 9.455761 / 2.722520 | 15.245844 |
| 0 | 10.076190173 | 8.988167 / 2.966261 | 16.964323 |
| +10 ms | 10.086616193 | 8.478198 / 3.150784 | 18.464940 |

The three offsets influence actual collision, rather than adding a second aim-error term. One separately sampled ordinary action also contacts, with its stored perturbation and outgoing spin. Five matched legacy scenes retain their real synchronous release and subsequent canonical outcomes in the receipt; they are not relabelled as temporally prepared actions.

## Persistence, agency and negative evidence

The benchmark reloads **57 schema-validated checkpoints** (19 scenes × selected/preparing, two ticks and three ticks), including unfinished swings, interruptions, no-contact and uncertainty. Contact times, full physical/event/statistics projections, deterministic seed/action-index identity and schema-normalized terminal hashes repeat. These clocks use stateless seeded generators; no invented global `rngState` is claimed. Hashes sort JSON keys and use the saved schema, which intentionally excludes accidental extra legacy ball properties attached to nominally 2D diagnostic points. The physics state itself is not replaced by this observer normalization.

The audit exposed that the saved ground-contact witness schema discarded optional vertical velocity components. It now explicitly validates and retains `z`; existing 2D saves remain valid. New active preparation/swing fields have schemas and identity/clock checks; undeclared mixing with a historical integration profile is rejected. Profile application clears the experimental selection/state. No historical checksum changes.

The 36 focused contracts cover commit-once/no immediate statistics, actual intersection, movement/turning/braking, earlier and later competing feet, boundaries, exact expiry, multiple preparation/swing reloads, human menu suppression and recovery, human/NPC physical parity, episode/touch/height/dismissal/restart/challenge cancellation, invalid saves/profile mixing, numerical exhaustion/tangent/separation/overlap, 100 ms batch parity, uncontacted body velocity preservation, out-of-reach rejection, and historical shot/loft/first-time families. Both unresolved PR209 speed/direction/timing pairs are reproduced unchanged; they are not removed from historical denominators.

## Cost, CI and reproducibility

One Node 24.22.1 / Windows final recording takes **2.932 s wall / 4.188 s CPU**, peak RSS **861052 KiB**, including retained full evidence and 57 replay comparisons. These apparatus costs are distinct from match runtime. [Matched continuation cost](performance/pr211/cost-final-v4.json) measures 32 prebuilt scenes × five canonical ticks without the evidence-frame observer: legacy **0.083632 s wall / 0.093 s CPU**, pending **0.099887 s / 0.125 s**. A single short pair does not establish a general speedup or calibrated overhead. Both arms share a process high-water RSS of 894268 KiB; these are not independent per-arm memory estimates. Pending JSON is bounded; only actors with a pending strike incur detailed temporal-foot work, with nearby competitor checks during that interval.

The 28-job consolidated CI and 124 historical commands/63 historical full-match executions remain. Historical host guards bind the current PR211 inventory; original PR195–210 reports/receipts/assertions remain unchanged in their source contexts. A new `replayPr210Check` exports actual source/evidence files with a private Git index and links only dependencies. The original PR210 Linux/Windows PR209 real-file/corruption/isolation contract remains intact. The workflow adds PR211's exact canonical check in its existing main job.

Reproduction (installed locked dependencies, Node 24, full Git history):

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr211.mjs --check
node scripts/ci/replayPr210Check.mjs --replay
node scripts/ci/replayPr209Check.mjs --replay
node --test scripts/ci/contracts.mjs
npm run verify
```

Final validation on the source above is recorded in [verification](performance/pr211/verification.json), with 77 compressed logs and explicit source/attempt labels:

| Final check | Result |
| --- | --- |
| `npm run verify` | **PASS: 2605 tests**, lint, TypeScript and production build |
| Required test groups | 2540 unit, 56 integration, 4 career-contract, 5 full-career cases; no assertion or timeout changes |
| Current exact replay | All 19 canonical scenes, 57 reload checkpoints and five legacy controls repeat |
| Historical/current compatibility | All 17 command gates PASS: manifest, six CI contracts, workflow, deliberate corruption, PR203–210 source checks/replays, current authority/information and PR205/206 contracts, realism register |
| Historical PR195–210 bytes | Unchanged; original assertions run in source-specific contexts with private indexes |
| Archived source reconstruction | All eight source archives reconstruct their exact manifests |

The required career contract includes a real U-17 match/save/calendar transition and a full fixture executed twice with identical results, duplicate/conflict rejection and substitutions. These are default-path compatibility tests; they do not certify a new temporal full-match profile. Production build retains the existing dynamic-import/chunk-size warnings.

An earlier broad verification hit six unchanged test timeouts under concurrent work, and a later attempt stopped on new harness lint errors corrected before freezing. They are retained as failed attempts, not counted as passes or repaired by raising time limits. The tool runtime interrupted one final history sequence; it resumed from PR208 against the same source. Platform-specific long historical receipts retain their original execution environments; this local experiment does not establish portable bit-identical full matches. Hosted CI is assessed separately after publication.

## Integration and product decision

Research change: persisted preparation and actual finite contact in one canonical executor. Local result: moving-body/ball contacts, real misses, earlier feet/boundaries and schema replay pass the scoped corpus. Integration effect: **opt-in low ground-pass lifecycle added; maintained PR201 and all defaults unchanged**. Promotion decision: **RETAIN_EXPERIMENTAL; general active-challenge/body arbitration BLOCKED_BY_DEPENDENCY; whole candidate NOT_READY_FOR_PROMOTION**. No stable issue status or I/F/E/T/M/C gate becomes COMPLETE; 135 IDs, B, 40 Hz, 28 attributes and sealed confirmation remain.

The next highest-priority physics dependency is a shared, physically timed active-challenge/passive-body event contract, including actual contact/foul/keeper eligibility and canonical remainder handling, before widening this selection or running new full-match comparisons. Empirical preparation and error calibration follow independently; no success quota is introduced.

The separate [complete MFL product roadmap](MFL_PRODUCT_ROADMAP.md) audits existing economy, leagues, origins, generations, club strength/market, fast simulation, news, visuals/stadiums, release UI and validation. It preserves the 25-season playable-career feedback and cross-references the release backlog. No roadmap subsystem is implemented here.
