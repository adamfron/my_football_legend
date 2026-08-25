import type { CareerState } from '../types/domain';
import { hasCompletedAcademyArc, initializeAcademyArc } from './events/academyArc';
import { initializePostSelectionPath, POST_PATH_COMPLETED } from './events/postSelectionPath';
import { initializeCurrentCareerWeek } from './careerWeeks';

const hasFact = (career: CareerState, factType: string) =>
  career.historyFacts.some((fact) => fact.factType === factType);

/**
 * Advances only phases which do not require an explicit player decision.
 * The persisted facts remain the source of truth, so calling this repeatedly is safe.
 */
export const advanceCareerFlow = (career: CareerState): CareerState => {
  if (career.activeEvent) return career;

  if (!hasCompletedAcademyArc(career)) return initializeAcademyArc(career);

  if (!hasFact(career, 'academy_selection_result')) return career;

  if (!hasFact(career, POST_PATH_COMPLETED)) return initializePostSelectionPath(career);

  if (hasFact(career, 'september_2026_completed')) return initializeCurrentCareerWeek(career);

  // August deliberately starts from the player's explicit action. Once it exists,
  // its planner (including the completed state) is already the canonical phase state.
  return career;
};
