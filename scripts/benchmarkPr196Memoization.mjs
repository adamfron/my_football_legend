import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { read, hash, receipt, sourceForReplay } from './pr196Evidence.mjs';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { withArrivalForecastCache } from '../src/core/matchSimulation/playerArrival.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
const output = 'docs/performance/pr196/memoization-v2.json',
  sourceArchive = sourceForReplay(output, process.argv.includes('--check')),
  captured = read('docs/performance/pr196/counterfactuals-v2.json.gz').rows,
  rows = [],
  timings = [];
const reference = read('docs/performance/pr196/memoization-v1.json');
for (const c of captured) {
  const original = read(c.capture.path).state,
    s = { ...original, experimentalCanonicalArrival: true },
    inputHash = hash(s);
  for (const policy of ['state-value-v1', 'phase-role-hybrid-v1']) {
    const state = { ...s, decisionPolicy: policy },
      values = [];
    for (const cached of [false, true]) {
      const start = performance.now(),
        cpu = process.cpuUsage();
      const ranked = withArrivalForecastCache(
        () => rankAvailableActionsForAI(state, c.capture.actorId),
        cached,
      );
      values.push(hash(ranked));
      timings.push({ cached, wallMs: performance.now() - start, cpu: process.cpuUsage(cpu) });
    }
    if (values[0] !== values[1])
      throw Error('Ranking memoization changed outputs ' + c.capture.path + ' ' + policy);
    rows.push({
      capture: c.capture.path,
      policy,
      inputHash: hash(state),
      rankingHash: values[0],
      exact: true,
    });
  }
  const bare = withArrivalForecastCache(() => step(globalThis.structuredClone(s), 0.025), false),
    cached = step(globalThis.structuredClone(s), 0.025);
  if (hash(bare) !== hash(cached) || hash(s) !== inputHash)
    throw Error('Physical state/mutation changed under memoization');
}
if (
  rows.length !== reference.rows.length ||
  rows.some((r, i) => r.rankingHash !== reference.rows[i].rankingHash)
)
  throw Error('Private rollout allocation changed recorded ranking outputs');
receipt(
  output,
  {
    schema: 'pr196-scoped-arrival-memoization-v2',
    referenceDigest: hash(reference),
    sourceArchive,
    rows,
    ticks: { cases: captured.length, exactStateEquality: true, inputNeutral: true },
    contract:
      'Per-pure-ranking transaction only, keyed by identical state and player identities plus exact target/intent; no cache crosses a physical tick or ranking. Forecast equations and outputs unchanged.',
  },
  process.argv.includes('--check'),
);
if (!process.argv.includes('--check'))
  receipt('docs/performance/pr196/memoization-profile-v2.json', {
    classification:
      'concurrent host; same inputs, exact-output guard; no serial full-match speed claim',
    timings,
  });
console.log(
  'Arrival memoization exact-output PASS',
  rows.length,
  'rankings',
  captured.length,
  'physical ticks',
);
