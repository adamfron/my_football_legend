import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyPlayerDecision,
  chooseNpcAction,
  createTacticalMatch,
  enumerateAvailableActions,
  letAiDecide,
  projectPlayerDecisionProbe,
  projectPlayerDecisionOpportunity,
  projectContextualInteractions,
  evaluateControlledPlayerBallRelevance,
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

  it('does not let historical action fields deadlock a meaningful receiver decision', () => {
    const state = makeState();
    state.currentAction = { type: 'hold', actorId: state.players[1]!.id };
    state.latestAction = state.currentAction;
    const opportunity = projectPlayerDecisionOpportunity(state);
    expect(opportunity?.kind).toBe('on_ball');
    expect(projectPlayerDecisionProbe(state).candidate).toBe(true);
    expect(stepTacticalMatch(state, 0.025)).toBe(state);
  });

  it('keeps routine possession automatic and diagnoses its blocker', () => {
    const state = makeState();
    const actor = state.players.find((player) => player.id === state.controlledFootballerId)!;
    actor.position = { x: 51, y: 8 };
    state.ball = { ...actor.position, ownerId: actor.id };
    for (const opponent of state.players.filter((player) => player.team !== actor.team))
      opponent.position = { x: Math.max(0, actor.position.x - 15), y: 50 };
    state.actionCooldown = 0;
    expect(projectPlayerDecisionProbe(state).blockedReason).toBe('routine');
    expect(stepTacticalMatch(state, 0.025).decisionIndex).toBeGreaterThan(state.decisionIndex);
  });

  it('executes carry through tactical recomputation and restores tactical control', () => {
    const state = makeState();
    const actor = state.players.find((player) => player.id === state.controlledFootballerId)!;
    for (const opponent of state.players.filter((player) => player.team !== actor.team))
      opponent.position = { x: 20, y: 60 };
    const target = { x: actor.position.x + 8, y: actor.position.y + 3 };
    let carried = resolveMatchAction(state, { type: 'carry', actorId: actor.id, target });
    const startDistance = Math.hypot(target.x - actor.position.x, target.y - actor.position.y);
    delete carried.controlledFootballerId;
    for (let index = 0; index < 40; index += 1) carried = stepTacticalMatch(carried, 0.025);
    const moving = carried.players.find((player) => player.id === actor.id)!;
    expect(moving.target).toEqual(target);
    expect(Math.hypot(target.x - moving.position.x, target.y - moving.position.y)).toBeLessThan(
      startDistance,
    );
    for (let index = 0; index < 100; index += 1) carried = stepTacticalMatch(carried, 0.025);
    expect(carried.ballCarrierIntent).toBeUndefined();
    expect(carried.players.find((player) => player.id === actor.id)!.target).not.toEqual(target);
  });

  it('resolves a selected action through the identical canonical resolver exactly once', () => {
    const state = makeState(),
      opportunity = projectPlayerDecisionOpportunity(state)!;
    const option = opportunity.options.find(
      (candidate) => candidate.kind === 'action' && candidate.action.type === 'pass',
    )!;
    if (option.kind !== 'action') throw new Error('expected canonical action');
    const gated = {
      ...state,
      playerDecisionGate: {
        lastSituationSignature: opportunity.signature,
        lastResolvedAt: state.time,
      },
    };
    const resolved = applyPlayerDecision(state, opportunity, option.id);
    expect(resolved).toEqual(resolveMatchAction(gated, option.action));
    expect(applyPlayerDecision(resolved, opportunity, option.id)).toBe(resolved);
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

  it('projects target-first menus without mutating the snapshot', () => {
    const state = makeState(),
      snapshot = structuredClone(state),
      opportunity = projectPlayerDecisionOpportunity(state)!;
    const teammate = state.players.find(
      (player) =>
        player.team === 'home' &&
        player.id !== opportunity.actorId &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const menu = projectContextualInteractions(state, opportunity, {
      kind: 'player',
      playerId: teammate.id,
    });
    expect(menu.length).toBeGreaterThan(0);
    expect(
      menu.every(
        (item) =>
          item.resolution.kind === 'action' &&
          (item.resolution.action.type !== 'pass' ||
            item.resolution.action.receiverId === teammate.id),
      ),
    ).toBe(true);
    expect(
      projectContextualInteractions(state, opportunity, {
        kind: 'space',
        point: { x: 91, y: 36 },
      }).some((item) => item.labelKey === 'carry_here'),
    ).toBe(true);
    expect(
      projectContextualInteractions(state, opportunity, { kind: 'goal', side: 'away' }).every(
        (item) => item.resolution.kind === 'action' && item.resolution.action.type === 'shot',
      ),
    ).toBe(true);
    expect(
      projectContextualInteractions(state, opportunity, {
        kind: 'player',
        playerId: state.players.find((player) => player.team === 'away')!.id,
      }),
    ).toEqual([]);
    expect(state).toEqual(snapshot);
  });

  it('rejects a distant dominated loose ball and accepts an immediate contest', () => {
    const state = makeState(),
      actor = state.players.find((player) => player.id === state.controlledFootballerId)!;
    state.ball = { x: actor.position.x - 20, y: actor.position.y, looseSince: state.time };
    state.players.find((player) => player.id !== actor.id)!.position = {
      x: state.ball.x + 1,
      y: state.ball.y,
    };
    expect(evaluateControlledPlayerBallRelevance(state, actor.id).relevant).toBe(false);
    state.ball = { x: actor.position.x + 3, y: actor.position.y, looseSince: state.time };
    for (const player of state.players.filter((player) => player.id !== actor.id))
      player.position = { x: actor.position.x + 4, y: actor.position.y + 4 };
    expect(evaluateControlledPlayerBallRelevance(state, actor.id).relevant).toBe(true);
  });

  it('skips through the canonical NPC path and spectator mode never projects', () => {
    const state = makeState(),
      opportunity = projectPlayerDecisionOpportunity(state)!;
    const action = chooseNpcAction(state, opportunity.actorId)!;
    expect(letAiDecide(state, opportunity)).toEqual(
      resolveMatchAction(
        {
          ...state,
          playerDecisionGate: {
            lastSituationSignature: opportunity.signature,
            lastResolvedAt: state.time,
          },
        },
        action,
      ),
    );
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
