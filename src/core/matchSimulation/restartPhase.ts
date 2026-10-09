import type { RestartLifecycle, TacticalMatchState } from './matchState';

/** Legacy setup is a frozen DEV fixture; live preparation advances real bodies. */
export const isRestartSetup = <T extends Pick<TacticalMatchState, 'restart'>>(
  state: T,
): state is T & { restart: RestartLifecycle } =>
  Boolean(state.restart && state.restart.phase !== 'release');

export const isLiveRestartSetup = (state: Pick<TacticalMatchState, 'restart'>) =>
  isRestartSetup(state) && state.restart?.origin === 'live_event';

export const isRestartDecisionBoundary = (state: Pick<TacticalMatchState, 'restart'>) =>
  state.restart?.phase === 'setup' || state.restart?.phase === 'awaiting_decision';
