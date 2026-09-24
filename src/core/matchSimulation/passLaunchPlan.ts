import { z } from 'zod';
import { projectFutureBallTrajectory, deriveLaunchVelocity } from './ballPhysics';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { projectReceiverReadiness, receiverReadinessProjectionSchema } from './receiverReadiness';

export const passLaunchPlanSchema = z.object({
  target: pitchPointSchema,
  velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  speed: z.number().positive(),
  elevation: z
    .number()
    .min(0)
    .max(Math.PI / 2),
  predictedArrivalTime: z.number().positive(),
  predictedArrivalSpeed: z.number().nonnegative(),
  receiverReadiness: receiverReadinessProjectionSchema,
});
export type PassLaunchPlan = z.infer<typeof passLaunchPlanSchema>;
export type PassLaunchIntent = 'support' | 'progressive' | 'direct' | 'lead' | 'through';
export type PassDelivery = 'ground' | 'lofted';

/**
 * The one physical launch forecast used by option evaluation and release. A pass is never assigned
 * a separate "AI speed": the forecast samples the same integrator that advances the live ball.
 */
export const derivePassLaunchPlan = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  receiver: MatchPlayerState,
  target: PitchPoint,
  intent: PassLaunchIntent,
  delivery: PassDelivery = 'ground',
): PassLaunchPlan => {
  const metres = distance(passer.position, target);
  const initialEta = Math.max(0.55, metres / (intent === 'support' ? 7.2 : 10.5));
  let readiness = projectReceiverReadiness(state, receiver, target, initialEta, intent);
  const desiredArrivalTime = Math.min(
    intent === 'support' ? 2.2 : intent === 'progressive' ? 1.8 : 1.45,
    Math.max(
      intent === 'support' ? 0.72 : 0.48,
      readiness.earliestUsefulContactTime + (intent === 'support' ? 0.28 : 0.08),
      metres / (intent === 'support' ? 9 : intent === 'progressive' ? 13 : 17),
    ),
  );
  const elevation =
    delivery === 'lofted'
      ? metres > 35
        ? 0.42
        : 0.34
      : intent === 'direct' && metres > 25
        ? 0.28
        : intent === 'through' && metres > 30
          ? 0.16
          : 0;
  const forecast = (candidateSpeed: number) => {
    const velocity = deriveLaunchVelocity(passer.position, target, candidateSpeed, elevation);
    const samples = projectFutureBallTrajectory(
      {
        position: { ...passer.position, z: 0.11 },
        velocity,
        airborne: elevation > 0,
        bounceCount: 0,
      },
      8,
      0.025,
    );
    const arrival =
      samples.find((sample) => distance(sample.ball.position, target) <= 0.55) ??
      samples.reduce((best, sample) =>
        distance(sample.ball.position, target) < distance(best.ball.position, target)
          ? sample
          : best,
      );
    return { velocity, arrival };
  };
  // For rolling passes the canonical deceleration has a closed-form launch estimate. The forecast
  // below remains authoritative and reports the result through the shared integrator.
  let speed = Math.min(30, Math.max(3.2, metres / desiredArrivalTime + 1.075 * desiredArrivalTime));
  if (elevation > 0) speed = Math.min(30, Math.max(speed, (metres / desiredArrivalTime) * 1.12));
  const result = forecast(speed);
  const { velocity, arrival } = result;
  readiness = projectReceiverReadiness(state, receiver, target, arrival.at, intent);
  return passLaunchPlanSchema.parse({
    target,
    velocity,
    speed,
    elevation,
    predictedArrivalTime: Math.max(0.025, arrival.at),
    predictedArrivalSpeed: Math.hypot(
      arrival.ball.velocity.x,
      arrival.ball.velocity.y,
      arrival.ball.velocity.z,
    ),
    receiverReadiness: readiness,
  });
};
