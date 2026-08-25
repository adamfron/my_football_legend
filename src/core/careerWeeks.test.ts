import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  advanceCareerWeek,
  generateFixtureSchedule,
  getCurrentCareerWeek,
  initializeCurrentCareerWeek,
  recoverOrphanedSeasonOneRound,
  shouldScheduleOffFieldEvent,
} from './careerWeeks';
import { careerStateSchema } from '../schemas/domainSchemas';
import { settleLeagueRound, getLeagueTable } from './leagueSeason';
import { simulateRoutinePlayerMatch } from './careerSimulation';
import { auditCareerSeason } from './seasonAudit';

const career = (seed = 'week-test') => {
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
  const base = createCareerState(profile, seed);
  return {
    ...base,
    historyFacts: [
      ...base.historyFacts,
      {
        id: 'old-september-complete',
        factType: 'september_2026_completed',
        season: 2026,
        date: '2026-09-30',
        actors: [base.player.id],
        targets: [],
        clubs: [base.currentClub.id],
        competitions: [],
        data: {},
        causes: [],
        tags: [],
        visibility: 'public' as const,
        narrativeImportance: 60,
        emotionalTone: 'neutral' as const,
      },
    ],
  };
};

describe('reusable career week loop', () => {
  it('creates an idempotent schedule with fixture and rest weeks', () => {
    const first = initializeCurrentCareerWeek(career());
    expect(initializeCurrentCareerWeek(first)).toEqual(first);
    expect(first.careerCalendar?.weeks.length).toBeGreaterThanOrEqual(34);
    expect(first.careerCalendar?.weeks.some((week) => week.fixtureIds.length === 0)).toBe(true);
    expect(first.careerCalendar?.weeks.some((week) => week.fixtureIds.length > 0)).toBe(true);
  });
  it('migrates September into four complete and balanced senior rounds', () => {
    const state = initializeCurrentCareerWeek(career('migration'));
    expect(state.leagueSeason?.currentRound).toBe(4);
    expect(
      state.leagueSeason?.rounds
        .slice(0, 4)
        .every((round) => round.completed && round.fixtures.every((fixture) => fixture.completed)),
    ).toBe(true);
    const played = state.leagueSeason!.clubIds.map(
      (clubId) =>
        state
          .leagueSeason!.rounds.flatMap((round) => round.fixtures)
          .filter(
            (fixture) =>
              fixture.completed && [fixture.homeClubId, fixture.awayClubId].includes(clubId),
          ).length,
    );
    expect(new Set(played)).toEqual(new Set([4]));
  });
  it('crosses month boundaries and advances twelve weeks without duplicates', () => {
    let state = initializeCurrentCareerWeek(career());
    for (let index = 0; index < 12; index++) state = advanceCareerWeek(state);
    expect(getCurrentCareerWeek(state)?.weekIndex).toBe(12);
    expect(new Set(state.careerCalendar?.weeks.map((week) => week.id)).size).toBe(
      state.careerCalendar?.weeks.length,
    );
    expect(state.careerCalendar?.monthlyCheckpoints.map((item) => item.month)).toContain('2026-10');
    expect(careerStateSchema.parse(state)).toBeTruthy();
  });
  it('generates deterministic unique fixtures and spaced events', () => {
    expect(generateFixtureSchedule('same')).toEqual(generateFixtureSchedule('same'));
    const schedule = generateFixtureSchedule('same');
    expect(new Set(schedule.map((fixture) => fixture.id)).size).toBe(schedule.length);
    let state = initializeCurrentCareerWeek(career('cadence'));
    const decisions: boolean[] = [];
    for (let index = 0; index < 12; index++) {
      decisions.push(shouldScheduleOffFieldEvent(state, getCurrentCareerWeek(state)!));
      state = advanceCareerWeek(state);
    }
    expect(decisions.some(Boolean)).toBe(true);
    expect(decisions.some((value) => !value)).toBe(true);
  });
  it('assigns every post-prologue fixture to exactly one week without a date gap', () => {
    const state = initializeCurrentCareerWeek(career('coverage'));
    const fixtures = state.careerCalendar!.fixtures;
    expect(fixtures).toHaveLength(18);
    for (const fixture of fixtures) {
      const containing = state.careerCalendar!.weeks.filter(
        (week) => fixture.date >= week.startDate && fixture.date <= week.endDate,
      );
      expect(containing).toHaveLength(1);
      expect(containing[0]!.fixtureIds).toContain(fixture.id);
    }
    expect(fixtures[0]!.date).toBe('2026-10-03');
    expect(state.careerCalendar!.weeks[0]!.fixtureIds).toContain(fixtures[0]!.id);
    expect(auditCareerSeason(state).unassignedFixtures).toEqual([]);
  });

  it('deterministically completes all 22 rounds without stalling on the final week', () => {
    let state = initializeCurrentCareerWeek(career('full-season'));
    while (!state.leagueSeason!.completed) {
      const week = getCurrentCareerWeek(state)!;
      const fixture = state.careerCalendar!.fixtures.find((item) =>
        week.fixtureIds.includes(item.id),
      );
      if (fixture) {
        state = simulateRoutinePlayerMatch(state, fixture);
        const roundIndex = state.leagueSeason!.rounds.findIndex((round) =>
          round.fixtures.some((item) => item.id === fixture.id),
        );
        state = settleLeagueRound(state, roundIndex);
      }
      state = advanceCareerWeek(state);
    }
    expect(state.leagueSeason!.rounds).toHaveLength(22);
    expect(state.leagueSeason!.rounds.every((round) => round.completed)).toBe(true);
    expect(getLeagueTable(state).every((row) => row.played === 22)).toBe(true);
    expect(state.leagueSeason!.completed).toBe(true);
    expect(state.seasonOutcome).toBeDefined();
    expect(auditCareerSeason(state)).toMatchObject({ completedRounds: 22, unassignedFixtures: [] });
  });

  it('recovers a PR #16 save stuck at 21/22 without duplicating player history', () => {
    let state = initializeCurrentCareerWeek(career('old-save'));
    for (let index = 4; index < 22; index++) state = settleLeagueRound(state, index);
    state = {
      ...state,
      leagueSeason: {
        ...state.leagueSeason!,
        rounds: state.leagueSeason!.rounds.map((round, index) =>
          index === 3
            ? {
                ...round,
                date: '2026-09-26',
                completed: false,
                fixtures: round.fixtures.map((fixture) => ({
                  ...fixture,
                  date: '2026-09-26',
                  completed: false,
                  homeGoals: undefined,
                  awayGoals: undefined,
                })),
              }
            : round,
        ),
        currentRound: 3,
        completed: false,
      },
      seasonOutcome: undefined,
      careerCalendar: {
        ...state.careerCalendar!,
        currentWeekIndex: state.careerCalendar!.weeks.length - 1,
      },
    };
    const appearances = state.matchHistory?.length ?? 0;
    const facts = state.historyFacts.length;
    const recovered = recoverOrphanedSeasonOneRound(state);
    expect(recovered.leagueSeason?.completed).toBe(true);
    expect(getLeagueTable(recovered).every((row) => row.played === 22)).toBe(true);
    expect(recovered.matchHistory?.length ?? 0).toBe(appearances);
    expect(recovered.historyFacts).toHaveLength(facts);
    expect(recovered.seasonOutcome).toBeDefined();
  });
});
