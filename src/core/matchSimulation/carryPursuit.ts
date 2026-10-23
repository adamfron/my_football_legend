import { z } from 'zod';
import { clampPitchPoint, distance, pitchPointSchema } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { integrateGroundRolling } from './ballPhysics';
import { estimatePlayerArrivalTime } from './playerArrival';
import { playerContactGeometry } from './ballContactGeometry';
import { canParticipatePhysically } from './matchInjuries';
import { isBallWithinPlayingBoundary } from './pitchBoundary';

export const carryPursuitSchema = z.object({
  target: pitchPointSchema,
  arrival: z.number().nonnegative(),
});

/** A forecast approach, never possession. A deliberate carry and its own last touch can
 * continue for either controller; a release, another touch or new movement ends it. */
export const deriveCarryPursuit = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const intent = state.ballCarrierIntent;
  if (
    !intent ||
    intent.actorId !== actor.id ||
    (intent.humanSelected && actor.id !== state.controlledFootballerId) ||
    state.scenario !== 'open_play' ||
    state.ball.travelKind ||
    state.ball.shot ||
    (state.ball.ownerId && state.ball.ownerId !== actor.id) ||
    state.ball.lastTouchPlayerId !== actor.id ||
    state.time >= intent.expiresAt ||
    !canParticipatePhysically(actor) ||
    state.playerMovementIntent?.actorId === actor.id ||
    (state.ball.height ?? 0) > 0.65 ||
    distance(actor.position, state.ball) > 8
  )
    return undefined;
  const feet = playerContactGeometry(actor);
  if (
    Math.min(distance(feet.leftFoot, state.ball), distance(feet.rightFoot, state.ball)) <=
    feet.footReach
  )
    return state.ball.ownerId
      ? undefined
      : carryPursuitSchema.parse({ target: clampPitchPoint(state.ball), arrival: 0 });
  for (let index = 1; index <= 8; index++) {
    const seconds = index * 0.25;
    const point = integrateGroundRolling(
      state.ball,
      state.ball.velocity ?? { x: 0, y: 0 },
      seconds,
    ).position;
    if (!isBallWithinPlayingBoundary(point)) return undefined;
    const target = clampPitchPoint(point);
    const arrival = estimatePlayerArrivalTime(state, actor, target, 'loose_ball');
    if (arrival.reachable && arrival.estimatedTime <= seconds + 0.1)
      return carryPursuitSchema.parse({ target, arrival: arrival.estimatedTime });
  }
  return undefined;
};
