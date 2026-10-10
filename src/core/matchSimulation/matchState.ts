import { z } from 'zod';
import {
  looseBallLivenessObservationSchema,
  looseBallLivenessDiagnosticSchema,
  type LooseBallLivenessObservation,
  type LooseBallLivenessDiagnostic,
} from './looseBallLiveness';
import { matchFitnessSchema, type MatchFitness } from './matchFitness';
import { matchInjurySchema, type MatchInjury } from './matchInjuries';
import {
  droppedBallTouchRestrictionSchema,
  injuryAssessmentSchema,
  type DroppedBallTouchRestriction,
  type InjuryAssessment,
} from './injuryStoppage';
import { matchTimekeepingSchema, type MatchTimekeeping } from './matchTimekeeping';
import {
  restartBlockingObservationSchema,
  restartBlockingDiagnosticSchema,
  type RestartBlockingObservation,
  type RestartBlockingDiagnostic,
} from './restartLiveness';
import {
  matchSubstitutionRulesSchema,
  substitutionStateSchema,
  matchBenchPlayerSchema,
  departedMatchPlayerSchema,
  type MatchSubstitutionRules,
  type MatchSubstitutionState,
  type MatchBenchPlayer,
} from './substitutions';
import { ballSpinSchema, type BallSpin3d } from './ballPhysics';
import {
  stoppageLedgerSchema,
  type StoppageLedger,
  addedTimePolicySchema,
  type AddedTimePolicy,
} from './stoppageLedger';
import { ballAcquisitionSchema, type BallAcquisition } from './ballAcquisition';
import { aerialContactLockSchema } from './aerialPlay';
import {
  possessionLossSchema,
  pendingPossessionLossSchema,
  restartAwardSchema,
  type PossessionLoss,
  type RestartAward,
} from './possessionEvents';
import {
  defensiveTechniqueSchema,
  defensiveChallengeSchema,
  challengeDiagnosticSchema,
  defensiveTelemetrySchema,
  defensiveEpisodeSchema,
  type DefensiveChallenge,
  type ChallengeDiagnostic,
  type DefensiveEpisode,
} from './defensiveChallenges';
import {
  foulFactSchema,
  cardFactSchema,
  disciplineSchema,
  pendingAdvantageSchema,
  advantageFactSchema,
  type FoulFact,
  type CardFact,
  type AdvantageFact,
} from './matchRules';
import { canonicalActionEventSchema, type CanonicalActionEvent } from './actionEvents';
import { matchEventSchema, type MatchEvent } from './matchEventFeed';
import { teamThreatMemorySchema, type TeamThreatMemory } from './teamThreatMemory';
import { tacticalPreferencesSchema, type TacticalPreferences } from './tacticalPreferences';
import {
  controlledBallContactSchema,
  contactControlTelemetrySchema,
  groundContactFactSchema,
  type ControlledBallContact,
  type ContactControlTelemetry,
  type GroundContactFact,
} from './ballContactGeometry';
import type { FootballerProfile } from '../../types/domain';
import type { FormationId, FormationSlot, TacticalDuty } from '../footballerWorld';
import {
  physicalPointSchema,
  pitchPointSchema,
  teamSideSchema,
  type PhysicalPoint,
  type PitchPoint,
  type TeamSide,
} from './matchSpace';
import { cornerPlanSchema, tacticalIntentSchema, tacticalZoneSchema } from './tacticalSituations';
import { ballContactSchema, type BallContact } from './ballFlight';
import {
  throwInDiagnosticSchema,
  throwInRestrictionSchema,
  type ThrowInDiagnostic,
  type ThrowInRestriction,
} from './throwIn';
import { offsideSnapshotSchema, type OffsideSnapshot } from './offside';
import { passExecutionTypeSchema, type PassExecutionType } from './passExecution';
import { passDecisionQualitySchema, type PassDecisionQuality } from './passDecision';
import { pitchBoundaryCrossingSchema, type PitchBoundaryCrossing } from './pitchBoundary';
import type { ReceptionOutcome, ReceptionPreparation } from './passReception';
import type { MatchStatistics } from './playerMatchStats';
import { onBallPreparationSchema, type OnBallPreparation } from './onBallPreparation';
import {
  footShotContactSchema,
  shotContactSchema,
  shotExecutionProfileSchema,
  shotExecutionErrorProfileSchema,
  shotIntentSchema,
  freeKickStrikeProfileSchema,
} from './shotIntent';

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
export const ballMovementModeSchema = z.enum(['carry', 'sprint', 'dribble', 'retain']);
export type BallMovementMode = z.infer<typeof ballMovementModeSchema>;
export const matchActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('challenge'),
    actorId: z.string(),
    opponentId: z.string(),
    technique: defensiveTechniqueSchema,
  }),
  z.object({ type: z.literal('hold'), actorId: z.string() }),
  z.object({
    type: z.literal('carry'),
    actorId: z.string(),
    target: pitchPointSchema,
    movementMode: ballMovementModeSchema.optional(),
  }),
  z.object({ type: z.literal('space_pass'), actorId: z.string(), target: pitchPointSchema }),
  z.object({
    type: z.literal('pass'),
    receiverPositionAtSelection: pitchPointSchema.optional(),
    actorId: z.string(),
    receiverId: z.string(),
    target: pitchPointSchema,
    intent: z.enum(['support', 'progressive', 'direct', 'lead', 'through']),
    delivery: z.enum(['ground', 'lofted']).optional(),
    requestedSpace: pitchPointSchema.optional(),
    firstTime: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('shot'),
    actorId: z.string(),
    target: pitchPointSchema,
    intent: shotIntentSchema,
    freeKickProfile: freeKickStrikeProfileSchema.optional(),
    contact: footShotContactSchema.optional(),
    decisionBallHeight: z.number().nonnegative().optional(),
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
    firstTime: z.boolean().optional(),
    decisionBallHeight: z.number().nonnegative().optional(),
    goalTarget: z
      .object({ horizontal: z.number().min(-1).max(1), vertical: z.number().min(0).max(1) })
      .optional(),
  }),
]);
export type MatchAction = z.infer<typeof matchActionSchema>;
export const actionSourceSchema = z.enum([
  'human_selected',
  'dev_ai_selected',
  'restart_liveness_watchdog',
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
  commitment: z.enum(['balanced', 'normal', 'aggressive']).optional(),
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
  sourceAction: z
    .enum(['hold', 'carry', 'pass', 'space_pass', 'shot', 'cross', 'header'])
    .optional(),
  actionSource: actionSourceSchema.optional(),
});
export type PendingReceptionIntent = z.infer<typeof pendingReceptionIntentSchema>;
export const ballCarrierIntentSchema = z.object({
  actorId: z.string(),
  type: z.literal('carry'),
  target: pitchPointSchema,
  startedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  estimatedArrival: z.number().nonnegative(),
  startPosition: pitchPointSchema,
  closestPointReached: pitchPointSchema,
  humanSelected: z.boolean(),
  movementMode: ballMovementModeSchema.optional(),
  lastProgressAt: z.number().nonnegative().optional(),
  executionMode: z.enum(['burst', 'controlled', 'tight_dribble', 'evade', 'shield']).optional(),
  modeSince: z.number().nonnegative().optional(),
  localTarget: pitchPointSchema.optional(),
  touchDistance: z.number().positive().optional(),
});
export type BallCarrierIntent = z.infer<typeof ballCarrierIntentSchema>;
export const possessionDecisionContextSchema = z.object({
  zone: z.number().int().min(0).max(3),
  nearestDefenderId: z.string().optional(),
  defenderDistance: z.number().nonnegative(),
  defenderBearing: z.number(),
  contested: z.boolean(),
  keeperRushing: z.boolean(),
  keeperChallenge: z.boolean(),
  shotCategory: z.number().int().min(0).max(3),
  shotValue: z.number().min(0).max(1),
  goalDistance: z.number().nonnegative(),
  blockingDefenders: z.number().int().nonnegative(),
  decisiveReceiverIds: z.array(z.string()),
  supportReceiverIds: z.array(z.string()).optional(),
  touchDistance: z.number().nonnegative(),
});
export const humanPossessionEpisodeSchema = z.object({
  actorId: z.string(),
  startedAt: z.number().nonnegative(),
  ownershipStartedAt: z.number().nonnegative(),
  ballEpisode: z.number().int().nonnegative(),
  decisionAt: z.number().nonnegative(),
  intent: z.enum(['control', 'carry', 'sprint', 'dribble', 'retain']).optional(),
  target: pitchPointSchema.optional(),
  lastProgressAt: z.number().nonnegative().optional(),
  progressPoint: pitchPointSchema.optional(),
  context: possessionDecisionContextSchema,
});
export type HumanPossessionEpisode = z.infer<typeof humanPossessionEpisodeSchema>;
export const carryDiagnosticSchema = z.object({
  actorId: z.string(),
  requestedTarget: pitchPointSchema,
  startPosition: pitchPointSchema,
  estimatedArrival: z.number().nonnegative(),
  closestPointReached: pitchPointSchema,
  distanceRemaining: z.number().nonnegative(),
  terminationReason: z.enum([
    'target_reached',
    'ball_lost',
    'contact',
    'replaced',
    'invalid_target',
    'safety_timeout',
    'decision_waypoint',
    'material_change',
    'route_blocked',
  ]),
  actualDuration: z.number().nonnegative(),
  redecisionReason: z.string().optional(),
});
export type CarryDiagnostic = z.infer<typeof carryDiagnosticSchema>;
export const playerDecisionGateStateSchema = z.object({
  lastSituationSignature: z.string().optional(),
  lastResolvedAt: z.number().nonnegative().optional(),
});
export type PlayerDecisionGateState = z.infer<typeof playerDecisionGateStateSchema>;
export const matchPlanningScheduleSchema = z.object({
  lastTacticalPlanAt: z.number().nonnegative(),
  semanticKey: z.string(),
});
export type MatchPlanningSchedule = z.infer<typeof matchPlanningScheduleSchema>;
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
    'goalkeeper_response',
    'loose_ball',
    'restart',
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
export const restartPhaseSchema = z.enum([
  'setup',
  'preparing',
  'awaiting_decision',
  'kick_preparation',
  'release',
]);
export type RestartPhase = z.infer<typeof restartPhaseSchema>;
export const restartLifecycleSchema = z.object({
  origin: z.enum(['live_event', 'dev_fixture']).optional(),
  awardId: z.string().optional(),
  spot: pitchPointSchema.optional(),
  ceremonial: z.boolean().optional(),
  selectedAction: matchActionSchema.optional(),
  selectedSource: actionSourceSchema.optional(),
  selectedAt: z.number().nonnegative().optional(),
  preparationStartedAt: z.number().nonnegative().optional(),
  executing: z.boolean().optional(),
  retrieval: z
    .object({
      playerId: z.string(),
      stage: z.enum(['approach', 'transport', 'placed']),
      attachedOffset: physicalPointSchema.optional(),
    })
    .optional(),
  readiness: z
    .object({
      ballReady: z.boolean(),
      takerReady: z.boolean(),
      legalReady: z.boolean(),
      tacticalReady: z.boolean(),
      blockers: z.array(z.string()).max(48),
    })
    .optional(),
  blockedSince: z.number().nonnegative().optional(),
  indirect: z.boolean().optional(),
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
export const restartWallResponseSchema = z.object({
  awardId: z.string(),
  choice: z.enum(['hold', 'jump']),
  startedAt: z.number().nonnegative(),
  reactionAt: z.number().nonnegative(),
  jumpHeight: z.number().nonnegative(),
  previousJumpHeight: z.number().nonnegative(),
});
export const restartLivenessDiagnosticSchema = z.object({
  at: z.number().nonnegative(),
  scenario: restartScenarioSchema,
  takerId: z.string(),
  controlled: z.boolean(),
  legalActionCount: z.number().int().nonnegative(),
  setupSeconds: z.number().nonnegative(),
  recovery: z.literal('canonical_restart_fallback'),
});
export type RestartLivenessDiagnostic = z.infer<typeof restartLivenessDiagnosticSchema>;

export interface MatchPlayerState {
  goalkeeperRole?: boolean;
  fitness?: MatchFitness;
  injury?: MatchInjury;
  restartWallResponse?: z.infer<typeof restartWallResponseSchema>;
  id: string;
  /** Match-clock entry time. Existing starting players default to kickoff (zero). */
  activeSince?: number;
  team: TeamSide;
  profile: FootballerProfile;
  slotIndex: number;
  slot: FormationSlot;
  duty: TacticalDuty;
  position: PitchPoint;
  target: PitchPoint;
  velocity: PitchPoint;
  /** Canonical body orientation in radians; independent from locomotion velocity. */
  facingAngle: number;
  desiredFacingAngle?: number;
  movementMode?: 'forward' | 'diagonal' | 'shuffle' | 'backpedal' | 'turn_and_run';
  turnRate?: number;
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
  /** Start of a sustained below-sprint period; provides exit hysteresis for sprint episodes. */
  sprintRecoveryStartedAt?: number;
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
  /** Strategic coach preference only; physical execution remains shared. */
  tacticalPreferences?: TacticalPreferences;
  phase: MatchPhase;
  phaseElapsed: number;
  /** Bounded canonical football evidence and gradual team response, independent of presentation. */
  threatMemory?: TeamThreatMemory;
}
export interface MatchBallState extends PitchPoint {
  spin?: BallSpin3d;
  executionType?: PassExecutionType;
  height?: number;
  releaseHeight?: number;
  airborne?: boolean;
  ownerId?: string;
  /** Last playable location. Flights may start/end outside the touch/goal lines. */
  from?: PhysicalPoint;
  /** Physical endpoint used for continuous contact ordering; deliberately unbounded. */
  target?: PhysicalPoint;
  intendedReceiverId?: string;
  /** Elapsed physical integration time since release. */
  flightTime?: number;
  /** Integrated path length, used only for diagnostics. */
  distanceTravelled?: number;
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
  sourceAction?: Exclude<MatchAction['type'], 'challenge'>;
  /** Canonical SI-like three-dimensional velocity. */
  velocity?: { x: number; y: number; z?: number };
  bounceCount?: number;
  launchVelocity?: { x: number; y: number; z: number };
  launchSpeed?: number;
  launchElevation?: number;
  looseSince?: number;
  lastTouchPlayerId?: string;
  secondBallPriorityIds?: string[];
  targetHeight?: number;
  shot?: ShotDiagnostic;
}
export const shotResultSchema = z.enum(['goal', 'save', 'block', 'miss', 'post', 'crossbar']);
export type ShotResult = z.infer<typeof shotResultSchema>;
export const shotDiagnosticSchema = z.object({
  freeKickProfile: freeKickStrikeProfileSchema.optional(),
  launchSpin: ballSpinSchema.optional(),
  shotId: z.string(),
  shooterId: z.string(),
  releasedAt: z.number().nonnegative().optional(),
  // Optional only for old snapshots; every newly resolved shot records this evidence.
  intent: z.enum(['driven', 'placed', 'chip', 'header']).optional(),
  contact: shotContactSchema.optional(),
  firstTime: z.boolean().optional(),
  ballHeightAtDecision: z.number().nonnegative().optional(),
  ballHeightAtContact: z.number().nonnegative().optional(),
  launchSpeed: z.number().positive().finite().optional(),
  launchVerticalComponent: z.number().finite().optional(),
  executionProfile: shotExecutionProfileSchema.optional(),
  executionErrorProfile: shotExecutionErrorProfileSchema.optional(),
  context: z.enum(['open_play', 'free_kick', 'penalty', 'header']),
  distance: z.number().nonnegative(),
  angle: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
  blockingDefenders: z.number().int().nonnegative(),
  baseXg: z.number().min(0).max(1),
  effectiveScoringExpectation: z.number().min(0).max(1),
  shooterExecutionQuality: z.number().min(0).max(1),
  intendedTarget: z.object({ horizontal: z.number(), vertical: z.number() }),
  actualTarget: z.object({ horizontal: z.number(), vertical: z.number() }),
  error: z.object({ horizontal: z.number(), vertical: z.number() }),
  speed: z.number().positive().finite(),
  classification: z.enum(['on_target', 'wide', 'over', 'post', 'crossbar']),
  blockerId: z.string().optional(),
  keeperId: z.string().optional(),
  goalkeeperAction: z.enum(['catch', 'parry', 'parry_away', 'failed_save', 'no_chance']).optional(),
  saveDifficulty: z.number().min(0).max(1).optional(),
  goalkeeperReaction: z.number().nonnegative().optional(),
  goalkeeperReach: z.number().nonnegative().optional(),
  outcome: shotResultSchema.optional(),
  reboundSource: z.enum(['goalkeeper', 'block', 'post', 'crossbar']).optional(),
});
export type ShotDiagnostic = z.infer<typeof shotDiagnosticSchema>;
export const offsideOffenceSchema = z.object({
  playerId: z.string(),
  at: z.number().nonnegative(),
  reason: z.enum(['attempted_receive', 'challenged_opponent', 'interfered']),
  passerId: z.string().optional(),
  releasedAt: z.number().nonnegative().optional(),
  offsideLineX: z.number().finite().optional(),
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
export const matchPeriodSchema = z.enum([
  'first_half',
  'half_time',
  'second_half',
  'full_time',
  'abandoned',
]);
export type MatchPeriod = z.infer<typeof matchPeriodSchema>;
export const matchTerminationSchema = z.object({
  reason: z.literal('insufficient_players'),
  at: z.number().nonnegative(),
  team: teamSideSchema,
  activePlayers: z.number().int().min(0).max(6),
});
export const recentDuelSchema = z.object({
  participants: z.tuple([z.string(), z.string()]),
  winnerId: z.string().optional(),
  resolvedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  ballEpisode: z.number().int().nonnegative(),
});
export type RecentDuel = z.infer<typeof recentDuelSchema>;

/** Acquisition evidence survives the winner releasing the ball later in the same tick. */
export const possessionChangeSchema = z.object({
  at: z.number().nonnegative(),
  from: teamSideSchema,
  to: teamSideSchema,
  cause: z.enum(['tackle', 'interception', 'claim']),
  winnerId: z.string().optional(),
  loserId: z.string().optional(),
  challengeId: z.string().optional(),
});

export const ballRecoverySchema = z.object({
  id: z.string(),
  at: z.number().nonnegative(),
  playerId: z.string(),
});

export const aerialContactSchema = z.object({
  id: z.string().optional(),
  point: pitchPointSchema,
  ballHeight: z.number().nonnegative(),
  candidates: z.array(
    z.object({
      playerId: z.string(),
      horizontalDistance: z.number().nonnegative(),
      reachableHeight: z.number().nonnegative(),
      contactQuality: z.number().nonnegative(),
    }),
  ),
  contestantIds: z.array(z.string()),
  winnerId: z.string().optional(),
});

export const passDiagnosticSchema = z.object({
  receiverRelationshipAtRelease: z
    .enum(['support_behind', 'provide_width', 'overlap', 'underlap', 'rest_defence'])
    .optional(),
  incomingSpeed: z.number().nonnegative().optional(),
  incomingHeight: z.number().nonnegative().optional(),
  actionSource: actionSourceSchema.optional(),
  selectionQuality: passDecisionQualitySchema.optional(),
  executionType: passExecutionTypeSchema.optional(),
  intendedTarget: pitchPointSchema.optional(),
  physicalTarget: physicalPointSchema.optional(),
  executionQuality: z.number().min(0).max(1).optional(),
  requestedSpace: pitchPointSchema.optional(),
  delivery: z.enum(['ground', 'lofted']).optional(),
  passId: z.string(),
  passerId: z.string(),
  intendedReceiverId: z.string(),
  actualReceiverId: z.string().optional(),
  releasedAt: z.number().nonnegative(),
  resolvedAt: z.number().nonnegative().optional(),
  receiverPositionAtRelease: pitchPointSchema,
  receiverVelocityAtRelease: physicalPointSchema,
  predictedReceptionPoint: pitchPointSchema,
  actualContactPoint: pitchPointSchema.optional(),
  awarenessDelay: z.number().nonnegative(),
  receiverArrivalEstimate: z.number().nonnegative(),
  bestDefenderArrivalEstimate: z.number().nonnegative(),
  leadDistance: z.number().nonnegative(),
  intent: z.enum(['support', 'progressive', 'direct', 'lead', 'through']).optional(),
  ballArrivalEstimate: z.number().nonnegative().optional(),
  meetingErrorSeconds: z.number().finite().optional(),
  predictionHorizon: z.number().nonnegative().optional(),
  receptionOutcome: z
    .enum(['clean_control', 'directional_control', 'heavy_touch', 'failed_control'])
    .optional(),
  finalResult: z
    .enum(['completed', 'intercepted', 'inaccurate', 'out_of_play', 'unclaimed', 'technical_error'])
    .optional(),
});

export interface TacticalMatchState {
  injuryAssessment?: InjuryAssessment;
  droppedBallTouchRestriction?: DroppedBallTouchRestriction;
  addedTimePolicy?: AddedTimePolicy;
  timekeeping?: MatchTimekeeping;
  restartBlockingObservation?: RestartBlockingObservation;
  restartLivenessDiagnostics?: RestartBlockingDiagnostic[];
  looseBallLivenessObservation?: LooseBallLivenessObservation;
  looseBallLivenessDiagnostics?: LooseBallLivenessDiagnostic[];
  substitutionRules?: MatchSubstitutionRules;
  substitutionState?: MatchSubstitutionState;
  bench?: Record<TeamSide, MatchBenchPlayer[]>;
  departedPlayers?: MatchPlayerState[];
  injuries?: MatchInjury[];
  pendingInjuryAssessment?: string;
  /** One bounded anticipation plan; ownership never guarantees the next foot contact. */
  controlledBallContact?: ControlledBallContact;
  lastGroundContact?: GroundContactFact;
  contactControlTelemetry?: ContactControlTelemetry;
  ballAcquisition?: BallAcquisition;
  aerialContactLocks?: z.infer<typeof aerialContactLockSchema>[];
  seed: string;
  time: number;
  decisionIndex: number;
  /** Canonical period lifecycle; added time derives from the stoppage ledger. */
  status?: MatchPeriod;
  termination?: z.infer<typeof matchTerminationSchema>;
  periodEndPending?: boolean;
  statistics?: MatchStatistics;
  teams: Record<TeamSide, MatchTeamState>;
  players: MatchPlayerState[];
  ball: MatchBallState;
  possessionTeam: TeamSide;
  timeSincePossessionChanged: number;
  /** One contact episode may resolve only once; expires after recovery or separation. */
  recentDuel?: RecentDuel;
  defensiveEpisodes?: DefensiveEpisode[];
  ballEpisode?: number;
  /** Selected action retained for legacy physical resolvers; its presence is not a busy flag. */
  currentAction?: MatchAction;
  currentActorId?: string;
  /** Historical last selected action, used by diagnostics and presentation. */
  latestAction?: MatchAction;
  /** Source recorded at commit time for this exact action, never inferred from nearby decisions. */
  currentActionSource?: ActionSource;
  latestActionSource?: ActionSource;
  actionCooldown: number;
  defensiveChallenge?: DefensiveChallenge;
  lastChallenge?: ChallengeDiagnostic;
  defensiveTelemetry?: z.infer<typeof defensiveTelemetrySchema>;
  lastFoul?: FoulFact;
  lastPenaltyAwardId?: string;
  lastCard?: CardFact;
  recentCards?: CardFact[];
  discipline?: z.infer<typeof disciplineSchema>;
  pendingAdvantage?: z.infer<typeof pendingAdvantageSchema>;
  pendingCards?: FoulFact[];
  lastAdvantage?: AdvantageFact;
  actionEvents?: CanonicalActionEvent[];
  actionEventSequence?: number;
  /** Permanent renderer-independent facts; replay footage has separate bounded retention. */
  matchEvents?: MatchEvent[];
  controlledFootballerId?: string;
  /** Identity stays canonical; headless/no-intervention runs can disable human agency alone. */
  playerAgencyEnabled?: boolean;
  playerMovementIntent?: PlayerMovementIntent;
  pendingReceptionIntent?: PendingReceptionIntent;
  shotAgencyRequest?: MatchAction;
  /** Short-lived canonical execution override shared by human and NPC carries. */
  ballCarrierIntent?: BallCarrierIntent;
  /** Human ownership lasts for the physical possession, never an arbitrary cooldown. */
  humanPossessionEpisode?: HumanPossessionEpisode;
  postActionAgencyCheckpoint?: {
    actorId: string;
    completedAction: MatchAction['type'];
    at: number;
  };
  /** Canonical multi-rate scheduler metadata. Physics never depends on wall time or batch size. */
  planningSchedule?: MatchPlanningSchedule;
  playerDecisionGate?: PlayerDecisionGateState;
  pendingPlayerDecision?: PlayerDecisionOutcome;
  lastPlayerDecisionOutcome?: PlayerDecisionOutcome;
  ballOwnershipStartedAt?: number;
  scenario: RestartScenario;
  restart?: RestartLifecycle;
  stoppageLedger?: StoppageLedger;
  restartTouchRestriction?: {
    awardId: string;
    scenario: RestartScenario;
    takerId: string;
    team: TeamSide;
    indirect: boolean;
    touchedByOther: boolean;
  };
  postGoal?: {
    goalId: string;
    scoringTeam: TeamSide;
    kickoffTeam: TeamSide;
    startedAt: number;
    urgent: boolean;
    retrieverId: string;
    reactionUntil: number;
    targets: Record<string, PitchPoint>;
  };
  /** DEV-observable liveness duration; canonical decisions never depend on it. */
  restartStalledSeconds?: number;
  /** Abnormal safety-net activation; normal restart resolution never writes this diagnostic. */
  lastRestartLivenessRecovery?: RestartLivenessDiagnostic;
  lastInvariantRecovery?: { at: number; kind: 'outside_pitch'; point: PhysicalPoint };
  score: z.infer<typeof matchScoreSchema>;
  currentPressure: number;
  nearestChallengerId?: string;
  lastPossessionChange?: z.infer<typeof possessionChangeSchema>;
  lastPossessionLoss?: PossessionLoss;
  pendingPossessionLoss?: z.infer<typeof pendingPossessionLossSchema>;
  lastRestartAward?: RestartAward;
  lastBallRecovery?: z.infer<typeof ballRecoverySchema>;
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
  lastAerialContact?: z.infer<typeof aerialContactSchema>;
  restartAction?: MatchAction;
  throwInRestriction?: ThrowInRestriction;
  lastThrowInDiagnostic?: ThrowInDiagnostic;
  offsideSnapshot?: OffsideSnapshot;
  lastOffsideOffence?: z.infer<typeof offsideOffenceSchema>;
  keeperIntervention?: z.infer<typeof keeperInterventionSchema>;
  receptionPreparation?: ReceptionPreparation;
  onBallPreparation?: OnBallPreparation;
  lastReceptionOutcome?: ReceptionOutcome;
  /** Retains a physical incoming result when a prepared one-touch pass starts a new diagnostic. */
  lastResolvedPass?: TacticalMatchState['lastPassDiagnostic'];
  lastPassDiagnostic?: {
    receiverRelationshipAtRelease?:
      | 'support_behind'
      | 'provide_width'
      | 'overlap'
      | 'underlap'
      | 'rest_defence';
    incomingSpeed?: number;
    incomingHeight?: number;
    actionSource?: ActionSource;
    selectionQuality?: PassDecisionQuality;
    intendedTarget?: PitchPoint;
    physicalTarget?: PhysicalPoint;
    executionQuality?: number;
    executionType?: PassExecutionType;
    requestedSpace?: PitchPoint;
    delivery?: 'ground' | 'lofted';
    passId: string;
    passerId: string;
    intendedReceiverId: string;
    /** Actual controlled teammate contact may differ from the selected passing target. */
    actualReceiverId?: string;
    releasedAt: number;
    resolvedAt?: number;
    receiverPositionAtRelease: PitchPoint;
    receiverVelocityAtRelease: PitchPoint;
    predictedReceptionPoint: PitchPoint;
    actualContactPoint?: PitchPoint;
    awarenessDelay: number;
    receiverArrivalEstimate: number;
    bestDefenderArrivalEstimate: number;
    leadDistance: number;
    intent?: 'support' | 'progressive' | 'direct' | 'lead' | 'through';
    ballArrivalEstimate?: number;
    meetingErrorSeconds?: number;
    predictionHorizon?: number;
    receptionOutcome?: ReceptionOutcome['kind'];
    finalResult?:
      | 'completed'
      | 'intercepted'
      | 'inaccurate'
      | 'out_of_play'
      | 'unclaimed'
      | 'technical_error';
  };
  lastCarryDiagnostic?: CarryDiagnostic;
}

// Runtime boundary schema deliberately validates the ephemeral geometry/control graph; profiles
// are already validated by the canonical world database schema.
export const tacticalMatchStateSchema = z
  .object({
    injuryAssessment: injuryAssessmentSchema.optional(),
    droppedBallTouchRestriction: droppedBallTouchRestrictionSchema.optional(),
    addedTimePolicy: addedTimePolicySchema.optional(),
    timekeeping: matchTimekeepingSchema.optional(),
    restartBlockingObservation: restartBlockingObservationSchema.optional(),
    restartLivenessDiagnostics: z.array(restartBlockingDiagnosticSchema).max(32).optional(),
    looseBallLivenessObservation: looseBallLivenessObservationSchema.optional(),
    looseBallLivenessDiagnostics: z.array(looseBallLivenessDiagnosticSchema).max(32).optional(),
    substitutionRules: matchSubstitutionRulesSchema.optional(),
    substitutionState: substitutionStateSchema.optional(),
    bench: z
      .object({
        home: z.array(matchBenchPlayerSchema).max(30),
        away: z.array(matchBenchPlayerSchema).max(30),
      })
      .optional(),
    departedPlayers: z.array(departedMatchPlayerSchema).max(30).optional(),
    injuries: z.array(matchInjurySchema).max(32).optional(),
    pendingInjuryAssessment: z.string().optional(),
    stoppageLedger: stoppageLedgerSchema.optional(),
    restartTouchRestriction: z
      .object({
        awardId: z.string(),
        scenario: restartScenarioSchema,
        takerId: z.string(),
        team: teamSideSchema,
        indirect: z.boolean(),
        touchedByOther: z.boolean(),
      })
      .optional(),
    postGoal: z
      .object({
        goalId: z.string(),
        scoringTeam: teamSideSchema,
        kickoffTeam: teamSideSchema,
        startedAt: z.number().nonnegative(),
        urgent: z.boolean(),
        retrieverId: z.string(),
        reactionUntil: z.number().nonnegative(),
        targets: z.record(z.string(), pitchPointSchema),
      })
      .optional(),
    ballAcquisition: ballAcquisitionSchema.optional(),
    controlledBallContact: controlledBallContactSchema.optional(),
    lastGroundContact: groundContactFactSchema.optional(),
    contactControlTelemetry: contactControlTelemetrySchema.optional(),
    aerialContactLocks: z.array(aerialContactLockSchema).max(22).optional(),
    seed: z.string().min(1),
    time: z.number().nonnegative().finite(),
    decisionIndex: z.number().int().nonnegative(),
    status: matchPeriodSchema,
    termination: matchTerminationSchema.optional(),
    periodEndPending: z.boolean().optional(),
    teams: z.record(
      teamSideSchema,
      z
        .object({
          side: teamSideSchema,
          clubId: z.string(),
          formation: z.string(),
          style: tacticalStyleSchema,
          tacticalPreferences: tacticalPreferencesSchema.optional(),
          phase: matchPhaseSchema,
          phaseElapsed: z.number().nonnegative(),
          threatMemory: teamThreatMemorySchema.optional(),
        })
        .passthrough(),
    ),
    players: z.array(
      z
        .object({
          id: z.string(),
          goalkeeperRole: z.boolean().optional(),
          fitness: matchFitnessSchema.optional(),
          injury: matchInjurySchema.optional(),
          restartWallResponse: restartWallResponseSchema.optional(),
          activeSince: z.number().nonnegative().optional(),
          team: teamSideSchema,
          position: physicalPointSchema,
          velocity: physicalPointSchema.optional(),
          facingAngle: z.number().finite(),
          desiredFacingAngle: z.number().finite().optional(),
          movementMode: z
            .enum(['forward', 'diagonal', 'shuffle', 'backpedal', 'turn_and_run'])
            .optional(),
          turnRate: z.number().nonnegative().finite().optional(),
          target: physicalPointSchema,
          anchor: pitchPointSchema,
          neutralAnchor: pitchPointSchema,
          idealTarget: physicalPointSchema,
        })
        .passthrough(),
    ),
    ball: physicalPointSchema
      .extend({
        spin: ballSpinSchema.optional(),
        ownerId: z.string().optional(),
        height: z.number().nonnegative().finite().optional(),
        releaseHeight: z.number().nonnegative().finite().optional(),
        airborne: z.boolean().optional(),
        flightTime: z.number().nonnegative().finite().optional(),
        distanceTravelled: z.number().nonnegative().finite().optional(),
        velocity: z
          .object({
            x: z.number().finite(),
            y: z.number().finite(),
            z: z.number().finite().optional(),
          })
          .optional(),
        bounceCount: z.number().int().nonnegative().optional(),
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
        sourceAction: z
          .enum(['hold', 'carry', 'pass', 'space_pass', 'shot', 'cross', 'header'])
          .optional(),
        executionType: passExecutionTypeSchema.optional(),
        looseSince: z.number().optional(),
        targetHeight: z.number().nonnegative().finite().optional(),
        shot: shotDiagnosticSchema.optional(),
        from: physicalPointSchema.optional(),
        target: physicalPointSchema.optional(),
      })
      .passthrough(),
    score: matchScoreSchema,
    currentPressure: z.number().min(0).max(1),
    possessionTeam: teamSideSchema,
    timeSincePossessionChanged: z.number().nonnegative(),
    lastPossessionChange: possessionChangeSchema.optional(),
    lastPossessionLoss: possessionLossSchema.optional(),
    pendingPossessionLoss: pendingPossessionLossSchema.optional(),
    lastRestartAward: restartAwardSchema.optional(),
    lastBallRecovery: ballRecoverySchema.optional(),
    lastAerialContact: aerialContactSchema.optional(),
    recentDuel: recentDuelSchema.optional(),
    defensiveEpisodes: z.array(defensiveEpisodeSchema).max(22).optional(),
    ballEpisode: z.number().int().nonnegative().optional(),
    actionCooldown: z.number().nonnegative(),
    defensiveChallenge: defensiveChallengeSchema.optional(),
    lastChallenge: challengeDiagnosticSchema.optional(),
    defensiveTelemetry: defensiveTelemetrySchema.optional(),
    lastFoul: foulFactSchema.optional(),
    lastPenaltyAwardId: z.string().optional(),
    lastCard: cardFactSchema.optional(),
    recentCards: z.array(cardFactSchema).max(22).optional(),
    discipline: disciplineSchema.optional(),
    pendingAdvantage: pendingAdvantageSchema.optional(),
    pendingCards: z.array(foulFactSchema).max(22).optional(),
    lastAdvantage: advantageFactSchema.optional(),
    actionEvents: z.array(canonicalActionEventSchema).max(96).optional(),
    actionEventSequence: z.number().int().nonnegative().optional(),
    matchEvents: z.array(matchEventSchema).optional(),
    controlledFootballerId: z.string().optional(),
    playerAgencyEnabled: z.boolean().optional(),
    playerMovementIntent: playerMovementIntentSchema.optional(),
    pendingReceptionIntent: pendingReceptionIntentSchema.optional(),
    shotAgencyRequest: matchActionSchema.optional(),
    ballCarrierIntent: ballCarrierIntentSchema.optional(),
    humanPossessionEpisode: humanPossessionEpisodeSchema.optional(),
    lastCarryDiagnostic: carryDiagnosticSchema.optional(),
    postActionAgencyCheckpoint: z
      .object({
        actorId: z.string(),
        completedAction: z.enum(['hold', 'carry', 'pass', 'shot', 'cross', 'header', 'challenge']),
        at: z.number().nonnegative(),
      })
      .optional(),
    planningSchedule: matchPlanningScheduleSchema.optional(),
    currentActionSource: actionSourceSchema.optional(),
    latestActionSource: actionSourceSchema.optional(),
    playerDecisionGate: playerDecisionGateStateSchema.optional(),
    pendingPlayerDecision: playerDecisionOutcomeSchema.optional(),
    lastPlayerDecisionOutcome: playerDecisionOutcomeSchema.optional(),
    ballOwnershipStartedAt: z.number().nonnegative().optional(),
    scenario: restartScenarioSchema,
    restart: restartLifecycleSchema.optional(),
    throwInRestriction: throwInRestrictionSchema.optional(),
    lastThrowInDiagnostic: throwInDiagnosticSchema.optional(),
    lastRestartLivenessRecovery: restartLivenessDiagnosticSchema.optional(),
    lastShot: shotDiagnosticSchema.optional(),
    lastBallContact: ballContactSchema.optional(),
    offsideSnapshot: offsideSnapshotSchema.optional(),
    lastOffsideOffence: offsideOffenceSchema.optional(),
    keeperIntervention: keeperInterventionSchema.optional(),
    onBallPreparation: onBallPreparationSchema.optional(),
    lastPassDiagnostic: passDiagnosticSchema.optional(),
    lastResolvedPass: passDiagnosticSchema.optional(),
    lastBoundaryCrossing: pitchBoundaryCrossingSchema
      .extend({
        previous: physicalPointSchema,
        lastTouchPlayerId: z.string().optional(),
        lastTouchTeam: teamSideSchema.optional(),
        restartTeam: teamSideSchema,
      })
      .optional(),
    goalCompletionUntil: z.number().nonnegative().optional(),
    pendingKickoffTeam: teamSideSchema.optional(),
  })
  .passthrough();
