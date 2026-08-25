import { describe, expect, it } from 'vitest';
import { createLeagueSeason, getLeagueTable, simulateLeagueFixture } from './leagueSeason';

describe('compact league season', () => {
  it('creates a deterministic double round robin for twelve fictional clubs', () => {
    const season = createLeagueSeason('schedule');
    expect(season.clubs).toHaveLength(12);
    expect(season.rounds).toHaveLength(22);
    const fixtures = season.rounds.flatMap((round) => round.fixtures);
    expect(fixtures).toHaveLength(132);
    expect(fixtures.every((fixture) => fixture.homeClubId !== fixture.awayClubId)).toBe(true);
    for (const club of season.clubs) {
      const games = fixtures.filter((fixture) =>
        [fixture.homeClubId, fixture.awayClubId].includes(club.clubId),
      );
      expect(games).toHaveLength(22);
      expect(games.filter((fixture) => fixture.homeClubId === club.clubId)).toHaveLength(11);
      expect(games.filter((fixture) => fixture.awayClubId === club.clubId)).toHaveLength(11);
    }
  });

  it('simulates results deterministically and calculates 3/1/0 table with stable tie breaks', () => {
    const season = createLeagueSeason('results');
    const first = season.rounds[0]!;
    first.fixtures = first.fixtures.map((fixture) =>
      simulateLeagueFixture(season, fixture, 'results'),
    );
    first.completed = true;
    expect(first.fixtures).toEqual(
      createLeagueSeason('results').rounds[0]!.fixtures.map((fixture) =>
        simulateLeagueFixture(createLeagueSeason('results'), fixture, 'results'),
      ),
    );
    const table = getLeagueTable({ leagueSeason: season });
    expect(table).toHaveLength(12);
    expect(table.every((row) => row.goalDifference === row.goalsFor - row.goalsAgainst)).toBe(true);
    expect(table.reduce((sum, row) => sum + row.played, 0)).toBe(12);
    expect(table.map((row) => row.points)).toEqual(
      [...table].map((row) => row.points).sort((a, b) => b - a),
    );
  });
});
