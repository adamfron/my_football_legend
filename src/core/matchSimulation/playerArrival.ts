import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint } from './matchSpace';
import { deriveMovementCapability, projectLocomotion } from './locomotion';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import { integrateCanonicalMovement } from './canonicalMovement';
import { angleForVector } from './playerOrientation';

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

type ArrivalMemo = WeakMap<
  TacticalMatchState,
  WeakMap<MatchPlayerState, Map<string, Pick<PlayerArrivalEstimate, 'estimatedTime' | 'reachable'>>>
>;
let arrivalMemo: ArrivalMemo | undefined;
let memoAllowed = true;
/** One pure ranking transaction only. No cache survives a decision, physical tick or
 * changed world view. The disabled mode is used by exact-output development checks. */
export const withArrivalForecastCache = <T>(run: () => T, enabled = true): T => {
  const previous = arrivalMemo,
    previousAllowed = memoAllowed;
  memoAllowed = memoAllowed && enabled;
  arrivalMemo = memoAllowed ? (arrivalMemo ?? new WeakMap()) : undefined;
  try {
    return run();
  } finally {
    arrivalMemo = previous;
    memoAllowed = previousAllowed;
  }
};

/** Prescribed-objective engineering forecast. Reuses finite body turning, support loading,
 * directional speed and braking. Fitness is frozen over this short forecast; tactical target
 * changes, other bodies and contact readiness remain outside this positional estimate. */
export const projectCanonicalArrival = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  target: PitchPoint,
  intent: 'normal' | 'intercept' | 'loose_ball' = 'normal',
) => {
  let memo: Map<string, Pick<PlayerArrivalEstimate, 'estimatedTime' | 'reachable'>> | undefined;
  const coordinate = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
  const key = `${intent}:${coordinate(target.x)}:${coordinate(target.y)}`;
  if (arrivalMemo) {
    let players = arrivalMemo.get(state);
    if (!players) {
      players = new WeakMap();
      arrivalMemo.set(state, players);
    }
    memo = players.get(player);
    if (!memo) {
      memo = new Map();
      players.set(player, memo);
    }
    const cached = memo.get(key);
    if (cached) return { ...cached };
  }
  const finish = (result: Pick<PlayerArrivalEstimate, 'estimatedTime' | 'reachable'>) => {
    if (memo && memo.size < 2048) memo.set(key, { ...result });
    return result;
  };
  const projectedState =
    intent === 'normal'
      ? { ...state }
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
  const body = { ...player };
  for (let tick = 0; tick <= 400; tick++) {
    if (distance(body.position, target) <= 0.8)
      return finish({ estimatedTime: tick * 0.025, reachable: true });
    if (tick === 400) break;
    projectedState.time = state.time + tick * 0.025;
    const locomotion = projectLocomotion(projectedState, body, target);
    const motion = integrateCanonicalMovement(body, {
      target,
      targetSpeed: locomotion.targetSpeed,
      desiredFacingAngle: angleForVector({
        x: target.x - body.position.x,
        y: target.y - body.position.y,
      }),
      dt: 0.025,
      balance: 1,
      receivingMomentum: false,
      structural:
        intent === 'normal' &&
        ['structural_adjustment', 'maintain_shape', 'support_run'].includes(locomotion.reason),
    });
    body.position = motion.position;
    body.velocity = motion.velocity;
    body.facingAngle = motion.facingAngle;
    body.plantBalance = motion.plantBalance;
  }
  return finish({ estimatedTime: 10, reachable: false });
};

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

    if (state.experimentalCanonicalArrival)
      return playerArrivalEstimateSchema.parse({
        distance: metres,
        initialSpeed,
        targetSpeed,
        turnAngle,
        accelerationTime,
        target,
        ...projectCanonicalArrival(state, player, target, intent),
      });

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
