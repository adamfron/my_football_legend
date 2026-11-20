import { z } from 'zod';
import { type ArticulatedBody, effectiveArticulatedFoot } from './articulatedBody';
import { bodyPointSchema, type BodyPoint } from './articulatedBodyState';
import {
  bodyMorphologySchema,
  defaultBodyMorphology,
  fullBodySkeletonEditionSchema,
  type BodyMorphology,
} from './bodyMorphology';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { composedLegContactCapsule } from './composedLegContact';
import { UPRIGHT_OUTFIELD_BALL_BODY } from './ballFlight';
import {
  addPoint,
  subtractPoint,
  pointLength,
  rotatePoint,
  inverseRotation,
  multiplyRotation,
  axisRotation,
  segmentRotation,
  segmentFrameRotation,
  rotationCoordinates,
  relativeTransform,
  composeTransform,
  skeletonTransformSchema,
  type SkeletonTransform,
} from './skeletonTransform';

export const skeletonSegmentIdSchema = z.enum([
  'pelvis',
  'lower_trunk',
  'thorax',
  'neck',
  'head',
  'left_thigh',
  'left_shank',
  'left_foot',
  'right_thigh',
  'right_shank',
  'right_foot',
  'left_girdle',
  'left_upper_arm',
  'left_forearm',
  'left_hand',
  'right_girdle',
  'right_upper_arm',
  'right_forearm',
  'right_hand',
]);
export type SkeletonSegmentId = z.infer<typeof skeletonSegmentIdSchema>;
export const skeletonJointIdSchema = z.enum([
  'lumbar',
  'thoracic',
  'cervical',
  'head_neck',
  'left_hip',
  'left_knee',
  'left_ankle',
  'right_hip',
  'right_knee',
  'right_ankle',
  'left_girdle_attachment',
  'left_shoulder',
  'left_elbow',
  'left_wrist',
  'right_girdle_attachment',
  'right_shoulder',
  'right_elbow',
  'right_wrist',
]);
const authoritySchema = z.enum(['physical_kinematic', 'kinematic']);
const dimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  depth: z.number().positive(),
});
export const skeletonSegmentSchema = z.object({
  id: skeletonSegmentIdSchema,
  parent: skeletonSegmentIdSchema.nullable(),
  joint: skeletonJointIdSchema.nullable(),
  authority: authoritySchema,
  dimensions: dimensionsSchema,
  world: skeletonTransformSchema,
  local: skeletonTransformSchema,
  rest: skeletonTransformSchema,
  end: bodyPointSchema,
});
export const skeletonJointSchema = z.object({
  id: skeletonJointIdSchema,
  parent: skeletonSegmentIdSchema,
  child: skeletonSegmentIdSchema,
  world: skeletonTransformSchema,
  local: skeletonTransformSchema,
  /** Anatomical coordinates; neutral attachment is in the child's rest transform. */
  coordinates: z.object({
    flexion: z.number().finite(),
    abduction: z.number().finite(),
    twist: z.number().finite(),
  }),
  limits: z.object({
    flexion: z.tuple([z.number(), z.number()]),
    abduction: z.tuple([z.number(), z.number()]),
    twist: z.tuple([z.number(), z.number()]),
  }),
  degreesOfFreedom: z.array(z.enum(['flexion', 'abduction', 'twist'])).max(3),
  provisional: z.boolean(),
});
export const skeletonProxySchema = z.object({
  id: z.string(),
  segment: skeletonSegmentIdSchema,
  at: z.number().nonnegative(),
  shape: z.enum(['sphere', 'capsule', 'tapered_capsule', 'box', 'planar_torso_core']),
  world: skeletonTransformSchema,
  from: bodyPointSchema,
  to: bodyPointSchema,
  radius: z.number().positive(),
  distalRadius: z.number().positive().optional(),
  dimensions: dimensionsSchema,
  surfaceVelocity: bodyPointSchema.nullable(),
  velocityEvidence: z.enum([
    'canonical_foot',
    'canonical_root',
    'canonical_event_sampler',
    'not_enabled',
  ]),
  material: z.enum(['boot', 'soft_tissue', 'kit']),
  collisionAuthority: z.enum([
    'existing_boot',
    'existing_composed_leg',
    'existing_torso',
    'inactive',
  ]),
  approximation: z.string(),
});
const footLandmarksSchema = z.object({
  ankle: bodyPointSchema,
  heel: bodyPointSchema,
  sole: bodyPointSchema,
  midfoot: bodyPointSchema,
  forefoot: bodyPointSchema,
  bootContact: bodyPointSchema,
});
export const fullBodyPoseInputsSchema = z.object({
  version: fullBodySkeletonEditionSchema,
  at: z.number().nonnegative(),
  morphology: bodyMorphologySchema.optional(),
  velocity: bodyPointSchema,
  bootVelocities: z.object({ left: bodyPointSchema, right: bodyPointSchema }),
  cues: z.object({
    preparation: z.number().min(0).max(1),
    recovery: z.number().min(0).max(1),
    impact: z.number().min(0).max(1),
  }),
  composedContacts: z.boolean(),
});
export type FullBodyPoseInputs = z.infer<typeof fullBodyPoseInputsSchema>;
const poseShape = z.object({
  version: fullBodySkeletonEditionSchema,
  at: z.number().nonnegative(),
  root: skeletonTransformSchema,
  morphology: bodyMorphologySchema,
  segments: z.array(skeletonSegmentSchema).length(19),
  joints: z.array(skeletonJointSchema).length(18),
  proxies: z.array(skeletonProxySchema).max(24),
  feet: z.object({ left: footLandmarksSchema, right: footLandmarksSchema }),
  support: z.enum(['left', 'right']).nullable(),
});
export type FullBodySkeleton = z.infer<typeof poseShape>;
export const SKELETON_PARENTS: Record<SkeletonSegmentId, SkeletonSegmentId | null> = {
  pelvis: null,
  lower_trunk: 'pelvis',
  thorax: 'lower_trunk',
  neck: 'thorax',
  head: 'neck',
  left_thigh: 'pelvis',
  left_shank: 'left_thigh',
  left_foot: 'left_shank',
  right_thigh: 'pelvis',
  right_shank: 'right_thigh',
  right_foot: 'right_shank',
  left_girdle: 'thorax',
  left_upper_arm: 'left_girdle',
  left_forearm: 'left_upper_arm',
  left_hand: 'left_forearm',
  right_girdle: 'thorax',
  right_upper_arm: 'right_girdle',
  right_forearm: 'right_upper_arm',
  right_hand: 'right_forearm',
};
const jointFor = (id: SkeletonSegmentId): z.infer<typeof skeletonJointIdSchema> | null => {
  if (id === 'pelvis') return null;
  if (id === 'lower_trunk') return 'lumbar';
  if (id === 'thorax') return 'thoracic';
  if (id === 'neck') return 'cervical';
  if (id === 'head') return 'head_neck';
  return id
    .replace('_thigh', '_hip')
    .replace('_shank', '_knee')
    .replace('_foot', '_ankle')
    .replace('_girdle', '_girdle_attachment')
    .replace('_upper_arm', '_shoulder')
    .replace('_forearm', '_elbow')
    .replace('_hand', '_wrist') as z.infer<typeof skeletonJointIdSchema>;
};

/** Cross-field structural validation is also used by native replay parsing. */
export const fullBodySkeletonSchema = poseShape.superRefine((pose, ctx) => {
  const byId = new Map(pose.segments.map((s) => [s.id, s]));
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (byId.size !== 19 || new Set(pose.joints.map((j) => j.id)).size !== 18)
    fail('Duplicate skeletal identity');
  for (const s of pose.segments) {
    if (s.parent !== SKELETON_PARENTS[s.id] || s.joint !== jointFor(s.id))
      fail('Invalid semantic hierarchy');
    const parent = s.parent ? byId.get(s.parent)?.world : pose.root;
    if (!parent) {
      fail('Missing skeletal parent');
      continue;
    }
    const composed = composeTransform(parent, s.local);
    if (
      pointLength(subtractPoint(composed.position, s.world.position)) > 1e-9 ||
      Math.abs(
        Math.abs(
          Object.keys(composed.rotation).reduce(
            (v, k) => v + composed.rotation[k as 'x'] * s.world.rotation[k as 'x'],
            0,
          ),
        ) - 1,
      ) > 1e-9
    )
      fail('Inconsistent parent/child transform');
    if (
      !s.id.endsWith('_foot') &&
      Math.abs(pointLength(subtractPoint(s.end, s.world.position)) - s.dimensions.length) > 1e-9
    )
      fail('Segment length changed');
  }
  for (const j of pose.joints) {
    const child = byId.get(j.child);
    if (!child || child.joint !== j.id || child.parent !== j.parent) {
      fail('Invalid articulation');
      continue;
    }
    if (pointLength(subtractPoint(j.world.position, child.world.position)) > 1e-9)
      fail('Detached articulation');
    const hinge = j.degreesOfFreedom.length === 1;
    const expected = hinge
      ? axisRotation('x', -j.coordinates.flexion)
      : multiplyRotation(
          multiplyRotation(
            axisRotation('x', j.coordinates.flexion),
            axisRotation('y', j.coordinates.abduction),
          ),
          axisRotation('z', j.coordinates.twist),
        );
    const actual = multiplyRotation(inverseRotation(child.rest.rotation), j.local.rotation);
    if (
      Math.abs(
        Math.abs(
          actual.x * expected.x +
            actual.y * expected.y +
            actual.z * expected.z +
            actual.w * expected.w,
        ) - 1,
      ) > 1e-8
    )
      fail('Articulation violates its declared degrees of freedom');
    for (const axis of ['flexion', 'abduction', 'twist'] as const)
      if (
        j.coordinates[axis] < j.limits[axis][0] - 1e-10 ||
        j.coordinates[axis] > j.limits[axis][1] + 1e-10
      )
        fail('Joint limit violated');
  }
  for (const p of pose.proxies) {
    if (p.at !== pose.at || !byId.has(p.segment)) fail('Stale or orphan contact proxy');
    if (
      (p.segment.includes('arm') ||
        p.segment.includes('hand') ||
        ['head', 'neck'].includes(p.segment)) &&
      p.collisionAuthority !== 'inactive'
    )
      fail('Unsupported upper-body collider');
  }
});

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const zero = (): BodyPoint => ({ x: 0, y: 0, z: 0 });
const DEFAULT_MORPHOLOGY = defaultBodyMorphology();
Object.freeze(DEFAULT_MORPHOLOGY.left);
Object.freeze(DEFAULT_MORPHOLOGY.right);
Object.freeze(DEFAULT_MORPHOLOGY);

/** One derived pose. No root integration, RNG, ball impulse or new football action. */
export const composeFullBodySkeleton = (
  body: ArticulatedBody,
  player: Pick<MatchPlayerState, 'velocity' | 'bodyMorphology'>,
  cues: { preparation: number; recovery: number; impact: number },
  bootVelocities: Record<'left' | 'right', BodyPoint>,
  composedContacts: boolean,
): FullBodySkeleton => {
  const m = player.bodyMorphology ?? DEFAULT_MORPHOLOGY,
    h = body.height;
  const root: SkeletonTransform = {
    position: body.root,
    rotation: axisRotation('z', -body.facing),
  };
  const segments: FullBodySkeleton['segments'] = [],
    joints: FullBodySkeleton['joints'] = [],
    proxies: FullBodySkeleton['proxies'] = [];
  const byId = new Map<SkeletonSegmentId, FullBodySkeleton['segments'][number]>();
  const localPoint = (p: BodyPoint) =>
    addPoint(body.geometry.pelvis, rotatePoint(root.rotation, p));
  const insert = (
    id: SkeletonSegmentId,
    from: BodyPoint,
    to: BodyPoint,
    width: number,
    depth: number,
    restFrom: BodyPoint,
    restTo: BodyPoint,
    coordinates = { flexion: 0, abduction: 0, twist: 0 },
    frame?: SkeletonTransform['rotation'],
  ) => {
    const parent = SKELETON_PARENTS[id],
      joint = jointFor(id);
    const reference =
      id === 'pelvis'
        ? axisRotation(
            'z',
            Math.atan2(
              body.geometry.right.hip.y - body.geometry.left.hip.y,
              body.geometry.right.hip.x - body.geometry.left.hip.x,
            ),
          )
        : id.endsWith('_foot')
          ? axisRotation('z', -body.bootYaw[id.startsWith('left') ? 'left' : 'right'])
          : root.rotation;
    const oriented = (a: BodyPoint, b: BodyPoint, rotation: typeof root.rotation) =>
      multiplyRotation(
        rotation,
        segmentRotation(zero(), rotatePoint(inverseRotation(rotation), subtractPoint(b, a))),
      );
    const world = { position: from, rotation: frame ?? oriented(from, to, reference) };
    const parentWorld = parent ? byId.get(parent)!.world : root;
    const restWorld = { position: restFrom, rotation: oriented(restFrom, restTo, root.rotation) };
    const parentRest = parent ? restWorlds.get(parent)! : root;
    const segment = {
      id,
      parent,
      joint,
      authority: (id.includes('thigh') ||
      id.includes('shank') ||
      id.includes('foot') ||
      id === 'pelvis'
        ? 'physical_kinematic'
        : 'kinematic') as z.infer<typeof authoritySchema>,
      world,
      local: relativeTransform(parentWorld, world),
      rest: relativeTransform(parentRest, restWorld),
      dimensions: { length: pointLength(subtractPoint(to, from)), width, depth },
      end: to,
    };
    segments.push(segment);
    byId.set(id, segment);
    restWorlds.set(id, restWorld);
    if (parent && joint) {
      const knee = id.endsWith('_shank'),
        elbow = id.endsWith('_forearm');
      const limits = {
        flexion: (knee || elbow ? [0, Math.PI] : [-Math.PI, Math.PI]) as [number, number],
        abduction: (knee || elbow ? [0, 0] : [-Math.PI, Math.PI]) as [number, number],
        twist: (knee || elbow ? [0, 0] : [-Math.PI, Math.PI]) as [number, number],
      };
      joints.push({
        id: joint,
        parent,
        child: id,
        world,
        local: segment.local,
        coordinates:
          knee || elbow
            ? coordinates
            : rotationCoordinates(
                multiplyRotation(inverseRotation(segment.rest.rotation), segment.local.rotation),
              ),
        limits,
        degreesOfFreedom: knee || elbow ? ['flexion'] : ['flexion', 'abduction', 'twist'],
        provisional: !knee,
      });
    }
    return segment;
  };
  const restWorlds = new Map<SkeletonSegmentId, SkeletonTransform>();
  const hingeNormal = (a: BodyPoint, b: BodyPoint, c: BodyPoint) => {
    const u = subtractPoint(b, a),
      v = subtractPoint(c, b);
    const n = { x: v.y * u.z - v.z * u.y, y: v.z * u.x - v.x * u.z, z: v.x * u.y - v.y * u.x };
    return pointLength(n) > 1e-10 ? n : rotatePoint(root.rotation, { x: 1, y: 0, z: 0 });
  };
  const point = (x: number, y: number, z: number) => localPoint({ x, y, z });
  const pelvis = body.geometry.pelvis;
  insert(
    'pelvis',
    pelvis,
    point(0, 0, h * 0.05),
    h * m.pelvisWidth,
    h * 0.12,
    pelvis,
    point(0, 0, h * 0.05),
  );
  const speed = Math.hypot(player.velocity.x, player.velocity.y),
    turn = clamp(body.angularVelocity * 0.03, -0.12, 0.12);
  const lean = clamp(speed * 0.008 + cues.preparation * 0.045 - cues.impact * 0.035, -0.08, 0.12);
  const spineStep = (from: BodyPoint, length: number, pitch: number, yaw = 0) =>
    addPoint(
      from,
      rotatePoint(axisRotation('z', -body.facing + yaw), {
        x: 0,
        y: Math.sin(pitch) * length,
        z: Math.cos(pitch) * length,
      }),
    );
  const lumbar = pelvis,
    thoracic = spineStep(lumbar, h * m.lowerTrunk, lean),
    cervical = spineStep(thoracic, h * m.upperTrunk, lean, turn),
    headNeck = spineStep(cervical, h * m.neck, lean * 0.5),
    headEnd = spineStep(headNeck, h * m.headLength, lean * 0.25);
  const restThoracic = point(0, 0, h * m.lowerTrunk),
    restCervical = point(0, 0, h * (m.lowerTrunk + m.upperTrunk)),
    restHead = point(0, 0, h * (m.lowerTrunk + m.upperTrunk + m.neck));
  insert('lower_trunk', lumbar, thoracic, h * m.pelvisWidth, h * 0.14, pelvis, restThoracic, {
    flexion: lean,
    abduction: 0,
    twist: 0,
  });
  insert('thorax', thoracic, cervical, h * m.shoulderWidth, h * 0.16, restThoracic, restCervical, {
    flexion: 0,
    abduction: 0,
    twist: turn,
  });
  insert('neck', cervical, headNeck, h * 0.07, h * 0.07, restCervical, restHead);
  insert(
    'head',
    headNeck,
    headEnd,
    h * m.headWidth,
    h * m.headWidth,
    restHead,
    point(0, 0, h * (m.lowerTrunk + m.upperTrunk + m.neck + m.headLength)),
  );
  const feet = {} as FullBodySkeleton['feet'];
  for (const side of ['left', 'right'] as const) {
    const l = body.geometry[side],
      dim = m[side],
      sign = side === 'left' ? -1 : 1;
    const restHip = point((sign * h * m.pelvisWidth) / 2, 0, 0),
      restKnee = addPoint(restHip, { x: 0, y: 0, z: -l.thighLength }),
      restAnkle = addPoint(restKnee, { x: 0, y: 0, z: -l.shinLength });
    const kneeAxis = hingeNormal(l.hip, l.knee, l.ankle);
    insert(
      `${side}_thigh`,
      l.hip,
      l.knee,
      h * 0.11,
      h * 0.11,
      restHip,
      restKnee,
      undefined,
      segmentFrameRotation(l.hip, l.knee, kneeAxis),
    );
    insert(
      `${side}_shank`,
      l.knee,
      l.ankle,
      h * 0.074,
      h * 0.074,
      restKnee,
      restAnkle,
      {
        flexion: l.kneeFlexion,
        abduction: 0,
        twist: 0,
      },
      segmentFrameRotation(l.knee, l.ankle, kneeAxis),
    );
    const yaw = axisRotation('z', -body.bootYaw[side]);
    const footPoint = (forward: number, z = 0) =>
      addPoint(l.foot, rotatePoint(yaw, { x: 0, y: forward, z }));
    const length = h * dim.footLength;
    const foot = insert(
      `${side}_foot`,
      l.ankle,
      footPoint(length * 0.65),
      h * dim.footWidth,
      h * 0.055,
      restAnkle,
      addPoint(restAnkle, rotatePoint(root.rotation, { x: 0, y: length * 0.65, z: -0.035 })),
    );
    foot.dimensions.length = length;
    feet[side] = {
      ankle: l.ankle,
      heel: footPoint(-length * 0.35),
      sole: footPoint(0, -0.035),
      midfoot: l.foot,
      forefoot: footPoint(length * 0.45),
      bootContact: l.foot,
    };
    const shoulder = addPoint(
      cervical,
      rotatePoint(axisRotation('z', -body.facing + turn), {
        x: (sign * h * m.shoulderWidth) / 2,
        y: 0,
        z: 0,
      }),
    );
    const restShoulder = addPoint(
      restCervical,
      rotatePoint(root.rotation, { x: (sign * h * m.shoulderWidth) / 2, y: 0, z: 0 }),
    );
    insert(`${side}_girdle`, cervical, shoulder, h * 0.04, h * 0.04, restCervical, restShoulder);
    // Gait phase is read from actual foot displacement, never an independent clock.
    const relative = rotatePoint(axisRotation('z', body.facing), subtractPoint(l.foot, pelvis));
    const swing = clamp(
      -relative.y * 1.5 * (Math.min(speed, 8) / 8) + turn * sign + cues.preparation * sign * 0.12,
      -0.65,
      0.65,
    );
    const spread =
      0.1 + cues.impact * 0.12 + (body.support === null ? 0.1 : 0) + cues.recovery * 0.03;
    const elbow = clamp(0.15 + speed * 0.045 + cues.preparation * 0.12, 0, 0.8);
    const armStep = (from: BodyPoint, length: number, angle: number) =>
      addPoint(
        from,
        rotatePoint(root.rotation, {
          x: sign * Math.sin(spread) * length,
          y: Math.sin(angle) * Math.cos(spread) * length,
          z: -Math.cos(angle) * Math.cos(spread) * length,
        }),
      );
    const e = armStep(shoulder, h * dim.upperArm, swing),
      w = armStep(e, h * dim.forearm, swing + elbow),
      handEnd = armStep(w, h * dim.handLength, swing + elbow);
    const re = addPoint(restShoulder, { x: 0, y: 0, z: -h * dim.upperArm }),
      rw = addPoint(re, { x: 0, y: 0, z: -h * dim.forearm });
    const elbowAxis = hingeNormal(shoulder, e, w);
    const a = subtractPoint(e, shoulder),
      b = subtractPoint(w, e);
    const elbowFlexion = Math.acos(
      clamp((a.x * b.x + a.y * b.y + a.z * b.z) / (pointLength(a) * pointLength(b)), -1, 1),
    );
    insert(
      `${side}_upper_arm`,
      shoulder,
      e,
      h * 0.075,
      h * 0.075,
      restShoulder,
      re,
      {
        flexion: swing,
        abduction: sign * spread,
        twist: 0,
      },
      segmentFrameRotation(shoulder, e, elbowAxis),
    );
    insert(
      `${side}_forearm`,
      e,
      w,
      h * 0.06,
      h * 0.06,
      re,
      rw,
      {
        flexion: elbowFlexion,
        abduction: 0,
        twist: 0,
      },
      segmentFrameRotation(e, w, elbowAxis),
    );
    insert(
      `${side}_hand`,
      w,
      handEnd,
      h * dim.handWidth,
      h * 0.025,
      rw,
      addPoint(rw, { x: 0, y: 0, z: -h * dim.handLength }),
      undefined,
      segmentFrameRotation(w, handEnd, elbowAxis),
    );
  }
  const proxy = (
    segment: SkeletonSegmentId,
    shape: FullBodySkeleton['proxies'][number]['shape'],
    from: BodyPoint,
    to: BodyPoint,
    radius: number,
    collisionAuthority: FullBodySkeleton['proxies'][number]['collisionAuthority'],
    velocity: BodyPoint | null,
    approximation: string,
    distalRadius?: number,
  ) => {
    const s = byId.get(segment)!;
    proxies.push({
      id: `${segment}:${shape}:${collisionAuthority}`,
      segment,
      at: body.at,
      shape,
      world: {
        position: from,
        rotation:
          shape === 'capsule' || shape === 'tapered_capsule'
            ? segmentRotation(from, to)
            : root.rotation,
      },
      from,
      to,
      radius,
      dimensions: s.dimensions,
      surfaceVelocity: velocity,
      velocityEvidence:
        collisionAuthority === 'existing_boot'
          ? 'canonical_foot'
          : collisionAuthority === 'existing_torso'
            ? 'canonical_root'
            : collisionAuthority === 'existing_composed_leg'
              ? 'canonical_event_sampler'
              : 'not_enabled',
      material: segment.endsWith('_foot') ? 'boot' : 'soft_tissue',
      collisionAuthority,
      approximation,
      ...(distalRadius ? { distalRadius } : {}),
    });
  };
  for (const s of segments) {
    if (s.id.endsWith('_foot')) {
      const side = s.id.startsWith('left') ? 'left' : 'right';
      proxy(
        s.id,
        'sphere',
        feet[side].bootContact,
        feet[side].bootContact,
        body.bootRadius,
        'existing_boot',
        bootVelocities[side],
        'Existing 0.035m effective patch; anatomical foot dimensions do not enlarge it',
      );
    } else if (s.id.endsWith('_thigh') || s.id.endsWith('_shank')) {
      const shank = s.id.endsWith('_shank');
      const capsule = composedLegContactCapsule(
        body.geometry,
        body.geometry.capsules.findIndex((c) => c.region === s.id.replace('_shank', '_shin')),
      );
      proxy(
        s.id,
        shank ? 'tapered_capsule' : 'capsule',
        capsule.from,
        capsule.to,
        capsule.radius,
        composedContacts ? 'existing_composed_leg' : 'inactive',
        null,
        'PR224 swept surface; event-time velocity remains owned by the existing contact search',
        shank ? capsule.distalRadius : undefined,
      );
    } else if (s.id === 'pelvis') {
      const from = { ...body.root, z: 0 };
      proxy(
        s.id,
        'planar_torso_core',
        from,
        from,
        0.34,
        'existing_torso',
        { ...player.velocity, z: 0 },
        'Existing upright planar player-player core; no bounded 3D anatomy error claim',
      );
    } else if (s.id === 'thorax') {
      const center = body.root.z + h * UPRIGHT_OUTFIELD_BALL_BODY.centreHeightRatio;
      proxy(
        s.id,
        'capsule',
        { ...body.root, z: center - h * UPRIGHT_OUTFIELD_BALL_BODY.halfHeightRatio },
        { ...body.root, z: center + h * UPRIGHT_OUTFIELD_BALL_BODY.halfHeightRatio },
        UPRIGHT_OUTFIELD_BALL_BODY.radius,
        'existing_torso',
        { ...player.velocity, z: 0 },
        'Existing upright ball-torso envelope tied to the physical root; upper-body articulation supplies no new collider',
      );
    } else if (s.id === 'head') {
      const center = {
        x: (s.world.position.x + s.end.x) / 2,
        y: (s.world.position.y + s.end.y) / 2,
        z: (s.world.position.z + s.end.z) / 2,
      };
      proxy(
        s.id,
        'sphere',
        center,
        center,
        Math.max(s.dimensions.length, s.dimensions.width, s.dimensions.depth) / 2,
        'inactive',
        null,
        'Conservative head sphere centered on the canonical head segment; geometry only',
      );
    } else
      proxy(
        s.id,
        'capsule',
        s.world.position,
        s.end,
        s.dimensions.width / 2,
        'inactive',
        null,
        'Geometry only; no physical contact mechanism enabled',
      );
  }
  return {
    version: 'full-body-skeleton-dev-v1',
    at: body.at,
    root,
    morphology: m,
    segments,
    joints,
    proxies,
    feet,
    support: body.support,
  };
};

/** Explicit selection preserves every existing D/E switch. Static morphology is
 * authored by canonical player id, never generated from football attributes. */
export const withFullBodySkeleton = (
  state: TacticalMatchState,
  morphologies: Readonly<Record<string, BodyMorphology>> = {},
): TacticalMatchState => {
  if (!state.experimentalArticulatedBody || state.integrationProfile)
    throw Error('Full skeleton requires unprofiled articulated v2');
  for (const [id, m] of Object.entries(morphologies)) {
    if (!state.players.some((p) => p.id === id)) throw Error(`Unknown morphological player ${id}`);
    bodyMorphologySchema.parse(m);
  }
  return {
    ...state,
    experimentalFullBodySkeleton: 'full-body-skeleton-dev-v1',
    players: state.players.map((p) =>
      morphologies[p.id]
        ? { ...p, bodyMorphology: bodyMorphologySchema.parse(morphologies[p.id]) }
        : p,
    ),
  };
};

export const projectFullBodyPoseInputs = (
  state: TacticalMatchState,
  player: MatchPlayerState,
): FullBodyPoseInputs | undefined => {
  if (!state.experimentalFullBodySkeleton) return;
  const pending = state.pendingStrike?.actorId === player.id ? state.pendingStrike : undefined;
  const recovery = state.recoveringFeet?.find((f) => f.actorId === player.id);
  const impact = state.playerBodyContacts
    ?.filter((c) => c.kind === 'impact' && c.participants.includes(player.id))
    .at(-1);
  const velocities = { left: zero(), right: zero() };
  for (const side of ['left', 'right'] as const)
    velocities[side] = effectiveArticulatedFoot(
      state,
      player,
      player,
      side,
      state.time,
      0.025,
      0,
    ).velocity;
  return {
    version: 'full-body-skeleton-dev-v1',
    ...(player.bodyMorphology ? { morphology: player.bodyMorphology } : {}),
    at: state.time,
    velocity: { ...player.velocity, z: 0 },
    bootVelocities: velocities,
    cues: {
      preparation: pending
        ? clamp((state.time - pending.selectedAt) / Math.max(0.025, pending.path.onset), 0, 1)
        : 0,
      recovery: recovery ? clamp(1 - (state.time - recovery.beganAt) / recovery.seconds, 0, 1) : 0,
      impact: Math.max(
        impact ? clamp(1 - (state.time - impact.at) / 0.6, 0, 1) : 0,
        (1 - (player.plantBalance?.balance ?? 1)) * 0.5,
      ),
    },
    composedContacts: !!state.experimentalComposedLegContact,
  };
};

export const restoreFullBodySkeleton = (body: ArticulatedBody, inputs: FullBodyPoseInputs) => {
  if (body.at !== inputs.at)
    throw Error('Full-body replay inputs belong to a different canonical sample');
  return composeFullBodySkeleton(
    body,
    { velocity: inputs.velocity, bodyMorphology: inputs.morphology },
    inputs.cues,
    inputs.bootVelocities,
    inputs.composedContacts,
  );
};

export const projectFullBodySkeleton = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  body: ArticulatedBody,
): FullBodySkeleton | undefined => {
  const inputs = projectFullBodyPoseInputs(state, player);
  return inputs && restoreFullBodySkeleton(body, inputs);
};
