import { RandomGenerator } from '../random/RandomGenerator';
import { clampPitchPoint, distance, distanceToSegment, fieldValue } from './matchSpace';
import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import { resolveCanonicalShot } from './shotResolver';

const opponents = (state: TacticalMatchState, actor: MatchPlayerState) =>
  state.players.filter((p) => p.team !== actor.team);
export const evaluatePressure = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const nearby = opponents(state, actor)
    .map((defender) => ({ defender, metres: distance(defender.position, actor.position) }))
    .filter(({ metres }) => metres < 14)
    .sort((a, b) => a.metres - b.metres);
  if (!nearby.length) return { value: 0, nearestChallengerId: undefined };
  const first = nearby[0]!;
  const closing = Math.max(
    0,
    -(
      (first.defender.velocity.x * (first.defender.position.x - actor.position.x) +
        first.defender.velocity.y * (first.defender.position.y - actor.position.y)) /
      Math.max(0.2, first.metres)
    ),
  );
  const defensive =
    (first.defender.profile.attributes.tackling +
      first.defender.profile.attributes.positioning +
      first.defender.profile.attributes.aggression +
      first.defender.profile.attributes.gameReading) /
    400;
  const control =
    (actor.profile.attributes.dribbling +
      actor.profile.attributes.technique +
      actor.profile.attributes.composure +
      actor.profile.attributes.agility) /
    400;
  return {
    value: Math.max(
      0,
      Math.min(
        1,
        (1 - first.metres / 14) * 0.62 +
          Math.min(0.15, closing / 35) +
          Math.min(0.15, (nearby.length - 1) * 0.06) +
          (defensive - control) * 0.18,
      ),
    ),
    nearestChallengerId: first.defender.id,
  };
};
const pressure = (state: TacticalMatchState, actor: MatchPlayerState) =>
  evaluatePressure(state, actor).value;

export const shotUtility = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const goal = { x: actor.team === 'home' ? 105 : 0, y: 34 };
  const metres = distance(actor.position, goal);
  const angle = Math.max(0, 1 - Math.abs(actor.position.y - 34) / 35);
  const blockers = opponents(state, actor).filter(
    (p) =>
      p.profile.primaryPosition !== 'goalkeeper' &&
      distanceToSegment(p.position, actor.position, goal) < 2.2 &&
      distance(p.position, actor.position) < metres,
  ).length;
  const skill =
    (actor.profile.attributes.finishing +
      actor.profile.attributes.technique +
      actor.profile.attributes.composure) /
    3;
  return (
    112 - metres * 2.25 + angle * 25 + skill * 0.3 - pressure(state, actor) * 42 - blockers * 13
  );
};
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
  const advanced = fieldValue(actor.position, actor.team) > 66;
  const wide = actor.position.y < 18 || actor.position.y > 50;
  if (advanced && wide) {
    const boxX = actor.team === 'home' ? 94 : 11;
    const targets = state.players.filter(
      (p) => p.team === actor.team && p.id !== actor.id && Math.abs(p.position.x - boxX) < 18,
    );
    for (const y of [27, 34, 41])
      actions.push({
        type: 'cross',
        actorId,
        target: { x: boxX, y },
        ...(targets[0] ? { intendedTargetId: targets[0].id } : {}),
        intent:
          Math.abs(actor.position.x - (actor.team === 'home' ? 105 : 0)) < 10
            ? 'cutback'
            : 'floated',
      });
  }
  const goalDistance = distance(actor.position, {
    x: actor.team === 'home' ? 105 : 0,
    y: 34,
  });
  if (goalDistance < 38) {
    const immediateDefenders = opponents(state, actor).filter(
      (player) =>
        player.profile.primaryPosition !== 'goalkeeper' &&
        distance(player.position, actor.position) < 6,
    );
    const oneOnOne = goalDistance < 20 && immediateDefenders.length === 0;
    for (const [index, horizontal] of [-0.82, 0, 0.82].entries())
      actions.push({
        type: 'shot',
        actorId,
        target: {
          x: actor.team === 'home' ? 105 : 0,
          y: 34 + horizontal * 3.66 * (actor.team === 'home' ? 1 : -1),
        },
        goalTarget: {
          horizontal,
          vertical: oneOnOne && index === 1 ? 0.72 : index === 1 ? 0.24 : 0.34,
        },
        intent: oneOnOne && index === 1 ? 'chip' : index === 1 ? 'driven' : 'placed',
      });
  }
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
  if (action.type === 'shot') return shotUtility(state, actor) + (action.target.y === 34 ? 2 : 0);
  if (action.type === 'header')
    return action.intent === 'header_shot' ? shotUtility(state, actor) - 8 : 35;
  if (action.type === 'cross') {
    const targets = state.players.filter(
      (p) => p.team === actor.team && distance(p.position, action.target) < 15,
    );
    const density = opponents(state, actor).filter(
      (p) => distance(p.position, action.target) < 12,
    ).length;
    const a = actor.profile.attributes;
    const delivery = (a.passing + a.setPieces + a.technique + a.gameReading) / 20;
    return (
      24 +
      delivery +
      targets.length * 9 -
      density * 6 -
      distance(actor.position, action.target) * 0.35 -
      underPressure * 22 +
      (action.intent === 'cutback' ? 8 : 0) +
      (style === 'direct' ? 7 : 0)
    );
  }
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
  const restart =
    state.restart?.phase === 'setup' && action.type !== 'hold'
      ? { ...state.restart, phase: 'release' as const, executedAt: state.time }
      : state.restart;
  if (action.type === 'hold')
    return {
      ...state,
      currentAction: action,
      latestAction: action,
      currentActorId: actor.id,
      actionCooldown: 1.1,
      decisionIndex: state.decisionIndex + 1,
      ...(restart ? { restart } : {}),
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
      ...(restart ? { restart } : {}),
    };
  if (action.type === 'shot') {
    const shot = resolveCanonicalShot(
      {
        ...state,
        decisionIndex: state.decisionIndex + 1,
        currentPressure: evaluatePressure(state, actor).value,
      },
      action,
    );
    const direction = actor.team === 'home' ? 1 : -1;
    const target = { ...shot.goalPoint, x: shot.goalPoint.x + direction * 2 };
    const duration = Math.max(0.28, distance(actor.position, target) / shot.speed);
    return {
      ...state,
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        from: { ...actor.position },
        target,
        travelElapsed: 0,
        travelDuration: duration,
        travelKind: 'shot',
        sourceAction: action.type,
        targetHeight: Math.max(0, shot.heightMetres),
        peakHeight: 0,
        shot,
        height: 0,
        flightProgress: 0,
        airborne: true,
      },
      currentAction: action,
      latestAction: action,
      currentActorId: actor.id,
      actionCooldown: duration + 0.45,
      decisionIndex: state.decisionIndex + 1,
      ...(restart ? { restart, restartAction: action } : {}),
    };
  }
  if (action.type === 'cross' || action.type === 'header') {
    const length = distance(actor.position, action.target);
    const isHeaderShot = action.type === 'header' && action.intent === 'header_shot';
    const headerShot = isHeaderShot
      ? resolveCanonicalShot(
          {
            ...state,
            decisionIndex: state.decisionIndex + 1,
            currentPressure: evaluatePressure(state, actor).value,
          },
          action,
        )
      : undefined;
    const duration = Math.max(
      0.35,
      headerShot
        ? length / headerShot.speed
        : length / (action.type === 'cross' && action.intent === 'floated' ? 18 : 25),
    );
    const headerTarget = headerShot
      ? {
          ...headerShot.goalPoint,
          x: headerShot.goalPoint.x + (actor.team === 'home' ? 2 : -2),
        }
      : action.target;
    return {
      ...state,
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        from: { ...actor.position },
        target: { ...headerTarget },
        ...(action.intendedTargetId ? { intendedReceiverId: action.intendedTargetId } : {}),
        travelElapsed: 0,
        travelDuration: duration,
        travelKind:
          action.type === 'cross'
            ? state.scenario === 'corner'
              ? 'corner_delivery'
              : state.scenario.startsWith('free_kick')
                ? 'free_kick_delivery'
                : 'cross'
            : 'header',
        sourceAction: action.type,
        peakHeight:
          action.type === 'cross'
            ? action.intent === 'floated'
              ? 5.8
              : action.intent === 'driven'
                ? 2.8
                : 1.2
            : isHeaderShot
              ? 0
              : 2.2,
        ...(headerShot
          ? { targetHeight: Math.max(0, headerShot.heightMetres), shot: headerShot }
          : {}),
        height: 0,
        flightProgress: 0,
        airborne: true,
      },
      currentAction: action,
      latestAction: action,
      currentActorId: actor.id,
      actionCooldown: duration + 0.35,
      decisionIndex: state.decisionIndex + 1,
      ...(restart ? { restart, restartAction: action } : {}),
    };
  }
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
      travelKind:
        restart?.phase === 'release' && state.scenario === 'goal_kick'
          ? 'long_distribution'
          : action.intent === 'through'
            ? 'through_ball'
            : 'pass',
      sourceAction: action.type,
      peakHeight:
        restart?.phase === 'release' && state.scenario === 'goal_kick'
          ? 9
          : action.intent === 'direct' && duration > 1.5
            ? 4
            : 0,
      height: 0,
      flightProgress: 0,
      airborne:
        (restart?.phase === 'release' && state.scenario === 'goal_kick') ||
        (action.intent === 'direct' && duration > 1.5),
    },
    currentAction: action,
    latestAction: action,
    currentActorId: actor.id,
    actionCooldown: duration + 0.35,
    decisionIndex: state.decisionIndex + 1,
    ...(restart ? { restart, restartAction: action } : {}),
  };
};

export const chooseRestartAction = (state: TacticalMatchState): MatchAction | undefined => {
  const restart = state.restart;
  if (!restart || restart.phase !== 'setup') return undefined;
  const actor = state.players.find((p) => p.id === restart.takerId);
  if (!actor) return undefined;
  if (state.scenario === 'penalty' || state.scenario === 'free_kick_close')
    return {
      type: 'shot',
      actorId: actor.id,
      target: { x: 105, y: 30.5 + (state.decisionIndex % 3) * 3.5 },
      intent: 'placed',
    };
  if (
    (state.scenario === 'goal_kick' ||
      state.scenario === 'corner' ||
      state.scenario === 'free_kick_far' ||
      state.scenario === 'free_kick_wide') &&
    restart.landingZone
  ) {
    const receiver = state.players
      .filter((p) => p.team === actor.team && p.id !== actor.id)
      .sort(
        (a, b) =>
          distance(a.position, restart.landingZone!) - distance(b.position, restart.landingZone!),
      )[0]!;
    if (state.scenario === 'corner' && restart.cornerPlan === 'short_corner') {
      const short = state.players
        .filter((p) => p.team === actor.team && p.id !== actor.id)
        .sort(
          (a, b) => distance(a.position, actor.position) - distance(b.position, actor.position),
        )[0]!;
      return {
        type: 'pass',
        actorId: actor.id,
        receiverId: short.id,
        target: short.position,
        intent: 'support',
      };
    }
    return {
      type: state.scenario === 'goal_kick' ? 'pass' : 'cross',
      actorId: actor.id,
      ...(state.scenario === 'goal_kick'
        ? { receiverId: receiver.id, intent: 'direct' as const }
        : { intendedTargetId: receiver.id, intent: 'floated' as const }),
      target: restart.landingZone,
    } as MatchAction;
  }
  const receiver = state.players
    .filter(
      (p) =>
        p.team === actor.team && p.id !== actor.id && p.profile.primaryPosition !== 'goalkeeper',
    )
    .sort((a, b) => distance(a.position, actor.position) - distance(b.position, actor.position))[0];
  return receiver
    ? {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
      }
    : undefined;
};
