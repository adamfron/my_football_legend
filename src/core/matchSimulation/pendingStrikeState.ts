import { z } from 'zod';
import { kickPerturbationSchema, kickVectorSchema } from './kickExecutionState';
import { footContactExecutionSchema } from './footContact';
import { temporalStrikePlanSchema, temporalFootPathSchema } from './temporalFootStrike';

export const pendingStrikeSelectionSchema = z.literal('low-pass-dev-v1');
export const pendingStrikeFields = {
  version: pendingStrikeSelectionSchema,
  id: z.string(),
  actorId: z.string(),
  ballEpisode: z.number().int().nonnegative(),
  initialLastTouch: z.string().optional(),
  selectedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  phase: z.enum(['preparing', 'swinging']),
  plan: temporalStrikePlanSchema,
  path: temporalFootPathSchema,
  perturbation: kickPerturbationSchema,
};
export const strikeResolutionSchema = z.object({
  version: pendingStrikeSelectionSchema,
  id: z.string(),
  actorId: z.string(),
  ballEpisode: z.number().int().nonnegative(),
  selectedAt: z.number().nonnegative(),
  intendedContactAt: z.number().nonnegative(),
  at: z.number().nonnegative(),
  outcome: z.enum(['contact', 'miss', 'interrupted', 'cancelled', 'unresolved']),
  reason: z.string(),
  firstEvent: z.string(),
  evaluations: z.number().int().nonnegative(),
  continuationUnresolvedReason: z.string().optional(),
  contact: footContactExecutionSchema.optional(),
  foot: kickVectorSchema.optional(),
  footVelocity: kickVectorSchema.optional(),
});
export type StrikeResolution = z.infer<typeof strikeResolutionSchema>;
