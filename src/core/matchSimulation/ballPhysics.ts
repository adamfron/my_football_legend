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
  rollingDeceleration: 2.15,
  settleVerticalSpeed: 1.15,
} as const;

export const gravityAcceleration = (): BallVelocity3d => ({ x: 0, y: 0, z: -BALL_PHYSICS.gravity });
export const dragAcceleration = (v: BallVelocity3d): BallVelocity3d => {
  const speed = Math.hypot(v.x, v.y, v.z);
  return {
    x: -BALL_PHYSICS.airDrag * speed * v.x,
    y: -BALL_PHYSICS.airDrag * speed * v.y,
    z: -BALL_PHYSICS.airDrag * speed * v.z,
  };
};

/** Shared fixed-step integrator. Future spin adds another acceleration term beside gravity/drag. */
export const integrateBallFlight = (ball: PhysicalBall, dt: number): PhysicalBall => {
  // Match stepping may batch time for tests/replay; ball substeps stay fixed and deterministic.
  const maximumStep = 0.025;
  const steps = Math.max(1, Math.ceil(dt / maximumStep));
  const step = dt / steps;
  let current: PhysicalBall = {
    position: { ...ball.position },
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
      const horizontal = Math.hypot(velocity.x, velocity.y);
      const nextSpeed = Math.max(0, horizontal - BALL_PHYSICS.rollingDeceleration * step);
      const factor = horizontal > 0 ? nextSpeed / horizontal : 0;
      velocity = { x: velocity.x * factor, y: velocity.y * factor, z: 0 };
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
): PhysicalBallForecastSample[] => {
  const interval = Math.max(0.025, sampleInterval);
  const samples: PhysicalBallForecastSample[] = [];
  let current = ball;
  for (let at = interval; at <= horizon + 1e-9; at += interval) {
    current = integrateBallFlight(current, interval);
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
