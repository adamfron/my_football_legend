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
  signedForwardDistance,
} from './matchSpace';
import {
  matchActionSchema,
  playerMovementIntentSchema,
  type MatchAction,
  type PlayerMovementIntent,
  type TacticalMatchState,
} from './matchState';
import { evaluateGlobalBallRace, ballRaceCandidateSchema } from './looseBallPhysics';
import { isActionResolutionInProgress } from './actionLifecycle';
import { evaluateActionImpact } from './actionImpact';

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
  kind: z.enum(['on_ball', 'off_ball_run', 'defensive_response', 'loose_ball']),
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
    ])
    .optional(),
  situationKind: z.string().optional(),
  decisionWorthiness: z.number().optional(),
  pressure: z.number().optional(),
  signature: z.string().optional(),
  roleProfile: z.enum(['goalkeeper', 'defender', 'midfielder', 'forward']).optional(),
  ballRelevance: z.unknown().optional(),
  possessionMismatch: z.boolean().optional(),
});
export type PlayerDecisionProbe = z.infer<typeof playerDecisionProbeSchema>;

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
  if (preferredImpact === 'high_impact' && hasAlternative) reasons.push('autopilot_escalation');
  return onBallDecisionRelevanceSchema.parse({
    relevant:
      (preferredImpact === 'high_impact' && hasAlternative) ||
      situation.decisionEligible ||
      (score >= 0.58 && families.length >= 2 && progressive),
    score,
    reasons,
    viableFamilies: families,
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

const isOffBallAttackRelevant = (
  state: TacticalMatchState,
  actor: TacticalMatchState['players'][number],
  carrier: TacticalMatchState['players'][number],
) => {
  const phase = state.teams[actor.team].phase;
  if (phase === 'defensive_block' || phase === 'defensive_transition') return false;
  const actorDepth = fieldValue(actor.position, actor.team) / 100;
  const ballDepth = fieldValue(carrier.position, actor.team) / 100;
  const relationship = distance(actor.position, carrier.position);
  const transitionProgress = signedForwardDistance(actor.position, carrier.position, actor.team);
  const role = deriveDecisionRole(actor);
  if (role === 'forward') {
    if (ballDepth < 0.36 || actorDepth < 0.28 || relationship > 30) return false;
    if (phase === 'attacking_transition' && transitionProgress < -24) return false;
    return actorDepth > 0.43 || ballDepth > 0.46;
  }
  return relationship < 32 && (phase === 'attacking_transition' || ballDepth > 0.4);
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
  if (isActionResolutionInProgress(state)) return blocked('resolution_in_progress');
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
    const relevance = evaluateControlledPlayerBallRelevance(state, actorId);
    context.ballRelevance = relevance;
    const competitiveOpponent = Boolean(
      relevance.actor &&
        relevance.bestOpponent &&
        Math.abs(
          relevance.actor.estimatedArrivalTime - relevance.bestOpponent.estimatedArrivalTime,
        ) <= 1,
    );
    const immediateCorridor = Boolean(
      relevance.trajectoryRelevant && distance(actor.position, state.ball) <= 7,
    );
    const directContest =
      distance(actor.position, state.ball) <= 3 &&
      state.players.some(
        (player) => player.team !== actor.team && distance(player.position, state.ball) <= 3,
      );
    if (
      roleProfile !== 'goalkeeper' &&
      ((relevance.relevant &&
        (competitiveOpponent || immediateCorridor) &&
        ((relevance.contenderRank ?? 99) <= 2 || immediateCorridor)) ||
        directContest)
    ) {
      kind = 'loose_ball';
      const duration = Math.min(2.5, distance(actor.position, state.ball) / 5.5);
      const intent: PlayerMovementIntent = {
        actorId,
        type: 'attack_space',
        target: clampPitchPoint(state.ball),
        startedAt: state.time,
        expiresAt: state.time + duration,
      };
      options = [
        { id: 'attack-ball', kind: 'movement', labelKey: 'attack_ball', intent },
        {
          id: 'protect-space',
          kind: 'movement',
          labelKey: 'hold_shape',
          intent: {
            actorId,
            type: 'hold_shape',
            target: actor.position,
            startedAt: state.time,
            expiresAt: state.time + 1.5,
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
      if (carrier && metres <= threshold) {
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
            id: 'press',
            kind: 'movement',
            labelKey: 'press',
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
    } else if (carrier && isOffBallAttackRelevant(state, actor, carrier)) {
      kind = 'off_ball_run';
      const direction = attackDirection(actor.team);
      const targets = [
        ['come_short', { x: actor.position.x - direction * 7, y: actor.position.y }],
        [
          'support',
          {
            x: actor.position.x + direction * 3,
            y: actor.position.y + (actor.position.y < 34 ? 7 : -7),
          },
        ],
        ['run_in_behind', { x: actor.position.x + direction * 14, y: actor.position.y }],
      ] as const;
      options = targets
        .filter(
          ([, target]) =>
            evaluateMovementOpportunityValue(state, actor.id, clampPitchPoint(target)).useful,
        )
        .map(([type, target]) => ({
          id: type,
          kind: 'movement' as const,
          labelKey: type,
          intent: {
            actorId,
            type,
            target: clampPitchPoint(target),
            startedAt: state.time,
            expiresAt: state.time + 2.2,
          },
        }));
    }
  }
  if (!kind) return blocked(state.ball.ownerId === actorId ? 'routine' : 'not_relevant', context);
  if (!options.length) return blocked('no_options', context);
  // A pause must expose a genuine choice. Single low-value prompts remain autonomous.
  if (options.length < 2) return blocked('no_options', context);
  const signature = signatureFor(state, kind);
  if (gate.lastSituationSignature === signature)
    return blocked('same_situation', { ...context, signature });
  if (gate.lastResolvedAt !== undefined && state.time - gate.lastResolvedAt < 1.5)
    return blocked('cooldown', { ...context, signature });
  const opportunity = playerDecisionOpportunitySchema.parse({
    id: `${actorId}:${state.decisionIndex}:${signature}`,
    actorId,
    openedAt: state.time,
    kind,
    triggerReason:
      kind === 'on_ball'
        ? evaluateOnBallDecisionRelevance(state, actorId).reasons.join(',') || situation.reasons[0]
        : kind === 'off_ball_run'
          ? 'movement_value'
          : situation.reasons[0],
    signature,
    situation,
    options,
  });
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
  return option.kind === 'action'
    ? resolveMatchAction(gated, option.action)
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
  return action ? resolveMatchAction(gated, action) : gated;
};
