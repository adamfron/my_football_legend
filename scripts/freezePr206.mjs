import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import { source, hash, normalized } from './pr199Evidence.mjs';
import { BASE } from './pr206SourceGuard.mjs';
const manifest = source(),
  fingerprint = hash(manifest),
  root = 'docs/performance/pr206';
const previous = JSON.parse(
  readFileSync('docs/performance/pr205/current-source.json', 'utf8'),
).manifest;
for (const [path, digest] of Object.entries(previous))
  if (path.startsWith('src/') || path.startsWith('package')) assert.equal(manifest[path], digest);
mkdirSync(root, { recursive: true });
const archive = {
  base: BASE,
  fingerprint,
  manifest,
  contents: Object.fromEntries(
    Object.keys(manifest)
      .filter((p) => manifest[p] !== previous[p])
      .map((p) => [p, normalized(p)]),
  ),
};
writeFileSync(
  `${root}/source-${fingerprint}.json.gz`,
  gzipSync(JSON.stringify(archive), { level: 9 }),
  { flag: 'wx' },
);
writeFileSync(
  `${root}/current-source.json`,
  JSON.stringify({ base: BASE, fingerprint, manifest }, null, 2) + '\n',
);
console.log(fingerprint);
