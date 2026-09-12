import { z } from 'zod';
import { evaluatePressure } from './matchActions';
import { fieldValue, teamSideSchema } from './matchSpace';
import { matchPhaseSchema, restartScenarioSchema, type TacticalMatchState } from './matchState';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { deriveLooseBallAssignments } from './looseBallPhysics';

export const matchSituationKindSchema = z.enum([
  'routine',
  'progression',
  'under_pressure',
  'attacking_transition',
  'chance_creation',
  'shooting_opportunity',
  'defensive_duel',
  'loose_ball',
  'set_piece',
]);
export const matchSituationReasonSchema = z.enum([
  'routine_possession',
  'advanced_position',
  'heavy_pressure',
  'transition_phase',
  'good_shooting_position',
  'poor_shooting_angle',
  'defensive_threat',
  'ball_uncontrolled',
  'restart_active',
]);
export const matchSituationEvaluationSchema = z.object({
  kind: matchSituationKindSchema,
  team: teamSideSchema.optional(),
  actorId: z.string().optional(),
  importance: z.number().min(0).max(1),
  decisionWorthiness: z.number().min(0).max(1),
  decisionEligible: z.boolean(),
  reasons: z.array(matchSituationReasonSchema),
  context: z.object({
    possession: z.enum(['own', 'team', 'opponent', 'loose']),
    phase: matchPhaseSchema,
    goalDistance: z.number().nonnegative().optional(),
    pressure: z.number().min(0).max(1).optional(),
    nearestOpponentDistance: z.number().nonnegative().optional(),
    fieldProgress: z.number().min(0).max(1).optional(),
    restart: restartScenarioSchema.optional(),
  }),
});
export type MatchSituationEvaluation = z.infer<typeof matchSituationEvaluationSchema>;

export const evaluateMatchSituation = (
  state: TacticalMatchState,
  actorId = state.ball.ownerId ?? state.controlledFootballerId,
): MatchSituationEvaluation => {
  const actor = state.players.find((player) => player.id === actorId);
  const team = actor?.team ?? state.possessionTeam;
  const phase = state.teams[team].phase;
  const possession = !state.ball.ownerId
    ? 'loose'
    : state.ball.ownerId === actorId
      ? 'own'
      : state.players.find((player) => player.id === state.ball.ownerId)?.team === actor?.team
        ? 'team'
        : 'opponent';
  const pressure = actor ? evaluatePressure(state, actor).value : undefined;
  const nearestOpponentDistance = actor
    ? Math.min(
        ...state.players
          .filter((p) => p.team !== actor.team)
          .map((p) => Math.hypot(p.position.x - actor.position.x, p.position.y - actor.position.y)),
      )
    : undefined;
  const fieldProgress = actor ? fieldValue(actor.position, actor.team) / 105 : undefined;
  const shot = actor ? evaluateShootingOpportunity(state, actor) : undefined;
  let kind: MatchSituationEvaluation['kind'] = 'routine';
  let importance = 0.16;
  let worthiness = 0.12;
  let reasons: MatchSituationEvaluation['reasons'] = ['routine_possession'];

  if (state.scenario !== 'open_play')
    [kind, importance, worthiness, reasons] = ['set_piece', 0.72, 0.7, ['restart_active']];
  else if (!state.ball.ownerId) {
    const contenders = deriveLooseBallAssignments(state);
    const contested = new Set(contenders.map((candidate) => candidate.team)).size > 1;
    const danger = Math.abs(state.ball.x - 52.5) / 52.5;
    const looseImportance = Math.min(0.9, 0.48 + (contested ? 0.14 : 0) + danger * 0.2);
    [kind, importance, worthiness, reasons] = [
      'loose_ball',
      looseImportance,
      Math.max(0.46, looseImportance - 0.02),
      ['ball_uncontrolled'],
    ];
  } else if (possession === 'opponent' && (fieldProgress ?? 0) < 0.35)
    [kind, importance, worthiness, reasons] = ['defensive_duel', 0.7, 0.65, ['defensive_threat']];
  else if (possession === 'own' && (pressure ?? 0) >= 0.58)
    [kind, importance, worthiness, reasons] = ['under_pressure', 0.67, 0.64, ['heavy_pressure']];
  else if (phase === 'attacking_transition')
    [kind, importance, worthiness, reasons] = [
      'attacking_transition',
      0.64,
      0.6,
      ['transition_phase'],
    ];
  else if (
    possession === 'own' &&
    shot &&
    (shot.category === 'credible' || shot.category === 'high_value')
  )
    [kind, importance, worthiness, reasons] = [
      'shooting_opportunity',
      Math.max(0.58, shot.effectiveScoringExpectation),
      Math.max(0.58, shot.effectiveScoringExpectation),
      ['good_shooting_position'],
    ];
  else if ((fieldProgress ?? 0) >= 0.7)
    [kind, importance, worthiness, reasons] = [
      'chance_creation',
      0.55,
      0.48,
      shot && shot.angle < 0.45
        ? ['advanced_position', 'poor_shooting_angle']
        : ['advanced_position'],
    ];
  else if ((fieldProgress ?? 0) >= 0.5)
    [kind, importance, worthiness, reasons] = [
      'progression',
      0.36,
      0.3,
      shot && shot.angle < 0.45
        ? ['advanced_position', 'poor_shooting_angle']
        : ['advanced_position'],
    ];

  return matchSituationEvaluationSchema.parse({
    kind,
    team,
    ...(actor ? { actorId: actor.id } : {}),
    importance,
    decisionWorthiness: worthiness,
    decisionEligible: worthiness >= 0.58,
    reasons,
    context: {
      possession,
      phase,
      ...(shot ? { goalDistance: shot.distance } : {}),
      ...(pressure !== undefined ? { pressure } : {}),
      ...(Number.isFinite(nearestOpponentDistance) ? { nearestOpponentDistance } : {}),
      ...(fieldProgress !== undefined
        ? { fieldProgress: Math.max(0, Math.min(1, fieldProgress)) }
        : {}),
      ...(state.scenario !== 'open_play' ? { restart: state.scenario } : {}),
    },
  });
};
