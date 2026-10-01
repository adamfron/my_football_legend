import { z } from 'zod';
import { BALL_RADIUS, type FlightPoint } from './ballFlight';
import type { PhysicalPoint } from './matchSpace';

export interface BallVelocity3d {
  x: number;
  y: number;
  z: number;
}
export interface PhysicalBall {
  position: FlightPoint;
  velocity: BallVelocity3d;
  airborne: boolean;
  bounceCount: number;
}
export interface PhysicalBallForecastSample {
  at: number;
  ball: PhysicalBall;
}
export const BALL_PHYSICS = {
  gravity: 9.81,
  airDrag: 0.006,
  verticalRestitution: 0.46,
  horizontalRestitution: 0.82,
  /** Neutral grass horizontal deceleration in m/s²; applied only during ground contact. */
  rollingDeceleration: 3.2,
  settleVerticalSpeed: 1.15,
} as const;

export const ballEnvironmentSchema = z.object({
  rollingResistanceMultiplier: z.number().positive(),
});
export type BallEnvironment = z.infer<typeof ballEnvironmentSchema>;
export const NEUTRAL_BALL_ENVIRONMENT: BallEnvironment = { rollingResistanceMultiplier: 1 };

/** Apex bounds are metres above the pitch, with distance slopes in metres/metre. */
export const AERIAL_DELIVERY = {
  pass: {
    baseApex: 0.65,
    distanceSlope: 0.105,
    minimumApex: 0.95,
    maximumApex: 10.5,
    arrivalHeight: 0.65,
  },
  long_pass: {
    baseApex: 0.9,
    distanceSlope: 0.12,
    minimumApex: 1.2,
    maximumApex: 12,
    arrivalHeight: 0.8,
  },
  cross: {
    baseApex: 0.9,
    distanceSlope: 0.085,
    minimumApex: 1.2,
    maximumApex: 5.8,
    arrivalHeight: 1.9,
  },
  driven_cross: {
    baseApex: 0.45,
    distanceSlope: 0.035,
    minimumApex: 0.8,
    maximumApex: 2.4,
    arrivalHeight: 0.65,
  },
  throw_in: {
    baseApex: 2.15,
    distanceSlope: 0.045,
    minimumApex: 2.35,
    maximumApex: 4.75,
    arrivalHeight: 0.65,
  },
} as const;
export const aerialLaunchPlanSchema = z.object({
  velocity: z.object({ x: z.number(), y: z.number(), z: z.number().positive() }),
  speed: z.number().positive(),
  elevation: z
    .number()
    .positive()
    .max(Math.PI / 2),
  predictedFlightTime: z.number().positive(),
  predictedApex: z.number().positive(),
  releaseHeight: z.number().nonnegative(),
  arrivalHeight: z.number().nonnegative(),
});
export type AerialLaunchPlan = z.infer<typeof aerialLaunchPlanSchema>;

export const gravityAcceleration = (): BallVelocity3d => ({ x: 0, y: 0, z: -BALL_PHYSICS.gravity });
export const dragAcceleration = (v: BallVelocity3d): BallVelocity3d => {
  const speed = Math.hypot(v.x, v.y, v.z);
  return {
    x: -BALL_PHYSICS.airDrag * speed * v.x,
    y: -BALL_PHYSICS.airDrag * speed * v.y,
    z: -BALL_PHYSICS.airDrag * speed * v.z,
  };
};

/** Exact constant-deceleration ground regime shared by 3D integration and loose-ball ETA. */
export const integrateGroundRolling = (
  position: PhysicalPoint,
  velocity: PhysicalPoint,
  dt: number,
  environment: BallEnvironment = NEUTRAL_BALL_ENVIRONMENT,
): { position: PhysicalPoint; velocity: PhysicalPoint } => {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed === 0 || dt <= 0) return { position: { ...position }, velocity: { ...velocity } };
  const deceleration = BALL_PHYSICS.rollingDeceleration * environment.rollingResistanceMultiplier;
  const movingTime = Math.min(dt, speed / deceleration);
  const nextSpeed = Math.max(0, speed - deceleration * dt);
  const travelled = speed * movingTime - 0.5 * deceleration * movingTime * movingTime;
  return {
    position: {
      x: position.x + (velocity.x / speed) * travelled,
      y: position.y + (velocity.y / speed) * travelled,
    },
    velocity: { x: (velocity.x / speed) * nextSpeed, y: (velocity.y / speed) * nextSpeed },
  };
};

/** Shared fixed-step integrator. Future spin adds another acceleration term beside gravity/drag. */
export const integrateBallFlight = (
  ball: PhysicalBall,
  dt: number,
  environment: BallEnvironment = NEUTRAL_BALL_ENVIRONMENT,
): PhysicalBall => {
  // Match stepping may batch time for tests/replay; ball substeps stay fixed and deterministic.
  const maximumStep = 0.025;
  const steps = Math.max(1, Math.ceil(dt / maximumStep));
  const step = dt / steps;
  let current: PhysicalBall = {
    position: { ...ball.position, z: Math.max(BALL_RADIUS, ball.position.z) },
    velocity: { ...ball.velocity },
    airborne: ball.airborne,
    bounceCount: ball.bounceCount,
  };
  for (let index = 0; index < steps; index += 1) {
    let velocity = { ...current.velocity };
    let airborne = current.airborne || current.position.z > BALL_RADIUS || velocity.z > 0;
    let bounceCount = current.bounceCount;
    if (airborne) {
      const gravity = gravityAcceleration();
      const drag = dragAcceleration(velocity);
      velocity = {
        x: velocity.x + (gravity.x + drag.x) * step,
        y: velocity.y + (gravity.y + drag.y) * step,
        z: velocity.z + (gravity.z + drag.z) * step,
      };
    } else {
      const rolled = integrateGroundRolling(current.position, velocity, step, environment);
      current = {
        position: { ...rolled.position, z: BALL_RADIUS },
        velocity: { ...rolled.velocity, z: 0 },
        airborne: false,
        bounceCount,
      };
      continue;
    }
    const position = {
      x: current.position.x + velocity.x * step,
      y: current.position.y + velocity.y * step,
      z: current.position.z + velocity.z * step,
    };
    if (position.z < BALL_RADIUS && velocity.z < 0) {
      position.z = BALL_RADIUS;
      bounceCount += 1;
      velocity.x *= BALL_PHYSICS.horizontalRestitution;
      velocity.y *= BALL_PHYSICS.horizontalRestitution;
      velocity.z = -velocity.z * BALL_PHYSICS.verticalRestitution;
      if (velocity.z < BALL_PHYSICS.settleVerticalSpeed) {
        velocity.z = 0;
        airborne = false;
      }
    }
    current = { position, velocity, airborne, bounceCount };
  }
  return current;
};

/**
 * Canonical, RNG-free future forecast. Consumers sample the very same fixed-step solver used by
 * match resolution rather than recreating a trajectory from an intended target.
 */
export const projectFutureBallTrajectory = (
  ball: PhysicalBall,
  horizon = 3,
  sampleInterval = 0.05,
  environment: BallEnvironment = NEUTRAL_BALL_ENVIRONMENT,
): PhysicalBallForecastSample[] => {
  const interval = Math.max(0.025, sampleInterval);
  const samples: PhysicalBallForecastSample[] = [];
  let current = ball;
  for (let at = interval; at <= horizon + 1e-9; at += interval) {
    current = integrateBallFlight(current, interval, environment);
    samples.push({ at, ball: current });
    if (!current.airborne && Math.hypot(current.velocity.x, current.velocity.y) < 0.05) break;
  }
  return samples;
};

export const deriveLaunchVelocity = (
  from: PhysicalPoint,
  target: PhysicalPoint,
  speed: number,
  elevationRadians: number,
): BallVelocity3d => {
  const dx = target.x - from.x,
    dy = target.y - from.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const horizontal = speed * Math.cos(elevationRadians);
  return {
    x: (dx / length) * horizontal,
    y: (dy / length) * horizontal,
    z: speed * Math.sin(elevationRadians),
  };
};

/**
 * Distance-aware physical loft. Only launch velocity is authored; apex/arrival are measured with
 * the same integrator used by live play. The bounded correction compensates horizontal air drag,
 * never moves the ball to the target or scripts its height.
 */
export const deriveAerialLaunchPlan = (
  from: PhysicalPoint,
  target: PhysicalPoint,
  kind: keyof typeof AERIAL_DELIVERY,
  options: {
    releaseHeight?: number;
    arrivalHeight?: number;
    ability?: number;
    executionError?: number;
  } = {},
): AerialLaunchPlan => {
  const profile = AERIAL_DELIVERY[kind];
  const metres = Math.max(0.1, Math.hypot(target.x - from.x, target.y - from.y));
  const releaseHeight = Math.max(
    BALL_RADIUS,
    options.releaseHeight ?? (kind === 'throw_in' ? 1.9 : BALL_RADIUS),
  );
  const arrivalHeight = Math.max(BALL_RADIUS, options.arrivalHeight ?? profile.arrivalHeight);
  const ability = Math.max(0, Math.min(1, (options.ability ?? 70) / 100));
  const error = Math.max(-1, Math.min(1, options.executionError ?? 0));
  const apex = Math.max(
    releaseHeight + 0.35,
    arrivalHeight + 0.35,
    Math.max(
      profile.minimumApex,
      Math.min(profile.maximumApex, profile.baseApex + metres * profile.distanceSlope),
    ) *
      (1 + (1 - ability) * 0.08 + error * 0.18),
  );
  const verticalSpeed = Math.sqrt(2 * BALL_PHYSICS.gravity * (apex - releaseHeight));
  const nominalTime =
    (verticalSpeed + Math.sqrt(2 * BALL_PHYSICS.gravity * (apex - arrivalHeight))) /
    BALL_PHYSICS.gravity;
  let horizontalSpeed = metres / nominalTime;
  let velocity = { x: 0, y: 0, z: verticalSpeed };
  let flightTime = nominalTime;
  let measuredApex = releaseHeight;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    velocity = deriveLaunchVelocity(
      from,
      target,
      Math.hypot(horizontalSpeed, verticalSpeed),
      Math.atan2(verticalSpeed, horizontalSpeed),
    );
    let ball: PhysicalBall = {
      position: { ...from, z: releaseHeight },
      velocity,
      airborne: true,
      bounceCount: 0,
    };
    measuredApex = releaseHeight;
    for (flightTime = 0.025; flightTime <= 5; flightTime += 0.025) {
      ball = integrateBallFlight(ball, 0.025);
      measuredApex = Math.max(measuredApex, ball.position.z);
      if (ball.velocity.z < 0 && ball.position.z <= arrivalHeight) break;
    }
    const travelled = Math.hypot(ball.position.x - from.x, ball.position.y - from.y);
    if (iteration < 3) horizontalSpeed *= metres / Math.max(0.1, travelled);
  }
  return aerialLaunchPlanSchema.parse({
    velocity,
    speed: Math.hypot(velocity.x, velocity.y, velocity.z),
    elevation: Math.atan2(velocity.z, Math.hypot(velocity.x, velocity.y)),
    predictedFlightTime: flightTime,
    predictedApex: measuredApex,
    releaseHeight,
    arrivalHeight,
  });
};
