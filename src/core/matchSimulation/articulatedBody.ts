import { z } from 'zod';
import { bodyPointSchema } from './articulatedBodyState';
import { lowerBodyGeometrySchema, deriveLowerBodyGeometry } from './lowerBodyGeometry';
import { canonicalStrikeFoot } from './pendingStrike';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

/** Derived observer contract. No repeated joint history is added to match saves. */
export const articulatedBodySchema = z.object({
  version: z.literal('articulated-body-dev-v1'),
  at: z.number().finite().nonnegative(),
  root: bodyPointSchema,
  facing: z.number().finite(),
  angularVelocity: z.number().finite(),
  torsoOrientation: z.object({ yaw: z.number().finite(), pitch: z.literal(0), roll: z.literal(0) }),
  activeLeg: z.enum(['left', 'right']),
  support: z.enum(['left', 'right']).nullable(),
  height: z.number().finite().positive(),
  mass: z.number().finite().positive(),
  bootRadius: z.literal(0.035),
  bootYaw: z.object({ left: z.number().finite(), right: z.number().finite() }),
  geometry: lowerBodyGeometrySchema,
});
export type ArticulatedBody = z.infer<typeof articulatedBodySchema>;

export const projectArticulatedBody = (
  state: TacticalMatchState,
  player: MatchPlayerState,
): ArticulatedBody | undefined => {
  if (!state.experimentalArticulatedBody || !player.articulatedStance) return undefined;
  const feet = (['left', 'right'] as const).map((foot) => {
    const pending =
      state.pendingStrike?.actorId === player.id && state.pendingStrike.plan.foot === foot
        ? state.pendingStrike
        : undefined;
    const challenge =
      state.defensiveChallenge?.actorId === player.id &&
      state.defensiveChallenge.physicalAttempt?.plan.foot === foot
        ? state.defensiveChallenge.physicalAttempt
        : undefined;
    const latch = state.continuousFootContacts?.find(
      (c) => c.actorId === player.id && c.foot === foot,
    )?.prepared;
    return canonicalStrikeFoot(
      pending ??
        challenge ??
        (latch
          ? {
              path: latch.path,
              selectedAt: latch.selectedAt,
              plan: { facingAngle: latch.facingAngle },
            }
          : undefined),
      player,
      player,
      foot,
      state.time,
      0.025,
      0,
      state.recoveringFeet?.find((f) => f.actorId === player.id && f.foot === foot),
    );
  });
  if (feet.some((f) => f.reachable === false)) return undefined;
  const geometry = deriveLowerBodyGeometry(player, {
    left: feet[0]!.position,
    right: feet[1]!.position,
  });
  return {
    version: 'articulated-body-dev-v1',
    at: state.time,
    root: { ...player.position, z: player.verticalJump?.height ?? 0 },
    facing: player.facingAngle,
    angularVelocity: player.articulatedStance.angularVelocity,
    torsoOrientation: { yaw: player.facingAngle, pitch: 0, roll: 0 },
    activeLeg:
      state.pendingStrike?.actorId === player.id
        ? state.pendingStrike.plan.foot
        : ((state.defensiveChallenge?.actorId === player.id
            ? state.defensiveChallenge.physicalAttempt?.plan.foot
            : undefined) ??
          state.recoveringFeet?.find((f) => f.actorId === player.id)?.foot ??
          state.continuousFootContacts?.find((c) => c.actorId === player.id && c.prepared)?.foot ??
          player.lowerBodyPose?.activeLeg ??
          player.profile.dominantFoot),
    support: player.articulatedStance.support,
    height: Math.max(1.4, Math.min(2.2, player.profile.heightCm / 100)),
    mass: player.profile.weightKg,
    bootRadius: 0.035,
    geometry,
    bootYaw: {
      left:
        player.articulatedStance.support === 'left'
          ? player.articulatedStance.supportYaw
          : player.facingAngle,
      right:
        player.articulatedStance.support === 'right'
          ? player.articulatedStance.supportYaw
          : player.facingAngle,
    },
  };
};
