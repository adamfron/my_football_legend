import { z } from 'zod';
import { pitchPointSchema } from './matchSpace';
export const receptionContinuationSchema = z.object({
  target: pitchPointSchema,
  mode: z.enum(['carry', 'sprint', 'dribble', 'retain']),
  createdAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  incomingVelocity: z.object({ x: z.number().finite(), y: z.number().finite() }),
});
export const runOnReceptionSchema = z.object({
  target: pitchPointSchema,
  contactAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
});
