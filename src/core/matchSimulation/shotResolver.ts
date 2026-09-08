import { RandomGenerator } from '../random/RandomGenerator';
import {
  distance,
  distanceToSegment,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type PitchPoint,
} from './matchSpace';
import { GOAL_HEIGHT, GOAL_POST_RADIUS, GOAL_WIDTH } from './ballFlight';
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
  keeperId?: string;
  reboundVelocity?: PitchPoint;
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
  const attributes = shooter.profile.attributes;
  const execution =
    ((action.type === 'header' ? attributes.heading : attributes.finishing) * 0.45 +
      attributes.technique * 0.3 +
      attributes.composure * 0.25) /
    100;
  const positionalDifficulty = range / 58 + Math.abs(shooter.position.y - PITCH_WIDTH / 2) / 52;
  const errorScale = clamp(
    0.1 + (1 - execution) * 0.72 + pressure * 0.3 + positionalDifficulty * 0.22,
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
  const defender = state.players
    .filter(
      (player) => player.team !== shooter.team && player.profile.primaryPosition !== 'goalkeeper',
    )
    .map((player) => ({
      player,
      lane: distanceToSegment(player.position, shooter.position, lineEnd),
      fromShooter: distance(player.position, shooter.position),
    }))
    .filter(({ lane, fromShooter }) => lane < 1.15 && fromShooter > 1 && fromShooter < range)
    .sort((a, b) => a.lane - b.lane)[0];
  if (defender) {
    const a = defender.player.profile.attributes;
    const reach = clamp(
      0.18 +
        (a.positioning + a.gameReading + a.agility + a.aggression) / 520 -
        defender.lane * 0.2 -
        speed / 150,
      0.04,
      0.78,
    );
    if (rng.bool(reach)) {
      const velocity = {
        x: attackingRight ? -4 - rng.float() * 5 : 4 + rng.float() * 5,
        y: normal(rng) * 6,
      };
      return {
        shooterId: shooter.id,
        intendedTarget: intended,
        actualTarget: actual,
        error: { horizontal: horizontalError, vertical: verticalError },
        speed,
        classification,
        blockerId: defender.player.id,
        outcome: 'block',
        reboundSource: 'block',
        reboundVelocity: velocity,
        goalPoint: lineEnd,
        heightMetres,
      };
    }
  }

  const base = {
    shooterId: shooter.id,
    intendedTarget: intended,
    actualTarget: actual,
    error: { horizontal: horizontalError, vertical: verticalError },
    speed,
    classification,
    goalPoint: lineEnd,
    heightMetres,
  };
  if (classification === 'wide' || classification === 'over') return { ...base, outcome: 'miss' };
  if (classification === 'post' || classification === 'crossbar') {
    const source = classification;
    return {
      ...base,
      outcome: source,
      reboundSource: source,
      reboundVelocity: {
        x: attackingRight ? -5 - rng.float() * 8 : 5 + rng.float() * 8,
        y:
          classification === 'post'
            ? -Math.sign(goalY - PITCH_WIDTH / 2) * (2 + rng.float() * 6)
            : normal(rng) * 4,
      },
    };
  }
  const keeper = state.players.find(
    (player) => player.team !== shooter.team && player.profile.primaryPosition === 'goalkeeper',
  );
  if (!keeper) return { ...base, outcome: 'goal', goalkeeperAction: 'no_chance' };
  const lateralMove = Math.abs(keeper.position.y - goalY);
  const time = range / speed;
  const reaction = 0.38 - keeper.profile.attributes.reflexes * 0.0022 + rng.float() * 0.12;
  const reach =
    Math.max(0, time - reaction) * (3.2 + keeper.profile.attributes.agility * 0.035) + 0.9;
  const difficulty = clamp(
    lateralMove / Math.max(0.5, reach) + speed / 75 + (heightMetres / GOAL_HEIGHT) * 0.12,
    0,
    1,
  );
  if (lateralMove > reach)
    return {
      ...base,
      keeperId: keeper.id,
      goalkeeperAction: 'no_chance',
      saveDifficulty: difficulty,
      outcome: 'goal',
    };
  const keeperQuality =
    (keeper.profile.attributes.reflexes * 0.35 +
      keeper.profile.attributes.handling * 0.25 +
      keeper.profile.attributes.positioning * 0.2 +
      keeper.profile.attributes.oneOnOnes * 0.2) /
    100;
  const saveChance = clamp(0.2 + keeperQuality * 0.72 - difficulty * 0.57, 0.03, 0.94);
  if (!rng.bool(saveChance))
    return {
      ...base,
      keeperId: keeper.id,
      goalkeeperAction: 'failed_save',
      saveDifficulty: difficulty,
      outcome: 'goal',
    };
  const catchChance = clamp(
    keeper.profile.attributes.handling / 115 + (25 - speed) / 24 - difficulty * 0.45,
    0.04,
    0.86,
  );
  if (rng.bool(catchChance))
    return {
      ...base,
      keeperId: keeper.id,
      goalkeeperAction: 'catch',
      saveDifficulty: difficulty,
      outcome: 'save',
    };
  const away = rng.bool(clamp(keeperQuality - difficulty * 0.35, 0.2, 0.8));
  return {
    ...base,
    keeperId: keeper.id,
    goalkeeperAction: away ? 'parry_away' : 'parry',
    saveDifficulty: difficulty,
    outcome: 'save',
    reboundSource: 'goalkeeper',
    reboundVelocity: {
      x: attackingRight ? -5 - rng.float() * 5 : 5 + rng.float() * 5,
      y: away ? Math.sign(goalY - PITCH_WIDTH / 2 || 1) * (5 + rng.float() * 5) : normal(rng) * 4,
    },
  };
};
