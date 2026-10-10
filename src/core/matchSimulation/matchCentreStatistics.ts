import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import type { TeamSide } from './matchSpace';

const count = z.number().int().nonnegative();
export const matchCentreTeamStatisticsSchema = z.object({
  goals: count,
  shots: count,
  shotsOnTarget: count,
  blockedShots: count,
  /** Undefined before any live canonical possession time has accrued. */
  possessionPercentage: z.number().min(0).max(100).optional(),
  passesAttempted: count,
  passesCompleted: count,
  passesReceived: count,
  touches: count,
  carries: count,
  possessionWon: count,
  possessionLost: count,
  completionPercentage: z.number().min(0).max(100).optional(),
  fouls: count,
  yellowCards: count,
  redCards: count,
  offsides: count,
  corners: count,
  freeKicks: count,
  throwIns: count,
  tacklesAttempted: count,
  tacklesWon: count,
  interceptions: count,
  substitutions: count,
  injuries: count,
});
export const matchCentreStatisticsSchema = z.object({
  home: matchCentreTeamStatisticsSchema,
  away: matchCentreTeamStatisticsSchema,
});
export type MatchCentreTeamStatistics = z.infer<typeof matchCentreTeamStatisticsSchema>;
export type MatchCentreStatistics = z.infer<typeof matchCentreStatisticsSchema>;

/** Pure canonical projection. Restart counters mean awards, rather than completed deliveries;
 * team possession includes in-flight passes in the last established live possession spell.
 * A second yellow contributes a yellow and one red; dismissed player totals remain included. */
export const projectMatchCentreStatistics = (state: TacticalMatchState): MatchCentreStatistics => {
  const statistics = state.statistics;
  const teamOf = (id: string) =>
    statistics?.playerTeams?.[id] ??
    state.discipline?.[id]?.team ??
    state.players.find((player) => player.id === id)?.team;
  const possessionSeconds =
    (statistics?.teamAccounting?.home.possessionSeconds ?? 0) +
    (statistics?.teamAccounting?.away.possessionSeconds ?? 0);
  const project = (team: TeamSide): MatchCentreTeamStatistics => {
    const players = (statistics?.players ?? []).filter((entry) => teamOf(entry.playerId) === team);
    const sum = (
      key:
        | 'shots'
        | 'shotsOnTarget'
        | 'passesAttempted'
        | 'passesCompleted'
        | 'passesReceived'
        | 'touches'
        | 'carries'
        | 'possessionWon'
        | 'possessionLost'
        | 'tacklesAttempted'
        | 'tacklesWon'
        | 'interceptions',
    ) => players.reduce((total, entry) => total + entry[key], 0);
    const attempts = sum('passesAttempted');
    const completed = sum('passesCompleted');
    const accounting = statistics?.teamAccounting?.[team];
    const discipline = Object.values(state.discipline ?? {}).filter((entry) => entry.team === team);
    const events = state.matchEvents?.filter((event) => event.team === team);
    return {
      goals: state.score[team],
      shots: sum('shots'),
      shotsOnTarget: sum('shotsOnTarget'),
      blockedShots: accounting?.blockedShots ?? 0,
      ...(possessionSeconds > 0
        ? { possessionPercentage: (100 * (accounting?.possessionSeconds ?? 0)) / possessionSeconds }
        : {}),
      passesAttempted: attempts,
      passesCompleted: completed,
      passesReceived: sum('passesReceived'),
      touches: sum('touches'),
      carries: sum('carries'),
      possessionWon: sum('possessionWon'),
      possessionLost: sum('possessionLost'),
      ...(attempts > 0 ? { completionPercentage: (100 * completed) / attempts } : {}),
      fouls: events
        ? events.filter((event) => event.kind === 'foul').length
        : players.reduce(
            (total, entry) =>
              total + (state.defensiveTelemetry?.byPlayer[entry.playerId]?.fouls ?? 0),
            0,
          ),
      yellowCards: discipline.reduce((total, entry) => total + entry.yellowCards, 0),
      redCards: discipline.filter((entry) => entry.sentOff).length,
      offsides: accounting?.offsides ?? 0,
      corners: accounting?.corners ?? 0,
      freeKicks: accounting?.freeKicks ?? 0,
      throwIns: accounting?.throwIns ?? 0,
      tacklesAttempted: sum('tacklesAttempted'),
      tacklesWon: sum('tacklesWon'),
      interceptions: sum('interceptions'),
      substitutions:
        state.substitutionState?.completed.filter((change) => change.team === team).length ?? 0,
      injuries: events?.filter((event) => event.kind === 'injury').length ?? 0,
    };
  };
  return { home: project('home'), away: project('away') };
};
