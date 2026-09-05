import type {
  Contract,
  DevelopmentProfile,
  FootballerProfile,
  ProfessionalClub,
  SquadRole,
} from '../types/domain';
import { getProfileAge } from './age';
import { getPlayerOverall } from './playerOverall';

/** Canonical economic meaning of a promised squad role. */
export const SQUAD_ROLE_ECONOMIC_WEIGHTS: Readonly<Record<SquadRole, number>> = {
  development_player: 0.62,
  rotation: 0.8,
  first_team_competition: 1,
  important_player: 1.22,
  star_player: 1.48,
};

export interface PlayerEconomicIdentity {
  player: FootballerProfile;
  club: ProfessionalClub;
  date: string;
  reputation: number;
}

export interface ExpectedSalaryContext extends PlayerEconomicIdentity {
  role: SquadRole;
}

/**
 * Pure base expectation shared by every footballer. It contains no offer RNG and never reads a
 * career state; a signed Contract is a historical snapshot of this value plus offer variation.
 */
export const evaluateExpectedMonthlySalary = ({
  player,
  club,
  role,
  date,
  reputation,
}: ExpectedSalaryContext) => {
  const overall = getPlayerOverall(player, player.primaryPosition);
  const age = getProfileAge(player, date, date);
  const ageFactor = age <= 20 ? 0.78 : age <= 23 ? 0.9 : age >= 34 ? 0.9 : age >= 31 ? 1.02 : 1;
  const tierFactor = [0, 2.15, 1.62, 1.25, 1][club.leagueTier]!;
  const clubFactor = 0.72 + club.financialLevel / 125 + club.reputation / 500;
  const qualityValue = 900 + Math.max(0, overall - 30) ** 2 * 3.15;
  return Math.max(
    1_200,
    Math.round(
      (qualityValue *
        tierFactor *
        clubFactor *
        SQUAD_ROLE_ECONOMIC_WEIGHTS[role] *
        ageFactor *
        (0.9 + Math.max(0, Math.min(100, reputation)) / 500)) /
        100,
    ) * 100,
  );
};

export interface PlayerMarketValueContext extends PlayerEconomicIdentity {
  contract?: Contract | undefined;
  developmentProfile?: DevelopmentProfile | undefined;
}

/** Informational player value. Free-agent transfer fees are handled separately. */
export const evaluatePlayerMarketValue = ({
  player,
  club,
  contract,
  date,
  reputation,
  developmentProfile,
}: PlayerMarketValueContext) => {
  const overall = getPlayerOverall(player, player.primaryPosition);
  const age = getProfileAge(player, date, date);
  const potential = Math.max(
    overall,
    ...Object.values(developmentProfile?.familyCapacity ?? { technical: overall }),
  );
  const remainingMonths = contract
    ? Math.max(
        0,
        (Number(contract.endDate.slice(0, 4)) - Number(date.slice(0, 4))) * 12 +
          Number(contract.endDate.slice(5, 7)) -
          Number(date.slice(5, 7)),
      )
    : 0;
  const ageFactor =
    age <= 23
      ? 1.2 + Math.max(0, potential - overall) / 100
      : age >= 33
        ? 0.48
        : age >= 30
          ? 0.75
          : 1;
  const contractFactor = contract ? Math.min(1.45, 0.55 + remainingMonths / 36) : 0.72;
  const contextFactor = [0, 1, 0.64, 0.38, 0.22][club.leagueTier]! * (0.85 + club.reputation / 500);
  const raw = Math.max(20_000, Math.max(0, overall - 34) ** 2 * 1_500);
  return Math.max(
    10_000,
    Math.round(
      (raw * ageFactor * contractFactor * contextFactor * (0.92 + reputation / 500)) / 5_000,
    ) * 5_000,
  );
};

export const evaluateTransferFee = (context: PlayerMarketValueContext) =>
  !context.contract || context.contract.endDate < context.date
    ? 0
    : evaluatePlayerMarketValue(context);

export interface ProfessionalContractInput extends ExpectedSalaryContext {
  startDate: string;
  endDate: string;
  /** Deterministic offer-layer variation, deliberately separate from base valuation. */
  offerFactor?: number | undefined;
  signingBonusMonths?: number | undefined;
  contractType?: Contract['contractType'] | undefined;
}

/** Single owner of the common professional Contract invariants. */
export const createProfessionalContract = ({
  player,
  club,
  role,
  date,
  reputation,
  startDate,
  endDate,
  offerFactor = 1,
  signingBonusMonths = 0,
  contractType = role === 'development_player' ? 'development' : 'professional',
}: ProfessionalContractInput): Contract => {
  const expected = evaluateExpectedMonthlySalary({ player, club, role, date, reputation });
  const monthlySalary = Math.max(
    1_200,
    Math.round((expected * Math.max(0.75, Math.min(1.25, offerFactor))) / 100) * 100,
  );
  return {
    clubId: club.id,
    startDate,
    endDate,
    monthlySalary,
    signingBonus: Math.round((monthlySalary * Math.max(0, signingBonusMonths)) / 100) * 100,
    squadRole: role,
    contractType,
  };
};
