import type { CareerState } from '../types/domain';
import { initializeCurrentCareerWeek } from './careerWeeks';
import { generateProfessionalOffers, generateSummerWindowOffers } from './professionalClubs';
import { initializeCareerSeason } from './careerSeasons';

const hasFact = (career: CareerState, factType: string) =>
  career.historyFacts.some((fact) => fact.factType === factType);

/**
 * Advances only phases which do not require an explicit player decision.
 * The persisted facts remain the source of truth, so calling this repeatedly is safe.
 */
export const advanceCareerFlow = (career: CareerState): CareerState => {
  if ((career.careerStatus ?? 'active') === 'retired') return career;
  if (career.seasonOutcome && career.player.age >= 40)
    return { ...career, careerPhase: 'offseason', professionalOffers: undefined };
  if (
    career.seasonOutcome?.competitionType === 'professional' &&
    career.professionalOffers === undefined
  )
    return {
      ...career,
      careerPhase: 'summer_window',
      currentDate: career.leagueSeason?.endDate ?? career.currentDate,
      professionalOffers: generateSummerWindowOffers(career),
    };
  if (
    career.seasonOutcome?.competitionType === 'academy' &&
    career.professionalOffers === undefined
  )
    return {
      ...career,
      careerPhase: 'summer_window',
      professionalOffers: generateProfessionalOffers(career),
    };
  if (!career.leagueSeason)
    return initializeCareerSeason(career, {
      startYear: 2026,
      careerSeasonNumber: 1,
      club: career.currentClub,
      professional: false,
    });
  if (career.activeEvent) return career;

  if (hasFact(career, 'september_2026_completed')) return initializeCurrentCareerWeek(career);

  // August deliberately starts from the player's explicit action. Once it exists,
  // its planner (including the completed state) is already the canonical phase state.
  return career;
};
