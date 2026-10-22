import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const root = resolve(args.get('root') ?? '.'),
  load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { configureMatchPolicy } = await load('src/core/matchSimulation/roleExperiment.ts');
const { stepTacticalMatchAfterDecisionProbe, startSecondHalf } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const { assertMatchStatisticsInvariants } = await load(
  'src/core/matchSimulation/playerMatchStats.ts',
);
const { pr172SourceHash } = await load('scripts/pr172Evidence.ts');
const sha = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const input = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr181-evidence/development.json.gz')),
).find((f) => f.design.id === (args.get('id') ?? 'pr181-dev-sw-2'));
const policy = args.get('policy') ?? 'role-value-v1';
const sourceHash = pr172SourceHash(root);
let state = configureMatchPolicy(globalThis.structuredClone(input.state), policy),
  ticks = 0,
  maxRss = process.memoryUsage().rss;
const duration = Number(args.get('seconds') ?? 7200);
const cpu = process.cpuUsage(),
  start = performance.now();
while (!['full_time', 'abandoned'].includes(state.status) && state.time < duration) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  ticks++;
  if (ticks % 8000 === 0) maxRss = Math.max(maxRss, process.memoryUsage().rss);
}
const usage = process.cpuUsage(cpu);
assertMatchStatisticsInvariants(state.statistics, state);
if (!args.has('seconds') && state.status !== 'full_time')
  throw Error(`Incomplete performance trial: ${state.status} at ${state.time}`);
if (pr172SourceHash(root) !== sourceHash) throw Error('Source changed during performance trial');
const result = {
  schema: 'mfl-pr181-performance-v1',
  label: args.get('label') ?? 'after',
  policy,
  sourceHash,
  design: input.design,
  inputHash: input.inputHash,
  sessionHash: input.sessionHash,
  status: state.status,
  ticks,
  time: state.time,
  finalHash: sha(state),
  cpuSeconds: (usage.user + usage.system) / 1e6,
  wallSeconds: (performance.now() - start) / 1000,
  maxSampledRssBytes: maxRss,
  statistics: state.statistics,
  score: state.score,
  deadBallSeconds: state.stoppageLedger?.completedSeconds ?? 0,
  completedStoppages: state.stoppageLedger?.completedCount ?? 0,
  timekeeping: state.timekeeping,
  runtime: process.version,
  observers: false,
  scope: args.has('seconds') ? 'bounded matched window' : 'complete match',
  serial: true,
  method:
    'Fresh process, fixed 0.025s canonical stepping, no observers/profiler. Run with other benchmark/test workers stopped. Different football histories mean before/after CPU is whole workload, not isolated marginal function cost.',
};
const out = args.get('out') ?? '../pr181-performance';
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/${result.label}-${policy}.json`, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    label: result.label,
    policy,
    status: result.status,
    cpu: result.cpuSeconds,
    wall: result.wallSeconds,
    rss: maxRss,
    finalHash: result.finalHash,
  }),
);
