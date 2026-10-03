# PR150 benchmark method and commands

## Deterministic fixture policy

`npm run benchmark:intent` uses the existing `createCalibrationSession` fixture factory,
the 25 ms canonical engine step and explicit DEV AI selections at actual player-opportunity
boundaries. It can dynamically import a pristine earlier checkout with `--engine-root`.
Generate world data and use the same dependency/runtime versions in both checkouts first.

The primary matrix contains twelve fixtures: balanced–balanced and weak–strong teams,
controlled central midfielder/left back/striker, and 45/90 canonical minutes, all with seed `a`.
The weak–strong fixture supplies the quality-asymmetry context. Seed `b` CM fixtures supplement
that matrix; repeats verify determinism rather than becoming independent football samples.

Run fixtures serially after the source is frozen. Browser/UI/test tasks, GC and process warm-up
can affect timing. Raw elapsed time and canonical speed remain useful context, but timing ratios
must be omitted where concurrent work or differing instrumentation prevents a controlled
comparison. Hashing/export happen after the throughput timer.

## Commands

From the PR150 checkout, a representative pristine-baseline run is:

```powershell
npm run benchmark:intent -- --engine-root=../baseline --minutes=45 --scenarios=balanced-balanced,weak-strong --seeds=a --position=central_midfielder --revision=PR149-main-feed7f1 --allow-known-failures=true --output=../benchmarks/before-intent-45-central_midfielder.json
```

The final matrix uses the current checkout and strict invariants. Give every frozen source
revision its own report identity; replace `PR150-final` below with the actual recorded revision:

```powershell
foreach ($duration in 45, 90) {
  foreach ($role in 'central_midfielder', 'left_back', 'striker') {
    npm run benchmark:intent -- "--minutes=$duration" --scenarios=balanced-balanced,weak-strong --seeds=a "--position=$role" --revision=PR150-final "--output=../benchmarks/after-intent-$duration-$role.json"
  }
}
```

Additional seed and deterministic/replay evidence can be collected separately:

```powershell
npm run benchmark:intent -- --minutes=45 --scenarios=balanced-balanced,weak-strong --seeds=b --position=central_midfielder --revision=PR150-final --output=../benchmarks/after-intent-45-cm-seed-b.json
npm run benchmark:intent -- --minutes=90 --scenarios=balanced-balanced,weak-strong --seeds=b --position=central_midfielder --revision=PR150-final --output=../benchmarks/after-intent-90-cm-seed-b.json
npm run benchmark:intent -- --minutes=10 --scenarios=balanced-balanced --seeds=a --position=central_midfielder --repeats=2 --revision=PR150-final --output=../benchmarks/after-intent-10-cm-repeat.json
npm run benchmark:intent -- --minutes=10 --scenarios=balanced-balanced --seeds=a --position=central_midfielder --replay=true --revision=PR150-final --output=../benchmarks/after-intent-10-cm-replay.json
```

Only baseline runs may use `--allow-known-failures=true`. That flag records violations explicitly;
it does not repair or suppress their values. Final runs stop on an invariant failure.

## Metric interpretation

Each fixture exports both teams' passes/completions, possession, shots, fouls/cards, offsides,
throw-ins/corners/free kicks; public player contacts/carries/workload; and the controlled player's
touch/pass/received shares. Network checks include each edge, each player and aggregate totals.
The report retains low shot samples, zero throw-ins/offsides and zero controlled sprint bursts.
These observations require context and investigation, not forced quotas.

PR149's reported touches are granular discrete contacts. PR150's touches are continuous public
control episodes. Their before/after difference demonstrates the statistical-definition change;
it must not be interpreted as an equivalent fall in actual physical ball involvement.

`promptsShown` counts explicit DEV opportunity resolutions. It does not count React menu renders
or reproduce a human's chosen sprint/dribble/retain sequence. `presentedEpisodes` estimates
existing canonical moment clusters at 4 Hz and at each decision under `key_player`; it does not
execute UI lead-ins, visibility windows, proxy decisions or episode aborts. Ratios use that
observation policy and cannot directly validate the manual playtest's 83 displayed prompts.
Manual interaction checks and persistent-intent regressions complement this deterministic policy.

Reception evidence includes outcome/quality distributions. New bounded online `receptionMotion`
summaries report moving/stationary receptions (0.7 m/s threshold), pre/post canonical-tick speed
and optional canonical `momentumRetention`, for all players and the controlled player. Those
speeds are adjacent tick snapshots, not exact substep contact velocities. PR149 has no canonical
retention metadata; old reports may also lack the velocity observation, so missing values remain
unavailable rather than becoming zero. A zero-sample retention summary has null mean/min/max.

The headless harness does not import/call a renderer, so its renderer-call count is zero by
construction. Separate observer-mode and render/replay parity tests provide independent evidence.
Replay observation must preserve the same canonical and statistics hashes as an equivalent
non-replay fixture. Same-seed before/after football outcomes can change legitimately.

## Compact integration evidence

The maintained `scripts/summarizePr150.mjs` utility collects all before/after
JSON reports and writes `docs/performance/PR150-results.json` with full fixture coverage,
provenance/hash fingerprints, explicit missing metrics, anomalies and comparisons. It retains
all measurements, uses the richer intent report when a readability report has the same canonical
hashes, and rejects conflicting same-fixture hashes. An unfinished source report is labelled
incomplete even when another source supplies that fixture's basic metrics. No favorable seed or
fixture is silently selected. The maintained `benchmark:intent` command regenerates raw evidence.

```powershell
node scripts/summarizePr150.mjs --directory=../benchmarks --before-revision=PR149-main-feed7f1 --after-revision=PR150-final --write=true
```

The utility defaults to `../benchmarks` relative to the repository and suppresses timing ratios.
Omit `--write=true` for a coverage and sizing dry-run. `--output` overrides the output path.
`--timing-comparable=true` is
appropriate only after confirming serial isolated execution with matching instrumentation.
Raw reports remain outside the repository; the committed compact evidence omits tick histories
and complete player ledgers. Its per-team player distributions use sorted order statistics
(median and the lower empirical 95th-percentile rank), rather than implying league percentiles.
The JSON uses compact serialization; reported rates, quality and velocity summaries have four
decimal places, while source and canonical SHA-256 fingerprints retain full precision.
