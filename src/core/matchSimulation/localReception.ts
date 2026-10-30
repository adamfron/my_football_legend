import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observedMotorBall } from './liveBallFlight';
import { planBallOrientedMovement } from './ballOrientedMovement';
import { observeBoundedScene } from './boundedPerception';
import { constructBoundedCandidates } from './boundedDecision';
import { revalidatePreparedOptions } from './preReceptionPlanning';
import { motorContactReadyAt } from './ballContactGeometry';

/** Development-only recognition from the player's own observed flight and existing plan.
 * It neither names the intended receiver nor assigns a contact or ownership. */
export const locallyObservedReception = (state: TacticalMatchState, player: MatchPlayerState) => {
  if (state.prospectiveMovement !== 'two-pass-continuity-dev-v1' || state.restart || state.postGoal)
    return undefined;
  const plan = state.activePerceptionRuntime?.plans[player.id];
  const sensor = state.liveBallFlightRuntime?.sensors[player.id];
  const belief = sensor?.belief;
  if (
    !plan || plan.status !== 'preparing' || state.time >= plan.expiresAt ||
    state.time - plan.reviewedAt > 0.35 || state.time < plan.reviewedAt ||
    !belief?.lastObservation || belief.motionEvidenceAt === null ||
    state.time < belief.motionEvidenceAt || state.time - belief.motionEvidenceAt > 0.5 ||
    state.time - belief.lastObservation.at > 0.5 || state.time < belief.lastObservation.at
  ) return undefined;
  const observation = observedMotorBall(state, player);
  if (!observation.ball) return undefined;
  const movement = planBallOrientedMovement(player, observation, state.time, player.target, 'receive');
  return {
    observation,
    movement,
    recognisedAt: plan.createdAt,
    preparationSeconds: Math.max(0, state.time - plan.createdAt),
  };
};

/** Called only after the canonical collision race has found this actor at contact.
 * The temporary local scene is not written back to the physical match state. */
export const locallyPreparedFirstTimeAction = (state: TacticalMatchState, player: MatchPlayerState) => {
  // A speculative autonomous continuation must not replace an existing
  // defensive commitment or a human/carrier movement command. Explicit human
  // first-time actions are handled separately by the caller.
  if (
    state.defensiveChallenge?.actorId === player.id ||
    state.playerMovementIntent?.actorId === player.id ||
    state.ballCarrierIntent?.actorId === player.id
  ) return undefined;
  const local = locallyObservedReception(state, player);
  const plan = state.activePerceptionRuntime?.plans[player.id];
  if (!local || !plan || !plan.options.length || state.time < motorContactReadyAt(state, player.id))
    return undefined;
  const observed = observeBoundedScene(state, player);
  if (!observed.ball) return undefined;
  const scene = { ...observed, contactReady: true,
    ball: { ...observed.ball, ownerId: player.id } };
  const candidates = constructBoundedCandidates(scene);
  const checked = revalidatePreparedOptions(scene, plan, candidates);
  for (const option of plan.options) {
    if (checked.invalidated.some((entry) => entry.id === option.id) ||
      state.time < plan.createdAt + option.preparationSeconds) continue;
    const candidate = candidates.find((c) => c.id === option.id && c.feasible && c.legal !== false);
    if (!candidate) continue;
    if (candidate.action.type === 'pass') return { ...candidate.action, firstTime: true };
    if (candidate.action.type === 'shot') return candidate.action;
  }
  return undefined;
};

export const localReceptionMovementTarget = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  local: NonNullable<ReturnType<typeof locallyObservedReception>>,
) => local.movement.nextContact && (local.movement.contactSeconds ?? Infinity) <= 2.5
  ? local.movement.movementTarget
  : state.boundedReceiverRecovery === 'hold-local-v1' ? player.position : undefined;
