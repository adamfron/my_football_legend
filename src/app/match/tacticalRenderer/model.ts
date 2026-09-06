import { z } from 'zod';

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

export const tacticalPointSchema = z.object({
  x: z.number().min(0).max(PITCH_LENGTH),
  y: z.number().min(0).max(PITCH_WIDTH),
});
export const tacticalPlayerSchema = tacticalPointSchema.extend({
  id: z.string().min(1),
  team: z.enum(['home', 'away']),
  facing: z.number().optional(),
  protagonist: z.boolean().optional(),
  goalkeeper: z.boolean().optional(),
});
export const tacticalBallSchema = tacticalPointSchema.extend({
  height: z.number().nonnegative().optional(),
  ownerId: z.string().optional(),
});
export const tacticalFrameSchema = z.object({
  players: z.array(tacticalPlayerSchema),
  ball: tacticalBallSchema,
  timestampMs: z.number().nonnegative(),
});
export const tacticalSequenceSchema = z.object({
  id: z.string().min(1),
  durationMs: z.number().positive(),
  frames: z.array(tacticalFrameSchema).min(2),
  result: z.string().optional(),
});

export type TacticalPoint = z.infer<typeof tacticalPointSchema>;
export type TacticalPlayer = z.infer<typeof tacticalPlayerSchema>;
export type TacticalBall = z.infer<typeof tacticalBallSchema>;
export type TacticalFrame = z.infer<typeof tacticalFrameSchema>;
export type TacticalSequence = z.infer<typeof tacticalSequenceSchema>;

/** Canonical x (0..105) becomes world X; canonical y (0..68) becomes world Z. */
export const tacticalToWorld = (point: TacticalPoint, height = 0) => ({
  x: point.x - PITCH_LENGTH / 2,
  y: height,
  z: point.y - PITCH_WIDTH / 2,
});

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export const interpolateFrame = (sequence: TacticalSequence, elapsedMs: number): TacticalFrame => {
  const first = sequence.frames[0]!;
  const last = sequence.frames.at(-1)!;
  if (elapsedMs <= first.timestampMs) return first;
  if (elapsedMs >= last.timestampMs) return last;
  const nextIndex = sequence.frames.findIndex((frame) => frame.timestampMs >= elapsedMs);
  const next = sequence.frames[nextIndex]!;
  if (elapsedMs === next.timestampMs) return next;
  const previous = sequence.frames[nextIndex - 1]!;
  const t = (elapsedMs - previous.timestampMs) / (next.timestampMs - previous.timestampMs);
  const nextPlayers = new Map(next.players.map((player) => [player.id, player]));
  return {
    timestampMs: elapsedMs,
    players: previous.players.map((player) => {
      const target = nextPlayers.get(player.id) ?? player;
      return {
        ...player,
        ...target,
        x: lerp(player.x, target.x, t),
        y: lerp(player.y, target.y, t),
      };
    }),
    ball: {
      ...previous.ball,
      ...next.ball,
      x: lerp(previous.ball.x, next.ball.x, t),
      y: lerp(previous.ball.y, next.ball.y, t),
      height: lerp(previous.ball.height ?? 0, next.ball.height ?? 0, t),
    },
  };
};

export const finalFrame = (sequence: TacticalSequence) =>
  interpolateFrame(sequence, sequence.durationMs);
