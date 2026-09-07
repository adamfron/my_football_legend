import { RandomGenerator } from '../random/RandomGenerator';
import { distance, type PitchPoint, type TeamSide } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

export type AerialOutcome = NonNullable<TacticalMatchState['lastAerialResult']>;

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

/** A small local contest, ranked by arrival and aerial suitability; never every nearby player. */
export const selectAerialContestants = (state: TacticalMatchState, point = state.ball) => {
  const eligible = state.players.filter(
    (p) => distance(p.position, point) <= (p.profile.primaryPosition === 'goalkeeper' ? 11 : 10),
  );
  const ranked = (team: TeamSide) =>
    eligible
      .filter((p) => p.team === team && p.profile.primaryPosition !== 'goalkeeper')
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
  const keeper = state.players.find(
    (p) => p.team === defending && p.profile.primaryPosition === 'goalkeeper',
  );
  if (!keeper) return { decision: 'stay', score: 0 };
  const goalX = defending === 'home' ? 0 : 105;
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
  return {
    keeper,
    score,
    decision:
      score > 55 && traffic < 4
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
) => {
  const keeperChoice = goalkeeperIntervention(state);
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:aerial:${state.decisionIndex}:${contestants.map((p) => p.id).join(':')}`,
  );
  if (keeperChoice.keeper && keeperChoice.decision !== 'stay') {
    const succeeds = rng.float() * 100 < keeperChoice.score;
    if (succeeds && keeperChoice.decision === 'claim')
      return { winner: keeperChoice.keeper, outcome: 'keeper_claim' as const, contestants };
    if (succeeds)
      return { winner: keeperChoice.keeper, outcome: 'keeper_punch' as const, contestants };
    if (keeperChoice.decision === 'attempt_interception')
      return { outcome: 'keeper_miss' as const, contestants };
  }
  if (!contestants.length) return { outcome: 'loose_ball' as const, contestants };
  const scored = contestants
    .map((player) => ({ player, score: aerialAbility(player, state.ball) + rng.float() * 38 - 19 }))
    .sort((a, b) => b.score - a.score);
  const winner = scored[0]!;
  if (
    !winner ||
    winner.score < 37 ||
    (scored[1] && winner.score - scored[1].score < 4 && rng.bool(0.45))
  )
    return { outcome: 'loose_ball' as const, contestants };
  const attacking = winner.player.team === state.possessionTeam;
  const goalX = attacking
    ? winner.player.team === 'home'
      ? 105
      : 0
    : winner.player.team === 'home'
      ? 0
      : 105;
  const nearGoal = Math.abs(winner.player.position.x - goalX) < 20;
  const outcome: AerialOutcome = attacking
    ? nearGoal
      ? 'attacking_header'
      : rng.bool(0.45)
        ? 'flick_on'
        : 'controlled_header'
    : 'clearance_header';
  return { winner: winner.player, outcome, contestants };
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
