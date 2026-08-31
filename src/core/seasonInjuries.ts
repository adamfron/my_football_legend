import type { CareerState, PlayerInjury, SeasonParticipationRecord } from '../types/domain';
import { getTimelineInjury } from './injuryPresentation';

export interface SeasonInjurySummary {
  injury: PlayerInjury;
  missedFixtures: number;
}

/** Derives a season's unique medical episodes from canonical injury and participation facts. */
export const deriveSeasonInjurySummary = (
  career: Pick<CareerState, 'playerAvailability' | 'matchHistory'>,
  participation: SeasonParticipationRecord[],
): SeasonInjurySummary[] => {
  const seasonRows = participation.filter((row) => row.fixtureStatus === 'completed');
  const relevant = new Map<string, SeasonInjurySummary>();
  for (const row of seasonRows) {
    const injury = getTimelineInjury(career, row);
    if (!injury) continue;
    const current = relevant.get(injury.id) ?? { injury, missedFixtures: 0 };
    if (row.status === 'injured' && row.minutes === 0) current.missedFixtures++;
    relevant.set(injury.id, current);
  }
  return [...relevant.values()].sort(
    (a, b) =>
      a.injury.startDate.localeCompare(b.injury.startDate) ||
      a.injury.id.localeCompare(b.injury.id),
  );
};
