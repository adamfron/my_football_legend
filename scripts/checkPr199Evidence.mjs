import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { read, hash, normalized, BASE, ROOT, files, git, source } from './pr199Evidence.mjs';
import { catalogue } from './pr199Catalogue.mjs';
import { parseRegistry } from './realismProgress.mjs';
const frozen = read(`${ROOT}/frozen-pr198.json`),
  registry = parseRegistry(normalized('docs/match-engine/ASSUMPTIONS_REGISTER.md'));
assert.equal(new Set(registry.map((r) => r.id)).size, registry.length);
for (const old of frozen.registry)
  assert.ok(
    registry.some((r) => r.id === old.id),
    'Historical ID removed: ' + old.id,
  );
assert.equal(frozen.base, BASE);
assert.equal(hash(frozen.source), frozen.fingerprint);
for (const item of frozen.historicalEvidence)
  assert.ok(existsSync(item.path), 'Historical receipt removed');
git([
  'diff',
  '--exit-code',
  BASE,
  '--',
  ...[195, 196, 197, 198].map((pr) => `docs/performance/pr${pr}`),
]);
for (const [path, digest] of Object.entries(frozen.source))
  if (path.startsWith('src/'))
    assert.equal(hash(normalized(path)), digest, 'Live historical kernel changed: ' + path);
for (const path of files('src').filter(
  (p) => !p.endsWith('ballFlightBelief.ts') && !/\.test\./.test(p),
))
  assert.ok(
    !/from ['"][^'"]*ballFlightBelief/.test(normalized(path)),
    'New live consumer: ' + path,
  );
const checked = new Set();
for (const [key, [name]] of Object.entries(catalogue)) {
  const receipt = read(`${ROOT}/${name}`),
    source = receipt.result.source,
    archive = read(source.path);
  assert.equal(archive.base, BASE);
  assert.equal(hash(archive.manifest), source.fingerprint);
  if (!checked.has(source.path)) {
    for (const [path, content] of Object.entries(archive.contents))
      assert.equal(hash(content), archive.manifest[path], 'Corrupt archived content');
    checked.add(source.path);
  }
  assert.ok(receipt.result.schema.startsWith('pr199-'), key);
}
const baseline = read(`${ROOT}/forensics-baseline-v1.json.gz`).result;
assert.deepEqual(baseline.summary.R, { n: 180, touch: 154, control: 123, retained: 116 });
assert.deepEqual(baseline.summary.S, { n: 180, touch: 149, control: 113, retained: 108 });
const changed = read(`${ROOT}/forensics-changed-v1.json.gz`).result;
const uncertainty = read(`${ROOT}/forensics-uncertainty-v1.json.gz`).result;
for (const row of uncertainty.rows.filter((r) => r.variant === 'S'))
  assert.equal(
    row.finalHash,
    changed.rows.find((r) => r.variant === 'S' && r.ballHash === row.ballHash).finalHash,
    'Neutral uncertainty hook changed physics',
  );
assert.equal(changed.rows.length, frozen.changedContacts.length * changed.variants.length);
assert.equal(frozen.changedContacts.filter((r) => r.lostTouch).length, 8);
assert.equal(frozen.changedContacts.filter((r) => r.gainedTouch).length, 3);
for (const e of frozen.changedContacts)
  assert.ok(changed.rows.some((r) => r.ballHash === e.ballHash && r.traces.length));
const perception = read(`${ROOT}/perception-v3.json.gz`).result;
assert.equal(perception.flights.length, 20);
assert.equal(new Set(perception.flights.map((f) => f.family)).size, 10);
for (const flight of perception.flights) {
  const rows = perception.rows.filter(
    (r) => r.family === flight.family && r.sample === flight.sample,
  );
  assert.equal(new Set(rows.map((r) => r.launchHash)).size, 1);
  assert.equal(new Set(rows.map((r) => r.truthHash)).size, 1);
  for (const row of rows.filter((r) => r.config.condition === 'NONE' && !r.config.cues))
    assert.equal(row.finalBelief, null);
  for (const row of rows.filter(
    (r) => ['NONE', 'CUE_ONLY'].includes(r.config.condition) && !r.cueAcquired,
  ))
    assert.equal(row.finalBelief, null);
  const equal = rows.filter(
    (r) =>
      ['EARLY', 'APEX', 'LATE', 'INTERMITTENT'].includes(r.config.condition) &&
      r.config.duration === 0.2 &&
      !r.config.cues &&
      rowNoAttribute(r),
  );
  assert.equal(equal.length, 4);
  for (const row of equal) assert.ok(Math.abs(row.offeredSeconds - 0.2) < 1e-6);
}
function rowNoAttribute(r) {
  return r.config.attribute === null;
}
for (const mode of ['visibility', 'attributes']) {
  const reception = read(`${ROOT}/receivers-${mode}-v3.json.gz`).result;
  assert.ok(reception.observerNeutrality.hostileEqual);
  for (const row of reception.rows)
    assert.ok(row.launchHash && row.outcome.contract.version === 'original-delivery-v3');
}
const attributes = read(`${ROOT}/receivers-attributes-v3.json.gz`).result;
for (const row of attributes.rows.filter((r) => r.prescribedSensoryTape)) {
  const reference = attributes.references.find(
    (r) =>
      r.family === row.family && r.sample === row.sample && r.controller === row.config.controller,
  );
  assert.equal(row.sensorTapeHash, hash(reference.sensoryTape.sensorTape));
  assert.equal(
    row.prescribedAcquisitionsHash,
    hash(reference.sensoryTape.sensorTape.slice(0, row.prescribedAcquisitions)),
  );
}
const performance = read(`${ROOT}/performance-v3.json`).result;
assert.equal(performance.bounds.liveConsumersAdded, 0);
assert.equal(performance.bounds.canonicalStep, 0.025);
const verification = read(`${ROOT}/verification.json`);
for (const record of verification.records) {
  assert.ok(record.log.startsWith(`${ROOT}/verification/`) && !record.log.includes('..'));
  const compressed = readFileSync(record.log);
  assert.equal(hash(compressed), record.logSha256, 'Verification log bytes changed');
  assert.equal(hash(gunzipSync(compressed)), record.sha256, 'Verification output changed');
}
if (verification.status === 'PASS') {
  const fingerprint = hash(source());
  assert.equal(verification.runtimeSource.fingerprint, fingerprint, 'Verification source is stale');
  for (const command of [
    'verify',
    'benchmark:pr199:check',
    'benchmark:pr199:replay',
    'benchmark:realism:check',
  ]) {
    const record = verification.latest.find((r) => r.command === `npm run ${command}`);
    assert.equal(record?.code, 0, 'Required final verification missing');
    assert.equal(record.sourceBefore, fingerprint, 'Verification began on different source');
    assert.equal(record.sourceAfter, fingerprint, 'Source changed during verification');
  }
}
console.log(
  'PR199 evidence PASS:',
  Object.keys(catalogue).length,
  'receipts;',
  registry.length,
  'IDs; native runtime unchanged; observer neutrality; no live belief consumer',
);
void readFileSync;
