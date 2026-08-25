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
  const activeFixture = calendar?.fixtures.find((fixture) => fixture.id === career.activeMatch?.id);
  const duplicateClubNames = season
    ? season.clubs
        .filter(
          (club, index) => season.clubs.findIndex((other) => other.name === club.name) !== index,
        )
        .map((club) => club.name)
    : [];
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
    staleActiveMatch: Boolean(career.activeMatch && !activeFixture),
    activeMatchClubMismatch: Boolean(season && season.controlledClubId !== career.currentClub.id),
    professionalMatchMarkedAcademy: Boolean(
      season?.competition.category === 'professional' &&
        career.activeMatch?.teamLevel === 'academy',
    ),
    professionalSeasonMarkedAcademy: Boolean(
      career.careerSeasonNumber >= 2 && season?.competition.category !== 'professional',
    ),
    professionalAppearanceMarkedAcademy: (career.matchHistory ?? []).some(
      (match) =>
        match.teamLevel === 'academy' && Number(match.date.slice(0, 4)) >= career.currentSeason,
    ),
    ageSeasonMismatch: career.player.age !== 15 + career.careerSeasonNumber,
    repeatedFirstProfessionalContract:
      career.historyFacts.filter((fact) => fact.factType === 'first_professional_contract').length >
      1,
    repeatedAcademyGraduation:
      career.historyFacts.filter((fact) => fact.factType === 'academy_graduated').length > 1,
    oldDevelopmentRole: Boolean(
      career.player.age > 23 &&
        (career.currentSportingStatus ?? career.currentContract?.squadRole) ===
          'development_player',
    ),
    activeBeyondAgeLimit: (career.careerStatus ?? 'active') === 'active' && career.player.age > 40,
    currentCoachMismatch: Boolean(
      career.careerSeasonNumber >= 2 &&
        !career.significantPeople.some(
          (person) => person.role === 'coach' && person.clubId === career.currentClub.id,
        ),
    ),
    duplicateClubNames,
    unableToAdvance: Boolean(
      calendar &&
        season &&
        calendar.currentWeekIndex >= calendar.weeks.length - 1 &&
        !season.completed,
    ),
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
