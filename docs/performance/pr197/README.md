# PR197 evidence

Read the [24-section report](../../PR197_PASSING_REALITY_FLIGHT_INTERCEPTION_AND_RECEIVER_ANTICIPATION.md), [summary](summary.json) and [verification receipt](verification.json) first. This is development evidence. Canonical NOT READY; B default; independent confirmation sealed.

Current laboratory receipts are selected in `scripts/summarizePr197.mjs` and the exact-source replay catalogue. File versions identify immutable experiments; `original-delivery-v3` separately identifies event semantics. Launch/readiness receipts retain their original apparatus because they do not use the new delivery interpreter.

- `frozen-pr196.json`: merged source, 134 registry statuses and original PR195/196 Git blobs.
- `source/`: normalized manifest and changed source contents relative to frozen PR196. Restore the baseline plus these deltas to reproduce the actual recorded experiment.
- Current long-pass baseline-v6/defence-v4/combined-v5: exact 28 inputs and eleven same-release branches, all-opponent frames, actual release/contact/control and full-stream hashes.
- Families-v5, interception-v2, aerial-controls-v2, candidates-v3, candidate-boundaries-v2 and autonomous-v5: separate experiment denominators and v3 outcomes. Autonomous diagonal loft is NOT ELICITED.
- Launch-v1/readiness-v1: launch distributions/live flight comparison and prescribed finite-surface receiving trials. Profile-v2 fixes an unobserved/null-target receiver probe in exploratory profile-v1.
- `matches/`: immutable full-match and failed development receipts, original v2 measurements, fixed 800-tick prefixes and expected next-tick hashes. Selected successes are explicit in summary; failures and superseded successes remain.
- `lineage/`: fourteen complete current-kernel physical replays with v3 outcome ledgers. Initial/final state hashes, ticks and exact pass identities match the corresponding immutable match receipt. Measurement differences are explicit.
- `replay-v2.json`: fourteen selected current saved-prefix and mutating-observer checks plus the formerly throwing boundary continuation. `replay-v1.json` preserves the earlier17-prefix experiment before the final observed-target admission fix.
- `failure-v1.json.gz` / `failure-height-v1.json.gz`: exact formerly throwing physical states; no coordinates or schema limits were relaxed.
- `exploratory-superseded.json.gz` / `superseded-measurement-v2.json.gz`: compact earlier PR197 experiments with original byte identities, all numerical/negative outcomes, event witnesses and trace/final hashes. Redundant body frames are replaced by their hashes and current representative traces. Old raw files are archived in the task workspace; PR195/196 files are untouched.

Read-only checks:

```sh
npm run benchmark:pr195:check
npm run benchmark:pr196:historical
npm run benchmark:pr196:check
npm run benchmark:pr196:replay
npm run benchmark:pr197:check
npm run benchmark:pr197:replay
npm run benchmark:pr197:source-replay
npm run verify
```

The exact-source laboratory runner reconstructs and checks all eleven current experiments. Timing/CPU/RSS are observational and are excluded from deterministic equality. Full-match replays are intentionally outside ordinary CI: `npm run benchmark:pr197:lineage -- --version=reproduction-v1 --workers=4` records a new immutable reproduction and checks it against each original physical final state. Choose an unused version; default v1 resumes missing work and skips already recorded successful replays. The summary continues to select the frozen lineage-v1 records unless explicitly revised.
