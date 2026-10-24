import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createOpenPlayMatchFixture as createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { assessFirstTouch, firstTouchAssessmentSchema } from './firstTouch';
import { interpretPassExecution } from './passExecution';
import { resolveReceptionOutcome } from './passReception';
import { canExecuteFirstTimePass } from './firstTimePassing';
import { resolveMatchAction, chooseIncomingShotAction } from './matchActions';
import { evaluateStateValueAction } from './decisionStateValue';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from './matchFlowTelemetry';
import { tacticalMatchStateSchema } from './matchState';
import { createMatchFitness } from './matchFitness';
import { playerContactGeometry } from './ballContactGeometry';
import type { MatchAction, TacticalMatchState } from './matchState';
const world = createCanonicalWorldDatabase();
const initial = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed: 'pr180-contact-regression',
    control: { mode: 'spectator' },
  }),
);
const fixture = (skill = 80, speed = 12) => {
  const state = structuredClone(initial);
  state.time = 10;
  state.scenario = 'open_play';
  delete state.restart;
  state.playerAgencyEnabled = false;
  state.actionCooldown = 0;
  const [actor, receiver, passer] = state.players.filter(
    (p) => p.team === 'home' && p.slot.position !== 'goalkeeper',
  );
  for (const [i, p] of state.players.entries()) {
    p.position = { x: p.team === 'away' ? 95 : 5, y: 3 + i * 2 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  }
  actor!.position = { x: 50, y: 34 };
  actor!.target = { ...actor!.position };
  actor!.facingAngle = -Math.PI / 2;
  receiver!.position = { x: 65, y: 34 };
  receiver!.target = { ...receiver!.position };
  passer!.position = { x: 35, y: 34 };
  for (const key of Object.keys(actor!.profile.attributes) as (keyof NonNullable<
    typeof actor
  >['profile']['attributes'])[])
    actor!.profile.attributes[key] = skill;
  actor!.profile.weakFootProficiency = skill;
  state.ball = {
    x: 49.8,
    y: 34,
    height: 0.11,
    velocity: { x: speed, y: 0, z: 0 },
    travelKind: 'pass',
    lastTouchPlayerId: passer!.id,
    intendedReceiverId: actor!.id,
  };
  state.possessionTeam = 'home';
  state.currentActorId = passer!.id;
  return { state, actor: actor!, receiver: receiver!, passer: passer! };
};
const pass = (f: ReturnType<typeof fixture>): Extract<MatchAction, { type: 'pass' }> => ({
  type: 'pass',
  actorId: f.actor.id,
  receiverId: f.receiver.id,
  target: { ...f.receiver.position },
  intent: 'progressive',
  firstTime: true,
});

describe('PR180 shared first-touch mechanics', () => {
  it('uses the actually contacted weaker foot and temporary reserves without changing attributes', () => {
    const f = fixture(80, 18);
    f.actor.profile.dominantFoot = 'right';
    f.actor.profile.weakFootProficiency = 20;
    const geometry = playerContactGeometry(f.actor);
    const strong = assessFirstTouch(f.state, f.actor, geometry.rightFoot, { x: 35, y: 34 }, 'pass');
    const weak = assessFirstTouch(f.state, f.actor, geometry.leftFoot, { x: 35, y: 34 }, 'pass');
    expect(weak.weakFootDifficulty).toBeGreaterThan(strong.weakFootDifficulty);
    expect(weak.quality).toBeLessThan(strong.quality);
    const attributes = { ...f.actor.profile.attributes };
    f.actor.fitness = { ...createMatchFitness(), longTermCapacity: 0.6, burstReadiness: 0.1 };
    expect(
      assessFirstTouch(f.state, f.actor, geometry.rightFoot, { x: 35, y: 34 }, 'pass').quality,
    ).toBeLessThan(strong.quality);
    expect(f.actor.profile.attributes).toEqual(attributes);
  });
  it.each([3, 7, 12, 18, 24])(
    'uses a finite contact window for %s m/s without a pass quota',
    (speed) => {
      const f = fixture(90, speed),
        touch = assessFirstTouch(f.state, f.actor, f.state.ball, f.receiver.position, 'pass');
      expect(firstTouchAssessmentSchema.safeParse(touch).success).toBe(true);
      expect(touch.feasible).toBe(true);
      expect(touch.contactSeconds).toBeGreaterThan(0);
      expect(touch.contactSeconds).toBeLessThanOrEqual(0.18);
      expect(resolveMatchAction(f.state, pass(f)).decisionIndex).toBe(f.state.decisionIndex + 1);
    },
  );
  it('distinguishes relative arrival, incoming direction, target, preparation, pressure, spin and technique', () => {
    const f = fixture(),
      target = { x: 35, y: 34 };
    const assess = () => assessFirstTouch(f.state, f.actor, f.state.ball, target, 'pass');
    const base = assess();
    f.actor.velocity.x = 6;
    expect(assess().relativeSpeed).toBeLessThan(base.relativeSpeed);
    f.actor.velocity.x = 0;
    f.state.ball.velocity!.x = -12;
    expect(assess().incomingAngle).not.toBe(base.incomingAngle);
    f.state.ball.velocity!.x = 12;
    expect(
      assessFirstTouch(f.state, f.actor, f.state.ball, { x: 65, y: 34 }, 'pass').outgoingAngle,
    ).toBeGreaterThan(base.outgoingAngle);
    expect(
      assessFirstTouch(f.state, f.actor, f.state.ball, target, 'pass', 0.8).quality,
    ).toBeGreaterThan(base.quality);
    f.state.ball.spin = { x: 0, y: 0, z: 100 };
    expect(assess().quality).toBeLessThan(base.quality);
    delete f.state.ball.spin;
    const defender = f.state.players.find((p) => p.team === 'away')!;
    defender.position = { x: 50.5, y: 34 };
    expect(assess().quality).toBeLessThan(base.quality);
    const low = fixture(25, 18),
      elite = fixture(96, 18);
    expect(
      assessFirstTouch(elite.state, elite.actor, elite.state.ball, target, 'pass').quality,
    ).toBeGreaterThan(
      assessFirstTouch(low.state, low.actor, low.state.ball, target, 'pass').quality,
    );
    expect(
      interpretPassExecution(low.state, low.actor, target, 'support', 'ground', { firstTime: true })
        .quality,
    ).toBeLessThan(
      interpretPassExecution(elite.state, elite.actor, target, 'support', 'ground', {
        firstTime: true,
      }).quality,
    );
  });
  it('rejects forecast-only remote contact and a recent un-recovered foot, then re-arms by physical readiness', () => {
    const f = fixture();
    f.state.ball.x = 45;
    expect(canExecuteFirstTimePass(f.state, pass(f))).toBe(true);
    expect(canExecuteFirstTimePass(f.state, pass(f), true)).toBe(false);
    expect(resolveMatchAction(f.state, pass(f))).toBe(f.state);
    f.state.ball.x = 49.8;
    f.state.lastGroundContact = {
      actorId: f.actor.id,
      at: f.state.time,
      region: 'right_foot',
      point: f.state.ball,
      incomingVelocity: { x: 12, y: 0 },
      outgoingVelocity: { x: 4, y: 0 },
      executed: true,
      retained: true,
      physicalCount: 1,
    };
    expect(canExecuteFirstTimePass(f.state, pass(f), true)).toBe(false);
    f.state.time += 0.3;
    expect(canExecuteFirstTimePass(f.state, pass(f), true)).toBe(true);
    f.state.ball.ownerId = f.actor.id;
    expect(resolveMatchAction(f.state, pass(f))).toBe(f.state);
  });
  it('allows a real rapid A–B–C combination, preserving the incoming contact position and impulse', () => {
    const f = fixture(98, 7);
    const atContact = { ...f.state.ball };
    const release = resolveMatchAction(f.state, pass(f), 'dev_ai_selected');
    expect(release.ball.x).toBe(atContact.x);
    expect(release.ball.height).toBe(atContact.height);
    expect(release.lastPassDiagnostic?.executionType).toBe('first_time');
    expect(release.lastGroundContact?.executed).toBe(true);
    let next = release;
    for (let i = 0; i < 120 && !next.lastResolvedPass?.finalResult; i++)
      next = stepTacticalMatchAfterDecisionProbe(next, 0.025);
    expect(next.lastResolvedPass?.passId).toBe(release.lastPassDiagnostic?.passId);
    expect(next.time - f.state.time).toBeLessThan(3);
    expect(next.lastResolvedPass?.finalResult).toBe('completed');
  });
  it('offers short control and directional continuation in the same value units as immediate passing', () => {
    const f = fixture();
    f.state.decisionPolicy = 'role-value-v1';
    const value = evaluateStateValueAction(f.state, f.actor, {
      type: 'hold',
      actorId: f.actor.id,
    })!;
    expect(value.branches[0]!.elapsed).toBeLessThan(1);
    expect(value.reasons.some((r) => r.startsWith('incoming-control:'))).toBe(true);
    const choices = new Set<string>();
    for (const x of [30, 50, 65, 80]) {
      f.receiver.position = { x, y: 34 };
      const choice = chooseIncomingShotAction(f.state, f.actor.id);
      choices.add(choice?.type ?? 'none');
    }
    expect([...choices].some((c) => c === 'hold' || c === 'carry')).toBe(true);
  });
  it('produces recoverable heavy touches and failed controls, with stronger equivalent technique improving the outcome', () => {
    const low = fixture(15, 24),
      elite = fixture(98, 24);
    const weak = resolveReceptionOutcome(low.state, low.actor, low.state.ball),
      strong = resolveReceptionOutcome(elite.state, elite.actor, elite.state.ball);
    expect(['heavy_touch', 'failed_control']).toContain(weak.kind);
    expect(strong.quality!.score).toBeGreaterThan(weak.quality!.score);
    const { state, actor, passer } = low;
    state.lastPassDiagnostic = {
      passId: 'technical-reception',
      passerId: passer.id,
      intendedReceiverId: actor.id,
      releasedAt: 9,
      receiverPositionAtRelease: actor.position,
      receiverVelocityAtRelease: actor.velocity,
      predictedReceptionPoint: actor.position,
      awarenessDelay: 0.1,
      receiverArrivalEstimate: 1,
      bestDefenderArrivalEstimate: 5,
      leadDistance: 0,
    };
    delete state.receptionPreparation;
    const next = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.ball.velocity).toBeDefined();
    expect(Math.hypot(next.ball.x - state.ball.x, next.ball.y - state.ball.y)).toBeLessThanOrEqual(
      24 * 0.025 + 0.05,
    );
  });
  it.each([
    'legacy-pr176',
    'state-value-v1',
    'role-value-v1',
    'role-intent-v1',
    'phase-role-hybrid-v1',
  ] as const)('keeps physical execution identical for explicit %s contacts', (policy) => {
    const f = fixture(90, 7);
    f.state.decisionPolicy = policy;
    const a = resolveMatchAction(f.state, pass(f), 'human_selected');
    const comparison = { ...f.state, decisionPolicy: 'legacy-pr176' as const };
    expect(a.ball).toEqual(resolveMatchAction(comparison, pass(f), 'human_selected').ball);
    expect(tacticalMatchStateSchema.safeParse(a).success).toBe(true);
  });
  it('registers a resolved first-time attempt by ID before its result when latestAction already advanced', () => {
    const f = fixture(),
      released = resolveMatchAction(f.state, pass(f));
    const diagnostic = {
      ...released.lastPassDiagnostic!,
      actualReceiverId: f.receiver.id,
      actualContactPoint: f.receiver.position,
      resolvedAt: 11,
      finalResult: 'completed' as const,
    };
    const next: TacticalMatchState = {
      ...released,
      time: 11,
      lastResolvedPass: diagnostic,
      latestAction: { type: 'hold', actorId: f.receiver.id },
      decisionIndex: released.decisionIndex + 1,
    };
    delete next.lastPassDiagnostic;
    delete next.statistics;
    const flow = observeMatchFlow(createMatchFlowTelemetry(), f.state, next);
    expect(flow.firstTimePassAttempts).toBe(1);
    expect(flow.firstTimePassCompleted).toBe(1);
    expect(() => assertTelemetryInvariants(flow)).not.toThrow();
    const again = observeMatchFlow(flow, next, structuredClone(next));
    expect(again.firstTimePassAttempts).toBe(1);
    expect(again.firstTimePassCompleted).toBe(1);
  });
});
