import { RandomGenerator } from '../random/RandomGenerator';
import { clampPitchPoint, distance, type TeamSide } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState, TacticalStyle } from './matchState';

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

export const deriveTacticalTargets = (state: TacticalMatchState): MatchPlayerState[] => {
  const carrier = state.ball.ownerId && state.players.find((p) => p.id === state.ball.ownerId);
  return state.players.map((player) => {
    const team = state.teams[player.team],
      parameters = TACTICAL_STYLE_PARAMETERS[team.style];
    const owns = state.possessionTeam === player.team,
      dir = direction(player.team);
    const anchorDepth = dir * (player.anchor.x - 52.5);
    let x =
      52.5 +
      dir *
        (anchorDepth * (owns ? parameters.compactness : 0.78) +
          (owns ? 8 : -5 + parameters.lineHeight * 5));
    let y = 34 + (player.anchor.y - 34) * parameters.width * (owns ? 1 : 0.75);
    y += (state.ball.y - 34) * parameters.ballShift;
    x += dir * (state.ball.x - 52.5) * 0.13;
    if (owns && player.duty === 'attack') x += dir * 5 * parameters.forwardRuns;
    if (
      carrier &&
      owns &&
      player.id !== carrier.id &&
      distance(player.position, carrier.position) < 20
    ) {
      x += dir * 2;
      y += ((player.anchor.y < carrier.position.y ? -1 : 1) * 2.5) / parameters.supportDistance;
    }
    if (!owns && carrier && player.profile.primaryPosition !== 'goalkeeper') {
      const defenders = state.players
        .filter((p) => p.team === player.team && p.profile.primaryPosition !== 'goalkeeper')
        .sort(
          (a, b) => distance(a.position, carrier.position) - distance(b.position, carrier.position),
        );
      if (defenders[0]?.id === player.id) {
        x += (carrier.position.x - x) * 0.62 * parameters.pressing;
        y += (carrier.position.y - y) * 0.62 * parameters.pressing;
      } else if (defenders[1]?.id === player.id) {
        x += (carrier.position.x - x) * 0.2;
        y += (carrier.position.y - y) * 0.2;
      }
    }
    if (player.profile.primaryPosition === 'goalkeeper') {
      x =
        player.team === 'home'
          ? Math.min(18, 5 + Math.max(0, state.ball.x - 45) * 0.08)
          : Math.max(87, 100 - Math.max(0, 60 - state.ball.x) * 0.08);
      y = 34 + (state.ball.y - 34) * 0.12;
    }
    const period = Math.floor(state.time / 3);
    const noise = RandomGenerator.fromSeed(`${state.seed}:position:${player.id}:${period}`);
    const quality =
      (player.profile.attributes.positioning +
        player.profile.attributes.gameReading +
        player.profile.attributes.concentration) /
      300;
    const error = (1 - quality) * (1 + parameters.freedom);
    return {
      ...player,
      target: clampPitchPoint({
        x: x + (noise.float() - 0.5) * error * 4,
        y: y + (noise.float() - 0.5) * error * 4,
      }),
    };
  });
};
