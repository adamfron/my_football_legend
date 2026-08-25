import type { CareerState } from '../types/domain';
import { getLeagueTable } from './leagueSeason';
import { getCareerCurrentDate, getSeasonProgress } from './seasonProgress';

/** Compact deterministic diagnostics for development and calendar invariant tests/devtools. */
export const auditCareerSeason = (career: CareerState) => {
  const season = career.leagueSeason;
  const calendar = career.careerCalendar;
  const assigned = new Map<string, number>();
  calendar?.weeks.forEach((week) =>
    week.fixtureIds.forEach((id) => assigned.set(id, (assigned.get(id) ?? 0) + 1)),
  );
  const controlledFixtures =
    season?.rounds
      .flatMap((round) => round.fixtures)
      .filter((fixture) =>
        [fixture.homeClubId, fixture.awayClubId].includes(season.controlledClubId),
      ) ?? [];
  const starting = career.seasonStartingAttributes;
  return {
    currentRound: season?.currentRound ?? 0,
    completedRounds: season?.rounds.filter((round) => round.completed).length ?? 0,
    playedCounts: getLeagueTable(career).map((row) => row.played),
    currentCareerWeek: calendar?.currentWeekIndex,
    unassignedFixtures: controlledFixtures
      .filter((fixture) => !fixture.completed && assigned.get(fixture.id) !== 1)
      .map((fixture) => fixture.id),
    careerCurrentDate: getCareerCurrentDate(career),
    seasonProgress: getSeasonProgress(career).progress,
    developmentTotal: starting
      ? Object.keys(starting).reduce(
          (sum, key) =>
            sum +
            career.player.attributes[key as keyof typeof starting] -
            starting[key as keyof typeof starting],
          0,
        )
      : 0,
  };
};
