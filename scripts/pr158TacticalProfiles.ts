import { z } from 'zod';
import { tacticalPreferencesSchema } from '../src/core/matchSimulation/tacticalPreferences';

export const pr158TacticalProfileSchema = z.object({
  id: z.enum([
    'neutral',
    'organised_high_press',
    'immediate_counterpress',
    'patient_midblock',
    'compact_direct',
  ]),
  style: z.enum(['balanced', 'possession', 'direct', 'counter_attacking', 'pressing']),
  preferences: tacticalPreferencesSchema,
});
export type Pr158TacticalProfile = z.infer<typeof pr158TacticalProfileSchema>;
export const PR158_TACTICAL_PROFILES: Pr158TacticalProfile[] = z
  .array(pr158TacticalProfileSchema)
  .parse([
    {
      id: 'neutral',
      style: 'balanced',
      preferences: {
        blockHeight: 0.5,
        organisedPress: 0.5,
        counterpress: 0.5,
        compactness: 0.5,
        possessionPatience: 0.5,
        verticality: 0.5,
      },
    },
    {
      id: 'organised_high_press',
      style: 'pressing',
      preferences: {
        blockHeight: 0.78,
        organisedPress: 0.93,
        counterpress: 0.45,
        compactness: 0.76,
        possessionPatience: 0.45,
        verticality: 0.65,
      },
    },
    {
      id: 'immediate_counterpress',
      style: 'pressing',
      preferences: {
        blockHeight: 0.6,
        organisedPress: 0.55,
        counterpress: 0.96,
        compactness: 0.74,
        possessionPatience: 0.38,
        verticality: 0.82,
      },
    },
    {
      id: 'patient_midblock',
      style: 'possession',
      preferences: {
        blockHeight: 0.42,
        organisedPress: 0.36,
        counterpress: 0.48,
        compactness: 0.78,
        possessionPatience: 0.92,
        verticality: 0.28,
      },
    },
    {
      id: 'compact_direct',
      style: 'counter_attacking',
      preferences: {
        blockHeight: 0.26,
        organisedPress: 0.24,
        counterpress: 0.18,
        compactness: 0.92,
        possessionPatience: 0.32,
        verticality: 0.94,
      },
    },
  ]);
