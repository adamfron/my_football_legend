import { z } from 'zod';
import type { TacticalMatchState } from './matchState';

export const playerActiveTimeSchema = z.object({
  seconds: z.number().nonnegative(),
  source: z.enum(['canonical_minutes_played', 'legacy_active_roster_clock', 'unavailable']),
});

/** Cumulative playing time is authoritative, including future substitute appearances.
 * Never derive a substitute's exposure from the match clock. The roster-clock fallback
 * is only for legacy snapshots with no player statistics; dismissal caps both paths. */
export const projectPlayerActiveTime = (
  state: TacticalMatchState,
  playerId = state.controlledFootballerId,
): z.infer<typeof playerActiveTimeSchema> => {
  const stats = state.statistics?.players.find((player) => player.playerId === playerId);
  const activePlayer = state.players.find((player) => player.id === playerId);
  const sentOffAt = playerId ? state.discipline?.[playerId]?.sentOffAt : undefined;
  const enteredAt =
    activePlayer?.activeSince ??
    (playerId ? state.statistics?.playerActiveSince?.[playerId] : undefined) ??
    0;
  const cap = Math.max(0, Math.min(state.time, sentOffAt ?? state.time) - enteredAt);
  if (stats)
    return {
      seconds: Math.max(0, Math.min(stats.minutesPlayed * 60, cap)),
      source: 'canonical_minutes_played',
    };
  if (!state.statistics && activePlayer)
    return { seconds: Math.max(0, cap), source: 'legacy_active_roster_clock' };
  return { seconds: 0, source: 'unavailable' };
};
