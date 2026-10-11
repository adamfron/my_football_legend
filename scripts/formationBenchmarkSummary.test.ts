// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  descriptive,
  joinBenchmarkSeedBlocks,
  type BenchmarkFile,
} from './formationBenchmarkSummary';

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
});
