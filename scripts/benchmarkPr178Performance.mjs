import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { Pr175Observer } from './pr175Observer.ts';
import { pr172Hash as sha, pr172SourceHash } from './pr172Evidence.ts';

const old = JSON.parse(
  gunzipSync(readFileSync('docs/performance/PR176-pr177-initial-states.json.gz')),
);
const fresh = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr178-evidence/initial-states.json.gz')),
);
const fixtures = [
  old.find((f) => f.design.id === 'pr177-dev-strength'),
  fresh.find((f) => f.design.id === 'pr178-dev-keepers'),
];
const sourceHash = pr172SourceHash(),
  rows = [],
  expected = new Map();
if (!process.execArgv.some((arg) => arg.includes('registerPr172DecisionObserver')))
  throw new Error('Use the PR172 observer loader for complete observer overhead measurement');
const trial = (fixture, policy, observed = false, seconds = 7200, label = 'full-match') => {
  let state = globalThis.structuredClone(fixture.state),
    ticks = 0,
    peakRss = 0,
    peakHeap = 0;
  state.decisionPolicy = policy;
  const observer = observed ? new Pr175Observer() : null,
    profiler = new PerformanceProfiler({ enabled: true });
  const hooks = ['decision', 'incoming', 'components'].map((n) => Symbol.for(`mfl.pr172.${n}`));
  globalThis[hooks[0]] = observed
    ? (s, a, r) => observer.decision(s, a, r, r[0]?.action)
    : undefined;
  globalThis[hooks[1]] = observed
    ? (s, a, r, selected) => observer.decision(s, a, r, selected, true)
    : undefined;
  globalThis[hooks[2]] = observed ? observer.component : undefined;
  globalThis.gc?.();
  const checkpoints = [],
    started = performance.now(),
    cpu = process.cpuUsage();
  while (state.status !== 'full_time' && state.status !== 'abandoned' && state.time < seconds) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const before = state;
    profiler.beginTick(ticks);
    state = withPerformanceProfiler(profiler, () =>
      stepTacticalMatchAfterDecisionProbe(state, 0.025),
    );
    ticks++;
    observer?.observe(before, state);
    if (ticks % 400 === 0) {
      const memory = process.memoryUsage();
      peakRss = Math.max(peakRss, memory.rss);
      peakHeap = Math.max(peakHeap, memory.heapUsed);
    }
    if (ticks % 40000 === 0) {
      const used = process.cpuUsage(cpu);
      checkpoints.push({
        at: state.time,
        cpuMs: (used.user + used.system) / 1000,
        wallMs: performance.now() - started,
      });
      console.log(
        `${label} ${fixture.design.id} ${policy} observed=${observed} t=${state.time.toFixed(0)}`,
      );
    }
  }
  const used = process.cpuUsage(cpu),
    wallMs = performance.now() - started,
    finalHash = sha(state);
  for (const hook of hooks) globalThis[hook] = undefined;
  const observation = observer?.snapshot(state);
  if (observed && !observation.choices.length) throw new Error('Ranker observer was not active');
  if (seconds === 7200 && state.status !== 'full_time') throw new Error('Censored performance run');
  const key = `${fixture.design.id}:${policy}:${seconds}`;
  if (expected.has(key) && expected.get(key) !== finalHash)
    throw new Error('Profiler/observer/repetition changed canonical final state');
  expected.set(key, finalHash);
  if (seconds === 7200) {
    const root = fixture.design.id.startsWith('pr177-')
      ? '../pr178-final-historical'
      : '../pr178-development';
    const reference = JSON.parse(
      readFileSync(`${root}-${policy}/${fixture.design.id}.json`, 'utf8'),
    );
    if (reference.finalHash !== finalHash)
      throw new Error('Plain stepping differs from complete ranker-observed reference');
  }
  return {
    label,
    policy,
    observed,
    design: fixture.design.id,
    inputHash: fixture.inputHash,
    sourceHash,
    dt: 0.025,
    ticks,
    status: state.status,
    time: state.time,
    finalHash,
    cpuMs: (used.user + used.system) / 1000,
    wallMs,
    sampledPeakRss: peakRss,
    sampledPeakHeap: peakHeap,
    processMaxRssKiB: process.resourceUsage().maxRSS || null,
    checkpoints,
    profile: profiler.snapshot(),
    observerCounts: observation?.counts ?? null,
    observedChoices: observation?.choices.length ?? 0,
  };
};
// Run only after other cohort, career and test workers have stopped. A local HTTP
// server may remain idle. Warm both policies; report complete match trials separately.
for (const fixture of fixtures)
  for (const policy of ['legacy-pr176', 'state-value-v1'])
    trial(fixture, policy, false, 60, 'warmup');
for (const [index, fixture] of fixtures.entries())
  for (const policy of index
    ? ['state-value-v1', 'legacy-pr176']
    : ['legacy-pr176', 'state-value-v1'])
    rows.push(trial(fixture, policy));
rows.push(trial(fixtures[0], 'state-value-v1', true));
rows.push(trial(fixtures[1], 'legacy-pr176', true));
const stressInput = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr177-evidence/loose-contact-loop-input.json.gz')),
  ),
  stress = [];
for (const policy of ['legacy-pr176', 'state-value-v1'])
  for (let repeat = 0; repeat < 5; repeat++) {
    let state = globalThis.structuredClone(stressInput);
    delete state.decisionReadiness;
    state.decisionPolicy = policy;
    const cpu = process.cpuUsage(),
      started = performance.now();
    for (let i = 0; i < 200; i++) state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    const used = process.cpuUsage(cpu);
    stress.push({
      policy,
      repeat,
      finalHash: sha(state),
      cpuMs: (used.user + used.system) / 1000,
      wallMs: performance.now() - started,
    });
  }
if (pr172SourceHash() !== sourceHash) throw new Error('Performance source changed');
const ratios = fixtures.map((f) => {
  const legacy = rows.find(
      (r) => r.design === f.design.id && r.policy === 'legacy-pr176' && !r.observed,
    ),
    b = rows.find((r) => r.design === f.design.id && r.policy === 'state-value-v1' && !r.observed);
  return {
    design: f.design.id,
    bVsLegacyCpu: b.cpuMs / legacy.cpuMs,
    bVsLegacyWall: b.wallMs / legacy.wallMs,
  };
});
writeFileSync(
  'docs/performance/PR178-performance.json',
  JSON.stringify(
    {
      sourceHash,
      node: process.version,
      method:
        'Serial warm alternating complete canonical matches on identical inputs/hardware. Sparse inclusive profiler spans every 37 ticks in every trial. The installed loader has disabled hooks in plain trials; observed trials enable the full ranker, incoming, components and event observer. Every plain final state also matches the separately measured full ranker-observed reference. No concurrent research/test jobs. Sampled memory every ten physical seconds; OS process high water is not a per-trial peak. Two heterogeneous designs do not establish a league-wide performance ceiling.',
      rows,
      ratios,
      stress,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ fullTrials: rows.length, ratios }));
