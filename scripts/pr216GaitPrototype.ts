/** Isolated feasibility experiment. No production caller enables stance constraints.
 * Uses the canonical motor once, caps its earned momentum against finite grip,
 * and uses the existing two-bone IK. Ball-contact coupling is an explicit blocker. */
import { z } from 'zod';
import type { MatchPlayerState } from '../src/core/matchSimulation/matchState';
import {
  integrateCanonicalMovement,
  integrateCanonicalBodyRemainder,
} from '../src/core/matchSimulation/canonicalMovement';
import {
  deriveLowerBodyGeometry,
  neutralLowerBodyPose,
} from '../src/core/matchSimulation/lowerBodyGeometry';
const xy = z.object({ x: z.number().finite(), y: z.number().finite() });
export const stancePrototypeSchema = z.object({
  surface: z.literal('firm-grass-dev-v1'),
  foot: z.enum(['left', 'right']),
  anchor: xy,
  elapsed: z.number().nonnegative(),
  steps: z.number().int().nonnegative(),
  swing: xy,
});
export const stepStancePrototype = (
  actor: MatchPlayerState,
  stance: z.infer<typeof stancePrototypeSchema>,
  target: { x: number; y: number },
  speed: number,
  dt: number,
  mu = 1,
  rotationalLimit = 35,
) => {
  const motor = integrateCanonicalMovement(actor, {
    target,
    targetSpeed: speed,
    desiredFacingAngle: Math.atan2(target.x - actor.position.x, target.y - actor.position.y),
    dt,
    balance: 1,
    structural: false,
    receivingMomentum: false,
  });
  const delta = { x: motor.velocity.x - actor.velocity.x, y: motor.velocity.y - actor.velocity.y };
  const requestedForce = (actor.profile.weightKg * Math.hypot(delta.x, delta.y)) / dt;
  const normalForce = actor.profile.weightKg * 9.81,
    availableForce = mu * normalForce;
  const scale = Math.min(1, availableForce / Math.max(1e-12, requestedForce));
  const velocity = { x: actor.velocity.x + delta.x * scale, y: actor.velocity.y + delta.y * scale };
  const inertia = (actor.profile.weightKg * (actor.profile.heightCm / 100) ** 2) / 12;
  const turn = Math.atan2(
    Math.sin(motor.facingAngle - actor.facingAngle),
    Math.cos(motor.facingAngle - actor.facingAngle),
  );
  const maxTurn = (rotationalLimit / inertia) * dt * dt;
  let player = {
    ...actor,
    velocity,
    position: integrateCanonicalBodyRemainder({ position: actor.position, velocity }, dt),
    facingAngle: actor.facingAngle + Math.max(-maxTurn, Math.min(maxTurn, turn)),
    lowerBodyPose: actor.lowerBodyPose ?? neutralLowerBodyPose(),
  };
  let next = { ...stance, elapsed: stance.elapsed + dt };
  const slip = { x: delta.x * (1 - scale) * dt, y: delta.y * (1 - scale) * dt };
  next.anchor = { x: next.anchor.x + slip.x, y: next.anchor.y + slip.y };
  let released = false;
  try {
    deriveLowerBodyGeometry(player, { [next.foot]: next.anchor });
  } catch {
    released = true;
  }
  // Release precedes reposition. The bounded swing must actually reach the new
  // placement before another support is admitted; no immutable turf weld.
  const nominal = deriveLowerBodyGeometry(player);
  const other = next.foot === 'left' ? 'right' : 'left';
  const destination = nominal[other].foot;
  const dx = destination.x - next.swing.x,
    dy = destination.y - next.swing.y,
    d = Math.hypot(dx, dy),
    fraction = Math.min(1, (16 * dt) / Math.max(1e-12, d));
  next.swing = { x: next.swing.x + dx * fraction, y: next.swing.y + dy * fraction };
  if ((released || next.elapsed >= 0.18) && d <= 16 * dt) {
    next = {
      ...next,
      foot: other,
      anchor: next.swing,
      swing: next.anchor,
      elapsed: 0,
      steps: next.steps + 1,
    };
    released = false;
  }
  // If no reachable support exists, do not pretend the body's commanded next
  // step is supported. The experiment returns an explicit feasibility failure.
  const geometry = released
    ? undefined
    : deriveLowerBodyGeometry(player, { [next.foot]: next.anchor });
  player = {
    ...player,
    plantBalance: {
      balance: geometry ? 1 : 0.35,
      load: requestedForce / normalForce,
      support: next.foot,
    },
  };
  return {
    player,
    stance: stancePrototypeSchema.parse(next),
    geometry,
    requestedForce,
    availableForce,
    normalForce,
    slip,
    unsupported: released,
    rotationalLimit,
  };
};

/** Sparse planar torso prototype: angular impulse, bounded recovery torque,
 * ballistic COM after support failure, and unilateral ground collision.
 * No match imports it. Grounded-to-standing articulation remains PR217 work. */
export const fallPrototypeSchema = z.object({
  angle: z.number().finite(),
  omega: z.number().finite(),
  x: z.number().finite(),
  z: z.number().nonnegative(),
  vx: z.number().finite(),
  vz: z.number().finite(),
  phase: z.enum(['supported', 'falling', 'grounded']),
});
export const stepFallPrototype = (
  input: z.infer<typeof fallPrototypeSchema>,
  mass: number,
  dt: number,
  impulse = 0,
) => {
  const s = { ...input };
  const h = 0.9,
    inertia = (mass * h * h) / 3;
  s.omega += (impulse * h) / inertia;
  if (s.phase === 'supported') {
    const needed = mass * 9.81 * h * Math.sin(s.angle),
      torque = Math.max(-60, Math.min(60, -needed - 20 * s.omega));
    s.omega += ((needed + torque) / inertia) * dt;
    s.angle += s.omega * dt;
    s.x = h * Math.sin(s.angle);
    s.z = h * Math.cos(s.angle);
    if (Math.abs(s.x) > 0.24) {
      s.phase = 'falling';
      s.vx = h * Math.cos(s.angle) * s.omega;
      s.vz = -h * Math.sin(s.angle) * s.omega;
    }
  } else if (s.phase === 'falling') {
    s.x += s.vx * dt;
    s.z = Math.max(0, s.z + s.vz * dt - 0.5 * 9.81 * dt * dt);
    s.vz -= 9.81 * dt;
    s.angle += s.omega * dt;
    const extent = 0.45 * Math.abs(Math.cos(s.angle)) + 0.18 * Math.abs(Math.sin(s.angle));
    if (s.z <= extent) {
      s.z = extent;
      s.vz = 0;
      s.vx = 0;
      s.omega = 0;
      s.phase = 'grounded';
    }
  }
  return fallPrototypeSchema.parse(s);
};
