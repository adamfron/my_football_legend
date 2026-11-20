# PR225 — Unified full-body skeleton and individual morphology

Base: merged PR224, `7c6efaa97a42b40f2a328ff50a1cdd6900be9ec7`.

**Research change:** one versioned anatomical hierarchy, individual geometry,
canonical upper-body kinematics and Three.js/replay integration.
**Integration effect:** default-body physical equivalence is mandatory; authored
lower-body geometry explicitly changes reachable poses and possible contacts.
**Promotion decision:** PR201/B remains the maintained profile; physics is
**RETAIN_EXPERIMENTAL**. Structural completion is decided separately below.
**Next dependency:** sporting contact episodes, support/impulse realism, then
explicit balance and upper-body contact mechanics.

## Plan and ownership audit

Implementation order: review PR218–224 and the failed/repaired gait evidence;
define morphology and rigid/rest frames; retain the v2 lower solve; compose the
upper body; adapt Three.js/replay; test action cycles and native reconstruction;
run archived halts, paired 22-player trajectories and all three full-match D/E
comparisons; measure cost; run full verification and hosted CI.

The audit covered both PR218 reports, PR219 anticipation, PR220 preparation,
PR221/222 reception, PR223 support, PR224 contact integration, ROADMAP,
PROJECT_STATE, MFL_PRODUCT_ROADMAP and MatchEngine integration/dependency rules.
Actual physical ownership remains in `canonicalMovement`, `articulatedGait`,
`pendingStrike`, `articulatedFootLimit`, `lowerBodyGeometry`,
`pendingStrikeInterval`, `composedLegContact`, `composedLegCurvature`,
`playerBodyContact` and `multiBodyContact`. `fullBodySkeleton` composes their
facts; `canonicalPresentation`, `matchReplay`, `frameProjection`, `PlayerModel`
and the replay adapter consume them. Existing `animation` has no authority over
the new canonical joints. No second motor, skill, player identity, RNG, backend,
asset pipeline or mesh-collision solver is introduced.

## Complete implemented hierarchy

There are **19 anatomical segments and 18 articulations**. The world root is a
simulation transform, not a bone or anatomical joint.

```text
world root → pelvis [segment]
  lumbar → lower_trunk
    thoracic → thorax
      cervical → neck
        head_neck → head
      left_girdle_attachment → left_girdle
        left_shoulder → left_upper_arm
          left_elbow → left_forearm
            left_wrist → left_hand
      right_girdle_attachment → right_girdle
        right_shoulder → right_upper_arm
          right_elbow → right_forearm
            right_wrist → right_hand
  left_hip → left_thigh
    left_knee → left_shank
      left_ankle → left_foot
  right_hip → right_thigh
    right_knee → right_shank
      right_ankle → right_foot
```

Each arrow names a **joint → child segment**. Feet/hands are segments;
ankles/wrists are articulations. The girdle approximates clavicle/scapular
attachment; each shank combines tibia/fibula. Fingers, individual vertebrae,
scapular dynamics and toe articulation remain future extensions.

## Coordinates, schema and joint constraints

Physical X/Y are pitch metres; Z is height. Body right is
`(cos(facing),−sin(facing),0)` and forward `(sin(facing),cos(facing),0)`.
Segment +Z runs proximal to distal. Rest frames are explicit parent-relative
rigid transforms. The pelvis follows the actual hip axis; the upper body's
anatomical frame retains canonical facing. Whole-player yaw rotates the whole
skeleton, including its head, rather than only its positional landmarks.

Each segment carries stable identity, parent/joint identity, dimensions, rest,
local/world transforms, endpoint and physical-kinematic or kinematic authority.
Each joint carries parent/child, actual local/world transforms, coordinates,
allowed rotational DOFs, limits and provisional status. Knees and elbows use
one geometric flexion DOF in 0…π about **−X**, with a shared hinge normal on both
adjoining segments. Other articulations reserve three intrinsic XYZ rotations
about rest-child axes: flexion, abduction and twist. Their broad geometric
limits are explicitly provisional, not measured human mobility limits.

Zod rejects nonfinite points, nonunit quaternions, duplicate/missing identities,
incorrect parentage, detached transforms, changed bone lengths, stale proxy
times and illegal joint coordinates. It reconstructs the actual joint rotation
from the declared DOFs. A plausible number in a range cannot conceal an extra
knee rotation. Unreachable legs remain explicitly unavailable, without stretch.

## Edition and persistent state

Select `experimentalFullBodySkeleton: full-body-skeleton-dev-v1` with
`withFullBodySkeleton(state, morphologiesByPlayerId)` on unprofiled articulated
v2. It retains the existing D/E selections and does not modify PR201/B.
Single Match Lab also offers the distinct **Pełne ciało (eksperymentalna)**
recipe `holistic-full-body-dev-v1`: articulated v2, PR223 continuation,
PR224/E lower contacts and the new full-body contract. Existing menu selections
keep their original meaning, and the default remains ordinary. The effective
export/HUD recipe derives from executing selectors and identifies the new
edition rather than mislabelling it as the old v2 recipe.
`body-morphology-dev-v1` is optional static `bodyMorphology` on the canonical
match player, stored once with that body. Bench/departed schemas retain their
own morphology. An entrant does not inherit the outgoing player's anatomy.
This PR adds neither randomized anatomy nor a career morphology editor.

Old players omit the field and use the old normal geometry. Morphology without
the new edition is rejected; historical rollback clears both. Native state
retains the existing root, support, motor and action facts rather than a
per-tick 19-bone history. Canonical observation derives the full pose.
Bounded replay samples store the old articulated body plus compact, versioned,
timestamped full-body inputs and reconstruct the hierarchy on read. Input/body
timestamp mismatch is rejected. No full skeleton is serialized for every
footballer on every native simulation tick.

## Default geometry and individual morphology

The 120-second native check exposed an existing serialization mismatch at
111.025 s in `lab-mw3xhr6o` D: a far free kick legitimately gives the taker a
run-up target at x = −0.8697426507892452, while the old restart-target schema
required an on-pitch point. Both physical editions produced the same target.
Only `restart.targets` now validates finite physical coordinates; legal restart
spots and rule readiness retain their separate pitch restrictions. The frozen
[native case](performance/pr225-native-runup-target.json.gz) has no full-body
selector. Its regression checks unchanged coordinates, native continuation,
nonfinite rejection and rejection of an off-pitch legal restart spot. No target
is clamped or moved, and no physical hash is refreshed to accommodate this fix.

Default thigh/shank lengths remain `0.245/0.246 × height`, with hip half-width
`0.055 × height`. Both omitted and explicitly default morphology keep the
historical arithmetic path. Supporting anchors, actual action/recovery feet,
knees/ankles/boots, finite reach, cadence, PR223 parked continuation and PR224
simultaneous contact response retain their demonstrated owners. Solver budgets,
collision tolerances and football attributes are unchanged.

| Authored parameter | Actual role in this edition |
| --- | --- |
| Independent thigh/shank lengths, pelvis width | Common physical IK, foot workspace, gait reach and swept lower-limb geometry |
| Independent knee alignment | Bounded rotation of the common knee plane and its physical contact geometry |
| Independent foot length/width | Anatomical landmarks and visible boot; existing 0.035 m effective contact patch is retained |
| Independent upper-arm/forearm and hand dimensions | Canonical upper-limb geometry and presentation |
| Shoulder width, trunk proportions, neck/head dimensions | Canonical upper geometry; do not change the existing torso impulse envelope |
| Sole/arch enum | Reserved metadata; no medical inference, ability, traction or injury modifier |

Dimensions are fractions of the existing clamped physical height, 1.4…2.2 m.
Ordinary engineering bounds allow thigh/shank deviations of ±0.035 of height,
knee alignment ±0.12 rad and left/right total-leg difference up to 0.04 of height.
Explicit `stress` authoring permits thigh/shank fractions 0.18…0.29 and alignment
±0.25 rad. Foot length/width ranges are 0.10…0.20 / 0.035…0.085; hand length/width
0.07…0.14 / 0.03…0.075. Width must be smaller than length; total proportions must
remain coherent with stature. These are development acceptance bounds, not
population or medical claims. Small feet, low arches and asymmetry grant no
technical bonus. The existing 28 football attributes remain unchanged.

Individual legs reuse the same connected solver. The symmetric analytic knee
curvature shortcut is disabled for individual lower geometry; the same contact
search uses a conservative displacement enclosure with each side's actual
reach. It can report unresolved contact or an unavailable pose rather than use
an unjustified bound. Mild asymmetry and both alignment signs have actual
movement tests. Stress geometry is representable, not certified for every gait
and pressured contact. Different valid bodies need not have identical outcomes.

## Skeleton-driven contact proxies

Each proxy carries segment identity, sample time, actual transform/endpoints,
dimensions, material, velocity/evidence status, collision authority and its
approximation. This is a description of existing contacts, not a second loop.

| Proxy | Activation |
| --- | --- |
| Boot sphere | Existing canonical effective centre, radius 0.035 m |
| Thigh/shank capsule or tapered capsule | Existing PR224 swept path only under E |
| Upright torso | Existing 0.34 m planar player core and root-bound ball-torso capsule |
| Girdles, arms, hands, neck, head | Inactive geometric descriptions |

`composedLegContactCapsule` is shared directly with the event solver, including
the shank's narrow distal cap above the ankle. Anatomical heel, sole, midfoot,
forefoot, ankle and effective boot contact are separate references. No broad
new foot collider catches balls that the existing sphere would miss.
Boot velocity comes from the actual effective trajectory; torso velocity from
canonical root transport. Swept limb velocity remains owned by the existing
event-time sampler/contact facts; a snapshot marks that value unavailable
rather than inventing it from an animation. The coarse torso envelope has no
new millimetre anatomical-error claim. The head sphere is centered on the
canonical head segment; inactive anatomy cannot create contact events.

## Whole-body pose, renderer and replay

Bounded deterministic trunk/arm coordination reads actual speed and foot
displacement, turn rate, low-pass preparation, recovery, jump support and
impact/balance evidence. There is no independent gait clock or root/ball
impulse. Arm swing is bounded to ±0.65 rad, preparation elbow angle to 0…0.8,
trunk lean to −0.08…0.12 and turn coordination to ±0.12. These are kinematic
engineering baselines, not validated human biomechanics.

`PlayerModel.canonicalSegments` maps all 19 semantic IDs to the existing rig.
Physical `(X,Y,Z)` maps to Three `(X−52.5,Z,Y−34)` with the corresponding
quaternion handedness conversion. Facing/jump are applied once. Existing
kits/faces/resources remain, with trunk/neck visuals sharing the cylinder.
Held display frames reuse the applied pose; switching back restores the old
rig. A future Blender/glTF adapter maps semantic segment IDs to imported bones
and applies asset-specific rest/bind corrections. Mesh/bone names and skin
weights belong to that adapter; no GLB is required here.

Sparse replay keeps the existing conservative whole-player/ball hold. It cannot
combine a new root with stale limbs, extrapolate a successful kick or alter
contact landmarks. Native reconstruction, pause and seek exercise the real
presentation consumers. Future smooth intermediate poses need actual canonical
inputs/event data, not independent graphical interpolation.

## Tests, browser evidence and performance

Focused tests cover heights 150/165/180/195/215 cm; whole-frame yaw covariance;
both feet/hands; symmetric/asymmetric lengths; both alignment signs; different
feet/trunk/arms; invalid/unreachable bodies; actual movement/turning; complete
left/right pass, follow-through, recovery and deliberate-miss cycles; an
archived torso impact; the existing ballistic jump/landing; native reload and
replay seek. Leg geometry is compared exactly for default morphology. All
canonical/renderer world positions and rotations are checked, not only boots.
The strict positional tolerance is `1e-10 m`, a transform-agreement gate only.

Browser evidence: [report](performance/pr225-browser/report.json),
[swing 1366×768](performance/pr225-browser/pass-swing-1366.png),
[recovery 1920×1080](performance/pr225-browser/pass-recovery-1920.png),
[recovering shin](performance/pr225-browser/recovering-shin-1366.png).
Timing is CPU submission, not completed GPU work. Bounded receipts separately
record engine time, composition/validation cost, sampled heap and exact
native/replay byte sizes. Browser reports include draw calls and shared geometry
counts. No timeout or solver safety limit is relaxed.

The two 120-second inputs compare every physical step with/without the new
selector for both D/E and validate **52,800** full poses without an invalid pose.
The [30-second](performance/pr225-skeleton-30s.json) and
[120-second](performance/pr225-skeleton-120s.json) receipts retain physical and
contact hashes, native comparisons and archived PR224 checkpoint results.

| 120-second input | D boot events / passes | E boot events / passes | E limb events | Invalid poses |
| --- | ---: | ---: | ---: | ---: |
| lab-mw3xhr6o | 37 / 9 | 31 / 9 | 12 | 0 |
| pr222-native-a | 34 / 12 | 15 / 6 | 21 | 0 |

These boot counts include executed ground contacts; full-match tables use
PR224's **retained** boot counter. They must not be interchanged.
The 51 focused tests include spectator/player launches, old/new preset identity,
complete action/recovery paths, individual geometry and native run-up-target
continuation. TypeScript, lint and production build pass. PR218 and PR223
source-bound checks and the [PR219–222 controls](performance/pr225-ancestor-checks.json)
pass. Final full verification/hosted status and the remaining full pairs are pending.

Browser maximum positional deviation is **3.6121e−15 m** across both viewports
and all four scenes. Actual Single Match Lab launches select the new recipe;
ordinary remains the initial default
([1366×768](performance/pr225-browser/single-match-lab-1366.png)).
Held-pose median CPU submission is 3.7…5.3 ms, versus 6.3…7.9 ms when all
22 new poses are applied. Reference E medians are 3.8…5.8 ms. Visible draw
calls change 156→164 in pass scenes and 41→45 in the shin scene; geometry
resource counts remain equal. Culling makes these different from a budget with
all 22 models visible. CPU submission does not measure completed GPU work.

Paired Windows/Node 24.22.1 engine means are 5.0…7.9 ms/tick. Composition is
0.23…0.34 ms/player/sample, excluding 0.44…0.68 ms structural validation.
These are concurrent diagnostic workloads, not isolated throughput. The flag
adds no default-body physical acting path. The renderer reuses held poses;
replay recording requests compact inputs without constructing a full pose to
discard. Native state grows **59 bytes** for the default selector. A bounded
22-player replay sample grows **5,970…6,574 bytes**, rather than recording 19
full transforms per player. Sampled paired-process heap is about 139…465 MiB,
including both arms, validation and GC variation; it is not an isolated
incremental-memory estimate for the skeleton.

## PR224 comparison and episode diagnostics

The archived E matches recorded 527/533/450 shin events against zero in D,
alongside fewer retained boot contacts/pass releases. This remains activation
evidence, not calibrated football realism. The new full-match runner uses the
same archived kickoffs/D/E selections and checks exact terminal hashes,
scores, goal chronology and counters. The bounded runner compares every
physical step with/without the new edition and replays all archived PR224 CCD,
41:56 two-player and 71:58 same-player pressure checkpoints.

The diagnostic groups events until a canonical sampled clearance certificate
proves separation from all active lower/boot shapes and a conservative torso
bound. A time gap alone cannot prove independent sporting encounters. Missing
certificates conservatively merge episodes. Per episode it distinguishes
repeated surfaces, adjacent surfaces, simultaneous contacts, intended foot
actions and incidental deflections. A–B–A limb pattern is a **solver repetition
candidate**, not proof of a solver defect. Existing joint responses provide
positive simultaneous-pressure evidence. Clean defender wins are counted
separately from ownership changes. Diagnostic classification changes no contact
tolerance, defender behaviour or probability; it cannot calibrate shin rates.

The first full pair reproduces **both exact terminal hashes** from PR224:
[D](performance/pr225-full-paired-D.json) finishes 1:2 with 355 releases,
1,049 retained boots and no shin event; [E](performance/pr225-full-paired-E.json)
finishes 3:1 with 290 releases, 765 retained boots and **527** shin events.
Goals, decisions, ownership changes, restarts and body-impact counts match.
The source report rounds displayed clocks to milliseconds; physical hash
comparison stays exact and unrounded.

| First full pair diagnostic | D | E |
| --- | ---: | ---: |
| Recorded ball/surface solver encounters | 1,494 | 1,523 |
| Observed clearance-separated episodes | 1,011 | 900 |
| Episodes with repeated surfaces | 196 | 116 |
| Episodes spanning adjacent surfaces | 177 | 255 |
| Simultaneous-pressure episodes | 0 | 1 |
| Episodes with intended foot-path encounters | 971 | 730 |
| Episodes containing incidental encounters | 228 | 409 |
| A–B–A solver-repetition candidates | 0 | 32 |
| Confirmed clean defender wins | 11 | 5 |

Categories overlap. An intended-path encounter does not certify successful
release/retention; those outcomes retain their separate counters. These results
preserve the baseline and prioritize work transfer, compression and support
realism. They do not establish improved pass retention.

## Reproduction and source preservation

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225Skeleton.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225Skeleton.mjs --extended --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225FullMatches.mjs paired D
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr225FullMatches.mjs paired E
# Repeat full pairs with native-a and independent.
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr218Browser.mjs --pr225
node scripts/ci/replayPr218Check.mjs
node scripts/ci/replayPr223Check.mjs
npm run verify
```

`--record` writes only new PR225 bounded receipts; `--check` compares deterministic
proof, excluding timing. Original source-bound positive/negative fixtures and
sealed confirmation resources are preserved. Hosted CI adds the PR225 bounded
proof to the existing checks; historical-source results remain distinct from
new-edition comparisons and from same-platform native determinism.

## Completion register and required answers

| Classification | Evidence / remaining dependency |
| --- | --- |
| Structural implementation | Principal hierarchy, independent morphology, rest/rigid frames, declared/validated DOFs, whole-body composition, proxy and renderer/replay contracts |
| Existing physical mechanisms | Root/support, finite gait/workspace, action/recovery boots, upright torso and PR224 composed lower-limb contacts retain their owners |
| Broader confirmation | Nondefault pressured/full-match contact, conservative search cost, advanced arm coordination, keeper/human controls |
| Missing dynamics | 3D COM/torso angular momentum, measured force balance, stud slip, tipping/fall/get-up, new arm/head/hand contacts, articulated keeper saves and advanced aerial strokes |

1. All principal segments/joints now have executable definitions.
2. Feet/hands are segments; ankles/wrists are joints.
3. One validated parent/child hierarchy owns supported transforms.
4. Default legs must pass preserved D/E and full-match equivalence gates.
5. Left/right dimensions and alignment are independently authored.
6. Foot size can vary independently of default height proportions.
7. Lower geometry has the physical roles above; other new parameters retain explicit geometric/presentation roles.
8. Contact proxies derive from canonical geometry, including the solver's actual tapered capsules.
9. New upper-body/head/hand proxies remain inactive; the old torso path keeps its authority.
10. Three.js consumes all supported canonical segment transforms.
11. Real collision/action recovery sequences test coherent poses and next support.
12. Native reload and compact replay preserve geometry; sparse seek holds one sample.
13. PR224 chronology, multi-surface mechanisms, limits and tolerances are retained and compared.
14. Balance, falling, new upper contacts and advanced aerial coordination still need dynamics.
15. Structural completion is separate from physical realism and requires all recorded structural gates.

**Completion decision: PENDING final verification and full-match comparisons.**
