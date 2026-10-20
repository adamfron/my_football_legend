import { z } from 'zod';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import { BALL_RADIUS, type ContactCandidate, type FlightPoint } from './ballFlight';
import type { BallVelocity3d } from './ballPhysics';

/** Contact is re-armed by geometric clearance, never by an elapsed-time lock. */
export const continuousBodyContactsSchema = z.array(z.string()).max(22);
const CLEARANCE = 0.01;
const SKIN = 0.00001;

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
