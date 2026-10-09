import { z } from 'zod';

/** Techniques are independent of contact: a first-time finish can be driven or placed. */
export const shotIntentSchema = z.enum(['driven', 'placed', 'chip']);
export const freeKickStrikeProfileSchema = z.enum([
  'power_bend',
  'controlled_curl',
  'dipping',
  'under_wall',
  'wall_gap',
]);
export type FreeKickStrikeProfile = z.infer<typeof freeKickStrikeProfileSchema>;
export const footShotContactSchema = z.enum(['settled', 'first_time', 'half_volley', 'volley']);
export const shotContactSchema = z.enum([
  'settled',
  'first_time',
  'half_volley',
  'volley',
  'header',
]);
export const shotExecutionProfileSchema = z.object({
  intent: z.enum(['driven', 'placed', 'chip', 'header']),
  contact: shotContactSchema,
  nominalSpeed: z.number().positive(),
  errorMultiplier: z.number().positive(),
  pressureSensitivity: z.number().nonnegative(),
  preparationSeconds: z.number().nonnegative(),
  firstTimeDifficulty: z.number().nonnegative(),
  orientationDifficulty: z.number().min(0).max(1),
  dominantFootDifficulty: z.number().min(0).max(1),
  minimumVerticalSpeed: z.number().nonnegative(),
});
export type ShotExecutionProfile = z.infer<typeof shotExecutionProfileSchema>;

/** Target-plane standard deviations use goal half-width / goal-height normalised coordinates. */
export const shotExecutionErrorProfileSchema = z.object({
  executionQuality: z.number().min(0).max(1),
  horizontalSigma: z.number().positive(),
  verticalSigma: z.number().positive(),
  distanceDifficulty: z.number().nonnegative(),
  angleDifficulty: z.number().min(0).max(1),
  pressureDifficulty: z.number().min(0).max(1),
  contactDifficulty: z.number().nonnegative(),
  orientationDifficulty: z.number().min(0).max(1),
  weakFootDifficulty: z.number().min(0).max(1),
  // Optional for snapshots predating PR157; all new shots include these continuous demands.
  intrinsicDifficulty: z.number().nonnegative().optional(),
  horizontalSigmaMetres: z.number().positive().optional(),
  verticalSigmaMetres: z.number().positive().optional(),
  ballMovementDifficulty: z.number().nonnegative().optional(),
  ballHeightDifficulty: z.number().nonnegative().optional(),
  targetWindowDifficulty: z.number().min(0).max(1).optional(),
  blockerDifficulty: z.number().min(0).max(1).optional(),
});
export type ShotExecutionErrorProfile = z.infer<typeof shotExecutionErrorProfileSchema>;

export const shotPreparationSeconds = (
  intent: 'driven' | 'placed' | 'chip' | 'header',
  contact: z.infer<typeof shotContactSchema>,
) => (contact !== 'settled' ? 0 : intent === 'placed' ? 0.28 : intent === 'driven' ? 0.2 : 0.24);

// Free-kick profiles author launch energy and spin in the shared solver, independently of contact.
// Outside-foot, toe-poke and improvised contacts remain outside the implemented technique family.
