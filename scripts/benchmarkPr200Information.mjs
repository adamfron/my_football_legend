import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import {
  read,
  hash,
  identity as pr200Identity,
  write,
  ROOT as PR200_ROOT,
} from './pr200Evidence.mjs';
import { withIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
import {
  advanceLiveBallFlight,
  observedMotorBall,
  boundedKeeperCommand,
} from '../src/core/matchSimulation/liveBallFlight.ts';
import { advanceActivePerception } from '../src/core/matchSimulation/activePerception.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { resolveGoalkeeperContact } from '../src/core/matchSimulation/goalkeeperIntervention.ts';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const pr201 = args.has('pr201');
const { ROOT, identity } = pr201
  ? await import('./pr201Evidence.mjs')
  : { ROOT: PR200_ROOT, identity: pr200Identity };
const source = identity(),
  started = performance.now(),
  cpu = process.cpuUsage();
const frozen = read('docs/performance/pr198/releases-v1.json.gz').result.rows[0].state;
const setup = () => {
  const s = withIntegrationProfile(
    globalThis.structuredClone(frozen),
    pr201 ? 'realism-candidate-v1' : 'realism-candidate-v0',
  );
  s.players = [s.players[0]];
  const p = s.players[0];
  p.position = { x: 50, y: 34 };
  p.facingAngle = -Math.PI / 2;
  s.ball = { ...s.ball, x: 40, y: 34, height: 0.11 };
  delete s.ball.ownerId;
  return s;
};
const rows = [];
let a = setup(),
  b = globalThis.structuredClone(a);
b.ball.velocity = { x: 123, y: -99, z: 40 };
b.ball.spin = { x: 40, y: 50, z: 60 };
b.ball.target = { x: 100, y: 2 };
a = advanceLiveBallFlight(a);
b = advanceLiveBallFlight(b);
assert.deepEqual(a.liveBallFlightRuntime, b.liveBallFlightRuntime);
assert.equal(observedMotorBall(a, a.players[0]).ball, null);
rows.push({
  case: 'single-position-hidden-velocity-spin-target',
  inputA: hash(a.ball),
  inputB: hash(b.ball),
  outputA: hash(a.liveBallFlightRuntime),
  outputB: hash(b.liveBallFlightRuntime),
  noVelocityFromSinglePosition: true,
});
for (let i = 1; i <= 8; i++) {
  const time = frozen.time + i * 0.025;
  const x = 40 - i * 0.1;
  a = advanceLiveBallFlight({ ...a, time, ball: { ...a.ball, x } });
  b = advanceLiveBallFlight({ ...b, time, ball: { ...b.ball, x } });
}
assert.deepEqual(a.liveBallFlightRuntime, b.liveBallFlightRuntime);
const id = a.players[0].id;
assert.equal(a.liveBallFlightRuntime.sensors[id].belief.velocitySource, 'optical_interval');
assert.deepEqual(observedMotorBall(a, a.players[0]).ball.spin, { x: 0, y: 0, z: 0 });
rows.push({
  case: 'continuous-optical-motion',
  motionSource: a.liveBallFlightRuntime.sensors[id].belief.velocitySource,
  evidence: globalThis.structuredClone(a.liveBallFlightRuntime.sensors[id].belief),
  sameOutputUnderHiddenTruth: hash(a.liveBallFlightRuntime) === hash(b.liveBallFlightRuntime),
});
const prior = globalThis.structuredClone(a.liveBallFlightRuntime.sensors[id].belief);
a = advanceLiveBallFlight({
  ...a,
  time: a.time + 0.4,
  ball: { ...a.ball, x: 65, velocity: { x: -40, y: 20, z: 3 } },
});
assert.deepEqual(a.liveBallFlightRuntime.sensors[id].belief, prior);
rows.push({
  case: 'unseen-deflection-keeps-both-clocks',
  before: hash(prior),
  after: hash(a.liveBallFlightRuntime.sensors[id].belief),
  evidenceAt: prior.evidenceAt,
  motionEvidenceAt: prior.motionEvidenceAt,
});
let active = setup();
active.experimentalActivePerception = true;
active = advanceActivePerception(advanceLiveBallFlight(active));
const seen = active.activePerceptionRuntime.memory[id].ballSeenAt;
active = advanceActivePerception(
  advanceLiveBallFlight({ ...active, time: active.time + 0.4, ball: { ...active.ball, x: 65 } }),
);
assert.equal(active.activePerceptionRuntime.memory[id].ballSeenAt, seen);
rows.push({
  case: 'active-memory-not-relabeled',
  actualSightingAt: seen,
  memorySeenAt: active.activePerceptionRuntime.memory[id].ballSeenAt,
});
const x = withIntegrationProfile(
  globalThis.structuredClone(frozen),
  pr201 ? 'realism-candidate-v1' : 'realism-candidate-v0',
);
x.ball = { ...x.ball, x: 52, y: 4, height: 2.5, velocity: { x: 1, y: 0, z: 0 } };
const y = globalThis.structuredClone(x);
y.ball = {
  ...y.ball,
  x: 62,
  y: 64,
  velocity: { x: -8, y: 9, z: 2 },
  spin: { x: 40, y: 50, z: 60 },
};
const xx = step(x, 0.025),
  yy = step(y, 0.025);
for (const p of xx.players.filter((p) => p.slot.position === 'goalkeeper')) {
  const q = yy.players.find((q) => q.id === p.id);
  const own = (v) => ({
    position: v.position,
    velocity: v.velocity,
    facing: v.facingAngle,
    target: v.target,
  });
  assert.deepEqual(own(p), own(q));
  rows.push({
    case: 'live-keeper-after-all-movement-consumers',
    keeperId: p.id,
    commandA: hash(own(p)),
    commandB: hash(own(q)),
  });
}
const passive = setup(),
  keeper = passive.players[0];
const action = resolveGoalkeeperContact(
  passive,
  {
    keeper,
    reactionDelay: 0,
    reactionRemaining: 0,
    ballTotalFlightTime: 1,
    ballRemainingFlightTime: 0,
    timeAvailable: 0,
    contactPoint: { ...keeper.position, z: 1 },
    requiredDisplacement: 0,
    availableReach: 2,
    reachable: true,
  },
  8,
);
assert.equal(action, 'failed_save');
const hidden = globalThis.structuredClone(passive);
hidden.ball = { ...hidden.ball, x: 99, y: 2, velocity: { x: -99, y: 40, z: 5 } };
assert.deepEqual(
  boundedKeeperCommand(passive, keeper),
  boundedKeeperCommand(hidden, hidden.players[0]),
);
rows.push({
  case: 'active-save-needs-sensory-permission',
  privilegedProjectionReachable: true,
  actualPermittedAction: action,
});
const result = {
  schema: pr201 ? 'pr201-information-boundary-v1' : 'pr200-information-boundary-v1',
  source,
  rows,
  scope:
    'Live ball velocity/spin/timestamps and named keeper movement/action consumers only; broader AI and physical outcome calibration remain open.',
};
if (args.has('check')) {
  const { source: _old, ...old } = read(args.get('check')).result;
  const { source: _new, ...actual } = result;
  void _old;
  void _new;
  assert.equal(hash(actual), hash(old));
} else
  write(
    `${ROOT}/information-boundary-${pr201 ? (args.get('version') ?? 'final-v1') : 'final-v1'}.json.gz`,
    {
      result,
      costs: {
        wallSeconds: (performance.now() - started) / 1000,
        cpu: process.cpuUsage(cpu),
        peakRSSKiB: process.resourceUsage().maxRSS,
      },
    },
  );
console.log(
  pr201 ? 'PR201 live information contract PASS' : 'PR200 live information contract PASS',
  rows.length,
  'source-bound interventions',
);
