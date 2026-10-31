import { describe, expect, it } from 'vitest';
import { createKickFixture } from './physicalKickLaboratory';
import { integrateBallFlight } from './ballPhysics';
import {
  executeTemporalStrike,
  prepareTemporalStrike,
  temporalFootAt,
  temporalFootPath,
  temporalStrikeReceiptSchema,
  TEMPORAL_STRIKE,
  ZERO_TEMPORAL_ERROR,
} from './temporalFootStrike';

const environment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' } as const;
const fixture = (speed = 0, direction = 'crossing', mirror = false) => {
  const f = createKickFixture({ seed: 'pr209-contact-contract' });
  const sign = mirror ? -1 : 1;
  f.actor.position.y = 34 + sign * 0.17;
  f.actor.profile.dominantFoot = mirror ? 'left' : 'right';
  f.state.ballEnvironment = environment;
  f.state.ball.velocity = {
    x: direction === 'departing' ? speed : direction === 'approaching' ? -speed : 0,
    y: direction === 'crossing' ? sign * speed : 0,
    z: 0,
  };
  const physical = {
    position: { x: f.state.ball.x, y: f.state.ball.y, z: 0.11 },
    velocity: { ...f.state.ball.velocity, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    airborne: false,
    bounceCount: 0,
  };
  const request = {
    family: 'pass' as const,
    surface: 'inside' as const,
    foot: f.actor.profile.dominantFoot,
    nominalVelocity: { x: 12, y: 0, z: 0 as const },
    target: { x: 50, y: 34 },
    plannedBallPoint: integrateBallFlight(physical, 0.075, environment).position,
  };
  const plan = prepareTemporalStrike(f.state, f.actor, request);
  return { ...f, plan, request, physical };
};
const run = (f: ReturnType<typeof fixture>, timingSeconds = 0) =>
  executeTemporalStrike(f.state, f.actor, f.plan, { ...ZERO_TEMPORAL_ERROR, timingSeconds });

describe('bounded temporal low inside-foot strike foundation', () => {
  it('keeps a stable zero-error stationary reference without mutating match state or RNG', () => {
    const f = fixture(),
      before = globalThis.structuredClone(f.state);
    const a = run(f),
      b = run(f);
    expect(a).toEqual(b);
    expect(f.state).toEqual(before);
    expect(a.outcome).toBe('contact');
    expect(a.contactAt).toBeCloseTo(10.075, 7);
    expect(a.contact!.outgoingVelocity.x).toBeCloseTo(12, 5);
    expect(Math.hypot(...Object.values(a.contact!.outgoingSpin))).toBeLessThan(0.0001);
    temporalStrikeReceiptSchema.parse(a);
  });
  it('moves the onset in time while preserving the entire relative swing', () => {
    const f = fixture();
    const nominal = run(f);
    for (const timing of [-0.02, -0.01, -0.005, 0.005, 0.01, 0.02]) {
      const r = run(f, timing);
      expect(r.path.controls).toEqual(nominal.path.controls);
      expect(r.path.finalVelocity).toEqual(nominal.path.finalVelocity);
      expect(r.path.capabilityScale).toBe(nominal.path.capabilityScale);
      expect(r.contactAt! - nominal.contactAt!).toBeCloseTo(timing, 7);
      expect(r.contact!.outgoingVelocity.x).toBeCloseTo(nominal.contact!.outgoingVelocity.x, 5);
    }
  });
  it('starts from the actual chosen foot and bounds the whole reachable path and speed', () => {
    const f = fixture(5);
    for (const timing of [-0.02, 0, 0.02]) {
      const path = temporalFootPath(f.plan, { ...ZERO_TEMPORAL_ERROR, timingSeconds: timing });
      expect(temporalFootAt(path, 0).position).toEqual(f.plan.origin);
      for (let i = 0; i <= 480; i++) {
        const at = i * 0.00025;
        const q = temporalFootAt(path, at);
        expect(Math.hypot(q.velocity.x, q.velocity.y, q.velocity.z)).toBeLessThanOrEqual(
          f.plan.maximumFootSpeed + 1e-9,
        );
        expect(
          Math.hypot(
            q.position.x - path.origin.x,
            q.position.y - path.origin.y,
            q.position.z - path.origin.z,
          ),
        ).toBeLessThanOrEqual(f.plan.reach + 1e-9);
        expect(q.position.z).toBeGreaterThanOrEqual(TEMPORAL_STRIKE.footRadius);
      }
      expect(temporalFootAt(path, 0.12).velocity).toEqual(f.plan.bodyVelocity);
    }
  });
  it('uses the geometric first meeting and existing normal/tangent impulse and torque', () => {
    const f = fixture(5),
      r = run(f, -0.01),
      c = r.contact!;
    expect(r.outcome).toBe('contact');
    expect(r.separationAtContact!).toBeLessThanOrEqual(TEMPORAL_STRIKE.distanceTolerance * 1.01);
    expect(r.separationAtContact!).toBeGreaterThan(-1e-9);
    expect(c.surfacePoint.x).toBeCloseTo(
      r.footAtContact!.x + TEMPORAL_STRIKE.footRadius * c.normal.x,
      6,
    );
    expect(c.surfacePoint.y).toBeCloseTo(
      r.footAtContact!.y + TEMPORAL_STRIKE.footRadius * c.normal.y,
      6,
    );
    expect(c.outgoingVelocity.x - c.incomingVelocity.x).toBeCloseTo(c.impulse.x / 0.43, 12);
    expect(r.normalImpulse).toBeGreaterThan(0);
    expect(r.kineticBefore).toBeLessThan(r.kineticAfter!);
    expect(Math.abs(c.outgoingSpin.z)).toBeGreaterThan(1);
  });
  it('causally changes real contact normal, spin and velocity with moving-ball timing', () => {
    const f = fixture(5);
    const early = run(f, -0.01),
      nominal = run(f),
      late = run(f, 0.01);
    expect(early.contactAt!).toBeLessThan(nominal.plannedContactAt);
    expect(late.contactAt!).toBeGreaterThan(nominal.plannedContactAt);
    expect(early.contact!.normal.y).not.toBeCloseTo(late.contact!.normal.y, 2);
    expect(early.contact!.outgoingVelocity.y).toBeLessThan(-1);
    expect(late.contact!.outgoingVelocity.y).toBeGreaterThan(1);
    expect(early.contact!.outgoingSpin.z).toBeLessThan(0);
    expect(late.contact!.outgoingSpin.z).toBeGreaterThan(0);
  });
  it('allows an actual premature impact with a moving ball before nominal swing completion', () => {
    const r = run(fixture(8, 'approaching'), 0.02);
    expect(r.outcome).toBe('contact');
    expect(r.contactAt!).toBeLessThan(r.plannedContactAt);
    expect(r.contact!.incomingVelocity.x).toBeLessThan(-7);
  });
  it('leaves a complete miss on canonical motion with no release, goal or ownership event', () => {
    const f = fixture(8),
      before = globalThis.structuredClone(f.state),
      r = run(f);
    let expected = f.physical;
    for (const dt of [0.025, 0.025, 0.025, 0.025, 0.02])
      expected = integrateBallFlight(expected, dt, environment) as typeof expected;
    expect(r.outcome).toBe('miss');
    expect(r.contact).toBeNull();
    expect(r.normalImpulse).toBeNull();
    expect(r.finalBall.position.x).toBeCloseTo(expected.position.x, 12);
    expect(r.finalBall.position.y).toBeCloseTo(expected.position.y, 12);
    expect(r.finalBall.velocity.y).toBeCloseTo(expected.velocity.y, 12);
    expect(f.state).toEqual(before);
    expect(Number.isFinite(f.state.actionCooldown)).toBe(true);
  });
  it('does not create a semantic pass-versus-shot impulse difference', () => {
    const f = fixture(3);
    const shot = prepareTemporalStrike(f.state, f.actor, { ...f.request, family: 'shot' });
    expect(executeTemporalStrike(f.state, f.actor, shot)).toEqual(run(f));
    f.state.ball.travelKind = 'cross';
    expect(run(f)).toEqual(
      executeTemporalStrike(
        { ...f.state, ball: { ...f.state.ball, travelKind: 'pass' } },
        f.actor,
        f.plan,
      ),
    );
  });
  it('mirrors actual foot, timing, velocity and axial spin', () => {
    const left = run(fixture(5, 'crossing', true), 0.01),
      right = run(fixture(5), 0.01);
    expect(left.outcome).toBe(right.outcome);
    expect(left.contactAt).toBeCloseTo(right.contactAt!, 10);
    expect(left.contact!.outgoingVelocity.x).toBeCloseTo(right.contact!.outgoingVelocity.x, 9);
    expect(left.contact!.outgoingVelocity.y).toBeCloseTo(-right.contact!.outgoingVelocity.y, 9);
    expect(left.contact!.outgoingSpin.z).toBeCloseTo(-right.contact!.outgoingSpin.z, 8);
  });
  it('approaches stationary contact continuously as the actual incoming speed approaches zero', () => {
    const reference = run(fixture());
    for (const direction of ['approaching', 'departing', 'crossing']) {
      const r = run(fixture(1e-6, direction));
      expect(r.outcome).toBe('contact');
      expect(r.contactAt).toBeCloseTo(reference.contactAt!, 7);
      expect(r.contact!.outgoingVelocity.x).toBeCloseTo(reference.contact!.outgoingVelocity.x, 5);
      expect(r.contact!.outgoingVelocity.y).toBeCloseTo(reference.contact!.outgoingVelocity.y, 5);
    }
  });
  it('does not use gameReading as an isolated accuracy or contact bonus', () => {
    const f = fixture(3),
      before = run(f);
    f.actor.profile.attributes.gameReading = 1;
    expect(run(f)).toEqual(before);
    f.actor.profile.attributes.gameReading = 100;
    expect(run(f)).toEqual(before);
  });
  it('retains real subcentimetre flight, spin and ground events during the contact interval', () => {
    const f = fixture(8);
    f.state.ball.velocity!.z = 0.2;
    f.state.ball.airborne = true;
    f.state.ball.spin = { x: 10, y: -20, z: 30 };
    const r = run(f);
    expect(r.frames[1]!.ball.position.z).toBeGreaterThan(0.11);
    expect(r.finalBall.bounceCount).toBeGreaterThan(0);
    expect(r.finalBall.spin.z).not.toBe(0);
    expect(r.evaluations).toBeLessThanOrEqual(800);
  });
  it('rejects teleported feet, enlarged reach, stale body and unsupported timing or surface', () => {
    const f = fixture();
    expect(() =>
      executeTemporalStrike(f.state, f.actor, { ...f.plan, origin: { ...f.plan.origin, x: 30 } }),
    ).toThrow(/initial foot/);
    expect(() => executeTemporalStrike(f.state, f.actor, { ...f.plan, reach: 2 })).toThrow(
      /capability/,
    );
    expect(() => executeTemporalStrike(f.state, f.actor, { ...f.plan, plannedAt: 9 })).toThrow(
      /clock/,
    );
    expect(() => run(f, 0.021)).toThrow(/20 ms/);
    expect(() =>
      prepareTemporalStrike(f.state, f.actor, { ...f.request, surface: 'instep' } as never),
    ).toThrow();
    f.actor.position.x += 0.1;
    expect(() => run(f)).toThrow(/body changed/);
  });
  it('records unsupported high contacts and insufficient preparation without a fabricated impulse', () => {
    const f = fixture();
    f.state.ball.height = 1;
    const high = run(f);
    expect(high.outcome).toBe('unavailable');
    expect(high.reason).toBe('unsupported_height');
    expect(high.contact).toBeNull();
    f.state.ball.height = 0.11;
    const unprepared = executeTemporalStrike(
      f.state,
      f.actor,
      prepareTemporalStrike(f.state, f.actor, { ...f.request, preparationSeconds: 0 }),
    );
    expect(unprepared.outcome).toBe('unavailable');
    expect(unprepared.reason).toBe('preparation');
    expect(unprepared.contact).toBeNull();
  });
  it('clips a demanding path physically instead of increasing speed or reach to hit its target', () => {
    const f = fixture(8);
    expect(run(f).path.capabilityScale).toBeLessThan(1);
    expect(run(f).outcome).toBe('miss');
    const path = temporalFootPath(
      { ...f.plan, plannedBallPoint: { x: 80, y: 60, z: 0.11 } },
      ZERO_TEMPORAL_ERROR,
    );
    expect(path.speedBound).toBeLessThanOrEqual(f.plan.maximumFootSpeed + 1e-9);
    expect(path.reachBound).toBeLessThanOrEqual(f.plan.reach + 1e-9);
  });
});
