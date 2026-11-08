import { z } from 'zod';
import type { TacticalMatchState } from './matchState';

/** One action-foot selection shared by support and observation, including a
 * still-latched prepared foot after the action itself has resolved. */
export const activeArticulatedFoot = (state: TacticalMatchState, actorId: string) =>
  (state.pendingStrike?.actorId === actorId ? state.pendingStrike.plan.foot : undefined) ??
  (state.defensiveChallenge?.actorId === actorId
    ? state.defensiveChallenge.physicalAttempt?.plan.foot
    : undefined) ??
  state.recoveringFeet?.find((f) => f.actorId === actorId)?.foot ??
  state.continuousFootContacts?.find((c) => c.actorId === actorId && c.prepared)?.foot;

export const bodyPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type BodyPoint = z.infer<typeof bodyPointSchema>;
export const articulatedBodySelectionSchema = z.literal('stance-foot-dev-v2');
export const articulatedStanceSchema = z.object({
  version: articulatedBodySelectionSchema,
  surface: z.enum(['firm-grass-dev-v1', 'reduced-grip-dev-v1']),
  support: z.enum(['left', 'right']).nullable(),
  supportYaw: z.number().finite(),
  left: bodyPointSchema.extend({ z: z.number().finite().min(0.035) }),
  right: bodyPointSchema.extend({ z: z.number().finite().min(0.035) }),
  elapsed: z.number().finite().min(0).max(0.175),
  stepSeconds: z.number().finite().min(0.05).max(0.175),
  angularVelocity: z.number().finite(),
});
export type ArticulatedStance = z.infer<typeof articulatedStanceSchema>;
