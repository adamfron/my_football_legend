import { z } from 'zod';
import { projectFutureBallTrajectory, deriveLaunchVelocity } from './ballPhysics';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

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
});
export type PassLaunchPlan = z.infer<typeof passLaunchPlanSchema>;
export type PassLaunchIntent = 'support' | 'progressive' | 'direct' | 'lead' | 'through';

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
): PassLaunchPlan => {
  const metres = distance(passer.position, target);
  const attributes = passer.profile.attributes;
  const receiverSpeed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  const technique = (attributes.passing + attributes.technique + attributes.composure) / 300;
  const pressure = Math.max(0, Math.min(1, state.currentPressure));
  const intentPace =
    intent === 'direct' || intent === 'through'
      ? 4.2
      : intent === 'lead'
        ? 1.8
        : intent === 'progressive'
          ? 1.2
          : 0;
  // Rolling resistance makes very soft balls stop early; 7–9 m/s is enough for short support play,
  // while distance and intent continuously add pace.
  const speed = Math.max(
    7.2,
    Math.min(
      30,
      7.4 +
        metres * 0.39 +
        intentPace +
        receiverSpeed * 0.16 +
        pressure * 1.1 +
        (0.65 - technique) * 1.4,
    ),
  );
  const elevation =
    intent === 'direct' && metres > 25 ? 0.28 : intent === 'through' && metres > 30 ? 0.16 : 0;
  const velocity = deriveLaunchVelocity(passer.position, target, speed, elevation);
  const samples = projectFutureBallTrajectory(
    {
      position: { ...passer.position, z: 0.11 },
      velocity,
      airborne: elevation > 0,
      bounceCount: 0,
    },
    6,
    0.025,
  );
  const arrival =
    samples.find((sample) => distance(sample.ball.position, target) <= 0.55) ??
    samples.reduce((best, sample) =>
      distance(sample.ball.position, target) < distance(best.ball.position, target) ? sample : best,
    );
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
  });
};
