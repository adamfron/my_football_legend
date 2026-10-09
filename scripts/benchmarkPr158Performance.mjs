import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { cpus, totalmem } from 'node:os';
import process from 'node:process';
import console from 'node:console';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const repo = process.cwd();
const baseline = resolve(args.get('baseline') ?? '../baseline');
const directory = resolve(args.get('directory') ?? '../pr158-performance');
mkdirSync(directory, { recursive: true });
const minutes = Number(args.get('minutes') ?? 10);
const repetitions = Number(args.get('repetitions') ?? 3);
assert.ok(Number.isFinite(minutes) && minutes > 0 && minutes <= 90);
assert.ok(Number.isInteger(repetitions) && repetitions >= 3);
const fingerprint = (root) => {
  const source = resolve(root, 'src/core/matchSimulation');
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? walk(path)
        : path.endsWith('.ts') && !path.endsWith('.test.ts')
          ? [path]
          : [];
    });
  const hash = createHash('sha256');
  for (const path of walk(source).sort())
    hash
      .update(relative(source, path).replaceAll('\\', '/'))
      .update('\0')
      .update(readFileSync(path))
      .update('\0');
  return hash.digest('hex');
};
const sourceHashes = { before: fingerprint(baseline), after: fingerprint(repo) };
const results = [];
for (let repetition = 1; repetition <= repetitions; repetition++) {
  for (const [revision, cwd] of [
    ['before', baseline],
    ['after', repo],
  ]) {
    assert.equal(fingerprint(cwd), sourceHashes[revision], 'Frozen source changed; repeat timing');
    const output = resolve(directory, `${revision}-${repetition}.json`);
    const log = resolve(directory, `${revision}-${repetition}.log`);
    console.log(
      `${revision} repetition ${repetition}: ${minutes} minutes in all four observer modes`,
    );
    const descriptor = openSync(log, 'w');
    try {
      await new Promise((completed, failed) => {
        const child = spawn(
          process.execPath,
          [
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            'scripts/benchmarkPerformance.ts',
            `--minutes=${minutes}`,
            '--modes=release_minimal,normal,dev,capture',
            `--revision=${revision === 'before' ? 'PR157' : 'PR158'}`,
            `--output=${output}`,
          ],
          { cwd, stdio: ['ignore', descriptor, descriptor], windowsHide: true },
        );
        child.on('error', failed);
        child.on('exit', (code) =>
          code === 0
            ? completed()
            : failed(new Error(`${revision}:${repetition} exited ${code}; see ${log}`)),
        );
      });
    } finally {
      closeSync(descriptor);
    }
    assert.equal(fingerprint(cwd), sourceHashes[revision]);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.ok(report.canonicalInvariant);
    results.push({ revision, repetition, ...report });
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const modes = ['release_minimal', 'normal', 'dev', 'capture'];
const byMode = modes.map((mode) => {
  const get = (revision) =>
    results
      .filter((row) => row.revision === revision)
      .map((row) => row.results.find((result) => result.config.mode === mode));
  const before = get('before'),
    after = get('after');
  for (const rows of [before, after])
    for (const row of rows) assert.deepEqual(row.hashes, rows[0].hashes);
  const compact = (rows) => ({
    elapsedMs: median(rows.map((row) => row.elapsedMs)),
    millisecondsPerTick: median(rows.map((row) => row.elapsedMs / row.ticks)),
    canonicalSecondsPerWallSecond: median(rows.map((row) => row.canonicalSpeed)),
    runs: rows.map((row) => ({
      elapsedMs: row.elapsedMs,
      ticks: row.ticks,
      canonicalSeconds: row.canonicalSeconds,
      hashes: row.hashes,
      profile: row.profile,
      batchP50Ms: row.batchP50Ms,
      batchP95Ms: row.batchP95Ms,
      lateToEarlyCostRatio: row.lateToEarlyCostRatio,
      export: row.export,
    })),
    inclusiveSpanMsPerTick: Object.fromEntries(
      [
        ...new Set(
          rows.flatMap((row) => row.profile.categories.map((category) => category.category)),
        ),
      ].map((category) => [
        category,
        median(
          rows.map(
            (row) =>
              (row.profile.categories.find((item) => item.category === category)?.estimatedMs ??
                0) / row.ticks,
          ),
        ),
      ]),
    ),
  });
  const b = compact(before),
    a = compact(after);
  return { mode, before: b, after: a, elapsedChangePercent: (a.elapsedMs / b.elapsedMs - 1) * 100 };
});
const summary = {
  methodology:
    'Three alternating PR157/PR158 fresh-process pairs; same 10-minute fixture, explicit deterministic controlled-player decisions and four observer modes per process. Run only after other benchmark/test workers have finished. Inclusive sampled spans every37ticks are nested and cannot be added as exclusive CPU percentages. Export is excluded from simulation timing; browser/MediaRecorder not measured.',
  minutes,
  repetitions,
  sourceHashes,
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  modeStateAndRandomnessParity: results.map((row) => ({
    revision: row.revision,
    repetition: row.repetition,
    equality: row.canonicalInvariant,
  })),
  byMode,
};
const output = resolve(args.get('output') ?? 'docs/performance/PR158-performance-summary.json');
writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    modes: byMode.map((row) => ({ mode: row.mode, changePercent: row.elapsedChangePercent })),
  }),
);
