import { z } from 'zod';
import { distance } from './matchSpace';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import type { TacticalMatchState } from './matchState';
import {
  derivePlayerSupportMetrics,
  deriveTeamShapeMetrics,
  playerSupportMetricsSchema,
  teamShapeMetricsSchema,
} from './teamShapeMetrics';

export const positioningSampleSchema = z.object({
  time: z.number().nonnegative(),
  phases: z.object({ home: z.string(), away: z.string() }),
  ball: z.object({ x: z.number(), y: z.number(), ownerId: z.string().optional() }),
  home: teamShapeMetricsSchema,
  away: teamShapeMetricsSchema,
  carrierSupport: playerSupportMetricsSchema.optional(),
});
export type PositioningSample = z.infer<typeof positioningSampleSchema>;

export const sampleCanonicalPositioning = (state: TacticalMatchState): PositioningSample =>
  positioningSampleSchema.parse({
    time: state.time,
    phases: { home: state.teams.home.phase, away: state.teams.away.phase },
    ball: { x: state.ball.x, y: state.ball.y, ownerId: state.ball.ownerId },
    home: deriveTeamShapeMetrics(state, 'home'),
    away: deriveTeamShapeMetrics(state, 'away'),
    ...(state.ball.ownerId
      ? { carrierSupport: derivePlayerSupportMetrics(state, state.ball.ownerId) }
      : {}),
  });

const passEdgeSchema = z.object({
  passerId: z.string(),
  receiverId: z.string(),
  attempted: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});
export const matchFlowTelemetrySchema = z.object({
  canonicalMinutes: z.number().nonnegative(),
  goals: z.number().int().nonnegative(),
  shots: z.number().int().nonnegative(),
  shotsOnTarget: z.number().int().nonnegative(),
  shotsBlocked: z.number().int().nonnegative(),
  shotDistances: z.array(z.number().nonnegative()),
  longShots: z.number().int().nonnegative(),
  longShotGoals: z.number().int().nonnegative(),
  shootingOpportunityValues: z.array(z.number().min(0).max(1)),
  saves: z.number().int().nonnegative(),
  failedSaves: z.number().int().nonnegative(),
  possessionChanges: z.number().int().nonnegative(),
  passesAttempted: z.number().int().nonnegative(),
  passesCompleted: z.number().int().nonnegative(),
  throughBalls: z.number().int().nonnegative(),
  passesToStationaryReceiver: z.number().int().nonnegative(),
  passesToMovingReceiver: z.number().int().nonnegative(),
  movingReceiverCompletions: z.number().int().nonnegative(),
  movingReceiverFailures: z.number().int().nonnegative(),
  averageLeadDistance: z.number().nonnegative(),
  averageReceiverDisplacementDuringFlight: z.number().nonnegative(),
  receptions: z.object({
    clean: z.number().int().nonnegative(),
    directional: z.number().int().nonnegative(),
    heavy: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  interceptionCauses: z.object({
    lane_read: z.number().int().nonnegative(),
    receiver_late: z.number().int().nonnegative(),
    technical_error: z.number().int().nonnegative(),
  }),
  carries: z.number().int().nonnegative(),
  controlled: z.object({
    touches: z.number().int().nonnegative(),
    passesReceived: z.number().int().nonnegative(),
    passesAttempted: z.number().int().nonnegative(),
    shots: z.number().int().nonnegative(),
    carries: z.number().int().nonnegative(),
    decisionOpportunities: z.record(z.string(), z.number().int().nonnegative()),
    humanSelectedActions: z.number().int().nonnegative(),
    devAiSelections: z.number().int().nonnegative(),
    autonomousRoutineActions: z.number().int().nonnegative(),
    preventedByEscalation: z.number().int().nonnegative(),
    autonomousDiagnostics: z.object({
      loose_ball_autonomous: z.number().int().nonnegative(),
      off_ball_movement_autonomous: z.number().int().nonnegative(),
      routine_reception_autonomous: z.number().int().nonnegative(),
    }),
    majorActionSources: z.object({
      shots: z.object({
        human: z.number().int().nonnegative(),
        autonomous: z.number().int().nonnegative(),
      }),
      crosses: z.object({
        human: z.number().int().nonnegative(),
        autonomous: z.number().int().nonnegative(),
      }),
      highImpactActions: z.object({
        human: z.number().int().nonnegative(),
        autonomous: z.number().int().nonnegative(),
      }),
    }),
  }),
  passingNetwork: z.array(passEdgeSchema),
});
export type MatchFlowTelemetry = z.infer<typeof matchFlowTelemetrySchema>;

export const createMatchFlowTelemetry = (): MatchFlowTelemetry =>
  matchFlowTelemetrySchema.parse({
    canonicalMinutes: 0,
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    shotsBlocked: 0,
    shotDistances: [],
    longShots: 0,
    longShotGoals: 0,
    shootingOpportunityValues: [],
    saves: 0,
    failedSaves: 0,
    possessionChanges: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    throughBalls: 0,
    passesToStationaryReceiver: 0,
    passesToMovingReceiver: 0,
    movingReceiverCompletions: 0,
    movingReceiverFailures: 0,
    averageLeadDistance: 0,
    averageReceiverDisplacementDuringFlight: 0,
    receptions: { clean: 0, directional: 0, heavy: 0, failed: 0 },
    interceptionCauses: { lane_read: 0, receiver_late: 0, technical_error: 0 },
    carries: 0,
    controlled: {
      touches: 0,
      passesReceived: 0,
      passesAttempted: 0,
      shots: 0,
      carries: 0,
      decisionOpportunities: {},
      humanSelectedActions: 0,
      devAiSelections: 0,
      autonomousRoutineActions: 0,
      preventedByEscalation: 0,
      autonomousDiagnostics: {
        loose_ball_autonomous: 0,
        off_ball_movement_autonomous: 0,
        routine_reception_autonomous: 0,
      },
      majorActionSources: {
        shots: { human: 0, autonomous: 0 },
        crosses: { human: 0, autonomous: 0 },
        highImpactActions: { human: 0, autonomous: 0 },
      },
    },
    passingNetwork: [],
  });

export const recordDecisionOpportunity = (
  telemetry: MatchFlowTelemetry,
  kind: 'on_ball' | 'incoming_ball' | 'off_ball_run' | 'loose_ball' | 'defensive_response',
  preventedByEscalation = false,
) => {
  telemetry.controlled.decisionOpportunities[kind] =
    (telemetry.controlled.decisionOpportunities[kind] ?? 0) + 1;
  if (preventedByEscalation) telemetry.controlled.preventedByEscalation++;
};

export const recordDecisionSelection = (
  telemetry: MatchFlowTelemetry,
  source: 'human' | 'dev_ai' | 'autonomous',
) => {
  if (source === 'human') telemetry.controlled.humanSelectedActions++;
  else if (source === 'dev_ai') telemetry.controlled.devAiSelections++;
  else telemetry.controlled.autonomousRoutineActions++;
};

/** Observes two snapshots without consuming RNG or feeding statistics back into play. */
export const observeMatchFlow = (
  telemetry: MatchFlowTelemetry,
  previous: TacticalMatchState,
  next: TacticalMatchState,
): MatchFlowTelemetry => {
  const result = structuredClone(telemetry);
  result.canonicalMinutes = next.time / 60;
  if (previous.possessionTeam !== next.possessionTeam) result.possessionChanges++;
  const action = next.latestAction;
  const newAction =
    action && (previous.latestAction !== action || previous.decisionIndex !== next.decisionIndex);
  if (newAction && action.actorId === next.controlledFootballerId) {
    const human = Boolean(
      next.pendingPlayerDecision?.actorId === action.actorId ||
        previous.pendingReceptionIntent?.actorId === action.actorId,
    );
    const source = human ? 'human' : 'autonomous';
    if (action.type === 'shot') result.controlled.majorActionSources.shots[source]++;
    if (action.type === 'cross') result.controlled.majorActionSources.crosses[source]++;
    if (['shot', 'cross'].includes(action.type))
      result.controlled.majorActionSources.highImpactActions[source]++;
  }
  if (newAction && action.type === 'carry') {
    result.carries++;
    if (action.actorId === next.controlledFootballerId) result.controlled.carries++;
  }
  if (newAction && action.type === 'pass') {
    result.passesAttempted++;
    if (action.intent === 'through') result.throughBalls++;
    if (action.actorId === next.controlledFootballerId) result.controlled.passesAttempted++;
    const diagnostic = next.lastPassDiagnostic;
    if (diagnostic?.intendedReceiverId === action.receiverId) {
      const moving =
        Math.hypot(diagnostic.receiverVelocityAtRelease.x, diagnostic.receiverVelocityAtRelease.y) >
        0.5;
      if (moving) result.passesToMovingReceiver++;
      else result.passesToStationaryReceiver++;
      result.averageLeadDistance +=
        (diagnostic.leadDistance - result.averageLeadDistance) / result.passesAttempted;
    }
    const edge = result.passingNetwork.find(
      (item) => item.passerId === action.actorId && item.receiverId === action.receiverId,
    );
    if (edge) edge.attempted++;
    else
      result.passingNetwork.push({
        passerId: action.actorId,
        receiverId: action.receiverId,
        attempted: 1,
        completed: 0,
      });
  }
  const ownershipReceived =
    next.ball.ownerId !== previous.ball.ownerId ? next.ball.ownerId : undefined;
  if (ownershipReceived && ownershipReceived === next.controlledFootballerId)
    result.controlled.touches++;
  if (
    ownershipReceived &&
    previous.latestAction?.type === 'pass' &&
    previous.latestAction.receiverId === ownershipReceived
  ) {
    result.passesCompleted++;
    const edge = result.passingNetwork.find(
      (item) =>
        item.passerId === previous.latestAction!.actorId && item.receiverId === ownershipReceived,
    );
    if (edge) edge.completed++;
    if (ownershipReceived === next.controlledFootballerId) result.controlled.passesReceived++;
    if (
      previous.lastPassDiagnostic &&
      Math.hypot(
        previous.lastPassDiagnostic.receiverVelocityAtRelease.x,
        previous.lastPassDiagnostic.receiverVelocityAtRelease.y,
      ) > 0.5
    )
      result.movingReceiverCompletions++;
  }
  if (
    next.lastPassDiagnostic !== previous.lastPassDiagnostic &&
    next.lastPassDiagnostic?.finalResult
  ) {
    const diagnostic = next.lastPassDiagnostic;
    if (
      Math.hypot(diagnostic.receiverVelocityAtRelease.x, diagnostic.receiverVelocityAtRelease.y) >
        0.5 &&
      diagnostic.finalResult !== 'completed'
    )
      result.movingReceiverFailures++;
    if (diagnostic.actualContactPoint)
      result.averageReceiverDisplacementDuringFlight +=
        (distance(diagnostic.receiverPositionAtRelease, diagnostic.actualContactPoint) -
          result.averageReceiverDisplacementDuringFlight) /
        Math.max(1, result.passesCompleted + result.movingReceiverFailures);
    if (diagnostic.receptionOutcome === 'clean_control') result.receptions.clean++;
    else if (diagnostic.receptionOutcome === 'directional_control') result.receptions.directional++;
    else if (diagnostic.receptionOutcome === 'heavy_touch') result.receptions.heavy++;
    else if (diagnostic.receptionOutcome === 'failed_control') result.receptions.failed++;
    if (diagnostic.finalResult === 'technical_error') result.interceptionCauses.technical_error++;
    else if (diagnostic.finalResult === 'intercepted')
      result.interceptionCauses[
        diagnostic.receiverArrivalEstimate > diagnostic.bestDefenderArrivalEstimate
          ? 'receiver_late'
          : 'lane_read'
      ]++;
  }
  if (next.lastShot !== previous.lastShot && next.lastShot) {
    const shot = next.lastShot,
      shooter = next.players.find((player) => player.id === shot.shooterId);
    result.shots++;
    const metres = shooter
      ? distance(shooter.position, { x: shooter.team === 'home' ? 105 : 0, y: 34 })
      : 0;
    result.shotDistances.push(metres);
    if (metres >= 30) result.longShots++;
    if (shot.outcome === 'goal') {
      result.goals++;
      if (metres >= 30) result.longShotGoals++;
    }
    if (['goal', 'save', 'post', 'crossbar'].includes(shot.outcome)) result.shotsOnTarget++;
    if (shot.outcome === 'block') result.shotsBlocked++;
    if (shot.outcome === 'save') result.saves++;
    if (shot.goalkeeperAction === 'failed_save') result.failedSaves++;
    if (shooter)
      result.shootingOpportunityValues.push(evaluateShootingOpportunity(previous, shooter).value);
    if (shot.shooterId === next.controlledFootballerId) result.controlled.shots++;
  }
  return matchFlowTelemetrySchema.parse(result);
};

export const summarizeShotDistances = (telemetry: MatchFlowTelemetry) => {
  const sorted = [...telemetry.shotDistances].sort((a, b) => a - b),
    length = sorted.length;
  return {
    average: length ? sorted.reduce((sum, value) => sum + value, 0) / length : 0,
    median: length
      ? (sorted[Math.floor((length - 1) / 2)]! + sorted[Math.floor(length / 2)]!) / 2
      : 0,
  };
};
