import { deepStrictEqual, strictEqual } from 'node:assert';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

// Validate the immutable raw evidence after rerunning the same matrix with the
// bounded statistics watermark. Paths may point to an unpacked evidence bundle.
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const root = resolve(args.get('root') ?? process.cwd());
const archive = resolve(root, args.get('archive') ?? '.benchmark-artifacts/PR158-pre-accounting');
const beforeDirectory = resolve(root, args.get('before-directory') ?? 'docs/performance');
const afterDirectory = resolve(root, args.get('after-directory') ?? 'docs/performance');
const snapshot = resolve(
  root,
  args.get('baseline-digests') ?? resolve(archive, 'pr158-tactical-before-artifact-digests.json'),
);
const out = resolve(
  root,
  args.get('out') ?? 'docs/performance/PR158-tactical-accounting-equivalence.json',
);
const beforeNames = ['PR158-tactics-before.json', 'PR158-tactical-scenarios-before.json'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const beforeDigests = () =>
  Object.fromEntries(
    beforeNames.map((name) => [name, digest(readFileSync(resolve(beforeDirectory, name)))]),
  );
deepStrictEqual(
  beforeDigests(),
  JSON.parse(readFileSync(snapshot, 'utf8')),
  'Raw baseline artifacts changed during the after rerun.',
);
const oldSource = '0cf35eb91eebb959c743de58a7e5788a8b61d76dd2988a9db8aaa8e0bf989201';
const newSource = '47f99f54b75785040c94e7e81c0799af79d42ceb92d501b09388c089be3ca0ba';
const observer = '0bc95e566e0fbc304f9af0e3491fc1dc272fc7cf95087a93a6420afe909fbd53';
const normalize = (row) => {
  const { elapsedMs, canonicalStateHash, ...remaining } = row;
  void elapsedMs;
  void canonicalStateHash;
  return remaining;
};
const groups = [];
for (const name of ['PR158-tactics-after.json', 'PR158-tactical-scenarios-after.json']) {
  const old = JSON.parse(readFileSync(resolve(archive, name), 'utf8'));
  const current = JSON.parse(readFileSync(resolve(afterDirectory, name), 'utf8'));
  strictEqual(old.canonicalSourceHash, oldSource);
  strictEqual(current.canonicalSourceHash, newSource);
  strictEqual(old.observerSourceHash, observer);
  strictEqual(current.observerSourceHash, observer);
  deepStrictEqual(current.config, old.config);
  deepStrictEqual(current.tacticalProfiles, old.tacticalProfiles);
  strictEqual(old.results.length, 105);
  strictEqual(current.results.length, 105);
  const keys = (rows) =>
    rows.map((row) => `${row.family ?? row.scenario}/${row.profile}/${row.seed}`);
  deepStrictEqual(keys(current.results), keys(old.results));
  strictEqual(new Set(keys(current.results)).size, 105);
  deepStrictEqual(
    current.results.map(normalize),
    old.results.map(normalize),
    `${name}: football/diagnostic/physical observer data changed.`,
  );
  groups.push({
    file: name,
    rows: 105,
    identicalRows: 105,
    normalizedRowsSha256: digest(JSON.stringify(current.results.map(normalize))),
  });
}
const proof = {
  previousCanonicalSourceHash: oldSource,
  finalCanonicalSourceHash: newSource,
  observerSourceHash: observer,
  comparison:
    'Exact per-row equality of all fixture identity, football counters, planned diagnostics, suitability, preferences, physical transition clocks, workload, rotation traces and initial/final scenario outcome fields. Only elapsedMs and canonicalStateHash are omitted; elapsed time varies under CPU contention and the canonical full-state hash changes with statistics watermark metadata.',
  excludedRowFields: ['elapsedMs', 'canonicalStateHash'],
  scope:
    '210 rerun after fixtures: 105 ten-minute tactical rows and 105 twelve-second synthetic rows; this is an equality result for the stated deterministic matrix, not a proof for arbitrary unseen fixtures.',
  beforeArtifactDigestsUnchanged: beforeDigests(),
  groups,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(proof, null, 2) + '\n');
log(JSON.stringify(proof, null, 2));
