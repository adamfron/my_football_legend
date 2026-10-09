import { z } from 'zod';

export const performanceObserverModeSchema = z.enum([
  'release_minimal',
  'normal',
  'dev',
  'capture',
]);
export type PerformanceObserverMode = z.infer<typeof performanceObserverModeSchema>;
export const isDevObservationMode = (mode: PerformanceObserverMode) =>
  mode === 'dev' || mode === 'capture';
export const requiresPresentationObservers = (mode: PerformanceObserverMode) =>
  mode !== 'release_minimal';

export const performanceCategorySchema = z.enum([
  'canonical_step',
  'movement_physics',
  'ball_physics',
  'ball_contact_control',
  'pressure_decision',
  'tactical_planning',
  'action_resolution',
  'interception_eta',
  'match_flow',
  'statistics',
  'pass_contact_evidence',
  'agency_projection',
  'match_moment',
  'context_history',
  'diagnostics',
  'debug_capture',
  'debug_construction',
  'debug_serialization',
  'debug_retention',
  'benchmark_evidence',
]);
export type PerformanceCategory = z.infer<typeof performanceCategorySchema>;
export const performanceProfileSchema = z.object({
  enabled: z.boolean(),
  sampleEveryTicks: z.number().int().positive(),
  ticks: z.number().int().nonnegative(),
  sampledTicks: z.number().int().nonnegative(),
  timingSemantics: z.literal('inclusive_sampled_spans'),
  categories: z.array(
    z.object({
      category: performanceCategorySchema,
      sampledMs: z.number().nonnegative(),
      estimatedMs: z.number().nonnegative(),
      sampledCalls: z.number().int().nonnegative(),
    }),
  ),
});
export type PerformanceProfile = z.infer<typeof performanceProfileSchema>;

/** Observer context is external to canonical state. A disabled profiler never reads the clock.
 * 37 is coprime to the four-tick planning cadence; 40 would systematically bias its samples.
 * Nested spans are inclusive and must not be summed as exclusive percentages. */
export class PerformanceProfiler {
  readonly enabled: boolean;
  readonly sampleEveryTicks: number;
  sampling = false;
  private ticks = 0;
  private sampledTicks = 0;
  private measurements = new Map<PerformanceCategory, { ms: number; calls: number }>();

  constructor({ enabled = false, sampleEveryTicks = 37 } = {}) {
    this.enabled = enabled;
    this.sampleEveryTicks = Math.max(1, Math.floor(sampleEveryTicks));
  }

  beginTick(tick: number) {
    this.ticks++;
    this.sampling = this.enabled && tick % this.sampleEveryTicks === 0;
    if (this.sampling) this.sampledTicks++;
  }

  record(category: PerformanceCategory, elapsedMs: number) {
    const entry = this.measurements.get(category);
    if (entry) {
      entry.ms += Math.max(0, elapsedMs);
      entry.calls++;
    } else this.measurements.set(category, { ms: Math.max(0, elapsedMs), calls: 1 });
  }

  snapshot(): PerformanceProfile {
    const weight = this.sampledTicks > 0 ? this.ticks / this.sampledTicks : 0;
    return {
      enabled: this.enabled,
      sampleEveryTicks: this.sampleEveryTicks,
      ticks: this.ticks,
      sampledTicks: this.sampledTicks,
      timingSemantics: 'inclusive_sampled_spans',
      categories: [...this.measurements].map(([category, entry]) => ({
        category,
        sampledMs: entry.ms,
        estimatedMs: entry.ms * weight,
        sampledCalls: entry.calls,
      })),
    };
  }
}

let activeProfiler: PerformanceProfiler | undefined;

/** Synchronous scope; benchmarks/game orchestration own this observer, never the football state. */
export const withPerformanceProfiler = <T>(profiler: PerformanceProfiler, work: () => T): T => {
  const previous = activeProfiler;
  activeProfiler = profiler;
  try {
    return work();
  } finally {
    activeProfiler = previous;
  }
};

export const startPerformanceSpan = (category: PerformanceCategory): number | undefined => {
  void category;
  return activeProfiler?.sampling ? performance.now() : undefined;
};

export const endPerformanceSpan = (category: PerformanceCategory, started: number | undefined) => {
  if (started !== undefined) activeProfiler?.record(category, performance.now() - started);
};
