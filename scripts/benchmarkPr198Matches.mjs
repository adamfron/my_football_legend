import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { captureCalibrationSnapshot } from '../src/core/matchSimulation/assumptionCalibration.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { measureEffectivePlayingTime } from '../src/core/matchSimulation/effectivePlayingTime.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import { readDevelopmentInput } from './pr193Evidence.mjs';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';
import { hash, read, receipt, sourceIdentity } from './pr198Evidence.mjs';
import {
  createDisruptionLedger,
  observeDisruption,
  sampleDisruptionFrame,
} from '../src/core/matchSimulation/disruptionLedger.ts';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const pr197 = true;
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'state-value-v1',
  corrected = args.get('model') === 'corrected',
  limit = Number(args.get('seconds') ?? 7200),
  version = args.get('version') ?? 'v1';
if (!/^[a-z0-9-]+$/.test(version) || !Number.isFinite(limit) || limit < 10 || limit > 7200)
  throw Error('Invalid run');
const full = limit === 7200,
  output = `docs/performance/pr198/${full ? 'matches' : 'harvest'}/${design}-${policy}-${corrected ? 'corrected' : 'baseline'}-${version}.json.gz`;
const { input, path } = readDevelopmentInput(design, policy);
let s = globalThis.structuredClone(input);
Object.assign(s, {
  experimentalBallRecovery: true,
  experimentalRestartPreparation: true,
  experimentalTransitionIntelligence: true,
  experimentalStrategicClearances: true,
  experimentalActivePerception: true,
  experimentalReceivingPositions: true,
  experimentalTeamTempo: true,
  experimentalCanonicalArrival: false,
  experimentalDefensiveReception: true,
  experimentalHeightAwarePassing: true,
  experimentalReceiverAnticipation: true,
  experimentalReceiverSynchronisation: corrected,
  experimentalObservedLoftedPasses: corrected,
  ...(pr197 && args.has('seed') ? { seed: args.get('seed') } : {}),
});
const initialHash = hash(s),
  sourceArchive = sourceIdentity(),
  started = performance.now(),
  cpu = process.cpuUsage();
let ticks = 0,
  football = createMatchFlowTelemetry(`pr196:${design}:${policy}`),
  failure = null;
const captures = [],
  strata = new Set(),
  active = [],
  passOutcomes = [],
  counts = {
    decisions: 0,
    attempts: 0,
    preparationFailures: {},
    actionFamilies: {},
    expired: 0,
    longPasses: 0,
    throughBalls: 0,
    progressiveAttempts: 0,
  };
let currentTrace = [];
const initialState = globalThis.structuredClone(s),
  disruption = createDisruptionLedger(s);
const runWitnesses = new Set(),
  opportunityWitnesses = new Set();
const opportunityCounts = {
  recognized: 0,
  movingRuns: 0,
  boundedCandidateDecisions: 0,
  boundedLoftedCandidates: 0,
  rejectedOrUnready: 0,
};
const finish = (episode) => {
  const outcome = interpretCanonicalOutcome(episode.contract, episode.samples);
  passOutcomes.push({
    passId: episode.contract.passId,
    actorId: episode.contract.actorId,
    receiverId: episode.contract.receiverId,
    releasedAt: episode.contract.releasedAt,
    delivery: episode.delivery,
    progress: episode.progress,
    length: episode.length,
    restartOrigin: episode.restartOrigin,
    outcome,
  });
};
try {
  withBoundedObserver(
    (t) => {
      if (t.stage === 'decision') counts.decisions++;
      if (t.stage === 'decision' && t.candidates) {
        opportunityCounts.boundedCandidateDecisions++;
        opportunityCounts.boundedLoftedCandidates += t.candidates.filter(
          (c) => c.action.type === 'pass' && c.action.delivery === 'lofted',
        ).length;
        opportunityCounts.rejectedOrUnready += t.candidates.filter(
          (c) => !c.feasible || c.readyAt > t.at || c.closesAt <= t.at,
        ).length;
      }
      if (t.stage === 'attempt') {
        counts.attempts++;
        if (t.contactFailure)
          counts.preparationFailures[t.contactFailure] =
            (counts.preparationFailures[t.contactFailure] ?? 0) + 1;
      }
      if (t.reason.includes('expir')) counts.expired++;
      if (t.action)
        counts.actionFamilies[t.action.type] = (counts.actionFamilies[t.action.type] ?? 0) + 1;
      if (currentTrace.length < 4) currentTrace.push(globalThis.structuredClone(t));
    },
    () => {
      while (!['full_time', 'abandoned'].includes(s.status) && s.time < limit) {
        if (s.status === 'half_time') s = startSecondHalf(s);
        const before = s;
        currentTrace = [];
        s = step(s, 0.025);
        ticks++;
        observeDisruption(disruption, initialState, before, s, 'home', undefined, undefined, false);
        if (ticks % 20 === 0) {
          for (const [id, job] of Object.entries(s.activePerceptionRuntime?.positions ?? {})) {
            if (job.reason === 'protect_role_and_rest_defence') continue;
            const key = `${id}:${job.observedAt}`;
            if (!opportunityWitnesses.has(key)) {
              opportunityWitnesses.add(key);
              opportunityCounts.recognized++;
            }
            const player = s.players.find((p) => p.id === id);
            if (
              player &&
              Math.hypot(player.velocity.x, player.velocity.y) > 0.7 &&
              !runWitnesses.has(key)
            ) {
              runWitnesses.add(key);
              opportunityCounts.movingRuns++;
            }
          }
        }
        if (s === before) throw Error('No canonical progress');
        football = observeMatchFlow(football, before, s);
        const pass = s.lastPassDiagnostic;
        if (pass && pass.passId !== before.lastPassDiagnostic?.passId) {
          const actor = before.players.find((p) => p.id === pass.passerId);
          if (actor) {
            const direction = attacksRight(actor) ? 1 : -1,
              target = pass.intendedTarget ?? pass.predictedReceptionPoint,
              progress = direction * (target.x - actor.position.x),
              length = Math.hypot(target.x - actor.position.x, target.y - actor.position.y);
            if (length >= 30) counts.longPasses++;
            if (pass.intent === 'through') counts.throughBalls++;
            if (progress >= 10) counts.progressiveAttempts++;
            active.push({
              contract: outcomeContractSchema.parse({
                version: 'original-delivery-v3',
                actorId: actor.id,
                receiverId: pass.intendedReceiverId,
                teamIds: before.players.filter((p) => p.team === actor.team).map((p) => p.id),
                opponentIds: before.players.filter((p) => p.team !== actor.team).map((p) => p.id),
                requestedAt: pass.releasedAt,
                releasedAt: pass.releasedAt,
                horizonAt: pass.releasedAt + 8,
                passId: pass.passId,
                shotId: null,
                previousShotId: before.ball.shot?.shotId ?? before.lastShot?.shotId ?? null,
                information: 'privileged_engineering_observer',
                conditionalOnRelease: true,
              }),
              samples: [],
              delivery: pass.delivery ?? 'ground',
              progress,
              length,
              restartOrigin: Boolean(before.restart),
            });
          }
        }
        if (active.length) {
          const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
          for (let i = active.length - 1; i >= 0; i--) {
            const e = active[i];
            e.samples.push(sample);
            if (s.time >= e.contract.horizonAt - 1e-8) {
              finish(e);
              active.splice(i, 1);
            }
          }
        }
        if (pr197 && ticks === 800) {
          const capturePath = output.replace('.json.gz', '-prefix.json.gz');
          receipt(capturePath, { state: s, inputHash: hash(s) });
          captures.push({
            path: capturePath,
            at: s.time,
            nextTick: null,
            reasons: ['fixed 800th canonical tick; no outcome selection'],
          });
        }
        if (
          !pr197 &&
          captures.length < 12 &&
          s.ball.ownerId &&
          !s.restart &&
          !s.postGoal &&
          ticks % 20 === 0
        ) {
          const actor = s.players.find((p) => p.id === s.ball.ownerId);
          const bucket = Math.floor(s.time / 120),
            reasons = [];
          if (
            s.time >= 20 &&
            !strata.has(`uniform:${bucket}`) &&
            captures.filter((c) => c.reasons.some((r) => r.startsWith('uniform'))).length < 6
          )
            reasons.push(`uniform:first eligible owner on 120-second clock grid:${bucket}`);
          const pressure = s.currentPressure ?? 0;
          if (pressure > 0.5 && !strata.has('pressure')) reasons.push('pressure');
          if (s.teams[actor.team].phase === 'attacking_transition' && !strata.has('transition'))
            reasons.push('transition');
          if (
            (actor.team === 'home' ? actor.position.x > 70 : actor.position.x < 35) &&
            !strata.has('final_third')
          )
            reasons.push('final_third');
          const longVisible = s.players.some(
            (p) =>
              p.team === actor.team &&
              Math.hypot(p.position.x - actor.position.x, p.position.y - actor.position.y) > 36,
          );
          if (longVisible && !strata.has('long_option')) reasons.push('long_option');
          if (reasons.length) {
            const snapshot = captureCalibrationSnapshot(s, actor.id),
              capturePath = output.replace('.json.gz', `-capture-${captures.length}.json.gz`);
            receipt(capturePath, snapshot);
            captures.push({
              path: capturePath,
              inputHash: hash(s),
              at: s.time,
              actorId: actor.id,
              reasons,
              nextTick: null,
              policySelection:
                policy.includes('state-value') || policy.includes('phase-role')
                  ? (snapshot.policyRankings.find((p) => p.policy === policy)?.actions[0]?.action ??
                    null)
                  : (snapshot.candidates.find(
                      (c) =>
                        c.id ===
                        snapshot.boundedDecisions.find((d) => d.policy === policy)
                          ?.selectedCandidateId,
                    )?.action ?? null),
              boundedPassCount: snapshot.candidates.filter((c) => c.action.type === 'pass').length,
              fullWorldPassCount: snapshot.policyRankings
                .find((p) => p.policy === 'state-value-v1')
                .actions.filter((c) => c.action.type === 'pass').length,
            });
            for (const r of reasons) strata.add(r.startsWith('uniform') ? `uniform:${bucket}` : r);
          }
        }
        for (const capture of captures)
          if (!capture.nextTick && before.time >= capture.at)
            capture.nextTick = {
              stateHash: hash(s),
              at: s.time,
              requestedAction:
                s.decisionIndex !== before.decisionIndex ? (s.currentAction ?? null) : null,
              boundedTraces: currentTrace,
              passId: s.lastPassDiagnostic?.passId ?? null,
            };
        if (ticks % 40000 === 0)
          console.log(design, policy, corrected ? 'corrected' : 'baseline', s.time.toFixed(1));
      }
    },
  );
} catch (e) {
  failure = String(e);
}
active.forEach(finish);
if (args.has('replay-of')) {
  const previous = read(args.get('replay-of'));
  if (
    hash(s) !== previous.finalHash ||
    ticks !== previous.ticks ||
    initialHash !== previous.initialHash
  )
    throw Error('Physical state changed during observer-only full replay');
}
const players = s.statistics?.players ?? [];
receipt(output, {
  schema: 'pr198-development-match-v1',
  classification: 'paired development; independent confirmation sealed',
  design,
  policy,
  corrected,
  version,
  fullMatchRequested: full,
  limit,
  sourceArchive,
  ...(args.has('replay-of')
    ? { fullPhysicalReplayOf: args.get('replay-of'), physicalEquivalent: true }
    : {}),
  inputPath: path,
  seed: pr197 ? s.seed : input.seed,
  initialHash,
  originalInputHash: hash(input),
  flags: {
    recovery: true,
    restart: true,
    transition: true,
    clearance: true,
    perception: true,
    receivingPositions: true,
    tempo: true,
    canonicalArrival: pr197 ? false : corrected,
    ...(pr197
      ? {
          defensiveReception: true,
          heightAwarePassing: true,
          receiverAnticipation: true,
          receiverSynchronisation: corrected,
          observedLoftedPasses: corrected,
        }
      : {}),
  },
  ticks,
  seconds: s.time,
  status: s.status,
  failure,
  finalHash: hash(s),
  score: s.score,
  passes: {
    attempted: players.reduce((n, p) => n + p.passesAttempted, 0),
    completed: players.reduce((n, p) => n + p.passesCompleted, 0),
  },
  shots: players.reduce((n, p) => n + p.shots, 0),
  time: measureEffectivePlayingTime(s, 0),
  counts,
  opportunityCounts,
  missingCandidates:
    'Not exhaustively observable across all policies; bounded unready/rejected counts have decision-menu denominators only.',
  disruption,
  finalShape: sampleDisruptionFrame(initialState, s, 'home', false),
  football,
  passOutcomes,
  captures,
  performance: {
    wallSeconds: (performance.now() - started) / 1000,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
    node: process.version,
    cpuModel: cpus()[0]?.model,
    classification: 'concurrent development host with compact observers',
  },
});
console.log(
  JSON.stringify({
    output,
    status: s.status,
    seconds: s.time,
    failure,
    passes: players.reduce((n, p) => n + p.passesAttempted, 0),
    shots: players.reduce((n, p) => n + p.shots, 0),
  }),
);
if (failure || (full && s.status !== 'full_time')) process.exitCode = 1;
