import { describe, expect, it } from 'vitest';
import { createCalibrationFixture } from './assumptionCalibration';
import { planSynchronizedReception, receiverMeetingPlanSchema } from './receiverSynchronisation';
import { planBallOrientedMovement, type BallMotorObservation } from './ballOrientedMovement';
import { receptionMovementContactTarget } from './passReception';
import { projectLocomotion } from './locomotion';
import { tacticalMatchStateSchema } from './matchState';
import { observeBoundedScene } from './boundedPerception';
import { constructBoundedCandidates } from './boundedDecision';
import {
  createDisruptionLedger,
  observeDisruption,
  disruptionLedgerSchema,
} from './disruptionLedger';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';

const fixture = () =>
  createCalibrationFixture({ scenario: 'through_ball', attacker: 80, defender: 60 });
const observation = (at: number, x: number, y: number, vx = -5): BallMotorObservation => ({
  at,
  nextAt: at + 0.1,
  ball: {
    position: { x, y, z: 0.11 },
    velocity: { x: vx, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    owner: null,
  },
  others: [],
});
describe('PR198 coherent local receiver plans', () => {
  it('rejects a low forecast that the legacy planner reports after its own horizon', () => {
    const f = fixture(),
      r = f.state.players.find((p) => p.id === f.receiverId)!;
    const seen = observation(f.state.time, 10, 60, 0);
    const old = planBallOrientedMovement(r, seen, f.state.time, r.target, 'receive');
    expect(old.nextContact).not.toBeNull();
    expect(old.contactSeconds).toBeGreaterThan(2.4);
    const plan = planSynchronizedReception(r, seen, f.state.time, f.state.time);
    expect(plan.status).toBe('no_prepared_contact');
    expect(plan.contactAt).toBeNull();
  });
  it('retains a common location, clock, incoming velocity and finite feet for a feasible plan', () => {
    const f = fixture(),
      r = f.state.players.find((p) => p.id === f.receiverId)!;
    r.velocity = { x: 0, y: 0 };
    const plan = planSynchronizedReception(
      r,
      observation(f.state.time, r.position.x + 2, r.position.y),
      f.state.time,
      f.state.time,
    );
    expect(plan.status).toBe('contact_planned');
    expect(plan.contactAt! - f.state.time).toBeLessThanOrEqual(2.4);
    expect(plan.predictedFootDistance).toBeLessThanOrEqual(0.82);
    expect(plan.incomingVelocity).not.toBeNull();
    expect(receiverMeetingPlanSchema.parse(plan)).toEqual(plan);
  });
  it('keeps stale, absent, future and owned observations from producing a contact', () => {
    const f = fixture(),
      r = f.state.players.find((p) => p.id === f.receiverId)!;
    const owned = observation(f.state.time, r.position.x, r.position.y);
    owned.ball!.owner = 'other';
    for (const seen of [
      undefined,
      observation(f.state.time - 0.6, r.position.x, r.position.y),
      observation(f.state.time + 0.2, r.position.x, r.position.y),
      owned,
    ]) {
      expect(planSynchronizedReception(r, seen, f.state.time, f.state.time).contactAt).toBeNull();
    }
  });
  it('has a fixed probe budget and does not consume unknown spin or mutate the observed body', () => {
    const f = fixture(),
      r = f.state.players.find((p) => p.id === f.receiverId)!;
    const seen = observation(f.state.time, r.position.x + 4, r.position.y),
      before = structuredClone(r);
    const a = planSynchronizedReception(r, seen, f.state.time, f.state.time);
    seen.ball!.spin = { x: 99, y: -300, z: 100 };
    expect(planSynchronizedReception(r, seen, f.state.time, f.state.time)).toEqual(a);
    expect(a.probes).toBeLessThanOrEqual(3);
    expect(r).toEqual(before);
  });
  it('does not use an engineering target or freeze tactical movement without a local plan', () => {
    const f = fixture(),
      r = f.state.players.find((p) => p.id === f.receiverId)!;
    Object.assign(f.state, {
      experimentalReceiverAnticipation: true,
      experimentalReceiverSynchronisation: true,
    });
    f.state.receptionPreparation = {
      actorId: r.id,
      sourceActorId: f.actorId,
      releasedAt: f.state.time,
      awarenessAt: f.state.time,
      expectedContactPoint: { x: 80, y: 30 },
      expectedArrivalTime: f.state.time + 1,
      movement: 'meet_ball',
      ballEpisode: 'test',
      readiness: {
        contactPoint: r.position,
        awareAt: 0,
        readyAt: 0,
        earliestUsefulContactTime: 0,
        preferredArrivalSpeed: 4,
        maximumComfortableArrivalSpeed: 8,
        preparationMargin: 0,
        movementTime: 0,
        orientationTime: 0,
      },
    };
    expect(receptionMovementContactTarget(f.state, r)).toBeUndefined();
    expect(projectLocomotion(f.state, r, { x: r.position.x + 8, y: r.position.y }).reason).not.toBe(
      'receive_pass',
    );
    expect(tacticalMatchStateSchema.parse(f.state).experimentalReceiverSynchronisation).toBe(true);
    const old = fixture().state;
    expect(tacticalMatchStateSchema.parse(old).experimentalReceiverSynchronisation).toBeUndefined();
  });
});
describe('PR198 observed loft repertoire', () => {
  const scene = () => {
    const f = fixture();
    Object.assign(f.state, {
      experimentalActivePerception: true,
      experimentalTransitionIntelligence: true,
    });
    return observeBoundedScene(f.state, f.state.players.find((p) => p.id === f.actorId)!);
  };
  it('adds distinct loft choices only with the separate experiment; ground choices stay available', () => {
    const s = scene(),
      before = constructBoundedCandidates(s);
    expect(before.some((c) => c.action.type === 'pass' && c.action.delivery === 'lofted')).toBe(
      false,
    );
    const after = constructBoundedCandidates({ ...s, observedLoftedExperiment: true });
    const loft = after.filter((c) => c.action.type === 'pass' && c.action.delivery === 'lofted');
    expect(loft.length).toBeGreaterThan(0);
    expect(loft.length).toBeLessThanOrEqual(2);
    expect(after.filter((c) => !c.id.endsWith(':lofted'))).toEqual(before);
    for (const c of loft)
      if (c.action.type === 'pass') {
        expect(c.action.deliveryPlan!.velocity.z).toBeGreaterThan(0);
        expect(c.action.deliveryPlan!.elevation).toBeGreaterThan(0);
        expect(c.opportunity?.travelSeconds).toBe(c.action.deliveryPlan?.predictedArrivalTime);
      }
  });
  it('cannot invent an unseen or stale runner, or extend the native range', () => {
    const s = { ...scene(), observedLoftedExperiment: true };
    s.knowledge = s.knowledge!.map((k) => ({ ...k, observedAt: s.at - 2 }));
    expect(constructBoundedCandidates(s).some((c) => c.id.endsWith(':lofted'))).toBe(false);
    s.visible = s.visible.filter((p) => p.team !== s.team);
    s.remembered = [];
    expect(constructBoundedCandidates(s).some((c) => c.id.endsWith(':lofted'))).toBe(false);
  });
});
describe('PR198 physical research ledger', () => {
  it('attributes loss through an intervening loose-ball interval without inventing a contact', () => {
    const initial = fixture().state,
      ledger = createDisruptionLedger(initial),
      loose = structuredClone(initial);
    delete loose.ball.ownerId;
    loose.time += 0.025;
    observeDisruption(ledger, initial, initial, loose, 'home');
    const recovered = structuredClone(loose);
    recovered.time += 0.025;
    recovered.ball.ownerId = recovered.players.find((p) => p.team === 'away')!.id;
    observeDisruption(ledger, initial, loose, recovered, 'home');
    expect(ledger.turnovers).toHaveLength(1);
    expect(ledger.firstUnexpectedContact).toBeNull();
  });
  it('records no inherited contact and leaves a canonical continuation identical', () => {
    const initial = fixture().state,
      ledger = createDisruptionLedger(initial);
    observeDisruption(ledger, initial, initial, initial, 'home');
    expect(ledger.firstUnexpectedContact).toBeNull();
    expect(ledger.goalkeeperRebounds).toBe(0);
    let observed = structuredClone(initial),
      bare = structuredClone(initial);
    for (let i = 0; i < 12; i++) {
      const before = observed;
      observed = step(observed, 0.025);
      observeDisruption(ledger, initial, before, observed, 'home');
      bare = step(bare, 0.025);
    }
    expect(observed).toEqual(bare);
    expect(disruptionLedgerSchema.parse(ledger)).toEqual(ledger);
  });
});
