import { RandomGenerator } from '../random/RandomGenerator';
import type { TacticalMatchState } from './matchState';
import { clampPitchPoint, distance, type TeamSide } from './matchSpace';
import { integrateBallFlight } from './ballPhysics';
import { awardNaturalRestart } from './restartScenarios';
import { beginStoppage } from './stoppageLedger';
import { BALL_RADIUS, GOAL_WIDTH, GOAL_HEIGHT } from './ballFlight';
import { resolveDeadBallPerimeter } from './deadBallEnclosure';

export const beginPostGoalReaction = (
  state: TacticalMatchState,
  scoringTeam: TeamSide,
  scorerId: string,
  goalId: string,
): TacticalMatchState => {
  if (state.postGoal?.goalId === goalId) return state;
  const kickoffTeam: TeamSide = scoringTeam === 'home' ? 'away' : 'home';
  const urgent = state.time >= 75 * 60 && state.score[scoringTeam] <= state.score[kickoffTeam];
  const scorer = state.players.find((p) => p.id === scorerId);
  const retrievalCandidates = state.players.filter(
    (p) => p.team === scoringTeam && !state.discipline?.[p.id]?.sentOff,
  );
  const retriever = retrievalCandidates.sort(
    (a, b) =>
      distance(a.position, state.ball) - distance(b.position, state.ball) ||
      a.id.localeCompare(b.id),
  )[0];
  if (!retriever) return state;
  const rng = RandomGenerator.fromSeed(`${state.seed}:goal-reaction:${goalId}`);
  const targets = Object.fromEntries(
    state.players.map((player) => {
      let target = player.neutralAnchor;
      if (
        !urgent &&
        player.team === scoringTeam &&
        scorer &&
        distance(player.position, scorer.position) < 22
      )
        target = clampPitchPoint({
          x: scorer.position.x + (rng.float() - 0.5) * 3,
          y: scorer.position.y + (rng.float() - 0.5) * 3,
        });
      else
        target = {
          x:
            player.team === 'home'
              ? Math.min(player.neutralAnchor.x, 49)
              : Math.max(player.neutralAnchor.x, 56),
          y: player.neutralAnchor.y,
        };
      return [player.id, target];
    }),
  );
  const next: TacticalMatchState = {
    ...state,
    scenario: 'open_play' as const,
    postGoal: {
      goalId,
      scoringTeam,
      kickoffTeam,
      startedAt: state.time,
      urgent,
      retrieverId: retriever.id,
      reactionUntil: state.time + (urgent ? 0.6 : 3 + rng.float() * 4),
      targets,
    },
  };
  delete next.restart;
  delete next.restartTouchRestriction;
  delete next.pendingPlayerDecision;
  delete next.onBallPreparation;
  delete next.ballCarrierIntent;
  delete next.controlledBallContact;
  return beginStoppage(next, goalId, 'goal');
};

export const preparePostGoalMovement = (state: TacticalMatchState): TacticalMatchState => {
  if (!state.postGoal) return state;
  return {
    ...state,
    players: state.players.map((player) => {
      const target =
        state.postGoal!.urgent && player.id === state.postGoal!.retrieverId
          ? { x: state.ball.x, y: state.ball.y }
          : (state.postGoal!.targets[player.id] ?? player.target);
      return { ...player, target, idealTarget: target };
    }),
  };
};

/** A small canonical goal enclosure arrests the scored ball; its collision is independent of art. */
export const advancePostGoalReaction = (
  state: TacticalMatchState,
  dt: number,
): TacticalMatchState => {
  const reaction = state.postGoal;
  if (!reaction) return state;
  const integrated = resolveDeadBallPerimeter(
    integrateBallFlight(
      {
        position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0 },
        velocity: {
          x: state.ball.velocity?.x ?? 0,
          y: state.ball.velocity?.y ?? 0,
          z: state.ball.velocity?.z ?? 0,
        },
        airborne: state.ball.airborne ?? false,
        bounceCount: state.ball.bounceCount ?? 0,
        ...(state.ball.spin ? { spin: state.ball.spin } : {}),
      },
      dt,
    ),
  );
  const backX = reaction.scoringTeam === 'home' ? 107.4 : -2.4;
  if (
    (reaction.scoringTeam === 'home' && integrated.position.x > backX) ||
    (reaction.scoringTeam === 'away' && integrated.position.x < backX)
  ) {
    integrated.position.x = backX;
    integrated.velocity.x *= -0.08;
    integrated.velocity.y *= 0.3;
    integrated.velocity.z *= 0.3;
  }
  const behindGoal =
    reaction.scoringTeam === 'home' ? integrated.position.x > 105 : integrated.position.x < 0;
  if (behindGoal) {
    const halfWidth = GOAL_WIDTH / 2 - BALL_RADIUS;
    if (Math.abs(integrated.position.y - 34) > halfWidth) {
      integrated.position.y = 34 + Math.sign(integrated.position.y - 34) * halfWidth;
      integrated.velocity.y *= -0.08;
    }
    if (integrated.position.z > GOAL_HEIGHT - BALL_RADIUS) {
      integrated.position.z = GOAL_HEIGHT - BALL_RADIUS;
      integrated.velocity.z *= -0.08;
    }
  }
  let next: TacticalMatchState = {
    ...state,
    ball: {
      ...state.ball,
      x: integrated.position.x,
      y: integrated.position.y,
      height: integrated.position.z,
      velocity: integrated.velocity,
      airborne: integrated.airborne,
      bounceCount: integrated.bounceCount,
      ...(integrated.spin ? { spin: integrated.spin } : {}),
    },
  };
  const retriever = state.players.find((p) => p.id === reaction.retrieverId);
  const reachable = Boolean(
    retriever && distance(retriever.position, next.ball) <= 1.1 && (next.ball.height ?? 0) <= 1.6,
  );
  const slowed = Math.hypot(integrated.velocity.x, integrated.velocity.y) <= 3;
  if (
    !state.periodEndPending &&
    state.time >= reaction.reactionUntil &&
    slowed &&
    (!reaction.urgent || reachable)
  ) {
    next = awardNaturalRestart(next, 'kick_off', {
      restartTeam: reaction.kickoffTeam,
      cause: 'goal',
      incidentId: reaction.goalId,
      eventAt: reaction.startedAt,
      incidentPoint: { x: state.ball.x, y: state.ball.y },
    });
    if (reaction.urgent && retriever)
      next = {
        ...next,
        restart: {
          ...next.restart!,
          retrieval: {
            playerId: retriever.id,
            stage: 'transport',
            attachedOffset: {
              x: next.ball.x - retriever.position.x,
              y: next.ball.y - retriever.position.y,
            },
          },
        },
      };
  }
  return next;
};
