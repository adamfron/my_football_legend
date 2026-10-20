import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import os from 'node:os';
import { pr172SourceHash, pr172Hash } from './pr172Evidence.ts';

const sourceHash = pr172SourceHash();
const harnessHash = pr172Hash(
  readFileSync('scripts/benchmarkPr178.mjs', 'utf8').replaceAll('\r\n', '\n'),
);
const path = 'docs/performance/PR178-validation-freeze.json';
if (existsSync(path)) {
  const previous = JSON.parse(readFileSync(path, 'utf8'));
  if (previous.sourceHash !== sourceHash || previous.harnessHash !== harnessHash)
    throw new Error('A frozen validation candidate cannot be overwritten');
  console.log('Existing identical validation freeze');
  process.exit(0);
}
const smokes = [];
for (const policy of ['legacy-pr176', 'risk-ablation-v1', 'state-value-v1'])
  for (const historical of [false, true]) {
    const root = historical ? '../pr178-final-historical' : '../pr178-development',
      id = historical ? 'pr177-dev-strength' : 'pr178-dev-keepers';
    const receipt = JSON.parse(readFileSync(`${root}-${policy}/${id}.json`, 'utf8'));
    if (receipt.manifest.sourceHash !== sourceHash || receipt.status !== 'full_time')
      throw new Error('Final physics smoke is not complete on this source');
    if (historical && policy === 'state-value-v1' && !receipt.equivalence?.equal)
      throw new Error('Full ranker observer equivalence missing');
    smokes.push({
      policy,
      id,
      finalHash: receipt.finalHash,
      inputHash: receipt.inputHash,
      equivalence: receipt.equivalence ?? null,
    });
  }
const hashes = Object.fromEntries(
  readdirSync('src/core/matchSimulation')
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
    .sort()
    .map((name) => [
      name,
      pr172Hash(readFileSync(`src/core/matchSimulation/${name}`, 'utf8').replaceAll('\r\n', '\n')),
    ]),
);
const receipt = {
  version: 1,
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash,
  harnessHash,
  policyConfigHash: hashes['decisionPolicyConfig.ts'],
  observerHash: pr172Hash(
    readFileSync('scripts/pr175Observer.ts', 'utf8').replaceAll('\r\n', '\n'),
  ),
  fixtureManifestHash: pr172Hash(
    readFileSync('docs/performance/PR178-new-fixture-manifest.json', 'utf8'),
  ),
  inputArchiveSha256: createHash('sha256')
    .update(readFileSync('docs/performance/pr178-evidence/initial-states.json.gz'))
    .digest('hex'),
  smokes,
  hashes,
  node: process.version,
  hardware: {
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemory: os.totalmem(),
  },
  method:
    'Freeze after R1 diagnostics demonstrated a moving aerial re-arm defect and R2 regression demonstrated double integration of contact time. Both focused corrections and final R3 physics/full-match/observer smoke are complete. Twelve reserved final validation designs remain unused. No policy weight tuning after these fixtures are opened. Any subsequent gameplay correction retires this holdout.',
};
writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ sourceHash, harnessHash, sealedFinalDesigns: 12 }));
