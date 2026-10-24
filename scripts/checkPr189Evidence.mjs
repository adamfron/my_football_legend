import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const root = 'docs/performance/pr189';
const path = `${root}/evidence-index.json`;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const source = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const sourceSha256 = sha(JSON.stringify(source));
const files = readdirSync(root)
  .filter((p) => p !== 'evidence-index.json')
  .sort();
const artifacts = files.map((p) => ({
  path: `${root}/${p}`,
  sha256: sha(readFileSync(`${root}/${p}`)),
}));
const runners = readdirSync('scripts')
  .filter((p) => /Pr189|Pr188Baseline/.test(p))
  .sort()
  .map((p) => ({
    path: `scripts/${p}`,
    sha256: sha(readFileSync(`scripts/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
if (process.argv.includes('--write')) {
  writeFileSync(
    path,
    JSON.stringify({ schemaVersion: 1, sourceSha256, source, runners, artifacts }, null, 2) + '\n',
  );
} else {
  const saved = JSON.parse(readFileSync(path));
  if (saved.sourceSha256 !== sourceSha256) throw Error('PR189 source changed');
  for (const entry of saved.artifacts)
    if (sha(readFileSync(entry.path)) !== entry.sha256)
      throw Error(`Evidence changed: ${entry.path}`);
  for (const entry of saved.runners)
    if (sha(readFileSync(entry.path, 'utf8').replaceAll('\r\n', '\n')) !== entry.sha256)
      throw Error(`Runner changed: ${entry.path}`);
  console.log(
    JSON.stringify({ sourceSha256, artifacts: saved.artifacts.length, integrity: 'PASS' }),
  );
}
