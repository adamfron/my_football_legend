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
  resolvePendingPlayerDecision,
  signedForwardDistance,
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
    if (option.action.type !== 'pass') throw new Error('expected pass');
    expect(resolved).toEqual(
      resolveMatchAction(
        {
          ...gated,
          ...(resolved.pendingPlayerDecision
            ? { pendingPlayerDecision: resolved.pendingPlayerDecision }
            : {}),
        },
        option.action,
      ),
    );
    expect(resolved.pendingPlayerDecision?.selectedIntent).toBe(`pass:${option.action.intent}`);
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

  it.each(['home', 'away'] as const)(
    'globally suppresses a remote %s contender dominated by players from both teams',
    (side) => {
      const state = makeState();
      const actor = state.players.find(
        (player) => player.team === side && player.profile.primaryPosition !== 'goalkeeper',
      )!;
      state.controlledFootballerId = actor.id;
      actor.position = { x: side === 'home' ? 30 : 75, y: 34 };
      state.ball = { x: 52.5, y: 34, looseSince: state.time };
      state.players
        .filter((player) => player.id !== actor.id)
        .slice(0, 4)
        .forEach((player, index) => {
          player.position = { x: 51 + index * 0.5, y: 33 + index * 0.4 };
        });
      const relevance = evaluateControlledPlayerBallRelevance(state, actor.id);
      expect(relevance.relevant).toBe(false);
      expect(relevance.bestOverall?.playerId).not.toBe(actor.id);
      expect(relevance.contenderRank).toBeGreaterThan(3);
    },
  );

  it.each(['home', 'away'] as const)(
    'only labels a %s run behind when it advances and threatens the shared defensive line',
    (side) => {
      const state = makeState();
      const actor = state.players.find(
        (player) => player.team === side && player.profile.primaryPosition !== 'goalkeeper',
      )!;
      const carrier = state.players.find(
        (player) =>
          player.team === side &&
          player.id !== actor.id &&
          player.profile.primaryPosition !== 'goalkeeper',
      )!;
      state.controlledFootballerId = actor.id;
      actor.position = { x: side === 'home' ? 65 : 40, y: 30 };
      carrier.position = { x: side === 'home' ? 60 : 45, y: 34 };
      state.ball = { ...carrier.position, ownerId: carrier.id };
      state.possessionTeam = side;
      const defenders = state.players.filter((player) => player.team !== side);
      defenders.forEach((player, index) => {
        player.position = {
          x: side === 'home' ? 76 + index * 0.2 : 29 - index * 0.2,
          y: player.position.y,
        };
      });
      const opportunity = {
        ...projectPlayerDecisionOpportunity(makeState())!,
        actorId: actor.id,
        openedAt: state.time,
        kind: 'off_ball_run' as const,
      };
      const forward = { x: side === 'home' ? 79 : 26, y: 31 };
      const interactions = projectContextualInteractions(state, opportunity, {
        kind: 'space',
        point: forward,
      });
      const run = interactions.find((item) => item.labelKey === 'run_in_behind');
      expect(run?.resolution.kind).toBe('movement');
      if (run?.resolution.kind === 'movement') {
        expect(run.resolution.intent.target).toEqual(forward);
        expect(
          signedForwardDistance(actor.position, run.resolution.intent.target, side),
        ).toBeGreaterThan(0);
      }
      const backward = { x: side === 'home' ? 48 : 57, y: 30 };
      expect(
        projectContextualInteractions(state, opportunity, { kind: 'space', point: backward }),
      ).toEqual([]);
    },
  );

  it('attributes a completed selected pass but never an autonomous action', () => {
    const state = makeState();
    expect(resolvePendingPlayerDecision(state).lastPlayerDecisionOutcome).toBeUndefined();
    const actor = state.players.find((player) => player.id === state.controlledFootballerId)!;
    const teammate = state.players.find(
      (player) => player.team === actor.team && player.id !== actor.id,
    )!;
    state.pendingPlayerDecision = {
      decisionId: 'decision',
      actorId: actor.id,
      selectedAt: 0,
      decisionKind: 'on_ball',
      selectedIntent: 'pass:progressive',
      startContext: {
        phase: state.teams.home.phase,
        pressure: 0,
        fieldProgress: 0.5,
        possession: 'home',
      },
    };
    state.time = 1;
    state.ball = { ...teammate.position, ownerId: teammate.id };
    const resolved = resolvePendingPlayerDecision(state);
    expect(resolved.lastPlayerDecisionOutcome?.result).toMatchObject({
      kind: 'pass_completed',
      passCompleted: true,
      teamRetainedPossession: true,
    });
    expect(resolved.pendingPlayerDecision).toBeUndefined();
  });

  it('diagnoses stale semantic possession and does not project attacking options from it', () => {
    const state = makeState();
    const actor = state.players.find((player) => player.id === state.controlledFootballerId)!;
    const opponent = state.players.find((player) => player.team !== actor.team)!;
    actor.position = { x: 70, y: 34 };
    opponent.position = { x: 68, y: 34 };
    state.ball = { ...opponent.position, ownerId: opponent.id };
    state.possessionTeam = actor.team;
    const probe = projectPlayerDecisionProbe(state);
    expect(probe.possessionMismatch).toBe(true);
    expect(probe.opportunityKind).not.toBe('off_ball_run');
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
