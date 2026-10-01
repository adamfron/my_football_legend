import { z } from 'zod';
import { clampPitchPoint, distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { derivePassLaunchPlan, passLaunchPlanSchema, type PassDelivery } from './passLaunchPlan';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { projectReceiverReadiness, receiverReadinessProjectionSchema } from './receiverReadiness';
import { estimatePlayerArrivalTime } from './playerArrival';
import { projectLocomotion } from './locomotion';

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

export const receptionOutcomeSchema = z.object({
  receiverId: z.string(),
  kind: z.enum(['clean_control', 'directional_control', 'heavy_touch', 'failed_control']),
  contactPoint: pitchPointSchema,
  resultingPoint: pitchPointSchema.optional(),
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
  const incomingFacing = angleForVector({
    x: state.ball.x - receiver.position.x,
    y: state.ball.y - receiver.position.y,
  });
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
  const turnAllowance = Math.min(
    1,
    preparation * (2.2 + receiver.profile.attributes.agility * 0.038),
  );
  const readinessPenalty = Math.max(0, facingError / Math.PI - turnAllowance) * 0.3;
  const technicalQuality =
    (a.firstTouch + a.technique + a.agility + a.composure + a.gameReading) / 500 -
    state.currentPressure * 0.18 -
    Math.max(0, ballSpeed - readiness.maximumComfortableArrivalSpeed) / 30 -
    Math.max(0, speed - 6.5) / 30 -
    readinessPenalty;
  // Preparation is a material advantage, not merely a tiny bonus. This keeps ordinary support
  // football stable while fast, blind or pressured arrivals still expose technical weakness.
  const quality =
    technicalQuality + 0.14 + Math.min(0.2, Math.max(0, readiness.preparationMargin) * 0.13);
  const movingWithIntent =
    speed > 0.7 &&
    state.receptionPreparation?.actorId === receiver.id &&
    state.receptionPreparation.movement !== 'wait';
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
        ? 1.25
        : 0;
  const resultingPoint =
    displacement > 0
      ? clampPitchPoint({
          x: contactPoint.x + (receiver.velocity.x / Math.max(0.1, speed)) * displacement,
          y: contactPoint.y + (receiver.velocity.y / Math.max(0.1, speed)) * displacement,
        })
      : undefined;
  return receptionOutcomeSchema.parse({
    receiverId: receiver.id,
    kind,
    contactPoint,
    ...(resultingPoint ? { resultingPoint } : {}),
  });
};
