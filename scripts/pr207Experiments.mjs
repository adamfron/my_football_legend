import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { integrateBallFlight } from '../src/core/matchSimulation/ballPhysics.ts';
import { findFirstBallContact } from '../src/core/matchSimulation/ballFlight.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { hash } from './pr199Evidence.mjs';
import { goalIntentToPitch } from '../src/core/matchSimulation/goalCoordinates.ts';

/** Read-only isolation of flight. No opponents/keeper in this arm; the live arm below retains all. */
export function flight(ball, target, shooter, shot = false, retainTrace = false, environment) {
  let physical = {
    position: { x: ball.x, y: ball.y, z: Math.max(0.11, ball.height ?? 0.11) },
    velocity: { x: ball.velocity?.x ?? 0, y: ball.velocity?.y ?? 0, z: ball.velocity?.z ?? 0 },
    spin: ball.spin ?? { x: 0, y: 0, z: 0 },
    airborne: ball.airborne ?? false,
    bounceCount: 0,
  };
  let apex = physical.position.z,
    plane = null,
    landing = null,
    frame = null,
    stopped = false,
    at = 0;
  const trace = [];
  const impacts = [];
  for (let tick = 1; tick <= 1000; tick++) {
    const previous = physical;
    physical = integrateBallFlight(
      physical,
      0.025,
      environment,
      environment?.groundContact === 'event-v1'
        ? (event) => impacts.push({ ...event, at: (tick - 1) * 0.025 + event.at })
        : undefined,
    );
    at = tick * 0.025;
    apex = Math.max(apex, physical.position.z);
    if (
      !landing &&
      ((previous.airborne && !physical.airborne) || physical.bounceCount > previous.bounceCount)
    )
      landing = { at, ...physical.position };
    const fraction = (target.x - previous.position.x) / (physical.position.x - previous.position.x);
    if (!plane && fraction >= 0 && fraction <= 1)
      plane = {
        at: at - 0.025 + fraction * 0.025,
        x: target.x,
        y: previous.position.y + fraction * (physical.position.y - previous.position.y),
        z: previous.position.z + fraction * (physical.position.z - previous.position.z),
        speed: Math.hypot(physical.velocity.x, physical.velocity.y, physical.velocity.z),
      };
    if (shot && !frame) {
      const contact = findFirstBallContact({
        previous: previous.position,
        next: physical.position,
        attackingTeam: shooter,
      });
      if (contact) frame = { ...contact, at };
    }
    if (retainTrace && tick % 4 === 0) trace.push({ at, ...physical });
    if (
      Math.hypot(physical.velocity.x, physical.velocity.y, physical.velocity.z) < 0.05 &&
      !physical.airborne
    ) {
      stopped = true;
      break;
    }
  }
  return {
    apex,
    landing,
    plane,
    frame,
    stop: physical.position,
    elapsed: at,
    stopCensored: !stopped,
    lateralError: plane ? plane.y - target.y : null,
    longitudinalError: physical.position.x - target.x,
    ...(retainTrace ? { trace } : {}),
    ...(environment?.groundContact === 'event-v1'
      ? { impacts, bounceCount: physical.bounceCount }
      : {}),
  };
}

export function runPair(config, continuation = false, environment) {
  const f = createKickFixture({ ...config, experimental: true });
  if (environment) f.state.ballEnvironment = environment;
  const before = f.state,
    baseline = globalThis.structuredClone(before);
  delete baseline.experimentalKickExecution;
  const nominalInput = globalThis.structuredClone(baseline);
  const result = { config: f.config, inputHash: hash(nominalInput), arms: [] };
  for (const [model, input] of [
    ['baseline', baseline],
    ['contact-v1', before],
  ]) {
    const after = resolveMatchAction(input, f.action, 'human_selected');
    const released = after.decisionIndex !== input.decisionIndex;
    const target =
      config.family === 'shot'
        ? { x: 105, y: goalIntentToPitch(f.actor, f.action.goalTarget).y }
        : (after.lastPassDiagnostic?.intendedTarget ?? f.action.target);
    const receipt = after.lastKickExecution ?? null;
    const row = {
      model,
      released,
      action: f.action,
      target,
      contact: receipt,
      launch: released ? after.ball : null,
      flight: released
        ? flight(after.ball, target, f.actor, config.family === 'shot', false, environment)
        : null,
    };
    if (continuation && released) {
      let current = after;
      const samples = [],
        frames = [],
        contacts = [],
        actions = [];
      for (let tick = 0; tick < 280; tick++) {
        const previous = current;
        current = step(current, 0.025);
        const sample = sampleCanonicalOutcome(previous, current, 'original-delivery-v3');
        samples.push(sample);
        if (sample.contacts.length) contacts.push(...sample.contacts);
        if (tick % 4 === 0)
          frames.push({
            at: current.time,
            ball: current.ball,
            ownerId: current.ball.ownerId ?? null,
            keeper: current.keeperIntervention ?? null,
          });
        if (current.decisionIndex !== previous.decisionIndex)
          actions.push({
            at: current.time,
            action: current.currentAction,
            ownerBefore: previous.ball.ownerId ?? null,
          });
      }
      row.continuation = {
        outcome: interpretCanonicalOutcome(
          {
            version: 'original-delivery-v3',
            actorId: f.actor.id,
            receiverId: config.family === 'shot' ? null : f.receiver.id,
            teamIds: before.players.filter((p) => p.team === f.actor.team).map((p) => p.id),
            opponentIds: before.players.filter((p) => p.team !== f.actor.team).map((p) => p.id),
            requestedAt: before.time,
            releasedAt: after.time,
            horizonAt: after.time + 7,
            passId: config.family === 'shot' ? null : (after.lastPassDiagnostic?.passId ?? null),
            shotId: config.family === 'shot' ? (after.ball.shot?.shotId ?? null) : null,
            information: 'privileged_engineering_observer',
            conditionalOnRelease: true,
          },
          samples,
        ),
        contacts,
        actions,
        frames,
        finalHash: hash(current),
        finalScore: current.score,
        keeperIntervention: current.keeperIntervention ?? null,
        lastShot: current.lastShot ?? null,
        usefulNextAction: actions.some(
          (a) =>
            a.action?.actorId === f.receiver.id &&
            ['pass', 'shot', 'cross'].includes(a.action.type),
        ),
      };
    }
    result.arms.push(row);
  }
  const experimental = result.arms[1];
  if (experimental.contact && experimental.released) {
    const c = experimental.contact;
    result.nominal = flight(
      {
        ...experimental.launch,
        velocity: c.nominalVelocity,
        spin: c.nominalSpin,
        airborne: c.nominalVelocity.z > 0,
      },
      c.intendedTarget,
      f.actor,
      config.family === 'shot',
      false,
      environment,
    );
  } else result.nominal = null;
  return result;
}
