import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, existsSync, writeFileSync } from 'node:fs';
import { identity } from './pr201Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'v1',
  workers = Number(args.get('workers') ?? 3);
if (!/^[a-z0-9-]+$/.test(version) || !Number.isInteger(workers) || workers < 1 || workers > 4)
  throw Error('Invalid development run');
const pairs = [
  ['ww', 'opportunity-driven-v1'],
  ['ww', 'hierarchical-intent-v1'],
  ['ss', 'opportunity-driven-v1'],
  ['sw', 'state-value-v1'],
  ['sw', 'contextual-judgment-v1'],
  ['ww', 'phase-role-hybrid-v1'],
  ['ss', 'state-value-v1'],
];
const baselineRuntime = args.has('baseline-runtime');
const profiles = baselineRuntime
  ? ['canonical-pr199']
  : (
      args.get('profiles') ??
      'canonical-pr199,realism-candidate-v0,realism-candidate-v1,realism-candidate-no-recovery-v1'
    ).split(',');
const pilotPair = ([d, p]) =>
  (d === 'ww' && p === 'opportunity-driven-v1') ||
  (d === 'ss' && p === 'state-value-v1') ||
  (d === 'sw' && p === 'contextual-judgment-v1');
const chosenPairs = args.has('pilot')
  ? pairs.filter(pilotPair)
  : args.has('remaining')
    ? pairs.filter((pair) => !pilotPair(pair))
    : pairs;
const jobs = chosenPairs.flatMap(([design, policy]) =>
  profiles.map((profile) => ({ design, policy, profile })),
);
mkdirSync('.benchmark-artifacts/pr201-logs', { recursive: true });
identity(); // Publish the shared immutable source before parallel workers start.
let index = 0,
  failed = 0;
const results = [],
  start = Date.now();
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (index < jobs.length) {
      const job = jobs[index++],
        id = `${job.design}-${job.policy}-${job.profile}-${version}`;
      const output = baselineRuntime
        ? `docs/performance/pr201/baseline-final-pr200/${job.design}-${job.policy}.json`
        : `docs/performance/pr201/matches/${id}.json.gz`;
      if (existsSync(output)) {
        console.log('preserved', id);
        continue;
      }
      const fd = openSync(
        `.benchmark-artifacts/pr201-logs/${id}${baselineRuntime ? '-baseline-final' : ''}.log`,
        'a',
      );
      const code = await new Promise((done) => {
        const child = spawn(
          process.execPath,
          [
            '--max-semi-space-size=64',
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            ...(baselineRuntime
              ? ['scripts/replayPr201Experiment.mjs', '--baseline-runtime', `--case=match-${id}`]
              : [
                  'scripts/benchmarkPr201Matches.mjs',
                  ...Object.entries(job).map(([k, v]) => `--${k}=${v}`),
                  `--version=${version}`,
                ]),
          ],
          { stdio: ['ignore', fd, fd], windowsHide: true },
        );
        child.once('error', () => done(-1));
        child.once('exit', done);
      });
      closeSync(fd);
      results.push({ ...job, code });
      if (code !== 0) failed++;
      console.log('completed', id, code);
      writeFileSync(
        `.benchmark-artifacts/pr201-logs/coordinator-${version}.json`,
        JSON.stringify({ workers, wallSeconds: (Date.now() - start) / 1000, results }, null, 2),
      );
    }
  }),
);
if (failed) process.exitCode = 1;
