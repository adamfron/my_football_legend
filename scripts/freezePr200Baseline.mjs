import console from 'node:console';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { BASE, ROOT, git, hash, read, write } from './pr200Evidence.mjs';
const paths = git([
  'ls-tree',
  '-r',
  '--name-only',
  BASE,
  'src/core',
  'src/schemas',
  'src/types',
  'scripts',
  'package.json',
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
    if (!Number.isFinite(size)) throw Error('Missing merged baseline: ' + p);
    const content = raw
      .subarray(end + 1, end + 1 + size)
      .toString('utf8')
      .replaceAll('\r\n', '\n');
    offset = end + size + 2;
    return [p, hash(content)];
  }),
);
const register = git(['show', `${BASE}:docs/match-engine/ASSUMPTIONS_REGISTER.md`]);
const ids = [...register.matchAll(/^### ([A-Z]+-\d+) — /gm)].map((m) => m[1]);
if (ids.length !== 135 || new Set(ids).size !== 135) throw Error('Registry identities');
const result = {
  schema: 'pr200-frozen-pr199-v1',
  base: BASE,
  pr199Head: 'db2554c0109430429ecd4b31c1dae2d5ffcf20bb',
  source,
  fingerprint: hash(source),
  ids,
  evidence: git([
    'ls-tree',
    '-r',
    BASE,
    ...[195, 196, 197, 198, 199].map((n) => `docs/performance/pr${n}`),
  ])
    .trim()
    .split('\n')
    .map((line) => {
      const [meta, path] = line.split('\t');
      return { path, gitBlob: meta.split(' ')[2] };
    }),
  receiver: { R: [180, 154, 123, 116], S: [180, 149, 113, 108] },
  independentConfirmation: 'sealed',
  canonicalReadiness: 'NOT READY',
};
const path = `${ROOT}/frozen-pr199.json`;
if (process.argv.includes('--check')) {
  if (hash(read(path)) !== hash(result)) throw Error('Frozen PR199 drift');
} else write(path, result);
console.log('PR200 frozen merged PR199:', result.base, result.fingerprint, ids.length);
