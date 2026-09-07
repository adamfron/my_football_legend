import { RandomGenerator } from '../random/RandomGenerator';
import {
  clampPitchPoint,
  distance,
  formationSlotToTeamSpace,
  PITCH_LENGTH,
  type PitchPoint,
  type TeamSide,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState, TacticalStyle } from './matchState';
import { restartInfluence } from './restartGeometry';

export interface TacticalStyleParameters {
  width: number;
  compactness: number;
  lineHeight: number;
  supportDistance: number;
  ballShift: number;
  pressing: number;
  forwardRuns: number;
  transitionUrgency: number;
  freedom: number;
}
export const TACTICAL_STYLE_PARAMETERS: Record<TacticalStyle, TacticalStyleParameters> = {
  possession: {
    width: 1.02,
    compactness: 0.83,
    lineHeight: 0.58,
    supportDistance: 0.72,
    ballShift: 0.42,
    pressing: 0.58,
    forwardRuns: 0.48,
    transitionUrgency: 0.55,
    freedom: 0.55,
  },
  balanced: {
    width: 1,
    compactness: 1,
    lineHeight: 0.5,
    supportDistance: 1,
    ballShift: 0.4,
    pressing: 0.5,
    forwardRuns: 0.55,
    transitionUrgency: 0.55,
    freedom: 0.4,
  },
  direct: {
    width: 0.96,
    compactness: 1.18,
    lineHeight: 0.54,
    supportDistance: 1.25,
    ballShift: 0.3,
    pressing: 0.45,
    forwardRuns: 0.82,
    transitionUrgency: 0.8,
    freedom: 0.5,
  },
  counter_attacking: {
    width: 0.9,
    compactness: 0.88,
    lineHeight: 0.32,
    supportDistance: 1.15,
    ballShift: 0.5,
    pressing: 0.38,
    forwardRuns: 0.9,
    transitionUrgency: 0.95,
    freedom: 0.42,
  },
  pressing: {
    width: 0.88,
    compactness: 0.76,
    lineHeight: 0.72,
    supportDistance: 0.8,
    ballShift: 0.72,
    pressing: 0.92,
    forwardRuns: 0.65,
    transitionUrgency: 0.9,
    freedom: 0.48,
  },
};
const direction = (side: TeamSide) => (side === 'home' ? 1 : -1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Match-only resting transform: formation data describes shape, never literal pitch occupation. */
export const deriveNeutralFormationAnchor = (
  player: Pick<MatchPlayerState, 'slot' | 'team' | 'profile'>,
): PitchPoint => {
  const relative = formationSlotToTeamSpace(player.slot);
  if (player.profile.primaryPosition === 'goalkeeper')
    return { x: player.team === 'home' ? 5.5 : 99.5, y: 34 };
  const ownHalfX = 16 + relative.depth * 39;
  return {
    x: player.team === 'home' ? ownHalfX : PITCH_LENGTH - ownHalfX,
    y: 34 + relative.lateral * 26 * direction(player.team),
  };
};

/** Smooth radial influence: approximately 0.9 at 10m, 0.5 at 25m and negligible at 50m. */
export const ballReactionWeight = (metres: number) =>
  Math.exp(-Math.pow(Math.max(0, metres) / 30, 2));

export interface TeamBlockTransform {
  advance: number;
  lateral: number;
  widthScale: number;
  depthScale: number;
  centre: PitchPoint;
}
export const deriveTeamBlockTransform = (
  state: TacticalMatchState,
  side: TeamSide,
): TeamBlockTransform => {
  const owns = state.possessionTeam === side,
    parameters = TACTICAL_STYLE_PARAMETERS[state.teams[side].style];
  const dir = direction(side),
    ballDepth = dir * (state.ball.x - PITCH_LENGTH / 2);
  const transition = state.teams[side].phase.includes('transition')
    ? Math.min(1, state.teams[side].phaseElapsed / 3)
    : 1;
  const sustained = owns ? Math.min(1, state.timeSincePossessionChanged / 8) : 0;
  const stableAdvance = owns
    ? 7 + parameters.lineHeight * 5 + ballDepth * 0.16 + sustained * 7
    : -2 + parameters.lineHeight * 3 + ballDepth * 0.08;
  const advance = stableAdvance * (0.7 + 0.3 * transition);
  const lateral = (state.ball.y - 34) * parameters.ballShift * 0.34;
  const widthScale = parameters.width * (owns ? 1 : 0.82);
  const depthScale =
    (owns ? 0.98 : 0.82) * (state.teams[side].phase.includes('transition') ? 1.08 : 1);
  return {
    advance,
    lateral,
    widthScale,
    depthScale,
    centre: { x: 52.5 + dir * advance, y: 34 + lateral },
  };
};

/** Selects only the best few temporary departures from the formation structure. */
export const deriveAttackingRunIds = (state: TacticalMatchState, side: TeamSide) => {
  if (state.possessionTeam !== side || !state.ball.ownerId) return [];
  const carrier = state.players.find((p) => p.id === state.ball.ownerId)!;
  const urgency = state.teams[side].phase === 'attacking_transition' ? 1.25 : 1;
  return state.players
    .filter(
      (p) =>
        p.team === side &&
        p.id !== carrier.id &&
        p.profile.primaryPosition !== 'goalkeeper' &&
        p.duty !== 'defend',
    )
    .map((p) => ({
      p,
      score:
        (urgency *
          (p.profile.attributes.gameReading +
            p.profile.attributes.positioning +
            p.profile.attributes.pace +
            p.profile.attributes.concentration)) /
          4 -
        distance(p.position, carrier.position) * 0.45 +
        (p.duty === 'attack' ? 12 : 0),
    }))
    .filter(({ score }) => score > 43)
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .slice(0, state.teams[side].phase === 'attacking_transition' ? 3 : 2)
    .map(({ p }) => p.id);
};

const isWideDefender = (p: MatchPlayerState) =>
  ['left_back', 'right_back', 'left_wing_back', 'right_wing_back'].includes(p.slot.position);

export interface PressingAssignment {
  primary?: string;
  cover?: string;
  screen: string[];
}
export const derivePressingAssignment = (
  state: TacticalMatchState,
  side: TeamSide,
): PressingAssignment => {
  const carrier = state.ball.ownerId && state.players.find((p) => p.id === state.ball.ownerId);
  if (!carrier || carrier.team === side) return { screen: [] };
  const candidates = state.players
    .filter((p) => p.team === side && p.profile.primaryPosition !== 'goalkeeper')
    .sort(
      (a, b) => distance(a.position, carrier.position) - distance(b.position, carrier.position),
    );
  return {
    ...(candidates[0] ? { primary: candidates[0].id } : {}),
    ...(candidates[1] ? { cover: candidates[1].id } : {}),
    screen: candidates
      .slice(2, 5)
      .filter((p) => distance(p.position, carrier.position) < 32)
      .map((p) => p.id),
  };
};

/** Furthest legal attacking depth, expressed in canonical pitch coordinates. */
export const calculateOffsideLine = (
  state: Pick<TacticalMatchState, 'players' | 'ball'>,
  attackingSide: TeamSide,
) => {
  const xs = state.players
    .filter((p) => p.team !== attackingSide)
    .map((p) => p.position.x)
    .sort((a, b) => (attackingSide === 'home' ? b - a : a - b));
  const secondLast = xs[1] ?? (attackingSide === 'home' ? PITCH_LENGTH : 0);
  return attackingSide === 'home'
    ? Math.max(state.ball.x, secondLast)
    : Math.min(state.ball.x, secondLast);
};

export const constrainTargetOnside = (
  point: PitchPoint,
  line: number,
  side: TeamSide,
  margin = 0.7,
): PitchPoint => ({
  ...point,
  x: side === 'home' ? Math.min(point.x, line - margin) : Math.max(point.x, line + margin),
});

const seekSpace = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  structural: PitchPoint,
  offside: number,
) => {
  const parameters = TACTICAL_STYLE_PARAMETERS[state.teams[player.team].style];
  const freedom =
    parameters.freedom * (player.duty === 'attack' ? 1 : player.duty === 'support' ? 0.65 : 0.25);
  if (freedom < 0.15) return structural;
  const dir = direction(player.team),
    opponents = state.players.filter((p) => p.team !== player.team);
  const candidates = [
    structural,
    { x: structural.x + dir * 3, y: structural.y - 3 },
    { x: structural.x + dir * 3, y: structural.y + 3 },
    { x: structural.x - dir * 2, y: structural.y },
  ].map((p) => constrainTargetOnside(clampPitchPoint(p), offside, player.team));
  return candidates
    .map((point) => {
      const nearest = Math.min(...opponents.map((p) => distance(point, p.position)));
      const deviation = distance(point, structural),
        progression = dir * (point.x - structural.x);
      return { point, score: nearest * 0.5 + progression * 0.25 - deviation * (1.1 - freedom) };
    })
    .sort((a, b) => b.score - a.score)[0]!.point;
};

export const deriveTacticalTargets = (state: TacticalMatchState): MatchPlayerState[] => {
  const assignments = {
    home: derivePressingAssignment(state, 'home'),
    away: derivePressingAssignment(state, 'away'),
  };
  const offside = {
    home: calculateOffsideLine(state, 'home'),
    away: calculateOffsideLine(state, 'away'),
  };
  const runs = {
    home: deriveAttackingRunIds(state, 'home'),
    away: deriveAttackingRunIds(state, 'away'),
  };
  return state.players.map((player) => {
    const neutralAnchor = deriveNeutralFormationAnchor(player),
      block = deriveTeamBlockTransform(state, player.team);
    const parameters = TACTICAL_STYLE_PARAMETERS[state.teams[player.team].style],
      dir = direction(player.team);
    const isKeeper = player.profile.primaryPosition === 'goalkeeper';
    let structural: PitchPoint;
    if (isKeeper)
      structural = {
        x:
          player.team === 'home'
            ? Math.min(16, 5.5 + Math.max(0, state.ball.x - 35) * 0.07)
            : Math.max(89, 99.5 - Math.max(0, 70 - state.ball.x) * 0.07),
        y: 34 + (state.ball.y - 34) * 0.12,
      };
    else
      structural = {
        x:
          52.5 +
          (neutralAnchor.x - 52.5) * block.depthScale +
          dir *
            block.advance *
            (player.duty === 'defend' ? 0.68 : player.duty === 'attack' ? 1.18 : 1),
        y: 34 + (neutralAnchor.y - 34) * block.widthScale + block.lateral,
      };
    let ideal = structural;
    const carrier = state.ball.ownerId && state.players.find((p) => p.id === state.ball.ownerId);
    if (!isKeeper && carrier) {
      const local = ballReactionWeight(distance(player.position, carrier.position));
      if (carrier.team === player.team && carrier.id !== player.id) {
        ideal = {
          x: ideal.x + dir * 2 * local,
          y: ideal.y + ((carrier.position.y - ideal.y) * 0.22 * local) / parameters.supportDistance,
        };
      } else {
        const assignment = assignments[player.team];
        if (assignment.primary === player.id)
          ideal = {
            x: lerp(ideal.x, carrier.position.x, 0.68 * parameters.pressing * local),
            y: lerp(ideal.y, carrier.position.y, 0.68 * parameters.pressing * local),
          };
        else if (assignment.cover === player.id)
          ideal = {
            x: lerp(ideal.x, carrier.position.x - dir * 5, 0.28 * local),
            y: lerp(ideal.y, carrier.position.y, 0.28 * local),
          };
        else if (assignment.screen.includes(player.id))
          ideal = {
            x: lerp(ideal.x, (carrier.position.x + 52.5) / 2, 0.16 * local),
            y: lerp(ideal.y, carrier.position.y, 0.16 * local),
          };
      }
    }
    if (!isKeeper && state.possessionTeam === player.team)
      ideal = seekSpace(state, player, ideal, offside[player.team]);
    if (!isKeeper && runs[player.team].includes(player.id)) {
      const overlap = isWideDefender(player) && Math.abs(state.ball.y - player.position.y) < 18;
      ideal = {
        x: ideal.x + dir * (overlap ? 13 : 9 + parameters.forwardRuns * 7),
        y: overlap
          ? player.slot.position.startsWith('left')
            ? player.team === 'home'
              ? 5
              : 63
            : player.team === 'home'
              ? 63
              : 5
          : ideal.y,
      };
    }
    ideal = clampPitchPoint(
      isKeeper ? ideal : constrainTargetOnside(ideal, offside[player.team], player.team),
    );
    const restartWeight = restartInfluence(state),
      restartTarget = state.restart?.targets[player.id];
    if (restartTarget && restartWeight > 0)
      ideal = clampPitchPoint({
        x: lerp(ideal.x, restartTarget.x, restartWeight),
        y: lerp(ideal.y, restartTarget.y, restartWeight),
      });
    const period = Math.floor(state.time / 4),
      blend = (state.time % 4) / 4;
    const errorAt = (n: number) => {
      const rng = RandomGenerator.fromSeed(`${state.seed}:position:${player.id}:${n}`);
      return { x: rng.float() - 0.5, y: rng.float() - 0.5 };
    };
    const e0 = errorAt(period),
      e1 = errorAt(period + 1),
      smooth = blend * blend * (3 - 2 * blend);
    const errorSize =
      (1 - restartWeight) *
      (1 - player.profile.attributes.positioning / 100) *
      (2.5 + parameters.freedom * 2);
    const noisy = clampPitchPoint({
      x: ideal.x + lerp(e0.x, e1.x, smooth) * errorSize,
      y: ideal.y + lerp(e0.y, e1.y, smooth) * errorSize,
    });
    const reading =
      (player.profile.attributes.gameReading + player.profile.attributes.concentration) / 200;
    const reaction = 1 - Math.exp(-(state.time === 0 ? 1 : 0.05 + reading * 0.18));
    const perceived = {
      x: lerp(player.target.x, noisy.x, reaction),
      y: lerp(player.target.y, noisy.y, reaction),
    };
    return { ...player, neutralAnchor, idealTarget: ideal, target: clampPitchPoint(perceived) };
  });
};
