import { z } from 'zod';
import { physicalPointSchema } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observeBoundedScene } from './boundedPerception';
import { BALL_PHYSICS, ballSpinSchema, magnusAcceleration } from './ballPhysics';
import { deriveMovementCapability } from './locomotion';
import { deriveFitnessPhysicalModifiers } from './matchFitness';
import { angleForVector, normalizeAngle } from './playerOrientation';

const vector = physicalPointSchema.extend({ z: z.number().finite() });
export const ballMotorObservationSchema = z.object({
  at: z.number().nonnegative(),
  nextAt: z.number().nonnegative(),
  ball: z
    .object({
      position: vector,
      velocity: vector,
      spin: ballSpinSchema,
      owner: z.string().nullable(),
    })
    .nullable(),
  others: z
    .array(
      z.object({
        id: z.string(),
        team: z.enum(['home', 'away']),
        position: physicalPointSchema,
        velocity: physicalPointSchema,
      }),
    )
    .max(22),
});
export type BallMotorObservation = z.infer<typeof ballMotorObservationSchema>;
export const ballMovementPlanSchema = z.object({
  intention: z.enum([
    'receive',
    'carry',
    'recover_touch',
    'contest_loose_ball',
    'release',
    'leave_for_teammate',
    'transition_to_defence',
  ]),
  tacticalTarget: physicalPointSchema,
  movementTarget: physicalPointSchema,
  nextContact: physicalPointSchema.nullable(),
  contactSeconds: z.number().nonnegative().nullable(),
  opponentSeconds: z.number().nonnegative().nullable(),
  teammateSeconds: z.number().nonnegative().nullable(),
  opponentId: z.string().nullable(),
  observedAt: z.number().nullable(),
  targetSpeed: z.number().nonnegative(),
  reason: z.string(),
});
export type BallMovementPlan = z.infer<typeof ballMovementPlanSchema>;

/** Whitelisted local sightings, sampled at a human motor-observation cadence. Hidden
 * opponent ratings, targets and future trajectories never enter the estimator. */
export const observeBallMotorState = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
): BallMotorObservation => {
  if (actor.ballMotorObservation && state.time < actor.ballMotorObservation.nextAt)
    return actor.ballMotorObservation;
  const scene = observeBoundedScene(state, actor);
  const delay =
    0.08 +
    (200 - actor.profile.attributes.gameReading - actor.profile.attributes.concentration) * 0.0007;
  return {
    at: state.time,
    nextAt: state.time + delay,
    ball: scene.ball
      ? {
          position: { ...scene.ball.position, z: scene.ball.height },
          velocity: { ...scene.ball.velocity },
          // Coarse visible rotation estimate, not exact future curvature.
          spin: {
            x: Math.round((state.ball.spin?.x ?? 0) / 5) * 5,
            y: Math.round((state.ball.spin?.y ?? 0) / 5) * 5,
            z: Math.round((state.ball.spin?.z ?? 0) / 5) * 5,
          },
          owner: scene.ball.ownerId,
        }
      : null,
    others: scene.visible.map((p) => ({
      id: p.id,
      team: p.team,
      position: { ...p.position },
      velocity: { ...p.velocity },
    })),
  };
};

/** Reception uses the existing local motor observation. A remembered sighting keeps its
 * real timestamp; unobserved spin is unknown rather than refreshed from authoritative state. */
export const observeReceptionBall = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
): BallMotorObservation => {
  const observation = observeBallMotorState(state, actor);
  if (observation === actor.ballMotorObservation) return observation;
  const memory = state.experimentalActivePerception
    ? state.activePerceptionRuntime?.memory[actor.id]
    : undefined;
  return {
    ...observation,
    at: memory?.ball && observation.ball ? memory.ballSeenAt : observation.at,
    ball: observation.ball ? { ...observation.ball, spin: { x: 0, y: 0, z: 0 } } : null,
  };
};

/** Analytical reach time includes adverse momentum, turning and finite acceleration.
 * Other bodies use a conservative common movement envelope, never private attributes. */
const arrival = (
  position: { x: number; y: number },
  velocity: { x: number; y: number },
  facing: number,
  target: { x: number; y: number },
  maximumSpeed: number,
  acceleration: number,
  turnRate: number,
  reach: number,
) => {
  const dx = target.x - position.x,
    dy = target.y - position.y,
    d = Math.hypot(dx, dy);
  if (d <= reach) return 0;
  const along = (velocity.x * dx + velocity.y * dy) / Math.max(0.01, d);
  const sideways = Math.abs(velocity.x * dy - velocity.y * dx) / Math.max(0.01, d);
  const turn = Math.abs(normalizeAngle(angleForVector({ x: dx, y: dy }) - facing));
  const preparation = Math.max(
    (turn / turnRate) * 0.3,
    (Math.max(0, -along) + sideways * 0.35) / acceleration,
  );
  const initial = Math.max(0, Math.min(maximumSpeed, along)),
    metres = Math.max(0, d - reach);
  const accelerate = (maximumSpeed - initial) / acceleration;
  const during = initial * accelerate + 0.5 * acceleration * accelerate * accelerate;
  return (
    preparation +
    (metres <= during
      ? (Math.sqrt(initial * initial + 2 * acceleration * metres) - initial) / acceleration
      : accelerate + (metres - during) / maximumSpeed)
  );
};

/** Deliberately approximate 100ms local model. No call to the authoritative flight
 * integrator, collision solver, RNG or full-match rollout is permitted here. */
export const forecastObservedBallStep = (
  ball: NonNullable<BallMotorObservation['ball']>,
  dt: number,
) => {
  const p = ball.position,
    v = ball.velocity;
  if (p.z <= 0.12 && Math.abs(v.z) < BALL_PHYSICS.settleVerticalSpeed) {
    const speed = Math.hypot(v.x, v.y),
      t = Math.min(dt, speed / BALL_PHYSICS.rollingDeceleration);
    const travel = speed * t - 0.5 * BALL_PHYSICS.rollingDeceleration * t * t;
    const scale =
      Math.max(0, speed - BALL_PHYSICS.rollingDeceleration * dt) / Math.max(0.001, speed);
    return {
      ...ball,
      position: {
        x: p.x + (v.x / Math.max(0.001, speed)) * travel,
        y: p.y + (v.y / Math.max(0.001, speed)) * travel,
        z: 0.11,
      },
      velocity: { x: v.x * scale, y: v.y * scale, z: 0 },
    };
  }
  const curve = magnusAcceleration(v, ball.spin);
  const velocity = {
    x: v.x + curve.x * dt,
    y: v.y + curve.y * dt,
    z: v.z + (curve.z - BALL_PHYSICS.gravity) * dt,
  };
  const position = {
    x: p.x + ((v.x + velocity.x) * dt) / 2,
    y: p.y + ((v.y + velocity.y) * dt) / 2,
    z: p.z + ((v.z + velocity.z) * dt) / 2,
  };
  if (position.z < 0.11) {
    position.z = 0.11;
    velocity.z = Math.abs(velocity.z) * BALL_PHYSICS.verticalRestitution;
    velocity.x *= BALL_PHYSICS.horizontalRestitution;
    velocity.y *= BALL_PHYSICS.horizontalRestitution;
  }
  return { ...ball, position, velocity };
};

/** A motor objective only: neither this plan nor its ETA awards a touch or possession. */
export const planBallOrientedMovement = (
  actor: MatchPlayerState,
  observation: BallMotorObservation | undefined,
  now: number,
  tacticalTarget: { x: number; y: number },
  objective: 'receive' | 'retain' | 'release' | 'leave_for_teammate' = 'retain',
  readyAt = now,
): BallMovementPlan => {
  const capability = deriveMovementCapability(actor);
  const base: BallMovementPlan = {
    intention: 'receive',
    tacticalTarget: { ...tacticalTarget },
    movementTarget: { ...actor.position },
    nextContact: null,
    contactSeconds: null,
    opponentSeconds: null,
    teammateSeconds: null,
    opponentId: null,
    observedAt: observation?.at ?? null,
    targetSpeed: 0,
    reason: 'await_local_observation',
  };
  if (objective === 'release')
    return { ...base, intention: objective, reason: 'intentional_non_retention' };
  if (objective === 'leave_for_teammate') {
    const v = observation?.ball?.velocity,
      speed = v ? Math.hypot(v.x, v.y) : 0;
    return {
      ...base,
      intention: objective,
      movementTarget:
        v && speed > 0.1
          ? { x: actor.position.x - (v.y / speed) * 0.9, y: actor.position.y + (v.x / speed) * 0.9 }
          : { ...actor.position },
      targetSpeed: capability.jogSpeed,
      reason: 'step_clear_of_observed_delivery',
    };
  }
  if (!observation?.ball || now - observation.at > 0.5) return base;
  if (
    observation.ball.owner &&
    observation.ball.owner !== actor.id &&
    observation.others.some((p) => p.id === observation.ball!.owner && p.team !== actor.team)
  )
    return {
      ...base,
      intention: 'transition_to_defence',
      movementTarget: { ...tacticalTarget },
      targetSpeed: capability.runSpeed,
      reason: 'observed_opponent_control',
    };
  let ball = structuredClone(observation.ball);
  const age = Math.max(0, now - observation.at);
  if (age > 0) ball = forecastObservedBallStep(ball, age);
  const fitness = deriveFitnessPhysicalModifiers(actor);
  const acceleration = Math.max(
    0.5,
    capability.acceleration * (actor.plantBalance?.balance ?? 1) * fitness.braking,
  );
  let candidate: { point: { x: number; y: number }; seconds: number; eta: number } | undefined;
  for (let i = 0; i <= 24; i++) {
    const seconds = i * 0.1;
    if (i > 0) ball = forecastObservedBallStep(ball, 0.1);
    if (
      ball.position.x < -0.11 ||
      ball.position.x > 105.11 ||
      ball.position.y < -0.11 ||
      ball.position.y > 68.11
    )
      break;
    if (ball.position.z > 0.65) continue;
    const eta = Math.max(
      Math.max(0, readyAt - now),
      arrival(
        actor.position,
        actor.velocity,
        actor.facingAngle,
        ball.position,
        capability.maximumSprintSpeed,
        acceleration,
        3 + actor.profile.attributes.agility * 0.035,
        0.55,
      ),
    );
    candidate = { point: { x: ball.position.x, y: ball.position.y }, seconds, eta };
    if (eta <= seconds + 0.08) break;
  }
  if (!candidate) return { ...base, reason: 'no_low_contact_inside_local_horizon' };
  const point = candidate.point;
  const rivals = observation.others
    .map((p) => ({
      id: p.id,
      team: p.team,
      eta: arrival(
        { x: p.position.x + p.velocity.x * age, y: p.position.y + p.velocity.y * age },
        p.velocity,
        Math.hypot(p.velocity.x, p.velocity.y) > 0.2
          ? angleForVector(p.velocity)
          : angleForVector({ x: point.x - p.position.x, y: point.y - p.position.y }),
        point,
        7.5,
        5.5,
        4,
        0.55,
      ),
    }))
    .sort((a, b) => a.eta - b.eta || a.id.localeCompare(b.id));
  const opponent = rivals.find((p) => p.team !== actor.team),
    teammate = rivals.find((p) => p.team === actor.team);
  const dx = point.x - actor.position.x,
    dy = point.y - actor.position.y,
    d = Math.max(0.001, Math.hypot(dx, dy));
  // Stand behind the forecast ball so the presented foot can reach it; ordinary
  // canonical braking, turn integration and contact geometry still decide execution.
  const offset = Math.min(0.38, d);
  const contested = opponent !== undefined && opponent.eta < candidate.eta + 0.25;
  return {
    ...base,
    intention:
      objective === 'receive' ? 'receive' : contested ? 'contest_loose_ball' : 'recover_touch',
    movementTarget: { x: point.x - (dx / d) * offset, y: point.y - (dy / d) * offset },
    nextContact: point,
    contactSeconds: Math.max(candidate.seconds, candidate.eta),
    opponentSeconds: opponent?.eta ?? null,
    teammateSeconds: teammate?.eta ?? null,
    opponentId: opponent?.id ?? null,
    targetSpeed: capability.maximumSprintSpeed,
    reason: contested
      ? 'visible_opponent_can_contest'
      : 'next_observed_contact_before_tactical_progress',
  };
};
