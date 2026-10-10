import { isMatchGoalkeeper } from './matchGoalkeeper';
import { RandomGenerator } from '../random/RandomGenerator';
import { clampPitchPoint, distance, type PitchPoint, type TeamSide } from './matchSpace';
import { TACTICAL_STYLE_PARAMETERS } from './tacticalPositioning';
import type {
  MatchAction,
  MatchPlayerState,
  RestartScenario,
  TacticalMatchState,
} from './matchState';
import { deriveMovementCapability } from './locomotion';
import { isRestartSetup } from './restartPhase';
import { deriveTeamTacticalPreferences } from './tacticalPreferences';
import {
  chooseCornerPlan,
  TACTICAL_SITUATION_PLAYBOOK,
  type TacticalIntent,
} from './tacticalSituations';

const outfield = (state: TacticalMatchState, side: TeamSide) =>
  state.players.filter(
    (p) => p.team === side && !isMatchGoalkeeper(p) && !state.discipline?.[p.id]?.sentOff,
  );
const goalkeeper = (state: TacticalMatchState, side: TeamSide) =>
  state.players.find(
    (p) => p.team === side && isMatchGoalkeeper(p) && !state.discipline?.[p.id]?.sentOff,
  ) ??
  stableRank(
    state.players.filter((p) => p.team === side && !state.discipline?.[p.id]?.sentOff),
    (p) => -distance(p.position, { x: side === 'home' ? 0 : 105, y: 34 }),
  )[0]!;
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
    centre = { x: ball.x + (dx / length) * 9.15, y: ball.y + (dy / length) * 9.15 },
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
  if (scenario === 'throw_in') return { x: 58, y: 0 };
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
  options: { takerId?: string; selectedAction?: MatchAction } = {},
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
  const nominatedTaker = state.players.find(
    (p) => p.id === options.takerId && p.team === 'home' && !state.discipline?.[p.id]?.sentOff,
  );
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
    const legalCentre = clampPitchPoint(centre);
    roles[player.id] = {
      key,
      intent,
      zone: { centre: legalCentre, radius: 8, timing: 0 },
      ...(markerId ? { markerId } : {}),
    };
  };
  if (scenario === 'goal_kick' || scenario === 'gk_short') {
    taker = nominatedTaker ?? homeGk;
    points.set(homeGk.id, homeGk.id === taker.id ? ball : homeGk.neutralAnchor);
    points.set(taker.id, ball);
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
        ? clampPitchPoint({
            x: 61 + jitter(state.seed, 'landing', 8).x,
            y: 34 + jitter(state.seed, 'landing', 0, 18).y,
          })
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
    taker = nominatedTaker ?? stableRank(home, (p) => -distance(p.position, ball))[0]!;
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
    taker = nominatedTaker ?? chooseCornerTaker(state, 'home');
    points.set(taker.id, ball);
    points.set(homeGk.id, { x: 7, y: 34 });
    points.set(awayGk.id, { x: 103.8, y: 34 });
    const defenceZones = [
      { x: 101, y: 27 },
      { x: 100, y: 34 },
      { x: 99, y: 41 },
      { x: 96, y: 32 },
      { x: 95, y: 39 },
      { x: 91, y: 28 },
    ];
    away.forEach((p, i) => {
      const outlet = i === away.length - 1;
      const zone = outlet ? { x: 70, y: i % 2 ? 18 : 50 } : defenceZones[i % defenceZones.length]!;
      place(p, zone, 2.8);
      assign(
        p,
        outlet ? 'counter_outlet' : 'zone',
        outlet ? 'counter_outlet' : 'protect_zone',
        zone,
      );
    });
    landingZone = { x: 97, y: 34 };
  } else if (scenario.startsWith('free_kick')) {
    taker = nominatedTaker ?? chooseFreeKickTaker(state, 'home');
    points.set(taker.id, { x: ball.x - 2.2, y: ball.y });
    points.set(homeGk.id, { x: 8, y: 34 });
    points.set(awayGk.id, { x: 103.5, y: scenario === 'free_kick_wide' ? 31 : 35 });
    const wide = scenario === 'free_kick_wide',
      advanced = ball.x >= 65,
      goalDistance = distance(ball, { x: 105, y: 34 }),
      wallSize = Math.min(
        away.length,
        goalDistance < 31
          ? 4
          : goalDistance < 42 && (!wide || options.selectedAction?.type === 'shot')
            ? 2
            : 0,
      );
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
    const protectingLateLead = state.time > 80 * 60 && state.score.away > state.score.home;
    const outlet =
      !protectingLateLead && away.length >= 8
        ? stableRank(
            away.filter((p) => !points.has(p.id)),
            (p) =>
              p.profile.attributes.pace * 0.4 +
              p.profile.attributes.gameReading * 0.3 +
              p.profile.attributes.firstTouch * 0.3 +
              (p.duty === 'attack' ? 12 : 0),
          )[0]
        : undefined;
    if (outlet) {
      const zone = { x: Math.max(40, Math.min(68, ball.x - 24)), y: outlet.neutralAnchor.y };
      place(outlet, zone, 0.8);
      assign(outlet, 'counter_outlet', 'counter_outlet', zone);
    }
    away
      .filter((p) => !points.has(p.id))
      .forEach((p, i) => {
        const zone = { x: Math.max(82, Math.min(99, ball.x + 8)), y: 19 + (i % 6) * 6 };
        place(p, zone, 0.8);
        assign(p, 'zonal_protection', 'protect_zone', zone);
      });
    landingZone = advanced ? { x: 96, y: 34 } : { x: Math.min(88, ball.x + 14), y: 34 };
  } else if (scenario === 'penalty') {
    taker = nominatedTaker ?? choosePenaltyTaker(state, 'home');
    points.set(taker.id, ball);
    points.set(homeGk.id, { x: 5.5, y: 34 });
    points.set(awayGk.id, { x: 105, y: 34 });
    // Rebound candidates stand just outside the box and 9.15 m arc, behind the mark.
    // Use a small legal margin so seeded jitter/separation cannot create encroachment.
    const reboundPoint = (y: number, row = 0): PitchPoint => ({
      x: Math.min(87.8, ball.x - Math.sqrt(Math.max(0, 9.6 ** 2 - (y - ball.y) ** 2))) - row * 1.25,
      y,
    });
    const attackers = home.filter((p) => p.id !== taker.id);
    attackers.forEach((p, i) => {
      const base =
        i < 7
          ? reboundPoint([22, 28, 40, 46, 18, 34, 50][i]!, i % 2)
          : { x: 65 - (i - 7) * 4, y: 25 + (i - 7) * 16 };
      place(p, base, 0.45);
      assign(
        p,
        i < 7 ? 'rebound_attack' : 'rest_defence',
        i < 7 ? 'attack_second_ball' : 'rest_defence',
        base,
      );
    });
    away.forEach((p, i) => {
      const base =
        i < 9
          ? reboundPoint([20, 26, 32, 38, 44, 48, 16, 36, 52][i]!, 1 + (i % 2))
          : { x: 69, y: 34 };
      place(p, base, 0.45);
      assign(
        p,
        i < 9 ? 'rebound_defence' : 'counter_outlet',
        i === 9 ? 'counter_outlet' : 'protect_zone',
        base,
      );
    });
  } else {
    taker = nominatedTaker ?? stableRank(home, (p) => -distance(p.position, ball))[0]!;
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
  // The delivery shapes responsibilities, not the current ranking of aerial attributes alone.
  // Reserve cover before choosing receivers so an excellent heading defender can still protect
  // a counterattack. This bounded assignment runs only at award or after a changed selection.
  if (scenario === 'corner' || scenario.startsWith('free_kick')) {
    const selected = options.selectedAction;
    if (scenario === 'corner' && selected) {
      cornerPlan =
        selected.type === 'pass'
          ? 'short_corner'
          : selected.type === 'cross' &&
              (ball.y <= 34 ? selected.target.y < 31 : selected.target.y > 37)
            ? 'direct_near_post'
            : 'direct_mixed_or_far';
    }
    const preferences = deriveTeamTacticalPreferences(state, 'home');
    const defendingLead = state.time > 75 * 60 && state.score.home > state.score.away;
    const candidates = home.filter((p) => p.id !== taker.id);
    const selectedReceiverId =
      selected?.type === 'pass'
        ? selected.receiverId
        : selected?.type === 'cross'
          ? selected.intendedTargetId
          : undefined;
    const coverCount = Math.min(
      candidates.length,
      defendingLead || preferences.verticality < 0.42 ? 3 : 2,
    );
    const covers = stableRank(
      candidates.filter((p) => p.id !== selectedReceiverId),
      (p) =>
        p.profile.attributes.positioning * 0.35 +
        p.profile.attributes.gameReading * 0.25 +
        p.profile.attributes.tackling * 0.2 +
        p.profile.attributes.pace * 0.2 +
        (p.duty === 'defend' ? 12 : 0) -
        p.neutralAnchor.x * 0.25 -
        distance(p.position, { x: Math.min(70, ball.x - 20), y: 34 }) * 0.35,
    ).slice(0, coverCount);
    covers.forEach((p, i) => {
      const zone = {
        x: Math.max(8, Math.min(70, ball.x - 20) - (i % 2) * 4),
        y: i === 2 ? 34 : 23 + i * 22,
      };
      place(p, zone, 0.8);
      assign(p, 'rest_defence', 'rest_defence', zone);
      roles[p.id]!.zone.radius = 6;
    });
    const available = candidates.filter((p) => !covers.includes(p));
    const take = (zone: PitchPoint, score: (p: MatchPlayerState) => number) => {
      const chosen = stableRank(
        available.filter((p) => p.id !== selectedReceiverId),
        (p) => {
          const capability = deriveMovementCapability(p);
          const arrival = distance(p.position, zone) / capability.runSpeed;
          const clearance = Math.min(
            8,
            ...away.map((opponent) => distance(opponent.position, zone)),
          );
          return score(p) - arrival * 5 + clearance;
        },
      )[0];
      if (chosen) available.splice(available.indexOf(chosen), 1);
      return chosen;
    };
    const shortZone = clampPitchPoint(
      scenario === 'corner'
        ? { x: ball.x - 5, y: ball.y <= 34 ? 6 : 62 }
        : { x: ball.x - 1.5, y: ball.y + (ball.y <= 34 ? 6 : -6) },
    );
    const receiver =
      selected?.type === 'pass' ? available.find((p) => p.id === selected.receiverId) : undefined;
    if (receiver) available.splice(available.indexOf(receiver), 1);
    const short =
      receiver ??
      take(
        shortZone,
        (p) =>
          p.profile.attributes.passing * 0.5 +
          p.profile.attributes.firstTouch * 0.3 +
          p.profile.attributes.gameReading * 0.2,
      );
    if (short) {
      const zone = receiver && selected?.type === 'pass' ? selected.target : shortZone;
      place(short, zone, 0.6);
      assign(short, receiver ? 'selected_receiver' : 'short_option', 'short_option', zone);
      roles[short.id]!.zone.radius = 2;
    }
    const direct = selected?.type === 'shot' || (!selected && scenario === 'free_kick_close');
    const deliveryTarget =
      selected && (selected.type === 'cross' || selected.type === 'space_pass')
        ? selected.target
        : undefined;
    const edgeZone = clampPitchPoint({
      x: scenario === 'corner' ? 86 : Math.min(87, Math.max(24, ball.x + 7)),
      y: 34,
    });
    const edge = take(
      edgeZone,
      (p) =>
        p.profile.attributes.gameReading * 0.5 +
        p.profile.attributes.passing * 0.3 +
        p.profile.attributes.firstTouch * 0.2,
    );
    if (edge) {
      place(edge, edgeZone, 0.7);
      assign(edge, 'edge_support', 'attack_second_ball', edgeZone);
      roles[edge.id]!.zone.radius = 4;
    }
    const nearY = ball.y <= 34 ? 27 : 41;
    const deliveryDepth = scenario === 'corner' ? 97 : Math.min(96, ball.x + 18);
    const reboundDepth = Math.min(91, ball.x + 8);
    const zones = direct
      ? [
          { x: reboundDepth, y: 29 },
          { x: reboundDepth, y: 39 },
          { x: Math.max(12, reboundDepth - 4), y: 34 },
        ]
      : [
          { x: deliveryDepth + 1, y: nearY },
          { x: deliveryDepth, y: 34 },
          { x: deliveryDepth - 1, y: 68 - nearY },
        ];
    if (deliveryTarget) {
      const nearest = zones
        .map((zone, index) => ({ index, d: distance(zone, deliveryTarget) }))
        .sort((a, b) => a.d - b.d)[0]!;
      zones[nearest.index] = deliveryTarget;
    }
    const receivers: MatchPlayerState[] = [];
    zones.forEach((point, i) => {
      const zone = clampPitchPoint(point);
      const intended =
        selected?.type === 'cross' && selected.intendedTargetId
          ? available.find((p) => p.id === selected.intendedTargetId)
          : undefined;
      const target =
        deliveryTarget && distance(zone, deliveryTarget) < 0.1 && intended
          ? intended
          : take(zone, (p) =>
              direct
                ? p.profile.attributes.gameReading * 0.5 + p.profile.attributes.pace * 0.5
                : aerialScore(p) * 0.65 +
                  p.profile.attributes.gameReading * 0.2 +
                  p.profile.attributes.pace * 0.15,
            );
      if (!target) return;
      if (target === intended) available.splice(available.indexOf(target), 1);
      receivers.push(target);
      place(target, zone, selected?.type === 'cross' && selected.intent === 'driven' ? 0.7 : 1.5);
      assign(
        target,
        direct
          ? 'rebound_attacker'
          : i === 0
            ? 'near_post_target'
            : i === 1
              ? 'central_target'
              : 'far_post_target',
        direct
          ? 'attack_second_ball'
          : i === 0
            ? 'attack_near_post'
            : i === 1
              ? 'attack_central'
              : 'attack_far_post',
        zone,
      );
      roles[target.id]!.zone.radius = direct ? 4 : 3;
      roles[target.id]!.zone.timing =
        selected?.type === 'cross' && selected.intent === 'floated' ? 0.35 : 0;
    });
    available.forEach((p, i) => {
      const zone = clampPitchPoint(
        i === 0
          ? { x: ball.x - 3, y: ball.y + (ball.y <= 34 ? 2 : -2) }
          : { x: ball.x - 12, y: 20 + (i % 3) * 14 },
      );
      place(p, zone, 0.7);
      assign(p, i === 0 ? 'secondary_taker' : 'recycle_support', 'support_ball', zone);
      roles[p.id]!.zone.radius = 3;
    });
    const defenders = stableRank(
      away.filter((p) => roles[p.id]?.key !== 'wall' && roles[p.id]?.intent !== 'counter_outlet'),
      (p) => p.profile.attributes.positioning + p.profile.attributes.gameReading,
    );
    defenders.forEach((p, i) => {
      const marked = receivers[i % Math.max(1, receivers.length)];
      if (!marked || i >= receivers.length * 2) return;
      const zone = clampPitchPoint({
        x: roles[marked.id]!.zone.centre.x + 1.3,
        y: roles[marked.id]!.zone.centre.y + (i < receivers.length ? 0.8 : -1.2),
      });
      place(p, zone, 0.45);
      assign(p, 'marker', 'mark_opponent', zone, marked.id);
      roles[p.id]!.zone.radius = 2;
    });
    landingZone = clampPitchPoint(deliveryTarget ?? zones[1]!);
    points.set(taker.id, scenario === 'corner' ? ball : { x: ball.x - 1.4, y: ball.y });
    assign(taker, 'taker', 'support_ball', points.get(taker.id)!);
    roles[taker.id]!.zone.radius = 0.6;
  }
  for (const player of state.players.filter((p) => !state.discipline?.[p.id]?.sentOff))
    if (!roles[player.id])
      assign(
        player,
        player.id === taker.id ? 'taker' : 'shape',
        player.team === 'home' ? 'support_ball' : 'protect_zone',
        points.get(player.id) ?? player.position,
      );
  spreadCluster(
    points,
    state.players.filter((p) => !state.discipline?.[p.id]?.sentOff),
  );
  // Preserve law-critical exact locations after separation.
  if (scenario === 'penalty') {
    points.set(homeGk.id, { x: 5.5, y: 34 });
    points.set(awayGk.id, { x: 105, y: 34 });
    points.set(taker.id, ball);
    // A dismissed keeper can be replaced by an active outfielder. The match role, rather
    // than the footballer's permanent preferred position, owns Law 14 positioning.
    assign(awayGk, 'penalty_goalkeeper', 'protect_zone', { x: 105, y: 34 });
  }
  if (scenario === 'goal_kick' || scenario === 'gk_short') points.set(taker.id, ball);
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
  options: { takerId?: string; selectedAction?: MatchAction } = {},
) => {
  if (restartTeam === 'home')
    return deriveHomeRestartGeometry(state, scenario, restartPoint, options);
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
    {
      ...options,
      ...(options.selectedAction
        ? {
            selectedAction: {
              ...options.selectedAction,
              ...('target' in options.selectedAction
                ? { target: mirrorPoint(options.selectedAction.target) }
                : {}),
            },
          }
        : {}),
    },
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
  if (isRestartSetup(state)) return 1;
  if (state.scenario === 'penalty') return 0;
  return Math.max(0, 1 - (state.time - (state.restart.executedAt ?? state.time)) / 4);
};

/** Small per-tick projection over the stored plan. Only targets change: existing locomotion
 * owns acceleration, turning and travel. It never rebuilds or separates the whole formation. */
export const deriveRestartMovementTargets = (
  state: TacticalMatchState,
): Record<string, PitchPoint> => {
  const restart = state.restart;
  if (!restart) return {};
  const players = new Map(
    state.players.filter((p) => !state.discipline?.[p.id]?.sentOff).map((p) => [p.id, p]),
  );
  const targets: Record<string, PitchPoint> = {};
  const selected = restart.selectedAction;
  const markers = new Map<string, MatchPlayerState>();
  for (const [id, role] of Object.entries(restart.roles)) {
    const marker = players.get(id);
    if (role.markerId && marker && !markers.has(role.markerId)) markers.set(role.markerId, marker);
  }
  const walls = Object.entries(restart.roles)
    .filter(([, role]) => role.key === 'wall')
    .map(([id]) => players.get(id))
    .filter((p): p is MatchPlayerState => Boolean(p));
  for (const [id, planned] of Object.entries(restart.targets)) {
    const player = players.get(id);
    if (!player) continue;
    const role = restart.roles[id];
    let target = planned;
    if (restart.origin !== 'dev_fixture' && role && id !== restart.takerId && role.key !== 'wall') {
      const marked = role.markerId ? players.get(role.markerId) : undefined;
      if (marked && role.intent === 'mark_opponent') {
        target = {
          x: marked.position.x + (player.team === 'away' ? 1.2 : -1.2),
          y: marked.position.y + (planned.y >= marked.position.y ? 0.8 : -0.8),
        };
      } else {
        const centre = role.zone.centre;
        const receiver =
          selected?.type === 'cross'
            ? selected.intendedTargetId
            : selected?.type === 'pass'
              ? selected.receiverId
              : undefined;
        const selectedRun = Boolean(
          selected && (role.intent.startsWith('attack_') || id === receiver),
        );
        const radius = selectedRun ? Math.min(1, role.zone.radius) : Math.min(3, role.zone.radius);
        const remaining = distance(player.position, centre);
        target =
          remaining <= radius
            ? player.position
            : {
                x: centre.x + ((player.position.x - centre.x) * radius) / remaining,
                y: centre.y + ((player.position.y - centre.y) * radius) / remaining,
              };
        const marker = markers.get(id);
        if (
          selectedRun &&
          marker &&
          distance(player.position, marker.position) < 1.5 &&
          id !== receiver
        ) {
          target = {
            x: target.x,
            y: target.y + (player.position.y >= marker.position.y ? 0.8 : -0.8),
          };
        }
      }
      // A three-player wall also constrains attacking preparation, independently of UI labels.
      if (walls.length >= 3 && player.team === restart.restartTeam) {
        for (const wall of walls) {
          const gap = distance(target, wall.position);
          if (gap >= 1.25) continue;
          const dx = target.x - wall.position.x,
            dy = target.y - wall.position.y;
          const d = Math.hypot(dx, dy);
          target =
            d < 0.01
              ? { x: wall.position.x + (player.team === 'home' ? -1.25 : 1.25), y: wall.position.y }
              : { x: wall.position.x + (dx / d) * 1.25, y: wall.position.y + (dy / d) * 1.25 };
        }
      }
    }
    targets[id] = clampPitchPoint(target);
  }
  return targets;
};
