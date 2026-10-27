import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { spawn } from 'node:child_process';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { observeReceptionBall } from '../src/core/matchSimulation/ballOrientedMovement.ts';
import { projectLiveReceptionTarget } from '../src/core/matchSimulation/passReception.ts';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics.ts';
import { physicalBall } from './pr197Trace.mjs';
import { sourceIdentity, hash, receipt, argumentsMap } from './pr197Evidence.mjs';
const args = argumentsMap();
const worker = () => {
  const f = createCalibrationFixture({
      scenario: 'long_pass',
      attacker: 80,
      defender: 60,
      seed: 'pr197-profile',
    }),
    s = f.state;
  const a = s.players.find((p) => p.id === f.actorId),
    r = s.players.find((p) => p.id === f.receiverId),
    rows = [];
  for (const canonical of [false, true])
    for (const model of ['baseline', 'height']) {
      const state = {
        ...s,
        experimentalCanonicalArrival: canonical,
        experimentalHeightAwarePassing: model === 'height',
      };
      let result;
      const cpu = process.cpuUsage(),
        start = performance.now();
      for (let i = 0; i < 120; i++)
        result = evaluatePassDecision(state, a, r, f.action.target, 'direct', 'lofted');
      rows.push({
        kind: 'pass_forecast',
        canonical,
        model,
        calls: 120,
        milliseconds: performance.now() - start,
        cpu: process.cpuUsage(cpu),
        outputHash: hash(result),
      });
    }
  const released = resolveMatchAction(globalThis.structuredClone(s), f.action);
  const observedFlight = projectFutureBallTrajectory(physicalBall(released), 1, 0.025).at(-1).ball;
  released.time += 1;
  Object.assign(released.ball, {
    x: observedFlight.position.x,
    y: observedFlight.position.y,
    height: observedFlight.position.z,
    velocity: observedFlight.velocity,
    airborne: observedFlight.airborne,
  });
  const receiver = released.players.find((p) => p.id === r.id);
  receiver.facingAngle = -Math.PI / 2;
  receiver.ballMotorObservation = observeReceptionBall(released, receiver);
  for (const model of ['baseline', 'receiver']) {
    const state = { ...released, experimentalReceiverAnticipation: model === 'receiver' },
      start = performance.now(),
      cpu = process.cpuUsage();
    let result;
    for (let i = 0; i < 1200; i++) result = projectLiveReceptionTarget(state, receiver);
    rows.push({
      kind: 'receiver_forecast',
      model,
      calls: 1200,
      milliseconds: performance.now() - start,
      cpu: process.cpuUsage(cpu),
      outputHash: hash(result ?? null),
    });
  }
  return { rows, memory: process.memoryUsage(), maxRSSKiB: process.resourceUsage().maxRSS };
};
if (args.has('worker')) console.log(JSON.stringify(worker()));
else {
  const identity = sourceIdentity(),
    serial = worker(),
    start = performance.now();
  const concurrent = await Promise.all(
    [0, 1].map(
      () =>
        new Promise((resolve, reject) => {
          let output = '';
          const p = spawn(
            process.execPath,
            [
              '--max-semi-space-size=64',
              '--experimental-transform-types',
              '--import',
              './scripts/registerTypescriptLoader.mjs',
              'scripts/profilePr197.mjs',
              '--worker',
            ],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] },
          );
          p.stdout.on('data', (d) => {
            output += d;
          });
          p.once('error', reject);
          p.once('exit', (code) =>
            code === 0 ? resolve(JSON.parse(output)) : reject(Error('Profile child exit ' + code)),
          );
        }),
    ),
  );
  receipt(`docs/performance/pr197/profile-${args.get('version') ?? 'v1'}.json`, {
    source: identity,
    serial,
    concurrent,
    concurrentWallMilliseconds: performance.now() - start,
    node: process.version,
    cpuModel: cpus()[0]?.model,
    logicalCpus: cpus().length,
    qualification:
      'Serial means one measurement process; other development matches may run on the host. Concurrent means two identical workers. No no-debug 90-minute target claim.',
  });
  console.log('PR197 forecast profile saved');
}
