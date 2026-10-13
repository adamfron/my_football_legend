import { z } from 'zod';
import type { PlayerMatchStats } from './matchSimulation/playerMatchStats';

export const RETAINED_COUNTERS = [
  'touches',
  'passesAttempted',
  'passesCompleted',
  'shots',
  'shotsOnTarget',
  'tacklesWon',
  'interceptions',
  'saves',
  'goalsConceded',
  'distanceCovered',
] as const;
/** Fixed v1 order: identity, team, start, minutes, G, A, YC, RC, condition, slot, counters, injury.
 * The full result remains an object; only permanent archival rows use compact tuples. */
export const compactMatchParticipantSchema = z.tuple([
  z.string().min(1),
  z.enum(['home', 'away']),
  z.boolean(),
  z.number().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().min(0).max(100),
  z.string().min(1),
  z.array(z.number().nonnegative().nullable()).length(10),
  z.unknown().nullable(),
]);
export const compactMatchParticipant = (participant: {
  id: string;
  team: 'home' | 'away';
  started: boolean;
  condition: number;
  position: string;
  injury?: unknown;
  stats: Pick<
    PlayerMatchStats,
    'minutesPlayed' | 'goals' | 'assists' | 'yellowCards' | 'redCards'
  > &
    Partial<Pick<PlayerMatchStats, (typeof RETAINED_COUNTERS)[number]>>;
}) =>
  compactMatchParticipantSchema.parse([
    participant.id,
    participant.team,
    participant.started,
    participant.stats.minutesPlayed,
    participant.stats.goals,
    participant.stats.assists,
    participant.stats.yellowCards,
    participant.stats.redCards,
    participant.condition,
    participant.position,
    RETAINED_COUNTERS.map((key) => participant.stats[key] ?? null),
    participant.injury ?? null,
  ]);
