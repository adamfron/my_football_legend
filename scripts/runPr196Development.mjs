import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const mode = args.get('mode') ?? 'full',
  workers = Number(args.get('workers') ?? 3),
  version = args.get('version') ?? 'v1';
const requestedModels = (args.get('models') ?? 'baseline,corrected').split(',');
const policies = [
  'state-value-v1',
  'phase-role-hybrid-v1',
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
];
const pairs =
  mode === 'harvest'
    ? ['ww', 'ss', 'sw'].flatMap((d) => policies.map((p) => [d, p]))
    : [
        ['ww', policies[0]],
        ['ww', policies[2]],
        ['ww', policies[3]],
        ['ss', policies[0]],
        ['ss', policies[2]],
        ['sw', policies[0]],
        ['sw', policies[3]],
      ];
const excluded = new Set((args.get('exclude') ?? '').split(','));
const jobs = pairs
  .flatMap(([design, policy]) =>
    (mode === 'harvest' ? ['baseline'] : ['baseline', 'corrected']).map((model) => ({
      design,
      policy,
      model,
    })),
  )
  .filter(
    (j) =>
      !excluded.has(`${j.design}:${j.policy}:${j.model}`) &&
      (mode === 'harvest' || requestedModels.includes(j.model)),
  );
mkdirSync('.benchmark-artifacts/pr196-logs', { recursive: true });
let index = 0,
  failures = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (index < jobs.length) {
      const job = jobs[index++],
        id = `${job.design}-${job.policy}-${job.model}-${version}`;
      const out = `docs/performance/pr196/${mode === 'harvest' ? 'harvest' : 'matches'}/${id}.json.gz`;
      if (existsSync(out)) {
        console.log('preserved', out);
        continue;
      }
      const log = openSync(`.benchmark-artifacts/pr196-logs/${mode}-${id}.log`, 'a');
      const code = await new Promise((resolve) => {
        const p = spawn(
          process.execPath,
          [
            '--max-semi-space-size=64',
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            'scripts/benchmarkPr196Matches.mjs',
            `--design=${job.design}`,
            `--policy=${job.policy}`,
            `--model=${job.model}`,
            `--version=${version}`,
            ...(mode === 'harvest' ? ['--seconds=600'] : []),
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
      console.log('completed', mode, id, 'exit', code);
    }
  }),
);
if (failures) process.exitCode = 1;
