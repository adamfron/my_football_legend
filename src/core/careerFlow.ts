import type { CareerState } from '../types/domain';
import { initializeCurrentCareerWeek } from './careerWeeks';
import { generateProfessionalOffers, generateSummerWindowOffers } from './professionalClubs';
import { initializeCareerSeason } from './careerSeasons';
import { initializeSeasonParticipation } from './seasonParticipation';
import { recordSeasonAchievements } from './narrative/careerEvidence';

/** Advances only decision-free transitions in the canonical career lifecycle. */
export const advanceCareerFlow = (career: CareerState): CareerState => {
  if ((career.careerStatus ?? 'active') === 'retired') return career;
  // Also repair an already-open summer window loaded from an older save.
  // A stale salary proposal must not hide the current club's valid renewal.
  if (
    career.seasonOutcome &&
    career.renegotiation?.proposedContract &&
    career.renegotiation.proposedContract.startDate !== `${career.currentSeason + 1}-07-01`
  )
    career = { ...career, renegotiation: undefined };
  career = recordSeasonAchievements(career);
  if (career.seasonOutcome && career.player.age >= 40)
    return { ...career, careerPhase: 'offseason', professionalOffers: undefined };
  if (career.seasonOutcome && career.professionalOffers === undefined) {
    return {
      ...career,
      careerPhase: 'summer_window',
      // An in-season salary proposal carries the old contract start. It is not a summer renewal.
      // Retire that proposal at the boundary so the displayed renewal can be negotiated afresh.
      renegotiation:
        career.renegotiation?.proposedContract?.startDate !==
        String(career.currentSeason + 1) + '-07-01'
          ? undefined
          : career.renegotiation,
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
