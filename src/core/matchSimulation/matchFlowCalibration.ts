import { z } from 'zod';
import type { SingleMatchSession } from '../singleMatch';
import {
  assertTelemetryInvariants,
  createMatchFlowTelemetry,
  observeMatchFlow,
  summarizeMatchFlowRates,
  summarizeShootingBuckets,
  summarizeShootingStyles,
} from './matchFlowTelemetry';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatch,
} from './matchSimulation';
import { matchPeriodSchema, matchTerminationSchema } from './matchState';

export const matchFlowBatchConfigSchema = z.object({
  canonicalSeconds: z
    .number()
    .positive()
    .max(90 * 60),
  sessions: z.array(z.custom<SingleMatchSession>()).min(1).max(20),
});
export type MatchFlowBatchConfig = z.infer<typeof matchFlowBatchConfigSchema>;
export const matchFlowCompletionSchema = z.object({
  canonicalSeconds: z.number().nonnegative(),
  status: matchPeriodSchema,
  termination: matchTerminationSchema.optional(),
});

/** Explicit headless calibration harness. It is deterministic and never feeds metrics into play. */
export const runMatchFlowBatch = (input: MatchFlowBatchConfig) => {
  const config = matchFlowBatchConfigSchema.parse(input);
  const sessions = config.sessions.map((session) => {
    let state = createTacticalMatch(session);
    let telemetry = createMatchFlowTelemetry();
    let ticks = 0;
    const complete = () =>
      state.status === 'abandoned' ||
      (state.time + 1e-7 >= config.canonicalSeconds &&
        (config.canonicalSeconds !== 2700 || state.status === 'half_time') &&
        (config.canonicalSeconds !== 5400 || state.status === 'full_time'));
    while (!complete()) {
      if (state.status === 'half_time') state = startSecondHalf(state);
      if (state.status === 'full_time') throw new Error('Match ended before benchmark target');
      const next = stepTacticalMatch(state, FIXED_MATCH_DT);
      telemetry = observeMatchFlow(telemetry, state, next);
      state = next;
      ticks++;
      if (ticks > Math.ceil(config.canonicalSeconds / FIXED_MATCH_DT) + 10_000)
        throw new Error('Canonical clock stopped advancing');
    }
    assertTelemetryInvariants(telemetry);
    return {
      seed: session.setup.seed,
      completion: matchFlowCompletionSchema.parse({
        canonicalSeconds: state.time,
        status: state.status,
        termination: state.termination,
      }),
      telemetry,
      rates: summarizeMatchFlowRates(telemetry),
      shootingBuckets: summarizeShootingBuckets(telemetry),
      shootingStyles: summarizeShootingStyles(telemetry),
    };
  });
  const totals = sessions.reduce(
    (sum, item) => ({
      minutes: sum.minutes + item.telemetry.canonicalMinutes,
      passes: sum.passes + item.telemetry.passesAttempted,
      possessionChanges: sum.possessionChanges + item.telemetry.possessionChanges,
      shots: sum.shots + item.telemetry.shots,
      goals: sum.goals + item.telemetry.goals,
      longShots: sum.longShots + item.telemetry.longShots,
      longShotGoals: sum.longShotGoals + item.telemetry.longShotGoals,
      saves: sum.saves + item.telemetry.saves,
      blocks: sum.blocks + item.telemetry.shotsBlocked,
    }),
    {
      minutes: 0,
      passes: 0,
      possessionChanges: 0,
      shots: 0,
      goals: 0,
      longShots: 0,
      longShotGoals: 0,
      saves: 0,
      blocks: 0,
    },
  );
  return { sessions, totals };
};
