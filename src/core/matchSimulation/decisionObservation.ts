import type { TacticalMatchState } from './matchState';
import type { RankedAiAction } from './matchActions';

export type RankingObserver = (
  state: TacticalMatchState,
  actorId: string,
  ranked: readonly RankedAiAction[],
) => void;
let activeObserver: RankingObserver | undefined;
/** Synchronous observation scope, just like the existing performance profiler. No state/RNG
 * ownership; inactive observation is a single branch. Nested calls restore the outer scope. */
export const withRankingObserver = <T>(observer: RankingObserver | undefined, run: () => T): T => {
  const previous = activeObserver;
  activeObserver = observer;
  try {
    return run();
  } finally {
    activeObserver = previous;
  }
};
export const observeDecisionRanking = (
  state: TacticalMatchState,
  actorId: string,
  ranked: readonly RankedAiAction[],
) => activeObserver?.(state, actorId, ranked);
