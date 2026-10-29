import { describe, expect, it } from 'vitest';
import { createProspectiveFixture } from './prospectivePlayLaboratory';
import { advanceActivePerception } from './activePerception';
import { advanceLiveBallFlight, boundedMovementTarget } from './liveBallFlight';
import {
  evaluateProspectivePosition,
  advanceReceivingPositions,
  receivingPositionTarget,
} from './receivingPositions';
import { observeBoundedScene } from './boundedPerception';
import { updateSituation } from './situationalAwareness';
import { fitContactRegion, contactEllipse, residualInsideRegion } from './contactUncertainty';
import { deriveMovementCapability } from './locomotion';
import { resolveIntegrationProfile, withIntegrationProfile } from './integrationProfile';
import { tacticalMatchStateSchema } from './matchState';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';

const observe = (s: ReturnType<typeof createProspectiveFixture>['state']) =>
  advanceReceivingPositions(advanceActivePerception(advanceLiveBallFlight(s)));
describe('PR203 existing-memory prospective support', () => {
  it('retains a last seen sector with original evidence time and growing uncertainty', () => {
    const f = createProspectiveFixture({ seed: 'awareness' });
    const s = observe(f.state),
      direct = s.activePerceptionRuntime!.memory[f.c.id]!.situation!;
    expect(direct.ball?.source).toBe('direct');
    expect(direct.possessor?.source).toBe('inferred');
    const scene = { ...observeBoundedScene(s, f.c), at: s.time + 0.8, ball: null, visible: [] };
    const remembered = updateSituation(scene, direct);
    expect(remembered.ball?.source).toBe('remembered');
    expect(remembered.ball?.evidenceAt).toBe(direct.ball?.evidenceAt);
    expect(remembered.ball!.uncertainty).toBeGreaterThan(direct.ball!.uncertainty);
    expect(updateSituation({ ...scene, at: s.time + 3.1 }, remembered).ball).toBeNull();
  });
  it('does not turn remembered ball prediction into direct evidence', () => {
    const f = createProspectiveFixture({ seed: 'timestamp' }),
      s = observe(f.state);
    const old = s.activePerceptionRuntime!.memory[f.c.id]!.situation!;
    const remembered = updateSituation({ ...observeBoundedScene(s, f.c), at: s.time + 0.1 }, old);
    expect(remembered.ball?.source).toBe('remembered');
    expect(remembered.ball?.evidenceAt).toBe(s.time);
  });
  it('keeps detailed 36m acquisition separate from remembered sector knowledge', () => {
    const f = createProspectiveFixture({ seed: 'range' });
    f.c.position = { x: 75.65, y: 34 };
    f.c.facingAngle = -Math.PI / 2;
    const near = observe(f.state);
    expect(near.activePerceptionRuntime!.memory[f.c.id]!.situation!.ball?.source).toBe('direct');
    f.c.position = { x: 77.65, y: 34 };
    const far = advanceLiveBallFlight({ ...f.state, time: f.state.time + 0.2 });
    expect(far.liveBallFlightRuntime!.sensors[f.c.id]!.optical).toBeNull();
    const memory = updateSituation(
      { ...observeBoundedScene(near, f.c), at: f.state.time + 0.2, ball: null },
      near.activePerceptionRuntime!.memory[f.c.id]!.situation,
    );
    expect(memory.ball?.source).toBe('remembered');
    expect(memory.ball?.sector).toEqual(
      near.activePerceptionRuntime!.memory[f.c.id]!.situation!.ball!.sector,
    );
  });
  it('recognises a conditional B option without choosing or releasing either pass', () => {
    const f = createProspectiveFixture({ seed: 'two-pass' }),
      s = observe(f.state);
    const job = s.activePerceptionRuntime!.positions[f.c.id]!;
    expect(job.prospective?.intermediaryId).toBe(f.b.id);
    expect(job.prospective!.hypotheses.length).toBeLessThanOrEqual(2);
    expect(job.expiresAt - job.prospective!.createdAt).toBeLessThanOrEqual(2);
    expect(s.lastPassDiagnostic).toEqual(f.state.lastPassDiagnostic);
    expect(s.ball.ownerId).toBe(f.a.id);
  });
  it('reading advances recognition without improving running capability', () => {
    const low = createProspectiveFixture({ seed: 'paired', reading: 20 }),
      high = createProspectiveFixture({ seed: 'paired', reading: 85 });
    const l = observe(low.state).activePerceptionRuntime!.positions[low.c.id]!,
      h = observe(high.state).activePerceptionRuntime!.positions[high.c.id]!;
    expect(h.prospective!.recognisedAt).toBeLessThan(l.prospective!.recognisedAt);
    expect(deriveMovementCapability(high.c)).toEqual(deriveMovementCapability(low.c));
    expect(high.c.profile.attributes.firstTouch).toBe(low.c.profile.attributes.firstTouch);
  });
  it('moves through canonical 40Hz locomotion before any pass is released', () => {
    const f = createProspectiveFixture({ seed: 'movement' });
    let s = observe(f.state);
    for (let i = 0; i < 32; i++) s = step(s, 0.025);
    const p = s.players.find((p) => p.id === f.c.id)!;
    expect(p.position.y).toBeLessThan(f.c.position.y - 0.3);
    expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeGreaterThan(0);
    expect(s.lastPassDiagnostic).toEqual(f.state.lastPassDiagnostic);
    expect(s.ball.ownerId).toBe(f.a.id);
  });
  it('withdraws on a new legally observed opponent possession cue', () => {
    const f = createProspectiveFixture({ seed: 'withdraw' }),
      s = observe(f.state);
    const old = s.activePerceptionRuntime!.positions[f.c.id]!;
    const memory = s.activePerceptionRuntime!.memory[f.c.id]!;
    const scene = observeBoundedScene(s, f.c);
    memory.situation = updateSituation(
      {
        ...scene,
        at: s.time + 0.3,
        ball: {
          position: f.opponent.position,
          height: 0.11,
          velocity: { x: 0, y: 0, z: 0 },
          ownerId: null,
          observedAt: s.time + 0.3,
        },
        visible: [
          {
            ...scene.visible[0]!,
            id: f.opponent.id,
            team: f.opponent.team,
            position: f.opponent.position,
          },
        ],
      },
      memory.situation,
    );
    s.time += 0.3;
    const job = evaluateProspectivePosition(s, f.c, old)!;
    expect(job.prospective?.status).toBe('withdrawn');
    expect(job.expiresAt).toBe(s.time);
  });
  it('does not read hidden velocity, spin, release target, ownership or unseen positions', () => {
    const f = createProspectiveFixture({ seed: 'boundary' }),
      s = observe(f.state),
      other = structuredClone(s);
    other.ball.velocity = { x: 123, y: -77, z: 40 };
    other.ball.spin = { x: 30, y: 20, z: 10 };
    other.ball.target = { x: 90, y: 2 };
    other.ball.ownerId = f.opponent.id;
    other.players.find((p) => p.id === f.opponent.id)!.position = { x: 100, y: 67 };
    expect(evaluateProspectivePosition(other, other.players.find((p) => p.id === f.c.id)!)).toEqual(
      evaluateProspectivePosition(s, f.c),
    );
  });
  it('protects centre-back cover and retains winger width', () => {
    for (const role of ['center_back', 'left_winger'] as const) {
      const f = createProspectiveFixture({ seed: `role-${role}`, role }),
        s = observe(f.state),
        job = s.activePerceptionRuntime!.positions[f.c.id];
      if (role === 'center_back') expect(job).toBeUndefined();
      else if (job)
        expect(Math.abs(job.target.y - 34)).toBeGreaterThanOrEqual(Math.abs(f.c.position.y - 34));
    }
  });
  it('keeps an active prospective motor command equal before hidden motion becomes observable', () => {
    const f = createProspectiveFixture({ seed: 'motor-boundary' });
    let s = observe(f.state);
    for (let i = 0; i < 12; i++) s = step(s, 0.025);
    const other = structuredClone(s);
    other.ball.velocity = { x: 90, y: -60, z: 30 };
    other.ball.spin = { x: 40, y: 50, z: 60 };
    other.ball.target = { x: 100, y: 2 };
    const left = step(s, 0.025).players.find((p) => p.id === f.c.id)!;
    const right = step(other, 0.025).players.find((p) => p.id === f.c.id)!;
    expect({ target: left.target, velocity: left.velocity, facing: left.facingAngle }).toEqual({
      target: right.target,
      velocity: right.velocity,
      facing: right.facingAngle,
    });
  });
  it('does not override human movement or restore the remote receiver fallback', () => {
    const f = createProspectiveFixture({ seed: 'authority' }),
      s = observe(f.state);
    s.controlledFootballerId = f.c.id;
    const next = advanceReceivingPositions({ ...s, time: s.time + 0.4 });
    expect(next.activePerceptionRuntime!.positions[f.c.id]).toBeUndefined();
    s.receptionPreparation = { ...s.receptionPreparation!, actorId: f.c.id };
    delete s.ball.ownerId;
    expect(boundedMovementTarget(s, f.c, undefined, undefined)).toEqual(f.c.position);
  });
  it('persists new profiles, rejects mismatches and clears new state on rollback', () => {
    const f = createProspectiveFixture({ seed: 'save' }),
      s = observe(f.state);
    expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
    expect(
      tacticalMatchStateSchema.safeParse({ ...s, prospectiveMovement: undefined }).success,
    ).toBe(false);
    const rolled = withIntegrationProfile(s, 'realism-candidate-v1');
    expect(rolled.situationalAwareness).toBeUndefined();
    expect(rolled.activePerceptionRuntime).toBeUndefined();
    expect(resolveIntegrationProfile('prospective-play-v1').fingerprint).not.toBe(
      resolveIntegrationProfile('situational-awareness-v1').fingerprint,
    );
  });
  it('expires the motor target even without a fresh visual update', () => {
    const f = createProspectiveFixture({ seed: 'expiry' }),
      s = observe(f.state),
      job = s.activePerceptionRuntime!.positions[f.c.id]!;
    expect(receivingPositionTarget({ ...s, time: job.expiresAt + 0.01 }, f.c)).toBeUndefined();
  });
});

describe('PR203 empirical diagnostic covariance', () => {
  const residuals = [
    [-2, -1],
    [-1, 1],
    [1, -1],
    [2, 1],
  ].map(([along, across]) => ({
    stratum: 'ground-early-foot',
    along: along!,
    across: across!,
    seconds: along! / 10,
  }));
  it('uses unbiased covariance, rotates it and keeps timing separate', () => {
    const fit = fitContactRegion(residuals)!;
    expect(fit.covariance.xx).toBeCloseTo(10 / 3);
    expect(fit.covariance.yy).toBeCloseTo(4 / 3);
    const ellipse = contactEllipse(fit, { x: 20, y: 30 }, Math.PI / 2, 2);
    expect(ellipse.covariance.yy).toBeCloseTo(fit.covariance.xx);
    expect(ellipse.major).toBeGreaterThan(ellipse.minor);
    expect(fit.timing.varianceSeconds2).toBeCloseTo(0.1 / 3);
    expect(
      residualInsideRegion(fit, { stratum: fit.stratum, along: 0, across: 0, seconds: 100 }),
    ).toBe(true);
  });
  it('rejects singular, insufficient and mixed trajectory data', () => {
    expect(fitContactRegion(residuals.slice(0, 2))).toBeUndefined();
    expect(fitContactRegion(residuals.map((r) => ({ ...r, across: 0 })))).toBeUndefined();
    expect(
      fitContactRegion(residuals.map((r, i) => ({ ...r, stratum: i ? r.stratum : 'bounce' }))),
    ).toBeUndefined();
  });
});
