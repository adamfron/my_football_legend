import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { attacksRight, physicalPointSchema, distance } from './matchSpace';
import { RandomGenerator } from '../random/RandomGenerator';
import { deriveLaunchVelocity, ballSpinSchema } from './ballPhysics';
import { deriveFitnessPhysicalModifiers } from './matchFitness';

const v = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
export const goalkeeperThrowPlanSchema = z.object({
  release: v,
  velocity: v,
  spin: ballSpinSchema,
  intendedTarget: physicalPointSchema,
  physicalTarget: physicalPointSchema,
  angularError: z.number().finite(),
  speed: z.number().positive(),
  elevation: z.number().finite(),
  predictedFlightTime: z.number().positive(),
});
export const canThrowGoalkeeperBall = (state: TacticalMatchState, keeper: MatchPlayerState) =>
  isMatchGoalkeeper(keeper) &&
  state.ball.ownerId === keeper.id &&
  state.ball.heldByKeeperId === keeper.id &&
  keeper.position.x >= 0 &&
  keeper.position.x <= 105 &&
  !state.restart &&
  !state.ball.travelKind &&
  distance(keeper.position, state.ball) <= 0.9 &&
  Math.abs(keeper.position.y - 34) <= 20.16 &&
  (attacksRight(keeper) ? keeper.position.x <= 16.5 : keeper.position.x >= 88.5);

/** One actual release followed by the ordinary drag/gravity/Magnus solver. A held ball is
 * required: owning a backpass at the feet never silently grants handling permission.
 */
export const deriveGoalkeeperThrow = (
  state: TacticalMatchState,
  keeper: MatchPlayerState,
  target: { x: number; y: number },
) => {
  if (!canThrowGoalkeeperBall(state, keeper)) return undefined;
  const a = keeper.profile.attributes,
    ability = a.goalkeeperThrowing / 100;
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:keeper-throw:${state.decisionIndex}:${keeper.id}`,
  );
  const gaussian =
    Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.float()))) * Math.cos(2 * Math.PI * rng.float());
  const angularError =
    gaussian *
    (0.008 +
      (1 - ability) ** 2 * 0.11 +
      state.currentPressure * 0.035 +
      (1 - a.composure / 100) * 0.012);
  const intendedAngle = Math.atan2(target.y - keeper.position.y, target.x - keeper.position.x);
  const angle = intendedAngle + angularError,
    range = distance(keeper.position, target);
  const speed =
    Math.max(3, Math.min(9 + ability * 11, Math.sqrt((range * 9.81) / Math.sin(0.7)))) *
    (0.88 + ability * 0.1) *
    deriveFitnessPhysicalModifiers(keeper).speed;
  const elevation = 0.35 + gaussian * (1 - ability) * 0.015;
  const release = {
    x: keeper.position.x,
    y: keeper.position.y,
    z: (keeper.profile.heightCm / 100) * 0.74,
  };
  const velocity = deriveLaunchVelocity(
    release,
    { x: release.x + Math.cos(angle) * range, y: release.y + Math.sin(angle) * range },
    speed,
    elevation,
  );
  return goalkeeperThrowPlanSchema.parse({
    release,
    velocity,
    spin: { x: Math.sin(angle) * -4, y: Math.cos(angle) * 4, z: angularError * 8 },
    intendedTarget: target,
    physicalTarget: {
      x: release.x + Math.cos(angle) * range,
      y: release.y + Math.sin(angle) * range,
    },
    angularError,
    speed,
    elevation,
    predictedFlightTime: Math.max(0.2, range / Math.max(1, speed * Math.cos(elevation))),
  });
};
