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
