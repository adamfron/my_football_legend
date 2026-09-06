import { describe, expect, it } from 'vitest';
import type { CareerState } from '../types/domain';
import { getCareerCurrentDate, getSeasonProgress } from './seasonProgress';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';

const base = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Czas',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'central_midfielder',
        heightCm: 178,
        weightKg: 70,
        seed: 'clock',
      },
      'clock',
      0,
    ),
    'clock',
  );

describe('canonical season clock', () => {
  it('uses contextual simulation dates and never the supported-through horizon', () => {
    const career = base();
    const states = ['2026-09-05', '2026-10-31', '2027-02-06', '2027-04-10', '2027-05-15'].map(
      (date) =>
        ({
          ...career,
          decisionPoint: { type: 'checkpoint' as const, date, sourceId: date },
          careerCalendar: {
            seasonId: '2026-27',
            currentDate: '2026-08-20',
            currentWeekIndex: 0,
            weeks: [],
            fixtures: [],
            scheduledEvents: [],
            monthlyCheckpoints: [],
            availableThrough: '2027-05-31',
          },
        }) satisfies CareerState,
    );
    const progress = states.map((state) => getSeasonProgress(state).progress);
    expect(states.map(getCareerCurrentDate)).toEqual([
      '2026-09-05',
      '2026-10-31',
      '2027-02-06',
      '2027-04-10',
      '2027-05-15',
    ]);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(getSeasonProgress(states[0]!).weeksUntilSummerWindow).toBeUndefined();
  });

  it('moves from a final round to the completed season date', () => {
    const career = base();
    const finalRound = {
      ...career,
      decisionPoint: { type: 'important_match' as const, date: '2027-05-15', sourceId: 'final' },
    };
    const summary = {
      ...career,
      leagueSeason: {
        id: '2026-27',
        name: '2026/27',
        competition: {
          id: 'u17',
          name: 'U17',
          country: 'Polska',
          category: 'youth' as const,
          ageLevel: 'U17' as const,
        },
        controlledClubId: career.currentClub.id,
        startDate: '2026-09-05',
        endDate: '2027-05-31',
        clubIds: [],
        clubs: [],
        rounds: [],
        currentRound: 22,
        completed: true,
      },
    };
    expect(getSeasonProgress(summary).progress).toBeGreaterThan(
      getSeasonProgress(finalRound).progress,
    );
    expect(getCareerCurrentDate(summary)).toBe('2027-05-31');
    expect(getSeasonProgress(summary).weeksUntilSummerWindow).toBe(1);
    expect(
      getSeasonProgress({
        ...summary,
        seasonOutcome: { finalPosition: 1, champion: true, competitionType: 'academy' },
      }).progress,
    ).toBe(1);
    expect(
      getSeasonProgress({
        ...summary,
        seasonOutcome: { finalPosition: 1, champion: true, competitionType: 'academy' },
      }).phase,
    ).toBe('summer_window');
  });
});
