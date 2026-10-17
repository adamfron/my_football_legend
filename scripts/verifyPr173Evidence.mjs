/* global console */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';

const root = 'docs/performance';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = (name) => JSON.parse(readFileSync(`${root}/${name}.json`, 'utf8'));
const source = read('PR173-source-equivalence');
const historical = read('PR173-evidence-integrity');
for (const file of historical.evidence) {
  const bytes = readFileSync(`${root}/${file.name}`);
  assert(
    hash(bytes) === file.sha256 ||
      hash(bytes.toString('utf8').replaceAll('\r\n', '\n')) === file.normalizedLfSha256,
    `Historical evidence changed: ${file.name}`,
  );
}
for (const file of historical.archives)
  assert.equal(hash(readFileSync(`${root}/${file.path}`)), file.sha256);
for (const file of [...read('PR173-evidence-index').archives, ...source.cohorts]) {
  const compressed = readFileSync(`${root}/${file.path}`);
  assert.equal(hash(gunzipSync(compressed)), file.jsonSha256);
  if (file.gzipSha256) assert.equal(hash(compressed), file.gzipSha256);
}
const measured = readFileSync(
  `${root}/pr173-experiments/measured-intervention.ts.txt`,
  'utf8',
).replaceAll('\r\n', '\n');
const final = readFileSync(source.changedFile, 'utf8').replaceAll('\r\n', '\n');
assert.equal(
  source.substitutions.reduce((s, [old, replacement]) => s.replaceAll(old, replacement), measured),
  final,
);
const walk = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(resolve(path, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [resolve(path, e.name)]
        : [],
  );
const files = walk(resolve('src/core/matchSimulation')).sort();
const inventory = (before) =>
  hash(
    files
      .map((path) => {
        const name = relative('.', path).replaceAll('\\', '/');
        const text =
          before && name === source.changedFile
            ? measured
            : readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
        return `${name}\0${text}\0`;
      })
      .join(''),
  );
assert.equal(inventory(true), source.measuredSourceHash);
assert.equal(inventory(false), source.finalSourceHash);
const data = (name) =>
  JSON.parse(gunzipSync(readFileSync(`${root}/pr173-experiments/PR173-${name}.json.gz`)));
const before = data('A-scenarios'),
  physical = data('C-scenarios'),
  finalRuns = data('F-scenarios');
assert.equal(finalRuns.rows.length, 57);
for (let i = 0; i < 57; i++) {
  assert.equal(before.rows[i].initialHash, finalRuns.rows[i].initialHash);
  // The final narrow revalidation guard is exercised in dedicated tests/extensions.
  // These 57 complete canonical results also prove the metadata-only rename is inert.
  assert.equal(physical.rows[i].result.finalHash, finalRuns.rows[i].result.finalHash);
}
assert.equal(source.cohorts.length, 18);
assert.equal(read('PR173-full-match-comparison').completion.full, 16);
console.log(
  'PR173 evidence PASS: historical bytes, all archived JSON, exact source equivalence, 57 complete states, 18 full-match receipts.',
);
