import { RandomGenerator } from '../random/RandomGenerator';
import { clampPitchPoint, distance, type PitchPoint, type TeamSide } from './matchSpace';
import { TACTICAL_STYLE_PARAMETERS } from './tacticalPositioning';
import type { MatchPlayerState, RestartScenario, TacticalMatchState } from './matchState';

const outfield = (state: TacticalMatchState, side: TeamSide) =>
  state.players.filter((p) => p.team === side && p.profile.primaryPosition !== 'goalkeeper');
const goalkeeper = (state: TacticalMatchState, side: TeamSide) =>
  state.players.find((p) => p.team === side && p.profile.primaryPosition === 'goalkeeper')!;
const stableRank = (players: MatchPlayerState[], score: (p: MatchPlayerState) => number) =>
  [...players].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
const aerialScore = (p: MatchPlayerState) =>
  p.profile.attributes.heading * 0.32 +
  p.profile.attributes.jumping * 0.28 +
  p.profile.attributes.strength * 0.2 +
  p.profile.heightCm * 0.2;

export const chooseAerialTargets = (state: TacticalMatchState, side: TeamSide, count = 4) =>
  stableRank(outfield(state, side), aerialScore).slice(0, count);
export const chooseCornerTaker = (state: TacticalMatchState, side: TeamSide) =>
  stableRank(
    outfield(state, side),
    (p) =>
      p.profile.attributes.setPieces * 0.5 +
      p.profile.attributes.technique * 0.25 +
      p.profile.attributes.passing * 0.25 -
      aerialScore(p) * 0.08,
  )[0]!;
export const chooseFreeKickTaker = (state: TacticalMatchState, side: TeamSide) =>
  stableRank(
    outfield(state, side),
    (p) =>
      p.profile.attributes.setPieces * 0.45 +
      p.profile.attributes.technique * 0.25 +
      p.profile.attributes.passing * 0.2 +
      p.profile.attributes.finishing * 0.1,
  )[0]!;
export const choosePenaltyTaker = (state: TacticalMatchState, side: TeamSide) =>
  stableRank(
    outfield(state, side),
    (p) =>
      p.profile.attributes.finishing * 0.4 +
      p.profile.attributes.composure * 0.35 +
      p.profile.attributes.technique * 0.25,
  )[0]!;

/** A wall is perpendicular to the ball-goal ray and can later be moved to an exact law distance. */
export const deriveDefensiveWall = (
  ball: PitchPoint,
  goal: PitchPoint,
  size: number,
): PitchPoint[] => {
  const dx = goal.x - ball.x,
    dy = goal.y - ball.y,
    length = Math.max(0.1, Math.hypot(dx, dy)),
    centre = { x: ball.x + (dx / length) * 9, y: ball.y + (dy / length) * 9 },
    perpendicular = { x: -dy / length, y: dx / length };
  return Array.from({ length: size }, (_, index) => {
    const offset = (index - (size - 1) / 2) * 0.85;
    return clampPitchPoint({
      x: centre.x + perpendicular.x * offset,
      y: centre.y + perpendicular.y * offset,
    });
  });
};

const variantBall = (scenario: RestartScenario): PitchPoint => {
  if (scenario === 'free_kick_close') return { x: 83, y: 34 };
  if (scenario === 'free_kick_wide') return { x: 78, y: 8 };
  if (scenario === 'free_kick' || scenario === 'free_kick_far') return { x: 69, y: 31 };
  if (scenario === 'corner') return { x: 104.5, y: 0.5 };
  if (scenario === 'penalty') return { x: 94, y: 34 };
  if (scenario === 'kick_off') return { x: 52.5, y: 34 };
  return scenario === 'gk_short' ? { x: 7, y: 28 } : { x: 5.5, y: 34 };
};

const jitter = (seed: string, id: string, amountX: number, amountY = amountX): PitchPoint => {
  const rng = RandomGenerator.fromSeed(`${seed}:restart:${id}`);
  return { x: (rng.float() - 0.5) * amountX, y: (rng.float() - 0.5) * amountY };
};
const spreadCluster = (points: Map<string, PitchPoint>, players: MatchPlayerState[]) => {
  // Tactical zones may overlap; this final physical pass only prevents model intersection.
  for (let iteration = 0; iteration < 3; iteration++)
    for (let a = 0; a < players.length; a++)
      for (let b = a + 1; b < players.length; b++) {
        const pa = points.get(players[a]!.id)!,
          pb = points.get(players[b]!.id)!,
          d = distance(pa, pb);
        if (d >= 1.05) continue;
        const angleRng = RandomGenerator.fromSeed(`separate:${players[a]!.id}:${players[b]!.id}`),
          angle = angleRng.float() * Math.PI * 2,
          push = (1.08 - d) / 2;
        points.set(
          players[a]!.id,
          clampPitchPoint({ x: pa.x + Math.cos(angle) * push, y: pa.y + Math.sin(angle) * push }),
        );
        points.set(
          players[b]!.id,
          clampPitchPoint({ x: pb.x - Math.cos(angle) * push, y: pb.y - Math.sin(angle) * push }),
        );
      }
};

export const deriveRestartGeometry = (state: TacticalMatchState, scenario: RestartScenario) => {
  const ball = variantBall(scenario),
    home = outfield(state, 'home'),
    away = outfield(state, 'away'),
    homeGk = goalkeeper(state, 'home'),
    awayGk = goalkeeper(state, 'away'),
    points = new Map<string, PitchPoint>();
  let taker = home[0]!,
    landingZone: PitchPoint | undefined;
  const place = (player: MatchPlayerState, base: PitchPoint, amount = 2) => {
    const error = jitter(state.seed, `${scenario}:${player.id}`, amount);
    points.set(player.id, clampPitchPoint({ x: base.x + error.x, y: base.y + error.y }));
  };
  if (scenario === 'goal_kick' || scenario === 'gk_short') {
    taker = homeGk;
    points.set(homeGk.id, ball);
    points.set(awayGk.id, { x: 99.5, y: 34 });
    const backs = stableRank(home, (p) => -p.neutralAnchor.x).slice(0, 4),
      rest = home.filter((p) => !backs.includes(p));
    backs.forEach((p) => {
      const wide = Math.abs(p.neutralAnchor.y - 34) > 10;
      place(
        p,
        scenario === 'gk_short'
          ? { x: wide ? 24 : 17, y: wide ? p.neutralAnchor.y : p.neutralAnchor.y * 0.65 + 12 }
          : { x: wide ? 43 : 38, y: p.neutralAnchor.y },
        2.4,
      );
    });
    rest.forEach((p) =>
      place(
        p,
        {
          x:
            scenario === 'gk_short'
              ? Math.max(35, p.neutralAnchor.x + 8)
              : Math.max(51, p.neutralAnchor.x + 22),
          y: p.neutralAnchor.y,
        },
        3.5,
      ),
    );
    const press = TACTICAL_STYLE_PARAMETERS[state.teams.away.style].pressing,
      pressingLine = scenario === 'gk_short' ? 30 - press * 12 : 55;
    away.forEach((p) =>
      place(
        p,
        {
          x: Math.max(
            pressingLine,
            Math.min(75, p.neutralAnchor.x - (scenario === 'gk_short' ? 42 * press : 22)),
          ),
          y: p.neutralAnchor.y,
        },
        3,
      ),
    );
    landingZone =
      scenario === 'goal_kick'
        ? {
            x: 61 + jitter(state.seed, 'landing', 8).x,
            y: 34 + jitter(state.seed, 'landing', 0, 18).y,
          }
        : undefined;
  } else if (scenario === 'corner') {
    taker = chooseCornerTaker(state, 'home');
    points.set(taker.id, ball);
    points.set(homeGk.id, { x: 7, y: 34 });
    points.set(awayGk.id, { x: 103.8, y: 34 });
    const aerial = chooseAerialTargets(state, 'home', 5).filter((p) => p.id !== taker.id),
      attackZones = [
        { x: 99, y: 27 },
        { x: 98, y: 34 },
        { x: 97, y: 41 },
        { x: 93.5, y: 34 },
        { x: 91, y: 25 },
      ];
    aerial.forEach((p, i) => place(p, attackZones[i % attackZones.length]!, 3.2));
    home
      .filter((p) => p.id !== taker.id && !aerial.includes(p))
      .forEach((p, i) => place(p, i < 2 ? { x: 88, y: 25 + i * 16 } : { x: 70, y: 24 + i * 5 }, 3));
    const defenceZones = [
      { x: 101, y: 27 },
      { x: 100, y: 34 },
      { x: 99, y: 41 },
      { x: 96, y: 32 },
      { x: 95, y: 39 },
      { x: 91, y: 28 },
    ];
    away.forEach((p, i) =>
      place(p, i < 8 ? defenceZones[i % defenceZones.length]! : { x: 84, y: 20 + i * 4 }, 2.8),
    );
  } else if (scenario.startsWith('free_kick')) {
    taker = chooseFreeKickTaker(state, 'home');
    points.set(taker.id, { x: ball.x - 2.2, y: ball.y });
    points.set(homeGk.id, { x: 8, y: 34 });
    points.set(awayGk.id, { x: 103.5, y: scenario === 'free_kick_wide' ? 31 : 35 });
    const close = scenario === 'free_kick_close',
      wide = scenario === 'free_kick_wide',
      wallSize = close ? 5 : wide ? 0 : 2;
    const wall = deriveDefensiveWall(ball, { x: 105, y: 34 }, wallSize),
      wallPlayers = stableRank(away, (p) => p.profile.heightCm);
    wall.forEach((point, i) => points.set(wallPlayers[i]!.id, point));
    const aerial = chooseAerialTargets(state, 'home', wide ? 5 : close ? 2 : 4).filter(
      (p) => p.id !== taker.id,
    );
    aerial.forEach((p, i) =>
      place(
        p,
        wide
          ? { x: 96 + (i % 2) * 2, y: 26 + (i % 3) * 6 }
          : { x: close ? 80 : 94, y: 25 + (i % 4) * 6 },
        2.5,
      ),
    );
    home
      .filter((p) => p.id !== taker.id && !aerial.includes(p))
      .forEach((p, i) => place(p, { x: wide ? 72 : close ? 72 : 78, y: 16 + (i % 6) * 7 }, 3));
    away
      .filter((p) => !points.has(p.id))
      .forEach((p, i) => place(p, { x: wide ? 96 : close ? 91 : 94, y: 20 + (i % 6) * 6 }, 3));
  } else if (scenario === 'penalty') {
    taker = choosePenaltyTaker(state, 'home');
    points.set(taker.id, { x: 92, y: 34 });
    points.set(homeGk.id, { x: 5.5, y: 34 });
    points.set(awayGk.id, { x: 104.4, y: 34 });
    [...home.filter((p) => p.id !== taker.id), ...away].forEach((p, i) =>
      place(p, { x: 82.3 - (i % 3) * 0.7, y: 22 + (i % 7) * 4 }, 2.2),
    );
  } else {
    taker = stableRank(home, (p) => -distance(p.position, ball))[0]!;
    state.players.forEach((p) => place(p, p.neutralAnchor, 1));
    points.set(taker.id, ball);
  }
  spreadCluster(points, state.players);
  // Preserve law-critical exact locations after separation.
  if (scenario === 'penalty') {
    points.set(homeGk.id, { x: 5.5, y: 34 });
    points.set(awayGk.id, { x: 104.4, y: 34 });
    points.set(taker.id, { x: 92, y: 34 });
  }
  if (scenario === 'goal_kick' || scenario === 'gk_short') points.set(homeGk.id, ball);
  if (scenario === 'corner') points.set(taker.id, ball);
  return { ball, taker, targets: Object.fromEntries(points), landingZone };
};

export const restartInfluence = (state: TacticalMatchState) => {
  if (!state.restart) return 0;
  if (state.restart.phase === 'setup') return 1;
  return Math.max(0, 1 - (state.time - (state.restart.executedAt ?? state.time)) / 4);
};
