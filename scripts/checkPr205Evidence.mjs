import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { checkPr205Source, BASE } from './pr205SourceGuard.mjs';
import { hash } from './pr199Evidence.mjs';

const root = 'docs/performance/pr205',
  binding = checkPr205Source();
const read = (name) => JSON.parse(gunzipSync(readFileSync(`${root}/${name}.json.gz`)));
const original = JSON.parse(
  readFileSync('docs/performance/pr204/current-source.json', 'utf8'),
).manifest;
for (const file of readdirSync(root).filter(
  (n) => /^source-.*\.json\.gz$/.test(n) || n === 'baseline-source.json.gz',
)) {
  const archive = JSON.parse(gunzipSync(readFileSync(`${root}/${file}`)));
  assert.equal(archive.base, BASE);
  assert.equal(hash(archive.manifest), archive.fingerprint);
  const restored = { ...original };
  for (const [path, content] of Object.entries(archive.contents)) {
    assert.ok(!path.split('/').includes('..') && !path.includes('\\') && !path.startsWith('/'));
    restored[path] = hash(content);
  }
  assert.deepEqual(restored, archive.manifest, `Unreconstructible archive ${file}`);
}
const before = read('baseline-final'),
  after = read('development-final');
assert.equal(before.result.movement[0].arms[0].projection.intensity, 'jog');
assert.equal(before.result.movement[0].arms[2].projection.intensity, 'sprint');
for (const row of after.result.movement) {
  assert.equal(row.arms[0].projection.intensity, row.condition === 'seen' ? 'sprint' : 'jog');
  for (const arm of row.arms.slice(1)) assert.deepEqual(arm.projection, row.arms[0].projection);
}
for (const row of after.result.contacts.filter((r) => r.role !== 'keeper')) {
  for (const route of ['access', 'direct', 'canonical'])
    for (const arm of row[route].slice(1)) assert.deepEqual(arm.result, row[route][0].result);
  assert.equal(row.canonical[0].result.contact.executed, true);
  if (row.speed >= 18) assert.equal(row.canonical[0].result.ball.ownerId, undefined);
}
const recovery = read('recovery-final');
assert.equal(recovery.rows.length, 6);
for (const row of recovery.rows) {
  assert.ok(row.sight < row.recoveryAt && row.recoveryAt < row.controlAt);
  assert.equal(row.retainedAtOneSecond, true);
  assert.ok(row.actions.length && row.contacts.some((c) => c.ground?.executed));
}
const receiving = read('receiving-final');
assert.equal(receiving.rows.length, 40);
for (const row of receiving.rows) {
  const peer = receiving.rows.find(
    (r) =>
      r.family === row.family &&
      r.sample === row.sample &&
      r.factor === row.factor &&
      r.mode !== row.mode,
  );
  assert.equal(row.releaseHash, peer.releaseHash);
  assert.equal(row.ballHash, peer.ballHash);
}
const support = read('support-final2');
assert.equal(support.rows.length, 24);
const proof = {
  source: binding.fingerprint,
  node: process.version,
  platform: process.platform,
  receipts: Object.fromEntries(
    [
      'baseline-final',
      'development-final',
      'recovery-final',
      'receiving-final',
      'support-final2',
    ].map((n) => [n, hash(readFileSync(`${root}/${n}.json.gz`))]),
  ),
  replays: [],
};
if (process.argv.includes('--replay')) {
  for (const [script, version] of [
    ['benchmarkPr205', 'development-final'],
    ['benchmarkPr205Recovery', 'recovery-final'],
    ['benchmarkPr205Receiving', 'receiving-final'],
    ['benchmarkPr205Regressions', 'support-final2'],
  ]) {
    const output = execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}.mjs`,
        `--version=${version}`,
        '--check',
      ],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    );
    proof.replays.push({ script, version, result: 'PASS', outputHash: hash(output) });
    console.log(`${version}: exact serialized rows replay PASS`);
  }
}
const output = process.argv.find((a) => a.startsWith('--proof='))?.slice(8);
if (output) {
  assert.equal(proof.replays.length, 4);
  mkdirSync(root, { recursive: true });
  writeFileSync(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
}
console.log('PR205 archives, paired contracts, physical recovery and matched releases PASS');
