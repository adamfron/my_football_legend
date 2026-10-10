import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import * as matchSimulation from '../src/core/matchSimulation/matchSimulation';
import { CONTEXT_MAX_SAMPLES } from '../src/app/match/tacticalRenderer/contextHistory';
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
  it('stops on canonical abandonment and exports the actual reached score and time', () => {
    const step = vi
      .spyOn(matchSimulation, 'stepTacticalMatchAfterDecisionProbe')
      .mockImplementationOnce((state) => ({
        ...state,
        time: 0.025,
        status: 'abandoned',
        score: { home: 1, away: 2 },
        termination: { reason: 'insufficient_players', at: 0.025, team: 'away', activePlayers: 6 },
      }));
    try {
      const result = runPerformanceBenchmark(session, {
        canonicalMinutes: 45,
        mode: 'normal',
        profilingEnabled: false,
      }).result;
      expect(step).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('abandoned');
      expect(result.terminationReason).toBe('insufficient_players');
      expect(result.canonicalSeconds).toBe(0.025);
      expect(result.score).toEqual({ home: 1, away: 2 });
      expect(result.ticks).toBe(1);
      expect(result.buckets).toHaveLength(1);
    } finally {
      step.mockRestore();
    }
  });

  // Four complete simulations with capture/export need bounded time on shared CI.
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
      expect(result.context.capacity).toBe(CONTEXT_MAX_SAMPLES);
      expect(result.context.samplesRetained).toBeLessThanOrEqual(CONTEXT_MAX_SAMPLES);
      expect(result.defensiveTelemetry).toEqual(results[0]!.defensiveTelemetry);
      expect(result.discipline).toEqual(results[0]!.discipline);
      for (const bucket of result.buckets) {
        expect(bucket.collections.canonicalActionEvents).toBeLessThanOrEqual(96);
        expect(bucket.collections.pendingCards).toBeLessThanOrEqual(22);
        expect(bucket.collections.defensivePlayerCounters).toBeLessThanOrEqual(22);
      }
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
  }, 60_000);

  // Complete simulations with per-tick profiling can exceed 5 s on shared CI.
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
  }, 30_000);

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
