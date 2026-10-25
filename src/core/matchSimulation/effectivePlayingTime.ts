import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { elapsedDeadBallSeconds } from './stoppageLedger';

export const effectivePlayingTimeSchema = z.object({
  canonicalElapsedSeconds: z.number().nonnegative(),
  regulationSeconds: z.number().nonnegative(),
  addedSecondsActuallyPlayed: z.number().nonnegative(),
  ballInPlaySeconds: z.number().nonnegative(),
  deadBallSeconds: z.number().nonnegative(),
  deadBallByReason: z.record(z.string(), z.number().nonnegative()),
  restartDurations: z.record(
    z.string(),
    z.object({
      count: z.number().int(),
      seconds: z.number(),
      mean: z.number(),
      median: z.number(),
      p90: z.number(),
      maximum: z.number(),
    }),
  ),
  unclassifiedDeadBallSeconds: z.number().nonnegative(),
  humanDecisionPauseSeconds: z.number().nonnegative().nullable(),
  passesPerInPlayMinute: z.number().nonnegative().nullable(),
});

/** Reporting only. Physical dead time uses the full ledger duration, never the referee's
 * qualifying allowance. Reasons partition each interval by priority, so concurrent injury,
 * discipline and restart preparation cannot count the same second twice. Half-time/human
 * pauses consume no canonical time; wall-clock pause duration must be supplied by the host. */
export const measureEffectivePlayingTime = (
  state: TacticalMatchState,
  humanDecisionPauseSeconds: number | null = null,
) => {
  const elapsed = state.time;
  const dead = elapsedDeadBallSeconds(state);
  if (dead > elapsed + 1e-6) throw Error('Dead-ball ledger exceeds canonical match time');
  const secondStart =
    state.timekeeping?.period === 'second_half' ? state.timekeeping.periodStartedAt : undefined;
  const regulation =
    secondStart === undefined
      ? Math.min(2700, elapsed)
      : Math.min(2700, secondStart) + Math.min(2700, Math.max(0, elapsed - secondStart));
  const byReason: Record<string, number> = {};
  const durations: Record<string, number[]> = {};
  const priority = ['injury', 'substitution', 'discipline', 'goal'];
  const intervals = [
    ...(state.stoppageLedger?.intervals ?? []),
    ...(state.stoppageLedger?.active ? [state.stoppageLedger.active] : []),
  ];
  for (const interval of intervals) {
    const end = Math.min(elapsed, interval.endedAt ?? elapsed),
      start = interval.startedAt;
    const moments = [
      ...new Set([
        start,
        end,
        ...Object.values(interval.reasonStartedAt ?? {}).filter((at) => at > start && at < end),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 1; i < moments.length; i++) {
      const at = moments[i - 1]!,
        seconds = moments[i]! - at;
      const available = interval.reasons.filter(
        (reason) => (interval.reasonStartedAt?.[reason] ?? start) <= at,
      );
      const reason =
        priority.find((reason) => available.includes(reason as (typeof available)[number])) ??
        available[0] ??
        'unclassified';
      byReason[reason] = (byReason[reason] ?? 0) + seconds;
    }
    const reason = interval.reasons[0] ?? 'unclassified';
    (durations[reason] ??= []).push(Math.max(0, end - start));
  }
  const classified = Object.values(byReason).reduce((a, b) => a + b, 0);
  const unclassified = Math.max(0, dead - classified);
  const inPlay = Math.max(0, elapsed - dead);
  const attempts = state.statistics?.players.reduce((n, p) => n + p.passesAttempted, 0) ?? 0;
  const distribution = Object.fromEntries(
    Object.entries(durations).map(([reason, values]) => {
      const sorted = [...values].sort((a, b) => a - b),
        seconds = values.reduce((a, b) => a + b, 0);
      return [
        reason,
        {
          count: values.length,
          seconds,
          mean: seconds / values.length,
          median: sorted[Math.floor((values.length - 1) * 0.5)]!,
          p90: sorted[Math.floor((values.length - 1) * 0.9)]!,
          maximum: sorted.at(-1)!,
        },
      ];
    }),
  );
  return effectivePlayingTimeSchema.parse({
    canonicalElapsedSeconds: elapsed,
    regulationSeconds: regulation,
    addedSecondsActuallyPlayed: elapsed - regulation,
    ballInPlaySeconds: inPlay,
    deadBallSeconds: dead,
    deadBallByReason: byReason,
    restartDurations: distribution,
    unclassifiedDeadBallSeconds: unclassified,
    humanDecisionPauseSeconds,
    passesPerInPlayMinute: inPlay > 0 ? attempts / (inPlay / 60) : null,
  });
};
