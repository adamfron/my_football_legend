# PR217 evidence index

Read the [integration report](../../PR217_HOLISTIC_MATCH_RELIABILITY_AND_PLAYTEST_EVIDENCE.md)
before interpreting counters or full-match attempts. Current decision:
**RETAIN_EXPERIMENTAL / NOT_READY for the next body-integration reliability gate**.

- `user-session-original.json.gz`: lossless bytes of the owner's failed export.
  `user-session-audit.json` joins its 309 pass identities and marks unavailable data.
- `session-input.json.gz`: exact fixture/session recipe; native Node is a separate
  trajectory from the owner's Edge runtime.
- `recovered-first-choice*`, `recovered-second-choice*`, `browser-to-second-choice*`,
  `browser-first-physical-incident*`: Edge reconstruction, including rejected human choices.
- `incident-before-handoff`, `incident-contact-trace`, `incident-corrected-contacts`,
  `original-native-reconstruction`: original foot–ball defect and actual producer.
- `checkpoint-original`: actual final throw-in/substitution deadlock.
- `lofted-handoff-v1`, `settled-throw-in-v3`, `restart-boot-overlap-v1`,
  `restart-perimeter-v2`, `restart-reach-v3`: compact regression fixtures from long attempts.
- `full-incident-final-v4`, `full-checkpoint-final-v5`, `full-input-final-v5`:
  final-engine long attempts, with explicit human choices, native reload checks,
  stages, per-pass credit, kick attempts, fitness, cost and the last 80 failure states.
  **All three are failed full-match attempts**, preserved before the full_time assertion.
- `full-baseline-final-v1`: completed ordinary baseline with exact PR216 terminal identity.
- `source.json`, `source-<fingerprint>.json.gz`: current manifest and immutable source editions.
- `verification.json`, `verify-final-v1.txt.gz`: final check results, complete verify log,
  identical application-source proof for the three failed long attempts, and scope limits.
- `browser/report.json`: real RunningLabGuard with canonical DEV fixtures, two viewports.
  `browser/production.json`: normal startup/play/pause on the production build.
- Earlier `replay-*`, `failure-*`, `agency-*` and `full-incident-final-v1..v3`:
  exploratory results and negative states. They are not additional successful matches
  or independent confirmation. A first-option retain driver can itself keep a human
  intention active; the final driver logs pass-first choices explicitly.

Run the bounded current-source gate without rewriting receipts:

```sh
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr217.mjs --check
node scripts/ci/replayPr216Check.mjs
npm run ci:manifest
npm run ci:contracts
npm run verify
```

To reproduce a long attempt, supply a **new** output version; a genuine blocker
is recorded and exits nonzero, rather than being converted into a football result:

```sh
node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr217.mjs --full --arm=incident --version=review-v1
```

Other arms are `input`, `checkpoint`, `baseline`. Browser checks use external
Playwright (`MFL_PLAYWRIGHT_MODULE`), installed Edge (`MFL_BROWSER_CHANNEL`) and
`MFL_BROWSER_URL`; default URL is local Vite on port 5178 with the repository base
path. `--production` targets an already-built preview URL. Browser tooling adds
no project dependency. Ignore `docs/**` in the development server's watch list
while downloads are being saved, to avoid Windows EBUSY on an open download.
