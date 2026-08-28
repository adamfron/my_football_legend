import type { CareerState, ProfessionalClub, SquadRole } from '../types/domain';
import { getPlayerOverall } from './playerOverall';

const roleWeight: Record<SquadRole, number> = {
  development_player: 0.72,
  rotation: 0.9,
  first_team_competition: 1.08,
  important_player: 1.3,
  star_player: 1.55,
};

/** The sole salary expectation formula. Signed contracts deliberately do not call it again. */
export const evaluateExpectedMonthlySalary = (
  career: CareerState,
  club: ProfessionalClub,
  role: SquadRole,
) =>
  Math.round(
    ((800 +
      club.financialLevel * 30 +
      (5 - club.leagueTier) * 250 +
      career.player.reputation * 15 +
      getPlayerOverall(career.player, career.player.primaryPosition) * 12) *
      roleWeight[role]) /
      100,
  ) * 100;

/** Informational value used for compensation; no inter-club economy is simulated. */
export const estimatePlayerMarketValue = (
  career: CareerState,
  contractEnd = career.currentContract?.endDate,
) => {
  const ovr = getPlayerOverall(career.player, career.player.primaryPosition);
  const ageFactor = career.player.age <= 23 ? 1.35 : career.player.age <= 29 ? 1 : 0.65;
  const years = contractEnd
    ? Math.max(0, Number(contractEnd.slice(0, 4)) - career.currentSeason)
    : 0;
  return (
    Math.round(
      (Math.max(0, ovr - 35) ** 2 *
        950 *
        ageFactor *
        (1 + (career.player.potential - ovr) / 100) *
        (1 + Math.min(3, years) * 0.15)) /
        10000,
    ) * 10000
  );
};
