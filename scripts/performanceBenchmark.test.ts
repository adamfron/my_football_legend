import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  assertCanonicalBenchmarkEquality,
  canonicalHash,
  performanceBenchmarkConfigSchema,
  runPerformanceBenchmark,
} from './performanceBenchmark';
import {
  endPerformanceSpan,
  PerformanceProfiler,
  startPerformanceSpan,
  withPerformanceProfiler,
  type PerformanceObserverMode,
} from '../src/core/matchSimulation/performanceProfiling';

const world = createCanonicalWorldDatabase();
const spectator = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr146-performance-regression',
  control: { mode: 'spectator' },
});
const player = spectator.home.players.find((p) => p.profile.primaryPosition !== 'goalkeeper')!;
const session = createSingleMatchSession(world, {
  ...spectator.setup,
  control: {
    mode: 'player',
    clubId: spectator.home.club.id,
    footballerId: player.footballerId,
    forceIntoXI: false,
  },
});

describe('PR146 deterministic performance harness', () => {
  it('compares complete canonical, statistics, player and event hashes across A-D', () => {
    const modes: PerformanceObserverMode[] = ['release_minimal', 'normal', 'dev', 'capture'];
    const results = modes.map(
      (mode) =>
        runPerformanceBenchmark(session, {
          canonicalMinutes: 0.2,
          mode,
          profilingEnabled: false,
          batchTicks: 40,
        }).result,
    );
    expect(assertCanonicalBenchmarkEquality(results)).toBe(true);
    for (const result of results) {
      expect(result.rendererCallsBackground).toBe(0);
      expect(result.canonicalSeconds).toBeCloseTo(12, 7);
      expect(result.ticks).toBe(480);
      expect(result.profile.sampledTicks).toBe(0);
      expect(result.planning.plansRecomputed + result.planning.plansReused).toBe(result.ticks);
      expect(result.planning.plansReused).toBeGreaterThan(result.planning.plansRecomputed);
      expect(result.context.samplesRetained).toBeLessThanOrEqual(62);
    }
    expect(results[0]!.context.samplesWritten).toBe(0);
    expect(results[1]!.context.samplesWritten).toBeGreaterThan(0);
    const capture = results[3]!;
    expect(capture.buckets[0]!.collections.debugFrames).toBeLessThanOrEqual(402);
    expect(capture.export.jsonBytes).toBeGreaterThan(0);
    expect(() =>
      assertCanonicalBenchmarkEquality([
        results[0]!,
        { ...results[1]!, hashes: { ...results[1]!.hashes, statistics: 'changed' } },
      ]),
    ).toThrow('changed canonical football');
  });

  it('preserves outcomes across different batch boundaries and profiler sampling', () => {
    const first = runPerformanceBenchmark(session, {
      canonicalMinutes: 0.05,
      mode: 'normal',
      batchTicks: 1,
      sampleEveryTicks: 1,
    }).result;
    const second = runPerformanceBenchmark(session, {
      canonicalMinutes: 0.05,
      mode: 'normal',
      batchTicks: 77,
      profilingEnabled: false,
    }).result;
    expect(assertCanonicalBenchmarkEquality([first, second])).toBe(true);
    expect(first.profile.sampledTicks).toBe(first.ticks);
    expect(first.profile.categories.some((entry) => entry.category === 'canonical_step')).toBe(
      true,
    );
    expect(first.batches).toBeGreaterThan(second.batches);
  });

  it('rejects unsupported durations, modes and unbounded batches', () => {
    expect(performanceBenchmarkConfigSchema.safeParse({ canonicalMinutes: 91 }).success).toBe(
      false,
    );
    expect(performanceBenchmarkConfigSchema.safeParse({ mode: 'video' }).success).toBe(false);
    expect(performanceBenchmarkConfigSchema.safeParse({ batchTicks: 0 }).success).toBe(false);
  });

  it('hashes all canonical fields independently of object insertion order', () => {
    expect(canonicalHash({ a: 1, b: [{ x: 2, y: 3 }] })).toBe(
      canonicalHash({ b: [{ y: 3, x: 2 }], a: 1 }),
    );
    expect(canonicalHash({ score: 0, statistics: [1, 2] })).not.toBe(
      canonicalHash({ score: 0, statistics: [1, 3] }),
    );
  });

  it('disabled instrumentation does not read the clock and restores nested scopes', () => {
    const clock = vi.spyOn(performance, 'now');
    const disabled = new PerformanceProfiler();
    withPerformanceProfiler(disabled, () => {
      disabled.beginTick(0);
      endPerformanceSpan('canonical_step', startPerformanceSpan('canonical_step'));
    });
    expect(clock).not.toHaveBeenCalled();
    const enabled = new PerformanceProfiler({ enabled: true, sampleEveryTicks: 1 });
    withPerformanceProfiler(enabled, () => {
      enabled.beginTick(0);
      withPerformanceProfiler(disabled, () => {
        expect(startPerformanceSpan('statistics')).toBeUndefined();
      });
      endPerformanceSpan('statistics', startPerformanceSpan('statistics'));
    });
    expect(enabled.snapshot().categories[0]!.sampledCalls).toBe(1);
    expect(startPerformanceSpan('statistics')).toBeUndefined();
    clock.mockRestore();
  });
});
