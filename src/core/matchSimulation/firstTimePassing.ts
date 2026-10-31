import type { MatchAction, TacticalMatchState } from './matchState';
import { incomingBallContact } from './shootingOptions';
import { enumerateAvailableActions } from './matchActions';
import { distance } from './matchSpace';
import type { PitchPoint } from './matchSpace';
import { deriveSpacePassPlan } from './spacePassing';
import { assessFirstTouch } from './firstTouch';

type PassAction = Extract<MatchAction, { type: 'pass' }>;

export const deriveFirstTimeSpacePass = (
  state: TacticalMatchState,
  actorId: string,
  target: PitchPoint,
): PassAction | undefined => {
  const contact = incomingBallContact(state, actorId, 'pass'),
    actor = state.players.find((p) => p.id === actorId);
  if (!actor || !contact || contact.height > 0.65) return;
  const forecast = {
    ...state,
    ball: {
      ...state.ball,
      ...contact.point,
      height: contact.height,
      velocity: contact.velocity,
      ownerId: actorId,
    },
  };
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
export const canExecuteFirstTimePass = (
  state: TacticalMatchState,
  action: PassAction,
  actual = false,
) => {
  if (!action.firstTime) return false;
  const contact = incomingBallContact(state, action.actorId, 'pass');
  const actor = state.players.find((p) => p.id === action.actorId);
  if (!actor || !contact || contact.height > 0.65 || (actual && contact.arrivalTime !== 0))
    return false;
  const projected = contact.arrivalTime > 0 ? { ...actor, position: contact.point } : actor;
  return assessFirstTouch(
    {
      ...state,
      ball: { ...state.ball, ...contact.point, height: contact.height, velocity: contact.velocity },
    },
    projected,
    contact.point,
    action.target,
    'pass',
    contact.arrivalTime,
  ).feasible;
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
    ball: {
      ...state.ball,
      ...contact.point,
      height: contact.height,
      velocity: contact.velocity,
      ownerId: actorId,
    },
  };
  delete forecast.restart;
  const contactActor = contact.arrivalTime > 0 ? { ...actor, position: contact.point } : actor;
  return enumerateAvailableActions(forecast, actorId, 'incoming_preparation')
    .filter((a): a is PassAction => a.type === 'pass' && distance(contact.point, a.target) >= 4)
    .map((action) => ({ ...action, firstTime: true }))
    .filter(
      (action) =>
        assessFirstTouch(
          forecast,
          contactActor,
          contact.point,
          action.target,
          'pass',
          contact.arrivalTime,
        ).feasible,
    );
};
