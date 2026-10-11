import { z } from 'zod';
import { clampPitchPoint, distanceToSegment, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { deriveMovementCapability } from './locomotion';
import { estimatePlayerArrivalTime } from './playerArrival';
import { earliestDefenderArrival } from './passDecision';

export const predictedRunSchema = z.object({
  playerId: z.string(),
  origin: z.object({ x: z.number(), y: z.number() }),
  velocity: z.object({ x: z.number(), y: z.number() }),
  intendedDirection: z.object({ x: z.number(), y: z.number() }),
  points: z.array(
    z.object({ t: z.number().positive(), position: z.object({ x: z.number(), y: z.number() }) }),
  ),
});
export type PredictedRun = z.infer<typeof predictedRunSchema>;

/** Observational short-horizon projection. It neither consumes RNG nor authors movement. */
export const predictReachableRun = (
  player: MatchPlayerState,
  options: { horizon?: number; step?: number; attackingDirection?: 1 | -1 } = {},
): PredictedRun => {
  const horizon = Math.max(0.5, Math.min(2.5, options.horizon ?? 2.5));
  const step = Math.max(0.25, Math.min(1, options.step ?? 0.5));
  const desired = {
    x: player.target.x - player.position.x,
    y: player.target.y - player.position.y,
  };
  const desiredLength = Math.hypot(desired.x, desired.y);
  const speed = Math.hypot(player.velocity.x, player.velocity.y);
  const fallbackX = options.attackingDirection ?? (player.team === 'home' ? 1 : -1);
  const desiredDirection = {
    x: desired.x / Math.max(0.2, desiredLength),
    y: desired.y / Math.max(0.2, desiredLength),
  };
  const direction =
    speed > 0.2
      ? { x: player.velocity.x / speed, y: player.velocity.y / speed }
      : desiredLength > 0.2 && (player.duty !== 'attack' || desiredDirection.x * fallbackX >= 0)
        ? desiredDirection
        : { x: fallbackX, y: 0 };
  const capability = deriveMovementCapability(player);
  const maxSpeed = capability.maximumSprintSpeed;
  const acceleration = capability.acceleration;
  const points: PredictedRun['points'] = [];
  for (let t = step; t <= horizon + 1e-9; t += step) {
    const reachableSpeed = Math.min(maxSpeed, speed + acceleration * t);
    const travel =
      speed < 0.2 && desiredLength < 0.2
        ? 0
        : Math.min(desiredLength, speed * t + 0.5 * acceleration * t * t, reachableSpeed * t);
    points.push({
      t,
      position: clampPitchPoint({
        x: player.position.x + direction.x * travel,
        y: player.position.y + direction.y * travel,
      }),
    });
  }
  return {
    playerId: player.id,
    origin: { ...player.position },
    velocity: { ...player.velocity },
    intendedDirection: direction,
    points,
  };
};

export interface SpacePassEvaluation {
  target: PitchPoint;
  attackerArrival: number;
  defenderArrival: number;
  laneRisk: number;
  utility: number;
}

export const evaluateRunSpace = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  runner: MatchPlayerState,
): SpacePassEvaluation | undefined => {
  const run = predictReachableRun(runner);
  const defenders = state.players.filter((p) => p.team !== passer.team);
  return run.points
    .map(({ t, position }) => {
      const defenderArrival = earliestDefenderArrival(state, defenders, position);
      const attackerArrival = Math.max(
        t,
        estimatePlayerArrivalTime(state, runner, position, 'intercept').estimatedTime,
      );
      const laneRisk = defenders.reduce(
        (risk, defender) =>
          risk +
          Math.max(0, 1 - distanceToSegment(defender.position, passer.position, position) / 5),
        0,
      );
      const progress = (passer.team === 'home' ? 1 : -1) * (position.x - runner.position.x);
      const boundary = Math.min(position.y, 68 - position.y, position.x, 105 - position.x);
      return {
        target: position,
        attackerArrival,
        defenderArrival,
        laneRisk,
        utility:
          progress * 1.4 +
          (defenderArrival - attackerArrival) * 12 -
          laneRisk * 8 +
          Math.min(5, boundary),
      };
    })
    .sort((a, b) => b.utility - a.utility)[0];
};
