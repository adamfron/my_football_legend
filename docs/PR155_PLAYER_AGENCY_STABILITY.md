# PR155 — Player Agency, First-Time Passing & Possession Stability

## Scope and baseline

Base: merged GitHub #154, `235caf8abe593fb7fa85911f0d12bbe5474973e0`.
PR155 stabilizes human shot ownership, one-touch passing, contested possession,
pressure support and central build-up. The planned sequence is now PR156 restarts,
PR157 fatigue/injuries/substitutions/added time, PR158 presentation/replay/stadium.
Full post-goal and restart choreography remains outside this change.

The supplied interactive half records Adam Krawczyk (`footballer_pro_9_12`) with
21 touches, 10 receives, 11 passes / 5 completed and 9 shots (5 human / 4 autonomous).
Those are supplied playtest facts. The original input tape was not supplied, so the
automated before/after comparison uses explicit highest-scored choices among surfaced
options, with option-ID tie breaking. It is a reproducible comparison on the supplied
seed/fixture, not a reproduction of the original clicks or their exact totals.

Both revisions use pro_9 home / balanced / 4-3-3 against pro_1 away / pressing / 4-4-2,
the same forced controlled CM and 45 canonical minutes. Three seeds are tested in four
fixtures: controlled player, autonomous observer, balanced/balanced and pro_9/pro_63
strong/weak. The latter two retain the native formations. The 45-minute limit is a
measurement window; full fatigue and added-time behavior are later work.

## Correctness fixes

- `resolveMatchAction` rejects every controlled `shot` and `header_shot` source except
  `human_selected` while player agency is enabled. This also covers DEV and the restart
  watchdog. A legal rejected shot requests a real decision; it does not change the ball,
  RNG index, action ledger or shot statistics.
- The pure agency probe reserves an NPC-preferred shot even when sparse relevance,
  a resolved signature/cooldown or presentation sensitivity would suppress a routine
  menu. Committed carry/control remains continuous. A committed incoming human shot
  retains its human source at actual contact. Explicit no-intervention mode still exists.
- Opposing aerial redirects previously called `changePossession` repeatedly while the
  bodies and ball still overlapped. A redirect now records contact/pass outcome only.
  Secure acquisition is separate. All participants in the resolved aerial envelope stay
  locked until real ball/body separation; action-ID changes cannot re-arm that envelope.
- Loose-ball acquisition nominates one candidate, holds that nomination while control
  is unresolved and resolves seeded ability/speed/contest-dependent control. Failure
  remains loose. Canonical possession and loss/recovery accounting change on secure
  control. Existing defensive-episode locks protect the secured pair.
- A nominated loose-ball runner targets the real intercept without distant formation
  blend/noise. The old blend could leave a stopped ball outside the collection radius.
  No telemetry filter suppresses genuine short possessions or tackles.

## First-time passing capability

`firstTimePassing.ts` reuses the ordinary target enumeration, space-pass plan,
launch plan, execution resolver, receiver movement, interception and accounting.
The shared incoming-contact forecast permits a low kick contact for either identity;
passing does not require the shot-only goal-facing envelope. Feet/support, lead,
through, requested-space and lofted delivery are supported. Physically incompatible
high contacts do not offer a foot pass. A first-time pass has no settled preparation
wait and retains the real incoming velocity/height.

First-time execution difficulty combines incoming speed/height, turn and distance
with the existing passing/technique/reading/composure weights. Ordinary passing
accuracy/error coefficients are unchanged. Human/NPC identity changes only the
decision owner and source label, never the physical ball result.

NPC compares a one-touch release with a **fresh** control, rather than the previous
carrier's already-completed scanning clock. Redirection/pressure/skill cost makes
routine control valuable; a useful first-time opportunity can still win. A routine
receive does not acquire a menu merely because first-time passing now exists.
Match-flow diagnostics count each first-time attempt/completion once by canonical
pass identity, with intent, source, incoming context, execution quality and outcome.

## Support and connectivity calibration

Normal tactical planning assigns at most five complementary jobs: escape, central
pivot, third man, width run and rest defence. Targets consider lane occupation,
receiver-marker clearance and displacement. The next midfield line can approach a
deep carrier from up to 46 m; other local support stays within 34 m. Stronger movement
towards the target creates an actual connection during scanning. These are positioning
jobs, with normal movement/orientation and onside constraints.

The escape prefers a second midfielder or a centre-back. Pulling the opposite fullback
into a central escape pocket created repeated fullback circulation in an intermediate
calibration; that assignment is removed. A support job also takes precedence over the
generic forward-run displacement. No pass utility adds a CM bonus, no contact share is
enforced, and no timer forces a pass. Existing late-lead protection and retention remain.
Learned build-up danger also shortens the support triangle while pressure is present;
this preserves physical PR151 adaptation even when movement weights already saturate.

Pressure support is a bounded 1 Hz observer (256 episodes). It reports stationary
high-pressure time, response latency after pressure onset, initial episode support
distances, final viable options, actual support-player displacement/lane clearance,
holding reason and second-presser assignment/latency. The second-presser latency means
the first observed cooperative assignment; it is not a separately measured movement
reaction time. This sampling resolution and bounded history limit precision.

Central diagnostics count distinct owner-possession/CM geometric lane opportunities
sampled at 1 Hz, and a release to another player despite such an available lane.
Availability means an open segment and plausible distance; it does not assert that
the CM was the tactically best option or guarantee a completed pass. Connectivity
reports canonical touch/receive shares and passing-edge concentration. Removed-player
roles in the legacy projection remain `removed`; per-player comparison retains initial
roles so red-card minutes do not silently turn a defender into an attacker.

## Reproduction

```powershell
# Run from the PR155 checkout, with dependencies installed.
git worktree add ../baseline-pr154 235caf8abe593fb7fa85911f0d12bbe5474973e0
npm run benchmark:stability -- --engine-root=../baseline-pr154 --matrix --revision=PR154 --out=.benchmark-artifacts/before.json
npm run benchmark:stability -- --matrix --out=.benchmark-artifacts/after.json
npm run benchmark:stability -- --pass-matrix --out=.benchmark-artifacts/first-time.json
npm run benchmark:intelligence -- --micro --out=.benchmark-artifacts/attributes.json

# Exact natural A/B snapshot, before the old opposed-header sequence.
npm run benchmark:stability -- --engine-root=../baseline-pr154 --player --minutes=24.6433333333 --seeds=pr155-natural-b --state-out=../pr155-contest-state.json --out=.benchmark-artifacts/contest-prefix.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/pr155Contest.ts

# Repeat for normal, dev and capture; observers must not change the canonical hash.
npm run benchmark:stability -- --player --minutes=5 --seeds=lab-muwhj3er,pr155-natural-b --observer=normal
$env:VITEST_MAX_WORKERS='2'
npm run verify
```

The baseline checkout needs access to the same dependency versions. The benchmark
asserts canonical player-statistics invariants on every completed run; DEV also asserts
flow invariants. Compact artifacts preserve per-player counters, team passing, edges,
long holds, pressure outliers, first-time context and complete canonical hashes.
Normal mode leaves uncollected flow counters null. No raw per-tick or video dump is committed.

## Validation and measured results

### Supplied seed: reproducible 45-minute player comparison

| Metric                                        |                PR154 |                 PR155 |
| --------------------------------------------- | -------------------: | --------------------: |
| Controlled touches                            |                    8 |                    15 |
| Controlled receives                           |                    4 |                    12 |
| Controlled passes (attempted/completed)       |                  6/6 |                  10/7 |
| Controlled shots (human/autonomous)           |              2 (1/1) |               4 (4/0) |
| Controlled carry intentions                   |                   12 |                    26 |
| Explicit surfaced choices                     |                   19 |                    41 |
| Home passes (attempted/completed)             |              177/164 |               119/100 |
| Away passes (attempted/completed)             |              229/189 |               282/252 |
| Whole-match shots/fouls/yellows/reds          |              3/2/0/0 |              9/11/2/1 |
| Micro spells <0.5 s                           |                    0 |                     5 |
| Adjacent-tick flips                           |                    0 |                     2 |
| First-time attempts/completions               |          uncollected |                 17/13 |
| Support response median / maximum (s)         |          0.90 / 2.45 |           1.00 / 2.00 |
| Maximum stationary high-pressure stall (s)    |                 3.88 |                  3.55 |
| Longest hold low / medium / high pressure (s) | 18.20 / 6.65 / 15.48 | 18.65 / 14.18 / 16.23 |

The above uses explicit scripted human choices. The supplied original interactive
21/10/9-shot half is separate evidence, as explained at the start. Team totals are
canonical player-statistic sums, including removed players. These five short spells
and two adjacent flips remain in the export; they are not filtered to claim zero.
The exact old same-pair aerial regression is tested independently below.

| Side / player           | PR154 touches / receives | PR155 touches / receives |
| ----------------------- | -----------------------: | -----------------------: |
| home CM 14              |                  29 / 19 |                  15 / 13 |
| home CM 12 — controlled |                    8 / 4 |                  15 / 12 |
| home CM 11              |                    3 / 2 |                   16 / 9 |
| home LB 7               |                  60 / 55 |                  21 / 13 |
| home RB 9               |                  41 / 39 |                  26 / 19 |
| away CM 12              |                  21 / 18 |                  22 / 19 |
| away CM 14              |                  47 / 31 |                  20 / 12 |
| away LB 7               |                  46 / 41 |                  61 / 54 |
| away RB 9               |                  50 / 48 |                  69 / 62 |

### Multiple-seed connectivity and remaining outliers

Home CM share of canonical touches, retaining initial roles:

| Fixture           | lab-muwhj3er before → after | natural-b before → after | natural-c before → after |
| ----------------- | --------------------------: | -----------------------: | -----------------------: |
| supplied-player   |               19.0% → 31.5% |            22.2% → 26.5% |            22.6% → 31.6% |
| supplied-observer |               26.2% → 18.5% |            25.9% → 21.6% |            25.2% → 28.6% |
| balanced-balanced |               26.0% → 24.9% |            27.1% → 33.6% |            32.5% → 17.2% |
| strong-weak       |               25.0% → 21.6% |            23.4% → 34.9% |            25.5% → 20.3% |

The player fixture improves on all three seeds. Other fixtures are mixed; central
participation and general football realism are **not solved**. Away fullbacks still
dominate several passing networks, and balanced natural-c retains a low CM share.
Long retention can remain useful; high-pressure holds are not forcibly capped.
Pressure-response samples are completed episodes >5 s with pressure onset, not all
possible receptions. All 148 supplied-after episodes record support displacement;
the 1 Hz probe limits latency precision. Full per-player counters, fifteen strongest
passing edges, central lane opportunities and pressure outliers are preserved in
[PR155-before.json](performance/PR155-before.json) and
[PR155-after.json](performance/PR155-after.json).

### Hard contracts and determinism

- All three 45-minute controlled cases have **zero autonomous controlled shots**.
  Five policies cover settled driven/placed/chip × four autonomous/DEV/watchdog
  sources, four incoming contact heights × five policies, and penalty/close-free-kick
  ownership. Committed first-time shots remain human at launch.
- First-time matrix: **960 cells / 3,840 executions**, five target intents × two
  deliveries × two speeds × two heights × two pressure distances × two facing
  angles × three passing bands × two sources, four repetitions. Physical human/NPC
  mismatches: **0**; unresolved flights: **0**; error monotonicity failures: **0**.
  Zero settled preparation holds for every cell. Four repetitions per cell do not
  establish a general completion-probability calibration.
- The exact pre-contact natural-b snapshot at **1478.600 s** replays 300 identical
  25 ms ticks: old adjacent flips **1 → 0**, aerial contacts **5 → 2**. Its original
  pro_1_21 / pro_9_5 path comes from the matched PR154 input policy; it is not the
  unavailable original click-tape snapshot at 559 s. The new replay repeats exactly
  by full state hash. A separate overlap fixture resolves once and re-arms after
  physical separation.
- Attribute micro-lab: **740 variants × 64 repetitions**, 148 contexts/groups.
  Every exported row is identical to PR154; monotonicity failures **0**.
- Two five-minute player seeds reproduce the entire canonical state exactly across
  normal, DEV and capture. Both revisions also match normal/DEV hashes over the
  supplied autonomous 45-minute half. Two complete 2,400-tick telemetry references
  retain every field/identity/invariant and repeat in focused validation and verify.
- `VITEST_MAX_WORKERS=2 npm run verify`: **exit 0**, **1095 main + 5 career tests**,
  lint and production build. New benchmark scripts also pass explicit TypeScript
  checking. Renderer/background lifecycle regression tests pass; no browser/3D
  runtime measurement was made. Existing bundle-size/dynamic-import build warnings
  remain. No test timeout was extended.

Artifacts:
[validation](performance/PR155-validation.json),
[contracts](performance/PR155-contract-tests.json),
[contest](performance/PR155-contest.json),
[first-time matrix](performance/PR155-first-time.json),
[attributes](performance/PR155-attributes.json),
[observer parity](performance/PR155-observers.json).

### Performance

One sequential normal/headless supplied-observer 45-minute pair, after the other
benchmark and verify processes completed: **15.3 → 16.8 s**
(**9.3%** change). Full normal/DEV state hashes match
for both revisions. This is a descriptive pair with different football trajectories,
not evidence of a causal optimization or a browser/video cost estimate. Full matrix
timings include concurrent verification and are labelled accordingly. The added
agency ranking is shared within each pure probe, and an incoming contact forecasts
future samples only when the current physical sample fails. The existing 25 ms
step and 10 Hz tactical schedule remain. Evidence:
[PR155-performance.json](performance/PR155-performance.json).
