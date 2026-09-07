import { z } from 'zod';
import type { FootballerProfile } from '../../types/domain';
import type { FormationId, FormationSlot, TacticalDuty } from '../footballerWorld';
import { pitchPointSchema, teamSideSchema, type PitchPoint, type TeamSide } from './matchSpace';

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
  phase: restartPhaseSchema,
  startedAt: z.number().nonnegative(),
  executedAt: z.number().nonnegative().optional(),
  takerId: z.string(),
  targets: z.record(z.string(), pitchPointSchema),
  landingZone: pitchPointSchema.optional(),
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
  ownerId?: string;
  from?: PitchPoint;
  target?: PitchPoint;
  intendedReceiverId?: string;
  travelElapsed?: number;
  travelDuration?: number;
}
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
    ball: pitchPointSchema.extend({ ownerId: z.string().optional() }),
    possessionTeam: teamSideSchema,
    timeSincePossessionChanged: z.number().nonnegative(),
    actionCooldown: z.number().nonnegative(),
    scenario: restartScenarioSchema,
    restart: restartLifecycleSchema.optional(),
  })
  .passthrough();
