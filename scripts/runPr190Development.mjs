import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
const flags = process.argv.slice(2),
  workers = 3;
if (!flags.some((v) => /^--version=[a-z0-9][a-z0-9-]*$/.test(v)))
  throw Error('Supply a new explicit --version=name; existing evidence is never overwritten');
mkdirSync('../pr190-logs', { recursive: true });
const policies = [
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
  'state-value-v1',
  'phase-role-hybrid-v1',
];
const queue = ['ww', 'ss', 'sw'].flatMap((design) =>
  policies.map((policy) => ({ design, policy })),
);
const failures = [];
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (queue.length) {
      const { design, policy } = queue.shift();
      const version = flags.find((x) => x.startsWith('--version='))?.split('=')[1] ?? 'current';
      const log = createWriteStream(`../pr190-logs/${design}-${policy}-${version}.log`);
      console.log(`START ${design}/${policy}/${version}`);
      const code = await new Promise((done) => {
        const child = spawn(
          process.execPath,
          [
            '--experimental-transform-types',
            '--import',
            './scripts/registerTypescriptLoader.mjs',
            'scripts/benchmarkPr190.mjs',
            `--design=${design}`,
            `--policy=${policy}`,
            ...flags,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
        );
        child.stdout.pipe(log);
        child.stderr.pipe(log);
        child.on('error', (e) => {
          log.write(String(e));
          done(1);
        });
        child.on('exit', done);
      });
      log.end();
      console.log(`END ${design}/${policy}/${version} ${code}`);
      if (code !== 0) failures.push({ design, policy, code });
    }
  }),
);
if (failures.length) {
  console.log(JSON.stringify(failures));
  process.exitCode = 1;
}
