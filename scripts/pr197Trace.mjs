import { performance } from 'node:perf_hooks';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { projectLiveReceptionTarget } from '../src/core/matchSimulation/passReception.ts';
import { derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { hash } from './pr197Evidence.mjs';
export const physicalBall = (s) => ({
  position: { x: s.ball.x, y: s.ball.y, z: Math.max(0.11, s.ball.height ?? 0.11) },
  velocity: { ...s.ball.velocity, z: s.ball.velocity?.z ?? 0 },
  airborne: !!s.ball.airborne,
  bounceCount: s.ball.bounceCount ?? 0,
  ...(s.ball.spin ? { spin: s.ball.spin } : {}),
});
const body = (p) => ({
  id: p.id,
  team: p.team,
  position: p.position,
  velocity: p.velocity,
  target: p.target,
  facing: p.facingAngle,
  balance: p.plantBalance?.balance ?? 1,
  jump: p.verticalJump ?? null,
});
export const traceReleased = (released, contract, seconds = 8) => {
  let state = globalThis.structuredClone(released);
  const samples = [],
    legacySamples = [],
    frames = [],
    witnesses = [],
    flightErrors = [],
    events = [],
    aerialOpportunities = [];
  const free = projectFutureBallTrajectory(physicalBall(released), seconds, 0.025);
  let undisturbed = true,
    firstOpportunity = null,
    firstControl = null;
  for (let tick = 0; tick < Math.round(seconds / 0.025); tick++) {
    const before = state;
    state = step(state, 0.025);
    const sample = sampleCanonicalOutcome(before, state, contract.version);
    samples.push(sample);
    legacySamples.push(sampleCanonicalOutcome(before, state, 'original-delivery-v2'));
    const ground = state.lastGroundContact,
      flight = state.lastBallContact;
    if (state.lastAerialContact?.id !== before.lastAerialContact?.id && state.lastAerialContact)
      aerialOpportunities.push({ at: state.time, ...state.lastAerialContact });
    if (state.currentAction?.type === 'header' && state.decisionIndex !== before.decisionIndex)
      witnesses.push({
        kind: 'header_release',
        actorId: state.currentAction.actorId,
        at: state.time,
        point: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0 },
        incoming: before.ball.velocity,
        outgoing: state.ball.velocity,
        geometry: state.lastAerialContact ?? null,
        qualification:
          'Actual canonical header launch; existing aerial envelope is not an independently calibrated head impulse model.',
      });
    if (
      ground?.executed &&
      JSON.stringify(ground) !== JSON.stringify(before.lastGroundContact) &&
      ground.at > contract.releasedAt + 1e-8
    )
      witnesses.push({ kind: 'ground', ...ground });
    if (
      flight?.playerId &&
      JSON.stringify(flight) !== JSON.stringify(before.lastBallContact) &&
      flight.at > contract.releasedAt + 1e-8
    )
      witnesses.push({ kind: 'flight', ...flight });
    const intervention =
      sample.contacts.some((c) => c.at > contract.releasedAt + 1e-8) ||
      sample.ownerId ||
      sample.restart;
    if (undisturbed && intervention) {
      const actorId = sample.ownerId ?? sample.contacts[0]?.actorId;
      const p = state.players.find((p) => p.id === actorId),
        g = p ? playerContactGeometry(p) : null;
      events.push({
        at: state.time,
        actorId: actorId ?? null,
        beforeBall: physicalBall(before),
        afterBall: physicalBall(state),
        body: p ? body(p) : null,
        feet: g,
        ground: state.lastGroundContact ?? null,
        aerial: state.lastAerialContact ?? null,
        flight: state.lastBallContact ?? null,
        contacts: sample.contacts,
        beforeAction: before.currentAction,
        afterAction: state.currentAction,
        decisionDelta: state.decisionIndex - before.decisionIndex,
        contactHeight:
          state.lastAerialContact !== before.lastAerialContact
            ? (state.lastAerialContact?.ballHeight ?? null)
            : null,
      });
    }
    if (undisturbed && !intervention) {
      const forecast = free[tick]?.ball;
      if (forecast)
        flightErrors.push({
          at: sample.at,
          metres: Math.hypot(
            state.ball.x - forecast.position.x,
            state.ball.y - forecast.position.y,
            (state.ball.height ?? 0.11) - forecast.position.z,
          ),
          velocity: Math.hypot(
            (state.ball.velocity?.x ?? 0) - forecast.velocity.x,
            (state.ball.velocity?.y ?? 0) - forecast.velocity.y,
            (state.ball.velocity?.z ?? 0) - forecast.velocity.z,
          ),
        });
    }
    if (intervention) undisturbed = false;
    if (!firstControl && sample.ownerId)
      firstControl = { at: sample.at, actorId: sample.ownerId, ball: sample.ball };
    for (const p of state.players.filter((p) => contract.opponentIds.includes(p.id))) {
      const g = playerContactGeometry(p),
        feet = Math.min(distance(g.leftFoot, state.ball), distance(g.rightFoot, state.ball));
      if (!firstOpportunity && (state.ball.height ?? 0) <= 0.5 && feet <= g.footReach)
        firstOpportunity = {
          at: state.time,
          actorId: p.id,
          kind: 'sampled_finite_foot_access',
          ball: sample.ball,
          body: body(p),
          feet,
          reach: g.footReach,
        };
    }
    if (
      tick % 10 === 0 ||
      sample.contacts.length ||
      sample.ownerId !== (before.ball.ownerId ?? null)
    ) {
      const r = state.players.find((p) => p.id === contract.receiverId);
      frames.push({
        at: state.time,
        ball: physicalBall(state),
        ownerId: state.ball.ownerId ?? null,
        reception: state.receptionPreparation ?? null,
        receiver: r ? body(r) : null,
        opponents: state.players.filter((p) => contract.opponentIds.includes(p.id)).map(body),
        contacts: sample.contacts,
        nextReceiverTarget: r ? (projectLiveReceptionTarget(state, r) ?? null) : null,
      });
    }
    if (state.postGoal || ['half_time', 'full_time', 'abandoned'].includes(state.status)) break;
  }
  witnesses.sort((a, b) => a.at - b.at);
  return {
    outcome: interpretCanonicalOutcome(contract, samples),
    legacyOutcome: interpretCanonicalOutcome(
      { ...contract, version: 'original-delivery-v2' },
      legacySamples,
    ),
    frames,
    witnesses,
    events,
    aerialOpportunities,
    firstPotentialOpportunity:
      [
        ...(firstOpportunity ? [firstOpportunity] : []),
        ...aerialOpportunities.map((p) => ({
          at: p.at,
          kind: 'canonical_aerial_candidates',
          candidates: p.candidates,
        })),
      ].sort((a, b) => a.at - b.at)[0] ?? null,
    firstOpportunity,
    firstPhysicalContact:
      witnesses.find(
        (x) => x.at <= (samples.find((s) => s.ownerId || s.restart)?.at ?? Infinity),
      ) ?? null,
    firstControl,
    firstObservedContact:
      samples
        .flatMap((s) => s.contacts)
        .filter((c) => c.at > contract.releasedAt + 1e-8)
        .sort((a, b) => a.at - b.at)[0] ?? null,
    flight: {
      eligibleTicks: flightErrors.length,
      maximumPositionError: Math.max(0, ...flightErrors.map((x) => x.metres)),
      maximumVelocityError: Math.max(0, ...flightErrors.map((x) => x.velocity)),
      first: flightErrors.slice(0, 2),
    },
    hashes: {
      initial: hash(released),
      ball: hash(released.ball),
      samples: hash(samples),
      legacySamples: hash(legacySamples),
      final: hash(state),
    },
    samples,
  };
};
export const traceRequest = (fixture, seconds = 8) => {
  const start = performance.now(),
    initial = fixture.state;
  const actor = initial.players.find((p) => p.id === fixture.actorId),
    receiver = initial.players.find((p) => p.id === fixture.receiverId);
  const plan = derivePassLaunchPlan(
    initial,
    actor,
    receiver,
    fixture.action.target,
    fixture.action.intent,
    fixture.action.delivery,
  );
  const released = resolveMatchAction(
    globalThis.structuredClone(initial),
    globalThis.structuredClone(fixture.action),
    'autonomous_npc',
  );
  const actual =
    released.lastPassDiagnostic?.passId !== initial.lastPassDiagnostic?.passId
      ? released.lastPassDiagnostic
      : null;
  const contract = outcomeContractSchema.parse({
    version: 'original-delivery-v3',
    actorId: actor.id,
    receiverId: receiver.id,
    teamIds: initial.players.filter((p) => p.team === actor.team).map((p) => p.id),
    opponentIds: initial.players.filter((p) => p.team !== actor.team).map((p) => p.id),
    requestedAt: initial.time,
    horizonAt: initial.time + seconds,
    releasedAt: actual ? initial.time : null,
    passId: actual?.passId ?? null,
    shotId: null,
    previousShotId: initial.ball.shot?.shotId ?? initial.lastShot?.shotId ?? null,
    information: 'privileged_engineering_observer',
    conditionalOnRelease: true,
  });
  const trace = traceReleased(released, contract, seconds);
  const free = projectFutureBallTrajectory(physicalBall(released), seconds, 0.025);
  const nearest = free.reduce((a, b) =>
    distance(a.ball.position, actual?.intendedTarget ?? fixture.action.target) <
    distance(b.ball.position, actual?.intendedTarget ?? fixture.action.target)
      ? a
      : b,
  );
  const { samples, ...compact } = trace;
  return {
    row: {
      inputHash: hash(initial),
      action: fixture.action,
      actor: body(actor),
      receiver: body(receiver),
      plan,
      diagnostic: actual,
      release: {
        ball: released.ball,
        receiver: body(released.players.find((p) => p.id === receiver.id)),
      },
      freeFlightNearest: nearest,
      freeFlightTargetMiss: distance(
        nearest.ball.position,
        actual?.intendedTarget ?? fixture.action.target,
      ),
      ...compact,
    },
    released,
    contract,
    samples,
    milliseconds: performance.now() - start,
  };
};
