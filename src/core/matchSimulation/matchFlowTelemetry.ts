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
  noChanceGoals: z.number().int().nonnegative(),
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
  leadDistanceSamples: z.number().int().nonnegative(),
  receiverDisplacementSamples: z.number().int().nonnegative(),
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
  observedPassAttemptIds: z.array(z.string()),
  observedPassResultIds: z.array(z.string()),
  observedShotIds: z.array(z.string()),
  observedMajorActionIds: z.array(z.string()),
  shotDiagnostics: z.array(z.custom<NonNullable<TacticalMatchState['lastShot']>>()),
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
    noChanceGoals: 0,
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
    leadDistanceSamples: 0,
    receiverDisplacementSamples: 0,
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
    observedPassAttemptIds: [],
    observedPassResultIds: [],
    observedShotIds: [],
    observedMajorActionIds: [],
    shotDiagnostics: [],
  });

export const recordDecisionOpportunity = (
  telemetry: MatchFlowTelemetry,
  kind:
    | 'on_ball'
    | 'incoming_ball'
    | 'off_ball_run'
    | 'loose_ball'
    | 'defensive_response'
    | 'goalkeeper_response',
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
  const actionEpisodeId = action
    ? `${next.seed}:${next.decisionIndex}:${action.actorId}:${action.type}`
    : undefined;
  if (
    action &&
    actionEpisodeId &&
    !result.observedMajorActionIds.includes(actionEpisodeId) &&
    action.actorId === next.controlledFootballerId
  ) {
    result.observedMajorActionIds.push(actionEpisodeId);
    const human = next.latestActionSource === 'human_selected';
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
  const releasedPass = next.lastPassDiagnostic;
  if (releasedPass && !result.observedPassAttemptIds.includes(releasedPass.passId)) {
    result.observedPassAttemptIds.push(releasedPass.passId);
    result.passesAttempted++;
    if (newAction && action.type === 'pass' && action.intent === 'through') result.throughBalls++;
    if (releasedPass.passerId === next.controlledFootballerId) result.controlled.passesAttempted++;
    const diagnostic = releasedPass;
    {
      const moving =
        Math.hypot(diagnostic.receiverVelocityAtRelease.x, diagnostic.receiverVelocityAtRelease.y) >
        0.5;
      if (moving) result.passesToMovingReceiver++;
      else result.passesToStationaryReceiver++;
      result.leadDistanceSamples++;
      result.averageLeadDistance +=
        (diagnostic.leadDistance - result.averageLeadDistance) / result.leadDistanceSamples;
    }
    const edge = result.passingNetwork.find(
      (item) =>
        item.passerId === releasedPass.passerId &&
        item.receiverId === releasedPass.intendedReceiverId,
    );
    if (edge) edge.attempted++;
    else
      result.passingNetwork.push({
        passerId: releasedPass.passerId,
        receiverId: releasedPass.intendedReceiverId,
        attempted: 1,
        completed: 0,
      });
  }
  const ownershipReceived =
    next.ball.ownerId !== previous.ball.ownerId ? next.ball.ownerId : undefined;
  if (ownershipReceived && ownershipReceived === next.controlledFootballerId)
    result.controlled.touches++;
  if (
    next.lastPassDiagnostic?.finalResult &&
    !result.observedPassResultIds.includes(next.lastPassDiagnostic.passId)
  ) {
    const diagnostic = next.lastPassDiagnostic;
    result.observedPassResultIds.push(diagnostic.passId);
    if (diagnostic.finalResult === 'completed') {
      result.passesCompleted++;
      const edge = result.passingNetwork.find(
        (item) =>
          item.passerId === diagnostic.passerId &&
          item.receiverId === diagnostic.intendedReceiverId,
      );
      if (edge) edge.completed++;
      if (diagnostic.intendedReceiverId === next.controlledFootballerId)
        result.controlled.passesReceived++;
    }
    const moving =
      Math.hypot(diagnostic.receiverVelocityAtRelease.x, diagnostic.receiverVelocityAtRelease.y) >
      0.5;
    if (moving && diagnostic.finalResult === 'completed') result.movingReceiverCompletions++;
    else if (moving) result.movingReceiverFailures++;
    if (diagnostic.actualContactPoint) {
      result.receiverDisplacementSamples++;
      result.averageReceiverDisplacementDuringFlight +=
        (distance(diagnostic.receiverPositionAtRelease, diagnostic.actualContactPoint) -
          result.averageReceiverDisplacementDuringFlight) /
        result.receiverDisplacementSamples;
    }
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
  if (next.lastShot && !result.observedShotIds.includes(next.lastShot.shotId)) {
    const shot = next.lastShot,
      shooter = next.players.find((player) => player.id === shot.shooterId);
    result.observedShotIds.push(shot.shotId);
    result.shotDiagnostics.push(shot);
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
    if (shot.goalkeeperAction === 'no_chance' && shot.outcome === 'goal') result.noChanceGoals++;
    if (shooter)
      result.shootingOpportunityValues.push(
        evaluateShootingOpportunity(previous, shooter).effectiveScoringExpectation,
      );
    if (shot.shooterId === next.controlledFootballerId) result.controlled.shots++;
  }
  assertTelemetryInvariants(result);
  return matchFlowTelemetrySchema.parse(result);
};

export const assertTelemetryInvariants = (telemetry: MatchFlowTelemetry) => {
  if (telemetry.passesCompleted > telemetry.passesAttempted)
    throw new Error('Telemetry invariant failed: completed passes exceed attempts.');
  if (
    telemetry.movingReceiverCompletions + telemetry.movingReceiverFailures >
    telemetry.passesToMovingReceiver
  )
    throw new Error('Telemetry invariant failed: moving pass results exceed attempts.');
  for (const edge of telemetry.passingNetwork)
    if (edge.completed > edge.attempted)
      throw new Error(`Telemetry invariant failed for passing edge ${edge.passerId}.`);
};

export const summarizeMatchFlowRates = (telemetry: MatchFlowTelemetry) => {
  const minutes = Math.max(telemetry.canonicalMinutes, 1 / 60);
  return {
    passesPerCanonicalMinute: telemetry.passesAttempted / minutes,
    shotsPer90Equivalent: (telemetry.shots / minutes) * 90,
    goalsPer90Equivalent: (telemetry.goals / minutes) * 90,
    possessionChangesPerMinute: telemetry.possessionChanges / minutes,
    averagePossessionEpisodeDuration:
      telemetry.possessionChanges > 0 ? (minutes * 60) / telemetry.possessionChanges : minutes * 60,
    averageTimeBetweenActions:
      telemetry.passesAttempted + telemetry.shots + telemetry.carries > 0
        ? (minutes * 60) / (telemetry.passesAttempted + telemetry.shots + telemetry.carries)
        : 0,
  };
};

export const summarizeShootingBuckets = (telemetry: MatchFlowTelemetry) => {
  const ranges = [
    ['0–10 m', 0, 10],
    ['10–16 m', 10, 16],
    ['16–22 m', 16, 22],
    ['22–30 m', 22, 30],
    ['30–35 m', 30, 35],
    ['35+ m', 35, Infinity],
  ] as const;
  return ranges.map(([label, low, high]) => {
    const shots = telemetry.shotDiagnostics.filter(
      (shot) => shot.distance >= low && shot.distance < high,
    );
    return {
      label,
      attempts: shots.length,
      onTarget: shots.filter((shot) => ['goal', 'save', 'post', 'crossbar'].includes(shot.outcome))
        .length,
      goals: shots.filter((shot) => shot.outcome === 'goal').length,
      blocks: shots.filter((shot) => shot.outcome === 'block').length,
      averageBaseXg: shots.length
        ? shots.reduce((sum, shot) => sum + shot.baseXg, 0) / shots.length
        : 0,
      averageEffectiveExpectation: shots.length
        ? shots.reduce((sum, shot) => sum + shot.effectiveScoringExpectation, 0) / shots.length
        : 0,
    };
  });
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
