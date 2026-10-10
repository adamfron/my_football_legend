import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { DEFAULT_ADDED_TIME_POLICY, qualifyingStoppageSeconds } from './stoppageLedger';
import { restartPenaltyGoalkeeper } from './restartLaws';

export const matchTimekeepingSchema = z.object({
  period: z.enum(['first_half', 'second_half']),
  periodStartedAt: z.number().nonnegative(),
  nominalEndAt: z.number().nonnegative(),
  qualifyingLostSeconds: z.number().nonnegative(),
  minimumAnnouncedAddedSeconds: z.number().nonnegative().optional(),
  announcedAt: z.number().nonnegative().optional(),
  lostAtAnnouncement: z.number().nonnegative().optional(),
  additionalLostAfterAnnouncement: z.number().nonnegative(),
  requiredEndAt: z.number().nonnegative(),
  terminalPenalty: z
    .object({
      awardId: z.string(),
      takerId: z.string(),
      keeperId: z.string().optional(),
      startedAt: z.number().nonnegative(),
      shotId: z.string().optional(),
      releasedAt: z.number().nonnegative().optional(),
      completedAt: z.number().nonnegative().optional(),
    })
    .optional(),
  endedAt: z.number().nonnegative().optional(),
});
export type MatchTimekeeping = z.infer<typeof matchTimekeepingSchema>;

const periodOf = (state: TacticalMatchState) =>
  state.status === 'second_half' || state.status === 'full_time'
    ? 'second_half'
    : state.status === 'abandoned'
      ? (state.timekeeping?.period ?? 'first_half')
      : 'first_half';

export const qualifyingLostTime = (state: TacticalMatchState) => {
  const period = periodOf(state);
  const ledger = state.stoppageLedger;
  const policy = state.addedTimePolicy ?? DEFAULT_ADDED_TIME_POLICY;
  const completed =
    ledger?.qualifyingCompletedSeconds?.[period] ??
    (ledger?.intervals ?? []).reduce(
      (sum, interval) =>
        sum +
        ((interval.period ?? (interval.startedAt >= 2700 ? 'second_half' : 'first_half')) === period
          ? qualifyingStoppageSeconds(interval, interval.endedAt ?? interval.startedAt, policy)
          : 0),
      0,
    );
  const active = ledger?.active;
  return (
    completed +
    (active && (active.period ?? period) === period
      ? qualifyingStoppageSeconds(active, state.time, policy)
      : 0)
  );
};

/** Law 14: the defending keeper's parry and frame rebounds do not complete the kick alone. */
const terminalPenaltyComplete = (
  state: TacticalMatchState,
  penalty: NonNullable<MatchTimekeeping['terminalPenalty']>,
) => {
  if (!penalty.shotId) return false;
  const shot = state.ball.shot ?? state.lastShot;
  if (shot?.shotId !== penalty.shotId || !shot.outcome) return false;
  if (shot.outcome === 'goal' || shot.outcome === 'miss') return true;
  // A failed keeper save is recorded as a block, but the keeper's touch alone cannot
  // complete a terminal kick. Actual other-player contact is checked below.
  if (state.ball.ownerId) return true;
  if (state.restart && state.scenario !== 'penalty') return true;
  const contact = state.lastBallContact;
  if (
    contact?.playerId &&
    contact.playerId !== penalty.keeperId &&
    contact.at >= (penalty.releasedAt ?? penalty.startedAt)
  )
    return true;
  const otherTouch = state.ball.lastTouchPlayerId;
  if (otherTouch && otherTouch !== penalty.takerId && otherTouch !== penalty.keeperId) return true;
  return (
    Math.hypot(
      state.ball.velocity?.x ?? 0,
      state.ball.velocity?.y ?? 0,
      state.ball.velocity?.z ?? 0,
    ) <= 0.15 && (state.ball.height ?? 0) <= 0.15
  );
};

/** Refresh before and after each canonical tick. Only ledger loss increases the deadline. */
export const preparePeriodEnd = (state: TacticalMatchState, dt = 0): TacticalMatchState => {
  if (state.status === 'abandoned' || state.status === 'half_time' || state.status === 'full_time')
    return state;
  const period = periodOf(state);
  const previous = state.timekeeping?.period === period ? state.timekeeping : undefined;
  const periodStartedAt = previous?.periodStartedAt ?? (period === 'first_half' ? 0 : 2700);
  const nominalEndAt = previous?.nominalEndAt ?? periodStartedAt + 2700;
  const policy = state.addedTimePolicy ?? DEFAULT_ADDED_TIME_POLICY;
  const lost = qualifyingLostTime(state);
  const announce =
    previous?.minimumAnnouncedAddedSeconds === undefined && state.time + dt >= nominalEndAt;
  const minimum = announce
    ? Math.ceil(lost / policy.announcementRoundingSeconds) * policy.announcementRoundingSeconds
    : previous?.minimumAnnouncedAddedSeconds;
  const lostAtAnnouncement = announce ? lost : previous?.lostAtAnnouncement;
  const additional = Math.max(
    previous?.additionalLostAfterAnnouncement ?? 0,
    minimum !== undefined ? lost - (lostAtAnnouncement ?? lost) : 0,
  );
  const requiredEndAt = Math.max(
    previous?.requiredEndAt ?? nominalEndAt,
    nominalEndAt + (minimum ?? 0) + additional,
  );
  const pendingPenalty = state.scenario === 'penalty' && state.restart?.phase !== 'release';
  let terminalPenalty = previous?.terminalPenalty;
  if (pendingPenalty && state.restart && (terminalPenalty || state.time + dt >= requiredEndAt)) {
    const awardId = state.restart.awardId ?? `${state.seed}:penalty:${state.restart.startedAt}`;
    // A retake is another pending lawful kick and clears the previous physical completion.
    if (!terminalPenalty || terminalPenalty.awardId !== awardId)
      terminalPenalty = {
        awardId,
        takerId: state.restart.takerId,
        keeperId: restartPenaltyGoalkeeper(state)?.id,
        startedAt: state.time,
      };
    else terminalPenalty = { ...terminalPenalty, takerId: state.restart.takerId };
  }
  if (terminalPenalty && !pendingPenalty && !terminalPenalty.shotId) {
    const shot = state.ball.shot ?? state.lastShot;
    if (shot?.context === 'penalty' && (shot.releasedAt ?? -1) >= terminalPenalty.startedAt)
      terminalPenalty = {
        ...terminalPenalty,
        shotId: shot.shotId,
        releasedAt: shot.releasedAt,
      };
  }
  if (
    terminalPenalty &&
    !pendingPenalty &&
    terminalPenalty.completedAt === undefined &&
    terminalPenaltyComplete(state, terminalPenalty)
  )
    terminalPenalty = { ...terminalPenalty, completedAt: state.time };
  const timekeeping: MatchTimekeeping = {
    ...previous,
    period,
    periodStartedAt,
    nominalEndAt,
    qualifyingLostSeconds: lost,
    ...(minimum !== undefined ? { minimumAnnouncedAddedSeconds: minimum } : {}),
    ...(announce ? { announcedAt: nominalEndAt } : {}),
    ...(lostAtAnnouncement !== undefined ? { lostAtAnnouncement } : {}),
    additionalLostAfterAnnouncement: additional,
    requiredEndAt,
    ...(terminalPenalty ? { terminalPenalty } : {}),
  };
  const periodEndPending = terminalPenalty
    ? !pendingPenalty && Boolean(terminalPenalty.shotId)
    : state.time + dt >= requiredEndAt;
  return { ...state, timekeeping, periodEndPending };
};

/** Released physics finish; an unreleased dangerous attack receives no automatic extension. */
export const periodCanEnd = (state: TacticalMatchState) => {
  if (!state.periodEndPending || state.status === 'abandoned') return false;
  const penalty = state.timekeeping?.terminalPenalty;
  if (penalty) return penalty.completedAt !== undefined;
  return (
    !state.ball.travelKind &&
    !state.ball.shot &&
    !state.goalCompletionUntil &&
    !state.defensiveChallenge
  );
};

export const clockPeriodThreshold = (state: TacticalMatchState) =>
  state.timekeeping?.requiredEndAt ?? (periodOf(state) === 'first_half' ? 2700 : 5400);

export const resetSecondHalfTimekeeping = (state: TacticalMatchState): TacticalMatchState => ({
  ...state,
  periodEndPending: false,
  timekeeping: {
    period: 'second_half',
    periodStartedAt: state.time,
    nominalEndAt: state.time + 2700,
    qualifyingLostSeconds: 0,
    additionalLostAfterAnnouncement: 0,
    requiredEndAt: state.time + 2700,
  },
});
