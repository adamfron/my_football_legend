import { describe, expect, it } from 'vitest';
import type { SeasonParticipationRecord } from '../types/domain';
import { generateStartingPlayerProfile } from './playerCreator';
import { getPlayerOverall } from './playerOverall';
import { getGoalsPrevented, simulateGoalkeeperPerformance } from './goalkeeperPerformance';
import { getSeasonAppearanceStats, getSeasonGoalkeeperStats } from './seasonParticipation';

const goalkeeper = generateStartingPlayerProfile(
  {
    firstName: 'Jan',
    lastName: 'Test',
    nationality: 'PL',
    age: 16,
    dominantFoot: 'right',
    position: 'goalkeeper',
    heightCm: 190,
    weightKg: 82,
    seed: 'gk',
  },
  'gk',
  0,
).player;

const row = (id: number, started: boolean): SeasonParticipationRecord => ({
  fixtureId: String(id),
  date: '2027-01-01',
  opponentId: 'x',
  venue: 'home',
  competition: 'Liga',
  status: started ? 'starter' : 'not_selected',
  plannedMinutes: started ? 90 : 0,
  minutes: started ? 90 : 0,
  started,
  goals: 0,
  assists: 0,
  xG: 0,
  xA: 0,
});

describe('goalkeeper and canonical fixture statistics', () => {
  it('never derives 23 starts from 12 appearances', () => {
    const totals = getSeasonAppearanceStats(Array.from({ length: 23 }, (_, i) => row(i, i < 12)));
    expect(totals).toMatchObject({ appearances: 12, starts: 12, substituteAppearances: 0 });
  });
  it('does not give Finishing a goalkeeper OVR weight', () => {
    const before = getPlayerOverall(goalkeeper, 'goalkeeper');
    goalkeeper.attributes.finishing = 100;
    expect(getPlayerOverall(goalkeeper, 'goalkeeper')).toBe(before);
  });
  it('uses goalkeeper wording in creator feedback', () => {
    const profile = generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'goalkeeper',
        heightCm: 190,
        weightKg: 82,
        seed: 'labels',
      },
      'labels',
      0,
    );
    expect(Object.values(profile.profileDescriptionParams).join(' ')).not.toContain('finishing');
  });
  it('aggregates xGA and goals prevented from detailed fixture rows', () => {
    const fixture = {
      ...row(1, true),
      goalkeeperStats: {
        goalsConceded: 1,
        shotsOnTargetFaced: 5,
        saves: 4,
        savePercentage: 80,
        cleanSheet: false,
        xGA: 2.2,
        errorsLeadingToGoal: 0,
        rating: 7.5,
      },
    };
    expect(getSeasonGoalkeeperStats([fixture])).toMatchObject({
      saves: 4,
      goalsConceded: 1,
      goalsPrevented: 1.2,
    });
    expect(getGoalsPrevented(fixture.goalkeeperStats)).toBe(1.2);
  });
  it('allows strong keepers to outperform and weak keepers to underperform xGA deterministically', () => {
    const strong = structuredClone(goalkeeper);
    const weak = structuredClone(goalkeeper);
    const strongAttributes = strong.goalkeeperAttributes! as unknown as Record<string, number>;
    const weakAttributes = weak.goalkeeperAttributes! as unknown as Record<string, number>;
    for (const key of Object.keys(strongAttributes)) {
      strongAttributes[key] = 90;
      weakAttributes[key] = 30;
    }
    const strongRuns = Array.from({ length: 20 }, (_, i) =>
      simulateGoalkeeperPerformance(strong, 68, 4, String(i)),
    );
    const weakRuns = Array.from({ length: 20 }, (_, i) =>
      simulateGoalkeeperPerformance(weak, 68, 2, String(i)),
    );
    expect(strongRuns.some((s) => s.goalsConceded < s.xGA)).toBe(true);
    expect(weakRuns.some((s) => s.goalsConceded > s.xGA)).toBe(true);
  });
});
