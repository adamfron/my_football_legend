import { z } from 'zod';
import {
  matchFlowTelemetrySchema,
  positioningSampleSchema,
  type MatchFlowTelemetry,
  type PositioningSample,
} from '../../core/matchSimulation/matchFlowTelemetry';
import {
  agencySessionMetricsSchema,
  type AgencySessionMetrics,
} from '../../core/matchSimulation/playerAgency';
import {
  presentationRuntimeTelemetrySchema,
  type PresentationRuntimeTelemetry,
} from '../../core/matchSimulation/matchPresentation';
import { isDevObservationMode } from '../../core/matchSimulation/performanceProfiling';
import {
  canonicalMatchSanitySchema,
  projectCanonicalMatchSanity,
  type CanonicalParticipationCoverage,
} from '../../core/matchSimulation/canonicalMatchSanity';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import {
  observerCoverageIntervalSchema,
  type ObserverCoverageInterval,
} from './backgroundPublication';

export const sessionCollectionScopeSchema = z.object({
  canonicalStatistics: z.literal('whole_canonical_match'),
  presentationRuntime: z.literal('whole_presentation_session'),
  detailedObservers: z.enum(['whole_session', 'coverage_intervals_only', 'unavailable']),
  detailedCanonicalSeconds: z.number().nonnegative(),
  unavailableReason: z.literal('dev_observer_not_enabled').nullable(),
  observerCoverage: z.array(observerCoverageIntervalSchema),
});

export const sessionTelemetryReportSchema = z.object({
  collectionScope: sessionCollectionScopeSchema,
  canonicalSanity: canonicalMatchSanitySchema.nullable(),
  matchFlowTelemetry: matchFlowTelemetrySchema.nullable(),
  decisionTelemetry: matchFlowTelemetrySchema.shape.controlled.nullable(),
  playerAgency: agencySessionMetricsSchema.nullable(),
  sampledPositioning: z.array(positioningSampleSchema).nullable(),
  presentationRuntime: presentationRuntimeTelemetrySchema,
});

/** Empty observers are not evidence of zero decisions. Preserve runtime counters separately;
 * detailed observers describe only DEV/capture coverage, including when that mode was stopped. */
export const createSessionTelemetryReport = (options: {
  canonicalSeconds: number;
  coverage: ObserverCoverageInterval[];
  flow: MatchFlowTelemetry;
  agency: AgencySessionMetrics;
  positioning: PositioningSample[];
  presentation: PresentationRuntimeTelemetry;
  state?: TacticalMatchState;
  participation?: CanonicalParticipationCoverage;
  measuredPosition?: string | undefined;
}) => {
  const coverage = options.coverage.map((interval) => ({
    ...interval,
    endedAt: interval.endedAt ?? options.canonicalSeconds,
  }));
  const detailedIntervals = coverage.filter((interval) => isDevObservationMode(interval.mode));
  const detailedCanonicalSeconds = detailedIntervals.reduce(
    (sum, interval) => sum + Math.max(0, interval.endedAt - interval.startedAt),
    0,
  );
  const collected = detailedIntervals.length > 0;
  return sessionTelemetryReportSchema.parse({
    collectionScope: {
      canonicalStatistics: 'whole_canonical_match',
      presentationRuntime: 'whole_presentation_session',
      detailedObservers: !collected
        ? 'unavailable'
        : detailedCanonicalSeconds + 1e-7 >= options.canonicalSeconds
          ? 'whole_session'
          : 'coverage_intervals_only',
      detailedCanonicalSeconds,
      unavailableReason: collected ? null : 'dev_observer_not_enabled',
      observerCoverage: coverage,
    },
    matchFlowTelemetry: collected ? options.flow : null,
    canonicalSanity: options.state
      ? projectCanonicalMatchSanity(
          options.state,
          options.presentation,
          options.participation,
          undefined,
          options.measuredPosition,
        )
      : null,
    decisionTelemetry: collected ? options.flow.controlled : null,
    playerAgency: collected ? options.agency : null,
    sampledPositioning: collected ? options.positioning : null,
    presentationRuntime: options.presentation,
  });
};
