import { isMatchGoalkeeper } from './matchGoalkeeper';
import type { MatchAction, TacticalMatchState } from './matchState';
import { distance, clampPitchPoint } from './matchSpace';
import { isRestartSetup } from './restartPhase';
import { restartLawContract } from './restartLaws';
import {
  enumerateCanonicalShootingOptions,
  enumerateFreeKickStrikeProfiles,
  findFreeKickWallGapTarget,
} from './shootingOptions';
import { isLegalThrowInReceiver } from './throwIn';

/** Rule eligibility and human choice are independent of NPC expected-value ranking. */
export const enumerateContextualRestartActions = (state: TacticalMatchState): MatchAction[] => {
  const restart = state.restart;
  if (
    !restart ||
    !isRestartSetup(state) ||
    state.periodEndPending ||
    ['half_time', 'full_time', 'abandoned'].includes(state.status ?? '')
  )
    return [];
  const actor = state.players.find(
    (p) => p.id === restart.takerId && !state.discipline?.[p.id]?.sentOff,
  );
  if (!actor) return [];
  const spot = restart.spot ?? state.ball;
  const teammates = state.players.filter(
    (p) => p.team === actor.team && p.id !== actor.id && !state.discipline?.[p.id]?.sentOff,
  );
  const nearest = [...teammates].sort(
    (a, b) => distance(a.position, spot) - distance(b.position, spot) || a.id.localeCompare(b.id),
  );
  const passes: MatchAction[] = (
    state.scenario === 'throw_in'
      ? nearest.filter((p) => isLegalThrowInReceiver(actor, p))
      : nearest
  )
    .slice(0, state.scenario === 'kick_off' ? 3 : 4)
    .map((receiver) => ({
      type: 'pass',
      actorId: actor.id,
      receiverId: receiver.id,
      target: clampPitchPoint(receiver.position),
      receiverPositionAtSelection: { ...receiver.position },
      intent: 'support',
    }));
  if (state.scenario === 'throw_in') return passes;
  const direction = actor.team === 'home' ? 1 : -1;
  const goalX = actor.team === 'home' ? 105 : 0;
  // Project the contact the taker is preparing for. This is a pure eligibility forecast:
  // the actual ball and player still have to reach these conditions through the lifecycle.
  const shotContext: TacticalMatchState = {
    ...state,
    ball: { x: spot.x, y: spot.y, height: 0, ownerId: actor.id },
    players: state.players.map((player) =>
      player.id === actor.id ? { ...player, position: { ...spot } } : player,
    ),
  };
  const shots: MatchAction[] = [];
  if (restartLawContract(state.scenario, restart.indirect).directOpponentGoal) {
    const chipSupported = enumerateCanonicalShootingOptions(shotContext, actor.id).some(
      (action) => action.type === 'shot' && action.intent === 'chip',
    );
    const intents: ('placed' | 'driven' | 'chip')[] = chipSupported
      ? ['placed', 'driven', 'chip']
      : ['placed', 'driven'];
    for (const intent of intents)
      shots.push({
        type: 'shot',
        actorId: actor.id,
        target: { x: goalX, y: 34 },
        intent,
        contact: 'settled',
        goalTarget: {
          horizontal: intent === 'chip' ? 0 : intent === 'placed' ? 0.6 : 0.2,
          vertical: intent === 'chip' ? 0.62 : intent === 'placed' ? 0.34 : 0.24,
        },
      });
    if (state.scenario.startsWith('free_kick')) {
      for (const freeKickProfile of enumerateFreeKickStrikeProfiles(shotContext, actor.id)) {
        const gap =
          freeKickProfile === 'wall_gap'
            ? findFreeKickWallGapTarget(shotContext, actor.id)
            : undefined;
        if (freeKickProfile === 'wall_gap' && !gap) continue;
        shots.push({
          type: 'shot',
          actorId: actor.id,
          target: { x: goalX, y: 34 },
          intent:
            freeKickProfile === 'power_bend' || freeKickProfile === 'under_wall'
              ? 'driven'
              : 'placed',
          contact: 'settled',
          freeKickProfile,
          goalTarget: gap ?? {
            horizontal: 0.45,
            vertical: freeKickProfile === 'under_wall' ? 0.04 : 0.65,
          },
        });
      }
    }
  }
  if (state.scenario === 'penalty') return shots;
  if (state.scenario === 'kick_off') return [...passes, ...shots];
  const reset = teammates
    .filter((p) => (p.position.x - spot.x) * direction < -2)
    .sort(
      (a, b) => distance(a.position, spot) - distance(b.position, spot) || a.id.localeCompare(b.id),
    )[0];
  if (reset && !passes.some((a) => a.type === 'pass' && a.receiverId === reset.id))
    passes.push({
      type: 'pass',
      actorId: actor.id,
      receiverId: reset.id,
      target: clampPitchPoint(reset.position),
      intent: 'support',
    });
  if (state.scenario === 'goal_kick' || state.scenario === 'gk_short') {
    const long = teammates
      .filter((p) => !isMatchGoalkeeper(p))
      .sort((a, b) => (b.position.x - a.position.x) * direction || a.id.localeCompare(b.id))
      .slice(0, 3);
    return [
      ...passes,
      ...long.map((receiver) => ({
        type: 'pass' as const,
        actorId: actor.id,
        receiverId: receiver.id,
        target: clampPitchPoint(receiver.position),
        intent: 'direct' as const,
        delivery: 'lofted' as const,
      })),
      ...shots,
    ];
  }
  const deliveries: MatchAction[] = [];
  const nearY = spot.y <= 34 ? 30 : 38;
  const zones = [
    { key: 'near_post_target', point: { x: goalX - direction * 7, y: nearY } },
    { key: 'central_target', point: { x: goalX - direction * 10, y: 34 } },
    { key: 'far_post_target', point: { x: goalX - direction * 8, y: 68 - nearY } },
    { key: 'edge_support', point: { x: goalX - direction * 20, y: 34 } },
  ];
  for (const zone of zones) {
    const candidates = [...teammates].sort(
      (a, b) =>
        Number(restart.roles[b.id]?.key === zone.key) -
          Number(restart.roles[a.id]?.key === zone.key) ||
        distance(a.position, zone.point) - distance(b.position, zone.point) ||
        a.id.localeCompare(b.id),
    );
    const target = candidates[0];
    if (!target) continue;
    for (const intent of zone.key === 'edge_support'
      ? (['cutback'] as const)
      : (['floated', 'driven'] as const))
      deliveries.push({
        type: 'cross',
        actorId: actor.id,
        intendedTargetId: target.id,
        target: zone.point,
        intent,
      });
  }
  const developing = teammates.filter((p) =>
    ['near_post_target', 'central_target', 'far_post_target'].includes(
      restart.roles[p.id]?.key ?? '',
    ),
  );
  for (const receiver of developing.slice(0, 3)) {
    const target = restart.roles[receiver.id]?.zone.centre ?? receiver.position;
    if (
      !deliveries.some(
        (a) =>
          a.type === 'cross' &&
          a.intendedTargetId === receiver.id &&
          distance(a.target, target) < 1,
      )
    )
      deliveries.push({
        type: 'cross',
        actorId: actor.id,
        intendedTargetId: receiver.id,
        target: clampPitchPoint(target),
        intent: 'floated',
      });
  }
  const space: MatchAction[] = nearest.length
    ? [
        {
          type: 'space_pass',
          actorId: actor.id,
          target: clampPitchPoint({
            x: spot.x + direction * 10,
            y: spot.y + (spot.y <= 34 ? 6 : -6),
          }),
        },
      ]
    : [];
  const shortFirst = state.scenario === 'corner' && restart.cornerPlan === 'short_corner';
  return shortFirst
    ? [...passes, ...deliveries, ...space, ...shots]
    : state.scenario === 'free_kick_close'
      ? [...shots, ...deliveries, ...passes, ...space]
      : [...deliveries, ...passes, ...space, ...shots];
};
