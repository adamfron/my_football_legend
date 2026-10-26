import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { NaturalMatchFlowDiagnostics } from '../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts';
import { measureEffectivePlayingTime } from '../src/core/matchSimulation/effectivePlayingTime.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import { measureTeamOrganisation } from '../src/core/matchSimulation/transitionDiagnostics.ts';
import {
  hash,
  manifest,
  writeReceipt,
  readDevelopmentInput,
  retainSourceVersion,
} from './pr193Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'opportunity-driven-v1',
  mode = args.get('mode') ?? 'combined',
  version = args.get('version');
if (
  !['baseline', 'transition', 'clearance', 'combined'].includes(mode) ||
  !version ||
  !/^[a-z0-9-]+$/.test(version)
)
  throw Error('Explicit mode/version required');
const observed = args.get('observers') !== 'off';
const root = 'docs/performance/pr193/matches',
  out = `${root}/${design}-${policy}-${mode}-${version}${observed ? '' : '-bare'}.json`;
if (existsSync(out)) throw Error('Refusing to overwrite ' + out);
const { input, path: inputPath } = readDevelopmentInput(design, policy);
let s = globalThis.structuredClone(input);
s.experimentalBallRecovery = true;
s.experimentalRestartPreparation = true;
if (mode === 'transition' || mode === 'combined') s.experimentalTransitionIntelligence = true;
if (mode === 'clearance' || mode === 'combined') s.experimentalStrategicClearances = true;
const source = manifest(),
  sourceHash = hash(source),
  initial = globalThis.structuredClone(s);
const sourceArchive = retainSourceVersion(source);
const flow = new NaturalMatchFlowDiagnostics();
let football = createMatchFlowTelemetry(`pr193:${design}:${policy}:${mode}`);
let ticks = 0,
  failure = null,
  capture = null;
const started = performance.now(),
  cpu = process.cpuUsage();
const seen = new Set(),
  runStarts = new Map(),
  episodes = new Map();
const detail = {
  decisions: 0,
  observedWindows: 0,
  usedWindowEpisodes: 0,
  expiredUnusedEpisodes: 0,
  preparationChoices: 0,
  runs: { pass_and_run: 0, third_man: 0 },
  runsMoved: 0,
  runsDrawingTracking: 0,
  clearances: {},
  physicalClearances: 0,
  clearanceExits: 0,
  forwardPasses: 0,
  backwardPasses: 0,
  foulChallenges: 0,
  behindFouls: 0,
  contactRaces: 0,
  windowSamples: [],
  challenges: [],
  organisation: [],
  late: {},
  finalFitness: 0,
};
const once = (key) => {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
};
const trace = (t) => {
  if (
    t.stage !== 'decision' ||
    !once(
      `decision:${t.actorId}:${t.at}:${t.decision?.selectedCandidateId}:${t.decision?.preparationCandidateId}`,
    )
  )
    return;
  detail.decisions++;
  detail.preparationChoices += Number(t.decision?.preparationCandidateId != null);
  const current = new Set();
  for (const c of t.candidates ?? []) {
    if (!c.opportunity || c.opportunity.contactMargin < 0 || c.legal === false) continue;
    const key = t.actorId + ':' + c.id;
    current.add(key);
    if (!episodes.has(key)) {
      episodes.set(key, {
        actorId: t.actorId,
        receiverId: c.action.receiverId,
        at: t.at,
        used: false,
      });
      detail.observedWindows++;
    }
    if (detail.windowSamples.length < 12 && c.progress > 5)
      detail.windowSamples.push({
        at: t.at,
        actorId: t.actorId,
        selected: t.decision?.selectedCandidateId,
        candidate: c,
      });
  }
  for (const [key, e] of episodes)
    if (e.actorId === t.actorId && !current.has(key)) {
      if (!e.used) detail.expiredUnusedEpisodes++;
      episodes.delete(key);
    }
};
try {
  withBoundedObserver(observed ? trace : undefined, () => {
    while (!['full_time', 'abandoned'].includes(s.status) && s.time < 7200) {
      if (s.status === 'half_time') s = startSecondHalf(s);
      const before = s;
      s = step(s, 0.025);
      if (s === before) throw Error('stalled at ' + s.time);
      if (observed) {
        flow.observe(before, s);
        football = observeMatchFlow(football, before, s);
        const pass = s.lastPassDiagnostic;
        if (pass && once('pass:' + pass.passId)) {
          const actor = before.players.find((p) => p.id === pass.passerId);
          const target = pass.intendedTarget ?? pass.predictedReceptionPoint;
          const delta =
            actor && target
              ? (target.x - actor.position.x) *
                ((actor.team === 'home') !== Boolean(s.endsSwitched) ? 1 : -1)
              : 0;
          detail[delta >= 0 ? 'forwardPasses' : 'backwardPasses']++;
          for (const e of episodes.values())
            if (
              !e.used &&
              e.actorId === pass.passerId &&
              e.receiverId === pass.intendedReceiverId
            ) {
              e.used = true;
              detail.usedWindowEpisodes++;
            }
        }
        for (const r of s.transitionRuntime?.runs ?? []) {
          const key = r.actorId + ':' + r.observedAt;
          if (once('run:' + key)) {
            detail.runs[r.kind]++;
            runStarts.set(key, { ...r, moved: false, tracked: false });
          }
          const run = runStarts.get(key),
            p = s.players.find((p) => p.id === r.actorId);
          if (
            run &&
            p &&
            !run.moved &&
            Math.hypot(p.position.x - r.origin.x, p.position.y - r.origin.y) >= 1.5
          ) {
            detail.runsMoved++;
            run.moved = true;
          }
          if (
            run &&
            !run.tracked &&
            s.players.some(
              (q) =>
                q.team !== p?.team &&
                (q.transitionMark?.runnerId === p?.id ||
                  q.spatialMovement?.kind === 'track_depth') &&
                p &&
                Math.hypot(q.target.x - p.position.x, q.target.y - p.position.y) < 4,
            )
          ) {
            detail.runsDrawingTracking++;
            run.tracked = true;
          }
        }
        const challenge = s.lastChallenge;
        if (challenge && once('challenge:' + challenge.id)) {
          if (challenge.clearance)
            detail.clearances[challenge.clearance.kind] =
              (detail.clearances[challenge.clearance.kind] ?? 0) + 1;
          if (challenge.outcome === 'foul') {
            detail.foulChallenges++;
            detail.behindFouls += Number(challenge.fromBehind);
          }
          if (detail.challenges.length < 16)
            detail.challenges.push({
              challenge,
              state: {
                ball: globalThis.structuredClone(s.ball),
                players: s.players
                  .filter((p) => [challenge.actorId, challenge.opponentId].includes(p.id))
                  .map((p) => ({
                    id: p.id,
                    position: p.position,
                    velocity: p.velocity,
                    facing: p.facingAngle,
                  })),
              },
            });
          if (
            challenge.clearance &&
            s.lastGroundContact?.actorId === challenge.actorId &&
            s.lastGroundContact.at === challenge.at &&
            s.lastGroundContact.executed
          )
            detail.physicalClearances++;
        }
        if (
          s.lastRestartAward?.cause === 'boundary' &&
          once('boundary:' + s.lastRestartAward.id) &&
          s.lastChallenge?.clearance &&
          s.lastBoundaryCrossing?.lastTouchPlayerId === s.lastChallenge.actorId
        )
          detail.clearanceExits++;
        if (s.ballAcquisition && once('race:' + s.ballAcquisition.id)) detail.contactRaces++;
        if (ticks % 2400 === 0)
          detail.organisation.push({
            at: s.time,
            home: measureTeamOrganisation(s, 'home'),
            away: measureTeamOrganisation(s, 'away'),
          });
      }
      if (!capture && s.time >= 300 && !s.restart && s.ball.ownerId) {
        capture = { path: out.replace('.json', '-capture.json.gz'), at: s.time, sha256: hash(s) };
      }
      if (capture && capture.at === s.time) {
        // writeReceipt below creates the output directory before this compact state is saved.
        capture.state = globalThis.structuredClone(s);
      }
      if (++ticks % 64000 === 0) console.log(design, policy, mode, s.time.toFixed(1));
    }
  });
} catch (error) {
  failure = String(error);
}
if (observed) assertTelemetryInvariants(football);
const players = s.statistics?.players ?? [],
  time = measureEffectivePlayingTime(s, 0);
detail.finalFitness =
  s.players.reduce((n, p) => n + (p.fitness?.longTermCapacity ?? 1), 0) /
  Math.max(1, s.players.length);
const captureState = capture?.state;
if (capture) delete capture.state;
const result = {
  schema: 'mfl-pr193-development-match-v1',
  classification: 'paired development; confirmation sealed',
  design,
  policy,
  mode,
  version,
  observed,
  inputPath,
  inputHash: hash(input),
  initialHash: hash(initial),
  seed: input.seed,
  flags: {
    recovery: true,
    restartPreparation: true,
    transition: Boolean(initial.experimentalTransitionIntelligence),
    clearance: Boolean(initial.experimentalStrategicClearances),
  },
  source,
  sourceHash,
  sourceArchive,
  runnerHash: hash(
    readFileSync('scripts/benchmarkPr193Matches.mjs', 'utf8').replaceAll('\r\n', '\n'),
  ),
  stepSeconds: 0.025,
  ticks,
  status: s.status,
  seconds: s.time,
  score: s.score,
  passes: {
    attempted: players.reduce((n, p) => n + p.passesAttempted, 0),
    completed: players.reduce((n, p) => n + p.passesCompleted, 0),
  },
  shots: players.reduce((n, p) => n + p.shots, 0),
  time,
  football: observed ? football : null,
  naturalFlow: observed ? flow.report(s) : null,
  detail: observed ? detail : null,
  finalHash: hash(s),
  capture,
  failure,
  performance: {
    wallSeconds: (performance.now() - started) / 1000,
    cpu: process.cpuUsage(cpu),
    rssBytes: process.memoryUsage().rss,
    maxRSS: process.resourceUsage().maxRSS,
  },
};
writeReceipt(out, result);
if (captureState)
  writeFileSync(capture.path, gzipSync(JSON.stringify(captureState)), { flag: 'wx' });
console.log(
  JSON.stringify({
    out,
    status: s.status,
    failure,
    passes: result.passes,
    shots: result.shots,
    inPlay: time.ballInPlaySeconds / 60,
  }),
);
if (failure || s.status !== 'full_time') process.exitCode = 1;
