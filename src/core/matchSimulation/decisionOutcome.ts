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
  if (
    state.restart?.selectedAction &&
    state.restart.phase !== 'release' &&
    state.restart.takerId === pending.actorId
  )
    return state;
  const actor = state.players.find((player) => player.id === pending.actorId);
  const challenge = state.lastChallenge;
  if (!actor && !challenge) return state;
  const actorTeam = actor?.team ?? state.discipline?.[pending.actorId]?.team;
  const owner = state.players.find((player) => player.id === state.ball.ownerId);
  const elapsed = state.time - pending.selectedAt;
  const intent = pending.selectedIntent;
  const lostAtRestart = Boolean(
    actorTeam &&
      state.lastRestartAward?.origin === 'live_event' &&
      state.lastRestartAward.at >= pending.selectedAt &&
      state.lastRestartAward.team !== actorTeam,
  );
  // A one-touch receiver may immediately start another flight. Resolve the spatial intention
  // from its actual canonical delivery result rather than attributing that later ball ownership.
  const spatialResult =
    intent === 'space_pass'
      ? [state.lastResolvedPass, state.lastPassDiagnostic].find(
          (pass) =>
            pass &&
            pass.passerId === pending.actorId &&
            pass.releasedAt >= pending.selectedAt &&
            pass.finalResult !== undefined &&
            pass.resolvedAt !== undefined,
        )
      : undefined;
  let result: NonNullable<PlayerDecisionOutcome['result']> | undefined;
  if (
    intent.startsWith('challenge:') &&
    challenge?.actorId === pending.actorId &&
    challenge.at >= pending.selectedAt
  ) {
    const won = challenge.outcome === 'clean_win';
    result = {
      kind: 'defensive_action_resolved',
      duelWon: won,
      duelLost: !won,
      teamRetainedPossession: owner?.team === actorTeam,
    };
  } else if (intent.startsWith('challenge:')) return state;
  else if (
    (intent.startsWith('shot:') || intent === 'header:header_shot') &&
    state.lastShot &&
    state.lastShot.shooterId === pending.actorId &&
    (state.lastShot.releasedAt ?? -1) >= pending.selectedAt &&
    !state.ball.shot
  )
    result = { kind: 'shot_resolved', shotOutcome: state.lastShot.outcome };
  else if (
    spatialResult ||
    ((intent.startsWith('pass:') || intent === 'space_pass') &&
      !state.ball.travelKind &&
      elapsed > 0.2)
  ) {
    const completed = spatialResult
      ? spatialResult.finalResult === 'completed'
      : Boolean(owner && owner.team === actorTeam && owner.id !== pending.actorId);
    result = {
      kind: completed ? 'pass_completed' : 'pass_failed',
      passCompleted: completed,
      teamRetainedPossession: owner
        ? owner.team === actorTeam
        : completed && state.possessionTeam === actorTeam,
      turnover: Boolean(owner && owner.team !== actorTeam) || lostAtRestart,
    };
  } else if (intent === 'carry' && elapsed > 0.35 && !state.ballCarrierIntent) {
    const retained = state.ball.ownerId === pending.actorId;
    result = {
      kind: retained ? 'carry_completed' : 'carry_lost',
      retainedPossession: retained,
      teamRetainedPossession: owner?.team === actorTeam,
      turnover: Boolean(owner && owner.team !== actorTeam),
      progressDelta: actor
        ? fieldValue(actor.position, actor.team) / 100 - pending.startContext.fieldProgress
        : 0,
    };
  } else if (
    (pending.decisionKind === 'defensive_response' || pending.decisionKind === 'loose_ball') &&
    (owner || elapsed >= 2.3)
  ) {
    const won = owner?.team === actorTeam;
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
      teamRetainedPossession: owner?.team === actorTeam,
      progressDelta: actor
        ? fieldValue(actor.position, actor.team) / 100 - pending.startContext.fieldProgress
        : 0,
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
