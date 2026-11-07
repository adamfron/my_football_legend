# PR218 evidence index

Promotion: **RETAIN_EXPERIMENTAL / NOT_READY_FOR_FULL_MATCH**.
The known physical gate failures are required negative results, not waived tests.

| Artifact | Scope |
| --- | --- |
| `source.json` and its named compressed archive | Exact normalized source manifest; changed contents relative to preserved PR217 source |
| `laboratory-v2.json.gz` | Final 60 paired movement scenes and 18 native incident arms, original inputs, samples, terminals, contacts and impacts |
| `summary-v2.json` | Compact final results, real halt witnesses and observed costs |
| `browser/report.json` | Real Three.js joint/boot errors, two viewport sizes, separate 22-model rendering submission measurements |
| `landmark-audit.json`, `audit-landmarks.mjs` | All nine required movement/action snapshots; the receipt binds this standalone harness by its own SHA256 and the canonical source fingerprint |
| `browser-production/production.json` | Normal production-build menu, start, play and pause at both viewports |
| `browser/*.png` | Standing, moving and prepared-pass comparison panels using the existing meshes |
| `verification.json` | Completed local commands, exit statuses, source and exact scope; full final verification is a separate hosted CI result |
| `verify-solo-interrupted.txt.gz` | Latest local `npm run verify` attempt: timeouts followed by an intentional stop before the final metadata correction |
| `verify-timeout-before-ik.txt.gz`, `verify-interrupted-under-load.txt.gz`, `verify-interrupted.txt.gz` | Earlier unsuccessful/interrupted attempts; no successful complete local verification is claimed |
| `career217-isolated.txt.gz`, `career218-isolated.txt.gz`, `career-suite-repeat.txt.gz` | Unchanged 60s career limit: comparable threads-pool isolated controls and the standalone five-case repeat |
| `laboratory-pre-ik.json.gz`, `summary-pre-ik.json` | Previous measured edition before the explicit singular-knee rejection; its own source archive remains preserved |
| `laboratory-pre-metadata.json.gz`, `summary-pre-metadata.json` | Previous measured edition before the active challenge/recovery leg observer correction; its source archive remains preserved |
| `laboratory-draft-v2.json.gz`, `summary-draft-v2.json.gz` | Superseded diagnostic edition; its post-run historical-byte guard failed because a generated proposed workflow was temporarily rewritten. That file was restored before final measurement. Physics failures remain preserved with the draft source. |

The earlier `laboratory-v1`/compressed `summary-v1` are exploratory, before the source archive
workflow was installed; their inline manifest identifies the edition but they are
not final reproducible source-bound claims. Final conclusions use v2 and its archive.

The measured physical edition is installed explicitly with `withArticulatedBody`
on the existing unprofiled holistic cluster recipe. No ordinary career or menu
preset enables it. Old PR195–217 receipts and the package/lockfile remain intact.

The draft PR links the existing consolidated GitHub Actions run for the final
commit. That hosted result is separate from this local receipt. Do not infer a
complete `npm run verify` pass from the focused checks or standalone career repeat.

Reproduce from the repository root with the normal installed dependencies:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr218.mjs --check
npm run verify
npm run ci:manifest
npm run ci:contracts
node scripts/ci/renderWorkflow.mjs --check
node scripts/ci/replayPr217Check.mjs
```

`--check` writes scratch under `.benchmark-artifacts/pr218` and checks source
identity, historical byte preservation, supported low-speed scenes, retained
sprint negatives, native reload identity and actual selected contact/body activity.
Record mode writes only this PR's evidence and must not replace old PR receipts.

Browser reproduction additionally needs an available Playwright module and Edge
(or the existing `MFL_BROWSER_CHANNEL` override):

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr218Browser.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs docs/performance/pr218/audit-landmarks.mjs
```

This launches a dedicated local test server/headless browser. It checks the normal
menu's ordinary default, then mounts deterministic physical rig fixtures. These
are component screenshots, not evidence of a complete interactive match. CPU and
wall measurements of the paired native runner include reload/schema/diagnostic
work. Render timings measure submission, not completed GPU work. No new articulated
complete match was attempted after mandatory stance/incident gates failed.

[Architecture, gate decisions and ten completion answers](../../PR218_CANONICAL_ARTICULATED_BODY_AND_GAIT.md).
