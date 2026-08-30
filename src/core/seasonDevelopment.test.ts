import { describe, expect, it } from 'vitest';
import type { PlayerAttributes } from '../types/domain';
import { aggregateDevelopment } from './seasonDevelopment';
import { getRadarAxes } from './radar';

const attributes: PlayerAttributes = {
  firstTouch: 50,
  dribbling: 50,
  heading: 50,
  setPieces: 50,
  concentration: 50,
  aggression: 50,
  strength: 50,
  agility: 50,
  jumping: 50,
  reflexes: 10,
  handling: 10,
  oneOnOnes: 10,
  goalkeeperSweeping: 10,
  technique: 50,
  passing: 51,
  pace: 52,
  stamina: 36,
  finishing: 54,
  tackling: 55,
  leadership: 56,
  composure: 57,
  gameReading: 58,
  determination: 59,
  ambition: 60,
  professionalism: 61,
};
describe('archived season development presentation', () => {
  it('aggregates repeated increments into the immutable start/end net change', () => {
    const end = { ...attributes, stamina: 39 };
    expect(aggregateDevelopment(attributes, end)).toContainEqual({
      attribute: 'stamina',
      before: 36,
      after: 39,
      delta: 3,
    });
    expect(
      aggregateDevelopment(attributes, end).filter((item) => item.attribute === 'stamina'),
    ).toHaveLength(1);
  });
  it('uses one shared macro radar calculation for both profiles', () => {
    expect(getRadarAxes(attributes)).toEqual(getRadarAxes({ ...attributes }));
    expect(getRadarAxes(attributes)).toHaveLength(8);
  });
});
