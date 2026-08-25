import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  advanceCareerWeek,
  generateFixtureSchedule,
  getCurrentCareerWeek,
  initializeCurrentCareerWeek,
  shouldScheduleOffFieldEvent,
} from './careerWeeks';
import { careerStateSchema } from '../schemas/domainSchemas';

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
});
