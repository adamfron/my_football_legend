import { z } from 'zod';
import { pitchPointSchema } from './matchSpace';

/** One local opportunity, at most three footballers and two physical releases. */
export const combinationIntentSchema = z.object({
  id: z.string(),
  team: z.enum(['home', 'away']),
  kind: z.enum(['pass_and_go', 'third_man', 'overlap', 'underlap']),
  initiatorId: z.string(),
  partnerId: z.string(),
  runnerId: z.string(),
  firstPassId: z.string(),
  continuationPassId: z.string().optional(),
  startedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  origin: pitchPointSchema,
  target: pitchPointSchema,
  phase: z.enum(['first_flight', 'available', 'continuation_flight']),
  firstCompletedAt: z.number().nonnegative().optional(),
  runStartedAt: z.number().nonnegative().optional(),
  runMetres: z.number().nonnegative(),
});
export type CombinationIntent = z.infer<typeof combinationIntentSchema>;
export const combinationResultSchema = combinationIntentSchema.extend({
  endedAt: z.number().nonnegative(),
  result: z.enum([
    'completed',
    'expired',
    'possession_lost',
    'contact_failed',
    'participant_unavailable',
    'unreachable',
    'restart',
    'human_command',
    'alternative_selected',
  ]),
});
export type CombinationResult = z.infer<typeof combinationResultSchema>;
