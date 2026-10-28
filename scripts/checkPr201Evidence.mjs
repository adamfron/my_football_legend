import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import console from 'node:console';
import { ROOT, BASE, read, hash, git } from './pr201Evidence.mjs';
import { resolveIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
const frozen = read(`${ROOT}/frozen-pr200.json`);
assert.equal(frozen.base, BASE);
assert.equal(hash(frozen.source), frozen.fingerprint);
git([
  'diff',
  '--exit-code',
  BASE,
  '--',
  ...[195, 196, 197, 198, 199, 200].map((n) => `docs/performance/pr${n}`),
]);
for (const p of [
  'src/core/matchSimulation/canonicalMovement.ts',
  'src/core/matchSimulation/ballPhysics.ts',
  'src/core/matchSimulation/footContact.ts',
  'src/schemas/domainSchemas.ts',
  'package-lock.json',
])
  assert.equal(hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')), frozen.source[p]);
const registry = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8');
assert.deepEqual(
  [...registry.matchAll(/^### ([A-Z]+-\d+) —/gm)].map((m) => m[1]),
  frozen.ids,
);
assert.equal((registry.match(/^- \[x\] COMPLETE/gm) ?? []).length, 0);
const verified = new Set();
const verifySource = (s) => {
  if (verified.has(s.path)) return;
  assert.ok(s.path.startsWith(`${ROOT}/source/`));
  const a = read(s.path);
  assert.equal(a.base, BASE);
  assert.equal(hash(a.manifest), s.fingerprint);
  for (const [p, t] of Object.entries(a.contents)) {
    assert.ok(
      /^(src\/(core|schemas|types)\/|scripts\/|package(?:-lock)?\.json$)/.test(p) &&
        !p.split('/').includes('..'),
    );
    assert.equal(hash(t), a.manifest[p]);
  }
  for (const [p, d] of Object.entries(a.manifest))
    assert.equal(a.contents[p] === undefined ? frozen.source[p] : hash(a.contents[p]), d);
  verified.add(s.path);
};
for (const n of readdirSync(ROOT).filter((n) => n.endsWith('.json.gz'))) {
  const e = read(`${ROOT}/${n}`);
  verifySource(e.result.source);
  assert.ok(e.costs.wallSeconds > 0 && e.costs.peakRSSKiB > 0);
}
for (const n of readdirSync(`${ROOT}/source`).filter((n) => /^[a-f0-9]{64}\.json\.gz$/.test(n)))
  verifySource({ path: `${ROOT}/source/${n}`, fingerprint: n.slice(0, 64) });
const verification = read(`${ROOT}/verification/core-v1.json`);
verifySource(verification.sourceAtRecord);
assert.equal(verification.tests.total, 2453);
assert.equal(verification.commands.find((c) => c.key === 'verify').exitCode, 0);
for (const c of verification.commands)
  assert.equal(hash(readFileSync(c.log)), c.sha256, 'Verification log bytes drift');
const baseline = read('docs/performance/pr200/local-frozen-final-v1.json.gz').result;
const local = read(`${ROOT}/receivers-frozen-v1.json.gz`).result;
for (const r of local.rows.filter((r) => r.variant === 'bounded')) {
  const old = baseline.rows.find((o) => o.variant === 'bounded' && o.ballHash === r.ballHash);
  assert.equal(r.finalHash, old.finalHash);
  assert.equal(hash(r.outcome), hash(old.outcome));
}
assert.equal(local.summary.bounded.trials, 180);
assert.equal(local.summary.recovery.trials, 180);
assert.ok(
  local.summary.recovery.control > local.summary.bounded.control &&
    local.summary.recovery.retained > local.summary.bounded.retained,
);
const fresh = read(`${ROOT}/receivers-fresh200-v1.json.gz`).result;
const oldFresh = read('docs/performance/pr200/local-fresh-final-v1.json.gz').result;
for (const r of fresh.rows.filter((r) => r.variant === 'bounded')) {
  const old = oldFresh.rows.find(
    (o) => o.variant === 'bounded' && o.ballHash === r.ballHash && o.factor === r.factor,
  );
  assert.ok(old);
  assert.equal(r.releaseHash, old.releaseHash);
  assert.equal(r.finalHash, old.finalHash);
}
assert.equal(fresh.summary.bounded.trials, 90);
const newFresh = read(`${ROOT}/receivers-fresh201-v1.json.gz`).result;
assert.equal(newFresh.summary.recovery.trials, 90);
assert.equal(newFresh.rejected.length, 0);
const negative = read(`${ROOT}/receivers-negative-v1.json.gz`).result;
assert.ok(
  negative.rows
    .filter((r) => r.group === 'unreachable')
    .every((r) => !r.outcome.directReceiverTouch),
);
const keepers = read(`${ROOT}/goalkeepers-v1.json.gz`).result;
assert.equal(keepers.rows.length, 126);
for (const r of keepers.rows.filter((r) => r.bounded === 'recovery')) {
  const old = keepers.rows.find(
    (o) =>
      o.bounded === true &&
      o.sample === r.sample &&
      o.scenario === r.scenario &&
      o.ability === r.ability,
  );
  assert.equal(r.withoutRecoveryHash, old.finalHash);
}
const info = read(`${ROOT}/information-boundary-final-v2.json.gz`).result;
assert.equal(info.rows.length, 7);
for (const [p, d] of Object.entries(read(info.source.path).manifest).filter(([p]) =>
  p.startsWith('src/'),
))
  assert.equal(
    hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')),
    d,
    'Current runtime drift from PR201 information proof',
  );
const pairs = [
  ['ww', 'opportunity-driven-v1'],
  ['ww', 'hierarchical-intent-v1'],
  ['ss', 'opportunity-driven-v1'],
  ['sw', 'state-value-v1'],
  ['sw', 'contextual-judgment-v1'],
  ['ww', 'phase-role-hybrid-v1'],
  ['ss', 'state-value-v1'],
];
for (const [design, policy] of pairs)
  for (const profile of [
    'canonical-pr199',
    'realism-candidate-v0',
    'realism-candidate-v1',
    'realism-candidate-no-recovery-v1',
  ]) {
    const { result: r, costs } = read(`${ROOT}/matches/${design}-${policy}-${profile}-v1.json.gz`);
    verifySource(r.source);
    assert.equal(r.status, 'full_time');
    assert.equal(r.failure, null);
    assert.ok(r.ticks >= 216000);
    assert.equal(r.seed, `pr200-development-${design}-${policy}`);
    assert.equal(r.manifest.fingerprint, resolveIntegrationProfile(profile, policy).fingerprint);
    assert.ok(costs.cpu.user > 0 && costs.peakRSSKiB > 0);
    if (profile === 'canonical-pr199') {
      const proof = read(`${ROOT}/baseline-final-pr200/${design}-${policy}.json`);
      verifySource(proof.source);
      assert.equal(proof.base, BASE);
      assert.equal(proof.initialHash, r.initialHash);
      assert.equal(
        proof.finalHash,
        r.finalHash,
        'Final merged PR200 canonical complete-state drift',
      );
      for (const [p, d] of Object.entries(read(proof.source.path).manifest).filter(([p]) =>
        p.startsWith('src/'),
      ))
        assert.equal(d, frozen.source[p], 'Reference runtime is not final merged PR200');
    }
    if (profile === 'realism-candidate-v0') {
      const old = read(
        `docs/performance/pr200/matches/${design}-${policy}-${profile}-${profile === 'canonical-pr199' ? 'v1' : 'v3'}.json.gz`,
      ).result;
      assert.equal(r.finalHash, old.finalHash, 'Historical complete-state hash drift');
    }
  }
const jobs = (text) => [...text.matchAll(/^ {2}([a-z0-9-]+):\r?$/gm)].map((m) => m[1]);
assert.deepEqual(
  jobs(readFileSync('.github/workflows/ci.yml', 'utf8')),
  jobs(git(['show', `${BASE}:.github/workflows/ci.yml`])),
);
console.log(
  'PR201 evidence PASS: immutable history, same-ball physical comparisons, 28 complete matches, bounded information, measured costs; canonical NOT READY',
);
