import type { MatchPlayerState, TacticalMatchState } from './matchState';
import type { PitchPoint } from './matchSpace';

export type RelativeMovementMode =
  | 'forward'
  | 'diagonal'
  | 'shuffle'
  | 'backpedal'
  | 'turn_and_run';

const TAU = Math.PI * 2;
export const normalizeAngle = (angle: number) =>
  ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
export const angleForVector = (vector: PitchPoint) => Math.atan2(vector.x, vector.y);

export const classifyRelativeMovement = (
  facingAngle: number,
  desiredMovement: PitchPoint,
  distanceRemaining = 0,
): RelativeMovementMode => {
  if (Math.hypot(desiredMovement.x, desiredMovement.y) < 0.05) return 'forward';
  const difference = Math.abs(normalizeAngle(angleForVector(desiredMovement) - facingAngle));
  if (difference < Math.PI / 6) return 'forward';
  if (difference < Math.PI / 3) return 'diagonal';
  if (difference < (2 * Math.PI) / 3) return 'shuffle';
  return distanceRemaining > 9 ? 'turn_and_run' : 'backpedal';
};

export const movementModeSpeedFactor = (mode: RelativeMovementMode) =>
  mode === 'forward'
    ? 1
    : mode === 'turn_and_run'
      ? 0.35
      : mode === 'diagonal'
        ? 0.88
        : mode === 'shuffle'
          ? 0.68
          : 0.52;

/** Football-aware projection: movement is only the fallback, never the universal rule. */
export const deriveOrientationTarget = (
  state: TacticalMatchState,
  player: MatchPlayerState,
): number => {
  const movement = {
    x: player.target.x - player.position.x,
    y: player.target.y - player.position.y,
  };
  const movementDistance = Math.hypot(movement.x, movement.y);
  const ballVector = { x: state.ball.x - player.position.x, y: state.ball.y - player.position.y };
  const defending = player.team !== state.possessionTeam;
  const receptionAware = Boolean(
    state.receptionPreparation?.actorId === player.id &&
      state.time >= state.receptionPreparation.awarenessAt,
  );
  const goalkeeper = player.profile.primaryPosition === 'goalkeeper';
  const carrier = state.ball.ownerId === player.id;
  if (goalkeeper || receptionAware || (defending && movementDistance < 10))
    return angleForVector(ballVector);
  if (carrier && movementDistance < 7) return player.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
  return movementDistance > 0.05 ? angleForVector(movement) : player.facingAngle;
};

/** Deterministic angular integration. Sprint speed reduces the available turn rate. */
export const integrateFacing = (
  current: number,
  desired: number,
  agility: number,
  speed: number,
  dt: number,
) => {
  const stationaryRate = 2.2 + (agility / 100) * 3.8;
  const speedFactor = Math.max(0.38, 1 - speed / 13);
  const maxStep = stationaryRate * speedFactor * dt;
  const delta = normalizeAngle(desired - current);
  return normalizeAngle(current + Math.max(-maxStep, Math.min(maxStep, delta)));
};
