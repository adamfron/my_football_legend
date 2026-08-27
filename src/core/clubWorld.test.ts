import { describe, expect, it } from 'vitest';
import { generateProfessionalClubPool } from './professionalClubs';
import { rollOverClubWorld, validateClubWorld } from './clubWorld';

describe('persistent professional club world', () => {
  it('contains 64 unique clubs, exactly 16 at each level', () => {
    const world = generateProfessionalClubPool('pyramid');
    expect(validateClubWorld(world)).toBe(true);
    expect(new Set(world.map((club) => club.id)).size).toBe(64);
  });

  it('moves persistent objects while preserving a balanced pyramid', () => {
    const world = generateProfessionalClubPool('movement');
    const next = rollOverClubWorld(world, 'season-1');
    expect(validateClubWorld(next)).toBe(true);
    expect(
      next.some((club) => club.leagueTier !== world.find((old) => old.id === club.id)!.leagueTier),
    ).toBe(true);
    expect(new Set(next.map((club) => club.id))).toEqual(new Set(world.map((club) => club.id)));
  });
});
