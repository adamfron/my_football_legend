import type { CoachProfile } from '../types/domain';
import {
  TACTICAL_PREFERENCE_DEFAULTS,
  tacticalPreferencesSchema,
} from './matchSimulation/tacticalPreferences';

/** Existing physical tactical axes, with small stable differences within each philosophy. */
export const deriveCoachTacticalPreferences = (coach: CoachProfile) => {
  const base = TACTICAL_PREFERENCE_DEFAULTS[coach.tacticalStyle];
  const shift = (value: number) => Math.max(0, Math.min(1, value));
  return tacticalPreferencesSchema.parse({
    ...base,
    organisedPress: shift(base.organisedPress + (coach.rotationPreference - 55) / 700),
    compactness: shift(base.compactness + (coach.experiencePreference - 55) / 900),
    possessionPatience: shift(base.possessionPatience + (coach.formPatience - 55) / 800),
    verticality: shift(base.verticality + (coach.adaptability - 55) / 900),
  });
};
