import type { TacticalMatchState } from './matchState';

/** Canonical, RNG-free answer to whether physical action resolution currently owns the clock. */
export const isActionResolutionInProgress = (state: TacticalMatchState): boolean =>
  Boolean(
    state.ball.travelDuration ||
      state.ballCarrierIntent ||
      state.goalCompletionUntil !== undefined ||
      state.restart?.phase === 'setup',
  );
