import { z } from 'zod';
import type { SingleMatchSession } from '../singleMatch';
import {
  assertTelemetryInvariants,
  createMatchFlowTelemetry,
  observeMatchFlow,
  summarizeMatchFlowRates,
  summarizeShootingBuckets,
} from './matchFlowTelemetry';
import { createTacticalMatch, FIXED_MATCH_DT, stepTacticalMatch } from './matchSimulation';

export const matchFlowBatchConfigSchema = z.object({
  canonicalSeconds: z
    .number()
    .positive()
    .max(15 * 60),
  sessions: z.array(z.custom<SingleMatchSession>()).min(1).max(20),
});
export type MatchFlowBatchConfig = z.infer<typeof matchFlowBatchConfigSchema>;

/** Explicit headless calibration harness. It is deterministic and never feeds metrics into play. */
export const runMatchFlowBatch = (input: MatchFlowBatchConfig) => {
  const config = matchFlowBatchConfigSchema.parse(input);
  const sessions = config.sessions.map((session) => {
    let state = createTacticalMatch(session);
    let telemetry = createMatchFlowTelemetry();
    const ticks = Math.floor(config.canonicalSeconds / FIXED_MATCH_DT);
    for (let tick = 0; tick < ticks; tick += 1) {
      const next = stepTacticalMatch(state, FIXED_MATCH_DT);
      telemetry = observeMatchFlow(telemetry, state, next);
      state = next;
    }
    assertTelemetryInvariants(telemetry);
    return {
      seed: session.setup.seed,
      telemetry,
      rates: summarizeMatchFlowRates(telemetry),
      shootingBuckets: summarizeShootingBuckets(telemetry),
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
