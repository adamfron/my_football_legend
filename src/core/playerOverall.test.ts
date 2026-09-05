import { describe, expect, it } from 'vitest';
import { generateStartingPlayerProfile } from './playerCreator';
import {
  getEffectivePositionOverall,
  getPositionFamiliarityModifier,
  getTheoreticalPositionOverall,
  POSITION_OVR_WEIGHTS,
} from './playerOverall';
const make = () =>
  generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Model',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      difficulty: 'normal',
      position: 'striker',
      heightCm: 185,
      weightKg: 80,
      seed: 'ovr',
    },
    'ovr',
    0,
  ).player;
describe('positional OVR', () => {
  it('is deterministic, bounded and symmetric', () => {
    const p = make();
    expect(getTheoreticalPositionOverall(p, 'striker')).toBe(
      getTheoreticalPositionOverall(p, 'striker'),
    );
    for (const pos of [
      'striker',
      'left_winger',
      'right_winger',
      'attacking_midfielder',
      'defensive_midfielder',
      'left_back',
      'right_back',
      'center_back',
      'goalkeeper',
    ] as const)
      expect(getTheoreticalPositionOverall(p, pos)).toBeGreaterThanOrEqual(1);
    expect(POSITION_OVR_WEIGHTS.left_winger).toEqual(POSITION_OVR_WEIGHTS.right_winger);
    expect(POSITION_OVR_WEIGHTS.left_back).toEqual(POSITION_OVR_WEIGHTS.right_back);
  });
  it('does not count character dimensions directly', () => {
    const p = make(),
      before = getTheoreticalPositionOverall(p, 'striker');
    p.attributes.ambition = p.attributes.professionalism = 100;
    expect(getTheoreticalPositionOverall(p, 'striker')).toBe(before);
  });
  it('separates familiarity and strongly protects the goalkeeper boundary', () => {
    const p = make();
    expect(getPositionFamiliarityModifier(p, 'striker')).toBe(1);
    expect(getPositionFamiliarityModifier(p, 'center_back')).toBe(0.65);
    expect(getPositionFamiliarityModifier(p, 'goalkeeper')).toBe(0.65);
    expect(getEffectivePositionOverall(p, 'goalkeeper')).toBeLessThan(
      getTheoreticalPositionOverall(p, 'goalkeeper'),
    );
  });
  it('responds to positioning and goalkeeper distribution without displacing shot stopping', () => {
    const defender = make();
    defender.primaryPosition = 'center_back';
    defender.positionFamiliarity.center_back = 1;
    defender.attributes.positioning = 10;
    const lowCb = getTheoreticalPositionOverall(defender, 'center_back');
    defender.attributes.positioning = 90;
    expect(getTheoreticalPositionOverall(defender, 'center_back')).toBeGreaterThan(lowCb);
    defender.attributes.goalkeeperKicking = defender.attributes.goalkeeperThrowing = 10;
    const lowDistribution = getTheoreticalPositionOverall(defender, 'goalkeeper');
    defender.attributes.goalkeeperKicking = defender.attributes.goalkeeperThrowing = 90;
    expect(getTheoreticalPositionOverall(defender, 'goalkeeper')).toBeGreaterThan(lowDistribution);
    defender.attributes.reflexes =
      defender.attributes.handling =
      defender.attributes.oneOnOnes =
        95;
    expect(getTheoreticalPositionOverall(defender, 'goalkeeper')).toBeGreaterThan(lowDistribution);
  });
});
