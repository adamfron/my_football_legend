import { deriveRestartGeometry } from './restartGeometry';
import type { RestartScenario, TacticalMatchState } from './matchState';
import { recordPossessionLoss, restartAwardId, type RestartAward } from './possessionEvents';

/** Ephemeral deterministic DEV setup. It is geometry/lifecycle input, not a laws engine. */
export const applyRestartScenario = (
  input: TacticalMatchState,
  scenario: RestartScenario,
  options: {
    restartTeam: 'home' | 'away';
    restartPoint?: { x: number; y: number };
    cause?: RestartAward['cause'];
    loserId?: string;
  } = {
    restartTeam: 'home',
  },
): TacticalMatchState => {
  if (input.status === 'abandoned' || input.status === 'full_time') return input;
  if (scenario === 'open_play') {
    const { restart: _restart, ...openPlay } = input;
    void _restart;
    return { ...openPlay, scenario };
  }
  const restartTeam = options.restartTeam;
  const awardId = restartAwardId(input, restartTeam, scenario);
  const cause =
    options.cause ?? (input.lastPossessionLoss?.restartId === awardId ? 'boundary' : 'bookkeeping');
  if (cause === 'foul' || cause === 'offside' || cause === 'shot' || cause === 'goal')
    input = recordPossessionLoss(input, {
      key: `restart:${awardId}`,
      to: restartTeam,
      cause: cause === 'shot' || cause === 'goal' ? 'shot' : 'foul_stoppage',
      loserId: options.loserId,
      restartId: awardId,
    });
  const geometry = deriveRestartGeometry(input, scenario, restartTeam, options.restartPoint);
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
    lastRestartAward: {
      id: awardId,
      at: input.time,
      team: restartTeam,
      scenario,
      takerId: geometry.taker.id,
      cause,
      ...(input.lastPossessionLoss?.restartId === awardId
        ? { lossId: input.lastPossessionLoss.id }
        : {}),
    },
  };
  delete state.throwInRestriction;
  delete state.ballCarrierIntent;
  delete state.playerMovementIntent;
  delete state.pendingReceptionIntent;
  delete state.onBallPreparation;
  delete state.controlledBallContact;
  delete state.humanPossessionEpisode;
  delete state.postActionAgencyCheckpoint;
  delete state.pendingPossessionLoss;
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
