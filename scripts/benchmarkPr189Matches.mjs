import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import {
  createPathologyDetector,
  capturePathologicalState,
} from '../src/core/matchSimulation/pathologicalReplay.ts';

const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'opportunity-driven-v1';
const version = args.get('version') ?? 'v1';
const root = 'docs/performance/pr189';
mkdirSync(root, { recursive: true });
const output = `${root}/${design}-${policy}-${version}.json`;
if (existsSync(output)) throw Error(`Preserve ${output}`);
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const receipt = JSON.parse(
  readFileSync(`docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`),
);
const archive = JSON.parse(gunzipSync(readFileSync(receipt.archive)));
const manifest = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const sourceSha256 = sha(manifest);
const runnerSha256 = sha(
  readFileSync('scripts/benchmarkPr189Matches.mjs', 'utf8').replaceAll('\r\n', '\n'),
);
if (!existsSync(`${root}/source-${sourceSha256}.json`))
  writeFileSync(`${root}/source-${sourceSha256}.json`, JSON.stringify(manifest, null, 2) + '\n');
let state = archive.input;
if (sha(state) !== receipt.inputSha256) throw Error('Frozen input hash mismatch');
let ticks = 0,
  stationary = 0,
  ownerSeconds = 0,
  maxStationary = 0,
  maxOwnerSeconds = 0,
  lastPass,
  lastShot,
  lastChallenge;
let capturedLongOwner = false;
const counts = {
  decisions: 0,
  preparations: 0,
  attempts: 0,
  releases: 0,
  passes: 0,
  shots: 0,
  readinessTransitions: 0,
  challenges: 0,
};
const reasons = {},
  captures = [],
  detect = createPathologyDetector(20);
let previousReady,
  failure = null;
const cpu = process.cpuUsage(),
  started = performance.now();
try {
  withBoundedObserver(
    (t) => {
      if (t.stage === 'decision') {
        counts.decisions++;
        counts.preparations += Number(t.decision.preparationCandidateId !== null);
        if (previousReady !== undefined && previousReady !== t.scene.contactReady)
          counts.readinessTransitions++;
        previousReady = t.scene.contactReady;
      }
      if (t.stage === 'attempt') {
        counts.attempts++;
        counts.releases += Number(t.released);
        if (t.contactFailure) reasons[t.contactFailure] = (reasons[t.contactFailure] ?? 0) + 1;
      }
    },
    () => {
      while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200) {
        if (state.status === 'half_time') state = startSecondHalf(state);
        const before = state;
        state = step(state, 0.025);
        if (state === before) throw Error(`Stalled at ${state.time}`);
        const p = state.players.find((p) => p.id === state.ball.ownerId);
        const same = p && before.ball.ownerId === p.id;
        const previousCarrier = same
          ? before.players.find((player) => player.id === p.id)
          : undefined;
        const actualSpeed = previousCarrier
          ? Math.hypot(
              p.position.x - previousCarrier.position.x,
              p.position.y - previousCarrier.position.y,
            ) / 0.025
          : Infinity;
        stationary = same && actualSpeed < 0.35 ? stationary + 0.025 : 0;
        ownerSeconds = same ? ownerSeconds + 0.025 : 0;
        maxStationary = Math.max(maxStationary, stationary);
        maxOwnerSeconds = Math.max(maxOwnerSeconds, ownerSeconds);
        const signal = detect(state, 0.025);
        if (!capturedLongOwner && ownerSeconds >= 120) {
          capturedLongOwner = true;
          const path = `${root}/${design}-${policy}-${version}-pathology-owner-120s.json.gz`;
          const capture = capturePathologicalState(
            state,
            'a74be9ee846ac4958fd67e42795cf3d86946e937',
            `120s same-owner diagnostic only; modified source manifest ${sourceSha256}`,
          );
          writeFileSync(path, gzipSync(JSON.stringify(capture)));
          captures.push({
            path,
            at: state.time,
            owner: state.ball.ownerId,
            reason: 'long_same_owner',
            stateSha256: sha(state),
          });
        }
        if (signal && captures.length < 2) {
          const path = `${root}/${design}-${policy}-${version}-pathology-${captures.length}.json.gz`;
          const capture = capturePathologicalState(
            state,
            'a74be9ee846ac4958fd67e42795cf3d86946e937',
            `${signal}; modified source manifest ${sourceSha256}`,
          );
          writeFileSync(path, gzipSync(JSON.stringify(capture)));
          captures.push({
            path,
            at: state.time,
            owner: state.ball.ownerId,
            reason: signal,
            stateSha256: sha(state),
          });
        }
        if (state.lastPassDiagnostic && state.lastPassDiagnostic.passId !== lastPass) {
          lastPass = state.lastPassDiagnostic.passId;
          counts.passes++;
        }
        const shot = state.ball.shot ?? state.lastShot;
        if (shot && shot.shotId !== lastShot) {
          lastShot = shot.shotId;
          counts.shots++;
        }
        if (state.lastChallenge && state.lastChallenge.id !== lastChallenge) {
          lastChallenge = state.lastChallenge.id;
          counts.challenges++;
        }
        if (++ticks % 64000 === 0) console.log(`${design}/${policy} ${state.time.toFixed(1)}s`);
      }
    },
  );
  tacticalMatchStateSchema.parse(state);
  if (state.statistics) assertMatchStatisticsInvariants(state.statistics, state);
  if (state.status !== 'full_time') throw Error(`Did not finish: ${state.status}`);
} catch (e) {
  failure = String(e);
}
let cutoffCapture;
if (failure) {
  cutoffCapture = `${root}/${design}-${policy}-${version}-cutoff.json.gz`;
  writeFileSync(
    cutoffCapture,
    gzipSync(
      JSON.stringify(
        capturePathologicalState(
          state,
          'a74be9ee846ac4958fd67e42795cf3d86946e937',
          `development cutoff; ${failure}; modified source manifest ${sourceSha256}`,
        ),
      ),
    ),
  );
}
const result = {
  schemaVersion: 1,
  classification: 'frozen PR188 development input; no independent confirmation',
  design,
  policy,
  sourceSha256,
  runnerSha256,
  runnerHashTiming: 'process_start',
  inputSha256: sha(archive.input),
  ticks,
  status: state.status,
  seconds: state.time,
  score: state.score,
  maxStationary,
  maxOwnerSeconds,
  counts,
  reasons,
  statistics: state.statistics
    ? {
        players: state.statistics.players,
        teamAccounting: state.statistics.teamAccounting,
        passingNetwork: state.statistics.passingNetwork,
      }
    : null,
  defence: state.defensiveTelemetry,
  contacts: state.contactControlTelemetry,
  captures,
  finalStateSha256: sha(state),
  ...(cutoffCapture
    ? {
        cutoffCapture,
        cutoffContext: {
          timekeeping: state.timekeeping,
          periodEndPending: state.periodEndPending,
          scenario: state.scenario,
          restart: state.restart,
          goalCompletionUntil: state.goalCompletionUntil,
          defensiveChallenge: state.defensiveChallenge,
          ball: state.ball,
          stoppageLedger: state.stoppageLedger,
        },
      }
    : {}),
  historical: {
    maxStationary: receipt.maxStationarySeconds,
    maxOwnerSeconds: receipt.maxOwnerSeconds,
    cpu: receipt.cpuMicroseconds,
    wallMs: receipt.wallMilliseconds,
  },
  cpu: process.cpuUsage(cpu),
  wallMs: performance.now() - started,
  rssBytes: process.memoryUsage().rss,
  failure,
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, status: state.status, maxStationary, counts, failure }));
if (failure) process.exitCode = 1;
