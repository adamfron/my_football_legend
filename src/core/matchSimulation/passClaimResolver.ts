import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { TacticalMatchState } from './matchState';

export const GROUND_PASS_CONTROL_RADIUS = 2.2;
export const groundPassClaimSchema = z.object({
  landingPosition: pitchPointSchema,
  playerId: z.string().optional(),
  cause: z.enum(['claim', 'interception']).optional(),
});
export type GroundPassClaim = z.infer<typeof groundPassClaimSchema>;

export interface ContinuousGroundPassClaim extends GroundPassClaim {
  segmentFraction: number;
}

/** Earliest player contact on this fixed-step segment, ordered alongside boundary crossings. */
export const resolveContinuousGroundPassClaim = (
  state: TacticalMatchState,
  from: PitchPoint,
  to: PitchPoint,
  controlRadius = 1.05,
): ContinuousGroundPassClaim | undefined => {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-8) return undefined;
  const passer = state.players.find((player) => player.id === state.currentActorId);
  return state.players
    .filter((player) => player.id !== passer?.id)
    .map((player) => {
      const segmentFraction = Math.max(
        0,
        Math.min(
          1,
          ((player.position.x - from.x) * dx + (player.position.y - from.y) * dy) / lengthSquared,
        ),
      );
      const point = { x: from.x + dx * segmentFraction, y: from.y + dy * segmentFraction };
      return { player, point, segmentFraction, metres: distance(player.position, point) };
    })
    .filter(({ metres, segmentFraction }) => metres <= controlRadius && segmentFraction > 0.001)
    .sort(
      (a, b) =>
        a.segmentFraction - b.segmentFraction ||
        a.metres - b.metres ||
        a.player.id.localeCompare(b.player.id),
    )
    .map(({ player, point, segmentFraction }) => ({
      landingPosition: point,
      playerId: player.id,
      cause: player.team === passer?.team ? ('claim' as const) : ('interception' as const),
      segmentFraction,
    }))[0];
};

/** Resolves contact at the physical landing point; intended targets receive no magnetic privilege. */
export const resolveGroundPassClaim = (
  state: TacticalMatchState,
  landingPosition: PitchPoint,
  controlRadius = GROUND_PASS_CONTROL_RADIUS,
): GroundPassClaim => {
  const passer = state.players.find((player) => player.id === state.currentActorId);
  const candidate = state.players
    .filter((player) => player.id !== passer?.id)
    .map((player) => ({ player, metres: distance(player.position, landingPosition) }))
    .filter(({ metres }) => metres <= controlRadius)
    .sort((a, b) => a.metres - b.metres || a.player.id.localeCompare(b.player.id))[0];
  return groundPassClaimSchema.parse({
    landingPosition: { ...landingPosition },
    ...(candidate
      ? {
          playerId: candidate.player.id,
          cause:
            candidate.player.team === passer?.team ? ('claim' as const) : ('interception' as const),
        }
      : {}),
  });
};
