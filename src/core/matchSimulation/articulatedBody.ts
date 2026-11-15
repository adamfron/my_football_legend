import { z } from 'zod';
import { activeArticulatedFoot, bodyPointSchema } from './articulatedBodyState';
import { lowerBodyGeometrySchema, deriveLowerBodyGeometry } from './lowerBodyGeometry';
import { canonicalStrikeFoot } from './pendingStrike';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

/** Derived observer contract. No repeated joint history is added to match saves. */
export const articulatedBodySchema = z.object({
  version: z.literal('articulated-body-dev-v2'),
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
  jointLimits: z.object({ left: z.boolean(), right: z.boolean() }).optional(),
});
export type ArticulatedBody = z.infer<typeof articulatedBodySchema>;

type Foot = 'left' | 'right';
export const effectiveArticulatedFoot = (
  state: TacticalMatchState,
  before: MatchPlayerState,
  after: MatchPlayerState,
  foot: Foot,
  intervalAt: number,
  seconds: number,
  local: number,
) => {
  const pending = state.pendingStrike;
  const challenge = state.defensiveChallenge;
  const latch = state.continuousFootContacts?.find(
    (c) => c.actorId === after.id && c.foot === foot,
  )?.prepared;
  return canonicalStrikeFoot(
    pending?.actorId === after.id && pending.plan.foot === foot
      ? pending
      : challenge?.actorId === after.id && challenge.physicalAttempt?.plan.foot === foot
        ? challenge.physicalAttempt
        : latch && {
            path: latch.path,
            selectedAt: latch.selectedAt,
            plan: { facingAngle: latch.facingAngle },
          },
    before,
    after,
    foot,
    intervalAt,
    seconds,
    local,
    state.recoveringFeet?.find((f) => f.actorId === after.id && f.foot === foot),
  );
};

export const composeArticulatedLegs = (
  player: MatchPlayerState,
  left: ReturnType<typeof canonicalStrikeFoot>,
  right: ReturnType<typeof canonicalStrikeFoot>,
) => {
  if (left.reachable === false || right.reachable === false) return;
  try {
    return deriveLowerBodyGeometry(player, { left: left.position, right: right.position });
  } catch {
    // Both action paths can be individually viable and still fail at a shared pelvis.
    return;
  }
};

export const projectArticulatedBody = (
  state: TacticalMatchState,
  player: MatchPlayerState,
): ArticulatedBody | undefined => {
  if (!state.experimentalArticulatedBody || !player.articulatedStance) return undefined;
  const left = effectiveArticulatedFoot(state, player, player, 'left', state.time, 0.025, 0);
  const right = effectiveArticulatedFoot(state, player, player, 'right', state.time, 0.025, 0);
  const geometry = composeArticulatedLegs(player, left, right);
  if (!geometry) return;
  return {
    version: 'articulated-body-dev-v2',
    at: state.time,
    root: { ...player.position, z: player.verticalJump?.height ?? 0 },
    facing: player.facingAngle,
    angularVelocity: player.articulatedStance.angularVelocity,
    torsoOrientation: { yaw: player.facingAngle, pitch: 0, roll: 0 },
    activeLeg:
      activeArticulatedFoot(state, player.id) ??
      player.lowerBodyPose?.activeLeg ??
      player.profile.dominantFoot,
    support: player.articulatedStance.support,
    height: Math.max(1.4, Math.min(2.2, player.profile.heightCm / 100)),
    mass: player.profile.weightKg,
    bootRadius: 0.035,
    geometry,
    ...(left.jointLimited || right.jointLimited
      ? { jointLimits: { left: !!left.jointLimited, right: !!right.jointLimited } }
      : {}),
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
