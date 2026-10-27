import { z } from 'zod';
import { forecastObservedBallStep, type BallMotorObservation } from './ballOrientedMovement';
import { physicalPointSchema } from './matchSpace';

const vector = physicalPointSchema.extend({ z: z.number().finite() });
export const flightSightingSchema = z.object({
  at: z.number().nonnegative(),
  position: vector,
  positionError: z.number().positive(),
  // A short continuous optical interval can supply motion in one acquisition.
  // It is a measured displacement, never canonical instantaneous velocity/spin.
  motion: z.object({ from: vector, since: z.number().nonnegative() }).optional(),
});
export const kickerCueSchema = z.object({
  at: z.number().nonnegative(),
  position: physicalPointSchema,
  facing: z.number().finite(),
  approachVelocity: physicalPointSchema,
  preparing: z.boolean(),
});
export const flightBeliefSchema = z.object({
  lastObservation: flightSightingSchema.nullable(),
  evidenceAt: z.number().nonnegative(),
  motionEvidenceAt: z.number().nonnegative().nullable(),
  position: vector,
  velocity: vector.nullable(),
  velocitySource: z.enum([
    'unknown',
    'preparation_prior',
    'optical_interval',
    'sighting_displacement',
    'remembered_velocity',
  ]),
  positionError: z.number().positive(),
  velocityError: z.number().positive(),
  accelerationError: z.number().positive(),
  observations: z.number().int().nonnegative(),
  acquisitions: z.number().int().nonnegative(),
  acquiredExposure: z.number().nonnegative(),
  firstUsefulAt: z.number().nonnegative().nullable(),
  revisions: z.number().int().nonnegative(),
  lastRevisionMetres: z.number().nonnegative(),
  contradicted: z.boolean(),
  cue: kickerCueSchema.nullable(),
});
export type FlightSighting = z.infer<typeof flightSightingSchema>;
export type KickerCue = z.infer<typeof kickerCueSchema>;
export type FlightBelief = z.infer<typeof flightBeliefSchema>;

/** Research hypothesis only: no live match imports this module. The available body
 * orientation/preparation supplies a broad expectation, not the intended action or error. */
export const beliefFromKicker = (cue: KickerCue): FlightBelief => ({
  lastObservation: null,
  evidenceAt: cue.at,
  motionEvidenceAt: null,
  position: { ...cue.position, z: 0.11 },
  velocity: cue.preparing
    ? {
        x: Math.sin(cue.facing) * (12 + Math.hypot(cue.approachVelocity.x, cue.approachVelocity.y)),
        y: Math.cos(cue.facing) * (12 + Math.hypot(cue.approachVelocity.x, cue.approachVelocity.y)),
        z: 2,
      }
    : null,
  velocitySource: cue.preparing ? 'preparation_prior' : 'unknown',
  positionError: 1,
  velocityError: 10,
  accelerationError: 5,
  observations: 0,
  acquisitions: 0,
  acquiredExposure: 0,
  firstUsefulAt: null,
  revisions: 0,
  lastRevisionMetres: 0,
  contradicted: false,
  cue,
});

/** Forecast receives belief alone. Its uncertainty continues growing even when its
 * point estimate settles. No authoritative state, opponent profile or RNG enters. */
export const predictFlightBelief = (belief: FlightBelief | undefined, at: number) => {
  if (!belief || at < belief.evidenceAt - 1e-8) return undefined;
  const age = at - belief.evidenceAt;
  if (age > 4) return undefined;
  let ball: NonNullable<BallMotorObservation['ball']> = {
    position: { ...belief.position },
    velocity: belief.velocity ?? { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    owner: null,
  };
  if (belief.velocity)
    for (let t = 0; t < age - 1e-8; t += 0.1)
      ball = forecastObservedBallStep(ball, Math.min(0.1, age - t));
  const uncertainty =
    belief.positionError + belief.velocityError * age + 0.5 * belief.accelerationError * age * age;
  return {
    ...ball,
    at,
    observationAge: belief.lastObservation ? at - belief.lastObservation.at : null,
    velocityObservationAge: belief.motionEvidenceAt === null ? null : at - belief.motionEvidenceAt,
    uncertainty,
    confidence: 1 / (1 + uncertainty + belief.velocityError * 0.1),
    hasVelocityEstimate: belief.velocity !== null,
    hasMotionHistory: belief.motionEvidenceAt !== null,
  };
};

/** A new actual acquisition is the only way to refresh a belief. One position is
 * insufficient for velocity, but one acquisition with an optical interval is sufficient
 * to attempt inference. Neither route promises an accurate forecast or reception. */
export const acquireFlightSighting = (
  previous: FlightBelief | undefined,
  sighting: FlightSighting,
  gameReading: number,
): FlightBelief => {
  if (previous?.lastObservation && sighting.at <= previous.lastObservation.at + 1e-8)
    return previous;
  const prior = previous && predictFlightBelief(previous, sighting.at);
  const revision = prior
    ? Math.hypot(
        prior.position.x - sighting.position.x,
        prior.position.y - sighting.position.y,
        prior.position.z - sighting.position.z,
      )
    : 0;
  const contradicted = Boolean(prior && revision > prior.uncertainty + sighting.positionError);
  const from = sighting.motion?.from ?? previous?.lastObservation?.position;
  const since = sighting.motion?.since ?? previous?.lastObservation?.at;
  const dt = since === undefined ? 0 : sighting.at - since;
  let velocity = previous?.velocity ?? null;
  let velocitySource: FlightBelief['velocitySource'] = previous?.velocitySource ?? 'unknown';
  let velocityError = previous?.velocityError ?? 20;
  let motionEvidenceAt = previous?.motionEvidenceAt ?? null;
  if (from && dt >= 0.025 - 1e-8 && dt <= 0.8) {
    const raw = {
      x: (sighting.position.x - from.x) / dt,
      y: (sighting.position.y - from.y) / dt,
      z: (sighting.position.z - from.z) / dt,
    };
    // Mid-interval velocity and current velocity differ under gravity. Reading controls
    // this explicitly testable derivative correction; its strength is not calibrated.
    const reading = Math.max(0, Math.min(1, gameReading / 100));
    const airborne = sighting.position.z > 0.12 || from.z > 0.12;
    const horizontal = Math.hypot(raw.x, raw.y);
    const deceleration = airborne ? 0 : 3.2 * dt * 0.5 * reading;
    velocity = {
      x: raw.x * Math.max(0, 1 - deceleration / Math.max(0.01, horizontal)),
      y: raw.y * Math.max(0, 1 - deceleration / Math.max(0.01, horizontal)),
      z: airborne ? raw.z - 9.81 * dt * 0.5 * reading : 0,
    };
    velocitySource = sighting.motion ? 'optical_interval' : 'sighting_displacement';
    velocityError = Math.max(0.15, (2 * sighting.positionError) / dt + dt * 5);
    motionEvidenceAt = sighting.at;
  } else if (velocity) {
    // A new position does not make an old velocity fresh. Preserve its own evidence
    // age and grow uncertainty; a contradicted/expired prior supplies no velocity.
    if (!prior?.hasVelocityEstimate || contradicted) {
      velocity = null;
      velocitySource = 'unknown';
      velocityError = Math.max(20, velocityError);
    } else {
      velocity = prior.velocity;
      velocitySource = 'remembered_velocity';
      velocityError +=
        (previous?.accelerationError ?? 5) * Math.max(0, sighting.at - previous!.evidenceAt);
    }
  }
  return {
    lastObservation: sighting,
    evidenceAt: sighting.at,
    motionEvidenceAt,
    position: { ...sighting.position },
    velocity,
    velocitySource,
    positionError: sighting.positionError,
    velocityError,
    accelerationError: 5,
    observations: (previous?.observations ?? 0) + 1,
    acquisitions: (previous?.acquisitions ?? 0) + Number(Boolean(sighting.motion)),
    acquiredExposure: (previous?.acquiredExposure ?? 0) + (sighting.motion ? dt : 0),
    firstUsefulAt: previous?.firstUsefulAt ?? (velocity ? sighting.at : null),
    revisions: (previous?.revisions ?? 0) + Number(revision > sighting.positionError),
    lastRevisionMetres: revision,
    contradicted,
    cue: previous?.cue ?? null,
  };
};

export const labOccluderSchema = z
  .object({
    centre: physicalPointSchema,
    radius: z.number().positive(),
    bottom: z.number().nonnegative(),
    top: z.number().positive(),
  })
  .refine((o) => o.top > o.bottom);
export type LabOccluder = z.infer<typeof labOccluderSchema>;

/** Finite upright cylinder and 3D eye-to-ball segment. Lab-only body approximation:
 * no leg articulation, neck animation, transparency or permanent live blind zones. */
export const occludesFlight = (
  eye: z.infer<typeof vector>,
  ball: z.infer<typeof vector>,
  body: LabOccluder,
) => {
  const dx = ball.x - eye.x,
    dy = ball.y - eye.y;
  const ox = eye.x - body.centre.x,
    oy = eye.y - body.centre.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return false;
  const b = 2 * (ox * dx + oy * dy),
    c = ox * ox + oy * oy - body.radius * body.radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;
  const lo = Math.max(0, (-b - Math.sqrt(discriminant)) / (2 * a));
  const hi = Math.min(1, (-b + Math.sqrt(discriminant)) / (2 * a));
  if (lo > hi || hi <= 0 || lo >= 1) return false;
  const z0 = eye.z + (ball.z - eye.z) * lo,
    z1 = eye.z + (ball.z - eye.z) * hi;
  return Math.max(z0, z1) >= body.bottom && Math.min(z0, z1) <= body.top;
};
