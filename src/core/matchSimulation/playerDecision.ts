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
});
export type PlayerDecisionProbe = z.infer<typeof playerDecisionProbeSchema>;

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
  return `${kind}:${state.ball.ownerId ?? 'loose'}:${possessionEvent}:${state.teams[state.possessionTeam].phase}:${pressureBand}:${territoryBand}`;
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
  const context = {
    situationKind: situation.kind,
    decisionWorthiness: situation.decisionWorthiness,
    pressure: situation.context.pressure,
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
    const contenders = deriveLooseBallAssignments(state).slice(0, 4);
    if (contenders.some((candidate) => candidate.playerId === actorId)) {
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
