import { describe, expect, it } from 'vitest';
import {
  BALL_PHYSICS,
  ballEnvironmentSchema,
  groundImpactEventSchema,
  integrateBallFlight,
  projectFutureBallTrajectory,
  type PhysicalBall,
  type GroundImpactEvent,
} from './ballPhysics';
import { createKickFixture } from './physicalKickLaboratory';
import { tacticalMatchStateSchema } from './matchState';
import { withIntegrationProfile, integrationStateErrors } from './integrationProfile';

const environment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' } as const;
const ball = (vz = 0, vx = 10, height = 0.11): PhysicalBall => ({
  position: { x: 30, y: 34, z: height },
  velocity: { x: vx, y: 0, z: vz },
  airborne: vz > 0 || height > 0.11,
  bounceCount: 0,
});
const stop = (initial: PhysicalBall, dt = 0.025) => {
  let current = initial;
  for (let i = 0; i < Math.ceil(30 / dt); i++)
    current = integrateBallFlight(current, dt, environment);
  return current;
};
const energy = (v: { x: number; y: number; z: number }, spin = { x: 0, y: 0, z: 0 }) =>
  0.5 * 0.43 * (v.x ** 2 + v.y ** 2 + v.z ** 2) +
  ((0.43 * 0.11 ** 2) / 3) * (spin.x ** 2 + spin.y ** 2 + spin.z ** 2);

describe('versioned event-aware ground contact', () => {
  it('preserves the four original discontinuous historical samples exactly', () => {
    const expected = [
      45.624999999999986, 45.624999999999986, 40.724379888903265, 40.72437352040586,
    ];
    [-0.001, 0, 0.001, 0.2].forEach((vz, index) => {
      let current = ball(vz);
      for (let i = 0; i < 1000; i++) current = integrateBallFlight(current, 0.025);
      expect(current.position.x).toBe(expected[index]);
      expect(integrateBallFlight(ball(vz), 0.1)).toEqual(
        integrateBallFlight(ball(vz), 0.1, {
          rollingResistanceMultiplier: 1,
          groundContact: 'legacy-v1',
        }),
      );
    });
  });
  it('keeps ordinary ground rolling and resistance unchanged', () => {
    expect(stop(ball()).position.x).toBeCloseTo(45.625, 12);
    expect(integrateBallFlight(ball(), 0.4, environment)).toEqual(integrateBallFlight(ball(), 0.4));
    expect(
      integrateBallFlight(ball(), 0.4, { ...environment, rollingResistanceMultiplier: 2 }).position
        .x,
    ).toBeLessThan(integrateBallFlight(ball(), 0.4, environment).position.x);
  });
  it('approaches the rolling limit from both sides across speeds and spins', () => {
    for (const vx of [1, 10, 25])
      for (const spin of [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 40, z: 20 },
        { x: 20, y: -40, z: -20 },
      ]) {
        const rest = stop({ ...ball(0, vx), spin });
        for (const vz of [-1e-6, 1e-6])
          expect(
            Math.abs(stop({ ...ball(vz, vx), spin }).position.x - rest.position.x),
          ).toBeLessThan(0.00005);
      }
  });
  it('resolves a real small upward launch before impact rather than flattening it', () => {
    const events: GroundImpactEvent[] = [];
    integrateBallFlight(ball(0.001), 0.025, environment, (e) => events.push(e));
    expect(events[0]!.at).toBeGreaterThan(0.0002);
    expect(events[0]!.incomingVelocity.z).toBeCloseTo(-0.001, 6);
    expect(events[0]!.outgoingVelocity.z).toBeCloseTo(0.00046, 6);
    expect(Math.abs(stop(ball(0.001)).position.x - 45.625)).toBeLessThan(0.001);
  });
  it('handles impact on either side of a fixed-step boundary continuously', () => {
    const positions = [0.024999, 0.025, 0.025001].map(
      (t) => stop(ball(-1, 10, 0.11 + t + 4.905 * t * t)).position.x,
    );
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(0.0001);
  });
  it('retains meaningful flight, bounces and vertical restitution', () => {
    const events: GroundImpactEvent[] = [];
    const rising = integrateBallFlight(ball(6), 0.3, environment);
    expect(rising.position.z).toBeGreaterThan(1);
    integrateBallFlight(ball(-8, 10, 1), 0.2, environment, (e) => events.push(e));
    expect(events.length).toBeGreaterThan(0);
    const e = events[0]!;
    expect(e.outgoingVelocity.z).toBeCloseTo(
      -e.incomingVelocity.z * BALL_PHYSICS.verticalRestitution,
      12,
    );
    expect(e.at).toBeGreaterThan(0);
    expect(e.at).toBeLessThan(0.2);
  });
  it('uses Coulomb slip and consistent torque without adding impact energy', () => {
    for (const spin of [
      { x: 0, y: 0, z: 0 },
      { x: 20, y: 80, z: 160 },
      { x: -30, y: -80, z: -160 },
    ]) {
      const events: GroundImpactEvent[] = [];
      integrateBallFlight({ ...ball(-12), spin }, 0.001, environment, (e) => events.push(e));
      const e = events[0]!;
      expect(energy(e.outgoingVelocity, e.outgoingSpin)).toBeLessThanOrEqual(
        energy(e.incomingVelocity, e.incomingSpin) + 1e-9,
      );
      expect(e.tangentDelta).toBeLessThanOrEqual(
        BALL_PHYSICS.groundImpactFriction * e.normalDelta + 1e-12,
      );
      expect(e.outgoingSpin.y - e.incomingSpin.y).toBeCloseTo(
        (-1.5 / 0.11) * (e.outgoingVelocity.x - e.incomingVelocity.x),
        10,
      );
      expect(e.outgoingSpin.z).toBe(e.incomingSpin.z);
    }
  });
  it('allows backspin or topspin to exchange rotational and horizontal energy', () => {
    const top = integrateBallFlight(
      { ...ball(-1), spin: { x: 0, y: 160, z: 0 } },
      0.001,
      environment,
    );
    const back = integrateBallFlight(
      { ...ball(-1), spin: { x: 0, y: -160, z: 0 } },
      0.001,
      environment,
    );
    expect(top.velocity.x).toBeGreaterThan(10);
    expect(back.velocity.x).toBeLessThan(10);
  });
  it('does not lose finite incoming velocity at ground merely because airborne is false', () => {
    const events: GroundImpactEvent[] = [];
    const result = integrateBallFlight(ball(-40), 0.025, environment, (e) => events.push(e));
    expect(events[0]!.at).toBe(0);
    expect(result.position.z).toBeGreaterThan(0.11);
    expect(result.velocity.z).toBeGreaterThan(0);
  });
  it('settles the numerically unresolved inelastic tail without resting jitter', () => {
    const resting = stop(ball(0.2));
    expect(resting.airborne).toBe(false);
    expect(resting.velocity).toEqual({ x: 0, y: 0, z: 0 });
    const later = integrateBallFlight(resting, 5, environment);
    expect(later.position).toEqual(resting.position);
    expect(later.velocity).toEqual(resting.velocity);
    expect(later.bounceCount).toBe(resting.bounceCount);
    expect(later.airborne).toBe(false);
  });
  it('reduces contact-time sensitivity under step refinement', () => {
    const results = [0.025, 0.0125, 0.00625].map((dt) => stop(ball(0.2), dt).position.x);
    expect(Math.abs(results[1]! - results[2]!)).toBeLessThan(0.001);
    expect(Math.abs(results[0]! - results[2]!)).toBeLessThan(0.003);
  });
  it('shares fixed production substeps between forecast and live stepping', () => {
    const initial = { ...ball(3), spin: { x: 3, y: -20, z: 40 } };
    const samples = projectFutureBallTrajectory(initial, 2, 0.05, environment);
    let live = initial as PhysicalBall;
    for (const sample of samples) {
      for (let i = 0; i < 2; i++) live = integrateBallFlight(live, 0.025, environment);
      expect(sample.ball).toEqual(live);
    }
  });
  it('keeps events detached and replay deterministic and finite', () => {
    const initial = { ...ball(-30, 25, 2), spin: { x: 160, y: 160, z: 160 } };
    const plain = integrateBallFlight(initial, 1, environment);
    const observed = integrateBallFlight(initial, 1, environment, (e) => {
      groundImpactEventSchema.parse(e);
      e.outgoingVelocity.x = 1e6;
      e.position.x = 1e6;
    });
    expect(observed).toEqual(plain);
    expect(integrateBallFlight(initial, 1, environment)).toEqual(plain);
    expect(JSON.stringify(plain)).not.toMatch(/null|NaN|Infinity/);
  });
  it('validates saved physical edition and clears it when applying a frozen profile', () => {
    expect(
      ballEnvironmentSchema.safeParse({ ...environment, groundContact: 'unknown' }).success,
    ).toBe(false);
    const { state } = createKickFixture({ seed: 'pr208-save' });
    state.ballEnvironment = environment;
    expect(tacticalMatchStateSchema.parse(state).ballEnvironment).toEqual(environment);
    const historical = withIntegrationProfile(state, 'realism-candidate-v1', 'state-value-v1');
    expect(historical.ballEnvironment).toBeUndefined();
    expect(integrationStateErrors({ ...historical, ballEnvironment: environment })).toContain(
      'Ball environment is not declared by a historical integration profile',
    );
  });
});
