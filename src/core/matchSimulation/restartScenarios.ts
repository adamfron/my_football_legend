import { deriveRestartGeometry } from './restartGeometry';
import type { RestartScenario, TacticalMatchState } from './matchState';

/** Ephemeral deterministic DEV setup. It is geometry/lifecycle input, not a laws engine. */
export const applyRestartScenario = (
  input: TacticalMatchState,
  scenario: RestartScenario,
): TacticalMatchState => {
  if (scenario === 'open_play') {
    const { restart: _restart, ...openPlay } = input;
    void _restart;
    return { ...openPlay, scenario };
  }
  const geometry = deriveRestartGeometry(input, scenario);
  const setPiece =
    scenario === 'corner' || scenario.startsWith('free_kick') || scenario === 'penalty';
  const {
    currentAction: _currentAction,
    latestAction: _latestAction,
    currentActorId: _currentActorId,
    restart: _restart,
    ...cleanInput
  } = input;
  void _currentAction;
  void _latestAction;
  void _currentActorId;
  void _restart;
  const state: TacticalMatchState = {
    ...cleanInput,
    scenario,
    time: 0,
    decisionIndex: 0,
    possessionTeam: 'home',
    timeSincePossessionChanged: 0,
    actionCooldown: 0,
    teams: {
      home: {
        ...input.teams.home,
        phase: setPiece ? 'set_piece_attack' : 'attacking_transition',
        phaseElapsed: 0,
      },
      away: {
        ...input.teams.away,
        phase: setPiece ? 'set_piece_defence' : 'defensive_block',
        phaseElapsed: 0,
      },
    },
    ball: { ...geometry.ball, ownerId: geometry.taker.id },
    restart: {
      phase: 'setup',
      startedAt: 0,
      takerId: geometry.taker.id,
      targets: geometry.targets,
      ...(geometry.landingZone ? { landingZone: geometry.landingZone } : {}),
    },
  };
  state.players = state.players.map((player) => {
    const position = geometry.targets[player.id] ?? player.position;
    return {
      ...player,
      position,
      target: position,
      idealTarget: position,
      velocity: { x: 0, y: 0 },
    };
  });
  return state;
};
