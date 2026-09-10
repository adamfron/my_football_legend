import { z } from 'zod';
import { enumerateAvailableActions, chooseNpcAction, resolveMatchAction } from './matchActions';
import { evaluateMatchSituation, matchSituationEvaluationSchema } from './matchSituationEvaluator';
import { clampPitchPoint, distance } from './matchSpace';
import {
  matchActionSchema,
  playerMovementIntentSchema,
  type MatchAction,
  type PlayerMovementIntent,
  type TacticalMatchState,
} from './matchState';
import { deriveLooseBallAssignments } from './looseBallPhysics';
import { isActionResolutionInProgress } from './actionLifecycle';

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
});
export type PlayerDecisionProbe = z.infer<typeof playerDecisionProbeSchema>;

export const decisionRoleSchema = z.enum(['goalkeeper', 'defender', 'midfielder', 'forward']);
export type DecisionRole = z.infer<typeof decisionRoleSchema>;
export const ballRelevanceSchema = z.object({
  relevant: z.boolean(),
  estimatedArrivalTime: z.number().optional(),
  ballArrivalTime: z.number().optional(),
  contenderRank: z.number().int().positive().optional(),
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
  const contenders = deriveLooseBallAssignments(state);
  const rank = contenders.findIndex((candidate) => candidate.playerId === actorId) + 1;
  const pace =
    5.4 + actor.profile.attributes.pace * 0.035 + actor.profile.attributes.agility * 0.012;
  const arrival = distance(actor.position, state.ball) / pace;
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const speed = Math.hypot(velocity.x, velocity.y);
  let closestTrajectory = distance(actor.position, state.ball),
    ballArrivalTime: number | undefined;
  for (let t = 0.25; t <= 3; t += 0.25) {
    const point = { x: state.ball.x + velocity.x * t, y: state.ball.y + velocity.y * t };
    const gap = distance(actor.position, point) - pace * t;
    if (gap < closestTrajectory) {
      closestTrajectory = gap;
      ballArrivalTime = t;
    }
  }
  const trajectoryRelevant = speed > 1 && closestTrajectory <= 2.5;
  const dominant = Boolean(rank > 2 && contenders[0] && contenders[0].score + 0.7 < arrival);
  const rawDistance = distance(actor.position, state.ball);
  const relevant =
    !dominant &&
    ((rank > 0 && rank <= 2 && arrival <= 2.6 && rawDistance <= 12) || trajectoryRelevant);
  return ballRelevanceSchema.parse({
    relevant,
    estimatedArrivalTime: arrival,
    ballArrivalTime,
    ...(rank ? { contenderRank: rank } : {}),
    trajectoryRelevant,
    reason: relevant
      ? trajectoryRelevant && arrival > 2.6
        ? 'trajectory_intersection'
        : arrival < 1
          ? 'direct_contest'
          : 'reachable_soon'
      : dominant
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
  return `${kind}:${state.decisionIndex}:${state.ball.ownerId ?? 'loose'}:${possessionEvent}:${state.teams[state.possessionTeam].phase}:${pressureBand}:${territoryBand}`;
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
  };
  let kind: PlayerDecisionOpportunity['kind'] | undefined;
  let options: PlayerDecisionOption[] = [];
  if (state.ball.ownerId === actorId && situation.decisionEligible) {
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
    if (roleProfile !== 'goalkeeper' && relevance.relevant) {
      kind = 'loose_ball';
      const duration = Math.min(2.5, distance(actor.position, state.ball) / 5.5);
      const intent: PlayerMovementIntent = {
        actorId,
        type: 'attack_space',
        target: clampPitchPoint(state.ball),
        startedAt: state.time,
        expiresAt: state.time + duration,
      };
      options = [{ id: 'attack-ball', kind: 'movement', labelKey: 'attack_ball', intent }];
    }
  } else if (state.ball.ownerId !== actorId && actor.team !== state.possessionTeam) {
    const carrier = state.players.find((player) => player.id === state.ball.ownerId);
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
          id: 'defensive-target',
          kind: 'movement',
          labelKey: 'defend_carrier',
          intent: {
            actorId,
            type: 'hold_shape',
            target: actor.position,
            startedAt: state.time,
            expiresAt: state.time + 2,
          },
        },
      ];
    }
  } else if (
    state.ball.ownerId !== actorId &&
    actor.team === state.possessionTeam &&
    distance(actor.position, state.ball) < 32 &&
    (state.teams[actor.team].phase === 'attacking_transition' ||
      situation.context.fieldProgress! > 0.48)
  ) {
    kind = 'off_ball_run';
    const direction = actor.team === 'home' ? 1 : -1;
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
    options = targets.map(([type, target]) => ({
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
  if (!kind) return blocked(state.ball.ownerId === actorId ? 'routine' : 'not_relevant', context);
  if (!options.length) return blocked('no_options', context);
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
    triggerReason: situation.reasons[0],
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
    playerDecisionGate: {
      lastSituationSignature: opportunity.signature,
      lastResolvedAt: state.time,
    },
  };
  return option.kind === 'action'
    ? resolveMatchAction(gated, option.action)
    : { ...gated, playerMovementIntent: option.intent };
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
