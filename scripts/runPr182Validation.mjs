import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import process from 'node:process';
import console from 'node:console';
import { pr182SourceHash, pr182HarnessHash } from './pr182Evidence.mjs';
const frozen = JSON.parse(readFileSync('docs/performance/PR182-freeze.json'));
if (frozen.sourceHash !== pr182SourceHash() || frozen.harnessHash !== pr182HarnessHash())
  throw Error('Validation freeze mismatch');
const manifest = JSON.parse(readFileSync('docs/performance/PR182-validation-inputs.json'));
const policies = [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
];
const jobs = manifest.rows.flatMap((f) =>
  policies.map((policy) => ({ id: f.design.id, policy, inputHash: f.inputHash })),
);
const results = [],
  started = Date.now();
let next = 0;
mkdirSync('../pr182-validation', { recursive: true });
const save = () =>
  writeFileSync(
    '../pr182-validation/status.json',
    JSON.stringify(
      {
        sourceHash: frozen.sourceHash,
        harnessHash: frozen.harnessHash,
        total: jobs.length,
        completed: results.length,
        elapsedSeconds: (Date.now() - started) / 1000,
        results,
      },
      null,
      2,
    ) + '\n',
  );
const run = (job) =>
  new Promise((done) => {
    const out = `../pr182-validation/${job.id}/${job.policy}`,
      path = `${out}/${job.id}-${job.policy}.json.gz`;
    if (existsSync(path)) {
      const r = JSON.parse(gunzipSync(readFileSync(path)));
      if (
        r.productionHash !== frozen.sourceHash ||
        r.frozenHarnessHash !== frozen.harnessHash ||
        r.inputHash !== job.inputHash ||
        r.status !== 'full_time'
      )
        throw Error('Inconsistent resumed validation receipt');
      results.push({ ...job, resumed: true, exit: 0, status: r.status, finalHash: r.finalHash });
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
        'scripts/benchmarkPr182.mjs',
        '--cohort=validation',
        `--policy=${job.policy}`,
        `--ids=${job.id}`,
        `--out=${out}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let stdout = '',
      stderr = '',
      timedOut = false,
      settled = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 900000);
    child.stdout.on('data', (b) => {
      stdout = (stdout + b.toString()).slice(-6000);
    });
    child.stderr.on('data', (b) => {
      stderr = (stderr + b.toString()).slice(-6000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      results.push({ ...job, exit: -1, error: String(error) });
      save();
      done();
    });
    child.on('close', (exit) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      let receipt;
      if (existsSync(path)) receipt = JSON.parse(gunzipSync(readFileSync(path)));
      const result = {
        ...job,
        exit,
        timedOut,
        stdout,
        stderr,
        status: receipt?.status ?? 'missing',
        finalHash: receipt?.finalHash,
      };
      results.push(result);
      save();
      console.log(
        JSON.stringify({
          completed: results.length,
          total: jobs.length,
          ...job,
          exit,
          status: result.status,
        }),
      );
      done();
    });
  });
const worker = async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    await run(job);
  }
};
await Promise.all(Array.from({ length: 10 }, () => worker()));
if (pr182SourceHash() !== frozen.sourceHash || pr182HarnessHash() !== frozen.harnessHash)
  throw Error('Validation source changed');
save();
if (results.some((r) => r.exit !== 0 || r.status !== 'full_time')) process.exitCode = 1;
