import { describe, expect, it } from 'vitest';
import { generateStartingPlayerProfile } from './playerCreator';
import { getPositionRelationship, isNormallyEligibleForPosition } from './positionCompatibility';

const winger = () =>
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
      seed: 'positions',
    },
    'positions',
    0,
  ).player;

describe('canonical position relationships', () => {
  it('allows natural, familiar adjacent and mastered, but excludes unrelated and GK', () => {
    const player = winger();
    expect(getPositionRelationship(player, 'right_winger')).toBe('natural');
    player.positionFamiliarity.right_back = 0.3;
    expect(isNormallyEligibleForPosition(player, 'right_back')).toBe(true);
    player.positionFamiliarity.left_winger = 0.75;
    expect(getPositionRelationship(player, 'left_winger')).toBe('mastered');
    expect(isNormallyEligibleForPosition(player, 'center_back')).toBe(false);
    expect(isNormallyEligibleForPosition(player, 'goalkeeper')).toBe(false);
  });
});
