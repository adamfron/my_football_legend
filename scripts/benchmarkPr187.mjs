/* global structuredClone */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createFormationBenchmarkMatch } from '../src/core/matchSimulation/benchmarkFixtures.ts';
import { configureMatchPolicy } from '../src/core/matchSimulation/roleExperiment.ts';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { boundedExperimentSchema } from '../src/core/matchSimulation/boundedIntelligenceState.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';

const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const designs = {
  'dev-ss': {
    anchor: '3-4-2-1',
    opponent: '4-4-2',
    attributes: 76,
    opponentAttributes: 72,
    style: 'possession',
    seed: 'pr187-development-ss-01',
  },
  'dev-sw': {
    anchor: '4-3-3',
    opponent: '3-5-2',
    attributes: 78,
    opponentAttributes: 48,
    style: 'counter_attacking',
    seed: 'pr187-development-sw-01',
  },
  'dev-ww': {
    anchor: '4-2-3-1',
    opponent: '4-3-3',
    attributes: 39,
    opponentAttributes: 44,
    style: 'pressing',
    seed: 'pr187-development-ww-01',
  },
};
const design = args.get('design') ?? 'dev-sw',
  policy = args.get('policy') ?? 'opportunity-driven-v1';
if (!designs[design]) throw Error('Unknown development design');
const full = args.has('full'),
  seconds = full ? 7200 : Number(args.get('seconds') ?? 120),
  observed = args.get('observed') !== 'false';
if (!Number.isFinite(seconds) || seconds <= 0) throw Error('Invalid duration');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const files = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort();
const sourceManifest = files.map((p) => ({
  path: `src/${p}`,
  sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
}));
const sourceSha256 = sha(sourceManifest),
  evaluatorSha256 = sha(
    readFileSync('scripts/benchmarkPr187.mjs', 'utf8').replaceAll('\r\n', '\n'),
  );
let state = configureMatchPolicy(createFormationBenchmarkMatch(designs[design]).state, policy);
state.boundedExperiment = boundedExperimentSchema.parse({
  knowledge: { system: 0.65, role: 0.6, partner: 0.55 },
});
// Deliberate development diversity, fixed before any policy outcome is opened.
for (const [i, p] of state.players.entries()) {
  p.profile = structuredClone(p.profile);
  p.profile.heightCm = 168 + (i % 5) * 6;
  p.profile.weightKg = 64 + (i % 4) * 7;
  p.profile.weakFootProficiency = 40 + (i % 4) * 18;
  if (i % 4 === 0 && p.fitness) {
    p.fitness.longTermCapacity = 0.85;
    p.fitness.burstReadiness = 0.8;
  }
}
const input = structuredClone(state),
  inputSha256 = sha(input);
let telemetry = createMatchFlowTelemetry(`pr187-${design}`);
const counts = {
  decisions: 0,
  candidates: 0,
  evaluations: 0,
  forecasts: 0,
  waits: 0,
  continuations: 0,
  cancellations: 0,
  patternObservations: 0,
  patternArrivals: 0,
  patternCancellations: 0,
  attempts: 0,
  releases: 0,
  shotAttempts: 0,
  shotReleases: 0,
  passAttempts: 0,
  passReleases: 0,
  backwardPasses: 0,
  progressivePasses: 0,
  reciprocalPasses: 0,
};
const reasons = {},
  samples = [],
  passes = [],
  shots = [];
let lastPass = null,
  lastShot = null,
  ticks = 0,
  failure = null,
  failureStack = null;
const trace = (t) => {
  if (t.stage === 'decision') {
    counts.decisions++;
    counts.candidates += t.decision.measured.generated;
    counts.evaluations += t.decision.measured.evaluations;
    counts.forecasts += t.decision.measured.forecasts;
    if (!t.decision.selectedCandidateId) counts.waits++;
    if (t.decision.continuation === 'continue') counts.continuations++;
    if (t.decision.continuation === 'cancel') counts.cancellations++;
  }
  if (t.stage === 'pattern') {
    if (t.reason.startsWith('observed:')) counts.patternObservations++;
    else if (t.reason.startsWith('cancel:')) counts.patternCancellations++;
    else counts.patternArrivals++;
  }
  if (t.stage === 'attempt') {
    counts.attempts++;
    if (t.released) counts.releases++;
    if (t.action.type === 'shot') {
      counts.shotAttempts++;
      if (t.released) counts.shotReleases++;
    }
    if (t.action.type === 'pass') {
      counts.passAttempts++;
      if (t.released) counts.passReleases++;
    }
  }
  reasons[t.reason] = (reasons[t.reason] ?? 0) + 1;
  if (
    samples.length < 24 ||
    (samples.length < 64 && t.stage === 'attempt' && t.action.type === 'shot')
  )
    samples.push(t);
};
const started = performance.now(),
  cpu = process.cpuUsage();
try {
  withBoundedObserver(observed ? trace : undefined, () => {
    while (!['full_time', 'abandoned'].includes(state.status) && state.time < seconds) {
      if (state.status === 'half_time') state = startSecondHalf(state);
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      if (previous === state) throw Error(`Stalled at ${state.time}`);
      if (observed) {
        telemetry = observeMatchFlow(telemetry, previous, state);
        const p = state.lastPassDiagnostic;
        if (p && p.passId !== lastPass?.passId) {
          const actor = previous.players.find((a) => a.id === p.passerId),
            progress =
              (p.intendedTarget.x - previous.ball.x) * (actor && attacksRight(actor) ? 1 : -1);
          if (progress < -2) counts.backwardPasses++;
          if (progress > 12) counts.progressivePasses++;
          if (
            lastPass &&
            lastPass.passerId === p.intendedReceiverId &&
            lastPass.intendedReceiverId === p.passerId &&
            p.releasedAt - lastPass.releasedAt < 8
          )
            counts.reciprocalPasses++;
          passes.push({
            id: p.passId,
            at: p.releasedAt,
            passer: p.passerId,
            receiver: p.intendedReceiverId,
            progress,
          });
          lastPass = p;
        }
        const shot = state.ball.shot ?? state.lastShot;
        if (shot && shot.shotId !== lastShot) {
          shots.push(shot);
          lastShot = shot.shotId;
        }
      }
      ticks++;
      if (ticks % 48000 === 0) console.log(`${design}/${policy}: ${state.time.toFixed(2)}s`);
    }
  });
  tacticalMatchStateSchema.parse(state);
  if (state.statistics) assertMatchStatisticsInvariants(state.statistics, state);
  if (observed) assertTelemetryInvariants(telemetry);
  if (full && state.status !== 'full_time') throw Error(`Did not finish: ${state.status}`);
} catch (error) {
  failure = String(error);
  failureStack = error.stack ?? null;
}
const result = {
  schemaVersion: 1,
  cohort: 'development_only',
  design,
  fixture: designs[design],
  policy,
  informationComparison:
    'historical shared defensive/GK/restart controllers; bounded on-ball candidates only; NOT an equal-information full-match comparison',
  sourceSha256,
  evaluatorSha256,
  inputSha256,
  input,
  full,
  observed,
  ticks,
  status: state.status,
  canonicalSeconds: state.time,
  score: state.score,
  finalStateSha256: sha(state),
  finalState: state,
  failure,
  failureStack,
  counts,
  reasons,
  samples,
  passes,
  shots,
  telemetry: observed ? telemetry : null,
  finalRuntime: state.boundedRuntime ?? null,
  wallMilliseconds: performance.now() - started,
  cpuMicroseconds: process.cpuUsage(cpu),
  rssBytes: process.memoryUsage().rss,
};
const id = `${design}-${policy}-${full ? 'full' : seconds}-${observed ? 'observed' : 'bare'}-${args.get('rep') ?? '0'}`;
mkdirSync('docs/performance/pr187-traces', { recursive: true });
const archive = `docs/performance/pr187-traces/${id}.json.gz`,
  bytes = gzipSync(JSON.stringify(result), { level: 9 });
writeFileSync(archive, bytes);
const {
  input: _i,
  samples: _s,
  passes: _p,
  shots: _shots,
  telemetry: _t,
  finalRuntime: _r,
  finalState: _f,
  ...receipt
} = result;
void _i;
void _s;
void _p;
void _shots;
void _t;
void _r;
void _f;
writeFileSync(
  `docs/performance/PR187-match-${id}.json`,
  JSON.stringify(
    { ...receipt, archive, archiveSha256: sha(bytes), payloadSha256: sha(JSON.stringify(result)) },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  `docs/performance/PR187-source-${sourceSha256.slice(0, 12)}.json`,
  JSON.stringify({ schemaVersion: 1, sourceSha256, files: sourceManifest }, null, 2) + '\n',
);
console.log({
  id,
  status: state.status,
  at: state.time,
  score: state.score,
  counts,
  failure,
  wall: result.wallMilliseconds,
});
if (failure) process.exitCode = 1;
