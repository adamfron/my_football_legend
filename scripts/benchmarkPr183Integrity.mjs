import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';
import {
  configureMatchPolicy,
  RoleExperimentRecorder,
} from '../src/core/matchSimulation/roleExperiment.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { RealismEvidence } from './pr183Observation.ts';
const fixtures = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr183-evidence/development.json.gz')),
);
const sourceHash = pr183SourceHash(),
  rows = [];
for (const policy of [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
]) {
  const variants = [];
  for (const observed of [true, false, false]) {
    let state = configureMatchPolicy(globalThis.structuredClone(fixtures[0].state), policy),
      ticks = 0;
    const recorder = new RoleExperimentRecorder(state),
      realism = new RealismEvidence();
    let flow = createMatchFlowTelemetry('pr183-integrity');
    while (state.time < 120) {
      const previous = state;
      state = withRankingObserver(
        observed ? (s, id, r) => recorder.ranking(s, id, r) : undefined,
        () => stepTacticalMatchAfterDecisionProbe(state, 0.025),
      );
      if (observed) {
        recorder.observe(previous, state);
        realism.observe(previous, state);
        flow = observeMatchFlow(flow, previous, state);
      }
      ticks++;
    }
    tacticalMatchStateSchema.parse(state);
    assertMatchStatisticsInvariants(state.statistics, state);
    variants.push({ observed, ticks, hash: digest(state), time: state.time });
  }
  if (new Set(variants.map((v) => v.hash)).size !== 1)
    throw Error(`Observer/repeat divergence: ${policy}`);
  rows.push({ policy, variants });
  console.log(`${policy}: complete-state equality across observed and two unobserved windows`);
}
const f = fixtures[0],
  policy = 'state-value-v1';
const reference = JSON.parse(
  gunzipSync(readFileSync(`../pr183-development/${f.design.id}-${policy}.json.gz`)),
);
let state = configureMatchPolicy(globalThis.structuredClone(f.state), policy),
  ticks = 0,
  maxRss = 0;
const cpu = process.cpuUsage(),
  started = performance.now();
while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < 7200) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  ticks++;
  if (ticks % 400 === 0) maxRss = Math.max(maxRss, process.memoryUsage().rss);
}
tacticalMatchStateSchema.parse(state);
assertMatchStatisticsInvariants(state.statistics, state);
const finalHash = digest(state),
  usage = process.cpuUsage(cpu);
if (finalHash !== reference.finalHash || ticks !== reference.ticks)
  throw Error('Full B observer-on/off state or tick divergence');
if (pr183SourceHash() !== sourceHash) throw Error('Production changed');
writeFileSync(
  'docs/performance/PR183-integrity.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-integrity-v1',
      sourceHash,
      rows,
      fullMatch: {
        fixture: f.design.id,
        policy,
        referenceHash: reference.finalHash,
        finalHash,
        ticks,
        status: state.status,
        time: state.time,
        observerEqual: true,
        cpuSeconds: (usage.user + usage.system) / 1e6,
        wallSeconds: (performance.now() - started) / 1000,
        maxRssBytes: maxRss,
        context:
          'Unobserved repeat of a complete development match. Other cohort processes may run concurrently; this is a correctness check, not an isolated performance comparison.',
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(`Full B: ${ticks} equal ticks and identical complete state`);
