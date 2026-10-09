import { deriveRestartGeometry } from './restartGeometry';
import type { RestartScenario, TacticalMatchState } from './matchState';
import { recordPossessionLoss, restartAwardId, type RestartAward } from './possessionEvents';
import { legalRestartPosition } from './restartLaws';
import { beginStoppage, restartStoppageReason } from './stoppageLedger';

export interface RestartScenarioOptions {
  restartTeam: 'home' | 'away';
  restartPoint?: { x: number; y: number };
  incidentPoint?: { x: number; y: number };
  incidentId?: string;
  eventAt?: number;
  indirect?: boolean;
  cause?: RestartAward['cause'];
  loserId?: string;
}

/** Ephemeral deterministic DEV setup. It is geometry/lifecycle input, not a laws engine. */
export const applyRestartScenario = (
  input: TacticalMatchState,
  scenario: RestartScenario,
  options: RestartScenarioOptions = {
    restartTeam: 'home',
  },
): TacticalMatchState => buildRestart(input, scenario, options, false);

/** Real awards never borrow the DEV placement path or manufacture ball ownership. */
export const awardNaturalRestart = (
  input: TacticalMatchState,
  scenario: RestartScenario,
  options: RestartScenarioOptions,
): TacticalMatchState => buildRestart(input, scenario, options, true);

const buildRestart = (
  input: TacticalMatchState,
  scenario: RestartScenario,
  options: RestartScenarioOptions,
  natural: boolean,
): TacticalMatchState => {
  if (input.status === 'abandoned' || input.status === 'full_time') return input;
  if (scenario === 'open_play') {
    const { restart: _restart, ...openPlay } = input;
    void _restart;
    return { ...openPlay, scenario };
  }
  const restartTeam = options.restartTeam;
  const awardId = restartAwardId(input, restartTeam, scenario);
  const incidentId = options.incidentId ?? `${input.seed}:incident:${input.time}:${scenario}`;
  if (
    natural &&
    input.lastRestartAward?.origin === 'live_event' &&
    input.lastRestartAward.incidentId === incidentId
  )
    return input;
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
  const incidentPoint = { ...(options.incidentPoint ?? options.restartPoint ?? input.ball) };
  const spot = natural
    ? legalRestartPosition(
        scenario,
        restartTeam,
        options.restartPoint ?? incidentPoint,
        options.indirect,
      )
    : options.restartPoint;
  const geometry = deriveRestartGeometry(input, scenario, restartTeam, spot);
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
    ball: natural
      ? {
          x: input.ball.x,
          y: input.ball.y,
          height: input.ball.height ?? 0,
          ...(input.ball.lastTouchPlayerId
            ? { lastTouchPlayerId: input.ball.lastTouchPlayerId }
            : {}),
          ...(input.ball.velocity ? { velocity: { ...input.ball.velocity } } : {}),
          ...(input.ball.spin ? { spin: { ...input.ball.spin } } : {}),
          airborne: input.ball.airborne ?? false,
          bounceCount: input.ball.bounceCount ?? 0,
        }
      : { ...geometry.ball, ownerId: geometry.taker.id },
    restart: {
      phase: natural ? 'preparing' : 'setup',
      origin: natural ? 'live_event' : 'dev_fixture',
      awardId,
      spot: { ...(spot ?? geometry.ball) },
      ...(options.indirect ? { indirect: true } : {}),
      ceremonial: scenario === 'penalty' || scenario === 'kick_off',
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
      origin: natural ? 'live_event' : 'dev_fixture',
      incidentId,
      eventAt: options.eventAt ?? input.time,
      incidentPosition: incidentPoint,
      legalRestartPosition: { ...(spot ?? geometry.ball) },
      indirect: options.indirect ?? false,
      ...(natural && options.cause === 'foul' && input.lastFoul?.id === incidentId
        ? {
            fouledPlayerId: input.lastFoul.opponentId,
            offendingPlayerId: input.lastFoul.actorId,
            ...(input.lastAdvantage?.outcome === 'recalled'
              ? { recalledAdvantageId: input.lastAdvantage.id }
              : {}),
          }
        : {}),
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
  // A real whistle is also the result of the already selected action. Let the ordinary
  // outcome observer resolve that identity from foul/offside/boundary evidence next tick.
  if (!natural) delete state.pendingPlayerDecision;
  delete state.shotAgencyRequest;
  delete state.receptionPreparation;
  delete state.ballAcquisition;
  delete state.defensiveChallenge;
  delete state.keeperIntervention;
  delete state.offsideSnapshot;
  delete state.restartTouchRestriction;
  delete state.postGoal;
  state.players = state.players.map((player) => {
    const { restartWallResponse: _response, ...normal } = player;
    void _response;
    return normal;
  });
  if (natural) {
    state.players = state.players.map((player) => ({
      ...player,
      target: geometry.targets[player.id] ?? player.position,
      idealTarget: geometry.targets[player.id] ?? player.position,
    }));
    if (input.latestAction) state.latestAction = input.latestAction;
    if (input.latestActionSource) state.latestActionSource = input.latestActionSource;
    return beginStoppage(
      state,
      incidentId,
      options.cause === 'offside'
        ? 'offside'
        : options.cause === 'goal'
          ? 'goal'
          : restartStoppageReason(scenario),
      options.eventAt ?? input.time,
      awardId,
    );
  }
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
