import { describe, expect, it } from 'vitest';
import { generateStartingPlayerProfile } from './playerCreator';
import { getPlayerOverall } from './playerOverall';

describe('getPlayerOverall', () => {
  it('is deterministic, bounded and position weighted', () => {
    const player = generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'striker',
        heightCm: 181,
        weightKg: 74,
        seed: 'ovr',
      },
      'ovr',
      0,
    ).player;
    player.attributes = {
      technique: 50,
      vision: 35,
      pace: 70,
      stamina: 45,
      finishing: 80,
      defending: 20,
      leadership: 40,
      composure: 75,
      spatialAwareness: 72,
      determination: 99,
      ambition: 99,
      professionalism: 99,
    };
    const striker = getPlayerOverall(player, 'striker');
    expect(striker).toBe(70);
    expect(striker).toBeGreaterThan(getPlayerOverall(player, 'center_back'));
    expect(striker).toBeGreaterThanOrEqual(1);
    const before = striker;
    player.attributes.professionalism = 1;
    player.attributes.determination = 1;
    player.attributes.ambition = 1;
    expect(getPlayerOverall(player, 'striker')).toBe(before);
    expect(striker).toBeLessThanOrEqual(100);
  });
});
