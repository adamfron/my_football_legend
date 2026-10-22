import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { digest, pr182SourceHash } from './pr182Evidence.mjs';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
if (args.has('trial')) {
  const root = resolve(args.get('source') ?? '.'),
    load = (p) => import(pathToFileURL(resolve(root, p)).href);
  const sim = await load('src/core/matchSimulation/matchSimulation.ts');
  const { assertMatchStatisticsInvariants } = await load(
    'src/core/matchSimulation/playerMatchStats.ts',
  );
  const { withRankingObserver } = await load('src/core/matchSimulation/decisionObservation.ts');
  const { RoleExperimentRecorder } = await load('src/core/matchSimulation/roleExperiment.ts');
  const { createMatchFlowTelemetry, observeMatchFlow } = await load(
    'src/core/matchSimulation/matchFlowTelemetry.ts',
  );
  const input = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr182-evidence/development.json.gz')),
  ).find((f) => f.design.id === (args.get('id') ?? 'pr181-dev-sw-1'));
  const policy = args.get('policy') ?? 'role-intent-v1',
    seconds = Number(args.get('seconds') ?? 7200),
    observed = args.has('observed');
  let state = globalThis.structuredClone(input.state);
  state.decisionPolicy = policy;
  const recorder = new RoleExperimentRecorder(state);
  let flow = createMatchFlowTelemetry('pr182-perf');
  const sourceHash = pr182SourceHash(root),
    initialHash = digest(state),
    cpu = process.cpuUsage(),
    started = performance.now();
  let ticks = 0,
    maxRss = process.memoryUsage().rss;
  while (!['full_time', 'abandoned'].includes(state.status) && state.time < seconds) {
    if (state.status === 'half_time') state = sim.startSecondHalf(state);
    const prev = state;
    state = observed
      ? withRankingObserver(recorder.ranking, () =>
          sim.stepTacticalMatchAfterDecisionProbe(state, 0.025),
        )
      : sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (observed) {
      recorder.observe(prev, state);
      flow = observeMatchFlow(flow, prev, state);
    }
    ticks++;
    if (ticks % 4000 === 0) maxRss = Math.max(maxRss, process.memoryUsage().rss);
  }
  assertMatchStatisticsInvariants(state.statistics, state);
  if (!args.has('seconds') && state.status !== 'full_time')
    throw Error('Incomplete full performance match');
  if (pr182SourceHash(root) !== sourceHash) throw Error('Performance source changed');
  const usage = process.cpuUsage(cpu),
    result = {
      label: args.get('trial'),
      policy,
      design: input.design,
      sourceHash,
      initialHash,
      seconds: state.time,
      ticks,
      status: state.status,
      finalHash: digest(state),
      cpuSeconds: (usage.user + usage.system) / 1e6,
      wallSeconds: (performance.now() - started) / 1000,
      maxSampledRssBytes: maxRss,
      observers: observed,
      serial: true,
      score: state.score,
      statistics: state.statistics,
      method:
        'Fresh serial process; identical prepared initial state, explicit policy, 0.025s canonical steps. Before/after whole football workloads may diverge; not an isolated marginal function cost.',
    };
  mkdirSync('../pr182-performance', { recursive: true });
  writeFileSync(
    `../pr182-performance/${args.get('trial')}-${policy}-${args.get('seconds') ?? 'full'}-${observed ? 'on' : 'off'}.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      label: result.label,
      policy,
      seconds: state.time,
      cpu: result.cpuSeconds,
      wall: result.wallSeconds,
      rss: maxRss,
      observed,
      finalHash: result.finalHash,
    }),
  );
} else {
  const baseline = args.get('baseline');
  if (!baseline) throw Error('--baseline=<PR181 checkout> required');
  const trials = [];
  for (const policy of [
    'legacy-pr176',
    'state-value-v1',
    'role-value-v1',
    'role-intent-v1',
    'phase-role-hybrid-v1',
  ])
    for (const [label, source] of [
      ['before', baseline],
      ['after', '.'],
    ])
      for (const repetition of [1, 2])
        trials.push({ label: `${label}-window-${repetition}`, source, policy, seconds: 120 });
  for (const policy of ['role-value-v1', 'role-intent-v1', 'phase-role-hybrid-v1'])
    for (const [label, source] of [
      ['before', baseline],
      ['after', '.'],
    ])
      trials.push({ label: `${label}-full`, source, policy });
  for (const observed of [false, true])
    trials.push({
      label: 'after-observer',
      source: '.',
      policy: 'role-intent-v1',
      seconds: 120,
      observed,
    });
  for (const t of trials) {
    const run = spawnSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/benchmarkPr182Performance.mjs',
        `--trial=${t.label}`,
        `--source=${t.source}`,
        `--policy=${t.policy}`,
        ...(t.seconds ? [`--seconds=${t.seconds}`] : []),
        ...(t.observed ? ['--observed'] : []),
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 900000 },
    );
    if (run.status !== 0)
      throw Error(run.stderr || run.error || `Performance child exit ${run.status}`);
    process.stdout.write(run.stdout);
  }
}
