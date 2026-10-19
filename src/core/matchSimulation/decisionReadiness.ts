import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { STATE_VALUE_CONFIG } from './decisionPolicyConfig';
import { distance } from './matchSpace';
import { playerContactGeometry } from './ballContactGeometry';

export const decisionReadinessSchema = z.object({
  actorId: z.string(),
  episode: z.number().int().nonnegative(),
  evaluatedAt: z.number().finite(),
  perceivedAt: z.number().finite(),
  signature: z.string(),
});
export type DecisionReadiness = z.infer<typeof decisionReadinessSchema>;
export const perceptionLatency = (actor: MatchPlayerState) => {
  const a = actor.profile.attributes;
  const competence = (a.gameReading + a.concentration) / 200;
  return (
    STATE_VALUE_CONFIG.maxPerceptionSeconds -
    competence * (STATE_VALUE_CONFIG.maxPerceptionSeconds - STATE_VALUE_CONFIG.minPerceptionSeconds)
  );
};
/** Cheap geometric events are latched before full ranking. Centimetre motion is not an event. */
export const decisionSignature = (state: TacticalMatchState, actor: MatchPlayerState) =>
  [
    state.ballEpisode ?? 0,
    Math.floor(state.currentPressure * 5),
    ...state.players
      .filter((p) => p.id !== actor.id && distance(p.position, actor.position) < 45)
      .map((p) => `${p.id}:${Math.round(p.position.x / 3)}:${Math.round(p.position.y / 3)}`),
    Math.round((state.ball.height ?? 0) * 2),
  ].join('|');

/** This only authorises reconsideration. Action-specific preparation and contact still gate release. */
export const canReconsiderDecision = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const previous = state.decisionReadiness;
  const episode = state.ballEpisode ?? 0;
  const acquiredAt = state.ballOwnershipStartedAt ?? state.time;
  if (state.time < acquiredAt + perceptionLatency(actor)) return false;
  if (!previous || previous.actorId !== actor.id || previous.episode !== episode) return true;
  if (state.time - previous.evaluatedAt < STATE_VALUE_CONFIG.fullRankingInterval - 1e-8)
    return false;
  const changed = decisionSignature(state, actor) !== previous.signature;
  // Quiet intentions are also checked at a bounded cadence; a carry can be cancelled by a new lane.
  return state.time - previous.evaluatedAt >= (changed ? perceptionLatency(actor) : 0.55) - 1e-8;
};
export const markDecisionEvaluated = (state: TacticalMatchState, actor: MatchPlayerState) => ({
  actorId: actor.id,
  episode: state.ballEpisode ?? 0,
  evaluatedAt: state.time,
  perceivedAt: state.time,
  signature: decisionSignature(state, actor),
});

export const canReleaseControlledAction = (state: TacticalMatchState, actor: MatchPlayerState) => {
  if (state.ball.ownerId !== actor.id || (state.ball.height ?? 0) > 0.65) return false;
  const geometry = playerContactGeometry(actor);
  if (
    Math.min(distance(geometry.leftFoot, state.ball), distance(geometry.rightFoot, state.ball)) >
    geometry.footReach
  )
    return false;
  const last = state.lastGroundContact;
  return !last || last.actorId !== actor.id || state.time - last.at >= 0.12 - 1e-8;
};
