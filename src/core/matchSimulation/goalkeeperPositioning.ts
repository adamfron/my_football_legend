import { GOAL_CENTRE_Y } from './ballFlight';
import { PITCH_LENGTH, type PitchPoint, type TeamSide } from './matchSpace';

/** Positions along the ball-to-goal-centre ray, with depth increasing as play approaches. */
export const deriveGoalkeeperBasePosition = (ball: PitchPoint, side: TeamSide): PitchPoint => {
  const goal = { x: side === 'home' ? 0 : PITCH_LENGTH, y: GOAL_CENTRE_Y };
  const dx = ball.x - goal.x;
  const dy = ball.y - goal.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const proximity = Math.max(0, Math.min(1, 1 - distance / 70));
  const depth = 2.2 + proximity * 5.8;
  return {
    x: goal.x + (dx / distance) * depth,
    y: goal.y + (dy / distance) * depth,
  };
};
