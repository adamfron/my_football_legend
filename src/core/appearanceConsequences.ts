import type { CareerState, MatchAppearance } from '../types/domain';
import { applyDevelopmentCheckpoint } from './development';

/** Applies domain consequences shared by every completed player appearance. */
export const applyAppearanceConsequences = (
  career: CareerState,
  appearance: MatchAppearance,
): CareerState => applyDevelopmentCheckpoint(career, appearance);
