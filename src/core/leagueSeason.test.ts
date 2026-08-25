import { describe, expect, it } from 'vitest';
import {
  createLeagueSeason,
  evaluateMatchImportance,
  getLeagueTable,
  settleLeagueRound,
  simulateLeagueFixture,
  VISTULA_NOVA_ID,
} from './leagueSeason';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import type { CareerState } from '../types/domain';

const career = (): CareerState => {
  const seed = 'league-career';
  const profile = generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Nowak',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      position: 'central_midfielder',
      heightCm: 178,
      weightKg: 70,
      seed,
    },
    seed,
    0,
  );
  return { ...createCareerState(profile, seed), leagueSeason: createLeagueSeason(seed) };
};

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

  it('settles every fixture exactly once and preserves the equal-games invariant after every round', () => {
    let state = career();
    for (let index = 0; index < 22; index++) {
      state = settleLeagueRound(state, index);
      const table = getLeagueTable(state);
      expect(table.every((row) => row.played === index + 1)).toBe(true);
      expect(state.leagueSeason!.rounds[index]!.fixtures.every((f) => f.completed)).toBe(true);
      expect(settleLeagueRound(state, index)).toEqual(state);
    }
    expect(state.seasonOutcome?.finalPosition).toBeGreaterThanOrEqual(1);
  });

  it('uses a known interactive Vistula result while simulating the other five fixtures', () => {
    const initial = career();
    const fixture = initial.leagueSeason!.rounds[0]!.fixtures.find((f) =>
      [f.homeClubId, f.awayClubId].includes(VISTULA_NOVA_ID),
    )!;
    const state = settleLeagueRound(initial, 0, {
      homeGoals: 4,
      awayGoals: 3,
      playerAppearanceMatchId: 'appearance',
    });
    const canonical = state.leagueSeason!.rounds[0]!.fixtures.find((f) => f.id === fixture.id)!;
    expect([canonical.homeGoals, canonical.awayGoals, canonical.playerAppearanceMatchId]).toEqual([
      4,
      3,
      'appearance',
    ]);
    expect(state.leagueSeason!.rounds[0]!.fixtures).toHaveLength(6);
    expect(getLeagueTable(state).every((row) => row.played === 1)).toBe(true);
  });

  it('does not make an academy selection important just because there was no senior debut', () => {
    const state = career();
    const league = state.leagueSeason!.rounds[5]!.fixtures.find((f) =>
      [f.homeClubId, f.awayClubId].includes(VISTULA_NOVA_ID),
    )!;
    const opponent = state.leagueSeason!.clubs.find(
      (c) =>
        c.clubId ===
        (league.homeClubId === VISTULA_NOVA_ID ? league.awayClubId : league.homeClubId),
    )!;
    const fixture = {
      id: league.id,
      seasonId: '2026-27',
      date: league.date,
      competition: 'league' as const,
      opponent: {
        id: opponent.clubId,
        name: opponent.name,
        strength: opponent.strength,
        style: 'test',
        strengths: [],
        weaknesses: [],
      },
      venue: league.homeClubId === VISTULA_NOVA_ID ? ('home' as const) : ('away' as const),
      importance: 40,
      matchImportance: 'routine' as const,
    };
    expect(
      evaluateMatchImportance(state, fixture, {
        teamLevel: 'academy',
        started: true,
        willPlay: true,
      }),
    ).toBe('routine');
    expect(
      evaluateMatchImportance(state, fixture, {
        teamLevel: 'senior',
        started: false,
        willPlay: true,
      }),
    ).toBe('major');
  });
});
