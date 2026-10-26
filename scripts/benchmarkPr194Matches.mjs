import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { cpus, platform } from 'node:os';
import process from 'node:process';
import console from 'node:console';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { PerceptionDiagnostics } from '../src/core/matchSimulation/perceptionDiagnostics.ts';
import { NaturalMatchFlowDiagnostics } from '../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts';
import { measureEffectivePlayingTime } from '../src/core/matchSimulation/effectivePlayingTime.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import {
  hash,
  manifest,
  canonicalKernelManifest,
  writeReceipt,
  readDevelopmentInput,
  retainPr194Source,
} from './pr194Evidence.mjs';
import { readPr193Evidence } from './readPr193Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'opportunity-driven-v1',
  mode = args.get('mode') ?? 'combined',
  version = args.get('version') ?? 'v1',
  observed = args.get('observers') !== 'off';
if (
  !['baseline', 'perception', 'positions', 'tempo', 'combined'].includes(mode) ||
  !/^[a-z0-9-]+$/.test(version)
)
  throw Error('Invalid mode/version');
const root = 'docs/performance/pr194/matches',
  out = `${root}/${design}-${policy}-${mode}-${version}${observed ? '' : '-bare'}.json`;
if (existsSync(out)) throw Error('Refusing to overwrite ' + out);
const { input, path: inputPath } = readDevelopmentInput(design, policy);
let s = globalThis.structuredClone(input);
s.experimentalBallRecovery = true;
s.experimentalRestartPreparation = true;
s.experimentalTransitionIntelligence = true;
s.experimentalStrategicClearances = true;
if (mode === 'perception' || mode === 'combined') s.experimentalActivePerception = true;
if (mode === 'positions' || mode === 'combined') s.experimentalReceivingPositions = true;
if (mode === 'tempo' || mode === 'combined') s.experimentalTeamTempo = true;
const source = manifest(),
  sourceHash = hash(source),
  kernelHash = hash(canonicalKernelManifest(source)),
  sourceArchive = retainPr194Source(source),
  initial = globalThis.structuredClone(s);
const flow = new NaturalMatchFlowDiagnostics(),
  perception = new PerceptionDiagnostics(),
  profiler = new PerformanceProfiler({ enabled: observed, sampleEveryTicks: 37 });
let football = createMatchFlowTelemetry(`pr194:${design}:${policy}:${mode}`),
  ticks = 0,
  failure = null,
  capture = null;
const cpu = process.cpuUsage(),
  wall = performance.now();
try {
  withPerformanceProfiler(profiler, () =>
    withBoundedObserver(observed ? (t) => perception.decision(t) : undefined, () => {
      while (!['full_time', 'abandoned'].includes(s.status) && s.time < 7200) {
        if (s.status === 'half_time') s = startSecondHalf(s);
        const before = s;
        profiler.beginTick(ticks);
        s = step(s, 0.025);
        ticks++;
        if (s === before) throw Error('Stalled at ' + s.time);
        if (observed) {
          flow.observe(before, s);
          football = observeMatchFlow(football, before, s);
          perception.observe(before, s);
        }
        if (!capture && s.time >= 30 && !s.restart && !s.postGoal)
          capture = globalThis.structuredClone(s);
        if (ticks % 40000 === 0) console.log(design, policy, mode, s.time.toFixed(1));
      }
    }),
  );
} catch (error) {
  failure = String(error);
}
const timing = {
  wallSeconds: (performance.now() - wall) / 1000,
  cpu: process.cpuUsage(cpu),
  maxRSSKiB: process.resourceUsage().maxRSS,
  rssBytes: process.memoryUsage().rss,
};
if (observed) assertTelemetryInvariants(football);
const players = s.statistics?.players ?? [],
  time = measureEffectivePlayingTime(s, 0),
  prior = readPr193Evidence(
    `docs/performance/pr193/matches/${design}-${policy}-combined-final-v2.json`,
  );
mkdirSync(root, { recursive: true });
const capturePath = out.replace(/\.json$/, '-capture.json.gz');
if (capture) writeFileSync(capturePath, gzipSync(JSON.stringify(capture)), { flag: 'wx' });
writeReceipt(out, {
  schema: 'mfl-pr194-match-v1',
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
  source,
  sourceHash,
  kernelHash,
  sourceArchive,
  runnerHash: hash(
    readFileSync('scripts/benchmarkPr194Matches.mjs', 'utf8').replaceAll('\r\n', '\n'),
  ),
  flags: {
    perception: !!initial.experimentalActivePerception,
    positions: !!initial.experimentalReceivingPositions,
    tempo: !!initial.experimentalTeamTempo,
    transition: true,
    clearance: true,
    recovery: true,
    restartPreparation: true,
  },
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
  perception: observed ? perception.report() : null,
  fitness: s.players.map((p) => ({
    id: p.id,
    team: p.team,
    fitness: p.fitness ?? null,
    locomotion: p.locomotionTelemetry ?? null,
  })),
  profile: observed ? profiler.snapshot() : null,
  performance: timing,
  host: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    node: process.version,
    platform: platform(),
  },
  finalHash: hash(s),
  prior: {
    path: `docs/performance/pr193/matches/${design}-${policy}-combined-final-v2.json`,
    finalHash: prior.finalHash,
    passes: prior.passes,
    shots: prior.shots,
    time: prior.time,
    performance: prior.performance,
  },
  baselineParity: mode === 'baseline' ? hash(s) === prior.finalHash : null,
  capture: capture
    ? { path: capturePath, sha256: hash(readFileSync(capturePath)), stateHash: hash(capture) }
    : null,
  failure,
});
console.log(
  JSON.stringify({
    out,
    status: s.status,
    failure,
    passes: players.reduce((n, p) => n + p.passesAttempted, 0),
    shots: players.reduce((n, p) => n + p.shots, 0),
    timing,
  }),
);
if (failure || s.status !== 'full_time' || (mode === 'baseline' && hash(s) !== prior.finalHash))
  process.exitCode = 1;
