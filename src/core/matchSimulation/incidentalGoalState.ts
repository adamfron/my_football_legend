import { z } from 'zod';
export const incidentalGoalFactSchema = z.object({
  id: z.string(),
  at: z.number().nonnegative(),
  scoringTeam: z.enum(['home', 'away']),
  lastTouchPlayerId: z.string().nullable(),
  creditedPlayerId: z.string().nullable(),
  ownGoalPlayerId: z.string().nullable(),
  point: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  classification: z.literal('goal_without_intentional_shot'),
});
