import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { digest } from './manifest.mjs';
// Consume exported API job metadata and process reports; no credentials or network.
const jobSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    conclusion: z.string().nullable(),
    startedAt: z.string(),
    completedAt: z.string(),
    steps: z.array(
      z
        .object({
          name: z.string(),
          started_at: z.string().nullable(),
          completed_at: z.string().nullable(),
          conclusion: z.string().nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const inputSchema = z.object({
  runId: z.number(),
  head: z.string(),
  jobs: z.array(jobSchema),
  qualification: z.string(),
  billable: z.record(z.string(), z.number().nonnegative()).optional(),
});
const load = (p) => inputSchema.parse(JSON.parse(readFileSync(p, 'utf8')));
function summarize(run) {
  const byOS = {};
  for (const job of run.jobs) {
    const os = /complete matches|windows-2025/.test(job.name) ? 'windows' : 'linux';
    const total = (byOS[os] ??= {
      jobs: 0,
      runnerSeconds: 0,
      roundedJobMinutes: 0,
      checkoutSeconds: 0,
      installSeconds: 0,
    });
    const seconds = (Date.parse(job.completedAt) - Date.parse(job.startedAt)) / 1000;
    total.jobs++;
    total.runnerSeconds += seconds;
    total.roundedJobMinutes += Math.ceil(seconds / 60);
    for (const step of job.steps) {
      const s =
        step.started_at && step.completed_at
          ? (Date.parse(step.completed_at) - Date.parse(step.started_at)) / 1000
          : 0;
      if (step.name === 'Run actions/checkout@v4') total.checkoutSeconds += s;
      if (step.name === 'Run npm ci') total.installSeconds += s;
    }
  }
  return {
    runId: run.runId,
    head: run.head,
    qualification: run.qualification,
    byOS,
    billableMilliseconds: run.billable ?? null,
    failures: run.jobs
      .filter((j) => j.conclusion !== 'success')
      .map((j) => ({ id: j.id, name: j.name, conclusion: j.conclusion })),
    criticalPathSeconds:
      (Math.max(...run.jobs.map((j) => Date.parse(j.completedAt))) -
        Math.min(...run.jobs.map((j) => Date.parse(j.startedAt)))) /
      1000,
  };
}
const [beforePath, afterPath, output] = process.argv.slice(2);
if (!beforePath || !afterPath || !output)
  throw Error('Usage: compareMeasurements before.json after.json output.json');
const before = summarize(load(beforePath)),
  after = summarize(load(afterPath));
writeFileSync(
  output,
  JSON.stringify(
    {
      schema: 'pr202-ci-comparison-v1',
      before,
      after,
      inputs: [beforePath, afterPath].map((path) => ({ path, sha256: digest(readFileSync(path)) })),
      qualifications: [
        'Critical path includes queue gaps between job starts/completions; this is not CPU time.',
        'Rounded job minutes are ceil(duration / 60) per observed job, not an account invoice.',
        'Do not double-count carried successful jobs from rerun metadata.',
        'Compare serial source payloads and grouped payloads on the same OS; setup and instrumentation are separate.',
        'The old workflow has no hosted RSS samples; absence is unknown. New RSS is maximum per Node process, not simultaneous process-tree RSS.',
        'No dollar saving is inferred from runner-seconds. API billable time excludes any unobserved artifact/storage charges.',
      ],
    },
    null,
    2,
  ) + '\n',
);
