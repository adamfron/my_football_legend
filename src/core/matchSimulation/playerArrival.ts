import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import { deriveMovementCapability, projectLocomotion } from './locomotion';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';

export const playerArrivalEstimateSchema = z.object({
  distance: z.number().nonnegative().finite(),
  estimatedTime: z.number().nonnegative().finite(),
  initialSpeed: z.number().nonnegative().finite(),
  targetSpeed: z.number().positive().finite(),
  turnAngle: z.number().min(0).max(Math.PI).finite(),
  accelerationTime: z.number().nonnegative().finite(),
  reachable: z.boolean(),
  target: pitchPointSchema,
});
export type PlayerArrivalEstimate = z.infer<typeof playerArrivalEstimateSchema>;

/**
 * Canonical, RNG-free short-horizon arrival projection. It mirrors locomotion's desired-velocity
 * acceleration rather than granting a player instant top speed. The velocity vector is the single
 * authoritative source of both initial momentum and reorientation cost.
 */
export const estimatePlayerArrivalTime = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  target: PitchPoint,
  intent: 'normal' | 'intercept' | 'loose_ball' = 'normal',
): PlayerArrivalEstimate => {
  const arrivalSpan = startPerformanceSpan('interception_eta');
  try {
    const metres = distance(player.position, target);
    const initialSpeed = Math.hypot(player.velocity.x, player.velocity.y);
    const direction = {
      x: target.x - player.position.x,
      y: target.y - player.position.y,
    };
    const heading = Math.atan2(player.velocity.y, player.velocity.x);
    const targetHeading = Math.atan2(direction.y, direction.x);
    const turnAngle =
      initialSpeed > 0.2
        ? Math.abs(Math.atan2(Math.sin(targetHeading - heading), Math.cos(targetHeading - heading)))
        : 0;
    const projectedState =
      intent === 'normal'
        ? state
        : {
            ...state,
            playerMovementIntent: {
              actorId: player.id,
              type: 'attack_space' as const,
              target,
              startedAt: state.time,
              expiresAt: state.time + 10,
            },
          };
    const targetSpeed = projectLocomotion(projectedState, player, target).targetSpeed;
    const acceleration = deriveMovementCapability(player).acceleration;
    const accelerationTime =
      Math.hypot(
        (direction.x / Math.max(metres, 0.001)) * targetSpeed - player.velocity.x,
        (direction.y / Math.max(metres, 0.001)) * targetSpeed - player.velocity.y,
      ) / acceleration;

    if (metres <= 0.8)
      return playerArrivalEstimateSchema.parse({
        distance: metres,
        estimatedTime: 0,
        initialSpeed,
        targetSpeed,
        turnAngle,
        accelerationTime,
        reachable: true,
        target,
      });

    // Fixed analytical micro-steps are intentionally independent of the match tick rate.
    const dt = 0.025;
    const stepAcceleration = acceleration * dt;
    // Scalars keep the identical integration order without allocating four temporary
    // vectors at every prediction micro-step. This is also used by each loose-ball race.
    let positionX = player.position.x,
      positionY = player.position.y,
      velocityX = player.velocity.x,
      velocityY = player.velocity.y;
    let estimatedTime = 0;
    while (estimatedTime < 10) {
      const dx = target.x - positionX;
      const dy = target.y - positionY;
      // The stopping check and integration use the same distance. Avoid a second
      // hypot per micro-step while preserving the exact 0.8 m boundary and tick count.
      const remaining = Math.hypot(dx, dy);
      if (!(remaining > 0.8)) break;
      const changeX = (dx / remaining) * targetSpeed - velocityX;
      const changeY = (dy / remaining) * targetSpeed - velocityY;
      const changeLength = Math.hypot(changeX, changeY);
      const scale = changeLength > stepAcceleration ? stepAcceleration / changeLength : 1;
      velocityX = velocityX + changeX * scale;
      velocityY = velocityY + changeY * scale;
      positionX = positionX + velocityX * dt;
      positionY = positionY + velocityY * dt;
      estimatedTime += dt;
    }
    return playerArrivalEstimateSchema.parse({
      distance: metres,
      estimatedTime,
      initialSpeed,
      targetSpeed,
      turnAngle,
      accelerationTime,
      reachable: estimatedTime < 10,
      target,
    });
  } finally {
    endPerformanceSpan('interception_eta', arrivalSpan);
  }
};
