import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { executePhysicalKick } from '../src/core/matchSimulation/kickExecution.ts';
import { executeFootContact } from '../src/core/matchSimulation/footContact.ts';
import { integrateBallFlight } from '../src/core/matchSimulation/ballPhysics.ts';
import { flight } from './pr207Experiments.mjs';
import { hash, source } from './pr199Evidence.mjs';
const f = createKickFixture({ seed: 'pr207-physical-checks', family: 'shot', metres: 20 });
const clean = { lateralPatchMetres: 0, verticalPatchMetres: 0, timingSeconds: 0, effortError: 0 };
const request = {
  family: 'shot',
  target: { x: 105, y: 34 },
  nominalVelocity: { x: 30, y: 0, z: 6 },
  surface: 'instep',
  preparationSeconds: 0.3,
};
const oldRequest = {
  intended: 'instep',
  desiredVelocity: request.nominalVelocity,
  balance: 1,
  preparationSeconds: 0.3,
  pressure: 0,
  contactSeconds: 0.025,
};
const nominal = executePhysicalKick(f.state, f.actor, request, clean);
const old = executeFootContact(f.state, f.actor, oldRequest);
const mirrored = [-0.004, 0.004].map((lateralPatchMetres) =>
  executePhysicalKick(
    f.state,
    f.actor,
    { ...request, nominalVelocity: { x: 10, y: 0, z: 0 } },
    { ...clean, lateralPatchMetres },
  ),
);
const symmetryResidual = {
  y: mirrored[0].contact.outgoingVelocity.y + mirrored[1].contact.outgoingVelocity.y,
  spinZ: mirrored[0].contact.outgoingSpin.z + mirrored[1].contact.outgoingSpin.z,
};
assert.ok(Math.abs(symmetryResidual.y) < 1e-9 && Math.abs(symmetryResidual.spinZ) < 1e-9);
const groundTransition = [-0.001, 0, 0.001, 0.05, 0.2, 0.3].map((vz) => {
  const ball = { ...f.state.ball, velocity: { x: 10, y: 0, z: vz }, airborne: vz > 0 };
  return {
    vz,
    firstTick: integrateBallFlight(
      {
        position: { x: 30, y: 34, z: 0.11 },
        velocity: ball.velocity,
        airborne: ball.airborne,
        bounceCount: 0,
      },
      0.025,
    ),
    flight: flight({ ...ball, x: 30 }, { x: 40, y: 34 }, f.actor),
  };
});
const sourceIdentity = hash(source()),
  result = {
    schema: 'pr207-physical-checks-v1',
    source: sourceIdentity,
    nominal,
    old,
    mirrored,
    symmetryResidual,
    groundTransition,
  };
const costs = {};
for (const [name, run] of [
  ['legacyTouch', () => executeFootContact(f.state, f.actor, oldRequest)],
  ['activeKick', () => executePhysicalKick(f.state, f.actor, request)],
]) {
  for (let i = 0; i < 200; i++) run();
  const start = performance.now(),
    cpu = process.cpuUsage();
  for (let i = 0; i < 3000; i++) run();
  costs[name] = {
    iterations: 3000,
    wallMicrosecondsPerCall: ((performance.now() - start) * 1000) / 3000,
    cpuMicrosecondsPerCall: Object.values(process.cpuUsage(cpu)).reduce((s, n) => s + n, 0) / 3000,
  };
}
costs.peakRSSKiB = process.resourceUsage().maxRSS;
const output = 'docs/performance/pr207/physical-checks.json';
if (process.argv.includes('--check'))
  assert.equal(hash(JSON.parse(readFileSync(output, 'utf8')).result), hash(result));
else writeFileSync(output, JSON.stringify({ result, costs }, null, 2) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify({
    symmetryResidual,
    old: old.outgoingVelocity,
    nominal: nominal.contact.outgoingVelocity,
    costs,
    groundTransition: groundTransition.map((r) => ({
      vz: r.vz,
      firstVx: r.firstTick.velocity.x,
      stop: r.flight.stop.x,
    })),
  }),
);
