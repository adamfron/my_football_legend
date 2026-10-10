import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { isHumanControlled } from './actionAgency';
import { isRestartSetup } from './restartPhase';
import { distance } from './matchSpace';
import {
  deriveRestartLegalReadiness,
  legalizeRestartPlayerTarget,
  restartPenaltyGoalkeeper,
} from './restartLaws';

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
export const restartBlockingObservationSchema = z.object({
  signature: z.string(),
  since: z.number().nonnegative(),
  sampledAt: z.number().nonnegative(),
  lastProgressAt: z.number().nonnegative(),
  remainingPhysicalDistance: z.number().nonnegative(),
  lastDiagnosticAt: z.number().nonnegative().optional(),
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
  retrievalStage: z.string(),
  spot: point,
  ball: point.extend({ height: z.number(), velocity: point.extend({ z: z.number() }) }),
  takerId: z.string(),
  keeperId: z.string().optional(),
  selectedActionType: z.string().optional(),
  selectedSource: z.string().optional(),
  preparationStartedAt: z.number().optional(),
  actors: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        position: point,
        velocity: point,
        legalTarget: point,
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
    state.scenario !== 'throw_in' &&
    isHumanControlled(state, restart.takerId) &&
    deriveRestartLegalReadiness(state).ready;
  const blockers = humanPending
    ? ['pending_human_decision']
    : (restart.readiness?.blockers ?? ['readiness_not_observed']);
  const signature = [
    restart.awardId,
    restart.phase,
    restart.retrieval?.stage,
    restart.takerId,
    restart.selectedAction?.type,
    restart.selectedSource,
    ...[...blockers].sort(),
  ].join(':');
  const previous = state.restartBlockingObservation;
  if (previous?.signature === signature && state.time - previous.sampledAt < 1) return state;
  const spot = restart.spot ?? state.ball;
  const actors = state.players.slice(0, 24).map((player) => ({
    id: player.id,
    role: restart.roles[player.id]?.key ?? 'unassigned',
    position: { ...player.position },
    velocity: { ...player.velocity },
    legalTarget: legalizeRestartPlayerTarget(state, player, player.target),
  }));
  const remainingPhysicalDistance =
    distance(state.ball, spot) +
    actors.reduce((sum, actor) => sum + distance(actor.position, actor.legalTarget), 0);
  let observation: RestartBlockingObservation = {
    signature,
    since: previous?.signature === signature ? previous.since : state.time,
    sampledAt: state.time,
    lastProgressAt:
      previous?.signature !== signature ||
      previous.remainingPhysicalDistance - remainingPhysicalDistance > 0.1
        ? state.time
        : previous.lastProgressAt,
    remainingPhysicalDistance,
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
    awardId: restart.awardId ?? `${state.seed}:restart:${restart.startedAt}`,
    phase: restart.phase,
    origin: restart.origin ?? 'legacy_fixture',
    blockers,
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
    actors,
  };
  observation = { ...observation, lastDiagnosticAt: state.time };
  return {
    ...state,
    restartBlockingObservation: observation,
    restartLivenessDiagnostics: [...(state.restartLivenessDiagnostics ?? []), diagnostic].slice(
      -32,
    ),
  };
};
