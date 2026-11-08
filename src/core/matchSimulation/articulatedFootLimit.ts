import { z } from 'zod';
import { bodyPointSchema } from './articulatedBodyState';
import type { MatchPlayerState } from './matchState';

const xy = bodyPointSchema.pick({ x: true, y: true });
export const footJointWorkspaceSchema = z.object({
  centre: xy,
  radius: z.number().finite().positive(),
  speedBound: z.number().finite().nonnegative(),
});
export const articulatedFootCurveSchema = z.object({
  position: bodyPointSchema,
  velocity: bodyPointSchema,
  speedBound: z.number().finite().nonnegative(),
  accelerationBound: z.number().finite().nonnegative().optional(),
});
type Curve = z.infer<typeof articulatedFootCurveSchema>;

/** Finite upright command workspace, shared with the gait's hip-relative target
 * bound. The initial valid boot is retained even if it is already farther out.
 * A joint stop removes outward boot velocity; it never moves the root or ball.
 * The caller must still validate both bones and actual vertical reach with IK. */
export const constrainArticulatedFoot = (
  before: MatchPlayerState,
  after: MatchPlayerState,
  foot: 'left' | 'right',
  dt: number,
  local: number,
  value: Curve,
  rawAt: (t: number) => Curve,
) => {
  const h = Math.max(1.4, Math.min(2.2, after.profile.heightCm / 100));
  const hipRadius = (foot === 'left' ? -1 : 1) * h * 0.055;
  const turn = Math.atan2(
    Math.sin(after.facingAngle - before.facingAngle),
    Math.cos(after.facingAngle - before.facingAngle),
  );
  const yaw0 = before.lowerBodyPose?.hipYaw ?? 0,
    yaw1 = after.lowerBodyPose?.hipYaw ?? 0;
  const omega = (turn + yaw1 - yaw0) / dt;
  const rootVelocity = {
    x: (after.position.x - before.position.x) / dt,
    y: (after.position.y - before.position.y) / dt,
  };
  const hipAt = (t: number) => {
    const angle = before.facingAngle + (turn * t) / dt + yaw0 + ((yaw1 - yaw0) * t) / dt;
    return {
      position: {
        x: before.position.x + rootVelocity.x * t + Math.cos(angle) * hipRadius,
        y: before.position.y + rootVelocity.y * t - Math.sin(angle) * hipRadius,
      },
      velocity: {
        x: rootVelocity.x - Math.sin(angle) * hipRadius * omega,
        y: rootVelocity.y - Math.cos(angle) * hipRadius * omega,
      },
    };
  };
  const a = before.articulatedStance![foot],
    b = after.articulatedStance![foot];
  const baseVelocity = { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  const base = { x: a.x + ((b.x - a.x) * local) / dt, y: a.y + ((b.y - a.y) * local) / dt };
  const hip = hipAt(local),
    hip0 = hipAt(0),
    hip1 = hipAt(dt);
  const hipSpeed = Math.hypot(rootVelocity.x, rootVelocity.y) + Math.abs(omega * hipRadius);
  const hipAcceleration = omega * omega * Math.abs(hipRadius);
  const nominalRadius = h * 0.43;
  const baseDistance = Math.hypot(base.x - hip.position.x, base.y - hip.position.y);
  const radius = Math.max(nominalRadius, baseDistance);
  const radiusBound =
    Math.max(
      nominalRadius,
      Math.hypot(a.x - hip0.position.x, a.y - hip0.position.y),
      Math.hypot(b.x - hip1.position.x, b.y - hip1.position.y),
    ) +
    (hipAcceleration * dt * dt) / 8;
  const start = rawAt(0),
    end = rawAt(dt);
  const acceleration = Math.max(
    start.accelerationBound ?? Infinity,
    end.accelerationBound ?? Infinity,
    value.accelerationBound ?? Infinity,
  );
  // A twice-differentiable curve deviates from its endpoint chord by <= A*dt²/8.
  // If the WHOLE raw curve is inside the fixed inner workspace, retain its exact
  // historical acceleration bound (important for near-comoving clear sweeps).
  const deviation = Number.isFinite(acceleration)
    ? ((acceleration + hipAcceleration) * dt * dt) / 8
    : ((Math.max(start.speedBound, end.speedBound) + hipSpeed) * dt) / 2;
  const interior =
    Math.max(
      Math.hypot(start.position.x - hip0.position.x, start.position.y - hip0.position.y),
      Math.hypot(end.position.x - hip1.position.x, end.position.y - hip1.position.y),
    ) +
      deviation <=
    nominalRadius;
  const q = { x: value.position.x - hip.position.x, y: value.position.y - hip.position.y };
  const length = Math.hypot(q.x, q.y);
  const limited = length > radius;
  let position = value.position,
    velocity = value.velocity;
  if (limited) {
    const n = { x: q.x / length, y: q.y / length };
    const relative = { x: value.velocity.x - hip.velocity.x, y: value.velocity.y - hip.velocity.y };
    const radial = n.x * relative.x + n.y * relative.y;
    const radiusRate =
      baseDistance > nominalRadius
        ? ((base.x - hip.position.x) * (baseVelocity.x - hip.velocity.x) +
            (base.y - hip.position.y) * (baseVelocity.y - hip.velocity.y)) /
          baseDistance
        : 0;
    position = {
      ...value.position,
      x: hip.position.x + n.x * radius,
      y: hip.position.y + n.y * radius,
    };
    velocity = {
      x: hip.velocity.x + n.x * radiusRate + (radius / length) * (relative.x - n.x * radial),
      y: hip.velocity.y + n.y * radiusRate + (radius / length) * (relative.y - n.y * radial),
      z: value.velocity.z,
    };
  }
  const { accelerationBound: _acceleration, ...curve } = value;
  void _acceleration;
  return {
    ...curve,
    position,
    velocity,
    // Projection onto a moving disk is nonexpansive in the requested point;
    // centre motion contributes at most 2|c'|, radius motion <= |base'|+|c'|.
    speedBound: interior
      ? value.speedBound
      : value.speedBound + Math.hypot(baseVelocity.x, baseVelocity.y) + 3 * hipSpeed,
    ...(interior && value.accelerationBound !== undefined
      ? { accelerationBound: value.accelerationBound }
      : {}),
    jointLimited: limited,
    jointWorkspace: { centre: hip0.position, radius: radiusBound, speedBound: hipSpeed },
  };
};
