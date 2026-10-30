import console from 'node:console';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
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
const arms = {};
for (const [name, copy] of [['hiddenPreparation', withPreparation], ['noPreparation', withoutPreparation]]) {
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
mkdirSync('docs/performance/pr204', { recursive: true });
writeFileSync(`docs/performance/pr204/hidden-handoff-${result.stable ? 'stable' : 'unstable'}-v1.json.gz`,
  gzipSync(JSON.stringify(result), { level: 9 }), { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
