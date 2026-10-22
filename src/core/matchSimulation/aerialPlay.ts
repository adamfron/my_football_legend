import { attacksRight } from './matchSpace';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { RandomGenerator } from '../random/RandomGenerator';
import { z } from 'zod';
import { pitchPointSchema } from './matchSpace';
import { distance, type PitchPoint, type TeamSide } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { canContactAfterThrowIn } from './throwIn';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { deriveFitnessPhysicalModifiers } from './matchFitness';
import { canParticipatePhysically } from './matchInjuries';

export type AerialOutcome = NonNullable<TacticalMatchState['lastAerialResult']>;
export const aerialContactLockSchema = z.object({
  playerId: z.string(),
  point: pitchPointSchema,
  at: z.number().nonnegative(),
});

/** A new action/owner ID cannot re-arm continuous body overlap. Real separation can. */
export const activeAerialContactLocks = (state: TacticalMatchState) =>
  (state.aerialContactLocks ?? []).filter((lock) => {
    const player = state.players.find((p) => p.id === lock.playerId);
    return (
      player &&
      distance(player.position, state.ball) < 1.6 &&
      (state.ball.height ?? 0) > 0.45 &&
      (state.ball.height ?? 0) < player.profile.heightCm / 100 + 0.55
    );
  });

export interface AerialContactCandidate {
  playerId: string;
  horizontalDistance: number;
  ballHeight: number;
  reachableHeight: number;
  contactQuality: number;
}

/** Geometry-only eligibility. Ability can rank a duel, but cannot manufacture contact. */
export const evaluateAerialContact = (
  player: MatchPlayerState,
  ball: PitchPoint & { height?: number },
  lookaheadSeconds = 0.025,
): AerialContactCandidate | undefined => {
  if (isMatchGoalkeeper(player)) return undefined;
  const predicted = {
    x: player.position.x + player.velocity.x * lookaheadSeconds,
    y: player.position.y + player.velocity.y * lookaheadSeconds,
  };
  const horizontalDistance = distance(predicted, ball);
  const reachableHeight =
    player.profile.heightCm / 100 + 0.18 + player.profile.attributes.jumping * 0.004;
  const ballHeight = ball.height ?? 0;
  const contactRadius =
    0.72 + Math.min(0.28, Math.hypot(player.velocity.x, player.velocity.y) * 0.025);
  if (horizontalDistance > contactRadius || ballHeight < 0.65 || ballHeight > reachableHeight)
    return undefined;
  return {
    playerId: player.id,
    horizontalDistance,
    ballHeight,
    reachableHeight,
    contactQuality:
      Math.max(0, 1 - horizontalDistance / contactRadius) *
      Math.max(0, 1 - Math.abs(reachableHeight - ballHeight) / reachableHeight),
  };
};

export const findAerialContactCandidates = (
  state: TacticalMatchState,
  lookaheadSeconds = 0.025,
) => {
  const lockedIds = new Set(activeAerialContactLocks(state).map((lock) => lock.playerId));
  return state.players
    .filter(
      (p) =>
        !isMatchGoalkeeper(p) &&
        distance(p.position, state.ball) < 2.2 &&
        !lockedIds.has(p.id) &&
        canContactAfterThrowIn(state, p.id),
    )
    .map((p) => ({ player: p, contact: evaluateAerialContact(p, state.ball, lookaheadSeconds) }))
    .filter((entry): entry is { player: MatchPlayerState; contact: AerialContactCandidate } =>
      Boolean(entry.contact),
    );
};

export const aerialAbility = (player: MatchPlayerState, ball: PitchPoint) => {
  const a = player.profile.attributes;
  const arrival = Math.max(0, 1 - distance(player.position, ball) / 12);
  const movementToward =
    Math.max(
      0,
      -(
        (player.velocity.x * (player.position.x - ball.x) +
          player.velocity.y * (player.position.y - ball.y)) /
        Math.max(1, distance(player.position, ball))
      ),
    ) / 8;
  return (
    a.jumping * 0.2 +
    a.heading * 0.2 +
    a.strength * 0.12 +
    a.positioning * 0.13 +
    a.gameReading * 0.13 +
    a.concentration * 0.08 +
    (player.profile.heightCm - 155) * 0.14 +
    arrival * 16 +
    movementToward * 5
  );
};

export const aerialPressureSchema = z.object({
  playerId: z.string(),
  contactQuality: z.number().min(0).max(1),
  facingError: z.number().nonnegative(),
  relativeSpeed: z.number().nonnegative(),
  pressure: z.number().min(0).max(1),
  challengerIds: z.array(z.string()).max(22),
});

/** An opponent can disturb a header by competing shoulder-to-shoulder without also
 * touching the ball. Such a body never becomes an eligible ball winner from a duel score. */
export const evaluateAerialPressure = (state: TacticalMatchState, player: MatchPlayerState) => {
  const ball = state.ball;
  const height = ball.height ?? 0;
  const contact = evaluateAerialContact(player, ball);
  const facingError = Math.abs(
    normalizeAngle(
      angleForVector({ x: ball.x - player.position.x, y: ball.y - player.position.y }) -
        player.facingAngle,
    ),
  );
  const challengers = state.players.filter((p) => {
    if (
      p.team === player.team ||
      isMatchGoalkeeper(p) ||
      !canParticipatePhysically(p) ||
      state.discipline?.[p.id]?.sentOff ||
      !canContactAfterThrowIn(state, p.id)
    )
      return false;
    const bodyDistance = distance(p.position, player.position);
    const reach = p.profile.heightCm / 100 + 0.18 + p.profile.attributes.jumping * 0.004;
    const approaching =
      ((p.velocity.x - player.velocity.x) * (player.position.x - p.position.x) +
        (p.velocity.y - player.velocity.y) * (player.position.y - p.position.y)) /
      Math.max(0.01, bodyDistance);
    const prepared =
      p.spatialMovement?.kind === 'aerial_challenge' && p.spatialMovement.until >= state.time;
    return (
      bodyDistance <= 1.65 &&
      distance(p.position, ball) <= 2.2 &&
      height >= 0.65 &&
      height <= reach &&
      (prepared || approaching > 0.25 || evaluateAerialContact(p, ball) !== undefined)
    );
  });
  const pressure = Math.min(
    1,
    challengers.reduce(
      (sum, p) =>
        sum +
        Math.max(0, (1.65 - distance(p.position, player.position)) / 0.65) *
          (0.5 + p.profile.attributes.strength / 200),
      0,
    ),
  );
  const relativeSpeed = Math.hypot(
    (ball.velocity?.x ?? 0) - player.velocity.x,
    (ball.velocity?.y ?? 0) - player.velocity.y,
    ball.velocity?.z ?? 0,
  );
  return {
    playerId: player.id,
    contactQuality: contact?.contactQuality ?? 0,
    facingError,
    relativeSpeed,
    pressure,
    challengerIds: challengers.map((p) => p.id),
  };
};

/** A small local contest, ranked by arrival and aerial suitability; never every nearby player. */
export const selectAerialContestants = (state: TacticalMatchState, point = state.ball) => {
  const eligible = findAerialContactCandidates({ ...state, ball: { ...state.ball, ...point } }).map(
    (entry) => entry.player,
  );
  const ranked = (team: TeamSide) =>
    eligible
      .filter((p) => p.team === team && !isMatchGoalkeeper(p))
      .sort(
        (a, b) => aerialAbility(b, point) - aerialAbility(a, point) || a.id.localeCompare(b.id),
      );
  const attackers = ranked(state.possessionTeam),
    defenders = ranked(state.possessionTeam === 'home' ? 'away' : 'home');
  const selected = [attackers[0], defenders[0]];
  const secondary = [...attackers.slice(1, 2), ...defenders.slice(1, 2)].sort(
    (a, b) => (b ? aerialAbility(b, point) : -1) - (a ? aerialAbility(a, point) : -1),
  )[0];
  if (secondary) selected.push(secondary);
  return selected.filter((p): p is MatchPlayerState => Boolean(p));
};

export const goalkeeperIntervention = (
  state: TacticalMatchState,
  point = state.ball,
): {
  keeper?: MatchPlayerState;
  decision: 'stay' | 'claim' | 'punch' | 'attempt_interception';
  score: number;
} => {
  const defending = state.possessionTeam === 'home' ? 'away' : 'home';
  const keeper = state.players.find((p) => p.team === defending && isMatchGoalkeeper(p));
  if (!keeper || !canContactAfterThrowIn(state, keeper.id)) return { decision: 'stay', score: 0 };
  const goalX = attacksRight(keeper) ? 0 : 105;
  if (
    Math.abs(point.x - goalX) > 18 ||
    Math.abs(point.y - 34) > 23 ||
    distance(keeper.position, point) > 12
  )
    return { keeper, decision: 'stay', score: 0 };
  const traffic = state.players.filter(
    (p) => p.id !== keeper.id && distance(p.position, point) < 4,
  ).length;
  const a = keeper.profile.attributes;
  const score =
    a.handling * 0.35 +
    a.reflexes * 0.2 +
    a.oneOnOnes * 0.15 +
    a.jumping * 0.12 +
    a.gameReading * 0.18 -
    distance(keeper.position, point) * 2.5 -
    traffic * 3;
  const contactDistance = distance(keeper.position, point);
  return {
    keeper,
    score,
    decision:
      contactDistance > 1.65
        ? score > 27
          ? 'attempt_interception'
          : 'stay'
        : score > 55 && traffic < 4
          ? 'claim'
          : score > 39
            ? 'punch'
            : score > 27
              ? 'attempt_interception'
              : 'stay',
  };
};

export const resolveAerialDuel = (
  state: TacticalMatchState,
  contestants = selectAerialContestants(state),
): {
  winner?: MatchPlayerState;
  outcome: AerialOutcome;
  contestants: MatchPlayerState[];
  contactEvidence: z.infer<typeof aerialPressureSchema>[];
  challengerIds: string[];
} => {
  contestants = contestants.filter(
    (p) =>
      evaluateAerialContact(p, state.ball) &&
      canParticipatePhysically(p) &&
      !state.discipline?.[p.id]?.sentOff,
  );
  const contactEvidence = contestants.map((p) => evaluateAerialPressure(state, p));
  const contest = {
    contactEvidence,
    challengerIds: [...new Set(contactEvidence.flatMap((e) => e.challengerIds))],
  };
  const keeperChoice = goalkeeperIntervention(state);
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:aerial:${state.decisionIndex}:${contestants.map((p) => p.id).join(':')}`,
  );
  if (keeperChoice.keeper && keeperChoice.decision !== 'stay') {
    const succeeds = rng.float() * 100 < keeperChoice.score;
    if (succeeds && keeperChoice.decision === 'claim')
      return {
        winner: keeperChoice.keeper,
        outcome: 'keeper_claim' as const,
        contestants,
        ...contest,
      };
    if (succeeds)
      return {
        winner: keeperChoice.keeper,
        outcome: 'keeper_punch' as const,
        contestants,
        ...contest,
      };
    if (keeperChoice.decision === 'attempt_interception')
      return { outcome: 'keeper_miss' as const, contestants, ...contest };
  }
  if (!contestants.length) return { outcome: 'loose_ball' as const, contestants, ...contest };
  const scored = contestants
    .map((player, i) => {
      const contact = contactEvidence[i]!;
      const readiness = 1 - contact.facingError / Math.PI;
      const physical = deriveFitnessPhysicalModifiers(player);
      return {
        player,
        score:
          aerialAbility(player, state.ball) +
          contact.contactQuality * 8 +
          readiness * 4 -
          contact.pressure * (8 + physical.bodyControlImpairment * 6) -
          Math.max(0, contact.relativeSpeed - 8) * 0.35 +
          rng.float() * 38 -
          19,
      };
    })
    .sort((a, b) => b.score - a.score);
  const winner = scored[0]!;
  if (
    !winner ||
    winner.score < 37 ||
    (scored[1] && winner.score - scored[1].score < 4 && rng.bool(0.45))
  )
    return { outcome: 'loose_ball' as const, contestants, ...contest };
  const attacking = winner.player.team === state.possessionTeam;
  const goalX = attacking
    ? attacksRight(winner.player)
      ? 105
      : 0
    : attacksRight(winner.player)
      ? 0
      : 105;
  const goalDistance = Math.hypot(winner.player.position.x - goalX, winner.player.position.y - 34);
  const lateralAngle = Math.atan2(
    Math.abs(winner.player.position.y - 34),
    Math.max(1, Math.abs(winner.player.position.x - goalX)),
  );
  const nearGoal = goalDistance < 19 && lateralAngle < 0.7 && (state.ball.height ?? 0) > 0.7;
  const outcome: AerialOutcome = attacking
    ? nearGoal
      ? 'attacking_header'
      : rng.bool(0.45)
        ? 'flick_on'
        : 'controlled_header'
    : 'clearance_header';
  return { winner: winner.player, outcome, contestants, ...contest };
};

export const secondBallPriority = (state: TacticalMatchState, contestants: MatchPlayerState[]) => {
  const ids = new Set(contestants.map((p) => p.id));
  if (state.restart)
    for (const [id, role] of Object.entries(state.restart.roles))
      if (role.intent === 'attack_second_ball') ids.add(id);
  return [...ids];
};

export const resolveDeadBallRestart = (state: TacticalMatchState, point: PitchPoint) => {
  if (point.y < 0 || point.y > 68) return 'throw_in' as const;
  if (point.x < 0 || point.x > 105) {
    const defending: TeamSide = point.x < 0 ? 'home' : 'away';
    const last = state.players.find((p) => p.id === state.ball.lastTouchPlayerId);
    return last?.team === defending ? ('corner' as const) : ('goal_kick' as const);
  }
  return undefined;
};
