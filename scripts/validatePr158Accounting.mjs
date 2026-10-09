import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

// The archived inputs are distributed with the raw PR158 evidence, rather than in Git.
const archive = process.argv[2] ?? '.benchmark-artifacts/PR158-pre-accounting';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const oldSource = '0cf35eb91eebb959c743de58a7e5788a8b61d76dd2988a9db8aaa8e0bf989201';
const newSource = '47f99f54b75785040c94e7e81c0799af79d42ceb92d501b09388c089be3ca0ba';
const omit = (value, keys) => {
  if (Array.isArray(value)) return value.map((item) => omit(item, keys));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !keys.includes(key))
        .map(([key, item]) => [key, omit(item, keys)]),
    );
  return value;
};
const proofs = [];
let games = 0;
for (const group of ['a', 'b', 'c']) {
  const filename = `pr158-flow-acceptance-after-${group}.json`;
  const before = read(`${archive}/${filename}`);
  const after = read(`../${filename}`);
  assert.equal(before.canonicalSourceHash, oldSource);
  assert.equal(after.canonicalSourceHash, newSource);
  assert.equal(before.benchmarkSourceHash, after.benchmarkSourceHash);
  assert.equal(before.observerSourceHash, after.observerSourceHash);
  assert.deepEqual(before.config, after.config);
  assert.equal(before.results.length, 6);
  const fields = ['elapsedMs', 'canonicalHash'];
  const oldRows = omit(before.results, fields);
  const newRows = omit(after.results, fields);
  assert.deepEqual(newRows, oldRows, `${filename}: exported football changed`);
  games += newRows.length;
  proofs.push({
    input: filename,
    rows: newRows.length,
    omittedFields: fields,
    sha256: digest(newRows),
  });
}
assert.equal(games, 18);
const contactBefore = read(`${archive}/PR158-contact-current.json`);
const contactAfter = read('docs/performance/PR158-contact-current.json');
assert.equal(contactBefore.sourceFingerprint.digest, oldSource);
assert.equal(contactAfter.sourceFingerprint.digest, newSource);
assert.deepEqual(contactAfter.configuration, contactBefore.configuration);
assert.equal(contactAfter.rows.length, 55);
for (const row of contactAfter.rows) assert.equal(row.samples.length, 32);
assert.deepEqual(contactAfter.rows, contactBefore.rows, 'Contact samples/traces changed');
proofs.push({
  input: 'PR158-contact-current.json',
  cells: 55,
  pairedTrials: 1760,
  omittedFields: [],
  sha256: digest(contactAfter.rows),
});
const integrityBefore = read(`${archive}/pr158-integrity.json`);
const integrityAfter = read('../pr158-integrity.json');
assert.deepEqual(integrityBefore.config, integrityAfter.config);
assert.equal(integrityAfter.simulations.length, 3);
assert.deepEqual(integrityAfter.shotOwnership, integrityBefore.shotOwnership);
const checksumFields = ['elapsedMs', 'canonicalHash', 'referenceCanonicalHash'];
const oldIntegrity = omit(integrityBefore.simulations, checksumFields);
const newIntegrity = omit(integrityAfter.simulations, checksumFields);
assert.deepEqual(
  newIntegrity,
  oldIntegrity,
  'RNG streams, identities or agency boundaries changed',
);
proofs.push({
  input: 'pr158-integrity.json',
  seeds: 3,
  identities: 66,
  shotOwnershipCells: 18,
  omittedFields: checksumFields,
  sha256: digest(newIntegrity),
});
const report = {
  beforeCanonicalSource: oldSource,
  afterCanonicalSource: newSource,
  runtimeChange:
    'Physical-contact deduplication uses one optional timestamp per player instead of a growing contact ID history; legacy IDs remain respected.',
  equalityDefinition:
    'Every exported football, workload, transition, contact-trace and RNG-stream field is compared exactly. Wall times and complete canonical-state checksums are omitted explicitly because the statistics bookkeeping representation changed. This is not complete pre/post canonical-state equality.',
  proofs,
  tacticalProof:
    'PR158-tactical-accounting-equivalence.json compares all 105 tactical and 105 scenario rows separately.',
};
const output = 'docs/performance/PR158-accounting-parity.json';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, games, contactTrials: 1760, identities: 66 }));
