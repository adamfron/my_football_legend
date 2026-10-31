import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { hash } from './pr199Evidence.mjs';
import { BASE, checkPr209Source } from './pr209SourceGuard.mjs';
const root = 'docs/performance/pr209',
  binding = checkPr209Source();
const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
for (const name of readdirSync(root).filter((n) => /^source-[a-f0-9]+\.json.gz$/.test(n))) {
  const a = read(`${root}/${name}`),
    restored = { ...a.baseline };
  assert.equal(a.base, BASE);
  assert.equal(hash(a.manifest), a.fingerprint);
  for (const p of a.removed) delete restored[p];
  for (const [p, content] of Object.entries(a.contents)) {
    assert.ok(!p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'));
    restored[p] = hash(content);
  }
  assert.deepEqual(restored, a.manifest, 'Unreconstructible PR209 source');
}
const summary = read(`${root}/summary.json`);
assert.equal(summary.source, binding.fingerprint);
for (const mode of ['timing', 'retention', 'bounce']) {
  const { receipt } = read(`${root}/${mode}-development-v1.json.gz`);
  assert.equal(receipt.source, binding.fingerprint);
  assert.equal(hash(receipt), summary.inputResults[mode]);
  if (mode === 'timing') {
    assert.equal(receipt.result.rows.length, 210);
    assert.equal(receipt.result.skills.length, 256);
    const paths = new Map();
    for (const r of [...receipt.result.rows, ...receipt.result.skills]) {
      assert.ok(r.result.evaluations <= 800);
      assert.ok(r.result.path.speedBound <= r.plan.maximumFootSpeed + 1e-8);
      assert.ok(r.result.path.reachBound <= r.plan.reach + 1e-8);
      if (r.result.contact) {
        assert.equal(r.result.outcome, 'contact');
        assert.ok(Math.abs(r.result.separationAtContact) <= 1.01e-7);
        assert.ok(r.result.normalImpulse >= 0);
        for (const axis of ['x', 'y', 'z'])
          assert.ok(
            Math.abs(
              r.result.contact.outgoingVelocity[axis] -
                r.result.contact.incomingVelocity[axis] -
                r.result.contact.impulse[axis] / 0.43,
            ) < 1e-10,
          );
      } else assert.notEqual(r.result.outcome, 'contact');
      if ('timingSeconds' in r) {
        const key = JSON.stringify(r.config),
          value = hash([
            r.result.path.controls,
            r.result.path.finalVelocity,
            r.result.path.capabilityScale,
          ]);
        if (paths.has(key))
          assert.equal(value, paths.get(key), 'Timing re-planned the spatial swing');
        else paths.set(key, value);
      }
    }
    assert.equal(receipt.result.saveStateAdditionalBytes, 0);
  } else if (mode === 'retention') {
    assert.equal(receipt.result.rows.length, 10);
    const old = read('docs/performance/pr208/live-development-v1.json.gz').receipt.result;
    for (const r of receipt.result.rows) {
      const pair = old.rows
        .find((o) => hash(o.config) === hash(r.config))
        .arms.find((a) => a.model === 'contact-v1');
      for (const a of r.arms) {
        assert.deepEqual(a.outcome, pair[a.edition].outcome);
        assert.equal(a.finalHash, pair.paired[`${a.edition}Final`]);
        assert.equal(a.outcome.directReceiverTouch, true);
        assert.equal(a.outcome.receiverControl, true);
        assert.equal(
          a.classification,
          a.outcome.teamPossessionAtOneSecond ? 'own_team_control' : 'own_team_delivery_in_flight',
        );
      }
    }
  } else {
    assert.equal(receipt.result.rows.length, 6);
    const centimetre = receipt.result.rows.find((r) => r.case.name === 'one-centimetre-apex');
    assert.ok(centimetre.impacts[0].at > 0.08 && centimetre.impacts[0].at < 0.1);
    assert.ok(centimetre.impacts[0].position.x - centimetre.initial.position.x > 0.5);
    for (const r of receipt.result.rows)
      for (const f of r.observedContinuation.frames) {
        const b = f.sensor?.belief;
        if (b) assert.ok(b.evidenceAt <= f.at + 1e-8);
      }
  }
}
assert.equal(summary.integration.confirmation, 'sealed');
assert.equal(summary.integration.maintainedCandidate, 'realism-candidate-v1 / PR201 unchanged');
if (!process.argv.includes('--preflight')) {
  const index = read(`${root}/evidence-index.json`);
  for (const e of index.files)
    assert.equal(hash(readFileSync(e.path)), e.sha256, 'Evidence byte drift: ' + e.path);
  const verification = read(`${root}/verification.json`);
  assert.equal(verification.source, binding.fingerprint);
  assert.equal(verification.commands.find((c) => c.key === 'verify').exitCode, 0);
  for (const c of verification.commands) assert.equal(hash(readFileSync(c.log)), c.sha256);
}
execFileSync(process.execPath, ['scripts/summarizePr209.mjs', '--check'], {
  stdio: 'inherit',
  windowsHide: true,
});
if (process.argv.includes('--replay'))
  for (const mode of ['timing', 'retention', 'bounce'])
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/pr209Measurements.mjs',
        `--mode=${mode}`,
        '--check',
      ],
      { stdio: 'inherit', windowsHide: true },
    );
console.log(
  'PR209 source, temporal geometry, preserved continuations, bounce observations and evidence PASS; live temporal integration withheld',
);
