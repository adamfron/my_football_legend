import { z } from 'zod';
import { distance, physicalPointSchema, pitchPointSchema, teamSideSchema } from './matchSpace';
import type { TacticalMatchState } from './matchState';

/** A football cause ends the previous possession. Awarding/placing a restart is separate. */
export const possessionLossCauseSchema = z.enum([
  'tackle',
  'interception',
  'bad_pass',
  'pass_out',
  'heavy_touch',
  'failed_control',
  'loose_ball_claim',
  'shot',
  'foul_stoppage',
  'other',
]);
export type PossessionLossCause = z.infer<typeof possessionLossCauseSchema>;
export const turnoverCauseCountsSchema = z.record(
  possessionLossCauseSchema,
  z.number().int().nonnegative(),
);
export const emptyTurnoverCauseCounts = (): z.infer<typeof turnoverCauseCountsSchema> => ({
  tackle: 0,
  interception: 0,
  bad_pass: 0,
  pass_out: 0,
  heavy_touch: 0,
  failed_control: 0,
  loose_ball_claim: 0,
  shot: 0,
  foul_stoppage: 0,
  other: 0,
});
export const possessionLossSchema = z.object({
  id: z.string(),
  at: z.number().nonnegative(),
  from: teamSideSchema,
  to: teamSideSchema,
  cause: possessionLossCauseSchema,
  position: physicalPointSchema,
  loserId: z.string().optional(),
  winnerId: z.string().optional(),
  passId: z.string().optional(),
  restartId: z.string().optional(),
});
export type PossessionLoss = z.infer<typeof possessionLossSchema>;
/** Unstable first control is evidence awaiting the actual recovery/outcome, not a loss yet. */
export const pendingPossessionLossSchema = z.object({
  id: z.string(),
  at: z.number().nonnegative(),
  team: teamSideSchema,
  actorId: z.string(),
  cause: z.enum(['heavy_touch', 'failed_control', 'bad_pass', 'interception', 'shot']),
  passId: z.string().optional(),
});
export const restartAwardSchema = z.object({
  origin: z.enum(['live_event', 'dev_fixture']).optional(),
  incidentId: z.string().optional(),
  eventAt: z.number().nonnegative().optional(),
  incidentPosition: pitchPointSchema.optional(),
  legalRestartPosition: pitchPointSchema.optional(),
  indirect: z.boolean().optional(),
  fouledPlayerId: z.string().optional(),
  offendingPlayerId: z.string().optional(),
  recalledAdvantageId: z.string().optional(),
  id: z.string(),
  at: z.number().nonnegative(),
  team: teamSideSchema,
  scenario: z.enum([
    'kick_off',
    'corner',
    'throw_in',
    'goal_kick',
    'gk_short',
    'free_kick',
    'free_kick_close',
    'free_kick_wide',
    'free_kick_far',
    'penalty',
  ]),
  takerId: z.string(),
  cause: z.enum(['boundary', 'foul', 'offside', 'shot', 'goal', 'bookkeeping']),
  lossId: z.string().optional(),
});
export type RestartAward = z.infer<typeof restartAwardSchema>;
export const restartAwardId = (
  state: TacticalMatchState,
  team: 'home' | 'away',
  scenario: string,
) => `${state.seed}:restart:${state.time}:${team}:${scenario}`;

/** Called at the authoritative outcome, before a restart can replace the ball/owner. */
export const recordPossessionLoss = (
  state: TacticalMatchState,
  fact: Omit<PossessionLoss, 'id' | 'at' | 'from' | 'position'> & {
    key: string;
    from?: 'home' | 'away';
  },
): TacticalMatchState => {
  const { key, from = state.possessionTeam, ...outcome } = fact;
  if (from === fact.to) return state;
  const id = `${state.seed}:loss:${key}`;
  if (state.lastPossessionLoss?.id === id) return state;
  const loserTeam =
    outcome.loserId &&
    (state.players.find((player) => player.id === outcome.loserId)?.team ??
      state.discipline?.[outcome.loserId]?.team);
  if (loserTeam && loserTeam !== from) delete outcome.loserId;
  const next = {
    ...state,
    lastPossessionLoss: {
      ...outcome,
      id,
      at: state.time,
      from,
      position: { x: state.ball.x, y: state.ball.y },
    },
  };
  delete next.pendingPossessionLoss;
  return next;
};

/** A lane interception remains an interception. A mis-hit collected near its displaced end
 * point is a bad pass; the explicit execution geometry prevents guessing from a later restart. */
export const isInaccuratePassCollection = (state: TacticalMatchState) => {
  const pass = state.lastPassDiagnostic;
  if (!pass?.intendedTarget || !pass.physicalTarget) return false;
  const error = distance(pass.intendedTarget, pass.physicalTarget);
  if (error < 0.75) return false;
  const contact = pass.actualContactPoint ?? state.ball;
  return (
    distance(contact, pass.physicalTarget) < distance(contact, pass.intendedTarget) &&
    distance(contact, pass.physicalTarget) <= Math.max(2, error * 1.5)
  );
};
