import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { argumentsMap } from './pr197Evidence.mjs';
const args = argumentsMap(),
  workers = Number(args.get('workers') ?? 3),
  stage = args.get('stage') ?? 'pathological',
  version = args.get('version') ?? 'v1';
const pairs =
  stage === 'pathological'
    ? [
        ['ww', 'opportunity-driven-v1'],
        ['ww', 'hierarchical-intent-v1'],
        ['ss', 'opportunity-driven-v1'],
        ['sw', 'state-value-v1'],
        ['ss', 'state-value-v1'],
      ]
    : [
        ['ww', 'phase-role-hybrid-v1'],
        ['sw', 'contextual-judgment-v1'],
      ];
const only = new Set((args.get('only') ?? '').split(',').filter(Boolean));
const models = (args.get('models') ?? 'baseline,corrected').split(',');
const jobs = pairs
  .flatMap(([design, policy]) =>
    ['baseline', 'corrected'].map((model) => ({ design, policy, model })),
  )
  .filter(
    (j) =>
      models.includes(j.model) && (!only.size || only.has(`${j.design}:${j.policy}:${j.model}`)),
  );
mkdirSync('.benchmark-artifacts/pr197-logs', { recursive: true });
let index = 0,
  failures = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (index < jobs.length) {
      const job = jobs[index++],
        id = `${job.design}-${job.policy}-${job.model}-${version}`;
      const path = `docs/performance/pr197/matches/${id}.json.gz`;
      if (existsSync(path)) {
        console.log('preserved', path);
        continue;
      }
      const log = openSync(`.benchmark-artifacts/pr197-logs/${id}.log`, 'a');
      const code = await new Promise((resolve) => {
        const p = spawn(
          process.execPath,
          [
            '--max-semi-space-size=64',
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            'scripts/benchmarkPr196Matches.mjs',
            '--program=pr197',
            `--design=${job.design}`,
            `--policy=${job.policy}`,
            `--model=${job.model}`,
            `--version=${version}`,
            `--seed=pr197-development-${stage}-${job.design}-${job.policy}`,
          ],
          { stdio: ['ignore', log, log], windowsHide: true },
        );
        p.once('error', (e) => {
          console.error(String(e));
          resolve(-1);
        });
        p.once('exit', resolve);
      });
      closeSync(log);
      if (code !== 0) failures++;
      console.log('completed', id, 'exit', code);
    }
  }),
);
if (failures) process.exitCode = 1;
