import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  attacksRight,
  clampPitchPoint,
  distance,
  distanceToSegment,
  type PitchPoint,
  type TeamSide,
} from './matchSpace';
import { tacticalRoleFor } from './tacticalRoles';
import { usesRoleIntentions } from './decisionPolicyConfig';
import { evaluateTransitionOpportunity } from './attackingTransition';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { secondLastOpponentLine } from './offside';
import { deriveMovementCapability } from './locomotion';
import { estimatePlayerArrivalTime } from './playerArrival';

export const tacticalRolePhaseSchema = z.enum([
  'organised_defending',
  'ball_recovery',
  'rapid_transition',
  'build_up',
  'settled_attack',
  'final_third',
  'defensive_transition',
  'set_piece',
]);
export type TacticalRolePhase = z.infer<typeof tacticalRolePhaseSchema>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const available = (s: TacticalMatchState, p: MatchPlayerState) =>
  canParticipatePhysically(p) && !s.discipline?.[p.id]?.sentOff;

/** Ownership, defensive recovery, support and restart state precede territory classification. */
export const deriveTacticalRolePhase = (
  state: TacticalMatchState,
  side: TeamSide,
): TacticalRolePhase => {
  if (state.restart || state.scenario !== 'open_play' || state.postGoal) return 'set_piece';
  const owner = state.players.find((p) => p.id === state.ball.ownerId);
  if (!owner) return 'ball_recovery';
  const dir = attacksRight(owner) ? 1 : -1;
  if (owner.team !== side)
    return evaluateTransitionOpportunity(state, owner).active
      ? 'defensive_transition'
      : 'organised_defending';
  if (evaluateTransitionOpportunity(state, owner).active) return 'rapid_transition';
  const defenders = state.players.filter(
    (p) => p.team !== side && !isMatchGoalkeeper(p) && available(state, p),
  );
  const ahead = defenders.filter((p) => dir * (p.position.x - owner.position.x) > 0);
  const support = state.players.filter(
    (p) =>
      p.team === side &&
      p.id !== owner.id &&
      available(state, p) &&
      dir * (p.position.x - owner.position.x) > -5 &&
      distance(p.position, owner.position) < 28,
  );
  const depth = dir > 0 ? owner.position.x : 105 - owner.position.x;
  const goalDistance = distance(owner.position, { x: dir > 0 ? 105 : 0, y: 34 });
  if (depth > 68 && (support.length >= 2 || ahead.length <= 4 || goalDistance < 23))
    return 'final_third';
  if (ahead.length >= 6 && (depth < 52.5 || support.length < 2)) return 'build_up';
  return 'settled_attack';
};

export const roleMovementTarget = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  fallback: PitchPoint,
): PitchPoint => {
  // A manager's explicit live instruction is shared tactical authority. R2/R3
  // additionally generate autonomous role movement before any manager adjustment;
  // the other policies retain their own initial movement/candidate architectures.
  const directed = state.rolePlan?.changes.some((change) => change.playerId === player.id);
  if (
    (!usesRoleIntentions(state) && !directed) ||
    !available(state, player) ||
    isMatchGoalkeeper(player) ||
    (state.playerAgencyEnabled !== false && state.controlledFootballerId === player.id)
  )
    return fallback;
  const phase = deriveTacticalRolePhase(state, player.team);
  if (['set_piece', 'ball_recovery'].includes(phase)) return fallback;
  const owner = state.players.find((p) => p.id === state.ball.ownerId);
  if (!owner || owner.id === player.id) return fallback;
  const role = tacticalRoleFor(state, player),
    has = (i: (typeof role.instructions)[number]) => role.instructions.includes(i);
  const dir = attacksRight(player) ? 1 : -1;
  const homeY = player.neutralAnchor.y < 34 ? 8 : 60;
  const centralY = 34 + (homeY - 34) * 0.3;
  if (owner.team !== player.team) {
    // The primary press/mark and an immediate defensive emergency retain their real target.
    if (
      state.decisionPolicy !== 'phase-role-hybrid-v1' ||
      phase !== 'defensive_transition' ||
      !has('cover') ||
      distance(player.position, owner.position) < 12
    )
      return fallback;
    return clampPitchPoint({ x: fallback.x - dir * 5, y: fallback.y + (34 - fallback.y) * 0.18 });
  }
  const cover = state.players.filter(
    (p) =>
      p.team === player.team &&
      p.id !== player.id &&
      p.id !== owner.id &&
      available(state, p) &&
      !isMatchGoalkeeper(p) &&
      dir * (state.ball.x - p.position.x) > 3,
  ).length;
  let target = { ...fallback };
  if (has('hold_position'))
    target = {
      x:
        player.neutralAnchor.x +
        dir * Math.min(8, Math.max(0, dir * (state.ball.x - player.neutralAnchor.x) * 0.18)),
      y: player.neutralAnchor.y,
    };
  if (has('come_short'))
    target = {
      x: owner.position.x + dir * (role.family === 'striker' ? 6 : -7),
      y:
        role.family === 'winger' || role.family === 'fullback'
          ? homeY + (34 - homeY) * 0.22
          : centralY,
    };
  if (has('central_support') && !has('come_short') && !has('hold_position'))
    target = { x: owner.position.x - dir * 6, y: centralY };
  if (has('width')) target.y = homeY;
  if (has('underlap')) target.y = centralY;
  if (has('depth') && (!has('cover') || cover >= 2)) {
    const reachableDepth =
      player.position.x + dir * Math.min(10, deriveMovementCapability(player).runSpeed * 1.5);
    const invitation = owner.position.x + dir * (phase === 'rapid_transition' ? 19 : 14);
    target.x =
      dir > 0 ? Math.max(invitation, reachableDepth) : Math.min(invitation, reachableDepth);
  }
  if (has('overlap') && cover >= 2) target = { x: owner.position.x + dir * 10, y: homeY };
  if ((has('overlap') || has('underlap')) && role.family === 'fullback' && cover < 2)
    target = { x: owner.position.x - dir * 8, y: has('underlap') ? centralY : homeY };
  if (
    has('box') &&
    (!has('come_short') ||
      (role.id === 'target_forward' &&
        phase === 'final_third' &&
        Math.abs(owner.position.y - 34) > 12)) &&
    (phase === 'final_third' || phase === 'rapid_transition') &&
    cover >= 2
  )
    target.x = dir > 0 ? Math.max(target.x, 88) : Math.min(target.x, 17);
  const line = secondLastOpponentLine(state, player.team);
  target.x =
    dir > 0
      ? Math.min(target.x, Math.max(52.5, line, state.ball.x) - 0.8)
      : Math.max(target.x, Math.min(52.5, line, state.ball.x) + 0.8);
  const weight =
    state.decisionPolicy === 'phase-role-hybrid-v1' && phase === 'rapid_transition'
      ? has('counter')
        ? 0.9
        : 0.4
      : 0.8;
  return clampPitchPoint({
    x: fallback.x + (target.x - fallback.x) * weight,
    y: fallback.y + (target.y - fallback.y) * weight,
  });
};

/** Three role invitations at most, checked by the existing finite delivery/arrival planner. */
export const roleReceivingTargets = (state: TacticalMatchState, actor: MatchPlayerState) => {
  if (!usesRoleIntentions(state)) return [];
  return state.players
    .filter(
      (p) =>
        p.team === actor.team &&
        p.id !== actor.id &&
        available(state, p) &&
        !isMatchGoalkeeper(p) &&
        !(state.playerAgencyEnabled !== false && state.controlledFootballerId === p.id),
    )
    .map((receiver) => ({ receiver, target: roleMovementTarget(state, receiver, receiver.target) }))
    .filter(
      ({ receiver, target }) =>
        distance(receiver.position, target) > 1.5 && distance(actor.position, target) < 60,
    )
    .sort(
      (a, b) =>
        distance(a.receiver.position, a.target) - distance(b.receiver.position, b.target) ||
        a.receiver.id.localeCompare(b.receiver.id),
    )
    .slice(0, 3);
};

/** Role consequences value before and after alike. Width requires real box partners, central
 * access requires actual unblocked outlets. Roles never award a flat preferred-action bonus. */
export const roleControlledValue = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  point: PitchPoint,
  elapsed: number,
) => {
  if (!['role-value-v1', 'phase-role-hybrid-v1'].includes(state.decisionPolicy ?? '')) return 0;
  const role = tacticalRoleFor(state, actor),
    has = (i: (typeof role.instructions)[number]) => role.instructions.includes(i);
  const dir = attacksRight(actor) ? 1 : -1,
    depth = dir > 0 ? point.x : 105 - point.x;
  const teammates = state.players.filter(
    (p) =>
      p.team === actor.team && p.id !== actor.id && available(state, p) && !isMatchGoalkeeper(p),
  );
  const opponents = state.players.filter((p) => p.team !== actor.team && available(state, p));
  const project = (p: MatchPlayerState) => ({
    x: p.position.x + p.velocity.x * Math.min(1, elapsed),
    y: p.position.y + p.velocity.y * Math.min(1, elapsed),
  });
  const free = clamp(Math.min(9, ...opponents.map((p) => distance(project(p), point))) / 7);
  const goal = { x: dir > 0 ? 105 : 0, y: 34 };
  const boxPartners = teammates.filter(
    (p) => dir * (p.position.x - (dir > 0 ? 78 : 27)) > 0 && Math.abs(p.position.y - 34) < 17,
  ).length;
  const outlets = teammates.filter(
    (p) =>
      distance(project(p), point) < 22 &&
      !opponents.some((d) => distanceToSegment(project(d), point, project(p)) < 1.8),
  ).length;
  const cover = teammates.filter((p) => dir * (point.x - p.position.x) > 3).length;
  const a = actor.profile.attributes;
  const wideAccess =
    (clamp((Math.abs(point.y - 34) - 10) / 17) *
      clamp((depth - 45) / 35) *
      Math.min(1, boxPartners / 2) *
      a.passing) /
    100;
  // Central connections contribute attacking access at their actual field depth.
  const centralAccess =
    (clamp(1 - Math.abs(point.y - 34) / 25) *
      Math.min(1, outlets / 3) *
      (a.passing + a.firstTouch) *
      clamp(depth / 105)) /
    200;
  const shootingAccess =
    (Math.exp(-distance(point, goal) / 15) *
      clamp(1 - Math.abs(point.y - 34) / 25) *
      (a.finishing + a.positioning)) /
    200;
  const progression = (clamp(depth / 105) * free * (a.dribbling + a.pace)) / 200;
  const phase = deriveTacticalRolePhase(state, actor.team);
  const hierarchy =
    state.decisionPolicy === 'phase-role-hybrid-v1'
      ? phase === 'rapid_transition'
        ? 0.4
        : phase === 'build_up'
          ? 1.25
          : phase === 'final_third'
            ? 1.1
            : 0.85
      : 1;
  return (
    hierarchy *
    (0.022 * (has('cross') ? wideAccess : 0) +
      0.016 * (has('combine') || has('central_support') ? centralAccess : 0) +
      0.032 * (has('shoot') || has('box') ? shootingAccess : 0) +
      0.012 * (has('depth') || has('counter') ? progression : 0) +
      0.008 * (has('cover') ? Math.min(1, cover / 3) * free : 0))
  );
};

export const waitingForecastSchema = z.object({
  horizon: z.number().positive(),
  intervention: z.number().min(0).max(1),
  supportMovement: z.number().nonnegative(),
  nearestArrival: z.number().nonnegative(),
  reason: z.enum([
    'developing_support',
    'physical_readiness',
    'opponent_intervention',
    'unchanged_possession',
  ]),
});
/** The counterfactual of remaining stationary includes closing defenders and reachable
 * teammate movement. It has no hold-count/time-in-possession cost and forces no action. */
export const forecastWaiting = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const horizon = 2.5;
  let nearestArrival = 60,
    supportMovement = 0;
  const players = state.players.map((p) => {
    if (p.id === actor.id || !available(state, p)) return p;
    const capability = deriveMovementCapability(p);
    if (p.team !== actor.team && !isMatchGoalkeeper(p))
      nearestArrival = Math.min(
        nearestArrival,
        estimatePlayerArrivalTime(state, p, actor.position, 'intercept').estimatedTime,
      );
    const target =
      p.team !== actor.team && distance(p.position, actor.position) < 16 && !isMatchGoalkeeper(p)
        ? actor.position
        : p.target;
    const remaining = distance(p.position, target);
    const reachable = Math.min(
      capability.runSpeed * horizon,
      Math.hypot(p.velocity.x, p.velocity.y) * horizon +
        0.5 * capability.acceleration * horizon ** 2,
    );
    const fraction = Math.min(1, reachable / Math.max(0.01, remaining));
    const position = clampPitchPoint({
      x: p.position.x + (target.x - p.position.x) * fraction,
      y: p.position.y + (target.y - p.position.y) * fraction,
    });
    if (p.team === actor.team && distance(p.position, actor.position) < 30)
      supportMovement += distance(p.position, position);
    return { ...p, position };
  });
  const skill =
    (actor.profile.attributes.strength +
      actor.profile.attributes.firstTouch +
      actor.profile.attributes.dribbling) /
    300;
  const intervention = clamp((horizon - nearestArrival + 0.4) / horizon) * (0.8 - skill * 0.3);
  const reason =
    intervention > 0.05
      ? 'opponent_intervention'
      : supportMovement > 2
        ? 'developing_support'
        : state.ballOwnershipStartedAt !== undefined &&
            state.time - state.ballOwnershipStartedAt < 0.3
          ? 'physical_readiness'
          : 'unchanged_possession';
  return {
    state: { ...state, players },
    diagnostic: {
      horizon,
      intervention,
      supportMovement,
      nearestArrival,
      reason,
    } satisfies z.infer<typeof waitingForecastSchema>,
  };
};
