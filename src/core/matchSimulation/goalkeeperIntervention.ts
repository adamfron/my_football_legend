import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { BALL_PHYSICS, projectFutureBallTrajectory, type PhysicalBall } from './ballPhysics';
import { BALL_RADIUS, GOAL_HEIGHT } from './ballFlight';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { deriveMovementCapability } from './locomotion';

/** Reaction seconds, metre contact envelope, and canonical locomotion acceleration limits. */
export const GOALKEEPER_PHYSICS = {
  fixedProjectionStep: 0.025,
  gravity: BALL_PHYSICS.gravity,
  baseReactionSeconds: 0.36,
  reflexReactionReduction: 0.002,
  facingReactionSeconds: 0.18,
  contactReachMetres: 1.25,
  passiveBodyRadiusMetres: 0.5,
  contactCentreHeight: 1.05,
  baseMaximumSpeed: 3.6,
  agilityMaximumSpeed: 0.035,
} as const;

export const goalkeeperSaveOutcomeSchema = z.enum([
  'catch',
  'parry',
  'parry_away',
  'failed_save',
  'no_chance',
]);
export type GoalkeeperSaveOutcome = z.infer<typeof goalkeeperSaveOutcomeSchema>;

export const goalkeeperProjectionDiagnosticSchema = z.object({
  keeperId: z.string(),
  reactionDelay: z.number().nonnegative(),
  reactionRemaining: z.number().nonnegative(),
  ballTotalFlightTime: z.number().nonnegative(),
  ballRemainingFlightTime: z.number().nonnegative(),
  timeAvailable: z.number().nonnegative(),
  contactPoint: z.object({ x: z.number(), y: z.number(), z: z.number().nonnegative() }),
  requiredDisplacement: z.number().nonnegative(),
  availableReach: z.number().nonnegative(),
  reachable: z.boolean(),
});
export type GoalkeeperProjectionDiagnostic = z.infer<typeof goalkeeperProjectionDiagnosticSchema>;

export interface GoalkeeperProjection {
  keeper: MatchPlayerState;
  reactionDelay: number;
  reactionRemaining: number;
  ballTotalFlightTime: number;
  ballRemainingFlightTime: number;
  timeAvailable: number;
  contactPoint: { x: number; y: number; z: number };
  requiredDisplacement: number;
  availableReach: number;
  reachable: boolean;
}

/**
 * Projects the physical flight to the keeper's x coordinate. This is advisory geometry:
 * the ordinary locomotion system still moves the keeper and segment collision decides contact.
 */
export const projectGoalkeeperIntervention = (
  state: TacticalMatchState,
  maxSeconds = 6,
): GoalkeeperProjection | undefined => {
  const shot = state.ball.shot;
  const velocity = state.ball.velocity;
  if (!shot || !velocity) return undefined;
  const shooter = state.players.find((player) => player.id === shot.shooterId);
  const keeper = state.players.find(
    (player) => player.team !== shooter?.team && player.profile.primaryPosition === 'goalkeeper',
  );
  if (!keeper) return undefined;
  let physical: PhysicalBall = {
    position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? BALL_RADIUS },
    velocity: { x: velocity.x, y: velocity.y, z: velocity.z ?? 0 },
    airborne: state.ball.airborne ?? false,
    bounceCount: state.ball.bounceCount ?? 0,
  };
  let elapsed = 0;
  let crossedInterventionPlane = false;
  const attackingRight = shooter?.team === 'home';
  for (const sample of projectFutureBallTrajectory(physical, maxSeconds, 0.025)) {
    const next = sample.ball;
    elapsed = sample.at;
    const crossed = attackingRight
      ? physical.position.x <= keeper.position.x && next.position.x >= keeper.position.x
      : physical.position.x >= keeper.position.x && next.position.x <= keeper.position.x;
    physical = next;
    if (crossed) {
      crossedInterventionPlane = true;
      break;
    }
    if (Math.hypot(next.velocity.x, next.velocity.y) < 0.15) return undefined;
  }
  // The final forecast sample is not a contact point. A projection exists only when the ball
  // genuinely traverses the keeper's intervention plane.
  if (!crossedInterventionPlane) return undefined;
  const facingError = Math.abs(
    normalizeAngle(
      angleForVector({ x: state.ball.x - keeper.position.x, y: state.ball.y - keeper.position.y }) -
        keeper.facingAngle,
    ),
  );
  const attributes = keeper.profile.attributes;
  const c = GOALKEEPER_PHYSICS;
  const reactionDelay =
    c.baseReactionSeconds -
    (shot.distance < 18 && shot.blockingDefenders <= 1 ? attributes.oneOnOnes * 0.0007 : 0) -
    attributes.reflexes * c.reflexReactionReduction +
    (facingError / Math.PI) * c.facingReactionSeconds;
  // Reaction belongs to the shot episode, not to this particular projection tick. The current
  // keeper position already incorporates any movement made on previous ticks, so only the
  // unconsumed part of the original delay may be deducted from the remaining flight.
  const ballTotalFlightTime = state.ball.flightTime ?? 0;
  const reactionRemaining = Math.max(0, reactionDelay - ballTotalFlightTime);
  const movementTime = Math.max(0, elapsed - reactionRemaining);
  const acceleration = deriveMovementCapability(keeper).acceleration;
  const maximumSpeed = c.baseMaximumSpeed + attributes.agility * c.agilityMaximumSpeed;
  const initialSpeed = Math.min(
    maximumSpeed,
    Math.max(0, Math.sign(physical.position.y - keeper.position.y) * keeper.velocity.y),
  );
  const accelerationTime = Math.min(movementTime, (maximumSpeed - initialSpeed) / acceleration);
  const reachableDistance =
    c.contactReachMetres +
    initialSpeed * accelerationTime +
    0.5 * acceleration * accelerationTime * accelerationTime +
    Math.max(0, movementTime - accelerationTime) * maximumSpeed;
  const requiredDisplacement = Math.hypot(
    physical.position.y - keeper.position.y,
    Math.max(0, physical.position.z - c.contactCentreHeight),
  );
  return {
    keeper,
    reactionDelay,
    reactionRemaining,
    ballTotalFlightTime,
    ballRemainingFlightTime: elapsed,
    timeAvailable: elapsed,
    contactPoint: physical.position,
    requiredDisplacement,
    availableReach: reachableDistance,
    // `elapsed` is the remaining flight from the current tick. Comparing it with the full
    // reaction delay made an already-reacted keeper become unreachable again near the goal.
    reachable: reactionRemaining <= elapsed && requiredDisplacement <= reachableDistance,
  };
};

/** Semantic result is sampled only after physical keeper contact. */
export const resolveGoalkeeperContact = (
  state: TacticalMatchState,
  projection: GoalkeeperProjection,
  impactSpeed: number,
): GoalkeeperSaveOutcome => {
  if (!projection.reachable || projection.reactionRemaining > 0) return 'failed_save';
  const a = projection.keeper.profile.attributes;
  const difficulty = Math.min(
    1,
    projection.requiredDisplacement / 3.2 +
      impactSpeed / 55 +
      projection.contactPoint.z / (GOAL_HEIGHT * 5),
  );
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:keeper-contact:${state.ball.shot?.shotId}:${state.ball.bounceCount ?? 0}`,
  );
  const handling = (a.handling * 0.5 + a.concentration * 0.25 + a.positioning * 0.25) / 100;
  if (rng.bool(Math.max(0.12, Math.min(0.88, handling + 0.14 - difficulty * 0.48)))) return 'catch';
  return rng.bool(Math.max(0.2, Math.min(0.8, handling - difficulty * 0.25)))
    ? 'parry_away'
    : 'parry';
};
