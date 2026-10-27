import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createCalibrationFixture } from './assumptionCalibration';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import {
  projectLiveReceptionTarget,
  receptionMovementContactTarget,
  receptionPreparationSchema,
} from './passReception';
import { observeReceptionBall } from './ballOrientedMovement';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { forecastPassInterventions } from './passInterception';
import { derivePassLaunchPlan } from './passLaunchPlan';

const fixture = () =>
  createCalibrationFixture({
    scenario: 'long_pass',
    attacker: 60,
    defender: 60,
    seed: 'pr195-development-0',
  });
describe('PR197 physical passing contracts', () => {
  it('never falls back to the hidden release point when local reception has no meeting target', () => {
    const f = fixture(),
      s = resolveMatchAction(f.state, f.action);
    const r = s.players.find((p) => p.id === f.receiverId)!;
    s.experimentalReceiverAnticipation = true;
    r.ballMotorObservation = {
      at: s.time,
      nextAt: s.time + 0.2,
      ball: {
        position: { x: 75, y: 25, z: 0.11 },
        velocity: { x: 7, y: 0, z: 0 },
        spin: { x: 0, y: 0, z: 0 },
        owner: null,
      },
      others: [],
    };
    expect(s.receptionPreparation).toBeDefined();
    expect(receptionMovementContactTarget(s, r)).toBeUndefined();
    s.receptionPreparation!.expectedContactPoint = { x: 3, y: 4 };
    expect(receptionMovementContactTarget(s, r)).toBeUndefined();
    s.receptionPreparation!.observedContactPoint = { x: 76, y: 25 };
    expect(receptionMovementContactTarget(s, r)).toEqual({ x: 76, y: 25 });
    expect(receptionPreparationSchema.parse(s.receptionPreparation).observedContactPoint).toEqual({
      x: 76,
      y: 25,
    });
    expect(receptionMovementContactTarget({ ...s, time: s.time + 0.6 }, r)).toBeUndefined();
    expect(
      receptionMovementContactTarget({ ...s, experimentalReceiverAnticipation: false }, r),
    ).toEqual(s.receptionPreparation!.runOn?.target ?? { x: 3, y: 4 });
  });
  it('stops height-aware intervention forecasts at the actual pitch exit', () => {
    const fixture = JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr197/failure-height-v1.json.gz')).toString(),
    ) as { state: TacticalMatchState };
    expect(fixture.state.experimentalHeightAwarePassing).toBe(true);
    expect(() => step(fixture.state, 0.025)).not.toThrow();
  });
  it('continues the recorded boundary-sighting failure without rewriting the remembered physical point', () => {
    const fixture = JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr197/failure-v1.json.gz')).toString(),
    ) as { state: TacticalMatchState };
    const state = fixture.state,
      memory = state.activePerceptionRuntime!.memory['geometry:anchor:1']!;
    expect(memory.ball!.position.x).toBeGreaterThan(105);
    expect(() => step(state, 0.025)).not.toThrow();
    expect(memory.ball!.position.x).toBe(105.07139979239057);
  });
  it('preserves a physically reachable defensive header as an actual new launch', () => {
    const f = fixture(),
      s = f.state,
      d = s.players.find((p) => p.id === f.defenderId)!;
    s.experimentalDefensiveReception = true;
    s.ball = {
      x: d.position.x,
      y: d.position.y,
      height: 1.8,
      airborne: true,
      velocity: { x: 5, y: 0, z: -2 },
      travelKind: 'pass',
      lastTouchPlayerId: f.actorId,
    };
    const result = resolveMatchAction(
      s,
      { type: 'header', actorId: d.id, target: { x: 0, y: 34 }, intent: 'header_shot' },
      'dev_ai_selected',
    );
    expect(result.ball.shot?.shooterId).toBe(d.id);
    expect(result.ball.height).toBe(1.8);
    expect(result.ball.ownerId).toBeUndefined();
  });
  it('allows an autonomous defender to win the aerial delivery without awarding foot ownership', () => {
    const f = createCalibrationFixture({
      scenario: 'long_pass',
      attacker: 80,
      defender: 100,
      seed: 'pr197-aerial-positive',
    });
    f.state.decisionPolicy = 'state-value-v1';
    f.state.experimentalDefensiveReception = true;
    const d = f.state.players.find((p) => p.id === f.defenderId)!;
    d.position = { x: 78, y: 26 };
    d.target = { ...d.position };
    let s = resolveMatchAction(f.state, f.action),
      header = false;
    for (let i = 0; i < 120; i++) {
      const before = s;
      s = step(s, 0.025);
      if (s.currentAction?.type === 'header' && s.decisionIndex !== before.decisionIndex) {
        expect(s.ball.ownerId).toBeUndefined();
        expect(s.ball.height).toBeGreaterThan(1.45);
        header = true;
        break;
      }
    }
    expect(header).toBe(true);
  });
  it('prevents an airborne control-first decision from flattening a live pass into opponent ownership', () => {
    const f = fixture(),
      released = resolveMatchAction(f.state, f.action, 'autonomous_npc');
    let old = structuredClone(released);
    let corrected: TacticalMatchState = {
      ...structuredClone(released),
      experimentalDefensiveReception: true,
    };
    let historicalHighControl = false,
      directTouch = false;
    for (let i = 0; i < 100; i++) {
      const before = old;
      old = step(old, 0.025);
      corrected = step(corrected, 0.025);
      if (old.ball.ownerId && !before.ball.ownerId && (before.ball.height ?? 0) > 0.65)
        historicalHighControl = true;
      if (
        corrected.lastGroundContact?.actorId === f.receiverId &&
        corrected.lastGroundContact.executed
      )
        directTouch = true;
    }
    expect(historicalHighControl).toBe(true);
    expect(directTouch).toBe(true);
    expect(corrected.lastReceptionOutcome?.kind).toMatch(/heavy_touch|failed_control/);
    expect(corrected.ball.ownerId).not.toBe(f.receiverId);
    expect(released.ball.launchVelocity).toEqual(
      resolveMatchAction({ ...f.state, experimentalDefensiveReception: true }, f.action).ball
        .launchVelocity,
    );
  });
  it('updates a receiver objective only from their local observation and preserves unseen-world invariance', () => {
    const f = fixture(),
      s = resolveMatchAction(f.state, f.action),
      r = s.players.find((p) => p.id === f.receiverId)!;
    s.time += 1;
    r.ballMotorObservation = {
      at: s.time,
      nextAt: s.time + 0.2,
      others: [],
      ball: {
        position: { x: 75, y: 25, z: 0.11 },
        velocity: { x: 7, y: 0, z: 0 },
        spin: { x: 0, y: 0, z: 0 },
        owner: null,
      },
    };
    const a = { ...s, experimentalReceiverAnticipation: true };
    const b = structuredClone(a);
    b.ball.x = 20;
    b.ball.y = 60;
    b.ball.target = { x: 0, y: 0 };
    b.lastPassDiagnostic!.predictedReceptionPoint = { x: 2, y: 2 };
    expect(projectLiveReceptionTarget(a, r)).toBeDefined();
    expect(projectLiveReceptionTarget(a, r)).toEqual(projectLiveReceptionTarget(b, r));
    const changed = { ...r, ballMotorObservation: structuredClone(r.ballMotorObservation) };
    changed.ballMotorObservation!.ball!.velocity.y = 5;
    expect(projectLiveReceptionTarget(a, changed)).not.toEqual(projectLiveReceptionTarget(a, r));
    expect(
      projectLiveReceptionTarget(a, { ...r, ballMotorObservation: undefined }),
    ).toBeUndefined();
    expect(projectLiveReceptionTarget({ ...a, time: a.time + 0.6 }, r)).toBeUndefined();
  });
  it('does not refresh unseen spin through a reception sighting', () => {
    const f = fixture(),
      r = f.state.players.find((p) => p.id === f.receiverId)!;
    r.facingAngle = -Math.PI / 2;
    f.state.ball.x = 80;
    f.state.ball.y = 25;
    const a = observeReceptionBall(f.state, r),
      b = observeReceptionBall(
        { ...f.state, ball: { ...f.state.ball, spin: { x: 20, y: 30, z: 40 } } },
        r,
      );
    expect(a).toEqual(b);
  });
  it('separates ground projection from reachable height without granting possession', () => {
    const f = fixture(),
      a = f.state.players.find((p) => p.id === f.actorId)!,
      r = f.state.players.find((p) => p.id === f.receiverId)!;
    if (f.action.type !== 'pass') throw Error('Expected pass fixture');
    const d = f.state.players.find((p) => p.id === f.defenderId)!;
    d.position = { x: 60, y: 30 };
    d.velocity = { x: 0, y: 0 };
    const plan = derivePassLaunchPlan(f.state, a, r, f.action.target, 'direct', 'lofted');
    const before = structuredClone(f.state),
      forecast = forecastPassInterventions(f.state, a, plan);
    expect(forecast).toHaveLength(11);
    expect(forecast.every((p) => p.detailedProbes <= 3)).toBe(true);
    expect(
      forecast.some(
        (p) =>
          p.spatialMargin < 0 &&
          (p.reachableMargin === null || p.reachableMargin > p.spatialMargin),
      ),
    ).toBe(true);
    expect(f.state).toEqual(before);
  });
  it('roundtrips each experimental switch independently while old saves keep them absent', () => {
    const s = fixture().state;
    expect(tacticalMatchStateSchema.parse(s).experimentalDefensiveReception).toBeUndefined();
    for (const flag of [
      'experimentalDefensiveReception',
      'experimentalHeightAwarePassing',
      'experimentalReceiverAnticipation',
    ] as const) {
      const parsed = tacticalMatchStateSchema.parse({ ...s, [flag]: true });
      expect(parsed[flag]).toBe(true);
      expect(parsed.experimentalCanonicalArrival).toBeUndefined();
    }
  });
});
