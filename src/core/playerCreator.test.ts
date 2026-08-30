import { describe, expect, it } from 'vitest';
import { generateStartingProfileVariants, positionIds } from './playerCreator';
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
});
