import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createFormationBenchmarkMatch,
  createFormationBenchmarkSession,
} from '../src/core/matchSimulation/benchmarkFixtures';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import {
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { descriptive } from './formationBenchmarkSummary';

const measurements = [];
for (let repetition = 0; repetition < 3; repetition++)
  for (const seed of ['pr162-observer-a', 'pr162-observer-b']) {
    const runs = [];
    for (const observed of repetition % 2 ? [true, false] : [false, true]) {
      let state = createFormationBenchmarkMatch({ opponent: '4-4-2', seed }).state;
      const tracker = observed ? new AttackingFunnelTracker() : undefined;
      const start = performance.now();
      for (let tick = 0; tick < 2400; tick++) {
        const previous = state;
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        tracker?.observe(previous, state);
      }
      runs.push({
        observed,
        wallMs: performance.now() - start,
        sha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
      });
    }
    if (runs[0]!.sha256 !== runs[1]!.sha256)
      throw new Error('Observer changes complete canonical state');
    const before = runs.find((r) => !r.observed)!,
      after = runs.find((r) => r.observed)!;
    measurements.push({
      seed,
      repetition: repetition + 1,
      order: runs.map((r) => r.observed),
      beforeMs: before.wallMs,
      afterMs: after.wallMs,
      overheadRatio: after.wallMs / before.wallMs - 1,
      stateHash: after.sha256,
    });
  }
const result = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  ticksPerRun: 2400,
  dt: FIXED_MATCH_DT,
  measurements,
  overhead: descriptive(measurements.map((r) => r.overheadRatio)),
  caveat:
    'Alternating sequential order in one process. Headless measurements are not renderer/FPS measurements; host scheduling and JIT still affect wall time.',
};
const baseline = (await import(
  pathToFileURL(resolve('../pr162-baseline/src/core/matchSimulation/matchSimulation.ts')).href
)) as typeof import('../src/core/matchSimulation/matchSimulation');
const current = await import('../src/core/matchSimulation/matchSimulation');
const engineMeasurements = [];
for (let repetition = 0; repetition < 3; repetition++)
  for (const seed of ['pr162-engine-cost-a', 'pr162-engine-cost-b']) {
    const runs = [];
    for (const [revision, engine] of repetition % 2
      ? ([
          ['after', current],
          ['before', baseline],
        ] as const)
      : ([
          ['before', baseline],
          ['after', current],
        ] as const)) {
      let state = engine.createTacticalMatch(
        createFormationBenchmarkSession({ opponent: '4-4-2', seed }),
      );
      const start = performance.now();
      for (let tick = 0; tick < 2400; tick++)
        state = engine.stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      runs.push({
        revision,
        wallMs: performance.now() - start,
        finalStateHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
      });
    }
    const before = runs.find((r) => r.revision === 'before')!,
      after = runs.find((r) => r.revision === 'after')!;
    engineMeasurements.push({
      seed,
      repetition: repetition + 1,
      runs,
      changeRatio: after.wallMs / before.wallMs - 1,
    });
  }
writeFileSync(
  '../PR162-observer-performance.json',
  JSON.stringify(
    {
      ...result,
      baselineCommit: '4d61ee8e0214bd230b27bbbc41a7b7024411afd8',
      engineMeasurements,
      engineChange: descriptive(engineMeasurements.map((r) => r.changeRatio)),
    },
    null,
    2,
  ) + '\n',
);
console.info(result.overhead);
