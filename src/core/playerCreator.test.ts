import { describe, expect, it } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  generateStartingProfileVariants,
  positionIds,
} from './playerCreator';
import { OVR_ATTRIBUTE_KEYS } from './playerOverall';
import { getEligibleFootballArchetypes } from './footballArchetypes';
const input = {
  firstName: 'Jan',
  lastName: 'Testowy',
  nationality: 'PL' as const,
  age: 16 as const,
  dominantFoot: 'right' as const,
  difficulty: 'normal' as const,
  position: 'left_winger' as const,
  heightCm: 175,
  weightKg: 69,
  seed: 'model2',
};
describe('Player Model 2.0 creator', () => {
  it('generates deterministic shared futures and distinct choices', () => {
    const a = generateStartingProfileVariants(input, 'model2'),
      b = generateStartingProfileVariants(input, 'model2');
    expect(a).toEqual(b);
    expect(a).toHaveLength(getEligibleFootballArchetypes('left_winger').length);
    expect(a[0]!.player.hiddenProfile).toEqual(a[1]!.player.hiddenProfile);
    expect(a[0]!.developmentProfile).toEqual(a[1]!.developmentProfile);
    expect(a[0]!.player.attributes).not.toEqual(a[1]!.player.attributes);
    expect(Object.keys(a[0]!.player.attributes)).toHaveLength(25);
  });
  it('has exactly nine positions and attributes', () => {
    expect(positionIds).toHaveLength(9);
    expect(OVR_ATTRIBUTE_KEYS).toHaveLength(25);
  });
  it('reuses immutable fallback world data while isolating career state', () => {
    const profileA = generateStartingPlayerProfile(input, 'fallback-a', 0);
    const profileB = generateStartingPlayerProfile(
      { ...input, firstName: 'Piotr', seed: 'fallback-b' },
      'fallback-b',
      0,
    );
    const careerA = createCareerState(profileA, 'fallback-a');
    const careerB = createCareerState(profileB, 'fallback-b');

    expect(careerA.clubWorld).toBe(careerB.clubWorld);
    expect(careerA.footballerWorld).toBe(careerB.footballerWorld);
    expect(careerA.youthCohorts).toBe(careerB.youthCohorts);
    expect(careerA.player).not.toBe(careerB.player);
    expect(careerA.player.id).not.toBe(careerB.player.id);
    expect(careerA.historyFacts).not.toBe(careerB.historyFacts);
    expect(careerA.worldDelta).not.toBe(careerB.worldDelta);
    expect(careerA.seasonParticipation).not.toBe(careerB.seasonParticipation);
  });
});
