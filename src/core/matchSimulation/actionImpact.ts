import { z } from 'zod';
import { distance, fieldValue } from './matchSpace';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import type { MatchAction, TacticalMatchState } from './matchState';

export const actionImpactSchema = z.object({
  family: z.enum(['routine', 'meaningful', 'high_impact']),
  progression: z.number(),
  zoneChange: z.boolean(),
  defenderProximity: z.number().nonnegative(),
  reason: z.string(),
});
export type ActionImpact = z.infer<typeof actionImpactSchema>;

/** RNG-free projection of a canonical action. Identity never affects sporting value. */
export const evaluateActionImpact = (
  state: TacticalMatchState,
  action: MatchAction,
): ActionImpact => {
  const actor = state.players.find((player) => player.id === action.actorId);
  if (!actor)
    return actionImpactSchema.parse({
      family: 'routine',
      progression: 0,
      zoneChange: false,
      defenderProximity: 105,
      reason: 'unknown_actor',
    });
  const target = 'target' in action ? action.target : actor.position;
  const progression = fieldValue(target, actor.team) - fieldValue(actor.position, actor.team);
  const zoneChange =
    Math.floor(fieldValue(target, actor.team) / 17.5) >
    Math.floor(fieldValue(actor.position, actor.team) / 17.5);
  const defenderProximity = Math.min(
    105,
    ...state.players
      .filter((player) => player.team !== actor.team)
      .map((player) => distance(player.position, actor.position)),
  );
  let family: ActionImpact['family'] = 'routine';
  let reason = 'safe_recycle';
  if (action.type === 'shot' || action.type === 'cross') {
    family = 'high_impact';
    reason = action.type;
  } else if (
    action.type === 'pass' &&
    (action.intent === 'through' || action.intent === 'direct' || progression >= 18)
  ) {
    family = 'high_impact';
    reason = 'progressive_pass';
  } else if (
    action.type === 'carry' &&
    (progression >= 10 || zoneChange || defenderProximity <= 5)
  ) {
    family = 'high_impact';
    reason = defenderProximity <= 5 ? 'take_on' : 'progressive_carry';
  } else if (action.type === 'carry' || (action.type === 'pass' && progression >= 5)) {
    family = 'meaningful';
    reason = action.type;
  } else if (action.type === 'header' && action.intent === 'header_shot') {
    family = 'high_impact';
    reason = 'shot';
  }
  // Keep the shot evaluator in the canonical projection surface for diagnostics.
  if (action.type === 'shot') void evaluateShootingOpportunity(state, actor);
  return actionImpactSchema.parse({ family, progression, zoneChange, defenderProximity, reason });
};
