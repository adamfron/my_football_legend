import { GOAL_CENTRE_Y } from './ballFlight';
import { PITCH_LENGTH, type PitchPoint, type TeamSide } from './matchSpace';

export const GOALKEEPER_BASE_POSITION = {
  /** Metres from goal line in settled shape; active claim/rush commitments use their own target. */
  minimumDepth: 1,
  closePlayDepthIncrease: 2.5,
  proximityRange: 70,
} as const;

/** Positions along the ball-to-goal-centre ray, with bounded depth as play approaches. */
export const deriveGoalkeeperBasePosition = (ball: PitchPoint, side: TeamSide): PitchPoint => {
  const goal = { x: side === 'home' ? 0 : PITCH_LENGTH, y: GOAL_CENTRE_Y };
  const dx = ball.x - goal.x;
  const dy = ball.y - goal.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const proximity = Math.max(
    0,
    Math.min(1, 1 - distance / GOALKEEPER_BASE_POSITION.proximityRange),
  );
  const depth =
    GOALKEEPER_BASE_POSITION.minimumDepth +
    proximity * GOALKEEPER_BASE_POSITION.closePlayDepthIncrease;
  return {
    x: goal.x + (dx / distance) * depth,
    y: goal.y + (dy / distance) * depth,
  };
};
