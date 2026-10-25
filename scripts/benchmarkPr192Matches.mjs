import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { PassLifecycleDiagnostics } from '../src/core/matchSimulation/passLifecycleDiagnostics.ts';
import { NaturalMatchFlowDiagnostics } from '../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts';
import { measureEffectivePlayingTime } from '../src/core/matchSimulation/effectivePlayingTime.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'state-value-v1',
  mode = args.get('mode') ?? 'combined';
if (
  !['ww', 'ss', 'sw'].includes(design) ||
  !['baseline', 'recovery', 'flow', 'combined'].includes(mode)
)
  throw Error('Invalid experiment');
const observed = (mode === 'flow' || mode === 'combined') && args.get('observers') !== 'off',
  recovery = mode === 'recovery' || mode === 'combined';
const naturalPreparation = mode === 'flow' || mode === 'combined';
const version = args.get('version');
if (version && !/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
const root = 'docs/performance/pr192/matches',
  out = `${root}/${design}-${policy}-${mode}${version ? '-' + version : ''}.json`;
if (existsSync(out)) throw Error('Refusing to overwrite ' + out);
mkdirSync(root, { recursive: true });
const hash = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const runnerHash = hash(
  readFileSync('scripts/benchmarkPr192Matches.mjs', 'utf8').replaceAll('\r\n', '\n'),
);
const manifest = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: 'src/' + p,
    sha256: hash(readFileSync('src/' + p, 'utf8').replaceAll('\r\n', '\n')),
  }));
const oldPath = `docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`;
const old = JSON.parse(readFileSync(oldPath)),
  initial = JSON.parse(gunzipSync(readFileSync(old.archive))).input;
if (hash(initial) !== old.inputSha256) throw Error('Input drift');
let s = globalThis.structuredClone(initial);
if (recovery) s.experimentalBallRecovery = true;
if (naturalPreparation) s.experimentalRestartPreparation = true;
const pass = new PassLifecycleDiagnostics(),
  flow = new NaturalMatchFlowDiagnostics();
let football = createMatchFlowTelemetry(`pr192:${design}:${mode}`),
  ticks = 0,
  failure = null,
  capture = null;
const started = performance.now(),
  cpu = process.cpuUsage();
const detail = {
  contactSeparation: {
    count: 0,
    sumMetres: 0,
    maximumMetres: 0,
    histogramQuarterMetre: Array(41).fill(0),
  },
  carryContactSeparation: {
    count: 0,
    sumMetres: 0,
    maximumMetres: 0,
    histogramQuarterMetre: Array(41).fill(0),
  },
  carryingContacts: 0,
  directionalOutcomes: {},
  looseBallRaces: 0,
  contestedAcquisitions: 0,
  recoveries: { actor: 0, teammate: 0, opponent: 0 },
  receptionToNextAcceptedAction: { count: 0, sumSeconds: 0, maximumSeconds: 0 },
  playerDistanceMetres: 0,
  stationaryOwnedSeconds: 0,
  maximumStationaryOwnedSeconds: 0,
  boundaryIntentSamples: [],
  foulContext: {
    count: 0,
    ballFirst: 0,
    reachable: 0,
    fromBehind: 0,
    forceSum: 0,
    maximumForce: 0,
    samples: [],
  },
};
const seenEvents = new Set(),
  receivedAt = new Map();
let stationary = 0;
const once = (key) => {
  if (seenEvents.has(key)) return false;
  seenEvents.add(key);
  return true;
};
const observeDetail = (before, after) => {
  const dt = after.time - before.time;
  for (let i = 0; i < after.players.length; i++) {
    const p = after.players[i],
      oldPlayer = before.players.find((q) => q.id === p.id);
    if (oldPlayer)
      detail.playerDistanceMetres += Math.hypot(
        p.position.x - oldPlayer.position.x,
        p.position.y - oldPlayer.position.y,
      );
  }
  const contact = after.lastGroundContact;
  if (contact?.executed && once('contact:' + contact.actorId + ':' + contact.at)) {
    const p = after.players.find((p) => p.id === contact.actorId);
    if (p) {
      const d = Math.hypot(p.position.x - after.ball.x, p.position.y - after.ball.y),
        stats = detail.contactSeparation;
      stats.count++;
      stats.sumMetres += d;
      stats.maximumMetres = Math.max(stats.maximumMetres, d);
      stats.histogramQuarterMetre[Math.min(40, Math.floor(d * 4))]++;
      if (before.ballCarrierIntent?.actorId === p.id || after.ballCarrierIntent?.actorId === p.id) {
        detail.carryingContacts++;
        const carry = detail.carryContactSeparation;
        carry.count++;
        carry.sumMetres += d;
        carry.maximumMetres = Math.max(carry.maximumMetres, d);
        carry.histogramQuarterMetre[Math.min(40, Math.floor(d * 4))]++;
      }
      const kind =
        after.onBallPreparation?.actorId === p.id
          ? after.onBallPreparation.receptionKind
          : undefined;
      if (kind && once('reception:' + p.id + ':' + after.onBallPreparation.gainedAt)) {
        detail.directionalOutcomes[kind] = (detail.directionalOutcomes[kind] ?? 0) + 1;
        receivedAt.set(p.id, contact.at);
      }
    }
  }
  const acquisition = after.ballAcquisition;
  if (acquisition && once('race:' + acquisition.id)) {
    detail.looseBallRaces++;
    if (acquisition.opponentId) detail.contestedAcquisitions++;
  }
  const challenge = after.lastChallenge;
  if (challenge?.outcome === 'foul' && once('foul:' + challenge.id)) {
    const f = detail.foulContext;
    f.count++;
    f.ballFirst += Number(challenge.ballFirst);
    f.reachable += Number(challenge.ballReachable === true);
    f.fromBehind += Number(challenge.fromBehind);
    f.forceSum += challenge.force;
    f.maximumForce = Math.max(f.maximumForce, challenge.force);
    if (f.samples.length < 12) f.samples.push(globalThis.structuredClone(challenge));
  }
  if (
    before.pendingPossessionLoss &&
    after.ball.ownerId &&
    once('recovery:' + before.pendingPossessionLoss.id)
  ) {
    const owner = after.players.find((p) => p.id === after.ball.ownerId),
      loss = before.pendingPossessionLoss;
    if (owner)
      detail.recoveries[
        owner.id === loss.actorId ? 'actor' : owner.team === loss.team ? 'teammate' : 'opponent'
      ]++;
  }
  if (after.decisionIndex !== before.decisionIndex && after.latestAction) {
    const id = after.latestAction.actorId,
      at = receivedAt.get(id);
    if (at !== undefined && after.time >= at) {
      const seconds = after.time - at,
        stats = detail.receptionToNextAcceptedAction;
      stats.count++;
      stats.sumSeconds += seconds;
      stats.maximumSeconds = Math.max(stats.maximumSeconds, seconds);
      receivedAt.delete(id);
    }
  }
  if (
    !after.restart &&
    !after.postGoal &&
    after.ball.ownerId === before.ball.ownerId &&
    after.ball.ownerId
  ) {
    const p = after.players.find((p) => p.id === after.ball.ownerId),
      oldPlayer = before.players.find((q) => q.id === p?.id);
    const still =
      p &&
      oldPlayer &&
      Math.hypot(p.position.x - oldPlayer.position.x, p.position.y - oldPlayer.position.y) <
        0.001 &&
      Math.hypot(after.ball.x - before.ball.x, after.ball.y - before.ball.y) < 0.001;
    if (still) {
      stationary += dt;
      detail.stationaryOwnedSeconds += dt;
      detail.maximumStationaryOwnedSeconds = Math.max(
        detail.maximumStationaryOwnedSeconds,
        stationary,
      );
    } else stationary = 0;
  } else stationary = 0;
  const award = after.lastRestartAward;
  if (award?.cause === 'boundary' && once('boundary:' + award.id) && after.lastBoundaryCrossing) {
    detail.boundaryIntentSamples.push({
      at: after.time,
      award: award.scenario,
      lastTouch: before.ball.lastTouchPlayerId ?? null,
      intent: before.ballCarrierIntent?.movementMode ?? before.latestAction?.type ?? null,
      incomingVelocity: before.ball.velocity ? { ...before.ball.velocity } : null,
      outgoingVelocity: after.ball.velocity ? { ...after.ball.velocity } : null,
      contactKind: before.lastBallContact?.kind ?? before.lastGroundContact?.region ?? null,
    });
    if (detail.boundaryIntentSamples.length > 64) detail.boundaryIntentSamples.shift();
  }
};
try {
  withBoundedObserver(observed ? (t) => pass.trace(t) : undefined, () => {
    while (!['full_time', 'abandoned'].includes(s.status) && s.time < 7200) {
      if (s.status === 'half_time') s = startSecondHalf(s);
      const before = s;
      s = step(s, 0.025);
      if (s === before) throw Error('stalled at ' + s.time);
      if (observed) {
        pass.observe(before, s);
        flow.observe(before, s);
        football = observeMatchFlow(football, before, s);
        observeDetail(before, s);
      }
      if (
        !capture &&
        recovery &&
        policy === 'state-value-v1' &&
        s.players.some((p) => p.ballMotorObservation) &&
        s.pendingPossessionLoss
      ) {
        capture = {
          path: `${root}/capture-${design}-${mode}${version ? '-' + version : ''}.json.gz`,
          at: s.time,
          sha256: hash(s),
        };
        writeFileSync(capture.path, gzipSync(JSON.stringify(s)));
      }
      if (++ticks % 64000 === 0) console.log(design, policy, mode, s.time.toFixed(1));
    }
  });
} catch (error) {
  failure = String(error);
}
if (observed) assertTelemetryInvariants(football);
const players = s.statistics?.players ?? [],
  attempted = players.reduce((n, p) => n + p.passesAttempted, 0),
  completed = players.reduce((n, p) => n + p.passesCompleted, 0),
  shots = players.reduce((n, p) => n + p.shots, 0);
const reference = JSON.parse(
  readFileSync(`docs/performance/pr190/${design}-${policy}-spin-final.json`),
);
const pairedMode =
  args.get('observers') === 'off'
    ? mode
    : mode === 'combined'
      ? 'recovery'
      : mode === 'flow'
        ? 'baseline'
        : null;
const pairedPath = pairedMode ? `${root}/${design}-${policy}-${pairedMode}.json` : null;
const paired = pairedPath && existsSync(pairedPath) ? JSON.parse(readFileSync(pairedPath)) : null;
const records = observed ? pass.snapshot() : [];
const result = {
  schema: 'mfl-pr192-development-match-v1',
  design,
  policy,
  mode,
  classification: 'paired development; independent confirmation cohort remains sealed',
  stepSeconds: 0.025,
  sourceHash: hash(manifest),
  runnerHash,
  experiments: { recovery, naturalPreparation, observed },
  manifest,
  inputHash: hash(initial),
  seed: initial.seed,
  ticks,
  status: s.status,
  seconds: s.time,
  score: s.score,
  passes: { attempted, completed },
  shots,
  time: measureEffectivePlayingTime(s, 0),
  football: observed
    ? {
        firstTimePassAttempts: football.firstTimePassAttempts,
        firstTimePassCompleted: football.firstTimePassCompleted,
        receptions: football.receptions,
        finalThirdEntries: football.finalThirdEntries,
        boxEntries: football.boxEntries,
        carries: football.carries,
        possessionChanges: football.possessionChanges,
        recoveriesAfterPoorTouch: records.filter((r) => r.sameTeamRecovery).length,
      }
    : null,
  naturalFlow: observed ? flow.report(s) : null,
  detail: observed
    ? {
        ...detail,
        meanContactSeparationMetres: detail.contactSeparation.count
          ? detail.contactSeparation.sumMetres / detail.contactSeparation.count
          : null,
        meanReceptionToNextAcceptedActionSeconds: detail.receptionToNextAcceptedAction.count
          ? detail.receptionToNextAcceptedAction.sumSeconds /
            detail.receptionToNextAcceptedAction.count
          : null,
        finalFitnessCapacityMean:
          s.players.reduce((n, p) => n + (p.fitness?.longTermCapacity ?? 1), 0) / s.players.length,
      }
    : null,
  finalHash: hash(s),
  capture,
  comparison: {
    historicalBaseline: `docs/performance/pr190/${design}-${policy}-spin-final.json`,
    baselineHash: reference.finalStateSha256,
    defaultPreserved:
      !recovery && !naturalPreparation ? hash(s) === reference.finalStateSha256 : null,
    observerPair: pairedPath,
    observerNeutral:
      args.get('observers') === 'off' && paired ? paired.finalHash === hash(s) : null,
    workstreamPairHash: paired?.finalHash ?? null,
    workstreamChangesState:
      args.get('observers') === 'off' ? null : paired ? paired.finalHash !== hash(s) : null,
  },
  performance: {
    wallSeconds: (performance.now() - started) / 1000,
    cpu: process.cpuUsage(cpu),
    rssBytes: process.memoryUsage().rss,
    maxRSS: process.resourceUsage().maxRSS,
  },
  failure,
};
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    out,
    status: s.status,
    failure,
    passes: result.passes,
    shots,
    inPlay: result.time.ballInPlaySeconds / 60,
    preserved: result.comparison.defaultPreserved,
    observerNeutral: result.comparison.observerNeutral,
  }),
);
if (
  failure ||
  s.status !== 'full_time' ||
  result.comparison.defaultPreserved === false ||
  result.comparison.observerNeutral === false
)
  process.exitCode = 1;
