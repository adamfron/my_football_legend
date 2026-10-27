import { z } from 'zod';
import type { MatchPlayerState } from './matchState';
import { physicalPointSchema, distance } from './matchSpace';
import {
  forecastObservedBallStep,
  planBallOrientedMovement,
  type BallMotorObservation,
} from './ballOrientedMovement';
import { deriveMovementCapability } from './locomotion';
import { integrateCanonicalMovement } from './canonicalMovement';
import { playerFootGeometry } from './footContact';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { deriveFitnessPhysicalModifiers } from './matchFitness';

const velocitySchema = physicalPointSchema.extend({ z: z.number().finite() });
export const receiverMeetingPlanSchema = z.object({
  observedAt: z.number().nonnegative().nullable(),
  plannedAt: z.number().nonnegative(),
  observationAge: z.number().nonnegative().nullable(),
  uncertaintyMetres: z.number().nonnegative(),
  status: z.enum(['contact_planned', 'await_observation', 'no_prepared_contact']),
  contactPoint: physicalPointSchema.nullable(),
  contactAt: z.number().nonnegative().nullable(),
  movementTarget: physicalPointSchema.nullable(),
  targetSpeed: z.number().nonnegative(),
  incomingVelocity: velocitySchema.nullable(),
  initialVelocity: physicalPointSchema,
  brakingDistance: z.number().nonnegative(),
  turnRadians: z.number().nonnegative(),
  predictedFootDistance: z.number().nonnegative().nullable(),
  predictedBalance: z.number().min(0).max(1).nullable(),
  predictedFacingError: z.number().nonnegative().nullable(),
  probes: z.number().int().min(0).max(3),
});
export type ReceiverMeetingPlan = z.infer<typeof receiverMeetingPlanSchema>;

/** Travel first, present the body before arrival. Both the projection and live movement
 * use this rule and the same finite turn/braking integrator. It grants no contact. */
export const receptionPlanFacing = (
  actor: MatchPlayerState,
  target: { x: number; y: number },
  incoming: { x: number; y: number },
  remainingSeconds: number,
) => {
  const contactFacing = angleForVector({ x: -incoming.x, y: -incoming.y });
  const turn = Math.abs(normalizeAngle(contactFacing - actor.facingAngle));
  const turnRate =
    (2.2 + actor.profile.attributes.agility * 0.038) *
    Math.max(0.38, 1 - Math.hypot(actor.velocity.x, actor.velocity.y) / 13) *
    deriveFitnessPhysicalModifiers(actor).turning;
  return remainingSeconds <= turn / Math.max(0.1, turnRate) + 0.2 ||
    distance(actor.position, target) < 2
    ? contactFacing
    : angleForVector({ x: target.x - actor.position.x, y: target.y - actor.position.y });
};

/** One intended receiver at the existing 10Hz planning cadence. Two bounded
 * 25-sample local passes, at most three body projections, at most 96 steps each.
 * Only observed ball state and the receiver's own body enter. Unknown spin stays unknown. */
export const planSynchronizedReception = (
  actor: MatchPlayerState,
  observation: BallMotorObservation | undefined,
  now: number,
  readyAt: number,
  previous?: ReceiverMeetingPlan,
): ReceiverMeetingPlan => {
  const age = observation ? Math.max(0, now - observation.at) : null;
  const capability = deriveMovementCapability(actor);
  const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
  const acceleration = Math.max(
    0.1,
    capability.acceleration *
      (actor.plantBalance?.balance ?? 1) *
      deriveFitnessPhysicalModifiers(actor).braking,
  );
  const base: ReceiverMeetingPlan = {
    observedAt: observation?.at ?? null,
    plannedAt: now,
    observationAge: age,
    uncertaintyMetres: 0.15 + (age ?? 0) * (1 + speed * 0.1),
    status: 'await_observation',
    contactPoint: null,
    contactAt: null,
    movementTarget: null,
    targetSpeed: 0,
    incomingVelocity: null,
    initialVelocity: { ...actor.velocity },
    brakingDistance: (speed * speed) / (2 * acceleration),
    turnRadians: 0,
    predictedFootDistance: null,
    predictedBalance: null,
    predictedFacingError: null,
    probes: 0,
  };
  if (
    !observation?.ball ||
    age === null ||
    age > 0.5 ||
    observation.at > now + 1e-8 ||
    observation.ball.owner
  )
    return base;
  let ball = structuredClone(observation.ball);
  // Spin has no reception sighting contract. Never infer it from actual state.
  ball.spin = { x: 0, y: 0, z: 0 };
  if (age > 0) ball = forecastObservedBallStep(ball, age);
  const samples: {
    point: { x: number; y: number };
    velocity: { x: number; y: number; z: number };
    seconds: number;
  }[] = [];
  for (let i = 0; i <= 24; i++) {
    if (i) ball = forecastObservedBallStep(ball, 0.1);
    const seconds = i * 0.1;
    if (ball.position.x < 0 || ball.position.x > 105 || ball.position.y < 0 || ball.position.y > 68)
      break;
    if (seconds < 0.1 || now + seconds < readyAt || ball.position.z > 0.65) continue;
    if (distance(actor.position, ball.position) > capability.maximumSprintSpeed * seconds + 0.82)
      continue;
    samples.push({
      point: { x: ball.position.x, y: ball.position.y },
      velocity: { ...ball.velocity },
      seconds,
    });
  }
  // Start around the existing local analytical ETA. Taking the first cheap distance
  // bound and then the middle of the whole horizon skips attainable earlier meetings.
  const analytical = planBallOrientedMovement(
    actor,
    observation,
    now,
    actor.target,
    'receive',
    readyAt,
  );
  const first = samples.findIndex(
    (s) => s.seconds >= Math.min(2.4, analytical.contactSeconds ?? 2.4) - 0.05,
  );
  const shortlist = [...new Set([first, first + 2, first + 4])]
    .filter((i) => i >= 0 && samples[i])
    .map((i) => samples[i]!);
  // Retain an attainable commitment when a new local observation agrees. Keep the
  // absolute clock, rather than postponing the same meeting by 0.1s every review.
  if (
    previous?.status === 'contact_planned' &&
    previous.contactAt !== null &&
    previous.contactPoint &&
    previous.incomingVelocity &&
    previous.contactAt > now &&
    previous.contactAt <= now + 2.4
  ) {
    const remaining = previous.contactAt - now;
    let predicted = structuredClone(observation.ball);
    predicted.spin = { x: 0, y: 0, z: 0 };
    for (let time = 0; time < age + remaining - 1e-8; time += 0.1)
      predicted = forecastObservedBallStep(predicted, Math.min(0.1, age + remaining - time));
    if (
      predicted.position.z <= 0.65 &&
      distance(predicted.position, previous.contactPoint) <= base.uncertaintyMetres
    ) {
      shortlist.unshift({
        point: previous.contactPoint,
        velocity: predicted.velocity,
        seconds: remaining,
      });
      shortlist.splice(3);
    }
  }
  let probes = 0;
  for (const sample of shortlist) {
    probes++;
    const incomingFacing = angleForVector({ x: -sample.velocity.x, y: -sample.velocity.y });
    const target = {
      x: Math.max(0, Math.min(105, sample.point.x - Math.sin(incomingFacing) * 0.2)),
      y: Math.max(0, Math.min(68, sample.point.y - Math.cos(incomingFacing) * 0.2)),
    };
    let body = { ...actor };
    for (let tick = 0; tick < Math.round(sample.seconds / 0.025); tick++) {
      const motion = integrateCanonicalMovement(body, {
        target,
        targetSpeed: capability.maximumSprintSpeed,
        desiredFacingAngle: receptionPlanFacing(
          body,
          target,
          sample.velocity,
          sample.seconds - tick * 0.025,
        ),
        dt: 0.025,
        balance: 1,
        structural: false,
        receivingMomentum: false,
      });
      body = {
        ...body,
        position: motion.position,
        velocity: motion.velocity,
        facingAngle: motion.facingAngle,
        plantBalance: motion.plantBalance,
      };
    }
    const feet = playerFootGeometry(body);
    const footDistance = Math.min(
      distance(feet.leftFoot, sample.point),
      distance(feet.rightFoot, sample.point),
    );
    // Use the existing finite surface, never a larger positional arrival radius.
    if (footDistance > feet.footReach || (body.plantBalance?.balance ?? 1) < 0.1) continue;
    return {
      ...base,
      status: 'contact_planned',
      contactPoint: sample.point,
      contactAt: now + sample.seconds,
      movementTarget: target,
      targetSpeed: capability.maximumSprintSpeed,
      incomingVelocity: sample.velocity,
      turnRadians: Math.abs(normalizeAngle(incomingFacing - actor.facingAngle)),
      predictedFootDistance: footDistance,
      predictedBalance: body.plantBalance?.balance ?? 1,
      predictedFacingError: Math.abs(normalizeAngle(incomingFacing - body.facingAngle)),
      probes,
    };
  }
  return { ...base, status: 'no_prepared_contact', probes };
};
