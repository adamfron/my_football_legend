import { describe, expect, it } from 'vitest';
import { BALL_RADIUS } from './ballFlight';
import { deriveLaunchVelocity, integrateBallFlight, type PhysicalBall } from './ballPhysics';

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
