import { z } from 'zod';
import type { FootballerProfile } from '../../types/domain';
import type { FormationId, FormationSlot, TacticalDuty } from '../footballerWorld';
import { pitchPointSchema, teamSideSchema, type PitchPoint, type TeamSide } from './matchSpace';
import { cornerPlanSchema, tacticalIntentSchema, tacticalZoneSchema } from './tacticalSituations';

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
}
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
    | 'header';
  sourceAction?: MatchAction['type'];
  velocity?: PitchPoint;
  looseSince?: number;
  lastTouchPlayerId?: string;
  secondBallPriorityIds?: string[];
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
  goalkeeperAction: z.enum(['catch', 'parry', 'parry_away', 'failed_save', 'no_chance']).optional(),
  saveDifficulty: z.number().min(0).max(1).optional(),
  outcome: shotResultSchema,
  reboundSource: z.enum(['goalkeeper', 'block', 'post', 'crossbar']).optional(),
});
export type ShotDiagnostic = z.infer<typeof shotDiagnosticSchema>;
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
  currentAction?: MatchAction;
  currentActorId?: string;
  latestAction?: MatchAction;
  actionCooldown: number;
  controlledFootballerId?: string;
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
  restartAction?: MatchAction;
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
        ])
        .optional(),
      sourceAction: z.enum(['hold', 'carry', 'pass', 'shot', 'cross', 'header']).optional(),
      looseSince: z.number().optional(),
    }),
    score: matchScoreSchema,
    currentPressure: z.number().min(0).max(1),
    possessionTeam: teamSideSchema,
    timeSincePossessionChanged: z.number().nonnegative(),
    actionCooldown: z.number().nonnegative(),
    scenario: restartScenarioSchema,
    restart: restartLifecycleSchema.optional(),
    lastShot: shotDiagnosticSchema.optional(),
  })
  .passthrough();
