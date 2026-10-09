import { describe, expect, it } from 'vitest';
import { BALL_RADIUS } from './ballFlight';
import {
  BALL_PHYSICS,
  deriveAerialLaunchPlan,
  deriveLaunchVelocity,
  integrateBallFlight,
  projectFutureBallTrajectory,
  magnusAcceleration,
  type PhysicalBall,
} from './ballPhysics';

const run = (initial: PhysicalBall, seconds: number) => {
  let ball = initial;
  const heights: number[] = [];
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.02) {
    ball = integrateBallFlight(ball, 0.02);
    heights.push(ball.position.z);
  }
  return { ball, heights };
};

describe('shared fixed-step ball physics', () => {
  it('applies drag and makes an upward ball rise, apex and descend', () => {
    const velocity = deriveLaunchVelocity({ x: 0, y: 0 }, { x: 50, y: 0 }, 35, 0.3);
    const result = run(
      { position: { x: 0, y: 0, z: BALL_RADIUS }, velocity, airborne: true, bounceCount: 0 },
      2.4,
    );
    expect(Math.max(...result.heights)).toBeGreaterThan(2);
    expect(result.heights.at(-1)).toBeLessThan(Math.max(...result.heights));
    expect(Math.hypot(result.ball.velocity.x, result.ball.velocity.y)).toBeLessThan(
      Math.hypot(velocity.x, velocity.y),
    );
  });

  it('loses bounce energy while preserving horizontal direction', () => {
    const result = run(
      {
        position: { x: 0, y: 0, z: 1 },
        velocity: { x: 16, y: 3, z: -4 },
        airborne: true,
        bounceCount: 0,
      },
      3,
    );
    expect(result.ball.bounceCount).toBeGreaterThan(0);
    expect(result.ball.velocity.x).toBeGreaterThan(0);
    expect(result.ball.velocity.y).toBeGreaterThan(0);
    expect(
      Math.hypot(result.ball.velocity.x, result.ball.velocity.y, result.ball.velocity.z),
    ).toBeLessThan(Math.hypot(16, 3, -4));
  });
});

describe('PR159 canonical spin', () => {
  const launch: PhysicalBall = {
    position: { x: 20, y: 34, z: 1 },
    velocity: { x: 28, y: 0, z: 9 },
    airborne: true,
    bounceCount: 0,
  };
  it('keeps the calibrated zero-spin trajectory exactly unchanged', () => {
    const ordinary = integrateBallFlight(launch, 0.5);
    const spinning = integrateBallFlight({ ...launch, spin: { x: 0, y: 0, z: 0 } }, 0.5);
    expect(spinning.position).toEqual(ordinary.position);
    expect(spinning.velocity).toEqual(ordinary.velocity);
    expect(spinning.bounceCount).toBe(ordinary.bounceCount);
  });
  it('bends oppositely with opposite lateral spin and applies actual topspin drop', () => {
    const right = integrateBallFlight({ ...launch, spin: { x: 0, y: 0, z: 80 } }, 0.6);
    const left = integrateBallFlight({ ...launch, spin: { x: 0, y: 0, z: -80 } }, 0.6);
    expect(right.position.y - 34).toBeGreaterThan(0.3);
    expect(left.position.y - 34).toBeCloseTo(-(right.position.y - 34), 10);
    const ordinary = integrateBallFlight(launch, 0.6);
    const dipping = integrateBallFlight({ ...launch, spin: { x: 0, y: 100, z: 0 } }, 0.6);
    expect(dipping.position.z).toBeLessThan(ordinary.position.z - 0.3);
    expect(dipping.velocity.z).toBeLessThan(ordinary.velocity.z);
  });
  it('uses identical spin in the forecast, fixed runtime and equivalent batching', () => {
    const initial = { ...launch, spin: { x: 0, y: 70, z: 90 } };
    let live = initial;
    for (let tick = 0; tick < 4; tick++) live = integrateBallFlight(live, 0.025) as typeof initial;
    expect(integrateBallFlight(initial, 0.1)).toEqual(live);
    expect(projectFutureBallTrajectory(initial, 0.1, 0.025).at(-1)?.ball).toEqual(live);
  });
  it('mirrors the same spinning flight correctly toward either goal', () => {
    const initial = { ...launch, spin: { x: 5, y: 70, z: 90 } };
    const result = integrateBallFlight(initial, 0.5);
    const mirrored = integrateBallFlight(
      {
        ...initial,
        position: {
          x: 105 - initial.position.x,
          y: 68 - initial.position.y,
          z: initial.position.z,
        },
        velocity: { x: -initial.velocity.x, y: -initial.velocity.y, z: initial.velocity.z },
        spin: { x: -initial.spin.x, y: -initial.spin.y, z: initial.spin.z },
      },
      0.5,
    );
    expect(mirrored.position.x).toBeCloseTo(105 - result.position.x, 10);
    expect(mirrored.position.y).toBeCloseTo(68 - result.position.y, 10);
    expect(mirrored.position.z).toBeCloseTo(result.position.z, 10);
  });
  it('bounds Magnus lift and loses spin on grass contact instead of curving forever', () => {
    expect(magnusAcceleration({ x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 100 })).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
    const acceleration = magnusAcceleration({ x: 100, y: 0, z: 0 }, { x: 0, y: 160, z: 160 });
    expect(Math.hypot(acceleration.x, acceleration.y, acceleration.z)).toBeLessThanOrEqual(
      BALL_PHYSICS.maximumMagnusAcceleration,
    );
    const impact = integrateBallFlight(
      {
        ...launch,
        position: { x: 20, y: 34, z: 0.12 },
        velocity: { x: 18, y: 0, z: -2 },
        spin: { x: 0, y: 80, z: 50 },
      },
      0.025,
    );
    expect(impact.bounceCount).toBe(1);
    expect(impact.spin!.y).toBeLessThan(80 * BALL_PHYSICS.bounceSpinRetention);
    const rolling = integrateBallFlight(
      {
        ...impact,
        airborne: false,
        position: { ...impact.position, z: BALL_RADIUS },
        velocity: { x: 18, y: 0, z: 0 },
      },
      1,
    );
    expect(rolling.spin!.y).toBeLessThan(impact.spin!.y * 0.1);
    expect(rolling.position.y).toBe(impact.position.y);
  });
});

it('slows a 50 metre high-speed flight and continuously changes vertical velocity', () => {
  const initialVelocity = deriveLaunchVelocity({ x: 0, y: 0 }, { x: 50, y: 0 }, 34, 0.28);
  let ball: PhysicalBall = {
    position: { x: 0, y: 0, z: BALL_RADIUS },
    velocity: initialVelocity,
    airborne: true,
    bounceCount: 0,
  };
  const verticalVelocities: number[] = [];
  while (ball.position.x < 50 && ball.position.x < 70) {
    ball = integrateBallFlight(ball, 0.025);
    verticalVelocities.push(ball.velocity.z);
  }
  expect(Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z)).toBeLessThan(34);
  expect(verticalVelocities.some((velocity) => velocity > 0)).toBe(true);
  expect(verticalVelocities.some((velocity) => velocity < 0)).toBe(true);
});

it('settles repeated bounces into rolling and rolling decelerates without reversing', () => {
  let ball: PhysicalBall = {
    position: { x: 0, y: 0, z: 2 },
    velocity: { x: 14, y: 2, z: -3 },
    airborne: true,
    bounceCount: 0,
  };
  const bounceSpeeds: number[] = [];
  let previousBounces = 0;
  for (let index = 0; index < 500 && ball.airborne; index += 1) {
    ball = integrateBallFlight(ball, 0.025);
    if (ball.bounceCount > previousBounces) bounceSpeeds.push(Math.abs(ball.velocity.z));
    previousBounces = ball.bounceCount;
  }
  expect(bounceSpeeds.length).toBeGreaterThan(1);
  expect(bounceSpeeds.at(-1)).toBeLessThan(bounceSpeeds[0]!);
  expect(ball.airborne).toBe(false);
  const rollingSpeed = Math.hypot(ball.velocity.x, ball.velocity.y);
  expect(rollingSpeed).toBeGreaterThan(0);
  const later = integrateBallFlight(ball, 0.5);
  expect(Math.hypot(later.velocity.x, later.velocity.y)).toBeLessThan(rollingSpeed);
  expect(later.velocity.x).toBeGreaterThanOrEqual(0);
  expect(later.velocity.y).toBeGreaterThanOrEqual(0);
});

it('is invariant to equivalent deterministic substep batching', () => {
  const initial: PhysicalBall = {
    position: { x: 0, y: 0, z: BALL_RADIUS },
    velocity: { x: 28, y: 3, z: 10 },
    airborne: true,
    bounceCount: 0,
  };
  const batched = integrateBallFlight(initial, 0.1);
  let fixed = initial;
  for (let index = 0; index < 4; index += 1) fixed = integrateBallFlight(fixed, 0.025);
  expect(batched).toEqual(fixed);
});

describe('PR145 grass resistance and canonical loft', () => {
  const rolling = (speed: number): PhysicalBall => ({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: speed, y: 0, z: 0 },
    airborne: false,
    bounceCount: 0,
  });
  it('stops weak, firm and clearance contacts at increasing physical distances without a clamp', () => {
    const distances = [8, 15, 27].map((speed) => {
      const result = run(rolling(speed), 12).ball;
      expect(result.velocity).toEqual({ x: 0, y: 0, z: 0 });
      expect(result.position.z).toBe(BALL_RADIUS);
      expect(result.position.x).toBeCloseTo(
        (speed * speed) / (2 * BALL_PHYSICS.rollingDeceleration),
        0,
      );
      return result.position.x;
    });
    expect(distances[0]).toBeLessThan(12);
    expect(distances[1]).toBeGreaterThan(30);
    expect(distances[2]).toBeGreaterThan(100);
  });
  it('monotonically loses speed without reversing and supports a neutral resistance multiplier', () => {
    let ball = rolling(8);
    let previousSpeed = 8;
    for (let index = 0; index < 180; index += 1) {
      ball = integrateBallFlight(ball, 0.025);
      expect(ball.velocity.x).toBeGreaterThanOrEqual(0);
      expect(ball.velocity.x).toBeLessThanOrEqual(previousSpeed);
      previousSpeed = ball.velocity.x;
    }
    expect(previousSpeed).toBe(0);
    const neutral = integrateBallFlight(rolling(8), 1, { rollingResistanceMultiplier: 1 });
    const strongerResistance = integrateBallFlight(rolling(8), 1, {
      rollingResistanceMultiplier: 1.5,
    });
    expect(strongerResistance.position.x).toBeLessThan(neutral.position.x);
    const airborne = {
      ...rolling(8),
      position: { x: 0, y: 0, z: 4 },
      airborne: true,
      velocity: { x: 8, y: 0, z: 5 },
    };
    expect(integrateBallFlight(airborne, 0.2, { rollingResistanceMultiplier: 1.5 })).toEqual(
      integrateBallFlight(airborne, 0.2),
    );
  });
  it('uses distance and delivery intent to launch meaningful, deterministic physical loft', () => {
    const short = deriveAerialLaunchPlan({ x: 0, y: 0 }, { x: 8, y: 0 }, 'pass');
    const long = deriveAerialLaunchPlan({ x: 0, y: 0 }, { x: 50, y: 0 }, 'long_pass');
    const cross = deriveAerialLaunchPlan({ x: 0, y: 0 }, { x: 25, y: 0 }, 'cross');
    const driven = deriveAerialLaunchPlan({ x: 0, y: 0 }, { x: 25, y: 0 }, 'driven_cross');
    expect(short.velocity.z).toBeGreaterThan(3);
    expect(short.predictedApex).toBeGreaterThan(0.9);
    expect(short.predictedApex).toBeLessThan(2);
    expect(long.predictedApex).toBeGreaterThan(short.predictedApex + 3);
    expect(long.predictedFlightTime).toBeGreaterThan(short.predictedFlightTime);
    expect(cross.predictedApex).toBeGreaterThan(driven.predictedApex);
    expect(long).toEqual(deriveAerialLaunchPlan({ x: 0, y: 0 }, { x: 50, y: 0 }, 'long_pass'));
    for (const [metres, plan] of [
      [8, short],
      [50, long],
      [25, cross],
    ] as const) {
      const samples = projectFutureBallTrajectory(
        {
          position: { x: 0, y: 0, z: plan.releaseHeight },
          velocity: plan.velocity,
          airborne: true,
          bounceCount: 0,
        },
        plan.predictedFlightTime + 0.025,
        0.025,
      );
      const arrival = samples.find(
        (sample) => sample.ball.velocity.z < 0 && sample.ball.position.z <= plan.arrivalHeight,
      )!;
      expect(Math.abs(arrival.ball.position.x - metres)).toBeLessThan(1);
    }
  });
});
