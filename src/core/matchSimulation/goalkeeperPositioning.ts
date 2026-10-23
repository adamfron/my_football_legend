import { GOAL_CENTRE_Y } from './ballFlight';
import { attacksRight, PITCH_LENGTH, type PitchPoint, type TeamOrientation } from './matchSpace';
import { z } from 'zod';
import { clampPitchPoint, distance, pitchPointSchema } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { estimatePlayerArrivalTime } from './playerArrival';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';

export const goalkeeperApproachSchema = z.object({
  target: pitchPointSchema,
  keeperEta: z.number().nonnegative(),
  coveringEta: z.number().nonnegative(),
  attackerEta: z.number().nonnegative(),
  reason: z.literal('uncovered_ground_attack'),
});

/** Read the approaching body and available cover before a shot exists. This only
 * proposes a set position; claims, tackle access and saves retain physical authority. */
export const deriveGoalkeeperApproach = (state: TacticalMatchState, keeper: MatchPlayerState) => {
  if (
    state.scenario !== 'open_play' ||
    state.restart ||
    state.postGoal ||
    state.ball.shot ||
    state.ball.travelKind ||
    state.ball.x < 0 ||
    state.ball.x > PITCH_LENGTH ||
    state.ball.y < 0 ||
    state.ball.y > 68 ||
    (state.ball.height ?? 0) > 0.65 ||
    (state.playerAgencyEnabled !== false && state.controlledFootballerId === keeper.id)
  )
    return undefined;
  const attacker = state.players.find((p) => p.id === state.ball.ownerId && p.team !== keeper.team);
  if (!attacker || !canParticipatePhysically(attacker)) return undefined;
  const goal = { x: attacksRight(keeper) ? 0 : PITCH_LENGTH, y: GOAL_CENTRE_Y };
  const metres = distance(state.ball, goal);
  if (metres < 4 || metres > 32 || Math.abs(state.ball.y - 34) > 22) return undefined;
  const coveringEta = Math.min(
    99,
    ...state.players
      .filter(
        (p) =>
          p.team === keeper.team &&
          !isMatchGoalkeeper(p) &&
          canParticipatePhysically(p) &&
          !state.discipline?.[p.id]?.sentOff &&
          distance(p.position, goal) < distance(attacker.position, goal) + 1 &&
          distance(p.position, attacker.position) < 12,
      )
      .map(
        (p) =>
          estimatePlayerArrivalTime(state, p, clampPitchPoint(attacker.position), 'intercept')
            .estimatedTime,
      ),
  );
  if (coveringEta < 0.75) return undefined;
  const a = keeper.profile.attributes;
  const reading = (a.oneOnOnes + a.gameReading + a.positioning) / 300;
  // Stay on the observed ball-goal ray, leaving room to set, turn or retreat.
  // The depth is a destination, never extra reach or an automatic save.
  const depth = Math.min(metres - 2.5, 4 + reading * 4.5);
  const target = clampPitchPoint({
    x: goal.x + ((state.ball.x - goal.x) / metres) * depth,
    y: goal.y + ((state.ball.y - goal.y) / metres) * depth,
  });
  return goalkeeperApproachSchema.parse({
    target,
    coveringEta,
    keeperEta: estimatePlayerArrivalTime(state, keeper, target, 'intercept').estimatedTime,
    attackerEta: estimatePlayerArrivalTime(state, attacker, target, 'intercept').estimatedTime,
    reason: 'uncovered_ground_attack',
  });
};

export const GOALKEEPER_BASE_POSITION = {
  /** Metres from goal line in settled shape; active claim/rush commitments use their own target. */
  minimumDepth: 1,
  closePlayDepthIncrease: 2.5,
  proximityRange: 70,
} as const;

/** Positions along the ball-to-goal-centre ray, with bounded depth as play approaches. */
export const deriveGoalkeeperBasePosition = (
  ball: PitchPoint,
  side: TeamOrientation,
): PitchPoint => {
  const goal = { x: attacksRight(side) ? 0 : PITCH_LENGTH, y: GOAL_CENTRE_Y };
  const dx = ball.x - goal.x;
  const dy = ball.y - goal.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const proximity = Math.max(
    0,
    Math.min(1, 1 - distance / GOALKEEPER_BASE_POSITION.proximityRange),
  );
  const depth =
    GOALKEEPER_BASE_POSITION.minimumDepth +
    proximity * GOALKEEPER_BASE_POSITION.closePlayDepthIncrease;
  return {
    x: goal.x + (dx / distance) * depth,
    y: goal.y + (dy / distance) * depth,
  };
};
