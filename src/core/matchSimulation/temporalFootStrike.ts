import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { integrateBallFlight, ballSpinSchema, BALL_PHYSICS } from './ballPhysics';
import { executePhysicalKick, kickSolutionRequestSchema } from './kickExecution';
import { kickVectorSchema as vector, kickPerturbationSchema } from './kickExecutionState';
import {
  executeFootContact,
  activeStrikeCapability,
  footContactExecutionSchema,
  playerFootGeometry,
  FOOT_CONTACT_PHYSICS,
} from './footContact';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';

type V = z.infer<typeof vector>;
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: V, k: number): V => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const norm = (v: V) => Math.hypot(v.x, v.y, v.z);
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const zero = (): V => ({ x: 0, y: 0, z: 0 });
const unit = (v: V) => scale(v, 1 / Math.max(1e-12, norm(v)));
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const kinetic = (v: V, w: V) =>
  (FOOT_CONTACT_PHYSICS.mass * dot(v, v) + FOOT_CONTACT_PHYSICS.inertia * dot(w, w)) / 2;

/** Engineering assumptions, not articulated biomechanics or calibrated human timing. */
export const TEMPORAL_STRIKE = Object.freeze({
  version: 'temporal-contact-dev-v1' as const,
  footRadius: 0.035,
  nominalOnset: 0.025,
  swingSeconds: 0.05,
  followThroughSeconds: 0.02,
  windowSeconds: 0.12,
  maximumTimingError: 0.02,
  distanceTolerance: 1e-7,
  maximumEvaluationsPerStep: 160,
});
const physicalBallSchema = z.object({
  position: vector,
  velocity: vector,
  spin: ballSpinSchema,
  airborne: z.boolean(),
  bounceCount: z.number().int().nonnegative(),
});
type Ball = z.infer<typeof physicalBallSchema>;
export const temporalStrikeRequestSchema = kickSolutionRequestSchema.extend({
  // An intention supplied by the caller, not a future truth query by this solver.
  plannedBallPoint: vector,
  surface: z.literal('inside'),
  nominalVelocity: vector.extend({ z: z.literal(0) }),
});
export const temporalStrikePlanSchema = z.object({
  version: z.literal(TEMPORAL_STRIKE.version),
  actorId: z.string(),
  plannedAt: z.number().nonnegative(),
  family: z.enum(['pass', 'shot']),
  foot: z.enum(['left', 'right']),
  origin: vector,
  bodyPosition: vector,
  bodyVelocity: vector,
  facingAngle: z.number().finite(),
  plannedBallPoint: vector,
  normal: vector,
  nominalVelocity: vector,
  nominalFootVelocity: vector,
  preparationSeconds: z.number().nonnegative(),
  balance: z.number().min(0).max(1),
  maximumFootSpeed: z.number().positive(),
  reach: z.number().positive(),
});
export type TemporalStrikePlan = z.infer<typeof temporalStrikePlanSchema>;
export const temporalFootPathSchema = z.object({
  origin: vector,
  bodyVelocity: vector,
  onset: z.number().nonnegative(),
  duration: z.number().positive(),
  controls: z.tuple([vector, vector, vector, vector]),
  finalVelocity: vector,
  speedBound: z.number().nonnegative(),
  reachBound: z.number().nonnegative(),
  capabilityScale: z.number().min(0).max(1),
});
export type TemporalFootPath = z.infer<typeof temporalFootPathSchema>;
const frameSchema = z.object({
  at: z.number().nonnegative(),
  ball: physicalBallSchema,
  foot: vector,
});
export const temporalStrikeReceiptSchema = z.object({
  version: z.literal(TEMPORAL_STRIKE.version),
  plannedContactAt: z.number().nonnegative(),
  unstruckBallAtPlannedTime: physicalBallSchema,
  path: temporalFootPathSchema,
  perturbation: kickPerturbationSchema,
  outcome: z.enum(['contact', 'miss', 'unavailable', 'unresolved']),
  reason: z.string().nullable(),
  contactAt: z.number().nonnegative().nullable(),
  contact: footContactExecutionSchema.nullable(),
  footAtContact: vector.nullable(),
  footVelocityAtContact: vector.nullable(),
  separationAtContact: z.number().nullable(),
  normalImpulse: z.number().nullable(),
  tangentImpulse: vector.nullable(),
  kineticBefore: z.number().nonnegative().nullable(),
  kineticAfter: z.number().nonnegative().nullable(),
  finalBall: physicalBallSchema,
  frames: z.array(frameSchema).max(7),
  evaluations: z
    .number()
    .int()
    .nonnegative()
    .max(5 * TEMPORAL_STRIKE.maximumEvaluationsPerStep),
});
export type TemporalStrikeReceipt = z.infer<typeof temporalStrikeReceiptSchema>;
export const ZERO_TEMPORAL_ERROR = Object.freeze({
  lateralPatchMetres: 0,
  verticalPatchMetres: 0,
  timingSeconds: 0,
  effortError: 0,
});

/** Prepare only. The caller must own the observation/history supporting its intention.
 * No production selector currently installs this plan; canonical contact arbitration is pending. */
export const prepareTemporalStrike = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  input: z.input<typeof temporalStrikeRequestSchema>,
): TemporalStrikePlan => {
  const request = temporalStrikeRequestSchema.parse(input);
  const solution = executePhysicalKick(state, actor, request, ZERO_TEMPORAL_ERROR);
  const foot = solution.contact.foot;
  const geometry = playerFootGeometry(actor);
  const point = geometry[foot === 'left' ? 'leftFoot' : 'rightFoot'];
  const height = actor.lowerBodyPose ? deriveLowerBodyGeometry(actor)[foot].foot.z : 0.04;
  return temporalStrikePlanSchema.parse({
    version: TEMPORAL_STRIKE.version,
    actorId: actor.id,
    plannedAt: state.time,
    family: request.family,
    foot,
    origin: { ...point, z: height },
    bodyPosition: { ...actor.position, z: 0 },
    bodyVelocity: { ...actor.velocity, z: 0 },
    facingAngle: actor.facingAngle,
    plannedBallPoint: request.plannedBallPoint,
    normal: solution.effectiveNormal,
    nominalVelocity: request.nominalVelocity,
    nominalFootVelocity: solution.realisedFootVelocity,
    preparationSeconds: solution.context.preparationSeconds,
    balance: solution.context.balance,
    maximumFootSpeed: solution.capability.maximumFootSpeed,
    reach: geometry.footReach,
  });
};

/** Cubic Bezier relative to the moving body. Convex hulls bound the entire path
 * and derivative, including follow-through; clipping scales the path, never moves its origin. */
export const temporalFootPath = (
  plan: TemporalStrikePlan,
  error: z.infer<typeof kickPerturbationSchema>,
): TemporalFootPath => {
  const onset = TEMPORAL_STRIKE.nominalOnset + error.timingSeconds;
  if (onset < 0.005 - 1e-12 || onset > 0.045 + 1e-12)
    throw Error('Temporal strike timing lies outside the validated ±20 ms window');
  const n = plan.normal;
  const lateral = unit({ x: -n.y, y: n.x, z: 0 });
  const up = { x: -n.z * n.x, y: -n.z * n.y, z: n.x ** 2 + n.y ** 2 };
  const contactCentre = sub(
    add(
      plan.plannedBallPoint,
      add(scale(lateral, error.lateralPatchMetres), scale(unit(up), error.verticalPatchMetres)),
    ),
    scale(n, FOOT_CONTACT_PHYSICS.radius + TEMPORAL_STRIKE.footRadius),
  );
  const nominalTime = TEMPORAL_STRIKE.nominalOnset + TEMPORAL_STRIKE.swingSeconds;
  const effort = clamp(1 + error.effortError, 0, 2);
  const end = scale(
    sub(sub(contactCentre, plan.origin), scale(plan.bodyVelocity, nominalTime)),
    effort,
  );
  const velocity = scale(sub(plan.nominalFootVelocity, plan.bodyVelocity), effort);
  const control2 = sub(end, scale(velocity, TEMPORAL_STRIKE.swingSeconds / 3));
  const bound = Math.max(norm(scale(control2, 3 / TEMPORAL_STRIKE.swingSeconds)), norm(velocity));
  const follow = add(end, scale(velocity, TEMPORAL_STRIKE.followThroughSeconds / 2));
  const reach = Math.max(norm(control2), norm(end), norm(follow));
  const capabilityScale = Math.min(
    1,
    plan.maximumFootSpeed / Math.max(1e-12, bound),
    plan.reach / Math.max(1e-12, reach),
  );
  return temporalFootPathSchema.parse({
    origin: plan.origin,
    bodyVelocity: plan.bodyVelocity,
    onset,
    duration: TEMPORAL_STRIKE.swingSeconds,
    controls: [zero(), zero(), scale(control2, capabilityScale), scale(end, capabilityScale)],
    finalVelocity: scale(velocity, capabilityScale),
    speedBound: bound * capabilityScale,
    reachBound: reach * capabilityScale,
    capabilityScale,
  });
};

export const temporalFootAt = (path: TemporalFootPath, at: number) => {
  const t = clamp((at - path.onset) / path.duration),
    u = 1 - t;
  const [, , c, d] = path.controls;
  const relative = add(scale(c, 3 * u * t * t), scale(d, t * t * t));
  const follow = clamp(at - path.onset - path.duration, 0, TEMPORAL_STRIKE.followThroughSeconds);
  const followDistance = follow - (follow * follow) / (2 * TEMPORAL_STRIKE.followThroughSeconds);
  return {
    position: add(
      add(path.origin, scale(path.bodyVelocity, at)),
      add(relative, scale(path.finalVelocity, followDistance)),
    ),
    velocity: add(
      path.bodyVelocity,
      at < path.onset
        ? zero()
        : follow > 0
          ? scale(path.finalVelocity, 1 - follow / TEMPORAL_STRIKE.followThroughSeconds)
          : scale(add(scale(c, 6 * t - 9 * t * t), scale(d, 3 * t * t)), 1 / path.duration),
    ),
  };
};

/** A bounded single-ball collision primitive, not a match executor. Canonical integration
 * supplies all ball motion. The body trajectory here is an explicit constant-velocity fixture;
 * live integration must instead provide canonical body segments and arbitrate other contacts. */
export const executeTemporalStrike = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  prepared: TemporalStrikePlan,
  perturbation: z.infer<typeof kickPerturbationSchema> = ZERO_TEMPORAL_ERROR,
): TemporalStrikeReceipt => {
  const plan = temporalStrikePlanSchema.parse(prepared);
  const error = kickPerturbationSchema.parse(perturbation);
  if (plan.actorId !== actor.id || Math.abs(plan.plannedAt - state.time) > 1e-9)
    throw Error('Temporal strike needs the original actor and planning clock');
  if (
    norm(sub(plan.bodyPosition, { ...actor.position, z: 0 })) > 1e-9 ||
    norm(sub(plan.bodyVelocity, { ...actor.velocity, z: 0 })) > 1e-9 ||
    plan.facingAngle !== actor.facingAngle
  )
    throw Error('Temporal strike body changed without a new canonical body segment');
  const geometry = playerFootGeometry(actor);
  const currentFoot = geometry[plan.foot === 'left' ? 'leftFoot' : 'rightFoot'];
  const currentHeight = actor.lowerBodyPose
    ? deriveLowerBodyGeometry(actor)[plan.foot].foot.z
    : 0.04;
  const capability = activeStrikeCapability(
    actor,
    plan.foot,
    plan.balance,
    plan.preparationSeconds,
  );
  if (
    norm(sub(plan.origin, { ...currentFoot, z: currentHeight })) > 1e-9 ||
    plan.reach > geometry.footReach + 1e-9 ||
    plan.maximumFootSpeed > capability.maximumFootSpeed + 1e-9
  )
    throw Error('Temporal strike cannot move its initial foot or enlarge physical capability');
  const path = temporalFootPath(plan, error);
  let ball: Ball = physicalBallSchema.parse({
    position: { x: state.ball.x, y: state.ball.y, z: Math.max(0.11, state.ball.height ?? 0.11) },
    velocity: {
      x: state.ball.velocity?.x ?? 0,
      y: state.ball.velocity?.y ?? 0,
      z: state.ball.velocity?.z ?? 0,
    },
    spin: state.ball.spin ?? zero(),
    airborne: state.ball.airborne ?? false,
    bounceCount: state.ball.bounceCount ?? 0,
  });
  const integrate = (b: Ball, dt: number): Ball => {
    const result = integrateBallFlight(b, dt, state.ballEnvironment);
    return { ...result, spin: result.spin ?? zero() };
  };
  let unstruck = ball;
  for (let i = 0; i < 3; i++) unstruck = integrate(unstruck, 0.025);
  let outcome: TemporalStrikeReceipt['outcome'] = 'miss';
  let reason: string | null = null;
  if (ball.position.z > 0.24 || plan.plannedBallPoint.z > 0.24) {
    outcome = 'unavailable';
    reason = 'unsupported_height';
  } else if (plan.preparationSeconds < 0.012) {
    outcome = 'unavailable';
    reason = 'preparation';
  } else if (
    norm(sub(ball.position, path.origin)) <
    FOOT_CONTACT_PHYSICS.radius + TEMPORAL_STRIKE.footRadius - TEMPORAL_STRIKE.distanceTolerance
  ) {
    outcome = 'unavailable';
    reason = 'initial_penetration';
  } else if (
    Math.min(
      ...path.controls.map((p) => p.z + path.origin.z),
      temporalFootAt(path, TEMPORAL_STRIKE.windowSeconds).position.z,
    ) <
    TEMPORAL_STRIKE.footRadius - 1e-9
  ) {
    outcome = 'unavailable';
    reason = 'foot_below_pitch';
  }
  let contact: TemporalStrikeReceipt['contact'] = null;
  let contactTime: number | null = null;
  let contactFoot: ReturnType<typeof temporalFootAt> | null = null;
  let evaluations = 0;
  const frames: z.infer<typeof frameSchema>[] = [{ at: state.time, ball, foot: path.origin }];
  for (let elapsed = 0; elapsed < TEMPORAL_STRIKE.windowSeconds - 1e-12; elapsed += 0.025) {
    const dt = Math.min(0.025, TEMPORAL_STRIKE.windowSeconds - elapsed);
    let struck = false;
    if (!contact && outcome === 'miss') {
      // Gravity is bounded over this production substep; rotational energy also bounds
      // possible translational gain from a spinning ground impact. Magnus is bounded.
      const speed =
        norm(ball.velocity) +
        Math.sqrt(2 / 3) * 0.11 * norm(ball.spin) +
        (BALL_PHYSICS.gravity + BALL_PHYSICS.maximumMagnusAcceleration) * dt +
        path.speedBound +
        norm(path.bodyVelocity);
      let local = 0;
      let finished = false;
      for (let i = 0; i < TEMPORAL_STRIKE.maximumEvaluationsPerStep; i++) {
        evaluations++;
        const incoming = local === 0 ? ball : integrate(ball, local);
        const foot = temporalFootAt(path, elapsed + local);
        const delta = sub(incoming.position, foot.position);
        const distance = norm(delta) - FOOT_CONTACT_PHYSICS.radius - TEMPORAL_STRIKE.footRadius;
        if (distance <= TEMPORAL_STRIKE.distanceTolerance) {
          const normal = unit(delta);
          const closing = dot(sub(foot.velocity, incoming.velocity), normal);
          if (closing <= 1e-8) {
            outcome = 'unresolved';
            reason = 'grazing_or_initial_separating_contact';
            finished = true;
            break;
          }
          const at = state.time + elapsed + local;
          const body = {
            ...actor,
            position: {
              x: plan.bodyPosition.x + plan.bodyVelocity.x * (elapsed + local),
              y: plan.bodyPosition.y + plan.bodyVelocity.y * (elapsed + local),
            },
          };
          const contactState: TacticalMatchState = {
            ...state,
            time: at,
            ball: {
              ...state.ball,
              x: incoming.position.x,
              y: incoming.position.y,
              height: incoming.position.z,
              velocity: incoming.velocity,
              spin: incoming.spin,
            },
          };
          if (incoming.position.z > 0.24) {
            outcome = 'unavailable';
            reason = 'unsupported_height';
            finished = true;
            break;
          }
          const resolved = executeFootContact(contactState, body, {
            intended: 'inside',
            foot: plan.foot,
            desiredVelocity: plan.nominalVelocity,
            balance: plan.balance,
            preparationSeconds: plan.preparationSeconds,
            contactSeconds: 0.025,
            pressure: 0,
            activeStrike: { normal, footVelocity: foot.velocity },
          });
          if (!resolved.available) {
            outcome = 'unavailable';
            reason = resolved.unavailableReason;
            finished = true;
            break;
          }
          contact = { ...resolved, relativePoint: delta };
          contactTime = elapsed + local;
          contactFoot = foot;
          outcome = 'contact';
          ball = integrate(
            {
              ...incoming,
              velocity: resolved.outgoingVelocity,
              spin: resolved.outgoingSpin,
              airborne: incoming.airborne || resolved.outgoingVelocity.z > 0,
            },
            dt - local,
          );
          struck = true;
          finished = true;
          break;
        }
        if (local >= dt) {
          finished = true;
          break;
        }
        local = Math.min(dt, local + Math.max(1e-12, (0.9 * distance) / Math.max(1e-12, speed)));
      }
      if (!finished) {
        outcome = 'unresolved';
        reason = 'bounded_search_exhausted';
      }
    }
    if (!struck) ball = integrate(ball, dt);
    frames.push({
      at: state.time + elapsed + dt,
      ball,
      foot: temporalFootAt(path, elapsed + dt).position,
    });
  }
  const normalImpulse = contact ? dot(contact.impulse, contact.normal) : null;
  return temporalStrikeReceiptSchema.parse({
    version: TEMPORAL_STRIKE.version,
    plannedContactAt: plan.plannedAt + TEMPORAL_STRIKE.nominalOnset + TEMPORAL_STRIKE.swingSeconds,
    unstruckBallAtPlannedTime: unstruck,
    path,
    perturbation: error,
    outcome,
    reason,
    contactAt: contactTime === null ? null : state.time + contactTime,
    contact,
    footAtContact: contactFoot?.position ?? null,
    footVelocityAtContact: contactFoot?.velocity ?? null,
    separationAtContact: contact
      ? norm(contact.relativePoint) - FOOT_CONTACT_PHYSICS.radius - TEMPORAL_STRIKE.footRadius
      : null,
    normalImpulse,
    tangentImpulse: contact ? sub(contact.impulse, scale(contact.normal, normalImpulse!)) : null,
    kineticBefore: contact ? kinetic(contact.incomingVelocity, contact.incomingSpin) : null,
    kineticAfter: contact ? kinetic(contact.outgoingVelocity, contact.outgoingSpin) : null,
    finalBall: ball,
    frames,
    evaluations,
  });
};
