import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { playerFootGeometry } from '../src/core/matchSimulation/footContact.ts';
import { planSynchronizedReception } from '../src/core/matchSimulation/receiverSynchronisation.ts';
import {
  physicalBall,
  createSensor,
  sampleSensor,
  visibilityWindows,
  offeredAt,
  beliefMotorObservation,
  predictFlightBelief,
} from './pr199FlightLab.mjs';
import { hash } from './pr199Evidence.mjs';

export const runPhysicalReception = (entry, config) => {
  let s = globalThis.structuredClone(entry.state);
  Object.assign(s, {
    experimentalDefensiveReception: true,
    experimentalHeightAwarePassing: true,
    experimentalReceiverAnticipation: true,
    experimentalReceiverSynchronisation: config.controller !== 'R',
    experimentalCanonicalArrival: false,
  });
  const receiver = s.players.find((p) => p.id === entry.contract.receiverId);
  if (config.attribute) receiver.profile.attributes[config.attribute] = config.level;
  if (config.facingAway) receiver.facingAngle += Math.PI;
  if (config.initialVelocity) receiver.velocity = { ...config.initialVelocity };
  if (config.competingCommitment)
    s.playerMovementIntent = {
      actorId: receiver.id,
      type: 'attack_space',
      target: { x: receiver.position.x + 10, y: Math.max(0, receiver.position.y - 8) },
      startedAt: s.time,
      expiresAt: s.time + 2,
    };
  if (config.teammateFirst) {
    const teammate = s.players.find(
      (p) =>
        p.team === receiver.team &&
        p.id !== receiver.id &&
        p.id !== entry.contract.actorId &&
        p.slot.position !== 'goalkeeper',
    );
    teammate.position = { x: s.ball.x + 2, y: s.ball.y + 0.2 };
    teammate.target = { ...teammate.position };
  }
  if (config.pressureDistance !== undefined) {
    const rival = s.players
      .filter((p) => p.team !== receiver.team && p.slot.position !== 'goalkeeper')
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - receiver.position.x, a.position.y - receiver.position.y) -
          Math.hypot(b.position.x - receiver.position.x, b.position.y - receiver.position.y),
      )[0];
    rival.position = { x: receiver.position.x + config.pressureDistance, y: receiver.position.y };
    rival.target = { ...rival.position };
  }
  const beforeHash = hash(s),
    initialAt = s.time;
  const sensor = createSensor(
    receiver,
    s.seed,
    config.cues ? { ...config.cue, at: initialAt } : undefined,
  );
  const windows = visibilityWindows(config.condition, config.duration ?? 0.2, config.apex ?? 0.8);
  const samples = [entry.releaseSample],
    frames = [],
    movements = [];
  let tapeIndex = 0,
    firstInteractionAt = null;
  const prescribedAcquisitions = [];
  let lastPlan,
    firstMove = null,
    rememberedUses = 0;
  const memory = config.controller === 'M';
  const crediblePlan = (now) =>
    memory &&
    lastPlan?.status === 'contact_planned' &&
    lastPlan.contactAt !== null &&
    lastPlan.contactAt >= now - 0.1 &&
    predictFlightBelief(sensor.belief, now)?.hasVelocityEstimate;
  globalThis.__mflPr199Lab = {
    observeReceptionBall: () => beliefMotorObservation(sensor.belief, s.time),
    planSynchronizedReception: (input, original) => {
      if (!memory) {
        lastPlan = original(...input);
        return lastPlan;
      }
      const [actor, , now, readyAt, previous] = input;
      const estimate = predictFlightBelief(sensor.belief, now);
      if (!estimate?.hasVelocityEstimate) {
        lastPlan = original(...input);
        return lastPlan;
      }
      // The existing motor projection accepts a state at its own calculation time. This
      // is an inferred state, explicitly NOT a sighting. Restore actual evidence age in
      // the returned contract and keep the sensor's lastObservation unchanged.
      const observation = {
        at: now,
        nextAt: now + 0.1,
        ball: {
          position: estimate.position,
          velocity: estimate.velocity,
          spin: { x: 0, y: 0, z: 0 },
          owner: null,
        },
        others: [],
      };
      let plan = original(actor, observation, now, readyAt, previous);
      if (
        plan.status !== 'contact_planned' &&
        previous?.status === 'contact_planned' &&
        previous.contactAt > now &&
        previous.contactAt <= now + 2.4 &&
        !sensor.belief.contradicted
      ) {
        const future = predictFlightBelief(sensor.belief, previous.contactAt);
        if (
          future &&
          Math.hypot(
            future.position.x - previous.contactPoint.x,
            future.position.y - previous.contactPoint.y,
          ) <= future.uncertainty
        )
          plan = { ...previous, plannedAt: now };
      }
      lastPlan = {
        ...plan,
        observedAt: sensor.belief.lastObservation?.at ?? sensor.belief.evidenceAt,
        observationAge: now - sensor.belief.evidenceAt,
        uncertaintyMetres: estimate.uncertainty,
      };
      return lastPlan;
    },
    receptionMovementContactTarget: (input, original) => {
      if (input[1].id !== receiver.id || !crediblePlan(input[0].time)) return original(...input);
      if (input[0].time - sensor.belief.evidenceAt > 0.5) rememberedUses++;
      return lastPlan.movementTarget;
    },
    projectLocomotion: (input, original) =>
      input[1].id === receiver.id && crediblePlan(input[0].time)
        ? { intensity: 'sprint', reason: 'receive_pass', targetSpeed: lastPlan.targetSpeed }
        : original(...input),
    authoritativeMovementTarget: (input, original) => {
      const [state, actor] = input;
      return actor.id === receiver.id && crediblePlan(state.time) && state.receptionPreparation
        ? original(
            {
              ...state,
              receptionPreparation: {
                ...state.receptionPreparation,
                expectedArrivalTime: lastPlan.contactAt,
              },
            },
            ...input.slice(1),
          )
        : original(...input);
    },
  };
  if (hash(s.ball) !== entry.ballHash) throw Error('Physical reception launch changed');
  try {
    for (let tick = 0; tick < 320; tick++) {
      const actor = s.players.find((p) => p.id === receiver.id);
      if (actor) {
        const gap =
          config.attentionGap &&
          s.time - initialAt >= config.attentionGap[0] &&
          s.time - initialAt < config.attentionGap[1];
        if (
          config.sensorTape &&
          firstInteractionAt === null &&
          s.time < config.sensorTapeUntil - 1e-8
        ) {
          sensor.lastTickAt = s.time;
          if (offeredAt(windows, s.time - initialAt)) sensor.offered += 0.025;
          while (
            tapeIndex < config.sensorTape.length &&
            config.sensorTape[tapeIndex].sighting.at <= s.time + 1e-8
          ) {
            const acquisition = globalThis.structuredClone(config.sensorTape[tapeIndex++]);
            sensor.belief = acquisition.belief;
            sensor.everTrajectoryEstimate ||= Boolean(sensor.belief.velocity);
            sensor.acquired.push(acquisition);
            prescribedAcquisitions.push(acquisition);
            sensor.firstSight ??= acquisition.sighting.at;
            sensor.attended += acquisition.sighting.motion
              ? acquisition.sighting.at - acquisition.sighting.motion.since
              : 0.025;
          }
        } else
          sampleSensor(
            sensor,
            actor,
            physicalBall(s.ball),
            s.time,
            offeredAt(windows, s.time - initialAt),
            [],
            gap
              ? actor.facingAngle + Math.PI
              : s.experimentalActivePerception
                ? (s.activePerceptionRuntime?.memory[actor.id]?.gaze ?? actor.facingAngle)
                : actor.facingAngle,
          );
      }
      const before = s;
      s = step(s, 0.025);
      const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
      samples.push(sample);
      if (sample.contacts.length)
        firstInteractionAt ??= Math.min(...sample.contacts.map((c) => c.at));
      const body = s.players.find((p) => p.id === receiver.id);
      if (
        body &&
        firstMove === null &&
        Math.hypot(body.velocity.x - receiver.velocity.x, body.velocity.y - receiver.velocity.y) >
          0.1
      )
        firstMove = s.time - initialAt;
      if (body && (tick % 4 === 0 || sample.contacts.length)) {
        const feet = playerFootGeometry(body);
        const frame = {
          at: s.time,
          body: {
            position: body.position,
            velocity: body.velocity,
            facing: body.facingAngle,
            plant: body.plantBalance ?? null,
            target: body.target,
          },
          ball: sample.ball,
          velocity: sample.velocity,
          evidenceAt: sensor.belief?.evidenceAt ?? null,
          age: sensor.belief ? s.time - sensor.belief.evidenceAt : null,
          belief: sensor.belief ?? null,
          estimate: predictFlightBelief(sensor.belief, s.time) ?? null,
          plan: lastPlan ?? null,
          feet,
          contacts: sample.contacts,
          reception:
            s.lastReceptionOutcome?.receiverId === receiver.id ? s.lastReceptionOutcome : null,
        };
        frames.push(globalThis.structuredClone(frame));
        movements.push({ at: s.time, position: body.position });
      }
      if (config.hostileObserver) {
        const copy = globalThis.structuredClone(sample);
        copy.ball.x = -999;
        copy.contacts.length = 0;
      }
      if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status)) break;
    }
  } finally {
    delete globalThis.__mflPr199Lab;
  }
  const outcome = interpretCanonicalOutcome(entry.contract, samples);
  return {
    inputHash: beforeHash,
    cueOffered: sensor.cueOffered,
    cueAcquired: sensor.cueAcquired,
    trajectoryAvailable: Boolean(sensor.belief?.velocity),
    everTrajectoryEstimate: sensor.everTrajectoryEstimate,
    prescribedSensoryTape: Boolean(config.sensorTape),
    prescribedAcquisitionsHash: hash(prescribedAcquisitions),
    prescribedAcquisitions: prescribedAcquisitions.length,
    firstInteractionAt,
    launchHash: entry.ballHash,
    receiverInitialHash: hash(receiver),
    finalHash: hash(s),
    samplesHash: hash(samples),
    outcome,
    firstMovement: firstMove,
    windows,
    offeredSeconds: sensor.offered,
    attendedSeconds: sensor.attended,
    observations: sensor.belief?.observations ?? 0,
    acquiredExposure: sensor.belief?.acquiredExposure ?? 0,
    firstSight: sensor.firstSight === null ? null : sensor.firstSight - initialAt,
    firstUseful:
      sensor.belief?.firstUsefulAt === null || !sensor.belief
        ? null
        : sensor.belief.firstUsefulAt - initialAt,
    rememberedUses,
    acquisitions: sensor.acquired,
    frames,
    movementHash: hash(movements),
  };
};
void planSynchronizedReception;
