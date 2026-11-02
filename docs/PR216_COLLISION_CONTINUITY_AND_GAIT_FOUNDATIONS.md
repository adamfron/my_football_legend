# PR216 — Collision continuity and gait foundations

Base: merged PR215, `3873c736e1b76c3ea5d1a71a6c1ab637d9a42c10`.

**DRAFT / P1 NOT COMPLETE / BLOCKED_FOR_HOLISTIC_MATCH.** Research change: extend
the existing contact owner across ordinary low football and all supported upright
outfield transport. Local result: reception remainder and bounded body/contact
regressions pass. Integration effect: the original 30cm overlap path is prevented,
but normal-team play exposes a further loose-ball foot-reaching deadlock. Promotion:
**RETAIN_EXPERIMENTAL**, maintained PR201/B unchanged. Next dependency: executable
reaching/support-foot motion in the same geometry, then physical fall/recovery.
This PR does **not** fulfil the prompt's mandatory complete P1 acceptance gate.

## 1. Execution plan and audit

Order: PR210–215/source/protocol audit; preserved incident reconstruction; extend
first-contact authority; reception/carry/delivery remainder; local and saved-state
regressions; normal 22-player run; gait/traction audit and isolated prototype; sparse
fall prototype; historical-source checks, browser, verify and hosted CI. No 90-minute
run may follow the failed ordinary-play liveness gate.

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

The ordinary interval admits owned low carries, released touches and low labelled deliveries,
including a bounded low bounce whose projected height remains <=0.24m. It retains first-time,
shot, keeper-zone and genuinely high-ball fallbacks. The incoming velocity/height and one
actual reception impulse at **10.047027611s in this source edition** are retained; transport
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
See `performance/pr216/summary-final-v1.json` and `canonical-final-v1.json.gz`.

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

## 12. Exact next implementation plan (PR217)

1. Reproduce the complete source-bound normal-team loose-ball deadlock checkpoint below.
   Give an actually nominated acquisition a finite reaching-foot path with reachable ankle,
   passive opposing contacts, readiness, misses and finite retraction. Nomination cannot
   assign possession; successful actual control must execute exactly one shared impulse.
2. Persist stance/swing contact locations and finite transfer in the **same** canonical
   player/foot geometry consumed by kicks, tackles and collision rebasing. Add leg-reach
   admissibility, support loading, separate finite translation/rotation and explicit slip.
3. Couple COM/support polygon, torso angular momentum and bounded postural recovery to
   the existing physical body impulse. Do not infer a fall from balance rating alone.
4. Activate sparse torso/pelvis falling only after physically failed support recovery; add
   ground/player/ball contact for its actual fallen geometry. Keep upright and fallen
   contact owners mutually exclusive and preserve Law 12/keeper authority.
5. Implement grounded support and finite powered recovery through anatomically reachable
   articulated poses, with force/work/ground constraints; no timer teleport to upright.
6. Exercise pass, shot, one-leg opponent contact and supported turn with the actual common
   foot solver, plus impulse/no-impulse/recovery controls and exact native saved states.
7. Repair normal-team liveness, complete all ten required ordinary-play scenarios and the
   frozen smoke/protocol gates. Then attempt the first 90-minute development match.

Actual falling and recovery belong in that dedicated physics PR once the common support
geometry is valid; they are not deferred to an unspecified animation project.

## 13. Normal-team and browser results

The normal `pr215-ui-incident` input is loaded without injecting scenes or altering rosters,
policy B, selectors or attributes. The physical run reaches 600s without the original
unresolved halt. **This is not an accepted continuous football integration smoke:** a later
loose-ball state suffers action starvation. Four mutually constrained bodies can remain
around a resting ball while no nominal foot sphere reaches it. The former acquisition
consumer is replaced in the shared interval, but an active finite reaching-foot mechanism
has not replaced its whole useful scope. Advancing the clock cannot pass this liveness gate.
The complete terminal state and preceding 80-frame window are preserved. No possession,
fake force, immunity, teleport or invented referee interruption is used to break the pack.

The mandatory controlled-long-touch/approaching-defender/actual-tackle sequence is therefore
not certified in normal continuous play; neither are all ten requested full-team scenarios.
Keeper fallback/local law tests remain distinct from a newly accepted whole-match result.
Browser results and screenshots are retained separately in `performance/pr216/browser`.

## 14. Save/replay and historical evidence

New complete schema checkpoints are compared over eight exact native continuation steps
each, with no rounding of physical values. Normal schema normalization removes surplus ball
metadata copied into point-valued tactical targets, as in the preserved PR215 limitation.
There is no claim of Edge/Node or Windows/Linux bit-identical trajectories. Historical
PR195–215 receipt bytes/assertions remain unchanged. PR215's original checker now executes
in its exact merged source via `scripts/ci/replayPr215Check.mjs`; current guards bind PR216
separately. Source manifests and reconstructible delta archives accompany the new receipts.

## 15. Performance and verification

Costs, source fingerprints, local attempts, verify phases and historical checks are indexed
in `performance/pr216/verification.json`. The complete original 28-job CI structure and its
historical commands remain; PR216 is an additive check in the existing main group. Hosted
results must be assessed at the published head. Do not call the PR ready before `npm run verify`
passes. Short timing samples/parallel verification are not performance calibration and cannot
be extrapolated to a certified 90-minute match.

## 16. Completion answers and promotion decision

1. **Cause of 30cm penetration:** carry-phase omission of the shared two-moving-body contact
   owner; historical position-only endpoints entered the solid core before later handoff.
2. **Earlier time:** preserved chord entry 11.232146682511107s within [11.225,11.250].
3. **Contact before deep overlap:** yes in the declared supported upright canonical paths
   and tested ordinary low carry/reception coverage; unsupported geometry remains explicit.
4. **Remainder:** both bodies and the supported low ball continue from resulting velocities;
   reception remainder now completes. Unsupported high/keeper ball phases retain named owners.
5. **Turf:** production feet still slide with the body; finite traction/anchored IK is an isolated
   experiment with explicit slip/support failure, not a promoted live contact mechanism.
6. **Destabilization:** body impulses already change velocity/balance. Genuine falls additionally
   need COM/support geometry, angular momentum, recovery limits and ground/fallen-ball contacts;
   a planar isolated prototype now exercises part of that dependency.
7. **Playable continuous holistic match:** original halt prevented, **full ordinary play still
   fails liveness**. This draft does not promise the owner a finished continuous match.
8. **First 90 minutes:** **NOT READY / NOT RUN**. The exact next blocker is active finite
   loose-ball foot reaching in a body-constrained contest, followed by complete ordinary
   coverage/activation gates. Independent confirmation remains sealed.
