import { z } from 'zod';
import type { MatchPlayerState } from './matchState';

/** Explicit experimental posture; old saves and ordinary fixtures omit it. */
export const lowerBodyPoseSchema = z.object({
  stanceWidth: z.number().min(0.2).max(0.65),
  crouch: z.number().min(0).max(0.65),
  footLead: z.number().min(-0.12).max(0.35),
  hipYaw: z.number().min(-0.3).max(0.3),
  activeLeg: z.enum(['left', 'right']),
});
export type LowerBodyPose = z.infer<typeof lowerBodyPoseSchema>;
export const neutralLowerBodyPose = (): LowerBodyPose => ({
  stanceWidth: 0.34,
  crouch: 0,
  footLead: 0.2,
  hipYaw: 0,
  activeLeg: 'right',
});
const point = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const leg = z.object({
  hip: point,
  knee: point,
  ankle: point,
  foot: point,
  thighLength: z.number().positive(),
  shinLength: z.number().positive(),
  kneeFlexion: z.number().min(0).max(Math.PI),
  supporting: z.boolean(),
});
export const lowerBodyGeometrySchema = z.object({
  pelvis: point,
  left: leg,
  right: leg,
  balance: z.number().min(0).max(1),
  capsules: z.array(
    z.object({
      region: z.enum(['left_thigh', 'right_thigh', 'left_shin', 'right_shin']),
      from: point,
      to: point,
      radius: z.number().positive(),
    }),
  ),
});

/** Connected two-bone IK preserves both limb lengths. World pose follows the single
 * canonical body integrator. There is no independently positioned contact foot. */
export const deriveLowerBodyGeometry = (actor: MatchPlayerState) => {
  const pose = actor.lowerBodyPose ?? neutralLowerBodyPose(),
    height = Math.max(1.4, Math.min(2.2, actor.profile.heightCm / 100));
  const angle = actor.facingAngle + pose.hipYaw,
    forward = { x: Math.sin(angle), y: Math.cos(angle) },
    right = { x: forward.y, y: -forward.x };
  const jump = actor.verticalJump?.height ?? 0;
  const horizontal = (pose.stanceWidth / 2 - height * 0.055) ** 2 + pose.footLead ** 2;
  const maximumPelvis =
    0.075 + jump + Math.sqrt(Math.max(0, (height * 0.491 * 0.995) ** 2 - horizontal));
  const pelvisZ = Math.min(height * 0.49 - pose.crouch * 0.25 + jump, maximumPelvis);
  const world = (x: number, y: number, z: number) => ({
    x: actor.position.x + right.x * x + forward.x * y,
    y: actor.position.y + right.y * x + forward.y * y,
    z,
  });
  const pelvis = world(0, 0, pelvisZ),
    thighLength = height * 0.245,
    shinLength = height * 0.246;
  const derive = (side: -1 | 1) => {
    const hip = { x: side * height * 0.055, y: 0, z: pelvisZ },
      ankle = { x: (side * pose.stanceWidth) / 2, y: pose.footLead, z: 0.075 + jump };
    const d = { x: ankle.x - hip.x, y: ankle.y - hip.y, z: ankle.z - hip.z },
      length = Math.hypot(d.x, d.y, d.z);
    if (length >= thighLength + shinLength || length <= Math.abs(thighLength - shinLength))
      throw Error('Unreachable articulated ankle');
    const unit = { x: d.x / length, y: d.y / length, z: d.z / length },
      along = (thighLength ** 2 - shinLength ** 2 + length ** 2) / (2 * length),
      bend = Math.sqrt(Math.max(0, thighLength ** 2 - along ** 2));
    const normal = { x: -unit.x * unit.y, y: 1 - unit.y ** 2, z: -unit.z * unit.y },
      normalLength = Math.hypot(normal.x, normal.y, normal.z);
    const knee = {
      x: hip.x + unit.x * along + (normal.x / normalLength) * bend,
      y: hip.y + unit.y * along + (normal.y / normalLength) * bend,
      z: hip.z + unit.z * along + (normal.z / normalLength) * bend,
    };
    return {
      hip: world(hip.x, hip.y, hip.z),
      knee: world(knee.x, knee.y, knee.z),
      ankle: world(ankle.x, ankle.y, ankle.z),
      foot: world(ankle.x, ankle.y, 0.04 + jump),
      thighLength,
      shinLength,
      kneeFlexion:
        Math.PI -
        Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (thighLength ** 2 + shinLength ** 2 - length ** 2) / (2 * thighLength * shinLength),
            ),
          ),
        ),
      supporting:
        actor.plantBalance?.support === 'both' ||
        (actor.plantBalance?.support ?? (pose.activeLeg === 'left' ? 'right' : 'left')) ===
          (side === -1 ? 'left' : 'right'),
    };
  };
  const left = derive(-1),
    r = derive(1);
  return {
    pelvis,
    left,
    right: r,
    balance: actor.plantBalance?.balance ?? 1,
    capsules: (
      [
        { region: 'left_thigh', from: left.hip, to: left.knee, radius: height * 0.055 },
        { region: 'right_thigh', from: r.hip, to: r.knee, radius: height * 0.055 },
        { region: 'left_shin', from: left.knee, to: left.ankle, radius: height * 0.037 },
        { region: 'right_shin', from: r.knee, to: r.ankle, radius: height * 0.037 },
      ] as const
    ).map((c) => ({ ...c })),
  };
};
const approach = (from: number, to: number, maximum: number) =>
  from + Math.max(-maximum, Math.min(maximum, to - from));
export const advanceLowerBodyPose = (
  actor: MatchPlayerState,
  dt: number,
): LowerBodyPose | undefined => {
  const pose = actor.lowerBodyPose;
  if (!pose) return undefined;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.y),
    balance = actor.plantBalance?.balance ?? 1;
  return {
    ...pose,
    stanceWidth: approach(pose.stanceWidth, speed > 4 ? 0.26 : 0.34, dt * 0.35),
    crouch: approach(pose.crouch, (1 - balance) * 0.3, dt * 0.5),
    footLead: approach(pose.footLead, 0.2, dt * 0.3),
    hipYaw: approach(pose.hipYaw, 0, dt * 0.6),
  };
};

/** Directional movement clearance, with at most 2cm compliance per body under closing
 * momentum. The solid torso core remains bounded; this does not classify fair play. */
export const compliantBodySeparation = (
  a: MatchPlayerState,
  b: MatchPlayerState,
  n: { x: number; y: number },
) => {
  if (!a.lowerBodyPose || !b.lowerBodyPose) return 1.15;
  const support = (p: MatchPlayerState) => {
    const forward = {
        x: Math.sin(p.facingAngle + p.lowerBodyPose!.hipYaw),
        y: Math.cos(p.facingAngle + p.lowerBodyPose!.hipYaw),
      },
      side = { x: forward.y, y: -forward.x };
    const scale = Math.max(0.9, Math.min(1.1, Math.sqrt(p.profile.weightKg / 75)));
    return Math.hypot(
      (n.x * forward.x + n.y * forward.y) * 0.4 * scale,
      (n.x * side.x + n.y * side.y) * 0.575 * scale,
    );
  };
  const closing = Math.max(
    0,
    -((a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y),
  );
  const resistance = 0.5 + (a.profile.attributes.strength + b.profile.attributes.strength) / 200;
  return Math.max(0.68, support(a) + support(b) - Math.min(0.04, (closing * 0.012) / resistance));
};

/** A local position constraint within the existing 40Hz integration. Initially disjoint
 * bodies cannot step through it; existing overlaps separate at the existing finite rate. */
export const constrainCompliantBodyStep = (
  actor: MatchPlayerState,
  next: { x: number; y: number },
  other: MatchPlayerState,
  dt: number,
) => {
  const dx = next.x - other.position.x,
    dy = next.y - other.position.y,
    metres = Math.hypot(dx, dy);
  if (metres < 1e-9) return { ...actor.position };
  const normal = { x: dx / metres, y: dy / metres },
    required = compliantBodySeparation(actor, other, normal);
  const before = Math.hypot(
      actor.position.x - other.position.x,
      actor.position.y - other.position.y,
    ),
    minimum = Math.min(required, before + 0.65 * dt);
  // Swept entry, including a segment whose endpoint has already left the far side.
  // Use the conservative support bound for the approach direction; never tunnel.
  const sx = actor.position.x - other.position.x,
    sy = actor.position.y - other.position.y;
  const vx = next.x - actor.position.x,
    vy = next.y - actor.position.y;
  const radius = Math.max(
    required,
    compliantBodySeparation(actor, other, {
      x: sx / Math.max(1e-9, before),
      y: sy / Math.max(1e-9, before),
    }),
  );
  const aa = vx * vx + vy * vy,
    bb = 2 * (sx * vx + sy * vy),
    cc = before * before - radius * radius;
  const discriminant = bb * bb - 4 * aa * cc;
  if (cc >= -1e-10 && aa > 1e-12 && bb < 0 && discriminant > 0) {
    const entry = (-bb - Math.sqrt(discriminant)) / (2 * aa);
    if (entry >= 0 && entry <= 1)
      return { x: actor.position.x + vx * entry, y: actor.position.y + vy * entry };
  }
  if (metres >= minimum) return next;
  return { x: other.position.x + normal.x * minimum, y: other.position.y + normal.y * minimum };
};
