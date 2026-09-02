import type { CareerState } from '../types/domain';
import { initializeCurrentCareerWeek } from './careerWeeks';
import { generateProfessionalOffers, generateSummerWindowOffers } from './professionalClubs';
import { initializeCareerSeason } from './careerSeasons';
import { initializeSeasonParticipation } from './seasonParticipation';

/** Advances only decision-free transitions in the canonical career lifecycle. */
export const advanceCareerFlow = (career: CareerState): CareerState => {
  if ((career.careerStatus ?? 'active') === 'retired') return career;
  if (career.seasonOutcome && career.player.age >= 40)
    return { ...career, careerPhase: 'offseason', professionalOffers: undefined };
  if (career.seasonOutcome && career.professionalOffers === undefined) {
    return {
      ...career,
      careerPhase: 'summer_window',
      currentDate: career.leagueSeason?.endDate ?? career.currentDate,
      professionalOffers:
        career.seasonOutcome.competitionType === 'professional'
          ? generateSummerWindowOffers(career)
          : generateProfessionalOffers(career),
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
