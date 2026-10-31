import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { STATE_VALUE_CONFIG } from './decisionPolicyConfig';
import { distance } from './matchSpace';
import { playerContactGeometry, motorContactReadyAt } from './ballContactGeometry';
import { canThrowGoalkeeperBall } from './goalkeeperDistribution';
import { canParticipatePhysically } from './matchInjuries';
import { isBallWithinPlayingBoundary } from './pitchBoundary';

export const actionAvailabilityContextSchema = z.enum([
  'current',
  'incoming_preparation',
  'prospective_ranking',
]);
export type ActionAvailabilityContext = z.infer<typeof actionAvailabilityContextSchema>;

export const decisionReadinessSchema = z.object({
  actorId: z.string(),
  episode: z.number().int().nonnegative(),
  evaluatedAt: z.number().finite(),
  perceivedAt: z.number().finite(),
  signature: z.string(),
  releaseReady: z.boolean().optional(),
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
  // Motor recovery is already anticipated by the owner. A newly executable
  // contact need not wait for another scan of unchanged geometry. Otherwise the
  // quiet 0.55s cadence can repeatedly sample the brief post-touch blackout.
  if (previous.releaseReady === false && canReleaseControlledAction(state, actor)) return true;
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
  releaseReady: canReleaseControlledAction(state, actor),
});

export const releaseContactReadinessSchema = z.object({
  ready: z.boolean(),
  readyAt: z.number().nonnegative(),
  reason: z.enum(['available', 'not_owner', 'height', 'out_of_reach', 'motor_recovery']),
});
/** The observation and motor scheduler share one finite recovery/foot window. */
export const releaseContactReadiness = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const readyAt = motorContactReadyAt(state, actor.id);
  const geometry = playerContactGeometry(actor);
  const reason =
    state.ball.ownerId !== actor.id
      ? 'not_owner'
      : (state.ball.height ?? 0) > 0.65
        ? 'height'
        : Math.min(
              distance(geometry.leftFoot, state.ball),
              distance(geometry.rightFoot, state.ball),
            ) > geometry.footReach
          ? 'out_of_reach'
          : state.time < readyAt - 1e-8
            ? 'motor_recovery'
            : 'available';
  return { ready: reason === 'available', readyAt, reason } as z.infer<
    typeof releaseContactReadinessSchema
  >;
};
export const canReleaseControlledAction = (state: TacticalMatchState, actor: MatchPlayerState) =>
  releaseContactReadiness(state, actor).ready;

/** Ordinary owned-ball choices share the executor's existing foot/recovery window.
 * Incoming preparation and movement choices have their own contracts; this is not
 * a test for whether any human decision is allowed. A catch retains lawful handling. */
export const canOfferOwnedBallActions = (state: TacticalMatchState, actor: MatchPlayerState) =>
  canParticipatePhysically(actor) &&
  !state.discipline?.[actor.id]?.sentOff &&
  isBallWithinPlayingBoundary(state.ball) &&
  !state.ball.travelKind &&
  !state.ball.shot &&
  (canReleaseControlledAction(state, actor) || canThrowGoalkeeperBall(state, actor));
