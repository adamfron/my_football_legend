import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
const sha = (v) => createHash('sha256').update(v).digest('hex'),
  root = 'docs/performance/pr190',
  path = `${root}/evidence-index.json`;
const source = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const runners = readdirSync('scripts')
  .filter((p) => /Pr190|Pr189Baseline/.test(p))
  .sort()
  .map((p) => ({
    path: `scripts/${p}`,
    sha256: sha(readFileSync(`scripts/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const artifacts = readdirSync(root)
  .filter((p) => p !== 'evidence-index.json')
  .sort()
  .map((p) => ({ path: `${root}/${p}`, sha256: sha(readFileSync(`${root}/${p}`)) }));
const result = {
  schemaVersion: 1,
  sourceSha256: sha(JSON.stringify(source)),
  source,
  runners,
  artifacts,
};
if (process.argv.includes('--write')) writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
else {
  const saved = JSON.parse(readFileSync(path));
  if (saved.sourceSha256 !== result.sourceSha256) throw Error('PR190 head source changed');
  for (const e of saved.artifacts)
    if (sha(readFileSync(e.path)) !== e.sha256) throw Error(`Evidence changed: ${e.path}`);
  for (const e of saved.runners)
    if (sha(readFileSync(e.path, 'utf8').replaceAll('\r\n', '\n')) !== e.sha256)
      throw Error(`Runner changed: ${e.path}`);
  console.log(
    JSON.stringify({
      integrity: 'PASS',
      artifacts: saved.artifacts.length,
      sourceSha256: result.sourceSha256,
    }),
  );
}
