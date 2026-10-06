import type { MatchAction, TacticalMatchState } from './matchState';

export const isShotAction = (
  action: MatchAction,
): action is Extract<MatchAction, { type: 'shot' | 'header' }> =>
  action.type === 'shot' || (action.type === 'header' && action.intent === 'header_shot');

/** Explicit observer/autonomous control disables agency; visibility never does. */
export const isHumanControlled = (state: TacticalMatchState, actorId: string) =>
  state.playerAgencyEnabled !== false && state.controlledFootballerId === actorId;
