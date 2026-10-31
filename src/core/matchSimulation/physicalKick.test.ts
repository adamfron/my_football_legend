import { describe, expect, it, vi } from 'vitest';
import { RandomGenerator } from '../random/RandomGenerator';
import { createKickFixture } from './physicalKickLaboratory';
import { executePhysicalKick } from './kickExecution';
import { executeFootContact, FOOT_CONTACT_PHYSICS, activeStrikeCapability } from './footContact';
import { resolveMatchAction } from './matchActions';
import { tacticalMatchStateSchema } from './matchState';
import { withIntegrationProfile } from './integrationProfile';
import { integrateBallFlight } from './ballPhysics';

const clean = { lateralPatchMetres: 0, verticalPatchMetres: 0, timingSeconds: 0, effortError: 0 };
const request = {
  family: 'pass' as const,
  target: { x: 40, y: 34 },
  nominalVelocity: { x: 10, y: 0, z: 0 },
  surface: 'inside' as const,
};
const close = (actual: { x: number; y: number; z: number }, wanted: typeof actual) => {
  for (const axis of ['x', 'y', 'z'] as const) expect(actual[axis]).toBeCloseTo(wanted[axis], 9);
};

describe('contact-v1 finite kick execution', () => {
  it('demonstrates the legacy speed/lift limitation, then resolves a nominal powerful 3D strike', () => {
    const f = createKickFixture({ seed: 'nominal', family: 'shot' });
    const desired = { x: 30, y: 0, z: 6 };
    const old = executeFootContact(f.state, f.actor, {
      intended: 'instep',
      desiredVelocity: desired,
      balance: 1,
      preparationSeconds: 0.3,
      pressure: 0,
      contactSeconds: 0.025,
    });
    expect(old.normal.z).toBe(0);
    expect(old.outgoingVelocity.x).toBeLessThan(13);
    const result = executePhysicalKick(
      f.state,
      f.actor,
      {
        ...request,
        family: 'shot',
        surface: 'instep',
        nominalVelocity: desired,
        preparationSeconds: 0.3,
      },
      clean,
    );
    close(result.contact.outgoingVelocity, desired);
    close(result.contact.outgoingSpin, { x: 0, y: 0, z: 0 });
    expect(result.contact.surfacePoint.z).toBeGreaterThanOrEqual(0);
  });
  it('produces mirrored direction and spin from mirrored spherical contact offsets', () => {
    const f = createKickFixture({ seed: 'mirror' });
    const left = executePhysicalKick(f.state, f.actor, request, {
      ...clean,
      lateralPatchMetres: 0.004,
    });
    const right = executePhysicalKick(f.state, f.actor, request, {
      ...clean,
      lateralPatchMetres: -0.004,
    });
    expect(left.contact.outgoingVelocity.x).toBeCloseTo(right.contact.outgoingVelocity.x, 10);
    expect(left.contact.outgoingVelocity.y).toBeCloseTo(-right.contact.outgoingVelocity.y, 10);
    expect(left.contact.outgoingSpin.z).toBeCloseTo(-right.contact.outgoingSpin.z, 10);
    expect(Math.abs(left.contact.outgoingSpin.z)).toBeGreaterThan(0.1);
  });
  it('allows a power error without direction error and incidental lift from lower contact', () => {
    const f = createKickFixture({ seed: 'lift' });
    const power = executePhysicalKick(f.state, f.actor, request, { ...clean, effortError: -0.2 });
    close(power.contact.outgoingVelocity, { x: 8, y: 0, z: 0 });
    const lift = executePhysicalKick(f.state, f.actor, request, {
      ...clean,
      verticalPatchMetres: -0.004,
    });
    expect(lift.contact.outgoingVelocity.z).toBeGreaterThan(0);
    expect(lift.contact.normal.z).toBeGreaterThan(0);
  });
  it('conserves linear/angular impulse and respects finite Coulomb/spin bounds', () => {
    const f = createKickFixture({ seed: 'impulse' });
    f.state.ball.spin = { x: 0, y: 150, z: 150 };
    const c = executePhysicalKick(
      f.state,
      f.actor,
      { ...request, nominalVelocity: { x: 1000, y: 0, z: 20 } },
      { ...clean, lateralPatchMetres: 0.03, verticalPatchMetres: -0.02 },
    ).contact;
    const normalJ = c.impulse.x * c.normal.x + c.impulse.y * c.normal.y + c.impulse.z * c.normal.z;
    const tangent = {
      x: c.impulse.x - c.normal.x * normalJ,
      y: c.impulse.y - c.normal.y * normalJ,
      z: c.impulse.z - c.normal.z * normalJ,
    };
    expect(normalJ).toBeLessThanOrEqual(c.normalImpulseLimit + 1e-8);
    expect(Math.hypot(tangent.x, tangent.y, tangent.z)).toBeLessThanOrEqual(
      c.tangentImpulseLimit + 1e-8,
    );
    const r = {
      x: c.surfacePoint.x - c.point.x,
      y: c.surfacePoint.y - c.point.y,
      z: c.surfacePoint.z - c.point.z,
    };
    const torque = {
      x: r.y * c.impulse.z - r.z * c.impulse.y,
      y: r.z * c.impulse.x - r.x * c.impulse.z,
      z: r.x * c.impulse.y - r.y * c.impulse.x,
    };
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(c.outgoingVelocity[axis] - c.incomingVelocity[axis]).toBeCloseTo(
        c.impulse[axis] / FOOT_CONTACT_PHYSICS.mass,
        10,
      );
      expect(c.outgoingSpin[axis] - c.incomingSpin[axis]).toBeCloseTo(
        torque[axis] / FOOT_CONTACT_PHYSICS.inertia,
        8,
      );
      expect(Math.abs(c.outgoingSpin[axis])).toBeLessThanOrEqual(160);
    }
    expect(
      Math.hypot(c.outgoingVelocity.x, c.outgoingVelocity.y, c.outgoingVelocity.z),
    ).toBeLessThan(45);
  });
  it('retains reach and preparation rejection instead of releasing an impossible ball', () => {
    const f = createKickFixture({ seed: 'reject' });
    f.state.ball.x += 3;
    expect(executePhysicalKick(f.state, f.actor, request, clean).contact.unavailableReason).toBe(
      'out_of_reach',
    );
    const rejected = resolveMatchAction(f.state, f.action, 'human_selected');
    expect(rejected.ball.ownerId).toBe(f.actor.id);
    expect(rejected.decisionIndex).toBe(f.state.decisionIndex);
    expect(rejected.lastKickExecution?.contact.available).toBe(false);
  });
  it('does not depend on event labels or game reading; equivalent geometry has equivalent impulse', () => {
    const f = createKickFixture({ seed: 'label' });
    const base = executePhysicalKick(f.state, f.actor, request);
    f.state.ball.sourceAction = 'space_pass';
    f.actor.profile.attributes.gameReading = 1;
    expect(executePhysicalKick(f.state, f.actor, request).contact).toEqual(base.contact);
    const pass = executePhysicalKick(f.state, f.actor, request, clean);
    const shot = executePhysicalKick(f.state, f.actor, { ...request, family: 'shot' }, clean);
    expect(shot.contact).toEqual(pass.contact);
  });
  it('mediates actual closing pressure through preparation and finite capability', () => {
    const open = createKickFixture({ seed: 'pressure', metres: 20 });
    const pressured = createKickFixture({ seed: 'pressure', metres: 20, context: 'immediate' });
    const a = executePhysicalKick(open.state, open.actor, request, clean);
    const b = executePhysicalKick(pressured.state, pressured.actor, request, clean);
    expect(b.context.preparationSeconds).toBeLessThan(a.context.preparationSeconds);
    expect(
      activeStrikeCapability(pressured.actor, b.contact.foot, 1, b.context.preparationSeconds)
        .maximumFootSpeed,
    ).toBeLessThan(
      activeStrikeCapability(open.actor, a.contact.foot, 1, a.context.preparationSeconds)
        .maximumFootSpeed,
    );
  });
  it('uses actual contact velocity and spin at both canonical release consumers', () => {
    for (const family of ['pass', 'shot'] as const) {
      const f = createKickFixture({ seed: 'live-' + family, family, metres: 20 });
      const result = resolveMatchAction(f.state, f.action, 'human_selected');
      expect(result.decisionIndex).toBe(f.state.decisionIndex + 1);
      expect(result.lastKickExecution?.family).toBe(family);
      expect(result.ball.velocity).toEqual(result.lastKickExecution?.contact.outgoingVelocity);
      expect(result.ball.spin).toEqual(result.lastKickExecution?.contact.outgoingSpin);
      expect(result.ball.ownerId).toBeUndefined();
    }
  });
  it('leaves lofted passes and first-time shots on their historical release path', () => {
    for (const config of [
      { family: 'pass' as const, delivery: 'lofted' as const },
      { family: 'shot' as const, context: 'first_time' as const },
    ]) {
      const f = createKickFixture({ seed: 'excluded', ...config });
      const baseline = structuredClone(f.state);
      delete baseline.experimentalKickExecution;
      const a = resolveMatchAction(f.state, f.action, 'human_selected');
      const b = resolveMatchAction(baseline, f.action, 'human_selected');
      expect(a.ball).toEqual(b.ball);
      expect(a.lastKickExecution).toBeUndefined();
    }
  });
  it('validates optional saves, rejects profile mixing and clears selection on profile application', () => {
    const f = createKickFixture({ seed: 'save' });
    const result = resolveMatchAction(f.state, f.action, 'human_selected');
    expect(tacticalMatchStateSchema.parse(result).lastKickExecution).toEqual(
      result.lastKickExecution,
    );
    const profile = withIntegrationProfile(result, 'realism-candidate-v1', 'state-value-v1');
    expect(profile.experimentalKickExecution).toBeUndefined();
    expect(profile.lastKickExecution).toBeUndefined();
    expect(
      tacticalMatchStateSchema.safeParse({ ...profile, experimentalKickExecution: 'contact-v1' })
        .success,
    ).toBe(false);
  });
  it('retains baseline chip and unsupported pass techniques without stacking errors', () => {
    for (const family of ['pass', 'shot'] as const) {
      const f = createKickFixture({ seed: 'unsupported', family });
      if (f.action.type === 'shot') f.action.intent = 'chip';
      else f.actor.facingAngle = -Math.PI / 2;
      const baseline = structuredClone(f.state);
      delete baseline.experimentalKickExecution;
      const a = resolveMatchAction(f.state, f.action, 'human_selected');
      const b = resolveMatchAction(baseline, f.action, 'human_selected');
      expect(a.ball).toEqual(b.ball);
      expect(a.lastKickExecution).toBeUndefined();
    }
  });
  it('records a zero-impulse contact as an unreleased attempt with finite saved state', () => {
    for (const family of ['pass', 'shot'] as const) {
      const f = createKickFixture({ seed: 'zero-effort', family, primary: 1, technique: 1 });
      const spy = vi.spyOn(RandomGenerator, 'fromSeed').mockImplementation(() => {
        const draws = [1, 0, 1, 0, 1e-12, 0.5];
        return { float: () => draws.shift() ?? 0.5 } as unknown as RandomGenerator;
      });
      try {
        const after = resolveMatchAction(f.state, f.action, 'human_selected');
        expect(after.lastKickExecution?.contact.available).toBe(true);
        expect(after.lastKickExecution?.contact.impulse).toEqual({ x: 0, y: 0, z: 0 });
        expect(after.ball).toEqual(f.state.ball);
        expect(after.decisionIndex).toBe(f.state.decisionIndex);
        expect(tacticalMatchStateSchema.safeParse(after).success).toBe(true);
      } finally {
        spy.mockRestore();
      }
    }
  });
  it('pairs latent draws while skill reduces execution variance without eliminating it', () => {
    const errors = (primary: number, technique: number) =>
      Array.from({ length: 80 }, (_, i) => {
        const f = createKickFixture({ seed: `skill-${i}`, primary, technique });
        return executePhysicalKick(f.state, f.actor, request).contact.outgoingVelocity.y;
      });
    const low = errors(25, 25),
      high = errors(90, 90);
    const variance = (xs: number[]) => xs.reduce((s, x) => s + x * x, 0) / xs.length;
    expect(variance(high)).toBeGreaterThan(0);
    expect(variance(high)).toBeLessThan(variance(low));
  });
  it('retains weaker-foot asymmetry and finite low-skill powerful execution', () => {
    const f = createKickFixture({ seed: 'weak', primary: 10, technique: 10, strength: 95 });
    f.actor.profile.weakFootProficiency = 30;
    const dominant = activeStrikeCapability(f.actor, f.actor.profile.dominantFoot, 1, 0.3);
    const other = f.actor.profile.dominantFoot === 'left' ? 'right' : 'left';
    expect(activeStrikeCapability(f.actor, other, 1, 0.3).maximumFootSpeed).toBeLessThan(
      dominant.maximumFootSpeed,
    );
    const contact = executePhysicalKick(
      f.state,
      f.actor,
      { ...request, nominalVelocity: { x: 28, y: 0, z: 0 }, preparationSeconds: 0.3 },
      clean,
    ).contact;
    expect(contact.available).toBe(true);
    expect(contact.outgoingVelocity.x).toBeGreaterThan(25);
  });
  it('carries spin into the shared Magnus integrator', () => {
    const f = createKickFixture({ seed: 'magnus' });
    const c = executePhysicalKick(
      f.state,
      f.actor,
      { ...request, nominalVelocity: { x: 25, y: 0, z: 7 } },
      { ...clean, lateralPatchMetres: 0.008 },
    ).contact;
    const ball = {
      position: { x: 30, y: 34, z: 1 },
      velocity: c.outgoingVelocity,
      spin: c.outgoingSpin,
      airborne: true,
      bounceCount: 0,
    };
    const spinning = integrateBallFlight(ball, 0.025);
    const neutral = integrateBallFlight({ ...ball, spin: { x: 0, y: 0, z: 0 } }, 0.025);
    expect(spinning.velocity.y).not.toBe(neutral.velocity.y);
  });
});
