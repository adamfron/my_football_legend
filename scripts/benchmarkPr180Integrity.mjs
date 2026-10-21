import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import process from 'node:process';
import {
  configureMatchPolicy,
  RoleExperimentRecorder,
} from '../src/core/matchSimulation/roleExperiment.ts';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const hash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const fixture = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr180-evidence/development.json.gz')),
)[0];
const run = (policy, seconds, observe) => {
  let state = configureMatchPolicy(globalThis.structuredClone(fixture.state), policy),
    flow = createMatchFlowTelemetry();
  const recorder = new RoleExperimentRecorder(state),
    cpu = process.cpuUsage(),
    started = performance.now();
  let ticks = 0;
  while (!['full_time', 'abandoned'].includes(state.status) && state.time < seconds) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const prev = state;
    state = withRankingObserver(observe ? recorder.ranking : undefined, () =>
      stepTacticalMatchAfterDecisionProbe(state, 0.025),
    );
    if (observe) {
      recorder.observe(prev, state);
      flow = observeMatchFlow(flow, prev, state);
    }
    ticks++;
  }
  const usage = process.cpuUsage(cpu);
  return {
    policy,
    seconds,
    observe,
    ticks,
    status: state.status,
    finalHash: hash(state),
    cpuSeconds: (usage.user + usage.system) / 1e6,
    wallSeconds: (performance.now() - started) / 1000,
  };
};
const rows = [];
for (const p of [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
]) {
  const a = run(p, 120, true),
    b = run(p, 120, true),
    off = run(p, 120, false);
  if (a.finalHash !== b.finalHash || a.finalHash !== off.finalHash)
    throw Error('within-policy determinism / observer mismatch');
  rows.push({ a, b, off, equal: true });
}
const full = run('phase-role-hybrid-v1', 7200, false),
  observed = JSON.parse(
    gunzipSync(
      readFileSync('docs/performance/pr180-evidence/pr180-dev-ss-1-phase-role-hybrid-v1.json.gz'),
    ),
  );
if (full.finalHash !== observed.finalHash || full.ticks !== observed.ticks)
  throw Error('full-match observer mismatch');
writeFileSync(
  'docs/performance/PR180-integrity.json',
  JSON.stringify(
    {
      sourceHash: pr172SourceHash(),
      scope:
        'all five repeated complete 120-second states and observer equality; one complete full-match R3 observer replay.',
      concurrentWithCohort: process.argv.includes('--concurrent'),
      rows,
      full: {
        ...full,
        observedHash: observed.finalHash,
        observedTicks: observed.ticks,
        equal: true,
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ windows: rows.length, fullStatus: full.status, equal: true }));
