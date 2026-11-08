# PR218 continuation — reachable sprint and native incident repair

This continues draft PR218 from `1d83aefa1e8ece3fad96cbefbbece79ae5ac6c12`.
The former `stance-foot-dev-v1` results remain historical evidence for that
source: 48/60 movement scenes and two explicit native incident halts. They are
not rewritten into successful results. The new edition is `stance-foot-dev-v2`.

## Causes and repair

The fixed 175ms support period let a 9m/s root travel 1.575m while one boot
remained planted. Eventually the anchored ankle exceeded the finite leg reach.
The same mechanism stopped the original restart-reentry corridor.

V2 intersects the root's travel direction with the planted boot's bounded leg
workspace and solves `v*t + 0.5*mu*g*t² <= remaining travel`. The horizon rounds
down to 40Hz boundaries between 50ms and the previous 175ms upper bound. It is
serialized as `stepSeconds`. Contact substeps retain that period and adopt the
next one only at the support boundary. A 150ms step cannot accidentally last
seven ticks because of floating-point roundoff.

Swing targets stay within a finite hip workspace and move at most 24m/s in world
coordinates. The previous 16m/s bound cannot cover a complete alternating stride
at a sustained 9m/s root. This is an engineering actuator assumption, not empirical
human sprint calibration. There is no grip, attribute, kick-success, fitness or
injury-rate retuning. The gait still uses grounded support exchanges rather than
synthesizing a running flight phase: these gates establish experimental kinematic
feasibility, not validated natural human sprint biomechanics.

The second native halt occurred during recovery after a standing foot contact.
The pelvis limit assumed every ankle was at `0.075m + jump`, even when the actual
composed boot was lower. Near extension, millimetres of height error made a
reachable leg appear impossible. The limit now uses each actual ankle height.
Genuinely invalid ankle configurations still fail; no halt is suppressed and no
external impulse is discarded.

Both free legs follow the existing ballistic root during an explicit jump. This
does not schedule extra jumps or supply an airborne COM actuator. An idle player
must reacquire real support and lower its free boot after landing before its idle
stance can freeze. A full takeoff/landing unit test covers the transition.

## Edition and preserved evidence

The compact stance and observer contracts identify v2. Native v1 saves require
the archived v1 runtime; they are not silently interpreted with new dynamics.
`source-stance-v1.json`, prior source archives, old laboratory results and original
failed inputs remain available. PR195–217 evidence, package/lockfile, ordinary
mode, PR201/B and the sealed independent confirmation remain intact.

## Staged verification

The focused core/renderer/PR217 suite has 38 passing tests, including sustained
10-second sprint across three heights and two grip surfaces, exact support timing,
unequal-ankle IK, native schema identity, genuine invalid reach and jump/landing.
The source-bound laboratory repeats all 60 prescribed movement scenes for ten
seconds and all 26 enabled/disabled native continuations with reload comparison
on every tick. Both previously halted continuations now complete their intervals.

The first complete v2 attempt stopped at 1783.275s. A lateral impact at
1783.102509s changed a returning thrower's velocity from approximately
`(-0.167, 2.107)` to `(-4.117, 1.126)m/s`, while its feet retained the pre-impact
support plan. `full-stance-v2-attempt-1.json.gz` preserves that failed run and its
native two-second window. The exact impact input is now the tenth paired local
case and a unit regression checking momentum, zero extra motor work, the actual
remainder positions and deterministic replay.

The second complete attempt stopped at 316.05s during a moving kick's recovery.
The other foot could not remain planted until the action leg became available.
V2 now releases expired support and finitely swings/replants the non-action leg;
the existing motor supplies no ground acceleration while support is null. The
second raw trajectory and its native input remain immutable, and this is the
eleventh paired local case. The unit regression requires the support to release
and then actually return, rather than accepting permanently unsupported motion.

The third attempt stopped at 2674.125s, when a substitution held the other players.
The legacy transport changed a held player's facing instantly while retaining
the old world-space feet. V2 transport now consumes the existing canonical motor
and updates the same leg state. Incoming bodies retain stance, lower-body pose
and facing through serialized entry state, before football eligibility. The
twelfth paired case starts before the invalid orientation assignment; tests cover
both this case and PR217's actual cleared entrant. Historical profile selection
removes articulated state from active, departing and entering bodies. The full
observer also validates the temporary handover bodies, not only the eligible XI.

The fifth attempt reached 4426.475s and stopped when a prepared command extended
the actual boot beyond the short player's finite leg. The command now meets a
hip-relative joint stop before contact search, using the same conservative 0.43H
planar workspace as the gait. An already-valid base boot is retained if farther
out; invalid native base geometry still halts. Projection removes outward radial
velocity and provides a conservative speed bound. The raw acceleration envelope
is retained only when the entire requested curve is certified inside the stop;
otherwise the solver uses its existing first-order bound. No search budget,
contact tolerance, ball path, root motion or success probability is changed.
The thirteenth paired native case and its unit regression require the original
unreachable action to complete as a genuine miss. Both solver and renderer use
the limited boot. This is an upright engineering workspace, not a complete
three-dimensional anatomical joint model; the existing two-leg IK still validates
the actual ankle heights and fixed bone lengths.

The contact timeline now advances the unspent leg actuator from the actual
impact pose and post-impulse velocity, without rerunning the COM motor. Support
timing can shorten when the remaining reachable workspace changes. Intermediate
contact poses use actual elapsed substep time. Action-foot selection is shared
between gait and projection, including a still-latched prepared stroke.
The smoke/full runner checks both base anchors and the composed supporting boot,
keeping only the current 22 projected bodies rather than a history of joints.

Renderer validation uses existing Three.js rigs, two viewports and nine physical
snapshots. The carrying snapshot is selected from an actually observed carry in
the fixed native input set; a former scene's possession outcome is not forced.

`benchmarkPr218Match.mjs` requires the local and renderer gates before a continuous
120-second, 22-player smoke from the unchanged PR217 session input. Every smoke
tick checks composed poses, held-support drift, contacts and support transitions.
Only a successful source-matching smoke unlocks `--full` on the same reference
input. The explicit PR217 human-menu test driver is retained and logged; physical
execution can still miss or lose possession. Failed attempts preserve the exact
input, terminal and final two seconds.

Its `--check` mode verifies artifact hashes, edition, native terminal schema and
completion receipts in the existing CI job. That is receipt validation, not a
claim that CI reruns the new complete trajectory on every change. The historical
command/case inventory and 28-job structure remain preserved.

## Measured full-match result

Measured source: `ea8a49f6c678d24405e65db42561085fd4c9b8e874cf26ccca1b02e544f21a2a`.
All six physical gates passed before attempt 6. It starts from the unchanged
PR217 reference input with v2 explicitly installed and ends **1–1 at 5700.000s
(95 minutes), `full_time`**. It uses actual articulated movement and contact,
including all six substitutions; this is not old physics with a new skeleton.

| Measurement                                      | Attempt 6                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Canonical 25ms ticks                             | 228001                                                                            |
| Active-foot attempts                             | 255: 84 contacts, 159 misses, 7 interrupted, 5 cancelled                          |
| Standing challenges executed                     | 39                                                                                |
| Observed canonical ground-contact transitions    | 1528                                                                              |
| Upright body impacts / new body unresolved       | 3961 / 0                                                                          |
| Support transitions / held-support samples       | 576272 / 4439502                                                                  |
| Maximum base support drift                       | 0m                                                                                |
| Maximum composed supporting-boot drift           | 2.8422e-14m                                                                       |
| Invalid composed poses / safety halts            | 0 / 0                                                                             |
| Joint-limited boot frames observed               | 21                                                                                |
| Maximum finite base swing speed                  | 24.00000000000037m/s (roundoff at the 24m/s bound)                                |
| Reception/pass diagnostics                       | 120 completed, 173 unclaimed, 39 intercepted, 29 out of play, 11 technical errors |
| Restart awards / stage changes observed          | 190 / 1319                                                                        |
| Explicit human-menu choices / native checkpoints | 39 / 101                                                                          |
| Wall / process CPU                               | 423.701s / 499.969s user + 2.422s system                                          |
| Peak process RSS                                 | 852552KiB, about 832.6MiB                                                         |

Contact counts observe changes to canonical `lastGroundContact`; they do not
enumerate every sub-tick contact. Checkpoints compare the next eight native
steps after JSON/schema reload, including pending contact, half-time and terminal.
The final-terminal checkpoint is not a second independently driven full match.
Timing includes every-tick body validation and checkpoint work. Raw, summary and
source-bound gate receipts are indexed in [the evidence directory](performance/pr218/README.md).

Rendering is measured separately in Edge at 1366×768 and 1920×1080, using the
existing 22 reusable rigs in standing, moving and prepared-pass snapshots.
Articulated submission medians are 0.4–0.9ms and p95 is 0.8–1.6ms across those
measurements; cosmetic comparators have medians 0.5–0.8ms and p95 0.8–1.4ms.
The paired scenes keep the same 37/159/190 draw calls and 4/4/5 geometries.
These are browser CPU submission timings, not a GPU frame-time or sustained
full-match FPS guarantee. The maximum nine-snapshot physical/rig landmark error
is 1.653e-14m, below the 1e-10m gate.

**Promotion: RETAIN_EXPERIMENTAL / COMPLETE_MATCH_TESTED.** The selected edition
can complete this experimental full-match protocol. One frozen development
trajectory does not establish independent-corpus reliability, empirical human
locomotion or realistic football quality. The many misses and failed receptions
remain observed results for PR219 investigation; they were not calibrated away.
Historical v1 failures, failed v2 attempts 1/2/3/5 and intentionally interrupted
attempt 4 remain separate from this completion.

## Technical verification

The complete local `npm run verify` passes on this source: **2696 + 56 + 4 + 5 =
2761 tests**, lint, TypeScript and production build. The standalone CI manifest,
workflow and seven CI contracts pass. Exact-byte validation of all six physical
gates and the successful complete-match receipt passes. Production normal-menu
ordinary defaults and normal start/play/pause also pass at both viewport sizes,
with no browser errors. This is compatibility evidence; the articulated complete
match itself is the measured canonical CLI trajectory described above.

`verification-stance-v2.json` and its compressed command logs bind those results
to the measured fingerprint. The old v1 verification failure logs remain
historical negatives. Hosted CI runs on the final pushed commit and is reported
separately in the PR, rather than inferred from local results. Build output retains
its advisory bundle-size and mixed static/dynamic-import warnings; no build check
or test deadline was relaxed.

## Scope and next dependency

General career/menu execution remains opt-in-disabled. Non-boot thigh/knee/shin
surfaces still derive from base stance IK; full composition with an active or
recovering boot stroke remains a separate integration dependency. This repair
does not claim that work or three-axis COM/ragdoll dynamics are complete.

Research change: reach-based support timing and actual-ankle pelvis limits.
Results and the promotion decision below distinguish technical verification,
physical gates, the full-team smoke and the complete-match trajectory.

## Completion answers for the continuation

1. **Physical body state.** Root position/velocity, facing, existing profile height
   and mass, lower-body pose and serialized `articulatedStance` define the body.
   V2 stores world-space boot centres, support/yaw, elapsed support time,
   `stepSeconds`, angular velocity and surface identity. Connected finite bones
   and observer transforms are deterministically derived, not repeated in saves.
2. **Authority.** The existing canonical motor consumes support/grip; the shared
   contact timeline consumes the effective prepared/recovering boot. The renderer
   consumes the same derived joints. Joint-limited action commands affect the
   actual contact surface, including the possibility of missing the ball.
3. **Firm support.** A held supporting boot centre remains fixed in the world.
   Insufficient grip reduces earned motor acceleration; it does not invent boot
   slip. The finite rotational actuator limits pivot demand. This edition does
   not model kinetic stud sliding, compliant sole pressure or three-axis balance.
4. **Locomotion.** The prescribed sprint, acceleration, braking, turning, reverse,
   side-step and backpedal scenes are evaluated across three heights and two
   surfaces for ten seconds each. The sustained 9m/s unit test checks actual root
   speed, alternating support, fixed planted boots and finite swing speed.
   These are feasibility gates; natural running flight and empirical technique
   calibration remain unsupported. No claim of universal human gait follows.
5. **Graphical parity.** The existing Three.js rigs use metre-valued canonical
   hip/knee/ankle/boot transforms. Both viewports and nine actual pose snapshots
   are measured against a `1e-10m` numerical parity gate. It is an implementation
   tolerance for the same coordinates, not a biomechanical measurement tolerance.
6. **Body collision.** Upright impulses change actual root momentum; only the
   unspent leg interval is continued from the impact pose. The motor is not run
   again. The exact lateral-impact regression checks momentum, zero extra motor
   work, remainder positions and valid subsequent foot geometry. Full angular
   momentum, loss of balance and falling remain outside this upright edition.
7. **PR217 and long-match reliability.** The enabled/disabled native corpus and
   the complete trajectory are reported separately below. Earlier full attempts
   remain negative receipts and supply new fixed-input regressions; they are not
   erased by a later completion. Historical PR195–217 source-bound receipts and
   maintained PR201/B are preserved.
8. **Experimental full matches.** A passing set of local gates alone is
   insufficient. The runner requires a source-matching continuous 22-player smoke
   before a full run; the measured outcome and promotion boundary appear below.
   General career/menu execution remains disabled for this selection.
9. **Falling and recovery.** Next physical interfaces need three-axis COM and
   angular state, inertia, a support polygon and balance failure, body/ground/ball
   contact volumes following actual transforms, bounded contact impulses and
   deterministic finite ground recovery. Non-boot contact surfaces must first
   consume the fully composed active/recovering leg geometry. A cosmetic ragdoll
   cannot become a second authority or silently replace canonical snapshots.
10. **PR219.** Investigate observed ball-flight uncertainty, anticipatory position,
    preparation before reception, timing of the actual moving boot, and controlled
    absorption/release using existing attributes. Separate reachable opportunities
    from chosen commands and execution outcomes, with paired frozen inputs and
    real misses retained. Do not improve reception by moving the ball, widening
    contact tolerances, forcing possession or tuning away correct contact physics.
