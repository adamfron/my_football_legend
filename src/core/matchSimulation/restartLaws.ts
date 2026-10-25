import { attacksRight, type TeamOrientation } from './matchSpace';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { z } from 'zod';
import { distance, distanceToSegment, type PitchPoint, type TeamSide } from './matchSpace';
import type { MatchPlayerState, RestartScenario, TacticalMatchState } from './matchState';

/** Fixed rule reference; period-end penalty extensions are owned by matchTimekeeping. */
export const RESTART_LAWS_VERSION = 'IFAB_2026_27' as const;
export const RESTART_REQUIRED_DISTANCE = 9.15;
const GOAL_AREA_Y = [24.84, 43.16] as const;
const PENALTY_AREA_Y = [13.84, 54.16] as const;
const EPSILON = 0.01;
const bound = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isFreeKick = (scenario: RestartScenario) => scenario.startsWith('free_kick');
const opposite = (side: TeamSide): TeamSide => (side === 'home' ? 'away' : 'home');
const ownDepth = (point: PitchPoint, team: TeamOrientation) =>
  attacksRight(team) ? point.x : 105 - point.x;
const inGoalArea = (point: PitchPoint, team: TeamOrientation) =>
  ownDepth(point, team) >= 0 &&
  ownDepth(point, team) <= 5.5 &&
  point.y >= GOAL_AREA_Y[0] &&
  point.y <= GOAL_AREA_Y[1];
const inPenaltyArea = (point: PitchPoint, team: TeamOrientation, margin = 0) =>
  ownDepth(point, team) >= -margin &&
  ownDepth(point, team) <= 16.5 + margin &&
  point.y >= PENALTY_AREA_Y[0] - margin &&
  point.y <= PENALTY_AREA_Y[1] + margin;

/** Incident provenance stays immutable; this returns one permissible restart placement. */
export const legalRestartPosition = (
  scenario: RestartScenario,
  team: TeamSide,
  incidentPoint: PitchPoint,
  indirect = false,
  endsSwitched = false,
): PitchPoint => {
  if (endsSwitched) {
    const point = legalRestartPosition(
      scenario,
      team,
      { x: 105 - incidentPoint.x, y: 68 - incidentPoint.y },
      indirect,
    );
    return { x: 105 - point.x, y: 68 - point.y };
  }
  const point = { x: bound(incidentPoint.x, 0, 105), y: bound(incidentPoint.y, 0, 68) };
  if (scenario === 'kick_off') return { x: 52.5, y: 34 };
  if (scenario === 'penalty') return { x: attacksRight(team) ? 94 : 11, y: 34 };
  if (scenario === 'throw_in') return { x: point.x, y: point.y <= 34 ? 0 : 68 };
  if (scenario === 'corner')
    return { x: attacksRight(team) ? 104.5 : 0.5, y: point.y <= 34 ? 0.5 : 67.5 };
  if (scenario === 'goal_kick' || scenario === 'gk_short')
    return {
      x: attacksRight(team) ? bound(point.x, 0, 5.5) : bound(point.x, 99.5, 105),
      y: bound(point.y, GOAL_AREA_Y[0], GOAL_AREA_Y[1]),
    };
  if (isFreeKick(scenario) && indirect && inGoalArea(point, opposite(team)))
    return { x: attacksRight(team) ? 99.5 : 5.5, y: point.y };
  return point;
};

export const restartLawContractSchema = z.object({
  directOpponentGoal: z.boolean(),
  directOwnGoal: z.literal(false),
  requiresOtherPlayerTouch: z.boolean(),
  offsideExempt: z.boolean(),
  secondTouchProhibited: z.boolean(),
});
export type RestartLawContract = z.infer<typeof restartLawContractSchema>;

/** Physical touches satisfy Law 13; public control-episode statistics are not the law signal. */
export const restartLawContract = (
  scenario: RestartScenario,
  indirect = false,
): RestartLawContract => ({
  directOpponentGoal:
    scenario !== 'open_play' && scenario !== 'throw_in' && !(isFreeKick(scenario) && indirect),
  directOwnGoal: false,
  requiresOtherPlayerTouch: scenario === 'throw_in' || (isFreeKick(scenario) && indirect),
  offsideExempt: ['goal_kick', 'gk_short', 'corner', 'throw_in'].includes(scenario),
  secondTouchProhibited: scenario !== 'open_play',
});

export const restartGoalOutcomeSchema = z.enum([
  'goal',
  'goal_kick',
  'corner',
  'indirect_free_kick',
]);
export type RestartGoalOutcome = z.infer<typeof restartGoalOutcomeSchema>;
/** Another player's physical deflection counts; posts, ground and another taker touch do not. */
export const resolveRestartGoalOutcome = (
  scenario: RestartScenario,
  restartTeam: TeamSide,
  scoringTeam: TeamSide,
  indirect = false,
  anotherPlayerTouched = false,
  takerSecondTouch = false,
): RestartGoalOutcome => {
  if (scenario === 'open_play' || anotherPlayerTouched) return 'goal';
  if (takerSecondTouch) return 'indirect_free_kick';
  if (scoringTeam !== restartTeam) return 'corner';
  return restartLawContract(scenario, indirect).directOpponentGoal ? 'goal' : 'goal_kick';
};

const pitchTarget = (point: PitchPoint): PitchPoint => ({
  x: bound(point.x, 0.4, 104.6),
  y: bound(point.y, 0.4, 67.6),
});
const outsideCircle = (
  target: PitchPoint,
  centre: PitchPoint,
  radius: number,
  fallbackX: number,
): PitchPoint => {
  let dx = target.x - centre.x,
    dy = target.y - centre.y;
  let length = Math.hypot(dx, dy);
  if (length >= radius) return target;
  if (length < 0.001) {
    dx = fallbackX;
    dy = 0;
    length = 1;
  }
  const projected = pitchTarget({
    x: centre.x + (dx / length) * radius,
    y: centre.y + (dy / length) * radius,
  });
  if (distance(projected, centre) >= radius - EPSILON) return projected;
  // The circular restriction may meet a touch/goal line. Choose the legal inward direction.
  const inwardX = centre.x <= 52.5 ? 1 : -1;
  return pitchTarget({ x: centre.x + inwardX * radius, y: centre.y });
};
const outsidePenaltyArea = (target: PitchPoint, team: TeamOrientation): PitchPoint => {
  // Locomotion brakes within 0.08 m of its target. A target barely outside a law boundary
  // can therefore leave the body illegally inside forever; keep the existing intent margin.
  if (!inPenaltyArea(target, team, 0.3)) return target;
  const candidates = [
    { x: attacksRight(team) ? 16.8 : 88.2, y: target.y },
    { x: target.x, y: PENALTY_AREA_Y[0] - 0.3 },
    { x: target.x, y: PENALTY_AREA_Y[1] + 0.3 },
  ];
  return candidates.sort((a, b) => distance(a, target) - distance(b, target))[0]!;
};

/** Geometry nominates a real active keeper, including an outfield replacement after dismissal. */
export const restartPenaltyGoalkeeper = (state: TacticalMatchState) =>
  state.players.find(
    (player) =>
      player.team !== state.restart?.restartTeam &&
      !state.discipline?.[player.id]?.sentOff &&
      state.restart?.roles[player.id]?.key === 'penalty_goalkeeper',
  ) ??
  state.players.find(
    (player) =>
      player.team !== state.restart?.restartTeam &&
      !state.discipline?.[player.id]?.sentOff &&
      isMatchGoalkeeper(player),
  );

/** Law 8 alone permits a keeper near halfway. Ordinary kickoff also waits for the
 * existing 5.5m starting-depth plan, allowing its 3m support zone and ordinary braking. */
export const areKickoffGoalkeepersReady = (state: TacticalMatchState): boolean =>
  state.scenario !== 'kick_off' ||
  state.restart?.origin !== 'live_event' ||
  (['home', 'away'] as const).every((team) => {
    const keeper = state.players.find((p) => p.team === team && isMatchGoalkeeper(p));
    return Boolean(
      keeper && ownDepth(keeper.position, keeper) <= 9 && Math.abs(keeper.position.y - 34) <= 5,
    );
  });

/** Projects movement intentions, never player coordinates; arrival is handled by locomotion. */
export const legalizeRestartPlayerTarget = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  proposed: PitchPoint,
): PitchPoint => {
  const restart = state.restart;
  if (!restart) return proposed;
  const spot =
    restart.spot ??
    legalRestartPosition(
      state.scenario,
      restart.restartTeam,
      state.ball,
      restart.indirect,
      state.endsSwitched,
    );
  if (player.id === restart.takerId) return spot;
  let target = pitchTarget(proposed);
  const opponent = player.team !== restart.restartTeam;
  if (state.scenario === 'kick_off') {
    target.x = attacksRight(player) ? Math.min(target.x, 52.3) : Math.max(target.x, 52.7);
    if (opponent) target = outsideCircle(target, spot, 9.3, attacksRight(player) ? -1 : 1);
  } else if (state.scenario === 'penalty') {
    if (opponent && player.id === restartPenaltyGoalkeeper(state)?.id)
      return { x: attacksRight(player) ? 0 : 105, y: bound(target.y, 30.5, 37.5) };
    target.x = attacksRight(restart.restartTeam, state)
      ? Math.min(target.x, spot.x - 0.3)
      : Math.max(target.x, spot.x + 0.3);
    target = outsidePenaltyArea(target, state.teams[opposite(restart.restartTeam)]);
    target = outsideCircle(target, spot, 9.3, attacksRight(restart.restartTeam, state) ? -1 : 1);
    target = outsidePenaltyArea(target, state.teams[opposite(restart.restartTeam)]);
  } else if (opponent && (state.scenario === 'goal_kick' || state.scenario === 'gk_short')) {
    target = outsidePenaltyArea(target, state.teams[restart.restartTeam]);
  } else if (opponent && state.scenario === 'corner') {
    target = outsideCircle(
      target,
      { x: attacksRight(restart.restartTeam, state) ? 105 : 0, y: spot.y <= 34 ? 0 : 68 },
      10.3,
      attacksRight(restart.restartTeam, state) ? -1 : 1,
    );
  } else if (opponent && state.scenario === 'throw_in') {
    target = outsideCircle(target, spot, 2.2, attacksRight(player) ? -1 : 1);
  } else if (isFreeKick(state.scenario)) {
    if (opponent) {
      const onOwnGoalLine = ownDepth(target, player) <= 0.4 && Math.abs(target.y - 34) <= 3.66;
      if (!onOwnGoalLine)
        // Markers must stand beyond the wall's body envelope during preparation.
        // Projecting all defenders onto the same 9.3m arc creates an impossible
        // packed target and body separation repeatedly violates the 9.15m law.
        target = outsideCircle(
          target,
          spot,
          restart.roles[player.id]?.key === 'wall' ? 9.5 : 11,
          attacksRight(player) ? -1 : 1,
        );
      if (inPenaltyArea(spot, state.teams[restart.restartTeam]))
        target = outsidePenaltyArea(target, state.teams[restart.restartTeam]);
      if (restart.roles[player.id]?.key !== 'wall' && distance(player.position, spot) < 9.3) {
        const obstacles = state.players.filter((p) => p.id !== player.id);
        const blocked = (point: PitchPoint) =>
          obstacles.some((p) => {
            const dx = point.x - player.position.x,
              dy = point.y - player.position.y;
            const fraction =
              ((p.position.x - player.position.x) * dx + (p.position.y - player.position.y) * dy) /
              Math.max(0.001, dx * dx + dy * dy);
            return fraction > 0.01 && distanceToSegment(p.position, player.position, point) < 1.2;
          });
        // Any settled body can block an encroaching defender's route, including
        // opposing support players outside the wall. Choose a clear legal target
        // around those bodies; locomotion and actual referee distance still gate
        // release. Include the endpoint's body envelope, not only the open segment.
        if (blocked(target)) {
          const angle = Math.atan2(target.y - spot.y, target.x - spot.x);
          const around = [
            -Math.PI,
            -2.4,
            -2,
            -1.6,
            -1.2,
            -1,
            -0.8,
            -0.6,
            -0.4,
            -0.2,
            0.2,
            0.4,
            0.6,
            0.8,
            1,
            1.2,
            1.6,
            2,
            2.4,
            Math.PI,
          ]
            .map((turn) =>
              pitchTarget({
                x: spot.x + Math.cos(angle + turn) * 11,
                y: spot.y + Math.sin(angle + turn) * 11,
              }),
            )
            .filter((point) => distance(point, spot) >= 9.3 && !blocked(point))
            .sort(
              (a, b) =>
                distance(player.position, a) +
                distance(target, a) * 0.25 -
                distance(player.position, b) -
                distance(target, b) * 0.25,
            );
          if (around[0]) target = around[0];
        }
      }
    } else {
      const wall = state.players.filter(
        (defender) =>
          defender.team !== restart.restartTeam && restart.roles[defender.id]?.key === 'wall',
      );
      if (wall.length > 0) {
        for (let iteration = 0; iteration < 4; iteration++)
          for (const defender of wall)
            target = outsideCircle(
              target,
              defender.position,
              // The 1.15m body envelope also applies to a two-player wall. Include
              // the ordinary 0.08m stopping envelope so the target is attainable.
              1.25,
              attacksRight(restart.restartTeam, state) ? -1 : 1,
            );
        if (wall.some((defender) => distance(target, defender.position) < 1.15)) {
          // A cluster of overlapping exclusion circles has a simple safe ball-side fallback.
          const nearest = [...wall].sort(
            (a, b) => distance(target, a.position) - distance(target, b.position),
          )[0]!;
          const dx = spot.x - nearest.position.x,
            dy = spot.y - nearest.position.y;
          const length = Math.max(0.001, Math.hypot(dx, dy));
          target = pitchTarget({
            x: nearest.position.x + (dx / length) * 2,
            y: nearest.position.y + (dy / length) * 2,
          });
        }
      }
    }
  }
  return target;
};

export const restartLegalReadinessSchema = z.object({
  ready: z.boolean(),
  ballReady: z.boolean(),
  takerReady: z.boolean(),
  opponentsReady: z.boolean(),
  participantsReady: z.boolean(),
  refereeReady: z.boolean(),
  quickRestart: z.boolean(),
  blockers: z.array(z.string()),
});
export type RestartLegalReadiness = z.infer<typeof restartLegalReadinessSchema>;

/** Observes legal constraints only. Tactical receiver arrival and human choice have other owners. */
export const deriveRestartLegalReadiness = (state: TacticalMatchState): RestartLegalReadiness => {
  const restart = state.restart;
  if (!restart || state.scenario === 'open_play')
    return {
      ready: false,
      ballReady: false,
      takerReady: false,
      opponentsReady: false,
      participantsReady: false,
      refereeReady: false,
      quickRestart: false,
      blockers: ['no_restart'],
    };
  const taker = state.players.find(
    (player) =>
      player.id === restart.takerId &&
      player.team === restart.restartTeam &&
      !state.discipline?.[player.id]?.sentOff,
  );
  const spot =
    restart.spot ??
    legalRestartPosition(
      state.scenario,
      restart.restartTeam,
      state.ball,
      restart.indirect,
      state.endsSwitched,
    );
  const legalSpot = legalRestartPosition(
    state.scenario,
    restart.restartTeam,
    spot,
    restart.indirect,
    state.endsSwitched,
  );
  const speed = Math.hypot(
    state.ball.velocity?.x ?? 0,
    state.ball.velocity?.y ?? 0,
    state.ball.velocity?.z ?? 0,
  );
  const ballReady =
    distance(spot, legalSpot) <= EPSILON &&
    distance(state.ball, spot) <= 0.15 &&
    speed <= 0.15 &&
    (state.experimentalRestartPreparation === true && state.scenario === 'throw_in'
      ? Math.abs((state.ball.height ?? 0) - 1.9) <= 0.01
      : (state.ball.height ?? 0) <= 0.15);
  const takerReady = Boolean(
    taker &&
      distance(taker.position, spot) <= 1.4 + 1e-8 &&
      Math.hypot(taker.velocity.x, taker.velocity.y) <= 1.5,
  );
  const refereeReady =
    (state.status === 'first_half' || state.status === 'second_half') && !state.periodEndPending;
  const quickRestart = isFreeKick(state.scenario) && restart.ceremonial === false;
  let opponentsReady = true;
  let participantsReady = true;
  const opponents = state.players.filter(
    (player) => player.team !== restart.restartTeam && !state.discipline?.[player.id]?.sentOff,
  );
  if (state.scenario === 'kick_off') {
    participantsReady = state.players.every(
      (player) =>
        player.id === restart.takerId || ownDepth(player.position, player) <= 52.5 + EPSILON,
    );
    opponentsReady = opponents.every(
      (player) => distance(player.position, spot) >= RESTART_REQUIRED_DISTANCE - EPSILON,
    );
  } else if (state.scenario === 'penalty') {
    const keeper = restartPenaltyGoalkeeper(state);
    opponentsReady = Boolean(
      keeper &&
        ownDepth(keeper.position, keeper) <= 0.4 &&
        Math.abs(keeper.position.y - 34) <= 3.66,
    );
    participantsReady = state.players.every(
      (player) =>
        player.id === restart.takerId ||
        player.id === keeper?.id ||
        (!inPenaltyArea(player.position, state.teams[opposite(restart.restartTeam)]) &&
          ownDepth(player.position, state.teams[restart.restartTeam]) <
            ownDepth(spot, state.teams[restart.restartTeam]) &&
          distance(player.position, spot) >= RESTART_REQUIRED_DISTANCE - EPSILON),
    );
  } else if (state.scenario === 'goal_kick' || state.scenario === 'gk_short') {
    opponentsReady = opponents.every(
      (player) => !inPenaltyArea(player.position, state.teams[restart.restartTeam]),
    );
  } else if (state.scenario === 'throw_in') {
    opponentsReady = opponents.every((player) => distance(player.position, spot) >= 2 - EPSILON);
  } else if (state.scenario === 'corner') {
    const corner = {
      x: attacksRight(restart.restartTeam, state) ? 105 : 0,
      y: spot.y <= 34 ? 0 : 68,
    };
    opponentsReady = opponents.every(
      (player) => distance(player.position, corner) >= 1 + RESTART_REQUIRED_DISTANCE - EPSILON,
    );
  } else if (isFreeKick(state.scenario)) {
    opponentsReady =
      quickRestart ||
      opponents.every((player) => {
        const onOwnGoalLine =
          ownDepth(player.position, player) <= 0.4 && Math.abs(player.position.y - 34) <= 3.66;
        return (
          (onOwnGoalLine ||
            distance(player.position, spot) >= RESTART_REQUIRED_DISTANCE - EPSILON) &&
          (!inPenaltyArea(spot, state.teams[restart.restartTeam]) ||
            !inPenaltyArea(player.position, state.teams[restart.restartTeam]))
        );
      });
    const wall = opponents.filter((player) => restart.roles[player.id]?.key === 'wall');
    if (wall.length >= 3)
      participantsReady = state.players
        .filter((player) => player.team === restart.restartTeam)
        .every((player) =>
          wall.every((defender) => distance(player.position, defender.position) >= 1 - EPSILON),
        );
  }
  const blockers = [
    !refereeReady ? 'invalid_match_phase' : '',
    !ballReady ? 'ball_not_placed' : '',
    !takerReady ? 'taker_not_ready' : '',
    !opponentsReady ? 'opponent_restriction' : '',
    !participantsReady ? 'participant_restriction' : '',
    isFreeKick(state.scenario) &&
    restart.ceremonial &&
    state.players.some(
      (player) =>
        restart.roles[player.id]?.key === 'wall' &&
        (distance(
          player.position,
          legalizeRestartPlayerTarget(state, player, restart.targets[player.id] ?? player.target),
        ) > 0.6 ||
          Math.hypot(player.velocity.x, player.velocity.y) > 0.5),
    )
      ? 'wall_developing'
      : '',
  ].filter(Boolean);
  return {
    ready: blockers.length === 0,
    ballReady,
    takerReady,
    opponentsReady,
    participantsReady,
    refereeReady,
    quickRestart,
    blockers,
  };
};
