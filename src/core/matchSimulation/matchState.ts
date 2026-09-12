import { z } from 'zod';
import type { FootballerProfile } from '../../types/domain';
import type { FormationId, FormationSlot, TacticalDuty } from '../footballerWorld';
import { pitchPointSchema, teamSideSchema, type PitchPoint, type TeamSide } from './matchSpace';
import { cornerPlanSchema, tacticalIntentSchema, tacticalZoneSchema } from './tacticalSituations';
import { ballContactSchema, type BallContact } from './ballFlight';
import { offsideSnapshotSchema, type OffsideSnapshot } from './offside';
import { pitchBoundaryCrossingSchema, type PitchBoundaryCrossing } from './pitchBoundary';
import type { ReceptionOutcome, ReceptionPreparation } from './passReception';

export const matchPhaseSchema = z.enum([
  'positional_attack',
  'defensive_block',
  'attacking_transition',
  'defensive_transition',
  'set_piece_attack',
  'set_piece_defence',
]);
export type MatchPhase = z.infer<typeof matchPhaseSchema>;
export const tacticalStyleSchema = z.enum([
  'possession',
  'balanced',
  'direct',
  'counter_attacking',
  'pressing',
]);
export type TacticalStyle = z.infer<typeof tacticalStyleSchema>;
export const matchActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hold'), actorId: z.string() }),
  z.object({ type: z.literal('carry'), actorId: z.string(), target: pitchPointSchema }),
  z.object({
    type: z.literal('pass'),
    actorId: z.string(),
    receiverId: z.string(),
    target: pitchPointSchema,
    intent: z.enum(['support', 'progressive', 'direct', 'through']),
  }),
  z.object({
    type: z.literal('shot'),
    actorId: z.string(),
    target: pitchPointSchema,
    intent: z.enum(['placed', 'driven', 'chip']),
    goalTarget: z
      .object({ horizontal: z.number().min(-1).max(1), vertical: z.number().min(0).max(1) })
      .optional(),
  }),
  z.object({
    type: z.literal('cross'),
    actorId: z.string(),
    target: pitchPointSchema,
    intendedTargetId: z.string().optional(),
    intent: z.enum(['floated', 'driven', 'cutback']),
  }),
  z.object({
    type: z.literal('header'),
    actorId: z.string(),
    target: pitchPointSchema,
    intendedTargetId: z.string().optional(),
    intent: z.enum(['header_shot', 'header_pass', 'flick', 'header_clearance']),
  }),
]);
export type MatchAction = z.infer<typeof matchActionSchema>;
export const actionSourceSchema = z.enum([
  'human_selected',
  'dev_ai_selected',
  'autonomous_routine',
  'autonomous_npc',
]);
export type ActionSource = z.infer<typeof actionSourceSchema>;
export const playerMovementIntentSchema = z.object({
  actorId: z.string(),
  type: z.enum(['hold_shape', 'support', 'come_short', 'attack_space', 'run_in_behind']),
  target: pitchPointSchema,
  startedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
});
export type PlayerMovementIntent = z.infer<typeof playerMovementIntentSchema>;
export const playerDefensiveIntentSchema = z.object({
  actorId: z.string(),
  opponentId: z.string(),
  type: z.enum(['contain', 'press', 'challenge', 'hold_line', 'intercept']),
  startedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
});
export type PlayerDefensiveIntent = z.infer<typeof playerDefensiveIntentSchema>;
export const pendingReceptionIntentSchema = z.object({
  actorId: z.string(),
  action: matchActionSchema,
  createdAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  ballEpisode: z.string(),
  sourceAction: z.enum(['hold', 'carry', 'pass', 'shot', 'cross', 'header']).optional(),
});
export type PendingReceptionIntent = z.infer<typeof pendingReceptionIntentSchema>;
export const ballCarrierIntentSchema = z.object({
  actorId: z.string(),
  type: z.literal('carry'),
  target: pitchPointSchema,
  startedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
});
export type BallCarrierIntent = z.infer<typeof ballCarrierIntentSchema>;
export const playerDecisionGateStateSchema = z.object({
  lastSituationSignature: z.string().optional(),
  lastResolvedAt: z.number().nonnegative().optional(),
});
export type PlayerDecisionGateState = z.infer<typeof playerDecisionGateStateSchema>;
export const playerDecisionOutcomeSchema = z.object({
  decisionId: z.string(),
  actorId: z.string(),
  selectedAt: z.number().nonnegative(),
  resolvedAt: z.number().nonnegative().optional(),
  decisionKind: z.enum([
    'on_ball',
    'incoming_ball',
    'off_ball_run',
    'defensive_response',
    'loose_ball',
  ]),
  selectedIntent: z.string(),
  selectedTarget: z.unknown().optional(),
  startContext: z.object({
    phase: matchPhaseSchema,
    pressure: z.number().min(0).max(1),
    fieldProgress: z.number(),
    possession: teamSideSchema,
  }),
  result: z
    .object({
      kind: z.string(),
      retainedPossession: z.boolean().optional(),
      teamRetainedPossession: z.boolean().optional(),
      progressDelta: z.number().optional(),
      passCompleted: z.boolean().optional(),
      turnover: z.boolean().optional(),
      duelWon: z.boolean().optional(),
      duelLost: z.boolean().optional(),
      shotOutcome: z.enum(['goal', 'save', 'block', 'miss', 'post', 'crossbar']).optional(),
    })
    .optional(),
});
export type PlayerDecisionOutcome = z.infer<typeof playerDecisionOutcomeSchema>;
export const restartScenarioSchema = z.enum([
  'open_play',
  'kick_off',
  'goal_kick',
  'gk_short',
  'corner',
  'free_kick',
  'free_kick_far',
  'free_kick_close',
  'free_kick_wide',
  'penalty',
  'throw_in',
]);
export type RestartScenario = z.infer<typeof restartScenarioSchema>;
export const restartPhaseSchema = z.enum(['setup', 'release']);
export type RestartPhase = z.infer<typeof restartPhaseSchema>;
export const restartLifecycleSchema = z.object({
  restartTeam: teamSideSchema,
  phase: restartPhaseSchema,
  startedAt: z.number().nonnegative(),
  executedAt: z.number().nonnegative().optional(),
  takerId: z.string(),
  targets: z.record(z.string(), pitchPointSchema),
  landingZone: pitchPointSchema.optional(),
  cornerPlan: cornerPlanSchema.optional(),
  executionChoices: z.array(z.enum(['short_pass', 'long_delivery', 'direct_shot', 'combination'])),
  roles: z.record(
    z.string(),
    z.object({
      key: z.string(),
      intent: tacticalIntentSchema,
      zone: tacticalZoneSchema,
      markerId: z.string().optional(),
    }),
  ),
});
export type RestartLifecycle = z.infer<typeof restartLifecycleSchema>;

export interface MatchPlayerState {
  id: string;
  team: TeamSide;
  profile: FootballerProfile;
  slotIndex: number;
  slot: FormationSlot;
  duty: TacticalDuty;
  position: PitchPoint;
  target: PitchPoint;
  velocity: PitchPoint;
  anchor: PitchPoint;
  neutralAnchor: PitchPoint;
  idealTarget: PitchPoint;
  meanPosition: PitchPoint;
  samples: number;
  locomotionIntensity?: LocomotionIntensity;
  locomotionReason?: LocomotionReason;
  targetSpeed?: number;
  locomotionTelemetry?: LocomotionTelemetry;
  sprintStartedAt?: number;
  sprintBurstCounted?: boolean;
}

export const locomotionIntensitySchema = z.enum(['walk', 'jog', 'run', 'sprint']);
export type LocomotionIntensity = z.infer<typeof locomotionIntensitySchema>;
export const locomotionReasonSchema = z.enum([
  'restart_setup',
  'structural_adjustment',
  'maintain_shape',
  'support_run',
  'depth_run',
  'recovery_run',
  'press_commit',
  'contain',
  'loose_ball_race',
  'ball_carry',
  'receive_pass',
]);
export type LocomotionReason = z.infer<typeof locomotionReasonSchema>;
export const locomotionTelemetrySchema = z.object({
  distanceTotal: z.number().nonnegative(),
  distanceWalk: z.number().nonnegative(),
  distanceJog: z.number().nonnegative(),
  distanceRun: z.number().nonnegative(),
  distanceSprint: z.number().nonnegative(),
  sprintSeconds: z.number().nonnegative(),
  sprintBursts: z.number().int().nonnegative(),
  maxSpeed: z.number().nonnegative(),
});
export type LocomotionTelemetry = z.infer<typeof locomotionTelemetrySchema>;
export interface MatchTeamState {
  side: TeamSide;
  clubId: string;
  formation: FormationId;
  style: TacticalStyle;
  phase: MatchPhase;
  phaseElapsed: number;
}
export interface MatchBallState extends PitchPoint {
  height?: number;
  peakHeight?: number;
  flightProgress?: number;
  airborne?: boolean;
  ownerId?: string;
  from?: PitchPoint;
  target?: PitchPoint;
  intendedReceiverId?: string;
  travelElapsed?: number;
  travelDuration?: number;
  travelKind?:
    | 'pass'
    | 'through_ball'
    | 'cross'
    | 'long_distribution'
    | 'free_kick_delivery'
    | 'corner_delivery'
    | 'shot'
    | 'header'
    | 'throw_in';
  sourceAction?: MatchAction['type'];
  velocity?: PitchPoint;
  looseSince?: number;
  lastTouchPlayerId?: string;
  secondBallPriorityIds?: string[];
  targetHeight?: number;
  shot?: ShotDiagnostic;
}
export const shotResultSchema = z.enum(['goal', 'save', 'block', 'miss', 'post', 'crossbar']);
export type ShotResult = z.infer<typeof shotResultSchema>;
export const shotDiagnosticSchema = z.object({
  shooterId: z.string(),
  intendedTarget: z.object({ horizontal: z.number(), vertical: z.number() }),
  actualTarget: z.object({ horizontal: z.number(), vertical: z.number() }),
  error: z.object({ horizontal: z.number(), vertical: z.number() }),
  speed: z.number().positive().finite(),
  classification: z.enum(['on_target', 'wide', 'over', 'post', 'crossbar']),
  blockerId: z.string().optional(),
  keeperId: z.string().optional(),
  goalkeeperAction: z.enum(['catch', 'parry', 'parry_away', 'failed_save', 'no_chance']).optional(),
  saveDifficulty: z.number().min(0).max(1).optional(),
  outcome: shotResultSchema,
  reboundSource: z.enum(['goalkeeper', 'block', 'post', 'crossbar']).optional(),
});
export type ShotDiagnostic = z.infer<typeof shotDiagnosticSchema>;
export const offsideOffenceSchema = z.object({
  playerId: z.string(),
  at: z.number().nonnegative(),
  reason: z.enum(['attempted_receive', 'challenged_opponent', 'interfered']),
});
export const keeperInterventionSchema = z.object({
  keeperId: z.string(),
  intention: z.enum(['stay', 'claim', 'punch', 'attempt_interception']),
  target: pitchPointSchema,
  distanceToContact: z.number().nonnegative(),
  finalOutcome: z.enum(['keeper_claim', 'keeper_punch', 'keeper_miss']).optional(),
});
export const matchScoreSchema = z.object({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});
export interface TacticalMatchState {
  seed: string;
  time: number;
  decisionIndex: number;
  teams: Record<TeamSide, MatchTeamState>;
  players: MatchPlayerState[];
  ball: MatchBallState;
  possessionTeam: TeamSide;
  timeSincePossessionChanged: number;
  /** Selected action retained for legacy physical resolvers; its presence is not a busy flag. */
  currentAction?: MatchAction;
  currentActorId?: string;
  /** Historical last selected action, used by diagnostics and presentation. */
  latestAction?: MatchAction;
  /** Source recorded at commit time for this exact action, never inferred from nearby decisions. */
  currentActionSource?: ActionSource;
  latestActionSource?: ActionSource;
  actionCooldown: number;
  controlledFootballerId?: string;
  playerMovementIntent?: PlayerMovementIntent;
  pendingReceptionIntent?: PendingReceptionIntent;
  /** Short-lived canonical execution override shared by human and NPC carries. */
  ballCarrierIntent?: BallCarrierIntent;
  postActionAgencyCheckpoint?: {
    actorId: string;
    completedAction: MatchAction['type'];
    at: number;
  };
  playerDecisionGate?: PlayerDecisionGateState;
  pendingPlayerDecision?: PlayerDecisionOutcome;
  lastPlayerDecisionOutcome?: PlayerDecisionOutcome;
  ballOwnershipStartedAt?: number;
  scenario: RestartScenario;
  restart?: RestartLifecycle;
  score: z.infer<typeof matchScoreSchema>;
  currentPressure: number;
  nearestChallengerId?: string;
  lastPossessionChange?: {
    at: number;
    from: TeamSide;
    to: TeamSide;
    cause: 'tackle' | 'interception' | 'claim';
  };
  lastShotResult?: ShotResult;
  lastShot?: ShotDiagnostic;
  lastBallContact?: BallContact;
  goalCompletionUntil?: number;
  pendingKickoffTeam?: TeamSide;
  aerialContestantIds?: string[];
  lastAerialResult?:
    | 'controlled_header'
    | 'clearance_header'
    | 'attacking_header'
    | 'flick_on'
    | 'loose_ball'
    | 'keeper_claim'
    | 'keeper_punch'
    | 'keeper_miss';
  lastBoundaryRestart?: 'goal_kick' | 'corner' | 'throw_in';
  lastBoundaryCrossing?: PitchBoundaryCrossing & {
    previous: PitchPoint;
    lastTouchPlayerId?: string;
    lastTouchTeam?: TeamSide;
    restartTeam: TeamSide;
  };
  lastAerialContact?: {
    point: PitchPoint;
    ballHeight: number;
    candidates: Array<{
      playerId: string;
      horizontalDistance: number;
      reachableHeight: number;
      contactQuality: number;
    }>;
    contestantIds: string[];
    winnerId?: string;
  };
  restartAction?: MatchAction;
  offsideSnapshot?: OffsideSnapshot;
  lastOffsideOffence?: z.infer<typeof offsideOffenceSchema>;
  keeperIntervention?: z.infer<typeof keeperInterventionSchema>;
  receptionPreparation?: ReceptionPreparation;
  lastReceptionOutcome?: ReceptionOutcome;
  lastPassDiagnostic?: {
    intendedReceiverId: string;
    receiverPositionAtRelease: PitchPoint;
    receiverVelocityAtRelease: PitchPoint;
    predictedReceptionPoint: PitchPoint;
    actualContactPoint?: PitchPoint;
    awarenessDelay: number;
    receiverArrivalEstimate: number;
    bestDefenderArrivalEstimate: number;
    leadDistance: number;
    receptionOutcome?: ReceptionOutcome['kind'];
    finalResult?: 'completed' | 'intercepted' | 'unclaimed' | 'technical_error';
  };
}

// Runtime boundary schema deliberately validates the ephemeral geometry/control graph; profiles
// are already validated by the canonical world database schema.
export const tacticalMatchStateSchema = z
  .object({
    seed: z.string().min(1),
    time: z.number().nonnegative().finite(),
    decisionIndex: z.number().int().nonnegative(),
    teams: z.record(
      teamSideSchema,
      z.object({
        side: teamSideSchema,
        clubId: z.string(),
        formation: z.string(),
        style: tacticalStyleSchema,
        phase: matchPhaseSchema,
        phaseElapsed: z.number().nonnegative(),
      }),
    ),
    players: z.array(
      z.object({
        id: z.string(),
        team: teamSideSchema,
        position: pitchPointSchema,
        target: pitchPointSchema,
        anchor: pitchPointSchema,
        neutralAnchor: pitchPointSchema,
        idealTarget: pitchPointSchema,
      }),
    ),
    ball: pitchPointSchema.extend({
      ownerId: z.string().optional(),
      height: z.number().nonnegative().finite().optional(),
      peakHeight: z.number().nonnegative().finite().optional(),
      flightProgress: z.number().min(0).max(1).optional(),
      airborne: z.boolean().optional(),
      travelKind: z
        .enum([
          'pass',
          'through_ball',
          'cross',
          'long_distribution',
          'free_kick_delivery',
          'corner_delivery',
          'shot',
          'header',
          'throw_in',
        ])
        .optional(),
      sourceAction: z.enum(['hold', 'carry', 'pass', 'shot', 'cross', 'header']).optional(),
      looseSince: z.number().optional(),
      targetHeight: z.number().nonnegative().finite().optional(),
      shot: shotDiagnosticSchema.optional(),
    }),
    score: matchScoreSchema,
    currentPressure: z.number().min(0).max(1),
    possessionTeam: teamSideSchema,
    timeSincePossessionChanged: z.number().nonnegative(),
    actionCooldown: z.number().nonnegative(),
    controlledFootballerId: z.string().optional(),
    playerMovementIntent: playerMovementIntentSchema.optional(),
    pendingReceptionIntent: pendingReceptionIntentSchema.optional(),
    ballCarrierIntent: ballCarrierIntentSchema.optional(),
    postActionAgencyCheckpoint: z
      .object({
        actorId: z.string(),
        completedAction: z.enum(['hold', 'carry', 'pass', 'shot', 'cross', 'header']),
        at: z.number().nonnegative(),
      })
      .optional(),
    currentActionSource: actionSourceSchema.optional(),
    latestActionSource: actionSourceSchema.optional(),
    playerDecisionGate: playerDecisionGateStateSchema.optional(),
    pendingPlayerDecision: playerDecisionOutcomeSchema.optional(),
    lastPlayerDecisionOutcome: playerDecisionOutcomeSchema.optional(),
    ballOwnershipStartedAt: z.number().nonnegative().optional(),
    scenario: restartScenarioSchema,
    restart: restartLifecycleSchema.optional(),
    lastShot: shotDiagnosticSchema.optional(),
    lastBallContact: ballContactSchema.optional(),
    offsideSnapshot: offsideSnapshotSchema.optional(),
    lastOffsideOffence: offsideOffenceSchema.optional(),
    keeperIntervention: keeperInterventionSchema.optional(),
    lastBoundaryCrossing: pitchBoundaryCrossingSchema
      .extend({
        previous: pitchPointSchema,
        lastTouchPlayerId: z.string().optional(),
        lastTouchTeam: teamSideSchema.optional(),
        restartTeam: teamSideSchema,
      })
      .optional(),
    goalCompletionUntil: z.number().nonnegative().optional(),
    pendingKickoffTeam: teamSideSchema.optional(),
  })
  .passthrough();
