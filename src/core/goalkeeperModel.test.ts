import { describe, expect, it } from 'vitest';
import { generateStartingPlayerProfile } from './playerCreator';
import { getTheoreticalPositionOverall } from './playerOverall';
const input = {
  firstName: 'Jan',
  lastName: 'Bramkarz',
  nationality: 'PL' as const,
  age: 16 as const,
  dominantFoot: 'right' as const,
  difficulty: 'normal' as const,
  position: 'goalkeeper' as const,
  heightCm: 190,
  weightKg: 82,
  seed: 'gk',
};
describe('canonical goalkeeper model', () => {
  it('stores specialist skills on every player', () => {
    const p = generateStartingPlayerProfile(input, 'gk', 0).player;
    expect(p.attributes.reflexes).toBeGreaterThan(1);
    expect(getTheoreticalPositionOverall(p, 'goalkeeper')).toBeGreaterThan(1);
    expect('goalkeeperAttributes' in p).toBe(false);
  });
});
