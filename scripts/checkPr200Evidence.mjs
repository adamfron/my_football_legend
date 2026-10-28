import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { hash, read, git, ROOT, BASE } from './pr200Evidence.mjs';
import { resolveIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
import { DEFAULT_DECISION_POLICY } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import { parseRegistry } from './realismProgress.mjs';
import { validateIntegrationProgress } from './integrationProgress.mjs';
const frozen = read(`${ROOT}/frozen-pr199.json`),
  registry = parseRegistry(readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8'));
assert.deepEqual(
  registry.map((r) => r.id),
  frozen.ids,
);
assert.equal(new Set(frozen.ids).size, 135);
assert.equal(registry.filter((r) => r.checked).length, 0);
assert.equal(DEFAULT_DECISION_POLICY, 'state-value-v1');
assert.equal(frozen.base, BASE);
assert.equal(hash(frozen.source), frozen.fingerprint);
git([
  'diff',
  '--exit-code',
  BASE,
  '--',
  ...[195, 196, 197, 198, 199].map((n) => `docs/performance/pr${n}`),
]);
for (const p of [
  'src/core/matchSimulation/canonicalMovement.ts',
  'src/core/matchSimulation/ballPhysics.ts',
  'src/core/matchSimulation/footContact.ts',
  'src/schemas/domainSchemas.ts',
])
  assert.equal(
    hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')),
    frozen.source[p],
    'Physical source/attributes changed',
  );
const sourceChecked = new Set();
const verifySource = (s) => {
  assert.match(s.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(s.path.startsWith(`${ROOT}/source/`));
  if (sourceChecked.has(s.path)) return;
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
    assert.equal(
      a.contents[p] === undefined ? frozen.source[p] : hash(a.contents[p]),
      d,
      'Unreconstructible source',
    );
  sourceChecked.add(s.path);
};
const locals = [
  'information-boundary-final-v1.json.gz',
  'local-frozen-v1.json.gz',
  'local-changed-v1.json.gz',
  'local-fresh-v1.json.gz',
  'local-bounded-diagnosis-v1.json.gz',
  'goalkeepers-v1.json.gz',
  'goalkeepers-v2.json.gz',
  'goalkeepers-v3.json.gz',
  'local-frozen-final-v1.json.gz',
  'local-fresh-final-v1.json.gz',
  'local-bounded-diagnosis-final-v1.json.gz',
];
for (const n of locals) {
  const e = read(`${ROOT}/${n}`);
  verifySource(e.result.source);
  assert.ok(e.result.rows.length);
  assert.ok(e.costs.wallSeconds > 0);
}
// Bind the final runtime to the live-boundary proof, including the deferred
// schema initialization correction repeated by current-source physical replays.
const finalRuntime = read(
  read(`${ROOT}/information-boundary-final-v1.json.gz`).result.source.path,
).manifest;
for (const [p, d] of Object.entries(finalRuntime).filter(([p]) => p.startsWith('src/')))
  assert.equal(
    hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')),
    d,
    'Final runtime differs from information-boundary proof',
  );
const local = read(`${ROOT}/local-frozen-v1.json.gz`).result;
assert.deepEqual(
  [local.summary.R.all.touch, local.summary.R.all.control, local.summary.R.all.retained],
  [154, 123, 116],
);
assert.deepEqual(
  [local.summary.S.all.touch, local.summary.S.all.control, local.summary.S.all.retained],
  [149, 113, 108],
);
assert.equal(
  new Set(read(`${ROOT}/local-changed-v1.json.gz`).result.rows.map((r) => r.ballHash)).size,
  11,
);
const cases = [
  ['ww', 'opportunity-driven-v1'],
  ['ww', 'hierarchical-intent-v1'],
  ['ss', 'opportunity-driven-v1'],
  ['sw', 'state-value-v1'],
  ['sw', 'contextual-judgment-v1'],
  ['ww', 'phase-role-hybrid-v1'],
  ['ss', 'state-value-v1'],
];
const expected = [
  ['canonical-pr199', 'v1'],
  ['realism-candidate-v0', 'v1'],
  ['historical-pr198-s', 'v1'],
  ['realism-candidate-no-belief-v0', 'v1'],
  ['realism-candidate-v0', 'v2'],
  ['realism-candidate-v0', 'v3'],
];
let matchCount = 0;
for (const [design, policy] of cases) {
  let inputHash;
  for (const [profile, version] of expected) {
    const path = `${ROOT}/matches/${design}-${policy}-${profile}-${version}.json.gz`;
    assert.ok(existsSync(path), 'Missing required full comparison ' + path);
    const { result: r, costs } = read(path);
    verifySource(r.source);
    assert.equal(r.status, 'full_time');
    assert.equal(r.failure, null);
    assert.equal(r.fullMatchRequested, true);
    assert.ok(r.ticks >= 216000);
    assert.match(r.finalHash, /^[a-f0-9]{64}$/);
    assert.equal(r.seed, `pr200-development-${design}-${policy}`);
    assert.equal(r.policy, policy);
    if (inputHash) assert.equal(r.originalInputHash, inputHash);
    else inputHash = r.originalInputHash;
    assert.deepEqual(r.manifest.features, resolveIntegrationProfile(profile, policy).features);
    if (version === 'v3')
      assert.equal(r.manifest.fingerprint, resolveIntegrationProfile(profile, policy).fingerprint);
    if (version === 'v3')
      for (const [p, d] of Object.entries(read(r.source.path).manifest).filter(([p]) =>
        p.startsWith('src/'),
      ))
        if (p !== 'src/core/matchSimulation/liveBallFlight.ts')
          assert.equal(
            hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')),
            d,
            'Final candidate runtime drift',
          );
    assert.ok(costs.wallSeconds > 0 && costs.peakRSSKiB > 0 && Number.isFinite(costs.cpu.user));
    matchCount++;
  }
}
assert.equal(
  readdirSync(`${ROOT}/matches`).filter((n) => n.endsWith('.json.gz')).length,
  matchCount,
);
const inventory = read(`${ROOT}/inventory.json`);
verifySource(inventory.source);
assert.equal(inventory.records.length, inventory.flags.length);
for (const m of inventory.records) {
  assert.ok(m.sourceLocations.length);
  assert.ok(existsSync(m.evidence), 'Missing mechanism evidence ' + m.evidence);
}
validateIntegrationProgress(read('docs/match-engine/INTEGRATION_EVIDENCE.json'), registry);
const report = readFileSync(
  'docs/PR200_MATCH_ENGINE_INTEGRATION_CANDIDATE_RECEIVER_MOTOR_AND_BOUNDED_PERCEPTION.md',
  'utf8',
);
assert.equal([...report.matchAll(/^## \d+\. /gm)].length, 26);
assert.ok(report.includes('NOT_READY_FOR_PROMOTION'));
const safe = resolve(ROOT);
assert.ok(safe.startsWith(resolve('docs/performance') + sep));
console.log(
  'PR200 evidence PASS',
  matchCount,
  'complete matches;',
  sourceChecked.size,
  'exact source versions; historical evidence immutable; NOT READY',
);
