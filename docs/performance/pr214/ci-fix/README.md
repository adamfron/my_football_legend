# PR214 CI correction: deterministic source inventory

The original [CI run 41451172836](https://github.com/adamfron/my_football_legend/actions/runs/41451172836)
failed in [verify (main)](https://github.com/adamfron/my_football_legend/actions/runs/41451172836/job/125296466017)
at the PR214 exact replay. The difference was an inventory `sourceLocations` array:
Windows enumerated `football*` before `footContact.ts`, while Linux enumerated
`footContact.ts` first. The file contents and source fingerprints were correct; filesystem
enumeration had accidentally become part of the measured result.

The second failed check, [quality](https://github.com/adamfron/my_football_legend/actions/runs/41451172836/job/125312132516),
correctly rejected `VERIFY_RESULT=failure`. The later artifact-upload complaint was also a
consequence: the main group runner had not been reached to create its output directory.
Neither the required quality gate nor artifact failure policy is relaxed.

`pr214Inventory.mjs` now orders source paths by deterministic JavaScript string ordering
before generating any source-location arrays. It does not use locale-dependent collation.
The source-list argument permits the actual generator to be tested with Windows, Linux
and reversed enumeration; the test also verifies that source references are not dropped
and the supplied list is not mutated.

The original `canonical-final-v3.json.gz`, its inventories/inputs and all earlier PR214
receipts remain unchanged. New `canonical-ci-v1.json.gz`, inventory/input sidecars and a
new source archive identify this observer correction. A strict contract compares **all
25 rows, complete frames/events/impulses/save witnesses/terminal hashes, the PR213
reference and every non-source protocol field** with final-v3. Only source identity and
the ordering of source-location metadata differ. Runtime/core/schema/type/package bytes
are checked against the published commit in [evidence.json](evidence.json).

Two regression contracts join the existing `scripts/ci/contracts.mjs` invocation; the
parent suite now has seven tests. The consolidated job layout, historical commands,
budgets, quality logic, all MatchEngine consumers and formal realism counts are unchanged.
The PR215 readiness recommendation remains BLOCKED_FOR_HOLISTIC_MATCH.

Reproduce from the repository root with locked dependencies and Node 24:

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs --test scripts/pr214InventoryContracts.mjs
node --test scripts/ci/contracts.mjs
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr214.mjs --check
node scripts/ci/buildManifest.mjs --check
node scripts/ci/renderWorkflow.mjs --check
npm run verify
```

The compressed original failed-job logs and passing local focused/source checks are kept
beside the evidence record. The full verification and hosted check outcomes for the
corrected head are reported on [PR214](https://github.com/adamfron/my_football_legend/pull/214).
