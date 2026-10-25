import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { PassLifecycleDiagnostics } from '../src/core/matchSimulation/passLifecycleDiagnostics.ts';
import { measureEffectivePlayingTime } from '../src/core/matchSimulation/effectivePlayingTime.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'opportunity-driven-v1',
  version = args.get('version') ?? 'baseline',
  engineRoot = args.get('engine-root') ?? '.',
  limit = Number(args.get('seconds') ?? 7200);
const root = 'docs/performance/pr190';
mkdirSync(root, { recursive: true });
const output = `${root}/${design}-${policy}-${version}.json`;
if (existsSync(output)) throw Error(`Preserve ${output}`);
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const source = readdirSync(`${engineRoot}/src`, { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`${engineRoot}/src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const sourceSha256 = sha(source);
if (!existsSync(`${root}/source-${sourceSha256}.json`))
  writeFileSync(`${root}/source-${sourceSha256}.json`, JSON.stringify(source, null, 2) + '\n');
const runnerSha256 = sha(readFileSync('scripts/benchmarkPr190.mjs'));
const diagnosticSha256 = sha(
  readFileSync('src/core/matchSimulation/passLifecycleDiagnostics.ts', 'utf8').replaceAll(
    '\r\n',
    '\n',
  ),
);
const { stepTacticalMatchAfterDecisionProbe: step, startSecondHalf } = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/matchSimulation.ts'))
);
const { withBoundedObserver } = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/boundedIntelligence.ts'))
);
const receipt = JSON.parse(
  readFileSync(`docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`),
);
const input = JSON.parse(gunzipSync(readFileSync(receipt.archive))).input;
if (sha(input) !== receipt.inputSha256) throw Error('Frozen input changed');
let state = input,
  ticks = 0,
  failure = null;
const observer = new PassLifecycleDiagnostics(),
  started = performance.now(),
  cpu = process.cpuUsage();
const periods = [];
let flow = createMatchFlowTelemetry(`${version}:${design}:${policy}`);
try {
  withBoundedObserver(
    (t) => observer.trace(t),
    () => {
      while (!['full_time', 'abandoned'].includes(state.status) && state.time < limit) {
        if (state.status === 'half_time') {
          periods.push(state.timekeeping);
          state = startSecondHalf(state);
        }
        const previous = state;
        state = step(state, 0.025);
        if (state === previous) throw Error(`Stalled at ${state.time}`);
        observer.observe(previous, state);
        flow = observeMatchFlow(flow, previous, state);
        if (++ticks % 64000 === 0)
          console.log(`${version} ${design}/${policy} ${state.time.toFixed(1)}s`);
      }
    },
  );
} catch (e) {
  failure = String(e);
}
const records = observer.snapshot(),
  counts = Object.fromEntries(
    [...new Set(records.map((r) => r.failureCause))].map((cause) => [
      cause,
      records.filter((r) => r.failureCause === cause).length,
    ]),
  );
const strata = new Map();
for (const r of records) {
  const length = Math.hypot(
    r.diagnostic.predictedReceptionPoint.x - r.release.ball.x,
    r.diagnostic.predictedReceptionPoint.y - r.release.ball.y,
  );
  const key = [
    length <= 15 ? 'short' : length <= 30 ? 'medium' : 'long',
    (r.diagnostic.selectionQuality?.pressure ?? 0) > 0.4 ? 'pressure' : 'clear',
    Math.hypot(r.diagnostic.receiverVelocityAtRelease.x, r.diagnostic.receiverVelocityAtRelease.y) >
    0.7
      ? 'moving'
      : 'static',
    r.failureCause,
  ].join(':');
  (strata.get(key) ?? (strata.set(key, []), strata.get(key))).push(r);
}
const rank = (a, b) =>
  sha(`pr190-stratified-v1:${a.diagnostic.passId}`).localeCompare(
    sha(`pr190-stratified-v1:${b.diagnostic.passId}`),
  );
const selected = [...strata].flatMap(([stratum, rows]) =>
  rows
    .sort(rank)
    .slice(0, 2)
    .map((r) => ({ stratum, passId: r.diagnostic.passId })),
);
const random = [...records]
  .sort((a, b) =>
    sha(`pr190-independent-sample-v1:${a.diagnostic.passId}`).localeCompare(
      sha(`pr190-independent-sample-v1:${b.diagnostic.passId}`),
    ),
  )
  .slice(0, 24)
  .map((r) => r.diagnostic.passId);
const archive = `${output}.gz`;
writeFileSync(archive, gzipSync(JSON.stringify(records)));
const players = state.statistics?.players ?? [];
assertTelemetryInvariants(flow);
const flowArchive = `${output}.flow.json.gz`;
writeFileSync(flowArchive, gzipSync(JSON.stringify(flow)));
const result = {
  schemaVersion: 1,
  classification: 'frozen development fixtures; independent cohort unopened',
  design,
  policy,
  version,
  sourceSha256,
  runnerSha256,
  diagnosticSha256,
  inputSha256: sha(input),
  ticks,
  status: state.status,
  seconds: state.time,
  score: state.score,
  passes: {
    attempted: players.reduce((n, p) => n + p.passesAttempted, 0),
    completed: players.reduce((n, p) => n + p.passesCompleted, 0),
  },
  shots: players.reduce((n, p) => n + p.shots, 0),
  flowArchive,
  flowArchiveSha256: sha(readFileSync(flowArchive)),
  statistics: {
    players,
    teamAccounting: state.statistics?.teamAccounting,
    passingNetwork: state.statistics?.passingNetwork,
  },
  football: {
    possessionExchanges: flow.possessionChanges,
    turnoverCauses: flow.turnoverCauses,
    possessionSpellDurations: flow.possessionSpellDurations,
    firstTouch: flow.receptions,
    finalThirdEntries: flow.finalThirdEntries,
    boxEntries: flow.boxEntries,
    carries: flow.carries,
  },
  time: measureEffectivePlayingTime(state, 0),
  periods: [...periods, state.timekeeping],
  counts,
  recoveredAfterPoorTouch: records.filter((r) => r.sameTeamRecovery).length,
  archive,
  archiveSha256: sha(readFileSync(archive)),
  sampling: {
    method:
      'two lowest seeded hashes per distance/pressure/motion/cause stratum, plus independent seeded random sample',
    selected,
    random,
  },
  cpu: process.cpuUsage(cpu),
  wallMs: performance.now() - started,
  rssBytes: process.memoryUsage().rss,
  finalStateSha256: sha(state),
  failure,
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({ output, status: result.status, passes: result.passes, counts, failure }),
);
if (failure) process.exitCode = 1;
