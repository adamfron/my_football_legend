// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createPr224PassScene,
  createPr224LimbScene,
  selectPr224Body,
} from '../../../scripts/pr224Scenarios';
import { bodyMorphologySchema, defaultBodyMorphology } from './bodyMorphology';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import { projectArticulatedBody } from './articulatedBody';
import {
  fullBodySkeletonSchema,
  projectFullBodySkeleton,
  withFullBodySkeleton,
} from './fullBodySkeleton';
import {
  composeTransform,
  pointLength,
  subtractPoint,
  rotatePoint,
  axisRotation,
  addPoint,
  multiplyRotation,
} from './skeletonTransform';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { withoutArticulatedBody } from './articulatedGait';
import { captureReplaySnapshot, replaySnapshotSchema } from './matchReplay';
import { projectCanonicalPlayerPresentation } from './canonicalPresentation';
import { beginVerticalJump } from './bodyMechanics';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { withHolisticDevelopment, effectiveHolisticRecipe } from './holisticDevelopment';

const native = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;
const scene = () => withFullBodySkeleton(selectPr224Body(createPr224LimbScene('right')));
const pose = (s: TacticalMatchState, index = 0) =>
  projectFullBodySkeleton(s, s.players[index]!, projectArticulatedBody(s, s.players[index]!)!)!;

it('selects and exports a distinct full-body lab recipe while retaining old preset identities', () => {
  const input = createPr224LimbScene('right');
  const selected = withHolisticDevelopment(input, 'state-value-v1', 'holistic-full-body-dev-v1');
  expect(effectiveHolisticRecipe(native(selected))?.id).toBe('holistic-full-body-dev-v1');
  expect(selected.experimentalComposedLegContact).toBe('composed-leg-contact-dev-v1');
  expect(selected.experimentalFullBodySkeleton).toBe('full-body-skeleton-dev-v1');
  const old = withHolisticDevelopment(input, 'state-value-v1', 'holistic-stance-foot-dev-v2');
  expect(effectiveHolisticRecipe(old)?.id).toBe('holistic-stance-foot-dev-v2');
  expect(old.experimentalFullBodySkeleton).toBeUndefined();
});

it.each([150, 165, 180, 195, 215])('retains exact v2 default leg geometry at %icm', (heightCm) => {
  const state = scene(),
    p = state.players[0]!;
  p.profile = { ...p.profile, heightCm };
  const old = deriveLowerBodyGeometry(p);
  expect(deriveLowerBodyGeometry({ ...p, bodyMorphology: defaultBodyMorphology() })).toEqual(old);
  expect(fullBodySkeletonSchema.safeParse(pose(state)).success).toBe(true);
});

it('implements one complete semantic hierarchy and forbids unsupported upper colliders', () => {
  const s = pose(scene());
  expect(fullBodySkeletonSchema.parse(s)).toEqual(s);
  expect(s.segments).toHaveLength(19);
  expect(s.joints).toHaveLength(18);
  for (const id of ['left_foot', 'right_foot', 'left_hand', 'right_hand', 'pelvis', 'head'])
    expect(s.segments.some((segment) => segment.id === id)).toBe(true);
  for (const segment of s.segments) {
    const parent = s.segments.find((p) => p.id === segment.parent)?.world ?? s.root;
    expect(
      pointLength(
        subtractPoint(composeTransform(parent, segment.local).position, segment.world.position),
      ),
    ).toBeLessThan(1e-10);
  }
  expect(
    s.proxies
      .filter(
        (p) => p.segment.includes('arm') || p.segment.includes('hand') || p.segment === 'head',
      )
      .every((p) => p.collisionAuthority === 'inactive'),
  ).toBe(true);
  const broken = structuredClone(s);
  broken.segments[1]!.local.position.x += 0.01;
  expect(fullBodySkeletonSchema.safeParse(broken).success).toBe(false);
  const duplicate = structuredClone(s);
  duplicate.segments[1]!.id = 'pelvis';
  expect(fullBodySkeletonSchema.safeParse(duplicate).success).toBe(false);
});

it.each([Math.PI / 2, -Math.PI / 2, Math.PI])(
  'rotates the whole anatomical frame with physical facing %f',
  (turn) => {
    const s = scene(),
      p = s.players[0]!,
      first = pose(s),
      rotation = axisRotation('z', -turn);
    const root = { ...p.position, z: 0 };
    const moved = (v: { x: number; y: number; z: number }) =>
      addPoint(root, rotatePoint(rotation, subtractPoint(v, root)));
    p.facingAngle += turn;
    p.articulatedStance = {
      ...p.articulatedStance!,
      supportYaw: p.articulatedStance!.supportYaw + turn,
      left: moved(p.articulatedStance!.left),
      right: moved(p.articulatedStance!.right),
    };
    const next = pose(s);
    for (const original of first.segments) {
      const actual = next.segments.find((s) => s.id === original.id)!,
        q = multiplyRotation(rotation, original.world.rotation);
      expect(
        pointLength(subtractPoint(actual.world.position, moved(original.world.position))),
      ).toBeLessThan(1e-10);
      expect(
        Math.abs(
          q.x * actual.world.rotation.x +
            q.y * actual.world.rotation.y +
            q.z * actual.world.rotation.z +
            q.w * actual.world.rotation.w,
        ),
      ).toBeCloseTo(1, 10);
    }
  },
);

it.each([-0.12, 0, 0.12])(
  'preserves separate leg lengths and bounded knee alignment %f',
  (alignment) => {
    const state = scene(),
      p = state.players[0]!,
      m = defaultBodyMorphology();
    m.left.thigh = 0.225;
    m.left.shank = 0.236;
    m.left.kneeAlignment = alignment;
    m.right.kneeAlignment = -alignment;
    p.bodyMorphology = bodyMorphologySchema.parse(m);
    const body = projectArticulatedBody(state, p)!;
    expect(body).toBeDefined();
    const h = Math.max(1.4, Math.min(2.2, p.profile.heightCm / 100));
    for (const side of ['left', 'right'] as const) {
      const leg = body.geometry[side];
      expect(pointLength(subtractPoint(leg.hip, leg.knee))).toBeCloseTo(h * m[side].thigh, 12);
      expect(pointLength(subtractPoint(leg.knee, leg.ankle))).toBeCloseTo(h * m[side].shank, 12);
      expect(leg.foot).toEqual(p.articulatedStance![side]);
    }
    expect(fullBodySkeletonSchema.safeParse(pose(state)).success).toBe(true);
  },
);

it('varies foot and hand geometry independently without changing boot radius or attributes', () => {
  const state = scene(),
    p = state.players[0]!,
    before = structuredClone(p),
    m = defaultBodyMorphology();
  m.left.footLength = 0.11;
  m.right.footLength = 0.19;
  m.right.footWidth = 0.08;
  m.left.handLength = 0.08;
  m.right.handWidth = 0.065;
  m.left.upperArm = 0.15;
  m.right.forearm = 0.18;
  m.lowerTrunk = 0.14;
  m.upperTrunk = 0.16;
  m.shoulderWidth = 0.32;
  p.bodyMorphology = bodyMorphologySchema.parse(m);
  const s = pose(state);
  expect(s.segments.find((s) => s.id === 'right_foot')!.dimensions.length).toBeGreaterThan(
    s.segments.find((s) => s.id === 'left_foot')!.dimensions.length,
  );
  expect(
    s.proxies.filter((p) => p.collisionAuthority === 'existing_boot').map((p) => p.radius),
  ).toEqual([0.035, 0.035]);
  expect(p.profile).toEqual(before.profile);
  expect(deriveLowerBodyGeometry(p)).toEqual(deriveLowerBodyGeometry(before));
});

it('rejects invalid morphology and keeps explicitly unsupported poses unavailable', () => {
  for (const edit of [
    { left: { ...defaultBodyMorphology().left, thigh: NaN } },
    { left: { ...defaultBodyMorphology().left, kneeAlignment: 0.5 } },
    { headLength: 0.5 },
    { left: { ...defaultBodyMorphology().left, thigh: 0.18 } },
  ])
    expect(bodyMorphologySchema.safeParse({ ...defaultBodyMorphology(), ...edit }).success).toBe(
      false,
    );
  const state = scene(),
    p = state.players[0]!;
  p.articulatedStance!.left = { x: p.position.x + 10, y: p.position.y, z: 0.04 };
  expect(projectArticulatedBody(state, p)).toBeUndefined();
  expect(projectCanonicalPlayerPresentation(state, p).articulatedPoseUnavailable).toBe(true);
});

it('versions native selection, retains compact morphology and removes it on historical rollback', () => {
  const s = scene();
  s.players[0]!.bodyMorphology = defaultBodyMorphology();
  expect(native(s).players[0]!.bodyMorphology).toEqual(s.players[0]!.bodyMorphology);
  expect(pose(native(s))).toEqual(pose(s));
  const orphan = { ...s };
  delete orphan.experimentalFullBodySkeleton;
  expect(tacticalMatchStateSchema.safeParse(orphan).success).toBe(false);
  const old = withoutArticulatedBody(s);
  expect(old.experimentalFullBodySkeleton).toBeUndefined();
  expect(old.players[0]!.bodyMorphology).toBeUndefined();
  const snapshot = captureReplaySnapshot(s, 0);
  expect(snapshot.players.every((p) => !p.fullBodySkeleton)).toBe(true);
  expect(replaySnapshotSchema.parse(snapshot).players[0]!.fullBodyPoseInputs).toBeDefined();
});

describe('ordinary MatchEngine action continuity and native determinism', () => {
  it('reloads the existing off-pitch free-kick run-up target without moving it or relaxing the legal spot', () => {
    let old = JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr225-native-runup-target.json.gz')).toString(),
    ) as TacticalMatchState;
    expect(old.experimentalFullBodySkeleton).toBeUndefined();
    const target = old.restart!.targets.footballer_pro_9_12!;
    expect(target.x).toBeLessThan(0);
    expect(native(old).restart!.targets.footballer_pro_9_12).toEqual(target);
    let candidate = withFullBodySkeleton(native(old));
    for (let i = 0; i < 16; i++) {
      old = stepTacticalMatch(old, 0.025);
      candidate = native(stepTacticalMatch(candidate, 0.025));
      const { experimentalFullBodySkeleton: _edition, ...physical } = candidate;
      void _edition;
      expect(physical).toEqual(native(old));
    }
    const invalid = structuredClone(old);
    invalid.restart!.targets.footballer_pro_9_12 = { x: NaN, y: 10 };
    expect(tacticalMatchStateSchema.safeParse(invalid).success).toBe(false);
    const invalidSpot = structuredClone(old);
    invalidSpot.restart!.spot = { x: -1, y: 10 };
    expect(tacticalMatchStateSchema.safeParse(invalidSpot).success).toBe(false);
  });
  it.each([-0.1, 0.1])(
    'executes movement with authored asymmetry and alignment %f',
    (alignment) => {
      let s = scene();
      const id = s.playerMovementIntent!.actorId,
        p = s.players.find((p) => p.id === id)!,
        m = defaultBodyMorphology();
      m.left.thigh = 0.23;
      m.left.shank = 0.24;
      m.left.kneeAlignment = alignment;
      m.right.kneeAlignment = -alignment;
      s = withFullBodySkeleton(s, { [id]: m });
      s.ball = { x: 90, y: 60, height: 0.11, velocity: { x: 0, y: 0, z: 0 } };
      s.playerMovementIntent = {
        actorId: id,
        type: 'hold_shape',
        target: { x: p.position.x + 0.4, y: p.position.y + 0.6 },
        startedAt: s.time,
        expiresAt: s.time + 2,
      };
      const origin = { ...p.position };
      for (let i = 0; i < 32; i++) {
        s = stepTacticalMatch(s, 0.025);
        expect(s.safetyHalt).toBeUndefined();
        const current = s.players.find((p) => p.id === id)!;
        const body = projectArticulatedBody(s, current)!;
        expect(
          fullBodySkeletonSchema.safeParse(projectFullBodySkeleton(s, current, body)).success,
        ).toBe(true);
      }
      const current = s.players.find((p) => p.id === id)!;
      expect(
        Math.hypot(current.position.x - origin.x, current.position.y - origin.y),
      ).toBeGreaterThan(0.01);
    },
  );
  it('follows the existing ballistic jump and landing without adding arm impulse', () => {
    let s = scene();
    s.ball = { x: 90, y: 60, height: 0.11, velocity: { x: 0, y: 0, z: 0 } };
    const id = s.playerMovementIntent!.actorId,
      p = s.players.find((p) => p.id === id)!;
    p.verticalJump = beginVerticalJump(p, { armAssistance: false, approach: false })!;
    const phases = new Set<string>();
    for (let i = 0; i < 72; i++) {
      s = stepTacticalMatch(s, 0.025);
      expect(s.safetyHalt).toBeUndefined();
      const current = s.players.find((p) => p.id === id)!;
      phases.add(current.verticalJump!.phase);
      const body = projectArticulatedBody(s, current)!;
      expect(
        fullBodySkeletonSchema.safeParse(projectFullBodySkeleton(s, current, body)).success,
      ).toBe(true);
    }
    expect(phases).toEqual(new Set(['preparing', 'airborne', 'recovering', 'ready']));
  });
  it('keeps a coherent full pose through the archived lateral body impact and support continuation', () => {
    const archive = JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr218/full-stance-v2-attempt-1.json.gz'),
      ).toString(),
    );
    let s = withFullBodySkeleton({
      ...archive.failureWindow.find((s: TacticalMatchState) => s.time > 1783.09),
      experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
    });
    let impacts = 0;
    for (let i = 0; i < 40; i++) {
      const before = s.time;
      s = stepTacticalMatch(s, 0.025);
      expect(s.safetyHalt).toBeUndefined();
      impacts += (s.playerBodyContacts ?? []).filter(
        (c) => c.at > before && c.kind === 'impact',
      ).length;
      for (const p of s.players) {
        const body = projectArticulatedBody(s, p)!;
        expect(fullBodySkeletonSchema.safeParse(projectFullBodySkeleton(s, p, body)).success).toBe(
          true,
        );
      }
    }
    expect(impacts).toBeGreaterThan(0);
  });
  it.each(['ordinary', 'weak-foot', 'advance', 'turn', 'miss'] as const)(
    'preserves PR224 physics through %s',
    (name) => {
      let old = selectPr224Body(createPr224PassScene(name).selected),
        s = withFullBodySkeleton(native(old));
      let reload = native(s);
      const stages = new Set<string>();
      for (let i = 0; i < 32; i++) {
        for (const p of s.players) {
          const body = projectArticulatedBody(s, p);
          if (body)
            expect(
              fullBodySkeletonSchema.safeParse(projectFullBodySkeleton(s, p, body)).success,
            ).toBe(true);
        }
        if (s.pendingStrike) stages.add(s.pendingStrike.phase);
        if (s.recoveringFeet?.length) stages.add('recovery');
        old = stepTacticalMatch(old, 0.025);
        s = stepTacticalMatch(s, 0.025);
        reload = native(stepTacticalMatch(reload, 0.025));
        expect(native(s)).toEqual(reload);
        const { experimentalFullBodySkeleton: _skeleton, ...physical } = native(s);
        void _skeleton;
        expect(physical).toEqual(native(old));
        expect(s.safetyHalt).toBeUndefined();
      }
      expect(stages).toEqual(new Set(['preparing', 'swinging', 'recovery']));
      expect(s.lastStrikeResolution?.outcome).toBe(name === 'miss' ? 'miss' : 'contact');
    },
  );
});
