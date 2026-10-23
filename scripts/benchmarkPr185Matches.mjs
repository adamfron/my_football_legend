/* global structuredClone */
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { performance } from 'node:perf_hooks';

const args = new Map(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const root = resolve(args.get('source') ?? '.'),
  version = args.get('version') ?? 'candidate';
const policy = args.get('policy') ?? 'state-value-v1',
  observed = args.get('observed') !== 'false';
const full = args.has('full'),
  seconds = Number(args.get('seconds') ?? 120),
  rep = args.get('rep') ?? '0';
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { createFormationBenchmarkMatch } = await load(
  'src/core/matchSimulation/benchmarkFixtures.ts',
);
const { configureMatchPolicy } = await load('src/core/matchSimulation/roleExperiment.ts');
const { stepTacticalMatchAfterDecisionProbe, startSecondHalf } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const { tacticalMatchStateSchema } = await load('src/core/matchSimulation/matchState.ts');
const { assertMatchStatisticsInvariants } = await load(
  'src/core/matchSimulation/playerMatchStats.ts',
);
const { createMatchFlowTelemetry, observeMatchFlow, assertTelemetryInvariants } = await load(
  'src/core/matchSimulation/matchFlowTelemetry.ts',
);
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const files = readdirSync(resolve(root, 'src'), { recursive: true })
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort();
const sourceSha256 = sha(
  files
    .map((p) => `${p}\0${readFileSync(resolve(root, 'src', p), 'utf8').replaceAll('\r\n', '\n')}`)
    .join('\0'),
);
let state = configureMatchPolicy(
  createFormationBenchmarkMatch({
    anchor: '4-4-2',
    opponent: '4-3-3',
    attributes: 75,
    opponentAttributes: 55,
    seed: 'pr185-match-transfer-development-1',
  }).state,
  policy,
);
const input = structuredClone(state),
  inputSha256 = sha(input);
let telemetry = createMatchFlowTelemetry('pr185-transfer');
const out = 'docs/performance/pr185-matches';
mkdirSync(out, { recursive: true });
const id = `${version}-${policy}-${full ? 'full' : seconds}-${observed ? 'observed' : 'bare'}-${rep}`;
const start = performance.now(),
  cpu = process.cpuUsage();
let ticks = 0;
while (!['full_time', 'abandoned'].includes(state.status) && state.time < (full ? 7200 : seconds)) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const previous = state;
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  if (previous === state) throw Error(`Stalled at ${state.time}`);
  if (observed) telemetry = observeMatchFlow(telemetry, previous, state);
  ticks++;
  if (ticks % 24000 === 0) {
    appendFileSync(
      `${out}/${id}.progress.log`,
      `${ticks} ticks, ${state.time.toFixed(3)} s, ${JSON.stringify(state.score)}\n`,
    );
  }
}
if (full && state.status !== 'full_time')
  throw Error(`Full match failed: ${state.status} ${state.time}`);
tacticalMatchStateSchema.parse(state);
if (state.statistics) assertMatchStatisticsInvariants(state.statistics, state);
if (observed) assertTelemetryInvariants(telemetry);
const result = {
  sourceSha256,
  harnessSha256: sha(readFileSync(new URL(import.meta.url), 'utf8')),
  version,
  policy,
  observed,
  full,
  input,
  inputSha256,
  finalStateSha256: sha(state),
  ticks,
  status: state.status,
  canonicalSeconds: state.time,
  score: state.score,
  statistics: state.statistics,
  telemetry: observed ? telemetry : null,
  wallMilliseconds: performance.now() - start,
  cpuMicroseconds: process.cpuUsage(cpu),
  rssBytes: process.memoryUsage().rss,
};
writeFileSync(`${out}/${id}.json`, JSON.stringify(result) + '\n');
console.log(
  JSON.stringify({
    id,
    status: result.status,
    ticks,
    seconds: state.time,
    score: state.score,
    sha: result.finalStateSha256,
    wallMs: result.wallMilliseconds,
  }),
);
