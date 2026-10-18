import { readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import console from 'node:console';
const folder = 'docs/performance/pr174-experiments';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const records = [];
const pack = (name, files, meta = {}) => {
  const bytes = Buffer.from(JSON.stringify({ version: 1, ...meta, files }));
  const compressed = gzipSync(bytes);
  const path = `${folder}/PR174-${name}.json.gz`;
  writeFileSync(path, compressed);
  records.push({
    path,
    sha256: sha(compressed),
    uncompressedSha256: sha(bytes),
    compressedBytes: compressed.length,
    uncompressedBytes: bytes.length,
    files: Object.entries(files).map(([file, data]) => ({
      file,
      bytes: Buffer.byteLength(data),
      sha256: sha(data),
    })),
  });
};
for (const [name, directory] of [
  ['controlled-raw', '../pr174-research'],
  ['pr173-original16-raw', '../pr174-pr173-full'],
  ['pr173-heldout8-raw', '../pr174-baseline-heldout'],
  ['pr173-extensions-raw', '../pr174-baseline-extensions'],
  ['final-original16-raw', '../pr174-K-full'],
  ['final-heldout8-raw', '../pr174-K-heldout'],
  ['G-rejected-cohort-raw', '../pr174-final-full'],
  ['H3-superseded-original-raw', '../pr174-H3-full'],
  ['H3-superseded-heldout-raw', '../pr174-H3-heldout'],
  ['frozen-before-raw', '../pr174-frozen-baseline'],
  ['frozen-after-raw', '../pr174-frozen-final'],
]) {
  if (!existsSync(directory)) continue;
  const files = Object.fromEntries(
    readdirSync(directory)
      .filter((p) => p.endsWith('.json'))
      .map((p) => [p, readFileSync(resolve(directory, p), 'utf8')]),
  );
  pack(name, files, {
    restoreRelativeDirectory: directory,
    cohortStatusByFile: Object.fromEntries(
      Object.entries(files)
        .filter(([p]) => p.startsWith('cohort-'))
        .map(([p, s]) => [p, JSON.parse(s).observed.status]),
    ),
  });
}
const harness = Object.fromEntries(
  readdirSync('scripts')
    .filter((p) => /174/.test(p) && /\.(ts|mjs)$/.test(p))
    .map((p) => [`scripts/${p}`, readFileSync(`scripts/${p}`, 'utf8')]),
);
const geometryHarness = Object.fromEntries(
  ['scripts/benchmarkPr174Geometry.ts', 'scripts/pr174Fixtures.ts'].map((p) => [
    p,
    readFileSync(p, 'utf8'),
  ]),
);
const geometryHash = sha(Object.values(geometryHarness).join(''));
if (
  geometryHash !==
  JSON.parse(readFileSync('../pr174-research/PR174-K-geometry.json', 'utf8')).manifest.harnessHash
)
  throw new Error('Final measured geometry harness changed');
pack('K-geometry-harness', geometryHarness, { harnessHash: geometryHash });
pack('final-harness', harness, {
  sourceStage: 'K',
  note: 'Current readable research harnesses. Exact earlier controlled harnesses are stored with their source snapshots; geometry A/J have hash-verified dedicated snapshots.',
});
pack(
  'validation-logs',
  Object.fromEntries(
    readdirSync('..')
      .filter((p) => /^pr174.*\.(log|txt)$/.test(p))
      .map((p) => [p, readFileSync(resolve('..', p), 'utf8')]),
  ),
);
pack(
  'browser-dom',
  Object.fromEntries(
    readdirSync('..')
      .filter((p) => /^pr174-browser.*\.json$/.test(p))
      .map((p) => [p, readFileSync(resolve('..', p), 'utf8')]),
  ),
);
for (const name of [
  'PR174-human-pass.png',
  'PR174-browser-result.png',
  'PR174-browser-reload.png',
  'PR174-browser-final.png',
]) {
  const source = resolve('../../outputs', name);
  if (existsSync(source)) copyFileSync(source, `${folder}/${name}`);
}
const sourceSnapshots = readdirSync(folder)
  .filter((p) => p.endsWith('.gz') && !records.some((r) => r.path === `${folder}/${p}`))
  .map((p) => ({
    path: `${folder}/${p}`,
    sha256: sha(readFileSync(`${folder}/${p}`)),
    bytes: readFileSync(`${folder}/${p}`).length,
  }));
const retainedStandalone = readdirSync(folder)
  .filter((p) => !p.endsWith('.gz'))
  .map((p) => ({
    path: `${folder}/${p}`,
    sha256: sha(readFileSync(`${folder}/${p}`)),
    bytes: readFileSync(`${folder}/${p}`).length,
  }));
writeFileSync(
  'docs/performance/PR174-experiment-index.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'Lossless gzip JSON containers. Each files map preserves the exact original UTF-8 text and its hash. Restore raw datasets to the recorded relative directory, source snapshots to their original paths and use the corresponding harness. Rejected/invalid/superseded attempts are retained and labelled; no intermediate prefix is treated as a final complete cohort.',
      records,
      sourceSnapshots,
      retainedStandalone,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Archived ${records.length} datasets/harness/log containers and ${sourceSnapshots.length} retained source/geometry snapshots.`,
);
