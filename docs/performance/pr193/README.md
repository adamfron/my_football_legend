# PR193 reproducible evidence

Canonical is **NOT READY**. Default B and the independent confirmation cohort are
unchanged. This directory contains development evidence, not independent validation.

Authoritative artifacts:

- `frozen-pr192.json`: exact merged base, source/report/configuration/input hashes.
- `laboratory-protocol-v2.json` + `laboratory-final-v6.json(.gz)`: 132 paired and
  mirrored experiments, 25 ms canonical physics, raw failures and sampled traces.
- `matches/*-final-v2*.json`: 31 full matches, 15 combined policies/designs, twelve
  B/O ablations, one default control and three complete observer-off twins.
- `summary-final-v1.json`, `full-match-table.md`, CSVs: derived numerical comparisons.
- `observer-replay-v1.json`: fifteen real match captures, two mutating-observer
  continuations and a bare continuation each; sixteen foul-state continuations.
- `foul-audit-v1.json`, `foul-captures/`: real SS/B audit preserving 63/42 and final hash.
- `incidental-scoring-v3.json`: non-shot/own goal, post, wide, direct throw, legacy control.
- `laboratory-shot-quality-v1.json`: identical replays retaining actual shot physics.
- `geometry-limits-v1.json`: actual legacy body-envelope limitation and historical
  flag-off non-shot goal failure. The latter is repaired only by the new opt-in flag.
- `cost-prefix-v1.json`: shared genuine checkpoint, warm-up and five CPU repetitions.
- `source-versions/`: complete manifests plus changed source bytes against frozen192.
- `figures/`: actual trajectories; 2D plots do not establish anatomical contacts.
- `negative/`: failed cycles, superseded apparatus findings and resource contention.
- `verification-final-v1.json`: immutable pre-CI snapshot of local checks, commands,
  logs and browser smoke. Final consolidated verify/CI outcomes are on the PR.
- `evidence-index-final-v1.json`: immutable artifact/checksum and canonical kernel index.

`final-v1` matches and lab cycle3/v1–v4 are retained development history. They are not
pooled with the final cohort. Lab protocol v1 varied seeds between action variants;
v2 removes that confound. Failed v5 source-drift runs have logs rather than a falsely
certified result. The selected final version is explicit in npm scripts/checkers.

Large match receipts use lossless gzip packaging. `readPr193Evidence.mjs` verifies
both compressed and exact original JSON bytes; the `.json` pointer retains both
hashes. Packing does not discard events or regenerate outcomes. PR192 archives are
referenced in place rather than duplicated.

Run from repository root with Node24 and installed npm dependencies:

```sh
npm run verify
npm run benchmark:pr193:baseline
npm run benchmark:pr193:check
npm run benchmark:pr193:replay
```

CI also preserves the complete PR186–192 frozen replay chain. Full matches need
several minutes per fixture and are retained as receipts/captures; CI verifies the
evidence and replays representative actual states instead of regenerating the full
cohort. New experiments require a new explicit version; writers refuse overwrites.
No confirmation-input path is accepted by the development input reader.

Optional figures: `python scripts/plotPr193.py` with matplotlib available. This is
documentation tooling; no Python or matplotlib dependency is introduced into the game.
