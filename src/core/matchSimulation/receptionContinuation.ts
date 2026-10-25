import { attacksRight } from './matchSpace';
import {
  distance,
  signedForwardDistance,
  clampPitchPoint,
  pitchPointSchema,
  type PitchPoint,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { projectCarryOpportunity } from './carryOpportunity';
import { isHumanControlled } from './actionAgency';
import { projectFutureBallTrajectory } from './ballPhysics';
import { estimatePlayerArrivalTime } from './playerArrival';
import { earliestDefenderArrival } from './passDecision';
import { isOffsideOffence } from './offside';
import { projectDynamicRoute } from './dynamicIntervention';
import { deriveMovementCapability } from './locomotion';

/** Planning starts only after awareness of the actual flight, not at release. A single
 * short-lived intention is revalidated at 10Hz; execution still belongs to ordinary contacts. */
export const prepareReceptionContinuation = (
  state: TacticalMatchState,
  receiver: MatchPlayerState,
  meeting: PitchPoint,
  routineHuman = false,
) => {
  const preparation = state.receptionPreparation;
  if (
    !preparation ||
    preparation.actorId !== receiver.id ||
    state.time < preparation.awarenessAt ||
    (isHumanControlled(state, receiver.id) && !routineHuman) ||
    state.pendingReceptionIntent?.actorId === receiver.id ||
    state.ball.travelKind !== 'pass' ||
    isOffsideOffence(state.offsideSnapshot, receiver.id)
  )
    return preparation;
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const speed = Math.hypot(velocity.x, velocity.y);
  const awareness =
    (receiver.profile.attributes.gameReading + receiver.profile.attributes.composure) / 200;
  if (awareness < 0.4 || speed < 1 || state.time > preparation.expectedArrivalTime + 1.5)
    return { ...preparation, continuation: undefined, runOn: undefined };
  const dir = attacksRight(receiver) ? 1 : -1;
  const projected = { ...receiver, position: meeting };
  const readiness = receiver.fitness?.burstReadiness ?? 1;
  const target = clampPitchPoint({
    x: meeting.x + dir * (readiness > 0.45 ? 24 : 10),
    y: meeting.y,
  });
  const mode = readiness > 0.45 ? ('sprint' as const) : ('carry' as const);
  const opportunity = projectCarryOpportunity(state, projected, target, mode);
  const clearance = Math.min(
    99,
    ...state.players
      .filter((p) => p.team !== receiver.team)
      .map((p) => distance(p.position, meeting)),
  );
  const previous = preparation.continuation;
  const changedFlight =
    previous &&
    Math.hypot(velocity.x - previous.incomingVelocity.x, velocity.y - previous.incomingVelocity.y) >
      Math.max(5, speed * 0.65);
  let continuation: NonNullable<TacticalMatchState['receptionPreparation']>['continuation'] =
    clearance > 3 &&
    opportunity.freeDistance >= 5 &&
    !changedFlight &&
    (!previous || state.time < previous.expiresAt)
      ? {
          target: opportunity.target,
          mode: opportunity.freeDistance >= 12 ? mode : ('carry' as const),
          createdAt: previous?.createdAt ?? state.time,
          expiresAt: previous?.expiresAt ?? preparation.expectedArrivalTime + 1.2,
          incomingVelocity: previous?.incomingVelocity ?? { x: velocity.x, y: velocity.y },
        }
      : undefined;
  // Revalidate an already observed moving reception locally. Proximity alone must not
  // discard its feasible first touch when a presser is running past it. This does not
  // invent a new route or commit the longer carry: ordinary ranking rechecks that later.
  const receiverSpeed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  const technique =
    (receiver.profile.attributes.firstTouch + receiver.profile.attributes.technique) / 200;
  if (
    !continuation &&
    previous &&
    !changedFlight &&
    state.time < previous.expiresAt &&
    clearance > 1.2 &&
    receiverSpeed > 0.7 &&
    technique >= 0.6 &&
    speed <= preparation.readiness.maximumComfortableArrivalSpeed &&
    state.time <= preparation.expectedArrivalTime + 0.35
  ) {
    const capability = deriveMovementCapability(receiver);
    const dx = previous.target.x - meeting.x,
      dy = previous.target.y - meeting.y;
    const length = Math.max(0.01, Math.hypot(dx, dy));
    const alignment =
      (dx * receiver.velocity.x + dy * receiver.velocity.y) /
      Math.max(0.01, length * receiverSpeed);
    const point = clampPitchPoint({
      x: meeting.x + (dx / length) * Math.min(3, length),
      y: meeting.y + (dy / length) * Math.min(3, length),
    });
    const route = projectDynamicRoute(state, projected, point, capability.runSpeed * 0.85);
    if (route.reachable && alignment > 0.8 && route.margin > 0.2 + (1 - awareness) * 0.35)
      continuation = previous;
  }
  let runOn = preparation.runOn;
  if (
    !continuation ||
    speed > 15 ||
    readiness < 0.4 ||
    signedForwardDistance(
      receiver.position,
      { x: receiver.position.x + velocity.x, y: receiver.position.y + velocity.y },
      receiver,
    ) < 1
  )
    runOn = undefined;
  else if (
    !runOn ||
    state.time >= runOn.expiresAt ||
    signedForwardDistance(state.ball, runOn.target, receiver) < 0 ||
    earliestDefenderArrival(
      state,
      state.players.filter((p) => p.team !== receiver.team),
      runOn.target,
    ) <
      estimatePlayerArrivalTime(state, receiver, runOn.target, 'intercept').estimatedTime + 0.2
  ) {
    const samples = projectFutureBallTrajectory(
      {
        position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 },
        velocity: { x: velocity.x, y: velocity.y, z: velocity.z ?? 0 },
        airborne: state.ball.airborne ?? false,
        bounceCount: state.ball.bounceCount ?? 0,
        ...(state.ball.spin ? { spin: state.ball.spin } : {}),
      },
      2,
      0.1,
    );
    const defenders = state.players.filter((p) => p.team !== receiver.team);
    // Only a later useful meeting within the actual reachable flight is eligible. Opponents,
    // keeper and boundaries remain capable of ending the race after this forecast.
    const candidate = samples.find((sample) => {
      const point = pitchPointSchema.safeParse(sample.ball.position);
      if (!point.success || sample.ball.position.z > 0.65 || sample.at < 0.35) return false;
      if (Math.min(point.data.y, 68 - point.data.y, point.data.x, 105 - point.data.x) < 1.5)
        return false;
      if (signedForwardDistance(meeting, point.data, receiver) < 2.5) return false;
      const eta = estimatePlayerArrivalTime(state, receiver, point.data, 'intercept').estimatedTime;
      return (
        eta <= sample.at + 0.12 &&
        earliestDefenderArrival(state, defenders, point.data) > Math.max(eta, sample.at) + 0.25
      );
    });
    runOn = candidate
      ? {
          target: { x: candidate.ball.position.x, y: candidate.ball.position.y },
          contactAt: state.time + candidate.at,
          expiresAt: state.time + candidate.at + 0.2,
        }
      : undefined;
  }
  return {
    ...preparation,
    continuation,
    runOn,
  };
};

/** A deliberate non-contact excludes only the intended receiver from a real contact race.
 * No touch, ownership, completion, lock or protected window is authored here. */
export const shouldLetPassRun = (
  state: TacticalMatchState,
  receiver: MatchPlayerState,
  point: PitchPoint,
): boolean => {
  const preparation = state.receptionPreparation;
  const runOn = preparation?.actorId === receiver.id ? preparation.runOn : undefined;
  if (
    !runOn ||
    state.time >= runOn.expiresAt ||
    state.time < preparation!.awarenessAt ||
    isHumanControlled(state, receiver.id) ||
    state.pendingReceptionIntent?.actorId === receiver.id ||
    state.ball.ownerId ||
    state.ball.travelKind !== 'pass' ||
    isOffsideOffence(state.offsideSnapshot, receiver.id)
  )
    return false;
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const dx = runOn.target.x - point.x,
    dy = runOn.target.y - point.y;
  if (Math.hypot(dx, dy) < 1.3 || dx * velocity.x + dy * velocity.y <= 0) return false;
  const nearest = Math.min(
    99,
    ...state.players
      .filter((p) => p.team !== receiver.team)
      .map((p) => distance(p.position, point)),
  );
  // Reconsider immediately when a body arrives or the path no longer agrees with the flight.
  return (
    nearest > 2.2 &&
    Math.abs(dx * velocity.y - dy * velocity.x) /
      Math.max(0.1, Math.hypot(velocity.x, velocity.y)) <
      1.5
  );
};
