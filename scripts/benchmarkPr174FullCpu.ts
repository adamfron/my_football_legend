import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
const baseline = process.argv.find((a) => a.startsWith('--baseline-root='))?.slice(16);
if (!baseline) throw new Error('--baseline-root required');
const rows = [];
for (const [i, root] of [resolve(baseline), resolve('.')].entries()) {
  const fixtures = (await import(
    pathToFileURL(resolve(root, 'scripts/pr171Fixtures.ts')).href
  )) as typeof import('./pr171Fixtures');
  const sim = (await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href
  )) as typeof import('../src/core/matchSimulation/matchSimulation');
  const f = fixtures.createPr171Fixture('youth_native', false);
  let state = structuredClone(f.state),
    ticks = 0;
  const started = performance.now(),
    cpuStart = process.cpuUsage();
  while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < 7200) {
    if (state.status === 'half_time') state = sim.startSecondHalf(state);
    const previous = state;
    state = sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (state === previous) throw new Error('Unexpected stalled match');
    ticks++;
    if (ticks % 24000 === 0)
      console.log(`full CPU ${i ? 'PR174' : 'PR173'} t=${state.time.toFixed(1)}`);
  }
  const cpu = process.cpuUsage(cpuStart),
    wallMs = performance.now() - started;
  const canonicalHash = pr172Hash(state);
  const observed = JSON.parse(
    readFileSync(
      resolve(i ? '../pr174-K-full' : '../pr174-pr173-full', 'cohort-youth_native-false.json'),
      'utf8',
    ),
  );
  if (state.status !== 'full_time' || canonicalHash !== observed.observed.finalStateHash)
    throw new Error('Full match completion/hash mismatch');
  rows.push({
    engine: i ? 'PR174' : 'PR173',
    node: process.version,
    sourceHash: pr172SourceHash(root),
    fixtureHash: pr172Hash(f.session),
    initialHash: pr172Hash(f.state),
    finalHash: canonicalHash,
    status: state.status,
    time: state.time,
    ticks,
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    observerDisabledCompleteStateEqual: true,
  });
}
writeFileSync(
  'docs/performance/PR174-full-match-cpu.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'One original full youth fixture per engine, serial after all other research and verification. Observers disabled. Actual process CPU and wall time, same runtime/fixture. Complete state equals the corresponding observed full-match receipt. One evolving trajectory per engine is not a general performance distribution.',
      rows,
      cpuRatio: rows[1]!.cpuMs / rows[0]!.cpuMs,
      wallRatio: rows[1]!.wallMs / rows[0]!.wallMs,
    },
    null,
    2,
  ) + '\n',
);
