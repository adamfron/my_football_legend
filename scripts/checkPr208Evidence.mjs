import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { checkPr208Source, BASE } from './pr208SourceGuard.mjs';
import { hash } from './pr199Evidence.mjs';
const binding = checkPr208Source(),
  root = 'docs/performance/pr208';
for (const name of readdirSync(root).filter((n) => /^source-[a-f0-9]+\.json.gz$/.test(n))) {
  const a = JSON.parse(gunzipSync(readFileSync(`${root}/${name}`)));
  assert.equal(a.base, BASE);
  assert.equal(hash(a.manifest), a.fingerprint);
  const restored = { ...a.baseline };
  for (const p of a.removed) delete restored[p];
  for (const [p, content] of Object.entries(a.contents)) {
    assert.ok(!p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'));
    restored[p] = hash(content);
  }
  assert.deepEqual(restored, a.manifest, 'Unreconstructible PR208 source');
}
const summary = JSON.parse(readFileSync(`${root}/summary.json`, 'utf8'));
assert.equal(summary.source, binding.fingerprint);
for (const mode of ['sweep', 'trajectories', 'live']) {
  const { receipt } = JSON.parse(
    gunzipSync(readFileSync(`${root}/${mode}-development-v1.json.gz`)),
  );
  assert.equal(receipt.source, binding.fingerprint);
  assert.equal(hash(receipt), summary.inputResults[mode]);
  if (mode === 'sweep') {
    assert.equal(receipt.result.rows.length, 960);
    for (const r of receipt.result.rows) {
      assert.equal(r.corrected.censored, false);
      assert.ok(r.corrected.maxImpactEnergyGain < 1e-8);
    }
  } else {
    assert.equal(receipt.result.originalExactReplay, true);
    assert.equal(receipt.result.unchangedLaunchVelocityAndSpin, true);
    assert.equal(receipt.result.originalRows, mode === 'live' ? 60 : 2752);
  }
}
assert.equal(summary.integration.confirmation, 'sealed');
assert.equal(summary.integration.maintainedCandidate, 'realism-candidate-v1 / PR201 unchanged');
assert.equal(summary.ground.recorded[1].correctedStop, summary.ground.recorded[1].legacyStop);
assert.ok(
  Math.abs(summary.ground.recorded[2].correctedStop - summary.ground.recorded[1].correctedStop) <
    0.001,
);
execFileSync(process.execPath, ['scripts/summarizePr208.mjs', '--check'], {
  stdio: 'inherit',
  windowsHide: true,
});
if (process.argv.includes('--replay'))
  for (const mode of ['sweep', 'trajectories', 'live'])
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/pr208Measurements.mjs',
        `--mode=${mode}`,
        '--check',
      ],
      { stdio: 'inherit', windowsHide: true },
    );
console.log(
  'PR208 source reconstruction, 960 physical sweeps, 5504 unchanged launches, 120 continuations and retained negative evidence PASS',
);
