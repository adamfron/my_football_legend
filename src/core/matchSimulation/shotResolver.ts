import { goalIntentToPitch, pitchToGoalIntent } from './goalCoordinates';
import { RandomGenerator } from '../random/RandomGenerator';
import { distance, PITCH_LENGTH, type PitchPoint } from './matchSpace';
import { BALL_RADIUS, GOAL_HEIGHT, findFirstBallContact } from './ballFlight';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { deriveShotExecutionProfile } from './shootingOptions';
import {
  BALL_PHYSICS,
  deriveLaunchVelocity,
  projectFutureBallTrajectory,
  type BallVelocity3d,
} from './ballPhysics';
import { shotExecutionErrorProfileSchema, type ShotExecutionErrorProfile } from './shotIntent';
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
  launchVelocity: BallVelocity3d;
  launchElevation: number;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
/** Sum of twelve uniforms has unit variance and bounded tails, without wild uniform misses. */
const normal = (rng: RandomGenerator) => {
  let sample = -6;
  for (let index = 0; index < 12; index += 1) sample += rng.float();
  return sample;
};

/** Calibrated target-plane deviations; every term describes execution context, not goal chance. */
export const SHOT_EXECUTION_ERROR = {
  minimumHorizontalSigma: 0.12,
  minimumVerticalSigma: 0.1,
  abilityHorizontalWeight: 1.3,
  abilityVerticalWeight: 1.15,
  distanceHorizontalWeight: 0.4,
  distanceVerticalWeight: 0.4,
  angleHorizontalWeight: 0.28,
  angleVerticalWeight: 0.2,
  contactHorizontalWeight: 0.24,
  contactVerticalWeight: 0.32,
  orientationHorizontalWeight: 0.18,
  orientationVerticalWeight: 0.13,
  weakFootHorizontalWeight: 0.2,
  weakFootVerticalWeight: 0.22,
  maximumSigma: 1.65,
} as const;

export const deriveShotExecutionErrorProfile = (
  state: TacticalMatchState,
  action: ShotAction,
): ShotExecutionErrorProfile => {
  const shooter = state.players.find((player) => player.id === action.actorId)!;
  const opportunity = evaluateShootingOpportunity(state, shooter);
  const profile = deriveShotExecutionProfile(state, action);
  const a = shooter.profile.attributes;
  const executionQuality =
    ((action.type === 'header' ? a.heading : a.finishing) * 0.45 +
      a.technique * 0.25 +
      a.composure * 0.3) /
    100;
  const distanceDifficulty = Math.pow(Math.max(0, opportunity.distance - 9) / 26, 1.25);
  const angleDifficulty = 1 - opportunity.angle;
  const pressureDifficulty = Math.max(opportunity.pressure, state.currentPressure);
  const contactDifficulty = profile.firstTimeDifficulty;
  const orientationDifficulty = profile.orientationDifficulty;
  const weakFootDifficulty = profile.dominantFootDifficulty;
  const c = SHOT_EXECUTION_ERROR;
  const horizontalSigma = clamp(
    (c.minimumHorizontalSigma +
      Math.pow(1 - executionQuality, 1.2) * c.abilityHorizontalWeight +
      distanceDifficulty * c.distanceHorizontalWeight +
      angleDifficulty * c.angleHorizontalWeight +
      pressureDifficulty * profile.pressureSensitivity * 1.25 +
      contactDifficulty * c.contactHorizontalWeight +
      orientationDifficulty * c.orientationHorizontalWeight +
      weakFootDifficulty * c.weakFootHorizontalWeight) *
      profile.errorMultiplier,
    c.minimumHorizontalSigma,
    c.maximumSigma,
  );
  const verticalSigma = clamp(
    (c.minimumVerticalSigma +
      Math.pow(1 - executionQuality, 1.15) * c.abilityVerticalWeight +
      distanceDifficulty * c.distanceVerticalWeight +
      angleDifficulty * c.angleVerticalWeight +
      pressureDifficulty * profile.pressureSensitivity +
      contactDifficulty * c.contactVerticalWeight +
      orientationDifficulty * c.orientationVerticalWeight +
      weakFootDifficulty * c.weakFootVerticalWeight) *
      profile.errorMultiplier,
    c.minimumVerticalSigma,
    c.maximumSigma,
  );
  return shotExecutionErrorProfileSchema.parse({
    executionQuality,
    horizontalSigma,
    verticalSigma,
    distanceDifficulty,
    angleDifficulty,
    pressureDifficulty,
    contactDifficulty,
    orientationDifficulty,
    weakFootDifficulty,
  });
};

const defaultTarget = (action: ShotAction, shooter: MatchPlayerState) => ({
  horizontal: clamp(
    pitchToGoalIntent(shooter.team, { y: action.target.y, height: 0 }).horizontal,
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
  const intended = action.goalTarget ? action.goalTarget : defaultTarget(action, shooter);
  const opportunity = evaluateShootingOpportunity(state, shooter);
  const profile = deriveShotExecutionProfile(state, action);
  const executionErrorProfile = deriveShotExecutionErrorProfile(state, action);
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:shot-v3:${state.decisionIndex}:${shooter.id}`,
  );
  const horizontalError = normal(rng) * executionErrorProfile.horizontalSigma;
  const verticalError = normal(rng) * executionErrorProfile.verticalSigma;
  const actual = {
    horizontal: intended.horizontal + horizontalError,
    vertical: intended.vertical + verticalError,
  };
  const goalY = goalIntentToPitch(shooter.team, actual).y;
  const intendedHeightMetres = actual.vertical * GOAL_HEIGHT;
  const nominalSpeed = clamp(profile.nominalSpeed + normal(rng) * 1.8, 13, 38);
  const contactHeight = Math.max(0, state.ball.height ?? 0);
  const contactPoint = { x: state.ball.x, y: state.ball.y };
  const lineEnd = { x: goalX, y: goalY };
  const flightTarget = { ...lineEnd, x: goalX + (attackingRight ? 2 : -2) };
  const length = distance(contactPoint, flightTarget);
  const duration = Math.max(0.28, length / nominalSpeed);
  let launchElevation = Math.atan2(
    Math.max(0, intendedHeightMetres) -
      contactHeight +
      0.5 * BALL_PHYSICS.gravity * duration * duration,
    length,
  );
  let speed = nominalSpeed;
  if (profile.intent === 'chip') {
    // Solve a lofted physical launch with a technique-owned upward component. Goal-plane aiming
    // chooses arrival height, never erases the defining loft. Speed adjusts to range instead.
    const verticalSpeed = Math.max(
      profile.minimumVerticalSpeed,
      Math.sqrt(2 * BALL_PHYSICS.gravity * Math.max(0, intendedHeightMetres - contactHeight)) + 0.3,
    );
    const discriminant = Math.max(
      0,
      verticalSpeed * verticalSpeed -
        2 * BALL_PHYSICS.gravity * (Math.max(0, intendedHeightMetres) - contactHeight),
    );
    const flightTime = Math.max(
      0.35,
      (verticalSpeed + Math.sqrt(discriminant)) / BALL_PHYSICS.gravity,
    );
    const horizontalSpeed = distance(contactPoint, lineEnd) / flightTime;
    speed = Math.hypot(horizontalSpeed, verticalSpeed);
    launchElevation = Math.atan2(verticalSpeed, horizontalSpeed);
  }
  const launchVelocity = deriveLaunchVelocity(contactPoint, flightTarget, speed, launchElevation);
  // A miss below the grass can bounce/roll into the goal. Diagnose the physical goal-plane
  // crossing, rather than classifying the unclamped aiming height as an impossible low miss.
  let previous = { ...contactPoint, z: Math.max(BALL_RADIUS, contactHeight) };
  let classification: CanonicalShot['classification'] = 'wide';
  let heightMetres = intendedHeightMetres;
  for (const sample of projectFutureBallTrajectory(
    { position: previous, velocity: launchVelocity, airborne: true, bounceCount: 0 },
    6,
    0.025,
  )) {
    const next = sample.ball.position;
    const contact = findFirstBallContact({ previous, next, attackingTeam: shooter.team });
    previous = next;
    if (!contact) continue;
    heightMetres = contact.point.z;
    classification =
      contact.kind === 'goal_plane'
        ? 'on_target'
        : contact.kind === 'crossbar'
          ? 'crossbar'
          : contact.kind === 'left_post' || contact.kind === 'right_post'
            ? 'post'
            : contact.point.z > GOAL_HEIGHT
              ? 'over'
              : 'wide';
    break;
  }

  return {
    shotId: `${state.seed}:shot:${state.decisionIndex}:${shooter.id}`,
    shooterId: shooter.id,
    releasedAt: state.time,
    intent: profile.intent,
    contact: profile.contact,
    firstTime: profile.contact !== 'settled',
    ballHeightAtDecision: action.decisionBallHeight ?? contactHeight,
    ballHeightAtContact: contactHeight,
    executionProfile: profile,
    executionErrorProfile,
    launchSpeed: speed,
    launchVerticalComponent: launchVelocity.z,
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
    launchVelocity,
    launchElevation,
  };
};
