# First holistic development match protocol — PR215 handoff

## PR215 execution update

The final normal-team **UI incident pilot** (seed `pr215-ui-incident`) reaches 11.475s,
executes real prepared/ordinary-play consumers and then pauses at `initial_body_overlap`
at 11.45s: 0.3007790105m core penetration between the two recorded players. Its measured
18 body impacts, 6 ball-body contacts, 1 prepared kick / 3 misses, 5 finite controls and
2 defensive receptions demonstrate actual execution, not a successful match. The exact
state and native pre-incident save continuation are preserved. Edge/Node exact identity
fails and remains explicitly unestablished. See [PR215 incident](../performance/pr215/browser/incident-report.json)
and [native comparison](../performance/pr215/browser/incident-native-replay-summary.json).
This failed UI pilot does not satisfy the still-blocked mandatory holistic smoke gate.

**LIMITED_UI / BLOCKED_FOR_HOLISTIC_MATCH.** The owner can select the actual recipe in
Single Match Lab. The shared interval now also owns a bounded unowned low loose ball
outside keeper zones. A real controlling reception at **10.047033038999901s** exposes
`controlled_reception_remainder_not_migrated`: the genuine contact is kept, the remainder
is explicitly unresolved, and the browser pauses. Owned carrying and labelled deliveries
still have named historical consumers. This fails the complete interval-coverage gate.

The new admissible geometry supports an upper ball at **1.562495283m** between the
existing passive spheres and releases it through an actual third-body impulse, with
all upright torso cores separated. It is a geometry primitive, not a migrated canonical
high-ball clinch or articulated low-leg trap. Invocation counters now witness the named
consumers when they actually run; unexercised mechanisms remain unexercised.

The browser startup/pause/restart/export checks are **UI acceptance**, not the mandatory
integration smoke. The latter and the full 90-minute experiment are **NOT RUN**, following
the existing stopping rule. Original paired input bytes, seed, baseline and confirmation
remain unchanged. PR215's additive [source and local receipt](../performance/pr215/source.json),
[summary](../performance/pr215/summary-final-v7.json) and [report](../PR215_PLAYABLE_HOLISTIC_MATCH_INTEGRATION.md)
identify this source edition. Complete the carry/delivery/reception remainder gate before
dispatching the frozen match below; do not reinterpret UI availability as promotion.

**Status: BLOCKED_FOR_HOLISTIC_MATCH.** The full match and integration smoke were not run
in PR214. This document freezes reproducible inputs and acceptance requirements; the four
combined local scenes are not a substitute for a match. See [physical gates](../PR214_MULTIBODY_CONTACT_AND_HOLISTIC_READINESS.md)
and [compatibility](HOLISTIC_COMPATIBILITY_MATRIX.md).

## Frozen experiment

Use [holistic-input-ci-v1.json.gz](../performance/pr214/holistic-input-ci-v1.json.gz).
This [CI observer correction](../performance/pr214/ci-fix/README.md) changes the source
binding and inventory ordering; all original initial-state/configuration fields and hashes
remain exactly equal to final-v3, which is preserved separately.
It contains the **complete schema-normalized initial state and paired baseline**, all 22
profiles with all 28 permanent attributes, positions/velocities/fitness, formation, roles,
tactics, coach state, ball, match clocks, seed, policy, selectors and source binding.
It is a single normal canonical match input, not a sequence of laboratory snapshots.

| Dimension | Frozen selection |
| --- | --- |
| Home | `geometry:anchor`, 11 validated players `geometry:anchor:0`…`:10`, 4-3-3; keeper, LB, two CB, RB, three CM, LW, RW, striker |
| Away | `geometry:opponent`, 11 validated players `geometry:opponent:0`…`:10`, 3-5-2; keeper, three CB, LB/RB, three CM, two strikers |
| Input provenance | Original `docs/performance/PR188-match-dev-sw-state-value-v1-full-observed-final-v3.json` and its hash-checked archive, loaded by `readDevelopmentInput('sw','state-value-v1')` |
| Attributes / physical roster | Exact per-player attributes, mass, height, weak-foot/role/fitness and identity are in the initial state; no resampling or attribute change between paired configurations |
| Tactical instructions | Both `counter_attacking`; blockHeight .32, organisedPress .28, counterpress .25, compactness .80, possessionPatience .35, verticality .90; full coach/phase/knowledge state is preserved |
| Decision policy | **B / `state-value-v1`**, separate from physical selection; autonomous, `playerAgencyEnabled=false` |
| Seed | `pr215-holistic-sw-B-v1` in both arms |
| Development recipe | `holistic-physical-dev-v1` from `scripts/holisticDevelopment.ts`; exact selectors in compatibility matrix and receipt |
| Primary baseline | Unchanged maintained **PR201 `realism-candidate-v1` / B**, checksum `ip0-2d2162c9`; same roster/input/seed |
| Development initial SHA-256 | `afa44c827f58a0147e2328590b9f6eca13ca8c29902ff5530812a3b393064377` |
| Baseline initial SHA-256 | `67893f497637511e036b851d2787d3246946d72f8fac3b728dbb6e50bb31eb11` |
| Source / recipe identities | [Source manifest and reconstructible archive](../performance/pr214/source.json); recipe JSON in the input receipt. Freeze a new source/receipt version after any prerequisite repair |
| Executor | Existing `stepTacticalMatchAfterDecisionProbe` / canonical fixed **0.025s**, existing `startSecondHalf`, normal full-time / abandonment and stoppage rules |

These are synthetic development rosters with historical source-bound attributes, not
real clubs or an empirical fixture. Do not relabel the strength design as representative
football calibration. The complete per-player vectors are authoritative, not a blanket
“all players 70” shorthand.

An O comparison (`opportunity-driven-v1`) can later use the same roster/seed and a new
explicit recipe identity to exercise the observed loft consumer. It is not the first
mandatory match and must not silently replace B. Do not build a broad WW/SS/SW matrix in
the preparation PR.

## Dependencies before dispatch

1. **Interval coverage:** extend the same authoritative contact owner from pending-pass /
   standing-attempt intervals into normal carry/loose/delivery continuation. Preserve
   ordinary ball control, keeper active save/handling, law/goal/offside and restart consumers.
   Do not route every ball through the narrow pending branch and silently bypass those
   existing consumers. Show an actual ordinary-phase collision and subsequent action.
2. **Admissible clinch:** use mutually consistent torso/foot/ball surface geometry. The old
   two-spherical-surface apparatus puts torso centres only 0.50m apart, inside the new 0.68m
   solid core. PR214's third-player input therefore stops at explicit initial overlap.
   Prove a physically admissible third-player intervention or bounded unresolved support
   without ejection, possession or invented referee intervention.
3. **Activation completeness:** extend read-only witnesses for the important selected
   consumers that currently remain `invoked=null`. The snapshot recorder already proves
   fresh strike/standing/cluster/kick/ground-bounce/belief outcomes where records exist.
   A selected flag, changed decision index or completed match is not invocation proof.

These are blockers for the intended scope; uncalibrated restitution, approximate upright
geometry, retained historical aerial/keeper techniques, absent true falls and incomplete
injury biomechanics may remain declared experimental limitations. Formal zero COMPLETE
issues and lack of independent confirmation do not themselves block a diagnostic match.

## Mandatory pre-match gates

| Gate | Required proof |
| --- | --- |
| Configuration | Ordinary schema validates; dependencies/exclusions and recipe/source/input hashes match |
| Single authority | One physical owner per interval/event; no release-time kick plus pending kick on the same pass; no second actuator budget |
| Physical continuity | PR214 sequential/simultaneous and completed-pass controls pass, plus new ordinary-phase and clinch witnesses |
| Possession | Every selected outfield acquisition in critical scenes has finite retained control evidence; nomination/touch/deflection remains distinct |
| Bounds | ≤4 supported bodies/component, finite searches/events/iterations/storage; overflow remains explicit; no invented winner |
| Boundaries/laws | Player movement edge never becomes a ball wall; whole-ball exit, actual referee interruption, goal/offside/keeper protection and restarts retain authority |
| Save/replay | Unfinished strike/persistent constraint and later ordinary-phase checkpoints reproduce within the frozen native environment |
| Liveness | Normal match continuation, no infinite loop, systematic nontermination or serious action starvation; unsupported technique fallback counted explicitly |
| Activation | Recorder distinguishes configured / eligible / invoked / physically executed / observed / evaluated for every important selected consumer |

If all pass, run **one short integration smoke** on the normal initial state. Require
schema-valid progress, a relevant actual physical consumer and checkpoint replay. If no
relevant contact occurs, report it unexercised; do not call the mechanism passed. A short
smoke is not the holistic 90-minute experiment. Preserve failure receipts and exact runnable
initial states without silently disabling a selected mechanism.

## Canonical match execution and bounded failure

Once the gates pass, load the complete frozen state and advance the existing executor at
40Hz through normal half-time/full-time. Do not reset players, inject selected local scenes,
award ownership or force contacts/goals between ticks. A human-driven edition would need
an explicitly recorded action log and the real pause/resume contract; it is not this first
autonomous experiment.

Cap the development process at 7200 simulated seconds / 288000 requested ticks. Reaching
that cap without normal termination is a failed diagnostic, not a full-time result. Track
unchanged snapshots and the exact action/medical/restart reason. A surfaced human decision
in this autonomous configuration is a configuration/authority failure, not permission to
advance the clock behind it. Keep ordinary injury/medical and substitution authority.

## Recording and activation

Persist source manifest/archive, exact recipe and policy, full initial state/hash, native
OS/Node/dependency versions, input reference hashes and all fallback selections. Use
compact event/activation ledgers plus full schema-validated checkpoints every 60 simulated
seconds, at half-time, at termination and around any unresolved/impossible/stalled state.
Retain a bounded 2-second pre/post incident window at 40Hz for diagnosis; do not persist
the entire growing replay history inside MatchState.

For each important mechanism record:

| Stage | Meaning |
| --- | --- |
| configured | The effective selector/edition is present and valid |
| eligible | The actual policy/action/physical preconditions admit this consumer |
| invoked | A source-bound entry/decision witness proves the consumer ran |
| physicallyExecuted | A real impulse, movement/control response or applicable physical event occurred |
| outcomeObserved | Its subsequent ball/body/control/law consequence is linked to that event |
| fullyEvaluated | Predefined evaluation requirements are met; a Boolean or one event alone never grants it |

PR214's `observeHolisticActivation` is read-only; unavailable invocation is `null` and
`fullyEvaluated` is always false. Deduplicate latest facts by stable action/actor/time/
surface/impulse identity. Repeated snapshots of one contact are not multiple contacts.
Keep policy B's ranking, receiver recovery, defensive reception and inactive bounded-loft
consumers explicit rather than inferring their invocation from unrelated decisions.

Record at least the following, separating intentions, attempts, contacts and outcomes:

| Domain | Required observations |
| --- | --- |
| Physical execution | Pass intentions/releases/misses, impulse/spin, successful controls and uncontrolled deflections, player contacts, persistent support/rearming, interceptions, physical losses, player edges and actual ball exits/restarts |
| Tactical behaviour | Pass choices/progression, space runs, pressing/positioning, attacking transitions/counters, shot opportunities, width/crossing opportunities, involvement by role, recovery attempts and outcomes |
| Match outcomes | Goals/shot quality, shots on/off target, pass/control outcomes, fouls/cards, offside, corners/throw-ins/other restarts, keeper interventions, existing injuries/workload, total and effective active time |
| Integration diagnostics | Unsupported fallbacks, competing paths, unresolved collisions and residuals, repeated impulses, acquisition without control, action starvation/stalls, impossible states, bound exhaustion and replay failures |
| Cost | Whole-match CPU/wall, peak RSS, serialized checkpoints, peak bodies/component, shared events/tick, sweeps/search work, unresolved constraints and sampled performance spans/hotspots |

Passive collision kinetic energy must be evaluated separately from active actuator work
and external player-edge impulse. Never treat frame-to-frame energy increase during active
running as unexplained passive creation. Preserve exact masses, normals, pre/post velocities,
contact times and remaining travel for selected incidents.

## Comparison, replay and decision

Run the baseline and experimental arm from their matched initial states. Same seed does
not guarantee the same subsequent actions when trajectories and decision indices diverge.
Compare conditional rates, attempts, contact/control/retention lineage, effective play,
role involvement, tactical distributions, liveness, unsupported paths and whole-match cost;
do not demand frame equality between different mechanisms or fit scores to look realistic.

Within each arm, replay from initial state and the frozen checkpoints using the same native
environment and explicit action log (if any). Compare normalized terminal hashes and ordered
physical/law event identities. Keep source drift and actual physical drift separate. Existing
Windows/Linux long-match bit-identity limitations remain; a native deterministic replay is
not portable confirmation. Fresh timing is compared descriptively, not bit-for-bit.

Report every selected important mechanism as exercised/evaluated, exercised/not evaluated,
or unexercised with reason. Unexercised components require a later targeted run and cannot
be credited by the match's full-time status. Severe hidden possession, duplicate authority,
unbounded loops, impossible states or replay failures fail readiness. Tactical regression,
nonrepresentative distributions and calibration uncertainty block promotion but can remain
findings of this first diagnostic match. Independent confirmation stays sealed.

Reproduce PR214's preparation and the exact blocker states with:

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr214.mjs --check
```

Do not launch an all-features match by bypassing the manifest or validation. Resolve the
three concrete dependencies, freeze a new source/input edition, pass the smoke gate, then
observe the whole canonical system playing football.
