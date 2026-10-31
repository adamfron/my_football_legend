import { z } from 'zod';
import { BALL_RADIUS, type FlightPoint } from './ballFlight';
import type { PhysicalPoint } from './matchSpace';

export interface BallVelocity3d {
  x: number;
  y: number;
  z: number;
}
/** Angular velocity in radians/second in the same world axes as the flight. */
export const ballSpinSchema = z.object({
  x: z.number().finite().min(-160).max(160),
  y: z.number().finite().min(-160).max(160),
  z: z.number().finite().min(-160).max(160),
});
export type BallSpin3d = z.infer<typeof ballSpinSchema>;
export const ZERO_BALL_SPIN: BallSpin3d = { x: 0, y: 0, z: 0 };
export interface PhysicalBall {
  position: FlightPoint;
  velocity: BallVelocity3d;
  airborne: boolean;
  bounceCount: number;
  /** Missing in older snapshots and ordinary launches: exactly the zero-spin regime. */
  spin?: BallSpin3d;
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
  magnusCoefficient: 0.0014,
  maximumMagnusAcceleration: 7.5,
  airborneSpinDecay: 0.12,
  rollingSpinDecay: 2.4,
  bounceSpinRetention: 0.55,
  /** Event-v1 Coulomb impact coefficient; an uncalibrated grass/material assumption. */
  groundImpactFriction: 0.45,
} as const;

export const ballEnvironmentSchema = z.object({
  rollingResistanceMultiplier: z.number().positive(),
  /** Omission preserves the exact historical fixed-step collision rule. */
  groundContact: z.enum(['legacy-v1', 'event-v1']).optional(),
});
export type BallEnvironment = z.infer<typeof ballEnvironmentSchema>;
export const NEUTRAL_BALL_ENVIRONMENT: BallEnvironment = { rollingResistanceMultiplier: 1 };
const finiteVectorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export const groundImpactEventSchema = z.object({
  at: z.number().nonnegative().finite(),
  position: finiteVectorSchema,
  incomingVelocity: finiteVectorSchema,
  outgoingVelocity: finiteVectorSchema,
  incomingSpin: ballSpinSchema,
  outgoingSpin: ballSpinSchema,
  normalDelta: z.number().nonnegative().finite(),
  tangentDelta: z.number().nonnegative().finite(),
});
export type GroundImpactEvent = z.infer<typeof groundImpactEventSchema>;

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

/** Bounded Magnus lift is perpendicular to velocity; it cannot propel a stationary ball. */
export const magnusAcceleration = (
  velocity: BallVelocity3d,
  spin: BallSpin3d = ZERO_BALL_SPIN,
): BallVelocity3d => {
  const coefficient = BALL_PHYSICS.magnusCoefficient;
  const acceleration = {
    x: coefficient * (spin.y * velocity.z - spin.z * velocity.y),
    y: coefficient * (spin.z * velocity.x - spin.x * velocity.z),
    z: coefficient * (spin.x * velocity.y - spin.y * velocity.x),
  };
  const scale = Math.min(
    1,
    BALL_PHYSICS.maximumMagnusAcceleration /
      Math.max(0.000001, Math.hypot(acceleration.x, acceleration.y, acceleration.z)),
  );
  return { x: acceleration.x * scale, y: acceleration.y * scale, z: acceleration.z * scale };
};

const dampSpin = (spin: BallSpin3d, retention: number): BallSpin3d => ({
  x: spin.x * retention,
  y: spin.y * retention,
  z: spin.z * retention,
});

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

/** Event-aware substep within the same canonical integrator. Acceleration is held over
 * each free-flight segment. Solve z(t)=R before applying restitution, then consume the
 * remaining time. Coulomb impulse depends on actual incoming normal momentum, so its
 * horizontal effect vanishes with hop height instead of removing a fixed speed fraction. */
const integrateGroundContactStep = (
  initial: PhysicalBall,
  dt: number,
  environment: BallEnvironment,
  observeImpact?: (event: GroundImpactEvent) => void,
): PhysicalBall => {
  let current = initial;
  let remaining = dt;
  const roll = (ball: PhysicalBall, seconds: number): PhysicalBall => {
    const rolled = integrateGroundRolling(ball.position, ball.velocity, seconds, environment);
    return {
      position: { ...rolled.position, z: BALL_RADIUS },
      velocity: { ...rolled.velocity, z: 0 },
      airborne: false,
      bounceCount: ball.bounceCount,
      ...(ball.spin
        ? { spin: dampSpin(ball.spin, Math.exp(-BALL_PHYSICS.rollingSpinDecay * seconds)) }
        : {}),
    };
  };
  while (remaining > 0) {
    if (current.position.z <= BALL_RADIUS && current.velocity.z === 0)
      return roll(current, remaining);
    const drag = dragAcceleration(current.velocity);
    const magnus = magnusAcceleration(current.velocity, current.spin);
    const acceleration = {
      x: drag.x + magnus.x,
      y: drag.y + magnus.y,
      z: -BALL_PHYSICS.gravity + drag.z + magnus.z,
    };
    const height = Math.max(0, current.position.z - BALL_RADIUS);
    const vz = current.velocity.z;
    // Stable positive root, including a launch from the surface and immediate impact.
    const discriminant = vz * vz - 2 * acceleration.z * height;
    const impactTime =
      height === 0 && vz < 0
        ? 0
        : acceleration.z < 0 && discriminant >= 0
          ? vz >= 0
            ? (vz + Math.sqrt(discriminant)) / -acceleration.z
            : (2 * height) / (Math.sqrt(discriminant) - vz)
          : vz < 0 && discriminant >= 0
            ? (2 * height) / (Math.sqrt(discriminant) - vz)
            : Infinity;
    const impact = impactTime <= remaining;
    const seconds = impact ? impactTime : remaining;
    const velocity = {
      x: current.velocity.x + acceleration.x * seconds,
      y: current.velocity.y + acceleration.y * seconds,
      z: current.velocity.z + acceleration.z * seconds,
    };
    const position = {
      x: current.position.x + current.velocity.x * seconds + 0.5 * acceleration.x * seconds ** 2,
      y: current.position.y + current.velocity.y * seconds + 0.5 * acceleration.y * seconds ** 2,
      z: impact
        ? BALL_RADIUS
        : current.position.z + vz * seconds + 0.5 * acceleration.z * seconds ** 2,
    };
    let spin = current.spin
      ? dampSpin(current.spin, Math.exp(-BALL_PHYSICS.airborneSpinDecay * seconds))
      : undefined;
    current = {
      position,
      velocity,
      airborne: true,
      bounceCount: current.bounceCount,
      ...(spin ? { spin } : {}),
    };
    if (!impact) return current;
    remaining = Math.max(0, remaining - seconds);
    const normalDelta = (1 + BALL_PHYSICS.verticalRestitution) * Math.max(0, -velocity.z);
    // Hollow sphere: I/(mR²)=2/3. Contact slip includes omega cross (0,0,-R).
    const slipX = velocity.x - (spin?.y ?? 0) * BALL_RADIUS;
    const slipY = velocity.y + (spin?.x ?? 0) * BALL_RADIUS;
    const slip = Math.hypot(slipX, slipY);
    let tangentDelta = Math.min(BALL_PHYSICS.groundImpactFriction * normalDelta, slip / 2.5);
    // Preserve the shared finite-spin envelope by scaling the SAME linear/torque impulse.
    const spinDeltaX = slip === 0 ? 0 : (-(1.5 / BALL_RADIUS) * tangentDelta * slipY) / slip;
    const spinDeltaY = slip === 0 ? 0 : ((1.5 / BALL_RADIUS) * tangentDelta * slipX) / slip;
    let scale = 1;
    for (const [value, change] of [
      [spin?.x ?? 0, spinDeltaX],
      [spin?.y ?? 0, spinDeltaY],
    ] as const) {
      if (change > 0) scale = Math.min(scale, (160 - value) / change);
      if (change < 0) scale = Math.min(scale, (-160 - value) / change);
    }
    scale = Math.max(0, scale);
    tangentDelta *= scale;
    const incomingVelocity = observeImpact ? { ...velocity } : undefined;
    const incomingSpin = observeImpact ? { ...(spin ?? ZERO_BALL_SPIN) } : undefined;
    if (slip > 0) {
      velocity.x -= (tangentDelta * slipX) / slip;
      velocity.y -= (tangentDelta * slipY) / slip;
    }
    if (spin || tangentDelta > 0)
      spin = {
        x: (spin?.x ?? 0) + spinDeltaX * scale,
        y: (spin?.y ?? 0) + spinDeltaY * scale,
        z: spin?.z ?? 0,
      };
    velocity.z = Math.max(0, -velocity.z) * BALL_PHYSICS.verticalRestitution;
    if (observeImpact && incomingVelocity && incomingSpin)
      observeImpact({
        at: dt - remaining,
        position: { ...position },
        incomingVelocity,
        outgoingVelocity: { ...velocity },
        incomingSpin,
        outgoingSpin: { ...(spin ?? ZERO_BALL_SPIN) },
        normalDelta,
        tangentDelta,
      });
    current = {
      position,
      velocity,
      airborne: true,
      bounceCount: current.bounceCount + 1,
      ...(spin ? { spin } : {}),
    };
    // Resolve the inelastic Zeno tail only after impact. Remaining vertical specific
    // energy < 5e-15 J/kg, apex < 6e-16 m; never clamp a finite upward launch.
    if (velocity.z < 1e-7) return roll(current, remaining);
  }
  return current;
};

/** Shared fixed-step integrator for ordinary and spinning launches, forecasts and live play. */
export const integrateBallFlight = (
  ball: PhysicalBall,
  dt: number,
  environment: BallEnvironment = NEUTRAL_BALL_ENVIRONMENT,
  observeImpact?: (event: GroundImpactEvent) => void,
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
    ...(ball.spin ? { spin: { ...ball.spin } } : {}),
  };
  for (let index = 0; index < steps; index += 1) {
    if (environment.groundContact === 'event-v1') {
      current = integrateGroundContactStep(
        current,
        step,
        environment,
        observeImpact
          ? (event) => observeImpact({ ...event, at: index * step + event.at })
          : undefined,
      );
      continue;
    }
    let velocity = { ...current.velocity };
    let airborne = current.airborne || current.position.z > BALL_RADIUS || velocity.z > 0;
    let bounceCount = current.bounceCount;
    let spin = current.spin;
    if (airborne) {
      const gravity = gravityAcceleration();
      const drag = dragAcceleration(velocity);
      velocity = {
        x: velocity.x + (gravity.x + drag.x) * step,
        y: velocity.y + (gravity.y + drag.y) * step,
        z: velocity.z + (gravity.z + drag.z) * step,
      };
      // Preserve every arithmetic operation in the existing zero-spin calibration.
      if (spin && (spin.x !== 0 || spin.y !== 0 || spin.z !== 0)) {
        const magnus = magnusAcceleration(current.velocity, spin);
        velocity.x += magnus.x * step;
        velocity.y += magnus.y * step;
        velocity.z += magnus.z * step;
        spin = dampSpin(spin, Math.exp(-BALL_PHYSICS.airborneSpinDecay * step));
      }
    } else {
      const rolled = integrateGroundRolling(current.position, velocity, step, environment);
      current = {
        position: { ...rolled.position, z: BALL_RADIUS },
        velocity: { ...rolled.velocity, z: 0 },
        airborne: false,
        bounceCount,
        ...(spin ? { spin: dampSpin(spin, Math.exp(-BALL_PHYSICS.rollingSpinDecay * step)) } : {}),
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
      if (spin) spin = dampSpin(spin, BALL_PHYSICS.bounceSpinRetention);
      if (velocity.z < BALL_PHYSICS.settleVerticalSpeed) {
        velocity.z = 0;
        airborne = false;
      }
    }
    current = { position, velocity, airborne, bounceCount, ...(spin ? { spin } : {}) };
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
    maximumSpeed?: number;
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
      Math.min(options.maximumSpeed ?? Infinity, Math.hypot(horizontalSpeed, verticalSpeed)),
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
