# PR154 — Situational Football Intelligence, Attribute Fidelity & Anti-Deadlock Calibration

Base: merged GitHub #153, `7b175c7a2e5d76ba082c677b407dd80130c37705`.

## Work sequence and causes

1. Reproduce the native spectator fixture `pro_9` Błękitni Port vs `pro_1` Górnik Brzeziny,
   `lab-muvry3p0`, 45 minutes, 4-3-3 vs 4-4-2. Baseline matches the supplied
   303 attempts / 198 completed / 33 out of play and the 22 touch counts.
2. Separate intended pass selection from execution and actual reception. Previous lead
   reception movement continually moved its target three metres beyond the meeting point.
   Ordinary passes also had zero spatial execution error, obscuring passer fidelity.
3. Repair pressure escape: an NPC's ordinary carry omitted `movementMode`, so the shared
   carry resolver could interpret repeated forward intentions as stationary shielding.
   Add route/risk utility and immediate support without forcing a timed release.
4. Extend existing threat memory with bounded local solution outcomes, preserve marking
   handoffs and appoint one keeper/defender claimant with a physical cover target.
5. Add paired attribute and actual-flight matrices, observational DEV diagnostics and
   canonical shot-distance aggregation; rerun natural cases and invariant suites.

## Architecture and behaviour

`passDecision.ts` uses the existing launch forecast and acceleration-aware player arrival
estimates. It assesses receiver lateness, defender arrival, occupied lane segments, current
pressure, length, boundary margin/runout and passer ability. Reading/composure affect risk
recognition; transition, score/time and locally applicable team caution affect appetite.
`expectedCompletion` is a selection heuristic, not a fitted probability or an outcome draw.
Useful reachable lead/through solutions retain their progression value. Physical error is
sampled separately through the shared deterministic `passExecution.ts`, including kicking
for goal-kick distribution. No team identity or overall rating changes the resolver.

Released diagnostics retain intended and physical targets, selection/ETA evidence and
execution error. Resolution adds actual control failure, interception and out-of-play facts.
Natural buckets combine intent, pressure, length and ability; they are observational samples,
not causal comparisons. The paired micro matrices provide the causal attribute comparison.

Possession urgency is continuous utility after physical preparation, conditioned on current
pressure. It lowers prolonged retention value and favours credible outlets; free scanning
and late lead protection near a corner retain value. A chosen ordinary carry now executes
the same `carry` mode for every action source. Blocked routes lose value rather than
receiving a generic escape bonus. No age threshold executes an action or awards possession.

`deriveBuildUpSupport` supplies two nearby escape angles, a midfield third-man route under
pressure and a deeper CB reset when relevant. Width remains available on the weak side.
These are formation targets consumed by ordinary locomotion, with no relocation or touch
quota. Connectivity reports line/role shares, dominant edges and starvation warnings.

`recentSolutions` lives inside PR151 team threat memory, with at most 32 outcomes per team.
It remembers actor, action/intent, recipient/channel, origin, pressure and result. A 45-second
half-life and spatial/pressure similarity limit repeated failure penalties. Changed geometry
can immediately restore value. Canonical pass IDs prevent duplicate ingestion; replaced
non-progressing carries and lost duels add local failure evidence. Existing team threat
responses, territorial adaptation and pair episode locks remain in use.

Weak forwards generally screen protected routine circulation. Exposed control and real
danger still allow opportunistic contact; explicit action sources retain the same resolver.
A nearby advanced receiver requires a real geometric marking handoff before the marker
joins a press. This applies to later primary reassignment as well as cooperative recruitment.

`goalkeeperClaim.ts` compares actual target ETA, reaction/read/sweeping, threat zone, flight
direction and exposed space. Keeper agency suppresses remote or redundant choices while
retaining breakaway commitments. Loose-ball allocation chooses either the keeper or outfield
claimants; a keeper's covering defender receives a goalward target and moves physically.
Close-range one-on-one skill affects reaction; reflexes, handling and movement retain shared
physics. A defensive free kick usually retains a contextual counter outlet; existing legal
penalty rebound/waiting roles remain unchanged.

DEV shows selected-player OVR and underlying attributes, XI OVR and squad OVR. These are
display-only. Attribute Micro Lab uses paired seeds, identical geometry and one attribute
at a time in bands 20/40/60/80/100. It measures sprint/acceleration, first touch, five pass
intents across pressure/length, duels/dribbling, finishing and keeper reflex/handling/1v1/
sweeping/kicking. Distributions include mean and P05/P50/P95. `--pass-matrix` separately
runs actual 25ms flights/contact to distinguish execution improvement from completion.
The pressure observer records stationary exposure, latency from pressure onset, support
distances/movement, viable options and continued-holding reason. It runs only in DEV/capture.

Shot telemetry reads distance and expectation from the recorded canonical shot, even after
the shooter moves or a goal/restart resets positions. An invariant links every aggregated
distance to its per-shot diagnostic by sequence and canonical shot ID.

## Deterministic contracts and validation

- Fixed 25ms canonical stepping; normal and pre-probed stepping remain equivalent.
- Human/NPC release the same physical ball from the same intent. UI OVR has no engine hook.
- Public touches remain continuous control/intervention episodes. Reception, carry and pass
  do not become extra touches merely because an intention changes.
- Shared shot, pass, reception and defensive contact resolvers; no quotas, forced goals,
  global accuracy boost, pass timeout or ball/possession teleport.
- Observers, replay and debug recording remain read-only. Detailed diagnostics are bounded.
- Full-field telemetry reference hashes intentionally follow changed football trajectories;
  identity ledgers, schema checks and invariant assertions remain included.

Legacy tests express the new contracts explicitly: a committed presser fixture specifies
tackle skill; the lofted-pass test checks intended ETA separately from physical error;
flight-time isolation neutralizes the new 1v1 reaction term. Dangerous-mark regression
checks every actual contact's current coverage instead of banning a later safe handoff.
PR151's benchmark now recognizes that neutral teams already support and reject its risky
route before remembered losses; remembered danger still strengthens actual safety scores
and physically lowers the block. No timeout was increased and no invariant was removed.

## Reproduction

```sh
VITEST_MAX_WORKERS=2 npm run verify
npm run benchmark:intelligence -- --matrix --out=.benchmark-artifacts/pr154-after.json
npm run benchmark:intelligence -- --matrix --revision=PR153 --engine-root=/path/to/pr153 --out=.benchmark-artifacts/pr154-before.json
npm run benchmark:intelligence -- --micro --out=.benchmark-artifacts/pr154-micro.json
npm run benchmark:intelligence -- --pass-matrix --out=.benchmark-artifacts/pr154-flight.json
npm run benchmark:intelligence -- --minutes=5 --observer=normal --out=.benchmark-artifacts/pr154-normal.json
npm run benchmark:intelligence -- --minutes=5 --observer=dev --out=.benchmark-artifacts/pr154-dev.json
npm run benchmark:intelligence -- --minutes=5 --observer=capture --out=.benchmark-artifacts/pr154-capture.json
```

The baseline checkout is an independent archive of the stated GitHub main SHA. Both
revisions use the same Node runtime, fixture builder, native squads and measurement driver.
Baseline-only fields that did not exist are marked uncollected. Committed evidence contains
aggregates and all 22 player statistics, never raw canonical ticks.

## Measured calibration

Eight native-squad spectator half-matches, two paired seeds per case. Accuracy and control are actual canonical outcomes. Matrix timings accompany concurrent validation; isolated normal timing is reported separately.

| Case / seed                         | Passes before → after | Out before → after | Longest hold before → after (s) | Score before → after |
| ----------------------------------- | --------------------- | ------------------ | ------------------------------- | -------------------- |
| supplied-433-442 / lab-muvry3p0     | 198/303 → 320/389     | 33 → 4             | 48.6 → 20.1                     | 0–2 → 1–1            |
| supplied-433-442 / pr154-natural-b  | 207/311 → 355/408     | 19 → 1             | 55.8 → 18.1                     | 1–2 → 0–1            |
| balanced-balanced / lab-muvry3p0    | 286/388 → 352/401     | 18 → 1             | 53.5 → 19.3                     | 1–0 → 2–0            |
| balanced-balanced / pr154-natural-b | 316/407 → 369/409     | 16 → 3             | 26.6 → 10.8                     | 0–0 → 0–0            |
| weak-strong / lab-muvry3p0          | 163/376 → 218/407     | 3 → 0              | 80.5 → 14.1                     | 0–1 → 0–1            |
| weak-strong / pr154-natural-b       | 154/381 → 247/411     | 8 → 3              | 119.4 → 10.5                    | 0–0 → 0–0            |
| high-press / lab-muvry3p0           | 193/288 → 317/398     | 20 → 4             | 57.0 → 20.1                     | 1–1 → 1–1            |
| high-press / pr154-natural-b        | 185/288 → 313/389     | 23 → 4             | 106.7 → 17.0                    | 3–0 → 0–0            |

Across these samples: 1702/2742 (62.1%) → 2491/3212 (77.6%); out-of-play passes 140 → 20. Risk-taking remains visible in lead/through/direct counts rather than being disabled. The balanced second seed has no shots after calibration: shot supply still needs wider playtesting.

| Supplied fixture   | Before | After  |
| ------------------ | ------ | ------ |
| home possession    | 54.68% | 56.57% |
| away possession    | 45.32% | 43.43% |
| Fouls              | 34     | 16     |
| Yellow cards       | 0      | 3      |
| Red cards          | 0      | 0      |
| Shots              | 7      | 6      |
| Challenge attempts | 149    | 78     |

The longest hold ending in the high-pressure band is 48.6 → 17.7 s. This is terminal-band classification, not sustained pressure for the entire hold. The bounded support observer's longest stationary interval at pressure ≥0.67 is 4.37 → 3.95 s. The all-pressure maximum falls 48.6 → 20.1 s. Free patience remains possible.

### All 22 public touch counts

| Side / player / role                       | Before | After |
| ------------------------------------------ | ------ | ----- |
| home / Jan Nowak / goalkeeper              | 6      | 9     |
| home / Filip Lis / left_back               | 39     | 46    |
| home / Piotr Król / center_back            | 9      | 20    |
| home / Piotr Lis / center_back             | 20     | 14    |
| home / Bartosz Dudek / right_back          | 38     | 48    |
| home / Tomasz Nowak / central_midfielder   | 33     | 20    |
| home / Mateusz Wójcik / central_midfielder | 11     | 21    |
| home / Michał Dudek / central_midfielder   | 8      | 16    |
| home / Jan Kowalski / left_winger          | 33     | 25    |
| home / Tomasz Baran / right_winger         | 19     | 20    |
| home / Igor Pawlak / striker               | 16     | 3     |
| away / Bartosz Sikora / goalkeeper         | 3      | 3     |
| away / Jan Krawczyk / left_back            | 30     | 38    |
| away / Mateusz Wójcik / center_back        | 9      | 11    |
| away / Adam Sikora / center_back           | 5      | 13    |
| away / Kacper Lis / right_back             | 28     | 32    |
| away / Mateusz Zając / central_midfielder  | 7      | 24    |
| away / Igor Baran / central_midfielder     | 13     | 30    |
| away / Bartosz Krawczyk / left_winger      | 22     | 23    |
| away / Tomasz Król / right_winger          | 27     | 17    |
| away / Oskar Lis / striker                 | 49     | 11    |
| away / Bartosz Baran / striker             | 16     | 3     |

### Intent-specific actual completion

| Side / intent      | Before | After   |
| ------------------ | ------ | ------- |
| home / support     | 84/96  | 107/128 |
| home / progressive | 4/8    | 10/11   |
| home / direct      | 13/15  | 14/17   |
| home / lead        | 6/36   | 47/49   |
| home / through     | 2/13   | 8/14    |
| away / support     | 73/92  | 75/102  |
| away / progressive | 5/14   | 21/25   |
| away / direct      | 3/3    | 1/3     |
| away / lead        | 7/20   | 24/26   |
| away / through     | 1/6    | 13/14   |

Top passing edges, complete per-player challenge/foul/card counters, role shares, shot IDs/distances, pressure/support evidence and natural ability buckets are retained in [before](performance/PR154-before.json) and [after](performance/PR154-after.json). Every after-shot aggregate distance equals its recorded diagnostic; baseline goal/restart aggregation included the reproduced distance drift.

### Paired attribute and actual-flight evidence

[Attribute matrix](performance/PR154-attributes.json): 740 band variants × 64 paired repetitions (47360 resolver evaluations); 148 contexts have monotonic adjacent-band mean distributions. This does not assert a guaranteed individual outcome.

[Actual flight/contact matrix](performance/PR154-pass-flight.json): 225 cells × 16 repetitions = 3600 physical flights; 45 intent/pressure/length contexts, no adjacent-band completion decrease and 0 unresolved flights. Only passer.passing varies; other attributes, receiver and matched seeds remain fixed.

| Passing | Completed / attempted | Mean execution error (m) |
| ------- | --------------------- | ------------------------ |
| 20      | 641/720               | 0.333                    |
| 40      | 644/720               | 0.292                    |
| 60      | 646/720               | 0.252                    |
| 80      | 652/720               | 0.211                    |
| 100     | 656/720               | 0.170                    |

Only 3/45 contexts strictly improve completion between endpoints; easy or receiver-limited cells plateau. Execution error improves across the matched bands without assigning a result.

[Observer evidence](performance/PR154-observers.json) records exact complete-state hash equivalence across normal/DEV/capture for both five-minute seeds. DEV also records replay windows; capture uses the actual MatchDebugRecorder with no video. Capture's full rankings are expensive (about 90 s CPU wall time per five-minute sample under concurrent work), and remain optional; this is not the normal background budget.

Validation: `VITEST_MAX_WORKERS=2 npm run verify` passed: 149 main test files / 1059 tests plus 5 full-career tests, lint and TypeScript/Vite build. Existing renderer/background tests pass. Vite retains its existing bundle-size and mixed-import warnings.

The final runtime optimization prunes defender ETA only when a proven fastest-travel bound
cannot beat the current exact physical ETA. The bound includes initial momentum, the contact
envelope and the estimator's horizon cap; surviving candidates retain the same acceleration/
turn microsteps. Randomized momentum/direction/pace regressions agree with exhaustive ETA,
and full-output reference hashes remain unchanged. Impossible advanced marking geometries
and already-observed solution IDs also exit early. These optimizations change no football law.

### Presentation, identity and repeated full-half evidence

[Policy/identity matrix](performance/PR154-policy-parity.json): eight five-minute runs combine key_player/full_match, normal/capture and controlled_autonomous/NPC. Statistics, canonical action timeline and behaviour fingerprints are identical across all eight. Complete state hashes are identical within each identity across observers/policies; controlled-ID metadata explains the difference between identities. No invariant failures or human interventions. Existing shared-resolver and replay tests cover the action/trajectory contracts.

### Isolated normal runtime

[Performance evidence](performance/PR154-performance.json): two identical 45-minute fixture runs per revision, fresh processes in interleaved PR153/PR154/PR153/PR154 order after other validation jobs stopped. Node v24.18.0, AMD Ryzen AI 7 350 w/ Radeon 860M .

| Revision | Run 1 (s) | Run 2 (s) | Mean (s) |
| -------- | --------- | --------- | -------- |
| PR153    | 22.63     | 25.85     | 24.24    |
| PR154    | 25.89     | 25.88     | 25.89    |

Normal runtime changes 6.8%. Each revision reproduces its complete 45-minute state hash exactly in both runs, including equivalence with detailed-observer calibration. Wall time includes a different, physically produced action mix (303 → 389 pass attempts). It excludes rendering, React, video and human response; capture overhead is reported separately. No deferred observer affects football decisions.

Earlier isolated grouped runs on the same final source measured 21.25 → 29.88 s (+40.6%); their raw times are retained. The normal path is slower in both samples. Host/JIT variance and the changed action mix limit this small comparison; no speedup, statistical-significance or browser-frame-budget claim is made. Further profiling is a remaining performance limitation.

## Remaining limits and next work

Eight half-matches and bounded resolver matrices establish regression evidence, not league
realism across every seed. Selection scores are heuristic; natural accuracy is confounded
by selected difficulty, receiver and opposition. Saturated easy micro cells can plateau.
Higher attributes do not guarantee the outcome of an individual attempt.

Headless timings exclude React, renderer, video and human response. Browser presentation
is protected by the existing background/renderer tests; this PR does not claim a new manual
full-match browser playtest. Support latency uses one-second diagnostic probes and retains
at most 256 episodes; detailed before/after latency should use the same observer version.
Keeper claiming remains bounded to the existing movement/contact architecture; comprehensive
keeper sweeps/cross tactics and broad league/foul/card realism need later calibration.

Full restart continuity/celebrations, stamina, injuries, substitutions and added time remain
outside this PR. Actual GitHub sequence: PR155 restarts, PR156 fatigue/injuries/substitutions/
added time, PR157 presentation/replay/stadium polish.
