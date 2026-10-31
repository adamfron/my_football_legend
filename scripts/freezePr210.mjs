import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { BASE, pr210Source } from './pr210SourceGuard.mjs';
import { hash, normalized } from './pr199Evidence.mjs';
const root = 'docs/performance/pr210';
mkdirSync(root, { recursive: true });
const baseline = JSON.parse(
  readFileSync('docs/performance/pr209/current-source.json', 'utf8'),
).manifest;
for (const path of [
  'src/app/career/CareerCalendar.tsx',
  'src/app/match/TacticalMatchSandbox.tsx',
  'eslint.config.js',
  '.gitattributes',
  'vitest.config.ts',
])
  baseline[path] = hash(
    execFileSync('git', ['show', `${BASE}:${path}`], { encoding: 'utf8' }).replaceAll('\r\n', '\n'),
  );
const manifest = pr210Source(),
  fingerprint = hash(manifest);
const archive = {
  base: BASE,
  baseline,
  manifest,
  fingerprint,
  removed: Object.keys(baseline).filter((p) => !(p in manifest)),
  contents: Object.fromEntries(
    Object.keys(manifest)
      .filter((p) => baseline[p] !== manifest[p])
      .map((p) => [p, normalized(p)]),
  ),
};
writeFileSync(
  `${root}/source-${fingerprint}.json.gz`,
  gzipSync(JSON.stringify(archive), { level: 9 }),
);
writeFileSync(
  `${root}/source.json`,
  JSON.stringify({ base: BASE, manifest, fingerprint }, null, 2) + '\n',
);
console.log('PR210 source ' + fingerprint);
