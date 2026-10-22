import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import {
  configureMatchPolicy,
  RoleExperimentRecorder,
} from '../src/core/matchSimulation/roleExperiment.ts';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { SpatialEvidence } from './pr181Observation.ts';
import { PolicyLineageEvidence } from './pr182Observation.ts';
import { pr182SourceHash, pr182CandidateHash, pr182HarnessHash, digest } from './pr182Evidence.mjs';
const frozen = existsSync('docs/performance/PR182-freeze.json')
  ? JSON.parse(readFileSync('docs/performance/PR182-freeze.json'))
  : undefined;
if (frozen && frozen.candidateHash !== pr182CandidateHash())
  throw Error('Behavioural candidate changed after freeze');
const development = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr182-evidence/development.json.gz')),
);
const run = (input, policy, seconds, observed) => {
  let state = configureMatchPolicy(globalThis.structuredClone(input.state), policy),
    ticks = 0;
  const recorder = new RoleExperimentRecorder(state),
    spatial = new SpatialEvidence(),
    lineage = new PolicyLineageEvidence(),
    profiler = new PerformanceProfiler({ enabled: true });
  let flow = createMatchFlowTelemetry('pr182-integrity');
  while (!['full_time', 'abandoned'].includes(state.status) && state.time < seconds) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const previous = state;
    if (observed) {
      profiler.beginTick(ticks);
      state = withRankingObserver(recorder.ranking, () =>
        withPerformanceProfiler(profiler, () => stepTacticalMatchAfterDecisionProbe(state, 0.025)),
      );
    } else state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (observed) {
      recorder.observe(previous, state);
      spatial.observe(previous, state);
      lineage.observe(previous, state);
      flow = observeMatchFlow(flow, previous, state);
    }
    ticks++;
  }
  assertMatchStatisticsInvariants(state.statistics, state);
  return {
    policy,
    observed,
    ticks,
    status: state.status,
    time: state.time,
    finalHash: digest(state),
  };
};
const windows = [];
for (const policy of PRIMARY_DECISION_POLICIES) {
  const a = run(development[0], policy, 120, true),
    repeat = run(development[0], policy, 120, true),
    off = run(development[0], policy, 120, false);
  if (a.finalHash !== repeat.finalHash || a.finalHash !== off.finalHash || a.ticks !== off.ticks)
    throw Error('Repeated/observer complete-state mismatch');
  windows.push({ a, repeat, off, equal: true });
  console.log(JSON.stringify({ policy, windowEqual: true }));
}
let full;
if (!process.argv.includes('--windows-only')) {
  if (!frozen) throw Error('Complete primary replay requires a freeze');
  const policy =
    process.argv.find((a) => a.startsWith('--policy='))?.slice(9) ?? 'phase-role-hybrid-v1';
  const inputs = JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr182-evidence/validation.json.gz')),
    ),
    input = inputs[0];
  const observed = JSON.parse(
    gunzipSync(
      readFileSync(
        `../pr182-validation/${input.design.id}/${policy}/${input.design.id}-${policy}.json.gz`,
      ),
    ),
  );
  const replay = run(input, policy, 7200, false);
  if (
    replay.finalHash !== observed.finalHash ||
    replay.ticks !== observed.ticks ||
    replay.status !== 'full_time'
  )
    throw Error('Complete primary observer replay mismatch');
  full = {
    ...replay,
    observedHash: observed.finalHash,
    observedTicks: observed.ticks,
    equal: true,
  };
}
writeFileSync(
  `docs/performance/PR182-integrity${full ? '' : '-windows'}.json`,
  JSON.stringify(
    {
      sourceHash: pr182SourceHash(),
      candidateHash: pr182CandidateHash(),
      harnessHash: pr182HarnessHash(),
      method:
        'All five policies repeat the same complete 120s canonical state with all primary observers/profiler and without them. One selected-policy complete primary fixture replay additionally requires identical state, ticks and full-time status. Repeated simulations add no independent fixture.',
      windows,
      full,
    },
    null,
    2,
  ) + '\n',
);
