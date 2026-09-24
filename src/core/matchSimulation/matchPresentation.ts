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
