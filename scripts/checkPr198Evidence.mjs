import console from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { BASE, read, hash, git } from './pr198Evidence.mjs';
import { catalogue } from './pr198Catalogue.mjs';
const assert = (ok, message) => {
  if (!ok) throw Error(message);
};
const folder = 'docs/performance/pr198/',
  frozen = read(folder + 'frozen-pr197.json'),
  summary = read(folder + 'summary.json');
assert(frozen.base === BASE && frozen.registry.length === 134, 'PR197 baseline identity');
assert(
  !git([
    'diff',
    '--name-only',
    BASE,
    '--',
    'docs/performance/pr195',
    'docs/performance/pr196',
    'docs/performance/pr197',
  ]).trim(),
  'Frozen historical evidence changed',
);
const registry = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8'),
  ids = [...registry.matchAll(/^### ([A-Z]+-\d+)/gm)].map((m) => m[1]);
const historical = new Set(frozen.registry.map((r) => r.id));
assert(
  new Set(ids).size === ids.length &&
    hash(ids.filter((id) => historical.has(id))) === hash([...historical]),
  'Stable historical IDs changed',
);
assert(
  ids.length === 135 && ids.includes('TACT-013'),
  'Dedicated initiative issue or registry count',
);
assert(!/^- \[x\] COMPLETE/m.test(registry), 'Independent completion asserted');
for (const name of readdirSync(folder + 'source')) {
  assert(name.endsWith('.json.gz'), 'Unexpected source artifact');
  const archive = read(folder + 'source/' + name);
  assert(
    archive.base === BASE && hash(archive.manifest) === name.replace('.json.gz', ''),
    'Source identity',
  );
  for (const [path, digest] of Object.entries(archive.manifest))
    assert(
      (path in archive.contents ? hash(archive.contents[path]) : frozen.source[path]) === digest,
      'Unrecoverable source ' + path,
    );
}
for (const [key, [name]] of Object.entries(catalogue)) {
  const path = folder + name,
    record = read(path),
    link = summary.evidence[key];
  assert(link.path === path && link.sha256 === hash(readFileSync(path)), 'Evidence bytes ' + key);
  assert(
    hash(read(record.result.source.path).manifest) === record.result.source.fingerprint,
    'Source link ' + key,
  );
}
const releases = read(folder + 'releases-v1.json.gz').result;
assert(
  releases.rows.length === 180 && releases.rejected.length === 40,
  'Same-release/rejection denominators',
);
for (const row of releases.rows) {
  assert(
    row.ballHash === hash(row.state.ball) && row.releaseHash === hash(row.state),
    'Frozen ball/state drift',
  );
  assert(
    row.contract.passId === row.state.lastPassDiagnostic.passId &&
      row.contract.receiverId === row.state.lastPassDiagnostic.intendedReceiverId,
    'Delivery lineage',
  );
}
for (const model of [
  'baseline',
  'defence',
  'height',
  'receiver',
  'dh',
  'dr',
  'hr',
  'combined',
  'synchronized',
]) {
  const rows = read(summary.evidence['reception-' + model].path).result.rows;
  assert(rows.length === 180, 'Ablation denominator');
  for (let i = 0; i < rows.length; i++)
    assert(
      rows[i].ballHash === releases.rows[i].ballHash &&
        rows[i].outcome.contract.passId === releases.rows[i].contract.passId,
      'Ablation changed original ball/episode',
    );
}
assert(
  summary.ablations.baseline.touch === 160 &&
    summary.ablations.baseline.control === 128 &&
    summary.ablations.baseline.retained === 107,
  'PR197 baseline reproduction',
);
assert(
  summary.ablations.combined.touch === 154 &&
    summary.ablations.combined.control === 123 &&
    summary.ablations.combined.retained === 116,
  'PR197 regression reproduction',
);
assert(summary.rejectedReceiverV1.touch === 129, 'Rejected receiver result was lost');
assert(
  summary.receiverTransitions.lostTouch > 0 && summary.sensitivity.lostTouch > 0,
  'Negative receiver cases missing',
);
assert(
  summary.originalShotRebounds.physicallyLooseKeeperRebound > 0 &&
    summary.originalShotRebounds.requests === 64,
  'Physical original-shot rebound witness',
);
for (const policy of [
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
]) {
  assert(
    summary.opportunityPolicies.baseline[policy].loftCandidate === 0,
    'Native bounded loft baseline changed',
  );
  assert(
    summary.opportunityPolicies.loft[policy].loftCandidate > 0,
    'Observed loft stage not demonstrated',
  );
}
assert(summary.fullMatches.length === 14, 'Seven complete match pairs required');
const pairs = new Map();
for (const match of summary.fullMatches) {
  assert(
    hash(readFileSync(match.path)) === match.sha256 && match.status === 'full_time',
    'Full-match receipt',
  );
  assert(
    match.flags.canonicalArrival === false &&
      match.flags.defensiveReception &&
      match.flags.heightAwarePassing &&
      match.flags.receiverAnticipation,
    'Independent arrival/PR197 baseline flags',
  );
  assert(
    match.flags.receiverSynchronisation === (match.model === 'corrected') &&
      match.flags.observedLoftedPasses === (match.model === 'corrected'),
    'PR198 experimental isolation',
  );
  const key = match.design + ':' + match.policy,
    other = pairs.get(key);
  if (other)
    assert(
      other.seed === match.seed && other.originalInputHash === match.originalInputHash,
      'Unpaired full-match inputs',
    );
  else pairs.set(key, match);
}
assert(pairs.size === 7, 'Seven policy/design pairs');
for (const path of [
  'src/core/matchSimulation/ballPhysics.ts',
  'src/core/matchSimulation/canonicalMovement.ts',
  'src/core/matchSimulation/footContact.ts',
  'src/schemas/domainSchemas.ts',
])
  assert(
    hash(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')) === frozen.source[path],
    'Unjustified shared physics/attribute change: ' + path,
  );
assert(
  summary.defaultPolicy === 'state-value-v1' &&
    summary.canonicalReadiness === 'NOT READY' &&
    summary.independentConfirmation === 'sealed',
  'Readiness boundaries',
);
const verification = read(folder + 'verification.json');
assert(
  verification.status === 'PASS' &&
    verification.exactSource.length === Object.keys(catalogue).length,
  'Final local verification/source coverage',
);
for (const log of verification.logs)
  assert(hash(readFileSync(log.path)) === log.sha256, 'Verification log bytes: ' + log.path);
console.log(
  'PR198 integrity PASS: 134 preserved IDs + TACT-013; identical actual balls; isolated experiments; negatives; real rebounds; seven complete pairs; bounded information',
);
