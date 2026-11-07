import { z } from 'zod';

export const bodyPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type BodyPoint = z.infer<typeof bodyPointSchema>;
export const articulatedBodySelectionSchema = z.literal('stance-foot-dev-v1');
export const articulatedStanceSchema = z.object({
  version: articulatedBodySelectionSchema,
  surface: z.enum(['firm-grass-dev-v1', 'reduced-grip-dev-v1']),
  support: z.enum(['left', 'right']).nullable(),
  supportYaw: z.number().finite(),
  left: bodyPointSchema.extend({ z: z.number().finite().min(0.035) }),
  right: bodyPointSchema.extend({ z: z.number().finite().min(0.035) }),
  elapsed: z.number().finite().min(0).max(0.175),
  angularVelocity: z.number().finite(),
});
export type ArticulatedStance = z.infer<typeof articulatedStanceSchema>;
