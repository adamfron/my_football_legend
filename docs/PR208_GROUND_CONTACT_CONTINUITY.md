# PR208 — Ground contact continuity

Research change: explicitly selected `ballEnvironment.groundContact: event-v1` repairs the canonical flight/ground boundary. Local result: the shallow-hop limit is continuous, true impacts retain restitution and bounded friction, and the preserved PR207 input corpus replays without changing kick velocity, spin or sampled error. Integration effect: **realism-candidate-v1 / PR201 remains unchanged**. Promotion decision: **retain the ground repair as a separately available experimental physical edition; do not promote contact-v1**. Next dependency: receiver preparation/contact speed and one-second continuation on the same deliveries, followed by separate empirical kick-dispersion calibration. No new full-match experiment; independent confirmation remains sealed.

## Source, protocol and limits

Start from merged PR207 `c957f7d733420d72db43052432aa34f6bb7d77d9`. The [current source manifest](performance/pr208/current-source.json) identifies every non-test core/schema/type/script and package byte after line-ending normalization. `source-<fingerprint>.json.gz` records reconstructible changes against that exact base. [Summary](performance/pr208/summary.json), three `*-development-v1.json.gz` receipts, preserved pilot receipts and source archives keep positive and negative evidence together. Pilot inputs are unchanged in the final run; additions improve diagnostic attribution and cost measurement. There is no favourable-seed resampling.

Final measured source fingerprint: `0855f89258f66c23b7cfd785d49a0c3de9f369db3eabcaf40787ec8080228813`. The supplemental observer beside the data has its own method hash in its receipt, because it is outside the runtime/harness inventory.

The original PR207 baseline and PR195–207 receipts are unchanged. `legacy-v1`, including omission of the new environment, preserves their arithmetic and physical interpretation. The separately selected new edition can be evaluated without enabling finite kicks. No new default, integration profile or permanent attribute is introduced. B, the 40 Hz executor, human/tactical authority, laws/offside/restarts and active contact/keeper restrictions remain. Loft/cross/header/volley/free-kick/keeper finite-kick execution is not extended.

The evidence establishes a numerical boundary repair and internally consistent impact mechanics. It does **not** establish calibrated grass friction, articulated kicking biomechanics, empirical football realism, full-match transfer or independent confirmation.

## 1. Root cause and exact reproduction

The historical airborne predicate is `airborne || z > R || vz > 0`. Grounded zero/negative launch components enter exact constant-deceleration rolling. Any positive component instead receives a complete 25 ms semi-implicit airborne update. If the updated centre penetrates the ground, the code clamps it back to `R`, increments the bounce count, multiplies **all horizontal velocity by 0.82**, retains 0.55 of spin, applies vertical restitution 0.46 and then settles vertical rebound below 1.15 m/s. It does not find impact time or consume the remaining step as rolling.

At `vz=0.001`, gravity changes the first-step vertical velocity to about −0.24425 m/s. The actual zero-drag hop would last about 0.000204 s, with about 0.000000051 m apex gain. The full-step incoming speed and unconditional horizontal restitution manufacture a finite loss. At `vz=0.2`, semi-implicit penetration reports an impact in the first step even though the real hop still exists at 25 ms. Penetration correction, horizontal restitution, spin loss and the settling branch compound the timing error.

The [original-observer reproduction](performance/pr208/recorded-sample-observer.json) uses the unchanged PR207 `flight()` stopping convention, speed below 0.05 m/s. It gives **45.6250, 45.6250, 40.7243 and 40.7243**, reproducing the prompt's four positions. Before rounding, the positive cases are 40.7242599998 and 40.7242536526 m. This reporter stops slightly before complete rest; its threshold is retained for corpus comparisons.

Initial centre `(30,34,0.11)`, horizontal speed 10 m/s, zero spin; x below is the **complete-rest coordinate**, not distance travelled or a change to that historical observer:

| Initial vz, m/s | Historical x, full rest | Event-v1 x, full rest | First actual contact, s |
| --- | ---: | ---: | ---: |
| −0.001 | 45.6250000 | 45.6226092 | 0 |
| 0 | 45.6250000 | 45.6250000 | none |
| +0.001 | 40.7243799 | 45.6242657 | 0.0002038724 |
| +0.200 | 40.7243735 | 45.4852921 | 0.0407340085 |

The small difference between negative and positive cases is physical: an initial downward component at the surface causes an immediate impact, whereas an upward component first flies. Both differences approach zero with the component. Event-v1 does not force the four positions to agree.

The sweep covers 16 signed vertical velocities, four horizontal speeds, zero/top/back/side/mixed-limit spins and three substep sizes: **960 paired cases**. Another 27 falling trajectories cross impact times just before/on/after 12.5, 25 and 50 ms boundaries, including incoming −30 m/s. The recorded four cases retain the first 12 complete steps and every contact event with incoming/outgoing kinetic energies. The boundary experiments retain the same detailed evidence. No threshold is fitted to those four examples.

## 2. Mathematical correction

The existing integrator retains its deterministic maximum 25 ms production substep. Only the explicit event-v1 branch splits a substep at actual contact. Gravity, quadratic drag and bounded Magnus acceleration are evaluated at the beginning of each free-flight segment. With held acceleration, solve the first descending root of:

```text
h + vz τ + 1/2 az τ² = 0,  h = max(0,z−R)
position(τ) = position(0) + velocity(0) τ + 1/2 acceleration τ²
velocity(τ) = velocity(0) + acceleration τ
```

A stable root avoids cancellation for falling near-surface states. An already penetrating centre is projected to the original radius; downward velocity at the surface still produces an immediate real impact even if the old airborne flag is false. After impact, the unused substep time continues through free flight or the **unchanged** exact rolling integrator. The whole timestep is never spent both flying and rolling.

Use the existing mass 0.43 kg, radius 0.11 m, hollow-sphere inertia `I=(2/3)mR²` and vertical restitution `e=0.46`. For incoming normal speed `u=max(0,−vz)`:

```text
Jn/m = (1+e)u
slip = (vx−R omega_y, vy+R omega_x)
q = min(mu (1+e)u, |slip|/(1+mR²/I))
Jt = −m q unit(slip)
v_after = v_before + (Jt/m, Jn/m)
omega_after = omega_before + r×Jt/I, r=(0,0,−R)
```

The new edition uses explicit Coulomb `mu=0.45`, an **uncalibrated material assumption**. It is not a reinterpretation of the historical 0.82 restitution factor, and was not tuned for reception counts or sample stopping positions. The same impulse supplies linear momentum and torque. If the existing ±160 rad/s spin envelope binds, scale that one tangential impulse before applying both changes. Sidespin is not multiplied by an arbitrary impact retention. Airborne/rolling spin decay remains external dissipation. No horizontal bonus, radius/resistance change, outcome noise or post-release retargeting exists.

For the tangential contact, `ΔK/m = −q|slip| + 1.25q² ≤ 0` because `q≤|slip|/2.5`. Normal kinetic energy is multiplied by `e²`. Translational horizontal energy can increase when topspin supplies it; total translational plus rotational energy must decrease at impact. Tests and receipts distinguish this exchange from friction and numerical loss.

Restitution creates a geometric inelastic bounce tail. Only **after a resolved impact**, rebound below `1e−7 m/s` becomes rest: vertical specific kinetic energy below `5e−15 J/kg`, apex of order `5e−16 m` under gravity. No finite initial upward component is clamped. The omitted tail impulse/time tends to zero, unlike the historical fixed 18% horizontal speed loss. Raw bounce counts therefore include numerically resolved microscopic tail contacts; first-contact time and event energies are more useful physical diagnostics than comparing the old one-bounce count with the new tail count. Rest has no positional/vertical bouncing jitter; residual angular spin can continue to decay.

The sustained rolling regime remains the existing phenomenological constant deceleration plus angular decay. It does not solve every skidding/spinning-to-rolling transition or compliant turf deformation. Keeping that assumption visible is necessary when assessing spin and long post-bounce distances; this PR does not certify a complete ground-contact material model.

## 3. Continuity, energy and shared paths

`groundContactContinuity.test.ts` covers the four historical values, rolling/resistance, two-sided limits over speeds/spins, a real 0.001 m/s hop, impact boundary sensitivity, meaningful rising/falling flight, true normal restitution, Coulomb/torque/energy, rotational-to-linear exchange, strong negative incoming speed, resting stability, refinement, exact forecast/live substeps, observer isolation, finite deterministic state, saved edition and profile compatibility. The original ball-physics and physical-kick tests are unchanged.

The event observer receives detached vectors and cannot mutate live physics. It records contact time within the substep and kinetic energy before/after, instead of attributing a complete step of gravity to a microscopic hop. The sweep's maximum positive impact-energy residual is floating-point rounding of order `1e−14 J`; the acceptance tolerance is `1e−8 J`. Drag and rolling/spin decay remain external dissipation. Held-acceleration flight still has timestep approximation error; refinement is diagnostic, not a change to production stepping or proof of empirical accuracy.

`TacticalMatchState.ballEnvironment` is schema-validated and explicitly forwarded to canonical pass/reception/interception/aerial/shot/keeper forecasts, carrying/contact, swept surface contact and remainder integration, live flight/loose-ball segments, restart retrieval, injury dead-ball flight and post-goal motion. Both `projectFutureBallTrajectory` and the live executor call `integrateBallFlight` with that selection. Frozen profile application clears the environment; a saved historical profile with an undeclared environment is rejected. The player's existing approximate **observed-ball belief** remains a cognitive approximation and is not a second authoritative physical engine.

The complete selection, used independently of kick execution in an unprofiled laboratory state, is:

```ts
state.ballEnvironment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' };
```

Direct physical experiments pass that same environment to `integrateBallFlight` and `projectFutureBallTrajectory`. Nominal inverse kick plans remain frozen for the paired comparison; forecasts of the actual released ball use the selected edition.

## 4. Preserved PR207 corpus, no kick recalibration

Replay all **2752 frozen lab pairs / 5504 requests** and **60 frozen live pairs / 120 release continuations** against legacy physics first, comparing their complete recorded rows. Repeat those same configurations with event-v1. Every release decision, initial realised velocity and spin agrees. The sampled lateral/timing/effort errors and finite-contact coefficients are unchanged. This separates changed ground/flight handling from kick impulse changes.

Each trajectory receipt retains initial velocity/spin, target, original and corrected apex, reception-plane arrival/time/speed, missing/censored arrival, stopping position, lateral/depth error and corrected bounce events/count/times. Summary strata add signed stopping distance from the reception plane. Plane timing/position uses the original 25 ms chord convention; arrival speed is the original end-of-crossing-step speed, not a newly claimed continuous exact speed. Apex is sampled at 40 Hz, so the event/root evidence separately establishes extremely shallow hops that fit within a tick.

The [supplemental observer](performance/pr208/trajectory-diagnostics-method.mjs) and `trajectory-diagnostics.json.gz` join all **5624 released lab/live deliveries** by dataset/index/model. They additionally record launch and reception-plane angular error, signed distance from the plane at stop, original bounce counts/times and corrected contact events. Historical bounce time is explicitly the end of its 25 ms collision step; a nonexistent exact historical impact time is never inferred. Original before/after-step energy is separated from corrected instantaneous impact energy. The observer re-integrates each preserved launch with the canonical solver and asserts the exact original stopping point.

For the 64-seed 20 m pressure strata, missing contact-v1 reception-plane arrivals change **33→0** for moderate, immediate and hurried contexts. The original baseline rolling trajectories are unchanged in those strata. A shorter old delivery may still be touched by a moving receiver, so plane arrival is not reception success. Long/lofted and post-bounce shot trajectories can change under an explicitly selected new physical edition; the historical versions and all excluded finite-kick releases remain intact.

Among the 832 open-context **ground** contact-v1 passes, sampled apex above the radius plus 5 mm changes **1→6**. The 128 lofted controls are excluded from that count. Launch vertical components are identical: resolving the short flight changes whether an existing small hop survives long enough to appear in a 40 Hz sample. This diagnostic is neither an empirical hop-frequency target nor a reason to clamp upward components.

High/high placed-shot dispersion remains under-calibrated. Ground repair cannot supply missing launch variance: the original contact-v1 finite velocity/error samples are unchanged, and many shots reach the goal plane before ground contact. The new ballistic segment timing can change height/arrival diagnoses; this is not an empirical dispersion calibration. No patch sigma, effort variance, shooting accuracy, keeper ability or desired goal count is tuned. Future calibration needs independent empirical distributions across skill/context/preparation/technique, censoring and correlated angular/power/spin tails, after the local receiver dependencies are understood.

In the preserved 64-seed 90/90 placed/open shot stratum, lateral goal-plane SD is 0.470612 m for the historical baseline, 0.121471 m for original contact-v1 and 0.121162 m after correction. Height SD is respectively 0.338834, 0.080546 and 0.079360 m. Corrected contact-v1 mean height shifts 1.580304→1.679901 m, while its launch is identical. The repair therefore does not remove the under-dispersion problem.

## 5. Real reception and one-second continuation

Six preserved live pass seeds per row. Counts use the **unchanged** original-delivery-v3 observer: actual touch, controlled possession, then team ownership one second after first receiver control. Loose ball or an intervening outgoing pass at that instant can fail the last metric; it is not automatically an opponent interception.

| Context | Historical baseline retention | Original contact-v1 | Corrected contact-v1 | Contact-v1 touch/control, old→new |
| --- | ---: | ---: | ---: | --- |
| open | 2/6 | 3/6 | 0/6 | 6/6 → 6/6 |
| moderate pressure | 4/6 | 1/6 | 2/6 | 6/6 → 6/6 |
| immediate pressure | 0/6 | 2/6 | 3/6 | 5/6 → 5/6 |
| hurried/alignment | 3/6 | 0/6 | 1/6 | 6/6 → 6/6 |
| first-time excluded control | 3/6 | 3/6 | 3/6 | 6/6 → 6/6 |

The corrected baseline counts in this table remain equal to historical baseline. Retention gains do not close the original moderate/hurried regressions; the **open-context loss is new negative evidence**. No success-count improvement is forced.

For attribution, independently clone each exact released physical delivery, change only the environment, then run both complete autonomous teams for 280 production ticks. Record the first ball, receiver body, opponent body and action divergence, plus the first differing action and final whole-state hashes. Free-flight comparison isolates the delivery; these live comparisons include forecast-driven receiver/opponent movement and subsequent choices. They are not estimates of a physical-only treatment effect with decisions frozen. All original and corrected actions/contacts/0.1 s frames and outcome contracts remain in the receipt.

Example `pr207-live-pass-0`, open: identical initial `(12.1416590,0.0578336,0.0422107)` m/s. The old isolated ball never reaches x=50; the repaired ball reaches it at about 2.425 s at about 4.287 m/s. Both real runs achieve receiver touch/control; the repaired contact occurs at 12.200 s instead of 12.375 s. Subsequent carry targets differ and one-second team ownership changes true→false. Moderate seed 0 similarly changes contact 12.350→12.200 s but retention false→true. Hurried seed 0 changes 12.325→12.275 s and false→true. Immediate seed 0 changes true→false despite the group's net gain. These paired gains/losses cannot be attributed to altered kick sampling or counted as a general retention cure.

## 6. Regression, performance and verification

The consolidated CI still contains **28 jobs, 124 original commands, 144 explicit cases and 63 existing historical full-match executions**. No new per-PR matrix or timeout is added. Current source binding advances explicitly to PR208. Original PR207 evidence assertions and summary execute verbatim in an isolated merged-PR207 export; older source-bound checks retain their existing isolated contexts. The new checker separately verifies current source, reconstructible archives, all receipt hashes, the preserved corpus and negative results. Running an old source-byte assertion in its original source does not waive current-engine validation.

The first full PR208 replay exposed a reporting defect: microbenchmark timings had been included in the deterministic sweep result. A second run proved every physical field identical after excluding timing alone. The failed log, pre-fix receipts and reconstructible source `1bb1ab1b…` remain in `pre-replay-fix/` and the evidence index. Only `pr208Measurements.mjs` and `summarizePr208.mjs` then change: timings move into the separately stored costs, and all three final measurements/replays are rerun. Engine bytes, tests, sampled kicks and physical results remain identical. The verification receipt distinguishes the source at the start of full verify from this measurement-only revision and records final lint/replay checks; no old receipt is relabelled as a new measurement.

The first local full verify also discovered an overlapping temporary PR206 source export as an additional career-contract suite. The exporter subsequently removed that temporary tree, so Vitest reported a missing module. All four real career-contract tests passed, but the command correctly failed. That log is retained; the full command is repeated with no concurrent source exports. No original assertion, timeout or test-discovery rule is weakened to turn the failed attempt green.

Hosted observation for code head `da9f7b33…`: [run 41211465037](https://github.com/adamfron/my_football_legend/actions/runs/41211465037) has successful main/integration/career verify groups, 12 successful jobs and no observed failed jobs while the other jobs are still running. The [snapshot](performance/pr208/ci-first-head.json) identifies that head and every observed job. It does not claim final-head success after the reporter-only revision; the PR checks and description identify the final run separately.

That first-head workflow subsequently completed **SUCCESS**, including the required quality gate; its [terminal receipt](performance/pr208/ci-first-head-outcome.json) is separate from the earlier in-progress snapshot. The final reporter-only revision still starts its own workflow, whose outcome is assessed on that final head.

Reproduction from this PR, Node 24.22.1 / Windows for exact recorded continuations:

```sh
node scripts/freezePr208.mjs
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/pr208Measurements.mjs --mode=sweep
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/pr208Measurements.mjs --mode=trajectories
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/pr208Measurements.mjs --mode=live
node scripts/summarizePr208.mjs
node scripts/checkPr208Evidence.mjs
node scripts/checkPr208Evidence.mjs --replay
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs docs/performance/pr208/trajectory-diagnostics-method.mjs --check
node scripts/ci/replayPr207Check.mjs --replay
node scripts/ci/replayPr206Check.mjs --replay
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerPr206Lab.mjs scripts/checkPr206Contracts.mjs
npm run ci:manifest
npm run ci:contracts
node scripts/ci/renderWorkflow.mjs --check
npm run verify
```

Existing receipts refuse overwrite. Add `--check` to the measurement commands to replay without changing data; use a new `--version=...` for an explicitly separate measurement. Each run checks source stability before writing. Exact long-state cross-platform portability remains the existing unresolved limitation; green Linux contracts are not substituted for Windows receipts.

CPU/wall/peak RSS are recorded per complete measurement and microbenchmarks for rolling, microscopic hops and real impacts, after warmup. Offline replay cost includes original and corrected runs, engineering forecasts, detached observers and hash attribution; it is not a measured full-match overhead. No optimization or promotion conclusion is drawn from these small probes. The [verification receipt](performance/pr208/verification.json) records final commands, logs, source and hosted CI outcome separately from physical results.

Final clean local `npm run verify`: **PASS, 2533/2533 tests** (2468 unit, 56 integration, four career-contract, five full-career), lint, TypeScript and production build. This repeat starts and finishes on the final measured source `0855f892…` without concurrent historical exports. Final exact PR208 measurement/supplemental replays, original PR206/207 source replays, original PR198 context, CI manifest/contracts, generated realism register and complete artifact hashes pass. The failed attempts remain retained and do not count as successful verification.

## 7. Integration decision

Retain event-v1 as an explicit physical repair available independently of contact-v1. Keep every historical profile on its previous edition and **PR201 as the maintained candidate**. The whole profile remains NOT_READY_FOR_PROMOTION. Do not start new full matches: local retention losses remain and high/high placed-shot variance is still uncalibrated. The next experiment must isolate receiver meeting/preparation, incoming contact speed and one-second control/continuation using the preserved gained/lost deliveries and unchanged PR206 anticipation controls. Only then evaluate empirical finite-kick dispersion and full-match prerequisites. PR205 continuous-body/keeper/high-free-ball parity and PR206 lawful preparation handoff remain independent dependencies. Independent confirmation stays sealed.
