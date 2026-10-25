import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const mode = process.argv.find((a) => a.startsWith('--worker='))?.slice(9);
if (mode) {
  const receipt = JSON.parse(
    readFileSync('docs/performance/PR188-match-dev-ww-state-value-v1-full-observed-final-v1.json'),
  );
  let state = JSON.parse(gunzipSync(readFileSync(receipt.archive))).input;
  if (mode === 'body')
    state.experimentalBodyContacts = { version: 'body-v1', readyAt: {}, locks: [] };
  for (let i = 0; i < 400; i++) state = step(state, 0.025);
  const cpu = process.cpuUsage(),
    start = performance.now();
  for (let i = 0; i < 8000; i++) state = step(state, 0.025);
  const duration = performance.now() - start,
    usage = process.cpuUsage(cpu),
    rss = process.memoryUsage().rss,
    contact = state.experimentalBodyContacts?.last;
  delete state.experimentalBodyContacts;
  console.log(
    JSON.stringify({
      mode,
      ticks: 8000,
      warmup: 400,
      wallMs: duration,
      cpu: usage,
      rssBytes: rss,
      normalizedFinalHash: sha(state),
      contacts: contact ? 1 : 0,
    }),
  );
} else {
  const output = 'docs/performance/pr191/performance.json';
  if (existsSync(output)) throw Error('Preserve ' + output);
  const rows = [];
  for (const value of ['default', 'body', 'body', 'default']) {
    const raw = execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/benchmarkPr191Performance.mjs',
        '--worker=' + value,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    rows.push(JSON.parse(raw.trim().split('\n').at(-1)));
  }
  if (new Set(rows.map((r) => r.normalizedFinalHash)).size !== 1)
    throw Error('Matched workload diverged; report separately');
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        classification:
          'ABBA fresh-process observer-off same-trajectory development probe; no confidence interval',
        node: process.version,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ output, rows }));
}
