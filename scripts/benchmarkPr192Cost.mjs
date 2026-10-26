import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  observeBallMotorState,
  planBallOrientedMovement,
} from '../src/core/matchSimulation/ballOrientedMovement.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { NaturalMatchFlowDiagnostics } from '../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts';
import { PassLifecycleDiagnostics } from '../src/core/matchSimulation/passLifecycleDiagnostics.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
const path = 'docs/performance/pr192/matches/capture-ww-combined.json.gz';
const input = JSON.parse(gunzipSync(readFileSync(path)));
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const out = 'docs/performance/pr192/cost.json';
if (existsSync(out)) throw Error('Refusing overwrite');
const p = input.players.find((p) => p.ballMotorObservation),
  actor = { ...p };
delete actor.ballMotorObservation;
const observation = observeBallMotorState(input, actor),
  before = sha(input),
  calls = 10000;
const started = performance.now(),
  cpu = process.cpuUsage();
for (let i = 0; i < calls; i++)
  planBallOrientedMovement(actor, observation, input.time, actor.target);
const planCost = { calls, wallMs: performance.now() - started, cpu: process.cpuUsage(cpu) };
const observationStarted = performance.now(),
  observationCPU = process.cpuUsage();
for (let i = 0; i < 2000; i++) observeBallMotorState(input, actor);
const observationCost = {
  calls: 2000,
  wallMs: performance.now() - observationStarted,
  cpu: process.cpuUsage(observationCPU),
};
if (sha(input) !== before) throw Error('Estimator mutated input');
const rows = [];
for (const observed of [false, true, true, false]) {
  let s = JSON.parse(JSON.stringify(input));
  const d = new NaturalMatchFlowDiagnostics(),
    pass = new PassLifecycleDiagnostics();
  const began = performance.now(),
    usage = process.cpuUsage();
  withBoundedObserver(observed ? (t) => pass.trace(t) : undefined, () => {
    for (let tick = 0; tick < 4000; tick++) {
      const prior = s;
      s = step(s, 0.025);
      if (observed) {
        d.observe(prior, s);
        pass.observe(prior, s);
      }
    }
  });
  rows.push({
    observed,
    ticks: 4000,
    wallMs: performance.now() - began,
    cpu: process.cpuUsage(usage),
    finalHash: sha(s),
    rssBytes: process.memoryUsage().rss,
  });
}
if (new Set(rows.map((r) => r.finalHash)).size !== 1) throw Error('ABBA observer changed physics');
const microseconds = (r) => (r.cpu.user + r.cpu.system) / r.calls;
const result = {
  schema: 'mfl-pr192-cost-v1',
  input: path,
  inputHash: before,
  estimatorInputUnchanged: true,
  estimator: planCost,
  observation: observationCost,
  estimatorCPUMicrosecondsPerCall: microseconds(planCost),
  observationCPUMicrosecondsPerCall: microseconds(observationCost),
  observerABBA: rows,
  observerNeutral: true,
  limitation:
    'Local engineering cost probe, not a statistically calibrated CPU limit. No physical outcome is selected from a timing result; ABBA starts from the identical genuine captured state.',
};
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(result);
