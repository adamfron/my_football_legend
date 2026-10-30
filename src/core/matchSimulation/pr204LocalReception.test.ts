import { describe, expect, it } from 'vitest';
import { createProspectiveFixture } from './prospectivePlayLaboratory';
import { advanceLiveBallFlight, boundedMovementTarget } from './liveBallFlight';
import { advanceActivePerception } from './activePerception';
import { acquireFlightSighting } from './ballFlightBelief';
import { locallyObservedReception, locallyPreparedFirstTimeAction, localReceptionMovementTarget } from './localReception';
import { receivingPositionTarget } from './receivingPositions';
import { observeBoundedScene } from './boundedPerception';
import { constructBoundedCandidates } from './boundedDecision';
import { resolveMatchAction } from './matchActions';
import { canExecuteFirstTimePass } from './firstTimePassing';
import { advancePreReceptionPlans } from './preReceptionPlanning';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';

const fixture = (height = 0.11) => {
  const f = createProspectiveFixture({ seed: 'pr204-observed-reception' });
  const s = advanceActivePerception(advanceLiveBallFlight(f.state));
  s.prospectiveMovement = 'two-pass-continuity-dev-v1';
  delete s.integrationProfile;
  const now = s.time;
  const sighting = { at: now, position: { x: f.c.position.x - 3, y: f.c.position.y, z: height },
    positionError: 0.02, motion: { since: now - 0.1, from: { x: f.c.position.x - 4, y: f.c.position.y, z: height } } };
  const belief = acquireFlightSighting(undefined, sighting, 85);
  s.liveBallFlightRuntime!.sensors[f.c.id] = { sampledAt: now, nextAcquisitionAt: now + 0.1, optical: sighting, belief };
  s.activePerceptionRuntime!.plans[f.c.id] = { actorId: f.c.id, createdAt: now - 0.1,
    reviewedAt: now, expectedContactAt: now + 0.5, expectedPoint: { ...f.c.position },
    incomingVelocity: { x: 10, y: 0, z: 0 }, expiresAt: now + 1,
    options: [], invalidated: [], status: 'preparing', receptionAt: null, usedId: null };
  return { ...f, state: s };
};

describe('local reception recognition', () => {
  it('preserves legacy human reception intent without an action source but discards explicit autonomous intent', () => {
    const f = fixture();
    const s = f.state;
    s.controlledFootballerId = f.c.id;
    s.playerAgencyEnabled = true;
    s.ball = { x: 35, y: 10, height: 0.11, velocity: { x: 0.5, y: 0, z: 0 },
      travelKind: 'pass', lastTouchPlayerId: f.a.id };
    s.pendingReceptionIntent = { actorId: f.c.id, action: { type: 'hold', actorId: f.c.id },
      createdAt: s.time, expiresAt: s.time + 1, ballEpisode: 'incoming' };
    const legacy = structuredClone(s);
    const human = structuredClone(s);
    human.pendingReceptionIntent!.actionSource = 'human_selected';
    const autonomous = structuredClone(s);
    autonomous.pendingReceptionIntent!.actionSource = 'autonomous_npc';
    expect(stepTacticalMatchAfterDecisionProbe(legacy, 0.025).pendingReceptionIntent?.action.type).toBe('hold');
    expect(stepTacticalMatchAfterDecisionProbe(human, 0.025).pendingReceptionIntent?.action.type).toBe('hold');
    expect(stepTacticalMatchAfterDecisionProbe(autonomous, 0.025).pendingReceptionIntent).toBeUndefined();
  });
  it('requires current personal motion evidence and an unexpired locally reviewed plan', () => {
    const f = fixture();
    expect(locallyObservedReception(f.state, f.c)).toBeDefined();
    const hidden = structuredClone(f.state);
    hidden.ball.velocity = { x: -99, y: 77, z: 10 };
    hidden.ball.intendedReceiverId = f.a.id;
    expect(locallyObservedReception(hidden, f.c)).toEqual(locallyObservedReception(f.state, f.c));
    const stale = structuredClone(f.state);
    stale.time += 0.6;
    expect(locallyObservedReception(stale, f.c)).toBeUndefined();
    delete stale.liveBallFlightRuntime!.sensors[f.c.id]!.belief;
    expect(locallyObservedReception(stale, f.c)).toBeUndefined();
  });
  it('allows independent recognition by multiple players without assigning ownership', () => {
    const f = fixture();
    const s = f.state;
    const sensor = structuredClone(s.liveBallFlightRuntime!.sensors[f.c.id]!);
    const plan = structuredClone(s.activePerceptionRuntime!.plans[f.c.id]!);
    s.liveBallFlightRuntime!.sensors[f.b.id] = sensor;
    s.activePerceptionRuntime!.plans[f.b.id] = { ...plan, actorId: f.b.id };
    const owner = s.ball.ownerId;
    expect(locallyObservedReception(s, f.c)).toBeDefined();
    expect(locallyObservedReception(s, f.b)).toBeDefined();
    expect(s.ball.ownerId).toBe(owner);
  });
  it('drops old recognition after lost evidence and resets its clock on a changed flight', () => {
    const f = fixture();
    const old = f.state.activePerceptionRuntime!.plans[f.c.id]!;
    old.createdAt = f.state.time - 2;
    old.reviewedAt = f.state.time - 0.2;
    old.incomingVelocity = { x: -20, y: 0, z: 0 };
    const revised = advancePreReceptionPlans(f.state);
    expect(revised.activePerceptionRuntime!.plans[f.c.id]?.createdAt).toBe(f.state.time);
    const stale = { ...revised, time: revised.time + 0.6 };
    const expired = advancePreReceptionPlans(stale);
    expect(expired.activePerceptionRuntime!.plans[f.c.id]).toBeUndefined();
  });
  it('uses local braking with no playable low contact and preserves defensive and human authority', () => {
    const f = fixture(30);
    const local = locallyObservedReception(f.state, f.c)!;
    expect(local.movement.nextContact).toBeNull();
    expect(local.movement.movementTarget).toEqual(f.c.position);
    expect(localReceptionMovementTarget(f.state, f.c, local)).toEqual(f.c.position);
    const withoutRecovery = { ...f.state };
    delete withoutRecovery.boundedReceiverRecovery;
    expect(localReceptionMovementTarget(withoutRecovery, f.c, local)).toBeUndefined();
    expect(boundedMovementTarget(f.state, f.c, f.c.position, undefined)).toEqual(f.c.position);
    const challengeTarget = { x: 50, y: 35 };
    const s = { ...f.state, defensiveChallenge: { actorId: f.c.id, target: challengeTarget,
      expiresAt: f.state.time + 1 } as NonNullable<typeof f.state.defensiveChallenge> };
    expect(boundedMovementTarget(s, f.c, f.c.position, undefined)).toEqual(challengeTarget);
  });
  it('withdraws support only for a local incoming plan and never on a hidden flag', () => {
    const f = fixture();
    expect(locallyObservedReception(f.state, f.c)).toBeDefined();
    expect(receivingPositionTarget(f.state, f.c)).toBeUndefined();
    expect(locallyObservedReception({ ...f.state, postGoal: {} as NonNullable<typeof f.state.postGoal> }, f.c)).toBeUndefined();
  });
  it('revalidates an observed prepared first-time pass and rejects stale or absent evidence', () => {
    const f = fixture();
    const scene = observeBoundedScene(f.state, f.c);
    expect(scene.ball).not.toBeNull();
    const candidates = constructBoundedCandidates({ ...scene, contactReady: true,
      ball: { ...scene.ball!, ownerId: f.c.id } });
    const pass = candidates.find((c) => c.action.type === 'pass' && c.feasible && c.legal !== false && c.risk < 0.8);
    expect(pass).toBeDefined();
    const plan = f.state.activePerceptionRuntime!.plans[f.c.id]!;
    plan.options = [{ id: pass!.id, kind: 'pass', target: pass!.action.type === 'pass' ? pass!.action.target : null,
      receiverId: pass!.action.type === 'pass' ? pass!.action.receiverId : null,
      requiredFacing: 0, preparationSeconds: 0, evidence: [], confidence: 0.8,
      expiresAt: f.state.time + 0.5, difficulty: pass!.risk, benefit: pass!.benefit, goal: pass!.goal }];
    expect(locallyPreparedFirstTimeAction(f.state, f.c)).toEqual({ ...pass!.action, firstTime: true });
    const unseen = structuredClone(f.state);
    delete unseen.liveBallFlightRuntime!.sensors[f.c.id]!.belief;
    expect(locallyPreparedFirstTimeAction(unseen, f.c)).toBeUndefined();
    plan.options[0]!.expiresAt = f.state.time;
    expect(locallyPreparedFirstTimeAction(f.state, f.c)).toBeUndefined();
  });
  it('executes a prepared first-time pass only after an actual finite contact', () => {
    const f = fixture();
    const s = f.state;
    s.playerAgencyEnabled = false;
    s.actionCooldown = 0;
    f.c.position = { x: 50, y: 34 };
    f.c.target = { ...f.c.position };
    f.c.velocity = { x: 0, y: 0 };
    f.c.facingAngle = -Math.PI / 2;
    f.b.position = { x: 65, y: 34 };
    f.a.position = { x: 35, y: 34 };
    for (const p of s.players.filter((p) => ![f.a.id, f.b.id, f.c.id].includes(p.id))) {
      p.position = { x: p.team === f.c.team ? 5 : 95, y: 2 + p.slotIndex * 5 };
      p.velocity = { x: 0, y: 0 };
    }
    s.ball = { x: 49.8, y: 34, height: 0.11, velocity: { x: 7, y: 0, z: 0 },
      travelKind: 'pass', lastTouchPlayerId: f.a.id, intendedReceiverId: f.c.id };
    s.possessionTeam = f.c.team;
    const memory = s.activePerceptionRuntime!.memory[f.c.id]!;
    memory.gaze = Math.PI / 2;
    const sight = memory.entities.find((p) => p.id === f.b.id)!;
    sight.position = { ...f.b.position };
    sight.observedAt = s.time;
    memory.directIds = [f.b.id];
    const observation = { at: s.time, position: { x: 49.8, y: 34, z: 0.11 }, positionError: 0.02,
      motion: { since: s.time - 0.1, from: { x: 49.1, y: 34, z: 0.11 } } };
    s.liveBallFlightRuntime!.sensors[f.c.id] = { sampledAt: s.time, nextAcquisitionAt: s.time + 0.2,
      optical: observation, belief: acquireFlightSighting(undefined, observation, 85) };
    const plan = s.activePerceptionRuntime!.plans[f.c.id]!;
    plan.expectedPoint = { ...f.c.position };
    plan.expectedContactAt = s.time + 0.1;
    plan.incomingVelocity = { x: 7, y: 0, z: 0 };
    const scene = observeBoundedScene(s, f.c);
    const pass = constructBoundedCandidates({ ...scene, contactReady: true,
      ball: { ...scene.ball!, ownerId: f.c.id } }).find((c) => c.action.type === 'pass' && c.feasible && c.legal !== false && c.risk < 0.8);
    expect(pass).toBeDefined();
    plan.options = [{ id: pass!.id, kind: 'pass', target: pass!.action.type === 'pass' ? pass!.action.target : null,
      receiverId: pass!.action.type === 'pass' ? pass!.action.receiverId : null, requiredFacing: 0,
      preparationSeconds: 0, evidence: [], confidence: 0.8, expiresAt: s.time + 1,
      difficulty: pass!.risk, benefit: pass!.benefit, goal: pass!.goal }];
    const action = locallyPreparedFirstTimeAction(s, f.c);
    expect(action?.type).toBe('pass');
    if (!action || action.type !== 'pass') throw Error('Expected an observed prepared pass');
    expect(canExecuteFirstTimePass(s, action, true)).toBe(true);
    const next = resolveMatchAction(s, action, 'autonomous_npc');
    expect(next.lastPassDiagnostic?.passerId).toBe(f.c.id);
    expect(next.lastPassDiagnostic?.executionType).toBe('first_time');
    expect(next.lastGroundContact?.actorId).toBe(f.c.id);
    expect(next.lastGroundContact?.executed).toBe(true);
  });
});
