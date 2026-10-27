import console from 'node:console';
import { readdirSync, readFileSync } from 'node:fs';
import { hash, read, git, BASE } from './pr197Evidence.mjs';
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
const frozen = read('docs/performance/pr197/frozen-pr196.json'),
  summary = read('docs/performance/pr197/summary.json');
assert(frozen.base === BASE && frozen.registry.length === 134, 'Frozen PR196 identity');
assert(
  !git([
    'diff',
    '--name-only',
    BASE,
    '--',
    'docs/performance/pr195',
    'docs/performance/pr196',
  ]).trim(),
  'Historical evidence changed',
);
const registry = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8');
const ids = [...registry.matchAll(/^### ([A-Z]+-\d+)/gm)].map((m) => m[1]);
const historicalIds = new Set(frozen.registry.map((r) => r.id));
assert(new Set(ids).size === ids.length, 'Duplicate registry IDs');
assert(
  hash(ids.filter((id) => historicalIds.has(id))) === hash(frozen.registry.map((r) => r.id)),
  'Stable historical registry IDs changed',
);
assert(!registry.includes('- [x] COMPLETE'), 'No independent completion claim');
for (const file of readdirSync('docs/performance/pr197/source')) {
  if (!file.endsWith('.json.gz')) throw Error('Unexpected source artifact ' + file);
  const source = read('docs/performance/pr197/source/' + file),
    id = file.replace('.json.gz', '');
  assert(source.base === BASE && hash(source.manifest) === id, 'Source archive identity ' + file);
  for (const [path, digest] of Object.entries(source.manifest)) {
    const actual = path in source.contents ? hash(source.contents[path]) : frozen.source[path];
    assert(actual === digest, 'Unrecoverable source ' + path + ' in ' + file);
  }
}
for (const { path, sha256 } of Object.values(summary.evidence))
  assert(hash(readFileSync(path)) === sha256, 'Receipt bytes ' + path);
for (const key of ['longBaseline', 'longDefence', 'longCombined']) {
  const result = read(summary.evidence[key].path).result;
  assert(result.original.length === 28, 'Original long-pass denominator');
  const ball = result.sameRelease.find((r) => r.factor === 'unchanged').launchHash;
  assert(
    result.sameRelease.every((r) => r.launchHash === ball && r.hashes.ball === ball),
    'Same-release ball drift',
  );
}
assert(
  summary.longPasses.longBaseline.directTouch === 0 &&
    summary.longPasses.longBaseline.opponentControl === 27,
  'Original PR196 outcomes not preserved',
);
assert(summary.longPasses.longDefence.opponentControl > 0, 'Defence must remain capable');
assert(summary.longPasses.longDefence.highOwnership === 0, 'High control persists');
const families = read(summary.evidence.families.path).result;
assert(families.rows.length === 1100, 'Passing family and rejection matrix');
for (const row of families.rows) {
  const p = row.contracts;
  assert(
    p.directTouch >= 0 &&
      p.directTouch <= 1 &&
      p.directControl <= p.directTouch + 1e-12 &&
      p.directRetained <= p.directControl + 1e-12,
    'Nested direct-path contracts',
  );
}
assert(summary.autonomous.n === 110, 'Autonomous catalogue');
assert(
  summary.candidateAudit.states === 15 &&
    summary.candidateAudit.boundedMenuInvariant &&
    summary.candidateAudit.boundedSceneInvariant,
  'Bounded/engineering separation',
);
assert(summary.fullMatches.length === 14, 'Fourteen complete development matches required');
assert(
  summary.fullReplayCount === 14,
  'Fourteen unchanged complete current-kernel replays required',
);
const pairs = new Map();
for (const row of summary.fullMatches) {
  if (row.model === 'combined')
    assert(
      row.version === 'v3',
      'All seven corrected matches must include observed-target admission',
    );
  assert(
    row.status === 'full_time' && row.flags.canonicalArrival === false,
    'Match completion/arrival isolation',
  );
  assert(
    row.measurementVersion === 'original-delivery-v3' && row.fullReplay?.equivalent,
    'Release-lineage version and physical neutrality',
  );
  const key = row.design + ':' + row.policy,
    other = pairs.get(key);
  if (other) assert(other.seed === row.seed && other.inputHash === row.inputHash, 'Paired inputs');
  else pairs.set(key, row);
}
assert(pairs.size === 7, 'Seven exact-input pairs');
assert(
  summary.canonicalReadiness === 'NOT READY' && summary.independentConfirmation === 'sealed',
  'Readiness boundary',
);
console.log(
  'PR197 evidence integrity PASS; 134 stable IDs, exact 28 originals, seven complete pairs, source archives recoverable',
);
