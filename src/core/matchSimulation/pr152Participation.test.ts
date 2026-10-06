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
import {
  applyPlayerDecision,
  hasPendingPlayerDecision,
  projectPlayerAgency,
  projectPlayerDecisionOpportunity,
  resolveDevPlayerDecision,
} from './playerDecision';
import { enumerateAvailableActions, resolveMatchAction } from './matchActions';
import { applyRestartScenario } from './restartScenarios';
import { hasActiveHumanPossession } from './possessionAgency';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr152-participation') =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

const attackingFixture = (x = 90, y = 34) => {
  const state = fixture();
  const actor = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
  )!;
  state.players = state.players.map((player) => ({
    ...player,
    position:
      player.id === actor.id
        ? { x, y }
        : player.profile.primaryPosition === 'goalkeeper'
          ? { x: player.team === 'home' ? 1 : 104, y: 34 }
          : { x: 40, y: player.team === 'home' ? 8 : 60 },
    velocity: { x: 0, y: 0 },
    facingAngle: player.team === 'home' ? Math.PI / 2 : -Math.PI / 2,
  }));
  state.controlledFootballerId = actor.id;
  state.time = 10;
  state.ball = { x, y, ownerId: actor.id, lastTouchPlayerId: actor.id };
  state.possessionTeam = 'home';
  state.actionCooldown = 0;
  state.ballOwnershipStartedAt = 9;
  state.timeSincePossessionChanged = 4;
  state.teams.home.phase = 'positional_attack';
  return { state, actorId: actor.id };
};

describe('PR152 canonical identity and temporary human agency', () => {
  it('keeps routine hidden midfield reception and positional play autonomous with agency enabled', () => {
    let state = fixture('pr152-hidden-circulation');
    const actorId = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'central_midfielder',
    )!.id;
    for (const player of state.players) {
      player.position =
        player.id === actorId ? { x: 40, y: 34 } : { x: player.team === 'home' ? 15 : 95, y: 60 };
      player.velocity = { x: 0, y: 0 };
      player.facingAngle = 0;
    }
    const passer = state.players.find(
      (player) =>
        player.team === 'home' &&
        player.id !== actorId &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    passer.position = { x: 20, y: 34 };
    state.time = 10;
    state.controlledFootballerId = actorId;
    state.ball = { ...passer.position, ownerId: passer.id };
    state = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: actorId,
      intent: 'support',
      target: { x: 40, y: 34 },
    });
    state.ball = { ...state.ball, x: 39.2, y: 34, velocity: { x: 15, y: 0, z: 0 } };
    let npc = structuredClone(state);
    delete npc.controlledFootballerId;
    for (let tick = 0; tick < 7 / FIXED_MATCH_DT; tick++) {
      expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      npc = stepTacticalMatchAfterDecisionProbe(npc, FIXED_MATCH_DT);
    }
    expect(state.statistics).toEqual(npc.statistics);
    expect(state.players).toEqual(npc.players);
    expect(state.statistics!.players.find((player) => player.playerId === actorId)).toMatchObject({
      passesReceived: 1,
      touches: 1,
    });
    expect(state.playerDecisionGate).toBeUndefined();
  });

  it('keeps shooting human-owned after a previously delegated choice', () => {
    const { state, actorId } = attackingFixture();
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity.kind).toBe('on_ball');
    const shot = enumerateAvailableActions(state, actorId).find(
      (action) => action.type === 'shot',
    )!;
    expect(hasPendingPlayerDecision(state, actorId)).toBe(true);
    expect(stepTacticalMatch(state, FIXED_MATCH_DT)).toEqual(state);
    expect(resolveMatchAction(state, shot, 'autonomous_routine').ball).toEqual(state.ball);
    const delegated = {
      ...state,
      playerDecisionGate: {
        lastSituationSignature: opportunity.signature,
        lastResolvedAt: state.time,
      },
    };
    expect(hasPendingPlayerDecision(delegated, actorId)).toBe(false);
    const blocked = resolveMatchAction(delegated, shot, 'autonomous_routine');
    expect(blocked.ball.shot).toBeUndefined();
    expect(hasPendingPlayerDecision(blocked, actorId)).toBe(true);
    expect(projectPlayerDecisionOpportunity(blocked)).toBeDefined();
    expect(resolveMatchAction(blocked, shot, 'human_selected').ball.travelKind).toBe('shot');
  });

  it('permits a routine controlled cross when the exact agency probe has no pending choice', () => {
    const { state, actorId } = attackingFixture(85, 8);
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    const cross = enumerateAvailableActions(state, actorId).find(
      (action) => action.type === 'cross',
    )!;
    expect(cross).toBeDefined();
    const delegated = {
      ...state,
      playerDecisionGate: {
        lastSituationSignature: opportunity.signature,
        lastResolvedAt: state.time,
      },
    };
    expect(projectPlayerDecisionOpportunity(delegated)).toBeUndefined();
    expect(resolveMatchAction(delegated, cross, 'autonomous_routine').ball.travelKind).toBe(
      'cross',
    );
  });

  it('surfaces a late first-time finishing contact and shares the NPC physics after human commitment', () => {
    const { state, actorId } = attackingFixture();
    state.players.find((player) => player.id === actorId)!.facingAngle = 0;
    const passer = state.players.find(
      (player) =>
        player.team === 'home' &&
        player.id !== actorId &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    state.currentActorId = passer.id;
    state.ball = {
      x: 89.2,
      y: 34,
      height: 0.11,
      from: { x: 70, y: 34 },
      target: { x: 90, y: 34 },
      velocity: { x: 15, y: 0, z: 0 },
      intendedReceiverId: actorId,
      lastTouchPlayerId: passer.id,
      travelKind: 'pass',
      sourceAction: 'pass',
    };
    state.actionCooldown = 10;
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity.triggerReason).toBe('human_shot_selection_required');
    const npc = structuredClone(state);
    delete npc.controlledFootballerId;
    expect(stepTacticalMatch(state, FIXED_MATCH_DT)).toEqual(state);
    const npcNext = stepTacticalMatch(npc, FIXED_MATCH_DT);
    const selectedShot = npcNext.latestAction!;
    const shot = opportunity.options.find(
      (o) =>
        o.kind === 'action' &&
        o.action.type === 'shot' &&
        selectedShot.type === 'shot' &&
        o.action.intent === selectedShot.intent &&
        JSON.stringify(o.action.goalTarget) === JSON.stringify(selectedShot.goalTarget),
    )!;
    const next = stepTacticalMatch(
      applyPlayerDecision(state, opportunity, shot.id),
      FIXED_MATCH_DT,
    );
    expect(next.ball.shot?.firstTime).toBe(true);
    expect(next.ball).toEqual(npcNext.ball);
    expect(next.latestAction).toEqual(npcNext.latestAction);
    expect(next.latestActionSource).toBe('human_selected');
  });

  it('releases a delegated controlled restart at the normal setup boundary', () => {
    let state = applyRestartScenario(fixture(), 'kick_off', { restartTeam: 'home' });
    state.controlledFootballerId = state.restart!.takerId;
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    state = {
      ...state,
      playerDecisionGate: {
        lastSituationSignature: opportunity.signature,
        lastResolvedAt: state.time,
      },
    };
    for (let tick = 0; tick < 90; tick++) state = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(state.restart?.phase).toBe('release');
    expect(state.lastRestartLivenessRecovery).toBeUndefined();
    expect(state.time).toBeLessThan(3);
  });

  it('records a first-time interception and shot without requiring a settled ownership frame', () => {
    const setup = attackingFixture();
    const actorId = setup.actorId;
    let state = setup.state;
    delete state.controlledFootballerId;
    const finisher = state.players.find((player) => player.id === actorId)!;
    finisher.facingAngle = 0;
    finisher.profile = {
      ...finisher.profile,
      attributes: {
        ...finisher.profile.attributes,
        heading: 100,
        jumping: 100,
        positioning: 100,
        gameReading: 100,
        composure: 100,
        strength: 100,
        technique: 100,
      },
    };
    const [passer, receiver] = state.players.filter(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    );
    passer!.position = { x: 70, y: 34 };
    state.ball = { ...passer!.position, ownerId: passer!.id };
    state.possessionTeam = 'away';
    state = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer!.id,
      receiverId: receiver!.id,
      target: { x: 90, y: 34 },
      intent: 'support',
    });
    state.ball = {
      x: 89.2,
      y: 34,
      height: 1.7,
      airborne: true,
      from: { x: 70, y: 34 },
      target: { x: 90, y: 34 },
      velocity: { x: 15, y: 0, z: 0 },
      intendedReceiverId: receiver!.id,
      lastTouchPlayerId: passer!.id,
      travelKind: 'pass',
      sourceAction: 'pass',
    };
    const next = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(next.ball.shot?.firstTime).toBe(true);
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.possessionTeam).toBe('home');
    expect(next.lastPossessionChange).toMatchObject({
      cause: 'interception',
      from: 'away',
      to: 'home',
      winnerId: actorId,
    });
    expect(next.statistics!.players.find((player) => player.playerId === actorId)).toMatchObject({
      touches: 1,
      shots: 1,
      passesReceived: 0,
      interceptions: 1,
      possessionWon: 1,
      tacklesWon: 0,
      tacklesAttempted: 0,
    });
  });

  it('preserves explicitly selected carry ownership and rejects stale choices when agency is disabled', () => {
    const { state, actorId } = attackingFixture();
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    const carry = opportunity.options.find(
      (option) => option.kind === 'action' && option.action.type === 'carry',
    )!;
    const selected = applyPlayerDecision(state, opportunity, carry.id);
    expect(hasActiveHumanPossession(selected)).toBe(true);
    const disabled = { ...selected, playerAgencyEnabled: false };
    expect(projectPlayerAgency(disabled).probe.blockedReason).toBe('agency_disabled');
    expect(hasActiveHumanPossession(disabled)).toBe(false);
    expect(applyPlayerDecision(disabled, opportunity, carry.id)).toBe(disabled);
    expect(resolveDevPlayerDecision(disabled, opportunity).state).toBe(disabled);
    expect(tacticalMatchStateSchema.safeParse(disabled).success).toBe(true);
    expect(disabled.controlledFootballerId).toBe(actorId);
  });
});

describe('PR152 deterministic controlled footballer versus equivalent NPC', () => {
  it.each([
    ['central_midfielder', 'a'],
    ['left_back', 'b'],
    ['striker', 'c'],
  ] as const)(
    'keeps autonomous %s football participation and positioning identical on seed %s',
    (position, seed) => {
      const initial = fixture(`pr152-parity:${position}:${seed}`);
      const playerId = initial.players.find(
        (player) => player.team === 'home' && player.profile.primaryPosition === position,
      )!.id;
      let controlled: TacticalMatchState = {
        ...structuredClone(initial),
        controlledFootballerId: playerId,
        playerAgencyEnabled: false,
      };
      let npc = structuredClone(initial);
      for (let tick = 0; tick < 120 / FIXED_MATCH_DT; tick++) {
        expect(projectPlayerDecisionOpportunity(controlled)).toBeUndefined();
        controlled = stepTacticalMatchAfterDecisionProbe(controlled, FIXED_MATCH_DT);
        npc = stepTacticalMatchAfterDecisionProbe(npc, FIXED_MATCH_DT);
      }
      // Full rows cover receptions, passes, control episodes, carries, shots, defensive actions,
      // distance and sprint distance. Whole-team equality catches a hidden pass-network exclusion.
      expect(controlled.statistics).toEqual(npc.statistics);
      const row = controlled.statistics!.players.find((player) => player.playerId === playerId)!;
      expect(row.distanceCovered).toBeGreaterThan(0);
      expect(row.minutesPlayed).toBeCloseTo(2, 6);
      expect(controlled.players).toEqual(npc.players);
      expect(controlled.score).toEqual(npc.score);
      expect(controlled.ball).toEqual(npc.ball);
      expect(controlled.lastPossessionChange).toEqual(npc.lastPossessionChange);
      expect(controlled.decisionIndex).toBe(npc.decisionIndex);
    },
    30_000,
  );
});
