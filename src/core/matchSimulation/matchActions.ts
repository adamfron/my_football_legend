import { RandomGenerator } from '../random/RandomGenerator';
import { clampPitchPoint, distance, distanceToSegment, fieldValue } from './matchSpace';
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
  const carryTargets = [
    { x: actor.position.x + dir * 6, y: actor.position.y },
    { x: actor.position.x + dir * 10, y: actor.position.y + (34 - actor.position.y) * 0.35 },
    { x: actor.position.x + dir * 5, y: actor.position.y + (actor.position.y < 34 ? -5 : 5) },
    { x: actor.position.x - dir * 3, y: actor.position.y + (34 - actor.position.y) * 0.25 },
  ].map(clampPitchPoint);
  const actions: MatchAction[] = [
    { type: 'hold', actorId },
    ...carryTargets.map((target) => ({ type: 'carry' as const, actorId, target })),
  ];
  state.players
    .filter(
      (p) =>
        p.team === actor.team &&
        p.id !== actorId &&
        p.profile.primaryPosition !== 'goalkeeper' &&
        distance(p.position, actor.position) < 68,
    )
    .forEach((p) => {
      const progress = dir * (p.position.x - actor.position.x),
        length = distance(p.position, actor.position);
      actions.push({
        type: 'pass',
        actorId,
        receiverId: p.id,
        target: { ...p.position },
        intent: length > 42 ? 'direct' : progress > 8 ? 'progressive' : 'support',
      });
      if (progress > 3 && p.duty !== 'defend') {
        const lead = Math.min(12, 4 + p.profile.attributes.pace / 15);
        actions.push({
          type: 'pass',
          actorId,
          receiverId: p.id,
          target: clampPitchPoint({ x: p.position.x + dir * lead, y: p.position.y }),
          intent: 'through',
        });
      }
    });
  return actions;
};
export const scoreActionForAI = (
  state: TacticalMatchState,
  actorId: string,
  action: MatchAction,
) => {
  const actor = state.players.find((p) => p.id === actorId)!;
  const style = state.teams[actor.team].style;
  const underPressure = pressure(state, actor);
  if (action.type === 'hold') return 25 + (style === 'possession' ? 15 : 0) - underPressure * 18;
  if (action.type === 'carry')
    return (
      18 +
      (fieldValue(action.target, actor.team) - fieldValue(actor.position, actor.team)) * 1.3 +
      (actor.profile.attributes.dribbling +
        actor.profile.attributes.agility +
        actor.profile.attributes.pace +
        actor.profile.attributes.composure) /
        16 -
      Math.max(
        underPressure,
        Math.max(
          0,
          1 -
            Math.min(...opponents(state, actor).map((p) => distance(p.position, action.target))) /
              9,
        ),
      ) *
        30
    );
  const receiver = state.players.find((p) => p.id === action.receiverId)!;
  const length = distance(actor.position, action.target);
  const progression =
    fieldValue(action.target, actor.team) - fieldValue(actor.position, actor.team);
  const receiverPressure = pressure(state, receiver);
  const laneRisk = opponents(state, actor).filter(
    (p) => distanceToSegment(p.position, actor.position, action.target) < 3.5,
  ).length;
  const technical =
    (actor.profile.attributes.passing +
      actor.profile.attributes.technique +
      actor.profile.attributes.gameReading +
      actor.profile.attributes.composure) /
    20;
  const styleIntent =
    action.intent === 'direct' || action.intent === 'through'
      ? style === 'direct'
        ? 15
        : style === 'counter_attacking'
          ? 18
          : style === 'possession'
            ? -5
            : 4
      : style === 'possession'
        ? 5
        : 0;
  return (
    28 +
    progression * (state.teams[actor.team].phase === 'attacking_transition' ? 1.5 : 1.05) -
    length * 0.3 -
    receiverPressure * 17 -
    laneRisk * 10 +
    technical +
    styleIntent
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
  const duration = Math.max(0.45, distance(actor.position, action.target) / 24);
  return {
    ...state,
    ball: {
      x: state.ball.x,
      y: state.ball.y,
      from: { ...actor.position },
      target: { ...action.target },
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
