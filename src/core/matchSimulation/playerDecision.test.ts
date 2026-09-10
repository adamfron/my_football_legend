import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyPlayerDecision,
  chooseNpcAction,
  createTacticalMatch,
  enumerateAvailableActions,
  letAiDecide,
  projectPlayerDecisionOpportunity,
  resolveMatchAction,
  stepTacticalMatch,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = () => {
  const home = world.clubs[0]!;
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: home.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'player-decision',
      control: {
        mode: 'player',
        clubId: home.id,
        footballerId: home.squadPlayerIds![0]!,
        forceIntoXI: true,
      },
    }),
  );
  const actor = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  state.controlledFootballerId = actor.id;
  actor.position = { x: 85, y: 34 };
  state.ball = { ...actor.position, ownerId: actor.id };
  state.players.find((player) => player.team === 'away')!.position = {
    x: actor.position.x + 0.5,
    y: actor.position.y,
  };
  return state;
};

describe('player decision lifecycle', () => {
  it('projects canonical on-ball actions once without consuming or mutating state', () => {
    const state = makeState(),
      snapshot = structuredClone(state);
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(
      opportunity.options
        .filter((option) => option.kind === 'action')
        .map((option) => option.action),
    ).toEqual(enumerateAvailableActions(state, opportunity.actorId));
    expect(
      projectPlayerDecisionOpportunity(state, { lastSituationSignature: opportunity.signature }),
    ).toBeUndefined();
    expect(state).toEqual(snapshot);
  });

  it('resolves a selected action through the identical canonical resolver exactly once', () => {
    const state = makeState(),
      opportunity = projectPlayerDecisionOpportunity(state)!;
    const option = opportunity.options.find(
      (candidate) => candidate.kind === 'action' && candidate.action.type === 'pass',
    )!;
    if (option.kind !== 'action') throw new Error('expected canonical action');
    expect(applyPlayerDecision(state, opportunity, option.id)).toEqual(
      resolveMatchAction(state, option.action),
    );
    const advanced = stepTacticalMatch(state, 0.025);
    expect(applyPlayerDecision(advanced, opportunity, option.id)).toBe(advanced);
  });

  it('distinguishes feet and reachable-space pass targets without receiver privilege', () => {
    const state = makeState(),
      actions = enumerateAvailableActions(state, state.controlledFootballerId!);
    const through = actions.find((action) => action.type === 'pass' && action.intent === 'through');
    if (!through || through.type !== 'pass') return;
    const feet = actions.find(
      (action) =>
        action.type === 'pass' &&
        action.receiverId === through.receiverId &&
        action.intent !== 'through',
    )!;
    if (feet.type !== 'pass') throw new Error('expected pass to feet');
    expect(through.target).not.toEqual(feet.target);
    expect(resolveMatchAction(state, through).ball.ownerId).toBeUndefined();
  });

  it('skips through the canonical NPC path and spectator mode never projects', () => {
    const state = makeState(),
      opportunity = projectPlayerDecisionOpportunity(state)!;
    const action = chooseNpcAction(state, opportunity.actorId)!;
    expect(letAiDecide(state, opportunity)).toEqual(resolveMatchAction(state, action));
    delete state.controlledFootballerId;
    expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
  });

  it('offers a relevant loose-ball race and expires real movement intent', () => {
    const state = makeState(),
      actor = state.players.find((player) => player.id === state.controlledFootballerId)!;
    state.ball = { x: actor.position.x + 2, y: actor.position.y, looseSince: state.time };
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    const next = applyPlayerDecision(state, opportunity, opportunity.options[0]!.id);
    expect(next.playerMovementIntent?.target).toEqual({ x: state.ball.x, y: state.ball.y });
    let expired = next;
    for (let index = 0; index < 120; index += 1) expired = stepTacticalMatch(expired, 0.025);
    expect(expired.playerMovementIntent).toBeUndefined();
  });
});
