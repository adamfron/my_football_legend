import { z } from 'zod';
import type { TacticalMatchState } from './matchState';

const vector = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
export const matchSafetyHaltSchema = z.object({
  kind: z.enum(['physical_contact', 'restart_lifecycle', 'loose_ball_lifecycle']),
  reason: z.string().max(180),
  at: z.number().nonnegative(),
  intervalStartedAt: z.number().nonnegative(),
  actorIds: z.array(z.string()).max(24),
  ball: vector,
  velocity: vector,
  spin: vector.optional(),
  foot: vector.optional(),
  footVelocity: vector.optional(),
  footRadius: z.number().positive().optional(),
  ballRadius: z.number().positive().optional(),
  gap: z.number().finite().optional(),
  relativeClosingSpeed: z.number().finite().optional(),
  actionId: z.string().optional(),
});
export type MatchSafetyHalt = z.infer<typeof matchSafetyHaltSchema>;

/** An explicit integration failure owns a reproducible snapshot, never a football result. */
export const haltEvidence = (
  state: TacticalMatchState,
  kind: MatchSafetyHalt['kind'],
  reason: string,
  intervalStartedAt = state.time,
): MatchSafetyHalt => ({
  kind,
  reason,
  at: state.time,
  intervalStartedAt,
  actorIds: [],
  ball: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 },
  velocity: {
    x: state.ball.velocity?.x ?? 0,
    y: state.ball.velocity?.y ?? 0,
    z: state.ball.velocity?.z ?? 0,
  },
  ...(state.ball.spin ? { spin: state.ball.spin } : {}),
});
