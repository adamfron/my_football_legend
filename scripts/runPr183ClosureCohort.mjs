import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { pr183SourceHash, pr183HarnessHash } from './pr183ClosureEvidence.mjs';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const cohort = args.get('cohort') ?? 'development';
const root = args.get('source') ?? '.';
const out = args.get('out') ?? `../pr183-closure-${cohort}`;
const sourceHash = pr183SourceHash(root),
  harnessHash = pr183HarnessHash();
const manifest = JSON.parse(readFileSync(`docs/performance/PR183-closure-${cohort}-inputs.json`));
const policies = args.has('policies')
  ? args.get('policies').split(',')
  : ['legacy-pr176', 'state-value-v1', 'role-value-v1', 'role-intent-v1', 'phase-role-hybrid-v1'];
const jobs = manifest.rows
  .filter((_, i) => !args.has('one-per-tier') || i % 2 === 0)
  .flatMap((f) => policies.map((policy) => ({ id: f.design.id, policy, inputHash: f.inputHash })));
const results = [];
let cursor = 0;
mkdirSync(out, { recursive: true });
const save = () =>
  writeFileSync(
    `${out}/status.json`,
    JSON.stringify(
      { cohort, sourceHash, harnessHash, total: jobs.length, completed: results.length, results },
      null,
      2,
    ) + '\n',
  );
const run = (job) =>
  new Promise((done, reject) => {
    const path = `${out}/${job.id}-${job.policy}.json.gz`;
    if (existsSync(path)) {
      const r = JSON.parse(gunzipSync(readFileSync(path)));
      if (
        r.productionHash !== sourceHash ||
        r.frozenHarnessHash !== harnessHash ||
        r.inputHash !== job.inputHash ||
        r.status !== 'full_time'
      )
        return reject(Error('Inconsistent resumed receipt'));
      results.push({ ...job, status: r.status, exit: 0, resumed: true });
      save();
      done();
      return;
    }
    const child = spawn(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/benchmarkPr183Closure.mjs',
        `--source=${root}`,
        `--cohort=${cohort}`,
        `--ids=${job.id}`,
        `--policy=${job.policy}`,
        `--out=${out}`,
        ...(args.has('capture-long-retreats') ? ['--capture-long-retreats'] : []),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (b) => {
      stdout = (stdout + b.toString()).slice(-8000);
    });
    child.stderr.on('data', (b) => {
      stderr = (stderr + b.toString()).slice(-8000);
    });
    child.on('error', reject);
    child.on('close', (exit) => {
      const r = existsSync(path) ? JSON.parse(gunzipSync(readFileSync(path))) : undefined;
      results.push({ ...job, exit, status: r?.status ?? 'missing', stdout, stderr });
      save();
      console.log(
        JSON.stringify({
          completed: results.length,
          total: jobs.length,
          ...job,
          exit,
          status: r?.status,
          time: r?.time,
          cpu: r?.performance.cpuSeconds,
        }),
      );
      done();
    });
  });
const worker = async () => {
  while (cursor < jobs.length) await run(jobs[cursor++]);
};
await Promise.all(Array.from({ length: Number(args.get('workers') ?? 8) }, () => worker()));
if (pr183SourceHash(root) !== sourceHash || pr183HarnessHash() !== harnessHash)
  throw Error('Source/harness changed');
if (results.some((r) => r.exit !== 0 || r.status !== 'full_time')) process.exitCode = 1;
