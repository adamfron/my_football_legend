import { z } from 'zod';
import { clampPitchPoint, distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

export const passReceptionProjectionSchema = z.object({
  releaseTarget: pitchPointSchema,
  expectedReceptionPoint: pitchPointSchema,
  estimatedBallArrival: z.number().positive(),
  estimatedReceiverArrival: z.number().nonnegative(),
  receiverMovement: z.enum(['hold', 'meet_ball', 'continue_run']),
  leadDistance: z.number().nonnegative(),
  passerReadQuality: z.number().min(0).max(1),
  receiverAwarenessDelay: z.number().nonnegative(),
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
});
export type ReceptionPreparation = z.infer<typeof receptionPreparationSchema>;

export const receptionOutcomeSchema = z.object({
  receiverId: z.string(),
  kind: z.enum(['clean_control', 'directional_control', 'heavy_touch', 'failed_control']),
  contactPoint: pitchPointSchema,
  resultingPoint: pitchPointSchema.optional(),
});
export type ReceptionOutcome = z.infer<typeof receptionOutcomeSchema>;

const expectedPassSpeed = (intent: 'support' | 'progressive' | 'direct') =>
  intent === 'support' ? 21 : intent === 'progressive' ? 24 : 27;

/** Pure meeting-point estimate for ordinary passes. Through balls retain reachable-space semantics. */
export const projectPassReception = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  receiver: MatchPlayerState,
  intent: 'support' | 'progressive' | 'direct',
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
  const speed = expectedPassSpeed(intent);
  let target = { ...receiver.position };
  const velocitySpeed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  const tacticalDx = receiver.target.x - receiver.position.x;
  const tacticalDy = receiver.target.y - receiver.position.y;
  const tacticalDistance = Math.hypot(tacticalDx, tacticalDy);
  const paceSpeed = 2.6 + (ra.pace / 100) * 4.2;
  const tacticalVelocity =
    tacticalDistance > 0.2
      ? {
          x: (tacticalDx / tacticalDistance) * Math.min(paceSpeed, tacticalDistance),
          y: (tacticalDy / tacticalDistance) * Math.min(paceSpeed, tacticalDistance),
        }
      : { x: 0, y: 0 };
  const motion = velocitySpeed > 0.35 ? receiver.velocity : tacticalVelocity;
  const leadStrength =
    (intent === 'support' ? 0.48 : intent === 'progressive' ? 0.78 : 0.68) * read;
  let arrival = distance(passer.position, target) / speed;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const activeTime = Math.max(0, arrival - awarenessDelay * 0.45);
    const maxLead = intent === 'support' ? 3.2 : intent === 'progressive' ? 8 : 10;
    const scale = Math.min(
      maxLead / Math.max(0.01, Math.hypot(motion.x, motion.y) * activeTime),
      leadStrength,
    );
    target = clampPitchPoint({
      x: receiver.position.x + motion.x * activeTime * scale,
      y: receiver.position.y + motion.y * activeTime * scale,
    });
    arrival = Math.max(0.45, distance(passer.position, target) / speed);
  }
  const leadDistance = distance(receiver.position, target);
  const movement =
    leadDistance < 0.6 ? 'hold' : intent === 'support' ? 'meet_ball' : 'continue_run';
  const receiverSpeed = Math.max(1.2, paceSpeed * (movement === 'continue_run' ? 0.9 : 0.65));
  return passReceptionProjectionSchema.parse({
    releaseTarget: target,
    expectedReceptionPoint: target,
    estimatedBallArrival: arrival,
    estimatedReceiverArrival: awarenessDelay + leadDistance / receiverSpeed,
    receiverMovement: movement,
    leadDistance,
    passerReadQuality: read,
    receiverAwarenessDelay: awarenessDelay,
  });
};

export const resolveReceptionOutcome = (
  state: TacticalMatchState,
  receiver: MatchPlayerState,
  contactPoint: PitchPoint,
): ReceptionOutcome => {
  const a = receiver.profile.attributes;
  const speed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  const ballSpeed =
    state.ball.travelDuration && state.ball.from && state.ball.target
      ? distance(state.ball.from, state.ball.target) / state.ball.travelDuration
      : 0;
  const quality =
    (a.firstTouch + a.technique + a.agility + a.composure + a.gameReading) / 500 -
    state.currentPressure * 0.22 -
    Math.max(0, ballSpeed - 20) / 80 -
    Math.max(0, speed - 5) / 25;
  const kind =
    quality >= 0.72 && speed > 1.2
      ? 'directional_control'
      : quality >= 0.58
        ? 'clean_control'
        : quality >= 0.42
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
