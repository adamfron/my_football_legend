import { describe, expect, it } from 'vitest';
import { generateStartingPlayerProfile } from './playerCreator';
import { getGoalkeeperRadarAxes, getOutfieldRadarAxes } from './radar';
const player = generateStartingPlayerProfile(
  {
    firstName: 'Jan',
    lastName: 'Radar',
    nationality: 'PL',
    age: 16,
    dominantFoot: 'left',
    difficulty: 'normal',
    position: 'goalkeeper',
    heightCm: 190,
    weightKg: 82,
    seed: 'radar',
  },
  'radar',
  0,
).player;
describe('Player Model 2.0 radar', () => {
  it('uses the exact eight-axis orders', () => {
    expect(getOutfieldRadarAxes(player.attributes).map(({ label }) => label)).toEqual([
      'Defensywa',
      'Fizyczne',
      'Szybkość',
      'Czytanie gry',
      'Ofensywa',
      'Techniczne',
      'Górne piłki',
      'Psychiczne',
    ]);
    expect(getGoalkeeperRadarAxes(player.attributes).map(({ label }) => label)).toEqual([
      'Obrona strzałów',
      'Fizyczne',
      'Szybkość',
      'Gra na przedpolu',
      'Komunikacja',
      'Wyprowadzanie',
      'Górne piłki',
      'Psychiczne',
    ]);
  });
  it('derives bounded presentation values', () => {
    for (const axis of [
      ...getOutfieldRadarAxes(player.attributes),
      ...getGoalkeeperRadarAxes(player.attributes),
    ])
      expect(axis.value).toBeGreaterThanOrEqual(0);
  });
});
