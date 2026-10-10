import { isMatchGoalkeeper } from './matchGoalkeeper';
import { z } from 'zod';
import {
  distance,
  pitchPointSchema,
  teamSideSchema,
  toPitchPoint,
  type PhysicalPoint,
  type PitchPoint,
  type TeamSide,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  findPitchBoundaryCrossing,
  isBallWithinPlayingBoundary,
  type PitchBoundaryCrossing,
} from './pitchBoundary';
import { estimatePlayerArrivalTime } from './playerArrival';
import { canContactAfterThrowIn } from './throwIn';
import { BALL_PHYSICS, integrateGroundRolling } from './ballPhysics';
import { arbitrateGoalkeeperClaim } from './goalkeeperClaim';

export const pitchSurfacePhysicsSchema = z.object({
  rollingResistance: z.number().positive().finite(),
});
export type PitchSurfacePhysics = z.infer<typeof pitchSurfacePhysicsSchema>;

export const DEFAULT_PITCH_SURFACE: PitchSurfacePhysics = Object.freeze({
  rollingResistance: BALL_PHYSICS.rollingDeceleration,
});

/** Loose-ball callers use the same neutral grass integrator as a rolling pass. */
export const rollLooseBall = (
  position: PitchPoint,
  velocity: PhysicalPoint,
  elapsed: number,
  surface: PitchSurfacePhysics = DEFAULT_PITCH_SURFACE,
): { position: PhysicalPoint; velocity: PhysicalPoint } => {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= 0.01 || elapsed <= 0) return { position: { ...position }, velocity: { x: 0, y: 0 } };
  const rolled = integrateGroundRolling(position, velocity, elapsed, {
    rollingResistanceMultiplier: surface.rollingResistance / BALL_PHYSICS.rollingDeceleration,
  });
  return {
    // This is a physical prediction, not a tactical/presentation point.  Keeping it
    // unbounded lets the caller observe the first line crossing instead of turning
    // the touchline into a wall.
    position: {
      x: rolled.position.x,
      y: rolled.position.y,
    },
    velocity: { x: rolled.velocity.x, y: rolled.velocity.y },
  };
};

const isInsideOwnPenaltyArea = (point: PitchPoint, side: TeamSide) =>
  point.y >= 13.84 && point.y <= 54.16 && (side === 'home' ? point.x <= 16.5 : point.x >= 88.5);

export const predictLooseBallIntercept = (
  ball: PitchPoint,
  velocity: PhysicalPoint,
  player: MatchPlayerState,
):
  | { kind: 'in_play'; point: PitchPoint }
  | { kind: 'boundary'; crossing?: PitchBoundaryCrossing } => {
  const playerSpeed = 5.5 + player.profile.attributes.pace * 0.035;
  const horizon = Math.min(1.6, distance(player.position, ball) / playerSpeed);
  const predicted = rollLooseBall(ball, velocity, horizon).position;
  const crossing = findPitchBoundaryCrossing(ball, predicted);
  if (crossing) return { kind: 'boundary', crossing };
  if (!isBallWithinPlayingBoundary(predicted)) return { kind: 'boundary' };
  // Only the player's approach target is constrained to its movement envelope. The
  // actual ball is neither moved nor treated as out because its centre crossed paint.
  return { kind: 'in_play', point: toPitchPoint(predicted) };
};

export const looseBallAssignmentSchema = z.object({
  playerId: z.string(),
  team: teamSideSchema,
  target: pitchPointSchema,
  score: z.number().finite(),
  goalkeeper: z.boolean(),
  coverId: z.string().optional(),
  coverTarget: pitchPointSchema.optional(),
});
export type LooseBallAssignment = z.infer<typeof looseBallAssignmentSchema>;

export const ballRaceCandidateSchema = z.object({
  playerId: z.string(),
  team: teamSideSchema,
  interceptPoint: pitchPointSchema,
  estimatedArrivalTime: z.number().nonnegative().finite(),
  ballArrivalTime: z.number().nonnegative().finite(),
  timingDelta: z.number().finite(),
  goalkeeper: z.boolean(),
});
export type BallRaceCandidate = z.infer<typeof ballRaceCandidateSchema>;

/**
 * A global, deterministic race. Every sample compares all players at the same ball point/time;
 * the chosen point is the earliest one with a plausible contestant (or the final sample).
 */
export const evaluateGlobalBallRace = (state: TacticalMatchState): BallRaceCandidate[] => {
  if (state.ball.ownerId) return [];
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const samples = Array.from({ length: 12 }, (_, index) => (index + 1) * 0.25);
  const evaluated: { ballArrivalTime: number; candidates: BallRaceCandidate[] }[] = [];
  let previousPoint: PitchPoint = state.ball;
  let crossedBoundary = false;
  let boundaryTime: number | undefined;
  for (const ballArrivalTime of samples) {
    const interceptPoint = rollLooseBall(state.ball, velocity, ballArrivalTime).position;
    const crossing = findPitchBoundaryCrossing(previousPoint, interceptPoint);
    if (crossing) {
      crossedBoundary = true;
      boundaryTime = (evaluated.at(-1)?.ballArrivalTime ?? 0) + crossing.segmentFraction * 0.25;
      break;
    }
    if (!isBallWithinPlayingBoundary(interceptPoint)) {
      crossedBoundary = true;
      break;
    }
    const playablePoint = toPitchPoint(interceptPoint);
    const candidates = state.players.flatMap((player) => {
      if (!canContactAfterThrowIn(state, player.id)) return [];
      const goalkeeper = isMatchGoalkeeper(player);
      if (goalkeeper && !isInsideOwnPenaltyArea(playablePoint, player.team)) return [];
      const estimatedArrivalTime = estimatePlayerArrivalTime(
        state,
        player,
        playablePoint,
        'loose_ball',
      ).estimatedTime;
      return [
        {
          playerId: player.id,
          team: player.team,
          interceptPoint: playablePoint,
          estimatedArrivalTime,
          ballArrivalTime,
          timingDelta: estimatedArrivalTime - ballArrivalTime,
          goalkeeper,
        },
      ];
    });
    evaluated.push({ ballArrivalTime, candidates });
    // Boundary evidence follows the raw ball path, never its constrained approach target.
    previousPoint = interceptPoint;
  }
  const reachable = evaluated.find(({ candidates }) =>
    candidates.some(
      ({ timingDelta, estimatedArrivalTime }) =>
        timingDelta <= 0.35 && (boundaryTime === undefined || estimatedArrivalTime < boundaryTime),
    ),
  );
  const sample = reachable ?? (crossedBoundary ? undefined : evaluated.at(-1));
  if (!sample) return [];
  return sample.candidates
    .sort(
      (a, b) =>
        a.estimatedArrivalTime - b.estimatedArrivalTime || a.playerId.localeCompare(b.playerId),
    )
    .map((candidate) => ballRaceCandidateSchema.parse(candidate));
};

/** Selective, deterministic race: at most two outfield players per side plus a locally eligible keeper. */
export const deriveLooseBallAssignments = (state: TacticalMatchState): LooseBallAssignment[] => {
  if (state.ball.ownerId) return [];
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const candidates = state.players.flatMap((player) => {
    if (!canContactAfterThrowIn(state, player.id)) return [];
    const goalkeeper = isMatchGoalkeeper(player);
    const prediction = predictLooseBallIntercept(state.ball, velocity, player);
    if (prediction.kind === 'boundary') return [];
    const target = prediction.point;
    if (goalkeeper && !isInsideOwnPenaltyArea(target, player.team)) return [];
    const reading =
      (player.profile.attributes.gameReading +
        player.profile.attributes.positioning +
        player.profile.attributes.concentration) /
      300;
    const eta = estimatePlayerArrivalTime(state, player, target, 'loose_ball').estimatedTime;
    const priority = state.ball.secondBallPriorityIds?.includes(player.id) ? 0.7 : 0;
    const ownDanger = player.team === 'home' ? 1 - target.x / 105 : target.x / 105;
    const transition = state.teams[player.team].phase.includes('transition') ? 0.35 : 0;
    return [
      {
        playerId: player.id,
        team: player.team,
        target,
        goalkeeper,
        score: eta - reading * 0.65 - priority - transition - ownDanger * 0.35,
      },
    ];
  });
  return (['home', 'away'] as const).flatMap((side) => {
    const team = candidates
      .filter((candidate) => candidate.team === side)
      .sort((a, b) => a.score - b.score || a.playerId.localeCompare(b.playerId));
    const outfield = team.filter((candidate) => !candidate.goalkeeper).slice(0, 2);
    const keeper = team.find((candidate) => candidate.goalkeeper);
    if (!keeper) return outfield;
    const player = state.players.find((p) => p.id === keeper.playerId)!;
    const arbitration = arbitrateGoalkeeperClaim(state, player, keeper.target);
    if (arbitration.primaryId !== keeper.playerId) return outfield;
    const goalX = side === 'home' ? 0 : 105;
    return [
      {
        ...keeper,
        coverId: arbitration.coverId,
        coverTarget: {
          x: goalX + (keeper.target.x - goalX) * 0.5,
          y: 34 + (keeper.target.y - 34) * 0.5,
        },
      },
    ];
  });
};
