import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatch } from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import {
  applyPlayerDecision,
  projectPlayerAgency,
  projectPlayerDecisionOpportunity,
} from './playerDecision';
import { hasReachedCarryDecisionWaypoint } from './carryExecution';
import {
  hasActiveHumanPossession,
  humanPossessionRedecisionReason,
  reconcileHumanPossession,
} from './possessionAgency';
import type { MatchAction, TacticalMatchState } from './matchState';
import { resolveCanonicalShot } from './shotResolver';
import { resolvePendingPlayerDecision } from './decisionOutcome';

const world = createCanonicalWorldDatabase();
const fixture = (x = 77): TacticalMatchState => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr144-possession',
      control: { mode: 'spectator' },
    }),
  );
  const actor =
    state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
    ) ??
    state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
  state.players = state.players.map((player) => ({
    ...player,
    position:
      player.id === actor.id
        ? { x, y: 34 }
        : player.profile.primaryPosition === 'goalkeeper'
          ? { x: player.team === 'home' ? 1 : 104, y: 34 }
          : { x: 40, y: player.team === 'home' ? 8 : 60 },
    velocity: { x: 0, y: 0 },
    facingAngle: player.team === 'home' ? 0 : Math.PI,
  }));
  state.ball = { x, y: 34, ownerId: actor.id, lastTouchPlayerId: actor.id };
  state.scenario = 'open_play';
  delete state.restart;
  state.controlledFootballerId = actor.id;
  state.possessionTeam = 'home';
  state.time = 10;
  state.ballOwnershipStartedAt = 9;
  state.teams.home = { ...state.teams.home, phase: 'positional_attack' };
  return state;
};
const carry = (state: TacticalMatchState, x = 94) =>
  resolveMatchAction(
    state,
    { type: 'carry', actorId: state.controlledFootballerId!, target: { x, y: 34 } },
    'human_selected',
  );
const moveActor = (state: TacticalMatchState, x: number) => ({
  ...state,
  players: state.players.map((player) =>
    player.id === state.controlledFootballerId ? { ...player, position: { x, y: 34 } } : player,
  ),
  ball: { ...state.ball, x, y: 34 },
});

describe('PR144 human possession ownership', () => {
  it('opens human possession at the canonical contact of a selected receive', () => {
    const state = incomingFixture(true, 0.11);
    state.pendingReceptionIntent = {
      actorId: state.controlledFootballerId!,
      action: { type: 'hold', actorId: state.controlledFootballerId! },
      actionSource: 'human_selected',
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: 'incoming',
    };
    const received = stepTacticalMatch(state, 0.025);
    expect(received.ball.ownerId).toBe(state.controlledFootballerId);
    expect(received.humanPossessionEpisode?.actorId).toBe(state.controlledFootballerId);
    expect(received.postActionAgencyCheckpoint?.completedAction).toBe('hold');
    expect(projectPlayerDecisionOpportunity(received)?.kind).toBe('on_ball');
  });
  it('keeps every terminal action human-owned after a carry cooldown expires', () => {
    let state = carry(fixture());
    state = { ...state, time: state.time + 1.4, actionCooldown: 0 };
    const actorId = state.controlledFootballerId!;
    const receiverId = state.players.find(
      (player) => player.team === 'home' && player.id !== actorId,
    )!.id;
    const terminal: MatchAction[] = [
      { type: 'pass', actorId, receiverId, intent: 'support', target: { x: 55, y: 34 } },
      { type: 'shot', actorId, intent: 'driven', target: { x: 105, y: 34 } },
      { type: 'cross', actorId, intent: 'cutback', target: { x: 91, y: 32 } },
      { type: 'header', actorId, intent: 'header_clearance', target: { x: 60, y: 34 } },
    ];
    for (const action of terminal)
      expect(resolveMatchAction(state, action, 'autonomous_routine')).toBe(state);
    const next = stepTacticalMatch(state, 0.025);
    expect(hasActiveHumanPossession(next)).toBe(true);
    expect(next.latestAction?.type).toBe('carry');
    expect(next.latestActionSource).toBe('human_selected');
    expect(next.time).toBeGreaterThan(state.time);
  });

  it('consumes ownership on an explicitly selected terminal release and on canonical loss/restart', () => {
    const state = carry(fixture(88));
    const released = resolveMatchAction(
      state,
      {
        type: 'shot',
        actorId: state.controlledFootballerId!,
        intent: 'driven',
        target: { x: 105, y: 34 },
      },
      'human_selected',
    );
    expect(released.ball.travelKind).toBe('shot');
    expect(released.humanPossessionEpisode).toBeUndefined();
    const opponent = state.players.find((player) => player.team === 'away')!;
    expect(
      reconcileHumanPossession({ ...state, ball: { ...state.ball, ownerId: opponent.id } })
        .humanPossessionEpisode,
    ).toBeUndefined();
    expect(
      reconcileHumanPossession({ ...state, scenario: 'throw_in' }).humanPossessionEpisode,
    ).toBeUndefined();
    expect(
      reconcileHumanPossession({ ...state, ballEpisode: (state.ballEpisode ?? 0) + 1 })
        .humanPossessionEpisode,
    ).toBeUndefined();
  });
});

const incomingFixture = (controlled: boolean, height: number): TacticalMatchState => {
  const state = fixture(90);
  const actorId = state.controlledFootballerId!;
  const passer = state.players.find(
    (player) =>
      player.team === 'home' &&
      player.id !== actorId &&
      player.profile.primaryPosition !== 'goalkeeper',
  )!;
  if (!controlled) delete state.controlledFootballerId;
  state.currentAction = {
    type: 'pass',
    actorId: passer.id,
    receiverId: actorId,
    target: { x: 90, y: 34 },
    intent: 'progressive',
  };
  state.currentActorId = passer.id;
  state.ball = {
    x: 89.2,
    y: 34,
    height,
    from: { x: 70, y: 34 },
    target: { x: 90, y: 34 },
    velocity: { x: 15, y: 0, z: 0 },
    airborne: height > 0.2,
    bounceCount: height > 0.2 ? 1 : 0,
    intendedReceiverId: actorId,
    lastTouchPlayerId: passer.id,
    travelKind: 'pass',
    sourceAction: 'pass',
  };
  state.actionCooldown = 10;
  return state;
};

describe('PR144 incoming finishing integration', () => {
  const strongAerialReceiver = (state: TacticalMatchState) => {
    const actorId = state.ball.intendedReceiverId!;
    state.players = state.players.map((player) =>
      player.id === actorId
        ? {
            ...player,
            profile: {
              ...player.profile,
              attributes: {
                ...player.profile.attributes,
                heading: 100,
                jumping: 100,
                strength: 100,
                positioning: 100,
                gameReading: 100,
                concentration: 100,
                finishing: 100,
                technique: 100,
                composure: 100,
              },
            },
          }
        : player,
    );
    return state;
  };
  it('lets an NPC shoot a low incoming ball without first awarding settled possession', () => {
    const state = incomingFixture(false, 0.11);
    const next = stepTacticalMatch(state, 0.025);
    expect(next.latestAction?.type).toBe('shot');
    expect(next.ball.shot?.firstTime).toBe(true);
    expect(next.ball.shot?.contact).toBe('first_time');
    expect(next.latestActionSource).toBe('autonomous_npc');
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.ball.shot?.ballHeightAtContact).toBeGreaterThan(0);
  });

  it('executes a selected human half-volley at its actual airborne contact point', () => {
    const state = incomingFixture(true, 0.5);
    const actorId = state.controlledFootballerId!;
    state.pendingReceptionIntent = {
      actorId,
      action: {
        type: 'shot',
        actorId,
        intent: 'driven',
        contact: 'half_volley',
        target: { x: 105, y: 34 },
        decisionBallHeight: 0.5,
      },
      actionSource: 'human_selected',
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: 'incoming',
    };
    const next = stepTacticalMatch(state, 0.025);
    expect(next.ball.shot?.contact).toBe('half_volley');
    expect(next.ball.shot?.ballHeightAtContact).toBeGreaterThan(0.45);
    expect(next.ball.shot?.ballHeightAtContact).toBeLessThanOrEqual(0.5);
    expect(next.ball.x).toBeGreaterThan(state.ball.x);
    expect(next.ball.x).toBeLessThan(
      state.players.find((player) => player.id === actorId)!.position.x,
    );
    expect(next.latestActionSource).toBe('human_selected');
    const shotId = next.ball.shot?.shotId;
    const continued = stepTacticalMatch(next, 0.025);
    expect(continued.decisionIndex).toBe(next.decisionIndex);
    expect(continued.ball.shot?.shotId).toBe(shotId);
    expect(continued.latestActionSource).toBe('human_selected');
  });

  it('executes the human-selected header through real aerial contact and shared shot physics', () => {
    const state = strongAerialReceiver(incomingFixture(true, 2));
    const actorId = state.controlledFootballerId!;
    state.pendingReceptionIntent = {
      actorId,
      action: {
        type: 'header',
        actorId,
        intent: 'header_shot',
        firstTime: true,
        target: { x: 105, y: 34 },
        decisionBallHeight: 2,
      },
      actionSource: 'human_selected',
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: 'incoming',
    };
    const next = stepTacticalMatch(state, 0.025);
    expect(next.ball.shot?.contact).toBe('header');
    expect(next.ball.shot?.ballHeightAtContact).toBeGreaterThan(1.9);
    expect(next.ball.releaseHeight).toBe(next.ball.shot?.ballHeightAtContact);
    expect(next.latestActionSource).toBe('human_selected');
    const shotId = next.ball.shot?.shotId;
    let continued = next;
    for (let tick = 0; tick < 3; tick++) continued = stepTacticalMatch(continued, 0.025);
    expect(continued.decisionIndex).toBe(next.decisionIndex);
    expect(continued.ball.shot?.shotId).toBe(shotId);
    expect(continued.latestActionSource).toBe('human_selected');
  });

  it('keeps a selected high receive in flight until foot contact instead of heading a shot', () => {
    const state = strongAerialReceiver(incomingFixture(true, 2));
    const actorId = state.controlledFootballerId!;
    state.pendingReceptionIntent = {
      actorId,
      action: { type: 'hold', actorId },
      actionSource: 'human_selected',
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: 'incoming',
    };
    const next = stepTacticalMatch(state, 0.025);
    expect(next.ball.shot).toBeUndefined();
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.ball.height).toBeGreaterThan(1.9);
    expect(next.ball.travelKind).toBe('pass');
    expect(next.pendingReceptionIntent?.action.type).toBe('hold');
  });

  it('resolves headed shooting feedback only from a fresh completed shot', () => {
    const state = fixture(90);
    const actorId = state.controlledFootballerId!;
    const action = {
      type: 'shot' as const,
      actorId,
      intent: 'driven' as const,
      target: { x: 105, y: 34 },
    };
    const shot = resolveCanonicalShot(state, action);
    state.pendingPlayerDecision = {
      actorId,
      decisionId: 'new-human-header',
      selectedAt: state.time,
      decisionKind: 'incoming_ball',
      selectedIntent: 'header:header_shot',
      startContext: {
        phase: 'positional_attack',
        pressure: 0,
        fieldProgress: 0.9,
        possession: 'home',
      },
    };
    state.lastShot = { ...shot, releasedAt: state.time - 1, outcome: 'miss' };
    expect(resolvePendingPlayerDecision(state).pendingPlayerDecision).toBeDefined();
    state.lastShot = { ...shot, releasedAt: state.time, outcome: 'goal' };
    const complete = resolvePendingPlayerDecision(state);
    expect(complete.pendingPlayerDecision).toBeUndefined();
    expect(complete.lastPlayerDecisionOutcome?.result?.kind).toBe('shot_resolved');
    expect(complete.lastPlayerDecisionOutcome?.result?.shotOutcome).toBe('goal');
  });
});

describe('PR144 carry semantic boundaries', () => {
  it('prompts near the selected waypoint and after overshoot, even during physical resolution', () => {
    const state = carry(fixture(85), 94);
    for (const x of [92.5, 95.2]) {
      const atWaypoint = moveActor(state, x);
      const actor = atWaypoint.players.find(
        (player) => player.id === atWaypoint.controlledFootballerId,
      )!;
      expect(hasReachedCarryDecisionWaypoint(actor, atWaypoint.ballCarrierIntent!)).toBe(true);
      const opportunity = projectPlayerDecisionOpportunity(atWaypoint);
      expect(opportunity?.kind).toBe('on_ball');
      expect(opportunity?.triggerReason).toBe('carry_decision_waypoint');
      expect(stepTacticalMatch(atWaypoint, 0.025)).toBe(atWaypoint);
      const chosenCarry = opportunity!.options.find(
        (option) => option.kind === 'action' && option.action.type === 'carry',
      )!;
      const continued = applyPlayerDecision(atWaypoint, opportunity!, chosenCarry.id);
      expect(continued.decisionIndex).toBeGreaterThan(atWaypoint.decisionIndex);
      expect(continued.humanPossessionEpisode?.startedAt).toBe(
        state.humanPossessionEpisode?.startedAt,
      );
    }
  });

  it('interrupts a selected carry immediately for a rushing keeper and allows the next choice', () => {
    const state = carry(fixture(84));
    const rushed = {
      ...state,
      players: state.players.map((player) =>
        player.team === 'away' && player.profile.primaryPosition === 'goalkeeper'
          ? { ...player, position: { x: 97, y: 34 }, velocity: { x: -4, y: 0 } }
          : player,
      ),
    };
    const opportunity = projectPlayerDecisionOpportunity(rushed);
    expect(opportunity?.triggerReason).toBe('goalkeeper_rush');
    expect(
      opportunity?.options.some(
        (option) =>
          option.kind === 'action' &&
          option.action.type === 'shot' &&
          option.action.intent === 'chip',
      ),
    ).toBe(true);
    const selected = opportunity!.options.find(
      (option) => option.kind === 'action' && option.action.type === 'carry',
    )!;
    const continued = applyPlayerDecision(rushed, opportunity!, selected.id);
    expect(continued.decisionIndex).toBe(rushed.decisionIndex + 1);
    expect(projectPlayerDecisionOpportunity(continued)).toBeUndefined();
  });

  it('interrupts for major pressure, a newly open shot lane, and entering the penalty area', () => {
    const state = carry(fixture(84));
    const defenderId = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!.id;
    const pressed = {
      ...state,
      players: state.players.map((player) =>
        player.id === defenderId ? { ...player, position: { x: 84, y: 36 } } : player,
      ),
    };
    expect(humanPossessionRedecisionReason(pressed)).toBe('major_pressure');
    expect(projectPlayerDecisionOpportunity(pressed)?.kind).toBe('on_ball');
    expect(humanPossessionRedecisionReason(moveActor(state, 89))).toBe('attacking_zone');
    const blocked = fixture(88);
    blocked.players = blocked.players.map((player) =>
      player.id === defenderId ? { ...player, position: { x: 97, y: 34 } } : player,
    );
    const selected = carry(blocked);
    const open = {
      ...selected,
      players: selected.players.map((player) =>
        player.id === defenderId ? { ...player, position: { x: 97, y: 39 } } : player,
      ),
    };
    expect(humanPossessionRedecisionReason(open)).toBe('shooting_lane_open');
  });

  it('ignores minor changes and latches offered zone/keeper families through repeated selections', () => {
    const state = carry(fixture(69.7), 90);
    for (let i = 0; i < 20; i++) {
      const minor = moveActor(state, 69.7 + i * 0.005);
      expect(
        projectPlayerDecisionOpportunity({ ...minor, time: state.time + i * 0.2 }),
      ).toBeUndefined();
    }
    const entered = moveActor(state, 70.2);
    expect(humanPossessionRedecisionReason(entered)).toBe('attacking_zone');
    const reselected = carry(entered, 90);
    const retreated = carry(moveActor(reselected, 69.9), 90);
    expect(humanPossessionRedecisionReason(moveActor(retreated, 70.15))).toBeUndefined();
    const start = carry(fixture(84));
    const rushed = {
      ...start,
      players: start.players.map((player) =>
        player.team === 'away' && player.profile.primaryPosition === 'goalkeeper'
          ? { ...player, position: { x: 97, y: 34 }, velocity: { x: -1.6, y: 0 } }
          : player,
      ),
    };
    const afterChoice = carry(rushed);
    const slower = {
      ...afterChoice,
      players: afterChoice.players.map((player) =>
        player.team === 'away' && player.profile.primaryPosition === 'goalkeeper'
          ? { ...player, velocity: { x: -1.4, y: 0 } }
          : player,
      ),
    };
    const secondChoice = carry(slower);
    const faster = {
      ...secondChoice,
      players: secondChoice.players.map((player) =>
        player.team === 'away' && player.profile.primaryPosition === 'goalkeeper'
          ? { ...player, velocity: { x: -1.6, y: 0 } }
          : player,
      ),
    };
    expect(projectPlayerAgency(faster).opportunity).toBeUndefined();
  });

  it('produces the same possession sequence for the same seed and human carry choices', () => {
    const run = () => {
      let state = carry(fixture(), 94);
      for (let tick = 0; tick < 80; tick++) state = stepTacticalMatch(state, 0.025);
      return state;
    };
    expect(run()).toEqual(run());
  });
});
