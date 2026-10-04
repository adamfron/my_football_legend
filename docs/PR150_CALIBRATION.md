# PR150 - Calibration and evidence

PR150 changes the meaning of a human ball-control decision and of a public touch. The
calibration therefore reports football outcomes, control continuity and accounting separately.
A lower public touch count alone does not show that a player physically contacted the ball less
often, and deterministic DEV decisions do not directly measure menus seen by a human player.

## Source and fixture policy

The baseline is pristine PR149 main, `feed7f11ff7064f05d484d17592fab5b4695fa5d`.
The final matrix report identity is `PR150-core-63b98b1`; its source fingerprint is
local core commit `63b98b11c215239e89abda630a5053020b1a7053`, published as `5e82073671c4497c2a6c3a6e98fb2732ffce5c00`, with identical tree `c65cd51809b052ab9e6d76682f39f0daf20475bc`. Raw reports
remain outside the repository; the compact committed evidence is
[`performance/PR150-results.json`](performance/PR150-results.json).

The primary matrix contains all twelve combinations of balanced-balanced / weak-strong teams,
controlled central midfielder / left back / striker, and 45 / 90 canonical minutes, with seed
`a`. The weak-strong fixtures supply the quality-asymmetry context. Additional seed and repeat
runs are listed separately: a repeat is deterministic evidence, not an independent football
sample. The harness uses the existing fixture factory, a 25 ms canonical step and explicit
deterministic DEV selections at actual opportunity boundaries. Both revisions use the same
runtime, world data, role, seed and input policy.

The final integrated verification passed **937 main tests and 5 career tests**. The final
benchmark runs require strict invariants. Only the baseline allows explicitly recorded known
network failures. These failures remain visible in its evidence rather than being repaired
before comparison. See [`PR150_BENCHMARK_GUIDE.md`](PR150_BENCHMARK_GUIDE.md) for regeneration.

## What the counters mean

| Metric              | Interpretation                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public touches      | PR150 counts continuous control episodes. Reception, carry, shielding and eventual release can be one touch. A first-time action, meaningful failed control or a genuine subsequent recovery starts an episode. PR149 counted granular discrete contacts. |
| Internal contacts   | Exactly-once physical/action evidence remains separate from public touches. It supports reception, release and accounting without becoming a public contact total.                                                                                        |
| Carries             | Discrete executed movement intentions; neither every movement sample nor every dribble contact becomes a new carry.                                                                                                                                       |
| `promptsShown`      | Explicit opportunities resolved by the deterministic DEV policy. It is not the number of React menu renders.                                                                                                                                              |
| `presentedEpisodes` | An observational estimate of existing canonical moment clusters, sampled at 4 Hz and at each decision, filtered under `key_player`.                                                                                                                       |
| Workload            | Integrated canonical velocity and distance. Human-controlled and autonomous players use the same speed classifier.                                                                                                                                        |
| Possession          | Canonical live possession, including a team's in-flight or loose-ball spell, excluding dead-ball setup and halftime.                                                                                                                                      |

The episode observer does not execute UI lead-ins, visibility windows, proxy decisions or
episode aborts. Decisions per presented episode must therefore retain that sampling label.
Decisions per public touch also crosses a changed statistical definition when comparing
PR149 and PR150. Neither ratio directly validates the manual playtest's 83 displayed prompts.

## Primary before/after results

The following tables use every baseline and final seed-`a` match from
`before-intent-{45,90}-{central_midfielder,left_back,striker}.json` and the corresponding
`after-intent-*` files. Archived checkpoints and earlier readability exports are excluded.
`B` means balanced-balanced; `W` means weak-strong; `CM`, `LB` and `ST` identify the controlled
role. Each arrow means PR149 -> PR150. Match totals include both teams. `A/C` means attempted /
completed passes. The touch column deliberately crosses PR149 granular contacts and PR150
public control episodes; it is not a comparison of equivalent physical-contact counts.

| Fixture |         Passes A/C | Touches: contacts -> episodes | DEV prompts | Sampled episodes | Prompts / sampled episode |  Throws |
| ------- | -----------------: | ----------------------------: | ----------: | ---------------: | ------------------------: | ------: |
| 45 B CM | 410/299 -> 419/250 |                    963 -> 567 |      8 -> 6 |         11 -> 15 |          0.7273 -> 0.4000 | 0 -> 26 |
| 45 W CM | 426/193 -> 430/168 |                   1135 -> 655 |      8 -> 4 |           9 -> 4 |          0.8889 -> 1.0000 |  0 -> 5 |
| 45 B LB | 420/283 -> 415/265 |                   1002 -> 529 |     3 -> 12 |          5 -> 17 |          0.6000 -> 0.7059 | 0 -> 19 |
| 45 W LB | 438/199 -> 412/182 |                   1086 -> 596 |      5 -> 7 |           6 -> 9 |          0.8333 -> 0.7778 |  0 -> 8 |
| 45 B ST | 187/139 -> 412/271 |                    469 -> 529 |    12 -> 37 |         10 -> 22 |          1.2000 -> 1.6818 | 0 -> 22 |
| 45 W ST | 426/193 -> 435/157 |                   1135 -> 651 |      0 -> 4 |           1 -> 2 |          0.0000 -> 2.0000 |  0 -> 6 |
| 90 B CM | 840/604 -> 849/527 |                  1944 -> 1095 |    21 -> 13 |         24 -> 23 |          0.8750 -> 0.5652 | 0 -> 41 |
| 90 W CM | 844/386 -> 866/347 |                  2258 -> 1279 |    20 -> 12 |         22 -> 13 |          0.9091 -> 0.9231 | 0 -> 12 |
| 90 B LB | 838/591 -> 849/563 |                  1993 -> 1056 |     8 -> 20 |         11 -> 27 |          0.7273 -> 0.7407 | 1 -> 42 |
| 90 W LB | 865/390 -> 849/367 |                  2194 -> 1203 |    12 -> 23 |         12 -> 23 |          1.0000 -> 1.0000 | 0 -> 16 |
| 90 B ST | 601/440 -> 831/536 |                  1414 -> 1045 |    26 -> 53 |         25 -> 31 |          1.0400 -> 1.7097 | 0 -> 40 |
| 90 W ST | 844/386 -> 860/348 |                  2258 -> 1241 |      1 -> 6 |           3 -> 3 |          0.3333 -> 2.0000 | 0 -> 14 |

All six 45-minute final fixtures reached `half_time` at 45 canonical minutes. All six 90-minute
fixtures reached `full_time` at 90 minutes. No final fixture terminated early. The baseline
also reached the requested period boundaries; three runs finished less than one canonical
second beyond the nominal duration. Scores below are home-away, and shots include both teams.
Goal-feed/score reconciliation passed in every final fixture.

| Fixture |      Score |   Shots | Maximum hold, seconds |
| ------- | ---------: | ------: | --------------------: |
| 45 B CM | 1-0 -> 2-2 | 3 -> 12 |      17.650 -> 17.625 |
| 45 W CM | 0-0 -> 0-0 |  1 -> 0 |      21.750 -> 11.375 |
| 45 B LB | 0-0 -> 2-1 |  2 -> 6 |      18.350 -> 16.150 |
| 45 W LB | 0-1 -> 0-1 |  1 -> 2 |      16.575 -> 20.325 |
| 45 B ST | 0-1 -> 0-1 |  3 -> 6 |    1384.150 -> 21.700 |
| 45 W ST | 0-0 -> 0-0 |  1 -> 0 |      21.750 -> 11.375 |
| 90 B CM | 1-0 -> 3-2 | 3 -> 13 |      17.650 -> 17.625 |
| 90 W CM | 0-0 -> 0-0 |  2 -> 2 |      21.750 -> 25.675 |
| 90 B LB | 1-0 -> 3-1 |  3 -> 8 |      18.350 -> 16.150 |
| 90 W LB | 0-1 -> 0-1 |  1 -> 2 |      27.200 -> 20.325 |
| 90 B ST | 1-1 -> 0-1 |  5 -> 8 |    1384.150 -> 21.700 |
| 90 W ST | 0-0 -> 0-0 |  2 -> 0 |      21.750 -> 28.550 |

The balanced-striker baseline held possession for a maximum 1384.15 seconds, over 23 minutes;
PR150's maximum is 21.70 seconds. Its passing volume rises from 187 to 412 attempts at 45
minutes and from 601 to 831 at 90 minutes. Low baseline decision and pass counts partly reflect
that stalled play. Across the five other 45-minute baseline fixtures, pass attempts span
410-438; all six final fixtures span 412-435. This preserves roughly the established passing
cadence without a broad pass-speed or throughput recalibration.

Natural throws now occur in every fixture: 5-26 per 45-minute run and 12-42 per 90-minute run.
The baseline has zero except for one in 90 B LB. These are physical exits from delivery error
or reception travel, with the original delivery resolved as unclaimed when no receiver made
contact. Failed-control reception totals are not the total number of failed deliveries.
The low-shot weak-strong fixtures remain visible: 45 W CM, 45 W ST and 90 W ST have no shots;
90 W CM and both W LB runs have two. All twelve final fixtures have zero offsides and corners.
Those absent events remain distribution-calibration limitations.

All twelve fixtures belong in the comparison. Additional seeds must not silently replace a
less favorable primary fixture. A zero or suspicious distribution remains an observation to
explain, not a reason to insert a throw-in, offside, shot or sprint quota. Same-seed football
outcomes can legitimately differ after changed reception, passing and locomotion semantics.

The touch difference is primarily a public-definition correction. Controlled touch, pass and
received-pass shares are reported to expose concentration of involvement; they do not by
themselves establish a realistic distribution for every role. Match totals and player
distributions provide the necessary context.

Controlled-player shares below use the player's own team as denominator. `T/P/R` means touch,
attempted-pass and received-pass share, respectively, rounded to two percentage decimals.
Touch semantics and passing relationship accounting both changed, so these before/after shares
remain descriptive rather than proving equal underlying involvement. Sprint metres and bursts
come from the shared physical classifier.

| Fixture | T/P/R shares before, % | T/P/R shares after, % | Received passes |    Sprint metres | Sprint bursts |
| ------- | ---------------------: | --------------------: | --------------: | ---------------: | ------------: |
| 45 B CM |       12.81/10.53/8.77 |       12.91/8.91/9.33 |        10 -> 14 |    0.00 -> 13.40 |        0 -> 1 |
| 45 W CM |       17.54/13.73/0.00 |       15.66/7.64/0.00 |          0 -> 0 |     0.00 -> 0.00 |        0 -> 0 |
| 45 B LB |      12.52/13.24/16.67 |     14.47/17.84/19.21 |        22 -> 29 |   10.92 -> 14.74 |        1 -> 1 |
| 45 W LB |        9.33/9.43/11.54 |     10.10/11.33/10.39 |          9 -> 8 |     0.00 -> 0.00 |        0 -> 0 |
| 45 B ST |       23.33/13.95/9.84 |        9.87/8.58/3.85 |          6 -> 6 |  98.79 -> 243.44 |       8 -> 22 |
| 45 W ST |         2.63/3.53/0.00 |        4.52/6.51/0.00 |          0 -> 0 | 145.67 -> 200.09 |      10 -> 20 |
| 90 B CM |      14.76/12.53/11.85 |     14.20/10.62/11.68 |        32 -> 39 |    0.00 -> 13.40 |        0 -> 1 |
| 90 W CM |       16.16/12.40/0.00 |       16.15/9.45/0.00 |          0 -> 0 |     0.00 -> 0.00 |        0 -> 0 |
| 90 B LB |      13.02/14.85/19.06 |     13.90/16.77/17.56 |        57 -> 59 |   11.82 -> 23.21 |        1 -> 1 |
| 90 W LB |        8.67/9.18/13.82 |     11.90/13.47/15.33 |        21 -> 23 |     2.27 -> 0.00 |        0 -> 0 |
| 90 B ST |       17.28/13.09/3.19 |        9.00/8.75/3.42 |         6 -> 10 | 458.18 -> 505.38 |      38 -> 46 |
| 90 W ST |         3.16/3.68/0.65 |        3.74/5.38/0.62 |          1 -> 1 | 272.43 -> 365.16 |      18 -> 33 |

Weak-strong controlled central midfielders receive no completed passes in either duration;
the striker receives none at 45 minutes and one at 90. That remains a participation limitation.
The four final W CM/LB fixtures have zero controlled sprint bursts and metres; their observed
maximum speeds are 5.42/5.58 m/s for CM and 6.34 m/s for LB, rather than sustained sprint speed.
The DEV policy does not provide a deliberate sustained-sprint playtest for every role.

## Human decisions and continuous control

The new contract preserves a chosen carry, sprint, dribble or retain intention while its
football situation remains valid. Ordinary control samples, body adjustments and a short
preparation expiry do not require a fresh decision. Route blockage is tied to actual
opposition and stalled progress. Retain can reopen a choice after a meaningful pressure change
or a genuinely new clear support outlet in a constrained situation. Routine free holding does
not gain a menu merely because moving teammates cross a scan threshold.

Focused regressions exercise repeated canonical steps under those intentions, an actual
blocked route, incoming control without repeated menus, and support arrival under pressure.
Selected incoming control finishes its physical preparation before a meaningful settled
finishing chance can reopen a decision. The release remains a human choice; the AI does not
silently replace a committed movement intention with a pass or shot.

Across all twelve runs, DEV resolutions rise from 124 to 197; sampled episodes rise from 139
to 189. The ratio of those totals is 0.8921 -> 1.0423 resolutions per sampled episode. The
matrix therefore does not demonstrate an aggregate prompt reduction. CM decisions decrease
in each matched fixture, whereas LB and ST decisions increase. The balanced striker remains
an outlier: 37 resolutions across 22 sampled episodes at 45 minutes, and 53 across 31 at 90
minutes. The 45-minute case contains 33 on-ball and four incoming-ball decisions. It requires
further cadence calibration and rendered human evaluation.

Scripted persistent-intent regressions exercise a selected carry/retain policy across repeated
canonical steps. That policy differs from the ordinary DEV selector, which often passes.
Those regressions establish that routine micro-transitions do not repeatedly require a new
command while leaving meaningful obstruction and release choices available; the matrix
captures the additional effect of changed match trajectories and opportunities.

This establishes the canonical continuity contract. It does not establish the exact reduction
in displayed menus for the original manual session. Rendered interaction checks remain
necessary for that UX claim, especially when a human deliberately carries for several seconds.
The established 2.2-second off-ball movement calibration remains separate from the richer
on-ball persistent contract.

## Reception, passing and restarts

Moving reception preserves an ability- and contact-dependent part of the actor's momentum and
continues toward the selected direction instead of returning to an obsolete preparation
origin. Heavy or failed control retains less momentum and can leave the pitch. Directed
control and sprint still involve skill and pressure risk; a selected movement mode does not
guarantee possession.

The online `receptionMotion` evidence separates moving and stationary receptions using a
0.7 m/s threshold, reports adjacent canonical-tick speeds, and records optional canonical
momentum retention. Those speeds are snapshots before and after contact, not exact substep
contact velocities. PR149 has no canonical retention metadata; unavailable values remain
unavailable, and a zero-sample retention mean/min/max remains null.

The supplementary pristine-baseline observer reproduced the existing baseline state and
statistics hashes. It adds adjacent-tick velocity evidence without changing the earlier engine.
The table includes successful, heavy and failed receptions, and uses the same 0.7 m/s moving
threshold. It is not a paired sample of identical contacts after football outcomes changed.

| Fixture / scope    | Samples before -> after | Moving before -> after | Mean pre-tick speed, m/s | Mean post-tick speed, m/s | Mean canonical retention |
| ------------------ | ----------------------: | ---------------------: | -----------------------: | ------------------------: | -----------------------: |
| 45 B CM all        |              320 -> 285 |               62 -> 58 |           0.464 -> 0.580 |            0.452 -> 0.361 |     unavailable -> 0.768 |
| 45 B CM controlled |                18 -> 22 |               13 -> 12 |           1.214 -> 1.066 |            1.197 -> 0.568 |     unavailable -> 0.667 |
| 45 W CM all        |              327 -> 324 |               63 -> 38 |           0.356 -> 0.234 |            0.346 -> 0.118 |     unavailable -> 0.583 |
| 45 W CM controlled |                33 -> 22 |               25 -> 17 |           1.164 -> 1.200 |            1.156 -> 0.234 |     unavailable -> 0.191 |

Controlled 45 B CM has 10 clean and 8 heavy receptions before, versus 14 clean and 8 heavy
after. Controlled 45 W CM has 3 heavy/30 failed before, versus 1 heavy/21 failed after and no
clean completed reception. Its low mean retention (0.191) reflects failed control, not a clean
sprinting reception. The lower pooled post-tick speeds are reported explicitly; they do not
establish a uniform increase in retained speed across unpaired contacts.

The focused sprinting-reception regression requires retention above 0.9, speed above 6 m/s
at control, more than 2 m of forward progress over the next 0.5 s, and continuing forward
speed above 4 m/s. A separate poor-touch test requires substantially lower retention.
These trajectory assertions establish sustained continuation rather than relying on one
velocity snapshot. Benchmark reception events are distinct from completed received passes.

A first-time pass preserves the resolved incoming pass and the new outgoing release as
separate canonical identities. If physical contact requires settled control first, the
outgoing execution is no longer labelled first-time. A teammate's actual contact ends the
direct goal-kick/throw phase before any outgoing pass; that new pass has its own provenance and
offside snapshot. An unclaimed delivery leaving the pitch is resolved at the boundary without
inventing a receiver contact.

Space passing selects a credible runner and bounded execution at release, then uses the
ordinary continuous flight and reception pipeline. Weighted ground, through and lofted
delivery can exploit different situations without guaranteed arrival. The long moving loft
fixture can miss: runner timing, flight and receiver quality still determine the contact.
Its successful alternatives and its miss belong in the evidence rather than supporting a
claim that every lofted pass reaches its target. The benchmark does not export aggregate
lofted-through execution counts; no matrix-wide loft usage or success rate is inferred.

The representative matrix records **zero offsides and zero corners in all twelve fixtures**.
Launch-time snapshots and meaningful
contact/contest regressions establish functional correctness, but that sample does not
establish a realistic offside frequency. This remains a calibration limitation. Passive
obstruction and some deliberate-play edge cases also remain simplified; the implementation
does not manufacture offences to match a target rate.

## Accounting and workload evidence

A completed passing edge uses one realized passer-to-receiver relationship. If a different
teammate physically receives the delivery, the original attempt moves to that receiver's
edge and its completion follows it. Failed or unclaimed attempts retain their intended
target. The diagnostic retains both intended and actual receiver IDs. Own recovery does not
create a public self-pass or received-pass statistic.

The final strict checks require completed <= attempted for every edge; distinct endpoints;
outgoing edge totals equal each player's passing totals; incoming completions equal received
passes; and completed passes have canonical resolution/contact evidence. Same-step incoming
resolution and outgoing first-time release are both observed exactly once. Copied snapshots,
retries and genuine later recoveries retain correct public control-episode accounting.

| Exported consistency check                                      | PR149 baseline, all 12 fixtures                    | PR150 final, all 12 fixtures          |
| --------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| Completed <= attempted per edge                                 | Fails in 12/12; 7-25 violating edges per fixture   | Passes in 12/12; zero violating edges |
| Distinct passer/receiver endpoints                              | Fails in 12/12; 2-7 self-edges per fixture         | Passes in 12/12; zero self-edges      |
| Player and network attempts/completions/received totals         | Reconcile despite the endpoint-definition mismatch | Reconcile with realized relationships |
| Team passing/shot totals; goal/card feeds; canonical possession | Pass in 12/12                                      | Pass in 12/12                         |
| Integrated workload distance buckets                            | Pass in 12/12                                      | Pass in 12/12                         |

Every exported invariant is true in each final fixture. Each baseline fixture fails exactly
the two edge/self-edge checks shown above. Baseline accounting reconciliation alone therefore
does not establish sensible individual passing relationships. No extra attempt or completion
is added to make a final edge pass its constraint.

Sprint accounting uses actual speed relative to athlete maximum: 0.82 entry, 0.70 exit,
0.65-second burst maturity and 1.2-second recovery hysteresis. A brief high maximum speed can
coexist with little sprint distance and no mature burst. Explicit sprint now supplies a
sustained physical intention; the classifier was not lowered to inflate controlled-player
totals. Focused human/autonomous comparisons use the same physical workload, and the benchmark
requires walk + jog + run + sprint distance to equal total integrated distance. Conditioning,
injury and substitution consequences remain PR151 work.

## Determinism, observation and performance

The compact matrix contains 20 final fixture rows: the twelve primary seed-a matches,
four CM seed-b matches, two equivalent 10-minute repeats, a 10-minute replay variant and a
90-minute replay variant. All final accounting checks pass. The 10-minute three-way variants
and the full 90-minute replay/non-replay comparison have identical canonical/statistics hashes.
The full 90-minute CM state hash is `73c6ce4ab84919e85ac3987e9772039702a534d0ca5536f31182c3c71688f3f4`;
its statistics hash is `785573f9df14b99e37bc452da616bef3c3c2d28cc92746dce3661f6e40599e0d`.

Separate performance observations use the existing canonical-world performance fixture,
controlled CM and seed `pr150-performance:balanced:a`, profiling disabled, batches of 20
ticks and five-minute buckets. They run serially after local tests and browser simulation
stop, with a fresh Node process per report. Environment: v24.19.0, win32,
AMD Ryzen 7 260 w/ Radeon 780M Graphics , 16 logical CPUs. Detailed bucket memory, collection sizes,
input counts and all fingerprints are in [PR150-performance.json](performance/PR150-performance.json).
The existing full-time performance harness reports 5400.825 canonical seconds for PR149
and 5401.800 for PR150; it can finish slightly past the nominal boundary. These actual
durations are preserved and used for speed, without adding an added-time subsystem.

| Revision | Minutes | Observer mode   | Elapsed seconds | Canonical speed | Batch p95, ms | Batch p99, ms | Late/early cost |
| -------- | ------: | --------------- | --------------: | --------------: | ------------: | ------------: | --------------: |
| PR149    |      45 | release_minimal |           42.77 |           63.1x |        23.751 |        77.110 |           1.131 |
| PR150    |      45 | release_minimal |           41.81 |           64.6x |        23.901 |        76.481 |           0.873 |
| PR149    |      90 | release_minimal |           85.60 |           63.1x |        23.797 |        80.912 |           1.252 |
| PR150    |      90 | release_minimal |           80.22 |           67.3x |        23.078 |        77.124 |           1.098 |
| PR150    |      90 | normal          |           80.23 |           67.3x |        22.802 |        80.521 |           1.151 |
| PR150    |      10 | release_minimal |           10.70 |           56.1x |        27.257 |        86.604 |           1.300 |
| PR150    |      10 | normal          |           10.08 |           59.5x |        25.333 |        82.426 |           1.389 |
| PR150    |      10 | dev             |           11.33 |           53.0x |        33.424 |        84.357 |           1.277 |
| PR150    |      10 | capture         |           73.51 |            8.2x |       128.726 |       202.517 |           1.082 |

For release_minimal, after/before elapsed ratios are 0.9774
at 45 minutes and 0.9371 at 90 minutes. These are
single cold-process observations, not repeated estimates or a statistically established
speedup. Football outcomes legitimately differ between revisions. No ratio is inferred from
the overlapping calibration matrix timings.

All canonical/player/statistics/event/RNG hashes match between release_minimal and normal
over 90 minutes, and among release_minimal, normal, dev and capture over 10 minutes. The
45-minute final state also matches the 90-minute run's halftime checkpoint in both revisions.
Background renderer calls are zero in all nine performance runs. Observer modes exercise
presentation/telemetry/capture observation without an actual GPU renderer or MediaRecorder;
browser video-encoding cost was not measured.

The independent renderer regression executes the real renderer's CPU geometry with mocked
WebGL over a 60-second match and compares the entire canonical state with headless execution,
including repeated paused redraws and arrows. A browser smoke check covered a paused decision,
named-team event feed and a goal replay returning to the same 35:40.500 canonical instant;
browser console errors were absent. It did not count a full human match's displayed menus.

The full-field telemetry reference was reproduced twice and compared independently with
pristine PR149. Its schema/all-field assertions remain intact. Changes follow reception,
physical passing outcomes and realized endpoint accounting:

| Reference seed         | PR149 SHA-256                                                      | PR150 SHA-256                                                      |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| pr146-flow-reference:a | `206edf94d099b58f896a2237a68922174f02d087102549f31870d44bbefb0b9c` | `3ced1597287169d8941900f27ad4ac6ef274ea40398fca84a8d1535668ec5dba` |
| pr146-flow-reference:b | `a0f1910e310ffc75edae7ef888e77dac2accb7ba8c4e66547e3222111a4ba54a` | `1a5102f3ebc44473c3378dd71a9f512a00e0dda24744138a198690a5df08cfb8` |

Matching seeds, fixtures and input policy must produce matching canonical/statistics hashes
for equivalent observation or replay runs. Hashing and export occur outside the throughput
timer. The headless harness imports no renderer, so its renderer-call count is zero by
construction. Separate observer-mode and renderer/replay parity tests provide the independent
evidence; the harness counter alone is not evidence about a running browser.

The primary matrix overlapped other work, so its elapsed times are retained only as raw
measurements. No before/after throughput ratio is calculated from that matrix. A performance
ratio is appropriate only for isolated serial runs with matching instrumentation, runtime and
warm-up context; otherwise the limitation remains explicit.

This PR introduces no stamina, injury, substitution AI, added-time, bench, coach or referee
expansion. The remaining frequency and manual-UX limitations above are retained alongside the
passing, momentum and accounting evidence rather than hidden by favorable sampling.
