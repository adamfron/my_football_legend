import type { ProfessionalClub, SquadRole, WorldFootballer } from '../types/domain';
import { getProfileAge } from './age';
import { getPlayerOverall } from './playerOverall';
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

const roleFactor: Record<SquadRole, number> = {
  development_player: 0.58,
  rotation: 0.78,
  first_team_competition: 0.95,
  important_player: 1.18,
  star_player: 1.45,
};

export const estimateNpcMonthlySalary = (
  player: WorldFootballer,
  club: ProfessionalClub,
  role: SquadRole,
  boundaryDate: string,
) => {
  const ovr = getPlayerOverall(player.profile, player.profile.primaryPosition);
  const age = getProfileAge(player.profile, boundaryDate, boundaryDate);
  const ageFactor = age <= 21 ? 0.78 : age >= 32 ? 1.08 : 1;
  const tierFactor = 1 + (4 - club.leagueTier) * 0.42;
  return Math.max(
    1_200,
    Math.round(
      (((club.financialLevel + 20) * 80 + ovr ** 2 * 1.45) *
        tierFactor *
        roleFactor[role] *
        ageFactor) /
        100,
    ) * 100,
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
) => {
  if (
    !player.currentClubId ||
    !player.currentContract ||
    player.currentContract.endDate < context.boundaryDate
  )
    return 0;
  const ovr = getPlayerOverall(player.profile, player.profile.primaryPosition);
  const age = getProfileAge(player.profile, context.boundaryDate, context.boundaryDate);
  const potential = Math.max(...Object.values(player.developmentProfile.familyCapacity));
  const remainingMonths = Math.max(
    1,
    (Number(player.currentContract.endDate.slice(0, 4)) -
      Number(context.boundaryDate.slice(0, 4))) *
      12 +
      Number(player.currentContract.endDate.slice(5, 7)) -
      Number(context.boundaryDate.slice(5, 7)),
  );
  const ageFactor =
    age <= 23 ? 1.15 + Math.max(0, potential - ovr) / 80 : age >= 33 ? 0.42 : age >= 30 ? 0.72 : 1;
  const contractFactor = Math.min(1.45, 0.42 + remainingMonths / 30);
  const role = roleFactor[player.currentContract.squadRole];
  const sourceTier = context.sourceClub?.leagueTier ?? 4;
  const tierFactor = [0, 1, 0.58, 0.3, 0.14][sourceTier]!;
  const raw =
    Math.max(15_000, Math.max(0, ovr - 34) ** 2 * 1_450) *
    ageFactor *
    contractFactor *
    role *
    tierFactor;
  return Math.max(5_000, Math.round(raw / 5_000) * 5_000);
};

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
