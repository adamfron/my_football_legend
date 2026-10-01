// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  evaluatePassInterceptionOpportunity,
  evaluateOnBallDecisionRelevance,
  PlayerAgencyTracker,
  projectPlayerAgency,
  projectContextualInteractions,
  projectIncomingPlayerInvolvement,
  resolveDevPlayerDecision,
} from '.';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr145-agency',
      control: { mode: 'spectator' },
    }),
  );
  const actor = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'central_midfielder',
  )!;
  const source = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  const teammate = state.players.find(
    (player) =>
      player.team === actor.team &&
      player.id !== actor.id &&
      player.profile.primaryPosition !== 'goalkeeper',
  )!;
  state.controlledFootballerId = actor.id;
  state.players.forEach((player) => {
    player.position = { x: player.team === 'home' ? 90 : 100, y: 62 };
    player.anchor = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  });
  actor.position = { x: 26, y: 38 };
  actor.anchor = { x: 26, y: 42 };
  state.possessionTeam = source.team;
  state.ball = {
    x: 16,
    y: 34,
    height: 0.11,
    airborne: false,
    velocity: { x: 9, y: 0, z: 0 },
    bounceCount: 0,
    travelKind: 'pass',
    sourceAction: 'pass',
    lastTouchPlayerId: source.id,
  };
  return { state, actor, source, teammate };
};

describe('PR145 football commitments rather than harmless movement variants', () => {
  it('delegates routine close-down and a harmless nearby challenge', () => {
    const { state, actor, source } = fixture();
    actor.position = { x: 52, y: 34 };
    actor.anchor = { ...actor.position };
    source.position = { x: 53.5, y: 34 };
    state.ball = { ...source.position, ownerId: source.id };
    expect(projectPlayerAgency(state).probe).toMatchObject({
      blockedReason: 'routine',
      ownershipReason: 'routine_close_down',
      semanticFamilies: ['contain'],
    });
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
  });

  it('keeps a small ordinary interception/line adjustment autonomous', () => {
    const { state, actor } = fixture();
    actor.position = { x: 52, y: 34.4 };
    actor.anchor = { ...actor.position };
    state.ball = { ...state.ball, x: 48, velocity: { x: 10, y: 0, z: 0 } };
    expect(evaluatePassInterceptionOpportunity(state, actor.id).viable).toBe(true);
    expect(projectPlayerAgency(state).probe).toMatchObject({
      blockedReason: 'routine',
      ownershipReason: 'routine_line_adjustment',
    });
  });

  it('uses earlier teammate ETA to leave the controlled player in their defensive role', () => {
    const { state, actor, teammate } = fixture();
    teammate.position = { x: 26, y: 35.2 };
    const interception = evaluatePassInterceptionOpportunity(state, actor.id);
    expect(interception.viable).toBe(true);
    expect(interception).toMatchObject({
      ownerId: teammate.id,
      ownershipReason: 'teammate_earlier_eta',
    });
    expect(interception.teammateArrivalTime!).toBeLessThan(
      interception.playerArrival!.estimatedTime,
    );
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
    const tracker = new PlayerAgencyTracker();
    const diagnostic = tracker.observe(state, projectPlayerAgency(state));
    expect(diagnostic).toMatchObject({
      ownership: 'autonomous_routine',
      reason: 'teammate_earlier_eta',
      interceptionOwnerId: teammate.id,
    });
  });

  it('respects a teammate standing earlier in the actual lane even far from its later endpoint', () => {
    const { state, actor, teammate } = fixture();
    teammate.position = { x: 20, y: 34 };
    expect(evaluatePassInterceptionOpportunity(state, actor.id)).toMatchObject({
      viable: true,
      ownerId: teammate.id,
      ownershipReason: 'teammate_in_lane',
    });
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
  });

  it('offers the genuine best interceptor a meaningful dangerous-space choice', () => {
    const { state, actor } = fixture();
    const snapshot = structuredClone(state);
    expect(evaluatePassInterceptionOpportunity(state, actor.id)).toMatchObject({
      viable: true,
      ownerId: actor.id,
    });
    const evaluation = projectPlayerAgency(state);
    expect(evaluation.opportunity?.kind).toBe('defensive_response');
    expect(evaluation.probe.semanticFamilies).toEqual(['hold_shape', 'intercept']);
    expect(state).toEqual(snapshot);
  });

  it('offers contain versus committed challenge against a dangerous receiver', () => {
    const { state, actor, source } = fixture();
    actor.position = { x: 22, y: 34 };
    actor.anchor = { ...actor.position };
    source.position = { x: 23.5, y: 34 };
    state.ball = { ...source.position, ownerId: source.id };
    const evaluation = projectPlayerAgency(state);
    expect(evaluation.opportunity?.kind).toBe('defensive_response');
    expect(evaluation.probe.semanticFamilies).toEqual([
      'contain',
      'challenge',
      'aggressive_challenge',
    ]);
    expect(
      projectContextualInteractions(state, evaluation.opportunity!, {
        kind: 'player',
        playerId: source.id,
      }),
    ).toHaveLength(3);
  });

  it('does not reopen a defensive choice for unrelated AI decision indices or tiny geometry changes', () => {
    const { state } = fixture();
    state.ball.x = 15.99;
    const opportunity = projectPlayerAgency(state).opportunity!;
    const delegated = resolveDevPlayerDecision(state, opportunity).state;
    for (let index = 1; index <= 12; index++) {
      expect(
        projectPlayerAgency({
          ...delegated,
          time: delegated.time + index,
          decisionIndex: state.decisionIndex + index,
          ball: { ...state.ball, x: state.ball.x + index * 0.01 },
        }).opportunity,
      ).toBeUndefined();
    }
  });

  it('never treats an opponent delivery or another teammate target as a controlled reception', () => {
    const { state, actor, source, teammate } = fixture();
    state.ball = {
      ...state.ball,
      x: 20,
      target: { ...actor.position },
      travelKind: 'through_ball',
      intendedReceiverId: actor.id,
    };
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(false);
    state.ball = { ...state.ball, lastTouchPlayerId: teammate.id, intendedReceiverId: source.id };
    expect(projectIncomingPlayerInvolvement(state, actor.id).relevant).toBe(false);
  });

  it('uses normal preparation for routine shielding and restores terminal attacking agency afterward', () => {
    const { state, actor, source } = fixture();
    actor.position = { x: 85, y: 34 };
    source.position = { x: 86, y: 34 };
    state.ball = { ...actor.position, ownerId: actor.id };
    state.possessionTeam = actor.team;
    state.onBallPreparation = {
      actorId: actor.id,
      gainedAt: state.time,
      readyAt: state.time + 0.4,
      kind: 'shielding',
      incomingSpeed: 0,
    };
    expect(projectPlayerAgency(state).probe.ownershipReason).toBe('routine_shielding_preparation');
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
    expect(projectPlayerAgency({ ...state, time: state.time + 0.5 }).opportunity?.kind).toBe(
      'on_ball',
    );
  });

  it('does not use pressure by itself to classify safe midfield recycling as a human decision', () => {
    const { state, actor, source } = fixture();
    actor.position = { x: 25, y: 34 };
    state.ball = { ...actor.position, ownerId: actor.id };
    state.possessionTeam = actor.team;
    source.position = { x: 26, y: 34 };
    state.players
      .filter((player) => player.team === actor.team && player.id !== actor.id)
      .forEach((player, index) => {
        player.position = { x: 21, y: 28 + index * 1.2 };
      });
    const relevance = evaluateOnBallDecisionRelevance(state, actor.id);
    expect(relevance.reasons).toContain('pressure');
    expect(relevance.relevant).toBe(false);
    expect(projectPlayerAgency(state).opportunity).toBeUndefined();
  });
});
