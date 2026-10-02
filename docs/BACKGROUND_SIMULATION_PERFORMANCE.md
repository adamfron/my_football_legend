# Background Simulation Performance — PR146

The only football authority remains `matchSimulation`, at **0.025 s**. No frequency, contact,
passing, shooting, role, agency or fatigue calibration is part of this change. Observer modes
and wall-clock budgets change work surrounding that engine, never football decisions or RNG.

## Reproducible measurement

`npm run benchmark:performance -- --minutes=10` runs one controlled-player canonical match for
each of `release_minimal,normal,dev,capture`. Explicit deterministic DEV choices resolve human
opportunities at their exact tick. Fixed squads/tactics and seed are recorded. Long benchmarks
are explicit: use `--minutes=45` or `--minutes=90`, with `--modes=dev` for one mode.
`--output=path.json` saves the structured report; `--export-dir=directory` additionally measures
actual evidence writes. No Three.js rendering, requestAnimationFrame or wall-clock football occurs.

Five-minute buckets retain actual canonical duration, elapsed work, speed, tick/batch counts,
p50/p95/p99, process heap/RSS and important collection sizes. `--assert-age-ratio=3` explicitly
fails catastrophic late/early cost growth; it is a manual ratio gate, not a millisecond CI test.
Batch timing excludes yield waits and final export. Browser scheduling/decision-to-commit metrics
are separately exposed in the Lab; headless throughput is not a browser wall-time guarantee.

Profiling is external to canonical snapshots and disabled spans make **zero clock calls**.
Sampling every 37 ticks avoids aliasing the four-tick tactical cadence. Categories distinguish
canonical step, movement, ball physics, tactical planning, action resolution, interception/ETA,
statistics/contact evidence, agency, MatchMoment, context, diagnostics and rolling capture.
Spans are **inclusive**: ETA/contact subtotals overlap their parents and must not be summed as
exclusive percentages. Benchmark event hashing is its own observer cost. Full-state hashing
and packaging/serialization/file saving occur outside simulation timing.

## Observation modes

| Mode                | Mandatory football/statistics/agency | Moment + context                        | DEV flow/diagnostics | Rolling JSON                      |
| ------------------- | ------------------------------------ | --------------------------------------- | -------------------- | --------------------------------- |
| RELEASE_MINIMAL     | yes                                  | omitted only in headless cost isolation | no                   | no                                |
| NORMAL_PRESENTATION | yes                                  | yes                                     | no                   | no                                |
| FULL_DEV            | yes                                  | yes                                     | yes                  | no                                |
| DEBUG_CAPTURE       | yes                                  | yes                                     | yes                  | yes, real existing 40 Hz recorder |

Playable Lab modes always preserve exact agency, moments and the PR143 context buffer, including
the release-minimal selection. The headless A row isolates canonical release cost; B represents
normal playable background support. Canonical last-contact/pass/shot records, locomotion totals
and statistics are not DEV-only and are retained in every mode. WebM is separate, explicit
browser opt-in; it never records a hidden stale pitch as current football. Its headless cost is
reported **unmeasured**, rather than zero. Mode coverage is included with browser exports because
DEV histories can be partial after an observation-mode change.

## Measured causes and changes

Frozen baseline: verified main after PR145, `fb48abbf03a97af7e69a2fe4d787f6933c2318b9`, with
observer-only profiler brackets added before optimising. Environment: Windows, Node 24.18.0,
AMD Ryzen AI 7 350, 16 logical CPUs, about 24.8 GB RAM. JIT, GC, thermal state, browser and machine
load affect times. Final comparisons must run sequentially; concurrent exploratory runs are
hash evidence only. The user's real Lab sample (625 s for 2344 canonical s, 3.75×, projected
1440 s hidden 90) motivates the work but is not directly comparable to a headless process.

The initial controlled-player DEV 10-minute run took **32.846 s** (18.27×). Its 0–5-minute bucket
took 11.864 s (25.29×); 5–10 took 20.981 s (14.30×), a **1.77× late/early cost ratio**. Progressive
slowdown is confirmed in this seed. Sampled inclusive costs were approximately 17.1 s flow,
6.2 s agency, 5.7 s MatchMoment and 3.8 s canonical step. Context cost was 138 ms, **0.42%**.

The concrete match-age cause was whole-history `structuredClone` plus full Zod validation on
every flow tick, historical ID/outcome scans and immutable copies of every statistics ledger.
Flow also built four complete hull/team-shape projections per tick to read four occupancy
counters, and recomputed flank relationships for each player. The old real browser additionally
constructed a full debug frame every tick even when JSON was never exported.

- Statistics now share inert immutable ledgers/network, append only on new evidence, and use
  external WeakMap membership indexes. Full history and PR145 exactly-once definitions remain.
- Flow uses event-level copy-on-write, incremental branch-safe identity/outcome indexes and
  the exact narrow occupancy/flank projections. Full schema/invariant checks remain at export
  and in tests; bounded scalar/new-event checks run during observation.
- An exact negative agency result can be passed as `null` to MatchMoment. Previously an
  explicitly supplied `undefined` triggered its default argument and repeated the whole probe.
- Normal gameplay pays for required presentation evidence. Expensive diagnostic recording
  runs only in capture; video runs only when selected. Hidden React publication is coalesced
  to 250 ms, with decisions, phase/period changes, scores and errors published immediately.
  The imperative canonical state is never overwritten by an older displayed React snapshot.
- Collapsed inspector content is lazy; hidden display-clock updates are coarse; halftime and
  full-time stop recurring tasks instead of processing frozen snapshots indefinitely.

An isolated core/statistics before/after 10-minute spectator fixture improved 3.105 → 2.722 s.
Sampled statistics fell 332 → 149 ms; the entire canonical hash remained
`138192b16f27122bc7fa96a6fd093fe5e8915816c516f31ac816e01186af83fa`.
An identical 60-second flow fixture reduced flow 437.06 → 35.11 ms (12.45×); two independent
60-second seeds retained every exported telemetry value and array order. These short isolates locate
gains; the longer matrix below establishes the final throughput and remaining limits.

## Collection ownership

| Collection                                        | Needed history / retention              | Hot-path policy                                                      |
| ------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Canonical contacts/pass/shot/carry/possession IDs | full match exactly-once evidence        | share unchanged arrays; private membership index                     |
| Canonical player statistics                       | 22 accumulators                         | update totals incrementally; no historical replay                    |
| Canonical passing network                         | observed player pairs                   | copy/update on a pass event only                                     |
| Last pass/shot/contact/restart records            | current football evidence               | retained regardless of mode; no global diagnostic history            |
| Tactical schedule                                 | one semantic key/time                   | unchanged 10 Hz + immediate invalidation; report reuse/recompute     |
| DEV spell/pass/action/shot histories              | full observed segment, optional         | append/update on events; cursors/indexes avoid tick rescans          |
| DEV intervals between surfaced moments            | full observed segment, optional         | append on new moment; nested array not separately counted in buckets |
| PR143 context                                     | 10 Hz, 6 s, <=62 samples                | retained and measured, no renderer                                   |
| MatchMoment candidates / agency diagnostics       | bounded episodes/current semantic entry | no whole-match scan                                                  |
| Rolling debug JSON                                | canonical last 10 s, armed ±10 s        | capture only; costly contextual frames remain explicitly measured    |
| Replay frames                                     | visible canonical last 10 s             | no hidden replay/render work                                         |
| Positioning samples                               | at most 6000 samples                    | DEV only, 1 canonical Hz                                             |
| Runtime/presentation diagnostics                  | bounded recent evidence                 | preserve pinned first fatal crash package                            |

WeakMap caches are not serialized, consumed by football, or accumulated in a global permanent
Map. Reobserving an old snapshot rebuilds isolated indexes, protecting branch/retry correctness.
Event histories intentionally retain a full finite match; GC measurements are process indicators,
not exact allocation counts or proof that a heap sample is a leak. No canonical snapshot is mutated.
Appending new immutable evidence still copies its history, and a new statistics identity-array
version builds a new membership index. This remaining event-frequency cost depends on match age;
the removed problem was doing that work on every routine tick. Private WeakMap entry counts cannot
be enumerated. The planning report counts schedule recompute/reuse, not ETA/pass memoization hits;
no new football-geometry cache or invalidation rule is introduced.

## Final longitudinal/matrix evidence and verification

All final runs are sequential, with tests and the actual browser smoke stopped. Seed:
`pr146-performance:balanced:a`, fixed clubs 0/1 and a controlled central midfielder, batch 20,
profiler enabled at 1/37. Frozen A/B were repeated sequentially. Original DEV/capture 10 and DEV
45 were measured before optimisation; the DEV 45 baseline had brief overlap with exploratory
work, so it is not a perfectly isolated timing experiment. Its growing history work and the
8.36x bucket degradation are also supported by the separate observer measurements/tests.
Concurrent exploratory optimized timings are excluded from this report.

### Same 10-minute match, before/after

| Mode              | PR145 work seconds | PR146 work seconds | PR146 canonical speed | Late/early cost ratio | Batch p50 / p95 / p99 ms |
| ----------------- | -----------------: | -----------------: | --------------------: | --------------------: | -----------------------: |
| A release_minimal |             12.642 |             12.229 |                49.06x |                  1.40 |     4.20 / 32.01 / 79.45 |
| B normal          |             20.750 |             13.213 |                45.41x |                  1.18 |     4.47 / 32.58 / 80.29 |
| C dev             |             32.846 |             14.358 |                41.79x |                  1.14 |     4.90 / 37.05 / 86.45 |
| D capture         |            119.058 |             77.813 |                 7.71x |                  1.21 |  58.35 / 136.74 / 245.47 |
| E video           |         unmeasured |         unmeasured |          browser only |                     — |                        — |

There is only a small total gain in the minimal mode on this controlled-player fixture; mandatory
agency geometry now dominates it. Normal gains 1.57x, DEV 2.29x, capture 1.53x. The much larger
long-match DEV gain below comes from removing match-age work. Old browser defaults included
capture cost; PR146's normal mode deliberately pays only for required gameplay/presentation.

D's sampled `debug_capture` cost is 64.08 s: construction 63.75 s inclusive, internal JSON
roundtrips/comparisons 6.05 s nested, retention/events 0.289 s. This is collection work even if
the user never exports. One completed 9,932,819-byte evidence file costs 24.78 ms packaging,
53.43 ms serialization and 14.06 ms saving, measured separately. Normal context costs 61.9 ms
(0.47%), writes 6000 samples at 10 Hz and retains 61, below capacity 62. Planning reuses 74.2%
of schedules; semantic invalidation and 10 Hz cadence are unchanged.

The quick matrix has all six canonical evidence values exactly equal across A-D and frozen
PR145 A-D, including full state, players, statistics, major-event stream/count and randomness
evidence; each mode selects the same three human inputs. Capture keeps the real 40 Hz recorder
and 401 rolling frames. D90 would cost approximately 700 s from this sample and was not run;
the final full-90 matrix covers A-C. No video encoding performance result is claimed.

### Representative 45-minute DEV comparison

| Measure                              |            Frozen PR145 |                PR146 |
| ------------------------------------ | ----------------------: | -------------------: |
| Canonical seconds / ticks            |           2700 / 108048 |        2700 / 108048 |
| Work seconds / canonical speed       |         466.186 / 5.79x |      62.153 / 43.44x |
| Ticks per real work second           |                     232 |                 1738 |
| Batch p50 / p95 / p99 ms             | 79.79 / 182.19 / 216.88 | 5.18 / 33.92 / 60.98 |
| Estimated hidden 45 / 90 s           |         466.19 / 932.37 |       62.15 / 124.31 |
| Late/early cost per canonical second |                   8.36x |                1.48x |

Pending physical resolution at the period boundary accounts for the extra 48 ticks; canonical
time clamps at halftime in both versions. The exact same four human inputs and all six final
hashes remain equal. Full state SHA-256:
`d0b8cc05a8ed97b4f2d933614838abbd45167a83e4d3e8e8333261e2ab5a9c8b`.

| Canonical minutes | PR145 work s | PR146 work s |
| ----------------- | -----------: | -----------: |
| 0–5               |        11.71 |         5.49 |
| 5–10              |        19.09 |         7.44 |
| 10–15             |        26.85 |         7.01 |
| 15–20             |        30.93 |         5.51 |
| 20–25             |        47.25 |         6.73 |
| 25–30             |        68.99 |         7.01 |
| 30–35             |        72.99 |         6.76 |
| 35–40             |        90.44 |         8.10 |
| 40–45             |        97.94 |         8.11 |

The resulting total improvement is **7.50x**. Sampled inclusive flow falls 360.7 → 6.13 s
(about 58.8x in this long fixture), from 77.4% to 9.9% of batch work. Mandatory agency is now
35.8 s (57.6%), canonical step 21.2 s (34.1%, includes 1.99 s statistics); nested ETA is 30.0 s.
These costs overlap, so percentages are not an exclusive pie chart. Context sample work is
291 ms (0.47%, measured context-history sample work; the inclusive profiler reports 383 ms),
confirming that deleting the PR143 buffer would address the wrong bottleneck.

Both 45-minute versions finish with 1959 contact IDs, 865 DEV pass outcomes and 239 possession
spells: event evidence was retained, not reduced to buy speed. Context stays at 60–61 samples
and clears at the period boundary. PR145 sampled heap is 85–154 MiB / RSS 284–351 MiB; PR146
heap is 101–263 MiB / RSS 302–456 MiB. The faster run does **not** demonstrate lower peak memory.
GC brings its sampled heap back to about 101 MiB at halftime; samples fluctuate rather than
proving a leak. A memory cap or exact allocation/GC-pause reduction is not claimed.

### Full 90-minute final matrix

| Mode            | Work seconds |      Speed | Ticks/s | Batch p50 / p95 / p99 ms | Late/early cost |
| --------------- | -----------: | ---------: | ------: | -----------------------: | --------------: |
| release_minimal |      117.901 |     45.80x |    1833 |     4.81 / 31.77 / 69.32 |           1.51x |
| normal          |  **108.360** | **49.83x** |    1994 |     4.35 / 30.23 / 63.00 |           0.98x |
| dev             |      121.804 |     44.33x |    1774 |     4.66 / 32.61 / 75.08 |           1.09x |

All complete at 5400 s / `full_time`, 216107 fixed ticks, score 0-5, nine identical inputs
and 4570 major events. All full-state/player/statistics/event/RNG hashes are exactly equal.
Each 2700 s checkpoint also equals the frozen PR145 DEV45 hashes and its four inputs.
Full final state SHA-256:
`47ef2e899a0016fee2b2983951e2eb0b7c11e86e634fbb54e8b3a1e96abb1156`.
Single-run differences/JIT/GC mean B's lower time than A is not evidence of negative observer
overhead. Modes run in A/B/C order in one process; no formal repeated statistical trial is claimed.
All explicit `--assert-age-ratio=3` checks pass. No full frozen PR145 DEV90 or final D90 was run.

| Minutes | A work s | B work s | C work s |
| ------- | -------: | -------: | -------: |
| 0–5     |     5.38 |     6.45 |     6.33 |
| 5–10    |     7.15 |     6.75 |     7.62 |
| 10–15   |     8.09 |     6.40 |     7.04 |
| 15–20   |     5.63 |     5.04 |     5.60 |
| 20–25   |     6.37 |     6.13 |     6.85 |
| 25–30   |     6.88 |     6.51 |     6.99 |
| 30–35   |     6.37 |     6.04 |     6.57 |
| 35–40   |     5.81 |     6.01 |     6.37 |
| 40–45   |     6.68 |     7.04 |     7.24 |
| 45–50   |     5.33 |     5.32 |     5.67 |
| 50–55   |     6.95 |     4.82 |     8.08 |
| 55–60   |     7.76 |     4.82 |     8.03 |
| 60–65   |     5.99 |     4.38 |     5.93 |
| 65–70   |     6.39 |     6.38 |     6.65 |
| 70–75   |     6.86 |     7.33 |     7.31 |
| 75–80   |     5.70 |     6.09 |     5.92 |
| 80–85   |     6.42 |     6.54 |     6.69 |
| 85–90   |     8.14 |     6.32 |     6.90 |

Normal90's main sampled costs: agency 70.23 s, canonical step 40.32 s, nested ETA 51.92 s;
moment 0.778 s, context 0.629 s inclusive / 0.475 s sampler work (0.44%). Future measured
performance work should investigate exact same-state agency/ETA reuse before changing football.
Planning reuse stays 74.18%; one schedule is retained. Final canonical ledgers contain 4075
contacts, 1789 pass attempts, 1780 results, 108 carry IDs, 22 players and 149 network edges.
DEV retains 499 spells, 3518 tempo samples, 1998 ball holds and eight shot diagnostics. No
renderer calls occur. Normal context stays <=62 and clears at full time; 54027 samples were written.
Normal90 heap samples span 69–265 MiB, peak sampled RSS 495 MiB; DEV 63–314 MiB / 508 MiB.
These are process snapshots, not a claimed memory cap. All numerical evidence is checked in:
[performance/PR146-results.json](performance/PR146-results.json).

Commands used on the final verified source:

```sh
npm run benchmark:performance -- --minutes=10 --modes=release_minimal,normal,dev,capture --revision=pr146-verified-working-tree --output=work/performance-after-final-10.json --export-dir=work/performance-evidence-10 --assert-age-ratio=3
npm run benchmark:performance -- --minutes=45 --modes=dev --revision=pr146-verified-working-tree --output=work/performance-after-final-dev-45.json --export-dir=work/performance-evidence-45 --assert-age-ratio=3
npm run benchmark:performance -- --minutes=90 --modes=release_minimal,normal,dev --revision=pr146-verified-working-tree --output=work/performance-after-final-90.json --export-dir=work/performance-evidence-90 --assert-age-ratio=3
```

### Verification and actual browser smoke

`VITEST_MAX_WORKERS=2 npm run verify`: **exit 0**, ESLint, **116 files / 720 main tests**,
**1 file / 5 full-career tests**, TypeScript and Vite build (**275 modules**). Worker limit is the
same local PR145 configuration; no timeout or assertion was weakened. Existing nonblocking
warnings: Node experimental transform types, mixed static/dynamic `careerStorage` import,
bundle >500 kB. `git diff --check` passes.

Tests cover frozen branch snapshots, ledger iteration counts, complete two-seed PR145 telemetry
hashes, A-D canonical equality, profiler/batch invariance, zero disabled clock calls, context and
capture bounds, exact hidden decision stopping, React-render rollback prevention, immediate
period publication, frozen period scheduling, last-valid crash tick and hidden layout warnings.

One actual browser `key_player` smoke (`pr146-ui-smoke`, controlled Jan Sikora, normal) reached
`awaiting_player_decision` at **24:36.150**, with equal canonical/display time, ready renderer,
Runtime OK, **0 background renderer calls**, no console errors and 11.4 ms maximum decision-to-
commit. It recorded 160 hidden publications for 1436.3 hidden canonical seconds, 32.8 s batch
work and 9.71 s scheduling waits. It ran during verification CPU load, so these are correctness
and scheduling evidence, not a comparable throughput measurement. The final hidden-only warning
fix was checked after hot reload. No full 90-minute interactive playtest or WebM cost test ran.
UI exports count publications/waits/max commit latency, not precise React CPU/GC attribution.
Mixed-mode DEV rates use nominal canonical duration; interpret them with exported coverage,
not as complete-session rates. Full canonical statistics/network remain separate and complete.

## Product budget and deferred work

Hidden-90 throughput must leave the 240–360 s playable budget room for visible context, actions,
replay and human choices. Subtracting measured hidden time gives an **estimated remaining budget**;
it does not prove a complete interactive 4–6-minute playtest. Human thinking, chosen presentation
windows, browser yields and video encoding still need representative interactive measurement.
Normal's measured 108.36 s meets the hidden-90 <300 s milestone in the headless harness and
leaves **131.64–251.64 s** of the 240–360 s budget for those costs. A/C also meet the milestone.
This is a credible measured engine budget, not proof of complete browser gameplay duration.

The remaining expensive operation in capture is the existing full diagnostic snapshot/probe/AI
ranking per tick; gating it removes release cost without deleting useful incident evidence.
Further optimisation must preserve exact snapshot meanings and be independently measured.
Rules/discipline are PR147 NEXT. PR148 owns possession rhythm, role/attribute-driven wide
combinations and the overlap completion funnel; PR149 owns animation/replay/stadium work.
Fouls/cards, rhythm/decision-density retuning, new shot styles/curl/Magnus, stamina/fatigue,
substitutions, attacking-role redesign, weather, ball textures and ceremonies remain deferred.
