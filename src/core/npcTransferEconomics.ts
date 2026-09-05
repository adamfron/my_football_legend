import type { ProfessionalClub, WorldFootballer } from '../types/domain';
import { evaluateTransferFee } from './playerEconomy';
import { RandomGenerator } from './random/RandomGenerator';

export interface ClubFinancialCapacity {
  level: number;
  transferBudget: number;
  monthlyWageBudget: number;
}

const deterministicFactor = (seed: string, club: ProfessionalClub, season: number, key: string) =>
  0.78 +
  RandomGenerator.fromSeed(`${seed}:club-finance:${season}:${club.id}:${key}`).float() * 0.48;

/** A seasonal projection, not a persisted bank account. Overlap between neighbouring tiers is intentional. */
export const deriveClubFinancialCapacity = (
  club: ProfessionalClub,
  worldSeed: string,
  season: number,
): ClubFinancialCapacity => {
  const strength = club.strengthRating ?? club.overallStrength ?? 50;
  const stable =
    (5 - club.leagueTier) * 18 +
    strength * 0.55 +
    club.reputation * 0.18 +
    club.financialLevel * 0.45;
  const level = Math.max(20, stable * deterministicFactor(worldSeed, club, season, 'capacity'));
  return {
    level,
    transferBudget: deriveSummerTransferBudget(club, worldSeed, season, level),
    monthlyWageBudget: deriveMonthlyWageBudget(club, worldSeed, season, level),
  };
};

export const deriveSummerTransferBudget = (
  club: ProfessionalClub,
  worldSeed: string,
  season: number,
  capacityLevel?: number,
) => {
  const level = capacityLevel ?? deriveClubFinancialCapacity(club, worldSeed, season).level;
  const tierBase = [0, 5_500_000, 1_900_000, 600_000, 160_000][club.leagueTier]!;
  return (
    Math.round(
      (tierBase * (0.45 + level / 125) * deterministicFactor(worldSeed, club, season, 'fees')) /
        1000,
    ) * 1000
  );
};

export const deriveMonthlyWageBudget = (
  club: ProfessionalClub,
  worldSeed: string,
  season: number,
  capacityLevel?: number,
) => {
  const level = capacityLevel ?? deriveClubFinancialCapacity(club, worldSeed, season).level;
  const tierBase = [0, 1_050_000, 470_000, 230_000, 125_000][club.leagueTier]!;
  return (
    Math.round(
      (tierBase * (0.5 + level / 150) * deterministicFactor(worldSeed, club, season, 'wages')) /
        100,
    ) * 100
  );
};

export interface NpcTransferValueContext {
  boundaryDate: string;
  sourceClub?: ProfessionalClub | undefined;
  destinationClub?: ProfessionalClub | undefined;
}

export const estimateNpcTransferValue = (
  player: WorldFootballer,
  context: NpcTransferValueContext,
) =>
  !player.currentClubId
    ? 0
    : evaluateTransferFee({
        player: player.profile,
        club: context.sourceClub ?? context.destinationClub!,
        contract: player.currentContract,
        date: context.boundaryDate,
        reputation: player.reputation ?? 0,
        developmentProfile: player.developmentProfile,
      });

export const deriveCommittedMonthlyWages = (
  squad: readonly string[],
  resolvePlayer: (id: string) => WorldFootballer | undefined,
  date: string,
) =>
  squad.reduce((total, id) => {
    const contract = resolvePlayer(id)?.currentContract;
    return (
      total +
      (contract && contract.startDate <= date && contract.endDate >= date
        ? contract.monthlySalary
        : 0)
    );
  }, 0);
