import { describe, expect, it } from 'vitest';
import { generateStartingPlayerProfile } from './playerCreator';
import {
  GOALKEEPER_RADAR_GROUPS,
  getGoalkeeperRadarAxes,
  getOutfieldRadarAxes,
  OUTFIELD_RADAR_GROUPS,
} from './radar';
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
  it.each([OUTFIELD_RADAR_GROUPS, GOALKEEPER_RADAR_GROUPS])(
    'maps every included attribute once and excludes body/behaviour fields',
    (groups) => {
      const keys = Object.values(groups).flat();
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).not.toContain('setPieces');
      expect(keys).not.toContain('ambition');
      expect(keys).not.toContain('professionalism');
    },
  );
  it('does not derive radar skill from height', () => {
    expect(getOutfieldRadarAxes(player.attributes, 155)).toEqual(
      getOutfieldRadarAxes(player.attributes, 205),
    );
    expect(getGoalkeeperRadarAxes(player.attributes, 155)).toEqual(
      getGoalkeeperRadarAxes(player.attributes, 205),
    );
  });
  it('uses kicking and throwing in goalkeeper distribution', () => {
    const low = {
      ...player.attributes,
      passing: 50,
      goalkeeperKicking: 10,
      goalkeeperThrowing: 10,
    };
    const high = { ...low, goalkeeperKicking: 90, goalkeeperThrowing: 90 };
    expect(getGoalkeeperRadarAxes(high)[5]!.value).toBeGreaterThan(
      getGoalkeeperRadarAxes(low)[5]!.value,
    );
  });
});
