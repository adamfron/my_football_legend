/* global structuredClone */
import { createHash } from 'node:crypto';
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
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import { auditDecisionSnapshot } from '../src/core/matchSimulation/tacticalCognitionLab.ts';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';

const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const policy = args.get('policy') ?? 'state-value-v1',
  full = args.has('full');
const observed = args.get('observed') !== 'false',
  seconds = Number(args.get('seconds') ?? 120);
const design = args.get('design') ?? 'pr185-sw',
  rep = args.get('rep') ?? '0';
if (!Number.isFinite(seconds) || seconds <= 0) throw Error('Invalid duration');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const sourceFiles = readdirSync('src', { recursive: true })
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .map((p) => p.replaceAll('\\', '/'))
  .sort();
const sourceSha256 = sha(
  sourceFiles
    .map((p) => `${p}\0${readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')}`)
    .join('\0'),
);
let state = configureMatchPolicy(
  createFormationBenchmarkMatch({
    anchor: design === 'pr185-sw' ? '4-4-2' : '4-2-3-1',
    opponent: design === 'pr185-sw' ? '4-3-3' : '3-5-2',
    attributes: design === 'pr185-sw' ? 75 : 60,
    opponentAttributes: design === 'pr185-sw' ? 55 : 60,
    seed: design === 'pr185-sw' ? 'pr185-match-transfer-development-1' : 'pr186-development-ss-1',
  }).state,
  policy,
);
const input = structuredClone(state),
  inputSha256 = sha(input);
let telemetry = createMatchFlowTelemetry('pr186-development');
const counts = {
  rankings: 0,
  atCandidateCap: 0,
  shotPresent: 0,
  shotSelected: 0,
  holdSelected: 0,
  shotPresentButOtherSelected: 0,
  reciprocalPasses: 0,
  backwardPasses: 0,
  longProgressivePasses: 0,
  highOpportunitySamples: 0,
  highOpportunityContactUnavailable: 0,
  controlSamples: 0,
};
const snapshots = [],
  passes = [],
  opportunityWindows = [];
let lastPassId = '',
  lastPass = null,
  nextProbeAt = 0,
  openWindow = null;
const observer = (s, actorId, ranked) => {
  counts.rankings++;
  if (ranked.length === 48) counts.atCandidateCap++;
  const shots = ranked.filter(
    (r) =>
      r.action.type === 'shot' || (r.action.type === 'header' && r.action.intent === 'header_shot'),
  );
  if (shots.length) counts.shotPresent++;
  if (shots.some((r) => r === ranked[0])) counts.shotSelected++;
  else if (shots.length) counts.shotPresentButOtherSelected++;
  if (ranked[0]?.action.type === 'hold') counts.holdSelected++;
  // First 8 plus 16 dispersed interesting states; deliberate development sampling.
  if (
    snapshots.length < 8 ||
    (snapshots.length < 24 &&
      shots.length &&
      ranked[0]?.action.type !== 'shot' &&
      s.time - (snapshots.at(-1)?.at ?? 0) > 120)
  )
    snapshots.push(auditDecisionSnapshot(s, actorId));
};
const out = 'docs/performance/pr186-traces';
mkdirSync(out, { recursive: true });
const id = `${design}-${policy}-${full ? 'full' : seconds}-${observed ? 'observed' : 'bare'}-${rep}`;
const started = performance.now(),
  cpu = process.cpuUsage();
let ticks = 0;
withRankingObserver(observed ? observer : undefined, () => {
  while (
    !['full_time', 'abandoned'].includes(state.status) &&
    state.time < (full ? 7200 : seconds)
  ) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const previous = state;
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (previous === state) throw Error(`Stalled at ${state.time}`);
    if (observed) {
      telemetry = observeMatchFlow(telemetry, previous, state);
      const pass = state.lastPassDiagnostic;
      if (pass && pass.passId !== lastPassId) {
        const actor = previous.players.find((p) => p.id === pass.passerId);
        const progress =
          (pass.intendedTarget.x - previous.ball.x) * (actor && attacksRight(actor) ? 1 : -1);
        if (progress < -2) counts.backwardPasses++;
        if (progress > 12) counts.longProgressivePasses++;
        if (
          lastPass &&
          lastPass.passerId === pass.intendedReceiverId &&
          lastPass.intendedReceiverId === pass.passerId &&
          pass.releasedAt - lastPass.releasedAt < 8
        )
          counts.reciprocalPasses++;
        passes.push({
          id: pass.passId,
          at: pass.releasedAt,
          passer: pass.passerId,
          receiver: pass.intendedReceiverId,
          progress,
          expectedRetention: pass.selectionQuality?.expectedRetainedPossession ?? null,
        });
        lastPassId = pass.passId;
        lastPass = pass;
      }
      if (openWindow && state.ball.shot?.shooterId === openWindow.actorId)
        openWindow.shotReleased = true;
      if (state.time >= nextProbeAt) {
        nextProbeAt = state.time + 0.5;
        const actor = state.players.find((p) => p.id === state.ball.ownerId);
        const expectation =
          actor && state.scenario === 'open_play' && !state.restart
            ? evaluateShootingOpportunity(state, actor).effectiveScoringExpectation
            : 0;
        if (actor) counts.controlSamples++;
        if (actor && expectation > 0.1) {
          counts.highOpportunitySamples++;
          const releaseReady = canReleaseControlledAction(state, actor);
          if (!releaseReady) counts.highOpportunityContactUnavailable++;
          if (!openWindow || openWindow.actorId !== actor.id) {
            if (openWindow)
              opportunityWindows.push({
                ...openWindow,
                endedAt: state.time,
                endReason: 'owner_changed',
              });
            openWindow = {
              actorId: actor.id,
              openedAt: state.time,
              maximumExpectation: expectation,
              shotReleased: false,
              contactUnavailableSamples: 0,
              auditAtOpen: auditDecisionSnapshot(state, actor.id),
              stateAtOpen: structuredClone(state),
            };
          }
          openWindow.maximumExpectation = Math.max(openWindow.maximumExpectation, expectation);
          if (!releaseReady) openWindow.contactUnavailableSamples++;
        } else if (openWindow) {
          opportunityWindows.push({
            ...openWindow,
            endedAt: state.time,
            endReason: 'opportunity_or_control_lost',
          });
          openWindow = null;
        }
      }
    }
    ticks++;
    if (ticks % 48000 === 0) console.log(`${id}: ${ticks} ticks, ${state.time.toFixed(2)} s`);
  }
});
if (openWindow)
  opportunityWindows.push({ ...openWindow, endedAt: state.time, endReason: 'end_of_run' });
if (full && state.status !== 'full_time') throw Error('Full match did not finish');
tacticalMatchStateSchema.parse(state);
if (state.statistics) assertMatchStatisticsInvariants(state.statistics, state);
if (observed) assertTelemetryInvariants(telemetry);
const result = {
  schemaVersion: 1,
  cohort: 'development_only',
  design,
  policy,
  observed,
  full,
  sourceSha256,
  inputSha256,
  input,
  finalStateSha256: sha(state),
  ticks,
  status: state.status,
  canonicalSeconds: state.time,
  score: state.score,
  statistics: state.statistics,
  counts,
  snapshots,
  passes,
  opportunityWindows,
  telemetry: observed ? telemetry : null,
  wallMilliseconds: performance.now() - started,
  cpuMicroseconds: process.cpuUsage(cpu),
  rssBytes: process.memoryUsage().rss,
};
const archive = `${out}/${id}.json.gz`,
  bytes = gzipSync(JSON.stringify(result), { level: 9 });
writeFileSync(archive, bytes);
const {
  input: _input,
  snapshots: _snapshots,
  telemetry: _telemetry,
  passes: _passes,
  opportunityWindows: _windows,
  statistics: _stats,
  ...summary
} = result;
void [_input, _snapshots, _telemetry, _passes, _windows, _stats];
writeFileSync(
  `docs/performance/PR186-match-${id}.json`,
  JSON.stringify(
    {
      ...summary,
      archive,
      archiveSha256: createHash('sha256').update(bytes).digest('hex'),
      opportunityWindows: opportunityWindows.length,
      unconvertedOpportunityWindows: opportunityWindows.filter((w) => !w.shotReleased).length,
      passes: telemetry.passes?.length ?? null,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    id,
    status: state.status,
    hash: result.finalStateSha256,
    milliseconds: result.wallMilliseconds,
    counts,
  }),
);
