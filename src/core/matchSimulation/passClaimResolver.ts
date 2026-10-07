import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { canContactAfterThrowIn } from './throwIn';

export const GROUND_PASS_CONTROL_RADIUS = 2.2;
export const groundPassClaimSchema = z.object({
  landingPosition: pitchPointSchema,
  playerId: z.string().optional(),
  cause: z.enum(['claim', 'interception']).optional(),
});
export type GroundPassClaim = z.infer<typeof groundPassClaimSchema>;

export const continuousGroundPassClaimSchema = groundPassClaimSchema.extend({
  segmentFraction: z.number().min(0).max(1),
  contactMargin: z.number().min(0).max(1),
});
export type ContinuousGroundPassClaim = z.infer<typeof continuousGroundPassClaimSchema>;

/** Earliest player contact on this fixed-step segment, ordered alongside boundary crossings. */
export const resolveContinuousGroundPassClaim = (
  state: TacticalMatchState,
  from: PitchPoint & { z?: number },
  to: PitchPoint & { z?: number },
  controlRadius = 1.05,
): ContinuousGroundPassClaim | undefined => {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-8) return undefined;
  // Low airborne deliveries have the same physical foot-control envelope as rolling
  // passes. Restrict the segment itself, so an earlier high portion cannot win contact.
  const fromHeight = from.z ?? 0,
    toHeight = to.z ?? 0;
  if (Math.min(fromHeight, toHeight) > 0.65) return undefined;
  const lowStart = fromHeight > 0.65 ? (fromHeight - 0.65) / (fromHeight - toHeight) : 0;
  const lowEnd = toHeight > 0.65 ? (0.65 - fromHeight) / (toHeight - fromHeight) : 1;
  const passer = state.players.find((player) => player.id === state.currentActorId);
  return state.players
    .filter((player) => player.id !== passer?.id && canContactAfterThrowIn(state, player.id))
    .map((player) => {
      const segmentFraction = Math.max(
        lowStart,
        Math.min(
          lowEnd,
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
    .map(({ player, point, segmentFraction, metres }) => ({
      landingPosition: point,
      playerId: player.id,
      cause: player.team === passer?.team ? ('claim' as const) : ('interception' as const),
      segmentFraction,
      contactMargin: Math.max(0, 1 - metres / controlRadius),
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
    .filter((player) => player.id !== passer?.id && canContactAfterThrowIn(state, player.id))
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
