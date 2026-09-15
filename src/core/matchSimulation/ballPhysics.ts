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
  let velocity = { ...ball.velocity };
  let airborne = ball.airborne || ball.position.z > BALL_RADIUS || velocity.z > 0;
  let bounceCount = ball.bounceCount;
  if (airborne) {
    const gravity = gravityAcceleration();
    const drag = dragAcceleration(velocity);
    velocity = {
      x: velocity.x + (gravity.x + drag.x) * dt,
      y: velocity.y + (gravity.y + drag.y) * dt,
      z: velocity.z + (gravity.z + drag.z) * dt,
    };
  } else {
    const horizontal = Math.hypot(velocity.x, velocity.y);
    const nextSpeed = Math.max(0, horizontal - BALL_PHYSICS.rollingDeceleration * dt);
    const factor = horizontal > 0 ? nextSpeed / horizontal : 0;
    velocity = { x: velocity.x * factor, y: velocity.y * factor, z: 0 };
  }
  const position = {
    x: ball.position.x + velocity.x * dt,
    y: ball.position.y + velocity.y * dt,
    z: ball.position.z + velocity.z * dt,
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
  return { position, velocity, airborne, bounceCount };
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
