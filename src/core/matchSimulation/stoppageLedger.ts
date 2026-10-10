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
export const addedTimePolicySchema = z.object({
  ordinaryRestartAllowanceSeconds: z.number().nonnegative().max(180).default(30),
  announcementRoundingSeconds: z.number().positive().max(60).default(60),
});
export type AddedTimePolicy = z.infer<typeof addedTimePolicySchema>;
export const DEFAULT_ADDED_TIME_POLICY: AddedTimePolicy = {
  ordinaryRestartAllowanceSeconds: 30,
  announcementRoundingSeconds: 60,
};
export const stoppageIntervalSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  awardId: z.string().optional(),
  reasons: z.array(stoppageReasonSchema).max(12),
  eventAt: z.number().nonnegative(),
  startedAt: z.number().nonnegative(),
  period: z.enum(['first_half', 'second_half']).optional(),
  reasonStartedAt: z.record(z.string(), z.number().nonnegative()).optional(),
  qualifyingSeconds: z.number().nonnegative().optional(),
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
  qualifyingCompletedSeconds: z
    .object({ first_half: z.number().nonnegative(), second_half: z.number().nonnegative() })
    .optional(),
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
          reasonStartedAt: {
            ...active.reasonStartedAt,
            [reason]: active.reasonStartedAt?.[reason] ?? state.time,
          },
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
        period: state.status === 'second_half' ? 'second_half' : 'first_half',
        reasonStartedAt: { [reason]: state.time },
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
    qualifyingSeconds: qualifyingStoppageSeconds(active, state.time, state.addedTimePolicy),
  };
  const period = active.period ?? (active.startedAt >= 2700 ? 'second_half' : 'first_half');
  const totals = ledger.qualifyingCompletedSeconds ?? {
    first_half: ledger.intervals.reduce(
      (sum, saved) =>
        sum +
        ((saved.period ?? (saved.startedAt >= 2700 ? 'second_half' : 'first_half')) === 'first_half'
          ? qualifyingStoppageSeconds(
              saved,
              saved.endedAt ?? saved.startedAt,
              state.addedTimePolicy,
            )
          : 0),
      0,
    ),
    second_half: ledger.intervals.reduce(
      (sum, saved) =>
        sum +
        ((saved.period ?? (saved.startedAt >= 2700 ? 'second_half' : 'first_half')) ===
        'second_half'
          ? qualifyingStoppageSeconds(
              saved,
              saved.endedAt ?? saved.startedAt,
              state.addedTimePolicy,
            )
          : 0),
      0,
    ),
  };
  return {
    ...state,
    stoppageLedger: {
      ...completed,
      intervals: [...ledger.intervals, interval].slice(-512),
      completedSeconds: ledger.completedSeconds + Math.max(0, state.time - active.startedAt),
      completedCount: ledger.completedCount + 1,
      qualifyingCompletedSeconds: {
        ...totals,
        [period]: totals[period] + interval.qualifyingSeconds,
      },
    },
  };
};

/** Ordinary preparation has an allowance; qualifying causes count the union, never its sum. */
export const qualifyingStoppageSeconds = (
  interval: StoppageInterval,
  at: number,
  policy: AddedTimePolicy = DEFAULT_ADDED_TIME_POLICY,
) => {
  if (interval.qualifyingSeconds !== undefined && interval.endedAt !== undefined)
    return interval.qualifyingSeconds;
  const end = Math.min(at, interval.endedAt ?? at);
  const duration = Math.max(0, end - interval.startedAt);
  const fullyQualifying = ['goal', 'substitution', 'injury', 'discipline'];
  const starts = interval.reasons
    .filter((reason) => fullyQualifying.includes(reason))
    .map((reason) => interval.reasonStartedAt?.[reason] ?? interval.startedAt);
  const ordinaryLoss = interval.reasons.some((reason) => reason !== 'period_start')
    ? Math.max(0, duration - policy.ordinaryRestartAllowanceSeconds)
    : 0;
  return Math.max(ordinaryLoss, starts.length ? Math.max(0, end - Math.min(...starts)) : 0);
};

/** Canonical elapsed dead-ball time remains distinct from qualifying referee allowance. */
export const elapsedDeadBallSeconds = (state: TacticalMatchState) =>
  (state.stoppageLedger?.completedSeconds ?? 0) +
  (state.stoppageLedger?.active
    ? Math.max(0, state.time - state.stoppageLedger.active.startedAt)
    : 0);
