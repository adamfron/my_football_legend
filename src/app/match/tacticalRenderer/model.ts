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
  displayNumber: z.number().int().min(1).max(99).optional(),
  target: tacticalPointSchema.optional(),
  anchor: tacticalPointSchema.optional(),
  idealTarget: tacticalPointSchema.optional(),
});
export const tacticalBallSchema = tacticalPointSchema.extend({
  height: z.number().nonnegative().optional(),
  ownerId: z.string().optional(),
});
export const kitPresentationSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  accent: z.string(),
  shorts: z.string(),
  socks: z.string(),
  pattern: z.enum(['solid', 'vertical_stripes', 'halves', 'hoops', 'sash']),
  goalkeeper: z.object({ primary: z.string(), accent: z.string() }),
});
export type KitPresentation = z.infer<typeof kitPresentationSchema>;
export const DEFAULT_KITS: Record<'home' | 'away', KitPresentation> = {
  home: {
    primary: '#4da3ff',
    secondary: '#ffffff',
    accent: '#143b66',
    shorts: '#ffffff',
    socks: '#4da3ff',
    pattern: 'solid',
    goalkeeper: { primary: '#f0c84b', accent: '#181818' },
  },
  away: {
    primary: '#e7626c',
    secondary: '#ffffff',
    accent: '#5b1820',
    shorts: '#6d1720',
    socks: '#e7626c',
    pattern: 'solid',
    goalkeeper: { primary: '#7edb83', accent: '#181818' },
  },
};
export const tacticalFrameSchema = z.object({
  players: z.array(tacticalPlayerSchema),
  ball: tacticalBallSchema,
  timestampMs: z.number().nonnegative(),
  actionableTargets: z.array(z.string()).optional(),
  selectedTarget: z.string().optional(),
  interceptionTarget: tacticalPointSchema.optional(),
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
export const presentationTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), playerId: z.string() }),
  z.object({ kind: z.literal('pitch'), point: tacticalPointSchema }),
  z.object({ kind: z.literal('ball'), point: tacticalPointSchema }),
  z.object({ kind: z.literal('goal'), side: z.enum(['home', 'away']) }),
]);
export type PresentationTarget = z.infer<typeof presentationTargetSchema>;

export const PLAYER_LOCAL_FORWARD_AXIS = '+Z' as const;
export const playerAppearanceSchema = z.object({
  hairStyle: z.enum(['short', 'crop', 'side_part', 'buzz', 'curly_cap', 'bald']),
  hairColor: z.number().int().nonnegative(),
  skinColor: z.number().int().nonnegative(),
});
export type PlayerAppearance = z.infer<typeof playerAppearanceSchema>;

/** Stable presentation-only identity; it never consumes or changes simulation RNG. */
export const derivePlayerAppearance = (id: string): PlayerAppearance => {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const styles = ['short', 'crop', 'side_part', 'buzz', 'curly_cap', 'bald'] as const;
  const hairColors = [0x231a16, 0x4a3022, 0x8a633d, 0x181818];
  const skinColors = [0xf0c49a, 0xdca77f, 0xbd805d, 0x8b583e];
  const unsigned = hash >>> 0;
  return playerAppearanceSchema.parse({
    hairStyle: styles[unsigned % styles.length],
    hairColor: hairColors[(unsigned >>> 4) % hairColors.length],
    skinColor: skinColors[(unsigned >>> 8) % skinColors.length],
  });
};

export const validateRenderFrame = (frame: TacticalFrame): string | undefined => {
  for (const player of frame.players) {
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y))
      return `invalid player coordinate for ${player.id}`;
    for (const [name, point] of [
      ['target', player.target],
      ['anchor', player.anchor],
      ['ideal target', player.idealTarget],
    ] as const)
      if (point && (!Number.isFinite(point.x) || !Number.isFinite(point.y)))
        return `invalid player ${name} coordinate for ${player.id}`;
  }
  if (
    !Number.isFinite(frame.ball.x) ||
    !Number.isFinite(frame.ball.y) ||
    !Number.isFinite(frame.ball.height ?? 0)
  )
    return 'invalid ball coordinate';
  return undefined;
};

/** Canonical x (0..105) becomes world X; canonical y (0..68) becomes world Z. */
export const tacticalToWorld = (point: TacticalPoint, height = 0) => ({
  x: point.x - PITCH_LENGTH / 2,
  y: height,
  z: point.y - PITCH_WIDTH / 2,
});
export const worldToTactical = (point: { x: number; z: number }): TacticalPoint =>
  tacticalPointSchema.parse({ x: point.x + PITCH_LENGTH / 2, y: point.z + PITCH_WIDTH / 2 });

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
