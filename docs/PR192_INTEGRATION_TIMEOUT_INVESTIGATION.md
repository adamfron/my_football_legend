# PR192 integration timeout investigation

## Preserved failure

Head `336d100fb9cce7bff50d32dc45e818bba48113a6` passed local `npm run verify`
(2,315 tests), but two Linux CI integration attempts passed 55/56 tests and
terminated the `legacy-pr176` native penalty-half child with SIGTERM. The existing
child limit is 89,500 ms, inside the 90,000 ms test limit. Main and career passed;
quality correctly failed. Both complete logs are now retained losslessly under
`performance/pr192/integration-timeout/ci-attempt-{1,2}.json`.

The failing worker must still play the complete canonical half at 40 Hz, execute
the actual penalty, produce meaningful progress and preserve native/Vitest
state parity. A passing local run does not certify the CI wall-clock budget.

## Rejected local hypotheses

The original local ABBA used a measurement wrapper rather than the exact native
entry from the test. Its equal full states remain valid evidence of that control,
but its timings cannot establish the throughput of the CI entry.

The new prefix input matches its original input SHA256:
`5c7afcf2c32a1c2264ab67c9b90f6e0d80ded914dc8c74015ade26a4abe0148d`.

| Native format, local Node 24.22.1    | Full-half elapsed time |
| ------------------------------------ | ---------------------: |
| Original TypeScript entry, A         |               75.862 s |
| Vite SSR bundle, B                   |               75.362 s |
| Vite SSR bundle, B                   |               78.024 s |
| Original TypeScript entry, A         |               78.061 s |
| `setImmediate` entry, separate trial |               86.998 s |
| Dynamic-import entry, separate trial |               87.022 s |

Every completed result has the same full-state hash. Neither bundling nor entry
scheduling establishes an improvement, so neither is adopted. These are retained
negative measurements, not alternative passing integration tests. The scheduling
trials are not a randomized or matched-host timing estimate against the earlier
ABBA.

A V8 CPU profile of the original native entry completes with the same state.
The largest self sample is the existing arrival estimator (13.49%); garbage
collection accounts for approximately 1.8%. Profile timing includes profiler
overhead. The complete compressed profile, receipt and rejected probe source
snapshots are retained in the evidence directory. Dependency versions match the
lockfile; the local Node runtime is 24.22.1 and CI uses 24.21.0.

## Matched Linux source control

Diagnostic job `121363093496`, workflow run `40257727400`, executes the original
merged PR191 and PR192 native entries on one AMD EPYC 9V45 host, with identical
input and the unchanged 89.5 s process limit:

| Source          |  Elapsed | Penalty execution |  Half ends | Full-state SHA256                                                  |
| --------------- | -------: | ----------------: | ---------: | ------------------------------------------------------------------ |
| PR191 `9ea0e59` | 54.098 s |         443.125 s | 2820.100 s | `ee541bff934b5d11c45e9839b7fb8ecbd085d7a4d624543a944ebffee250c7ef` |
| PR192           | 52.866 s |         443.125 s | 2820.100 s | `ee541bff934b5d11c45e9839b7fb8ecbd085d7a4d624543a944ebffee250c7ef` |

This control does not show a PR192 throughput regression on that host. Its input
hash matches the local control, while the final state differs across the recorded
OS/Node environments. Equality is asserted between repeated/source controls in
the same environment, not between those different platforms.

## Control on the failing integration host

Run `40258971762`, integration job `121367049195`, performs the same source pair
immediately before the suite on **AMD EPYC 7763**, Node **24.21.0**:

| Source/execution                    | Original child limit | Result                             |
| ----------------------------------- | -------------------: | ---------------------------------- |
| Merged PR191, original native entry |               89.5 s | SIGTERM after 89.568 s             |
| PR192, original native entry        |               89.5 s | SIGTERM after 89.624 s             |
| PR192, integration test             |               89.5 s | SIGTERM after 89.628 s; 55/56 pass |

Every input hash is the same `5c7afc…0148d`. The waiting Vitest parent uses only
0.305 s CPU over the failed test; the failure also reproduces before Vitest starts.
The unchanged cap rejects the frozen merged baseline on supported CI hardware.
Neither killed child is presented as a completed half or passing original gate.

## Correction and explicit budget exception

The inherited 90 s legacy budget is inadequate. The label `legacy-pr176` selects
a decision policy; it executes today's complete canonical physics, not the old
PR176 kernel. A substantially cheaper old-engine budget depends on which hosted
CPU GitHub assigns.

Only this full-half legacy budget is aligned with B's already existing **180 s**
budget. This uses the user's explicit exception for an inadequate limit; it is not
described as an optimization or as retaining the old 90 s cap. The child keeps its
500 ms margin (179.5 s). B's budget, the short 10 s parity test, all other timeouts
and the 30-minute CI jobs remain unchanged.

The same seed, clubs, actual XI, 40 Hz integration, maximum 140,000 ticks, real
penalty, full-half endpoint, restart/progress assertions and native/Vitest exact
state comparison remain. No test is skipped or football outcome forced. New error
context retains input hash, CPU/runtime identity and parent CPU. Game source stays
byte-identical (`ff4768…9ff`), so the frozen 15-match cohort remains current. The
integrity index also fingerprints the native contract, loader and integration test.

Temporary CI control jobs/prefixes are removed. Reproduction remains available:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/diagnosePr192Penalty.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/diagnosePr192Penalty.mjs --budget-ms=179500
```

The default diagnostic deliberately retains the original 89.5 s cap. A diagnostic
exit after recording killed children does not mean integration passed. The longer
option measures completion rather than relabelling the old failures. The PR records
the follow-up local verification and final-head CI result; those checks must confirm
the corrected full-half gate. CI status is read from the exact published head,
rather than committed as a prediction of that commit's future CI result.
