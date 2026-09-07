import { RandomGenerator } from '../random/RandomGenerator';
import { clampPitchPoint, distance } from './matchSpace';
import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';

const opponents = (state: TacticalMatchState, actor: MatchPlayerState) =>
  state.players.filter((p) => p.team !== actor.team);
const pressure = (state: TacticalMatchState, actor: MatchPlayerState) =>
  Math.max(
    0,
    1 - Math.min(...opponents(state, actor).map((p) => distance(p.position, actor.position))) / 12,
  );
export const enumerateAvailableActions = (
  state: TacticalMatchState,
  actorId: string,
): MatchAction[] => {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor || state.ball.ownerId !== actorId) return [];
  const dir = actor.team === 'home' ? 1 : -1;
  const actions: MatchAction[] = [
    { type: 'hold', actorId },
    {
      type: 'carry',
      actorId,
      target: clampPitchPoint({
        x: actor.position.x + dir * 7,
        y: actor.position.y + (actor.target.y - actor.position.y) * 0.35,
      }),
    },
  ];
  state.players
    .filter(
      (p) =>
        p.team === actor.team &&
        p.id !== actorId &&
        p.profile.primaryPosition !== 'goalkeeper' &&
        distance(p.position, actor.position) < 42,
    )
    .forEach((p) => actions.push({ type: 'pass', actorId, receiverId: p.id }));
  return actions;
};
export const scoreActionForAI = (
  state: TacticalMatchState,
  actorId: string,
  action: MatchAction,
) => {
  const actor = state.players.find((p) => p.id === actorId)!;
  const style = state.teams[actor.team].style;
  const dir = actor.team === 'home' ? 1 : -1;
  const underPressure = pressure(state, actor);
  if (action.type === 'hold') return 25 + (style === 'possession' ? 15 : 0) - underPressure * 18;
  if (action.type === 'carry')
    return (
      30 +
      (actor.profile.attributes.dribbling + actor.profile.attributes.agility) / 7 -
      underPressure * 26
    );
  const receiver = state.players.find((p) => p.id === action.receiverId)!;
  const length = distance(actor.position, receiver.position);
  const progression = dir * (receiver.position.x - actor.position.x);
  const receiverPressure = pressure(state, receiver);
  return (
    34 +
    progression * (style === 'direct' ? 1.3 : 0.75) -
    length * 0.32 -
    receiverPressure * 20 +
    (actor.profile.attributes.passing + actor.profile.attributes.gameReading) / 10
  );
};
export const chooseNpcAction = (
  state: TacticalMatchState,
  actorId: string,
): MatchAction | undefined => {
  const rng = RandomGenerator.fromSeed(`${state.seed}:decision:${state.decisionIndex}:${actorId}`);
  return enumerateAvailableActions(state, actorId)
    .map((action) => ({
      action,
      score: scoreActionForAI(state, actorId, action) + (rng.float() - 0.5) * 8,
    }))
    .sort((a, b) => b.score - a.score)[0]?.action;
};

export const resolveMatchAction = (
  state: TacticalMatchState,
  action: MatchAction,
): TacticalMatchState => {
  if (state.ball.ownerId !== action.actorId) return state;
  const actor = state.players.find((p) => p.id === action.actorId)!;
  if (action.type === 'hold')
    return {
      ...state,
      currentAction: action,
      latestAction: action,
      currentActorId: actor.id,
      actionCooldown: 1.1,
      decisionIndex: state.decisionIndex + 1,
    };
  if (action.type === 'carry')
    return {
      ...state,
      players: state.players.map((p) => (p.id === actor.id ? { ...p, target: action.target } : p)),
      currentAction: action,
      latestAction: action,
      currentActorId: actor.id,
      actionCooldown: 1.3,
      decisionIndex: state.decisionIndex + 1,
    };
  const receiver = state.players.find((p) => p.id === action.receiverId)!;
  const duration = Math.max(0.45, distance(actor.position, receiver.position) / 24);
  return {
    ...state,
    ball: {
      x: state.ball.x,
      y: state.ball.y,
      from: { ...actor.position },
      target: { ...receiver.position },
      intendedReceiverId: receiver.id,
      travelElapsed: 0,
      travelDuration: duration,
    },
    currentAction: action,
    latestAction: action,
    currentActorId: actor.id,
    actionCooldown: duration + 0.35,
    decisionIndex: state.decisionIndex + 1,
  };
};
