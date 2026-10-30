import console from 'node:console';
import assert from 'node:assert/strict';
import { resolveReceptionOutcome } from '../src/core/matchSimulation/passReception.ts';
import { assessFirstTouch } from '../src/core/matchSimulation/firstTouch.ts';
import { createFreshReleases } from './pr201Fixtures.mjs';
import { createProspectiveFixture } from '../src/core/matchSimulation/prospectivePlayLaboratory.ts';
import { advanceActivePerception } from '../src/core/matchSimulation/activePerception.ts';
import { advanceLiveBallFlight } from '../src/core/matchSimulation/liveBallFlight.ts';
import { advanceReceivingPositions } from '../src/core/matchSimulation/receivingPositions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { hash, source } from './pr199Evidence.mjs';

// Synthetic information-boundary intervention, not a natural-match result.
// The released physical ball and every state field are identical across arms,
// except that the second arm deletes the hidden receptionPreparation metadata.
const sourceBefore = source();
const e = createFreshReleases(201).entries.find(
  (x) => x.family === 'short_ground' && x.skill === 55 && x.sample === 0 && x.factor === 'unpressured',
);
if (!e) throw Error('Fixture unavailable');
const f = createProspectiveFixture({ seed: 'pr204-continuity' });
const fixture = advanceReceivingPositions(advanceActivePerception(advanceLiveBallFlight(f.state)));
const job = globalThis.structuredClone(fixture.activePerceptionRuntime.positions[f.c.id]);
let state = globalThis.structuredClone(e.state);
Object.assign(state, {
  experimentalDefensiveReception: true, experimentalHeightAwarePassing: true,
  experimentalReceiverAnticipation: true, experimentalReceiverSynchronisation: false,
  experimentalBoundedBallFlightBelief: true, boundedReceiverRecovery: 'hold-local-v1',
  situationalAwareness: 'bounded-v1', prospectiveMovement: 'two-pass-continuity-dev-v1',
  experimentalActivePerception: true,
});
delete state.integrationProfile;
state = advanceActivePerception(state);
const receiver = state.players.find((p) => p.id === e.contract.receiverId);
job.target = { x: receiver.position.x + 5, y: receiver.position.y };
job.origin = { ...receiver.position };
job.observedAt = state.time;
job.expiresAt = state.time + 2;
job.prospective.recognisedAt = state.time - 1;
job.prospective.horizonAt = state.time + 2;
job.prospective.status = 'supported';
state.activePerceptionRuntime.positions[receiver.id] = job;
state.receptionPreparation.awarenessAt = state.time + 1;
delete receiver.ballMotorObservation;
const withPreparation = globalThis.structuredClone(state);
const withoutPreparation = globalThis.structuredClone(state);
delete withoutPreparation.receptionPreparation;
const oldClock = globalThis.structuredClone(withPreparation);
oldClock.receptionPreparation.awarenessAt = Math.max(0, state.time - 2);
const otherActor = globalThis.structuredClone(withPreparation);
otherActor.receptionPreparation.actorId = otherActor.players.find(p => p.id !== receiver.id).id;
const otherRecipient = globalThis.structuredClone(withoutPreparation);
otherRecipient.ball.intendedReceiverId = otherRecipient.players.find(p => p.id !== receiver.id).id;
const arms = {};
for (const [name, copy] of [['hiddenPreparation', withPreparation], ['noPreparation', withoutPreparation],
  ['oldClock', oldClock], ['otherActor', otherActor], ['otherRecipient', otherRecipient]]) {
  let input = null;
  globalThis.__mflPr199Lab = {
    integrateCanonicalMovement: ([p, movement], original) => {
      if (p.id === receiver.id) input = movement;
      return original(p, movement);
    },
  };
  const next = step(copy, 0.025);
  const p = next.players.find((q) => q.id === receiver.id);
  arms[name] = { input, position: p.position, velocity: p.velocity, target: p.target,
    observation: p.ballMotorObservation ?? null };
}
delete globalThis.__mflPr199Lab;
const sourceAfter = source();
const result = {
  schema: 'pr204-hidden-handoff-probe-v1', source: hash(sourceBefore),
  sourceAfter: hash(sourceAfter), stable: hash(sourceBefore) === hash(sourceAfter), sourceManifest: sourceBefore,
  qualification: 'Synthetic paired metadata intervention; initial jobs and awareness clock are deliberately constructed. Both arms use the same canonical physical ball and actual 40 Hz integrator. It does not claim a natural-match frequency.',
  ballHash: hash(state.ball), commonExceptPreparationHash: hash(withoutPreparation),
  initial: { at: state.time, awarenessAt: state.receptionPreparation.awarenessAt,
    position: receiver.position, velocity: receiver.velocity, supportTarget: job.target,
    sensor: state.liveBallFlightRuntime?.sensors?.[receiver.id] ?? null }, arms,
};
assert.deepEqual(arms.hiddenPreparation, arms.noPreparation, 'hidden preparation changed the movement');
assert.deepEqual(arms.oldClock, arms.noPreparation, 'hidden clock changed the movement');
assert.deepEqual(arms.otherActor, arms.noPreparation, 'hidden actor changed the movement');
assert.deepEqual(arms.otherRecipient, arms.noPreparation, 'hidden recipient changed the movement');
const altered = globalThis.structuredClone(withPreparation);
altered.receptionPreparation.awarenessAt = Math.max(0, state.time - 5);
altered.receptionPreparation.contactSurface = 'sole';
altered.receptionPreparation.movement = 'run_onto_ball';
altered.receptionPreparation.continuation = { target: { x: 90, y: 10 }, mode: 'sprint',
  createdAt: state.time - 1, expiresAt: state.time + 2, incomingVelocity: { x: 20, y: 0 } };
if (altered.currentAction?.type === 'pass') altered.currentAction.intent = 'through';
const point = { x: state.ball.x, y: state.ball.y };
const p1 = withoutPreparation.players.find(p => p.id === receiver.id);
const p2 = altered.players.find(p => p.id === receiver.id);
assert.deepEqual(assessFirstTouch(withoutPreparation, p1, point, point, 'cushion'), assessFirstTouch(altered, p2, point, point, 'cushion'), 'hidden preparation changed first touch');
assert.deepEqual(resolveReceptionOutcome(withoutPreparation, p1, point), resolveReceptionOutcome(altered, p2, point), 'hidden preparation changed contact execution');
console.log(JSON.stringify({ source: result.source, stable: result.stable, arms: result.arms }));
