import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import { projectLocomotion } from './locomotion';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

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
  const acceleration = 3.2 + (player.profile.attributes.agility / 100) * 5.5;
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
  let position = { ...player.position };
  let velocity = { ...player.velocity };
  let estimatedTime = 0;
  while (estimatedTime < 10 && distance(position, target) > 0.8) {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const remaining = Math.max(0.001, Math.hypot(dx, dy));
    const desired = { x: (dx / remaining) * targetSpeed, y: (dy / remaining) * targetSpeed };
    const change = { x: desired.x - velocity.x, y: desired.y - velocity.y };
    const changeLength = Math.hypot(change.x, change.y);
    const scale = changeLength > acceleration * dt ? (acceleration * dt) / changeLength : 1;
    velocity = { x: velocity.x + change.x * scale, y: velocity.y + change.y * scale };
    position = { x: position.x + velocity.x * dt, y: position.y + velocity.y * dt };
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
};
