import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
const root = 'docs/performance/pr189',
  output = `${root}/failed-cycle-two-source.json.gz`;
if (existsSync(output)) throw Error('Preserve failed source');
const sourceSha256 = JSON.parse(
  readFileSync(`${root}/ww-opportunity-driven-v1-v2.json`),
).sourceSha256;
const failed = JSON.parse(readFileSync(`${root}/source-${sourceSha256}.json`));
const baseline = JSON.parse(readFileSync('docs/performance/PR188-evidence-index.json')).source;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const files = failed
  .filter((f) => !baseline.some((b) => b.path === f.path && b.sha256 === f.sha256))
  .map((f) => {
    const content = readFileSync(f.path, 'utf8').replaceAll('\r\n', '\n');
    if (sha(content) !== f.sha256) throw Error(`Failed source no longer matches: ${f.path}`);
    return { ...f, content };
  });
writeFileSync(
  output,
  gzipSync(
    JSON.stringify({
      schemaVersion: 1,
      baseCommit: 'a74be9ee846ac4958fd67e42795cf3d86946e937',
      sourceSha256,
      files,
    }),
  ),
);
console.log(JSON.stringify({ output, sourceSha256, files: files.length }));
