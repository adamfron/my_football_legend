# PR218 evidence index

## V2 continuation

The current edition is `stance-foot-dev-v2`. Its source is bound by `source.json`
and the named compressed archive. [Repair and integration report](../../PR218_STANCE_V2_GATE_REPAIR.md).

| Artifact                                                                                                                               | Scope                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `laboratory-v3.json.gz`, `summary-v3.json`                                                                                             | 60/60 ten-second movement scenes and 26 paired native continuations; original nine cases plus four full-match counterexamples           |
| `browser-stance-v2/report.json`, its PNGs                                                                                              | Existing Three.js rigs at both viewport sizes                                                                                           |
| `browser-production-stance-v2/production.json`                                                                                         | Production normal-menu defaults and start/play/pause at both viewport sizes; compatibility check, not the articulated full-match runner |
| `landmark-audit-stance-v2.json`, `audit-landmarks-stance-v2.mjs`                                                                       | Nine physical snapshots; actual carrying and receiving, individual harness hash                                                         |
| `smoke-stance-v2-attempt-6.json.gz`                                                                                                    | Current successful 120-second 22-player smoke; eligible, departing and entering bodies are observed                                     |
| `full-stance-v2-attempt-6.json.gz`, `full-stance-v2-summary-attempt-6.json`                                                            | Complete articulated match: 1–1 at 5700s, no halt, invalid composed pose or new body unresolved                                         |
| `stance-v2-gates.json`                                                                                                                 | Exact source and artifact-byte binding for all six physical gates and the complete match                                                |
| `verification-stance-v2.json`, `*-stance-v2*.txt.gz`                                                                                   | Final local technical/physical results and preserved command logs; hosted CI is linked separately in the PR                             |
| `full-stance-v2-attempt-1.json.gz`                                                                                                     | Failed at 1783.275s: pre-impact support plan survived a lateral body impulse                                                            |
| `full-stance-v2-attempt-2.json.gz`                                                                                                     | Failed at 316.05s: the non-action support was retained too long during a moving kick/recovery                                           |
| `full-stance-v2-attempt-3.json.gz`                                                                                                     | Failed at 2674.125s: legacy substitution transport reassigned body orientation without the leg state                                    |
| `full-stance-v2-attempt-5.json.gz`                                                                                                     | Failed at 4426.475s: prepared command exceeded finite leg reach; exact case now finishes as a joint-limited miss                        |
| `smoke-stance-v2-attempt-1/2/3/4/5.json.gz`                                                                                            | Earlier source-bound smoke editions, not final v2 claims                                                                                |
| `*-before-impact*`, `*-before-support-release*`, `*-before-substitution-repair*`, `*-before-held-facing-fix*`, `*-before-joint-limit*` | Preserved earlier laboratory, renderer and audit receipts; each retains its own source                                                  |

The four failed complete trajectories preserve their initial/terminal states and
last two seconds, and are now fixed-input native regressions. Attempt 4 was
intentionally interrupted after a later correction to held-body facing; its
partial log is not a completed match. Attempt 6 is the completed trajectory;
its receipt is separate from local and smoke success. **RETAIN_EXPERIMENTAL /
COMPLETE_MATCH_TESTED**, with ordinary career/menu selection still disabled.
This is one development match, not independent-corpus or empirical gait certification.

Reproduce v2 using the existing dependencies and TS loader:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr218.mjs --check
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr218Match.mjs --check
```

The second command validates exact artifact bytes and a successful complete-match
receipt once available; it does not rerun the complete trajectory. A new measured
run uses `benchmarkPr218Match.mjs --smoke --version=NEW` followed, only after
success, by `--full --version=NEW --smoke-version=NEW`. Every raw run is additive.
Renderer reproduction uses `benchmarkPr218Browser.mjs` and
`docs/performance/pr218/audit-landmarks-stance-v2.mjs` with the Playwright setup below.

## Preserved v1 staged evidence

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
