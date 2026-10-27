import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { BASE, git, hash, receipt } from './pr197Evidence.mjs';
const paths = git([
  'ls-tree',
  '-r',
  '--name-only',
  BASE,
  'src/core',
  'src/schemas',
  'src/types',
  'scripts',
  'package-lock.json',
])
  .trim()
  .split('\n')
  .filter((p) => !/\.test\./.test(p))
  .sort();
const bytes = execBatch(paths);
function execBatch(paths) {
  const raw = git(['cat-file', '--batch'], {
    encoding: null,
    input: Buffer.from(paths.map((p) => `${BASE}:${p}`).join('\n') + '\n'),
  });
  let offset = 0;
  return Object.fromEntries(
    paths.map((p) => {
      const end = raw.indexOf(10, offset),
        size = Number(raw.subarray(offset, end).toString().split(' ')[2]);
      if (!Number.isFinite(size)) throw Error('Missing baseline ' + p);
      const value = raw
        .subarray(end + 1, end + 1 + size)
        .toString('utf8')
        .replaceAll('\r\n', '\n');
      offset = end + size + 2;
      return [p, hash(value)];
    }),
  );
}
const registry = git(['show', `${BASE}:docs/match-engine/ASSUMPTIONS_REGISTER.md`]);
const statuses = [...registry.matchAll(/^### ([A-Z]+-\d+)[\s\S]*?^- \[ \] ([A-Z_]+)/gm)].map(
  (m) => ({ id: m[1], status: m[2] }),
);
if (statuses.length !== 134) throw Error('Baseline registry inventory changed');
receipt(
  'docs/performance/pr197/frozen-pr196.json',
  {
    schema: 'pr197-frozen-pr196-v1',
    base: BASE,
    pr196Head: '0498cf6bb63d81224493c8a67c232c0980f1b853',
    source: bytes,
    sourceHash: hash(bytes),
    registry: statuses,
    evidence: git(['ls-tree', '-r', BASE, 'docs/performance/pr195', 'docs/performance/pr196'])
      .trim()
      .split('\n')
      .map((line) => {
        const [metadata, path] = line.split('\t');
        return { path, gitBlob: metadata.split(' ')[2] };
      }),
    independentConfirmation: 'sealed; no independent inputs are opened',
  },
  process.argv.includes('--check'),
);
console.log('PR197 frozen baseline PASS', statuses.length, 'stable registry IDs', hash(bytes));
