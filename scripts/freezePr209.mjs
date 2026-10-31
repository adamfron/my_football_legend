import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { source, hash, normalized } from './pr199Evidence.mjs';
import { BASE } from './pr209SourceGuard.mjs';
const root = 'docs/performance/pr209';
const previous = JSON.parse(
  readFileSync('docs/performance/pr208/current-source.json', 'utf8'),
).manifest;
const manifest = source(),
  fingerprint = hash(manifest);
const contents = Object.fromEntries(
  Object.keys(manifest)
    .filter((p) => manifest[p] !== previous[p])
    .map((p) => {
      const content = normalized(p);
      assert.equal(hash(content), manifest[p]);
      return [p, content];
    }),
);
const archive = {
  base: BASE,
  fingerprint,
  baseline: previous,
  manifest,
  contents,
  removed: Object.keys(previous).filter((p) => !(p in manifest)),
};
mkdirSync(root, { recursive: true });
const output = `${root}/source-${fingerprint}.json.gz`;
if (!existsSync(output))
  writeFileSync(output, gzipSync(JSON.stringify(archive), { level: 9 }), { flag: 'wx' });
writeFileSync(
  `${root}/current-source.json`,
  JSON.stringify({ base: BASE, fingerprint, manifest }, null, 2) + '\n',
);
console.log(fingerprint);
