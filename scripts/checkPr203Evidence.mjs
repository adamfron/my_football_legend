import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { checkCurrentSource, read, hash, FINAL_VERSION } from './pr203Evidence.mjs';
const binding = checkCurrentSource();
for (const mode of ['awareness', 'support', 'roles', 'reception']) {
  const path = `docs/performance/pr203/${mode}-${FINAL_VERSION}.json.gz`,
    saved = read(path);
  assert.equal(
    saved.result.source.fingerprint,
    binding.fingerprint,
    'Final lab not on bound source',
  );
  assert.ok(saved.costs.wallSeconds > 0 && saved.costs.peakRSSKiB > 0);
  execFileSync(
    process.execPath,
    [
      '--max-semi-space-size=64',
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/benchmarkPr203.mjs',
      `--mode=${mode}`,
      `--version=${FINAL_VERSION}`,
      '--check',
    ],
    { stdio: 'inherit', windowsHide: true },
  );
}
const support = read(`docs/performance/pr203/support-${FINAL_VERSION}.json.gz`).result.rows;
assert.equal(support.length, 144);
assert.ok(support.some((r) => r.profile === 'prospective-play-v1' && r.movementLeadSeconds > 0));
assert.ok(support.some((r) => r.profile === 'prospective-play-v1' && r.withdrawnAt !== null));
assert.ok(
  support.some(
    (r) => r.cReleasedByB && r.nextOutcomes.some((o) => o.directReceiverTouch && o.receiverControl),
  ),
);
assert.ok(
  support.some((r) => r.releaseAt === null),
  'Preserve rejected/delayed release',
);
const roles = read(`docs/performance/pr203/roles-${FINAL_VERSION}.json.gz`).result.rows;
assert.ok(roles.filter((r) => r.role === 'center_back').every((r) => !r.initialJob?.prospective));
const receptions = read(`docs/performance/pr203/reception-${FINAL_VERSION}.json.gz`).result.rows;
const historical = read('docs/performance/pr201/receivers-frozen-v1.json.gz').result.rows;
for (const row of receptions.filter((r) => r.profile === 'historical-pr201-local')) {
  const old = historical.find(
    (r) =>
      r.variant === 'recovery' &&
      r.family === row.family &&
      r.skill === row.skill &&
      r.sample === row.sample &&
      (r.factor ?? null) === (row.factor ?? null),
  );
  assert.ok(old, 'Missing historical control');
  // Runtime is opt-in: the entire old physical state remains identical.
  assert.equal(row.finalHash, old.finalHash, 'PR201 current-source physical-state regression');
  assert.equal(hash(row.outcome), hash(old.outcome), 'PR201 outcome regression');
}
const register = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8');
assert.equal([...register.matchAll(/^### ([A-Z]+-\d+) —/gm)].length, 135);
assert.equal((register.match(/^- \[x\] COMPLETE/gm) ?? []).length, 0);
console.log(
  'PR203 evidence PASS: exact current-source labs, native movement/contact, preserved negatives, 60 PR201 complete-state controls; NOT_READY_FOR_PROMOTION',
);
