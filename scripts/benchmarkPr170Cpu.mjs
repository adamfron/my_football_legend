import assert from 'node:assert/strict';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const baseline = resolve(process.argv[2] ?? '../baseline-pr169'),
  current = resolve('.');
const fingerprint = (root) => {
  const files = (path) =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(resolve(path, entry.name))
        : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
          ? [resolve(path, entry.name)]
          : [],
    );
  const hash = createHash('sha256');
  for (const path of files(resolve(root, 'src/core/matchSimulation')).sort())
    hash.update(relative(root, path)).update(readFileSync(path));
  return hash.digest('hex');
};
const sources = { before: fingerprint(baseline), after: fingerprint(current) };
assert.equal(sources.before, sources.after, 'Canonical football sources changed');
mkdirSync('docs/performance', { recursive: true });
const samples = [];
for (let repetition = 1; repetition <= 3; repetition++) {
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
  for (const [phase, root] of order) {
    const output = resolve(`../pr170-cpu-${phase}-${repetition}.json`),
      descriptor = openSync(resolve(`../pr170-cpu-${phase}-${repetition}.log`), 'w');
    try {
      await new Promise((done, fail) => {
        const child = spawn(
          process.execPath,
          [
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            'scripts/benchmarkPerformance.ts',
            '--minutes=1',
            '--modes=release_minimal,normal',
            '--seed=pr170-baseline',
            '--profile=false',
            `--output=${output}`,
          ],
          { cwd: root, stdio: ['ignore', descriptor, descriptor], windowsHide: true },
        );
        child.on('error', fail);
        child.on('exit', (code) => (code === 0 ? done() : fail(Error(`CPU ${phase} ${code}`))));
      });
    } finally {
      closeSync(descriptor);
    }
    assert.equal(fingerprint(root), sources[phase], 'Source changed during timing');
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.canonicalInvariant, true);
    for (const row of report.results)
      samples.push({ phase, repetition, environment: report.environment, ...row });
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const comparisons = ['release_minimal', 'normal'].map((mode) => {
  const rows = samples.filter((sample) => sample.config.mode === mode),
    before = rows.filter((row) => row.phase === 'before'),
    after = rows.filter((row) => row.phase === 'after');
  rows.forEach((row) => assert.deepEqual(row.hashes, rows[0].hashes));
  const beforeMs = median(before.map((row) => row.elapsedMs)),
    afterMs = median(after.map((row) => row.elapsedMs));
  return {
    mode,
    beforeMedianMs: beforeMs,
    afterMedianMs: afterMs,
    changePercent: (afterMs / beforeMs - 1) * 100,
    beforeSpeed: 60000 / beforeMs,
    afterSpeed: 60000 / afterMs,
  };
});
writeFileSync(
  'docs/performance/PR170-cpu.json',
  JSON.stringify(
    {
      method:
        'Three alternating pairs, fresh serial Node processes, identical 60-second seeded fixture and explicit decision policy. No rendering, build or parallel test load during measurement. release_minimal separates canonical work; normal includes bounded context/replay observers.',
      canonicalSources: sources,
      canonicalInvariant: true,
      comparisons,
      samples,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(JSON.stringify(comparisons) + '\n');
