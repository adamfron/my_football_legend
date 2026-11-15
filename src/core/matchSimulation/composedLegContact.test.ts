// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { createPr224LimbScene, selectPr224Body } from '../../../scripts/pr224Scenarios';
import { BALL_RADIUS } from './ballFlight';
import { projectArticulatedBody } from './articulatedBody';
import { integrateBallFlight } from './ballPhysics';
import { firstComposedLegContact } from './composedLegContact';
import { captureReplaySnapshot, replaySnapshotSchema } from './matchReplay';
import { physicalStrikeBall } from './pendingStrike';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
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

it('shares the search budget and preserves the same clear prefix for every capsule', () => {
  const state = createPr224LimbScene('left');
  const actor = state.players.find((player) => player.id === state.playerMovementIntent?.actorId)!;
  const geometry = projectArticulatedBody(state, actor)!.geometry;
  const ball = physicalStrikeBall(state);
  const search = (ballSpeed: number) => {
    let samples = 0;
    const result = firstComposedLegContact(
      0.025,
      () => {
        samples++;
        return geometry;
      },
      (at) => integrateBallFlight(ball, at, state.ballEnvironment),
      {
        horizontalHipSpeed: 0,
        yawSpeed: 0,
        unconstrainedPelvisAt: () => geometry.pelvis.z,
        unconstrainedPelvisSpeed: 0,
        bootSpeed: { left: 0, right: 0 },
        ballSpeed,
      },
      [],
    );
    return { result, samples };
  };

  // These conservative bounds describe the same ball trajectory. In the old
  // sequential search, the next capsule reset both exhausted searches to t=0.
  const reference = search(12.5);
  const resolved = search(75);
  expect(resolved.result).toMatchObject({ kind: 'contact', leg: { region: 'shin', foot: 'left' } });
  expect(resolved.result!.at).toBeCloseTo(reference.result!.at, 8);
  expect(resolved.samples).toBeLessThan(192);

  const exhausted = search(110);
  expect(exhausted.samples).toBe(192);
  expect(exhausted.result).toMatchObject({ kind: 'unresolved', reason: 'budget' });
  expect(exhausted.result!.at).toBeGreaterThan(0);
  expect(exhausted.result!.at).toBeLessThan(reference.result!.at);
});

const checkpoints = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr224-ccd-checkpoints.json.gz')).toString(),
) as { cases: { name: string; state: unknown; expectedShinAt?: number }[] };

it.each(checkpoints.cases)(
  'replays the previously halted tick in $name',
  ({ state, expectedShinAt }) => {
    const initial = tacticalMatchStateSchema.parse(state) as unknown as TacticalMatchState;
    const next = stepTacticalMatch(initial, 0.025);
    expect(next.safetyHalt).toBeUndefined();
    expect(next.time).toBe(initial.time + 0.025);
    const contacts = next.lastLimbContacts ?? [];
    if (expectedShinAt === undefined) {
      expect(contacts).toHaveLength(0);
    } else {
      expect(contacts).toHaveLength(1);
      expect(contacts[0]!.leg).toMatchObject({ foot: 'left', region: 'shin' });
      expect(contacts[0]!.at).toBeCloseTo(expectedShinAt, 8);
      expect(next.lastGroundContact?.at).not.toBe(contacts[0]!.at);
    }
  },
);
