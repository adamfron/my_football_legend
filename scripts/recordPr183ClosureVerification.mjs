import { readFileSync, writeFileSync } from 'node:fs';
import console from 'node:console';
import { stripVTControlCharacters } from 'node:util';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';

const read = (p) => JSON.parse(readFileSync(`docs/performance/${p}.json`));
const exit = Number(readFileSync('../pr183-closure-verify-final.exit', 'utf8').trim());
const log = readFileSync('../pr183-closure-verify-final.log');
if (exit !== 0) throw Error('Full npm run verify has not passed');
const comparison = read('PR183-closure-policy-comparison');
const bridge = read('PR183-closure-type-only-bridge');
const integrity = read('PR183-closure-integrity');
const liveness = read('PR183-closure-liveness');
const controls = read('PR183-closure-retreat-reproductions');
const audit = read('PR183-closure-current-retreat-audit');
const sourceHash = pr183SourceHash();
if (
  sourceHash !== bridge.compilableSourceHash ||
  comparison.sourceHash !== bridge.simulatedSourceHash ||
  integrity.sourceHash !== comparison.sourceHash ||
  audit.sourceHash !== comparison.sourceHash
)
  throw Error('Acceptance source mismatch');
const r3 = controls.rows.filter(
  (r) => r.version === 'after' && r.policy === 'phase-role-hybrid-v1',
);
if (
  r3.length !== 7 ||
  r3.some(
    (r) =>
      r.sourceHash !== comparison.sourceHash ||
      r.duration >= 20 ||
      r.maxRetreatMetres >= 12 ||
      r.releaseAction !== 'pass',
  )
)
  throw Error('Seven native mechanical regressions did not pass');
const allLong = comparison.rows
  .filter((r) => r.policy === 'phase-role-hybrid-v1')
  .flatMap((r) => (r.longRetreats ?? []).map((e) => ({ id: r.id, e })));
if (
  allLong.length !== audit.rows.length ||
  allLong.some(
    ({ id, e }) =>
      !audit.rows.some(
        (r) => r.fixture === id && r.episode.id === e.id && Math.abs(r.episode.at - e.at) < 0.001,
      ),
  )
)
  throw Error('Incomplete peak excursion audit');
if (allLong.some(({ e }) => e.peakMetres >= 30))
  throw Error('Extreme 30-45m R3 recurrence requires further repair, never a cap');
if (
  !integrity.fullMatch.observerEqual ||
  integrity.rows.length !== 5 ||
  integrity.rows.some((r) => new Set(r.variants.map((v) => v.hash)).size !== 1)
)
  throw Error('Incomplete deterministic equivalence');
const after = liveness.rows.find((r) => r.label === 'after');
if (
  !after ||
  after.sourceHash !== comparison.sourceHash ||
  after.firstAction?.action.type !== 'header' ||
  after.firstAction?.elapsed > 0.026 ||
  after.firstAction?.ball.ownerId
)
  throw Error('Saved loose-ball liveness failure not resolved physically');
const text = stripVTControlCharacters(log.toString());
if (
  !text.includes('2027 passed') ||
  !text.includes('56 passed') ||
  !text.includes('4 passed') ||
  !text.includes('vite build')
)
  throw Error('Incomplete verification log');
const receipt = {
  schema: 'mfl-pr183-closure-verification-v1',
  codeCommit: '7279c76e30d2e66d8d7c9854d340e453d27545b7',
  compilableSourceHash: sourceHash,
  simulatedSourceHash: comparison.sourceHash,
  typeOnlyBridge: 'PR183-closure-type-only-bridge.json',
  command: 'npm run verify',
  exitCode: exit,
  logSha256: digest(log),
  context:
    'Complete unchanged verify in the final workspace after all complete-match cohort processes ended. UI fake-time harness models measured work; original assertions and 30s timeout retained. Earlier concurrent attempts and their resource-limit failures are retained in work logs, not substituted for the final pass.',
  tests: { unit: 2027, matchIntegration: 56, careerContract: 4, fullCareer: 5, total: 2092 },
  lint: 'pass',
  build: 'TypeScript and Vite pass',
  mechanicalCases: r3.length,
  developmentFullMatches: 30,
  newConfirmationFullMatches: 15,
  supplementalR3FullMatches: 3,
  allLargeR3PeaksAudited: allLong.length,
  maxR3PeakMetres: Math.max(0, ...allLong.map(({ e }) => e.peakMetres)),
  freezeCommit: comparison.freezeCommit,
  acceptance:
    'Closure mechanical, completion, deterministic and verification gates passed; keep summary calibration NOT READY. Finite conservative retreats remain explicitly measured, not asserted universally rational.',
  ci: 'Final exact-head GitHub checks are verified externally after the evidence commit; PR checks are authoritative. No claim about a future CI result is embedded in this receipt.',
};
writeFileSync(
  'docs/performance/PR183-closure-verification.json',
  JSON.stringify(receipt, null, 2) + '\n',
);
console.log(JSON.stringify(receipt, null, 2));
