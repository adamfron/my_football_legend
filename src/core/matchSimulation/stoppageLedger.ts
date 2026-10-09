import { z } from 'zod';
import type { RestartScenario, TacticalMatchState } from './matchState';

export const stoppageReasonSchema = z.enum([
  'goal',
  'foul',
  'penalty',
  'corner',
  'goal_kick',
  'throw_in',
  'offside',
  'discipline',
  'restart_preparation',
  'substitution',
  'injury',
  'period_start',
]);
export type StoppageReason = z.infer<typeof stoppageReasonSchema>;
export const stoppageIntervalSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  awardId: z.string().optional(),
  reasons: z.array(stoppageReasonSchema).max(12),
  eventAt: z.number().nonnegative(),
  startedAt: z.number().nonnegative(),
  ballReadyAt: z.number().nonnegative().optional(),
  legalReadyAt: z.number().nonnegative().optional(),
  executedAt: z.number().nonnegative().optional(),
  endedAt: z.number().nonnegative().optional(),
  endReason: z.enum(['execution', 'period_end', 'abandoned', 'superseded']).optional(),
});
export type StoppageInterval = z.infer<typeof stoppageIntervalSchema>;
export const stoppageLedgerSchema = z.object({
  active: stoppageIntervalSchema.optional(),
  intervals: z.array(stoppageIntervalSchema).max(512),
  completedSeconds: z.number().nonnegative(),
  completedCount: z.number().int().nonnegative(),
});
export type StoppageLedger = z.infer<typeof stoppageLedgerSchema>;

export const restartStoppageReason = (scenario: RestartScenario): StoppageReason =>
  scenario === 'kick_off'
    ? 'period_start'
    : scenario === 'gk_short'
      ? 'goal_kick'
      : scenario.startsWith('free_kick')
        ? 'foul'
        : scenario === 'open_play'
          ? 'restart_preparation'
          : (scenario as StoppageReason);

export const beginStoppage = (
  state: TacticalMatchState,
  incidentId: string,
  reason: StoppageReason,
  eventAt = state.time,
  awardId?: string,
): TacticalMatchState => {
  const ledger = state.stoppageLedger ?? { intervals: [], completedSeconds: 0, completedCount: 0 };
  const active = ledger.active;
  if (active)
    return {
      ...state,
      stoppageLedger: {
        ...ledger,
        active: {
          ...active,
          ...(awardId ? { awardId } : {}),
          reasons: active.reasons.includes(reason) ? active.reasons : [...active.reasons, reason],
        },
      },
    };
  return {
    ...state,
    stoppageLedger: {
      ...ledger,
      active: {
        id: `${state.seed}:stoppage:${incidentId}`,
        incidentId,
        ...(awardId ? { awardId } : {}),
        reasons: [reason],
        eventAt,
        startedAt: state.time,
      },
    },
  };
};

export const markStoppageReady = (
  state: TacticalMatchState,
  ballReady: boolean,
  legalReady: boolean,
): TacticalMatchState => {
  const ledger = state.stoppageLedger,
    active = ledger?.active;
  if (!ledger || !active || (!ballReady && !legalReady)) return state;
  if (
    (!ballReady || active.ballReadyAt !== undefined) &&
    (!legalReady || active.legalReadyAt !== undefined)
  )
    return state;
  return {
    ...state,
    stoppageLedger: {
      ...ledger,
      active: {
        ...active,
        ...(ballReady && active.ballReadyAt === undefined ? { ballReadyAt: state.time } : {}),
        ...(legalReady && active.legalReadyAt === undefined ? { legalReadyAt: state.time } : {}),
      },
    },
  };
};

export const endStoppage = (
  state: TacticalMatchState,
  endReason: NonNullable<StoppageInterval['endReason']> = 'execution',
): TacticalMatchState => {
  const ledger = state.stoppageLedger,
    active = ledger?.active;
  if (!ledger || !active) return state;
  const { active: _active, ...completed } = ledger;
  void _active;
  const interval = {
    ...active,
    endedAt: state.time,
    endReason,
    ...(endReason === 'execution' ? { executedAt: state.time } : {}),
  };
  return {
    ...state,
    stoppageLedger: {
      ...completed,
      intervals: [...ledger.intervals, interval].slice(-512),
      completedSeconds: ledger.completedSeconds + Math.max(0, state.time - active.startedAt),
      completedCount: ledger.completedCount + 1,
    },
  };
};

/** Official added-time policy is deliberately absent. UI wall-time never enters this clock. */
export const elapsedDeadBallSeconds = (state: TacticalMatchState) =>
  (state.stoppageLedger?.completedSeconds ?? 0) +
  (state.stoppageLedger?.active
    ? Math.max(0, state.time - state.stoppageLedger.active.startedAt)
    : 0);
