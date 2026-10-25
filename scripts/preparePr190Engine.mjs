import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join, dirname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('='))),
  variant = args.get('variant') ?? 'spin-final';
if (
  !['negative-v2', 'v5', 'v6', 'measured', 'head-before-spin', 'spin-final', 'head'].includes(
    variant,
  )
)
  throw Error('Unknown engine variant');
const destination = resolve(args.get('destination') ?? `.benchmark-artifacts/pr190-${variant}`),
  allowed = resolve('.benchmark-artifacts');
if (!destination.startsWith(allowed + sep) || existsSync(destination))
  throw Error('Use a new directory inside .benchmark-artifacts');
const overlay = JSON.parse(
  gunzipSync(readFileSync(`docs/performance/pr190/engine-${variant}.json.gz`)),
);
mkdirSync(destination, { recursive: true });
const archive = join(destination, 'source.tar');
execFileSync('git', [
  'archive',
  '--format=tar',
  `--output=${archive}`,
  overlay.baseCommit,
  'src',
  'package.json',
]);
execFileSync('tar', ['-xf', archive, '-C', destination]);
// These are runtime reconstructions, not another test project discovered by Vitest.
for (const relative of readdirSync(join(destination, 'src'), { recursive: true }).filter((p) =>
  /\.test\.[tj]sx?$/.test(p),
)) {
  const file = resolve(destination, 'src', relative);
  if (!file.startsWith(join(destination, 'src') + sep)) throw Error('Unsafe test artifact path');
  unlinkSync(file);
}
for (const entry of overlay.files) {
  if (!entry.path.startsWith('src/') || entry.path.split('/').includes('..'))
    throw Error('Unsafe source path');
  const path = join(destination, entry.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, entry.source);
}
const sha = (v) => createHash('sha256').update(v).digest('hex');
const manifest = readdirSync(join(destination, 'src'), { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(join(destination, 'src', p), 'utf8').replaceAll('\r\n', '\n')),
  }));
if (sha(JSON.stringify(manifest)) !== overlay.sourceSha256)
  throw Error('Reconstructed engine source differs');
console.log(
  JSON.stringify({ destination, sourceSha256: overlay.sourceSha256, reconstruction: 'PASS' }),
);
