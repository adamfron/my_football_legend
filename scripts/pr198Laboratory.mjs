import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { playerFootGeometry } from '../src/core/matchSimulation/footContact.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { planBallOrientedMovement } from '../src/core/matchSimulation/ballOrientedMovement.ts';
import { hash } from './pr198Evidence.mjs';
export const continueRelease = (frozen, flags, intervention, observer) => {
  let s = globalThis.structuredClone(frozen.state);
  Object.assign(s, flags);
  intervention?.(s);
  if (hash(s.ball) !== frozen.ballHash) throw Error('Same-release ball changed');
  const startHash = hash(s),
    samples = [frozen.releaseSample],
    frames = [];
  for (let tick = 0; tick < 320; tick++) {
    const before = s;
    s = step(s, 0.025);
    const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
    samples.push(sample);
    observer?.(before, s, sample);
    const r = s.players.find((p) => p.id === frozen.contract.receiverId);
    if (r && (tick % 4 === 0 || sample.contacts.length)) {
      const feet = playerFootGeometry(r),
        prep = s.receptionPreparation;
      const local =
        prep?.actorId === r.id && r.ballMotorObservation
          ? planBallOrientedMovement(
              r,
              r.ballMotorObservation,
              s.time,
              r.target,
              'receive',
              prep.awarenessAt,
            )
          : null;
      frames.push({
        at: s.time,
        position: r.position,
        velocity: r.velocity,
        facing: r.facingAngle,
        target: r.target,
        plantBalance: r.plantBalance ?? null,
        supportLeg: r.plantBalance?.support ?? null,
        observation: r.ballMotorObservation ?? null,
        releasePoint: frozen.state.receptionPreparation?.expectedContactPoint ?? null,
        releaseArrivalAt: frozen.state.receptionPreparation?.expectedArrivalTime ?? null,
        requestedPoint: prep?.expectedContactPoint ?? null,
        requestedArrivalAt: prep?.expectedArrivalTime ?? null,
        effectiveContactAt: s.experimentalReceiverSynchronisation
          ? (prep?.meetingPlan?.contactAt ?? null)
          : (prep?.expectedArrivalTime ?? null),
        meeting: prep?.meetingPlan ?? null,
        legacyLocalPlan: local,
        ball: sample.ball,
        incomingVelocity: sample.velocity,
        footDistance: Math.min(distance(feet.leftFoot, s.ball), distance(feet.rightFoot, s.ball)),
        footReach: feet.footReach,
        footAccessible:
          (s.ball.height ?? 0) <= 0.65 &&
          Math.min(distance(feet.leftFoot, s.ball), distance(feet.rightFoot, s.ball)) <=
            feet.footReach,
        contacts: sample.contacts,
        receptionOutcome:
          s.lastReceptionOutcome?.receiverId === r.id ? s.lastReceptionOutcome : null,
      });
    }
    if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status)) break;
  }
  const outcome = interpretCanonicalOutcome(frozen.contract, samples);
  const contact = frames.find((f) =>
    f.contacts.some((c) => c.actorId === frozen.contract.receiverId),
  );
  const planned = [...frames]
    .reverse()
    .find((f) => f.at <= (outcome.receiverTouchAt ?? 0) && f.meeting?.contactPoint);
  const diagnostic = {
    actualContactLocation: contact?.ball ?? null,
    spatialError: contact && planned ? distance(contact.ball, planned.meeting.contactPoint) : null,
    temporalError:
      outcome.receiverTouchAt !== null && planned
        ? outcome.receiverTouchAt - planned.meeting.contactAt
        : null,
    feetReadyAtContact: contact?.footAccessible ?? null,
    balanceAtContact: contact?.plantBalance?.balance ?? null,
    maximumClockDisagreement: Math.max(
      0,
      ...frames
        .filter((f) => f.legacyLocalPlan?.contactSeconds !== null && f.legacyLocalPlan)
        .map((f) =>
          Math.abs(f.at + f.legacyLocalPlan.contactSeconds - (f.requestedArrivalAt ?? f.at)),
        ),
    ),
    legacyBeyondHorizon: frames.filter((f) => (f.legacyLocalPlan?.contactSeconds ?? 0) > 2.4)
      .length,
    localPlanCount: frames.filter((f) => f.meeting?.status === 'contact_planned').length,
    noPreparedContactCount: frames.filter((f) => f.meeting?.status === 'no_prepared_contact')
      .length,
  };
  return {
    outcome,
    startHash,
    finalHash: hash(s),
    samplesHash: hash(samples),
    framesHash: hash(frames),
    diagnostic,
    frames,
    final: s,
  };
};
