import type { MatchAction, TacticalMatchState } from './matchState';
import { incomingBallContact } from './shootingOptions';
import { enumerateAvailableActions } from './matchActions';
import { distance } from './matchSpace';
import type { PitchPoint } from './matchSpace';
import { deriveSpacePassPlan } from './spacePassing';

type PassAction = Extract<MatchAction, { type: 'pass' }>;

export const deriveFirstTimeSpacePass = (
  state: TacticalMatchState,
  actorId: string,
  target: PitchPoint,
): PassAction | undefined => {
  const contact = incomingBallContact(state, actorId, 'pass'),
    actor = state.players.find((p) => p.id === actorId);
  if (!actor || !contact || contact.height > 0.65) return;
  const forecast = { ...state, ball: { ...contact.point, ownerId: actorId } };
  const plan = deriveSpacePassPlan(forecast, { ...actor, position: contact.point }, target);
  return plan
    ? {
        type: 'pass',
        actorId,
        receiverId: plan.receiverId,
        target: plan.requestedSpace,
        requestedSpace: plan.requestedSpace,
        intent: plan.intent,
        delivery: plan.delivery,
        firstTime: true,
      }
    : undefined;
};

/** Forecast feasibility only; execution still occurs at actual ball contact. */
export const canExecuteFirstTimePass = (state: TacticalMatchState, action: PassAction) => {
  if (!action.firstTime) return false;
  const contact = incomingBallContact(state, action.actorId, 'pass');
  return Boolean(contact && contact.height <= 0.65);
};

/** Reuse ordinary feet/run/space targets and lofted launch plans at the forecast contact point. */
export const enumerateFirstTimePasses = (
  state: TacticalMatchState,
  actorId: string,
): PassAction[] => {
  const contact = incomingBallContact(state, actorId, 'pass');
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor || !contact || contact.height > 0.65) return [];
  const forecast: TacticalMatchState = {
    ...state,
    scenario: 'open_play',
    players: state.players.map((p) => (p.id === actorId ? { ...p, position: contact.point } : p)),
    ball: { ...contact.point, ownerId: actorId },
  };
  delete forecast.restart;
  return enumerateAvailableActions(forecast, actorId)
    .filter((a): a is PassAction => a.type === 'pass' && distance(contact.point, a.target) >= 4)
    .map((action) => ({ ...action, firstTime: true }));
};
