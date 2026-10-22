import { z } from 'zod';
import type { RoleExperimentExport } from './roleExperiment';
import type { MatchFlowTelemetry } from './matchFlowTelemetry';
import { decisionPolicyIdSchema } from './decisionPolicyConfig';
import { rolePlanSchema } from './tacticalRoles';
import { matchCentreStatisticsSchema } from './matchCentreStatistics';

export const matchComparisonSchema = z.object({
  schema: z.literal('mfl-five-policy-comparison-v1'),
  policy: decisionPolicyIdSchema,
  sourceRevision: z.string(),
  seed: z.string(),
  fixtureId: z.string(),
  observedSeconds: z.number().nonnegative(),
  formations: z.unknown(),
  roles: rolePlanSchema,
  official: matchCentreStatisticsSchema,
  metrics: z.record(z.string(), z.number().finite().nonnegative()),
  coachDecisions: z.unknown(),
  substitutions: z.unknown(),
  errors: z.array(z.string()).max(64),
  definitions: z.record(z.string(), z.string()),
});

/** Small totals are backed by the same canonical observers as the detailed export.
 * No bounded trace is reinterpreted as a complete-match event count. */
export const compactMatchComparison = (
  report: RoleExperimentExport,
  flow: MatchFlowTelemetry,
  errors: string[] = [],
) => {
  const official = report.summary.official;
  const attempts = official.home.passesAttempted + official.away.passesAttempted;
  const transitions = z
    .array(z.object({ phase: z.string(), progress: z.number() }))
    .parse(report.summary.transitions);
  return matchComparisonSchema.parse({
    schema: 'mfl-five-policy-comparison-v1',
    policy: report.metadata.policy,
    sourceRevision: report.metadata.sourceRevision,
    seed: report.metadata.seed,
    fixtureId: report.metadata.fixtureId,
    observedSeconds: report.metadata.time,
    formations: report.metadata.formations,
    roles: report.metadata.roles,
    official,
    metrics: {
      physicalShots: official.home.shots + official.away.shots,
      passAttempts: attempts,
      firstTimeAttempts: flow.firstTimePassAttempts,
      firstTimeShare: attempts ? flow.firstTimePassAttempts / attempts : 0,
      progressivePassReleases: flow.progressivePasses,
      progressiveReceptions: flow.threatFlow.progressiveReceptions,
      finalThirdEntries: flow.finalThirdEntries,
      boxEntries: flow.boxEntries,
      wideCarryIntentions: report.summary.comparisonCounters.wideCarryIntentions ?? 0,
      longPassReleases: report.summary.comparisonCounters.longPassReleases ?? 0,
      crossReleases: flow.crossAttempts,
      contestedAerialContacts: report.summary.comparisonCounters.contestedAerialContacts ?? 0,
      corners: official.home.corners + official.away.corners,
      counterattacksWithTenMetres: transitions.filter(
        (t) => t.phase === 'rapid_transition' && t.progress >= 10,
      ).length,
      stagnationEpisodes: report.diagnostics.pathologicalHolds,
      maximumHoldSeconds: report.diagnostics.maxHoldSeconds,
      roleChanges: report.summary.tacticalAdjustments.length,
    },
    coachDecisions: report.summary.coachDecisions,
    substitutions: report.summary.substitutions,
    errors: [...report.diagnostics.observerErrors, ...errors].slice(-64),
    definitions: {
      unit: 'One observed fragment. Five watched halves are qualitative exploration, not independent validation.',
      progression:
        'Progressive release >5m goalward; completed progression uses canonical reception observer.',
      wideCarryIntentions:
        'Unique carry intentions beginning >15m from pitch centre; not provider-defined successful dribbles.',
      aerial:
        'Actual winner contact with both teams among physical contestants/challengers; not merely an aerial opportunity.',
      longPass:
        'Physical pass diagnostic release targeting at least 30m; crosses are counted separately.',
      stagnation:
        'At least 30s with <1m displacement and at least three consecutive selected holds.',
    },
  });
};
