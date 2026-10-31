import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { labVectorSchema as vector } from './footballLabObjects';
import {
  ballSpinSchema,
  integrateBallFlight,
  type PhysicalBall,
  type BallEnvironment,
} from './ballPhysics';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import {
  executeFootContact,
  footSurfaceSchema,
  playerFootGeometry,
  FOOT_CONTACT_PHYSICS,
  type FootContactExecution,
} from './footContact';
import { deriveFitnessPhysicalModifiers } from './matchFitness';
import { findFirstBallContact, resolveBallRebound } from './ballFlight';

export const ballSurfaceSchema = z.enum([
  ...footSurfaceSchema.options,
  'thigh',
  'knee',
  'lower_leg',
  'chest',
  'head',
  'overhead',
]);
export const surfaceRequestSchema = z.object({
  objective: z.enum(['settle', 'directional', 'pass', 'shot', 'juggle', 'deflect']),
  intendedSurface: ballSurfaceSchema,
  foot: z.enum(['left', 'right']).default('right'),
  desiredVelocity: vector,
  preparationSeconds: z.number().nonnegative(),
  readyAt: z.number().nonnegative().default(0),
});
export type SurfaceRequest = z.infer<typeof surfaceRequestSchema>;
export const surfaceContactReceiptSchema = z.object({
  playerId: z.string(),
  objective: surfaceRequestSchema.shape.objective,
  intendedSurface: ballSurfaceSchema,
  actualSurface: ballSurfaceSchema.nullable(),
  foot: z.enum(['left', 'right']).nullable(),
  eligible: z.boolean(),
  executed: z.boolean(),
  reason: z.string().nullable(),
  at: z.number().nonnegative(),
  point: vector,
  surfacePoint: vector,
  normal: vector,
  surfaceVelocity: vector.nullable(),
  incomingVelocity: vector,
  incomingSpin: ballSpinSchema,
  outgoingVelocity: vector,
  outgoingSpin: ballSpinSchema,
  impulse: vector,
  relativeSpeed: z.number().nonnegative().nullable(),
  incomingAngle: z.number().min(0).max(Math.PI).nullable(),
  preparationSeconds: z.number().nonnegative(),
  balance: z.number().min(0).max(1),
  recoverySeconds: z.number().nonnegative(),
  controlEstablished: z.boolean(),
  loose: z.boolean(),
});
export type SurfaceContactReceipt = z.infer<typeof surfaceContactReceiptSchema>;
export const receiptFromFootContact = (
  playerId: string,
  objective: SurfaceRequest['objective'],
  f: FootContactExecution,
): SurfaceContactReceipt => ({
  playerId,
  objective,
  intendedSurface: f.intended,
  actualSurface: f.executed,
  foot: f.foot,
  eligible: f.available,
  executed: f.available,
  reason: f.unavailableReason,
  at: f.at,
  point: f.point,
  surfacePoint: f.surfacePoint,
  normal: f.normal,
  surfaceVelocity: null,
  incomingVelocity: f.incomingVelocity,
  incomingSpin: f.incomingSpin,
  outgoingVelocity: f.outgoingVelocity,
  outgoingSpin: f.outgoingSpin,
  impulse: f.impulse,
  relativeSpeed: null,
  incomingAngle: null,
  preparationSeconds: f.preparationSeconds,
  balance: f.balance,
  recoverySeconds: f.recoverySeconds,
  controlEstablished: false,
  loose: true,
});
export const experimentalBodyContactsSchema = z.object({
  version: z.literal('body-v1'),
  readyAt: z.record(z.string(), z.number().nonnegative()).default({}),
  locks: z.array(z.string()).max(22).default([]),
  last: surfaceContactReceiptSchema.optional(),
});
const zero = () => ({ x: 0, y: 0, z: 0 });
type V = z.infer<typeof vector>;
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: V) => Math.hypot(a.x, a.y, a.z);
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a: V, b: V, t: number): V => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: V): V => {
  const d = norm(v);
  return d > 1e-10 ? { x: v.x / d, y: v.y / d, z: v.z / d } : { x: 0, y: 0, z: 1 };
};
export const bodySurfaceGeometrySchema = z.object({
  surface: ballSurfaceSchema,
  from: vector,
  to: vector,
  radius: z.number().positive(),
});
export type BodySurfaceGeometry = z.infer<typeof bodySurfaceGeometrySchema>;

/** Connected PR190 legs, plus a finite torso capsule. No surrogate foot/head collider. */
export const bodySurfaceGeometry = (
  p: MatchPlayerState,
  request: SurfaceRequest,
): BodySurfaceGeometry | undefined => {
  const s = request.intendedSurface,
    h = p.profile.heightCm / 100,
    jump = p.verticalJump?.height ?? 0;
  if (s === 'chest')
    return {
      surface: s,
      from: { ...p.position, z: h * 0.6 + jump },
      to: { ...p.position, z: h * 0.79 + jump },
      radius: h * 0.105,
    };
  if (!p.lowerBodyPose || !['thigh', 'knee', 'lower_leg'].includes(s)) return;
  const leg = deriveLowerBodyGeometry(p)[request.foot];
  return s === 'knee'
    ? { surface: s, from: leg.knee, to: leg.knee, radius: h * 0.047 }
    : {
        surface: s,
        from: s === 'thigh' ? leg.hip : leg.knee,
        to: s === 'thigh' ? leg.knee : leg.ankle,
        radius: h * (s === 'thigh' ? 0.055 : 0.037),
      };
};
const closest = (point: V, g: BodySurfaceGeometry): V => {
  const d = sub(g.to, g.from),
    t = clamp(dot(sub(point, g.from), d) / Math.max(1e-12, dot(d, d)));
  return mix(g.from, g.to, t);
};
const footSurface = (r: SurfaceRequest) => footSurfaceSchema.safeParse(r.intendedSurface).success;

/** Conservative advancement against the actual swept connected capsule. The Lipschitz
 * bound includes both moving endpoints; a fast delivery cannot skip a thin shin.
 * Feet reuse the existing finite horizontal/height envelope and solver. */
export const sweepSurface = (
  ball: PhysicalBall,
  next: PhysicalBall,
  p: MatchPlayerState,
  previous: MatchPlayerState,
  r: SurfaceRequest,
  dt = 0.025,
  environment?: BallEnvironment,
) => {
  const dx = next.position.x - ball.position.x,
    dy = next.position.y - ball.position.y;
  const f = clamp(
    ((p.position.x - ball.position.x) * dx + (p.position.y - ball.position.y) * dy) /
      Math.max(1e-12, dx * dx + dy * dy),
  );
  if (
    Math.hypot(ball.position.x + dx * f - p.position.x, ball.position.y + dy * f - p.position.y) >
    1.6 + Math.hypot(p.position.x - previous.position.x, p.position.y - previous.position.y)
  )
    return;
  const old = bodySurfaceGeometry(previous, r),
    current = bodySurfaceGeometry(p, r);
  if (!footSurface(r) && (!old || !current)) return undefined;
  const footKey = r.foot === 'left' ? 'leftFoot' : 'rightFoot';
  const f0 = playerFootGeometry(previous)[footKey],
    f1 = playerFootGeometry(p)[footKey];
  const a = { ...f0, z: 0 },
    b = { ...f1, z: 0 };
  const distanceAt = (t: number) => {
    const q =
      dt > 0
        ? integrateBallFlight(ball, dt * t, environment).position
        : mix(ball.position, next.position, t);
    if (footSurface(r)) {
      const c = mix(a, b, t),
        top = r.intendedSurface === 'sole' ? 0.24 : 0.65;
      return Math.max(Math.hypot(q.x - c.x, q.y - c.y) - 0.82, q.z - top, 0.11 - q.z);
    }
    const g = {
      ...current!,
      from: mix(old!.from, current!.from, t),
      to: mix(old!.to, current!.to, t),
    };
    return norm(sub(q, closest(q, g))) - g.radius - 0.11;
  };
  // Starting overlap is an eligible impact only when approaching. Locks and motor
  // recovery are enforced by the caller; overlap cannot re-arm another impulse.
  const travel =
    Math.max(norm(sub(next.position, ball.position)), norm(ball.velocity) * dt) +
    10 * dt * dt +
    (old && current
      ? Math.max(norm(sub(old.from, current.from)), norm(sub(old.to, current.to)))
      : norm(sub(a, b)));
  let t = 0;
  for (let i = 0; i < 96 && t <= 1; i++) {
    const d = distanceAt(t);
    if (d <= 1e-7) return { fraction: t, point: mix(ball.position, next.position, t) };
    if (travel < 1e-12) return;
    t += Math.max(1e-9, (d / travel) * 0.98);
  }
  return undefined;
};

/** Pure impulse execution. Eligibility, execution and possession are distinct.
 * New surfaces never assign ownership. A body can absorb only through its finite
 * giving-way stroke; friction acts on translation and shell rotation together. */
export const executeSurfaceContact = (
  state: TacticalMatchState,
  p: MatchPlayerState,
  r: SurfaceRequest,
): SurfaceContactReceipt => {
  const incoming = {
      x: state.ball.velocity?.x ?? 0,
      y: state.ball.velocity?.y ?? 0,
      z: state.ball.velocity?.z ?? 0,
    },
    spin = { ...(state.ball.spin ?? zero()) };
  const point = { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 };
  const balance = p.plantBalance?.balance ?? 1,
    baseVelocity = { ...p.velocity, z: p.verticalJump?.velocity ?? 0 };
  const g = bodySurfaceGeometry(p, r),
    relative = sub(incoming, baseVelocity);
  let normal = g ? unit(sub(point, closest(point, g))) : unit(sub(r.desiredVelocity, incoming));
  let surfacePoint = g
    ? sub(point, { x: normal.x * 0.11, y: normal.y * 0.11, z: normal.z * 0.11 })
    : point;
  let surfaceVelocity = baseVelocity,
    outgoingVelocity = { ...incoming },
    outgoingSpin = { ...spin },
    impulse = zero(),
    recoverySeconds = 0;
  const ft = footSurface(r);
  const geometryEligible = ft
    ? (() => {
        const foot = playerFootGeometry(p)[r.foot === 'left' ? 'leftFoot' : 'rightFoot'];
        return (
          Math.hypot(point.x - foot.x, point.y - foot.y) <= 0.82 + 1e-6 &&
          point.z <= (r.intendedSurface === 'sole' ? 0.24 : 0.65) + 1e-6
        );
      })()
    : Boolean(g && norm(sub(point, closest(point, g))) <= g.radius + 0.11 + 1e-6);
  let reason =
    r.intendedSurface === 'head'
      ? 'legacy_heading_only'
      : r.intendedSurface === 'overhead'
        ? 'acrobatics_unimplemented'
        : !ft && !g
          ? 'surface_unavailable'
          : !geometryEligible
            ? 'out_of_reach'
            : state.time + 1e-8 < r.readyAt
              ? 'motor_recovery'
              : ft && r.preparationSeconds < 0.012
                ? 'preparation'
                : null;
  if (!reason && ft) {
    const result = executeFootContact(state, p, {
      intended: r.intendedSurface as z.infer<typeof footSurfaceSchema>,
      foot: r.foot,
      desiredVelocity: r.desiredVelocity,
      balance,
      preparationSeconds: r.preparationSeconds,
      contactSeconds: 0.06,
      pressure: 0,
    });
    reason = result.unavailableReason;
    normal = result.normal;
    surfacePoint = result.surfacePoint;
    outgoingVelocity = result.outgoingVelocity;
    outgoingSpin = result.outgoingSpin;
    impulse = result.impulse;
    recoverySeconds = result.recoverySeconds;
  } else if (!reason && g) {
    const a = p.profile.attributes,
      fitness = deriveFitnessPhysicalModifiers(p),
      skill = (a.firstTouch * 0.65 + a.technique * 0.35) / 100;
    const prepared = clamp(r.preparationSeconds / (0.12 + (1 - skill) * 0.3));
    const quality =
      (0.4 + 0.6 * skill) * balance * prepared * (1 - fitness.bodyControlImpairment * 0.3);
    const restitution =
      r.intendedSurface === 'chest' ? 0.22 : r.intendedSurface === 'thigh' ? 0.32 : 0.48;
    const incomingNormal = dot(incoming, normal),
      baseNormal = dot(baseVelocity, normal);
    // Finite stroke and speed; no orientation chosen from the intended target.
    const maxSpeed = (r.intendedSurface === 'chest' ? 0.7 : 1.6) * quality;
    const wanted =
      (dot(r.desiredVelocity, normal) + restitution * incomingNormal) / (1 + restitution);
    const speed = clamp(wanted - baseNormal, -maxSpeed, maxSpeed);
    surfaceVelocity = {
      x: baseVelocity.x + normal.x * speed,
      y: baseVelocity.y + normal.y * speed,
      z: baseVelocity.z + normal.z * speed,
    };
    const relativeNormal = dot(sub(incoming, surfaceVelocity), normal);
    if (relativeNormal >= -1e-8) reason = 'separating';
    else {
      const { mass: m, radius: R, inertia: I } = FOOT_CONTACT_PHYSICS;
      const effectiveMass = p.profile.weightKg * (r.intendedSurface === 'chest' ? 0.3 : 0.08);
      const jn = (-(1 + restitution) * relativeNormal) / (1 / m + 1 / effectiveMass);
      const arm = { x: -normal.x * R, y: -normal.y * R, z: -normal.z * R };
      const slip = sub(
          {
            x: incoming.x + cross(spin, arm).x,
            y: incoming.y + cross(spin, arm).y,
            z: incoming.z + cross(spin, arm).z,
          },
          surfaceVelocity,
        ),
        sn = dot(slip, normal);
      const tangent = {
          x: slip.x - normal.x * sn,
          y: slip.y - normal.y * sn,
          z: slip.z - normal.z * sn,
        },
        length = norm(tangent);
      const jt = Math.min(
        jn * (r.intendedSurface === 'chest' ? 0.55 : 0.45),
        length / (1 / m + (R * R) / I),
      );
      const tangentImpulse =
        length > 1e-10
          ? {
              x: (-tangent.x / length) * jt,
              y: (-tangent.y / length) * jt,
              z: (-tangent.z / length) * jt,
            }
          : zero();
      const torque = cross(arm, tangentImpulse);
      let scale = 1;
      for (const axis of ['x', 'y', 'z'] as const)
        if (torque[axis] !== 0)
          scale = Math.min(
            scale,
            Math.max(
              0,
              ((160 - Math.sign(torque[axis]) * spin[axis]) * I) / Math.abs(torque[axis]),
            ),
          );
      impulse = {
        x: normal.x * jn + tangentImpulse.x * scale,
        y: normal.y * jn + tangentImpulse.y * scale,
        z: normal.z * jn + tangentImpulse.z * scale,
      };
      outgoingVelocity = {
        x: incoming.x + impulse.x / m,
        y: incoming.y + impulse.y / m,
        z: incoming.z + impulse.z / m,
      };
      outgoingSpin = {
        x: spin.x + (torque.x * scale) / I,
        y: spin.y + (torque.y * scale) / I,
        z: spin.z + (torque.z * scale) / I,
      };
      recoverySeconds = (0.14 + (1 - quality) * 0.24) * fitness.contactRecovery;
    }
  }
  return {
    playerId: p.id,
    objective: r.objective,
    intendedSurface: r.intendedSurface,
    actualSurface: reason ? null : r.intendedSurface,
    foot: ft || ['thigh', 'knee', 'lower_leg'].includes(r.intendedSurface) ? r.foot : null,
    eligible: geometryEligible,
    executed: !reason,
    reason,
    at: state.time,
    point,
    surfacePoint,
    normal,
    surfaceVelocity: ft ? null : surfaceVelocity,
    incomingVelocity: incoming,
    incomingSpin: spin,
    outgoingVelocity,
    outgoingSpin,
    impulse,
    relativeSpeed: ft ? null : norm(relative),
    incomingAngle: ft ? null : Math.acos(clamp(-dot(unit(relative), normal), -1, 1)),
    preparationSeconds: r.preparationSeconds,
    balance,
    recoverySeconds,
    controlEstablished: false,
    loose: true,
  };
};

export const surfaceBallStepSchema = z.object({
  ball: z.object({
    position: vector,
    velocity: vector,
    spin: ballSpinSchema.optional(),
    airborne: z.boolean(),
    bounceCount: z.number(),
  }),
  contacts: z.array(surfaceContactReceiptSchema),
  goalCrossing: z.boolean(),
});
/** One earliest impact per tick across all overlapping volumes. The remainder uses
 * ordinary ball physics; no ball correction onto a convenient surface. */
export const advanceSurfaceBall = (
  state: TacticalMatchState,
  ball: PhysicalBall,
  dt: number,
  candidates: {
    player: MatchPlayerState;
    previous?: MatchPlayerState;
    request: SurfaceRequest;
    intention?: SurfaceRequest;
  }[],
  inspectGoal = false,
): z.infer<typeof surfaceBallStepSchema> => {
  const next = integrateBallFlight(ball, dt, state.ballEnvironment);
  const opening = inspectGoal
    ? findFirstBallContact({ previous: ball.position, next: next.position, attackingTeam: 'home' })
    : undefined;
  const finishFlight = () => {
    if (opening && ['left_post', 'right_post', 'crossbar'].includes(opening.kind)) {
      const impact = integrateBallFlight(ball, dt * opening.segmentFraction, state.ballEnvironment);
      const rebound = resolveBallRebound(opening.kind, impact.velocity, 'home', impact.spin);
      return {
        ball: integrateBallFlight(
          { ...impact, velocity: rebound.velocity, spin: rebound.spin ?? zero() },
          dt * (1 - opening.segmentFraction),
          state.ballEnvironment,
        ),
        contacts: [] as SurfaceContactReceipt[],
        goalCrossing: false,
      };
    }
    return {
      ball: next,
      contacts: [] as SurfaceContactReceipt[],
      goalCrossing: opening?.kind === 'goal_plane',
    };
  };
  const hits = candidates
    .map((c) => ({
      ...c,
      hit: sweepSurface(
        ball,
        next,
        c.player,
        c.previous ?? c.player,
        c.request,
        dt,
        state.ballEnvironment,
      ),
    }))
    .filter((c) => c.hit)
    .sort(
      (a, b) =>
        a.hit!.fraction - b.hit!.fraction ||
        a.player.id.localeCompare(b.player.id) ||
        a.request.intendedSurface.localeCompare(b.request.intendedSurface),
    );
  for (const c of hits) {
    const t = c.hit!.fraction,
      impact = integrateBallFlight(ball, dt * t, state.ballEnvironment);
    if (opening && opening.segmentFraction <= t) return finishFlight();
    // CCD uses the integrator chord. Integrate to the hit time and check real
    // geometry again; a curved/tangential near miss never receives an impulse.
    const old = c.previous ?? c.player;
    const actor = {
      ...c.player,
      position: {
        x: old.position.x + (c.player.position.x - old.position.x) * t,
        y: old.position.y + (c.player.position.y - old.position.y) * t,
      },
      facingAngle:
        old.facingAngle +
        Math.atan2(
          Math.sin(c.player.facingAngle - old.facingAngle),
          Math.cos(c.player.facingAngle - old.facingAngle),
        ) *
          t,
    };
    const at = state.time + dt * t;
    const contact = executeSurfaceContact(
      {
        ...state,
        time: at,
        ball: {
          x: impact.position.x,
          y: impact.position.y,
          height: impact.position.z,
          velocity: impact.velocity,
          spin: impact.spin ?? zero(),
        },
      },
      actor,
      c.request,
    );
    if (!contact.executed) continue;
    if (c.intention) {
      contact.intendedSurface = c.intention.intendedSurface;
      contact.objective = c.intention.objective;
    }
    const after = {
      ...impact,
      velocity: contact.outgoingVelocity,
      spin: contact.outgoingSpin,
      airborne: impact.position.z > 0.11 || contact.outgoingVelocity.z > 0,
    };
    const rest = inspectGoal
      ? advanceSurfaceBall({ ...state, time: at }, after, dt * (1 - t), [], true)
      : {
          ball: integrateBallFlight(after, dt * (1 - t), state.ballEnvironment),
          goalCrossing: false,
        };
    return { ball: rest.ball, contacts: [contact], goalCrossing: rest.goalCrossing };
  }
  return finishFlight();
};
