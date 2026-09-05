import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { applyPositionLearning, getPositionLearningGain } from './positionLearning';
import type { SeasonParticipationRecord } from '../types/domain';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        difficulty: 'normal',
        position: 'right_winger',
        heightCm: 175,
        weightKg: 70,
        seed: 'learn',
      },
      'learn',
      0,
    ),
    'learn',
  );
const row = (assignedPosition: 'right_back' | 'center_back', minutes: number) =>
  ({ assignedPosition, minutes }) as SeasonParticipationRecord;

describe('position learning', () => {
  it('uses minutes, accelerates cooperation and excludes unrelated positions', () => {
    const c = career();
    const brief = applyPositionLearning(c, row('right_back', 10));
    expect(brief.player.positionFamiliarity.right_back).toBeGreaterThan(0);
    expect(brief.player.positionFamiliarity.right_back).toBeLessThan(0.01);
    expect(getPositionLearningGain(c, row('right_back', 900), true)).toBeGreaterThan(
      getPositionLearningGain(c, row('right_back', 900)),
    );
    expect(
      applyPositionLearning(c, row('center_back', 900)).player.positionFamiliarity.center_back,
    ).toBe(0);
  });
});
