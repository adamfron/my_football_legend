import { z } from 'zod';
import type { MatchPlayerState } from './matchState';
import { physicalPointSchema } from './matchSpace';
import { deriveMovementCapability } from './locomotion';
import { deriveFitnessPhysicalModifiers } from './matchFitness';
import { derivePlantBalance, advanceVerticalJump } from './bodyMechanics';
import {
  classifyRelativeMovement,
  integrateFacing,
  movementModeSpeedFactor,
} from './playerOrientation';

export const movementExecutionSchema = z.object({
  target: physicalPointSchema,
  targetSpeed: z.number().nonnegative(),
  desiredFacingAngle: z.number().finite(),
  dt: z.number().positive(),
  balance: z.number().min(0).max(1).default(1),
  structural: z.boolean().default(false),
  receivingMomentum: z.boolean().default(false),
});
export type MovementExecution = z.infer<typeof movementExecutionSchema>;

/** The match's finite body integration, shared with prescribed laboratory objectives.
 * Tactical target selection, pitch boundaries and external contacts remain with the caller.
 * Keep arithmetic order stable: extraction must not retune existing match trajectories. */
export const integrateCanonicalMovement = (player: MatchPlayerState, input: MovementExecution) => {
  const { target, targetSpeed, desiredFacingAngle, dt, balance, structural, receivingMomentum } =
    input;
  const dx = target.x - player.position.x,
    dy = target.y - player.position.y,
    d = Math.max(0.001, Math.hypot(dx, dy));
  const fitnessEffects = deriveFitnessPhysicalModifiers(player);
  const facingAngle = integrateFacing(
    player.facingAngle,
    desiredFacingAngle,
    player.profile.attributes.agility,
    Math.hypot(player.velocity.x, player.velocity.y),
    dt * fitnessEffects.turning * balance,
  );
  const movementMode = classifyRelativeMovement(facingAngle, { x: dx, y: dy }, d);
  const maxSpeed = targetSpeed * (receivingMomentum ? 1 : movementModeSpeedFactor(movementMode));
  const capability = deriveMovementCapability(player);
  const plantBalance = derivePlantBalance(
    player,
    { x: (dx / d) * maxSpeed, y: (dy / d) * maxSpeed },
    dt,
  );
  const accelerationRate = capability.acceleration * balance * plantBalance.balance;
  const remaining = Math.max(0, d - (structural ? 0.65 : 0.08));
  const arrivalSpeed = Math.sqrt(2 * accelerationRate * remaining);
  const desiredSpeed = Math.min(maxSpeed, arrivalSpeed, remaining / dt);
  const desiredVelocity = { x: (dx / d) * desiredSpeed, y: (dy / d) * desiredSpeed };
  const previousSpeed = Math.hypot(player.velocity.x, player.velocity.y);
  const braking = desiredSpeed < previousSpeed;
  const acceleration = accelerationRate * dt * (braking ? fitnessEffects.braking : 1);
  const velocityDelta = {
    x: desiredVelocity.x - player.velocity.x,
    y: desiredVelocity.y - player.velocity.y,
  };
  const velocityDeltaLength = Math.hypot(velocityDelta.x, velocityDelta.y);
  const velocityScale = velocityDeltaLength > acceleration ? acceleration / velocityDeltaLength : 1;
  const velocity = {
    x: player.velocity.x + velocityDelta.x * velocityScale,
    y: player.velocity.y + velocityDelta.y * velocityScale,
  };
  return {
    facingAngle,
    movementMode,
    capability,
    previousSpeed,
    plantBalance,
    ...(player.verticalJump ? { verticalJump: advanceVerticalJump(player.verticalJump, dt) } : {}),
    velocity,
    position: { x: player.position.x + velocity.x * dt, y: player.position.y + velocity.y * dt },
  };
};
