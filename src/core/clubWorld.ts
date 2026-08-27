import type { ProfessionalClub } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

/** Aggregate background tables and exchange the actual persistent club records. */
export const rollOverClubWorld = (clubs: ProfessionalClub[], seed: string): ProfessionalClub[] => {
  const tables = new Map<number, ProfessionalClub[]>();
  for (let tier = 1; tier <= 4; tier++) {
    const ranked = clubs
      .filter((c) => c.leagueTier === tier)
      .sort((a, b) => {
        const score = (club: ProfessionalClub) =>
          club.overallStrength +
          RandomGenerator.fromSeed(`${seed}:${tier}:${club.id}`).int(-12, 12);
        return score(b) - score(a) || a.id.localeCompare(b.id);
      });
    tables.set(tier, ranked);
  }
  const movement = new Map<string, 1 | 2 | 3 | 4>();
  for (let tier = 1; tier < 4; tier++) {
    for (const club of tables.get(tier)!.slice(-2)) movement.set(club.id, (tier + 1) as 2 | 3 | 4);
    for (const club of tables.get(tier + 1)!.slice(0, 2)) movement.set(club.id, tier as 1 | 2 | 3);
  }
  return clubs.map((club) => ({ ...club, leagueTier: movement.get(club.id) ?? club.leagueTier }));
};

export const validateClubWorld = (clubs: ProfessionalClub[]): boolean =>
  clubs.length === 64 &&
  new Set(clubs.map((c) => c.id)).size === 64 &&
  [1, 2, 3, 4].every((tier) => clubs.filter((c) => c.leagueTier === tier).length === 16);
