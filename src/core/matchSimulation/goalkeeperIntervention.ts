import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { BALL_PHYSICS, integrateBallFlight, type PhysicalBall } from './ballPhysics';
import { BALL_RADIUS, GOAL_HEIGHT } from './ballFlight';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';

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
  timeAvailable: z.number().nonnegative(),
  contactPoint: z.object({ x: z.number(), y: z.number(), z: z.number().nonnegative() }),
  requiredDisplacement: z.number().nonnegative(),
  reachable: z.boolean(),
});
export type GoalkeeperProjectionDiagnostic = z.infer<typeof goalkeeperProjectionDiagnosticSchema>;

export interface GoalkeeperProjection {
  keeper: MatchPlayerState;
  reactionDelay: number;
  timeAvailable: number;
  contactPoint: { x: number; y: number; z: number };
  requiredDisplacement: number;
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
  const step = 0.025;
  let elapsed = 0;
  const attackingRight = shooter?.team === 'home';
  while (elapsed < maxSeconds) {
    const next = integrateBallFlight(physical, step);
    elapsed += step;
    const crossed = attackingRight
      ? physical.position.x <= keeper.position.x && next.position.x >= keeper.position.x
      : physical.position.x >= keeper.position.x && next.position.x <= keeper.position.x;
    physical = next;
    if (crossed) break;
    if (Math.hypot(next.velocity.x, next.velocity.y) < 0.15) return undefined;
  }
  const facingError = Math.abs(
    normalizeAngle(
      angleForVector({ x: state.ball.x - keeper.position.x, y: state.ball.y - keeper.position.y }) -
        keeper.facingAngle,
    ),
  );
  const attributes = keeper.profile.attributes;
  const reactionDelay = 0.42 - attributes.reflexes * 0.0022 + (facingError / Math.PI) * 0.24;
  const movementTime = Math.max(0, elapsed - reactionDelay);
  const acceleration = 3.2 + (attributes.agility / 100) * 5.5;
  const maximumSpeed = 3.6 + attributes.agility * 0.035;
  const accelerationTime = Math.min(movementTime, maximumSpeed / acceleration);
  const reachableDistance =
    0.8 +
    0.5 * acceleration * accelerationTime * accelerationTime +
    Math.max(0, movementTime - accelerationTime) * maximumSpeed;
  const requiredDisplacement = Math.hypot(
    physical.position.y - keeper.position.y,
    Math.max(0, physical.position.z - GOAL_HEIGHT * 0.42),
  );
  return {
    keeper,
    reactionDelay,
    timeAvailable: elapsed,
    contactPoint: physical.position,
    requiredDisplacement,
    reachable: elapsed >= reactionDelay && requiredDisplacement <= reachableDistance,
  };
};

/** Semantic result is sampled only after physical keeper contact. */
export const resolveGoalkeeperContact = (
  state: TacticalMatchState,
  projection: GoalkeeperProjection,
  impactSpeed: number,
): GoalkeeperSaveOutcome => {
  if (!projection.reachable) return 'failed_save';
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
  if (rng.bool(Math.max(0.05, Math.min(0.9, handling - difficulty * 0.58)))) return 'catch';
  return rng.bool(Math.max(0.2, Math.min(0.8, handling - difficulty * 0.25)))
    ? 'parry_away'
    : 'parry';
};

// Re-exported for diagnostics/calibration without duplicating physical constants.
export const GOALKEEPER_PHYSICS = {
  fixedProjectionStep: 0.025,
  gravity: BALL_PHYSICS.gravity,
} as const;
