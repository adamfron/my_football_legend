import { z } from 'zod';
import { enumerateAvailableActions } from './matchActions';
import {
  attackDirection,
  distance,
  fieldValue,
  pitchPointSchema,
  signedForwardDistance,
  teamSideSchema,
  type PitchPoint,
} from './matchSpace';
import {
  matchActionSchema,
  playerDefensiveIntentSchema,
  playerMovementIntentSchema,
  type MatchPlayerState,
  type TacticalMatchState,
} from './matchState';
import { resolveMatchAction } from './matchActions';
import type { PlayerDecisionOpportunity } from './playerDecision';
import { createPendingOutcome, deriveDecisionRole } from './playerDecision';
import { secondLastOpponentLine } from './offside';

export const playerInteractionTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), playerId: z.string() }),
  z.object({ kind: z.literal('space'), point: pitchPointSchema }),
  z.object({ kind: z.literal('ball'), point: pitchPointSchema }),
  z.object({ kind: z.literal('goal'), side: teamSideSchema }),
]);
export type PlayerInteractionTarget = z.infer<typeof playerInteractionTargetSchema>;
export const contextualInteractionSchema = z.object({
  id: z.string(),
  target: playerInteractionTargetSchema,
  labelKey: z.string(),
  resolution: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('action'), action: matchActionSchema }),
    z.object({ kind: z.literal('movement'), intent: playerMovementIntentSchema }),
    z.object({ kind: z.literal('defensive'), intent: playerDefensiveIntentSchema }),
  ]),
});
export type ContextualInteraction = z.infer<typeof contextualInteractionSchema>;

const passLabel = (intent: string) =>
  intent === 'through'
    ? 'pass_into_space'
    : intent === 'progressive'
      ? 'progressive_pass'
      : 'pass_to_feet';
const shotLabel = (intent: string) =>
  intent === 'placed' ? 'placed_shot' : intent === 'chip' ? 'chip_shot' : 'driven_shot';
const asActions = (
  target: PlayerInteractionTarget,
  actions: ReturnType<typeof enumerateAvailableActions>,
) =>
  actions.map((action, index) =>
    contextualInteractionSchema.parse({
      id: `action:${action.type}:${index}`,
      target,
      labelKey:
        action.type === 'pass'
          ? passLabel(action.intent)
          : action.type === 'shot'
            ? shotLabel(action.intent)
            : action.type === 'cross'
              ? 'cross'
              : action.type === 'hold'
                ? 'hold_ball'
                : 'carry_here',
      resolution: { kind: 'action', action },
    }),
  );

/** Pure, RNG-free menu projection. UI and renderer only identify a world target. */
export const projectContextualInteractions = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
  target: PlayerInteractionTarget,
): ContextualInteraction[] => {
  if (opportunity.actorId !== state.controlledFootballerId) return [];
  const actor = state.players.find((player) => player.id === opportunity.actorId);
  if (!actor) return [];
  if (opportunity.kind === 'incoming_ball') {
    const incomingActions = opportunity.options.flatMap((option) =>
      option.kind === 'action' ? [option.action] : [],
    );
    if (target.kind === 'goal')
      return target.side === actor.team
        ? []
        : asActions(
            target,
            incomingActions.filter((action) => action.type === 'shot'),
          );
    if (target.kind === 'space')
      return asActions(
        target,
        incomingActions
          .filter((action) => action.type === 'carry')
          .map((action) =>
            action.type === 'carry' ? { ...action, target: target.point } : action,
          ),
      );
    if (
      target.kind === 'ball' ||
      (target.kind === 'player' && target.playerId === opportunity.actorId)
    )
      return asActions(
        target,
        incomingActions.filter((action) => action.type === 'hold'),
      );
    return [];
  }
  const actions = enumerateAvailableActions(state, actor.id);
  if (target.kind === 'goal') {
    if (target.side === actor.team) return [];
    return asActions(
      target,
      actions.filter((action) => action.type === 'shot'),
    );
  }
  if (target.kind === 'player') {
    if (target.playerId === actor.id)
      return asActions(
        target,
        actions.filter((action) => action.type === 'hold'),
      );
    const selected = state.players.find((player) => player.id === target.playerId);
    if (!selected) return [];
    if (selected.team === actor.team)
      return asActions(
        target,
        actions.filter(
          (action) =>
            (action.type === 'pass' && action.receiverId === selected.id) ||
            (action.type === 'cross' && action.intendedTargetId === selected.id),
        ),
      );
    if (state.ball.ownerId !== selected.id || actor.team === state.possessionTeam) return [];
    if (opportunity.kind === 'goalkeeper_response')
      return opportunity.options.flatMap((option) =>
        option.kind === 'movement'
          ? [
              contextualInteractionSchema.parse({
                id: option.id,
                target,
                labelKey: option.labelKey,
                resolution: { kind: 'movement', intent: option.intent },
              }),
            ]
          : [],
      );
    const metres = distance(actor.position, selected.position);
    return (['contain', ...(metres <= 2.4 ? ['challenge'] : [])] as const).map((type) =>
      contextualInteractionSchema.parse({
        id: `defensive:${type}:${selected.id}`,
        target,
        labelKey: type,
        resolution: {
          kind: 'defensive',
          intent: {
            actorId: actor.id,
            opponentId: selected.id,
            type,
            startedAt: state.time,
            expiresAt: state.time + 2.2,
          },
        },
      }),
    );
  }
  const point = target.point;
  if (
    (opportunity.kind === 'defensive_response' || opportunity.kind === 'goalkeeper_response') &&
    !state.ball.ownerId &&
    target.kind === 'ball'
  ) {
    return opportunity.options.flatMap((option) =>
      option.kind === 'movement'
        ? [
            contextualInteractionSchema.parse({
              id: option.id,
              target,
              labelKey: option.labelKey,
              resolution: { kind: 'movement', intent: option.intent },
            }),
          ]
        : [],
    );
  }
  if (opportunity.kind === 'loose_ball' && target.kind === 'ball') {
    return opportunity.options.flatMap((option) =>
      option.kind === 'movement'
        ? [
            contextualInteractionSchema.parse({
              id: option.id,
              target,
              labelKey: 'attack_ball',
              resolution: { kind: 'movement', intent: option.intent },
            }),
          ]
        : [],
    );
  }
  if (target.kind !== 'space') return [];
  if (state.ball.ownerId === actor.id && distance(actor.position, point) <= 15) {
    const carry = { type: 'carry' as const, actorId: actor.id, target: point };
    const projected = asActions(target, [carry]);
    const runner = bestRunnerForSpace(state, actor, point);
    if (runner) {
      const through = actions.find(
        (action) =>
          action.type === 'pass' && action.intent === 'through' && action.receiverId === runner.id,
      );
      if (through?.type === 'pass')
        projected.push(...asActions(target, [{ ...through, target: point }]));
    }
    return projected;
  }
  if (
    state.ball.ownerId &&
    state.players.find((player) => player.id === state.ball.ownerId)?.team === actor.team &&
    isMeaningfulOffBallSpace(state, actor, point)
  ) {
    const line = secondLastOpponentLine(state, actor.team);
    const threatensLine = signedForwardDistance({ x: line, y: point.y }, point, actor.team) >= -2;
    const type =
      signedForwardDistance(actor.position, point, actor.team) > 4 && threatensLine
        ? 'run_in_behind'
        : 'attack_space';
    return [
      contextualInteractionSchema.parse({
        id: `movement:${type}`,
        target,
        labelKey: type === 'run_in_behind' ? 'run_in_behind' : 'move_here',
        resolution: {
          kind: 'movement',
          intent: {
            actorId: actor.id,
            type,
            target: point,
            startedAt: state.time,
            expiresAt: state.time + 2.2,
          },
        },
      }),
    ];
  }
  return [];
};

const isMeaningfulOffBallSpace = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  point: PitchPoint,
) => {
  if (distance(actor.position, point) > 22) return false;
  const carrier = state.players.find((player) => player.id === state.ball.ownerId);
  if (!carrier || carrier.team !== actor.team) return false;
  const forward = signedForwardDistance(actor.position, point, actor.team);
  const role = deriveDecisionRole(actor);
  const ballDepth = fieldValue(carrier.position, actor.team) / 100;
  const pointDepth = fieldValue(point, actor.team) / 100;
  if (role === 'forward' && (ballDepth < 0.35 || pointDepth < 0.3 || forward < -5)) return false;
  const supportLane = distance(point, carrier.position) <= 18 && forward >= -5;
  const line = secondLastOpponentLine(state, actor.team);
  const lineThreat =
    forward > 0 && signedForwardDistance({ x: line, y: point.y }, point, actor.team) >= -6;
  const width = Math.abs(point.y - 34) > 16 && forward >= -2;
  return supportLane || lineThreat || width;
};

const bestRunnerForSpace = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  point: PitchPoint,
) =>
  state.players
    .filter(
      (player) =>
        player.team === actor.team &&
        player.id !== actor.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )
    .map((player) => ({
      player,
      score: distance(player.target, point) + distance(player.position, point) * 0.45,
    }))
    .filter(
      ({ player, score }) =>
        score < 24 && (actor.team === 'home' ? player.position.x < 105 : player.position.x > 0),
    )
    .sort((a, b) => a.score - b.score)[0]?.player;

/** Applies the already-projected intention through canonical action/movement mechanics. */
export const applyContextualInteraction = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
  interaction: ContextualInteraction,
): TacticalMatchState => {
  if (opportunity.actorId !== state.controlledFootballerId || opportunity.openedAt !== state.time)
    return state;
  const gated = {
    ...state,
    pendingPlayerDecision: createPendingOutcome(state, opportunity, interaction),
    playerDecisionGate: {
      lastSituationSignature: opportunity.signature,
      lastResolvedAt: state.time,
    },
  };
  const resolution = interaction.resolution;
  if (opportunity.kind === 'incoming_ball' && resolution.kind === 'action')
    return {
      ...gated,
      pendingReceptionIntent: {
        actorId: opportunity.actorId,
        action: resolution.action,
        createdAt: state.time,
        expiresAt: state.time + 2,
        ballEpisode: `${state.ball.lastTouchPlayerId ?? 'unknown'}:${state.ball.travelKind ?? 'ball'}:${state.ball.travelDuration ?? 0}`,
        ...(state.ball.sourceAction ? { sourceAction: state.ball.sourceAction } : {}),
      },
    };
  if (resolution.kind === 'action')
    return resolveMatchAction(gated, resolution.action, 'human_selected');
  if (resolution.kind === 'movement')
    if (
      resolution.intent.type === 'run_in_behind' &&
      signedForwardDistance(
        state.players.find((player) => player.id === resolution.intent.actorId)!.position,
        resolution.intent.target,
        state.players.find((player) => player.id === resolution.intent.actorId)!.team,
      ) <= 0
    )
      return state;
  if (resolution.kind === 'movement')
    return {
      ...gated,
      playerMovementIntent: resolution.intent,
      decisionIndex: state.decisionIndex + 1,
    };
  const opponent = state.players.find((player) => player.id === resolution.intent.opponentId);
  const actor = state.players.find((player) => player.id === resolution.intent.actorId);
  if (!opponent || !actor) return state;
  const target =
    resolution.intent.type === 'contain'
      ? { x: actor.position.x - attackDirection(actor.team) * 1.5, y: actor.position.y }
      : opponent.position;
  return {
    ...gated,
    decisionIndex: state.decisionIndex + 1,
    playerMovementIntent: {
      actorId: actor.id,
      type: resolution.intent.type === 'contain' ? 'hold_shape' : 'attack_space',
      target,
      startedAt: state.time,
      expiresAt: resolution.intent.expiresAt,
    },
  };
};
