import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
const root = 'docs/performance/pr189';
const version = process.argv.find((v) => v.startsWith('--version='))?.slice(10) ?? 'v1';
const workers = Number(process.argv.find((v) => v.startsWith('--workers='))?.slice(10) ?? 2);
if (!Number.isInteger(workers) || workers < 1 || workers > 4) throw Error('Workers must be 1..4');
mkdirSync(root, { recursive: true });
const policies = [
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
  'state-value-v1',
  'phase-role-hybrid-v1',
];
const tasks = ['ww', 'ss', 'sw'].flatMap((design) =>
  policies.map((policy) => ({ design, policy })),
);
let next = 0;
const results = [];
const worker = async () => {
  while (next < tasks.length) {
    const task = tasks[next++];
    const path = `${root}/${task.design}-${task.policy}-${version}.log`;
    if (existsSync(path)) throw Error(`Preserve ${path}`);
    const fd = openSync(path, 'wx');
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--experimental-transform-types',
          '--import',
          './scripts/registerTypescriptLoader.mjs',
          'scripts/benchmarkPr189Matches.mjs',
          `--design=${task.design}`,
          `--policy=${task.policy}`,
          `--version=${version}`,
        ],
        { stdio: ['ignore', fd, fd], windowsHide: true },
      );
      child.once('error', reject);
      child.once('exit', resolve);
    }).finally(() => closeSync(fd));
    results.push({ ...task, exitCode });
    writeFileSync(
      `${root}/matrix-${version}.json`,
      JSON.stringify(
        {
          schemaVersion: 1,
          concurrency: workers,
          classification:
            '3 paired development designs, 15 variants; shared host CPU/wall measurements',
          results,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(JSON.stringify(results.at(-1)));
  }
};
await Promise.all(Array.from({ length: workers }, () => worker()));
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1;
