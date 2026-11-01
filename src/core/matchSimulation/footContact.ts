import { z } from 'zod';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { physicalPointSchema, distance } from './matchSpace';
import { ballSpinSchema } from './ballPhysics';
import { deriveFitnessPhysicalModifiers } from './matchFitness';
import { relativeTemporalFootAt } from './temporalFootTrajectory';

export const footSurfaceSchema = z.enum([
  'inside',
  'outside',
  'instep',
  'sole',
  'cushion',
  'protection',
]);
export type FootSurface = z.infer<typeof footSurfaceSchema>;
const vector = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
export const footContactExecutionSchema = z.object({
  intended: footSurfaceSchema,
  executed: footSurfaceSchema.nullable(),
  foot: z.enum(['left', 'right']),
  available: z.boolean(),
  unavailableReason: z
    .enum(['out_of_reach', 'height', 'support', 'preparation', 'continuous_contact'])
    .nullable(),
  at: z.number().nonnegative(),
  point: vector,
  surfacePoint: vector,
  relativePoint: vector,
  normal: vector,
  incomingVelocity: vector,
  outgoingVelocity: vector,
  incomingSpin: ballSpinSchema,
  outgoingSpin: ballSpinSchema,
  impulse: vector,
  normalImpulseLimit: z.number().nonnegative(),
  tangentImpulseLimit: z.number().nonnegative(),
  tangentSpeed: z.number().nonnegative(),
  quality: z.number().min(0).max(1),
  balance: z.number().min(0).max(1),
  preparationSeconds: z.number().nonnegative(),
  contactSeconds: z.number().positive(),
  retained: z.boolean(),
  recoverySeconds: z.number().nonnegative(),
});
export type FootContactExecution = z.infer<typeof footContactExecutionSchema>;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
type V = z.infer<typeof vector>;
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: V): V => {
  const d = Math.max(1e-9, Math.hypot(v.x, v.y, v.z));
  return { x: v.x / d, y: v.y / d, z: v.z / d };
};
const zero = (): V => ({ x: 0, y: 0, z: 0 });
export const FOOT_CONTACT_PHYSICS = {
  mass: 0.43,
  radius: 0.11,
  inertia: (2 / 3) * 0.43 * 0.11 ** 2,
} as const;

/** Shared finite foot envelope, in metres. This does not solve independent articulated limbs. */
export const playerFootGeometry = (actor: MatchPlayerState) => {
  const forward = { x: Math.sin(actor.facingAngle), y: Math.cos(actor.facingAngle) };
  const right = { x: forward.y, y: -forward.x };
  const foot = (side: number) => ({
    x: actor.position.x + forward.x * 0.2 + right.x * side * 0.17,
    y: actor.position.y + forward.y * 0.2 + right.y * side * 0.17,
  });
  const articulated = actor.lowerBodyPose ? deriveLowerBodyGeometry(actor) : undefined;
  return {
    leftFoot: articulated ? { x: articulated.left.foot.x, y: articulated.left.foot.y } : foot(-1),
    rightFoot: articulated ? { x: articulated.right.foot.x, y: articulated.right.foot.y } : foot(1),
    footReach: 0.82,
    torso: actor.position,
    torsoRadius: 0.34,
    headHeight: 1.65,
  };
};

export const chooseContactFoot = (
  actor: MatchPlayerState,
  point: { x: number; y: number },
  required?: 'left' | 'right',
): 'left' | 'right' => {
  if (required) return required;
  const g = playerFootGeometry(actor),
    left = distance(g.leftFoot, point),
    right = distance(g.rightFoot, point);
  return Math.abs(left - right) < 1e-9
    ? actor.profile.dominantFoot
    : left < right
      ? 'left'
      : 'right';
};

/** Bounded local execution choice; tactical policy still chooses the football objective. */
export const selectFootSurface = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  wanted: { x: number; y: number },
  foot: 'left' | 'right',
): FootSurface => {
  const intent =
    state.ballCarrierIntent?.actorId === actor.id ? state.ballCarrierIntent : undefined;
  if (intent?.contactSurface) return intent.contactSurface;
  const forward = { x: Math.sin(actor.facingAngle), y: Math.cos(actor.facingAngle) };
  const along = wanted.x * forward.x + wanted.y * forward.y;
  const side = (wanted.x * forward.y - wanted.y * forward.x) * (foot === 'right' ? 1 : -1);
  if (intent?.executionMode === 'shield') return 'protection';
  if (
    along < -0.45 &&
    Math.hypot(actor.velocity.x, actor.velocity.y) < 4 &&
    (state.ball.height ?? 0) < 0.24
  )
    return 'sole';
  if (intent?.executionMode === 'burst' && along > 0.65) return 'instep';
  const v = state.ball.velocity;
  if (!intent && Math.hypot((v?.x ?? 0) - actor.velocity.x, (v?.y ?? 0) - actor.velocity.y) > 6)
    return 'cushion';
  return side > 0.12 ? 'outside' : 'inside';
};

/** Active strike is a moving effective foot, not a requested ball-speed override.
 * Only contact-v1 releases supply it. Legacy touches retain their original contract. */
export const activeFootStrikeSchema = z.object({
  normal: vector.refine((v) => Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-6),
  footVelocity: vector,
});

export const footContactRequestSchema = z.object({
  intended: footSurfaceSchema,
  foot: z.enum(['left', 'right']).optional(),
  desiredVelocity: vector,
  balance: z.number().min(0).max(1).default(1),
  preparationSeconds: z.number().nonnegative().default(0.2),
  contactSeconds: z.number().positive().max(0.2).default(0.06),
  pressure: z.number().min(0).max(1).default(0),
  contactQuality: z.number().min(0).max(1).optional(),
  activeStrike: activeFootStrikeSchema.optional(),
});
export type FootContactRequest = z.infer<typeof footContactRequestSchema>;

/** Engineering capability, not calibrated physiology. Independent of the requested launch.
 * Coordination and preparation mediate strength; low technical skill does not gate a strike. */
export const activeStrikeCapability = (
  actor: MatchPlayerState,
  foot: 'left' | 'right',
  balance: number,
  preparationSeconds: number,
) => {
  const a = actor.profile.attributes;
  const fitness = deriveFitnessPhysicalModifiers(actor);
  const weak =
    foot === actor.profile.dominantFoot ? 0 : 1 - actor.profile.weakFootProficiency / 100;
  const preparation = clamp(preparationSeconds / (0.12 + (1 - a.agility / 100) * 0.1));
  return {
    effectiveMass: 1.5 + a.strength * 0.012,
    restitution: 0.55,
    maximumFootSpeed:
      (21 + a.strength * 0.035 + a.technique * 0.015 + a.agility * 0.01) *
      (0.7 + 0.3 * balance) *
      (0.65 + 0.35 * preparation) *
      (1 - weak * 0.15) *
      (1 - fitness.bodyControlImpairment * 0.3),
  };
};

/** Active normal impulse plus Coulomb-limited tangential impulse at r=-R*n.
 * Tangent slip includes omega cross r; translation and rotation receive the SAME impulse.
 * Sole normal load is a bounded downward press. No spin reset, attachment or position correction.
 * Coefficients are engineering approximations awaiting PR186 calibration, not fitted physiology.
 */
export const isContinuousFootContact = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  foot: 'left' | 'right',
) => {
  if (
    !state.experimentalPlayerBodyImpulse ||
    !state.continuousFootContacts?.some((c) => c.actorId === actor.id && c.foot === foot)
  )
    return false;
  const centre = {
    ...playerFootGeometry(actor)[foot === 'left' ? 'leftFoot' : 'rightFoot'],
    z: actor.lowerBodyPose ? deriveLowerBodyGeometry(actor)[foot].foot.z : 0.04,
  };
  const prepared = state.continuousFootContacts?.find(
    (c) => c.actorId === actor.id && c.foot === foot,
  )?.prepared;
  if (prepared) {
    const { relative } = relativeTemporalFootAt(prepared.path, state.time - prepared.selectedAt);
    const angle = actor.facingAngle - prepared.facingAngle;
    centre.x += relative.x * Math.cos(angle) + relative.y * Math.sin(angle);
    centre.y += -relative.x * Math.sin(angle) + relative.y * Math.cos(angle);
    centre.z += relative.z;
  }
  return (
    Math.hypot(
      centre.x - state.ball.x,
      centre.y - state.ball.y,
      centre.z - (state.ball.height ?? 0.11),
    ) <= 0.155
  );
};

export const retainContinuousFootContacts = (state: TacticalMatchState) =>
  (state.continuousFootContacts ?? []).filter((c) => {
    const actor = state.players.find((p) => p.id === c.actorId);
    return actor && isContinuousFootContact(state, actor, c.foot);
  });

export const executeFootContact = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  request: FootContactRequest,
): FootContactExecution => {
  const { intended, balance, preparationSeconds, contactSeconds, pressure } = request;
  const foot = chooseContactFoot(actor, state.ball, request.foot),
    geometry = playerFootGeometry(actor);
  const centre = geometry[foot === 'left' ? 'leftFoot' : 'rightFoot'];
  const height = request.activeStrike
    ? Math.max(0.11, state.ball.height ?? 0.11)
    : (state.ball.height ?? 0.11);
  const incomingVelocity = {
    x: state.ball.velocity?.x ?? 0,
    y: state.ball.velocity?.y ?? 0,
    z: state.ball.velocity?.z ?? 0,
  };
  const incomingSpin = { ...(state.ball.spin ?? zero()) };
  const fitness = deriveFitnessPhysicalModifiers(actor),
    a = actor.profile.attributes;
  const weak =
    foot === actor.profile.dominantFoot ? 0 : 1 - actor.profile.weakFootProficiency / 100;
  const skill =
    (a.technique * 0.42 + a.dribbling * 0.3 + a.firstTouch * 0.14 + a.agility * 0.14) / 100;
  const preparation = clamp(preparationSeconds / (0.08 + (1 - skill) * 0.16 + weak * 0.08));
  const surfaceQuality = clamp(
    (0.55 + skill * 0.43) *
      (0.65 + balance * 0.35) *
      (1 - weak * 0.22) *
      (0.75 + preparation * 0.25) *
      (1 - pressure * 0.2) *
      (1 - fitness.bodyControlImpairment * 0.3),
  );
  const forward = { x: Math.sin(actor.facingAngle), y: Math.cos(actor.facingAngle), z: 0 };
  const quality = surfaceQuality * (request.contactQuality ?? 1);
  const side = (foot === 'right' ? 1 : -1) * (intended === 'outside' ? 1 : -1);
  let normal: V =
    intended === 'sole'
      ? { x: 0, y: 0, z: -1 }
      : intended === 'cushion'
        ? unit({
            x: actor.velocity.x - incomingVelocity.x,
            y: actor.velocity.y - incomingVelocity.y,
            z: -incomingVelocity.z,
          })
        : intended === 'protection'
          ? unit({
              x: request.desiredVelocity.x - incomingVelocity.x,
              y: request.desiredVelocity.y - incomingVelocity.y,
              z: 0,
            })
          : unit({
              x: forward.x + (intended === 'instep' ? 0 : forward.y * side * 0.9),
              y: forward.y - (intended === 'instep' ? 0 : forward.x * side * 0.9),
              z: 0,
            });
  if (Math.hypot(normal.x, normal.y, normal.z) < 1e-8) normal = { ...forward };
  if (['inside', 'outside', 'instep'].includes(intended)) {
    // The ankle can present its chosen surface within a finite preparation-dependent arc.
    // Body orientation still constrains laces much more than a lateral inside/outside touch.
    const forceAngle = Math.atan2(
      request.desiredVelocity.y - incomingVelocity.y,
      request.desiredVelocity.x - incomingVelocity.x,
    );
    const nominal = Math.atan2(normal.y, normal.x);
    const delta = Math.atan2(Math.sin(forceAngle - nominal), Math.cos(forceAngle - nominal));
    const arc = (intended === 'instep' ? 0.5 : 2.8) * (0.55 + preparation * 0.45);
    // Finite surface curvature changes the effective normal at the presented patch.
    // An outside contact is more oblique than the flatter inside face, even after ankle setup.
    const attack =
      (intended === 'instep' ? 0 : side * (intended === 'outside' ? 0.075 : 0.035)) *
      (1 - skill * 0.65);
    const angle = nominal + clamp(delta, -arc, arc) + attack;
    normal = { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
  }
  if (request.activeStrike) normal = request.activeStrike.normal;
  const reason: FootContactExecution['unavailableReason'] = isContinuousFootContact(
    state,
    actor,
    foot,
  )
    ? 'continuous_contact'
    : distance(centre, state.ball) > geometry.footReach + 1e-8
      ? 'out_of_reach'
      : height > (intended === 'sole' ? 0.24 : 0.65)
        ? 'height'
        : intended === 'sole' &&
            (Math.hypot(actor.velocity.x, actor.velocity.y) > 4 || balance < 0.2)
          ? 'support'
          : preparationSeconds < 0.012
            ? 'preparation'
            : null;
  const radius = FOOT_CONTACT_PHYSICS.radius,
    m = FOOT_CONTACT_PHYSICS.mass,
    I = FOOT_CONTACT_PHYSICS.inertia;
  const r = { x: -normal.x * radius, y: -normal.y * radius, z: -normal.z * radius };
  const rotational = cross(incomingSpin, r);
  const desired = request.desiredVelocity;
  const error = {
    x: desired.x - incomingVelocity.x,
    y: desired.y - incomingVelocity.y,
    z: desired.z - incomingVelocity.z,
  };
  const normalError = dot(error, normal);
  // A prepared receiving foot can give way through a bounded 12cm stroke within
  // its existing reach envelope. An immediate impact has almost none of that
  // absorption path. The 24cm nominal contact path is shared with assessFirstTouch.
  const cushionStroke =
    intended === 'cushion' && request.contactQuality !== undefined
      ? Math.min(0.12, preparationSeconds * 0.1) * balance
      : 0;
  let normalImpulseLimit =
    m *
    (intended === 'cushion' ? 10 + skill * 20 : 4.5 + skill * 8) *
    quality *
    (1 + cushionStroke / 0.24);
  let jn = clamp(normalError * m, -normalImpulseLimit, normalImpulseLimit);
  const strike = request.activeStrike;
  const capability = strike
    ? activeStrikeCapability(actor, foot, balance, preparationSeconds)
    : undefined;
  let footVelocity = desired;
  if (strike && capability) {
    const relative = {
      x: strike.footVelocity.x - actor.velocity.x,
      y: strike.footVelocity.y - actor.velocity.y,
      z: strike.footVelocity.z,
    };
    const scale = Math.min(
      1,
      capability.maximumFootSpeed / Math.max(1e-9, Math.hypot(relative.x, relative.y, relative.z)),
    );
    footVelocity = {
      x: actor.velocity.x + relative.x * scale,
      y: actor.velocity.y + relative.y * scale,
      z: relative.z * scale,
    };
    const inverseMass = 1 / m + 1 / capability.effectiveMass;
    normalImpulseLimit =
      ((1 + capability.restitution) *
        Math.max(
          0,
          capability.maximumFootSpeed +
            dot(
              {
                x: actor.velocity.x - incomingVelocity.x,
                y: actor.velocity.y - incomingVelocity.y,
                z: -incomingVelocity.z,
              },
              normal,
            ),
        )) /
      inverseMass;
    const closing = dot(
      {
        x: footVelocity.x - incomingVelocity.x - rotational.x,
        y: footVelocity.y - incomingVelocity.y - rotational.y,
        z: footVelocity.z - incomingVelocity.z - rotational.z,
      },
      normal,
    );
    jn = clamp(((1 + capability.restitution) * closing) / inverseMass, 0, normalImpulseLimit);
  }
  const normalLoad =
    intended === 'sole'
      ? (45 + skill * 85) * contactSeconds * balance
      : Math.abs(jn) + m * 9.81 * contactSeconds;
  const friction =
    intended === 'sole'
      ? 0.9
      : intended === 'cushion'
        ? 0.82
        : intended === 'inside'
          ? 0.72
          : intended === 'outside'
            ? 0.58
            : 0.42;
  const tangentImpulseLimit = friction * normalLoad;
  // Solve tangent surface slip against the moving foot. Shell inertia gives 1/m+R²/I.
  const slip = {
    x: incomingVelocity.x + rotational.x - footVelocity.x,
    y: incomingVelocity.y + rotational.y - footVelocity.y,
    z: incomingVelocity.z + rotational.z - footVelocity.z,
  };
  const sn = dot(slip, normal);
  const tangent = {
    x: slip.x - normal.x * sn,
    y: slip.y - normal.y * sn,
    z: slip.z - normal.z * sn,
  };
  const tangentSpeed = Math.hypot(tangent.x, tangent.y, tangent.z);
  const jt =
    Math.min(
      tangentImpulseLimit,
      tangentSpeed /
        (1 / m + (radius * radius) / I + (capability ? 1 / capability.effectiveMass : 0)),
    ) * (strike ? 1 : quality);
  const scale = tangentSpeed > 1e-9 ? -jt / tangentSpeed : 0;
  const tangentImpulse = { x: tangent.x * scale, y: tangent.y * scale, z: tangent.z * scale };
  const torque = cross(r, reason ? zero() : tangentImpulse);
  if (!reason && (intended === 'sole' || intended === 'cushion')) {
    // A finite contact patch also resists twist around its normal; a point contact cannot.
    const axial = dot(incomingSpin, normal);
    const twist =
      Math.sign(axial) *
      Math.min(Math.abs(axial) * I * 0.65 * quality, friction * normalLoad * 0.025);
    torque.x -= normal.x * twist;
    torque.y -= normal.y * twist;
    torque.z -= normal.z * twist;
  }
  // Limit the impulse itself at the shared numerical spin envelope, preserving J / torque.
  let spinScale = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = torque[axis] / I;
    if (delta !== 0)
      spinScale = Math.min(
        spinScale,
        Math.max(0, (160 - Math.sign(delta) * incomingSpin[axis]) / Math.abs(delta)),
      );
  }
  const impulse = reason
    ? zero()
    : {
        x: normal.x * jn + tangentImpulse.x * spinScale,
        y: normal.y * jn + tangentImpulse.y * spinScale,
        z: normal.z * jn + tangentImpulse.z * spinScale,
      };
  const outgoingVelocity = {
    x: incomingVelocity.x + impulse.x / m,
    y: incomingVelocity.y + impulse.y / m,
    z: incomingVelocity.z + impulse.z / m,
  };
  const outgoingSpin = {
    x: clamp(incomingSpin.x + (torque.x * spinScale) / I, -160, 160),
    y: clamp(incomingSpin.y + (torque.y * spinScale) / I, -160, 160),
    z: clamp(incomingSpin.z + (torque.z * spinScale) / I, -160, 160),
  };
  return {
    intended,
    executed: reason ? null : intended,
    foot,
    available: !reason,
    unavailableReason: reason,
    at: state.time,
    point: { x: state.ball.x, y: state.ball.y, z: height },
    surfacePoint: { x: state.ball.x + r.x, y: state.ball.y + r.y, z: height + r.z },
    relativePoint: { x: state.ball.x - centre.x, y: state.ball.y - centre.y, z: height },
    normal,
    incomingVelocity,
    outgoingVelocity,
    incomingSpin,
    outgoingSpin,
    impulse,
    normalImpulseLimit,
    tangentImpulseLimit,
    tangentSpeed,
    quality,
    balance,
    preparationSeconds,
    contactSeconds,
    retained:
      !reason && Math.hypot(outgoingVelocity.x - desired.x, outgoingVelocity.y - desired.y) < 4.8,
    recoverySeconds: (0.08 + (1 - quality) * 0.25 + weak * 0.08) * fitness.contactRecovery,
  };
};

export const multiContactMoveSchema = z.enum([
  'inside_outside',
  'outside_inside',
  'sole_redirect',
  'elastico',
]);
export const multiContactStateSchema = z.object({
  move: multiContactMoveSchema,
  foot: z.enum(['left', 'right']),
  phase: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  startedAt: z.number().nonnegative(),
  nextAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  firstDirection: physicalPointSchema,
  secondDirection: physicalPointSchema,
  status: z.enum(['active', 'completed', 'failed']),
});
export type MultiContactState = z.infer<typeof multiContactStateSchema>;
export const beginMultiContactMove = (
  actor: MatchPlayerState,
  at: number,
  move: MultiContactState['move'],
  secondDirection: { x: number; y: number },
  foot: 'left' | 'right' = actor.profile.dominantFoot,
): MultiContactState => {
  const d = Math.max(1e-9, Math.hypot(secondDirection.x, secondDirection.y));
  const second = { x: secondDirection.x / d, y: secondDirection.y / d },
    side = foot === 'right' ? 1 : -1;
  return {
    move,
    foot,
    phase: 0,
    startedAt: at,
    nextAt: at,
    expiresAt: at + 1.25,
    firstDirection: {
      x: second.x * 0.35 + second.y * side * 0.937,
      y: second.y * 0.35 - second.x * side * 0.937,
    },
    secondDirection: second,
    status: 'active',
  };
};
export const multiContactSurface = (move: MultiContactState): FootSurface =>
  move.phase === 0
    ? move.move === 'inside_outside'
      ? 'inside'
      : move.move === 'sole_redirect'
        ? 'sole'
        : 'outside'
    : move.move === 'inside_outside'
      ? 'outside'
      : 'inside';
