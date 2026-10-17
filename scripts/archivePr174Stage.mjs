import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
const stage = process.argv[2];
const sourceRoot = resolve(process.argv[3] ?? '.');
if (!/^[A-Z][0-9]?$/.test(stage ?? '')) throw new Error('Stage required');
const walk = (p) =>
  readdirSync(p, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(p, e.name)) : [resolve(p, e.name)],
  );
const sources = Object.fromEntries(
  walk(resolve(sourceRoot, 'src/core/matchSimulation'))
    .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))
    .sort()
    .map((p) => [
      relative(sourceRoot, p).replaceAll('\\', '/'),
      readFileSync(p, 'utf8').replaceAll('\r\n', '\n'),
    ]),
);
const payload = {
  stage,
  sources,
  harness: Object.fromEntries(
    ['scripts/benchmarkPr174.ts', 'scripts/pr174Fixtures.ts'].map((p) => [
      p,
      readFileSync(p, 'utf8'),
    ]),
  ),
};
mkdirSync('docs/performance/pr174-experiments', { recursive: true });
writeFileSync(
  `docs/performance/pr174-experiments/PR174-${stage}-source.json.gz`,
  gzipSync(JSON.stringify(payload)),
);
console.log(`Archived ${stage}: ${Object.keys(sources).length} source files`);
