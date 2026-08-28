import { describe, expect, it } from 'vitest';
import { advanceCareerFlow } from './careerFlow';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'winger',
        heightCm: 175,
        weightKg: 68,
        seed: 'normal-u17',
      },
      'normal-u17',
      0,
    ),
    'normal-u17',
  );

describe('career flow', () => {
  it('starts directly with one normal full Vistula Nova U-17 season', () => {
    const started = advanceCareerFlow(career());
    expect(started.currentClub.name).toBe('Vistula Nova');
    expect(started.player.age).toBe(16);
    expect(started.leagueSeason?.competition.category).toBe('youth');
    expect(started.leagueSeason?.competition.name).toMatch(/U-17/);
    expect(started.careerCalendar?.fixtures.length).toBeGreaterThan(10);
    expect(started.activeEvent).toBeUndefined();
  });

  it('does not restart a scripted onboarding arc', () => {
    const started = advanceCareerFlow(career());
    expect(advanceCareerFlow(started).leagueSeason?.id).toBe(started.leagueSeason?.id);
    expect(started.historyFacts.some((fact) => fact.factType === 'academy_selection_result')).toBe(
      false,
    );
  });
});
