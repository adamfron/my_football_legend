import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { z } from 'zod';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const base = '52748e299115cd4952d176e18d2609f4b358e797';
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const productionDiff = git([
  'diff',
  base,
  '--',
  'src',
  'package.json',
  'package-lock.json',
  '.github',
  'vitest.config.ts',
  'vite.config.ts',
  'tsconfig.app.json',
  'tsconfig.node.json',
]);
if (productionDiff)
  throw new Error('PR176 scope violation: production, dependencies or verification config changed');
const manifest = JSON.parse(readFileSync('docs/performance/PR176-source-manifest.json', 'utf8'));
for (const f of manifest.sources)
  if (hash(readFileSync(f.path)) !== f.sha256) throw new Error(`Source changed: ${f.path}`);
for (const f of manifest.historical)
  if (hash(readFileSync(f.path)) !== f.sha256)
    throw new Error(`Historical receipt changed: ${f.path}`);
const exit = Number(readFileSync('../pr176-verify-exit.txt', 'utf8').trim());
const log = readFileSync('../pr176-verify.log', 'utf8');
if (
  exit !== 0 ||
  !log.includes('1833 passed') ||
  !log.includes('52 passed') ||
  !log.includes('4 passed') ||
  !log.includes('5 passed') ||
  !log.includes('built in')
)
  throw new Error('Complete unchanged verify PASS required');
const logBytes = gzipSync(log);
writeFileSync('docs/performance/PR176-verify.log.gz', logBytes);
const schema = z.object({
  version: z.literal(1),
  baseCommit: z.string(),
  command: z.literal('npm run verify'),
  exitCode: z.literal(0),
  tests: z.literal(1894),
  productionDiffEmpty: z.literal(true),
  sourceHash: z.string(),
  log: z.object({ path: z.string(), sha256: z.string() }),
  environment: z.unknown(),
  notes: z.array(z.string()),
});
const receipt = schema.parse({
  version: 1,
  baseCommit: base,
  command: 'npm run verify',
  exitCode: 0,
  tests: 1894,
  productionDiffEmpty: true,
  sourceHash: manifest.normalizedProductionHash,
  log: { path: 'docs/performance/PR176-verify.log.gz', sha256: hash(logBytes) },
  environment: {
    node: manifest.node,
    platform: 'Windows',
    fixedDt: 0.025,
    dependencyLockfileSha256: hash(readFileSync('package-lock.json')),
  },
  notes: [
    'Unchanged lint + main1833 + integration52 + contract4 + full-career5 + TypeScript and production build. Existing workers, limits, assertions, goldens and CI unchanged.',
    'Workspace reused dependencies matching the existing unchanged lockfile; temporary directory and npm PATH set locally only.',
    'Research is opt-in; no production benchmark, gameplay tuning, extra football RNG, save schema or UI change.',
    'Any post-verify edits are documents, receipt finalisation or offline research helpers checked separately by ESLint; measured production source remains byte-identical.',
  ],
});
writeFileSync('docs/performance/PR176-verification.json', JSON.stringify(receipt, null, 2) + '\n');
const paths = [
  ...readdirSync('docs/performance')
    .filter((p) => p.startsWith('PR176-') && p !== 'PR176-evidence-index.json')
    .map((p) => `docs/performance/${p}`),
  ...readdirSync('scripts')
    .filter((p) => /Pr176|pr176|preparePr177Fixtures/.test(p))
    .map((p) => `scripts/${p}`),
  ...readdirSync('docs')
    .filter((p) => p.startsWith('PR176_'))
    .map((p) => `docs/${p}`),
].sort();
const files = paths.map((path) => {
  const b = readFileSync(path);
  return { path, bytes: b.length, sha256: hash(b) };
});
writeFileSync(
  'docs/performance/PR176-evidence-index.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'Exact bytes of final research, documents and receipts. Excludes this self-referential index. Historical source/input provenance is in source-manifest; old evidence is untouched.',
      files,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    verify: 'PASS',
    tests: 1894,
    productionDiffEmpty: true,
    historicalReceiptsUnchanged: manifest.historical.length,
    evidenceFiles: files.length,
  }),
);
