import { BALL_RADIUS } from './ballFlight';
import type { PhysicalBall } from './ballPhysics';

/** Abstract venue perimeter shared by off-pitch retrieval bodies and the real stopped ball. */
export const DEAD_BALL_RUNOFF_METRES = 8;

export const resolveDeadBallPerimeter = (ball: PhysicalBall): PhysicalBall => {
  const position = { ...ball.position },
    velocity = { ...ball.velocity };
  for (const [axis, maximum] of [
    ['x', 105],
    ['y', 68],
  ] as const) {
    const low = -DEAD_BALL_RUNOFF_METRES + BALL_RADIUS;
    const high = maximum + DEAD_BALL_RUNOFF_METRES - BALL_RADIUS;
    if (position[axis] < low && velocity[axis] < 0) {
      position[axis] = low;
      velocity[axis] *= -0.08;
    } else if (position[axis] > high && velocity[axis] > 0) {
      position[axis] = high;
      velocity[axis] *= -0.08;
    }
  }
  return { ...ball, position, velocity };
};
