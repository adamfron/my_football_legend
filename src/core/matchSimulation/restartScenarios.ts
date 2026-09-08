import { deriveRestartGeometry } from './restartGeometry';
import type { RestartScenario, TacticalMatchState } from './matchState';

/** Ephemeral deterministic DEV setup. It is geometry/lifecycle input, not a laws engine. */
export const applyRestartScenario = (
  input: TacticalMatchState,
  scenario: RestartScenario,
  options: { restartTeam: 'home' | 'away' } = { restartTeam: 'home' },
): TacticalMatchState => {
  if (scenario === 'open_play') {
    const { restart: _restart, ...openPlay } = input;
    void _restart;
    return { ...openPlay, scenario };
  }
  const restartTeam = options.restartTeam;
  const geometry = deriveRestartGeometry(input, scenario, restartTeam);
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
    decisionIndex: input.decisionIndex,
    possessionTeam: restartTeam,
    timeSincePossessionChanged: 0,
    actionCooldown: 0,
    teams: {
      home: {
        ...input.teams.home,
        phase:
          restartTeam === 'home'
            ? setPiece
              ? 'set_piece_attack'
              : 'attacking_transition'
            : setPiece
              ? 'set_piece_defence'
              : 'defensive_block',
        phaseElapsed: 0,
      },
      away: {
        ...input.teams.away,
        phase:
          restartTeam === 'away'
            ? setPiece
              ? 'set_piece_attack'
              : 'attacking_transition'
            : setPiece
              ? 'set_piece_defence'
              : 'defensive_block',
        phaseElapsed: 0,
      },
    },
    ball: { ...geometry.ball, ownerId: geometry.taker.id },
    restart: {
      phase: 'setup',
      restartTeam,
      startedAt: input.time,
      takerId: geometry.taker.id,
      targets: geometry.targets,
      roles: geometry.roles,
      executionChoices: geometry.executionChoices,
      ...(geometry.cornerPlan ? { cornerPlan: geometry.cornerPlan } : {}),
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
