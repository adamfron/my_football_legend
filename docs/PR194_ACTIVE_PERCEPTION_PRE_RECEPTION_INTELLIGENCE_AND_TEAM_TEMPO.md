# PR194 — Active Perception, Pre-Reception Intelligence & Team Tempo

## 1. Executive summary and canonical readiness

**Canonical remains NOT READY. B remains default; independent confirmation stays sealed.**

Three independent opt-in experiments add directional logical attention and finite
spatial memory, preparation during an observed incoming flight, local receiving
positions, and tactical effort choices. Existing physical contacts, laws, roles,
fitness and the 40 Hz clock remain authoritative. The experiment does not certify
all controllers as bounded or establish a universally better football policy.

The staged development design contains fifteen combined WW/SS/SW × five-policy
matches, nine single-axis ablations, one exact PR193 control and two complete
observer-off twins. [All numerical comparisons](performance/pr194/full-match-table.md)
and [machine-readable results](performance/pr194/summary-v4.json) distinguish these
populations. Short laboratory success is not substituted for match transfer.

The final combined cohort changes 22,546 → 18,220 attempts and 183 → 195 shots.
This aggregate hides substantial harms: WW/B drops 22 → 14 shots, WW/R3 25 → 11,
and WW/H still produces zero. SW/C reaches 45 shots; that development fixture is
not an independent replication or a global improvement claim. No shot, turnover,
pass or sprint quota is used.

## 2. Frozen PR193 baseline

Merged source: `bc7c71b2e8daf910ed5a4ded5d731f5aa668cc4d`; PR193 head:
`35f9a5569f2ef933eeeedb3fab58d306b3c8e14f`.
[Frozen manifest](performance/pr194/frozen-pr193.json) records actual Git source
blobs, all fifteen unchanged PR188 development inputs, seeds, policies, preceding
reports, historical evidence hashes and this reference host. Text hashes use LF;
gzip files retain their exact byte hashes. Historical Git blobs are also checked.

The PR193 combined cohort is the comparison, including its recovery, restart,
transition and clearance flags. Its totals remain 22,546 passes and 183 shots,
with WW/O 1512/1, WW/H 1404/0, SS/O 1943/4 and SW/H 1620/9. The earlier paired
24,373 → 22,546 passes and 214 → 183 shots are preserved, not recast as success.
PR193's 219 → 375 ms checkpoint probe is a separate local workload.

An initial complete WW/B control reproduces PR193's entire final state hash,
408 attempts and 22 shots, in 244.665 wall seconds and about 269 CPU seconds.
The final staged design contains another control. Source variants are recoverable
overlays against the exact merged base. Large historical archives are referenced
in place. No sealed confirmation input is opened.

## 3. Audit of existing bounded perception

`boundedPerception.ts` already copied whitelisted entities within 36 m, a forward
field and a close 7 m envelope. It had no persistent spatial sightings. PR193
added observed velocity/orientation, short opportunity windows and local runs.
`boundedIntelligence.ts` deliberated after acquisition; its prepared foot-window
intention was distinct from preparation before receiving a pass.

`passReception.ts` and `receptionContinuation.ts` already anticipated contact,
directional control and run-on movement. Parts of that older motor/tactical path,
B/R3, goalkeeper behaviour and general formation logic still read canonical state.
PR194 is not a complete replacement of those controllers. O/H/C candidate decisions
use the extended bounded adapter; B/R3 keep their existing policy identities.

Following the selected pass into execution exposed another pre-existing leak:
`projectPassReception` recalculated its target from the current real receiver.
A remembered candidate could therefore receive an unseen target correction.
The final v4 path supplies the existing explicit `deliveryPlan` from permitted
observations and records the observed receiver velocity. Hidden changes to the
receiver's position, motion and attributes now leave the actual launch ray unchanged.

Existing `matchFitness.ts` measures actual distance, acceleration, braking,
turning, repeated effort, contact and recovery. `locomotion.ts` already separates
intensity from attainable speed. Tactical preferences provide patience,
verticality, pressing and block axes. `tacticalCognition.ts` contains an isolated
advice prototype, not a canonical captain/delivery system.

## 4. Scanning and attention model

`activePerception.ts` introduces logical gaze, not an anatomically animated neck.
The active field has a 1.22 rad half-angle and 36 m range. An active observation
does not retain the old 7 m universal visual shortcut. Own controlled ball state
can be known proprioceptively; unseen teammates cannot.

A shoulder glance rotates gradually toward a bounded offset, alternating sides.
Acquisition occurs at each actual sampled direction; calling the update does not
reveal a circle. Observed pressure and an urgently arriving ball can suppress or
interrupt scanning. Ball attention competes with the glance: diverted attention
can leave the ball observation stale or unavailable. There is no required scan
count, possession bonus or perpetual maximum-scan reward.

Game reading and role affect the interval before another voluntary scan. A separate
engineering cadence samples stable contexts at about 200 ms and critical contexts
at about 100 ms. It does not depend on host CPU load. Skipped samples retain their
old timestamp and uncertainty rather than receiving silent truth updates.

## 5. Short-lived spatial memory

`activePerceptionState.ts` validates optional serialisable state. Each player keeps
at most twelve sightings: ID/team, observed position and velocity, keeper/own-role
cue, observation time and confidence. Direct sightings, remembered geometry and
capped velocity predictions remain distinct in the scene and debug table.

Retention is `0.65 + concentration × 0.012` seconds. Extrapolation stops after
`0.25 + gameReading × 0.004` seconds; uncertainty continues growing after that.
These are explicit engineering priors, not empirically calibrated confidence
intervals. Old coordinates never refresh from an unseen player's current state.
Sightings expire and departed identities are removed on regular updates.

Tests distinguish a legitimately remembered teammate behind the player, a never
observed teammate, moved unseen truth, stale memory and expiry. Changing unseen
position, velocity, target and pace cannot alter the remembered candidate geometry.

## 6. Attribute responsibilities

All 28 permanent attributes remain unchanged. No new scanning, recovery or balance
attribute is introduced; `plantBalance` remains physical state.

| Existing attribute             | New experimental responsibility                          |
| ------------------------------ | -------------------------------------------------------- |
| gameReading                    | scan timing and bounded movement extrapolation           |
| concentration                  | finite retention and continuity of evidence              |
| composure                      | stability of an already prepared decision under pressure |
| technique / firstTouch         | existing canonical contact execution and preparation     |
| agility                        | existing actual turning and acceleration                 |
| passing / dribbling / movement | existing candidate difficulty and execution              |
| leadership                     | negative control here; no new canonical influence buff   |

The laboratory varies one attribute at 20/40/60/80/100 with fixed paired seeds.
Leadership contrasts preserve physical contact/action behaviour. Different
statistics need not improve monotonically: useful perception, selection, timing
and technical execution are different causes.

## 7. Pre-reception preparation

`preReceptionPlanning.ts` estimates a short local meeting from a visible ball's
position and velocity. It neither reads a future pass sequence nor requires the
authoritative intended receiver ID. A conditional scene asks which existing
bounded candidates could be useful after reception. Hypothetical ownership is
never written into the match or sent to the action executor.

Up to three sufficiently relevant candidates retain evidence ages, uncertainty,
target, required orientation, expected preparation, expiry and physical difficulty.
There may be fewer, and several may be alternative carries rather than passes.
Actual body orientation turns through existing locomotion. A plausible carry can
inform the existing directional-reception continuation. No new contact surface,
sole trick or backheel execution is invented.

## 8. Candidate selection and invalidation

O/H/C still call `constructBoundedCandidates` and their existing mechanisms.
At actual ownership they reconstruct candidates from current permitted knowledge;
expiry, missing evidence, observed offside, closed lanes, moved targets and a
different real reception can invalidate the old options. This is not automatic
execution of a cached action. Unobserved changes can remain unknown and cause errors.

Prior preparation can reduce recognition latency, with composure relevant under
pressure. It never shortens canonical foot recovery or overrides height, reach,
first touch, offside, fouls, restarts or human agency. The `usedId` marker requires
an actual new pass/shot release matching a prepared option, not a predicted contact.
For B/R3, a matching release does not prove that their legacy selector used the cache.

`observedPassDelivery.ts` uses the existing rolling deceleration and launch geometry
in a closed-form estimate. The target and motion evidence are frozen at selection;
execution cannot secretly follow an unseen receiver. Receiver readiness uses an
explicit common engineering envelope rather than private real attributes. Actual
reception still uses the receiver's own body, skills, motion and legal contact.
This estimate is not a successful contact or an authoritative future trajectory.

## 9. Pressure-escape and pre-action results

[Laboratory v4](performance/pr194/laboratory-v4.json) contains 73 conditions: nineteen
initial situations in both mirrors plus 35 one-attribute contrasts. The prior-view
conditions seed a clearly recorded earlier permitted observation; the separate
`active_scan` condition measures autonomous scanning during canonical stepping.
These two interventions are not mislabelled as the same experiment.
Seeded prior-view history is a controlled initial-memory intervention, not a
canonically integrated warm-up. Moved/lane contrasts are initial counterfactual
stress conditions; there is no target teleport during the measured stepping.

All 73 runs contain a real receiver foot contact and preparation before it. This
is **not** 73 successful escapes or completed prepared passes. Only three conditions
record a matching prepared release; many continuations lose possession, change
plan or never release the initially prepared option. Four selected cases repeat
with deliberately mutating detached sample observers and identical final states.

In the normal prior-view/no-view pair, first contact occurs at approximately
1.625/1.775 s after start, and the first subsequent bounded decision is 0.175/0.475 s
after that contact. This is local causal evidence, not a population speed estimate.
The active-scan case contacts at about 2.225 s; it does not retain a guaranteed continuation. The
lane-closed and wrong-body cases also retain losses. The urgent case can receive
but fail to produce a subsequent bounded release within the retained horizon.

The safe option, lane closure, far-side continuation, unobserved change and urgent
attention conditions are volleyball-style preparation analogies only. The apparatus
prescribes the first incoming pass, then ordinary autonomous football continues.
No return pass, shield trick or successful combination is prescribed.

## 10. Intelligent receiving-position experiments

`receivingPositions.ts` evaluates small departures from the player's own position
using observed lane space, marking separation, orientation, teammate spacing and
the player's own formation/role. Personal receiving value and team positional
value are recorded separately. Unknown offside information is not a legal verdict.

[Forty canonical phases (twenty on/off pairs)](performance/pr194/receiving-v4.json) cover moving
away from a marker, dropping behind pressure, supporting behind, between lines,
half-turn preparation, width, half-space, drawing attention, a third-man opportunity
and rest defence. Both mirrors compare the position experiment disabled/enabled
while perception stays enabled. Five seconds of actual 40 Hz movement follow each
controlled setup; the third-man case prescribes only its initial delivery.
The behind-pressure and support-behind catalog entries share initial geometry;
their different labels are not independent layouts or independent evidence.

Receipts retain actual origins/endpoints, targets, opponents and same-final-world
lane/mark-space comparisons. A changed target or estimated value is not counted
as a completed pass. Results can be negative: movement may shrink a lane or lose
useful support. The v2 rest-defence cases exposed a recycled-target freeze. The final controller records protection without an attacking movement override, allowing ordinary structural/defensive targets to continue updating. Final paired bodies move about 4–8 m; zero movement is not used as evidence of successful rest defence.

## 11. Off-ball coordination

Receiving jobs use ordinary acceleration, braking, fatigue, collision and offside
execution. They have short expiry and lower priority than existing transition and
pattern commitments, active reception and human movement. Defending centre backs,
holding duties and hold-position roles retain protective objectives.

PR193 pass-and-run and third-man movement remain independent local jobs. A receiver
is not promised a future return. Defenders are not instructed to follow a decoy.
The receiving catalog records their actual responses; improved team space without
the actor receiving is a measurable possibility, not an automatic reward.

## 12. Team tempo and tactical instructions

`teamTempo.ts` reads the player's own coach preferences, score and local observed
geometry. Patience can lower ordinary support effort; an observed temporary channel
can raise it despite patient instructions. Late chasing adds urgency. At least two
opponent sightings are required for a high-confidence open-channel interpretation;
missing sightings alone are not treated as a verified empty defence.

`tempoEffort.ts` changes selected support/shape/depth intentions, not passing rate.
Human instructions, physical reception, loose-ball races and urgent defensive
recovery retain priority. Unknown ownership remains a balanced context. Recovery requires a locally observed opponent owner; unknown flight is not labelled opposition control.

The short patient/counter/organised/late-score cases and full matches test this
limited controller. A long multi-minute patient phase interrupted by a controlled
turnover, with a complete ten-phase matched team protocol, remains an open gate.
It is not claimed from an eight-second animation or a tempo label.

## 13. Fatigue and effort

No second fatigue formula or intent-based energy charge is added. Actual movement
continues through `advanceMatchFitness`; capacity and burst readiness already affect
attainable speed, acceleration, turning and contact. Tactical urgency is recorded
separately from physiological capacity. The same recognised opportunity can be
physically harder to exploit after fatigue.

The repeated-effort laboratory starts after an existing 180-second physical sprint
drill, retaining its actual workload and costs. It is a preconditioning intervention,
not three minutes of a completed football transition. The fatigued condition is
an explicit initial reserve condition. Full receipts store all workload bands,
sprint episodes, acceleration/braking/turning, capacity spent/recovered and reserves.

## 14. Leadership and communication feasibility

The isolated PR186 advice model already limits visible sender/recipient distance
to 22 m, message age, leadership, game reading, concentration and comprehension.
It lacks a canonical captain identity and delivered-cue lifecycle integrated with
coach authority, attention and familiarity. PR194 therefore leaves canonical
captain communication blocked rather than inventing an instantaneous team buff.

A subsequent gate must establish actual sender evidence, delivery, recognition,
expiry, rejection/misunderstanding and competing instructions before influencing
tempo. Leadership is an explicit negative control in the current experiments.

## 15. Passing-circulation effects and causal limits

`PerceptionDiagnostics` records reasons, prepared-release matches and bounded
candidate/knowledge samples around repeated local circulation. It distinguishes
progression, switches, retention, pressure escapes, fleeting lanes and local
returns. Its six-release geometric detector is a diagnostic label; it does not
limit passes or intervene in the game.

Final WW/O changes 1512 → 1055 attempts with 1 → 2 shots; WW/H changes 1404 → 835
with 0 → 0 shots. Neither solves attacking creation. The rejected v2 outcomes
(WW/O 1045/2, WW/H 674/3) remain preserved as different source versions.

[Four causal prefixes](performance/pr194/circulation-v4.json) continue genuine
30-second captures for two simulated minutes. They retain the first 128 bounded
decisions per fixture, not every match decision. WW/O and SS/O have no shot
candidate in those retained decisions; 40/128 and 55/128 have no option progressing
more than five metres. WW/H and SW/H have no such progressive option in 108/128
and 93/128, with no shot candidate in 61/128 and 36/128. Higher-benefit unready
options occur in only 1/2/2/2 of these samples respectively. Those counts do not
prove that unseen alternatives existed or that readiness explains the full match.

For example, at 32.375 s WW/O selects an observed support escape with risk 0.084
and benefit −0.0014; its best carry has risk 0.482 and benefit −0.0223, and there
is no shot candidate. The local reasons cite the closing window and comparison
with waiting. At 41.275 s SW/H selects a backward escape (−2.15 m progress,
benefit 0.0162), using sightings aged about 0.65–0.95 s. Its best shot has benefit
−0.0777, risk 0.997 and readiness after the window closes. These are identifiable
valuation, observation and physical constraints, not a license to force a shot.
The retained selected IDs, alternatives, knowledge ages and actual release IDs
permit narrower investigation; they do not establish a complete stale-memory
error classifier. Fewer passes alone cannot establish a better policy. Retention,
waiting for a run and a useful backward release remain legal choices.

The incoming-contact counter includes loose-ball claims as well as pass receptions;
it must not be presented as a pure pass-reception denominator. Accepted carry
intentions can occur at the first touch. Their timestamp is not a fresh decision
latency or proof of another physical contact. Use the later decision traces and
actual release/contact receipts for those questions.

## 16. Full-match development results

[The complete table](performance/pr194/full-match-table.md) records PR193 → PR194
attempts, shots and active minutes, CPU and peak RSS for every combined fixture.
[The summary](performance/pr194/summary-v4.json) also retains ablations, reason
counts, latency samples and observer twins. Raw receipts include movement workloads,
ordinary match-flow/turnover/entry/shot/restart/foul measurements and captured states.

The nine single-axis matches concentrate on WW/O, SS/O and SW/H, the known
pathologies. They do not establish a full five-way ablation matrix for every policy.
The complete combined WW/SS/SW × B/R3/O/H/C cohort remains development evidence.
No policy is promoted, no independent cohort is opened, and a remaining high-pass,
low-shot case cannot be explained merely by calling the policy cautious.
The perception axis also closes the legacy execution retargeting leak and uses
a common observed-receiver readiness envelope. Its match effects cannot therefore
be attributed solely to scan frequency or preparation latency.

## 17. Negative evidence and unproven claims

Preserved pilot `laboratory-v1` predates the release-match marker and the coherent
repeated-effort/counter setup refinements. Final laboratory evidence is v4.
The interrupted v2 full-match pilot retains sixteen completed matches and partial
logs. Its receiving protection could feed the previous target back into its own
override and freeze structural movement. V3 removes that override, but its queue
was subsequently stopped by the separate execution audit below. The laboratory's
all-contact result must not be called an all-success result. The active scan,
changed lane, wrong orientation, urgent pressure and fatigued cases preserve
failures and altered continuations.

The v3 queue was also interrupted, preserving twelve completed matches, when the
execution audit found the unseen-receiver retargeting leak. Neither interrupted
pilot is represented as a complete matrix or final validation. V4 repeats the full
staged design with fixed observed rays. The earlier green tests did not establish
that this information boundary was respected; a new actual-release regression does.

Prepared options frequently remain unused, disappear or are revised. Several
options can be carries; preparation is not a passing-frequency multiplier.
The complete WW B/R3 shot regressions independently reject universal improvement.
Receiving-position estimated utility, a defender moving and an attractive overlay
do not prove an effective decoy or a completed third-man attack.

Communication, long matched tempo phases, calibration of uncertainty, robust
defensive coordination and global bounded AI remain open. No future-world rollout,
synthetic shooting opportunity, guaranteed possession or artificial turnover is added.

## 18. Performance, determinism and compatibility

Reference host: AMD Ryzen 7 260 / Radeon 780M, 16 logical CPUs, approximately 31 GiB,
Windows x64, Node 24.22.1. Full matches run at 0.025 s with the actual tick count,
simulated time, CPU, wall time, peak RSS, flags and source hashes in every receipt.
The development dispatcher uses six workers; concurrent tests and host scheduling
mean these are not isolated single-process benchmark claims.
Combined full-match CPU ranges from about 587 to 845 seconds (9.8–14.1 minutes).
The timer covers the simulation loop and its enabled observers; startup, module
loading, source archiving and final receipt serialization lie outside that timer.
Peak process RSS includes startup and observer allocations.

[Shared-checkpoint profiling](performance/pr194/profile-v4.json) repeats five modes
three times with debug off/on. Off median CPU is approximately baseline 438 ms,
perception 438 ms, positions 595 ms, tempo 453 ms and combined 516 ms for this
four-second WW/B checkpoint. Different decisions also change physical work; the
perception number is not proof of an engineering speed-up. Nothing is extrapolated
into a universal full-match factor. Inclusive sampled categories must not be added
as disjoint percentages.

Separate spans cover perception gathering, memory, preparation, opportunity windows,
receiving positions, defence, tempo and canonical movement/ball/contact execution.
The full observer-off twins measure normal observer overhead on real complete
matches; the small checkpoint additionally measures bounded-trace serialization.
The 10–15 minute long-term target needs an agreed isolated reference protocol,
especially for alternative policies and a fully debug-free production configuration.

Optional schemas preserve old saves. Disabled experiments reproduce the full PR193
control; fifteen actual development captures repeat with observers, deliberately
mutating detached callbacks and bare stepping. Historical PR186–193 evidence/replays
remain checked against their correct frozen source. New test timeouts, fewer ticks,
changed laws or weakened football assertions are not used to pass performance gates.

## 19. Browser inspection

In Match Lab open **Widok diagnostyczny → PR194 · Percepcja, przygotowanie i tempo**.
The optional compact panel reuses the existing renderer, camera and replay timeline.
It shows attention, remembered locations, observation ages/uncertainty, prepared
options/expiry/invalidation, receiving position, tempo, physical readiness and
actual contacts. World players and bounded knowledge are explicitly separate.

Browser inspection exercised prior view, active scans, the timeline before contact,
controls and overlays. It exposed an absolute-canvas positioning defect; the host
now establishes its own positioning context. Controls wrap compactly. The actual
[browser capture](performance/pr194/browser.jpg) is UI evidence only. Console errors
are checked separately; the image is not evidence of an anatomical contact.

## 20. Future distilled-model requirements — specification only

First complete and independently validate the canonical physical engine. Then
generate diverse canonical matches and distil a conditional/sequential lightweight
model. PR194 neither implements nor trains it and does not replace it with a
separately hand-written football rule engine.

The future model must jointly produce coherent score, scorers/assists, cards,
substitutions with actual entry/exit/IDs and modelled reasons, injuries/suspensions,
minutes/participation, performance indicators, supported tactical/technical habits,
fitness consequences and important moments. Player/team identities must remain
consistent. A preselected final score cannot be justified afterwards with an
invented contradictory event history.

## 21. Readiness, roadmap and reproducibility

The **MatchEngine Realism Programme** now has thematic gates, potentially another
20–30 PRs, rather than repeatedly promising one final engine change. Immediate
PR194 is authoritative. Future themes receive no speculative GitHub numbers.
[Roadmap](ROADMAP.md) and [project state](PROJECT_STATE.md) preserve the complete
unimplemented 20–25-season generations/world-strength programme, academies,
ageing/retirement, squad renewal, talent ceilings/trajectories, transfers, best-XI/
positional/squad quality, PlayStyles/history, career UX, selection by role/tactical
fit/form/trust and world expansion.

| Gate                        | Assessment                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Baseline/audit              | frozen exact PR193; historical negatives retained                                                      |
| Active scanning / memory    | implemented experimentally; visibility, misleading memory and expiry regressions                       |
| Pre-reception options       | bounded existing candidates, real contact/revalidation; useful conversion remains limited              |
| Receiving positions         | local role-aware controller and forty paired physical phases; team usefulness not globally established |
| Team tempo / effort         | contextual effort, existing fatigue; complete long-phase protocol remains open                         |
| Leadership                  | canonical delivery/captain integration blocked explicitly                                              |
| Laboratory transfer         | 73 controlled cases, actual contacts and losses; no universal skill/success claim                      |
| Full matches                | staged development matrix, policy-specific harms; no superiority or readiness promotion                |
| Performance / compatibility | actual full-match timings, short profiling, saved-state/capture/historical checks                      |
| Independent validation      | sealed; prerequisite controllers, calibration and acceptance protocol remain open                      |

Reproduction commands:

```sh
npm run verify
npm run benchmark:pr194:baseline
npm run benchmark:pr194:check
npm run benchmark:pr194:replay
# New outputs require a new explicit version; existing evidence is never overwritten.
npm run benchmark:pr194:development
```

Full receipts are losslessly packed with original-byte hashes. The integrity checker
validates source recovery, input/history hashes, the staged matrix and observer
twins. Final-head CI is reported on the PR separately from the immutable local
verification snapshot. **Canonical NOT READY; B default; confirmation sealed.**
