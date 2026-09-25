import { z } from 'zod';
import { FIXED_MATCH_DT } from './matchSimulation';
import {
  matchMomentCandidateSchema,
  shouldSurfaceMatchMoment,
  type MatchMomentCandidate,
  type MatchPresentationPolicy,
} from './matchMoment';

export const matchPresentationPhaseSchema = z.enum([
  'background_simulation',
  'lead_in',
  'presenting_live_moment',
  'awaiting_player_decision',
  'post_moment',
  'full_match',
]);
export type MatchPresentationPhase = z.infer<typeof matchPresentationPhaseSchema>;

export const presentationClockSchema = z.object({
  displayTime: z.number().nonnegative(),
  targetTime: z.number().nonnegative(),
});
export type PresentationClock = z.infer<typeof presentationClockSchema>;

export const createPresentationClock = (canonicalTime: number): PresentationClock => ({
  displayTime: canonicalTime,
  targetTime: canonicalTime,
});

/** Cosmetic, RNG-free bounded catch-up. It cannot mutate or drive canonical football state. */
export const advancePresentationClock = (
  clock: PresentationClock,
  canonicalTime: number,
  wallSeconds: number,
  paused = false,
): PresentationClock => {
  const targetTime = Math.max(clock.targetTime, canonicalTime);
  if (paused || wallSeconds <= 0) return { ...clock, targetTime };
  const gap = Math.max(0, targetTime - clock.displayTime);
  // Close even a multi-minute batch gap responsively while retaining visible motion.
  const rate = Math.max(4, gap / 0.45);
  return {
    targetTime,
    displayTime: Math.min(targetTime, clock.displayTime + rate * wallSeconds),
  };
};

export const presentationDecisionDiagnosticSchema = z.object({
  at: z.number().nonnegative(),
  opportunityKind: z.string(),
  controlledPlayerId: z.string(),
  situation: z.string(),
  importance: z.number().min(0).max(1),
  semanticChoiceCount: z.number().int().nonnegative(),
  policyId: z.string(),
  threshold: z.number().min(0).max(1),
  result: z.enum(['surfaced', 'proxy_resolved', 'delegated_autonomy', 'rejected']),
  reason: z.string(),
});
export type PresentationDecisionDiagnostic = z.infer<typeof presentationDecisionDiagnosticSchema>;

export const presentationRuntimeTelemetrySchema = z.object({
  projectedCandidates: z.number().int().nonnegative(),
  qualifyingCandidates: z.number().int().nonnegative(),
  episodesStarted: z.number().int().nonnegative(),
  episodesPresented: z.number().int().nonnegative(),
  humanDecisionPromptsShown: z.number().int().nonnegative(),
  alwaysSurfaceOverrides: z.number().int().nonnegative(),
  playerOpportunitiesProxyResolved: z.number().int().nonnegative(),
  restartProxies: z.number().int().nonnegative(),
  episodeLeadIns: z.number().int().nonnegative(),
  episodeAborts: z.number().int().nonnegative(),
  hiddenCanonicalSeconds: z.number().nonnegative(),
  visibleCanonicalSeconds: z.number().nonnegative(),
  rendererCallsBackground: z.number().int().nonnegative(),
  rendererCallsVisible: z.number().int().nonnegative(),
  backgroundBatches: z.number().int().nonnegative(),
  backgroundTicks: z.number().int().nonnegative(),
  restartWatchdogFallbacks: z.number().int().nonnegative(),
});
export type PresentationRuntimeTelemetry = z.infer<typeof presentationRuntimeTelemetrySchema>;
export const createPresentationRuntimeTelemetry = (): PresentationRuntimeTelemetry => ({
  projectedCandidates: 0,
  qualifyingCandidates: 0,
  episodesStarted: 0,
  episodesPresented: 0,
  humanDecisionPromptsShown: 0,
  alwaysSurfaceOverrides: 0,
  playerOpportunitiesProxyResolved: 0,
  restartProxies: 0,
  episodeLeadIns: 0,
  episodeAborts: 0,
  hiddenCanonicalSeconds: 0,
  visibleCanonicalSeconds: 0,
  rendererCallsBackground: 0,
  rendererCallsVisible: 0,
  backgroundBatches: 0,
  backgroundTicks: 0,
  restartWatchdogFallbacks: 0,
});

export const matchMomentEpisodeSchema = z.object({
  id: z.string(),
  startedAt: z.number().nonnegative(),
  lastMeaningfulAt: z.number().nonnegative(),
  peakImportance: z.number().min(0).max(1),
  candidates: z.array(matchMomentCandidateSchema),
  controlledPlayerInvolved: z.boolean(),
  requiresHumanDecision: z.boolean(),
  outcome: matchMomentCandidateSchema.shape.kind.optional(),
});
export type MatchMomentEpisode = z.infer<typeof matchMomentEpisodeSchema>;

const OUTCOMES = new Set<MatchMomentCandidate['kind']>([
  'goal',
  'shot',
  'goalkeeper_intervention',
  'kickoff_after_goal',
]);

/** Observational clustering: adjacent candidates remain one football episode through rebounds. */
export const appendMomentCandidate = (
  episode: MatchMomentEpisode | undefined,
  candidate: MatchMomentCandidate,
  quietWindowSeconds = 3,
): MatchMomentEpisode => {
  const meaningful = candidate.kind !== 'routine';
  if (!episode || candidate.detectedAt - episode.lastMeaningfulAt > quietWindowSeconds) {
    return matchMomentEpisodeSchema.parse({
      id: `episode:${candidate.detectedAt.toFixed(3)}:${candidate.kind}`,
      startedAt: Math.max(0, candidate.detectedAt - candidate.suggestedLeadInSeconds),
      lastMeaningfulAt: candidate.detectedAt,
      peakImportance: candidate.importance,
      candidates: [candidate],
      controlledPlayerInvolved: candidate.controlledPlayerInvolved,
      requiresHumanDecision: candidate.requiresHumanDecision,
      ...(OUTCOMES.has(candidate.kind) ? { outcome: candidate.kind } : {}),
    });
  }
  return matchMomentEpisodeSchema.parse({
    ...episode,
    lastMeaningfulAt: meaningful ? candidate.detectedAt : episode.lastMeaningfulAt,
    peakImportance: Math.max(episode.peakImportance, candidate.importance),
    candidates: meaningful ? [...episode.candidates, candidate] : episode.candidates,
    controlledPlayerInvolved:
      episode.controlledPlayerInvolved || candidate.controlledPlayerInvolved,
    requiresHumanDecision: episode.requiresHumanDecision || candidate.requiresHumanDecision,
    ...(OUTCOMES.has(candidate.kind) ? { outcome: candidate.kind } : {}),
  });
};

export const isMomentEpisodeResolved = (
  episode: MatchMomentEpisode,
  candidate: MatchMomentCandidate,
  now: number,
) => candidate.kind === 'routine' && now - episode.lastMeaningfulAt >= 3;

export type BackgroundBatchStopReason =
  | 'batch_limit'
  | 'surface_moment'
  | 'human_decision'
  | 'match_stopped';

export interface BackgroundBatchResult<State> {
  state: State;
  ticksProcessed: number;
  stopReason: BackgroundBatchStopReason;
  candidate?: MatchMomentCandidate;
}

/**
 * Runs the same fixed-step canonical transition in a bounded task. This is presentation batching,
 * never a macro/highlight simulator: no tick is skipped and this function owns no RNG.
 */
export const advanceBackgroundBatch = <State>(options: {
  state: State;
  maxTicks: number;
  policy: MatchPresentationPolicy;
  advance(state: State, dt: number): State;
  project(state: State): MatchMomentCandidate;
  isRunning(state: State): boolean;
  resolveSuppressedDecision?(state: State, candidate: MatchMomentCandidate): State;
}): BackgroundBatchResult<State> => {
  let state = options.state;
  for (let tick = 0; tick < options.maxTicks; tick += 1) {
    if (!options.isRunning(state))
      return { state, ticksProcessed: tick, stopReason: 'match_stopped' };
    const candidate = options.project(state);
    if (candidate.requiresHumanDecision) {
      if (shouldSurfaceMatchMoment(candidate, options.policy))
        return { state, ticksProcessed: tick, stopReason: 'human_decision', candidate };
      if (options.resolveSuppressedDecision)
        state = options.resolveSuppressedDecision(state, candidate);
    } else if (
      shouldSurfaceMatchMoment(candidate, options.policy) &&
      candidate.kind !== 'routine'
    ) {
      return { state, ticksProcessed: tick, stopReason: 'surface_moment', candidate };
    }
    state = options.advance(state, FIXED_MATCH_DT);
  }
  return { state, ticksProcessed: options.maxTicks, stopReason: 'batch_limit' };
};
