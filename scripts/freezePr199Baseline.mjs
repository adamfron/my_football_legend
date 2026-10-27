import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { BASE, ROOT, git, hash, read, write, options } from './pr199Evidence.mjs';
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
    if (!Number.isFinite(size)) throw Error('Missing baseline ' + p);
    const content = raw
      .subarray(end + 1, end + 1 + size)
      .toString('utf8')
      .replaceAll('\r\n', '\n');
    offset = end + size + 2;
    return [p, hash(content)];
  }),
);
const register = git(['show', `${BASE}:docs/match-engine/ASSUMPTIONS_REGISTER.md`]);
const registry = [
  ...register.matchAll(/^### ([A-Z]+-\d+) — ([^\n]+)\n+?- \[([ x])\] ([A-Z_]+)/gm),
].map((m) => ({ id: m[1], title: m[2].trim(), checked: m[3] === 'x', status: m[4] }));
if (registry.length !== 135 || new Set(registry.map((r) => r.id)).size !== registry.length)
  throw Error('Frozen registry identities');
const summary = read('docs/performance/pr198/summary.json');
const result = {
  schema: 'pr199-frozen-pr198-v1',
  base: BASE,
  pr198Head: 'ef79798795cde20d802f58e1283ac2b4f9ed11df',
  source,
  fingerprint: hash(source),
  registry,
  featureFlags: git(['show', `${BASE}:src/core/matchSimulation/matchState.ts`]).match(
    /experimental\w+\?: boolean;/g,
  ),
  ablations: summary.ablations,
  changedContacts: summary.receiverPairs.filter((r) => r.lostTouch || r.gainedTouch),
  historicalEvidence: git([
    'ls-tree',
    '-r',
    BASE,
    'docs/performance/pr195',
    'docs/performance/pr196',
    'docs/performance/pr197',
    'docs/performance/pr198',
  ])
    .trim()
    .split('\n')
    .map((line) => {
      const [meta, path] = line.split('\t');
      return { path, gitBlob: meta.split(' ')[2] };
    }),
  scope: {
    releases: 'docs/performance/pr198/releases-v1.json.gz',
    originalLong: 'docs/performance/pr196/long-pass-v4.json.gz',
    sensitivity: 'docs/performance/pr198/sensitivity-v2.json.gz',
    opportunities: [
      'docs/performance/pr198/opportunities-baseline-v2.json.gz',
      'docs/performance/pr198/opportunities-loft-v2.json.gz',
    ],
    fullMatches: 'docs/performance/pr198/summary.json#matches',
    receipts: 'docs/performance/pr198/verification.json',
    independentConfirmation: 'sealed',
  },
};
const path = `${ROOT}/frozen-pr198.json`;
if (options.has('check')) {
  if (hash(read(path)) !== hash(result)) throw Error('Frozen baseline drift');
} else write(path, result);
console.log(
  'PR199 frozen',
  registry.length,
  'IDs;',
  result.changedContacts.length,
  'changed contacts;',
  result.fingerprint,
);
void process;
