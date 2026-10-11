// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  descriptive,
  joinBenchmarkSeedBlocks,
  teamMetrics,
  type BenchmarkResult,
  type BenchmarkFile,
} from './formationBenchmarkSummary';
import { createFormationBenchmarkMatch } from '../src/core/matchSimulation/benchmarkFixtures';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';

describe('PR162 paired seed-block summaries', () => {
  it('retains every seed-block value and uses the small-sample interval', () => {
    const summary = descriptive([-2, 0, 2]);
    expect(summary.n).toBe(3);
    expect(summary.values).toEqual([-2, 0, 2]);
    expect(summary.mean).toBe(0);
    expect(summary.median).toBe(0);
    expect(summary.sd).toBe(2);
    expect(summary.exploratory95Interval![1]).toBeCloseTo((4.303 * 2) / Math.sqrt(3));
  });
  it('reports insufficient uncertainty as missing rather than zero', () => {
    expect(descriptive([])).toMatchObject({
      n: 0,
      mean: null,
      median: null,
      sd: null,
      exploratory95Interval: null,
    });
    expect(descriptive([2])).toMatchObject({
      n: 1,
      mean: 2,
      sd: null,
      exploratory95Interval: null,
    });
  });
  it('accepts new seed blocks only when source and the remaining experimental protocol match', () => {
    const block = (seed: string): BenchmarkFile => ({
      manifest: {
        commit: 'frozen',
        engineHash: 'engine',
        benchmarkHash: 'benchmark',
        telemetryVersion: 3,
        fixedDt: 0.025,
        node: 'same-runtime',
        config: {
          mode: 'geometry',
          minutes: 90,
          attributes: 50,
          opponentAttributes: 50,
          seeds: [seed],
          anchor: '4-4-2',
          opponents: ['4-3-3'],
          observer: true,
          normaliseDuties: false,
          style: 'balanced',
          traces: true,
        },
      },
      expectedMatches: 2,
      completedMatches: 0,
      profiles: {},
      results: [],
    });
    const a = block('pilot'),
      b = block('extra');
    expect(joinBenchmarkSeedBlocks([a, b]).manifest.config.seeds).toEqual(['pilot', 'extra']);
    expect(() => joinBenchmarkSeedBlocks([a, a])).toThrow('Overlapping seed blocks');
    b.manifest.engineHash = 'changed';
    expect(() => joinBenchmarkSeedBlocks([a, b])).toThrow(
      'Incompatible immutable seed-block manifests',
    );
    b.manifest.engineHash = 'engine';
    b.manifest.config.attributes = 70;
    expect(() => joinBenchmarkSeedBlocks([a, b])).toThrow(
      'Incompatible immutable seed-block manifests',
    );
  });
  it('distinguishes observed zeros from counters absent in an older or disabled observer', () => {
    const state = createFormationBenchmarkMatch({
      opponent: '4-4-2',
      seed: 'missing-observation',
    }).state;
    const row: BenchmarkResult = {
      key: 'fixture',
      formation: '4-4-2',
      seed: state.seed,
      reversed: false,
      fixtureHash: 'fixture',
      initialStateHash: 'initial',
      stateHash: 'final',
      finalStatus: 'full_time',
      finalTime: 5400,
      ticks: 216000,
      wallMs: 1,
      score: state.score,
      statistics: state.statistics!,
      funnel: null,
      finalDiagnostics: {},
    };
    expect(teamMetrics(row, 'home')).toMatchObject({
      shots: 0,
      passCompletion: null,
      controlled: null,
      progressiveCompleted: null,
      forwardLineGap: null,
    });
    row.funnel = new AttackingFunnelTracker().snapshot(0);
    expect(teamMetrics(row, 'home')).toMatchObject({
      controlled: 0,
      progressiveCompleted: 0,
      behindReleaseLine: 0,
      forwardLineGap: null,
    });
    row.funnel.version = 1;
    expect(teamMetrics(row, 'home')).toMatchObject({
      progressiveCompleted: null,
      behindReleaseLine: null,
    });
  });
});
