import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import {
  hash,
  files,
  manifest,
  canonicalKernelManifest,
  PR192_BASE,
  POLICIES,
  readDevelopmentInput,
  writeReceipt,
} from './pr193Evidence.mjs';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import { readPr193Evidence } from './readPr193Evidence.mjs';
const root = 'docs/performance/pr193',
  read = (path) => JSON.parse(readFileSync(path));
const requireTrue = (value, message) => {
  if (!value) throw Error(message);
};
const frozen = read(root + '/frozen-pr192.json');
requireTrue(
  frozen.mergedCommit === PR192_BASE && hash(frozen.source) === frozen.sourceHash,
  'Frozen baseline manifest drift',
);
const entries = [...frozen.source, ...frozen.reports];
const buffer = execFileSync('git', ['cat-file', '--batch'], {
  input: entries.map((p) => `${PR192_BASE}:${p.path}`).join('\n') + '\n',
  maxBuffer: 128 * 1024 * 1024,
  windowsHide: true,
});
const baseline = new Map();
let offset = 0;
for (const entry of entries) {
  const end = buffer.indexOf(10, offset),
    header = buffer.subarray(offset, end).toString('utf8').split(' '),
    size = Number(header[2]);
  requireTrue(header[1] === 'blob' && Number.isFinite(size), 'Missing frozen blob ' + entry.path);
  const content = buffer
    .subarray(end + 1, end + 1 + size)
    .toString('utf8')
    .replaceAll('\r\n', '\n');
  offset = end + 1 + size + 1;
  requireTrue(hash(content) === entry.sha256, 'Frozen source hash drift ' + entry.path);
  baseline.set(entry.path, content);
}
for (const item of frozen.inputs) {
  const { input } = readDevelopmentInput(item.design, item.policy);
  requireTrue(hash(input) === item.sha256 && input.seed === item.seed, 'Frozen input drift');
}
const checkedArchives = new Set();
const validateSource = (r) => {
  requireTrue(hash(r.source) === r.sourceHash, 'Recorded source manifest drift');
  const archive = r.sourceArchive;
  requireTrue(archive && existsSync(archive.path), 'Missing source archive');
  if (checkedArchives.has(archive.path)) return;
  const bytes = readFileSync(archive.path),
    raw = gunzipSync(bytes),
    saved = JSON.parse(raw);
  requireTrue(
    hash(bytes) === archive.sha256 && hash(raw) === archive.originalSha256,
    'Source archive byte drift',
  );
  requireTrue(hash(saved.source) === r.sourceHash, 'Source archive manifest mismatch');
  const overrides = new Map(saved.overrides.map((p) => [p.path, p.content]));
  for (const p of r.source)
    requireTrue(
      hash(overrides.get(p.path) ?? baseline.get(p.path) ?? '') === p.sha256,
      'Unrecoverable source ' + p.path,
    );
  checkedArchives.add(archive.path);
};
const pointer = read(root + '/laboratory-final-v6.json'),
  bytes = readFileSync(pointer.archive.path),
  raw = gunzipSync(bytes),
  lab = JSON.parse(raw);
requireTrue(
  hash(bytes) === pointer.archive.sha256 && hash(raw) === pointer.archive.originalSha256,
  'Laboratory archive drift',
);
requireTrue(lab.rows.length === 132 && lab.rows.length === pointer.count, 'Incomplete laboratory');
const protocol = read(root + '/laboratory-protocol-v2.json');
requireTrue(hash(protocol) === lab.protocolHash, 'Frozen protocol drift');
validateSource(lab);
for (const r of lab.rows) {
  requireTrue(r.observerNeutral !== false, 'Laboratory observer changed state');
  requireTrue(
    r.config.seed === protocol.conditions.find((c) => c.id === r.config.id)?.seed,
    'Scenario provenance drift',
  );
  if (r.award?.cause === 'boundary')
    requireTrue(r.crossing?.restartTeam === r.award.team, 'Restart ownership drift');
  for (const c of r.contactFacts)
    if (c.surfaceContact)
      requireTrue(c.executed === c.surfaceContact.available, 'Fictional physical foot contact');
}
const matches = files(root + '/matches')
  .filter((p) => p.endsWith('.json'))
  .map((path) => ({ path, ...readPr193Evidence(path) }));
for (const r of matches) validateSource(r);
const kernel = canonicalKernelManifest(manifest()),
  kernelPaths = new Set(kernel.map((p) => p.path)),
  kernelHash = hash(kernel);
const final = matches.filter((r) => r.version === 'final-v2');
requireTrue(final.length === 31, 'Incomplete full-match development set');
for (const r of final) {
  requireTrue(r.status === 'full_time' && !r.failure, 'Incomplete match ' + r.path);
  requireTrue(
    hash(r.source.filter((p) => kernelPaths.has(p.path))) === kernelHash,
    'Final match uses another canonical kernel ' + r.path,
  );
}
for (const design of ['ww', 'ss', 'sw'])
  for (const policy of POLICIES)
    requireTrue(
      final.filter(
        (r) => r.design === design && r.policy === policy && r.mode === 'combined' && r.observed,
      ).length === 1,
      'Missing selected fixture',
    );
for (const bare of final.filter((r) => !r.observed)) {
  const observed = final.find(
    (r) =>
      r.design === bare.design && r.policy === bare.policy && r.mode === bare.mode && r.observed,
  );
  requireTrue(observed?.finalHash === bare.finalHash, 'Full observer-on/off divergence');
}
const control = final.find((r) => r.mode === 'baseline');
const historical = readPr192Evidence(
  'docs/performance/pr192/matches/ww-state-value-v1-combined-final-v2.json',
);
requireTrue(control?.finalHash === historical.finalHash, 'Default historical match changed');
const audit = read(root + '/foul-audit-v1.json');
validateSource(read(root + '/incidental-scoring-v3.json'));
validateSource(read(root + '/cost-prefix-v1.json'));
validateSource(read(root + '/laboratory-shot-quality-v1.json'));
if (existsSync(root + '/verification-final-v1.json')) validateSource(read(root + '/verification-final-v1.json'));
validateSource(audit);
requireTrue(
  audit.baselinePreserved && audit.foulChallenges === 63 && audit.behindFouls === 42,
  'PR192 foul audit drift',
);
for (const capture of audit.captures)
  requireTrue(hash(readFileSync(capture.path)) === capture.sha256, 'Foul capture bytes drift');
const historicalChanges = execFileSync(
  'git',
  ['diff', '--name-only', PR192_BASE, '--', 'docs/performance'],
  { encoding: 'utf8', windowsHide: true },
)
  .trim()
  .split('\n')
  .filter(Boolean);
requireTrue(
  historicalChanges.every((p) => p.startsWith(root + '/')),
  'Historical evidence was changed',
);
const integrity = {
  schema: 'mfl-pr193-integrity-v1',
  base: PR192_BASE,
  kernel,
  kernelHash,
  scenarios: 132,
  fullMatches: 31,
  selectedCombined: 15,
  observerPairs: 3,
  baselinePreserved: true,
  foulReplayPreserved: true,
  independentConfirmation: 'sealed',
  sourceArchives: [...checkedArchives].sort(),
  artifacts: files(root)
    .filter((p) => !p.includes('/evidence-index-'))
    .sort()
    .map((path) => ({ path, sha256: hash(readFileSync(path)) })),
};
if (process.argv.includes('--write'))
  writeReceipt(root + '/evidence-index-final-v1.json', integrity);
else if (!process.argv.includes('--validate-only')) {
  const recorded = read(root + '/evidence-index-final-v1.json');
  requireTrue(hash(recorded) === hash(integrity), 'PR193 artifact integrity drift');
}
console.log(
  JSON.stringify({
    integrity: 'PASS',
    kernelHash,
    scenarios: 132,
    fullMatches: 31,
    observerPairs: 3,
  }),
);
