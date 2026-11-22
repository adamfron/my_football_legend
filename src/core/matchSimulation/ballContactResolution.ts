import { z } from 'zod';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import { BALL_RADIUS, type ContactCandidate, type FlightPoint } from './ballFlight';
import type { BallVelocity3d } from './ballPhysics';
import { FOOT_CONTACT_PHYSICS } from './footContact';

/** Contact is re-armed by geometric clearance, never by an elapsed-time lock. */
export const continuousBodyContactsSchema = z.array(z.string()).max(22);
const CLEARANCE = 0.01;
const SKIN = 0.00001;
const dot = (a: FlightPoint, b: FlightPoint) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: FlightPoint, b: FlightPoint) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const scale = (v: FlightPoint, k: number) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const add = (a: FlightPoint, b: FlightPoint) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: FlightPoint, b: FlightPoint) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: FlightPoint) => Math.hypot(v.x, v.y, v.z);

type BallMotion = { velocity: BallVelocity3d; spin: BallVelocity3d };
type MovingSurface = { normal: FlightPoint; velocity: FlightPoint };
type InverseContactMass = (impulse: FlightPoint) => FlightPoint;
const { mass, radius, inertia } = FOOT_CONTACT_PHYSICS;
export const COMPOSED_LIMB_IMPACT = { restitution: 0.38, friction: 0.42 } as const;

const patchMotion = (ball: BallMotion, surface: MovingSurface) =>
  sub(add(ball.velocity, cross(ball.spin, scale(surface.normal, -radius))), surface.velocity);

/** One passive point impulse on a hollow sphere against the measured kinematic
 * surface. Friction reduces slip and applies the same impulse to translation
 * and spin. Capsule roll, compliant tissue and limb recoil are unmodeled. */
export const resolveComposedLimbImpact = (
  ball: BallMotion,
  surface: MovingSurface,
  bodyMobility?: InverseContactMass,
  impact: { restitution: number; friction: number } = COMPOSED_LIMB_IMPACT,
) => {
  const { normal } = surface;
  const relative = patchMotion(ball, surface);
  const normalSpeed = dot(relative, normal);
  const normalImpulse =
    (bodyMobility ? 1 / (1 / mass + dot(normal, bodyMobility(normal))) : mass) *
    (1 + impact.restitution) *
    Math.max(0, -normalSpeed);
  const afterNormal = bodyMobility
    ? add(
        add(relative, scale(normal, normalImpulse / mass)),
        bodyMobility(scale(normal, normalImpulse)),
      )
    : relative;
  const slip = sub(
    afterNormal,
    scale(normal, bodyMobility ? dot(afterNormal, normal) : normalSpeed),
  );
  const slipLength = length(slip);
  const direction = scale(slip, 1 / Math.max(1e-12, slipLength));
  const bodySlip = bodyMobility?.(direction);
  const coupling = bodySlip ? dot(bodySlip, normal) : 0;
  const tangentialImpulse = scale(
    slip,
    -Math.min(
      1 / (1 / mass + radius ** 2 / inertia + (bodySlip ? dot(bodySlip, direction) : 0)),
      (impact.friction * normalImpulse) / Math.max(slipLength, 1e-12),
      coupling > 0
        ? Math.max(0, dot(afterNormal, normal)) / (coupling * Math.max(slipLength, 1e-12))
        : Infinity,
    ),
  );
  const angularDelta = scale(cross(scale(normal, -radius), tangentialImpulse), 1 / inertia);
  // The native spin envelope limits the impulse, keeping J and its torque coupled.
  let spinScale = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = angularDelta[axis];
    if (delta !== 0)
      spinScale = Math.min(
        spinScale,
        Math.max(0, (160 - Math.sign(delta) * ball.spin[axis]) / Math.abs(delta)),
      );
  }
  const spin = add(ball.spin, scale(angularDelta, spinScale));
  // Absorb roundoff at the schema boundary only.
  for (const axis of ['x', 'y', 'z'] as const)
    spin[axis] = Math.max(-160, Math.min(160, spin[axis]));
  const impulse = add(scale(normal, normalImpulse), scale(tangentialImpulse, spinScale));
  return { velocity: add(ball.velocity, scale(impulse, 1 / mass)), spin, impulse };
};

/** An impulse account for a committed response only. The surface work is
 * inferred from measured surface velocity and modeled impulse. Midpoint
 * velocities give the exact discrete kinetic-energy identity for this model. */
export const measureBallContactWork = (
  incoming: BallMotion,
  outgoing: BallMotion,
  constraints: (MovingSurface & { impulse: FlightPoint })[],
) => {
  const mid = {
    velocity: scale(add(incoming.velocity, outgoing.velocity), 0.5),
    spin: scale(add(incoming.spin, outgoing.spin), 0.5),
  };
  const energy = (ball: BallMotion) => ({
    linear: (mass / 2) * dot(ball.velocity, ball.velocity),
    rotational: (inertia / 2) * dot(ball.spin, ball.spin),
  });
  const before = energy(incoming),
    after = energy(outgoing);
  const delta = after.linear - before.linear + after.rotational - before.rotational;
  let surfaceWork = 0,
    contactFrameWork = 0;
  const surfaces = constraints.map((surface) => {
    const pre = patchMotion(incoming, surface),
      post = patchMotion(outgoing, surface);
    const incomingNormal = dot(pre, surface.normal),
      outgoingNormal = dot(post, surface.normal);
    const normalImpulse = dot(surface.impulse, surface.normal);
    surfaceWork += dot(surface.impulse, surface.velocity);
    contactFrameWork += dot(surface.impulse, patchMotion(mid, surface));
    return {
      ...surface,
      incomingNormal,
      outgoingNormal,
      normalImpulse,
      incomingTangent: sub(pre, scale(surface.normal, incomingNormal)),
      outgoingTangent: sub(post, scale(surface.normal, outgoingNormal)),
      tangentImpulse: sub(surface.impulse, scale(surface.normal, normalImpulse)),
    };
  });
  return {
    before,
    after,
    delta,
    surfaceWork,
    contactFrameWork,
    residual: delta - surfaceWork - contactFrameWork,
    surfaces,
  };
};

export const ballLinearImpulse = (before: BallVelocity3d, after: BallVelocity3d) =>
  scale(sub(after, before), mass);

const axisPoint = (point: FlightPoint, body: ContactCandidate): FlightPoint => ({
  ...body.centre,
  z: Math.max(
    body.centre.z - (body.halfHeight ?? 0),
    Math.min(body.centre.z + (body.halfHeight ?? 0), point.z),
  ),
});

export const ballBodyClearance = (point: FlightPoint, body: ContactCandidate) => {
  const axis = axisPoint(point, body);
  return (
    Math.hypot(point.x - axis.x, point.y - axis.y, point.z - axis.z) - body.radius - BALL_RADIUS
  );
};

export const retainContinuousBodyContacts = (
  point: FlightPoint,
  bodies: ContactCandidate[],
  previous: readonly string[] = [],
) =>
  previous.filter((id) => {
    const body = bodies.find((b) => b.playerId === id);
    return (
      body &&
      ballBodyClearance(point, {
        ...body,
        centre: body.previousCentre ?? body.centre,
      }) <= CLEARANCE
    );
  });

/** Minimum radial correction for the actual expanded CCD volume. The pitch is a
 * unilateral constraint: an underside correction cannot push the ball through grass.
 * At the floor, resolve the remaining circular cross-section horizontally instead.
 * Coincident axes use relative motion, with a deterministic axis only at exact rest. */
export const separateBallFromBody = (
  point: FlightPoint,
  body: ContactCandidate,
  relativeVelocity: BallVelocity3d,
): FlightPoint => {
  const axis = axisPoint(point, body),
    radius = body.radius + BALL_RADIUS + SKIN;
  const delta = { x: point.x - axis.x, y: point.y - axis.y, z: point.z - axis.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length >= radius) return point;
  const horizontal = Math.hypot(delta.x, delta.y);
  const motion = Math.hypot(relativeVelocity.x, relativeVelocity.y);
  const direction =
    horizontal > 1e-9
      ? { x: delta.x / horizontal, y: delta.y / horizontal }
      : motion > 1e-9
        ? { x: -relativeVelocity.x / motion, y: -relativeVelocity.y / motion }
        : { x: 1, y: 0 };
  const radial =
    length > 1e-9
      ? {
          x: axis.x + (delta.x * radius) / length,
          y: axis.y + (delta.y * radius) / length,
          z: axis.z + (delta.z * radius) / length,
        }
      : { x: axis.x + direction.x * radius, y: axis.y + direction.y * radius, z: point.z };
  if (radial.z >= BALL_RADIUS) return radial;
  const floorAxis = axisPoint({ ...point, z: BALL_RADIUS }, body);
  const reach = Math.sqrt(Math.max(0, radius * radius - (BALL_RADIUS - floorAxis.z) ** 2));
  return { x: axis.x + direction.x * reach, y: axis.y + direction.y * reach, z: BALL_RADIUS };
};

/** Solve simultaneous unilateral normal impulses where both constraints are active.
 * The Gram system gives the minimum velocity change and preserves tangential motion. */
export const resolveOpposingBallContactImpulse = (
  incoming: BallVelocity3d,
  a: { normal: FlightPoint; velocity: BallVelocity3d },
  b: { normal: FlightPoint; velocity: BallVelocity3d },
  pairRestitution = 0,
) => {
  const cos = dot(a.normal, b.normal);
  const determinant = 1 - cos * cos;
  if (cos >= 0 || determinant <= 1e-12) return;
  const deficit = (c: typeof a) => dot(c.normal, c.velocity) - dot(c.normal, incoming);
  const da = deficit(a),
    db = deficit(b);
  const ja = (da - cos * db) / determinant,
    jb = (db - cos * da) / determinant;
  if (ja <= 0 || jb <= 0) return;
  const compression = Math.max(0, (mass * (ja * da + jb * db)) / 2);
  // Equal recovery speed at the two loaded patches costs the same fraction
  // of measured compression work in their Gram metric.
  const release =
    pairRestitution > 0 ? pairRestitution * Math.sqrt(compression / (mass * (1 + cos))) : 0;
  const impulseA = ja + release;
  const impulseB = jb + release;
  return {
    velocity: {
      x: incoming.x + impulseA * a.normal.x + impulseB * b.normal.x,
      y: incoming.y + impulseA * a.normal.y + impulseB * b.normal.y,
      z: incoming.z + impulseA * a.normal.z + impulseB * b.normal.z,
    },
    impulses: [scale(a.normal, mass * impulseA), scale(b.normal, mass * impulseB)] as const,
    dissipated: compression * (1 - pairRestitution ** 2),
  };
};

export const resolveOpposingBallContacts = (
  incoming: BallVelocity3d,
  a: MovingSurface,
  b: MovingSurface,
) => resolveOpposingBallContactImpulse(incoming, a, b)?.velocity;

/** Persistent contact supplies support, not another restituting impact. Body speed is
 * the measured swept displacement; locomotion's desired velocity is not body motion.
 * Position projections do not add kinetic energy. Iterations are bounded by the number
 * of contacting bodies; unresolved crowded constraints remain continuous next tick. */
export const supportContinuousBodyContacts = (
  point: FlightPoint,
  velocity: BallVelocity3d,
  bodies: ContactCandidate[],
  dt: number,
) => {
  const span = startPerformanceSpan('ball_collision_resolution');
  try {
    let position = point,
      outgoing = { ...velocity };
    for (let iteration = 0; iteration < 8; iteration++) {
      let corrected = false;
      for (const body of bodies) {
        if (ballBodyClearance(position, body) >= 0) continue;
        const bodyVelocity = body.previousCentre
          ? {
              x: (body.centre.x - body.previousCentre.x) / dt,
              y: (body.centre.y - body.previousCentre.y) / dt,
              z: (body.centre.z - body.previousCentre.z) / dt,
            }
          : { x: 0, y: 0, z: 0 };
        const relative = {
          x: outgoing.x - bodyVelocity.x,
          y: outgoing.y - bodyVelocity.y,
          z: outgoing.z - bodyVelocity.z,
        };
        const separated = separateBallFromBody(position, body, relative);
        const correction = {
          x: separated.x - position.x,
          y: separated.y - position.y,
          z: separated.z - position.z,
        };
        const length = Math.hypot(correction.x, correction.y, correction.z);
        if (length > 1e-9) {
          const dot =
            (relative.x * correction.x + relative.y * correction.y + relative.z * correction.z) /
            length;
          if (dot < 0)
            outgoing = {
              x: outgoing.x - (dot * correction.x) / length,
              y: outgoing.y - (dot * correction.y) / length,
              z: outgoing.z - (dot * correction.z) / length,
            };
          position = separated;
          corrected = true;
        }
      }
      if (!corrected) break;
    }
    if (position.z <= BALL_RADIUS + SKIN && outgoing.z < 0) outgoing.z = 0;
    return { position, velocity: outgoing };
  } finally {
    endPerformanceSpan('ball_collision_resolution', span);
  }
};
