import { z } from 'zod';
import type { SingleMatchSession } from '../singleMatch';
import { BackgroundPerformanceTracker, backgroundPerformanceSchema } from './backgroundPerformance';
import { createMatchFlowTelemetry, observeMatchFlow } from './matchFlowTelemetry';
import { projectMatchMoment } from './matchMoment';
import { createTacticalMatch, FIXED_MATCH_DT, stepTacticalMatch } from './matchSimulation';

export const backgroundBenchmarkModeSchema = z.enum([
  'core',
  'telemetry',
  'moment',
  'complete',
  'profile',
]);
export type BackgroundBenchmarkMode = z.infer<typeof backgroundBenchmarkModeSchema>;
export const backgroundBenchmarkConfigSchema = z.object({
  canonicalMinutes: z.union([z.literal(5), z.literal(15), z.literal(45)]),
  mode: backgroundBenchmarkModeSchema,
  batchTicks: z.number().int().min(1).max(5000).default(800),
});

export const backgroundBenchmarkResultSchema = z.object({
  seed: z.string(),
  mode: backgroundBenchmarkModeSchema,
  environment: z.object({ runtime: z.string(), build: z.string(), profilingEnabled: z.boolean() }),
  performance: backgroundPerformanceSchema,
  profile: z.object({
    canonicalCoreMs: z.number().nonnegative(),
    telemetryMs: z.number().nonnegative(),
    matchMomentMs: z.number().nonnegative(),
    sampledTicks: z.number().int().nonnegative(),
    sampleEveryTicks: z.number().int().positive(),
  }),
  final: z.object({
    time: z.number(),
    homeScore: z.number().int(),
    awayScore: z.number().int(),
    decisionIndex: z.number().int(),
  }),
});

const now = () => performance.now();

/** Deterministic, no-render benchmark. Wall-clock observations cannot affect transitions or RNG. */
export const runBackgroundBenchmark = (
  session: SingleMatchSession,
  input: z.input<typeof backgroundBenchmarkConfigSchema>,
) => {
  const config = backgroundBenchmarkConfigSchema.parse(input);
  let state = createTacticalMatch(session);
  let telemetry = createMatchFlowTelemetry();
  const tracker = new BackgroundPerformanceTracker();
  const targetTicks = Math.floor((config.canonicalMinutes * 60) / FIXED_MATCH_DT);
  const profile = {
    canonicalCoreMs: 0,
    telemetryMs: 0,
    matchMomentMs: 0,
    sampledTicks: 0,
    sampleEveryTicks: 40,
  };
  for (let offset = 0; offset < targetTicks; offset += config.batchTicks) {
    const count = Math.min(config.batchTicks, targetTicks - offset);
    const batchStart = now();
    for (let local = 0; local < count; local += 1) {
      const tick = offset + local;
      const sampled = config.mode === 'profile' && tick % profile.sampleEveryTicks === 0;
      const coreStart = sampled ? now() : 0;
      const previous = state;
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      if (sampled) profile.canonicalCoreMs += now() - coreStart;
      if (config.mode === 'telemetry' || config.mode === 'complete' || config.mode === 'profile') {
        const observerStart = sampled ? now() : 0;
        telemetry = observeMatchFlow(telemetry, previous, state);
        if (sampled) profile.telemetryMs += now() - observerStart;
      }
      if (config.mode === 'moment' || config.mode === 'complete' || config.mode === 'profile') {
        const momentStart = sampled ? now() : 0;
        projectMatchMoment(state);
        if (sampled) profile.matchMomentMs += now() - momentStart;
      }
      if (sampled) profile.sampledTicks += 1;
    }
    tracker.record(now() - batchStart, count * FIXED_MATCH_DT, count);
  }
  return backgroundBenchmarkResultSchema.parse({
    seed: session.setup.seed,
    mode: config.mode,
    environment: {
      runtime: typeof navigator === 'undefined' ? 'headless-js-runtime' : navigator.userAgent,
      build: typeof import.meta.env?.MODE === 'string' ? import.meta.env.MODE : 'headless',
      profilingEnabled: config.mode === 'profile',
    },
    performance: tracker.snapshot(0),
    profile,
    final: {
      time: state.time,
      homeScore: state.score.home,
      awayScore: state.score.away,
      decisionIndex: state.decisionIndex,
    },
  });
};
