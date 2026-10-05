import { z } from 'zod';
import { emptyTurnoverCauseCounts, turnoverCauseCountsSchema } from './possessionEvents';
import { distance } from './matchSpace';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { shotDiagnosticSchema, type TacticalMatchState } from './matchState';
import { shotContactSchema } from './shotIntent';
import { deriveFlankRelationship, deriveFlankRunAssignments } from './tacticalPositioning';
import {
  MATCH_PRESENTATION_POLICIES,
  projectMatchMoment,
  shouldSurfaceMatchMoment,
} from './matchMoment';
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

const passEdgeSchema = z
  .object({
    passerId: z.string(),
    receiverId: z.string(),
    attempted: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  })
  .superRefine((edge, context) => {
    if (edge.completed > edge.attempted)
      context.addIssue({ code: 'custom', message: 'Passing network completions exceed attempts.' });
    if (edge.passerId === edge.receiverId)
      context.addIssue({ code: 'custom', message: 'Passing network contains a self edge.' });
  });
const thirdSchema = z.enum(['defensive', 'middle', 'final']);
const actionTempoSampleSchema = z.object({
  team: z.enum(['home', 'away']),
  third: thirdSchema,
  phase: z.string(),
  kind: z.enum(['team_action', 'pass']),
  interval: z.number().nonnegative(),
});
const ballHoldDiagnosticSchema = z.object({
  playerId: z.string(),
  duration: z.number().nonnegative(),
  third: thirdSchema,
  pressureBand: z.enum(['low', 'medium', 'high']),
  role: z.string(),
  phase: z.string(),
  terminalAction: z.string(),
});
const passOutcomeDiagnosticSchema = z.object({
  passId: z.string(),
  intent: z.enum(['support', 'progressive', 'direct', 'lead', 'through']),
  originThird: thirdSchema,
  length: z.number().nonnegative(),
  pressure: z.number().min(0).max(1),
  defenderEtaAdvantage: z.number(),
  outcome: z.enum([
    'completed',
    'intercepted',
    'bad_pass',
    'failed_reception',
    'out_of_play',
    'unclaimed',
    'technical_error',
  ]),
});
const possessionSpellDiagnosticSchema = z.object({
  team: z.enum(['home', 'away']),
  startedAt: z.number().nonnegative(),
  endedAt: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  startThird: thirdSchema,
  endThird: thirdSchema,
  startPhase: z.string(),
  endPhase: z.string(),
  passesAttempted: z.number().int().nonnegative(),
  passesCompleted: z.number().int().nonnegative(),
  carries: z.number().int().nonnegative(),
  maxFieldProgress: z.number(),
  turnoverCause: z.string().optional(),
});
export const matchFlowTelemetrySchema = z.object({
  benchmarkRunId: z.string().min(1),
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
  turnoverCauses: turnoverCauseCountsSchema,
  restartAwards: z.number().int().nonnegative().default(0),
  possessionSpellDurations: z.array(z.number().nonnegative()),
  possessionSpells: z.array(possessionSpellDiagnosticSchema),
  actionTempoSamples: z.array(actionTempoSampleSchema),
  ballHolds: z.array(ballHoldDiagnosticSchema),
  passOutcomes: z.array(passOutcomeDiagnosticSchema),
  observerState: z.object({
    spellStartedAt: z.number(),
    spellStartThird: thirdSchema,
    spellStartPhase: z.string(),
    spellPassAttempts: z.number().int(),
    spellPassCompletions: z.number().int(),
    spellCarries: z.number().int(),
    maxProgress: z.number(),
    lastActionAt: z.number().optional(),
    lastPassAt: z.number().optional(),
    activeFlankEpisodes: z.array(z.string()),
  }),
  microSpellsUnder0_5s: z.number().int().nonnegative(),
  adjacentTickPossessionFlips: z.number().int().nonnegative(),
  backwardPasses: z.number().int().nonnegative(),
  lateralPasses: z.number().int().nonnegative(),
  progressivePasses: z.number().int().nonnegative(),
  passesAttempted: z.number().int().nonnegative(),
  passesCompleted: z.number().int().nonnegative(),
  throughBalls: z.number().int().nonnegative(),
  passesOutOfPlay: z.number().int().nonnegative(),
  widePassesOutOfPlay: z.number().int().nonnegative(),
  overlapPassAttempts: z.number().int().nonnegative(),
  overlapPassCompleted: z.number().int().nonnegative(),
  overlapPassOutOfPlay: z.number().int().nonnegative(),
  overlapRunsStarted: z.number().int().nonnegative(),
  underlapRunsStarted: z.number().int().nonnegative(),
  provideWidthEpisodes: z.number().int().nonnegative(),
  shortWideCombinations: z.number().int().nonnegative(),
  channelReleases: z.number().int().nonnegative(),
  finalThirdEntries: z.number().int().nonnegative(),
  finalThirdPossessionSeconds: z.number().nonnegative(),
  boxEntries: z.number().int().nonnegative(),
  boxTouches: z.number().int().nonnegative(),
  boxOccupationEpisodes: z.number().int().nonnegative(),
  nearPostOccupationEpisodes: z.number().int().nonnegative(),
  penaltySpotOccupationEpisodes: z.number().int().nonnegative(),
  farPostOccupationEpisodes: z.number().int().nonnegative(),
  edgeSupportEpisodes: z.number().int().nonnegative(),
  crossesFromAdvancedWideArea: z.number().int().nonnegative(),
  cutbacks: z.number().int().nonnegative(),
  crossAttempts: z.number().int().nonnegative(),
  floatedCrosses: z.number().int().nonnegative(),
  drivenCrosses: z.number().int().nonnegative(),
  occupiedCrossTargets: z.number().int().nonnegative(),
  threatFlow: z.object({
    progressiveReceptions: z.number().int().nonnegative(),
    resultingFinalThirdEntries: z.number().int().nonnegative(),
    resultingBoxEntries: z.number().int().nonnegative(),
    resultingShots: z.number().int().nonnegative(),
  }),
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
  momentProjection: z.object({
    momentCandidates: z.number().int().nonnegative(),
    momentsByKind: z.record(z.string(), z.number().int().nonnegative()),
    momentsAboveThreshold: z.number().int().nonnegative(),
    controlledPlayerMoments: z.number().int().nonnegative(),
    matchWideMoments: z.number().int().nonnegative(),
    averageImportance: z.number().min(0).max(1),
    simulatedSecondsBetweenSurfacedMoments: z.array(z.number().nonnegative()),
    byPolicy: z.record(z.string(), z.number().int().nonnegative()),
    activeSignature: z.string().optional(),
    lastSurfacedAt: z.number().nonnegative().optional(),
    lastEvaluatedAt: z.number().nonnegative().optional(),
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
  observedPossessionLossIds: z.array(z.string()),
  observedRestartAwardIds: z.array(z.string()),
  shotDiagnostics: z.array(shotDiagnosticSchema),
});
export type MatchFlowTelemetry = z.infer<typeof matchFlowTelemetrySchema>;

type TelemetryHistoryKey = {
  [Key in keyof MatchFlowTelemetry]: MatchFlowTelemetry[Key] extends unknown[] ? Key : never;
}[keyof MatchFlowTelemetry];

type TelemetryIndexes = {
  owner: MatchFlowTelemetry;
  passAttempts: Set<string>;
  passResults: Set<string>;
  shots: Set<string>;
  majorActions: Set<string>;
  possessionLosses: Set<string>;
  restartAwards: Set<string>;
  passOutcomes: Map<string, number>;
  longestPossessionSpell: number;
  statisticsNetwork?: NonNullable<TacticalMatchState['statistics']>['passingNetwork'];
};
const telemetryIndexes = new WeakMap<MatchFlowTelemetry, TelemetryIndexes>();

/** A linear observer owns its private indexes. Reobserving an older snapshot rebuilds them,
 * so React retries, explicit branches and imported telemetry cannot inherit future events. */
const claimTelemetryIndexes = (previous: MatchFlowTelemetry, next: MatchFlowTelemetry) => {
  let indexes = telemetryIndexes.get(previous);
  if (!indexes || indexes.owner !== previous) {
    indexes = {
      owner: next,
      passAttempts: new Set(previous.observedPassAttemptIds),
      passResults: new Set(previous.observedPassResultIds),
      shots: new Set(previous.observedShotIds),
      majorActions: new Set(previous.observedMajorActionIds),
      possessionLosses: new Set(previous.observedPossessionLossIds),
      restartAwards: new Set(previous.observedRestartAwardIds),
      passOutcomes: new Map(),
      longestPossessionSpell: 0,
    };
    const outcomeIndexes = indexes.passOutcomes;
    previous.passOutcomes.forEach((outcome, index) => {
      // Preserve Array.find semantics even for a supplied history with duplicate IDs.
      if (!outcomeIndexes.has(outcome.passId)) outcomeIndexes.set(outcome.passId, index);
    });
    for (const duration of previous.possessionSpellDurations)
      indexes.longestPossessionSpell = Math.max(indexes.longestPossessionSpell, duration);
  } else indexes.owner = next;
  telemetryIndexes.set(next, indexes);
  return indexes;
};

/** Only these four counts are consumed on every tick. Their predicates match
 * deriveTeamShapeMetrics exactly, including its x-only attacking-box definition. */
const observeAttackingOccupancy = (state: TacticalMatchState, side: 'home' | 'away') => {
  let boxAttackers = 0,
    penaltySpotAttackers = 0,
    farPostAttackers = 0,
    edgeOfBoxSupport = 0;
  const spotX = side === 'home' ? 94 : 11;
  const edgeX = side === 'home' ? 86 : 19;
  const farPostY = state.ball.y < 34 ? 48 : 20;
  for (const player of state.players) {
    if (player.team !== side || player.profile.primaryPosition === 'goalkeeper') continue;
    const { x, y } = player.position;
    const attackingBox = side === 'home' ? x >= 88.5 : x <= 16.5;
    if (attackingBox) {
      boxAttackers++;
      if (Math.abs(x - spotX) <= 5 && Math.abs(y - 34) <= 7) penaltySpotAttackers++;
      if (Math.abs(y - farPostY) <= 8) farPostAttackers++;
    } else if (Math.abs(x - edgeX) <= 5 && Math.abs(y - 34) <= 20) edgeOfBoxSupport++;
  }
  return { boxAttackers, penaltySpotAttackers, farPostAttackers, edgeOfBoxSupport };
};

export const createMatchFlowTelemetry = (benchmarkRunId = 'benchmark-run-0'): MatchFlowTelemetry =>
  matchFlowTelemetrySchema.parse({
    benchmarkRunId,
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
    turnoverCauses: emptyTurnoverCauseCounts(),
    restartAwards: 0,
    possessionSpellDurations: [],
    possessionSpells: [],
    actionTempoSamples: [],
    ballHolds: [],
    passOutcomes: [],
    observerState: {
      spellStartedAt: 0,
      spellStartThird: 'middle',
      spellStartPhase: 'positional_attack',
      spellPassAttempts: 0,
      spellPassCompletions: 0,
      spellCarries: 0,
      maxProgress: 0,
      activeFlankEpisodes: [],
    },
    microSpellsUnder0_5s: 0,
    adjacentTickPossessionFlips: 0,
    backwardPasses: 0,
    lateralPasses: 0,
    progressivePasses: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    throughBalls: 0,
    passesOutOfPlay: 0,
    widePassesOutOfPlay: 0,
    overlapPassAttempts: 0,
    overlapPassCompleted: 0,
    overlapPassOutOfPlay: 0,
    overlapRunsStarted: 0,
    underlapRunsStarted: 0,
    provideWidthEpisodes: 0,
    shortWideCombinations: 0,
    channelReleases: 0,
    finalThirdEntries: 0,
    finalThirdPossessionSeconds: 0,
    boxEntries: 0,
    boxTouches: 0,
    boxOccupationEpisodes: 0,
    nearPostOccupationEpisodes: 0,
    penaltySpotOccupationEpisodes: 0,
    farPostOccupationEpisodes: 0,
    edgeSupportEpisodes: 0,
    crossesFromAdvancedWideArea: 0,
    cutbacks: 0,
    crossAttempts: 0,
    floatedCrosses: 0,
    drivenCrosses: 0,
    occupiedCrossTargets: 0,
    threatFlow: {
      progressiveReceptions: 0,
      resultingFinalThirdEntries: 0,
      resultingBoxEntries: 0,
      resultingShots: 0,
    },
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
    momentProjection: {
      momentCandidates: 0,
      momentsByKind: {},
      momentsAboveThreshold: 0,
      controlledPlayerMoments: 0,
      matchWideMoments: 0,
      averageImportance: 0,
      simulatedSecondsBetweenSurfacedMoments: [],
      byPolicy: {},
    },
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
    observedPossessionLossIds: [],
    observedRestartAwardIds: [],
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
    | 'goalkeeper_response'
    | 'restart',
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
  const result: MatchFlowTelemetry = {
    ...telemetry,
    turnoverCauses: { ...telemetry.turnoverCauses },
    observerState: { ...telemetry.observerState },
    threatFlow: { ...telemetry.threatFlow },
    receptions: { ...telemetry.receptions },
    interceptionCauses: { ...telemetry.interceptionCauses },
    momentProjection: {
      ...telemetry.momentProjection,
      momentsByKind: { ...telemetry.momentProjection.momentsByKind },
      byPolicy: { ...telemetry.momentProjection.byPolicy },
    },
    controlled: {
      ...telemetry.controlled,
      decisionOpportunities: { ...telemetry.controlled.decisionOpportunities },
      autonomousDiagnostics: { ...telemetry.controlled.autonomousDiagnostics },
      majorActionSources: {
        shots: { ...telemetry.controlled.majorActionSources.shots },
        crosses: { ...telemetry.controlled.majorActionSources.crosses },
        highImpactActions: { ...telemetry.controlled.majorActionSources.highImpactActions },
      },
    },
  };
  const indexes = claimTelemetryIndexes(telemetry, result);
  const observedPasses = new Map(
    [next.lastResolvedPass, next.lastPassDiagnostic]
      .filter((pass): pass is NonNullable<typeof pass> => Boolean(pass))
      .map((pass) => [pass.passId, pass]),
  );
  // Historical arrays are copied only when this tick appends or changes an entry.
  const append = <Key extends TelemetryHistoryKey>(
    key: Key,
    value: MatchFlowTelemetry[Key][number],
  ) => {
    const entry = matchFlowTelemetrySchema.shape[key].element.parse(value) as typeof value;
    if (result[key] === telemetry[key])
      result[key] = result[key].slice() as MatchFlowTelemetry[Key];
    (result[key] as Array<typeof value>).push(entry);
  };
  const updatePassingEdge = (index: number, kind: 'attempted' | 'completed', delta = 1) => {
    if (result.passingNetwork === telemetry.passingNetwork)
      result.passingNetwork = result.passingNetwork.slice();
    const edge = result.passingNetwork[index]!;
    result.passingNetwork[index] = { ...edge, [kind]: edge[kind] + delta };
  };
  result.canonicalMinutes = next.time / 60;
  const dt = Math.max(0, next.time - previous.time);
  const third = (side: 'home' | 'away', x: number) => {
    const progress = side === 'home' ? x : 105 - x;
    return progress < 35
      ? ('defensive' as const)
      : progress < 70
        ? ('middle' as const)
        : ('final' as const);
  };
  const progress = next.possessionTeam === 'home' ? next.ball.x : 105 - next.ball.x;
  result.observerState.maxProgress = Math.max(result.observerState.maxProgress, progress);
  const inFinalThird = (side: 'home' | 'away', x: number) => (side === 'home' ? x >= 70 : x <= 35);
  const inBox = (side: 'home' | 'away', point: { x: number; y: number }) =>
    (side === 'home' ? point.x >= 88.5 : point.x <= 16.5) && point.y >= 13.8 && point.y <= 54.2;
  if (next.possessionTeam && inFinalThird(next.possessionTeam, next.ball.x))
    result.finalThirdPossessionSeconds += dt;
  if (
    next.possessionTeam &&
    !inFinalThird(next.possessionTeam, previous.ball.x) &&
    inFinalThird(next.possessionTeam, next.ball.x)
  )
    result.finalThirdEntries++;
  if (
    next.possessionTeam &&
    !inBox(next.possessionTeam, previous.ball) &&
    inBox(next.possessionTeam, next.ball)
  )
    result.boxEntries++;
  if (
    next.ball.ownerId !== previous.ball.ownerId &&
    next.possessionTeam &&
    inBox(next.possessionTeam, next.ball)
  )
    result.boxTouches++;
  for (const side of ['home', 'away'] as const) {
    const beforeShape = observeAttackingOccupancy(previous, side),
      nextShape = observeAttackingOccupancy(next, side);
    if (!beforeShape.boxAttackers && nextShape.boxAttackers) result.boxOccupationEpisodes++;
    if (!beforeShape.penaltySpotAttackers && nextShape.penaltySpotAttackers)
      result.penaltySpotOccupationEpisodes++;
    if (!beforeShape.farPostAttackers && nextShape.farPostAttackers)
      result.farPostOccupationEpisodes++;
    if (!beforeShape.edgeOfBoxSupport && nextShape.edgeOfBoxSupport) result.edgeSupportEpisodes++;
    const nearPost = (state: TacticalMatchState) =>
      state.players.some(
        (p) =>
          p.team === side &&
          inBox(side, p.position) &&
          Math.abs(p.position.y - (state.ball.y < 34 ? 27 : 41)) <= 6,
      );
    if (!nearPost(previous) && nearPost(next)) result.nearPostOccupationEpisodes++;
  }
  const loss = next.lastPossessionLoss;
  const newLoss = loss && !indexes.possessionLosses.has(loss.id);
  if (newLoss) {
    result.turnoverCauses[loss.cause]++;
    append('observedPossessionLossIds', loss.id);
    indexes.possessionLosses.add(loss.id);
  }
  const award = next.lastRestartAward;
  if (award && !indexes.restartAwards.has(award.id)) {
    result.restartAwards++;
    append('observedRestartAwardIds', award.id);
    indexes.restartAwards.add(award.id);
  }
  if (previous.possessionTeam !== next.possessionTeam) {
    result.possessionChanges++;
    const spell = previous.timeSincePossessionChanged;
    append('possessionSpellDurations', spell);
    indexes.longestPossessionSpell = Math.max(indexes.longestPossessionSpell, spell);
    if (spell < 0.5) result.microSpellsUnder0_5s++;
    if (spell <= next.time - previous.time + 0.001) result.adjacentTickPossessionFlips++;
    const cause = newLoss ? loss.cause : undefined;
    append('possessionSpells', {
      team: previous.possessionTeam,
      startedAt: result.observerState.spellStartedAt,
      endedAt: next.time,
      duration: spell,
      startThird: result.observerState.spellStartThird,
      endThird: third(previous.possessionTeam, previous.ball.x),
      startPhase: result.observerState.spellStartPhase,
      endPhase: previous.teams[previous.possessionTeam].phase,
      passesAttempted: result.observerState.spellPassAttempts,
      passesCompleted: result.observerState.spellPassCompletions,
      carries: result.observerState.spellCarries,
      maxFieldProgress: result.observerState.maxProgress,
      turnoverCause: cause,
    });
    result.observerState = {
      spellStartedAt: next.time,
      spellStartThird: third(next.possessionTeam, next.ball.x),
      spellStartPhase: next.teams[next.possessionTeam].phase,
      spellPassAttempts: 0,
      spellPassCompletions: 0,
      spellCarries: 0,
      maxProgress: progress,
      activeFlankEpisodes: result.observerState.activeFlankEpisodes,
    };
  }
  const action = next.latestAction;
  const newAction =
    action && (previous.latestAction !== action || previous.decisionIndex !== next.decisionIndex);
  const actionEpisodeId = action
    ? `${result.benchmarkRunId}:${next.seed}:${next.decisionIndex}:${action.actorId}:${action.type}`
    : undefined;
  if (
    action &&
    actionEpisodeId &&
    !indexes.majorActions.has(actionEpisodeId) &&
    action.actorId === next.controlledFootballerId
  ) {
    append('observedMajorActionIds', actionEpisodeId);
    indexes.majorActions.add(actionEpisodeId);
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
    result.observerState.spellCarries++;
  }
  if (newAction && action) {
    const actor = next.players.find((player) => player.id === action.actorId);
    if (actor) {
      if (result.observerState.lastActionAt !== undefined)
        append('actionTempoSamples', {
          team: actor.team,
          third: third(actor.team, actor.position.x),
          phase: next.teams[actor.team].phase,
          kind: 'team_action',
          interval: next.time - result.observerState.lastActionAt,
        });
      result.observerState.lastActionAt = next.time;
    }
  }
  if (newAction && action.type === 'cross') {
    result.crossAttempts++;
    if (action.intent === 'floated') result.floatedCrosses++;
    if (action.intent === 'driven') result.drivenCrosses++;
    if (action.intendedTargetId) result.occupiedCrossTargets++;
    const actor = next.players.find((player) => player.id === action.actorId);
    if (
      actor &&
      inFinalThird(actor.team, actor.position.x) &&
      Math.abs(actor.position.y - 34) > 18
    ) {
      result.crossesFromAdvancedWideArea++;
      if ((actor.team === 'home' ? 1 : -1) * (action.target.x - actor.position.x) < 5)
        result.cutbacks++;
    }
  }
  const activeFlankEpisodes: string[] = [];
  const flankAssignments = deriveFlankRunAssignments(next, next.possessionTeam);
  for (const player of next.players) {
    const relationship = flankAssignments.find(
      (assignment) => assignment.playerId === player.id,
    )?.relationship;
    if (!relationship) continue;
    const id = `${player.id}:${relationship}`;
    activeFlankEpisodes.push(id);
    if (!result.observerState.activeFlankEpisodes.includes(id)) {
      if (relationship === 'overlap') result.overlapRunsStarted++;
      else if (relationship === 'underlap') result.underlapRunsStarted++;
      else result.provideWidthEpisodes++;
    }
  }
  result.observerState.activeFlankEpisodes = activeFlankEpisodes;
  for (const releasedPass of observedPasses.values()) {
    const releasedPassId = releasedPass
      ? `${result.benchmarkRunId}:${releasedPass.passId}`
      : undefined;
    if (
      releasedPass &&
      releasedPassId &&
      releasedPass.passerId !== releasedPass.intendedReceiverId &&
      !indexes.passAttempts.has(releasedPassId)
    ) {
      append('observedPassAttemptIds', releasedPassId);
      indexes.passAttempts.add(releasedPassId);
      result.passesAttempted++;
      result.observerState.spellPassAttempts++;
      if (
        newAction &&
        action.type === 'pass' &&
        action.actorId === releasedPass.passerId &&
        next.lastPassDiagnostic?.passId === releasedPass.passId
      ) {
        if (action.intent === 'through') result.throughBalls++;
        const passer = next.players.find((player) => player.id === action.actorId);
        if (passer) {
          if (result.observerState.lastPassAt !== undefined)
            append('actionTempoSamples', {
              team: passer.team,
              third: third(passer.team, passer.position.x),
              phase: next.teams[passer.team].phase,
              kind: 'pass',
              interval: next.time - result.observerState.lastPassAt,
            });
          result.observerState.lastPassAt = next.time;
          const progress =
            (passer.team === 'home' ? 1 : -1) * (action.target.x - passer.position.x);
          if (progress > 5) result.progressivePasses++;
          else if (progress < -2) result.backwardPasses++;
          else result.lateralPasses++;
          if (!indexes.passOutcomes.has(releasedPass.passId))
            indexes.passOutcomes.set(releasedPass.passId, result.passOutcomes.length);
          append('passOutcomes', {
            passId: releasedPass.passId,
            intent: action.intent,
            originThird: third(passer.team, passer.position.x),
            length: distance(passer.position, releasedPass.predictedReceptionPoint),
            pressure: previous.currentPressure,
            defenderEtaAdvantage:
              releasedPass.receiverArrivalEstimate - releasedPass.bestDefenderArrivalEstimate,
            outcome: 'unclaimed',
          });
        }
        const receiver = next.players.find(
          (player) => player.id === releasedPass.intendedReceiverId,
        );
        if (
          receiver &&
          ['left_back', 'right_back', 'left_wing_back', 'right_wing_back'].includes(
            receiver.slot.position,
          )
        ) {
          const relation = deriveFlankRelationship(previous, receiver);
          const length = distance(
            passer?.position ?? previous.ball,
            releasedPass.predictedReceptionPoint,
          );
          if (relation === 'overlap') result.overlapPassAttempts++;
          if (Math.abs(releasedPass.predictedReceptionPoint.y - 34) > 22) {
            if (length <= 15) result.shortWideCombinations++;
            else if (Math.abs(releasedPass.predictedReceptionPoint.y - receiver.position.y) < 5)
              result.channelReleases++;
          }
        }
      }
      if (releasedPass.passerId === next.controlledFootballerId)
        result.controlled.passesAttempted++;
      const diagnostic = releasedPass;
      {
        const moving =
          Math.hypot(
            diagnostic.receiverVelocityAtRelease.x,
            diagnostic.receiverVelocityAtRelease.y,
          ) > 0.5;
        if (moving) result.passesToMovingReceiver++;
        else result.passesToStationaryReceiver++;
        result.leadDistanceSamples++;
        result.averageLeadDistance +=
          (diagnostic.leadDistance - result.averageLeadDistance) / result.leadDistanceSamples;
      }
      const edgeIndex = result.passingNetwork.findIndex(
        (item) =>
          item.passerId === releasedPass.passerId &&
          item.receiverId === releasedPass.intendedReceiverId,
      );
      if (edgeIndex >= 0) updatePassingEdge(edgeIndex, 'attempted');
      else if (releasedPass.passerId !== releasedPass.intendedReceiverId)
        append('passingNetwork', {
          passerId: releasedPass.passerId,
          receiverId: releasedPass.intendedReceiverId,
          attempted: 1,
          completed: 0,
        });
    }
  }
  const ownershipReceived =
    next.ball.ownerId !== previous.ball.ownerId ? next.ball.ownerId : undefined;
  if (ownershipReceived && ownershipReceived === next.controlledFootballerId)
    result.controlled.touches++;
  for (const diagnostic of observedPasses.values()) {
    if (
      diagnostic.finalResult &&
      diagnostic.passerId !== diagnostic.intendedReceiverId &&
      !indexes.passResults.has(`${result.benchmarkRunId}:${diagnostic.passId}`)
    ) {
      const resultId = `${result.benchmarkRunId}:${diagnostic.passId}`;
      append('observedPassResultIds', resultId);
      indexes.passResults.add(resultId);
      if (
        diagnostic.finalResult === 'completed' &&
        diagnostic.actualContactPoint &&
        diagnostic.resolvedAt !== undefined &&
        (diagnostic.actualReceiverId ?? diagnostic.intendedReceiverId) !== diagnostic.passerId
      ) {
        result.passesCompleted++;
        result.observerState.spellPassCompletions++;
        const receiverId = diagnostic.actualReceiverId ?? diagnostic.intendedReceiverId;
        if (receiverId !== diagnostic.intendedReceiverId) {
          const intendedIndex = result.passingNetwork.findIndex(
            (edge) =>
              edge.passerId === diagnostic.passerId &&
              edge.receiverId === diagnostic.intendedReceiverId,
          );
          if (intendedIndex >= 0) updatePassingEdge(intendedIndex, 'attempted', -1);
          const actualIndex = result.passingNetwork.findIndex(
            (edge) => edge.passerId === diagnostic.passerId && edge.receiverId === receiverId,
          );
          if (actualIndex >= 0) updatePassingEdge(actualIndex, 'attempted');
          else
            append('passingNetwork', {
              passerId: diagnostic.passerId,
              receiverId,
              attempted: 1,
              completed: 0,
            });
          result.passingNetwork = result.passingNetwork.filter(
            (edge) => edge.attempted !== 0 || edge.completed !== 0,
          );
        }
        const edgeIndex = result.passingNetwork.findIndex(
          (item) => item.passerId === diagnostic.passerId && item.receiverId === receiverId,
        );
        if (edgeIndex >= 0) updatePassingEdge(edgeIndex, 'completed');
        else
          append('passingNetwork', {
            passerId: diagnostic.passerId,
            receiverId,
            attempted: 1,
            completed: 1,
          });
        if (receiverId === next.controlledFootballerId) result.controlled.passesReceived++;
        const receiver = next.players.find((player) => player.id === receiverId);
        if (receiver && deriveFlankRelationship(previous, receiver) === 'overlap')
          result.overlapPassCompleted++;
        if (receiver) {
          const passer = next.players.find((player) => player.id === diagnostic.passerId);
          if (
            passer &&
            (passer.team === 'home' ? 1 : -1) * (receiver.position.x - passer.position.x) > 5
          ) {
            result.threatFlow.progressiveReceptions++;
            if (inFinalThird(receiver.team, receiver.position.x))
              result.threatFlow.resultingFinalThirdEntries++;
            if (inBox(receiver.team, receiver.position)) result.threatFlow.resultingBoxEntries++;
          }
        }
      }
      const moving =
        Math.hypot(diagnostic.receiverVelocityAtRelease.x, diagnostic.receiverVelocityAtRelease.y) >
        0.5;
      const passOutcomeIndex = indexes.passOutcomes.get(diagnostic.passId);
      if (passOutcomeIndex !== undefined) {
        if (result.passOutcomes === telemetry.passOutcomes)
          result.passOutcomes = result.passOutcomes.slice();
        result.passOutcomes[passOutcomeIndex] = {
          ...result.passOutcomes[passOutcomeIndex]!,
          outcome:
            diagnostic.finalResult === 'completed'
              ? 'completed'
              : diagnostic.finalResult === 'out_of_play'
                ? 'out_of_play'
                : diagnostic.finalResult === 'inaccurate'
                  ? 'bad_pass'
                  : diagnostic.finalResult === 'intercepted'
                    ? 'intercepted'
                    : diagnostic.finalResult === 'technical_error'
                      ? 'technical_error'
                      : diagnostic.receptionOutcome === 'failed_control'
                        ? 'failed_reception'
                        : next.lastBoundaryCrossing !== previous.lastBoundaryCrossing
                          ? 'out_of_play'
                          : 'unclaimed',
        };
      }
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
      else if (diagnostic.receptionOutcome === 'directional_control')
        result.receptions.directional++;
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
  }
  if (previous.ball.ownerId && previous.ball.ownerId !== next.ball.ownerId) {
    const player = previous.players.find((item) => item.id === previous.ball.ownerId);
    if (player)
      append('ballHolds', {
        playerId: player.id,
        duration: Math.max(0, next.time - (previous.ballOwnershipStartedAt ?? previous.time)),
        third: third(player.team, player.position.x),
        pressureBand:
          previous.currentPressure < 0.33
            ? 'low'
            : previous.currentPressure < 0.67
              ? 'medium'
              : 'high',
        role: player.slot.position,
        phase: previous.teams[player.team].phase,
        terminalAction:
          next.latestAction?.actorId === player.id ? next.latestAction.type : 'dispossession',
      });
  }
  const boundary = next.lastBoundaryCrossing;
  if (
    boundary &&
    boundary !== previous.lastBoundaryCrossing &&
    previous.ball.sourceAction === 'pass'
  ) {
    result.passesOutOfPlay++;
    if (boundary.boundary.startsWith('touchline')) result.widePassesOutOfPlay++;
    const receiver = previous.players.find(
      (player) => player.id === previous.ball.intendedReceiverId,
    );
    if (receiver && deriveFlankRelationship(previous, receiver) === 'overlap')
      result.overlapPassOutOfPlay++;
  }
  if (next.lastShot && !indexes.shots.has(`${result.benchmarkRunId}:${next.lastShot.shotId}`)) {
    const shot = next.lastShot,
      shooter = next.players.find((player) => player.id === shot.shooterId);
    const shotId = `${result.benchmarkRunId}:${shot.shotId}`;
    append('observedShotIds', shotId);
    indexes.shots.add(shotId);
    append('shotDiagnostics', shot);
    result.shots++;
    if (inFinalThird(shooter?.team ?? 'home', previous.ball.x)) result.threatFlow.resultingShots++;
    const metres = shooter
      ? distance(shooter.position, { x: shooter.team === 'home' ? 105 : 0, y: 34 })
      : 0;
    append('shotDistances', metres);
    if (metres >= 30) result.longShots++;
    if (shot.outcome === 'goal') {
      result.goals++;
      if (metres >= 30) result.longShotGoals++;
    }
    if (['goal', 'save'].includes(shot.outcome ?? '')) result.shotsOnTarget++;
    if (shot.outcome === 'block') result.shotsBlocked++;
    if (shot.outcome === 'save') result.saves++;
    if (shot.goalkeeperAction === 'failed_save') result.failedSaves++;
    if (shot.goalkeeperAction === 'no_chance' && shot.outcome === 'goal') result.noChanceGoals++;
    if (shooter)
      append(
        'shootingOpportunityValues',
        evaluateShootingOpportunity(previous, shooter).effectiveScoringExpectation,
      );
    if (shot.shooterId === next.controlledFootballerId) result.controlled.shots++;
  }
  // Four observational samples per canonical second are sufficient to catch football episodes
  // without making benchmark instrumentation dominate the fixed-step simulation cost.
  if (
    result.momentProjection.lastEvaluatedAt === undefined ||
    next.time - result.momentProjection.lastEvaluatedAt >= 0.249
  ) {
    const moment = projectMatchMoment(next);
    const momentSignature =
      moment.kind === 'routine' ? undefined : `${moment.kind}:${moment.actorIds.join(',')}`;
    if (momentSignature && momentSignature !== result.momentProjection.activeSignature) {
      const projection = result.momentProjection;
      const previousCount = projection.momentCandidates;
      projection.momentCandidates++;
      projection.momentsByKind[moment.kind] = (projection.momentsByKind[moment.kind] ?? 0) + 1;
      projection.averageImportance =
        (projection.averageImportance * previousCount + moment.importance) /
        projection.momentCandidates;
      if (moment.controlledPlayerInvolved) projection.controlledPlayerMoments++;
      else projection.matchWideMoments++;
      if (moment.importance >= 0.68) {
        projection.momentsAboveThreshold++;
        if (projection.lastSurfacedAt !== undefined) {
          if (
            projection.simulatedSecondsBetweenSurfacedMoments ===
            telemetry.momentProjection.simulatedSecondsBetweenSurfacedMoments
          )
            projection.simulatedSecondsBetweenSurfacedMoments =
              projection.simulatedSecondsBetweenSurfacedMoments.slice();
          projection.simulatedSecondsBetweenSurfacedMoments.push(
            next.time - projection.lastSurfacedAt,
          );
        }
        projection.lastSurfacedAt = next.time;
      }
      for (const policy of Object.values(MATCH_PRESENTATION_POLICIES))
        if (shouldSurfaceMatchMoment(moment, policy))
          projection.byPolicy[policy.id] = (projection.byPolicy[policy.id] ?? 0) + 1;
    }
    result.momentProjection.activeSignature = momentSignature;
    result.momentProjection.lastEvaluatedAt = next.time;
  }
  // Canonical statistics own contact/pass totals. Snapshot-only legacy fixtures can still be
  // inspected above; live simulation provides the exactly-once event projection here.
  if (next.statistics && next.statistics !== previous.statistics) {
    result.passesAttempted = next.statistics.players.reduce((sum, p) => sum + p.passesAttempted, 0);
    result.passesCompleted = next.statistics.players.reduce((sum, p) => sum + p.passesCompleted, 0);
    if (
      next.statistics.passingNetwork !== indexes.statisticsNetwork ||
      result.passingNetwork !== telemetry.passingNetwork
    )
      result.passingNetwork = next.statistics.passingNetwork.map((edge) => ({ ...edge }));
    indexes.statisticsNetwork = next.statistics.passingNetwork;
    const networkAttempts = result.passingNetwork.reduce((sum, edge) => sum + edge.attempted, 0);
    const networkCompleted = result.passingNetwork.reduce((sum, edge) => sum + edge.completed, 0);
    if (networkAttempts !== result.passesAttempted || networkCompleted !== result.passesCompleted)
      throw new Error(
        'Telemetry invariant failed: canonical passing network totals do not reconcile.',
      );
    const controlled = next.statistics.players.find(
      (p) => p.playerId === next.controlledFootballerId,
    );
    if (controlled) {
      result.controlled.touches = controlled.touches;
      result.controlled.passesAttempted = controlled.passesAttempted;
      result.controlled.passesReceived = controlled.passesReceived;
    }
  }
  // Complete Zod/history validation remains at import/export and explicit benchmark checks.
  // Tick validation checks scalar totals, the bounded network and the cached maximum spell.
  assertTelemetryTotals(result);
  if (indexes.longestPossessionSpell > result.canonicalMinutes * 60 + 0.001)
    throw new Error(
      'Telemetry invariant failed: closed possession spell exceeds segment duration.',
    );
  return result;
};

const assertTelemetryTotals = (telemetry: MatchFlowTelemetry) => {
  if (telemetry.passesCompleted > telemetry.passesAttempted)
    throw new Error('Telemetry invariant failed: completed passes exceed attempts.');
  if (
    telemetry.movingReceiverCompletions + telemetry.movingReceiverFailures >
    telemetry.passesToMovingReceiver
  )
    throw new Error('Telemetry invariant failed: moving pass results exceed attempts.');
  for (const edge of telemetry.passingNetwork) {
    if (edge.completed > edge.attempted || edge.attempted < 0 || edge.completed < 0)
      throw new Error(
        'Telemetry invariant failed: passing network edge completions exceed attempts.',
      );
    if (edge.passerId === edge.receiverId)
      throw new Error('Telemetry invariant failed: passing network contains a self edge.');
  }
  const attempts = telemetry.passingNetwork.reduce((sum, edge) => sum + edge.attempted, 0);
  const completed = telemetry.passingNetwork.reduce((sum, edge) => sum + edge.completed, 0);
  if (completed > attempts)
    throw new Error('Telemetry invariant failed: passing network completions exceed attempts.');
};

export const assertTelemetryInvariants = (telemetry: MatchFlowTelemetry) => {
  assertTelemetryTotals(telemetry);
  for (const spell of telemetry.possessionSpellDurations)
    if (spell > telemetry.canonicalMinutes * 60 + 0.001)
      throw new Error(
        'Telemetry invariant failed: closed possession spell exceeds segment duration.',
      );
};

export const summarizeMatchFlowRates = (telemetry: MatchFlowTelemetry) => {
  const minutes = Math.max(telemetry.canonicalMinutes, 1 / 60);
  return {
    passesPerCanonicalMinute: telemetry.passesAttempted / minutes,
    carriesPerCanonicalMinute: telemetry.carries / minutes,
    backwardPassShare: telemetry.passesAttempted
      ? telemetry.backwardPasses / telemetry.passesAttempted
      : 0,
    lateralPassShare: telemetry.passesAttempted
      ? telemetry.lateralPasses / telemetry.passesAttempted
      : 0,
    progressivePassShare: telemetry.passesAttempted
      ? telemetry.progressivePasses / telemetry.passesAttempted
      : 0,
    microSpellsUnder0_5s: telemetry.microSpellsUnder0_5s,
    adjacentTickPossessionFlips: telemetry.adjacentTickPossessionFlips,
    medianPossessionSpell: (() => {
      const values = [...telemetry.possessionSpellDurations].sort((a, b) => a - b);
      return values.length
        ? (values[Math.floor((values.length - 1) / 2)]! + values[Math.floor(values.length / 2)]!) /
            2
        : 0;
    })(),
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
      onTarget: shots.filter((shot) => ['goal', 'save'].includes(shot.outcome ?? '')).length,
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

export const shootingStyleSummarySchema = z.object({
  intent: z.enum(['driven', 'placed', 'chip', 'header', 'legacy']),
  contact: shotContactSchema,
  attempts: z.number().int().nonnegative(),
  firstTimeAttempts: z.number().int().nonnegative(),
  onTarget: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative(),
  keeperContacts: z.number().int().nonnegative(),
  blocks: z.number().int().nonnegative(),
  averageDecisionHeight: z.number().nonnegative(),
  averageContactHeight: z.number().nonnegative(),
  averageLaunchSpeed: z.number().nonnegative(),
  averageVerticalLaunch: z.number(),
  averageExecutionError: z.number().nonnegative(),
});

/** PR145 can split technique and contact without conflating a placed volley with a settled shot. */
export const summarizeShootingStyles = (telemetry: MatchFlowTelemetry) => {
  const keys = new Set(
    telemetry.shotDiagnostics.map(
      (shot) =>
        `${shot.intent ?? (shot.context === 'header' ? 'header' : 'legacy')}:${shot.contact ?? (shot.context === 'header' ? 'header' : 'settled')}`,
    ),
  );
  return [...keys].sort().map((key) => {
    const [intent, contact] = key.split(':');
    const shots = telemetry.shotDiagnostics.filter(
      (shot) =>
        `${shot.intent ?? (shot.context === 'header' ? 'header' : 'legacy')}:${shot.contact ?? (shot.context === 'header' ? 'header' : 'settled')}` ===
        key,
    );
    const average = (value: (shot: NonNullable<TacticalMatchState['lastShot']>) => number) =>
      shots.reduce((sum, shot) => sum + value(shot), 0) / shots.length;
    return shootingStyleSummarySchema.parse({
      intent,
      contact,
      attempts: shots.length,
      firstTimeAttempts: shots.filter((shot) => shot.firstTime).length,
      onTarget: shots.filter((shot) => ['goal', 'save'].includes(shot.outcome ?? '')).length,
      goals: shots.filter((shot) => shot.outcome === 'goal').length,
      saves: shots.filter((shot) => shot.outcome === 'save').length,
      keeperContacts: shots.filter(
        (shot) =>
          shot.keeperId &&
          ['catch', 'parry', 'parry_away', 'failed_save'].includes(shot.goalkeeperAction ?? ''),
      ).length,
      blocks: shots.filter((shot) => shot.outcome === 'block').length,
      averageDecisionHeight: average((shot) => shot.ballHeightAtDecision ?? 0),
      averageContactHeight: average((shot) => shot.ballHeightAtContact ?? 0),
      averageLaunchSpeed: average((shot) => shot.launchSpeed ?? shot.speed),
      averageVerticalLaunch: average((shot) => shot.launchVerticalComponent ?? 0),
      averageExecutionError: average((shot) =>
        Math.hypot(shot.error.horizontal, shot.error.vertical),
      ),
    });
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
