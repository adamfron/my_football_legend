import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, existsSync } from 'node:fs';
import { args, receipt } from './pr198Evidence.mjs';
const options = args(),
  version = options.get('version'),
  workers = Number(options.get('workers') ?? 3);
if (
  !version ||
  !/^[a-z0-9-]+$/.test(version) ||
  !Number.isInteger(workers) ||
  workers < 1 ||
  workers > 6
)
  throw Error('Supply a fresh --version and 1–6 workers');
const pairs = [
  ['ww', 'opportunity-driven-v1'],
  ['ww', 'hierarchical-intent-v1'],
  ['ss', 'opportunity-driven-v1'],
  ['sw', 'contextual-judgment-v1'],
  ['sw', 'state-value-v1'],
  ['ww', 'phase-role-hybrid-v1'],
  ['ss', 'state-value-v1'],
];
const jobs = pairs.flatMap(([design, policy]) =>
  ['baseline', 'corrected'].map((model) => ({ design, policy, model })),
);
mkdirSync('.benchmark-artifacts/pr198-logs', { recursive: true });
let index = 0,
  failures = 0;
const started = Date.now(),
  results = [];
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (index < jobs.length) {
      const job = jobs[index++],
        id = `${job.design}-${job.policy}-${job.model}-${version}`;
      const path = `docs/performance/pr198/matches/${id}.json.gz`;
      if (existsSync(path)) {
        console.log('preserved', path);
        continue;
      }
      const fd = openSync(`.benchmark-artifacts/pr198-logs/${id}.log`, 'a'),
        begin = Date.now();
      const code = await new Promise((done) => {
        const child = spawn(
          process.execPath,
          [
            '--max-semi-space-size=64',
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            'scripts/benchmarkPr198Matches.mjs',
            `--design=${job.design}`,
            `--policy=${job.policy}`,
            `--model=${job.model}`,
            `--version=${version}`,
            `--seed=pr198-development-${job.design}-${job.policy}`,
          ],
          { stdio: ['ignore', fd, fd], windowsHide: true },
        );
        child.once('error', () => done(-1));
        child.once('exit', done);
      });
      closeSync(fd);
      if (code !== 0) failures++;
      results.push({ ...job, path, exitCode: code, wallSeconds: (Date.now() - begin) / 1000 });
      console.log('completed', id, code);
    }
  }),
);
receipt(`docs/performance/pr198/concurrency-${version}.json`, {
  schema: 'pr198-concurrent-run-v1',
  workers,
  wallSeconds: (Date.now() - started) / 1000,
  results,
  qualification:
    'Concurrent coordinator wall time is separate from summed child CPU and per-process peak RSS. Other development processes may compete; no serial full-match speed claim.',
});
if (failures) process.exitCode = 1;
