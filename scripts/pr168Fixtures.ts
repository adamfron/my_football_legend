import { createFormationBenchmarkMatch } from '../src/core/matchSimulation/benchmarkFixtures';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions';

/** Equivalent controlled physical state; the user's original replay is unavailable. */
export const pushedTouchFixture = (
  input: {
    loose?: boolean;
    reversed?: boolean;
    pressure?: boolean;
    gap?: number;
    ballSpeed?: number;
    boundary?: boolean;
  } = {},
) => {
  let { state } = createFormationBenchmarkMatch({
    anchor: '4-3-3',
    opponent: '4-4-2',
    seed: 'pr168-pushed-touch',
    attributes: 73,
  });
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 600;
  state.actionCooldown = 30;
  state.playerAgencyEnabled = true;
  const dir = input.reversed ? -1 : 1;
  state.endsSwitched = Boolean(input.reversed);
  state.players.forEach((p, i) => {
    p.endsSwitched = Boolean(input.reversed);
    p.position = { x: p.team === 'home' ? 15 : 95, y: 4 + (i % 10) * 6 };
    p.velocity = { x: 0, y: 0 };
    p.target = { ...p.position };
  });
  const actor = state.players[8]!;
  actor.position = { x: 60, y: input.boundary ? 1 : 34 };
  actor.target = { x: 60 + dir * 20, y: actor.position.y };
  actor.velocity = { x: dir * 6, y: 0 };
  actor.facingAngle = (dir * Math.PI) / 2;
  state.controlledFootballerId = actor.id;
  state.ball = {
    x: 60 + dir * 0.4,
    y: actor.position.y,
    ownerId: actor.id,
    lastTouchPlayerId: actor.id,
    velocity: { x: dir * 7, y: 0 },
  };
  state.ballOwnershipStartedAt = state.time;
  state.possessionTeam = actor.team;
  state = resolveMatchAction(
    state,
    { type: 'carry', actorId: actor.id, target: actor.target, movementMode: 'sprint' },
    'human_selected',
  );
  state.ball = {
    ...state.ball,
    x: 60 + dir * (input.gap ?? 2.6),
    velocity: { x: dir * (input.ballSpeed ?? 7), y: input.boundary ? -5 : 0 },
  };
  if (input.loose) {
    delete state.ball.ownerId;
    state.ball.looseSince = state.time;
    state.ballEpisode = (state.ballEpisode ?? 0) + 1;
  }
  if (input.pressure)
    state.players[15]!.position = { x: state.ball.x + dir * 1.5, y: actor.position.y + 1 };
  return { state, actorId: actor.id, dir };
};
