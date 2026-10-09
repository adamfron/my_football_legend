import { z } from 'zod';
import {
  clampPitchPoint,
  distance,
  physicalPointSchema,
  pitchPointSchema,
  type PitchPoint,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { derivePassLaunchPlan, passLaunchPlanSchema, type PassDelivery } from './passLaunchPlan';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { projectReceiverReadiness, receiverReadinessProjectionSchema } from './receiverReadiness';
import { estimatePlayerArrivalTime } from './playerArrival';
import { projectLocomotion } from './locomotion';
import { projectFutureBallTrajectory } from './ballPhysics';

/** An aware receiver meets the actual flight, including execution error. The release-time
 * desired point remains diagnostic evidence; this only supplies a normal locomotion target.
 * Use the canonical integrator/arrival estimator, never move a body or ball to this forecast. */
export const projectLiveReceptionTarget = (
  state: TacticalMatchState,
  receiver: MatchPlayerState,
): PitchPoint | undefined => {
  if (
    state.ball.ownerId ||
    !state.ball.velocity ||
    !state.receptionPreparation ||
    state.time < state.receptionPreparation.awarenessAt
  )
    return undefined;
  if (state.scenario === 'throw_in') return undefined;
  const desired =
    state.lastPassDiagnostic?.intendedReceiverId === receiver.id
      ? state.lastPassDiagnostic.predictedReceptionPoint
      : state.receptionPreparation.expectedContactPoint;
  const horizon = Math.min(
    3,
    Math.max(0.3, state.receptionPreparation.expectedArrivalTime - state.time + 1),
  );
  const samples = projectFutureBallTrajectory(
    {
      position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 },
      velocity: {
        x: state.ball.velocity.x,
        y: state.ball.velocity.y,
        z: state.ball.velocity.z ?? 0,
      },
      airborne: state.ball.airborne ?? false,
      bounceCount: state.ball.bounceCount ?? 0,
      ...(state.ball.spin ? { spin: state.ball.spin } : {}),
    },
    horizon,
    0.1,
  );
  let target: PitchPoint | undefined,
    bestCost = Infinity;
  for (const sample of samples) {
    const point = pitchPointSchema.safeParse(sample.ball.position);
    if (!point.success) break;
    // Adjust the meeting location rather than chasing the earliest estimated intercept.
    // The latter ignores braking/body orientation and can pull a prepared receiver away
    // from a perfectly reachable delivery. Actual contact height/reach remains canonical.
    // A receive objective prepares reachable low control. Chasing a head-height
    // sample can strand the receiver behind the descending ball, even on an accurate pass.
    if (sample.ball.position.z > 0.65) continue;
    const cost =
      distance(point.data, desired) +
      Math.abs(state.time + sample.at - state.receptionPreparation.expectedArrivalTime) * 0.2;
    if (cost < bestCost) {
      bestCost = cost;
      target = point.data;
    }
  }
  return target;
};

/** Seconds/metres: bounded receiver continuation, shared by lead and through options. */
export const PASS_MEETING_CALIBRATION = Object.freeze({
  maximumHorizonSeconds: 2.5,
  supportHorizonSeconds: 0.32,
  activeMovementSpeed: 0.35,
  minimumPathSeparationMetres: 1.6,
  arrivalToleranceSeconds: 0.2,
  meetingIterations: 3,
});

export const passReceptionProjectionSchema = z.object({
  releaseTarget: pitchPointSchema,
  expectedReceptionPoint: pitchPointSchema,
  estimatedBallArrival: z.number().positive(),
  estimatedReceiverArrival: z.number().nonnegative(),
  receiverMovement: z.enum(['hold', 'meet_ball', 'continue_run']),
  leadDistance: z.number().nonnegative(),
  passerReadQuality: z.number().min(0).max(1),
  receiverAwarenessDelay: z.number().nonnegative(),
  launchPlan: passLaunchPlanSchema,
  receiverReadiness: receiverReadinessProjectionSchema,
  semanticIntent: z.enum(['support', 'progressive', 'direct', 'lead', 'through']),
  predictionHorizon: z.number().nonnegative().max(2.5),
  movementProjection: z.number().finite(),
});
export type PassReceptionProjection = z.infer<typeof passReceptionProjectionSchema>;

export const receptionPreparationSchema = z.object({
  actorId: z.string(),
  sourceActorId: z.string(),
  releasedAt: z.number().nonnegative(),
  awarenessAt: z.number().nonnegative(),
  expectedContactPoint: pitchPointSchema,
  expectedArrivalTime: z.number().nonnegative(),
  movement: z.enum(['wait', 'meet_ball', 'run_onto_ball']),
  ballEpisode: z.string(),
  readiness: receiverReadinessProjectionSchema,
});
export type ReceptionPreparation = z.infer<typeof receptionPreparationSchema>;

export const receptionQualityEvidenceSchema = z.object({
  score: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
  incomingSpeed: z.number().nonnegative(),
  incomingHeight: z.number().nonnegative(),
  facingError: z.number().nonnegative().max(Math.PI),
  preparationSeconds: z.number().nonnegative(),
  weakFootDifficulty: z.number().min(0).max(1),
});
export const receptionOutcomeSchema = z.object({
  receiverId: z.string(),
  kind: z.enum(['clean_control', 'directional_control', 'heavy_touch', 'failed_control']),
  contactPoint: pitchPointSchema,
  resultingPoint: physicalPointSchema.optional(),
  quality: receptionQualityEvidenceSchema.optional(),
  retainedVelocity: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  momentumRetention: z.number().min(0).max(1).optional(),
});
export type ReceptionOutcome = z.infer<typeof receptionOutcomeSchema>;

export type ProjectedPassIntent = 'support' | 'progressive' | 'direct' | 'lead' | 'through';

/** Velocity-led meeting forecast; observes canonical motion without simulating a second match. */
export const projectPassReception = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  receiver: MatchPlayerState,
  intent: ProjectedPassIntent,
  delivery: PassDelivery = 'ground',
): PassReceptionProjection => {
  const a = passer.profile.attributes;
  const pressure = Math.max(0, Math.min(1, state.currentPressure));
  const read = Math.max(
    0.15,
    Math.min(1, (a.passing + a.technique + a.gameReading + a.composure) / 400 - pressure * 0.18),
  );
  const ra = receiver.profile.attributes;
  const awarenessDelay = Math.max(
    0.08,
    0.68 -
      (ra.gameReading + ra.concentration) / 250 +
      distance(passer.position, receiver.position) / 220,
  );
  const velocitySpeed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  const tacticalDx = receiver.target.x - receiver.position.x;
  const tacticalDy = receiver.target.y - receiver.position.y;
  const tacticalDistance = Math.hypot(tacticalDx, tacticalDy);
  const activeMovement = velocitySpeed >= PASS_MEETING_CALIBRATION.activeMovementSpeed;
  const motion = activeMovement
    ? receiver.velocity
    : tacticalDistance >= PASS_MEETING_CALIBRATION.minimumPathSeparationMetres
      ? { x: tacticalDx, y: tacticalDy }
      : { x: 0, y: 0 };
  const motionSpeed = Math.hypot(motion.x, motion.y);
  const direction = {
    x: motion.x / Math.max(0.001, motionSpeed),
    y: motion.y / Math.max(0.001, motionSpeed),
  };
  const toPasser = {
    x: passer.position.x - receiver.position.x,
    y: passer.position.y - receiver.position.y,
  };
  const checkingBack =
    motionSpeed > 0 &&
    direction.x * toPasser.x + direction.y * toPasser.y >
      distance(passer.position, receiver.position) * 0.45;
  const pathIntent = intent === 'lead' || intent === 'through';
  let semanticIntent: ProjectedPassIntent =
    pathIntent && (checkingBack || motionSpeed === 0) ? 'support' : intent;
  const predictsPath = semanticIntent === 'lead' || semanticIntent === 'through';
  const acceleration = 3.2 + ra.agility * 0.055;
  const targetSpeed = projectLocomotion(state, receiver).targetSpeed;
  const capability = 6.2 + ra.pace * 0.033;
  const initialSpeed = activeMovement ? Math.min(capability, velocitySpeed) : 0;
  const continuationSpeed = Math.max(initialSpeed, Math.min(capability, targetSpeed));
  const projectedAt = (seconds: number) => {
    const activeTime = activeMovement ? seconds : Math.max(0, seconds - awarenessDelay);
    const accelerationTime = Math.min(
      activeTime,
      Math.max(0, continuationSpeed - initialSpeed) / acceleration,
    );
    let travel =
      initialSpeed * activeTime +
      acceleration * accelerationTime * (activeTime - accelerationTime / 2);
    if (!activeMovement) travel = Math.min(tacticalDistance, travel);
    const outward =
      (receiver.position.y < 6 && direction.y < 0) || (receiver.position.y > 62 && direction.y > 0);
    const lateralScale = outward
      ? Math.max(0.08, Math.min(1, Math.min(receiver.position.y, 68 - receiver.position.y) / 6))
      : 1;
    return clampPitchPoint({
      x: receiver.position.x + direction.x * travel,
      y: receiver.position.y + direction.y * travel * lateralScale,
    });
  };
  let horizon = predictsPath
    ? Math.min(
        PASS_MEETING_CALIBRATION.maximumHorizonSeconds,
        Math.max(0.45, distance(passer.position, receiver.position) / 14),
      )
    : semanticIntent === 'support'
      ? PASS_MEETING_CALIBRATION.supportHorizonSeconds * (0.65 + read * 0.35)
      : 0.65 * read;
  let target = projectedAt(horizon);
  let launchPlan = derivePassLaunchPlan(state, passer, receiver, target, semanticIntent, delivery);
  if (predictsPath) {
    for (
      let iteration = 0;
      iteration < PASS_MEETING_CALIBRATION.meetingIterations;
      iteration += 1
    ) {
      horizon = Math.min(
        PASS_MEETING_CALIBRATION.maximumHorizonSeconds,
        launchPlan.predictedArrivalTime,
      );
      target = projectedAt(horizon);
      launchPlan = derivePassLaunchPlan(state, passer, receiver, target, semanticIntent, delivery);
    }
    // A very flat/long launch or a clipped boundary must never demand physically impossible motion.
    for (let correction = 0; correction < 3; correction += 1) {
      const eta = estimatePlayerArrivalTime(state, receiver, target, 'intercept');
      if (
        eta.estimatedTime <=
        launchPlan.predictedArrivalTime + PASS_MEETING_CALIBRATION.arrivalToleranceSeconds
      )
        break;
      horizon *= 0.75;
      target = projectedAt(horizon);
      launchPlan = derivePassLaunchPlan(state, passer, receiver, target, semanticIntent, delivery);
    }
  }
  const movementProjection =
    (target.x - receiver.position.x) * direction.x + (target.y - receiver.position.y) * direction.y;
  const reachableArrival = estimatePlayerArrivalTime(state, receiver, target, 'intercept');
  if (
    predictsPath &&
    (movementProjection < PASS_MEETING_CALIBRATION.minimumPathSeparationMetres ||
      reachableArrival.estimatedTime >
        launchPlan.predictedArrivalTime + PASS_MEETING_CALIBRATION.arrivalToleranceSeconds)
  ) {
    semanticIntent = 'support';
    horizon = PASS_MEETING_CALIBRATION.supportHorizonSeconds;
    target = projectedAt(horizon);
    launchPlan = derivePassLaunchPlan(state, passer, receiver, target, semanticIntent, delivery);
  }
  const arrival = launchPlan.predictedArrivalTime;
  const leadDistance = distance(receiver.position, target);
  const movement =
    leadDistance < 0.6 ? 'hold' : semanticIntent === 'support' ? 'meet_ball' : 'continue_run';
  return passReceptionProjectionSchema.parse({
    releaseTarget: target,
    expectedReceptionPoint: target,
    estimatedBallArrival: arrival,
    estimatedReceiverArrival: estimatePlayerArrivalTime(state, receiver, target, 'intercept')
      .estimatedTime,
    receiverMovement: movement,
    leadDistance,
    passerReadQuality: read,
    receiverAwarenessDelay: awarenessDelay,
    launchPlan,
    receiverReadiness: launchPlan.receiverReadiness,
    semanticIntent,
    predictionHorizon: horizon,
    movementProjection:
      (target.x - receiver.position.x) * direction.x +
      (target.y - receiver.position.y) * direction.y,
  });
};

export const resolveReceptionOutcome = (
  state: TacticalMatchState,
  receiver: MatchPlayerState,
  contactPoint: PitchPoint,
): ReceptionOutcome => {
  const a = receiver.profile.attributes;
  const speed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  const ballSpeed = Math.hypot(
    state.ball.velocity?.x ?? 0,
    state.ball.velocity?.y ?? 0,
    state.ball.velocity?.z ?? 0,
  );
  // At physical contact the ball/receiver displacement can be zero or an envelope edge. The
  // incoming velocity is the authoritative direction from which a live delivery approaches.
  const horizontalSpeed = Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0);
  const incomingVector =
    horizontalSpeed > 0.2
      ? { x: -(state.ball.velocity?.x ?? 0), y: -(state.ball.velocity?.y ?? 0) }
      : { x: state.ball.x - receiver.position.x, y: state.ball.y - receiver.position.y };
  const incomingFacing = angleForVector(incomingVector);
  const facingError = Math.abs(normalizeAngle(incomingFacing - receiver.facingAngle));
  const preparation =
    state.receptionPreparation?.actorId === receiver.id
      ? Math.max(0, state.time - state.receptionPreparation.awarenessAt)
      : 0;
  const readiness = projectReceiverReadiness(
    state,
    receiver,
    contactPoint,
    preparation,
    state.currentAction?.type === 'pass' ? state.currentAction.intent : 'support',
  );
  // Facing has already been integrated canonically throughout the approach. Subtracting the
  // whole preparation time again forgave even a receiver who remained facing away at contact.
  // Side-on control is ordinary professional technique. Only contact behind the body is an
  // awkward turn; actual facing still matters even after a long preparation interval.
  const readinessPenalty = Math.max(0, facingError / Math.PI - 0.55) * 0.2;
  const incomingHeight = state.ball.height ?? 0;
  const contactVector = {
    x: contactPoint.x - receiver.position.x,
    y: contactPoint.y - receiver.position.y,
  };
  const lateral =
    contactVector.x * Math.cos(receiver.facingAngle) -
    contactVector.y * Math.sin(receiver.facingAngle);
  const weakerSide = receiver.profile.dominantFoot === 'right' ? lateral < -0.15 : lateral > 0.15;
  const weakFootDifficulty = weakerSide ? 1 - receiver.profile.weakFootProficiency / 100 : 0;
  const pressure = Math.max(0, Math.min(1, state.currentPressure));
  const handlingSkill = (a.firstTouch + a.technique + a.concentration) / 300;
  // The launch forecast's preferred arrival speed is deliberately gentle for pass selection.
  // It is not a hard physiological limit: a prepared professional can cushion a firm delivery.
  const preparedSpeedCapacity =
    Math.min(1.2, preparation) *
    (2 + handlingSkill * 4) *
    Math.max(0.25, 1 - facingError / Math.PI) *
    (1 - pressure * 0.25);
  const comfortableSpeed = readiness.maximumComfortableArrivalSpeed + preparedSpeedCapacity;
  const technicalQuality =
    (a.firstTouch * 2 + a.technique + a.agility + a.composure + a.concentration) / 600 -
    pressure * 0.2 -
    Math.max(0, ballSpeed - comfortableSpeed) / 35 -
    Math.max(0, speed - 6.5) / 30 -
    readinessPenalty -
    Math.max(0, incomingHeight - 0.18) * 0.12 -
    weakFootDifficulty * 0.1;
  // Preparation is a material advantage, not merely a tiny bonus. This keeps ordinary support
  // football stable while fast, blind or pressured arrivals still expose technical weakness.
  const quality = Math.max(
    0,
    Math.min(
      1,
      technicalQuality + 0.14 + Math.min(0.14, Math.max(0, readiness.preparationMargin) * 0.1),
    ),
  );
  const movingWithIntent =
    speed > 0.7 &&
    ((state.receptionPreparation?.actorId === receiver.id &&
      state.receptionPreparation.movement !== 'wait') ||
      (state.pendingReceptionIntent?.actorId === receiver.id &&
        state.pendingReceptionIntent.action.type === 'carry'));
  const kind =
    quality >= 0.64 && movingWithIntent
      ? 'directional_control'
      : quality >= 0.55
        ? 'clean_control'
        : quality >= 0.34
          ? 'heavy_touch'
          : 'failed_control';
  const displacement =
    kind === 'directional_control'
      ? Math.min(1.8, speed * 0.25)
      : kind === 'heavy_touch'
        ? 1.3 + (0.55 - quality) * 2
        : kind === 'failed_control'
          ? 2.2 + (0.34 - quality) * 3
          : 0;
  const displacementDirection =
    kind === 'directional_control' && speed > 0.1
      ? { x: receiver.velocity.x / speed, y: receiver.velocity.y / speed }
      : horizontalSpeed > 0.1
        ? {
            x: (state.ball.velocity?.x ?? 0) / horizontalSpeed,
            y: (state.ball.velocity?.y ?? 0) / horizontalSpeed,
          }
        : { x: Math.sin(receiver.facingAngle), y: Math.cos(receiver.facingAngle) };
  const displacedPoint = {
    x: contactPoint.x + displacementDirection.x * displacement,
    y: contactPoint.y + displacementDirection.y * displacement,
  };
  const resultingPoint =
    displacement > 0
      ? kind === 'directional_control'
        ? clampPitchPoint(displacedPoint)
        : displacedPoint
      : undefined;
  const selected =
    state.pendingReceptionIntent?.actorId === receiver.id &&
    state.pendingReceptionIntent.action.type === 'carry'
      ? state.pendingReceptionIntent.action.target
      : undefined;
  const selectedVector = selected
    ? { x: selected.x - contactPoint.x, y: selected.y - contactPoint.y }
    : receiver.velocity;
  const selectedLength = Math.hypot(selectedVector.x, selectedVector.y);
  const turnAlignment =
    speed > 0.1 && selectedLength > 0.1
      ? Math.max(
          0,
          (selectedVector.x * receiver.velocity.x + selectedVector.y * receiver.velocity.y) /
            (selectedLength * speed),
        )
      : 1;
  const momentumRetention =
    kind === 'directional_control'
      ? (0.88 + quality * 0.08) * (0.7 + turnAlignment * 0.3)
      : kind === 'clean_control'
        ? 0.72 + quality * 0.14
        : kind === 'heavy_touch'
          ? 0.42
          : 0.18;
  return receptionOutcomeSchema.parse({
    receiverId: receiver.id,
    kind,
    contactPoint,
    quality: {
      score: quality,
      pressure,
      incomingSpeed: ballSpeed,
      incomingHeight,
      facingError,
      preparationSeconds: preparation,
      weakFootDifficulty,
    },
    ...(resultingPoint ? { resultingPoint } : {}),
    momentumRetention,
    retainedVelocity: {
      x: receiver.velocity.x * momentumRetention,
      y: receiver.velocity.y * momentumRetention,
    },
  });
};
