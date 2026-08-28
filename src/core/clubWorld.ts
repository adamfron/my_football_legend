import type { ProfessionalClub } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { getClubStrength } from './clubStrength';

export interface ClubEvolutionContext {
  previousTier: number;
  nextTier: number;
  finish: number;
  clubCount?: number;
}
/** Single seeded annual evolution of the canonical ProfessionalClub strength. */
export const evolveClubStrength = (
  club: ProfessionalClub,
  context: ClubEvolutionContext,
  seed: string,
): ProfessionalClub => {
  const rng = RandomGenerator.fromSeed(`${seed}:club-evolution:${club.id}`);
  const movement =
    context.nextTier < context.previousTier
      ? rng.int(1, 4)
      : context.nextTier > context.previousTier
        ? -rng.int(1, 5)
        : 0;
  const success =
    context.finish <= 3 ? 1 : context.finish >= (context.clubCount ?? 16) - 2 ? -1 : 0;
  const finance = club.financialLevel >= 70 ? 1 : club.financialLevel <= 35 ? -1 : 0;
  const ambition = club.archetype === 'AMBITIOUS_CLIMBER' && success > 0 ? 1 : 0;
  const variation = rng.int(-1, 1);
  const delta = Math.max(-5, Math.min(4, movement + success + finance + ambition + variation));
  return {
    ...club,
    strengthRating: Math.max(30, Math.min(92, getClubStrength(club) + delta)),
    leagueTier: context.nextTier as 1 | 2 | 3 | 4,
  };
};

/** Aggregate background tables and exchange the actual persistent club records. */
export const rollOverClubWorld = (clubs: ProfessionalClub[], seed: string): ProfessionalClub[] => {
  const tables = new Map<number, ProfessionalClub[]>();
  for (let tier = 1; tier <= 4; tier++) {
    const ranked = clubs
      .filter((c) => c.leagueTier === tier)
      .sort((a, b) => {
        const score = (club: ProfessionalClub) =>
          getClubStrength(club) +
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
  return clubs.map((club) =>
    evolveClubStrength(
      club,
      {
        previousTier: club.leagueTier,
        nextTier: movement.get(club.id) ?? club.leagueTier,
        finish: tables.get(club.leagueTier)!.findIndex((item) => item.id === club.id) + 1,
        clubCount: 16,
      },
      seed,
    ),
  );
};

export const validateClubWorld = (clubs: ProfessionalClub[]): boolean =>
  clubs.length === 64 &&
  new Set(clubs.map((c) => c.id)).size === 64 &&
  [1, 2, 3, 4].every((tier) => clubs.filter((c) => c.leagueTier === tier).length === 16);
