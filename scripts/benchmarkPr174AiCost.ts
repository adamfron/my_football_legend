import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
const baseline = process.argv.find((a) => a.startsWith('--baseline-root='))?.slice(16);
if (!baseline) throw new Error('--baseline-root required');
const reference = JSON.parse(readFileSync('docs/performance/PR174-performance.json', 'utf8')) as {
  rows: { engine: string; finalStateHash: string }[];
};
const rows = [];
for (const [index, root] of [resolve(baseline), resolve('.')].entries()) {
  const fixtureModule = (await import(
    pathToFileURL(resolve(root, 'scripts/pr171Fixtures.ts')).href
  )) as typeof import('./pr171Fixtures');
  const sim = (await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href
  )) as typeof import('../src/core/matchSimulation/matchSimulation');
  const profiling = (await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/performanceProfiling.ts')).href
  )) as typeof import('../src/core/matchSimulation/performanceProfiling');
  const fixture = fixtureModule.createPr171Fixture('senior_balanced', false);
  let state = structuredClone(fixture.state);
  const profiler = new profiling.PerformanceProfiler({ enabled: true, sampleEveryTicks: 1 });
  const started = performance.now(),
    cpuStart = process.cpuUsage();
  profiling.withPerformanceProfiler(profiler, () => {
    for (let tick = 0; tick < 2400; tick++) {
      profiler.beginTick(tick);
      const span = profiling.startPerformanceSpan('canonical_step');
      state = sim.stepTacticalMatchAfterDecisionProbe(state);
      profiling.endPerformanceSpan('canonical_step', span);
    }
  });
  const cpu = process.cpuUsage(cpuStart),
    wallMs = performance.now() - started;
  const engine = index ? 'PR174' : 'PR173',
    hash = pr172Hash(state),
    profile = profiler.snapshot();
  if (
    profile.sampledTicks !== 2400 ||
    hash !== reference.rows.find((r) => r.engine === engine)?.finalStateHash
  )
    throw new Error('All-tick profiler changed canonical output');
  rows.push({
    engine,
    sourceHash: pr172SourceHash(root),
    fixtureHash: pr172Hash(fixture.session),
    finalStateHash: hash,
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    profile,
  });
}
writeFileSync(
  'docs/performance/PR174-ai-cost.json',
  JSON.stringify(
    {
      version: 1,
      node: process.version,
      method:
        'All 2400 ticks of the same original 60s senior fixture, observers disabled, serial after other measurements. This complementary profiler avoids fixed-37-tick sampling alias of infrequent expensive AI releases. Inclusive instrumented spans overlap and include profiling overhead; action_resolution spans can include no-op/cooldown checks. It is not an isolated algorithm-cost or population estimate. Complete state equals the corresponding unprofiled performance sample.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
