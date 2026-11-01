import { z } from 'zod';
import type { MatchPlayerState } from './matchState';
import { physicalPointSchema } from './matchSpace';
import { deriveMovementCapability, projectSprintEpisode } from './locomotion';
import { deriveFitnessPhysicalModifiers, advanceMatchFitness } from './matchFitness';
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

/** Transport shared by the ordinary semi-implicit step and its contact remainder.
 * The actuator has already spent this tick's dt budget before transport begins.
 * A collision changes physical velocity, not the target or the actuator budget. */
export const integrateCanonicalBodyRemainder = (
  player: Pick<MatchPlayerState, 'position' | 'velocity'>,
  dt: number,
) => ({
  x: player.position.x + player.velocity.x * dt,
  y: player.position.y + player.velocity.y * dt,
});

/** Replace nominal movement accounting after one externally witnessed body impulse.
 * Distance follows both real transport segments; passive delta-v is excluded from
 * the actuator's acceleration/braking work. No new injury exposure is introduced. */
export const accountCanonicalContactMovement = (
  before: MatchPlayerState,
  nominal: MatchPlayerState,
  actual: MatchPlayerState,
  travelled: number,
  dt: number,
  at: number,
): MatchPlayerState => {
  const speed = (p: MatchPlayerState) => Math.hypot(p.velocity.x, p.velocity.y);
  const motorSpeed = speed(nominal),
    previousSpeed = speed(before),
    finalSpeed = speed(actual);
  const averageSpeed = travelled / dt;
  const sprint = projectSprintEpisode(
    before,
    averageSpeed / deriveMovementCapability(before).maximumSprintSpeed,
    at,
    dt,
  );
  const prior = before.locomotionTelemetry ?? {
    distanceTotal: 0,
    distanceWalk: 0,
    distanceJog: 0,
    distanceRun: 0,
    distanceSprint: 0,
    sprintSeconds: 0,
    sprintBursts: 0,
    maxSpeed: 0,
  };
  const distances = {
    distanceWalk: prior.distanceWalk,
    distanceJog: prior.distanceJog,
    distanceRun: prior.distanceRun,
    distanceSprint: prior.distanceSprint,
  };
  const band = sprint.actualSprinting
    ? 'distanceSprint'
    : averageSpeed < 2.2
      ? 'distanceWalk'
      : averageSpeed < 4.2
        ? 'distanceJog'
        : 'distanceRun';
  distances[band] += travelled;
  const turn =
    previousSpeed > 0.1 && motorSpeed > 0.1
      ? Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (before.velocity.x * nominal.velocity.x + before.velocity.y * nominal.velocity.y) /
                (previousSpeed * motorSpeed),
            ),
          ),
        )
      : 0;
  const result: MatchPlayerState = {
    ...actual,
    fitness: advanceMatchFitness(before, {
      dt,
      distance: travelled,
      speed: averageSpeed,
      previousSpeed,
      actuatorSpeed: motorSpeed,
      turnRadians: turn,
      sprinting: sprint.actualSprinting,
      sprintBurst: sprint.countBurst,
      pressing: nominal.locomotionReason === 'press_commit',
    }),
    locomotionTelemetry: {
      ...prior,
      ...distances,
      distanceTotal: prior.distanceTotal + travelled,
      sprintSeconds: prior.sprintSeconds + (sprint.actualSprinting ? dt : 0),
      sprintBursts: prior.sprintBursts + (sprint.countBurst ? 1 : 0),
      maxSpeed: Math.max(prior.maxSpeed, motorSpeed, finalSpeed),
    },
    sprintBurstCounted: sprint.sprintBurstCounted,
    meanPosition: {
      x: (before.meanPosition.x * before.samples + actual.position.x) / actual.samples,
      y: (before.meanPosition.y * before.samples + actual.position.y) / actual.samples,
    },
  };
  delete result.sprintStartedAt;
  delete result.sprintRecoveryStartedAt;
  if (sprint.sprintStartedAt !== undefined) result.sprintStartedAt = sprint.sprintStartedAt;
  if (sprint.sprintRecoveryStartedAt !== undefined)
    result.sprintRecoveryStartedAt = sprint.sprintRecoveryStartedAt;
  return result;
};

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
    position: integrateCanonicalBodyRemainder({ position: player.position, velocity }, dt),
  };
};
