import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { BASE, hash, receipt } from './pr196Evidence.mjs';
const git = (args, extra = {}) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    ...extra,
  });
const paths = git([
  'ls-tree',
  '-r',
  '--name-only',
  BASE,
  'src/core',
  'src/schemas',
  'src/types',
  'scripts/benchmarkPr195.mjs',
  'scripts/pr195DefenderArrival.mjs',
  'scripts/pr195Outcomes.mjs',
  'scripts/pr195SourceInventory.mjs',
  'scripts/registerTypescriptLoader.mjs',
  'package-lock.json',
])
  .trim()
  .split('\n')
  .filter((p) => !/\.test\./.test(p))
  .sort();
const bytes = execFileSync('git', ['cat-file', '--batch'], {
  input: paths.map((p) => `${BASE}:${p}`).join('\n') + '\n',
  maxBuffer: 128 * 1024 * 1024,
  windowsHide: true,
});
let offset = 0;
const source = {};
for (const p of paths) {
  const end = bytes.indexOf(10, offset),
    size = Number(bytes.subarray(offset, end).toString().split(' ')[2]);
  if (!Number.isFinite(size)) throw Error('Missing baseline ' + p);
  source[p] = hash(
    bytes
      .subarray(end + 1, end + 1 + size)
      .toString('utf8')
      .replaceAll('\r\n', '\n'),
  );
  offset = end + size + 2;
}
const registry = git(['show', `${BASE}:docs/match-engine/ASSUMPTIONS_REGISTER.md`]);
const statuses = [...registry.matchAll(/^### ([A-Z]+-\d+)[\s\S]*?^- \[ \] ([A-Z_]+)/gm)].map(
  (m) => ({ id: m[1], status: m[2] }),
);
const evidence = git(['ls-tree', '-r', BASE, 'docs/performance/pr195'])
  .trim()
  .split('\n')
  .map((line) => {
    const [metadata, path] = line.split('\t');
    return { path, gitBlob: metadata.split(' ')[2] };
  });
receipt(
  'docs/performance/pr196/frozen-pr195.json',
  {
    schema: 'pr196-frozen-pr195-v1',
    base: BASE,
    source,
    sourceHash: hash(source),
    registryStatuses: statuses,
    historicalEvidence: evidence,
    protocol: JSON.parse(git(['show', `${BASE}:docs/performance/pr195/pilot-protocol.json`])),
    policies: [
      'state-value-v1',
      'phase-role-hybrid-v1',
      'opportunity-driven-v1',
      'hierarchical-intent-v1',
      'contextual-judgment-v1',
    ],
    replay:
      'historical unflagged saves retain old ETA; experimentalCanonicalArrival is an optional persisted boolean, absent by default',
    negatives: [
      'bad_pass',
      'infeasible_contact',
      'stale_receiver',
      'safe_hold',
      'rejected/unreleased requests',
      'unresolved horizons',
    ],
    featureConfiguration:
      'baseline fixture flags and seeds are preserved by PR195 protocol; full-match PR196 paired flags are explicitly recorded in each receipt',
  },
  process.argv.includes('--check'),
);
console.log(
  'PR195 baseline freeze PASS',
  statuses.length,
  'registry IDs',
  evidence.length,
  'immutable evidence blobs',
);
