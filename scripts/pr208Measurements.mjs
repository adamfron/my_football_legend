import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { source, hash } from './pr199Evidence.mjs';
import { runPair } from './pr207Experiments.mjs';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { integrateBallFlight, BALL_PHYSICS } from '../src/core/matchSimulation/ballPhysics.ts';

const options = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const mode = options.get('mode') ?? 'sweep';
const root = options.get('output') ?? 'docs/performance/pr208';
const edition = options.get('version') ?? 'development-v1';
assert.ok(['sweep', 'trajectories', 'live'].includes(mode));
assert.match(edition, /^[a-z0-9-]+$/);
const environment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' };
const manifest = source(),
  start = performance.now(),
  cpu = process.cpuUsage();
const readFrozen = (mode) =>
  JSON.parse(gunzipSync(readFileSync(`docs/performance/pr207/${mode}-development-v1.json.gz`)));
const kinetic = (v, w = { x: 0, y: 0, z: 0 }) =>
  0.5 * 0.43 * (v.x * v.x + v.y * v.y + v.z * v.z) +
  ((0.43 * 0.11 * 0.11) / 3) * (w.x * w.x + w.y * w.y + w.z * w.z);
const makeBall = (vz, vx = 10, spin = { x: 0, y: 0, z: 0 }, height = 0.11) => ({
  position: { x: 30, y: 34, z: height },
  velocity: { x: vx, y: 0, z: vz },
  spin,
  airborne: vz > 0 || height > 0.11,
  bounceCount: 0,
});
function stop(initial, dt, env, trace = false) {
  let ball = initial,
    at = 0,
    apex = initial.position.z,
    maxImpactEnergyGain = 0;
  const impacts = [],
    steps = [];
  for (let tick = 0; tick < Math.ceil(30 / dt); tick++) {
    ball = integrateBallFlight(ball, dt, env, (event) => {
      const before = kinetic(event.incomingVelocity, event.incomingSpin),
        after = kinetic(event.outgoingVelocity, event.outgoingSpin);
      maxImpactEnergyGain = Math.max(maxImpactEnergyGain, after - before);
      impacts.push({ ...event, at: at + event.at, kineticBefore: before, kineticAfter: after });
    });
    at = (tick + 1) * dt;
    apex = Math.max(apex, ball.position.z);
    if (trace && tick < 12) steps.push({ at, ...ball, kinetic: kinetic(ball.velocity, ball.spin) });
    if (!ball.airborne && Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z) < 1e-8)
      break;
  }
  return {
    stop: ball.position,
    velocity: ball.velocity,
    spin: ball.spin,
    airborne: ball.airborne,
    elapsed: at,
    apex,
    bounceCount: ball.bounceCount,
    firstImpact: impacts[0] ?? null,
    lastImpact: impacts.at(-1) ?? null,
    maxImpactEnergyGain,
    censored: ball.airborne || Math.hypot(ball.velocity.x, ball.velocity.y) > 0.000001,
    ...(trace ? { steps, impacts } : {}),
  };
}
let result;
if (mode === 'sweep') {
  const spins = [
    { name: 'zero', value: { x: 0, y: 0, z: 0 } },
    { name: 'top', value: { x: 0, y: 80, z: 0 } },
    { name: 'back', value: { x: 0, y: -80, z: 0 } },
    { name: 'side', value: { x: 0, y: 0, z: 80 } },
    { name: 'mixed-limit', value: { x: 160, y: -160, z: 160 } },
  ];
  const rows = [];
  for (const vz of [
    -6, -2, -0.2, -0.01, -0.001, -1e-6, 0, 1e-6, 0.001, 0.01, 0.05, 0.123, 0.2, 1, 2, 6,
  ])
    for (const vx of [1, 5, 10, 25])
      for (const spin of spins)
        for (const dt of [0.025, 0.0125, 0.00625]) {
          const initial = makeBall(vz, vx, spin.value);
          const legacy = stop(initial, dt, undefined),
            corrected = stop(initial, dt, environment);
          assert.ok(corrected.maxImpactEnergyGain < 1e-8, 'Impact creates energy');
          assert.equal(corrected.censored, false);
          rows.push({ vz, vx, spin: spin.name, dt, legacy, corrected });
        }
  const recorded = [-0.001, 0, 0.001, 0.2].map((vz) => ({
    vz,
    initial: makeBall(vz),
    legacy: stop(makeBall(vz), 0.025, undefined, true),
    corrected: stop(makeBall(vz), 0.025, environment, true),
  }));
  const boundaries = [];
  for (const time of [
    0.000001, 0.012499, 0.0125, 0.024999, 0.025, 0.025001, 0.049999, 0.05, 0.050001,
  ])
    for (const incoming of [-1, -8, -30]) {
      const height = 0.11 - incoming * time + 4.905 * time * time;
      boundaries.push({
        time,
        incoming,
        height,
        results: [0.025, 0.0125, 0.00625].map((dt) => ({
          dt,
          ...stop(makeBall(incoming, 10, spins[0].value, height), dt, environment, true),
        })),
      });
    }
  const costs = {};
  for (const [kind, initial] of [
    ['rolling', makeBall(0)],
    ['tiny-hop', makeBall(0.001)],
    ['real-impact', makeBall(-8, 10, { x: 10, y: -20, z: 30 }, 0.15)],
  ])
    for (const [name, env] of [
      ['legacy', undefined],
      ['corrected', environment],
    ]) {
      for (let i = 0; i < 1000; i++) integrateBallFlight(initial, 0.025, env);
      const begin = performance.now(),
        usage = process.cpuUsage(),
        calls = 100000;
      for (let i = 0; i < calls; i++) integrateBallFlight(initial, 0.025, env);
      costs[kind + '/' + name] = {
        calls,
        wallMicrosecondsPerCall: ((performance.now() - begin) * 1000) / calls,
        cpuMicrosecondsPerCall:
          Object.values(process.cpuUsage(usage)).reduce((a, b) => a + b, 0) / calls,
      };
    }
  result = { recorded, rows, boundaries, microCost: costs, constants: BALL_PHYSICS };
} else {
  const frozen = readFrozen(mode === 'live' ? 'live' : 'lab'),
    rows = [];
  for (const original of frozen.result.rows) {
    const before = runPair(original.config, mode === 'live');
    assert.equal(
      hash(before),
      hash(original),
      'Original PR207 exact-state replay drift ' + JSON.stringify(original.config),
    );
    if (mode === 'trajectories') {
      const corrected = runPair(original.config, false, environment);
      rows.push({
        config: original.config,
        inputHash: original.inputHash,
        arms: original.arms.map((arm, i) => {
          const next = corrected.arms[i];
          assert.equal(arm.released, next.released, 'Release eligibility changed');
          if (arm.released) {
            assert.deepEqual(
              arm.launch.velocity,
              next.launch.velocity,
              'Ground repair changed kick velocity',
            );
            assert.deepEqual(arm.launch.spin, next.launch.spin, 'Ground repair changed kick spin');
          }
          return {
            model: arm.model,
            released: arm.released,
            initialVelocity: arm.launch?.velocity ?? null,
            initialSpin: arm.launch?.spin ?? null,
            contactError: arm.contact?.perturbation ?? null,
            target: arm.target,
            legacy: arm.flight,
            corrected: next.flight,
          };
        }),
      });
    } else {
      const corrected = runPair(original.config, true, environment);
      const fixture = createKickFixture(original.config);
      const paired = [];
      // All bodies start identically and every delivery starts with its preserved launch.
      // First physical, body and action divergences are measured separately at 40 Hz.
      for (let i = 0; i < 2; i++) {
        const input = globalThis.structuredClone(fixture.state);
        if (i === 0) delete input.experimentalKickExecution;
        let old = resolveMatchAction(input, fixture.action, 'human_selected');
        if (!original.arms[i].released) {
          paired.push(null);
          continue;
        }
        let next = globalThis.structuredClone(old);
        next.ballEnvironment = environment;
        let firstBall = null,
          firstBody = null,
          firstReceiver = null,
          firstOpponent = null,
          firstAction = null,
          actionWitness = null;
        for (let tick = 1; tick <= 280; tick++) {
          old = step(old, 0.025);
          next = step(next, 0.025);
          if (firstBall === null && hash(old.ball) !== hash(next.ball)) firstBall = tick * 0.025;
          const body = (p) => ({
            id: p.id,
            position: p.position,
            velocity: p.velocity,
            facing: p.facingAngle,
            target: p.target,
          });
          if (firstBody === null && hash(old.players.map(body)) !== hash(next.players.map(body)))
            firstBody = tick * 0.025;
          if (
            firstReceiver === null &&
            hash(old.players.filter((p) => p.id === fixture.receiver.id).map(body)) !==
              hash(next.players.filter((p) => p.id === fixture.receiver.id).map(body))
          )
            firstReceiver = tick * 0.025;
          if (
            firstOpponent === null &&
            hash(old.players.filter((p) => p.team !== fixture.actor.team).map(body)) !==
              hash(next.players.filter((p) => p.team !== fixture.actor.team).map(body))
          )
            firstOpponent = tick * 0.025;
          if (
            firstAction === null &&
            hash({ index: old.decisionIndex, action: old.currentAction }) !==
              hash({ index: next.decisionIndex, action: next.currentAction })
          ) {
            firstAction = tick * 0.025;
            actionWitness = {
              legacy: old.currentAction,
              corrected: next.currentAction,
              legacyOwner: old.ball.ownerId ?? null,
              correctedOwner: next.ball.ownerId ?? null,
            };
          }
        }
        paired.push({
          firstBall,
          firstBody,
          firstReceiver,
          firstOpponent,
          firstAction,
          actionWitness,
          legacyFinal: hash(old),
          correctedFinal: hash(next),
        });
      }
      rows.push({
        config: original.config,
        inputHash: original.inputHash,
        arms: original.arms.map((arm, i) => {
          const next = corrected.arms[i];
          if (arm.released) {
            assert.deepEqual(arm.launch.velocity, next.launch.velocity);
            assert.deepEqual(arm.launch.spin, next.launch.spin);
          }
          return {
            model: arm.model,
            released: arm.released,
            initialVelocity: arm.launch?.velocity ?? null,
            initialSpin: arm.launch?.spin ?? null,
            target: arm.target,
            legacy: arm.continuation ?? null,
            corrected: next.continuation ?? null,
            legacyFlight: arm.flight,
            correctedFlight: next.flight,
            paired: paired[i],
          };
        }),
      });
    }
  }
  result = {
    frozenResultHash: hash(frozen.result),
    originalRows: rows.length,
    originalExactReplay: true,
    unchangedLaunchVelocityAndSpin: true,
    rows,
  };
}
assert.deepEqual(source(), manifest, 'Source changed during measurement');
const receipt = {
  schema: 'pr208-measurement-v1',
  mode,
  source: hash(manifest),
  environment,
  result,
};
const costs = {
  wallSeconds: (performance.now() - start) / 1000,
  cpuSeconds: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b, 0) / 1e6,
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
const output = `${root}/${mode}-${edition}.json.gz`;
if (options.has('check'))
  assert.equal(
    hash(JSON.parse(gunzipSync(readFileSync(output))).receipt),
    hash(receipt),
    'PR208 exact replay drift',
  );
else {
  mkdirSync(root, { recursive: true });
  writeFileSync(output, gzipSync(JSON.stringify({ receipt, costs }), { level: 9 }), { flag: 'wx' });
}
console.log(JSON.stringify({ output, source: receipt.source, rows: result.rows.length, costs }));
