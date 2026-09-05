import type { CareerState } from '../types/domain';
import { getExpectedSquadRole, getPlayerClubLevelDelta } from './clubStrength';
import { evaluateExpectedMonthlySalary } from './playerEconomy';
import { RandomGenerator } from './random/RandomGenerator';

export const requestContractRenegotiation = (career: CareerState): CareerState => {
  const renewalOffer = career.professionalOffers?.find((offer) => offer.offerType === 'renewal');
  const contract = renewalOffer?.contract ?? career.currentContract;
  const club = career.currentProfessionalClub;
  if (
    !contract ||
    !club ||
    contract.endDate < (career.currentDate ?? `${career.currentSeason}-07-01`) ||
    career.renegotiation?.season === career.currentSeason
  )
    return career;
  const appearances = (career.seasonParticipation ?? []).filter((item) => item.minutes > 0);
  const role = getExpectedSquadRole(career, club);
  const remainingYears = Math.max(0, Number(contract.endDate.slice(0, 4)) - career.currentSeason);
  const score =
    45 +
    getPlayerClubLevelDelta(career, club) * 1.5 +
    appearances.length * 0.8 +
    career.player.reputation * 0.15 +
    (club.financialLevel - 50) * 0.25 -
    remainingYears * 5 +
    RandomGenerator.fromSeed(`${career.seed}:renegotiation:${career.currentSeason}`).int(-18, 18);
  const result = score >= 60 ? 'accepted' : score >= 43 ? 'conditional' : 'rejected';
  if (result === 'rejected')
    return { ...career, renegotiation: { season: career.currentSeason, result } };
  const salary = Math.max(
    contract.monthlySalary,
    evaluateExpectedMonthlySalary({
      player: career.player,
      club,
      role,
      date: career.currentDate ?? `${career.currentSeason}-07-01`,
      reputation: career.player.reputation,
    }),
  );
  const proposedContract = {
    ...contract,
    monthlySalary: salary,
    squadRole: role,
    ...(result === 'conditional' ? { endDate: `${career.currentSeason + 3}-06-30` } : {}),
  };
  return { ...career, renegotiation: { season: career.currentSeason, result, proposedContract } };
};

export const acceptRenegotiatedContract = (career: CareerState): CareerState => {
  const proposal = career.renegotiation?.proposedContract;
  return proposal
    ? {
        ...career,
        currentContract: proposal,
        currentSportingStatus: career.currentProfessionalClub
          ? getExpectedSquadRole(career, career.currentProfessionalClub)
          : career.currentSportingStatus,
        renegotiation: { ...career.renegotiation!, proposedContract: undefined },
      }
    : career;
};
