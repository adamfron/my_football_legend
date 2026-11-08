# PR218 — Canonical articulated body and gait

Historical staged v1 report. The [v2 continuation and gate repair](PR218_STANCE_V2_GATE_REPAIR.md)
records subsequent work; the failed v1 results below remain preserved for their source.

Base: merged PR217, `90eb730854240a949be61a344cf3955b31f3cfa0`.

**Staged development implementation; RETAIN_EXPERIMENTAL / NOT_READY_FOR_FULL_MATCH.**
The shared geometry is executable in the real canonical motor, contact search,
presentation and native replay. The promoted PR216 reference stance still fails
sprint feasibility. This report does not describe it as a complete gait solution.
The ordinary career and maintained PR201/B selection do not opt in.

## 1. Execution plan and architecture audit

Work order: audit PR213–217 and the integration/dependency/protocol/assumption
registers; preserve the merged baseline; measure the old rig; introduce the
small persistent stance and derived body contract; constrain the existing motor;
connect the shared contact trajectories; adapt the existing articulated rig;
run paired laboratories and historical incidents; stop full-match promotion at
the first failed mandatory gate; run technical and historical CI checks.

The source owners remain:

| Physical fact | Authoritative consumer |
| --- | --- |
| Target, attainable speed, motor capability | Existing intentions and `locomotion` |
| Root position/velocity, facing, fitness | `canonicalMovement` and `matchSimulation`, one motor budget |
| Support and world-space boot centres | `articulatedStance`, updated by `advanceArticulatedStance` |
| Hip, knee, ankle, pelvis, limb capsules | `deriveLowerBodyGeometry`, connected two-bone IK |
| Prepared strike/challenge, follow-through/recovery | Existing pending path, latch and recovering feet |
| Actual boot trajectory and ball intersection | `canonicalStrikeFoot` and `findStrikeIntervalContact` |
| Body impulse and post-impact remainder | Existing `pendingStrikeInterval`, upright cluster solver |
| Presentation and replay | `projectArticulatedBody` through canonical presentation |
| Mesh transforms and secondary head/arm movement | Existing `PlayerModel`, without physical authority |

No new root integrator, tactical actor, guaranteed kick, permanent attribute,
injury rate, conditioning calibration or full rigid-chain solver is introduced.

## 2. Source-backed visual mismatch

Before selection, physical nominal feet are at local lateral ±0.17m and forward
0.20m (or finite lower-body reach); pelvis and bones scale from physical height.
The rig instead places hips at ±0.125m / 0.87m, uses two 0.38m visual leg segments,
and places boots under the rotated knee. Its speed/time/gaitPhase stride and
release cues are independent of physical foot paths. The visual body then has
height and mass-derived width scaling. A translated torso therefore moves the
old nominal support foot, while cosmetic stride changes the visible contact point.

`landmark-audit.json` records all nine world-space landmarks in each of the nine
required states. The old rig is compared to old root-relative physical geometry;
the new rig to the selected authoritative body. Root/facing and old contact geometry
are recorded alongside them. A fixed legacy cosmetic gait phase of 1.1 makes the
comparison reproducible; these are prescribed snapshots, not recovered historical
camera frames. Measured boot errors:

| Scene | Old left boot error | Old right boot error | New boot error |
| --- | ---: | ---: | ---: |
| Standing | 0.208888m | 0.208888m | < 1e-10m |
| Jog | 0.441071m | 0.088109m | < 1e-10m |
| Sprint, last reachable snapshot | 0.730642m | 0.144407m | < 1e-10m |
| Braking | 0.616258m | 0.108142m | < 1e-10m |
| Turning toward 90 degrees | 0.476280m | 0.087912m | < 1e-10m |
| Actual carrying | 0.093372m | 0.311877m | < 1e-10m |
| Actual receiving contact | 0.221186m | 0.142170m | < 1e-10m |
| Prepared pass | 0.146544m | 0.146544m | < 1e-10m |
| Neutral airborne reconstruction | 0.309390m | 0.309390m | < 1e-10m |

These are landmark discrepancies, not claims that the entire boot mesh was a
physical collision surface. Carry and receiving use actual canonical contact/control
states; movement snapshots use the same motor apparatus as the paired laboratory.
The separate screenshot harness includes a real two-tick moving continuation.
Airborne reconstruction does not certify a live jump/landing transition, and a
reachable sprint snapshot does not certify the next failed stance transition.

## 3. Versioned state and derived skeleton

Select `experimentalArticulatedBody: stance-foot-dev-v1` explicitly on the
unprofiled upright-cluster recipe, using `withArticulatedBody(state, surface)`.
It is deliberately not a normal career or Single Match menu preset. The effective
old holistic recipe no longer misidentifies an articulated state as its old edition.

`articulatedStanceSchema` persists only version, surface, support side or null,
support yaw, two world-space boot centres, finite stance elapsed time and angular
velocity. Root position/velocity, facing, jump and lower-body action posture remain
in their existing canonical fields. Full joint transforms are deterministically
derived, not repeated in a diagnostic history.

`articulatedBodySchema` describes a versioned snapshot with timestamp, physical
root, facing/angular state, upright torso orientation, pelvis and both leg chains,
active leg, support, physical height/mass, boot radius and boot yaw. Prepared
movement is composed from the same path used by the collision search. An
unreachable action is not replaced with a visually successful kick; unavailable
articulation suppresses cosmetic physical action cues.
Physical contact readiness still belongs to the existing motor-ready clock,
availability, preparation and contact lifecycle; the body contract supplies their
actual joint/surface locations rather than duplicating readiness or granting control.

## 4. Proportions, coordinates and collision approximation

Existing bounded assumptions remain: height 1.4–2.2m, thigh `0.245 × height`,
shin `0.246 × height`, hip offset `0.055 × height`; pelvis lowers only as required
by the connected leg solution. The 165/180/195cm laboratory uses 60/75/92kg.
No precise personal anatomy is inferred. Existing dominant foot supplies a missing
neutral active leg; weak-foot proficiency still enters the existing strike motor.
Existing agility, strength, pace, balance and fitness retain their consumers.

Physical X/Y are pitch metres; Z is height. Local forward is
`(sin(facing), cos(facing))`; right is `(cos(facing), -sin(facing))`; left is its
negative. Three.js maps to `(X − 52.5, Z, Y − 34)`, model forward +Z, root yaw
equal to physical facing. The rig converts metre-valued joints through its actual
parent transforms, compensating for existing body scales exactly once.
Its root/picker wrapper remains pitch-projected on the ground; physical jump lift
is already included in world-space joint heights, and is not applied again there.

Leg capsules share the IK endpoints. The historical upright torso core remains
radius 0.34m and is an explicitly coarse planar collision approximation, not a
new anatomically detailed shoulder/limb solver. Boots retain the existing 0.035m
effective contact sphere. The rendered boot is a broader visible surface around
that effective patch; high-resolution mesh collision is not claimed.

## 5. Grounded stance and gait promotion boundary

The PR216 apparatus now has `stepArticulatedGaitPrototype`, which exercises the
actual selected motor and stance consumers. Its original prototype and fall
experiment remain available with their historical scope; old receipts are intact.

A valid stance keeps its supporting boot centre in world coordinates while the
root/pelvis moves. The free foot moves at a finite 16m/s maximum toward a local
landing target with a bounded 8cm lift. The reference 0.18s stance is represented
as seven canonical intervals (0.175s), so transfer occurs at an exact tick boundary.
Idle feet stay still; unloading permits a finite transfer instead of a turf weld.
Active/recovering football feet are excluded from new support selection.

**The reference cadence is inadequate for sprinting.** The laboratory preserves
unreachable ankles when root travel exhausts leg reach before the next valid
support. A selected match retains its previous valid state with an explicit
`unreachable_articulated_stance` or `unreachable_articulated_foot` safety halt.
It does not stretch the leg, slide the anchor, teleport the torso or bypass contact.
This is a feasible-stance development controller and a diagnostic integration,
not a certified speed-adaptive running gait or full support-force solution.

## 6. Translational and rotational traction

PR216's reviewed sources remain relevant: [Silva et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5480019/),
[Thomson et al. 2019](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0216364),
[Thomson et al. 2022](https://doi.org/10.1080/19424280.2022.2038690), and
[Loud et al. 2024](https://pubmed.ncbi.nlm.nih.gov/39131098/).
They motivate separating translation, rotation and surface dependence. They do
not establish this game's exact coefficients or a universal footballer force law.

| Development surface | Translational mu | Rotational control bound |
| --- | ---: | ---: |
| firm-grass-dev-v1 | 1 | 35Nm |
| reduced-grip-dev-v1 | 0.25 | 12Nm |

The motor projects only its requested delta-v onto `mu × g × dt`, with normal
force approximated by mass × g. Lower grip reduces attainable acceleration rather
than inventing visible slip. Angular acceleration uses a bounded control torque
and engineering inertia `mass × height² / 12`. Neither new translational motor
power nor ground torque is supplied without support or in the air. Passive body
impulses are retained, not clamped as motor work or charged twice.

The boot yaw stays fixed through support and can change on release/transfer.
Explicit kinetic stud slip, unloading-dependent torsional resistance and a full
ground-force/COM constraint are still unsupported. The torque bound is an actuator
approximation, not a resolved stud torsion measurement. No injury inference follows.

## 7. Actual boot–ball coupling

`playerFootGeometry` reads selected world-space centres. `canonicalStrikeFoot`
interpolates those same centres over the actual interval, then composes the
existing finite prepared path or recovery. The search and renderer share this
composed result. Carry/reception use the selected base geometry rather than the
previous root-relative nominal foot. Foot radius, ball radius, contact tolerance,
impulse, spin, pending identity, expiry and earliest-event arbitration are unchanged.

Finite reach is checked before a selected trajectory can contact. Unsupported
reach currently halts the staged integration; a future controller must revise or
delay the intention before this boundary. We do not label integration failure as
a genuine football miss. Existing valid swings can still genuinely miss.
Legacy high techniques and restart releases are not silently migrated to a new
articulated strike. Complete cross-consumer action coverage remains a promotion gate.

## 8. Body collisions and support

The existing solver updates physical velocity once and rebases the remaining
root interval. Support anchors are world-space, while the next leg solution and
subsequent movement consume the changed root. `bodyAt` carries the corresponding
foot centres at intermediate event times; lawful interruption retains the actual
partial interval. Motor accounting still excludes external collision impulse.

Local paired body scenes record real upright impacts. This establishes shared
geometry and continuation, not physical tipping, a support polygon torque solve
or guaranteed kick recovery after every impact. The preserved PR217 cases expose
remaining unreachable support/action paths under the new edition.

## 9. Renderer projection and parity

The existing meshes, materials, appearance, clothing and articulated rig are reused.
Hip/knee groups and the measured pelvis are transformed to canonical positions;
ankle and boot landmarks are explicit. Segment lengths follow the shared endpoints.
`derivePlayerPose` does not invent a stride or release pose when articulation is
present. Secondary head/arm motion cannot move the contact landmark. Switching
back to historical frames resets the physical rig's transforms and proportions.

Numerical tests cover 165/180/195cm and four facings, both legs and all nine
landmarks, with a 1e-10m tolerance (well above measured floating-point noise and
well below the existing 1e-7m contact distance tolerance). This tolerance is for
transform parity, not anatomical accuracy. Browser measurements use both
1366×768 and 1920×1080. See [browser evidence](performance/pr218/browser/report.json)
and before/after screenshots in the same directory.

## 10. Native save, replay and compatibility

Old saves omit the selector and stance, retaining their original physical edition
and old rendering fallback. Explicit reconstruction does not alter a historical
fixture or receipt. Incompatible selectors, nonfinite feet and orphan stance fail
the native schema. Historical profile application clears the new edition and
stance. Native same-edition reload checks compare the native schema-normalized
state, preserving the established treatment of nonpersistent diagnostics.

Canonical presentation is included in existing bounded replay snapshots. On sparse
replay intervals the complete physical player snapshot is held until the next
authoritative sample: no interpolated root is combined with an old planted foot,
and no 50ms strike is invented between 200ms samples. Seeking and pause are pure
reads. Future smooth reconstruction needs denser action keyframes or compact
timestamped pose inputs, rather than independent graphical locomotion.

## 11. Laboratory and negative evidence

`benchmarkPr218.mjs` runs ten actual motor movement classes × three body sizes ×
two surfaces. The initial 60-scene run has 48 completed four-second scenes and
12 sprint/accelerate failures, with zero support-anchor drift during retained
support. Work is the exact change of planar root kinetic energy from the earned
motor delta-v; it is not a full metabolic or articulated-segment energy model.
The final source-bound `summary-v2.json` and compressed `laboratory-v2.json.gz`
record exact inputs, samples, terminals, failed commands, contact and impact facts.
The blocked-throw enabled arm now completes its full 40s local continuation. The
saved active-foot case at 4268.375000002s still halts on unreachable action geometry;
restart reentry still halts before the 2723.850000006s proposed endpoint. The
corresponding old-edition arms pass. The 165cm sprint negative is at 1.400s: before
the failing tick its speed is 9m/s and total leg length is 0.81015m, with stance
elapsed 0.150s. Its next finite landing cannot complete before reach is exhausted.

Negative checks include impossible leg reach, finite low grip, no airborne motor,
invalid/nonfinite/orphan save data, unavailable pose, genuine misses and existing
contact uncertainty. Overconstrained fast support, active-foot support handoff,
collision-disturbed support, jump/landing and falling are not broadly certified.
No contact-rate benchmark, larger hitbox or technical attribute bonus is used.
The near-horizontal singular IK knee plane is explicitly rejected before division
by a zero bend-axis norm; a dedicated regression prevents nonfinite joint output.

## 12. PR217 incidents and complete-match gates

The paired runner uses the original incident, blocked throw-in, conservative-search
blockers, six-body checkpoint, entry queue, human receiving authority and restart
reentry inputs. Disabled arms exercise the current ordinary holistic executor;
enabled arms explicitly install the new physical edition. Both have native reload
checks. Divergent physical trajectories are allowed. Failed new-edition intervals
remain explicit and prevent a full-match claim. Original PR217 source-bound checks
also run separately in the exact merged PR217 tree.

| Gate | Decision |
| --- | --- |
| 1. Isolated finite bones | Local valid poses pass; impossible reach rejected |
| 2. Supported stance/traction across movement classes | FAIL: sprint/acceleration reach |
| 3. Shared actual contact geometry | Local coupling implemented; general action gate incomplete |
| 4. Renderer reproduces shared joints | Local numerical and browser parity passes |
| 5. All selected-edition PR217/restart regressions | NOT PASSED: preserved new-edition halts |
| 6. Continuous 22-player integrated smoke | Not certified after failed prior gates |
| Complete experimental holistic match | NOT RUN, as required by the gate protocol |

PR217's three historical complete trajectories remain historical evidence for
their source, not proof of full-match reliability of `stance-foot-dev-v1`.

## 13. Performance and verification

Physics wall/CPU/maxRSS are measured in `summary-v2.json`; the paired runner includes
native reload, schema comparisons and diagnostic retention, so it is not a clean
per-tick production benchmark. Browser transform/render submission cost is measured
separately for 22 models with reused resources. Median timings are hardware/browser
observations, not guaranteed frame rate or GPU completion time. No per-frame mesh
reconstruction occurs. Browser counters include visible/culling differences.
On the final Windows/Node run, the entire native diagnostic suite used 319.107s
wall, 361.906s process CPU and 898.12MiB peak RSS. This ran alongside technical
verification, so wall-time overhead must not be interpreted as an isolated speed
comparison. The separate Edge rig harness, after task-owned benchmarks/tests had
stopped, observed 2.1–4.9ms median and up to 7.2ms p95 transform/render submission
for the selected 22-model scenes. Its old cosmetic comparison observed 2.1–4.1ms
medians; culling, timer resolution and host/browser variation limit comparisons.

The local verification receipt is `performance/pr218/verification.json`. It records
the exact source, completed focused checks, build and historical evidence guards,
and unsuccessful/interrupted full `npm run verify` attempts. Full local verification
has not passed: the earlier complete test sequence reached a career timeout, and
later attempts also exceeded existing deadlines. A standalone repeat passed all
five career cases without changing those deadlines. The final commit's complete
verification is delegated to the existing consolidated GitHub Actions workflow;
its live result is linked in the draft PR. Local partial results are not a full
verify claim. A failed mandatory physical gate is not converted into a passing
promotion decision merely because technical tests pass.

## 14. Hybrid ragdoll dependency contract

The shared root, facing/angular velocity, world support, finite bones, mass and
derived capsules are usable inputs for a future transition controller. Still needed:
physical pelvis/torso orientation and three-axis angular momentum; bounded COM and
support polygon; gravity and segment mass/inertia assumptions; support-force and
torque feasibility; causal loss of balance; altered upright/fallen contact volumes;
unilateral ground contacts; action eligibility while falling/grounded; finite
stand-up trajectories with reacquired support. These must have versioned, finite,
deterministically serialized state and share the existing event timeline.
PR216's planar fall prototype remains isolated. No random fall is added here.

## 15. Integration and promotion decision

Research change: physical world-space stance and a shared composed-boot skeleton
contract, consumed by the real motor/contact/render paths. Local result: measurable
parity and feasible low-speed support, with explicit fast-gait and incident failures.
Integration effect: an executable, separate development edition with preserved
historical/default behavior. **Promotion: RETAIN_EXPERIMENTAL, disabled in general
match execution.** No realism-registry issue is marked COMPLETE.

## 16. Next dependency and PR219

First repair speed-adaptive support placement/release and active/recovering-foot
handoff, including collision remainder and jump/landing. Re-run the failed exact
inputs before the 22-player smoke and frozen complete-match protocol. This physical
dependency precedes general technical calibration.

PR219 should then separate observed ball-flight prediction, anticipation latency,
body preparation, supporting-foot placement, receiving/cushioning stroke and actual
foot timing. Compare the effect of the existing technical/cognitive attributes on
contact, preparation and miss reasons. The owner's 396 attempts / 107 contacts /
280 misses remain a calibration target, not a success rate tuned in PR218.

## 17. Explicit completion answers

1. Existing canonical root/profile/jump/lower-body pose plus versioned compact
   world stance define the body. Joint positions and proportions are derived.
2. Yes within the selected executable paths: motor traction and actual searched
   boot use this state. General football/action integration remains partial.
3. Retained grounded support has zero measured centre drift. Reduced grip caps
   acceleration; the boot can reorient on release. Kinetic slip is not implemented.
4. Walking/jogging and tested braking/turn/reverse/shuffle/backpedal scenes run;
   sprint and acceleration to sprint fail the finite-reach gate. No general claim
   of smooth, stable sprinting is made.
5. Yes for supported tested poses: all physical/rendered landmarks meet 1e-10m.
6. Body impulse changes the shared root/remainder and leg feasibility; actual
   paired impacts are recorded. Universal support recovery and future kicks are
   not certified.
7. Existing-edition local checks and source-bound history are tested separately.
   Long-match reliability of the new edition is not established; selected incident
   continuations expose explicit blockers.
8. No. Speed-adaptive reachable support and finite action/restart handoffs must pass
   before complete experimental full-match use.
9. Three-axis angular/COM dynamics, causal support loss, changed collision volumes,
   ground contacts, action eligibility and finite recovery still need integration.
10. PR219 should investigate observed prediction, anticipation, preparation,
    support and foot timing with existing attributes, preserving actual collision
    physics and genuine misses.
