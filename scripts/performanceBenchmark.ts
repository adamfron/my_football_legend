import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SingleMatchSession } from '../src/core/singleMatch';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { defensiveTelemetrySchema } from '../src/core/matchSimulation/defensiveChallenges';
import { disciplineSchema } from '../src/core/matchSimulation/matchRules';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import {
  projectPlayerAgency,
  resolveDevPlayerDecision,
} from '../src/core/matchSimulation/playerDecision';
import { PlayerAgencyTracker } from '../src/core/matchSimulation/playerAgency';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  type MatchFlowTelemetry,
} from '../src/core/matchSimulation/matchFlowTelemetry';
import { projectMatchMoment } from '../src/core/matchSimulation/matchMoment';
import { PresentationContextHistory } from '../src/app/match/tacticalRenderer/contextHistory';
import { MatchDebugRecorder } from '../src/app/match/matchDebugCapture';
import { percentile } from '../src/core/matchSimulation/backgroundPerformance';
import {
  endPerformanceSpan,
  isDevObservationMode,
  performanceObserverModeSchema,
  performanceProfileSchema,
  PerformanceProfiler,
  requiresPresentationObservers,
  startPerformanceSpan,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling';

export const performanceBenchmarkConfigSchema = z.object({
  canonicalMinutes: z.number().positive().max(90).default(10),
  mode: performanceObserverModeSchema.default('normal'),
  batchTicks: z.number().int().min(1).max(5000).default(20),
  bucketMinutes: z.number().positive().max(90).default(5),
  profilingEnabled: z.boolean().default(true),
  sampleEveryTicks: z.number().int().positive().default(37),
});
const memorySchema = z.object({
  heapUsedBytes: z.number().nonnegative(),
  heapTotalBytes: z.number().nonnegative(),
  rssBytes: z.number().nonnegative(),
  externalBytes: z.number().nonnegative(),
});
export const performanceBucketSchema = z.object({
  startMinute: z.number().nonnegative(),
  endMinute: z.number().nonnegative(),
  canonicalSeconds: z.number().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  canonicalSpeed: z.number().nonnegative(),
  ticks: z.number().int().nonnegative(),
  ticksPerSecond: z.number().nonnegative(),
  batches: z.number().int().nonnegative(),
  batchP50Ms: z.number().nonnegative(),
  batchP95Ms: z.number().nonnegative(),
  batchP99Ms: z.number().nonnegative(),
  memory: memorySchema,
  collections: z.record(z.string(), z.number().int().nonnegative()),
});
const hashesSchema = z.object({
  canonicalState: z.string(),
  playerState: z.string(),
  statistics: z.string(),
  majorEventSequence: z.string(),
  majorEventCount: z.number().int().nonnegative(),
  randomnessEvidence: z.string(),
});
export const performanceBenchmarkResultSchema = z.object({
  seed: z.string(),
  config: performanceBenchmarkConfigSchema,
  inputPolicy: z.literal('explicit_dev_ai_selection_at_exact_tick_boundary'),
  fixedDt: z.literal(0.025),
  rendererCallsBackground: z.literal(0),
  canonicalSeconds: z.number().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  canonicalSpeed: z.number().nonnegative(),
  ticks: z.number().int().nonnegative(),
  ticksPerSecond: z.number().nonnegative(),
  batches: z.number().int().nonnegative(),
  batchP50Ms: z.number().nonnegative(),
  batchP95Ms: z.number().nonnegative(),
  batchP99Ms: z.number().nonnegative(),
  estimatedHidden45Seconds: z.number().nonnegative(),
  estimatedHidden90Seconds: z.number().nonnegative(),
  lateToEarlyCostRatio: z.number().nonnegative(),
  buckets: z.array(performanceBucketSchema),
  checkpoints: z.array(
    z.object({
      canonicalSeconds: z.number().nonnegative(),
      hashes: hashesSchema,
      humanDecisionInputs: z.number().int().nonnegative(),
    }),
  ),
  profile: performanceProfileSchema,
  score: z.object({ home: z.number().int(), away: z.number().int() }),
  status: z.string(),
  terminationReason: z.string().optional(),
  humanDecisionInputs: z.number().int().nonnegative(),
  defensiveTelemetry: defensiveTelemetrySchema.optional(),
  discipline: disciplineSchema.optional(),
  planning: z.object({
    evaluatedTicks: z.number().int().nonnegative(),
    plansRecomputed: z.number().int().nonnegative(),
    plansReused: z.number().int().nonnegative(),
    semanticInvalidations: z.number().int().nonnegative(),
    reuseRate: z.number().min(0).max(1),
  }),
  hashes: hashesSchema,
  context: z.object({
    samplesRetained: z.number().int().nonnegative(),
    samplesWritten: z.number().int().nonnegative(),
    sampleWorkMs: z.number().nonnegative(),
    sampleHz: z.number(),
    capacity: z.number().int(),
  }),
  export: z.object({
    packagingMs: z.number().nonnegative(),
    serializationMs: z.number().nonnegative(),
    jsonBytes: z.number().int().nonnegative(),
  }),
});
export type PerformanceBenchmarkResult = z.infer<typeof performanceBenchmarkResultSchema>;

/** Key order and incidental undefined properties cannot hide football equality. */
export const stableStringify = (value: unknown): string => {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input !== null && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, entry]) => entry !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      );
    return input;
  };
  return JSON.stringify(canonicalize(value));
};
export const canonicalHash = (value: unknown) =>
  createHash('sha256').update(stableStringify(value)).digest('hex');

const memorySnapshot = () => {
  const memory = process.memoryUsage();
  return {
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    rssBytes: memory.rss,
    externalBytes: memory.external,
  };
};
const collectionSnapshot = (
  state: TacticalMatchState,
  telemetry: MatchFlowTelemetry,
  history: PresentationContextHistory,
  recorder: MatchDebugRecorder | undefined,
) => {
  const sizes: Record<string, number> = {
    contextSamples: history.snapshot().samplesRetained,
    debugFrames: recorder?.historyFrames.length ?? 0,
    restartTargets: Object.keys(state.restart?.targets ?? {}).length,
    planningSchedules: state.planningSchedule ? 1 : 0,
    canonicalActionEvents: state.actionEvents?.length ?? 0,
    pendingCards: state.pendingCards?.length ?? 0,
    defensivePlayerCounters: Object.keys(state.defensiveTelemetry?.byPlayer ?? {}).length,
  };
  for (const [key, value] of Object.entries(state.statistics ?? {}))
    if (Array.isArray(value)) sizes[`statistics.${key}`] = value.length;
  for (const [key, value] of Object.entries(telemetry))
    if (Array.isArray(value)) sizes[`telemetry.${key}`] = value.length;
  sizes['telemetry.activeFlankEpisodes'] = telemetry.observerState.activeFlankEpisodes.length;
  return sizes;
};

/** Measures one canonical engine, including mandatory statistics and identical input in A-D.
 * No rendering, scheduling, wall-clock decisions or full historical per-tick hashes. */
export const runPerformanceBenchmark = (
  session: SingleMatchSession,
  input: z.input<typeof performanceBenchmarkConfigSchema>,
) => {
  const config = performanceBenchmarkConfigSchema.parse(input);
  let state = createTacticalMatch(session);
  let telemetry = createMatchFlowTelemetry('pr146-performance');
  const history = new PresentationContextHistory();
  const agency = new PlayerAgencyTracker();
  const recorder = config.mode === 'capture' ? new MatchDebugRecorder() : undefined;
  const profiler = new PerformanceProfiler({
    enabled: config.profilingEnabled,
    sampleEveryTicks: config.sampleEveryTicks,
  });
  const majorEvents = createHash('sha256');
  let majorEventCount = 0;
  let humanDecisionInputs = 0;
  let ticks = 0;
  let plansRecomputed = 0;
  let plansReused = 0;
  let semanticInvalidations = 0;
  const batches: number[] = [];
  const buckets: z.infer<typeof performanceBucketSchema>[] = [];
  const checkpoints: PerformanceBenchmarkResult['checkpoints'] = [];
  const targetSeconds = config.canonicalMinutes * 60;
  let bucketStartSeconds = 0;
  let bucketEndSeconds = Math.min(targetSeconds, config.bucketMinutes * 60);
  let bucketTicks = 0;
  let bucketBatches: number[] = [];
  const complete = () =>
    state.status === 'abandoned' ||
    (state.time + 1e-7 >= targetSeconds &&
      (targetSeconds !== 2700 || state.status === 'half_time') &&
      (targetSeconds !== 5400 || state.status === 'full_time'));
  const bucketComplete = () =>
    state.status === 'abandoned' ||
    (state.time + 1e-7 >= bucketEndSeconds &&
      (bucketEndSeconds !== 2700 || state.status === 'half_time') &&
      (bucketEndSeconds !== targetSeconds || complete()));
  const observe = (next: TacticalMatchState) => {
    if (isDevObservationMode(config.mode)) {
      const started = startPerformanceSpan('match_flow');
      telemetry = observeMatchFlow(telemetry, state, next);
      endPerformanceSpan('match_flow', started);
    }
    // Stream only actual changed evidence. The digest retains the whole event sequence,
    // while memory stays constant and no observer histories influence the football hash.
    const evidenceStarted = startPerformanceSpan('benchmark_evidence');
    const changed: Record<string, unknown> = {};
    if (next.decisionIndex !== state.decisionIndex)
      changed.action = { index: next.decisionIndex, action: next.latestAction };
    for (const key of [
      'lastBallContact',
      'lastPossessionChange',
      'lastShot',
      'lastPassDiagnostic',
    ] as const)
      if (next[key] !== state[key] && next[key]) changed[key] = next[key];
    if (next.score.home !== state.score.home || next.score.away !== state.score.away)
      changed.score = next.score;
    if (Object.keys(changed).length) {
      majorEvents.update(stableStringify({ time: next.time, ...changed }) + '\n');
      majorEventCount++;
    }
    endPerformanceSpan('benchmark_evidence', evidenceStarted);
    state = next;
  };
  withPerformanceProfiler(profiler, () => {
    while (!complete()) {
      const batchStarted = performance.now();
      let executed = 0;
      for (; executed < config.batchTicks && !complete(); executed++) {
        if (state.status === 'half_time') observe(startSecondHalf(state));
        if (state.status === 'full_time') throw new Error('Match ended before benchmark target');
        profiler.beginTick(ticks);
        const agencyStarted = startPerformanceSpan('agency_projection');
        const evaluation = projectPlayerAgency(state);
        endPerformanceSpan('agency_projection', agencyStarted);
        if (requiresPresentationObservers(config.mode)) {
          const started = startPerformanceSpan('match_moment');
          projectMatchMoment(state, evaluation.opportunity ?? null);
          endPerformanceSpan('match_moment', started);
        }
        if (isDevObservationMode(config.mode)) {
          const started = startPerformanceSpan('diagnostics');
          agency.observe(state, evaluation);
          endPerformanceSpan('diagnostics', started);
        }
        if (evaluation.opportunity) {
          observe(resolveDevPlayerDecision(state, evaluation.opportunity).state);
          humanDecisionInputs++;
        }
        if (complete()) {
          executed++;
          break;
        }
        const coreStarted = startPerformanceSpan('canonical_step');
        const next = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        endPerformanceSpan('canonical_step', coreStarted);
        if (
          next.planningSchedule?.lastTacticalPlanAt !== state.planningSchedule?.lastTacticalPlanAt
        )
          plansRecomputed++;
        else plansReused++;
        if (next.planningSchedule?.semanticKey !== state.planningSchedule?.semanticKey)
          semanticInvalidations++;
        observe(next);
        if (requiresPresentationObservers(config.mode)) {
          const started = startPerformanceSpan('context_history');
          history.observe(state);
          endPerformanceSpan('context_history', started);
        }
        if (recorder) {
          const started = startPerformanceSpan('debug_capture');
          recorder.record(state);
          endPerformanceSpan('debug_capture', started);
          if (recorder.lastObservationError) throw new Error(recorder.lastObservationError);
        }
        ticks++;
        bucketTicks++;
        if (ticks > Math.ceil(targetSeconds / FIXED_MATCH_DT) + 10_000)
          throw new Error('Canonical clock stopped advancing');
        if (bucketComplete()) {
          executed++;
          break;
        }
      }
      const batchMs = performance.now() - batchStarted;
      batches.push(batchMs);
      bucketBatches.push(batchMs);
      if (bucketComplete()) {
        const elapsedMs = bucketBatches.reduce((sum, ms) => sum + ms, 0);
        const seconds = state.time - bucketStartSeconds;
        buckets.push({
          startMinute: bucketStartSeconds / 60,
          endMinute: state.time / 60,
          canonicalSeconds: seconds,
          elapsedMs,
          canonicalSpeed: elapsedMs ? (seconds * 1000) / elapsedMs : 0,
          ticks: bucketTicks,
          ticksPerSecond: elapsedMs ? (bucketTicks * 1000) / elapsedMs : 0,
          batches: bucketBatches.length,
          batchP50Ms: percentile(bucketBatches, 0.5),
          batchP95Ms: percentile(bucketBatches, 0.95),
          batchP99Ms: percentile(bucketBatches, 0.99),
          memory: memorySnapshot(),
          collections: collectionSnapshot(state, telemetry, history, recorder),
        });
        if (Math.abs(state.time - 2700) < 1e-7)
          checkpoints.push({
            canonicalSeconds: state.time,
            humanDecisionInputs,
            hashes: {
              canonicalState: canonicalHash(state),
              playerState: canonicalHash(state.players),
              statistics: canonicalHash(state.statistics),
              majorEventSequence: majorEvents.copy().digest('hex'),
              majorEventCount,
              randomnessEvidence: canonicalHash({
                seed: state.seed,
                decisionIndex: state.decisionIndex,
                ballEpisode: state.ballEpisode,
              }),
            },
          });
        bucketStartSeconds = state.time;
        bucketEndSeconds = Math.min(targetSeconds, bucketEndSeconds + config.bucketMinutes * 60);
        bucketTicks = 0;
        bucketBatches = [];
      }
    }
  });
  const elapsedMs = batches.reduce((sum, ms) => sum + ms, 0);
  const canonicalSpeed = elapsedMs ? (state.time * 1000) / elapsedMs : 0;
  const first = buckets[0]!;
  const last = buckets.at(-1)!;
  const packagingStarted = performance.now();
  if (recorder) recorder.freezePast(state.time);
  const evidence = recorder
    ? recorder.export(session, FIXED_MATCH_DT, { width: 0, height: 0 }, false, 0)
    : {
        telemetry: isDevObservationMode(config.mode) ? telemetry : undefined,
        agency: isDevObservationMode(config.mode) ? agency.snapshot(state.time) : undefined,
      };
  const packagingMs = performance.now() - packagingStarted;
  const serializationStarted = performance.now();
  const exportJson = JSON.stringify(evidence);
  const serializationMs = performance.now() - serializationStarted;
  const result = performanceBenchmarkResultSchema.parse({
    seed: session.setup.seed,
    config,
    inputPolicy: 'explicit_dev_ai_selection_at_exact_tick_boundary',
    fixedDt: FIXED_MATCH_DT,
    rendererCallsBackground: 0,
    canonicalSeconds: state.time,
    elapsedMs,
    canonicalSpeed,
    ticks,
    ticksPerSecond: elapsedMs ? (ticks * 1000) / elapsedMs : 0,
    batches: batches.length,
    batchP50Ms: percentile(batches, 0.5),
    batchP95Ms: percentile(batches, 0.95),
    batchP99Ms: percentile(batches, 0.99),
    estimatedHidden45Seconds: canonicalSpeed ? 2700 / canonicalSpeed : 0,
    estimatedHidden90Seconds: canonicalSpeed ? 5400 / canonicalSpeed : 0,
    lateToEarlyCostRatio: first.canonicalSpeed / last.canonicalSpeed,
    buckets,
    checkpoints,
    profile: profiler.snapshot(),
    score: state.score,
    status: state.status ?? 'first_half',
    terminationReason: state.termination?.reason,
    humanDecisionInputs,
    defensiveTelemetry: state.defensiveTelemetry,
    discipline: state.discipline,
    planning: {
      evaluatedTicks: ticks,
      plansRecomputed,
      plansReused,
      semanticInvalidations,
      reuseRate: ticks > 0 ? plansReused / ticks : 0,
    },
    hashes: {
      canonicalState: canonicalHash(state),
      playerState: canonicalHash(state.players),
      statistics: canonicalHash(state.statistics),
      majorEventSequence: majorEvents.digest('hex'),
      majorEventCount,
      // RNGs are derived per event rather than retained: seed/index/ball episode identify
      // their keys, and the full state/event digests compare their deterministic effects.
      randomnessEvidence: canonicalHash({
        seed: state.seed,
        decisionIndex: state.decisionIndex,
        ballEpisode: state.ballEpisode,
      }),
    },
    context: history.snapshot(),
    export: { packagingMs, serializationMs, jsonBytes: Buffer.byteLength(exportJson) },
  });
  return { result, exportJson };
};

export const assertCanonicalBenchmarkEquality = (results: PerformanceBenchmarkResult[]) => {
  const reference = results[0];
  if (!reference) throw new Error('No benchmark results to compare');
  for (const result of results.slice(1))
    if (
      stableStringify(result.hashes) !== stableStringify(reference.hashes) ||
      stableStringify(result.score) !== stableStringify(reference.score) ||
      result.canonicalSeconds !== reference.canonicalSeconds ||
      result.humanDecisionInputs !== reference.humanDecisionInputs
    )
      throw new Error(`Observation mode ${result.config.mode} changed canonical football`);
  return true;
};
