import { z } from 'zod';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import { performanceObserverModeSchema } from '../../core/matchSimulation/performanceProfiling';

export const BACKGROUND_PUBLICATION_INTERVAL_MS = 250;
export const observerCoverageIntervalSchema = z.object({
  mode: performanceObserverModeSchema,
  startedAt: z.number().nonnegative(),
  endedAt: z.number().nonnegative().optional(),
});
export type ObserverCoverageInterval = z.infer<typeof observerCoverageIntervalSchema>;

/** Only the display is coalesced. The authoritative ref is updated after every work slice. */
export const shouldPublishBackgroundState = (
  previous: TacticalMatchState,
  current: TacticalMatchState,
  elapsedMs: number,
  boundaryDetected = false,
) =>
  boundaryDetected ||
  previous.status !== current.status ||
  previous.score.home !== current.score.home ||
  previous.score.away !== current.score.away ||
  elapsedMs >= BACKGROUND_PUBLICATION_INTERVAL_MS;

export const backgroundUiPerformanceSchema = z.object({
  backgroundPublications: z.number().int().nonnegative(),
  backgroundSchedulingWaitMs: z.number().nonnegative(),
  decisionCommitSamples: z.number().int().nonnegative(),
  maximumDecisionCommitMs: z.number().nonnegative(),
});
export const createBackgroundUiPerformance = (): z.infer<typeof backgroundUiPerformanceSchema> => ({
  backgroundPublications: 0,
  backgroundSchedulingWaitMs: 0,
  decisionCommitSamples: 0,
  maximumDecisionCommitMs: 0,
});
