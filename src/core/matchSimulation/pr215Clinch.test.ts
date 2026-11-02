// @vitest-environment node
import { expect, it } from 'vitest';
import { runPr215Clinch } from '../../../scripts/pr215Clinch';
import { ballBodyClearance, supportContinuousBodyContacts } from './ballContactResolution';

it('supports a ball on compatible upper surfaces, then escapes after an actual third-body impulse', () => {
  const r = runPr215Clinch();
  expect(r.bodies[1]!.centre.x - r.bodies[0]!.centre.x).toBeGreaterThanOrEqual(r.torsoDiameter);
  expect(r.minimumThirdTorsoSeparation).toBeGreaterThan(r.torsoDiameter);
  expect(r.groundTwoSurfaceMaximumSeparation).toBeLessThan(r.torsoDiameter);
  expect(r.retained).toHaveLength(2);
  expect(r.supportClearances.every((v) => v >= -1e-6)).toBe(true);
  const supported = r.frames.at(-1)!;
  expect(
    Math.hypot(
      supported.position.x - r.initial.position.x,
      supported.position.y - r.initial.position.y,
      supported.position.z - r.initial.position.z,
    ),
  ).toBeLessThan(0.01);
  expect(Math.hypot(supported.velocity.x, supported.velocity.y, supported.velocity.z)).toBeLessThan(
    0.3,
  );
  expect(r.contact.playerId).toBe('intervening-body');
  expect(r.contact.segmentFraction).toBeGreaterThan(0);
  expect(r.outgoing.y).toBeGreaterThan(0);
  expect(r.outgoing.z).toBeGreaterThan(0);
  expect(r.afterEscape).toEqual([]);
  expect(r.bodies.every((b) => ballBodyClearance(r.terminal.position, b) > 0.01)).toBe(true);
  expect(r.ownershipAwarded).toBe(false);
  expect(r.refereeInterruption).toBe(false);
});

it('does not reapply restitution during support and keeps incompatible support bounded', () => {
  const r = runPr215Clinch();
  const stationary = supportContinuousBodyContacts(
    r.initial.position,
    { x: 0, y: 0, z: 0 },
    r.bodies,
    0.025,
  );
  expect(stationary.velocity).toEqual({ x: 0, y: 0, z: 0 });
  const incompatible = r.bodies.map((b, i) => ({
    ...b,
    centre: { x: 30 + (i ? 0.25 : -0.25), y: 34, z: 0.9 },
  }));
  const unresolved = supportContinuousBodyContacts(
    { x: 30, y: 34, z: 0.11 },
    { x: 0, y: 0, z: 0 },
    incompatible,
    0.025,
  );
  expect(Object.values(unresolved.position).every(Number.isFinite)).toBe(true);
  expect(incompatible.some((b) => ballBodyClearance(unresolved.position, b) < 0)).toBe(true);
  expect(unresolved.velocity).toEqual({ x: 0, y: 0, z: 0 });
});
