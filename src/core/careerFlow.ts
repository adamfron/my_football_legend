import type { CareerState } from '../types/domain';
import { initializeCurrentCareerWeek } from './careerWeeks';
import { generateProfessionalOffers, generateSummerWindowOffers } from './professionalClubs';
import { initializeCareerSeason } from './careerSeasons';
import { initializeSeasonParticipation } from './seasonParticipation';
import { processYouthGraduation } from './youthGraduation';

/** Advances only decision-free transitions in the canonical career lifecycle. */
export const advanceCareerFlow = (career: CareerState): CareerState => {
  if ((career.careerStatus ?? 'active') === 'retired') return career;
  if (career.seasonOutcome && career.player.age >= 40)
    return { ...career, careerPhase: 'offseason', professionalOffers: undefined };
  if (career.seasonOutcome && career.professionalOffers === undefined) {
    const transitioned =
      career.seasonOutcome.competitionType === 'academy'
        ? processYouthGraduation(career).career
        : career;
    return {
      ...transitioned,
      careerPhase: 'summer_window',
      currentDate: transitioned.leagueSeason?.endDate ?? transitioned.currentDate,
      professionalOffers:
        transitioned.seasonOutcome!.competitionType === 'professional'
          ? generateSummerWindowOffers(transitioned)
          : generateProfessionalOffers(transitioned),
    };
  }
  if (!career.leagueSeason)
    return initializeCareerSeason(career, {
      startYear: career.currentSeason,
      careerSeasonNumber: career.careerSeasonNumber,
      club: career.currentClub,
      professional: career.careerSeasonNumber > 1,
    });
  const repaired = initializeSeasonParticipation(career);
  if (repaired.activeEvent) return repaired;
  return initializeCurrentCareerWeek(repaired);
};
