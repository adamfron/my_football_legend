import type { MatchPlayerState, RestartLifecycle, TacticalMatchState } from './matchState';
import { canParticipatePhysically } from './matchInjuries';

/** G's loss state takes away the grounded motor used by dead-ball handling. */
export const canHandleRestartBall = (state: TacticalMatchState, player: MatchPlayerState) =>
  !state.discipline?.[player.id]?.sentOff &&
  (!state.experimentalDynamicBalance ||
    (player.articulatedStance?.dynamicBalance?.phase !== 'lost' &&
      canParticipatePhysically(player)));

/** Legacy setup is a frozen DEV fixture; live preparation advances real bodies. */
export const isRestartSetup = <T extends Pick<TacticalMatchState, 'restart'>>(
  state: T,
): state is T & { restart: RestartLifecycle } =>
  Boolean(state.restart && state.restart.phase !== 'release');

export const isLiveRestartSetup = (state: Pick<TacticalMatchState, 'restart'>) =>
  isRestartSetup(state) && state.restart?.origin === 'live_event';

export const isRestartDecisionBoundary = (state: Pick<TacticalMatchState, 'restart'>) =>
  state.restart?.phase === 'setup' || state.restart?.phase === 'awaiting_decision';
