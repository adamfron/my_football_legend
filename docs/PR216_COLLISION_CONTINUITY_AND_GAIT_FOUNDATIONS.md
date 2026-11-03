# PR216 — Collision continuity and gait foundations

Base: merged PR215, `3873c736e1b76c3ea5d1a71a6c1ab637d9a42c10`.

## Full-match continuity follow-up — keeper-cycle-v12

**The 1493.925s starvation is repaired, and the unchanged frozen development match now reaches full time.**
Source: `d013a1b07076b369a57eb54774aaa1214b69778f37c123db54cb68e2e77070d5`.

Research change: ordinary low-foot contact remains authoritative near a goalkeeper,
including keeper acquisition, carrying and finite reaching. A goalkeeper can acquire
a ground ball only at the actual three-dimensional foot surface, with the same
recovery and thrower-retouch restrictions. Held balls and live shots retain their
existing consumers. Low rebounds outside a keeper's reachable margin use the shared
contact interval throughout the existing ordinary height band, including crossings
of the 0.24m strike-height boundary; their shot lineage is retained. The strike
cap itself is unchanged.

Upright keepers now share the same 0.68m torso core and finite-mass contact model
as upright outfield players in the cluster experiment. The historical pair prototype
retains its previous scope. Keeper x bounds match their existing motor (0..105m);
outfield bounds remain 0.4..104.6m. Non-ready aerial bodies remain unsupported.

Held substitution/assessment intervals resolve their already-spent actuator transport
through body CCD. Cleared incoming substitutes participate physically while still
outside football eligibility; only their resolved crossing of the existing entry
line completes admission. Movement accounting uses the actual contact segments,
with no second motor update. Existing substitution eligibility and baseline behavior
are retained. Released restart presentation no longer truncates live contact search
after a reception changes velocity. New referee interruptions still stop the interval.
Conservative foot bounds use preparation/completed-stroke phases where applicable;
active and crossing segments retain their full bounds. A stationary relative ball
has no incoming direction, so JSON's -0 to +0 normalization cannot change touch quality.
An already latched body pair keeps its supported surface identity through a nearly
tangential recontact after a third-body impulse. The exact intersection still uses
zero restitution and the same geometry; new grazing impacts retain their uncertainty gate.

Local result: the clear native terminal at 1493.925s contacts at
1493.999975871s, continues 60s and makes
80 decisions. The old 1380s snapshot already contains a
119mm keeper/anchor9 torso overlap under the newly admitted keeper model. It is
preserved as a negative admission control, rather than separated after the fact.
The original source-bound results keep their earlier scope.

Both unchanged 22-player inputs pass 600s with actual football activity in every
minute. The occupied entry-gate continuation advances 40.000s,
records 28 impacts, completes the substitution and makes
39 onward decisions. The header rebound meets the foot
at 1349.130503832s, before its former entry.
Incident continuations and minute checkpoints retain exact native schema reload parity.
See canonical-keeper-cycle-v12.json.gz and summary-keeper-cycle-v12.json.

Sequential failed trials remain preserved with their original sources and native inputs:

| Edition | Stop / first invalid interval | Repair |
| --- | --- | --- |
| release-final-v2 | 1493.925s starvation | Low keeper-zone ball resumes finite reaching and actual foot contact. |
| keeper-cycle-v1 | 2140.425s; first overlap 2137.900s | Body CCD through referee-held substitution braking. |
| keeper-cycle-v3 | 4843.075s; first boot entry 4843.050s | Low-foot authority during a released throw-in. |
| keeper-cycle-v4 | 222.581993s search exhaustion | Phase-aware conservative foot bounds. |
| keeper-cycle-v5 | 406.075s; first overlap 406.050s | Continue the post-reception remainder during released restart presentation. |
| keeper-cycle-v6 | 5233.500s foot entry | Keeper ground-foot acquisition/carry uses actual foot geometry; upright keeper torso participation and bounds. |
| keeper-cycle-v7 | Native save/reload divergence | Remove arbitrary incoming direction at exactly zero relative speed. |
| keeper-cycle-v8 | 1349.350s foot penetration; first entry 1349.150s | Fast low header rebound outside keeper reach remains in shared contact. |
| keeper-cycle-v9 | Settled-rebound control at 837.400s | One contact owner through the strike-height boundary. |
| keeper-cycle-v10 | Exception at 1979.975s; occupied entry gate | Cleared entrant body CCD before eligibility, plus guarded roster-change accounting. |
| keeper-cycle-v11 | 3699.663247s near-tangent diagnostic | Preserve an already latched support identity through recontact after a third-body impulse; new grazing impacts remain uncertain. |

Integration effect: the frozen 90-minute development protocol completes at
**5821.125s / 8177 decisions**, including its normal second-half
transition, without an unresolved witness, action starvation or an exception.
Across 65229 body solves, the largest component has
5 bodies (2 five-body solves).
Maximum residual is 8.402e-10m/s, penetration
3.642e-14m, momentum error
3.411e-13kg·m/s and passive-energy increase
5.684e-14J.
Full frozen inputs, checkpoints, minute activity, events and native terminal states
are retained in match-attempt-initial-keeper-cycle-v12.json.gz.

The paired maintained PR201/B baseline completes at **5782.100s /
11521 decisions**. Its complete native terminal is exactly equal to the
previous published baseline (hash
`536c0cc92dce5a8649dc24c9021bcb0037a6661d3d876d12d19ee3fed9f9b6d3`).
No input, seed, policy, recipe, physical tolerance, foot envelope, evaluation limit
or terminal criterion was relaxed. Full-match arms use the same source and frozen
25ms decision-probe protocol; selecting an arm only isolates its execution.

Final verification: one complete `npm run verify` passes lint,
2657 unit tests, 56 integration tests, 4 career contracts,
5 full-career tests, TypeScript and the production build. All 21 current/historical
source and CI-contract checks pass, all 1383 manifest paths
reconstruct, and production Edge UI passes two viewports. PR195–215 evidence is
byte-preserved. verification.json indexes successful checks, interrupted commands,
negative trials and previous published evidence.

Promotion decision: **RETAIN_EXPERIMENTAL**. This is one completed frozen paired
protocol, not independent-corpus promotion evidence. Maintained PR201/B, defaults,
issue dimensions, sealed confirmation and production stance/falling remain unchanged.
Next dependency: broader independent match corpus and source-bound integration of
the stance/traction/falling prototypes. Earlier editions below retain their original results.

## Earlier release continuity follow-up — release-final-v2

**The recorded 946.075s pass handoff is repaired; the renewed full match remains incomplete.**
Research change: ordinary owned ground-pass family selection in the upright cluster no longer
depends on instantaneous low-foot readiness. A bouncing ball can nominate a finite pending
intention within the existing 0.65m readiness band. Selection preserves the actual ball state;
only a real foot intersection at or below the unchanged 0.24m strike cap releases the pass.
An out-of-band ball or an active historical challenge cannot fall through to the old grounded
release. Unsupported foot techniques retain their existing grounded consumer, but cannot
replace an airborne ball with a nominal ground release. The historical pair prototype and
maintained baseline keep their old scope. No new executor, motor budget or possession grant.

Local result: the exact pre-release state at 946.025s nominates at 946.050s with ball height
0.242449559m, rather than installing the old zero-height release. The actual inside/right-foot
contact occurs at **946.082253614s**, ball-centre height **0.220586268m**, within the existing
pending window. The canonical continuation reaches 966.025s and makes **53 onward decisions**
without an unresolved witness. Native schema reloads agree. Boundary-height, above-band,
challenge and unsupported-technique regressions cover the selection/readiness distinction.
See canonical-release-final-v2.json.gz and summary-release-final-v2.json under performance/pr216.

Integration effect: the new ball trajectory exposes a three-body boundary constraint at
460.790099133s. The preserved release-final-v1 source stops after 32 sweeps with residual
0.000188337156m/s and no penetration. Smaller components still run their identical first
32 sweeps; only a residual above 1e-4m/s earns bounded completion to 64. Five-body components
retain their existing 64-sweep limit. The exact first 64 pair impulses remain equal to the
failed ledger prefix; restitution is not reapplied. The repaired case reaches 2.27e-8m/s,
zero penetration and zero position correction. Energy falls from 353.750440360J to
154.018546348J; momentum change equals the external boundary impulse. Its 20s continuation
makes 16 decisions. Input, negative source and ledger are retained in release-convergence-*
receipts. Geometric, residual, correction, event, storage and body-count bounds are unchanged.

Both unchanged 22-player inputs pass **600s**, with contacts, decisions and ball transport in
every minute. CI replays both incident continuations as well as the previous five-body case.
The renewed frozen 90-minute protocol reaches **1493.925s / 2356 decisions**, then stops on
**action_starvation**, not a collision exception. The final complete minute has zero decisions,
contacts and ball transport. A native replay from 1320s exactly reproduces the 1380s checkpoint.
The loose ball is stationary at height 0.11m; keeper proximity excludes the shared ordinary
owner and the historical keeper/aerial fallback continues. The ball and decision count stay
identical from 1380s to the stop. This establishes the observed exclusion and liveness failure,
not a complete causal repair of the keeper-zone path. Full input, minute checkpoints and events
are in match-attempt-initial-release-final-v2.json.gz; the focused native replay and pre-stop
states are in next-keeper-zone-starvation-release-v2.json.gz.

Across 29269 body solves the largest component is four, maximum residual 1.85e-6m/s,
penetration 1.59e-11m, momentum error 2.28e-13kg·m/s and maximum passive-energy increase
7.11e-15J (floating-point scale). This renewed trajectory does not exercise five-body contact;
the independent preserved five-body regression remains required. The maintained PR201/B arm
completes at 5782.1s / 11521 decisions. Its complete native terminal state equals the
previous five-final-v2 baseline exactly (hash 536c0cc92dce5a8649dc24c9021bcb0037a6661d3d876d12d19ee3fed9f9b6d3).
See baseline-parity-release-v2.json and verification.json.

Validation: one complete final-source `npm run verify` passes lint, 2637 unit tests in 283
files, 56 integration tests, four career contracts, five full-career tests, TypeScript and
production build. All 21 source/historical/CI-contract checks pass. Reconstruction compares
all 1375 source-manifest paths. Production Edge UI passes both viewports, spectator/player
controls, exports, restart and policy replay. The earlier interrupted verify is retained as
interrupted evidence, not counted as a successful verification. The previous published
five-final-v2 verification and browser bytes are preserved before the current evidence update.

Promotion decision: **RETAIN_EXPERIMENTAL**. Next dependency: grounded loose-ball contact and
reaching handoff inside the keeper zone, preserving lawful keeper ownership. Maintained
PR201/B, defaults, formal issue dimensions and sealed confirmation remain unchanged.
Production stance/traction/falling remain prototypes. Current source fingerprint:
09929812ae12065fc124b0ba4e1eea22d370f0b48c4d9ec2de406922cc81a9fb.
Final verification and production-browser evidence are indexed in performance/pr216/verification.json.
Earlier editions and negative receipts below retain their original source and scope.

## Earlier five-body follow-up — five-final-v2

**Five-body component support passes; full-match diagnostic remains incomplete.**
Research change: the existing cluster solver now admits five connected upright outfield
bodies. Two/four-body components retain their 32-sweep arithmetic and budget. Five-body
components have at most 64 sweeps and 640 logged pair impulses (10 possible pairs × 64).
The 1e-4m/s residual, 1e-7m contact tolerance, 2mm correction, 16-event interval and 22-episode
storage bounds remain unchanged. Six connected bodies still produce explicit overflow.
No second executor, extra motor update, changed restitution or forced possession is added.

Local result: the exact old 698.675172247s five-body contact resolves in 11 sweeps / 20
support impulses. Kinetic energy falls from 64.741200374J to 64.647856871J, residual closing
speed is 4.38e-11m/s and penetration is zero. The 60s canonical continuation makes 133
onward decisions. Replay from the native 660s checkpoint matches the full-run 720s
checkpoint exactly. See canonical-five-final-v2.json.gz, five-component-native-replay-final-v2.json.gz
and five-body-incident-input.json.gz under performance/pr216.

The alternating 110/55kg chain exposes why simply raising the body count is insufficient:
the actual 32-sweep impulse-ledger prefix leaves 0.000524121725m/s closing speed. The
64-sweep result reaches 2.13e-8m/s with 256 recorded impulses and dissipates passive energy.
This is an uncalibrated engineering stress control, not an empirical mass calibration.
Its full input and impulse ledger are in five-constraint-budget-v2.json.gz. New tests cover
unequal masses, oblique/cross contacts, zero-restitution persistence, deterministic roster
ordering, canonical continuation/reload and explicit six-body overflow. The CI benchmark
retains five-body support events even when no new restitution impact is due.

Integration effect: the unchanged frozen 22-player / B input now passes the former five-body
halt. The renewed full-match attempt reaches **946.075s and 1663 decisions**, then records
initial_penetration at a different historical normal-pass release handoff. It is **not** a
completed 90-minute match. Across 10766 body solves, the maximum component is five,
maximum iterations 29, residual 1.00e-10m/s, body penetration 1.76e-14m, momentum error
2.28e-13kg·m/s and passive-energy increase zero. Complete input, minute checkpoints,
activation counters, event ledger and pre-incident window remain source-bound in
match-attempt-initial-five-final-v2.json.gz. The maintained paired PR201/B baseline is
recorded separately, without enabling the development observer or changing its profile.

Next dependency: repair that finite release handoff.
At 946.025s the owned ball is at 0.252378902m; at 946.050s the historical normal pass
replaces it with a grounded release at height zero, outside the prepared low-foot path.
On entry to the physical interval, the releasing right boot has a 0.026840311m negative
surface clearance. The exact pre-release/invalid-input/terminal states and measured gaps
are in next-release-handoff-blocker-five-v2.json.gz and its JSON summary. No body bound,
foot tolerance or launch input is changed to force this attempt through the incident.

Promotion decision: **RETAIN_EXPERIMENTAL**. Maintained PR201/B, defaults, issue dimensions
and sealed independent confirmation remain unchanged. Production stance/traction/falling
remain prototypes. Source, final verify, historical replay and browser results are indexed
in performance/pr216/verification.json. Earlier source editions and their failures below
remain preserved with their original scope.

## Earlier P1 source edition — p1-final-v6

**P0/P1 continuous-play gates pass; RETAIN_EXPERIMENTAL.** Research change: finite
active-ankle reaching and retraction share the existing connected foot geometry, canonical
motor interval and chronological contact search. Local result: the preserved resting-ball
deadlock resumes actual control and two further decisions in ten seconds. Integration:
two unchanged 22-player inputs each pass 600 seconds with contacts, decisions and ball
transport in every minute. Promotion: maintained PR201/B remains unchanged; gait/traction
and falling are isolated prototypes. Next dependency: bounded denser contact continuation,
then common planted stance/ball geometry and physically coupled fall/recovery. Full protocol attempt is reported separately below.

## 1. Execution plan and audit

Order: PR210–215/source/protocol audit; preserved incident reconstruction; extend
first-contact authority; reception/carry/delivery remainder; local and saved-state
regressions; normal 22-player run; gait/traction audit and isolated prototype; sparse
fall prototype; historical-source checks, browser, verify and hosted CI. The preserved failed liveness editions are negative evidence; only the repaired, source-bound
P1 edition may pass the smoke gate and dispatch the frozen protocol attempt.

Audited authorities: `matchSimulation` remains the only canonical 40Hz executor;
`canonicalMovement`/`locomotion` spend one finite motor budget; `pendingStrikeInterval`
owns chronological bodies/feet/ball; `multiBodyContact`/`playerBodyContact` apply existing
normal impulses. `ballAcquisition`, `ballContactGeometry`, `ballContactResolution`,
`carryExecution`, `carryPursuit` and `passReception` govern contact/control/intention.
`matchRules`/`defensiveChallenges` own referee judgements; `matchInjuries` retains seeded
medical exposure. `matchState`, `integrationProfile`, native checkpoint exports and
`holisticDevelopment` own validation/configuration. `TacticalMatchSandbox` retains its
existing selectors, spectator/player controls, pauses and exports.

## 2. Exact PR215 reconstruction

Original incident/session/native-replay bytes remain unchanged under `performance/pr215`.
The new receipt contains all 80 preserved pair frames, including owner and contact-owner
status; it does not assume initialization was separated. The implicated pair is
`footballer_pro_0_11` / `footballer_pro_1_12`.

| Native time, s | Torso-core clearance, m | Observed phase |
| --- | ---: | --- |
| 11.150 | +0.253226004164 | loose ball / shared owner |
| 11.175 | +0.169593679209 | owned carry, shared cluster absent |
| 11.200 | +0.091276286701 | owned carry, shared cluster absent |
| 11.225 | +0.018965922759 | last verified separated frame |
| 11.250 | -0.046205981927 | first preserved interpenetrating frame |
| 11.300 | -0.145095352823 | carry continues |
| 11.400 | -0.267374828755 | carry continues |
| 11.450 | -0.300779010497 | deep overlap already exists |
| 11.475 | -0.300779010497 | new owner rejects initial overlap |

Sweeping the **actual preserved endpoint chords** for [11.225,11.250] gives first
surface entry at **11.232146682511107s** (7.146682511ms into that interval). This is
an interpolated reconstruction of the old produced paths, not a claim that its
pre-projection motor velocities exactly equal those chord derivatives. The canonical
semi-implicit motor segment must instead be swept before any positional projection.

The root cause was phase-dependent authority: ordinary carry bypassed the shared
two-moving-body solver. Historical personal-space/compliance writes were position-only,
used other players' pre-step configurations and did not resolve the two moving bodies'
momentum. Their produced endpoints crossed the torso core. At the later standing-contact
handoff, the shared solver correctly rejected a deeply invalid **input**; it was too late
to repair the producer. This is not evidence of a 30cm numerical tolerance problem or an
initial fixture overlap. The saved window, ball-owner transition and absent cluster
records identify the missing movement consumer; no replay evidence establishes a cleared
contact episode as the primary cause.

The matched two-body experiment reuses those preserved chord velocities and masses
69kg/79kg. The former endpoints penetrate 4.620598cm. The new solver records contact
at 11.232146682511107s, applies 101.953206583Ns and ends with **3.152034mm positive
clearance**. Full initial/nominal/result states and the impulse/remainder are in
`performance/pr216/matched-original-pair.json.gz`. This is a local matched causal
experiment, separate from the normal 22-player continuation.

## 3. First-contact movement authority

`multiBodyParticipants` now includes active supported upright outfield players throughout
open play, independently of pending actions or ball ownership. Relative-motion swept
circle entry reuses `findPlayerBodyContact`; stable event ordering and the 0.68m solid
diameter remain. Supported pairs bypass the competing historical position-only projection.
The existing connected solve still admits at most **four** bodies; this is not a new
22-body rigid-body solver. Keepers/unsupported poses retain their explicit limitations.

Unsupported ball techniques use the same interval in **body-only** mode before their named
historical ball consumer. That mode does not advance, project, rebound or acquire the ball.
Thus upright body authority no longer disappears during an aerial/keeper fallback, while
those ball trajectories are not falsely certified as fully shared chronology.

## 4. Impulse and remainder

Both bodies advance to earliest contact; the existing mass-dependent equal/opposite
normal impulse updates authoritative velocities. Rebased endpoints use only those
velocities for the remainder. The next collision search and foot trajectory consume the
corrected segments. There is no second motor acceleration. Existing restitution is used
once per episode; persistent constraints have zero restitution. Supported shallow initial
correction remains **2mm**, with deep corruption/tangency/overflow explicit.

Foot anchors now follow rotating canonical body geometry instead of endpoint chords that
changed discontinuously when an intermediate body event rebased the segment. Completed
pass and standing-challenge strokes have saved, bounded, smooth foot return paths. They
cannot vanish at expiry into the ball. Return paths expire and remain passive, rather than
granting another action. All new persisted fields have Zod schemas and are cleared on
historical profile selection.

## 5. Reception, carrying, low delivery and loose ball

The ordinary interval admits owned carries and their physical bounces, free balls even without
a historical looseSince label, and low deliveries approaching the existing 0.65m ground-control
band. A descending delivery is admitted before crossing that band in the current tick. It retains
first-time, shot, keeper-zone and genuinely high-ball fallbacks. A nonphysical committed/slide
intention does not suspend ordinary ball flight while its historical resolver waits. The incoming velocity/height and one
actual reception impulse recorded in the source-bound local receipt are retained; transport
continues to 10.4s in the local apparatus instead of losing the reception remainder.
Flight age/distance advance once along the actual serviced delivery segments.

The carry controller can prepare and service contact at the actual event with zero extra
transport; the shared integrator owns all remaining flight. A failed control does not make
a foot intangible: passive contact changes the real ball without granting ownership.
Another actual foot ends protected control before the existing reception consumer evaluates
the resulting free ball. Existing PR210 readiness and separated-control loss remain.

Persistent ball-body support is included in the trajectory searched by feet and boundaries;
it is not a final endpoint projection invisible to those searches. Grounded unprepared
feet use a conservative relative-acceleration distance bound. Difficult supported searches
remain bounded at 2560 evaluations/foot for cluster mode; historical pair mode keeps 160.
The larger finite bound has measurable cost and is not an overlap-tolerance increase.

## 6. Local regression evidence

`pr216Continuity.test.ts` covers head-on, oblique, rear, stationary/moving and opposing-turn
convergence with the ball far away and no dummy pending action. Existing multi-body,
standing-contact, initial corruption, persistence, touchline, lawful interruption, pass-first,
body-first, third-body and saved-continuation regressions remain required.
The nine-scene source-bound receipt includes actual reception, ordinary contest, three/four
bodies, body/pass orderings, standing foot and boundary cases. Full numerical impulses,
normals, relative velocities, support/balance, remainder endpoints and law facts are saved.
See `performance/pr216/summary-final-v2.json` and `canonical-final-v2.json.gz`.

## 7. Referee and Law 12

The [current IFAB Law 12](https://www.theifab.com/laws/latest/fouls-and-misconduct/)
distinguishes fair challenges from careless/reckless/excessive-force actions. Ordinary
body impulses do not automatically create a foul, winner, injury or possession. Actual
selected standing challenges still reach the existing referee at their physical event;
legal interruption prevents later transport/contact. No detailed hand push is inferred
from an upright torso sphere: arm contact, holding and articulated evidence remain missing.
The collision's existing bounded `plantBalance` disturbance is not proof of a fall.

## 8. Footstep audit

The source-backed translation audit moves the body 0.5m with unchanged support/pose:
the nominal supporting foot also moves **0.5m**. The production representation therefore
does not plant a weight-bearing foot in world space. Support flags and two-bone geometry
alone cannot establish turf traction. Normal production planting remains disabled.

## 9. Traction research and assumptions

The prompt misattributes the 2017 review: [Silva et al., 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5480019/)
authored the named systematic review. [Thomson et al., 2019](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0216364)
measured natural-grass translational and rotational traction separately; shoe/grass effects
and the limitations of the applied normal loads prevent a universal wet-grass coefficient.
[Loud et al., 2024](https://pubmed.ncbi.nlm.nih.gov/39131098/) measured directional translation
across boots/surfaces; [Thomson et al., 2022](https://doi.org/10.1080/19424280.2022.2038690)
also separated rotational shoe effects on natural/hybrid grass. These studies motivate
separate finite translational force and rotational torque, not an injury probability.

Prototype `firm-grass-dev-v1`: mu=1, rotational limit=35Nm, swing limit=16m/s,
reference stance duration=0.18s. Lower-grip sensitivity uses mu=0.25. These are explicitly
**uncalibrated engineering choices**, not coefficients fitted to those experiments.

## 10. Gait/traction prototype and blocker

`scripts/pr216GaitPrototype.ts` reuses the canonical motor once, caps its earned momentum
by mu*N, transports the body with the resulting velocity and feeds world anchors into the
existing two-bone IK. Foot release precedes bounded swing/next support; impossible support
is returned explicitly. No production match enables this optional IK apparatus.

Ten objectives × two grip levels record steps, slip, body transport, support force and
peak acceleration. In the reference acceleration objective mu=1 produces no slip; low
grip limits acceleration to 2.4525m/s² and permits explicit sliding. The sprint apparatus
can exhaust reachable support. Pass/shot names are **stance objectives, not executed
passes/shots**; one-leg disturbance is prescribed velocity, not a new physical collision.
Those required coupled tests remain unfulfilled. The optional anchored IK is not yet consumed
by production foot-ball contact; enabling it before that dependency would create conflicting
foot locations. This is an explicit Gate E/F blocker, not production gait success.

## 11. Hybrid fall feasibility

The isolated sparse planar torso has angle/angular velocity, COM translation/velocity,
bounded postural torque, finite support extent, ballistic descent and unilateral torso-ground
collision. Zero impulse stays supported; the recorded angular impulses cause actual geometric
support failure and ground contact. No RNG or injury roll is used. Only disturbed bodies
would need such extra state in a later live hybrid. It is neither a full anatomical ragdoll
nor validated linked-body recovery; the grounded contact is dissipative and simplified.

## 12. P1 repair and next implementation plan (PR217)

Reaching is a bounded, saved displacement of the active ankle in body-local turf coordinates:
maximum 1.2m/s and 0.30m per axis. The connected two-bone geometry, contact-law consumer and
searched path use the same ankle; one canonical motor update spends that budget once. An
actual foot event stops the remaining reach command, and finite retraction/recovery precedes
another powered touch. Nomination never grants possession. Acquisition after a historical
high-ball/keeper consumer also requires the actual three-dimensional foot surface (0.145m
combined radii, 1µm contact tolerance). Both feet remain solid during a prepared stroke.

Persistent foot support supplies zero-restitution constraints in the trajectory searched by
all other feet. Prepared/recovering displacement participates in geometric rearming; expired
recovery cannot resurrect an old prepared offset. Unsupported actors cannot be repeatedly
serviced through the recovery exception. The shared upright motor chord now also survives
personal-space writes around unsupported bodies. Staging/retrieval keeps upright outfield
CCD active; the perimeter persists through restart release so a legal thrower returns from
the touchline without a body snap. Historical keeper/aerial consumers retain their named
scope. A selected prepared attempt still explicitly rejects an unsupported third-body contact.

The historical 0.72m aggregate ball/body sphere also occupied working boot space. In cluster
mode it is replaced by the same 0.34m torso core used for body/body contact, represented as
a vertical capsule at 65% of player height with 12% half-height. These proportions remain
uncalibrated development assumptions; lower-limb skin beyond the actual boots is not modeled.
Keeper and historical pair/aerial consumers retain their old geometry. This removes mutually
incompatible self-support constraints rather than increasing overlap tolerances. Current torso
persistence tests therefore use the actual capsule surface; historical ground aggregate inputs
and receipts remain sealed. Supported-curve root crossings are bracket-refined within the same
finite evaluation budget. A new challenge cannot begin while that actor's foot is still returning,
so a hidden mid-swing path cannot appear when recovery expires. Settled shot rebounds return
to the low physical interval while their shot lineage remains intact; moving/high rebounds retain
their named consumer.

Next: validate five/six-body dense constraint continuation, preserving finite event/search bounds,
impulse/energy accounting and native replay. Then persist world stance/swing contacts in the common foot geometry; add finite load transfer,
translation/rotation limits and explicit slip. Couple COM/support polygon, torso angular momentum
and bounded recovery to actual body impulses. Activate sparse falling only after failed physical
support, then implement grounded contact and reachable powered recovery. Exercise real pass,
shot, one-leg contact and turn controls against that common geometry before production promotion.

## 13. Normal-team and browser results

The final P1 source is bound by performance/pr216/source.json and the reconstructible delta
archive. See summary-p1-final-v6.json and canonical-p1-final-v6.json.gz for complete inputs,
checkpoints, event windows and minute-by-minute liveness. No rosters, permanent attributes,
seed, policy or selected physical mechanisms are changed between ticks.

| 600s input | Decisions | Executed receptions | Prepared kicks | Standing foot contacts |
| --- | ---: | ---: | ---: | ---: |
| Preserved PR215 browser incident | 822 | 230 | 45 | 26 |
| Frozen protocol B input | 1030 | 267 | 28 | 25 |

Every 60-second window has actual foot activity, onward decisions and over one metre of
measured ball transport. Neither run reports an unresolved interval. The first has 471 fresh
body impacts, 5838 supporting solve steps and maximum recorded penetration 1.69e-14m; its last
B invocation is at 599.825s. Save/reload continuation compares eight exact native steps at
minute checkpoints. The CI check uses 60 seconds of the first roster, 120 seconds of the
second, plus ten seconds resumed directly from the old resting-ball checkpoint. It requires
real activity, rather than accepting clock progression alone. Resuming the old 600s deadlock
now produces a fresh foot contact at 600.052210574s and two decisions by 610s. Separate regressions cover the
prepared standing/recovery latch and an unlabelled ball handed back by the aerial consumer.

Earlier final-v2 remains negative evidence: its last B call was 6.450s and the minimum actual
foot-surface gap was 0.062366838m despite nominal reach of 0.82m. Earlier P1 source editions
passed one roster but failed the frozen input at 63.600s; that failed receipt remains stored.
The repaired handoffs are not rebound to those old recordings. No forced possession,
teleport, immunity or invented referee intervention breaks the pack. Browser acceptance
and exports remain separate UI checks in performance/pr216/browser.

### Frozen protocol attempt

The first full-match attempt was actually dispatched after the local and 600s smoke gates.
It stopped at **698.700s** with **body_count_bound**: five connected bodies exceeded the
unchanged four-body contract. It had made 1158 decisions. Complete input, native checkpoints,
the contact event and bounded pre-incident window are in
match-attempt-initial-p1-final-v6.json.gz and its summary. No bound is silently raised and no
winner, teleport or forced continuation replaces that unsupported solve. This is an explicit
failed 90-minute diagnostic, distinct from the passed scoped P0/P1 continuous-play gates.
The maintained paired baseline completed at 5782.1s with 11521 decisions. Its complete terminal
state matches the pre-torso-change baseline exactly in the same native environment; see
baseline-parity-p1-v6.json. Earlier failed source editions are recorded separately.
The next match-level dependency is supported five-body/denser contact continuation; production
stance/fall coupling remains a separate physics dependency. **No holistic 90-minute completion
or whole-profile promotion is claimed.**

## 14. Save/replay and historical evidence

New complete schema checkpoints are compared over eight exact native continuation steps
each, with no rounding of physical values. Normal schema normalization removes surplus ball
metadata copied into point-valued tactical targets, as in the preserved PR215 limitation.
There is no claim of Edge/Node or Windows/Linux bit-identical trajectories. The P1 receipts and
final verification are indexed by their actual source fingerprint. Historical PR195–215 evidence
bytes remain unchanged, and historical checks execute their frozen source archives. Earlier
publication verification and failed invocations are retained separately from the new P1 run.

## 15. Performance and verification

Costs, source fingerprints, local attempts, verify phases and historical checks are indexed
in `performance/pr216/verification.json`. The complete original 28-job CI structure and its
historical commands remain; PR216 is an additive check in the existing main group. Hosted
results must be assessed at the published head. Do not call the PR ready before `npm run verify`
passes. Short timing samples/parallel verification are not performance calibration and cannot
be extrapolated to a certified 90-minute match.

## 16. Completion answers and promotion decision

1. The original 30cm penetration came from carry-phase omission of the shared two-moving-body
   owner; the preserved source/input evidence identifies first surface entry before the later halt.
2. Supported upright outfield transport now uses first-contact impulses and actual remainders
   across ordinary play and restart staging. Bounds and unsupported prepared encounters remain explicit.
3. P1 now has finite reaching, real control and onward normal-team activity, with two 600s
   receipts and continuous-play regression gates. This does not certify every future match input.
4. World foot planting is still absent in production. The source-backed traction/IK and planar
   fall prototypes establish executable foundations and explicit coupling dependencies.
5. RETAIN_EXPERIMENTAL. PR201/B/defaults, formal issue dimensions and sealed independent
   confirmation remain unchanged. Full-match protocol outcome is recorded separately; no
   elapsed clock, selected flag or completed diagnostic promotes the physics profile.
