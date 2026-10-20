import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import process from 'node:process';
import { assignTacticalRoles } from '../src/core/matchSimulation/tacticalRoles.ts';
import { configureMatchPolicy } from '../src/core/matchSimulation/roleExperiment.ts';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { pr172SourceHash, pr172Hash as sha } from './pr172Evidence.ts';

const policyIds = [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
];
const fixture = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr179-evidence/initial-states.json.gz')),
).find((f) => f.design.id === 'pr179-dev-sw-2');
if (!fixture) throw new Error('Missing serial comparison input');
const roleSamples = [],
  allocationCpuStart = process.cpuUsage();
const reference = sha(assignTacticalRoles(fixture.state));
for (let i = 0; i < 200; i++) {
  const started = performance.now(),
    plan = assignTacticalRoles(fixture.state);
  roleSamples.push(performance.now() - started);
  if (sha(plan) !== reference) throw new Error('Role assignment nondeterministic');
}
const allocationCpu = process.cpuUsage(allocationCpuStart);
const trials = [];
for (const policy of policyIds) {
  console.log(`serial full match ${policy}`);
  const out = `../pr179-performance-${policy}`,
    log = openSync(`../pr179-performance-${policy}.log`, 'w');
  const child = spawnSync(
    process.execPath,
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/benchmarkPr179.mjs',
      `--policy=${policy}`,
      '--serial',
      `--ids=${fixture.design.id}`,
      `--out=${out}`,
    ],
    { stdio: ['ignore', log, log] },
  );
  closeSync(log);
  if (child.status !== 0) throw new Error(`Failed serial trial ${policy}`);
  const receipt = JSON.parse(gunzipSync(readFileSync(`${out}/${fixture.design.id}.json.gz`)));
  const cohort = JSON.parse(
    gunzipSync(
      readFileSync(`docs/performance/pr179-evidence/final/${policy}-${fixture.design.id}.json.gz`),
    ),
  );
  if (receipt.error || receipt.finalHash !== cohort.finalHash)
    throw new Error(`Serial trajectory differs ${policy}`);
  trials.push({
    policy,
    finalHash: receipt.finalHash,
    performance: receipt.performance,
    diagnostics: receipt.report.diagnostics,
  });
}
// A complete unobserved trajectory verifies that diagnostic collection has no football effect.
let state = configureMatchPolicy(globalThis.structuredClone(fixture.state), 'phase-role-hybrid-v1'),
  ticks = 0,
  peakRss = 0,
  peakHeap = 0;
const started = performance.now(),
  cpu = process.cpuUsage();
while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < 7200) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  ticks++;
  if (ticks % 4000 === 0) {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
  }
}
const usage = process.cpuUsage(cpu),
  finalHash = sha(state);
if (finalHash !== trials.find((t) => t.policy === 'phase-role-hybrid-v1').finalHash)
  throw new Error('Full-match observer equality failed');
roleSamples.sort((a, b) => a - b);
const base = trials[0].performance;
const result = {
  version: 1,
  sourceHash: pr172SourceHash(),
  fixtureId: fixture.design.id,
  inputHash: fixture.inputHash,
  runtime: process.version,
  semantics:
    'Six complete serial trajectories after research/browser/test stepping stops: five uniformly observed/profiled policies plus a plain R3 equality run. One new Node process per policy; imports/fixture construction are outside timing, first-match JIT is included. Not a confidence interval or general engine throughput claim. Inclusive sampled elapsed spans are not exclusive CPU percentages; memory is sampled, not true allocation peak.',
  allocation: {
    repeats: 200,
    p50Ms: roleSamples[100],
    p90Ms: roleSamples[180],
    minMs: roleSamples[0],
    maxMs: roleSamples.at(-1),
    processCpuMsIncludingHashValidation: (allocationCpu.user + allocationCpu.system) / 1000,
  },
  trials: trials.map((t) => ({
    ...t,
    cpuVsLegacy: t.performance.cpuSeconds / base.cpuSeconds,
    wallVsLegacy: t.performance.wallSeconds / base.wallSeconds,
  })),
  plainR3: {
    finalHash,
    ticks,
    status: state.status,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (usage.user + usage.system) / 1e6,
    peakRss,
    peakHeap,
    fullStateEquality: true,
  },
};
writeFileSync('docs/performance/PR179-performance.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
