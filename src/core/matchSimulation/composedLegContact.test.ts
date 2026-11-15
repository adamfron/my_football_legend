// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { createPr224LimbScene, selectPr224Body } from '../../../scripts/pr224Scenarios';
import { BALL_RADIUS } from './ballFlight';
import { resolveOpposingBallContacts } from './ballContactResolution';
import { projectArticulatedBody } from './articulatedBody';
import { integrateBallFlight } from './ballPhysics';
import { firstComposedLegContact } from './composedLegContact';
import { affineBootClearOfBallFlight } from './composedLegCurvature';
import { captureReplaySnapshot, replaySnapshotSchema } from './matchReplay';
import { physicalStrikeBall } from './pendingStrike';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { withIntegrationProfile } from './integrationProfile';
import { MULTI_BODY } from './multiBodyContact';
import { captureReceptionStep } from './receptionTrace';

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

it('certifies a grazing boot departure while retaining possible sphere entry', () => {
  const stationary = { x: 0, y: 0, z: 0 };
  const boot = { position: stationary, velocity: stationary };
  const ball = {
    position: { x: 0.14501, y: 0, z: 0 },
    velocity: { x: -0.02, y: 8, z: 0 },
    airborne: true,
    bounceCount: 0,
  };
  const gravity = { x: 0, y: 0, z: -9.81 };
  expect(affineBootClearOfBallFlight(ball, gravity, boot, 0.004)).toBe(true);
  expect(
    affineBootClearOfBallFlight(
      { ...ball, velocity: { ...ball.velocity, y: 0 } },
      gravity,
      boot,
      0.004,
    ),
  ).toBe(false);
});

const fullMatch = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr224-full-match-checkpoints.json.gz')).toString(),
) as {
  cases: {
    name: string;
    before: unknown;
    actor: string;
    contacts: [string, 'left' | 'right'][];
    plant?: 'left' | 'right';
    stationary?: boolean;
  }[];
  remaining: { before: unknown };
};

it('solves both opposed normal constraints independent of order and retains tangential motion', () => {
  const a = { normal: { x: 0.8, y: 0, z: 0.6 }, velocity: { x: 1, y: 0, z: 0 } };
  const b = { normal: { x: -0.8, y: 0, z: 0.6 }, velocity: { x: -1, y: 0, z: 0 } };
  const incoming = { x: 0, y: 2, z: 0 };
  const result = resolveOpposingBallContacts(incoming, a, b)!;
  expect(result.x).toBeCloseTo(0, 12);
  expect(result.y).toBe(incoming.y);
  expect(result.z).toBeCloseTo(0.8 / 0.6, 12);
  expect(resolveOpposingBallContacts(incoming, b, a)).toEqual(result);
  expect(
    resolveOpposingBallContacts(
      incoming,
      { ...a, normal: { x: 1, y: 0, z: 0 } },
      { ...b, normal: { x: -1, y: 0, z: 0 } },
    ),
  ).toBeUndefined();
});

it('replays the two-player pinch at 41:56 without freezing either moving player', () => {
  const initial = tacticalMatchStateSchema.parse(
    fullMatch.remaining.before,
  ) as unknown as TacticalMatchState;
  const { state, events } = captureReceptionStep(() => stepTacticalMatch(initial, 0.025), {
    mechanics: true,
  });
  expect(state.safetyHalt).toBeUndefined();
  expect(state.time).toBe(initial.time + 0.025);
  expect(state.lastGroundContact).toMatchObject({ actorId: 'footballer_pro_1_4', retained: true });

  const reactions = events.filter(({ source }) => source.endsWith('opposingShinContacts'));
  expect(reactions).toHaveLength(1);
  expect(reactions[0]).toMatchObject({
    actorId: 'footballer_pro_1_4',
    detail: { otherId: 'footballer_pro_1_17' },
  });
  const race = events
    .filter(({ source }) => source.endsWith('intervalRace'))
    .map(({ detail }) => (detail as { event?: unknown }).event);
  expect(race.filter(Boolean)).toHaveLength(MULTI_BODY.events);
  expect(race.at(-1)).toBeUndefined();
  for (const id of ['footballer_pro_1_4', 'footballer_pro_1_17']) {
    const previous = initial.players.find((p) => p.id === id)!;
    const next = state.players.find((p) => p.id === id)!;
    expect(next.position).not.toEqual(previous.position);
    expect(next.articulatedStance?.support).toBe('right');
    expect(next.articulatedStance?.right).toEqual(previous.articulatedStance?.right);
    expect(projectArticulatedBody(state, next)).toBeDefined();
  }
});

it.each(fullMatch.cases)(
  'continues the full-match checkpoint with $name',
  ({ before, actor, contacts, plant, stationary }) => {
    const initial = tacticalMatchStateSchema.parse(before) as unknown as TacticalMatchState;
    const result = stepTacticalMatch(initial, 0.025);
    expect(result.safetyHalt).toBeUndefined();
    expect(result.time).toBe(initial.time + 0.025);
    expect(
      (result.lastLimbContacts ?? []).map((c) => [c.playerId, c.leg?.region, c.leg?.foot]),
    ).toEqual(contacts.map(([id, foot]) => [id, 'shin', foot]));
    expect(result.ball.ownerId).toBe(initial.ball.ownerId);
    if (plant) {
      const previous = initial.players.find((p) => p.id === actor)!;
      const next = result.players.find((p) => p.id === actor)!;
      expect(next.articulatedStance?.support).toBe(plant);
      expect(next.articulatedStance?.[plant]).toEqual(previous.articulatedStance?.[plant]);
      expect(projectArticulatedBody(result, next)).toBeDefined();
    }
    if (stationary) {
      expect(result.ball.x).toBe(initial.ball.x);
      expect(result.ball.y).toBe(initial.ball.y);
      expect(result.ball.velocity).toEqual(initial.ball.velocity);
    }
  },
);

it.each(checkpoints.cases)(
  'replays the previously halted tick in $name',
  ({ name, state, expectedShinAt }) => {
    const initial = tacticalMatchStateSchema.parse(state) as unknown as TacticalMatchState;
    const next = stepTacticalMatch(initial, 0.025);
    expect(next.safetyHalt).toBeUndefined();
    expect(next.time).toBe(initial.time + 0.025);
    const contacts = next.lastLimbContacts ?? [];
    // The release proof now also resolves the incident's real shin recontact.
    const contactAt = name === 'pr222-native-a' ? 5.368168589135586 : expectedShinAt;
    if (contactAt === undefined) {
      expect(contacts).toHaveLength(0);
    } else {
      expect(contacts).toHaveLength(1);
      expect(contacts[0]!.leg).toMatchObject({ foot: 'left', region: 'shin' });
      expect(contacts[0]!.at).toBeCloseTo(contactAt, 8);
      expect(next.lastGroundContact?.at).not.toBe(contacts[0]!.at);
    }
  },
);
