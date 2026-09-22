import { z } from 'zod';
import { FIXED_MATCH_DT } from '../../core/matchSimulation';

export const matchRuntimeClockSchema = z.object({
  anchorMs: z.number().nonnegative(),
  debtSeconds: z.number().nonnegative(),
});
export type MatchRuntimeClock = z.infer<typeof matchRuntimeClockSchema>;

export const createMatchRuntimeClock = (nowMs: number): MatchRuntimeClock =>
  matchRuntimeClockSchema.parse({ anchorMs: nowMs, debtSeconds: 0 });

/** Accumulates every monotonic-wall-clock gap; browsers may delay calls but no elapsed time is lost. */
export const accrueSimulationDebt = (
  clock: MatchRuntimeClock,
  nowMs: number,
  speed: number,
): MatchRuntimeClock =>
  matchRuntimeClockSchema.parse({
    anchorMs: nowMs,
    debtSeconds: clock.debtSeconds + (Math.max(0, nowMs - clock.anchorMs) / 1000) * speed,
  });

export const availableFixedTicks = (clock: MatchRuntimeClock) =>
  Math.floor((clock.debtSeconds + 1e-9) / FIXED_MATCH_DT);

export const consumeFixedTicks = (clock: MatchRuntimeClock, ticks: number): MatchRuntimeClock =>
  matchRuntimeClockSchema.parse({
    ...clock,
    debtSeconds: Math.max(0, clock.debtSeconds - ticks * FIXED_MATCH_DT),
  });

/** Waiting for a human is a pause, so thinking time starts from a fresh anchor and carries no debt. */
export const pauseSimulationClock = (clock: MatchRuntimeClock, nowMs: number): MatchRuntimeClock =>
  matchRuntimeClockSchema.parse({ ...clock, anchorMs: nowMs, debtSeconds: 0 });
