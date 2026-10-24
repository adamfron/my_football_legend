import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, existsSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const directory = 'docs/performance/pr188-run-logs';
mkdirSync(directory, { recursive: true });
const policies = [
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
  'state-value-v1',
  'phase-role-hybrid-v1',
];
const tasks = ['dev-ww', 'dev-ss', 'dev-sw'].flatMap((design) =>
  policies.map((policy) => ({ design, policy })),
);
const results = [];
let next = 0;
const startedAt = new Date().toISOString();
const record = () =>
  writeFileSync(
    'docs/performance/PR188-full-matrix-status.json',
    JSON.stringify(
      {
        schemaVersion: 1,
        classification: 'development; three paired designs, not fifteen independent experiments',
        startedAt,
        concurrency: 2,
        performanceContext:
          'Two independent Node processes share this host. Process CPU/RSS are recorded; wall time is not an isolated speedup experiment.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
const worker = async () => {
  while (next < tasks.length) {
    const task = tasks[next++];
    const log = `${directory}/${task.design}-${task.policy}-final-v1.log`;
    if (existsSync(log)) throw Error(`Preserve existing log: ${log}`);
    const fd = openSync(log, 'wx');
    const start = new Date().toISOString();
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--experimental-transform-types',
          '--import',
          './scripts/registerTypescriptLoader.mjs',
          'scripts/benchmarkPr188Matches.mjs',
          '--full',
          `--design=${task.design}`,
          `--policy=${task.policy}`,
          '--rep=final-v1',
        ],
        { cwd: process.cwd(), env: process.env, stdio: ['ignore', fd, fd], windowsHide: true },
      );
      child.once('error', reject);
      child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
    }).finally(() => closeSync(fd));
    results.push({ ...task, ...code, start, completedAt: new Date().toISOString(), log });
    record();
    console.log(`${task.design}/${task.policy}: exit ${code.exitCode}`);
  }
};
await Promise.all([worker(), worker()]);
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1;
