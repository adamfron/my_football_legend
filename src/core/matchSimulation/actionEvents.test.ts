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
import { resolveMatchAction } from './matchActions';
import { projectPlayerDecisionOpportunity, incomingBallIntentKey } from './playerDecision';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import {
  ACTION_EVENT_CAPACITY,
  canonicalActionEventSchema,
  emitCanonicalActionEvents,
} from './actionEvents';
import { PresentationContextHistory } from '../../app/match/tacticalRenderer/contextHistory';
import { PresentationFrameProjector } from '../../app/match/tacticalRenderer/frameProjection';
import { selectActionFeedback } from '../../app/match/tacticalRenderer/actionFeedback';

const world = createCanonicalWorldDatabase();
const fixture = (): TacticalMatchState => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr147-canonical-feedback',
      control: { mode: 'spectator' },
    }),
  );
  state.scenario = 'open_play';
  delete state.restart;
  state.players = state.players.map((player) => ({
    ...player,
    position: {
      x: player.team === 'home' ? 10 : 95,
      y: 60,
    },
    velocity: { x: 0, y: 0 },
  }));
  return state;
};

describe('canonical action event transitions', () => {
  it('records the actual pass release once, with stable IDs, actor and physical origin', () => {
    const state = fixture();
    const [passer, receiver] = state.players.filter(
      (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
    );
    passer!.position = { x: 40, y: 34 };
    receiver!.position = { x: 55, y: 34 };
    receiver!.velocity = { x: 4, y: 0 };
    receiver!.target = { x: 75, y: 34 };
    state.ball = { ...passer!.position, ownerId: passer!.id };
    const released = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer!.id,
      receiverId: receiver!.id,
      target: receiver!.position,
      intent: 'through',
    });
    expect(released.actionEvents).toHaveLength(1);
    const event = released.actionEvents![0]!;
    expect(event).toMatchObject({
      kind: 'through_pass',
      actorId: passer!.id,
      team: 'home',
      targetId: receiver!.id,
      at: state.time,
      position: passer!.position,
      outcome: 'released',
    });
    expect(canonicalActionEventSchema.safeParse(event).success).toBe(true);
    expect(emitCanonicalActionEvents(state, released).actionEvents).toEqual(released.actionEvents);
    expect(emitCanonicalActionEvents(released, released)).toBe(released);
    expect(tacticalMatchStateSchema.safeParse(released).success).toBe(true);
  });

  it('keeps event memory bounded by capacity and canonical age throughout a long stream', () => {
    let state = fixture();
    const actor = state.players[1]!;
    for (let i = 0; i < 200; i++) {
      const next: TacticalMatchState = {
        ...state,
        time: i / 100,
        lastReceptionOutcome: {
          receiverId: actor.id,
          kind: 'heavy_touch',
          contactPoint: actor.position,
        },
      };
      state = emitCanonicalActionEvents(state, next);
    }
    expect(state.actionEvents).toHaveLength(ACTION_EVENT_CAPACITY);
    expect(new Set(state.actionEvents!.map((e) => e.id)).size).toBe(ACTION_EVENT_CAPACITY);
    const expired = emitCanonicalActionEvents(state, { ...state, time: 15 });
    expect(expired.actionEvents).toEqual([]);
    expect(expired.actionEventSequence).toBe(200);
    expect(emitCanonicalActionEvents(expired, { ...expired, time: 16 }).actionEvents).toBe(
      expired.actionEvents,
    );
  });

  it('dates a new reception independently of a stale earlier pass', () => {
    const state = fixture();
    const actor = state.players[1]!;
    state.time = 5;
    state.lastPassDiagnostic = {
      passId: 'old',
      passerId: state.players[2]!.id,
      intendedReceiverId: actor.id,
      releasedAt: 1,
      resolvedAt: 2,
      receiverPositionAtRelease: actor.position,
      receiverVelocityAtRelease: actor.velocity,
      predictedReceptionPoint: actor.position,
      actualContactPoint: actor.position,
      awarenessDelay: 0,
      receiverArrivalEstimate: 0,
      bestDefenderArrivalEstimate: 5,
      leadDistance: 0,
    };
    const next = emitCanonicalActionEvents(state, {
      ...state,
      time: 5.025,
      lastReceptionOutcome: {
        receiverId: actor.id,
        kind: 'heavy_touch',
        contactPoint: actor.position,
      },
    });
    expect(next.actionEvents![0]!.at).toBe(5.025);
    expect(next.actionEvents![0]!.parentId).toBeUndefined();
  });

  it('shows physical heavy touch then opponent recovery before any meaningful prompt', () => {
    let state = fixture();
    const receiver = state.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    const passer = state.players.find(
      (p) =>
        p.team === 'home' && p.id !== receiver.id && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    const opponent = state.players.find(
      (p) => p.team === 'away' && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    state.time = 4.2;
    state.controlledFootballerId = receiver.id;
    receiver.position = { x: 40, y: 34 };
    receiver.target = { x: 44, y: 34 };
    receiver.velocity = { x: 2, y: 0 };
    receiver.facingAngle = Math.PI;
    receiver.profile = {
      ...receiver.profile,
      attributes: {
        ...receiver.profile.attributes,
        firstTouch: 55,
        technique: 55,
        agility: 1,
        composure: 55,
        gameReading: 1,
        pace: 1,
      },
    };
    opponent.position = { x: 41.6, y: 34 };
    opponent.target = { x: 40.6, y: 34 };
    opponent.velocity = { x: -3, y: 0 };
    opponent.facingAngle = Math.PI;
    opponent.profile = {
      ...opponent.profile,
      attributes: { ...opponent.profile.attributes, pace: 99, agility: 99, gameReading: 99 },
    };
    passer.position = { x: 30, y: 34 };
    state.ball = { ...passer.position, ownerId: passer.id };
    state = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    });
    const release = state.actionEvents!.find((event) => event.kind === 'pass')!;
    const passId = state.lastPassDiagnostic!.passId;
    expect(selectActionFeedback(state.actionEvents!, 4200)).toContain(release);
    state.time = 5;
    state.ball = {
      x: 39.3,
      y: 34,
      height: 0.11,
      velocity: { x: 4, y: 0, z: 0 },
      from: { x: 30, y: 34 },
      target: receiver.position,
      intendedReceiverId: receiver.id,
      lastTouchPlayerId: passer.id,
      travelKind: 'pass',
      sourceAction: 'pass',
      flightTime: 0.8,
    };
    state.receptionPreparation = {
      actorId: receiver.id,
      sourceActorId: passer.id,
      releasedAt: 4.2,
      awarenessAt: 4,
      expectedContactPoint: receiver.position,
      expectedArrivalTime: 0.02,
      movement: 'meet_ball',
      ballEpisode: 'late-arrival',
      readiness: {
        contactPoint: receiver.position,
        awareAt: 0,
        readyAt: 0,
        earliestUsefulContactTime: 0.1,
        preferredArrivalSpeed: 4,
        maximumComfortableArrivalSpeed: 8,
        preparationMargin: 1,
        movementTime: 0,
        orientationTime: 0,
      },
    };
    state.lastPassDiagnostic = {
      passId,
      passerId: passer.id,
      intendedReceiverId: receiver.id,
      releasedAt: 4.2,
      receiverPositionAtRelease: receiver.position,
      receiverVelocityAtRelease: receiver.velocity,
      predictedReceptionPoint: receiver.position,
      awarenessDelay: 0.1,
      receiverArrivalEstimate: 0.02,
      bestDefenderArrivalEstimate: 2,
      leadDistance: 0,
    };
    state.actionCooldown = 10;
    state.pendingReceptionIntent = {
      actorId: receiver.id,
      action: { type: 'hold', actorId: receiver.id },
      actionSource: 'human_selected',
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: incomingBallIntentKey(state),
    };
    expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(state.lastReceptionOutcome?.kind).toBe('heavy_touch');
    expect(state.actionEvents?.map((event) => event.kind)).toContain('heavy_touch');
    for (let i = 0; i < 28 && state.possessionTeam === 'home'; i++) {
      expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    }
    expect(
      state.ball.ownerId,
      JSON.stringify({
        ball: state.ball,
        reception: state.lastReceptionOutcome,
        players: state.players
          .filter((p) => [receiver.id, opponent.id].includes(p.id))
          .map((p) => [p.id, p.position, p.velocity]),
      }),
    ).toBe(opponent.id);
    const heavy = state.actionEvents!.find((event) => event.kind === 'heavy_touch')!;
    const intercepted = state.actionEvents!.find((event) => event.kind === 'recovery')!;
    expect(heavy.parentId).toBe(release.id);
    expect(intercepted.parentId).toBe(heavy.id);
    expect(intercepted.actorId).toBe(opponent.id);
    expect(intercepted.at).toBeGreaterThan(heavy.at);
    expect(
      selectActionFeedback(state.actionEvents!, heavy.at * 1000).map((event) => event.kind),
    ).toContain('heavy_touch');
    expect(
      selectActionFeedback(state.actionEvents!, intercepted.at * 1000).map((event) => event.kind),
    ).not.toContain('recovery');
  });

  it('leaves the complete deterministic canonical state identical with presentation observation', () => {
    let observed = fixture(),
      plain = structuredClone(observed);
    const history = new PresentationContextHistory();
    const projector = new PresentationFrameProjector();
    for (let tick = 0; tick < 100; tick++) {
      observed = stepTacticalMatch(observed, FIXED_MATCH_DT);
      plain = stepTacticalMatch(plain, FIXED_MATCH_DT);
      history.observe(observed);
      const frame = projector.frame(observed);
      selectActionFeedback(frame.actionEvents ?? [], frame.timestampMs);
      history.sample(Math.max(0, observed.time * 1000 - 50));
    }
    expect(observed).toEqual(plain);
  });
});
