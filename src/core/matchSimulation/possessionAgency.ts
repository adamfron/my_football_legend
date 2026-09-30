import { distance, distanceToSegment } from './matchSpace';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import {
  possessionDecisionContextSchema,
  type MatchAction,
  type TacticalMatchState,
} from './matchState';
import { normalizeAngle } from './playerOrientation';
import { hasReachedCarryDecisionWaypoint } from './carryExecution';

/** A human choice owns this physical possession, independently of an action cooldown. */
export const hasActiveHumanPossession = (state: TacticalMatchState): boolean =>
  Boolean(
    state.humanPossessionEpisode &&
      state.humanPossessionEpisode.actorId === state.controlledFootballerId &&
      state.ball.ownerId === state.humanPossessionEpisode.actorId &&
      state.scenario === 'open_play' &&
      (state.ballEpisode ?? 0) === state.humanPossessionEpisode.ballEpisode,
  );

/** Canonical evidence closes ownership; presentation and elapsed cooldown never do. */
export const reconcileHumanPossession = (state: TacticalMatchState): TacticalMatchState => {
  if (!state.humanPossessionEpisode || hasActiveHumanPossession(state)) return state;
  const { humanPossessionEpisode: _ended, ...next } = state;
  void _ended;
  return next;
};

export const derivePossessionDecisionContext = (state: TacticalMatchState, actorId: string) => {
  const actor = state.players.find((player) => player.id === actorId)!;
  const goal = { x: actor.team === 'home' ? 105 : 0, y: 34 };
  const foes = state.players.filter((player) => player.team !== actor.team);
  const defenders = foes.filter((player) => player.profile.primaryPosition !== 'goalkeeper');
  const nearest = defenders
    .map((player) => ({ player, metres: distance(player.position, actor.position) }))
    .sort((a, b) => a.metres - b.metres || a.player.id.localeCompare(b.player.id))[0];
  const keeper = foes.find((player) => player.profile.primaryPosition === 'goalkeeper');
  const keeperDistance = keeper ? distance(keeper.position, actor.position) : 105;
  const keeperAdvance = keeper ? Math.abs(goal.x - keeper.position.x) : 0;
  const keeperClosing = keeper
    ? ((actor.position.x - keeper.position.x) * keeper.velocity.x +
        (actor.position.y - keeper.position.y) * keeper.velocity.y) /
      Math.max(0.1, keeperDistance)
    : 0;
  const shooting = evaluateShootingOpportunity(state, actor);
  const goalDistance = distance(actor.position, goal);
  const box =
    Math.abs(goal.x - actor.position.x) <= 16.5 && Math.abs(actor.position.y - 34) <= 20.16;
  const decisiveReceiverIds = state.players
    .filter((player) => {
      if (
        player.team !== actor.team ||
        player.id === actorId ||
        distance(player.position, goal) > 20
      )
        return false;
      const separation = Math.min(
        ...defenders.map((foe) => distance(foe.position, player.position)),
        105,
      );
      return (
        separation >= 4 &&
        distance(player.position, actor.position) >= 4 &&
        distance(player.position, actor.position) <= 23 &&
        defenders.every(
          (foe) => distanceToSegment(foe.position, actor.position, player.position) >= 1.5,
        )
      );
    })
    .map((player) => player.id)
    .sort();
  return possessionDecisionContextSchema.parse({
    zone:
      goalDistance <= 12 && box ? 3 : box ? 2 : Math.abs(goal.x - actor.position.x) <= 35 ? 1 : 0,
    ...(nearest ? { nearestDefenderId: nearest.player.id } : {}),
    defenderDistance: nearest?.metres ?? 105,
    defenderBearing: nearest
      ? Math.atan2(
          nearest.player.position.y - actor.position.y,
          nearest.player.position.x - actor.position.x,
        )
      : 0,
    contested: Boolean(
      nearest && nearest.metres <= 1.6 && distance(nearest.player.position, state.ball) <= 1,
    ),
    keeperRushing: keeperAdvance >= 3 && keeperDistance <= 22 && keeperClosing >= 1.5,
    keeperChallenge: keeperAdvance >= 3.5 && keeperDistance <= 10,
    shotCategory: ['non_viable', 'speculative', 'credible', 'high_value'].indexOf(
      shooting.category,
    ),
    shotValue: shooting.effectiveScoringExpectation,
    goalDistance,
    blockingDefenders: shooting.blockingDefenders,
    decisiveReceiverIds,
    touchDistance: distance(actor.position, state.ball),
  });
};

/** Only selected non-terminal actions open/refresh ownership. A terminal choice consumes it. */
export const commitHumanPossessionDecision = (
  state: TacticalMatchState,
  action: MatchAction,
): TacticalMatchState => {
  if (action.actorId !== state.controlledFootballerId) return state;
  const clean = reconcileHumanPossession(state);
  if (action.type !== 'carry' && action.type !== 'hold') {
    const { humanPossessionEpisode: _ended, ...next } = clean;
    void _ended;
    return next;
  }
  const previous = clean.humanPossessionEpisode;
  const context = derivePossessionDecisionContext(state, action.actorId);
  // Once a family/zone has been offered in this possession, small threshold oscillations cannot
  // advertise the same transition again after the player chooses another carry.
  if (previous) {
    context.zone = Math.max(context.zone, previous.context.zone);
    context.keeperRushing ||= previous.context.keeperRushing;
    context.keeperChallenge ||= previous.context.keeperChallenge;
    context.shotCategory = Math.max(context.shotCategory, previous.context.shotCategory);
    context.blockingDefenders = Math.min(
      context.blockingDefenders,
      previous.context.blockingDefenders,
    );
    context.decisiveReceiverIds = [
      ...new Set([...previous.context.decisiveReceiverIds, ...context.decisiveReceiverIds]),
    ].sort();
  }
  return {
    ...clean,
    humanPossessionEpisode: {
      actorId: action.actorId,
      startedAt: previous?.startedAt ?? state.time,
      ownershipStartedAt: state.ballOwnershipStartedAt ?? state.time,
      ballEpisode: state.ballEpisode ?? 0,
      decisionAt: state.time,
      context,
    },
  };
};

/** Semantic boundaries, compared to the last human choice; no repeated timer-based menus. */
export const humanPossessionRedecisionReason = (state: TacticalMatchState): string | undefined => {
  if (!hasActiveHumanPossession(state)) return;
  const episode = state.humanPossessionEpisode!;
  const actor = state.players.find((player) => player.id === episode.actorId)!;
  const carry = state.ballCarrierIntent;
  if (
    carry?.humanSelected &&
    carry.actorId === actor.id &&
    hasReachedCarryDecisionWaypoint(actor, carry)
  )
    return 'carry_decision_waypoint';
  const now = derivePossessionDecisionContext(state, actor.id);
  const before = episode.context;
  if (!before.keeperRushing && now.keeperRushing) return 'goalkeeper_rush';
  if (!before.keeperChallenge && now.keeperChallenge) return 'one_on_one';
  if (!before.contested && now.contested) return 'possession_contested';
  if (now.defenderDistance < 2.5 && before.defenderDistance - now.defenderDistance >= 2)
    return 'major_pressure';
  if (
    now.defenderDistance < 4 &&
    before.defenderDistance - now.defenderDistance >= 1 &&
    (now.nearestDefenderId !== before.nearestDefenderId ||
      Math.abs(normalizeAngle(now.defenderBearing - before.defenderBearing)) >= Math.PI / 3)
  )
    return 'new_defender_angle';
  if (now.zone > before.zone) return 'attacking_zone';
  if (now.shotCategory >= 2 && before.blockingDefenders > 0 && now.blockingDefenders === 0)
    return 'shooting_lane_open';
  if (
    now.shotCategory > before.shotCategory &&
    now.shotCategory >= 2 &&
    (now.shotValue - before.shotValue >= 0.07 || before.goalDistance - now.goalDistance >= 3)
  )
    return 'new_shooting_opportunity';
  if (before.shotCategory >= 2 && before.shotValue - now.shotValue >= 0.12)
    return 'shooting_opportunity_closing';
  if (now.decisiveReceiverIds.some((id) => !before.decisiveReceiverIds.includes(id)))
    return 'decisive_pass_available';
  if (now.touchDistance >= 1.8 && now.touchDistance - before.touchDistance >= 0.9)
    return 'heavy_touch';
};
