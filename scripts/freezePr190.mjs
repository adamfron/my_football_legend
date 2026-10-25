import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sha = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const root = 'docs/performance/pr190';
mkdirSync(root, { recursive: true });
if (existsSync(`${root}/baseline.json`)) throw Error('Frozen baseline already exists');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commit !== '1af5b5c130b8707c9febb77b7bbc7cbc36bd0ea1') throw Error('Wrong baseline');
const source = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((path) => ({
    path: `src/${path}`,
    sha256: sha(readFileSync(`src/${path}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const historical = JSON.parse(readFileSync('docs/performance/pr189/evidence-index.json'));
if (sha(source) !== historical.sourceSha256)
  throw Error('Baseline source differs from PR189 final evidence');
const evidence = ['summary.json', 'replay-labs-final.json', 'evidence-index.json'].map((path) => ({
  path: `docs/performance/pr189/${path}`,
  sha256: sha(readFileSync(`docs/performance/pr189/${path}`, 'utf8')),
}));
writeFileSync(
  `${root}/baseline.json`,
  JSON.stringify(
    {
      schemaVersion: 1,
      commit,
      pr189Head: 'f0a80bae76d5cb812d4918ebdca4647d6417c916',
      sourceSha256: sha(source),
      source,
      evidence,
      independentCohort: 'unopened',
    },
    null,
    2,
  ) + '\n',
);
