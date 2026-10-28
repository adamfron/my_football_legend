# PR202 proposal — Lean CI & Historical Evidence Preservation

This is a proposal, not a workflow migration performed in PR201. All 43 existing checks, assertions, original hashes and time limits remain required. PR201 unit contracts run in the existing main verification group; its lightweight receipt checks join the existing perception group. Its12 local exact-source cases run serially in the existing Windows platform job;14 new full-match replays and seven final-main canonical verifications join the seven existing Windows current-cohort jobs. No job is added and the original30/45-minute budgets remain.

## Measured starting point

PR200 final-head CI [run 40615970630](https://github.com/adamfron/my_football_legend/actions/runs/40615970630), head `27fc1a0cf3a2900df2415048e11c64983985b521`, completed 43/43 checks. Current groups are 3 verify + 4 historical checks + 3 PR198 source + 4 PR199 source + 12 PR200 local + 14 Windows complete-match + 2 platform probes + 1 quality gate. Every execution job installs dependencies separately. The connector returned only the first 32 job metadata entries; these measurements are a four-log sample, not exhaustive billing or a critical-path measurement.

| Sample | Whole job seconds | Measured payload | Implication |
| --- | ---: | --- | --- |
| Historical passing | 48.781 | Approximately 13.8s after database generation | Setup dominates this short group. |
| PR200 frozen-final | 188.454 | Approximately 159.4s source replay | Several local cases may share one install while retaining child-process isolation. |
| Verify main | 545.560 | Unit test duration 476.03s; lint/build also run | Keep this and fixed-budget career/integration workers separate initially. |
| SW/B current matches, Windows | 668.623 | Two complete state-hash replays approximately 588.5s | Match payload dominates; grouping must respect measured worst-case budgets. |

Timestamp extracts and job IDs are retained in [the audit receipt](performance/pr201/ci-audit-pr200.json). npm installation took roughly 3–8 seconds in these logs; full checkout, runtime setup and extraction also matter. No monetary bill is inferred from worker time, and hosted timing is not a local CPU benchmark.

## Concrete migration

1. Produce a machine-readable task manifest for every existing command/case, expected receipt, source archive, platform/Node edition, original timeout and required result. Enumerate each case once and assert that old and proposed manifests have identical coverage before changing scheduling.
2. Retain `quality` as the stable required gate, all three verify groups and both platform probes. Add no per-PR job family. Keep fast current-source unit/type/build/contracts and evidence integrity visibly separate from expensive exact historical execution.
3. Pack the 19 PR198/199/200 local source cases into a small set of balanced historical source groups, initially 4–6, only after measuring their sum, maximum RSS and slowest run. Share checkout and npm installation within a job; execute each original command in its own child process. Do not import all harnesses into one Node process: laboratory hooks, globals, module caches and private Git contexts are isolation requirements.
4. Measure all 14 Windows match groups. PR200 has six historical/current replays per fixture; PR201 adds two successor arms and one final-main canonical verification, for63 required full-match cases across seven fixtures. Remove the artificial current/historical job split only where all nine replays fit the existing45-minute limit with headroom. Target8–12 balanced Windows groups, conditional on measurements; a slow fixture remains split. Preserve the12 Windows local source cases and both platform probes as distinct tasks in the manifest, even when their setup is shared. Do not concatenate the entire matrix into one process or raise timeouts. Keep Windows/Node24.22.1 receipts exact; Linux checkpoint comparison remains separate.
5. Reuse a verified extracted source tree per `(base commit, source-manifest SHA256, archive SHA256, lockfile, OS, Node edition)` within a job. Verify archive bytes and every reconstructed source byte before use. Keep the tree immutable; each historical Git check gets a private index/work tree. Cache package downloads by lockfile and platform; never share platform-specific node_modules across systems.
6. Initially retain all four historical integrity groups. Merge only measured short groups where the unchanged 30-minute limit allows it. Avoid path filters that skip required evidence checks. Publication artifacts can preserve logs, receipts and task manifests, but cached results never substitute for executing required assertions.

The first packing stage would reduce the43-job surface to approximately22–28 jobs (ten unchanged verify/integrity/platform/quality jobs,4–6 local source groups and8–12 Windows match groups), subject to measured budgets. This is a scheduling target, not an acceptance criterion. Coverage and complete-state equivalence take precedence over the count.

## Acceptance and rollout gates

- Baseline all job/step durations and RSS on the existing workflow, including failed/time-out cases and setup/extraction cost. Preserve run IDs and runner/runtime editions.
- Assert task coverage equality and unchanged expected byte hashes. Scores and aggregate statistics cannot replace complete deterministic state hashes.
- Run the proposed grouping against frozen sources before switching required scheduling. Each original assertion must execute and fail on intentional receipt/source corruption; a failed/cancelled child must fail `quality`.
- Compare serial versus grouped results on both supported platforms and confirm that source trees, Git indexes and hooks do not leak between cases. Diagnose timing regressions before accepting the packing.
- Switch scheduling in PR202 only after parity; retain the original manifest and rollback grouping. Historical football failures remain failures even when CI reproduces them successfully.

Later additions register a case in the manifest and an existing budgeted group. A new job requires evidence that platform, isolation or timeout constraints make the existing groups unsuitable.
