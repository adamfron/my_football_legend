import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const current = process.cwd();
const baseline = resolve(args.get('baseline') ?? '../pr160-baseline');
const directory = resolve(args.get('directory') ?? '../pr160-performance');
const output = resolve(args.get('output') ?? 'docs/performance/PR160-performance.json');
const repetitions = Number(args.get('repetitions') ?? 3);
const seconds = Number(args.get('seconds') ?? 300);
const modes = args.get('modes') ?? 'release_minimal';
const seed = args.get('seed') ?? 'pr160-performance:balanced:a';
assert.ok(Number.isInteger(repetitions) && repetitions >= 3 && repetitions <= 6);
assert.ok(Number.isFinite(seconds) && seconds > 0 && seconds <= 900);
mkdirSync(directory, { recursive: true });
const fingerprint = (root) => {
  const paths = [
    'src/core',
    'src/app/match',
    'scripts/createCanonicalWorldDatabase.ts',
    'scripts/performanceBenchmark.ts',
    'scripts/registerTypescriptLoader.mjs',
  ];
  const walk = (path) =>
    path.endsWith('.ts') || path.endsWith('.mjs')
      ? [path]
      : readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
          const target = resolve(path, entry.name);
          return entry.isDirectory()
            ? walk(target)
            : /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)
              ? [target]
              : [];
        });
  const hash = createHash('sha256');
  for (const path of paths.flatMap((path) => walk(resolve(root, path))).sort())
    hash
      .update(relative(root, path).replaceAll('\\', '/'))
      .update('\0')
      .update(readFileSync(path))
      .update('\0');
  return hash.digest('hex');
};
const sourceHashes = { before: fingerprint(baseline), after: fingerprint(current) };
const samples = [];
for (let repetition = 1; repetition <= repetitions; repetition++) {
  // Alternate pair order, and use a fresh process each time. Never benchmark while tests or
  // other calibration jobs run. Source fingerprints fail the run if the engine changes.
  const order =
    repetition % 2
      ? [
          ['before', baseline],
          ['after', current],
        ]
      : [
          ['after', current],
          ['before', baseline],
        ];
  for (const [revision, cwd] of order) {
    assert.equal(
      fingerprint(cwd),
      sourceHashes[revision],
      'Source changed before timing; repeat the frozen run.',
    );
    const sampleOutput = resolve(directory, `${revision}-${repetition}.json`);
    const log = resolve(directory, `${revision}-${repetition}.log`);
    const descriptor = openSync(log, 'w');
    console.log(`${revision} ${repetition}/${repetitions}: ${seconds}s, ${modes}`);
    try {
      await new Promise((completed, failed) => {
        const child = spawn(
          process.execPath,
          [
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            'scripts/benchmarkPerformance.ts',
            `--minutes=${seconds / 60}`,
            `--modes=${modes}`,
            `--seed=${seed}`,
            '--profile=false',
            `--revision=${revision === 'before' ? '09c05fa' : 'PR160-working-tree'}`,
            `--output=${sampleOutput}`,
          ],
          { cwd, stdio: ['ignore', descriptor, descriptor], windowsHide: true },
        );
        child.on('error', failed);
        child.on('exit', (code) =>
          code === 0
            ? completed()
            : failed(new Error(`${revision}:${repetition} exited ${code}; inspect ${log}`)),
        );
      });
    } finally {
      closeSync(descriptor);
    }
    assert.equal(
      fingerprint(cwd),
      sourceHashes[revision],
      'Source changed during timing; repeat the frozen run.',
    );
    const report = JSON.parse(readFileSync(sampleOutput, 'utf8'));
    assert.equal(report.canonicalInvariant, true);
    for (const row of report.results) {
      assert.ok(
        Math.abs(row.canonicalSeconds - seconds) < 0.05,
        'Fixture did not process its canonical horizon.',
      );
      samples.push({
        revision,
        repetition,
        mode: row.config.mode,
        elapsedMs: row.elapsedMs,
        canonicalSeconds: row.canonicalSeconds,
        ticks: row.ticks,
        score: row.score,
        status: row.status,
        humanDecisionInputs: row.humanDecisionInputs,
        hashes: row.hashes,
        environment: report.environment,
      });
    }
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const comparisons = modes.split(',').map((mode) => {
  const before = samples.filter((sample) => sample.mode === mode && sample.revision === 'before');
  const after = samples.filter((sample) => sample.mode === mode && sample.revision === 'after');
  for (const rows of [before, after])
    for (const row of rows)
      assert.deepEqual(row.hashes, rows[0].hashes, 'Within-revision deterministic replay failed.');
  const beforeMedianMs = median(before.map((row) => row.elapsedMs)),
    afterMedianMs = median(after.map((row) => row.elapsedMs));
  return {
    mode,
    beforeMedianMs,
    afterMedianMs,
    changePercent: (afterMedianMs / beforeMedianMs - 1) * 100,
    beforeRangeMs: [
      Math.min(...before.map((row) => row.elapsedMs)),
      Math.max(...before.map((row) => row.elapsedMs)),
    ],
    afterRangeMs: [
      Math.min(...after.map((row) => row.elapsedMs)),
      Math.max(...after.map((row) => row.elapsedMs)),
    ],
  };
});
mkdirSync(resolve(output, '..'), { recursive: true });
const report = {
  baseline: '09c05fa',
  seed,
  seconds,
  repetitions,
  modes: modes.split(','),
  sourceHashes,
  methodology:
    'Three alternating before/after pairs, fresh sequential Node processes, existing benchmark fixture and explicit deterministic decision policy, profiling disabled, no concurrent tests; full-state hashes must replay within each revision.',
  limitation:
    'A focused equivalent starting fixture; gameplay can diverge naturally with fitness. This is not a scoring calibration or broad match performance estimate. Renderer and video capture excluded.',
  comparisons,
  samples,
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, comparisons }, null, 2));
