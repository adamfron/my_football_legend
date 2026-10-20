import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  configureMatchPolicy,
  RoleExperimentRecorder,
} from '../src/core/matchSimulation/roleExperiment.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [key, ...v] = a.replace(/^--/, '').split('=');
    return [key, v.join('=')];
  }),
);
const policy = args.get('policy') ?? 'role-intent-v1';
const dir = args.get('out') ?? `../pr179-development-${policy}`;
mkdirSync(dir, { recursive: true });
const fixtures = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr179-evidence/initial-states.json.gz')),
);
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const manifest = {
  policy,
  sourceHash: pr172SourceHash(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  harnessHash: sha(readFileSync('scripts/benchmarkPr179.mjs', 'utf8').replaceAll('\r\n', '\n')),
  dt: 0.025,
  timing: args.has('serial')
    ? 'serial, no concurrent research/tests'
    : 'concurrent research, not a policy CPU ratio',
};
for (const f of fixtures.filter(
  (f) =>
    f.design.split === 'development' &&
    (!args.has('ids') || args.get('ids').split(',').includes(f.design.id)),
)) {
  if (sha(f.state) !== f.inputHash) throw new Error('Frozen state hash mismatch');
  const path = `${dir}/${f.design.id}.json.gz`;
  if (existsSync(path)) {
    const prior = JSON.parse(gunzipSync(readFileSync(path)));
    if (
      prior.manifest.sourceHash !== manifest.sourceHash ||
      prior.manifest.harnessHash !== manifest.harnessHash
    )
      throw new Error('Refusing incompatible receipt reuse');
    console.log(`resume ${f.design.id}`);
    continue;
  }
  let state = configureMatchPolicy(globalThis.structuredClone(f.state), policy),
    ticks = 0,
    error = null,
    peakRss = 0,
    peakHeap = 0;
  const recorder = new RoleExperimentRecorder(state),
    profiler = new PerformanceProfiler({ enabled: true });
  const started = performance.now(),
    cpu = process.cpuUsage();
  try {
    while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < 7200) {
      if (state.status === 'half_time') state = startSecondHalf(state);
      const previous = state;
      profiler.beginTick(ticks);
      state = withRankingObserver(recorder.ranking, () =>
        withPerformanceProfiler(profiler, () => stepTacticalMatchAfterDecisionProbe(state, 0.025)),
      );
      if (previous === state) throw new Error(`Canonical stalled at ${state.time}`);
      recorder.observe(previous, state);
      ticks++;
      if (ticks % 4000 === 0) {
        const memory = process.memoryUsage();
        peakRss = Math.max(peakRss, memory.rss);
        peakHeap = Math.max(peakHeap, memory.heapUsed);
        writeFileSync(
          `${dir}/progress.json`,
          JSON.stringify({
            id: f.design.id,
            policy,
            time: state.time,
            status: state.status,
            ticks,
            wallSeconds: (performance.now() - started) / 1000,
          }),
        );
      }
    }
    if (state.status !== 'full_time')
      throw new Error(`Match did not reach full_time: ${state.status} at ${state.time}`);
    assertMatchStatisticsInvariants(state.statistics, state);
  } catch (e) {
    error = String(e?.stack ?? e);
  }
  const usage = process.cpuUsage(cpu);
  const report = recorder.export(
    f.session,
    state,
    `${manifest.revision}:${manifest.sourceHash}`,
    process.version,
  );
  report.metadata.preMatchStrength = {
    tier: f.design.tier,
    nativePopulationStrength: f.design.strength,
    definition: 'PR179-fixture-manifest.json',
  };
  const receipt = {
    manifest,
    design: f.design,
    inputHash: f.inputHash,
    sessionHash: f.sessionHash,
    ticks,
    error,
    finalHash: sha(state),
    report,
    performance: {
      wallSeconds: (performance.now() - started) / 1000,
      cpuSeconds: (usage.user + usage.system) / 1e6,
      peakRss,
      peakHeap,
      profile: profiler.snapshot(),
    },
  };
  writeFileSync(path, gzipSync(JSON.stringify(receipt)));
  if (error)
    writeFileSync(`${dir}/${f.design.id}-failure-state.json.gz`, gzipSync(JSON.stringify(state)));
  console.log(
    JSON.stringify({
      id: f.design.id,
      policy,
      status: state.status,
      time: state.time,
      result: state.score,
      official: report.summary.official,
      hold: report.diagnostics.maxHoldSeconds,
      pathological: report.diagnostics.pathologicalHolds,
      wall: receipt.performance.wallSeconds,
      error,
    }),
  );
  if (error) process.exitCode = 1;
}
