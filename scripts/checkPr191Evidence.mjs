import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const root = 'docs/performance/pr191',
  output = `${root}/evidence-index.json`,
  sha = (v) => createHash('sha256').update(v).digest('hex');
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(dir + '/' + d.name) : [dir + '/' + d.name],
  );
const source = files('src')
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((path) => ({ path, sha256: sha(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')) }));
const runners = readdirSync('scripts')
  .filter((p) => /Pr191|Pr190Baseline/.test(p))
  .sort()
  .map((p) => ({
    path: 'scripts/' + p,
    sha256: sha(readFileSync('scripts/' + p, 'utf8').replaceAll('\r\n', '\n')),
  }));
const artifacts = files(root)
  .filter((p) => p !== output)
  .sort()
  .map((path) => ({ path, sha256: sha(readFileSync(path)) }));
const index = {
  schemaVersion: 1,
  sourceHash: sha(JSON.stringify(source)),
  source,
  runners,
  artifacts,
};
if (process.argv.includes('--write')) writeFileSync(output, JSON.stringify(index, null, 2) + '\n');
else {
  const expected = JSON.parse(readFileSync(output));
  if (JSON.stringify(expected) !== JSON.stringify(index))
    throw Error('PR191 source/runner/artifact integrity changed');
  console.log(
    JSON.stringify({
      integrity: 'PASS',
      artifacts: artifacts.length,
      sourceHash: index.sourceHash,
    }),
  );
}
