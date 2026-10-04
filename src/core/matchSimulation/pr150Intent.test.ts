// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { evaluatePressure, resolveMatchAction } from './matchActions';
import { deriveCarryExecution } from './carryExecution';
import { projectLocomotion } from './locomotion';
import { humanPossessionRedecisionReason, hasActiveHumanPossession } from './possessionAgency';
import {
  applyPlayerDecision,
  incomingBallIntentKey,
  projectIncomingPlayerInvolvement,
  projectPlayerDecisionOpportunity,
} from './playerDecision';
import { deriveOnBallPreparation } from './onBallPreparation';
import { resolveReceptionOutcome } from './passReception';
import { distance } from './matchSpace';
import {
  tacticalMatchStateSchema,
  type BallMovementMode,
  type MatchPlayerState,
  type TacticalMatchState,
} from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr150-intent',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 10;
  state.actionCooldown = 100;
  state.currentPressure = 0;
  state.players = state.players.map((player) => ({
    ...player,
    position: { x: player.team === 'home' ? 15 : 97, y: 4 + player.slotIndex * 5 },
    target: { x: player.team === 'home' ? 15 : 97, y: 4 + player.slotIndex * 5 },
    velocity: { x: 0, y: 0 },
  }));
  const actor = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'central_midfielder',
  )!;
  actor.position = { x: 40, y: 30 };
  actor.target = { x: 70, y: 30 };
  actor.facingAngle = Math.PI / 2;
  actor.profile = {
    ...actor.profile,
    attributes: {
      ...actor.profile.attributes,
      firstTouch: 95,
      technique: 95,
      composure: 95,
      concentration: 95,
      agility: 95,
      gameReading: 95,
      dribbling: 95,
      passing: 95,
      pace: 95,
    },
  };
  state.controlledFootballerId = actor.id;
  state.ball = { ...actor.position, ownerId: actor.id };
  state.ballOwnershipStartedAt = state.time;
  return { state, actor };
};
const actorFor = (state: TacticalMatchState, id: string): MatchPlayerState =>
  state.players.find((player) => player.id === id)!;
const incoming = (speed = 7) => {
  const { state, actor } = fixture();
  const passer = state.players.find(
    (player) =>
      player.team === actor.team &&
      player.id !== actor.id &&
      player.profile.primaryPosition !== 'goalkeeper',
  )!;
  passer.position = { x: 25, y: 30 };
  passer.facingAngle = Math.PI / 2;
  state.ball = { ...passer.position, ownerId: passer.id };
  let released = resolveMatchAction(state, {
    type: 'pass',
    actorId: passer.id,
    receiverId: actor.id,
    target: actor.position,
    intent: 'support',
  });
  released = { ...released, time: 11, actionCooldown: 100 };
  released.players = released.players.map((player) =>
    player.id === actor.id ? { ...player, velocity: { x: speed, y: 0 } } : player,
  );
  released.ball = {
    ...released.ball,
    x: 39.2,
    y: 30,
    height: 0.11,
    airborne: false,
    velocity: { x: 12, y: 0, z: 0 },
    flightTime: 0.8,
  };
  released.receptionPreparation = {
    ...released.receptionPreparation!,
    awarenessAt: 9.8,
    expectedContactPoint: actor.position,
    movement: 'run_onto_ball',
  };
  return { state: released, actor: actorFor(released, actor.id), passer };
};

describe('PR150 persistent football intentions', () => {
  it('executes four materially different movement objectives under identical pressure', () => {
    const { state, actor } = fixture();
    const defender = state.players.find(
      (player) => player.team !== actor.team && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    defender.position = { x: 41.8, y: 30 };
    const executions = Object.fromEntries(
      (['carry', 'sprint', 'dribble', 'retain'] as BallMovementMode[]).map((movementMode) => {
        const chosen = resolveMatchAction(
          state,
          { type: 'carry', actorId: actor.id, target: { x: 65, y: 30 }, movementMode },
          'human_selected',
        );
        return [movementMode, deriveCarryExecution(chosen, actor, chosen.ballCarrierIntent!)];
      }),
    );
    expect(executions.carry!.mode).toBe('evade');
    expect(executions.dribble!.mode).toBe('evade');
    expect(
      distance(executions.dribble!.localTarget, executions.carry!.localTarget),
    ).toBeGreaterThan(1);
    expect(executions.sprint!.mode).toBe('burst');
    expect(executions.sprint!.touchDistance).toBeGreaterThan(executions.carry!.touchDistance);
    expect(executions.sprint!.projectedControl).toBeLessThan(executions.retain!.projectedControl);
    expect(executions.retain!.mode).toBe('shield');
    expect(executions.retain!.localTarget.x).toBeLessThan(actor.position.x);
  });

  it('keeps a carry committed across routine ticks and interrupts an actually stalled route', () => {
    const { state, actor } = fixture();
    let moved = resolveMatchAction(
      state,
      { type: 'carry', actorId: actor.id, target: { x: 65, y: 30 }, movementMode: 'carry' },
      'human_selected',
    );
    for (let tick = 0; tick < 40; tick++) {
      expect(projectPlayerDecisionOpportunity(moved)).toBeUndefined();
      moved = stepTacticalMatch(moved, FIXED_MATCH_DT);
    }
    expect(actorFor(moved, actor.id).position.x).toBeGreaterThan(actor.position.x + 1);
    expect(moved.humanPossessionEpisode?.intent).toBe('carry');
    expect(moved.humanPossessionEpisode!.lastProgressAt).toBeGreaterThan(state.time);
    const stalled = {
      ...moved,
      time: moved.time + 1.5,
      players: moved.players.map((player) =>
        player.id === actor.id ? { ...player, velocity: { x: 0, y: 0 } } : player,
      ),
    };
    const blocker = stalled.players.find(
      (player) => player.team !== actor.team && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    blocker.position = { x: actorFor(stalled, actor.id).position.x + 3, y: actor.position.y };
    expect(humanPossessionRedecisionReason(stalled)).toBe('route_blocked');
    expect(projectPlayerDecisionOpportunity(stalled)?.triggerReason).toBe('route_blocked');
    expect(stepTacticalMatch(stalled, FIXED_MATCH_DT)).toBe(stalled);
  });

  it('retains possession until football context changes, without destination or timer prompts', () => {
    const { state, actor } = fixture();
    let retained = resolveMatchAction(
      state,
      { type: 'carry', actorId: actor.id, target: actor.position, movementMode: 'retain' },
      'human_selected',
    );
    retained = { ...retained, time: retained.ballCarrierIntent!.expiresAt + 0.1 };
    const advanced = stepTacticalMatchAfterDecisionProbe(retained, FIXED_MATCH_DT);
    expect(advanced.ballCarrierIntent?.movementMode).toBe('retain');
    expect(projectPlayerDecisionOpportunity(advanced)).toBeUndefined();
    expect(hasActiveHumanPossession(advanced)).toBe(true);
  });

  it('reopens retained midfield possession when support creates a newly clear receiving lane', () => {
    const { state, actor } = fixture();
    const receiver = state.players.find(
      (player) =>
        player.team === actor.team &&
        player.id !== actor.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const defender = state.players.find(
      (player) => player.team !== actor.team && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    receiver.position = { x: 52, y: 30 };
    defender.position = { x: 46, y: 30 };
    defender.profile = {
      ...defender.profile,
      attributes: {
        ...defender.profile.attributes,
        tackling: 95,
        positioning: 95,
        gameReading: 95,
        aggression: 95,
      },
    };
    state.currentPressure = evaluatePressure(state, actor).value;
    expect(state.currentPressure).toBeGreaterThan(0.3);
    const retaining = resolveMatchAction(
      state,
      { type: 'carry', actorId: actor.id, target: { x: 45, y: 30 }, movementMode: 'retain' },
      'human_selected',
    );
    const waiting = { ...retaining, time: state.time + 3 };
    expect(waiting.humanPossessionEpisode!.context.supportReceiverIds).not.toContain(receiver.id);
    expect(projectPlayerDecisionOpportunity(waiting)).toBeUndefined();
    const available = {
      ...waiting,
      players: waiting.players.map((player) =>
        player.id === receiver.id ? { ...player, position: { x: 52, y: 36 } } : player,
      ),
    };
    const opportunity = projectPlayerDecisionOpportunity(available)!;
    expect(opportunity.triggerReason).toBe('support_outlet_available');
    expect(
      opportunity.options.some(
        (option) =>
          option.kind === 'action' &&
          option.action.type === 'pass' &&
          option.action.receiverId === receiver.id,
      ),
    ).toBe(true);
    const keepRetaining = resolveMatchAction(
      available,
      { type: 'carry', actorId: actor.id, target: { x: 45, y: 30 }, movementMode: 'retain' },
      'human_selected',
    );
    expect(keepRetaining.humanPossessionEpisode!.context.supportReceiverIds).toContain(receiver.id);
    expect(projectPlayerDecisionOpportunity(keepRetaining)).toBeUndefined();
    const closedAgain = {
      ...keepRetaining,
      players: keepRetaining.players.map((player) =>
        player.id === receiver.id ? { ...player, position: { x: 52, y: 30 } } : player,
      ),
    };
    const clearAgain = {
      ...closedAgain,
      players: closedAgain.players.map((player) =>
        player.id === receiver.id ? { ...player, position: { x: 52, y: 36 } } : player,
      ),
    };
    expect(projectPlayerDecisionOpportunity(clearAgain)).toBeUndefined();
  });

  it('classifies explicit human sprint through the shared sustained physical workload path', () => {
    const { state, actor } = fixture();
    const chosen = resolveMatchAction(
      state,
      { type: 'carry', actorId: actor.id, target: { x: 85, y: 30 }, movementMode: 'sprint' },
      'human_selected',
    );
    expect(projectLocomotion(chosen, actor).intensity).toBe('sprint');
    let moved = chosen;
    let autonomous = structuredClone(chosen);
    delete autonomous.controlledFootballerId;
    delete autonomous.humanPossessionEpisode;
    for (let tick = 0; tick < 120; tick++) {
      moved = stepTacticalMatchAfterDecisionProbe(moved, FIXED_MATCH_DT);
      autonomous = stepTacticalMatchAfterDecisionProbe(autonomous, FIXED_MATCH_DT);
    }
    const telemetry = actorFor(moved, actor.id).locomotionTelemetry!;
    expect(telemetry.distanceSprint).toBeGreaterThan(3);
    expect(telemetry.sprintBursts).toBeGreaterThan(0);
    expect(telemetry.distanceTotal).toBeCloseTo(
      telemetry.distanceWalk +
        telemetry.distanceJog +
        telemetry.distanceRun +
        telemetry.distanceSprint,
    );
    expect(actorFor(autonomous, actor.id).locomotionTelemetry).toEqual(telemetry);
  });
});

describe('PR150 moving reception and incoming choices', () => {
  it('preserves sprinting reception momentum and continues beyond the contact point', () => {
    const { state, actor } = incoming();
    const received = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(received.lastReceptionOutcome?.kind).toBe('directional_control');
    expect(received.lastReceptionOutcome!.momentumRetention).toBeGreaterThan(0.9);
    expect(
      Math.hypot(actorFor(received, actor.id).velocity.x, actorFor(received, actor.id).velocity.y),
    ).toBeGreaterThan(6);
    expect(received.onBallPreparation?.continuation).toBeDefined();
    let continued = { ...received, actionCooldown: 100 };
    delete continued.controlledFootballerId;
    for (let tick = 0; tick < 20; tick++)
      continued = stepTacticalMatchAfterDecisionProbe(continued, FIXED_MATCH_DT);
    expect(actorFor(continued, actor.id).position.x).toBeGreaterThan(
      actorFor(received, actor.id).position.x + 2,
    );
    expect(actorFor(continued, actor.id).velocity.x).toBeGreaterThan(4);
    expect(tacticalMatchStateSchema.safeParse(continued).success).toBe(true);
  });

  it('records lower retained momentum when a poor first touch disrupts a running reception', () => {
    const { state, actor } = incoming();
    const good = resolveReceptionOutcome(state, actor, actor.position);
    actor.profile = {
      ...actor.profile,
      attributes: {
        ...actor.profile.attributes,
        firstTouch: 10,
        technique: 10,
        composure: 10,
        concentration: 10,
        agility: 10,
      },
    };
    state.currentPressure = 0.8;
    state.ball.velocity = { x: 20, y: 0, z: -1 };
    const poor = resolveReceptionOutcome(state, actor, actor.position);
    expect(['heavy_touch', 'failed_control']).toContain(poor.kind);
    expect(poor.momentumRetention).toBeLessThan(good.momentumRetention! / 2);
    expect(poor.retainedVelocity!.x).toBeLessThan(good.retainedVelocity!.x);
  });

  it('offers meaningful incoming alternatives while routine support reception stays autonomous', () => {
    const { state, actor } = incoming();
    state.ball.x = 25;
    state.ball.target = { x: 40, y: 30 };
    state.ball.travelKind = 'pass';
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(false);
    state.ball.travelKind = 'through_ball';
    const receiver = state.players.find(
      (player) =>
        player.team === actor.team &&
        player.id !== actor.id &&
        player.id !== state.ball.lastTouchPlayerId,
    )!;
    receiver.position = { x: 49, y: 38 };
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(true);
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity.kind).toBe('incoming_ball');
    expect(
      opportunity.options.some(
        (option) =>
          option.kind === 'action' && option.action.type === 'pass' && option.action.firstTime,
      ),
    ).toBe(true);
    state.ball.x = 39.5;
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(false);
  });

  it('honours selected incoming control without immediately asking the same player again', () => {
    const { state, actor } = incoming(3);
    const before = {
      ...state,
      ball: { ...state.ball, x: 25, target: { x: 40, y: 30 }, travelKind: 'through_ball' as const },
    };
    const opportunity = projectPlayerDecisionOpportunity(before)!;
    const selected = applyPlayerDecision(before, opportunity, 'control');
    const atContact = { ...selected, ball: { ...selected.ball, x: 39.2 }, actionCooldown: 100 };
    const received = stepTacticalMatchAfterDecisionProbe(atContact, FIXED_MATCH_DT);
    expect(received.ball.ownerId).toBe(actor.id);
    expect(received.humanPossessionEpisode?.intent).toBe('control');
    expect(received.postActionAgencyCheckpoint).toBeUndefined();
    expect(projectPlayerDecisionOpportunity(received)).toBeUndefined();
    let progressing = received;
    let prompts = 1; // The original incoming football choice.
    for (let tick = 0; tick < 80; tick++) {
      if (projectPlayerDecisionOpportunity(progressing)) prompts++;
      progressing = stepTacticalMatch(progressing, FIXED_MATCH_DT);
    }
    expect(progressing.time).toBeGreaterThan(received.time + 1.9);
    expect(prompts).toBe(1);
  });

  it('executes a first-time layoff at actual contact and retains the incoming pass result', () => {
    const { state, actor } = incoming(3);
    const receiver = state.players.find(
      (player) =>
        player.team === actor.team &&
        player.id !== actor.id &&
        player.id !== state.ball.lastTouchPlayerId,
    )!;
    receiver.position = { x: 48, y: 38 };
    state.pendingReceptionIntent = {
      actorId: actor.id,
      action: {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
        firstTime: true,
      },
      createdAt: 10.5,
      expiresAt: 13,
      ballEpisode: incomingBallIntentKey(state),
      actionSource: 'human_selected',
    };
    const received = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(received.lastResolvedPass?.actualReceiverId).toBe(actor.id);
    expect(received.lastResolvedPass?.finalResult).toBe('completed');
    expect(received.lastPassDiagnostic?.passerId).toBe(actor.id);
    expect(received.ball.executionType).toBe('first_time');
    expect(received.lastReceptionOutcome).toBeUndefined();
    expect(received.pendingReceptionIntent).toBeUndefined();
    expect(received.ball.ownerId).toBeUndefined();
  });

  it('completes a chosen control before reopening a meaningful settled finishing choice', () => {
    const { state, actor } = incoming(0);
    state.players = state.players.map((player) =>
      player.team !== actor.team
        ? {
            ...player,
            position: {
              x: player.profile.primaryPosition === 'goalkeeper' ? 104 : 35,
              y: player.profile.primaryPosition === 'goalkeeper' ? 34 : 60,
            },
            velocity: { x: 0, y: 0 },
          }
        : player,
    );
    actor.position = { x: 90, y: 30 };
    actor.target = actor.position;
    state.ball = { ...state.ball, x: 89.2, target: actor.position };
    state.receptionPreparation = {
      ...state.receptionPreparation!,
      expectedContactPoint: actor.position,
      movement: 'wait',
    };
    state.pendingReceptionIntent = {
      actorId: actor.id,
      action: { type: 'hold', actorId: actor.id },
      createdAt: 10.5,
      expiresAt: 13,
      ballEpisode: incomingBallIntentKey(state),
      actionSource: 'human_selected',
    };
    let received = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(received.humanPossessionEpisode?.intent).toBe('control');
    expect(projectPlayerDecisionOpportunity(received)).toBeUndefined();
    for (let tick = 0; tick < 80 && !projectPlayerDecisionOpportunity(received); tick++)
      received = stepTacticalMatch(received, FIXED_MATCH_DT);
    const nextChoice = projectPlayerDecisionOpportunity(received);
    expect(received.time).toBeGreaterThanOrEqual(received.onBallPreparation!.readyAt);
    expect(nextChoice?.triggerReason).toBe('controlled_reception_complete');
    expect(
      nextChoice?.options.some(
        (option) => option.kind === 'action' && option.action.type === 'shot',
      ),
    ).toBe(true);
    expect(stepTacticalMatch(received, FIXED_MATCH_DT)).toBe(received);
  });

  it('records control before a requested layoff when the arriving ball cannot be struck first-time', () => {
    const { state, actor } = incoming(0);
    const receiver = state.players.find(
      (player) =>
        player.team === actor.team &&
        player.id !== actor.id &&
        player.id !== state.ball.lastTouchPlayerId,
    )!;
    receiver.position = { x: 48, y: 38 };
    state.ball = {
      ...state.ball,
      x: 39.8,
      height: 0.9,
      airborne: true,
      velocity: { x: 4, y: 0, z: -0.2 },
    };
    state.receptionPreparation = { ...state.receptionPreparation!, movement: 'wait' };
    state.pendingReceptionIntent = {
      actorId: actor.id,
      action: {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
        firstTime: true,
      },
      createdAt: 10.5,
      expiresAt: 13,
      ballEpisode: incomingBallIntentKey(state),
      actionSource: 'human_selected',
    };
    let received = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    for (let tick = 0; tick < 20 && received.pendingReceptionIntent; tick++)
      received = stepTacticalMatchAfterDecisionProbe(received, FIXED_MATCH_DT);
    expect(received.lastReceptionOutcome?.receiverId).toBe(actor.id);
    expect(received.lastPassDiagnostic?.passerId).toBe(actor.id);
    expect(received.latestAction?.type === 'pass' && received.latestAction.firstTime).toBe(false);
    expect(received.ball.executionType).not.toBe('first_time');
    expect(received.pendingReceptionIntent).toBeUndefined();
  });

  it('lets a poor outward reception cross the touchline and award a real throw-in', () => {
    const { state, actor } = incoming(0);
    actor.position = { x: 40, y: 0.1 };
    actor.target = actor.position;
    actor.profile = {
      ...actor.profile,
      attributes: {
        ...actor.profile.attributes,
        firstTouch: 10,
        technique: 10,
        composure: 10,
        concentration: 10,
        agility: 10,
      },
    };
    state.ball = {
      ...state.ball,
      x: 40,
      y: 0.6,
      target: actor.position,
      velocity: { x: 0, y: -12, z: 0 },
    };
    state.receptionPreparation = {
      ...state.receptionPreparation!,
      expectedContactPoint: actor.position,
      movement: 'wait',
    };
    const received = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(['heavy_touch', 'failed_control']).toContain(received.lastReceptionOutcome?.kind);
    expect(received.lastReceptionOutcome!.resultingPoint!.y).toBeLessThan(0);
    expect(received.scenario).toBe('throw_in');
    expect(received.restart?.restartTeam).toBe('away');
    expect(received.lastBoundaryRestart).toBe('throw_in');
  });

  it('rebases bounded reception continuation instead of returning to the old contact origin', () => {
    const { state, actor } = fixture();
    actor.velocity = { x: 5, y: 0 };
    state.onBallPreparation = deriveOnBallPreparation(state, actor, 'directional_control');
    let moved = { ...state };
    delete moved.controlledFootballerId;
    for (let tick = 0; tick < 70; tick++)
      moved = stepTacticalMatchAfterDecisionProbe(moved, FIXED_MATCH_DT);
    expect(moved.onBallPreparation?.continuation).toBeUndefined();
    expect(moved.onBallPreparation!.micro!.origin.x).toBeGreaterThan(actor.position.x + 2);
    expect(actorFor(moved, actor.id).position.x).toBeGreaterThan(actor.position.x + 2);
  });
});
