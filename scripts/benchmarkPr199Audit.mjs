import console from 'node:console';
import assert from 'node:assert/strict';
import { read, hash, identity, finish } from './pr199Evidence.mjs';
import {
  observeBallMotorState,
  observeReceptionBall,
} from '../src/core/matchSimulation/ballOrientedMovement.ts';
import { planSynchronizedReception } from '../src/core/matchSimulation/receiverSynchronisation.ts';
import { advanceActivePerception } from '../src/core/matchSimulation/activePerception.ts';
import { angleForVector } from '../src/core/matchSimulation/playerOrientation.ts';
import { projectGoalkeeperIntervention } from '../src/core/matchSimulation/goalkeeperIntervention.ts';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
const source = identity(),
  rows = [];
const entry = read('docs/performance/pr198/releases-v1.json.gz').result.rows[0];
const s = globalThis.structuredClone(entry.state),
  actor = s.players.find((p) => p.id === entry.contract.receiverId);
actor.facingAngle = angleForVector({
  x: s.ball.x - actor.position.x,
  y: s.ball.y - actor.position.y,
});
delete actor.ballMotorObservation;
const initialHash = hash(s),
  sight = observeBallMotorState(s, actor);
assert.deepEqual(sight.ball.velocity, s.ball.velocity);
rows.push({
  claim: 'A newly visible ball receives exact physical velocity',
  finding: 'CONFIRMED',
  source: [
    'src/core/matchSimulation/boundedPerception.ts:observeBoundedScene',
    'src/core/matchSimulation/ballOrientedMovement.ts:observeBallMotorState',
  ],
  witness: { canonical: s.ball.velocity, observation: sight.ball.velocity },
  limitation: 'Existing snapshot contract, not evidence of a plausible optical-motion interval',
});
const spun = globalThis.structuredClone(s);
spun.ball.spin = { x: 0, y: 0, z: 80 };
const coarse = observeBallMotorState(
  spun,
  spun.players.find((p) => p.id === actor.id),
);
const reception = observeReceptionBall(
  spun,
  spun.players.find((p) => p.id === actor.id),
);
assert.equal(coarse.ball.spin.z, 80);
assert.equal(reception.ball.spin.z, 0);
rows.push({
  claim: 'General motor adapter reads canonical spin; reception-specific path removes it',
  finding: 'CONFIRMED',
  source: [
    'src/core/matchSimulation/ballOrientedMovement.ts:observeBallMotorState',
    'src/core/matchSimulation/ballOrientedMovement.ts:observeReceptionBall',
  ],
  witness: { coarse: coarse.ball.spin, reception: reception.ball.spin },
  limitation: 'General adapter has no actual rotation-sensing interval',
});
let active = advanceActivePerception({ ...s, experimentalActivePerception: true });
const oldMemory = active.activePerceptionRuntime.memory[actor.id];
assert.ok(oldMemory.ball);
active = globalThis.structuredClone(active);
active.time += 0.1;
active.ball.x = 100;
active.ball.y = 0;
active.ball.velocity = { x: -90, y: 0, z: 0 };
active.ball.spin = { x: 0, y: 0, z: -90 };
const stale = observeReceptionBall(
  active,
  active.players.find((p) => p.id === actor.id),
);
assert.equal(stale.at, oldMemory.ballSeenAt);
assert.deepEqual(stale.ball.velocity, oldMemory.ball.velocity);
rows.push({
  claim: 'Reception refreshes canonical coordinates during a retained hidden sighting',
  finding: 'REJECTED_FOR_RECEPTION_ADAPTER',
  source: [
    'src/core/matchSimulation/activePerception.ts:advanceActivePerception',
    'src/core/matchSimulation/ballOrientedMovement.ts:observeReceptionBall',
  ],
  witness: {
    at: stale.at,
    queryAt: active.time,
    hiddenVelocity: active.ball.velocity,
    rememberedVelocity: stale.ball.velocity,
  },
  limitation: 'No physical body occlusion exists in the native bounded adapter',
});
const generalStale = observeBallMotorState(
  active,
  active.players.find((p) => p.id === actor.id),
);
assert.equal(generalStale.at, active.time);
assert.equal(generalStale.ball.spin.z, -90);
rows.push({
  claim: 'General adapter retimestamps cached ball state and refreshes hidden spin',
  finding: 'CONFIRMED',
  source: ['src/core/matchSimulation/ballOrientedMovement.ts:observeBallMotorState'],
  witness: {
    memoryAt: oldMemory.ballSeenAt,
    observationAt: generalStale.at,
    refreshedSpin: generalStale.ball.spin,
  },
  limitation:
    'Reception-specific adapter corrects these fields on its fresh-adapter branch; legacy consumers retain this debt',
});
const plan = planSynchronizedReception(actor, observeReceptionBall(s, actor), s.time, s.time);
const changed = globalThis.structuredClone(s);
changed.lastPassDiagnostic.predictedReceptionPoint = { x: 1, y: 1 };
for (const p of changed.players.filter((p) => p.team !== actor.team))
  for (const key of Object.keys(p.profile.attributes)) p.profile.attributes[key] = 100;
const after = planSynchronizedReception(
  changed.players.find((p) => p.id === actor.id),
  observeReceptionBall(
    changed,
    changed.players.find((p) => p.id === actor.id),
  ),
  changed.time,
  changed.time,
);
assert.deepEqual(after, plan);
rows.push({
  claim:
    'Privileged pass forecast or unseen opponent ratings enter synchronized reception inference',
  finding: 'REJECTED_FOR_TESTED_PATH',
  source: ['src/core/matchSimulation/receiverSynchronisation.ts:planSynchronizedReception'],
  witness: { before: hash(plan), after: hash(after) },
  limitation: 'Not a claim that every inherited tactical or goalkeeper controller is bounded',
});
const f = createCalibrationFixture({
  scenario: 'good_shot',
  attacker: 80,
  defender: 60,
  seed: 'pr199-hidden-keeper',
  mirror: false,
});
const shot = resolveMatchAction(f.state, f.action, 'autonomous_npc');
assert.ok(shot.ball.shot);
const keeper = shot.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper');
keeper.facingAngle = Math.PI / 2; // looks away from the shot, no local sightings supplied
const hiddenProjection = projectGoalkeeperIntervention(shot);
const redirected = globalThis.structuredClone(shot);
redirected.ball.velocity.y += 3;
const different = projectGoalkeeperIntervention(redirected);
assert.ok(hiddenProjection && different);
assert.notEqual(hash(hiddenProjection.contactPoint), hash(different.contactPoint));
rows.push({
  claim:
    'Goalkeeper projector responds to hidden instantaneous canonical shot state without a sighting gate',
  finding: 'CONFIRMED',
  source: [
    'src/core/matchSimulation/goalkeeperIntervention.ts:projectGoalkeeperIntervention',
    'src/core/matchSimulation/matchSimulation.ts:shot movement and contact consumers',
  ],
  witness: { first: hiddenProjection.contactPoint, changedUnseen: different.contactPoint },
  limitation:
    'Existing engineering forecast is also an acting controller input; wall and attention are not checked',
});
assert.equal(hash(s), initialHash);
rows.push({
  claim: 'Read-only observation calls mutate canonical state',
  finding: 'REJECTED_FOR_TESTED_CALLS',
  source: ['scripts/benchmarkPr199Audit.mjs'],
  witness: { before: initialHash, after: hash(s) },
  limitation: 'Physical hostile-observer equivalence is tested separately',
});
finish('information-audit-v1.json.gz', { schema: 'pr199-information-audit-v1', source, rows });
console.log('PR199 audited', rows.length, 'information claims');
