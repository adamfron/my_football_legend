import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import {
  acquireFlightSighting,
  predictFlightBelief,
} from '../src/core/matchSimulation/ballFlightBelief.ts';
import { planSynchronizedReception } from '../src/core/matchSimulation/receiverSynchronisation.ts';
import { createSensor, sampleSensor, physicalBall } from './pr199FlightLab.mjs';
import { read, identity, finish, hash, options } from './pr199Evidence.mjs';
import { projectGoalkeeperIntervention } from '../src/core/matchSimulation/goalkeeperIntervention.ts';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
const source = identity(),
  e = read('docs/performance/pr198/releases-v1.json.gz').result.rows.find(
    (e) => e.family === 'short_ground' && e.skill === 60,
  );
const actor = e.state.players.find((p) => p.id === e.contract.receiverId);
const sighting = {
  at: e.state.time,
  position: { x: e.state.ball.x, y: e.state.ball.y, z: e.state.ball.height ?? 0.11 },
  positionError: 0.04,
  motion: {
    from: { x: e.state.ball.x - 0.3, y: e.state.ball.y, z: 0.11 },
    since: e.state.time - 0.025,
  },
};
const belief = acquireFlightSighting(undefined, sighting, 60);
const observation = {
  at: e.state.time,
  nextAt: e.state.time + 0.1,
  ball: {
    position: belief.position,
    velocity: belief.velocity,
    spin: { x: 0, y: 0, z: 0 },
    owner: null,
  },
  others: [],
};
const sensor = createSensor(actor, e.seed);
const fixture = createCalibrationFixture({
  scenario: 'good_shot',
  attacker: 80,
  defender: 60,
  seed: 'pr199-keeper-profile',
  mirror: false,
});
const shot = resolveMatchAction(fixture.state, fixture.action, 'autonomous_npc');
const categories = {
  observation_acquisition: (i) =>
    sampleSensor(sensor, actor, physicalBall(e.state.ball), e.state.time + i * 0.025, true),
  trajectory_inference: () => acquireFlightSighting(undefined, sighting, 60),
  memory_update: () => predictFlightBelief(belief, e.state.time + 1.2),
  receiver_motor_planning: () =>
    planSynchronizedReception(actor, observation, e.state.time, e.state.time),
  ...(['v2', 'v3'].includes(options.get('version'))
    ? { goalkeeper_observation_reaction_projection: () => projectGoalkeeperIntervention(shot, 2.4) }
    : {}),
  logging: () => JSON.stringify({ observation, belief, actor: actor.position }),
};
const rows = [],
  costs = [];
for (const [category, fn] of Object.entries(categories)) {
  for (let i = 0; i < 24; i++) fn(i);
  const start = performance.now(),
    cpu = process.cpuUsage();
  let last;
  for (let i = 0; i < 240; i++) last = fn(i);
  rows.push({ category, calls: 240, lastHash: hash(last ?? null) });
  costs.push({ category, milliseconds: performance.now() - start, cpu: process.cpuUsage(cpu) });
}
finish(
  `performance-${options.get('version') ?? 'v1'}.json`,
  {
    schema: 'pr199-performance-v1',
    source,
    rows,
    bounds: {
      canonicalStep: 0.025,
      beliefMaximumHorizon: 4,
      ballPredictionStep: 0.1,
      motorCandidateProbes: 3,
      motorStepsPerProbe: 96,
      liveConsumersAdded: 0,
      fullMatchCPU:
        'Not rerun: diagnostic-only source has no new live imports; native observer equivalence and historical replays required',
      goalkeeperCosts:
        'Per-episode costs included in goalkeeper cohort; belief path bounds its existing projection to 2.4s',
    },
  },
  {
    execution: 'single profile process; other development processes may compete on host',
    categories: costs,
    memory: process.memoryUsage(),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
console.log('PR199 bounded profile', costs);
