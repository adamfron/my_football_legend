import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { BASE, git, hash, receipt } from './pr198Evidence.mjs';
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
const raw = git(['cat-file', '--batch'], {
  encoding: null,
  input: Buffer.from(paths.map((p) => `${BASE}:${p}`).join('\n') + '\n'),
});
let offset = 0;
const source = Object.fromEntries(
  paths.map((p) => {
    const end = raw.indexOf(10, offset),
      size = Number(raw.subarray(offset, end).toString().split(' ')[2]);
    if (!Number.isFinite(size)) throw Error('Missing baseline: ' + p);
    const content = raw
      .subarray(end + 1, end + 1 + size)
      .toString('utf8')
      .replaceAll('\r\n', '\n');
    offset = end + size + 2;
    return [p, hash(content)];
  }),
);
const register = git(['show', `${BASE}:docs/match-engine/ASSUMPTIONS_REGISTER.md`]);
const registry = [...register.matchAll(/^### ([A-Z]+-\d+)[\s\S]*?^- \[ \] ([A-Z_]+)/gm)].map(
  (m) => ({ id: m[1], status: m[2] }),
);
if (registry.length !== 134) throw Error('Baseline stable-ID count');
receipt(
  'docs/performance/pr198/frozen-pr197.json',
  {
    schema: 'pr198-frozen-pr197-v1',
    base: BASE,
    pr197Head: '9d8daa6db3ea89d2dade51bf9de3365ee521d763',
    source,
    fingerprint: hash(source),
    registry,
    evidence: git([
      'ls-tree',
      '-r',
      BASE,
      'docs/performance/pr195',
      'docs/performance/pr196',
      'docs/performance/pr197',
    ])
      .trim()
      .split('\n')
      .map((line) => {
        const [metadata, path] = line.split('\t');
        return { path, gitBlob: metadata.split(' ')[2] };
      }),
    independentConfirmation: 'sealed; development inputs only',
  },
  process.argv.includes('--check'),
);
console.log('PR198 frozen PR197 baseline PASS', hash(source), registry.length);
