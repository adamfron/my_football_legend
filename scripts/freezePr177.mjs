import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';

const sha = (v) => createHash('sha256').update(v).digest('hex');
const path = 'docs/performance/PR177-validation-freeze.json';
if (existsSync(path)) throw new Error('Candidate already frozen; do not overwrite or retune on validation');
const manifest = JSON.parse(readFileSync('docs/performance/PR176-pr177-new-fixtures.json', 'utf8'));
const initial = JSON.parse(gunzipSync(readFileSync('docs/performance/PR176-pr177-initial-states.json.gz')));
for (const f of initial) {
  const e = manifest.designs.find((e) => e.design.id === f.design.id);
  if (sha(JSON.stringify(f.state)) !== e.inputHash || sha(JSON.stringify(f.session)) !== e.sessionHash) throw new Error('Frozen input mismatch');
}
const files = readdirSync('src/core/matchSimulation').filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts')).sort()
  .map((p) => ({ path: `src/core/matchSimulation/${p}`, text: readFileSync(`src/core/matchSimulation/${p}`, 'utf8').replaceAll('\r\n', '\n') }));
const sourceHash = sha(files.map((f) => `${f.path.split('/').at(-1)}\0${f.text}\0`).join(''));
const receipt = { version: 1, policy: 'state-value-v1', developmentRevision: 2,
  sourceHash, policyConfigSha256: sha(readFileSync('src/core/matchSimulation/decisionPolicyConfig.ts', 'utf8').replaceAll('\r\n', '\n')),
  files: files.map((f) => ({ path: f.path, normalizedSha256: sha(f.text) })),
  validation: manifest.designs.filter((f) => f.design.split === 'validation'),
  protocol: { frozenBeforeAnyValidationTick: true, policies: ['pristine-pr176', 'state-value-v1'], executionsPerFixturePerPolicy: 1,
    noTuningAfterOpening: true, defaultRemainsLegacyPendingAcceptance: true,
    note: 'The value model is final after two documented development revisions. Remaining development collection and correctness/performance checks may finish after this freeze; they cannot change the frozen candidate.' },
  overridenBlueprint: ['no active-match or replay migration', 'no turnover or counterattack rate ceiling'],
};
writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ sourceHash, validationDesigns: receipt.validation.length, frozen: true }));
