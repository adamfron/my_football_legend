import { z } from 'zod';

export const backgroundBatchSampleSchema = z.object({
  elapsedMs: z.number().nonnegative(),
  canonicalSeconds: z.number().nonnegative(),
  ticks: z.number().int().nonnegative(),
  canonicalSpeed: z.number().nonnegative(),
});
export type BackgroundBatchSample = z.infer<typeof backgroundBatchSampleSchema>;

export const backgroundPerformanceSchema = z.object({
  realElapsedMs: z.number().nonnegative(),
  canonicalSecondsAdvanced: z.number().nonnegative(),
  ticksExecuted: z.number().int().nonnegative(),
  batches: z.number().int().nonnegative(),
  meanBatchMs: z.number().nonnegative(),
  p50BatchMs: z.number().nonnegative(),
  p90BatchMs: z.number().nonnegative(),
  p95BatchMs: z.number().nonnegative(),
  p99BatchMs: z.number().nonnegative(),
  maxBatchMs: z.number().nonnegative(),
  canonicalSecondsPerRealSecond: z.number().nonnegative(),
  realSecondsPerCanonicalMinute: z.number().nonnegative(),
  estimatedRealSecondsPer45Minutes: z.number().nonnegative(),
  estimatedRealSecondsPer90Minutes: z.number().nonnegative(),
  ticksPerRealSecond: z.number().nonnegative(),
  rollingCanonicalSpeed: z.number().nonnegative(),
  minRollingCanonicalSpeed: z.number().nonnegative(),
  rendererCallsBackground: z.number().int().nonnegative(),
});
export type BackgroundPerformance = z.infer<typeof backgroundPerformanceSchema>;

export const percentile = (values: readonly number[], quantile: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1)]!;
};

/** Bounded, observer-only wall-clock accumulator. Samples never enter canonical state. */
export class BackgroundPerformanceTracker {
  private samples: BackgroundBatchSample[] = [];
  private totalMs = 0;
  private totalCanonicalSeconds = 0;
  private totalTicks = 0;
  private totalBatches = 0;

  constructor(
    private readonly sampleLimit = 240,
    private readonly rollingBatchCount = 16,
  ) {}

  record(elapsedMs: number, canonicalSeconds: number, ticks: number) {
    const safeMs = Math.max(0, elapsedMs);
    const speed = safeMs > 0 ? canonicalSeconds / (safeMs / 1000) : 0;
    this.samples.push({ elapsedMs: safeMs, canonicalSeconds, ticks, canonicalSpeed: speed });
    if (this.samples.length > this.sampleLimit)
      this.samples.splice(0, this.samples.length - this.sampleLimit);
    this.totalMs += safeMs;
    this.totalCanonicalSeconds += canonicalSeconds;
    this.totalTicks += ticks;
    this.totalBatches += 1;
  }

  get sampleCount() {
    return this.samples.length;
  }

  snapshot(rendererCallsBackground = 0): BackgroundPerformance {
    const latencies = this.samples.map((sample) => sample.elapsedMs);
    const rollingSpeeds: number[] = [];
    for (let end = 1; end <= this.samples.length; end += 1) {
      const window = this.samples.slice(Math.max(0, end - this.rollingBatchCount), end);
      const ms = window.reduce((sum, sample) => sum + sample.elapsedMs, 0);
      const canonical = window.reduce((sum, sample) => sum + sample.canonicalSeconds, 0);
      if (ms > 0) rollingSpeeds.push(canonical / (ms / 1000));
    }
    const speed = this.totalMs > 0 ? this.totalCanonicalSeconds / (this.totalMs / 1000) : 0;
    const rollingCanonicalSpeed = rollingSpeeds.at(-1) ?? 0;
    return backgroundPerformanceSchema.parse({
      realElapsedMs: this.totalMs,
      canonicalSecondsAdvanced: this.totalCanonicalSeconds,
      ticksExecuted: this.totalTicks,
      batches: this.totalBatches,
      meanBatchMs: latencies.length
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : 0,
      p50BatchMs: percentile(latencies, 0.5),
      p90BatchMs: percentile(latencies, 0.9),
      p95BatchMs: percentile(latencies, 0.95),
      p99BatchMs: percentile(latencies, 0.99),
      maxBatchMs: latencies.length ? Math.max(...latencies) : 0,
      canonicalSecondsPerRealSecond: speed,
      realSecondsPerCanonicalMinute: speed > 0 ? 60 / speed : 0,
      estimatedRealSecondsPer45Minutes: speed > 0 ? 2700 / speed : 0,
      estimatedRealSecondsPer90Minutes: speed > 0 ? 5400 / speed : 0,
      ticksPerRealSecond: this.totalMs > 0 ? this.totalTicks / (this.totalMs / 1000) : 0,
      rollingCanonicalSpeed,
      minRollingCanonicalSpeed: rollingSpeeds.length ? Math.min(...rollingSpeeds) : 0,
      rendererCallsBackground,
    });
  }
}

export const classifyCanonicalSpeed = (speed: number) =>
  speed < 30
    ? 'critical'
    : speed < 60
      ? 'slow'
      : speed < 100
        ? 'usable'
        : speed <= 200
          ? 'good'
          : 'excellent';

/** Presentation-only controller: changes yield boundaries, never dt or canonical tick order. */
export const nextAdaptiveBatchSize = (currentTicks: number, elapsedMs: number, targetMs = 16) => {
  if (elapsedMs <= 0) return currentTicks;
  const scale = Math.max(0.5, Math.min(2, targetMs / elapsedMs));
  return Math.max(20, Math.min(800, Math.round(currentTicks * scale)));
};
