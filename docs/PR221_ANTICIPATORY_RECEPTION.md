# PR221 — Anticipatory Football Intelligence and Adaptive First Touch

**RETAIN_EXPERIMENTAL.** The paired trials support an observation-to-contact
handoff and a basic directional touch in the live engine. The pressure target
remains open, and the 22-player smoke recorded no prepared contact. The
maintained integration recipe remains PR201/B. The two test editions are
selectable in native v2 development states. Career and Single Match Lab keep
their existing defaults.

## Stages and existing mechanisms

1. Reproduce the PR219 reception matrix and the exact PR220 final placement
   receipt on merged main `a0fb76e`. The three historical misses and the
   41, 39 and 35 losses against the corresponding PR220 controls remain negative evidence.
2. Run the new variants at 40 Hz through the existing match entry point. Use the
   same seed and starting bodies across arms and preserve the PR219 scenes.
3. Compare physical contact, movement, first control and subsequent action
   across arms. Check expired evidence, later evidence, competing feet and reload.
4. Run the 22-player smoke after finding a local gain. Use the evidence to decide
   whether to expand this edition. The targeted and integration gates did not
   justify a full-match run.

PR195–202 supply the evidence registry, bounded belief and maintained
integration profile. PR203–206 already build conditional alternatives and
revalidate them against local knowledge. PR207–218 supply the finite
contact impulse, event order, recovery and actual articulated stance.
PR219 adds observed strike anticipation and PR220 probes a late body objective.
The missing handoff for the v2 low-ball interval was from a player-local plan to
an economical motor target, and from the interval's actual intersecting boot
to the reception impulse. The historical resolver starts from the nearest boot.

## Integration

- **A** uses the existing v2 reception path. **B** adds early observation,
  ordinary low-ball movement with modest corrections, and the interval's
  witnessed boot when a valid plan reaches contact. **C** adds surface and
  outlet selection. B–A includes the evidence age and actual boot handoff as well
  as the movement change. C–B holds those pieces constant.
- The plan lives in the existing active perception map (up to three options).
  Existing optical evidence drives the meeting forecast. Stale, uncertain and
  inconsistent evidence stops the consumer. At a subframe collision only the
  input frame's committed observations and plan enter tactical selection. The
  physical solver uses the actual impact pose and ball. The same canonical
  target authority, finite movement and articulated gait run all three arms.
- The baseline option cushions. C considers an inside or outside touch toward a
  locally plausible outlet when the actual foot is free, and a sole option when
  the ball actually contacts the boot from below and the existing sole limits
  allow it. Left and right are the real first contacts in chronological order.
  An alternative must be available, impart impulse into the observed normal
  hemisphere, and improve the finite solver's outlet-velocity residual by
  at least 0.10 m/s. The archive shows a selected inside touch on both feet.
  Outside and sole remain candidate paths with no successful selection in this
  matrix. There is no independent scheduler for a receiving boot.
- At contact the outlet comes from a revalidated local option or a direction
  away from a locally seen challenger. The target is a short velocity
  objective. Actual impulse, spin, loss of control and recovery flow through the
  existing contact and possession logic. Ordinary ranking chooses any following
  action. The slice covers autonomous outfield control, including preparation
  for carries. Explicit human commands, committed movement and challenges keep
  their authority. First-time pass/shot execution keeps its existing pathways.
- No additional plan state or migration is required. The native selectors and
  latest-contact evidence are optional and validated. The archived traces
  include terminal native-state and frame hashes, and four C paths repeat
  with JSON serialization plus native schema validation at every tick.

## Paired results

87 paired inputs, 261 arms. The inherited six scenarios use the three PR219
seeds crossed with first-touch 25, 60 and 95. The other eleven scenes use those
three seeds with first-touch 60. They are controlled variants, with shared
initial geometry within each pair. Counts are descriptive.

| Scenario | Inputs | Receiver contacts A/B/C | Owner at 600 ms from scene start A/B/C | Owner at 600 ms from first control A/B/C | C alternative surfaces |
| --- | ---: | --- | --- | --- | ---: |
| Frontal | 9 | 9/9/9 | 9/9/9 | outside sample | 0 |
| Lateral, overlapping | 9 | 0/0/0 | 0/0/0 | — | 0 |
| Lateral, clear | 9 | 9/9/9 | 9/9/9 | outside sample | 0 |
| Running | 9 | 9/9/9 | 6/6/6 | outside sample | 0 |
| Pressure | 9 | 9/9/9 | 0/0/0 | outside sample | 0 |
| Fast | 9 | 9/9/9 | 9/9/9 | outside sample | 0 |
| Slow | 3 | 3/3/3 | 3/3/3 | 1/1/1 | 0 |
| Early frontal | 3 | 3/3/3 | 3/3/3 | 0/1/3 | 3 |
| Early lateral | 3 | 3/3/3 | 3/3/3 | 0/3/3 | 3 |
| Weaker-foot side | 3 | 3/3/3 | 3/3/3 | 0/0/3 | 3 |
| Inconvenient support phase | 3 | 3/3/3 | 3/3/3 | 1/1/3 | 3 |
| Progressive outlet | 3 | 3/3/3 | 3/3/3 | 0/1/2 | 3 |
| Early under pressure | 3 | 3/3/3 | 3/3/3 | 1/1/1 | 0 |
| Observed flight change | 3 | 0/0/0 | 0/0/0 | — | 0 |
| Blind start, later acquisition | 3 | 3/3/3 | 0/0/0 | 3/3/3 | 0 |
| Unreachable | 3 | 0/0/0 | 0/0/0 | — | 0 |
| Competing foot | 3 | 0/0/0 | 0/0/0 | — | 0 |

- **Early motion.** C used a witnessed plan in 18 first contacts. Representative
  preparation ages were 97–277 ms. At the early frontal contact the mean last
  150 ms turn dropped from 0.0940 to 0.0745 rad and target corrections from
  two to one. In the support-phase scene the corresponding turn fell from
  0.0940 to 0.0637 rad and corrections from two to one. Early lateral correction
  count rose from one to three. Root path to the contact frame remained within
  1 mm across the arms in the successful early frontal and lateral scenes, and
  positive late acceleration was unchanged there.
- **Support and touch.** In the support-phase trials C made three right inside
  touches with observed left support. In the weaker-foot trials C made three
  left inside touches with right support. The blind-start actor turned and
  acquired useful evidence later. At its contact the right boot was supporting
  and C cushioned. These results show feasibility-based surface choice and
  use of the boot that actually arrived. They do not demonstrate earlier gait
  phase scheduling or selecting a different contact foot from the same instant.
- **Pressure.** At 83.5 ms the historical incoming ball arrives at 3.73 m/s,
  settles to 0 m/s and is owned at 200 ms. It goes loose by 500 ms during a
  carry without a further receiver contact in that window. No opponent is
  awarded a boot contact in the historical failed hold. The short approach
  produces no valid plan. In the longer pressured approach the local planner
  also supplies no valid plan, consistent with the challenger occluding the
  optical sightline. This evidence identifies the perception and post-control
  gaps in these scenes. It does not apportion all pressure failures between
  perception, planning and physical contact geometry.
- **Continuation.** All three early lateral C runs attempt a carry with a
  later retained boot contact, versus one A and zero B. The progressive case
  is 0/1/2 on the same measure. This is a physical carry continuation, counted
  when an ensuing contact retains control. The receipt also logs the first
  sampled frame with a canonical carry or release option, and distinguishes
  selection from subsequent execution.
- **Refusals.** The 27 overlapping scene arms halt with the existing initial
  penetration diagnosis. No other arm safety-halts. The velocity disturbance
  at 10.250 s cancels the initial prospective plan by 10.425 s. The competing
  foot reaches the ball first. Unreachable attempts produce no receiver contact.
  Delaying available observations past the age limit is checked in a focused test.

## Match integration and replay

The 30-second smoke uses the archived PR217 22-player session with the v2
body, autonomous control and the ordinary match entry point. A/C produced 12/11
executed ground contacts, 13/11 ownership transitions and 62.58/134.56 m
of total ball travel. Both finished with zero invalid observable frames and
no safety halts. C produced a plan in 24 ticks and neither arm witnessed a
prepared contact. The smoke establishes liveness and finite position/facing
output for this trajectory. It gives no match-level retention estimate for
the new touch.

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr219Reception.mjs
node --experimental-transform-types --import ./scripts/registerPr220Lab.mjs scripts/benchmarkPr220Placement.mjs final --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr221Reception.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/smokePr221Reception.mjs
npm run verify
```

[Paired raw receipt](performance/pr221/reception.json.gz). A missing post-control
sample is recorded as null when the 600 ms milestone is outside the observation
window. The receipt retains proposed arrivals and actual contact timestamps
for timing residuals, ground-contact impulses, pressure, frame motion, ownership
and physical refusal reasons available to the engine.

## Acceptance answers

1. Some early receptions require less late turning and fewer corrections for
   the same contact. No material reduction in root displacement was measured.
2. Yes for surface choice: the alternative uses the actual boot and support.
   An actively rescheduled opposite-foot arrival remains unverified.
3. Earlier, clear deliveries show better retention or carry continuation.
   The targeted pressured reception remains 0/9 at 600 ms.
4. In the pressure trials, the dated local plan is absent and the settled touch
   fails to connect to a second controlled contact. In the constructed support
   trial physical contact already succeeds in A and the outlet changes the
   recovery outcome in C. A quantitative split across causes remains open.
5. The path executes in the ordinary 40 Hz match engine when selected in an
   experimental native v2 state. The 22-player smoke did not activate a prepared
   touch at impact.
6. Trace one complete, ordinary team passing move from the passer's visible
   release through a pressured receiver's second contact. Preserve point of view,
   the defender's unchanged authority and the ordinary carrier policy. This
   directly tests usable attacking continuity in game play.
