import { RandomGenerator } from '../random/RandomGenerator';
import { distance, PITCH_LENGTH, PITCH_WIDTH, type PitchPoint } from './matchSpace';
import { GOAL_HEIGHT, GOAL_POST_RADIUS, GOAL_WIDTH } from './ballFlight';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import type {
  MatchAction,
  MatchPlayerState,
  ShotDiagnostic,
  TacticalMatchState,
} from './matchState';

type ShotAction = Extract<MatchAction, { type: 'shot' | 'header' }>;
export interface CanonicalShot extends ShotDiagnostic {
  goalPoint: PitchPoint;
  heightMetres: number;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const normal = (rng: RandomGenerator) =>
  (rng.float() + rng.float() + rng.float() + rng.float() + rng.float() + rng.float() - 3) / 1.22;

const defaultTarget = (action: ShotAction, shooter: MatchPlayerState) => ({
  horizontal: clamp(
    ((action.target.y - PITCH_WIDTH / 2) / (GOAL_WIDTH / 2)) * (shooter.team === 'home' ? 1 : -1),
    -1,
    1,
  ),
  vertical:
    action.type === 'header'
      ? 0.55
      : action.intent === 'chip'
        ? 0.72
        : action.intent === 'driven'
          ? 0.28
          : 0.38,
});

/** Pure, deterministic sporting resolver shared by user-controlled, NPC and headed shots. */
export const resolveCanonicalShot = (
  state: TacticalMatchState,
  action: ShotAction,
): CanonicalShot => {
  const shooter = state.players.find((player) => player.id === action.actorId)!;
  const attackingRight = shooter.team === 'home';
  const goalX = attackingRight ? PITCH_LENGTH : 0;
  const goalCentre = { x: goalX, y: PITCH_WIDTH / 2 };
  const intended =
    action.type === 'shot' && action.goalTarget
      ? action.goalTarget
      : defaultTarget(action, shooter);
  const range = distance(shooter.position, goalCentre);
  const pressure = state.currentPressure;
  const opportunity = evaluateShootingOpportunity(state, shooter);
  const attributes = shooter.profile.attributes;
  const execution =
    ((action.type === 'header' ? attributes.heading : attributes.finishing) * 0.45 +
      attributes.technique * 0.3 +
      attributes.composure * 0.25) /
    100;
  const longRangePenalty = Math.pow(Math.max(0, range - 14) / 22, 1.65);
  const positionalDifficulty =
    range / 72 + longRangePenalty + Math.abs(shooter.position.y - PITCH_WIDTH / 2) / 48;
  const powerAccuracyPenalty =
    action.type === 'shot' && action.intent === 'driven' ? range / 135 : 0;
  const errorScale = clamp(
    0.08 +
      (1 - execution) * 0.66 +
      pressure * 0.34 +
      positionalDifficulty * 0.3 +
      powerAccuracyPenalty,
    0.1,
    1.15,
  );
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:shot-v2:${state.decisionIndex}:${shooter.id}`,
  );
  const horizontalError = normal(rng) * errorScale;
  const verticalError = normal(rng) * errorScale * 0.62;
  const actual = {
    horizontal: intended.horizontal + horizontalError,
    vertical: intended.vertical + verticalError,
  };
  const goalY = PITCH_WIDTH / 2 + actual.horizontal * (GOAL_WIDTH / 2) * (attackingRight ? 1 : -1);
  const heightMetres = actual.vertical * GOAL_HEIGHT;
  const speed = clamp(
    (action.type === 'header'
      ? 19
      : action.intent === 'driven'
        ? 31
        : action.intent === 'chip'
          ? 17
          : 25) +
      attributes.technique * 0.045 +
      normal(rng) * 1.8,
    13,
    38,
  );
  const postDelta = Math.abs(Math.abs(goalY - PITCH_WIDTH / 2) - GOAL_WIDTH / 2);
  const barDelta = Math.abs(heightMetres - GOAL_HEIGHT);
  let classification: CanonicalShot['classification'] =
    Math.abs(goalY - PITCH_WIDTH / 2) <= GOAL_WIDTH / 2 &&
    heightMetres >= 0 &&
    heightMetres <= GOAL_HEIGHT
      ? 'on_target'
      : heightMetres > GOAL_HEIGHT
        ? 'over'
        : 'wide';
  if (
    heightMetres >= 0 &&
    heightMetres <= GOAL_HEIGHT + GOAL_POST_RADIUS &&
    postDelta <= GOAL_POST_RADIUS
  )
    classification = 'post';
  else if (Math.abs(goalY - PITCH_WIDTH / 2) <= GOAL_WIDTH / 2 && barDelta <= GOAL_POST_RADIUS)
    classification = 'crossbar';

  const lineEnd = { x: goalX, y: goalY };
  return {
    shotId: `${state.seed}:shot:${state.decisionIndex}:${shooter.id}`,
    shooterId: shooter.id,
    context:
      action.type === 'header'
        ? 'header'
        : state.scenario === 'penalty'
          ? 'penalty'
          : state.scenario.startsWith('free_kick')
            ? 'free_kick'
            : 'open_play',
    distance: opportunity.distance,
    angle: opportunity.angle,
    pressure: opportunity.pressure,
    blockingDefenders: opportunity.blockingDefenders,
    baseXg: opportunity.baseXg,
    effectiveScoringExpectation: opportunity.effectiveScoringExpectation,
    shooterExecutionQuality: opportunity.shooterExecutionQuality,
    intendedTarget: intended,
    actualTarget: actual,
    error: { horizontal: horizontalError, vertical: verticalError },
    speed,
    classification,
    goalPoint: lineEnd,
    heightMetres,
  };
};
