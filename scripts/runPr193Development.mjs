import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { POLICIES, manifest, hash, writeReceipt } from './pr193Evidence.mjs';
import { readPr193Evidence } from './readPr193Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'final-v1',
  workers = Math.min(8, Math.max(1, Number(args.get('workers') ?? 4)));
if (!/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
const jobs = [];
for (const design of ['ww', 'ss', 'sw']) {
  for (const policy of POLICIES) jobs.push({ design, policy, mode: 'combined', observed: true });
  for (const policy of ['state-value-v1', 'opportunity-driven-v1'])
    for (const mode of ['transition', 'clearance'])
      jobs.push({ design, policy, mode, observed: true });
}
jobs.push({ design: 'ww', policy: 'state-value-v1', mode: 'baseline', observed: true });
for (const design of ['ww', 'ss', 'sw'])
  jobs.push({ design, policy: 'state-value-v1', mode: 'combined', observed: false });
const expectedSource = hash(manifest()),
  results = [];
mkdirSync('docs/performance/pr193/match-logs', { recursive: true });
let cursor = 0;
const worker = async () => {
  while (cursor < jobs.length) {
    const job = jobs[cursor++],
      stem = `${job.design}-${job.policy}-${job.mode}-${version}${job.observed ? '' : '-bare'}`;
    const path = `docs/performance/pr193/matches/${stem}.json`;
    if (existsSync(path)) {
      const saved = readPr193Evidence(path);
      if (saved.sourceHash !== expectedSource || saved.status !== 'full_time' || saved.failure)
        throw Error('Existing receipt requires another version: ' + path);
      results.push({ path, code: 0, reused: true });
      continue;
    }
    const log = createWriteStream(`docs/performance/pr193/match-logs/${stem}.log`, { flags: 'wx' });
    const flags = [
      `--design=${job.design}`,
      `--policy=${job.policy}`,
      `--mode=${job.mode}`,
      `--version=${version}`,
      ...(job.observed ? [] : ['--observers=off']),
    ];
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--max-semi-space-size=64',
          '--experimental-transform-types',
          '--import',
          './scripts/registerTypescriptLoader.mjs',
          'scripts/benchmarkPr193Matches.mjs',
          ...flags,
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
await Promise.all(Array.from({ length: workers }, () => worker()));
writeReceipt(`docs/performance/pr193/development-run-${version}.json`, {
  schema: 'mfl-pr193-development-dispatch-v1',
  version,
  workers,
  expectedSource,
  jobs,
  results,
  allPassed: results.every((r) => r.code === 0),
});
if (results.some((r) => r.code !== 0)) process.exitCode = 1;
