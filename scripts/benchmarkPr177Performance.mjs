import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { Pr175Observer } from './pr175Observer.ts';
import { pr172SourceHash } from './pr172Evidence.ts';

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fixtures = JSON.parse(gunzipSync(readFileSync('docs/performance/PR176-pr177-initial-states.json.gz'))).filter((f) => f.design.split === 'development');
const engines = [];
for (const [label, root, policy] of [
  ['pristine-pr176', '../baseline-pr176', null], ['in-tree-legacy', '.', 'legacy-pr176'],
  ['A', '.', 'risk-ablation-v1'], ['B', '.', 'state-value-v1'],
]) engines.push({ label, policy, sourceHash: pr172SourceHash(resolve(root)),
  simulation: await import(pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href),
  profiling: await import(pathToFileURL(resolve(root, 'src/core/matchSimulation/performanceProfiling.ts')).href),
});
const rows = [], hashes = new Map();
const trial = (engine, fixture, sample, observed = false) => {
  let state = globalThis.structuredClone(fixture.state);
  if (engine.policy) state.decisionPolicy = engine.policy;
  const profiler = new engine.profiling.PerformanceProfiler({ enabled: true });
  const observer = observed ? new Pr175Observer() : null;
  globalThis.gc?.();
  const memoryBefore = process.memoryUsage();
  const cpu = process.cpuUsage(), started = performance.now();
  for (let i = 0; i < 2400; i++) {
    const before = state;
    profiler.beginTick(i);
    state = engine.profiling.withPerformanceProfiler(profiler, () => engine.simulation.stepTacticalMatchAfterDecisionProbe(state, 0.025));
    observer?.observe(before, state);
  }
  const usage = process.cpuUsage(cpu), wallMs = performance.now() - started;
  const finalHash = sha(state), key = `${engine.label}:${fixture.design.id}`;
  if (hashes.has(key) && hashes.get(key) !== finalHash) throw new Error('Serial repetition/observer changes full canonical state');
  hashes.set(key, finalHash);
  const data = observer?.snapshot(state);
  return { engine: engine.label, policy: engine.policy, design: fixture.design.id, sample, observed,
    sourceHash: engine.sourceHash, inputHash: fixture.inputHash, finalHash, ticks: 2400, footballSeconds: state.time - fixture.state.time,
    cpuMs: (usage.user + usage.system) / 1000, wallMs, memoryBefore, memoryAfter: process.memoryUsage(),
    observerRows: data ? { passes: data.passes.length, shots: data.shots.length } : null, profile: profiler.snapshot() };
};
// Run this only once other cohort/test jobs have completed. No parallel match timing is used here.
for (const engine of engines) trial(engine, fixtures[0], -1);
for (let sample = 0; sample < 5; sample++) for (const fixture of fixtures)
  for (const engine of sample % 2 ? [...engines].reverse() : engines) rows.push(trial(engine, fixture, sample));
for (const engine of engines) rows.push(trial(engine, fixtures[0], 5, true));
const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const ratios = fixtures.map((fixture) => {
  const times = Object.fromEntries(engines.map((e) => [e.label, median(rows.filter((r) => r.design === fixture.design.id && r.engine === e.label && !r.observed).map((r) => r.cpuMs))]));
  return { design: fixture.design.id, medianCpuMs: times, bVsPristine: times.B / times['pristine-pr176'], bVsInTreeLegacy: times.B / times['in-tree-legacy'], aVsPristine: times.A / times['pristine-pr176'] };
});
const receipt = { version: 1, method: 'Warm alternating serial 5 x 60 football seconds per design/policy. Fixed 25ms physics; inclusive sampled spans; complete state equality across repetitions and observer. Full-match times are separately reported and were collected with concurrent research jobs.',
  rows, ratios, medianBvsPristine: median(ratios.map((r) => r.bVsPristine)), worstBvsPristine: Math.max(...ratios.map((r) => r.bVsPristine)) };
writeFileSync('docs/performance/PR177-performance.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ trials: rows.length, medianBvsPristine: receipt.medianBvsPristine, worstBvsPristine: receipt.worstBvsPristine }));
