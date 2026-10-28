# PR202 — Lean CI and preserved historical evidence

Research change: scheduling and evidence accounting only. Local result: four measured source groups replace nineteen setup/install jobs, targeting 28 total jobs. Integration effect: no MatchEngine, profile, input, football result, receipt, original source archive or expected full-state hash is changed. Promotion decision: unchanged from PR201, `RETAIN_EXPERIMENTAL`, candidate `NOT_READY_FOR_PROMOTION`, canonical NOT READY, B default, independent confirmation sealed. Next dependency: PR203 receives the same football limitations and replay corpus.

## Rollout and final-head verification

The original 43-job workflow remained required during source packing trials. [Rehearsal 40784091754](https://github.com/adamfron/my_football_legend/actions/runs/40784091754), head `f1685607c5a5c93cb6404e47cd7a2b179cac1291`, passed all four proposed groups on both Linux and Windows (8/8) before activation. The nineteen Linux source jobs now share four setups. All fourteen Windows full-match groups, three verify groups, four historical integrity groups, both platform probes and the stable `quality` check remain required. Limits stay 30/45 minutes. Temporary rollout workflows are removed.

The final head executes all 124 original commands plus the stable gate, with the same 63 complete-match cases. Its exact checkout SHA, manifest SHA256, individual command results/times and observed process resources are published in the `pr202-*` CI artifacts. The PR description records the final head/run, complete check status and any retry; a prior-head success never substitutes for a final-head check. `npm run ci:manifest`, the deterministic workflow check, failure contracts and the original-harness corruption probe run in the required main verification job.

## Reproduce and rollback

`npm run ci:manifest` regenerates the inventory in memory and checks it against the frozen PR201 task inventory. `npm run ci:contracts` rejects missing/duplicated cases, mixed platforms/budgets, receipt/archive corruption and failed or killed children. `npm run ci:group -- --group=source-01` runs the original commands in separate child processes, retaining per-task wall time, individual Node CPU/peak RSS, runtime, head and exit status under `.benchmark-artifacts/pr202`. The remaining groups are `source-02` through `source-04`. `--layout=original --group=pr198-source:receptions` reproduces an original group. Windows can use `--platform-parity` for the four source groups only; production platform requirements remain explicit.

`node scripts/ci/renderWorkflow.mjs --rollback` restores 43 execution/gate jobs and the original `quality` dependencies, retaining the private PR201 checker context needed while the new tooling exists. The prepared [ci-rollback.yml](performance/pr202/ci-rollback.yml) is equivalent. The exact historical [ci-pr201.yml](performance/pr202/ci-pr201.yml) remains immutable and supports a complete revert of PR202. Never restore historical football evidence from a newly generated result. Original archives and complete deterministic state hashes remain authoritative.

## Measurements and limitations

| Required scope | Before jobs | After jobs | Platform / unchanged limit |
| --- | ---: | ---: | --- |
| Unit/build, integration, career | 3 | 3 | Linux / 30 min |
| Historical integrity | 4 | 4 | Linux / 30 min |
| PR198/199/200 local source execution | 19 | 4 | Linux / 30 min |
| Complete historical/current matches | 14 | 14 | Windows / 45 min |
| Platform probes, including PR201 local execution | 2 | 2 | Linux + Windows / 30 min |
| Stable `quality` | 1 | 1 | Linux / 30 min |
| **Total** | **43** | **28** | **All original tasks required** |

The inventory contains 124 original execution commands plus the explicit stable-gate contract. Its 144 case records cover 20 PR198 locals, 28 PR199 locals, 12 PR200 locals, 12 PR201 locals, two platform checks, 63 full-match executions and seven final-main proof receipts. [coverage-equivalence.json](performance/pr202/coverage-equivalence.json) has identical before/after task-definition SHA256 `6c08d7171556632048b33e306b739a3477b7b08e6fc9b1623b4ef8d47b9126da`. JSON Schemas accompany the task inventory, equivalence proof and telemetry formats.

[baseline-jobs.json](performance/pr202/baseline-jobs.json) records every job and step for PR201 run 40733773018, both attempts, including the WW/H cancellation. The second attempt contains carried successful jobs; these are not extra executions. Its `quality` result is success. Timestamp resolution is one second. The original workflow did not record peak RSS; that measurement is unavailable, not zero. PR201 development receipts contain separate process measurements and are not treated as hosted CI resource bills.

The nineteen source payloads sum to 3,213 seconds. Greedy whole-command packing gives groups of 802, 799, 805 and 807 seconds before setup. These are baseline predictions, not newly measured grouped durations. Checkout, setup, extraction, instrumentation and output publication remain part of the real job budget.

The first successful Linux grouped execution retained all four raw telemetry ZIPs in `performance/pr202/trials/`. Its measured results are:

| Group | Predicted payload s | Actual group execution s | Observed Node CPU s | Maximum observed Node RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| source-01 | 805 | 931.39 | 1121.60 | 971.61 |
| source-02 | 807 | 854.20 | 1046.05 | 1630.76 |
| source-03 | 802 | 830.49 | 934.54 | 592.39 |
| source-04 | 799 | 787.07 | 948.85 | 836.72 |

The 3,403.14-second grouped payload is 5.9% above the earlier 3,213-second serial payload sample; these runs have different hosted load and include new instrumentation. Setup reduction, rather than a faster simulation, is the intended saving. Node CPU is the sum of observed process CPU times. RSS is a single observed process maximum, not aggregate simultaneous process-tree memory. Archived wrappers that deliberately replace `NODE_OPTIONS` can omit descendant observer samples; GitHub step/job durations still cover their whole execution. No missing sample is reported as zero memory.

The completed second rehearsal, [run 40784091754](https://github.com/adamfron/my_football_legend/actions/runs/40784091754), passed **8/8** groups before the scheduling switch. Its exact ZIP bytes and API job/artifact metadata are retained under `performance/pr202/trials/`.

| Group | Linux execution s / peak Node MiB | Windows execution s / peak Node MiB |
| --- | ---: | ---: |
| source-01 | 914.60 / 971.76 | 981.03 / 866.88 |
| source-02 | 631.96 / 1635.83 | 742.38 / 1497.27 |
| source-03 | 607.53 / 680.00 | 933.49 / 578.85 |
| source-04 | 445.58 / 690.54 | 853.86 / 495.29 |

| Changed Linux source family | Before (19 jobs) | After rehearsal (4 jobs) |
| --- | ---: | ---: |
| Whole-job runner seconds | 8,139 | 3,600 |
| Checkout seconds | 4,620 | 766 |
| npm installation seconds | 110 | 18 |
| Sum of per-job minutes rounded upward | 143 | 61 |
| Observed span from first start to last completion | 1,640 s | 1,374 s |

This is a **55.8% observed reduction in runner-seconds for the changed source family**, not a guaranteed whole-workflow speedup. The second Linux payload sum is 2,599.67 seconds; the first rehearsal's slower result is preserved above. Different runner load/setup dominates comparisons. Per-workflow dependency installations fall from 42 to 27; unchanged Windows jobs remain a large cost. Reproduce the table with `node scripts/ci/compareMeasurements.mjs docs/performance/pr202/source-before.json docs/performance/pr202/source-after.json work-comparison.json`. Input hashes and qualifications are in [source-comparison.json](performance/pr202/source-comparison.json).

Full-match consolidation is deliberately deferred: the current and historical payloads for a fixture can exceed 45 minutes together, even before setup. A failed inherited WW/H job spent 1,188 seconds in checkout. Packing every fixture's nine replays into one job is therefore rejected. Fewer jobs is subordinate to verified budgets.

[rejected-match-packing.json](performance/pr202/rejected-match-packing.json) gives all seven nine-replay budget calculations. Six payloads alone exceed 2,700 seconds; the remaining SS/B payload is 2,518 seconds and has insufficient setup headroom. These are rejected plans based on measured commands, not falsely labelled executed combined jobs. A single group containing all nineteen local source commands is also rejected: its 3,213-second payload already exceeds 1,800 seconds.

GitHub's timing API reports zero billable worker milliseconds for the baseline and successful rehearsal. This is retained as API evidence, not inferred from wall time. No dollar invoice or artifact/storage bill is exposed, so no monetary saving is claimed. Rounded worker-minutes above are resource accounting, not billable minutes.

## Source isolation

Each original command still starts a separate process. Archived harnesses retain their original per-case source reconstruction, byte checks, loaders, laboratory hooks, module caches and private historical Git contexts. Setup and dependency installation are shared within each new source group. Extracted runtime trees and `node_modules` are not cached across jobs or platforms. Reusing immutable extracted trees is deferred: changing the source reconstruction protocol would add risk without evidence of a material gain in this migration. No result cache substitutes for an assertion.

The manifest binds each explicit source/match case to receipt bytes, archived source bytes, manifest fingerprint, source base, platform, Node edition and original timeout. It preserves the seven final-main PR200 runtime proofs as well as the older canonical metadata receipts. Historical integrity commands and their post-execution Git diff checks are preserved verbatim.

PR201's checker also asserts its historical workflow family list and report source fingerprint. It now executes verbatim in a private materialized PR201 context, with a private Git index/work tree. Current engine and original harness bytes are independently required to match merged PR201; original evidence must remain unchanged. The old scheduling assertion is preserved there, while the new manifest and deterministic workflow renderer assert the new scheduling. No historical report is regenerated with a new source fingerprint.

## Retained failed trials

- Run 40781432306 / head `2341420e7f0a59a5f2e0fd913a748d9ff4c002a6`: Windows stopped before replay because checkout converted the new frozen manifest to CRLF. The expected raw-byte hash correctly failed. New PR202 evidence receives scoped `-text` Git attributes; original evidence attributes are unchanged. A representative raw log is retained under `performance/pr202/trials/`.
- Run 40781432277 on the same head: the original PR201 summary guard rejected a changed research-tool inventory fingerprint after adding CI tooling. Its historical summary and exact check are retained; execution moves into the source context described above, and current runtime/coverage remain checked separately. The failed log is retained.
- A local private-context prototype exposed Git's directory-link comparison behavior and preexisting checkout newline conversion. The final context materializes historical Git bytes and uses a private index, without replacing historical files in the working checkout.
- The standalone Node tooling contracts are invoked explicitly from `contracts.mjs`, outside Vitest discovery, so all original football test selections stay unchanged.
- Two local Windows `npm run verify` attempts recorded the observer-half test exceeding its existing timer and were stopped after failure; their partial logs are retained. A reactive-tactics test was interrupted during the second stop and has no independent completion claim. No timer, test body, fixture or assertion was changed to obtain a green result. The Linux serial attempt is described below; final-head verification status remains explicit in the PR.
- A temporary combined Linux `npm run verify` job in rollout run 40784091751 hit the unchanged 30-minute limit during career contracts, after all 2,388 unit and 56 integration tests passed. Its full log is retained. This failed serial packing is removed; final CI restores all three original bounded verification commands and the original 64 MiB V8 semi-space option. The cancelled run is not reported as a completed full verification.

## PR203 handoff

Reuse the manifest and existing budgeted groups for later cases; a new job needs measured platform/isolation/timeout justification. Retain original inventories and archives when extending coverage. `realism-candidate-v1`, its ablation and every football result remain PR201's: experimental mechanism retained, whole candidate not ready, canonical NOT READY, B default, 135 assumption IDs with zero COMPLETE, independent confirmation sealed. SS/O and WW/H still have zero shots, SW/J remains 12:0 and SW/B 9:0. The next football dependency remains lawful acquisition/search and preparation for blind or pressured arrivals, then the next real decision.
