import { usesLocalReception } from './situationalAwarenessState';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observedFlight, observedMotorBall } from './liveBallFlight';
import { planBallOrientedMovement } from './ballOrientedMovement';
import type { BallMotorObservation } from './ballOrientedMovement';
import { knownBoundedPlayers, observeBoundedScene } from './boundedPerception';
import { constructBoundedCandidates } from './boundedDecision';
import { revalidatePreparedOptions } from './preReceptionPlanning';
import { motorContactReadyAt } from './ballContactGeometry';
import { clampPitchPoint, distance, type PitchPoint } from './matchSpace';
import { isHumanControlled } from './actionAgency';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { deriveMovementCapability } from './locomotion';

/** Development-only recognition from the player's own observed flight and existing plan.
 * It neither names the intended receiver nor assigns a contact or ownership. */
export const locallyObservedReception = (state: TacticalMatchState, player: MatchPlayerState) => {
  if (!usesLocalReception(state) || state.restart || state.postGoal) return undefined;
  const plan = state.activePerceptionRuntime?.plans[player.id];
  const sensor = state.liveBallFlightRuntime?.sensors[player.id];
  const belief = sensor?.belief;
  if (
    !plan ||
    plan.status !== 'preparing' ||
    (state.lastGroundContact?.actorId === player.id &&
      state.lastGroundContact.at >= plan.createdAt) ||
    state.time >= plan.expiresAt ||
    state.time - plan.reviewedAt > 0.35 ||
    state.time < plan.reviewedAt ||
    !belief?.lastObservation ||
    belief.motionEvidenceAt === null ||
    state.time < belief.motionEvidenceAt ||
    state.time - belief.motionEvidenceAt > 0.5 ||
    state.time - belief.lastObservation.at > 0.5 ||
    state.time < belief.lastObservation.at
  )
    return undefined;
  const observation: BallMotorObservation = observedMotorBall(state, player);
  if (!observation.ball) return undefined;
  const movement = planBallOrientedMovement(
    player,
    observation,
    state.time,
    player.target,
    'receive',
  );
  return {
    observation,
    movement,
    recognisedAt: plan.createdAt,
    preparationSeconds: Math.max(0, state.time - plan.createdAt),
  };
};

/** Called only after the canonical collision race has found this actor at contact.
 * The temporary local scene is not written back to the physical match state. */
export const locallyPreparedFirstTimeAction = (
  state: TacticalMatchState,
  player: MatchPlayerState,
) => {
  // A speculative autonomous continuation must not replace an existing
  // defensive commitment or a human/carrier movement command. Explicit human
  // first-time actions are handled separately by the caller.
  if (
    state.defensiveChallenge?.actorId === player.id ||
    state.playerMovementIntent?.actorId === player.id ||
    state.ballCarrierIntent?.actorId === player.id
  )
    return undefined;
  const local = locallyObservedReception(state, player);
  const plan = state.activePerceptionRuntime?.plans[player.id];
  if (!local || !plan || !plan.options.length || state.time < motorContactReadyAt(state, player.id))
    return undefined;
  const observed = observeBoundedScene(state, player);
  if (!observed.ball) return undefined;
  const scene = { ...observed, contactReady: true, ball: { ...observed.ball, ownerId: player.id } };
  const candidates = constructBoundedCandidates(scene);
  const checked = revalidatePreparedOptions(scene, plan, candidates);
  for (const option of plan.options) {
    if (
      checked.invalidated.some((entry) => entry.id === option.id) ||
      state.time < plan.createdAt + option.preparationSeconds
    )
      continue;
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
) =>
  local.movement.nextContact && (local.movement.contactSeconds ?? Infinity) <= 2.5
    ? local.movement.movementTarget
    : state.boundedReceiverRecovery === 'hold-local-v1'
      ? player.position
      : undefined;

/** Read a live reception plan through the same sighting and motor authority as ordinary
 * observed movement. The plan stays in the existing active-perception runtime. */
export const observedReceptionPlan = (state: TacticalMatchState, player: MatchPlayerState) => {
  if (
    !state.experimentalReceptionPreparation ||
    state.restart ||
    state.postGoal ||
    isMatchGoalkeeper(player) ||
    isHumanControlled(state, player.id) ||
    state.defensiveChallenge?.actorId === player.id ||
    state.playerMovementIntent?.actorId === player.id ||
    state.ballCarrierIntent?.actorId === player.id ||
    state.pendingReceptionIntent?.actorId === player.id ||
    (player.spatialMovement && player.spatialMovement.until >= state.time) ||
    state.pendingStrike?.actorId === player.id
  )
    return undefined;

  const plan = state.activePerceptionRuntime?.plans[player.id];
  if (
    !plan ||
    plan.status !== 'preparing' ||
    state.time < plan.reviewedAt ||
    state.time - plan.reviewedAt > 0.35 ||
    state.time > plan.expectedContactAt + 0.15 ||
    state.time >= plan.expiresAt
  )
    return undefined;

  const flight = observedFlight(state, player);
  const observation = observedMotorBall(state, player);
  if (
    !flight?.hasMotionHistory ||
    flight.uncertainty > 3 ||
    (flight.velocityObservationAge ?? Infinity) > 0.5 ||
    !observation.ball ||
    state.time < observation.at ||
    state.time - observation.at > 0.5
  )
    return undefined;

  const velocity = observation.ball.velocity;
  const discrepancy = Math.hypot(
    velocity.x - plan.incomingVelocity.x,
    velocity.y - plan.incomingVelocity.y,
    velocity.z - plan.incomingVelocity.z,
  );
  if (
    discrepancy > Math.max(2, Math.hypot(plan.incomingVelocity.x, plan.incomingVelocity.y) * 0.45)
  )
    return undefined;
  return { plan, observation, preparationSeconds: state.time - plan.createdAt };
};

export const economicalReceptionMovement = (
  state: TacticalMatchState,
  player: MatchPlayerState,
) => {
  const local = observedReceptionPlan(state, player);
  const stance = player.articulatedStance;
  if (!local || !stance || motorContactReadyAt(state, player.id) > local.plan.expectedContactAt)
    return undefined;
  const movement = planBallOrientedMovement(
    player,
    local.observation,
    state.time,
    player.target,
    'receive',
  );
  const point = movement.nextContact;
  if (!point || movement.contactSeconds === null || movement.contactSeconds > 2.2) return undefined;
  const speed = Math.hypot(player.velocity.x, player.velocity.y);
  const seconds = movement.contactSeconds;
  const capability = deriveMovementCapability(player);
  // Use the current boots as a positioning cue. The actual gait and collision clock
  // determine which foot, if either, is there when the delivery reaches the player.
  const foot =
    distance(stance.left, point) < distance(stance.right, point) ? stance.left : stance.right;
  const error = distance(point, foot);
  const shift = Math.max(0, error - 0.1);
  if (error <= 0.2 && speed <= capability.walkSpeed)
    return { observation: local.observation, target: player.position, speed: 0 };
  if (seconds < 0.15 || shift > capability.runSpeed * seconds) return undefined;
  const target = clampPitchPoint({
    x: player.position.x + ((point.x - foot.x) * shift) / error,
    y: player.position.y + ((point.y - foot.y) * shift) / error,
  });
  return {
    observation: local.observation,
    target,
    speed: Math.min(capability.runSpeed, Math.max(capability.walkSpeed, shift / seconds)),
  };
};

/** At the witnessed contact, revalidate speculative outlets using current local evidence.
 * Return a touch direction only. The ordinary possession policy still selects the action. */
export const adaptiveTouchOutlet = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  contactPoint: PitchPoint,
  plan: NonNullable<ReturnType<typeof observedReceptionPlan>>['plan'],
) => {
  const observed = observeBoundedScene(state, player);
  if (!observed.ball) return undefined;
  const scene = {
    ...observed,
    position: contactPoint,
    ball: { ...observed.ball, position: contactPoint, ownerId: player.id },
  };
  const candidates = constructBoundedCandidates(scene);
  const checked = revalidatePreparedOptions(scene, plan, candidates);
  const nearest = knownBoundedPlayers(scene)
    .filter((p) => p.team !== scene.team)
    .reduce<{ x: number; y: number; distance: number } | undefined>((closest, p) => {
      const d = distance(p.position, contactPoint);
      return !closest || d < closest.distance ? { ...p.position, distance: d } : closest;
    }, undefined);
  const away =
    nearest && nearest.distance < 2
      ? { x: contactPoint.x - nearest.x, y: contactPoint.y - nearest.y }
      : undefined;
  const option = plan.options.find(
    (p) =>
      p.target &&
      p.difficulty < 0.65 &&
      state.time >= plan.createdAt + p.preparationSeconds &&
      !checked.invalidated.some((entry) => entry.id === p.id),
  );
  const outlet = option?.target
    ? { x: option.target.x - contactPoint.x, y: option.target.y - contactPoint.y }
    : undefined;
  const direction = away && (!outlet || away.x * outlet.x + away.y * outlet.y < 0) ? away : outlet;
  const length = direction ? Math.hypot(direction.x, direction.y) : 0;
  if (!direction || length < 0.05) return undefined;
  const target = {
    x: contactPoint.x + direction.x / length,
    y: contactPoint.y + direction.y / length,
  };
  if (distance(target, clampPitchPoint(target)) > 0.01) return undefined;
  return target;
};

/** A recovery proposal from existing optical belief and locally seen bodies. This
 * adapter never inspects physical ownership, travel kind, target, velocity or spin.
 * A tactical destination near hidden truth is not evidence of a recovery intention. */
export const locallyObservedRecovery = (state: TacticalMatchState, player: MatchPlayerState) => {
  if (
    state.prospectiveMovement !== 'observed-ball-contact-dev-v1' ||
    state.restart ||
    state.postGoal ||
    player.slot.position === 'goalkeeper'
  )
    return undefined;
  const belief = state.liveBallFlightRuntime?.sensors[player.id]?.belief;
  if (
    !belief?.lastObservation ||
    belief.motionEvidenceAt === null ||
    state.time < belief.lastObservation.at ||
    state.time - belief.lastObservation.at > 0.5 ||
    state.time < belief.motionEvidenceAt ||
    state.time - belief.motionEvidenceAt > 0.5
  )
    return undefined;
  const observation: BallMotorObservation = observedMotorBall(state, player);
  const ball = observation.ball;
  if (!ball || distance(player.position, ball.position) > 15) return undefined;
  const memory = state.activePerceptionRuntime?.memory[player.id];
  const visible = (memory?.entities ?? []).filter(
    (p) =>
      memory!.directIds.includes(p.id) &&
      state.time >= p.observedAt &&
      state.time - p.observedAt < 0.31,
  );
  // A locally plausible controller is a press/duel, not an unopposed recovery.
  // Those existing commitments keep their own authority and locomotion below.
  if (visible.some((p) => distance(p.position, ball.position) < 1.5)) return undefined;
  const ownDistance = distance(player.position, ball.position);
  if (
    visible.filter(
      (p) => p.team === player.team && distance(p.position, ball.position) < ownDistance,
    ).length >= 2
  )
    return undefined;
  observation.others = visible.map((p) => ({
    id: p.id,
    team: p.team,
    position: { ...p.position },
    velocity: { ...p.velocity },
  }));
  const movement = planBallOrientedMovement(
    player,
    observation,
    state.time,
    player.target,
    'retain',
    motorContactReadyAt(state, player.id),
  );
  if (!movement.nextContact || (movement.contactSeconds ?? Infinity) > 2.5) return undefined;
  return { observation, movement, recognisedAt: belief.lastObservation.at };
};
