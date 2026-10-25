# PR192 development evidence

Experimental draft. Default B is preserved; A (ball recovery) and B (restart
preparation) below name independent interventions, not policy promotions.
Independent confirmation remains sealed. See the main PR192 report for the
readiness verdict and limitations.

## Retained data

- `reconstructed-human.json`: inferred canonical Adam Krawczyk identity, all
  candidate matching errors, exact reconstructed PR191/current six-trial data.
  Original browser exports were unavailable.
- `reconstructed-pr191.json`: initial neutral-profile reconstruction, retained
  separately rather than relabelled as the supplied human observation.
- `laboratory-v3.json`: final 33 repeated laboratory setups; previous stages
  preserve the original defender-foot mirror error.
- `natural-flow-laboratory-v5.json`: final 20 boundary/deflection cases and 20
  prescribed restart rows. Earlier versions retain unsupported free-kick
  apparatus and missed penalty-execution measurement. V5 uses the lossless reader;
  its physical outcomes are unchanged from the repaired V4.
- `touchline-challenges.json`: 32 canonical challenges/carries, paired seeds,
  mirrored geometry and 40/80 profiles. The initial unpaired-seed stage remains.
- `matches/*-combined-final-v2.json`: the 15 selected full-time WW/SS/SW × five
  policy receipts, frozen source/runner hashes and detailed passive measurements.
  Earlier stages, A/B isolation and full observer-off repeats are retained.
  SS `flow.json` is observer-only; use `flow-final.json` for physical B.
- `development-summary.json`: exact selected cohort, four-way comparison and full
  observer-neutrality comparisons. No interrupted run is counted as completed.
- `matches/capture-*.json.gz`, `replay.json`: genuine captured states reconstructed
  from original input prefixes, then repeated 320 ticks with/without observers.
- `rejected-capture-references.json`: original collided references. Rejected
  overlapped bytes remain; repaired A captures match their original recorded
  full-state hashes after exact prefix replay.
- `source-versions.json`, `source-overlays/`: exact older runtime source bytes,
  checked against their original manifests. Unchanged historical archives are
  referenced rather than copied here.
- `cost.json`: isolated local estimator/observation cost and ABBA observer probe.
- `negative-evidence.json`, `verification-logs/`: failed/interrupted attempts and
  actual logs, separate from superseding successful results.
- `verification.json`: actual technical verification results. CI is reported on
  the PR's final commit; it is not claimed from a local run.
- `evidence-index.json`: current runtime/runner hashes and exact artifact bytes.

## Lossless packaging

Large JSON files use a small `mfl-pr192-packed-json-v1` pointer plus `.json.gz`.
The archive contains the **exact original JSON bytes**, including negative
outcomes, traces, manifests and timing fields. The pointer records hashes of both
the compressed archive and original uncompressed bytes. No row is truncated,
resampled or rounded by packaging. Genuine match captures were already gzip JSON
and remain directly readable. Source overlays also remain gzip JSON.

From the repository root, inspect a receipt with:

```sh
node --input-type=module -e 'import {readPr192Evidence} from "./scripts/readPr192Evidence.mjs"; console.log(readPr192Evidence("docs/performance/pr192/development-summary.json"))'
```

The helper rejects archive paths outside this evidence directory and checksum
drift. Native `gzip -dc path.json.gz` also exposes the exact raw JSON.

## Reproduction

```sh
npm run benchmark:pr192:baseline
npm run benchmark:pr192:check
npm run verify
```

The baseline runner archives merged PR191 source and runs its original checks,
then reconstructs the supplied rounded human observations. The PR192 checks run
current laboratory, boundary/restart, challenge and genuine-prefix replay checks,
then require complete source-matching final evidence and artifact integrity.

Full-match writers refuse existing output paths. For an additional development
run choose a fresh version, preserving the retained result:

```sh
npm run benchmark:pr192:matches -- --design=ww --policy=state-value-v1 --mode=combined --version=local-review
```

Summary/index writers are aggregation tools, not new experiments. Regeneration
must preserve all original staged results. CPU/RSS samples depend on hardware and
concurrency; they are descriptive and are not deterministic outcome fields.
