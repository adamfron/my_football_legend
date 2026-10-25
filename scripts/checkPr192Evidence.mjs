import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { readPr192Evidence } from './readPr192Evidence.mjs';
const root = 'docs/performance/pr192',
  out = root + '/evidence-index.json';
const sha = (v) => createHash('sha256').update(v).digest('hex');
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(dir + '/' + d.name) : [dir + '/' + d.name],
  );
const source = files('src')
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((path) => ({ path, sha256: sha(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')) }));
const runners = files('scripts')
  .filter((p) => /Pr192|Pr191Baseline/.test(p))
  .sort()
  .map((path) => ({ path, sha256: sha(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')) }));
const artifacts = files(root)
  .filter((p) => p !== out)
  .sort()
  .map((path) => ({ path, sha256: sha(readFileSync(path)) }));
const versions = readPr192Evidence(root + '/source-versions.json').versions;
for (const file of readdirSync(root + '/matches').filter((p) => p.endsWith('.json'))) {
  const r = readPr192Evidence(root + '/matches/' + file),
    version = versions.find((v) => v.sourceHash === r.sourceHash);
  if (!version) throw Error('Unretained source version ' + file);
  const overrides = JSON.parse(gunzipSync(readFileSync(version.path))).overrides;
  if (sha(JSON.stringify(r.manifest)) !== r.sourceHash) throw Error('Manifest drift ' + file);
  for (const entry of r.manifest) {
    const content =
      overrides.find((o) => o.path === entry.path)?.content ??
      readFileSync(entry.path, 'utf8').replaceAll('\r\n', '\n');
    if (sha(content) !== entry.sha256)
      throw Error('Recorded source bytes drift ' + file + ' ' + entry.path);
  }
  if (
    r.capture &&
    sha(JSON.stringify(JSON.parse(gunzipSync(readFileSync(r.capture.path))))) !== r.capture.sha256
  )
    throw Error('Capture drift ' + file);
}
const summary = readPr192Evidence(root + '/development-summary.json');
if (
  !summary.complete ||
  summary.completedSelected !== 15 ||
  summary.observerNeutrality.some((r) => !r.equal)
)
  throw Error('Incomplete or non-neutral development evidence');
for (const row of summary.selected) if (!row.detail) throw Error('Missing physical detail');
const currentRunnerHash = sha(
  readFileSync('scripts/benchmarkPr192Matches.mjs', 'utf8').replaceAll('\r\n', '\n'),
);
for (const row of summary.selected) {
  const receipt = readPr192Evidence(row.path);
  if (
    !row.path.endsWith('-final-v2.json') ||
    receipt.runnerHash !== currentRunnerHash ||
    receipt.sourceHash !== sha(JSON.stringify(source))
  )
    throw Error('Final cohort does not match frozen current source/runner');
}
const human = readPr192Evidence(root + '/reconstructed-human.json');
if (!human.numericMatchToRoundedHumanEvidence || human.selectedId !== 'footballer_pro_9_12')
  throw Error('Human reconstruction mismatch');
const index = {
  schema: 'mfl-pr192-evidence-index-v1',
  sourceHash: sha(JSON.stringify(source)),
  source,
  runners,
  artifacts,
};
if (process.argv.includes('--write')) writeFileSync(out, JSON.stringify(index, null, 2) + '\n');
else {
  if (!existsSync(out) || JSON.stringify(JSON.parse(readFileSync(out))) !== JSON.stringify(index))
    throw Error('PR192 evidence/source/runner drift');
  console.log({ integrity: 'PASS', artifacts: artifacts.length, sourceHash: index.sourceHash });
}
