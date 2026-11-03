import process from 'node:process';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('..');
const loader = [
  '--max-semi-space-size=64',
  '--experimental-transform-types',
  '--import',
  './scripts/registerTypescriptLoader.mjs',
];
const checks = [
  ['current-replay', [...loader, 'scripts/benchmarkPr216.mjs', '--check']],
  ...[210, 211, 212, 213, 214, 215].map((n) => [
    'history-' + n,
    ['scripts/ci/replayPr' + n + 'Check.mjs', ...(n === 210 ? ['--replay'] : [])],
  ]),
];
mkdirSync(resolve(root, 'history-logs-frozen-final-v3'), { recursive: true });
const results = [];
const binding = JSON.parse(readFileSync('docs/performance/pr216/source.json'));
for (const [name, args] of checks) {
  const start = Date.now();
  const p = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    env: process.env,
  });
  const log = resolve(root, 'history-logs-frozen-final-v3', `${name}.log`);
  writeFileSync(log, (p.stdout ?? '') + (p.stderr ?? '') + (p.error ? String(p.error) : ''));
  const result = {
    name,
    args,
    exitCode: p.status,
    error: p.error ? String(p.error) : null,
    seconds: (Date.now() - start) / 1000,
    log,
  };
  results.push(result);
  console.log(JSON.stringify(result));
  if (p.status !== 0) console.log(((p.stdout ?? '') + (p.stderr ?? '')).slice(-2500));
  writeFileSync(
    resolve(root, 'pr216-history-results-frozen-final-v3.json'),
    JSON.stringify({ source: binding.fingerprint, results }, null, 2) + '\n',
  );
}
process.exitCode = results.some((r) => r.exitCode !== 0) ? 1 : 0;
