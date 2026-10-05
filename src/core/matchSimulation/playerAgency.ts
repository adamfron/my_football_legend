import { z } from 'zod';
import { projectPlayerAgency } from './playerDecision';
import type { TacticalMatchState } from './matchState';
import { projectPlayerActiveTime, playerActiveTimeSchema } from './playerActiveMinutes';

export const agencyOwnershipSchema = z.enum([
  'human_decision',
  'autonomous_routine',
  'single_option_autonomy',
  'ineligible',
]);
export const agencyTelemetrySchema = z.object({
  candidates: z.number().int().nonnegative(),
  meaningfulHumanDecisions: z.number().int().nonnegative(),
  routineDelegated: z.number().int().nonnegative(),
  singleOptionDelegated: z.number().int().nonnegative(),
  byKind: z.record(z.string(), z.number().int().nonnegative()),
  byReason: z.record(z.string(), z.number().int().nonnegative()),
});
export const agencySessionMetricsSchema = agencyTelemetrySchema.extend({
  canonicalSeconds: z.number().nonnegative(),
  activePlayerSeconds: z.number().nonnegative(),
  activeTimeSource: playerActiveTimeSchema.shape.source,
  rateBasis: z.literal('active_player_minutes'),
  decisionsPer45Minutes: z.number().nonnegative(),
  decisionsPer90Minutes: z.number().nonnegative(),
});
export const agencyDiagnosticSchema = z.object({
  at: z.number().nonnegative(),
  ownership: agencyOwnershipSchema,
  reason: z.string().optional(),
  opportunityKind: z.string(),
  semanticChoiceCount: z.number().int().nonnegative(),
  semanticFamilies: z.array(z.string()).optional(),
  interceptionOwnerId: z.string().optional(),
  controlledArrivalTime: z.number().nonnegative().optional(),
  teammateArrivalTime: z.number().nonnegative().optional(),
});
export type AgencyTelemetry = z.infer<typeof agencyTelemetrySchema>;
export type AgencyDiagnostic = z.infer<typeof agencyDiagnosticSchema>;
export type AgencySessionMetrics = z.infer<typeof agencySessionMetricsSchema>;

/** Counts semantic candidate entries, not 40 identical probes per second. Bounded memory. */
export class PlayerAgencyTracker {
  private lastKey = '';
  private activePlayerSeconds = 0;
  private activeTimeSource: z.infer<typeof playerActiveTimeSchema>['source'] = 'unavailable';
  private counts: AgencyTelemetry = {
    candidates: 0,
    meaningfulHumanDecisions: 0,
    routineDelegated: 0,
    singleOptionDelegated: 0,
    byKind: { on_ball: 0, incoming_ball: 0, defensive_response: 0, restart: 0, other: 0 },
    byReason: {},
  };
  observe(
    state: TacticalMatchState,
    evaluation: ReturnType<typeof projectPlayerAgency>,
  ): AgencyDiagnostic | undefined {
    const active = projectPlayerActiveTime(state);
    this.activePlayerSeconds = active.seconds;
    this.activeTimeSource = active.source;
    const { probe, opportunity } = evaluation;
    const reason = opportunity?.triggerReason ?? probe.ownershipReason ?? probe.blockedReason;
    const category = opportunity
      ? 'human_decision'
      : probe.blockedReason === 'single_option_autonomy'
        ? 'single_option_autonomy'
        : probe.blockedReason === 'routine'
          ? 'autonomous_routine'
          : 'ineligible';
    const key = `${category}:${reason ?? ''}:${opportunity?.id ?? probe.signature ?? ''}:${probe.opportunityKind ?? ''}:${state.ball.ownerId ?? ''}:${state.ballOwnershipStartedAt ?? ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (category !== 'ineligible') {
      this.counts.candidates++;
      this.counts.byReason[reason ?? 'unspecified'] =
        (this.counts.byReason[reason ?? 'unspecified'] ?? 0) + 1;
    }
    if (category === 'human_decision') {
      this.counts.meaningfulHumanDecisions++;
      const kind = opportunity!.kind;
      this.counts.byKind[kind] = (this.counts.byKind[kind] ?? 0) + 1;
    } else if (category === 'single_option_autonomy') this.counts.singleOptionDelegated++;
    else if (category === 'autonomous_routine') this.counts.routineDelegated++;
    return {
      at: state.time,
      ownership: category,
      reason,
      opportunityKind: opportunity?.kind ?? probe.opportunityKind ?? 'other',
      semanticChoiceCount: probe.semanticChoiceCount ?? 0,
      ...(probe.semanticFamilies ? { semanticFamilies: probe.semanticFamilies } : {}),
      ...(probe.interception?.ownerId ? { interceptionOwnerId: probe.interception.ownerId } : {}),
      ...(probe.interception
        ? { controlledArrivalTime: probe.interception.playerArrivalTime }
        : {}),
      ...(probe.interception?.teammateArrivalTime !== undefined
        ? { teammateArrivalTime: probe.interception.teammateArrivalTime }
        : {}),
    };
  }
  snapshot(canonicalSeconds: number, state?: TacticalMatchState): AgencySessionMetrics {
    const active = state
      ? projectPlayerActiveTime(state)
      : {
          seconds: this.activePlayerSeconds,
          source: this.activeTimeSource,
        };
    const counts = {
      ...this.counts,
      byKind: { ...this.counts.byKind },
      byReason: { ...this.counts.byReason },
    };
    return {
      ...counts,
      canonicalSeconds,
      activePlayerSeconds: active.seconds,
      activeTimeSource: active.source,
      rateBasis: 'active_player_minutes',
      decisionsPer45Minutes:
        active.seconds > 0 ? (counts.meaningfulHumanDecisions * 2700) / active.seconds : 0,
      decisionsPer90Minutes:
        active.seconds > 0 ? (counts.meaningfulHumanDecisions * 5400) / active.seconds : 0,
    };
  }
}
