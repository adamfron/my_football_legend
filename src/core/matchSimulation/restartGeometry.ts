import { RandomGenerator } from '../random/RandomGenerator';
import { clampPitchPoint, distance, type PitchPoint, type TeamSide } from './matchSpace';
import { TACTICAL_STYLE_PARAMETERS } from './tacticalPositioning';
import type { MatchPlayerState, RestartScenario, TacticalMatchState } from './matchState';
import {
  chooseCornerPlan,
  TACTICAL_SITUATION_PLAYBOOK,
  type TacticalIntent,
} from './tacticalSituations';

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

const deriveHomeRestartGeometry = (
  state: TacticalMatchState,
  scenario: RestartScenario,
  restartPoint?: PitchPoint,
) => {
  const ball = restartPoint ?? variantBall(scenario),
    home = outfield(state, 'home'),
    away = outfield(state, 'away'),
    homeGk = goalkeeper(state, 'home'),
    awayGk = goalkeeper(state, 'away'),
    points = new Map<string, PitchPoint>(),
    roles: Record<
      string,
      {
        key: string;
        intent: TacticalIntent;
        zone: { centre: PitchPoint; radius: number; timing: number };
        markerId?: string;
      }
    > = {};
  let taker = home[0]!,
    landingZone: PitchPoint | undefined,
    cornerPlan: ReturnType<typeof chooseCornerPlan> | undefined;
  const place = (player: MatchPlayerState, base: PitchPoint, amount = 2) => {
    const error = jitter(state.seed, `${scenario}:${player.id}`, amount);
    points.set(player.id, clampPitchPoint({ x: base.x + error.x, y: base.y + error.y }));
  };
  const assign = (
    player: MatchPlayerState,
    key: string,
    intent: TacticalIntent,
    centre: PitchPoint,
    markerId?: string,
  ) => {
    roles[player.id] = {
      key,
      intent,
      zone: { centre, radius: 8, timing: 0 },
      ...(markerId ? { markerId } : {}),
    };
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
      pressingLine = scenario === 'gk_short' ? Math.max(17.5, 30 - press * 12) : 55;
    // The press line is the first unit, never a clamp for the entire defending shape.
    stableRank(away, (p) => -p.neutralAnchor.x).forEach((p, index) => {
      const unit = index < 2 ? 0 : index < 5 ? 1 : index < 8 ? 2 : 3;
      const depths =
        scenario === 'gk_short'
          ? [pressingLine, pressingLine + 10, pressingLine + 20, pressingLine + 30]
          : [55, 65, 75, 86];
      place(p, { x: depths[unit]!, y: p.neutralAnchor.y }, 2.2);
      assign(
        p,
        ['first_press', 'press_cover', 'midfield_line', 'defensive_line'][unit]!,
        unit === 0 ? 'press_ball' : unit === 1 ? 'cover_press' : 'protect_zone',
        points.get(p.id) ?? p.position,
      );
    });
    landingZone =
      scenario === 'goal_kick'
        ? {
            x: 61 + jitter(state.seed, 'landing', 8).x,
            y: 34 + jitter(state.seed, 'landing', 0, 18).y,
          }
        : undefined;
    if (scenario === 'goal_kick') {
      const ranked = stableRank(rest, aerialScore);
      ranked.slice(0, 3).forEach((p, i) => {
        const zone = { x: landingZone!.x + (i - 1) * 1.7, y: landingZone!.y + (i - 1) * 3.2 };
        place(p, zone, 0.7);
        assign(p, 'contestants', 'attack_landing_zone', zone);
      });
      ranked.slice(3, 6).forEach((p, i) => {
        const zone = {
          x: landingZone!.x - 8,
          y: landingZone!.y + (i - 1) * 5,
        };
        place(p, zone, 0.8);
        assign(p, 'second_ball', 'attack_second_ball', zone);
      });
      backs.slice(0, 3).forEach((p) => assign(p, 'rest', 'rest_defence', points.get(p.id)!));
      stableRank(away, aerialScore)
        .slice(0, 3)
        .forEach((p, i) => assign(p, 'contest', 'mark_opponent', landingZone!, ranked[i]?.id));
    } else {
      backs.forEach((p) => assign(p, 'first_line', 'support_ball', points.get(p.id)!));
      const awayNear = [...away].sort((a, b) => a.position.x - b.position.x);
      const pressCount = Math.max(1, Math.min(3, Math.round(press * 3)));
      awayNear
        .slice(0, pressCount)
        .forEach((p) => assign(p, 'first_press', 'press_ball', points.get(p.id)!));
      awayNear
        .slice(pressCount, pressCount + 2)
        .forEach((p) => assign(p, 'press_cover', 'cover_press', points.get(p.id)!));
    }
  } else if (scenario === 'throw_in') {
    taker = stableRank(home, (p) => -distance(p.position, ball))[0]!;
    points.set(taker.id, {
      x: Math.max(0.4, Math.min(104.6, ball.x)),
      y: ball.y === 0 ? 0.4 : 67.6,
    });
    points.set(homeGk.id, homeGk.neutralAnchor);
    points.set(awayGk.id, awayGk.neutralAnchor);
    const direction = 1;
    const options = stableRank(
      home.filter((p) => p.id !== taker.id),
      (p) => -distance(p.position, ball),
    );
    const optionZones = [
      { x: ball.x + direction * 5, y: ball.y === 0 ? 3.5 : 64.5 },
      { x: ball.x + direction * 11, y: ball.y === 0 ? 2.8 : 65.2 },
      { x: ball.x + direction * 7, y: ball.y === 0 ? 9 : 59 },
    ].map(clampPitchPoint);
    options.forEach((p, i) => {
      const zone =
        i < 3
          ? optionZones[i]!
          : i < 6
            ? { x: Math.max(12, ball.x - 10), y: 15 + i * 7 }
            : p.neutralAnchor;
      place(p, zone, i < 3 ? 0.8 : 2);
      assign(
        p,
        i === 0 ? 'short' : i === 1 ? 'down_line' : i === 2 ? 'inside' : 'rest',
        i < 3 ? 'support_ball' : 'rest_defence',
        zone,
      );
    });
    away.forEach((p, i) => {
      const marked = options[i % 3];
      const markedTarget = marked ? points.get(marked.id) : undefined;
      const advancedRestart = ball.x >= 70;
      const base =
        markedTarget && i < 5
          ? // Away defend the x=105 goal in this home-oriented construction: positive x is goal-side.
            { x: markedTarget.x + 1.8, y: markedTarget.y + (ball.y === 0 ? 1.2 : -1.2) }
          : advancedRestart
            ? { x: Math.max(78, p.neutralAnchor.x), y: 34 + (p.neutralAnchor.y - 34) * 0.72 }
            : p.neutralAnchor;
      const dx = base.x - ball.x,
        dy = base.y - ball.y,
        d = Math.max(0.01, Math.hypot(dx, dy));
      const legal = d < 2 ? { x: ball.x + (dx / d) * 2, y: ball.y + (dy / d) * 2 } : base;
      place(p, legal, 0.35);
      assign(
        p,
        i < 5 ? 'marker' : 'defensive_shape',
        i < 5 ? 'mark_opponent' : 'protect_zone',
        legal,
        marked?.id,
      );
    });
    landingZone = optionZones[Math.abs(state.decisionIndex) % optionZones.length];
  } else if (scenario === 'corner') {
    cornerPlan = chooseCornerPlan(state.seed);
    taker = chooseCornerTaker(state, 'home');
    points.set(taker.id, ball);
    points.set(homeGk.id, { x: 7, y: 34 });
    points.set(awayGk.id, { x: 103.8, y: 34 });
    const aerial = chooseAerialTargets(state, 'home', 10)
        .filter((p) => p.id !== taker.id)
        .slice(0, 5),
      attackZones =
        cornerPlan === 'direct_near_post'
          ? [
              { x: 101, y: 27 },
              { x: 100, y: 29 },
              { x: 99, y: 31 },
              { x: 97, y: 41 },
              { x: 94, y: 35 },
            ]
          : [
              { x: 99, y: 27 },
              { x: 98, y: 34 },
              { x: 97, y: 41 },
              { x: 93.5, y: 34 },
              { x: 91, y: 25 },
            ];
    aerial.forEach((p, i) => {
      const zone = attackZones[i % attackZones.length]!;
      place(p, zone, 3.2);
      assign(
        p,
        i < 2 ? 'near' : i < 4 ? 'central' : 'far',
        i < 2 ? 'attack_near_post' : i < 4 ? 'attack_central' : 'attack_far_post',
        zone,
      );
    });
    home
      .filter((p) => p.id !== taker.id && !aerial.includes(p))
      .forEach((p, i) => {
        const short = cornerPlan === 'short_corner' ? i === 0 : i === 3;
        const zone = short
          ? { x: 101, y: 5 }
          : i === 0 || (cornerPlan === 'short_corner' && i === 1)
            ? { x: 88, y: 25 + i * 16 }
            : { x: 70, y: 24 + i * 5 };
        place(p, zone, 3);
        assign(
          p,
          short ? 'short' : i === 0 || (cornerPlan === 'short_corner' && i === 1) ? 'edge' : 'rest',
          short
            ? 'short_option'
            : i === 0 || (cornerPlan === 'short_corner' && i === 1)
              ? 'attack_second_ball'
              : 'rest_defence',
          zone,
        );
      });
    const defenceZones = [
      { x: 101, y: 27 },
      { x: 100, y: 34 },
      { x: 99, y: 41 },
      { x: 96, y: 32 },
      { x: 95, y: 39 },
      { x: 91, y: 28 },
    ];
    away.forEach((p, i) => {
      const outlet = i >= 7;
      const zone = outlet
        ? { x: 76 - (i - 7) * 3, y: i % 2 ? 18 : 50 }
        : defenceZones[i % defenceZones.length]!;
      place(p, zone, 2.8);
      const marked = i >= 2 && i < 7 ? aerial[i - 2] : undefined;
      assign(
        p,
        marked ? 'markers' : i < 2 ? 'zone' : 'outlet',
        marked ? 'mark_opponent' : i < 2 ? 'protect_zone' : 'counter_outlet',
        zone,
        marked?.id,
      );
    });
    landingZone = { x: 97, y: 34 };
  } else if (scenario.startsWith('free_kick')) {
    taker = chooseFreeKickTaker(state, 'home');
    points.set(taker.id, { x: ball.x - 2.2, y: ball.y });
    points.set(homeGk.id, { x: 8, y: 34 });
    points.set(awayGk.id, { x: 103.5, y: scenario === 'free_kick_wide' ? 31 : 35 });
    const close = scenario === 'free_kick_close',
      wide = scenario === 'free_kick_wide',
      wallSize = close ? 5 : wide ? 0 : 2;
    const wall = deriveDefensiveWall(ball, { x: 105, y: 34 }, wallSize),
      // Prefer mobile midfield responsibility and retain dominant aerial markers.
      wallPlayers = stableRank(
        away,
        (p) =>
          p.profile.attributes.positioning * 0.45 +
          p.profile.attributes.determination * 0.25 +
          p.profile.attributes.agility * 0.2 -
          aerialScore(p) * 0.08,
      );
    wall.forEach((point, i) => points.set(wallPlayers[i]!.id, point));
    wall.forEach((point, i) => assign(wallPlayers[i]!, 'wall', 'protect_zone', point));
    const aerial = chooseAerialTargets(state, 'home', wide ? 5 : close ? 2 : 4).filter(
      (p) => p.id !== taker.id,
    );
    aerial.forEach((p, i) => {
      const zone = wide
        ? { x: 96 + (i % 2) * 2, y: 26 + (i % 3) * 6 }
        : { x: close ? 78 + i * 2.4 : 91 + (i % 2) * 3, y: 25 + (i % 4) * 6 };
      place(p, zone, 2.5);
      assign(p, 'runner', 'attack_landing_zone', zone);
    });
    home
      .filter((p) => p.id !== taker.id && !aerial.includes(p))
      .forEach((p, i) => {
        const zone = {
          x: wide ? (i < 3 ? 84 : 68) : close ? 72 : i < 3 ? 82 : 70,
          y: 16 + (i % 6) * 7,
        };
        place(p, zone, 3);
        assign(
          p,
          i < 3 ? 'second_ball' : 'rest',
          i < 3 ? 'attack_second_ball' : 'rest_defence',
          zone,
        );
      });
    away
      .filter((p) => !points.has(p.id))
      .forEach((p, i) => {
        const zone = {
          x: wide ? 94 - (i % 2) * 5 : close ? 88 + (i % 3) * 2.2 : 90 + (i % 3) * 2,
          y: 20 + (i % 6) * 6,
        };
        place(p, zone, 2);
        assign(
          p,
          i < 6 ? 'marking_line' : 'zonal_protection',
          i < 6 ? 'mark_opponent' : 'protect_zone',
          zone,
          aerial[i]?.id,
        );
      });
    if (!close) landingZone = wide ? { x: 97, y: 34 } : { x: 94, y: 34 };
  } else if (scenario === 'penalty') {
    taker = choosePenaltyTaker(state, 'home');
    points.set(taker.id, ball);
    points.set(homeGk.id, { x: 5.5, y: 34 });
    points.set(awayGk.id, { x: 104.4, y: 34 });
    const attackers = home.filter((p) => p.id !== taker.id);
    attackers.forEach((p, i) => {
      const base =
        i < 4
          ? { x: 83.2 - (i % 2) * 1.3, y: [27, 40, 21, 48][i]! }
          : i === 4
            ? { x: 78, y: 55 }
            : { x: 66 - (i - 5) * 3, y: 18 + (i % 3) * 16 };
      place(p, base, 0.45);
      assign(
        p,
        i < 4 ? 'rebound_attack' : i === 4 ? 'wide_rebound' : 'rest_defence',
        i < 5 ? 'attack_second_ball' : 'rest_defence',
        base,
      );
    });
    away.forEach((p, i) => {
      const base =
        i < 5
          ? { x: 82 - (i % 3) * 1.1, y: [24, 31, 38, 45, 52][i]! }
          : i === 5
            ? { x: 77, y: 14 }
            : i === 9
              ? { x: 69, y: 34 }
              : { x: 80 + (i % 2), y: 18 + (i % 3) * 16 };
      place(p, base, 0.45);
      assign(
        p,
        i < 5
          ? 'rebound_defence'
          : i === 5
            ? 'wide_rebound'
            : i === 9
              ? 'counter_outlet'
              : 'box_protection',
        i === 9 ? 'counter_outlet' : 'protect_zone',
        base,
      );
    });
  } else {
    taker = stableRank(home, (p) => -distance(p.position, ball))[0]!;
    if (scenario === 'kick_off') {
      home
        .filter((p) => p.id !== taker.id)
        .forEach((p, i) =>
          place(
            p,
            { x: Math.min(51.2, p.neutralAnchor.x), y: p.neutralAnchor.y + (i % 2 ? 1 : -1) },
            0.3,
          ),
        );
      away.forEach((p) => {
        const base = p.neutralAnchor;
        const d = distance(base, ball);
        place(p, d < 9.4 ? { x: 62.2, y: base.y } : { x: Math.max(53.2, base.x), y: base.y }, 0.2);
      });
      points.set(homeGk.id, { x: 5.5, y: 34 });
      points.set(awayGk.id, { x: 99.5, y: 34 });
    } else state.players.forEach((p) => place(p, p.neutralAnchor, 1));
    points.set(taker.id, ball);
  }
  for (const player of state.players)
    if (!roles[player.id])
      assign(
        player,
        player.id === taker.id ? 'taker' : 'shape',
        player.team === 'home' ? 'support_ball' : 'protect_zone',
        points.get(player.id) ?? player.position,
      );
  spreadCluster(points, state.players);
  // Preserve law-critical exact locations after separation.
  if (scenario === 'penalty') {
    points.set(homeGk.id, { x: 5.5, y: 34 });
    points.set(awayGk.id, { x: 104.4, y: 34 });
    points.set(taker.id, ball);
  }
  if (scenario === 'goal_kick' || scenario === 'gk_short') points.set(homeGk.id, ball);
  if (scenario === 'corner') points.set(taker.id, ball);
  const definition =
    TACTICAL_SITUATION_PLAYBOOK[scenario as keyof typeof TACTICAL_SITUATION_PLAYBOOK];
  return {
    ball,
    taker,
    targets: Object.fromEntries(points),
    roles,
    landingZone,
    cornerPlan,
    executionChoices:
      definition?.executionChoices ??
      (scenario === 'penalty' ? ['direct_shot' as const] : ['short_pass' as const]),
  };
};

const mirrorPoint = (point: PitchPoint): PitchPoint => ({
  x: 105 - point.x,
  y: 68 - point.y,
});

/** Derives laws-facing geometry from explicit ownership, independently of renderer orientation. */
export const deriveRestartGeometry = (
  state: TacticalMatchState,
  scenario: RestartScenario,
  restartTeam: TeamSide = 'home',
  restartPoint?: PitchPoint,
) => {
  if (restartTeam === 'home') return deriveHomeRestartGeometry(state, scenario, restartPoint);
  const swap = (side: TeamSide): TeamSide => (side === 'home' ? 'away' : 'home');
  const mirrored: TacticalMatchState = {
    ...state,
    possessionTeam: swap(state.possessionTeam),
    teams: {
      home: { ...state.teams.away, side: 'home' },
      away: { ...state.teams.home, side: 'away' },
    },
    players: state.players.map((player) => ({
      ...player,
      team: swap(player.team),
      position: mirrorPoint(player.position),
      target: mirrorPoint(player.target),
      anchor: mirrorPoint(player.anchor),
      neutralAnchor: mirrorPoint(player.neutralAnchor),
      idealTarget: mirrorPoint(player.idealTarget),
      meanPosition: mirrorPoint(player.meanPosition),
      velocity: { x: -player.velocity.x, y: -player.velocity.y },
    })),
    ball: { ...state.ball, ...mirrorPoint(state.ball) },
  };
  const geometry = deriveHomeRestartGeometry(
    mirrored,
    scenario,
    restartPoint ? mirrorPoint(restartPoint) : undefined,
  );
  return {
    ...geometry,
    ball: mirrorPoint(geometry.ball),
    taker: state.players.find((player) => player.id === geometry.taker.id)!,
    targets: Object.fromEntries(
      Object.entries(geometry.targets).map(([id, point]) => [id, mirrorPoint(point)]),
    ),
    roles: Object.fromEntries(
      Object.entries(geometry.roles).map(([id, role]) => [
        id,
        { ...role, zone: { ...role.zone, centre: mirrorPoint(role.zone.centre) } },
      ]),
    ),
    ...(geometry.landingZone ? { landingZone: mirrorPoint(geometry.landingZone) } : {}),
  };
};

export const restartInfluence = (state: TacticalMatchState) => {
  if (!state.restart) return 0;
  if (state.restart.phase === 'setup') return 1;
  return Math.max(0, 1 - (state.time - (state.restart.executedAt ?? state.time)) / 4);
};
