import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';

export const receiverReadinessProjectionSchema = z.object({
  contactPoint: pitchPointSchema,
  awareAt: z.number().nonnegative(),
  readyAt: z.number().nonnegative(),
  earliestUsefulContactTime: z.number().nonnegative(),
  preferredArrivalSpeed: z.number().positive(),
  maximumComfortableArrivalSpeed: z.number().positive(),
  preparationMargin: z.number(),
  movementTime: z.number().nonnegative(),
  orientationTime: z.number().nonnegative(),
});
export type ReceiverReadinessProjection = z.infer<typeof receiverReadinessProjectionSchema>;

/** Canonical, RNG-free receiver forecast shared by option, launch and first-touch resolution. */
export const projectReceiverReadiness = (
  state: TacticalMatchState,
  receiver: MatchPlayerState,
  contactPoint: PitchPoint,
  ballEta: number,
  intent: 'support' | 'progressive' | 'direct' | 'lead' | 'through' = 'support',
): ReceiverReadinessProjection => {
  const a = receiver.profile.attributes;
  const awarenessDelay = Math.max(
    0.09,
    0.72 - (a.gameReading + a.concentration) / 285 + state.currentPressure * 0.12,
  );
  const incomingAngle = angleForVector({
    x: state.ball.x - receiver.position.x,
    y: state.ball.y - receiver.position.y,
  });
  const facingError = Math.abs(normalizeAngle(incomingAngle - receiver.facingAngle));
  const turnRate = 1.9 + a.agility * 0.025;
  const orientationTime = facingError / turnRate;
  const contactDistance = distance(receiver.position, contactPoint);
  const existingSpeed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  const usefulSpeed = Math.max(2.4, 2.8 + a.pace * 0.035, existingSpeed * 0.75);
  const movementTime = contactDistance / usefulSpeed;
  const readyAt = awarenessDelay + Math.max(orientationTime, movementTime);
  const technique = (a.firstTouch + a.technique + a.agility + a.gameReading) / 400;
  const pressure = Math.max(0, Math.min(1, state.currentPressure));
  const intentPace =
    intent === 'support' ? 0 : intent === 'progressive' ? 1.4 : intent === 'lead' ? 2 : 3.2;
  const preferredArrivalSpeed = Math.max(3.2, 4.3 + intentPace + pressure * 1.2 - technique * 0.8);
  const maximumComfortableArrivalSpeed = preferredArrivalSpeed + 3.2 + technique * 2.4;
  return receiverReadinessProjectionSchema.parse({
    contactPoint,
    awareAt: awarenessDelay,
    readyAt,
    earliestUsefulContactTime: readyAt + 0.12,
    preferredArrivalSpeed,
    maximumComfortableArrivalSpeed,
    preparationMargin: ballEta - readyAt,
    movementTime,
    orientationTime,
  });
};
