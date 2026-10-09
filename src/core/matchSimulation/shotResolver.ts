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
  ballSpinSchema,
  ZERO_BALL_SPIN,
  type BallSpin3d,
  type BallVelocity3d,
} from './ballPhysics';
import { shotExecutionErrorProfileSchema, type ShotExecutionErrorProfile } from './shotIntent';
import { deriveShootingDifficulty } from './shootingDifficulty';
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
  launchSpin: BallSpin3d;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
/** Sum of twelve uniforms has unit variance and bounded tails, without wild uniform misses. */
const normal = (rng: RandomGenerator) => {
  let sample = -6;
  for (let index = 0; index < 12; index += 1) sample += rng.float();
  return sample;
};

export const deriveShotExecutionErrorProfile = (
  state: TacticalMatchState,
  action: ShotAction,
): ShotExecutionErrorProfile => {
  const shooter = state.players.find((player) => player.id === action.actorId)!;
  const opportunity = evaluateShootingOpportunity(state, shooter);
  const profile = deriveShotExecutionProfile(state, action);
  const firstTime = profile.contact !== 'settled';
  const incomingSpeed = Math.hypot(
    (state.ball.velocity?.x ?? 0) - (firstTime ? shooter.velocity.x : 0),
    (state.ball.velocity?.y ?? 0) - (firstTime ? shooter.velocity.y : 0),
    state.ball.velocity?.z ?? 0,
  );
  const freeKickProfile = action.type === 'shot' ? action.freeKickProfile : undefined;
  const executionShooter = freeKickProfile
    ? {
        ...shooter,
        profile: {
          ...shooter.profile,
          attributes: {
            ...shooter.profile.attributes,
            finishing:
              shooter.profile.attributes.setPieces * 0.7 +
              shooter.profile.attributes.finishing * 0.3,
          },
        },
      }
    : shooter;
  const errorProfile = deriveShootingDifficulty(executionShooter, {
    distance: opportunity.distance,
    angle: opportunity.angle,
    pressure: Math.max(opportunity.pressure, state.currentPressure),
    orientation: profile.orientationDifficulty,
    weakFoot: profile.dominantFootDifficulty,
    incomingSpeed,
    ballHeight: state.ball.height ?? 0,
    contact: profile.contact,
    intent: profile.intent,
    targetWindow: 1 - opportunity.visibleTargetArea,
    blockers: opportunity.blockingDemand,
  });
  if (!freeKickProfile) return errorProfile;
  const demand =
    freeKickProfile === 'power_bend' ? 1.4 : freeKickProfile === 'dipping' ? 1.3 : 1.12;
  const verticalDemand = freeKickProfile === 'dipping' ? demand * 1.18 : demand;
  return shotExecutionErrorProfileSchema.parse({
    ...errorProfile,
    horizontalSigma: errorProfile.horizontalSigma * demand,
    verticalSigma: errorProfile.verticalSigma * verticalDemand,
    horizontalSigmaMetres: errorProfile.horizontalSigmaMetres! * demand,
    verticalSigmaMetres: errorProfile.verticalSigmaMetres! * verticalDemand,
    intrinsicDifficulty: (errorProfile.intrinsicDifficulty ?? 1) * demand,
    executionQuality: errorProfile.executionQuality / demand,
  });
};

/** Bounded launch correction uses the live solver and never adjusts a ball after its release. */
const solveSpinningLaunch = (
  from: { x: number; y: number; z: number },
  goalX: number,
  goalY: number,
  height: number,
  speed: number,
  initialElevation: number,
  spin: BallSpin3d,
) => {
  let heading = Math.atan2(goalY - from.y, goalX - from.x);
  let elevation = initialElevation;
  let velocity = { x: 0, y: 0, z: 0 };
  const metres = Math.max(1, Math.hypot(goalX - from.x, goalY - from.y));
  for (let iteration = 0; iteration < 4; iteration += 1) {
    velocity = {
      x: Math.cos(heading) * speed * Math.cos(elevation),
      y: Math.sin(heading) * speed * Math.cos(elevation),
      z: speed * Math.sin(elevation),
    };
    if (iteration === 3) break;
    let previous = from;
    for (const sample of projectFutureBallTrajectory(
      { position: from, velocity, spin, airborne: true, bounceCount: 0 },
      6,
      0.025,
    )) {
      const next = sample.ball.position;
      const dx = next.x - previous.x;
      const fraction = dx === 0 ? -1 : (goalX - previous.x) / dx;
      if (fraction >= 0 && fraction <= 1) {
        const y = previous.y + (next.y - previous.y) * fraction;
        const z = previous.z + (next.z - previous.z) * fraction;
        heading += Math.sign(goalX - from.x) * Math.atan2(goalY - y, metres) * 0.9;
        elevation = clamp(
          elevation + Math.atan2(Math.max(BALL_RADIUS, height) - z, metres) * 0.9,
          0,
          0.75,
        );
        break;
      }
      previous = next;
    }
  }
  return { velocity, elevation };
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
  // Continue the selected goal ray beyond the line. Extending x alone pulled angled shots
  // toward the shooter's side at the actual goal plane, even with zero execution error.
  const goalRayLength = Math.max(0.001, distance(contactPoint, lineEnd));
  const flightTarget = {
    x: lineEnd.x + ((lineEnd.x - contactPoint.x) / goalRayLength) * 2,
    y: lineEnd.y + ((lineEnd.y - contactPoint.y) / goalRayLength) * 2,
  };
  const length = distance(contactPoint, flightTarget);
  const duration = Math.max(0.28, length / nominalSpeed);
  let launchElevation = Math.atan2(
    Math.max(0, intendedHeightMetres) -
      contactHeight +
      0.5 * BALL_PHYSICS.gravity * duration * duration,
    length,
  );
  let speed = nominalSpeed;
  const freeKickProfile = action.type === 'shot' ? action.freeKickProfile : undefined;
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
  const direction = {
    x: (lineEnd.x - contactPoint.x) / goalRayLength,
    y: (lineEnd.y - contactPoint.y) / goalRayLength,
  };
  let launchSpin: BallSpin3d = ZERO_BALL_SPIN;
  if (freeKickProfile && !['under_wall', 'wall_gap'].includes(freeKickProfile)) {
    const ability =
      (shooter.profile.attributes.setPieces + shooter.profile.attributes.technique) / 200;
    const spinError = 1 + normal(rng) * (1 - ability) * 0.16;
    const lateral =
      freeKickProfile === 'power_bend'
        ? (85 + ability * 25) * spinError
        : freeKickProfile === 'controlled_curl'
          ? (58 + ability * 20) * spinError
          : 0;
    const top = freeKickProfile === 'dipping' ? (75 + ability * 35) * spinError : 10;
    launchSpin = ballSpinSchema.parse({
      x: clamp(-direction.y * top, -160, 160),
      y: clamp(direction.x * top, -160, 160),
      z: clamp(lateral * (shooter.profile.dominantFoot === 'right' ? 1 : -1), -160, 160),
    });
  }
  if (freeKickProfile === 'under_wall') launchElevation = 0;
  let launchVelocity = deriveLaunchVelocity(contactPoint, flightTarget, speed, launchElevation);
  if (launchSpin !== ZERO_BALL_SPIN) {
    const solved = solveSpinningLaunch(
      { ...contactPoint, z: Math.max(BALL_RADIUS, contactHeight) },
      goalX,
      goalY,
      intendedHeightMetres,
      speed,
      launchElevation,
      launchSpin,
    );
    launchVelocity = solved.velocity;
    launchElevation = solved.elevation;
  }
  // A miss below the grass can bounce/roll into the goal. Diagnose the physical goal-plane
  // crossing, rather than classifying the unclamped aiming height as an impossible low miss.
  let previous = { ...contactPoint, z: Math.max(BALL_RADIUS, contactHeight) };
  let classification: CanonicalShot['classification'] = 'wide';
  let heightMetres = intendedHeightMetres;
  for (const sample of projectFutureBallTrajectory(
    {
      position: previous,
      velocity: launchVelocity,
      spin: launchSpin,
      airborne: true,
      bounceCount: 0,
    },
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
    launchSpin,
    ...(freeKickProfile ? { freeKickProfile } : {}),
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
    shooterExecutionQuality: executionErrorProfile.executionQuality,
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
