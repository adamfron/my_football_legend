# PR209 — Moving-ball strike foundation and bounce/reception diagnosis

Research change: a separately named **laboratory-only** `temporal-contact-dev-v1` primitive resolves a finite moving foot against canonical ball motion. Local result: timing changes actual contact geometry, impulse and spin; the bounded corpus retains real misses and four unresolved searches. The PR208 retention discordances are caused at the measurement instant by onward deliveries in flight versus controlled ownership, with different earlier physical trajectories and decisions. Integration effect: **all pre-existing production source bytes and PR201 remain unchanged**. Promotion decision: **RETAIN_EXPERIMENTAL; live temporal integration BLOCKED_BY_DEPENDENCY**. Next single dependency: persist and arbitrate intentional strike preparation/contact on canonical body and ball segments before installing it in live releases.

The request explicitly permits a bounded contact foundation plus focused regression diagnosis when full integration would exceed a corrective PR. This PR takes that stopping point. It does **not** install a moving-ball pass/shot executor, claim that live misses are handled by a new action lifecycle, or claim a completed intention-to-preparation handoff. There is no new production switch, profile, permanent attribute or full-match matrix. B/default, 40 Hz, all 28 attributes, human/tactical authority, existing laws/restarts and sealed confirmation remain.

## Source, scope and frozen protocol

Base is latest merged main including PR208, `5353858065eaefdebfabacdd12a1a961bda36d74`. The [protocol](performance/pr209/protocol.md) was written before the recorded development measurements. [Current source](performance/pr209/current-source.json) binds the final normalized runtime/harness inventory to fingerprint `4988874f644231dfa0fa3f0db586af3f35548c539edce4c361b4707e3de9dfb6`. Reconstructible `source-<fingerprint>.json.gz` archives preserve earlier attempts separately. [Summary](performance/pr209/summary.json), three primary receipts and the [evidence index](performance/pr209/evidence-index.json) retain every denominator, physical row, full continuation and negative result.

Source guards verify every pre-existing `src/core`, schema/type and package byte against PR208 and reject imports of the temporal foundation into existing production consumers. Historical PR195–208 receipts and source guards are not rebound. New core files are reusable research primitives/apparatus; no app path imports them. Source identity is distinct from commit labels and profile checksums.

Read alongside [PR207](PR207_PHYSICAL_KICK_EXECUTION_AND_ERROR_PROPAGATION.md), [PR208](PR208_GROUND_CONTACT_CONTINUITY.md), [PR206](PR206_PRE_RELEASE_RECOGNITION_AND_FIRST_TOUCH.md), [PR205](PR205_OBSERVED_BALL_INTENT_CONTACT_PARITY.md), the integration architecture, dependencies, assumptions register and calibration plan. Scope is PASS-005/006/008, SHOT-003, PHYS-002 and MEAS-008/009. No original ID, status, I/F/E/T/M/C gate or COMPLETE count is promoted.

## Gate A — authoritative movement and missing temporal state

| Ball situation | Actual representation and source | Is `ball.velocity` authoritative physical movement? |
| --- | --- | --- |
| Newly acquired/controlled possession | `matchSimulation.changePossession` / `completePossessionTurnover` can construct an owned ball at the current contact point without velocity, height or spin. The finite reception route instead preserves its actual solver output. | An existing physical vector is authoritative; **absence is not evidence that a running owner gives the ball the same velocity**. Legacy acquisition can omit it. |
| Dribble/carry, including between touches | `ballContactGeometry.advanceControlledBall` maintains owner identity while separately integrating ball position, velocity, height and spin. A due reachable foot touch changes momentum; the ball then advances through `integrateBallFlight`. | Yes once materialized. The carry code's historical fallback to actor velocity when the field is missing is an explicit initialization convention, not a measured incoming-ball velocity. |
| Immediately after a controlling touch | `passReception.resolveReceptionOutcome` supplies a finite surface impulse. `changePossession` writes its outgoing velocity/spin and actual contact position, and stores `lastGroundContact`. Receiver velocity may already have been reduced by control. | Yes on that finite route. Post-control body speed is not the pre-impact relative speed; use the contact receipt's `relativeSpeed` and incoming velocity. |
| Free ball without an owner | The loose-ball branch in `matchSimulation` integrates the physical ball and sweeps body contacts. Some older `makeLoose` transitions construct a 2D ball and omit vertical/spin fields. Selected PR205 handoffs have their separate preservation contract. | The present vector governs that branch. This audit does not certify all historical transition paths as continuous 3D state. |
| Pass or shot | `matchActions` synchronously releases the nominal launch or the PR207 finite impulse into the same ball fields. Actual flight then uses the shared integrator. | Yes after release. A target, pass label or nominal launch is an intention/bookkeeping field, not a second physical trajectory. |
| Bouncing or rolling | Explicit event-v1 resolves grass-impact time, restitution and coupled tangential momentum/torque; ordinary rolling remains the inherited resistance model. | Yes. Height, airborne state, spin, event time and remaining step distinguish real flight from contact. |

Implementation map: [`footContact.playerFootGeometry`](../src/core/matchSimulation/footContact.ts) supplies current effective foot centres and the inherited 0.82 m reach envelope. Optional `lowerBodyGeometry` supplies a connected current pose; neither supplies an intentional striking-foot trajectory or its clock. [`kickExecution.executePhysicalKick`](../src/core/matchSimulation/kickExecution.ts) reads the present physical ball, translates a nominal launch into an effective foot velocity, checks reach and applies an impulse **at the call time**. PR207's timing latent rotates a patch and changes effort heuristically; it does not advance ball and foot to a collision time.

The body position, velocity, facing, plant balance and last executed ground/foot contact are physical state/witnesses. `onBallPreparation.gainedAt` is a real possession clock, but the fallback 0.24 s is an assumed motor budget. The nominal target, chosen action, preparation intention, expected arrival point and receiving continuation are plans. `ballMotorObservation`, optical samples and timestamped flight belief are actor information, with their existing scope. Physical truth can enter collision execution; it cannot become a player-facing future-bounce oracle.

**Feasibility decision:** an already moving owned ball exists, so a physical temporal primitive is feasible. A synchronous intentional release has no persisted foot path, strike event or common pending-contact arbitration. Advancing just its ball/foot for 120 ms inside `resolveMatchAction` would skip the other bodies and rules; deriving incoming velocity from the runner would fabricate it. The smallest live extension is a pending intentional-strike lifecycle in the existing executor, reusing canonical body segments and earliest-event arbitration. It remains the next dependency.

## Gate B — exact finite contact primitive

[`temporalFootStrike.ts`](../src/core/matchSimulation/temporalFootStrike.ts) has explicit Zod request, prepared-plan, path and receipt schemas. Its supported family is a **low inside-foot stroke with nominal horizontal launch**, on a constant-velocity prescribed body fixture. `prepareTemporalStrike` reuses PR207's zero-error solution/capability and starts at the actual chosen foot, including its current pose height. `plannedBallPoint` is an explicit intention. The laboratory supplies an engineering nominal meeting point; this is not evidence of lawful player anticipation.

The ball radius remains 0.11 m. A 0.035 m effective foot sphere is a new, disclosed, **uncalibrated contact-region assumption**. Nominal onset is 25 ms, swing duration 50 ms, follow-through braking 20 ms, and total interval 120 ms. In body-relative coordinates, a cubic Bezier starts at zero displacement and zero relative speed. Its final point is the planned sphere/ball meeting geometry; its endpoint velocity comes from the finite nominal kick solution. A linearly decelerating follow-through then stops the relative foot. This is an effective stroke, not articulated human biomechanics.

Bezier convex hulls bound the entire displacement and derivative. One common scale clips the whole relative path to the existing reach and preparation/fitness/balance/weak-foot-dependent speed capability. Its origin never changes. Timing shifts onset by at most ±20 ms; it **does not recalculate the spatial path or its clipping scale**. Patch interventions move the prepared path, not the ball or an assigned contact normal. Effort scales displacement and velocity. The executed foot remains finite even if the requested nominal solution is impossible.

During each ordinary ≤25 ms ball segment, conservative advancement evaluates the **canonical** `integrateBallFlight` at candidate times and the analytic foot at the same times. The speed bound includes the foot, body, ball translation, possible spin-to-translation exchange and bounded gravity/Magnus effects. At the first approaching sphere intersection, normal is the actual centre-to-centre direction. The existing `executeFootContact` supplies the finite normal/Coulomb impulse and torque. The unused segment and following segments continue through the shared integrator, with the actual outgoing velocity/spin. No desired endpoint is written after contact.

The numerical distance tolerance is 1e−7 m, with at most 160 evaluations per production segment / 800 per request. A bounded search that cannot resolve a meeting is **unresolved**, not a miss. Unsupported height/preparation, initial penetration and invalid geometry do not manufacture an impulse. The primitive never changes canonical ownership, decisions, goals, pass events, cooldowns or RNG. It returns an immutable research result; its unstruck continuation after a miss/unresolved case is not permission to consume that result as a live action. A live no-contact action/recovery contract remains unimplemented and blocks installation.

The family labels pass/shot share an impulse only when this exact surface, nominal solution and latent intervention are equivalent. This does not validate the live instep shot path. Volleys, headers, free kicks, loft/cross deliveries, keeper distribution, high contacts, difficult first-time contacts and the cutting winger's upper-corner shot remain unsupported.

## Gate C — stationary/moving paired timing corpus

The primary corpus has **210 requests**: 0/1/3/5/8 m/s × approaching/departing/crossing × seven timings (0, ±5/10/20 ms) × mirrored feet. Zero-speed direction labels deliberately repeat stationary controls. Six additional 1e−6 m/s controls test the stationary limit. Three unexpected-motion interventions hold the nominal plan fixed while changing the actual crossing velocity by −2/0/+2 m/s. Each timing contrast keeps the initial state and complete spatial swing fixed.

Every row preserves planned time, actual unstruck ball at that time, full foot controls/velocities, first contact time and patch, relative geometry, normal/tangential impulse, incoming/outgoing velocity and spin, kinetic energy, complete interval frames, subsequent canonical trajectory and outcome. There are **168 physical contacts, 38 geometric misses, zero unsupported cases and four unresolved searches**. Mirrors/duplicate stationary controls are dependent observations, not independent football trials or a calibrated miss frequency.

| Initial speed, m/s | Approaching contact/miss/unresolved | Departing | Crossing |
| ---: | ---: | ---: | ---: |
| 0 | 14 / 0 / 0 | 14 / 0 / 0 | 14 / 0 / 0 |
| 1 | 14 / 0 / 0 | 14 / 0 / 0 | 14 / 0 / 0 |
| 3 | 14 / 0 / 0 | 12 / 2 / 0 | 14 / 0 / 0 |
| 5 | 14 / 0 / 0 | 4 / 8 / 2 | 14 / 0 / 0 |
| 8 | 12 / 0 / 2 | 0 / 14 / 0 | 0 / 14 / 0 |

The unresolved pairs are departing 5 m/s at −5 ms and approaching 8 m/s at +5 ms. They exhaust one segment's conservative search bound. They remain numerical negative evidence and must not silently become failed contacts or a live no-contact continuation. The maximum total recorded search count is 193 evaluations; each segment remains bounded. At high speed, this particular prepared path can be clipped or miss entirely; the table does not establish that footballers universally miss those speeds.

Stationary zero error contacts at approximately 10.075 s, outgoing `(12,0,0)` m/s within 1e−5 numerical tolerance, with spin below 1e−4 rad/s. Shifting onset moves its contact time with essentially the same impulse. The same timing shift on a 5 m/s crossing ball changes the actual meeting:

| Onset perturbation | Actual contact, s | Outgoing vx/vy/vz, m/s | Spin z, rad/s | Normal impulse, N·s |
| ---: | ---: | --- | ---: | ---: |
| −10 ms | 10.067656 | 9.184 / −1.579 / 0.033 | −9.898 | 4.794 |
| 0 | 10.075079 | 11.890 / 0.155 / 0.037 | 0.582 | 5.483 |
| +10 ms | 10.084039 | 11.890 / 3.267 / 0.098 | 11.266 | 5.139 |

The planned time is 10.075 s throughout. Actual contact time need not equal planned time plus timing error. In the identical 3 m/s departing setup, zero error contacts at approximately 10.075 s while +20 ms **misses**; in the 5 m/s departing setup, −20/−10 ms contact while zero timing misses. A fast approaching ball can hit the finite foot prematurely. Timing does not prescribe a 5 cm patch offset or a miss. Stationary-limit, mirroring, semantic-label parity, nonmutation, bounded capability, real low-hop motion and no-fabricated-impulse contracts pass.

## Gate D — exploratory attributes, preparation and pressure

After the contact contracts pass, **256 paired engineering requests** use passing 25/90 × technique 25/90 × assumed preparation 0.04/0.24 s × open/immediate pressure × 16 common seeds, crossing speed 3 m/s. The inherited fixture also assigns unused finishing to the primary value; it must not be described as a finishing experiment. A separately hashed [attribute-isolation method](performance/pr209/attribute-isolation-method.mjs) verifies identical remaining input state in 64 paired groups and changes finishing alone to 1/100 in **512 complete-result interventions**: every plan, latent error and physical result remains identical. Other active attributes remain fixed. The sampler retains PR207-scale exploratory latent magnitudes but removes timing's additional patch/effort terms: timing has one causal route, onset. Passing controls repeatability, technique controls patch/timing precision, agility/preparation and fitness/balance/weak foot constrain the inherited capability, and composure modulates the disclosed proximity timing heuristic. GameReading has no direct accuracy term.

The nearby defender enters the inherited preparation/proximity calculation only; this single-contact apparatus does not execute the defender's collision. Its constant-velocity obstruction estimate is not shared competing-event arbitration or validated pressure perception.

All 256 requests contact; this is not a realism success rate. In the open 0.24 s stratum, outgoing lateral-velocity SD for primary/technique 25/25, 25/90, 90/25 and 90/90 is **1.231 / 0.679 / 0.617 / 0.249 m/s**. Under immediate pressure the same values are **1.482 / 0.800 / 1.135 / 0.464 m/s**. Six sampled timings are clipped to the explicit ±20 ms validated domain; the truncation is reported, not a biological distribution.

For the descriptive error `|v_out−(12,0,0)|`, increasing primary wins/loses **111/17** paired requests; increasing technique wins/loses **117/11**. Higher attributes do not receive a guaranteed better result. These are dependent synthetic comparisons, not empirical skill curves. Finishing-specific distributions, weak-foot/body-motion interaction coverage and real anticipation histories are not established.

Most importantly, assigned preparation time is **not a witnessed recognition/body-adjustment history**. No lawful recognition-to-wind-up mediation or cognitive–technical compensation is claimed. PR206's negative/inconclusive evidence, its local minimum preparation handoff and PR205's continuous-body/keeper/high-ball dependencies remain open. A gifted actor cannot bypass this primitive's actual reach or timing, but this study does not prove the whole live preparation chain.

## Gate E — ground bounce and lawful observations

The six primary deliveries use existing event-v1 unchanged: rolling, microscopic hop, nominal 1 cm apex, meaningful low repeated bounce, descending-to-roll and spinning impact. Coefficients remain `e=0.46`, `mu=0.45` and inherited rolling resistance. There is no new bounce engine, 1 cm physics clamp, pitch irregularity, friction fit or bounce-related first-touch penalty.

At 7 m/s a nominal 1 cm apex first impacts at **0.090205 s**, after **0.630237 m** horizontal travel. The microscopic hop impacts at **0.000203873 s** and is invisible in a 40 Hz apex sample. The meaningful low hop first impacts at **0.244102 s**, with sampled apex 0.183060 m including the radius. Event counts include the PR208 inelastic microscopic tail and should not be interpreted as meaningful visible bounce counts. Spin, post-impact changes and exact event states remain in the receipt.

Six six-second observed continuations use the existing PR205 controller and actual bounded optical acquisition, with no injected belief. All first acquire useful motion at 10.175 s; all touch/control and retain team ownership one second later. Those constructed positive controls do not establish failure/recovery calibration. The inherited 1 cm-ish threshold in `forecastObservedBallStep` is a **cognitive approximation**, separate from canonical event-v1 physics; it is neither introduced nor promoted here.

An explicitly exploratory [eight-case supplement](performance/pr209/bounce-observation-supplement-v1.json.gz), with its independently hashed [method](performance/pr209/bounce-observation-method.mjs), tests 7/14 m/s, zero/strong spin and initially toward/away body orientation after the primary success was observed. Toward cases have motion evidence at 10.175 s, the physical bounce is witnessed by the end of the 10.250 s step, and new motion evidence arrives at 10.325 s. Away-facing 14 m/s cases do not obtain useful motion until **10.925 s**; they must actually turn and react. Changing initial orientation affects both sensing and physical preparation, so this is not an isolated perception-delay treatment.

The 14 m/s spinning/toward case touches at **10.725 s** but only controls at **11.950 s** after a loose continuation. All eight eventually retain at their own one-second control clocks. Thus the supplement exposes a first-touch/control gap and real evidence delay, but **does not demonstrate a final missed reception or a general inability to correct an unexpected bounce**. No further cases are tuned until one fails. Actual body targets, sensor clocks, impulses, subsequent actions and failures of immediate control remain available for future preparation work. Fresh evidence after an impact is not automatically proof that the actor explicitly recognized a bounce.

## Gate F — all ten preserved retention discordances

The original six-seed counts remain unchanged:

| Context | Historical baseline | Original contact-v1 | Event-v1 contact-v1 |
| --- | ---: | ---: | ---: |
| Open | 2/6 | 3/6 | 0/6 |
| Moderate | 4/6 | 1/6 | 2/6 |
| Immediate | 0/6 | 2/6 | 3/6 |
| Hurried | 3/6 | 0/6 | 1/6 |
| Excluded first-time control | 3/6 | 3/6 | 3/6 |

The new observer reruns **exactly the ten gained/lost contact-v1 pairs**, 20 seven-second autonomous continuations. It preserves every original outcome and every PR208 paired final whole-state hash. Each release is identical before changing only the physical edition. Every tick records ball geometry, receiver target/movement/braking/orientation, preparation, opponents, actual contact receipts, subsequent action and ownership. First exact 40 Hz divergence is recorded separately for each layer, not labelled an isolated downstream causal effect.

The preserved corpus has bounded belief, receiver anticipation and active perception **disabled**. There is no recorded actor optical/motor ball trajectory in these runs. `perceivedBall` divergence is therefore null/unavailable, not proof of equal lawful perceptions. Their early targets use the existing engineering forecasts. The separate observed bounce corpus cannot retroactively certify the retained historical apparatus as bounded cognition.

In **all ten discordances both editions touch and control**. Every false one-second value has an onward pass from the receiver's own team **in flight** at the check, while the true arm has controlled ownership. None of these ten false values is an opponent owner at that instant. This identifies the immediate measurement cause without replacing the preserved ownership metric or treating an in-flight pass as guaranteed future possession.

| Context / seed suffix | Control time legacy → event | One-second result | Receiver's next pass legacy → event, s |
| --- | --- | --- | --- |
| open / 0 | 12.375 → 12.200 | true → false | 13.525 → 12.825 |
| open / 4 | 12.125 → 12.125 | true → false | 13.550 → 12.925 |
| open / 5 | 12.475 → 12.025 | true → false | 13.800 → 12.650 |
| moderate / 0 | 12.350 → 12.200 | false → true | 13.000 → 14.225 |
| moderate / 2 | 12.575 → 11.875 | false → true | 13.550 → 13.125 |
| moderate / 5 | 12.475 → 12.025 | true → false | 12.925 → 12.750 |
| immediate / 0 | 12.325 → 12.275 | true → false | 13.375 → 12.825 |
| immediate / 3 | 12.375 → 12.275 | false → true | 12.850 → 15.300 |
| immediate / 5 | 12.475 → 12.025 | false → true | 12.925 → 13.300 |
| hurried / 0 | 12.325 → 12.275 | false → true | 13.200 → 13.500 |

Open seed 0 illustrates the physical/decision chain. The original shallow-hop loss makes the receiver meet farther back, at x≈44.821 with incoming 2.498 m/s. Event-v1 meets at x≈48.936 with 5.167 m/s, a shorter preparation interval and more pressure. Both execute a clean cushion. The corrected receiver passes at 12.825 s, so its 13.200 s ownership check sees that delivery in flight; the historical receiver is still carrying at its 13.375 s check. Both onward passes later reach and are controlled by their intended teammates, yet their own later one-second metrics can fail again. Open seeds 4/5 likewise have real subsequent teammate controls in both editions. That is useful continuation evidence, not global retention success.

Two-level attribution is explicit. A **physical-only** paired arm holds the initial receiver body fixed and prescribes the same 0.2 s cushion through existing `advanceSurfaceBall`; it grants no ownership. Nine historical deliveries never reach that fixed receiver's surface, whereas all ten corrected ones do; open seed 4 reaches it in both at 12.100 versus 12.085739 s. This shows the delivery difference with external behaviour held fixed, not a realistic stationary-receiver match. The **full autonomous** arms allow all bodies and decisions to respond; their movement, pressure, contact and onward actions differ. The latter cannot isolate contact mechanics as the cause of final retention.

No material/contact-radius/technical coefficient correction is justified by these counters. The minimal correction is diagnostic separation of first touch, actual control, outgoing delivery, subsequent teammate control and ownership at the specified clock. The original metrics and negative outcomes remain intact. Broader unexplained reception/preparation issues and uncalibrated PR207 shot dispersion still block promotion.

## Cost, determinism and compatibility

Windows / Node 24.22.1, 64 MiB semi-space for the primary laboratories:

| Measurement | Wall s | Process CPU s | Peak RSS KiB |
| --- | ---: | ---: | ---: |
| Timing/skill corpus and microbenchmarks | 5.504 | 6.735 | 320304 |
| Ten paired retained-continuation diagnoses | 17.905 | 22.094 | 434124 |
| Six physical/observed bounce controls | 8.538 | 10.171 | 306036 |

On identical development inputs, 1000 warmed calls average 50.640 wall / 63 CPU microseconds for instantaneous contact-v1, versus 179.223 wall / 297 CPU microseconds for the prepared temporal primitive. Temporal planning is outside that latter per-call loop; these are local instrumented costs, not full-match overhead or portable performance claims. Maximum primary receipt is 4402 JSON bytes. Additional persisted match/save state is **zero** because the primitive is not installed. No 22-player detailed leg simulation is added.

Physical results and costs are stored separately. Exact replays compare every serialized result; they do not compare fresh timing measurements. There is no shared RNG advance or event-label-dependent impulse. Long autonomous exact-state evidence remains Windows/Node bound; repeated native Linux contracts are not substituted for bit-identical cross-platform replays. The existing cross-platform limitation remains open.

The first retained-continuation observer compared against PR208's *pre-release environment-selection* hash rather than its separately preserved *paired after-release selection* hash. The physical outcomes agreed; property insertion order makes the whole-state hashes distinct. The failed assertion, original source archive, corrected pilot and complete successful paired hashes are preserved. The observer now compares the exact matching PR208 paired reference, without weakening or changing any historical expectation. Early temp-cache/TypeScript/test-construction failures are separately retained and are not successful validation. A manual PR198 invocation was rejected by its original npm-context guard; an unpinned npm-exec runtime attempt is also retained separately. Final validation uses the required npm context with the pinned Node 24 executable and unchanged original commands.

## Verification and reproduction

**Final clean native `npm run verify`: PASS, 2548/2548 tests** — 2483 unit, 56 integration, four career contracts and five full-career — plus lint, TypeScript and production build. Runtime/harness source stays `4988874f…` throughout. Exact PR209 and supplemental replays, original PR206/207/208 source-bound replays, PR206 causal controls, original PR198 context, the unchanged CI manifest, five CI contracts, workflow renderer and realism register all pass. [Verification and complete logs](performance/pr209/verification.json) distinguish these successes from the earlier interrupted restricted run, which exceeded original historical test budgets. That partial failure is retained; no assertion, timeout or production source byte is changed to obtain the successful native repeat. Vite retains its existing mixed-import and large-chunk warnings. Hosted CI for the published head is assessed separately.

The existing PR202 structure retains 28 jobs, 124 historical commands, original budgets and 63 historical full-match executions. PR208's original checker executes unchanged in an isolated merged-PR208 source, while the new current-source checker runs in the existing main group. Historical exports must not overlap full Vitest verification; the new PR208 export uses a validated temporary directory outside test discovery. No new job family or match matrix is added.

```sh
node scripts/freezePr209.mjs
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/pr209Measurements.mjs --mode=timing --check
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/pr209Measurements.mjs --mode=retention --check
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/pr209Measurements.mjs --mode=bounce --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs docs/performance/pr209/bounce-observation-method.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs docs/performance/pr209/attribute-isolation-method.mjs --check
node scripts/checkPr209Evidence.mjs --replay
node scripts/ci/replayPr208Check.mjs --replay
node scripts/ci/replayPr207Check.mjs --replay
node scripts/ci/replayPr206Check.mjs --replay
npm exec --offline --call="node scripts/ci/replayPr198Check.mjs"
npm run ci:manifest
npm run ci:contracts
node scripts/ci/renderWorkflow.mjs --check
node scripts/realismProgress.mjs --check
npm run verify
```

Record commands refuse overwrite; changed experiments need separate versions. Archives reconstruct against the exact merged base, restoring normalized changed contents and checking every manifest entry. The supplement has a separate method byte hash. The evidence index preserves failed attempts alongside final data.

## Integration decision and next dependency

Retain the tested temporal contact foundation and continuation diagnostics as development evidence. **Do not enable live temporal pass/shot execution, promote a new profile, alter event-v1 or run a new full-match matrix.** There are four unresolved collision searches, uncalibrated foot-region/error assumptions, no live scheduled-strike lifecycle, and no demonstrated lawful anticipation-to-wind-up history. The observed bounce corpus is small and has no final missed-reception counterexample. PR207 dispersion and PR205/206 contact/preparation dependencies remain.

The next single dependency is a **pending intentional low-strike lifecycle inside the canonical executor**, using actual canonical body/ball segments, evidence-supported preparation and earliest-event arbitration against carry, opponent, passive-body, boundary and restart contacts. It must explicitly resolve cancellation, unsupported/unresolved contact and a genuine miss without a release or permanent blocked action. Keep this primitive's bounded geometry/error controls and preserved negative cases as acceptance inputs. Only after that gate should broader skill/preparation interactions or full-match integration be attempted. Maintained `realism-candidate-v1` / PR201, B/default and sealed confirmation remain unchanged.
