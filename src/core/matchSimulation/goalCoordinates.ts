import { attackDirection, PITCH_LENGTH, PITCH_WIDTH, type TeamSide } from './matchSpace';
import { GOAL_HEIGHT, GOAL_WIDTH } from './ballFlight';

/** Canonical goal basis: positive horizontal follows team-space lateral, not screen X.
 * Execution error can place a point outside the mouth; do not clamp this conversion.
 */
export const goalIntentToPitch = (
  team: TeamSide,
  intent: { horizontal: number; vertical: number },
) => ({
  x: attackDirection(team) > 0 ? PITCH_LENGTH : 0,
  y: PITCH_WIDTH / 2 + intent.horizontal * (GOAL_WIDTH / 2) * attackDirection(team),
  height: intent.vertical * GOAL_HEIGHT,
});

export const pitchToGoalIntent = (team: TeamSide, point: { y: number; height: number }) => ({
  horizontal: ((point.y - PITCH_WIDTH / 2) / (GOAL_WIDTH / 2)) * attackDirection(team),
  vertical: point.height / GOAL_HEIGHT,
});
