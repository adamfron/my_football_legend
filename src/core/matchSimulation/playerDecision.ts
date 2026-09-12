import { z } from 'zod';
import {
  enumerateAvailableActions,
  chooseNpcAction,
  resolveMatchAction,
  rankAvailableActionsForAI,
} from './matchActions';
import { evaluateMatchSituation, matchSituationEvaluationSchema } from './matchSituationEvaluator';
import {
  attackDirection,
  clampPitchPoint,
  distance,
  fieldValue,
  pitchPointSchema,
  signedForwardDistance,
} from './matchSpace';
import {
  matchActionSchema,
  playerMovementIntentSchema,
  type MatchAction,
  type TacticalMatchState,
} from './matchState';
import type { TeamSide } from './matchSpace';
import { evaluateGlobalBallRace, ballRaceCandidateSchema } from './looseBallPhysics';
import { isActionResolutionInProgress } from './actionLifecycle';
import { evaluateActionImpact } from './actionImpact';
import { estimatePlayerArrivalTime, playerArrivalEstimateSchema } from './playerArrival';

export const playerDecisionOptionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('action'),
    labelKey: z.string(),
    action: matchActionSchema,
  }),
  z.object({
    id: z.string(),
    kind: z.literal('movement'),
    labelKey: z.string(),
    intent: playerMovementIntentSchema,
  }),
]);
export type PlayerDecisionOption = z.infer<typeof playerDecisionOptionSchema>;
export const playerDecisionOpportunitySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  openedAt: z.number().nonnegative(),
  kind: z.enum(['on_ball', 'incoming_ball', 'off_ball_run', 'defensive_response', 'loose_ball']),
  triggerReason: z.string(),
  signature: z.string(),
  situation: matchSituationEvaluationSchema,
  options: z.array(playerDecisionOptionSchema).min(1),
});
export type PlayerDecisionOpportunity = z.infer<typeof playerDecisionOpportunitySchema>;
export interface PlayerDecisionGate {
  lastSituationSignature?: string;
  lastResolvedAt?: number;
}
export const playerDecisionProbeSchema = z.object({
  actorId: z.string().optional(),
  candidate: z.boolean(),
  opportunityKind: playerDecisionOpportunitySchema.shape.kind.optional(),
  blockedReason: z
    .enum([
      'no_controlled_player',
      'not_open_play',
      'resolution_in_progress',
      'routine',
      'not_relevant',
      'same_situation',
      'cooldown',
      'no_options',
      'no_contextual_interactions',
      'friendly_ball',
    ])
    .optional(),
  situationKind: z.string().optional(),
  decisionWorthiness: z.number().optional(),
  pressure: z.number().optional(),
  signature: z.string().optional(),
  roleProfile: z.enum(['goalkeeper', 'defender', 'midfielder', 'forward']).optional(),
  ballRelevance: z.unknown().optional(),
  possessionMismatch: z.boolean().optional(),
  interception: z
    .object({
      interceptPoint: pitchPointSchema,
      ballArrivalTime: z.number().nonnegative(),
      playerArrivalTime: z.number().nonnegative(),
      distanceToIntercept: z.number().nonnegative(),
      initialPlayerSpeed: z.number().nonnegative(),
      targetSpeed: z.number().positive(),
      turnAngle: z.number().nonnegative(),
      arrivalMargin: z.number(),
    })
    .optional(),
});
export type PlayerDecisionProbe = z.infer<typeof playerDecisionProbeSchema>;

export const controlledBallRelationshipSchema = z.enum([
  'intended_receiver',
  'friendly_possible_receiver',
  'opponent_interceptor',
  'uninvolved',
]);
export type ControlledBallRelationship = z.infer<typeof controlledBallRelationshipSchema>;

/** Canonical ownership of an in-flight ball, never inferred from its geometry. */
export const deriveBallSourceTeam = (state: TacticalMatchState): TeamSide | undefined => {
  const actionActor =
    state.currentAction && ['pass', 'cross', 'header'].includes(state.currentAction.type)
      ? state.currentAction.actorId
      : undefined;
  const sourceId = state.ball.lastTouchPlayerId ?? actionActor;
  return state.players.find((player) => player.id === sourceId)?.team;
};

export const deriveControlledBallRelationship = (
  state: TacticalMatchState,
  actorId: string,
): ControlledBallRelationship => {
  const actor = state.players.find((player) => player.id === actorId);
  const sourceTeam = deriveBallSourceTeam(state);
  if (!actor || !state.ball.travelDuration || state.ball.ownerId) return 'uninvolved';
  if (sourceTeam === actor.team) {
    if (state.ball.intendedReceiverId === actorId) return 'intended_receiver';
    return state.ball.target && distance(actor.position, state.ball.target) <= 3
      ? 'friendly_possible_receiver'
      : 'uninvolved';
  }
  return sourceTeam ? 'opponent_interceptor' : 'uninvolved';
};

export const playerInteractionTargetDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), playerId: z.string() }),
  z.object({ kind: z.literal('ball'), point: pitchPointSchema }),
  z.object({ kind: z.literal('space'), point: pitchPointSchema }),
  z.object({ kind: z.literal('goal'), side: z.enum(['home', 'away']) }),
]);
export type PlayerInteractionTargetDescriptor = z.infer<
  typeof playerInteractionTargetDescriptorSchema
>;

/** Finite, RNG-free bridge proving that a pause has a usable world target. */
export const projectSelectableInteractionTargets = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
): PlayerInteractionTargetDescriptor[] => {
  const actor = state.players.find((player) => player.id === opportunity.actorId);
  if (!actor) return [];
  if (opportunity.kind === 'incoming_ball') {
    const result: PlayerInteractionTargetDescriptor[] = [
      { kind: 'ball', point: { x: state.ball.x, y: state.ball.y } },
    ];
    const carry = opportunity.options.find(
      (option) => option.kind === 'action' && option.action.type === 'carry',
    );
    if (carry?.kind === 'action' && carry.action.type === 'carry')
      result.push({ kind: 'space', point: carry.action.target });
    if (
      opportunity.options.some(
        (option) => option.kind === 'action' && option.action.type === 'shot',
      )
    )
      result.push({ kind: 'goal', side: actor.team === 'home' ? 'away' : 'home' });
    return result;
  }
  if (opportunity.kind === 'defensive_response') {
    if (!state.ball.ownerId) return [{ kind: 'ball', point: { x: state.ball.x, y: state.ball.y } }];
    return [{ kind: 'player', playerId: state.ball.ownerId }];
  }
  if (opportunity.kind === 'loose_ball')
    return [{ kind: 'ball', point: { x: state.ball.x, y: state.ball.y } }];
  if (opportunity.kind === 'off_ball_run')
    return opportunity.options.flatMap((option) =>
      option.kind === 'movement' ? [{ kind: 'space' as const, point: option.intent.target }] : [],
    );
  return [{ kind: 'player', playerId: actor.id }];
};

export const decisionRoleSchema = z.enum(['goalkeeper', 'defender', 'midfielder', 'forward']);
export type DecisionRole = z.infer<typeof decisionRoleSchema>;
export const ballRelevanceSchema = z.object({
  relevant: z.boolean(),
  estimatedArrivalTime: z.number().optional(),
  ballArrivalTime: z.number().optional(),
  contenderRank: z.number().int().positive().optional(),
  actor: ballRaceCandidateSchema.optional(),
  bestOverall: ballRaceCandidateSchema.optional(),
  bestTeammate: ballRaceCandidateSchema.optional(),
  bestOpponent: ballRaceCandidateSchema.optional(),
  trajectoryRelevant: z.boolean(),
  reason: z.enum([
    'reachable_soon',
    'trajectory_intersection',
    'direct_contest',
    'critical_cover',
    'too_far',
    'other_player_dominant',
  ]),
});
export type BallRelevance = z.infer<typeof ballRelevanceSchema>;
export const onBallDecisionRelevanceSchema = z.object({
  relevant: z.boolean(),
  score: z.number(),
  reasons: z.array(z.string()),
  viableFamilies: z.array(z.string()),
});
export type OnBallDecisionRelevance = z.infer<typeof onBallDecisionRelevanceSchema>;
const actionFamily = (action: MatchAction) =>
  action.type === 'pass'
    ? action.intent === 'support'
      ? 'safe_pass'
      : action.intent === 'progressive'
        ? 'progressive_pass'
        : 'direct_pass'
    : action.type;
/** RNG-free projection over the canonical action ranking; it changes only whether play pauses. */
export const evaluateOnBallDecisionRelevance = (
  state: TacticalMatchState,
  actorId: string,
): OnBallDecisionRelevance => {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return { relevant: false, score: 0, reasons: [], viableFamilies: [] };
  const situation = evaluateMatchSituation(state, actorId);
  const ranked = rankAvailableActionsForAI(state, actorId);
  const best = ranked[0]?.canonicalScore ?? 0;
  const competitive = ranked.filter((a) => best - a.canonicalScore <= 14);
  const families = [...new Set(competitive.map((a) => actionFamily(a.action)))];
  const progressive = families.some((f) =>
    ['progressive_pass', 'direct_pass', 'carry', 'cross', 'shot'].includes(f),
  );
  const preferredImpact = ranked[0]
    ? evaluateActionImpact(state, ranked[0].action).family
    : 'routine';
  const hasAlternative = competitive.some(
    (item) => ranked[0] && actionFamily(item.action) !== actionFamily(ranked[0].action),
  );
  const reasons: string[] = [];
  if (families.length >= 2) reasons.push('meaningful_action_diversity');
  if (progressive) reasons.push('progressive_option');
  if ((situation.context.pressure ?? 0) >= 0.35) reasons.push('pressure');
  if (state.teams[actor.team].phase === 'attacking_transition') reasons.push('transition');
  const role = deriveDecisionRole(actor);
  const score =
    situation.decisionWorthiness +
    (families.length >= 2 ? 0.2 : 0) +
    (progressive ? 0.12 : 0) +
    (role === 'midfielder' && progressive ? 0.12 : 0);
  const absolutePlayerOwned = ranked.some(
    ({ action }) => action.type === 'shot' || action.type === 'cross',
  );
  if (preferredImpact === 'high_impact' || absolutePlayerOwned)
    reasons.push('autopilot_escalation');
  return onBallDecisionRelevanceSchema.parse({
    relevant:
      absolutePlayerOwned ||
      (preferredImpact === 'high_impact' && hasAlternative) ||
      situation.decisionEligible ||
      (score >= 0.58 && families.length >= 2 && progressive),
    score,
    reasons,
    viableFamilies: families,
  });
};

export const incomingPlayerInvolvementSchema = z.object({
  relevant: z.boolean(),
  arrivalTime: z.number().nonnegative().optional(),
  important: z.boolean(),
  reasons: z.array(z.string()),
});
export type IncomingPlayerInvolvement = z.infer<typeof incomingPlayerInvolvementSchema>;

/** RNG-free: observes an already committed trajectory, never hypothetical reach in open space. */
export const projectIncomingPlayerInvolvement = (
  state: TacticalMatchState,
  actorId: string,
): IncomingPlayerInvolvement => {
  const actor = state.players.find((player) => player.id === actorId);
  const remaining = (state.ball.travelDuration ?? 0) - (state.ball.travelElapsed ?? 0);
  const committed = Boolean(
    actor &&
      !state.ball.ownerId &&
      state.ball.target &&
      state.ball.travelDuration &&
      (state.ball.intendedReceiverId === actorId ||
        distance(actor.position, state.ball.target) <= 3),
  );
  const nearbyDefender = Boolean(
    actor &&
      state.ball.target &&
      state.players.some(
        (player) =>
          player.team !== actor.team && distance(player.position, state.ball.target!) <= 4,
      ),
  );
  const importantKind = ['through_ball', 'cross', 'long_distribution'].includes(
    state.ball.travelKind ?? '',
  );
  const attacking = Boolean(
    actor && fieldValue(state.ball.target ?? actor.position, actor.team) > 65,
  );
  const important = importantKind || nearbyDefender || attacking || (state.ball.height ?? 0) > 0.7;
  const relevant = committed && remaining >= 0.25 && remaining <= 1.25 && important;
  return incomingPlayerInvolvementSchema.parse({
    relevant,
    ...(committed ? { arrivalTime: Math.max(0, remaining) } : {}),
    important,
    reasons: [
      ...(importantKind ? [state.ball.travelKind!] : []),
      ...(nearbyDefender ? ['defender_competition'] : []),
      ...(attacking ? ['attacking_territory'] : []),
    ],
  });
};

export const passInterceptionOpportunitySchema = z.object({
  viable: z.boolean(),
  contactPoint: pitchPointSchema.optional(),
  distanceToPath: z.number().nonnegative().optional(),
  arrivalTime: z.number().nonnegative().optional(),
  structureRisk: z.number().min(0).max(1).optional(),
  playerArrival: playerArrivalEstimateSchema.optional(),
  arrivalMargin: z.number().optional(),
});
export const evaluatePassInterceptionOpportunity = (
  state: TacticalMatchState,
  defenderId: string,
) => {
  const defender = state.players.find((player) => player.id === defenderId);
  const relationship = deriveControlledBallRelationship(state, defenderId);
  const from = state.ball.from;
  const target = state.ball.target;
  if (
    relationship !== 'opponent_interceptor' ||
    !defender ||
    !from ||
    !target ||
    state.ball.ownerId ||
    !state.ball.travelDuration
  )
    return passInterceptionOpportunitySchema.parse({ viable: false });
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((defender.position.x - from.x) * dx + (defender.position.y - from.y) * dy) / lengthSquared,
    ),
  );
  const contactPoint = { x: from.x + dx * t, y: from.y + dy * t };
  const distanceToPath = distance(defender.position, contactPoint);
  const arrivalTime = Math.max(0, t * state.ball.travelDuration - (state.ball.travelElapsed ?? 0));
  const structureRisk = Math.min(1, distance(defender.anchor, contactPoint) / 18);
  const playerArrival = estimatePlayerArrivalTime(state, defender, contactPoint, 'intercept');
  const controlMargin = 0.12;
  const arrivalMargin = arrivalTime + controlMargin - playerArrival.estimatedTime;
  const competitive = arrivalMargin >= 0 && arrivalMargin <= 0.9;
  return passInterceptionOpportunitySchema.parse({
    viable: competitive && arrivalTime >= 0.2 && arrivalTime <= 1.3 && structureRisk < 0.85,
    contactPoint,
    distanceToPath,
    arrivalTime,
    structureRisk,
    playerArrival,
    arrivalMargin,
  });
};
export const deriveDecisionRole = (actor: TacticalMatchState['players'][number]): DecisionRole => {
  const position = actor.profile.primaryPosition;
  if (position === 'goalkeeper') return 'goalkeeper';
  if (position.includes('back') || position.includes('defender')) return 'defender';
  if (position.includes('midfielder')) return 'midfielder';
  return 'forward';
};
export const evaluateControlledPlayerBallRelevance = (
  state: TacticalMatchState,
  actorId: string,
): BallRelevance => {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor) return { relevant: false, trajectoryRelevant: false, reason: 'too_far' };
  const contenders = evaluateGlobalBallRace(state);
  const candidate = contenders.find((item) => item.playerId === actorId);
  const rank = contenders.findIndex((item) => item.playerId === actorId) + 1;
  const bestOverall = contenders[0];
  const bestTeammate = contenders.find((item) => item.team === actor.team);
  const bestOpponent = contenders.find((item) => item.team !== actor.team);
  const arrival = candidate?.estimatedArrivalTime ?? Infinity;
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const speed = Math.hypot(velocity.x, velocity.y);
  const ballArrivalTime = candidate?.ballArrivalTime;
  const trajectoryRelevant = Boolean(speed > 1 && candidate && candidate.timingDelta <= 0.45);
  const margin = speed > 9 ? 0.45 : 0.7;
  const competitive = Boolean(
    candidate && bestOverall && arrival <= bestOverall.estimatedArrivalTime + margin,
  );
  const teammateDominant = Boolean(
    candidate &&
      bestTeammate &&
      bestTeammate.playerId !== actorId &&
      arrival > bestTeammate.estimatedArrivalTime + 0.45,
  );
  const dominant = !competitive || teammateDominant;
  const rawDistance = distance(actor.position, state.ball);
  const relevant =
    !dominant &&
    Boolean(candidate) &&
    rawDistance <= 14 &&
    arrival <= 3 &&
    (rank <= 3 || trajectoryRelevant);
  return ballRelevanceSchema.parse({
    relevant,
    ...(candidate ? { estimatedArrivalTime: arrival, ballArrivalTime } : {}),
    ...(rank ? { contenderRank: rank } : {}),
    ...(candidate ? { actor: candidate } : {}),
    ...(bestOverall ? { bestOverall } : {}),
    ...(bestTeammate ? { bestTeammate } : {}),
    ...(bestOpponent ? { bestOpponent } : {}),
    trajectoryRelevant,
    reason: relevant
      ? trajectoryRelevant && arrival > 2.6
        ? 'trajectory_intersection'
        : arrival < 1
          ? 'direct_contest'
          : 'reachable_soon'
      : candidate && dominant
        ? 'other_player_dominant'
        : 'too_far',
  });
};

const actionLabel = (action: MatchAction) =>
  action.type === 'hold'
    ? 'hold'
    : action.type === 'carry'
      ? 'carry'
      : action.type === 'shot'
        ? `shot_${action.intent}`
        : action.type === 'cross'
          ? `cross_${action.intent}`
          : action.type === 'pass'
            ? `pass_${action.intent}`
            : `header_${action.intent}`;
const signatureFor = (state: TacticalMatchState, kind: string) => {
  const situation = evaluateMatchSituation(state, state.controlledFootballerId);
  const pressureBand = Math.floor((situation.context.pressure ?? 0) * 4);
  const territoryBand = Math.floor((situation.context.fieldProgress ?? 0) * 5);
  const possessionEvent = state.ballOwnershipStartedAt ?? 0;
  const episode = `${state.ball.ownerId ?? 'loose'}:${possessionEvent}:${state.teams[state.possessionTeam].phase}:${territoryBand}`;
  // Off-ball prompts are possession episodes, not timers. On-ball chains deliberately retain
  // decisionIndex so a completed carry can expose a genuinely new choice immediately.
  return kind === 'off_ball_run'
    ? `${kind}:${episode}`
    : `${kind}:${state.decisionIndex}:${episode}:${pressureBand}`;
};

export const movementOpportunityValueSchema = z.object({
  useful: z.boolean(),
  score: z.number(),
  passingAngleGain: z.number(),
  forwardGain: z.number(),
  spaceGain: z.number(),
  laneGain: z.number(),
});
export type MovementOpportunityValue = z.infer<typeof movementOpportunityValueSchema>;
export const evaluateMovementOpportunityValue = (
  state: TacticalMatchState,
  actorId: string,
  target: { x: number; y: number },
): MovementOpportunityValue => {
  const actor = state.players.find((p) => p.id === actorId),
    carrier = state.players.find((p) => p.id === state.ball.ownerId);
  if (!actor || !carrier)
    return {
      useful: false,
      score: 0,
      passingAngleGain: 0,
      forwardGain: 0,
      spaceGain: 0,
      laneGain: 0,
    };
  const foes = state.players.filter((p) => p.team !== actor.team);
  const clearance = (point: { x: number; y: number }) =>
    Math.min(...foes.map((p) => distance(point, p.position)), 30);
  const currentVector = Math.atan2(
      actor.position.y - carrier.position.y,
      actor.position.x - carrier.position.x,
    ),
    nextVector = Math.atan2(target.y - carrier.position.y, target.x - carrier.position.x);
  const passingAngleGain = Math.min(Math.PI, Math.abs(nextVector - currentVector));
  const forwardGain = Math.max(0, signedForwardDistance(target, actor.position, actor.team));
  const spaceGain = clearance(target) - clearance(actor.position);
  const laneGain =
    Math.abs(target.y - carrier.position.y) - Math.abs(actor.position.y - carrier.position.y);
  const displacement = distance(actor.position, target);
  const score =
    passingAngleGain * 8 +
    forwardGain * 0.8 +
    Math.max(0, spaceGain) * 1.2 +
    Math.max(0, laneGain) * 0.35;
  return movementOpportunityValueSchema.parse({
    useful: displacement >= 4 && score >= 6,
    score,
    passingAngleGain,
    forwardGain,
    spaceGain,
    laneGain,
  });
};

const projectDecision = (
  state: TacticalMatchState,
  suppliedGate?: PlayerDecisionGate,
): { probe: PlayerDecisionProbe; opportunity?: PlayerDecisionOpportunity } => {
  const gate = suppliedGate ?? state.playerDecisionGate ?? {};
  const actorId = state.controlledFootballerId;
  const actor = state.players.find((p) => p.id === actorId);
  const blocked = (blockedReason: PlayerDecisionProbe['blockedReason'], extra = {}) => ({
    probe: playerDecisionProbeSchema.parse({ actorId, candidate: false, blockedReason, ...extra }),
  });
  if (!actorId || !actor) return blocked('no_controlled_player');
  if (state.scenario !== 'open_play') return blocked('not_open_play');
  // A committed ball flight is precisely when reception/interception control may begin.
  if (isActionResolutionInProgress(state) && !state.ball.travelDuration)
    return blocked('resolution_in_progress');
  const situation = evaluateMatchSituation(state, actorId);
  const roleProfile = deriveDecisionRole(actor);
  const context: Partial<PlayerDecisionProbe> = {
    situationKind: situation.kind,
    decisionWorthiness: situation.decisionWorthiness,
    pressure: situation.context.pressure,
    roleProfile,
    possessionMismatch: Boolean(
      state.ball.ownerId &&
        state.players.find((player) => player.id === state.ball.ownerId)?.team !==
          state.possessionTeam,
    ),
  };
  const interceptionDiagnostic = !state.ball.ownerId
    ? evaluatePassInterceptionOpportunity(state, actorId)
    : undefined;
  if (interceptionDiagnostic?.contactPoint && interceptionDiagnostic.playerArrival) {
    context.interception = {
      interceptPoint: interceptionDiagnostic.contactPoint,
      ballArrivalTime: interceptionDiagnostic.arrivalTime ?? 0,
      playerArrivalTime: interceptionDiagnostic.playerArrival.estimatedTime,
      distanceToIntercept: interceptionDiagnostic.playerArrival.distance,
      initialPlayerSpeed: interceptionDiagnostic.playerArrival.initialSpeed,
      targetSpeed: interceptionDiagnostic.playerArrival.targetSpeed,
      turnAngle: interceptionDiagnostic.playerArrival.turnAngle,
      arrivalMargin: interceptionDiagnostic.arrivalMargin ?? 0,
    };
  }
  let kind: PlayerDecisionOpportunity['kind'] | undefined;
  let options: PlayerDecisionOption[] = [];
  if (state.ball.ownerId === actorId && evaluateOnBallDecisionRelevance(state, actorId).relevant) {
    kind = 'on_ball';
    options = enumerateAvailableActions(state, actorId).map((action, index) => ({
      id: `action-${index}`,
      kind: 'action' as const,
      labelKey: actionLabel(action),
      action,
    }));
  } else if (!state.ball.ownerId) {
    const incoming = projectIncomingPlayerInvolvement(state, actorId);
    const interception = evaluatePassInterceptionOpportunity(state, actorId);
    if (!state.pendingReceptionIntent && incoming.relevant) {
      kind = 'incoming_ball';
      const target = state.ball.target ?? actor.position;
      options = [
        {
          id: 'control',
          kind: 'action',
          labelKey: 'control_ball',
          action: { type: 'hold', actorId },
        },
        {
          id: 'first-touch',
          kind: 'action',
          labelKey: 'first_touch_into_space',
          action: {
            type: 'carry',
            actorId,
            target: clampPitchPoint({
              x: target.x + attackDirection(actor.team) * 6,
              y: target.y,
            }),
          },
        },
      ];
      const goal = { x: actor.team === 'home' ? 105 : 0, y: 34 };
      if (distance(target, goal) <= 24 && (state.ball.height ?? 0) <= 2.4)
        options.push({
          id: 'first-time-shot',
          kind: 'action',
          labelKey: 'shot_driven',
          action: { type: 'shot', actorId, target: goal, intent: 'driven' },
        });
    } else if (interception.viable && roleProfile !== 'goalkeeper') {
      kind = 'defensive_response';
      options = [
        {
          id: 'hold-line',
          kind: 'movement',
          labelKey: 'hold_line',
          intent: {
            actorId,
            type: 'hold_shape',
            target: actor.position,
            startedAt: state.time,
            expiresAt: state.time + 1.5,
          },
        },
        {
          id: 'intercept',
          kind: 'movement',
          labelKey: 'intercept',
          intent: {
            actorId,
            type: 'attack_space',
            target: interception.contactPoint!,
            startedAt: state.time,
            expiresAt: state.time + (interception.arrivalTime ?? 1),
          },
        },
      ];
    }
  } else if (state.ball.ownerId !== actorId) {
    const carrier = state.players.find((player) => player.id === state.ball.ownerId);
    const ownerTeam = carrier?.team;
    if (ownerTeam !== actor.team) {
      const metres = carrier ? distance(actor.position, carrier.position) : Infinity;
      const role = roleProfile;
      const ownGoal = { x: actor.team === 'home' ? 0 : 105, y: 34 };
      const keeperThreat =
        role === 'goalkeeper' && Boolean(carrier && distance(carrier.position, ownGoal) < 27);
      const threshold = keeperThreat
        ? 32
        : role === 'defender'
          ? 13
          : role === 'midfielder'
            ? 9
            : role === 'forward'
              ? 5.5
              : 0;
      if (carrier && metres <= Math.min(threshold, 4.5)) {
        kind = 'defensive_response';
        options = [
          {
            id: 'contain',
            kind: 'movement',
            labelKey: 'contain',
            intent: {
              actorId,
              type: 'hold_shape',
              target: actor.position,
              startedAt: state.time,
              expiresAt: state.time + 2,
            },
          },
          {
            id: 'challenge',
            kind: 'movement',
            labelKey: 'challenge',
            intent: {
              actorId,
              type: 'attack_space',
              target: carrier.position,
              startedAt: state.time,
              expiresAt: state.time + 1.5,
            },
          },
        ];
      }
    }
  }
  if (!kind) {
    const relationship = deriveControlledBallRelationship(state, actorId);
    return blocked(
      state.ball.ownerId === actorId
        ? 'routine'
        : relationship === 'intended_receiver' || relationship === 'friendly_possible_receiver'
          ? 'friendly_ball'
          : 'not_relevant',
      context,
    );
  }
  if (!options.length) return blocked('no_options', context);
  // A pause must expose a genuine choice. Single low-value prompts remain autonomous.
  if (options.length < 2) return blocked('no_options', context);
  const signature = signatureFor(state, kind);
  if (gate.lastSituationSignature === signature)
    return blocked('same_situation', { ...context, signature });
  const newPossessionEpisode =
    kind === 'on_ball' && (state.ballOwnershipStartedAt ?? -1) >= (gate.lastResolvedAt ?? Infinity);
  const postActionCheckpoint =
    kind === 'on_ball' && state.postActionAgencyCheckpoint?.actorId === actorId;
  const absoluteOwnershipRequired =
    kind === 'on_ball' &&
    options.some(
      (option) =>
        option.kind === 'action' &&
        (option.action.type === 'shot' || option.action.type === 'cross'),
    );
  if (
    !newPossessionEpisode &&
    !postActionCheckpoint &&
    !absoluteOwnershipRequired &&
    gate.lastResolvedAt !== undefined &&
    state.time - gate.lastResolvedAt < 1.5
  )
    return blocked('cooldown', { ...context, signature });
  const opportunity = playerDecisionOpportunitySchema.parse({
    id: `${actorId}:${state.decisionIndex}:${signature}`,
    actorId,
    openedAt: state.time,
    kind,
    triggerReason:
      kind === 'on_ball'
        ? evaluateOnBallDecisionRelevance(state, actorId).reasons.join(',') || situation.reasons[0]
        : kind === 'incoming_ball'
          ? projectIncomingPlayerInvolvement(state, actorId).reasons.join(',')
          : situation.reasons[0],
    signature,
    situation,
    options,
  });
  if (!projectSelectableInteractionTargets(state, opportunity).length)
    return blocked('no_contextual_interactions', { ...context, opportunityKind: kind, signature });
  return {
    opportunity,
    probe: playerDecisionProbeSchema.parse({
      actorId,
      candidate: true,
      opportunityKind: kind,
      signature,
      ...context,
    }),
  };
};

export const projectPlayerDecisionProbe = (state: TacticalMatchState, gate?: PlayerDecisionGate) =>
  projectDecision(state, gate).probe;

/** Pure, RNG-free projection. The gate is supplied explicitly; evaluator history stays outside it. */
export const projectPlayerDecisionOpportunity = (
  state: TacticalMatchState,
  gate?: PlayerDecisionGate,
): PlayerDecisionOpportunity | undefined => {
  return projectDecision(state, gate).opportunity;
};

export const applyPlayerDecision = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
  optionId: string,
) => {
  if (opportunity.actorId !== state.controlledFootballerId || opportunity.openedAt !== state.time)
    return state;
  if (state.playerDecisionGate?.lastSituationSignature === opportunity.signature) return state;
  const option = opportunity.options.find((candidate) => candidate.id === optionId);
  if (!option) return state;
  const gated = {
    ...state,
    pendingPlayerDecision: createPendingOutcome(state, opportunity, option),
    playerDecisionGate: {
      lastSituationSignature: opportunity.signature,
      lastResolvedAt: state.time,
    },
  };
  if (opportunity.kind === 'incoming_ball' && option.kind === 'action') {
    return {
      ...gated,
      pendingReceptionIntent: {
        actorId: opportunity.actorId,
        action: option.action,
        createdAt: state.time,
        expiresAt: state.time + 2,
        ballEpisode: `${state.ball.lastTouchPlayerId ?? 'unknown'}:${state.ball.travelKind ?? 'ball'}:${state.ball.travelDuration ?? 0}`,
        ...(state.ball.sourceAction ? { sourceAction: state.ball.sourceAction } : {}),
      },
    };
  }
  return option.kind === 'action'
    ? resolveMatchAction(gated, option.action, 'human_selected')
    : { ...gated, playerMovementIntent: option.intent };
};

export const createPendingOutcome = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
  selection: {
    id: string;
    action?: MatchAction;
    intent?: { type: string };
    target?: unknown;
    resolution?: { kind: string; action?: MatchAction; intent?: { type: string } };
  },
) => {
  const actor = state.players.find((player) => player.id === opportunity.actorId)!;
  const action = selection.action ?? selection.resolution?.action;
  const intent = action
    ? action.type === 'pass' ||
      action.type === 'shot' ||
      action.type === 'cross' ||
      action.type === 'header'
      ? `${action.type}:${action.intent}`
      : action.type
    : selection.intent
      ? selection.intent.type
      : (selection.resolution?.intent?.type ?? selection.id);
  return {
    decisionId: opportunity.id,
    actorId: opportunity.actorId,
    selectedAt: state.time,
    decisionKind: opportunity.kind,
    selectedIntent: intent,
    ...(selection.target !== undefined ? { selectedTarget: selection.target } : {}),
    startContext: {
      phase: state.teams[actor.team].phase,
      pressure: state.currentPressure,
      fieldProgress: fieldValue(actor.position, actor.team) / 100,
      possession: state.possessionTeam,
    },
  };
};
export const letAiDecide = (state: TacticalMatchState, opportunity: PlayerDecisionOpportunity) => {
  if (opportunity.kind !== 'on_ball') return state;
  const action = chooseNpcAction(state, opportunity.actorId);
  const gated = {
    ...state,
    playerDecisionGate: {
      lastSituationSignature: opportunity.signature,
      lastResolvedAt: state.time,
    },
  };
  return action ? resolveMatchAction(gated, action, 'dev_ai_selected') : gated;
};
