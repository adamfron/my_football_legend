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
import type { CareerState } from '../types/domain';
import { settleLeagueRound, getLeagueTable } from './leagueSeason';
import {
  getCareerProgressBlocker,
  advanceSimulationStep,
  simulateRoutinePlayerMatch,
} from './careerSimulation';
import { auditCareerSeason } from './seasonAudit';

const career = (seed = 'week-test') => {
  const profile = generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Nowak',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      position: 'attacking_midfielder',
      heightCm: 178,
      weightKg: 70,
      seed,
    },
    seed,
    0,
  );
  const base = createCareerState(profile, seed);
  return base;
};

describe('reusable career week loop', () => {
  it('clears only the matching blocker when a completed important match is left', () => {
    const initial = initializeCurrentCareerWeek(career('important-complete'));
    const fixture = initial.careerCalendar!.fixtures[0]!;
    const weekIndex = initial.careerCalendar!.weeks.findIndex((week) =>
      week.fixtureIds.includes(fixture.id),
    );
    const activeMatch = {
      id: fixture.id,
      date: fixture.date,
      completed: true,
    } as unknown as CareerState['activeMatch'];
    const ready: CareerState = {
      ...initial,
      activeMatch,
      decisionPoint: { type: 'important_match', date: fixture.date, sourceId: fixture.id },
      careerCalendar: { ...initial.careerCalendar!, currentWeekIndex: weekIndex },
    };

    const advanced = advanceCareerWeek(ready);

    expect(advanced.activeMatch).toBeUndefined();
    expect(advanced.decisionPoint).toBeUndefined();
    expect(advanced.careerCalendar!.currentWeekIndex).toBe(weekIndex + 1);
    expect(getCareerProgressBlocker(advanced)).toBeUndefined();
  });

  it('retains a genuinely unresolved important-match blocker', () => {
    const initial = initializeCurrentCareerWeek(career('important-open'));
    const fixture = initial.careerCalendar!.fixtures[0]!;
    const blocked: CareerState = {
      ...initial,
      decisionPoint: { type: 'important_match', date: fixture.date, sourceId: fixture.id },
    };
    expect(getCareerProgressBlocker(blocked)).toBe('important_match requires resolution');
    expect(() => advanceSimulationStep(blocked)).toThrow(/important_match requires resolution/);
  });

  it('records each routine appearance once in match history and keeps first milestones unique', () => {
    let state = initializeCurrentCareerWeek(career('routine-ledger'));
    let appearances = 0;
    for (const fixture of state.careerCalendar!.fixtures) {
      state = simulateRoutinePlayerMatch(state, fixture, {
        status: 'academy_starter',
        teamLevel: 'academy',
        started: true,
        willPlay: true,
        plannedMinutes: 90,
      });
      const once = state.matchHistory!.filter((item) => item.matchId === `academy_${fixture.id}`);
      if (state.seasonParticipation!.find((row) => row.fixtureId === fixture.id)!.minutes > 0) {
        appearances += 1;
        expect(once).toHaveLength(1);
      } else {
        expect(once).toHaveLength(0);
      }
      const retried = simulateRoutinePlayerMatch(state, fixture, {
        status: 'academy_starter',
        teamLevel: 'academy',
        started: true,
        willPlay: true,
        plannedMinutes: 90,
      });
      expect(retried.matchHistory).toEqual(state.matchHistory);
    }
    expect(appearances).toBeGreaterThan(0);
    expect(
      state.historyFacts.filter((fact) => fact.factType === 'first_academy_goal').length,
    ).toBeLessThanOrEqual(1);
    expect(
      state.historyFacts.filter((fact) => fact.factType === 'first_academy_assist').length,
    ).toBeLessThanOrEqual(1);
  });
  it('creates an idempotent schedule with fixture and rest weeks', () => {
    const first = initializeCurrentCareerWeek(career());
    expect(initializeCurrentCareerWeek(first)).toEqual(first);
    expect(first.careerCalendar?.weeks.length).toBeGreaterThanOrEqual(34);
    expect(first.careerCalendar?.weeks.some((week) => week.fixtureIds.length === 0)).toBe(true);
    expect(first.careerCalendar?.weeks.some((week) => week.fixtureIds.length > 0)).toBe(true);
  });
  it('starts season one at round zero without a September bootstrap', () => {
    const state = initializeCurrentCareerWeek(career('migration'));
    expect(state.leagueSeason?.currentRound).toBe(0);
    expect(state.leagueSeason?.rounds.every((round) => !round.completed)).toBe(true);
    expect(
      state.leagueSeason?.rounds
        .flatMap((round) => round.fixtures)
        .every((fixture) => !fixture.completed),
    ).toBe(true);
    expect(state.matchHistory).toEqual(career('migration').matchHistory);
    const firstFixture = state.careerCalendar!.fixtures[0]!;
    const firstFixtureWeek = state.careerCalendar!.weeks.find((week) =>
      week.fixtureIds.includes(firstFixture.id),
    );
    expect(firstFixtureWeek).toBeDefined();
    expect(firstFixtureWeek!.startDate <= firstFixture.date).toBe(true);
    expect(firstFixture.date).toBe(state.leagueSeason!.rounds[0]!.date);
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
  it('assigns all 22 full-season fixtures once without a prologue gap', () => {
    const state = initializeCurrentCareerWeek(career('coverage'));
    const fixtures = state.careerCalendar!.fixtures;
    expect(fixtures).toHaveLength(22);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(22);
    for (const fixture of fixtures) {
      const containing = state.careerCalendar!.weeks.filter(
        (week) => fixture.date >= week.startDate && fixture.date <= week.endDate,
      );
      expect(containing).toHaveLength(1);
      expect(containing[0]!.fixtureIds).toContain(fixture.id);
    }
    expect(fixtures[0]!.date).toBe(state.leagueSeason!.rounds[0]!.date);
    expect(fixtures[0]!.date >= state.careerCalendar!.weeks[0]!.startDate).toBe(true);
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

describe('dynamic canonical calendar', () => {
  it('inserts, detects conflicts and atomically reschedules a future fixture', async () => {
    const { scheduleFixture, detectCalendarConflict, rescheduleFixture } = await import(
      './careerCalendar'
    );
    const { buildSeasonTimeline } = await import('./seasonTimeline');
    const initial = initializeCurrentCareerWeek(career('dynamic-calendar'));
    const existing = initial.careerCalendar!.fixtures[0]!;
    const added = { ...existing, id: 'future_external_fixture', competition: 'future_competition' };
    const scheduled = scheduleFixture(initial, added);
    expect(scheduled.careerCalendar!.fixtures.filter((item) => item.id === added.id)).toHaveLength(
      1,
    );
    expect(
      scheduled.seasonParticipation!.filter((item) => item.fixtureId === added.id),
    ).toHaveLength(1);
    expect(detectCalendarConflict(scheduled.careerCalendar!, added.date)?.fixtureIds).toContain(
      existing.id,
    );

    const targetWeek = scheduled.careerCalendar!.weeks.find((week) => !week.fixtureIds.length)!;
    const moved = rescheduleFixture(
      scheduled,
      added.id,
      targetWeek.startDate,
      'competition_conflict',
    );
    expect(moved.careerCalendar!.fixtures.find((item) => item.id === added.id)?.date).toBe(
      targetWeek.startDate,
    );
    expect(moved.seasonParticipation!.find((item) => item.fixtureId === added.id)?.date).toBe(
      targetWeek.startDate,
    );
    expect(
      moved.careerCalendar!.weeks.find((week) => week.id === targetWeek.id)?.fixtureIds,
    ).toContain(added.id);
    expect(
      buildSeasonTimeline(moved).find(
        (item) => item.kind === 'fixture' && item.fixtureId === added.id,
      ),
    ).toMatchObject({
      date: targetWeek.startDate,
      participation: moved.seasonParticipation!.find((item) => item.fixtureId === added.id),
    });
    expect(moved.historyFacts.at(-1)).toMatchObject({
      factType: 'fixture_rescheduled',
      data: { fixtureId: added.id },
    });
  });

  it('rejects changes to a completed fixture', async () => {
    const { rescheduleFixture } = await import('./careerCalendar');
    const initial = initializeCurrentCareerWeek(career('immutable-calendar'));
    const fixture = initial.careerCalendar!.fixtures[0]!;
    const completed = {
      ...initial,
      seasonParticipation: initial.seasonParticipation!.map((row) =>
        row.fixtureId === fixture.id ? { ...row, fixtureStatus: 'completed' as const } : row,
      ),
    };
    expect(() => rescheduleFixture(completed, fixture.id, '2026-12-31', 'weather')).toThrow(
      /Completed historical/,
    );
  });
});
