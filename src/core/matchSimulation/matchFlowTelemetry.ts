import { z } from 'zod';
import { distance } from './matchSpace';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import type { TacticalMatchState } from './matchState';
import { deriveFlankRelationship } from './tacticalPositioning';
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

const passEdgeSchema = z.object({
  passerId: z.string(),
  receiverId: z.string(),
  attempted: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
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
  turnoverCauses: z.record(
    z.enum([
      'tackle',
      'interception',
      'bad_pass',
      'pass_out',
      'heavy_touch',
      'failed_control',
      'loose_ball_claim',
      'restart',
      'other',
    ]),
    z.number().int().nonnegative(),
  ),
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
  shotDiagnostics: z.array(z.custom<NonNullable<TacticalMatchState['lastShot']>>()),
});
export type MatchFlowTelemetry = z.infer<typeof matchFlowTelemetrySchema>;

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
    turnoverCauses: {
      tackle: 0,
      interception: 0,
      bad_pass: 0,
      pass_out: 0,
      heavy_touch: 0,
      failed_control: 0,
      loose_ball_claim: 0,
      restart: 0,
      other: 0,
    },
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
  const result = structuredClone(telemetry);
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
    const beforeShape = deriveTeamShapeMetrics(previous, side),
      nextShape = deriveTeamShapeMetrics(next, side);
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
  if (previous.possessionTeam !== next.possessionTeam) {
    result.possessionChanges++;
    const spell = previous.timeSincePossessionChanged;
    result.possessionSpellDurations.push(spell);
    if (spell < 0.5) result.microSpellsUnder0_5s++;
    if (spell <= next.time - previous.time + 0.001) result.adjacentTickPossessionFlips++;
    const cause =
      next.scenario !== 'open_play'
        ? 'restart'
        : next.lastBoundaryCrossing && next.lastBoundaryCrossing !== previous.lastBoundaryCrossing
          ? 'pass_out'
          : next.lastReceptionOutcome !== previous.lastReceptionOutcome &&
              next.lastReceptionOutcome?.kind === 'heavy_touch'
            ? 'heavy_touch'
            : next.lastReceptionOutcome !== previous.lastReceptionOutcome &&
                next.lastReceptionOutcome?.kind === 'failed_control'
              ? 'failed_control'
              : next.lastPassDiagnostic?.finalResult === 'intercepted'
                ? 'interception'
                : next.lastPassDiagnostic?.finalResult === 'technical_error'
                  ? 'bad_pass'
                  : next.recentDuel?.winnerId === next.ball.ownerId &&
                      next.recentDuel?.resolvedAt === next.time
                    ? 'tackle'
                    : !previous.ball.ownerId
                      ? 'loose_ball_claim'
                      : 'other';
    result.turnoverCauses[cause]++;
    result.possessionSpells.push({
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
    result.observerState.spellCarries++;
  }
  if (newAction && action) {
    const actor = next.players.find((player) => player.id === action.actorId);
    if (actor) {
      if (result.observerState.lastActionAt !== undefined)
        result.actionTempoSamples.push({
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
  for (const player of next.players) {
    const relationship = deriveFlankRelationship(next, player);
    if (!['overlap', 'underlap', 'provide_width'].includes(relationship)) continue;
    const id = `${player.id}:${relationship}`;
    activeFlankEpisodes.push(id);
    if (!result.observerState.activeFlankEpisodes.includes(id)) {
      if (relationship === 'overlap') result.overlapRunsStarted++;
      else if (relationship === 'underlap') result.underlapRunsStarted++;
      else result.provideWidthEpisodes++;
    }
  }
  result.observerState.activeFlankEpisodes = activeFlankEpisodes;
  const releasedPass = next.lastPassDiagnostic;
  const releasedPassId = releasedPass
    ? `${result.benchmarkRunId}:${releasedPass.passId}`
    : undefined;
  if (releasedPass && releasedPassId && !result.observedPassAttemptIds.includes(releasedPassId)) {
    result.observedPassAttemptIds.push(releasedPassId);
    result.passesAttempted++;
    result.observerState.spellPassAttempts++;
    if (newAction && action.type === 'pass') {
      if (action.intent === 'through') result.throughBalls++;
      const passer = next.players.find((player) => player.id === action.actorId);
      if (passer) {
        if (result.observerState.lastPassAt !== undefined)
          result.actionTempoSamples.push({
            team: passer.team,
            third: third(passer.team, passer.position.x),
            phase: next.teams[passer.team].phase,
            kind: 'pass',
            interval: next.time - result.observerState.lastPassAt,
          });
        result.observerState.lastPassAt = next.time;
        const progress = (passer.team === 'home' ? 1 : -1) * (action.target.x - passer.position.x);
        if (progress > 5) result.progressivePasses++;
        else if (progress < -2) result.backwardPasses++;
        else result.lateralPasses++;
        result.passOutcomes.push({
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
      const receiver = next.players.find((player) => player.id === releasedPass.intendedReceiverId);
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
    !result.observedPassResultIds.includes(
      `${result.benchmarkRunId}:${next.lastPassDiagnostic.passId}`,
    )
  ) {
    const diagnostic = next.lastPassDiagnostic;
    result.observedPassResultIds.push(`${result.benchmarkRunId}:${diagnostic.passId}`);
    if (diagnostic.finalResult === 'completed') {
      result.passesCompleted++;
      result.observerState.spellPassCompletions++;
      const edge = result.passingNetwork.find(
        (item) =>
          item.passerId === diagnostic.passerId &&
          item.receiverId === diagnostic.intendedReceiverId,
      );
      if (edge) edge.completed++;
      if (diagnostic.intendedReceiverId === next.controlledFootballerId)
        result.controlled.passesReceived++;
      const receiver = next.players.find((player) => player.id === diagnostic.intendedReceiverId);
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
    const passOutcome = result.passOutcomes.find((item) => item.passId === diagnostic.passId);
    if (passOutcome)
      passOutcome.outcome =
        diagnostic.finalResult === 'completed'
          ? 'completed'
          : diagnostic.finalResult === 'intercepted'
            ? 'intercepted'
            : diagnostic.finalResult === 'technical_error'
              ? 'technical_error'
              : diagnostic.receptionOutcome === 'failed_control'
                ? 'failed_reception'
                : next.lastBoundaryCrossing !== previous.lastBoundaryCrossing
                  ? 'out_of_play'
                  : 'unclaimed';
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
  if (previous.ball.ownerId && previous.ball.ownerId !== next.ball.ownerId) {
    const player = previous.players.find((item) => item.id === previous.ball.ownerId);
    if (player)
      result.ballHolds.push({
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
  if (
    next.lastShot &&
    !result.observedShotIds.includes(`${result.benchmarkRunId}:${next.lastShot.shotId}`)
  ) {
    const shot = next.lastShot,
      shooter = next.players.find((player) => player.id === shot.shooterId);
    result.observedShotIds.push(`${result.benchmarkRunId}:${shot.shotId}`);
    result.shotDiagnostics.push(shot);
    result.shots++;
    if (inFinalThird(shooter?.team ?? 'home', previous.ball.x)) result.threatFlow.resultingShots++;
    const metres = shooter
      ? distance(shooter.position, { x: shooter.team === 'home' ? 105 : 0, y: 34 })
      : 0;
    result.shotDistances.push(metres);
    if (metres >= 30) result.longShots++;
    if (shot.outcome === 'goal') {
      result.goals++;
      if (metres >= 30) result.longShotGoals++;
    }
    if (['goal', 'save', 'post', 'crossbar'].includes(shot.outcome ?? '')) result.shotsOnTarget++;
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
        if (projection.lastSurfacedAt !== undefined)
          projection.simulatedSecondsBetweenSurfacedMoments.push(
            next.time - projection.lastSurfacedAt,
          );
        projection.lastSurfacedAt = next.time;
      }
      for (const policy of Object.values(MATCH_PRESENTATION_POLICIES))
        if (shouldSurfaceMatchMoment(moment, policy))
          projection.byPolicy[policy.id] = (projection.byPolicy[policy.id] ?? 0) + 1;
    }
    result.momentProjection.activeSignature = momentSignature;
    result.momentProjection.lastEvaluatedAt = next.time;
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
      onTarget: shots.filter((shot) =>
        ['goal', 'save', 'post', 'crossbar'].includes(shot.outcome ?? ''),
      ).length,
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
