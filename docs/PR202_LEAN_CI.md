# PR202 — Lean CI and preserved historical evidence

Research change: scheduling and evidence accounting only. Local result: four measured source groups replace nineteen setup/install jobs, targeting 28 total jobs. Integration effect: no MatchEngine, profile, input, football result, receipt, original source archive or expected full-state hash is changed. Promotion decision: unchanged from PR201, `RETAIN_EXPERIMENTAL`, candidate `NOT_READY_FOR_PROMOTION`, canonical NOT READY, B default, independent confirmation sealed. Next dependency: PR203 receives the same football limitations and replay corpus.

## Migration gate (in progress)

The original 43-job workflow remains required while `pr202-parity.yml` runs all four proposed groups on Linux and Windows. The migration will only replace the nineteen Linux source jobs after their unchanged assertions pass in the grouped layout. All fourteen Windows full-match groups, three verify groups, four historical integrity groups, both platform probes and the stable `quality` check are retained. Limits stay 30/45 minutes.

## Reproduce and rollback

`npm run ci:manifest` regenerates the inventory in memory and checks it against the frozen PR201 task inventory. `npm run ci:contracts` rejects missing/duplicated cases, mixed platforms/budgets, receipt/archive corruption and failed or killed children. `npm run ci:group -- --group=source-01` runs the original commands in separate child processes, retaining per-task wall time, individual Node CPU/peak RSS, runtime, head and exit status under `.benchmark-artifacts/pr202`. The remaining groups are `source-02` through `source-04`. `--layout=original --group=pr198-source:receptions` reproduces an original group. Windows can use `--platform-parity` for the four source groups only; production platform requirements remain explicit.

The frozen workflow is [ci-pr201.yml](performance/pr202/ci-pr201.yml); restoring it to `.github/workflows/ci.yml` restores the original job families and `quality` dependencies. Never restore historical football evidence from a newly generated result. Original archives and complete deterministic state hashes remain authoritative.

## Measurements and limitations

[baseline-jobs.json](performance/pr202/baseline-jobs.json) records every job and step for PR201 run 40733773018, both attempts, including the WW/H cancellation. The second attempt contains carried successful jobs; these are not extra executions. Its `quality` result is success. Timestamp resolution is one second. The original workflow did not record peak RSS; that measurement is unavailable, not zero. PR201 development receipts contain separate process measurements and are not treated as hosted CI resource bills.

The nineteen source payloads sum to 3,213 seconds. Greedy whole-command packing gives groups of 802, 799, 805 and 807 seconds before setup. These are baseline predictions, not newly measured grouped durations. Checkout, setup, extraction, instrumentation and output publication remain part of the real job budget.

Full-match consolidation is deliberately deferred: the current and historical payloads for a fixture can exceed 45 minutes together, even before setup. A failed inherited WW/H job spent 1,188 seconds in checkout. Packing every fixture's nine replays into one job is therefore rejected. Fewer jobs is subordinate to verified budgets.

No monetary saving is claimed before actual after measurements and applicable account billing data are available. Runner-seconds, rounded worker-minutes and an explicitly parameterized cost estimate will be reported separately.

## Source isolation

Each original command still starts a separate process. Archived harnesses retain their original per-case source reconstruction, byte checks, loaders, laboratory hooks, module caches and private historical Git contexts. Setup and dependency installation are shared within each new source group. Extracted runtime trees and `node_modules` are not cached across jobs or platforms. Reusing immutable extracted trees is deferred: changing the source reconstruction protocol would add risk without evidence of a material gain in this migration. No result cache substitutes for an assertion.

The manifest binds each explicit source/match case to receipt bytes, archived source bytes, manifest fingerprint, source base, platform, Node edition and original timeout. It preserves the seven final-main PR200 runtime proofs as well as the older canonical metadata receipts. Historical integrity commands and their post-execution Git diff checks are preserved verbatim.

PR201's checker also asserts its historical workflow family list and report source fingerprint. It now executes verbatim in a private materialized PR201 context, with a private Git index/work tree. Current engine and original harness bytes are independently required to match merged PR201; original evidence must remain unchanged. The old scheduling assertion is preserved there, while the new manifest and deterministic workflow renderer assert the new scheduling. No historical report is regenerated with a new source fingerprint.

## Retained failed trials

- Run 40781432306 / head `2341420e7f0a59a5f2e0fd913a748d9ff4c002a6`: Windows stopped before replay because checkout converted the new frozen manifest to CRLF. The expected raw-byte hash correctly failed. New PR202 evidence receives scoped `-text` Git attributes; original evidence attributes are unchanged. A representative raw log is retained under `performance/pr202/trials/`.
- Run 40781432277 on the same head: the original PR201 summary guard rejected a changed research-tool inventory fingerprint after adding CI tooling. Its historical summary and exact check are retained; execution moves into the source context described above, and current runtime/coverage remain checked separately. The failed log is retained.
- A local private-context prototype exposed Git's directory-link comparison behavior and preexisting checkout newline conversion. The final context materializes historical Git bytes and uses a private index, without replacing historical files in the working checkout.
- The standalone Node tooling contracts are invoked explicitly from `contracts.mjs`, outside Vitest discovery, so all original football test selections stay unchanged.
