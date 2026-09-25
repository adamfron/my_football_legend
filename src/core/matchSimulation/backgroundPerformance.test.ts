import { describe, expect, it } from 'vitest';
import {
  BackgroundPerformanceTracker,
  nextAdaptiveBatchSize,
  percentile,
} from './backgroundPerformance';

describe('background performance telemetry', () => {
  it('computes canonical throughput and latency percentiles', () => {
    const tracker = new BackgroundPerformanceTracker();
    tracker.record(100, 2, 80);
    tracker.record(300, 6, 240);
    const result = tracker.snapshot(0);
    expect(result).toMatchObject({
      realElapsedMs: 400,
      canonicalSecondsAdvanced: 8,
      ticksExecuted: 320,
      batches: 2,
      meanBatchMs: 200,
      p50BatchMs: 100,
      p95BatchMs: 300,
      canonicalSecondsPerRealSecond: 20,
      realSecondsPerCanonicalMinute: 3,
      ticksPerRealSecond: 800,
    });
  });

  it('uses nearest-rank percentiles and bounds rolling history', () => {
    expect(percentile([4, 1, 3, 2], 0.95)).toBe(4);
    const tracker = new BackgroundPerformanceTracker(3, 2);
    for (let index = 0; index < 10; index += 1) tracker.record(10, 0.4, 16);
    expect(tracker.sampleCount).toBe(3);
    expect(tracker.snapshot().minRollingCanonicalSpeed).toBeCloseTo(40);
  });

  it('does not mutate canonical input while observing a batch', () => {
    const canonical = Object.freeze({ time: 12, seed: 'same' });
    const before = JSON.stringify(canonical);
    new BackgroundPerformanceTracker().record(5, 1, 40);
    expect(JSON.stringify(canonical)).toBe(before);
  });

  it('adapts presentation batch size within responsive bounds', () => {
    expect(nextAdaptiveBatchSize(200, 40)).toBe(100);
    expect(nextAdaptiveBatchSize(100, 4)).toBe(200);
    expect(nextAdaptiveBatchSize(20, 100)).toBe(20);
    expect(nextAdaptiveBatchSize(800, 1)).toBe(800);
  });
});
