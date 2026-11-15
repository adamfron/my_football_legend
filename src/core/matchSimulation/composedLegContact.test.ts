// @vitest-environment node
import { expect, it } from 'vitest';
import { createPr224LimbScene, selectPr224Body } from '../../../scripts/pr224Scenarios';
import { BALL_RADIUS } from './ballFlight';
import { captureReplaySnapshot, replaySnapshotSchema } from './matchReplay';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema } from './matchState';
import { withIntegrationProfile } from './integrationProfile';

it.each([
  ['left', 'stationary'],
  ['right', 'stationary'],
  ['left', 'recovering'],
  ['right', 'recovering'],
] as const)(
  'resolves %s %s shin in the canonical race without crediting a boot touch',
  (foot, phase) => {
    const baseline = createPr224LimbScene(foot, phase);
    const initial = selectPr224Body(baseline);
    const completed = stepTacticalMatch(initial, 0.025);
    expect(completed.safetyHalt).toBeUndefined();
    expect(stepTacticalMatch(baseline, 0.025).lastBallContact?.leg).toBeUndefined();
    const hit = completed.lastBallContact!;
    expect(hit.leg).toMatchObject({ foot, region: 'shin' });
    expect(hit.at).toBeGreaterThan(initial.time);
    expect(hit.at).toBeLessThan(completed.time);
    expect(hit.postContactSpeed).not.toBe(hit.preContactSpeed);
    if (phase === 'recovering')
      expect(Math.hypot(...Object.values(hit.surfaceVelocity!))).toBeGreaterThan(0.1);
    const { point, from, to } = hit.leg!;
    expect(
      Math.hypot(hit.point.x - point.x, hit.point.y - point.y, hit.point.z - point.z),
    ).toBeCloseTo(BALL_RADIUS, 6);
    expect(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)).toBeLessThan(0.5);
    expect(completed.lastGroundContact?.at).not.toBe(hit.at);
    expect(completed.lastPassDiagnostic?.releasedAt).toBeUndefined();
    expect(completed.ball.ownerId).toBeUndefined();
    const replay = captureReplaySnapshot(completed, 0, initial, true);
    expect(replaySnapshotSchema.parse(JSON.parse(JSON.stringify(replay))).limbContacts).toEqual([
      hit,
    ]);
    const next = stepTacticalMatch(completed, 0.025);
    expect(next.lastBallContact?.at).toBe(hit.at);
  },
);

it('preserves a physical miss and validates the opt-in separately from archived editions', () => {
  const initial = selectPr224Body(createPr224LimbScene('right', 'miss'));
  const next = stepTacticalMatch(initial, 0.025);
  expect(next.safetyHalt).toBeUndefined();
  expect(next.lastBallContact?.leg).toBeUndefined();
  expect(tacticalMatchStateSchema.safeParse(initial).success).toBe(true);
  expect(
    tacticalMatchStateSchema.safeParse({ ...initial, experimentalPostImpactStance: undefined })
      .success,
  ).toBe(false);
  expect(
    withIntegrationProfile(initial, 'realism-candidate-v1').experimentalComposedLegContact,
  ).toBeUndefined();
});
