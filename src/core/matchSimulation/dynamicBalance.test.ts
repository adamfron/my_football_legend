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
import { BALL_RADIUS } from './ballFlight';
import { defaultBodyMorphology, individualFootReach } from './bodyMorphology';
import {
  composedLegGap,
  firstComposedLegContact,
  observeOpposingShinPressure,
} from './composedLegContact';
import {
  advanceDynamicBalance,
  dynamicContactMobility,
  loadDynamicBalance,
  measureBalanceMass,
} from './dynamicBalance';
import { GROUNDED_RECOVERY_BALANCE } from './dynamicBalanceState';
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
import { MULTI_BODY } from './multiBodyContact';
import { TEMPORAL_STRIKE } from './temporalFootTrajectory';

const dt = 0.025;
const F = (s: TacticalMatchState): TacticalMatchState => ({
  ...s,
  experimentalComposedLegContact: 'composed-leg-impulse-dev-v2',
});
const G = (s: TacticalMatchState): TacticalMatchState => ({
  ...F(s),
  experimentalDynamicBalance: GROUNDED_RECOVERY_BALANCE,
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
    dynamicBalance: GROUNDED_RECOVERY_BALANCE,
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
  ).toMatchObject({ version: GROUNDED_RECOVERY_BALANCE, centre: balance(player).centre });
  expect(native(stepTacticalMatch(native(next), dt))).toEqual(native(stepTacticalMatch(next, dt)));
  const replay = replaySnapshotSchema.parse(captureReplaySnapshot(next, 0, undefined, true));
  expect(replay.dynamicBalance).toBe(GROUNDED_RECOVERY_BALANCE);
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

it('brakes a sliding body through ground contact before enabling its motor again', () => {
  const input = {
    ...G(withFullBodySkeleton(selectPr224Body(createPr224LimbScene('right')))),
    experimentalDynamicBalance: GROUNDED_RECOVERY_BALANCE,
  } as const;
  const actor = input.players[0]!;
  const stable = advanceDynamicBalance(input, actor, actor, dt);
  const moving = { ...stable, velocity: { x: 1.6, y: 0 } };
  const strong = loadDynamicBalance(
    input,
    moving,
    { ...actor.position, z: 0.13 },
    { x: 350, y: 0, z: 0 },
    'opponent',
  );
  const initial = advanceDynamicBalance(input, strong, strong, dt);
  expect(balance(initial).phase).toBe('lost');
  const unsupported = {
    ...initial,
    articulatedStance: { ...initial.articulatedStance!, support: null },
  };
  const command = { x: 0, y: 5 };
  const coasting = constrainArticulatedMotor(unsupported, command, actor.facingAngle, dt);
  expect(coasting.velocity).toEqual(unsupported.velocity);
  expect(balance(advanceDynamicBalance(input, unsupported, unsupported, dt)).phase).toBe('lost');
  const grounded = constrainArticulatedMotor(initial, command, actor.facingAngle, dt);
  expect(grounded.availableForce).toBe(0);
  expect(grounded.velocity.x).toBeCloseTo(1.6 - 9.81 * dt);
  expect(grounded.velocity.y).toBe(0);
  let player = initial;
  let ticks = 0;
  while (balance(player).phase === 'lost' && ticks < 300) {
    const motor = constrainArticulatedMotor(player, command, actor.facingAngle, dt);
    const next = {
      ...player,
      position: {
        x: player.position.x + motor.velocity.x * dt,
        y: player.position.y + motor.velocity.y * dt,
      },
      velocity: motor.velocity,
      facingAngle: motor.facingAngle,
    };
    next.articulatedStance = advanceArticulatedStance(
      player,
      next,
      dt,
      undefined,
      motor.angularVelocity,
    );
    player = advanceDynamicBalance(input, player, next, dt);
    ticks++;
  }
  expect(ticks).toBeGreaterThan(1);
  expect(balance(player).phase).toBe('upright');
  expect(balance(player).support?.normalForce).toBeGreaterThan(0);
  expect(Math.hypot(balance(player).tilt.x, balance(player).tilt.y)).toBeLessThanOrEqual(0.025);
  expect(
    constrainArticulatedMotor(player, command, actor.facingAngle, dt).availableForce,
  ).toBeGreaterThan(0);
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
  it('dissipates the independent same-body shin squeeze with the right boot planted', () => {
    const input = native(
      JSON.parse(
        gunzipSync(
          readFileSync('docs/performance/pr227-grounded-recovery-independent-halt.json.gz'),
        ).toString(),
      ),
    );
    const { state, events } = captureReceptionStep(() => stepTacticalMatch(input, dt), {
      mechanics: true,
      contactWork: true,
    });
    expect(state.time).toBe(input.time + dt);
    expect(state.safetyHalt).toBeUndefined();
    expect(state.ball.ownerId).toBeUndefined();
    const race = events.filter(({ source }) => source.endsWith('intervalRace'));
    expect(race.length).toBeLessThanOrEqual(MULTI_BODY.events + 1);
    expect(race.at(-1)?.detail).toMatchObject({ event: undefined });
    const id = 'geometry:anchor:9';
    const pressure = events.filter(
      ({ actorId, detail, source }) =>
        actorId === id && source.endsWith('composedLimbWork') && 'plantedShinPressure' in detail,
    );
    expect(pressure.length).toBeGreaterThan(0);
    for (const { detail } of pressure)
      expect(detail).toMatchObject({
        plantedShinPressure: { support: 'right' },
        parameters: { restitution: 0, friction: 0 },
      });
    const yields = events.flatMap(({ actorId, at, source, detail }) => {
      const swing = (detail as { swingYield?: { foot: string; energy: number } }).swingYield;
      return actorId === id && source.endsWith('rebasePlayer') && swing ? [{ at, swing }] : [];
    });
    expect(yields.length).toBeGreaterThan(0);
    for (const { at, swing } of yields) {
      const measured = pressure.find((event) => event.at === at)?.detail as {
        account: { contactFrameWork: number };
      };
      expect(measured).toBeDefined();
      expect(swing.foot).toBe('left');
      expect(swing.energy).toBeGreaterThan(0);
      expect(swing.energy).toBeLessThanOrEqual(-measured.account.contactFrameWork / 4 + 1e-12);
    }
    const before = input.players.find((p) => p.id === id)!;
    const player = state.players.find((p) => p.id === id)!;
    expect(player.articulatedStance?.support).toBe('right');
    expect(player.articulatedStance?.right).toEqual(before.articulatedStance?.right);
    const geometry = projectArticulatedBody(state, player)!.geometry;
    const ball = { ...state.ball, z: state.ball.height! };
    for (const foot of ['left', 'right'] as const) {
      expect(composedLegGap(geometry, `${foot}_shin`, ball)).toBeGreaterThan(0);
      const boot = geometry[foot].foot;
      expect(
        Math.hypot(ball.x - boot.x, ball.y - boot.y, ball.z - boot.z) -
          BALL_RADIUS -
          TEMPORAL_STRIKE.footRadius,
      ).toBeGreaterThan(0);
    }
    let following = native(state);
    for (let tick = 1; tick < 26; tick++) following = stepTacticalMatch(following, dt);
    expect(following.safetyHalt).toBeUndefined();
    expect(following.time - input.time).toBeCloseTo(0.65, 9);
  });

  it('completes the native 71:58 support transfer through two shins on the same body', () => {
    const source = JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr224-native-a-halt.json.gz')).toString(),
    ) as { before: TacticalMatchState };
    const input = native(G(withFullBodySkeleton(selectPr224Body(source.before))));
    const { state, events } = captureReceptionStep(() => stepTacticalMatch(input, dt), {
      mechanics: true,
      contactWork: true,
    });
    expect(state.time).toBe(input.time + dt);
    expect(state.safetyHalt).toBeUndefined();
    const id = 'footballer_pro_9_7';
    const before = input.players.find((p) => p.id === id)!;
    const after = state.players.find((p) => p.id === id)!;
    expect(before.articulatedStance?.support).toBe('right');
    expect(after.articulatedStance?.support).toBe('left');
    expect(after.articulatedStance?.right).toEqual(before.articulatedStance?.right);
    const find = (suffix: string) => events.filter(({ source: label }) => label.endsWith(suffix));
    const work = find('composedLimbWork').filter(
      ({ detail }) => 'supportTransfer' in (detail as object),
    );
    expect(work).toHaveLength(1);
    expect(work[0]?.detail).toMatchObject({
      supportTransfer: { from: 'right', to: 'left' },
      account: {
        surfaces: [
          expect.objectContaining({ actorId: id, leg: expect.objectContaining({ foot: 'left' }) }),
          expect.objectContaining({ actorId: id, leg: expect.objectContaining({ foot: 'right' }) }),
        ],
      },
    });
    expect(find('intervalRace').length).toBeLessThanOrEqual(MULTI_BODY.events + 1);
    expect(find('intervalRace').at(-1)?.detail).toMatchObject({ event: undefined });
    const geometry = projectArticulatedBody(state, after)!.geometry;
    for (const region of ['left_shin', 'right_shin'] as const)
      expect(
        composedLegGap(geometry, region, { ...state.ball, z: state.ball.height! }),
      ).toBeGreaterThan(0);
    let resumed = native(state);
    for (let tick = 1; tick < 26; tick++) resumed = stepTacticalMatch(resumed, dt);
    expect(resumed.safetyHalt).toBeUndefined();
    expect(resumed.time - input.time).toBeCloseTo(0.65, 9);
  });

  it('retains the historical F halt and clears both actual shins in G with a loaded swing step', () => {
    const input = loadCheckpoint('late-shin-pinch');
    const historical = stepTacticalMatch(input, dt);
    expect(historical.time).toBe(input.time);
    expect(historical.safetyHalt?.reason).toBe('pendingStrikeInterval.event_budget');
    const { state, events } = captureReceptionStep(() => stepTacticalMatch(G(input), dt), {
      mechanics: true,
      contactWork: true,
    });
    const find = (suffix: string) => events.filter(({ source }) => source.endsWith(suffix));
    expect(state.safetyHalt).toBeUndefined();
    expect(state.time).toBe(input.time + dt);
    expect(state.discipline).toEqual(input.discipline);
    expect(state.ball.ownerId).toBeUndefined();
    expect(find('opposingShinContacts')).toHaveLength(1);
    expect(find('composedLimbWork')).toHaveLength(5);
    expect(
      find('composedLimbWork').filter(({ detail }) => 'pressure' in (detail as object)),
    ).toHaveLength(2);
    expect(find('intervalRace').length).toBeLessThanOrEqual(MULTI_BODY.events + 1);
    expect(find('intervalRace').at(-1)?.detail).toMatchObject({ event: undefined });
    expect(find('rebasePlayer')).toContainEqual(
      expect.objectContaining({
        actorId: 'footballer_pro_1_10',
        detail: expect.objectContaining({
          swingYield: expect.objectContaining({ foot: 'right', energy: expect.any(Number) }),
        }),
      }),
    );
    for (const id of ['footballer_pro_1_10', 'footballer_pro_9_18']) {
      const actor = state.players.find((p) => p.id === id)!;
      expect(balance(actor).lastLoad?.source).toBe('ball');
      expect(
        composedLegGap(projectArticulatedBody(state, actor)!.geometry, 'right_shin', {
          ...state.ball,
          z: state.ball.height!,
        }),
      ).toBeGreaterThan(0);
    }
    let continuation = native(state);
    for (let tick = 0; tick < 12; tick++) continuation = stepTacticalMatch(continuation, dt);
    expect(continuation.safetyHalt).toBeUndefined();
    expect(continuation.time - input.time).toBeCloseTo(0.325, 9);
  });

  it('keeps the native knee and thigh apart after rebasing the actual limb paths in G', () => {
    const input = loadCheckpoint('knee-thigh');
    expect(stepTacticalMatch(input, dt).safetyHalt).toBeUndefined();
    const { state, events } = captureReceptionStep(() => stepTacticalMatch(G(input), dt), {
      mechanics: true,
      contactWork: true,
    });
    expect(state.safetyHalt).toBeUndefined();
    expect(state.time).toBe(input.time + dt);
    expect(events.filter(({ source }) => source.endsWith('opposingLegContacts'))).toHaveLength(1);
    const ball = { ...state.ball, z: state.ball.height! };
    for (const [id, proxy] of [
      ['footballer_pro_1_23', 'right_thigh'],
      ['footballer_pro_9_12', 'left_thigh'],
    ] as const) {
      const player = state.players.find((p) => p.id === id)!;
      expect(
        composedLegGap(projectArticulatedBody(state, player)!.geometry, proxy, ball),
      ).toBeGreaterThan(0);
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
  });
});

it('distinguishes a separated or opening pair and rechecks a departing shin for actual re-entry', () => {
  const scene = G(withFullBodySkeleton(selectPr224Body(createPr224LimbScene('right'))));
  const body = projectArticulatedBody(scene, scene.players[0]!)!;
  const geometry = {
    ...body.geometry,
    capsules: [
      {
        region: 'right_shin' as const,
        from: { x: 0, y: 0, z: 0.5 },
        to: { x: 0, y: 0, z: 0.1 },
        radius: 0.07,
      },
    ],
  };
  const contactPoint = { x: 0.17, y: 0, z: 0.43 };
  for (let pass = 0; pass < 4; pass++)
    contactPoint.x -= composedLegGap(geometry, 'right_shin', contactPoint)!;
  const near = { ...contactPoint, x: contactPoint.x + 0.001 };
  const current = { normal: { x: -1, y: 0, z: 0 }, velocity: { x: -1.2, y: 0, z: 0 } };
  const observe = (position: typeof near, age: number, x = current.velocity.x) =>
    observeOpposingShinPressure(
      { ...current, velocity: { ...current.velocity, x } },
      'right_shin',
      position,
      () => geometry,
      0.012,
      age,
    );
  expect(observe(near, 0.003)?.gap).toBeGreaterThan(0);
  expect(observe({ ...near, x: near.x + 0.02 }, 0.003)).toBeUndefined();
  expect(observe(near, 0.03)).toBeUndefined();
  expect(observe(near, 0.003, 1.2)).toBeUndefined();

  const first = (offset: number) =>
    firstComposedLegContact(
      0.012,
      () => geometry,
      (at) => ({
        position: { ...contactPoint, x: contactPoint.x + offset + at * (0.5 - 50 * at) },
        velocity: { x: 0.5 - 100 * at, y: 0, z: 0 },
        airborne: true,
        bounceCount: 0,
      }),
      {
        horizontalHipSpeed: 0,
        yawSpeed: 0,
        unconstrainedPelvisAt: () => geometry.pelvis.z,
        unconstrainedPelvisSpeed: 0,
        bootSpeed: { left: 0, right: 0 },
        ballSpeed: 0.7,
        ballAcceleration: 100,
        recheckSurfaces: new Set(['right_shin']),
      },
      [],
    );
  expect(first(1e-10)).toMatchObject({ kind: 'contact', at: expect.closeTo(0.01, 5) });
  expect(first(-0.0001)).toMatchObject({ kind: 'unresolved', reason: 'geometry', at: 0 });
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
