import type { MatchAction, TacticalMatchState } from './matchState';

export const isShotAction = (
  action: MatchAction,
): action is Extract<MatchAction, { type: 'shot' | 'header' }> =>
  action.type === 'shot' || (action.type === 'header' && action.intent === 'header_shot');

/** Explicit observer/autonomous control disables agency; visibility never does. */
export const isHumanControlled = (state: TacticalMatchState, actorId: string) =>
  state.playerAgencyEnabled !== false && state.controlledFootballerId === actorId;

/** Restart decision ownership is independent of policy, option count and setup age. */
export const requiresHumanRestart = (state: TacticalMatchState, actorId: string) =>
  isHumanControlled(state, actorId) &&
  state.restart?.phase === 'setup' &&
  state.restart.takerId === actorId &&
  state.scenario !== 'throw_in';
