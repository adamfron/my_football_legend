import { spawn } from 'node:child_process';
import { existsSync, readFileSync, createWriteStream, mkdirSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import {
  POLICIES,
  hash,
  manifest,
  canonicalKernelManifest,
  writeReceipt,
} from './pr194Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'v4',
  workers = Math.min(8, Math.max(1, Number(args.get('workers') ?? 6)));
if (!/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
const jobs = [];
for (const design of ['ww', 'ss', 'sw'])
  for (const policy of POLICIES) jobs.push({ design, policy, mode: 'combined', observed: true });
for (const [design, policy] of [
  ['ww', 'opportunity-driven-v1'],
  ['ss', 'opportunity-driven-v1'],
  ['sw', 'hierarchical-intent-v1'],
])
  for (const mode of ['perception', 'positions', 'tempo'])
    jobs.push({ design, policy, mode, observed: true });
jobs.push({ design: 'ww', policy: 'state-value-v1', mode: 'baseline', observed: true });
jobs.push(
  { design: 'ww', policy: 'opportunity-driven-v1', mode: 'combined', observed: false },
  { design: 'sw', policy: 'state-value-v1', mode: 'combined', observed: false },
);
const kernelHash = hash(canonicalKernelManifest(manifest())),
  results = [];
mkdirSync('docs/performance/pr194/match-logs', { recursive: true });
let cursor = 0;
const worker = async () => {
  while (cursor < jobs.length) {
    const job = jobs[cursor++],
      stem = `${job.design}-${job.policy}-${job.mode}-${version}${job.observed ? '' : '-bare'}`,
      path = `docs/performance/pr194/matches/${stem}.json`;
    if (existsSync(path)) {
      const old = JSON.parse(readFileSync(path));
      if (old.kernelHash !== kernelHash || old.status !== 'full_time' || old.failure)
        throw Error('Existing receipt requires a new version ' + path);
      results.push({ path, code: 0, reused: true });
      continue;
    }
    const log = createWriteStream(`docs/performance/pr194/match-logs/${stem}.log`, { flags: 'wx' });
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--max-semi-space-size=64',
          '--experimental-transform-types',
          '--import',
          './scripts/registerTypescriptLoader.mjs',
          'scripts/benchmarkPr194Matches.mjs',
          `--design=${job.design}`,
          `--policy=${job.policy}`,
          `--mode=${job.mode}`,
          `--version=${version}`,
          ...(job.observed ? [] : ['--observers=off']),
        ],
        { windowsHide: true },
      );
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.on('error', reject);
      child.on('close', (code) => {
        log.end();
        resolve(code);
      });
    });
    results.push({ path, code, reused: false });
    console.log(stem, 'exit', code);
  }
};
await Promise.all(Array.from({ length: workers }, worker));
writeReceipt(`docs/performance/pr194/development-${version}.json`, {
  schema: 'mfl-pr194-development-dispatch-v1',
  version,
  workers,
  kernelHash,
  jobs,
  results,
  allPassed: results.every((r) => r.code === 0),
});
if (results.some((r) => r.code !== 0)) process.exitCode = 1;
