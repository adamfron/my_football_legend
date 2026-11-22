// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createPr224LimbScene, selectPr224Body } from '../../../scripts/pr224Scenarios';
import { stepPairCompression } from '../../../scripts/pr227Compliance';
import { projectArticulatedBody } from './articulatedBody';
import {
  advanceArticulatedStance,
  constrainArticulatedMotor,
  SWING_METRES_PER_SECOND,
} from './articulatedGait';
import { firstGroundImpactTime } from './ballPhysics';
import { defaultBodyMorphology, individualFootReach } from './bodyMorphology';
import {
  advanceDynamicBalance,
  dynamicContactMobility,
  loadDynamicBalance,
  measureBalanceMass,
} from './dynamicBalance';
import {
  fullBodySkeletonSchema,
  projectFullBodySkeleton,
  restoreFullBodySkeleton,
  withFullBodySkeleton,
} from './fullBodySkeleton';
import { effectiveHolisticRecipe, withHolisticDevelopment } from './holisticDevelopment';
import { captureReplaySnapshot, replaySnapshotSchema } from './matchReplay';
import { stepTacticalMatch } from './matchSimulation';
import {
  tacticalMatchStateSchema,
  type MatchPlayerState,
  type TacticalMatchState,
} from './matchState';
import { captureReceptionStep } from './receptionTrace';

const dt = 0.025;
const F = (s: TacticalMatchState): TacticalMatchState => ({
  ...s,
  experimentalComposedLegContact: 'composed-leg-impulse-dev-v2',
});
const G = (s: TacticalMatchState): TacticalMatchState => ({
  ...F(s),
  experimentalDynamicBalance: 'dynamic-balance-dev-v1',
});
const native = (state: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(
    JSON.parse(JSON.stringify(state)),
  ) as unknown as TacticalMatchState;
const balance = (player: MatchPlayerState) => player.articulatedStance!.dynamicBalance!;
const loadCheckpoint = (name: 'late-shin-pinch' | 'ground-graze' | 'knee-thigh') =>
  native(
    JSON.parse(
      gunzipSync(readFileSync(`docs/performance/pr226-${name}-checkpoint.json.gz`)).toString(),
    ),
  );

it('selects G separately, persists its state and restores tilt through compact replay', () => {
  const scene = createPr224LimbScene('right');
  const selected = withHolisticDevelopment(
    scene,
    'state-value-v1',
    'holistic-dynamic-balance-dev-v1',
  );
  expect(effectiveHolisticRecipe(selected)).toMatchObject({
    id: 'holistic-dynamic-balance-dev-v1',
    dynamicBalance: 'dynamic-balance-dev-v1',
  });
  const input = G(withFullBodySkeleton(selectPr224Body(scene)));
  const next = stepTacticalMatch(input, dt);
  expect(next.safetyHalt).toBeUndefined();
  const player = next.players.find(
    (p) => p.articulatedStance?.dynamicBalance?.lastLoad?.source === 'ball',
  )!;
  expect(player).toBeDefined();
  expect(
    Math.hypot(balance(player).angularMomentum.x, balance(player).angularMomentum.y),
  ).toBeGreaterThan(0);
  expect(
    native(next).players.find((p) => p.id === player.id)?.articulatedStance?.dynamicBalance,
  ).toMatchObject({ version: 'dynamic-balance-dev-v1', centre: balance(player).centre });
  expect(native(stepTacticalMatch(native(next), dt))).toEqual(native(stepTacticalMatch(next, dt)));
  const replay = replaySnapshotSchema.parse(captureReplaySnapshot(next, 0, undefined, true));
  expect(replay.dynamicBalance).toBe('dynamic-balance-dev-v1');
  const sampled = replay.players.find((p) => p.id === player.id)!;
  const body = projectArticulatedBody(next, player)!;
  expect(sampled.articulatedBody?.torsoOrientation).toEqual(body.torsoOrientation);
  const skeleton = projectFullBodySkeleton(next, player, body)!;
  const restored = restoreFullBodySkeleton(sampled.articulatedBody!, sampled.fullBodyPoseInputs!);
  expect(fullBodySkeletonSchema.parse(restored)).toEqual(fullBodySkeletonSchema.parse(skeleton));
  expect(
    projectArticulatedBody(input, input.players.find((p) => p.id === player.id)!)?.torsoOrientation
      .pitch,
  ).toBe(0);
});

it('uses mass, anatomy, support and the existing finite swing for perturbations', () => {
  const input = G(withFullBodySkeleton(selectPr224Body(createPr224LimbScene('right'))));
  const actor = input.players[0]!;
  const stable = advanceDynamicBalance(input, actor, actor, dt);
  expect(balance(stable).inertia.x).toBeGreaterThan(0);
  const body = projectArticulatedBody(input, stable)!;
  const pose = projectFullBodySkeleton(input, stable, body)!;
  expect(measureBalanceMass(pose.segments, body.mass).centre).toEqual(balance(stable).centre);
  expect(balance(stable).support?.normalForce).toBeCloseTo(actor.profile.weightKg * 9.81);
  const appliedAt = { ...actor.position, z: 0.13 };
  const weak = loadDynamicBalance(input, stable, appliedAt, { x: 1, y: 0, z: 0 }, 'ball');
  expect(weak.velocity.x - stable.velocity.x).toBeCloseTo(1 / actor.profile.weightKg, 12);
  const mobility = dynamicContactMobility(input, stable)!;
  expect(mobility(appliedAt, appliedAt, { x: 1, y: 0, z: 0 }).x).toBeGreaterThan(
    1 / actor.profile.weightKg,
  );
  expect(
    advanceDynamicBalance(input, weak, weak, dt).articulatedStance?.dynamicBalance?.phase,
  ).toBe('upright');
  let disturbed = loadDynamicBalance(input, stable, appliedAt, { x: 44, y: 0, z: 0 }, 'ball');
  disturbed = advanceDynamicBalance(input, disturbed, disturbed, dt);
  const plan = balance(disturbed).recovery;
  expect(plan).toBeDefined();
  const prior = disturbed.articulatedStance!;
  const stance = advanceArticulatedStance(disturbed, disturbed, dt);
  const foot = plan!.foot;
  expect(stance.support).toBe(prior.support);
  expect(
    Math.hypot(
      stance[foot].x - prior[foot].x,
      stance[foot].y - prior[foot].y,
      stance[foot].z - prior[foot].z,
    ),
  ).toBeLessThanOrEqual(SWING_METRES_PER_SECOND * dt);
  let advancing = disturbed;
  for (let tick = 0; tick < 8 && advancing.articulatedStance?.support !== foot; tick++) {
    const endpoint = {
      ...advancing,
      position: {
        x: advancing.position.x + advancing.velocity.x * dt,
        y: advancing.position.y + advancing.velocity.y * dt,
      },
    };
    endpoint.articulatedStance = advanceArticulatedStance(advancing, endpoint, dt);
    const placed = endpoint.articulatedStance[foot];
    const from = advancing.articulatedStance![foot];
    expect(Math.hypot(placed.x - from.x, placed.y - from.y, placed.z - from.z)).toBeLessThanOrEqual(
      SWING_METRES_PER_SECOND * dt + 1e-12,
    );
    advancing = advanceDynamicBalance(input, advancing, endpoint, dt);
  }
  expect(advancing.articulatedStance?.support).toBe(foot);
  expect(advancing.articulatedStance?.[foot].z).toBeCloseTo(0.04);
  expect(projectArticulatedBody(input, advancing)).toBeDefined();
  const strong = loadDynamicBalance(input, stable, appliedAt, { x: 500, y: 0, z: 0 }, 'opponent');
  const lost = advanceDynamicBalance(input, strong, strong, dt);
  expect(balance(lost).phase).toBe('lost');
  expect(constrainArticulatedMotor(lost, { x: 0, y: 2 }, 0, dt).availableForce).toBe(0);
  expect(balance(advanceDynamicBalance(input, lost, lost, dt)).phase).toBe('lost');
});

it('samples changes in geometry without assigning a new skill or mass', () => {
  const initial = F(selectPr224Body(createPr224LimbScene('right')));
  const p = initial.players[0]!;
  const base = G(withFullBodySkeleton(initial));
  const first = advanceDynamicBalance(base, p, p, dt);
  const morphology = defaultBodyMorphology();
  morphology.range = 'stress';
  morphology.left.thigh = 0.258;
  morphology.right.kneeAlignment = -0.1;
  morphology.lowerTrunk = 0.14;
  morphology.left.footLength = 0.13;
  morphology.right.footLength = 0.18;
  const varied = G(withFullBodySkeleton(initial, { [p.id]: morphology }));
  const shaped = varied.players.find(({ id }) => id === p.id)!;
  const second = advanceDynamicBalance(varied, shaped, shaped, dt);
  expect(balance(second).centre.z).not.toBe(balance(first).centre.z);
  expect(balance(second).inertia.x).not.toBe(balance(first).inertia.x);
  expect(second.profile).toEqual(first.profile);
});

it('slides only a loaded outward-moving anchor at the reach limit', () => {
  const input = G(withFullBodySkeleton(selectPr224Body(createPr224LimbScene('right'))));
  const actor = input.players[0]!;
  const stable = advanceDynamicBalance(input, actor, actor, dt);
  const stance = stable.articulatedStance!;
  const foot = stance.support!;
  const body = projectArticulatedBody(input, stable)!;
  const reach = individualFootReach(body.height, foot, stable.bodyMorphology);
  const start = {
    ...stable,
    articulatedStance: {
      ...stance,
      [foot]: {
        x: body.geometry[foot].hip.x - reach + 0.01,
        y: body.geometry[foot].hip.y,
        z: 0.04,
      },
    },
  };
  const loaded = loadDynamicBalance(
    input,
    start,
    { ...start.position, z: 0.13 },
    { x: stable.profile.weightKg * 2, y: 0, z: 0 },
    'ball',
  );
  const endpoint = {
    ...loaded,
    velocity: { x: 2, y: 0 },
    position: { ...loaded.position, x: loaded.position.x + 2 * dt },
  };
  const slid = advanceArticulatedStance(loaded, endpoint, dt);
  const control = advanceArticulatedStance(start, endpoint, dt);
  expect(slid[foot].z).toBe(start.articulatedStance[foot].z);
  expect(slid[foot].x - start.articulatedStance[foot].x).toBeGreaterThan(0);
  expect(slid[foot].x - start.articulatedStance[foot].x).toBeLessThan(2 * dt);
  expect(control[foot]).toEqual(start.articulatedStance[foot]);
});

describe('source-bound solver controls', () => {
  it('keeps the late shin pressure distinct from a legal decision', () => {
    const input = loadCheckpoint('late-shin-pinch');
    for (const candidate of [input, G(input)]) {
      const { state, events } = captureReceptionStep(() => stepTacticalMatch(candidate, dt), {
        mechanics: true,
        contactWork: true,
      });
      expect(state.time).toBe(input.time);
      expect(state.safetyHalt?.reason).toBe('pendingStrikeInterval.event_budget');
      expect(state.discipline).toEqual(input.discipline);
      expect(
        new Set(events.filter((e) => e.source.endsWith('composedLimbWork')).map((e) => e.actorId))
          .size,
      ).toBe(2);
    }
  });

  it('preserves the supported near-ground graze without inserting a fresh limb impulse', () => {
    const input = loadCheckpoint('ground-graze');
    const { state, events } = captureReceptionStep(() => stepTacticalMatch(G(input), dt), {
      contactWork: true,
    });
    expect(stepTacticalMatch(input, dt).safetyHalt?.reason).toBe(
      'pendingStrikeInterval.event_budget',
    );
    expect(state.safetyHalt).toBeUndefined();
    expect(state.time).toBe(input.time + dt);
    expect(events.filter((e) => e.source.endsWith('composedLimbWork'))).toHaveLength(0);
  });

  it('certifies a finite takeoff interval and excludes the actual floor crossing', () => {
    expect(firstGroundImpactTime(0.11, 0.2, -10)).toBeCloseTo(0.04, 12);
    expect(firstGroundImpactTime(0.11, -0.2, -10)).toBe(0);
    expect(firstGroundImpactTime(0.11004, -0.12, -10)).toBeLessThan(dt);
    expect(stepTacticalMatch(loadCheckpoint('knee-thigh'), dt).safetyHalt).toBeUndefined();
  });
});

it('stores and dissipates energy in the isolated compliant pair without adding a rebound source', () => {
  for (const stiffness of [10000, 20000, 40000]) {
    const material = { stiffness, damping: 30, maximumDepth: 0.025 };
    const mobility = { a: 2.5, b: 2.5, cross: -2.2 };
    let sample = stepPairCompression(
      { depth: [0, 0], closure: [1.2, 1.2] },
      mobility,
      0.001,
      material,
    );
    expect(sample.stored).toBeGreaterThan(0);
    for (let step = 0; step < 60; step++) {
      expect(sample.supported).toBe(true);
      expect(sample.dissipated).toBeGreaterThanOrEqual(-1e-12);
      sample = stepPairCompression(sample, mobility, 0.001, material);
    }
    expect(sample.depth).toEqual([0, 0]);
    expect(sample.impulse).toEqual([0, 0]);
  }
});
