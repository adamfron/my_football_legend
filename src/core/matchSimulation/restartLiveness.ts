import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { isHumanControlled } from './actionAgency';
import { isRestartSetup } from './restartPhase';
import { distance } from './matchSpace';
import { substitutionBlocksRestart } from './substitutions';
import { haltEvidence } from './matchSafety';
import {
  deriveRestartLegalReadiness,
  legalizeRestartPlayerTarget,
  restartPenaltyGoalkeeper,
} from './restartLaws';

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const transition = z.object({
  at: z.number().nonnegative(),
  phase: z.string(),
  retrievalStage: z.string(),
});
export const restartBlockingObservationSchema = z.object({
  signature: z.string(),
  since: z.number().nonnegative(),
  sampledAt: z.number().nonnegative(),
  lastProgressAt: z.number().nonnegative(),
  remainingPhysicalDistance: z.number().nonnegative(),
  progressDistance: z.number().nonnegative().optional(),
  lastDiagnosticAt: z.number().nonnegative().optional(),
  awardId: z.string().optional(),
  transitions: z.array(transition).max(12).optional(),
});
export type RestartBlockingObservation = z.infer<typeof restartBlockingObservationSchema>;
export const restartBlockingDiagnosticSchema = z.object({
  at: z.number().nonnegative(),
  unchangedSeconds: z.number().nonnegative(),
  progressAbsentSeconds: z.number().nonnegative(),
  classification: z.enum(['soft_lock', 'slow_preparation', 'pending_human_decision']),
  awardId: z.string(),
  phase: z.string(),
  origin: z.string(),
  blockers: z.array(z.string()).max(48),
  progressOwner: z
    .enum(['human', 'substitution', 'retrieval', 'positioning', 'missing_lifecycle'])
    .optional(),
  pendingSubstitutionIds: z.array(z.string()).max(30).optional(),
  retrievalStage: z.string(),
  spot: point,
  ball: point.extend({ height: z.number(), velocity: point.extend({ z: z.number() }) }),
  takerId: z.string(),
  keeperId: z.string().optional(),
  selectedActionType: z.string().optional(),
  selectedSource: z.string().optional(),
  preparationStartedAt: z.number().optional(),
  retrieverId: z.string().optional(),
  legalReady: z.boolean().optional(),
  tacticalReady: z.boolean().optional(),
  transitions: z.array(transition).max(12).optional(),
  selectedAction: z
    .object({
      type: z.string(),
      actorId: z.string(),
      receiverId: z.string().optional(),
      target: point.optional(),
    })
    .optional(),
  actors: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        position: point,
        velocity: point,
        legalTarget: point,
        assignedTarget: point.optional(),
        targetDistance: z.number().nonnegative().optional(),
        nearestBodyId: z.string().optional(),
        minimumBodySeparation: z.number().nonnegative().optional(),
      }),
    )
    .max(24),
});
export type RestartBlockingDiagnostic = z.infer<typeof restartBlockingDiagnosticSchema>;

/** Bounded 1 Hz observer. A diagnostic never changes a participant, decision or restart law. */
export const observeRestartLiveness = (state: TacticalMatchState): TacticalMatchState => {
  if (!isRestartSetup(state)) {
    if (!state.restartBlockingObservation) return state;
    const { restartBlockingObservation: _finished, ...next } = state;
    void _finished;
    return next;
  }
  const restart = state.restart;
  const humanPending =
    !restart.selectedAction &&
    restart.humanPreparation !== 'waiting_team' &&
    state.scenario !== 'throw_in' &&
    isHumanControlled(state, restart.takerId) &&
    deriveRestartLegalReadiness(state).ready;
  const substitutionPending = substitutionBlocksRestart(state);
  const progressOwner = humanPending
    ? ('human' as const)
    : substitutionPending
      ? ('substitution' as const)
      : restart.retrieval && restart.retrieval.stage !== 'placed'
        ? ('retrieval' as const)
        : restart.origin === 'live_event' && !restart.retrieval
          ? ('missing_lifecycle' as const)
          : ('positioning' as const);
  const blockers = humanPending
    ? ['pending_human_decision']
    : substitutionPending
      ? ['substitution_in_progress']
      : progressOwner === 'missing_lifecycle'
        ? ['missing_retrieval_state']
        : (restart.readiness?.blockers ?? ['readiness_not_observed']);
  const signature = [
    restart.awardId,
    restart.phase,
    restart.retrieval?.stage,
    restart.takerId,
    restart.selectedAction?.type,
    restart.selectedSource,
    ...(state.substitutionState?.pending ?? []).map(
      (p) => `${p.id}:${p.leftAt ?? 'departing'}:${p.refereeEntryAt ?? 'waiting_entry'}`,
    ),
    ...[...blockers].sort(),
  ].join(':');
  const previous = state.restartBlockingObservation;
  if (previous?.signature === signature && state.time - previous.sampledAt < 1) return state;
  const spot = restart.spot ?? state.ball;
  const awardId = restart.awardId ?? `${state.seed}:restart:${restart.startedAt}`;
  const latestTransition = {
    at: state.time,
    phase: restart.phase,
    retrievalStage: restart.retrieval?.stage ?? 'not_started',
  };
  const history = previous?.awardId === awardId ? (previous.transitions ?? []) : [];
  const lastTransition = history.at(-1);
  const transitions =
    lastTransition?.phase === latestTransition.phase &&
    lastTransition.retrievalStage === latestTransition.retrievalStage
      ? history
      : [...history, latestTransition].slice(-12);
  const actors = state.players.slice(0, 24).map((player) => {
    const nearest = state.players
      .filter((p) => p.id !== player.id)
      .map((p) => ({ id: p.id, gap: distance(p.position, player.position) }))
      .sort((a, b) => a.gap - b.gap)[0];
    return {
      id: player.id,
      role: restart.roles[player.id]?.key ?? 'unassigned',
      position: { ...player.position },
      velocity: { ...player.velocity },
      legalTarget: legalizeRestartPlayerTarget(state, player, player.target),
      assignedTarget: { ...player.target },
      targetDistance: distance(player.position, player.target),
      nearestBodyId: nearest?.id,
      minimumBodySeparation: nearest?.gap,
    };
  });
  const remainingPhysicalDistance = substitutionPending
    ? (state.substitutionState?.pending ?? []).reduce(
        (sum, p) =>
          sum +
          (p.leftAt === undefined ? distance(p.outgoing.position, p.exitTarget) : 0) +
          Math.max(0, 0.2 - p.entryPosition.y),
        0,
      )
    : distance(state.ball, spot) +
      actors.reduce(
        (sum, actor) =>
          sum +
          distance(
            actor.position,
            legalizeRestartPlayerTarget(
              state,
              state.players.find((p) => p.id === actor.id)!,
              restart.targets[actor.id] ?? actor.legalTarget,
            ),
          ),
        0,
      );
  const progressed =
    previous?.signature !== signature ||
    (previous.progressDistance ?? previous.remainingPhysicalDistance) - remainingPhysicalDistance >
      0.1;
  let observation: RestartBlockingObservation = {
    signature,
    since: previous?.signature === signature ? previous.since : state.time,
    sampledAt: state.time,
    lastProgressAt: progressed ? state.time : previous.lastProgressAt,
    progressDistance: progressed
      ? remainingPhysicalDistance
      : (previous.progressDistance ?? previous.remainingPhysicalDistance),
    remainingPhysicalDistance,
    awardId,
    transitions,
    ...(previous?.signature === signature && previous.lastDiagnosticAt !== undefined
      ? { lastDiagnosticAt: previous.lastDiagnosticAt }
      : {}),
  };
  if (
    state.time - observation.since < 30 ||
    state.time - (observation.lastDiagnosticAt ?? observation.since) < 30
  )
    return { ...state, restartBlockingObservation: observation };
  const classification = humanPending
    ? 'pending_human_decision'
    : state.time - observation.lastProgressAt >= 10
      ? 'soft_lock'
      : 'slow_preparation';
  const diagnostic: RestartBlockingDiagnostic = {
    at: state.time,
    unchangedSeconds: state.time - observation.since,
    progressAbsentSeconds: state.time - observation.lastProgressAt,
    classification,
    awardId,
    phase: restart.phase,
    origin: restart.origin ?? 'legacy_fixture',
    blockers,
    progressOwner,
    pendingSubstitutionIds: (state.substitutionState?.pending ?? []).map((p) => p.id),
    retrievalStage: restart.retrieval?.stage ?? 'not_started',
    spot,
    ball: {
      x: state.ball.x,
      y: state.ball.y,
      height: state.ball.height ?? 0,
      velocity: {
        x: state.ball.velocity?.x ?? 0,
        y: state.ball.velocity?.y ?? 0,
        z: state.ball.velocity?.z ?? 0,
      },
    },
    takerId: restart.takerId,
    keeperId: restartPenaltyGoalkeeper(state)?.id,
    selectedActionType: restart.selectedAction?.type,
    selectedSource: restart.selectedSource,
    preparationStartedAt: restart.preparationStartedAt,
    retrieverId: restart.retrieval?.playerId,
    legalReady: deriveRestartLegalReadiness(state).ready,
    tacticalReady: restart.readiness?.tacticalReady ?? false,
    transitions,
    ...(restart.selectedAction
      ? {
          selectedAction: {
            type: restart.selectedAction.type,
            actorId: restart.selectedAction.actorId,
            ...('target' in restart.selectedAction
              ? { target: { ...restart.selectedAction.target } }
              : {}),
            ...('receiverId' in restart.selectedAction
              ? { receiverId: restart.selectedAction.receiverId }
              : 'intendedTargetId' in restart.selectedAction
                ? { receiverId: restart.selectedAction.intendedTargetId }
                : {}),
          },
        }
      : {}),
    actors,
  };
  observation = { ...observation, lastDiagnosticAt: state.time };
  return {
    ...state,
    ...(classification === 'soft_lock' &&
    state.experimentalPlayerBodyImpulse === 'upright-cluster-dev-v1'
      ? {
          safetyHalt: haltEvidence(
            state,
            'restart_lifecycle',
            progressOwner === 'missing_lifecycle'
              ? 'missing_retrieval_state'
              : progressOwner === 'substitution'
                ? 'substitution_entry_not_progressing'
                : (blockers[0] ?? 'restart_physical_progress_absent'),
          ),
        }
      : {}),
    restartBlockingObservation: observation,
    restartLivenessDiagnostics: [...(state.restartLivenessDiagnostics ?? []), diagnostic].slice(
      -32,
    ),
  };
};
