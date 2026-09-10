import { fieldValue } from './matchSpace';
import {
  playerDecisionOutcomeSchema,
  type PlayerDecisionOutcome,
  type TacticalMatchState,
} from './matchState';

/** Resolves only immediate, observable consequences; autonomous actions never create this record. */
export const resolvePendingPlayerDecision = (state: TacticalMatchState): TacticalMatchState => {
  const pending = state.pendingPlayerDecision;
  if (!pending || pending.result) return state;
  const actor = state.players.find((player) => player.id === pending.actorId);
  if (!actor) return state;
  const owner = state.players.find((player) => player.id === state.ball.ownerId);
  const elapsed = state.time - pending.selectedAt;
  const intent = pending.selectedIntent;
  let result: NonNullable<PlayerDecisionOutcome['result']> | undefined;
  if (intent.startsWith('shot:') && state.lastShot && state.lastShot.shooterId === actor.id)
    result = { kind: 'shot_resolved', shotOutcome: state.lastShot.outcome };
  else if (intent.startsWith('pass:') && !state.ball.travelDuration && elapsed > 0.2) {
    const completed = owner?.team === actor.team && owner.id !== actor.id;
    result = {
      kind: completed ? 'pass_completed' : 'pass_failed',
      passCompleted: completed,
      teamRetainedPossession: owner?.team === actor.team,
      turnover: Boolean(owner && owner.team !== actor.team),
    };
  } else if (intent === 'carry' && elapsed > 0.35 && !state.ballCarrierIntent) {
    const retained = state.ball.ownerId === actor.id;
    result = {
      kind: retained ? 'carry_completed' : 'carry_lost',
      retainedPossession: retained,
      teamRetainedPossession: owner?.team === actor.team,
      turnover: Boolean(owner && owner.team !== actor.team),
      progressDelta:
        fieldValue(actor.position, actor.team) / 100 - pending.startContext.fieldProgress,
    };
  } else if (
    (pending.decisionKind === 'defensive_response' || pending.decisionKind === 'loose_ball') &&
    (owner || elapsed >= 2.3)
  ) {
    const won = owner?.team === actor.team;
    result = {
      kind:
        pending.decisionKind === 'loose_ball' ? 'loose_ball_resolved' : 'defensive_action_resolved',
      duelWon: won,
      duelLost: Boolean(owner && !won),
      teamRetainedPossession: won,
    };
  } else if (pending.decisionKind === 'off_ball_run' && elapsed >= 2.2) {
    result = {
      kind: 'movement_completed',
      teamRetainedPossession: owner?.team === actor.team,
      progressDelta:
        fieldValue(actor.position, actor.team) / 100 - pending.startContext.fieldProgress,
    };
  }
  if (!result) return state;
  const outcome = playerDecisionOutcomeSchema.parse({
    ...pending,
    resolvedAt: state.time,
    result,
  });
  const { pendingPlayerDecision: _pending, ...withoutPending } = state;
  void _pending;
  return { ...withoutPending, lastPlayerDecisionOutcome: outcome };
};
