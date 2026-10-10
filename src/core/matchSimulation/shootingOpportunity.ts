import { isMatchGoalkeeper } from './matchGoalkeeper';
import { z } from 'zod';
import { distance, distanceToSegment, PITCH_LENGTH, PITCH_WIDTH } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { approximateShotPlacement, deriveShootingDifficulty } from './shootingDifficulty';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

export const shotRelevanceSchema = z.enum(['non_viable', 'speculative', 'credible', 'high_value']);

export const shootingOpportunitySchema = z.object({
  distance: z.number().nonnegative(),
  angle: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
  blockingDefenders: z.number().int().nonnegative(),
  blockingDemand: z.number().nonnegative(),
  visibleTargetArea: z.number().min(0).max(1),
  goalkeeper: z.object({
    goalkeeperId: z.string().optional(),
    distanceFromGoalCentre: z.number().nonnegative(),
    distanceFromGoalLine: z.number().nonnegative(),
    estimatedRecoveryTime: z.number().nonnegative(),
    estimatedShotTravelTime: z.number().nonnegative(),
    goalCoverage: z.number().min(0).max(1),
  }),
  baseXg: z.number().min(0).max(1),
  shooterExecutionQuality: z.number().min(0).max(1),
  effectiveScoringExpectation: z.number().min(0).max(1),
  category: shotRelevanceSchema,
  /** @deprecated Compatibility projection; use effectiveScoringExpectation. */
  value: z.number().min(0).max(1),
});
export type ShootingOpportunity = z.infer<typeof shootingOpportunitySchema>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Chance quality is geometry-first. Player ability is applied only to the execution projection. */
export const evaluateShootingOpportunity = (
  state: TacticalMatchState,
  shooter: MatchPlayerState,
): ShootingOpportunity => {
  const goal = { x: shooter.team === 'home' ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  const metres = distance(shooter.position, goal);
  const lateral = Math.abs(shooter.position.y - PITCH_WIDTH / 2);
  const angle = clamp01(1 - lateral / Math.max(7, metres * 0.62));
  // Pressure is observable geometry. Keeper skill must never change the shooter's launch;
  // shooter composure/technique answer this demand inside the shared execution profile.
  const nearby = state.players
    .filter((player) => player.team !== shooter.team)
    .map((player) => ({ player, metres: distance(player.position, shooter.position) }))
    .filter(({ metres }) => metres < 14)
    .sort((a, b) => a.metres - b.metres);
  const nearest = nearby[0];
  const closing = nearest
    ? Math.max(
        0,
        -(
          nearest.player.velocity.x * (nearest.player.position.x - shooter.position.x) +
          nearest.player.velocity.y * (nearest.player.position.y - shooter.position.y)
        ) / Math.max(0.2, nearest.metres),
      )
    : 0;
  const pressure = nearest
    ? clamp01(
        (1 - nearest.metres / 14) * 0.62 +
          Math.min(0.15, closing / 35) +
          Math.min(0.15, (nearby.length - 1) * 0.06),
      )
    : 0;
  const blockingDefenders = state.players.filter(
    (player) =>
      player.team !== shooter.team &&
      !isMatchGoalkeeper(player) &&
      distance(player.position, shooter.position) < metres &&
      distanceToSegment(player.position, shooter.position, goal) < 1.65,
  ).length;
  const blockingDemand = state.players
    .filter((player) => player.team !== shooter.team && !isMatchGoalkeeper(player))
    .reduce((sum, player) => {
      const progress =
        ((player.position.x - shooter.position.x) * (goal.x - shooter.position.x) +
          (player.position.y - shooter.position.y) * (goal.y - shooter.position.y)) /
        Math.max(0.01, metres * metres);
      const insideFlight = clamp01(progress * 5) * clamp01((1 - progress) * 5);
      const separation = distanceToSegment(player.position, shooter.position, goal);
      return sum + insideFlight * Math.exp(-((separation / 1.65) ** 2));
    }, 0);
  const goalkeeper = state.players.find(
    (player) => player.team !== shooter.team && isMatchGoalkeeper(player),
  );
  const goalkeeperDistance = goalkeeper ? distance(goalkeeper.position, goal) : 0;
  const estimatedRecoveryTime = goalkeeperDistance / 6.5;
  const estimatedShotTravelTime = metres / 24;
  // Coverage falls continuously as recovery becomes longer than the ball's flight. This makes a
  // stranded keeper relevant without turning a distant open goal into a close-range chance.
  const goalCoverage = goalkeeper
    ? clamp01(1 / (1 + Math.exp((estimatedRecoveryTime - estimatedShotTravelTime - 0.35) * 1.4)))
    : 0;

  // A smooth distance decay keeps 10–16 m chances useful while making 30 m attempts exceptional.
  const distanceQuality = 0.62 / (1 + Math.exp((metres - 15.5) / 4.5));
  const keeperExposureMultiplier = 1 + (1 - goalCoverage) * Math.min(5, 1 + metres / 18);
  const baseXg = clamp01(
    distanceQuality *
      (0.46 + angle * 0.7) *
      (1 - pressure * 0.5) *
      Math.pow(0.72, blockingDefenders) *
      keeperExposureMultiplier,
  );
  const visibleTargetArea = clamp01(
    1 -
      (goalkeeper
        ? goalCoverage * 0.33 * Math.exp(-Math.abs(goalkeeper.position.y - goal.y) / 4)
        : 0),
  );
  const orientation =
    Math.abs(
      normalizeAngle(
        angleForVector({ x: goal.x - shooter.position.x, y: goal.y - shooter.position.y }) -
          shooter.facingAngle,
      ),
    ) / Math.PI;
  const lateralContact =
    (state.ball.x - shooter.position.x) * Math.cos(shooter.facingAngle) -
    (state.ball.y - shooter.position.y) * Math.sin(shooter.facingAngle);
  const weakSide =
    shooter.profile.dominantFoot === 'right' ? lateralContact < -0.15 : lateralContact > 0.15;
  const execution = deriveShootingDifficulty(shooter, {
    distance: metres,
    angle,
    pressure,
    orientation,
    weakFoot: weakSide ? 1 - shooter.profile.weakFootProficiency / 100 : 0,
    incomingSpeed: 0,
    ballHeight: 0.11,
    contact: 'settled',
    intent: 'placed',
    targetWindow: 1 - visibleTargetArea,
    blockers: blockingDemand,
  });
  const shooterExecutionQuality = execution.executionQuality;
  const executionMultiplier = approximateShotPlacement(execution) * 1.16;
  const effectiveScoringExpectation = clamp01(baseXg * executionMultiplier);
  const category =
    effectiveScoringExpectation < 0.018
      ? 'non_viable'
      : effectiveScoringExpectation < 0.075
        ? 'speculative'
        : effectiveScoringExpectation < 0.24
          ? 'credible'
          : 'high_value';

  return shootingOpportunitySchema.parse({
    distance: metres,
    angle,
    pressure,
    blockingDefenders,
    blockingDemand,
    visibleTargetArea,
    goalkeeper: {
      ...(goalkeeper ? { goalkeeperId: goalkeeper.id } : {}),
      distanceFromGoalCentre: goalkeeperDistance,
      distanceFromGoalLine: goalkeeper ? Math.abs(goalkeeper.position.x - goal.x) : 0,
      estimatedRecoveryTime,
      estimatedShotTravelTime,
      goalCoverage,
    },
    baseXg,
    shooterExecutionQuality,
    effectiveScoringExpectation,
    category,
    value: effectiveScoringExpectation,
  });
};
