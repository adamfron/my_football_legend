import { z } from 'zod';
import { tacticalPointSchema, type TacticalFrame } from './model';

export const motionVectorSchema = z.object({
  playerId: z.string(),
  start: tacticalPointSchema,
  end: tacticalPointSchema,
  controlled: z.boolean(),
});
export type MotionVector = z.infer<typeof motionVectorSchema>;

/** Current observed velocity only. This projection never reads a player's planned target. */
export const projectMotionVectors = (frame: TacticalFrame): MotionVector[] => {
  if (!frame.showMotionVectors) return [];
  const controlled = frame.players.find((player) => player.protagonist);
  return frame.players
    .flatMap((player) => {
      const velocity = player.velocity;
      const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
      if (!velocity || !Number.isFinite(speed) || speed < 0.35) return [];
      const relevant =
        player.protagonist ||
        Math.hypot(player.x - frame.ball.x, player.y - frame.ball.y) <= 30 ||
        (controlled && Math.hypot(player.x - controlled.x, player.y - controlled.y) <= 30);
      if (!relevant) return [];
      const scale = Math.min(0.6, 4.5 / speed);
      return [
        {
          playerId: player.id,
          start: { x: player.x, y: player.y },
          end: {
            x: Math.max(0, Math.min(105, player.x + velocity.x * scale)),
            y: Math.max(0, Math.min(68, player.y + velocity.y * scale)),
          },
          controlled: Boolean(player.protagonist),
        },
      ];
    })
    .slice(0, 22);
};
