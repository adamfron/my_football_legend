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
