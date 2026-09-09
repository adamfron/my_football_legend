import { z } from 'zod';
import { clampPitchPoint, distance, type PitchPoint, type TeamSide } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

export const pitchSurfacePhysicsSchema = z.object({
  rollingResistance: z.number().positive().finite(),
  drag: z.number().nonnegative().finite().optional(),
});
export type PitchSurfacePhysics = z.infer<typeof pitchSurfacePhysicsSchema>;

export const DEFAULT_PITCH_SURFACE: PitchSurfacePhysics = Object.freeze({
  rollingResistance: 1.15,
  drag: 0.035,
});

/** Exact integration of dv/dt = -rollingResistance - drag*v along the travel direction. */
export const rollLooseBall = (
  position: PitchPoint,
  velocity: PitchPoint,
  elapsed: number,
  surface: PitchSurfacePhysics = DEFAULT_PITCH_SURFACE,
) => {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= 0.01 || elapsed <= 0) return { position: { ...position }, velocity: { x: 0, y: 0 } };
  const resistance = surface.rollingResistance;
  const drag = surface.drag ?? 0;
  const stopTime = drag > 0 ? Math.log1p((drag * speed) / resistance) / drag : speed / resistance;
  const dt = Math.min(elapsed, stopTime);
  const endSpeed =
    dt >= stopTime
      ? 0
      : drag > 0
        ? (speed + resistance / drag) * Math.exp(-drag * dt) - resistance / drag
        : speed - resistance * dt;
  const travelled =
    drag > 0
      ? ((speed + resistance / drag) * (1 - Math.exp(-drag * dt))) / drag - (resistance * dt) / drag
      : speed * dt - 0.5 * resistance * dt * dt;
  const direction = { x: velocity.x / speed, y: velocity.y / speed };
  return {
    position: clampPitchPoint({
      x: position.x + direction.x * travelled,
      y: position.y + direction.y * travelled,
    }),
    velocity: { x: direction.x * endSpeed, y: direction.y * endSpeed },
  };
};

const isInsideOwnPenaltyArea = (point: PitchPoint, side: TeamSide) =>
  point.y >= 13.84 && point.y <= 54.16 && (side === 'home' ? point.x <= 16.5 : point.x >= 88.5);

export const predictLooseBallIntercept = (
  ball: PitchPoint,
  velocity: PitchPoint,
  player: MatchPlayerState,
): PitchPoint => {
  const playerSpeed = 5.5 + player.profile.attributes.pace * 0.035;
  const horizon = Math.min(1.6, distance(player.position, ball) / playerSpeed);
  return rollLooseBall(ball, velocity, horizon).position;
};

export interface LooseBallAssignment {
  playerId: string;
  team: TeamSide;
  target: PitchPoint;
  score: number;
  goalkeeper: boolean;
}

/** Selective, deterministic race: at most two outfield players per side plus a locally eligible keeper. */
export const deriveLooseBallAssignments = (state: TacticalMatchState): LooseBallAssignment[] => {
  if (state.ball.ownerId) return [];
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const candidates = state.players.flatMap((player) => {
    const goalkeeper = player.profile.primaryPosition === 'goalkeeper';
    const target = predictLooseBallIntercept(state.ball, velocity, player);
    if (goalkeeper && !isInsideOwnPenaltyArea(target, player.team)) return [];
    const metres = distance(player.position, target);
    const reading =
      (player.profile.attributes.gameReading +
        player.profile.attributes.positioning +
        player.profile.attributes.concentration) /
      300;
    const pace = 5.5 + player.profile.attributes.pace * 0.035;
    const priority = state.ball.secondBallPriorityIds?.includes(player.id) ? 0.7 : 0;
    const ownDanger = player.team === 'home' ? 1 - target.x / 105 : target.x / 105;
    const transition = state.teams[player.team].phase.includes('transition') ? 0.35 : 0;
    return [
      {
        playerId: player.id,
        team: player.team,
        target,
        goalkeeper,
        score: metres / pace - reading * 0.65 - priority - transition - ownDanger * 0.35,
      },
    ];
  });
  return (['home', 'away'] as const).flatMap((side) => {
    const team = candidates
      .filter((candidate) => candidate.team === side)
      .sort((a, b) => a.score - b.score || a.playerId.localeCompare(b.playerId));
    const outfield = team.filter((candidate) => !candidate.goalkeeper).slice(0, 2);
    const keeper = team.find((candidate) => candidate.goalkeeper);
    return keeper && keeper.score <= (outfield[0]?.score ?? Infinity) + 0.8
      ? [...outfield, keeper]
      : outfield;
  });
};
