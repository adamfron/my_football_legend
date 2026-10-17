import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
const baselineRoot = process.argv.find((a) => a.startsWith('--baseline-root='))?.slice(16);
if (!baselineRoot) throw new Error('--baseline-root must identify PR171');
const engines = await Promise.all(
  [resolve(baselineRoot), resolve('.')].map(async (root, index) => ({
    label: index ? 'PR172' : 'PR171',
    sourceHash: pr172SourceHash(root),
    fixture: (
      (await import(
        pathToFileURL(resolve(root, 'scripts/pr171Fixtures.ts')).href
      )) as typeof import('./pr171Fixtures')
    ).createPr171Fixture('senior_balanced', false),
    sim: (await import(
      pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href
    )) as typeof import('../src/core/matchSimulation/matchSimulation'),
    funnel: (await import(
      pathToFileURL(resolve(root, 'src/core/matchSimulation/attackingFunnel.ts')).href
    )) as typeof import('../src/core/matchSimulation/attackingFunnel'),
    passing: (await import(
      pathToFileURL(resolve(root, 'src/core/matchSimulation/passingConnectivityDiagnostics.ts'))
        .href
    )) as typeof import('../src/core/matchSimulation/passingConnectivityDiagnostics'),
    flow: (await import(
      pathToFileURL(resolve(root, 'src/core/matchSimulation/matchFlowTelemetry.ts')).href
    )) as typeof import('../src/core/matchSimulation/matchFlowTelemetry'),
  })),
);
if (pr172Hash(engines[0]!.fixture.session) !== pr172Hash(engines[1]!.fixture.session))
  throw new Error('Performance fixtures differ');
const schema = z.object({
  engine: z.string(),
  mode: z.enum(['plain', 'existing', 'extended']),
  sample: z.number().int(),
  wallMs: z.number().positive(),
  ticks: z.literal(2400),
  ticksPerSecond: z.number().positive(),
  finalStateHash: z.string(),
  retainedBytes: z.number().nonnegative(),
});
const rows: z.infer<typeof schema>[] = [];
for (let sample = -1; sample < 3; sample++)
  for (const engine of sample % 2 === 0 ? [...engines].reverse() : engines)
    for (const mode of ['plain', 'existing', 'extended'] as const) {
      let state = structuredClone(engine.fixture.state),
        flow = engine.flow.createMatchFlowTelemetry('pr172-performance');
      const funnel = new engine.funnel.AttackingFunnelTracker(undefined, true, mode === 'extended'),
        passing = new engine.passing.PassingConnectivityTracker();
      const started = performance.now();
      for (let tick = 0; tick < 2400; tick++) {
        const previous = state;
        state = engine.sim.stepTacticalMatchAfterDecisionProbe(state);
        if (mode !== 'plain') {
          funnel.observe(previous, state);
          passing.observe(previous, state);
          flow = engine.flow.observeMatchFlow(flow, previous, state);
        }
      }
      const wallMs = performance.now() - started;
      if (sample >= 0)
        rows.push(
          schema.parse({
            engine: engine.label,
            mode,
            sample,
            wallMs,
            ticks: 2400,
            ticksPerSecond: 2400000 / wallMs,
            finalStateHash: pr172Hash(state),
            retainedBytes:
              mode === 'plain'
                ? 0
                : Buffer.byteLength(
                    JSON.stringify({
                      funnel: funnel.snapshot(state.time),
                      passing: passing.snapshot(),
                      flow,
                    }),
                  ),
          }),
        );
      console.log(`${engine.label} ${mode} sample=${sample} ${wallMs.toFixed(1)}ms`);
    }
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
const medians = Object.fromEntries(
  engines.map((e) => [
    e.label,
    Object.fromEntries(
      ['plain', 'existing', 'extended'].map((mode) => [
        mode,
        median(rows.filter((r) => r.engine === e.label && r.mode === mode).map((r) => r.wallMs)),
      ]),
    ),
  ]),
);
for (const engine of engines)
  if (
    new Set(rows.filter((r) => r.engine === engine.label).map((r) => r.finalStateHash)).size !== 1
  )
    throw new Error('Observer altered canonical state');
writeFileSync(
  'docs/performance/PR172-performance.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'Serial 60-second canonical windows; one discarded warm-up per engine/mode, three measured samples. Alternating engine order, same original fixture. Run only after other research and verification processes finish. CPU stepping, not browser FPS.',
      sources: engines.map((e) => ({
        engine: e.label,
        sourceHash: e.sourceHash,
        fixtureHash: pr172Hash(e.fixture.session),
      })),
      medians,
      rows,
      completeStateObserverEquality: true,
    },
    null,
    2,
  ) + '\n',
);
