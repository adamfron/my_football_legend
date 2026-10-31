import { z } from 'zod';
import {
  enumerateAvailableActions,
  evaluatePressure,
  hasActiveMatchActionParticipants,
} from './matchActions';
import { evaluateMatchSituation } from './matchSituationEvaluator';
import { matchActionSchema, type TacticalMatchState } from './matchState';
import { attackDirection, distance, signedForwardDistance } from './matchSpace';
import { evaluatePassDecision } from './passDecision';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { deriveTeamTacticalPreferences } from './tacticalPreferences';
import { playerContactGeometry } from './ballContactGeometry';
import { secondLastOpponentLine } from './offside';

const unit = z.number().min(0).max(1);
export const tacticalContextSchema = z.object({
  ballDistance: z.number().nonnegative(),
  ballWithinFootReach: z.boolean(),
  speed: z.number().nonnegative(),
  facingAngle: z.number(),
  nearbyTeammates: z.number().int().nonnegative(),
  nearbyOpponents: z.number().int().nonnegative(),
  spaceBehindLine: z.number().nonnegative(),
  fitnessCapacity: unit,
  formation: z.string(),
  time: z.number().nonnegative(),
  scoreDifference: z.number(),
});
export const tacticalReasonSchema = z.object({
  code: z.enum([
    'progression',
    'safe_outlet',
    'dynamic_interception',
    'receiver_space',
    'second_ball_support',
    'clear_shot',
    'poor_angle',
    'unprotected_centre',
    'pressure',
    'fatigue',
    'coach_fit',
    'late_score_context',
  ]),
  value: z.number().finite(),
});
export const tacticalActionEvaluationSchema = z.object({
  action: matchActionSchema,
  progression: z.number().finite(),
  retentionIndex: unit.nullable(),
  chanceIndex: unit.nullable(),
  exposureIndex: unit,
  coachFit: unit,
  support: z.number().int().nonnegative(),
  score: z.number().finite(),
  uncertainty: z.literal('uncalibrated_heuristic'),
  reasons: z.array(tacticalReasonSchema),
});
export type TacticalActionEvaluation = z.infer<typeof tacticalActionEvaluationSchema>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** On-demand explanation of canonical generated choices. Never called by autonomous ranking,
 * never steps physics or reads RNG. Indices are relative diagnostics, not calibrated odds. */
export const evaluateTacticalActions = (state: TacticalMatchState, actorId: string) => {
  const situation = evaluateMatchSituation(state, actorId);
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return { situation, context: undefined, actions: [] as TacticalActionEvaluation[] };
  const pressure = evaluatePressure(state, actor).value;
  const preferences = deriveTeamTacticalPreferences(state, actor.team);
  const friends = state.players.filter(
    (p) => p.team === actor.team && p.id !== actorId && !state.discipline?.[p.id]?.sentOff,
  );
  const foes = state.players.filter(
    (p) => p.team !== actor.team && !state.discipline?.[p.id]?.sentOff,
  );
  const geometry = playerContactGeometry(actor);
  const context = tacticalContextSchema.parse({
    ballDistance: distance(actor.position, state.ball),
    ballWithinFootReach:
      Math.min(distance(geometry.leftFoot, state.ball), distance(geometry.rightFoot, state.ball)) <=
      geometry.footReach,
    speed: Math.hypot(actor.velocity.x, actor.velocity.y),
    facingAngle: actor.facingAngle,
    nearbyTeammates: friends.filter((p) => distance(p.position, actor.position) <= 12).length,
    nearbyOpponents: foes.filter((p) => distance(p.position, actor.position) <= 12).length,
    spaceBehindLine: Math.max(
      0,
      attackDirection(actor) *
        ((attackDirection(actor) > 0 ? 105 : 0) - secondLastOpponentLine(state, actor.team)),
    ),
    fitnessCapacity: actor.fitness?.longTermCapacity ?? 1,
    formation: state.teams[actor.team].formation,
    time: state.time,
    scoreDifference: state.score[actor.team] - state.score[actor.team === 'home' ? 'away' : 'home'],
  });
  const actions = enumerateAvailableActions(state, actorId, 'prospective_ranking')
    .filter((action) => hasActiveMatchActionParticipants(state, action))
    .slice(0, 96)
    .map((action) => {
      const target =
        'target' in action
          ? action.target
          : action.type === 'challenge'
            ? (foes.find((p) => p.id === action.opponentId)?.position ?? actor.position)
            : actor.position;
      const progression = signedForwardDistance(actor.position, target, actor);
      const support = friends.filter((p) => distance(p.position, target) <= 12).length;
      const separation = Math.min(30, ...foes.map((p) => distance(p.position, target)));
      const cover = friends.filter(
        (p) =>
          Math.abs(p.position.y - 34) < 15 &&
          attackDirection(actor) * (p.position.x - actor.position.x) < 0,
      ).length;
      const leavingLine =
        ['center_back', 'left_back', 'right_back'].includes(actor.slot.position) && progression > 5;
      const exposureIndex = clamp(
        (leavingLine ? Math.max(0, 3 - cover) / 3 : 0) +
          (Math.abs(target.y - 34) > 20 && cover < 2 ? 0.2 : 0),
      );
      let retentionIndex: number | null = null,
        chanceIndex: number | null = null;
      const reasons: z.infer<typeof tacticalReasonSchema>[] = [
        { code: 'progression', value: progression },
      ];
      if (action.type === 'pass') {
        const receiver = friends.find((p) => p.id === action.receiverId);
        if (receiver) {
          const forecast = evaluatePassDecision(
            state,
            actor,
            receiver,
            action.target,
            action.intent,
            action.delivery,
            undefined,
            action.firstTime,
          );
          retentionIndex = forecast.expectedRetainedPossession ?? forecast.expectedCompletion;
          reasons.push(
            { code: 'dynamic_interception', value: forecast.defenderEta - forecast.ballEta },
            { code: 'receiver_space', value: separation },
          );
          if (progression < 5 && retentionIndex > 0.65)
            reasons.push({ code: 'safe_outlet', value: retentionIndex });
          chanceIndex = clamp(
            (((Math.max(0, progression) / 45) * separation) / 10) * retentionIndex,
          );
        }
      } else if (
        action.type === 'shot' ||
        (action.type === 'header' && action.intent === 'header_shot')
      ) {
        const shot = evaluateShootingOpportunity(state, actor);
        chanceIndex = shot.baseXg;
        reasons.push({
          code: shot.angle < 0.45 ? 'poor_angle' : 'clear_shot',
          value: shot.visibleTargetArea,
        });
      } else if (action.type === 'carry' || action.type === 'hold') {
        retentionIndex = clamp(1 - pressure * 0.65 - Math.max(0, 4 - separation) * 0.1);
      }
      const coachFit = clamp(
        0.5 +
          (progression > 5 ? preferences.verticality - 0.5 : preferences.possessionPatience - 0.5) *
            0.5,
      );
      const tired = 1 - (actor.fitness?.longTermCapacity ?? 1);
      const late = state.time >= 4800;
      const scoreDifference =
        state.score[actor.team] - state.score[actor.team === 'home' ? 'away' : 'home'];
      reasons.push(
        { code: 'second_ball_support', value: support },
        { code: 'coach_fit', value: coachFit },
      );
      if (exposureIndex > 0) reasons.push({ code: 'unprotected_centre', value: exposureIndex });
      if (pressure > 0.3) reasons.push({ code: 'pressure', value: pressure });
      if (tired > 0.2) reasons.push({ code: 'fatigue', value: tired });
      if (late) reasons.push({ code: 'late_score_context', value: scoreDifference });
      const score =
        (retentionIndex ?? 0.35) * (late && scoreDifference > 0 ? 35 : 22) +
        Math.max(-10, Math.min(25, progression)) * (0.35 + preferences.verticality * 0.4) +
        (chanceIndex ?? 0) * 45 +
        Math.min(3, support) * 1.5 +
        coachFit * 4 -
        exposureIndex * 18 -
        (action.type === 'carry' && action.movementMode === 'sprint' ? tired * 8 : 0);
      return tacticalActionEvaluationSchema.parse({
        action,
        progression,
        retentionIndex,
        chanceIndex,
        exposureIndex,
        coachFit,
        support,
        score,
        uncertainty: 'uncalibrated_heuristic',
        reasons,
      });
    });
  return { situation, context, actions: actions.sort((a, b) => b.score - a.score) };
};

/** Frozen pre-action judgment is retained even when an excellent choice is poorly executed. */
export const explainTacticalOutcome = (decision: TacticalActionEvaluation, outcome: string) => ({
  decision,
  outcome,
  interpretation: decision.score >= 25 ? 'reasonable_choice' : 'risk_requires_context',
});

export const TACTICAL_REASON_LABELS: Record<z.infer<typeof tacticalReasonSchema>['code'], string> =
  {
    progression: 'Postęp w kierunku bramki',
    safe_outlet: 'Bezpieczna opcja podania',
    dynamic_interception: 'Wyścig do toru podania',
    receiver_space: 'Przestrzeń adresata',
    second_ball_support: 'Wsparcie przy drugiej piłce',
    clear_shot: 'Widoczna droga do bramki',
    poor_angle: 'Trudny kąt strzału',
    unprotected_centre: 'Ryzyko odsłonięcia środka',
    pressure: 'Presja rywala',
    fatigue: 'Zmęczenie',
    coach_fit: 'Zgodność z planem trenera',
    late_score_context: 'Wynik w końcówce meczu',
  };
