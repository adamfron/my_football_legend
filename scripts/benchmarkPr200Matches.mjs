import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import {
  withIntegrationProfile,
  resolveIntegrationProfile,
} from '../src/core/matchSimulation/integrationProfile.ts';
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
import {
  createDisruptionLedger,
  observeDisruption,
} from '../src/core/matchSimulation/disruptionLedger.ts';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';
import { readDevelopmentInput } from './pr193Evidence.mjs';
import {
  ROOT as PR200_ROOT,
  hash,
  read,
  write,
  identity as pr200Identity,
} from './pr200Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const pr201 = args.has('pr201');
const { ROOT, identity } = pr201
  ? await import('./pr201Evidence.mjs')
  : { ROOT: PR200_ROOT, identity: pr200Identity };
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'state-value-v1';
const profile = args.get('profile') ?? (pr201 ? 'realism-candidate-v1' : 'realism-candidate-v0'),
  version = args.get('version') ?? 'v1';
const limit = Number(args.get('seconds') ?? 7200);
if (!/^[a-z0-9-]+$/.test(version) || !Number.isFinite(limit) || limit < 1 || limit > 7200)
  throw Error('Invalid run');
const { input, path } = readDevelopmentInput(design, policy);
let s = withIntegrationProfile(globalThis.structuredClone(input), profile, policy);
s.seed = `pr200-development-${design}-${policy}`;
const initial = globalThis.structuredClone(s),
  initialHash = hash(s),
  source = identity(),
  manifest = resolveIntegrationProfile(profile, policy);
const started = performance.now(),
  cpu = process.cpuUsage(),
  active = [],
  passOutcomes = [];
let ticks = 0,
  failure = null,
  football = createMatchFlowTelemetry(`pr200:${design}:${policy}`);
const disruption = createDisruptionLedger(s),
  counts = {
    decisions: 0,
    candidates: 0,
    loftCandidates: 0,
    rejected: 0,
    attempts: 0,
    longPasses: 0,
    throughBalls: 0,
    progressivePasses: 0,
    loftReleases: 0,
  };
const finish = (episode) =>
  passOutcomes.push({
    contract: episode.contract,
    family: episode.family,
    length: episode.length,
    progress: episode.progress,
    outcome: interpretCanonicalOutcome(episode.contract, episode.samples),
  });
try {
  withBoundedObserver(
    (t) => {
      if (t.stage === 'decision') {
        counts.decisions++;
        counts.candidates += t.candidates?.length ?? 0;
        counts.loftCandidates +=
          t.candidates?.filter((c) => c.action.delivery === 'lofted').length ?? 0;
        counts.rejected +=
          t.candidates?.filter((c) => !c.feasible || c.readyAt > t.at || c.closesAt <= t.at)
            .length ?? 0;
      }
      if (t.stage === 'attempt') counts.attempts++;
    },
    () => {
      while (!['full_time', 'abandoned'].includes(s.status) && s.time < limit) {
        if (s.status === 'half_time') s = startSecondHalf(s);
        const before = s;
        s = step(s, 0.025);
        ticks++;
        if (s === before) throw Error('No canonical progress');
        football = observeMatchFlow(football, before, s);
        observeDisruption(disruption, initial, before, s, 'home', undefined, undefined, false);
        const pass = s.lastPassDiagnostic;
        if (pass && pass.passId !== before.lastPassDiagnostic?.passId) {
          const actor = before.players.find((p) => p.id === pass.passerId);
          if (actor) {
            const target = pass.intendedTarget ?? pass.predictedReceptionPoint;
            const length = Math.hypot(target.x - actor.position.x, target.y - actor.position.y),
              progress = (attacksRight(actor) ? 1 : -1) * (target.x - actor.position.x);
            counts.longPasses += Number(length >= 30);
            counts.throughBalls += Number(pass.intent === 'through');
            counts.progressivePasses += Number(progress >= 10);
            counts.loftReleases += Number(pass.delivery === 'lofted');
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
              family: pass.delivery ?? 'ground',
              length,
              progress,
            });
          }
        }
        if (active.length) {
          const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
          for (let i = active.length - 1; i >= 0; i--) {
            active[i].samples.push(sample);
            if (s.time >= active[i].contract.horizonAt - 1e-8) {
              finish(active[i]);
              active.splice(i, 1);
            }
          }
        }
        if (ticks % 40000 === 0)
          console.log(pr201 ? 'PR201' : 'PR200', design, policy, profile, s.time.toFixed(1));
      }
    },
  );
} catch (e) {
  failure = String(e);
}
active.forEach(finish);
const players = s.statistics?.players ?? [];
const result = {
  schema: pr201 ? 'pr201-development-match-v1' : 'pr200-development-match-v1',
  source,
  manifest,
  design,
  policy,
  profile,
  seed: s.seed,
  inputPath: path,
  originalInputHash: hash(input),
  initialHash,
  fullMatchRequested: limit === 7200,
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
  counts,
  time: measureEffectivePlayingTime(s, 0),
  football,
  disruption,
  passOutcomes,
  candidateAvailabilityLimit: pr201
    ? 'Decision/attempt traces are measured. Candidate menus are omitted with active perception and transition intelligence disabled; inherited zero candidate/rejection counters are unavailable, not measured absence. Full-world menus are also unmeasured.'
    : 'Complete decision-menu denominators only for bounded O/H/J. Full-world candidate availability is unmeasured, not zero.',
  classification: 'development only; independent confirmation sealed',
};
if (args.has('check')) {
  const { source: _old, ...old } = read(args.get('check')).result;
  const { source: _new, ...actual } = result;
  void _old;
  void _new;
  if (hash(actual) !== hash(old)) throw Error('PR200 full deterministic replay drift');
} else
  write(
    `${ROOT}/${limit === 7200 ? 'matches' : 'prefix'}/${design}-${policy}-${profile}-${version}.json.gz`,
    {
      result,
      costs: {
        wallSeconds: (performance.now() - started) / 1000,
        cpu: process.cpuUsage(cpu),
        peakRSSKiB: process.resourceUsage().maxRSS,
        node: process.version,
        cpuModel: cpus()[0]?.model,
        mode: 'concurrent development host; compact observers',
      },
    },
  );
console.log(
  pr201 ? 'PR201 match completed' : 'PR200 match completed',
  design,
  policy,
  profile,
  s.status,
  s.time,
  result.finalHash,
);
if (failure || (limit === 7200 && s.status !== 'full_time')) process.exitCode = 1;
